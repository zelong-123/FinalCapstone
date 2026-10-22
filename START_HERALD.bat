@echo off
setlocal
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\start-herald.ps1"
if errorlevel 1 (
  echo.
  echo HERALD DID NOT START. Read the message above.
  pause
  exit /b 1
)
