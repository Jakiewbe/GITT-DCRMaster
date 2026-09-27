# GITT loaded t=0 Endpoint Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将生产 Endpoint 的 pulse 起点改为 CanonicalRow 物理时间轴中的 loaded `t=0`，并完成 3 个真实 NDAX 的 before/after 审计，不改变冻结的 GITT 其他量或 DCR。

**Architecture:** 复用 `aggregateUniqueTicks` 和 `buildPulseTimeline`，在 GITT analysis 内先确定 pulse 方向，再从已经合并的物理时间点选择 loaded t=0。主 Endpoint 使用新点；first-positive 点只保留为 legacy diagnostic。生产分析从 CanonicalRow/NDAX 直接计算，Step Summary XLSX 只作为独立 oracle。

**Tech Stack:** TypeScript、Vitest、React、Vite、现有 Neware NDAX adapter、Node analysis scripts、Markdown audit report。

## Global Constraints

- 不创建 branch/worktree，不重置或覆盖现有 dirty worktree，不修改无关文件。
- 不改变 `diagnoseRest`、Theil–Sen、CFx_10s 的 `0 < t <= 64 s` 选点、slope window、geometry、protocol/cutoff、active-mass resolution 或 DCR 算法。
- loaded t=0 必须基于 CanonicalRow 的物理时间轴、现有聚合和现有 current-resolution/direction 逻辑；不得使用 `time === 0` 裸浮点判断或新 magic threshold。
- 缺少合格 loaded t=0 时，主 Endpoint 必须 `not_computable`，不得 fallback 到 first-positive。
- Step Summary/XLSX 不进入生产计算依赖，只用于 audit/oracle。
- 保留旧 `initialObservedDropV` 的 pre-rest→first-positive 语义，不能静默换义。
- 版本更新为 `GITT_ALGORITHM.version = 1.1.0`、`SCIENTIFIC_CONTRACT_VERSION = 1.5.0`；Manifest 结构版本只有在结构真的改变时才升级。

---

### Task 1: 建立旧版真实数据 baseline 和审计脚手架

**Files:**
- Create: `tests/qualification/gitt-t0-endpoint-migration.test.ts`
- Create: `analysis/gitt-t0-endpoint-migration/README.md`
- Output: `analysis/gitt-t0-endpoint-migration/baseline-before.json`

**Interfaces:**
- Consumes: `normalizeNewareNdax`, `buildNewareGittPulses`, `analyzeNewareDataset`, `createCf1MaterialPreset`。
- Produces: 每个保留 pulse 的旧 `deltaEtV`、旧 Endpoint D、旧 first-positive 点、冻结字段、raw trace 对照所需数据。

- [ ] **Step 1: 写 baseline runner**

  使用当前 3 个源文件：

  ```text
  260429 GITT/CFx-GITT-200ma-1.032mg-2_127.0.0.1-BTS85-23-8-6-868.ndax
  260429 GITT/CFx-GITT-200ma-1.096mg-8_127.0.0.1-BTS85-23-8-8-870.ndax
  260429 GITT/CFx-GITT-200ma-1.152mg-9_127.0.0.1-BTS85-23-8-7-869.ndax
  ```

  runner 只调用现有生产入口，将每个 `analysis.gittResults` 记录为 JSON；另保存 source hash、active mass、pulse input 的 `preRestRows/pulseRows/postRestRows`、Step Summary 可复算的首末点和中值电压。BigInt 序列化为十进制字符串，禁止写入 XLSX 作为计算输入。

- [ ] **Step 2: 运行 baseline**

  Run: `npm test -- --run tests/qualification/gitt-t0-endpoint-migration.test.ts`

  Expected: 生成 `baseline-before.json`，包含 3 个 NDAX，且每个 pulse 至少有旧 `deltaEtV`、`metricValueCm2PerS`、`deltaEsV`、`medianVoltageV`、`pulseEndVoltageV` 和 `pulseDurationS`。

- [ ] **Step 3: 写基线说明**

  `README.md` 明确说明：baseline 是修改前生产入口的快照；Step Summary 只做 oracle；本目录不改变原始 NDAX。

### Task 2: 先写 t=0 失败测试

**Files:**
- Modify: `src/science/gitt/analyze.test.ts`
- Create: `src/science/gitt/endpointSelection.test.ts`

**Interfaces:**
- Consumes: 现有 `makeInput`、`canonicalRow`、`analyzeGittPulse`。
- Produces: 红灯测试，锁定新 Endpoint 语义和缺失点的 fail-closed 行为。

- [ ] **Step 1: 添加 t=0 主点测试**

  在 `analyze.test.ts` 增加测试：pulse 时间 `[0, 10, 20, 30, 40]` 时，期望 `pulseStartVoltageV`/新 `pulseT0VoltageV` 为 t=0 电压，`deltaEtV = pulseEndVoltageV - t0VoltageV`，而不是 t=10 电压。

- [ ] **Step 2: 添加 missing/zero/direction 测试**

  在 `endpointSelection.test.ts` 建立四组输入：

  ```ts
  expect(result.metricValueCm2PerS).toBeNull();
  expect(result.deltaEtV).toBeNull();
  expect(result.qcCodes).toContain('ENDPOINT_LOADED_T0_MISSING');
  ```

  分别覆盖：无 t=0；t=0 电流为零；t=0 电流方向与 pulse 相反；t=0 电压有效但电流不满足现有 resolution。每组都验证 first-positive diagnostic 仍可保存，但不能形成主 Endpoint。

- [ ] **Step 3: 添加重复 t=0 测试**

  在同一 `analysisStepId` 放两条同物理 t=0、不同电压和相同非零方向电流的 CanonicalRow，期望 t=0 电压为现有聚合平均值，source row count/row ids 保留，不能因为 Endpoint 再产生第二个 t=0。

- [ ] **Step 4: 添加 signed ΔEt 和诊断分解测试**

  验证 `deltaEtV = end - t0`；验证：

  ```ts
  preRestToFirstPositiveDropV
    ≈ onsetObservedDropV + earlyPolarizationDropV
  ```

  并验证 `initialObservedDropV` 仍等于 pre-rest→first-positive，而不是 pre-rest→t=0。

- [ ] **Step 5: 运行红灯测试**

  Run: `npm run test:run -- src/science/gitt/analyze.test.ts src/science/gitt/endpointSelection.test.ts`

  Expected: FAIL，失败原因必须是现有实现仍选择 first-positive 或尚未产生新字段；不得因为测试文件语法或 fixture 错误失败。

### Task 3: 接入 current resolution 并实现 loaded t=0 选择

**Files:**
- Modify: `src/science/contracts.ts: GittAnalysisConfigV1, GittResultV1`
- Modify: `src/adapters/neware/events.ts: buildNewareGittPulses`
- Modify: `src/app/analyze.ts: analyzeNewareDataset`
- Modify: `src/science/gitt/analyze.ts: analyzeGittPulse`
- Create: `src/science/gitt/endpoint.ts`
- Test: `src/science/gitt/endpointSelection.test.ts`

**Interfaces:**
- Produces `findLoadedPulseT0Point(timeline: TimedPulsePoint[], currentResolutionA: number | null, pulseDirection: number): { point: TimedPulsePoint | null; reason: 'ok' | 'missing' | 'not_loaded' | 'direction_conflict' }`。
- `GittAnalysisConfigV1` 增加 `currentResolutionA: number | null` 和可选 `currentResolutionEvidence`，使用与 DCR 相同的 `MeasurementResolutionEvidenceV1`。
- `GittResultV1` 增加 `pulseT0VoltageV`、`endpointStartTimeS`、三段 early-response 字段、legacy first-positive Endpoint 字段、raw Es 审计字段。

- [ ] **Step 1: 实现 selector 的失败后最小代码**

  `endpoint.ts` 只接收已经由 `aggregateUniqueTicks` 形成的 `TimedPulsePoint[]`。零点使用 `stepElapsedTimeNs === 0n` 的物理时间表示；若时间轴没有 step time，则使用 `timeS` 对应的既有时间轴结果和 `maximumResolutionSeconds` 进行有限容差判定，不新建时间归一化。加载判据为：finite current、`currentResolutionA > 0` 时 `abs(currentA) > currentResolutionA`，以及 `Math.sign(currentA) === pulseDirection`。`currentResolutionA` 缺失或无效时不能证明 loaded，返回 `not_loaded`。

- [ ] **Step 2: 在 analyze 中先算 pulse direction**

  在计算 t=0 前，从 `timeline.map(point => point.currentA)` 使用现有 median 逻辑得到 `medianPulseCurrentA` 和方向。然后调用 selector。保留 `firstPositivePulseTimeS`/`firstPositivePulseVoltageV` 的原有选择；不让 selector 修改 regression timeline。

- [ ] **Step 3: 接入 Neware current evidence**

  `buildNewareGittPulses` 先把自动解析得到的 `measurementResolution.currentA.value` 和 evidence 放入每个 GITT config；`analyzeNewareDataset` 再像 DCR 路径一样用最终选定的 `measurementResolution.currentA` 覆盖 GITT config，从而尊重已有用户 current-resolution override。同步补齐 synthetic/test config。current resolution 的 evidence 使用现有来源，不添加固定 `1e-...` 阈值。

- [ ] **Step 4: 运行 selector/analyze 测试**

  Run: `npm run test:run -- src/science/gitt/endpointSelection.test.ts src/science/gitt/analyze.test.ts`

  Expected: Task 2 的红灯变为 PASS；t=0 缺失、零电流和方向冲突均不产生主 Endpoint。

### Task 4: 改变 Endpoint 主计算，保留 legacy diagnostic

**Files:**
- Modify: `src/science/gitt/analyze.ts`
- Modify: `src/science/gitt/qcModel.ts`
- Modify: `src/science/qc.ts`
- Test: `src/science/gitt/analyze.test.ts`, `src/science/gitt/qcModel.test.ts`

**Interfaces:**
- Consumes: selector result、现有 robust rest endpoint、现有 regression window result。
- Produces: 新主 `deltaEtV`/`metricValueCm2PerS`，旧 first-positive Endpoint 只作 diagnostic；新增稳定 QC reason code。

- [ ] **Step 1: 提取唯一 WH 计算 helper**

  在 `analyze.ts` 内提取本地纯函数：

  ```ts
  function calculateEndpointD(
    lengthCm: number | null,
    pulseDurationS: number | null,
    deltaEsV: number | null,
    deltaEtV: number | null,
  ): number | null
  ```

  它只在全部输入 finite、duration > 0、`deltaEtV !== 0` 时返回 `4 / (Math.PI * pulseDurationS) * lengthCm ** 2 * (deltaEsV / deltaEtV) ** 2`，否则返回 null。新主值和 legacy diagnostic 共用它。

- [ ] **Step 2: 切换主值**

  `pulseT0VoltageV` 合格时，`deltaEtV = pulseEndVoltageV - pulseT0VoltageV`；否则 null。`diagnosticCandidateMetricValueCm2PerS` 和最终 `metricValueCm2PerS` 只使用新 deltaEt。`observedDeltaEAtTauV`、Endpoint consistency、uncertainty 中直接依赖 ΔEt 的值随主 ΔEt 更新。

- [ ] **Step 3: 计算 legacy 字段**

  使用旧 first-positive 点计算 `legacyFirstPositiveDeltaEtV` 和 `legacyFirstPositiveEndpointMetricValueCm2PerS`。当新旧 D 均 finite 且 >0 时计算 `endpointDRatioVsLegacy = new / legacy`；否则为 null。`deltaEtDefinitionDifferenceV = new - legacy` 只在两边 finite 时计算。

- [ ] **Step 4: 添加稳定 QC**

  新增并映射：`ENDPOINT_LOADED_T0_MISSING`、`ENDPOINT_T0_NOT_LOADED`、`ENDPOINT_T0_DIRECTION_CONFLICT`。将它们纳入 primary endpoint hard rejection；不修改既有 QC threshold。`wh_metric_not_computable` 仍由主 D null 触发。`methodDivergenceDecades` 继续使用 `log10(D_slope_10s) - log10(D_endpoint_new)`。

- [ ] **Step 5: 运行 science tests**

  Run: `npm run test:run -- src/science/gitt src/science/qc.ts`

  Expected: 所有 GITT/QC 测试 PASS；若既有测试中的数值断言依赖旧 t>0，应只按新 oracle 修改这些断言，并保留 explicit legacy assertions。

### Task 5: 加入 raw Es audit 和时间字段语义

**Files:**
- Modify: `src/science/gitt/analyze.ts`
- Modify: `src/science/contracts.ts`
- Test: `src/science/gitt/analyze.test.ts`

**Interfaces:**
- Produces: `preRestLastRawVoltageV`、`postRestLastRawVoltageV`、`deltaEsRawV`、`restEstimatorDifferencePreV`、`restEstimatorDifferencePostV`、`endpointStartTimeS`。

- [ ] **Step 1: 选择审计用 raw rest 尾点**

  对输入 rest rows 按已有物理时间排序，取最后有效记录电压；同一物理时间仍使用现有 Canonical/aggregation 结果，确保重复记录不会产生随机选择。该字段只写 audit，不进入 `deltaEsV`。

- [ ] **Step 2: 计算 raw Es 和 estimator difference**

  ```ts
  deltaEsRawV = postRestLastRawVoltageV - preRestLastRawVoltageV;
  restEstimatorDifferencePreV = preRestEndPotentialV - preRestLastRawVoltageV;
  restEstimatorDifferencePostV = postRestEndPotentialV - postRestLastRawVoltageV;
  ```

  任一输入缺失时对应结果为 null。

- [ ] **Step 3: 保留旧语义**

  `initialObservedDropV` 继续写 `preRestEndPotentialV - firstPositivePulseVoltageV`；`endpointStartTemporalResolutionS` 继续写 first-positive time；新增 `endpointStartTimeS` 只在 t=0 loaded 时为 0。

- [ ] **Step 4: 运行测试**

  Run: `npm run test:run -- src/science/gitt/analyze.test.ts`

  Expected: PASS，且 raw Es 不改变 `deltaEsV`。

### Task 6: 更新 export、Manifest、UI 和版本

**Files:**
- Modify: `src/app/exportRows.ts`
- Modify: `src/App.tsx`
- Modify: `src/components/workbench/GittLiteratureDiagnostics.tsx`
- Modify: `src/science/versions.ts`
- Modify: `src/science/qc.ts`
- Test: `src/app/exportRows.test.ts`, `src/product/gitt/literaturePlotModel.test.ts`, `src/app/analyze.recipe.integration.test.ts`

**Interfaces:**
- Export keys follow existing project naming and add all required Endpoint audit fields without changing production calculation source.
- Manifest rows add `endpointPulseStartDefinition=loaded_t0_record`, `endpointDeltaEtDefinition=pulse_end_minus_loaded_t0`, `restEndDefinition=theil_sen_tail_endpoint`, `firstPositivePulsePointRole=diagnostic_only`。

- [ ] **Step 1: 更新版本**

  将 `GITT_ALGORITHM.version` 改为 `1.1.0`，`SCIENTIFIC_CONTRACT_VERSION` 改为 `1.5.0`，保持 algorithm id。Manifest 结构未改变时保持 `MANIFEST_SCHEMA_VERSION = 1.0.0`。

- [ ] **Step 2: 更新 GITT Summary export**

  增加：`pulseT0VoltageV`、t=0 current、first-positive time/voltage、pulse end、primary/legacy ΔEt、robust/raw Es、三段 early drop、primary/legacy D 和 ratio。生产 export 从 `GittResultV1` 读取，不读取 audit XLSX。

- [ ] **Step 3: 更新 UI 文案**

  Pulse detail 主区显示 loaded t=0、pulse end、primary ΔEt、robust ΔEs 和 Endpoint D。诊断展开区显示 onset/early drop、first-positive 信息、legacy ΔEt、new/legacy D ratio。禁止出现 IR-free、pure ohmic-corrected 或等价表述。

- [ ] **Step 4: 更新测试和文档契约**

  修改 `src/app/exportRows.test.ts` 的 export assertions，修改 `src/product/gitt/literaturePlotModel.test.ts` 的 Endpoint series assertions，并在 `src/app/analyze.recipe.integration.test.ts` 保持版本/分析身份可追溯；确保旧 `initialObservedDropV` 的列仍是 pre-rest→first-positive，新字段单独出现，Manifest provenance 四项存在且版本已更新。

### Task 7: 重跑真实数据并生成迁移报告

**Files:**
- Modify: `tests/qualification/gitt-t0-endpoint-migration.test.ts`
- Create: `analysis/gitt-t0-endpoint-migration/GITT_T0_ENDPOINT_MIGRATION_REPORT.md`
- Create: `analysis/gitt-t0-endpoint-migration/after.json`
- Create: `analysis/gitt-t0-endpoint-migration/frozen-field-regression.json`

**Interfaces:**
- Consumes: baseline-before.json、当前 production `analyzeNewareDataset`、3 个 NDAX、已有 Step Summary audit workbook。
- Produces: per-pulse before/after JSON、summary stats、Markdown report。

- [ ] **Step 1: 计算 t=0 availability**

  对实际保留 pulse 统计 valid loaded t=0、missing t=0、t=0 current not loaded、direction conflict，并统计 `abs(t0 - firstPositive)` 和 `abs(preRestEnd - t0)` 的 median/IQR/P90/max。

- [ ] **Step 2: 验证 Step Summary oracle**

  对每个 pulse 比较 Step Summary 的首/末字段与 Canonical pulse t=0/末点，输出 N、median absolute error、P90、max、within 0.1 mV、within 1 mV。该比较只能读取 audit 数据，不能被 production import。

- [ ] **Step 3: 生成 before/after 统计**

  输出每个文件和总体的 old/new ΔEt、old/new D、`D_old / D_new` median/P90/max、`log10(D_new / D_old)` median/IQR/P90 absolute/max，并逐一列出三个文件 Pulse 1–3。

- [ ] **Step 4: 检查 frozen fields**

  对每个 retained pulse 严格比较：robust rest endpoints、ΔEs、pulse end、duration、median voltage、geometry/L、CFx_10s selected points/slope/intercept/R²/RMSE/D、legacy first-5 slope、window stability、DCR、protocol/cutoff/mass handling。只允许 Endpoint 直接依赖字段变化；任何冻结字段变化都让 audit 失败。

- [ ] **Step 5: 输出 QC/eligibility impact**

  对比 `primaryEndpointQcStatus`、`primaryComparisonEligibility` 和 reason codes；不为了保持旧数量而调整 threshold 或排除规则。

- [ ] **Step 6: 写报告**

  报告固定包含：定义变更原因、代码文件、科学不变量、t=0 availability、Step Summary validation、ΔEt/D before-after、early decomposition、frozen regression、QC impact、version changes、tests/build/DCR qualification、loaded t=0 的科学局限。

### Task 8: 全量验证并停止

**Files:**
- No additional production changes unless a failure is directly caused by this migration.

- [ ] **Step 1: 运行类型检查**

  Run: `npm run typecheck`

- [ ] **Step 2: 运行全部测试**

  Run: `npm run test:run`

- [ ] **Step 3: 运行 DCR qualification**

  Run: `npm run test:run -- tests/qualification/neware-batch.qualification.test.ts tests/qualification/neware-independent-export-parity.test.ts`

- [ ] **Step 4: 运行 lint 和 build**

  Run: `npm run lint`；Run: `npm run build`。

- [ ] **Step 5: 审阅迁移报告**

  检查报告无占位符、无把 `data_es.ndc` 未验证字段当作事实、无把 loaded t=0 称为纯 IR drop、无把 Step Summary 当生产输入。报告完成后停止，不继续修改 Es、CFx_10s、slope window、QC threshold 或 DCR。
