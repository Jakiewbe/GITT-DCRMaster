import type {
  CanonicalRowV1,
  DcrEventInputV1,
  DcrMetricResultV1,
  DcrRequestedMetricV1,
  QcFinding,
} from '../contracts';
import { median, robustCoefficientOfVariation } from '../math/statistics';
import { resolutionEvidenceFindings } from '../measurementResolution';
import { qcFinding, resultStateFromFindings } from '../qc';
import { compareCanonicalRows } from './time';
import { DCR_QC_POLICY_V1 } from './policy';

function orderedRows(rows: CanonicalRowV1[] | undefined): CanonicalRowV1[] {
  return [...(rows ?? [])].sort(compareCanonicalRows);
}

function metricName(metric: DcrRequestedMetricV1): string {
  if (metric.kind === 'two_current_terminal') return metric.label;
  if (metric.kind === 'first_sample') return 'DCR_first_sample';
  return metric.label;
}

function emptyResult(
  input: DcrEventInputV1,
  metric: DcrRequestedMetricV1,
  findings: QcFinding[],
): DcrMetricResultV1 {
  return {
    ...resultStateFromFindings(findings, 'not_computable'),
    eventId: input.eventId,
    protocolRole: input.protocolRole,
    requestedMetric: metricName(metric),
    requestedOffsetS: null,
    actualElapsedFromTransitionS: null,
    transitionLatencyKnown: input.config.transitionLatencyKnown,
    transitionTimeBasis: input.config.transitionTimeBasis,
    baselineRowId: null,
    targetRowIds: [],
    baselineVoltageV: null,
    baselineCurrentA: null,
    targetVoltageV: null,
    targetCurrentA: null,
    deltaVoltageV: null,
    deltaCurrentA: null,
    resistanceOhm: null,
    diagnosticCandidateResistanceOhm: null,
    calculationMethod: 'two_current_terminal_v1',
    smallTerminalRowId: null,
    largeTerminalRowId: null,
    smallTerminalVoltageV: null,
    largeTerminalVoltageV: null,
    smallCurrentA: null,
    largeCurrentA: null,
    baselineWindowMedianV: null,
    baselineLastPointMinusWindowMedianV: null,
    baselineFittedTransitionVoltageV: null,
    baselineLastPointMinusFittedV: null,
    baselineVoltageDriftMvPerMin: null,
    currentResolutionRatio: null,
    voltageSnr: null,
    pulseCurrentCv: null,
    targetCurrentDeviationFraction: null,
    relativeResistanceUncertainty: null,
    qcFindings: findings,
  };
}

function stepFindings(rows: CanonicalRowV1[], name: string): QcFinding[] {
  const findings: QcFinding[] = [];
  if (rows.length === 0) {
    findings.push(qcFinding(`${name}_stage_missing`, 'rejected', null, `The ${name} discharge stage has no valid records.`));
    return findings;
  }
  if (rows.some((row) => row.canonicalStepType !== 'discharge')) {
    findings.push(qcFinding(`${name}_step_type_invalid`, 'rejected', null, `The ${name} stage must be a discharge step.`));
  }
  if (new Set(rows.map((row) => row.analysisStepId)).size > 1) {
    findings.push(qcFinding(`${name}_multiple_steps`, 'rejected', null, `The ${name} stage must contain one analysis step.`));
  }
  return findings;
}

function stabilityFinding(code: string, value: number | null): QcFinding {
  if (value === null) return qcFinding(`${code}_unavailable`, 'review');
  if (value <= DCR_QC_POLICY_V1.pulseCurrentCv.validMaximum) return qcFinding(code, 'valid', value);
  if (value <= DCR_QC_POLICY_V1.pulseCurrentCv.reviewMaximum) return qcFinding(code, 'review', value);
  return qcFinding(code, 'rejected', value);
}

function analyzeMetric(input: DcrEventInputV1, metric: DcrRequestedMetricV1): DcrMetricResultV1 {
  const smallRows = orderedRows(input.smallDischargeRows);
  const largeRows = orderedRows(input.largeDischargeRows);
  const findings = [
    ...stepFindings(smallRows, 'small_current'),
    ...stepFindings(largeRows, 'large_current'),
    ...resolutionEvidenceFindings('current', input.config.currentResolutionA, input.config.currentResolutionEvidence),
    ...resolutionEvidenceFindings('voltage', input.config.voltageResolutionV, input.config.voltageResolutionEvidence),
  ];
  if (findings.some((finding) => finding.status === 'rejected')) return emptyResult(input, metric, findings);

  const smallTerminal = smallRows.at(-1);
  const largeTerminal = largeRows.at(-1);
  if (!smallTerminal || !largeTerminal) return emptyResult(input, metric, findings);

  if (!Number.isFinite(smallTerminal.voltageV) || !Number.isFinite(smallTerminal.currentA)) {
    findings.push(qcFinding('small_current_terminal_invalid', 'rejected', null, 'The final small-current discharge record is not finite.'));
  }
  if (!Number.isFinite(largeTerminal.voltageV) || !Number.isFinite(largeTerminal.currentA)) {
    findings.push(qcFinding('large_current_terminal_invalid', 'rejected', null, 'The final large-current discharge record is not finite.'));
  }
  if (smallRows.some((row) => !Number.isFinite(row.voltageV) || !Number.isFinite(row.currentA))) {
    findings.push(qcFinding('small_current_invalid_measurement', 'rejected', null, 'The small-current stage contains a non-finite voltage or current.'));
  }
  if (largeRows.some((row) => !Number.isFinite(row.voltageV) || !Number.isFinite(row.currentA))) {
    findings.push(qcFinding('large_current_invalid_measurement', 'rejected', null, 'The large-current stage contains a non-finite voltage or current.'));
  }
  if (findings.some((finding) => finding.status === 'rejected')) return emptyResult(input, metric, findings);

  // I1/I2 describe the applied stage currents. Use the stage median so a
  // single noisy record cannot replace the nominal current in the ratio;
  // E1/E2, by contrast, are explicitly the final valid stage voltages.
  const smallCurrentA = median(smallRows.map((row) => row.currentA));
  const largeCurrentA = median(largeRows.map((row) => row.currentA));
  const deltaVoltageV = smallTerminal.voltageV - largeTerminal.voltageV;
  const deltaCurrentA = smallCurrentA - largeCurrentA;
  const candidateResistanceOhm = deltaCurrentA === 0 ? null : deltaVoltageV / deltaCurrentA;
  let calculationState: 'computed' | 'not_computable' = 'computed';

  if (!Number.isFinite(deltaCurrentA) || deltaCurrentA === 0) {
    findings.push(qcFinding('zero_delta_current', 'rejected'));
    calculationState = 'not_computable';
  }
  if (candidateResistanceOhm !== null && !Number.isFinite(candidateResistanceOhm)) {
    findings.push(qcFinding('non_finite_resistance', 'rejected', candidateResistanceOhm));
    calculationState = 'not_computable';
  }
  if (!(Math.abs(largeCurrentA) > Math.abs(smallCurrentA))) {
    findings.push(qcFinding('large_current_not_larger', 'rejected', Math.abs(largeCurrentA), 'I2 must have a larger absolute current than I1.'));
    calculationState = 'not_computable';
  }

  const currentResolutionA = input.config.currentResolutionA;
  let currentResolutionRatio: number | null = null;
  if (currentResolutionA === null || !Number.isFinite(currentResolutionA) || currentResolutionA <= 0) {
    findings.push(qcFinding('current_resolution_missing', 'rejected'));
  } else if (deltaCurrentA !== 0) {
    currentResolutionRatio = Math.abs(deltaCurrentA) / currentResolutionA;
    findings.push(
      qcFinding(
        'delta_current_resolution_ratio',
        currentResolutionRatio >= DCR_QC_POLICY_V1.currentResolutionRatio.validMinimum
          ? 'valid'
          : currentResolutionRatio >= DCR_QC_POLICY_V1.currentResolutionRatio.computableMinimum
            ? 'review'
            : 'rejected',
        currentResolutionRatio,
      ),
    );
  }

  const smallCurrentCv = robustCoefficientOfVariation(smallRows.map((row) => row.currentA));
  const largeCurrentCv = robustCoefficientOfVariation(largeRows.map((row) => row.currentA));
  findings.push(stabilityFinding('small_current_cv', smallCurrentCv));
  findings.push(stabilityFinding('large_current_cv', largeCurrentCv));

  if (candidateResistanceOhm !== null && candidateResistanceOhm <= 0) {
    findings.push(qcFinding('polarity_inconsistent', 'rejected', candidateResistanceOhm, 'The signed paper formula must produce a positive resistance for this discharge pair.'));
  }

  const state = resultStateFromFindings(findings, calculationState);
  return {
    ...state,
    eventId: input.eventId,
    protocolRole: input.protocolRole,
    requestedMetric: metricName(metric),
    requestedOffsetS: null,
    actualElapsedFromTransitionS: null,
    transitionLatencyKnown: input.config.transitionLatencyKnown,
    transitionTimeBasis: input.config.transitionTimeBasis,
    baselineRowId: smallTerminal.rowId,
    targetRowIds: [largeTerminal.rowId],
    baselineVoltageV: smallTerminal.voltageV,
    baselineCurrentA: smallCurrentA,
    targetVoltageV: largeTerminal.voltageV,
    targetCurrentA: largeCurrentA,
    deltaVoltageV,
    deltaCurrentA,
    resistanceOhm: state.calculationState === 'computed' ? candidateResistanceOhm : null,
    diagnosticCandidateResistanceOhm: candidateResistanceOhm,
    calculationMethod: 'two_current_terminal_v1',
    smallTerminalRowId: smallTerminal.rowId,
    largeTerminalRowId: largeTerminal.rowId,
    smallTerminalVoltageV: smallTerminal.voltageV,
    largeTerminalVoltageV: largeTerminal.voltageV,
    smallCurrentA,
    largeCurrentA,
    baselineWindowMedianV: null,
    baselineLastPointMinusWindowMedianV: null,
    baselineFittedTransitionVoltageV: null,
    baselineLastPointMinusFittedV: null,
    baselineVoltageDriftMvPerMin: null,
    currentResolutionRatio,
    voltageSnr: null,
    pulseCurrentCv: null,
    targetCurrentDeviationFraction: null,
    relativeResistanceUncertainty: null,
    qcFindings: findings,
  };
}

export function analyzeTwoCurrentDcrEventV1(input: DcrEventInputV1): DcrMetricResultV1[] {
  if (input.protocolRole !== 'dcr_pulse') return [];
  const metrics = input.config.requestedMetrics;
  if (metrics.length === 0) return [];
  if (metrics.some((metric) => metric.kind !== 'two_current_terminal')) return [];
  return metrics.map((metric) => analyzeMetric(input, metric));
}
