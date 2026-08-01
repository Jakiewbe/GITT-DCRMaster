import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseNewareNdax, type NewareNdaxRecord } from '../../src/adapters/neware/ndax';
import {
  assessNewareIndependentQualification,
  NEWARE_INDEPENDENT_EXPORT_PARITY_V1,
} from '../../src/adapters/neware/qualification';
import receipt from './neware-independent-export-parity-v1.json';

type EvidenceRow = {
  recordIndex: number;
  cycle: number;
  stepOrdinal: number;
  stepIndex: number;
  status: string;
  stepTimeMs: number;
  timestampMs: bigint;
  voltageV: number;
  currentA: number;
  chargeCapacityAh: number;
  dischargeCapacityAh: number;
  voltageFloat32LeHex: string;
  currentFloat32LeHex: string;
  chargeCapacityFloat32LeHex: string;
  dischargeCapacityFloat32LeHex: string;
};

type ParityDifferences = {
  recordIndex: number;
  cycle: number;
  stepOrdinal: number;
  stepIndex: number;
  statusMismatchCount: number;
  stepTimeMs: number;
  timestampMs: number;
  voltageV: number;
  currentA: number;
  chargeCapacityAh: number;
  dischargeCapacityAh: number;
  rawFloat32BitMismatchCount: number;
};

const sourceDirectory = resolve(process.cwd(), '..', '260429 DCR');
const evidenceRoot = resolve('D:\\', receipt.evidenceRootRelativeToD);
const evidenceManifestPath = join(evidenceRoot, 'independent-export-manifest.json');
const frozenReceiptPath = resolve(
  process.cwd(),
  'tests',
  'qualification',
  'neware-independent-export-parity-v1.json',
);
const expectedHeader = [
  'record_index',
  'cycle',
  'step_ordinal',
  'step_index',
  'status',
  'step_time_ms',
  'timestamp_ms',
  'voltage_v',
  'current_a',
  'charge_capacity_ah',
  'discharge_capacity_ah',
  'voltage_float32_le_hex',
  'current_float32_le_hex',
  'charge_capacity_float32_le_hex',
  'discharge_capacity_float32_le_hex',
] as const;

function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function float32LeHex(value: number): string {
  const bytes = Buffer.allocUnsafe(4);
  bytes.writeFloatLE(value, 0);
  return bytes.toString('hex');
}

function parseInteger(text: string, field: string, line: number): number {
  if (!/^-?\d+$/.test(text)) throw new Error(`invalid_integer:${field}:line=${line}:value=${text}`);
  const value = Number(text);
  if (!Number.isSafeInteger(value)) throw new Error(`unsafe_integer:${field}:line=${line}:value=${text}`);
  return value;
}

function parseFinite(text: string, field: string, line: number): number {
  const value = Number(text);
  if (!Number.isFinite(value)) throw new Error(`invalid_number:${field}:line=${line}:value=${text}`);
  return value;
}

function parseEvidenceCsv(bytes: Buffer): EvidenceRow[] {
  const lines = bytes.toString('utf8').trimEnd().split('\n');
  expect(lines[0]?.replace(/\r$/, '').split(',')).toEqual(expectedHeader);
  return lines.slice(1).map((sourceLine, position) => {
    const line = position + 2;
    const fields = sourceLine.replace(/\r$/, '').split(',');
    if (fields.length !== expectedHeader.length) {
      throw new Error(`independent_csv_column_count:line=${line}:actual=${fields.length}`);
    }
    return {
      recordIndex: parseInteger(fields[0], 'record_index', line),
      cycle: parseInteger(fields[1], 'cycle', line),
      stepOrdinal: parseInteger(fields[2], 'step_ordinal', line),
      stepIndex: parseInteger(fields[3], 'step_index', line),
      status: fields[4],
      stepTimeMs: parseInteger(fields[5], 'step_time_ms', line),
      timestampMs: BigInt(fields[6]),
      voltageV: parseFinite(fields[7], 'voltage_v', line),
      currentA: parseFinite(fields[8], 'current_a', line),
      chargeCapacityAh: parseFinite(fields[9], 'charge_capacity_ah', line),
      dischargeCapacityAh: parseFinite(fields[10], 'discharge_capacity_ah', line),
      voltageFloat32LeHex: fields[11],
      currentFloat32LeHex: fields[12],
      chargeCapacityFloat32LeHex: fields[13],
      dischargeCapacityFloat32LeHex: fields[14],
    };
  });
}

function maxDifference(left: number, right: number): number {
  return Math.abs(left - right);
}

function compareRecords(records: NewareNdaxRecord[], evidence: EvidenceRow[]): ParityDifferences {
  expect(records).toHaveLength(evidence.length);
  const maxima: ParityDifferences = {
    recordIndex: 0,
    cycle: 0,
    stepOrdinal: 0,
    stepIndex: 0,
    statusMismatchCount: 0,
    stepTimeMs: 0,
    timestampMs: 0,
    voltageV: 0,
    currentA: 0,
    chargeCapacityAh: 0,
    dischargeCapacityAh: 0,
    rawFloat32BitMismatchCount: 0,
  };

  for (let index = 0; index < records.length; index += 1) {
    const actual = records[index];
    const expected = evidence[index];
    maxima.recordIndex = Math.max(maxima.recordIndex, maxDifference(actual.index, expected.recordIndex));
    maxima.cycle = Math.max(maxima.cycle, maxDifference(actual.cycle, expected.cycle));
    maxima.stepOrdinal = Math.max(
      maxima.stepOrdinal,
      maxDifference(actual.stepOrdinal, expected.stepOrdinal),
    );
    maxima.stepIndex = Math.max(maxima.stepIndex, maxDifference(actual.stepIndex, expected.stepIndex));
    maxima.statusMismatchCount += actual.status === expected.status ? 0 : 1;
    maxima.stepTimeMs = Math.max(maxima.stepTimeMs, maxDifference(actual.stepTimeMs, expected.stepTimeMs));
    maxima.timestampMs = Math.max(
      maxima.timestampMs,
      Number(actual.timestampMs > expected.timestampMs
        ? actual.timestampMs - expected.timestampMs
        : expected.timestampMs - actual.timestampMs),
    );
    maxima.voltageV = Math.max(maxima.voltageV, maxDifference(actual.voltageV, expected.voltageV));
    maxima.currentA = Math.max(maxima.currentA, maxDifference(actual.currentMa / 1000, expected.currentA));
    maxima.chargeCapacityAh = Math.max(
      maxima.chargeCapacityAh,
      maxDifference(actual.chargeCapacityAh, expected.chargeCapacityAh),
    );
    maxima.dischargeCapacityAh = Math.max(
      maxima.dischargeCapacityAh,
      maxDifference(actual.dischargeCapacityAh, expected.dischargeCapacityAh),
    );

    const actualFloat32Bits = [
      float32LeHex(actual.voltageV),
      float32LeHex(actual.currentMa / 1000),
      float32LeHex(actual.chargeCapacityAh),
      float32LeHex(actual.dischargeCapacityAh),
    ];
    const expectedFloat32Bits = [
      expected.voltageFloat32LeHex,
      expected.currentFloat32LeHex,
      expected.chargeCapacityFloat32LeHex,
      expected.dischargeCapacityFloat32LeHex,
    ];
    for (let field = 0; field < actualFloat32Bits.length; field += 1) {
      if (actualFloat32Bits[field] !== expectedFloat32Bits[field]) {
        maxima.rawFloat32BitMismatchCount += 1;
      }
    }
  }
  return maxima;
}

describe('Neware independent_export_parity receipt', () => {
  it('freezes independent evidence without presenting it as an official export or parser approval', () => {
    expect(receipt.evidenceKind).toBe('independent_export_parity');
    expect(receipt.officialExport).toBe(false);
    expect(receipt.exporterId).toBe('neware-independent-export-parity');
    expect(receipt.exporterVersion).toBe('1.0.0');
    expect(receipt.newareNdaVersion).toBe('v2026.06.11');
    expect(receipt.productionProfileApprovalState).toBe('provisional');
    expect(receipt.independentQualificationState).toBe('independent-qualified');
    expect(NEWARE_INDEPENDENT_EXPORT_PARITY_V1.receiptId).toBe(receipt.receiptId);
    expect(NEWARE_INDEPENDENT_EXPORT_PARITY_V1.receiptSha256).toBe(
      sha256(readFileSync(frozenReceiptPath)),
    );
    expect(NEWARE_INDEPENDENT_EXPORT_PARITY_V1.exporterId).toBe(receipt.exporterId);
    expect(NEWARE_INDEPENDENT_EXPORT_PARITY_V1.exporterVersion).toBe(receipt.exporterVersion);
    expect(NEWARE_INDEPENDENT_EXPORT_PARITY_V1.newareNdaVersion).toBe(receipt.newareNdaVersion);
    expect(receipt.files).toHaveLength(13);
    expect(receipt.totalRowCount).toBe(
      receipt.files.reduce((sum, file) => sum + file.rowCount, 0),
    );
    expect(new Set(receipt.files.map((file) => file.sourceFileSha256)).size).toBe(13);
    expect(new Set(receipt.files.map((file) => file.evidenceCsvSha256)).size).toBe(13);
    expect([...NEWARE_INDEPENDENT_EXPORT_PARITY_V1.sourceFileHashes].sort()).toEqual(
      receipt.files.map((file) => file.sourceFileSha256).sort(),
    );
    for (const file of receipt.files) {
      expect(assessNewareIndependentQualification(file.sourceFileSha256)).toEqual({
        independentQualificationState: 'independent-qualified',
        independentQualificationReceiptId: receipt.receiptId,
        independentQualificationReceiptHash: NEWARE_INDEPENDENT_EXPORT_PARITY_V1.receiptSha256,
      });
    }
    expect(assessNewareIndependentQualification('0'.repeat(64))).toEqual({
      independentQualificationState: 'not-qualified',
      independentQualificationReceiptId: null,
      independentQualificationReceiptHash: null,
    });
  });
});

describe.skipIf(!existsSync(sourceDirectory) || !existsSync(evidenceManifestPath))(
  'Neware independent_export_parity evidence',
  () => {
    it('matches all 13 NDAX files row-by-row against the production raw parser', async () => {
      const manifestBytes = readFileSync(evidenceManifestPath);
      expect(sha256(manifestBytes)).toBe(receipt.evidenceManifestSha256);

      let comparedRows = 0;
      for (const file of receipt.files) {
        const sourceBytes = readFileSync(join(sourceDirectory, file.sourceFileName));
        const evidenceBytes = readFileSync(join(evidenceRoot, file.evidenceCsvName));
        expect(sha256(sourceBytes)).toBe(file.sourceFileSha256);
        expect(sha256(evidenceBytes)).toBe(file.evidenceCsvSha256);

        const parsed = await parseNewareNdax(sourceBytes);
        const evidence = parseEvidenceCsv(evidenceBytes);
        expect(parsed.warnings).toEqual([]);
        expect(parsed.records).toHaveLength(file.rowCount);
        expect(evidence).toHaveLength(file.rowCount);
        expect(compareRecords(parsed.records, evidence)).toEqual(file.maxDifferences);
        comparedRows += file.rowCount;
      }
      expect(comparedRows).toBe(receipt.totalRowCount);
    }, 120_000);
  },
);
