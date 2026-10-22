param([string]$XamppPath = "")
$ErrorActionPreference = "Stop"
$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$BackendRoot = Join-Path $ProjectRoot "backend"

$candidates = @()
if ($XamppPath) { $candidates += $XamppPath }
if ($env:XAMPP_HOME) { $candidates += $env:XAMPP_HOME }
$candidates += @("C:\xampp", "D:\xampp", "E:\xampp", "F:\xampp")
$xampp = $null
foreach ($candidate in ($candidates | Select-Object -Unique)) {
    if (Test-Path (Join-Path $candidate "php\php.exe")) { $xampp = $candidate; break }
}
if (-not $xampp) { throw "XAMPP was not found." }

$php = Join-Path $xampp "php\php.exe"
Write-Host "XAMPP: $xampp"
& $php -v

$required = @('curl','dom','fileinfo','mbstring','openssl','pdo_mysql','tokenizer','xml')
foreach ($ext in $required) {
    & $php -r "echo extension_loaded('$ext') ? '[OK] $ext' : '[MISSING] $ext'; echo PHP_EOL;"
}

Write-Host "Main frontend build: $((Test-Path (Join-Path $BackendRoot 'public\app\index.html')))"
foreach ($branchNumber in 1..4) {
    $branchPath = Join-Path $BackendRoot ("public\branch-{0}\index.html" -f $branchNumber)
    Write-Host "Branch $branchNumber portal: $((Test-Path $branchPath))"
}
Write-Host "Laravel environment: $((Test-Path (Join-Path $BackendRoot '.env')))"
Write-Host "Composer dependencies: $((Test-Path (Join-Path $BackendRoot 'vendor\autoload.php')))"

if (Test-Path (Join-Path $BackendRoot 'vendor\autoload.php')) {
    Push-Location $BackendRoot
    try {
        & $php artisan about
        if ($LASTEXITCODE -ne 0) { throw "Laravel validation failed." }
    } finally { Pop-Location }
}
