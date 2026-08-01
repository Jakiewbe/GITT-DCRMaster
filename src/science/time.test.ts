import { describe, expect, it } from 'vitest';

import {
  canonicalTimeFromDecimal,
  compareCanonicalTimes,
  parseDecimalParts,
  parseDecimalTimeToTicks,
  samePhysicalTick,
  ticksToSeconds,
} from './time';

describe('decimal time parsing', () => {
  it('converts decimal and scientific notation directly to integer ticks', () => {
    expect(parseDecimalTimeToTicks('4.999999999', 1n)).toBe(4_999_999_999n);
    expect(parseDecimalTimeToTicks('5.000000001', 1n)).toBe(5_000_000_001n);
    expect(parseDecimalTimeToTicks('1.25e-3', 1_000n)).toBe(1_250n);
    expect(parseDecimalTimeToTicks('.5', 1_000_000n)).toBe(500n);
    expect(parseDecimalTimeToTicks('2', 1_000_000n, { unit: 'ms' })).toBe(2n);
  });

  it('preserves decimal structure without a number conversion', () => {
    expect(parseDecimalParts('9007199254740993.000000001')).toEqual({
      coefficient: 9_007_199_254_740_993_000_000_001n,
      decimalExponent: -9,
    });
  });

  it('rejects non-aligned, negative, and malformed elapsed times', () => {
    expect(() => parseDecimalTimeToTicks('0.000000001', 10n)).toThrow(/not aligned/);
    expect(() => parseDecimalTimeToTicks('-1', 1_000_000_000n)).toThrow(/negative/);
    expect(() => parseDecimalTimeToTicks('1,25', 1_000_000n)).toThrow(/Invalid decimal/);
  });
});

describe('canonical time', () => {
  it('keeps integer ticks authoritative and derives seconds only for display/calculation', () => {
    const value = canonicalTimeFromDecimal({
      elapsedTime: '5.000000001',
      stepElapsedTime: '0.000000001',
      timeResolutionNs: 1n,
      recordSequence: 7n,
    });

    expect(value.elapsedTimeTicks).toBe(5_000_000_001n);
    expect(value.stepElapsedTimeTicks).toBe(1n);
    expect(value.elapsedTimeS).toBe(5.000000001);
  });

  it('compares physical time first and record sequence second', () => {
    const early = canonicalTimeFromDecimal({
      elapsedTime: '1',
      timeResolutionNs: 1_000_000n,
      recordSequence: 2n,
    });
    const sameTickLaterRecord = { ...early, recordSequence: 3n };
    const later = canonicalTimeFromDecimal({
      elapsedTime: '1.001',
      timeResolutionNs: 1_000_000n,
      recordSequence: 1n,
    });

    expect(compareCanonicalTimes(early, sameTickLaterRecord)).toBe(-1);
    expect(compareCanonicalTimes(sameTickLaterRecord, later)).toBe(-1);
    expect(samePhysicalTick(1_000n, 1_000_000n, 1n, 1_000_000_000n)).toBe(true);
    expect(ticksToSeconds(1_001n, 1_000_000n)).toBe(1.001);
  });
});
