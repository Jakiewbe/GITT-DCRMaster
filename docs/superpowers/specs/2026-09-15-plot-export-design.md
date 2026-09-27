# 图表单位与分层导出设计

## 目标

统一 GITT/DCR 图表的论文单位和坐标轴，并提供 DCR、GITT 单独导出与项目总表导出。原始 Canonical 数据和科学计算结果不改变，只有展示层和导出组织调整。

## 图表口径

- GITT 全循环与单脉冲响应：横轴 `Time / min`，纵轴 `Voltage / V`。
- GITT 辅助回归：横轴 `t¹ᐟ² / s¹ᐟ²`，纵轴 `Voltage / V`。
- GITT 结果趋势：横轴 `Voltage / V`，纵轴 `D_app / cm²·s⁻¹`，纵轴使用对数刻度。
- DCR 趋势：横轴 `Cycle`，纵轴 `DCR / Ω`。

## 导出结构

单独导出只包含对应分析类型。项目总 XLSX 按用途分 Sheet：DCR 结果与作图数据、GITT 汇总与四组作图数据、Manifest 和 CFₓ profile。列中的数值保持数值类型，单位写入列名。

## 验收

类型检查、Lint、全量测试和生产构建通过；导出模型测试确认单独导出不混入另一种分析，XLSX Sheet 名称和作图列名稳定。
