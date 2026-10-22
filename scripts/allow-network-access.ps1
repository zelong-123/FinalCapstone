$ErrorActionPreference = 'Stop'
$ruleName = 'Herald Local Network Port 8080'

$existing = Get-NetFirewallRule -DisplayName $ruleName -ErrorAction SilentlyContinue
if ($existing) {
    Set-NetFirewallRule -DisplayName $ruleName -Enabled True -Profile Private -Action Allow | Out-Null
    Write-Host "Herald firewall access is already enabled for private networks." -ForegroundColor Green
} else {
    New-NetFirewallRule `
        -DisplayName $ruleName `
        -Direction Inbound `
        -Action Allow `
        -Protocol TCP `
        -LocalPort 8080 `
        -Profile Private `
        -RemoteAddress LocalSubnet `
        -Description 'Allows Herald branch laptops on the same private LAN to reach the central server.' | Out-Null
    Write-Host "Herald port 8080 is now allowed from the local subnet on Private networks." -ForegroundColor Green
}

Write-Host "Make sure the Windows network profile is set to Private, then restart START_HERALD.bat." -ForegroundColor Yellow
