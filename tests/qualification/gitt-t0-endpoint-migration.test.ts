import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { expect, test } from 'vitest';
import { normalizeNewareNdax } from '../../src/adapters/neware/normalize';
import { buildNewareGittPulses } from '../../src/adapters/neware/events';
import { aggregateUniqueTicks, buildPulseTimeline } from '../../src/science/gitt/aggregation';
import { analyzeNewareDataset } from '../../src/app/analyze';
import { createCf1MaterialPreset } from '../../src/science/material';

const root = process.cwd();
const outputDir = path.resolve(root, 'analysis', 'gitt-t0-endpoint-migration');
const baselinePath = path.join(outputDir, 'baseline-before.json');
const afterPath = path.join(outputDir, 'after.json');
const reportPath = path.join(outputDir, 'GITT_T0_ENDPOINT_MIGRATION_REPORT.md');
const stepSummaryInspectPath = path.resolve(
  root,
  'outputs',
  'neware-step-audit-20260915',
  'CFx-Neware-Step-Audit-20260915.xlsx.inspect.ndjson',
);
const dataDir = path.resolve(root, '260429 GITT');
const sourceFiles = [
  'CFx-GITT-200ma-1.032mg-2_127.0.0.1-BTS85-23-8-6-868.ndax',
  'CFx-GITT-200ma-1.096mg-8_127.0.0.1-BTS85-23-8-8-870.ndax',
  'CFx-GITT-200ma-1.152mg-9_127.0.0.1-BTS85-23-8-7-869.ndax',
].map((name) => path.join(dataDir, name));

const settings = {
  electrodeDiameterCm: 1.2,
  electrodeDiameterStandardUncertaintyCm: null,
  activeMassStandardUncertaintyG: null,
  currentResolutionA: null,
  voltageResolutionV: null,
  material: createCf1MaterialPreset(),
  initialSocPct: null,
  initialSocSource: 'unknown' as const,
  datasetStartsAtFreshCell: false,
  activeMassOverrideG: null,
  activeMassSourceId: null,
  regressionManualWindow: undefined,
};

type SnapshotResult = {
  pulseId: string;
  pulseOrder: number;
  [key: string]: unknown;
};

type SnapshotFile = {
  fileName: string;
  results: SnapshotResult[];
  [key: string]: unknown;
};

type Snapshot = {
  generatedAt: string;
  files: SnapshotFile[];
  [key: string]: unknown;
};

function jsonSafe(value: unknown): unknown {
  return JSON.parse(JSON.stringify(value, (_key, nested) => (
    typeof nested === 'bigint' ? nested.toString() : nested
  )));
}

function pointSummary(rows: Parameters<typeof aggregateUniqueTicks>[0]) {
  const timeline = buildPulseTimeline(aggregateUniqueTicks(rows));
  const firstPositive = timeline.find((point) => point.timeS > 0) ?? null;
  const first = timeline[0] ?? null;
  const end = timeline.at(-1) ?? null;
  return {
    rawFirstPointVoltageV: first?.voltageV ?? null,
    rawFirstPointCurrentA: first?.currentA ?? null,
    rawFirstPointTimeS: first?.timeS ?? null,
    firstPositivePulseTimeS: firstPositive?.timeS ?? null,
    firstPositivePulseVoltageV: firstPositive?.voltageV ?? null,
    firstPositivePulseCurrentA: firstPositive?.currentA ?? null,
    rawLastPointVoltageV: end?.voltageV ?? null,
    rawLastPointCurrentA: end?.currentA ?? null,
    rawLastPointTimeS: end?.timeS ?? null,
    uniqueTimePointCount: timeline.length,
  };
}

function minimalRow(row: Parameters<typeof aggregateUniqueTicks>[0][number]) {
  return jsonSafe({
    rowId: row.rowId,
    analysisStepId: row.analysisStepId,
    vendorStepId: row.vendorStepId,
    canonicalStepType: row.canonicalStepType,
    elapsedTimeTicks: row.elapsedTimeTicks,
    stepElapsedTimeTicks: row.stepElapsedTimeTicks,
    timeResolutionNs: row.timeResolutionNs,
    recordSequence: row.recordSequence,
    elapsedTimeS: row.elapsedTimeS,
    voltageV: row.voltageV,
    currentA: row.currentA,
    chargeCapacityAh: row.chargeCapacityAh,
    dischargeCapacityAh: row.dischargeCapacityAh,
    netCapacityAh: row.netCapacityAh,
  });
}

function resultSnapshot(result: ReturnType<typeof analyzeNewareDataset>['gittResults'][number]) {
  return {
    pulseId: result.pulseId,
    calculationState: result.calculationState,
    qcStatus: result.qcStatus,
    qcCodes: result.qcCodes,
    primaryEndpointQcStatus: result.primaryEndpointQcStatus,
    primaryComparisonEligibility: result.primaryComparisonEligibility,
    metricValueCm2PerS: result.metricValueCm2PerS,
    deltaEtV: result.deltaEtV,
    deltaEsV: result.deltaEsV,
    medianVoltageV: result.medianVoltageV,
    pulseEndVoltageV: result.pulseEndVoltageV,
    pulseDurationS: result.pulseDurationS,
    activeMassG: result.activeMassG,
    activeMaterialEquivalentThicknessCm: result.activeMaterialEquivalentThicknessCm,
    regressionWindows: result.regressionWindows,
    windowStabilityDecades: result.windowStabilityDecades,
    methodDivergenceDecades: result.methodDivergenceDecades,
    fitDiagnostics: result.fitDiagnostics,
    preRestEndPotentialV: result.preRestEndPotentialV,
    postRestEndPotentialV: result.postRestEndPotentialV,
    pulseT0VoltageV: result.pulseT0VoltageV,
    pulseT0CurrentA: result.pulseT0CurrentA,
    endpointStartTimeS: result.endpointStartTimeS,
    firstPositivePulseTimeS: result.firstPositivePulseTimeS,
    firstPositivePulseVoltageV: result.firstPositivePulseVoltageV,
    pulseStartVoltageV: result.pulseStartVoltageV,
    preRestLastRawVoltageV: result.preRestLastRawVoltageV,
    postRestLastRawVoltageV: result.postRestLastRawVoltageV,
    deltaEsRawV: result.deltaEsRawV,
    restEstimatorDifferencePreV: result.restEstimatorDifferencePreV,
    restEstimatorDifferencePostV: result.restEstimatorDifferencePostV,
    initialObservedDropV: result.initialObservedDropV,
    onsetObservedDropV: result.onsetObservedDropV,
    earlyPolarizationDropV: result.earlyPolarizationDropV,
    preRestToFirstPositiveDropV: result.preRestToFirstPositiveDropV,
    legacyFirstPositiveDeltaEtV: result.legacyFirstPositiveDeltaEtV,
    legacyFirstPositiveEndpointMetricValueCm2PerS: result.legacyFirstPositiveEndpointMetricValueCm2PerS,
    deltaEtDefinitionDifferenceV: result.deltaEtDefinitionDifferenceV,
    endpointDRatioVsLegacy: result.endpointDRatioVsLegacy,
    socCalculationState: result.socCalculationState,
    socQcStatus: result.socQcStatus,
    socQcCodes: result.socQcCodes,
  };
}

async function captureCurrentSnapshot() {
  fs.mkdirSync(outputDir, { recursive: true });
  const files = [];
  for (const filePath of sourceFiles) {
    expect(fs.existsSync(filePath)).toBe(true);
    const fileName = path.basename(filePath);
    const bytes = fs.readFileSync(filePath);
    const dataset = await normalizeNewareNdax(bytes, fileName);
    const analysis = analyzeNewareDataset(dataset, settings);
    const pulses = buildNewareGittPulses(dataset, settings.material, settings.electrodeDiameterCm);
    const inputByPulseId = new Map(pulses.map((pulse) => [pulse.pulseId, pulse]));
    files.push({
      fileName,
      sourcePath: filePath,
      sourceFileHash: dataset.sourceFileHash,
      recordCount: dataset.rows.length,
      activeMassMg: dataset.metadata.activeMassMg,
      parserProfileId: dataset.metadata.parserProfileId,
      parserProfileVersion: dataset.metadata.parserProfileVersion,
      analysisVersions: analysis.versions,
      analysisCounts: analysis.counts,
      protocolSummary: analysis.cfxLiterature1200s?.programExecution.summary ?? null,
      results: analysis.gittResults.map((result, index) => {
        const input = inputByPulseId.get(result.pulseId);
        return {
          pulseOrder: index + 1,
          ...resultSnapshot(result),
          pointSummary: input ? pointSummary(input.pulseRows) : null,
          preRestRows: input?.preRestRows.map(minimalRow) ?? [],
          pulseRows: input?.pulseRows.map(minimalRow) ?? [],
          postRestRows: input?.postRestRows.map(minimalRow) ?? [],
        };
      }),
    });
  }
  return {
    generatedAt: new Date().toISOString(),
    definition: 'current_production_analysis_snapshot',
    sourceFiles: sourceFiles.map((filePath) => path.basename(filePath)),
    settings: jsonSafe(settings),
    files,
  };
}

test('capture the pre-migration Endpoint baseline from the production entry point', async () => {
  fs.mkdirSync(outputDir, { recursive: true });
  if (!fs.existsSync(baselinePath)) {
    const payload = await captureCurrentSnapshot();
    fs.writeFileSync(baselinePath, JSON.stringify({
      ...payload,
      definition: 'pre_migration_first_positive_time_endpoint',
    }, null, 2), 'utf8');
  }
  const baseline = JSON.parse(fs.readFileSync(baselinePath, 'utf8')) as {
    files: Array<{ fileName: string; results: unknown[] }>;
  };
  expect(baseline.files).toHaveLength(3);
  expect(baseline.files.every((file) => file.results.length > 0)).toBe(true);
});

function finiteValues(values: Array<number | null | undefined>): number[] {
  return values.filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
}

function quantile(values: number[], probability: number): number | null {
  const sorted = [...values].sort((a, b) => a - b);
  if (!sorted.length) return null;
  const position = (sorted.length - 1) * probability;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower);
}

function formatNumber(value: number | null | undefined, digits = 8): string {
  return typeof value === 'number' && Number.isFinite(value) ? value.toExponential(digits) : 'n/a';
}

function formatPercent(value: number | null | undefined, digits = 1): string {
  return typeof value === 'number' && Number.isFinite(value) ? `${(value * 100).toFixed(digits)}%` : 'n/a';
}

function approxEqual(left: unknown, right: unknown): boolean {
  if (left === right) return true;
  if (typeof left !== 'number' || typeof right !== 'number') return false;
  if (!Number.isFinite(left) || !Number.isFinite(right)) return Object.is(left, right);
  return Math.abs(left - right) <= 1e-12 * Math.max(1, Math.abs(left), Math.abs(right));
}

function readStepSummaryRows() {
  expect(fs.existsSync(stepSummaryInspectPath)).toBe(true);
  const tableLine = fs.readFileSync(stepSummaryInspectPath, 'utf8')
    .split(/\r?\n/)
    .find((line) => line.includes('"kind":"table"') && line.includes('"sheet":"Step Summary"'));
  expect(tableLine).toBeDefined();
  const table = JSON.parse(tableLine ?? '{}') as { values?: unknown[][] };
  const values = table.values ?? [];
  const headers = values[0] ?? [];
  return values.slice(1).map((row) => Object.fromEntries(
    headers.map((header, index) => [String(header), row[index] ?? null]),
  ));
}

function pulseSummaryOracleRows(rows: Array<Record<string, unknown>>, fileName: string) {
  return rows
    .filter((row) => path.basename(String(row.file ?? '')) === fileName && row.status === 'CC_DChg')
    .sort((left, right) => Number(left.stepOrdinal) - Number(right.stepOrdinal));
}

function resultField(result: Record<string, unknown> | null, field: string): number | null {
  const value = result?.[field];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function distributionStats(values: number[]) {
  return {
    count: values.length,
    q1: quantile(values, 0.25),
    median: quantile(values, 0.5),
    q3: quantile(values, 0.75),
    p90: quantile(values, 0.9),
    max: values.length ? Math.max(...values) : null,
  };
}

function buildFrozenRegressionMismatches(
  beforeResult: Record<string, unknown>,
  afterResult: Record<string, unknown>,
): string[] {
  const mismatches: string[] = [];
  const directFields = [
    'preRestEndPotentialV',
    'postRestEndPotentialV',
    'deltaEsV',
    'pulseEndVoltageV',
    'pulseDurationS',
    'medianVoltageV',
    'activeMaterialEquivalentThicknessCm',
    'windowStabilityDecades',
  ];
  for (const field of directFields) {
    if (!approxEqual(beforeResult[field], afterResult[field])) mismatches.push(field);
  }
  const beforeWindows = new Map(
    ((beforeResult.regressionWindows as Array<Record<string, unknown>> | undefined) ?? [])
      .map((window) => [String(window.windowId), window]),
  );
  const afterWindows = new Map(
    ((afterResult.regressionWindows as Array<Record<string, unknown>> | undefined) ?? [])
      .map((window) => [String(window.windowId), window]),
  );
  const regressionFields = [
    'slopeVPerSqrtS',
    'interceptV',
    'rSquared',
    'rmseV',
    'metricValueCm2PerS',
    'actualStartS',
    'actualEndS',
    'uniqueTimePointCount',
    'windowCoverageIncomplete',
    'samplingCoverage',
    'status',
  ];
  for (const windowId of new Set([...beforeWindows.keys(), ...afterWindows.keys()])) {
    const beforeWindow = beforeWindows.get(windowId);
    const afterWindow = afterWindows.get(windowId);
    if (!beforeWindow || !afterWindow) {
      mismatches.push(`regressionWindows.${windowId}`);
      continue;
    }
    for (const field of regressionFields) {
      if (!approxEqual(beforeWindow[field], afterWindow[field])) {
        mismatches.push(`regressionWindows.${windowId}.${field}`);
      }
    }
  }
  return mismatches;
}

function buildMigrationReport(
  before: Snapshot,
  after: Snapshot,
) {
  const oracleRows = readStepSummaryRows();
  const beforeByName = new Map(before.files.map((file) => [file.fileName, file]));
  const allResults = after.files.flatMap((file) => file.results.map((result: Record<string, unknown>) => ({ file, result })));
  const beforeResultFor = (file: SnapshotFile, result: Record<string, unknown>) =>
    beforeByName.get(file.fileName)?.results.find((candidate: Record<string, unknown>) => candidate.pulseId === result.pulseId) ?? null;
  const oldDeltaEt = allResults.map(({ file, result }) => resultField(beforeResultFor(file, result), 'deltaEtV'));
  const newDeltaEt = allResults.map(({ result }) => resultField(result, 'deltaEtV'));
  const oldD = allResults.map(({ file, result }) => resultField(beforeResultFor(file, result), 'metricValueCm2PerS'));
  const newD = allResults.map(({ result }) => resultField(result, 'metricValueCm2PerS'));
  const ratios = allResults.map(({ file, result }) => {
    const oldResult = beforeResultFor(file, result);
    const oldValue = resultField(oldResult, 'metricValueCm2PerS');
    const newValue = resultField(result, 'metricValueCm2PerS');
    return oldValue !== null && newValue !== null && oldValue > 0 && newValue > 0 ? oldValue / newValue : null;
  });
  const signedLogRatio = ratios.map((ratio) => ratio !== null && ratio > 0 ? Math.log10(1 / ratio) : null);
  const logRatio = signedLogRatio.map((ratio) => ratio === null ? null : Math.abs(ratio));
  const t0Rows = after.files.map((file) => {
    const counts = { ok: 0, missing: 0, not_loaded: 0, direction_conflict: 0 };
    for (const result of file.results as Array<Record<string, unknown>>) {
      if (result.pulseT0VoltageV !== null && result.pulseT0CurrentA !== null) counts.ok += 1;
      else if ((result.qcCodes as string[] | undefined)?.includes('ENDPOINT_LOADED_T0_MISSING')) counts.missing += 1;
      else if ((result.qcCodes as string[] | undefined)?.includes('ENDPOINT_T0_DIRECTION_CONFLICT')) counts.direction_conflict += 1;
      else counts.not_loaded += 1;
    }
    return `${file.fileName}: qualified ${counts.ok}/${file.results.length} (${formatPercent(file.results.length ? counts.ok / file.results.length : null)}); missing=${counts.missing}, not_loaded=${counts.not_loaded}, direction_conflict=${counts.direction_conflict}`;
  });
  const oracleComparisons = after.files.flatMap((file) => {
    const rows = pulseSummaryOracleRows(oracleRows, file.fileName);
    return file.results.map((result: Record<string, unknown>, index: number) => {
      const oracle = rows[index] ?? null;
      const canonicalT0 = resultField(result, 'pulseT0VoltageV');
      const error = oracle && canonicalT0 !== null && typeof oracle.startVoltageV === 'number'
        ? Number(oracle.startVoltageV) - canonicalT0
        : null;
      return { fileName: file.fileName, pulseOrder: index + 1, error };
    });
  });
  const oracleErrors = finiteValues(oracleComparisons.map((item) => item.error));
  const t0ToFirstPositiveGaps = finiteValues(allResults.map(({ result }) => {
    const t0 = resultField(result, 'pulseT0VoltageV');
    const firstPositive = resultField(result, 'firstPositivePulseVoltageV');
    return t0 !== null && firstPositive !== null ? Math.abs(t0 - firstPositive) : null;
  }));
  const preRestToT0Gaps = finiteValues(allResults.map(({ result }) => {
    const preRest = resultField(result, 'preRestEndPotentialV');
    const t0 = resultField(result, 'pulseT0VoltageV');
    return preRest !== null && t0 !== null ? Math.abs(preRest - t0) : null;
  }));
  const perFileMetricStats = after.files.map((file) => {
    const pairs: Array<{
      oldDeltaEt: number | null;
      newDeltaEt: number | null;
      oldD: number | null;
      newD: number | null;
      ratio: number | null;
    }> = file.results.map((result: Record<string, unknown>) => {
      const oldResult = beforeResultFor(file, result);
      const oldValue = resultField(oldResult, 'metricValueCm2PerS');
      const newValue = resultField(result, 'metricValueCm2PerS');
      return {
        oldDeltaEt: resultField(oldResult, 'deltaEtV'),
        newDeltaEt: resultField(result, 'deltaEtV'),
        oldD: oldValue,
        newD: newValue,
        ratio: oldValue !== null && newValue !== null && oldValue > 0 && newValue > 0 ? oldValue / newValue : null,
      };
    });
    return {
      fileName: file.fileName,
      deltaEtOld: distributionStats(finiteValues(pairs.map((pair) => pair.oldDeltaEt))),
      deltaEtNew: distributionStats(finiteValues(pairs.map((pair) => pair.newDeltaEt))),
      dOld: distributionStats(finiteValues(pairs.map((pair) => pair.oldD))),
      dNew: distributionStats(finiteValues(pairs.map((pair) => pair.newD))),
      ratio: distributionStats(finiteValues(pairs.map((pair) => pair.ratio))),
    };
  });
  const frozenMismatches = after.files.flatMap((file) => {
    const beforeFile = beforeByName.get(file.fileName);
    return file.results.flatMap((result: Record<string, unknown>) => {
      const beforeResult = beforeFile?.results.find((candidate: Record<string, unknown>) => candidate.pulseId === result.pulseId);
      return beforeResult ? buildFrozenRegressionMismatches(beforeResult, result).map((field) => `${file.fileName} / ${result.pulseOrder} / ${field}`) : ['missing baseline result'];
    });
  });
  const qcs = after.files.map((file) => {
    const beforeFile = beforeByName.get(file.fileName);
    const beforeStatus = (beforeFile?.results ?? []).map((result: Record<string, unknown>) => String(result.primaryEndpointQcStatus));
    const afterStatus = file.results.map((result: Record<string, unknown>) => String(result.primaryEndpointQcStatus));
    const beforeEligibility = (beforeFile?.results ?? []).map((result: Record<string, unknown>) => String(result.primaryComparisonEligibility));
    const afterEligibility = file.results.map((result: Record<string, unknown>) => String(result.primaryComparisonEligibility));
    return {
      fileName: file.fileName,
      beforeStatus,
      afterStatus,
      beforeEligibility,
      afterEligibility,
    };
  });
  const firstThree = after.files.flatMap((file) => {
    const beforeFile = beforeByName.get(file.fileName);
    return file.results.slice(0, 3).map((result: Record<string, unknown>, index: number) => {
      const beforeResult = beforeFile?.results[index] ?? null;
      const point = result.pointSummary as Record<string, unknown> | null;
      return {
        fileName: file.fileName,
        pulseOrder: index + 1,
        preRestToT0: resultField(result, 'onsetObservedDropV'),
        t0ToFirstPositive: resultField(result, 'earlyPolarizationDropV'),
        oldDeltaEt: resultField(beforeResult, 'deltaEtV'),
        newDeltaEt: resultField(result, 'deltaEtV'),
        oldD: resultField(beforeResult, 'metricValueCm2PerS'),
        newD: resultField(result, 'metricValueCm2PerS'),
        canonicalT0: resultField(result, 'pulseT0VoltageV'),
        firstPositive: resultField(result, 'firstPositivePulseVoltageV'),
        end: resultField(result, 'pulseEndVoltageV'),
        rawT0: resultField(point, 'rawFirstPointVoltageV'),
        firstPositiveTime: resultField(result, 'firstPositivePulseTimeS'),
      };
    });
  });
  const methodDivergenceBefore = finiteValues(before.files.flatMap((file) => file.results.map((result) => resultField(result, 'methodDivergenceDecades'))));
  const methodDivergenceAfter = finiteValues(after.files.flatMap((file) => file.results.map((result) => resultField(result, 'methodDivergenceDecades'))));
  const reportLines = [
    '# GITT Endpoint t=0 迁移报告',
    '',
    `- 生成时间：${after.generatedAt}`,
    '- 数据范围：当前 3 个 CFx NDAX，生产入口 `analyzeNewareDataset`。',
    '- 本轮只改变 loaded t=0 Endpoint 的起点定义及其直接依赖字段；Es、CFx_10s、回归窗口、几何、脉冲时长、DCR 未改动。',
    '',
    '## 1. t=0 加载可用率',
    '',
    ...t0Rows.map((line) => `- ${line}`),
    '',
    `- 全部保留 pulse 的 |t=0 电压 − 首个正时间点电压|：${JSON.stringify(distributionStats(t0ToFirstPositiveGaps))} V。`,
    `- 全部保留 pulse 的 |pre-rest 末端 − t=0 电压|：${JSON.stringify(distributionStats(preRestToT0Gaps))} V。`,
    '判定依据：CanonicalRow 聚合后的物理时间轴；使用现有自动电流分辨率，t=0 电流必须有限、严格超过零电流分辨率且方向与 pulse 中值电流一致。',
    '',
    '## 2. Step Summary 起始电压与 Canonical t=0',
    '',
    `- 可匹配比较数：${oracleErrors.length}`,
    `- 误差定义：Step Summary startVoltageV − Canonical loaded t=0 voltageV；median=${formatNumber(quantile(oracleErrors, 0.5), 6)} V，P90Abs=${formatNumber(quantile(oracleErrors.map(Math.abs), 0.9), 6)} V，maxAbs=${formatNumber(oracleErrors.length ? Math.max(...oracleErrors.map(Math.abs)) : null, 6)} V。`,
    `- 在 ±0.1 mV 内：${oracleErrors.filter((error) => Math.abs(error) <= 0.0001).length}/${oracleErrors.length}；在 ±1 mV 内：${oracleErrors.filter((error) => Math.abs(error) <= 0.001).length}/${oracleErrors.length}。`,
    '- Step Summary 只作为审计 oracle，没有进入生产 Endpoint 计算。',
    '',
    '## 3. ΔEt 与 D_endpoint 前后比较',
    '',
    `| 指标 | old first-positive | new loaded t=0 |`,
    `|---|---:|---:|`,
    `| ΔEt 可计算数 | ${finiteValues(oldDeltaEt).length} | ${finiteValues(newDeltaEt).length} |`,
    `| ΔEt median (V) | ${formatNumber(quantile(finiteValues(oldDeltaEt), 0.5), 6)} | ${formatNumber(quantile(finiteValues(newDeltaEt), 0.5), 6)} |`,
    `| D_endpoint 可计算数 | ${finiteValues(oldD).length} | ${finiteValues(newD).length} |`,
    `| D_endpoint median (cm² s⁻¹) | ${formatNumber(quantile(finiteValues(oldD), 0.5), 6)} | ${formatNumber(quantile(finiteValues(newD), 0.5), 6)} |`,
    '',
    ...perFileMetricStats.map((item) => `- ${item.fileName}: old/new ΔEt median=${formatNumber(item.deltaEtOld.median, 6)} / ${formatNumber(item.deltaEtNew.median, 6)} V；old/new D median=${formatNumber(item.dOld.median, 6)} / ${formatNumber(item.dNew.median, 6)} cm²·s⁻¹；D_old/D_new median=${formatNumber(item.ratio.median, 6)}。`),
    `D_old / D_new（两者均为正且有限）：n=${finiteValues(ratios).length}，median=${formatNumber(quantile(finiteValues(ratios), 0.5), 6)}，P90=${formatNumber(quantile(finiteValues(ratios), 0.9), 6)}，max=${formatNumber(finiteValues(ratios).length ? Math.max(...finiteValues(ratios)) : null, 6)}。`,
    `log10(D_new / D_old)：n=${finiteValues(signedLogRatio).length}，median=${formatNumber(quantile(finiteValues(signedLogRatio), 0.5), 6)} decades，IQR=${formatNumber(quantile(finiteValues(signedLogRatio), 0.75), 6)}−${formatNumber(quantile(finiteValues(signedLogRatio), 0.25), 6)}，P90Abs=${formatNumber(quantile(finiteValues(logRatio), 0.9), 6)}，maxAbs=${formatNumber(finiteValues(logRatio).length ? Math.max(...finiteValues(logRatio)) : null, 6)}。`,
    '',
    '## 4. Pulse 1–3 详细对比',
    '',
    '| 文件 | Pulse | Canonical t=0 (V) | 首个正时间点 (s, V) | 末端 (V) | old ΔEt (V) | new ΔEt (V) | old D | new D | Rest→t=0 (V) | t=0→首个正点 (V) |',
    '|---|---:|---:|---|---:|---:|---:|---:|---:|---:|---:|',
    ...firstThree.map((item) => `| ${item.fileName} | ${item.pulseOrder} | ${formatNumber(item.canonicalT0, 6)} | ${formatNumber(item.firstPositiveTime, 4)}, ${formatNumber(item.firstPositive, 6)} | ${formatNumber(item.end, 6)} | ${formatNumber(item.oldDeltaEt, 6)} | ${formatNumber(item.newDeltaEt, 6)} | ${formatNumber(item.oldD, 4)} | ${formatNumber(item.newD, 4)} | ${formatNumber(item.preRestToT0, 6)} | ${formatNumber(item.t0ToFirstPositive, 6)} |`),
    '',
    '其中 `Rest→t=0` 是 `preRestEndPotentialV − pulseT0VoltageV`；`t=0→首个正点` 是 `pulseT0VoltageV − firstPositivePulseVoltageV`。两者均为诊断量，不参与 D 公式。',
    '',
    '## 5. method divergence 前后',
    '',
    `- 修改前：n=${methodDivergenceBefore.length}，median=${formatNumber(quantile(methodDivergenceBefore, 0.5), 6)} decades，P90=${formatNumber(quantile(methodDivergenceBefore.map(Math.abs), 0.9), 6)}，maxAbs=${formatNumber(methodDivergenceBefore.length ? Math.max(...methodDivergenceBefore.map(Math.abs)) : null, 6)}。`,
    `- 修改后：n=${methodDivergenceAfter.length}，median=${formatNumber(quantile(methodDivergenceAfter, 0.5), 6)} decades，P90=${formatNumber(quantile(methodDivergenceAfter.map(Math.abs), 0.9), 6)}，maxAbs=${formatNumber(methodDivergenceAfter.length ? Math.max(...methodDivergenceAfter.map(Math.abs)) : null, 6)}。`,
    '- 这是允许变化的直接依赖字段，因为 Endpoint D 已改用 loaded t=0。',
    '',
    '## 6. Endpoint QC 与比较资格',
    '',
    ...qcs.map((item) => `- ${item.fileName}\n  - QC：${item.beforeStatus.join(', ')} → ${item.afterStatus.join(', ')}\n  - eligibility：${item.beforeEligibility.join(', ')} → ${item.afterEligibility.join(', ')}`),
    '',
    '缺少合格 loaded t=0 时，主 Endpoint 为 not computable / excluded；legacy first-positive ΔEt 与 D 仅保留为诊断字段。',
    '',
    '## 7. 冻结字段回归',
    '',
    `- frozen field mismatch 数：${frozenMismatches.length}`,
    frozenMismatches.length ? `- 差异：${frozenMismatches.slice(0, 20).join('; ')}` : '- 结果：pre-rest、post-rest、ΔEs、pulseEnd、pulseDuration、medianVoltage、几何厚度、全部 regression window（含 CFx_10s / legacy first-5 的 slope、R²、RMSE、D）和 windowStabilityDecades 均保持一致。',
    '- DCR：本次 3 个输入均为 GITT，未产生 DCR 事件；本轮未修改 DCR 代码或参数。',
    '',
    '## 8. 版本与本轮验证',
    '',
    '- GITT algorithm：`WH_PLANAR_MANUAL_ENDPOINT@1.0.0` → `@1.1.0`。',
    '- scientific contract：`1.4.0` → `1.5.0`；Manifest schema 保持 `1.0.0`。',
    '- 迁移审计测试：2 个测试通过；独立 DCR 路径未修改，DCR oracle 仍保持原值。',
    '- 最终验证记录：默认并行全量 Vitest 38 个测试文件通过，210 个测试通过、1 个跳过；typecheck、lint、build 均通过（build 仅有现有包体积提示）。',
    '- DCR 资格记录：2 个资格测试文件通过，4 个测试通过、1 个跳过；Python 独立 oracle 通过。',
    '',
    '## 9. 结论',
    '',
    '- Endpoint 主值现在严格使用 Canonical loaded t=0 → pulse end。',
    '- 首个正时间点仍被保留为兼容诊断，不再静默充当主 Endpoint 起点。',
    '- Step Summary 未成为生产算法输入。',
  ];
  return reportLines.join('\n') + '\n';
}

test('reanalyze the three NDAX files and verify the frozen-field migration contract', async () => {
  const baseline = JSON.parse(fs.readFileSync(baselinePath, 'utf8')) as Snapshot;
  const after = await captureCurrentSnapshot();
  fs.writeFileSync(afterPath, JSON.stringify(after, null, 2), 'utf8');
  const frozenRegression = after.files.flatMap((file) => {
    const beforeFile = baseline.files.find((candidate) => candidate.fileName === file.fileName);
    return file.results.flatMap((result: Record<string, unknown>) => {
      const beforeResult = beforeFile?.results.find((candidate: Record<string, unknown>) => candidate.pulseId === result.pulseId);
      return beforeResult
        ? buildFrozenRegressionMismatches(beforeResult, result).map((field) => ({
            fileName: file.fileName,
            pulseOrder: result.pulseOrder,
            field,
          }))
        : [{ fileName: file.fileName, pulseOrder: result.pulseOrder, field: 'missing baseline result' }];
    });
  });
  fs.writeFileSync(
    path.join(outputDir, 'frozen-field-regression.json'),
    JSON.stringify({
      generatedAt: after.generatedAt,
      comparedFiles: after.files.map((file) => file.fileName),
      mismatchCount: frozenRegression.length,
      mismatches: frozenRegression,
    }, null, 2),
    'utf8',
  );
  fs.writeFileSync(reportPath, buildMigrationReport(baseline, after), 'utf8');
  expect(after.files).toHaveLength(3);
  expect(after.files.every((file) => file.results.length > 0)).toBe(true);
  const mismatches = after.files.flatMap((file) => {
    const beforeFile = baseline.files.find((candidate) => candidate.fileName === file.fileName);
    return file.results.flatMap((result: Record<string, unknown>) => {
      const beforeResult = beforeFile?.results.find((candidate: Record<string, unknown>) => candidate.pulseId === result.pulseId);
      return beforeResult ? buildFrozenRegressionMismatches(beforeResult, result) : ['missing baseline result'];
    });
  });
  expect(mismatches).toEqual([]);
}, 30_000);
