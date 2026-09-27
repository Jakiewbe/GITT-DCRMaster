import type { CanonicalRowV1, CanonicalStepType, MeasurementResolutionSetV1 } from '../../science/contracts';
import {
  createRowId,
  hashCanonicalDataset,
  hashNormalizationReceipt,
  sha256Hex,
} from '../../science/hash';
import { unavailableMeasurementResolutionSet } from '../../science/measurementResolution';
import { ticksToSeconds } from '../../science/time';
import type { NewareNdaxMetadata, NewareProgramStep } from '../neware/ndax';
import type { NewareCanonicalDataset } from '../neware/normalize';

export const LAND_CEX_PARSER_PROFILE_ID = 'land-cex-binary-v1' as const;
export const LAND_CEX_PARSER_VERSION = '0.3.0-provisional' as const;

const LAND_CEX_HEADER = [0x10, 0x11, 0x09, 0x88] as const;
const LAND_CEX_MARKER = [0xcc, 0xcc, 0xff, 0xff] as const;
const LAND_CEX_RECORD_BYTES = 16;
const LAND_CEX_VOLTAGE_COUNTS_PER_VOLT = 5376;
/** Validated against LAND's official Rec.Current oracle for real GITT and DCR CEX files. */
export const LAND_CEX_CURRENT_COUNTS_PER_AMP = 32_256_000;
const LAND_CEX_GITT_PULSE_DURATION_OFFSET = 0x23c;
const LAND_CEX_GITT_POST_REST_DURATION_OFFSET = 0x274;
const LAND_CEX_GITT_STOP_VOLTAGE_OFFSET = 0x294;

export type LandCexRawRecord = {
  index: number;
  markerOffset: number;
  timeTick: number;
  voltageCode: number;
  voltageV: number;
  rawCurrentCode: number;
  rawCapacity: number;
  rawEnergy: number;
};

export type LandCexParseResult = {
  records: LandCexRawRecord[];
  metadata: NewareNdaxMetadata;
  warnings: string[];
};

export function landCexCurrentResolutionEvidence(): MeasurementResolutionSetV1['currentA'] {
  return {
    value: 1 / LAND_CEX_CURRENT_COUNTS_PER_AMP,
    basisValue: LAND_CEX_CURRENT_COUNTS_PER_AMP,
    source: 'vendor_oracle_validated_raw_code_lsb',
    provisional: true,
    message:
      'LAND official Rec.Current oracle validates signed raw current code (+6/+7) scale: ' +
      `1 code = 1/${LAND_CEX_CURRENT_COUNTS_PER_AMP} A. This is a code LSB, not an accuracy specification.`,
  };
}

type LandCexPhase = 'rest' | 'charge' | 'discharge';

function finiteFloat32(view: DataView, offset: number): number | null {
  if (offset < 0 || offset + 4 > view.byteLength) return null;
  const value = view.getFloat32(offset, true);
  return Number.isFinite(value) ? value : null;
}

/** LAND stores voltage as a 16-bit count with 5376 counts per volt. */
function decodeVoltage(code: number): number {
  return code / LAND_CEX_VOLTAGE_COUNTS_PER_VOLT;
}

function decodeCurrent(rawCode: number): number {
  return rawCode / LAND_CEX_CURRENT_COUNTS_PER_AMP;
}

function hasHeader(bytes: Uint8Array): boolean {
  return LAND_CEX_HEADER.every((value, index) => bytes[index] === value);
}

function markerAt(bytes: Uint8Array, offset: number): boolean {
  return LAND_CEX_MARKER.every((value, index) => bytes[offset + index] === value);
}

function readActiveMassMg(view: DataView): number | null {
  const activeMassG = finiteFloat32(view, 0x1c);
  return activeMassG !== null && activeMassG > 0 ? activeMassG * 1000 : null;
}

function readObservedGittProgramSteps(view: DataView): NewareProgramStep[] {
  const pulseDurationS = finiteFloat32(view, LAND_CEX_GITT_PULSE_DURATION_OFFSET);
  const postRestDurationS = finiteFloat32(view, LAND_CEX_GITT_POST_REST_DURATION_OFFSET);
  const stopVoltageV = finiteFloat32(view, LAND_CEX_GITT_STOP_VOLTAGE_OFFSET);
  if (
    pulseDurationS === null ||
    postRestDurationS === null ||
    stopVoltageV === null ||
    pulseDurationS <= 0 ||
    postRestDurationS <= 0 ||
    stopVoltageV <= 0
  ) {
    return [];
  }
  return [
    {
      stepId: 2,
      stepTypeCode: 2,
      recordIntervalMs: null,
      durationMs: pulseDurationS * 1000,
      currentMa: null,
      stopVoltageV,
      stopVoltageRaw: null,
    },
    {
      stepId: 3,
      stepTypeCode: 4,
      recordIntervalMs: null,
      durationMs: postRestDurationS * 1000,
      currentMa: null,
    },
  ];
}

function parseCandidateRows(
  view: DataView,
  startOffset: number,
  endOffset: number,
  markerOffset: number,
): LandCexRawRecord[] | null {
  if (startOffset >= endOffset || (endOffset - startOffset) % LAND_CEX_RECORD_BYTES !== 0) return null;
  const rows: LandCexRawRecord[] = [];
  let previousTimeTick = -1;
  for (let offset = startOffset; offset < endOffset; offset += LAND_CEX_RECORD_BYTES) {
    const timeTick = view.getUint32(offset, true);
    const voltageCode = view.getUint16(offset + 4, true);
    const voltageV = decodeVoltage(voltageCode);
    const rawCurrentCode = view.getInt16(offset + 6, true);
    const rawCapacity = finiteFloat32(view, offset + 8);
    const rawEnergy = finiteFloat32(view, offset + 12);
    if (
      timeTick <= previousTimeTick ||
      !Number.isFinite(voltageV) ||
      voltageV <= 0 ||
      voltageV >= 5 ||
      rawCapacity === null ||
      rawEnergy === null
    ) {
      return null;
    }
    rows.push({
      index: rows.length,
      markerOffset,
      timeTick,
      voltageCode,
      voltageV,
      rawCurrentCode,
      rawCapacity,
      rawEnergy,
    });
    previousTimeTick = timeTick;
  }
  return rows;
}

function detectProcedure(bytes: Uint8Array): string | null {
  let ascii = '';
  for (const byte of bytes) ascii += byte >= 0x20 && byte <= 0x7e ? String.fromCharCode(byte) : ' ';
  if (ascii.includes('DCR')) return 'DCR';
  if (ascii.includes('GITT-')) return 'GITT';
  return null;
}

function metadataForCex(view: DataView, bytes: Uint8Array): NewareNdaxMetadata {
  const remark = detectProcedure(bytes);
  return {
    parserProfileId: LAND_CEX_PARSER_PROFILE_ID,
    parserProfileVersion: LAND_CEX_PARSER_VERSION,
    approvalState: 'provisional',
    instrumentId: 'LAND',
    channelId: null,
    testId: null,
    testGuid: null,
    clientVersion: null,
    serverVersion: null,
    firmwareVersion: null,
    activeMassMg: readActiveMassMg(view),
    remark,
    currentRangeMa: null,
    voltageRangeV: null,
    sourceTimeResolutionNs: 10_000_000n,
    programSteps: remark === 'GITT' ? readObservedGittProgramSteps(view) : [],
  };
}

export function parseLandCex(input: ArrayBuffer | Uint8Array): LandCexParseResult {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  if (!hasHeader(bytes)) throw new Error('land_cex_signature_invalid');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const markerOffsets: number[] = [];
  for (let offset = 0; offset + LAND_CEX_RECORD_BYTES <= bytes.byteLength; offset += LAND_CEX_RECORD_BYTES) {
    if (markerAt(bytes, offset)) markerOffsets.push(offset);
  }

  const records: LandCexRawRecord[] = [];
  for (let index = 0; index + 1 < markerOffsets.length; index += 1) {
    const markerOffset = markerOffsets[index];
    const nextMarkerOffset = markerOffsets[index + 1];
    const segmentRows = parseCandidateRows(view, markerOffset + LAND_CEX_RECORD_BYTES, nextMarkerOffset, markerOffset);
    if (segmentRows) records.push(...segmentRows);
  }
  records.sort((left, right) => left.timeTick - right.timeTick || left.markerOffset - right.markerOffset);
  if (records.length === 0) throw new Error('land_cex_contains_no_valid_records');
  return {
    records: records.map((record, index) => ({ ...record, index })),
    metadata: metadataForCex(view, bytes),
    warnings: [
      'LAND CEX binary mapping is provisional and validated only for the observed V7 profile.',
      'Loaded current is decoded directly from the signed +6/+7 raw current code using the scale validated against LAND official Rec.Current; the profile remains provisional.',
      'The capacity float field is now confirmed as cumulative Ah storage; the energy field is retained as raw evidence and is not used by the science core.',
      'Observed GITT pulse/rest durations and stop voltage are imported from validated CEX header fields as protocol evidence only; CanonicalRow trace values remain the production source.',
      'Current code-LSB evidence is available from the LAND official Rec.Current oracle; voltage-resolution evidence remains unavailable, and the binary profile remains provisional.',
    ],
  };
}

function phaseOf(record: LandCexRawRecord): LandCexPhase {
  if (record.rawCurrentCode === 0) return 'rest';
  return record.rawCurrentCode < 0 ? 'discharge' : 'charge';
}

function canonicalStepType(phase: LandCexPhase): CanonicalStepType {
  return phase;
}

function groupRecords(records: LandCexRawRecord[]): Array<{ phase: LandCexPhase; records: LandCexRawRecord[] }> {
  const groups: Array<{ phase: LandCexPhase; records: LandCexRawRecord[] }> = [];
  for (const record of records) {
    const phase = phaseOf(record);
    const current = groups[groups.length - 1];
    if (!current || current.phase !== phase) groups.push({ phase, records: [record] });
    else current.records.push(record);
  }
  return groups;
}

export async function normalizeLandCex(
  input: ArrayBuffer | Uint8Array,
  sourceFileId: string,
): Promise<NewareCanonicalDataset> {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  const sourceFileHash = sha256Hex(bytes);
  const parsed = parseLandCex(bytes);
  const timeResolutionNs = parsed.metadata.sourceTimeResolutionNs;
  const groups = groupRecords(parsed.records);
  const firstTimeTick = parsed.records[0].timeTick;
  let chargeCapacityAh = 0;
  let dischargeCapacityAh = 0;
  let recordIndex = 0;
  const rows: CanonicalRowV1[] = [];
  groups.forEach((group, groupIndex) => {
    const groupStartTick = group.records[0].timeTick;
    for (const record of group.records) {
      const capacityAh = record.rawCapacity;
      if (group.phase === 'charge') chargeCapacityAh = capacityAh;
      if (group.phase === 'discharge') dischargeCapacityAh = capacityAh;
      const elapsedTimeTicks = BigInt(record.timeTick - firstTimeTick);
      const source = {
        sourceFileId,
        sourceFileHash,
        instrumentId: parsed.metadata.instrumentId,
        channelId: parsed.metadata.channelId,
        sourceStream: 'land:cex:binary',
        sourceSheet: null,
        sourceRowIndex: BigInt(recordIndex),
        sourceRecordSequence: BigInt(recordIndex),
        parserVersion: parsed.metadata.parserProfileVersion,
      };
      rows.push({
        ...source,
        elapsedTimeTicks,
        stepElapsedTimeTicks: BigInt(record.timeTick - groupStartTick),
        timeResolutionNs,
        recordSequence: BigInt(recordIndex),
        elapsedTimeS: ticksToSeconds(elapsedTimeTicks, timeResolutionNs),
        rowId: createRowId(source),
        voltageV: record.voltageV,
        currentA: decodeCurrent(record.rawCurrentCode),
        temperatureC: null,
        vendorStepId: group.phase === 'rest' ? '3' : '2',
        vendorStepType: group.phase === 'rest' ? 'Rest' : group.phase === 'discharge' ? 'DChg' : 'Chg',
        analysisStepId: `land-step-${groupIndex}`,
        canonicalStepType: canonicalStepType(group.phase),
        chargeCapacityAh,
        dischargeCapacityAh,
        netCapacityAh: chargeCapacityAh - dischargeCapacityAh,
      });
      recordIndex += 1;
    }
  });

  const measurementResolution: MeasurementResolutionSetV1 = {
    currentA: landCexCurrentResolutionEvidence(),
    voltageV: unavailableMeasurementResolutionSet().voltageV,
  };
  return {
    rows,
    metadata: parsed.metadata,
    sourceFileHash,
    canonicalDatasetHash: hashCanonicalDataset(rows),
    normalizationReceiptHash: hashNormalizationReceipt({
      sourceFileHash,
      parserVersion: parsed.metadata.parserProfileVersion,
      vendorProfileId: parsed.metadata.parserProfileId,
      vendorProfileVersion: parsed.metadata.parserProfileVersion,
      unitEvidence: {
        voltage: 'LAND CEX V7 raw record field +4/+5 is an unsigned voltage count; official LAND oracle confirms voltageV = voltageCode / 5376.',
        current: 'LAND CEX signed raw current code at +6/+7 is decoded directly with the scale validated against official LAND Rec.Current: 1 code = 1/32256000 A.',
        capacity: 'LAND CEX V7 float32 field +8 is cumulative capacity in Ah storage units; no additional scale is applied.',
        energy: 'Observed LAND CEX float32 field +12 is retained as raw energy evidence; it is not used by the science core.',
      },
      signEvidence: 'Signed 16-bit field +6/+7 is decoded directly: zero indicates rest, negative indicates discharge, positive indicates charge; its scale is validated against official LAND Rec.Current, while the profile remains provisional.',
      timeEvidence: 'LAND CEX V7 uint32 record field +0 is elapsed time in 10 ms ticks; official LAND Rec.StepTime confirms the scale.',
      capacityEvidence: 'Raw cumulative capacity is retained through canonical rows as an independent evidence field; it is not used to reconstruct current when the validated raw current code is present.',
      resolutionEvidence: measurementResolution,
    }),
    warnings: parsed.warnings,
  };
}
