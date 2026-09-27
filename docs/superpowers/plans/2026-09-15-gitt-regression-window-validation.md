# GITT Regression Window Validation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Execute this plan task-by-task with tests after each task. Do not create a branch or worktree, and do not commit or push changes in this workspace.

**Goal:** 在保持现有 GITT 端点法主值、DCR、Neware 中值电压和 1200/14400 s 协议完全不变的前提下，为每个脉冲增加 legacy first 5、CFx 4–25 s、CFx 1–64 s 和 manual 的 E–√t 多窗口验证结果。

**Architecture:** 复用 `aggregateUniqueTicks`、`buildPulseTimeline` 和现有 `evaluateFit`，新增只负责“窗口定义与选点”的纯函数，再由 `analyze.ts` 做窗口编排和回归 D 计算。`fitDiagnostics` 与 `regressionCandidateMetricValueCm2PerS` 继续作为 legacy 兼容别名；新的 `regressionWindows` 与窗口敏感性只作为独立诊断，不向主 endpoint QC 添加新的 finding。

**Tech Stack:** React + TypeScript + Vite + Vitest + XLSX 导出。

## Global Constraints

- `metricValueCm2PerS` 必须继续使用 `4/(πτ) × L² × (ΔEs/ΔEt)²`。
- `ΔEt`、`ΔEs`、`τ`、`L=mVm/(MS)`、`medianVoltageV`、Neware 1200/14400 s 识别和 1.5 V ±5 mV 截止逻辑不修改。
- `src/science/dcr/*` 不修改。
- 不自动选择最高 R²、最佳 D 或最大线性区。
- 所有固定时间窗口使用 pulse elapsed physical time，不使用数组序号、源行号或全局时间。
- 固定时间窗口不额外删除首点；只有 `legacy_first_5` 删除第一个唯一时间点。
- 小于 5 个唯一时间点的窗口为 `infeasible`，不扩大窗口、不回退到其他窗口。
- 5–7 个唯一点为 `review`；至少 8 个点且既有拟合门槛通过、覆盖完整时才为 `valid`。
- 多窗口 finding 不得改变 endpoint 的既有 QC 结果。
- 保留 `regressionCandidateMetricValueCm2PerS`，并将其定义为 `legacy_first_5` 的兼容别名。

## 文件边界

- Modify `src/science/contracts.ts`: 增加窗口请求、窗口结果和敏感性类型，向后兼容现有结果字段。
- Modify `src/science/gitt/fit.ts`: 增加预定义窗口、按真实时间选点、单窗口评估；保留现有 legacy 选择输出。
- Modify `src/science/gitt/regressionMetric.ts`: 复用已有斜率 D 公式，增加多窗口结果构造所需的纯函数。
- Modify `src/science/gitt/analyze.ts`: 保留原 endpoint 计算，编排默认窗口和 manual 窗口，并输出多窗口结果。
- Modify `src/app/analyze.ts`: 将 manual 窗口配置纳入 GITT 分析输入和配置哈希/Manifest。
- Modify `src/app/project.ts`: 保存和恢复 manual regression window，旧项目缺失该字段时使用 null。
- Modify `src/product/gitt/literaturePlotModel.ts`: 导出每个时间点被哪些窗口使用，并导出窗口汇总字段。
- Modify `src/app/exportRows.ts` and `src/app/reportExport.ts`: 增加逐窗口 D、拟合诊断和敏感性列。
- Modify `src/App.tsx`: 增加小型 regression validation 设置/诊断显示，主图继续使用 endpoint D。
- Add `src/science/gitt/regressionWindows.test.ts`: 选点、边界、manual、覆盖和敏感性测试。
- Modify `src/science/gitt/analyze.test.ts`: endpoint backward compatibility、完整 τ 和“回归全部失败仍保留 endpoint”测试。
- Modify `src/product/gitt/literaturePlotModel.test.ts`: 窗口标记和导出字段测试。
- Modify `src/app/exportRows.test.ts`: summary/export 字段测试。

---

### Task 1: 锁定当前 endpoint 和 legacy 回归基线

**Files:**
- Test: `src/science/gitt/analyze.test.ts`
- Test: `src/science/gitt/regressionWindows.test.ts`

**Interfaces:**
- Existing `analyzeGittPulse(input)` remains the production entry point.
- Existing `fitDiagnostics.actualFitWindow`, `fitDiagnostics.fitContributingRowIds`, `metricValueCm2PerS` and `regressionCandidateMetricValueCm2PerS` remain readable.

- [ ] **Step 1: Add baseline assertions before new multi-window code**

在现有 exact endpoint 测试中固定以下断言：

```ts
expect(result.metricValueCm2PerS).toBeCloseTo(EXACT_ENDPOINT_METRIC, 12);
expect(result.regressionCandidateMetricValueCm2PerS).toBeCloseTo(EXACT_ENDPOINT_METRIC, 12);
expect(result.fitDiagnostics.windowSelectionMode).toBe('fixed_first_five');
expect(result.fitDiagnostics.fitUniqueTickCount).toBe(5);
expect(result.fitDiagnostics.actualFitWindow).toEqual({ startS: 1, endS: 5 });
expect(result.deltaEtV).toBeCloseTo(EXACT_SLOPE * 9, 12);
```

- [ ] **Step 2: Run the baseline test**

Run:

```text
npm test -- --run src/science/gitt/analyze.test.ts
```

Expected: current baseline passes before the multi-window implementation starts.

---

### Task 2: Define window types and pure time-window selection

**Files:**
- Modify: `src/science/contracts.ts`
- Modify: `src/science/gitt/fit.ts`
- Test: `src/science/gitt/regressionWindows.test.ts`

**Interfaces:**

Add these equivalent types to the existing contract style:

```ts
export type GittRegressionWindowSpecV1 =
  | { kind: 'legacy_first_5'; id: 'legacy_first_5'; label: string }
  | { kind: 'fixed_time'; id: string; label: string; startS: number; endS: number };

export type GittRegressionWindowStatusV1 = 'valid' | 'review' | 'infeasible';

export type GittRegressionWindowResultV1 = {
  windowId: string;
  windowLabel: string;
  kind: GittRegressionWindowSpecV1['kind'];
  requestedStartS: number | null;
  requestedEndS: number | null;
  actualStartS: number | null;
  actualEndS: number | null;
  pointCount: number;
  uniqueTimePointCount: number;
  fitDurationS: number | null;
  fitEndFractionOfPulse: number | null;
  slopeVPerSqrtS: number | null;
  interceptV: number | null;
  rSquared: number | null;
  rmseV: number | null;
  slopeStdError: number | null;
  curvatureMetric: number | null;
  maxNormalizedResidual: number | null;
  monotonicityRatio: number | null;
  durbinWatson: number | null;
  metricValueCm2PerS: number | null;
  windowCoverageIncomplete: boolean;
  status: GittRegressionWindowStatusV1;
  warnings: string[];
};
```

Add default specifications:

```ts
export const DEFAULT_GITT_REGRESSION_WINDOWS = [
  { kind: 'legacy_first_5', id: 'legacy_first_5', label: 'Legacy first 5 points' },
  { kind: 'fixed_time', id: 'cfx_4_25s', label: 'CFx 4–25 s', startS: 4, endS: 25 },
  { kind: 'fixed_time', id: 'cfx_1_64s', label: 'CFx 1–64 s', startS: 1, endS: 64 },
] as const;
```

Add `regressionWindows?: GittRegressionWindowSpecV1[]` to `GittAnalysisConfigV1`, leaving it optional so old callers continue to use defaults.

Expose a pure selector in `fit.ts`:

```ts
export function selectRegressionPoints(
  timeline: TimedPulsePoint[],
  window: GittRegressionWindowSpecV1,
): { points: TimedPulsePoint[]; requestedStartS: number | null; requestedEndS: number | null; warnings: string[]; windowCoverageIncomplete: boolean };
```

Rules:

- `legacy_first_5`: `timeline.slice(1).filter(timeS > 0).slice(0, 5)`.
- `fixed_time`: validate `startS >= 0` and `endS > startS`, then include every point satisfying `timeS >= startS && timeS <= endS`.
- Do not remove the first selected point from fixed-time windows.
- Set incomplete when the pulse does not reach the requested end or the available time extent does not cover the requested start.
- Never select by array index for fixed-time windows.

- [ ] **Step 1: Write failing tests for the selector**

Cover these exact cases:

```ts
// legacy: removes t=0 and keeps t=1..5
expect(selectRegressionPoints(timeline(0, 1, 2, 3, 4, 5, 6), legacy).points.map(p => p.timeS))
  .toEqual([1, 2, 3, 4, 5]);

// 4–25 s includes both boundaries and does not remove t=4
expect(selectRegressionPoints(timeline(0, 4, 5, 25, 26), cfx425).points.map(p => p.timeS))
  .toEqual([4, 5, 25]);

// irregular samples use seconds, not point number
expect(selectRegressionPoints(timeline(0, 1, 2.1, 3.9, 4.2, 7.5, 14.8, 24.9, 25.3), cfx425).points.map(p => p.timeS))
  .toEqual([4.2, 7.5, 14.8, 24.9]);

// a short pulse is incomplete, not silently narrowed or replaced
const short = selectRegressionPoints(timeline(0, 4, 8, 12), cfx425);
expect(short.windowCoverageIncomplete).toBe(true);
expect(short.warnings).toContain('window_coverage_incomplete');
```

- [ ] **Step 2: Run the selector tests and verify the expected failure**

Run:

```text
npm test -- --run src/science/gitt/regressionWindows.test.ts
```

Expected: fail because the new selector and window definitions do not yet exist.

- [ ] **Step 3: Implement only the selector and constants**

Use the existing `TimedPulsePoint` and do not parse raw NDAX rows in this module.

- [ ] **Step 4: Run the selector tests again**

Expected: all selector tests pass, with no change to endpoint tests.

---

### Task 3: Evaluate each window without changing endpoint QC

**Files:**
- Modify: `src/science/gitt/fit.ts`
- Modify: `src/science/gitt/regressionMetric.ts`
- Modify: `src/science/contracts.ts`
- Test: `src/science/gitt/regressionWindows.test.ts`

**Interfaces:**

Add:

```ts
export function evaluateRegressionWindow(
  timeline: TimedPulsePoint[],
  window: GittRegressionWindowSpecV1,
  noiseFloorV: number,
  pulseDurationS: number | null,
  lengthCm: number | null,
  deltaEsV: number | null,
): GittRegressionWindowResultV1;
```

Implementation rules:

- Call `selectRegressionPoints`.
- Call existing `evaluateFit` for the selected points; do not duplicate linear/quadratic/Durbin–Watson code.
- `pointCount` is total source-row count across selected aggregated points.
- `uniqueTimePointCount` is selected aggregated-point count.
- `fitDurationS = actualEndS - actualStartS`.
- `fitEndFractionOfPulse = actualEndS / pulseDurationS`.
- Use `calculateRegressionMetricCm2PerS` with the complete `pulseDurationS`, never the window duration.
- `<5` unique points returns `metricValueCm2PerS = null`, `status = infeasible`.
- `5–7` points returns `status = review` even if the statistical gates pass.
- `>=8` points returns `valid` only when the existing `evaluateFit(...).hardGatePass` is true and coverage is complete; otherwise return `review` with warnings.
- New window warnings stay inside `GittRegressionWindowResultV1`; do not append them to the main `findings` array.

- [ ] **Step 1: Add failing tests**

Required tests:

```ts
// cfx_4_25s uses the full 1200 s pulse duration, not 21 s
expect(result.metricValueCm2PerS).toBeCloseTo(
  (4 / Math.PI) * (lengthCm * deltaEsV / (1200 * slope)) ** 2,
  12,
);

// 3 points are infeasible and cannot fall back to legacy
expect(shortWindow.status).toBe('infeasible');
expect(shortWindow.metricValueCm2PerS).toBeNull();

// all three windows can coexist, each with independent selected points
expect(results.map(window => window.windowId)).toEqual([
  'legacy_first_5', 'cfx_4_25s', 'cfx_1_64s',
]);
```

- [ ] **Step 2: Run and observe the expected failure**

Run the targeted window test. It must fail because `evaluateRegressionWindow` and result fields are not yet wired.

- [ ] **Step 3: Implement the evaluator and pure regression D calculation**

The existing endpoint formula remains in `analyze.ts`; this task only creates independent window results.

- [ ] **Step 4: Run targeted tests**

Expected: selector, boundary, point-count, incomplete-coverage and full-τ tests pass.

---

### Task 4: Wire multi-window results into GITT while preserving legacy aliases

**Files:**
- Modify: `src/science/contracts.ts`
- Modify: `src/science/gitt/analyze.ts`
- Modify: `src/science/gitt/fit.ts`
- Test: `src/science/gitt/analyze.test.ts`

**Interfaces:**

Add to `GittResultV1`:

```ts
regressionWindows: GittRegressionWindowResultV1[];
regressionWindowSensitivity: {
  log10DRange: number | null;
  finitePositiveWindowCount: number;
} | null;
```

Rules:

- If `config.regressionWindows` is absent, use the three default windows.
- If a manual fixed-time spec is supplied, append it after the predefined windows unless its ID already exists.
- Keep `fitDiagnostics` and `regressionCandidateMetricValueCm2PerS` produced by the existing legacy path.
- Ensure the `legacy_first_5` result matches `regressionCandidateMetricValueCm2PerS` within numerical tolerance.
- Compute `log10DRange` from finite positive window D values only; if fewer than two exist, return null.
- Do not add window-specific QC findings to main endpoint findings.

- [ ] **Step 1: Add failing integration tests**

Test:

1. `metricValueCm2PerS`, `deltaEtV`, `deltaEsV`, `medianVoltageV` remain equal to the existing baseline.
2. `regressionWindows` contains the three default IDs.
3. `legacy_first_5.metricValueCm2PerS` equals the old alias.
4. If every window has fewer than five points, endpoint remains computed and `regressionWindows` are all infeasible.
5. Values `1e-10`, `1e-11`, `1e-9` produce `log10DRange = 2` in a pure sensitivity helper test.

- [ ] **Step 2: Run the tests and observe failure**

Run the GITT analyzer tests; expected failure is missing `regressionWindows`/sensitivity fields.

- [ ] **Step 3: Add the minimum orchestration**

Call the multi-window evaluator after the existing `fitSelection`, `deltaEsV`, `pulseDurationS` and `lengthCm` are available. Keep endpoint calculation lines unchanged.

- [ ] **Step 4: Run GITT tests**

Expected: all GITT tests pass and the endpoint baseline is unchanged.

---

### Task 5: Add manual-window configuration and reproducibility identity

**Files:**
- Modify: `src/app/analyze.ts`
- Modify: `src/app/project.ts`
- Modify: `src/science/contracts.ts`
- Test: `src/app/analysisCache.test.ts`
- Test: `src/app/project.test.ts`

**Interfaces:**

Add optional settings:

```ts
regressionManualWindow?: {
  startS: number | null;
  endS: number | null;
};
```

Rules:

- Both null means no manual window.
- One-sided or invalid values are recorded as an infeasible manual window, not coerced.
- Valid input requires `startS >= 0` and `endS > startS`.
- `createWorkbenchConfigSnapshot` includes the normalized manual window and the default validation IDs under `gitt.regressionValidationWindows`.
- The manual window is passed to `GittAnalysisConfigV1.regressionWindows` and does not affect endpoint fields.
- Project files without the field restore `null`; existing project settings remain valid.
- Manifest `settings` and manifest rows expose the manual window and validation-window IDs.

- [ ] **Step 1: Add failing persistence and cache-identity tests**

```ts
expect(createNewareAnalysisIdentity(dataset, { ...settings, regressionManualWindow: { startS: 4, endS: 40 } }).analysisInputHash)
  .not.toBe(createNewareAnalysisIdentity(dataset, settings).analysisInputHash);

const parsed = parseWorkbenchProject(serializeWorkbenchProject({ ...settings, regressionManualWindow: { startS: 4, endS: 40 } }, [dataset]));
expect(parsed.settings.regressionManualWindow).toEqual({ startS: 4, endS: 40 });
```

- [ ] **Step 2: Verify the tests fail for missing configuration support**

- [ ] **Step 3: Implement settings propagation, strict revival and manifest fields**

- [ ] **Step 4: Run app identity and project tests**

Expected: old project fixtures without the optional field still pass; manual values change the analysis input hash.

---

### Task 6: Extend direct-to-plot exports with one row per pulse and window

**Files:**
- Modify: `src/product/gitt/literaturePlotModel.ts`
- Modify: `src/app/exportRows.ts`
- Modify: `src/app/reportExport.ts`
- Test: `src/product/gitt/literaturePlotModel.test.ts`
- Test: `src/app/exportRows.test.ts`

**Interfaces:**

Extend `GITT E-sqrt(t)` rows with:

```ts
usedByLegacyFirst5: boolean;
usedByCfx4To25: boolean;
usedByCfx1To64: boolean;
usedByManual: boolean;
```

Add a separate window summary collection or flattened summary rows containing:

```text
pulseId, pulseOrder, windowId, windowLabel,
requestedStartS, requestedEndS, actualStartS, actualEndS,
uniqueTimePointCount, pointCount, fitDurationS,
fitEndFractionOfPulse, slopeVPerSqrtS, interceptV,
rSquared, rmseV, slopeStdError, curvatureMetric,
maxNormalizedResidual, monotonicityRatio, durbinWatson,
D_regression / cm²·s⁻¹, coverage, status, warnings
```

Keep `GITT D-Voltage` with `D_endpoint`, legacy alias, and add the fixed-window D values and `Regression log10 D range`.

- [ ] **Step 1: Add failing export tests**

Assert that a pulse exports all three window summary rows and that a `t=4 s` point is marked in `usedByCfx4To25`, while `t=0` is not marked in legacy but can be marked in a fixed window when requested.

- [ ] **Step 2: Run targeted export tests and observe expected failure**

- [ ] **Step 3: Implement export-only mapping from `GittResultV1` and canonical pulse timeline**

Do not recompute slope, D or window selection in export code.

- [ ] **Step 4: Run export tests**

Expected: all export rows preserve numeric values and window membership exactly.

---

### Task 7: Add minimal UI for manual input and pulse-level validation

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/components/workbench/GittLiteratureDiagnostics.tsx`
- Test: `src/components/workbench/GittLiteratureDiagnostics.test.tsx` if the existing test setup supports it; otherwise rely on typecheck and export/integration tests.

**Interfaces:**

UI behavior:

- Add two optional number inputs: `Regression start / s` and `Regression end / s`.
- Empty values disable manual validation.
- Manual values are seconds and are sent to `regressionManualWindow`.
- Show a compact table for `Endpoint`, `Legacy first 5`, `CFx 4–25 s`, `CFx 1–64 s`, and `Manual` with D, point count, R² and status.
- Keep the main voltage–D plot as `medianVoltageV` vs `metricValueCm2PerS`.
- Do not add an automatic “best window” button.

- [ ] **Step 1: Add a UI test or an accessible-render assertion for the labels**

Required labels: `Regression validation`, `CFx 4–25 s`, `CFx 1–64 s`, `Manual`, `start / s`, `end / s`.

- [ ] **Step 2: Run the UI test and observe failure**

- [ ] **Step 3: Implement the smallest UI block**

- [ ] **Step 4: Run UI and type tests**

---

### Task 8: Full verification and scientific compatibility audit

**Files:**
- Modify: `docs/CURRENT_CALCULATION_LOGIC_2026-09-15.md`
- Modify: `docs/RELEASE_NOTES_0.1.0-beta.1.md` only if the existing release-note format requires recording the new diagnostic fields.

- [ ] **Step 1: Run focused regression and endpoint tests**

```text
npm test -- --run src/science/gitt/regressionWindows.test.ts src/science/gitt/analyze.test.ts src/product/gitt/literaturePlotModel.test.ts src/app/exportRows.test.ts
```

- [ ] **Step 2: Run the full verification set**

```text
npm run typecheck
npm run lint
npm test -- --run
npm run build
```

Expected: zero failures; report the exact test-file and test counts.

- [ ] **Step 3: Review frozen-field compatibility**

Compare before/after fixtures for:

```text
metricValueCm2PerS
deltaEtV
deltaEsV
medianVoltageV
1200/14400 protocol classification
DCR results
```

All must remain unchanged for the same input. New values are limited to `regressionWindows`, sensitivity and export columns.

- [ ] **Step 4: Check the diff and documentation**

Run `git diff --check`, confirm no DCR file changed, and update the current calculation document with the multi-window section and the unchanged endpoint statement.

- [ ] **Step 5: Report the result**

Report modified files, the exact window-selection rules, backward-compatibility answers, new fields, test counts, build results and any unresolved boundary. Do not claim a new best CFx window or a new main algorithm.

## Self-review checklist

- [x] Endpoint formula remains the production metric.
- [x] Median voltage and cutoff rules are explicitly frozen.
- [x] DCR is outside the change set.
- [x] Fixed windows select by real elapsed seconds.
- [x] Legacy removes only the first unique point.
- [x] Incomplete windows never fall back or expand silently.
- [x] R² is not the sole validity criterion.
- [x] Window sensitivity is diagnostic only.
- [x] Export retains raw points and window membership.
- [x] Manual inputs are recorded in configuration identity and Manifest.
- [x] Tests include backward compatibility, irregular time, duplicates, τ, insufficient points, sensitivity and endpoint-only fallback.
