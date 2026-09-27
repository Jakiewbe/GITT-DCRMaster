# 共同电压窗口导出实施计划

## 目标

在不改变任何科学计算结果的前提下，为 GITT 导出同时提供全部正式合格点和所有样品共同中值电压范围内的点。

## 固定规则

- 共同窗口只使用 `primaryComparisonEligibility` 已通过且 D_Li、`medianVoltageV` 有效的点。
- 每个样品先求自己的真实 `medianVoltageV` 最小值和最大值。
- `commonMin = max(sampleMin)`，`commonMax = min(sampleMax)`。
- 只筛选，不插值、不补点、不改变原始点数和 D 值。
- 无共同区间时，`Common_Voltage_Range` 为空，不回退到完整数据。
- 高倍率中值电压下限已经在现有资格集合中执行，本轮不重复实现。

## 导出结构

- `GITT 时间-电压`：每个样品一组 X/Y 列，使用完整样品轨迹。
- `GITT 静置-脉冲-静置`：每个样品一组 X/Y 列，按脉冲顺序拼接完整的前静置–脉冲–后静置响应，脉冲之间用空值行断线。
- `GITT τ-电压`：每个样品一组 X/Y 列，使用去掉 loaded t=0 的原始 `sqrt(t)` 点。
- `Full_Eligible_Data`：每个样品一组 X/Y 列，全部正式合格中值电压–D_Li 点。
- `Common_Voltage_Range`：相同列结构，只保留共同窗口内的真实点。

## 实施与验证

1. 先为共同窗口、无交集、重复样品名和不同点数补失败测试。
2. 修改导出纯函数和两处 XLSX 导出入口。
3. 更新 Sheet 计划和导出说明。
4. 运行定向测试、GITT 真实数据测试、类型检查、构建和差异检查。
5. 不修改 GITT/DCR 科学内核。
