import { describe, expect, it } from 'vitest';

import type { CanonicalRowV1, GittResultV1 } from '../../science/contracts';
import type { NewareCanonicalDataset } from './normalize';
import { buildNewareCfxGitt1200sProfile } from './gitt1200sProfile';

const sourceFileHash = 'source-hash';

function row(
  analysisStepId: string,
  vendorStepId: string,
  canonicalStepType: CanonicalRowV1['canonicalStepType'],
  stepElapsedS: number,
  voltageV: number,
): CanonicalRowV1 {
  return {
    sourceFileId: 'fixture.ndax',
    sourceFileHash,
    instrumentId: 'BTS8',
    channelId: '1',
    sourceStream: 'fixture',
    sourceSheet: null,
    sourceRowIndex: BigInt(Math.round(stepElapsedS * 10)),
    sourceRecordSequence: BigInt(Math.round(stepElapsedS * 10)),
    parserVersion: '0.1.2-provisional',
    elapsedTimeTicks: BigInt(Math.round(stepElapsedS * 1000)),
    stepElapsedTimeTicks: BigInt(Math.round(stepElapsedS * 1000)),
    timeResolutionNs: 1_000_000n,
    recordSequence: BigInt(Math.round(stepElapsedS * 10)),
    elapsedTimeS: stepElapsedS,
    rowId: `${analysisStepId}:${stepElapsedS}`,
    voltageV,
    currentA: canonicalStepType === 'discharge' ? -0.0002 : 0,
    temperatureC: null,
    vendorStepId,
    vendorStepType: canonicalStepType === 'rest' ? 'Rest' : 'CC_DChg',
    analysisStepId,
    canonicalStepType,
    chargeCapacityAh: null,
    dischargeCapacityAh: null,
    netCapacityAh: null,
  };
}

function result(
  pulseStep: string,
  durationS: number,
  endVoltageV: number,
): GittResultV1 {
  return {
    pulseId: `${sourceFileHash}:gitt:${pulseStep}`,
    pulseDurationS: durationS,
    pulseEndVoltageV: endVoltageV,
  } as GittResultV1;
}

function dataset(restEndS: number): NewareCanonicalDataset {
  return {
    sourceFileHash,
    canonicalDatasetHash: 'canonical',
    normalizationReceiptHash: 'receipt',
    warnings: [],
    metadata: {
      parserProfileId: 'neware-ndax-ndc17-v1',
      parserProfileVersion: '0.1.2-provisional',
      approvalState: 'provisional',
      instrumentId: 'BTS8',
      channelId: '1',
      testId: null,
      testGuid: null,
      clientVersion: null,
      serverVersion: null,
      firmwareVersion: null,
      activeMassMg: 1,
      remark: null,
      currentRangeMa: null,
      voltageRangeV: null,
      sourceTimeResolutionNs: 1_000_000n,
      programSteps: [
        { stepId: 1, stepTypeCode: 4, recordIntervalMs: 5000, durationMs: 120_000, currentMa: 0 },
        {
          stepId: 2,
          stepTypeCode: 2,
          recordIntervalMs: 10_000,
          durationMs: 1_200_000,
          currentMa: -0.2,
          stopVoltageV: 1.5,
          stopVoltageRaw: 15_000,
        },
        { stepId: 3, stepTypeCode: 4, recordIntervalMs: 30_000, durationMs: 14_400_000, currentMa: 0 },
        {
          stepId: 4,
          stepTypeCode: 7,
          recordIntervalMs: null,
          durationMs: null,
          currentMa: null,
          loop: { startStepId: 2, cycleCount: 1000 },
        },
      ],
    },
    rows: [
      row('pre', '1', 'rest', 0, 3.1),
      row('pre', '1', 'rest', 120, 3.1),
      row('pulse', '2', 'discharge', 0, 3.1),
      row('pulse', '2', 'discharge', 1200, 2.0),
      row('post', '3', 'rest', 0, 2.0),
      row('post', '3', 'rest', restEndS, 2.1),
    ],
  };
}

describe('Neware CFx 1200 s program-semantic profile', () => {
  it('counts a 1200.1 s controller overrun as reaching the time limit', () => {
    const analysis = buildNewareCfxGitt1200sProfile(dataset(14_400), [
      result('pulse', 1200.1, 2),
    ]);
    expect(analysis.programRecognized).toBe(true);
    expect(analysis.events[0]).toMatchObject({
      termination: 'time_limit_reached',
      postRestState: 'completed_standard_rest',
      isMainComparativeSequenceEvent: true,
    });
    expect(analysis.events[0].program).toMatchObject({
      stopVoltageV: 1.5,
      loopStartStepId: 2,
      loopCycleCount: 1000,
    });
  });

  it('recognizes an early event as Stop_Volt only with matching program evidence', () => {
    const analysis = buildNewareCfxGitt1200sProfile(dataset(14_400), [
      result('pulse', 600, 1.5008),
    ]);
    expect(analysis.events[0]).toMatchObject({
      termination: 'stop_voltage_terminated',
      postRestState: 'completed_standard_rest',
      isMainComparativeSequenceEvent: false,
    });
  });

  it('does not relabel an unexplained early event as a cutoff', () => {
    const analysis = buildNewareCfxGitt1200sProfile(dataset(14_400), [
      result('pulse', 600, 1.7),
    ]);
    expect(analysis.events[0]?.termination).toBe('unknown_early_termination');
  });

  it('keeps a final incomplete Rest distinct from the pulse termination', () => {
    const analysis = buildNewareCfxGitt1200sProfile(dataset(3_000), [
      result('pulse', 1200, 2),
    ]);
    expect(analysis.events[0]).toMatchObject({
      termination: 'time_limit_reached',
      postRestState: 'file_end_truncated',
      isMainComparativeSequenceEvent: false,
    });
    expect(analysis.summary.fileEndTruncatedRestCount).toBe(1);
  });
});
