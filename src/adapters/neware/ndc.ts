export type NdcHeader = {
  fileType: number;
  version: number;
};

export type SupportedNewareNdcVersion = 14 | 17;

export type NewareDataRecord = {
  index: number;
  voltageV: number;
  currentMa: number;
};

export type NewareRunInfoRecord = {
  index: number;
  rawStep: number;
  stepOrdinal: number;
  stepTimeMs: number;
  dtMs: number;
  timestampMs: bigint;
  chargeCapacityAh: number;
  dischargeCapacityAh: number;
};

export type NewareStepRecord = {
  stepOrdinal: number;
  cycle: number;
  stepIndex: number;
  statusCode: number;
  status: string;
};

const BLOCK_SIZE = 4096;
const BLOCK_PAYLOAD_OFFSET = 132;

export const NEWARE_STATUS: Record<number, string> = {
  1: 'CC_Chg',
  2: 'CC_DChg',
  3: 'CV_Chg',
  4: 'Rest',
  5: 'Cycle',
  7: 'CCCV_Chg',
  8: 'CP_DChg',
  9: 'CP_Chg',
  10: 'CR_DChg',
  13: 'Pause',
  16: 'Pulse',
  17: 'SIM',
  19: 'CV_DChg',
  20: 'CCCV_DChg',
  21: 'Control',
  22: 'OCV',
  26: 'CPCV_DChg',
  27: 'CPCV_Chg',
};

export function readNdcHeader(bytes: Uint8Array): NdcHeader {
  if (bytes.byteLength < 3) throw new Error('neware_ndc_header_too_short');
  return { fileType: bytes[0], version: bytes[2] };
}

function assertNdc(bytes: Uint8Array, version: number, fileType: number): void {
  const header = readNdcHeader(bytes);
  if (header.version !== version || header.fileType !== fileType) {
    throw new Error(
      `neware_ndc_profile_mismatch:expected_v${version}_type${fileType}:actual_v${header.version}_type${header.fileType}`,
    );
  }
}

function forEachBlockRecord(
  bytes: Uint8Array,
  recordLength: number,
  trailingBytes: number,
  callback: (view: DataView, offset: number) => void,
): void {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  for (let blockStart = BLOCK_SIZE; blockStart + BLOCK_PAYLOAD_OFFSET < bytes.byteLength; blockStart += BLOCK_SIZE) {
    const blockEnd = Math.min(blockStart + BLOCK_SIZE, bytes.byteLength);
    const payloadEnd = blockEnd - trailingBytes;
    for (
      let offset = blockStart + BLOCK_PAYLOAD_OFFSET;
      offset + recordLength <= payloadEnd;
      offset += recordLength
    ) {
      callback(view, offset);
    }
  }
}

export function parseNdc17Data(bytes: Uint8Array): NewareDataRecord[] {
  assertNdc(bytes, 17, 1);
  const records: NewareDataRecord[] = [];
  let index = 1;
  forEachBlockRecord(bytes, 8, 4, (view, offset) => {
    const voltageV = view.getFloat32(offset, true);
    const currentMa = view.getFloat32(offset + 4, true) * 1000;
    if (voltageV !== 0) {
      records.push({ index, voltageV, currentMa });
      index += 1;
    }
  });
  return records;
}

export function parseNdc17RunInfo(bytes: Uint8Array): NewareRunInfoRecord[] {
  assertNdc(bytes, 17, 18);
  const byIndex = new Map<number, Omit<NewareRunInfoRecord, 'stepOrdinal'>>();

  forEachBlockRecord(bytes, 100, 64, (view, offset) => {
    const stepTimeMs = view.getInt32(offset, true);
    const chargeCapacityAh = view.getFloat32(offset + 5, true);
    const dischargeCapacityAh = view.getFloat32(offset + 9, true);
    const dtMs = view.getInt32(offset + 29, true);
    const timestampSeconds = view.getInt32(offset + 33, true);
    const rawStep = view.getInt32(offset + 37, true);
    const index = view.getInt32(offset + 41, true);
    const timestampRemainderMs = view.getInt16(offset + 45, true);
    if (index === 0 || byIndex.has(index)) return;

    byIndex.set(index, {
      index,
      rawStep,
      stepTimeMs,
      dtMs,
      timestampMs: BigInt(timestampSeconds) * 1000n + BigInt(timestampRemainderMs),
      chargeCapacityAh,
      dischargeCapacityAh,
    });
  });

  const records = [...byIndex.values()].sort((left, right) => left.index - right.index);
  let stepOrdinal = 0;
  let previousRawStep: number | null = null;
  return records.map((record) => {
    if (previousRawStep === null || record.rawStep !== previousRawStep) stepOrdinal += 1;
    previousRawStep = record.rawStep;
    return { ...record, stepOrdinal };
  });
}

export function parseNdc17Steps(bytes: Uint8Array): NewareStepRecord[] {
  assertNdc(bytes, 17, 7);
  const records: NewareStepRecord[] = [];
  forEachBlockRecord(bytes, 100, 64, (view, offset) => {
    const cycle = view.getInt32(offset, true) + 1;
    const stepIndex = view.getInt32(offset + 4, true);
    const statusCode = view.getUint8(offset + 24);
    const index = view.getInt32(offset + 33, true);
    if (index === 0) return;
    records.push({
      stepOrdinal: records.length + 1,
      cycle,
      stepIndex,
      statusCode,
      status: NEWARE_STATUS[statusCode] ?? `Unknown_${statusCode}`,
    });
  });
  return records;
}

export function parseNdc14Data(bytes: Uint8Array): NewareDataRecord[] {
  assertNdc(bytes, 14, 1);
  const records: NewareDataRecord[] = [];
  let index = 1;
  forEachBlockRecord(bytes, 8, 4, (view, offset) => {
    const voltageV = view.getFloat32(offset, true);
    const currentMa = view.getFloat32(offset + 4, true) * 1000;
    if (voltageV !== 0) {
      records.push({ index, voltageV, currentMa });
      index += 1;
    }
  });
  return records;
}

export function parseNdc14RunInfo(bytes: Uint8Array): NewareRunInfoRecord[] {
  assertNdc(bytes, 14, 18);
  const byIndex = new Map<number, Omit<NewareRunInfoRecord, 'stepOrdinal'>>();

  // v14 appends an 8-byte field to each run-info record.  The fields used by
  // the canonical schema retain the same offsets as v17.
  forEachBlockRecord(bytes, 55, 59, (view, offset) => {
    const stepTimeMs = view.getInt32(offset, true);
    const chargeCapacityAh = view.getFloat32(offset + 5, true);
    const dischargeCapacityAh = view.getFloat32(offset + 9, true);
    const dtMs = view.getInt32(offset + 29, true);
    const timestampSeconds = view.getInt32(offset + 33, true);
    const rawStep = view.getInt32(offset + 37, true);
    const index = view.getInt32(offset + 41, true);
    const timestampRemainderMs = view.getInt16(offset + 45, true);
    if (index === 0 || byIndex.has(index)) return;

    byIndex.set(index, {
      index,
      rawStep,
      stepTimeMs,
      dtMs,
      timestampMs: BigInt(timestampSeconds) * 1000n + BigInt(timestampRemainderMs),
      chargeCapacityAh,
      dischargeCapacityAh,
    });
  });

  const records = [...byIndex.values()].sort((left, right) => left.index - right.index);
  let stepOrdinal = 0;
  let previousRawStep: number | null = null;
  return records.map((record) => {
    if (previousRawStep === null || record.rawStep !== previousRawStep) stepOrdinal += 1;
    previousRawStep = record.rawStep;
    return { ...record, stepOrdinal };
  });
}

export function parseNdc14Steps(bytes: Uint8Array): NewareStepRecord[] {
  assertNdc(bytes, 14, 7);
  const records: NewareStepRecord[] = [];
  forEachBlockRecord(bytes, 37, 5, (view, offset) => {
    const cycle = view.getInt32(offset, true) + 1;
    const stepIndex = view.getInt32(offset + 4, true);
    const statusCode = view.getUint8(offset + 24);
    if (stepIndex === 0) return;
    records.push({
      stepOrdinal: records.length + 1,
      cycle,
      stepIndex,
      statusCode,
      status: NEWARE_STATUS[statusCode] ?? `Unknown_${statusCode}`,
    });
  });
  return records;
}

export function parseNdcData(bytes: Uint8Array): NewareDataRecord[] {
  const header = readNdcHeader(bytes);
  if (header.version === 14) return parseNdc14Data(bytes);
  if (header.version === 17) return parseNdc17Data(bytes);
  throw new Error(`neware_ndc_profile_unsupported:v${header.version}_type${header.fileType}`);
}

export function parseNdcRunInfo(bytes: Uint8Array): NewareRunInfoRecord[] {
  const header = readNdcHeader(bytes);
  if (header.version === 14) return parseNdc14RunInfo(bytes);
  if (header.version === 17) return parseNdc17RunInfo(bytes);
  throw new Error(`neware_ndc_profile_unsupported:v${header.version}_type${header.fileType}`);
}

export function parseNdcSteps(bytes: Uint8Array): NewareStepRecord[] {
  const header = readNdcHeader(bytes);
  if (header.version === 14) return parseNdc14Steps(bytes);
  if (header.version === 17) return parseNdc17Steps(bytes);
  throw new Error(`neware_ndc_profile_unsupported:v${header.version}_type${header.fileType}`);
}

