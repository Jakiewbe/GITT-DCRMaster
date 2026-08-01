import type { CanonicalRowV1, DcrEventInputV1, GittPulseInputV1, MaterialPresetV1 } from '../../science/contracts';
import { DCR_QC_POLICY_V1 } from '../../science/dcr/policy';
import { GITT_QC_POLICY_V1 } from '../../science/gitt/policy';
import { deriveNewareMeasurementResolution, type NewareCanonicalDataset } from './normalize';
import {
  assessNewareIndependentQualification,
  type NewareIndependentQualification,
} from './qualification';

export type NewareProfileClassification = NewareIndependentQualification & {
  vendorProfileId: 'neware-bts8-dcr-30s-v1' | 'neware-bts8-gitt-1200s-v1' | 'neware-unapproved';
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

export function classifyNewareProfile(dataset: NewareCanonicalDataset): NewareProfileClassification {
  const program = dataset.metadata.programSteps;
  const independentQualification = assessNewareIndependentQualification(dataset.sourceFileHash);
  const dcrPulse = program.find(
    (step) => step.stepId === 4 && step.stepTypeCode === 2 && step.durationMs === 30_000,
  );
  if (dcrPulse) {
    return {
      vendorProfileId: 'neware-bts8-dcr-30s-v1',
      approvalState: 'provisional',
      analysisKind: 'dcr',
      ...independentQualification,
    };
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
  const measurementResolution = deriveNewareMeasurementResolution(dataset.metadata);
  const events: DcrEventInputV1[] = [];
  for (let index = 1; index < steps.length; index += 1) {
    const preRestRows = steps[index - 1];
    const pulseRows = steps[index];
    if (
      preRestRows[0]?.canonicalStepType !== 'rest' ||
      pulseRows[0]?.vendorStepId !== '4' ||
      pulseRows[0]?.canonicalStepType === 'rest'
    ) {
      continue;
    }
    events.push({
      eventId: `${dataset.sourceFileHash}:dcr:${pulseRows[0].analysisStepId}`,
      preRestRows,
      pulseRows,
      protocolRole: 'dcr_pulse',
      config: {
        qcPolicyId: DCR_QC_POLICY_V1.id,
        currentResolutionA: measurementResolution.currentA.value,
        voltageResolutionV: measurementResolution.voltageV.value,
        currentResolutionEvidence: measurementResolution.currentA,
        voltageResolutionEvidence: measurementResolution.voltageV,
        requestedMetrics: [
          { kind: 'first_sample' },
          { kind: 'exact_time', label: 'DCR_5s', offsetTicks: 5000n, offsetResolutionNs: 1_000_000n },
          { kind: 'exact_time', label: 'DCR_10s', offsetTicks: 10000n, offsetResolutionNs: 1_000_000n },
          { kind: 'exact_time', label: 'DCR_30s', offsetTicks: 30000n, offsetResolutionNs: 1_000_000n },
        ],
        transitionLatencyKnown: false,
        transitionTimeBasis: 'step_boundary_tick',
        expectedPulseDurationS: 30,
      },
    });
  }
  return events;
}

export function buildNewareGittPulses(
  dataset: NewareCanonicalDataset,
  material: MaterialPresetV1,
  electrodeDiameterCm: number,
  options: NewareGittPulseBuildOptionsV1 = {},
): GittPulseInputV1[] {
  if (classifyNewareProfile(dataset).analysisKind !== 'gitt') return [];
  const steps = groupByStep(dataset.rows);
  const measurementResolution = deriveNewareMeasurementResolution(dataset.metadata);
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
