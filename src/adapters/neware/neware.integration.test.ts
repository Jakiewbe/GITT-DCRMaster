import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { analyzeDcrEventV1 } from '../../science/dcr';
import { buildNewareDcrEvents, classifyNewareProfile } from './events';
import { normalizeNewareNdax } from './normalize';

const dataDirectory = resolve(process.cwd(), '..', '260429 DCR');
const dcrFixture = resolve(
  dataDirectory,
  'CFx-DCR-1.136mg-1_127.0.0.1-BTS85-23-1-6-879.ndax',
);

describe.skipIf(!existsSync(dcrFixture))('Neware canonical integration', () => {
  it('recognizes the two-current DCR sequence in the NDAX fixture', async () => {
    const bytes = readFileSync(dcrFixture);
    const first = await normalizeNewareNdax(bytes, 'fixture-dcr-879');
    const second = await normalizeNewareNdax(bytes, 'fixture-dcr-879');
    expect(first.sourceFileHash).toBe('898b61e30127de6a48f8ffbb3e7bfcbdaa69ad75454f32be7790c1dc37d056cc');
    expect(first.canonicalDatasetHash).toBe(second.canonicalDatasetHash);
    expect(first.rows.map((row) => row.rowId)).toEqual(second.rows.map((row) => row.rowId));
    expect(classifyNewareProfile(first).analysisKind).toBe('dcr');
    const events = buildNewareDcrEvents(first);
    expect(events).toHaveLength(4);
    expect(events[0].config.calculationMethod).toBe('two_current_terminal_v1');
    expect(events[0].smallDischargeRows?.[0].vendorStepId).toBe('2');
    expect(events[0].largeDischargeRows?.[0].vendorStepId).toBe('4');
    const [result] = analyzeDcrEventV1(events[0]);
    expect(result.smallTerminalVoltageV).toBeCloseTo(2.4197793006896973, 12);
    expect(result.largeTerminalVoltageV).toBeCloseTo(2.2710061073303223, 12);
    expect(result.resistanceOhm).toBeCloseTo(189.22764513175554, 10);
  }, 15_000);
});
