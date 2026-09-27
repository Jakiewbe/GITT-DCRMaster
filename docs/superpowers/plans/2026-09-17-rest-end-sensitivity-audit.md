# Rest-end Window Sensitivity Audit Implementation Plan

> **For agentic workers:** Execute this plan task-by-task with test-first checkpoints. Do not change the formal GITT estimator during this audit.

**Goal:** Add an audit-only comparison of the current Rest-end Theil–Sen estimator, fixed 15 min and 5 min Theil–Sen estimators, and the final raw point across the current 39 real CFx pulses.

**Architecture:** Keep `diagnoseRest()` and all formal result fields unchanged. Extract or reuse the existing CanonicalRow aggregation, physical-time tail selection, Theil–Sen regression, and actual-rest-end evaluation in a separate audit calculation. Attach audit values to `GittResultV1`, export them as audit columns, and generate a real-data report without feeding audit values into `deltaEsV`, `metricValueCm2PerS`, QC, or DCR.

**Tech Stack:** TypeScript, React/Vite, Vitest, NDAX integration fixtures, Markdown audit report.

## Global Constraints

- Formal `postRestEndPotentialV`, `preRestEndPotentialV`, `deltaEsV`, `metricValueCm2PerS`, QC, and DCR must remain numerically unchanged.
- Current formal Rest tail remains `min(restDuration, max(60 s, 20% × restDuration))`.
- Audit robust estimators use unique physical time, the same Theil–Sen implementation, and evaluation at the actual Rest end.
- Audit windows are current formal, fixed 900 s, fixed 300 s, and final raw CanonicalRow point.
- No warning threshold is introduced in this round.
- No change to Endpoint, CFx_10s, slope windows, geometry, mass, cutoff, protocol segmentation, or DCR.

---

### Task 1: Define the audit contract and failing unit tests

**Files:**
- Modify: `C:/Users/chs/Desktop/GITTDCRmaster/src/science/contracts.ts`
- Create: `C:/Users/chs/Desktop/GITTDCRmaster/src/science/gitt/restSensitivity.test.ts`

**Interfaces:**
- Produce `RestEndSensitivityAuditV1` with four voltage estimates, pairwise voltage differences, robust spread, and raw-last difference for one Rest side.
- Produce a GITT-level audit object containing pre-Rest and post-Rest audit sides plus `deltaEsCurrentV`, `deltaEs15minV`, `deltaEs5minV`, `dCurrentCm2PerS`, `d15minCm2PerS`, and `d5minCm2PerS`.

- [ ] **Step 1: Write failing tests** for: current formal estimator equals the existing 20%/60 s estimator; 900 s and 300 s use the same Theil–Sen/evaluate-at-end path; raw-last is a separate raw point; `Spreadrobust` excludes raw-last; pairwise deltas have signed values; the formal result does not consume audit values.
- [ ] **Step 2: Run the focused test** with `npm test -- --run src/science/gitt/restSensitivity.test.ts` and confirm it fails because the audit API and fields do not exist.
- [ ] **Step 3: Add only the TypeScript contract types** needed by the failing tests; do not alter existing formal result values.

### Task 2: Implement the audit-only Rest estimator

**Files:**
- Modify: `C:/Users/chs/Desktop/GITTDCRmaster/src/science/gitt/rest.ts`
- Create or modify: `C:/Users/chs/Desktop/GITTDCRmaster/src/science/gitt/restSensitivity.ts`
- Modify: `C:/Users/chs/Desktop/GITTDCRmaster/src/science/gitt/analyze.ts`
- Test: `C:/Users/chs/Desktop/GITTDCRmaster/src/science/gitt/restSensitivity.test.ts`

**Interfaces:**
- `estimateRestEndForWindow(rows, windowS, configuredVoltageResolutionV)` returns a nullable robust estimate based on `aggregateUniqueTicks()`, physical nanoseconds, the existing `theilSenRegression()`, and the fitted value at the final Rest time.
- `analyzeRestEndSensitivity(rows, configuredVoltageResolutionV)` returns `current`, `fifteenMin`, `fiveMin`, and `rawLastPoint` values plus signed differences and `robustSpreadV`.

- [ ] **Step 1: Implement the smallest shared helper** so the audit robust estimates use the existing aggregation and Theil–Sen functions; the current formal `diagnoseRest()` output remains byte-for-byte equivalent for the same inputs.
- [ ] **Step 2: Define the current audit window** as `min(duration, max(60, duration × 0.2))`, the 15 min window as `min(duration, 900)`, and the 5 min window as `min(duration, 300)`.
- [ ] **Step 3: Define `rawLastPointV`** as the finite voltage from the CanonicalRow with the latest physical elapsed time, without putting it into `robustSpreadV`.
- [ ] **Step 4: Wire the audit object into `analyzeGittPulse()`** only after the existing formal `deltaEsV` and Endpoint D are calculated, leaving those calculations unchanged.
- [ ] **Step 5: Run the focused test** and confirm all audit tests pass while formal fixture assertions remain unchanged.

### Task 3: Add export and UI visibility without changing production calculations

**Files:**
- Modify: `C:/Users/chs/Desktop/GITTDCRmaster/src/app/exportRows.ts`
- Modify: `C:/Users/chs/Desktop/GITTDCRmaster/src/App.tsx`
- Modify: `C:/Users/chs/Desktop/GITTDCRmaster/src/components/workbench/GittLiteratureDiagnostics.tsx`
- Modify: `C:/Users/chs/Desktop/GITTDCRmaster/src/product/gitt/literaturePlotModel.ts`
- Test: `C:/Users/chs/Desktop/GITTDCRmaster/src/app/exportRows.test.ts`
- Test: `C:/Users/chs/Desktop/GITTDCRmaster/src/product/gitt/literaturePlotModel.test.ts`

**Interfaces:**
- Export audit fields with explicit `audit` names and units; leave formal fields under their existing names.
- Display the audit values as diagnostics only; do not use them as plot input for the formal D–voltage result.

- [ ] **Step 1: Add failing export/model assertions** that audit values are present and formal values still map from `deltaEsV` and `metricValueCm2PerS`.
- [ ] **Step 2: Run the focused export/model tests** and confirm the new assertions fail for missing fields.
- [ ] **Step 3: Add audit mappings and UI labels** for Main/15 min/5 min/Raw-last, pairwise differences, and robust spread.
- [ ] **Step 4: Run export/model tests and typecheck**.

### Task 4: Re-run real data and generate the sensitivity report

**Files:**
- Modify: `C:/Users/chs/Desktop/GITTDCRmaster/tests/qualification/gitt-t0-endpoint-migration.test.ts` or create a dedicated qualification test beside it.
- Create: `C:/Users/chs/Desktop/GITTDCRmaster/tests/qualification/rest-end-sensitivity-audit.test.ts`
- Create: `C:/Users/chs/Desktop/GITTDCRmaster/analysis/rest-end-sensitivity-audit/REST_END_SENSITIVITY_AUDIT_REPORT.md`
- Create: `C:/Users/chs/Desktop/GITTDCRmaster/analysis/rest-end-sensitivity-audit/after.json`

**Interfaces:**
- The qualification test analyzes the same three NDAX files through `analyzeNewareDataset()` and writes a deterministic audit artifact.
- The report must include median, IQR, P90, and max for voltage spread, each requested voltage delta, ΔEs sensitivity, and absolute `log10(D)` differences.

- [ ] **Step 1: Add failing qualification assertions** that all 39 pulses contain audit values, formal fields equal the pre-audit baseline, and the report lists the five most sensitive pulses.
- [ ] **Step 2: Run the qualification test** and confirm it fails because audit fields/report are absent.
- [ ] **Step 3: Generate the audit artifact** with per-file counts, four Rest-end voltage estimators, `Δmain-15`, `Δ15-5`, `Δ5-raw`, robust spread, `ΔEs` variants, D variants, and `|Δlog10D|` statistics.
- [ ] **Step 4: Add a first-principles decision section** that reports the data only; do not encode warning thresholds or migrate the formal estimator.
- [ ] **Step 5: Run the qualification test** and inspect the report for 39 pulses and the five largest sensitivities.

### Task 5: Final regression and documentation

**Files:**
- Modify: `C:/Users/chs/Desktop/GITTDCRmaster/docs/CURRENT_CALCULATION_LOGIC_2026-09-15.md`
- Modify: `C:/Users/chs/Desktop/GITTDCRmaster/docs/science/CFX_GITT_10S.md`
- Modify: `C:/Users/chs/Desktop/GITTDCRmaster/README.md`
- Test: all existing tests under `C:/Users/chs/Desktop/GITTDCRmaster/src` and `C:/Users/chs/Desktop/GITTDCRmaster/tests`

- [ ] **Step 1: Document that the formal estimator remains unchanged** and that Rest-end audit values are diagnostic-only.
- [ ] **Step 2: Run `npm run typecheck` and `npm run lint`.**
- [ ] **Step 3: Run `npm test -- --run`.**
- [ ] **Step 4: Run `npm run build` and the independent scientific oracle.**
- [ ] **Step 5: Review `git diff --check`, confirm no formal frozen-field regression, and stop for scientific review.**

## Self-review

- No task changes the formal Rest estimator, Endpoint, DCR, CFx_10s, or QC thresholds.
- Raw-last is separated from the robust spread, so a single noisy final point cannot by itself inflate the robust curvature signal.
- All robust audit estimators share the physical-time aggregation, Theil–Sen implementation, and actual-end evaluation.
- The report is descriptive and decision-supporting; it does not silently select a new formal window.
