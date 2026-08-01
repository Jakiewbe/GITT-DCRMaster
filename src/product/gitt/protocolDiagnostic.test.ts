import { describe, expect, it } from 'vitest';

import type { CfxGittPulseSourceV1 } from './protocolDiagnostic';
import { diagnoseCfxGittProtocol } from './protocolDiagnostic';

const cf1 = {
  materialFamily: 'cfx_conversion',
  displayName: 'CF₁',
  theoreticalSpecificCapacityMahPerG: 865,
} as const;

function pulse(overrides: Partial<CfxGittPulseSourceV1> = {}): CfxGittPulseSourceV1 {
  return {
    pulseId: 'pulse-1',
    pulseDurationS: 1200,
    pulseCapacityFraction: 0.077,
    calculationState: 'computed',
    qcStatus: 'rejected',
    qcCodes: ['pulse_capacity_fraction'],
    modelApplicability: 'limited',
    interpretationScope: 'comparative_index_only',
    metricKind: 'wh_comparative_transport_index',
    ...overrides,
  };
}

describe('CFₓ GITT protocol diagnostic product layer', () => {
  it('turns the current 200 mA/g × 1200 s style pulse into a protocol failure and actionable limits', () => {
    const diagnostic = diagnoseCfxGittProtocol({
      material: cf1,
      activeMassG: 0.001,
      pulseResults: [pulse()],
    });

    expect(diagnostic.qref).toEqual({
      valueAh: 0.000_865,
      specificCapacityMahPerG: 865,
      source: 'material_theoretical_specific_capacity',
    });
    expect(diagnostic.pulseSummary).toEqual({
      total: 1,
      withinValidTarget: 0,
      withinReviewTarget: 0,
      smallPerturbationFailures: 1,
      notAssessable: 0,
    });
    expect(diagnostic.pulses[0]).toMatchObject({
      perturbationBand: 'exceeds_review_target',
      smallPerturbationFailure: true,
      sourceRejectedForSmallPerturbation: true,
    });
    expect(diagnostic.transportMetricPresentation.numericTransportMetricVisibility).toBe('not_presented');
    expect(diagnostic).not.toHaveProperty('metricValueCm2PerS');
    expect(diagnostic.protocol.representativeCurrentA).toBeCloseTo(0.000_199_815, 12);
    expect(diagnostic.protocol.representativeSpecificCurrentMahPerG).toBeCloseTo(199.815, 12);

    const validTarget = diagnostic.recommendations.find((item) => item.target === 'valid');
    const reviewTarget = diagnostic.recommendations.find((item) => item.target === 'review');
    expect(validTarget?.maximumPulseDurationS).toBeCloseTo(155.844155844156, 10);
    expect(validTarget?.maximumCurrentA).toBeCloseTo(0.000_025_95, 12);
    expect(validTarget?.maximumSpecificCurrentMahPerG).toBeCloseTo(25.95, 12);
    expect(reviewTarget?.maximumPulseDurationS).toBeCloseTo(467.532467532467, 10);
    expect(diagnostic.nextSteps).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'reduce_pulse_perturbation', priority: 'required' })]),
    );
  });

  it('keeps ≤1% pulses protocol-eligible but still does not present a CFₓ transport coefficient', () => {
    const diagnostic = diagnoseCfxGittProtocol({
      material: cf1,
      activeMassG: 0.001,
      plannedPulse: { pulseCurrentA: -0.0001, pulseDurationS: 60 },
      pulseResults: [
        pulse({
          pulseCapacityFraction: 0.008,
          pulseDurationS: 60,
          qcStatus: 'review',
          qcCodes: [],
        }),
      ],
    });

    expect(diagnostic.pulseSummary.smallPerturbationFailures).toBe(0);
    expect(diagnostic.pulseSummary.withinValidTarget).toBe(1);
    expect(diagnostic.protocol).toMatchObject({
      representativeCurrentA: 0.0001,
      representativeCurrentSource: 'planned_input',
      representativeDurationS: 60,
      representativeDurationSource: 'planned_input',
    });
    expect(diagnostic.headline).toContain('≤1%');
    expect(diagnostic.transportMetricPresentation).toEqual({
      displayName: 'WH 平面模型表观传输比较指标',
      numericTransportMetricVisibility: 'not_presented',
      interpretationBoundary: 'comparative_index_only',
    });
    expect(diagnostic.nextSteps.map((step) => step.code)).not.toContain('reduce_pulse_perturbation');
  });

  it('uses the longest observed pulse when a protocol later shortens its pulses', () => {
    const diagnostic = diagnoseCfxGittProtocol({
      material: cf1,
      activeMassG: 0.001,
      pulseResults: [
        pulse({ pulseId: 'full', pulseDurationS: 1200, pulseCapacityFraction: 0.077 }),
        pulse({
          pulseId: 'shortened',
          pulseDurationS: 60,
          pulseCapacityFraction: 0.00385,
          qcStatus: 'review',
          qcCodes: [],
        }),
      ],
    });

    expect(diagnostic.protocol.representativeDurationS).toBe(1200);
    const validTarget = diagnostic.recommendations.find((item) => item.target === 'valid');
    expect(validTarget?.maximumSpecificCurrentMahPerG).toBeCloseTo(25.95, 10);
  });

  it('separates a 1–3% review pulse from a >3% failure and remains useful when Qref is unavailable', () => {
    const diagnostic = diagnoseCfxGittProtocol({
      material: { ...cf1, theoreticalSpecificCapacityMahPerG: null },
      activeMassG: null,
      plannedPulse: { pulseDurationS: 1200 },
      pulseResults: [
        pulse({
          pulseId: 'review',
          pulseCapacityFraction: 0.02,
          qcStatus: 'rejected',
          qcCodes: ['pulse_capacity_fraction', 'another_unrelated_rejection'],
        }),
        pulse({ pulseId: 'unknown', pulseCapacityFraction: null, qcStatus: null, qcCodes: [] }),
      ],
    });

    expect(diagnostic.qref.source).toBe('unavailable');
    expect(diagnostic.pulseSummary).toEqual({
      total: 2,
      withinValidTarget: 0,
      withinReviewTarget: 1,
      smallPerturbationFailures: 0,
      notAssessable: 1,
    });
    expect(diagnostic.recommendations.every((item) => item.maximumCurrentA === null)).toBe(true);
    expect(diagnostic.pulses[0].smallPerturbationFailure).toBe(false);
    expect(diagnostic.pulses[0].sourceRejectedForSmallPerturbation).toBe(false);
    expect(diagnostic.nextSteps).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'verify_qref_or_active_mass', priority: 'required' }),
        expect.objectContaining({ code: 'review_borderline_perturbation', priority: 'recommended' }),
      ]),
    );
  });
});
