import { describe, expect, it } from 'vitest';
import type { GittPlotExportBundleV1 } from '../product/gitt/literaturePlotModel';
import { buildDirectGittPlotRowsV1 } from './gittPlotExport';

function bundle(overrides: Partial<GittPlotExportBundleV1>): GittPlotExportBundleV1 {
  return {
    fullTraceRows: [],
    pulseResponseRows: [],
    tauVoltageRows: [],
    sqrtFitRows: [],
    regressionWindowRows: [],
    whVoltageRows: [],
    ...overrides,
  } as GittPlotExportBundleV1;
}

function whRow(overrides: Partial<GittPlotExportBundleV1['whVoltageRows'][number]>): GittPlotExportBundleV1['whVoltageRows'][number] {
  return {
    pulseId: 'pulse',
    pulseOrder: 1,
    medianVoltageV: null,
    postRestEndPotentialV: null,
    whEndpointResultCm2PerS: null,
    ...overrides,
  } as GittPlotExportBundleV1['whVoltageRows'][number];
}

describe('direct GITT plot export rows', () => {
  it('exports one adjacent X/Y pair per sample for the complete GITT time trace', () => {
    const result = buildDirectGittPlotRowsV1([
      {
        sourceId: 'file-a-id',
        fileName: 'a.ndax',
        bundle: bundle({
          fullTraceRows: [
            { rowId: 'a-2', timeMinutes: 2, voltageV: 2.8, currentA: 0, analysisStepId: 's2', stepType: 'rest' },
            { rowId: 'a-0', timeMinutes: 0, voltageV: 3.0, currentA: 0, analysisStepId: 's1', stepType: 'rest' },
            { rowId: 'a-1', timeMinutes: 1, voltageV: 2.9, currentA: 0, analysisStepId: 's1', stepType: 'discharge' },
          ],
          pulseResponseRows: [
            { pulseId: 'a-p1', pulseOrder: 1, segment: 'pre_rest', timeMinutes: 0, voltageV: 3.0 },
            { pulseId: 'a-p1', pulseOrder: 1, segment: 'pulse', timeMinutes: 1, voltageV: 2.9 },
            { pulseId: 'a-p2', pulseOrder: 2, segment: 'pulse', timeMinutes: 0, voltageV: 2.8 },
          ],
        }),
        eligibleMedianPulseIds: new Set(),
      },
      {
        sourceId: 'file-b-id',
        fileName: 'b.ndax',
        bundle: bundle({
          fullTraceRows: [{ rowId: 'b-0', timeMinutes: 0, voltageV: 2.6, currentA: 0, analysisStepId: 's1', stepType: 'rest' }],
          pulseResponseRows: [{ pulseId: 'b-p1', pulseOrder: 1, segment: 'pulse', timeMinutes: 0, voltageV: 2.6 }],
        }),
        eligibleMedianPulseIds: new Set(),
      },
    ]);

    expect(Object.keys(result.timeVoltage[0])).toEqual([
      'a.ndax | Time / min',
      'a.ndax | Voltage / V',
      'b.ndax | Time / min',
      'b.ndax | Voltage / V',
    ]);
    expect(result.timeVoltage).toEqual([
      {
        'a.ndax | Time / min': 0,
        'a.ndax | Voltage / V': 3.0,
        'b.ndax | Time / min': 0,
        'b.ndax | Voltage / V': 2.6,
      },
      {
        'a.ndax | Time / min': 1,
        'a.ndax | Voltage / V': 2.9,
        'b.ndax | Time / min': null,
        'b.ndax | Voltage / V': null,
      },
      {
        'a.ndax | Time / min': 2,
        'a.ndax | Voltage / V': 2.8,
        'b.ndax | Time / min': null,
        'b.ndax | Voltage / V': null,
      },
    ]);
    expect(result.timeVoltage.every((row) => !('fileName' in row))).toBe(true);
    expect(result.timeVoltage.every((row) => !('seriesId' in row))).toBe(true);
    expect(Object.keys(result.pulseResponse[0])).toEqual([
      'a.ndax | Time / min',
      'a.ndax | Voltage / V',
      'b.ndax | Time / min',
      'b.ndax | Voltage / V',
    ]);
    expect(result.pulseResponse).toEqual([
      {
        'a.ndax | Time / min': 0,
        'a.ndax | Voltage / V': 3.0,
        'b.ndax | Time / min': 0,
        'b.ndax | Voltage / V': 2.6,
      },
      {
        'a.ndax | Time / min': 1,
        'a.ndax | Voltage / V': 2.9,
        'b.ndax | Time / min': null,
        'b.ndax | Voltage / V': null,
      },
      {
        'a.ndax | Time / min': null,
        'a.ndax | Voltage / V': null,
        'b.ndax | Time / min': null,
        'b.ndax | Voltage / V': null,
      },
      {
        'a.ndax | Time / min': 0,
        'a.ndax | Voltage / V': 2.8,
        'b.ndax | Time / min': null,
        'b.ndax | Voltage / V': null,
      },
    ]);
  });

  it('keeps all tau pulses in one sample pair and separates pulses with an empty row', () => {
    const result = buildDirectGittPlotRowsV1([
      {
        sourceId: 'file-a-id',
        fileName: 'a.ndax',
        bundle: bundle({
          tauVoltageRows: [
            { pulseId: 'p2', pulseOrder: 2, sqrtTauSqrtS: 2, voltageV: 2.8 },
            { pulseId: 'p1', pulseOrder: 1, sqrtTauSqrtS: 2, voltageV: 2.85 },
            { pulseId: 'p1', pulseOrder: 1, sqrtTauSqrtS: 1, voltageV: 2.9 },
          ],
          whVoltageRows: [
            whRow({ pulseId: 'p2', pulseOrder: 2, medianVoltageV: 2.6, whEndpointResultCm2PerS: 2e-12 }),
            whRow({ pulseId: 'p1', pulseOrder: 1, medianVoltageV: 2.8, whEndpointResultCm2PerS: 1e-12 }),
          ],
        }),
        eligibleMedianPulseIds: new Set(['p1', 'p2']),
      },
      {
        sourceId: 'file-a-id-2',
        fileName: 'a.ndax',
        bundle: bundle({
          tauVoltageRows: [{ pulseId: 'p1b', pulseOrder: 1, sqrtTauSqrtS: 3, voltageV: 2.4 }],
          whVoltageRows: [
            whRow({ pulseId: 'p1b', pulseOrder: 1, medianVoltageV: 2.7, whEndpointResultCm2PerS: 3e-12 }),
            whRow({ pulseId: 'p2b', pulseOrder: 2, medianVoltageV: 2.5, whEndpointResultCm2PerS: 4e-12 }),
          ],
        }),
        eligibleMedianPulseIds: new Set(['p1b', 'p2b']),
      },
    ]);

    expect(Object.keys(result.tauVoltage[0])).toEqual([
      'a.ndax | τ¹ᐟ² / s¹ᐟ²',
      'a.ndax | Voltage / V',
      'a.ndax [2] | τ¹ᐟ² / s¹ᐟ²',
      'a.ndax [2] | Voltage / V',
    ]);
    expect(result.tauVoltage).toEqual([
      {
        'a.ndax | τ¹ᐟ² / s¹ᐟ²': 1,
        'a.ndax | Voltage / V': 2.9,
        'a.ndax [2] | τ¹ᐟ² / s¹ᐟ²': 3,
        'a.ndax [2] | Voltage / V': 2.4,
      },
      {
        'a.ndax | τ¹ᐟ² / s¹ᐟ²': 2,
        'a.ndax | Voltage / V': 2.85,
        'a.ndax [2] | τ¹ᐟ² / s¹ᐟ²': null,
        'a.ndax [2] | Voltage / V': null,
      },
      {
        'a.ndax | τ¹ᐟ² / s¹ᐟ²': null,
        'a.ndax | Voltage / V': null,
        'a.ndax [2] | τ¹ᐟ² / s¹ᐟ²': null,
        'a.ndax [2] | Voltage / V': null,
      },
      {
        'a.ndax | τ¹ᐟ² / s¹ᐟ²': 2,
        'a.ndax | Voltage / V': 2.8,
        'a.ndax [2] | τ¹ᐟ² / s¹ᐟ²': null,
        'a.ndax [2] | Voltage / V': null,
      },
    ]);
    expect(result.medianDli).toEqual([
      {
        'a.ndax | Median voltage / V': 2.8,
        'a.ndax | D_Li / cm²·s^-1': 1e-12,
        'a.ndax [2] | Median voltage / V': 2.7,
        'a.ndax [2] | D_Li / cm²·s^-1': 3e-12,
      },
      {
        'a.ndax | Median voltage / V': 2.6,
        'a.ndax | D_Li / cm²·s^-1': 2e-12,
        'a.ndax [2] | Median voltage / V': 2.5,
        'a.ndax [2] | D_Li / cm²·s^-1': 4e-12,
      },
    ]);
    expect(result.medianDliCommon).toEqual([
      {
        'a.ndax | Median voltage / V': 2.6,
        'a.ndax | D_Li / cm²·s^-1': 2e-12,
        'a.ndax [2] | Median voltage / V': 2.7,
        'a.ndax [2] | D_Li / cm²·s^-1': 3e-12,
      },
    ]);
    expect(result.commonVoltageWindow).toEqual({ minV: 2.6, maxV: 2.7, sampleCount: 2, status: 'available' });
  });

  it('does not fabricate a common range when samples do not overlap or lack eligible data', () => {
    const makeSource = (sourceId: string, fileName: string, rows: GittPlotExportBundleV1['whVoltageRows']) => ({
      sourceId,
      fileName,
      bundle: bundle({ whVoltageRows: rows }),
      eligibleMedianPulseIds: new Set(rows.map((row) => row.pulseId)),
    });

    const noOverlap = buildDirectGittPlotRowsV1([
      makeSource('a', 'a.ndax', [whRow({ pulseId: 'a1', pulseOrder: 1, medianVoltageV: 3.0, whEndpointResultCm2PerS: 1e-12 })]),
      makeSource('b', 'b.ndax', [whRow({ pulseId: 'b1', pulseOrder: 1, medianVoltageV: 2.0, whEndpointResultCm2PerS: 2e-12 })]),
    ]);
    expect(noOverlap.commonVoltageWindow).toEqual({ minV: 3.0, maxV: 2.0, sampleCount: 2, status: 'no_overlap' });
    expect(noOverlap.medianDliCommon).toEqual([]);

    const missingData = buildDirectGittPlotRowsV1([
      makeSource('a', 'a.ndax', [whRow({ pulseId: 'a1', pulseOrder: 1, medianVoltageV: 3.0, whEndpointResultCm2PerS: 1e-12 })]),
      makeSource('b', 'b.ndax', []),
    ]);
    expect(missingData.commonVoltageWindow).toEqual({ minV: null, maxV: null, sampleCount: 1, status: 'no_eligible_data' });
    expect(missingData.medianDliCommon).toEqual([]);
  });
});
