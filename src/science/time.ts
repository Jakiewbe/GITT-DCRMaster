import type { CanonicalTimeV1 } from './contracts';

export type DecimalTimeUnit = 'ns' | 'us' | 'ms' | 's' | 'min' | 'h';

const UNIT_NANOSECONDS: Record<DecimalTimeUnit, bigint> = {
  ns: 1n,
  us: 1_000n,
  ms: 1_000_000n,
  s: 1_000_000_000n,
  min: 60_000_000_000n,
  h: 3_600_000_000_000n,
};

const TEN = 10n;

function powerOfTen(exponent: number): bigint {
  if (!Number.isSafeInteger(exponent) || exponent < 0) {
    throw new RangeError(`Invalid decimal exponent: ${exponent}`);
  }

  return TEN ** BigInt(exponent);
}

export type DecimalParts = {
  coefficient: bigint;
  decimalExponent: number;
};

/**
 * Parses a base-10 number without first converting it to a JavaScript number.
 * The returned value is coefficient * 10^decimalExponent.
 */
export function parseDecimalParts(rawValue: string): DecimalParts {
  const value = rawValue.trim();
  const match = /^([+-]?)(?:(\d+)(?:\.(\d*))?|\.(\d+))(?:[eE]([+-]?\d+))?$/.exec(value);
  if (!match) throw new TypeError(`Invalid decimal time value: ${rawValue}`);

  const [, sign, integerDigits = '', fractionalAfterInteger = '', fractionalOnly = '', exponentText = '0'] =
    match;
  const fractionalDigits = fractionalOnly || fractionalAfterInteger;
  const digits = `${integerDigits || '0'}${fractionalDigits}`.replace(/^0+(?=\d)/, '');
  const scientificExponent = Number(exponentText);

  if (!Number.isSafeInteger(scientificExponent)) {
    throw new RangeError(`Decimal exponent is outside the supported range: ${exponentText}`);
  }

  const unsignedCoefficient = BigInt(digits || '0');
  return {
    coefficient: sign === '-' ? -unsignedCoefficient : unsignedCoefficient,
    decimalExponent: scientificExponent - fractionalDigits.length,
  };
}

export type ParseDecimalTimeOptions = {
  unit?: DecimalTimeUnit;
  allowNegative?: boolean;
};

/**
 * Converts a decimal time string to integer ticks exactly. Values that cannot be
 * represented by the declared tick resolution are rejected instead of rounded.
 */
export function parseDecimalTimeToTicks(
  rawValue: string,
  timeResolutionNs: bigint,
  options: ParseDecimalTimeOptions = {},
): bigint {
  if (timeResolutionNs <= 0n) throw new RangeError('timeResolutionNs must be greater than zero');

  const { coefficient, decimalExponent } = parseDecimalParts(rawValue);
  if (!options.allowNegative && coefficient < 0n) throw new RangeError('Elapsed time cannot be negative');

  let numerator = coefficient * UNIT_NANOSECONDS[options.unit ?? 's'];
  let denominator = timeResolutionNs;

  if (decimalExponent >= 0) numerator *= powerOfTen(decimalExponent);
  else denominator *= powerOfTen(-decimalExponent);

  if (numerator % denominator !== 0n) {
    throw new RangeError(
      `Time value ${rawValue} ${options.unit ?? 's'} is not aligned to a ${timeResolutionNs.toString()} ns tick`,
    );
  }

  return numerator / denominator;
}

export function ticksToNanoseconds(ticks: bigint, timeResolutionNs: bigint): bigint {
  if (timeResolutionNs <= 0n) throw new RangeError('timeResolutionNs must be greater than zero');
  return ticks * timeResolutionNs;
}

/** Derived display/calculation value. Never use this result for exact tick matching. */
export function ticksToSeconds(ticks: bigint, timeResolutionNs: bigint): number {
  const nanoseconds = ticksToNanoseconds(ticks, timeResolutionNs);
  const wholeSeconds = nanoseconds / 1_000_000_000n;
  const remainingNanoseconds = nanoseconds % 1_000_000_000n;
  const seconds = Number(wholeSeconds) + Number(remainingNanoseconds) / 1e9;
  if (!Number.isFinite(seconds)) throw new RangeError('Elapsed time is too large to represent as seconds');
  return seconds;
}

export function compareCanonicalTimes(left: CanonicalTimeV1, right: CanonicalTimeV1): number {
  const leftNs = ticksToNanoseconds(left.elapsedTimeTicks, left.timeResolutionNs);
  const rightNs = ticksToNanoseconds(right.elapsedTimeTicks, right.timeResolutionNs);
  if (leftNs < rightNs) return -1;
  if (leftNs > rightNs) return 1;
  if (left.recordSequence < right.recordSequence) return -1;
  if (left.recordSequence > right.recordSequence) return 1;
  return 0;
}

export type CanonicalTimeFromDecimalInput = {
  elapsedTime: string;
  stepElapsedTime?: string | null;
  timeResolutionNs: bigint;
  recordSequence: bigint;
  unit?: DecimalTimeUnit;
};

export function canonicalTimeFromDecimal(input: CanonicalTimeFromDecimalInput): CanonicalTimeV1 {
  if (input.recordSequence < 0n) throw new RangeError('recordSequence cannot be negative');
  const elapsedTimeTicks = parseDecimalTimeToTicks(input.elapsedTime, input.timeResolutionNs, {
    unit: input.unit,
  });
  const stepElapsedTimeTicks =
    input.stepElapsedTime == null
      ? null
      : parseDecimalTimeToTicks(input.stepElapsedTime, input.timeResolutionNs, { unit: input.unit });

  return {
    elapsedTimeTicks,
    stepElapsedTimeTicks,
    timeResolutionNs: input.timeResolutionNs,
    recordSequence: input.recordSequence,
    elapsedTimeS: ticksToSeconds(elapsedTimeTicks, input.timeResolutionNs),
  };
}

export function samePhysicalTick(
  leftTicks: bigint,
  leftResolutionNs: bigint,
  rightTicks: bigint,
  rightResolutionNs: bigint,
): boolean {
  return ticksToNanoseconds(leftTicks, leftResolutionNs) === ticksToNanoseconds(rightTicks, rightResolutionNs);
}
