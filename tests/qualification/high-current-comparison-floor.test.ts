import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from 'vitest';

import { normalizeNewareNdax } from '../../src/adapters/neware/normalize';
import { analyzeNewareDataset } from '../../src/app/analyze';
import { buildReleaseExportModel } from '../../src/app/exportRows';
import type { WorkbenchDatasetV1 } from '../../src/app/project';
import type { DatasetRecipePlanV1 } from '../../src/app/recipe';
import { isCfxDisplayComparisonPointEligible } from '../../src/product/gitt/literaturePlotModel';
import { createCf1MaterialPreset } from '../../src/science/material';

const dataDirectory = process.env.GITTDCR_HIGH_RATE_DATA_DIR ?? 'F:\\520GITT 500ma - 副本';
const sourceFiles = [
  'FGS-GITT-500ma-0.568mg-1_127.0.0.1-BTS85-23-8-4-1020.ndax',
  'FGS-GITT-500ma-0.64mg-3_127.0.0.1-BTS85-23-8-6-1022.ndax',
].map((fileName) => path.join(dataDirectory, fileName));

const material = createCf1MaterialPreset();
const settings = {
  electrodeDiameterCm: 1.2,
  electrodeDiameterStandardUncertaintyCm: null,
  activeMassStandardUncertaintyG: null,
  currentResolutionA: null,
  voltageResolutionV: null,
  material,
  initialSocPct: null,
  initialSocSource: 'unknown' as const,
  datasetStartsAtFreshCell: false,
  activeMassOverrideG: null,
  activeMassSourceId: null,
  regressionManualWindow: undefined,
};

function loadedDataset(
  filePath: string,
  dataset: Awaited<ReturnType<typeof normalizeNewareNdax>>,
): WorkbenchDatasetV1 {
  const fileName = path.basename(filePath);
  return {
    id: dataset.sourceFileHash,
    fileName,
    fileSize: fs.statSync(filePath).size,
    importedAtIso: '2026-09-17T00:00:00.000Z',
    canonical: dataset,
  };
}

function numberText(value: number | null | undefined): string {
  return typeof value === 'number' && Number.isFinite(value) ? value.toExponential(6) : 'n/a';
}

test.skipIf(!sourceFiles.every((filePath) => fs.existsSync(filePath)))('qualifies high-rate median-voltage display retention on the two supplied NDAX files', async () => {
  const reports: Array<{
    fileName: string;
    sourceFileHash: string;
    activeMassMg: number | null;
    specificCurrents: number[];
    stopVoltageV: number | null;
    firstCutoffPulseId: string | null;
    oldRetainedCount: number;
    allEventCount: number;
    analysisResultCount: number;
    postProtocolCutoffCount: number;
    medianFloorExcludedCount: number;
    displayIncludedCount: number;
    auditRowCount: number;
    cfxProfileExportRowCount: number;
    mainIds: string[];
    displayIds: string[];
  }> = [];

  for (const filePath of sourceFiles) {
    expect(fs.existsSync(filePath)).toBe(true);
    const fileName = path.basename(filePath);
    const dataset = await normalizeNewareNdax(fs.readFileSync(filePath), fileName);
    const analysis = analyzeNewareDataset(dataset, settings);
    const cfx = analysis.cfxLiterature1200s;
    expect(cfx).not.toBeNull();
    const profile = cfx?.comparativeProfile;
    expect(profile).not.toBeUndefined();
    const profileValue = profile as NonNullable<typeof profile>;
    const allEvents = cfx?.programExecution.allEvents ?? [];
    const oldRetainedEvents = cfx?.programExecution.events ?? [];
    const displayIds = profileValue.pulses
      .filter((pulse) => isCfxDisplayComparisonPointEligible(pulse))
      .map((pulse) => pulse.sourcePulseId);
    const release = buildReleaseExportModel({
      loaded: loadedDataset(filePath, dataset),
      analysis,
      resolvedSettings: settings,
      recipePlan: {
        recipeVersion: '1.1.0',
        sourceFileHash: dataset.sourceFileHash,
        analysisKind: 'gitt',
        readyToAnalyze: true,
        questions: [],
        blocking: [],
        autoResolved: [],
        resolved: {},
        recipeResult: null,
      } as unknown as DatasetRecipePlanV1,
      exportedAtIso: '2026-09-17T00:00:00.000Z',
    });

    expect(allEvents.length).toBeGreaterThan(oldRetainedEvents.length);
    expect(analysis.gittResults).toHaveLength(allEvents.length);
    expect(profileValue.pulses).toHaveLength(allEvents.length);
    expect(profileValue.summary.postProtocolCutoffPulseCount).toBeGreaterThan(0);
    expect(profileValue.summary.comparisonTargetMedianExcludedCount).toBeGreaterThanOrEqual(0);
    expect(release.auditRows.filter((row) => row.resultType === 'gitt')).toHaveLength(analysis.gittResults.length);
    expect(release.cfxProfileRows).toHaveLength(profileValue.pulses.length);
    expect(release.cfxProfileRows.some((row) => row.protocolCutoffState === 'post_protocol_cutoff')).toBe(true);
    expect(release.cfxProfileRows.some((row) => row.auditDAppCandidateCm2PerS !== null)).toBe(true);
    expect(release.cfxProfileRows.map((row) => row.displayComparisonEligibility === 'included'))
      .toEqual(profileValue.pulses.map((pulse) => pulse.displayComparisonEligibility === 'included'));

    reports.push({
      fileName,
      sourceFileHash: dataset.sourceFileHash,
      activeMassMg: dataset.metadata.activeMassMg,
      specificCurrents: profileValue.pulses
        .map((pulse) => pulse.polarization.equivalentSpecificCurrentMahPerG)
        .filter((value): value is number => value !== null),
      stopVoltageV: allEvents[0]?.program.stopVoltageV ?? null,
      firstCutoffPulseId: cfx?.programExecution.summary.firstCutoffSourcePulseId ?? null,
      oldRetainedCount: oldRetainedEvents.length,
      allEventCount: allEvents.length,
      analysisResultCount: analysis.gittResults.length,
      postProtocolCutoffCount: cfx?.programExecution.summary.postProtocolCutoffEventCount ?? 0,
      medianFloorExcludedCount: profileValue.summary.comparisonTargetMedianExcludedCount,
      displayIncludedCount: profileValue.summary.displayComparisonIncludedCount,
      auditRowCount: release.auditRows.filter((row) => row.resultType === 'gitt').length,
      cfxProfileExportRowCount: release.cfxProfileRows.length,
      mainIds: profileValue.pulses
        .filter((pulse) => pulse.displayComparisonEligibility === 'included')
        .map((pulse) => pulse.sourcePulseId),
      displayIds,
    });
  }

  const reportLines = [
    '# 高倍率主图中值电压下限真实数据验收',
    '',
    '> 规则：协议仍按第一次 CanonicalRow 接近 Stop_Volt 判定；主 D_app–中值电压比较图统一要求 `medianVoltageV >= comparisonTargetMedianVoltageV = 1.5 V`。被排除记录不删除。',
    '',
    '## 验收结果',
    '',
    `- 文件数：${reports.length}`,
    '- 主图点集合与 `displayComparisonEligibility= included` 集合一致。',
    '- 协议截止后的记录仍进入分析结果、Summary 和导出；4 h 静置完成且中值电压不低于 1.5 V 的记录可进入主图。',
    '',
    '## 文件统计',
    '',
    '| 文件 | 活性质量 / mg | 等效比电流范围 / mA·g⁻¹ | Stop_Volt / V | 旧保留数 | 全部事件数 | 协议截止后数 | 中值电压下限排除数 | 主图数 | 审计 GITT 行 | CFₓ profile 行 |',
    '| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |',
    ...reports.map((report) => {
      const currents = report.specificCurrents;
      const range = currents.length === 0
        ? 'n/a'
        : `${numberText(Math.min(...currents))}–${numberText(Math.max(...currents))}`;
      return `| ${report.fileName} | ${numberText(report.activeMassMg)} | ${range} | ${numberText(report.stopVoltageV)} | ${report.oldRetainedCount} | ${report.allEventCount} | ${report.postProtocolCutoffCount} | ${report.medianFloorExcludedCount} | ${report.displayIncludedCount} | ${report.auditRowCount} | ${report.cfxProfileExportRowCount} |`;
    }),
    '',
    '## 主图与导出一致性',
    '',
    ...reports.flatMap((report) => [
      `### ${report.fileName}`,
      '',
      `- 主图点数：${report.mainIds.length}`,
      `- ` + '`displayComparisonEligibility= included`' + ` 点数：${report.displayIds.length}`,
      `- 点位 ID 一致：${JSON.stringify(report.mainIds) === JSON.stringify(report.displayIds) ? '是' : '否'}`,
      `- 分析结果行数：${report.analysisResultCount}`,
      `- 审计导出 GITT 行数：${report.auditRowCount}`,
      `- CFₓ profile 导出行数：${report.cfxProfileExportRowCount}`,
      `- 首次协议截止事件：${report.firstCutoffPulseId ?? '未出现'}`,
      '',
    ]),
  ];
  const reportPath = path.resolve(process.cwd(), 'analysis', 'high-current-comparison-floor', '2026-09-17-real-data-report.md');
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, reportLines.join('\n'), 'utf8');
  expect(reports.every((report) => report.mainIds.length === report.displayIds.length)).toBe(true);
}, 60_000);
