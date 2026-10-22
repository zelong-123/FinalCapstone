@echo off
setlocal
cd /d "%~dp0"
echo Herald XAMPP setup is starting...
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\setup-xampp.ps1"
if errorlevel 1 (
  echo.
  echo SETUP FAILED. Read the message above, correct the issue, and run this file again.
  pause
  exit /b 1
)
echo.
pause
