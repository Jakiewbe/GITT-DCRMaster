import type {
  MeasurementResolutionEvidenceV1,
  MeasurementResolutionSetV1,
  QcFinding,
} from './contracts';
import { qcFinding } from './qc';

const FLOAT32_FRACTION_BITS = 23;

export function unavailableResolutionEvidence(message: string): MeasurementResolutionEvidenceV1 {
  return {
    value: null,
    basisValue: null,
    source: 'unavailable',
    provisional: true,
    message,
  };
}

/**
 * Returns the largest float32 spacing within a symmetric finite full-scale
 * range. This is a serialization bound only, never a device accuracy claim.
 */
export function float32FullScaleSpacing(fullScale: number | null): number | null {
  if (fullScale === null || !Number.isFinite(fullScale) || fullScale <= 0) return null;
  return 2 ** (Math.floor(Math.log2(fullScale)) - FLOAT32_FRACTION_BITS);
}

export function recordStorageFloat32ResolutionEvidence(
  fullScale: number | null,
  quantityLabel: string,
): MeasurementResolutionEvidenceV1 {
  const value = float32FullScaleSpacing(fullScale);
  if (value === null) {
    return unavailableResolutionEvidence(
      `${quantityLabel} full-scale range is absent or invalid, so no record-storage resolution bound is available.`,
    );
  }
  return {
    value,
    basisValue: fullScale,
    source: 'record_storage_float32_full_scale_bound',
    provisional: true,
    message:
      `${quantityLabel} bound derived from Neware NDC float32 storage spacing at the declared full-scale range. ` +
      'It is not a manufacturer measurement-resolution or accuracy specification.',
  };
}

export function advancedUserResolutionEvidence(
  value: number | null,
  quantityLabel: string,
): MeasurementResolutionEvidenceV1 {
  if (value === null || !Number.isFinite(value) || value <= 0) {
    return unavailableResolutionEvidence(`${quantityLabel} override is absent or invalid.`);
  }
  return {
    value,
    basisValue: null,
    source: 'advanced_user_override',
    provisional: true,
    message:
      `${quantityLabel} was supplied through an advanced project override and requires provenance review.`,
  };
}

export function chooseResolutionEvidence(
  override: number | null,
  automatic: MeasurementResolutionEvidenceV1,
  quantityLabel: string,
): MeasurementResolutionEvidenceV1 {
  return override === null ? automatic : advancedUserResolutionEvidence(override, quantityLabel);
}

export function unavailableMeasurementResolutionSet(): MeasurementResolutionSetV1 {
  return {
    currentA: unavailableResolutionEvidence('Current resolution evidence is unavailable.'),
    voltageV: unavailableResolutionEvidence('Voltage resolution evidence is unavailable.'),
  };
}

function sameResolution(left: number | null, right: number | null): boolean {
  if (left === null || right === null) return left === right;
  return Math.abs(left - right) <= Number.EPSILON * Math.max(1, Math.abs(left), Math.abs(right));
}

/**
 * Makes the provenance visible to the QC state. In particular, a float32
 * storage bound must never silently promote a result to valid.
 */
export function resolutionEvidenceFindings(
  quantity: 'current' | 'voltage',
  configuredValue: number | null,
  evidence: MeasurementResolutionEvidenceV1 | undefined,
): QcFinding[] {
  if (!evidence) return [];
  const prefix = `${quantity}_resolution`;
  if (evidence.source === 'unavailable') {
    if (configuredValue === null) {
      return [qcFinding(`${prefix}_unavailable`, 'review', null, evidence.message ?? undefined)];
    }
    return [
      qcFinding(
        `${prefix}_evidence_value_mismatch`,
        'rejected',
        configuredValue,
        'A configured resolution cannot be paired with unavailable resolution evidence.',
      ),
    ];
  }
  if (evidence.value === null || !Number.isFinite(evidence.value) || evidence.value <= 0) {
    return [
      qcFinding(
        `${prefix}_evidence_invalid`,
        'rejected',
        evidence.value,
        'Resolution evidence must contain one positive finite value.',
      ),
    ];
  }
  if (!sameResolution(configuredValue, evidence.value)) {
    return [
      qcFinding(
        `${prefix}_evidence_value_mismatch`,
        'rejected',
        configuredValue,
        'Configured resolution and its provenance record disagree.',
      ),
    ];
  }
  if (evidence.source === 'record_storage_float32_full_scale_bound') {
    return [
      qcFinding(
        `${prefix}_inferred_from_record_storage`,
        'review',
        evidence.value,
        evidence.message ?? undefined,
      ),
    ];
  }
  if (evidence.source === 'advanced_user_override') {
    return [
      qcFinding(
        `${prefix}_advanced_override`,
        'review',
        evidence.value,
        evidence.message ?? undefined,
      ),
    ];
  }
  if (evidence.provisional) {
    return [qcFinding(`${prefix}_profile_provisional`, 'review', evidence.value, evidence.message ?? undefined)];
  }
  return [qcFinding(`${prefix}_profile_declared`, 'valid', evidence.value, evidence.message ?? undefined)];
}
