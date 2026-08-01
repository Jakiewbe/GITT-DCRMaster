# Third-party notices

PulseLab GITT DCR includes third-party software. This inventory is derived from the locked JavaScript and Rust dependency graphs for `0.1.0-beta.1`; the corresponding package distributions contain the authoritative license texts.

## Runtime JavaScript dependencies

| Package | Locked version | License | Project |
|---|---:|---|---|
| `@zip.js/zip.js` | 2.8.31 | BSD-3-Clause | https://github.com/gildas-lormeau/zip.js |
| `lucide-react` | 1.16.0 | ISC | https://github.com/lucide-icons/lucide |
| `react` | 19.2.6 | MIT | https://github.com/facebook/react |
| `react-dom` | 19.2.6 | MIT | https://github.com/facebook/react |
| `scheduler` | locked by `react-dom` | MIT | https://github.com/facebook/react |

## Desktop runtime

The desktop shell is built with Tauri 2 and its locked Rust dependency graph. Principal runtime components include:

| Package family | Locked version | License |
|---|---:|---|
| `tauri` | 2.11.5 | Apache-2.0 OR MIT |
| `tauri-runtime` | 2.11.3 | Apache-2.0 OR MIT |
| `tauri-runtime-wry` | 2.11.4 | Apache-2.0 OR MIT |
| `wry` | 0.55.1 | Apache-2.0 OR MIT |
| `webview2-com` | 0.38.2 | MIT |
| `serde` | 1.0.228 | MIT OR Apache-2.0 |
| `serde_json` | 1.0.150 | MIT OR Apache-2.0 |

Transitive Rust packages are fixed by `src-tauri/Cargo.lock`. Their declared licenses include MIT, Apache-2.0, BSD-2-Clause/BSD-3-Clause, ISC, MPL-2.0, Unicode-3.0, Zlib, Unlicense, CC0-1.0 and compatible dual-license expressions. Release audit must be repeated whenever `Cargo.lock` or `package-lock.json` changes.

## Application license

This notice describes third-party components only. It does not grant a license to the PulseLab application source code. The application owner must choose the distribution license or private-use terms before public source distribution.
