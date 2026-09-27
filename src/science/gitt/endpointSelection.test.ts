import { describe, expect, it } from 'vitest';
import type { CanonicalRowV1, GittPulseInputV1, MaterialPresetV1 } from '../contracts';
import { analyzeGittPulse } from './analyze';
import { GITT_QC_POLICY_V1 } from './policy';

const RESOLUTION_NS = 1_000_000_000n;
const CURRENT_RESOLUTION_A = 1e-9;

function row(args: {
  id: string;
  stepId: string;
  stepType: CanonicalRowV1['canonicalStepType'];
  absoluteTimeS: number;
  stepTimeS: number;
  sequence: number;
  voltageV: number;
  currentA: number;
}): CanonicalRowV1 {
  return {
    sourceFileId: 'endpoint-selection-test',
    sourceFileHash: 'b'.repeat(64),
    instrumentId: 'test',
    channelId: '1',
    sourceStream: 'synthetic',
    sourceSheet: null,
    sourceRowIndex: BigInt(args.sequence),
    sourceRecordSequence: BigInt(args.sequence),
    parserVersion: 'test',
    elapsedTimeTicks: BigInt(args.absoluteTimeS),
    stepElapsedTimeTicks: BigInt(args.stepTimeS),
    timeResolutionNs: RESOLUTION_NS,
    recordSequence: BigInt(args.sequence),
    elapsedTimeS: args.absoluteTimeS,
    rowId: args.id,
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

const material: MaterialPresetV1 = {
  materialPresetId: 'endpoint-selection-test',
  materialFamily: 'layered_insertion',
  displayName: 'Endpoint selection test',
  molarMassGPerMol: 1,
  densityGPerCm3: 1,
  densitySource: 'test',
  densityMethod: 'test',
  densityStandardUncertainty: 0,
  molarVolumeCm3PerMol: 1,
  molarVolumeAuthority: 'derived_from_density',
  theoreticalSpecificCapacityMahPerG: 1_000,
  presetVersion: '1.0.0',
  userOverridden: false,
};

function makeInput(options: {
  pulseTimes?: number[];
  t0CurrentA?: number;
  t0VoltageV?: number;
  duplicateT0VoltageV?: number | null;
} = {}): GittPulseInputV1 {
  const pulseTimes = options.pulseTimes ?? [0, 10, 20];
  let sequence = 0;
  const preRestRows = [0, 1].map((time) => row({
    id: `pre-${time}`,
    stepId: 'pre-rest',
    stepType: 'rest',
    absoluteTimeS: time,
    stepTimeS: time,
    sequence: sequence++,
    voltageV: 3.1,
    currentA: 0,
  }));
  const pulseRows = pulseTimes.map((time) => row({
    id: `pulse-${time}`,
    stepId: 'pulse',
    stepType: 'charge',
    absoluteTimeS: 100 + time,
    stepTimeS: time,
    sequence: sequence++,
    voltageV: time === 0 ? options.t0VoltageV ?? 3.0 : 3.1 + time / 100,
    currentA: time === 0 ? options.t0CurrentA ?? 1e-6 : 1e-6,
  }));
  if (options.duplicateT0VoltageV !== undefined && options.duplicateT0VoltageV !== null) {
    pulseRows.push(row({
      id: 'pulse-0-duplicate',
      stepId: 'pulse',
      stepType: 'charge',
      absoluteTimeS: 100,
      stepTimeS: 0,
      sequence: sequence++,
      voltageV: options.duplicateT0VoltageV,
      currentA: 1e-6,
    }));
  }
  const postRestRows = [0, 1].map((time) => row({
    id: `post-${time}`,
    stepId: 'post-rest',
    stepType: 'rest',
    absoluteTimeS: 120 + time,
    stepTimeS: time,
    sequence: sequence++,
    voltageV: 3.2,
    currentA: 0,
  }));

  return {
    pulseId: 'endpoint-selection-test-pulse',
    preRestRows,
    pulseRows,
    postRestRows,
    material,
    config: {
      qcPolicyId: GITT_QC_POLICY_V1.id,
      voltageResolutionV: 1e-7,
      currentResolutionA: CURRENT_RESOLUTION_A,
      fitWindowOverride: null,
      qrefAh: 1,
      activeMassG: Math.PI / 4,
      electrodeDiameterCm: 1,
      activeMassStandardUncertaintyG: 0,
      electrodeDiameterStandardUncertaintyCm: 0,
    },
  } as GittPulseInputV1;
}

describe('loaded t=0 Endpoint selection', () => {
  it('does not fallback to the first positive-time point when t=0 is absent', () => {
    const result = analyzeGittPulse(makeInput({ pulseTimes: [10, 20] }));

    expect(result.deltaEtV).toBeNull();
    expect(result.metricValueCm2PerS).toBeNull();
    expect(result.qcCodes).toContain('ENDPOINT_LOADED_T0_MISSING');
    expect((result as unknown as { legacyFirstPositiveDeltaEtV: number }).legacyFirstPositiveDeltaEtV).toBeDefined();
  });

  it('rejects t=0 with zero current as not loaded', () => {
    const result = analyzeGittPulse(makeInput({ t0CurrentA: 0 }));

    expect(result.deltaEtV).toBeNull();
    expect(result.metricValueCm2PerS).toBeNull();
    expect(result.qcCodes).toContain('ENDPOINT_T0_NOT_LOADED');
  });

  it('uses the existing current resolution as the loaded-current boundary', () => {
    const result = analyzeGittPulse(makeInput({ t0CurrentA: CURRENT_RESOLUTION_A / 2 }));

    expect(result.deltaEtV).toBeNull();
    expect(result.metricValueCm2PerS).toBeNull();
    expect(result.qcCodes).toContain('ENDPOINT_T0_NOT_LOADED');
  });

  it('rejects t=0 with an incompatible current direction', () => {
    const result = analyzeGittPulse(makeInput({ t0CurrentA: -1e-6 }));

    expect(result.deltaEtV).toBeNull();
    expect(result.metricValueCm2PerS).toBeNull();
    expect(result.qcCodes).toContain('ENDPOINT_T0_DIRECTION_CONFLICT');
  });

  it('uses the existing physical-time duplicate merge for duplicate t=0 rows', () => {
    const result = analyzeGittPulse(makeInput({ t0VoltageV: 3.0, duplicateT0VoltageV: 3.2 }));

    expect(result.pulseStartVoltageV).toBeCloseTo(3.1, 12);
    expect((result as unknown as { pulseT0VoltageV: number }).pulseT0VoltageV).toBeCloseTo(3.1, 12);
  });

  it('separates onset, early polarization, and legacy first-positive drops', () => {
    const result = analyzeGittPulse(makeInput());
    const audit = result as unknown as {
      onsetObservedDropV: number;
      earlyPolarizationDropV: number;
      preRestToFirstPositiveDropV: number;
      initialObservedDropV: number;
    };

    expect(audit.preRestToFirstPositiveDropV).toBeCloseTo(
      audit.onsetObservedDropV + audit.earlyPolarizationDropV,
      12,
    );
    expect(audit.initialObservedDropV).toBeCloseTo(audit.preRestToFirstPositiveDropV, 12);
  });
});
