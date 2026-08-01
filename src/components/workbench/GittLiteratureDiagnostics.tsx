import { memo, useId, useMemo } from 'react';
import { ExternalLink } from 'lucide-react';
import type { GittResultV1 } from '../../science/contracts';
import type { GittPulsePlotModelV1 } from '../../product/gitt';

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
  const sqrtTitleId = useId();
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
  const sqrtPlot = useMemo(() => {
    if (model.sqrtTimePoints.length === 0) return null;
    const xValues = model.sqrtTimePoints.map((point) => point.sqrtTimeSqrtS);
    const yValues = model.sqrtTimePoints.map((point) => point.voltageV);
    if (model.fitLine) {
      xValues.push(model.fitLine.startSqrtTime, model.fitLine.endSqrtTime);
      yValues.push(model.fitLine.startVoltageV, model.fitLine.endVoltageV);
    }
    const [, xMaximum] = extent(xValues, 0.04);
    const xMinimum = Math.min(0, Math.min(...xValues));
    const [yMinimum, yMaximum] = extent(yValues);
    const innerWidth = WIDTH - LEFT - RIGHT;
    const innerHeight = HEIGHT - TOP - BOTTOM;
    const x = (value: number) => LEFT + ((value - xMinimum) / (xMaximum - xMinimum)) * innerWidth;
    const y = (value: number) => TOP + (1 - (value - yMinimum) / (yMaximum - yMinimum)) * innerHeight;
    return { xMinimum, xMaximum, yMinimum, yMaximum, x, y };
  }, [model]);
  const fit = result.fitDiagnostics;
  const fitIsWeak =
    (finite(fit.rSquared) && fit.rSquared < 0.98) ||
    (finite(fit.curvatureMetric) && fit.curvatureMetric > 0.25) ||
    result.qcCodes.includes('automatic_fit_no_window_passed_hard_gates');
  const deltaObserved = finite(result.observedDeltaEAtTauV)
    ? result.observedDeltaEAtTauV * 1_000
    : null;
  const deltaSteady = finite(result.deltaEsV) ? result.deltaEsV * 1_000 : null;

  return (
    <section className="gitt-diagnostic-workspace" id="gitt-pulse-diagnostics" aria-label={`脉冲 ${pulseOrder} 文献作图诊断`}>
      <header className="gitt-diagnostic-workspace__header">
        <div>
          <span className="product-eyebrow">SELECTED PULSE EVIDENCE</span>
          <h3>脉冲 #{pulseOrder} · 手算法结果与辅助拟合</h3>
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
        <div><span>ΔEₜ（首个负载点→末端）</span><strong>{deltaObserved === null ? '—' : `${deltaObserved.toFixed(2)} mV`}</strong></div>
        <div><span>ΔEs（静置末端）</span><strong>{deltaSteady === null ? '—' : `${deltaSteady.toFixed(2)} mV`}</strong></div>
        <div><span>L_equivalent</span><strong>{finite(result.activeMaterialEquivalentThicknessCm) ? `${result.activeMaterialEquivalentThicknessCm.toExponential(3)} cm` : '—'}</strong></div>
        <div><span>辅助拟合 R²</span><strong>{finite(fit.rSquared) ? fit.rSquared.toFixed(5) : '—'}</strong></div>
        <div><span>WH 手算法结果</span><strong>{formatScientific(result.metricValueCm2PerS)}</strong></div>
      </div>

      <p className="product-insight product-insight--information">
        主值按 D = 4/(πτ) × L_equivalent² × (ΔEs/ΔEₜ)² 计算；右侧 √t 回归只用于查看曲线形态，不参与主值。
      </p>

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
                ['E0+', model.pulseStartVoltageV, 'gitt-reference-line--baseline'],
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
              <text className="gitt-plot-axis" x={LEFT} y={14}>E / V</text>
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
            <div><span className="product-eyebrow">E — √t</span><h4>辅助回归图</h4></div>
            <span>{fit.actualFitWindow ? `${fit.actualFitWindow.startS.toFixed(1)}–${fit.actualFitWindow.endS.toFixed(1)} s · ${fitIsWeak ? '线性较弱' : '线性较好'}` : '无回归窗口'}</span>
          </div>
          {sqrtPlot === null ? <p className="plot-empty">没有可绘制的 √t 数据。</p> : (
            <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-labelledby={sqrtTitleId}>
              <title id={sqrtTitleId}>脉冲 {pulseOrder} 的 E 对平方根时间回归图</title>
              {GRID_FRACTIONS.map((fraction) => {
                const y = TOP + fraction * (HEIGHT - TOP - BOTTOM);
                return <line className="gitt-plot-grid" key={`sqrt-y-${fraction}`} x1={LEFT} x2={WIDTH - RIGHT} y1={y} y2={y} />;
              })}
              {GRID_FRACTIONS.map((fraction) => {
                const x = LEFT + fraction * (WIDTH - LEFT - RIGHT);
                return <line className="gitt-plot-grid" key={`sqrt-x-${fraction}`} x1={x} x2={x} y1={TOP} y2={HEIGHT - BOTTOM} />;
              })}
              <path
                className="gitt-sqrt-path"
                d={pathFor(model.sqrtTimePoints, (point) => sqrtPlot.x(point.sqrtTimeSqrtS), (point) => sqrtPlot.y(point.voltageV))}
              />
              {model.sqrtTimePoints.map((point) => (
                <circle
                  key={point.id}
                  className={point.inFitWindow ? 'gitt-sqrt-point gitt-sqrt-point--fit' : 'gitt-sqrt-point'}
                  cx={sqrtPlot.x(point.sqrtTimeSqrtS)}
                  cy={sqrtPlot.y(point.voltageV)}
                  r={point.inFitWindow ? 3.7 : 2.2}
                />
              ))}
              {model.fitLine && (
                <line
                  className={`gitt-fit-line ${fitIsWeak ? 'gitt-fit-line--weak' : ''}`}
                  x1={sqrtPlot.x(model.fitLine.startSqrtTime)}
                  x2={sqrtPlot.x(model.fitLine.endSqrtTime)}
                  y1={sqrtPlot.y(model.fitLine.startVoltageV)}
                  y2={sqrtPlot.y(model.fitLine.endVoltageV)}
                />
              )}
              <text className="gitt-fit-equation" x={LEFT + 12} y={TOP + 18}>
                {finite(fit.slopeVPerSqrtS) && finite(fit.interceptV)
                  ? `E = ${fit.slopeVPerSqrtS.toExponential(3)}√t + ${fit.interceptV.toFixed(4)}`
                  : '未形成可用线性拟合'}
              </text>
              <text className="gitt-plot-axis" x={LEFT - 8} y={TOP + 4} textAnchor="end">{sqrtPlot.yMaximum.toFixed(3)}</text>
              <text className="gitt-plot-axis" x={LEFT - 8} y={HEIGHT - BOTTOM} textAnchor="end">{sqrtPlot.yMinimum.toFixed(3)}</text>
              <text className="gitt-plot-axis" x={LEFT} y={HEIGHT - 14}>{sqrtPlot.xMinimum.toFixed(1)}</text>
              <text className="gitt-plot-axis" x={WIDTH - RIGHT} y={HEIGHT - 14} textAnchor="end">{sqrtPlot.xMaximum.toFixed(1)}</text>
              <text className="gitt-plot-axis" x={LEFT} y={14}>E / V</text>
              <text className="gitt-plot-axis" x={WIDTH - RIGHT} y={HEIGHT - 2} textAnchor="end">√t / s½</text>
            </svg>
          )}
          <div className="gitt-plot-legend">
            <span><i className="gitt-legend-dot" />全部脉冲点</span>
            <span><i className="gitt-legend-dot gitt-legend-dot--fit" />自动回归窗口点</span>
            <span><i className="gitt-legend-line gitt-legend-line--fit" />辅助回归线</span>
            <span>曲率 {finite(fit.curvatureMetric) ? `${(fit.curvatureMetric * 100).toFixed(1)}%` : '—'}</span>
          </div>
        </article>
      </div>
    </section>
  );
});
