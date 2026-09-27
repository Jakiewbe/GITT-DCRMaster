import type {
  CanonicalRowV1,
  GittRestEndSensitivityAuditV1,
  RestEndSensitivityAuditV1,
} from '../contracts';
import { aggregateUniqueTicks, nanosecondsToSeconds } from './aggregation';
import { theilSenRegression } from '../math/statistics';
import { GITT_QC_POLICY_V1 as POLICY } from './policy';

export type RestEndSensitivityWindow = 'current' | '15min' | '5min';

const FIXED_WINDOW_S: Record<Exclude<RestEndSensitivityWindow, 'current'>, number> = {
  '15min': 900,
  '5min': 300,
};

function finite(value: number | null | undefined): value is number {
  return value !== null && value !== undefined && Number.isFinite(value);
}

function physicalElapsedNs(row: CanonicalRowV1): bigint {
  return row.elapsedTimeTicks * row.timeResolutionNs;
}

function rawLastPointVoltageV(rows: CanonicalRowV1[]): number | null {
  const ordered = [...rows].sort((left, right) => {
    const leftNs = physicalElapsedNs(left);
    const rightNs = physicalElapsedNs(right);
    if (leftNs !== rightNs) return leftNs < rightNs ? -1 : 1;
    if (left.recordSequence !== right.recordSequence) {
      return left.recordSequence < right.recordSequence ? -1 : 1;
    }
    return left.rowId.localeCompare(right.rowId);
  });
  const last = ordered.at(-1);
  return last && finite(last.voltageV) ? last.voltageV : null;
}

function requestedWindowS(
  durationS: number,
  window: RestEndSensitivityWindow,
): number {
  if (window === 'current') {
    return Math.max(POLICY.restTail.minimumWindowS, durationS * POLICY.restTail.windowFraction);
  }
  return FIXED_WINDOW_S[window];
}

function difference(left: number | null, right: number | null): number | null {
  return finite(left) && finite(right) ? left - right : null;
}

function robustSpread(values: Array<number | null>): number | null {
  const finiteValues = values.filter((value): value is number => finite(value));
  return finiteValues.length >= 2 ? Math.max(...finiteValues) - Math.min(...finiteValues) : null;
}

/**
 * Estimates a Rest endpoint using the same physical-tick aggregation and
 * Theil–Sen regression as the formal estimator, changing only the tail window.
 */
export function estimateRestEndForWindow(
  rows: CanonicalRowV1[],
  window: RestEndSensitivityWindow,
): number | null {
  const aggregated = aggregateUniqueTicks(rows);
  if (aggregated.length === 0) return null;

  const stepIds = new Set(aggregated.map((point) => point.analysisStepId));
  if (stepIds.size !== 1) return null;

  const firstNs = aggregated[0].elapsedTimeNs;
  const lastNs = aggregated[aggregated.length - 1].elapsedTimeNs;
  const durationS = Math.max(0, nanosecondsToSeconds(lastNs - firstNs));
  const effectiveTailS = Math.min(durationS, requestedWindowS(durationS, window));
  const tailStartNs = lastNs - BigInt(Math.round(effectiveTailS * 1_000_000_000));
  const tail = aggregated.filter((point) => point.elapsedTimeNs >= tailStartNs);
  if (tail.length < POLICY.restTail.minimumRegressionTickCount) return null;

  const voltages = tail.map((point) => point.voltageV);
  if (voltages.some((value) => !finite(value))) return null;
  const x = tail.map((point) => nanosecondsToSeconds(point.elapsedTimeNs - tail[0].elapsedTimeNs));
  const regression = theilSenRegression(x, voltages);
  if (!regression) return null;

  const endpoint = regression.intercept + regression.slope * x[x.length - 1];
  return finite(endpoint) ? endpoint : null;
}

export function analyzeRestEndSensitivity(
  rows: CanonicalRowV1[],
): RestEndSensitivityAuditV1 {
  const aggregated = aggregateUniqueTicks(rows);
  const durationS = aggregated.length >= 2
    ? Math.max(0, nanosecondsToSeconds(aggregated.at(-1)!.elapsedTimeNs - aggregated[0].elapsedTimeNs))
    : null;
  const currentWindowS = durationS === null
    ? null
    : Math.min(durationS, requestedWindowS(durationS, 'current'));
  const currentV = estimateRestEndForWindow(rows, 'current');
  const fifteenMinV = estimateRestEndForWindow(rows, '15min');
  const fiveMinV = estimateRestEndForWindow(rows, '5min');
  const rawLastV = rawLastPointVoltageV(rows);

  return {
    restEndCurrentWindowS: currentWindowS,
    restEndCurrentWindowV: currentV,
    restEnd15minV: fifteenMinV,
    restEnd5minV: fiveMinV,
    restEndRawLastPointV: rawLastV,
    restEndCurrentVs15minV: difference(currentV, fifteenMinV),
    restEnd15minVs5minV: difference(fifteenMinV, fiveMinV),
    restEndCurrentVs5minV: difference(currentV, fiveMinV),
    restEnd5minVsRawV: difference(fiveMinV, rawLastV),
    restEndRobustSpreadV: robustSpread([currentV, fifteenMinV, fiveMinV]),
  };
}

function deltaEs(preV: number | null, postV: number | null): number | null {
  return finite(preV) && finite(postV) ? postV - preV : null;
}

function log10Ratio(value: number | null, reference: number | null): number | null {
  return finite(value) && value > 0 && finite(reference) && reference > 0
    ? Math.log10(value / reference)
    : null;
}

export function buildRestEndSensitivityAudit(args: {
  preRest: CanonicalRowV1[];
  postRest: CanonicalRowV1[];
  lengthCm: number | null;
  pulseDurationS: number | null;
  deltaEtV: number | null;
  calculateD: (
    lengthCm: number | null,
    pulseDurationS: number | null,
    deltaEsV: number | null,
    deltaEtV: number | null,
  ) => number | null;
}): GittRestEndSensitivityAuditV1 {
  const preRest = analyzeRestEndSensitivity(args.preRest);
  const postRest = analyzeRestEndSensitivity(args.postRest);
  const deltaEsCurrentV = deltaEs(preRest.restEndCurrentWindowV, postRest.restEndCurrentWindowV);
  const deltaEs15minV = deltaEs(preRest.restEnd15minV, postRest.restEnd15minV);
  const deltaEs5minV = deltaEs(preRest.restEnd5minV, postRest.restEnd5minV);
  const dCurrentCm2PerS = args.calculateD(args.lengthCm, args.pulseDurationS, deltaEsCurrentV, args.deltaEtV);
  const d15minCm2PerS = args.calculateD(args.lengthCm, args.pulseDurationS, deltaEs15minV, args.deltaEtV);
  const d5minCm2PerS = args.calculateD(args.lengthCm, args.pulseDurationS, deltaEs5minV, args.deltaEtV);

  return {
    preRest,
    postRest,
    deltaEsCurrentV,
    deltaEs15minV,
    deltaEs5minV,
    dCurrentCm2PerS,
    d15minCm2PerS,
    d5minCm2PerS,
    log10DCurrentVs15min: log10Ratio(dCurrentCm2PerS, d15minCm2PerS),
    log10D15minVs5min: log10Ratio(d15minCm2PerS, d5minCm2PerS),
    log10DCurrentVs5min: log10Ratio(dCurrentCm2PerS, d5minCm2PerS),
  };
}
