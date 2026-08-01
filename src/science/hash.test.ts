import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import type { AnalysisVersionsV1, CanonicalRowV1 } from './contracts';
import {
  canonicalizeScientificJson,
  createRowId,
  hashAnalysisInput,
  hashCanonicalDataset,
  hashCanonicalValue,
  sha256Hex,
} from './hash';

function row(overrides: Partial<CanonicalRowV1> = {}): CanonicalRowV1 {
  return {
    sourceFileId: 'display-only-file-id',
    sourceFileHash: 'a'.repeat(64),
    instrumentId: 'BTS85',
    channelId: '23-1-6-879',
    sourceStream: 'record',
    sourceSheet: 'record',
    sourceRowIndex: 2n,
    sourceRecordSequence: 1n,
    parserVersion: 'neware-1',
    elapsedTimeTicks: 5_000n,
    stepElapsedTimeTicks: 0n,
    timeResolutionNs: 1_000_000n,
    recordSequence: 1n,
    elapsedTimeS: 5,
    rowId: 'row-1',
    voltageV: 3.1,
    currentA: -0.001,
    temperatureC: null,
    vendorStepId: '2',
    vendorStepType: 'CC_DChg',
    analysisStepId: 'step-2',
    canonicalStepType: 'discharge',
    chargeCapacityAh: 0,
    dischargeCapacityAh: 0.001,
    netCapacityAh: -0.001,
    ...overrides,
  };
}

describe('scientific canonical JSON and SHA-256', () => {
  it('matches standard SHA-256 vectors', () => {
    expect(sha256Hex('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    expect(sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });

  it('normalizes strings, bigint, negative zero, key order, and undefined', () => {
    const decomposedEAcute = 'e\u0301';
    expect(
      canonicalizeScientificJson({ z: undefined, b: -0, a: [3n, decomposedEAcute] }),
    ).toBe('{"a":["3","é"],"b":0,"z":null}');
    expect(() => canonicalizeScientificJson({ value: Number.NaN })).toThrow(/NaN/);
  });

  it('matches the independent Python reference vector when Python is available', () => {
    const script = fileURLToPath(new URL('../../tests/reference_hash.py', import.meta.url));
    const command = process.platform === 'win32' ? 'python' : 'python3';
    const result = spawnSync(command, [script], {
      encoding: 'utf8',
      env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
    });
    if (result.error && (result.error as NodeJS.ErrnoException).code === 'ENOENT') return;
    expect(result.status, result.stderr).toBe(0);
    const reference = JSON.parse(result.stdout) as { canonical: string; sha256: string };
    const input = { a: [3, null, 'é'], b: -0, big: 9_007_199_254_740_993n, nested: { α: true } };
    expect(canonicalizeScientificJson(input)).toBe(reference.canonical);
    expect(hashCanonicalValue(input)).toBe(reference.sha256);
  });
});

describe('scientific identity hashes', () => {
  it('excludes app build metadata but includes scientific versions in analysis input identity', () => {
    const versions: AnalysisVersionsV1 = {
      appVersion: '0.1.0-alpha.1',
      buildCommit: 'build-a',
      scientificContractVersion: '1.2.0',
      canonicalSchemaVersion: '1.0.0',
      parserVersion: 'parser-1',
      vendorProfileId: 'vendor-1',
      vendorProfileVersion: 'vendor-1.0',
      stepSegmentationVersion: '1.0.0',
      socContractVersion: '1.0.0',
      algorithmId: 'ALGORITHM',
      algorithmVersion: '1.0.0',
      qcPolicyId: 'POLICY',
      materialPresetId: 'MATERIAL',
      uncertaintyModelVersion: '1.0.0',
      manifestSchemaVersion: '1.0.0',
      oraclePackVersion: '1.0.0',
    };
    const input = { canonicalDatasetHash: 'canonical', configHash: 'config', versions };

    expect(
      hashAnalysisInput({ ...input, versions: { ...versions, appVersion: '9.9.9', buildCommit: 'build-b' } }),
    ).toBe(hashAnalysisInput(input));
    expect(
      hashAnalysisInput({ ...input, versions: { ...versions, qcPolicyId: 'POLICY_R2' } }),
    ).not.toBe(hashAnalysisInput(input));
  });

  it('derives row identity from source position rather than scientific values', () => {
    const source = row();
    const first = createRowId(source);
    expect(createRowId({ ...source, voltageV: 99 } as CanonicalRowV1)).toBe(first);
    expect(createRowId({ ...source, sourceRowIndex: 3n })).not.toBe(first);
  });

  it('orders canonical rows and excludes display/path/parser-only evidence', () => {
    const first = row();
    const second = row({
      rowId: 'row-2',
      sourceRowIndex: 3n,
      sourceRecordSequence: 2n,
      recordSequence: 2n,
      elapsedTimeTicks: 6_000n,
      elapsedTimeS: 6,
    });
    const expected = hashCanonicalDataset([first, second]);

    expect(hashCanonicalDataset([second, first])).toBe(expected);
    expect(
      hashCanonicalDataset([
        { ...first, sourceFileId: 'C:/moved/file.ndax', parserVersion: 'neware-2', elapsedTimeS: 999 },
        second,
      ]),
    ).toBe(expected);
    expect(hashCanonicalDataset([{ ...first, voltageV: 3.2 }, second])).not.toBe(expected);
  });
});
