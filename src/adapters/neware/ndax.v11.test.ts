import { describe, expect, it } from 'vitest';
import { Uint8ArrayReader, Uint8ArrayWriter, ZipWriter } from '@zip.js/zip.js';
import { normalizeNewareNdax } from './normalize';
import { parseNewareNdax } from './ndax';

const BLOCK_SIZE = 4096;
const PAYLOAD_OFFSET = 132;

function makeNdc11(fileType: number): Uint8Array {
  const bytes = new Uint8Array(BLOCK_SIZE * 2);
  bytes[0] = fileType;
  bytes[2] = 11;
  return bytes;
}

function makeDataNdc(): Uint8Array {
  const bytes = makeNdc11(1);
  const view = new DataView(bytes.buffer);
  for (const [record, voltage] of [30_000, 29_900, 29_800].entries()) {
    const offset = BLOCK_SIZE + PAYLOAD_OFFSET + record * 8;
    view.setFloat32(offset, voltage, true);
    view.setFloat32(offset + 4, -500, true);
  }
  return bytes;
}

function makeRunInfoNdc(): Uint8Array {
  const bytes = makeNdc11(18);
  const view = new DataView(bytes.buffer);
  for (const anchor of [
    { index: 1, seconds: 1_700_000_000, stepTimeMs: 0, capacityMas: 0 },
    { index: 3, seconds: 1_700_000_002, stepTimeMs: 2000, capacityMas: 1000 },
  ]) {
    const offset = BLOCK_SIZE + PAYLOAD_OFFSET + (anchor.index === 1 ? 0 : 47);
    view.setInt32(offset, anchor.stepTimeMs, true);
    view.setFloat32(offset + 5, 0, true);
    view.setFloat32(offset + 9, anchor.capacityMas, true);
    view.setInt32(offset + 33, anchor.seconds, true);
    view.setInt32(offset + 37, 8, true);
    view.setInt32(offset + 41, anchor.index, true);
  }
  return bytes;
}

function makeStepsNdc(): Uint8Array {
  const bytes = makeNdc11(7);
  const view = new DataView(bytes.buffer);
  const offset = BLOCK_SIZE + PAYLOAD_OFFSET;
  view.setInt32(offset, 0, true);
  view.setInt32(offset + 4, 4, true);
  view.setUint8(offset + 24, 2);
  return bytes;
}

async function makeNdax(): Promise<Uint8Array> {
  const output = new Uint8ArrayWriter();
  const zip = new ZipWriter(output);
  await zip.add('data.ndc', new Uint8ArrayReader(makeDataNdc()));
  await zip.add('data_runInfo.ndc', new Uint8ArrayReader(makeRunInfoNdc()));
  await zip.add('data_step.ndc', new Uint8ArrayReader(makeStepsNdc()));
  await zip.close();
  return output.getData();
}

describe('Neware NDC v11 NDAX profile', () => {
  it('imports scaled voltage, mA current, and expands sparse timing anchors', async () => {
    const archive = await makeNdax();
    const parsed = await parseNewareNdax(archive);

    expect(parsed.metadata).toMatchObject({
      ndcVersion: 11,
      parserProfileId: 'neware-ndax-ndc11-v1',
      parserProfileVersion: '0.1.4-provisional',
    });
    expect(parsed.records).toHaveLength(3);
    expect(parsed.records[0]).toMatchObject({
      index: 1,
      stepIndex: 4,
      status: 'CC_DChg',
      voltageV: 3,
      currentMa: -500,
      chargeCapacityAh: 0,
      dischargeCapacityAh: 0,
    });
    expect(parsed.records[1]).toMatchObject({
      index: 2,
      stepTimeMs: 1000,
      voltageV: expect.closeTo(2.99, 6),
      currentMa: -500,
      dischargeCapacityAh: expect.closeTo(500 / 3_600_000, 12),
    });
    expect(parsed.records[2]).toMatchObject({
      index: 3,
      stepTimeMs: 2000,
      timestampMs: 1_700_000_002_000n,
      voltageV: expect.closeTo(2.98, 6),
      dischargeCapacityAh: expect.closeTo(1000 / 3_600_000, 12),
    });
    expect(parsed.warnings).toEqual(['neware_runinfo_sparse_interpolated:anchors=2:data=3']);

    const normalized = await normalizeNewareNdax(archive, 'ndc11-fixture');
    expect(normalized.rows).toHaveLength(3);
    expect(normalized.rows[0].currentA).toBe(-0.5);
    expect(normalized.rows[1].voltageV).toBeCloseTo(2.99, 6);
  });
});
