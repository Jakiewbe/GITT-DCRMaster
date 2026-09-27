import type { NewareCanonicalDataset } from '../adapters/neware/normalize';
import type { CanonicalRowV1 } from '../science/contracts';
import { hashCanonicalDataset } from '../science/hash';
import type { WorkbenchSettings } from './analyze';
import { APP_VERSION } from './buildInfo';
import {
  createDefaultWorkbenchRecipe,
  WORKBENCH_RECIPE_SCHEMA_V1,
  WORKBENCH_RECIPE_VERSION_V1,
  type WorkbenchDatasetRecipeSelectionV1,
  type WorkbenchRecipeV1,
} from './recipe';

export const WORKBENCH_PROJECT_SCHEMA = 'gitt-dcr-workbench-project-v1' as const;

export type WorkbenchDatasetV1 = {
  id: string;
  fileName: string;
  fileSize: number;
  importedAtIso: string;
  canonical: NewareCanonicalDataset;
};

export type WorkbenchProjectV1 = {
  schema: typeof WORKBENCH_PROJECT_SCHEMA;
  /** Version that wrote this project, retained when a compatible project opens. */
  appVersion: string;
  savedAtIso: string;
  sourceFilesEmbedded: false;
  settings: WorkbenchSettings;
  /**
   * Deliberately separate from the old global settings. A recipe represents
   * facts confirmed by the user, whereas legacy settings may contain a former
   * UI default such as a 1.2 cm diameter.
   */
  recipe: WorkbenchRecipeV1;
  datasets: WorkbenchDatasetV1[];
};

const PROJECT_STRUCTURE_RECOVERY =
  '请使用当前版本重新保存项目；如果文件来自其他版本，请保留原文件并使用对应版本或受支持的迁移工具处理。';
const PROJECT_SETTINGS_RECOVERY =
  '请在当前版本中重新设置该参数并保存新项目；不要直接修改 Canonical 行或科学哈希。';
const PROJECT_DATASET_RECOVERY =
  '请重新导入原始 NDAX 并保存新项目，或从未经修改的项目备份恢复。';

export class WorkbenchProjectValidationError extends Error {
  readonly code: string;
  readonly recovery: string;

  constructor(code: string, recovery: string) {
    super(`${code}。恢复建议：${recovery}`);
    this.name = 'WorkbenchProjectValidationError';
    this.code = code;
    this.recovery = recovery;
  }
}

function failProjectValidation(code: string, recovery: string): never {
  throw new WorkbenchProjectValidationError(code, recovery);
}

function serializeBigInt(_key: string, value: unknown) {
  return typeof value === 'bigint' ? value.toString() : value;
}

function requireRecord(value: unknown, name: string): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    failProjectValidation(`${name}_must_be_an_object`, PROJECT_STRUCTURE_RECOVERY);
  }
  return value as Record<string, unknown>;
}

function requireString(value: unknown, name: string): string {
  if (typeof value !== 'string') {
    failProjectValidation(`${name}_must_be_a_string`, PROJECT_STRUCTURE_RECOVERY);
  }
  return value;
}

function requireNonemptyString(value: unknown, name: string): string {
  const string = requireString(value, name);
  if (string.trim() === '') {
    failProjectValidation(`${name}_must_not_be_empty`, PROJECT_STRUCTURE_RECOVERY);
  }
  return string;
}

function requireFiniteNumber(value: unknown, name: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    failProjectValidation(`${name}_must_be_a_finite_number`, PROJECT_STRUCTURE_RECOVERY);
  }
  return value;
}

function requirePositiveFiniteNumber(value: unknown, name: string): number {
  const number = requireFiniteNumber(value, name);
  if (number <= 0) {
    failProjectValidation(`${name}_must_be_positive`, PROJECT_SETTINGS_RECOVERY);
  }
  return number;
}

function requireNonnegativeFiniteNumber(value: unknown, name: string): number {
  const number = requireFiniteNumber(value, name);
  if (number < 0) {
    failProjectValidation(`${name}_must_be_nonnegative`, PROJECT_SETTINGS_RECOVERY);
  }
  return number;
}

function requireNullablePositiveFiniteNumber(value: unknown, name: string): number | null {
  return value === null ? null : requirePositiveFiniteNumber(value, name);
}

function requireNullableNonnegativeFiniteNumber(value: unknown, name: string): number | null {
  return value === null ? null : requireNonnegativeFiniteNumber(value, name);
}

function requireNullableFiniteNumber(value: unknown, name: string): number | null {
  return value === null ? null : requireFiniteNumber(value, name);
}

function requireNullableString(value: unknown, name: string): string | null {
  return value === null ? null : requireString(value, name);
}

function requireNullableStringUnion<const T extends readonly string[]>(
  value: unknown,
  name: string,
  allowed: T,
): T[number] | null {
  if (value === null) return null;
  return requireStringUnion(value, name, allowed);
}

function requireBoolean(value: unknown, name: string): boolean {
  if (typeof value !== 'boolean') {
    failProjectValidation(`${name}_must_be_a_boolean`, PROJECT_SETTINGS_RECOVERY);
  }
  return value;
}

function requireStringUnion<const T extends readonly string[]>(
  value: unknown,
  name: string,
  allowed: T,
): T[number] {
  if (typeof value !== 'string' || !allowed.includes(value)) {
    failProjectValidation(
      `${name}_must_be_one_of_${allowed.join('_or_')}`,
      PROJECT_SETTINGS_RECOVERY,
    );
  }
  return value as T[number];
}

function hasOwn(value: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function reviveRecipeSoc(value: unknown, name: string): WorkbenchRecipeV1['soc'] {
  const soc = requireRecord(value, name);
  const initialSocPct = requireNullableFiniteNumber(
    soc.initialSocPct,
    `${name}_initialSocPct`,
  );
  if (initialSocPct !== null && (initialSocPct < 0 || initialSocPct > 100)) {
    failProjectValidation(`${name}_initialSocPct_must_be_between_0_and_100`, PROJECT_SETTINGS_RECOVERY);
  }
  return {
    requested: requireBoolean(soc.requested, `${name}_requested`),
    initialSocPct,
    initialSocSource: requireStringUnion(
      soc.initialSocSource,
      `${name}_initialSocSource`,
      ['fresh_cell_assumption', 'user_input', 'preceding_dataset', 'unknown'] as const,
    ),
    datasetStartsAtFreshCell: requireBoolean(
      soc.datasetStartsAtFreshCell,
      `${name}_datasetStartsAtFreshCell`,
    ),
  };
}

function reviveRecipeMaterialConfirmation(
  value: unknown,
  name: string,
): WorkbenchDatasetRecipeSelectionV1['materialConfirmation'] {
  if (value === null) return null;
  const confirmation = requireRecord(value, name);
  const profileId = requireNullableStringUnion(
    confirmation.profileId,
    `${name}_profileId`,
    ['cf1', 'fgs_cf1_reference'] as const,
  );

  const revived: NonNullable<WorkbenchDatasetRecipeSelectionV1['materialConfirmation']> = {
    profileId,
  };
  if (hasOwn(confirmation, 'confidence')) {
    revived.confidence = requireStringUnion(
      confirmation.confidence,
      `${name}_confidence`,
      ['confirmed', 'inferred', 'uncertain', 'unknown'] as const,
    );
  }
  if (hasOwn(confirmation, 'evidence')) {
    if (!Array.isArray(confirmation.evidence)) {
      failProjectValidation(`${name}_evidence_must_be_an_array`, PROJECT_SETTINGS_RECOVERY);
    }
    revived.evidence = confirmation.evidence.map((item, index) =>
      requireString(item, `${name}_evidence_${index}`),
    );
  }
  return revived;
}

function reviveRecipeDatasetSelection(
  value: unknown,
  name: string,
  legacyRecipe: boolean,
): WorkbenchDatasetRecipeSelectionV1 {
  const selection = requireRecord(value, name);
  return {
    materialConfirmation: reviveRecipeMaterialConfirmation(
      selection.materialConfirmation,
      `${name}_materialConfirmation`,
    ),
    selectedActiveMassSourceId: requireNullableString(
      selection.selectedActiveMassSourceId,
      `${name}_selectedActiveMassSourceId`,
    ),
    activeMassOverrideMg:
      legacyRecipe && !hasOwn(selection, 'activeMassOverrideMg')
        ? null
        : requireNullablePositiveFiniteNumber(
          selection.activeMassOverrideMg,
          `${name}_activeMassOverrideMg`,
        ),
    soc: selection.soc === null ? null : reviveRecipeSoc(selection.soc, `${name}_soc`),
  };
}

function reviveRecipeMaterialParameters(value: unknown): WorkbenchRecipeV1['materialParametersByProfileId'] {
  const parametersByProfile = requireRecord(value, 'project_recipe_materialParametersByProfileId');
  const revived: WorkbenchRecipeV1['materialParametersByProfileId'] = {};
  for (const [profileId, parametersValue] of Object.entries(parametersByProfile)) {
    if (profileId !== 'cf1' && profileId !== 'fgs_cf1_reference') {
      failProjectValidation(
        'project_recipe_materialParametersByProfileId_key_must_be_cf1_or_fgs_cf1_reference',
        PROJECT_SETTINGS_RECOVERY,
      );
    }
    const parameters = requireRecord(
      parametersValue,
      `project_recipe_materialParametersByProfileId_${profileId}`,
    );
    revived[profileId] = {
      densityGPerCm3: hasOwn(parameters, 'densityGPerCm3')
        ? requireNullablePositiveFiniteNumber(
          parameters.densityGPerCm3,
          `project_recipe_materialParametersByProfileId_${profileId}_densityGPerCm3`,
        )
        : null,
      molarMassGPerMol: hasOwn(parameters, 'molarMassGPerMol')
        ? requireNullablePositiveFiniteNumber(
          parameters.molarMassGPerMol,
          `project_recipe_materialParametersByProfileId_${profileId}_molarMassGPerMol`,
        )
        : null,
    };
  }
  return revived;
}

function reviveWorkbenchRecipe(value: unknown): WorkbenchRecipeV1 {
  const recipe = requireRecord(value, 'project_recipe');
  if (recipe.schema !== WORKBENCH_RECIPE_SCHEMA_V1) {
    failProjectValidation('unsupported_project_recipe_schema', PROJECT_STRUCTURE_RECOVERY);
  }
  const legacyRecipe = recipe.recipeVersion === '1.0.0';
  if (!legacyRecipe && recipe.recipeVersion !== WORKBENCH_RECIPE_VERSION_V1) {
    failProjectValidation('unsupported_project_recipe_version', PROJECT_STRUCTURE_RECOVERY);
  }
  const electrodeDiameterMm = requireNullablePositiveFiniteNumber(
    recipe.electrodeDiameterMm,
    'project_recipe_electrodeDiameterMm',
  );
  const selectionsValue = requireRecord(
    recipe.datasetSelectionsBySourceFileHash,
    'project_recipe_datasetSelectionsBySourceFileHash',
  );
  const datasetSelectionsBySourceFileHash: Record<string, WorkbenchDatasetRecipeSelectionV1> =
    Object.create(null) as Record<string, WorkbenchDatasetRecipeSelectionV1>;
  for (const [sourceFileHash, selection] of Object.entries(selectionsValue)) {
    if (!/^[a-f0-9]{64}$/.test(sourceFileHash)) {
      failProjectValidation(
        'project_recipe_datasetSelectionsBySourceFileHash_key_must_be_a_lowercase_sha256',
        PROJECT_SETTINGS_RECOVERY,
      );
    }
    datasetSelectionsBySourceFileHash[sourceFileHash] = reviveRecipeDatasetSelection(
      selection,
      `project_recipe_datasetSelection_${sourceFileHash}`,
      legacyRecipe,
    );
  }
  return {
    schema: WORKBENCH_RECIPE_SCHEMA_V1,
    recipeVersion: WORKBENCH_RECIPE_VERSION_V1,
    geometryInputMode: legacyRecipe
      ? 'diameter'
      : requireStringUnion(
        recipe.geometryInputMode,
        'project_recipe_geometryInputMode',
        ['diameter', 'area'] as const,
      ),
    electrodeDiameterMm,
    electrodeAreaCm2: legacyRecipe
      ? null
      : requireNullablePositiveFiniteNumber(
        recipe.electrodeAreaCm2,
        'project_recipe_electrodeAreaCm2',
      ),
    materialParametersByProfileId: legacyRecipe
      ? {}
      : reviveRecipeMaterialParameters(recipe.materialParametersByProfileId),
    soc: reviveRecipeSoc(recipe.soc, 'project_recipe_soc'),
    datasetSelectionsBySourceFileHash,
  };
}

/**
 * Projects saved before the minimal-recipe flow have no recipe field. Do not
 * infer confirmation from `settings.electrodeDiameterCm`: that value was a
 * former global default, not evidence of a known physical geometry.
 */
function reviveOrMigrateWorkbenchRecipe(root: Record<string, unknown>): WorkbenchRecipeV1 {
  return hasOwn(root, 'recipe')
    ? reviveWorkbenchRecipe(root.recipe)
    : createDefaultWorkbenchRecipe();
}

function reviveMaterialPreset(value: unknown): WorkbenchSettings['material'] {
  const material = requireRecord(value, 'project_settings_material');
  return {
    materialPresetId: requireString(
      material.materialPresetId,
      'project_settings_material_materialPresetId',
    ),
    materialFamily: requireStringUnion(
      material.materialFamily,
      'project_settings_material_materialFamily',
      ['cfx_conversion', 'layered_insertion', 'custom'] as const,
    ),
    displayName: requireString(material.displayName, 'project_settings_material_displayName'),
    molarMassGPerMol: requirePositiveFiniteNumber(
      material.molarMassGPerMol,
      'project_settings_material_molarMassGPerMol',
    ),
    densityGPerCm3: requireNullablePositiveFiniteNumber(
      material.densityGPerCm3,
      'project_settings_material_densityGPerCm3',
    ),
    densitySource: requireNullableString(
      material.densitySource,
      'project_settings_material_densitySource',
    ),
    densityMethod: requireNullableString(
      material.densityMethod,
      'project_settings_material_densityMethod',
    ),
    densityStandardUncertainty: requireNullableNonnegativeFiniteNumber(
      material.densityStandardUncertainty,
      'project_settings_material_densityStandardUncertainty',
    ),
    molarVolumeCm3PerMol: requirePositiveFiniteNumber(
      material.molarVolumeCm3PerMol,
      'project_settings_material_molarVolumeCm3PerMol',
    ),
    molarVolumeAuthority: requireStringUnion(
      material.molarVolumeAuthority,
      'project_settings_material_molarVolumeAuthority',
      ['derived_from_density', 'explicit_override'] as const,
    ),
    theoreticalSpecificCapacityMahPerG: requireNullablePositiveFiniteNumber(
      material.theoreticalSpecificCapacityMahPerG,
      'project_settings_material_theoreticalSpecificCapacityMahPerG',
    ),
    presetVersion: requireString(
      material.presetVersion,
      'project_settings_material_presetVersion',
    ),
    userOverridden: requireBoolean(
      material.userOverridden,
      'project_settings_material_userOverridden',
    ),
  };
}

function reviveWorkbenchSettings(value: unknown): WorkbenchSettings {
  const settings = requireRecord(value, 'project_settings');
  const revived: WorkbenchSettings = {
    electrodeDiameterCm: requirePositiveFiniteNumber(
      settings.electrodeDiameterCm,
      'project_settings_electrodeDiameterCm',
    ),
    electrodeDiameterStandardUncertaintyCm: requireNullableNonnegativeFiniteNumber(
      settings.electrodeDiameterStandardUncertaintyCm,
      'project_settings_electrodeDiameterStandardUncertaintyCm',
    ),
    activeMassStandardUncertaintyG: requireNullableNonnegativeFiniteNumber(
      settings.activeMassStandardUncertaintyG,
      'project_settings_activeMassStandardUncertaintyG',
    ),
    currentResolutionA: requireNullablePositiveFiniteNumber(
      settings.currentResolutionA,
      'project_settings_currentResolutionA',
    ),
    voltageResolutionV: requireNullablePositiveFiniteNumber(
      settings.voltageResolutionV,
      'project_settings_voltageResolutionV',
    ),
    material: reviveMaterialPreset(settings.material),
    initialSocPct: requireNullableFiniteNumber(
      settings.initialSocPct,
      'project_settings_initialSocPct',
    ),
    initialSocSource: requireStringUnion(
      settings.initialSocSource,
      'project_settings_initialSocSource',
      ['fresh_cell_assumption', 'user_input', 'preceding_dataset', 'unknown'] as const,
    ),
    datasetStartsAtFreshCell: requireBoolean(
      settings.datasetStartsAtFreshCell,
      'project_settings_datasetStartsAtFreshCell',
    ),
  };
  if (hasOwn(settings, 'regressionManualWindow')) {
    const manual = requireRecord(settings.regressionManualWindow, 'project_settings_regressionManualWindow');
    revived.regressionManualWindow = {
      startS: requireNullableFiniteNumber(
        manual.startS,
        'project_settings_regressionManualWindow_startS',
      ),
      endS: requireNullableFiniteNumber(
        manual.endS,
        'project_settings_regressionManualWindow_endS',
      ),
    };
  }
  return revived;
}

function parseBigIntField(value: unknown, name: string): bigint {
  if (typeof value !== 'string' || !/^-?\d+$/.test(value)) {
    failProjectValidation(`${name}_must_be_a_decimal_string`, PROJECT_DATASET_RECOVERY);
  }
  return BigInt(value);
}

function reviveRow(value: unknown, index: number): CanonicalRowV1 {
  const row = requireRecord(value, `row_${index}`);
  return {
    ...(row as unknown as CanonicalRowV1),
    elapsedTimeTicks: parseBigIntField(row.elapsedTimeTicks, `row_${index}_elapsedTimeTicks`),
    stepElapsedTimeTicks:
      row.stepElapsedTimeTicks === null
        ? null
        : parseBigIntField(row.stepElapsedTimeTicks, `row_${index}_stepElapsedTimeTicks`),
    timeResolutionNs: parseBigIntField(row.timeResolutionNs, `row_${index}_timeResolutionNs`),
    recordSequence: parseBigIntField(row.recordSequence, `row_${index}_recordSequence`),
    sourceRowIndex: parseBigIntField(row.sourceRowIndex, `row_${index}_sourceRowIndex`),
    sourceRecordSequence: parseBigIntField(
      row.sourceRecordSequence,
      `row_${index}_sourceRecordSequence`,
    ),
  };
}

function reviveDataset(value: unknown, index: number): WorkbenchDatasetV1 {
  const dataset = requireRecord(value, `dataset_${index}`);
  const canonicalValue = requireRecord(dataset.canonical, `dataset_${index}_canonical`);
  if (!Array.isArray(canonicalValue.rows)) {
    failProjectValidation(`dataset_${index}_rows_must_be_an_array`, PROJECT_DATASET_RECOVERY);
  }
  const metadataValue = requireRecord(canonicalValue.metadata, `dataset_${index}_metadata`);
  const rows = canonicalValue.rows.map(reviveRow);
  const canonical: NewareCanonicalDataset = {
    ...(canonicalValue as unknown as NewareCanonicalDataset),
    rows,
    metadata: {
      ...(metadataValue as unknown as NewareCanonicalDataset['metadata']),
      sourceTimeResolutionNs: parseBigIntField(
        metadataValue.sourceTimeResolutionNs,
        `dataset_${index}_sourceTimeResolutionNs`,
      ),
    },
    sourceFileHash: requireString(canonicalValue.sourceFileHash, `dataset_${index}_sourceFileHash`),
    canonicalDatasetHash: requireString(
      canonicalValue.canonicalDatasetHash,
      `dataset_${index}_canonicalDatasetHash`,
    ),
    normalizationReceiptHash: requireString(
      canonicalValue.normalizationReceiptHash,
      `dataset_${index}_normalizationReceiptHash`,
    ),
    warnings: Array.isArray(canonicalValue.warnings)
      ? canonicalValue.warnings.map((warning, warningIndex) =>
          requireString(warning, `dataset_${index}_warning_${warningIndex}`),
        )
      : [],
  };
  const computedHash = hashCanonicalDataset(rows);
  if (computedHash !== canonical.canonicalDatasetHash) {
    failProjectValidation(`dataset_${index}_canonical_hash_mismatch`, PROJECT_DATASET_RECOVERY);
  }
  if (rows.some((row) => row.sourceFileHash !== canonical.sourceFileHash)) {
    failProjectValidation(`dataset_${index}_source_hash_mismatch`, PROJECT_DATASET_RECOVERY);
  }

  return {
    id: requireString(dataset.id, `dataset_${index}_id`),
    fileName: requireString(dataset.fileName, `dataset_${index}_fileName`),
    fileSize: requireFiniteNumber(dataset.fileSize, `dataset_${index}_fileSize`),
    importedAtIso: requireString(dataset.importedAtIso, `dataset_${index}_importedAtIso`),
    canonical,
  };
}

export function serializeWorkbenchProject(
  settings: WorkbenchSettings,
  datasets: WorkbenchDatasetV1[],
  committedRecipe: WorkbenchRecipeV1 = createDefaultWorkbenchRecipe(),
): string {
  // Save only a structurally complete, explicit recipe snapshot. The caller
  // supplies the committed (not in-progress UI draft) value.
  const recipe = reviveWorkbenchRecipe(committedRecipe);
  const project: WorkbenchProjectV1 = {
    schema: WORKBENCH_PROJECT_SCHEMA,
    appVersion: APP_VERSION,
    savedAtIso: new Date().toISOString(),
    sourceFilesEmbedded: false,
    settings,
    recipe,
    datasets,
  };
  return JSON.stringify(project, serializeBigInt, 2);
}

export function parseWorkbenchProject(serialized: string): WorkbenchProjectV1 {
  let parsed: unknown;
  try {
    parsed = JSON.parse(serialized) as unknown;
  } catch {
    failProjectValidation(
      'project_json_invalid',
      '请选择本软件导出的未修改 JSON 项目文件；如文件损坏，请重新导出或从备份恢复。',
    );
  }
  const root = requireRecord(parsed, 'project');
  if (root.schema !== WORKBENCH_PROJECT_SCHEMA) {
    failProjectValidation('unsupported_project_schema', PROJECT_STRUCTURE_RECOVERY);
  }
  // App versions are build provenance, not a scientific schema. Compatible
  // projects must remain openable across UI/build updates; strict validation
  // continues below for the project schema, settings, recipe, and canonical
  // data integrity.
  const savedAppVersion = requireNonemptyString(root.appVersion, 'project_appVersion');
  if (root.sourceFilesEmbedded !== false) {
    failProjectValidation('unsupported_embedded_source_contract', PROJECT_STRUCTURE_RECOVERY);
  }
  if (!Array.isArray(root.datasets)) {
    failProjectValidation('project_datasets_must_be_an_array', PROJECT_STRUCTURE_RECOVERY);
  }
  const settings = reviveWorkbenchSettings(root.settings);
  const recipe = reviveOrMigrateWorkbenchRecipe(root);
  return {
    schema: WORKBENCH_PROJECT_SCHEMA,
    appVersion: savedAppVersion,
    savedAtIso: requireString(root.savedAtIso, 'project_savedAtIso'),
    sourceFilesEmbedded: false,
    settings,
    recipe,
    datasets: root.datasets.map(reviveDataset),
  };
}
