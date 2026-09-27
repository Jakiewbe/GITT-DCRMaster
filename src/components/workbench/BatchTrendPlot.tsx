import { memo, useId, useMemo } from 'react';

/**
 * A deliberately small, science-core-independent point contract for batch
 * result trends.  `y: null` represents a result that must remain absent from
 * the plotted numeric trend (for example, rejected or not-computable data).
 */
export type BatchTrendPoint = {
  id: string;
  x: number;
  y: number | null;
  label: string;
  seriesLabel: string;
  seriesColor?: string;
  seriesOrder?: number;
  state: BatchTrendPointState;
};

export type BatchTrendPointState =
  | 'valid'
  | 'review'
  | 'rejected'
  | 'not_computable'
  | 'neutral'
  | 'unknown';

export type BatchTrendPlotProps = {
  points: readonly BatchTrendPoint[];
  ariaLabel: string;
  xLabel?: string;
  yLabel?: string;
  selectedId?: string | null;
  onPointClick?: (point: BatchTrendPoint) => void;
  formatX?: (value: number) => string;
  formatY?: (value: number) => string;
  /** Optional physical lower bound, e.g. 0 for a non-negative metric. */
  minimumY?: number;
  /** Optional physical lower bound, e.g. 0 for elapsed time. */
  minimumX?: number;
  yScale?: 'linear' | 'log10';
  reverseX?: boolean;
  reverseY?: boolean;
  showMarkers?: boolean;
  /** Set false for a scatter-style comparison where adjacent points are not a measured path. */
  showLines?: boolean;
  markerColorMode?: 'state' | 'series';
  emptyMessage?: string;
  className?: string;
};

type PlottablePoint = BatchTrendPoint & {
  xPosition: number;
  yPosition: number;
};

const WIDTH = 960;
const HEIGHT = 320;
const LEFT = 64;
const RIGHT = 24;
const TOP = 28;
const BOTTOM = 54;
const SERIES_COLORS = ['#43b5c5', '#d5a755', '#8bbd9a', '#b29ee8', '#d98282'] as const;

function finite(value: number | null): value is number {
  return value !== null && Number.isFinite(value);
}

function extent(values: number[]): [number, number] {
  const minimum = Math.min(...values);
  const maximum = Math.max(...values);
  if (minimum === maximum) {
    const padding = Math.max(Math.abs(minimum) * 0.05, 1);
    return [minimum - padding, maximum + padding];
  }
  const padding = (maximum - minimum) * 0.06;
  return [minimum - padding, maximum + padding];
}

function formatDefault(value: number): string {
  return new Intl.NumberFormat('zh-CN', { maximumSignificantDigits: 4 }).format(value);
}

export function getTrendYTickValues(
  yMinimum: number,
  yMaximum: number,
  yScale: 'linear' | 'log10',
  reverseY = false,
): number[] {
  const fractions = [0, 0.25, 0.5, 0.75, 1];
  if (yScale === 'log10') {
    const minimumLog = Math.log10(yMinimum);
    const maximumLog = Math.log10(yMaximum);
    return fractions.map((fraction) => 10 ** (
      reverseY
        ? minimumLog + fraction * (maximumLog - minimumLog)
        : maximumLog - fraction * (maximumLog - minimumLog)
    ));
  }
  return fractions.map((fraction) => reverseY
    ? yMinimum + fraction * (yMaximum - yMinimum)
    : yMaximum - fraction * (yMaximum - yMinimum));
}

function markerFill(state: BatchTrendPointState): string {
  if (state === 'valid') return '#65b98b';
  if (state === 'review') return '#d5a755';
  if (state === 'rejected') return '#dc7373';
  return '#77838c';
}

function linePath(points: readonly PlottablePoint[]): string {
  return points
    .map((point, index) => `${index === 0 ? 'M' : 'L'}${point.xPosition.toFixed(2)},${point.yPosition.toFixed(2)}`)
    .join(' ');
}

export function shouldRenderTrendLines(showLines: boolean, pointCount: number): boolean {
  return showLines && pointCount >= 2;
}

export const BatchTrendPlot = memo(function BatchTrendPlot({
  points,
  ariaLabel,
  xLabel = 'X',
  yLabel = 'Y',
  selectedId = null,
  onPointClick,
  formatX = formatDefault,
  formatY = formatDefault,
  minimumY,
  minimumX,
  yScale = 'linear',
  reverseX = false,
  reverseY = false,
  showMarkers = true,
  showLines = true,
  markerColorMode = 'state',
  emptyMessage = '暂无可绘制的数值结果。',
  className,
}: BatchTrendPlotProps) {
  const titleId = useId();
  const descriptionId = useId();
  const clipId = useId();
  const model = useMemo(() => {
    const numericPoints = points.filter((point) =>
      finite(point.x) && finite(point.y) && (yScale === 'linear' || (point.y as number) > 0),
    );
    if (numericPoints.length === 0) return null;

    const xValues = numericPoints.map((point) => point.x);
    const [automaticXMinimum, xMaximum] = extent(xValues);
    const xMinimum = Number.isFinite(minimumX)
      ? Math.min(minimumX as number, Math.min(...xValues))
      : automaticXMinimum;
    const yValues = numericPoints.map((point) => point.y as number);
    const transformY = (value: number) => yScale === 'log10' ? Math.log10(value) : value;
    const restoreY = (value: number) => yScale === 'log10' ? 10 ** value : value;
    const transformedYValues = yValues.map(transformY);
    const [automaticYMinimum, automaticYMaximum] = extent(transformedYValues);
    const transformedMinimumY = Number.isFinite(minimumY) &&
      (yScale === 'linear' || (minimumY as number) > 0)
      ? Math.min(transformY(minimumY as number), Math.min(...transformedYValues))
      : automaticYMinimum;
    const innerWidth = WIDTH - LEFT - RIGHT;
    const innerHeight = HEIGHT - TOP - BOTTOM;
    const xPosition = (value: number) => {
      const fraction = (value - xMinimum) / (xMaximum - xMinimum);
      return LEFT + (reverseX ? 1 - fraction : fraction) * innerWidth;
    };
    const yPosition = (value: number) => {
      const fraction = (transformY(value) - transformedMinimumY) /
        (automaticYMaximum - transformedMinimumY);
      return TOP + (reverseY ? fraction : 1 - fraction) * innerHeight;
    };

    const series = new Map<string, PlottablePoint[]>();
    for (const point of numericPoints) {
      const item: PlottablePoint = {
        ...point,
        xPosition: xPosition(point.x),
        yPosition: yPosition(point.y as number),
      };
      const existing = series.get(point.seriesLabel);
      if (existing) existing.push(item);
      else series.set(point.seriesLabel, [item]);
    }

    return {
      xMinimum,
      xMaximum,
      yMinimum: restoreY(transformedMinimumY),
      yMaximum: restoreY(automaticYMaximum),
      series: [...series.entries()].map(([label, items], index) => ({
        label,
        color: items[0]?.seriesColor ?? SERIES_COLORS[index % SERIES_COLORS.length],
        points: [...items].sort((left, right) =>
          (left.seriesOrder ?? left.x) - (right.seriesOrder ?? right.x) ||
          left.id.localeCompare(right.id),
        ),
      })),
    };
  }, [minimumX, minimumY, points, reverseX, reverseY, yScale]);

  if (!model) {
    return <div className={['batch-trend-plot', className].filter(Boolean).join(' ')}>{emptyMessage}</div>;
  }

  const tickFractions = [0, 0.25, 0.5, 0.75, 1];
  const interactive = onPointClick !== undefined;
  const missingCount = points.length - model.series.reduce((count, series) => count + series.points.length, 0);

  return (
    <section className={['batch-trend-plot', className].filter(Boolean).join(' ')} aria-label={ariaLabel}>
      <svg
        className="batch-trend-plot__svg"
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        role="img"
        aria-labelledby={`${titleId} ${descriptionId}`}
        style={{ display: 'block', width: '100%', height: 'auto' }}
      >
        <title id={titleId}>{ariaLabel}</title>
        <desc id={descriptionId}>
          {`${model.series.reduce((count, series) => count + series.points.length, 0)} 个数值点，${model.series.length} 条系列。`}
          {missingCount > 0 ? ` 另有 ${missingCount} 个无数值点未进入趋势线。` : ''}
        </desc>
        <defs>
          <clipPath id={clipId}>
            <rect x={LEFT} y={TOP} width={WIDTH - LEFT - RIGHT} height={HEIGHT - TOP - BOTTOM} />
          </clipPath>
        </defs>

        {tickFractions.map((fraction) => {
          const y = TOP + fraction * (HEIGHT - TOP - BOTTOM);
          const yValue = getTrendYTickValues(model.yMinimum, model.yMaximum, yScale, reverseY)[
            Math.round(fraction * 4)
          ];
          return (
            <g key={`horizontal-${fraction}`}>
              <line
                x1={LEFT}
                x2={WIDTH - RIGHT}
                y1={y}
                y2={y}
                stroke="#283038"
                strokeWidth="1"
                vectorEffect="non-scaling-stroke"
              />
              <text x={LEFT - 10} y={y + 3} textAnchor="end" fill="#9aa6ae" fontSize="10">
                {formatY(yValue)}
              </text>
            </g>
          );
        })}
        {tickFractions.map((fraction) => {
          const x = LEFT + fraction * (WIDTH - LEFT - RIGHT);
          const xValue = reverseX
            ? model.xMaximum - fraction * (model.xMaximum - model.xMinimum)
            : model.xMinimum + fraction * (model.xMaximum - model.xMinimum);
          return (
            <g key={`vertical-${fraction}`}>
              <line
                x1={x}
                x2={x}
                y1={TOP}
                y2={HEIGHT - BOTTOM}
                stroke="#283038"
                strokeWidth="1"
                vectorEffect="non-scaling-stroke"
              />
              <text
                x={x}
                y={HEIGHT - 18}
                textAnchor={fraction === 0 ? 'start' : fraction === 1 ? 'end' : 'middle'}
                fill="#9aa6ae"
                fontSize="10"
              >
                {formatX(xValue)}
              </text>
            </g>
          );
        })}

        <g clipPath={`url(#${clipId})`}>
          {model.series.map((series) => shouldRenderTrendLines(showLines, series.points.length) ? (
            <path
              key={`line-${series.label}`}
              d={linePath(series.points)}
              fill="none"
              stroke={series.color}
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
            />
          ) : null)}
          {showMarkers && model.series.flatMap((series) => series.points.map((point) => {
            const isSelected = point.id === selectedId;
            const title = `${point.label}: ${formatX(point.x)}, ${formatY(point.y as number)} (${point.state})`;
            return (
              <g
                key={point.id}
                className="batch-trend-plot__point"
                role={interactive ? 'button' : undefined}
                tabIndex={interactive ? 0 : undefined}
                aria-label={interactive ? `选择 ${title}` : title}
                onClick={interactive ? () => onPointClick(point) : undefined}
                onKeyDown={interactive ? (event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    onPointClick(point);
                  }
                } : undefined}
                style={interactive ? { cursor: 'pointer' } : undefined}
              >
                <title>{title}</title>
                {isSelected && <circle cx={point.xPosition} cy={point.yPosition} r="7" fill="none" stroke="#f3f7f8" strokeWidth="1.5" />}
                <circle
                  cx={point.xPosition}
                  cy={point.yPosition}
                  r={isSelected ? '4.2' : '3.1'}
                  fill={markerColorMode === 'series' ? series.color : markerFill(point.state)}
                  stroke="#101419"
                  strokeWidth="1.2"
                  vectorEffect="non-scaling-stroke"
                />
              </g>
            );
          }))}
        </g>

        <text x={LEFT} y={15} fill="#9aa6ae" fontSize="10">{yLabel}</text>
        <text x={WIDTH - RIGHT} y={HEIGHT - 4} textAnchor="end" fill="#9aa6ae" fontSize="10">{xLabel}</text>
      </svg>
      {model.series.length > 1 && (
        <div className="batch-trend-plot__legend" aria-label="图例">
          {model.series.map((series) => (
            <span key={series.label}>
              <i aria-hidden="true" style={{ background: series.color }} />
              {series.label}
            </span>
          ))}
        </div>
      )}
    </section>
  );
});
