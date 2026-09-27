import type { CanonicalRowV1, GittResultV1 } from '../../science/contracts';
import type { NewareGitt1200sProfileResultV1 } from '../../adapters/neware/gitt1200sProfile';
import type { CfxLiterature1200sGittProfileResultV1 } from '../cfx/literature1200sGittProfile';
import { aggregateUniqueTicks, buildPulseTimeline } from '../../science/gitt/aggregation';
import {
  CFX_10S_GITT_REGRESSION_WINDOW,
  selectRegressionPoints,
} from '../../science/gitt/fit';

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

export type GittTauVoltagePointV1 = {
  id: string;
  tauS: number;
  voltageV: number;
};

export type GittPulsePlotModelV1 = {
  pulseId: string;
  pulseAnalysisStepId: string;
  timeline: GittPulseTimelinePointV1[];
  sqrtTimePoints: GittSqrtTimePointV1[];
  tauVoltagePoints: GittTauVoltagePointV1[];
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
  tauVoltageRows: Array<{
    pulseId: string;
    pulseOrder: number | null;
    sqrtTauSqrtS: number;
    voltageV: number;
  }>;
  sqrtFitRows: Array<{
    pulseId: string;
    pulseOrder: number | null;
    timeS: number;
    sqrtTimeSqrtS: number;
    voltageV: number;
    inAutomaticFitWindow: boolean;
    usedByLegacyFirst5: boolean;
    usedByCfx10s: boolean;
    usedByCfx4To25: boolean;
    usedByCfx1To64: boolean;
    usedByManual: boolean;
    fitSlopeVPerSqrtS: number | null;
    fitInterceptV: number | null;
    fitRSquared: number | null;
  }>;
  regressionWindowRows: Array<{
    pulseId: string;
    pulseOrder: number | null;
    windowId: string;
    windowLabel: string;
    requestedStartS: number | null;
    requestedEndS: number | null;
    actualStartS: number | null;
    actualEndS: number | null;
    pointCount: number;
    uniqueTimePointCount: number;
    fitDurationS: number | null;
    fitEndFractionOfPulse: number | null;
    slopeVPerSqrtS: number | null;
    interceptV: number | null;
    rSquared: number | null;
    rmseV: number | null;
    slopeStdError: number | null;
    curvatureMetric: number | null;
    maxNormalizedResidual: number | null;
    monotonicityRatio: number | null;
    durbinWatson: number | null;
    metricValueCm2PerS: number | null;
    windowCoverageIncomplete: boolean;
    samplingCoverage: string;
    linearityClass: string;
    status: string;
    warnings: string;
  }>;
  whVoltageRows: Array<{
    pulseId: string;
    pulseOrder: number | null;
    medianVoltageV: number | null;
    postRestEndPotentialV: number | null;
    whEndpointResultCm2PerS: number | null;
    regressionCandidateResultCm2PerS: number | null;
    legacyFirst5ResultCm2PerS: number | null;
    cfx10sResultCm2PerS: number | null;
    cfx4To25ResultCm2PerS: number | null;
    cfx1To64ResultCm2PerS: number | null;
    manualResultCm2PerS: number | null;
    pulseT0VoltageV: number | null;
    pulseT0CurrentA: number | null;
    endpointStartTimeS: number | null;
    firstPositivePulseTimeS: number | null;
    firstPositivePulseVoltageV: number | null;
    pulseStartVoltageV: number | null;
    pulseEndVoltageV: number | null;
    regressionLog10DRange: number | null;
    windowStabilityDecades: number | null;
    methodDivergenceDecades: number | null;
    absMethodDivergenceDecades: number | null;
    endpointStartTemporalResolutionS: number | null;
    initialObservedDropV: number | null;
    primaryEndpointQcStatus: string;
    primaryComparisonEligibility: string;
    cfx10SlopeQcStatus: string;
    primaryEndpointQcReasons: string;
    cfx10SlopeQcReasons: string;
    deltaEtV: number | null;
    deltaEsV: number | null;
    preRestLastRawVoltageV: number | null;
    postRestLastRawVoltageV: number | null;
    deltaEsRawV: number | null;
    restEstimatorDifferencePreV: number | null;
    restEstimatorDifferencePostV: number | null;
    legacyFirstPositiveDeltaEtV: number | null;
    legacyFirstPositiveEndpointMetricValueCm2PerS: number | null;
    deltaEtDefinitionDifferenceV: number | null;
    endpointDRatioVsLegacy: number | null;
    pulseDurationS: number | null;
  }>;
};

function finite(value: number | null): value is number {
  return value !== null && Number.isFinite(value);
}

/**
 * The WH endpoint expression squares ΔEs/ΔEt. A direction mismatch must not
 * enter the comparison plot just because that square remains finite; the
 * underlying endpoint event is scientifically inconsistent.
 */
export function isWhVoltageMetricPointEligible(
  result: Pick<GittResultV1, 'metricValueCm2PerS' | 'medianVoltageV' | 'deltaEtV' | 'deltaEsV'>,
): boolean {
  return finite(result.metricValueCm2PerS) &&
    result.metricValueCm2PerS > 0 &&
    finite(result.medianVoltageV) &&
    finite(result.deltaEtV) &&
    result.deltaEtV !== 0 &&
    finite(result.deltaEsV) &&
    result.deltaEsV !== 0 &&
    Math.sign(result.deltaEtV) === Math.sign(result.deltaEsV);
}

/** Main D_app–median-voltage plots consume the product-level display policy. */
export function isCfxDisplayComparisonPointEligible(
  pulse: { displayComparisonEligibility: string } | null | undefined,
): boolean {
  return pulse?.displayComparisonEligibility === 'included';
}

export function visibleGittOverviewEntryIds(
  entryIds: readonly string[],
  selectedEntryId: string | null,
  showAllFiles: boolean,
): string[] {
  if (showAllFiles) return [...entryIds];
  return selectedEntryId === null ? [] : entryIds.filter((entryId) => entryId === selectedEntryId);
}

/**
 * The display trace follows the post-processing comparison target rather than
 * the controller's terminal Stop_Volt. A pulse at or above the target and all
 * of its rest trace remain visible; the first pulse below the target is the
 * inclusive boundary. Stop_Volt remains available through the event profile
 * for audit/classification and is not used as a global trace truncation.
 */
export function rowsThroughCfxMedianVoltageFloor(
  rows: readonly CanonicalRowV1[],
  program: Pick<NewareGitt1200sProfileResultV1, 'allEvents'> | null | undefined,
  profile: Pick<CfxLiterature1200sGittProfileResultV1, 'profile' | 'pulses'> | null | undefined,
): CanonicalRowV1[] {
  if (profile === null || profile === undefined) return [...rows];
  const target = profile.profile.comparisonTargetMedianVoltageV;
  const firstBelowFloor = profile.pulses.find((pulse) =>
    Number.isFinite(pulse.medianVoltageV) &&
    (pulse.medianVoltageV as number) < target,
  );
  if (!firstBelowFloor) return [...rows];
  const boundaryEvent = program?.allEvents.find(
    (event) => event.sourcePulseId === firstBelowFloor.sourcePulseId,
  );
  if (!boundaryEvent) return [...rows];
  const endStepId = boundaryEvent.postRestAnalysisStepId ?? boundaryEvent.pulseAnalysisStepId;
  let lastIncludedIndex = -1;
  for (let index = 0; index < rows.length; index += 1) {
    if (rows[index]?.analysisStepId === endStepId) lastIncludedIndex = index;
  }
  return lastIncludedIndex >= 0 ? rows.slice(0, lastIncludedIndex + 1) : [...rows];
}

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
  const cfx10sWindow = result.regressionWindows.find((window) => window.windowId === 'cfx_10s') ?? null;
  const selectedCfx10sPoints = cfx10sWindow === null
    ? []
    : selectRegressionPoints(pulseTimeline, CFX_10S_GITT_REGRESSION_WINDOW).points;
  const fittedRowIds = new Set(
    cfx10sWindow === null
      ? result.fitDiagnostics.fitContributingRowIds
      : selectedCfx10sPoints.flatMap((point) => point.contributingRowIds),
  );
  const sqrtTimePoints = pulseTimeline.map((point) => ({
    id: point.contributingRowIds.join('|'),
    timeS: point.timeS,
    sqrtTimeSqrtS: Math.sqrt(Math.max(0, point.timeS)),
    voltageV: point.voltageV,
    inFitWindow: point.contributingRowIds.some((rowId) => fittedRowIds.has(rowId)),
  }));
  const tauVoltagePoints = pulseTimeline
    .filter((point) => point.timeS > 0)
    .map((point) => ({
      id: point.contributingRowIds.join('|'),
      tauS: point.timeS,
      voltageV: point.voltageV,
    }));
  const fitWindow = cfx10sWindow !== null && cfx10sWindow.actualStartS !== null && cfx10sWindow.actualEndS !== null
    ? { startS: cfx10sWindow.actualStartS, endS: cfx10sWindow.actualEndS }
    : result.fitDiagnostics.actualFitWindow;
  const slope = cfx10sWindow?.slopeVPerSqrtS ?? result.fitDiagnostics.slopeVPerSqrtS;
  const intercept = cfx10sWindow?.interceptV ?? result.fitDiagnostics.interceptV;
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
    tauVoltagePoints,
    fitLine,
    pulseStartMinutes: Number(pulseStartNs - originNs) / 60_000_000_000,
    pulseEndMinutes: Number(pulseEndNs - originNs) / 60_000_000_000,
    preRestEndPotentialV: result.preRestEndPotentialV,
    pulseStartVoltageV: result.pulseT0VoltageV,
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
  const tauVoltageRows: GittPlotExportBundleV1['tauVoltageRows'] = [];
  const sqrtFitRows: GittPlotExportBundleV1['sqrtFitRows'] = [];
  const regressionWindowRows: GittPlotExportBundleV1['regressionWindowRows'] = [];
  const whVoltageRows: GittPlotExportBundleV1['whVoltageRows'] = [];

  for (const result of results) {
    const pulseOrder = pulseOrderById.get(result.pulseId) ?? null;
    const model = buildGittPulsePlotModelV1(rows, result);
    const regressionWindows = result.regressionWindows ?? [];
    const pulseTimelineForRegression = model === null
      ? []
      : buildPulseTimeline(aggregateUniqueTicks(
        rows
          .filter((row) => row.analysisStepId === model.pulseAnalysisStepId)
          .filter((row) => row.canonicalStepType !== 'rest'),
      ));
    const legacyPoints = selectRegressionPoints(
      pulseTimelineForRegression,
      { kind: 'legacy_first_5', id: 'legacy_first_5', label: 'Legacy first 5 points' },
    ).points;
    const legacyRowIds = new Set(legacyPoints.flatMap((point) => point.contributingRowIds));
    const cfx10sRowIds = new Set(
      selectRegressionPoints(pulseTimelineForRegression, CFX_10S_GITT_REGRESSION_WINDOW)
        .points
        .flatMap((point) => point.contributingRowIds),
    );
    const usedByWindow = (point: GittSqrtTimePointV1, windowId: string): boolean => {
      const window = regressionWindows.find((candidate) => candidate.windowId === windowId);
      if (!window) return false;
      if (window.kind === 'legacy_first_5') {
        return point.id.split('|').some((rowId) => legacyRowIds.has(rowId));
      }
      if (windowId === 'cfx_10s') {
        return point.id.split('|').some((rowId) => cfx10sRowIds.has(rowId));
      }
      return finite(window.requestedStartS) && finite(window.requestedEndS) &&
        point.timeS >= window.requestedStartS && point.timeS <= window.requestedEndS;
    };
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
          usedByLegacyFirst5: usedByWindow(point, 'legacy_first_5'),
          usedByCfx10s: usedByWindow(point, 'cfx_10s'),
          usedByCfx4To25: usedByWindow(point, 'cfx_4_25s'),
          usedByCfx1To64: usedByWindow(point, 'cfx_1_64s'),
          usedByManual: usedByWindow(point, 'manual'),
          fitSlopeVPerSqrtS: result.fitDiagnostics.slopeVPerSqrtS,
          fitInterceptV: result.fitDiagnostics.interceptV,
          fitRSquared: result.fitDiagnostics.rSquared,
        });
      }
      for (const point of model.tauVoltagePoints) {
        tauVoltageRows.push({
          pulseId: result.pulseId,
          pulseOrder,
          sqrtTauSqrtS: Math.sqrt(point.tauS),
          voltageV: point.voltageV,
        });
      }
    }
    for (const window of regressionWindows) {
      regressionWindowRows.push({
        pulseId: result.pulseId,
        pulseOrder,
        windowId: window.windowId,
        windowLabel: window.windowLabel,
        requestedStartS: window.requestedStartS,
        requestedEndS: window.requestedEndS,
        actualStartS: window.actualStartS,
        actualEndS: window.actualEndS,
        pointCount: window.pointCount,
        uniqueTimePointCount: window.uniqueTimePointCount,
        fitDurationS: window.fitDurationS,
        fitEndFractionOfPulse: window.fitEndFractionOfPulse,
        slopeVPerSqrtS: window.slopeVPerSqrtS,
        interceptV: window.interceptV,
        rSquared: window.rSquared,
        rmseV: window.rmseV,
        slopeStdError: window.slopeStdError,
        curvatureMetric: window.curvatureMetric,
        maxNormalizedResidual: window.maxNormalizedResidual,
        monotonicityRatio: window.monotonicityRatio,
        durbinWatson: window.durbinWatson,
        metricValueCm2PerS: window.metricValueCm2PerS,
        windowCoverageIncomplete: window.windowCoverageIncomplete,
        samplingCoverage: window.samplingCoverage,
        linearityClass: window.linearityClass,
        status: window.status,
        warnings: window.warnings.join(' | '),
      });
    }
    const windowValue = (windowId: string) =>
      regressionWindows.find((window) => window.windowId === windowId)?.metricValueCm2PerS ?? null;
    whVoltageRows.push({
      pulseId: result.pulseId,
      pulseOrder,
      medianVoltageV: result.medianVoltageV,
      postRestEndPotentialV: result.postRestEndPotentialV,
      whEndpointResultCm2PerS: result.metricValueCm2PerS,
      regressionCandidateResultCm2PerS: result.regressionCandidateMetricValueCm2PerS,
      legacyFirst5ResultCm2PerS: windowValue('legacy_first_5'),
      cfx10sResultCm2PerS: windowValue('cfx_10s'),
      cfx4To25ResultCm2PerS: windowValue('cfx_4_25s'),
      cfx1To64ResultCm2PerS: windowValue('cfx_1_64s'),
      manualResultCm2PerS: windowValue('manual'),
      pulseT0VoltageV: result.pulseT0VoltageV,
      pulseT0CurrentA: result.pulseT0CurrentA,
      endpointStartTimeS: result.endpointStartTimeS,
      firstPositivePulseTimeS: result.firstPositivePulseTimeS,
      firstPositivePulseVoltageV: result.firstPositivePulseVoltageV,
      pulseStartVoltageV: result.pulseStartVoltageV,
      pulseEndVoltageV: result.pulseEndVoltageV,
      regressionLog10DRange: result.regressionWindowSensitivity?.log10DRange ?? null,
      windowStabilityDecades: result.windowStabilityDecades,
      methodDivergenceDecades: result.methodDivergenceDecades,
      absMethodDivergenceDecades: result.absMethodDivergenceDecades,
      endpointStartTemporalResolutionS: result.endpointStartTemporalResolutionS,
      initialObservedDropV: result.initialObservedDropV,
      primaryEndpointQcStatus: result.primaryEndpointQcStatus,
      primaryComparisonEligibility: result.primaryComparisonEligibility,
      cfx10SlopeQcStatus: result.cfx10SlopeQcStatus,
      primaryEndpointQcReasons: JSON.stringify(result.primaryEndpointQcReasons),
      cfx10SlopeQcReasons: JSON.stringify(result.cfx10SlopeQcReasons),
      deltaEtV: result.deltaEtV,
      deltaEsV: result.deltaEsV,
      preRestLastRawVoltageV: result.preRestLastRawVoltageV,
      postRestLastRawVoltageV: result.postRestLastRawVoltageV,
      deltaEsRawV: result.deltaEsRawV,
      restEstimatorDifferencePreV: result.restEstimatorDifferencePreV,
      restEstimatorDifferencePostV: result.restEstimatorDifferencePostV,
      legacyFirstPositiveDeltaEtV: result.legacyFirstPositiveDeltaEtV,
      legacyFirstPositiveEndpointMetricValueCm2PerS: result.legacyFirstPositiveEndpointMetricValueCm2PerS,
      deltaEtDefinitionDifferenceV: result.deltaEtDefinitionDifferenceV,
      endpointDRatioVsLegacy: result.endpointDRatioVsLegacy,
      pulseDurationS: result.pulseDurationS,
    });
  }

  return { fullTraceRows, pulseResponseRows, tauVoltageRows, sqrtFitRows, regressionWindowRows, whVoltageRows };
}
