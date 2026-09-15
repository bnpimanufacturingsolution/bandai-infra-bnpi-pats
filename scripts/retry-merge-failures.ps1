<#
.SYNOPSIS
  Retry failed Hikvision merge peer-copy rows from a failure.jsonl ledger.

.DESCRIPTION
  Reads durable failure rows (from HIKVISION_MERGE_LEDGER_DIR or an evidence path),
  groups by sourceDeviceId + vendorUserId, and re-runs batch copy-user for remaining
  targets. Circuit-skips and timeouts are eligible. Does not invent biometrics.

.EXAMPLE
  powershell -File scripts/retry-merge-failures.ps1 `
    -LedgerDir .runtime/merge-fast-20260722-075200/ledger `
    -ApiBase http://localhost:3001
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [string]$LedgerDir,
  [string]$ApiBase = "http://localhost:3001",
  [string]$Email = "admin@bandai.local",
  [string]$Password = "password123",
  [string]$AppCode = "bnpi-pats",
  [int]$Limit = 50,
  [switch]$DryRun
)

$ErrorActionPreference = "Stop"
$failPath = Join-Path $LedgerDir "failure.jsonl"
if (-not (Test-Path $failPath)) {
  throw "Missing failure ledger: $failPath"
}

$loginBody = @{ email = $Email; password = $Password; appCode = $AppCode } | ConvertTo-Json
$login = Invoke-RestMethod -Method Post "$ApiBase/api/auth/login" -ContentType "application/json" -Body $loginBody
$token = $login.data.token
if (-not $token) { $token = $login.token }
$headers = @{ Authorization = "Bearer $token" }

$rows = Get-Content $failPath | Where-Object { $_.Trim().Length -gt 0 } | ForEach-Object {
  $_ | ConvertFrom-Json
} | Where-Object {
  $_.vendorUserId -and $_.sourceDeviceId -and $_.targetDeviceId
} | Select-Object -Last ([Math]::Max(1, $Limit))

# Dedupe latest failure per source+target+employee
$byKey = @{}
foreach ($r in $rows) {
  $k = "{0}|{1}|{2}" -f $r.sourceDeviceId, $r.targetDeviceId, $r.vendorUserId
  $byKey[$k] = $r
}
$unique = @($byKey.Values)
Write-Host "Retry candidates: $($unique.Count) (from last $Limit failure lines)"

# Group targets by source + employee for batch
$groups = $unique | Group-Object { "{0}|{1}" -f $_.sourceDeviceId, $_.vendorUserId }
$results = @()
foreach ($g in $groups) {
  $first = $g.Group[0]
  $sourceDeviceId = [string]$first.sourceDeviceId
  $employeeNo = [string]$first.vendorUserId
  $targetDeviceIds = @($g.Group | ForEach-Object { [string]$_.targetDeviceId } | Select-Object -Unique)
  $bodyObj = @{
    sourceDeviceId = $sourceDeviceId
    targetDeviceIds = $targetDeviceIds
    employeeNo = $employeeNo
    includeFingerprints = $true
    includeFaceRecognition = $true
  }
  if ($DryRun) {
    $bodyObj.dryRun = $true
    $bodyObj.execute = $false
  }
  $body = $bodyObj | ConvertTo-Json -Depth 5
  $sw = [System.Diagnostics.Stopwatch]::StartNew()
  try {
    $resp = Invoke-RestMethod -Method Post "$ApiBase/api/device/hikvision/copy-user" `
      -Headers $headers -ContentType "application/json" -Body $body -TimeoutSec 180
    $sw.Stop()
    $data = if ($resp.data) { $resp.data } else { $resp }
    $ok = 0; $fail = 0
    if ($data.results) {
      foreach ($item in @($data.results)) {
        if ($item.status -eq "success") { $ok++ } else { $fail++ }
      }
    }
    $row = [pscustomobject]@{
      employeeNo = $employeeNo
      sourceDeviceId = $sourceDeviceId
      targets = $targetDeviceIds.Count
      ok = $ok
      fail = $fail
      seconds = [math]::Round($sw.Elapsed.TotalSeconds, 2)
      dryRun = [bool]$DryRun
      status = "ok"
    }
    $results += $row
    Write-Host ("RETRY {0} targets={1} ok={2} fail={3} s={4}" -f $employeeNo, $targetDeviceIds.Count, $ok, $fail, $row.seconds)
  } catch {
    $sw.Stop()
    $row = [pscustomobject]@{
      employeeNo = $employeeNo
      sourceDeviceId = $sourceDeviceId
      targets = $targetDeviceIds.Count
      ok = 0
      fail = $targetDeviceIds.Count
      seconds = [math]::Round($sw.Elapsed.TotalSeconds, 2)
      dryRun = [bool]$DryRun
      status = "error"
      error = "$_"
    }
    $results += $row
    Write-Host ("RETRY_FAIL {0}: {1}" -f $employeeNo, $_)
  }
}

$outPath = Join-Path $LedgerDir ("retry-results-{0:yyyyMMdd-HHmmss}.json" -f (Get-Date))
$results | ConvertTo-Json -Depth 6 | Set-Content $outPath -Encoding UTF8
Write-Host "Wrote $outPath"
$results
