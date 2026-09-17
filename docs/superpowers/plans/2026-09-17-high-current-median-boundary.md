# 高电流中值电压边界 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 对比电流 ≥500 mA·g⁻¹ 的 CFₓ NDAX 数据，按脉冲中值电压达到声明 Stop_Volt 附近确定序列边界，使边界前且结构完整、科学结果可计算的延续脉冲进入主图和正式导出；低于 500 mA·g⁻¹ 保持旧规则。

**Architecture:** Neware profile 继续负责 CanonicalRow 事件分段和协议证据，但将高电流筛选所需的 pulse id 集合显式传入。profile 使用已有 `medianVoltageV` 选择到中值电压边界的事件，并给事件增加来源标记；产品 profile 再将合格延续事件纳入主比较资格。分析管线、主图和导出全部消费同一份已筛选结果序列，Endpoint、ΔEt、ΔEs、DCR 和 CFx_10s 数值计算不变。

**Tech Stack:** TypeScript, React, Vitest, Vite, 现有 Neware CanonicalRow / GITT / CFₓ profile / XLSX export 代码。

## Global Constraints

- 高电流启用条件固定为 `equivalentSpecificCurrentMahPerG >= 500`。
- 高电流边界使用 NDAX 已有 `GittResultV1.medianVoltageV` 和程序声明 `stopVoltageV`。
- 放电边界为 `pulseMedianVoltageV <= stopVoltageV + existingCutoffToleranceV`；边界脉冲保留，后续脉冲不保留。
- `<500 mA·g⁻¹` 继续使用第一次原始轨迹 Stop_Volt 截止规则。
- 不把实验协议 1.5 V 改成 1.0 V。
- 不修改 Endpoint、ΔEt、ΔEs、WH、DCR、CFx_10s、回归窗口、几何、质量和协议参数。
- 不使用文件名、绝对通道电流、XLSX 聚合值或新的瞬时电压阈值判断高电流。
- 不对缺失中值电压、缺失 Rest、缺失 loaded t=0 或不可计算结果静默降级。
- 保留现有未提交用户改动；不得创建分支或 worktree；只提交本功能明确修改的文件。

---

### Task 1: 锁定高电流筛选与边界的失败测试

**Files:**
- Modify: `src/adapters/neware/gitt1200sProfile.test.ts`
- Modify: `src/product/cfx/literature1200sGittProfile.test.ts`
- Modify: `src/app/analyze.recipe.integration.test.ts`

**Interfaces:**
- Consumes: 当前 `buildNewareCfxGitt1200sProfile`, `analyzeCfxLiterature1200sGittProfile` 和分析测试 fixture。
- Produces: 红灯测试，固定阈值、边界包含关系、低电流兼容性和不可计算排除规则。

- [ ] **Step 1: 写 Neware profile 的失败测试**

在 `src/adapters/neware/gitt1200sProfile.test.ts` 增加以下行为断言，使用现有测试 fixture 构造三个连续事件：第一个事件原始轨迹已到 Stop_Volt、第二个事件中值电压仍高于边界、第三个事件中值电压等于边界；三个事件均有完整 Rest。

```ts
it('retains high-current continuation events through the first pulse median-voltage boundary', () => {
  const results = [
    makeGittResult({ pulseId: 'pulse-1', medianVoltageV: 1.80 }),
    makeGittResult({ pulseId: 'pulse-2', medianVoltageV: 1.62 }),
    makeGittResult({ pulseId: 'pulse-3', medianVoltageV: 1.505 }),
    makeGittResult({ pulseId: 'pulse-4', medianVoltageV: 1.48 }),
  ];
  const profile = buildNewareCfxGitt1200sProfile(datasetFor(results), results, {
    highCurrentPulseIds: new Set(['pulse-1', 'pulse-2', 'pulse-3', 'pulse-4']),
  });

  expect(profile.events.map((event) => event.sourcePulseId)).toEqual([
    'pulse-1', 'pulse-2', 'pulse-3',
  ]);
  expect(profile.events[1].isPostCutoffContinuation).toBe(true);
  expect(profile.events[2].pulseMedianVoltageV).toBe(1.505);
  expect(profile.summary.firstMedianBoundarySourcePulseId).toBe('pulse-3');
});
```

这里的 `1.505` 必须使用现有 `0.005 V` 截止容差，测试确认边界脉冲被保留、边界之后的 `pulse-4` 被排除。

- [ ] **Step 2: 写低电流兼容性失败测试**

```ts
it('keeps the legacy first-raw-cutoff behavior below 500 mA/g', () => {
  const results = [
    makeGittResult({ pulseId: 'pulse-1', medianVoltageV: 1.80 }),
    makeGittResult({ pulseId: 'pulse-2', medianVoltageV: 1.62 }),
    makeGittResult({ pulseId: 'pulse-3', medianVoltageV: 1.505 }),
  ];
  const profile = buildNewareCfxGitt1200sProfile(datasetFor(results), results, {
    highCurrentPulseIds: new Set(),
  });

  expect(profile.events.map((event) => event.sourcePulseId)).toEqual(['pulse-1']);
  expect(profile.summary.firstMedianBoundarySourcePulseId).toBeNull();
});
```

- [ ] **Step 3: 写边界数据失败测试**

增加三个单独测试：

```ts
it('does not extend when no qualified median-voltage boundary exists', () => {
  // first raw cutoff exists; every later median voltage is null or above the boundary
  expect(profile.events).toHaveLength(1);
});

it('does not include a continuation event with incomplete post-rest', () => {
  // median boundary is present but the boundary event has file_end_truncated rest
  expect(profile.events.at(-1)?.postRestState).not.toBe('file_end_truncated');
});

it('uses the existing equivalent-specific-current threshold at exactly 500 mA/g', () => {
  const fractionFor500 = (500 * 1200) / (865 * 3600);
  const fractionFor499 = (499.999 * 1200) / (865 * 3600);
  expect(deriveEquivalentSpecificCurrentMahPerG(865, 1200, fractionFor500)).toBeCloseTo(500, 10);
  expect(deriveEquivalentSpecificCurrentMahPerG(865, 1200, fractionFor499)).toBeCloseTo(499.999, 10);
});
```

实际 fixture 中必须通过现有 result 字段计算比电流，不能在生产代码中直接用测试 helper 代替。

- [ ] **Step 4: 写 CFₓ product profile 的失败测试**

```ts
it('makes a selected high-current continuation numerically available with a review protocol status', () => {
  const result = analyzeCfxLiterature1200sGittProfile({
    material: cf1,
    activeMassG: 0.001,
    pulseResults: [sourcePulse({
      pulseId: 'continuation',
      pulseDurationS: 300,
      medianVoltageV: 1.505,
      programEvent: highCurrentContinuationEvent(),
    })],
  });

  expect(result.pulses[0]).toMatchObject({
    eventClassification: 'high_current_post_cutoff_continuation',
    protocolStatus: 'review',
    numericalState: 'computed',
    comparativeUse: 'available_with_model_warnings',
  });
  expect(result.pulses[0].transportComparison.dAppCandidateCm2PerS).toBe(1.2e-10);
});
```

- [ ] **Step 5: 运行以上测试确认按预期失败**

运行：

```text
npm test -- --run src/adapters/neware/gitt1200sProfile.test.ts src/product/cfx/literature1200sGittProfile.test.ts src/app/analyze.recipe.integration.test.ts
```

预期：新增断言失败，原因应是现有接口没有高电流边界字段/筛选语义，而不是 TypeScript 拼写或 fixture 错误。

### Task 2: 实现共享比电流判定和 Neware 中值电压边界

**Files:**
- Modify: `src/product/cfx/literature1200sGittProfile.ts`
- Modify: `src/product/cfx/index.ts`
- Modify: `src/adapters/neware/gitt1200sProfile.ts`
- Modify: `src/adapters/neware/gitt1200sProfile.test.ts`

**Interfaces:**
- Consumes: `GittResultV1.pulseCapacityFraction`, `pulseDurationS`, 材料理论比容量和现有 Neware program evidence。
- Produces: `deriveEquivalentSpecificCurrentMahPerG`, `NewareGitt1200sProfileOptionsV1`, `pulseMedianVoltageV`、`isPostCutoffContinuation`、中值边界摘要字段。

- [ ] **Step 1: 提取唯一的比电流计算函数**

在 `src/product/cfx/literature1200sGittProfile.ts` 中提取并导出：

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

用它替换当前 `profilePulse` 内的重复计算，并在 `src/product/cfx/index.ts` 重新导出。添加常量：

```ts
export const HIGH_CURRENT_CONTINUATION_THRESHOLD_MA_G = 500;
```

不要把阈值分散到 adapter、UI 或 export 文件中。

- [ ] **Step 2: 扩展 Neware 事件契约**

在 `NewareGitt1200sEventV1` 增加：

```ts
pulseMedianVoltageV: number | null;
isPostCutoffContinuation: boolean;
```

在 profile summary 增加：

```ts
firstMedianBoundarySourcePulseId: string | null;
highCurrentContinuationCount: number;
```

新增选项：

```ts
export type NewareGitt1200sProfileOptionsV1 = {
  highCurrentPulseIds?: ReadonlySet<string>;
};
```

`highCurrentPulseIds` 的默认值为空集合，确保旧调用保持旧规则。

- [ ] **Step 3: 实现中值电压边界选择**

在现有 `events` 全部生成后，保持原始 `firstCutoffIndex` 计算不变。新增选择逻辑：

```ts
const highCurrentPulseIds = options.highCurrentPulseIds ?? new Set<string>();
const firstMedianBoundaryIndex = firstCutoffIndex < 0
  ? -1
  : events.findIndex((event, index) =>
    index >= firstCutoffIndex &&
    highCurrentPulseIds.has(event.sourcePulseId) &&
    finite(event.pulseMedianVoltageV) &&
    finite(event.program.stopVoltageV) &&
    event.pulseMedianVoltageV <= event.program.stopVoltageV +
      NEWARE_CFX_GITT_1200S_PROGRAM_PROFILE_V1.voltageCutoffToleranceV,
  );
const selectionBoundaryIndex = firstMedianBoundaryIndex >= 0
  ? firstMedianBoundaryIndex
  : firstCutoffIndex;
const retainedEvents = selectionBoundaryIndex >= 0
  ? events.slice(0, selectionBoundaryIndex + 1)
  : events;
```

这里仅对放电方向实现当前已确认规则；不能把 null 中值电压当作达到边界。`pulseMedianVoltageV` 直接来自 `result.medianVoltageV`。`isPostCutoffContinuation` 由事件在 `firstCutoffIndex` 之后的位置决定，不由 UI 推断。

- [ ] **Step 4: 让 profile event 标出延续来源并补 summary**

在生成事件时填充 `pulseMedianVoltageV`。在保留事件前，根据 `firstCutoffIndex` 设置 `isPostCutoffContinuation`。summary 的 `firstMedianBoundarySourcePulseId` 使用 `firstMedianBoundaryIndex`，`highCurrentContinuationCount` 统计保留事件中 `isPostCutoffContinuation` 的数量。

- [ ] **Step 5: 运行 adapter/product 测试确认变绿**

运行：

```text
npm test -- --run src/adapters/neware/gitt1200sProfile.test.ts src/product/cfx/literature1200sGittProfile.test.ts
```

预期：新增测试和原有测试全部通过。

### Task 3: 将分析管线切换到统一筛选序列

**Files:**
- Modify: `src/app/analyze.ts`
- Modify: `src/app/analyze.recipe.integration.test.ts`
- Modify: `src/adapters/neware/gitt1200sProfile.test.ts`

**Interfaces:**
- Consumes: Task 2 的共享比电流函数和 profile options。
- Produces: `analysis.gittResults` 包含标准事件与合格高电流延续事件；不合格延续事件不进入结果数组。

- [ ] **Step 1: 在分析前建立高电流 pulse id 集合**

在 CFₓ 分析分支调用 Neware profile 前，使用同一份材料比容量和每个 `GittResultV1` 的 `pulseDurationS`、`pulseCapacityFraction` 计算：

```ts
const highCurrentPulseIds = new Set(
  gittResults
    .filter((result) =>
      (deriveEquivalentSpecificCurrentMahPerG(
        settings.material.theoreticalSpecificCapacityMahPerG,
        result.pulseDurationS,
        result.pulseCapacityFraction,
      ) ?? -Infinity) >= HIGH_CURRENT_CONTINUATION_THRESHOLD_MA_G,
    )
    .map((result) => result.pulseId),
);
const programExecution = buildNewareCfxGitt1200sProfile(dataset, gittResults, {
  highCurrentPulseIds,
});
```

这保证阈值使用当前产品 profile 已有的等效比电流定义，而不是文件名或绝对电流。

- [ ] **Step 2: 保持同一批 retained ids 驱动科学结果和产品 profile**

继续用 `programExecution.events` 生成 `retainedPulseIds`，过滤 `gittResults`；然后用同一份 `programEventByPulseId` 传给 CFₓ product profile。不得在 product profile、UI 和 export 中再各自截断一次。

- [ ] **Step 3: 添加集成失败测试并运行**

在 recipe integration fixture 中加入：首次原始 cutoff、两个后续 pulse，其中一个中值电压高于边界、一个等于边界、再加一个边界后的 pulse。断言：

```ts
expect(recipeAnalysis.gittResults.map((result) => result.pulseId)).toEqual([
  'pulse-1', 'pulse-2', 'pulse-3',
]);
expect(recipeAnalysis.cfxLiterature1200s?.programExecution.summary.highCurrentContinuationCount).toBe(2);
```

再用等效比电流 499.999 mA·g⁻¹ 的 fixture 断言结果只到原始第一次 cutoff。

- [ ] **Step 4: 运行管线测试确认变绿**

运行：

```text
npm test -- --run src/app/analyze.recipe.integration.test.ts src/adapters/neware/gitt1200sProfile.test.ts
```

预期：全部通过，且标准事件在过滤前后的 Endpoint、ΔEt、ΔEs、medianVoltage、pulseDuration 和 DCR 不发生变化。

### Task 4: 放开 CFₓ product profile 对合格延续事件的主比较资格

**Files:**
- Modify: `src/product/cfx/literature1200sGittProfile.ts`
- Modify: `src/product/cfx/literature1200sGittProfile.test.ts`
- Modify: `src/components/workbench/StatusBadge.tsx`

**Interfaces:**
- Consumes: `programEvent.isPostCutoffContinuation` 和已有科学结果状态。
- Produces: `eventClassification='high_current_post_cutoff_continuation'`，可计算的主比较结果，且保留 review 警告。

- [ ] **Step 1: 扩展分类和统计类型**

在 `CfxLiterature1200sPulseProfileResultV1.eventClassification` 增加：

```ts
'high_current_post_cutoff_continuation'
```

在 `protocolStatus` 使用已有 `'review'` 表达“可计算但不是标准 1200 s 协议事件”。在 summary 增加：

```ts
highCurrentContinuationPulseCount: number;
highCurrentContinuationIncludedCount: number;
```

- [ ] **Step 2: 让延续事件进入数值结果但不伪装成完整 1200 s**

在 `classifyEvent` 中优先判断 `programEvent?.isPostCutoffContinuation`，返回高电流延续分类。`complete1200sPulseCount` 仍只统计 `complete_1200s_standard_rest`。

在 `profilePulse` 中定义，并让主比较资格使用这个条件：

```ts
const eligibleEvent =
  eventClassification === 'complete_1200s_standard_rest' ||
  eventClassification === 'high_current_post_cutoff_continuation';
const canCalculateIndex =
  eligibleEvent &&
  finite(pulse.diagnosticCandidateMetricValueCm2PerS) &&
  pulse.diagnosticCandidateMetricValueCm2PerS > 0 &&
  primaryComparisonEligibility !== 'excluded';
```

同时把当前 `primaryComparisonEligibility` 中的 `!complete` 条件改为 `!eligibleEvent`，否则延续事件虽然有数值仍会被产品层排除。

延续事件的 `protocolStatus` 为 `review`，`comparativeUse` 可以是 `available_with_model_warnings`，并添加明确 warning：这是 1.5 V 截止后的高电流延续，不与标准 1200 s 事件作无条件协议等价解释。

- [ ] **Step 3: 更新状态显示文本**

在 `src/components/workbench/StatusBadge.tsx` 增加 `high_current_post_cutoff_continuation` 的中文显示，例如“高电流延续”，并保留 review 色调，不把它显示为“完整 1200 s”。

- [ ] **Step 4: 运行 product profile 测试**

运行：

```text
npm test -- --run src/product/cfx/literature1200sGittProfile.test.ts
```

预期：标准事件统计保持不变，延续事件可计算并能提供 WH 结果。

### Task 5: 让主图、事件表和导出消费统一的合格结果

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/product/gitt/literaturePlotModel.ts`
- Modify: `src/app/exportRows.ts`
- Modify: `src/components/workbench/ResultsTable.tsx`
- Modify: `src/components/workbench/GittLiteratureDiagnostics.tsx`
- Modify: `src/components/workbench/BatchTrendPlot.tsx` only if an existing point-state test requires a shared helper change
- Test: `src/product/gitt/literaturePlotModel.test.ts`
- Test: `src/app/exportRows.test.ts`
- Test: `src/components/workbench/BatchTrendPlot.test.ts`

**Interfaces:**
- Consumes: `analysis.gittResults`、`programExecution.events`、product profile pulses。
- Produces: 主图和正式导出的点与统一 retained sequence 一致；延续点进入主图，排除点不进入。

- [ ] **Step 1: 用最后一个保留事件替代 UI 的第一次原始 cutoff 截断**

把 `rowsThroughFirstGittCutoff` 改为 `rowsThroughGittSelectionBoundary`。优先使用 `program.events.at(-1)?.postRestAnalysisStepId` 或 `pulseAnalysisStepId` 确定最后保留行；没有 profile event 时返回原 rows。这样高电流中值边界后的完整轨迹不会再被 UI 砍回第一次原始 cutoff。

- [ ] **Step 2: 统一主图合格点判定**

新增一个只读 helper，例如：

```ts
function isMainCfxPulse(
  pulse: CfxLiterature1200sPulseProfileResultV1,
): boolean {
  return pulse.primaryComparisonEligibility !== 'excluded' &&
    pulse.comparativeUse === 'available_with_model_warnings';
}
```

`gittVoltageMetricPoints`、`gittMedianDli`、主序列事件筛选都使用这个 helper；删除仅比较 `eventClassification === 'complete_1200s_standard_rest'` 的旧条件。标准事件和合格延续事件都必须同时通过现有 `isWhVoltageMetricPointEligible(result)`。

- [ ] **Step 3: 保留事件表中的来源标记**

事件表增加或显示：

```text
sequenceClassification
pulseMedianVoltageV
highCurrentContinuation
primaryComparisonEligibility
```

延续事件显示“高电流延续”，不显示为“完整 1200 s”。主序列筛选中它仍能出现，截止后的不合格事件仍不能出现。

- [ ] **Step 4: 更新导出行和图表数据**

`buildAuditExportRows`、`cfxProfileRows`、`gittMedianDli` 和三部分 GITT 绘图导出使用同一个合格 pulse 集合。为导出追加：

```text
Pulse median voltage / V
High-current continuation / boolean
Sequence selection boundary / string
```

不得重新计算 D、ΔEt 或 ΔEs；导出直接读取 `GittResultV1` 已有字段。

- [ ] **Step 5: 写 UI/export 回归测试并运行**

断言：

```ts
expect(mainTrendPoints.map((point) => point.id)).toContain('continuation');
expect(mainTrendPoints.map((point) => point.id)).not.toContain('after-boundary');
expect(exportRows.find((row) => row.resultId === 'continuation')?.sequenceClassification)
  .toBe('high_current_post_cutoff_continuation');
```

运行：

```text
npm test -- --run src/product/gitt/literaturePlotModel.test.ts src/app/exportRows.test.ts src/components/workbench/BatchTrendPlot.test.ts
```

预期：主图和导出点数一致，线按每个文件自己的 `seriesOrder` 连续绘制；低电流旧 fixture 不增加点。

### Task 6: 更新 Manifest、版本说明和项目测试

**Files:**
- Modify: `src/app/analyze.ts`
- Modify: `src/app/exportRows.ts`
- Modify: `src/science/versions.ts`
- Modify: `README.md`
- Modify: `docs/RELEASE_NOTES_0.1.0-beta.1.md`
- Modify: `src/app/project.test.ts` only if manifest snapshots require explicit new fields

**Interfaces:**
- Consumes: Task 2–5 的实际 profile 版本和事件来源字段。
- Produces: 可追溯的分析配置、导出字段和版本语义。

- [ ] **Step 1: 在分析配置中记录边界策略**

在 GITT config snapshot / Manifest 中写入：

```text
highCurrentContinuationPolicy = median_voltage_boundary
highCurrentContinuationThresholdMahPerG = 500
highCurrentContinuationCutoffToleranceV = existing profile voltageCutoffToleranceV
```

只有 CFₓ GITT profile 写入这些字段；非 CFₓ 分析不写入高电流策略。

- [ ] **Step 2: 更新 profile/version 标识**

只提升 Neware CFₓ profile 和产品 CFₓ profile 的版本号，明确这是事件筛选语义变化，不提升 GITT 数学算法版本，不改变 DCR 版本。

- [ ] **Step 3: 更新 README 和 release notes**

说明：≥500 mA·g⁻¹ 使用脉冲中值电压边界，边界内结构完整且可计算的延续事件进入主图和导出；<500 mA·g⁻¹保持旧规则；实验 Stop_Volt 仍为文件声明值。

- [ ] **Step 4: 运行类型检查和完整测试**

运行：

```text
npm run typecheck
npm test -- --run --pool=threads=false
npm run build
```

预期：类型检查通过、全套测试 0 失败、构建退出码为 0；若构建只出现既有 chunk-size warning，单独记录，不把 warning 当作失败。

### Task 7: 用真实高电流 NDAX 做验收

**Files:**
- Create: `analysis/high-current-median-boundary/2026-09-17-real-data-report.md`
- Test: `tests/qualification/high-current-median-boundary.test.ts`

**Interfaces:**
- Consumes: 两个用户已提供的真实 500 mA·g⁻¹ NDAX 文件及 Task 6 的分析结果。
- Produces: 可复核的真实数据点数、边界脉冲、主图/导出一致性报告。

- [ ] **Step 1: 运行真实数据资格测试**

测试文件读取：

```text
F:\520GITT 500ma - 副本\FGS-GITT-500ma-0.568mg-1_127.0.0.1-BTS85-23-8-4-1020.ndax
F:\520GITT 500ma - 副本\FGS-GITT-500ma-0.64mg-3_127.0.0.1-BTS85-23-8-6-1022.ndax
```

对每个文件记录：原始 pulse 总数、第一次原始 cutoff、首个中值电压边界、保留 pulse 总数、高电流延续数、进入主图数、导出数、缺失 Rest 数和缺失 loaded t=0 数。

- [ ] **Step 2: 核对科学字段零回归**

对边界前的共同 pulse 逐项比较修改前基线与修改后：

```text
Endpoint D
ΔEt
ΔEs
medianVoltageV
pulseDurationS
DCR
CFx_10s slope / R² / RMSE / point count
```

要求共同 pulse 的上述字段 0 regression；新增加的延续 pulse 只允许新增结果，不得改变共同 pulse 的数值。

- [ ] **Step 3: 生成报告并检查导出**

报告至少包含：

- 两个文件的中值电压边界和保留序列；
- 哪些 pulse 进入主图/正式导出及原因；
- 主图点数与导出点数一致性；
- 不合格延续 pulse 的排除原因；
- 低于阈值 fixture 的旧规则验证；
- 计算公式与本轮未修改字段清单。

- [ ] **Step 4: 运行最终验证命令**

运行：

```text
npm test -- --run tests/qualification/high-current-median-boundary.test.ts
npm run typecheck
npm run build
git diff --check
```

预期：资格测试、类型检查、构建和空白检查全部通过；最终只报告实际通过/失败数量，不声称工作区整体干净，因为工作区存在其他用户改动。
