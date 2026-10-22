@echo off
setlocal
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "$ErrorActionPreference='Stop'; $h=Invoke-RestMethod 'http://127.0.0.1:8080/api/v1/health'; $paths=@('/app','/branch-management','/branch-1','/branch-2','/branch-3','/branch-4'); foreach($path in $paths){$p=Invoke-WebRequest -UseBasicParsing ('http://127.0.0.1:8080'+$path); if($p.StatusCode -ne 200){throw ($path+' did not return HTTP 200')}; Write-Host ($path+': OK')}; Write-Host ('API/database: ' + ($h | ConvertTo-Json -Compress))"
if errorlevel 1 (
  echo.
  echo Connection check failed. Start Herald with START_HERALD.bat, then run this file again.
  pause
  exit /b 1
)
echo.
pause
