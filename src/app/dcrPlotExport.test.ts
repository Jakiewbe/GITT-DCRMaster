import { describe, expect, it } from 'vitest';
import type { CanonicalRowV1 } from '../science/contracts';
import type { DcrBatchEventV1 } from '../product/dcr';
import { buildDirectDcrPlotRowsV1, DCR_PLOT_TIME_MINUTES_V1 } from './dcrPlotExport';

function row(timeS: number, voltageV: number, sequence: number): CanonicalRowV1 {
  return {
    sourceFileId: 'source', sourceFileHash: 'hash', instrumentId: null, channelId: null,
    sourceStream: 'test', sourceSheet: null, sourceRowIndex: BigInt(sequence),
    sourceRecordSequence: BigInt(sequence), parserVersion: 'test', elapsedTimeTicks: BigInt(sequence),
    stepElapsedTimeTicks: BigInt(sequence), timeResolutionNs: 1_000_000_000n,
    recordSequence: BigInt(sequence), elapsedTimeS: timeS, rowId: `row-${sequence}`,
    voltageV, currentA: 0, temperatureC: null, vendorStepId: null, vendorStepType: null,
    analysisStepId: `step-${sequence}`, canonicalStepType: 'rest', chargeCapacityAh: null,
    dischargeCapacityAh: null, netCapacityAh: null,
  };
}

function event(eventId: string, resistanceOhm: number | null): DcrBatchEventV1 {
  return {
    eventKey: `dataset\u0000${eventId}`, eventId,
    dataset: {
      datasetId: 'dataset', fileName: 'dcr.ndax', fileSize: 1,
      importedAtIso: '2026-01-01T00:00:00.000Z', sourceFileHash: 'hash',
      canonicalDatasetHash: 'canonical', normalizationReceiptHash: 'receipt', configHash: 'config',
      analysisInputHash: 'input', resultHash: 'result', parserApprovalState: 'provisional',
      vendorProfileId: 'test', independentQualificationState: 'not-qualified', algorithmId: 'test',
      algorithmVersion: 'test', qcPolicyId: 'test',
    },
    state: 'usable', sourceResultCount: 1,
    points: [{
      key: 'terminal', requestedMetric: 'DCR_terminal', displayLabel: 'terminal', requestedOffsetS: null,
      state: resistanceOhm === null ? 'missing' : 'usable', scientificResult: null, sourceResults: [],
      sourceResultCount: 0, productIssueCodes: [], calculationState: resistanceOhm === null ? 'not_computable' : 'computed',
      qcStatus: resistanceOhm === null ? 'rejected' : 'valid', qcCodes: [], reportedResistanceOhm: resistanceOhm,
      comparisonResistanceOhm: resistanceOhm, auditCandidateResistanceOhm: null, actualElapsedFromTransitionS: null,
      transitionLatencyKnown: true, transitionTimeBasis: 'step_boundary_tick', baselineRowId: null, targetRowIds: [],
    }],
  };
}

describe('direct DCR plot export', () => {
  it('exports integer-minute time-voltage data and fixed DCR times', () => {
    const result = buildDirectDcrPlotRowsV1([{
      sourceId: 'dataset', fileName: 'dcr.ndax',
      canonicalRows: [row(120, 2.8, 2), row(0, 3.1, 1), row(61, 3, 3)],
      events: [event('1', 0.18), event('2', 0.19), event('3', 0.21), event('4', 0.23)],
    }]);

    expect(result.timeVoltage).toEqual([
      { 'dcr.ndax | Time / min': 0, 'dcr.ndax | Voltage / V': 3.1 },
      { 'dcr.ndax | Time / min': 1, 'dcr.ndax | Voltage / V': 3 },
      { 'dcr.ndax | Time / min': 2, 'dcr.ndax | Voltage / V': 2.8 },
    ]);
    expect(result.timeDcr).toEqual([
      { 'dcr.ndax | Time / min': 50, 'dcr.ndax | DCR / Ω': 0.18 },
      { 'dcr.ndax | Time / min': 150, 'dcr.ndax | DCR / Ω': 0.19 },
      { 'dcr.ndax | Time / min': 250, 'dcr.ndax | DCR / Ω': 0.21 },
      { 'dcr.ndax | Time / min': 350, 'dcr.ndax | DCR / Ω': 0.23 },
    ]);
    expect(DCR_PLOT_TIME_MINUTES_V1).toEqual([50, 150, 250, 350]);
  });

  it('keeps a missing DCR value blank instead of writing zero', () => {
    const result = buildDirectDcrPlotRowsV1([{
      sourceId: 'dataset', fileName: 'dcr.ndax', canonicalRows: [],
      events: [event('1', 0.18), event('2', 0.19), event('3', 0.21)],
    }]);
    expect(result.timeDcr.at(-1)).toEqual({
      'dcr.ndax | Time / min': 350,
      'dcr.ndax | DCR / Ω': null,
    });
  });
});
