import { describe, expect, it } from 'vitest';
import type { CanonicalRowV1, GittResultV1 } from '../../science/contracts';
import {
  buildGittOverviewVoltagePointsV1,
  buildGittPlotExportBundleV1,
  buildGittPulsePlotModelV1,
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
  pulseStartVoltageV: 2.98,
  pulseBaselineExtrapolatedV: 2.98,
  pulseEndVoltageV: 2.92,
  postRestEndPotentialV: 2.995,
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

  it('preserves endpoints and voltage extrema while downsampling a full profile', () => {
    const manyRows = Array.from({ length: 100 }, (_, index) =>
      row(`row-${index}`, 'overview', 'rest', index, index, index === 50 ? 2 : 3 + index / 1_000),
    );
    const points = buildGittOverviewVoltagePointsV1(manyRows, 20);
    expect(points[0].id).toBe('row-0');
    expect(points.at(-1)?.id).toBe('row-99');
    expect(points.some((point) => point.id === 'row-50')).toBe(true);
  });

  it('exports the four data tables needed to recreate the literature plots', () => {
    const bundle = buildGittPlotExportBundleV1(
      rows,
      [result],
      new Map([[result.pulseId, 1]]),
    );
    expect(bundle.fullTraceRows).toHaveLength(rows.length);
    expect(bundle.pulseResponseRows.map((point) => point.segment)).toContain('pulse');
    expect(bundle.sqrtFitRows.filter((point) => point.inAutomaticFitWindow)).toHaveLength(2);
    expect(bundle.whVoltageRows).toEqual([
      expect.objectContaining({ pulseOrder: 1, postRestEndPotentialV: 2.995 }),
    ]);
  });
});
