import { describe, expect, it } from 'vitest';
import type { NewareCanonicalDataset } from '../adapters/neware/normalize';
import { createCf1MaterialPreset } from '../science/material';
import { createAnalysisCache, createAnalysisCacheKey } from './analysisCache';
import {
  analyzeNewareDataset,
  createNewareAnalysisIdentity,
  type AppBuildMetadata,
  type WorkbenchSettings,
} from './analyze';

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

function identityDataset(
  canonicalDatasetHash: string,
  parserProfileVersion = '0.1.1-provisional',
  ranges: { currentRangeMa?: number | null; voltageRangeV?: number | null } = {},
): NewareCanonicalDataset {
  return {
    sourceFileHash: 'source-hash',
    canonicalDatasetHash,
    normalizationReceiptHash: `receipt-${parserProfileVersion}`,
    rows: [],
    warnings: [],
    metadata: {
      parserProfileId: 'neware-ndax-ndc17-v1',
      parserProfileVersion:
        parserProfileVersion as NewareCanonicalDataset['metadata']['parserProfileVersion'],
      approvalState: 'provisional',
      instrumentId: null,
      channelId: null,
      testId: null,
      testGuid: null,
      clientVersion: null,
      serverVersion: null,
      firmwareVersion: null,
      activeMassMg: null,
      remark: null,
      currentRangeMa: ranges.currentRangeMa ?? null,
      voltageRangeV: ranges.voltageRangeV ?? null,
      sourceTimeResolutionNs: 1_000_000n,
      programSteps: [],
    },
  };
}

function dcrIdentityDataset(
  ranges: { currentRangeMa?: number | null; voltageRangeV?: number | null } = {},
): NewareCanonicalDataset {
  const dataset = identityDataset('canonical-dcr', '0.1.1-provisional', ranges);
  dataset.metadata.programSteps = [
    { stepId: 4, stepTypeCode: 2, recordIntervalMs: null, durationMs: 30_000, currentMa: null },
  ];
  return dataset;
}

function gittIdentityDataset(): NewareCanonicalDataset {
  const dataset = identityDataset('canonical-gitt');
  dataset.metadata.programSteps = [
    { stepId: 2, stepTypeCode: 2, recordIntervalMs: null, durationMs: 1_200_000, currentMa: null },
    { stepId: 3, stepTypeCode: 4, recordIntervalMs: null, durationMs: 14_400_000, currentMa: null },
  ];
  return dataset;
}

describe('analysis cache', () => {
  it('keeps only the most recently used entries', () => {
    const cache = createAnalysisCache(2);
    const first = { analysis: null, error: 'first' };
    const second = { analysis: null, error: 'second' };
    const third = { analysis: null, error: 'third' };

    cache.set('first', first);
    cache.set('second', second);
    expect(cache.get('first')).toBe(first);
    cache.set('third', third);

    expect(cache.peek('first')).toBe(first);
    expect(cache.peek('second')).toBeUndefined();
    expect(cache.peek('third')).toBe(third);
    expect(cache.size()).toBe(2);
  });

  it('rejects invalid capacity settings', () => {
    expect(() => createAnalysisCache(0)).toThrow('analysis_cache_size_invalid');
  });

  it('uses the complete analysis input identity rather than source hash alone', () => {
    const first = createAnalysisCacheKey(identityDataset('canonical-a'), settings);
    const changedCanonical = createAnalysisCacheKey(identityDataset('canonical-b'), settings);
    const changedParser = createAnalysisCacheKey(
      identityDataset('canonical-a', 'neware-ndax-provisional-v2'),
      settings,
    );

    expect(changedCanonical).not.toBe(first);
    expect(changedParser).not.toBe(first);
  });

  it('includes record-storage full-scale evidence even when two ranges share one float32 spacing', () => {
    const range40 = createAnalysisCacheKey(
      dcrIdentityDataset({ currentRangeMa: 40, voltageRangeV: 4 }),
      settings,
    );
    const range50 = createAnalysisCacheKey(
      dcrIdentityDataset({ currentRangeMa: 50, voltageRangeV: 5 }),
      settings,
    );

    expect(range40).not.toBe(range50);
  });

  it('excludes GITT-only settings from DCR config, cache, and result identities', () => {
    const dataset = dcrIdentityDataset();
    const changedGittOnlySettings: WorkbenchSettings = {
      ...settings,
      electrodeDiameterCm: 2.5,
      electrodeDiameterStandardUncertaintyCm: 0.01,
      activeMassStandardUncertaintyG: 0.000_001,
      activeMassOverrideG: 0.0042,
      activeMassSourceId: 'unrelated_recipe_source',
      recipeVersion: '999.0.0',
      recipeSourceFileHash: 'unrelated-file',
      recipeAnalysisKind: 'gitt',
      recipeMaterialProfileId: 'unrelated_profile',
      material: {
        ...settings.material,
        materialPresetId: 'UNRELATED_DCR_MATERIAL_CHANGE',
        densityGPerCm3: 9,
      },
      initialSocPct: 42,
      initialSocSource: 'user_input',
      datasetStartsAtFreshCell: true,
    };

    const initial = createNewareAnalysisIdentity(dataset, settings);
    const changed = createNewareAnalysisIdentity(dataset, changedGittOnlySettings);
    expect(initial.configHash).toBe(changed.configHash);
    expect(initial.analysisInputHash).toBe(changed.analysisInputHash);
    expect(initial.versions.materialPresetId).toBe('NOT_APPLICABLE');
    expect(changed.versions.materialPresetId).toBe('NOT_APPLICABLE');
    expect(createAnalysisCacheKey(dataset, settings)).toBe(
      createAnalysisCacheKey(dataset, changedGittOnlySettings),
    );
    expect(analyzeNewareDataset(dataset, settings).resultHash).toBe(
      analyzeNewareDataset(dataset, changedGittOnlySettings).resultHash,
    );
  });

  it('keeps GITT geometry, material, and SOC settings in the analysis identity', () => {
    const dataset = gittIdentityDataset();
    const initial = createNewareAnalysisIdentity(dataset, settings).analysisInputHash;
    const changedDiameter = createNewareAnalysisIdentity(dataset, {
      ...settings,
      electrodeDiameterCm: 1.3,
    }).analysisInputHash;
    const changedMaterial = createNewareAnalysisIdentity(dataset, {
      ...settings,
      material: { ...settings.material, densityGPerCm3: 2.3 },
    }).analysisInputHash;
    const changedSoc = createNewareAnalysisIdentity(dataset, {
      ...settings,
      initialSocPct: 90,
      initialSocSource: 'user_input',
    }).analysisInputHash;

    expect(changedDiameter).not.toBe(initial);
    expect(changedMaterial).not.toBe(initial);
    expect(changedSoc).not.toBe(initial);
  });

  it('keeps the operator geometry authority in the GITT input identity', () => {
    const dataset = gittIdentityDataset();
    const areaCm2 = Math.PI * (settings.electrodeDiameterCm / 2) ** 2;
    const diameterAuthority = createNewareAnalysisIdentity(dataset, {
      ...settings,
      recipeGeometryInputMode: 'diameter',
      recipeElectrodeAreaCm2: areaCm2,
    }).analysisInputHash;
    const areaAuthority = createNewareAnalysisIdentity(dataset, {
      ...settings,
      recipeGeometryInputMode: 'area',
      recipeElectrodeAreaCm2: areaCm2,
    }).analysisInputHash;

    expect(areaAuthority).not.toBe(diameterAuthority);
  });

  it('retains build metadata in manifests without changing scientific or cache identity', () => {
    const dataset = dcrIdentityDataset();
    const buildA: AppBuildMetadata = { appVersion: '0.1.0-alpha.1', buildCommit: 'build-a' };
    const buildB: AppBuildMetadata = { appVersion: '0.1.0-alpha.2', buildCommit: 'build-b' };
    const identityA = createNewareAnalysisIdentity(dataset, settings, buildA);
    const identityB = createNewareAnalysisIdentity(dataset, settings, buildB);
    const resultA = analyzeNewareDataset(dataset, settings, buildA);
    const resultB = analyzeNewareDataset(dataset, settings, buildB);

    expect(identityA.versions).toMatchObject(buildA);
    expect(identityB.versions).toMatchObject(buildB);
    expect(identityA.analysisInputHash).toBe(identityB.analysisInputHash);
    expect(resultA.resultHash).toBe(resultB.resultHash);
    expect(createAnalysisCacheKey(dataset, settings, buildA)).toBe(
      createAnalysisCacheKey(dataset, settings, buildB),
    );
  });
});
