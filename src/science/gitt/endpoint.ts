import type { TimedPulsePoint } from './aggregation';

export type LoadedPulseT0Reason = 'ok' | 'missing' | 'not_loaded' | 'direction_conflict';

export type LoadedPulseT0Selection = {
  point: TimedPulsePoint | null;
  reason: LoadedPulseT0Reason;
};

function isPhysicalZero(point: TimedPulsePoint, index: number): boolean {
  if (point.stepElapsedTimeNs !== null) return point.stepElapsedTimeNs === 0n;
  return index === 0;
}

/**
 * Selects the pulse-onset point after CanonicalRow physical-time aggregation.
 * A missing current-resolution definition cannot prove that a t=0 voltage was
 * already loaded, so it is intentionally not treated as a valid endpoint.
 */
export function findLoadedPulseT0Point(
  timeline: TimedPulsePoint[],
  currentResolutionA: number | null,
  pulseDirection: number,
): LoadedPulseT0Selection {
  const zeroPoint = timeline.find(isPhysicalZero) ?? null;
  if (zeroPoint === null) return { point: null, reason: 'missing' };
  if (
    !Number.isFinite(zeroPoint.voltageV) ||
    !Number.isFinite(zeroPoint.currentA) ||
    currentResolutionA === null ||
    !Number.isFinite(currentResolutionA) ||
    currentResolutionA <= 0 ||
    Math.abs(zeroPoint.currentA) <= currentResolutionA ||
    !Number.isFinite(pulseDirection) ||
    pulseDirection === 0
  ) {
    return { point: null, reason: 'not_loaded' };
  }
  if (Math.sign(zeroPoint.currentA) !== pulseDirection) {
    return { point: null, reason: 'direction_conflict' };
  }
  return { point: zeroPoint, reason: 'ok' };
}
