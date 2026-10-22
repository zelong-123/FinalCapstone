@echo off
setlocal EnableExtensions
color 0A
set "FIX_DIR=%~dp0"
set "PROJECT_ROOT="

rem Try the current working folder first.
if exist "%CD%\backend\artisan" set "PROJECT_ROOT=%CD%"

rem Try the hotfix folder's parent and grandparent.
if not defined PROJECT_ROOT (
  for %%I in ("%FIX_DIR%..") do if exist "%%~fI\backend\artisan" set "PROJECT_ROOT=%%~fI"
)
if not defined PROJECT_ROOT (
  for %%I in ("%FIX_DIR%..\..") do if exist "%%~fI\backend\artisan" set "PROJECT_ROOT=%%~fI"
)

if not defined PROJECT_ROOT (
  echo Paste the full path of the Herald folder containing backend and START_HERALD.bat.
  set /p "PROJECT_ROOT=Herald project path: "
)

if not exist "%PROJECT_ROOT%\backend\artisan" (
  echo.
  echo ERROR: backend\artisan was not found in:
  echo %PROJECT_ROOT%
  echo.
  echo Use this folder on your computer:
  echo F:\xampp\htdocs\herald-2.1-four-branch-shared-database-xampp\herald-2.0-premium-xampp
  pause
  exit /b 1
)

if not exist "%FIX_DIR%payload\backend\routes\web.php" (
  echo ERROR: Hotfix files are missing. Extract the ZIP before running this file.
  pause
  exit /b 1
)

echo.
echo HERALD SUPPLY REQUEST 404 HOTFIX
echo Project: %PROJECT_ROOT%
echo.
echo IMPORTANT: Close the START_HERALD server window before continuing.
pause

set "BACKUP=%PROJECT_ROOT%\_before_404_hotfix"
if not exist "%BACKUP%" mkdir "%BACKUP%"
if exist "%PROJECT_ROOT%\backend\routes\web.php" copy /Y "%PROJECT_ROOT%\backend\routes\web.php" "%BACKUP%\web.php" >nul
if exist "%PROJECT_ROOT%\backend\public\app\live-sync.js" copy /Y "%PROJECT_ROOT%\backend\public\app\live-sync.js" "%BACKUP%\live-sync.js" >nul

copy /Y "%FIX_DIR%payload\backend\routes\web.php" "%PROJECT_ROOT%\backend\routes\web.php" >nul
if errorlevel 1 goto copy_error
copy /Y "%FIX_DIR%payload\backend\public\app\live-sync.js" "%PROJECT_ROOT%\backend\public\app\live-sync.js" >nul
if errorlevel 1 goto copy_error

set "PHP_EXE="
for %%P in ("F:\xampp\php\php.exe" "C:\xampp\php\php.exe" "D:\xampp\php\php.exe" "E:\xampp\php\php.exe") do if not defined PHP_EXE if exist "%%~P" set "PHP_EXE=%%~P"

if defined PHP_EXE (
  pushd "%PROJECT_ROOT%\backend"
  "%PHP_EXE%" artisan optimize:clear
  "%PHP_EXE%" artisan route:list --path=app
  popd
) else (
  echo WARNING: XAMPP PHP was not found automatically. The files were copied, but cache was not cleared.
)

echo.
echo HOTFIX COMPLETED SUCCESSFULLY.
echo 1. Run START_HERALD.bat again.
echo 2. Open http://127.0.0.1:8080/app
echo 3. Press Ctrl+F5 once.
echo 4. Open Supply Requests and change a status.
echo.
pause
exit /b 0

:copy_error
echo ERROR: Windows could not copy the hotfix files. Close Herald and run this file again.
pause
exit /b 1
