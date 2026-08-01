import { describe, expect, it } from 'vitest';
import type { CanonicalRowV1 } from '../science/contracts';
import { createRowId, hashCanonicalDataset } from '../science/hash';
import { createCf1MaterialPreset } from '../science/material';
import type { WorkbenchSettings } from './analyze';
import { APP_VERSION } from './buildInfo';
import { createDefaultWorkbenchRecipe } from './recipe';
import {
  parseWorkbenchProject,
  serializeWorkbenchProject,
  WorkbenchProjectValidationError,
  WORKBENCH_PROJECT_SCHEMA,
  type WorkbenchDatasetV1,
} from './project';

function row(): CanonicalRowV1 {
  const source = {
    sourceFileId: 'fixture',
    sourceFileHash: 'a'.repeat(64),
    instrumentId: 'fixture-instrument',
    channelId: '1',
    sourceStream: 'fixture-stream',
    sourceSheet: null,
    sourceRowIndex: 7n,
    sourceRecordSequence: 9n,
    parserVersion: 'fixture-parser',
  };
  return {
    ...source,
    rowId: createRowId(source),
    elapsedTimeTicks: 123n,
    stepElapsedTimeTicks: 23n,
    timeResolutionNs: 1_000_000n,
    recordSequence: 9n,
    elapsedTimeS: 0.123,
    voltageV: 3.1,
    currentA: -0.001,
    temperatureC: null,
    vendorStepId: '2',
    vendorStepType: 'CC_DChg',
    analysisStepId: 'step-2',
    canonicalStepType: 'discharge',
    chargeCapacityAh: 0,
    dischargeCapacityAh: 0.0001,
    netCapacityAh: -0.0001,
  };
}

function settings(): WorkbenchSettings {
  return {
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
}

function dataset(): WorkbenchDatasetV1 {
  const canonicalRow = row();
  return {
    id: canonicalRow.sourceFileHash,
    fileName: 'fixture.ndax',
    fileSize: 128,
    importedAtIso: '2026-07-17T00:00:00.000Z',
    canonical: {
      rows: [canonicalRow],
      metadata: {
        parserProfileId: 'neware-ndax-ndc17-v1',
        parserProfileVersion: '0.1.1-provisional',
        approvalState: 'provisional',
        instrumentId: 'fixture-instrument',
        channelId: '1',
        testId: null,
        testGuid: null,
        clientVersion: null,
        serverVersion: null,
        firmwareVersion: null,
        activeMassMg: 1,
        remark: null,
        currentRangeMa: null,
        voltageRangeV: null,
        sourceTimeResolutionNs: 1_000_000n,
        programSteps: [],
      },
      sourceFileHash: canonicalRow.sourceFileHash,
      canonicalDatasetHash: hashCanonicalDataset([canonicalRow]),
      normalizationReceiptHash: 'b'.repeat(64),
      warnings: [],
    },
  };
}

function serializedProjectObject(): Record<string, unknown> {
  return JSON.parse(serializeWorkbenchProject(settings(), [dataset()])) as Record<string, unknown>;
}

function projectSettings(value: Record<string, unknown>): Record<string, unknown> {
  return value.settings as Record<string, unknown>;
}

function projectMaterial(value: Record<string, unknown>): Record<string, unknown> {
  return projectSettings(value).material as Record<string, unknown>;
}

function projectRecipe(value: Record<string, unknown>): Record<string, unknown> {
  return value.recipe as Record<string, unknown>;
}

function expectValidationFailure(serialized: string, code: string) {
  let thrown: unknown;
  try {
    parseWorkbenchProject(serialized);
  } catch (error) {
    thrown = error;
  }
  expect(thrown).toBeInstanceOf(WorkbenchProjectValidationError);
  if (!(thrown instanceof WorkbenchProjectValidationError)) return;
  expect(thrown.code).toContain(code);
  expect(thrown.message).toContain('恢复建议');
  expect(thrown.recovery.length).toBeGreaterThan(0);
}

describe('workbench project', () => {
  it('round-trips bigint fields and verifies the canonical hash', () => {
    const fixtureDataset = dataset();
    const fixtureSettings = settings();
    const parsed = parseWorkbenchProject(
      serializeWorkbenchProject(fixtureSettings, [fixtureDataset]),
    );
    expect(parsed.datasets[0].canonical.rows[0].elapsedTimeTicks).toBe(123n);
    expect(parsed.datasets[0].canonical.rows[0].rowId).toBe(
      fixtureDataset.canonical.rows[0].rowId,
    );
    expect(parsed.datasets[0].canonical.canonicalDatasetHash).toBe(
      fixtureDataset.canonical.canonicalDatasetHash,
    );
    expect(parsed.settings).toEqual(fixtureSettings);
    expect(parsed.recipe).toEqual(createDefaultWorkbenchRecipe());
  });

  it('persists the committed minimal recipe separately from legacy workbench settings', () => {
    const fixtureDataset = dataset();
    const recipe = {
      ...createDefaultWorkbenchRecipe(),
      geometryInputMode: 'area' as const,
      electrodeDiameterMm: 14,
      electrodeAreaCm2: 1.4,
      materialParametersByProfileId: {
        cf1: { densityGPerCm3: 2.3, molarMassGPerMol: 31.5 },
      },
      soc: {
        requested: true,
        initialSocPct: 100,
        initialSocSource: 'fresh_cell_assumption' as const,
        datasetStartsAtFreshCell: true,
      },
      datasetSelectionsBySourceFileHash: {
        [fixtureDataset.canonical.sourceFileHash]: {
          materialConfirmation: {
            profileId: 'cf1' as const,
            confidence: 'confirmed' as const,
            evidence: ['operator-confirmed'],
          },
          selectedActiveMassSourceId: 'neware_metadata',
          activeMassOverrideMg: 1.05,
          soc: null,
        },
      },
    };

    const parsed = parseWorkbenchProject(
      serializeWorkbenchProject(settings(), [fixtureDataset], recipe),
    );

    expect(parsed.recipe).toEqual(recipe);
    expect(parsed.settings.electrodeDiameterCm).toBe(1.2);
    expect(parsed.recipe.electrodeDiameterMm).toBe(14);
    expect(parsed.recipe.electrodeAreaCm2).toBe(1.4);
    expect(parsed.recipe.materialParametersByProfileId.cf1).toEqual({
      densityGPerCm3: 2.3,
      molarMassGPerMol: 31.5,
    });
  });

  it('migrates a legacy project without a recipe to an unconfirmed geometry', () => {
    const legacy = serializedProjectObject();
    delete legacy.recipe;

    const parsed = parseWorkbenchProject(JSON.stringify(legacy));

    // The old global setting is retained for compatibility only. It must never
    // become evidence that the user confirmed a 12 mm electrode.
    expect(parsed.settings.electrodeDiameterCm).toBe(1.2);
    expect(parsed.recipe).toEqual(createDefaultWorkbenchRecipe());
    expect(parsed.recipe.electrodeDiameterMm).toBeNull();
  });

  it('migrates recipe v1.0 geometry without inventing area or material overrides', () => {
    const legacy = serializedProjectObject();
    const legacyRecipe = projectRecipe(legacy);
    legacyRecipe.recipeVersion = '1.0.0';
    legacyRecipe.electrodeDiameterMm = 14;
    delete legacyRecipe.geometryInputMode;
    delete legacyRecipe.electrodeAreaCm2;
    delete legacyRecipe.materialParametersByProfileId;

    const parsed = parseWorkbenchProject(JSON.stringify(legacy));

    expect(parsed.recipe).toMatchObject({
      recipeVersion: '1.1.0',
      geometryInputMode: 'diameter',
      electrodeDiameterMm: 14,
      electrodeAreaCm2: null,
      materialParametersByProfileId: {},
    });
  });

  it('rejects a project whose canonical rows were modified', () => {
    const serialized = serializeWorkbenchProject(settings(), [dataset()]).replace(
      '"voltageV": 3.1',
      '"voltageV": 3.2',
    );
    expectValidationFailure(serialized, 'canonical_hash_mismatch');
  });

  it('accepts all declared nullable settings and a valid custom material profile', () => {
    const customSettings: WorkbenchSettings = {
      ...settings(),
      currentResolutionA: 1e-9,
      voltageResolutionV: 1e-6,
      initialSocPct: -2.5,
      initialSocSource: 'preceding_dataset',
      material: {
        ...createCf1MaterialPreset(),
        materialPresetId: 'custom-explicit-v1',
        materialFamily: 'custom',
        densityGPerCm3: null,
        densitySource: null,
        densityMethod: null,
        densityStandardUncertainty: null,
        molarVolumeAuthority: 'explicit_override',
        theoreticalSpecificCapacityMahPerG: null,
        userOverridden: false,
      },
    };
    const parsed = parseWorkbenchProject(
      serializeWorkbenchProject(customSettings, [dataset()]),
    );
    expect(parsed.settings).toEqual(customSettings);
  });

  it('reports malformed JSON and schema failures, but accepts compatible saved app versions', () => {
    expectValidationFailure('{not-json', 'project_json_invalid');

    const wrongSchema = serializedProjectObject();
    wrongSchema.schema = 'gitt-dcr-workbench-project-v0';
    expectValidationFailure(JSON.stringify(wrongSchema), 'unsupported_project_schema');

    const wrongVersion = serializedProjectObject();
    wrongVersion.appVersion = `${APP_VERSION}-other`;
    const openedFromAnotherBuild = parseWorkbenchProject(JSON.stringify(wrongVersion));
    expect(openedFromAnotherBuild.appVersion).toBe(`${APP_VERSION}-other`);

    const missingAppVersion = serializedProjectObject();
    delete missingAppVersion.appVersion;
    expectValidationFailure(JSON.stringify(missingAppVersion), 'project_appVersion_must_be_a_string');

    const embeddedSources = serializedProjectObject();
    embeddedSources.sourceFilesEmbedded = true;
    expectValidationFailure(
      JSON.stringify(embeddedSources),
      'unsupported_embedded_source_contract',
    );
    expect(WORKBENCH_PROJECT_SCHEMA).toBe('gitt-dcr-workbench-project-v1');
  });

  it.each([
    {
      label: 'recipe schema',
      mutate: (project: Record<string, unknown>) => {
        projectRecipe(project).schema = 'gitt-dcr-workbench-recipe-v0';
      },
      code: 'unsupported_project_recipe_schema',
    },
    {
      label: 'recipe geometry',
      mutate: (project: Record<string, unknown>) => {
        projectRecipe(project).electrodeDiameterMm = 0;
      },
      code: 'project_recipe_electrodeDiameterMm_must_be_positive',
    },
    {
      label: 'recipe selection source identity',
      mutate: (project: Record<string, unknown>) => {
        projectRecipe(project).datasetSelectionsBySourceFileHash = {
          non_sha_identity: {
            materialConfirmation: null,
            selectedActiveMassSourceId: null,
            soc: null,
          },
        };
      },
      code: 'project_recipe_datasetSelectionsBySourceFileHash_key_must_be_a_lowercase_sha256',
    },
  ])('rejects malformed committed recipe: $label', ({ mutate, code }) => {
    const project = serializedProjectObject();
    mutate(project);
    expectValidationFailure(JSON.stringify(project), code);
  });

  it('rejects non-finite numeric JSON before analysis', () => {
    const serialized = serializeWorkbenchProject(settings(), [dataset()]).replace(
      '"electrodeDiameterCm": 1.2',
      '"electrodeDiameterCm": 1e400',
    );
    expectValidationFailure(
      serialized,
      'project_settings_electrodeDiameterCm_must_be_a_finite_number',
    );
  });

  it.each([
    {
      label: 'electrode diameter type',
      mutate: (project: Record<string, unknown>) => {
        projectSettings(project).electrodeDiameterCm = '1.2';
      },
      code: 'project_settings_electrodeDiameterCm_must_be_a_finite_number',
    },
    {
      label: 'negative diameter uncertainty',
      mutate: (project: Record<string, unknown>) => {
        projectSettings(project).electrodeDiameterStandardUncertaintyCm = -0.1;
      },
      code: 'project_settings_electrodeDiameterStandardUncertaintyCm_must_be_nonnegative',
    },
    {
      label: 'zero current resolution',
      mutate: (project: Record<string, unknown>) => {
        projectSettings(project).currentResolutionA = 0;
      },
      code: 'project_settings_currentResolutionA_must_be_positive',
    },
    {
      label: 'invalid initial SOC source',
      mutate: (project: Record<string, unknown>) => {
        projectSettings(project).initialSocSource = 'filename_guess';
      },
      code: 'project_settings_initialSocSource_must_be_one_of',
    },
    {
      label: 'invalid fresh-cell flag',
      mutate: (project: Record<string, unknown>) => {
        projectSettings(project).datasetStartsAtFreshCell = 'false';
      },
      code: 'project_settings_datasetStartsAtFreshCell_must_be_a_boolean',
    },
    {
      label: 'material is absent',
      mutate: (project: Record<string, unknown>) => {
        projectSettings(project).material = null;
      },
      code: 'project_settings_material_must_be_an_object',
    },
    {
      label: 'invalid material family',
      mutate: (project: Record<string, unknown>) => {
        projectMaterial(project).materialFamily = 'unapproved_family';
      },
      code: 'project_settings_material_materialFamily_must_be_one_of',
    },
    {
      label: 'invalid density type',
      mutate: (project: Record<string, unknown>) => {
        projectMaterial(project).densityGPerCm3 = '2.25';
      },
      code: 'project_settings_material_densityGPerCm3_must_be_a_finite_number',
    },
    {
      label: 'negative density uncertainty',
      mutate: (project: Record<string, unknown>) => {
        projectMaterial(project).densityStandardUncertainty = -0.01;
      },
      code: 'project_settings_material_densityStandardUncertainty_must_be_nonnegative',
    },
    {
      label: 'invalid molar-volume authority',
      mutate: (project: Record<string, unknown>) => {
        projectMaterial(project).molarVolumeAuthority = 'implicit_override';
      },
      code: 'project_settings_material_molarVolumeAuthority_must_be_one_of',
    },
    {
      label: 'invalid theoretical capacity',
      mutate: (project: Record<string, unknown>) => {
        projectMaterial(project).theoreticalSpecificCapacityMahPerG = 0;
      },
      code: 'project_settings_material_theoreticalSpecificCapacityMahPerG_must_be_positive',
    },
    {
      label: 'invalid user override flag',
      mutate: (project: Record<string, unknown>) => {
        projectMaterial(project).userOverridden = 'true';
      },
      code: 'project_settings_material_userOverridden_must_be_a_boolean',
    },
    {
      label: 'missing preset version',
      mutate: (project: Record<string, unknown>) => {
        delete projectMaterial(project).presetVersion;
      },
      code: 'project_settings_material_presetVersion_must_be_a_string',
    },
  ])('rejects invalid runtime settings: $label', ({ mutate, code }) => {
    const project = serializedProjectObject();
    mutate(project);
    expectValidationFailure(JSON.stringify(project), code);
  });
});
