import type { AnalysisVersionsV1, CanonicalRowV1, CanonicalSourceV1 } from './contracts';
import { compareCanonicalTimes } from './time';

const SHA256_INITIAL = [
  0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab,
  0x5be0cd19,
] as const;

const SHA256_ROUND_CONSTANTS = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4,
  0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe,
  0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f,
  0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7,
  0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc,
  0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b,
  0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070, 0x19a4c116,
  0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7,
  0xc67178f2,
] as const;

function rotateRight(value: number, count: number): number {
  return (value >>> count) | (value << (32 - count));
}

function sha256Bytes(input: Uint8Array): Uint8Array {
  const bitLength = BigInt(input.byteLength) * 8n;
  const paddedLength = Math.ceil((input.byteLength + 9) / 64) * 64;
  const padded = new Uint8Array(paddedLength);
  padded.set(input);
  padded[input.byteLength] = 0x80;

  for (let index = 0; index < 8; index += 1) {
    padded[paddedLength - 1 - index] = Number((bitLength >> BigInt(index * 8)) & 0xffn);
  }

  const hash: number[] = [...SHA256_INITIAL];
  const words = new Uint32Array(64);
  const view = new DataView(padded.buffer);

  for (let offset = 0; offset < paddedLength; offset += 64) {
    for (let index = 0; index < 16; index += 1) words[index] = view.getUint32(offset + index * 4, false);
    for (let index = 16; index < 64; index += 1) {
      const s0 = rotateRight(words[index - 15], 7) ^ rotateRight(words[index - 15], 18) ^ (words[index - 15] >>> 3);
      const s1 = rotateRight(words[index - 2], 17) ^ rotateRight(words[index - 2], 19) ^ (words[index - 2] >>> 10);
      words[index] = (words[index - 16] + s0 + words[index - 7] + s1) >>> 0;
    }

    let [a, b, c, d, e, f, g, h] = hash;
    for (let index = 0; index < 64; index += 1) {
      const upperSigma1 = rotateRight(e, 6) ^ rotateRight(e, 11) ^ rotateRight(e, 25);
      const choice = (e & f) ^ (~e & g);
      const temp1 = (h + upperSigma1 + choice + SHA256_ROUND_CONSTANTS[index] + words[index]) >>> 0;
      const upperSigma0 = rotateRight(a, 2) ^ rotateRight(a, 13) ^ rotateRight(a, 22);
      const majority = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (upperSigma0 + majority) >>> 0;
      h = g;
      g = f;
      f = e;
      e = (d + temp1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) >>> 0;
    }

    hash[0] = (hash[0] + a) >>> 0;
    hash[1] = (hash[1] + b) >>> 0;
    hash[2] = (hash[2] + c) >>> 0;
    hash[3] = (hash[3] + d) >>> 0;
    hash[4] = (hash[4] + e) >>> 0;
    hash[5] = (hash[5] + f) >>> 0;
    hash[6] = (hash[6] + g) >>> 0;
    hash[7] = (hash[7] + h) >>> 0;
  }

  const output = new Uint8Array(32);
  const outputView = new DataView(output.buffer);
  hash.forEach((value, index) => outputView.setUint32(index * 4, value, false));
  return output;
}

function utf8(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

export function sha256Hex(input: string | Uint8Array): string {
  const digest = sha256Bytes(typeof input === 'string' ? utf8(input) : input);
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function canonicalNumber(value: number): string {
  if (!Number.isFinite(value)) throw new TypeError('Canonical JSON does not permit NaN or Infinity');
  return Object.is(value, -0) ? '0' : JSON.stringify(value);
}

function canonicalString(value: string): string {
  return JSON.stringify(value.normalize('NFC'));
}

function canonicalize(value: unknown, seen: Set<object>): string {
  if (value === null || value === undefined) return 'null';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') return canonicalNumber(value);
  if (typeof value === 'bigint') return canonicalString(value.toString());
  if (typeof value === 'string') return canonicalString(value);
  if (typeof value !== 'object') throw new TypeError(`Unsupported canonical JSON value: ${typeof value}`);

  if (seen.has(value)) throw new TypeError('Canonical JSON does not permit cyclic values');
  seen.add(value);

  try {
    if (Array.isArray(value)) return `[${value.map((item) => canonicalize(item, seen)).join(',')}]`;

    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new TypeError('Canonical JSON only accepts arrays and plain objects');
    }

    const entries = Object.entries(value as Record<string, unknown>).map(([key, entryValue]) => ({
      key: key.normalize('NFC'),
      value: entryValue,
    }));
    entries.sort((left, right) => (left.key < right.key ? -1 : left.key > right.key ? 1 : 0));

    for (let index = 1; index < entries.length; index += 1) {
      if (entries[index - 1].key === entries[index].key) {
        throw new TypeError(`Object keys collide after NFC normalization: ${entries[index].key}`);
      }
    }

    return `{${entries
      .map(({ key, value: entryValue }) => `${canonicalString(key)}:${canonicalize(entryValue, seen)}`)
      .join(',')}}`;
  } finally {
    seen.delete(value);
  }
}

/** RFC 8785/JCS-compatible JSON with the project additions: NFC strings and bigint decimal strings. */
export function canonicalizeScientificJson(value: unknown): string {
  return canonicalize(value, new Set<object>());
}

export function hashCanonicalValue(value: unknown): string {
  return sha256Hex(canonicalizeScientificJson(value));
}

export function createSourceRecordIdentity(
  source: Pick<CanonicalSourceV1, 'sourceSheet' | 'sourceRowIndex' | 'sourceRecordSequence'>,
): string {
  return canonicalizeScientificJson({
    sourceRecordSequence: source.sourceRecordSequence,
    sourceRowIndex: source.sourceRowIndex,
    sourceSheet: source.sourceSheet,
  });
}

export function createRowId(
  source: Pick<
    CanonicalSourceV1,
    | 'sourceFileHash'
    | 'channelId'
    | 'sourceStream'
    | 'sourceSheet'
    | 'sourceRowIndex'
    | 'sourceRecordSequence'
  >,
): string {
  for (const [field, value] of [
    ['sourceFileHash', source.sourceFileHash],
    ['channelId', source.channelId ?? ''],
    ['sourceStream', source.sourceStream],
  ] as const) {
    if (value.includes('\0')) throw new TypeError(`${field} cannot contain a NUL character`);
  }
  const sourceRecordIdentity = createSourceRecordIdentity(source);
  return sha256Hex(
    `source-row-v1\0${source.sourceFileHash}\0${source.channelId ?? ''}\0${source.sourceStream}\0${sourceRecordIdentity}`,
  );
}

function canonicalScientificRow(row: CanonicalRowV1): Record<string, unknown> {
  return {
    analysisStepId: row.analysisStepId,
    canonicalStepType: row.canonicalStepType,
    chargeCapacityAh: row.chargeCapacityAh,
    currentA: row.currentA,
    dischargeCapacityAh: row.dischargeCapacityAh,
    elapsedTimeTicks: row.elapsedTimeTicks,
    netCapacityAh: row.netCapacityAh,
    recordSequence: row.recordSequence,
    rowId: row.rowId,
    stepElapsedTimeTicks: row.stepElapsedTimeTicks,
    temperatureC: row.temperatureC,
    timeResolutionNs: row.timeResolutionNs,
    vendorStepId: row.vendorStepId,
    vendorStepType: row.vendorStepType,
    voltageV: row.voltageV,
  };
}

export function hashCanonicalDataset(rows: readonly CanonicalRowV1[]): string {
  const orderedRows = [...rows].sort((left, right) => {
    const timeComparison = compareCanonicalTimes(left, right);
    if (timeComparison !== 0) return timeComparison;
    return left.rowId < right.rowId ? -1 : left.rowId > right.rowId ? 1 : 0;
  });
  return hashCanonicalValue({ schema: 'canonical-dataset-v1', rows: orderedRows.map(canonicalScientificRow) });
}

export type NormalizationReceiptHashInput = {
  sourceFileHash: string;
  parserVersion: string;
  vendorProfileId: string;
  vendorProfileVersion: string;
  unitEvidence: unknown;
  signEvidence: unknown;
  timeEvidence: unknown;
  capacityEvidence: unknown;
  resolutionEvidence?: unknown;
};

export function hashNormalizationReceipt(receipt: NormalizationReceiptHashInput): string {
  return hashCanonicalValue({ schema: 'normalization-receipt-v1', ...receipt });
}

export function hashAnalysisConfig(config: unknown): string {
  return hashCanonicalValue({ schema: 'analysis-config-v1', config });
}

export type AnalysisInputHashInput = {
  canonicalDatasetHash: string;
  configHash: string;
  versions: AnalysisVersionsV1;
};

/**
 * App build identity belongs in a manifest for provenance, but must never
 * change a reproducible scientific analysis identity. Keep this projection
 * explicit rather than relying on callers to omit build metadata.
 */
export function scientificVersionIdentity(
  versions: AnalysisVersionsV1,
): Omit<AnalysisVersionsV1, 'appVersion' | 'buildCommit'> {
  return {
    scientificContractVersion: versions.scientificContractVersion,
    canonicalSchemaVersion: versions.canonicalSchemaVersion,
    parserVersion: versions.parserVersion,
    vendorProfileId: versions.vendorProfileId,
    vendorProfileVersion: versions.vendorProfileVersion,
    stepSegmentationVersion: versions.stepSegmentationVersion,
    socContractVersion: versions.socContractVersion,
    algorithmId: versions.algorithmId,
    algorithmVersion: versions.algorithmVersion,
    qcPolicyId: versions.qcPolicyId,
    materialPresetId: versions.materialPresetId,
    uncertaintyModelVersion: versions.uncertaintyModelVersion,
    manifestSchemaVersion: versions.manifestSchemaVersion,
    oraclePackVersion: versions.oraclePackVersion,
  };
}

export function hashAnalysisInput(input: AnalysisInputHashInput): string {
  return hashCanonicalValue({
    schema: 'analysis-input-v2',
    canonicalDatasetHash: input.canonicalDatasetHash,
    configHash: input.configHash,
    scientificVersions: scientificVersionIdentity(input.versions),
  });
}

export function hashScientificResult(result: unknown): string {
  return hashCanonicalValue({ schema: 'scientific-result-v1', result });
}
