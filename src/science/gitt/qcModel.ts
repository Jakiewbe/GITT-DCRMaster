import type {
  CalculationState,
  GittRegressionWindowResultV1,
  QcFinding,
  QcReasonV1,
  QcStatus,
  PrimaryComparisonEligibilityV1,
} from '../contracts';
import { qcReasonFromFinding } from '../qc';
import { GITT_QC_POLICY_V1 as POLICY } from './policy';

export type PrimaryComparisonEligibility = PrimaryComparisonEligibilityV1;

const PRIMARY_HARD_REJECTION_CODES = new Set([
  'qc_policy_id_mismatch',
  'pulse_absent',
  'pulse_multiple_analysis_steps',
  'pulse_time_axis_invalid',
  'pulse_duration_invalid',
  'pulse_current_zero_or_unavailable',
  'ENDPOINT_LOADED_T0_MISSING',
  'ENDPOINT_T0_NOT_LOADED',
  'ENDPOINT_T0_DIRECTION_CONFLICT',
  'pulse_capacity_qref_unavailable',
  'pulse_capacity_integration_unavailable',
  'delta_es_delta_et_direction_mismatch',
  'wh_metric_not_computable',
  'wh_metric_zero',
  'pre_rest_absent',
  'post_rest_absent',
  'pre_rest_multiple_analysis_steps',
  'post_rest_multiple_analysis_steps',
  'pre_rest_theil_sen_unavailable',
  'post_rest_theil_sen_unavailable',
  'pre_rest_theil_sen_singular',
  'post_rest_theil_sen_singular',
]);

function hardPrimaryRejection(finding: QcFinding): boolean {
  return (
    PRIMARY_HARD_REJECTION_CODES.has(finding.code) ||
    finding.code.endsWith('_non_finite_measurement') ||
    finding.code.endsWith('_invalid_time_resolution') ||
    finding.domain === 'data' && finding.status === 'rejected'
  );
}

function withSeverity(reason: QcReasonV1, severity: QcReasonV1['severity']): QcReasonV1 {
  return severity === reason.severity ? reason : { ...reason, severity };
}

function primaryReasonForFinding(finding: QcFinding): QcReasonV1 {
  const reason = qcReasonFromFinding(finding);
  if (hardPrimaryRejection(finding)) return withSeverity(reason, 'reject');
  if (reason.severity === 'reject') return withSeverity(reason, 'review');
  return reason;
}

function statusFromReasons(reasons: readonly QcReasonV1[]): QcStatus {
  if (reasons.some((reason) => reason.severity === 'reject')) return 'rejected';
  if (reasons.some((reason) => reason.severity === 'review')) return 'review';
  return 'valid';
}

function eligibilityFromStatus(status: QcStatus): PrimaryComparisonEligibilityV1 {
  if (status === 'rejected') return 'excluded';
  if (status === 'review') return 'included_with_warnings';
  return 'included';
}

function syntheticReason(
  code: string,
  severity: QcReasonV1['severity'],
  domain: QcReasonV1['domain'],
  message: string,
  value: number | null = null,
  threshold: number | null = null,
): QcReasonV1 {
  return { code, severity, domain, value, threshold, sourceRule: code, message };
}

export function assessPrimaryEndpointQuality(
  findings: readonly QcFinding[],
  calculationState: CalculationState,
): {
  status: QcStatus;
  reasons: QcReasonV1[];
  eligibility: PrimaryComparisonEligibilityV1;
} {
  const reasons = findings
    .filter((finding) => finding.domain !== 'cfx10_slope')
    .map(primaryReasonForFinding);
  if (calculationState !== 'computed') {
    reasons.push(
      syntheticReason(
        'PRIMARY_ENDPOINT_NOT_COMPUTABLE',
        'reject',
        'data',
        'Endpoint 没有形成有限计算值，不能进入主比较。',
      ),
    );
  }
  const status = statusFromReasons(reasons);
  return { status, reasons, eligibility: eligibilityFromStatus(status) };
}

function cfx10ReasonForWindow(
  window: GittRegressionWindowResultV1 | null,
  windowStabilityDecades: number | null,
  absMethodDivergenceDecades: number | null,
): QcReasonV1[] {
  if (window === null || window.status === 'infeasible' || window.uniqueTimePointCount < 5) {
    return [
      syntheticReason(
        'CFX10_INSUFFICIENT_POINTS',
        'review',
        'sampling',
        'CFx10s 固定窗口少于 5 个唯一时间点，辅助斜率不可计算。',
        window?.uniqueTimePointCount ?? 0,
        5,
      ),
    ];
  }
  const reasons: QcReasonV1[] = [];
  if (window.windowCoverageIncomplete || window.samplingCoverage === 'partial') {
    reasons.push(
      syntheticReason(
        'CFX10_PARTIAL_COVERAGE',
        'review',
        'sampling',
        'CFx10s 请求窗口没有被当前采样完整覆盖，斜率只作复核。',
        window.actualEndS,
        window.requestedEndS,
      ),
    );
  }
  if (window.linearityClass === 'early_response_nonlinear' || (window.rSquared !== null && window.rSquared < 0.98)) {
    reasons.push(
      syntheticReason(
        'CFX10_EARLY_RESPONSE_NONLINEAR',
        'review',
        'cfx10_slope',
        'CFx10s 早期 E–√t 响应偏离线性，保留斜率但标记为复核。',
        window.rSquared,
        0.98,
      ),
    );
  }
  if (
    windowStabilityDecades !== null &&
    windowStabilityDecades > POLICY.cfx10s.windowStabilityReviewMaximumDecades
  ) {
    reasons.push(
      syntheticReason(
        'CFX10_HIGH_WINDOW_SENSITIVITY',
        'review',
        'cfx10_slope',
        'CFx10s 与 Legacy 前五点的窗口稳定性差异较大，斜率只作复核。',
        windowStabilityDecades,
        POLICY.cfx10s.windowStabilityReviewMaximumDecades,
      ),
    );
  }
  if (
    absMethodDivergenceDecades !== null &&
    absMethodDivergenceDecades > POLICY.cfx10s.methodDivergenceReviewMaximumDecades
  ) {
    reasons.push(
      syntheticReason(
        'CFX10_ENDPOINT_SLOPE_DIVERGENCE',
        'review',
        'cfx10_slope',
        'CFx10s 斜率结果与冻结 Endpoint 的数量级差异较大；两者不得互相替代。',
        absMethodDivergenceDecades,
        POLICY.cfx10s.methodDivergenceReviewMaximumDecades,
      ),
    );
  }
  return reasons;
}

export function assessCfx10sQuality(
  window: GittRegressionWindowResultV1 | null,
  findings: readonly QcFinding[],
  windowStabilityDecades: number | null = null,
  absMethodDivergenceDecades: number | null = null,
): {
  status: GittRegressionWindowResultV1['status'];
  reasons: QcReasonV1[];
} {
  const reasons = cfx10ReasonForWindow(window, windowStabilityDecades, absMethodDivergenceDecades);
  if (window !== null) {
    for (const finding of findings) {
      const reason = qcReasonFromFinding(finding);
      if (reason.domain !== 'cfx10_slope' && reason.domain !== 'sampling') continue;
      if (!reasons.some((existing) => existing.code === reason.code)) {
        reasons.push(withSeverity(reason, reason.severity === 'reject' ? 'review' : reason.severity));
      }
    }
    if (window.status === 'review' && reasons.length === 0) {
      reasons.push(
        syntheticReason(
          'CFX10_WINDOW_REVIEW',
          'review',
          'cfx10_slope',
          'CFx10s 已形成斜率，但窗口质量需要复核。',
        ),
      );
    }
  }
  const status = window === null || window.status === 'infeasible' || window.uniqueTimePointCount < 5
    ? 'infeasible'
    : reasons.length > 0 || window.status === 'review'
      ? 'review'
      : 'valid';
  return { status, reasons };
}
