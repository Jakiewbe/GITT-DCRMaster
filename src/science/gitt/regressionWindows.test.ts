import { describe, expect, it } from 'vitest';
import type { GittRegressionWindowSpecV1 } from '../contracts';
import type { TimedPulsePoint } from './aggregation';
import {
  CFX_10S_GITT_REGRESSION_WINDOW,
  DEFAULT_GITT_REGRESSION_WINDOWS,
  HIGH_RESOLUTION_GITT_REGRESSION_WINDOWS,
  evaluateRegressionWindow,
  selectRegressionPoints,
} from './fit';
import { calculateLog10DRange } from './regressionMetric';

function point(timeS: number, voltageV = 3 + 0.01 * Math.sqrt(timeS)): TimedPulsePoint {
  const ticks = BigInt(Math.round(timeS * 1_000));
  return {
    analysisStepId: 'pulse',
    elapsedTimeNs: ticks * 1_000_000n,
    stepElapsedTimeNs: ticks * 1_000_000n,
    nativeElapsedTimeTicks: ticks,
    nativeStepElapsedTimeTicks: ticks,
    timeResolutionNs: 1_000_000n,
    recordSequence: ticks,
    voltageV,
    currentA: -0.001,
    voltageSpanV: 0,
    currentSpanA: 0,
    sourceRowCount: 1,
    contributingRowIds: [`row-${timeS}`],
    timeS,
  };
}

const legacy: GittRegressionWindowSpecV1 = {
  kind: 'legacy_first_5',
  id: 'legacy_first_5',
  label: 'Legacy first 5 points',
};

const cfx425: GittRegressionWindowSpecV1 = {
  kind: 'fixed_time',
  id: 'cfx_4_25s',
  label: 'CFx 4–25 s',
  startS: 4,
  endS: 25,
};

const cfx10s: GittRegressionWindowSpecV1 = CFX_10S_GITT_REGRESSION_WINDOW;

describe('GITT regression window selection', () => {
  it('keeps the legacy rule separate from fixed-time windows', () => {
    const timeline = [0, 1, 2, 3, 4, 5, 6].map((timeS) => point(timeS));

    expect(selectRegressionPoints(timeline, legacy).points.map((item) => item.timeS))
      .toEqual([1, 2, 3, 4, 5]);
    expect(selectRegressionPoints(timeline, cfx425).points.map((item) => item.timeS))
      .toEqual([4, 5, 6]);
  });

  it('selects the inclusive real-time boundaries for the 4–25 s window', () => {
    const timeline = [0, 3.9, 4, 5, 25, 25.1, 26].map((timeS) => point(timeS));
    expect(selectRegressionPoints(timeline, cfx425).points.map((item) => item.timeS))
      .toEqual([4, 5, 25]);
  });

  it('uses elapsed seconds for irregularly sampled data', () => {
    const timeline = [0, 1, 2.1, 3.9, 4.2, 7.5, 14.8, 24.9, 25.3]
      .map((timeS) => point(timeS));
    expect(selectRegressionPoints(timeline, cfx425).points.map((item) => item.timeS))
      .toEqual([4.2, 7.5, 14.8, 24.9]);
  });

  it('uses the shared fixed-time selector for the exclusive 0–64 s CFx 10 s preset', () => {
    const timeline = [0, 10, 20, 30, 40, 50, 60, 70].map((timeS) => point(timeS));
    expect(selectRegressionPoints(timeline, cfx10s).points.map((item) => item.timeS))
      .toEqual([10, 20, 30, 40, 50, 60]);
  });

  it('accepts a jittered last point at 60.1 s in the CFx 10 s preset', () => {
    const timeline = [0, 10, 20, 30, 40, 50, 60.1, 70].map((timeS) => point(timeS));
    expect(selectRegressionPoints(timeline, cfx10s).points.at(-1)?.timeS).toBe(60.1);
  });

  it('keeps CFx 10 s and generic 1–64 s selection numerically equivalent', () => {
    const timeline = [0, 10, 20, 30, 40, 50, 60.1, 70].map((timeS) => point(timeS));
    const generic = {
      kind: 'fixed_time',
      id: 'generic_1_64s',
      label: 'generic 1–64 s',
      startS: 1,
      endS: 64,
    } as const;
    expect(selectRegressionPoints(timeline, cfx10s).points.map((item) => item.timeS))
      .toEqual(selectRegressionPoints(timeline, generic).points.map((item) => item.timeS));
  });

  it('classifies CFx 10 s sampling coverage independently from generic fit validity', () => {
    const full = evaluateRegressionWindow(
      [0, 10, 20, 30, 40, 50, 60, 70].map((timeS) => point(timeS)),
      cfx10s,
      1e-7,
      1200,
      5e-4,
      0.02,
    );
    const partial = evaluateRegressionWindow(
      [0, 10, 20, 30, 40, 50, 70].map((timeS) => point(timeS)),
      cfx10s,
      1e-7,
      1200,
      5e-4,
      0.02,
    );
    const infeasible = evaluateRegressionWindow(
      [0, 10, 20, 30, 70].map((timeS) => point(timeS)),
      cfx10s,
      1e-7,
      1200,
      5e-4,
      0.02,
    );
    expect(full.uniqueTimePointCount).toBe(6);
    expect(full.samplingCoverage).toBe('full');
    expect(partial.uniqueTimePointCount).toBe(5);
    expect(partial.samplingCoverage).toBe('partial');
    expect(partial.status).toBe('review');
    expect(infeasible.uniqueTimePointCount).toBe(3);
    expect(infeasible.samplingCoverage).toBe('infeasible');
    expect(infeasible.status).toBe('infeasible');
  });

  it('marks a fixed window incomplete when the pulse ends before its requested end', () => {
    const selected = selectRegressionPoints([0, 4, 8, 12].map((timeS) => point(timeS)), cfx425);
    expect(selected.windowCoverageIncomplete).toBe(true);
    expect(selected.warnings).toContain('window_coverage_incomplete');
    expect(selected.points.map((item) => item.timeS)).toEqual([4, 8, 12]);
  });

  it('returns an infeasible result instead of falling back when fewer than five points exist', () => {
    const result = evaluateRegressionWindow(
      [0, 4, 8, 12].map((timeS) => point(timeS)),
      cfx425,
      1e-7,
      1200,
      5e-4,
      0.02,
    );
    expect(result.uniqueTimePointCount).toBe(3);
    expect(result.metricValueCm2PerS).toBeNull();
    expect(result.status).toBe('infeasible');
    expect(result.windowCoverageIncomplete).toBe(true);
  });

  it('uses the complete pulse duration in regression D, not the window duration', () => {
    const timeline = [0, 4, 5, 8, 12, 16, 20, 24, 25, 26]
      .map((timeS) => point(timeS));
    const result = evaluateRegressionWindow(
      timeline,
      cfx425,
      1e-7,
      1200,
      5e-4,
      0.02,
    );
    const expected = (4 / Math.PI) * (5e-4 * 0.02 / (1200 * 0.01)) ** 2;
    expect(result.metricValueCm2PerS).toBeCloseTo(expected, 18);
    expect(result.fitDurationS).toBe(21);
    expect(result.fitEndFractionOfPulse).toBeCloseTo(25 / 1200, 14);
    expect(result.status).toBe('valid');
  });

  it('exposes the default CFx 10 s workflow and keeps research windows explicit', () => {
    expect(DEFAULT_GITT_REGRESSION_WINDOWS.map((window) => window.id)).toEqual([
      'legacy_first_5',
      'cfx_10s',
    ]);
    expect(HIGH_RESOLUTION_GITT_REGRESSION_WINDOWS.map((window) => window.id)).toEqual([
      'cfx_4_25s',
      'cfx_1_64s',
    ]);
  });

  it('calculates diagnostic log10 D range without creating a hard QC decision', () => {
    expect(calculateLog10DRange([1e-10, 1e-11, 1e-9])).toBeCloseTo(2, 14);
    expect(calculateLog10DRange([null, 0, Number.NaN])).toBeNull();
  });
});
