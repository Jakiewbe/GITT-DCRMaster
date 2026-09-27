import type {
  CanonicalRowV1,
  GittPulseInputV1,
  MaterialPresetV1,
} from '../contracts';
import { analyzeGittPulse } from './analyze';
import { GITT_QC_POLICY_V1 } from './policy';
import { recordStorageFloat32ResolutionEvidence } from '../measurementResolution';

const L_EQUIVALENT_CM = 5e-4;
const PULSE_DURATION_S = 100;
const DELTA_ES_V = 0.02;
const EXACT_SLOPE = 0.0112837916709551;
const TIME_RESOLUTION_NS = 1_000_000_000n;

type InputOptions = {
  slope?: number;
  targetMetric?: number;
  curvatureVPerS?: number;
  deltaEsV?: number;
  currentA?: number;
  qrefAh?: number | null;
  materialFamily?: MaterialPresetV1['materialFamily'];
  pulseTimes?: number[];
};

function canonicalRow(args: {
  globalTimeS: number;
  stepTimeS: number;
  stepId: string;
  stepType: CanonicalRowV1['canonicalStepType'];
  voltageV: number;
  currentA: number;
  sequence: number;
}): CanonicalRowV1 {
  return {
    sourceFileId: 'synthetic-gitt-v1',
    sourceFileHash: 'a'.repeat(64),
    instrumentId: 'oracle',
    channelId: '1',
    sourceStream: 'synthetic',
    sourceSheet: null,
    sourceRowIndex: BigInt(args.sequence),
    sourceRecordSequence: BigInt(args.sequence),
    parserVersion: 'synthetic-1.0.0',
    elapsedTimeTicks: BigInt(args.globalTimeS),
    stepElapsedTimeTicks: BigInt(args.stepTimeS),
    timeResolutionNs: TIME_RESOLUTION_NS,
    recordSequence: BigInt(args.sequence),
    elapsedTimeS: args.globalTimeS,
    rowId: `row-${args.sequence}`,
    voltageV: args.voltageV,
    currentA: args.currentA,
    temperatureC: 25,
    vendorStepId: args.stepId,
    vendorStepType: args.stepType,
    analysisStepId: args.stepId,
    canonicalStepType: args.stepType,
    chargeCapacityAh: null,
    dischargeCapacityAh: null,
    netCapacityAh: null,
  };
}

function makeInput(options: InputOptions = {}): GittPulseInputV1 {
  const deltaEsV = options.deltaEsV ?? DELTA_ES_V;
  const targetMetric = options.targetMetric;
  const pulseTimes = options.pulseTimes ?? Array.from({ length: PULSE_DURATION_S + 1 }, (_, time) => time);
  const firstLoadedTimeS = Math.min(...pulseTimes.filter((time) => time > 0));
  const slope =
    options.slope ??
    (targetMetric === undefined
      ? EXACT_SLOPE
      : (deltaEsV * L_EQUIVALENT_CM * Math.sqrt(4 / (Math.PI * PULSE_DURATION_S * targetMetric))) /
        (Math.sqrt(PULSE_DURATION_S) - Math.sqrt(firstLoadedTimeS)));
  const curvature = options.curvatureVPerS ?? 0;
  const currentA = options.currentA ?? 1e-6;
  const material: MaterialPresetV1 = {
    materialPresetId: 'synthetic-layered-v1',
    materialFamily: options.materialFamily ?? 'layered_insertion',
    displayName: 'Synthetic reference',
    molarMassGPerMol: 1,
    densityGPerCm3: 1,
    densitySource: 'synthetic exact constant',
    densityMethod: 'oracle definition',
    densityStandardUncertainty: 0,
    molarVolumeCm3PerMol: 1,
    molarVolumeAuthority: 'derived_from_density',
    theoreticalSpecificCapacityMahPerG: 1_000,
    presetVersion: '1.0.0',
    userOverridden: false,
  };

  let sequence = 0;
  const preRestRows = Array.from({ length: 101 }, (_, time) =>
    canonicalRow({
      globalTimeS: time,
      stepTimeS: time,
      stepId: 'pre-rest',
      stepType: 'rest',
      voltageV: 3,
      currentA: 0,
      sequence: sequence++,
    }),
  );
  const pulseRows = pulseTimes.map((time) =>
    canonicalRow({
      globalTimeS: 100 + time,
      stepTimeS: time,
      stepId: 'pulse',
      stepType: 'charge',
      voltageV: 3.005 + slope * Math.sqrt(time) + curvature * time,
      currentA,
      sequence: sequence++,
    }),
  );
  const postRestRows = Array.from({ length: 101 }, (_, time) =>
    canonicalRow({
      globalTimeS: 200 + time,
      stepTimeS: time,
      stepId: 'post-rest',
      stepType: 'rest',
      voltageV: 3 + deltaEsV,
      currentA: 0,
      sequence: sequence++,
    }),
  );

  return {
    pulseId: 'synthetic-pulse-1',
    preRestRows,
    pulseRows,
    postRestRows,
    material,
    config: {
      qcPolicyId: GITT_QC_POLICY_V1.id,
      currentResolutionA: 1e-9,
      voltageResolutionV: 1e-7,
      fitWindowOverride: null,
      qrefAh: options.qrefAh === undefined ? 1 : options.qrefAh,
      activeMassG: L_EQUIVALENT_CM * (Math.PI / 4),
      electrodeDiameterCm: 1,
      activeMassStandardUncertaintyG: 0,
      electrodeDiameterStandardUncertaintyCm: 0,
    },
  };
}

function expectClose(actual: number | null, expected: number, rtol: number, atol: number): void {
  expect(actual).not.toBeNull();
  expect(Math.abs((actual as number) - expected)).toBeLessThanOrEqual(atol + rtol * Math.abs(expected));
}

describe('GITT V1 WH planar manual endpoint method', () => {
  it('uses the loaded t=0 pulse record for the primary Endpoint', () => {
    const result = analyzeGittPulse(makeInput({ pulseTimes: [0, 10, 20, 30] }));

    expect(result.pulseStartVoltageV).toBeCloseTo(3.005, 12);
    expect(result.deltaEtV).toBeCloseTo(
      (3.005 + EXACT_SLOPE * Math.sqrt(30)) - 3.005,
      12,
    );
    expect((result as unknown as { pulseT0VoltageV: number }).pulseT0VoltageV).toBeCloseTo(3.005, 12);
  });

  it('reports CFx 10 s window diagnostics separately from the Endpoint result', () => {
    const result = analyzeGittPulse(makeInput({ pulseTimes: [0, 10, 20, 30, 40, 50, 60, 70] }));
    const legacy = result.regressionWindows.find((window) => window.windowId === 'legacy_first_5');
    const cfx10s = result.regressionWindows.find((window) => window.windowId === 'cfx_10s');

    expect(cfx10s?.actualStartS).toBe(10);
    expect(cfx10s?.actualEndS).toBe(60);
    expect(cfx10s?.uniqueTimePointCount).toBe(6);
    expect(cfx10s?.samplingCoverage).toBe('full');
    expect(result.windowStabilityDecades).toBeCloseTo(
      Math.abs(Math.log10(cfx10s?.metricValueCm2PerS as number) - Math.log10(legacy?.metricValueCm2PerS as number)),
      12,
    );
    expect(result.methodDivergenceDecades).toBeCloseTo(
      Math.log10(cfx10s?.metricValueCm2PerS as number) - Math.log10(result.metricValueCm2PerS as number),
      12,
    );
    expect(result.absMethodDivergenceDecades).toBeCloseTo(
      Math.abs(result.methodDivergenceDecades as number),
      12,
    );
    expect(result.endpointStartTemporalResolutionS).toBe(10);
    expect(result.initialObservedDropV).toBeCloseTo(
      (result.preRestEndPotentialV as number) - (result.firstPositivePulseVoltageV as number),
      12,
    );
  });

  it('leaves onset diagnostics unavailable when no positive-time pulse sample exists', () => {
    const result = analyzeGittPulse(makeInput({ pulseTimes: [0] }));
    expect(result.endpointStartTemporalResolutionS).toBeNull();
    expect(result.initialObservedDropV).toBeNull();
    expect(result.windowStabilityDecades).toBeNull();
    expect(result.methodDivergenceDecades).toBeNull();
    expect(result.absMethodDivergenceDecades).toBeNull();
  });

  it('recovers the exact scalar oracle from the operator endpoint formula', () => {
    const result = analyzeGittPulse(makeInput());

    expect(result.calculationState).toBe('computed');
    expect(result.qcStatus).toBe('review');
    expectClose(result.metricValueCm2PerS, 1e-10, 1e-10, 1e-16);
    expectClose(result.diagnosticCandidateMetricValueCm2PerS, 1e-10, 1e-10, 1e-16);
    expectClose(result.regressionCandidateMetricValueCm2PerS, 1e-10, 1e-10, 1e-16);
    expect(result.regressionWindows.map((window) => window.windowId)).toEqual([
      'legacy_first_5',
      'cfx_10s',
    ]);
    expectClose(
      result.regressionWindows[0]?.metricValueCm2PerS ?? null,
      result.regressionCandidateMetricValueCm2PerS as number,
      1e-12,
      1e-16,
    );
    expect(result.regressionWindowSensitivity?.finitePositiveWindowCount).toBe(2);
    expectClose(result.activeMaterialEquivalentThicknessCm, L_EQUIVALENT_CM, 1e-12, 1e-16);
    expectClose(result.dimensionlessPulseTime, 0.04, 1e-10, 1e-14);
    expectClose(result.predictedDeltaEAtTauV, EXACT_SLOPE * 10, 1e-12, 1e-14);
    expectClose(result.observedDeltaEAtTauV, EXACT_SLOPE * 10, 1e-12, 1e-14);
    expectClose(result.deltaEtV, EXACT_SLOPE * 10, 1e-12, 1e-14);
    expect(result.pulseStartVoltageV).toBeCloseTo(3.005, 12);
    expect(result.calculationMethod).toBe('wh_planar_manual_endpoint');
    expect(result.endpointConsistencyRelativeError).toBeCloseTo(0, 12);
    expect(result.fitDiagnostics.windowSelectionMode).toBe('fixed_first_five');
    expect(result.fitDiagnostics.actualFitWindow?.startS).toBe(1);
    expect(result.fitDiagnostics.actualFitWindow?.endS).toBe(5);
    expect(result.fitDiagnostics.fitUniqueTickCount).toBe(5);
    expect(result.pulseBaselineExtrapolatedV).toBeCloseTo(3.005, 12);
    expect(result.metricStandardUncertainty).not.toBeNull();
    expect(result.sensitivities).toEqual({
      mass: 2,
      diameter: -4,
      density: -2,
      deltaEs: 2,
      deltaEt: -2,
      pulseDuration: -1,
    });
    expect(Object.keys(result)).not.toContain('endpointMetricValueCm2PerS');
  });

  it('does not require manual uncertainty entries and keeps storage-derived voltage evidence reviewable', () => {
    const input = makeInput();
    delete input.config.activeMassStandardUncertaintyG;
    delete input.config.electrodeDiameterStandardUncertaintyCm;
    const voltageEvidence = recordStorageFloat32ResolutionEvidence(5, 'Voltage');
    input.config.voltageResolutionV = voltageEvidence.value;
    input.config.voltageResolutionEvidence = voltageEvidence;

    const result = analyzeGittPulse(input);
    expect(result.calculationState).toBe('computed');
    expect(result.metricValueCm2PerS).not.toBeNull();
    expect(result.qcStatus).toBe('review');
    expect(result.qcCodes).toEqual(
      expect.arrayContaining([
        'voltage_resolution_inferred_from_record_storage',
        'equivalent_length_uncertainty_unknown',
      ]),
    );
  });

  it('gives one regression weight to a duplicate tick while preserving all contributing row ids', () => {
    const duplicated = makeInput();
    const original = duplicated.pulseRows.find((row) => row.stepElapsedTimeTicks === 1n) as CanonicalRowV1;
    duplicated.pulseRows.push({
      ...original,
      rowId: 'duplicate-at-1s',
      sourceRowIndex: 99_001n,
      sourceRecordSequence: 99_001n,
      recordSequence: 99_001n,
      voltageV: original.voltageV + 2e-8,
    });

    const averaged = makeInput();
    const averagedPoint = averaged.pulseRows.find((row) => row.stepElapsedTimeTicks === 1n) as CanonicalRowV1;
    averagedPoint.voltageV += 1e-8;

    const duplicateResult = analyzeGittPulse(duplicated);
    const averagedResult = analyzeGittPulse(averaged);
    expect(duplicateResult.fitDiagnostics.slopeVPerSqrtS).toBeCloseTo(
      averagedResult.fitDiagnostics.slopeVPerSqrtS as number,
      14,
    );
    expect(duplicateResult.fitDiagnostics.fitUniqueTickCount).toBe(
      averagedResult.fitDiagnostics.fitUniqueTickCount,
    );
    expect(duplicateResult.fitDiagnostics.fitSourceRowCount).toBe(
      averagedResult.fitDiagnostics.fitSourceRowCount + 1,
    );
    const duplicateLegacyWindow = duplicateResult.regressionWindows.find((window) => window.windowId === 'legacy_first_5');
    const averagedLegacyWindow = averagedResult.regressionWindows.find((window) => window.windowId === 'legacy_first_5');
    expect(duplicateLegacyWindow?.uniqueTimePointCount).toBe(averagedLegacyWindow?.uniqueTimePointCount);
    expect(duplicateLegacyWindow?.pointCount).toBe((averagedLegacyWindow?.pointCount ?? 0) + 1);
    expect(duplicateResult.fitDiagnostics.fitContributingRowIds).toContain('duplicate-at-1s');
    expect(duplicateResult.qcCodes).not.toContain('fit_duplicate_tick_voltage_conflict');
  });

  it('never merges an equal tick across analysis steps', () => {
    const input = makeInput();
    const original = input.pulseRows[10];
    input.pulseRows.push({
      ...original,
      rowId: 'other-step-same-tick',
      analysisStepId: 'pulse-other',
      vendorStepId: 'pulse-other',
      recordSequence: 98_000n,
      sourceRecordSequence: 98_000n,
      sourceRowIndex: 98_000n,
    });
    const result = analyzeGittPulse(input);
    expect(result.qcStatus).toBe('rejected');
    expect(result.metricValueCm2PerS).toBeNull();
    expect(result.qcCodes).toContain('pulse_multiple_analysis_steps');
  });

  it('retains a robust Theil-Sen end potential and reports the endpoint result with a stability diagnostic', () => {
    const input = makeInput();
    input.preRestRows[80].voltageV += 0.1;
    const result = analyzeGittPulse(input);
    expect(result.preRestEndPotentialV).toBeCloseTo(3, 12);
    expect(result.qcStatus).toBe('rejected');
    expect(result.qcCodes).toContain('pre_rest_end_stability');
    expect(result.diagnosticCandidateMetricValueCm2PerS).not.toBeNull();
    expect(result.regressionCandidateMetricValueCm2PerS).not.toBeNull();
    expect(result.metricValueCm2PerS).not.toBeNull();
  });

  it('still calculates the endpoint result when the auxiliary fit window has too few ticks', () => {
    const result = analyzeGittPulse(makeInput({ pulseTimes: [0, 10, 20, 30, 40] }));
    expect(result.calculationState).toBe('computed');
    expect(result.metricValueCm2PerS).not.toBeNull();
    expect(result.qcCodes).toContain('fixed_fit_sampling_infeasible');
    expect(result.fitDiagnostics.expectedUniquePointsInFitWindow).toBe(4);
    expect(result.regressionWindows.every((window) => window.status === 'infeasible')).toBe(true);
    expect(result.regressionWindows.every((window) => window.metricValueCm2PerS === null)).toBe(true);
  });

  it('keeps the endpoint result when the auxiliary regression diagnoses strong curvature', () => {
    const input = makeInput({ curvatureVPerS: 0.004 });
    const result = analyzeGittPulse(input);
    expect(result.fitDiagnostics.rSquared).toBeGreaterThan(0.98);
    expect(result.qcStatus).toBe('rejected');
    expect(result.metricValueCm2PerS).not.toBeNull();
    expect(result.qcCodes).toContain('fixed_fit_no_window_passed_hard_gates');
    expect(result.qcCodes).toContain('fit_curvature_metric');
  });

  it('uses complete pulse duration as the governing finite-diffusion check', () => {
    const result = analyzeGittPulse(makeInput({ targetMetric: 6e-10 }));
    expectClose(result.diagnosticCandidateMetricValueCm2PerS, 4.86e-10, 1e-10, 1e-16);
    expectClose(result.dimensionlessPulseTime, 0.1944, 1e-10, 1e-13);
    expectClose(result.dimensionlessFitTime, 0.00972, 1e-10, 1e-13);
    expect(result.qcStatus).toBe('review');
    expect(result.qcCodes).toContain('dimensionless_pulse_time');
  });

  it('reports a large-composition endpoint result while retaining the perturbation diagnostic', () => {
    const result = analyzeGittPulse(makeInput({ currentA: 0.01, qrefAh: 0.001 }));
    expect(result.pulseCapacityFraction).toBeGreaterThan(0.03);
    expect(result.qcStatus).toBe('rejected');
    expect(result.qcCodes).toContain('pulse_capacity_fraction');
    expect(result.metricValueCm2PerS).not.toBeNull();
  });

  it('reports the squared endpoint result but explicitly diagnoses an opposite-sign response', () => {
    const result = analyzeGittPulse(makeInput({ deltaEsV: -DELTA_ES_V }));
    expect(result.diagnosticCandidateMetricValueCm2PerS).not.toBeNull();
    expect(result.metricValueCm2PerS).not.toBeNull();
    expect(result.qcCodes).toContain('delta_es_delta_et_direction_mismatch');
  });

  it('locks CFx to limited applicability and a comparative-index interpretation', () => {
    const result = analyzeGittPulse(makeInput({ materialFamily: 'cfx_conversion' }));
    expect(result.modelFamily).toBe('WEPPNER_HUGGINS_PLANAR');
    expect(result.modelApplicability).toBe('limited');
    expect(result.interpretationScope).toBe('comparative_index_only');
    expect(result.metricKind).toBe('wh_comparative_transport_index');
  });

  it('carries the independently assessed pre-pulse SOC without changing WH QC', () => {
    const input = makeInput();
    input.socPrePulse = {
      calculationState: 'computed',
      qcStatus: 'valid',
      qcCodes: ['vendor_capacity_agrees_with_integration'],
      rowId: input.preRestRows.at(-1)?.rowId ?? null,
      cumulativeNetCapacityAh: -0.00025,
      socPct: 75,
      dodPct: 25,
      remainingCapacityPct: 75,
      capacitySource: 'vendor',
    };
    const result = analyzeGittPulse(input);
    expect(result.socCalculationState).toBe('computed');
    expect(result.socQcStatus).toBe('valid');
    expect(result.socPrePulsePct).toBe(75);
    expect(result.dodPrePulsePct).toBe(25);
    expect(result.cumulativeNetCapacityAh).toBe(-0.00025);
    expect(result.socCapacitySource).toBe('vendor');
  });
});
