# PulseLab GITT DCR

离线 CFₓ GITT 与 Neware/LAND DCR 电化学脉冲分析桌面软件。当前源码版本为 `0.1.0-beta.1`。Neware NDAX 与 LAND CEX 均可直接导入；LAND CEX 二进制 profile 仍标记为 `provisional`，不会被描述为厂商批准。

## 当前能力

- 纯 TypeScript 科学内核，使用 Vitest 验证；科学算法不迁移到 Rust。
- Neware NDAX 直接规范化为 integer-tick Canonical 数据，保留重复边界记录和来源 rowId；13 个冻结源、286,266 行已通过独立导出逐行零差异校验。
- LAND CEX V7 观察型二进制 profile 可将 10 ms 时间码、5376 counts/V 电压码、阶段和累计容量规范化为同一 Canonical 数据；电流直接由原始电流码按官方 LAND `Rec.Current` 对照得到的 `1/32256000 A` 比例解码，profile 和电压分辨率证据仍保留 provisional / review 提示。
- GITT 主值采用平面 Weppner–Huggins 端点手算法 `D=4/(πτ)·L²·(ΔEs/ΔEₜ)²`；τ¹ᐟ²–电压图只提供去掉 loaded `t=0` 后的原始数据，不在图中预拟合，横坐标为 `√τ`。
- GITT 先在循环序列中找到第一次接近程序设定的 `1.5 V` 截止电压；低倍率主序列仍按旧规则截断其后循环，高倍率数据则保留截止后的结果用于审计和导出。辅助图再去掉第一个脉冲点后固定使用后续 5 个唯一时间点拟合 `E–√t`，不足 5 点时明确标记不可拟合。
- 对等效比电流 `>=500 mA·g⁻¹` 的 CFₓ 数据，主 `D_app–中值电压` 图增加 `medianVoltageV >= 1.5 V` 的显示/比较下限；这不是协议截止，也不删除低于下限的结果。低倍率数据不启用该下限。
- CFₓ固定输出 `limited + comparative_index_only`，主值采用 WH 平面端点手算法；CFx10s 与 generic `1–64 s` 共用 `0 < t <= 64 s` 选点函数，CFx10s 另外记录约 10 s 采样的点数、覆盖、线性、窗口稳定性和方法差异。
- DCR 仅实现显式小电流放电 → 静置 → 大电流放电，并按论文公式 `R=(E1-E2)/(I1-I2)` 使用两个阶段的终止电压和阶段电流中位数。
- 可计算结果直接显示；拟合、采样和模型诊断收纳在高级详情中。
- Rest-end 正式窗口保持当前 `20% / minimum 60 s`；另提供 15 min、5 min 和 Raw-last 的只读敏感性审计，并同步计算审计 ΔEs/D，不自动改变主结果。
- NDAX 规范化与科学求解分别运行在独立 Web Worker；参数停止输入约 300 ms 后只重算当前数据集，结果使用完整 `analysisInputHash` 的 4 项有限缓存。
- 报告页支持单独导出 DCR 或 GITT；GITT 专项导出只保留三张可直接作图的 sheet：`GITT 时间-电压`、`GITT τ-电压`、`GITT 中值电压-DLi`。第一张同时标记完整曲线和单脉冲静置–脉冲–静置曲线；τ¹ᐟ²–电压数据不含 loaded `t=0` 点，横坐标为 `√τ`；中值电压–DLi 使用正式 WH Endpoint 结果。列名直接带单位。
- GITT 电压–Dli 图默认按论文示例翻转纵轴刻度，并提供按钮切换为常规方向；翻转时同步调整曲线和刻度，保证图形含义一致。
- 项目恢复会运行时校验全部设置、材料字段、版本合同和 Canonical/source hash，错误包含明确恢复建议。
- Tauri CLI 2.11.4、MSVC 19.44、Windows SDK 26100 与 D 盘构建环境已建立。当前 Beta 已完成本机 x64 NSIS/MSI 打包；安装包仍未签名，正式发布前还需做干净 Windows 环境安装验收。

## 明确不做

- 不提供球形 GITT、物理涂层厚度、自由倍率或 1 s iR 入口。
- 不把回归截距称为纯欧姆 iR 校正。
- 不把 LAND CEX provisional 二进制 profile 描述为厂商批准；其电流代码比例虽已通过官方 LAND 结果对照，仍不能把 profile 当作完成厂家格式认证的正式结果。
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

Windows 下可直接双击项目根目录的 `启动 PulseLab.cmd`。它会检查依赖、启动 Vite 开发服务，并在服务就绪后打开浏览器；若服务已经运行，则直接打开现有地址。

## 结果状态怎么读

GITT 结果不再用一个状态承担所有含义：

- `calculationState`：有没有算出有限数值；
- `primaryEndpointQcStatus`：Endpoint 的输入、符号和定义是否成立；
- `protocolStatus`：是否为完整 1200 s 脉冲和标准 14400 s Rest；
- `primaryComparisonEligibility`：能否进入 CFₓ主比较；
- `displayComparisonEligibility`：在中值电压比较目标下能否进入主图；
- `cfx10SlopeQcStatus`：CFx10s 辅助斜率本身是否适合解释。

旧 `qcStatus` 仍在 JSON/CSV 中保留为兼容聚合字段，但不是主比较资格。CFₓ的 Rest 稳定性、脉冲容量比例、无量纲时间、早期非线性和 Endpoint–slope 差异会进入结构化 reason；它们不会因为模型条件不理想而抹掉有限的 Endpoint。ΔEs 与 ΔEt 方向冲突、缺少必要数据或协议不完整仍会被排除。

当前 GITT Endpoint 使用 CanonicalRow 物理时间轴中真实 loaded `t=0` 到 pulse 末端的 `ΔEt`。`t=0` 电流必须通过现有电流分辨率和方向判定；缺少合格记录时主 Endpoint 不可计算，不回退到首个正时间点。首个正时间点及其 legacy Endpoint 只在诊断和审计导出中保留。当前版本为 GITT algorithm `1.1.0`、scientific contract `1.5.0`。

## 导出结构

单独导出可选择 DCR 或 GITT。GITT 专项工作簿严格输出三张作图 sheet：`GITT 时间-电压`、`GITT τ-电压`、`GITT 中值电压-DLi`。其中中值电压是每个脉冲对应的 Neware 中值电压，不是回归窗口末端电压；单脉冲图的前置段、脉冲段和后置段使用连续相对时间轴；τ¹ᐟ²–电压 sheet 的横坐标为 `√τ`。低于 `comparisonTargetMedianVoltageV=1.5 V` 的记录仍在 Summary、审计、脉冲详情和正式导出中，并带有显示资格和协议截止状态；协议截止后的脉冲若 4 h 静置完成且中值电压仍不低于 1.5 V，也可进入主图。

## 代码结构

```text
src/science/                  版本化科学合同、GITT、DCR、SOC、哈希与统计
src/adapters/neware/          NDAX/NDC 文件适配与显式协议事件
src/adapters/land/            LAND CEX V7 provisional 二进制适配
src/app/                      分析编排、项目文件、安全导出
src/components/workbench/     科学工作台 UI
src/workers/                  NDAX/CEX 规范化与科学分析 Worker
tests/oracles/                独立 Python Oracle 与固定 golden
tests/qualification/          13 个真实 Neware 文件的批量资格报告
src-tauri/                    Tauri 2 最小权限 scaffold
docs/science/CFX_GITT_10S.md  CFx10s 选点、状态和科学边界
docs/validation/               真实 NDAX 回归基线和复核报告
analysis/project-closure-20260915/  本轮 QC 根因审计输出
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

诊断状态不再混同为计算失败；CFₓ的 `limited + comparative_index_only` 仍用于约束物理命名。当前 3 个真实 CFₓ NDAX 共 39 个保留脉冲，其中 36 个是完整 1200 s + 标准 Rest 主协议事件；详细数值和状态基线见 `docs/validation/CFX10_REAL_DATA_BASELINE.md`，本轮收口结论见 `PROJECT_COMPLETION_REPORT.md`。Beta 历史记录见 `docs/RELEASE_NOTES_0.1.0-beta.1.md`。
