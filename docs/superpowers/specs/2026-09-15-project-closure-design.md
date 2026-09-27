# CFx GITT / DCR 项目收口设计

## 设计结论

本轮不重新定义 GITT 或 DCR 数学模型。结果对象分成四条互不替代的证据链：

```text
科学计算值
  ├─ calculationState：有没有算出有限数值
  ├─ primaryEndpointQc：Endpoint 定义和输入是否可靠
  ├─ protocolStatus：是不是目标 1200 s + 14400 s 协议事件
  └─ primaryComparisonEligibility：能否进入 CFx 主比较

CFx10s 辅助回归
  └─ 点数、覆盖、线性、窗口稳定性、与 Endpoint 的方法差异
```

旧 `qcStatus` 继续作为兼容字段保留，但不再承担上述四条证据链的总判断。这样可以同时保留历史结果可追溯性和当前 CFx 比较所需的正确解释。

## 数据流

1. NDAX 解析器识别原始行、工步和时间轴。
2. GITT 科学层按现有 pulse/rest 分段计算 ΔEt、ΔEs、τ、L、Endpoint D、中值电压和固定窗口回归。
3. 科学层生成结构化 QC reason，并分别归入 endpoint 与 CFx10s 辅助回归。
4. CFx 产品层读取协议事件，处理 1200 s/1.5 V/Rest 分类，组合主比较资格。
5. UI 和导出只读取上述结果字段，不复制计算逻辑。

## 状态语义

### 计算状态

- `computed`：所需数值存在且有限；
- `not_computable`：缺少必要数据或定义无法成立；
- `not_requested`：该分析未请求。

### QC reason

每条 reason 都带固定 code、严重性、领域、实际值、阈值、来源规则和面向用户的解释。领域只使用：

- `data`
- `protocol`
- `endpoint_model`
- `cfx10_slope`
- `sampling`
- `material_input`

只有数据非有限、时间轴/必要定义失败、Endpoint 方向或输入确实无法成立等情况可以让 primary endpoint `rejected`。CFx 的小扰动、无量纲时间、早期非线性和斜率信号不足属于模型适用性或辅助斜率诊断，不应自动抹掉有限的 Endpoint 数值。

### 协议资格

CFx 主比较仅接受完整 1200 s 脉冲和标准 14400 s Rest。约 1.5 V 的早停事件保留在审计和图表中，但标为 `excluded_cutoff_early`，不混入完整协议主趋势。

## 固定数值边界

- Endpoint 公式和所有输入冻结；
- CFx10s 选点仍为 `0 < t <= 64 s`；
- generic `1–64 s` 与 CFx10s 复用同一 selector；
- CFx10s 不把回归末端当作脉冲时长，`τ` 仍是完整恒流 pulse duration；
- `initialObservedDropV = preRestEndPotentialV - firstPositiveTimePulseVoltageV`，仅表示实际首个负载观测点的早期电压变化，不命名为 IR drop，也不进入 D 计算；
- DCR 四点论文算法保持独立。

## 导出设计

GITT Summary 是面向统计的结果表，写入数值、状态、资格、reason code 和关键诊断；GITT E-sqrt(t) 是面向回归复核的点表，写入使用窗口标记、预测值和残差；GITT D-Voltage 是面向作图的中值电压-D 数据；Manifest 记录算法、QC policy、preset、数据 hash 和解释边界。DCR 继续使用单独的 DCR Results/DCR Plot Data sheet。

## 明确不做

本轮不做 adaptive window、自动选择最佳窗口、平滑或插值、AI 判窗、BET/PITT/EIS 修正、新的扩散模型、蓝电适配和任何 DCR 公式改写。
