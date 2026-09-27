import { memo, useId, useMemo } from 'react';
import { ExternalLink } from 'lucide-react';
import type { GittResultV1 } from '../../science/contracts';
import type { GittPulsePlotModelV1 } from '../../product/gitt';
import { StatusBadge } from './StatusBadge';

type GittLiteratureDiagnosticsProps = {
  model: GittPulsePlotModelV1;
  result: GittResultV1;
  pulseOrder: number;
  sourceLabel: string;
  onOpenAudit: () => void;
};

const WIDTH = 720;
const HEIGHT = 330;
const LEFT = 58;
const RIGHT = 24;
const TOP = 24;
const BOTTOM = 48;
const GRID_FRACTIONS = [0, 0.25, 0.5, 0.75, 1];

function finite(value: number | null): value is number {
  return value !== null && Number.isFinite(value);
}

function extent(values: number[], relativePadding = 0.06): [number, number] {
  const minimum = Math.min(...values);
  const maximum = Math.max(...values);
  if (minimum === maximum) {
    const padding = Math.max(Math.abs(minimum) * relativePadding, 0.001);
    return [minimum - padding, maximum + padding];
  }
  const padding = (maximum - minimum) * relativePadding;
  return [minimum - padding, maximum + padding];
}

function pathFor<T>(
  points: readonly T[],
  x: (point: T) => number,
  y: (point: T) => number,
): string {
  return points.map((point, index) =>
    `${index === 0 ? 'M' : 'L'}${x(point).toFixed(2)},${y(point).toFixed(2)}`,
  ).join(' ');
}

function formatPotential(value: number | null): string {
  return finite(value) ? `${value.toFixed(4)} V` : '—';
}

function formatScientific(value: number | null): string {
  return finite(value) ? value.toExponential(3) : '—';
}

export const GittLiteratureDiagnostics = memo(function GittLiteratureDiagnostics({
  model,
  result,
  pulseOrder,
  sourceLabel,
  onOpenAudit,
}: GittLiteratureDiagnosticsProps) {
  const timelineTitleId = useId();
  const tauTitleId = useId();
  const timelinePlot = useMemo(() => {
    if (model.timeline.length === 0) return null;
    const xValues = model.timeline.map((point) => point.timeMinutes);
    const annotationVoltages = [
      model.preRestEndPotentialV,
      model.pulseBaselineExtrapolatedV,
      model.pulseEndVoltageV,
      model.postRestEndPotentialV,
    ].filter(finite);
    const [, xMaximum] = extent(xValues, 0.015);
    const xMinimum = Math.min(0, Math.min(...xValues));
    const [yMinimum, yMaximum] = extent([
      ...model.timeline.map((point) => point.voltageV),
      ...annotationVoltages,
    ]);
    const innerWidth = WIDTH - LEFT - RIGHT;
    const innerHeight = HEIGHT - TOP - BOTTOM;
    const x = (value: number) => LEFT + ((value - xMinimum) / (xMaximum - xMinimum)) * innerWidth;
    const y = (value: number) => TOP + (1 - (value - yMinimum) / (yMaximum - yMinimum)) * innerHeight;
    const segments = (['pre_rest', 'pulse', 'post_rest'] as const).map((segment) => ({
      segment,
      points: model.timeline.filter((point) => point.segment === segment),
    }));
    return { xMinimum, xMaximum, yMinimum, yMaximum, x, y, segments };
  }, [model]);
  const tauPlot = useMemo(() => {
    if (model.tauVoltagePoints.length === 0) return null;
    const xValues = model.tauVoltagePoints.map((point) => Math.sqrt(point.tauS));
    const yValues = model.tauVoltagePoints.map((point) => point.voltageV);
    const [, xMaximum] = extent(xValues, 0.04);
    const xMinimum = 0;
    const [yMinimum, yMaximum] = extent(yValues);
    const innerWidth = WIDTH - LEFT - RIGHT;
    const innerHeight = HEIGHT - TOP - BOTTOM;
    const x = (value: number) => LEFT + ((value - xMinimum) / (xMaximum - xMinimum)) * innerWidth;
    const y = (value: number) => TOP + (1 - (value - yMinimum) / (yMaximum - yMinimum)) * innerHeight;
    return { xMinimum, xMaximum, yMinimum, yMaximum, x, y };
  }, [model]);
  const fit = result.fitDiagnostics;
  const cfx10sWindow = result.regressionWindows.find((window) => window.windowId === 'cfx_10s') ?? null;
  const displayFitRSquared = cfx10sWindow !== null ? cfx10sWindow.rSquared : fit.rSquared;
  const deltaObserved = finite(result.observedDeltaEAtTauV)
    ? result.observedDeltaEAtTauV * 1_000
    : null;
  const deltaSteady = finite(result.deltaEsV) ? result.deltaEsV * 1_000 : null;

  return (
    <section className="gitt-diagnostic-workspace" id="gitt-pulse-diagnostics" aria-label={`脉冲 ${pulseOrder} 文献作图诊断`}>
      <header className="gitt-diagnostic-workspace__header">
        <div>
          <span className="product-eyebrow">SELECTED PULSE EVIDENCE</span>
          <h3>脉冲 #{pulseOrder} · 手算法结果与作图数据</h3>
          <p>{sourceLabel}</p>
        </div>
        <div className="gitt-diagnostic-workspace__status">
          <span className="product-state product-state--comparative">端点手算法</span>
          <button type="button" className="product-button product-button--secondary" onClick={onOpenAudit}>
            <ExternalLink aria-hidden="true" />高级诊断
          </button>
        </div>
      </header>

      <div className="gitt-diagnostic-summary" aria-label="所选脉冲关键量">
        <div><span>τ</span><strong>{finite(result.pulseDurationS) ? `${(result.pulseDurationS / 60).toFixed(2)} min` : '—'}</strong></div>
        <div><span>ΔEₜ（loaded t=0→末端）</span><strong>{deltaObserved === null ? '—' : `${deltaObserved.toFixed(2)} mV`}</strong></div>
        <div><span>ΔEs（静置末端）</span><strong>{deltaSteady === null ? '—' : `${deltaSteady.toFixed(2)} mV`}</strong></div>
        <div><span>L_equivalent</span><strong>{finite(result.activeMaterialEquivalentThicknessCm) ? `${result.activeMaterialEquivalentThicknessCm.toExponential(3)} cm` : '—'}</strong></div>
        <div><span>CFx 10 s R²</span><strong>{finite(displayFitRSquared) ? displayFitRSquared.toFixed(5) : '—'}</strong></div>
        <div><span>WH 手算法结果</span><strong>{formatScientific(result.metricValueCm2PerS)}</strong></div>
        <div><span>CFx 10 s slope D_app</span><strong>{formatScientific(cfx10sWindow?.metricValueCm2PerS ?? null)}</strong></div>
        <div><span>窗口稳定性</span><strong>{finite(result.windowStabilityDecades) ? `${result.windowStabilityDecades.toFixed(3)} decade` : '—'}</strong></div>
        <div><span>Endpoint–slope 偏差</span><strong>{finite(result.absMethodDivergenceDecades) ? `${result.absMethodDivergenceDecades.toFixed(3)} decade` : '—'}</strong></div>
        <div><span>Rest→loaded t=0</span><strong>{finite(result.onsetObservedDropV) ? `${(result.onsetObservedDropV * 1_000).toFixed(2)} mV` : '—'}</strong></div>
        <div><span>Endpoint QC</span><strong><StatusBadge kind="qc" value={result.primaryEndpointQcStatus} /></strong></div>
        <div><span>CFx10s QC</span><strong><StatusBadge kind="qc" value={result.cfx10SlopeQcStatus} /></strong></div>
        <div><span>主比较资格</span><strong><StatusBadge kind="qc" value={result.primaryComparisonEligibility} /></strong></div>
      </div>

      <p className="product-insight product-insight--information">
        主值按 D = 4/(πτ) × L_equivalent² × (ΔEs/ΔEₜ)² 计算；ΔEₜ 使用 pulse 内 loaded t=0 到 pulse 末端。CFx 10 s slope D_app 仅用于早期响应诊断，不参与主值。
      </p>

      <details className="product-audit-details">
        <summary>查看 Endpoint 起点与早期响应诊断</summary>
        <dl className="product-provenance-list">
          <div><dt>Pulse start (loaded t=0)</dt><dd>{formatPotential(result.pulseT0VoltageV)}</dd></div>
          <div><dt>Pulse t=0 current</dt><dd>{finite(result.pulseT0CurrentA) ? `${result.pulseT0CurrentA.toExponential(3)} A` : '—'}</dd></div>
          <div><dt>Pulse end</dt><dd>{formatPotential(result.pulseEndVoltageV)}</dd></div>
          <div><dt>Pre-rest robust end</dt><dd>{formatPotential(result.preRestEndPotentialV)}</dd></div>
          <div><dt>Post-rest robust end</dt><dd>{formatPotential(result.postRestEndPotentialV)}</dd></div>
          <div><dt>t=0→first positive-time</dt><dd>{finite(result.earlyPolarizationDropV) ? `${(result.earlyPolarizationDropV * 1_000).toFixed(2)} mV` : '—'}</dd></div>
          <div><dt>First positive sample</dt><dd>{finite(result.firstPositivePulseTimeS) && finite(result.firstPositivePulseVoltageV) ? `${result.firstPositivePulseTimeS.toFixed(2)} s · ${formatPotential(result.firstPositivePulseVoltageV)}` : '—'}</dd></div>
          <div><dt>Legacy first-positive ΔEₜ</dt><dd>{formatPotential(result.legacyFirstPositiveDeltaEtV)}</dd></div>
          <div><dt>New / legacy Endpoint D</dt><dd>{finite(result.endpointDRatioVsLegacy) ? result.endpointDRatioVsLegacy.toFixed(4) : '—'}</dd></div>
        </dl>
      </details>

      <details className="product-audit-details">
        <summary>查看 Rest-end 窗口敏感性（仅审计，不改变主值）</summary>
        <div className="product-table-wrap">
          <table className="product-table">
            <thead>
              <tr>
                <th>静置段</th>
                <th>当前窗口 / s</th>
                <th>当前 20%</th>
                <th>15 min</th>
                <th>5 min</th>
                <th>最后原始点</th>
                <th>robust spread</th>
              </tr>
            </thead>
            <tbody>
              {([
                ['Pre-rest', result.restEndSensitivityAudit.preRest],
                ['Post-rest', result.restEndSensitivityAudit.postRest],
              ] as const).map(([label, audit]) => (
                <tr key={label}>
                  <td>{label}</td>
                  <td className="product-table__number">{finite(audit.restEndCurrentWindowS) ? audit.restEndCurrentWindowS.toFixed(1) : '—'}</td>
                  <td className="product-table__number">{formatPotential(audit.restEndCurrentWindowV)}</td>
                  <td className="product-table__number">{formatPotential(audit.restEnd15minV)}</td>
                  <td className="product-table__number">{formatPotential(audit.restEnd5minV)}</td>
                  <td className="product-table__number">{formatPotential(audit.restEndRawLastPointV)}</td>
                  <td className="product-table__number">{formatPotential(audit.restEndRobustSpreadV)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <dl className="product-provenance-list">
          <div><dt>ΔEs current / 15 min / 5 min</dt><dd>{formatPotential(result.restEndSensitivityAudit.deltaEsCurrentV)} / {formatPotential(result.restEndSensitivityAudit.deltaEs15minV)} / {formatPotential(result.restEndSensitivityAudit.deltaEs5minV)}</dd></div>
          <div><dt>D current / 15 min / 5 min</dt><dd>{formatScientific(result.restEndSensitivityAudit.dCurrentCm2PerS)} / {formatScientific(result.restEndSensitivityAudit.d15minCm2PerS)} / {formatScientific(result.restEndSensitivityAudit.d5minCm2PerS)}</dd></div>
          <div><dt>log₁₀(D current / D 15 min)</dt><dd>{finite(result.restEndSensitivityAudit.log10DCurrentVs15min) ? result.restEndSensitivityAudit.log10DCurrentVs15min.toFixed(4) : '—'}</dd></div>
          <div><dt>log₁₀(D 15 min / D 5 min)</dt><dd>{finite(result.restEndSensitivityAudit.log10D15minVs5min) ? result.restEndSensitivityAudit.log10D15minVs5min.toFixed(4) : '—'}</dd></div>
          <div><dt>log₁₀(D current / D 5 min)</dt><dd>{finite(result.restEndSensitivityAudit.log10DCurrentVs5min) ? result.restEndSensitivityAudit.log10DCurrentVs5min.toFixed(4) : '—'}</dd></div>
        </dl>
      </details>

      <div className="product-table-wrap" aria-label="回归验证窗口比较">
        <table className="product-table">
          <thead>
            <tr>
              <th>窗口</th>
              <th>实际范围 / s</th>
              <th>唯一点数</th>
              <th>斜率 / V·s⁻¹ᐟ²</th>
              <th>R²</th>
              <th>D_app / cm²·s⁻¹</th>
              <th>采样覆盖</th>
              <th>线性分类</th>
              <th>状态</th>
            </tr>
          </thead>
          <tbody>
            {result.regressionWindows.map((window) => (
              <tr key={window.windowId}>
                <td>{window.windowLabel}</td>
                <td className="product-table__number">
                  {finite(window.actualStartS) && finite(window.actualEndS)
                    ? `${window.actualStartS.toFixed(2)}–${window.actualEndS.toFixed(2)}`
                    : '—'}
                </td>
                <td className="product-table__number">{window.uniqueTimePointCount}</td>
                <td className="product-table__number">{formatScientific(window.slopeVPerSqrtS)}</td>
                <td className="product-table__number">{finite(window.rSquared) ? window.rSquared.toFixed(5) : '—'}</td>
                <td className="product-table__number">{formatScientific(window.metricValueCm2PerS)}</td>
                <td>{window.samplingCoverage === 'full' ? '完整' : window.samplingCoverage === 'partial' ? '部分' : window.samplingCoverage === 'infeasible' ? '不可计算' : '—'}</td>
                <td>{window.linearityClass === 'strong_linearity' ? '强线性' : window.linearityClass === 'acceptable_review' ? '可接受/复核' : window.linearityClass === 'early_response_nonlinear' ? '早期响应非线性' : '—'}</td>
                <td>{window.status === 'valid' ? '可用' : window.status === 'review' ? '需复核' : '不可计算'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {(result.primaryEndpointQcReasons.length > 0 || result.cfx10SlopeQcReasons.length > 0) && (
        <details className="gitt-qc-reasons">
          <summary>查看结构化 QC 原因（旧 qcStatus 仅为兼容字段）</summary>
          <div className="gitt-qc-reasons__grid">
            {[...result.primaryEndpointQcReasons, ...result.cfx10SlopeQcReasons].map((reason, index) => (
              <div className="gitt-qc-reason" key={`${reason.code}-${index}`}>
                <strong>{reason.code}</strong>
                <span>{reason.message}</span>
                <small>{reason.domain} · {reason.severity} · 值={reason.value ?? '—'} · 阈值={reason.threshold ?? '—'} · 规则={reason.sourceRule}</small>
              </div>
            ))}
          </div>
        </details>
      )}

      <div className="gitt-diagnostic-grid">
        <article className="gitt-science-plot">
          <div className="gitt-science-plot__heading">
            <div><span className="product-eyebrow">E — TIME</span><h4>静置–脉冲–静置电压响应</h4></div>
            <span>关键电位来自同一分析收据</span>
          </div>
          {timelinePlot === null ? <p className="plot-empty">没有可绘制的脉冲时间序列。</p> : (
            <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-labelledby={timelineTitleId}>
              <title id={timelineTitleId}>脉冲 {pulseOrder} 的静置、脉冲与后静置电压时间响应</title>
              {GRID_FRACTIONS.map((fraction) => {
                const y = TOP + fraction * (HEIGHT - TOP - BOTTOM);
                return <line className="gitt-plot-grid" key={`timeline-y-${fraction}`} x1={LEFT} x2={WIDTH - RIGHT} y1={y} y2={y} />;
              })}
              {GRID_FRACTIONS.map((fraction) => {
                const x = LEFT + fraction * (WIDTH - LEFT - RIGHT);
                return <line className="gitt-plot-grid" key={`timeline-x-${fraction}`} x1={x} x2={x} y1={TOP} y2={HEIGHT - BOTTOM} />;
              })}
              <rect
                x={timelinePlot.x(model.pulseStartMinutes)}
                y={TOP}
                width={Math.max(1, timelinePlot.x(model.pulseEndMinutes) - timelinePlot.x(model.pulseStartMinutes))}
                height={HEIGHT - TOP - BOTTOM}
                className="gitt-pulse-window"
              />
              {timelinePlot.segments.map(({ segment, points }) => points.length > 0 && (
                <path
                  key={segment}
                  className={`gitt-voltage-path gitt-voltage-path--${segment}`}
                  d={pathFor(points, (point) => timelinePlot.x(point.timeMinutes), (point) => timelinePlot.y(point.voltageV))}
                />
              ))}
              {([
                ['Epre', model.preRestEndPotentialV, 'gitt-reference-line--pre'],
                ['Et,0 loaded', model.pulseStartVoltageV, 'gitt-reference-line--baseline'],
                ['Eτ', model.pulseEndVoltageV, 'gitt-reference-line--pulse'],
                ['Epost', model.postRestEndPotentialV, 'gitt-reference-line--post'],
              ] as const).map(([label, value, className]) => finite(value) && (
                <g key={label}>
                  <line className={`gitt-reference-line ${className}`} x1={LEFT} x2={WIDTH - RIGHT} y1={timelinePlot.y(value)} y2={timelinePlot.y(value)} />
                  <text className="gitt-reference-label" x={WIDTH - RIGHT - 4} y={timelinePlot.y(value) - 4} textAnchor="end">{label}</text>
                </g>
              ))}
              <text className="gitt-plot-axis" x={LEFT - 8} y={TOP + 4} textAnchor="end">{timelinePlot.yMaximum.toFixed(3)}</text>
              <text className="gitt-plot-axis" x={LEFT - 8} y={HEIGHT - BOTTOM} textAnchor="end">{timelinePlot.yMinimum.toFixed(3)}</text>
              <text className="gitt-plot-axis" x={LEFT} y={HEIGHT - 14}>{timelinePlot.xMinimum.toFixed(0)} min</text>
              <text className="gitt-plot-axis" x={WIDTH - RIGHT} y={HEIGHT - 14} textAnchor="end">{timelinePlot.xMaximum.toFixed(0)} min</text>
              <text className="gitt-plot-axis" x={LEFT} y={14}>Voltage / V</text>
              <text className="gitt-plot-axis" x={WIDTH - RIGHT} y={HEIGHT - 2} textAnchor="end">Time / min</text>
            </svg>
          )}
          <div className="gitt-plot-legend">
            <span><i className="gitt-legend-line gitt-legend-line--rest" />Rest</span>
            <span><i className="gitt-legend-line gitt-legend-line--pulse" />Pulse</span>
            <span>Epre {formatPotential(model.preRestEndPotentialV)}</span>
            <span>Epost {formatPotential(model.postRestEndPotentialV)}</span>
          </div>
        </article>

        <article className="gitt-science-plot">
          <div className="gitt-science-plot__heading">
            <div><span className="product-eyebrow">τ¹ᐟ² — VOLTAGE</span><h4>τ¹ᐟ²–电压原始点（未拟合）</h4></div>
            <span>已去掉 loaded t=0 点，保留原始脉冲点</span>
          </div>
          {tauPlot === null ? <p className="plot-empty">没有可绘制的 τ¹ᐟ²–电压数据。</p> : (
            <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-labelledby={tauTitleId}>
              <title id={tauTitleId}>脉冲 {pulseOrder} 的 τ¹ᐟ² 对电压原始点图</title>
              {GRID_FRACTIONS.map((fraction) => {
                const y = TOP + fraction * (HEIGHT - TOP - BOTTOM);
                return <line className="gitt-plot-grid" key={`tau-y-${fraction}`} x1={LEFT} x2={WIDTH - RIGHT} y1={y} y2={y} />;
              })}
              {GRID_FRACTIONS.map((fraction) => {
                const x = LEFT + fraction * (WIDTH - LEFT - RIGHT);
                return <line className="gitt-plot-grid" key={`tau-x-${fraction}`} x1={x} x2={x} y1={TOP} y2={HEIGHT - BOTTOM} />;
              })}
              <path
                className="gitt-tau-path"
                d={pathFor(model.tauVoltagePoints, (point) => tauPlot.x(Math.sqrt(point.tauS)), (point) => tauPlot.y(point.voltageV))}
              />
              {model.tauVoltagePoints.map((point) => (
                <circle
                  key={point.id}
                  className="gitt-tau-point"
                  cx={tauPlot.x(Math.sqrt(point.tauS))}
                  cy={tauPlot.y(point.voltageV)}
                  r={3}
                />
              ))}
              <text className="gitt-plot-axis" x={LEFT - 8} y={TOP + 4} textAnchor="end">{tauPlot.yMaximum.toFixed(3)}</text>
              <text className="gitt-plot-axis" x={LEFT - 8} y={HEIGHT - BOTTOM} textAnchor="end">{tauPlot.yMinimum.toFixed(3)}</text>
              <text className="gitt-plot-axis" x={LEFT} y={HEIGHT - 14}>{tauPlot.xMinimum.toFixed(0)}</text>
              <text className="gitt-plot-axis" x={WIDTH - RIGHT} y={HEIGHT - 14} textAnchor="end">{tauPlot.xMaximum.toFixed(1)}</text>
              <text className="gitt-plot-axis" x={LEFT} y={14}>Voltage / V</text>
              <text className="gitt-plot-axis" x={WIDTH - RIGHT} y={HEIGHT - 2} textAnchor="end">τ¹ᐟ² / s¹ᐟ²</text>
            </svg>
          )}
          <div className="gitt-plot-legend">
            <span><i className="gitt-legend-line gitt-legend-line--pulse" />脉冲电压轨迹</span>
            <span><i className="gitt-legend-dot gitt-legend-dot--fit" />实际采样点</span>
            <span>仅展示数据，不提供拟合线</span>
          </div>
        </article>
      </div>
    </section>
  );
});
