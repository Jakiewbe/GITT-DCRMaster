import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseNewareNdax } from './ndax';
import { classifyNewareProfile } from './events';
import { normalizeNewareNdax } from './normalize';
import { analyzeNewareDataset } from '../../app/analyze';
import { createCf1MaterialPreset } from '../../science/material';

const fixturePath = resolve(
  process.cwd(),
  '..',
  '260429 DCR',
  'CFx-DCR-1.136mg-1_127.0.0.1-BTS85-23-1-6-879.ndax',
);

const gittFixturePath = resolve(
  process.cwd(),
  '..',
  '260429 GITT',
  'CFx-GITT-200ma-1.032mg-2_127.0.0.1-BTS85-23-8-6-868.ndax',
);

const v14GittFixturePath = resolve(
  process.cwd(),
  '..',
  'FGS-1-6',
  '电化学数据',
  '260513 GITTDCR',
  'CFx-200ma-GITT-1.064mg-11_127.0.0.1_BTS85_25_6_4_1701.ndax',
);

describe.skipIf(!existsSync(fixturePath))('Neware NDAX real fixture', () => {
  it('matches the independently extracted first DCR pulse rows', async () => {
    const parsed = await parseNewareNdax(readFileSync(fixturePath));
    expect(parsed.records).toHaveLength(21_132);
    expect(parsed.metadata.channelId).toBe('6');
    expect(parsed.metadata.activeMassMg).toBeCloseTo(1.136, 12);
    expect(parsed.warnings).toEqual([]);

    const pre = parsed.records.find((record) => record.index === 2163);
    const pulse = parsed.records.filter((record) => record.stepOrdinal === 4);
    expect(pre).toMatchObject({
      stepOrdinal: 3,
      stepTimeMs: 1_800_000,
      voltageV: expect.closeTo(2.9031140804, 8),
      currentMa: 0,
    });
    expect(pulse.map((record) => record.stepTimeMs)).toEqual([0, 5000, 10000, 15000, 20000, 25000, 30000]);
    expect(pulse[0]).toMatchObject({
      index: 2164,
      voltageV: expect.closeTo(2.847672224, 8),
      currentMa: expect.closeTo(-0.9826195, 6),
    });
    expect(pulse[6]).toMatchObject({
      index: 2170,
      voltageV: expect.closeTo(2.2710061073, 8),
      currentMa: expect.closeTo(-0.9827206, 6),
    });
    expect(pre?.timestampMs).toBe(pulse[0].timestampMs);
  });

  it.skipIf(!existsSync(gittFixturePath))('retains the CFx 1200 s program limits as source evidence', async () => {
    const parsed = await parseNewareNdax(readFileSync(gittFixturePath));
    const pulse = parsed.metadata.programSteps.find((step) => step.stepId === 2);
    const postRest = parsed.metadata.programSteps.find((step) => step.stepId === 3);
    const loop = parsed.metadata.programSteps.find((step) => step.loop?.startStepId === 2);
    expect(parsed.metadata.parserProfileVersion).toBe('0.1.2-provisional');
    expect(pulse).toMatchObject({
      stepTypeCode: 2,
      recordIntervalMs: 10_000,
      durationMs: 1_200_000,
      stopVoltageRaw: 15_000,
      stopVoltageV: 1.5,
    });
    expect(postRest).toMatchObject({ stepTypeCode: 4, recordIntervalMs: 30_000, durationMs: 14_400_000 });
    expect(loop?.loop).toMatchObject({ startStepId: 2, cycleCount: 1000 });
  });

  it.skipIf(!existsSync(v14GittFixturePath))('imports a v14 GITT file with sparse run-info anchors', async () => {
    const parsed = await parseNewareNdax(readFileSync(v14GittFixturePath));
    expect(parsed.metadata.ndcVersion).toBe(14);
    expect(parsed.metadata.parserProfileId).toBe('neware-ndax-ndc14-v1');
    expect(parsed.records.length).toBeGreaterThan(100_000);
    expect(parsed.records[0]).toMatchObject({
      index: 1,
      stepOrdinal: 1,
      stepIndex: 1,
      status: 'Rest',
      stepTimeMs: 0,
      voltageV: expect.closeTo(3.0172657967, 8),
      currentMa: 0,
    });
    expect(parsed.records[25]).toMatchObject({
      index: 26,
      stepOrdinal: 2,
      stepIndex: 2,
      status: 'CC_DChg',
      stepTimeMs: 0,
      voltageV: expect.closeTo(2.9765748978, 8),
      currentMa: expect.closeTo(-0.21276045, 7),
    });
    expect(parsed.records.at(-1)?.index).toBe(parsed.records.length);
    expect(parsed.warnings).toEqual(['neware_runinfo_sparse_interpolated:anchors=9347:data=120691']);

    const normalized = await normalizeNewareNdax(readFileSync(v14GittFixturePath), 'v14-gitt-fixture');
    expect(normalized.rows).toHaveLength(120_691);
    expect(classifyNewareProfile(normalized).analysisKind).toBe('gitt');
    expect(normalized.rows[25]).toMatchObject({
      elapsedTimeS: 120,
      stepElapsedTimeTicks: 0n,
      currentA: expect.closeTo(-0.00021276045, 10),
      dischargeCapacityAh: 0,
    });

    const analysis = analyzeNewareDataset(normalized, {
      electrodeDiameterCm: 1.2,
      electrodeDiameterStandardUncertaintyCm: null,
      activeMassStandardUncertaintyG: null,
      currentResolutionA: null,
      voltageResolutionV: null,
      material: createCf1MaterialPreset(),
      initialSocPct: null,
      initialSocSource: 'unknown',
      datasetStartsAtFreshCell: false,
      activeMassOverrideG: null,
      activeMassSourceId: null,
      regressionManualWindow: undefined,
    });
    expect(analysis.classification.analysisKind).toBe('gitt');
    expect(analysis.gittResults.length).toBeGreaterThan(1);
    expect(analysis.cfxLiterature1200s?.comparativeProfile.pulses.length).toBeGreaterThan(1);
  }, 30_000);
});
