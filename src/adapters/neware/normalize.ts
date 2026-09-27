import type {
  CanonicalRowV1,
  CanonicalStepType,
  MeasurementResolutionSetV1,
} from '../../science/contracts';
import {
  createRowId,
  hashCanonicalDataset,
  hashNormalizationReceipt,
  sha256Hex,
} from '../../science/hash';
import {
  recordStorageFloat32ResolutionEvidence,
  unavailableMeasurementResolutionSet,
} from '../../science/measurementResolution';
import {
  landCexCurrentResolutionEvidence,
} from '../land/cex';
import { ticksToSeconds } from '../../science/time';
import { parseNewareNdax, type NewareNdaxMetadata } from './ndax';

export type NewareCanonicalDataset = {
  rows: CanonicalRowV1[];
  metadata: NewareNdaxMetadata;
  sourceFileHash: string;
  canonicalDatasetHash: string;
  normalizationReceiptHash: string;
  warnings: string[];
};

/**
 * NDC14 and NDC17 store voltage/current as float32. The bounds below are
 * derived from the declared full-scale ranges and are intentionally marked
 * provisional: they describe record serialization, not instrument accuracy.
 */
export function deriveNewareMeasurementResolution(
  metadata: NewareNdaxMetadata,
): MeasurementResolutionSetV1 {
  return {
    currentA: recordStorageFloat32ResolutionEvidence(
      metadata.currentRangeMa === null ? null : metadata.currentRangeMa / 1000,
      'Current',
    ),
    voltageV: recordStorageFloat32ResolutionEvidence(metadata.voltageRangeV, 'Voltage'),
  };
}

/** Use only evidence appropriate to the adapter that produced the rows. */
export function deriveAdapterMeasurementResolution(
  metadata: NewareNdaxMetadata,
): MeasurementResolutionSetV1 {
  if (metadata.parserProfileId === 'land-cex-binary-v1') {
    return {
      currentA: landCexCurrentResolutionEvidence(),
      voltageV: unavailableMeasurementResolutionSet().voltageV,
    };
  }
  return deriveNewareMeasurementResolution(metadata);
}

function canonicalStepType(status: string): CanonicalStepType {
  if (status === 'Rest' || status === 'OCV' || status === 'Pause') return 'rest';
  if (status.includes('DChg')) return 'discharge';
  if (status.includes('Chg')) return 'charge';
  return 'unknown';
}

export async function normalizeNewareNdax(
  input: ArrayBuffer | Uint8Array,
  sourceFileId: string,
): Promise<NewareCanonicalDataset> {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  const sourceFileHash = sha256Hex(bytes);
  const parsed = await parseNewareNdax(bytes);
  if (parsed.records.length === 0) throw new Error('neware_ndax_contains_no_records');
  const firstTimestampMs = parsed.records[0].timestampMs;
  const timeResolutionNs = parsed.metadata.sourceTimeResolutionNs;
  const measurementResolution = deriveNewareMeasurementResolution(parsed.metadata);
  const ndcLabel = parsed.metadata.ndcVersion === 14 ? 'NDC14' : 'NDC17';

  const rows = parsed.records.map<CanonicalRowV1>((record) => {
    const elapsedTimeTicks = record.timestampMs - firstTimestampMs;
    const source = {
      sourceFileId,
      sourceFileHash,
      instrumentId: parsed.metadata.instrumentId,
      channelId: parsed.metadata.channelId,
      sourceStream: 'ndax:data.ndc:main',
      sourceSheet: null,
      sourceRowIndex: BigInt(record.index),
      sourceRecordSequence: BigInt(record.index),
      parserVersion: parsed.metadata.parserProfileVersion,
    };
    const time = {
      elapsedTimeTicks,
      stepElapsedTimeTicks: BigInt(record.stepTimeMs),
      timeResolutionNs,
      recordSequence: BigInt(record.index),
      elapsedTimeS: ticksToSeconds(elapsedTimeTicks, timeResolutionNs),
    };
    return {
      ...source,
      ...time,
      rowId: createRowId(source),
      voltageV: record.voltageV,
      currentA: record.currentMa / 1000,
      temperatureC: null,
      vendorStepId: String(record.stepIndex),
      vendorStepType: record.status,
      analysisStepId: `neware-step-${record.stepOrdinal}`,
      canonicalStepType: canonicalStepType(record.status),
      chargeCapacityAh: record.chargeCapacityAh,
      dischargeCapacityAh: record.dischargeCapacityAh,
      netCapacityAh: record.chargeCapacityAh - record.dischargeCapacityAh,
    };
  });

  const canonicalDatasetHash = hashCanonicalDataset(rows);
  const normalizationReceiptHash = hashNormalizationReceipt({
    sourceFileHash,
    parserVersion: parsed.metadata.parserProfileVersion,
    vendorProfileId: parsed.metadata.parserProfileId,
    vendorProfileVersion: parsed.metadata.parserProfileVersion,
    unitEvidence: {
      voltage: `${ndcLabel} data.ndc float32 voltage in V; source precision preserved`,
      current: `${ndcLabel} data.ndc float32 current in A; source precision preserved without display rounding`,
      capacity: `${ndcLabel} data_runInfo.ndc float32 cumulative capacity in Ah`,
    },
    signEvidence: `Signed ${ndcLabel} current is preserved; this provisional profile interprets discharge as negative`,
    timeEvidence: `${ndcLabel} integer epoch milliseconds and integer step milliseconds`,
    capacityEvidence: 'Vendor cumulative charge/discharge fields retained separately',
    resolutionEvidence: measurementResolution,
  });

  return {
    rows,
    metadata: parsed.metadata,
    sourceFileHash,
    canonicalDatasetHash,
    normalizationReceiptHash,
    warnings: parsed.warnings,
  };
}
