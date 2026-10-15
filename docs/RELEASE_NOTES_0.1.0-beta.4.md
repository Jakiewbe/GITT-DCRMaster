# PulseLab 0.1.0-beta.4

- 正式 Windows 程序使用图形界面子系统，启动时不再附带控制台黑窗；开发调试保留控制台输出。
- 安装包构建检查实际 EXE 的子系统，错误的控制台正式程序不会复制到交付目录。
- 源码启动脚本隐藏开发服务的后台窗口；启动失败仍明确报错，可运行 `npm run dev` 查看诊断。

本次仅修复启动和打包，不修改 GITT / DCR 计算、数据、比较筛选或导出定义。

修复依据：[Rust 的 Windows 子系统说明](https://doc.rust-lang.org/reference/runtime.html#the-windows_subsystem-attribute)。
