@echo off
setlocal EnableExtensions
color 0A
set "UPDATE_DIR=%~dp0"
for %%I in ("%UPDATE_DIR%..") do set "PROJECT_ROOT=%%~fI"

if not exist "%PROJECT_ROOT%\backend\artisan" (
  echo The update folder is not inside the Herald project folder.
  echo.
  set /p "PROJECT_ROOT=Paste the full path of your Herald project folder: "
)

if not exist "%PROJECT_ROOT%\backend\artisan" (
  echo.
  echo ERROR: backend\artisan was not found in:
  echo %PROJECT_ROOT%
  echo Move the extracted HERALD_UPDATE_V3 folder inside the Herald project folder, then run this file again.
  pause
  exit /b 1
)

if not exist "%UPDATE_DIR%payload\backend\public\branch-assets\branch.js" (
  echo ERROR: Update payload is incomplete. Extract the ZIP again.
  pause
  exit /b 1
)

echo.
echo Herald V3 Reliability and Mobile Update
echo Project: %PROJECT_ROOT%
echo.
echo Close START_HERALD.bat before continuing.
pause

set "BACKUP=%PROJECT_ROOT%\_before_v3_update"
if not exist "%BACKUP%" mkdir "%BACKUP%"
if exist "%PROJECT_ROOT%\backend\public\branch-assets\branch.js" copy /Y "%PROJECT_ROOT%\backend\public\branch-assets\branch.js" "%BACKUP%\branch.js" >nul
if exist "%PROJECT_ROOT%\backend\public\branch-assets\branch.css" copy /Y "%PROJECT_ROOT%\backend\public\branch-assets\branch.css" "%BACKUP%\branch.css" >nul
if exist "%PROJECT_ROOT%\backend\public\app\assets\index-CRZ0giTV.js" copy /Y "%PROJECT_ROOT%\backend\public\app\assets\index-CRZ0giTV.js" "%BACKUP%\index-CRZ0giTV.js" >nul

echo Installing corrected files...
xcopy "%UPDATE_DIR%payload\*" "%PROJECT_ROOT%\" /E /I /Y /Q >nul
if errorlevel 1 (
  echo ERROR: Windows could not copy the update files.
  pause
  exit /b 1
)

set "PHP_EXE=%PROJECT_ROOT%\..\..\php\php.exe"
if not exist "%PHP_EXE%" set "PHP_EXE=C:\xampp\php\php.exe"
if not exist "%PHP_EXE%" set "PHP_EXE=D:\xampp\php\php.exe"
if not exist "%PHP_EXE%" set "PHP_EXE=E:\xampp\php\php.exe"
if not exist "%PHP_EXE%" set "PHP_EXE=F:\xampp\php\php.exe"

if exist "%PHP_EXE%" (
  pushd "%PROJECT_ROOT%\backend"
  "%PHP_EXE%" artisan optimize:clear
  popd
) else (
  echo.
  echo XAMPP PHP was not found automatically. Run SETUP_XAMPP.bat once before starting Herald.
)

echo.
echo UPDATE COMPLETED SUCCESSFULLY.
echo Start Herald again with START_HERALD.bat.
echo Main branch panel: http://SERVER_IP:8080/branch-management
echo A Branches link will also appear in the Admin and Logistics sidebar.
echo.
pause
