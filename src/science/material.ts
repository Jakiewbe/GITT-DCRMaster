import type {
  GeometryInputV1,
  GeometryResultV1,
  MaterialPresetV1,
  QcFinding,
  ScientificResultStateV1,
} from './contracts';
import { qcFinding, resultStateFromFindings } from './qc';

export const CF1_MATERIAL_PRESET_V1: Readonly<MaterialPresetV1> = Object.freeze({
  materialPresetId: 'CF1_PRESET_USER_DENSITY_2026_07_17',
  materialFamily: 'cfx_conversion',
  displayName: 'CF₁（项目参考密度 2.25 g/cm³；比较口径）',
  molarMassGPerMol: 31.01,
  densityGPerCm3: 2.25,
  densitySource: 'user_provided_value_2026-07-17',
  densityMethod: null,
  densityStandardUncertainty: null,
  molarVolumeCm3PerMol: 31.01 / 2.25,
  molarVolumeAuthority: 'derived_from_density',
  theoreticalSpecificCapacityMahPerG: 865,
  presetVersion: '1.0.0-beta.1',
  userOverridden: true,
});

export function createCf1MaterialPreset(): MaterialPresetV1 {
  return { ...CF1_MATERIAL_PRESET_V1 };
}

function isPositiveFinite(value: number | null): value is number {
  return value !== null && Number.isFinite(value) && value > 0;
}

function invalidUncertainty(value: number | null): boolean {
  return value !== null && (!Number.isFinite(value) || value < 0);
}

function rejectedGeometry(findings: QcFinding[]): GeometryResultV1 {
  return {
    ...resultStateFromFindings(findings, 'not_computable'),
    singleFaceAreaCm2: null,
    activeMaterialEquivalentThicknessCm: null,
    equivalentThicknessStandardUncertaintyCm: null,
    relativeEquivalentThicknessUncertainty: null,
    molarVolumeConsistencyRatio: null,
  };
}

export function calculateSingleFaceAreaCm2(electrodeDiameterCm: number): number {
  if (!isPositiveFinite(electrodeDiameterCm)) throw new RangeError('electrodeDiameterCm must be positive');
  return Math.PI * (electrodeDiameterCm / 2) ** 2;
}

export function calculateTheoreticalQrefAh(material: MaterialPresetV1, activeMassG: number): number {
  if (!isPositiveFinite(activeMassG)) throw new RangeError('activeMassG must be positive');
  if (!isPositiveFinite(material.theoreticalSpecificCapacityMahPerG)) {
    throw new RangeError('Material does not define a positive theoretical specific capacity');
  }
  return (activeMassG * material.theoreticalSpecificCapacityMahPerG) / 1000;
}

/**
 * Computes the WH active-material equivalent thickness. This quantity is not a
 * coating thickness, pore length, or particle diffusion radius.
 */
export function calculateEquivalentThickness(
  material: MaterialPresetV1,
  geometry: GeometryInputV1,
): GeometryResultV1 {
  const findings: QcFinding[] = [];

  if (!isPositiveFinite(geometry.activeMassG)) findings.push(qcFinding('active_mass_invalid', 'rejected'));
  if (!isPositiveFinite(geometry.electrodeDiameterCm)) {
    findings.push(qcFinding('electrode_diameter_invalid', 'rejected'));
  }
  if (!isPositiveFinite(material.molarMassGPerMol)) findings.push(qcFinding('molar_mass_invalid', 'rejected'));
  if (!isPositiveFinite(material.molarVolumeCm3PerMol)) {
    findings.push(qcFinding('molar_volume_invalid', 'rejected'));
  }
  if (material.densityGPerCm3 !== null && !isPositiveFinite(material.densityGPerCm3)) {
    findings.push(qcFinding('density_invalid', 'rejected'));
  }
  if (invalidUncertainty(geometry.activeMassStandardUncertaintyG)) {
    findings.push(qcFinding('active_mass_uncertainty_invalid', 'rejected'));
  }
  if (invalidUncertainty(geometry.electrodeDiameterStandardUncertaintyCm)) {
    findings.push(qcFinding('electrode_diameter_uncertainty_invalid', 'rejected'));
  }
  if (invalidUncertainty(material.densityStandardUncertainty)) {
    findings.push(qcFinding('density_uncertainty_invalid', 'rejected'));
  }
  if (material.molarVolumeAuthority === 'derived_from_density' && !isPositiveFinite(material.densityGPerCm3)) {
    findings.push(qcFinding('density_required_for_derived_molar_volume', 'rejected'));
  }

  if (findings.some((finding) => finding.status === 'rejected')) return rejectedGeometry(findings);

  const singleFaceAreaCm2 = calculateSingleFaceAreaCm2(geometry.electrodeDiameterCm);
  const density = material.densityGPerCm3;
  const derivedMolarVolume = density === null ? null : material.molarMassGPerMol / density;
  const molarVolumeConsistencyRatio =
    derivedMolarVolume === null
      ? null
      : Math.abs(material.molarVolumeCm3PerMol - derivedMolarVolume) / derivedMolarVolume;

  if (molarVolumeConsistencyRatio !== null) {
    if (molarVolumeConsistencyRatio <= 0.02) {
      findings.push(qcFinding('molar_volume_consistent', 'valid', molarVolumeConsistencyRatio));
    } else if (molarVolumeConsistencyRatio <= 0.05) {
      findings.push(qcFinding('molar_volume_consistency_review', 'review', molarVolumeConsistencyRatio));
    } else if (material.molarVolumeAuthority === 'explicit_override') {
      findings.push(qcFinding('molar_volume_explicit_override_mismatch', 'review', molarVolumeConsistencyRatio));
    } else {
      findings.push(qcFinding('molar_volume_inconsistent', 'rejected', molarVolumeConsistencyRatio));
    }
  }

  if (!material.densitySource) findings.push(qcFinding('density_source_missing', 'review'));
  if (!material.densityMethod) findings.push(qcFinding('density_method_missing', 'review'));
  if (material.densityStandardUncertainty === null) {
    findings.push(qcFinding('density_uncertainty_unknown', 'review'));
  }

  if (findings.some((finding) => finding.status === 'rejected')) {
    return {
      ...resultStateFromFindings(findings, 'computed'),
      singleFaceAreaCm2,
      activeMaterialEquivalentThicknessCm: null,
      equivalentThicknessStandardUncertaintyCm: null,
      relativeEquivalentThicknessUncertainty: null,
      molarVolumeConsistencyRatio,
    };
  }

  const authoritativeMolarVolume =
    material.molarVolumeAuthority === 'derived_from_density'
      ? (derivedMolarVolume as number)
      : material.molarVolumeCm3PerMol;
  const equivalentThickness =
    (geometry.activeMassG * authoritativeMolarVolume) /
    (material.molarMassGPerMol * singleFaceAreaCm2);

  let relativeUncertainty: number | null = null;
  if (
    geometry.activeMassStandardUncertaintyG === null ||
    geometry.electrodeDiameterStandardUncertaintyCm === null
  ) {
    findings.push(qcFinding('geometry_uncertainty_unknown', 'review'));
  } else if (material.molarVolumeAuthority === 'explicit_override') {
    findings.push(qcFinding('molar_volume_uncertainty_unknown', 'review'));
  } else if (material.densityStandardUncertainty !== null && density !== null) {
    relativeUncertainty = Math.sqrt(
      (geometry.activeMassStandardUncertaintyG / geometry.activeMassG) ** 2 +
        (2 * geometry.electrodeDiameterStandardUncertaintyCm / geometry.electrodeDiameterCm) ** 2 +
        (material.densityStandardUncertainty / density) ** 2,
    );

    if (relativeUncertainty <= 0.05) {
      findings.push(qcFinding('equivalent_length_uncertainty_valid', 'valid', relativeUncertainty));
    } else if (relativeUncertainty <= 0.15) {
      findings.push(qcFinding('equivalent_length_uncertainty_review', 'review', relativeUncertainty));
    } else {
      findings.push(qcFinding('equivalent_length_uncertainty_rejected', 'rejected', relativeUncertainty));
    }
  }

  return {
    ...resultStateFromFindings(findings, 'computed'),
    singleFaceAreaCm2,
    activeMaterialEquivalentThicknessCm:
      findings.some((finding) => finding.status === 'rejected') ? null : equivalentThickness,
    equivalentThicknessStandardUncertaintyCm:
      relativeUncertainty === null ? null : equivalentThickness * relativeUncertainty,
    relativeEquivalentThicknessUncertainty: relativeUncertainty,
    molarVolumeConsistencyRatio,
  };
}

export type ActiveMassEvidence = {
  source: string;
  valueG: number;
};

export type ActiveMassConsistencyResult = ScientificResultStateV1 & {
  toleranceG: number | null;
  maximumDifferenceG: number | null;
  conflictingSources: string[];
};

export function assessActiveMassConsistency(
  userInputMassG: number,
  evidence: readonly ActiveMassEvidence[],
): ActiveMassConsistencyResult {
  if (!isPositiveFinite(userInputMassG) || evidence.some((item) => !isPositiveFinite(item.valueG))) {
    const state = resultStateFromFindings([qcFinding('active_mass_evidence_invalid', 'rejected')], 'not_computable');
    return { ...state, toleranceG: null, maximumDifferenceG: null, conflictingSources: [] };
  }

  const toleranceG = Math.max(0.000_01, userInputMassG * 0.01);
  const differences = evidence.map((item) => ({
    source: item.source,
    difference: Math.abs(item.valueG - userInputMassG),
  }));
  const maximumDifferenceG = differences.reduce((maximum, item) => Math.max(maximum, item.difference), 0);
  const conflictingSources = differences
    .filter((item) => item.difference > toleranceG)
    .map((item) => item.source);
  const findings =
    conflictingSources.length === 0
      ? [qcFinding('active_mass_evidence_consistent', 'valid', maximumDifferenceG)]
      : [qcFinding('active_mass_evidence_conflict', 'rejected', maximumDifferenceG)];

  return {
    ...resultStateFromFindings(findings, conflictingSources.length === 0 ? 'computed' : 'not_computable'),
    toleranceG,
    maximumDifferenceG,
    conflictingSources,
  };
}
