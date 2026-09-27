# CFx GITT / DCR 项目完善与工程收口计划

> 这份计划按当前真实项目状态执行。科学内核的 Endpoint、ΔEt、ΔEs、τ、L、medianVoltage、脉冲分段、1.5 V 截断和 DCR 论文公式均为冻结项。

## 目标

让项目可以稳定地分析当前 Neware NDAX 数据，并且让“数值算出来”“协议能不能用于主比较”“WH 模型条件是否理想”“CFx10s 斜率是否可靠”四类信息彼此不冲突。最终交付可追溯的 QC 根因审计、结构化回归基线、分层导出、说明文档和完整验证报告。

## 结构约束

- `src/science/gitt` 只负责科学计算和诊断，不由 UI 或导出层重新计算。
- `src/product` 负责 CFx 1200 s/14400 s 协议语义、主比较资格和用户说明。
- `src/app` 只负责组合已经计算好的字段、界面显示和表格序列化。
- `src/adapters/neware` 只负责 NDAX/NDC 解析、事件识别和真实数据装配。
- CFx10s 与 generic `1–64 s` 复用同一个 fixed-time-window 选点函数，只在 preset、采样覆盖、稳定性和导出语义上区分。
- 禁止引入 adaptive window、自动最优窗口、平滑/插值、AI 判窗、BET/PITT/EIS 修正或新的扩散模型。

## 执行任务

### 1. 生成修改前的真实数据 QC 根因审计

新增一次性可复现的分析脚本/测试，读取当前项目中的 3 个真实 NDAX，按 39 个保留脉冲统计：旧 `qcStatus`、每条 `qcFinding` 的规则、旧状态、实际值、阈值、对应 CFx10s 窗口质量和协议分类。输出匿名 source hash、文件级统计和脉冲级明细，不写入本机私有路径。

验收：能明确解释当前 `valid/review/rejected` 分布及每条拒绝规则的数量；原始报告不被覆盖。

### 2. 先写测试，冻结新状态契约

为结构化 QC reason、primary endpoint 状态、CFx10s 状态、协议状态和主比较资格新增单元测试及契约测试。测试覆盖：

- 真正的数据/定义错误可以 `reject`；
- CFx 的 WH 小扰动、无量纲时间、早期非线性等只成为模型/斜率诊断；
- 计算值有限且协议合格时，主比较资格为 `included` 或 `included_with_warnings`；
- 计算不可得、1.5 V 早停、脉冲或静置不完整时，不进入主比较；
- `qcStatus` 保留兼容字段，但界面和导出不再把它当作主比较结论。

### 3. 实现结构化 QC 和集中策略

修改 `src/science/contracts.ts`、`src/science/qc.ts`、`src/science/gitt/policy.ts` 和 `src/science/gitt/analyze.ts`：

- 增加稳定的 `QcReason`：`code`、`severity`、`domain`、`value`、`threshold`、`sourceRule`、`message`；
- 为现有规则建立集中目录，区分 `data`、`protocol`、`endpoint_model`、`cfx10_slope`、`sampling`、`material_input`；
- 把 CFx10s 的 64 s、点数、R² 分级和采样覆盖阈值放入 policy；
- 让 endpoint 的有限性、方向一致性、必要输入和时间轴错误决定真正的计算失败；
- 保留模型适用性指标和原始值，不将 CFx 转化电极强行解释为本征扩散；
- 输出 `primaryEndpointQcStatus`、`primaryEndpointQcReasons`、`cfx10SlopeQcStatus`、`cfx10SlopeQcReasons` 和 `primaryComparisonEligibility`；
- `GITT_ALGORITHM` 版本保持 1.0.0，CFx10s 辅助拟合版本保持已冻结版本；只提升 QC policy/scientific contract 版本。

### 4. 在产品层落实协议状态

修改 `src/product/cfx/literature1200sGittProfile.ts` 及其测试：

- 将完整 1200 s + 标准 Rest、1.5 V 早停、脉冲不完整、Rest 不完整、非标准 Rest 明确分类；
- 生成 `protocolStatus` 和 `primaryComparisonEligibility`；
- 只让完整协议且 endpoint 有限的结果进入主比较，带模型警告的结果进入 `included_with_warnings`；
- DCR 计算和状态保持独立，只沿用清晰的产品状态命名。

### 5. 建立真实数据回归基线

从现有 3 个匿名 NDAX 结果建立结构化 oracle，至少冻结每个保留脉冲的：Endpoint D、ΔEt、ΔEs、中值电压、脉冲时长、CFx10s D、斜率、R²、实际起止时间、窗口稳定性、方法差异、initialObservedDropV。

新增回归测试验证修改前后冻结字段逐项一致；另增 QC 审计报告输出旧/新状态分布、各旧规则计数和每条规则的保留/降级/移除结论。

### 6. 完善 UI 和导出

修改 `src/components/workbench/GittLiteratureDiagnostics.tsx`、`src/App.tsx`、`src/app/exportRows.ts`、`src/app/xlsx.ts` 及测试：

- 主结果区显示 endpoint 数值、primary endpoint 状态、协议状态、主比较资格；
- 辅助区显示 CFx10s 点数、覆盖、R²、线性等级、窗口稳定性和原因；
- 诊断区显示旧兼容 `qcStatus` 与结构化原因，但不再用单一红色状态否定有限 endpoint；
- 所有原因带规则来源、实际值、阈值和具体提示；
- GITT Summary、GITT E-sqrt(t)、GITT D-Voltage、Manifest 写入新状态和原因；
- 维持 DCR 独立导出和现有分 sheet 结构；导出层不新增科学计算。

### 7. 文档和项目收口

新增/更新：

- `README.md`：正式说明当前仅支持 Neware NDAX、CFx 口径、DCR 论文公式、工作流、状态层级、导出和限制；
- `docs/science/CFX_GITT_10S.md`：CFx10s 的选点、首点定义、回归诊断、主 endpoint 与辅助斜率边界；
- `docs/validation/CFX10_REAL_DATA_BASELINE.md`：匿名 hash、3 文件/39 脉冲基线、数值不变性和 QC 审计；
- `PROJECT_COMPLETION_REPORT.md`：按用户要求的 14 个固定章节记录事实、判断、改动、测试、构建和剩余限制。

### 8. 工程验证

按真实 `package.json` 脚本执行：

1. `npm run typecheck`
2. `npm run lint`
3. `npm run test:run`
4. `npm run build`

同时执行真实 3 个 NDAX 的回归/审计脚本。若历史分析脚本存在 lint 错误，只做不改变科学结果的明确清理，并在最终报告单独说明。

## 完成标准

- Endpoint、ΔEt、ΔEs、medianVoltage、pulse duration、DCR 数值与冻结基线一致；
- 新状态能解释旧 rejected，而不是掩盖旧规则；
- 3 个真实 NDAX 的每个保留脉冲都有可追溯的 QC reason；
- CFx10s 的点数、采样覆盖、窗口稳定性和方法差异可在 UI、导出和文档中复核；
- README、科学说明、验证基线和项目完成报告齐全；
- typecheck、lint、测试和 build 的通过/失败数量有真实命令证据。
