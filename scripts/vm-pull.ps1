param(
  [string]$GuestIp = '',
  [string]$User = 'infra',
  [string]$Password = $env:PROJECT_TRUTH_SSH_PASSWORD,
  [string]$SshHostKey = $env:PROJECT_TRUTH_SSH_HOSTKEY,
  [string]$ConfigPath = "$env:ProgramData\BandaiApp\Bnpipats\config\project-truth.json",
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

function Get-PuttyCommand {
  param([string]$Name)

  $command = Get-Command $Name -ErrorAction SilentlyContinue
  if ($command) {
    return $command.Source
  }

  $defaultPath = "C:\Program Files\PuTTY\$Name.exe"
  $command = Get-Command $defaultPath -ErrorAction SilentlyContinue
  if ($command) {
    return $command.Source
  }

  throw "$Name.exe is required when -Password or PROJECT_TRUTH_SSH_PASSWORD is used."
}

function Invoke-Remote {
  param([string]$Command)

  if (-not [string]::IsNullOrWhiteSpace($Password)) {
    $plink = Get-PuttyCommand -Name 'plink'
    $plinkArgs = @('-ssh', '-batch', '-pw', $Password)
    if (-not [string]::IsNullOrWhiteSpace($SshHostKey)) {
      $plinkArgs += @('-hostkey', $SshHostKey)
    }
    $plinkArgs += @("${User}@${targetIp}", $Command)
    & $plink @plinkArgs
    return
  }

  ssh -o BatchMode=yes -o StrictHostKeyChecking=accept-new -o ConnectTimeout=10 "$User@$targetIp" $Command
}

function Copy-RequiredFile {
  param(
    [string]$Source,
    [string]$RemotePath
  )

  if (-not [string]::IsNullOrWhiteSpace($Password)) {
    $pscp = Get-PuttyCommand -Name 'pscp'
    $pscpArgs = @('-batch', '-pw', $Password)
    if (-not [string]::IsNullOrWhiteSpace($SshHostKey)) {
      $pscpArgs += @('-hostkey', $SshHostKey)
    }
    $pscpArgs += @($Source, "${User}@${targetIp}:${RemotePath}")
    & $pscp @pscpArgs
  } else {
    scp -o BatchMode=yes -o StrictHostKeyChecking=accept-new -o ConnectTimeout=10 $Source "${User}@${targetIp}:${RemotePath}"
  }

  if ($LASTEXITCODE -ne 0) {
    throw "Failed to upload $Source to ${targetIp}:${RemotePath}"
  }
}

$config = Get-Config
$targetIp = Resolve-GuestIp -Config $config

if ($Status) {
  $remoteStatus = @'
set -e
if command -v project-truth-ansible-pull >/dev/null 2>&1; then
  project-truth-ansible-pull --status
else
  echo "project-truth-ansible-pull is not installed."
fi
echo
if command -v project-truth-os-sync >/dev/null 2>&1; then
  project-truth-os-sync --status
else
  echo "project-truth-os-sync is not installed."
fi
echo
systemctl list-timers project-truth-ansible-pull.timer --no-pager || true
echo
systemctl list-timers project-truth-os-sync.timer --no-pager || true
echo
journalctl -u project-truth-ansible-pull.service -n 40 --no-pager || true
echo
journalctl -u project-truth-os-sync.service -n 40 --no-pager || true
'@

  Invoke-Remote $remoteStatus
  exit $LASTEXITCODE
}

Invoke-Remote 'mkdir -p /tmp/project-truth-os-sync/appliance/bin /tmp/project-truth-os-sync/appliance/systemd /tmp/project-truth-os-sync/ansible'
if ($LASTEXITCODE -ne 0) {
  throw "Could not prepare VM staging directory on ${targetIp}."
}

Copy-RequiredFile -Source (Join-Path $repoRoot 'appliance\bin\project-truth-ansible-pull.sh') -RemotePath '/tmp/project-truth-os-sync/appliance/bin/project-truth-ansible-pull.sh'
Copy-RequiredFile -Source (Join-Path $repoRoot 'appliance\bin\project-truth-os-sync.sh') -RemotePath '/tmp/project-truth-os-sync/appliance/bin/project-truth-os-sync.sh'
Copy-RequiredFile -Source (Join-Path $repoRoot 'appliance\systemd\project-truth-ansible-pull.service') -RemotePath '/tmp/project-truth-os-sync/appliance/systemd/project-truth-ansible-pull.service'
Copy-RequiredFile -Source (Join-Path $repoRoot 'appliance\systemd\project-truth-ansible-pull.timer') -RemotePath '/tmp/project-truth-os-sync/appliance/systemd/project-truth-ansible-pull.timer'
Copy-RequiredFile -Source (Join-Path $repoRoot 'appliance\systemd\project-truth-os-sync.service') -RemotePath '/tmp/project-truth-os-sync/appliance/systemd/project-truth-os-sync.service'
Copy-RequiredFile -Source (Join-Path $repoRoot 'appliance\systemd\project-truth-os-sync.timer') -RemotePath '/tmp/project-truth-os-sync/appliance/systemd/project-truth-os-sync.timer'
Copy-RequiredFile -Source (Join-Path $repoRoot 'ansible\project-truth-pull.yml') -RemotePath '/tmp/project-truth-os-sync/ansible/project-truth-pull.yml'

$remote = @'
set -e
sudo install -m 0755 /tmp/project-truth-os-sync/appliance/bin/project-truth-ansible-pull.sh /usr/local/bin/project-truth-ansible-pull
sudo install -m 0755 /tmp/project-truth-os-sync/appliance/bin/project-truth-os-sync.sh /usr/local/bin/project-truth-os-sync
sudo install -m 0644 /tmp/project-truth-os-sync/appliance/systemd/project-truth-ansible-pull.service /etc/systemd/system/project-truth-ansible-pull.service
sudo install -m 0644 /tmp/project-truth-os-sync/appliance/systemd/project-truth-ansible-pull.timer /etc/systemd/system/project-truth-ansible-pull.timer
sudo install -m 0644 /tmp/project-truth-os-sync/appliance/systemd/project-truth-os-sync.service /etc/systemd/system/project-truth-os-sync.service
sudo install -m 0644 /tmp/project-truth-os-sync/appliance/systemd/project-truth-os-sync.timer /etc/systemd/system/project-truth-os-sync.timer
sudo systemctl daemon-reload
sudo systemctl enable --now project-truth-ansible-pull.timer
sudo systemctl disable --now project-truth-os-sync.timer >/dev/null 2>&1 || true
sudo PROJECT_TRUTH_BRANCH=develop project-truth-ansible-pull
sudo systemctl status project-truth-ansible-pull.timer --no-pager
'@

Invoke-Remote $remote
if ($LASTEXITCODE -ne 0) {
  throw "VM pull failed against ${targetIp}."
}
