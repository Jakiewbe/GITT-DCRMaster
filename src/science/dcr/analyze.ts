import type {
  CanonicalRowV1,
  DcrEventInputV1,
  DcrMetricResultV1,
  DcrRequestedMetricV1,
  QcFinding,
  QcStatus,
} from '../contracts';
import { qcFinding, resultStateFromFindings } from '../qc';
import { resolutionEvidenceFindings } from '../measurementResolution';
import { median, robustCoefficientOfVariation, robustSigma, theilSenRegression } from '../math/statistics';
import { DCR_QC_POLICY_V1, NANOSECONDS_PER_SECOND } from './policy';
import { analyzeTwoCurrentDcrEventV1 } from './analyzeDifferential';
import {
  buildPulseTimeline,
  compareCanonicalRows,
  nanosecondsToSeconds,
  rowAbsoluteTimeNs,
  type PulseTimeline,
} from './time';

type AggregatedPoint = {
  timeNs: bigint;
  offsetNs: bigint;
  voltageV: number;
  currentA: number;
  rowIds: string[];
  voltageSpreadV: number;
  currentSpreadA: number;
};

type BaselineDiagnostics = {
  baselineRow: CanonicalRowV1;
  baselineWindowMedianV: number;
  baselineWindowMedianCurrentA: number;
  baselineLastPointMinusWindowMedianV: number;
  baselineFittedTransitionVoltageV: number;
  baselineLastPointMinusFittedV: number;
  baselineVoltageDriftMvPerMin: number;
  baselineVoltageNoiseV: number;
  baselineCurrentNoiseA: number;
  uniquePointCount: number;
};

type PreparedEvent = {
  timeline: PulseTimeline;
  baseline: BaselineDiagnostics;
  pulsePoints: AggregatedPoint[];
  pulseCurrentCv: number | null;
  medianPulseCurrentA: number;
  observedPulseEndNs: bigint;
  expectedPulseDurationNs: bigint | null;
  eventFindings: QcFinding[];
};

const EMPTY_NUMERIC_FIELDS = {
  actualElapsedFromTransitionS: null,
  baselineVoltageV: null,
  baselineCurrentA: null,
  targetVoltageV: null,
  targetCurrentA: null,
  deltaVoltageV: null,
  deltaCurrentA: null,
  resistanceOhm: null,
  diagnosticCandidateResistanceOhm: null,
  baselineWindowMedianV: null,
  baselineLastPointMinusWindowMedianV: null,
  baselineFittedTransitionVoltageV: null,
  baselineLastPointMinusFittedV: null,
  baselineVoltageDriftMvPerMin: null,
  currentResolutionRatio: null,
  voltageSnr: null,
  pulseCurrentCv: null,
  targetCurrentDeviationFraction: null,
  relativeResistanceUncertainty: null,
} as const;

export function defaultDcrRequestedMetricsV1(): DcrRequestedMetricV1[] {
  return [
    { kind: 'first_sample' },
    { kind: 'exact_time', offsetTicks: 5n, offsetResolutionNs: NANOSECONDS_PER_SECOND, label: 'DCR_5s' },
    { kind: 'exact_time', offsetTicks: 10n, offsetResolutionNs: NANOSECONDS_PER_SECOND, label: 'DCR_10s' },
    { kind: 'exact_time', offsetTicks: 30n, offsetResolutionNs: NANOSECONDS_PER_SECOND, label: 'DCR_30s' },
  ];
}

function metricName(metric: DcrRequestedMetricV1): string {
  return metric.kind === 'first_sample' ? 'DCR_first_sample' : metric.label;
}

function requestedOffsetNs(metric: DcrRequestedMetricV1): bigint | null {
  if (metric.kind !== 'exact_time') return null;
  if (metric.offsetTicks < 0n || metric.offsetResolutionNs <= 0n) return null;
  return metric.offsetTicks * metric.offsetResolutionNs;
}

function emptyResult(
  input: DcrEventInputV1,
  metric: DcrRequestedMetricV1,
  findings: QcFinding[],
  calculationState: 'not_computable' | 'not_requested' = 'not_computable',
): DcrMetricResultV1 {
  const offsetNs = requestedOffsetNs(metric);
  return {
    ...resultStateFromFindings(findings, calculationState),
    eventId: input.eventId,
    protocolRole: input.protocolRole,
    requestedMetric: metricName(metric),
    requestedOffsetS: offsetNs === null ? null : nanosecondsToSeconds(offsetNs),
    transitionLatencyKnown: input.config.transitionLatencyKnown,
    transitionTimeBasis: input.config.transitionTimeBasis,
    baselineRowId: null,
    targetRowIds: [],
    ...EMPTY_NUMERIC_FIELDS,
    qcFindings: findings,
  };
}

function aggregateByTime(rows: Array<{ row: CanonicalRowV1; timeNs: bigint; offsetNs: bigint }>): AggregatedPoint[] {
  const groups = new Map<string, Array<{ row: CanonicalRowV1; timeNs: bigint; offsetNs: bigint }>>();
  for (const item of rows) {
    const key = item.timeNs.toString();
    const group = groups.get(key);
    if (group) group.push(item);
    else groups.set(key, [item]);
  }

  return [...groups.values()]
    .map((group) => {
      const voltages = group.map(({ row }) => row.voltageV);
      const currents = group.map(({ row }) => row.currentA);
      return {
        timeNs: group[0].timeNs,
        offsetNs: group[0].offsetNs,
        voltageV: voltages.reduce((sum, value) => sum + value, 0) / voltages.length,
        currentA: currents.reduce((sum, value) => sum + value, 0) / currents.length,
        rowIds: group.map(({ row }) => row.rowId),
        voltageSpreadV: Math.max(...voltages) - Math.min(...voltages),
        currentSpreadA: Math.max(...currents) - Math.min(...currents),
      };
    })
    .sort((left, right) => (left.timeNs < right.timeNs ? -1 : left.timeNs > right.timeNs ? 1 : 0));
}

function validateStepSemantics(input: DcrEventInputV1): QcFinding[] {
  const findings: QcFinding[] = [];
  if (input.config.qcPolicyId !== DCR_QC_POLICY_V1.id) {
    findings.push(
      qcFinding(
        'unsupported_qc_policy',
        'rejected',
        null,
        `DCR V1 requires qcPolicyId=${DCR_QC_POLICY_V1.id}.`,
      ),
    );
  }
  if (input.preRestRows.length === 0 || input.preRestRows.some((row) => row.canonicalStepType !== 'rest')) {
    findings.push(qcFinding('rest_step_type_invalid', 'rejected', null, 'DCR V1 requires a preceding Rest step.'));
  }

  const pulseTypes = new Set(input.pulseRows.map((row) => row.canonicalStepType));
  const pulseType = pulseTypes.size === 1 ? [...pulseTypes][0] : null;
  if (pulseType !== 'charge' && pulseType !== 'discharge') {
    findings.push(
      qcFinding('pulse_step_type_invalid', 'rejected', null, 'DCR V1 requires one charge or discharge pulse step.'),
    );
  }

  if (new Set(input.pulseRows.map((row) => row.analysisStepId)).size > 1) {
    findings.push(qcFinding('multiple_pulse_steps', 'rejected', null, 'A DCR event may contain only one pulse step.'));
  }
  return findings;
}

function prepareBaseline(
  rows: CanonicalRowV1[],
  transitionTimeNs: bigint,
  voltageResolutionV: number | null,
): BaselineDiagnostics | null {
  const sorted = [...rows].sort(compareCanonicalRows);
  const baselineRow = sorted.at(-1);
  if (!baselineRow) return null;
  const baselineAbsoluteNs = rowAbsoluteTimeNs(baselineRow);
  if (baselineAbsoluteNs === null || baselineAbsoluteNs > transitionTimeNs) return null;

  const windowStartNs = transitionTimeNs - BigInt(DCR_QC_POLICY_V1.baselineWindowS) * NANOSECONDS_PER_SECOND;
  const windowItems = sorted.flatMap((row) => {
    const timeNs = rowAbsoluteTimeNs(row);
    return timeNs !== null && timeNs >= windowStartNs && timeNs <= transitionTimeNs
      ? [{ row, timeNs, offsetNs: timeNs - transitionTimeNs }]
      : [];
  });
  const points = aggregateByTime(windowItems);
  if (points.length < DCR_QC_POLICY_V1.minimumBaselinePoints) return null;

  const x = points.map((point) => nanosecondsToSeconds(point.offsetNs));
  const voltages = points.map((point) => point.voltageV);
  const currents = points.map((point) => point.currentA);
  const regression = theilSenRegression(x, voltages);
  if (!regression) return null;
  const fittedAtTransitionV = regression.intercept;
  const empiricalNoiseV = robustSigma(voltages.map((value, index) => value - (regression.intercept + regression.slope * x[index])));
  const resolutionNoiseV = voltageResolutionV === null ? 0 : voltageResolutionV / Math.sqrt(12);

  return {
    baselineRow,
    baselineWindowMedianV: median(voltages),
    baselineWindowMedianCurrentA: median(currents),
    baselineLastPointMinusWindowMedianV: baselineRow.voltageV - median(voltages),
    baselineFittedTransitionVoltageV: fittedAtTransitionV,
    baselineLastPointMinusFittedV: baselineRow.voltageV - fittedAtTransitionV,
    baselineVoltageDriftMvPerMin: regression.slope * 60_000,
    baselineVoltageNoiseV: Math.max(empiricalNoiseV, resolutionNoiseV),
    baselineCurrentNoiseA: robustSigma(currents),
    uniquePointCount: points.length,
  };
}

function expectedDurationNs(value: number | null): bigint | null {
  if (value === null || !Number.isFinite(value) || value <= 0) return null;
  const nanoseconds = value * Number(NANOSECONDS_PER_SECOND);
  return Number.isSafeInteger(nanoseconds) ? BigInt(nanoseconds) : null;
}

function classifyUpperBound(
  code: string,
  value: number,
  validMaximum: number,
  reviewMaximum: number,
): QcFinding {
  const status: QcStatus = value <= validMaximum ? 'valid' : value <= reviewMaximum ? 'review' : 'rejected';
  return qcFinding(code, status, value);
}

function prepareEvent(input: DcrEventInputV1): PreparedEvent | QcFinding[] {
  const semanticFindings = validateStepSemantics(input);
  if (semanticFindings.length > 0) return semanticFindings;

  const timelineResult = buildPulseTimeline(input.pulseRows, input.config.transitionTimeBasis);
  if ('code' in timelineResult) {
    return [qcFinding(timelineResult.code, 'rejected', null, timelineResult.message)];
  }

  const baseline = prepareBaseline(
    input.preRestRows,
    timelineResult.transitionTimeNs,
    input.config.voltageResolutionV,
  );
  if (!baseline) {
    return [
      qcFinding(
        'baseline_window_insufficient',
        'rejected',
        null,
        'At least two unique Rest ticks in the final 60 s are required.',
      ),
    ];
  }

  const pulsePoints = aggregateByTime(
    timelineResult.rows.map(({ row, absoluteTimeNs, offsetFromTransitionNs }) => ({
      row,
      timeNs: absoluteTimeNs,
      offsetNs: offsetFromTransitionNs,
    })),
  );
  const pulseCurrentCv = robustCoefficientOfVariation(pulsePoints.map((point) => point.currentA));
  const eventFindings: QcFinding[] = [];
  eventFindings.push(
    ...resolutionEvidenceFindings(
      'current',
      input.config.currentResolutionA,
      input.config.currentResolutionEvidence,
    ),
    ...resolutionEvidenceFindings(
      'voltage',
      input.config.voltageResolutionV,
      input.config.voltageResolutionEvidence,
    ),
  );
  eventFindings.push(
    qcFinding(
      'baseline_point_count',
      baseline.uniquePointCount >= DCR_QC_POLICY_V1.validBaselinePoints ? 'valid' : 'review',
      baseline.uniquePointCount,
    ),
  );
  if (pulseCurrentCv === null) {
    eventFindings.push(qcFinding('pulse_current_cv_unavailable', 'review'));
  } else {
    eventFindings.push(
      classifyUpperBound(
        'pulse_current_cv',
        pulseCurrentCv,
        DCR_QC_POLICY_V1.pulseCurrentCv.validMaximum,
        DCR_QC_POLICY_V1.pulseCurrentCv.reviewMaximum,
      ),
    );
  }
  eventFindings.push(
    classifyUpperBound(
      'baseline_voltage_drift',
      Math.abs(baseline.baselineVoltageDriftMvPerMin),
      DCR_QC_POLICY_V1.baselineVoltageDriftMvPerMin.validMaximum,
      DCR_QC_POLICY_V1.baselineVoltageDriftMvPerMin.reviewMaximum,
    ),
  );

  const voltageResolution = input.config.voltageResolutionV ?? 0;
  const validLastPointDeviation = Math.max(0.001, 5 * voltageResolution);
  const reviewLastPointDeviation = Math.max(0.005, 10 * voltageResolution);
  eventFindings.push(
    classifyUpperBound(
      'baseline_last_point_deviation',
      Math.abs(baseline.baselineLastPointMinusWindowMedianV),
      validLastPointDeviation,
      reviewLastPointDeviation,
    ),
  );

  if (!input.config.transitionLatencyKnown) {
    eventFindings.push(
      qcFinding(
        'transition_latency_unknown',
        'review',
        null,
        'The first recorded pulse sample is not proven to coincide with the physical current transition.',
      ),
    );
  }

  return {
    timeline: timelineResult,
    baseline,
    pulsePoints,
    pulseCurrentCv,
    medianPulseCurrentA: median(pulsePoints.map((point) => point.currentA)),
    observedPulseEndNs: pulsePoints.at(-1)?.offsetNs ?? 0n,
    expectedPulseDurationNs: expectedDurationNs(input.config.expectedPulseDurationS),
    eventFindings,
  };
}

function selectTarget(
  input: DcrEventInputV1,
  metric: DcrRequestedMetricV1,
  prepared: PreparedEvent,
): { point: AggregatedPoint | null; requestedNs: bigint | null; findings: QcFinding[] } {
  const requestedNs = requestedOffsetNs(metric);
  if (metric.kind === 'exact_time' && requestedNs === null) {
    return {
      point: null,
      requestedNs,
      findings: [qcFinding('invalid_requested_time', 'rejected')],
    };
  }

  const point = metric.kind === 'first_sample'
    ? prepared.pulsePoints[0] ?? null
    : prepared.pulsePoints.find((candidate) => candidate.offsetNs === requestedNs) ?? null;

  if (!point) {
    const findings = [qcFinding('target_sample_absent', 'review')];
    if (requestedNs !== null && prepared.expectedPulseDurationNs !== null && prepared.observedPulseEndNs < requestedNs) {
      findings.push(qcFinding('pulse_truncated_before_target', 'review'));
    }
    return { point: null, requestedNs, findings };
  }

  const voltageTolerance = input.config.voltageResolutionV ?? 0;
  const currentTolerance = input.config.currentResolutionA ?? 0;
  if (point.rowIds.length > 1 && (point.voltageSpreadV > voltageTolerance || point.currentSpreadA > currentTolerance)) {
    return {
      point: null,
      requestedNs,
      findings: [
        qcFinding(
          'duplicate_target_tick_conflict',
          'rejected',
          null,
          'Duplicate target-tick records disagree beyond the resolved measurement tolerance.',
        ),
      ],
    };
  }
  return { point, requestedNs, findings: [] };
}

function calculateRelativeUncertainty(
  deltaVoltageV: number,
  deltaCurrentA: number,
  prepared: PreparedEvent,
  currentResolutionA: number,
  voltageResolutionV: number | null,
): number {
  const voltageQuantizationU = (voltageResolutionV ?? 0) / Math.sqrt(12);
  const currentQuantizationU = currentResolutionA / Math.sqrt(12);
  const pulseCurrentNoiseA = robustSigma(prepared.pulsePoints.map((point) => point.currentA));
  const uDeltaVoltageV = Math.sqrt(2) * Math.max(prepared.baseline.baselineVoltageNoiseV, voltageQuantizationU);
  const uDeltaCurrentA = Math.hypot(
    prepared.baseline.baselineCurrentNoiseA,
    pulseCurrentNoiseA,
    Math.sqrt(2) * currentQuantizationU,
  );
  return Math.hypot(uDeltaVoltageV / Math.abs(deltaVoltageV), uDeltaCurrentA / Math.abs(deltaCurrentA));
}

function analyzeMetric(
  input: DcrEventInputV1,
  metric: DcrRequestedMetricV1,
  prepared: PreparedEvent,
): DcrMetricResultV1 {
  const selected = selectTarget(input, metric, prepared);
  if (!selected.point) return emptyResult(input, metric, selected.findings);

  const point = selected.point;
  const baseline = prepared.baseline;
  const findings = [...prepared.eventFindings, ...selected.findings];
  const deltaVoltageV = point.voltageV - baseline.baselineRow.voltageV;
  const deltaCurrentA = point.currentA - baseline.baselineRow.currentA;
  const candidateResistanceOhm = deltaCurrentA === 0 ? null : deltaVoltageV / deltaCurrentA;
  let calculationState: 'computed' | 'not_computable' = 'computed';

  if (deltaCurrentA === 0) {
    findings.push(qcFinding('zero_delta_current', 'rejected'));
    calculationState = 'not_computable';
  }

  const currentResolutionA = input.config.currentResolutionA;
  let currentResolutionRatio: number | null = null;
  if (currentResolutionA === null || !Number.isFinite(currentResolutionA) || currentResolutionA <= 0) {
    findings.push(qcFinding('current_resolution_missing', 'rejected'));
  } else if (deltaCurrentA !== 0) {
    currentResolutionRatio = Math.abs(deltaCurrentA) / currentResolutionA;
    if (currentResolutionRatio >= DCR_QC_POLICY_V1.currentResolutionRatio.validMinimum) {
      findings.push(qcFinding('delta_current_resolution_ratio', 'valid', currentResolutionRatio));
    } else if (currentResolutionRatio >= DCR_QC_POLICY_V1.currentResolutionRatio.computableMinimum) {
      findings.push(qcFinding('delta_current_resolution_ratio', 'review', currentResolutionRatio));
    } else {
      findings.push(qcFinding('delta_current_below_resolution_requirement', 'rejected', currentResolutionRatio));
    }
  }

  if (candidateResistanceOhm !== null && candidateResistanceOhm <= 0) {
    findings.push(
      qcFinding(
        'polarity_inconsistent',
        'rejected',
        candidateResistanceOhm,
        'Signed voltage and current changes do not produce a positive apparent resistance.',
      ),
    );
  }

  let voltageSnr: number | null = null;
  if (prepared.baseline.baselineVoltageNoiseV > 0) {
    voltageSnr = Math.abs(deltaVoltageV) / prepared.baseline.baselineVoltageNoiseV;
    const status: QcStatus = voltageSnr >= DCR_QC_POLICY_V1.voltageSnr.validMinimum
      ? 'valid'
      : voltageSnr >= DCR_QC_POLICY_V1.voltageSnr.reviewMinimum
        ? 'review'
        : 'rejected';
    findings.push(qcFinding('voltage_snr', status, voltageSnr));
  } else {
    findings.push(qcFinding('voltage_snr_unavailable', 'review'));
  }

  if (currentResolutionA !== null && currentResolutionA > 0 && deltaCurrentA !== 0) {
    const restMedianLimitValid = Math.max(5 * currentResolutionA, 0.001 * Math.abs(deltaCurrentA));
    const restMedianLimitReview = Math.max(20 * currentResolutionA, 0.01 * Math.abs(deltaCurrentA));
    findings.push(
      classifyUpperBound(
        'rest_median_current',
        Math.abs(baseline.baselineWindowMedianCurrentA),
        restMedianLimitValid,
        restMedianLimitReview,
      ),
    );
  }

  const targetCurrentDeviationFraction = deltaCurrentA === 0
    ? null
    : Math.abs(point.currentA - prepared.medianPulseCurrentA) / Math.abs(deltaCurrentA);
  if (targetCurrentDeviationFraction !== null) {
    findings.push(
      classifyUpperBound(
        'target_current_deviation',
        targetCurrentDeviationFraction,
        DCR_QC_POLICY_V1.targetCurrentDeviationFraction.validMaximum,
        DCR_QC_POLICY_V1.targetCurrentDeviationFraction.reviewMaximum,
      ),
    );
  }

  let relativeResistanceUncertainty: number | null = null;
  if (
    currentResolutionA !== null &&
    currentResolutionA > 0 &&
    deltaVoltageV !== 0 &&
    deltaCurrentA !== 0
  ) {
    relativeResistanceUncertainty = calculateRelativeUncertainty(
      deltaVoltageV,
      deltaCurrentA,
      prepared,
      currentResolutionA,
      input.config.voltageResolutionV,
    );
    findings.push(
      classifyUpperBound(
        'relative_resistance_uncertainty',
        relativeResistanceUncertainty,
        DCR_QC_POLICY_V1.relativeResistanceUncertainty.validMaximum,
        DCR_QC_POLICY_V1.relativeResistanceUncertainty.reviewMaximum,
      ),
    );
  }

  const eventTruncated = prepared.expectedPulseDurationNs !== null &&
    prepared.observedPulseEndNs < prepared.expectedPulseDurationNs;
  if (eventTruncated) findings.push(qcFinding('pulse_truncated_after_target', 'review'));

  if (
    metric.kind === 'exact_time' &&
    selected.requestedNs === 30n * NANOSECONDS_PER_SECOND &&
    prepared.expectedPulseDurationNs === null
  ) {
    findings.push(qcFinding('pulse_completion_unverified', 'review'));
  }

  const state = resultStateFromFindings(findings, calculationState);
  const officialResistance = state.calculationState === 'computed'
    ? candidateResistanceOhm
    : null;

  return {
    ...state,
    eventId: input.eventId,
    protocolRole: input.protocolRole,
    requestedMetric: metricName(metric),
    requestedOffsetS: selected.requestedNs === null ? null : nanosecondsToSeconds(selected.requestedNs),
    actualElapsedFromTransitionS: nanosecondsToSeconds(point.offsetNs),
    transitionLatencyKnown: input.config.transitionLatencyKnown,
    transitionTimeBasis: input.config.transitionTimeBasis,
    baselineRowId: baseline.baselineRow.rowId,
    targetRowIds: point.rowIds,
    baselineVoltageV: baseline.baselineRow.voltageV,
    baselineCurrentA: baseline.baselineRow.currentA,
    targetVoltageV: point.voltageV,
    targetCurrentA: point.currentA,
    deltaVoltageV,
    deltaCurrentA,
    resistanceOhm: officialResistance,
    diagnosticCandidateResistanceOhm: candidateResistanceOhm,
    baselineWindowMedianV: baseline.baselineWindowMedianV,
    baselineLastPointMinusWindowMedianV: baseline.baselineLastPointMinusWindowMedianV,
    baselineFittedTransitionVoltageV: baseline.baselineFittedTransitionVoltageV,
    baselineLastPointMinusFittedV: baseline.baselineLastPointMinusFittedV,
    baselineVoltageDriftMvPerMin: baseline.baselineVoltageDriftMvPerMin,
    currentResolutionRatio,
    voltageSnr,
    pulseCurrentCv: prepared.pulseCurrentCv,
    targetCurrentDeviationFraction,
    relativeResistanceUncertainty,
    qcFindings: findings,
  };
}

export function analyzeDcrEventV1(input: DcrEventInputV1): DcrMetricResultV1[] {
  if (input.config.calculationMethod === 'two_current_terminal_v1') {
    return analyzeTwoCurrentDcrEventV1(input);
  }
  if (input.protocolRole !== 'dcr_pulse') return [];

  const metrics = input.config.requestedMetrics;
  if (metrics.length === 0) return [];

  const prepared = prepareEvent(input);
  if (Array.isArray(prepared)) {
    return metrics.map((metric) => emptyResult(input, metric, prepared));
  }
  return metrics.map((metric) => analyzeMetric(input, metric, prepared));
}
