import type { MaterialPresetV1, SocBasisV1 } from '../../science/contracts';
import { createCf1MaterialPreset } from '../../science/material';
import type { NewareCanonicalDataset } from '../../adapters/neware/normalize';

/**
 * The product-level recipe intentionally has a much smaller surface than the
 * science-core configuration.  It decides which facts a scientist must
 * confirm before an analysis can start; it does not ask them to manufacture
 * uncertainty or instrument-resolution values.
 */
export const MINIMAL_EXPERIMENT_RECIPE_VERSION = '1.1.0' as const;

export type MinimalRecipeAnalysisKindV1 = 'dcr' | 'gitt';

/**
 * `fgs_cf1_reference` means the CF1 constants are a fixed comparative
 * normalization, not a claim that they are the measured FGS density or
 * stoichiometry.  The resulting GITT metric remains model-limited.
 */
export type CfxRecipeMaterialProfileIdV1 = 'cf1' | 'fgs_cf1_reference';

export type MaterialRecognitionConfidenceV1 =
  | 'confirmed'
  | 'inferred'
  | 'uncertain'
  | 'unknown';

export type RecipeMaterialSelectionV1 = {
  profileId: CfxRecipeMaterialProfileIdV1 | null;
  confidence?: MaterialRecognitionConfidenceV1;
  /** Evidence shown in the confirmation prompt, for example a file name. */
  evidence?: string[];
};

export type RecipeMassEvidenceV1 = {
  /** Stable UI value, such as `filename` or `neware_remark`. */
  sourceId: string;
  label: string;
  massMg: number | null;
};

export type RecipeActiveMassInputV1 = {
  /** Neware's active-material mass metadata (SCQ), in mg. */
  metadataMassMg: number | null;
  /** Optional corroborating values extracted from the file name or Remark. */
  corroboratingEvidence?: readonly RecipeMassEvidenceV1[];
  /**
   * A response to a previous `confirm_active_mass_source` prompt.  This is a
   * source choice, never a request to type an uncertainty.
   */
  selectedSourceId?: string | null;
  /** Optional operator correction in mg; when present it is authoritative. */
  userOverrideMassMg?: number | null;
};

export type RecipeGeometryInputModeV1 = 'diameter' | 'area';

export type RecipeGeometryInputV1 = {
  inputMode?: RecipeGeometryInputModeV1;
  /** User-facing unit. The resolved science configuration uses cm. */
  electrodeDiameterMm?: number | null;
  /** Direct single-face geometric area, never BET area. */
  electrodeAreaCm2?: number | null;
};

export type RecipeMaterialPhysicalParametersV1 = {
  /** A null value means "use the material-profile default". */
  densityGPerCm3?: number | null;
  /** A null value means "use the material-profile default". */
  molarMassGPerMol?: number | null;
};

export type RecipeSocInputV1 = {
  /** Defaults to false. SOC is an optional display/axis, not a GITT blocker. */
  requested?: boolean;
  initialSocPct?: number | null;
  initialSocSource?: SocBasisV1['initialSocSource'];
  /** If this fact is already known at project level, 100% is derived. */
  datasetStartsAtFreshCell?: boolean;
};

export type MinimalExperimentRecipeInputV1 = {
  analysisKind: MinimalRecipeAnalysisKindV1;
  material?: RecipeMaterialSelectionV1;
  activeMass?: RecipeActiveMassInputV1;
  geometry?: RecipeGeometryInputV1;
  materialParametersByProfileId?: Partial<
    Record<CfxRecipeMaterialProfileIdV1, RecipeMaterialPhysicalParametersV1>
  >;
  soc?: RecipeSocInputV1;
};

export type MinimalRecipeQuestionIdV1 =
  | 'confirm_material_profile'
  | 'confirm_active_mass_source'
  | 'electrode_diameter_mm'
  | 'electrode_area_cm2'
  | 'active_mass_mg'
  | 'material_density_g_per_cm3'
  | 'material_molar_mass_g_per_mol'
  | 'initial_soc_pct';

export type MinimalRecipeQuestionV1 = {
  id: MinimalRecipeQuestionIdV1;
  required: boolean;
  title: string;
  prompt: string;
  /** Values are supplied only for a constrained source/profile choice. */
  choices?: Array<{ value: string; label: string; detail: string }>;
};

export type MinimalRecipeBlockingCodeV1 =
  | 'material_profile_confirmation_required'
  | 'active_mass_conflict'
  | 'active_mass_metadata_missing'
  | 'active_mass_source_selection_invalid'
  | 'active_mass_override_invalid'
  | 'electrode_diameter_required'
  | 'electrode_diameter_invalid'
  | 'electrode_area_required'
  | 'electrode_area_invalid'
  | 'material_density_invalid'
  | 'material_molar_mass_invalid';

export type MinimalRecipeBlockingV1 = {
  code: MinimalRecipeBlockingCodeV1;
  message: string;
  questionId: MinimalRecipeQuestionIdV1 | null;
};

export type MinimalRecipeAutoResolvedIdV1 =
  | 'dcr_requires_no_material_geometry_or_soc'
  | 'material_profile_inferred'
  | 'neware_active_mass_metadata'
  | 'neware_metadata_mass_corroborated_by_filename'
  | 'active_mass_source_confirmed'
  | 'active_mass_user_override'
  | 'cf1_density_reference_2_25_g_per_cm3'
  | 'material_density_user_override'
  | 'material_molar_mass_user_override'
  | 'cf1_theoretical_capacity_865_mah_per_g'
  | 'electrode_diameter_project_value'
  | 'electrode_area_project_value'
  | 'fresh_cell_initial_soc_100_pct'
  | 'provided_initial_soc';

export type MinimalRecipeAutoResolvedV1 = {
  id: MinimalRecipeAutoResolvedIdV1;
  label: string;
  value: string | number | null;
};

export type ResolvedRecipeMaterialV1 = {
  profileId: CfxRecipeMaterialProfileIdV1;
  preset: MaterialPresetV1;
  /** `true` for FGS normalized to the CF1 reference constants. */
  comparativeReferenceOnly: boolean;
  interpretationBoundary: 'comparative_index_only';
};

export type MinimalRecipeResolvedFactsV1 = {
  material: ResolvedRecipeMaterialV1 | null;
  activeMassG: number | null;
  activeMassSourceId: string | null;
  electrodeDiameterCm: number | null;
  electrodeAreaCm2: number | null;
  geometryInputMode: RecipeGeometryInputModeV1 | null;
  qrefAh: number | null;
  soc: {
    requested: boolean;
    initialSocPct: number | null;
    initialSocSource: SocBasisV1['initialSocSource'];
    available: boolean;
  };
};

export type MinimalExperimentRecipeResultV1 = {
  recipeVersion: typeof MINIMAL_EXPERIMENT_RECIPE_VERSION;
  analysisKind: MinimalRecipeAnalysisKindV1;
  /** True when the core analysis can start. A missing optional SOC does not block it. */
  readyToAnalyze: boolean;
  questions: MinimalRecipeQuestionV1[];
  blocking: MinimalRecipeBlockingV1[];
  autoResolved: MinimalRecipeAutoResolvedV1[];
  resolved: MinimalRecipeResolvedFactsV1;
};

type NormalizedMassSource = RecipeMassEvidenceV1 & { massMg: number };

const NEWARE_METADATA_MASS_SOURCE_ID = 'neware_metadata';

function positiveFinite(value: number | null | undefined): value is number {
  return value !== null && value !== undefined && Number.isFinite(value) && value > 0;
}

function finiteSoc(value: number | null | undefined): value is number {
  return value !== null && value !== undefined && Number.isFinite(value) && value >= 0 && value <= 100;
}

function isKnownMaterialProfile(
  value: CfxRecipeMaterialProfileIdV1 | null | undefined,
): value is CfxRecipeMaterialProfileIdV1 {
  return value === 'cf1' || value === 'fgs_cf1_reference';
}

function materialPrompt(): MinimalRecipeQuestionV1 {
  return {
    id: 'confirm_material_profile',
    required: true,
    title: '确认材料 profile',
    prompt: '软件无法可靠区分 CF₁ 与 FGS。请确认本批材料；不会要求填写密度、不确定度或仪器分辨率。',
    choices: [
      {
        value: 'cf1',
        label: 'CF₁ / CFₓ',
        detail: '采用项目 CF₁ 参考常数：密度 2.25 g/cm³、理论容量 865 mAh/g。',
      },
      {
        value: 'fgs_cf1_reference',
        label: 'FGS',
        detail: '采用 CF₁ 参考归一化，仅用于同协议表观比较，不将其称为 FGS 实测物性。',
      },
    ],
  };
}

function createResolvedMaterial(profileId: CfxRecipeMaterialProfileIdV1): ResolvedRecipeMaterialV1 {
  const cf1 = createCf1MaterialPreset();
  if (profileId === 'cf1') {
    return {
      profileId,
      preset: cf1,
      comparativeReferenceOnly: false,
      interpretationBoundary: 'comparative_index_only',
    };
  }

  return {
    profileId,
    preset: {
      ...cf1,
      materialPresetId: 'FGS_CF1_REFERENCE_NORMALIZATION_2026_07',
      displayName: 'FGS (CF1 reference normalization; comparative only)',
      presetVersion: '1.0.0',
    },
    comparativeReferenceOnly: true,
    interpretationBoundary: 'comparative_index_only',
  };
}

function applyMaterialPhysicalParameters(
  material: ResolvedRecipeMaterialV1,
  parameters: RecipeMaterialPhysicalParametersV1 | undefined,
  questions: MinimalRecipeQuestionV1[],
  blocking: MinimalRecipeBlockingV1[],
  autoResolved: MinimalRecipeAutoResolvedV1[],
): ResolvedRecipeMaterialV1 {
  const densityOverride = parameters?.densityGPerCm3 ?? null;
  const molarMassOverride = parameters?.molarMassGPerMol ?? null;
  let densityGPerCm3 = material.preset.densityGPerCm3;
  let molarMassGPerMol = material.preset.molarMassGPerMol;
  let userOverridden = false;

  if (densityOverride !== null) {
    if (!positiveFinite(densityOverride)) {
      questions.push({
        id: 'material_density_g_per_cm3',
        required: true,
        title: '材料密度',
        prompt: '材料密度必须是大于 0 的 g/cm³ 数值；清空可恢复材料默认值。',
      });
      blocking.push({
        code: 'material_density_invalid',
        message: '材料密度无效，无法建立 WH 等效长度。',
        questionId: 'material_density_g_per_cm3',
      });
    } else {
      densityGPerCm3 = densityOverride;
      userOverridden = true;
      autoResolved.push({
        id: 'material_density_user_override',
        label: '用户设置的材料密度',
        value: densityOverride,
      });
    }
  }

  if (molarMassOverride !== null) {
    if (!positiveFinite(molarMassOverride)) {
      questions.push({
        id: 'material_molar_mass_g_per_mol',
        required: true,
        title: '材料摩尔质量',
        prompt: '材料摩尔质量必须是大于 0 的 g/mol 数值；清空可恢复材料默认值。',
      });
      blocking.push({
        code: 'material_molar_mass_invalid',
        message: '材料摩尔质量无效，无法建立材料几何归一化。',
        questionId: 'material_molar_mass_g_per_mol',
      });
    } else {
      molarMassGPerMol = molarMassOverride;
      userOverridden = true;
      autoResolved.push({
        id: 'material_molar_mass_user_override',
        label: '用户设置的材料摩尔质量',
        value: molarMassOverride,
      });
    }
  }

  if (densityGPerCm3 === null || !positiveFinite(densityGPerCm3)) return material;

  return {
    ...material,
    preset: {
      ...material.preset,
      molarMassGPerMol,
      densityGPerCm3,
      densitySource: densityOverride === null
        ? material.preset.densitySource
        : 'user_input',
      densityMethod: densityOverride === null ? material.preset.densityMethod : null,
      densityStandardUncertainty:
        densityOverride === null ? material.preset.densityStandardUncertainty : null,
      molarVolumeCm3PerMol: molarMassGPerMol / densityGPerCm3,
      molarVolumeAuthority: 'derived_from_density',
      userOverridden: material.preset.userOverridden || userOverridden,
    },
  };
}

function normalizeMassSources(input: RecipeActiveMassInputV1 | undefined): NormalizedMassSource[] {
  const sources: RecipeMassEvidenceV1[] = [];
  if (input && positiveFinite(input.metadataMassMg)) {
    sources.push({
      sourceId: NEWARE_METADATA_MASS_SOURCE_ID,
      label: 'Neware 文件参数中的活性物质质量',
      massMg: input.metadataMassMg,
    });
  }
  for (const evidence of input?.corroboratingEvidence ?? []) {
    if (!positiveFinite(evidence.massMg) || sources.some((source) => source.sourceId === evidence.sourceId)) {
      continue;
    }
    sources.push({ ...evidence, massMg: evidence.massMg });
  }
  return sources as NormalizedMassSource[];
}

function hasMassConflict(metadataMassMg: number | null, sources: readonly NormalizedMassSource[]): boolean {
  if (sources.length < 2) return false;
  const reference = positiveFinite(metadataMassMg) ? metadataMassMg : sources[0].massMg;
  const toleranceMg = Math.max(0.01, reference * 0.01);
  return sources.some((source) => Math.abs(source.massMg - reference) > toleranceMg);
}

function massToleranceMg(referenceMassMg: number): number {
  return Math.max(0.01, referenceMassMg * 0.01);
}

/**
 * A stale Remark is common in exported channel programs.  When the immutable
 * Neware SCQ value and the file name independently agree, that agreement is
 * stronger evidence than an unrelated Remark.  The decision is still kept in
 * the automatic-receipt list rather than silently discarding the discrepancy.
 */
function metadataMassIsCorroborated(
  metadataMassMg: number,
  sources: readonly NormalizedMassSource[],
): boolean {
  const tolerance = massToleranceMg(metadataMassMg);
  return sources.some(
    (source) =>
      source.sourceId === 'filename' &&
      Math.abs(source.massMg - metadataMassMg) <= tolerance,
  );
}

function massChoiceQuestion(sources: readonly NormalizedMassSource[]): MinimalRecipeQuestionV1 {
  return {
    id: 'confirm_active_mass_source',
    required: true,
    title: '确认活性物质质量来源',
    prompt: '文件中的质量证据不一致。请选择可信来源；软件不会要求输入质量不确定度。',
    choices: sources.map((source) => ({
      value: source.sourceId,
      label: source.label,
      detail: `${source.massMg.toPrecision(6)} mg`,
    })),
  };
}

function resolveActiveMass(
  input: RecipeActiveMassInputV1 | undefined,
  questions: MinimalRecipeQuestionV1[],
  blocking: MinimalRecipeBlockingV1[],
  autoResolved: MinimalRecipeAutoResolvedV1[],
): { activeMassG: number | null; sourceId: string | null } {
  const sources = normalizeMassSources(input);
  const userOverrideMassMg = input?.userOverrideMassMg ?? null;
  if (userOverrideMassMg !== null) {
    if (!positiveFinite(userOverrideMassMg)) {
      questions.push({
        id: 'active_mass_mg',
        required: true,
        title: '活性物质质量',
        prompt: '手动修正的活性物质质量必须是大于 0 的毫克数。',
      });
      blocking.push({
        code: 'active_mass_override_invalid',
        message: '手动输入的活性物质质量无效；请修正或清空以恢复文件自动值。',
        questionId: 'active_mass_mg',
      });
      return { activeMassG: null, sourceId: null };
    }
    autoResolved.push({
      id: 'active_mass_user_override',
      label: '用户确认的活性物质质量',
      value: userOverrideMassMg,
    });
    return { activeMassG: userOverrideMassMg / 1000, sourceId: 'user_input' };
  }
  const selectedSourceId = input?.selectedSourceId ?? null;
  const selected = selectedSourceId === null ? null : sources.find((source) => source.sourceId === selectedSourceId);

  if (selectedSourceId !== null && selected === undefined) {
    blocking.push({
      code: 'active_mass_source_selection_invalid',
      message: '已选质量来源不属于当前文件的可用证据，无法安全复算。',
      questionId: 'confirm_active_mass_source',
    });
    if (sources.length > 0) questions.push(massChoiceQuestion(sources));
    return { activeMassG: null, sourceId: null };
  }

  if (selected) {
    autoResolved.push({
      id: 'active_mass_source_confirmed',
      label: '已确认活性物质质量来源',
      value: selected.label,
    });
    return { activeMassG: selected.massMg / 1000, sourceId: selected.sourceId };
  }

  const metadataMassMg = input?.metadataMassMg ?? null;
  if (!positiveFinite(metadataMassMg)) {
    if (sources.length > 0 && !hasMassConflict(null, sources)) {
      autoResolved.push({ id: 'active_mass_source_confirmed', label: '明确单位的文件质量', value: sources[0].label });
      return { activeMassG: sources[0].massMg / 1000, sourceId: sources[0].sourceId };
    }
    if (sources.length > 0) {
      questions.push(massChoiceQuestion(sources));
      blocking.push({
        code: 'active_mass_metadata_missing',
        message: 'Neware 元数据未给出活性物质质量；请确认一个已有来源，或重新导出含 SCQ 的文件。',
        questionId: 'confirm_active_mass_source',
      });
    } else {
      blocking.push({
        code: 'active_mass_metadata_missing',
        message: 'Neware 元数据未给出活性物质质量，无法建立 GITT 几何归一化。',
        questionId: null,
      });
    }
    return { activeMassG: null, sourceId: null };
  }

  if (hasMassConflict(metadataMassMg, sources)) {
    if (metadataMassIsCorroborated(metadataMassMg, sources)) {
      autoResolved.push({
        id: 'neware_metadata_mass_corroborated_by_filename',
        label: '活性物质质量',
        value: '采用与文件名一致的 Neware SCQ；不一致的 Remark 保留为审计提示',
      });
      return { activeMassG: metadataMassMg / 1000, sourceId: NEWARE_METADATA_MASS_SOURCE_ID };
    }
    questions.push(massChoiceQuestion(sources));
    blocking.push({
      code: 'active_mass_conflict',
      message: 'Neware 元数据与文件名或备注中的活性物质质量超过 max(0.01 mg, 1%) 的差异；请确认来源。',
      questionId: 'confirm_active_mass_source',
    });
    return { activeMassG: null, sourceId: null };
  }

  autoResolved.push({
    id: 'neware_active_mass_metadata',
    label: 'Neware 活性物质质量',
    value: metadataMassMg,
  });
  return { activeMassG: metadataMassMg / 1000, sourceId: NEWARE_METADATA_MASS_SOURCE_ID };
}

function resolveSoc(
  input: RecipeSocInputV1 | undefined,
  questions: MinimalRecipeQuestionV1[],
  autoResolved: MinimalRecipeAutoResolvedV1[],
): MinimalRecipeResolvedFactsV1['soc'] {
  const requested = input?.requested === true;
  if (!requested) {
    return { requested: false, initialSocPct: null, initialSocSource: 'unknown', available: false };
  }

  if (finiteSoc(input?.initialSocPct)) {
    const initialSocSource =
      input?.initialSocSource === undefined || input.initialSocSource === 'unknown'
        ? 'user_input'
        : input.initialSocSource;
    autoResolved.push({
      id: 'provided_initial_soc',
      label: '起始 SOC',
      value: input?.initialSocPct ?? null,
    });
    return { requested: true, initialSocPct: input?.initialSocPct ?? null, initialSocSource, available: true };
  }

  if (input?.datasetStartsAtFreshCell === true) {
    autoResolved.push({
      id: 'fresh_cell_initial_soc_100_pct',
      label: '新鲜电池起始 SOC',
      value: 100,
    });
    return {
      requested: true,
      initialSocPct: 100,
      initialSocSource: 'fresh_cell_assumption',
      available: true,
    };
  }

  questions.push({
    id: 'initial_soc_pct',
    required: false,
    title: '可选：起始 SOC',
    prompt: '仅在需要 SOC 坐标时填写。留空仍可分析 GITT，并以累计容量展示结果。',
  });
  return { requested: true, initialSocPct: null, initialSocSource: 'unknown', available: false };
}

/**
 * Produces the smallest honest configuration for a CFx/FGS Neware analysis.
 * DCR has no material, geometry, SOC, uncertainty, or resolution question.
 * GITT asks only for facts that cannot be safely inferred from the file.
 */
export function buildMinimalExperimentRecipe(
  input: MinimalExperimentRecipeInputV1,
): MinimalExperimentRecipeResultV1 {
  const questions: MinimalRecipeQuestionV1[] = [];
  const blocking: MinimalRecipeBlockingV1[] = [];
  const autoResolved: MinimalRecipeAutoResolvedV1[] = [];

  if (input.analysisKind === 'dcr') {
    autoResolved.push({
      id: 'dcr_requires_no_material_geometry_or_soc',
      label: 'DCR 分析配置',
      value: 'Rest → 恒流 Pulse，文件参数自动读取',
    });
    return {
      recipeVersion: MINIMAL_EXPERIMENT_RECIPE_VERSION,
      analysisKind: input.analysisKind,
      readyToAnalyze: true,
      questions,
      blocking,
      autoResolved,
      resolved: {
        material: null,
        activeMassG: null,
        activeMassSourceId: null,
        electrodeDiameterCm: null,
        electrodeAreaCm2: null,
        geometryInputMode: null,
        qrefAh: null,
        soc: { requested: false, initialSocPct: null, initialSocSource: 'unknown', available: false },
      },
    };
  }

  const materialSelection = input.material;
  const suppliedProfileId = materialSelection?.profileId ?? null;
  const profileId = isKnownMaterialProfile(suppliedProfileId) ? suppliedProfileId : null;
  const confidence = materialSelection?.confidence ?? (profileId ? 'confirmed' : 'unknown');
  let material: ResolvedRecipeMaterialV1 | null = null;
  if (profileId === null || confidence === 'uncertain' || confidence === 'unknown') {
    questions.push(materialPrompt());
    blocking.push({
      code: 'material_profile_confirmation_required',
      message: '材料 profile 不确定，无法选择正确的 CF₁/FGS 比较口径。',
      questionId: 'confirm_material_profile',
    });
  } else {
    material = createResolvedMaterial(profileId);
    const physicalParameters = input.materialParametersByProfileId?.[profileId];
    material = applyMaterialPhysicalParameters(
      material,
      physicalParameters,
      questions,
      blocking,
      autoResolved,
    );
    if (confidence === 'inferred') {
      autoResolved.push({
        id: 'material_profile_inferred',
        label: '文件识别的材料 profile',
        value: profileId,
      });
    }
    if (physicalParameters?.densityGPerCm3 === null || physicalParameters?.densityGPerCm3 === undefined) {
      autoResolved.push({
        id: 'cf1_density_reference_2_25_g_per_cm3',
        label: 'CF₁ 参考密度',
        value: 2.25,
      });
    }
    autoResolved.push({
      id: 'cf1_theoretical_capacity_865_mah_per_g',
      label: 'CF₁ 理论比容量',
      value: 865,
    });
  }

  const activeMass = resolveActiveMass(input.activeMass, questions, blocking, autoResolved);
  const geometryInputMode = input.geometry?.inputMode ?? 'diameter';
  const diameterMm = input.geometry?.electrodeDiameterMm;
  const directAreaCm2 = input.geometry?.electrodeAreaCm2;
  let electrodeDiameterCm: number | null = null;
  let electrodeAreaCm2: number | null = null;
  if (geometryInputMode === 'area') {
    if (directAreaCm2 === null || directAreaCm2 === undefined) {
      questions.push({
        id: 'electrode_area_cm2',
        required: true,
        title: '极片单面几何面积',
        prompt: '请输入单面极片几何面积（cm²），不得使用 BET 比表面积。',
      });
      blocking.push({
        code: 'electrode_area_required',
        message: 'GITT 的 WH 几何归一化需要极片单面几何面积。',
        questionId: 'electrode_area_cm2',
      });
    } else if (!positiveFinite(directAreaCm2)) {
      questions.push({
        id: 'electrode_area_cm2',
        required: true,
        title: '极片单面几何面积',
        prompt: '极片单面几何面积必须是大于 0 的 cm² 数值。',
      });
      blocking.push({
        code: 'electrode_area_invalid',
        message: '极片单面几何面积不是有效的正数。',
        questionId: 'electrode_area_cm2',
      });
    } else {
      electrodeAreaCm2 = directAreaCm2;
      electrodeDiameterCm = 2 * Math.sqrt(directAreaCm2 / Math.PI);
      autoResolved.push({
        id: 'electrode_area_project_value',
        label: '项目极片单面几何面积',
        value: directAreaCm2,
      });
    }
  } else if (diameterMm === null || diameterMm === undefined) {
    questions.push({
      id: 'electrode_diameter_mm',
      required: true,
      title: '极片直径',
      prompt: '请输入单面圆片的几何直径（mm）。该值用于 WH 等效活性物质厚度，不是涂层厚度。',
    });
    blocking.push({
      code: 'electrode_diameter_required',
      message: 'GITT 的 WH 几何归一化需要极片直径。',
      questionId: 'electrode_diameter_mm',
    });
  } else if (!positiveFinite(diameterMm)) {
    questions.push({
      id: 'electrode_diameter_mm',
      required: true,
      title: '极片直径',
      prompt: '极片直径必须是大于 0 的毫米数。',
    });
    blocking.push({
      code: 'electrode_diameter_invalid',
      message: '极片直径不是有效的正数。',
      questionId: 'electrode_diameter_mm',
    });
  } else {
    electrodeDiameterCm = diameterMm / 10;
    electrodeAreaCm2 = Math.PI * (electrodeDiameterCm / 2) ** 2;
    autoResolved.push({
      id: 'electrode_diameter_project_value',
      label: '项目极片直径',
      value: diameterMm,
    });
  }

  const soc = resolveSoc(input.soc, questions, autoResolved);
  const qrefAh =
    material !== null && activeMass.activeMassG !== null && material.preset.theoreticalSpecificCapacityMahPerG !== null
      ? (activeMass.activeMassG * material.preset.theoreticalSpecificCapacityMahPerG) / 1000
      : null;

  return {
    recipeVersion: MINIMAL_EXPERIMENT_RECIPE_VERSION,
    analysisKind: input.analysisKind,
    readyToAnalyze: blocking.length === 0,
    questions,
    blocking,
    autoResolved,
    resolved: {
      material,
      activeMassG: activeMass.activeMassG,
      activeMassSourceId: activeMass.sourceId,
      electrodeDiameterCm,
      electrodeAreaCm2,
      geometryInputMode,
      qrefAh,
      soc,
    },
  };
}

export type NewareRecipeInputOptionsV1 = Omit<MinimalExperimentRecipeInputV1, 'activeMass' | 'material'> & {
  /** Optional extra evidence; metadata remains the automatic primary source. */
  activeMassEvidence?: readonly RecipeMassEvidenceV1[];
  /** Response to a prior targeted mass-source confirmation. */
  selectedActiveMassSourceId?: string | null;
  /** Optional operator correction; stored separately from Neware evidence. */
  userOverrideActiveMassMg?: number | null;
  /** Explicit user choice overrides file-name/Remark material inference. */
  materialConfirmation?: RecipeMaterialSelectionV1;
};

function materialSignals(text: string): CfxRecipeMaterialProfileIdV1[] {
  const normalized = text.normalize('NFC').toLowerCase();
  const signals: CfxRecipeMaterialProfileIdV1[] = [];
  if (/(?:^|[^a-z0-9])fgs(?:$|[^a-z0-9])/.test(normalized)) signals.push('fgs_cf1_reference');
  if (/(?:^|[^a-z0-9])cf(?:x|1)(?:$|[^a-z0-9])/.test(normalized)) signals.push('cf1');
  return signals;
}

export function extractMassMg(text: string): number | null {
  const normalized = text.normalize('NFKC');
  const values: number[] = [];
  const pattern = /(?:^|[^\d.])((?:\d+(?:\.\d+)?|\.\d+))\s*(mg|µg|μg|ug|毫克|微克|g|克)(?=$|[^a-z])/gi;
  for (const match of normalized.matchAll(pattern)) {
    const value = Number(match[1]);
    const unit = match[2].toLowerCase();
    const mass = value * (unit === 'g' || unit === '克' ? 1000 : /^(?:[µμu]g|微克)$/.test(unit) ? 0.001 : 1);
    if (positiveFinite(mass)) values.push(mass);
  }
  // Multiple different masses in one text are ambiguous; never take the first.
  return values.length > 0 && values.every((value) => Math.abs(value - values[0]) <= 1e-9)
    ? values[0]
    : null;
}

/**
 * Small adapter for callers that already have a normalized Neware dataset.
 * It uses Neware SCQ metadata as the active-mass source and only surfaces a
 * prompt when filename/Remark evidence genuinely conflicts.
 */
export function createMinimalExperimentRecipeInputFromNeware(
  dataset: Pick<NewareCanonicalDataset, 'metadata' | 'rows'>,
  options: NewareRecipeInputOptionsV1,
): MinimalExperimentRecipeInputV1 {
  const {
    activeMassEvidence = [],
    selectedActiveMassSourceId,
    userOverrideActiveMassMg,
    materialConfirmation,
    ...recipeOptions
  } = options;
  const sourceFileId = dataset.rows[0]?.sourceFileId ?? '';
  const remark = dataset.metadata.remark ?? '';
  const texts = [sourceFileId, remark].filter((text) => text.trim() !== '');
  const signals = [...new Set(texts.flatMap(materialSignals))];
  const inferredMaterial: RecipeMaterialSelectionV1 =
    signals.length === 1
      ? { profileId: signals[0], confidence: 'inferred', evidence: texts }
      : { profileId: null, confidence: 'uncertain', evidence: texts };
  const fileNameMassMg = extractMassMg(sourceFileId);
  const remarkMassMg = extractMassMg(remark);
  const evidence: RecipeMassEvidenceV1[] = [
    ...activeMassEvidence,
    ...(fileNameMassMg === null
      ? []
      : [{ sourceId: 'filename', label: '文件名中的质量', massMg: fileNameMassMg }]),
    ...(remarkMassMg === null
      ? []
      : [{ sourceId: 'neware_remark', label: 'Neware Remark 中的质量', massMg: remarkMassMg }]),
  ];

  return {
    ...recipeOptions,
    material: materialConfirmation ?? inferredMaterial,
    activeMass: {
      metadataMassMg: dataset.metadata.activeMassMg,
      corroboratingEvidence: evidence,
      selectedSourceId: selectedActiveMassSourceId,
      userOverrideMassMg: userOverrideActiveMassMg,
    },
  };
}
