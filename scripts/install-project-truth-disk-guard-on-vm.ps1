<#
.SYNOPSIS
  Install Project Truth disk-guard (safe prune + systemd timer) on the appliance VM.

.DESCRIPTION
  Uploads scripts/linux/project-truth-disk-guard.{sh,service,timer} and installs:
    /usr/local/sbin/project-truth-disk-guard.sh
    /usr/local/bin/project-truth-disk-guard          (compat symlink/copy)
    /etc/systemd/system/project-truth-disk-guard.service
    /etc/systemd/system/project-truth-disk-guard.timer

  Enables the timer and runs one immediate pass.

  HARD BANS (guard script enforces; installer never touches these):
    - /etc/cloudflared
    - cloudflared-bnpi-hris.service (never stop/disable)
    - postgres / k3s PVC data

.PARAMETER SshTarget
  Host/IP or full user@host, or 'project-truth-hris'. Empty = auto probe
  10.184.37.78, then 10.184.37.19, then project-truth-hris.

.PARAMETER DryRun
  Install units but run guard with PROJECT_TRUTH_DISK_GUARD_DRY_RUN=1.

.PARAMETER SkipRun
  Install/enable timer only; do not run immediately.

.PARAMETER Status
  Print timer/service/df/cloudflared status; do not reinstall.
#>
param(
  [string]$SshTarget = '',
  [string]$IdentityFile = (Join-Path $env:USERPROFILE '.ssh\node-health-appliance_ed25519'),
  [switch]$DryRun,
  [switch]$SkipRun,
  [switch]$Status
)

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
$srcSh = Join-Path $repoRoot 'scripts\linux\project-truth-disk-guard.sh'
$srcService = Join-Path $repoRoot 'scripts\linux\project-truth-disk-guard.service'
$srcTimer = Join-Path $repoRoot 'scripts\linux\project-truth-disk-guard.timer'

foreach ($f in @($srcSh, $srcService, $srcTimer)) {
  if (-not (Test-Path -LiteralPath $f)) { throw "Missing $f" }
}

function Test-SshTarget {
  param(
    [string[]]$SshArgs,
    [string]$Label
  )
  $prev = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  $out = & ssh.exe @SshArgs 'echo SSH_OK' 2>&1
  $code = $LASTEXITCODE
  $ErrorActionPreference = $prev
  if ($code -eq 0 -and (($out | Out-String) -match 'SSH_OK')) {
    return $true
  }
  Write-Host "SSH probe failed: $Label (exit $code)"
  return $false
}

function Get-SshPrefix {
  param([string]$Target)
  $prefix = @('-o', 'BatchMode=yes', '-o', 'ConnectTimeout=15', '-o', 'StrictHostKeyChecking=accept-new')
  if (Test-Path -LiteralPath $IdentityFile) {
    $prefix = @('-i', $IdentityFile) + $prefix
  }
  if ($Target -match '@' -or $Target -eq 'project-truth-hris') {
    return @{ Remote = $Target; Args = $prefix + @($Target) }
  }
  return @{ Remote = "infra@$Target"; Args = $prefix + @("infra@$Target") }
}

# Resolve target
$script:SshInfo = $null
if ($SshTarget) {
  $info = Get-SshPrefix -Target $SshTarget
  if (-not (Test-SshTarget -SshArgs $info.Args -Label $info.Remote)) {
    throw "SSH target not reachable: $($info.Remote)"
  }
  $script:SshInfo = $info
} else {
  foreach ($h in @('10.184.37.78', '10.184.37.19', 'project-truth-hris')) {
    $info = Get-SshPrefix -Target $h
    if (Test-SshTarget -SshArgs $info.Args -Label $info.Remote) {
      $script:SshInfo = $info
      break
    }
  }
}
if (-not $script:SshInfo) {
  throw 'No SSH target reachable (tried 10.184.37.78, 10.184.37.19, project-truth-hris).'
}
Write-Host "Using SSH target: $($script:SshInfo.Remote)"

function Invoke-Remote {
  param(
    [Parameter(Mandatory)][string]$Command,
    [int]$TimeoutSec = 60
  )
  $args = @()
  # Rebuild with timeout override on ConnectTimeout
  foreach ($a in $script:SshInfo.Args) {
    if ($a -eq 'ConnectTimeout=15') {
      $args += "ConnectTimeout=$TimeoutSec"
    } else {
      $args += $a
    }
  }
  $prev = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  & ssh.exe @args $Command 2>&1 | ForEach-Object { Write-Host $_ }
  $code = $LASTEXITCODE
  $ErrorActionPreference = $prev
  return [int]$code
}

function Copy-ToVm {
  param(
    [Parameter(Mandatory)][string]$LocalPath,
    [Parameter(Mandatory)][string]$RemotePath
  )
  $scpArgs = @()
  if (Test-Path -LiteralPath $IdentityFile) {
    $scpArgs += @('-i', $IdentityFile)
  }
  $scpArgs += @(
    '-o', 'BatchMode=yes',
    '-o', 'ConnectTimeout=20',
    '-o', 'StrictHostKeyChecking=accept-new',
    $LocalPath,
    "$($script:SshInfo.Remote):$RemotePath"
  )
  $prev = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  & scp.exe @scpArgs 2>&1 | ForEach-Object { Write-Host $_ }
  $code = $LASTEXITCODE
  $ErrorActionPreference = $prev
  if ($code -ne 0) {
    throw "SCP failed for $LocalPath (exit $code)"
  }
}

if ($Status) {
  $statusCmd = @'
set +e
echo "=== timer ==="
systemctl list-timers project-truth-disk-guard.timer --no-pager
echo
echo "=== enabled/active ==="
systemctl is-enabled project-truth-disk-guard.timer
systemctl is-active project-truth-disk-guard.timer
echo
echo "=== unit files ==="
ls -la /usr/local/sbin/project-truth-disk-guard.sh /usr/local/bin/project-truth-disk-guard /etc/systemd/system/project-truth-disk-guard.* 2>/dev/null
echo
echo "=== last journal ==="
journalctl -u project-truth-disk-guard.service -n 80 --no-pager
echo
echo "=== df ==="
df -h / /var /tmp
echo
echo "=== cloudflared must stay active; guard never touches it ==="
systemctl is-active cloudflared-bnpi-hris.service 2>/dev/null || echo unknown
'@
  exit (Invoke-Remote -Command $statusCmd -TimeoutSec 45)
}

$tmp = '/tmp/pt-disk-guard-install'
$code = Invoke-Remote -Command "mkdir -p $tmp"
if ($code -ne 0) { throw "mkdir staging failed (exit $code)" }

Copy-ToVm -LocalPath $srcSh -RemotePath "$tmp/project-truth-disk-guard.sh"
Copy-ToVm -LocalPath $srcService -RemotePath "$tmp/project-truth-disk-guard.service"
Copy-ToVm -LocalPath $srcTimer -RemotePath "$tmp/project-truth-disk-guard.timer"

$installCmd = @'
set -euo pipefail
tmp=/tmp/pt-disk-guard-install
test -f "$tmp/project-truth-disk-guard.sh"
test -f "$tmp/project-truth-disk-guard.service"
test -f "$tmp/project-truth-disk-guard.timer"

# Strip CRLF if uploaded from Windows.
sudo sed -i 's/\r$//' "$tmp/project-truth-disk-guard.sh" "$tmp/project-truth-disk-guard.service" "$tmp/project-truth-disk-guard.timer"

sudo install -d -m 0755 /usr/local/sbin /usr/local/bin /usr/local/share/project-truth /etc/project-truth
sudo install -m 0755 "$tmp/project-truth-disk-guard.sh" /usr/local/sbin/project-truth-disk-guard.sh
sudo install -m 0755 "$tmp/project-truth-disk-guard.sh" /usr/local/bin/project-truth-disk-guard
sudo install -m 0644 "$tmp/project-truth-disk-guard.sh" /usr/local/share/project-truth/project-truth-disk-guard.sh
sudo install -m 0644 "$tmp/project-truth-disk-guard.service" /etc/systemd/system/project-truth-disk-guard.service
sudo install -m 0644 "$tmp/project-truth-disk-guard.timer" /etc/systemd/system/project-truth-disk-guard.timer

echo "cloudflared before: $(systemctl is-active cloudflared-bnpi-hris.service 2>/dev/null || echo unknown)"

sudo systemctl daemon-reload
sudo systemctl enable --now project-truth-disk-guard.timer
sudo systemctl restart project-truth-disk-guard.timer

echo "installed_timer=$(systemctl is-enabled project-truth-disk-guard.timer)"
systemctl list-timers project-truth-disk-guard.timer --no-pager || true
echo "cloudflared after: $(systemctl is-active cloudflared-bnpi-hris.service 2>/dev/null || echo unknown)"
head -n 5 /usr/local/sbin/project-truth-disk-guard.sh
'@

$code = Invoke-Remote -Command $installCmd -TimeoutSec 90
if ($code -ne 0) {
  throw "Remote install failed (exit $code)"
}

if (-not $SkipRun) {
  if ($DryRun) {
    Write-Host 'Running dry-run guard pass...'
    $runCmd = 'sudo env PROJECT_TRUTH_DISK_GUARD_DRY_RUN=1 /usr/local/sbin/project-truth-disk-guard.sh; echo EXIT:$?'
  } else {
    Write-Host 'Running live guard pass (safe prunes only)...'
    $runCmd = 'sudo /usr/local/sbin/project-truth-disk-guard.sh; echo EXIT:$?'
  }
  # Exit 1 (still over threshold) is informational after install.
  $null = Invoke-Remote -Command $runCmd -TimeoutSec 300
} else {
  Write-Host 'SkipRun set; timer enabled without immediate run.'
}

Write-Host "Disk guard installed on $($script:SshInfo.Remote)"
Write-Host 'Verify: powershell -File scripts/install-project-truth-disk-guard-on-vm.ps1 -Status'
exit 0
