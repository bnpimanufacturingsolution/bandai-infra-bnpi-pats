param(
  [string]$GuestIp = '',
  [int]$TimeoutSeconds = 5
)

$ErrorActionPreference = 'Continue'

function Test-HealthUrl {
  param([string]$Name, [string]$Url)
  try {
    $response = Invoke-RestMethod -Uri $Url -TimeoutSec $TimeoutSeconds
    [pscustomobject]@{ Name = $Name; Status = 'PASS'; Url = $Url; Detail = ($response | ConvertTo-Json -Compress) }
  } catch {
    [pscustomobject]@{ Name = $Name; Status = 'FAIL'; Url = $Url; Detail = $_.Exception.Message }
  }
}

$checks = @(
  (Test-HealthUrl 'host-local-hris-api' 'http://127.0.0.1:3001/health'),
  (Test-HealthUrl 'host-local-hris-app-health' 'http://127.0.0.1:3000/health')
)

if ($GuestIp) {
  $checks += & "$PSScriptRoot\verify-lan-health.ps1" -GuestIp $GuestIp -TimeoutSeconds $TimeoutSeconds
}

$checks | Format-Table -AutoSize

if (($checks | Where-Object Status -eq 'FAIL').Count -gt 0) {
  exit 1
}
