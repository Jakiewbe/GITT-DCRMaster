import { describe, expect, it } from 'vitest';

import type { NewareProfileClassification } from '../adapters/neware/events';
import type { NewareCanonicalDataset } from '../adapters/neware/normalize';
import { createCf1MaterialPreset } from '../science/material';
import type { WorkbenchSettings } from './analyze';
import {
  RecipePlanNotReadyError,
  applyRecipePlanToWorkbenchSettings,
  buildDatasetRecipePlan,
  createDefaultWorkbenchRecipe,
  type WorkbenchRecipeV1,
} from './recipe';

function dataset(
  sourceFileHash: string,
  sourceFileId: string,
  activeMassMg: number | null = 1.032,
): NewareCanonicalDataset {
  return {
    sourceFileHash,
    canonicalDatasetHash: `canonical-${sourceFileHash}`,
    normalizationReceiptHash: `receipt-${sourceFileHash}`,
    warnings: [],
    metadata: { activeMassMg, remark: null },
    rows: [{ sourceFileId }],
  } as unknown as NewareCanonicalDataset;
}

function classification(analysisKind: 'dcr' | 'gitt' | 'unknown'): Pick<
  NewareProfileClassification,
  'analysisKind'
> {
  return { analysisKind };
}

function baseSettings(): WorkbenchSettings {
  return {
    electrodeDiameterCm: 0.8,
    electrodeDiameterStandardUncertaintyCm: null,
    activeMassStandardUncertaintyG: null,
    currentResolutionA: null,
    voltageResolutionV: null,
    material: createCf1MaterialPreset(),
    initialSocPct: 77,
    initialSocSource: 'user_input',
    datasetStartsAtFreshCell: true,
  };
}

describe('workbench recipe bridge', () => {
  it('starts persistable, empty, and without an opt-in SOC request', () => {
    const recipe = createDefaultWorkbenchRecipe();

    expect(recipe).toEqual({
      schema: 'gitt-dcr-workbench-recipe-v1',
      recipeVersion: '1.1.0',
      geometryInputMode: 'diameter',
      electrodeDiameterMm: null,
      electrodeAreaCm2: null,
      materialParametersByProfileId: {},
      soc: {
        requested: false,
        initialSocPct: null,
        initialSocSource: 'unknown',
        datasetStartsAtFreshCell: false,
      },
      datasetSelectionsBySourceFileHash: {},
    });
  });

  it('delegates CFx recognition to the minimal recipe and resolves its science facts', () => {
    const recipe = { ...createDefaultWorkbenchRecipe(), electrodeDiameterMm: 12 };
    const source = dataset('cfx-hash', 'CFx-GITT-200ma-1.032mg-2.ndax');

    const plan = buildDatasetRecipePlan(source, classification('gitt'), recipe);

    expect(plan.readyToAnalyze).toBe(true);
    expect(plan.resolved.material).toMatchObject({ profileId: 'cf1' });
    expect(plan.resolved.activeMassG).toBeCloseTo(0.001_032, 15);
    expect(plan.resolved.activeMassSourceId).toBe('neware_metadata');
    expect(plan.resolved.electrodeDiameterCm).toBeCloseTo(1.2, 15);
    expect(plan.resolved.soc).toMatchObject({ requested: false, available: false });
    expect(plan.autoResolved.map((item) => item.id)).toContain('material_profile_inferred');
  });

  it('uses a hash-keyed material confirmation instead of performing its own FGS inference', () => {
    const source = dataset('fgs-hash', 'FGS-GITT-200ma-1.032mg-2.ndax');
    const recipe: WorkbenchRecipeV1 = {
      ...createDefaultWorkbenchRecipe(),
      electrodeDiameterMm: 12,
      datasetSelectionsBySourceFileHash: {
        [source.sourceFileHash]: {
          materialConfirmation: { profileId: 'cf1', confidence: 'confirmed' },
          selectedActiveMassSourceId: null,
          activeMassOverrideMg: null,
          soc: null,
        },
      },
    };

    const plan = buildDatasetRecipePlan(source, classification('gitt'), recipe);

    expect(plan.readyToAnalyze).toBe(true);
    expect(plan.resolved.material?.profileId).toBe('cf1');
    expect(plan.autoResolved.map((item) => item.id)).not.toContain('material_profile_inferred');
  });

  it('applies resolved geometry, material, mass provenance, and disabled SOC per dataset', () => {
    const recipe = { ...createDefaultWorkbenchRecipe(), electrodeDiameterMm: 12 };
    const source = dataset('apply-hash', 'CFx-GITT-200ma-1.032mg-2.ndax');
    const plan = buildDatasetRecipePlan(source, classification('gitt'), recipe);

    const settings = applyRecipePlanToWorkbenchSettings(baseSettings(), plan);

    expect(settings.electrodeDiameterCm).toBeCloseTo(1.2, 15);
    expect(settings.material.materialPresetId).toBe('CF1_PRESET_USER_DENSITY_2026_07_17');
    expect(settings.activeMassOverrideG).toBeCloseTo(0.001_032, 15);
    expect(settings.activeMassSourceId).toBe('neware_metadata');
    expect(settings.recipeMaterialProfileId).toBe('cf1');
    expect(settings.socRequested).toBe(false);
    expect(settings.initialSocPct).toBeNull();
    expect(settings.initialSocSource).toBe('unknown');
    expect(settings.datasetStartsAtFreshCell).toBe(false);
  });

  it('passes direct area and editable physical parameters into the scientific settings', () => {
    const source = dataset('physical-inputs', 'CFx-GITT-200ma-1.032mg-2.ndax');
    const recipe: WorkbenchRecipeV1 = {
      ...createDefaultWorkbenchRecipe(),
      geometryInputMode: 'area',
      electrodeAreaCm2: 1.2,
      materialParametersByProfileId: {
        cf1: { densityGPerCm3: 2.15, molarMassGPerMol: 31.2 },
      },
      datasetSelectionsBySourceFileHash: {
        [source.sourceFileHash]: {
          materialConfirmation: null,
          selectedActiveMassSourceId: null,
          activeMassOverrideMg: 1.05,
          soc: null,
        },
      },
    };

    const settings = applyRecipePlanToWorkbenchSettings(
      baseSettings(),
      buildDatasetRecipePlan(source, classification('gitt'), recipe),
    );

    expect(settings.recipeGeometryInputMode).toBe('area');
    expect(settings.recipeElectrodeAreaCm2).toBe(1.2);
    expect(settings.electrodeDiameterCm).toBeCloseTo(2 * Math.sqrt(1.2 / Math.PI), 15);
    expect(settings.activeMassOverrideG).toBeCloseTo(0.00105, 15);
    expect(settings.activeMassSourceId).toBe('user_input');
    expect(settings.material).toMatchObject({
      densityGPerCm3: 2.15,
      molarMassGPerMol: 31.2,
      molarVolumeAuthority: 'derived_from_density',
    });
  });

  it('uses a selected mass source only for the dataset with the matching source hash', () => {
    const source = dataset('mass-hash', 'CFx-GITT-200ma-1.160mg-2.ndax');
    const recipe: WorkbenchRecipeV1 = {
      ...createDefaultWorkbenchRecipe(),
      electrodeDiameterMm: 12,
      datasetSelectionsBySourceFileHash: {
        [source.sourceFileHash]: {
          materialConfirmation: null,
          selectedActiveMassSourceId: 'filename',
          activeMassOverrideMg: null,
          soc: null,
        },
      },
    };

    const plan = buildDatasetRecipePlan(source, classification('gitt'), recipe);
    const settings = applyRecipePlanToWorkbenchSettings(baseSettings(), plan);

    expect(plan.readyToAnalyze).toBe(true);
    expect(settings.activeMassOverrideG).toBeCloseTo(0.001_16, 15);
    expect(settings.activeMassSourceId).toBe('filename');
  });

  it('keeps DCR ready without material, geometry, mass, or SOC facts', () => {
    const plan = buildDatasetRecipePlan(
      dataset('dcr-hash', 'DCR.ndax', null),
      classification('dcr'),
      createDefaultWorkbenchRecipe(),
    );

    expect(plan.readyToAnalyze).toBe(true);
    expect(plan.questions).toEqual([]);
    expect(plan.resolved.material).toBeNull();
    const settings = applyRecipePlanToWorkbenchSettings(baseSettings(), plan);
    expect(settings.recipeAnalysisKind).toBe('dcr');
    expect(settings.activeMassOverrideG).toBeNull();
    expect(settings.socRequested).toBe(false);
  });

  it('does not fall back to stale base GITT settings when the recipe is incomplete', () => {
    const plan = buildDatasetRecipePlan(
      dataset('missing-geometry', 'CFx-GITT-200ma-1.032mg-2.ndax'),
      classification('gitt'),
      createDefaultWorkbenchRecipe(),
    );

    expect(plan.readyToAnalyze).toBe(false);
    expect(plan.blocking.map((item) => item.code)).toContain('electrode_diameter_required');
    expect(() => applyRecipePlanToWorkbenchSettings(baseSettings(), plan)).toThrow(RecipePlanNotReadyError);
  });
});
