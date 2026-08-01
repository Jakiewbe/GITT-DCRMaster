export const DCR_QC_POLICY_V1 = {
  id: 'DCR_QC_POLICY_1_0_0',
  baselineWindowS: 60,
  minimumBaselinePoints: 2,
  validBaselinePoints: 5,
  currentResolutionRatio: {
    validMinimum: 100,
    computableMinimum: 20,
  },
  voltageSnr: {
    validMinimum: 10,
    reviewMinimum: 5,
  },
  pulseCurrentCv: {
    validMaximum: 0.005,
    reviewMaximum: 0.02,
  },
  targetCurrentDeviationFraction: {
    validMaximum: 0.005,
    reviewMaximum: 0.02,
  },
  baselineVoltageDriftMvPerMin: {
    validMaximum: 1,
    reviewMaximum: 5,
  },
  relativeResistanceUncertainty: {
    validMaximum: 0.05,
    reviewMaximum: 0.15,
  },
} as const;

export const NANOSECONDS_PER_SECOND = 1_000_000_000n;
