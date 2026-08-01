import type { QcFinding, QcStatus, ScientificResultStateV1 } from './contracts';

const STATUS_RANK: Record<QcStatus, number> = {
  valid: 0,
  review: 1,
  rejected: 2,
};

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
): QcFinding {
  return { code, status, metric, message };
}

