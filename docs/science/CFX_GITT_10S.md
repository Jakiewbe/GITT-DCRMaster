# CFx GITT / CFx10s 科学口径

## 1. 适用范围

当前直接读取和规范化 Neware NDAX，以及已验证的 LAND BTS V7 CEX provisional profile。CFx 结果使用固定的 1200 s 恒流 pulse + 14400 s Rest 协议语义。设备 `Stop_Volt≈1.5 V` 只负责识别早停/截断事件；后处理主比较使用 `comparisonTargetMedianVoltageV=1.50 V`，因此首次终端触及 1.5 V 不再全局截断后续可识别事件。早停事件和后续事件均保留在审计表中。

CFx 是转化型正极。这里的 WH 结果命名为 `D_endpoint` 或表观比较传输指标，只能在相同材料、质量、几何、比电流、pulse/rest 协议下作比较，不能据此宣称本征 Li⁺ 固相扩散系数。

## 2. 主 Endpoint（冻结）

主值为：

```text
D_endpoint = 4 / (π τ) × L_equivalent² × (ΔEs / ΔEt)²
```

其中：

- `τ` 是完整恒流 pulse duration，不是回归窗口末端；
- `ΔEt = pulseEndVoltageV - pulseT0VoltageV`；`pulseT0VoltageV` 来自 CanonicalRow 物理时间轴中真实 `t = 0` 且已加载电流的记录；
- loaded t=0 的电流判据复用现有电流分辨率和 pulse 方向：电流有限、严格超过现有零电流分辨率、且方向与 pulse 中值电流一致；不要求与 pulse 中值电流完全相等；
- `pulseStartVoltageV` 仍作为兼容别名等于 `pulseT0VoltageV`；`firstPositivePulseTimeS`、`firstPositivePulseVoltageV` 及 legacy first-positive ΔEt/D 只用于审计和诊断；
- `ΔEs = postRestEndPotentialV - preRestEndPotentialV`；
- `L_equivalent = nₘVₘ/S`，在当前质量、密度和几何口径下使用等效材料厚度；
- `medianVoltageV` 直接读取/复现 Neware 脉冲容量变化 50% 对应的中值电压，用作 D–Voltage 图横坐标；它不是 pulse 末端电压，也不是回归窗口中值；
- `initialObservedDropV = preRestEndPotentialV - firstPositivePulseVoltageV`，并记录 `endpointStartTemporalResolutionS`。它是首个真实负载采样点的早期观测变化，可能包含欧姆、双电层、电荷转移和早期反应极化，绝不命名为 IRDrop，也不进入 D 计算；`onsetObservedDropV = preRestEndPotentialV - pulseT0VoltageV`，`earlyPolarizationDropV = pulseT0VoltageV - firstPositivePulseVoltageV`，同样只作诊断。
- 没有合格 loaded t=0 时，主 Endpoint 不可计算，不回退到 first-positive；legacy first-positive 结果仍可导出但不进入主结果。

本轮只修正 Endpoint 脉冲起点定义和比较筛选策略；公式、ΔEs、pulse duration、几何、medianVoltageV、CFx_10s / legacy first-5 回归、协议分段、Stop_Volt 事件识别、质量处理和 DCR 均保持不变。`comparisonTargetMedianVoltageV=1.50 V` 只决定是否进入主 D_app–medianVoltage 图，不参与任何 D 计算。GITT algorithm version 为 `1.1.0`，scientific contract version 为 `1.5.0`。

## 3. Rest-end 窗口敏感性审计

正式 `ΔEs` 仍使用当前 `min(restDuration, max(60 s, 20% × restDuration))` 尾段的 Theil–Sen 末端估计。本轮只增加以下 audit-only 对照：

- `restEndCurrentWindowV`：当前正式窗口；
- `restEnd15minV`：最近 `min(restDuration, 900 s)`；
- `restEnd5minV`：最近 `min(restDuration, 300 s)`；
- `restEndRawLastPointV`：最新物理时间的最后一个 CanonicalRow 原始点。

前三者都使用 unique physical time、同一个 Theil–Sen 实现并外推到实际 Rest 末端；`restEndRobustSpreadV` 只比较前三者，不包含 Raw last。程序同时计算四组电位差、三组 ΔEs 和三组 D 的 audit 值及 `log10(D)` 差异，但不改变正式 `postRestEndPotentialV`、`preRestEndPotentialV`、`deltaEsV`、`metricValueCm2PerS`、QC 或 DCR。本轮不写入 warning threshold，不自动迁移正式窗口。真实数据结果见 `analysis/rest-end-sensitivity-audit/REST_END_SENSITIVITY_AUDIT_REPORT.md`。

## 4. CFx10s 辅助回归

CFx10s 选点规则固定为：

```text
0 < t <= 64 s
```

它与 generic `1–64 s` 在数学选点上复用同一个 fixed-time-window selector，不能形成两套数值。`CFx_10s` 这个 preset 的额外含义是：历史数据约每 10 s 才记录一个恒流点，因此必须报告实际唯一点数、窗口覆盖、线性等级、窗口稳定性和 Endpoint–slope 方法差异。

- 至少 5 个唯一点才可形成辅助拟合；
- 5 个点为部分覆盖/复核，至少 6 个点为 full coverage；
- `R² ≥ 0.995`：strong linearity；
- `0.980 ≤ R² < 0.995`：acceptable/review；
- `R² < 0.980`：early response nonlinear；
- 回归使用 `E` 对 `√t`，但不能把 fit end 当成完整 pulse duration；
- Legacy first 5 是稳健性参考，不是 CFx 主值，也不因为没有通过辅助回归门槛而否定 Endpoint。

CFx10s 的 slope D 只作早期响应诊断。它与 `D_endpoint` 的 log10 差异应被报告和复核，不能互相替代。

## 5. 状态解释

每个 GITT 脉冲同时输出四层信息：

1. `calculationState`：必要数值是否存在且有限；
2. `primaryEndpointQcStatus`：Endpoint 的数据、符号和定义是否成立；
3. `protocolStatus`：事件是否符合完整 1200 s + 标准 Rest；
4. `primaryComparisonEligibility`：是否进入 CFx 主比较趋势。

`cfx10SlopeQcStatus` 只描述辅助斜率。旧 `qcStatus` 是兼容聚合字段，仍写入导出但不再是主比较结论。

QC reason 必须同时带 `code`、`severity`、`domain`、实际 `value`、`threshold`、`sourceRule` 和具体说明。CFx 的静置尾部漂移、容量占比、无量纲时间、平衡电压步长、早期曲率和 Endpoint–slope 差异属于模型/测量诊断；只有数据非有限、必要定义无法成立或 ΔEs/ΔEt 方向矛盾等情况才会让 Endpoint 被拒绝。

## 6. DCR 边界

DCR 独立使用论文四点/两电流终止电压方法：

```text
R = (E₁ - E₂) / (I₁ - I₂)
```

GITT 的 QC 状态不会改变 DCR 事件识别、I₁/I₂、E₁/E₂、ΔV、ΔI 或 DCR 公式。

## 7. 当前限制

- LAND CEX 当前以 `land-cex-binary-v1@0.3.0-provisional` 接入；电流直接由 `+6..+7` 原始电流码按官方 LAND `Rec.Current` 对照得到的 `1 / 32256000 A` 比例解码。该比例是代码 LSB 证据，不是仪器准确度规格；电压分辨率仍未提供，因此结果保留 review 状态。
- CFx WH 结果仍是同协议比较指标，不是本征扩散证明；
- 当前约 10 s 采样限制早期回归分辨率；
- 本轮不做 adaptive window、平滑/插值、AI 判窗、BET/PITT/EIS 修正或新扩散模型；
- 真实 3 文件基线和本轮状态审计见 `docs/validation/CFX10_REAL_DATA_BASELINE.md`。
