import { describe, expect, it } from 'vitest';
import type { GittRegressionWindowResultV1, QcFinding } from '../contracts';
import {
  assessCfx10sQuality,
  assessPrimaryEndpointQuality,
  type PrimaryComparisonEligibility,
} from './qcModel';

function finding(
  code: string,
  status: QcFinding['status'],
  metric: number | null = null,
): QcFinding {
  return { code, status, metric };
}

function window(
  overrides: Partial<GittRegressionWindowResultV1> = {},
): GittRegressionWindowResultV1 {
  return {
    windowId: 'cfx_10s',
    windowLabel: 'CFx 10 s',
    kind: 'fixed_time',
    requestedStartS: 0,
    requestedEndS: 64,
    actualStartS: 10,
    actualEndS: 60,
    pointCount: 6,
    uniqueTimePointCount: 6,
    fitDurationS: 50,
    fitEndFractionOfPulse: 0.05,
    slopeVPerSqrtS: -0.01,
    interceptV: 3.2,
    rSquared: 0.995,
    rmseV: 0.001,
    slopeStdError: 0.001,
    curvatureMetric: 0.05,
    maxNormalizedResidual: 0.02,
    monotonicityRatio: 1,
    durbinWatson: 2,
    metricValueCm2PerS: 1e-12,
    windowCoverageIncomplete: false,
    samplingCoverage: 'full',
    linearityClass: 'strong_linearity',
    status: 'valid',
    warnings: [],
    ...overrides,
  };
}

describe('GITT layered quality states', () => {
  it('keeps a finite CFx endpoint as comparable with warnings when only model rules fail', () => {
    const assessed = assessPrimaryEndpointQuality(
      [
        finding('post_rest_end_stability', 'rejected', 18),
        finding('pulse_capacity_fraction', 'rejected', 0.077),
        finding('endpoint_consistency_relative_error', 'rejected', 0.83),
      ],
      'computed',
    );

    expect(assessed.status).toBe('review');
    expect(assessed.eligibility).toBe<PrimaryComparisonEligibility>('included_with_warnings');
    expect(assessed.reasons.every((reason) => reason.severity !== 'reject')).toBe(true);
    expect(assessed.reasons.map((reason) => reason.domain)).toContain('endpoint_model');
  });

  it('rejects an endpoint whose signed pulse and rest changes disagree', () => {
    const assessed = assessPrimaryEndpointQuality(
      [finding('delta_es_delta_et_direction_mismatch', 'rejected')],
      'computed',
    );

    expect(assessed.status).toBe('rejected');
    expect(assessed.eligibility).toBe<PrimaryComparisonEligibility>('excluded');
    expect(assessed.reasons[0]).toMatchObject({
      code: 'delta_es_delta_et_direction_mismatch',
      severity: 'reject',
      domain: 'data',
    });
  });

  it('excludes a value that cannot be computed even when no finding was emitted', () => {
    const assessed = assessPrimaryEndpointQuality([], 'not_computable');
    expect(assessed.status).toBe('rejected');
    expect(assessed.eligibility).toBe('excluded');
  });

  it('classifies a fully covered CFx10s fit as valid', () => {
    const assessed = assessCfx10sQuality(window(), []);
    expect(assessed.status).toBe('valid');
    expect(assessed.reasons).toEqual([]);
  });

  it('keeps early nonlinear CFx10s data computable but under review', () => {
    const assessed = assessCfx10sQuality(
      window({
        rSquared: 0.8,
        linearityClass: 'early_response_nonlinear',
        status: 'review',
        warnings: ['fit_hard_gates_failed'],
      }),
      [finding('fit_r_squared', 'rejected', 0.8)],
    );
    expect(assessed.status).toBe('review');
    expect(assessed.reasons.some((reason) => reason.code === 'CFX10_EARLY_RESPONSE_NONLINEAR')).toBe(true);
  });

  it('reports insufficient sampling as infeasible instead of rejecting the endpoint', () => {
    const assessed = assessCfx10sQuality(
      window({
        uniqueTimePointCount: 4,
        pointCount: 4,
        metricValueCm2PerS: null,
        samplingCoverage: 'infeasible',
        linearityClass: 'unavailable',
        status: 'infeasible',
      }),
      [],
    );
    expect(assessed.status).toBe('infeasible');
    expect(assessed.reasons[0]).toMatchObject({
      code: 'CFX10_INSUFFICIENT_POINTS',
      domain: 'sampling',
      severity: 'review',
    });
  });
});
