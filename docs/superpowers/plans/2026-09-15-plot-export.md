# 图表单位与分层导出 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 统一论文图表轴单位，并让 DCR/GITT 单独导出、项目总表按 Sheet 提供可直接作图数据。

**Architecture:** 在图表组件保留通用绘图模型，只统一传入的坐标轴标签和格式；在 App 导出层按分析类型构造可复用的 sheet 集合，单独导出和项目总导出都调用同一套数据映射。科学计算和原始数据不改写。

**Tech Stack:** React + TypeScript + Vitest + Vite + 内置轻量 XLSX writer。

## Global Constraints

- 保持原始 Canonical 数据不变。
- 单位放在列名/轴名，不拼进数值。
- DCR 使用现有论文四输入量 E1、E2、I1、I2；GITT 使用现有端点结果和辅助五点回归。
- 不创建分支或 worktree。

### Task 1: 统一图表轴标签

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/components/workbench/GittLiteratureDiagnostics.tsx`
- Modify: `src/components/workbench/BatchTrendPlot.tsx` only if shared axis behavior needs a stable label.
- Test: existing component/model tests plus new label assertions where practical.

**Steps:**

- [ ] Add failing assertions for the required axis labels in the relevant rendered/model contract.
- [ ] Run focused tests and confirm the assertions fail for the old labels.
- [ ] Change only the axis labels and log scale configuration needed for the requested units.
- [ ] Run focused tests and confirm they pass.

### Task 2: Build reusable DCR/GITT export sheet models

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/app/exportRows.ts` if shared mappings are needed.
- Test: `src/app/exportRows.test.ts`, `src/app/xlsx.test.ts`.

**Steps:**

- [ ] Add failing tests proving DCR and GITT sheet builders contain only their own result type and use unit-bearing plot columns.
- [ ] Run focused tests and confirm failure.
- [ ] Implement small sheet-builder helpers and use them for both single-type and project exports.
- [ ] Run focused tests and confirm pass.

### Task 3: Add separate export actions

**Files:**
- Modify: `src/App.tsx`
- Test: relevant App/export integration coverage.

**Steps:**

- [ ] Add failing coverage for DCR-only and GITT-only export action availability/selection.
- [ ] Implement the two buttons and guard each action by available analysis type.
- [ ] Verify downloaded workbook sheet names and absence of the other analysis type.

### Task 4: Overall verification

**Files:**
- Modify: `README.md` and `docs/RELEASE_NOTES_0.1.0-beta.1.md` only for final user-facing export/axis descriptions.

**Steps:**

- [ ] Run `npm run typecheck`.
- [ ] Run `npm run lint`.
- [ ] Run `npm run test:run`.
- [ ] Run `npm run build`.
- [ ] Run `git diff --check` and inspect the final export diff.
