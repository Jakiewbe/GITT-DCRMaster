import type { GittResultV1, MaterialPresetV1 } from '../../science/contracts';

export const CFX_GITT_PERTURBATION_TARGETS_V1 = {
  validMaximumFraction: 0.01,
  reviewMaximumFraction: 0.03,
} as const;

export type CfxGittPulseSourceV1 = Pick<
  GittResultV1,
  | 'pulseId'
  | 'pulseDurationS'
  | 'pulseCapacityFraction'
  | 'calculationState'
  | 'qcStatus'
  | 'qcCodes'
  | 'modelApplicability'
  | 'interpretationScope'
  | 'metricKind'
>;

export type CfxGittProtocolPlanV1 = {
  pulseCurrentA?: number | null;
  pulseDurationS?: number | null;
};

export type CfxGittProtocolDiagnosticInputV1 = {
  material: Pick<
    MaterialPresetV1,
    'materialFamily' | 'displayName' | 'theoreticalSpecificCapacityMahPerG'
  >;
  activeMassG: number | null;
  pulseResults: readonly CfxGittPulseSourceV1[];
  plannedPulse?: CfxGittProtocolPlanV1;
};

export type CfxGittPerturbationBandV1 =
  | 'within_valid_target'
  | 'within_review_target'
  | 'exceeds_review_target'
  | 'not_assessable';

export type CfxGittPulseDiagnosticV1 = {
  pulseId: string;
  pulseDurationS: number | null;
  pulseCapacityFraction: number | null;
  perturbationBand: CfxGittPerturbationBandV1;
  smallPerturbationFailure: boolean;
  sourceRejectedForSmallPerturbation: boolean;
  userMessage: string;
};

export type CfxGittTargetRecommendationV1 = {
  target: 'valid' | 'review';
  maximumPulseCapacityFraction: number;
  maximumPulseDurationS: number | null;
  maximumCurrentA: number | null;
  maximumSpecificCurrentMahPerG: number | null;
};

export type CfxGittNextStepV1 = {
  priority: 'required' | 'recommended' | 'information';
  code:
    | 'reduce_pulse_perturbation'
    | 'verify_qref_or_active_mass'
    | 'review_borderline_perturbation'
    | 'retain_cfx_interpretation_boundary'
    | 'select_cfx_material_profile';
  title: string;
  detail: string;
};

export type CfxGittProtocolDiagnosticV1 = {
  productKind: 'cfx_gitt_protocol_diagnostic';
  materialState: 'cfx_profile' | 'material_profile_mismatch';
  transportMetricPresentation: {
    displayName: 'WH 平面模型表观传输比较指标';
    numericTransportMetricVisibility: 'not_presented';
    interpretationBoundary: 'comparative_index_only';
  };
  qref: {
    valueAh: number | null;
    specificCapacityMahPerG: number | null;
    source: 'material_theoretical_specific_capacity' | 'unavailable';
  };
  pulseSummary: {
    total: number;
    withinValidTarget: number;
    withinReviewTarget: number;
    smallPerturbationFailures: number;
    notAssessable: number;
  };
  protocol: {
    representativeCurrentA: number | null;
    representativeCurrentSource: 'planned_input' | 'inferred_from_pulse_capacity' | 'unavailable';
    representativeSpecificCurrentMahPerG: number | null;
    representativeDurationS: number | null;
    representativeDurationSource: 'planned_input' | 'inferred_from_pulses' | 'unavailable';
  };
  recommendations: CfxGittTargetRecommendationV1[];
  pulses: CfxGittPulseDiagnosticV1[];
  headline: string;
  nextSteps: CfxGittNextStepV1[];
};

function positiveFinite(value: number | null | undefined): value is number {
  return value !== null && value !== undefined && Number.isFinite(value) && value > 0;
}

function finiteNonzero(value: number | null | undefined): value is number {
  return value !== null && value !== undefined && Number.isFinite(value) && value !== 0;
}

function finiteNonnegative(value: number | null): value is number {
  return value !== null && Number.isFinite(value) && value >= 0;
}

function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
}

function formatPercent(fraction: number): string {
  const percent = fraction * 100;
  return `${percent < 0.1 ? percent.toFixed(3) : percent.toFixed(2)}%`;
}

function perturbationBand(fraction: number | null): CfxGittPerturbationBandV1 {
  if (!finiteNonnegative(fraction)) return 'not_assessable';
  if (fraction <= CFX_GITT_PERTURBATION_TARGETS_V1.validMaximumFraction) {
    return 'within_valid_target';
  }
  if (fraction <= CFX_GITT_PERTURBATION_TARGETS_V1.reviewMaximumFraction) {
    return 'within_review_target';
  }
  return 'exceeds_review_target';
}

function pulseMessage(band: CfxGittPerturbationBandV1, fraction: number | null): string {
  if (band === 'within_valid_target' && fraction !== null) {
    return `脉冲占 Qref ${formatPercent(fraction)}，处于 ≤1% 小扰动目标内；CFₓ仍只允许同条件比较。`;
  }
  if (band === 'within_review_target' && fraction !== null) {
    return `脉冲占 Qref ${formatPercent(fraction)}，处于 1–3% 复核区；建议降低脉冲时长或电流。`;
  }
  if (band === 'exceeds_review_target' && fraction !== null) {
    return `脉冲占 Qref ${formatPercent(fraction)}，超过 3% 上限；不将该脉冲的 WH 指标作为有效传输结果呈现。`;
  }
  return '缺少可用的脉冲容量占比，无法判断小扰动条件；请核对 Qref、质量或原始脉冲记录。';
}

function deriveQref(
  material: CfxGittProtocolDiagnosticInputV1['material'],
  activeMassG: number | null,
): CfxGittProtocolDiagnosticV1['qref'] {
  const specificCapacityMahPerG = material.theoreticalSpecificCapacityMahPerG;
  if (!positiveFinite(specificCapacityMahPerG) || !positiveFinite(activeMassG)) {
    return {
      valueAh: null,
      specificCapacityMahPerG: positiveFinite(specificCapacityMahPerG) ? specificCapacityMahPerG : null,
      source: 'unavailable',
    };
  }
  return {
    valueAh: (activeMassG * specificCapacityMahPerG) / 1000,
    specificCapacityMahPerG,
    source: 'material_theoretical_specific_capacity',
  };
}

function inferredCurrentA(pulse: CfxGittPulseSourceV1, qrefAh: number | null): number | null {
  if (!positiveFinite(qrefAh) || !positiveFinite(pulse.pulseDurationS) || !finiteNonnegative(pulse.pulseCapacityFraction)) {
    return null;
  }
  return (pulse.pulseCapacityFraction * qrefAh * 3600) / pulse.pulseDurationS;
}

function targetRecommendation(
  target: CfxGittTargetRecommendationV1['target'],
  fraction: number,
  qrefAh: number | null,
  specificCapacityMahPerG: number | null,
  currentA: number | null,
  durationS: number | null,
): CfxGittTargetRecommendationV1 {
  return {
    target,
    maximumPulseCapacityFraction: fraction,
    maximumPulseDurationS:
      positiveFinite(qrefAh) && positiveFinite(currentA) ? (fraction * qrefAh * 3600) / currentA : null,
    maximumCurrentA:
      positiveFinite(qrefAh) && positiveFinite(durationS) ? (fraction * qrefAh * 3600) / durationS : null,
    maximumSpecificCurrentMahPerG:
      positiveFinite(specificCapacityMahPerG) && positiveFinite(durationS)
        ? (fraction * specificCapacityMahPerG * 3600) / durationS
        : null,
  };
}

function recommendationDetail(recommendations: readonly CfxGittTargetRecommendationV1[]): string {
  const valid = recommendations.find((recommendation) => recommendation.target === 'valid');
  if (!valid) return '请使用 ≤1% 的单脉冲容量作为下一轮协议目标。';
  const duration = valid.maximumPulseDurationS;
  const current = valid.maximumSpecificCurrentMahPerG;
  if (duration !== null && current !== null) {
    return `按当前代表性电流，≤1% 对应脉冲不超过 ${duration.toFixed(1)} s；按当前最长脉冲时长，建议不超过 ${current.toFixed(2)} mA/g。`;
  }
  if (duration !== null) return `按当前代表性电流，≤1% 对应脉冲不超过 ${duration.toFixed(1)} s。`;
  if (current !== null) return `按当前最长脉冲时长，≤1% 对应比电流不超过 ${current.toFixed(2)} mA/g。`;
  return '请提供活性物质质量、理论比容量和脉冲电流/时长，以反推 ≤1% 的协议。';
}

/**
 * Product-facing CFₓ protocol diagnostic. It intentionally never returns a
 * numeric transport coefficient: a CFₓ WH outcome remains model-limited, and
 * a pulse above the perturbation target is only a protocol failure signal.
 */
export function diagnoseCfxGittProtocol(
  input: CfxGittProtocolDiagnosticInputV1,
): CfxGittProtocolDiagnosticV1 {
  const qref = deriveQref(input.material, input.activeMassG);
  const pulses = input.pulseResults.map<CfxGittPulseDiagnosticV1>((pulse) => {
    const band = perturbationBand(pulse.pulseCapacityFraction);
    const sourceRejectedForSmallPerturbation =
      band === 'exceeds_review_target' && pulse.qcCodes.includes('pulse_capacity_fraction');
    return {
      pulseId: pulse.pulseId,
      pulseDurationS: pulse.pulseDurationS,
      pulseCapacityFraction: pulse.pulseCapacityFraction,
      perturbationBand: band,
      smallPerturbationFailure: band === 'exceeds_review_target',
      sourceRejectedForSmallPerturbation,
      userMessage: pulseMessage(band, pulse.pulseCapacityFraction),
    };
  });

  const inferredCurrents = input.pulseResults
    .map((pulse) => inferredCurrentA(pulse, qref.valueAh))
    .filter((value): value is number => value !== null);
  const plannedCurrentA = input.plannedPulse?.pulseCurrentA;
  const representativeCurrentA = finiteNonzero(plannedCurrentA)
    ? Math.abs(plannedCurrentA)
    : median(inferredCurrents);
  const representativeCurrentSource = finiteNonzero(plannedCurrentA)
    ? 'planned_input'
    : representativeCurrentA === null
      ? 'unavailable'
      : 'inferred_from_pulse_capacity';
  const plannedDurationS = input.plannedPulse?.pulseDurationS;
  // Design a stepped program against its longest actual pulse. A median can
  // be dominated by deliberately shortened late-stage pulses and would then
  // still allow the original full-duration pulse to exceed the target.
  const observedDurations = input.pulseResults
    .map((pulse) => pulse.pulseDurationS)
    .filter(positiveFinite);
  const representativeDurationS = positiveFinite(plannedDurationS)
    ? plannedDurationS
    : observedDurations.length > 0
      ? Math.max(...observedDurations)
      : null;
  const representativeDurationSource = positiveFinite(plannedDurationS)
    ? 'planned_input'
    : representativeDurationS === null
      ? 'unavailable'
      : 'inferred_from_pulses';
  const representativeSpecificCurrentMahPerG =
    positiveFinite(representativeCurrentA) && positiveFinite(input.activeMassG)
      ? (representativeCurrentA * 1000) / input.activeMassG
      : null;
  const recommendations = [
    targetRecommendation(
      'valid',
      CFX_GITT_PERTURBATION_TARGETS_V1.validMaximumFraction,
      qref.valueAh,
      qref.specificCapacityMahPerG,
      representativeCurrentA,
      representativeDurationS,
    ),
    targetRecommendation(
      'review',
      CFX_GITT_PERTURBATION_TARGETS_V1.reviewMaximumFraction,
      qref.valueAh,
      qref.specificCapacityMahPerG,
      representativeCurrentA,
      representativeDurationS,
    ),
  ];
  const pulseSummary = {
    total: pulses.length,
    withinValidTarget: pulses.filter((pulse) => pulse.perturbationBand === 'within_valid_target').length,
    withinReviewTarget: pulses.filter((pulse) => pulse.perturbationBand === 'within_review_target').length,
    smallPerturbationFailures: pulses.filter((pulse) => pulse.smallPerturbationFailure).length,
    notAssessable: pulses.filter((pulse) => pulse.perturbationBand === 'not_assessable').length,
  };
  const nextSteps: CfxGittNextStepV1[] = [];
  if (input.material.materialFamily !== 'cfx_conversion') {
    nextSteps.push({
      priority: 'required',
      code: 'select_cfx_material_profile',
      title: '选择 CFₓ 材料 profile',
      detail: '该产品层只针对转化型 CFₓ 的模型受限 GITT 协议诊断。',
    });
  }
  if (qref.valueAh === null) {
    nextSteps.push({
      priority: 'required',
      code: 'verify_qref_or_active_mass',
      title: '补齐 Qref 依据',
      detail: '需要活性物质质量和材料理论比容量，才能给出绝对电流与脉冲时长建议。',
    });
  }
  if (pulseSummary.smallPerturbationFailures > 0) {
    nextSteps.push({
      priority: 'required',
      code: 'reduce_pulse_perturbation',
      title: '降低单脉冲扰动',
      detail: recommendationDetail(recommendations),
    });
  } else if (pulseSummary.withinReviewTarget > 0 || pulseSummary.notAssessable > 0) {
    nextSteps.push({
      priority: 'recommended',
      code: 'review_borderline_perturbation',
      title: '将协议收紧到 ≤1%',
      detail: recommendationDetail(recommendations),
    });
  }
  nextSteps.push({
    priority: 'information',
    code: 'retain_cfx_interpretation_boundary',
    title: '保持 CFₓ解释边界',
    detail: 'WH 平面模型输出仅可在相同材料、几何、参数与协议下作比较，不能表述为本征固相扩散系数。',
  });

  const headline =
    pulseSummary.total === 0
      ? '尚无可诊断的 GITT 脉冲；导入数据后将根据 Qref 生成协议建议。'
      : pulseSummary.smallPerturbationFailures > 0
      ? `${pulseSummary.smallPerturbationFailures}/${pulseSummary.total} 个脉冲超过 3% 小扰动上限；先优化协议，再比较 CFₓ WH 指标。`
      : pulseSummary.withinReviewTarget > 0 || pulseSummary.notAssessable > 0
        ? '协议存在需要复核的脉冲；建议收紧到 ≤1% 小扰动目标。'
        : '全部可评价脉冲处于 ≤1% 小扰动目标内；CFₓ结果仍只用于同条件比较。';

  return {
    productKind: 'cfx_gitt_protocol_diagnostic',
    materialState: input.material.materialFamily === 'cfx_conversion' ? 'cfx_profile' : 'material_profile_mismatch',
    transportMetricPresentation: {
      displayName: 'WH 平面模型表观传输比较指标',
      numericTransportMetricVisibility: 'not_presented',
      interpretationBoundary: 'comparative_index_only',
    },
    qref,
    pulseSummary,
    protocol: {
      representativeCurrentA,
      representativeCurrentSource,
      representativeSpecificCurrentMahPerG,
      representativeDurationS,
      representativeDurationSource,
    },
    recommendations,
    pulses,
    headline,
    nextSteps,
  };
}
