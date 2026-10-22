param(
    [string]$XamppPath = "",
    [switch]$Fresh
)

$ErrorActionPreference = "Stop"
$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$BackendRoot = Join-Path $ProjectRoot "backend"
$ToolsRoot = Join-Path $ProjectRoot "tools"
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

function Write-Step([string]$Message) {
    Write-Host "`n==> $Message" -ForegroundColor Cyan
}

function Find-Xampp([string]$RequestedPath) {
    $candidates = @()
    if ($RequestedPath) { $candidates += $RequestedPath }
    if ($env:XAMPP_HOME) { $candidates += $env:XAMPP_HOME }
    $candidates += @("C:\xampp", "D:\xampp", "E:\xampp", "F:\xampp")

    foreach ($candidate in ($candidates | Select-Object -Unique)) {
        if ((Test-Path (Join-Path $candidate "php\php.exe")) -and
            (Test-Path (Join-Path $candidate "mysql\bin\mysql.exe"))) {
            return (Resolve-Path $candidate).Path
        }
    }
    throw "XAMPP was not found. Install XAMPP 8.2, or run: powershell -ExecutionPolicy Bypass -File scripts\setup-xampp.ps1 -XamppPath C:\your\xampp"
}

function Read-DotEnv([string]$Path) {
    $values = @{}
    foreach ($line in Get-Content $Path) {
        $trimmed = $line.Trim()
        if (-not $trimmed -or $trimmed.StartsWith('#') -or -not $trimmed.Contains('=')) { continue }
        $parts = $trimmed.Split('=', 2)
        $value = $parts[1].Trim().Trim('"').Trim("'")
        $values[$parts[0].Trim()] = $value
    }
    return $values
}

function Set-DotEnvValue([string]$Path, [string]$Name, [string]$Value) {
    $content = Get-Content $Path -Raw
    $pattern = "(?m)^$([regex]::Escape($Name))=.*$"
    $line = "$Name=$Value"
    if ($content -match $pattern) {
        $content = [regex]::Replace($content, $pattern, $line)
    } else {
        $content = $content.TrimEnd() + "`r`n$line`r`n"
    }
    $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
    [System.IO.File]::WriteAllText($Path, $content, $utf8NoBom)
}

function Invoke-Checked {
    param(
        [Parameter(Mandatory=$true)][string]$FilePath,
        [Parameter(ValueFromRemainingArguments=$true)][string[]]$Arguments
    )
    & $FilePath @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw "Command failed ($LASTEXITCODE): $FilePath $($Arguments -join ' ')"
    }
}

function Resolve-Composer([string]$PhpExe) {
    $command = Get-Command composer -ErrorAction SilentlyContinue
    if ($command) { return @{ Type = 'command'; Path = $command.Source } }

    $localComposer = Join-Path $ToolsRoot "composer.phar"
    if (Test-Path $localComposer) { return @{ Type = 'phar'; Path = $localComposer } }

    Write-Step "Composer was not found; downloading a verified local copy"
    New-Item -ItemType Directory -Force -Path $ToolsRoot | Out-Null
    $installer = Join-Path $ToolsRoot "composer-setup.php"
    $signatureFile = Join-Path $ToolsRoot "composer-installer.sig"

    try {
        Invoke-WebRequest -UseBasicParsing "https://getcomposer.org/installer" -OutFile $installer
        Invoke-WebRequest -UseBasicParsing "https://composer.github.io/installer.sig" -OutFile $signatureFile
    } catch {
        throw "Composer is required and could not be downloaded. Connect to the internet or install Composer for Windows, then run SETUP_XAMPP.bat again. Details: $($_.Exception.Message)"
    }

    $expected = (Get-Content $signatureFile -Raw).Trim().ToLowerInvariant()
    $actual = (Get-FileHash $installer -Algorithm SHA384).Hash.ToLowerInvariant()
    if ($expected -ne $actual) {
        Remove-Item $installer -Force -ErrorAction SilentlyContinue
        throw "Composer installer signature verification failed. Nothing was installed."
    }

    Invoke-Checked $PhpExe $installer "--install-dir=$ToolsRoot" "--filename=composer.phar" "--quiet"
    Remove-Item $installer, $signatureFile -Force -ErrorAction SilentlyContinue
    return @{ Type = 'phar'; Path = $localComposer }
}

function Invoke-Composer($Composer, [string]$PhpExe, [string[]]$Arguments) {
    if ($Composer.Type -eq 'phar') {
        Invoke-Checked $PhpExe $Composer.Path @Arguments
    } else {
        Invoke-Checked $Composer.Path @Arguments
    }
}

Write-Host "Herald XAMPP Setup" -ForegroundColor Green
Write-Host "This setup uses XAMPP PHP and MariaDB. Docker is not required."

$xampp = Find-Xampp $XamppPath
$php = Join-Path $xampp "php\php.exe"
$mysql = Join-Path $xampp "mysql\bin\mysql.exe"
$mysqlAdmin = Join-Path $xampp "mysql\bin\mysqladmin.exe"
Write-Step "Using XAMPP at $xampp"

$phpVersion = (& $php -r "echo PHP_VERSION;").Trim()
if ([version]$phpVersion -lt [version]"8.2.0") {
    throw "Herald requires PHP 8.2 or newer. Detected XAMPP PHP $phpVersion. Install XAMPP 8.2."
}
Write-Host "PHP $phpVersion detected."

$requiredExtensions = @('ctype','curl','dom','fileinfo','filter','hash','mbstring','openssl','pcre','pdo','pdo_mysql','session','tokenizer','xml')
$missing = @()
foreach ($extension in $requiredExtensions) {
    & $php -r "exit(extension_loaded('$extension') ? 0 : 1);"
    if ($LASTEXITCODE -ne 0) { $missing += $extension }
}
if ($missing.Count -gt 0) {
    throw "Missing PHP extensions in $xampp\php\php.ini: $($missing -join ', '). Enable them, restart XAMPP, and run setup again."
}

$envFile = Join-Path $BackendRoot ".env"
if (-not (Test-Path $envFile)) {
    Copy-Item (Join-Path $BackendRoot ".env.xampp.example") $envFile
}
$dumpBinary = (Join-Path $xampp "mysql\bin\mysqldump.exe").Replace('\', '/')
Set-DotEnvValue $envFile 'MYSQLDUMP_BINARY' $dumpBinary
$envValues = Read-DotEnv $envFile
$dbHost = if ($envValues.DB_HOST) { $envValues.DB_HOST } else { '127.0.0.1' }
$dbPort = if ($envValues.DB_PORT) { $envValues.DB_PORT } else { '3306' }
$dbName = if ($envValues.DB_DATABASE) { $envValues.DB_DATABASE } else { 'herald' }
$dbUser = if ($envValues.DB_USERNAME) { $envValues.DB_USERNAME } else { 'root' }
$dbPassword = if ($null -ne $envValues.DB_PASSWORD) { $envValues.DB_PASSWORD } else { '' }

if ($dbName -notmatch '^[A-Za-z0-9_]+$') { throw "Unsafe DB_DATABASE value in backend\.env: $dbName" }
if ($dbUser -notmatch '^[A-Za-z0-9_@.-]+$') { throw "Unsafe DB_USERNAME value in backend\.env: $dbUser" }

Write-Step "Checking XAMPP MariaDB"
$pingArgs = @('-h', $dbHost, '-P', $dbPort, '-u', $dbUser)
if ($dbPassword) { $pingArgs += "--password=$dbPassword" }
$pingArgs += 'ping'
& $mysqlAdmin @pingArgs 2>$null | Out-Null
if ($LASTEXITCODE -ne 0) {
    throw "MariaDB is not reachable. Open XAMPP Control Panel, start MySQL, then run SETUP_XAMPP.bat again. If your root password is not blank, update DB_PASSWORD in backend\.env."
}

Write-Step "Creating the '$dbName' database if needed"
$mysqlArgs = @('-h', $dbHost, '-P', $dbPort, '-u', $dbUser)
if ($dbPassword) { $mysqlArgs += "--password=$dbPassword" }
$mysqlArgs += @('--default-character-set=utf8mb4', '-e', "CREATE DATABASE IF NOT EXISTS ``$dbName`` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;")
Invoke-Checked $mysql @mysqlArgs

$composer = Resolve-Composer $php
Write-Step "Installing PHP dependencies"
Push-Location $ProjectRoot
try {
    Invoke-Composer $composer $php @('install', "--working-dir=$BackendRoot", '--no-interaction', '--prefer-dist', '--optimize-autoloader')
} finally {
    Pop-Location
}

Push-Location $BackendRoot
try {
    $currentEnv = Get-Content $envFile -Raw
    if ($currentEnv -notmatch '(?m)^APP_KEY=base64:.+$') {
        Write-Step "Generating the Laravel application key"
        Invoke-Checked $php 'artisan' 'key:generate' '--force'
    }

    Write-Step "Creating and updating database tables"
    if ($Fresh) {
        Invoke-Checked $php 'artisan' 'migrate:fresh' '--seed' '--force'
    } else {
        Invoke-Checked $php 'artisan' 'migrate' '--force'
        Invoke-Checked $php 'artisan' 'db:seed' '--force'
    }

    Write-Step "Clearing caches and validating routes"
    Invoke-Checked $php 'artisan' 'optimize:clear'
    Invoke-Checked $php 'artisan' 'route:list' '--path=api/v1'
} finally {
    Pop-Location
}

$frontendIndex = Join-Path $BackendRoot "public\app\index.html"
if (-not (Test-Path $frontendIndex)) {
    throw "The prebuilt frontend is missing. Install Node.js 22, then run npm install and npm run build from the project root."
}

$branchManagementIndex = Join-Path $BackendRoot "public\branch-management\index.html"
if (-not (Test-Path $branchManagementIndex)) {
    throw "The Branches management panel is missing. Re-extract the complete Herald package."
}

foreach ($branchNumber in 1..4) {
    $branchIndex = Join-Path $BackendRoot "public\branch-$branchNumber\index.html"
    if (-not (Test-Path $branchIndex)) {
        throw "Branch portal $branchNumber is missing. Re-extract the complete Herald package."
    }
}

Write-Host "`nHerald setup completed successfully." -ForegroundColor Green
Write-Host "1. Double-click START_HERALD.bat"
Write-Host "2. Open http://127.0.0.1:8080/app on the server computer"
Write-Host "3. For other laptops, run ALLOW_NETWORK_ACCESS.bat once and use the LAN URLs printed by START_HERALD.bat"
Write-Host "4. Open phpMyAdmin at http://localhost/phpmyadmin and select database '$dbName'"
Write-Host "5. Login: admin@franchisetitan.local / Password123!"
Write-Host "`nChange the seeded passwords before shared or production use." -ForegroundColor Yellow
