import type {
  FitWindowOverrideV1,
  GittRegressionWindowResultV1,
  GittRegressionWindowSpecV1,
  GittFitDiagnosticsV1,
  QcFinding,
} from '../contracts';
import { qcFinding } from '../qc';
import {
  durbinWatson,
  linearRegression,
  quadraticRegression,
} from '../math/statistics';
import type { TimedPulsePoint } from './aggregation';
import { GITT_QC_POLICY_V1 as POLICY } from './policy';
import { calculateRegressionMetricCm2PerS } from './regressionMetric';

export const DEFAULT_GITT_REGRESSION_WINDOWS = [
  { kind: 'legacy_first_5', id: 'legacy_first_5', label: 'Legacy first 5 points' },
  {
    kind: 'fixed_time',
    id: 'cfx_10s',
    label: 'CFx 10 s (0 < t ≤ 64 s)',
    startS: POLICY.cfx10s.requestedStartS,
    endS: POLICY.cfx10s.requestedEndS,
    startBoundary: POLICY.cfx10s.startBoundary,
  },
] as const satisfies readonly GittRegressionWindowSpecV1[];

export const CFX_10S_GITT_REGRESSION_WINDOW = DEFAULT_GITT_REGRESSION_WINDOWS[1];

/** Research windows retained for data with enough early-time resolution. */
export const HIGH_RESOLUTION_GITT_REGRESSION_WINDOWS = [
  { kind: 'fixed_time', id: 'cfx_4_25s', label: 'CFx 4–25 s', startS: 4, endS: 25 },
  { kind: 'fixed_time', id: 'cfx_1_64s', label: 'CFx 1–64 s', startS: 1, endS: 64 },
] as const satisfies readonly GittRegressionWindowSpecV1[];

export type FitEvaluation = {
  points: TimedPulsePoint[];
  slope: number;
  intercept: number;
  rSquared: number;
  rmseV: number;
  slopeStandardError: number;
  residuals: number[];
  durbinWatson: number | null;
  curvatureMetric: number | null;
  normalizedMaxResidual: number | null;
  monotonicityFraction: number | null;
  hardGatePass: boolean;
};

export type FitSelection = {
  evaluation: FitEvaluation | null;
  allCandidateEvaluations: FitEvaluation[];
  diagnostics: GittFitDiagnosticsV1;
  findings: QcFinding[];
};

export type RegressionPointSelection = {
  points: TimedPulsePoint[];
  requestedStartS: number | null;
  requestedEndS: number | null;
  warnings: string[];
  windowCoverageIncomplete: boolean;
};

function orderedTimeline(timeline: TimedPulsePoint[]): TimedPulsePoint[] {
  return [...timeline].sort((left, right) =>
    left.timeS - right.timeS ||
    (left.recordSequence < right.recordSequence ? -1 : left.recordSequence > right.recordSequence ? 1 : 0),
  );
}

function finite(value: number | null): value is number {
  return value !== null && Number.isFinite(value);
}

/** Selects points from the already canonicalized pulse time axis. */
export function selectRegressionPoints(
  timeline: TimedPulsePoint[],
  window: GittRegressionWindowSpecV1,
): RegressionPointSelection {
  const ordered = orderedTimeline(timeline);
  if (window.kind === 'legacy_first_5') {
    return {
      points: ordered.slice(1).filter((point) => point.timeS > 0).slice(0, POLICY.minimumFitPointCount),
      requestedStartS: null,
      requestedEndS: null,
      warnings: [],
      windowCoverageIncomplete: false,
    };
  }

  if (
    !Number.isFinite(window.startS) ||
    !Number.isFinite(window.endS) ||
    window.startS < 0 ||
    window.endS <= window.startS
  ) {
    return {
      points: [],
      requestedStartS: window.startS,
      requestedEndS: window.endS,
      warnings: ['window_bounds_invalid'],
      windowCoverageIncomplete: true,
    };
  }

  const points = ordered.filter((point) => {
    const startIncluded = window.startBoundary === 'exclusive'
      ? point.timeS > window.startS
      : point.timeS >= window.startS;
    return startIncluded && point.timeS <= window.endS;
  });
  const firstTimeS = ordered[0]?.timeS ?? null;
  const lastTimeS = ordered.at(-1)?.timeS ?? null;
  const startCovered = window.startBoundary === 'exclusive'
    ? finite(lastTimeS) && lastTimeS > window.startS
    : finite(firstTimeS) && firstTimeS <= window.startS;
  const windowCoverageIncomplete =
    !finite(firstTimeS) ||
    !finite(lastTimeS) ||
    !startCovered ||
    lastTimeS < window.endS;
  return {
    points,
    requestedStartS: window.startS,
    requestedEndS: window.endS,
    warnings: windowCoverageIncomplete ? ['window_coverage_incomplete'] : [],
    windowCoverageIncomplete,
  };
}

function samplingCoverageFor(
  window: GittRegressionWindowSpecV1,
  uniqueTimePointCount: number,
): GittRegressionWindowResultV1['samplingCoverage'] {
  if (window.kind !== 'fixed_time' || window.id !== 'cfx_10s') return 'not_applicable';
  if (uniqueTimePointCount >= POLICY.cfx10s.fullPointMinimum) return 'full';
  if (uniqueTimePointCount >= POLICY.cfx10s.partialPointMinimum) return 'partial';
  return 'infeasible';
}

function linearityClassFor(
  rSquared: number | null,
): GittRegressionWindowResultV1['linearityClass'] {
  if (!finite(rSquared)) return 'unavailable';
  if (rSquared >= POLICY.cfx10s.rSquaredStrongMinimum) return 'strong_linearity';
  if (rSquared >= POLICY.cfx10s.rSquaredAcceptableMinimum) return 'acceptable_review';
  return 'early_response_nonlinear';
}

function emptyDiagnostics(
  mode: 'fixed_first_five' | 'manual',
  expectedUniquePoints: number,
  minimumSamplingFrequencyRequiredHz: number | null,
  override: FitWindowOverrideV1 | null,
): GittFitDiagnosticsV1 {
  return {
    requestedFitWindow: null,
    actualFitWindow: null,
    windowSelectionMode: mode,
    manualOverrideReason: override?.reason ?? null,
    expectedUniquePointsInFitWindow: expectedUniquePoints,
    minimumSamplingFrequencyRequiredHz,
    fitUniqueTickCount: 0,
    fitSourceRowCount: 0,
    fitContributingRowIds: [],
    slopeVPerSqrtS: null,
    slopeStandardUncertainty: null,
    interceptV: null,
    rSquared: null,
    rmseV: null,
    durbinWatson: null,
    curvatureMetric: null,
    normalizedMaxResidual: null,
    monotonicityFraction: null,
    windowSensitivityFraction: null,
  };
}

function evaluateMonotonicity(points: TimedPulsePoint[], slope: number, noiseFloorV: number): number | null {
  const expectedSign = Math.sign(slope);
  if (expectedSign === 0) return null;
  let evaluable = 0;
  let consistent = 0;
  for (let index = 1; index < points.length; index += 1) {
    const difference = points[index].voltageV - points[index - 1].voltageV;
    if (Math.abs(difference) < 2 * noiseFloorV) continue;
    evaluable += 1;
    if (Math.sign(difference) === expectedSign) consistent += 1;
  }
  return evaluable >= 3 ? consistent / evaluable : null;
}

export function evaluateFit(points: TimedPulsePoint[], noiseFloorV: number): FitEvaluation | null {
  if (points.length < POLICY.minimumFitPointCount) return null;
  const x = points.map((point) => Math.sqrt(point.timeS));
  const y = points.map((point) => point.voltageV);
  if (x.some((value) => !Number.isFinite(value))) return null;
  const regression = linearRegression(x, y);
  if (!regression || !Number.isFinite(regression.slope) || !Number.isFinite(regression.intercept)) return null;
  const xSpan = x[x.length - 1] - x[0];
  const quadratic = quadraticRegression(x, y);
  const curvatureMetric =
    quadratic && regression.slope !== 0
      ? Math.abs((2 * quadratic.quadratic * xSpan) / regression.slope)
      : null;
  const maximumResidual = Math.max(...regression.residuals.map((value) => Math.abs(value)));
  const residualScale = Math.max(Math.abs(regression.slope) * xSpan, 5 * noiseFloorV);
  const normalizedMaxResidual = residualScale > 0 ? maximumResidual / residualScale : maximumResidual === 0 ? 0 : null;
  const rawDw = durbinWatson(regression.residuals);
  const responseScale = Math.max(1, ...y.map((value) => Math.abs(value)));
  const numericalZeroResidualV = Math.max(1e-14 * responseScale, noiseFloorV * 1e-6);
  const dw = maximumResidual <= numericalZeroResidualV ? 2 : rawDw;
  const monotonicityFraction = evaluateMonotonicity(points, regression.slope, noiseFloorV);
  const slopeSignalRatio =
    regression.slopeStandardError === 0
      ? Number.POSITIVE_INFINITY
      : Math.abs(regression.slope / regression.slopeStandardError);
  const hardGatePass =
    regression.rSquared >= POLICY.rSquared.reviewMinimum &&
    slopeSignalRatio >= POLICY.slopeSignalRatio.reviewMinimum &&
    curvatureMetric !== null &&
    curvatureMetric <= POLICY.curvatureMetric.reviewMaximum &&
    normalizedMaxResidual !== null &&
    normalizedMaxResidual <= POLICY.normalizedMaxResidual.reviewMaximum &&
    monotonicityFraction !== null &&
    monotonicityFraction >= POLICY.monotonicityFraction.reviewMinimum &&
    (points.length < 8 || (dw !== null && dw >= POLICY.durbinWatson.reviewMinimum && dw <= POLICY.durbinWatson.reviewMaximum));

  return {
    points,
    slope: regression.slope,
    intercept: regression.intercept,
    rSquared: regression.rSquared,
    rmseV: regression.rmse,
    slopeStandardError: regression.slopeStandardError,
    residuals: regression.residuals,
    durbinWatson: dw,
    curvatureMetric,
    normalizedMaxResidual,
    monotonicityFraction,
    hardGatePass,
  };
}

export function evaluateRegressionWindow(
  timeline: TimedPulsePoint[],
  window: GittRegressionWindowSpecV1,
  noiseFloorV: number,
  pulseDurationS: number | null,
  lengthCm: number | null,
  deltaEsV: number | null,
): GittRegressionWindowResultV1 {
  const selection = selectRegressionPoints(timeline, window);
  const warnings = [...selection.warnings];
  const actualStartS = selection.points[0]?.timeS ?? null;
  const actualEndS = selection.points.at(-1)?.timeS ?? null;
  const pointCount = selection.points.reduce((sum, point) => sum + point.sourceRowCount, 0);
  const uniqueTimePointCount = selection.points.length;
  const samplingCoverage = samplingCoverageFor(window, uniqueTimePointCount);
  const fitDurationS = finite(actualStartS) && finite(actualEndS)
    ? actualEndS - actualStartS
    : null;
  const fitEndFractionOfPulse = finite(actualEndS) && finite(pulseDurationS) && pulseDurationS > 0
    ? actualEndS / pulseDurationS
    : null;

  if (uniqueTimePointCount < POLICY.minimumFitPointCount) {
    warnings.push('fit_point_count_below_minimum');
    return {
      windowId: window.id,
      windowLabel: window.label,
      kind: window.kind,
      requestedStartS: selection.requestedStartS,
      requestedEndS: selection.requestedEndS,
      actualStartS,
      actualEndS,
      pointCount,
      uniqueTimePointCount,
      fitDurationS,
      fitEndFractionOfPulse,
      slopeVPerSqrtS: null,
      interceptV: null,
      rSquared: null,
      rmseV: null,
      slopeStdError: null,
      curvatureMetric: null,
      maxNormalizedResidual: null,
      monotonicityRatio: null,
      durbinWatson: null,
      metricValueCm2PerS: null,
      windowCoverageIncomplete: selection.windowCoverageIncomplete,
      samplingCoverage,
      linearityClass: 'unavailable',
      status: 'infeasible',
      warnings,
    };
  }

  const fit = evaluateFit(selection.points, noiseFloorV);
  if (!fit) {
    warnings.push('fit_unavailable');
    return {
      windowId: window.id,
      windowLabel: window.label,
      kind: window.kind,
      requestedStartS: selection.requestedStartS,
      requestedEndS: selection.requestedEndS,
      actualStartS,
      actualEndS,
      pointCount,
      uniqueTimePointCount,
      fitDurationS,
      fitEndFractionOfPulse,
      slopeVPerSqrtS: null,
      interceptV: null,
      rSquared: null,
      rmseV: null,
      slopeStdError: null,
      curvatureMetric: null,
      maxNormalizedResidual: null,
      monotonicityRatio: null,
      durbinWatson: null,
      metricValueCm2PerS: null,
      windowCoverageIncomplete: selection.windowCoverageIncomplete,
      samplingCoverage,
      linearityClass: 'unavailable',
      status: 'review',
      warnings,
    };
  }

  const metricValueCm2PerS = calculateRegressionMetricCm2PerS({
    lengthCm,
    deltaEsV,
    pulseDurationS,
    slopeVPerSqrtS: fit.slope,
  });
  if (metricValueCm2PerS === null) warnings.push('regression_metric_unavailable');
  if (!fit.hardGatePass) warnings.push('fit_hard_gates_failed');
  const status =
    metricValueCm2PerS === null
      ? 'review'
      : uniqueTimePointCount < (window.kind === 'fixed_time' && window.id === 'cfx_10s'
        ? POLICY.cfx10s.fullPointMinimum
        : POLICY.fitPointCount.validMinimum) ||
          selection.windowCoverageIncomplete ||
          !fit.hardGatePass
        ? 'review'
        : 'valid';
  return {
    windowId: window.id,
    windowLabel: window.label,
    kind: window.kind,
    requestedStartS: selection.requestedStartS,
    requestedEndS: selection.requestedEndS,
    actualStartS,
    actualEndS,
    pointCount,
    uniqueTimePointCount,
    fitDurationS,
    fitEndFractionOfPulse,
    slopeVPerSqrtS: fit.slope,
    interceptV: fit.intercept,
    rSquared: fit.rSquared,
    rmseV: fit.rmseV,
    slopeStdError: fit.slopeStandardError,
    curvatureMetric: fit.curvatureMetric,
    maxNormalizedResidual: fit.normalizedMaxResidual,
    monotonicityRatio: fit.monotonicityFraction,
    durbinWatson: fit.durbinWatson,
    metricValueCm2PerS,
    windowCoverageIncomplete: selection.windowCoverageIncomplete,
    samplingCoverage,
    linearityClass: linearityClassFor(fit.rSquared),
    status,
    warnings,
  };
}

function sensitivityFraction(selected: FitEvaluation, candidates: FitEvaluation[]): number | null {
  const reasonable = candidates.filter((candidate) => candidate.hardGatePass && candidate.slope !== 0);
  if (reasonable.length < 2 || selected.slope === 0) return null;
  let maximum = 0;
  for (const candidate of reasonable) {
    const metricRatio = (selected.slope / candidate.slope) ** 2;
    maximum = Math.max(maximum, Math.abs(metricRatio - 1));
  }
  return maximum;
}

function createDiagnostics(
  selected: FitEvaluation,
  candidates: FitEvaluation[],
  mode: 'fixed_first_five' | 'manual',
  expectedUniquePoints: number,
  minimumSamplingFrequencyRequiredHz: number | null,
  override: FitWindowOverrideV1 | null,
  requestedFitWindow: { startS: number; endS: number } | null,
): GittFitDiagnosticsV1 {
  return {
    requestedFitWindow,
    actualFitWindow: {
      startS: selected.points[0].timeS,
      endS: selected.points[selected.points.length - 1].timeS,
    },
    windowSelectionMode: mode,
    manualOverrideReason: override?.reason ?? null,
    expectedUniquePointsInFitWindow: expectedUniquePoints,
    minimumSamplingFrequencyRequiredHz,
    fitUniqueTickCount: selected.points.length,
    fitSourceRowCount: selected.points.reduce((sum, point) => sum + point.sourceRowCount, 0),
    fitContributingRowIds: selected.points.flatMap((point) => point.contributingRowIds),
    slopeVPerSqrtS: selected.slope,
    slopeStandardUncertainty: selected.slopeStandardError,
    interceptV: selected.intercept,
    rSquared: selected.rSquared,
    rmseV: selected.rmseV,
    durbinWatson: selected.durbinWatson,
    curvatureMetric: selected.curvatureMetric,
    normalizedMaxResidual: selected.normalizedMaxResidual,
    monotonicityFraction: selected.monotonicityFraction,
    windowSensitivityFraction: sensitivityFraction(selected, candidates),
  };
}

export function selectFitWindow(
  timeline: TimedPulsePoint[],
  noiseFloorV: number,
  override: FitWindowOverrideV1 | null,
): FitSelection {
  const findings: QcFinding[] = [];
  const fixedFitPoints = timeline
    .slice(1)
    .filter((point) => point.timeS > 0)
    .slice(0, POLICY.minimumFitPointCount);
  const expectedUniquePoints = fixedFitPoints.length;
  const minimumSamplingFrequencyRequiredHz = null;
  const mode = override ? 'manual' : 'fixed_first_five';

  if (override) {
    const reason = override.reason.trim();
    if (!reason) {
      findings.push(
        qcFinding('manual_fit_window_reason_missing', 'rejected', null, 'A manual window requires an audit reason.'),
      );
    }
    if (override.endElapsedTimeTicks < override.startElapsedTimeTicks) {
      findings.push(qcFinding('manual_fit_window_bounds_invalid', 'rejected'));
      return {
        evaluation: null,
        allCandidateEvaluations: [],
        diagnostics: emptyDiagnostics(mode, expectedUniquePoints, minimumSamplingFrequencyRequiredHz, override),
        findings,
      };
    }
    const selectedPoints = timeline.filter((point) => {
      const tick = point.nativeStepElapsedTimeTicks ?? point.nativeElapsedTimeTicks;
      return tick >= override.startElapsedTimeTicks && tick <= override.endElapsedTimeTicks;
    });
    const firstResolution = timeline[0]?.timeResolutionNs ?? 0n;
    const requestedFitWindow = {
      startS: Number(override.startElapsedTimeTicks * firstResolution) / 1_000_000_000,
      endS: Number(override.endElapsedTimeTicks * firstResolution) / 1_000_000_000,
    };
    const evaluation = evaluateFit(selectedPoints, noiseFloorV);
    if (!evaluation) {
      findings.push(
        qcFinding(
          'fit_window_insufficient_unique_ticks',
          'rejected',
          selectedPoints.length,
          'A fit requires at least five unique ticks with non-singular sqrt(time).',
        ),
      );
      return {
        evaluation: null,
        allCandidateEvaluations: [],
        diagnostics: {
          ...emptyDiagnostics(mode, expectedUniquePoints, minimumSamplingFrequencyRequiredHz, override),
          requestedFitWindow,
        },
        findings,
      };
    }
    if (!evaluation.hardGatePass) {
      findings.push(
        qcFinding(
          'manual_fit_window_failed_hard_gates',
          'rejected',
          null,
          'Manual selection cannot override scientific hard gates.',
        ),
      );
    }
    return {
      evaluation,
      allCandidateEvaluations: [evaluation],
      diagnostics: createDiagnostics(
        evaluation,
        [evaluation],
        mode,
        expectedUniquePoints,
        minimumSamplingFrequencyRequiredHz,
        override,
        requestedFitWindow,
      ),
      findings,
    };
  }

  if (fixedFitPoints.length < POLICY.minimumFitPointCount) {
    findings.push(
      qcFinding(
        'fixed_fit_sampling_infeasible',
        'rejected',
        fixedFitPoints.length,
        'The pulse does not contain five unique points after the first point for the fixed auxiliary regression.',
      ),
    );
    return {
      evaluation: null,
      allCandidateEvaluations: [],
      diagnostics: emptyDiagnostics(mode, expectedUniquePoints, minimumSamplingFrequencyRequiredHz, null),
      findings,
    };
  }

  const selected = evaluateFit(fixedFitPoints, noiseFloorV);
  const candidates = selected ? [selected] : [];
  if (!selected) {
    findings.push(qcFinding('fixed_fit_regression_unavailable', 'rejected'));
    return {
      evaluation: null,
      allCandidateEvaluations: candidates,
      diagnostics: emptyDiagnostics(mode, expectedUniquePoints, minimumSamplingFrequencyRequiredHz, null),
      findings,
    };
  }
  if (!selected.hardGatePass) {
    findings.push(
      qcFinding(
        'fixed_fit_no_window_passed_hard_gates',
        'rejected',
        null,
        'The fixed five-point auxiliary regression is retained only as a diagnostic regression.',
      ),
    );
  }
  return {
    evaluation: selected,
    allCandidateEvaluations: candidates,
    diagnostics: createDiagnostics(
      selected,
      candidates,
      mode,
      expectedUniquePoints,
      minimumSamplingFrequencyRequiredHz,
      null,
      null,
    ),
    findings,
  };
}
