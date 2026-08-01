import type { CanonicalRowV1, GittResultV1 } from '../../science/contracts';
import { aggregateUniqueTicks, buildPulseTimeline } from '../../science/gitt/aggregation';

export type GittVoltageTimePointV1 = {
  id: string;
  timeMinutes: number;
  voltageV: number;
};

export type GittPulseTimelinePointV1 = GittVoltageTimePointV1 & {
  segment: 'pre_rest' | 'pulse' | 'post_rest';
};

export type GittSqrtTimePointV1 = {
  id: string;
  timeS: number;
  sqrtTimeSqrtS: number;
  voltageV: number;
  inFitWindow: boolean;
};

export type GittPulsePlotModelV1 = {
  pulseId: string;
  pulseAnalysisStepId: string;
  timeline: GittPulseTimelinePointV1[];
  sqrtTimePoints: GittSqrtTimePointV1[];
  fitLine: {
    startSqrtTime: number;
    endSqrtTime: number;
    startVoltageV: number;
    endVoltageV: number;
  } | null;
  pulseStartMinutes: number;
  pulseEndMinutes: number;
  preRestEndPotentialV: number | null;
  pulseStartVoltageV: number | null;
  pulseBaselineExtrapolatedV: number | null;
  pulseEndVoltageV: number | null;
  postRestEndPotentialV: number | null;
};

export type GittPlotExportBundleV1 = {
  fullTraceRows: Array<{
    rowId: string;
    timeMinutes: number;
    voltageV: number;
    currentA: number;
    analysisStepId: string;
    stepType: CanonicalRowV1['canonicalStepType'];
  }>;
  pulseResponseRows: Array<{
    pulseId: string;
    pulseOrder: number | null;
    segment: GittPulseTimelinePointV1['segment'];
    timeMinutes: number;
    voltageV: number;
  }>;
  sqrtFitRows: Array<{
    pulseId: string;
    pulseOrder: number | null;
    timeS: number;
    sqrtTimeSqrtS: number;
    voltageV: number;
    inAutomaticFitWindow: boolean;
    fitSlopeVPerSqrtS: number | null;
    fitInterceptV: number | null;
    fitRSquared: number | null;
  }>;
  whVoltageRows: Array<{
    pulseId: string;
    pulseOrder: number | null;
    postRestEndPotentialV: number | null;
    whEndpointResultCm2PerS: number | null;
    deltaEtV: number | null;
    deltaEsV: number | null;
    pulseDurationS: number | null;
  }>;
};

function physicalTimeNs(row: CanonicalRowV1): bigint {
  return row.elapsedTimeTicks * row.timeResolutionNs;
}

function compareRows(left: CanonicalRowV1, right: CanonicalRowV1): number {
  const leftNs = physicalTimeNs(left);
  const rightNs = physicalTimeNs(right);
  if (leftNs !== rightNs) return leftNs < rightNs ? -1 : 1;
  if (left.recordSequence !== right.recordSequence) {
    return left.recordSequence < right.recordSequence ? -1 : 1;
  }
  return left.rowId.localeCompare(right.rowId);
}

function pulseStepId(pulseId: string): string | null {
  const marker = ':gitt:';
  const index = pulseId.lastIndexOf(marker);
  return index < 0 ? null : pulseId.slice(index + marker.length);
}

function selectExtremaPreservingRows(
  rows: readonly CanonicalRowV1[],
  maximumPoints: number,
): CanonicalRowV1[] {
  const ordered = [...rows].sort(compareRows);
  if (ordered.length <= maximumPoints) return ordered;
  const bucketSize = Math.max(1, Math.ceil(ordered.length / Math.max(1, maximumPoints / 4)));
  const selected: CanonicalRowV1[] = [];
  for (let start = 0; start < ordered.length; start += bucketSize) {
    const bucket = ordered.slice(start, Math.min(ordered.length, start + bucketSize));
    const minimum = bucket.reduce((candidate, row) => row.voltageV < candidate.voltageV ? row : candidate);
    const maximum = bucket.reduce((candidate, row) => row.voltageV > candidate.voltageV ? row : candidate);
    for (const row of [bucket[0], minimum, maximum, bucket[bucket.length - 1]].sort(compareRows)) {
      if (selected.at(-1)?.rowId !== row.rowId) selected.push(row);
    }
  }
  return selected;
}

export function buildGittOverviewVoltagePointsV1(
  rows: readonly CanonicalRowV1[],
  maximumPoints = 900,
): GittVoltageTimePointV1[] {
  const selected = selectExtremaPreservingRows(rows, maximumPoints);
  if (selected.length === 0) return [];
  const originNs = physicalTimeNs(selected[0]);
  return selected.map((row) => ({
    id: row.rowId,
    timeMinutes: Number(physicalTimeNs(row) - originNs) / 60_000_000_000,
    voltageV: row.voltageV,
  }));
}

function orderedStepGroups(rows: readonly CanonicalRowV1[]): CanonicalRowV1[][] {
  const ordered = [...rows].sort(compareRows);
  const groups = new Map<string, CanonicalRowV1[]>();
  for (const row of ordered) {
    const current = groups.get(row.analysisStepId);
    if (current) current.push(row);
    else groups.set(row.analysisStepId, [row]);
  }
  return [...groups.values()].sort((left, right) => compareRows(left[0], right[0]));
}

export function buildGittPulsePlotModelV1(
  rows: readonly CanonicalRowV1[],
  result: GittResultV1,
): GittPulsePlotModelV1 | null {
  const requestedStepId = pulseStepId(result.pulseId);
  if (requestedStepId === null) return null;
  const groups = orderedStepGroups(rows);
  const pulseIndex = groups.findIndex((group) => group[0]?.analysisStepId === requestedStepId);
  if (pulseIndex < 0) return null;
  const pulseRows = groups[pulseIndex];
  const preRestRows = groups[pulseIndex - 1]?.[0]?.canonicalStepType === 'rest'
    ? groups[pulseIndex - 1]
    : [];
  const postRestRows = groups[pulseIndex + 1]?.[0]?.canonicalStepType === 'rest'
    ? groups[pulseIndex + 1]
    : [];
  const combined = [
    ...preRestRows.map((row) => ({ row, segment: 'pre_rest' as const })),
    ...pulseRows.map((row) => ({ row, segment: 'pulse' as const })),
    ...postRestRows.map((row) => ({ row, segment: 'post_rest' as const })),
  ];
  if (combined.length === 0) return null;
  const originNs = physicalTimeNs(combined[0].row);
  const selectedTimelineRows = combined.length <= 1_200
    ? combined.map((item) => item.row)
    : [
      ...selectExtremaPreservingRows(preRestRows, 480),
      ...selectExtremaPreservingRows(pulseRows, 240),
      ...selectExtremaPreservingRows(postRestRows, 480),
    ];
  const segmentByRowId = new Map(combined.map((item) => [item.row.rowId, item.segment]));
  const timeline = selectedTimelineRows.map((row) => ({
    id: row.rowId,
    timeMinutes: Number(physicalTimeNs(row) - originNs) / 60_000_000_000,
    voltageV: row.voltageV,
    segment: segmentByRowId.get(row.rowId) ?? 'pulse',
  }));
  const pulseTimeline = buildPulseTimeline(aggregateUniqueTicks(pulseRows));
  const fittedRowIds = new Set(result.fitDiagnostics.fitContributingRowIds);
  const sqrtTimePoints = pulseTimeline.map((point) => ({
    id: point.contributingRowIds.join('|'),
    timeS: point.timeS,
    sqrtTimeSqrtS: Math.sqrt(Math.max(0, point.timeS)),
    voltageV: point.voltageV,
    inFitWindow: point.contributingRowIds.some((rowId) => fittedRowIds.has(rowId)),
  }));
  const fitWindow = result.fitDiagnostics.actualFitWindow;
  const slope = result.fitDiagnostics.slopeVPerSqrtS;
  const intercept = result.fitDiagnostics.interceptV;
  const fitLine = fitWindow !== null && slope !== null && intercept !== null
    ? {
      startSqrtTime: Math.sqrt(Math.max(0, fitWindow.startS)),
      endSqrtTime: Math.sqrt(Math.max(0, fitWindow.endS)),
      startVoltageV: intercept + slope * Math.sqrt(Math.max(0, fitWindow.startS)),
      endVoltageV: intercept + slope * Math.sqrt(Math.max(0, fitWindow.endS)),
    }
    : null;
  const pulseStartNs = physicalTimeNs(pulseRows[0]);
  const pulseEndNs = physicalTimeNs(pulseRows[pulseRows.length - 1]);

  return {
    pulseId: result.pulseId,
    pulseAnalysisStepId: requestedStepId,
    timeline,
    sqrtTimePoints,
    fitLine,
    pulseStartMinutes: Number(pulseStartNs - originNs) / 60_000_000_000,
    pulseEndMinutes: Number(pulseEndNs - originNs) / 60_000_000_000,
    preRestEndPotentialV: result.preRestEndPotentialV,
    pulseStartVoltageV: result.pulseStartVoltageV,
    pulseBaselineExtrapolatedV: result.pulseBaselineExtrapolatedV,
    pulseEndVoltageV: result.pulseEndVoltageV,
    postRestEndPotentialV: result.postRestEndPotentialV,
  };
}

export function buildGittPlotExportBundleV1(
  rows: readonly CanonicalRowV1[],
  results: readonly GittResultV1[],
  pulseOrderById: ReadonlyMap<string, number> = new Map(),
): GittPlotExportBundleV1 {
  const ordered = [...rows].sort(compareRows);
  const originNs = ordered.length > 0 ? physicalTimeNs(ordered[0]) : 0n;
  const fullTraceRows = ordered.map((row) => ({
    rowId: row.rowId,
    timeMinutes: Number(physicalTimeNs(row) - originNs) / 60_000_000_000,
    voltageV: row.voltageV,
    currentA: row.currentA,
    analysisStepId: row.analysisStepId,
    stepType: row.canonicalStepType,
  }));
  const pulseResponseRows: GittPlotExportBundleV1['pulseResponseRows'] = [];
  const sqrtFitRows: GittPlotExportBundleV1['sqrtFitRows'] = [];
  const whVoltageRows: GittPlotExportBundleV1['whVoltageRows'] = [];

  for (const result of results) {
    const pulseOrder = pulseOrderById.get(result.pulseId) ?? null;
    const model = buildGittPulsePlotModelV1(rows, result);
    if (model !== null) {
      for (const point of model.timeline) {
        pulseResponseRows.push({
          pulseId: result.pulseId,
          pulseOrder,
          segment: point.segment,
          timeMinutes: point.timeMinutes,
          voltageV: point.voltageV,
        });
      }
      for (const point of model.sqrtTimePoints) {
        sqrtFitRows.push({
          pulseId: result.pulseId,
          pulseOrder,
          timeS: point.timeS,
          sqrtTimeSqrtS: point.sqrtTimeSqrtS,
          voltageV: point.voltageV,
          inAutomaticFitWindow: point.inFitWindow,
          fitSlopeVPerSqrtS: result.fitDiagnostics.slopeVPerSqrtS,
          fitInterceptV: result.fitDiagnostics.interceptV,
          fitRSquared: result.fitDiagnostics.rSquared,
        });
      }
    }
    whVoltageRows.push({
      pulseId: result.pulseId,
      pulseOrder,
      postRestEndPotentialV: result.postRestEndPotentialV,
      whEndpointResultCm2PerS: result.metricValueCm2PerS,
      deltaEtV: result.deltaEtV,
      deltaEsV: result.deltaEsV,
      pulseDurationS: result.pulseDurationS,
    });
  }

  return { fullTraceRows, pulseResponseRows, sqrtFitRows, whVoltageRows };
}
