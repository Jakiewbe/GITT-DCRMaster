import { describe, expect, it } from 'vitest';
import { BlobReader, BlobWriter, TextReader, TextWriter, ZipReader, ZipWriter } from '@zip.js/zip.js';
import { createRowId, hashCanonicalDataset } from '../science/hash';
import { createCf1MaterialPreset } from '../science/material';
import type { CanonicalRowV1 } from '../science/contracts';
import { createProjectArchive, openProjectFile, PROJECT_ROW_PAGE_SIZE } from './projectArchive';
import { serializeWorkbenchProject, type WorkbenchDatasetV1 } from './project';
import type { WorkbenchSettings } from './analyze';
import { createDefaultWorkbenchRecipe } from './recipe';

const settings: WorkbenchSettings = { electrodeDiameterCm: 1.2, electrodeDiameterStandardUncertaintyCm: null,
  activeMassStandardUncertaintyG: null, currentResolutionA: null, voltageResolutionV: null,
  material: createCf1MaterialPreset(), initialSocPct: null, initialSocSource: 'unknown', datasetStartsAtFreshCell: false };

function fixture(count = 1): WorkbenchDatasetV1 {
  const source = { sourceFileId: 'synthetic.ndax', sourceFileHash: 'a'.repeat(64), instrumentId: null,
    channelId: '1', sourceStream: 'synthetic', sourceSheet: null, parserVersion: 'synthetic' };
  const rows: CanonicalRowV1[] = Array.from({ length: count }, (_, index) => {
    const record = { ...source, sourceRowIndex: BigInt(index), sourceRecordSequence: BigInt(index) };
    return { ...record, rowId: createRowId(record), elapsedTimeTicks: BigInt(index), stepElapsedTimeTicks: BigInt(index),
      timeResolutionNs: 1_000_000n, recordSequence: BigInt(index), elapsedTimeS: index / 1000, voltageV: 3.1,
      currentA: 0, temperatureC: null, vendorStepId: '1', vendorStepType: 'Rest', analysisStepId: 'rest-1',
      canonicalStepType: 'rest', chargeCapacityAh: 0, dischargeCapacityAh: 0, netCapacityAh: 0 };
  });
  return { id: source.sourceFileHash, fileName: 'synthetic.ndax', fileSize: 128, importedAtIso: '2026-10-12T00:00:00Z', displayColor: '#43b5c5',
    canonical: { rows, sourceFileHash: source.sourceFileHash, canonicalDatasetHash: hashCanonicalDataset(rows),
      normalizationReceiptHash: 'b'.repeat(64), warnings: [], metadata: { parserProfileId: 'neware-ndax-ndc17-v1',
        parserProfileVersion: '0.1.1-provisional', approvalState: 'provisional', instrumentId: null, channelId: '1',
        testId: null, testGuid: null, clientVersion: null, serverVersion: null, firmwareVersion: null,
        activeMassMg: 1, remark: null, currentRangeMa: null, voltageRangeV: null, sourceTimeResolutionNs: 1_000_000n, programSteps: [] } } };
}

describe('bounded-page project storage', () => {
  it('preserves full rows, bigint, colors and canonical hash across several pages', async () => {
    const original = fixture(PROJECT_ROW_PAGE_SIZE * 2 + 1);
    const blob = await createProjectArchive(settings, [original], createDefaultWorkbenchRecipe());
    const reader = new ZipReader(new BlobReader(blob), { useWebWorkers: false });
    const entries = await reader.getEntries();
    expect(entries.map((entry) => entry.filename)).toEqual(['datasets/0/rows-0.json', 'datasets/0/rows-1.json', 'datasets/0/rows-2.json', 'manifest.json']);
    await reader.close();
    const opened = await openProjectFile(blob);
    expect(opened.datasets[0]).toEqual(original);
    expect(opened.settings).toEqual(settings);
    expect(opened.recipe).toEqual(createDefaultWorkbenchRecipe());
  }, 30_000);
  it('continues to read legacy JSON projects', async () => {
    const original = fixture();
    const opened = await openProjectFile(new Blob([serializeWorkbenchProject(settings, [original])]));
    expect(opened.datasets[0]).toEqual(original);
  });
  it('rejects a modified row instead of restoring unverified data', async () => {
    const archive = await createProjectArchive(settings, [fixture()], createDefaultWorkbenchRecipe());
    const reader = new ZipReader(new BlobReader(archive), { useWebWorkers: false });
    const entries = await reader.getEntries();
    const writer = new ZipWriter(new BlobWriter(), { useWebWorkers: false, level: 0 });
    for (const entry of entries) {
      if (entry.directory) continue;
      const text = await entry.getData(new TextWriter());
      await writer.add(entry.filename, new TextReader(entry.filename.includes('rows-') ? text.replace('"voltageV":3.1', '"voltageV":3.2') : text));
    }
    await reader.close();
    await expect(openProjectFile(await writer.close())).rejects.toThrow('canonical_hash_mismatch');
  });
  it('fails clearly when archive pages are missing', async () => {
    const writer = new ZipWriter(new BlobWriter(), { useWebWorkers: false });
    await writer.add('manifest.json', new TextReader(JSON.stringify({ archiveSchema: 'pulselab-project-archive-v1', pageSize: PROJECT_ROW_PAGE_SIZE,
      project: { datasets: [{ rowCount: 1, pages: 1, canonical: {} }] } })));
    await expect(openProjectFile(await writer.close())).rejects.toThrow('project_archive_entry_invalid');
  });
});
