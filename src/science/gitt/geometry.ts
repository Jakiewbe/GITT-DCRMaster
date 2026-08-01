import type { GittPulseInputV1, QcFinding } from '../contracts';
import { qcFinding } from '../qc';

export type GeometryAnalysis = {
  singleFaceAreaCm2: number | null;
  activeMaterialEquivalentThicknessCm: number | null;
  equivalentThicknessStandardUncertaintyCm: number | null;
  relativeEquivalentThicknessUncertainty: number | null;
  molarVolumeConsistencyRatio: number | null;
  findings: QcFinding[];
};

function positiveFinite(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}

export function analyzeEquivalentGeometry(input: GittPulseInputV1): GeometryAnalysis {
  const { material, config } = input;
  const findings: QcFinding[] = [];
  if (!positiveFinite(config.activeMassG)) findings.push(qcFinding('active_mass_invalid', 'rejected', config.activeMassG));
  if (!positiveFinite(config.electrodeDiameterCm)) {
    findings.push(qcFinding('electrode_diameter_invalid', 'rejected', config.electrodeDiameterCm));
  }
  if (!positiveFinite(material.molarMassGPerMol)) {
    findings.push(qcFinding('molar_mass_invalid', 'rejected', material.molarMassGPerMol));
  }
  if (!positiveFinite(material.molarVolumeCm3PerMol)) {
    findings.push(qcFinding('molar_volume_invalid', 'rejected', material.molarVolumeCm3PerMol));
  }
  if (findings.some((finding) => finding.status === 'rejected')) {
    return {
      singleFaceAreaCm2: null,
      activeMaterialEquivalentThicknessCm: null,
      equivalentThicknessStandardUncertaintyCm: null,
      relativeEquivalentThicknessUncertainty: null,
      molarVolumeConsistencyRatio: null,
      findings,
    };
  }

  const areaCm2 = Math.PI * (config.electrodeDiameterCm / 2) ** 2;
  const thicknessCm =
    (config.activeMassG * material.molarVolumeCm3PerMol) /
    (material.molarMassGPerMol * areaCm2);

  let consistencyRatio: number | null = null;
  if (material.densityGPerCm3 !== null && positiveFinite(material.densityGPerCm3)) {
    const densityDerivedMolarVolume = material.molarMassGPerMol / material.densityGPerCm3;
    consistencyRatio = Math.abs(material.molarVolumeCm3PerMol - densityDerivedMolarVolume) / densityDerivedMolarVolume;
    const status =
      consistencyRatio <= 0.02
        ? 'valid'
        : consistencyRatio <= 0.05 || material.molarVolumeAuthority === 'explicit_override'
          ? 'review'
          : 'rejected';
    findings.push(
      qcFinding(
        material.molarVolumeAuthority === 'explicit_override'
          ? 'molar_volume_explicit_override_consistency'
          : 'molar_volume_density_consistency',
        status,
        consistencyRatio,
      ),
    );
  } else if (material.molarVolumeAuthority === 'derived_from_density') {
    findings.push(
      qcFinding(
        'density_required_for_derived_molar_volume',
        'rejected',
        material.densityGPerCm3,
        'A density-derived molar volume must retain its positive density evidence.',
      ),
    );
  } else {
    findings.push(
      qcFinding(
        'density_missing_for_explicit_molar_volume',
        'review',
        null,
        'Equivalent length is calculable, but density sensitivity cannot be quantified.',
      ),
    );
  }

  if (!material.densitySource || !material.densityMethod) {
    findings.push(
      qcFinding(
        'density_provenance_incomplete',
        'review',
        null,
        'Density source and method are required before the material preset can be scientifically frozen.',
      ),
    );
  }

  const massU = config.activeMassStandardUncertaintyG ?? null;
  const diameterU = config.electrodeDiameterStandardUncertaintyCm ?? null;
  if (massU !== null && massU < 0) findings.push(qcFinding('active_mass_uncertainty_invalid', 'rejected', massU));
  if (diameterU !== null && diameterU < 0) {
    findings.push(qcFinding('electrode_diameter_uncertainty_invalid', 'rejected', diameterU));
  }
  if (material.densityStandardUncertainty !== null && material.densityStandardUncertainty < 0) {
    findings.push(
      qcFinding('density_uncertainty_invalid', 'rejected', material.densityStandardUncertainty),
    );
  }

  let relativeUncertainty: number | null = null;
  if (
    massU !== null &&
    diameterU !== null &&
    massU >= 0 &&
    diameterU >= 0 &&
    material.molarVolumeAuthority === 'derived_from_density' &&
    material.densityGPerCm3 !== null &&
    positiveFinite(material.densityGPerCm3) &&
    material.densityStandardUncertainty !== null &&
    material.densityStandardUncertainty >= 0
  ) {
    relativeUncertainty = Math.sqrt(
      (massU / config.activeMassG) ** 2 +
        (2 * diameterU / config.electrodeDiameterCm) ** 2 +
        (material.densityStandardUncertainty / material.densityGPerCm3) ** 2,
    );
  } else {
    findings.push(
      qcFinding(
        'equivalent_length_uncertainty_unknown',
        'review',
        null,
        'Mass, diameter and density-derived molar-volume uncertainty are needed for u(L).',
      ),
    );
  }

  return {
    singleFaceAreaCm2: areaCm2,
    activeMaterialEquivalentThicknessCm: thicknessCm,
    equivalentThicknessStandardUncertaintyCm:
      relativeUncertainty === null ? null : thicknessCm * relativeUncertainty,
    relativeEquivalentThicknessUncertainty: relativeUncertainty,
    molarVolumeConsistencyRatio: consistencyRatio,
    findings,
  };
}
