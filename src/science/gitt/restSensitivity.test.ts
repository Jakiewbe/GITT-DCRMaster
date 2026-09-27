import type { CanonicalRowV1 } from '../contracts';
import { GITT_QC_POLICY_V1 } from './policy';
import {
  analyzeRestEndSensitivity,
  estimateRestEndForWindow,
} from './restSensitivity';

const TIME_RESOLUTION_NS = 1_000_000_000n;

function restRow(timeS: number, voltageV: number, sequence: number): CanonicalRowV1 {
  return {
    sourceFileId: 'rest-sensitivity-test',
    sourceFileHash: 'r'.repeat(64),
    instrumentId: 'synthetic',
    channelId: '1',
    sourceStream: 'synthetic',
    sourceSheet: null,
    sourceRowIndex: BigInt(sequence),
    sourceRecordSequence: BigInt(sequence),
    parserVersion: 'test-1.0.0',
    elapsedTimeTicks: BigInt(timeS),
    stepElapsedTimeTicks: BigInt(timeS),
    timeResolutionNs: TIME_RESOLUTION_NS,
    recordSequence: BigInt(sequence),
    elapsedTimeS: timeS,
    rowId: `rest-${sequence}`,
    voltageV,
    currentA: 0,
    temperatureC: 25,
    vendorStepId: 'rest',
    vendorStepType: 'rest',
    analysisStepId: 'rest',
    canonicalStepType: 'rest',
    chargeCapacityAh: null,
    dischargeCapacityAh: null,
    netCapacityAh: null,
  };
}

function curvedRestRows(): CanonicalRowV1[] {
  return Array.from({ length: 3_601 }, (_, timeS) => {
    const relaxationV = 0.12 * Math.exp(-timeS / 1_200);
    return restRow(timeS, 3 + relaxationV + (timeS === 3_600 ? 0.02 : 0), timeS);
  });
}

describe('Rest-end window sensitivity audit', () => {
  it('uses the same current 20%/60 s robust estimator as the formal window', () => {
    const rows = curvedRestRows();
    const audit = analyzeRestEndSensitivity(rows);

    expect(audit.restEndCurrentWindowV).not.toBeNull();
    expect(audit.restEndCurrentWindowV as number).toBeCloseTo(
      estimateRestEndForWindow(rows, 'current') as number,
      12,
    );
    expect(audit.restEndCurrentWindowS).toBe(720);
    expect(audit.restEnd15minV).not.toBeNull();
    expect(audit.restEnd15minV as number).toBeCloseTo(
      estimateRestEndForWindow(rows, '15min') as number,
      12,
    );
    expect(audit.restEnd5minV).not.toBeNull();
    expect(audit.restEnd5minV as number).toBeCloseTo(
      estimateRestEndForWindow(rows, '5min') as number,
      12,
    );
  });

  it('keeps raw-last separate from the robust spread and reports signed pairwise deltas', () => {
    const rows = curvedRestRows();
    const audit = analyzeRestEndSensitivity(rows);
    const robustValues = [
      audit.restEndCurrentWindowV,
      audit.restEnd15minV,
      audit.restEnd5minV,
    ].filter((value): value is number => value !== null);

    expect(audit.restEndRawLastPointV).toBeCloseTo(rows.at(-1)?.voltageV ?? Number.NaN, 12);
    expect(audit.restEndRobustSpreadV).toBeCloseTo(
      Math.max(...robustValues) - Math.min(...robustValues),
      12,
    );
    expect(audit.restEndRobustSpreadV).toBeLessThan(Math.abs(audit.restEnd5minVsRawV ?? 0));
    expect(audit.restEndCurrentVs15minV).toBeCloseTo(
      (audit.restEndCurrentWindowV ?? Number.NaN) - (audit.restEnd15minV ?? Number.NaN),
      12,
    );
    expect(audit.restEnd15minVs5minV).toBeCloseTo(
      (audit.restEnd15minV ?? Number.NaN) - (audit.restEnd5minV ?? Number.NaN),
      12,
    );
  });

  it('uses the existing policy values rather than introducing audit thresholds', () => {
    expect(GITT_QC_POLICY_V1.restTail.windowFraction).toBe(0.2);
    expect(GITT_QC_POLICY_V1.restTail.minimumWindowS).toBe(60);
  });
});
