import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { expect, test } from 'vitest';
import { normalizeNewareNdax } from '../../src/adapters/neware/normalize';
import { analyzeNewareDataset } from '../../src/app/analyze';
import { createCf1MaterialPreset } from '../../src/science/material';
import { buildGittPulsePlotModelV1 } from '../../src/product/gitt/literaturePlotModel';

const root = process.cwd();
const filePath = path.resolve(
  root,
  '260429 GITT',
  'CFx-GITT-200ma-1.032mg-2_127.0.0.1-BTS85-23-8-6-868.ndax',
);
const settings = {
  electrodeDiameterCm: 1.2,
  electrodeDiameterStandardUncertaintyCm: null,
  activeMassStandardUncertaintyG: null,
  currentResolutionA: null,
  voltageResolutionV: null,
  material: createCf1MaterialPreset(),
  initialSocPct: null,
  initialSocSource: 'unknown' as const,
  datasetStartsAtFreshCell: false,
  activeMassOverrideG: null,
  activeMassSourceId: null,
  regressionManualWindow: undefined,
};

test.skipIf(!fs.existsSync(filePath))('real GITT pulse detail contains the complete pre-rest, pulse, and post-rest trace', async () => {
  expect(fs.existsSync(filePath)).toBe(true);
  const fileName = path.basename(filePath);
  const dataset = await normalizeNewareNdax(fs.readFileSync(filePath), fileName);
  const analysis = analyzeNewareDataset(dataset, settings);
  expect(analysis.gittResults.length).toBeGreaterThan(1);
  const result = analysis.gittResults[1];
  expect(result).toBeDefined();
  const model = buildGittPulsePlotModelV1(dataset.rows, result);
  expect(model).not.toBeNull();
  expect(model?.timeline.some((point) => point.segment === 'pre_rest')).toBe(true);
  expect(model?.timeline.some((point) => point.segment === 'pulse')).toBe(true);
  expect(model?.timeline.some((point) => point.segment === 'post_rest')).toBe(true);
  expect(model?.pulseStartMinutes ?? 0).toBeGreaterThan(100);
  expect(model?.timeline.at(-1)?.timeMinutes ?? 0).toBeGreaterThan(400);
});

test.skipIf(!fs.existsSync(filePath))('real low-rate CFx data keeps post-Stop_Volt events available for median-target selection', async () => {
  expect(fs.existsSync(filePath)).toBe(true);
  const fileName = path.basename(filePath);
  const dataset = await normalizeNewareNdax(fs.readFileSync(filePath), fileName);
  const analysis = analyzeNewareDataset(dataset, settings);
  const cfx = analysis.cfxLiterature1200s;
  expect(cfx).not.toBeNull();
  expect(cfx?.programExecution.summary.postProtocolCutoffEventCount ?? 0).toBeGreaterThan(0);
  expect(analysis.gittResults).toHaveLength(cfx?.programExecution.allEvents.length ?? 0);
  expect(cfx?.comparativeProfile.pulses).toHaveLength(cfx?.programExecution.allEvents.length ?? 0);
});
