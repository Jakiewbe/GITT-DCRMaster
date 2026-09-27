import { memo, useId, useMemo } from 'react';
import type { CanonicalRowV1 } from '../../science/contracts';

type TimelinePlotProps = {
  rows: CanonicalRowV1[];
};

type PlotPoint = {
  timeS: number;
  voltageV: number;
  currentMa: number;
};

const WIDTH = 960;
const HEIGHT = 320;
const LEFT = 62;
const RIGHT = 62;
const TOP = 24;
const BOTTOM = 42;

function extent(values: number[]): [number, number] {
  const minimum = Math.min(...values);
  const maximum = Math.max(...values);
  if (minimum === maximum) return [minimum - 0.5, maximum + 0.5];
  const margin = (maximum - minimum) * 0.06;
  return [minimum - margin, maximum + margin];
}

function downsample(rows: CanonicalRowV1[], maximumPoints = 1400): PlotPoint[] {
  if (rows.length <= maximumPoints) {
    return rows.map((row) => ({
      timeS: row.elapsedTimeS,
      voltageV: row.voltageV,
      currentMa: row.currentA * 1000,
    }));
  }

  const bucketSize = Math.ceil(rows.length / maximumPoints);
  const sampled: PlotPoint[] = [];
  for (let start = 0; start < rows.length; start += bucketSize) {
    const bucket = rows.slice(start, Math.min(rows.length, start + bucketSize));
    const first = bucket[0];
    const last = bucket[bucket.length - 1];
    const voltageMinimum = bucket.reduce((candidate, row) =>
      row.voltageV < candidate.voltageV ? row : candidate,
    );
    const voltageMaximum = bucket.reduce((candidate, row) =>
      row.voltageV > candidate.voltageV ? row : candidate,
    );
    const candidates = [first, voltageMinimum, voltageMaximum, last]
      .filter((row, index, values) => values.indexOf(row) === index)
      .sort((left, right) => left.elapsedTimeS - right.elapsedTimeS);
    for (const row of candidates) {
      sampled.push({
        timeS: row.elapsedTimeS,
        voltageV: row.voltageV,
        currentMa: row.currentA * 1000,
      });
    }
  }
  return sampled;
}

function pathFor(
  points: PlotPoint[],
  x: (value: number) => number,
  y: (value: number) => number,
  accessor: (point: PlotPoint) => number,
) {
  return points
    .map((point, index) => `${index === 0 ? 'M' : 'L'}${x(point.timeS).toFixed(2)},${y(accessor(point)).toFixed(2)}`)
    .join(' ');
}

export const TimelinePlot = memo(function TimelinePlot({ rows }: TimelinePlotProps) {
  const titleId = useId();
  const descriptionId = useId();
  const plot = useMemo(() => {
    if (rows.length === 0) return null;
    const points = downsample(rows);
    const [timeMinimum, timeMaximum] = extent(points.map((point) => point.timeS));
    const [voltageMinimum, voltageMaximum] = extent(points.map((point) => point.voltageV));
    const [currentMinimum, currentMaximum] = extent(points.map((point) => point.currentMa));
    const innerWidth = WIDTH - LEFT - RIGHT;
    const innerHeight = HEIGHT - TOP - BOTTOM;
    const x = (value: number) => LEFT + (((value / 60) - (timeMinimum / 60)) / ((timeMaximum - timeMinimum) / 60)) * innerWidth;
    const voltageY = (value: number) => TOP + (1 - (value - voltageMinimum) / (voltageMaximum - voltageMinimum)) * innerHeight;
    const currentY = (value: number) => TOP + (1 - (value - currentMinimum) / (currentMaximum - currentMinimum)) * innerHeight;
    return {
      points,
      timeMinimum,
      timeMaximum,
      voltageMinimum,
      voltageMaximum,
      currentMinimum,
      currentMaximum,
      x,
      voltageY,
      currentY,
    };
  }, [rows]);

  if (!plot) {
    return <div className="plot-empty">没有可绘制的 Canonical 记录。</div>;
  }

  const gridFractions = [0, 0.25, 0.5, 0.75, 1];
  const voltagePath = pathFor(plot.points, plot.x, plot.voltageY, (point) => point.voltageV);
  const currentPath = pathFor(plot.points, plot.x, plot.currentY, (point) => point.currentMa);
  const durationHours = (plot.timeMaximum - plot.timeMinimum) / 3600;

  return (
    <div
      className="timeline-plot"
      role="region"
      aria-label="Canonical 电压与电流图，可使用方向键横向滚动"
      tabIndex={0}
    >
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        role="img"
        aria-labelledby={`${titleId} ${descriptionId}`}
      >
        <title id={titleId}>Canonical 电压与电流时间序列</title>
        <desc id={descriptionId}>
          共 {rows.length} 条记录，持续 {durationHours.toFixed(2)} 小时。电压范围
          {plot.voltageMinimum.toFixed(3)} 至 {plot.voltageMaximum.toFixed(3)} V；电流范围
          {plot.currentMinimum.toFixed(3)} 至 {plot.currentMaximum.toFixed(3)} mA。
        </desc>
        {gridFractions.map((fraction) => {
          const y = TOP + fraction * (HEIGHT - TOP - BOTTOM);
          return <line className="plot-grid" key={`horizontal-${fraction}`} x1={LEFT} x2={WIDTH - RIGHT} y1={y} y2={y} />;
        })}
        {gridFractions.map((fraction) => {
          const x = LEFT + fraction * (WIDTH - LEFT - RIGHT);
          return <line className="plot-grid" key={`vertical-${fraction}`} x1={x} x2={x} y1={TOP} y2={HEIGHT - BOTTOM} />;
        })}
        <path className="plot-line plot-line--voltage" d={voltagePath} />
        <path className="plot-line plot-line--current" d={currentPath} />
        <text className="plot-axis plot-axis--left" x={LEFT - 12} y={TOP + 4} textAnchor="end">
          Voltage / V
        </text>
        <text className="plot-axis plot-axis--left" x={LEFT - 12} y={HEIGHT - BOTTOM} textAnchor="end">
          {plot.voltageMinimum.toFixed(2)} V
        </text>
        <text className="plot-axis plot-axis--right" x={WIDTH - RIGHT + 12} y={TOP + 4}>
          Current / mA
        </text>
        <text className="plot-axis plot-axis--right" x={WIDTH - RIGHT + 12} y={HEIGHT - BOTTOM}>
          {plot.currentMinimum.toFixed(2)} mA
        </text>
        <text className="plot-axis" x={LEFT} y={HEIGHT - 14}>Time / min</text>
        <text className="plot-axis" x={WIDTH - RIGHT} y={HEIGHT - 14} textAnchor="end">
          {(durationHours * 60).toFixed(1)} min
        </text>
      </svg>
      <div className="plot-legend" aria-hidden="true">
        <span><i className="legend-line legend-line--voltage" />电压 / V</span>
        <span><i className="legend-line legend-line--current" />电流 / mA</span>
      </div>
    </div>
  );
});
