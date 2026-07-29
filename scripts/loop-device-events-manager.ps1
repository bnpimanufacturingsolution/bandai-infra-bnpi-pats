# Persistent manager loop for Device Events all-green job card.
# Does NOT exit when a subagent finishes. Keeps writing heartbeats and
# re-running A-DRIFT until goal holds (or MaxHours).
#
# Usage:
#   powershell -File scripts/loop-device-events-manager.ps1
#   powershell -File scripts/loop-device-events-manager.ps1 -IntervalSeconds 60 -MaxHours 24
#   powershell -File scripts/loop-device-events-manager.ps1 -RequireG2
#
# Exit codes:
#   0 = stopped after MaxHours with last state green
#   2 = stopped after MaxHours still not green / drift
#   (does not exit early on single green — requires HoldGreenCycles)

param(
  [string]$StampDir = "",
  [string]$LatestPointer = ".runtime/device-events-allgreen-LATEST.txt",
  [int]$IntervalSeconds = 60,
  [int]$HoldGreenCycles = 5,
  [double]$MaxHours = 24,
  [switch]$RequireG2,
  [switch]$Once
)

$ErrorActionPreference = "Continue"
$repoRoot = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $repoRoot

if (-not $StampDir) {
  $ptr = Join-Path $repoRoot $LatestPointer
  if (Test-Path $ptr) { $StampDir = (Get-Content $ptr -Raw).Trim() }
}
if (-not $StampDir) {
  $stamp = Get-Date -Format "yyyyMMdd-HHmmss"
  $StampDir = Join-Path $repoRoot ".runtime\device-events-allgreen-$stamp"
}
New-Item -ItemType Directory -Force -Path $StampDir | Out-Null
(Join-Path $repoRoot $LatestPointer) | ForEach-Object {
  $StampDir | Set-Content $_ -Encoding UTF8
}

$hb = Join-Path $StampDir "MANAGER-HEARTBEATS.md"
$todo = Join-Path $StampDir "MANAGER-NEXT-SPAWNS.md"
$driftScript = Join-Path $repoRoot "scripts\check-device-events-prompt-drift.ps1"
$deadline = (Get-Date).AddHours($MaxHours)
$cycle = 0
$consecutiveGreen = 0
$loginBody = @{ email = "admin@bandai.local"; password = "password123"; appCode = "hris" } | ConvertTo-Json

function Write-Hb([string]$line) {
  $ts = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
  $out = "HEARTBEAT | manager | cycle=$cycle | time=$ts | $line"
  Add-Content -Path $hb -Value $out
  Write-Output $out
}

function Get-G1State {
  $state = [ordered]@{
    health = $false
    auth = $false
    db = $false
    pathReady = $false
    armed = $false
    pathOk = $false
    tap = $false
    enroll = $false
    receiving = $false
    overall = "unknown"
    headline = ""
    error = $null
  }
  try {
    $r = Invoke-WebRequest "https://dev-api.bnpi-hris.tech/health" -UseBasicParsing -TimeoutSec 15
    $state.health = ($r.StatusCode -eq 200)
  } catch {
    $state.error = "health: $($_.Exception.Message)"
    return $state
  }
  try {
    $login = Invoke-RestMethod -Method Post "https://dev-api.bnpi-hris.tech/api/auth/login" `
      -ContentType "application/json" -Body $loginBody -TimeoutSec 20
    $h = @{ Authorization = "Bearer $($login.data.token)" }
    $state.auth = $true
    $d = (Invoke-RestMethod -Method Get "https://dev-api.bnpi-hris.tech/api/device/events/live-readiness" `
        -Headers $h -TimeoutSec 30).data
    $d | ConvertTo-Json -Depth 8 | Set-Content (Join-Path $StampDir "manager-live-readiness-latest.json") -Encoding UTF8
    $state.db = [bool]$d.database.ok
    $state.pathReady = [bool]$d.pathReady
    $state.armed = [bool]($d.listener.running -and $d.listener.armed)
    $state.pathOk = ($d.callbackPost.pathOk -eq $true)
    $state.tap = [bool]$d.safeToTap
    $state.enroll = [bool]$d.safeToEnroll
    $state.receiving = [bool]$d.listener.receiving
    $state.overall = [string]$d.overall
    $state.headline = [string]$d.headline
  } catch {
    $state.error = "api: $($_.Exception.Message)"
  }
  return $state
}

function Test-G1([hashtable]$s) {
  return ($s.health -and $s.auth -and $s.db -and $s.pathReady -and $s.armed -and $s.pathOk -and $s.tap)
}

function Test-G2([hashtable]$s) {
  return ((Test-G1 $s) -and $s.enroll -and $s.receiving)
}

Write-Hb "MANAGER_START interval=${IntervalSeconds}s holdGreen=$HoldGreenCycles maxHours=$MaxHours requireG2=$RequireG2 stamp=$StampDir"

while ((Get-Date) -lt $deadline) {
  $cycle++
  $g = Get-G1State
  $g1 = Test-G1 $g
  $g2 = Test-G2 $g

  # Run drift script every cycle (A-DRIFT machine half)
  $driftVerdict = "unknown"
  $driftExit = -1
  if (Test-Path $driftScript) {
    & powershell -NoProfile -ExecutionPolicy Bypass -File $driftScript -StampDir $StampDir 2>&1 | Out-Null
    $driftExit = $LASTEXITCODE
    $driftJson = Join-Path $StampDir "06-drift-compliance.json"
    if (Test-Path $driftJson) {
      try {
        $driftVerdict = (Get-Content $driftJson -Raw | ConvertFrom-Json).verdict
      } catch { $driftVerdict = "parse_fail" }
    }
  }

  $goal = $g1
  if ($RequireG2) { $goal = ($g1 -and $g2) }

  # Open items for manager todo (what root/agents must spawn next)
  $next = New-Object System.Collections.Generic.List[string]
  if (-not $g.health) { $next.Add("SPAWN A-FIX-RT | reason=dev-api health fail") | Out-Null }
  if (-not $g.auth) { $next.Add("SPAWN A-FIX-RT | reason=login fail") | Out-Null }
  if (-not $g.db) { $next.Add("SPAWN A-FIX-RT | reason=database.ok false") | Out-Null }
  if (-not $g.pathReady) { $next.Add("SPAWN A-FIX-BE/A-FIX-RT | reason=pathReady false") | Out-Null }
  if (-not $g.armed) { $next.Add("SPAWN A-FIX-RT | reason=listener not armed") | Out-Null }
  if (-not $g.pathOk) { $next.Add("SPAWN A-FIX-BE/A-FIX-RT | reason=pathOk not true") | Out-Null }
  if (-not $g.tap) { $next.Add("SPAWN A-FIX-RT | reason=safeToTap false") | Out-Null }
  if ($RequireG2 -and -not $g2) { $next.Add("SPAWN A-VERIFY + physical major-5 tap | reason=G2 liveReceiving/enroll") | Out-Null }
  if ($driftVerdict -eq "drift") { $next.Add("SPAWN A-DRIFT follow-up + fix D* items in 06-drift-compliance.md") | Out-Null }
  if ($next.Count -eq 0) { $next.Add("HOLD | re-probe next cycle; no spawn required if still green") | Out-Null }

  $todoMd = @(
    "# MANAGER-NEXT-SPAWNS (auto; do not stop until goal holds)"
    ""
    "- cycle: $cycle"
    "- time: $(Get-Date -Format o)"
    "- g1: $g1 | g2: $g2 | requireG2: $RequireG2"
    "- driftVerdict: $driftVerdict (exit=$driftExit)"
    "- consecutiveGreen: $consecutiveGreen / $HoldGreenCycles"
    ""
    "## Ordered next actions for root / agents"
    ""
  )
  $i = 1
  foreach ($n in $next) {
    $todoMd += "$i. $n"
    $i++
  }
  $todoMd += ""
  $todoMd += "Root **must not exit** while consecutiveGreen < HoldGreenCycles or while driftVerdict=drift."
  $todoMd += "Re-open this file every cycle. Re-spawn A-DRIFT if missing from MANIFEST."
  $todoMd -join "`n" | Set-Content $todo -Encoding UTF8

  if ($goal -and $driftVerdict -ne "drift") {
    $consecutiveGreen++
  } else {
    $consecutiveGreen = 0
  }

  Write-Hb "g1=$g1 g2=$g2 overall=$($g.overall) pathReady=$($g.pathReady) db=$($g.db) armed=$($g.armed) pathOk=$($g.pathOk) tap=$($g.tap) enroll=$($g.enroll) drift=$driftVerdict consecGreen=$consecutiveGreen/$HoldGreenCycles error=$($g.error)"

  # Persist manager snapshot for agents
  @{
    cycle = $cycle
    g1 = $g1
    g2 = $g2
    driftVerdict = $driftVerdict
    consecutiveGreen = $consecutiveGreen
    holdGreenCycles = $HoldGreenCycles
    goalMetHolding = ($consecutiveGreen -ge $HoldGreenCycles)
    state = $g
    nextSpawns = @($next)
    at = (Get-Date).ToUniversalTime().ToString("o")
  } | ConvertTo-Json -Depth 6 | Set-Content (Join-Path $StampDir "MANAGER-STATE.json") -Encoding UTF8

  if ($Once) { break }

  if ($consecutiveGreen -ge $HoldGreenCycles) {
    Write-Hb "GOAL_HELD consecutiveGreen=$consecutiveGreen — manager may stop (goal sticky)"
    "goal_held=true cycles=$consecutiveGreen $(Get-Date -Format o)" | Set-Content (Join-Path $StampDir "GOAL-HELD.flag") -Encoding UTF8
    exit 0
  }

  Start-Sleep -Seconds $IntervalSeconds
}

Write-Hb "MANAGER_STOP maxHours reached consecutiveGreen=$consecutiveGreen"
if ($consecutiveGreen -ge $HoldGreenCycles) { exit 0 }
exit 2
