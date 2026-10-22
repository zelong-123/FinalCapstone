@echo off
setlocal
cd /d "%~dp0"
for %%D in (C D E F) do if exist "%%D:\xampp\php\php.exe" set "PHP=%%D:\xampp\php\php.exe"
if not defined PHP (
  echo XAMPP PHP was not found. Run SETUP_XAMPP.bat first.
  pause
  exit /b 1
)
if not exist "%~dp0backend\vendor\autoload.php" (
  echo Composer dependencies are missing. Run SETUP_XAMPP.bat first.
  pause
  exit /b 1
)
cd /d "%~dp0backend"
"%PHP%" artisan test
if errorlevel 1 (
  echo.
  echo Tests failed. Review the output above.
  pause
  exit /b 1
)
echo.
echo All Laravel tests passed.
pause
