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

function scaledFloat32ResolutionEvidence(
  rawFullScale: number | null,
  outputScale: number,
  quantity: 'Current' | 'Voltage',
  message: string,
) {
  const rawEvidence = recordStorageFloat32ResolutionEvidence(rawFullScale, quantity);
  return {
    ...rawEvidence,
    value: rawEvidence.value === null ? null : rawEvidence.value * outputScale,
    basisValue: rawFullScale,
    message,
  };
}

/**
 * Neware NDC generations store voltage/current as float32. The bounds below are
 * derived from the declared full-scale ranges and are intentionally marked
 * provisional: they describe record serialization, not instrument accuracy.
 */
export function deriveNewareMeasurementResolution(
  metadata: NewareNdaxMetadata,
): MeasurementResolutionSetV1 {
  const currentA =
    metadata.ndcVersion === 11
      ? scaledFloat32ResolutionEvidence(
          metadata.currentRangeMa,
          1 / 1000,
          'Current',
          'NDC11 current is stored as float32 mA and converted to A; the bound is storage spacing, not instrument accuracy.',
        )
      : recordStorageFloat32ResolutionEvidence(
          metadata.currentRangeMa === null ? null : metadata.currentRangeMa / 1000,
          'Current',
        );
  const voltageV =
    metadata.ndcVersion === 11
      ? scaledFloat32ResolutionEvidence(
          metadata.voltageRangeV === null ? null : metadata.voltageRangeV / 1e-4,
          1e-4,
          'Voltage',
          'NDC11 voltage is stored as float32 in 1e-4 V units; the bound is converted to V and is not instrument accuracy.',
        )
      : recordStorageFloat32ResolutionEvidence(metadata.voltageRangeV, 'Voltage');
  return {
    currentA,
    voltageV,
  };
}

/** Use only evidence appropriate to the adapter that produced the rows. */
export function deriveAdapterMeasurementResolution(
  metadata: NewareNdaxMetadata,
): MeasurementResolutionSetV1 {
  if (metadata.parserProfileId === 'land-cex-binary-v1') {
    return {
      currentA: landCexCurrentResolutionEvidence(metadata.currentRangeMa),
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
  const ndcVersion = parsed.metadata.ndcVersion;
  const ndcLabel = `NDC${ndcVersion ?? 'unknown'}`;

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
      voltage:
        ndcVersion === 11
          ? 'NDC11 data.ndc float32 voltage scaled by 1e-4 to V; source precision preserved'
          : `${ndcLabel} data.ndc float32 voltage in V; source precision preserved`,
      current:
        ndcVersion === 11
          ? 'NDC11 data.ndc float32 current in mA; converted to A at canonical boundary without display rounding'
          : `${ndcLabel} data.ndc float32 current in A; source precision preserved without display rounding`,
      capacity:
        ndcVersion === 11
          ? 'NDC11 data_runInfo.ndc cumulative capacity in mA·s divided by 3,600,000 to Ah'
          : `${ndcLabel} data_runInfo.ndc float32 cumulative capacity in Ah`,
    },
    signEvidence: `Signed ${ndcLabel} current is preserved; this provisional profile interprets discharge as negative`,
    timeEvidence: `${ndcLabel} integer epoch timestamp with millisecond remainder and integer step milliseconds`,
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
