@echo off
setlocal
cd /d "%~dp0"
echo Requesting administrator permission to allow Herald on the private local network...
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "Start-Process powershell.exe -Verb RunAs -Wait -ArgumentList '-NoProfile','-ExecutionPolicy','Bypass','-File','%~dp0scripts\allow-network-access.ps1'"
if errorlevel 1 (
  echo.
  echo NETWORK ACCESS WAS NOT ENABLED. Run this file again and approve the administrator prompt.
  pause
  exit /b 1
)
echo.
pause
