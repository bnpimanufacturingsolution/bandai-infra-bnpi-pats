param(
  [string]$GuestIp = '',
  [string]$User = 'infra',
  [string]$ConfigPath = "$env:ProgramData\ProjectTruth\config\project-truth.json",
  [switch]$Status
)

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot

function Get-Config {
  if (-not (Test-Path -LiteralPath $ConfigPath)) {
    return $null
  }

  try {
    return Get-Content -Raw -LiteralPath $ConfigPath | ConvertFrom-Json
  } catch {
    Write-Warning "Could not read Project Truth config at ${ConfigPath}: $($_.Exception.Message)"
    return $null
  }
}

function Resolve-GuestIp {
  param($Config)

  if (-not [string]::IsNullOrWhiteSpace($GuestIp)) {
    return $GuestIp
  }

  if (-not [string]::IsNullOrWhiteSpace($env:PROJECT_TRUTH_GUEST_IP)) {
    return $env:PROJECT_TRUTH_GUEST_IP
  }

  foreach ($hint in @($Config.hyperv.guestIpHint, $Config.virtualbox.guestIpHint)) {
    if (-not [string]::IsNullOrWhiteSpace($hint)) {
      return $hint
    }
  }

  $vmName = $Config.hyperv.vmName
  if (-not [string]::IsNullOrWhiteSpace($vmName) -and (Get-Command Get-VMNetworkAdapter -ErrorAction SilentlyContinue)) {
    $addresses = @(Get-VMNetworkAdapter -VMName $vmName -ErrorAction SilentlyContinue |
      Select-Object -ExpandProperty IPAddresses -ErrorAction SilentlyContinue |
      Where-Object { $_ -match '^\d{1,3}(\.\d{1,3}){3}$' -and $_ -notmatch '^169\.254\.' -and $_ -ne '127.0.0.1' })

    if ($addresses.Count -gt 0) {
      return $addresses[0]
    }
  }

  throw "Could not resolve VM IP. Re-run with -GuestIp <vm-lan-ip>, set PROJECT_TRUTH_GUEST_IP, or save guestIpHint with configure."
}

function Copy-RequiredFile {
  param(
    [string]$Source,
    [string]$RemotePath
  )

  scp -o BatchMode=yes -o StrictHostKeyChecking=accept-new -o ConnectTimeout=10 $Source "${User}@${targetIp}:${RemotePath}"
  if ($LASTEXITCODE -ne 0) {
    throw "Failed to upload $Source to ${targetIp}:${RemotePath}"
  }
}

$config = Get-Config
$targetIp = Resolve-GuestIp -Config $config

if ($Status) {
  $remoteStatus = @'
set -e
if command -v project-truth-os-sync >/dev/null 2>&1; then
  project-truth-os-sync --status
else
  echo "project-truth-os-sync is not installed."
fi
echo
systemctl list-timers project-truth-os-sync.timer --no-pager || true
echo
journalctl -u project-truth-os-sync.service -n 40 --no-pager || true
'@

  ssh -o BatchMode=yes -o StrictHostKeyChecking=accept-new -o ConnectTimeout=10 "$User@$targetIp" $remoteStatus
  exit $LASTEXITCODE
}

ssh -o BatchMode=yes -o StrictHostKeyChecking=accept-new -o ConnectTimeout=10 "$User@$targetIp" 'mkdir -p /tmp/project-truth-os-sync/appliance/bin /tmp/project-truth-os-sync/appliance/systemd'
if ($LASTEXITCODE -ne 0) {
  throw "Could not prepare VM staging directory on ${targetIp}."
}

Copy-RequiredFile -Source (Join-Path $repoRoot 'appliance\bin\project-truth-os-sync.sh') -RemotePath '/tmp/project-truth-os-sync/appliance/bin/project-truth-os-sync.sh'
Copy-RequiredFile -Source (Join-Path $repoRoot 'appliance\systemd\project-truth-os-sync.service') -RemotePath '/tmp/project-truth-os-sync/appliance/systemd/project-truth-os-sync.service'
Copy-RequiredFile -Source (Join-Path $repoRoot 'appliance\systemd\project-truth-os-sync.timer') -RemotePath '/tmp/project-truth-os-sync/appliance/systemd/project-truth-os-sync.timer'

$remote = @'
set -e
sudo install -m 0755 /tmp/project-truth-os-sync/appliance/bin/project-truth-os-sync.sh /usr/local/bin/project-truth-os-sync
sudo install -m 0644 /tmp/project-truth-os-sync/appliance/systemd/project-truth-os-sync.service /etc/systemd/system/project-truth-os-sync.service
sudo install -m 0644 /tmp/project-truth-os-sync/appliance/systemd/project-truth-os-sync.timer /etc/systemd/system/project-truth-os-sync.timer
sudo systemctl daemon-reload
sudo systemctl enable --now project-truth-os-sync.timer
sudo PROJECT_TRUTH_BRANCH=develop project-truth-os-sync
sudo systemctl status project-truth-os-sync.timer --no-pager
'@

ssh -o BatchMode=yes -o StrictHostKeyChecking=accept-new -o ConnectTimeout=10 "$User@$targetIp" $remote
if ($LASTEXITCODE -ne 0) {
  throw "VM pull failed against ${targetIp}."
}
