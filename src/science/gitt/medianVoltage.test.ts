import { describe, expect, it } from 'vitest';
import type { CanonicalRowV1 } from '../contracts';
import { calculateMedianVoltageV } from './medianVoltage';

function row(
  sequence: number,
  capacityAh: number,
  voltageV: number,
): CanonicalRowV1 {
  return {
    sourceFileId: 'median-voltage-fixture.ndax',
    sourceFileHash: 'b'.repeat(64),
    instrumentId: null,
    channelId: null,
    sourceStream: 'fixture',
    sourceSheet: null,
    sourceRowIndex: BigInt(sequence),
    sourceRecordSequence: BigInt(sequence),
    parserVersion: 'fixture',
    elapsedTimeTicks: BigInt(sequence),
    stepElapsedTimeTicks: BigInt(sequence),
    timeResolutionNs: 1_000_000_000n,
    recordSequence: BigInt(sequence),
    elapsedTimeS: sequence,
    rowId: `row-${sequence}`,
    voltageV,
    currentA: -0.001,
    temperatureC: null,
    vendorStepId: '2',
    vendorStepType: 'CC_DChg',
    analysisStepId: 'pulse',
    canonicalStepType: 'discharge',
    chargeCapacityAh: 0,
    dischargeCapacityAh: capacityAh,
    netCapacityAh: -capacityAh,
  };
}

describe('Neware mid-capacity voltage', () => {
  it('uses the voltage at 50% of the step capacity, not the voltage-sample median', () => {
    const result = calculateMedianVoltageV([
      row(0, 0, 3.0447),
      row(1, 0.0000338404206559062, 2.4050679),
      row(2, 0.00003441369699430652, 2.4056504),
      row(3, 0.00006879302236484364, 2.4266),
    ], 'discharge');

    expect(result).toBeCloseTo(2.4056, 4);
  });

  it('does not invent a plotting voltage when the vendor capacity series is unavailable', () => {
    const input = row(0, 0, 3.0);
    input.dischargeCapacityAh = null;
    expect(calculateMedianVoltageV([input], 'discharge')).toBeNull();
  });

  it('rejects a capacity series that goes backwards instead of silently taking an absolute value', () => {
    expect(calculateMedianVoltageV([
      row(0, 0.0001, 3.0),
      row(1, 0.00005, 2.9),
      row(2, 0.0002, 2.8),
    ], 'discharge')).toBeNull();
  });
});
