import type { GittPlotExportBundleV1 } from '../product/gitt/literaturePlotModel';
import type { ReportRowV1 } from './reportExport';

export type GittDirectPlotSourceV1 = {
  sourceId: string;
  fileName: string;
  bundle: GittPlotExportBundleV1;
  /** Pulse ids that are allowed in the formal median-voltage–D_Li plot. */
  eligibleMedianPulseIds: ReadonlySet<string>;
};

export type GittDirectPlotRowsV1 = {
  timeVoltage: ReportRowV1[];
  pulseResponse: ReportRowV1[];
  tauVoltage: ReportRowV1[];
  medianDli: ReportRowV1[];
  medianDliCommon: ReportRowV1[];
  commonVoltageWindow: GittCommonVoltageWindowV1;
};

export type GittCommonVoltageWindowV1 = {
  minV: number | null;
  maxV: number | null;
  sampleCount: number;
  status: 'available' | 'no_eligible_data' | 'no_overlap';
};

type WidePairV1 = {
  xHeader: string;
  yHeader: string;
  xValues: Array<number | null>;
  yValues: Array<number | null>;
};

function compareNullableNumber(left: number | null, right: number | null): number {
  if (left === null && right === null) return 0;
  if (left === null) return 1;
  if (right === null) return -1;
  return left - right;
}

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

function eligibleMedianRows(source: GittDirectPlotSourceV1) {
  return source.bundle.whVoltageRows
    .filter((row) => source.eligibleMedianPulseIds.has(row.pulseId))
    .filter((row) => Number.isFinite(row.medianVoltageV) && Number.isFinite(row.whEndpointResultCm2PerS) && (row.whEndpointResultCm2PerS as number) > 0)
    .sort((left, right) =>
      compareNullableNumber(left.pulseOrder, right.pulseOrder) || left.pulseId.localeCompare(right.pulseId),
    );
}

/**
 * Creates three spreadsheet datasets whose independent curves are adjacent
 * X/Y column pairs. This keeps each sample directly plottable in Excel/Origin
 * without requiring a file/series column. τ pulses use null rows inside the
 * sample pair so a chart does not connect the end of one pulse to the next.
 *
 * Time–voltage uses the complete sample trace. Pulse response uses the
 * complete pre-rest → pulse → post-rest traces, with null rows between
 * pulses. τ–voltage uses the raw points already prepared by the science
 * model, with null rows between pulses.
 * Median-voltage–D_Li uses only formal eligible endpoint points.
 */
export function buildDirectGittPlotRowsV1(
  sources: readonly GittDirectPlotSourceV1[],
): GittDirectPlotRowsV1 {
  const timePairs: WidePairV1[] = [];
  const pulseResponsePairs: WidePairV1[] = [];
  const tauPairs: WidePairV1[] = [];
  const medianPairs: WidePairV1[] = [];
  const commonMedianPairs: WidePairV1[] = [];
  const seenSampleNames = new Map<string, number>();
  const eligibleMedianBySource = sources.map((source) => ({
    source,
    rows: eligibleMedianRows(source),
  }));
  const sampleRanges = eligibleMedianBySource
    .map(({ rows }) => rows.map((row) => row.medianVoltageV as number))
    .filter((values) => values.length > 0)
    .map((values) => ({ minV: Math.min(...values), maxV: Math.max(...values) }));
  const hasSampleWithoutEligibleData = eligibleMedianBySource.some(({ rows }) => rows.length === 0);
  const commonVoltageWindow: GittCommonVoltageWindowV1 = sampleRanges.length === 0 || hasSampleWithoutEligibleData
    ? { minV: null, maxV: null, sampleCount: sampleRanges.length, status: 'no_eligible_data' }
    : (() => {
      const minV = Math.max(...sampleRanges.map((range) => range.minV));
      const maxV = Math.min(...sampleRanges.map((range) => range.maxV));
      return minV <= maxV
        ? { minV, maxV, sampleCount: sampleRanges.length, status: 'available' as const }
        : { minV, maxV, sampleCount: sampleRanges.length, status: 'no_overlap' as const };
    })();

  for (const { source, rows: eligibleRows } of eligibleMedianBySource) {
    const samplePrefix = uniqueSamplePrefix(source.fileName, source.sourceId, seenSampleNames);

    const orderedTimeRows = [...source.bundle.fullTraceRows]
      .sort((left, right) => left.timeMinutes - right.timeMinutes);
    if (orderedTimeRows.length > 0) {
      timePairs.push({
        xHeader: `${samplePrefix} | Time / min`,
        yHeader: `${samplePrefix} | Voltage / V`,
        xValues: orderedTimeRows.map((row) => row.timeMinutes),
        yValues: orderedTimeRows.map((row) => row.voltageV),
      });
    }

    const responseGroups = new Map<string, typeof source.bundle.pulseResponseRows>();
    for (const row of source.bundle.pulseResponseRows) {
      const group = responseGroups.get(row.pulseId);
      if (group) group.push(row);
      else responseGroups.set(row.pulseId, [row]);
    }
    const orderedResponseGroups = [...responseGroups.entries()].sort(([leftId, leftRows], [rightId, rightRows]) =>
      compareNullableNumber(leftRows[0]?.pulseOrder ?? null, rightRows[0]?.pulseOrder ?? null) ||
      leftId.localeCompare(rightId),
    );
    const responseTimes: Array<number | null> = [];
    const responseVoltages: Array<number | null> = [];
    orderedResponseGroups.forEach(([, rows], groupIndex) => {
      const orderedRows = [...rows].sort((left, right) => left.timeMinutes - right.timeMinutes);
      responseTimes.push(...orderedRows.map((row) => row.timeMinutes));
      responseVoltages.push(...orderedRows.map((row) => row.voltageV));
      if (groupIndex < orderedResponseGroups.length - 1) {
        responseTimes.push(null);
        responseVoltages.push(null);
      }
    });
    if (responseTimes.length > 0) {
      pulseResponsePairs.push({
        xHeader: `${samplePrefix} | Time / min`,
        yHeader: `${samplePrefix} | Voltage / V`,
        xValues: responseTimes,
        yValues: responseVoltages,
      });
    }

    const tauGroups = new Map<string, typeof source.bundle.tauVoltageRows>();
    for (const row of source.bundle.tauVoltageRows) {
      const group = tauGroups.get(row.pulseId);
      if (group) group.push(row);
      else tauGroups.set(row.pulseId, [row]);
    }
    const orderedTauGroups = [...tauGroups.entries()].sort(([leftId, leftRows], [rightId, rightRows]) =>
      compareNullableNumber(leftRows[0]?.pulseOrder ?? null, rightRows[0]?.pulseOrder ?? null) ||
      leftId.localeCompare(rightId),
    );
    const tauTimes: Array<number | null> = [];
    const tauVoltages: Array<number | null> = [];
    orderedTauGroups.forEach(([, rows], groupIndex) => {
      const orderedRows = [...rows].sort((left, right) => left.sqrtTauSqrtS - right.sqrtTauSqrtS);
      tauTimes.push(...orderedRows.map((row) => row.sqrtTauSqrtS));
      tauVoltages.push(...orderedRows.map((row) => row.voltageV));
      if (groupIndex < orderedTauGroups.length - 1) {
        tauTimes.push(null);
        tauVoltages.push(null);
      }
    });
    if (tauTimes.length > 0) {
      tauPairs.push({
        xHeader: `${samplePrefix} | τ¹ᐟ² / s¹ᐟ²`,
        yHeader: `${samplePrefix} | Voltage / V`,
        xValues: tauTimes,
        yValues: tauVoltages,
      });
    }

    if (eligibleRows.length > 0) {
      medianPairs.push({
        xHeader: `${samplePrefix} | Median voltage / V`,
        yHeader: `${samplePrefix} | D_Li / cm²·s^-1`,
        xValues: eligibleRows.map((row) => row.medianVoltageV as number),
        yValues: eligibleRows.map((row) => row.whEndpointResultCm2PerS as number),
      });
    }
    if (commonVoltageWindow.status === 'available') {
      const commonRows = eligibleRows.filter((row) =>
        (row.medianVoltageV as number) >= (commonVoltageWindow.minV as number) &&
        (row.medianVoltageV as number) <= (commonVoltageWindow.maxV as number),
      );
      if (commonRows.length > 0) {
        commonMedianPairs.push({
          xHeader: `${samplePrefix} | Median voltage / V`,
          yHeader: `${samplePrefix} | D_Li / cm²·s^-1`,
          xValues: commonRows.map((row) => row.medianVoltageV as number),
          yValues: commonRows.map((row) => row.whEndpointResultCm2PerS as number),
        });
      }
    }
  }

  return {
    timeVoltage: wideRows(timePairs),
    pulseResponse: wideRows(pulseResponsePairs),
    tauVoltage: wideRows(tauPairs),
    medianDli: wideRows(medianPairs),
    medianDliCommon: wideRows(commonMedianPairs),
    commonVoltageWindow,
  };
}
