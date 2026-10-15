<div align="center">
  <img src="docs/assets/pulselab-readme-hero.svg" alt="PulseLab 深色品牌横幅：电压脉冲曲线、GITT 与 DCR 电池分析" width="100%">

  <h1>让每一段脉冲，都有迹可循</h1>
  <p>面向电池材料研究的 GITT / DCR 本地分析工作台：从原始测试文件到可复核结果与作图数据。</p>
  <p><sub>Traceable analysis for electrochemical pulse data.</sub></p>

  <a href="package.json"><img src="https://img.shields.io/badge/version-0.1.0--beta.4-43B5C5?style=flat-square" alt="当前版本 0.1.0 beta 4"></a>
  <a href="src-tauri/tauri.conf.json"><img src="https://img.shields.io/badge/desktop-Tauri%202-43B5C5?style=flat-square" alt="桌面框架 Tauri 2"></a>

  <p>
    <a href="#项目简介">项目简介</a> ·
    <a href="#核心能力">核心能力</a> ·
    <a href="#算法依据">算法依据</a> ·
    <a href="#快速开始">快速开始</a> ·
    <a href="#导出作图数据">导出作图数据</a> ·
    <a href="#参考文献">参考文献</a>
  </p>
</div>

---

## 项目简介

PulseLab 帮助电池材料研究者整理 Neware 与 LAND 脉冲测试数据，查看 GITT / DCR 分析结果，并导出可在 Origin 等绘图软件中继续作图的数据。

## 核心能力

| 使用场景 | 当前功能 |
| --- | --- |
| 批量查看测试 | 导入支持的 `.ndax`、`.cex` 文件，按样品查看原始曲线与分析事件；可多选移除或清空当前项目，不删除原始文件。 |
| DCR 分析 | 识别小电流放电、静置和大电流放电事件，查看差分 DCR 结果及诊断信息。 |
| CFₓ / FGS GITT | 查看中值电压展示范围内的电压–时间曲线、单脉冲响应，以及以放电中值电压为横坐标的 WH Endpoint 比较结果。 |
| 复核与比较 | 保留逐脉冲结果和 QC 信息；共同电压范围只筛选实测点，不插值补点。 |

新项目预填 12 mm 极片直径，并使用统一的 CFx 体系选择；质量按文件独立识别，冲突时确认来源。不同文件使用不同颜色，D–电压图的纵轴为 log10 对数轴，主刻度按整十次幂显示，计算和导出的 D 仍保留原始数值。

项目可保存为分块的 `.pulselab` 文件，再打开时校验数据哈希；旧 JSON 项目仍可读取。文件按顺序分析，移除文件时释放对应缓存，降低大文件操作的内存峰值；实际容量仍受本机可用内存影响。

## 分析流程

1. 导入测试文件，软件按支持的文件配置读取时间、电压、电流及工步信息。
2. 查看样品分类、曲线和逐脉冲结果；必要时检查协议状态与诊断原因。
3. 导出分组后的 XLSX 数据，在绘图软件中继续比较或复核。

## 算法依据

下面区分文献中的理论、源码实际采用的计算方式，以及项目自行约定的窗口和比较规则。引用论文不代表它验证了本软件或 CFₓ 材料的全部模型假设。

### GITT：WH Endpoint 主结果

主结果沿用 Weppner–Huggins（WH）GITT 的平面扩散近似表达式，输出单位为 cm²·s⁻¹。[[1]](#ref-1)

$$
D_{\mathrm{app}}=\frac{4L_{\mathrm{eq}}^2}{\pi\tau}\left(\frac{\Delta E_s}{\Delta E_t}\right)^2,
\qquad L_{\mathrm{eq}}=\frac{mV_m}{MS}
$$

| 量 | 当前源码的定义 |
| --- | --- |
| $\Delta E_t$ | `pulseEndVoltageV − pulseT0VoltageV`；起点必须是物理时间轴上已加载电流、方向一致的真实 *t* = 0 记录。缺少合格起点时主结果不可计算，不用首个正时间点替代。 |
| $\Delta E_s$ | `postRestEndPotentialV − preRestEndPotentialV`；两端来自下述静置尾段估计，不是直接取最后一个电压点。 |
| $\tau$ | 当前 pulse 的实际持续时间，单位 s；不是辅助回归窗口的长度。 |
| $L_{\mathrm{eq}}$ | 活性质量 $m$（g）、摩尔体积 $V_m$（cm³·mol⁻¹）、摩尔质量 $M$（g·mol⁻¹）与单面圆形电极面积 $S$（cm²）得到的等效材料厚度。若 $V_m=M/\rho$，则等于 $m/(\rho S)$，不是直接测得的颗粒扩散长度。 |

放电时两个电位差通常为负；公式取比值的平方，但计算仍检查方向一致性。实现见 [Endpoint 主计算](src/science/gitt/analyze.ts)、[loaded t=0 取点](src/science/gitt/endpoint.ts)和[等效几何](src/science/gitt/geometry.ts)。

### 静置末端：Theil–Sen 稳健估计

先合并相同物理时间的记录，再对静置尾段做 Theil–Sen 回归：斜率取两点斜率的中位数，截距取残差截距的中位数，最后在实际静置末端求电位。Sen 的论文支持这种斜率估计方法，不规定本项目的静置窗口。[[2]](#ref-2)

当前窗口为 `min(T_rest, max(60 s, 0.20 × T_rest))`。另外计算最近 900 s、300 s 与原始末点作为敏感性审计，不替换正式 ΔEs 或 D。尾段稳定也不等于已经达到热力学平衡。实现见 [静置估计](src/science/gitt/rest.ts)、[回归实现](src/science/math/statistics.ts)和[窗口敏感性审计](src/science/gitt/restSensitivity.ts)。

### √t 回归：辅助诊断，不替代主值

对 $E$–$\sqrt{t}$ 做普通最小二乘直线拟合，取得斜率 $k$（V·s⁻¹ᐟ²）、R² 和 RMSE；对应的辅助指标为：

$$
D_{\mathrm{slope}}=\frac{4}{\pi}\left(\frac{L_{\mathrm{eq}}\Delta E_s}{\tau k}\right)^2
$$

√t 关系来自 GITT 的短时扩散近似；拟合窗口、有效表面积和早期极化都会影响估计值。[[1]](#ref-1) [[3]](#ref-3) 本项目的 `CFx_10s` 固定选择 `0 < t ≤ 64 s`，另保留 legacy first-5 对照；这些是采样条件下的项目约定，不是文献规定的通用窗口。实现见 [回归选点与诊断](src/science/gitt/fit.ts)和[辅助指标公式](src/science/gitt/regressionMetric.ts)。

### DCR：两电流终止电压法

当前主结果比较小电流与大电流放电阶段：

$$
R_{\mathrm{DCR}}=\frac{E_{\mathrm{small,end}}-E_{\mathrm{large,end}}}{I_{\mathrm{small}}-I_{\mathrm{large}}}
$$

电压取各阶段最后有效记录，电流取各阶段记录的中位数；电流统一用 A，结果为 Ω，不能把 mA 直接代入后仍标为 Ω。实现见 [差分 DCR](src/science/dcr/analyzeDifferential.ts)。

电池脉冲电阻通常用电压变化与电流变化之比表征，但结果随测量时长变化，可能包含不同程度的极化。[[4]](#ref-4) 该文献提供测量原理与时间尺度依据，不代表它规定了本项目的两阶段末端取点或 50、150、250、350 min 导出坐标。这里的 DCR 不是已经分离出来的纯欧姆电阻。

### 模型适用性与比较口径

WH 近似需要合适的扩散几何、近恒定电流、局部近似不变的扩散参数、接近平衡的静置电位，以及短时条件 $\tau \ll L^2/D$；其中 $L$ 必须对应模型的实际扩散长度，不能仅由本软件的等效厚度确认条件成立。Endpoint 简化还依赖所选区间内电位对 √t 近似线性。加载 *t* = 0 是当前软件的取点约定，不自动证明欧姆压降和动力学极化已完全隔离。模型和有效面积的选择可能显著影响 GITT 估计值。[[1]](#ref-1) [[3]](#ref-3)

因此 CFₓ 结果按表观指标 $D_{\mathrm{app}}$ 使用，不把等效厚度、拟合优度或文献引用当作本征扩散系数已获验证的证明。本项目未实现文献 [3] 的直接脉冲数值拟合模型。

比较横坐标 `medianVoltageV` 是 pulse 容量变化达到 50% 时的电压，由容量–电压记录定位并在相邻点间线性插值；不是电压样本的统计中位数。1.50 V 是中值电压比较目标，设备终端 Stop_Volt 仍用于识别早停；不完整 pulse 不进入正式主图。共同电压范围只筛选合格实测结果，不插值 D、不补点。上述规则及 QC 阈值属于项目政策，不是统一行业标准。实现见 [中值电压](src/science/gitt/medianVoltage.ts)、[比较资格](src/product/cfx/literature1200sGittProfile.ts)与[QC 政策](src/science/gitt/policy.ts)；完整说明见 [CFₓ GITT 科学口径](docs/science/CFX_GITT_10S.md)。

## 快速开始

当前仓库核验到的启动方式是 Windows 源码运行。需要安装 Node.js（含 npm），首次运行会安装项目依赖：

```powershell
git clone https://github.com/Jakiewbe/GITT-DCRMaster.git
cd GITT-DCRMaster
npm install
& ".\启动 PulseLab.cmd"
```

启动脚本会运行本机服务，并在浏览器打开 PulseLab。当前仓库没有登记可验证的公开安装包下载地址；以上是源码启动方式，不是免安装包。

## 导出作图数据

| 分析 | 可直接作图的数据 |
| --- | --- |
| DCR | 时间–电压曲线（时间取整为分钟）；50、150、250、350 min 对应的四个 DCR 值。 |
| GITT | 中值电压展示范围内的时间–电压、静置–脉冲–静置、√τ–电压原始点；另含全部合格点和共同电压范围两张 D–中值电压表。 |

GITT 共同电压范围不生成新测量值；未拟合的 √τ–电压数据保留原始点，已排除 loaded *t* = 0。项目汇总 XLSX 将 DCR、GITT 和清单分别放在不同工作表中。

## 能力边界

- CFₓ WH Endpoint 是受协议与模型适用性限制的表观比较指标，不等同于已经证实的本征 Li⁺ 固相扩散系数。
- LAND CEX 仅支持已检查的 BTS V7 文件配置，解析 profile 仍为 provisional，并非厂商认证格式。
- Neware 与 LAND 的支持范围取决于软件已适配的文件版本和工步配置；无法识别的配置不会被当作已验证数据处理。

## 文档

- [CFₓ GITT 计算口径与适用范围](docs/science/CFX_GITT_10S.md)
- [LAND CEX 文件解析说明](docs/science/LAND_CEX_BINARY_V1.md)
- [0.1.0-beta.4 更新说明](docs/RELEASE_NOTES_0.1.0-beta.4.md)
- [第三方软件声明](THIRD_PARTY_NOTICES.md)

## 参考文献

参考现行 [GB/T 7714—2025](https://openstd.samr.gov.cn/bzgk/std/newGbInfo?hcno=C6CE52E55AC09B9C79A20AEA77CEDD14) 的顺序编码制著录；编号对应上文的方法依据，DOI 链接用于查阅原文。

<a id="ref-1"></a>

[1] WEPPNER W, HUGGINS R A. Determination of the Kinetic Parameters of Mixed-Conducting Electrodes and Application to the System Li3Sb[J]. Journal of The Electrochemical Society, 1977, 124(10): 1569–1578. DOI: [10.1149/1.2133112](https://doi.org/10.1149/1.2133112).

<a id="ref-2"></a>

[2] SEN P K. Estimates of the Regression Coefficient Based on Kendall's Tau[J]. Journal of the American Statistical Association, 1968, 63(324): 1379–1389. DOI: [10.1080/01621459.1968.10480934](https://doi.org/10.1080/01621459.1968.10480934).

<a id="ref-3"></a>

[3] HORNER J S, WHANG G, ASHBY D S, et al. Electrochemical Modeling of GITT Measurements for Improved Solid-State Diffusion Coefficient Evaluation[J]. ACS Applied Energy Materials, 2021, 4(10): 11460–11469. DOI: [10.1021/acsaem.1c02218](https://doi.org/10.1021/acsaem.1c02218).

<a id="ref-4"></a>

[4] BARAI A, UDDIN K, WIDANAGE W D, et al. A study of the influence of measurement timescale on internal resistance characterisation methodologies for lithium-ion cells[J]. Scientific Reports, 2018, 8(1): 21. DOI: [10.1038/s41598-017-18424-5](https://doi.org/10.1038/s41598-017-18424-5).

## 许可证

PulseLab 应用源码目前尚未声明开源许可证。`THIRD_PARTY_NOTICES.md` 仅说明第三方组件，不构成 PulseLab 本身的授权。
