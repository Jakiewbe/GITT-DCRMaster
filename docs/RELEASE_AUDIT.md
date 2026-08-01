# PulseLab GITT DCR Release Audit

Current decision: `BLOCKED_EXTERNAL_EVIDENCE`

The implementable `0.1.0-beta.1` release candidate is built and locally qualified. Public or fully qualified laboratory release remains blocked only by named external evidence: an official Neware export/profile approval, a trusted Windows code-signing certificate, independent clean Windows 10/11 qualification, and an owner-selected distribution license or private-use terms.

## Release gates

| Gate | State | Evidence / remaining blocker |
|---|---|---|
| Science | Passed for CFₓ Beta scope | 151 tests, independent Oracle pack, real CFₓ stress tests, centralized immutable QC IDs, and CFₓ `limited + comparative_index_only`. Strict rejected GITT results keep `formalValue=null`; 1200 s values are labeled protocol comparison candidates. |
| Data and traceability | Passed with provisional vendor profile | 13 Neware files / 286,266 rows qualify; integer ticks, rowId/hash, recipe, project recovery, and real save/open round-trip pass. Existing parity is independent self-export, not an official Neware export, so the profile remains `provisional`. |
| User experience | Passed locally | Real DCR/GITT import, automatic material/mass evidence, 12 mm geometry confirmation, 2.25 g/cm³ density, result navigation, keyboard names, 375–1440 px layouts, reduced motion, and scroll reset were exercised. No user uncertainty/resolution/QC inputs are exposed. |
| Export | Passed | JSON Manifest, CSV, and XLSX use one release export model. Real exports agree on value/state/scope/density/molar mass/area/version; CSV formula prefixes are guarded and XLSX contains no formula cells. |
| Desktop release | Local Beta passed; external qualification blocked | Tauri MSI/NSIS build, D-drive silent install, installed-app real NDAX analysis, Manifest export, project workflow, resources, silent uninstall, and MSI administrative extraction pass. Clean independent Windows 10/11, upgrade-path, code signing, and public license terms remain external. |

## Frozen Beta identities

```text
appVersion          0.1.0-beta.1
buildSourceId       6088adba4dae-dirty-83a213739469
GITT qcPolicyId     GITT_QC_POLICY_CFX_1_0_0
DCR qcPolicyId      DCR_QC_POLICY_1_0_0
CF1 presetVersion   1.0.0-beta.1
CF1 density         2.25 g/cm³
oraclePackVersion   1.0.0-beta.1
```

## Final artifacts

```text
D:\GITTDCR-Build\artifacts\0.1.0-beta.1\PulseLab GITT DCR_0.1.0-beta.1_x64-setup.exe
SHA-256 1595b092bb6168b3497a45a1644231f04adc764446d3998b85e71b79e047d16f

D:\GITTDCR-Build\artifacts\0.1.0-beta.1\PulseLab GITT DCR_0.1.0-beta.1_x64_en-US.msi
SHA-256 b53fb8258095ac2feafe22a8977c4457f203056d6e67b559e881d5ce562476ff
```

Both packages are currently unsigned.

## Verification evidence

### Source qualification

```text
npm run check
  TypeScript passed
  ESLint passed
  26 test files passed
  151 tests passed
  Vite production build passed

npm run test:oracle
  1 file / 5 tests passed

npm run test:qualification
  1 file / 3 tests passed
  13 real Neware files qualified

npm audit --audit-level=high
  0 vulnerabilities

cargo clippy --locked -- -D warnings
  passed

cargo audit --file Cargo.lock
  no vulnerability advisory
  warnings: unmaintained transitive crates; the glib unsound advisory is not in the Windows x64 target tree
```

### Real workflow qualification

- Imported one real CFₓ DCR NDAX and one real CFₓ GITT NDAX.
- DCR analyzed without user parameters and produced four review-state pulse events.
- GITT automatically resolved CF₁, Neware SCQ mass `1.032 mg`, 1200 s, 1.5 V cutoff, and 4 h rest.
- User supplied only `12 mm` geometry; density `2.25 g/cm³` and molar mass `31.01 g/mol` remained editable physical facts.
- Result receipt showed area `1.13097 cm²`, density `2.25 g/cm³`, and the correct mass source.
- All 42 strict generic GITT results retained `formalValue=null`; the separate literature view displayed only explicitly labeled protocol comparison candidates.
- Manifest recorded `0.1.0-beta.1`, `GITT_QC_POLICY_CFX_1_0_0`, `limited`, and `comparative_index_only`.
- Project save/open restored two datasets, the committed recipe, `12 mm` geometry, and current analysis status.

### UI qualification

- No horizontal page overflow at 375, 768, 1024, or 1440 px.
- Wide result tables use focusable horizontal scroll regions.
- All visible buttons have text or an accessible name; file controls are user-triggered and hidden from tab order.
- The current-file select has an associated label.
- Reduced-motion media rules suppress transitions and drawer animations.
- Top-level navigation resets scroll to the start of the selected workspace.
- GITT waiting state reports `N GITT 待确认`, rather than falsely reporting completion.

### Export qualification

- Real Manifest, CSV, and XLSX agree on metric terminology, result state, QC policy, material preset, density, molar mass, mass, area, applicability, and interpretation scope.
- CSV guards values beginning with `=`, `+`, `-`, or `@`.
- XLSX writes inline strings and numeric cells; no `<f>` formula element is emitted.
- Installed resources contain `THIRD_PARTY_NOTICES.md` and `RELEASE_NOTES_0.1.0-beta.1.md` at the application root.

### Desktop qualification

- NSIS installed silently to `D:\GITTDCR-Test\PulseLab-Beta-1`.
- Installed Tauri/WebView2 application launched and exposed the expected product title.
- Installed application directly imported a real DCR NDAX and identified four pulse events.
- A full installed-app run also imported real DCR + GITT, confirmed 12 mm geometry, analyzed GITT, and exported a matching Manifest.
- NSIS silent uninstall removed the install directory and HKCU uninstall registration.
- MSI administrative extraction contained the executable, release notes, and third-party notices.

## Iterations

### Iteration 1 — establish release loop

- Objective: create a repeatable release contract and evidence ledger.
- Severity: P1 process gap.
- Result: master loop prompt and release gates added.

### Iteration 2 — freeze Beta scientific and export identities

- Objective: remove draft/alpha scientific identity and eliminate scattered GITT thresholds.
- Severity: P1 traceability and maintenance risk.
- Result: rest-tail, duplicate-tick, and capacity-coverage thresholds moved into the central policy; Beta QC/material/oracle IDs frozen; brand and application version unified.

### Iteration 3 — correct primary workflow semantics

- Objective: ensure the user supplies only controllable physical facts.
- Severity: P0 usability / misleading completion state.
- Result: DCR remains zero-configuration; GITT blocks only on missing/conflicting material, mass, or geometry facts; waiting/reanalysis states and report export lock are explicit.

### Iteration 4 — unify release exports and scientific terminology

- Objective: prevent CSV/XLSX/Manifest drift and false CFₓ certainty.
- Severity: P1 audit and interpretation risk.
- Result: one release export model, parity tests, formula-injection protection, physical parameter columns, and explicit protocol-candidate wording.

### Iteration 5 — real UI, security, and installed-app qualification

- Objective: prove the built desktop workflow rather than only source tests.
- Severity: P1 release gate.
- Result: browser-driven real NDAX workflow, project round-trip, real exports, npm/Rust security checks, MSI/NSIS build, installed-app CDP smoke, resource verification, and clean uninstall passed.

### Iteration 6 — operator endpoint formula and result-first workflow

- Objective: match the laboratory hand calculation and stop diagnostic policy from hiding directly computable values.
- Severity: P0 product semantics and operator trust.
- Result: GITT main algorithm changed to `WH_PLANAR_MANUAL_ENDPOINT` with
  `D=4/(πτ)·L_equivalent²·(ΔEs/ΔEₜ)²`; `ΔEₜ` uses the first positive-time loaded
  sample through the pulse endpoint and excludes Neware's duplicated `t=0` boundary record.
- Regression is retained only for the `E–√t` auxiliary plot. GITT and DCR diagnostics no longer
  suppress a finite direct result; structural missing data, zero denominators, absent exact ticks,
  and invalid step/time structure remain not-computable.
- XLSX now includes `GITT full trace`, `GITT pulse response`, `GITT sqrt fit`, and
  `GITT WH vs voltage` sheets. Independent Python Oracle, 13-file qualification, TypeScript,
  ESLint, Vite build, and 155 Vitest tests passed on 2026-07-19.
- CFₓ/FGS GITT sequences are now retained only through the first program-confirmed approximately
  1.5 V `Stop_Volt` pulse and its following Rest. Later pulse cycles remain in the raw Canonical
  source receipt but are excluded from scientific results, primary plots, tables, and plot-data export.

## External blockers

1. Obtain at least one official Neware export of the same NDAX and sign the vendor profile after row-level comparison.
2. Choose public distribution license terms or confirm private/internal-only distribution.
3. Acquire a trusted code-signing certificate and sign both installers.
4. Run clean independent Windows 10 and Windows 11 install, offline analysis, upgrade, and uninstall qualification.

Until those items are supplied, distribute only as an explicitly unsigned Beta candidate and do not describe the Neware profile as vendor-approved.
