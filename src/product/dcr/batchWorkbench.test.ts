import { describe, expect, it } from 'vitest';

import type { DcrMetricResultV1 } from '../../science/contracts';
import {
  buildDcrBatchWorkbenchViewModelV1,
  filterDcrBatchEventsV1,
  type DcrBatchDatasetInputV1,
} from './batchWorkbench';

type ResultOptions = {
  eventId: string;
  metric: 'DCR_first_sample' | 'DCR_5s' | 'DCR_10s' | 'DCR_30s';
  calculationState?: DcrMetricResultV1['calculationState'];
  qcStatus?: DcrMetricResultV1['qcStatus'];
  resistanceOhm?: number | null;
  candidateOhm?: number | null;
  qcCodes?: string[];
  protocolRole?: DcrMetricResultV1['protocolRole'];
};

function result(options: ResultOptions): DcrMetricResultV1 {
  const requestedOffsetS =
    options.metric === 'DCR_first_sample' ? null : Number(options.metric.slice(4, -1));
  const reportedResistanceOhm = options.resistanceOhm === undefined ? 1 : options.resistanceOhm;
  const auditCandidateResistanceOhm =
    options.candidateOhm === undefined ? reportedResistanceOhm : options.candidateOhm;
  return {
    eventId: options.eventId,
    protocolRole: options.protocolRole ?? 'dcr_pulse',
    requestedMetric: options.metric,
    requestedOffsetS,
    actualElapsedFromTransitionS: requestedOffsetS ?? 0,
    transitionLatencyKnown: options.metric !== 'DCR_first_sample',
    transitionTimeBasis: 'step_boundary_tick',
    baselineRowId: `baseline-${options.eventId}`,
    targetRowIds: [`target-${options.eventId}-${options.metric}`],
    baselineVoltageV: 3,
    baselineCurrentA: 0,
    targetVoltageV: 3.1,
    targetCurrentA: 0.1,
    deltaVoltageV: 0.1,
    deltaCurrentA: 0.1,
    resistanceOhm: reportedResistanceOhm,
    diagnosticCandidateResistanceOhm: auditCandidateResistanceOhm,
    baselineWindowMedianV: 3,
    baselineLastPointMinusWindowMedianV: 0,
    baselineFittedTransitionVoltageV: 3,
    baselineLastPointMinusFittedV: 0,
    baselineVoltageDriftMvPerMin: 0,
    currentResolutionRatio: 1_000,
    voltageSnr: 100,
    pulseCurrentCv: 0,
    targetCurrentDeviationFraction: 0,
    relativeResistanceUncertainty: 0.01,
    calculationState: options.calculationState ?? 'computed',
    qcStatus: options.qcStatus ?? 'valid',
    qcCodes: options.qcCodes ?? [],
    qcFindings: [],
  };
}

function input(
  id: string,
  sourceFileHash: string,
  dcrResults: DcrMetricResultV1[],
): DcrBatchDatasetInputV1 {
  return {
    dataset: {
      id,
      fileName: `${id}.ndax`,
      fileSize: 100,
      importedAtIso: '2026-07-18T00:00:00.000Z',
      canonical: {
        sourceFileHash,
        canonicalDatasetHash: `canonical-${id}`,
        normalizationReceiptHash: `receipt-${id}`,
        metadata: {
          approvalState: 'provisional',
        },
      } as DcrBatchDatasetInputV1['dataset']['canonical'],
    },
    analysis: {
      dcrResults,
      configHash: `config-${id}`,
      analysisInputHash: `input-${id}`,
      resultHash: `result-${id}`,
      classification: {
        vendorProfileId: 'neware-bts8-dcr-30s-v1',
        approvalState: 'provisional',
        analysisKind: 'dcr',
        independentQualificationState: 'independent-qualified',
        independentQualificationReceiptId: 'receipt-id',
        independentQualificationReceiptHash: 'receipt-hash',
      },
      versions: {
        algorithmId: 'DCR_REST_TO_PULSE_EXACT_TICK',
        algorithmVersion: '1.0.0',
        qcPolicyId: 'DCR_QC_POLICY_1_0_0',
      },
    } as DcrBatchDatasetInputV1['analysis'],
  };
}

const standardMetrics = [
  'DCR_first_sample',
  'DCR_5s',
  'DCR_10s',
  'DCR_30s',
] as const;

describe('DCR batch workbench view model', () => {
  it('groups standard points by event and keeps valid, review, and missing states distinct', () => {
    const firstEvent = standardMetrics.map((metric) => result({ eventId: 'event-1', metric }));
    const secondEvent = [
      result({ eventId: 'event-2', metric: 'DCR_first_sample', qcStatus: 'review', resistanceOhm: 0.2, qcCodes: ['transition_latency_unknown'] }),
      result({ eventId: 'event-2', metric: 'DCR_5s', calculationState: 'not_computable', qcStatus: null, resistanceOhm: null, candidateOhm: 0.5, qcCodes: ['target_sample_absent'] }),
      result({ eventId: 'event-2', metric: 'DCR_10s', qcStatus: 'rejected', resistanceOhm: 0.6, candidateOhm: 0.6, qcCodes: ['polarity_inconsistent'] }),
    ];

    const model = buildDcrBatchWorkbenchViewModelV1([
      input('dataset-a', 'a'.repeat(64), [...firstEvent, ...secondEvent]),
    ]);

    expect(model.counts).toMatchObject({
      datasetCount: 1,
      eventCount: 2,
      standardPointCount: 8,
      usablePointCount: 4,
      reviewPointCount: 2,
      missingPointCount: 2,
      comparisonPointCount: 6,
      reportedPointCount: 6,
      rejectedSciencePointCount: 1,
      notComputableSciencePointCount: 1,
      absentStandardPointCount: 1,
    });

    const event = model.events[1];
    expect(event.eventKey).toBe('dataset-a\u0000event-2');
    expect(event.state).toBe('missing');
    expect(event.dataset).toMatchObject({
      sourceFileHash: 'a'.repeat(64),
      canonicalDatasetHash: 'canonical-dataset-a',
      analysisInputHash: 'input-dataset-a',
      algorithmId: 'DCR_REST_TO_PULSE_EXACT_TICK',
    });
    expect(event.points.map((point) => point.state)).toEqual(['review', 'missing', 'review', 'missing']);
    expect(event.points[0]).toMatchObject({
      reportedResistanceOhm: 0.2,
      comparisonResistanceOhm: 0.2,
      qcStatus: 'review',
    });
    expect(event.points[1]).toMatchObject({
      reportedResistanceOhm: null,
      auditCandidateResistanceOhm: 0.5,
      calculationState: 'not_computable',
      comparisonResistanceOhm: null,
    });
    expect(event.points[2]).toMatchObject({
      reportedResistanceOhm: 0.6,
      auditCandidateResistanceOhm: 0.6,
      qcStatus: 'rejected',
      comparisonResistanceOhm: 0.6,
    });
    expect(event.points[3]).toMatchObject({
      scientificResult: null,
      productIssueCodes: ['standard_metric_not_returned'],
      comparisonResistanceOhm: null,
    });
  });

  it('keeps duplicate product inputs missing instead of selecting or averaging a scientific result', () => {
    const duplicate = [
      result({ eventId: 'event-1', metric: 'DCR_first_sample', resistanceOhm: 0.1 }),
      result({ eventId: 'event-1', metric: 'DCR_first_sample', resistanceOhm: 0.2 }),
    ];
    const model = buildDcrBatchWorkbenchViewModelV1([input('dataset-a', 'a'.repeat(64), duplicate)]);
    const firstPoint = model.events[0].points[0];

    expect(firstPoint).toMatchObject({
      state: 'missing',
      scientificResult: null,
      sourceResultCount: 2,
      productIssueCodes: ['duplicate_standard_metric_result'],
      reportedResistanceOhm: null,
      comparisonResistanceOhm: null,
    });
    expect(firstPoint.sourceResults).toEqual(duplicate);
    expect(model.counts.duplicateStandardPointCount).toBe(1);
  });

  it('provides filter-ready event data and cautious, protocol-scoped insights', () => {
    const valid = standardMetrics.map((metric) => result({ eventId: 'event-valid', metric }));
    const review = [
      result({ eventId: 'event-review', metric: 'DCR_first_sample', qcStatus: 'review', qcCodes: ['transition_latency_unknown'] }),
    ];
    const model = buildDcrBatchWorkbenchViewModelV1([
      input('dataset-a', 'a'.repeat(64), valid),
      input('dataset-b', 'b'.repeat(64), review),
    ]);

    expect(filterDcrBatchEventsV1(model, { eventStates: ['usable'] }).map((event) => event.eventId)).toEqual(['event-valid']);
    expect(filterDcrBatchEventsV1(model, { containsPointStates: ['review'] }).map((event) => event.eventId)).toEqual(['event-review']);
    expect(filterDcrBatchEventsV1(model, { qcCodes: ['transition_latency_unknown'] }).map((event) => event.eventId)).toEqual(['event-review']);
    expect(filterDcrBatchEventsV1(model, { datasetIds: ['dataset-a'] }).map((event) => event.eventId)).toEqual(['event-valid']);
    expect(model.filterFacets).toMatchObject({
      pointStates: { usable: 4, review: 1, missing: 3 },
      eventStates: { usable: 1, review: 0, missing: 1 },
      qcCodes: ['transition_latency_unknown'],
    });
    expect(model.insights).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'dcr_batch_scope' }),
        expect.objectContaining({ code: 'dcr_batch_provisional_profile', tone: 'caution' }),
        expect.objectContaining({ code: 'dcr_batch_review_points', tone: 'caution' }),
        expect.objectContaining({ code: 'dcr_batch_missing_points', tone: 'caution' }),
      ]),
    );
    expect(model.insights[0].message).not.toContain('本征');
  });

  it('does not create an event from conditioning results and reports an empty batch cautiously', () => {
    const conditioning = result({
      eventId: 'conditioning-event',
      metric: 'DCR_first_sample',
      protocolRole: 'conditioning',
    });
    const model = buildDcrBatchWorkbenchViewModelV1([input('dataset-a', 'a'.repeat(64), [conditioning])]);

    expect(model.events).toEqual([]);
    expect(model.datasets[0]).toMatchObject({
      sourceResultCount: 1,
      includedPulseResultCount: 0,
      excludedNonPulseResultCount: 1,
    });
    expect(model.insights).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'dcr_batch_no_events' })]));
  });
});
