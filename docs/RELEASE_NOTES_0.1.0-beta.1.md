# PulseLab GITT DCR 0.1.0-beta.1

## 定位

首个面向 CFₓ GITT 与 Neware DCR 实际工作流的离线 Windows Beta。该版本用于验证科学内核、数据追溯和用户流程，不宣称 Neware 直读 profile 已获得厂商批准，也不把 CFₓ 指标解释为本征扩散系数。

## 主要能力

- 直接读取 Neware NDAX；DCR 导入后零配置分析。
- GITT 自动识别 CFₓ/FGS、1200 s 脉冲、1.5 V 截止和 4 h 静置；`Stop_Volt≈1.5 V` 仍用于标记早停/后续协议状态，但后处理主比较改由 `comparisonTargetMedianVoltageV=1.50 V` 筛选，不再全局截断首次截止后的可识别事件。
- 用户只需确认或修改极片单面几何、活性物质质量、材料密度和摩尔质量；不填写误差率、不确定度、仪器分辨率、噪声或 QC 阈值。
- CF₁ 默认比较密度为 `2.25 g/cm³`，理论比容量为 `865 mAh/g`。
- GITT 正式科学内核使用平面 Weppner–Huggins `4/π` 端点公式；辅助 `E–√t` 图去掉首点后固定拟合后续 5 个唯一时间点。
- CFₓ 主名称统一为“WH 平面模型表观传输比较指标”，解释范围固定为 `limited + comparative_index_only`。
- DCR 使用小电流放电 → 静置 → 大电流放电阶段的终止电压和阶段电流中位数，按 `R=(E1-E2)/(I1-I2)` 计算论文法 DCR。
- CSV、XLSX、Manifest 使用统一导出模型，并保留物理参数、结果状态、哈希、版本和解释边界。
- 报告页新增单独导出 DCR、单独导出 GITT；项目 XLSX 按结果、完整曲线、脉冲响应、`E–√t`、D-电压等用途分 sheet，并统一使用带单位的作图列名。
- GITT 电压–Dli 图增加纵轴刻度翻转按钮，默认匹配论文示例的 `1E-17` 到 `1E-9` 显示方向。
- CFₓ 主 `D_app–中值电压` 图使用 `comparisonTargetMedianVoltageV=1.50 V`；它与真实 `1.5 V` 终端协议截止分开记录。低于目标、早停和协议截止后的结果不删除，继续进入 Summary、审计、脉冲详情和导出；协议截止后的脉冲若 4 h 静置完成且中值电压仍不低于目标，可进入主图，并标记 `displayComparisonEligibility` / `post_protocol_cutoff`。

## 已知限制

- Neware profile 为 `provisional`；现有逐行 parity 来源是独立自导出，不是厂商官方导出。
- 电压/电流量化分辨率与电流跃迁采集延迟缺少厂商批准证据，因此部分 DCR 结果会保持 review/not-computable。
- CF₁ `2.25 g/cm³` 是项目比较口径；密度测量方法和标准不确定度未建立时，传播不确定度不会被伪造。
- LAND CEX 不直接读取。
- 安装包未代码签名，Windows 可能显示未知发布者或 SmartScreen 提示。
- 独立清洁 Windows 10/11、升级安装与长期运行资格仍需单独记录。

## 升级与复算

项目文件保存 Canonical 数据和已确认配方。打开旧项目时会校验 schema 与 hash，并使用当前科学内核显式重新分析；算法、QC 或材料 preset 变化不会被描述为原结果的无变化延续。
