# 高倍率中值电压比较下限 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 保留真实 1.5 V 终端协议截止，并仅对比电流 ≥500 mA·g⁻¹ 的 CFₓ 数据，在主 D_app–Voltage 图应用 `medianVoltageV >= 1.5 V` 的显示/比较下限；低于该电流继续使用旧规则。

**Architecture:** Neware adapter 同时保留现有协议序列和全部可识别事件，协议层仍按 CanonicalRow 第一次 Stop_Volt 记录定义 cutoff。CFₓ product profile 负责把高倍率中值电压下限转换成独立的 `displayComparisonEligibility`，不删除 audit/detail/export 数据。分析管线、主图和导出共同消费这些状态，Endpoint、ΔEt、ΔEs、WH、DCR 和 CFx_10s 计算不变。

**Tech Stack:** TypeScript, React, Vitest, Vite, Neware CanonicalRow / GITT science core / CFₓ product profile / XLSX export。

## Global Constraints

- 高倍率条件固定为 `equivalentSpecificCurrentMahPerG >= 500`。
- 协议 cutoff 仍是原始 CanonicalRow 第一次满足 `voltageV <= stopVoltageV + existingCutoffToleranceV` 的记录。
- 高倍率主图下限固定为 `medianVoltageV >= 1.5 V`；它是显示/比较下限，不是协议截止电压。
- `medianVoltageV < 1.5 V` 的结果不删除，保留在 GITT Summary、audit、pulse detail 和正式导出。
- 协议 cutoff 后的事件不伪装成标准完整 GITT 事件；高倍率数据可保留其已计算结果用于审计/detail/export，但不进入主 D_app–Voltage 图。
- `<500 mA·g⁻¹` 不启用中值电压下限，继续使用现有规则。
- 不修改 Endpoint、ΔEt、ΔEs、WH、DCR、CFx_10s、回归窗口、几何、质量、pulse duration 或 Stop_Volt 解析。
- 不使用文件名、绝对通道电流、XLSX 聚合值或 UI 自行重新计算边界。
- 缺失中值电压、缺失 loaded t=0、缺失 Rest 或不可计算结果不能静默进入主图。
- 保留现有未提交用户改动；不创建分支/worktree；不清理无关文件；只提交本功能明确修改的文件。

---

### Task 1: 先锁定协议 cutoff、显示下限和数据保留的失败测试

**Files:**
- Modify: `src/adapters/neware/gitt1200sProfile.test.ts`
- Modify: `src/product/cfx/literature1200sGittProfile.test.ts`
- Modify: `src/app/analyze.recipe.integration.test.ts`

**Interfaces:**
- Consumes: 当前 adapter/product/profile 分段和测试 fixture。
- Produces: 红灯测试，证明协议 cutoff 与主图显示下限是两层规则，且低电流行为不变。

- [ ] **Step 1: 扩展现有 Neware 测试 fixture 的中值电压输入**

在 `src/adapters/neware/gitt1200sProfile.test.ts` 的现有 `result` helper 中增加第四个可选参数 `medianVoltageV: number | null = null`，并将其写入返回对象；继续使用文件现有的 `row`、`dataset` 和 `datasetWithUnstoppedCutoffCycle` helper，不新建第二套 CanonicalRow 时间轴。

```ts
function result(
  pulseStep: string,
  durationS: number,
  endVoltageV: number,
  medianVoltageV: number | null = null,
): GittResultV1 {
  return {
    pulseId: `${sourceFileHash}:gitt:${pulseStep}`,
    pulseDurationS: durationS,
    pulseEndVoltageV: endVoltageV,
    medianVoltageV,
  } as GittResultV1;
}
```

- [ ] **Step 2: 写 adapter 的失败测试**

在已有“channel runs after cutoff”测试中，继续断言 `events` 只保留旧的协议序列，同时新增：

```ts
expect(analysis.allEvents).toHaveLength(2);
expect(analysis.allEvents.map((event) => event.sourcePulseId)).toEqual([
  `${sourceFileHash}:gitt:pulse`,
  `${sourceFileHash}:gitt:pulse-2`,
]);
expect(analysis.allEvents[1]).toMatchObject({
  isPostProtocolCutoff: true,
  pulseMedianVoltageV: null,
});
```

这个测试要求 adapter 同时返回 `events`（旧协议保留序列）和 `allEvents`（全部可识别事件），不会让协议 cutoff 语义被主图规则替代。

- [ ] **Step 3: 写 product profile 的失败测试**

为现有 `sourcePulse` helper 增加 `medianVoltageV` 和最小的 `programEvent` fixture，加入两个完整 1200 s pulse：一个中值电压为 `1.5`，一个为 `1.499`。等效比电流使用现有 `pulseCapacityFraction` 与 `pulseDurationS` 计算到 `500 mA·g⁻¹` 以上，断言：

```ts
expect(result.pulses.map((pulse) => pulse.displayComparisonEligibility)).toEqual([
  'included',
  'excluded_high_rate_median_floor',
]);
expect(result.pulses[1].transportComparison.dAppCandidateCm2PerS).toBe(1.2e-10);
expect(result.summary.highRateMedianFloorExcludedCount).toBe(1);
```

再用等效比电流低于 `500 mA·g⁻¹` 的同一 fixture，断言中值电压 `1.499` 不触发新的 display exclusion。

- [ ] **Step 4: 写分析管线的失败测试**

在 `src/app/analyze.recipe.integration.test.ts` 加入一个高倍率 fixture：原始第一次 Stop_Volt cutoff 后仍有两个可识别 pulse。断言分析结果保留这些 pulse，但主比较资格为排除：

```ts
expect(recipeAnalysis.gittResults).toHaveLength(4);
expect(recipeAnalysis.cfxLiterature1200s?.comparativeProfile.pulses).toHaveLength(4);
expect(recipeAnalysis.cfxLiterature1200s?.comparativeProfile.pulses.at(-1)?.sequenceClassification)
  .toBe('post_protocol_cutoff');
expect(recipeAnalysis.cfxLiterature1200s?.comparativeProfile.pulses.at(-1)?.displayComparisonEligibility)
  .toBe('excluded_protocol_cutoff');
```

- [ ] **Step 5: 运行测试确认正确失败**

运行：

```text
npm test -- --run src/adapters/neware/gitt1200sProfile.test.ts src/product/cfx/literature1200sGittProfile.test.ts src/app/analyze.recipe.integration.test.ts
```

预期：新增断言因字段和双层筛选尚未存在而失败；若出现 fixture/type 错误，先修正测试本身，再进入生产代码。

### Task 2: 扩展 Neware 事件契约但保持协议 cutoff 不变

**Files:**
- Modify: `src/adapters/neware/gitt1200sProfile.ts`
- Modify: `src/adapters/neware/gitt1200sProfile.test.ts`

**Interfaces:**
- Consumes: 现有 `CanonicalRowV1`、NDAX `stopVoltageV`、`GittResultV1.medianVoltageV`。
- Produces: `allEvents`、`pulseMedianVoltageV`、`isPostProtocolCutoff`，以及原有 `events`/cutoff 兼容行为。

- [ ] **Step 1: 增加事件字段和完整事件集合**

在 `NewareGitt1200sEventV1` 增加：

```ts
pulseMedianVoltageV: number | null;
isPostProtocolCutoff: boolean;
```

在 `NewareGitt1200sProfileResultV1` 增加：

```ts
allEvents: NewareGitt1200sEventV1[];
```

`events` 继续表示旧的协议保留序列；`allEvents` 表示所有成功从 `pulseResults` 与 CanonicalRow 对齐的事件。

- [ ] **Step 2: 填充中值电压并标记协议 cutoff 后事件**

生成事件时直接写入：

```ts
pulseMedianVoltageV: finite(result.medianVoltageV) ? result.medianVoltageV : null,
isPostProtocolCutoff: false,
```

计算 `firstCutoffIndex` 后，对 `events` 按索引更新：

```ts
const allEvents = events.map((event, index) => ({
  ...event,
  isPostProtocolCutoff: firstCutoffIndex >= 0 && index > firstCutoffIndex,
}));
const retainedEvents = firstCutoffIndex >= 0
  ? allEvents.slice(0, firstCutoffIndex + 1)
  : allEvents;
```

保持现有 `firstNearCutoffRow`、`classifyTermination` 和 `firstCutoffIndex` 的物理时间轴与截止容差实现完全不变。

- [ ] **Step 3: 返回双集合和原有 summary**

返回 `allEvents` 与原有 `events: retainedEvents`。已有 `retainedPulseCount`、`excludedAfterFirstCutoffCount` 和 `firstCutoffSourcePulseId` 继续针对协议保留序列统计；新增：

```ts
postProtocolCutoffEventCount: allEvents.filter((event) => event.isPostProtocolCutoff).length
```

不得用 `pulseMedianVoltageV` 改写 `termination`，不得把它称为 cutoff。

- [ ] **Step 4: 运行 adapter 测试确认变绿**

运行：

```text
npm test -- --run src/adapters/neware/gitt1200sProfile.test.ts
```

预期：新增测试和原有协议 cutoff 测试全部通过。

### Task 3: 在 CFₓ product profile 中建立高倍率主图显示资格

**Files:**
- Modify: `src/product/cfx/literature1200sGittProfile.ts`
- Modify: `src/product/cfx/index.ts`
- Modify: `src/product/cfx/literature1200sGittProfile.test.ts`
- Modify: `src/components/workbench/StatusBadge.tsx`

**Interfaces:**
- Consumes: `GittResultV1.medianVoltageV`、`pulseDurationS`、`pulseCapacityFraction`、`programEvent.isPostProtocolCutoff`。
- Produces: 独立的 `displayComparisonEligibility`、高倍率阈值和审计字段；不改变正式计算值。

- [ ] **Step 1: 提取并复用现有等效比电流函数**

保留现有公式并导出唯一 helper：

```ts
export function deriveEquivalentSpecificCurrentMahPerG(
  theoreticalSpecificCapacityMahPerG: number | null,
  pulseDurationS: number | null,
  pulseCapacityFraction: number | null,
): number | null {
  return positiveFinite(theoreticalSpecificCapacityMahPerG) &&
    positiveFinite(pulseDurationS) &&
    finite(pulseCapacityFraction)
    ? Math.abs(pulseCapacityFraction) * theoreticalSpecificCapacityMahPerG * 3600 / pulseDurationS
    : null;
}
```

在 `src/product/cfx/index.ts` 重新导出，并集中定义：

```ts
export const HIGH_RATE_SPECIFIC_CURRENT_THRESHOLD_MA_G = 500;
export const HIGH_RATE_MEDIAN_VOLTAGE_FLOOR_V = 1.5;
```

- [ ] **Step 2: 扩展 product profile 输入和输出契约**

在 `CfxLiterature1200sPulseSourceV1` 加入 `medianVoltageV`。在 profile pulse 结果增加：

```ts
displayComparisonEligibility:
  | 'included'
  | 'excluded_high_rate_median_floor'
  | 'excluded_protocol_cutoff'
  | 'excluded_not_computable'
  | 'excluded_qc';
specificCurrentMahPerG: number | null;
auditDAppCandidateCm2PerS: number | null;
```

将 `eventClassification` 增加：

```ts
'post_protocol_cutoff'
```

summary 增加：

```ts
highRateModeFile: boolean;
highRateMedianFloorExcludedCount: number;
postProtocolCutoffPulseCount: number;
```

- [ ] **Step 3: 保持协议分类，单独计算 display eligibility**

`classifyEvent` 中，如果 `programEvent?.isPostProtocolCutoff === true`，返回 `post_protocol_cutoff`；这只描述协议来源，不改变 `GittResultV1` 的数值。

在 `profilePulse` 中先计算 `specificCurrentMahPerG`，再计算：

```ts
const highRateMode =
  specificCurrentMahPerG !== null &&
  specificCurrentMahPerG >= HIGH_RATE_SPECIFIC_CURRENT_THRESHOLD_MA_G;
const isStandardComplete = eventClassification === 'complete_1200s_standard_rest';
const passesMedianFloor = !highRateMode ||
  (finite(pulse.medianVoltageV) &&
    pulse.medianVoltageV >= HIGH_RATE_MEDIAN_VOLTAGE_FLOOR_V);
const displayComparisonEligibility =
  eventClassification === 'post_protocol_cutoff'
    ? 'excluded_protocol_cutoff'
    : !isStandardComplete || pulse.calculationState !== 'computed'
      ? 'excluded_not_computable'
      : primaryEndpointQcStatus === 'rejected'
        ? 'excluded_qc'
        : !passesMedianFloor
          ? 'excluded_high_rate_median_floor'
          : 'included';
```

主图下限只用这个新字段。`medianVoltageV` 不进入 Endpoint/WH 重新计算；`transportComparison.dAppCandidateCm2PerS` 继续读取已有 `diagnosticCandidateMetricValueCm2PerS`，以便低于中值下限的点仍可导出审计。对 `post_protocol_cutoff` 事件增加独立的 `auditDAppCandidateCm2PerS` 字段，直接保留已有数值但不改变其主比较资格。

- [ ] **Step 4: 补充状态显示**

在 `StatusBadge.tsx` 增加 `post_protocol_cutoff` 和 `excluded_high_rate_median_floor` 的清晰中文文案，例如“协议截止后”和“低于高倍率主图下限”；不得把后者显示为“实验截止”。

- [ ] **Step 5: 运行 product profile 测试确认变绿**

运行：

```text
npm test -- --run src/product/cfx/literature1200sGittProfile.test.ts
```

预期：标准事件原有数值和统计不变；高倍率 `medianVoltageV < 1.5` 的 pulse 有数值、有审计状态，但 display eligibility 为排除。

### Task 4: 让高倍率数据进入审计/detail/export，但不污染主图

**Files:**
- Modify: `src/app/analyze.ts`
- Modify: `src/app/analyze.recipe.integration.test.ts`
- Modify: `src/product/gitt/literaturePlotModel.ts`
- Modify: `src/App.tsx`
- Modify: `src/app/exportRows.ts`
- Modify: `src/app/reportExport.ts`
- Test: `src/product/gitt/literaturePlotModel.test.ts`
- Test: `src/app/exportRows.test.ts`

**Interfaces:**
- Consumes: adapter `events`/`allEvents` 和 product `displayComparisonEligibility`。
- Produces: 高倍率所有可识别结果保留，主 D_app–Voltage 图只使用 display included，Summary/detail/export 可追溯全部记录。

- [ ] **Step 1: 在分析管线中只对高倍率保留协议 cutoff 后结果**

在 `src/app/analyze.ts` 中先用 Task 3 的唯一 helper 对全部 GITT result 计算高倍率 pulse id：

```ts
const highRatePulseIds = new Set(
  gittResults
    .filter((result) =>
      (deriveEquivalentSpecificCurrentMahPerG(
        settings.material.theoreticalSpecificCapacityMahPerG,
        result.pulseDurationS,
        result.pulseCapacityFraction,
      ) ?? -Infinity) >= HIGH_RATE_SPECIFIC_CURRENT_THRESHOLD_MA_G,
    )
    .map((result) => result.pulseId),
);
const highRateMode = highRatePulseIds.size > 0;
```

调用 adapter 后：

```ts
const retainedPulseIds = new Set(
  highRateMode
    ? programExecution.allEvents.map((event) => event.sourcePulseId)
    : programExecution.events.map((event) => event.sourcePulseId),
);
gittResults = gittResults.filter((result) => retainedPulseIds.has(result.pulseId));
const programEventByPulseId = new Map(
  (highRateMode ? programExecution.allEvents : programExecution.events)
    .map((event) => [event.sourcePulseId, event]),
);
```

这一步只改变高倍率的结果保留范围；低于阈值继续使用旧 `events` 集合。

- [ ] **Step 2: 让 product profile 接收全部保留结果并标记 protocol 来源**

映射 `pulseResults` 时把 `medianVoltageV: result.medianVoltageV` 和 `programEvent` 直接传入；不在 analyze 层重新判断中值下限。`programExecution.events` 仍供旧协议摘要使用，`allEvents` 供高倍率 audit/detail/export 使用。

- [ ] **Step 3: 统一主图点判定**

在 `src/product/gitt/literaturePlotModel.ts` 导出：

```ts
export function isMainCfxComparisonPoint(
  displayComparisonEligibility: string | null | undefined,
  result: Pick<GittResultV1, 'metricValueCm2PerS' | 'medianVoltageV' | 'deltaEtV' | 'deltaEsV'>,
): boolean {
  return displayComparisonEligibility === 'included' && isWhVoltageMetricPointEligible(result);
}
```

`App.tsx` 的 `gittVoltageMetricPoints` 和 `gittMedianDli` 只通过这个 helper 生成主比较点，不再直接判断 `eventClassification === 'complete_1200s_standard_rest'`。主图不会显示 `excluded_high_rate_median_floor` 或 `post_protocol_cutoff`。

- [ ] **Step 4: 保留 Summary、audit、pulse detail 和 export 记录**

事件表的 `all` 视图、pulse detail 和 `buildAuditExportRows` 使用保留的全部 `gittResults`；每行追加：

```text
specificCurrentMahPerG
medianVoltageV
displayComparisonEligibility
protocolCutoffState
sequenceClassification
```

低于主图下限的行仍保留已有 D、ΔEt、ΔEs、Endpoint QC 和审计值，不把这些值设为 null，仅把 display eligibility 标为排除。主图导出数据集则只导出 `displayComparisonEligibility === 'included'`。

- [ ] **Step 5: 更新导出和 plot bundle 测试**

断言：

```ts
expect(mainDliRows.map((row) => row.pulseId)).not.toContain('median-below-floor');
expect(auditRows.map((row) => row.resultId)).toContain('median-below-floor');
expect(auditRows.find((row) => row.resultId === 'median-below-floor')?.displayComparisonEligibility)
  .toBe('excluded_high_rate_median_floor');
expect(auditRows.find((row) => row.resultId === 'post-cutoff')?.sequenceClassification)
  .toBe('post_protocol_cutoff');
```

运行：

```text
npm test -- --run src/product/gitt/literaturePlotModel.test.ts src/app/exportRows.test.ts
```

预期：主图和主比较导出只包含 eligible 点；audit/detail/export 仍能找到被主图排除的点。

### Task 5: 更新 UI 摘要、Manifest 和版本语义

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/app/exportRows.ts`
- Modify: `src/science/versions.ts`
- Modify: `README.md`
- Modify: `docs/RELEASE_NOTES_0.1.0-beta.1.md`
- Modify: `src/app/project.test.ts`

**Interfaces:**
- Consumes: product profile summary and display eligibility。
- Produces: UI/Manifest 中可追溯的双层 cutoff 说明，不改变 science algorithm version 或 DCR version。

- [ ] **Step 1: 更新 UI 计数与文案**

摘要区分别显示：协议 cutoff 事件数、高倍率主图下限排除数、协议 cutoff 后审计事件数。主序列过滤使用 `displayComparisonEligibility === 'included'`；`all` 仍显示全部保留记录。

- [ ] **Step 2: 更新 Manifest**

在 CFₓ GITT 配置和导出 Manifest 写入：

```text
protocolCutoffDefinition = first_canonical_row_stop_voltage
primaryComparisonDisplayPolicy = high_rate_median_voltage_floor
highRateSpecificCurrentThresholdMahPerG = 500
highRateMedianVoltageFloorV = 1.5
belowFloorRetention = summary_audit_pulse_detail_export
```

同时记录新的 product profile 版本；不提升 GITT Endpoint/DCR 算法版本。

- [ ] **Step 3: 更新说明文档和 release notes**

明确写出：1.5 V terminal cutoff 与 1.5 V median display floor 不是同一物理量；高倍率主图过滤不等于删除数据；低倍率保持旧规则。

- [ ] **Step 4: 运行定向测试**

运行：

```text
npm test -- --run src/app/project.test.ts src/app/reportExport.test.ts src/components/workbench/BatchTrendPlot.test.ts
```

预期：Manifest、报告导出、UI trend helper 相关测试全部通过。

### Task 6: 真实 NDAX 验收与冻结字段回归

**Files:**
- Create: `tests/qualification/high-current-comparison-floor.test.ts`
- Create: `analysis/high-current-comparison-floor/2026-09-17-real-data-report.md`

**Interfaces:**
- Consumes: 两个真实高倍率 NDAX、现有结果基线和新的分析/导出状态。
- Produces: 真实数据验证报告，证明新增的主图显示下限与数据保留范围符合定义。

- [ ] **Step 1: 运行真实数据资格测试**

读取：

```text
F:\520GITT 500ma - 副本\FGS-GITT-500ma-0.568mg-1_127.0.0.1-BTS85-23-8-4-1020.ndax
F:\520GITT 500ma - 副本\FGS-GITT-500ma-0.64mg-3_127.0.0.1-BTS85-23-8-6-1022.ndax
```

逐文件报告：比电流、Stop_Volt、第一次原始 cutoff、保留 pulse 总数、主图 pulse 数、median floor 排除数、协议 cutoff 后保留数、audit/export 行数，以及主图和导出点 id 是否一致。

- [ ] **Step 2: 对共同 pulse 做数值 0 回归核对**

修改前后逐项比较共同 pulse 的：

```text
Endpoint D
ΔEt
ΔEs
medianVoltageV
pulseDurationS
DCR
CFx_10s slope / R² / RMSE / point count
geometry / L
```

新增 pulse 只允许增加保留记录，不允许改变共同 pulse 的上述数值。

- [ ] **Step 3: 生成真实数据报告**

报告至少包含：

- 协议 cutoff 与 median display floor 的逐 pulse 对照；
- 主图包含/排除理由；
- Summary、audit、pulse detail、export 是否仍能追溯低于 floor 和 cutoff 后记录；
- 两个真实文件的前后主图点数与审计行数；
- 低于 500 mA·g⁻¹ fixture 的旧规则结果；
- 本轮明确未修改的科学量清单。

- [ ] **Step 4: 执行最终验证**

运行：

```text
npm test -- --run tests/qualification/high-current-comparison-floor.test.ts
npm run typecheck
npm run build
git diff --check
```

预期：资格测试、类型检查、构建和空白检查全部通过；报告真实记录失败数量，不声称整个工作区干净。
