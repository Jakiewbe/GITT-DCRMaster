import type { NewareAnalysisBundle, WorkbenchSettings } from './analyze';
import type { DatasetRecipePlanV1 } from './recipe';
import type { WorkbenchDatasetV1 } from './project';
import { canonicalizeScientificJson } from '../science/hash';

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
  unit: 'ohm' | 'cm2_per_s';
  calculationState: string;
  qcStatus: string | null;
  qcCodes: string[];
  modelApplicability: string | null;
  interpretationScope: string;
  calculationMethod: string | null;
  pulseDurationS: number | null;
  pulseStartVoltageV: number | null;
  pulseEndVoltageV: number | null;
  deltaEtV: number | null;
  deltaEsV: number | null;
  fitSlopeVPerSqrtS: number | null;
  fitInterceptV: number | null;
  fitRSquared: number | null;
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
      metricDisplayName: result.requestedMetric === 'first_sample'
        ? 'DCR 首采样表观脉冲电阻'
        : `${result.requestedMetric} 表观脉冲电阻`,
      formalValue: result.resistanceOhm,
      auditCandidateValue: result.diagnosticCandidateResistanceOhm,
      unit: 'ohm',
      calculationState: result.calculationState,
      qcStatus: result.qcStatus,
      qcCodes: result.qcCodes,
      modelApplicability: null,
      interpretationScope: 'protocol_and_timepoint_dependent_apparent_resistance',
      calculationMethod: null,
      pulseDurationS: null,
      pulseStartVoltageV: null,
      pulseEndVoltageV: null,
      deltaEtV: null,
      deltaEsV: null,
      fitSlopeVPerSqrtS: null,
      fitInterceptV: null,
      fitRSquared: null,
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

  return analysis.gittResults.map((result) => ({
    ...common,
    resultType: 'gitt',
    resultId: result.pulseId,
    metricKind: result.metricKind,
    metricDisplayName: result.metricKind === 'wh_comparative_transport_index'
      ? 'WH 平面端点手算法表观传输结果'
      : '表观化学扩散系数',
    formalValue: result.metricValueCm2PerS,
    auditCandidateValue: result.diagnosticCandidateMetricValueCm2PerS,
    unit: 'cm2_per_s',
    calculationState: result.calculationState,
    qcStatus: result.qcStatus,
    qcCodes: result.qcCodes,
    modelApplicability: result.modelApplicability,
    interpretationScope: result.interpretationScope,
    calculationMethod: result.calculationMethod,
    pulseDurationS: result.pulseDurationS,
    pulseStartVoltageV: result.pulseStartVoltageV,
    pulseEndVoltageV: result.pulseEndVoltageV,
    deltaEtV: result.deltaEtV,
    deltaEsV: result.deltaEsV,
    fitSlopeVPerSqrtS: result.fitDiagnostics?.slopeVPerSqrtS ?? null,
    fitInterceptV: result.fitDiagnostics?.interceptV ?? null,
    fitRSquared: result.fitDiagnostics?.rSquared ?? null,
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
  }));
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
  actualPulseDurationS: number | null;
  termination: string | null;
  postRestState: string | null;
  sequenceClassification: string;
  comparisonUse: string;
  metricDisplayName: 'WH 平面端点手算法表观传输结果';
  whEndpointResultCm2PerS: number | null;
  absolutePulseEndPolarizationV: number | null;
  restEndPotentialShiftV: number | null;
  genericQcStatus: string | null;
  genericQcCodes: string;
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
  ];
  const profile = analysis.cfxLiterature1200s;
  const cfxProfileRows: CfxProfileExportRowV1[] = profile === null
    ? []
    : profile.comparativeProfile.pulses.map((pulse) => {
      const programEvent = profile.programExecution.events.find(
        (event) => event.sourcePulseId === pulse.sourcePulseId,
      ) ?? null;
      return {
        pulseOrder: pulse.sourceOrder,
        actualPulseDurationS: programEvent?.actualPulseDurationS ?? null,
        termination: programEvent?.termination ?? null,
        postRestState: programEvent?.postRestState ?? null,
        sequenceClassification: pulse.eventClassification,
        comparisonUse: pulse.comparativeUse,
        metricDisplayName: 'WH 平面端点手算法表观传输结果',
        whEndpointResultCm2PerS: pulse.transportComparison.dAppCandidateCm2PerS,
        absolutePulseEndPolarizationV: pulse.polarization.absolutePulseEndPolarizationV,
        restEndPotentialShiftV: pulse.polarization.restEndPotentialShiftV,
        genericQcStatus: pulse.sourceGenericState.qcStatus,
        genericQcCodes: pulse.sourceGenericState.qcCodes.join(' | '),
        modelApplicability: 'limited',
        interpretationScope: 'comparative_index_only',
        modelWarnings: pulse.modelWarnings.map((warning) => warning.code).join(' | '),
      };
    });
  return { auditRows, manifest, manifestRows, cfxProfileRows };
}
