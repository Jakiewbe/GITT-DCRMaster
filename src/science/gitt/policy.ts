import type { QcStatus } from '../contracts';

export const GITT_QC_POLICY_V1 = {
  id: 'GITT_QC_POLICY_CFX_1_1_0',
  cfx10s: {
    presetId: 'CFx_10s',
    requestedStartS: 0,
    requestedEndS: 64,
    startBoundary: 'exclusive',
    partialPointMinimum: 5,
    fullPointMinimum: 6,
    rSquaredStrongMinimum: 0.995,
    rSquaredAcceptableMinimum: 0.98,
    windowStabilityValidMaximumDecades: 0.05,
    windowStabilityReviewMaximumDecades: 0.15,
    methodDivergenceReviewMaximumDecades: 0.5,
  },
  thresholdSources: {
    fitPointCount: 'sampling_coverage_diagnostic',
    rSquared: 'regression_diagnostic',
    modelApplicability: 'WH_model_assumption_diagnostic',
    restStability: 'measurement_diagnostic',
  },
  fitPointCount: { validMinimum: 8, reviewMinimum: 5 },
  rSquared: { validMinimum: 0.995, reviewMinimum: 0.98 },
  dimensionlessPulseTime: { validMaximum: 0.1, reviewMaximum: 0.2 },
  dimensionlessFitTime: { validMaximum: 0.05, reviewMaximum: 0.1 },
  fitEndFraction: { validMaximum: 0.2, reviewMaximum: 0.35 },
  slopeSignalRatio: { validMinimum: 10, reviewMinimum: 5 },
  curvatureMetric: { validMaximum: 0.1, reviewMaximum: 0.25 },
  normalizedMaxResidual: { validMaximum: 0.05, reviewMaximum: 0.1 },
  durbinWatson: {
    validMinimum: 1.5,
    validMaximum: 2.5,
    reviewMinimum: 1,
    reviewMaximum: 3,
  },
  monotonicityFraction: { validMinimum: 0.9, reviewMinimum: 0.75 },
  windowSensitivityFraction: { validMaximum: 0.05, reviewMaximum: 0.15 },
  endpointConsistencyError: { validMaximum: 0.1, reviewMaximum: 0.25 },
  pulseCapacityFraction: { validMaximum: 0.01, reviewMaximum: 0.03 },
  equilibriumVoltageStepV: { validMaximum: 0.01, reviewMaximum: 0.025 },
  pulseCurrentCv: { validMaximum: 0.005, reviewMaximum: 0.02 },
  relativeLengthUncertainty: { validMaximum: 0.05, reviewMaximum: 0.15 },
  relativeMetricUncertainty: { validMaximum: 0.2, reviewMaximum: 0.5 },
  pulseCapacityTimeCoverage: { validMinimum: 0.995, reviewMinimum: 0.99 },
  restTail: {
    minimumWindowS: 60,
    windowFraction: 0.2,
    validUniqueTickMinimum: 10,
    reviewUniqueTickMinimum: 5,
    minimumRegressionTickCount: 2,
    validDriftFloorMv: 0.2,
    validDriftSigmaMultiplier: 3,
    validRangeFloorMv: 0.5,
    validRangeSigmaMultiplier: 6,
    reviewDriftFloorMv: 1,
    reviewDriftSigmaMultiplier: 10,
    reviewRangeFloorMv: 2,
    reviewRangeSigmaMultiplier: 20,
  },
  duplicateTickVoltageNoiseMultiplier: 3,
  minimumFitPointCount: 5,
} as const;

export function upperBoundStatus(value: number, validMaximum: number, reviewMaximum: number): QcStatus {
  if (value <= validMaximum) return 'valid';
  if (value <= reviewMaximum) return 'review';
  return 'rejected';
}

export function lowerBoundStatus(value: number, validMinimum: number, reviewMinimum: number): QcStatus {
  if (value >= validMinimum) return 'valid';
  if (value >= reviewMinimum) return 'review';
  return 'rejected';
}

export function boundedStatus(
  value: number,
  validMinimum: number,
  validMaximum: number,
  reviewMinimum: number,
  reviewMaximum: number,
): QcStatus {
  if (value >= validMinimum && value <= validMaximum) return 'valid';
  if (value >= reviewMinimum && value <= reviewMaximum) return 'review';
  return 'rejected';
}
