import { describe, expect, it } from 'vitest';
import { calculateRegressionMetricCm2PerS } from './regressionMetric';

describe('GITT regression diagnostic metric', () => {
  it('uses the fitted slope and the complete pulse duration', () => {
    const lengthCm = 5e-4;
    const deltaEsV = 0.02;
    const pulseDurationS = 100;
    const slopeVPerSqrtS = 0.01;

    const expected =
      (4 / Math.PI) * (lengthCm * deltaEsV / (pulseDurationS * slopeVPerSqrtS)) ** 2;

    expect(
      calculateRegressionMetricCm2PerS({
        lengthCm,
        deltaEsV,
        pulseDurationS,
        slopeVPerSqrtS,
      }),
    ).toBeCloseTo(expected, 18);
  });

  it('returns no diagnostic value when the fitted slope or duration is unusable', () => {
    expect(
      calculateRegressionMetricCm2PerS({
        lengthCm: 5e-4,
        deltaEsV: 0.02,
        pulseDurationS: 100,
        slopeVPerSqrtS: 0,
      }),
    ).toBeNull();
    expect(
      calculateRegressionMetricCm2PerS({
        lengthCm: 5e-4,
        deltaEsV: 0.02,
        pulseDurationS: 0,
        slopeVPerSqrtS: 0.01,
      }),
    ).toBeNull();
  });
});
