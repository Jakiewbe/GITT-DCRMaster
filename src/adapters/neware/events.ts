import type { CanonicalRowV1, DcrEventInputV1, GittPulseInputV1, MaterialPresetV1 } from '../../science/contracts';
import { DCR_QC_POLICY_V1 } from '../../science/dcr/policy';
import { GITT_QC_POLICY_V1 } from '../../science/gitt/policy';
import { deriveAdapterMeasurementResolution, type NewareCanonicalDataset } from './normalize';
import {
  assessNewareIndependentQualification,
  type NewareIndependentQualification,
} from './qualification';

export type NewareProfileClassification = NewareIndependentQualification & {
  vendorProfileId:
    | 'neware-bts8-dcr-30s-v1'
    | 'neware-bts8-dcr-two-current-terminal-v1'
    | 'neware-bts8-gitt-1200s-v1'
    | 'land-cex-dcr-v1'
    | 'land-cex-gitt-v1'
    | 'neware-unapproved';
  approvalState: 'provisional';
  analysisKind: 'dcr' | 'gitt' | 'unknown';
};

/**
 * Dataset-specific science facts resolved by the product recipe.  This stays
 * deliberately small: the adapter must never infer a replacement mass after
 * the user/recipe has selected one.
 */
export type NewareGittPulseBuildOptionsV1 = {
  activeMassGOverride?: number | null;
  activeMassSourceId?: string | null;
};

function groupByStep(rows: CanonicalRowV1[]): CanonicalRowV1[][] {
  const groups: CanonicalRowV1[][] = [];
  let current: CanonicalRowV1[] = [];
  let currentId: string | null = null;
  for (const row of rows) {
    if (currentId !== row.analysisStepId) {
      if (current.length > 0) groups.push(current);
      current = [];
      currentId = row.analysisStepId;
    }
    current.push(row);
  }
  if (current.length > 0) groups.push(current);
  return groups;
}

function median(values: number[]): number {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}

function newareTwoCurrentDcrPairs(steps: CanonicalRowV1[][]): Array<{
  smallDischargeRows: CanonicalRowV1[];
  largeDischargeRows: CanonicalRowV1[];
  restRows: CanonicalRowV1[];
}> {
  const pairs: Array<{
    smallDischargeRows: CanonicalRowV1[];
    largeDischargeRows: CanonicalRowV1[];
    restRows: CanonicalRowV1[];
  }> = [];
  for (let index = 0; index < steps.length; index += 1) {
    const smallDischargeRows = steps[index];
    if (smallDischargeRows[0]?.canonicalStepType !== 'discharge') continue;
    let largeIndex = index + 1;
    const restRows: CanonicalRowV1[] = [];
    while (largeIndex < steps.length && steps[largeIndex][0]?.canonicalStepType === 'rest') {
      restRows.push(...steps[largeIndex]);
      largeIndex += 1;
    }
    const largeDischargeRows = steps[largeIndex];
    if (largeDischargeRows?.[0]?.canonicalStepType !== 'discharge') continue;
    const smallCurrentA = median(smallDischargeRows.map((row) => row.currentA));
    const largeCurrentA = median(largeDischargeRows.map((row) => row.currentA));
    if (
      Number.isFinite(smallCurrentA) &&
      Number.isFinite(largeCurrentA) &&
      Math.abs(largeCurrentA) > Math.abs(smallCurrentA)
    ) {
      pairs.push({ smallDischargeRows, largeDischargeRows, restRows });
      index = largeIndex;
    }
  }
  return pairs;
}

export function classifyNewareProfile(dataset: NewareCanonicalDataset): NewareProfileClassification {
  const program = dataset.metadata.programSteps;
  const independentQualification = assessNewareIndependentQualification(dataset.sourceFileHash);
  if (dataset.metadata.parserProfileId === 'land-cex-binary-v1') {
    if (dataset.metadata.remark === 'DCR') {
      return {
        vendorProfileId: 'land-cex-dcr-v1',
        approvalState: 'provisional',
        analysisKind: 'dcr',
        ...independentQualification,
      };
    }
    if (dataset.metadata.remark === 'GITT') {
      return {
        vendorProfileId: 'land-cex-gitt-v1',
        approvalState: 'provisional',
        analysisKind: 'gitt',
        ...independentQualification,
      };
    }
    const steps = groupByStep(dataset.rows);
    if (newareTwoCurrentDcrPairs(steps).length > 0) {
      return {
        vendorProfileId: 'land-cex-dcr-v1',
        approvalState: 'provisional',
        analysisKind: 'dcr',
        ...independentQualification,
      };
    }
    const hasGittShape = steps.some(
      (step, index) =>
        step[0]?.canonicalStepType !== 'rest' &&
        steps[index - 1]?.[0]?.canonicalStepType === 'rest' &&
        steps[index + 1]?.[0]?.canonicalStepType === 'rest',
    );
    if (hasGittShape) {
      return {
        vendorProfileId: 'land-cex-gitt-v1',
        approvalState: 'provisional',
        analysisKind: 'gitt',
        ...independentQualification,
      };
    }
  }
  const gittPulse = program.find(
    (step) => step.stepId === 2 && step.stepTypeCode === 2 && step.durationMs === 1_200_000,
  );
  const gittRest = program.find(
    (step) => step.stepId === 3 && step.stepTypeCode === 4 && step.durationMs === 14_400_000,
  );
  if (gittPulse && gittRest) {
    return {
      vendorProfileId: 'neware-bts8-gitt-1200s-v1',
      approvalState: 'provisional',
      analysisKind: 'gitt',
      ...independentQualification,
    };
  }
  const twoCurrentPairs = newareTwoCurrentDcrPairs(groupByStep(dataset.rows));
  if (twoCurrentPairs.length > 0) {
    return {
      vendorProfileId: 'neware-bts8-dcr-two-current-terminal-v1',
      approvalState: 'provisional',
      analysisKind: 'dcr',
      ...assessNewareIndependentQualification(dataset.sourceFileHash),
    };
  }
  const dcrPulse = program.find(
    (step) => step.stepId === 4 && step.stepTypeCode === 2 && step.durationMs === 30_000,
  );
  if (dcrPulse) {
    return {
      vendorProfileId: 'neware-bts8-dcr-30s-v1',
      approvalState: 'provisional',
      // Keep the recognized DCR recipe available for scheduling and cache
      // identity. Event construction below still requires a real two-current
      // row pair before producing a scientific result.
      analysisKind: 'dcr',
      ...independentQualification,
    };
  }
  return {
    vendorProfileId: 'neware-unapproved',
    approvalState: 'provisional',
    analysisKind: 'unknown',
    ...independentQualification,
  };
}

export function buildNewareDcrEvents(dataset: NewareCanonicalDataset): DcrEventInputV1[] {
  if (classifyNewareProfile(dataset).analysisKind !== 'dcr') return [];
  const steps = groupByStep(dataset.rows);
  const measurementResolution = deriveAdapterMeasurementResolution(dataset.metadata);
  return newareTwoCurrentDcrPairs(steps).map(({ smallDischargeRows, largeDischargeRows, restRows }) => ({
    eventId: `${dataset.sourceFileHash}:dcr:${largeDischargeRows[0].analysisStepId}`,
    preRestRows: restRows,
    pulseRows: largeDischargeRows,
    smallDischargeRows,
    largeDischargeRows,
    protocolRole: 'dcr_pulse',
    config: {
      qcPolicyId: DCR_QC_POLICY_V1.id,
      currentResolutionA: measurementResolution.currentA.value,
      voltageResolutionV: measurementResolution.voltageV.value,
      currentResolutionEvidence: measurementResolution.currentA,
      voltageResolutionEvidence: measurementResolution.voltageV,
      requestedMetrics: [{ kind: 'two_current_terminal', label: 'DCR_terminal' }],
      transitionLatencyKnown: true,
      transitionTimeBasis: 'step_boundary_tick',
      expectedPulseDurationS: null,
      calculationMethod: 'two_current_terminal_v1',
    },
  }));
}

export function buildNewareGittPulses(
  dataset: NewareCanonicalDataset,
  material: MaterialPresetV1,
  electrodeDiameterCm: number,
  options: NewareGittPulseBuildOptionsV1 = {},
): GittPulseInputV1[] {
  if (classifyNewareProfile(dataset).analysisKind !== 'gitt') return [];
  const steps = groupByStep(dataset.rows);
  const measurementResolution = deriveAdapterMeasurementResolution(dataset.metadata);
  const hasResolvedOverride =
    options.activeMassGOverride !== null && options.activeMassGOverride !== undefined;
  const activeMassG = hasResolvedOverride
    ? options.activeMassGOverride as number
    : dataset.metadata.activeMassMg == null
      ? Number.NaN
      : dataset.metadata.activeMassMg / 1000;
  const activeMassSourceId = hasResolvedOverride
    ? options.activeMassSourceId ?? 'recipe_active_mass_override_unattributed'
    : dataset.metadata.activeMassMg === null
      ? null
      : 'neware_metadata';
  const pulses: GittPulseInputV1[] = [];
  for (let index = 1; index < steps.length - 1; index += 1) {
    const preRestRows = steps[index - 1];
    const pulseRows = steps[index];
    const postRestRows = steps[index + 1];
    if (
      preRestRows[0]?.canonicalStepType !== 'rest' ||
      pulseRows[0]?.vendorStepId !== '2' ||
      pulseRows[0]?.canonicalStepType === 'rest' ||
      postRestRows[0]?.canonicalStepType !== 'rest'
    ) {
      continue;
    }
    pulses.push({
      pulseId: `${dataset.sourceFileHash}:gitt:${pulseRows[0].analysisStepId}`,
      preRestRows,
      pulseRows,
      postRestRows,
      material,
      config: {
        qcPolicyId: GITT_QC_POLICY_V1.id,
        currentResolutionA: measurementResolution.currentA.value,
        currentResolutionEvidence: measurementResolution.currentA,
        voltageResolutionV: measurementResolution.voltageV.value,
        voltageResolutionEvidence: measurementResolution.voltageV,
        fitWindowOverride: null,
        qrefAh:
          Number.isFinite(activeMassG) && material.theoreticalSpecificCapacityMahPerG != null
            ? (activeMassG * material.theoreticalSpecificCapacityMahPerG) / 1000
            : null,
        activeMassG,
        activeMassSourceId,
        electrodeDiameterCm,
        activeMassStandardUncertaintyG: null,
        electrodeDiameterStandardUncertaintyCm: null,
      },
    });
  }
  return pulses;
}
