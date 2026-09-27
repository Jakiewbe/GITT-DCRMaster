import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { normalizeLandCex, parseLandCex } from './cex';
import {
  buildNewareDcrEvents,
  buildNewareGittPulses,
  classifyNewareProfile,
} from '../neware/events';
import { buildNewareCfxGitt1200sProfile } from '../neware/gitt1200sProfile';
import { analyzeGittPulse } from '../../science/gitt';
import { createCf1MaterialPreset } from '../../science/material';
import {
  analyzeNewareDataset,
  resolveNewareMeasurementResolution,
  type WorkbenchSettings,
} from '../../app/analyze';

function cexAnalysisSettings(): WorkbenchSettings {
  return {
    electrodeDiameterCm: 1.2,
    electrodeDiameterStandardUncertaintyCm: null,
    activeMassStandardUncertaintyG: null,
    currentResolutionA: null,
    voltageResolutionV: null,
    material: createCf1MaterialPreset(),
    initialSocPct: null,
    initialSocSource: 'unknown',
    datasetStartsAtFreshCell: false,
  };
}

function voltageCodeToBytes(code: number): number[] {
  return [code & 0xff, (code >>> 8) & 0xff];
}

function float32Bytes(value: number): number[] {
  const buffer = new ArrayBuffer(4);
  new DataView(buffer).setFloat32(0, value, true);
  return [...new Uint8Array(buffer)];
}

function syntheticCex(): Uint8Array {
  const bytes = new Uint8Array(0x1c0);
  bytes.set([0x10, 0x11, 0x09, 0x88, 0x01, 0x00, 0x04, 0x00], 0);
  bytes.set(float32Bytes(0.000608), 0x1c);
  bytes.set([0xcc, 0xcc, 0xff, 0xff, 0x33], 0x100);
  bytes.set([0xcc, 0xcc, 0xff, 0xff, 0x44], 0x140);
  bytes.set([0xcc, 0xcc, 0xff, 0xff, 0x22], 0x180);
  bytes.set([0xcc, 0xcc, 0xff, 0xff, 0x33], 0x1c0 - 16);

  const writeRow = (offset: number, timeTick: number, voltageCode: number, currentCode: number, capacityRaw: number) => {
    const view = new DataView(bytes.buffer);
    view.setUint32(offset, timeTick, true);
    const voltageBytes = voltageCodeToBytes(voltageCode);
    bytes.set(voltageBytes, offset + 4);
    view.setInt16(offset + 6, currentCode, true);
    bytes.set(float32Bytes(capacityRaw), offset + 8);
    bytes.set(float32Bytes(capacityRaw * 3), offset + 12);
  };

  writeRow(0x110, 2, 0x4369, 0, 0);
  writeRow(0x120, 1000, 0x4368, 0, 0);
  writeRow(0x130, 1050, 0x4368, 0, 0);
  writeRow(0x150, 1100, 0x4369, -100, 0);
  writeRow(0x160, 2100, 0x4302, -100, 2.7777778e-6);
  writeRow(0x170, 3100, 0x4302, -100, 5.5555556e-6);
  writeRow(0x190, 3200, 0x4302, 0, 5.5555556e-6);
  writeRow(0x1a0, 4200, 0x4302, 0, 5.5555556e-6);
  return bytes;
}

describe('LAND CEX adapter', () => {
  it('parses the confirmed LAND record time, voltage-code, phase, and capacity fields', async () => {
    const parsed = await parseLandCex(syntheticCex());
    expect(parsed.records).toHaveLength(8);
    expect(parsed.records.map((record) => record.timeTick)).toEqual([2, 1000, 1050, 1100, 2100, 3100, 3200, 4200]);
    expect(parsed.records[0].voltageV).toBeCloseTo(17257 / 5376, 8);
    expect(parsed.records[3].rawCurrentCode).toBeLessThan(0);
    expect(parsed.metadata.activeMassMg).toBeCloseTo(0.608, 6);
  });

  it('normalizes contiguous rest and loaded segments without changing science-core algorithms', async () => {
    const dataset = await normalizeLandCex(syntheticCex(), 'synthetic.cex');
    expect(dataset.rows.map((row) => row.canonicalStepType)).toEqual([
      'rest',
      'rest',
      'rest',
      'discharge',
      'discharge',
      'discharge',
      'rest',
      'rest',
    ]);
    expect(dataset.rows[3].currentA).toBeLessThan(0);
    expect(dataset.rows[3].currentA).toBeCloseTo(-100 / 32_256_000, 15);
    expect(dataset.rows[4].elapsedTimeS).toBeCloseTo(20.98, 8);
    expect(dataset.rows[4].dischargeCapacityAh).toBeCloseTo(2.7777778e-6, 13);
    expect(dataset.metadata.parserProfileId).toBe('land-cex-binary-v1');
    expect(dataset.warnings.some((warning) => warning.includes('provisional'))).toBe(true);
  });

  it('exposes the official LAND raw-current-code scale to the science core', async () => {
    const dataset = await normalizeLandCex(syntheticCex(), 'synthetic.cex');
    const resolution = resolveNewareMeasurementResolution(dataset, {
      currentResolutionA: null,
      voltageResolutionV: null,
    });
    expect(resolution.currentA.value).toBeCloseTo(1 / 32_256_000, 15);
    expect(resolution.currentA.basisValue).toBe(32_256_000);
    expect(resolution.currentA.source).toBe('vendor_oracle_validated_raw_code_lsb');
    expect(resolution.currentA.provisional).toBe(true);
  });

  it('reads the two real user CEX files with monotonic records', async () => {
    const files = [
      '260429 GITT/FGS-1-6-DCR-0.48mg-14_003_7.cex',
      '260429 GITT/0.608mg-GITT-11_003_5.cex',
    ];
    for (const file of files) {
      const dataset = await normalizeLandCex(readFileSync(file), file);
      expect(dataset.rows.length).toBeGreaterThan(10);
      expect(dataset.rows.every((row, index) => index === 0 || row.elapsedTimeS >= dataset.rows[index - 1].elapsedTimeS)).toBe(true);
      expect(dataset.rows.every((row) => row.voltageV > 0 && row.voltageV < 5)).toBe(true);
    }
  });

  it('matches the official LAND voltage oracle for the real GITT trace', async () => {
    const dataset = await normalizeLandCex(
      readFileSync('260429 GITT/0.608mg-GITT-11_003_5.cex'),
      '0.608mg-GITT-11_003_5.cex',
    );
    expect(dataset.rows).toHaveLength(27142);
    expect(dataset.rows[0].voltageV).toBeCloseTo(3.21000742912292, 7);
    expect(dataset.rows[12].voltageV).toBeCloseTo(3.20963549613953, 6);
    expect(dataset.rows[13].voltageV).toBeCloseTo(3.19084811210632, 6);
    expect(dataset.rows[14].voltageV).toBeCloseTo(3.02845978736877, 6);
    expect(dataset.rows[13].currentA).toBeCloseTo(-1697 / 32_256_000, 15);
    expect(dataset.rows[0].elapsedTimeS).toBe(0);
    expect(dataset.rows[1].elapsedTimeS).toBeCloseTo(9.96, 8);
    expect(Math.max(...dataset.rows.map((row) => row.voltageV))).toBeLessThan(3.5);
  });

  it('classifies the real CEX files by their observed phase pattern', async () => {
    const dcr = await normalizeLandCex(
      readFileSync('260429 GITT/FGS-1-6-DCR-0.48mg-14_003_7.cex'),
      'FGS-1-6-DCR-0.48mg-14_003_7.cex',
    );
    const gitt = await normalizeLandCex(
      readFileSync('260429 GITT/0.608mg-GITT-11_003_5.cex'),
      '0.608mg-GITT-11_003_5.cex',
    );
    expect(dcr.metadata.remark).toBe('DCR');
    expect(gitt.metadata.remark).toBe('GITT');
    expect(dcr.metadata.programSteps).toEqual([]);
    expect(gitt.metadata.programSteps).toEqual([
      expect.objectContaining({ stepId: 2, durationMs: 1_200_000, stopVoltageV: 1.5 }),
      expect.objectContaining({ stepId: 3, durationMs: 14_400_000 }),
    ]);
    expect(classifyNewareProfile(dcr).vendorProfileId).toBe('land-cex-dcr-v1');
    expect(classifyNewareProfile(gitt).vendorProfileId).toBe('land-cex-gitt-v1');
    expect(dcr.rows.find((row) => row.currentA < 0)?.currentA).toBeCloseTo(-2680 / 32_256_000, 15);
  });

  it('feeds real CEX into the existing event builders without changing their formulas', async () => {
    const dcr = await normalizeLandCex(
      readFileSync('260429 GITT/FGS-1-6-DCR-0.48mg-14_003_7.cex'),
      'FGS-1-6-DCR-0.48mg-14_003_7.cex',
    );
    const gitt = await normalizeLandCex(
      readFileSync('260429 GITT/0.608mg-GITT-11_003_5.cex'),
      '0.608mg-GITT-11_003_5.cex',
    );
    expect(buildNewareDcrEvents(dcr).length).toBeGreaterThan(0);
    expect(buildNewareGittPulses(gitt, createCf1MaterialPreset(), 1.2).length).toBeGreaterThan(0);
  });

  it('recognizes the observed 20 min pulse and 4 h rest semantics for real CEX GITT', async () => {
    const gitt = await normalizeLandCex(
      readFileSync('260429 GITT/0.608mg-GITT-11_003_5.cex'),
      '0.608mg-GITT-11_003_5.cex',
    );
    const pulses = buildNewareGittPulses(gitt, createCf1MaterialPreset(), 1.2);
    expect(pulses.length).toBeGreaterThan(1);
    const firstPulse = pulses[0];
    expect(firstPulse.preRestRows.at(-1)?.stepElapsedTimeTicks).toBe(12_002n);
    expect(firstPulse.postRestRows.at(-1)?.stepElapsedTimeTicks).toBe(1_440_006n);
    const profile = buildNewareCfxGitt1200sProfile(
      gitt,
      pulses.map((pulse) => analyzeGittPulse(pulse)),
    );
    expect(profile.programRecognized).toBe(true);
    expect(profile.summary.mainComparativeSequenceCount).toBeGreaterThan(0);
    expect(profile.events.every((event) => event.postRestState === 'completed_standard_rest')).toBe(true);
  });

  it('produces computable GITT endpoint results from real CEX current codes', async () => {
    const gitt = await normalizeLandCex(
      readFileSync('260429 GITT/0.608mg-GITT-11_003_5.cex'),
      '0.608mg-GITT-11_003_5.cex',
    );
    const pulses = buildNewareGittPulses(gitt, createCf1MaterialPreset(), 1.2);
    const results = pulses.map((pulse) => analyzeGittPulse(pulse));
    const computed = results.filter((result) => result.calculationState === 'computed');
    expect(computed.length).toBeGreaterThan(0);
    expect(computed[0]?.pulseT0VoltageV).not.toBeNull();
    expect(computed[0]?.deltaEtV).not.toBeNull();
    expect(computed[0]?.metricValueCm2PerS).not.toBeNull();
  });

  it('makes real CEX results visible through the application analysis bundle', async () => {
    const gitt = await normalizeLandCex(
      readFileSync('260429 GITT/0.608mg-GITT-11_003_5.cex'),
      '0.608mg-GITT-11_003_5.cex',
    );
    const analysis = analyzeNewareDataset(gitt, cexAnalysisSettings());
    expect(analysis.measurementResolution.currentA.value).toBeCloseTo(1 / 32_256_000, 15);
    expect(analysis.gittResults.some((result) => result.metricValueCm2PerS !== null)).toBe(true);
    expect(analysis.cfxLiterature1200s?.comparativeProfile.summary.numericallyComputedComparativeIndexCount).toBeGreaterThan(0);
  });

  it('makes real CEX DCR results computable through the application analysis bundle', async () => {
    const dcr = await normalizeLandCex(
      readFileSync('260429 GITT/FGS-1-6-DCR-0.48mg-14_003_7.cex'),
      'FGS-1-6-DCR-0.48mg-14_003_7.cex',
    );
    const analysis = analyzeNewareDataset(dcr, cexAnalysisSettings());
    expect(analysis.dcrResults.some((result) => result.resistanceOhm !== null)).toBe(true);
  });

  it('rejects a file without validated CEX data rows', async () => {
    expect(() => parseLandCex(new Uint8Array([0x10, 0x11, 0x09, 0x88]))).toThrow(
      'land_cex_contains_no_valid_records',
    );
  });
});
