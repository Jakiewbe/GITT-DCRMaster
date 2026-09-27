export type CalculationState = 'computed' | 'not_computable' | 'not_requested';
export type QcStatus = 'valid' | 'review' | 'rejected';
export type QcReasonSeverityV1 = 'info' | 'review' | 'reject';
export type QcReasonDomainV1 =
  | 'data'
  | 'protocol'
  | 'endpoint_model'
  | 'cfx10_slope'
  | 'sampling'
  | 'material_input';

export type PrimaryComparisonEligibilityV1 =
  | 'included'
  | 'included_with_warnings'
  | 'excluded';

export type ScientificResultStateV1 = {
  calculationState: CalculationState;
  qcStatus: QcStatus | null;
  qcCodes: string[];
};

export type ModelAssessmentV1 = {
  modelFamily: 'WEPPNER_HUGGINS_PLANAR';
  modelApplicability: 'supported' | 'limited' | 'unsupported';
  interpretationScope:
    | 'solid_state_chemical_diffusivity'
    | 'model_dependent_apparent_transport'
    | 'comparative_index_only';
};

/**
 * Provenance for a numeric resolution used by an analysis. A record-storage
 * bound is deliberately not represented as a manufacturer instrument
 * specification: it can support a provisional calculation, but it must keep
 * the result in review until an approved profile supplies device evidence.
 */
export type MeasurementResolutionSourceV1 =
  | 'vendor_profile_declared'
  | 'vendor_oracle_validated_raw_code_lsb'
  | 'record_storage_float32_full_scale_bound'
  | 'advanced_user_override'
  | 'unavailable';

export type MeasurementResolutionEvidenceV1 = {
  value: number | null;
  /** Source full-scale range when the bound is derived from record storage. */
  basisValue: number | null;
  source: MeasurementResolutionSourceV1;
  provisional: boolean;
  message: string | null;
};

export type MeasurementResolutionSetV1 = {
  currentA: MeasurementResolutionEvidenceV1;
  voltageV: MeasurementResolutionEvidenceV1;
};

export type CanonicalStepType = 'rest' | 'charge' | 'discharge' | 'unknown';

export type CanonicalSourceV1 = {
  sourceFileId: string;
  sourceFileHash: string;
  instrumentId: string | null;
  channelId: string | null;
  sourceStream: string;
  sourceSheet: string | null;
  sourceRowIndex: bigint;
  sourceRecordSequence: bigint;
  parserVersion: string;
};

export type CanonicalTimeV1 = {
  elapsedTimeTicks: bigint;
  stepElapsedTimeTicks: bigint | null;
  timeResolutionNs: bigint;
  recordSequence: bigint;
  elapsedTimeS: number;
};

export type CanonicalRowV1 = CanonicalSourceV1 &
  CanonicalTimeV1 & {
    rowId: string;
    voltageV: number;
    currentA: number;
    temperatureC: number | null;
    vendorStepId: string | null;
    vendorStepType: string | null;
    analysisStepId: string;
    canonicalStepType: CanonicalStepType;
    chargeCapacityAh: number | null;
    dischargeCapacityAh: number | null;
    netCapacityAh: number | null;
  };

export type MaterialPresetV1 = {
  materialPresetId: string;
  materialFamily: 'cfx_conversion' | 'layered_insertion' | 'custom';
  displayName: string;
  molarMassGPerMol: number;
  densityGPerCm3: number | null;
  densitySource: string | null;
  densityMethod: string | null;
  densityStandardUncertainty: number | null;
  molarVolumeCm3PerMol: number;
  molarVolumeAuthority: 'derived_from_density' | 'explicit_override';
  theoreticalSpecificCapacityMahPerG: number | null;
  presetVersion: string;
  userOverridden: boolean;
};

export type GeometryInputV1 = {
  activeMassG: number;
  electrodeDiameterCm: number;
  activeMassStandardUncertaintyG: number | null;
  electrodeDiameterStandardUncertaintyCm: number | null;
};

export type GeometryResultV1 = ScientificResultStateV1 & {
  singleFaceAreaCm2: number | null;
  activeMaterialEquivalentThicknessCm: number | null;
  equivalentThicknessStandardUncertaintyCm: number | null;
  relativeEquivalentThicknessUncertainty: number | null;
  molarVolumeConsistencyRatio: number | null;
};

export type SocBasisV1 = {
  qrefAh: number;
  qrefSource: 'theoretical' | 'rated' | 'measured';
  initialSocPct: number | null;
  initialSocSource: 'fresh_cell_assumption' | 'user_input' | 'preceding_dataset' | 'unknown';
  integrationMode: 'net_coulomb';
  chargeCoulombicEfficiency: 1;
  dischargeCoulombicEfficiency: 1;
};

export type SocPointV1 = ScientificResultStateV1 & {
  rowId: string | null;
  cumulativeNetCapacityAh: number | null;
  socPct: number | null;
  dodPct: number | null;
  remainingCapacityPct: number | null;
  capacitySource: 'vendor' | 'integrated' | null;
};

export type QcFinding = {
  code: string;
  status: QcStatus;
  metric?: number | null;
  message?: string;
  severity?: QcReasonSeverityV1;
  domain?: QcReasonDomainV1;
  value?: number | null;
  threshold?: number | null;
  sourceRule?: string;
};

/** Stable, exportable explanation for a QC decision. */
export type QcReasonV1 = {
  code: string;
  severity: QcReasonSeverityV1;
  domain: QcReasonDomainV1;
  value: number | null;
  threshold: number | null;
  sourceRule: string;
  message: string;
};

export type RestDiagnosticsV1 = ScientificResultStateV1 & {
  restEndPotentialV: number | null;
  restSlopeMvPerMin: number | null;
  restVoltageMadMv: number | null;
  restVoltageRangeMv: number | null;
  voltageNoiseFloorV: number | null;
  uniqueTickCount: number;
  sourceRowCount: number;
  contributingRowIds: string[];
};

export type RestEndSensitivityAuditV1 = {
  /** Actual formal tail duration: min(rest duration, max(60 s, 20% duration)). */
  restEndCurrentWindowS: number | null;
  restEndCurrentWindowV: number | null;
  restEnd15minV: number | null;
  restEnd5minV: number | null;
  /** Final CanonicalRow voltage, kept outside the robust-estimator spread. */
  restEndRawLastPointV: number | null;
  restEndCurrentVs15minV: number | null;
  restEnd15minVs5minV: number | null;
  restEndCurrentVs5minV: number | null;
  restEnd5minVsRawV: number | null;
  /** Spread of current, 15 min, and 5 min robust estimates only. */
  restEndRobustSpreadV: number | null;
};

export type GittRestEndSensitivityAuditV1 = {
  preRest: RestEndSensitivityAuditV1;
  postRest: RestEndSensitivityAuditV1;
  deltaEsCurrentV: number | null;
  deltaEs15minV: number | null;
  deltaEs5minV: number | null;
  dCurrentCm2PerS: number | null;
  d15minCm2PerS: number | null;
  d5minCm2PerS: number | null;
  log10DCurrentVs15min: number | null;
  log10D15minVs5min: number | null;
  log10DCurrentVs5min: number | null;
};

export type FitWindowOverrideV1 = {
  startElapsedTimeTicks: bigint;
  endElapsedTimeTicks: bigint;
  reason: string;
};

export type GittRegressionWindowSpecV1 =
  | {
      kind: 'legacy_first_5';
      id: 'legacy_first_5';
      label: string;
    }
  | {
      kind: 'fixed_time';
      id: string;
      label: string;
      startS: number;
      endS: number;
      /** Lower bound defaults to inclusive for existing research windows. */
      startBoundary?: 'inclusive' | 'exclusive';
    };

export type GittRegressionWindowStatusV1 = 'valid' | 'review' | 'infeasible';
export type GittRegressionWindowSamplingCoverageV1 =
  | 'full'
  | 'partial'
  | 'infeasible'
  | 'not_applicable';
export type GittRegressionWindowLinearityClassV1 =
  | 'strong_linearity'
  | 'acceptable_review'
  | 'early_response_nonlinear'
  | 'unavailable';

export type GittRegressionWindowResultV1 = {
  windowId: string;
  windowLabel: string;
  kind: GittRegressionWindowSpecV1['kind'];
  requestedStartS: number | null;
  requestedEndS: number | null;
  actualStartS: number | null;
  actualEndS: number | null;
  pointCount: number;
  uniqueTimePointCount: number;
  fitDurationS: number | null;
  fitEndFractionOfPulse: number | null;
  slopeVPerSqrtS: number | null;
  interceptV: number | null;
  rSquared: number | null;
  rmseV: number | null;
  slopeStdError: number | null;
  curvatureMetric: number | null;
  maxNormalizedResidual: number | null;
  monotonicityRatio: number | null;
  durbinWatson: number | null;
  metricValueCm2PerS: number | null;
  windowCoverageIncomplete: boolean;
  samplingCoverage: GittRegressionWindowSamplingCoverageV1;
  linearityClass: GittRegressionWindowLinearityClassV1;
  status: GittRegressionWindowStatusV1;
  warnings: string[];
};

export type GittAnalysisConfigV1 = {
  qcPolicyId: string;
  currentResolutionA: number | null;
  currentResolutionEvidence?: MeasurementResolutionEvidenceV1;
  voltageResolutionV: number | null;
  voltageResolutionEvidence?: MeasurementResolutionEvidenceV1;
  fitWindowOverride: FitWindowOverrideV1 | null;
  /** Optional multi-window validation; absent means the standard presets. */
  regressionWindows?: GittRegressionWindowSpecV1[];
  qrefAh: number | null;
  activeMassG: number;
  /**
   * Stable evidence identifier for the mass actually used in this pulse.
   * It is provenance only; the numeric value remains `activeMassG`.
   */
  activeMassSourceId?: string | null;
  electrodeDiameterCm: number;
  /** Optional advanced evidence; ordinary analysis leaves these unavailable. */
  activeMassStandardUncertaintyG?: number | null;
  electrodeDiameterStandardUncertaintyCm?: number | null;
};

export type GittPulseInputV1 = {
  pulseId: string;
  preRestRows: CanonicalRowV1[];
  pulseRows: CanonicalRowV1[];
  postRestRows: CanonicalRowV1[];
  material: MaterialPresetV1;
  config: GittAnalysisConfigV1;
  socPrePulse?: SocPointV1 | null;
};

export type GittFitDiagnosticsV1 = {
  requestedFitWindow: { startS: number; endS: number } | null;
  actualFitWindow: { startS: number; endS: number } | null;
  windowSelectionMode: 'fixed_first_five' | 'manual';
  manualOverrideReason: string | null;
  expectedUniquePointsInFitWindow: number;
  minimumSamplingFrequencyRequiredHz: number | null;
  fitUniqueTickCount: number;
  fitSourceRowCount: number;
  fitContributingRowIds: string[];
  slopeVPerSqrtS: number | null;
  slopeStandardUncertainty: number | null;
  interceptV: number | null;
  rSquared: number | null;
  rmseV: number | null;
  durbinWatson: number | null;
  curvatureMetric: number | null;
  normalizedMaxResidual: number | null;
  monotonicityFraction: number | null;
  windowSensitivityFraction: number | null;
};

export type GittResultV1 = ScientificResultStateV1 &
  ModelAssessmentV1 & {
    pulseId: string;
    metricKind: 'apparent_chemical_diffusivity' | 'wh_comparative_transport_index';
    calculationMethod: 'wh_planar_manual_endpoint';
    metricValueCm2PerS: number | null;
    diagnosticCandidateMetricValueCm2PerS: number | null;
    /** Independent E-versus-sqrt(t) diagnostic using the fitted slope at tau. */
    regressionCandidateMetricValueCm2PerS: number | null;
    /** Difference between the legacy five-point and CFx 10 s slope diagnostics. */
    windowStabilityDecades: number | null;
    /** Signed log-space difference between CFx 10 s slope D and Endpoint D. */
    methodDivergenceDecades: number | null;
    absMethodDivergenceDecades: number | null;
    regressionWindows: GittRegressionWindowResultV1[];
    regressionWindowSensitivity: {
      log10DRange: number | null;
      finitePositiveWindowCount: number;
    } | null;
    /** Active-material mass actually used to derive L_equivalent. */
    activeMassG: number | null;
    /** Source identifier paired with the mass used above. */
    activeMassSourceId: string | null;
    singleFaceAreaCm2: number | null;
    activeMaterialEquivalentThicknessCm: number | null;
    pulseDurationS: number | null;
    fitEndTimeS: number | null;
    preRestEndPotentialV: number | null;
    postRestEndPotentialV: number | null;
    /** Diagnostic-only Rest-end window sensitivity; never feeds formal ΔEs or D. */
    restEndSensitivityAudit: GittRestEndSensitivityAuditV1;
    /** First physical pulse-time record with finite, direction-compatible loaded current. */
    pulseT0VoltageV: number | null;
    pulseT0CurrentA: number | null;
    /** New primary endpoint start time; present only when a qualified t=0 exists. */
    endpointStartTimeS: number | null;
    /** Time of the first observed positive-time loaded pulse point, retained for diagnostics. */
    firstPositivePulseTimeS: number | null;
    firstPositivePulseVoltageV: number | null;
    /** Time of the first observed positive-time loaded pulse point. */
    endpointStartTemporalResolutionS: number | null;
    /** @deprecated Alias retaining the old pre-rest to first-positive-time semantics. */
    initialObservedDropV: number | null;
    onsetObservedDropV: number | null;
    earlyPolarizationDropV: number | null;
    preRestToFirstPositiveDropV: number | null;
    /** Neware mid-voltage: voltage at 50% of this pulse's capacity change. */
    medianVoltageV: number | null;
    deltaEsV: number | null;
    preRestLastRawVoltageV: number | null;
    postRestLastRawVoltageV: number | null;
    deltaEsRawV: number | null;
    restEstimatorDifferencePreV: number | null;
    restEstimatorDifferencePostV: number | null;
    /** @deprecated Compatibility alias for the primary loaded t=0 voltage. */
    pulseStartVoltageV: number | null;
    pulseEndVoltageV: number | null;
    deltaEtV: number | null;
    legacyFirstPositiveDeltaEtV: number | null;
    legacyFirstPositiveEndpointMetricValueCm2PerS: number | null;
    deltaEtDefinitionDifferenceV: number | null;
    endpointDRatioVsLegacy: number | null;
    pulseBaselineExtrapolatedV: number | null;
    predictedDeltaEAtTauV: number | null;
    observedDeltaEAtTauV: number | null;
    endpointConsistencyRatio: number | null;
    endpointConsistencyRelativeError: number | null;
    dimensionlessFitTime: number | null;
    dimensionlessPulseTime: number | null;
    pulseCapacityFraction: number | null;
    equilibriumVoltageStepV: number | null;
    pulseCurrentCv: number | null;
    socCalculationState: CalculationState;
    socQcStatus: QcStatus | null;
    socQcCodes: string[];
    socPrePulsePct: number | null;
    dodPrePulsePct: number | null;
    remainingCapacityPct: number | null;
    cumulativeNetCapacityAh: number | null;
    socCapacitySource: 'vendor' | 'integrated' | null;
    metricStandardUncertainty: number | null;
    metricExpandedUncertaintyK2: number | null;
    uncertaintyScope: 'measurement_and_input_only_model_discrepancy_excluded';
    sensitivities: {
      mass: 2;
      diameter: -4;
      density: -2;
      deltaEs: 2;
      deltaEt: -2;
      pulseDuration: -1;
    };
    preRestDiagnostics: RestDiagnosticsV1;
    postRestDiagnostics: RestDiagnosticsV1;
    fitDiagnostics: GittFitDiagnosticsV1;
    qcFindings: QcFinding[];
    /** Primary endpoint quality, separate from the deprecated aggregate qcStatus. */
    primaryEndpointQcStatus: QcStatus;
    primaryEndpointQcReasons: QcReasonV1[];
    /** Quality of the CFx10s auxiliary slope only. */
    cfx10SlopeQcStatus: GittRegressionWindowStatusV1;
    cfx10SlopeQcReasons: QcReasonV1[];
    /** Endpoint-only eligibility; CFx product protocol may further exclude it. */
    primaryComparisonEligibility: PrimaryComparisonEligibilityV1;
  };

export type DcrRequestedMetricV1 =
  | { kind: 'first_sample' }
  | { kind: 'exact_time'; offsetTicks: bigint; offsetResolutionNs: bigint; label: string }
  | { kind: 'two_current_terminal'; label: string };

export type DcrCalculationMethodV1 =
  | 'rest_to_pulse_exact_tick_v1'
  | 'two_current_terminal_v1';

export type DcrAnalysisConfigV1 = {
  qcPolicyId: string;
  currentResolutionA: number | null;
  voltageResolutionV: number | null;
  currentResolutionEvidence?: MeasurementResolutionEvidenceV1;
  voltageResolutionEvidence?: MeasurementResolutionEvidenceV1;
  requestedMetrics: DcrRequestedMetricV1[];
  transitionLatencyKnown: boolean;
  transitionTimeBasis: 'vendor_command_tick' | 'step_boundary_tick' | 'first_post_record';
  expectedPulseDurationS: number | null;
  calculationMethod?: DcrCalculationMethodV1;
};

export type DcrEventInputV1 = {
  eventId: string;
  preRestRows: CanonicalRowV1[];
  pulseRows: CanonicalRowV1[];
  /** Paper-method inputs: terminal points are taken from these two discharge steps. */
  smallDischargeRows?: CanonicalRowV1[];
  largeDischargeRows?: CanonicalRowV1[];
  config: DcrAnalysisConfigV1;
  protocolRole: 'dcr_pulse' | 'conditioning' | 'unknown';
};

export type DcrMetricResultV1 = ScientificResultStateV1 & {
  eventId: string;
  protocolRole: 'dcr_pulse' | 'conditioning' | 'unknown';
  requestedMetric: string;
  requestedOffsetS: number | null;
  actualElapsedFromTransitionS: number | null;
  transitionLatencyKnown: boolean;
  transitionTimeBasis: DcrAnalysisConfigV1['transitionTimeBasis'];
  baselineRowId: string | null;
  targetRowIds: string[];
  baselineVoltageV: number | null;
  baselineCurrentA: number | null;
  targetVoltageV: number | null;
  targetCurrentA: number | null;
  deltaVoltageV: number | null;
  deltaCurrentA: number | null;
  resistanceOhm: number | null;
  diagnosticCandidateResistanceOhm: number | null;
  /** Explicit paper-method fields; legacy baseline/target fields remain for compatibility. */
  calculationMethod?: DcrCalculationMethodV1;
  smallTerminalRowId?: string | null;
  largeTerminalRowId?: string | null;
  smallTerminalVoltageV?: number | null;
  largeTerminalVoltageV?: number | null;
  smallCurrentA?: number | null;
  largeCurrentA?: number | null;
  baselineWindowMedianV: number | null;
  baselineLastPointMinusWindowMedianV: number | null;
  baselineFittedTransitionVoltageV: number | null;
  baselineLastPointMinusFittedV: number | null;
  baselineVoltageDriftMvPerMin: number | null;
  currentResolutionRatio: number | null;
  voltageSnr: number | null;
  pulseCurrentCv: number | null;
  targetCurrentDeviationFraction: number | null;
  relativeResistanceUncertainty: number | null;
  qcFindings: QcFinding[];
};

export type AnalysisVersionsV1 = {
  appVersion: string;
  buildCommit: string;
  scientificContractVersion: string;
  canonicalSchemaVersion: string;
  parserVersion: string;
  vendorProfileId: string;
  vendorProfileVersion: string;
  stepSegmentationVersion: string;
  socContractVersion: string;
  algorithmId: string;
  algorithmVersion: string;
  qcPolicyId: string;
  materialPresetId: string;
  uncertaintyModelVersion: string;
  manifestSchemaVersion: string;
  oraclePackVersion: string;
};
