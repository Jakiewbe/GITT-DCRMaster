import type { NewareAnalysisBundle } from '../../app/analyze';
import type { WorkbenchDatasetV1 } from '../../app/project';
import type {
  CalculationState,
  DcrMetricResultV1,
  QcStatus,
} from '../../science/contracts';

/**
 * Product-layer projection for batch DCR review. It deliberately does not
 * calculate, repair, interpolate, or reclassify scientific results.
 */

export const DCR_BATCH_STANDARD_POINT_SPECS_V1 = [
  {
    key: 'first_sample',
    requestedMetric: 'DCR_first_sample',
    displayLabel: '首个采样点',
    requestedOffsetS: null,
  },
  {
    key: '5s',
    requestedMetric: 'DCR_5s',
    displayLabel: '5 s',
    requestedOffsetS: 5,
  },
  {
    key: '10s',
    requestedMetric: 'DCR_10s',
    displayLabel: '10 s',
    requestedOffsetS: 10,
  },
  {
    key: '30s',
    requestedMetric: 'DCR_30s',
    displayLabel: '30 s',
    requestedOffsetS: 30,
  },
] as const;

export type DcrBatchPointKeyV1 = (typeof DCR_BATCH_STANDARD_POINT_SPECS_V1)[number]['key'];
export type DcrBatchPointStateV1 = 'usable' | 'review' | 'missing';
export type DcrBatchInsightToneV1 = 'information' | 'caution';

export type DcrBatchDatasetSourceV1 = Pick<
  WorkbenchDatasetV1,
  'id' | 'fileName' | 'fileSize' | 'importedAtIso'
> & {
  canonical: Pick<
    WorkbenchDatasetV1['canonical'],
    'sourceFileHash' | 'canonicalDatasetHash' | 'normalizationReceiptHash' | 'metadata'
  >;
};

export type DcrBatchAnalysisSourceV1 = Pick<
  NewareAnalysisBundle,
  | 'classification'
  | 'dcrResults'
  | 'configHash'
  | 'analysisInputHash'
  | 'resultHash'
  | 'versions'
>;

/** A structural subset of the existing dataset + analysis pair. */
export type DcrBatchDatasetInputV1 = {
  dataset: DcrBatchDatasetSourceV1;
  analysis: DcrBatchAnalysisSourceV1;
};

export type DcrBatchDatasetIdentityV1 = {
  datasetId: string;
  fileName: string;
  fileSize: number;
  importedAtIso: string;
  sourceFileHash: string;
  canonicalDatasetHash: string;
  normalizationReceiptHash: string;
  configHash: string;
  analysisInputHash: string;
  resultHash: string;
  parserApprovalState: 'provisional';
  vendorProfileId: string;
  independentQualificationState: 'independent-qualified' | 'not-qualified';
  algorithmId: string;
  algorithmVersion: string;
  qcPolicyId: string;
};

export type DcrBatchPointV1 = {
  key: DcrBatchPointKeyV1;
  requestedMetric: string;
  displayLabel: string;
  requestedOffsetS: number | null;
  state: DcrBatchPointStateV1;
  /**
   * Exact source result when there is exactly one result for this standard
   * point. This is not copied or reclassified by the product layer.
   */
  scientificResult: DcrMetricResultV1 | null;
  sourceResults: readonly DcrMetricResultV1[];
  sourceResultCount: number;
  productIssueCodes: readonly string[];
  calculationState: CalculationState | null;
  qcStatus: QcStatus | null;
  qcCodes: readonly string[];
  /** Existing scientific-core reported value; never falls back to a candidate. */
  reportedResistanceOhm: number | null;
  /** Only a valid point may enter a comparison, ranking, or trend. */
  comparisonResistanceOhm: number | null;
  /** Audit-only candidate retained verbatim; never a comparison value. */
  auditCandidateResistanceOhm: number | null;
  actualElapsedFromTransitionS: number | null;
  transitionLatencyKnown: boolean | null;
  transitionTimeBasis: DcrMetricResultV1['transitionTimeBasis'] | null;
  baselineRowId: string | null;
  targetRowIds: readonly string[];
};

export type DcrBatchEventV1 = {
  eventKey: string;
  eventId: string;
  dataset: DcrBatchDatasetIdentityV1;
  state: DcrBatchPointStateV1;
  points: readonly DcrBatchPointV1[];
  sourceResultCount: number;
};

export type DcrBatchDatasetViewV1 = {
  identity: DcrBatchDatasetIdentityV1;
  events: readonly DcrBatchEventV1[];
  sourceResultCount: number;
  includedPulseResultCount: number;
  excludedNonPulseResultCount: number;
};

export type DcrBatchCountsV1 = {
  datasetCount: number;
  datasetWithEventsCount: number;
  eventCount: number;
  standardPointCount: number;
  usablePointCount: number;
  reviewPointCount: number;
  missingPointCount: number;
  comparisonPointCount: number;
  reportedPointCount: number;
  rejectedSciencePointCount: number;
  notComputableSciencePointCount: number;
  absentStandardPointCount: number;
  duplicateStandardPointCount: number;
  provisionalDatasetCount: number;
};

export type DcrBatchInsightV1 = {
  code:
    | 'dcr_batch_scope'
    | 'dcr_batch_provisional_profile'
    | 'dcr_batch_review_points'
    | 'dcr_batch_missing_points'
    | 'dcr_batch_no_events';
  tone: DcrBatchInsightToneV1;
  message: string;
};

export type DcrBatchFilterFacetsV1 = {
  datasets: ReadonlyArray<{
    datasetId: string;
    fileName: string;
    eventCount: number;
  }>;
  pointStates: Readonly<Record<DcrBatchPointStateV1, number>>;
  eventStates: Readonly<Record<DcrBatchPointStateV1, number>>;
  qcCodes: readonly string[];
};

export type DcrBatchWorkbenchViewModelV1 = {
  datasets: readonly DcrBatchDatasetViewV1[];
  events: readonly DcrBatchEventV1[];
  counts: DcrBatchCountsV1;
  insights: readonly DcrBatchInsightV1[];
  filterFacets: DcrBatchFilterFacetsV1;
};

export type DcrBatchEventFilterV1 = {
  datasetIds?: readonly string[];
  sourceFileHashes?: readonly string[];
  eventStates?: readonly DcrBatchPointStateV1[];
  containsPointStates?: readonly DcrBatchPointStateV1[];
  qcCodes?: readonly string[];
};

function pointState(result: DcrMetricResultV1 | null): DcrBatchPointStateV1 {
  if (result === null || result.resistanceOhm === null) return 'missing';
  if (result.calculationState === 'computed' && result.qcStatus === 'valid') return 'usable';
  if (result.calculationState === 'computed') return 'review';
  return 'missing';
}

function eventState(points: readonly DcrBatchPointV1[]): DcrBatchPointStateV1 {
  if (points.some((point) => point.state === 'missing')) return 'missing';
  if (points.some((point) => point.state === 'review')) return 'review';
  return 'usable';
}

function identityFor(input: DcrBatchDatasetInputV1): DcrBatchDatasetIdentityV1 {
  const { dataset, analysis } = input;
  return {
    datasetId: dataset.id,
    fileName: dataset.fileName,
    fileSize: dataset.fileSize,
    importedAtIso: dataset.importedAtIso,
    sourceFileHash: dataset.canonical.sourceFileHash,
    canonicalDatasetHash: dataset.canonical.canonicalDatasetHash,
    normalizationReceiptHash: dataset.canonical.normalizationReceiptHash,
    configHash: analysis.configHash,
    analysisInputHash: analysis.analysisInputHash,
    resultHash: analysis.resultHash,
    parserApprovalState: dataset.canonical.metadata.approvalState,
    vendorProfileId: analysis.classification.vendorProfileId,
    independentQualificationState: analysis.classification.independentQualificationState,
    algorithmId: analysis.versions.algorithmId,
    algorithmVersion: analysis.versions.algorithmVersion,
    qcPolicyId: analysis.versions.qcPolicyId,
  };
}

function pointFor(
  spec: (typeof DCR_BATCH_STANDARD_POINT_SPECS_V1)[number],
  sourceResults: readonly DcrMetricResultV1[],
): DcrBatchPointV1 {
  if (sourceResults.length === 0) {
    return {
      ...spec,
      state: 'missing',
      scientificResult: null,
      sourceResults,
      sourceResultCount: 0,
      productIssueCodes: ['standard_metric_not_returned'],
      calculationState: null,
      qcStatus: null,
      qcCodes: [],
      reportedResistanceOhm: null,
      comparisonResistanceOhm: null,
      auditCandidateResistanceOhm: null,
      actualElapsedFromTransitionS: null,
      transitionLatencyKnown: null,
      transitionTimeBasis: null,
      baselineRowId: null,
      targetRowIds: [],
    };
  }

  if (sourceResults.length > 1) {
    return {
      ...spec,
      state: 'missing',
      scientificResult: null,
      sourceResults,
      sourceResultCount: sourceResults.length,
      productIssueCodes: ['duplicate_standard_metric_result'],
      calculationState: null,
      qcStatus: null,
      qcCodes: [],
      reportedResistanceOhm: null,
      comparisonResistanceOhm: null,
      auditCandidateResistanceOhm: null,
      actualElapsedFromTransitionS: null,
      transitionLatencyKnown: null,
      transitionTimeBasis: null,
      baselineRowId: null,
      targetRowIds: [],
    };
  }

  const result = sourceResults[0];
  const state = pointState(result);
  const reportedResistanceOhm = result.calculationState === 'computed'
    ? result.resistanceOhm
    : null;
  return {
    ...spec,
    state,
    scientificResult: result,
    sourceResults,
    sourceResultCount: 1,
    productIssueCodes: [],
    calculationState: result.calculationState,
    qcStatus: result.qcStatus,
    qcCodes: result.qcCodes,
    reportedResistanceOhm,
    comparisonResistanceOhm: result.calculationState === 'computed' ? result.resistanceOhm : null,
    auditCandidateResistanceOhm: result.diagnosticCandidateResistanceOhm,
    actualElapsedFromTransitionS: result.actualElapsedFromTransitionS,
    transitionLatencyKnown: result.transitionLatencyKnown,
    transitionTimeBasis: result.transitionTimeBasis,
    baselineRowId: result.baselineRowId,
    targetRowIds: result.targetRowIds,
  };
}

function makeInsights(counts: DcrBatchCountsV1): DcrBatchInsightV1[] {
  const insights: DcrBatchInsightV1[] = [
    {
      code: 'dcr_batch_scope',
      tone: 'information',
      message:
        '仅汇总指定协议与时间点下的直流脉冲表观电阻；不自动区分欧姆、电荷转移或扩散过程。',
    },
  ];

  if (counts.provisionalDatasetCount > 0) {
    insights.push({
      code: 'dcr_batch_provisional_profile',
      tone: 'caution',
      message:
        `${counts.provisionalDatasetCount} 个数据集仍使用暂定解析 profile；必须保留原始 QC 与来源证据，不能据此声明设备精度或 profile 已获批准。`,
    });
  }
  if (counts.reviewPointCount > 0) {
    insights.push({
      code: 'dcr_batch_review_points',
      tone: 'caution',
      message:
        `全部标准时间点中有 ${counts.reviewPointCount} 个点需要复核：可作为审计显示，但默认不应进入正式比较、排名或趋势线。`,
    });
  }
  if (counts.missingPointCount > 0) {
    insights.push({
      code: 'dcr_batch_missing_points',
      tone: 'caution',
      message:
        `${counts.missingPointCount} 个标准目标点不可用于正式比较；缺失或拒绝结果的审计候选值不会替代正式值。`,
    });
  }
  if (counts.eventCount === 0) {
    insights.push({
      code: 'dcr_batch_no_events',
      tone: 'caution',
      message: '没有可汇总的 Rest → 单一恒流 Pulse DCR 事件。',
    });
  }
  return insights;
}

function makeFilterFacets(
  datasets: readonly DcrBatchDatasetViewV1[],
  events: readonly DcrBatchEventV1[],
  counts: DcrBatchCountsV1,
): DcrBatchFilterFacetsV1 {
  const eventStates: Record<DcrBatchPointStateV1, number> = { usable: 0, review: 0, missing: 0 };
  const qcCodes = new Set<string>();
  for (const event of events) {
    eventStates[event.state] += 1;
    for (const point of event.points) {
      for (const code of point.qcCodes) qcCodes.add(code);
    }
  }
  return {
    datasets: datasets.map((dataset) => ({
      datasetId: dataset.identity.datasetId,
      fileName: dataset.identity.fileName,
      eventCount: dataset.events.length,
    })),
    pointStates: {
      usable: counts.usablePointCount,
      review: counts.reviewPointCount,
      missing: counts.missingPointCount,
    },
    eventStates,
    qcCodes: [...qcCodes].sort(),
  };
}

/**
 * Creates a deterministic, filtering-ready batch projection without changing
 * any input result object or promoting any audit candidate to a reportable DCR.
 */
export function buildDcrBatchWorkbenchViewModelV1(
  inputs: readonly DcrBatchDatasetInputV1[],
): DcrBatchWorkbenchViewModelV1 {
  const datasets: DcrBatchDatasetViewV1[] = [];
  const events: DcrBatchEventV1[] = [];
  const counts: DcrBatchCountsV1 = {
    datasetCount: inputs.length,
    datasetWithEventsCount: 0,
    eventCount: 0,
    standardPointCount: 0,
    usablePointCount: 0,
    reviewPointCount: 0,
    missingPointCount: 0,
    comparisonPointCount: 0,
    reportedPointCount: 0,
    rejectedSciencePointCount: 0,
    notComputableSciencePointCount: 0,
    absentStandardPointCount: 0,
    duplicateStandardPointCount: 0,
    provisionalDatasetCount: 0,
  };

  for (const input of inputs) {
    const identity = identityFor(input);
    if (identity.parserApprovalState === 'provisional') counts.provisionalDatasetCount += 1;

    const sourceResults = input.analysis.dcrResults;
    const pulseResults = sourceResults.filter((result) => result.protocolRole === 'dcr_pulse');
    const excludedNonPulseResultCount = sourceResults.length - pulseResults.length;
    const byEvent = new Map<string, DcrMetricResultV1[]>();
    for (const result of pulseResults) {
      const group = byEvent.get(result.eventId);
      if (group) group.push(result);
      else byEvent.set(result.eventId, [result]);
    }

    const datasetEvents: DcrBatchEventV1[] = [];
    for (const [eventId, results] of byEvent) {
      const points = DCR_BATCH_STANDARD_POINT_SPECS_V1.map((spec) =>
        pointFor(spec, results.filter((result) => result.requestedMetric === spec.requestedMetric)),
      );
      const event: DcrBatchEventV1 = {
        eventKey: `${identity.datasetId}\u0000${eventId}`,
        eventId,
        dataset: identity,
        state: eventState(points),
        points,
        sourceResultCount: results.length,
      };
      datasetEvents.push(event);
      events.push(event);
      counts.eventCount += 1;
      for (const point of points) {
        counts.standardPointCount += 1;
        if (point.state === 'usable') counts.usablePointCount += 1;
        if (point.state === 'review') counts.reviewPointCount += 1;
        if (point.state === 'missing') counts.missingPointCount += 1;
        if (point.comparisonResistanceOhm !== null) counts.comparisonPointCount += 1;
        if (point.reportedResistanceOhm !== null) counts.reportedPointCount += 1;
        if (point.scientificResult?.qcStatus === 'rejected') counts.rejectedSciencePointCount += 1;
        if (point.scientificResult?.calculationState === 'not_computable') {
          counts.notComputableSciencePointCount += 1;
        }
        if (point.sourceResultCount === 0) counts.absentStandardPointCount += 1;
        if (point.sourceResultCount > 1) counts.duplicateStandardPointCount += 1;
      }
    }

    if (datasetEvents.length > 0) counts.datasetWithEventsCount += 1;
    datasets.push({
      identity,
      events: datasetEvents,
      sourceResultCount: sourceResults.length,
      includedPulseResultCount: pulseResults.length,
      excludedNonPulseResultCount,
    });
  }

  return {
    datasets,
    events,
    counts,
    insights: makeInsights(counts),
    filterFacets: makeFilterFacets(datasets, events, counts),
  };
}

/** Returns events only; it never changes point values, QC, or applicability. */
export function filterDcrBatchEventsV1(
  model: DcrBatchWorkbenchViewModelV1,
  filter: DcrBatchEventFilterV1 = {},
): DcrBatchEventV1[] {
  const datasetIds = filter.datasetIds === undefined ? null : new Set(filter.datasetIds);
  const sourceFileHashes =
    filter.sourceFileHashes === undefined ? null : new Set(filter.sourceFileHashes);
  const eventStates = filter.eventStates === undefined ? null : new Set(filter.eventStates);
  const pointStates =
    filter.containsPointStates === undefined ? null : new Set(filter.containsPointStates);
  const qcCodes = filter.qcCodes === undefined ? null : new Set(filter.qcCodes);

  return model.events.filter((event) => {
    if (datasetIds !== null && !datasetIds.has(event.dataset.datasetId)) return false;
    if (sourceFileHashes !== null && !sourceFileHashes.has(event.dataset.sourceFileHash)) return false;
    if (eventStates !== null && !eventStates.has(event.state)) return false;
    if (pointStates !== null && !event.points.some((point) => pointStates.has(point.state))) return false;
    if (
      qcCodes !== null &&
      !event.points.some((point) => point.qcCodes.some((code) => qcCodes.has(code)))
    ) {
      return false;
    }
    return true;
  });
}
