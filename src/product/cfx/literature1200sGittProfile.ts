import type {
  GittResultV1,
  MaterialPresetV1,
  PrimaryComparisonEligibilityV1,
  QcReasonV1,
  QcStatus,
} from '../../science/contracts';
import type { NewareGitt1200sEventV1 } from '../../adapters/neware/gitt1200sProfile';

export const CFX_LITERATURE_GITT_1200S_PROFILE_V1 = {
  profileId: 'CFX_LITERATURE_GITT_1200S_COMPARATIVE_V1',
  profileVersion: '1.2.0',
  completePulseDurationS: 1200,
  /** Accepts e.g. 1200.1 s controller sampling overrun as a completed pulse. */
  completePulseToleranceS: 1,
  standardPostRestDurationS: 14_400,
  standardPostRestToleranceS: 1,
  pulseCutoffVoltageV: 1.5,
  pulseCutoffVoltageToleranceV: 0.005,
  /** Post-processing comparison target; separate from the device Stop_Volt. */
  comparisonTargetMedianVoltageV: 1.5,
  genericWhValidPerturbationMaximumFraction: 0.01,
  genericWhReviewPerturbationMaximumFraction: 0.03,
  highRateSpecificCurrentThresholdMahPerG: 500,
  /** @deprecated Use comparisonTargetMedianVoltageV. Kept for manifest compatibility. */
  highRateMedianVoltageFloorV: 1.5,
} as const;

export const CFX_HIGH_RATE_SPECIFIC_CURRENT_THRESHOLD_MA_G =
  CFX_LITERATURE_GITT_1200S_PROFILE_V1.highRateSpecificCurrentThresholdMahPerG;
export const CFX_HIGH_RATE_MEDIAN_VOLTAGE_FLOOR_V =
  CFX_LITERATURE_GITT_1200S_PROFILE_V1.comparisonTargetMedianVoltageV;
export const CFX_COMPARISON_TARGET_MEDIAN_VOLTAGE_V =
  CFX_LITERATURE_GITT_1200S_PROFILE_V1.comparisonTargetMedianVoltageV;

export type CfxLiterature1200sPulseSourceV1 = Pick<
  GittResultV1,
  | 'pulseId'
  | 'calculationState'
  | 'qcStatus'
  | 'qcCodes'
  | 'modelApplicability'
  | 'interpretationScope'
  | 'metricKind'
  | 'diagnosticCandidateMetricValueCm2PerS'
  | 'pulseDurationS'
  | 'pulseCapacityFraction'
  | 'deltaEsV'
  | 'observedDeltaEAtTauV'
  | 'endpointConsistencyRelativeError'
  | 'pulseCurrentCv'
  | 'pulseEndVoltageV'
> & Partial<Pick<
  GittResultV1,
  | 'medianVoltageV'
  | 'primaryEndpointQcStatus'
  | 'primaryEndpointQcReasons'
  | 'cfx10SlopeQcStatus'
  | 'cfx10SlopeQcReasons'
  | 'primaryComparisonEligibility'
>> & {
  /** Derived from the following Rest step; never supplied as a manual setting. */
  postRestDurationS: number | null;
  /**
   * Optional program-semantic classification taken from the same NDAX file.
   * When present it is authoritative over the legacy duration/voltage
   * fallback below: a cutoff is never inferred merely from an arbitrary
   * voltage that happens to be near 1.5 V.
   */
  programEvent?: NewareGitt1200sEventV1 | null;
};

export type CfxLiterature1200sGittProfileInputV1 = {
  material: Pick<
    MaterialPresetV1,
    'materialFamily' | 'displayName' | 'theoreticalSpecificCapacityMahPerG'
  >;
  /** Resolved active-material mass from the imported record, not an uncertainty entry. */
  activeMassG: number | null;
  pulseResults: readonly CfxLiterature1200sPulseSourceV1[];
};

export type CfxLiteratureModelWarningCodeV1 =
  | 'cfx_conversion_model_limited'
  | 'source_material_profile_mismatch'
  | 'generic_wh_small_perturbation_review'
  | 'generic_wh_small_perturbation_not_met'
  | 'generic_wh_qc_rejected'
  | 'generic_wh_qc_review'
  | 'qref_or_active_mass_unavailable'
  | 'pulse_current_stability_review'
  | 'incomplete_pulse_without_cutoff'
  | 'pulse_voltage_cutoff_early'
  | 'post_protocol_cutoff'
  | 'comparison_target_median_voltage'
  | 'post_rest_truncated'
  | 'nonstandard_post_rest';

export type CfxLiteratureModelWarningV1 = {
  code: CfxLiteratureModelWarningCodeV1;
  message: string;
};

export type CfxLiteratureDisplayComparisonEligibilityV1 =
  | 'included'
  | 'excluded_comparison_target_median'
  | 'excluded_protocol_cutoff'
  | 'excluded_protocol_event'
  | 'excluded_not_computable';

export type CfxLiterature1200sPulseProfileResultV1 = {
  sourcePulseId: string;
  sourceOrder: number;
  medianVoltageV: number | null;
  eventClassification:
    | 'complete_1200s_standard_rest'
    | 'post_protocol_cutoff'
    | 'excluded_cutoff_early'
    | 'excluded_not_complete_1200s'
    | 'excluded_post_rest_truncated'
    | 'excluded_nonstandard_post_rest';
  protocolStatus:
    | 'compatible'
    | 'post_protocol_cutoff'
    | 'review'
    | 'excluded_cutoff_early'
    | 'incomplete_pulse'
    | 'insufficient_rest';
  numericalState: 'computed' | 'not_computable';
  numericalCodes: string[];
  comparativeUse: 'available_with_model_warnings' | 'not_available';
  primaryComparisonEligibility: PrimaryComparisonEligibilityV1;
  displayComparisonEligibility: CfxLiteratureDisplayComparisonEligibilityV1;
  sourceGenericState: {
    calculationState: CfxLiterature1200sPulseSourceV1['calculationState'];
    qcStatus: QcStatus | null;
    qcCodes: string[];
    primaryEndpointQcStatus: QcStatus;
    primaryEndpointQcReasons: QcReasonV1[];
    cfx10SlopeQcStatus: GittResultV1['cfx10SlopeQcStatus'];
    cfx10SlopeQcReasons: QcReasonV1[];
  };
  transportComparison: {
    outputId: 'CFX_1200S_WH_APPARENT_COMPARATIVE_INDEX';
    label: 'WH 平面端点手算法结果（CFₓ 1200 s 文献约定）';
    dAppCandidateCm2PerS: number | null;
    intrinsicDiffusivityClaim: false;
  };
  /** Finite result retained for audit even when protocol/display eligibility excludes it. */
  auditDAppCandidateCm2PerS: number | null;
  polarization: {
    pulseEndPolarizationV: number | null;
    absolutePulseEndPolarizationV: number | null;
    pulseEndVoltageV: number | null;
    restEndPotentialShiftV: number | null;
    postRestDurationS: number | null;
    restRecoveryFractionOfPulsePolarization: number | null;
    equivalentAverageCurrentA: number | null;
    equivalentSpecificCurrentMahPerG: number | null;
    apparentPulsePolarizationQuotientOhm: number | null;
    pulseCapacityFraction: number | null;
    endpointConsistencyRelativeError: number | null;
  };
  modelWarnings: CfxLiteratureModelWarningV1[];
  userSummary: string;
};

export type CfxLiterature1200sGittProfileResultV1 = {
  profile: typeof CFX_LITERATURE_GITT_1200S_PROFILE_V1;
  materialAssessment: {
    modelApplicability: 'limited';
    interpretationScope: 'comparative_index_only';
    intrinsicDiffusivityClaim: false;
  };
  qref: {
    qrefAh: number | null;
    theoreticalSpecificCapacityMahPerG: number | null;
    source: 'material_theoretical_specific_capacity' | 'unavailable';
  };
  comparabilityGroupingKey: string;
  comparabilityBoundary: string;
  summary: {
    submittedPulseCount: number;
    complete1200sPulseCount: number;
    cutoffEarlyPulseCount: number;
    postProtocolCutoffPulseCount: number;
    postRestTruncatedPulseCount: number;
    otherExcludedPulseCount: number;
    numericallyComputedComparativeIndexCount: number;
    numericallyNotComputableCount: number;
    primaryComparisonIncludedCount: number;
    primaryComparisonIncludedWithWarningsCount: number;
    primaryComparisonExcludedCount: number;
    displayComparisonIncludedCount: number;
    displayComparisonExcludedCount: number;
    comparisonTargetMedianExcludedCount: number;
    /** @deprecated Use comparisonTargetMedianExcludedCount. */
    highRateMedianFloorExcludedCount: number;
    genericSmallPerturbationExceededCount: number;
    medianDAppCandidateCm2PerS: number | null;
    medianAbsolutePulseEndPolarizationV: number | null;
    medianApparentPulsePolarizationQuotientOhm: number | null;
    medianEquivalentSpecificCurrentMahPerG: number | null;
  };
  pulses: CfxLiterature1200sPulseProfileResultV1[];
  headline: string;
  nextSteps: Array<{
    priority: 'required' | 'recommended' | 'information';
    code:
      | 'compare_only_matched_protocols'
      | 'verify_qref_and_active_mass'
      | 'keep_generic_wh_qc_for_general_use'
      | 'inspect_cutoff_early_pulses'
      | 'inspect_post_rest_truncation';
    detail: string;
  }>;
};

function positiveFinite(value: number | null | undefined): value is number {
  return value !== null && value !== undefined && Number.isFinite(value) && value > 0;
}

function finite(value: number | null): value is number {
  return value !== null && Number.isFinite(value);
}

/** Uses the existing pulse-capacity and pulse-duration evidence only. */
export function deriveCfxEquivalentSpecificCurrentMahPerG(
  pulseCapacityFraction: number | null,
  pulseDurationS: number | null,
  theoreticalSpecificCapacityMahPerG: number | null,
): number | null {
  return positiveFinite(theoreticalSpecificCapacityMahPerG) &&
    positiveFinite(pulseDurationS) &&
    finite(pulseCapacityFraction)
    ? Math.abs(pulseCapacityFraction) * theoreticalSpecificCapacityMahPerG * 3600 / pulseDurationS
    : null;
}

export function isCfxHighRateSpecificCurrent(
  specificCurrentMahPerG: number | null,
): boolean {
  return finite(specificCurrentMahPerG) &&
    specificCurrentMahPerG >= CFX_HIGH_RATE_SPECIFIC_CURRENT_THRESHOLD_MA_G;
}

function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
}

function classifyEvent(
  pulseDurationS: number | null,
  pulseEndVoltageV: number | null,
  postRestDurationS: number | null,
  programEvent: NewareGitt1200sEventV1 | null | undefined,
): CfxLiterature1200sPulseProfileResultV1['eventClassification'] {
  if (programEvent?.isPostProtocolCutoff) {
    return 'post_protocol_cutoff';
  }
  if (programEvent?.program?.programRecognized) {
    if (programEvent.termination === 'stop_voltage_terminated') {
      return 'excluded_cutoff_early';
    }
    if (programEvent.termination !== 'time_limit_reached') {
      return 'excluded_not_complete_1200s';
    }
    if (programEvent.postRestState === 'completed_standard_rest') {
      return 'complete_1200s_standard_rest';
    }
    if (
      programEvent.postRestState === 'file_end_truncated' ||
      programEvent.postRestState === 'ended_before_standard_rest' ||
      programEvent.postRestState === 'post_rest_absent'
    ) {
      return 'excluded_post_rest_truncated';
    }
  }
  const completePulse =
    finite(pulseDurationS) &&
    Math.abs(pulseDurationS - CFX_LITERATURE_GITT_1200S_PROFILE_V1.completePulseDurationS) <=
      CFX_LITERATURE_GITT_1200S_PROFILE_V1.completePulseToleranceS;
  if (!completePulse) {
    const cutoffEarly =
      finite(pulseEndVoltageV) &&
      Math.abs(pulseEndVoltageV - CFX_LITERATURE_GITT_1200S_PROFILE_V1.pulseCutoffVoltageV) <=
        CFX_LITERATURE_GITT_1200S_PROFILE_V1.pulseCutoffVoltageToleranceV;
    return cutoffEarly ? 'excluded_cutoff_early' : 'excluded_not_complete_1200s';
  }
  const standardRest =
    finite(postRestDurationS) &&
    Math.abs(postRestDurationS - CFX_LITERATURE_GITT_1200S_PROFILE_V1.standardPostRestDurationS) <=
      CFX_LITERATURE_GITT_1200S_PROFILE_V1.standardPostRestToleranceS;
  if (standardRest) return 'complete_1200s_standard_rest';
  if (
    !finite(postRestDurationS) ||
    postRestDurationS <
      CFX_LITERATURE_GITT_1200S_PROFILE_V1.standardPostRestDurationS -
        CFX_LITERATURE_GITT_1200S_PROFILE_V1.standardPostRestToleranceS
  ) {
    return 'excluded_post_rest_truncated';
  }
  return 'excluded_nonstandard_post_rest';
}

function protocolStatusFor(
  classification: CfxLiterature1200sPulseProfileResultV1['eventClassification'],
): CfxLiterature1200sPulseProfileResultV1['protocolStatus'] {
  if (classification === 'complete_1200s_standard_rest') return 'compatible';
  if (classification === 'post_protocol_cutoff') return 'post_protocol_cutoff';
  if (classification === 'excluded_cutoff_early') return 'excluded_cutoff_early';
  if (classification === 'excluded_post_rest_truncated' || classification === 'excluded_nonstandard_post_rest') {
    return 'insufficient_rest';
  }
  return 'incomplete_pulse';
}

function displayComparisonEligibilityFor(
  protocolDisplayEligible: boolean,
  calculationState: CfxLiterature1200sPulseSourceV1['calculationState'],
  dAppCandidateCm2PerS: number | null,
  medianVoltageV: number | null,
): CfxLiteratureDisplayComparisonEligibilityV1 {
  if (!protocolDisplayEligible) return 'excluded_protocol_event';
  if (
    calculationState !== 'computed' ||
    !positiveFinite(dAppCandidateCm2PerS)
  ) {
    return 'excluded_not_computable';
  }
  if (!finite(medianVoltageV) || medianVoltageV < CFX_COMPARISON_TARGET_MEDIAN_VOLTAGE_V) {
    return 'excluded_comparison_target_median';
  }
  return 'included';
}

function deriveQref(
  material: CfxLiterature1200sGittProfileInputV1['material'],
  activeMassG: number | null,
): CfxLiterature1200sGittProfileResultV1['qref'] {
  const specificCapacity = material.theoreticalSpecificCapacityMahPerG;
  if (!positiveFinite(specificCapacity) || !positiveFinite(activeMassG)) {
    return {
      qrefAh: null,
      theoreticalSpecificCapacityMahPerG: positiveFinite(specificCapacity) ? specificCapacity : null,
      source: 'unavailable',
    };
  }
  return {
    qrefAh: (specificCapacity * activeMassG) / 1000,
    theoreticalSpecificCapacityMahPerG: specificCapacity,
    source: 'material_theoretical_specific_capacity',
  };
}

function comparabilityGroupingKey(
  material: CfxLiterature1200sGittProfileInputV1['material'],
): string {
  const materialName = material.displayName.normalize('NFC').trim() || 'unnamed';
  const specificCapacity = positiveFinite(material.theoreticalSpecificCapacityMahPerG)
    ? material.theoreticalSpecificCapacityMahPerG.toString()
    : 'unknown';
  return [
    CFX_LITERATURE_GITT_1200S_PROFILE_V1.profileId,
    `material=${material.materialFamily}:${materialName}`,
    `specificCapacityMahPerG=${specificCapacity}`,
    `pulseS=${CFX_LITERATURE_GITT_1200S_PROFILE_V1.completePulseDurationS}`,
    `postRestS=${CFX_LITERATURE_GITT_1200S_PROFILE_V1.standardPostRestDurationS}`,
  ].join('|');
}

function smallPerturbationWarning(
  pulseCapacityFraction: number | null,
): CfxLiteratureModelWarningV1 | null {
  if (!finite(pulseCapacityFraction)) return null;
  if (pulseCapacityFraction > CFX_LITERATURE_GITT_1200S_PROFILE_V1.genericWhReviewPerturbationMaximumFraction) {
    return {
      code: 'generic_wh_small_perturbation_not_met',
      message: '该 1200 s 脉冲超过通用 WH 的 3% 小扰动上限；本 profile 仅保留其比较性诊断。',
    };
  }
  if (pulseCapacityFraction > CFX_LITERATURE_GITT_1200S_PROFILE_V1.genericWhValidPerturbationMaximumFraction) {
    return {
      code: 'generic_wh_small_perturbation_review',
      message: '该脉冲处于通用 WH 的 1–3% 小扰动复核区。',
    };
  }
  return null;
}

function appendSourceWarnings(
  warnings: CfxLiteratureModelWarningV1[],
  pulse: CfxLiterature1200sPulseSourceV1,
): void {
  if (pulse.qcStatus === 'rejected') {
    warnings.push({
      code: 'generic_wh_qc_rejected',
      message: '通用 WH QC 已拒绝该脉冲；此处不改变原拒绝结论，只保留数值与极化审计信息。',
    });
  } else if (pulse.qcStatus === 'review') {
    warnings.push({
      code: 'generic_wh_qc_review',
      message: '通用 WH QC 要求复核；比较时应保留该原始状态。',
    });
  }
}

function profilePulse(
  pulse: CfxLiterature1200sPulseSourceV1,
  sourceOrder: number,
  input: CfxLiterature1200sGittProfileInputV1,
  qref: CfxLiterature1200sGittProfileResultV1['qref'],
): CfxLiterature1200sPulseProfileResultV1 {
  const eventClassification = classifyEvent(
    pulse.pulseDurationS,
    pulse.pulseEndVoltageV,
    pulse.postRestDurationS,
    pulse.programEvent,
  );
  const complete = eventClassification === 'complete_1200s_standard_rest';
  const primaryEndpointQcStatus = pulse.primaryEndpointQcStatus ?? 'review';
  const primaryEndpointQcReasons = pulse.primaryEndpointQcReasons ?? [];
  const cfx10SlopeQcStatus = pulse.cfx10SlopeQcStatus ?? 'review';
  const cfx10SlopeQcReasons = pulse.cfx10SlopeQcReasons ?? [];
  const endpointEligibility = pulse.primaryComparisonEligibility ?? 'included_with_warnings';
  const primaryComparisonEligibility: PrimaryComparisonEligibilityV1 =
    !complete || pulse.calculationState !== 'computed' || primaryEndpointQcStatus === 'rejected'
      ? 'excluded'
      : endpointEligibility;
  const durationS = pulse.pulseDurationS;
  const capacityFraction = pulse.pulseCapacityFraction;
  const equivalentSpecificCurrentMahPerG = deriveCfxEquivalentSpecificCurrentMahPerG(
    capacityFraction,
    durationS,
    qref.theoreticalSpecificCapacityMahPerG,
  );
  const completePulseDuration =
    finite(pulse.pulseDurationS) &&
    Math.abs(pulse.pulseDurationS - CFX_LITERATURE_GITT_1200S_PROFILE_V1.completePulseDurationS) <=
      CFX_LITERATURE_GITT_1200S_PROFILE_V1.completePulseToleranceS;
  const protocolDisplayEligible = eventClassification === 'complete_1200s_standard_rest' || (
    eventClassification === 'post_protocol_cutoff' &&
    completePulseDuration &&
    pulse.programEvent?.postRestState === 'completed_standard_rest'
  );
  const auditDAppCandidateCm2PerS =
    pulse.calculationState === 'computed' && positiveFinite(pulse.diagnosticCandidateMetricValueCm2PerS)
      ? pulse.diagnosticCandidateMetricValueCm2PerS
      : null;
  const displayComparisonEligibility = displayComparisonEligibilityFor(
    protocolDisplayEligible,
    pulse.calculationState,
    auditDAppCandidateCm2PerS,
    pulse.medianVoltageV ?? null,
  );
  const warnings: CfxLiteratureModelWarningV1[] = [
    {
      code: 'cfx_conversion_model_limited',
      message: 'CFₓ 转化电极的 WH 结果只可作为同协议的表观比较指标，不代表本征固相扩散系数。',
    },
  ];
  if (input.material.materialFamily !== 'cfx_conversion') {
    warnings.push({
      code: 'source_material_profile_mismatch',
      message: '输入材料并非 CFₓ conversion profile；输出仅用于审计，不能按 CFₓ profile 解释。',
    });
  }
  if (eventClassification === 'post_protocol_cutoff') {
    warnings.push({
      code: 'post_protocol_cutoff',
      message: '该脉冲发生在首次 1.5 V 协议截止之后；协议状态保留用于审计，主图仍按中值电压比较目标判定。',
    });
  } else if (eventClassification === 'excluded_cutoff_early') {
    warnings.push({
      code: 'pulse_voltage_cutoff_early',
      message: '脉冲在约 1.5 V cutoff 前结束；这是协议设定的早停事件，不是 parser 分段错误，且不进入主比较趋势。',
    });
  } else if (eventClassification === 'excluded_not_complete_1200s') {
    warnings.push({
      code: 'incomplete_pulse_without_cutoff',
      message: '该脉冲未达到 1200 s 且未显示 1.5 V cutoff 证据，未纳入主比较序列。',
    });
  } else if (eventClassification === 'excluded_post_rest_truncated') {
    warnings.push({
      code: 'post_rest_truncated',
      message: '1200 s 脉冲后的标准 Rest 被截断，未纳入主比较趋势。',
    });
  } else if (eventClassification === 'excluded_nonstandard_post_rest') {
    warnings.push({
      code: 'nonstandard_post_rest',
      message: '该脉冲虽为 1200 s，但后续 Rest 超出标准 14400 s 窗口，未纳入主比较序列。',
    });
  }
  if (displayComparisonEligibility === 'excluded_comparison_target_median') {
    warnings.push({
      code: 'comparison_target_median_voltage',
      message: '该脉冲中值电压低于 1.5 V 比较目标；保留结果，但不进入主比较图。',
    });
  }
  const perturbationWarning = smallPerturbationWarning(pulse.pulseCapacityFraction);
  if (perturbationWarning) warnings.push(perturbationWarning);
  appendSourceWarnings(warnings, pulse);

  const canCalculateIndex =
    protocolDisplayEligible &&
    finite(pulse.diagnosticCandidateMetricValueCm2PerS) &&
    pulse.diagnosticCandidateMetricValueCm2PerS > 0 &&
    pulse.calculationState === 'computed';
  const numericalState =
    pulse.calculationState === 'computed' &&
    finite(pulse.diagnosticCandidateMetricValueCm2PerS) &&
    pulse.diagnosticCandidateMetricValueCm2PerS > 0
      ? 'computed'
      : 'not_computable';
  const numericalCodes = numericalState === 'computed'
    ? [
        canCalculateIndex
          ? 'wh_comparative_index_numerically_available'
          : 'wh_comparative_index_not_eligible_for_primary_comparison',
      ]
    : [
        complete
          ? 'wh_comparative_index_not_numerically_available'
          : 'wh_comparative_index_excluded_not_standard_1200s_event',
      ];
  const equivalentAverageCurrentA =
    positiveFinite(qref.qrefAh) && positiveFinite(durationS) && finite(capacityFraction)
      ? (Math.abs(capacityFraction) * qref.qrefAh * 3600) / durationS
      : null;
  if (equivalentAverageCurrentA === null) {
    warnings.push({
      code: 'qref_or_active_mass_unavailable',
      message: '缺少材料 Qref、活性质量或脉冲容量占比，无法换算等效电流与极化商。',
    });
  }
  if (finite(pulse.pulseCurrentCv) && pulse.pulseCurrentCv > 0.02) {
    warnings.push({
      code: 'pulse_current_stability_review',
      message: '脉冲电流 CV 超过 2%，等效恒流比较需要额外复核。',
    });
  }
  const absolutePulseEndPolarizationV = finite(pulse.observedDeltaEAtTauV)
    ? Math.abs(pulse.observedDeltaEAtTauV)
    : null;
  const relaxationFractionOfPulsePolarization =
    finite(pulse.deltaEsV) && positiveFinite(absolutePulseEndPolarizationV)
      ? Math.abs(pulse.deltaEsV) / absolutePulseEndPolarizationV
      : null;
  const apparentPulsePolarizationQuotientOhm =
    positiveFinite(absolutePulseEndPolarizationV) && positiveFinite(equivalentAverageCurrentA)
      ? absolutePulseEndPolarizationV / equivalentAverageCurrentA
      : null;

  return {
    sourcePulseId: pulse.pulseId,
    sourceOrder,
    medianVoltageV: pulse.medianVoltageV ?? null,
    eventClassification,
    protocolStatus: protocolStatusFor(eventClassification),
    numericalState,
    numericalCodes,
    comparativeUse: canCalculateIndex ? 'available_with_model_warnings' : 'not_available',
    primaryComparisonEligibility,
    displayComparisonEligibility,
    sourceGenericState: {
      calculationState: pulse.calculationState,
      qcStatus: pulse.qcStatus,
      qcCodes: [...pulse.qcCodes],
      primaryEndpointQcStatus,
      primaryEndpointQcReasons: [...primaryEndpointQcReasons],
      cfx10SlopeQcStatus,
      cfx10SlopeQcReasons: [...cfx10SlopeQcReasons],
    },
    transportComparison: {
      outputId: 'CFX_1200S_WH_APPARENT_COMPARATIVE_INDEX',
      label: 'WH 平面端点手算法结果（CFₓ 1200 s 文献约定）',
      dAppCandidateCm2PerS: canCalculateIndex ? pulse.diagnosticCandidateMetricValueCm2PerS : null,
      intrinsicDiffusivityClaim: false,
    },
    auditDAppCandidateCm2PerS,
    polarization: {
      pulseEndPolarizationV: pulse.observedDeltaEAtTauV,
      absolutePulseEndPolarizationV,
      pulseEndVoltageV: pulse.pulseEndVoltageV,
      restEndPotentialShiftV: pulse.deltaEsV,
      postRestDurationS: pulse.postRestDurationS,
      restRecoveryFractionOfPulsePolarization: relaxationFractionOfPulsePolarization,
      equivalentAverageCurrentA,
      equivalentSpecificCurrentMahPerG,
      apparentPulsePolarizationQuotientOhm,
      pulseCapacityFraction: capacityFraction,
      endpointConsistencyRelativeError: pulse.endpointConsistencyRelativeError,
    },
    modelWarnings: warnings,
    userSummary: canCalculateIndex
      ? eventClassification === 'post_protocol_cutoff'
        ? '该脉冲虽在协议 1.5 V 截止标记之后，但 4 h 静置完成且中值电压仍不低于 1.5 V，按中值电压比较目标保留结果。'
        : '完整 1200 s 脉冲已按端点手算法生成结果；拟合和模型条件作为附加诊断展示。'
      : complete
        ? '完整 1200 s 脉冲缺少端点、静置或物理参数，当前无法完成手算法计算。'
        : '该脉冲未纳入固定 1200 s 的比较序列。',
  };
}

/**
 * Adapts completed literature-style CFₓ 1200 s pulses without changing the
 * endpoint result. Diagnostics remain traceable but do not gate a finite main
 * value. No uncertainty is entered here: quantities come from core evidence.
 */
export function analyzeCfxLiterature1200sGittProfile(
  input: CfxLiterature1200sGittProfileInputV1,
): CfxLiterature1200sGittProfileResultV1 {
  const qref = deriveQref(input.material, input.activeMassG);
  // Source order is user-facing in the workbench, so keep it one-based rather
  // than exposing a JavaScript array index such as pulse #0.
  const pulses = input.pulseResults.map((pulse, index) => profilePulse(pulse, index + 1, input, qref));
  const completePulses = pulses.filter(
    (pulse) => pulse.eventClassification === 'complete_1200s_standard_rest',
  );
  const calculatedPulses = completePulses.filter((pulse) => pulse.numericalState === 'computed');
  const medianComparativeIndexCm2PerS = median(
    calculatedPulses
      .map((pulse) => pulse.transportComparison.dAppCandidateCm2PerS)
      .filter((value): value is number => value !== null),
  );
  const medianAbsolutePulseEndPolarizationV = median(
    completePulses
      .map((pulse) => pulse.polarization.absolutePulseEndPolarizationV)
      .filter((value): value is number => value !== null),
  );
  const medianApparentPulsePolarizationQuotientOhm = median(
    completePulses
      .map((pulse) => pulse.polarization.apparentPulsePolarizationQuotientOhm)
      .filter((value): value is number => value !== null),
  );
  const medianEquivalentSpecificCurrentMahPerG = median(
    completePulses
      .map((pulse) => pulse.polarization.equivalentSpecificCurrentMahPerG)
      .filter((value): value is number => value !== null),
  );
  const genericSmallPerturbationExceededCount = completePulses.filter((pulse) =>
    pulse.modelWarnings.some((warning) => warning.code === 'generic_wh_small_perturbation_not_met'),
  ).length;
  const summary: CfxLiterature1200sGittProfileResultV1['summary'] = {
    submittedPulseCount: pulses.length,
    complete1200sPulseCount: completePulses.length,
    cutoffEarlyPulseCount: pulses.filter(
      (pulse) => pulse.eventClassification === 'excluded_cutoff_early',
    ).length,
    postProtocolCutoffPulseCount: pulses.filter(
      (pulse) => pulse.eventClassification === 'post_protocol_cutoff',
    ).length,
    postRestTruncatedPulseCount: pulses.filter(
      (pulse) => pulse.eventClassification === 'excluded_post_rest_truncated',
    ).length,
    otherExcludedPulseCount: pulses.filter(
      (pulse) =>
        pulse.eventClassification === 'excluded_not_complete_1200s' ||
        pulse.eventClassification === 'excluded_nonstandard_post_rest',
    ).length,
    numericallyComputedComparativeIndexCount: calculatedPulses.length,
    numericallyNotComputableCount: completePulses.length - calculatedPulses.length,
    primaryComparisonIncludedCount: pulses.filter(
      (pulse) => pulse.primaryComparisonEligibility === 'included',
    ).length,
    primaryComparisonIncludedWithWarningsCount: pulses.filter(
      (pulse) => pulse.primaryComparisonEligibility === 'included_with_warnings',
    ).length,
    primaryComparisonExcludedCount: pulses.filter(
      (pulse) => pulse.primaryComparisonEligibility === 'excluded',
    ).length,
    displayComparisonIncludedCount: pulses.filter(
      (pulse) => pulse.displayComparisonEligibility === 'included',
    ).length,
    displayComparisonExcludedCount: pulses.filter(
      (pulse) => pulse.displayComparisonEligibility !== 'included',
    ).length,
    comparisonTargetMedianExcludedCount: pulses.filter(
      (pulse) => pulse.displayComparisonEligibility === 'excluded_comparison_target_median',
    ).length,
    highRateMedianFloorExcludedCount: pulses.filter(
      (pulse) => pulse.displayComparisonEligibility === 'excluded_comparison_target_median',
    ).length,
    genericSmallPerturbationExceededCount,
    medianDAppCandidateCm2PerS: medianComparativeIndexCm2PerS,
    medianAbsolutePulseEndPolarizationV,
    medianApparentPulsePolarizationQuotientOhm,
    medianEquivalentSpecificCurrentMahPerG,
  };
  const nextSteps: CfxLiterature1200sGittProfileResultV1['nextSteps'] = [
    {
      priority: 'information',
      code: 'compare_only_matched_protocols',
      detail: '仅比较相同材料、质量口径、几何、1200 s 时长、等效比电流和静置协议的数据。',
    },
    {
      priority: 'information',
      code: 'keep_generic_wh_qc_for_general_use',
      detail: '通用 WH 路径及其小扰动 QC 保持不变；本 profile 不会把 generic rejected 改成 valid。',
    },
  ];
  if (qref.qrefAh === null) {
    nextSteps.unshift({
      priority: 'required',
      code: 'verify_qref_and_active_mass',
      detail: '补齐导入记录中的活性质量和材料理论比容量，以得到等效电流及极化商。',
    });
  }
  if (summary.cutoffEarlyPulseCount > 0) {
    nextSteps.push({
      priority: 'recommended',
      code: 'inspect_cutoff_early_pulses',
      detail: '1.5 V cutoff 早停脉冲是有效协议事件，但不与完整 1200 s 脉冲混入同一比较趋势。',
    });
  }
  if (summary.postRestTruncatedPulseCount > 0) {
    nextSteps.push({
      priority: 'recommended',
      code: 'inspect_post_rest_truncation',
      detail: '标准 Rest 截断脉冲保留审计，但不能用于完整 1200 s + 标准 Rest 的主趋势。',
    });
  }
  const headline =
    summary.complete1200sPulseCount === 0
      ? '未找到完整 1200 s 脉冲；未生成 CFₓ固定时长比较序列。'
      : `${summary.complete1200sPulseCount} 个完整 1200 s 脉冲中，${summary.numericallyComputedComparativeIndexCount} 个已按端点手算法完成计算。`;

  return {
    profile: CFX_LITERATURE_GITT_1200S_PROFILE_V1,
    materialAssessment: {
      modelApplicability: 'limited',
      interpretationScope: 'comparative_index_only',
      intrinsicDiffusivityClaim: false,
    },
    qref,
    comparabilityGroupingKey: comparabilityGroupingKey(input.material),
    comparabilityBoundary:
      '同一 grouping key 仅说明固定 CFₓ 1200 s + 标准 Rest 文献协议一致；仍须核对材料批次、几何、活性质量和其他配置。',
    summary,
    pulses,
    headline,
    nextSteps,
  };
}
