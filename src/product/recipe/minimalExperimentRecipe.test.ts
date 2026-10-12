import { describe, expect, it } from 'vitest';

import {
  buildMinimalExperimentRecipe,
  createMinimalExperimentRecipeInputFromNeware,
  extractMassMg,
  type MinimalExperimentRecipeInputV1,
} from './minimalExperimentRecipe';

function cfxGittInput(
  overrides: Partial<MinimalExperimentRecipeInputV1> = {},
): MinimalExperimentRecipeInputV1 {
  return {
    analysisKind: 'gitt',
    material: { profileId: 'cf1', confidence: 'confirmed' },
    activeMass: { metadataMassMg: 1.032 },
    geometry: { electrodeDiameterMm: 12 },
    ...overrides,
  };
}

describe('minimal experiment recipe', () => {
  it.each([
    ['CFx-200ma-1.032mg.ndax', 1.032], ['FGS-0.52 mg.cex', 0.52], ['mass-0.001032g.ndax', 1.032],
    ['mass-1032μg.ndax', 1.032], ['mass-1032ug.ndax', 1.032], ['mass-１．０３２ｍｇ.ndax', 1.032],
    ['活性质量1.032毫克', 1.032], ['CFx-200ma-2.ndax', null], ['C1500-1.144-DCR.ndax', null],
    ['1mg-2mg.ndax', null], ['0mg.ndax', null],
  ])('reads explicit mass units from %s without guessing unrelated numbers', (text, expected) => {
    if (expected === null) expect(extractMassMg(text)).toBeNull();
    else expect(extractMassMg(text)).toBeCloseTo(expected, 12);
  });
  it('uses a unique explicit-unit source when instrument mass is absent, retaining provenance', () => {
    const result = buildMinimalExperimentRecipe(cfxGittInput({ activeMass: { metadataMassMg: null,
      corroboratingEvidence: [{ sourceId: 'filename', label: 'file', massMg: 1.05 }] } }));
    expect(result.readyToAnalyze).toBe(true);
    expect(result.resolved.activeMassG).toBeCloseTo(0.00105, 15);
    expect(result.resolved.activeMassSourceId).toBe('filename');
  });
  it('does not let a matching Remark suppress a conflicting filename mass', () => {
    const result = buildMinimalExperimentRecipe(cfxGittInput({ activeMass: { metadataMassMg: 1,
      corroboratingEvidence: [{ sourceId: 'filename', label: 'file', massMg: 2 }, { sourceId: 'neware_remark', label: 'remark', massMg: 1 }] } }));
    expect(result.readyToAnalyze).toBe(false);
    expect(result.blocking.map((item) => item.code)).toContain('active_mass_conflict');
  });
  it('asks nothing for DCR', () => {
    const recipe = buildMinimalExperimentRecipe({
      analysisKind: 'dcr',
      material: { profileId: null, confidence: 'unknown' },
      soc: { requested: true },
    });

    expect(recipe.readyToAnalyze).toBe(true);
    expect(recipe.questions).toEqual([]);
    expect(recipe.blocking).toEqual([]);
    expect(recipe.resolved).toMatchObject({
      material: null,
      electrodeDiameterCm: null,
      qrefAh: null,
      soc: { requested: false },
    });
  });

  it('asks a CFx GITT user only for diameter when all file facts are already reliable', () => {
    const recipe = buildMinimalExperimentRecipe(
      cfxGittInput({ geometry: { electrodeDiameterMm: null } }),
    );

    expect(recipe.questions.map((question) => question.id)).toEqual(['electrode_diameter_mm']);
    expect(recipe.blocking.map((item) => item.code)).toEqual(['electrode_diameter_required']);
    expect(recipe.autoResolved.map((item) => item.id)).toEqual(
      expect.arrayContaining([
        'neware_active_mass_metadata',
        'cf1_density_reference_2_25_g_per_cm3',
        'cf1_theoretical_capacity_865_mah_per_g',
      ]),
    );
    expect(recipe.resolved.activeMassG).toBeCloseTo(0.001_032, 15);
    expect(recipe.resolved.qrefAh).toBeCloseTo(0.000_892_68, 15);
  });

  it('derives CFx material and active mass from a Neware canonical dataset', () => {
    const dataset = {
      metadata: { activeMassMg: 1.032, remark: 'CFx GITT; 1.032 mg' },
      rows: [{ sourceFileId: 'CFx-GITT-200ma-1.032mg-2.ndax' }],
    } as Parameters<typeof createMinimalExperimentRecipeInputFromNeware>[0];
    const input = createMinimalExperimentRecipeInputFromNeware(dataset, {
      analysisKind: 'gitt',
      geometry: { electrodeDiameterMm: 12 },
    });
    const recipe = buildMinimalExperimentRecipe(input);

    expect(input.material).toMatchObject({ profileId: 'cf1', confidence: 'inferred' });
    expect(recipe.readyToAnalyze).toBe(true);
    expect(recipe.questions).toEqual([]);
    expect(recipe.resolved.activeMassG).toBeCloseTo(0.001_032, 15);
    expect(recipe.autoResolved.map((item) => item.id)).toContain('material_profile_inferred');
  });

  it('needs no question when the GITT diameter is already saved at project level', () => {
    const recipe = buildMinimalExperimentRecipe(cfxGittInput());

    expect(recipe.readyToAnalyze).toBe(true);
    expect(recipe.questions).toEqual([]);
    expect(recipe.blocking).toEqual([]);
    expect(recipe.resolved.electrodeDiameterCm).toBeCloseTo(1.2, 15);
    expect(recipe.resolved.material?.preset.densityGPerCm3).toBe(2.25);
    expect(recipe.resolved.material?.preset.theoreticalSpecificCapacityMahPerG).toBe(865);
  });

  it('accepts direct single-face area and derives the equivalent circular diameter for the solver', () => {
    const areaCm2 = Math.PI * 0.6 ** 2;
    const recipe = buildMinimalExperimentRecipe(cfxGittInput({
      geometry: { inputMode: 'area', electrodeAreaCm2: areaCm2 },
    }));

    expect(recipe.readyToAnalyze).toBe(true);
    expect(recipe.resolved.geometryInputMode).toBe('area');
    expect(recipe.resolved.electrodeAreaCm2).toBeCloseTo(areaCm2, 15);
    expect(recipe.resolved.electrodeDiameterCm).toBeCloseTo(1.2, 15);
  });

  it('applies editable density and molar mass while keeping molar volume density-derived', () => {
    const recipe = buildMinimalExperimentRecipe(cfxGittInput({
      materialParametersByProfileId: {
        cf1: { densityGPerCm3: 2.1, molarMassGPerMol: 31.5 },
      },
    }));

    expect(recipe.readyToAnalyze).toBe(true);
    expect(recipe.resolved.material?.preset).toMatchObject({
      densityGPerCm3: 2.1,
      molarMassGPerMol: 31.5,
      molarVolumeAuthority: 'derived_from_density',
      userOverridden: true,
    });
    expect(recipe.resolved.material?.preset.molarVolumeCm3PerMol).toBeCloseTo(15, 15);
  });

  it('allows an operator-confirmed active mass to override conflicting file evidence', () => {
    const recipe = buildMinimalExperimentRecipe(cfxGittInput({
      activeMass: {
        metadataMassMg: 1.032,
        userOverrideMassMg: 1.1,
        corroboratingEvidence: [
          { sourceId: 'filename', label: 'filename', massMg: 1.16 },
        ],
      },
    }));

    expect(recipe.readyToAnalyze).toBe(true);
    expect(recipe.resolved.activeMassG).toBeCloseTo(0.0011, 15);
    expect(recipe.resolved.activeMassSourceId).toBe('user_input');
  });

  it('turns a real mass discrepancy into one targeted source confirmation', () => {
    const recipe = buildMinimalExperimentRecipe(
      cfxGittInput({
        activeMass: {
          metadataMassMg: 1.032,
          corroboratingEvidence: [
            { sourceId: 'filename', label: '文件名中的质量', massMg: 1.16 },
            { sourceId: 'neware_remark', label: 'Remark 中的质量', massMg: 0.976 },
          ],
        },
      }),
    );

    expect(recipe.readyToAnalyze).toBe(false);
    expect(recipe.questions.map((question) => question.id)).toEqual(['confirm_active_mass_source']);
    expect(recipe.questions[0].choices?.map((choice) => choice.value)).toEqual([
      'neware_metadata',
      'filename',
      'neware_remark',
    ]);
    expect(recipe.blocking).toEqual([
      expect.objectContaining({ code: 'active_mass_conflict', questionId: 'confirm_active_mass_source' }),
    ]);
    expect(recipe.resolved.activeMassG).toBeNull();
    expect(recipe.questions.map((question) => question.id)).not.toContain('electrode_diameter_mm');
  });

  it('keeps the channel metadata when the filename independently corroborates it and only Remark is stale', () => {
    const recipe = buildMinimalExperimentRecipe(
      cfxGittInput({
        activeMass: {
          metadataMassMg: 1.032,
          corroboratingEvidence: [
            { sourceId: 'filename', label: '文件名中的质量', massMg: 1.032 },
            { sourceId: 'neware_remark', label: 'Remark 中的质量', massMg: 0.976 },
          ],
        },
      }),
    );

    expect(recipe.readyToAnalyze).toBe(true);
    expect(recipe.questions).toEqual([]);
    expect(recipe.resolved.activeMassSourceId).toBe('neware_metadata');
    expect(recipe.autoResolved.map((item) => item.id)).toContain(
      'neware_metadata_mass_corroborated_by_filename',
    );
  });

  it('does not ask about SOC when SOC is disabled', () => {
    const recipe = buildMinimalExperimentRecipe(
      cfxGittInput({ soc: { requested: false, initialSocPct: null, initialSocSource: 'unknown' } }),
    );

    expect(recipe.questions).toEqual([]);
    expect(recipe.resolved.soc).toEqual({
      requested: false,
      initialSocPct: null,
      initialSocSource: 'unknown',
      available: false,
    });
  });

  it('asks for the material only when recognition is uncertain', () => {
    const recipe = buildMinimalExperimentRecipe(
      cfxGittInput({ material: { profileId: null, confidence: 'uncertain' } }),
    );

    expect(recipe.questions.map((question) => question.id)).toEqual(['confirm_material_profile']);
    expect(recipe.blocking.map((item) => item.code)).toEqual(['material_profile_confirmation_required']);
  });

  it('keeps a requested but unknown initial SOC optional to the core analysis', () => {
    const recipe = buildMinimalExperimentRecipe(cfxGittInput({ soc: { requested: true } }));

    expect(recipe.readyToAnalyze).toBe(true);
    expect(recipe.questions).toEqual([
      expect.objectContaining({ id: 'initial_soc_pct', required: false }),
    ]);
    expect(recipe.resolved.soc.available).toBe(false);
  });
});
