import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { analyzeDcrEventV1 } from '../../science/dcr';
import { buildNewareDcrEvents, classifyNewareProfile } from './events';
import { normalizeNewareNdax } from './normalize';

const dataDirectory = resolve(process.cwd(), '..', '260429 DCR');
const dcrFixture = resolve(
  dataDirectory,
  'CFx-DCR-1.136mg-1_127.0.0.1-BTS85-23-1-6-879.ndax',
);

describe.skipIf(!existsSync(dcrFixture))('Neware canonical integration', () => {
  it('creates stable canonical hashes and exactly four DCR events', async () => {
    const bytes = readFileSync(dcrFixture);
    const first = await normalizeNewareNdax(bytes, 'fixture-dcr-879');
    const second = await normalizeNewareNdax(bytes, 'fixture-dcr-879');
    expect(first.sourceFileHash).toBe('898b61e30127de6a48f8ffbb3e7bfcbdaa69ad75454f32be7790c1dc37d056cc');
    expect(first.canonicalDatasetHash).toBe(second.canonicalDatasetHash);
    expect(first.rows.map((row) => row.rowId)).toEqual(second.rows.map((row) => row.rowId));
    expect(classifyNewareProfile(first).analysisKind).toBe('dcr');
    expect(buildNewareDcrEvents(first)).toHaveLength(4);
  }, 15_000);

  it('reproduces the independently calculated first-pulse DCR values', async () => {
    const dataset = await normalizeNewareNdax(readFileSync(dcrFixture), 'fixture-dcr-879');
    const event = buildNewareDcrEvents(dataset)[0];
    expect(event.config.currentResolutionEvidence).toMatchObject({
      source: 'record_storage_float32_full_scale_bound',
      provisional: true,
    });
    expect(event.config.voltageResolutionEvidence).toMatchObject({
      source: 'record_storage_float32_full_scale_bound',
      provisional: true,
    });
    const results = analyzeDcrEventV1(event);
    const candidates = Object.fromEntries(
      results.map((result) => [result.requestedMetric, result.diagnosticCandidateResistanceOhm]),
    );
    // Raw NDC float32 values, independently reproduced with Python struct.unpack.
    expect(candidates.DCR_first_sample).toBeCloseTo(56.42250934378531, 11);
    expect(candidates.DCR_5s).toBeCloseTo(500.9170483918735, 11);
    expect(candidates.DCR_10s).toBeCloseTo(632.5288220307922, 11);
    expect(candidates.DCR_30s).toBeCloseTo(643.2224468003695, 11);

    // The laboratory worksheet rounds current to 1e-10 A before division.
    // Its published values remain a display-rounding oracle with propagated tolerance.
    expect(candidates.DCR_first_sample).toBeCloseTo(56.4225077968, 4);
    expect(candidates.DCR_5s).toBeCloseTo(500.9170683325, 4);
    expect(candidates.DCR_10s).toBeCloseTo(632.5288482203, 4);
    expect(candidates.DCR_30s).toBeCloseTo(643.2224714736, 4);
    for (const result of results) {
      expect(result.qcStatus).not.toBe('valid');
      expect(result.qcCodes).toEqual(
        expect.arrayContaining([
          'current_resolution_inferred_from_record_storage',
          'voltage_resolution_inferred_from_record_storage',
        ]),
      );
    }
  }, 15_000);
});
