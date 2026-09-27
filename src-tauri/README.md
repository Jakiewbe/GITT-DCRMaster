# Tauri 2 desktop build

The TypeScript scientific algorithms remain in the frontend bundle and are not
migrated to Rust. The desktop capability set is deliberately limited to
`core:default`; file import remains user-initiated webview file input, while
CSV, XLSX, Manifest and project exports use the native `write_export_chunk`
command and are written to the current user's `Downloads` folder in bounded
chunks. The browser build keeps the Blob download path.

Windows builds use `scripts/tauri-d-drive.ps1`. By default it keeps all heavy
build state under `D:\GITTDCR-Build`:

- Cargo registry and cache: `D:\GITTDCR-Build\cargo-home`
- Rust targets and native bundles: `D:\GITTDCR-Build\cargo-target`
- npm cache: `D:\GITTDCR-Build\npm-cache`
- temporary and Tauri bundler tools: `D:\GITTDCR-Build\temp` and
  `D:\GITTDCR-Build\localappdata`
- copied release installers: `D:\GITTDCR-Build\artifacts\<version>`

Install dependencies once, then use:

```powershell
npm install --cache D:\GITTDCR-Build\npm-cache
npm run tauri:info
npm run tauri:dev
npm run tauri:build
```

Build only one installer type when diagnosing a bundler prerequisite:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass `
  -File scripts\tauri-d-drive.ps1 -Action build -Bundle nsis
```

Set `GITTDCR_BUILD_ROOT` before running the script to use another build root.
The source repository is never moved. Do not mark a package as
release-qualified until clean Windows 10/11 installation, offline
recomputation, upgrade, and uninstall tests pass.

## Verified local build status (2026-09-18)

- Tauri CLI `2.11.4`, Rust `1.95.0`, and WebView2 `150.0.4078.65` are detected.
- Visual Studio Build Tools `17.14.36`, MSVC `19.44`, and Windows SDK
  `10.0.26100.0` are installed; the D-drive script imports `VsDevCmd.bat`
  automatically before each Tauri action.
- The Vite production build and optimized Rust application build complete successfully.
- The Rust dependency graph is locked in `Cargo.lock` and its registry/cache is
  populated under the D-drive build root.
- WiX and NSIS are hash-verified and cached under the D-drive bundler root.
- The current x64 MSI and NSIS installers are copied to
  `D:\GITTDCR-Build\artifacts\0.1.0-beta.1` with SHA-256 receipts.
- The NSIS package passed silent D-drive installation, installed-app real NDAX
  analysis, Manifest export, resource verification, and silent uninstall. The
  MSI passed administrative extraction and executable/resource verification.
- Installers are currently unsigned; production distribution still
  requires a trusted code-signing certificate plus clean Windows 10/11 and
  upgrade-path qualification.
