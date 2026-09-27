import type {
  QcFinding,
  QcReasonDomainV1,
  QcReasonSeverityV1,
  QcReasonV1,
  QcStatus,
  ScientificResultStateV1,
} from './contracts';

const STATUS_RANK: Record<QcStatus, number> = {
  valid: 0,
  review: 1,
  rejected: 2,
};

const DOMAIN_BY_CODE: Record<string, QcReasonDomainV1> = {
  qc_policy_id_mismatch: 'data',
  pulse_absent: 'data',
  pulse_multiple_analysis_steps: 'data',
  pulse_time_axis_invalid: 'data',
  pulse_duration_invalid: 'data',
  pulse_current_zero_or_unavailable: 'data',
  ENDPOINT_LOADED_T0_MISSING: 'data',
  ENDPOINT_T0_NOT_LOADED: 'data',
  ENDPOINT_T0_DIRECTION_CONFLICT: 'data',
  pulse_capacity_qref_unavailable: 'material_input',
  pulse_capacity_integration_unavailable: 'data',
  delta_es_delta_et_direction_mismatch: 'data',
  delta_es_slope_direction_mismatch: 'endpoint_model',
  pulse_endpoint_slope_direction_mismatch: 'cfx10_slope',
  pulse_current_slope_direction_mismatch: 'cfx10_slope',
  endpoint_consistency_relative_error: 'endpoint_model',
  pulse_capacity_fraction: 'endpoint_model',
  equilibrium_voltage_step: 'endpoint_model',
  dimensionless_pulse_time: 'endpoint_model',
  dimensionless_fit_time: 'endpoint_model',
  fit_end_fraction_of_pulse: 'endpoint_model',
  fixed_fit_no_window_passed_hard_gates: 'cfx10_slope',
  fixed_fit_sampling_infeasible: 'cfx10_slope',
  fixed_fit_regression_unavailable: 'cfx10_slope',
  fit_window_insufficient_unique_ticks: 'cfx10_slope',
  manual_fit_window_failed_hard_gates: 'cfx10_slope',
  fit_unique_tick_count: 'cfx10_slope',
  fit_r_squared: 'cfx10_slope',
  fit_slope_signal_ratio: 'cfx10_slope',
  fit_curvature_metric: 'cfx10_slope',
  fit_normalized_max_residual: 'cfx10_slope',
  fit_durbin_watson: 'cfx10_slope',
  fit_monotonicity_fraction: 'cfx10_slope',
  fit_window_sensitivity_fraction: 'cfx10_slope',
  cfx10_sampling_coverage: 'sampling',
  cfx10_linearity: 'cfx10_slope',
  wh_metric_not_computable: 'data',
  wh_metric_zero: 'data',
};

const MESSAGE_BY_CODE: Record<string, string> = {
  ENDPOINT_LOADED_T0_MISSING: '当前 pulse 没有可确认的 loaded t=0 记录，Endpoint 主结果不可计算；不回退到 first-positive 点。',
  ENDPOINT_T0_NOT_LOADED: '当前 pulse 的 t=0 记录没有超过已有 current resolution 的非零加载电流，Endpoint 主结果不可计算。',
  ENDPOINT_T0_DIRECTION_CONFLICT: '当前 pulse 的 t=0 电流方向与 pulse 方向不一致，Endpoint 主结果不可计算。',
  endpoint_consistency_relative_error: 'Endpoint 与早期 E–√t 斜率外推不一致；这是模型/方法差异诊断，不改变 Endpoint 主值。',
  pulse_capacity_fraction: '脉冲容量占 Qref 的比例超出通用 WH 小扰动范围；CFx 转化电极中作为模型适用性警告。',
  equilibrium_voltage_step: '脉冲前后静置末端电压变化较大；记录为平衡假设警告，不按绝对幅值否定 Endpoint。',
  dimensionless_pulse_time: 'Dτ/L² 超出理想 WH 时间尺度范围；这是模型适用性诊断。',
  dimensionless_fit_time: 'Dt_fit/L² 超出理想 WH 时间尺度范围；这是回归窗口适用性诊断。',
  fit_end_fraction_of_pulse: '回归窗口相对完整脉冲的末端比例需要复核；CFx10s 不把回归末端当作脉冲时长。',
  fixed_fit_no_window_passed_hard_gates: 'Legacy 前五点未通过辅助回归门槛；该结果只作稳健性参考。',
  fit_unique_tick_count: '辅助回归使用的唯一时间点数。',
  fit_r_squared: '辅助 E–√t 回归的 R²；低 R² 表示早期响应非线性或斜率不稳定。',
  fit_slope_signal_ratio: '辅助回归斜率相对标准误的信号比。',
  fit_curvature_metric: '辅助回归曲率指标；只描述早期响应偏离直线的程度。',
  fit_normalized_max_residual: '辅助回归最大归一化残差。',
  fit_window_sensitivity_fraction: '不同辅助回归窗口得到的斜率敏感性。',
  delta_es_slope_direction_mismatch: '静置末端变化与辅助斜率方向不一致；只影响斜率诊断。',
  pulse_endpoint_slope_direction_mismatch: '脉冲末端变化与辅助斜率方向不一致；只影响斜率诊断。',
  pulse_current_slope_direction_mismatch: '脉冲电流方向与辅助斜率方向不一致；需要检查该辅助拟合。',
  delta_es_delta_et_direction_mismatch: 'ΔEs 与 ΔEt 的符号不一致，Endpoint 比值的物理方向无法解释。',
};

function severityFromStatus(status: QcStatus): QcReasonSeverityV1 {
  if (status === 'rejected') return 'reject';
  if (status === 'review') return 'review';
  return 'info';
}

function domainForCode(code: string): QcReasonDomainV1 {
  if (DOMAIN_BY_CODE[code]) return DOMAIN_BY_CODE[code];
  if (code.includes('non_finite') || code.includes('invalid_time_resolution')) return 'data';
  if (code.startsWith('pre_rest_') || code.startsWith('post_rest_')) return 'endpoint_model';
  if (code.startsWith('density_') || code.includes('uncertainty')) return 'material_input';
  if (code.startsWith('fit_') || code.startsWith('fixed_fit_') || code.startsWith('manual_fit_')) return 'cfx10_slope';
  return 'data';
}

export function qcReasonFromFinding(finding: QcFinding): QcReasonV1 {
  return {
    code: finding.code,
    severity: finding.severity ?? severityFromStatus(finding.status),
    domain: finding.domain ?? domainForCode(finding.code),
    value: finding.value ?? finding.metric ?? null,
    threshold: finding.threshold ?? null,
    sourceRule: finding.sourceRule ?? finding.code,
    message: finding.message ?? MESSAGE_BY_CODE[finding.code] ?? `QC 规则 ${finding.code} 的诊断结果。`,
  };
}

export function worstQcStatus(findings: QcFinding[]): QcStatus {
  return findings.reduce<QcStatus>(
    (worst, finding) => (STATUS_RANK[finding.status] > STATUS_RANK[worst] ? finding.status : worst),
    'valid',
  );
}

export function resultStateFromFindings(
  findings: QcFinding[],
  calculationState: ScientificResultStateV1['calculationState'] = 'computed',
): ScientificResultStateV1 {
  if (calculationState === 'not_requested') {
    return { calculationState, qcStatus: null, qcCodes: findings.map((finding) => finding.code) };
  }

  if (calculationState === 'not_computable' && findings.every((finding) => finding.status !== 'rejected')) {
    return { calculationState, qcStatus: null, qcCodes: findings.map((finding) => finding.code) };
  }

  return {
    calculationState,
    qcStatus: worstQcStatus(findings),
    qcCodes: findings.filter((finding) => finding.status !== 'valid').map((finding) => finding.code),
  };
}

export function qcFinding(
  code: string,
  status: QcStatus,
  metric: number | null = null,
  message?: string,
  metadata: Partial<Pick<QcFinding, 'severity' | 'domain' | 'value' | 'threshold' | 'sourceRule'>> = {},
): QcFinding {
  return { code, status, metric, message, ...metadata };
}

