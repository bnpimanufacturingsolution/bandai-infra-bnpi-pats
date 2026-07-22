# Project Truth — Merge device users overnight loop (Main Entrance A-F)
# Agent-owned: tunnel ensure, plan, richest choices, start job, poll, self-repair.
param(
  [int]$MaxCycles = 40,
  [int]$PollSeconds = 20,
  [int]$PlanTimeoutSec = 600,
  [int]$HealthTimeoutSec = 60,
  [switch]$SkipStartIfProcessing,
  [string]$EvidenceRoot = ""
)

$ErrorActionPreference = "Continue"
$repoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $repoRoot

if (-not $EvidenceRoot) {
  $stamp = Get-Date -Format "yyyyMMdd-HHmmss"
  $EvidenceRoot = Join-Path $repoRoot ".runtime\merge-overnight-loop-$stamp"
}
New-Item -ItemType Directory -Force -Path $EvidenceRoot | Out-Null
$EvidenceRoot | Set-Content (Join-Path $repoRoot ".runtime\merge-overnight-latest-dir.txt")
$heartbeatLog = Join-Path $EvidenceRoot "heartbeat.jsonl"
$summaryPath = Join-Path $EvidenceRoot "loop-summary.json"

$deviceIds = @(
  "cmrht5s2w00ei7zgsre8y3o5n", # A .21
  "cmpxw13hx002h7zwso7dyedrn", # B .20
  "cmripjwbx00ewl001ihcke210", # C .22
  "cmripjwkw00ffl0013lfxcbxw", # D .23
  "cmriu5ab102goi001x9o7nfct", # E .24
  "cmrim1zop05ik7zp4zgm2sm4k"  # F .25
)
$deviceLabels = @{
  "cmrht5s2w00ei7zgsre8y3o5n" = "A/.21"
  "cmpxw13hx002h7zwso7dyedrn" = "B/.20"
  "cmripjwbx00ewl001ihcke210" = "C/.22"
  "cmripjwkw00ffl0013lfxcbxw" = "D/.23"
  "cmriu5ab102goi001x9o7nfct" = "E/.24"
  "cmrim1zop05ik7zp4zgm2sm4k" = "F/.25"
}

function Write-Hb {
  param([int]$Cycle, [string]$Checklist, [string]$LastProof, [string]$Next, [hashtable]$Extra = @{})
  $row = [ordered]@{
    at = (Get-Date).ToString("o")
    cycle = $Cycle
    checklist = $Checklist
    last_proof = $LastProof
    next = $Next
  }
  foreach ($k in $Extra.Keys) { $row[$k] = $Extra[$k] }
  ($row | ConvertTo-Json -Compress) | Add-Content -Path $heartbeatLog -Encoding UTF8
  Write-Host ("HEARTBEAT | cycle={0} | checklist={1} | last_proof={2} | next={3}" -f $Cycle, $Checklist, $LastProof, $Next)
}

function Get-AdminHeaders {
  $loginBody = @{ email = "admin@bandai.local"; password = "password123"; appCode = "hris" } | ConvertTo-Json
  $login = Invoke-RestMethod -Method Post "http://localhost:3001/api/auth/login" -ContentType "application/json" -Body $loginBody -TimeoutSec 30
  $token = $login.data.token
  if (-not $token) { throw "Login returned no token" }
  return @{ Authorization = "Bearer $token" }
}

function Test-LocalApi {
  try {
    $h = Invoke-RestMethod "http://localhost:3001/health" -TimeoutSec 5
    return ($h.status -eq "healthy")
  } catch { return $false }
}

function Ensure-Tunnels {
  $script = Join-Path $repoRoot "scripts\start-hikvision-remote-device-tunnel.ps1"
  $ips = "10.184.37.20,10.184.37.21,10.184.37.22,10.184.37.23,10.184.37.24,10.184.37.25"
  $out = & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $script -DeviceIps $ips 2>&1 | Out-String
  $out | Set-Content (Join-Path $EvidenceRoot "tunnel-ensure-latest.txt") -Encoding UTF8
  $open = 0
  foreach ($p in (10080..10085 + 10443..10448 + 18000..18005)) {
    try {
      $c = [System.Net.Sockets.TcpClient]::new()
      $a = $c.BeginConnect("127.0.0.1", $p, $null, $null)
      if ($a.AsyncWaitHandle.WaitOne(400, $false) -and $c.Connected) { $open++ }
      $c.Close()
    } catch {}
  }
  return $open
}

function Ensure-Api {
  if (Test-LocalApi) { return $true }
  # free port 3001 without using reserved $PID
  $owners = @(Get-NetTCPConnection -LocalPort 3001 -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique)
  foreach ($procId in $owners) {
    try { Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue } catch {}
  }
  Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" -ErrorAction SilentlyContinue |
    Where-Object { $_.CommandLine -match "hris-api" } |
    ForEach-Object { try { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue } catch {} }
  Start-Sleep -Seconds 2
  $logDir = Join-Path $EvidenceRoot "api-restart"
  New-Item -ItemType Directory -Force -Path $logDir | Out-Null
  $stdout = Join-Path $logDir "api.stdout.log"
  $stderr = Join-Path $logDir "api.stderr.log"
  Start-Process -FilePath "cmd.exe" -ArgumentList "/c", "npm.cmd run dev" `
    -WorkingDirectory (Join-Path $repoRoot "hris-api") `
    -RedirectStandardOutput $stdout -RedirectStandardError $stderr -WindowStyle Hidden | Out-Null
  for ($i = 0; $i -lt 60; $i++) {
    Start-Sleep -Seconds 2
    if (Test-LocalApi) { return $true }
  }
  return $false
}

function Get-DeviceHealth([hashtable]$Headers) {
  $rows = @()
  foreach ($id in $deviceIds) {
    $label = $deviceLabels[$id]
    try {
      $h = Invoke-RestMethod -Method Get "http://localhost:3001/api/device/$id/health" -Headers $Headers -TimeoutSec $HealthTimeoutSec
      $p = if ($h.data) { $h.data } else { $h }
      $st = $p.summary.status
      if (-not $st) { $st = $p.status }
      $src = $null
      try { $src = $p.checks.network.source } catch {}
      $rows += [pscustomobject]@{ id = $id; label = $label; status = $st; source = $src }
    } catch {
      $rows += [pscustomobject]@{ id = $id; label = $label; status = "error"; source = $null; error = $_.Exception.Message }
    }
  }
  return $rows
}

function Get-Listener([hashtable]$Headers) {
  try {
    return Invoke-RestMethod -Method Get "http://localhost:3001/api/device/hikvision/listener" -Headers $Headers -TimeoutSec 90
  } catch {
    return @{ error = $_.Exception.Message }
  }
}

function Build-RichestChoices($plan) {
  $choices = @{}
  $ledger = @()
  $users = @()
  if ($plan.users) { $users = @($plan.users) }
  elseif ($plan.data -and $plan.data.plan -and $plan.data.plan.users) { $users = @($plan.data.plan.users) }
  foreach ($user in $users) {
    $key = [string]$user.key
    if (-not $key) { continue }
    $fieldMap = @{}
    foreach ($c in @($user.conflicts)) {
      $field = [string]$c.field
      if (-not $field) { continue }
      $va = $c.deviceA.value
      $vb = $c.deviceB.value
      $choice = "A"
      $reason = "default_A"
      if ($field -in @("face", "fingerprint", "card")) {
        $na = 0; $nb = 0
        [void][double]::TryParse([string]$va, [ref]$na)
        [void][double]::TryParse([string]$vb, [ref]$nb)
        if ($nb -gt $na) { $choice = "B"; $reason = "higher_evidenced_count" }
        elseif ($na -gt $nb) { $choice = "A"; $reason = "higher_evidenced_count" }
        elseif ($nb -eq $na) { $choice = "A"; $reason = "tie_prefer_A" }
      } else {
        $sa = [string]$va
        $sb = [string]$vb
        if ((-not $sa) -and $sb) { $choice = "B"; $reason = "nonempty_B" }
        elseif ($sa -and (-not $sb)) { $choice = "A"; $reason = "nonempty_A" }
        else { $choice = "A"; $reason = "string_prefer_A" }
      }
      $fieldMap[$field] = $choice
      $ledger += [pscustomobject]@{
        userKey = $key
        field = $field
        choice = $choice
        reason = $reason
        deviceA = $c.deviceA.name
        valueA = $va
        deviceB = $c.deviceB.name
        valueB = $vb
      }
    }
    if ($fieldMap.Count -gt 0) { $choices[$key] = $fieldMap }
  }
  return @{ choices = $choices; ledger = $ledger }
}

function Get-Jobs([hashtable]$Headers) {
  try {
    return Invoke-RestMethod -Method Get "http://localhost:3001/api/device/hikvision/sdk-users/merge/jobs" -Headers $Headers -TimeoutSec 30
  } catch {
    return @{ error = $_.Exception.Message }
  }
}

function Get-Job([hashtable]$Headers, [string]$JobId) {
  return Invoke-RestMethod -Method Get "http://localhost:3001/api/device/hikvision/sdk-users/merge/jobs/$JobId" -Headers $Headers -TimeoutSec 60
}

# -------- main --------
$state = [ordered]@{
  startedAt = (Get-Date).ToString("o")
  evidence = $EvidenceRoot
  activeJobId = $null
  planId = $null
  lastStatus = $null
  cycles = 0
  onlineHealth = $null
  notes = @()
}

Write-Hb -Cycle 0 -Checklist "0/6" -LastProof $EvidenceRoot -Next "ensure_api_tunnels"

if (-not (Ensure-Api)) {
  $state.notes += "API failed to become healthy"
  $state | ConvertTo-Json -Depth 6 | Set-Content $summaryPath
  throw "Local API not healthy after restart attempts"
}
$tunnelOpen = Ensure-Tunnels
Write-Hb -Cycle 0 -Checklist "1/6" -LastProof "tunnels=$tunnelOpen/18" -Next "login_health_listener" -Extra @{ tunnelOpen = $tunnelOpen }

$headers = Get-AdminHeaders
$health = Get-DeviceHealth $headers
$health | ConvertTo-Json -Depth 4 | Set-Content (Join-Path $EvidenceRoot "health-af.json")
$online = @($health | Where-Object { $_.status -eq "online" }).Count
$state.onlineHealth = "$online/6"
Write-Hb -Cycle 0 -Checklist "2/6" -LastProof "health=$online/6" -Next "listener" -Extra @{ health = $health }

$listener = Get-Listener $headers
($listener | ConvertTo-Json -Depth 10) | Set-Content (Join-Path $EvidenceRoot "listener-status.json")

$jobs = Get-Jobs $headers
($jobs | ConvertTo-Json -Depth 8) | Set-Content (Join-Path $EvidenceRoot "jobs-list-initial.json")
$jobList = @()
if ($jobs.data) { $jobList = @($jobs.data) }
elseif ($jobs.jobs) { $jobList = @($jobs.jobs) }
$processing = @($jobList | Where-Object { $_.status -eq "processing" -and -not $_.stale })
if ($processing.Count -gt 0) {
  $state.activeJobId = $processing[0].jobId
  $state.notes += "Found existing processing job; will monitor"
  Write-Hb -Cycle 0 -Checklist "3/6" -LastProof "existing_job=$($state.activeJobId)" -Next "poll_existing"
} else {
  Write-Hb -Cycle 0 -Checklist "3/6" -LastProof "no_active_job" -Next "create_plan"
  if ($online -lt 6) {
    $state.notes += "Not all devices online; still attempting plan for online set only if >=2"
  }
  # Prefer full A-F when all online
  $planBody = @{ deviceIds = $deviceIds } | ConvertTo-Json -Depth 4
  $planBody | Set-Content (Join-Path $EvidenceRoot "plan-request.json")
  Write-Host "Creating merge plan for 6 Main Entrance devices (may take minutes)..."
  $sw = [Diagnostics.Stopwatch]::StartNew()
  try {
    $planResp = Invoke-RestMethod -Method Post "http://localhost:3001/api/device/hikvision/sdk-users/merge/plan" `
      -Headers $headers -ContentType "application/json" -Body $planBody -TimeoutSec $PlanTimeoutSec
    $sw.Stop()
    ($planResp | ConvertTo-Json -Depth 8) | Set-Content (Join-Path $EvidenceRoot "plan-response-summary-wrapper.json")
    $planId = $planResp.data.planId
    $plan = $planResp.data.plan
    $state.planId = $planId
    $planSummary = [ordered]@{
      elapsedSeconds = [math]::Round($sw.Elapsed.TotalSeconds, 1)
      planId = $planId
      uniqueIds = $plan.counts.unionUsers
      sourceRows = $plan.counts.sourceRows
      dedupedDeviceRecords = $plan.counts.dedupedDeviceRecords
      conflicts = $plan.counts.conflicts
      missing = $plan.counts.missing
      ambiguous = $plan.counts.ambiguous
      missingHrisLinks = $plan.counts.missingHrisLinks
      plannedWrites = if ($plan.plannedWrites) { @($plan.plannedWrites).Count } else { $plan.counts.plannedWrites }
      errors = if ($plan.errors) { @($plan.errors).Count } else { 0 }
      deviceCount = if ($plan.deviceIds) { @($plan.deviceIds).Count } else { 6 }
    }
    # Full plan can be huge — save slim users with conflicts only for choice fill
    $slimUsers = @($plan.users | ForEach-Object {
      [pscustomobject]@{
        key = $_.key
        sourceDeviceId = $_.sourceDeviceId
        targetDeviceIds = $_.targetDeviceIds
        missingOnDeviceIds = $_.missingOnDeviceIds
        conflicts = $_.conflicts
        vendorUserIds = $_.vendorUserIds
        employeeId = $_.employeeId
      }
    })
    @{ planId = $planId; summary = $planSummary; users = $slimUsers; counts = $plan.counts; errors = $plan.errors } |
      ConvertTo-Json -Depth 12 | Set-Content (Join-Path $EvidenceRoot "plan-slim.json")
    $planSummary | ConvertTo-Json | Set-Content (Join-Path $EvidenceRoot "plan-summary.json")
    Write-Hb -Cycle 0 -Checklist "4/6" -LastProof "plan=$planId unique=$($planSummary.uniqueIds)" -Next "richest_choices" -Extra @{ plan = $planSummary }

    $built = Build-RichestChoices $plan
    $built.ledger | ConvertTo-Json -Depth 6 | Set-Content (Join-Path $EvidenceRoot "richest-choice-ledger.json")
    ($built.choices | ConvertTo-Json -Depth 8) | Set-Content (Join-Path $EvidenceRoot "richest-choices.json")

    $startBody = @{
      planId = $planId
      choices = $built.choices
    } | ConvertTo-Json -Depth 20 -Compress
    [System.IO.File]::WriteAllText((Join-Path $EvidenceRoot "job-start-payload.json"), $startBody)
    Write-Host "Starting merge job with richest conflict choices..."
    $startResp = Invoke-RestMethod -Method Post "http://localhost:3001/api/device/hikvision/sdk-users/merge/jobs" `
      -Headers $headers -ContentType "application/json" -Body $startBody -TimeoutSec 120
    ($startResp | ConvertTo-Json -Depth 10) | Set-Content (Join-Path $EvidenceRoot "job-start-response.json")
    $jobId = $startResp.data.jobId
    if (-not $jobId) { $jobId = $startResp.data.progress.jobId }
    $state.activeJobId = $jobId
    Write-Hb -Cycle 0 -Checklist "5/6" -LastProof "job_started=$jobId" -Next "poll_loop"
  } catch {
    $err = $_.Exception.Message
    try { $err += " | " + $_.ErrorDetails.Message } catch {}
    $err | Set-Content (Join-Path $EvidenceRoot "plan-or-start-error.txt")
    $state.notes += "plan_or_start_failed: $err"
    Write-Hb -Cycle 0 -Checklist "4/6" -LastProof "plan_fail" -Next "repair_and_retry"
    # continue into poll/repair cycles
  }
}

# Poll / repair loop
for ($cycle = 1; $cycle -le $MaxCycles; $cycle++) {
  $state.cycles = $cycle
  if (-not (Test-LocalApi)) {
    Write-Hb -Cycle $cycle -Checklist "repair" -LastProof "api_down" -Next "restart_api"
    [void](Ensure-Api)
    $headers = Get-AdminHeaders
  }
  $tunnelOpen = 0
  foreach ($p in (10080..10085 + 10443..10448 + 18000..18005)) {
    try {
      $c = [System.Net.Sockets.TcpClient]::new()
      $a = $c.BeginConnect("127.0.0.1", $p, $null, $null)
      if ($a.AsyncWaitHandle.WaitOne(300, $false) -and $c.Connected) { $tunnelOpen++ }
      $c.Close()
    } catch {}
  }
  if ($tunnelOpen -lt 18) {
    Write-Hb -Cycle $cycle -Checklist "repair" -LastProof "tunnels=$tunnelOpen/18" -Next "ensure_tunnels"
    [void](Ensure-Tunnels)
  }

  if (-not $state.activeJobId) {
    # try list again for any processing
    try {
      $headers = Get-AdminHeaders
      $jobs = Get-Jobs $headers
      $jobList = @()
      if ($jobs.data) { $jobList = @($jobs.data) }
      $processing = @($jobList | Where-Object { $_.status -eq "processing" -and -not $_.stale })
      if ($processing.Count -gt 0) { $state.activeJobId = $processing[0].jobId }
    } catch {}
    if (-not $state.activeJobId) {
      Write-Hb -Cycle $cycle -Checklist "idle" -LastProof "no_job" -Next "sleep_then_replan_if_needed" -Extra @{ tunnelOpen = $tunnelOpen }
      # one replan attempt mid-loop if still no job
      if ($cycle -eq 2 -or $cycle -eq 10) {
        try {
          $headers = Get-AdminHeaders
          $planBody = @{ deviceIds = $deviceIds } | ConvertTo-Json
          $planResp = Invoke-RestMethod -Method Post "http://localhost:3001/api/device/hikvision/sdk-users/merge/plan" `
            -Headers $headers -ContentType "application/json" -Body $planBody -TimeoutSec $PlanTimeoutSec
          $planId = $planResp.data.planId
          $plan = $planResp.data.plan
          $built = Build-RichestChoices $plan
          $startBody = @{ planId = $planId; choices = $built.choices } | ConvertTo-Json -Depth 20 -Compress
          $startResp = Invoke-RestMethod -Method Post "http://localhost:3001/api/device/hikvision/sdk-users/merge/jobs" `
            -Headers $headers -ContentType "application/json" -Body $startBody -TimeoutSec 120
          $state.activeJobId = $startResp.data.jobId
          $state.planId = $planId
          ($startResp | ConvertTo-Json -Depth 8) | Set-Content (Join-Path $EvidenceRoot "job-start-retry-c$cycle.json")
        } catch {
          $_ | Out-String | Set-Content (Join-Path $EvidenceRoot "replan-error-c$cycle.txt")
        }
      }
      Start-Sleep -Seconds $PollSeconds
      continue
    }
  }

  try {
    $headers = Get-AdminHeaders
    $job = Get-Job $headers $state.activeJobId
    $payload = if ($job.data) { $job.data } else { $job }
    $poll = [ordered]@{
      at = (Get-Date).ToString("o")
      cycle = $cycle
      jobId = $state.activeJobId
      status = $payload.status
      stale = [bool]$payload.stale
      workerActive = $payload.workerActive
      recoveryHint = $payload.recoveryHint
      currentStage = $payload.currentStage
      currentUserKey = $payload.currentUserKey
      currentTargetDeviceId = $payload.currentTargetDeviceId
      processedWrites = $payload.processedWrites
      successfulWrites = $payload.successfulWrites
      failedWrites = $payload.failedWrites
      totalWrites = $payload.totalWrites
      message = $payload.message
      copyFailureSummary = $payload.copyFailureSummary
      progressEventCount = if ($payload.progressEvents) { @($payload.progressEvents).Count } else { $payload.progressEventCount }
      tunnelOpen = $tunnelOpen
    }
    # last few progress events for SDK/timeout eyes
    if ($payload.progressEvents) {
      $poll.latestEvents = @($payload.progressEvents | Select-Object -Last 8)
    }
    ($poll | ConvertTo-Json -Depth 10) | Set-Content (Join-Path $EvidenceRoot ("poll-c{0:D3}.json" -f $cycle))
    ($poll | ConvertTo-Json -Compress) | Add-Content (Join-Path $EvidenceRoot "poll.jsonl")
    $state.lastStatus = $payload.status

    $frac = "{0}/{1}" -f $payload.processedWrites, $payload.totalWrites
    Write-Hb -Cycle $cycle -Checklist "6/6-monitor" -LastProof ("{0} {1} stage={2} user={3}" -f $payload.status, $frac, $payload.currentStage, $payload.currentUserKey) -Next "poll" -Extra @{
      success = $payload.successfulWrites
      failed = $payload.failedWrites
      stage = $payload.currentStage
      copyFailures = $payload.copyFailureSummary
    }

    if ($payload.status -eq "completed") {
      ($payload | ConvertTo-Json -Depth 12) | Set-Content (Join-Path $EvidenceRoot "job-terminal-completed.json")
      $state.notes += "job completed"
      break
    }
    if ($payload.status -eq "failed" -or $payload.stale) {
      ($payload | ConvertTo-Json -Depth 12) | Set-Content (Join-Path $EvidenceRoot ("job-terminal-{0}.json" -f $payload.status))
      $state.notes += "job $($payload.status) stale=$($payload.stale)"
      # self-repair then replan remaining
      [void](Ensure-Tunnels)
      [void](Ensure-Api)
      $headers = Get-AdminHeaders
      $health = Get-DeviceHealth $headers
      $health | ConvertTo-Json | Set-Content (Join-Path $EvidenceRoot ("health-after-fail-c$cycle.json"))
      # clear active and allow replan on next cycles
      $state.activeJobId = $null
      $state.notes += "cleared_active_for_retry_after_fail"
    }
  } catch {
    $msg = $_.Exception.Message
    $msg | Set-Content (Join-Path $EvidenceRoot ("poll-error-c$cycle.txt"))
    Write-Hb -Cycle $cycle -Checklist "poll_err" -LastProof $msg -Next "repair"
    if ($msg -match "404|not found|expired") {
      $state.activeJobId = $null
    }
    [void](Ensure-Tunnels)
    [void](Ensure-Api)
  }

  Start-Sleep -Seconds $PollSeconds
}

$state.endedAt = (Get-Date).ToString("o")
$state | ConvertTo-Json -Depth 8 | Set-Content $summaryPath
Write-Hb -Cycle $state.cycles -Checklist "done" -LastProof $summaryPath -Next "exit"
Write-Host "Loop finished. Evidence: $EvidenceRoot"
