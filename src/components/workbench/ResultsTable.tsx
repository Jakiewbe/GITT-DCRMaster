import { memo } from 'react';
import type { DcrMetricResultV1, GittResultV1 } from '../../science/contracts';
import { StatusBadge } from './StatusBadge';

type ResultsTableProps = {
  dcrResults: DcrMetricResultV1[];
  gittResults: GittResultV1[];
  showAuditCandidates: boolean;
};

function significant(value: number | null, digits = 4): string {
  if (value === null || !Number.isFinite(value)) return '—';
  if (value === 0) return '0';
  const exponent = Math.floor(Math.log10(Math.abs(value)));
  if (exponent >= digits || exponent <= -3) return value.toExponential(digits - 1);
  return value.toFixed(Math.max(0, digits - exponent - 1));
}

function qcCodes(codes: string[]) {
  if (codes.length === 0) return '—';
  return codes.join(' · ');
}

function DcrTable({ results, showAuditCandidates }: { results: DcrMetricResultV1[]; showAuditCandidates: boolean }) {
  return (
    <div className="results-table-wrap" role="region" aria-label="DCR 结果表，可使用方向键横向滚动" tabIndex={0}>
      <table className="results-table">
        <caption className="sr-only">DCR exact-tick 分析结果</caption>
        <thead>
          <tr>
            <th scope="col">事件</th>
            <th scope="col">指标</th>
            <th scope="col">R / Ω</th>
            <th scope="col">计算</th>
            <th scope="col">诊断</th>
            <th scope="col">实际时间 / s</th>
            <th scope="col">审计原因</th>
          </tr>
        </thead>
        <tbody>
          {results.map((result) => {
            const value = result.resistanceOhm ?? (showAuditCandidates ? result.diagnosticCandidateResistanceOhm : null);
            return (
              <tr key={`${result.eventId}:${result.requestedMetric}`}>
                <td title={result.eventId}>{result.eventId.split(':').at(-1)}</td>
                <td>{result.requestedMetric}</td>
                <td className={result.resistanceOhm === null && value !== null ? 'audit-value' : ''}>{significant(value)}</td>
                <td><StatusBadge kind="calculation" value={result.calculationState} /></td>
                <td><StatusBadge kind="qc" value={result.qcStatus} /></td>
                <td>{significant(result.actualElapsedFromTransitionS)}</td>
                <td className="codes-cell" title={qcCodes(result.qcCodes)}>{qcCodes(result.qcCodes)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function GittTable({ results }: { results: GittResultV1[] }) {
  return (
    <div className="results-table-wrap" role="region" aria-label="GITT 结果表，可使用方向键横向滚动" tabIndex={0}>
      <table className="results-table">
        <caption className="sr-only">GITT Weppner–Huggins 端点手算法结果</caption>
        <thead>
          <tr>
            <th scope="col">脉冲</th>
            <th scope="col">WH 手算法结果 / cm²·s⁻¹</th>
            <th scope="col">计算</th>
            <th scope="col">ΔEₜ / V</th>
            <th scope="col">ΔEs / V</th>
            <th scope="col">τ / s</th>
            <th scope="col">辅助拟合 R²</th>
            <th scope="col">适用性</th>
            <th scope="col">Endpoint QC</th>
            <th scope="col">主比较</th>
            <th scope="col">SOC / %</th>
            <th scope="col">DOD / %</th>
            <th scope="col">诊断提示</th>
          </tr>
        </thead>
        <tbody>
          {results.map((result) => (
              <tr key={result.pulseId}>
                <td title={result.pulseId}>{result.pulseId.split(':').at(-1)}</td>
                <td>{significant(result.metricValueCm2PerS)}</td>
                <td><StatusBadge kind="calculation" value={result.calculationState} /></td>
                <td>{significant(result.deltaEtV)}</td>
                <td>{significant(result.deltaEsV)}</td>
                <td>{significant(result.pulseDurationS)}</td>
                <td>{significant(result.fitDiagnostics.rSquared)}</td>
                <td><StatusBadge kind="applicability" value={result.modelApplicability} /></td>
                <td><StatusBadge kind="qc" value={result.primaryEndpointQcStatus} /></td>
                <td><StatusBadge kind="qc" value={result.primaryComparisonEligibility} /></td>
                <td>{significant(result.socPrePulsePct)}</td>
                <td>{significant(result.dodPrePulsePct)}</td>
                <td className="codes-cell" title={qcCodes(result.qcCodes)}>{qcCodes(result.qcCodes)}</td>
              </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export const ResultsTable = memo(function ResultsTable({ dcrResults, gittResults, showAuditCandidates }: ResultsTableProps) {
  if (dcrResults.length > 0) return <DcrTable results={dcrResults} showAuditCandidates={showAuditCandidates} />;
  if (gittResults.length > 0) return <GittTable results={gittResults} />;
  return (
    <div className="table-empty">
      当前文件没有匹配已批准结构的 GITT 或 DCR 事件。求解器不会按持续时间猜测协议角色。
    </div>
  );
});
