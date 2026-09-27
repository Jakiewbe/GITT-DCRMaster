# 高倍率主图中值电压下限设计说明

## 目标

对比电流大于或等于 500 mA·g⁻¹ 的 CFₓ GITT 数据，保留真实实验协议的 1.5 V 终端截止判据；同时在主 `D_app–Voltage` 比较图中设置 `medianVoltageV >= 1.5 V` 的显示/比较下限。中值电压低于 1.5 V 的结果不删除，只从主比较图中排除，并保留在 GITT Summary、audit、pulse detail 和正式导出中。协议截止后的脉冲若 4 h 静置完成且中值电压仍不低于 1.5 V，也可按高倍率主图规则进入比较。

比电流低于 500 mA·g⁻¹ 的数据继续使用现有主图和协议资格规则。

## 两层规则

### 第一层：协议截止

协议截止仍由原始 CanonicalRow / NDAX trace 和文件中声明的 `Stop_Volt` 判定。放电时，原始脉冲记录第一次满足：

```text
voltageV <= stopVoltageV + existingCutoffToleranceV
```

的事件仍是 cutoff event；后续循环不属于标准完整 GITT 协议序列。不能用中值电压替代这一判据，也不能把实验协议的 1.5 V 改成 1.0 V。

### 第二层：高倍率主比较下限

仅当项目已有的等效比电流满足：

```text
equivalentSpecificCurrentMahPerG >= 500
```

时，在主 `D_app–Voltage` 比较图中增加：

```text
medianVoltageV >= 1.5 V
```

的显示/比较下限。这个字段来自 NDAX 已有的脉冲中值电压，表示脉冲容量变化中点对应的负载电压；它不是实验截止电压，也不参与 Endpoint、ΔEt、ΔEs 或 D 的重新计算。

## 数据保留和使用

- 协议截止前且通过现有科学 QC 的标准 pulse：进入主比较图和导出。
- 协议截止前但 `medianVoltageV < 1.5 V` 的高倍率 pulse：保留数值和状态，但不进入主 `D_app–Voltage` 图。
- 协议截止后的 pulse：不伪装成标准完整 GITT 主序列，但如果 4 h 静置完成、结果可计算且中值电压仍不低于 1.5 V，可获得高倍率主图资格；仍明确标记为 `post_protocol_cutoff`。其协议状态和主图资格分别记录。
- 低于 500 mA·g⁻¹：不启用中值电压下限，保持旧规则。
- 任何缺失中值电压、缺失 Rest、缺失 loaded t=0 或不可计算结果都不能静默降级为合格主图点。

主图的“显示/比较资格”与“是否保留数据”必须是两个字段，不能用删除结果数组的方式实现显示下限。

## 不改变的科学量

- GITT Endpoint、ΔEt、ΔEs 和 WH 公式；
- loaded t=0 选择和缺失 t=0 的不可计算规则；
- `pulseEndVoltageV`、`pulseDurationS`、`medianVoltageV` 原始读取值；
- CFx_10s 选点、slope、R²、RMSE、legacy first-5 slope 和 window stability；
- DCR、几何参数、等效厚度、活性质量和 protocol/cutoff 解析。

## UI 与导出

- 主 `D_app–Voltage` 图只绘制通过既有数值/QC资格且满足高倍率中值电压下限的点。
- GITT Summary、audit、pulse detail 和正式导出仍包含被主图下限排除的点。
- 每条保留记录必须带有：`specificCurrentMahPerG`、`medianVoltageV`、`primaryComparisonEligibility`、`displayComparisonEligibility`、`sequenceClassification`、`protocolCutoffState` 和已有审计数值结果。
- `medianVoltageV < 1.5 V` 的记录显示为“低于高倍率主比较下限”，不得显示为“实验截止”或“数据删除”。
- 主图、表格和导出使用同一份结果状态；UI 层不得再次自行判断协议截止。

## 测试验收标准

- 比电流为 499.999 mA·g⁻¹时，`medianVoltageV < 1.5 V` 的点仍按旧规则处理。
- 比电流为 500 mA·g⁻¹且 `medianVoltageV = 1.5 V` 时，点可以进入主比较图。
- 比电流为 500 mA·g⁻¹且 `medianVoltageV = 1.499 V` 时，点保留在 Summary/audit/detail/export，但不进入主比较图。
- 协议截止后的 pulse 在 4 h 静置完成且 `medianVoltageV >= 1.5 V` 时，可进入高倍率主比较图；低于 1.5 V 时只保留审计。
- 真实原始轨迹第一次到达 Stop_Volt 的协议截止判断保持不变。
- 协议截止后的记录不会被伪装成标准完整 GITT 点，但可在审计和导出中追溯。
- 共同 pulse 的 Endpoint、ΔEt、ΔEs、D、DCR、CFx_10s 和其他冻结字段数值不变。
- 主图点数与 `displayComparisonEligibility` 一致；导出行数与保留结果一致。

## 采用方案

采用“协议截止负责定义实验序列，中值电压下限负责高倍率主图比较”的双层方案。它不修改真实协议，也不删除原始分析结果，只限制高倍率主 `D_app–Voltage` 图的比较范围。
