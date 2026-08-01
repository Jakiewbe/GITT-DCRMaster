import type {
  FitWindowOverrideV1,
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

function emptyDiagnostics(
  mode: 'automatic' | 'manual',
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

function windowDuration(evaluation: FitEvaluation): number {
  return evaluation.points[evaluation.points.length - 1].timeS - evaluation.points[0].timeS;
}

function orderCandidates(left: FitEvaluation, right: FitEvaluation): number {
  const durationDifference = windowDuration(right) - windowDuration(left);
  if (durationDifference !== 0) return durationDifference;
  if (left.points.length !== right.points.length) return right.points.length - left.points.length;
  if (left.points[0].timeS !== right.points[0].timeS) return left.points[0].timeS - right.points[0].timeS;
  return (left.curvatureMetric ?? Number.POSITIVE_INFINITY) - (right.curvatureMetric ?? Number.POSITIVE_INFINITY);
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
  mode: 'automatic' | 'manual',
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
  pulseDurationS: number,
  noiseFloorV: number,
  override: FitWindowOverrideV1 | null,
): FitSelection {
  const findings: QcFinding[] = [];
  const autoEligible = timeline
    .slice(1)
    .filter((point) => point.timeS > 0 && point.timeS <= pulseDurationS * POLICY.automaticWindowFraction);
  const expectedUniquePoints = autoEligible.length;
  const minimumSamplingFrequencyRequiredHz =
    pulseDurationS > 0
      ? POLICY.minimumFitPointCount / (pulseDurationS * POLICY.automaticWindowFraction)
      : null;
  const mode = override ? 'manual' : 'automatic';

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

  if (autoEligible.length < POLICY.minimumFitPointCount) {
    findings.push(
      qcFinding(
        'automatic_fit_sampling_infeasible',
        'rejected',
        autoEligible.length,
        'The configured pulse and sampling cadence cannot provide five unique ticks in the first 35%.',
      ),
    );
    return {
      evaluation: null,
      allCandidateEvaluations: [],
      diagnostics: emptyDiagnostics(mode, expectedUniquePoints, minimumSamplingFrequencyRequiredHz, null),
      findings,
    };
  }

  const candidates: FitEvaluation[] = [];
  const startCount = Math.min(POLICY.automaticStartCandidateCount, autoEligible.length);
  for (let startIndex = 0; startIndex < startCount; startIndex += 1) {
    for (
      let endIndex = autoEligible.length - 1;
      endIndex >= startIndex + POLICY.minimumFitPointCount - 1;
      endIndex -= 1
    ) {
      const evaluation = evaluateFit(autoEligible.slice(startIndex, endIndex + 1), noiseFloorV);
      if (evaluation) candidates.push(evaluation);
    }
  }
  const passing = candidates.filter((candidate) => candidate.hardGatePass).sort(orderCandidates);
  const selected = passing[0] ?? [...candidates].sort(orderCandidates)[0] ?? null;
  if (!selected) {
    findings.push(qcFinding('automatic_fit_regression_unavailable', 'rejected'));
    return {
      evaluation: null,
      allCandidateEvaluations: candidates,
      diagnostics: emptyDiagnostics(mode, expectedUniquePoints, minimumSamplingFrequencyRequiredHz, null),
      findings,
    };
  }
  if (passing.length === 0) {
    findings.push(
      qcFinding(
        'automatic_fit_no_window_passed_hard_gates',
        'rejected',
        null,
        'The longest structural candidate is retained only as a diagnostic regression.',
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
