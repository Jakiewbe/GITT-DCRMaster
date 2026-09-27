import type { NewareAnalysisBundle, WorkbenchSettings } from './analyze';
import type { DatasetRecipePlanV1 } from './recipe';
import type { WorkbenchDatasetV1 } from './project';
import type { GittRegressionWindowResultV1 } from '../science/contracts';
import { canonicalizeScientificJson } from '../science/hash';
import { DEFAULT_GITT_REGRESSION_WINDOWS } from '../science/gitt';
import { GITT_AUXILIARY_FIT } from '../science/versions';

export type AuditExportRow = {
  sourceFileHash: string;
  canonicalDatasetHash: string;
  configHash: string;
  analysisInputHash: string;
  resultHash: string;
  algorithmId: string;
  algorithmVersion: string;
  qcPolicyId: string;
  resultType: 'dcr' | 'gitt';
  resultId: string;
  metricKind: string;
  metricDisplayName: string;
  formalValue: number | null;
  auditCandidateValue: number | null;
  regressionCandidateValue: number | null;
  unit: 'ohm' | 'cm2_per_s';
  calculationState: string;
  qcStatus: string | null;
  qcCodes: string[];
  primaryEndpointQcStatus: string | null;
  primaryEndpointQcReasons: string;
  cfx10SlopeQcStatus: string | null;
  cfx10SlopeQcReasons: string;
  primaryComparisonEligibility: string | null;
  modelApplicability: string | null;
  interpretationScope: string;
  calculationMethod: string | null;
  pulseDurationS: number | null;
  medianVoltageV: number | null;
  preRestEndPotentialV: number | null;
  postRestEndPotentialV: number | null;
  pulseT0VoltageV: number | null;
  pulseT0CurrentA: number | null;
  endpointStartTimeS: number | null;
  firstPositivePulseTimeS: number | null;
  firstPositivePulseVoltageV: number | null;
  pulseStartVoltageV: number | null;
  pulseEndVoltageV: number | null;
  deltaEtV: number | null;
  deltaEsV: number | null;
  preRestLastRawVoltageV: number | null;
  postRestLastRawVoltageV: number | null;
  deltaEsRawV: number | null;
  restEstimatorDifferencePreV: number | null;
  restEstimatorDifferencePostV: number | null;
  preRestRestEndCurrentWindowS: number | null;
  preRestRestEndCurrentWindowV: number | null;
  preRestRestEnd15minV: number | null;
  preRestRestEnd5minV: number | null;
  preRestRestEndRawLastPointV: number | null;
  preRestRestEndCurrentVs15minV: number | null;
  preRestRestEnd15minVs5minV: number | null;
  preRestRestEndCurrentVs5minV: number | null;
  preRestRestEnd5minVsRawV: number | null;
  preRestRestEndRobustSpreadV: number | null;
  postRestRestEndCurrentWindowS: number | null;
  postRestRestEndCurrentWindowV: number | null;
  postRestRestEnd15minV: number | null;
  postRestRestEnd5minV: number | null;
  postRestRestEndRawLastPointV: number | null;
  postRestRestEndCurrentVs15minV: number | null;
  postRestRestEnd15minVs5minV: number | null;
  postRestRestEndCurrentVs5minV: number | null;
  postRestRestEnd5minVsRawV: number | null;
  postRestRestEndRobustSpreadV: number | null;
  auditDeltaEsCurrentV: number | null;
  auditDeltaEs15minV: number | null;
  auditDeltaEs5minV: number | null;
  auditDCurrentCm2PerS: number | null;
  auditD15minCm2PerS: number | null;
  auditD5minCm2PerS: number | null;
  auditLog10DCurrentVs15min: number | null;
  auditLog10D15minVs5min: number | null;
  auditLog10DCurrentVs5min: number | null;
  legacyFirstPositiveDeltaEtV: number | null;
  legacyFirstPositiveEndpointMetricValueCm2PerS: number | null;
  deltaEtDefinitionDifferenceV: number | null;
  endpointDRatioVsLegacy: number | null;
  fitSlopeVPerSqrtS: number | null;
  fitInterceptV: number | null;
  fitRSquared: number | null;
  cfx10sDAppCm2PerS: number | null;
  cfx10sSlopeVPerSqrtS: number | null;
  cfx10sInterceptV: number | null;
  cfx10sRSquared: number | null;
  cfx10sRMSEV: number | null;
  cfx10sPointCount: number | null;
  cfx10sActualStartS: number | null;
  cfx10sActualEndS: number | null;
  cfx10sSamplingCoverage: string | null;
  cfx10sLinearityClass: string | null;
  legacyFirst5DAppCm2PerS: number | null;
  windowStabilityDecades: number | null;
  methodDivergenceDecades: number | null;
  absMethodDivergenceDecades: number | null;
  endpointStartTemporalResolutionS: number | null;
  initialObservedDropV: number | null;
  activeMassG: number | null;
  activeMassSourceId: string | null;
  singleFaceAreaCm2: number | null;
  activeMaterialEquivalentThicknessCm: number | null;
  materialPresetId: string | null;
  materialPresetVersion: string | null;
  densityGPerCm3: number | null;
  molarMassGPerMol: number | null;
  socPrePulsePct: number | null;
  dodPrePulsePct: number | null;
  cumulativeNetCapacityAh: number | null;
  socCalculationState: string | null;
  socQcStatus: string | null;
  socQcCodes: string[];
};

export function buildAuditExportRows(
  loaded: WorkbenchDatasetV1,
  analysis: NewareAnalysisBundle,
  resolvedSettings: WorkbenchSettings | null = null,
): AuditExportRow[] {
  const common = {
    sourceFileHash: loaded.canonical.sourceFileHash,
    canonicalDatasetHash: loaded.canonical.canonicalDatasetHash,
    configHash: analysis.configHash,
    analysisInputHash: analysis.analysisInputHash,
    resultHash: analysis.resultHash,
    algorithmId: analysis.versions.algorithmId,
    algorithmVersion: analysis.versions.algorithmVersion,
    qcPolicyId: analysis.versions.qcPolicyId,
  };

  if (analysis.dcrResults.length > 0) {
    return analysis.dcrResults.map((result) => ({
      ...common,
      resultType: 'dcr',
      resultId: `${result.eventId}:${result.requestedMetric}`,
      metricKind: result.requestedMetric,
      metricDisplayName: result.requestedMetric === 'DCR_terminal'
        ? '论文法两电流终止电压差分 DCR'
        : result.requestedMetric === 'DCR_first_sample'
          ? 'DCR 首采样表观脉冲电阻'
          : `${result.requestedMetric} 表观脉冲电阻`,
      formalValue: result.resistanceOhm,
      auditCandidateValue: result.diagnosticCandidateResistanceOhm,
      regressionCandidateValue: null,
      unit: 'ohm',
      calculationState: result.calculationState,
      qcStatus: result.qcStatus,
      qcCodes: result.qcCodes,
      primaryEndpointQcStatus: null,
      primaryEndpointQcReasons: '',
      cfx10SlopeQcStatus: null,
      cfx10SlopeQcReasons: '',
      primaryComparisonEligibility: null,
      modelApplicability: null,
      interpretationScope: result.requestedMetric === 'DCR_terminal'
        ? 'protocol_and_terminal_voltage_differential_apparent_resistance'
        : 'protocol_and_timepoint_dependent_apparent_resistance',
      calculationMethod: result.calculationMethod ?? null,
      pulseDurationS: null,
      medianVoltageV: null,
      preRestEndPotentialV: null,
      postRestEndPotentialV: null,
      pulseT0VoltageV: null,
      pulseT0CurrentA: null,
      endpointStartTimeS: null,
      firstPositivePulseTimeS: null,
      firstPositivePulseVoltageV: null,
      pulseStartVoltageV: null,
      pulseEndVoltageV: null,
      deltaEtV: null,
      deltaEsV: null,
      preRestLastRawVoltageV: null,
      postRestLastRawVoltageV: null,
      deltaEsRawV: null,
      restEstimatorDifferencePreV: null,
      restEstimatorDifferencePostV: null,
      preRestRestEndCurrentWindowS: null,
      preRestRestEndCurrentWindowV: null,
      preRestRestEnd15minV: null,
      preRestRestEnd5minV: null,
      preRestRestEndRawLastPointV: null,
      preRestRestEndCurrentVs15minV: null,
      preRestRestEnd15minVs5minV: null,
      preRestRestEndCurrentVs5minV: null,
      preRestRestEnd5minVsRawV: null,
      preRestRestEndRobustSpreadV: null,
      postRestRestEndCurrentWindowS: null,
      postRestRestEndCurrentWindowV: null,
      postRestRestEnd15minV: null,
      postRestRestEnd5minV: null,
      postRestRestEndRawLastPointV: null,
      postRestRestEndCurrentVs15minV: null,
      postRestRestEnd15minVs5minV: null,
      postRestRestEndCurrentVs5minV: null,
      postRestRestEnd5minVsRawV: null,
      postRestRestEndRobustSpreadV: null,
      auditDeltaEsCurrentV: null,
      auditDeltaEs15minV: null,
      auditDeltaEs5minV: null,
      auditDCurrentCm2PerS: null,
      auditD15minCm2PerS: null,
      auditD5minCm2PerS: null,
      auditLog10DCurrentVs15min: null,
      auditLog10D15minVs5min: null,
      auditLog10DCurrentVs5min: null,
      legacyFirstPositiveDeltaEtV: null,
      legacyFirstPositiveEndpointMetricValueCm2PerS: null,
      deltaEtDefinitionDifferenceV: null,
      endpointDRatioVsLegacy: null,
      fitSlopeVPerSqrtS: null,
      fitInterceptV: null,
      fitRSquared: null,
      cfx10sDAppCm2PerS: null,
      cfx10sSlopeVPerSqrtS: null,
      cfx10sInterceptV: null,
      cfx10sRSquared: null,
      cfx10sRMSEV: null,
      cfx10sPointCount: null,
      cfx10sActualStartS: null,
      cfx10sActualEndS: null,
      cfx10sSamplingCoverage: null,
      cfx10sLinearityClass: null,
      legacyFirst5DAppCm2PerS: null,
      windowStabilityDecades: null,
      methodDivergenceDecades: null,
      absMethodDivergenceDecades: null,
      endpointStartTemporalResolutionS: null,
      initialObservedDropV: null,
      activeMassG: null,
      activeMassSourceId: null,
      singleFaceAreaCm2: null,
      activeMaterialEquivalentThicknessCm: null,
      materialPresetId: null,
      materialPresetVersion: null,
      densityGPerCm3: null,
      molarMassGPerMol: null,
      socPrePulsePct: null,
      dodPrePulsePct: null,
      cumulativeNetCapacityAh: null,
      socCalculationState: null,
      socQcStatus: null,
      socQcCodes: [],
    }));
  }

  return analysis.gittResults.map((result) => {
    const window = (windowId: string): GittRegressionWindowResultV1 | null =>
      result.regressionWindows.find((candidate) => candidate.windowId === windowId) ?? null;
    const cfx10s = window('cfx_10s');
    const legacy = window('legacy_first_5');
    const restSensitivity = result.restEndSensitivityAudit;
    const preRestSensitivity = restSensitivity.preRest;
    const postRestSensitivity = restSensitivity.postRest;
    return {
      ...common,
      resultType: 'gitt',
      resultId: result.pulseId,
      metricKind: result.metricKind,
      metricDisplayName: result.metricKind === 'wh_comparative_transport_index'
        ? 'WH 平面端点手算法表观传输结果'
        : '表观化学扩散系数',
      formalValue: result.metricValueCm2PerS,
      auditCandidateValue: result.diagnosticCandidateMetricValueCm2PerS,
      regressionCandidateValue: result.regressionCandidateMetricValueCm2PerS,
      unit: 'cm2_per_s',
      calculationState: result.calculationState,
      qcStatus: result.qcStatus,
      qcCodes: result.qcCodes,
      modelApplicability: result.modelApplicability,
      primaryEndpointQcStatus: result.primaryEndpointQcStatus,
      primaryEndpointQcReasons: JSON.stringify(result.primaryEndpointQcReasons),
      cfx10SlopeQcStatus: result.cfx10SlopeQcStatus,
      cfx10SlopeQcReasons: JSON.stringify(result.cfx10SlopeQcReasons),
      primaryComparisonEligibility: result.primaryComparisonEligibility,
      interpretationScope: result.interpretationScope,
      calculationMethod: result.calculationMethod,
      pulseDurationS: result.pulseDurationS,
      medianVoltageV: result.medianVoltageV,
      preRestEndPotentialV: result.preRestEndPotentialV,
      postRestEndPotentialV: result.postRestEndPotentialV,
      pulseT0VoltageV: result.pulseT0VoltageV,
      pulseT0CurrentA: result.pulseT0CurrentA,
      endpointStartTimeS: result.endpointStartTimeS,
      firstPositivePulseTimeS: result.firstPositivePulseTimeS,
      firstPositivePulseVoltageV: result.firstPositivePulseVoltageV,
      pulseStartVoltageV: result.pulseStartVoltageV,
      pulseEndVoltageV: result.pulseEndVoltageV,
      deltaEtV: result.deltaEtV,
      deltaEsV: result.deltaEsV,
      preRestLastRawVoltageV: result.preRestLastRawVoltageV,
      postRestLastRawVoltageV: result.postRestLastRawVoltageV,
      deltaEsRawV: result.deltaEsRawV,
      restEstimatorDifferencePreV: result.restEstimatorDifferencePreV,
      restEstimatorDifferencePostV: result.restEstimatorDifferencePostV,
      preRestRestEndCurrentWindowS: preRestSensitivity.restEndCurrentWindowS,
      preRestRestEndCurrentWindowV: preRestSensitivity.restEndCurrentWindowV,
      preRestRestEnd15minV: preRestSensitivity.restEnd15minV,
      preRestRestEnd5minV: preRestSensitivity.restEnd5minV,
      preRestRestEndRawLastPointV: preRestSensitivity.restEndRawLastPointV,
      preRestRestEndCurrentVs15minV: preRestSensitivity.restEndCurrentVs15minV,
      preRestRestEnd15minVs5minV: preRestSensitivity.restEnd15minVs5minV,
      preRestRestEndCurrentVs5minV: preRestSensitivity.restEndCurrentVs5minV,
      preRestRestEnd5minVsRawV: preRestSensitivity.restEnd5minVsRawV,
      preRestRestEndRobustSpreadV: preRestSensitivity.restEndRobustSpreadV,
      postRestRestEndCurrentWindowS: postRestSensitivity.restEndCurrentWindowS,
      postRestRestEndCurrentWindowV: postRestSensitivity.restEndCurrentWindowV,
      postRestRestEnd15minV: postRestSensitivity.restEnd15minV,
      postRestRestEnd5minV: postRestSensitivity.restEnd5minV,
      postRestRestEndRawLastPointV: postRestSensitivity.restEndRawLastPointV,
      postRestRestEndCurrentVs15minV: postRestSensitivity.restEndCurrentVs15minV,
      postRestRestEnd15minVs5minV: postRestSensitivity.restEnd15minVs5minV,
      postRestRestEndCurrentVs5minV: postRestSensitivity.restEndCurrentVs5minV,
      postRestRestEnd5minVsRawV: postRestSensitivity.restEnd5minVsRawV,
      postRestRestEndRobustSpreadV: postRestSensitivity.restEndRobustSpreadV,
      auditDeltaEsCurrentV: restSensitivity.deltaEsCurrentV,
      auditDeltaEs15minV: restSensitivity.deltaEs15minV,
      auditDeltaEs5minV: restSensitivity.deltaEs5minV,
      auditDCurrentCm2PerS: restSensitivity.dCurrentCm2PerS,
      auditD15minCm2PerS: restSensitivity.d15minCm2PerS,
      auditD5minCm2PerS: restSensitivity.d5minCm2PerS,
      auditLog10DCurrentVs15min: restSensitivity.log10DCurrentVs15min,
      auditLog10D15minVs5min: restSensitivity.log10D15minVs5min,
      auditLog10DCurrentVs5min: restSensitivity.log10DCurrentVs5min,
      legacyFirstPositiveDeltaEtV: result.legacyFirstPositiveDeltaEtV,
      legacyFirstPositiveEndpointMetricValueCm2PerS: result.legacyFirstPositiveEndpointMetricValueCm2PerS,
      deltaEtDefinitionDifferenceV: result.deltaEtDefinitionDifferenceV,
      endpointDRatioVsLegacy: result.endpointDRatioVsLegacy,
      fitSlopeVPerSqrtS: result.fitDiagnostics?.slopeVPerSqrtS ?? null,
      fitInterceptV: result.fitDiagnostics?.interceptV ?? null,
      fitRSquared: result.fitDiagnostics?.rSquared ?? null,
      cfx10sDAppCm2PerS: cfx10s?.metricValueCm2PerS ?? null,
      cfx10sSlopeVPerSqrtS: cfx10s?.slopeVPerSqrtS ?? null,
      cfx10sInterceptV: cfx10s?.interceptV ?? null,
      cfx10sRSquared: cfx10s?.rSquared ?? null,
      cfx10sRMSEV: cfx10s?.rmseV ?? null,
      cfx10sPointCount: cfx10s?.uniqueTimePointCount ?? null,
      cfx10sActualStartS: cfx10s?.actualStartS ?? null,
      cfx10sActualEndS: cfx10s?.actualEndS ?? null,
      cfx10sSamplingCoverage: cfx10s?.samplingCoverage ?? null,
      cfx10sLinearityClass: cfx10s?.linearityClass ?? null,
      legacyFirst5DAppCm2PerS: legacy?.metricValueCm2PerS ?? null,
      windowStabilityDecades: result.windowStabilityDecades,
      methodDivergenceDecades: result.methodDivergenceDecades,
      absMethodDivergenceDecades: result.absMethodDivergenceDecades,
      endpointStartTemporalResolutionS: result.endpointStartTemporalResolutionS,
      initialObservedDropV: result.initialObservedDropV,
      activeMassG: result.activeMassG,
      activeMassSourceId: result.activeMassSourceId,
      singleFaceAreaCm2: result.singleFaceAreaCm2,
      activeMaterialEquivalentThicknessCm: result.activeMaterialEquivalentThicknessCm,
      materialPresetId: resolvedSettings?.material.materialPresetId ?? null,
      materialPresetVersion: resolvedSettings?.material.presetVersion ?? null,
      densityGPerCm3: resolvedSettings?.material.densityGPerCm3 ?? null,
      molarMassGPerMol: resolvedSettings?.material.molarMassGPerMol ?? null,
      socPrePulsePct: result.socPrePulsePct,
      dodPrePulsePct: result.dodPrePulsePct,
      cumulativeNetCapacityAh: result.cumulativeNetCapacityAh,
      socCalculationState: result.socCalculationState,
      socQcStatus: result.socQcStatus,
      socQcCodes: result.socQcCodes,
    };
  });
}

export type ReleaseManifestV1 = {
  manifestSchemaVersion: string;
  exportedAtIso: string;
  sourceDisplayName: string;
  sourceFileHash: string;
  canonicalDatasetHash: string;
  normalizationReceiptHash: string;
  configHash: string;
  analysisInputHash: string;
  resultHash: string;
  parserApprovalState: string;
  classification: NewareAnalysisBundle['classification'];
  versions: NewareAnalysisBundle['versions'];
  settings: WorkbenchSettings | null;
  recipePlan: DatasetRecipePlanV1;
  results: {
    dcr: NewareAnalysisBundle['dcrResults'];
    gitt: NewareAnalysisBundle['gittResults'];
    socTrajectory: NewareAnalysisBundle['socTrajectory'];
    cfxLiterature1200s: NewareAnalysisBundle['cfxLiterature1200s'];
  };
  canonicalScientificReceipt: string;
};

export type ReleaseManifestRowV1 = {
  key: string;
  value: string | number | boolean | null;
};

export type CfxProfileExportRowV1 = {
  pulseOrder: number;
  medianVoltageV: number | null;
  equivalentSpecificCurrentMahPerG: number | null;
  displayComparisonEligibility: string;
  auditDAppCandidateCm2PerS: number | null;
  protocolCutoffState: 'before_first_protocol_cutoff' | 'first_protocol_cutoff_event' | 'post_protocol_cutoff';
  actualPulseDurationS: number | null;
  isPostProtocolCutoff: boolean;
  termination: string | null;
  postRestState: string | null;
  sequenceClassification: string;
  protocolStatus: string;
  comparisonUse: string;
  primaryComparisonEligibility: string;
  metricDisplayName: 'WH 平面端点手算法表观传输结果';
  whEndpointResultCm2PerS: number | null;
  absolutePulseEndPolarizationV: number | null;
  restEndPotentialShiftV: number | null;
  genericQcStatus: string | null;
  genericQcCodes: string;
  primaryEndpointQcStatus: string;
  primaryEndpointQcReasons: string;
  cfx10SlopeQcStatus: string;
  cfx10SlopeQcReasons: string;
  modelApplicability: 'limited';
  interpretationScope: 'comparative_index_only';
  modelWarnings: string;
};

export type ReleaseExportModelV1 = {
  auditRows: AuditExportRow[];
  manifest: ReleaseManifestV1;
  manifestRows: ReleaseManifestRowV1[];
  cfxProfileRows: CfxProfileExportRowV1[];
};

function csvCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number') return Number.isFinite(value) ? `"${value}"` : '';
  const serialized = Array.isArray(value) ? value.join(' | ') : String(value);
  const guarded = /^[=+\-@]/.test(serialized) ? `'${serialized}` : serialized;
  return `"${guarded.replaceAll('"', '""')}"`;
}

export function serializeAuditRowsToCsv(rows: readonly AuditExportRow[]): string {
  if (rows.length === 0) throw new RangeError('csv_requires_at_least_one_row');
  const headers = Object.keys(rows[0]) as Array<keyof AuditExportRow>;
  return [
    headers.map(csvCell).join(','),
    ...rows.map((row) => headers.map((header) => csvCell(row[header])).join(',')),
  ].join('\r\n');
}

/**
 * Builds the one release-facing export model used by JSON, CSV, and XLSX.
 * Presentation formats may serialize it differently, but they may not invent
 * their own terminology, versions, configuration, or result values.
 */
export function buildReleaseExportModel(input: {
  loaded: WorkbenchDatasetV1;
  analysis: NewareAnalysisBundle;
  resolvedSettings: WorkbenchSettings | null;
  recipePlan: DatasetRecipePlanV1;
  exportedAtIso: string;
}): ReleaseExportModelV1 {
  const { loaded, analysis, resolvedSettings, recipePlan, exportedAtIso } = input;
  const auditRows = buildAuditExportRows(loaded, analysis, resolvedSettings);
  const receipt = {
    sourceFileHash: loaded.canonical.sourceFileHash,
    canonicalDatasetHash: loaded.canonical.canonicalDatasetHash,
    normalizationReceiptHash: loaded.canonical.normalizationReceiptHash,
    configHash: analysis.configHash,
    analysisInputHash: analysis.analysisInputHash,
    resultHash: analysis.resultHash,
  };
  const manifest: ReleaseManifestV1 = {
    manifestSchemaVersion: analysis.versions.manifestSchemaVersion,
    exportedAtIso,
    sourceDisplayName: loaded.fileName,
    ...receipt,
    parserApprovalState: loaded.canonical.metadata.approvalState,
    classification: analysis.classification,
    versions: analysis.versions,
    settings: resolvedSettings,
    recipePlan,
    results: {
      dcr: analysis.dcrResults,
      gitt: analysis.gittResults,
      socTrajectory: analysis.socTrajectory,
      cfxLiterature1200s: analysis.cfxLiterature1200s,
    },
    canonicalScientificReceipt: canonicalizeScientificJson(receipt),
  };
  const material = analysis.classification.analysisKind === 'gitt'
    ? resolvedSettings?.material ?? null
    : null;
  const isCfxGitt = analysis.classification.analysisKind === 'gitt' &&
    material?.materialFamily === 'cfx_conversion';
  const observedRegressionWindowIds = [...new Set(
    analysis.gittResults.flatMap((result) =>
      (result.regressionWindows ?? []).map((window) => window.windowId)),
  )];
  const regressionWindowIds = analysis.classification.analysisKind !== 'gitt'
    ? []
    : observedRegressionWindowIds.length > 0
      ? observedRegressionWindowIds
      : DEFAULT_GITT_REGRESSION_WINDOWS.map((window) => window.id);
  if (
    analysis.classification.analysisKind === 'gitt' &&
    resolvedSettings?.regressionManualWindow &&
    (resolvedSettings.regressionManualWindow.startS !== null ||
      resolvedSettings.regressionManualWindow.endS !== null) &&
    !regressionWindowIds.includes('manual')
  ) {
    regressionWindowIds.push('manual');
  }
  const manifestRows: ReleaseManifestRowV1[] = [
    { key: 'sourceDisplayName', value: loaded.fileName },
    ...Object.entries(receipt).map(([key, value]) => ({ key, value })),
    { key: 'parserApprovalState', value: loaded.canonical.metadata.approvalState },
    ...Object.entries(analysis.versions).map(([key, value]) => ({ key, value })),
    { key: 'materialPresetId', value: material?.materialPresetId ?? null },
    { key: 'materialPresetVersion', value: material?.presetVersion ?? null },
    { key: 'densityGPerCm3', value: material?.densityGPerCm3 ?? null },
    { key: 'molarMassGPerMol', value: material?.molarMassGPerMol ?? null },
    { key: 'activeMassG', value: analysis.activeMassProvenance?.activeMassG ?? null },
    { key: 'activeMassSourceId', value: analysis.activeMassProvenance?.sourceId ?? null },
    {
      key: 'singleFaceAreaCm2',
      value: analysis.gittResults.find((result) => result.singleFaceAreaCm2 !== null)?.singleFaceAreaCm2 ?? null,
    },
    { key: 'modelApplicability', value: analysis.classification.analysisKind === 'gitt' ? 'limited' : null },
    {
      key: 'interpretationScope',
      value: analysis.classification.analysisKind === 'gitt'
        ? 'comparative_index_only'
        : 'protocol_and_timepoint_dependent_apparent_resistance',
    },
    { key: 'primaryGittMetric', value: analysis.classification.analysisKind === 'gitt' ? 'metricValueCm2PerS (D_endpoint)' : null },
    {
      key: 'statusModel',
      value: analysis.classification.analysisKind === 'gitt'
        ? 'calculationState + primaryEndpointQc + protocolStatus + primaryComparisonEligibility'
        : 'calculationState + qcStatus',
    },
    {
      key: 'qcStatusCompatibility',
      value: analysis.classification.analysisKind === 'gitt'
        ? 'deprecated_aggregate_alias_not_primary_eligibility'
        : null,
    },
    {
      key: 'analysisPreset',
      value: isCfxGitt ? 'CFx_10s' : analysis.classification.analysisKind === 'gitt' ? 'generic_gitt' : null,
    },
    {
      key: 'samplingAssumption',
      value: isCfxGitt ? 'approximately 10 s pulse recording' : null,
    },
    {
      key: 'highRateSpecificCurrentThresholdMahPerG',
      value: isCfxGitt ? 500 : null,
    },
    {
      key: 'comparisonTargetMedianVoltageV',
      value: isCfxGitt ? 1.5 : null,
    },
    {
      key: 'comparisonTargetMedianVoltageRole',
      value: isCfxGitt ? 'display_and_comparison_only_not_protocol_cutoff' : null,
    },
    {
      key: 'protocolCutoffDefinition',
      value: isCfxGitt ? 'first_canonical_row_stop_voltage' : null,
    },
    {
      key: 'primaryComparisonDisplayPolicy',
      value: isCfxGitt ? 'comparison_target_median_voltage' : null,
    },
    {
      key: 'belowFloorRetention',
      value: isCfxGitt ? 'summary_audit_pulse_detail_export' : null,
    },
    {
      key: 'regressionRequestedWindow',
      value: isCfxGitt ? '0 < t <= 64 s' : null,
    },
    {
      key: 'primaryMetric',
      value: analysis.classification.analysisKind === 'gitt' ? 'endpoint_WH' : null,
    },
    {
      key: 'endpointPulseStartDefinition',
      value: analysis.classification.analysisKind === 'gitt' ? 'loaded_t0_record' : null,
    },
    {
      key: 'endpointDeltaEtDefinition',
      value: analysis.classification.analysisKind === 'gitt' ? 'pulse_end_minus_loaded_t0' : null,
    },
    {
      key: 'restEndDefinition',
      value: analysis.classification.analysisKind === 'gitt' ? 'theil_sen_tail_endpoint' : null,
    },
    {
      key: 'firstPositivePulsePointRole',
      value: analysis.classification.analysisKind === 'gitt' ? 'diagnostic_only' : null,
    },
    {
      key: 'secondaryMetric',
      value: isCfxGitt ? 'slope_WH_CFx_10s' : null,
    },
    { key: 'regressionMode', value: analysis.classification.analysisKind === 'gitt' ? 'parallel_validation_not_primary' : null },
    {
      key: 'regressionAlgorithm',
      value: analysis.classification.analysisKind === 'gitt'
        ? `${GITT_AUXILIARY_FIT.id}@${GITT_AUXILIARY_FIT.version}`
        : null,
    },
    { key: 'regressionValidationWindows', value: regressionWindowIds.join(' | ') || null },
    {
      key: 'regressionManualWindowStartS',
      value: resolvedSettings?.regressionManualWindow?.startS ?? null,
    },
    {
      key: 'regressionManualWindowEndS',
      value: resolvedSettings?.regressionManualWindow?.endS ?? null,
    },
  ];
  const profile = analysis.cfxLiterature1200s;
  const cfxProfileRows: CfxProfileExportRowV1[] = profile === null
    ? []
    : profile.comparativeProfile.pulses.map((pulse) => {
      const programEvent = profile.programExecution.allEvents.find(
        (event) => event.sourcePulseId === pulse.sourcePulseId,
      ) ?? null;
      return {
        pulseOrder: pulse.sourceOrder,
        medianVoltageV: pulse.medianVoltageV,
        equivalentSpecificCurrentMahPerG: pulse.polarization.equivalentSpecificCurrentMahPerG,
        displayComparisonEligibility: pulse.displayComparisonEligibility,
        auditDAppCandidateCm2PerS: pulse.auditDAppCandidateCm2PerS,
        protocolCutoffState: programEvent?.isPostProtocolCutoff
          ? 'post_protocol_cutoff'
          : programEvent?.termination === 'stop_voltage_terminated'
            ? 'first_protocol_cutoff_event'
            : 'before_first_protocol_cutoff',
        actualPulseDurationS: programEvent?.actualPulseDurationS ?? null,
        isPostProtocolCutoff: programEvent?.isPostProtocolCutoff ?? false,
        termination: programEvent?.termination ?? null,
        postRestState: programEvent?.postRestState ?? null,
        sequenceClassification: pulse.eventClassification,
        protocolStatus: pulse.protocolStatus,
        comparisonUse: pulse.comparativeUse,
        primaryComparisonEligibility: pulse.primaryComparisonEligibility,
        metricDisplayName: 'WH 平面端点手算法表观传输结果',
        whEndpointResultCm2PerS: pulse.transportComparison.dAppCandidateCm2PerS,
        absolutePulseEndPolarizationV: pulse.polarization.absolutePulseEndPolarizationV,
        restEndPotentialShiftV: pulse.polarization.restEndPotentialShiftV,
        genericQcStatus: pulse.sourceGenericState.qcStatus,
        genericQcCodes: pulse.sourceGenericState.qcCodes.join(' | '),
        primaryEndpointQcStatus: pulse.sourceGenericState.primaryEndpointQcStatus,
        primaryEndpointQcReasons: JSON.stringify(pulse.sourceGenericState.primaryEndpointQcReasons),
        cfx10SlopeQcStatus: pulse.sourceGenericState.cfx10SlopeQcStatus,
        cfx10SlopeQcReasons: JSON.stringify(pulse.sourceGenericState.cfx10SlopeQcReasons),
        modelApplicability: 'limited',
        interpretationScope: 'comparative_index_only',
        modelWarnings: pulse.modelWarnings.map((warning) => warning.code).join(' | '),
      };
    });
  return { auditRows, manifest, manifestRows, cfxProfileRows };
}
