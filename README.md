# PulseLab GITT DCR

离线 CFₓ GITT 与 Neware DCR 电化学脉冲分析桌面软件。当前源码版本为 `0.1.0-beta.1`。主流程以直接计算和论文作图为中心；诊断 policy 保留在高级详情中。Neware 直读 profile 仍标记为 `provisional`，不会被描述为厂商批准。

## 当前能力

- 纯 TypeScript 科学内核，使用 Vitest 验证；科学算法不迁移到 Rust。
- Neware NDAX 直接规范化为 integer-tick Canonical 数据，保留重复边界记录和来源 rowId；13 个冻结源、286,266 行已通过独立导出逐行零差异校验。
- GITT 主值采用平面 Weppner–Huggins 端点手算法 `D=4/(πτ)·L²·(ΔEs/ΔEₜ)²`；`E–√t` 回归为辅助图。
- CFₓ固定输出 `limited + comparative_index_only`，主值采用 WH 平面端点手算法。
- DCR 仅实现显式 `Rest → dcr_pulse` 与 first-sample / 5 / 10 / 30 s exact-tick。
- 可计算结果直接显示；拟合、采样和模型诊断收纳在高级详情中。
- NDAX 规范化与科学求解分别运行在独立 Web Worker；参数停止输入约 300 ms 后只重算当前数据集，结果使用完整 `analysisInputHash` 的 4 项有限缓存。
- XLSX 直接包含完整曲线、单脉冲响应、`E–√t` 和 WH–电压四组作图数据；Manifest 继续保存物理参数、诊断、哈希与版本。
- 项目恢复会运行时校验全部设置、材料字段、版本合同和 Canonical/source hash，错误包含明确恢复建议。
- Tauri CLI 2.11.4、MSVC 19.44、Windows SDK 26100 与 D 盘构建环境已建立。上一 alpha 已完成本机安装冒烟；当前 Beta 必须在全部资格测试通过后重新打包和验收。

## 明确不做

- 不提供球形 GITT、物理涂层厚度、自由倍率或 1 s iR 入口。
- 不把回归截距称为纯欧姆 iR 校正。
- 不直接解析 LAND CEX；LAND V1 只接受未来经批准的官方 CSV/XLSX 导出 profile。
- 不将 CFₓ结果解释为已经证明的真实 Li⁺/Na⁺固相扩散系数。
- 不发布公开网页版本，也不融合 EISMaster / CHI-OPEIS。

## 开发命令

```powershell
npm install
npm run typecheck
npm run lint
npm run test:run
npm run build
npm run dev
npm run tauri:info
npm run tauri:build
```

Vite 开发地址固定为 `http://127.0.0.1:1420`，与 Tauri 配置一致。

## 代码结构

```text
src/science/                  版本化科学合同、GITT、DCR、SOC、哈希与统计
src/adapters/neware/          NDAX/NDC 文件适配与显式协议事件
src/app/                      分析编排、项目文件、安全导出
src/components/workbench/     科学工作台 UI
src/workers/                  NDAX 规范化与科学分析 Worker
tests/oracles/                独立 Python Oracle 与固定 golden
tests/qualification/          13 个真实 Neware 文件的批量资格报告
src-tauri/                    Tauri 2 最小权限 scaffold
```

## 当前不能关闭的发布 Gate

- Neware 自导出 parity 已完成；它是 `independent-qualified` 而非厂商官方导出，profile 继续保持 `provisional`。
- 电流/电压分辨率和跃迁采集延迟尚未取得批准证据。
- CF₁密度已按用户口径设为 `2.25 g/cm³`；测量方法和标准不确定度仍待补充。
- 首版验证聚焦 CFₓ，不再把 NMC111 正对照设为发布前置；因此结果解释始终保持 comparative only。
- Tauri 重型依赖、缓存、构建产物和安装测试迁移到 D 盘执行。
- 当前构建没有受信任代码签名证书，因此 Windows 可能显示未知发布者/SmartScreen 提示。
- 本机 NSIS 安装、真实 DCR 复算、Manifest 导出、静默卸载和 MSI 管理提取已通过；独立清洁 Windows 10/11、升级安装与长期运行仍需发布前补测。

发布前性能回归记录保存在 `D:\GITTDCR-Test\release-optimization-2026-07-17\optimization-benchmark.json`。13 文件导入的主线程最长心跳间隔由约 943 ms 降至约 424 ms，超过 250 ms 的间隔由 14 次降至 1 次；真实 GITT 科学求解在 Worker 中约 0.83 s，期间没有超过 250 ms 的 UI 心跳停顿。该数据只用于本机回归，不作为跨设备性能承诺。

诊断状态不再拦截可计算结果；CFₓ的 `limited + comparative_index_only` 仍用于约束物理命名。Beta 历史记录见 `docs/RELEASE_NOTES_0.1.0-beta.1.md`。
