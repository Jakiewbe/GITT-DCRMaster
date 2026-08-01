import { describe, expect, it } from 'vitest';
import { parseNdc17Data, parseNdc17RunInfo, parseNdc17Steps, readNdcHeader } from './ndc';

function makeNdc(version: number, fileType: number): Uint8Array {
  const bytes = new Uint8Array(8192);
  bytes[0] = fileType;
  bytes[2] = version;
  return bytes;
}

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

