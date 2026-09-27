type RegressionMetricInputs = {
  lengthCm: number | null;
  deltaEsV: number | null;
  pulseDurationS: number | null;
  slopeVPerSqrtS: number | null;
};

function finite(value: number | null): value is number {
  return value !== null && Number.isFinite(value);
}

/**
 * Calculates the GITT value obtained by replacing the endpoint pulse change
 * with the fitted E-versus-sqrt(t) change at the complete pulse duration.
 *
 * This is deliberately a diagnostic companion to the frozen endpoint method:
 * it is useful for checking whether five-point regression and endpoint
 * sampling tell the same story, but it is not the reported main result.
 */
export function calculateRegressionMetricCm2PerS(
  inputs: RegressionMetricInputs,
): number | null {
  if (
    !finite(inputs.lengthCm) ||
    inputs.lengthCm <= 0 ||
    !finite(inputs.deltaEsV) ||
    !finite(inputs.pulseDurationS) ||
    inputs.pulseDurationS <= 0 ||
    !finite(inputs.slopeVPerSqrtS) ||
    inputs.slopeVPerSqrtS === 0
  ) {
    return null;
  }

  const value =
    (4 / Math.PI) *
    (inputs.lengthCm * inputs.deltaEsV / (inputs.pulseDurationS * inputs.slopeVPerSqrtS)) ** 2;
  return Number.isFinite(value) && value >= 0 ? value : null;
}

export function calculateLog10DRange(values: readonly (number | null)[]): number | null {
  const logValues = values
    .filter((value): value is number => value !== null && Number.isFinite(value) && value > 0)
    .map((value) => Math.log10(value));

  if (logValues.length < 2) {
    return null;
  }

  return Math.max(...logValues) - Math.min(...logValues);
}
