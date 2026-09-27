import type { CanonicalRowV1 } from '../science/contracts';
import type { DcrBatchEventV1 } from '../product/dcr';
import type { ReportRowV1 } from './reportExport';

/** The four comparison times requested for the DCR figure. */
export const DCR_PLOT_TIME_MINUTES_V1 = [50, 150, 250, 350] as const;

export type DcrDirectPlotSourceV1 = {
  sourceId: string;
  fileName: string;
  canonicalRows: readonly CanonicalRowV1[];
  events: readonly DcrBatchEventV1[];
};

export type DcrDirectPlotRowsV1 = {
  timeVoltage: ReportRowV1[];
  timeDcr: ReportRowV1[];
};

type WidePairV1 = {
  xHeader: string;
  yHeader: string;
  xValues: Array<number | null>;
  yValues: Array<number | null>;
};

function uniqueSamplePrefix(
  fileName: string,
  sourceId: string,
  seen: Map<string, number>,
): string {
  const base = fileName.trim() || sourceId.trim() || 'sample';
  const count = (seen.get(base) ?? 0) + 1;
  seen.set(base, count);
  return count === 1 ? base : `${base} [${count}]`;
}

function wideRows(pairs: readonly WidePairV1[]): ReportRowV1[] {
  const rowCount = pairs.reduce(
    (maximum, pair) => Math.max(maximum, pair.xValues.length, pair.yValues.length),
    0,
  );
  return Array.from({ length: rowCount }, (_, rowIndex) => {
    const row: ReportRowV1 = {};
    for (const pair of pairs) {
      row[pair.xHeader] = pair.xValues[rowIndex] ?? null;
      row[pair.yHeader] = pair.yValues[rowIndex] ?? null;
    }
    return row;
  });
}

function orderedVoltageRows(rows: readonly CanonicalRowV1[]): CanonicalRowV1[] {
  return rows
    .map((row, index) => ({ row, index }))
    .filter(({ row }) => Number.isFinite(row.elapsedTimeS) && Number.isFinite(row.voltageV))
    .sort((left, right) => left.row.elapsedTimeS - right.row.elapsedTimeS || left.index - right.index)
    .map(({ row }) => row);
}

function terminalDcr(event: DcrBatchEventV1): number | null {
  const point = event.points.find((candidate) => candidate.key === 'terminal');
  return point?.reportedResistanceOhm ?? null;
}

/**
 * Builds the two DCR datasets used directly by plotting software.
 *
 * Time–voltage keeps every finite canonical trace point and rounds elapsed
 * time to integer minutes for the requested figure axis. Time–DCR uses the
 * first four chronological DCR events at the fixed 50/150/250/350 min
 * positions. Scientific DCR values are read from the existing terminal point;
 * this function does not calculate, filter, or replace them.
 */
export function buildDirectDcrPlotRowsV1(
  sources: readonly DcrDirectPlotSourceV1[],
): DcrDirectPlotRowsV1 {
  const timeVoltagePairs: WidePairV1[] = [];
  const timeDcrPairs: WidePairV1[] = [];
  const seenSampleNames = new Map<string, number>();

  for (const source of sources) {
    const samplePrefix = uniqueSamplePrefix(source.fileName, source.sourceId, seenSampleNames);
    const voltageRows = orderedVoltageRows(source.canonicalRows);
    if (voltageRows.length > 0) {
      timeVoltagePairs.push({
        xHeader: `${samplePrefix} | Time / min`,
        yHeader: `${samplePrefix} | Voltage / V`,
        xValues: voltageRows.map((row) => Math.round(row.elapsedTimeS / 60)),
        yValues: voltageRows.map((row) => row.voltageV),
      });
    }

    const events = source.events.slice(0, DCR_PLOT_TIME_MINUTES_V1.length);
    timeDcrPairs.push({
      xHeader: `${samplePrefix} | Time / min`,
      yHeader: `${samplePrefix} | DCR / Ω`,
      xValues: [...DCR_PLOT_TIME_MINUTES_V1],
      yValues: DCR_PLOT_TIME_MINUTES_V1.map((_, index) => {
        const value = events[index] === undefined ? null : terminalDcr(events[index]);
        return value !== null && Number.isFinite(value) ? value : null;
      }),
    });
  }

  return {
    timeVoltage: wideRows(timeVoltagePairs),
    timeDcr: wideRows(timeDcrPairs),
  };
}
