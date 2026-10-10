# LAND CEX binary profile v1

当前项目对 LAND `.cex` 的直接读取只覆盖已检查的 LAND BTS V7 二进制样本，profile id 为 `land-cex-binary-v1`，当前解析器版本为 `0.4.0-provisional`。这不是厂家格式认证。

## 已确认并写入 CanonicalRow 的字段

- 记录时间：每条 16 字节记录的 `+0..+3`，小端 `uint32`，单位为 10 ms tick；Canonical 的 `timeResolutionNs` 为 `10_000_000`。
- 电压：`+4..+5`，小端无符号电压码；官方 LAND `Rec.Voltage` 对照确认 `voltageV = voltageCode / 5376`。
- 电流：`+6..+7`，小端有符号 16 位原始电流码；按每条记录标记中的量程码解码：code 5 为 1 mA 量程，使用 32,256,000 counts/A；code 4 为 10 mA 量程，使用 3,225,600 counts/A。10 mA 量程映射已与 LANDdt 的 Current/mA 导出交叉核对。0 表示 Rest，负值表示放电，正值表示充电。
- 累计容量：`+8..+11`，小端 float32，已经是 Ah 存储值；不再进行额外缩放。
- 累计能量候选：`+12..+15`，小端 float32；只作为原始证据保留，不进入 GITT/DCR 科学计算。
- 文件头 `+0x1c` 的 float32 被用于读取活性物质质量（g），再换算为 mg。

对于已识别为 GITT 的观察样本，文件头中的 `0x23c`、`0x274`、`0x294` 分别提供约 1200 s 脉冲时长、约 14400 s 后静置时长和截止电压 1.5 V。它们只作为程序证据写入 `programSteps`，用于协议/事件状态判定；脉冲电压、静置电压和所有科学量仍然只来自 CanonicalRow 原始轨迹。缺少这些字段时不伪造 GITT 程序证据；DCR 文件不会因此被识别为 GITT。

## 当前明确的边界

LAND CEX 的电流直接读取原始记录中的有符号电流码，不再用累计容量变化反推；缩放比例由该记录的电流量程码决定。量程映射和代码 LSB 证据仍标记为 provisional；代码 LSB 不是仪器准确度规格。电压分辨率证据仍不可用。

因此，现有 GITT/DCR 公式、Endpoint、ΔEt、ΔEs、medianVoltage 和 DCR 代码没有改写；CEX 现在可以按原始电流码通过 t=0 电流判据并计算 Endpoint/DCR，结果仍因 provisional profile 与电压分辨率缺失保留 review 诊断。

## 接入位置

- 解析与 Canonical 归一化：`src/adapters/land/cex.ts`
- 导入入口：`src/workers/normalize.worker.ts` 与 `src/App.tsx`
- LAND 协议识别：`src/adapters/neware/events.ts` 中的 LAND profile 分支
- 真实文件和合成结构测试：`src/adapters/land/cex.test.ts`

## 不应做的事情

- 不把 `+6..+7` 原始整数直接当作安培数；必须使用已验证的 `1 / 32256000 A` 比例。
- 不把 `+12` 能量字段当作 DCR/GITT 输入。
- 不用 Step Summary、XLSX 或 LANDdt 导出值替代原始 CEX CanonicalRow。
- 不因为解析成功就把 profile 从 `provisional` 升级为 approved。
