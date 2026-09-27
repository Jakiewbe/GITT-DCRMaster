import { describe, expect, it } from 'vitest';
import type { CanonicalRowV1 } from '../../science/contracts';
import type { NewareCanonicalDataset } from './normalize';
import { buildNewareDcrEvents, classifyNewareProfile } from './events';

function row(
  id: string,
  stepId: string,
  stepType: CanonicalRowV1['canonicalStepType'],
  sequence: number,
  voltageV: number,
  currentA: number,
): CanonicalRowV1 {
  return {
    rowId: id,
    sourceFileId: 'synthetic.ndax',
    sourceFileHash: 'a'.repeat(64),
    instrumentId: 'BTS85',
    channelId: '6',
    sourceStream: 'ndax:data.ndc:main',
    sourceSheet: null,
    sourceRowIndex: BigInt(sequence),
    sourceRecordSequence: BigInt(sequence),
    parserVersion: 'test',
    elapsedTimeTicks: BigInt(sequence),
    stepElapsedTimeTicks: BigInt(sequence),
    timeResolutionNs: 1_000_000_000n,
    recordSequence: BigInt(sequence),
    elapsedTimeS: sequence,
    voltageV,
    currentA,
    temperatureC: null,
    vendorStepId: stepId,
    vendorStepType: stepType,
    analysisStepId: `step-${stepId}`,
    canonicalStepType: stepType,
    chargeCapacityAh: null,
    dischargeCapacityAh: null,
    netCapacityAh: null,
  };
}

function dataset(
  rows: CanonicalRowV1[],
  programSteps: NewareCanonicalDataset['metadata']['programSteps'] = [],
): NewareCanonicalDataset {
  return {
    rows,
    metadata: {
      parserProfileId: 'neware-ndax-ndc17-v1',
      parserProfileVersion: '0.1.2-provisional',
      approvalState: 'provisional',
      instrumentId: 'BTS85',
      channelId: '6',
      testId: null,
      testGuid: null,
      clientVersion: null,
      serverVersion: null,
      firmwareVersion: null,
      activeMassMg: null,
      remark: null,
      currentRangeMa: 1,
      voltageRangeV: 5,
      sourceTimeResolutionNs: 1_000_000n,
      programSteps,
    },
    sourceFileHash: 'a'.repeat(64),
    canonicalDatasetHash: 'b'.repeat(64),
    normalizationReceiptHash: 'c'.repeat(64),
    warnings: [],
  };
}

describe('Neware paper-method DCR adapter', () => {
  it('pairs a small discharge with the later larger discharge after Rest', () => {
    const input = dataset([
      row('rest-1', '1', 'rest', 1, 3.1, 0),
      row('small-1', '2', 'discharge', 2, 3.0, -0.1),
      row('small-2', '2', 'discharge', 3, 2.9, -0.1),
      row('rest-2', '3', 'rest', 4, 2.9, 0),
      row('large-1', '4', 'discharge', 5, 2.8, -0.5),
      row('large-2', '4', 'discharge', 6, 2.7, -0.5),
    ]);

    expect(classifyNewareProfile(input).vendorProfileId).toBe('neware-bts8-dcr-two-current-terminal-v1');
    const [event] = buildNewareDcrEvents(input);
    expect(event.config.calculationMethod).toBe('two_current_terminal_v1');
    expect(event.smallDischargeRows?.at(-1)?.rowId).toBe('small-2');
    expect(event.largeDischargeRows?.at(-1)?.rowId).toBe('large-2');
    expect(event.config.requestedMetrics).toEqual([{ kind: 'two_current_terminal', label: 'DCR_terminal' }]);
  });

  it('keeps a GITT program classified as GITT even when current noise creates a tiny later-current increase', () => {
    const input = dataset(
      [
        row('gitt-rest-1', '1', 'rest', 1, 3.1, 0),
        row('gitt-pulse-1', '2', 'discharge', 2, 3.0, -0.1),
        row('gitt-rest-2', '3', 'rest', 3, 3.0, 0),
        row('gitt-pulse-2', '2', 'discharge', 4, 2.9, -0.1001),
      ],
      [
        { stepId: 2, stepTypeCode: 2, recordIntervalMs: 10_000, durationMs: 1_200_000, currentMa: -0.1 },
        { stepId: 3, stepTypeCode: 4, recordIntervalMs: 30_000, durationMs: 14_400_000, currentMa: 0 },
      ],
    );

    expect(classifyNewareProfile(input).vendorProfileId).toBe('neware-bts8-gitt-1200s-v1');
    expect(classifyNewareProfile(input).analysisKind).toBe('gitt');
    expect(buildNewareDcrEvents(input)).toEqual([]);
  });
});
