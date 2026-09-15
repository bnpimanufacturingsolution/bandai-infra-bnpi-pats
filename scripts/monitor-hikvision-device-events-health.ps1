# Project Truth — Hikvision Device Events health monitor (agent/operator).
# Loops until Ctrl+C. Checks classified errors stay closed.
# Usage:
#   powershell -File scripts/monitor-hikvision-device-events-health.ps1
#   powershell -File scripts/monitor-hikvision-device-events-health.ps1 -IntervalSeconds 60

param(
  [int]$IntervalSeconds = 60,
  [string]$SshTarget = "project-truth-bnpi-pats",
  [string]$EvidenceDir = ".runtime/hikvision-health-monitor"
)

$ErrorActionPreference = "Continue"
New-Item -ItemType Directory -Force -Path $EvidenceDir | Out-Null
$log = Join-Path $EvidenceDir ("health-" + (Get-Date -Format "yyyyMMdd") + ".md")
$cycle = 0

function Write-Line([string]$line) {
  $stamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
  $out = "HEARTBEAT | $stamp | $line"
  Add-Content -Path $log -Value $out
  Write-Host $out
}

Write-Line "monitor_start interval=${IntervalSeconds}s evidence=$EvidenceDir"

while ($true) {
  $cycle++
  $checks = [ordered]@{}
  $red = @()

  # Public API health
  foreach ($u in @(
    "https://dev-api.bnpi-pats.tech/health",
    "https://api.bnpi-pats.tech/health",
    "https://uat-api.bnpi-pats.tech/health"
  )) {
    try {
      $r = Invoke-WebRequest -Uri $u -UseBasicParsing -TimeoutSec 15
      $checks[$u] = "ok:$($r.StatusCode)"
    } catch {
      $checks[$u] = "FAIL"
      $red += $u
    }
  }

  # SSH cluster snapshot
  $remote = @'
set +e
echo LISTENER=$(systemctl is-active project-truth-hikvision-hot-reload-listener.service 2>/dev/null)
echo MISS_5M=$(kubectl -n dev logs deploy/bnpi-pats-hikvision-watcher --since=5m 2>/dev/null | grep -c "missing access credentials" || echo 0)
echo GHOST=$(kubectl -n dev exec sts/bnpi-pats-postgres -- psql -U postgres -d bnpi-pats -t -A -c "SELECT \"isDeleted\" FROM \"Device\" WHERE id='"'"'cmry9tvve000gnr3oqo2zhzgw'"'"';" 2>/dev/null | tr -d "[:space:]")
echo WATCHER=$(kubectl -n dev get deploy bnpi-pats-hikvision-watcher -o jsonpath="{.status.readyReplicas}/{.status.replicas}" 2>/dev/null)
echo DEVAPI=$(kubectl -n dev get deploy bnpi-pats-api -o jsonpath="{.status.readyReplicas}/{.status.replicas}" 2>/dev/null)
curl -sS -m 3 http://127.0.0.1:3101/health | head -c 80; echo
'@
  try {
    $b64 = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($remote))
    $sshOut = ssh -o BatchMode=yes -o ConnectTimeout=25 $SshTarget "echo $b64 | base64 -d | bash" 2>$null
    $checks["ssh"] = "ok"
    foreach ($line in ($sshOut -split "`n")) {
      $t = $line.Trim()
      if ($t -match "^LISTENER=(.+)$") {
        $checks["listener"] = $Matches[1]
        if ($Matches[1] -ne "active") { $red += "listener" }
      }
      if ($t -match "^MISS_5M=(.+)$") {
        $v = ($Matches[1] -replace "[^0-9]", "")
        if (-not $v) { $v = "0" }
        $checks["watcher_miss_5m"] = $v
        if ([int]$v -gt 0) { $red += "watcher_miss" }
      }
      if ($t -match "^GHOST=(.+)$") {
        $checks["ghost_deleted"] = $Matches[1]
        if ($Matches[1] -eq "f" -or $Matches[1] -eq "false") { $red += "ghost_active" }
      }
      if ($t -match "^WATCHER=(.+)$") { $checks["watcher"] = $Matches[1] }
      if ($t -match "^DEVAPI=(.+)$") { $checks["dev_api"] = $Matches[1] }
    }
  } catch {
    $checks["ssh"] = "FAIL"
    $red += "ssh"
  }

  $status = if ($red.Count -eq 0) { "GREEN" } else { "RED:" + ($red -join ",") }
  $detail = ($checks.GetEnumerator() | ForEach-Object { "$($_.Key)=$($_.Value)" }) -join " "
  Write-Line "cycle=$cycle status=$status $detail"

  if ($red.Count -gt 0) {
    # Soft alert file for agents
    @{
      cycle = $cycle
      status = $status
      red = $red
      checks = $checks
      at = (Get-Date).ToString("o")
    } | ConvertTo-Json -Depth 5 | Set-Content (Join-Path $EvidenceDir "LAST-RED.json")
  } else {
    @{
      cycle = $cycle
      status = "GREEN"
      checks = $checks
      at = (Get-Date).ToString("o")
    } | ConvertTo-Json -Depth 5 | Set-Content (Join-Path $EvidenceDir "LAST-GREEN.json")
  }

  Start-Sleep -Seconds $IntervalSeconds
}
