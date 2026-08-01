import { describe, expect, it } from 'vitest';
import type { NewareAnalysisBundle, WorkbenchSettings } from './analyze';
import type { WorkbenchDatasetV1 } from './project';
import type { DatasetRecipePlanV1 } from './recipe';
import {
  buildReleaseExportModel,
  serializeAuditRowsToCsv,
} from './exportRows';
import { createCf1MaterialPreset } from '../science/material';
import { createVersionSet, GITT_ALGORITHM } from '../science/versions';

function fixture() {
  const material = createCf1MaterialPreset();
  const settings: WorkbenchSettings = {
    electrodeDiameterCm: 1.2,
    electrodeDiameterStandardUncertaintyCm: null,
    activeMassStandardUncertaintyG: null,
    currentResolutionA: null,
    voltageResolutionV: null,
    material,
    initialSocPct: null,
    initialSocSource: 'unknown',
    datasetStartsAtFreshCell: false,
    activeMassOverrideG: 0.00105,
    activeMassSourceId: 'neware_metadata',
  };
  const loaded = {
    id: 'source-hash',
    fileName: 'CFx-release-fixture.ndax',
    fileSize: 123,
    importedAtIso: '2026-07-18T00:00:00.000Z',
    canonical: {
      sourceFileHash: 'source-hash',
      canonicalDatasetHash: 'canonical-hash',
      normalizationReceiptHash: 'normalization-hash',
      rows: [],
      warnings: [],
      metadata: { approvalState: 'provisional' },
    },
  } as unknown as WorkbenchDatasetV1;
  const result = {
    pulseId: '=unsafe-pulse-id',
    metricKind: 'wh_comparative_transport_index',
    metricValueCm2PerS: 1.2e-10,
    diagnosticCandidateMetricValueCm2PerS: 1.2e-10,
    calculationState: 'computed',
    qcStatus: 'review',
    qcCodes: ['density_uncertainty_unknown'],
    modelApplicability: 'limited',
    interpretationScope: 'comparative_index_only',
    activeMassG: 0.00105,
    activeMassSourceId: 'neware_metadata',
    singleFaceAreaCm2: Math.PI * 0.6 ** 2,
    activeMaterialEquivalentThicknessCm: 0.00105 / (2.25 * Math.PI * 0.6 ** 2),
    socPrePulsePct: null,
    dodPrePulsePct: null,
    cumulativeNetCapacityAh: null,
    socCalculationState: 'not_requested',
    socQcStatus: null,
    socQcCodes: [],
  };
  const versions = createVersionSet({
    appVersion: '0.1.0-beta.1',
    buildCommit: 'test-build',
    parserVersion: '0.1.1-provisional',
    vendorProfileId: 'neware-bts8-gitt-1200s-v1',
    vendorProfileVersion: '1.0.0-provisional',
    algorithmId: GITT_ALGORITHM.id,
    algorithmVersion: GITT_ALGORITHM.version,
    qcPolicyId: GITT_ALGORITHM.qcPolicyId,
    materialPresetId: material.materialPresetId,
  });
  const analysis = {
    classification: { analysisKind: 'gitt' },
    dcrResults: [],
    gittResults: [result],
    cfxLiterature1200s: null,
    activeMassProvenance: {
      activeMassG: 0.00105,
      sourceId: 'neware_metadata',
      resolution: 'neware_metadata',
    },
    socTrajectory: null,
    measurementResolution: {},
    counts: { total: 1, valid: 0, review: 1, rejected: 0, notComputable: 0 },
    configHash: 'config-hash',
    analysisInputHash: 'analysis-input-hash',
    resultHash: 'result-hash',
    versions,
  } as unknown as NewareAnalysisBundle;
  const recipePlan = {
    recipeVersion: '1.1.0',
    sourceFileHash: loaded.canonical.sourceFileHash,
    analysisKind: 'gitt',
    readyToAnalyze: true,
    questions: [],
    blocking: [],
    autoResolved: [],
    resolved: {},
    recipeResult: null,
  } as unknown as DatasetRecipePlanV1;
  return { analysis, loaded, recipePlan, result, settings };
}

describe('release export model', () => {
  it('keeps JSON, CSV, and XLSX source rows on one scientific contract', () => {
    const { analysis, loaded, recipePlan, result, settings } = fixture();
    const release = buildReleaseExportModel({
      loaded,
      analysis,
      resolvedSettings: settings,
      recipePlan,
      exportedAtIso: '2026-07-18T01:02:03.000Z',
    });

    expect(release.auditRows).toHaveLength(1);
    expect(release.auditRows[0]).toMatchObject({
      formalValue: result.metricValueCm2PerS,
      metricDisplayName: 'WH 平面端点手算法表观传输结果',
      modelApplicability: 'limited',
      interpretationScope: 'comparative_index_only',
      materialPresetId: settings.material.materialPresetId,
      materialPresetVersion: settings.material.presetVersion,
      densityGPerCm3: 2.25,
      molarMassGPerMol: 31.01,
    });
    expect(release.manifest.results.gitt[0].metricValueCm2PerS).toBe(result.metricValueCm2PerS);
    expect(release.manifest.settings?.material.densityGPerCm3).toBe(2.25);
    expect(release.manifestRows).toContainEqual({ key: 'qcPolicyId', value: GITT_ALGORITHM.qcPolicyId });
    expect(release.manifestRows).toContainEqual({ key: 'densityGPerCm3', value: 2.25 });
    expect(release.manifest.canonicalScientificReceipt).not.toContain(loaded.fileName);
  });

  it('guards spreadsheet formula prefixes in CSV without changing the source value', () => {
    const { analysis, loaded, recipePlan, settings } = fixture();
    const release = buildReleaseExportModel({
      loaded,
      analysis,
      resolvedSettings: settings,
      recipePlan,
      exportedAtIso: '2026-07-18T01:02:03.000Z',
    });
    const csv = serializeAuditRowsToCsv(release.auditRows);

    expect(release.auditRows[0].resultId).toBe('=unsafe-pulse-id');
    expect(csv).toContain("\"'=unsafe-pulse-id\"");
    expect(csv).toContain('WH 平面端点手算法表观传输结果');
  });
});
