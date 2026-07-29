# A-DRIFT machine check: job-card compliance + goal stall for Device Events all-green.
# Usage:
#   powershell -File scripts/check-device-events-prompt-drift.ps1
#   powershell -File scripts/check-device-events-prompt-drift.ps1 -StampDir .runtime\device-events-allgreen-...
# Exit: 0 = compliant (or goal reached), 2 = drift detected

param(
  [string]$StampDir = "",
  [string]$LatestPointer = ".runtime/device-events-allgreen-LATEST.txt"
)

$ErrorActionPreference = "Continue"
$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
if (-not $StampDir) {
  $ptr = Join-Path $root $LatestPointer
  if (Test-Path $ptr) {
    $StampDir = (Get-Content $ptr -Raw).Trim()
  }
}
if (-not $StampDir -or -not (Test-Path $StampDir)) {
  Write-Error "Stamp dir missing. Pass -StampDir or set $LatestPointer"
  exit 2
}

$alerts = New-Object System.Collections.Generic.List[object]
function Add-Alert([string]$code, [string]$severity, [string]$detail, [string]$next) {
  $alerts.Add([pscustomobject]@{
      code = $code
      severity = $severity
      detail = $detail
      next = $next
    }) | Out-Null
}

$manifestPath = Join-Path $StampDir "MULTI-AGENT-MANIFEST.json"
$rootStatus = Join-Path $StampDir "00-ROOT-STATUS.md"
$heartbeats = Join-Path $StampDir "HEARTBEATS.md"
$obs = Join-Path $StampDir "01-obs.md"
$class = Join-Path $StampDir "02-error-classification.md"
$mon = Join-Path $StampDir "05-monitor.md"
$readyPath = Join-Path $StampDir "01-live-readiness.json"

# D1 MANIFEST
if (-not (Test-Path $manifestPath)) {
  Add-Alert "D1" "red" "MULTI-AGENT-MANIFEST.json missing" "write_MANIFEST_and_SPAWN"
} else {
  try {
    $man = Get-Content $manifestPath -Raw | ConvertFrom-Json
  } catch {
    Add-Alert "D1" "red" "MANIFEST unreadable JSON" "fix_MANIFEST"
    $man = $null
  }
  if ($man) {
    $roles = @($man.agents | ForEach-Object { $_.role })
    foreach ($need in @("A-OBS", "A-CLASS", "A-MON", "A-DRIFT")) {
      if ($roles -notcontains $need) {
        # allow tool_unavailable mode without A-DRIFT only if mode is ROOT_FALLBACK
        if ($man.mode -eq "ROOT_FALLBACK" -and $need -eq "A-DRIFT") { continue }
        if ($man.mode -eq "ROOT_FALLBACK") { continue }
        if ($need -eq "A-DRIFT" -and $man.mode -eq "multi_agent") {
          Add-Alert "D2" "red" "MANIFEST missing role $need" "SPAWN_A-DRIFT"
        } elseif ($need -ne "A-DRIFT") {
          Add-Alert "D2" "red" "MANIFEST missing role $need" "SPAWN_$need"
        }
      }
    }
    if ($man.mode -ne "multi_agent" -and $man.mode -ne "ROOT_FALLBACK") {
      Add-Alert "D7" "yellow" "MANIFEST mode=$($man.mode) unexpected" "set_mode_multi_agent_or_ROOT_FALLBACK"
    }
  }
}

# D3 heartbeats
if (-not (Test-Path $heartbeats)) {
  Add-Alert "D3" "red" "HEARTBEATS.md missing" "write_heartbeats"
} else {
  $hbLines = @(Get-Content $heartbeats | Where-Object { $_ -match "HEARTBEAT" })
  if ($hbLines.Count -lt 1) {
    Add-Alert "D3" "red" "No HEARTBEAT lines" "emit_heartbeat"
  } else {
    $lastWrite = (Get-Item $heartbeats).LastWriteTimeUtc
    $ageMin = [int]((Get-Date).ToUniversalTime() - $lastWrite).TotalMinutes
    if ($ageMin -gt 15 -and -not (Test-Path (Join-Path $StampDir "GOAL-REACHED.flag"))) {
      Add-Alert "D3" "yellow" "HEARTBEATS stale ${ageMin}m" "resume_cycles"
    }
  }
}

# D4 deliverables
if (-not (Test-Path $obs)) { Add-Alert "D4" "red" "01-obs.md missing" "SPAWN_A-OBS" }
if (-not (Test-Path $class)) { Add-Alert "D4" "red" "02-error-classification.md missing" "SPAWN_A-CLASS" }
if (-not (Test-Path $mon)) { Add-Alert "D4" "yellow" "05-monitor.md missing" "SPAWN_A-MON" }

# D5 root status
if (-not (Test-Path $rootStatus)) {
  Add-Alert "D5" "yellow" "00-ROOT-STATUS.md missing" "root_write_status"
} else {
  $rs = Get-Content $rootStatus -Raw
  if ($rs -notmatch "G1\.") {
    Add-Alert "D5" "yellow" "ROOT status lacks G1 table" "update_ROOT_STATUS"
  }
}

# D6 / D8 / D9 from live readiness if present
$goalReached = $false
$g1Open = @()
if (Test-Path $readyPath) {
  try {
    $ready = Get-Content $readyPath -Raw | ConvertFrom-Json
    $d = $ready.data
    if (-not $d.database.ok) { $g1Open += "G1.3_db" }
    if (-not $d.pathReady) { $g1Open += "G1.4_pathReady" }
    if (-not ($d.listener.running -and $d.listener.armed)) { $g1Open += "G1.5_listener" }
    if ($d.callbackPost.pathOk -ne $true) { $g1Open += "G1.6_pathOk" }
    if (-not $d.safeToTap) { $g1Open += "G1.7_safeToTap" }
  } catch {
    Add-Alert "D9" "yellow" "live-readiness JSON unreadable" "reprobe_live_readiness"
  }
}

# Optional G1.8/9/10/11 from root status text
if (Test-Path $rootStatus) {
  $rs = Get-Content $rootStatus -Raw
  if ($rs -match "G1\.8.*OPEN") { $g1Open += "G1.8_ui" }
  if ($rs -match "G1\.9.*OPEN") { $g1Open += "G1.9_watcher" }
  if ($rs -match "G1\.10.*OPEN") { $g1Open += "G1.10_ghost" }
  if ($rs -match "G1\.11.*OPEN") { $g1Open += "G1.11_bounce" }
}

if ($g1Open.Count -eq 0 -and (Test-Path $readyPath) -and (Test-Path $obs) -and (Test-Path $manifestPath)) {
  # require pathReady true for goal
  try {
    $d = (Get-Content $readyPath -Raw | ConvertFrom-Json).data
    if ($d.pathReady -and $d.database.ok -and $d.safeToTap -and $d.listener.armed) {
      $goalReached = $true
    }
  } catch {}
}

if (-not $goalReached -and $g1Open.Count -gt 0) {
  Add-Alert "D6" "red" ("G1 open: " + ($g1Open -join ", ")) "spawn_A-FIX_or_A-VERIFY_for_open_items"
}

# D7 solo without fallback: MANIFEST missing agents with ids while root-only work
if ((Test-Path $manifestPath) -and $man -and $man.mode -eq "multi_agent") {
  $withId = @($man.agents | Where-Object { $_.subagent_id })
  if ($withId.Count -eq 0) {
    Add-Alert "D7" "red" "multi_agent mode but no subagent_ids" "SPAWN_or_set_ROOT_FALLBACK"
  }
}

$redCount = @($alerts | Where-Object { $_.severity -eq "red" }).Count
$yellowCount = @($alerts | Where-Object { $_.severity -eq "yellow" }).Count
$verdict = if ($redCount -gt 0) { "drift" } elseif ($yellowCount -gt 0) { "warn" } else { "compliant" }
if ($goalReached -and $verdict -eq "compliant") {
  $verdict = "goal_reached"
  "goalReached=true $(Get-Date -Format o)" | Set-Content (Join-Path $StampDir "GOAL-REACHED.flag")
}

$report = [ordered]@{
  generatedAt = (Get-Date).ToUniversalTime().ToString("o")
  stampDir = $StampDir
  verdict = $verdict
  goalReached = $goalReached
  g1Open = $g1Open
  redCount = $redCount
  yellowCount = $yellowCount
  alerts = $alerts
  nextActions = @($alerts | ForEach-Object { $_.next } | Select-Object -Unique)
}

$jsonPath = Join-Path $StampDir "06-drift-compliance.json"
$mdPath = Join-Path $StampDir "06-drift-compliance.md"
$report | ConvertTo-Json -Depth 6 | Set-Content $jsonPath -Encoding UTF8

$md = @()
$md += "# 06-drift-compliance (A-DRIFT)"
$md += ""
$md += "- generatedAt: $($report.generatedAt)"
$md += "- stamp: ``$StampDir``"
$md += "- **verdict: $($report.verdict)**"
$md += "- goalReached: $($report.goalReached)"
$md += "- g1Open: $($g1Open -join ', ')"
$md += ""
$md += "| Code | Severity | Detail | Next |"
$md += "|---|---|---|---|"
if ($alerts.Count -eq 0) {
  $md += "| — | — | No drift alerts | continue_or_close |"
} else {
  foreach ($a in $alerts) {
    $md += "| $($a.code) | $($a.severity) | $($a.detail) | $($a.next) |"
  }
}
$md += ""
$md += "## Operator chat lines"
$md += '```'
$md += "DRIFT_ALERT | severity=$(if($redCount -gt 0){'red'}elseif($yellowCount -gt 0){'yellow'}else{'green'}) | verdict=$verdict | g1Open=$($g1Open.Count)"
foreach ($a in ($alerts | Where-Object { $_.severity -eq "red" })) {
  $md += "DRIFT_ALERT | severity=red | item=$($a.code) | next=$($a.next)"
}
$md += '```'
$md -join "`n" | Set-Content $mdPath -Encoding UTF8

Write-Host "A-DRIFT verdict=$verdict goalReached=$goalReached red=$redCount yellow=$yellowCount"
Write-Host "Wrote $mdPath"
Write-Host "Wrote $jsonPath"

if ($verdict -eq "drift") { exit 2 }
exit 0
