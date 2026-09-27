import { memo } from 'react';
import { AlertCircle, CheckCircle2, CircleSlash2, Clock3 } from 'lucide-react';
import type { CalculationState, QcStatus } from '../../science/contracts';

type StatusBadgeProps = {
  kind: 'calculation' | 'qc' | 'applicability' | 'approval';
  value:
    | CalculationState
    | QcStatus
    | 'supported'
    | 'limited'
    | 'unsupported'
    | 'provisional'
    | 'independent-qualified'
    | 'not-qualified'
    | 'included'
    | 'included_with_warnings'
    | 'excluded'
    | 'infeasible'
    | 'compatible'
    | 'post_protocol_cutoff'
    | 'excluded_cutoff_early'
    | 'incomplete_pulse'
    | 'insufficient_rest'
    | null;
};

const labels: Record<string, string> = {
  computed: '已计算',
  not_computable: '不可计算',
  not_requested: '未请求',
  valid: '通过',
  review: '需复核',
  rejected: '拒绝',
  supported: '适用性支持',
  limited: '模型受限',
  unsupported: '不支持',
  provisional: '暂定 profile',
  'independent-qualified': '独立逐行校验',
  'not-qualified': '未独立校验',
  included: '纳入主比较',
  included_with_warnings: '纳入但有警告',
  excluded: '不纳入主比较',
  infeasible: '不可计算',
  compatible: '协议匹配',
  excluded_cutoff_early: '1.5 V 早停',
  post_protocol_cutoff: '协议截止后数据',
  incomplete_pulse: '脉冲不完整',
  insufficient_rest: '静置不足',
  none: '无结果',
};

function toneFor(value: StatusBadgeProps['value']) {
  if (value === 'valid' || value === 'supported' || value === 'computed' || value === 'independent-qualified' || value === 'included' || value === 'compatible') return 'positive';
  if (value === 'review' || value === 'limited' || value === 'provisional' || value === 'included_with_warnings') return 'caution';
  if (value === 'rejected' || value === 'unsupported' || value === 'not_computable' || value === 'excluded' || value === 'infeasible' || value === 'excluded_cutoff_early' || value === 'post_protocol_cutoff' || value === 'incomplete_pulse' || value === 'insufficient_rest') return 'negative';
  return 'neutral';
}

function Icon({ value }: Pick<StatusBadgeProps, 'value'>) {
  if (value === 'valid' || value === 'supported' || value === 'computed' || value === 'independent-qualified' || value === 'included' || value === 'compatible') return <CheckCircle2 aria-hidden="true" />;
  if (value === 'review' || value === 'limited' || value === 'provisional' || value === 'included_with_warnings') return <Clock3 aria-hidden="true" />;
  if (value === 'rejected' || value === 'unsupported' || value === 'not_computable' || value === 'excluded' || value === 'infeasible' || value === 'excluded_cutoff_early' || value === 'post_protocol_cutoff' || value === 'incomplete_pulse' || value === 'insufficient_rest') return <AlertCircle aria-hidden="true" />;
  return <CircleSlash2 aria-hidden="true" />;
}

export const StatusBadge = memo(function StatusBadge({ kind, value }: StatusBadgeProps) {
  const normalized = value ?? 'none';
  return (
    <span className={`status-badge status-badge--${toneFor(value)}`} data-kind={kind}>
      <Icon value={value} />
      <span>{labels[normalized]}</span>
    </span>
  );
});
