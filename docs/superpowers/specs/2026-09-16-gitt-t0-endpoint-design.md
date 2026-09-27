# GITT loaded t=0 Endpoint 定义修正设计

## 目标

将 GITT Endpoint 主算法的脉冲起点从“第一个 `t > 0` 点”改为“当前 pulse 工步中真实 `t = 0` 且已加载电流的 CanonicalRow 记录”。本次修改只改变 Endpoint `ΔEt` 及其直接派生量，不改变 ΔEs、CFx_10s slope、几何、协议分段或 DCR。

## 已确认的现状

- `src/science/gitt/analyze.ts` 当前从 `buildPulseTimeline(aggregateUniqueTicks(...))` 得到时间轴，但把第一个 `timeS > 0` 点作为 `pulseStartVoltageV`。
- `aggregateUniqueTicks` 已按同一 `analysisStepId` 和物理时间合并重复点，并对电压、电流取平均，同时保留源行 ID。
- 当前 GITT 配置没有传入 current resolution；Neware 适配器已经能从同一份 measurement-resolution evidence 得到 current resolution，因此需要把它传入 GITT science core。
- ΔEs 由 `diagnoseRest` 的尾段选择、重复时间合并、Theil–Sen 回归和静置末端外推得到；本轮冻结。
- median voltage 使用 pulse 容量中点插值；本轮冻结。

## 正式定义

### loaded t=0

从已经聚合的当前 pulse 时间轴中选择满足以下条件的唯一点：

1. `stepElapsedTimeNs === 0n`，或使用现有时间轴表示的等价物理零点；不使用裸浮点 `time === 0`，不新建时间归一化。
2. 电压和电流均为 finite。
3. `abs(currentA)` 超过已有 current resolution 定义的零电流容差；不引入无来源阈值。
4. 电流符号与 pulse 的已确认方向一致。方向基准使用现有 pulse current 方向逻辑；不要求与 median current 数值相等。

合格点记为 `pulseT0VoltageV`。t=0 重复记录必须先经过现有 CanonicalRow 物理时间聚合，不能为 Endpoint 另建合并规则。

### Endpoint

```text
deltaEtV = pulseEndVoltageV - pulseT0VoltageV
D_endpoint = 4 / (π × pulseDurationS) × L² × (deltaEsV / deltaEtV)²
```

缺少合格 loaded t=0 时，`pulseT0VoltageV`、`deltaEtV` 和主 Endpoint D 均为 `null`，并产生稳定的 Endpoint reason code；不得回退到第一个正时间点。

### 诊断字段

继续保存 `firstPositivePulseTimeS` 和 `firstPositivePulseVoltageV`，新增：

- `legacyFirstPositiveDeltaEtV = pulseEndVoltageV - firstPositivePulseVoltageV`
- `legacyFirstPositiveEndpointMetricValueCm2PerS`
- `deltaEtDefinitionDifferenceV = deltaEtV - legacyFirstPositiveDeltaEtV`
- `endpointDRatioVsLegacy`
- `endpointStartTimeS = 0`（仅在合格 t=0 存在时）
- `onsetObservedDropV = preRestEndPotentialV - pulseT0VoltageV`
- `earlyPolarizationDropV = pulseT0VoltageV - firstPositivePulseVoltageV`
- `preRestToFirstPositiveDropV = preRestEndPotentialV - firstPositivePulseVoltageV`

旧 `initialObservedDropV` 保留原来的 pre-rest 到 first-positive 语义，作为 deprecated alias；旧 `endpointStartTemporalResolutionS` 保留其历史 first-positive time 语义，作为 deprecated alias。

新增的 `preRestLastRawVoltageV`、`postRestLastRawVoltageV`、`deltaEsRawV` 和 robust/raw 差值只用于审计，不能替换主 `deltaEsV`。

## 不变量

必须保持数值不变：`preRestEndPotentialV`、`postRestEndPotentialV`、`deltaEsV`、`pulseEndVoltageV`、`pulseDurationS`、`medianVoltageV`、geometry/L、CFx_10s 选点与全部拟合量、legacy first-5 slope、`windowStabilityDecades`、DCR、protocol/cutoff/mass handling。

允许改变：`pulseT0VoltageV`、`deltaEtV`、Endpoint D、legacy-vs-new 对照字段、`methodDivergenceDecades` 及直接依赖 Endpoint 的 QC。

## 版本和追溯

保持 `algorithmId = WH_PLANAR_MANUAL_ENDPOINT`，将 GITT algorithm version 从 `1.0.0` 升至 `1.1.0`，scientific contract version 从 `1.4.0` 升至 `1.5.0`。Manifest 继续使用现有 key-value 行结构，新增 Endpoint provenance 行，不改变 Manifest 结构版本；如实现过程中改动结构化 Manifest 类型，则同步升级该版本并在报告中说明。

## 验证和交付

先保存 3 个真实 CFx NDAX 的旧 Endpoint baseline，再用失败测试锁定 t=0、零电流、方向冲突、缺失 t=0、重复 t=0 和 signed ΔEt。实现后重新分析 3 个 NDAX，验证 Step Summary 仅作 oracle，统计新旧 ΔEt/D、早期响应分解、QC/eligibility 变化及全部冻结字段回归，并生成 `analysis/gitt-t0-endpoint-migration/GITT_T0_ENDPOINT_MIGRATION_REPORT.md`。完成报告后停止继续修改科学模型。
