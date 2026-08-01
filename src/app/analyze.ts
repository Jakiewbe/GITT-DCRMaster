import type {
  AnalysisVersionsV1,
  DcrMetricResultV1,
  GittResultV1,
  MaterialPresetV1,
  MeasurementResolutionSetV1,
  QcStatus,
  SocBasisV1,
} from '../science/contracts';
import { analyzeDcrEventV1 } from '../science/dcr';
import { analyzeGittPulse } from '../science/gitt';
import {
  hashAnalysisConfig,
  hashAnalysisInput,
  hashScientificResult,
} from '../science/hash';
import {
  DCR_ALGORITHM,
  GITT_ALGORITHM,
  createVersionSet,
} from '../science/versions';
import { computeSocTrajectory, type SocTrajectoryResultV1 } from '../science/soc';
import { chooseResolutionEvidence } from '../science/measurementResolution';
import {
  buildNewareDcrEvents,
  buildNewareGittPulses,
  classifyNewareProfile,
  type NewareProfileClassification,
} from '../adapters/neware/events';
import {
  buildNewareCfxGitt1200sProfile,
  NEWARE_CFX_GITT_1200S_PROGRAM_PROFILE_V1,
  type NewareGitt1200sProfileResultV1,
} from '../adapters/neware/gitt1200sProfile';
import {
  deriveNewareMeasurementResolution,
  type NewareCanonicalDataset,
} from '../adapters/neware/normalize';
import {
  analyzeCfxLiterature1200sGittProfile,
  CFX_LITERATURE_GITT_1200S_PROFILE_V1,
  type CfxLiterature1200sGittProfileResultV1,
} from '../product/cfx';
import { APP_VERSION, BUILD_COMMIT } from './buildInfo';

export type WorkbenchSettings = {
  electrodeDiameterCm: number;
  electrodeDiameterStandardUncertaintyCm: number | null;
  activeMassStandardUncertaintyG: number | null;
  currentResolutionA: number | null;
  voltageResolutionV: number | null;
  material: MaterialPresetV1;
  initialSocPct: number | null;
  initialSocSource: SocBasisV1['initialSocSource'];
  datasetStartsAtFreshCell: boolean;
  /**
   * Per-file mass selected by the minimal experiment recipe.  It is optional
   * for legacy projects; when absent Neware SCQ metadata remains the fallback.
   */
  activeMassOverrideG?: number | null;
  activeMassSourceId?: string | null;
  /** Recipe provenance is scientific input, never UI-only display state. */
  recipeVersion?: string | null;
  recipeSourceFileHash?: string | null;
  recipeAnalysisKind?: 'dcr' | 'gitt' | null;
  recipeMaterialProfileId?: string | null;
  recipeGeometryInputMode?: 'diameter' | 'area' | null;
  recipeElectrodeAreaCm2?: number | null;
  socRequested?: boolean;
};

/** Build provenance retained in manifests but excluded from scientific hashes. */
export type AppBuildMetadata = Pick<AnalysisVersionsV1, 'appVersion' | 'buildCommit'>;

const DEFAULT_APP_BUILD_METADATA: AppBuildMetadata = {
  appVersion: APP_VERSION,
  buildCommit: BUILD_COMMIT,
};

export type AnalysisCounts = {
  total: number;
  valid: number;
  review: number;
  rejected: number;
  notComputable: number;
};

/**
 * Records the exact active-material mass used by the calculation.  The
 * source is retained independently of the raw Neware metadata so a recipe
 * selection cannot be mistaken for an automatic parser inference.
 */
export type ResolvedActiveMassProvenanceV1 = {
  activeMassG: number | null;
  sourceId: string | null;
  resolution: 'recipe_override' | 'neware_metadata' | 'unavailable';
};

/**
 * CFx's fixed 1200 s program semantics and model-limited comparative profile
 * are part of the analyzed scientific result, rather than a UI-only view.
 */
export type CfxLiterature1200sAnalysisV1 = {
  programExecution: NewareGitt1200sProfileResultV1;
  comparativeProfile: CfxLiterature1200sGittProfileResultV1;
  activeMassProvenance: ResolvedActiveMassProvenanceV1;
  recipe: {
    recipeVersion: string | null;
    materialProfileId: string | null;
    geometryInputMode: 'diameter' | 'area' | null;
    electrodeAreaCm2: number | null;
  };
};

export type NewareAnalysisBundle = {
  classification: NewareProfileClassification;
  dcrResults: DcrMetricResultV1[];
  gittResults: GittResultV1[];
  cfxLiterature1200s: CfxLiterature1200sAnalysisV1 | null;
  activeMassProvenance: ResolvedActiveMassProvenanceV1 | null;
  socTrajectory: SocTrajectoryResultV1 | null;
  measurementResolution: MeasurementResolutionSetV1;
  counts: AnalysisCounts;
  configHash: string;
  analysisInputHash: string;
  resultHash: string;
  versions: AnalysisVersionsV1;
};

function createWorkbenchConfigSnapshot(
  analysisKind: NewareProfileClassification['analysisKind'],
  settings: WorkbenchSettings,
  measurementResolution: MeasurementResolutionSetV1,
  activeMassProvenance: ResolvedActiveMassProvenanceV1 | null,
) {
  const base = { schema: 'workbench-analysis-config-v4', analysisKind } as const;
  if (analysisKind === 'dcr') {
    return {
      ...base,
      dcr: {
        currentResolution: measurementResolution.currentA,
        voltageResolution: measurementResolution.voltageV,
      },
    };
  }
  if (analysisKind === 'gitt') {
    return {
      ...base,
      gitt: {
        electrodeDiameterCm: settings.electrodeDiameterCm,
        electrodeDiameterStandardUncertaintyCm:
          settings.electrodeDiameterStandardUncertaintyCm,
        activeMassStandardUncertaintyG: settings.activeMassStandardUncertaintyG,
        activeMass: activeMassProvenance === null
          ? null
          : {
            valueG: activeMassProvenance.activeMassG,
            sourceId: activeMassProvenance.sourceId,
            resolution: activeMassProvenance.resolution,
          },
        voltageResolution: measurementResolution.voltageV,
        material: settings.material,
        initialSocPct: settings.initialSocPct,
        initialSocSource: settings.initialSocSource,
        datasetStartsAtFreshCell: settings.datasetStartsAtFreshCell,
        recipe: {
          recipeVersion: settings.recipeVersion ?? null,
          sourceFileHash: settings.recipeSourceFileHash ?? null,
          analysisKind: settings.recipeAnalysisKind ?? null,
          materialProfileId: settings.recipeMaterialProfileId ?? null,
          geometryInputMode: settings.recipeGeometryInputMode ?? null,
          electrodeAreaCm2: settings.recipeElectrodeAreaCm2 ?? null,
          socRequested: settings.socRequested ?? false,
        },
        cfxLiterature1200sProfile:
          settings.material.materialFamily === 'cfx_conversion'
            ? {
              profileId: CFX_LITERATURE_GITT_1200S_PROFILE_V1.profileId,
              profileVersion: CFX_LITERATURE_GITT_1200S_PROFILE_V1.profileVersion,
              newareProgramProfileId: NEWARE_CFX_GITT_1200S_PROGRAM_PROFILE_V1.profileId,
              newareProgramProfileVersion:
                NEWARE_CFX_GITT_1200S_PROGRAM_PROFILE_V1.profileVersion,
            }
            : null,
      },
    };
  }
  return { ...base, analysis: 'not_requested' as const };
}

function resolveGittActiveMass(
  dataset: NewareCanonicalDataset,
  settings: WorkbenchSettings,
): ResolvedActiveMassProvenanceV1 {
  if (settings.activeMassOverrideG !== null && settings.activeMassOverrideG !== undefined) {
    return {
      activeMassG: settings.activeMassOverrideG,
      sourceId: settings.activeMassSourceId ?? 'recipe_active_mass_override_unattributed',
      resolution: 'recipe_override',
    };
  }

  if (dataset.metadata.activeMassMg !== null) {
    return {
      activeMassG: dataset.metadata.activeMassMg / 1000,
      sourceId: 'neware_metadata',
      resolution: 'neware_metadata',
    };
  }

  return {
    activeMassG: null,
    sourceId: null,
    resolution: 'unavailable',
  };
}

function theoreticalQrefAh(
  activeMassG: number | null,
  material: MaterialPresetV1,
): number {
  if (
    activeMassG === null ||
    !Number.isFinite(activeMassG) ||
    !Number.isFinite(material.theoreticalSpecificCapacityMahPerG) ||
    material.theoreticalSpecificCapacityMahPerG === null
  ) {
    return Number.NaN;
  }
  return (activeMassG * material.theoreticalSpecificCapacityMahPerG) / 1000;
}

export function resolveNewareMeasurementResolution(
  dataset: NewareCanonicalDataset,
  settings: Pick<WorkbenchSettings, 'currentResolutionA' | 'voltageResolutionV'>,
): MeasurementResolutionSetV1 {
  const automatic = deriveNewareMeasurementResolution(dataset.metadata);
  return {
    currentA: chooseResolutionEvidence(settings.currentResolutionA, automatic.currentA, 'Current'),
    voltageV: chooseResolutionEvidence(settings.voltageResolutionV, automatic.voltageV, 'Voltage'),
  };
}

function countResults(
  results: Array<DcrMetricResultV1 | GittResultV1>,
): AnalysisCounts {
  return results.reduce<AnalysisCounts>(
    (counts, result) => {
      counts.total += 1;
      if (result.calculationState === 'not_computable') counts.notComputable += 1;
      if (result.qcStatus === 'valid') counts.valid += 1;
      if (result.qcStatus === 'review') counts.review += 1;
      if (result.qcStatus === 'rejected') counts.rejected += 1;
      return counts;
    },
    { total: 0, valid: 0, review: 0, rejected: 0, notComputable: 0 },
  );
}

function algorithmFor(classification: NewareProfileClassification) {
  if (classification.analysisKind === 'gitt') return GITT_ALGORITHM;
  if (classification.analysisKind === 'dcr') return DCR_ALGORITHM;
  return {
    id: 'NOT_REQUESTED',
    version: '1.0.0',
    qcPolicyId: 'NOT_REQUESTED',
  } as const;
}

export function createNewareAnalysisIdentity(
  dataset: NewareCanonicalDataset,
  settings: WorkbenchSettings,
  appBuildMetadata: AppBuildMetadata = DEFAULT_APP_BUILD_METADATA,
) {
  const classification = classifyNewareProfile(dataset);
  const algorithm = algorithmFor(classification);
  const measurementResolution = resolveNewareMeasurementResolution(dataset, settings);
  const activeMassProvenance =
    classification.analysisKind === 'gitt' ? resolveGittActiveMass(dataset, settings) : null;
  const configHash = hashAnalysisConfig(
    createWorkbenchConfigSnapshot(
      classification.analysisKind,
      settings,
      measurementResolution,
      activeMassProvenance,
    ),
  );
  const versions = createVersionSet({
    ...appBuildMetadata,
    parserVersion: dataset.metadata.parserProfileVersion,
    vendorProfileId: classification.vendorProfileId,
    vendorProfileVersion: dataset.metadata.parserProfileVersion,
    algorithmId: algorithm.id,
    algorithmVersion: algorithm.version,
    qcPolicyId: algorithm.qcPolicyId,
    materialPresetId:
      classification.analysisKind === 'gitt' ? settings.material.materialPresetId : 'NOT_APPLICABLE',
  });
  const analysisInputHash = hashAnalysisInput({
    canonicalDatasetHash: dataset.canonicalDatasetHash,
    configHash,
    versions,
  });
  return {
    classification,
    configHash,
    versions,
    analysisInputHash,
    measurementResolution,
    activeMassProvenance,
  };
}

export function analyzeNewareDataset(
  dataset: NewareCanonicalDataset,
  settings: WorkbenchSettings,
  appBuildMetadata: AppBuildMetadata = DEFAULT_APP_BUILD_METADATA,
): NewareAnalysisBundle {
  const {
    classification,
    configHash,
    versions,
    analysisInputHash,
    measurementResolution,
    activeMassProvenance,
  } = createNewareAnalysisIdentity(dataset, settings, appBuildMetadata);

  let dcrResults: DcrMetricResultV1[] = [];
  let gittResults: GittResultV1[] = [];
  let cfxLiterature1200s: CfxLiterature1200sAnalysisV1 | null = null;
  let socTrajectory: SocTrajectoryResultV1 | null = null;

  if (classification.analysisKind === 'dcr') {
    dcrResults = buildNewareDcrEvents(dataset).flatMap((event) =>
      analyzeDcrEventV1({
        ...event,
        config: {
          ...event.config,
          currentResolutionA: measurementResolution.currentA.value,
          voltageResolutionV: measurementResolution.voltageV.value,
          currentResolutionEvidence: measurementResolution.currentA,
          voltageResolutionEvidence: measurementResolution.voltageV,
        },
      }),
    );
  }

  if (classification.analysisKind === 'gitt') {
    const activeMassG = activeMassProvenance?.activeMassG ?? null;
    const qrefAh = theoreticalQrefAh(activeMassG, settings.material);
    socTrajectory = computeSocTrajectory(
      dataset.rows,
      {
        qrefAh,
        qrefSource: 'theoretical',
        initialSocPct: settings.initialSocPct,
        initialSocSource: settings.initialSocSource,
        integrationMode: 'net_coulomb',
        chargeCoulombicEfficiency: 1,
        dischargeCoulombicEfficiency: 1,
      },
      { datasetStartsAtFreshCell: settings.datasetStartsAtFreshCell },
    );
    const socByRowId = new Map(socTrajectory.points.map((point) => [point.rowId, point]));
    gittResults = buildNewareGittPulses(
      dataset,
      settings.material,
      settings.electrodeDiameterCm,
      {
        // Keep the adapter's normal metadata path intact when the recipe did
        // not select an alternative source. A non-null recipe value wins.
        activeMassGOverride: settings.activeMassOverrideG ?? null,
        activeMassSourceId: settings.activeMassSourceId ?? null,
      },
    ).map((pulse) => {
      const prePulseRowId = pulse.preRestRows.at(-1)?.rowId ?? null;
      return analyzeGittPulse({
        ...pulse,
        socPrePulse: prePulseRowId === null ? null : socByRowId.get(prePulseRowId) ?? null,
        config: {
          ...pulse.config,
          voltageResolutionV: measurementResolution.voltageV.value,
          voltageResolutionEvidence: measurementResolution.voltageV,
          activeMassStandardUncertaintyG:
            settings.activeMassStandardUncertaintyG,
          electrodeDiameterStandardUncertaintyCm:
            settings.electrodeDiameterStandardUncertaintyCm,
        },
      });
    });

    if (settings.material.materialFamily === 'cfx_conversion') {
      const programExecution = buildNewareCfxGitt1200sProfile(dataset, gittResults);
      const retainedPulseIds = new Set(
        programExecution.events.map((event) => event.sourcePulseId),
      );
      gittResults = gittResults.filter((result) => retainedPulseIds.has(result.pulseId));
      const programEventByPulseId = new Map(
        programExecution.events.map((event) => [event.sourcePulseId, event]),
      );
      cfxLiterature1200s = {
        programExecution,
        comparativeProfile: analyzeCfxLiterature1200sGittProfile({
          material: settings.material,
          activeMassG,
          pulseResults: gittResults.map((result) => {
            const programEvent = programEventByPulseId.get(result.pulseId) ?? null;
            return {
              ...result,
              postRestDurationS: programEvent?.actualPostRestDurationS ?? null,
              pulseEndVoltageV: programEvent?.pulseEndVoltageV ?? result.pulseEndVoltageV,
              programEvent,
            };
          }),
        }),
        activeMassProvenance: activeMassProvenance ?? {
          activeMassG: null,
          sourceId: null,
          resolution: 'unavailable',
        },
        recipe: {
          recipeVersion: settings.recipeVersion ?? null,
          materialProfileId: settings.recipeMaterialProfileId ?? null,
          geometryInputMode: settings.recipeGeometryInputMode ?? null,
          electrodeAreaCm2: settings.recipeElectrodeAreaCm2 ?? null,
        },
      };
    }
  }

  const allResults = [...dcrResults, ...gittResults];
  const resultHash = hashScientificResult({
    schema: 'workbench-result-v1',
    analysisInputHash,
    classification,
    dcrResults,
    gittResults,
    cfxLiterature1200s,
    activeMassProvenance,
    socTrajectory,
  });

  return {
    classification,
    dcrResults,
    gittResults,
    cfxLiterature1200s,
    activeMassProvenance,
    socTrajectory,
    measurementResolution,
    counts: countResults(allResults),
    configHash,
    analysisInputHash,
    resultHash,
    versions,
  };
}

export function worstVisibleStatus(counts: AnalysisCounts): QcStatus | null {
  if (counts.rejected > 0) return 'rejected';
  if (counts.review > 0 || counts.notComputable > 0) return 'review';
  if (counts.valid > 0) return 'valid';
  return null;
}
