import type { CanonicalRowV1, DcrAnalysisConfigV1 } from '../contracts';
import { NANOSECONDS_PER_SECOND } from './policy';

export type TimedRow = {
  row: CanonicalRowV1;
  absoluteTimeNs: bigint;
  offsetFromTransitionNs: bigint;
};

export type PulseTimeline = {
  transitionTimeNs: bigint;
  rows: TimedRow[];
};

export type TimelineError = {
  code: 'invalid_time_resolution' | 'missing_step_elapsed_time' | 'transition_origin_inconsistent';
  message: string;
};

export function rowAbsoluteTimeNs(row: CanonicalRowV1): bigint | null {
  if (row.timeResolutionNs <= 0n || row.elapsedTimeTicks < 0n) return null;
  return row.elapsedTimeTicks * row.timeResolutionNs;
}

function rowStepElapsedTimeNs(row: CanonicalRowV1): bigint | null {
  if (row.stepElapsedTimeTicks === null || row.stepElapsedTimeTicks < 0n || row.timeResolutionNs <= 0n) {
    return null;
  }
  return row.stepElapsedTimeTicks * row.timeResolutionNs;
}

export function compareCanonicalRows(left: CanonicalRowV1, right: CanonicalRowV1): number {
  const leftNs = rowAbsoluteTimeNs(left);
  const rightNs = rowAbsoluteTimeNs(right);
  if (leftNs === null || rightNs === null) return leftNs === rightNs ? 0 : leftNs === null ? 1 : -1;
  if (leftNs < rightNs) return -1;
  if (leftNs > rightNs) return 1;
  if (left.recordSequence < right.recordSequence) return -1;
  if (left.recordSequence > right.recordSequence) return 1;
  return 0;
}

export function buildPulseTimeline(
  rows: CanonicalRowV1[],
  transitionTimeBasis: DcrAnalysisConfigV1['transitionTimeBasis'],
): PulseTimeline | TimelineError {
  const sorted = [...rows].sort(compareCanonicalRows);
  if (sorted.length === 0) {
    return { code: 'invalid_time_resolution', message: 'Pulse contains no rows.' };
  }

  const firstAbsoluteNs = rowAbsoluteTimeNs(sorted[0]);
  if (firstAbsoluteNs === null) {
    return { code: 'invalid_time_resolution', message: 'Pulse row has an invalid time resolution or tick.' };
  }

  let transitionTimeNs = firstAbsoluteNs;
  if (transitionTimeBasis !== 'first_post_record') {
    const firstStepElapsedNs = rowStepElapsedTimeNs(sorted[0]);
    if (firstStepElapsedNs === null) {
      return {
        code: 'missing_step_elapsed_time',
        message: 'A command/step-boundary time basis requires integer step elapsed ticks.',
      };
    }
    transitionTimeNs = firstAbsoluteNs - firstStepElapsedNs;
  }

  const timedRows: TimedRow[] = [];
  for (const row of sorted) {
    const absoluteTimeNs = rowAbsoluteTimeNs(row);
    if (absoluteTimeNs === null) {
      return { code: 'invalid_time_resolution', message: `Row ${row.rowId} has invalid integer time fields.` };
    }

    if (transitionTimeBasis !== 'first_post_record') {
      const stepElapsedNs = rowStepElapsedTimeNs(row);
      if (stepElapsedNs === null) {
        return {
          code: 'missing_step_elapsed_time',
          message: `Row ${row.rowId} has no usable step elapsed tick.`,
        };
      }
      if (absoluteTimeNs - stepElapsedNs !== transitionTimeNs) {
        return {
          code: 'transition_origin_inconsistent',
          message: 'Pulse rows do not resolve to one exact integer transition tick.',
        };
      }
    }

    const offsetFromTransitionNs = absoluteTimeNs - transitionTimeNs;
    if (offsetFromTransitionNs < 0n) {
      return {
        code: 'transition_origin_inconsistent',
        message: 'A pulse row precedes the resolved transition tick.',
      };
    }
    timedRows.push({ row, absoluteTimeNs, offsetFromTransitionNs });
  }

  return { transitionTimeNs, rows: timedRows };
}

export function nanosecondsToSeconds(value: bigint): number {
  return Number(value) / Number(NANOSECONDS_PER_SECOND);
}

