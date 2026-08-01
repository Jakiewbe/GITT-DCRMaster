import { describe, expect, it } from 'vitest';

import type { CanonicalRowV1, SocBasisV1 } from './contracts';
import { computeSocTrajectory, integrateBoundaryAwareCapacity, validateVendorCapacity } from './soc';

const resolutionNs = 1_000_000_000n;

function row(
  id: string,
  elapsedS: number,
  stepElapsedS: number | null,
  currentA: number,
  stepId: string,
  stepType: CanonicalRowV1['canonicalStepType'],
  overrides: Partial<CanonicalRowV1> = {},
): CanonicalRowV1 {
  return {
    sourceFileId: 'file',
    sourceFileHash: 'a'.repeat(64),
    instrumentId: 'instrument',
    channelId: '1',
    sourceStream: 'record',
    sourceSheet: null,
    sourceRowIndex: BigInt(id.replace(/\D/g, '') || '0'),
    sourceRecordSequence: BigInt(id.replace(/\D/g, '') || '0'),
    parserVersion: 'test',
    elapsedTimeTicks: BigInt(elapsedS),
    stepElapsedTimeTicks: stepElapsedS === null ? null : BigInt(stepElapsedS),
    timeResolutionNs: resolutionNs,
    recordSequence: BigInt(id.replace(/\D/g, '') || '0'),
    elapsedTimeS: elapsedS,
    rowId: id,
    voltageV: 3,
    currentA,
    temperatureC: null,
    vendorStepId: stepId,
    vendorStepType: stepType,
    analysisStepId: stepId,
    canonicalStepType: stepType,
    chargeCapacityAh: null,
    dischargeCapacityAh: null,
    netCapacityAh: null,
    ...overrides,
  };
}

const basis: SocBasisV1 = {
  qrefAh: 2,
  qrefSource: 'rated',
  initialSocPct: 50,
  initialSocSource: 'user_input',
  integrationMode: 'net_coulomb',
  chargeCoulombicEfficiency: 1,
  dischargeCoulombicEfficiency: 1,
};

describe('boundary-aware coulomb integration', () => {
  it('uses trapezoids inside a step, zero charge at duplicate ticks, and no interpolation across steps', () => {
    const rows = [
      row('r1', 0, 0, 0, 'charge', 'charge'),
      row('r2', 10, 10, 2, 'charge', 'charge'),
      row('r3', 10, 0, -1, 'discharge', 'discharge'),
      row('r4', 10, 0, -9, 'discharge', 'discharge'),
      row('r5', 20, 10, -1, 'discharge', 'discharge'),
    ];

    const result = integrateBoundaryAwareCapacity(rows);
    expect(result.calculationState).toBe('computed');
    expect(result.qcStatus).toBe('valid');
    const increments = result.points.map((point) => point.incrementAh);
    expect(increments.slice(0, 4)).toEqual([0, 10 / 3600, 0, 0]);
    expect(increments[4]).toBeCloseTo(-50 / 3600, 15);
    expect(result.duplicateTickCount).toBe(1);
    expect(result.skippedBoundaryCount).toBe(1);
    expect(result.boundaryGapCount).toBe(0);
    expect(result.activityTimeCoverageFraction).toBe(1);
  });

  it('rejects an unrecoverable time gap at a current-step boundary', () => {
    const result = integrateBoundaryAwareCapacity([
      row('r1', 0, 0, 1, 'charge', 'charge'),
      row('r2', 10, 10, 1, 'charge', 'charge'),
      row('r3', 11, 0, -1, 'discharge', 'discharge'),
      row('r4', 21, 10, -1, 'discharge', 'discharge'),
    ]);
    expect(result.calculationState).toBe('not_computable');
    expect(result.qcCodes).toContain('step_boundary_time_gap');
    expect(result.boundaryGapCount).toBe(1);
  });

  it('does not hide an activity-step time coverage gap', () => {
    const result = integrateBoundaryAwareCapacity([
      row('r1', 2, 2, 1, 'charge', 'charge'),
      row('r2', 10, 10, 1, 'charge', 'charge'),
    ]);
    expect(result.activityTimeCoverageFraction).toBe(0.8);
    expect(result.calculationState).toBe('not_computable');
    expect(result.qcStatus).toBe('rejected');
    expect(result.totalNetCapacityAh).toBeNull();
    expect(result.diagnosticCandidateNetCapacityAh).toBeCloseTo(8 / 3600);
  });
});

describe('vendor capacity validation', () => {
  function oneAmpHourRows(vendorFinalChargeAh: number): CanonicalRowV1[] {
    return [
      row('r1', 0, 0, 1, 'charge', 'charge', { chargeCapacityAh: 0, dischargeCapacityAh: 0 }),
      row('r2', 3600, 3600, 1, 'charge', 'charge', {
        chargeCapacityAh: vendorFinalChargeAh,
        dischargeCapacityAh: 0,
      }),
    ];
  }

  it('accepts <=1%, reviews 1-3%, and rejects >3% disagreement', () => {
    const validRows = oneAmpHourRows(1);
    const valid = validateVendorCapacity(validRows, integrateBoundaryAwareCapacity(validRows), 2);
    expect(valid.qcStatus).toBe('valid');
    expect(valid.relativeDifference).toBeCloseTo(0);

    const reviewRows = oneAmpHourRows(1.02);
    const review = validateVendorCapacity(reviewRows, integrateBoundaryAwareCapacity(reviewRows), 2);
    expect(review.qcStatus).toBe('review');
    expect(review.relativeDifference).toBeCloseTo(0.02);

    const rejectedRows = oneAmpHourRows(1.04);
    const rejected = validateVendorCapacity(rejectedRows, integrateBoundaryAwareCapacity(rejectedRows), 2);
    expect(rejected.calculationState).toBe('not_computable');
    expect(rejected.qcStatus).toBe('rejected');
  });

  it('does not silently fall back when vendor fields are partial or reset', () => {
    const partial = [
      row('r1', 0, 0, 1, 'charge', 'charge', { chargeCapacityAh: 0, dischargeCapacityAh: 0 }),
      row('r2', 10, 10, 1, 'charge', 'charge'),
    ];
    const partialSoc = computeSocTrajectory(partial, basis);
    expect(partialSoc.calculationState).toBe('not_computable');
    expect(partialSoc.capacitySource).toBeNull();
    expect(partialSoc.qcCodes).toContain('vendor_capacity_fields_partial_or_ambiguous');

    const reset = [
      row('r1', 0, 0, 1, 'charge', 'charge', { chargeCapacityAh: 1, dischargeCapacityAh: 0 }),
      row('r2', 10, 10, 1, 'charge', 'charge', { chargeCapacityAh: 0, dischargeCapacityAh: 0 }),
    ];
    const resetSoc = computeSocTrajectory(reset, basis);
    expect(resetSoc.capacitySource).toBeNull();
    expect(resetSoc.qcCodes).toContain('vendor_charge_capacity_reset_or_decrease');
  });
});

describe('SOC/DOD trajectory', () => {
  it('prefers independently validated vendor capacity', () => {
    const rows = [
      row('r1', 0, 0, 1, 'charge', 'charge', { chargeCapacityAh: 0, dischargeCapacityAh: 0 }),
      row('r2', 3600, 3600, 1, 'charge', 'charge', { chargeCapacityAh: 1, dischargeCapacityAh: 0 }),
    ];
    const result = computeSocTrajectory(rows, basis);
    expect(result.calculationState).toBe('computed');
    expect(result.capacitySource).toBe('vendor');
    expect(result.points[1].socPct).toBe(100);
    expect(result.points[1].dodPct).toBe(0);
    expect(result.points[1].remainingCapacityPct).toBe(100);
  });

  it('uses integrated capacity only when vendor capacity is absent', () => {
    const rows = [
      row('r1', 0, 0, -1, 'discharge', 'discharge'),
      row('r2', 3600, 3600, -1, 'discharge', 'discharge'),
    ];
    const result = computeSocTrajectory(rows, basis);
    expect(result.capacitySource).toBe('integrated');
    expect(result.points[1].cumulativeNetCapacityAh).toBe(-1);
    expect(result.points[1].socPct).toBe(0);
    expect(result.points[1].dodPct).toBe(100);
  });

  it('keeps integrated capacity as a diagnostic but does not invent SOC when initial state is unknown', () => {
    const rows = [
      row('r1', 0, 0, -1, 'discharge', 'discharge'),
      row('r2', 10, 10, -1, 'discharge', 'discharge'),
    ];
    const result = computeSocTrajectory(rows, {
      ...basis,
      initialSocPct: null,
      initialSocSource: 'unknown',
    });
    expect(result.calculationState).toBe('not_computable');
    expect(result.points[1].cumulativeNetCapacityAh).toBeCloseTo(-10 / 3600);
    expect(result.points[1].socPct).toBeNull();
    expect(result.qcCodes).toContain('initial_soc_unknown');
  });

  it('requires evidence before applying the fresh-cell 100% assumption and never clamps SOC', () => {
    const rows = [
      row('r1', 0, 0, 1, 'charge', 'charge'),
      row('r2', 3600, 3600, 1, 'charge', 'charge'),
    ];
    const freshBasis: SocBasisV1 = {
      ...basis,
      qrefAh: 1,
      initialSocPct: 100,
      initialSocSource: 'fresh_cell_assumption',
    };
    expect(computeSocTrajectory(rows, freshBasis).qcCodes).toContain('fresh_cell_assumption_unverified');

    const verified = computeSocTrajectory(rows, freshBasis, { datasetStartsAtFreshCell: true });
    expect(verified.points[1].socPct).toBe(200);
    expect(verified.points[1].dodPct).toBe(-100);
  });
});
