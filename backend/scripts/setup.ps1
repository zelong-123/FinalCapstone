$ErrorActionPreference = "Stop"
$Root = Resolve-Path (Join-Path $PSScriptRoot "..\..")
& (Join-Path $Root "SETUP_XAMPP.bat")
