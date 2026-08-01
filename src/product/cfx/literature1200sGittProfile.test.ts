import { describe, expect, it } from 'vitest';

import type { CfxLiterature1200sPulseSourceV1 } from './literature1200sGittProfile';
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
      numericalState: 'not_computable',
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
});
