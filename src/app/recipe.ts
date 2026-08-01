import type { NewareProfileClassification } from '../adapters/neware/events';
import type { NewareCanonicalDataset } from '../adapters/neware/normalize';
import type { SocBasisV1 } from '../science/contracts';
import {
  buildMinimalExperimentRecipe,
  createMinimalExperimentRecipeInputFromNeware,
  type MinimalExperimentRecipeResultV1,
  type MinimalRecipeAutoResolvedV1,
  type MinimalRecipeBlockingV1,
  type MinimalRecipeQuestionV1,
  type MinimalRecipeResolvedFactsV1,
  type CfxRecipeMaterialProfileIdV1,
  type RecipeGeometryInputModeV1,
  type RecipeMaterialPhysicalParametersV1,
  type RecipeMaterialSelectionV1,
  type RecipeSocInputV1,
} from '../product/recipe';
import type { WorkbenchSettings } from './analyze';

/**
 * Persisted user choices sit above the scientific-core settings.  It stores
 * only facts that a user can legitimately know or confirm; the product recipe
 * module continues to own all material inference and conflict rules.
 */
export const WORKBENCH_RECIPE_SCHEMA_V1 = 'gitt-dcr-workbench-recipe-v1' as const;
export const WORKBENCH_RECIPE_VERSION_V1 = '1.1.0' as const;

export type WorkbenchDatasetRecipeSelectionV1 = {
  /** Explicit confirmation wins over the helper's filename/Remark inference. */
  materialConfirmation: RecipeMaterialSelectionV1 | null;
  /** Selected only when Neware metadata and other mass evidence conflict. */
  selectedActiveMassSourceId: string | null;
  /** Optional operator correction; null keeps the file-derived value. */
  activeMassOverrideMg: number | null;
  /** Optional dataset-specific SOC facts; omitted facts remain unknown. */
  soc: RecipeSocInputV1 | null;
};

export type WorkbenchRecipeV1 = {
  schema: typeof WORKBENCH_RECIPE_SCHEMA_V1;
  recipeVersion: typeof WORKBENCH_RECIPE_VERSION_V1;
  /** One geometry value is shared by a project until the user changes it. */
  geometryInputMode: RecipeGeometryInputModeV1;
  electrodeDiameterMm: number | null;
  electrodeAreaCm2: number | null;
  /** Shared physical defaults per material profile; null fields use preset values. */
  materialParametersByProfileId: Partial<
    Record<CfxRecipeMaterialProfileIdV1, RecipeMaterialPhysicalParametersV1>
  >;
  /** SOC is opt-in because it is not required to analyze DCR or CFx GITT. */
  soc: RecipeSocInputV1;
  /** User selections are isolated by immutable source-file identity. */
  datasetSelectionsBySourceFileHash: Record<string, WorkbenchDatasetRecipeSelectionV1>;
};

export type DatasetRecipePlanAnalysisKindV1 = 'dcr' | 'gitt' | 'unknown';

export type UnsupportedDatasetRecipeBlockingV1 = {
  code: 'analysis_kind_not_supported';
  message: string;
  questionId: null;
};

export type DatasetRecipePlanV1 = {
  recipeVersion: typeof WORKBENCH_RECIPE_VERSION_V1;
  sourceFileHash: string;
  analysisKind: DatasetRecipePlanAnalysisKindV1;
  readyToAnalyze: boolean;
  questions: MinimalRecipeQuestionV1[];
  blocking: Array<MinimalRecipeBlockingV1 | UnsupportedDatasetRecipeBlockingV1>;
  autoResolved: MinimalRecipeAutoResolvedV1[];
  /** Facts passed to the per-dataset analysis settings only after readiness. */
  resolved: MinimalRecipeResolvedFactsV1;
  /** Retained for UI audit without rebuilding the plan. */
  recipeResult: MinimalExperimentRecipeResultV1 | null;
};

/**
 * The analyzer consumes these fields as per-file scientific facts.  Keeping
 * them named here makes the recipe-to-analysis handoff explicit and prevents
 * a selected mass from being misreported as raw Neware metadata.
 */
export type RecipeResolvedWorkbenchSettingsV1 = WorkbenchSettings & {
  recipeSourceFileHash: string;
  recipeAnalysisKind: Exclude<DatasetRecipePlanAnalysisKindV1, 'unknown'>;
  recipeVersion: typeof WORKBENCH_RECIPE_VERSION_V1;
  recipeMaterialProfileId: string | null;
  recipeGeometryInputMode: RecipeGeometryInputModeV1 | null;
  recipeElectrodeAreaCm2: number | null;
  activeMassOverrideG: number | null;
  activeMassSourceId: string | null;
  socRequested: boolean;
};

export class RecipePlanNotReadyError extends Error {
  readonly code = 'recipe_plan_not_ready';
  readonly sourceFileHash: string;

  constructor(plan: DatasetRecipePlanV1) {
    super(`recipe_plan_not_ready:${plan.sourceFileHash}`);
    this.name = 'RecipePlanNotReadyError';
    this.sourceFileHash = plan.sourceFileHash;
  }
}

function createDefaultSocInput(): RecipeSocInputV1 {
  return {
    requested: false,
    initialSocPct: null,
    initialSocSource: 'unknown',
    datasetStartsAtFreshCell: false,
  };
}

function createEmptyResolvedFacts(): MinimalRecipeResolvedFactsV1 {
  return {
    material: null,
    activeMassG: null,
    activeMassSourceId: null,
    electrodeDiameterCm: null,
    electrodeAreaCm2: null,
    geometryInputMode: null,
    qrefAh: null,
    soc: {
      requested: false,
      initialSocPct: null,
      initialSocSource: 'unknown',
      available: false,
    },
  };
}

function resolveDatasetSelection(
  recipe: WorkbenchRecipeV1,
  sourceFileHash: string,
): WorkbenchDatasetRecipeSelectionV1 | null {
  return recipe.datasetSelectionsBySourceFileHash[sourceFileHash] ?? null;
}

function mergeSocInput(
  projectSoc: RecipeSocInputV1,
  datasetSoc: RecipeSocInputV1 | null,
): RecipeSocInputV1 {
  return {
    requested: datasetSoc?.requested ?? projectSoc.requested ?? false,
    initialSocPct: datasetSoc?.initialSocPct ?? projectSoc.initialSocPct ?? null,
    initialSocSource: datasetSoc?.initialSocSource ?? projectSoc.initialSocSource ?? 'unknown',
    datasetStartsAtFreshCell:
      datasetSoc?.datasetStartsAtFreshCell ?? projectSoc.datasetStartsAtFreshCell ?? false,
  };
}

function resetSocSettings(): Pick<
  WorkbenchSettings,
  'initialSocPct' | 'initialSocSource' | 'datasetStartsAtFreshCell'
> {
  return {
    initialSocPct: null,
    initialSocSource: 'unknown',
    datasetStartsAtFreshCell: false,
  };
}

function resolvedSocSettings(
  resolved: MinimalRecipeResolvedFactsV1['soc'],
): Pick<WorkbenchSettings, 'initialSocPct' | 'initialSocSource' | 'datasetStartsAtFreshCell'> {
  if (!resolved.requested || !resolved.available || resolved.initialSocPct === null) {
    return resetSocSettings();
  }

  return {
    initialSocPct: resolved.initialSocPct,
    initialSocSource: resolved.initialSocSource,
    datasetStartsAtFreshCell: resolved.initialSocSource === 'fresh_cell_assumption',
  };
}

/** Creates a fresh JSON-persistable recipe with no hidden scientific defaults. */
export function createDefaultWorkbenchRecipe(): WorkbenchRecipeV1 {
  return {
    schema: WORKBENCH_RECIPE_SCHEMA_V1,
    recipeVersion: WORKBENCH_RECIPE_VERSION_V1,
    geometryInputMode: 'diameter',
    electrodeDiameterMm: null,
    electrodeAreaCm2: null,
    materialParametersByProfileId: {},
    soc: createDefaultSocInput(),
    datasetSelectionsBySourceFileHash: {},
  };
}

/**
 * Builds one dataset's minimal analysis plan.  CFx/FGS inference and all
 * material/mass conflict decisions are delegated to `product/recipe`; this
 * bridge merely supplies persisted confirmations by source-file hash.
 */
export function buildDatasetRecipePlan(
  dataset: NewareCanonicalDataset,
  classification: Pick<NewareProfileClassification, 'analysisKind'>,
  recipe: WorkbenchRecipeV1,
): DatasetRecipePlanV1 {
  const analysisKind = classification.analysisKind;
  if (analysisKind === 'unknown') {
    return {
      recipeVersion: WORKBENCH_RECIPE_VERSION_V1,
      sourceFileHash: dataset.sourceFileHash,
      analysisKind,
      readyToAnalyze: false,
      questions: [],
      blocking: [
        {
          code: 'analysis_kind_not_supported',
          message: 'This file does not match an approved DCR or GITT analysis profile.',
          questionId: null,
        },
      ],
      autoResolved: [],
      resolved: createEmptyResolvedFacts(),
      recipeResult: null,
    };
  }

  const selection = resolveDatasetSelection(recipe, dataset.sourceFileHash);
  const result = buildMinimalExperimentRecipe(
    createMinimalExperimentRecipeInputFromNeware(dataset, {
      analysisKind,
      materialConfirmation: selection?.materialConfirmation ?? undefined,
      selectedActiveMassSourceId: selection?.selectedActiveMassSourceId ?? undefined,
      userOverrideActiveMassMg: selection?.activeMassOverrideMg ?? undefined,
      geometry: {
        inputMode: recipe.geometryInputMode,
        electrodeDiameterMm: recipe.electrodeDiameterMm,
        electrodeAreaCm2: recipe.electrodeAreaCm2,
      },
      materialParametersByProfileId: recipe.materialParametersByProfileId,
      soc: mergeSocInput(recipe.soc, selection?.soc ?? null),
    }),
  );

  return {
    recipeVersion: WORKBENCH_RECIPE_VERSION_V1,
    sourceFileHash: dataset.sourceFileHash,
    analysisKind,
    readyToAnalyze: result.readyToAnalyze,
    questions: result.questions,
    blocking: result.blocking,
    autoResolved: result.autoResolved,
    resolved: result.resolved,
    recipeResult: result,
  };
}

/**
 * Resolves project-wide base settings into the facts for exactly one source
 * file. Calling this before a plan is ready is deliberately an error: falling
 * back to a stale project material, diameter, or SOC would be scientifically
 * unsafe.
 */
export function applyRecipePlanToWorkbenchSettings(
  baseSettings: WorkbenchSettings,
  plan: DatasetRecipePlanV1,
): RecipeResolvedWorkbenchSettingsV1 {
  if (!plan.readyToAnalyze || plan.analysisKind === 'unknown') {
    throw new RecipePlanNotReadyError(plan);
  }

  if (plan.analysisKind === 'dcr') {
    return {
      ...baseSettings,
      recipeSourceFileHash: plan.sourceFileHash,
      recipeAnalysisKind: 'dcr',
      recipeVersion: plan.recipeVersion,
      recipeMaterialProfileId: null,
      recipeGeometryInputMode: null,
      recipeElectrodeAreaCm2: null,
      activeMassOverrideG: null,
      activeMassSourceId: null,
      socRequested: false,
    };
  }

  const material = plan.resolved.material;
  const electrodeDiameterCm = plan.resolved.electrodeDiameterCm;
  const electrodeAreaCm2 = plan.resolved.electrodeAreaCm2;
  const activeMassG = plan.resolved.activeMassG;
  const activeMassSourceId = plan.resolved.activeMassSourceId;
  if (
    material === null ||
    electrodeDiameterCm === null ||
    electrodeAreaCm2 === null ||
    activeMassG === null ||
    activeMassSourceId === null
  ) {
    throw new RecipePlanNotReadyError(plan);
  }

  return {
    ...baseSettings,
    material: material.preset,
    electrodeDiameterCm,
    ...resolvedSocSettings(plan.resolved.soc),
    recipeSourceFileHash: plan.sourceFileHash,
    recipeAnalysisKind: 'gitt',
    recipeVersion: plan.recipeVersion,
    recipeMaterialProfileId: material.profileId,
    recipeGeometryInputMode: plan.resolved.geometryInputMode,
    recipeElectrodeAreaCm2: electrodeAreaCm2,
    activeMassOverrideG: activeMassG,
    activeMassSourceId,
    socRequested: plan.resolved.soc.requested,
  };
}

/** Useful to project serializers that want a named source for this enum. */
export type RecipeInitialSocSourceV1 = SocBasisV1['initialSocSource'];
