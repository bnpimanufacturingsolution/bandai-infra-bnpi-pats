<#
.SYNOPSIS
  Agent-owned poll for Hikvision merge jobs — never prints stale "processing" after errors.

.DESCRIPTION
  Polls GET /api/device/hikvision/sdk-users/merge/jobs/:jobId until:
    - completed / failed / stale
    - 404 (job truly missing — not the same as lost-after-restart if durable snapshots exist)
    - API connect failure (recoverable: restart API, then re-GET; snapshot may show failed_stale)

  On each tick prints only the *current* response. Never re-prints a previous success
  snapshot after a failed HTTP call (that bug made overnight runs look "still processing").

.EXAMPLE
  powershell -File scripts/poll-merge-job.ps1 -JobId 8ffa41c6-ec70-4de1-a551-ec3206d6b11f
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [string]$JobId,
  [string]$ApiBase = "http://localhost:3001",
  [string]$Email = "admin@bandai.local",
  [string]$Password = "password123",
  [string]$AppCode = "hris",
  [int]$IntervalSeconds = 8,
  [int]$MaxPolls = 120,
  [string]$EvidenceDir = "",
  [switch]$RestartApiOnConnectFail
)

$ErrorActionPreference = "Stop"

function Get-AdminHeaders {
  $loginBody = @{ email = $Email; password = $Password; appCode = $AppCode } | ConvertTo-Json
  $login = Invoke-RestMethod -Method Post "$ApiBase/api/auth/login" -ContentType "application/json" -Body $loginBody -TimeoutSec 30
  $token = $login.data.token
  if (-not $token) { $token = $login.token }
  if (-not $token) { throw "Login did not return a token" }
  return @{ Authorization = "Bearer $token" }
}

function Test-ApiHealth {
  try {
    $h = Invoke-RestMethod -Uri "$ApiBase/health" -TimeoutSec 5
    return ($h.status -eq "healthy" -or $h.status -eq "ok")
  } catch {
    return $false
  }
}

function Try-RestartLocalApi {
  Write-Host "RECOVERY | attempting local API restart on port 3001"
  try {
    $conns = Get-NetTCPConnection -LocalPort 3001 -State Listen -ErrorAction SilentlyContinue
    foreach ($c in $conns) {
      Stop-Process -Id $c.OwningProcess -Force -ErrorAction SilentlyContinue
    }
  } catch {}
  Start-Sleep -Seconds 2
  $repoRoot = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
  if (-not (Test-Path (Join-Path $repoRoot "hris-api"))) {
    $repoRoot = (Get-Location).Path
  }
  $apiDir = Join-Path $repoRoot "hris-api"
  $logDir = Join-Path $repoRoot ".runtime\merge-poll-api-restart"
  New-Item -ItemType Directory -Force -Path $logDir | Out-Null
  Start-Process -FilePath "npm.cmd" -ArgumentList @("run", "dev") `
    -WorkingDirectory $apiDir `
    -RedirectStandardOutput (Join-Path $logDir "out.log") `
    -RedirectStandardError (Join-Path $logDir "err.log") `
    -WindowStyle Hidden | Out-Null
  for ($i = 0; $i -lt 40; $i++) {
    Start-Sleep -Seconds 2
    if (Test-ApiHealth) {
      Write-Host "RECOVERY | API healthy after restart (attempt $i)"
      return $true
    }
  }
  Write-Host "RECOVERY | API still down after restart attempts"
  return $false
}

if ($EvidenceDir) {
  New-Item -ItemType Directory -Force -Path $EvidenceDir | Out-Null
}

$headers = Get-AdminHeaders
$terminal = $null
$lastPayload = $null

for ($i = 0; $i -lt $MaxPolls; $i++) {
  if ($i -gt 0) { Start-Sleep -Seconds $IntervalSeconds }

  if (-not (Test-ApiHealth)) {
    Write-Host "POLL i=$i outcome=API_DOWN"
    if ($RestartApiOnConnectFail) {
      $ok = Try-RestartLocalApi
      if (-not $ok) {
        $terminal = [pscustomobject]@{
          outcome = "API_DOWN"
          jobId = $JobId
          message = "API unreachable; restart failed. Agent must free port 3001 and npm.cmd run dev in hris-api."
        }
        break
      }
      $headers = Get-AdminHeaders
      # fall through to GET this same iteration
    } else {
      $terminal = [pscustomobject]@{
        outcome = "API_DOWN"
        jobId = $JobId
        message = "API unreachable. Re-run with -RestartApiOnConnectFail or restart hris-api, then re-GET job (durable snapshot may mark failed_stale)."
      }
      break
    }
  }

  try {
    $st = Invoke-RestMethod -Method Get "$ApiBase/api/device/hikvision/sdk-users/merge/jobs/$JobId" `
      -Headers $headers -TimeoutSec 30
    $d = if ($st.data) { $st.data } else { $st }
    $lastPayload = $d
    $status = [string]$d.status
    $stage = [string]$d.currentStage
    $workerActive = $d.workerActive
    if ($null -eq $workerActive) { $workerActive = ($status -eq "processing" -and -not $d.stale) }
    Write-Host ("POLL i={0} status={1} stage={2} ok={3} fail={4} proc={5}/{6} stale={7} workerActive={8}" -f `
      $i, $status, $stage, $d.successfulWrites, $d.failedWrites, $d.processedWrites, $d.totalWrites, [bool]$d.stale, [bool]$workerActive)

    if ($EvidenceDir) {
      $d | ConvertTo-Json -Depth 8 | Set-Content (Join-Path $EvidenceDir ("poll-{0:d3}.json" -f $i)) -Encoding UTF8
    }

    if ($status -eq "completed") {
      $terminal = [pscustomobject]@{
        outcome = "COMPLETED"
        jobId = $JobId
        status = $status
        successfulWrites = $d.successfulWrites
        failedWrites = $d.failedWrites
        processedWrites = $d.processedWrites
        totalWrites = $d.totalWrites
        stale = [bool]$d.stale
        snapshotPath = $d.snapshotPath
        recoveryHint = $d.recoveryHint
      }
      break
    }
    if ($status -eq "failed" -or $d.stale -eq $true -or $stage -eq "failed_stale") {
      $terminal = [pscustomobject]@{
        outcome = if ($d.stale) { "STALE_FAILED" } else { "FAILED" }
        jobId = $JobId
        status = $status
        successfulWrites = $d.successfulWrites
        failedWrites = $d.failedWrites
        processedWrites = $d.processedWrites
        totalWrites = $d.totalWrites
        stale = [bool]$d.stale
        message = $d.message
        error = $d.error
        snapshotPath = $d.snapshotPath
        recoveryHint = $d.recoveryHint
        nextAgentAction = "Read failure ledger + snapshot; start a NEW merge job only for remaining failed rows. Do not re-poll this jobId as active."
      }
      break
    }
    # still processing and workerActive — continue
  } catch {
    $errText = "$_"
    # Never print last good processing status here.
    if ($errText -match "404" -or $errText -match "not found or expired") {
      Write-Host "POLL i=$i outcome=JOB_NOT_FOUND code=404"
      $terminal = [pscustomobject]@{
        outcome = "JOB_NOT_FOUND"
        jobId = $JobId
        message = "GET returned 404. If API restarted before durable snapshots existed, job is gone. With durable snapshots, 404 means no file under .runtime/device-user-merge-jobs/<jobId>.json."
        nextAgentAction = "Check .runtime/device-user-merge-jobs/$JobId.json; if missing, re-plan and start a new job."
      }
      break
    }
    if ($errText -match "Unable to connect" -or $errText -match "actively refused") {
      Write-Host "POLL i=$i outcome=API_DOWN_ON_GET"
      if ($RestartApiOnConnectFail) {
        if (-not (Try-RestartLocalApi)) {
          $terminal = [pscustomobject]@{
            outcome = "API_DOWN"
            jobId = $JobId
            message = "Connect failed and restart failed."
          }
          break
        }
        $headers = Get-AdminHeaders
        continue
      }
      $terminal = [pscustomobject]@{
        outcome = "API_DOWN"
        jobId = $JobId
        message = $errText
        nextAgentAction = "Restart API with ledger env; re-GET jobId - durable snapshot should return failed_stale, not fake processing."
      }
      break
    }
    Write-Host "POLL i=$i outcome=HTTP_ERROR $errText"
    $terminal = [pscustomobject]@{
      outcome = "HTTP_ERROR"
      jobId = $JobId
      message = $errText
    }
    break
  }
}

if (-not $terminal) {
  $terminal = [pscustomobject]@{
    outcome = "MAX_POLLS"
    jobId = $JobId
    message = "Reached MaxPolls without terminal status."
    lastStatus = if ($lastPayload) { $lastPayload.status } else { $null }
    nextAgentAction = "Inspect snapshot and API logs; do not invent success."
  }
}

Write-Host ("TERMINAL outcome={0} jobId={1}" -f $terminal.outcome, $JobId)
$terminal | ConvertTo-Json -Depth 6

if ($EvidenceDir) {
  $terminal | ConvertTo-Json -Depth 6 | Set-Content (Join-Path $EvidenceDir "terminal.json") -Encoding UTF8
  if ($lastPayload) {
    $lastPayload | ConvertTo-Json -Depth 8 | Set-Content (Join-Path $EvidenceDir "last-payload.json") -Encoding UTF8
  }
}

# Non-zero exit for failed/stale/down so agents can branch in scripts
switch ($terminal.outcome) {
  "COMPLETED" { exit 0 }
  "STALE_FAILED" { exit 3 }
  "FAILED" { exit 2 }
  "JOB_NOT_FOUND" { exit 4 }
  "API_DOWN" { exit 5 }
  default { exit 1 }
}
