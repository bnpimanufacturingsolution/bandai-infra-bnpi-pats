# Install project-truth-disk-guard on the Hyper-V VM (daily/6h timer).
# Default SSH target: 10.184.37.78 (works when .19 ARP is flaky); falls back to .19 then project-truth-hris.
param(
  [string]$SshTarget = "",
  [string]$IdentityFile = "$env:USERPROFILE\.ssh\node-health-appliance_ed25519"
)

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent $PSScriptRoot
$srcSh = Join-Path $repoRoot "scripts\linux\project-truth-disk-guard.sh"
$srcService = Join-Path $repoRoot "scripts\linux\project-truth-disk-guard.service"
$srcTimer = Join-Path $repoRoot "scripts\linux\project-truth-disk-guard.timer"

foreach ($f in @($srcSh, $srcService, $srcTimer)) {
  if (-not (Test-Path $f)) { throw "Missing $f" }
}

function Test-Ssh([string]$hostName) {
  & ssh -i $IdentityFile -o ConnectTimeout=8 -o BatchMode=yes -o StrictHostKeyChecking=accept-new "infra@$hostName" "echo OK" 2>$null
  return ($LASTEXITCODE -eq 0)
}

if (-not $SshTarget) {
  foreach ($h in @("10.184.37.78", "10.184.37.19")) {
    if (Test-Ssh $h) { $SshTarget = $h; break }
  }
  if (-not $SshTarget) {
    # Cloudflare SSH alias as last resort
    $probe = & ssh -o ConnectTimeout=12 -o BatchMode=yes project-truth-hris "echo OK" 2>$null
    if ($LASTEXITCODE -eq 0) { $SshTarget = "project-truth-hris" }
  }
}

if (-not $SshTarget) { throw "No SSH target reachable (.78/.19/project-truth-hris)" }

Write-Host "Using SSH target: $SshTarget"

$sshBase = @("-i", $IdentityFile, "-o", "BatchMode=yes", "-o", "ConnectTimeout=15")
if ($SshTarget -eq "project-truth-hris") {
  $remote = "project-truth-hris"
  $sshCmd = { param($args2) & ssh @args2 $remote $args[0] }
} else {
  $remote = "infra@$SshTarget"
}

function Invoke-Remote([string]$cmd) {
  & ssh @sshBase $remote $cmd
  if ($LASTEXITCODE -ne 0) { throw "Remote failed: $cmd" }
}

$tmp = "/tmp/pt-disk-guard-install"
Invoke-Remote "mkdir -p $tmp"
& scp @sshBase $srcSh "${remote}:$tmp/project-truth-disk-guard.sh"
& scp @sshBase $srcService "${remote}:$tmp/project-truth-disk-guard.service"
& scp @sshBase $srcTimer "${remote}:$tmp/project-truth-disk-guard.timer"

$install = @"
set -e
sudo sed -i 's/\r$//' $tmp/project-truth-disk-guard.sh
sudo install -m 0755 $tmp/project-truth-disk-guard.sh /usr/local/sbin/project-truth-disk-guard.sh
sudo install -m 0644 $tmp/project-truth-disk-guard.service /etc/systemd/system/project-truth-disk-guard.service
sudo install -m 0644 $tmp/project-truth-disk-guard.timer /etc/systemd/system/project-truth-disk-guard.timer
sudo systemctl daemon-reload
sudo systemctl enable --now project-truth-disk-guard.timer
sudo systemctl start project-truth-disk-guard.service || true
systemctl is-enabled project-truth-disk-guard.timer
systemctl list-timers project-truth-disk-guard.timer --no-pager
df -h /
sudo /usr/local/sbin/project-truth-disk-guard.sh || true
"@

Invoke-Remote $install
Write-Host "Disk guard installed on $SshTarget"
