import type { CanonicalRowV1 } from '../contracts';

export type AggregatedTick = {
  analysisStepId: string;
  elapsedTimeNs: bigint;
  stepElapsedTimeNs: bigint | null;
  nativeElapsedTimeTicks: bigint;
  nativeStepElapsedTimeTicks: bigint | null;
  timeResolutionNs: bigint;
  recordSequence: bigint;
  voltageV: number;
  currentA: number;
  voltageSpanV: number;
  currentSpanA: number;
  sourceRowCount: number;
  contributingRowIds: string[];
};

export type TimedPulsePoint = AggregatedTick & {
  timeS: number;
};

export function tickNanoseconds(ticks: bigint, resolutionNs: bigint): bigint {
  return ticks * resolutionNs;
}

export function nanosecondsToSeconds(value: bigint): number {
  return Number(value) / 1_000_000_000;
}

function arithmeticMean(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

/**
 * Collapses duplicate physical ticks only inside the same analysis step. The
 * resulting tick receives one regression weight regardless of its source-row
 * multiplicity, while every contributing row remains traceable.
 */
export function aggregateUniqueTicks(rows: CanonicalRowV1[]): AggregatedTick[] {
  const ordered = [...rows].sort((left, right) => {
    const leftNs = tickNanoseconds(left.elapsedTimeTicks, left.timeResolutionNs);
    const rightNs = tickNanoseconds(right.elapsedTimeTicks, right.timeResolutionNs);
    if (leftNs !== rightNs) return leftNs < rightNs ? -1 : 1;
    if (left.recordSequence !== right.recordSequence) {
      return left.recordSequence < right.recordSequence ? -1 : 1;
    }
    return left.rowId.localeCompare(right.rowId);
  });

  const groups = new Map<string, CanonicalRowV1[]>();
  for (const row of ordered) {
    const elapsedNs = tickNanoseconds(row.elapsedTimeTicks, row.timeResolutionNs);
    const key = `${row.analysisStepId}\u0000${elapsedNs.toString()}`;
    const group = groups.get(key);
    if (group) group.push(row);
    else groups.set(key, [row]);
  }

  return [...groups.values()].map((group) => {
    const first = group[0];
    const voltages = group.map((row) => row.voltageV);
    const currents = group.map((row) => row.currentA);
    const stepElapsedValues = group.map((row) =>
      row.stepElapsedTimeTicks === null
        ? null
        : tickNanoseconds(row.stepElapsedTimeTicks, row.timeResolutionNs),
    );
    const sharedStepElapsed = stepElapsedValues.every(
      (value) => value !== null && value === stepElapsedValues[0],
    )
      ? stepElapsedValues[0]
      : null;

    return {
      analysisStepId: first.analysisStepId,
      elapsedTimeNs: tickNanoseconds(first.elapsedTimeTicks, first.timeResolutionNs),
      stepElapsedTimeNs: sharedStepElapsed,
      nativeElapsedTimeTicks: first.elapsedTimeTicks,
      nativeStepElapsedTimeTicks:
        group.every((row) => row.stepElapsedTimeTicks === first.stepElapsedTimeTicks)
          ? first.stepElapsedTimeTicks
          : null,
      timeResolutionNs: group.reduce(
        (maximum, row) => (row.timeResolutionNs > maximum ? row.timeResolutionNs : maximum),
        0n,
      ),
      recordSequence: group.reduce(
        (minimum, row) => (row.recordSequence < minimum ? row.recordSequence : minimum),
        first.recordSequence,
      ),
      voltageV: arithmeticMean(voltages),
      currentA: arithmeticMean(currents),
      voltageSpanV: Math.max(...voltages) - Math.min(...voltages),
      currentSpanA: Math.max(...currents) - Math.min(...currents),
      sourceRowCount: group.length,
      contributingRowIds: group.map((row) => row.rowId),
    };
  });
}

export function buildPulseTimeline(points: AggregatedTick[]): TimedPulsePoint[] {
  if (points.length === 0) return [];
  const ordered = [...points].sort((left, right) => {
    if (left.elapsedTimeNs !== right.elapsedTimeNs) return left.elapsedTimeNs < right.elapsedTimeNs ? -1 : 1;
    return left.recordSequence < right.recordSequence ? -1 : left.recordSequence > right.recordSequence ? 1 : 0;
  });
  const useStepTime = ordered.every((point) => point.stepElapsedTimeNs !== null);
  const originNs = ordered[0].elapsedTimeNs;

  return ordered.map((point) => ({
    ...point,
    timeS: useStepTime
      ? nanosecondsToSeconds(point.stepElapsedTimeNs as bigint)
      : nanosecondsToSeconds(point.elapsedTimeNs - originNs),
  }));
}

export function maximumResolutionSeconds(points: AggregatedTick[]): number {
  if (points.length === 0) return 0;
  const resolution = points.reduce(
    (maximum, point) => (point.timeResolutionNs > maximum ? point.timeResolutionNs : maximum),
    0n,
  );
  return nanosecondsToSeconds(resolution);
}
