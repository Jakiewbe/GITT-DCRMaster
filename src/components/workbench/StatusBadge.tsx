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
  none: '无结果',
};

function toneFor(value: StatusBadgeProps['value']) {
  if (value === 'valid' || value === 'supported' || value === 'computed' || value === 'independent-qualified') return 'positive';
  if (value === 'review' || value === 'limited' || value === 'provisional') return 'caution';
  if (value === 'rejected' || value === 'unsupported' || value === 'not_computable') return 'negative';
  return 'neutral';
}

function Icon({ value }: Pick<StatusBadgeProps, 'value'>) {
  if (value === 'valid' || value === 'supported' || value === 'computed' || value === 'independent-qualified') return <CheckCircle2 aria-hidden="true" />;
  if (value === 'review' || value === 'limited' || value === 'provisional') return <Clock3 aria-hidden="true" />;
  if (value === 'rejected' || value === 'unsupported' || value === 'not_computable') return <AlertCircle aria-hidden="true" />;
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
