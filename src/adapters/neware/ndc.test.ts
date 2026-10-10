import { describe, expect, it } from 'vitest';
import {
  parseNdc11Data,
  parseNdc11RunInfo,
  parseNdc11Steps,
  parseNdc14Data,
  parseNdc14RunInfo,
  parseNdc14Steps,
  parseNdc17Data,
  parseNdc17RunInfo,
  parseNdc17Steps,
  readNdcHeader,
} from './ndc';

function makeNdc(version: number, fileType: number): Uint8Array {
  const bytes = new Uint8Array(8192);
  bytes[0] = fileType;
  bytes[2] = version;
  return bytes;
}

describe('Neware NDC v11 primitives', () => {
  it('decodes scaled voltage and milliamp current records', () => {
    const bytes = makeNdc(11, 1);
    const view = new DataView(bytes.buffer);
    view.setFloat32(4096 + 132, 30_000, true);
    view.setFloat32(4096 + 136, -500, true);
    expect(parseNdc11Data(bytes)).toEqual([
      { index: 1, voltageV: 3, currentMa: -500 },
    ]);
  });

  it('decodes sparse run-info records and converts capacity to Ah', () => {
    const bytes = makeNdc(11, 18);
    const offset = 4096 + 132;
    const view = new DataView(bytes.buffer);
    view.setInt32(offset, 5000, true);
    view.setFloat32(offset + 5, 360_000, true);
    view.setFloat32(offset + 9, 720_000, true);
    view.setInt32(offset + 33, 1_700_000_000, true);
    view.setInt32(offset + 37, 8, true);
    view.setInt32(offset + 41, 1, true);
    view.setInt16(offset + 45, 123, true);
    expect(parseNdc11RunInfo(bytes)).toEqual([
      {
        index: 1,
        rawStep: 8,
        stepOrdinal: 1,
        stepTimeMs: 5000,
        dtMs: expect.any(Number),
        timestampMs: 1_700_000_000_123n,
        chargeCapacityAh: expect.closeTo(0.1, 8),
        dischargeCapacityAh: expect.closeTo(0.2, 8),
      },
    ]);
  });

  it('decodes old-layout step status records', () => {
    const bytes = makeNdc(11, 7);
    const offset = 4096 + 132;
    const view = new DataView(bytes.buffer);
    view.setInt32(offset, 0, true);
    view.setInt32(offset + 4, 4, true);
    view.setUint8(offset + 24, 2);
    expect(parseNdc11Steps(bytes)).toEqual([
      { stepOrdinal: 1, cycle: 1, stepIndex: 4, statusCode: 2, status: 'CC_DChg' },
    ]);
  });
});

describe('Neware NDC v17 primitives', () => {
  it('reads the version and file type without guessing', () => {
    expect(readNdcHeader(Uint8Array.from([1, 0, 17]))).toEqual({ fileType: 1, version: 17 });
  });

  it('decodes voltage/current records from data.ndc', () => {
    const bytes = makeNdc(17, 1);
    const view = new DataView(bytes.buffer);
    view.setFloat32(4096 + 132, 2.5, true);
    view.setFloat32(4096 + 136, -0.001, true);
    expect(parseNdc17Data(bytes)).toEqual([{ index: 1, voltageV: 2.5, currentMa: expect.closeTo(-1, 6) }]);
  });

  it('preserves integer step time and timestamp milliseconds', () => {
    const bytes = makeNdc(17, 18);
    const offset = 4096 + 132;
    const view = new DataView(bytes.buffer);
    view.setInt32(offset, 5000, true);
    view.setFloat32(offset + 5, 0.001, true);
    view.setFloat32(offset + 9, 0.002, true);
    view.setInt32(offset + 29, 5000, true);
    view.setInt32(offset + 33, 1_700_000_000, true);
    view.setInt32(offset + 37, 8, true);
    view.setInt32(offset + 41, 1, true);
    view.setInt16(offset + 45, 123, true);
    expect(parseNdc17RunInfo(bytes)).toEqual([
      {
        index: 1,
        rawStep: 8,
        stepOrdinal: 1,
        stepTimeMs: 5000,
        dtMs: 5000,
        timestampMs: 1_700_000_000_123n,
        chargeCapacityAh: expect.closeTo(0.001, 8),
        dischargeCapacityAh: expect.closeTo(0.002, 8),
      },
    ]);
  });

  it('decodes step status without merging equal timestamps', () => {
    const bytes = makeNdc(17, 7);
    const offset = 4096 + 132;
    const view = new DataView(bytes.buffer);
    view.setInt32(offset, 0, true);
    view.setInt32(offset + 4, 4, true);
    view.setUint8(offset + 24, 2);
    view.setInt32(offset + 33, 1, true);
    expect(parseNdc17Steps(bytes)).toEqual([
      { stepOrdinal: 1, cycle: 1, stepIndex: 4, statusCode: 2, status: 'CC_DChg' },
    ]);
  });
});

describe('Neware NDC v14 primitives', () => {
  it('decodes voltage/current records with the v14 scales', () => {
    const bytes = makeNdc(14, 1);
    const view = new DataView(bytes.buffer);
    view.setFloat32(4096 + 132, 2.5, true);
    view.setFloat32(4096 + 136, -0.001, true);
    expect(parseNdc14Data(bytes)).toEqual([{ index: 1, voltageV: 2.5, currentMa: expect.closeTo(-1, 6) }]);
  });

  it('decodes v14 run-info records with the shorter record layout', () => {
    const bytes = makeNdc(14, 18);
    const offset = 4096 + 132;
    const view = new DataView(bytes.buffer);
    view.setInt32(offset, 5000, true);
    view.setFloat32(offset + 5, 0.001, true);
    view.setFloat32(offset + 9, 0.002, true);
    view.setInt32(offset + 29, 5000, true);
    view.setInt32(offset + 33, 1_700_000_000, true);
    view.setInt32(offset + 37, 8, true);
    view.setInt32(offset + 41, 1, true);
    view.setInt16(offset + 45, 123, true);
    expect(parseNdc14RunInfo(bytes)).toEqual([
      {
        index: 1,
        rawStep: 8,
        stepOrdinal: 1,
        stepTimeMs: 5000,
        dtMs: 5000,
        timestampMs: 1_700_000_000_123n,
        chargeCapacityAh: expect.closeTo(0.001, 8),
        dischargeCapacityAh: expect.closeTo(0.002, 8),
      },
    ]);
  });

  it('decodes v14 step records using the compact step layout', () => {
    const bytes = makeNdc(14, 7);
    const offset = 4096 + 132;
    const view = new DataView(bytes.buffer);
    view.setInt32(offset, 0, true);
    view.setInt32(offset + 4, 4, true);
    view.setUint8(offset + 24, 2);
    expect(parseNdc14Steps(bytes)).toEqual([
      { stepOrdinal: 1, cycle: 1, stepIndex: 4, statusCode: 2, status: 'CC_DChg' },
    ]);
  });
});

