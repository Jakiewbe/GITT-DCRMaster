import { describe, expect, it } from 'vitest';
import type { CanonicalRowV1, GittResultV1 } from '../../science/contracts';
import {
  buildGittOverviewVoltagePointsV1,
  buildGittPlotExportBundleV1,
  buildGittPulsePlotModelV1,
  isCfxDisplayComparisonPointEligible,
  isWhVoltageMetricPointEligible,
  rowsThroughCfxMedianVoltageFloor,
  visibleGittOverviewEntryIds,
} from './literaturePlotModel';

function row(
  rowId: string,
  stepId: string,
  stepType: CanonicalRowV1['canonicalStepType'],
  elapsedS: number,
  stepElapsedS: number,
  voltageV: number,
): CanonicalRowV1 {
  return {
    rowId,
    sourceFileId: 'fixture.ndax',
    sourceFileHash: 'source',
    instrumentId: null,
    channelId: null,
    sourceStream: 'record',
    sourceSheet: null,
    sourceRowIndex: BigInt(elapsedS),
    sourceRecordSequence: BigInt(elapsedS),
    parserVersion: 'test',
    elapsedTimeTicks: BigInt(elapsedS),
    stepElapsedTimeTicks: BigInt(stepElapsedS),
    timeResolutionNs: 1_000_000_000n,
    recordSequence: BigInt(elapsedS),
    elapsedTimeS: elapsedS,
    voltageV,
    currentA: stepType === 'rest' ? 0 : -0.001,
    temperatureC: null,
    vendorStepId: null,
    vendorStepType: null,
    analysisStepId: stepId,
    canonicalStepType: stepType,
    chargeCapacityAh: null,
    dischargeCapacityAh: null,
    netCapacityAh: null,
  };
}

describe('GITT WH voltage comparison eligibility', () => {
  it('uses the independent product display eligibility for the main comparison plot', () => {
    expect(isCfxDisplayComparisonPointEligible({ displayComparisonEligibility: 'included' })).toBe(true);
    expect(isCfxDisplayComparisonPointEligible({ displayComparisonEligibility: 'excluded_comparison_target_median' })).toBe(false);
    expect(isCfxDisplayComparisonPointEligible({ displayComparisonEligibility: 'excluded_protocol_cutoff' })).toBe(false);
  });

  it('rejects a finite squared-ratio result when endpoint voltage changes have opposite directions', () => {
    expect(isWhVoltageMetricPointEligible({
      metricValueCm2PerS: 1e-12,
      medianVoltageV: 2.8,
      deltaEtV: -0.4,
      deltaEsV: 0.02,
    })).toBe(false);
  });

  it('keeps a finite result when both endpoint changes have the same direction', () => {
    expect(isWhVoltageMetricPointEligible({
      metricValueCm2PerS: 1e-12,
      medianVoltageV: 2.8,
      deltaEtV: -0.4,
      deltaEsV: -0.02,
    })).toBe(true);
  });

  it('does not use post-rest voltage when the NDAX mid-voltage is unavailable', () => {
    expect(isWhVoltageMetricPointEligible({
      metricValueCm2PerS: 1e-12,
      medianVoltageV: null,
      deltaEtV: -0.4,
      deltaEsV: -0.02,
    })).toBe(false);
  });
});

describe('GITT overview visibility', () => {
  it('shows only the selected file by default and all files when explicitly requested', () => {
    expect(visibleGittOverviewEntryIds(['a', 'b'], 'b', false)).toEqual(['b']);
    expect(visibleGittOverviewEntryIds(['a', 'b'], 'b', true)).toEqual(['a', 'b']);
  });

  it('extends the trace past terminal cutoff until the first median voltage below the comparison target', () => {
    const traceRows = [
      row('pre-1', 'step-1', 'rest', 0, 0, 2.8),
      row('pulse-1', 'step-2', 'discharge', 1, 0, 2.7),
      row('post-1', 'step-3', 'rest', 2, 0, 2.6),
      row('pre-2', 'step-4', 'rest', 3, 0, 2.6),
      row('pulse-2', 'step-5', 'discharge', 4, 0, 1.6),
      row('post-2', 'step-6', 'rest', 5, 0, 1.7),
      row('tail', 'step-7', 'rest', 6, 0, 1.6),
    ];
    const profile = {
      profile: { comparisonTargetMedianVoltageV: 1.5 },
      pulses: [
        { sourcePulseId: 'pulse-1', medianVoltageV: 1.8, polarization: { equivalentSpecificCurrentMahPerG: 500 } },
        { sourcePulseId: 'pulse-2', medianVoltageV: 1.49, polarization: { equivalentSpecificCurrentMahPerG: 500 } },
      ],
    } as never;
    const program = {
      allEvents: [
        { sourcePulseId: 'pulse-2', pulseAnalysisStepId: 'step-5', postRestAnalysisStepId: 'step-6' },
      ],
    } as never;
    const retained = rowsThroughCfxMedianVoltageFloor(
      traceRows,
      program,
      profile,
    );

    expect(retained.map((sourceRow) => sourceRow.rowId)).toEqual([
      'pre-1', 'pulse-1', 'post-1', 'pre-2', 'pulse-2', 'post-2',
    ]);
  });
});

const rows = [
  row('pre-0', 'neware-step-1', 'rest', 0, 0, 3.01),
  row('pre-60', 'neware-step-1', 'rest', 60, 60, 3),
  row('pulse-0', 'neware-step-2', 'discharge', 60, 0, 2.98),
  row('pulse-1', 'neware-step-2', 'discharge', 61, 1, 2.96),
  row('pulse-4', 'neware-step-2', 'discharge', 64, 4, 2.92),
  row('post-0', 'neware-step-3', 'rest', 64, 0, 2.99),
  row('post-60', 'neware-step-3', 'rest', 124, 60, 2.995),
];

const result = {
  pulseId: 'source:gitt:neware-step-2',
  preRestEndPotentialV: 3,
  pulseT0VoltageV: 2.98,
  pulseT0CurrentA: -0.001,
  endpointStartTimeS: 0,
  firstPositivePulseTimeS: 1,
  firstPositivePulseVoltageV: 2.96,
  pulseStartVoltageV: 2.98,
  pulseBaselineExtrapolatedV: 2.98,
  pulseEndVoltageV: 2.92,
  medianVoltageV: 2.95,
  postRestEndPotentialV: 2.995,
  deltaEtV: -0.06,
  deltaEsV: -0.005,
  preRestLastRawVoltageV: 3,
  postRestLastRawVoltageV: 2.995,
  deltaEsRawV: -0.005,
  restEstimatorDifferencePreV: 0,
  restEstimatorDifferencePostV: 0,
  legacyFirstPositiveDeltaEtV: -0.04,
  legacyFirstPositiveEndpointMetricValueCm2PerS: 1e-10,
  deltaEtDefinitionDifferenceV: -0.02,
  endpointDRatioVsLegacy: 0.8,
  regressionCandidateMetricValueCm2PerS: 8e-11,
  regressionWindows: [
    {
      windowId: 'legacy_first_5',
      windowLabel: 'Legacy first 5 points',
      kind: 'legacy_first_5',
      requestedStartS: null,
      requestedEndS: null,
      actualStartS: 1,
      actualEndS: 4,
      pointCount: 2,
      uniqueTimePointCount: 2,
      fitDurationS: 3,
      fitEndFractionOfPulse: 0.03,
      slopeVPerSqrtS: -0.04,
      interceptV: 3,
      rSquared: 0.99,
      rmseV: 0.001,
      slopeStdError: 0.001,
      curvatureMetric: 0,
      maxNormalizedResidual: 0.01,
      monotonicityRatio: 1,
      durbinWatson: 2,
      metricValueCm2PerS: 8e-11,
      windowCoverageIncomplete: false,
      samplingCoverage: 'not_applicable',
      linearityClass: 'acceptable_review',
      status: 'review',
      warnings: [],
    },
    {
      windowId: 'cfx_10s',
      windowLabel: 'CFx 10 s (0 < t ≤ 64 s)',
      kind: 'fixed_time',
      requestedStartS: 0,
      requestedEndS: 64,
      actualStartS: 1,
      actualEndS: 4,
      pointCount: 2,
      uniqueTimePointCount: 2,
      fitDurationS: 3,
      fitEndFractionOfPulse: 0.03,
      slopeVPerSqrtS: -0.04,
      interceptV: 3,
      rSquared: 0.99,
      rmseV: 0.001,
      slopeStdError: 0.001,
      curvatureMetric: 0,
      maxNormalizedResidual: 0.01,
      monotonicityRatio: 1,
      durbinWatson: 2,
      metricValueCm2PerS: 7e-11,
      windowCoverageIncomplete: false,
      samplingCoverage: 'infeasible',
      linearityClass: 'acceptable_review',
      status: 'infeasible',
      warnings: ['fit_point_count_below_minimum'],
    },
    {
      windowId: 'cfx_4_25s',
      windowLabel: 'CFx 4–25 s',
      kind: 'fixed_time',
      requestedStartS: 4,
      requestedEndS: 25,
      actualStartS: 4,
      actualEndS: 4,
      pointCount: 1,
      uniqueTimePointCount: 1,
      fitDurationS: 0,
      fitEndFractionOfPulse: 0.04,
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
      windowCoverageIncomplete: true,
      samplingCoverage: 'not_applicable',
      linearityClass: 'unavailable',
      status: 'infeasible',
      warnings: ['fit_point_count_below_minimum'],
    },
  ],
  regressionWindowSensitivity: { log10DRange: null, finitePositiveWindowCount: 1 },
  fitDiagnostics: {
    fitContributingRowIds: ['pulse-1', 'pulse-4'],
    actualFitWindow: { startS: 1, endS: 4 },
    slopeVPerSqrtS: -0.04,
    interceptV: 3,
  },
} as unknown as GittResultV1;

describe('literature GITT plot model', () => {
  it('builds the full pre-rest, pulse, and post-rest diagnostic timeline', () => {
    const model = buildGittPulsePlotModelV1(rows, result);
    expect(model).not.toBeNull();
    expect(model?.timeline.map((point) => point.segment)).toEqual([
      'pre_rest',
      'pre_rest',
      'pulse',
      'pulse',
      'pulse',
      'post_rest',
      'post_rest',
    ]);
    expect(model?.pulseStartMinutes).toBeCloseTo(1, 12);
    expect(model?.pulseEndMinutes).toBeCloseTo(64 / 60, 12);
    expect(model?.preRestEndPotentialV).toBe(3);
    expect(model?.pulseStartVoltageV).toBe(2.98);
    expect(model?.postRestEndPotentialV).toBe(2.995);
  });

  it('uses the production fit receipt to mark E-sqrt(t) points and line endpoints', () => {
    const model = buildGittPulsePlotModelV1(rows, result);
    expect(model?.sqrtTimePoints.map((point) => point.sqrtTimeSqrtS)).toEqual([0, 1, 2]);
    expect(model?.sqrtTimePoints.map((point) => point.inFitWindow)).toEqual([false, true, true]);
    expect(model?.fitLine).toEqual({
      startSqrtTime: 1,
      endSqrtTime: 2,
      startVoltageV: 2.96,
      endVoltageV: 2.92,
    });
  });

  it('exports an unfitted tau-voltage series after removing the t=0 point', () => {
    const model = buildGittPulsePlotModelV1(rows, result);
    expect(model?.tauVoltagePoints).toEqual([
      { id: 'pulse-1', tauS: 1, voltageV: 2.96 },
      { id: 'pulse-4', tauS: 4, voltageV: 2.92 },
    ]);
  });

  it('preserves endpoints and voltage extrema while downsampling a full profile', () => {
    const manyRows = Array.from({ length: 100 }, (_, index) =>
      row(`row-${index}`, 'overview', 'rest', index, index, index === 50 ? 2 : 3 + index / 1_000),
    );
    const points = buildGittOverviewVoltagePointsV1(manyRows, 20);
    expect(points[0].id).toBe('row-0');
    expect(points.at(-1)?.id).toBe('row-99');
    expect(points.some((point) => point.id === 'row-50')).toBe(true);
  });

  it('exports direct plotting data without fitting tau-voltage points', () => {
    const bundle = buildGittPlotExportBundleV1(
      rows,
      [result],
      new Map([[result.pulseId, 1]]),
    );
    expect(bundle.fullTraceRows).toHaveLength(rows.length);
    expect(bundle.pulseResponseRows.map((point) => point.segment)).toContain('pulse');
    expect(bundle.sqrtFitRows.filter((point) => point.inAutomaticFitWindow)).toHaveLength(2);
    expect(bundle.sqrtFitRows.filter((point) => point.usedByLegacyFirst5)).toHaveLength(2);
    expect(bundle.regressionWindowRows).toHaveLength(3);
    expect(bundle.sqrtFitRows.filter((point) => point.usedByCfx10s)).toHaveLength(2);
    expect(bundle.tauVoltageRows).toEqual([
      { pulseId: result.pulseId, pulseOrder: 1, sqrtTauSqrtS: 1, voltageV: 2.96 },
      { pulseId: result.pulseId, pulseOrder: 1, sqrtTauSqrtS: 2, voltageV: 2.92 },
    ]);
    expect(bundle.whVoltageRows).toEqual([
      expect.objectContaining({
        pulseOrder: 1,
        medianVoltageV: 2.95,
        postRestEndPotentialV: 2.995,
        pulseT0VoltageV: 2.98,
        firstPositivePulseVoltageV: 2.96,
        legacyFirstPositiveDeltaEtV: -0.04,
        endpointDRatioVsLegacy: 0.8,
        regressionCandidateResultCm2PerS: 8e-11,
        cfx10sResultCm2PerS: 7e-11,
      }),
    ]);
  });
});
