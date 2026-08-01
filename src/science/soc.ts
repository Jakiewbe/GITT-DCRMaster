import type {
  CanonicalRowV1,
  QcFinding,
  ScientificResultStateV1,
  SocBasisV1,
  SocPointV1,
} from './contracts';
import { qcFinding, resultStateFromFindings } from './qc';
import { compareCanonicalTimes, ticksToNanoseconds } from './time';

export type CapacityIntegrationPointV1 = {
  rowId: string;
  incrementAh: number;
  cumulativeNetCapacityAh: number;
  cumulativeThroughputAh: number;
};

export type BoundaryAwareCapacityResultV1 = ScientificResultStateV1 & {
  points: CapacityIntegrationPointV1[];
  totalNetCapacityAh: number | null;
  diagnosticCandidateNetCapacityAh: number;
  totalThroughputAh: number;
  activityTimeCoverageFraction: number | null;
  integratedDurationS: number;
  expectedActivityDurationS: number | null;
  skippedBoundaryCount: number;
  boundaryGapCount: number;
  duplicateTickCount: number;
  qcFindings: QcFinding[];
};

export type VendorCapacityMode = 'net_capacity' | 'charge_discharge_capacity';

export type VendorCapacityValidationV1 = ScientificResultStateV1 & {
  availability: 'absent' | 'available' | 'ambiguous';
  mode: VendorCapacityMode | null;
  cumulativeNetCapacityAh: number[] | null;
  maximumAbsoluteDifferenceAh: number | null;
  relativeDifference: number | null;
  qcFindings: QcFinding[];
};

export type SocTrajectoryOptions = {
  datasetStartsAtFreshCell?: boolean;
};

export type SocTrajectoryResultV1 = ScientificResultStateV1 & {
  points: SocPointV1[];
  capacitySource: 'vendor' | 'integrated' | null;
  integration: BoundaryAwareCapacityResultV1;
  vendorValidation: VendorCapacityValidationV1;
  qcFindings: QcFinding[];
};

function isFiniteNumber(value: number): boolean {
  return Number.isFinite(value);
}

function orderedRows(rows: readonly CanonicalRowV1[]): CanonicalRowV1[] {
  return [...rows].sort((left, right) => {
    const timeComparison = compareCanonicalTimes(left, right);
    if (timeComparison !== 0) return timeComparison;
    return left.rowId < right.rowId ? -1 : left.rowId > right.rowId ? 1 : 0;
  });
}

function elapsedNanoseconds(row: CanonicalRowV1): bigint {
  return ticksToNanoseconds(row.elapsedTimeTicks, row.timeResolutionNs);
}

function stepElapsedNanoseconds(row: CanonicalRowV1): bigint | null {
  return row.stepElapsedTimeTicks === null
    ? null
    : ticksToNanoseconds(row.stepElapsedTimeTicks, row.timeResolutionNs);
}

function nanosecondsToSeconds(value: bigint): number {
  const result = Number(value) / 1e9;
  if (!Number.isFinite(result)) throw new RangeError('Time interval is too large for capacity integration');
  return result;
}

function isActivityRow(row: CanonicalRowV1): boolean {
  return row.canonicalStepType === 'charge' || row.canonicalStepType === 'discharge';
}

function calculateActivityCoverage(rows: readonly CanonicalRowV1[]): {
  integratedDurationS: number;
  expectedDurationS: number | null;
  coverageFraction: number | null;
} {
  const activityRows = rows.filter(isActivityRow);
  if (activityRows.length === 0) {
    return { integratedDurationS: 0, expectedDurationS: 0, coverageFraction: 1 };
  }

  const groups = new Map<string, CanonicalRowV1[]>();
  for (const row of activityRows) {
    const key = `${row.analysisStepId}\0${row.canonicalStepType}`;
    const group = groups.get(key);
    if (group) group.push(row);
    else groups.set(key, [row]);
  }

  let integratedNs = 0n;
  let expectedNs = 0n;
  let expectedKnown = true;

  for (const groupRows of groups.values()) {
    const ordered = orderedRows(groupRows);
    for (let index = 1; index < ordered.length; index += 1) {
      const delta = elapsedNanoseconds(ordered[index]) - elapsedNanoseconds(ordered[index - 1]);
      if (delta > 0n) integratedNs += delta;
    }

    const stepTimes = ordered.map(stepElapsedNanoseconds);
    if (stepTimes.some((value) => value === null)) {
      expectedKnown = false;
      continue;
    }
    const knownStepTimes = stepTimes as bigint[];
    const maximumStepTime = knownStepTimes.reduce((maximum, value) => (value > maximum ? value : maximum), 0n);
    expectedNs += maximumStepTime;
  }

  const integratedDurationS = nanosecondsToSeconds(integratedNs);
  if (!expectedKnown) return { integratedDurationS, expectedDurationS: null, coverageFraction: null };
  const expectedDurationS = nanosecondsToSeconds(expectedNs);
  const coverageFraction = expectedNs === 0n ? 1 : Math.min(1, Number(integratedNs) / Number(expectedNs));
  return { integratedDurationS, expectedDurationS, coverageFraction };
}

/**
 * Trapezoidal coulomb counting is performed only between records in the same
 * analysis step and canonical state. A repeated physical tick contributes zero
 * charge, and a current transition is never interpolated across a step boundary.
 */
export function integrateBoundaryAwareCapacity(rows: readonly CanonicalRowV1[]): BoundaryAwareCapacityResultV1 {
  const ordered = orderedRows(rows);
  const findings: QcFinding[] = [];
  const points: CapacityIntegrationPointV1[] = [];
  let cumulativeNetCapacityAh = 0;
  let cumulativeThroughputAh = 0;
  let skippedBoundaryCount = 0;
  let boundaryGapCount = 0;
  let duplicateTickCount = 0;
  const closedBoundaryDomains = new Set<string>();
  let previousBoundaryDomain: string | null = null;

  if (ordered.some((row) => !isFiniteNumber(row.currentA) || row.timeResolutionNs <= 0n)) {
    findings.push(qcFinding('capacity_integration_input_invalid', 'rejected'));
  }

  for (let index = 0; index < ordered.length; index += 1) {
    const current = ordered[index];
    const previous = index === 0 ? null : ordered[index - 1];
    const currentBoundaryDomain = `${current.analysisStepId}\0${current.canonicalStepType}`;
    let incrementAh = 0;

    if (previousBoundaryDomain !== null && currentBoundaryDomain !== previousBoundaryDomain) {
      closedBoundaryDomains.add(previousBoundaryDomain);
      if (closedBoundaryDomains.has(currentBoundaryDomain)) {
        findings.push(qcFinding('analysis_step_reentered_after_boundary', 'rejected'));
      }
    }
    previousBoundaryDomain = currentBoundaryDomain;

    if (previous) {
      const sameBoundaryDomain =
        previous.analysisStepId === current.analysisStepId &&
        previous.canonicalStepType === current.canonicalStepType;
      const deltaNs = elapsedNanoseconds(current) - elapsedNanoseconds(previous);

      if (deltaNs < 0n) findings.push(qcFinding('canonical_time_order_invalid', 'rejected'));
      else if (!sameBoundaryDomain) {
        skippedBoundaryCount += 1;
        if (deltaNs > 0n) {
          boundaryGapCount += 1;
          findings.push(
            qcFinding('step_boundary_time_gap', 'rejected', nanosecondsToSeconds(deltaNs)),
          );
        }
      }
      else if (deltaNs === 0n) duplicateTickCount += 1;
      else if (isFiniteNumber(previous.currentA) && isFiniteNumber(current.currentA)) {
        const durationS = nanosecondsToSeconds(deltaNs);
        incrementAh = ((previous.currentA + current.currentA) / 2) * (durationS / 3600);
      }
    }

    cumulativeNetCapacityAh += incrementAh;
    cumulativeThroughputAh += Math.abs(incrementAh);
    points.push({
      rowId: current.rowId,
      incrementAh,
      cumulativeNetCapacityAh,
      cumulativeThroughputAh,
    });
  }

  const coverage = calculateActivityCoverage(ordered);
  if (coverage.coverageFraction === null) {
    findings.push(qcFinding('activity_time_coverage_unknown', 'review'));
  } else if (coverage.coverageFraction >= 0.995) {
    findings.push(qcFinding('activity_time_coverage_valid', 'valid', coverage.coverageFraction));
  } else if (coverage.coverageFraction >= 0.99) {
    findings.push(qcFinding('activity_time_coverage_review', 'review', coverage.coverageFraction));
  } else {
    findings.push(qcFinding('activity_time_coverage_insufficient', 'rejected', coverage.coverageFraction));
  }

  const rejected = findings.some((finding) => finding.status === 'rejected');
  return {
    ...resultStateFromFindings(findings, rejected ? 'not_computable' : 'computed'),
    points,
    totalNetCapacityAh: rejected ? null : cumulativeNetCapacityAh,
    diagnosticCandidateNetCapacityAh: cumulativeNetCapacityAh,
    totalThroughputAh: cumulativeThroughputAh,
    activityTimeCoverageFraction: coverage.coverageFraction,
    integratedDurationS: coverage.integratedDurationS,
    expectedActivityDurationS: coverage.expectedDurationS,
    skippedBoundaryCount,
    boundaryGapCount,
    duplicateTickCount,
    qcFindings: findings,
  };
}

function detectVendorMode(rows: readonly CanonicalRowV1[]): {
  availability: VendorCapacityValidationV1['availability'];
  mode: VendorCapacityMode | null;
} {
  const hasAnyNet = rows.some((row) => row.netCapacityAh !== null);
  const hasAllNet = rows.every((row) => row.netCapacityAh !== null);
  const hasAnySplit = rows.some((row) => row.chargeCapacityAh !== null || row.dischargeCapacityAh !== null);
  const hasAllSplit = rows.every((row) => row.chargeCapacityAh !== null && row.dischargeCapacityAh !== null);

  if (hasAnyNet) return hasAllNet ? { availability: 'available', mode: 'net_capacity' } : { availability: 'ambiguous', mode: null };
  if (hasAnySplit) {
    return hasAllSplit
      ? { availability: 'available', mode: 'charge_discharge_capacity' }
      : { availability: 'ambiguous', mode: null };
  }
  return { availability: 'absent', mode: null };
}

function vendorNetTrajectory(rows: readonly CanonicalRowV1[], mode: VendorCapacityMode): number[] | null {
  if (rows.length === 0) return [];
  if (mode === 'net_capacity') {
    const values = rows.map((row) => row.netCapacityAh as number);
    if (values.some((value) => !Number.isFinite(value))) return null;
    const initial = values[0];
    return values.map((value) => value - initial);
  }

  const charge = rows.map((row) => row.chargeCapacityAh as number);
  const discharge = rows.map((row) => row.dischargeCapacityAh as number);
  if ([...charge, ...discharge].some((value) => !Number.isFinite(value) || value < 0)) return null;
  const initialNet = charge[0] - discharge[0];
  return charge.map((value, index) => value - discharge[index] - initialNet);
}

export function validateVendorCapacity(
  rows: readonly CanonicalRowV1[],
  integration: BoundaryAwareCapacityResultV1,
  qrefAh: number,
): VendorCapacityValidationV1 {
  const ordered = orderedRows(rows);
  const detected = detectVendorMode(ordered);
  const findings: QcFinding[] = [];

  if (detected.availability === 'absent') {
    return {
      calculationState: 'not_requested',
      qcStatus: null,
      qcCodes: [],
      availability: 'absent',
      mode: null,
      cumulativeNetCapacityAh: null,
      maximumAbsoluteDifferenceAh: null,
      relativeDifference: null,
      qcFindings: [],
    };
  }

  if (detected.availability === 'ambiguous' || detected.mode === null) {
    findings.push(qcFinding('vendor_capacity_fields_partial_or_ambiguous', 'rejected'));
    return {
      ...resultStateFromFindings(findings, 'not_computable'),
      availability: 'ambiguous',
      mode: null,
      cumulativeNetCapacityAh: null,
      maximumAbsoluteDifferenceAh: null,
      relativeDifference: null,
      qcFindings: findings,
    };
  }

  const trajectory = vendorNetTrajectory(ordered, detected.mode);
  if (!trajectory) findings.push(qcFinding('vendor_capacity_value_invalid', 'rejected'));

  if (detected.mode === 'charge_discharge_capacity') {
    for (let index = 1; index < ordered.length; index += 1) {
      const previous = ordered[index - 1];
      const current = ordered[index];
      if ((current.chargeCapacityAh as number) + 1e-15 < (previous.chargeCapacityAh as number)) {
        findings.push(qcFinding('vendor_charge_capacity_reset_or_decrease', 'rejected'));
        break;
      }
      if ((current.dischargeCapacityAh as number) + 1e-15 < (previous.dischargeCapacityAh as number)) {
        findings.push(qcFinding('vendor_discharge_capacity_reset_or_decrease', 'rejected'));
        break;
      }
    }
  }

  if (trajectory && integration.points.length === trajectory.length) {
    const toleranceAh = Math.max(Number.isFinite(qrefAh) && qrefAh > 0 ? qrefAh * 1e-12 : 0, 1e-15);
    for (let index = 1; index < trajectory.length; index += 1) {
      const vendorIncrement = trajectory[index] - trajectory[index - 1];
      const integratedIncrement = integration.points[index].incrementAh;
      if (
        Math.abs(vendorIncrement) > toleranceAh &&
        Math.abs(integratedIncrement) > toleranceAh &&
        Math.sign(vendorIncrement) !== Math.sign(integratedIncrement)
      ) {
        findings.push(qcFinding('vendor_capacity_direction_conflict', 'rejected'));
        break;
      }
    }
  }

  if (integration.calculationState !== 'computed') {
    findings.push(qcFinding('vendor_capacity_independent_integration_unavailable', 'rejected'));
  }

  let maximumAbsoluteDifferenceAh: number | null = null;
  let relativeDifference: number | null = null;
  if (
    trajectory &&
    integration.calculationState === 'computed' &&
    integration.points.length === trajectory.length &&
    !findings.some((finding) => finding.status === 'rejected')
  ) {
    maximumAbsoluteDifferenceAh = trajectory.reduce(
      (maximum, value, index) => Math.max(maximum, Math.abs(value - integration.points[index].cumulativeNetCapacityAh)),
      0,
    );
    const denominator = Math.max(integration.totalThroughputAh, qrefAh * 1e-12, 1e-15);
    relativeDifference = maximumAbsoluteDifferenceAh / denominator;

    if (relativeDifference <= 0.01) {
      findings.push(qcFinding('vendor_capacity_agrees_with_integration', 'valid', relativeDifference));
    } else if (relativeDifference <= 0.03) {
      findings.push(qcFinding('vendor_capacity_difference_review', 'review', relativeDifference));
    } else {
      findings.push(qcFinding('vendor_capacity_difference_excessive', 'rejected', relativeDifference));
    }
  }

  const rejected = findings.some((finding) => finding.status === 'rejected');
  return {
    ...resultStateFromFindings(findings, rejected ? 'not_computable' : 'computed'),
    availability: 'available',
    mode: detected.mode,
    cumulativeNetCapacityAh: trajectory,
    maximumAbsoluteDifferenceAh,
    relativeDifference,
    qcFindings: findings,
  };
}

function invalidSocBasisFinding(basis: SocBasisV1, options: SocTrajectoryOptions): QcFinding[] {
  const findings: QcFinding[] = [];
  if (!Number.isFinite(basis.qrefAh) || basis.qrefAh <= 0) findings.push(qcFinding('qref_invalid', 'rejected'));
  if (basis.initialSocPct === null || !Number.isFinite(basis.initialSocPct)) {
    findings.push(qcFinding('initial_soc_unknown', 'rejected'));
  } else if (basis.initialSocPct < 0 || basis.initialSocPct > 100) {
    findings.push(qcFinding('initial_soc_outside_nominal_range', 'review', basis.initialSocPct));
  }
  if (basis.initialSocSource === 'unknown') findings.push(qcFinding('initial_soc_source_unknown', 'review'));
  if (basis.initialSocSource === 'fresh_cell_assumption' && !options.datasetStartsAtFreshCell) {
    findings.push(qcFinding('fresh_cell_assumption_unverified', 'rejected'));
  }
  return findings;
}

export function computeSocTrajectory(
  rows: readonly CanonicalRowV1[],
  basis: SocBasisV1,
  options: SocTrajectoryOptions = {},
): SocTrajectoryResultV1 {
  const ordered = orderedRows(rows);
  const integration = integrateBoundaryAwareCapacity(ordered);
  const vendorValidation = validateVendorCapacity(ordered, integration, basis.qrefAh);
  const findings = [...integration.qcFindings, ...vendorValidation.qcFindings, ...invalidSocBasisFinding(basis, options)];

  let capacitySource: SocTrajectoryResultV1['capacitySource'] = null;
  let capacities: number[] | null = null;
  if (vendorValidation.availability === 'available') {
    if (vendorValidation.calculationState === 'computed') {
      capacitySource = 'vendor';
      capacities = vendorValidation.cumulativeNetCapacityAh;
    }
  } else if (vendorValidation.availability === 'absent' && integration.calculationState === 'computed') {
    capacitySource = 'integrated';
    capacities = integration.points.map((point) => point.cumulativeNetCapacityAh);
  }

  const basisRejected = findings.some((finding) => finding.status === 'rejected');
  const calculationState = capacities && !basisRejected ? 'computed' : 'not_computable';
  const overallState = resultStateFromFindings(findings, calculationState);
  const points: SocPointV1[] = ordered.map((row, index) => {
    const cumulative = capacities?.[index] ?? integration.points[index]?.cumulativeNetCapacityAh ?? null;
    if (calculationState !== 'computed' || cumulative === null || basis.initialSocPct === null) {
      return {
        ...overallState,
        rowId: row.rowId,
        cumulativeNetCapacityAh: cumulative,
        socPct: null,
        dodPct: null,
        remainingCapacityPct: null,
        capacitySource,
      };
    }

    const socPct = basis.initialSocPct + (cumulative / basis.qrefAh) * 100;
    return {
      ...overallState,
      rowId: row.rowId,
      cumulativeNetCapacityAh: cumulative,
      socPct,
      dodPct: 100 - socPct,
      remainingCapacityPct: socPct,
      capacitySource,
    };
  });

  return {
    ...overallState,
    points,
    capacitySource,
    integration,
    vendorValidation,
    qcFindings: findings,
  };
}
