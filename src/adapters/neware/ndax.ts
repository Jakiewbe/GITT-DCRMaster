import { Uint8ArrayReader, Uint8ArrayWriter, ZipReader } from '@zip.js/zip.js';
import { parseNdc17Data, parseNdc17RunInfo, parseNdc17Steps, readNdcHeader } from './ndc';

export type NewareNdaxRecord = {
  index: number;
  cycle: number;
  stepOrdinal: number;
  stepIndex: number;
  status: string;
  stepTimeMs: number;
  timestampMs: bigint;
  voltageV: number;
  currentMa: number;
  chargeCapacityAh: number;
  dischargeCapacityAh: number;
};

export type NewareProgramStep = {
  stepId: number;
  stepTypeCode: number;
  recordIntervalMs: number | null;
  durationMs: number | null;
  currentMa: number | null;
  /**
   * Neware Step.xml stores Stop_Volt in 0.1 mV units.  Keep the raw field as
   * evidence, but expose the scientific value in V so downstream code never
   * has to infer the scale from a magic number such as 15000.
   */
  stopVoltageV?: number | null;
  stopVoltageRaw?: number | null;
  /** Conditions declared in the step's Limit/Other section, if present. */
  conditions?: NewareProgramCondition[];
  /** Loop evidence for Neware Cycle steps, if present. */
  loop?: NewareProgramLoop | null;
};

/**
 * Raw program-condition evidence.  Type code 1 is the voltage condition used
 * in the approved CFx/FGS GITT program; `voltageValueV` is intentionally
 * populated only for that code so an unknown condition is never relabelled as
 * a voltage stop.
 */
export type NewareProgramCondition = {
  conditionId: number;
  typeCode: number | null;
  functionCode: number | null;
  comparisonCode: number | null;
  jumpLine: number | null;
  rawValue: number | null;
  voltageValueV: number | null;
  timeGotoMs: number | null;
};

export type NewareProgramLoop = {
  startStepId: number | null;
  cycleCount: number | null;
};

export type NewareNdaxMetadata = {
  parserProfileId: 'neware-ndax-ndc17-v1';
  /**
   * v0.1.2 retains program-condition/loop evidence used by the CFx 1200 s
   * adapter.  v0.1.1 remains accepted for already-saved projects.
   */
  parserProfileVersion: '0.1.1-provisional' | '0.1.2-provisional';
  approvalState: 'provisional';
  instrumentId: string | null;
  channelId: string | null;
  testId: string | null;
  testGuid: string | null;
  clientVersion: string | null;
  serverVersion: string | null;
  firmwareVersion: string | null;
  activeMassMg: number | null;
  remark: string | null;
  currentRangeMa: number | null;
  voltageRangeV: number | null;
  sourceTimeResolutionNs: bigint;
  programSteps: NewareProgramStep[];
};

export type NewareNdaxParseResult = {
  records: NewareNdaxRecord[];
  metadata: NewareNdaxMetadata;
  warnings: string[];
};

function decodeXml(bytes: Uint8Array): string {
  for (const encoding of ['utf-8', 'gb18030']) {
    try {
      return new TextDecoder(encoding, { fatal: encoding === 'utf-8' }).decode(bytes);
    } catch {
      // Try the next declared Neware encoding.
    }
  }
  return new TextDecoder().decode(bytes);
}

function xmlAttributes(source: string): Record<string, string> {
  const attributes: Record<string, string> = {};
  const pattern = /([\w:-]+)="([^"]*)"/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(source)) !== null) attributes[match[1]] = match[2];
  return attributes;
}

function elementAttributes(xml: string, tag: string): Record<string, string> | null {
  const match = new RegExp(`<${tag}\\b([^>]*)>`, 'i').exec(xml);
  return match ? xmlAttributes(match[1]) : null;
}

function valueAttribute(xml: string, tag: string): string | null {
  return elementAttributes(xml, tag)?.Value ?? null;
}

function finiteNumber(value: string | null, scale = 1): number | null {
  if (value === null || value.trim() === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed * scale : null;
}

function finiteInteger(value: string | null): number | null {
  const parsed = finiteNumber(value);
  return parsed !== null && Number.isInteger(parsed) ? parsed : null;
}

/** Neware BTS Step.xml represents voltage limits in 0.1 mV units. */
function newareVoltageFromRaw(rawValue: string | null): number | null {
  return finiteNumber(rawValue, 1e-4);
}

function nestedElementBody(source: string, tag: string): string | null {
  const match = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i').exec(source);
  return match?.[1] ?? null;
}

function parseProgramConditions(stepBody: string): NewareProgramCondition[] {
  const conditions: NewareProgramCondition[] = [];
  const pattern = /<Cnd(\d+)\b([^>]*)\/?>(?:<\/Cnd\1>)?/gi;
  let match: RegExpExecArray | null = null;
  while ((match = pattern.exec(stepBody)) !== null) {
    const attributes = xmlAttributes(match[2]);
    const typeCode = finiteInteger(attributes.type ?? null);
    const rawValue = finiteNumber(attributes.Value ?? null);
    conditions.push({
      conditionId: Number(match[1]),
      typeCode,
      functionCode: finiteInteger(attributes.Function ?? null),
      comparisonCode: finiteInteger(attributes.CmpType ?? null),
      jumpLine: finiteInteger(attributes.Jump_Line ?? null),
      rawValue,
      voltageValueV: typeCode === 1 ? newareVoltageFromRaw(attributes.Value ?? null) : null,
      timeGotoMs: finiteNumber(attributes.TimeGoto ?? null),
    });
  }
  return conditions;
}

function parseProgramLoop(stepBody: string): NewareProgramLoop | null {
  const startStepId = finiteInteger(valueAttribute(stepBody, 'Start_Step'));
  const cycleCount = finiteInteger(valueAttribute(stepBody, 'Cycle_Count'));
  return startStepId === null && cycleCount === null ? null : { startStepId, cycleCount };
}

function parseProgramSteps(stepXml: string): NewareProgramStep[] {
  const steps: NewareProgramStep[] = [];
  const pattern = /<Step(\d+)\b([^>]*)>([\s\S]*?)<\/Step\1>/gi;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(stepXml)) !== null) {
    const attributes = xmlAttributes(match[2]);
    const body = match[3];
    const recordMain = nestedElementBody(nestedElementBody(body, 'Record') ?? '', 'Main') ?? '';
    const limitMain = nestedElementBody(nestedElementBody(body, 'Limit') ?? '', 'Main') ?? '';
    steps.push({
      stepId: Number(attributes.Step_ID ?? match[1]),
      stepTypeCode: Number(attributes.Step_Type ?? 0),
      recordIntervalMs: finiteNumber(valueAttribute(recordMain, 'Time')),
      durationMs: finiteNumber(valueAttribute(limitMain, 'Time')),
      currentMa: finiteNumber(valueAttribute(limitMain, 'Curr')),
      stopVoltageV: newareVoltageFromRaw(valueAttribute(limitMain, 'Stop_Volt')),
      stopVoltageRaw: finiteNumber(valueAttribute(limitMain, 'Stop_Volt')),
      conditions: parseProgramConditions(body),
      loop: parseProgramLoop(body),
    });
  }
  return steps;
}

function requiredEntry(entries: Record<string, Uint8Array>, name: string): Uint8Array {
  const direct = entries[name];
  if (direct) return direct;
  const nested = Object.entries(entries).find(([key]) => key.endsWith(`/${name}`));
  if (nested) return nested[1];
  throw new Error(`neware_ndax_entry_missing:${name}`);
}

function optionalXml(entries: Record<string, Uint8Array>, name: string): string {
  try {
    return decodeXml(requiredEntry(entries, name));
  } catch {
    return '';
  }
}

async function unzipEntries(input: Uint8Array): Promise<Record<string, Uint8Array>> {
  const reader = new ZipReader(new Uint8ArrayReader(input), { useWebWorkers: false });
  try {
    const entries = await reader.getEntries();
    const output: Record<string, Uint8Array> = {};
    for (const entry of entries) {
      if (entry.directory || !entry.getData) continue;
      output[entry.filename] = await entry.getData(new Uint8ArrayWriter());
    }
    return output;
  } finally {
    await reader.close();
  }
}

export async function parseNewareNdax(input: ArrayBuffer | Uint8Array): Promise<NewareNdaxParseResult> {
  const archiveBytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  const entries = await unzipEntries(archiveBytes);
  const dataBytes = requiredEntry(entries, 'data.ndc');
  const runInfoBytes = requiredEntry(entries, 'data_runInfo.ndc');
  const stepBytes = requiredEntry(entries, 'data_step.ndc');

  const headers = [readNdcHeader(dataBytes), readNdcHeader(runInfoBytes), readNdcHeader(stepBytes)];
  const expected = [
    { version: 17, fileType: 1 },
    { version: 17, fileType: 18 },
    { version: 17, fileType: 7 },
  ];
  headers.forEach((header, index) => {
    if (header.version !== expected[index].version || header.fileType !== expected[index].fileType) {
      throw new Error(
        `neware_ndax_unapproved_ndc_profile:v${header.version}_type${header.fileType}`,
      );
    }
  });

  const data = parseNdc17Data(dataBytes);
  const runInfo = parseNdc17RunInfo(runInfoBytes);
  const steps = parseNdc17Steps(stepBytes);
  const runByIndex = new Map(runInfo.map((record) => [record.index, record]));
  const stepByOrdinal = new Map(steps.map((record) => [record.stepOrdinal, record]));
  const warnings: string[] = [];

  if (data.length !== runInfo.length) {
    warnings.push(`neware_record_count_mismatch:data=${data.length}:runInfo=${runInfo.length}`);
  }

  const records: NewareNdaxRecord[] = [];
  for (const point of data) {
    const timing = runByIndex.get(point.index);
    if (!timing) {
      warnings.push(`neware_runinfo_missing:index=${point.index}`);
      continue;
    }
    const step = stepByOrdinal.get(timing.stepOrdinal);
    if (!step) {
      warnings.push(`neware_step_metadata_missing:step=${timing.stepOrdinal}`);
      continue;
    }
    records.push({
      index: point.index,
      cycle: step.cycle,
      stepOrdinal: timing.stepOrdinal,
      stepIndex: step.stepIndex,
      status: step.status,
      stepTimeMs: timing.stepTimeMs,
      timestampMs: timing.timestampMs,
      voltageV: point.voltageV,
      currentMa: point.currentMa,
      chargeCapacityAh: timing.chargeCapacityAh,
      dischargeCapacityAh: timing.dischargeCapacityAh,
    });
  }

  if (records.length !== data.length) {
    throw new Error(`neware_ndax_incomplete_merge:merged=${records.length}:data=${data.length}`);
  }

  const testInfoXml = optionalXml(entries, 'TestInfo.xml');
  const stepXml = optionalXml(entries, 'Step.xml');
  const versionXml = optionalXml(entries, 'VersionInfo.xml');
  const testInfo = elementAttributes(testInfoXml, 'TestInfo') ?? {};
  const versionInfo = elementAttributes(versionXml, 'ZwjVersion') ?? {};

  const metadata: NewareNdaxMetadata = {
    parserProfileId: 'neware-ndax-ndc17-v1',
    parserProfileVersion: '0.1.2-provisional',
    approvalState: 'provisional',
    instrumentId:
      testInfo.DevID && testInfo.UnitID ? `${testInfo.DevID}:${testInfo.UnitID}` : testInfo.DevID ?? null,
    channelId: testInfo.ChlID ?? null,
    testId: testInfo.TestID ?? null,
    testGuid: testInfo.TestGuid ?? null,
    clientVersion: versionInfo.CurrClientVer ?? null,
    serverVersion: versionInfo.CurrSvrVer ?? versionInfo.SvrVer ?? null,
    firmwareVersion: versionInfo.MainXwjVer ?? null,
    activeMassMg: finiteNumber(valueAttribute(stepXml, 'SCQ'), 0.001),
    remark: valueAttribute(stepXml, 'Remark'),
    currentRangeMa: finiteNumber(testInfo.CurrRange ?? null),
    voltageRangeV: finiteNumber(testInfo.VoltRange ?? null),
    sourceTimeResolutionNs: 1_000_000n,
    programSteps: parseProgramSteps(stepXml),
  };

  return { records, metadata, warnings };
}
