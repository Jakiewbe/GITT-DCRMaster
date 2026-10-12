import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { createRowId, hashCanonicalDataset, hashCanonicalValue } from '../../src/science/hash';
import { createCf1MaterialPreset } from '../../src/science/material';
import type { CanonicalRowV1 } from '../../src/science/contracts';
import type { WorkbenchSettings } from '../../src/app/analyze';
import type { WorkbenchDatasetV1 } from '../../src/app/project';
import { createDefaultWorkbenchRecipe } from '../../src/app/recipe';
import { createProjectArchive, openProjectFile } from '../../src/app/projectArchive';

describe('synthetic large-data stress (not instrument qualification)', () => {
  it('hashes JSON larger than the engine string limit using bounded blocks', () => {
    const item = 'x'.repeat(160);
    const count = 3_500_000;
    const values = Array.from({ length: count }, () => item);
    // The reference also streams, but uses Node's independently implemented SHA-256.
    const reference = createHash('sha256').update('[');
    const token = JSON.stringify(item);
    const batch = (token + ',').repeat(10_000);
    for (let index = 0; index < count - 1; index += 10_000) {
      const size = Math.min(10_000, count - 1 - index);
      reference.update(size === 10_000 ? batch : (token + ',').repeat(size));
    }
    reference.update(token + ']');
    expect(hashCanonicalValue(values)).toBe(reference.digest('hex'));
    console.info(`Synthetic hash: ${count} items, ${count * 163 + 1} canonical bytes.`);
  }, 180_000);

  it('saves and restores 500000 full canonical rows without whole-project strings', async () => {
    const source = { sourceFileId: 'synthetic-stress', sourceFileHash: 'c'.repeat(64), channelId: null,
      instrumentId: null, sourceStream: 'synthetic', sourceSheet: null, parserVersion: 'synthetic' };
    const rows: CanonicalRowV1[] = Array.from({ length: 500_000 }, (_, index) => {
      const identity = { ...source, sourceRowIndex: BigInt(index), sourceRecordSequence: BigInt(index) };
      return { ...identity, rowId: createRowId(identity), elapsedTimeTicks: BigInt(index), stepElapsedTimeTicks: BigInt(index),
        timeResolutionNs: 1_000_000n, recordSequence: BigInt(index), elapsedTimeS: index / 1000, voltageV: 3.1,
        currentA: 0, temperatureC: null, vendorStepId: '1', vendorStepType: 'Rest', analysisStepId: 'rest-1',
        canonicalStepType: 'rest', chargeCapacityAh: 0, dischargeCapacityAh: 0, netCapacityAh: 0 };
    });
    const dataset: WorkbenchDatasetV1 = { id: source.sourceFileHash, fileName: 'synthetic-stress.ndax', fileSize: 0, importedAtIso: '2026-10-12T00:00:00Z',
      canonical: { rows, sourceFileHash: source.sourceFileHash, canonicalDatasetHash: hashCanonicalDataset(rows),
        normalizationReceiptHash: 'd'.repeat(64), warnings: [], metadata: {
          parserProfileId: 'synthetic', parserProfileVersion: 'synthetic', approvalState: 'provisional',
          instrumentId: null, channelId: null, testId: null, testGuid: null, clientVersion: null,
          serverVersion: null, firmwareVersion: null, activeMassMg: null, remark: null,
          currentRangeMa: null, voltageRangeV: null, sourceTimeResolutionNs: 1_000_000n, programSteps: [],
        } } };
    const settings: WorkbenchSettings = { electrodeDiameterCm: 1.2, electrodeDiameterStandardUncertaintyCm: null,
      activeMassStandardUncertaintyG: null, currentResolutionA: null, voltageResolutionV: null,
      material: createCf1MaterialPreset(), initialSocPct: null, initialSocSource: 'unknown', datasetStartsAtFreshCell: false };
    const archive = await createProjectArchive(settings, [dataset], createDefaultWorkbenchRecipe());
    const opened = await openProjectFile(archive);
    expect(opened.datasets[0].canonical.rows.length).toBe(rows.length);
    expect(opened.datasets[0].canonical.canonicalDatasetHash).toBe(dataset.canonical.canonicalDatasetHash);
    expect(opened.datasets[0].canonical.rows.at(-1)).toEqual(rows.at(-1));
    console.info(`Synthetic archive: ${rows.length} rows, ${archive.size} bytes; canonical hash preserved.`);
  }, 180_000);
});
