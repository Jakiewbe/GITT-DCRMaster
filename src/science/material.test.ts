import { describe, expect, it } from 'vitest';

import type { GeometryInputV1, MaterialPresetV1 } from './contracts';
import {
  assessActiveMassConsistency,
  calculateEquivalentThickness,
  calculateTheoreticalQrefAh,
  CF1_MATERIAL_PRESET_V1,
  createCf1MaterialPreset,
} from './material';

const geometry: GeometryInputV1 = {
  activeMassG: 0.001,
  electrodeDiameterCm: 1,
  activeMassStandardUncertaintyG: 0.000_001,
  electrodeDiameterStandardUncertaintyCm: 0.001,
};

function approvedMaterial(overrides: Partial<MaterialPresetV1> = {}): MaterialPresetV1 {
  return {
    materialPresetId: 'TEST',
    materialFamily: 'custom',
    displayName: 'Test material',
    molarMassGPerMol: 10,
    densityGPerCm3: 2,
    densitySource: 'measured on sample batch',
    densityMethod: 'helium pycnometry',
    densityStandardUncertainty: 0.01,
    molarVolumeCm3PerMol: 5,
    molarVolumeAuthority: 'derived_from_density',
    theoreticalSpecificCapacityMahPerG: null,
    presetVersion: '1.0.0',
    userOverridden: false,
    ...overrides,
  };
}

describe('CF1 material preset', () => {
  it('records the user-provided density without inventing method or uncertainty', () => {
    expect(CF1_MATERIAL_PRESET_V1.molarMassGPerMol).toBe(31.01);
    expect(CF1_MATERIAL_PRESET_V1.theoreticalSpecificCapacityMahPerG).toBe(865);
    expect(CF1_MATERIAL_PRESET_V1.densityGPerCm3).toBe(2.25);
    expect(CF1_MATERIAL_PRESET_V1.densitySource).toBe('user_provided_value_2026-07-17');
    expect(CF1_MATERIAL_PRESET_V1.densityMethod).toBeNull();
    expect(CF1_MATERIAL_PRESET_V1.densityStandardUncertainty).toBeNull();
    expect(CF1_MATERIAL_PRESET_V1.userOverridden).toBe(true);
    expect(CF1_MATERIAL_PRESET_V1.presetVersion).toBe('1.0.0-beta.1');
    expect(createCf1MaterialPreset()).not.toBe(CF1_MATERIAL_PRESET_V1);
    expect(calculateTheoreticalQrefAh(createCf1MaterialPreset(), 0.001)).toBeCloseTo(0.000_865, 15);
  });

  it('limits CF1 geometry to review while method and uncertainty remain unknown', () => {
    const result = calculateEquivalentThickness(createCf1MaterialPreset(), geometry);
    expect(result.calculationState).toBe('computed');
    expect(result.qcStatus).toBe('review');
    expect(result.qcCodes).toEqual(expect.arrayContaining(['density_method_missing', 'density_uncertainty_unknown']));
    expect(result.activeMaterialEquivalentThicknessCm).toBeCloseTo(
      geometry.activeMassG / (2.25 * Math.PI * 0.5 ** 2),
      15,
    );
  });
});

describe('equivalent active-material thickness', () => {
  it('uses single-face geometric area and propagates independent input uncertainties', () => {
    const material = approvedMaterial();
    const result = calculateEquivalentThickness(material, geometry);
    const expectedLength = geometry.activeMassG / (2 * Math.PI * 0.5 ** 2);
    const expectedRelativeUncertainty = Math.sqrt((0.000_001 / 0.001) ** 2 + (2 * 0.001) ** 2 + (0.01 / 2) ** 2);

    expect(result.calculationState).toBe('computed');
    expect(result.qcStatus).toBe('valid');
    expect(result.singleFaceAreaCm2).toBeCloseTo(Math.PI * 0.5 ** 2, 15);
    expect(result.activeMaterialEquivalentThicknessCm).toBeCloseTo(expectedLength, 15);
    expect(result.relativeEquivalentThicknessUncertainty).toBeCloseTo(expectedRelativeUncertainty, 15);
    expect(result.equivalentThicknessStandardUncertaintyCm).toBeCloseTo(
      expectedLength * expectedRelativeUncertainty,
      15,
    );
  });

  it('reviews a 2-5% derived molar-volume inconsistency and rejects one above 5%', () => {
    const review = calculateEquivalentThickness(approvedMaterial({ molarVolumeCm3PerMol: 5.2 }), geometry);
    expect(review.qcStatus).toBe('review');
    expect(review.molarVolumeConsistencyRatio).toBeCloseTo(0.04);
    expect(review.activeMaterialEquivalentThicknessCm).not.toBeNull();

    const rejected = calculateEquivalentThickness(approvedMaterial({ molarVolumeCm3PerMol: 5.3 }), geometry);
    expect(rejected.qcStatus).toBe('rejected');
    expect(rejected.activeMaterialEquivalentThicknessCm).toBeNull();
  });

  it('honors an explicit molar-volume override but makes the mismatch and unknown uncertainty reviewable', () => {
    const result = calculateEquivalentThickness(
      approvedMaterial({ molarVolumeAuthority: 'explicit_override', molarVolumeCm3PerMol: 6 }),
      geometry,
    );
    expect(result.calculationState).toBe('computed');
    expect(result.qcStatus).toBe('review');
    expect(result.qcCodes).toEqual(
      expect.arrayContaining(['molar_volume_explicit_override_mismatch', 'molar_volume_uncertainty_unknown']),
    );
    expect(result.activeMaterialEquivalentThicknessCm).toBeCloseTo(
      (geometry.activeMassG * 6) / (10 * Math.PI * 0.5 ** 2),
    );
  });
});

describe('mass evidence', () => {
  it('requires manual resolution when evidence differs by more than max(0.01 mg, 1%)', () => {
    const consistent = assessActiveMassConsistency(0.001, [{ source: 'remark', valueG: 0.001_009 }]);
    expect(consistent.qcStatus).toBe('valid');
    expect(consistent.toleranceG).toBe(0.000_01);

    const conflict = assessActiveMassConsistency(0.001, [
      { source: 'filename', valueG: 0.001 },
      { source: 'neware_remark', valueG: 0.001_02 },
    ]);
    expect(conflict.calculationState).toBe('not_computable');
    expect(conflict.qcStatus).toBe('rejected');
    expect(conflict.conflictingSources).toEqual(['neware_remark']);
  });
});
