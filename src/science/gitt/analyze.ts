import type {
  GittPulseInputV1,
  GittResultV1,
  ModelAssessmentV1,
  QcFinding,
  QcStatus,
} from '../contracts';
import { median, robustCoefficientOfVariation } from '../math/statistics';
import { resolutionEvidenceFindings } from '../measurementResolution';
import { qcFinding, resultStateFromFindings } from '../qc';
import {
  aggregateUniqueTicks,
  buildPulseTimeline,
  maximumResolutionSeconds,
  type TimedPulsePoint,
} from './aggregation';
import { selectFitWindow } from './fit';
import { analyzeEquivalentGeometry } from './geometry';
import {
  boundedStatus,
  GITT_QC_POLICY_V1 as POLICY,
  lowerBoundStatus,
  upperBoundStatus,
} from './policy';
import { diagnoseRest } from './rest';

const SENSITIVITIES = {
  mass: 2,
  diameter: -4,
  density: -2,
  deltaEs: 2,
  deltaEt: -2,
  pulseDuration: -1,
} as const;

function finite(value: number | null): value is number {
  return value !== null && Number.isFinite(value);
}

function modelAssessment(input: GittPulseInputV1): ModelAssessmentV1 & {
  metricKind: GittResultV1['metricKind'];
} {
  if (input.material.materialFamily === 'cfx_conversion') {
    return {
      modelFamily: 'WEPPNER_HUGGINS_PLANAR',
      modelApplicability: 'limited',
      interpretationScope: 'comparative_index_only',
      metricKind: 'wh_comparative_transport_index',
    };
  }
  if (input.material.materialFamily === 'layered_insertion') {
    return {
      modelFamily: 'WEPPNER_HUGGINS_PLANAR',
      modelApplicability: 'supported',
      interpretationScope: 'solid_state_chemical_diffusivity',
      metricKind: 'apparent_chemical_diffusivity',
    };
  }
  return {
    modelFamily: 'WEPPNER_HUGGINS_PLANAR',
    modelApplicability: 'limited',
    interpretationScope: 'model_dependent_apparent_transport',
    metricKind: 'apparent_chemical_diffusivity',
  };
}

function addMetricFinding(
  findings: QcFinding[],
  code: string,
  metric: number | null,
  status: QcStatus,
  message?: string,
): void {
  findings.push(qcFinding(code, status, finite(metric) ? metric : null, message));
}

function addUpperBoundFinding(
  findings: QcFinding[],
  code: string,
  metric: number | null,
  validMaximum: number,
  reviewMaximum: number,
  missingStatus: QcStatus = 'rejected',
): void {
  addMetricFinding(
    findings,
    code,
    metric,
    finite(metric) ? upperBoundStatus(metric, validMaximum, reviewMaximum) : missingStatus,
  );
}

function addLowerBoundFinding(
  findings: QcFinding[],
  code: string,
  metric: number | null,
  validMinimum: number,
  reviewMinimum: number,
  missingStatus: QcStatus = 'rejected',
): void {
  addMetricFinding(
    findings,
    code,
    metric,
    finite(metric) ? lowerBoundStatus(metric, validMinimum, reviewMinimum) : missingStatus,
  );
}

function integratePulseCapacityAh(timeline: TimedPulsePoint[]): {
  capacityAh: number | null;
  coverageFraction: number | null;
} {
  if (timeline.length < 2) return { capacityAh: null, coverageFraction: null };
  let chargeAs = 0;
  for (let index = 1; index < timeline.length; index += 1) {
    const deltaTimeS = timeline[index].timeS - timeline[index - 1].timeS;
    if (!(deltaTimeS >= 0) || !Number.isFinite(deltaTimeS)) return { capacityAh: null, coverageFraction: null };
    if (deltaTimeS === 0) continue;
    chargeAs +=
      ((timeline[index - 1].currentA + timeline[index].currentA) / 2) * deltaTimeS;
  }
  const pulseDurationS = Math.max(...timeline.map((point) => point.timeS));
  const coveredDurationS =
    Math.max(...timeline.map((point) => point.timeS)) - Math.min(...timeline.map((point) => point.timeS));
  return {
    capacityAh: chargeAs / 3_600,
    coverageFraction: pulseDurationS > 0 ? coveredDurationS / pulseDurationS : null,
  };
}

function relativeMetricUncertainty(
  metric: number | null,
  lengthCm: number | null,
  lengthUncertaintyCm: number | null,
  deltaEsV: number | null,
  deltaEsUncertaintyV: number | null,
  deltaEtV: number | null,
  deltaEtUncertaintyV: number | null,
  pulseDurationS: number | null,
  pulseDurationUncertaintyS: number | null,
): number | null {
  if (
    !finite(metric) ||
    !finite(lengthCm) ||
    !finite(lengthUncertaintyCm) ||
    !finite(deltaEsV) ||
    !finite(deltaEsUncertaintyV) ||
    !finite(deltaEtV) ||
    !finite(deltaEtUncertaintyV) ||
    !finite(pulseDurationS) ||
    !finite(pulseDurationUncertaintyS) ||
    deltaEsV === 0 ||
    deltaEtV === 0 ||
    pulseDurationS === 0
  ) {
    return null;
  }
  return Math.sqrt(
    (2 * lengthUncertaintyCm / lengthCm) ** 2 +
      (2 * deltaEsUncertaintyV / Math.abs(deltaEsV)) ** 2 +
      (2 * deltaEtUncertaintyV / Math.abs(deltaEtV)) ** 2 +
      (pulseDurationUncertaintyS / pulseDurationS) ** 2,
  );
}

/**
 * Executes the manual endpoint form used by the operator:
 * D = 4/(pi*tau) * L_equivalent^2 * (DeltaEs/DeltaEt)^2.
 * Regression remains an auxiliary plot/diagnostic and never gates a finite
 * endpoint calculation from the main result.
 */
export function analyzeGittPulse(input: GittPulseInputV1): GittResultV1 {
  const assessment = modelAssessment(input);
  const findings: QcFinding[] = [];
  if (input.config.qcPolicyId !== POLICY.id) {
    findings.push(
      qcFinding(
        'qc_policy_id_mismatch',
        'rejected',
        null,
        `Requested ${input.config.qcPolicyId}; this implementation is frozen to ${POLICY.id}.`,
      ),
    );
  }
  findings.push(
    ...resolutionEvidenceFindings(
      'voltage',
      input.config.voltageResolutionV,
      input.config.voltageResolutionEvidence,
    ),
  );

  for (const [label, rows] of [
    ['pre_rest', input.preRestRows],
    ['pulse', input.pulseRows],
    ['post_rest', input.postRestRows],
  ] as const) {
    for (const row of rows) {
      if (!Number.isFinite(row.voltageV) || !Number.isFinite(row.currentA)) {
        findings.push(qcFinding(`${label}_non_finite_measurement`, 'rejected'));
        break;
      }
      if (row.timeResolutionNs <= 0n) {
        findings.push(qcFinding(`${label}_invalid_time_resolution`, 'rejected'));
        break;
      }
    }
  }

  const preRest = diagnoseRest(input.preRestRows, 'pre_rest', input.config.voltageResolutionV);
  const postRest = diagnoseRest(input.postRestRows, 'post_rest', input.config.voltageResolutionV);
  findings.push(...preRest.findings, ...postRest.findings);

  const geometry = analyzeEquivalentGeometry(input);
  findings.push(...geometry.findings);

  const pulseTicks = aggregateUniqueTicks(input.pulseRows);
  const pulseStepIds = new Set(pulseTicks.map((point) => point.analysisStepId));
  if (pulseTicks.length === 0) findings.push(qcFinding('pulse_absent', 'rejected'));
  if (pulseStepIds.size !== 1) {
    findings.push(
      qcFinding(
        'pulse_multiple_analysis_steps',
        'rejected',
        pulseStepIds.size,
        'GITT pulse input must contain exactly one analysis step; equal ticks across steps are never merged.',
      ),
    );
  }
  const timeline = buildPulseTimeline(pulseTicks);
  if (timeline.some((point) => point.timeS < 0) || timeline.some((point, index) => index > 0 && point.timeS < timeline[index - 1].timeS)) {
    findings.push(qcFinding('pulse_time_axis_invalid', 'rejected'));
  }
  const pulseDurationS = timeline.length ? Math.max(...timeline.map((point) => point.timeS)) : null;
  if (!finite(pulseDurationS) || pulseDurationS <= 0) {
    findings.push(qcFinding('pulse_duration_invalid', 'rejected', pulseDurationS));
  }
  const pulseEndPoint = timeline.length
    ? timeline.reduce((latest, point) => (point.timeS > latest.timeS ? point : latest), timeline[0])
    : null;
  const loadedPulsePoints = timeline.filter((point) => point.timeS > 0);
  const pulseStartPoint = loadedPulsePoints.length
    ? loadedPulsePoints.reduce(
        (earliest, point) => (point.timeS < earliest.timeS ? point : earliest),
        loadedPulsePoints[0],
      )
    : null;
  const pulseStartVoltageV = pulseStartPoint?.voltageV ?? null;
  const pulseEndVoltageV = pulseEndPoint?.voltageV ?? null;
  const noiseFloorV = Math.max(
    input.config.voltageResolutionV ?? 0,
    preRest.diagnostics.voltageNoiseFloorV ?? 0,
    postRest.diagnostics.voltageNoiseFloorV ?? 0,
  );

  const fitSelection = selectFitWindow(
    timeline,
    finite(pulseDurationS) ? pulseDurationS : 0,
    noiseFloorV,
    input.config.fitWindowOverride,
  );
  findings.push(...fitSelection.findings);
  const fit = fitSelection.evaluation;
  if (fit) {
    for (const point of fit.points) {
      if (
        point.sourceRowCount > 1 &&
        point.voltageSpanV >
          POLICY.duplicateTickVoltageNoiseMultiplier * Math.max(noiseFloorV, Number.EPSILON)
      ) {
        findings.push(
          qcFinding(
            'fit_duplicate_tick_voltage_conflict',
            'rejected',
            point.voltageSpanV,
            'Duplicate source rows at a fitted tick disagree beyond three noise floors.',
          ),
        );
      }
    }
  }

  const preRestEndPotentialV = preRest.diagnostics.restEndPotentialV;
  const postRestEndPotentialV = postRest.diagnostics.restEndPotentialV;
  const deltaEsV =
    finite(preRestEndPotentialV) && finite(postRestEndPotentialV)
      ? postRestEndPotentialV - preRestEndPotentialV
      : null;
  const fitEndTimeS = fit ? fit.points[fit.points.length - 1].timeS : null;
  const lengthCm = geometry.activeMaterialEquivalentThicknessCm;
  const deltaEtV =
    finite(pulseStartVoltageV) && finite(pulseEndVoltageV)
      ? pulseEndVoltageV - pulseStartVoltageV
      : null;
  let diagnosticCandidateMetricValueCm2PerS: number | null = null;
  if (
    finite(deltaEsV) &&
    finite(deltaEtV) &&
    deltaEtV !== 0 &&
    finite(lengthCm) &&
    finite(pulseDurationS) &&
    pulseDurationS > 0
  ) {
    const candidate =
      (4 / (Math.PI * pulseDurationS)) *
      lengthCm ** 2 *
      (deltaEsV / deltaEtV) ** 2;
    if (Number.isFinite(candidate) && candidate >= 0) diagnosticCandidateMetricValueCm2PerS = candidate;
  }

  const predictedDeltaEAtTauV =
    fit && finite(pulseDurationS) ? fit.slope * Math.sqrt(pulseDurationS) : null;
  const observedDeltaEAtTauV = deltaEtV;
  const endpointConsistencyRatio =
    finite(predictedDeltaEAtTauV) && predictedDeltaEAtTauV !== 0 && finite(observedDeltaEAtTauV)
      ? observedDeltaEAtTauV / predictedDeltaEAtTauV
      : null;
  const endpointConsistencyRelativeError =
    finite(predictedDeltaEAtTauV) && finite(observedDeltaEAtTauV)
      ? Math.abs(observedDeltaEAtTauV - predictedDeltaEAtTauV) /
        Math.max(
          Math.abs(observedDeltaEAtTauV),
          Math.abs(predictedDeltaEAtTauV),
          5 * noiseFloorV,
        )
      : null;
  const dimensionlessFitTime =
    finite(diagnosticCandidateMetricValueCm2PerS) && finite(fitEndTimeS) && finite(lengthCm) && lengthCm > 0
      ? (diagnosticCandidateMetricValueCm2PerS * fitEndTimeS) / lengthCm ** 2
      : null;
  const dimensionlessPulseTime =
    finite(diagnosticCandidateMetricValueCm2PerS) && finite(pulseDurationS) && finite(lengthCm) && lengthCm > 0
      ? (diagnosticCandidateMetricValueCm2PerS * pulseDurationS) / lengthCm ** 2
      : null;

  const currentValues = timeline.map((point) => point.currentA);
  const pulseCurrentCv = currentValues.length >= 2 ? robustCoefficientOfVariation(currentValues) : null;
  const medianPulseCurrentA = currentValues.length ? median(currentValues) : null;
  if (!finite(medianPulseCurrentA) || medianPulseCurrentA === 0) {
    findings.push(qcFinding('pulse_current_zero_or_unavailable', 'rejected', medianPulseCurrentA));
  }

  const integratedCapacity = integratePulseCapacityAh(timeline);
  let pulseCapacityFraction: number | null = null;
  if (input.config.qrefAh !== null && Number.isFinite(input.config.qrefAh) && input.config.qrefAh > 0) {
    if (integratedCapacity.capacityAh !== null) {
      pulseCapacityFraction = Math.abs(integratedCapacity.capacityAh / input.config.qrefAh);
    }
  } else {
    findings.push(
      qcFinding(
        'pulse_capacity_qref_unavailable',
        'rejected',
        input.config.qrefAh,
        'Small-perturbation applicability cannot be established without an explicit positive Qref.',
      ),
    );
  }
  if (integratedCapacity.coverageFraction === null) {
    findings.push(qcFinding('pulse_capacity_integration_unavailable', 'rejected'));
  } else {
    const coverageStatus =
      integratedCapacity.coverageFraction >= POLICY.pulseCapacityTimeCoverage.validMinimum
        ? 'valid'
        : integratedCapacity.coverageFraction >= POLICY.pulseCapacityTimeCoverage.reviewMinimum
          ? 'review'
          : 'rejected';
    findings.push(
      qcFinding('pulse_capacity_time_coverage', coverageStatus, integratedCapacity.coverageFraction),
    );
  }

  const equilibriumVoltageStepV = finite(deltaEsV) ? Math.abs(deltaEsV) : null;
  const deltaEsStandardUncertaintyV =
    preRest.endPotentialStandardUncertaintyV !== null &&
    postRest.endPotentialStandardUncertaintyV !== null
      ? Math.sqrt(
          preRest.endPotentialStandardUncertaintyV ** 2 +
            postRest.endPotentialStandardUncertaintyV ** 2,
        )
      : null;
  const pulseDurationStandardUncertaintyS = timeline.length
    ? maximumResolutionSeconds(pulseTicks) / Math.sqrt(6)
    : null;
  const deltaEtStandardUncertaintyV = Number.isFinite(noiseFloorV)
    ? Math.SQRT2 * noiseFloorV
    : null;
  const relativeUncertainty = relativeMetricUncertainty(
    diagnosticCandidateMetricValueCm2PerS,
    lengthCm,
    geometry.equivalentThicknessStandardUncertaintyCm,
    deltaEsV,
    deltaEsStandardUncertaintyV,
    deltaEtV,
    deltaEtStandardUncertaintyV,
    pulseDurationS,
    pulseDurationStandardUncertaintyS,
  );
  const metricStandardUncertainty =
    finite(diagnosticCandidateMetricValueCm2PerS) && finite(relativeUncertainty)
      ? diagnosticCandidateMetricValueCm2PerS * relativeUncertainty
      : null;
  const metricExpandedUncertaintyK2 =
    metricStandardUncertainty === null ? null : 2 * metricStandardUncertainty;

  if (fit) {
    const pointCountStatus =
      fit.points.length >= POLICY.fitPointCount.validMinimum
        ? 'valid'
        : fit.points.length >= POLICY.fitPointCount.reviewMinimum
          ? 'review'
          : 'rejected';
    addMetricFinding(findings, 'fit_unique_tick_count', fit.points.length, pointCountStatus);
    addLowerBoundFinding(
      findings,
      'fit_r_squared',
      fit.rSquared,
      POLICY.rSquared.validMinimum,
      POLICY.rSquared.reviewMinimum,
    );
    const slopeSignalRatio =
      fit.slopeStandardError === 0
        ? null
        : Number.isFinite(fit.slopeStandardError)
          ? Math.abs(fit.slope / fit.slopeStandardError)
          : null;
    addMetricFinding(
      findings,
      'fit_slope_signal_ratio',
      slopeSignalRatio,
      fit.slopeStandardError === 0
        ? 'valid'
        : finite(slopeSignalRatio)
          ? lowerBoundStatus(
              slopeSignalRatio,
              POLICY.slopeSignalRatio.validMinimum,
              POLICY.slopeSignalRatio.reviewMinimum,
            )
          : 'rejected',
    );
    addUpperBoundFinding(
      findings,
      'fit_curvature_metric',
      fit.curvatureMetric,
      POLICY.curvatureMetric.validMaximum,
      POLICY.curvatureMetric.reviewMaximum,
    );
    addUpperBoundFinding(
      findings,
      'fit_normalized_max_residual',
      fit.normalizedMaxResidual,
      POLICY.normalizedMaxResidual.validMaximum,
      POLICY.normalizedMaxResidual.reviewMaximum,
    );
    if (fit.points.length >= 8) {
      addMetricFinding(
        findings,
        'fit_durbin_watson',
        fit.durbinWatson,
        finite(fit.durbinWatson)
          ? boundedStatus(
              fit.durbinWatson,
              POLICY.durbinWatson.validMinimum,
              POLICY.durbinWatson.validMaximum,
              POLICY.durbinWatson.reviewMinimum,
              POLICY.durbinWatson.reviewMaximum,
            )
          : 'rejected',
      );
    }
    addLowerBoundFinding(
      findings,
      'fit_monotonicity_fraction',
      fit.monotonicityFraction,
      POLICY.monotonicityFraction.validMinimum,
      POLICY.monotonicityFraction.reviewMinimum,
      'review',
    );
    addUpperBoundFinding(
      findings,
      'fit_window_sensitivity_fraction',
      fitSelection.diagnostics.windowSensitivityFraction,
      POLICY.windowSensitivityFraction.validMaximum,
      POLICY.windowSensitivityFraction.reviewMaximum,
      'review',
    );
  }

  addUpperBoundFinding(
    findings,
    'dimensionless_pulse_time',
    dimensionlessPulseTime,
    POLICY.dimensionlessPulseTime.validMaximum,
    POLICY.dimensionlessPulseTime.reviewMaximum,
  );
  addUpperBoundFinding(
    findings,
    'dimensionless_fit_time',
    dimensionlessFitTime,
    POLICY.dimensionlessFitTime.validMaximum,
    POLICY.dimensionlessFitTime.reviewMaximum,
  );
  const fitEndFraction =
    finite(fitEndTimeS) && finite(pulseDurationS) && pulseDurationS > 0
      ? fitEndTimeS / pulseDurationS
      : null;
  addUpperBoundFinding(
    findings,
    'fit_end_fraction_of_pulse',
    fitEndFraction,
    POLICY.fitEndFraction.validMaximum,
    POLICY.fitEndFraction.reviewMaximum,
  );
  addUpperBoundFinding(
    findings,
    'endpoint_consistency_relative_error',
    endpointConsistencyRelativeError,
    POLICY.endpointConsistencyError.validMaximum,
    POLICY.endpointConsistencyError.reviewMaximum,
  );
  addUpperBoundFinding(
    findings,
    'pulse_capacity_fraction',
    pulseCapacityFraction,
    POLICY.pulseCapacityFraction.validMaximum,
    POLICY.pulseCapacityFraction.reviewMaximum,
  );
  addUpperBoundFinding(
    findings,
    'equilibrium_voltage_step',
    equilibriumVoltageStepV,
    POLICY.equilibriumVoltageStepV.validMaximum,
    POLICY.equilibriumVoltageStepV.reviewMaximum,
  );
  addUpperBoundFinding(
    findings,
    'pulse_current_cv',
    pulseCurrentCv,
    POLICY.pulseCurrentCv.validMaximum,
    POLICY.pulseCurrentCv.reviewMaximum,
  );
  addUpperBoundFinding(
    findings,
    'relative_equivalent_length_uncertainty',
    geometry.relativeEquivalentThicknessUncertainty,
    POLICY.relativeLengthUncertainty.validMaximum,
    POLICY.relativeLengthUncertainty.reviewMaximum,
    'review',
  );
  addUpperBoundFinding(
    findings,
    'relative_metric_uncertainty',
    relativeUncertainty,
    POLICY.relativeMetricUncertainty.validMaximum,
    POLICY.relativeMetricUncertainty.reviewMaximum,
    'review',
  );

  if (finite(deltaEsV) && finite(deltaEsStandardUncertaintyV)) {
    const deltaSignalRatio =
      deltaEsStandardUncertaintyV === 0 ? null : Math.abs(deltaEsV) / deltaEsStandardUncertaintyV;
    addMetricFinding(
      findings,
      'delta_es_signal_ratio',
      deltaSignalRatio,
      deltaEsStandardUncertaintyV === 0 && deltaEsV !== 0
        ? 'valid'
        : finite(deltaSignalRatio)
          ? lowerBoundStatus(deltaSignalRatio, 10, 5)
          : 'rejected',
    );
  } else {
    addMetricFinding(findings, 'delta_es_signal_ratio', null, 'rejected');
  }

  if (finite(deltaEsV) && finite(deltaEtV)) {
    if (deltaEsV === 0 || deltaEtV === 0 || Math.sign(deltaEsV) !== Math.sign(deltaEtV)) {
      findings.push(
        qcFinding(
          'delta_es_delta_et_direction_mismatch',
          'rejected',
          null,
          'The signed rest-end and pulse-end voltage changes point in opposite directions.',
        ),
      );
    }
  }

  if (fit && finite(deltaEsV)) {
    if (deltaEsV === 0 || fit.slope === 0 || Math.sign(deltaEsV) !== Math.sign(fit.slope)) {
      findings.push(
        qcFinding(
          'delta_es_slope_direction_mismatch',
          'rejected',
          null,
          'Squaring the WH expression must not conceal a zero or opposite-sign rest-end potential response.',
        ),
      );
    }
    if (
      finite(observedDeltaEAtTauV) &&
      (observedDeltaEAtTauV === 0 || Math.sign(observedDeltaEAtTauV) !== Math.sign(fit.slope))
    ) {
      findings.push(qcFinding('pulse_endpoint_slope_direction_mismatch', 'rejected'));
    }
    if (
      finite(medianPulseCurrentA) &&
      medianPulseCurrentA !== 0 &&
      Math.sign(medianPulseCurrentA) !== Math.sign(fit.slope)
    ) {
      findings.push(qcFinding('pulse_current_slope_direction_mismatch', 'rejected'));
    }
  }

  if (!finite(diagnosticCandidateMetricValueCm2PerS)) {
    findings.push(
      qcFinding(
        'wh_metric_not_computable',
        'rejected',
        null,
        'The manual WH endpoint metric requires finite L_equivalent, non-zero signed DeltaEs/DeltaEt, and the complete pulse duration.',
      ),
    );
  }
  if (finite(diagnosticCandidateMetricValueCm2PerS) && diagnosticCandidateMetricValueCm2PerS === 0) {
    findings.push(qcFinding('wh_metric_zero', 'rejected', 0));
  }

  const hardCalculationFailure = findings.some((finding) =>
    finding.code.endsWith('_non_finite_measurement') ||
    finding.code.endsWith('_invalid_time_resolution') ||
    [
      'pulse_absent',
      'pulse_multiple_analysis_steps',
      'pulse_time_axis_invalid',
      'pulse_duration_invalid',
    ].includes(finding.code),
  );
  const calculationState = finite(diagnosticCandidateMetricValueCm2PerS) && !hardCalculationFailure
    ? 'computed'
    : 'not_computable';
  const state = resultStateFromFindings(findings, calculationState);
  const metricValueCm2PerS = calculationState === 'computed'
    ? diagnosticCandidateMetricValueCm2PerS
    : null;
  const socPrePulse = input.socPrePulse ?? null;

  return {
    ...state,
    modelFamily: assessment.modelFamily,
    modelApplicability: assessment.modelApplicability,
    interpretationScope: assessment.interpretationScope,
    pulseId: input.pulseId,
    metricKind: assessment.metricKind,
    calculationMethod: 'wh_planar_manual_endpoint',
    metricValueCm2PerS,
    diagnosticCandidateMetricValueCm2PerS,
    activeMassG: Number.isFinite(input.config.activeMassG) ? input.config.activeMassG : null,
    activeMassSourceId: input.config.activeMassSourceId ?? null,
    singleFaceAreaCm2: geometry.singleFaceAreaCm2,
    activeMaterialEquivalentThicknessCm: lengthCm,
    pulseDurationS,
    fitEndTimeS,
    preRestEndPotentialV,
    postRestEndPotentialV,
    deltaEsV,
    pulseStartVoltageV,
    pulseEndVoltageV,
    deltaEtV,
    pulseBaselineExtrapolatedV: fit?.intercept ?? null,
    predictedDeltaEAtTauV,
    observedDeltaEAtTauV,
    endpointConsistencyRatio,
    endpointConsistencyRelativeError,
    dimensionlessFitTime,
    dimensionlessPulseTime,
    pulseCapacityFraction,
    equilibriumVoltageStepV,
    pulseCurrentCv,
    socCalculationState: socPrePulse?.calculationState ?? 'not_requested',
    socQcStatus: socPrePulse?.qcStatus ?? null,
    socQcCodes: socPrePulse?.qcCodes ?? [],
    socPrePulsePct: socPrePulse?.socPct ?? null,
    dodPrePulsePct: socPrePulse?.dodPct ?? null,
    remainingCapacityPct: socPrePulse?.remainingCapacityPct ?? null,
    cumulativeNetCapacityAh: socPrePulse?.cumulativeNetCapacityAh ?? null,
    socCapacitySource: socPrePulse?.capacitySource ?? null,
    metricStandardUncertainty,
    metricExpandedUncertaintyK2,
    uncertaintyScope: 'measurement_and_input_only_model_discrepancy_excluded',
    sensitivities: SENSITIVITIES,
    preRestDiagnostics: preRest.diagnostics,
    postRestDiagnostics: postRest.diagnostics,
    fitDiagnostics: fitSelection.diagnostics,
    qcFindings: findings,
  };
}
