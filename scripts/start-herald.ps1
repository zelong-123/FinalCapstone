
param([string]$XamppPath = "")
$ErrorActionPreference = "Stop"
$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$BackendRoot = Join-Path $ProjectRoot "backend"

function Find-Xampp([string]$RequestedPath) {
    $candidates = @()
    if ($RequestedPath) { $candidates += $RequestedPath }
    if ($env:XAMPP_HOME) { $candidates += $env:XAMPP_HOME }

    # Check the actual XAMPP installation first.
    $candidates += @(
        "C:\xampp-new",
        "C:\xampp",
        "D:\xampp",
        "E:\xampp",
        "F:\xampp"
    )

    foreach ($candidate in ($candidates | Select-Object -Unique)) {
        # Skip missing folders before using Join-Path.
        if (-not (Test-Path -LiteralPath $candidate -PathType Container)) {
            continue
        }

        if (
            (Test-Path -LiteralPath (Join-Path $candidate "php\php.exe")) -and
            (Test-Path -LiteralPath (Join-Path $candidate "mysql\bin\mysqladmin.exe"))
        ) {
            return (Resolve-Path -LiteralPath $candidate).Path
        }
    }

    throw "XAMPP was not found. Expected C:\xampp-new. Check your XAMPP installation."
}

function Read-DotEnv([string]$Path) {
    $values = @{}
    foreach ($line in Get-Content $Path) {
        $trimmed = $line.Trim()
        if (-not $trimmed -or $trimmed.StartsWith('#') -or -not $trimmed.Contains('=')) {
            continue
        }
        $parts = $trimmed.Split('=', 2)
        $values[$parts[0].Trim()] = $parts[1].Trim().Trim('"').Trim("'")
    }
    return $values
}

$xampp = Find-Xampp $XamppPath
$php = Join-Path $xampp "php\php.exe"
$mysqlAdmin = Join-Path $xampp "mysql\bin\mysqladmin.exe"
$envFile = Join-Path $BackendRoot ".env"

if (-not (Test-Path $envFile)) {
    throw "Laravel environment is missing. Run SETUP_XAMPP.bat first."
}

$envValues = Read-DotEnv $envFile
$dbHost = if ($envValues.DB_HOST) { $envValues.DB_HOST } else { '127.0.0.1' }
$dbPort = if ($envValues.DB_PORT) { $envValues.DB_PORT } else { '3306' }
$dbUser = if ($envValues.DB_USERNAME) { $envValues.DB_USERNAME } else { 'root' }
$dbPassword = if ($null -ne $envValues.DB_PASSWORD) { $envValues.DB_PASSWORD } else { '' }

if (-not (Test-Path (Join-Path $BackendRoot "vendor\autoload.php"))) {
    throw "Backend dependencies are missing. Run SETUP_XAMPP.bat first."
}
if (-not (Test-Path (Join-Path $BackendRoot "public\app\index.html"))) {
    throw "Frontend build is missing. Run npm install and npm run build from the project root."
}
if (-not (Test-Path (Join-Path $BackendRoot "public\branch-1\index.html"))) {
    throw "Branch portal files are missing. Re-extract the complete Herald package."
}

$pingArgs = @('-h', $dbHost, '-P', $dbPort, '-u', $dbUser)
if ($dbPassword) { $pingArgs += "--password=$dbPassword" }
$pingArgs += 'ping'
& $mysqlAdmin @pingArgs 2>$null | Out-Null

if ($LASTEXITCODE -ne 0) {
    throw "XAMPP MySQL is not reachable with the settings in backend\.env. Start MySQL and verify DB_HOST, DB_PORT, DB_USERNAME, and DB_PASSWORD."
}

$portInUse = Get-NetTCPConnection -LocalPort 8080 -State Listen -ErrorAction SilentlyContinue
if ($portInUse) {
    try {
        $health = Invoke-WebRequest -UseBasicParsing -Uri "http://127.0.0.1:8080/api/v1/health" -TimeoutSec 4
        if ($health.StatusCode -eq 200) {
            Write-Host "Herald is already running on port 8080." -ForegroundColor Yellow
            Start-Process "http://127.0.0.1:8080/app"
            exit 0
        }
    }
    catch {
        throw "Port 8080 is occupied by another application. Stop that application or free port 8080 before starting Herald."
    }
}

$lanIps = @(
    Get-NetIPAddress -AddressFamily IPv4 -AddressState Preferred -ErrorAction SilentlyContinue |
    Where-Object {
        $_.IPAddress -notmatch '^127\.' -and
        $_.IPAddress -notmatch '^169\.254\.'
    } |
    Select-Object -ExpandProperty IPAddress -Unique
)

Write-Host "Starting Herald on this computer and the local network." -ForegroundColor Green
Write-Host "Main site: http://127.0.0.1:8080/app"
Write-Host "Branch panel: http://127.0.0.1:8080/branch-management"
Write-Host "Branch sites: http://127.0.0.1:8080/branch-1 through /branch-4"

foreach ($ip in $lanIps) {
    Write-Host "LAN main site: http://${ip}:8080/app" -ForegroundColor Cyan
    Write-Host "LAN branch panel: http://${ip}:8080/branch-management" -ForegroundColor Cyan
    Write-Host "LAN branches: http://${ip}:8080/branch-1  /branch-2  /branch-3  /branch-4" -ForegroundColor Cyan
}

Write-Host "Keep this window open. Press Ctrl+C to stop the Herald server." -ForegroundColor Yellow
Write-Host "If another laptop cannot connect, run ALLOW_NETWORK_ACCESS.bat once as administrator." -ForegroundColor Yellow

$browserCommand = '$ready=$false; for($i=0;$i -lt 45;$i++){ try { $response=Invoke-WebRequest -UseBasicParsing -Uri "http://127.0.0.1:8080/api/v1/health" -TimeoutSec 2; if($response.StatusCode -eq 200){$ready=$true; break} } catch {}; Start-Sleep -Seconds 1 }; if($ready){Start-Process "http://127.0.0.1:8080/app"}'
Start-Process powershell.exe -WindowStyle Hidden -ArgumentList '-NoProfile', '-Command', $browserCommand

Push-Location $BackendRoot
try {
    & $php 'artisan' 'serve' '--host=0.0.0.0' '--port=8080'
    if ($LASTEXITCODE -ne 0) {
        throw "Laravel server exited with code $LASTEXITCODE."
    }
}
finally {
    Pop-Location
}
