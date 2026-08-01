import type {
  CanonicalRowV1,
  DcrEventInputV1,
  DcrRequestedMetricV1,
} from '../contracts';
import { analyzeDcrEventV1, defaultDcrRequestedMetricsV1 } from './analyze';
import { NANOSECONDS_PER_SECOND } from './policy';
import { recordStorageFloat32ResolutionEvidence } from '../measurementResolution';

type RowOptions = {
  id: string;
  absoluteTicks: bigint;
  stepTicks: bigint | null;
  sequence: bigint;
  voltageV: number;
  currentA: number;
  stepType: CanonicalRowV1['canonicalStepType'];
  stepId: string;
  resolutionNs?: bigint;
};

function row(options: RowOptions): CanonicalRowV1 {
  const resolutionNs = options.resolutionNs ?? NANOSECONDS_PER_SECOND;
  return {
    rowId: options.id,
    sourceFileId: 'source-1',
    sourceFileHash: 'a'.repeat(64),
    instrumentId: 'neware-test',
    channelId: '1',
    sourceStream: 'record',
    sourceSheet: null,
    sourceRowIndex: options.sequence,
    sourceRecordSequence: options.sequence,
    parserVersion: 'test',
    elapsedTimeTicks: options.absoluteTicks,
    stepElapsedTimeTicks: options.stepTicks,
    timeResolutionNs: resolutionNs,
    recordSequence: options.sequence,
    elapsedTimeS: Number(options.absoluteTicks * resolutionNs) / 1e9,
    voltageV: options.voltageV,
    currentA: options.currentA,
    temperatureC: null,
    vendorStepId: options.stepId,
    vendorStepType: options.stepType,
    analysisStepId: options.stepId,
    canonicalStepType: options.stepType,
    chargeCapacityAh: null,
    dischargeCapacityAh: null,
    netCapacityAh: null,
  };
}

function makeEvent(options: {
  currentA?: number;
  pulseVoltages?: number[];
  pulseOffsetsS?: number[];
  requestedMetrics?: DcrRequestedMetricV1[];
  latencyKnown?: boolean;
  expectedPulseDurationS?: number | null;
  currentResolutionA?: number | null;
  protocolRole?: DcrEventInputV1['protocolRole'];
} = {}): DcrEventInputV1 {
  const currentA = options.currentA ?? 0.1;
  const pulseOffsetsS = options.pulseOffsetsS ?? [0, 5, 10, 30];
  const defaultVoltages = currentA > 0 ? [3.01, 3.05, 3.06, 3.07] : [2.99, 2.95, 2.94, 2.93];
  const pulseVoltages = options.pulseVoltages ?? defaultVoltages.slice(0, pulseOffsetsS.length);
  const pulseType = currentA > 0 ? 'charge' : 'discharge';

  const preRestRows = [-60, -45, -30, -15, 0].map((offset, index) =>
    row({
      id: `rest-${index}`,
      absoluteTicks: BigInt(100 + offset),
      stepTicks: BigInt(60 + offset),
      sequence: BigInt(index),
      voltageV: 3,
      currentA: 0,
      stepType: 'rest',
      stepId: 'rest-1',
    }),
  );
  const pulseRows = pulseOffsetsS.map((offset, index) =>
    row({
      id: `pulse-${index}`,
      absoluteTicks: BigInt(100 + offset),
      stepTicks: BigInt(offset),
      sequence: BigInt(100 + index),
      voltageV: pulseVoltages[index],
      currentA,
      stepType: pulseType,
      stepId: 'pulse-1',
    }),
  );

  return {
    eventId: 'event-1',
    preRestRows,
    pulseRows,
    protocolRole: options.protocolRole ?? 'dcr_pulse',
    config: {
      qcPolicyId: 'DCR_QC_POLICY_1_0_0',
      currentResolutionA: options.currentResolutionA === undefined ? 1e-6 : options.currentResolutionA,
      voltageResolutionV: 1e-6,
      requestedMetrics: options.requestedMetrics ?? defaultDcrRequestedMetricsV1(),
      transitionLatencyKnown: options.latencyKnown ?? true,
      transitionTimeBasis: 'step_boundary_tick',
      expectedPulseDurationS: options.expectedPulseDurationS === undefined ? 30 : options.expectedPulseDurationS,
    },
  };
}

describe('DCR_REST_TO_PULSE_EXACT_TICK V1', () => {
  it('computes signed positive resistance for Rest -> charge and keeps the duplicate boundary rows distinct', () => {
    const event = makeEvent();
    const results = analyzeDcrEventV1(event);
    expect(results).toHaveLength(4);

    const first = results[0];
    expect(first.requestedMetric).toBe('DCR_first_sample');
    expect(first.baselineRowId).toBe('rest-4');
    expect(first.targetRowIds).toEqual(['pulse-0']);
    expect(first.actualElapsedFromTransitionS).toBe(0);
    expect(first.deltaCurrentA).toBeCloseTo(0.1, 15);
    expect(first.deltaVoltageV).toBeCloseTo(0.01, 15);
    expect(first.resistanceOhm).toBeCloseTo(0.1, 12);
    expect(first.qcStatus).toBe('valid');
    expect(first.baselineWindowMedianV).toBe(3);
    expect(first.baselineLastPointMinusWindowMedianV).toBe(0);
    expect(first.baselineFittedTransitionVoltageV).toBe(3);
    expect(first.baselineVoltageDriftMvPerMin).toBe(0);
    expect(first.currentResolutionRatio).toBeCloseTo(100_000, 8);
    expect(first.voltageSnr).toBeGreaterThan(10);
    expect(first.pulseCurrentCv).toBe(0);
    expect(first.targetCurrentDeviationFraction).toBe(0);
    expect(first.relativeResistanceUncertainty).not.toBeNull();

    expect(results[1].resistanceOhm).toBeCloseTo(0.5, 12);
    expect(results[2].resistanceOhm).toBeCloseTo(0.6, 12);
    expect(results[3].resistanceOhm).toBeCloseTo(0.7, 12);
  });

  it('computes signed positive resistance for Rest -> discharge', () => {
    const results = analyzeDcrEventV1(makeEvent({ currentA: -0.1 }));
    expect(results[0].deltaCurrentA).toBeCloseTo(-0.1, 15);
    expect(results[0].deltaVoltageV).toBeCloseTo(-0.01, 15);
    expect(results[0].resistanceOhm).toBeCloseTo(0.1, 12);
    expect(results[1].resistanceOhm).toBeCloseTo(0.5, 12);
  });

  it('computes with automatic record-storage bounds but never promotes them to valid', () => {
    const event = makeEvent({ requestedMetrics: [{ kind: 'first_sample' }] });
    const currentEvidence = recordStorageFloat32ResolutionEvidence(0.05, 'Current');
    const voltageEvidence = recordStorageFloat32ResolutionEvidence(5, 'Voltage');
    event.config.currentResolutionA = currentEvidence.value;
    event.config.voltageResolutionV = voltageEvidence.value;
    event.config.currentResolutionEvidence = currentEvidence;
    event.config.voltageResolutionEvidence = voltageEvidence;

    const [result] = analyzeDcrEventV1(event);
    expect(result.calculationState).toBe('computed');
    expect(result.resistanceOhm).toBeCloseTo(0.1, 12);
    expect(result.qcStatus).toBe('review');
    expect(result.qcCodes).toEqual(
      expect.arrayContaining([
        'current_resolution_inferred_from_record_storage',
        'voltage_resolution_inferred_from_record_storage',
      ]),
    );
  });

  it('reports a polarity-inconsistent signed result without taking an absolute value', () => {
    const [result] = analyzeDcrEventV1(
      makeEvent({ requestedMetrics: [{ kind: 'first_sample' }], pulseVoltages: [2.99, 2.95, 2.94, 2.93] }),
    );
    expect(result.calculationState).toBe('computed');
    expect(result.qcStatus).toBe('rejected');
    expect(result.resistanceOhm).toBeCloseTo(-0.1, 12);
    expect(result.diagnosticCandidateResistanceOhm).toBeCloseTo(-0.1, 12);
    expect(result.qcCodes).toContain('polarity_inconsistent');
  });

  it('does not replace absent 0.1 s, 1 s, or 3 s samples with a neighbour', () => {
    const requestedMetrics: DcrRequestedMetricV1[] = [
      { kind: 'exact_time', offsetTicks: 1n, offsetResolutionNs: 100_000_000n, label: 'DCR_0.1s' },
      { kind: 'exact_time', offsetTicks: 1n, offsetResolutionNs: NANOSECONDS_PER_SECOND, label: 'DCR_1s' },
      { kind: 'exact_time', offsetTicks: 3n, offsetResolutionNs: NANOSECONDS_PER_SECOND, label: 'DCR_3s' },
    ];
    const results = analyzeDcrEventV1(makeEvent({ requestedMetrics }));
    for (const result of results) {
      expect(result.calculationState).toBe('not_computable');
      expect(result.qcStatus).toBeNull();
      expect(result.resistanceOhm).toBeNull();
      expect(result.qcCodes).toContain('target_sample_absent');
    }
  });

  it('uses exact integer nanoseconds rather than floating-point/nearest matching', () => {
    const event = makeEvent({
      requestedMetrics: [
        { kind: 'exact_time', offsetTicks: 5n, offsetResolutionNs: NANOSECONDS_PER_SECOND, label: 'DCR_5s' },
      ],
    });
    event.pulseRows = event.pulseRows.map((pulseRow, index) => {
      if (index !== 1) return pulseRow;
      return row({
        id: 'pulse-near-5s',
        absoluteTicks: 104_999_999_999n,
        stepTicks: 4_999_999_999n,
        resolutionNs: 1n,
        sequence: 101n,
        voltageV: 3.05,
        currentA: 0.1,
        stepType: 'charge',
        stepId: 'pulse-1',
      });
    });
    const [result] = analyzeDcrEventV1(event);
    expect(result.calculationState).toBe('not_computable');
    expect(result.qcCodes).toContain('target_sample_absent');
  });

  it('aggregates duplicate exact ticks only within resolution and rejects conflicting duplicates', () => {
    const withinResolution = makeEvent({
      requestedMetrics: [
        { kind: 'exact_time', offsetTicks: 5n, offsetResolutionNs: NANOSECONDS_PER_SECOND, label: 'DCR_5s' },
      ],
    });
    withinResolution.pulseRows.push(
      row({
        id: 'pulse-5-duplicate',
        absoluteTicks: 105n,
        stepTicks: 5n,
        sequence: 999n,
        voltageV: 3.0500005,
        currentA: 0.1000005,
        stepType: 'charge',
        stepId: 'pulse-1',
      }),
    );
    const [aggregated] = analyzeDcrEventV1(withinResolution);
    expect(aggregated.calculationState).toBe('computed');
    expect(aggregated.targetRowIds).toEqual(['pulse-1', 'pulse-5-duplicate']);
    expect(aggregated.targetVoltageV).toBeCloseTo(3.05000025, 12);

    const conflicting = makeEvent({
      requestedMetrics: [
        { kind: 'exact_time', offsetTicks: 5n, offsetResolutionNs: NANOSECONDS_PER_SECOND, label: 'DCR_5s' },
      ],
    });
    conflicting.pulseRows.push(
      row({
        id: 'pulse-5-conflict',
        absoluteTicks: 105n,
        stepTicks: 5n,
        sequence: 999n,
        voltageV: 3.06,
        currentA: 0.1,
        stepType: 'charge',
        stepId: 'pulse-1',
      }),
    );
    const [rejected] = analyzeDcrEventV1(conflicting);
    expect(rejected.calculationState).toBe('not_computable');
    expect(rejected.qcStatus).toBe('rejected');
    expect(rejected.qcCodes).toContain('duplicate_target_tick_conflict');
  });

  it('marks results before a truncated end for review and later targets not computable', () => {
    const results = analyzeDcrEventV1(
      makeEvent({
        pulseOffsetsS: [0, 5, 10, 20],
        pulseVoltages: [3.01, 3.05, 3.06, 3.065],
        expectedPulseDurationS: 30,
      }),
    );
    expect(results[0].calculationState).toBe('computed');
    expect(results[0].qcStatus).toBe('review');
    expect(results[0].qcCodes).toContain('pulse_truncated_after_target');
    expect(results[1].qcStatus).toBe('review');

    const thirtySeconds = results[3];
    expect(thirtySeconds.calculationState).toBe('not_computable');
    expect(thirtySeconds.qcStatus).toBeNull();
    expect(thirtySeconds.qcCodes).toEqual(expect.arrayContaining(['target_sample_absent', 'pulse_truncated_before_target']));
  });

  it('reports the direct ratio while diagnosing inadequate delta-current resolution', () => {
    const [result] = analyzeDcrEventV1(
      makeEvent({ requestedMetrics: [{ kind: 'first_sample' }], currentResolutionA: 0.01 }),
    );
    expect(result.calculationState).toBe('computed');
    expect(result.qcStatus).toBe('rejected');
    expect(result.resistanceOhm).toBeCloseTo(0.1, 12);
    expect(result.diagnosticCandidateResistanceOhm).toBeCloseTo(0.1, 12);
    expect(result.qcCodes).toContain('delta_current_below_resolution_requirement');
  });

  it('diagnoses an anomalous last baseline point without silently replacing it by the window median', () => {
    const event = makeEvent({
      requestedMetrics: [{ kind: 'first_sample' }],
      pulseVoltages: [3.03, 3.05, 3.06, 3.07],
    });
    event.preRestRows[event.preRestRows.length - 1] = {
      ...event.preRestRows[event.preRestRows.length - 1],
      voltageV: 3.02,
    };
    const [result] = analyzeDcrEventV1(event);
    expect(result.baselineVoltageV).toBe(3.02);
    expect(result.baselineWindowMedianV).toBe(3);
    expect(result.baselineLastPointMinusWindowMedianV).toBeCloseTo(0.02, 15);
    expect(result.diagnosticCandidateResistanceOhm).toBeCloseTo(0.1, 12);
    expect(result.resistanceOhm).toBeCloseTo(0.1, 12);
    expect(result.qcCodes).toContain('baseline_last_point_deviation');
  });

  it('reports the direct ratio while diagnosing unstable pulse current', () => {
    const event = makeEvent({ requestedMetrics: [{ kind: 'first_sample' }] });
    event.pulseRows = event.pulseRows.map((pulseRow, index) => ({
      ...pulseRow,
      currentA: [0.08, 0.1, 0.12, 0.14][index],
    }));
    const [result] = analyzeDcrEventV1(event);
    expect(result.calculationState).toBe('computed');
    expect(result.qcStatus).toBe('rejected');
    expect(result.resistanceOhm).toBeCloseTo(0.125, 12);
    expect(result.qcCodes).toContain('pulse_current_cv');
  });

  it('keeps first-sample results at review when transition latency is unknown', () => {
    const [result] = analyzeDcrEventV1(
      makeEvent({ requestedMetrics: [{ kind: 'first_sample' }], latencyKnown: false }),
    );
    expect(result.calculationState).toBe('computed');
    expect(result.qcStatus).toBe('review');
    expect(result.qcCodes).toContain('transition_latency_unknown');
  });

  it('does not emit DCR results for conditioning or unclassified steps', () => {
    expect(analyzeDcrEventV1(makeEvent({ protocolRole: 'conditioning' }))).toEqual([]);
    expect(analyzeDcrEventV1(makeEvent({ protocolRole: 'unknown' }))).toEqual([]);
  });
});
