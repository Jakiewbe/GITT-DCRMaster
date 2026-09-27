import { describe, expect, it } from 'vitest';

import type { CfxLiterature1200sPulseSourceV1 } from './literature1200sGittProfile';
import type { NewareGitt1200sEventV1 } from '../../adapters/neware/gitt1200sProfile';
import {
  CFX_LITERATURE_GITT_1200S_PROFILE_V1,
  analyzeCfxLiterature1200sGittProfile,
} from './literature1200sGittProfile';

const cf1 = {
  materialFamily: 'cfx_conversion',
  displayName: 'CF₁',
  theoreticalSpecificCapacityMahPerG: 865,
} as const;

function sourcePulse(
  overrides: Partial<CfxLiterature1200sPulseSourceV1> = {},
): CfxLiterature1200sPulseSourceV1 {
  return {
    pulseId: 'pulse-1',
    calculationState: 'computed',
    qcStatus: 'rejected',
    qcCodes: ['pulse_capacity_fraction'],
    modelApplicability: 'limited',
    interpretationScope: 'comparative_index_only',
    metricKind: 'wh_comparative_transport_index',
    diagnosticCandidateMetricValueCm2PerS: 1.2e-10,
    pulseDurationS: 1200,
    pulseCapacityFraction: 0.077,
    deltaEsV: -0.02,
    observedDeltaEAtTauV: -0.15,
    endpointConsistencyRelativeError: 0.08,
    pulseCurrentCv: 0.003,
    pulseEndVoltageV: 1.65,
    postRestDurationS: 14_400,
    ...overrides,
  };
}

function sourcePulseWithMedian(
  medianVoltageV: number,
  overrides: Partial<CfxLiterature1200sPulseSourceV1> = {},
): CfxLiterature1200sPulseSourceV1 & { medianVoltageV: number } {
  return {
    ...sourcePulse({
      pulseCapacityFraction: 0.2,
      ...overrides,
    }),
    medianVoltageV,
  };
}

function postProtocolCutoffEvent(): NewareGitt1200sEventV1 {
  return {
    isPostProtocolCutoff: true,
    postRestState: 'completed_standard_rest',
  } as unknown as NewareGitt1200sEventV1;
}

describe('CFₓ literature 1200 s GITT profile', () => {
  it('adapts a complete 1200 s >3% pulse into a model-limited comparative and polarization result', () => {
    const result = analyzeCfxLiterature1200sGittProfile({
      material: cf1,
      activeMassG: 0.001,
      pulseResults: [sourcePulse()],
    });

    expect(result.profile).toEqual(CFX_LITERATURE_GITT_1200S_PROFILE_V1);
    expect(result.materialAssessment).toEqual({
      modelApplicability: 'limited',
      interpretationScope: 'comparative_index_only',
      intrinsicDiffusivityClaim: false,
    });
    expect(result.qref.qrefAh).toBeCloseTo(0.000865, 15);
    expect(result.summary).toMatchObject({
      submittedPulseCount: 1,
      complete1200sPulseCount: 1,
      numericallyComputedComparativeIndexCount: 1,
      genericSmallPerturbationExceededCount: 1,
      medianDAppCandidateCm2PerS: 1.2e-10,
    });
    expect(result.pulses[0]).toMatchObject({
      eventClassification: 'complete_1200s_standard_rest',
      numericalState: 'computed',
      comparativeUse: 'available_with_model_warnings',
      transportComparison: {
        outputId: 'CFX_1200S_WH_APPARENT_COMPARATIVE_INDEX',
        label: 'WH 平面端点手算法结果（CFₓ 1200 s 文献约定）',
        dAppCandidateCm2PerS: 1.2e-10,
        intrinsicDiffusivityClaim: false,
      },
      polarization: {
        pulseEndPolarizationV: -0.15,
        absolutePulseEndPolarizationV: 0.15,
        restEndPotentialShiftV: -0.02,
      },
    });
    expect(result.pulses[0].polarization.equivalentAverageCurrentA).toBeCloseTo(0.000199815, 12);
    expect(result.pulses[0].polarization.equivalentSpecificCurrentMahPerG).toBeCloseTo(199.815, 12);
    expect(result.pulses[0].polarization.apparentPulsePolarizationQuotientOhm).toBeCloseTo(
      750.694392312889,
      10,
    );
    expect(result.pulses[0].modelWarnings.map((warning) => warning.code)).toEqual(
      expect.arrayContaining([
        'cfx_conversion_model_limited',
        'generic_wh_small_perturbation_not_met',
        'generic_wh_qc_rejected',
      ]),
    );
    expect(result.pulses[0].sourceGenericState).toEqual({
      calculationState: 'computed',
      qcStatus: 'rejected',
      qcCodes: ['pulse_capacity_fraction'],
      primaryEndpointQcStatus: 'review',
      primaryEndpointQcReasons: [],
      cfx10SlopeQcStatus: 'review',
      cfx10SlopeQcReasons: [],
    });
    expect(result.comparabilityGroupingKey).toContain('pulseS=1200');
    expect(result.comparabilityGroupingKey).toContain('postRestS=14400');
  });

  it('keeps numeric calculability independent from model warnings and does not turn generic rejection valid', () => {
    const result = analyzeCfxLiterature1200sGittProfile({
      material: cf1,
      activeMassG: 0.001,
      pulseResults: [sourcePulse({ diagnosticCandidateMetricValueCm2PerS: 2e-11 })],
    });

    const adapted = result.pulses[0];
    expect(adapted.numericalState).toBe('computed');
    expect(adapted.transportComparison.dAppCandidateCm2PerS).toBe(2e-11);
    expect(adapted.sourceGenericState.qcStatus).toBe('rejected');
    expect(adapted.modelWarnings.some((warning) => warning.code === 'generic_wh_qc_rejected')).toBe(true);
    expect(JSON.stringify(result)).not.toContain('intrinsic_diffusion');
  });

  it('excludes non-complete duration segments from the 1200 s trend while retaining an audit result', () => {
    const result = analyzeCfxLiterature1200sGittProfile({
      material: cf1,
      activeMassG: 0.001,
      pulseResults: [
        sourcePulse({ pulseId: 'complete', pulseDurationS: 1200.1, diagnosticCandidateMetricValueCm2PerS: 1e-10 }),
        sourcePulse({
          pulseId: 'cutoff-early',
          pulseDurationS: 900,
          pulseEndVoltageV: 1.5005,
          diagnosticCandidateMetricValueCm2PerS: 9e-11,
        }),
        sourcePulse({ pulseId: 'short-rest', postRestDurationS: 3600, diagnosticCandidateMetricValueCm2PerS: 8e-11 }),
        sourcePulse({ pulseId: 'numeric-missing', diagnosticCandidateMetricValueCm2PerS: null }),
      ],
    });

    expect(result.summary).toMatchObject({
      submittedPulseCount: 4,
      complete1200sPulseCount: 2,
      cutoffEarlyPulseCount: 1,
      postRestTruncatedPulseCount: 1,
      otherExcludedPulseCount: 0,
      numericallyComputedComparativeIndexCount: 1,
      numericallyNotComputableCount: 1,
      medianDAppCandidateCm2PerS: 1e-10,
    });
    expect(result.pulses.find((pulse) => pulse.sourcePulseId === 'cutoff-early')).toMatchObject({
      eventClassification: 'excluded_cutoff_early',
      numericalState: 'computed',
      comparativeUse: 'not_available',
      transportComparison: { dAppCandidateCm2PerS: null },
    });
    expect(result.pulses.find((pulse) => pulse.sourcePulseId === 'cutoff-early')?.modelWarnings).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'pulse_voltage_cutoff_early' })]),
    );
    expect(result.pulses.find((pulse) => pulse.sourcePulseId === 'short-rest')).toMatchObject({
      eventClassification: 'excluded_post_rest_truncated',
      transportComparison: { dAppCandidateCm2PerS: null },
    });
    expect(result.nextSteps).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'inspect_cutoff_early_pulses' }),
        expect.objectContaining({ code: 'inspect_post_rest_truncation' }),
      ]),
    );
  });

  it('returns not-computable numerical data without needing a manual uncertainty input', () => {
    const result = analyzeCfxLiterature1200sGittProfile({
      material: { ...cf1, theoreticalSpecificCapacityMahPerG: null },
      activeMassG: null,
      pulseResults: [sourcePulse({ diagnosticCandidateMetricValueCm2PerS: null })],
    });

    expect(result.qref.source).toBe('unavailable');
    expect(result.pulses[0].numericalState).toBe('not_computable');
    expect(result.pulses[0].polarization.equivalentAverageCurrentA).toBeNull();
    expect(result.nextSteps).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'verify_qref_and_active_mass' })]),
    );
  });

  it('separates the median comparison target from protocol eligibility', () => {
    const result = analyzeCfxLiterature1200sGittProfile({
      material: cf1,
      activeMassG: 0.001,
      pulseResults: [
        sourcePulseWithMedian(1.5),
        sourcePulseWithMedian(1.499),
      ],
    });

    expect(result.pulses.map((pulse) => pulse.displayComparisonEligibility)).toEqual([
      'included',
      'excluded_comparison_target_median',
    ]);
    expect(result.pulses[1].transportComparison.dAppCandidateCm2PerS).toBe(1.2e-10);
    expect(result.summary.comparisonTargetMedianExcludedCount).toBe(1);
  });

  it('applies the median comparison target below and at the former 500 mA·g⁻¹ boundary', () => {
    const result = analyzeCfxLiterature1200sGittProfile({
      material: cf1,
      activeMassG: 0.001,
      pulseResults: [
        sourcePulseWithMedian(1.499, { pulseCapacityFraction: 499.999 / (865 * 3) }),
        sourcePulseWithMedian(1.5, { pulseCapacityFraction: 500 / (865 * 3) }),
      ],
    });

    expect(result.pulses.map((pulse) => pulse.displayComparisonEligibility)).toEqual([
      'excluded_comparison_target_median',
      'included',
    ]);
  });

  it('uses the 1.5 V median target for every CFₓ comparison pulse, not only high-rate pulses', () => {
    const result = analyzeCfxLiterature1200sGittProfile({
      material: cf1,
      activeMassG: 0.001,
      pulseResults: [
        sourcePulseWithMedian(1.49, { pulseCapacityFraction: 0.1 }),
        sourcePulseWithMedian(1.51, { pulseId: 'target-reached', pulseCapacityFraction: 0.1 }),
      ],
    });

    expect(result.profile.comparisonTargetMedianVoltageV).toBe(1.5);
    expect(result.pulses.map((pulse) => pulse.displayComparisonEligibility)).toEqual([
      'excluded_comparison_target_median',
      'included',
    ]);
  });

  it('uses the median-voltage target after a protocol cutoff for main comparison', () => {
    const result = analyzeCfxLiterature1200sGittProfile({
      material: cf1,
      activeMassG: 0.001,
      pulseResults: [sourcePulseWithMedian(1.7, {
        pulseId: 'post-cutoff',
        programEvent: postProtocolCutoffEvent(),
      })],
    });

    expect(result.pulses[0]).toMatchObject({
      eventClassification: 'post_protocol_cutoff',
      displayComparisonEligibility: 'included',
      auditDAppCandidateCm2PerS: 1.2e-10,
      transportComparison: { dAppCandidateCm2PerS: 1.2e-10 },
    });
  });

  it('stops the main comparison at a post-cutoff median below 1.5 V', () => {
    const result = analyzeCfxLiterature1200sGittProfile({
      material: cf1,
      activeMassG: 0.001,
      pulseResults: [sourcePulseWithMedian(1.499, {
        pulseId: 'post-cutoff-below-floor',
        programEvent: postProtocolCutoffEvent(),
      })],
    });

    expect(result.pulses[0]).toMatchObject({
      eventClassification: 'post_protocol_cutoff',
      displayComparisonEligibility: 'excluded_comparison_target_median',
      auditDAppCandidateCm2PerS: 1.2e-10,
    });
  });

  it('does not admit a post-cutoff pulse with insufficient pulse duration into the main plot', () => {
    const result = analyzeCfxLiterature1200sGittProfile({
      material: cf1,
      activeMassG: 0.001,
      pulseResults: [sourcePulseWithMedian(1.7, {
        pulseId: 'post-cutoff-short-pulse',
        pulseDurationS: 900,
        programEvent: postProtocolCutoffEvent(),
      })],
    });

    expect(result.pulses[0]).toMatchObject({
      eventClassification: 'post_protocol_cutoff',
      displayComparisonEligibility: 'excluded_protocol_event',
      auditDAppCandidateCm2PerS: 1.2e-10,
    });
  });
});
