#Requires -Version 5.1
<#
.SYNOPSIS
  Host-side entry for Project Truth disk guard (delegates to the VM when reachable).

.DESCRIPTION
  Historical root-full outages came from observability rolling backups, container
  images, retained VHDX, agent /tmp artifacts, and journals on the Linux VM --
  not from the Windows host runtime.

  This script:
  1. Optionally reports Windows free space (host images under ProgramData).
  2. SSHs to the appliance VM and runs project-truth-disk-guard.
  3. Prints install instructions if the unit is missing on the VM.

.PARAMETER ReportOnly
  Pass --report-only to the VM script (no deletions).

.PARAMETER Install
  Install/enable the VM systemd timer from the checked-out repo path on the VM
  (or scp from this host if /opt/project-truth is stale).

.PARAMETER VmHost
  Default: 10.184.37.19 (canonical LAN). Secondary transition address: 10.184.37.78.
#>
[CmdletBinding()]
param(
  [switch]$ReportOnly,
  [switch]$Install,
  [string]$VmHost = "10.184.37.19",
  [string]$SshUser = "infra",
  [string]$IdentityFile = $(Join-Path $env:USERPROFILE ".ssh\node-health-appliance_ed25519"),
  [int]$WarnFreeGiBHost = 25
)

$ErrorActionPreference = "Stop"

function Write-HostDiskReport {
  Write-Host "=== Windows host free space (informational) ==="
  Get-PSDrive -PSProvider FileSystem | ForEach-Object {
    $freeGiB = [math]::Round(($_.Free / 1GB), 1)
    $usedGiB = [math]::Round((($_.Used) / 1GB), 1)
    Write-Host ("  {0}: free={1} GiB used={2} GiB" -f $_.Name, $freeGiB, $usedGiB)
    if ($_.Name -eq "C" -and $freeGiB -lt $WarnFreeGiBHost) {
      Write-Warning "Host C: free space below ${WarnFreeGiBHost} GiB -- VHDX import/download risk."
    }
  }
  $images = "C:\ProgramData\ProjectTruth\images"
  if (Test-Path $images) {
    $size = (Get-ChildItem $images -Recurse -ErrorAction SilentlyContinue | Measure-Object -Property Length -Sum).Sum
    Write-Host ("  ProjectTruth images dir ~{0:N1} GiB at {1}" -f ($size / 1GB), $images)
  }
}

function Invoke-VmSsh {
  param([string]$RemoteCommand)
  $sshArgs = @(
    "-i", $IdentityFile,
    "-o", "ConnectTimeout=12",
    "-o", "StrictHostKeyChecking=accept-new",
    "${SshUser}@${VmHost}",
    $RemoteCommand
  )
  & ssh @sshArgs
  return $LASTEXITCODE
}

Write-HostDiskReport
Write-Host ""
Write-Host "=== VM disk guard on ${SshUser}@${VmHost} ==="

if (-not (Test-Path $IdentityFile)) {
  Write-Error "SSH identity not found: $IdentityFile"
}

if ($Install) {
  Write-Host "Installing project-truth-disk-guard on VM (requires sudo)..."
  $installRemote = @'
set -euo pipefail
ROOT="${PROJECT_TRUTH_ROOT:-/opt/project-truth}"
if [ ! -f "$ROOT/appliance/bin/project-truth-disk-guard.sh" ]; then
  echo "MISSING $ROOT/appliance/bin/project-truth-disk-guard.sh -- pull develop or copy files first" >&2
  exit 1
fi
sudo install -m 0755 "$ROOT/appliance/bin/project-truth-disk-guard.sh" /usr/local/bin/project-truth-disk-guard
sudo install -m 0644 "$ROOT/appliance/systemd/project-truth-disk-guard.service" /etc/systemd/system/project-truth-disk-guard.service
sudo install -m 0644 "$ROOT/appliance/systemd/project-truth-disk-guard.timer" /etc/systemd/system/project-truth-disk-guard.timer
sudo mkdir -p /etc/project-truth /var/lib/project-truth/disk-guard /var/log/project-truth
if [ ! -f /etc/project-truth/disk-guard.env ]; then
  sudo tee /etc/project-truth/disk-guard.env >/dev/null <<'ENV'
# Project Truth disk guard retention (see appliance/bin/project-truth-disk-guard.sh)
DISK_GUARD_WARN_PCT=85
DISK_GUARD_CRIT_PCT=95
DISK_GUARD_WARN_FREE_GIB=30
DISK_GUARD_CRIT_FREE_GIB=10
DISK_GUARD_JOURNAL_VACUUM=7d
DISK_GUARD_JOURNAL_MAX_SIZE=500M
DISK_GUARD_OBS_ROLLING_DAYS=3
DISK_GUARD_OBS_ROLLING_KEEP=24
DISK_GUARD_OBS_FULL_DAYS=14
DISK_GUARD_OBS_FULL_KEEP=7
DISK_GUARD_RETAINED_VHDX_KEEP=1
DISK_GUARD_TMP_DAYS=2
DISK_GUARD_K8S_IMAGE_TAR_DAYS=3
DISK_GUARD_APPLY=1
DISK_GUARD_PRUNE_IMAGES=1
ENV
fi
sudo systemctl daemon-reload
sudo systemctl enable --now project-truth-disk-guard.timer
systemctl list-timers project-truth-disk-guard.timer --no-pager
echo "INSTALL_OK"
'@
  $code = Invoke-VmSsh -RemoteCommand $installRemote
  if ($code -ne 0) {
    Write-Warning "Install remote exit=$code. If /opt/project-truth is stale, push develop and wait for ansible-pull, or scp the three appliance files."
  }
}

$flag = if ($ReportOnly) { "--report-only" } else { "--apply" }
$run = "if command -v project-truth-disk-guard >/dev/null 2>&1; then sudo project-truth-disk-guard $flag; elif [ -x /opt/project-truth/appliance/bin/project-truth-disk-guard.sh ]; then sudo /opt/project-truth/appliance/bin/project-truth-disk-guard.sh $flag; else echo 'DISK_GUARD_NOT_INSTALLED'; exit 4; fi"
$code = Invoke-VmSsh -RemoteCommand $run
Write-Host "VM disk guard exit code: $code (0=ok 1=warn 2=crit 4=not-installed)"
exit $code
