import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { expect, test } from 'vitest';
import { normalizeNewareNdax } from '../../src/adapters/neware/normalize';
import { analyzeNewareDataset } from '../../src/app/analyze';
import { createCf1MaterialPreset } from '../../src/science/material';
import type { GittResultV1 } from '../../src/science/contracts';

const root = process.cwd();
const dataDir = path.resolve(root, '260429 GITT');
const outputDir = path.resolve(root, 'analysis', 'rest-end-sensitivity-audit');
const reportPath = path.join(outputDir, 'REST_END_SENSITIVITY_AUDIT_REPORT.md');
const afterPath = path.join(outputDir, 'after.json');
const priorPath = path.resolve(root, 'analysis', 'gitt-t0-endpoint-migration', 'after.json');
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

type PulseAudit = {
  fileName: string;
  pulseOrder: number;
  pulseId: string;
  result: GittResultV1;
};

function finite(value: number | null | undefined): value is number {
  return value !== null && value !== undefined && Number.isFinite(value);
}

function jsonSafe(value: unknown): unknown {
  return JSON.parse(JSON.stringify(value, (_key, nested) => (
    typeof nested === 'bigint' ? nested.toString() : nested
  )));
}

function quantile(values: number[], probability: number): number | null {
  const sorted = [...values].sort((left, right) => left - right);
  if (sorted.length === 0) return null;
  const position = (sorted.length - 1) * probability;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower);
}

function stats(values: Array<number | null | undefined>): {
  n: number;
  median: number | null;
  iqr: number | null;
  p90: number | null;
  max: number | null;
} {
  const finiteValues = values.filter((value): value is number => finite(value));
  const q1 = quantile(finiteValues, 0.25);
  const median = quantile(finiteValues, 0.5);
  const q3 = quantile(finiteValues, 0.75);
  return {
    n: finiteValues.length,
    median,
    iqr: q1 !== null && q3 !== null ? q3 - q1 : null,
    p90: quantile(finiteValues, 0.9),
    max: finiteValues.length > 0 ? Math.max(...finiteValues) : null,
  };
}

function format(value: number | null, digits = 6): string {
  return finite(value) ? value.toExponential(digits) : 'n/a';
}

function formatStats(value: ReturnType<typeof stats>, unit: string): string {
  return `n=${value.n}; median=${format(value.median)} ${unit}; IQR=${format(value.iqr)} ${unit}; P90=${format(value.p90)} ${unit}; max=${format(value.max)} ${unit}`;
}

function deltaEs(result: GittResultV1, window: 'current' | '15min' | '5min'): number | null {
  const audit = result.restEndSensitivityAudit;
  return window === 'current'
    ? audit.deltaEsCurrentV
    : window === '15min'
      ? audit.deltaEs15minV
      : audit.deltaEs5minV;
}

function priorFrozenSnapshot(result: Record<string, unknown>): unknown {
  return {
    preRestEndPotentialV: result.preRestEndPotentialV,
    postRestEndPotentialV: result.postRestEndPotentialV,
    deltaEsV: result.deltaEsV,
    pulseEndVoltageV: result.pulseEndVoltageV,
    pulseDurationS: result.pulseDurationS,
    medianVoltageV: result.medianVoltageV,
    activeMaterialEquivalentThicknessCm: result.activeMaterialEquivalentThicknessCm,
    windowStabilityDecades: result.windowStabilityDecades,
    regressionWindows: result.regressionWindows,
  };
}

function currentFrozenSnapshot(result: GittResultV1): unknown {
  return {
    preRestEndPotentialV: result.preRestEndPotentialV,
    postRestEndPotentialV: result.postRestEndPotentialV,
    deltaEsV: result.deltaEsV,
    pulseEndVoltageV: result.pulseEndVoltageV,
    pulseDurationS: result.pulseDurationS,
    medianVoltageV: result.medianVoltageV,
    activeMaterialEquivalentThicknessCm: result.activeMaterialEquivalentThicknessCm,
    windowStabilityDecades: result.windowStabilityDecades,
    regressionWindows: result.regressionWindows,
  };
}

function buildReport(pulses: PulseAudit[], frozenMismatchCount: number, generatedAtIso: string): string {
  const robustSpread = pulses.flatMap(({ result }) => [
    result.restEndSensitivityAudit.preRest.restEndRobustSpreadV,
    result.restEndSensitivityAudit.postRest.restEndRobustSpreadV,
  ]);
  const estimatorPairs = {
    'Main − 15 min': pulses.flatMap(({ result }) => [
      result.restEndSensitivityAudit.preRest.restEndCurrentVs15minV,
      result.restEndSensitivityAudit.postRest.restEndCurrentVs15minV,
    ]),
    '15 min − 5 min': pulses.flatMap(({ result }) => [
      result.restEndSensitivityAudit.preRest.restEnd15minVs5minV,
      result.restEndSensitivityAudit.postRest.restEnd15minVs5minV,
    ]),
    'Main − 5 min': pulses.flatMap(({ result }) => [
      result.restEndSensitivityAudit.preRest.restEndCurrentVs5minV,
      result.restEndSensitivityAudit.postRest.restEndCurrentVs5minV,
    ]),
    '5 min − Raw last': pulses.flatMap(({ result }) => [
      result.restEndSensitivityAudit.preRest.restEnd5minVsRawV,
      result.restEndSensitivityAudit.postRest.restEnd5minVsRawV,
    ]),
  };
  const deltaEsPairs = {
    'Main − 15 min': pulses.map(({ result }) => {
      const main = deltaEs(result, 'current');
      const fifteen = deltaEs(result, '15min');
      return finite(main) && finite(fifteen) ? Math.abs(main - fifteen) : null;
    }),
    '15 min − 5 min': pulses.map(({ result }) => {
      const fifteen = deltaEs(result, '15min');
      const five = deltaEs(result, '5min');
      return finite(fifteen) && finite(five) ? Math.abs(fifteen - five) : null;
    }),
    'Main − 5 min': pulses.map(({ result }) => {
      const main = deltaEs(result, 'current');
      const five = deltaEs(result, '5min');
      return finite(main) && finite(five) ? Math.abs(main - five) : null;
    }),
  };
  const dPairs = {
    'Main / 15 min': pulses.map(({ result }) => Math.abs(result.restEndSensitivityAudit.log10DCurrentVs15min ?? Number.NaN)),
    '15 min / 5 min': pulses.map(({ result }) => Math.abs(result.restEndSensitivityAudit.log10D15minVs5min ?? Number.NaN)),
    'Main / 5 min': pulses.map(({ result }) => Math.abs(result.restEndSensitivityAudit.log10DCurrentVs5min ?? Number.NaN)),
  };
  const ranked = [...pulses].sort((left, right) => {
    const score = (item: PulseAudit) => Math.max(
      Math.abs(item.result.restEndSensitivityAudit.log10DCurrentVs15min ?? Number.NaN),
      Math.abs(item.result.restEndSensitivityAudit.log10D15minVs5min ?? Number.NaN),
      Math.abs(item.result.restEndSensitivityAudit.log10DCurrentVs5min ?? Number.NaN),
    );
    return score(right) - score(left);
  }).slice(0, 5);

  const lines = [
    '# Rest-end 窗口敏感性审计报告',
    '',
    `- 生成时间：${generatedAtIso}`,
    `- 数据范围：3 个真实 CFx NDAX，${pulses.length} 个 GITT pulse。`,
    '- 本轮只读审计，不改变正式 Rest-end estimator、ΔEs、Endpoint D、QC 或 DCR。',
    '',
    '## 1. 审计定义',
    '',
    '- Main：当前正式窗口 `min(restDuration, max(60 s, 20% × restDuration))`。',
    '- 15 min：最近 `min(restDuration, 900 s)`，Theil–Sen 外推至实际 Rest 末端。',
    '- 5 min：最近 `min(restDuration, 300 s)`，Theil–Sen 外推至实际 Rest 末端。',
    '- Raw last：最新物理时间的最后一个 CanonicalRow 原始电压，不参与 `robustSpread`。',
    '- 三个 robust estimator 均使用 unique physical time + 现有 Theil–Sen；本轮不设置 warning threshold。',
    '',
    '## 2. 文件覆盖',
    '',
    '| 文件 | Pulse 数 | Main/15 min/5 min audit 可用数 |',
    '|---|---:|---:|',
  ];

  for (const fileName of [...new Set(pulses.map((pulse) => pulse.fileName))]) {
    const filePulses = pulses.filter((pulse) => pulse.fileName === fileName);
    const available = filePulses.filter(({ result }) =>
      finite(result.restEndSensitivityAudit.preRest.restEndCurrentWindowV) &&
      finite(result.restEndSensitivityAudit.preRest.restEnd15minV) &&
      finite(result.restEndSensitivityAudit.preRest.restEnd5minV) &&
      finite(result.restEndSensitivityAudit.postRest.restEndCurrentWindowV) &&
      finite(result.restEndSensitivityAudit.postRest.restEnd15minV) &&
      finite(result.restEndSensitivityAudit.postRest.restEnd5minV),
    ).length;
    lines.push(`| ${fileName} | ${filePulses.length} | ${available}/${filePulses.length} |`);
  }

  lines.push('', '## 3. Rest-end 电位敏感性', '', `- ` + `robustSpread（Pre + Post 合并）：${formatStats(stats(robustSpread), 'V')}。`);
  for (const [label, values] of Object.entries(estimatorPairs)) {
    lines.push(`- ${label}：${formatStats(stats(values), 'V')}。`);
  }

  lines.push('', '## 4. ΔEs 敏感性', '');
  for (const [label, values] of Object.entries(deltaEsPairs)) {
    lines.push(`- |ΔEs ${label}|：${formatStats(stats(values), 'V')}。`);
  }
  lines.push('- 正式 `deltaEsV` 保持使用 Main estimator；15 min/5 min 结果只作为 audit。');

  lines.push('', '## 5. D 敏感性', '');
  for (const [label, values] of Object.entries(dPairs)) {
    lines.push(`- |Δlog10D (${label})|：${formatStats(stats(values), 'decades')}。`);
  }
  lines.push('- D audit 使用相同的 pulse duration、geometry、loaded-t=0 Endpoint ΔEt，只替换 ΔEs。');

  lines.push('', '## 6. 最敏感的 5 个 pulse', '', '| 文件 | Pulse | max |Δlog10D| | robust spread 最大值 |', '|---|---:|---:|---:|');
  for (const pulse of ranked) {
    const audit = pulse.result.restEndSensitivityAudit;
    const score = Math.max(
      Math.abs(audit.log10DCurrentVs15min ?? Number.NaN),
      Math.abs(audit.log10D15minVs5min ?? Number.NaN),
      Math.abs(audit.log10DCurrentVs5min ?? Number.NaN),
    );
    const spread = Math.max(
      audit.preRest.restEndRobustSpreadV ?? Number.NaN,
      audit.postRest.restEndRobustSpreadV ?? Number.NaN,
    );
    lines.push(`| ${pulse.fileName} | ${pulse.pulseOrder} | ${format(score)} | ${format(spread)} V |`);
  }

  lines.push('', '## 7. 正式字段冻结核验', '', `- 与 Endpoint 迁移后基线比较的 frozen-field mismatch：**${frozenMismatchCount}**。`, '- `preRestEndPotentialV`、`postRestEndPotentialV`、`deltaEsV`、`pulseEndVoltageV`、`pulseDurationS`、`medianVoltageV`、geometry/L、CFx_10s 回归和 window stability 均保持不变。', '- 本报告没有把任何 audit estimator 写入正式主值，也没有写入新的 QC 阈值。');

  lines.push('', '## 8. 本轮结论', '', '- 本轮只提供 Main、15 min、5 min 和 Raw-last 的真实数据差异，不据此自动迁移正式窗口。', '- 是否将正式窗口封顶 15 min，留待科学审查根据上述 spread、ΔEs 和 D 的影响决定。');
  return `${lines.join('\n')}\n`;
}

test('audits Rest-end estimators on the three real CFx NDAX files', async () => {
  fs.mkdirSync(outputDir, { recursive: true });
  const pulses: PulseAudit[] = [];
  for (const filePath of sourceFiles) {
    expect(fs.existsSync(filePath)).toBe(true);
    const fileName = path.basename(filePath);
    const dataset = await normalizeNewareNdax(fs.readFileSync(filePath), fileName);
    const analysis = analyzeNewareDataset(dataset, settings);
    expect(analysis.gittResults.length).toBeGreaterThan(0);
    const retainedPulseIds = new Set(
      (analysis.cfxLiterature1200s?.programExecution.events ?? []).map((event) => event.sourcePulseId),
    );
    analysis.gittResults
      .filter((result) => retainedPulseIds.has(result.pulseId))
      .forEach((result, index) => {
      const audit = result.restEndSensitivityAudit;
      expect(audit).toBeDefined();
      expect(audit.preRest.restEndCurrentWindowV).toBe(result.preRestEndPotentialV);
      expect(audit.postRest.restEndCurrentWindowV).toBe(result.postRestEndPotentialV);
      expect(audit.deltaEsCurrentV).toBe(result.deltaEsV);
      expect(audit.dCurrentCm2PerS).toBe(result.metricValueCm2PerS);
      expect(audit.preRest.restEndCurrentWindowV).not.toBeNull();
      expect(audit.preRest.restEnd15minV).not.toBeNull();
      expect(audit.preRest.restEnd5minV).not.toBeNull();
      expect(audit.postRest.restEndCurrentWindowV).not.toBeNull();
      expect(audit.postRest.restEnd15minV).not.toBeNull();
      expect(audit.postRest.restEnd5minV).not.toBeNull();
      pulses.push({ fileName, pulseOrder: index + 1, pulseId: result.pulseId, result });
    });
  }

  expect(pulses).toHaveLength(39);
  expect(fs.existsSync(priorPath)).toBe(true);
  const prior = JSON.parse(fs.readFileSync(priorPath, 'utf8')) as {
    files: Array<{ fileName: string; results: Array<Record<string, unknown>> }>;
  };
  const priorByPulse = new Map(
    prior.files.flatMap((file) => file.results.map((result) => [`${file.fileName}:${result.pulseId}`, result] as const)),
  );
  let frozenMismatchCount = 0;
  for (const pulse of pulses) {
    const previous = priorByPulse.get(`${pulse.fileName}:${pulse.pulseId}`);
    expect(previous).toBeDefined();
    if (JSON.stringify(priorFrozenSnapshot(previous as Record<string, unknown>)) !== JSON.stringify(currentFrozenSnapshot(pulse.result))) {
      frozenMismatchCount += 1;
    }
  }
  expect(frozenMismatchCount).toBe(0);

  fs.writeFileSync(afterPath, JSON.stringify(jsonSafe({
    generatedAt: new Date().toISOString(),
    sourceFiles: sourceFiles.map((filePath) => path.basename(filePath)),
    pulseCount: pulses.length,
    pulses: pulses.map(({ fileName, pulseOrder, pulseId, result }) => ({
      fileName,
      pulseOrder,
      pulseId,
      formal: currentFrozenSnapshot(result),
      restEndSensitivityAudit: result.restEndSensitivityAudit,
    })),
  }), null, 2), 'utf8');
  fs.writeFileSync(reportPath, buildReport(pulses, frozenMismatchCount, new Date().toISOString()), 'utf8');
  expect(fs.existsSync(reportPath)).toBe(true);
  expect(fs.existsSync(afterPath)).toBe(true);
}, 30_000);
