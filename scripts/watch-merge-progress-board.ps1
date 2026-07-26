<#
.SYNOPSIS
  Refresh PROGRESS-BOARD.txt for a merge job so you can watch employee/device lines live.

.EXAMPLE
  powershell -File scripts/watch-merge-progress-board.ps1 `
    -JobId 9e7476e9-... `
    -OutFile .runtime/merge-fast-20260722-084504/PROGRESS-BOARD.txt
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][string]$JobId,
  [string]$ApiBase = "http://localhost:3001",
  [string]$Email = "admin@bandai.local",
  [string]$Password = "password123",
  [string]$AppCode = "hris",
  [string]$OutFile = ".runtime/merge-progress-BOARD.txt",
  [int]$IntervalSeconds = 5,
  [int]$MaxTicks = 120
)

$ErrorActionPreference = "Stop"
$login = Invoke-RestMethod -Method Post "$ApiBase/api/auth/login" -ContentType "application/json" -Body (@{
  email = $Email; password = $Password; appCode = $AppCode
} | ConvertTo-Json)
$headers = @{ Authorization = "Bearer $($login.data.token)" }
$parent = Split-Path -Parent $OutFile
if ($parent) { New-Item -ItemType Directory -Force -Path $parent | Out-Null }

function Build-Board([int]$tick, $data) {
  $lines = New-Object System.Collections.Generic.List[string]
  $lines.Add("============================================================")
  $lines.Add("  LIVE PROGRESS BOARD  tick=$tick  $(Get-Date -Format 'HH:mm:ss')")
  $lines.Add("  jobId  : $JobId")
  $lines.Add("  status : $($data.status)  stage=$($data.currentStage)  workerActive=$($data.workerActive)  stale=$($data.stale)")
  $lines.Add("  overall: $($data.processedWrites)/$($data.totalWrites) | ok=$($data.successfulWrites) fail=$($data.failedWrites)")
  $cur = ([string]$data.currentUserKey) -replace "vendor:", ""
  $lines.Add("  now    : employee $cur")
  $msg = [string]$data.message
  if ($msg.Length -gt 140) { $msg = $msg.Substring(0, 140) }
  $lines.Add("  message: $msg")
  $lines.Add("============================================================")
  $lines.Add("")
  $lines.Add("--- CURRENT EMPLOYEE ---")
  $lines.Add("employee $cur")
  $lines.Add("  stage: $($data.currentStage)")
  $lines.Add("  note : user + fingerprint + face go together per target device")
  $evs = @($data.progressEvents | Where-Object {
      ([string]$_.vendorUserId -eq $cur) -or ([string]$_.userKey -match [regex]::Escape($cur))
    } | Select-Object -Last 16)
  if (-not $evs.Count) { $evs = @($data.progressEvents | Select-Object -Last 10) }
  $lines.Add("  steps:")
  foreach ($e in $evs) {
    $stage = [string]$e.stage
    $tgt = [string]$e.targetDeviceName
    if (-not $tgt) { $tgt = "-" }
    $icon = "[....]"
    $human = $stage
    if ($stage -eq "batch_copy_started") { $icon = "[BATCH]"; $human = "start batch (all targets, user+fp+face)" }
    if ($stage -eq "copy_started") { $icon = "[COPY ]"; $human = "copying on $tgt (user+fp+face)" }
    if ($stage -eq "copy_success") { $icon = "[ OK  ]"; $human = "done on $tgt" }
    if ($stage -eq "copy_error") { $icon = "[FAIL ]"; $human = "failed on $tgt" }
    if ($stage -eq "db_merge_done") { $icon = "[ DB  ]"; $human = "HRIS row only on $tgt" }
    if ($stage -eq "user_done") { $icon = "[DONE ]"; $human = "employee finished in job" }
    $err = ""
    if ($e.error) {
      $err = " | " + [string]$e.error
      if ($err.Length -gt 90) { $err = $err.Substring(0, 90) }
    }
    $lines.Add("  $icon  $human$err")
  }
  $lines.Add("")
  $lines.Add("--- MATRIX (finished targets so far) ---")
  $by = @{}
  foreach ($r in @($data.results)) {
    $emp = [string]$r.vendorUserId
    if (-not $emp) { continue }
    if (-not $by.ContainsKey($emp)) { $by[$emp] = @{ ok = 0; fail = 0; rows = @() } }
    $tn = if ($r.targetDeviceName) { $r.targetDeviceName } else { $r.targetDeviceId }
    if ($r.status -eq "success") { $by[$emp].ok++ } else { $by[$emp].fail++ }
    $by[$emp].rows += ,@{ t = $tn; s = [string]$r.status }
  }
  if (-not $by.Count) { $lines.Add("  (waiting for first copy_success / copy_error...)") }
  foreach ($emp in ($by.Keys | Sort-Object)) {
    $b = $by[$emp]
    $tot = $b.ok + $b.fail
    $lines.Add("")
    $lines.Add("employee $emp")
    $lines.Add("  peer copy = $($b.ok)/$tot devices OK  (fail=$($b.fail))")
    foreach ($row in $b.rows) {
      $mark = if ($row.s -eq "success") { "[done]" } else { "[fail]" }
      $lines.Add("  $mark  $($row.t)")
    }
  }
  $lines.Add("============================================================")
  return ($lines -join "`n")
}

for ($t = 1; $t -le $MaxTicks; $t++) {
  try {
    $st = Invoke-RestMethod -Method Get "$ApiBase/api/device/hikvision/sdk-users/merge/jobs/$JobId" -Headers $headers -TimeoutSec 30
    $d = $st.data
    $text = Build-Board $t $d
    $text | Set-Content -Path $OutFile -Encoding UTF8
    Write-Host ("tick={0} status={1} {2}/{3} ok={4} fail={5} user={6}" -f $t, $d.status, $d.processedWrites, $d.totalWrites, $d.successfulWrites, $d.failedWrites, $d.currentUserKey)
    if ($d.status -in @("completed", "failed") -or $d.stale) { break }
  } catch {
    Write-Host "tick=$t ERROR $_"
    if ("$_" -match "Unable to connect|404") { break }
  }
  Start-Sleep -Seconds $IntervalSeconds
}
Write-Host "Board: $OutFile"
