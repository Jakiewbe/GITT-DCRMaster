# 打包版导出修复设计

## 目标

修复 Windows Tauri 打包版导出后显示错误或没有文件的问题，不改变 GITT/DCR 科学计算、数据筛选和导出表内容。

## 方案

统一由 `saveExportBlob` 负责文件落盘：

- Tauri 打包环境：将 Blob 切成固定大小的小块，通过 `write_export_chunk` 原生命令逐块写入当前用户的 `Downloads` 文件夹；
- 浏览器开发环境：使用 Blob URL 和下载链接；
- CSV、Manifest、XLSX 共用同一条路径；
- 文件名由 WebView 提供，Rust 只取文件名部分，不能写入下载目录之外。

## 验收

- Tauri bridge 逐块写入，单次 IPC 不传输完整 XLSX 字节；
- 无 Tauri bridge 时保留浏览器下载行为；
- 非法文件名被拒绝；
- TypeScript、Lint、单元测试、前端构建和 Tauri 打包通过；
- 打包版导出生成的文件可在 Downloads 中打开。
