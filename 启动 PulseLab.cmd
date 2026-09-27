@echo off
setlocal
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\start-pulselab.ps1"
if errorlevel 1 (
  echo.
  echo PulseLab 启动失败。
  pause
)
endlocal
