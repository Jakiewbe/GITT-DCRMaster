# 宽表作图导出 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将三张 GITT 作图 Sheet 改成相邻 X/Y 宽表，让 Excel/Origin 自动按样品区分曲线。

**Architecture:** 在 `src/app/gittPlotExport.ts` 中把每个样品组织成一个 X/Y 列对，再按列对转置成宽表。时间–电压使用样品完整轨迹，τ–电压在同一对列中按脉冲顺序拼接并用空值行断线，中值电压–D_Li 按样品分组；App 的单文件、项目汇总两个入口共用同一个纯函数。科学内核、分析结果和原始 Canonical 数据不改。

**Tech Stack:** React + TypeScript + Vitest + 内置 XLSX writer。

## Global Constraints

- GITT 导出仍然只有 `GITT 时间-电压`、`GITT τ-电压`、`GITT 中值电压-DLi` 三张 Sheet。
- 时间–电压使用每个样品的完整 GITT 轨迹。
- τ–电压继续使用去掉 loaded t=0 后的原始点，按脉冲顺序放在同一对列中，横坐标为 `sqrt(t)`，不导出拟合线。
- 中值电压–D_Li 继续只使用正式主图资格点，按脉冲顺序排列。
- 每个样品使用一组相邻的 X/Y 列；不同长度的数据只在本列对的尾部留空，τ 脉冲之间额外用空值行断线。
- 不改变 GITT、DCR、协议截止、质量处理、DCR 或任何科学数值。

---

### Task 1: Replace long plot rows with wide X/Y pairs

**Files:**
- Modify: `src/app/gittPlotExport.ts`
- Test: `src/app/gittPlotExport.test.ts`

**Interfaces:**
- Consumes: existing `GittPlotExportBundleV1` and `eligibleMedianPulseIds`.
- Produces: existing `buildDirectGittPlotRowsV1(sources)` return shape, with each returned Sheet row containing only dynamic adjacent X/Y columns.

- [ ] **Step 1: Write failing assertions for the wide layout.**

Assert that each sample uses exactly one adjacent time X/Y pair and one adjacent τ X/Y pair, that τ pulses are separated by one empty row, that a shorter sample leaves later cells blank, and that no `fileName`, `seriesId`, or `pointIndex` columns are emitted. Assert that duplicate sample names receive distinct stable column prefixes.

- [ ] **Step 2: Run the focused test and verify it fails.**

Run:

```text
npm.cmd test -- src/app/gittPlotExport.test.ts --run --maxWorkers=1
```

Expected: FAIL because the current function returns long rows with `fileName`/`seriesId` fields and blank separator rows.

- [ ] **Step 3: Implement the minimal wide-table transformer.**

Sort each sample's `fullTraceRows` by physical time and create one time X/Y pair. Group `tauVoltageRows` by `pulseId`, sort points by `sqrtTauSqrtS`, concatenate pulse groups in `pulseOrder`, and insert one null row between groups. Create one median X/Y pair per sample for eligible `whVoltageRows`, sorted by `pulseOrder`. Use a unique sample prefix derived from the source file name, adding a deterministic suffix for duplicate names. Transpose pair arrays into row objects by index; missing values remain `null` and are never replaced by zero or extrapolated values.

- [ ] **Step 4: Run the focused test and verify it passes.**

Run the same Vitest command. Expected: PASS with all wide-layout assertions passing.

- [ ] **Step 5: Commit the isolated transformer and tests.**

```text
git add -- src/app/gittPlotExport.ts src/app/gittPlotExport.test.ts
git commit -m "feat: export GITT plot data as wide XY pairs"
```

### Task 2: Use the wide rows in every GITT export entry point

**Files:**
- Modify: `src/App.tsx:1307-1688`
- Modify: `src/app/reportExport.ts`
- Test: `src/app/reportExport.test.ts`

**Interfaces:**
- Consumes: `buildDirectGittPlotRowsV1` from Task 1.
- Produces: single-file GITT export and project/scoped GITT export with identical three-sheet column-pair semantics.

- [ ] **Step 1: Add failing sheet assertions.**

Assert that the GITT sheet fallback columns use the X/Y wide format and that the sheet model preserves the dynamic adjacent columns returned by the row builder.

- [ ] **Step 2: Run the focused export tests and verify the old layout fails the new assertions.**

```text
npm.cmd test -- src/app/gittPlotExport.test.ts src/app/reportExport.test.ts --run --maxWorkers=1
```

- [ ] **Step 3: Replace the current long-row mapping at both App export paths.**

Keep the existing eligibility and bundle construction. Pass the same per-file source objects to `buildDirectGittPlotRowsV1` in `buildReportData` and in `exportSelectedXlsx`; remove the old inline long-row mapping and update empty-sheet fallback columns to the wide format.

- [ ] **Step 4: Run focused export tests and verify pass.**

```text
npm.cmd test -- src/app/gittPlotExport.test.ts src/app/reportExport.test.ts --run --maxWorkers=1
```

Expected: PASS.

- [ ] **Step 5: Commit the export integration.**

```text
git add -- src/App.tsx src/app/reportExport.ts src/app/reportExport.test.ts
git commit -m "feat: use wide GITT plot sheets everywhere"
```

### Task 3: Regression and delivery verification

**Files:**
- No additional production files.
- Verify: `src/product/gitt/literaturePlotModel.test.ts`, `tests/qualification/gitt-plot-real-data.test.ts`.

**Interfaces:**
- Consumes: the three exported Sheet models and existing real-data plotting model.
- Produces: verified build with unchanged science results.

- [ ] **Step 1: Run plot and real-data tests.**

```text
npm.cmd test -- src/app/gittPlotExport.test.ts src/app/reportExport.test.ts src/product/gitt/literaturePlotModel.test.ts tests/qualification/gitt-plot-real-data.test.ts --run --maxWorkers=1
```

Expected: all selected tests pass.

- [ ] **Step 2: Run typecheck and production build.**

```text
npm.cmd run typecheck
npm.cmd run build
```

Expected: both commands pass; the existing large-chunk warning may remain.

- [ ] **Step 3: Review the final diff and working tree.**

```text
git diff --check
git status --short
```

Confirm that no raw NDAX/CSV files, build output, or unrelated dirty files are staged by the implementation commits.
