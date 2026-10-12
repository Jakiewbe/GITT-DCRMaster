import { describe, expect, it } from 'vitest';

import type { NewareCanonicalDataset } from '../adapters/neware/normalize';
import { createCf1MaterialPreset } from '../science/material';
import type { WorkbenchSettings } from './analyze';
import type { WorkbenchDatasetV1 } from './project';
import { createDefaultWorkbenchRecipe } from './recipe';
import { buildBatchAnalysisRequests } from './useBatchAnalysis';

const settings: WorkbenchSettings = {
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

function canonical(kind: 'dcr' | 'gitt'): NewareCanonicalDataset {
  const programSteps = kind === 'dcr'
    ? [{ stepId: 4, stepTypeCode: 2, recordIntervalMs: null, durationMs: 30_000, currentMa: null }]
    : [
      { stepId: 2, stepTypeCode: 2, recordIntervalMs: null, durationMs: 1_200_000, currentMa: null },
      { stepId: 3, stepTypeCode: 4, recordIntervalMs: null, durationMs: 14_400_000, currentMa: null },
    ];
  return {
    sourceFileHash: `${kind}-source-hash`,
    canonicalDatasetHash: `${kind}-canonical-hash`,
    normalizationReceiptHash: `${kind}-receipt-hash`,
    warnings: [],
    rows: kind === 'gitt' ? [{ sourceFileId: 'CFx-GITT-1.032mg.ndax' }] : [],
    metadata: {
      parserProfileId: 'neware-ndax-ndc17-v1',
      parserProfileVersion: '0.1.2-provisional',
      approvalState: 'provisional',
      instrumentId: null,
      channelId: null,
      testId: null,
      testGuid: null,
      clientVersion: null,
      serverVersion: null,
      firmwareVersion: null,
      activeMassMg: kind === 'gitt' ? 1.032 : null,
      remark: null,
      currentRangeMa: null,
      voltageRangeV: null,
      sourceTimeResolutionNs: 1_000_000n,
      programSteps,
    },
  } as unknown as NewareCanonicalDataset;
}

function loaded(kind: 'dcr' | 'gitt'): WorkbenchDatasetV1 {
  const dataset = canonical(kind);
  return {
    id: dataset.sourceFileHash,
    fileName: `${kind}.ndax`,
    fileSize: 1,
    importedAtIso: '2026-07-18T00:00:00.000Z',
    canonical: dataset,
  };
}

describe('recipe-gated batch analysis', () => {
  it('never schedules a GITT worker with the stale base 12 mm setting', () => {
    const request = buildBatchAnalysisRequests(
      [loaded('gitt')],
      settings,
      { ...createDefaultWorkbenchRecipe(), electrodeDiameterMm: null },
    )[0];

    expect(request.recipePlan.readyToAnalyze).toBe(false);
    expect(request.blockedReasonCodes).toContain('electrode_diameter_required');
    expect(request.cacheKey).toBeNull();
    expect(request.resolvedSettings).toBeNull();
  });

  it('schedules GITT only with file-specific resolved geometry and mass provenance', () => {
    const recipe = { ...createDefaultWorkbenchRecipe(), electrodeDiameterMm: 12 };
    const request = buildBatchAnalysisRequests([loaded('gitt')], settings, recipe)[0];

    expect(request.recipePlan.readyToAnalyze).toBe(true);
    expect(request.cacheKey).not.toBeNull();
    expect(request.resolvedSettings).toMatchObject({
      electrodeDiameterCm: 1.2,
      activeMassOverrideG: 0.001_032,
      activeMassSourceId: 'neware_metadata',
      recipeAnalysisKind: 'gitt',
    });
  });

  it('keeps DCR zero-configuration and immediately schedulable', () => {
    const request = buildBatchAnalysisRequests(
      [loaded('dcr')],
      settings,
      createDefaultWorkbenchRecipe(),
    )[0];

    expect(request.recipePlan.readyToAnalyze).toBe(true);
    expect(request.blockedReasonCodes).toEqual([]);
    expect(request.cacheKey).not.toBeNull();
    expect(request.resolvedSettings?.recipeAnalysisKind).toBe('dcr');
  });
});
