param(
  [string]$GuestIp = '',
  [int]$TimeoutSeconds = 5
)

$ErrorActionPreference = 'Continue'

function Test-HealthUrl {
  param(
    [string]$Name,
    [string]$Url,
    [ValidateSet('json','html')]
    [string]$Expected = 'json'
  )
  try {
    if ($Expected -eq 'html') {
      $response = Invoke-WebRequest -Uri $Url -TimeoutSec $TimeoutSeconds -UseBasicParsing
      [pscustomobject]@{ Name = $Name; Status = 'PASS'; Url = $Url; Detail = "HTTP $($response.StatusCode) $($response.Headers['Content-Type'])" }
    } else {
      $response = Invoke-RestMethod -Uri $Url -TimeoutSec $TimeoutSeconds
      [pscustomobject]@{ Name = $Name; Status = 'PASS'; Url = $Url; Detail = ($response | ConvertTo-Json -Compress) }
    }
  } catch {
    [pscustomobject]@{ Name = $Name; Status = 'FAIL'; Url = $Url; Detail = $_.Exception.Message }
  }
}

$checks = @(
  (Test-HealthUrl 'host-local-prod-app' 'http://127.0.0.1:3000/auth/login' 'html'),
  (Test-HealthUrl 'host-local-prod-api' 'http://127.0.0.1:3001/health'),
  (Test-HealthUrl 'host-local-prod-emp-app' 'http://127.0.0.1:3300/auth/login' 'html'),
  (Test-HealthUrl 'host-local-dev-app' 'http://127.0.0.1:3100/auth/login' 'html'),
  (Test-HealthUrl 'host-local-dev-api' 'http://127.0.0.1:3101/health'),
  (Test-HealthUrl 'host-local-dev-emp-app' 'http://127.0.0.1:3310/auth/login' 'html'),
  (Test-HealthUrl 'host-local-uat-app' 'http://127.0.0.1:3200/auth/login' 'html'),
  (Test-HealthUrl 'host-local-uat-api' 'http://127.0.0.1:3201/health'),
  (Test-HealthUrl 'host-local-uat-emp-app' 'http://127.0.0.1:3320/auth/login' 'html')
)

if ($GuestIp) {
  $checks += & "$PSScriptRoot\verify-lan-health.ps1" -GuestIp $GuestIp -TimeoutSeconds $TimeoutSeconds
}

$checks | Format-Table -AutoSize

if (($checks | Where-Object Status -eq 'FAIL').Count -gt 0) {
  exit 1
}
