import type { CanonicalRowV1, GittResultV1 } from '../../science/contracts';
import type { NewareProgramStep } from './ndax';
import type { NewareCanonicalDataset } from './normalize';

/**
 * Evidence-backed program profile observed in the CFx/FGS Neware files:
 * Rest → CC discharge (1200 s maximum, Stop_Volt) → Rest (14400 s).
 *
 * This is deliberately an import/profile adapter, rather than a second WH
 * algorithm.  It decides how an executed event maps to the file's program;
 * the generic scientific core remains the only source of fitted quantities.
 */
export const NEWARE_CFX_GITT_1200S_PROGRAM_PROFILE_V1 = {
  profileId: 'NEWARE_BTS8_CFX_GITT_1200S_STOP_VOLT_V1',
  profileVersion: '1.1.0',
  nominalPulseDurationS: 1_200,
  nominalPostRestDurationS: 14_400,
  /** Includes controller/recording overshoot such as 1200.1 s. */
  timeLimitToleranceS: 1,
  /** Wider than the observed ±1 mV, while still tied to explicit program evidence. */
  voltageCutoffToleranceV: 0.005,
} as const;

export type NewareGitt1200sTerminationV1 =
  | 'time_limit_reached'
  | 'stop_voltage_terminated'
  | 'unknown_early_termination'
  | 'program_evidence_unavailable';

export type NewareGitt1200sPostRestStateV1 =
  | 'completed_standard_rest'
  | 'file_end_truncated'
  | 'ended_before_standard_rest'
  | 'post_rest_absent';

export type NewareGitt1200sProgramEvidenceV1 = {
  programRecognized: boolean;
  pulseStepId: number | null;
  postRestStepId: number | null;
  plannedPulseDurationS: number | null;
  plannedPostRestDurationS: number | null;
  stopVoltageV: number | null;
  pulseRecordIntervalS: number | null;
  postRestRecordIntervalS: number | null;
  loopStartStepId: number | null;
  loopCycleCount: number | null;
};

export type NewareGitt1200sEventV1 = {
  sourcePulseId: string;
  sourceOrder: number;
  pulseAnalysisStepId: string;
  postRestAnalysisStepId: string | null;
  program: NewareGitt1200sProgramEvidenceV1;
  actualPulseDurationS: number | null;
  pulseEndVoltageV: number | null;
  actualPostRestDurationS: number | null;
  termination: NewareGitt1200sTerminationV1;
  postRestState: NewareGitt1200sPostRestStateV1;
  isMainComparativeSequenceEvent: boolean;
  evidenceCodes: string[];
};

export type NewareGitt1200sProfileResultV1 = {
  profile: typeof NEWARE_CFX_GITT_1200S_PROGRAM_PROFILE_V1;
  programRecognized: boolean;
  events: NewareGitt1200sEventV1[];
  summary: {
    submittedPulseCount: number;
    retainedPulseCount: number;
    excludedAfterFirstCutoffCount: number;
    firstCutoffSourcePulseId: string | null;
    timeLimitReachedCount: number;
    stopVoltageTerminatedCount: number;
    unknownEarlyTerminationCount: number;
    mainComparativeSequenceCount: number;
    fileEndTruncatedRestCount: number;
    noncompletedRestCount: number;
  };
};

type StepGroup = {
  analysisStepId: string;
  rows: CanonicalRowV1[];
};

function finite(value: number | null | undefined): value is number {
  return value !== null && value !== undefined && Number.isFinite(value);
}

function secondsAtStepEnd(rows: readonly CanonicalRowV1[]): number | null {
  const resolutionNs = rows[0]?.timeResolutionNs;
  if (!resolutionNs || resolutionNs <= 0n) return null;
  let maximumTick: bigint | null = null;
  for (const row of rows) {
    if (row.stepElapsedTimeTicks === null) continue;
    if (maximumTick === null || row.stepElapsedTimeTicks > maximumTick) {
      maximumTick = row.stepElapsedTimeTicks;
    }
  }
  return maximumTick === null ? null : Number(maximumTick * resolutionNs) / 1_000_000_000;
}

function lastVoltage(rows: readonly CanonicalRowV1[]): number | null {
  if (rows.length === 0) return null;
  const last = rows.reduce((current, row) => {
    if (row.stepElapsedTimeTicks === null) return current;
    if (current.stepElapsedTimeTicks === null || row.stepElapsedTimeTicks >= current.stepElapsedTimeTicks) {
      return row;
    }
    return current;
  }, rows[0]);
  return Number.isFinite(last.voltageV) ? last.voltageV : null;
}

function groupContiguousSteps(rows: readonly CanonicalRowV1[]): StepGroup[] {
  const groups: StepGroup[] = [];
  let current: StepGroup | null = null;
  for (const row of rows) {
    if (current === null || current.analysisStepId !== row.analysisStepId) {
      current = { analysisStepId: row.analysisStepId, rows: [] };
      groups.push(current);
    }
    current.rows.push(row);
  }
  return groups;
}

function numericVendorStepId(group: StepGroup | undefined): number | null {
  const raw = group?.rows[0]?.vendorStepId;
  if (raw === null || raw === undefined || raw.trim() === '') return null;
  const parsed = Number(raw);
  return Number.isInteger(parsed) ? parsed : null;
}

function findProgramStep(
  group: StepGroup | undefined,
  programSteps: readonly NewareProgramStep[],
): NewareProgramStep | null {
  const stepId = numericVendorStepId(group);
  return stepId === null ? null : programSteps.find((step) => step.stepId === stepId) ?? null;
}

function pulseStepIdFromResult(sourceFileHash: string, result: GittResultV1): string | null {
  const prefix = `${sourceFileHash}:gitt:`;
  return result.pulseId.startsWith(prefix) ? result.pulseId.slice(prefix.length) : null;
}

function durationToleranceS(recordIntervalMs: number | null | undefined): number {
  const recordTolerance = finite(recordIntervalMs) && recordIntervalMs > 0
    ? recordIntervalMs / 1000
    : 0;
  return Math.max(NEWARE_CFX_GITT_1200S_PROGRAM_PROFILE_V1.timeLimitToleranceS, recordTolerance);
}

function programEvidence(
  pulseProgramStep: NewareProgramStep | null,
  restProgramStep: NewareProgramStep | null,
  allProgramSteps: readonly NewareProgramStep[],
): NewareGitt1200sProgramEvidenceV1 {
  const plannedPulseDurationS = finite(pulseProgramStep?.durationMs)
    ? pulseProgramStep.durationMs / 1000
    : null;
  const plannedPostRestDurationS = finite(restProgramStep?.durationMs)
    ? restProgramStep.durationMs / 1000
    : null;
  const loopStep = allProgramSteps.find((step) => step.loop?.startStepId === pulseProgramStep?.stepId) ?? null;
  const pulseMatchesProfile =
    finite(plannedPulseDurationS) &&
    Math.abs(plannedPulseDurationS - NEWARE_CFX_GITT_1200S_PROGRAM_PROFILE_V1.nominalPulseDurationS) <= 1e-6 &&
    finite(pulseProgramStep?.stopVoltageV);
  const restMatchesProfile =
    finite(plannedPostRestDurationS) &&
    Math.abs(plannedPostRestDurationS - NEWARE_CFX_GITT_1200S_PROGRAM_PROFILE_V1.nominalPostRestDurationS) <= 1e-6;
  return {
    programRecognized: pulseMatchesProfile && restMatchesProfile,
    pulseStepId: pulseProgramStep?.stepId ?? null,
    postRestStepId: restProgramStep?.stepId ?? null,
    plannedPulseDurationS,
    plannedPostRestDurationS,
    stopVoltageV: pulseProgramStep?.stopVoltageV ?? null,
    pulseRecordIntervalS: finite(pulseProgramStep?.recordIntervalMs)
      ? pulseProgramStep.recordIntervalMs / 1000
      : null,
    postRestRecordIntervalS: finite(restProgramStep?.recordIntervalMs)
      ? restProgramStep.recordIntervalMs / 1000
      : null,
    loopStartStepId: loopStep?.loop?.startStepId ?? null,
    loopCycleCount: loopStep?.loop?.cycleCount ?? null,
  };
}

function classifyTermination(
  actualDurationS: number | null,
  endVoltageV: number | null,
  evidence: NewareGitt1200sProgramEvidenceV1,
): NewareGitt1200sTerminationV1 {
  if (!evidence.programRecognized || !finite(evidence.plannedPulseDurationS)) {
    return 'program_evidence_unavailable';
  }
  if (
    finite(actualDurationS) &&
    actualDurationS >= evidence.plannedPulseDurationS - durationToleranceS(
      evidence.pulseRecordIntervalS === null ? null : evidence.pulseRecordIntervalS * 1000,
    )
  ) {
    return 'time_limit_reached';
  }
  if (
    finite(actualDurationS) &&
    actualDurationS < evidence.plannedPulseDurationS &&
    finite(endVoltageV) &&
    finite(evidence.stopVoltageV) &&
    Math.abs(endVoltageV - evidence.stopVoltageV) <=
      NEWARE_CFX_GITT_1200S_PROGRAM_PROFILE_V1.voltageCutoffToleranceV
  ) {
    return 'stop_voltage_terminated';
  }
  return 'unknown_early_termination';
}

function classifyPostRest(
  actualDurationS: number | null,
  evidence: NewareGitt1200sProgramEvidenceV1,
  isLastGroup: boolean,
): NewareGitt1200sPostRestStateV1 {
  if (!finite(actualDurationS)) return 'post_rest_absent';
  if (
    finite(evidence.plannedPostRestDurationS) &&
    actualDurationS >= evidence.plannedPostRestDurationS - durationToleranceS(
      evidence.postRestRecordIntervalS === null ? null : evidence.postRestRecordIntervalS * 1000,
    )
  ) {
    return 'completed_standard_rest';
  }
  return isLastGroup ? 'file_end_truncated' : 'ended_before_standard_rest';
}

/**
 * Classifies Neware executed GITT events against the program saved in the
 * same NDAX file.  It never treats an early event as a voltage-cutoff event
 * unless the file itself declares a matching Stop_Volt condition.
 */
export function buildNewareCfxGitt1200sProfile(
  dataset: NewareCanonicalDataset,
  pulseResults: readonly GittResultV1[],
): NewareGitt1200sProfileResultV1 {
  const groups = groupContiguousSteps(dataset.rows);
  const groupIndex = new Map(groups.map((group, index) => [group.analysisStepId, index]));
  const resultByPulseStepId = new Map<string, GittResultV1>();
  for (const result of pulseResults) {
    const stepId = pulseStepIdFromResult(dataset.sourceFileHash, result);
    if (stepId !== null) resultByPulseStepId.set(stepId, result);
  }

  const events: NewareGitt1200sEventV1[] = [];
  for (const [pulseAnalysisStepId, result] of resultByPulseStepId) {
    const index = groupIndex.get(pulseAnalysisStepId);
    if (index === undefined) continue;
    const pulseGroup = groups[index];
    const postRestGroup = groups[index + 1];
    const pulseProgramStep = findProgramStep(pulseGroup, dataset.metadata.programSteps);
    const restProgramStep = findProgramStep(postRestGroup, dataset.metadata.programSteps);
    const program = programEvidence(pulseProgramStep, restProgramStep, dataset.metadata.programSteps);
    const actualPulseDurationS = finite(result.pulseDurationS)
      ? result.pulseDurationS
      : secondsAtStepEnd(pulseGroup.rows);
    const pulseEndVoltageV = finite(result.pulseEndVoltageV)
      ? result.pulseEndVoltageV
      : lastVoltage(pulseGroup.rows);
    const actualPostRestDurationS = postRestGroup?.rows[0]?.canonicalStepType === 'rest'
      ? secondsAtStepEnd(postRestGroup.rows)
      : null;
    const termination = classifyTermination(actualPulseDurationS, pulseEndVoltageV, program);
    const postRestState = classifyPostRest(
      actualPostRestDurationS,
      program,
      index + 1 === groups.length - 1,
    );
    const evidenceCodes = [
      program.programRecognized ? 'neware_cfx_gitt_1200s_program_recognized' : 'program_evidence_unavailable',
      termination,
      postRestState,
    ];
    events.push({
      sourcePulseId: result.pulseId,
      sourceOrder: events.length + 1,
      pulseAnalysisStepId,
      postRestAnalysisStepId:
        postRestGroup?.rows[0]?.canonicalStepType === 'rest'
          ? postRestGroup.analysisStepId
          : null,
      program,
      actualPulseDurationS,
      pulseEndVoltageV,
      actualPostRestDurationS,
      termination,
      postRestState,
      isMainComparativeSequenceEvent:
        termination === 'time_limit_reached' && postRestState === 'completed_standard_rest',
      evidenceCodes,
    });
  }

  const firstCutoffIndex = events.findIndex(
    (event) => event.termination === 'stop_voltage_terminated',
  );
  const retainedEvents = firstCutoffIndex >= 0
    ? events.slice(0, firstCutoffIndex + 1)
    : events;
  const primaryEvidence = retainedEvents[0]?.program ?? null;
  return {
    profile: NEWARE_CFX_GITT_1200S_PROGRAM_PROFILE_V1,
    programRecognized: primaryEvidence?.programRecognized ?? false,
    events: retainedEvents,
    summary: {
      submittedPulseCount: events.length,
      retainedPulseCount: retainedEvents.length,
      excludedAfterFirstCutoffCount: events.length - retainedEvents.length,
      firstCutoffSourcePulseId:
        firstCutoffIndex >= 0 ? events[firstCutoffIndex].sourcePulseId : null,
      timeLimitReachedCount: retainedEvents.filter((event) => event.termination === 'time_limit_reached').length,
      stopVoltageTerminatedCount: retainedEvents.filter((event) => event.termination === 'stop_voltage_terminated').length,
      unknownEarlyTerminationCount: retainedEvents.filter((event) => event.termination === 'unknown_early_termination').length,
      mainComparativeSequenceCount: retainedEvents.filter((event) => event.isMainComparativeSequenceEvent).length,
      fileEndTruncatedRestCount: retainedEvents.filter((event) => event.postRestState === 'file_end_truncated').length,
      noncompletedRestCount: retainedEvents.filter(
        (event) =>
          event.postRestState === 'file_end_truncated' ||
          event.postRestState === 'ended_before_standard_rest' ||
          event.postRestState === 'post_rest_absent',
      ).length,
    },
  };
}
