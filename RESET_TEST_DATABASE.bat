@echo off
setlocal
cd /d "%~dp0"
echo WARNING: This deletes all data in the Herald test database and recreates the seeded sample data.
set /p CONFIRM=Type RESET to continue: 
if /I not "%CONFIRM%"=="RESET" (
  echo Cancelled.
  pause
  exit /b 0
)
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\setup-xampp.ps1" -Fresh
if errorlevel 1 (
  echo Reset failed.
  pause
  exit /b 1
)
pause
