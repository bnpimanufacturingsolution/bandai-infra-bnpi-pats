#Requires -Version 5.1
<#
.SYNOPSIS
  Leave-safe host credential burn supervisor for DEV (decision / FP / face → 0).

.DESCRIPTION
  Runs forever (or -MaxCycles) against public or LAN DEV API.
  Writes watchable evidence under .runtime/cred-zero-burn/:
    OPERATOR-NOW.md  HEARTBEATS.log  STATUS.md  matrix-latest.json  cycle-*.json

  Prefer VM appliance/bin/project-truth-af-cred-burn-loop.sh when SSH works.
  This host loop is the durable fallback when Cloudflare Access SSH is down.

.EXAMPLE
  powershell -File scripts/credential-zero-burn-host.ps1
  powershell -File scripts/credential-zero-burn-host.ps1 -ApiBase https://dev-api.bnpi-pats.tech -MaxCycles 0
#>
[CmdletBinding()]
param(
  [string]$ApiBase = 'https://dev-api.bnpi-pats.tech',
  [string]$Email = 'admin@bandai.local',
  [string]$Password = 'password123',
  [string]$AppCode = 'bnpi-pats',
  [int]$WaveMax = 50,
  [int]$PollSleepSec = 15,
  [int]$PollMax = 120,
  [int]$IdleSleepSec = 45,
  [int]$MaxCycles = 0,  # 0 = forever
  [string]$StampDir = ''
)

$ErrorActionPreference = 'Continue'
$Root = Split-Path $PSScriptRoot -Parent
if (-not (Test-Path (Join-Path $Root 'bnpi-pats-api'))) {
  $Root = (Get-Location).Path
}
if (-not $StampDir) {
  $StampDir = Join-Path $Root '.runtime\cred-zero-burn'
}
New-Item -ItemType Directory -Force -Path $StampDir | Out-Null
$HbPath = Join-Path $StampDir 'HEARTBEATS.log'
$StatusPath = Join-Path $StampDir 'STATUS.md'
$OpNowPath = Join-Path $StampDir 'OPERATOR-NOW.md'
$MatrixPath = Join-Path $StampDir 'matrix-latest.json'
$PidPath = Join-Path $StampDir 'supervisor.pid'
$LogPath = Join-Path $StampDir 'cycle.log'
$CurrentPtr = Join-Path $Root '.runtime\current-cred-zero-burn-dir.txt'
$StampDir | Set-Content $CurrentPtr -Encoding utf8
$PID | Set-Content $PidPath -Encoding utf8

$Devices = [ordered]@{
  A = 'cmrht5s2w00ei7zgsre8y3o5n'
  B = 'cmpxw13hx002h7zwso7dyedrn'
  C = 'cmripjwbx00ewl001ihcke210'
  D = 'cmripjwkw00ffl0013lfxcbxw'
  E = 'cmriu5ab102goi001x9o7nfct'
  F = 'cmrim1zop05ik7zp4zgm2sm4k'
}

function Write-Log([string]$msg) {
  $line = '{0} {1}' -f (Get-Date -Format 'o'), $msg
  Add-Content -Path $LogPath -Value $line -Encoding utf8
  Write-Host $line
}

function Write-Hb([string]$msg) {
  $line = 'HEARTBEAT | ts={0} | {1}' -f (Get-Date -Format 'o'), $msg
  Add-Content -Path $HbPath -Value $line -Encoding utf8
  Write-Host $line
}

function Get-Token {
  $body = @{ email = $Email; password = $Password; appCode = $AppCode } | ConvertTo-Json
  $r = Invoke-RestMethod -Method Post "$ApiBase/api/auth/login" -ContentType 'application/json' -Body $body -TimeoutSec 40
  return $r.data.token
}

function Invoke-Api {
  param([string]$Method, [string]$Path, $Body = $null, [string]$Token, [int]$TimeoutSec = 180)
  $headers = @{ Authorization = "Bearer $Token" }
  $uri = "$ApiBase$Path"
  $params = @{ Method = $Method; Uri = $uri; Headers = $headers; TimeoutSec = $TimeoutSec }
  if ($null -ne $Body) {
    $params.ContentType = 'application/json'
    $params.Body = if ($Body -is [string]) { $Body } else { $Body | ConvertTo-Json -Depth 10 -Compress }
  }
  try {
    $resp = Invoke-WebRequest @params -UseBasicParsing
    return @{ code = [int]$resp.StatusCode; body = ($resp.Content | ConvertFrom-Json) }
  } catch {
    $code = 0; $raw = $null; $parsed = $null
    if ($_.Exception.Response) {
      $code = [int]$_.Exception.Response.StatusCode
      try {
        $stream = $_.Exception.Response.GetResponseStream()
        $reader = New-Object System.IO.StreamReader($stream)
        $raw = $reader.ReadToEnd()
        $parsed = $raw | ConvertFrom-Json
      } catch { $parsed = @{ message = $_.Exception.Message; raw = $raw } }
    }
    return @{ code = $code; body = $parsed; error = $_.Exception.Message }
  }
}

function Write-OperatorNow {
  param($Matrix, $LastJob, $Note, $Cycle, $DeviceLines)
  $m = $Matrix
  $md = @"
# OPERATOR-NOW — credential zero burn (host durable)

| Field | Value |
|---|---|
| Updated | $(Get-Date -Format 'o') |
| PID | $PID |
| Cycle | $Cycle |
| API | $ApiBase |
| Decision | $($m.decision) |
| Missing | $($m.missing) |
| Unique face residual | $($m.uFace) |
| Unique FP residual | $($m.uFp) |
| faceReady ops | $($m.faceReadyOps) |
| fpReady ops | $($m.fpReadyOps) |
| planId | $($m.planId) |
| Last job | $LastJob |
| Note | $Note |

## Devices (quick)

$DeviceLines

## Watch

    Get-Content .runtime\cred-zero-burn\HEARTBEATS.log -Tail 30 -Wait
    Get-Content .runtime\cred-zero-burn\OPERATOR-NOW.md

## Defect classes (live)

| Residual | Class | Owner |
|---|---|---|
| decision>0 | apply_path | autoResolve merge job |
| fpReady>0 | apply_path | recovery fingerprint waves |
| faceReady>0 | apply_path | recovery face waves |
| face blocked attestation | code_defect | fleet unlock + C seed (2fb4016+) |
| C source_unavailable | physical_boundary / transport | restore C then replan face |
| physical_reread_failed | code_defect / transport | longer sticky wait + retry waves |

## Exit

decision=0 AND missing=0 AND uFace=0 AND uFp=0 (or only physical_boundary rows left)
"@
  Set-Content -Path $OpNowPath -Value $md -Encoding utf8
  Set-Content -Path $StatusPath -Value $md -Encoding utf8
}

function Get-ActiveRecoveryId([string]$Token) {
  $r = Invoke-Api GET '/api/device/hikvision/sdk-users/merge/recovery/jobs?limit=20' -Token $Token -TimeoutSec 45
  if ($r.code -ne 200) { return $null }
  $jobs = @($r.body.data.jobs)
  $active = $jobs | Where-Object { $_.status -in @('pending','recovering','retrying','running','queued','writing','starting','in_progress') } | Select-Object -First 1
  if ($active) { return [string]$active.id }
  return $null
}

function Wait-RecoveryJob([string]$Token, [string]$JobId, [int]$Would = 0) {
  for ($i = 1; $i -le $PollMax; $i++) {
    Start-Sleep -Seconds $PollSleepSec
    $r = Invoke-Api GET "/api/device/hikvision/sdk-users/merge/recovery/jobs/$JobId" -Token $Token -TimeoutSec 60
    $job = $r.body.data.job; if (-not $job) { $job = $r.body.data }
    $c = $job.counters
    $st = [string]$job.status
    $ver = $c.verified; if ($null -eq $ver) { $ver = 0 }
    $fail = $c.failed; if ($null -eq $fail) { $fail = 0 }
    Write-Hb "cycle=$script:cycle poll=$i job=$($JobId.Substring(0,[Math]::Min(8,$JobId.Length))) status=$st verified=$ver fail=$fail would=$Would stage=$($job.currentStage)"
    $r.body | ConvertTo-Json -Depth 6 -Compress | Set-Content (Join-Path $StampDir 'job-poll-latest.json') -Encoding utf8
    if ($st -in @('completed','completed_with_attention','failed','cancelled','needs_attention','awaiting_replan')) {
      return "status=$st verified=$ver fail=$fail"
    }
  }
  return 'timeout'
}

function Build-Matrix($planBody) {
  $plan = $planBody.data.plan
  $planId = $planBody.data.planId
  $users = @($plan.users)
  $cw = @($plan.credentialWrites)
  $face = @($cw | Where-Object { $_.modality -eq 'face' })
  $fp = @($cw | Where-Object { $_.modality -match 'finger' })
  $block = @{}
  foreach ($w in $cw) {
    $k = if ($w.blockingReason) { [string]$w.blockingReason } else { '(none)' }
    if (-not $block.ContainsKey($k)) { $block[$k] = 0 }
    $block[$k]++
  }
  return [ordered]@{
    planId = $planId
    uniqueIds = $users.Count
    decision = @($users | Where-Object { @($_.conflicts).Count -gt 0 }).Count
    missing = @($users | Where-Object { @($_.missingOnDeviceIds).Count -gt 0 }).Count
    uFace = @($face | ForEach-Object { $_.vendorUserId } | Select-Object -Unique).Count
    uFp = @($fp | ForEach-Object { $_.vendorUserId } | Select-Object -Unique).Count
    faceOps = $face.Count
    fpOps = $fp.Count
    faceReadyOps = @($face | Where-Object { $_.executionEligibility -match 'ready' }).Count
    fpReadyOps = @($fp | Where-Object { $_.executionEligibility -match 'ready' }).Count
    blockedByReason = $block
  }
}

Write-Log "START pid=$PID api=$ApiBase stamp=$StampDir"
Write-Hb "start pid=$PID api=$ApiBase"

$script:cycle = 0
$lastJob = 'none'

while ($true) {
  $script:cycle++
  if ($MaxCycles -gt 0 -and $script:cycle -gt $MaxCycles) {
    Write-Log "EXIT max cycles $MaxCycles"
    break
  }

  try {
    $token = Get-Token
  } catch {
    Write-Log "LOGIN_FAIL $($_.Exception.Message)"
    Write-Hb "cycle=$script:cycle login_fail"
    Start-Sleep -Seconds $IdleSleepSec
    continue
  }

  # Device quick scope (status only — never gates which devices are burned)
  $prev = Invoke-Api GET '/api/device/sync-preview?quick=true' -Token $token -TimeoutSec 120
  $devLines = @()
  if ($prev.code -eq 200) {
    foreach ($letter in @('A','B','C','D','E','F')) {
      $id = $Devices[$letter]
      $row = @($prev.body.data.devices) | Where-Object {
        ($_.deviceId -eq $id) -or ($_.id -eq $id) -or ($_.name -match "Device $letter`$")
      } | Select-Object -First 1
      $from = $row.vendorUserCount
      $status = $row.status
      $devLines += "| $letter | $from | $($row.bnpiPatsUserCount) | $status |"
    }
  }
  $deviceTable = (@('| Letter | From | Saved | Status |', '|---|---:|---:|---|') + $devLines) -join "`n"

  # Poll any active recovery first
  $activeId = Get-ActiveRecoveryId $token
  if ($activeId) {
    Write-Log "WAIT_ACTIVE $activeId"
    Write-Hb "cycle=$script:cycle wait_active=$($activeId.Substring(0,8))"
    $pollResult = Wait-RecoveryJob $token $activeId 0
    $lastJob = ('active:{0} {1}' -f $activeId, $pollResult)
    Start-Sleep -Seconds 5
  }

  # ALWAYS include A/B/C/D/E/F — never hard-skip C.
  # C owns most residual finger/face gaps in Sync Center; excluding it freezes gap-zero.
  # API/plan degrades gracefully when a device is source_unavailable.
  $allIds = @($Devices.A, $Devices.B, $Devices.C, $Devices.D, $Devices.E, $Devices.F)
  $scopes = @(
    @{ name = 'af-all'; ids = $allIds; mods = @('fingerprint', 'face') }
  )

  $combined = [ordered]@{
    planId = ''
    decision = 0
    missing = 0
    uFace = 0
    uFp = 0
    faceReadyOps = 0
    fpReadyOps = 0
  }

  foreach ($scopeDef in $scopes) {
    $ids = @($scopeDef.ids)
    Write-Log ("PLAN scope={0} devices={1} includeC=true" -f $scopeDef.name, $ids.Count)
    Write-Hb ("cycle={0} plan_start scope={1} includeC=true" -f $script:cycle, $scopeDef.name)
    $plan = Invoke-Api POST '/api/device/hikvision/sdk-users/merge/plan' -Token $token -Body @{ deviceIds = $ids } -TimeoutSec 600
    if ($plan.code -notin 200, 201) {
      Write-Log ("PLAN_FAIL scope={0} code={1} err={2} msg={3}" -f $scopeDef.name, $plan.code, $plan.error, $plan.body.message)
      Write-Hb ("cycle={0} plan_fail scope={1} code={2}" -f $script:cycle, $scopeDef.name, $plan.code)
      continue
    }

    $matrix = Build-Matrix $plan.body
    $matrix | ConvertTo-Json -Depth 6 | Set-Content $MatrixPath -Encoding utf8
    $matrix | ConvertTo-Json -Depth 6 | Set-Content (Join-Path $StampDir ("cycle-{0:D3}-{1}-matrix.json" -f $script:cycle, $scopeDef.name)) -Encoding utf8
    Write-Log ("MATRIX scope={0} decision={1} missing={2} uFace={3} uFp={4} faceReady={5} fpReady={6} plan={7}" -f `
      $scopeDef.name, $matrix.decision, $matrix.missing, $matrix.uFace, $matrix.uFp, $matrix.faceReadyOps, $matrix.fpReadyOps, $matrix.planId)
    Write-Hb ("cycle={0} plan={1} scope={2} decision={3} missing={4} uFace={5} uFp={6} faceReady={7} fpReady={8}" -f `
      $script:cycle, $matrix.planId, $scopeDef.name, $matrix.decision, $matrix.missing, $matrix.uFace, $matrix.uFp, $matrix.faceReadyOps, $matrix.fpReadyOps)

    $combined.decision = $matrix.decision
    $combined.missing = $matrix.missing
    $combined.uFp = $matrix.uFp
    $combined.fpReadyOps = $matrix.fpReadyOps
    $combined.uFace = $matrix.uFace
    $combined.faceReadyOps = $matrix.faceReadyOps
    $combined.planId = $matrix.planId
    Write-OperatorNow $combined $lastJob ("planned {0}" -f $scopeDef.name) $script:cycle $deviceTable

    $planId = [string]$matrix.planId
    foreach ($mod in @($scopeDef.mods)) {
      $activeId = Get-ActiveRecoveryId $token
      if ($activeId) {
        $pollResult = Wait-RecoveryJob $token $activeId 0
        $lastJob = ('active:{0} {1}' -f $activeId, $pollResult)
        break
      }

      $readyKey = if ($mod -eq 'face') { [int]$matrix.faceReadyOps } else { [int]$matrix.fpReadyOps }
      if ($readyKey -le 0) {
        Write-Log ("SKIP write mod={0} readyOps=0" -f $mod)
        continue
      }

      $rev = Invoke-Api POST '/api/device/hikvision/sdk-users/merge/recovery/review' -Token $token -Body @{
        planId = $planId; canaryModality = $mod; maxVerifiedWrites = $WaveMax
      } -TimeoutSec 120
      if ($rev.code -ne 200) {
        Write-Log ("REVIEW_FAIL mod={0} code={1} {2}" -f $mod, $rev.code, $rev.body.message)
        continue
      }
      $scopeHash = [string]$rev.body.data.scopeHash
      $would = [int]$rev.body.data.executionPreview.wouldWriteCount
      Write-Log ("REVIEW mod={0} would={1}" -f $mod, $would)
      Write-Hb ("cycle={0} review mod={1} would={2} scope={3}" -f $script:cycle, $mod, $would, $scopeDef.name)

      $dry = Invoke-Api POST '/api/device/hikvision/sdk-users/merge/recovery/jobs' -Token $token -Body @{
        planId = $planId; expectedScopeHash = $scopeHash; canaryModality = $mod
        maxVerifiedWrites = $WaveMax; dryRun = $true; execute = $false
      } -TimeoutSec 120
      $would = [int]$dry.body.data.executionPreview.wouldWriteCount
      if ($would -le 0) {
        Write-Log ("SKIP write mod={0} would=0" -f $mod)
        $blockerPath = Join-Path $StampDir ("blocker-{0}-latest.json" -f $mod)
        $dry.body | ConvertTo-Json -Depth 6 | Set-Content $blockerPath -Encoding utf8
        continue
      }

      $ex = Invoke-Api POST '/api/device/hikvision/sdk-users/merge/recovery/jobs' -Token $token -Body @{
        planId = $planId; expectedScopeHash = $scopeHash; canaryModality = $mod
        maxVerifiedWrites = $WaveMax; dryRun = $false; execute = $true
      } -TimeoutSec 120
      if ($ex.code -eq 409) {
        $msg = [string]$ex.body.message
        if ($msg -match 'job ([a-z0-9]+) is already active') {
          $jid = $Matches[1]
          $pollResult = Wait-RecoveryJob $token $jid $would
          $lastJob = ('busy:{0} {1}' -f $jid, $pollResult)
        } else {
          Write-Log ("JOB 409 {0}" -f $msg)
        }
        break
      }
      if ($ex.code -notin 200, 201, 202) {
        Write-Log ("JOB_FAIL mod={0} code={1} {2}" -f $mod, $ex.code, $ex.body.message)
        continue
      }
      $job = $ex.body.data.job; if (-not $job) { $job = $ex.body.data }
      $jobId = [string]$job.id
      Write-Log ("JOB_START mod={0} id={1} would={2}" -f $mod, $jobId, $would)
      $pollResult = Wait-RecoveryJob $token $jobId $would
      $lastJob = ('rec-{0}:{1} {2}' -f $mod, $jobId, $pollResult)
      Write-OperatorNow $combined $lastJob ("finished {0} wave" -f $mod) $script:cycle $deviceTable
      break
    }
  }

  # Exit gate only when residual is truly zero across A–F (C always in plan)
  if ([int]$combined.decision -eq 0 -and [int]$combined.missing -eq 0 -and [int]$combined.uFace -eq 0 -and [int]$combined.uFp -eq 0) {
    Write-Log 'EXIT_GATE residual zero (A-F always include C)'
    Write-Hb "cycle=$script:cycle EXIT residual_zero includeC=true"
    Write-OperatorNow $combined $lastJob 'EXIT residual zero - supervisor idling' $script:cycle $deviceTable
    Start-Sleep -Seconds ([Math]::Max($IdleSleepSec, 120))
    continue
  }

  Start-Sleep -Seconds 8
}

Write-Log 'STOP'
Write-Hb 'stop'
