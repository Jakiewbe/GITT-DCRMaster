import type { CanonicalRowV1 } from '../contracts';

export type GittPulseDirection = 'charge' | 'discharge';

function finite(value: number | null): value is number {
  return value !== null && Number.isFinite(value);
}

function compareRows(left: CanonicalRowV1, right: CanonicalRowV1): number {
  const leftTime = left.stepElapsedTimeTicks ?? left.elapsedTimeTicks;
  const rightTime = right.stepElapsedTimeTicks ?? right.elapsedTimeTicks;
  if (leftTime !== rightTime) return leftTime < rightTime ? -1 : 1;
  if (left.recordSequence !== right.recordSequence) {
    return left.recordSequence < right.recordSequence ? -1 : 1;
  }
  return left.rowId.localeCompare(right.rowId);
}

/**
 * Neware's "mid voltage" is the voltage at half of a step's capacity,
 * not the statistical median of voltage samples and not the time midpoint.
 * The source capacity is cumulative within the step, so only the first and
 * last capacity in this pulse are used to define its 50% point.
 */
export function calculateMedianVoltageV(
  rows: readonly CanonicalRowV1[],
  direction: GittPulseDirection,
): number | null {
  if (rows.length < 2) return null;

  const ordered = [...rows].sort(compareRows);
  const capacity = (row: CanonicalRowV1): number | null =>
    direction === 'charge' ? row.chargeCapacityAh : row.dischargeCapacityAh;

  const firstCapacity = capacity(ordered[0]);
  const lastCapacity = capacity(ordered[ordered.length - 1]);
  if (!finite(firstCapacity) || !finite(lastCapacity) || !(lastCapacity > firstCapacity)) return null;

  for (let index = 0; index < ordered.length; index += 1) {
    const rowCapacity = capacity(ordered[index]);
    if (!finite(rowCapacity) || !finite(ordered[index].voltageV)) return null;
    if (index > 0) {
      const previousCapacity = capacity(ordered[index - 1]);
      if (!finite(previousCapacity) || rowCapacity < previousCapacity) return null;
    }
  }

  const targetCapacity = firstCapacity + (lastCapacity - firstCapacity) / 2;
  for (let index = 0; index < ordered.length; index += 1) {
    const currentCapacity = capacity(ordered[index]) as number;
    if (currentCapacity === targetCapacity) return ordered[index].voltageV;
    if (index === 0) continue;

    const previousCapacity = capacity(ordered[index - 1]) as number;
    const capacitySpan = currentCapacity - previousCapacity;
    if (capacitySpan <= 0 || targetCapacity < previousCapacity || targetCapacity > currentCapacity) continue;

    const previousVoltage = ordered[index - 1].voltageV;
    const currentVoltage = ordered[index].voltageV;
    const fraction = (targetCapacity - previousCapacity) / capacitySpan;
    return previousVoltage + (currentVoltage - previousVoltage) * fraction;
  }

  return null;
}
