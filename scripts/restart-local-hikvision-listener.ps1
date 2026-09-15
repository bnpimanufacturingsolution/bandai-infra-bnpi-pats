<#
.SYNOPSIS
  Best-effort restart of the VM Hikvision hot-reload listener via local BNPI PATS API.
#>
param(
  [string]$ApiBase = "http://localhost:3001",
  [string]$Email = "admin@bandai.local",
  [string]$Password = "password123",
  [int]$WaitHealthSeconds = 0
)

$ErrorActionPreference = "Stop"

function Wait-Api {
  param([int]$Seconds)
  if ($Seconds -le 0) { return }
  $deadline = (Get-Date).AddSeconds($Seconds)
  while ((Get-Date) -lt $deadline) {
    try {
      $h = Invoke-RestMethod -Uri "$ApiBase/health" -TimeoutSec 3
      if ($h.status -eq "healthy") { return }
    } catch {}
    Start-Sleep -Seconds 2
  }
}

Wait-Api -Seconds $WaitHealthSeconds

try {
  $health = Invoke-RestMethod -Uri "$ApiBase/health" -TimeoutSec 5
  if ($health.status -ne "healthy") {
    Write-Host "[listener-restart] API not healthy; skip."
    exit 0
  }
} catch {
  Write-Host "[listener-restart] API not reachable; skip (normal during predev before listen)."
  exit 0
}

try {
  $loginBody = @{ email = $Email; password = $Password; appCode = "bnpi-pats" } | ConvertTo-Json -Compress
  $login = Invoke-RestMethod -Method Post "$ApiBase/api/auth/login" -ContentType "application/json" -Body $loginBody -TimeoutSec 20
  $token = $login.data.token
  if (-not $token) { throw "login failed" }
  $headers = @{ Authorization = "Bearer $token" }
  $body = @{ action = "restart" } | ConvertTo-Json -Compress
  $r = Invoke-RestMethod -Method Post "$ApiBase/api/device/hikvision/listener" -Headers $headers -ContentType "application/json" -Body $body -TimeoutSec 120
  Write-Host "[listener-restart] $($r.message) armed=$($r.data.status.sdk.armed) receiving=$($r.data.status.sdk.receivingCallbacks) state=$($r.data.status.sdk.state)"
} catch {
  Write-Host "[listener-restart] Failed: $($_.Exception.Message)"
  exit 0
}
