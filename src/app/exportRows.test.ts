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
    regressionCandidateMetricValueCm2PerS: 1.1e-10,
    windowStabilityDecades: 0.04,
    methodDivergenceDecades: -1,
    absMethodDivergenceDecades: 1,
    endpointStartTemporalResolutionS: 10,
    initialObservedDropV: 0.12,
    pulseT0VoltageV: 3.01,
    pulseT0CurrentA: -0.0002,
    endpointStartTimeS: 0,
    firstPositivePulseTimeS: 10,
    firstPositivePulseVoltageV: 2.89,
    pulseStartVoltageV: 3.01,
    pulseEndVoltageV: 2.70,
    deltaEtV: -0.31,
    deltaEsV: -0.05,
    preRestEndPotentialV: 3.13,
    postRestEndPotentialV: 3.08,
    restEndSensitivityAudit: {
      preRest: {
        restEndCurrentWindowS: 2_400,
        restEndCurrentWindowV: 3.13,
        restEnd15minV: 3.1295,
        restEnd5minV: 3.1298,
        restEndRawLastPointV: 3.129,
        restEndCurrentVs15minV: 0.0005,
        restEnd15minVs5minV: -0.0003,
        restEndCurrentVs5minV: 0.0002,
        restEnd5minVsRawV: 0.0008,
        restEndRobustSpreadV: 0.0005,
      },
      postRest: {
        restEndCurrentWindowS: 2_400,
        restEndCurrentWindowV: 3.08,
        restEnd15minV: 3.0795,
        restEnd5minV: 3.0798,
        restEndRawLastPointV: 3.079,
        restEndCurrentVs15minV: 0.0005,
        restEnd15minVs5minV: -0.0003,
        restEndCurrentVs5minV: 0.0002,
        restEnd5minVsRawV: 0.0008,
        restEndRobustSpreadV: 0.0005,
      },
      deltaEsCurrentV: -0.05,
      deltaEs15minV: -0.05,
      deltaEs5minV: -0.05,
      dCurrentCm2PerS: 1.2e-10,
      d15minCm2PerS: 1.15e-10,
      d5minCm2PerS: 1.18e-10,
      log10DCurrentVs15min: 0.0185,
      log10D15minVs5min: -0.0112,
      log10DCurrentVs5min: 0.0073,
    },
    preRestLastRawVoltageV: 3.129,
    postRestLastRawVoltageV: 3.079,
    deltaEsRawV: -0.05,
    restEstimatorDifferencePreV: 0.001,
    restEstimatorDifferencePostV: 0.001,
    onsetObservedDropV: 0.12,
    earlyPolarizationDropV: 0.12,
    preRestToFirstPositiveDropV: 0.24,
    legacyFirstPositiveDeltaEtV: -0.19,
    legacyFirstPositiveEndpointMetricValueCm2PerS: 2.8e-10,
    deltaEtDefinitionDifferenceV: -0.12,
    endpointDRatioVsLegacy: 0.42857142857142855,
    regressionWindows: [
      { windowId: 'legacy_first_5', metricValueCm2PerS: 1.1e-10 },
      {
        windowId: 'cfx_10s',
        metricValueCm2PerS: 1.0e-11,
        slopeVPerSqrtS: 0.002,
        interceptV: 3.001,
        rSquared: 0.996,
        rmseV: 0.001,
        uniqueTimePointCount: 6,
        actualStartS: 10,
        actualEndS: 60.1,
        samplingCoverage: 'full',
        linearityClass: 'strong_linearity',
      },
    ],
    calculationState: 'computed',
    qcStatus: 'review',
    qcCodes: ['density_uncertainty_unknown'],
    primaryEndpointQcStatus: 'review',
    primaryEndpointQcReasons: [{
      code: 'density_provenance_incomplete',
      severity: 'review',
      domain: 'material_input',
      value: null,
      threshold: null,
      sourceRule: 'density_provenance_incomplete',
      message: '密度来源待补充',
    }],
    cfx10SlopeQcStatus: 'valid',
    cfx10SlopeQcReasons: [],
    primaryComparisonEligibility: 'included_with_warnings',
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
      regressionCandidateValue: result.regressionCandidateMetricValueCm2PerS,
      metricDisplayName: 'WH 平面端点手算法表观传输结果',
      modelApplicability: 'limited',
      interpretationScope: 'comparative_index_only',
      materialPresetId: settings.material.materialPresetId,
      materialPresetVersion: settings.material.presetVersion,
      densityGPerCm3: 2.25,
      molarMassGPerMol: 31.01,
    });
    expect(release.auditRows[0] as unknown as Record<string, unknown>).toMatchObject({
      cfx10sDAppCm2PerS: 1.0e-11,
      cfx10sSlopeVPerSqrtS: 0.002,
      cfx10sInterceptV: 3.001,
      cfx10sRSquared: 0.996,
      cfx10sRMSEV: 0.001,
      cfx10sPointCount: 6,
      cfx10sActualStartS: 10,
      cfx10sActualEndS: 60.1,
      cfx10sSamplingCoverage: 'full',
      cfx10sLinearityClass: 'strong_linearity',
      legacyFirst5DAppCm2PerS: 1.1e-10,
      windowStabilityDecades: 0.04,
      methodDivergenceDecades: -1,
      absMethodDivergenceDecades: 1,
      endpointStartTemporalResolutionS: 10,
      initialObservedDropV: 0.12,
      pulseT0VoltageV: 3.01,
      pulseT0CurrentA: -0.0002,
      endpointStartTimeS: 0,
      firstPositivePulseTimeS: 10,
      firstPositivePulseVoltageV: 2.89,
      pulseStartVoltageV: 3.01,
      pulseEndVoltageV: 2.7,
      deltaEtV: -0.31,
      deltaEsV: -0.05,
      preRestRestEndCurrentWindowS: 2400,
      preRestRestEndCurrentWindowV: 3.13,
      preRestRestEnd15minV: 3.1295,
      preRestRestEnd5minV: 3.1298,
      preRestRestEndRawLastPointV: 3.129,
      preRestRestEndRobustSpreadV: 0.0005,
      postRestRestEndCurrentWindowV: 3.08,
      postRestRestEndCurrentWindowS: 2400,
      postRestRestEnd15minV: 3.0795,
      postRestRestEnd5minV: 3.0798,
      postRestRestEndRawLastPointV: 3.079,
      postRestRestEndRobustSpreadV: 0.0005,
      auditDeltaEsCurrentV: -0.05,
      auditDeltaEs15minV: -0.05,
      auditDeltaEs5minV: -0.05,
      auditDCurrentCm2PerS: 1.2e-10,
      auditD15minCm2PerS: 1.15e-10,
      auditD5minCm2PerS: 1.18e-10,
      auditLog10DCurrentVs15min: 0.0185,
      auditLog10D15minVs5min: -0.0112,
      auditLog10DCurrentVs5min: 0.0073,
      legacyFirstPositiveDeltaEtV: -0.19,
      legacyFirstPositiveEndpointMetricValueCm2PerS: 2.8e-10,
      endpointDRatioVsLegacy: 0.42857142857142855,
      primaryEndpointQcStatus: 'review',
      cfx10SlopeQcStatus: 'valid',
      primaryComparisonEligibility: 'included_with_warnings',
    });
    expect(release.manifest.results.gitt[0].metricValueCm2PerS).toBe(result.metricValueCm2PerS);
    expect(release.manifest.settings?.material.densityGPerCm3).toBe(2.25);
    expect(release.manifestRows).toContainEqual({ key: 'qcPolicyId', value: GITT_ALGORITHM.qcPolicyId });
    expect(release.manifestRows).toContainEqual({ key: 'densityGPerCm3', value: 2.25 });
    expect(release.manifestRows).toEqual(expect.arrayContaining([
      { key: 'analysisPreset', value: 'CFx_10s' },
      { key: 'samplingAssumption', value: 'approximately 10 s pulse recording' },
      { key: 'regressionRequestedWindow', value: '0 < t <= 64 s' },
      { key: 'primaryMetric', value: 'endpoint_WH' },
      { key: 'secondaryMetric', value: 'slope_WH_CFx_10s' },
      { key: 'endpointPulseStartDefinition', value: 'loaded_t0_record' },
      { key: 'endpointDeltaEtDefinition', value: 'pulse_end_minus_loaded_t0' },
      { key: 'restEndDefinition', value: 'theil_sen_tail_endpoint' },
      { key: 'firstPositivePulsePointRole', value: 'diagnostic_only' },
    ]));
    expect(release.manifest.versions.scientificContractVersion).toBe('1.5.0');
    expect(release.manifest.versions.algorithmVersion).toBe('1.1.0');
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

  it('keeps numeric negative results numeric while guarding text formula prefixes', () => {
    const { analysis, loaded, recipePlan, settings } = fixture();
    const release = buildReleaseExportModel({
      loaded,
      analysis,
      resolvedSettings: settings,
      recipePlan,
      exportedAtIso: '2026-07-18T01:02:03.000Z',
    });
    const row = { ...release.auditRows[0], formalValue: -1.25, auditCandidateValue: -2.5 };
    const csv = serializeAuditRowsToCsv([row]);

    expect(csv).toContain('"-1.25"');
    expect(csv).toContain('"-2.5"');
    expect(csv).not.toContain('"\'-1.25"');
  });
});
