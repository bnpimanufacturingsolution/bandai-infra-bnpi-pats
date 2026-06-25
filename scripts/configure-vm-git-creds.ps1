param(
  [string]$GuestIp = '',
  [string]$User = 'infra',
  [string]$Password = $env:PROJECT_TRUTH_SSH_PASSWORD,
  [string]$SshHostKey = $env:PROJECT_TRUTH_SSH_HOSTKEY,
  [string]$GitHubToken = $env:PROJECT_TRUTH_GITHUB_TOKEN,
  [string]$RepoUrl = 'https://github.com/hrisworkforcesystem-coder/bandai-infra.git',
  [string]$Branch = 'develop',
  [string]$ConfigPath = "$env:ProgramData\ProjectTruth\config\project-truth.json"
)

$ErrorActionPreference = 'Stop'

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

if ([string]::IsNullOrWhiteSpace($GitHubToken)) {
  throw "GitHub token is required. Pass -GitHubToken or set PROJECT_TRUTH_GITHUB_TOKEN to a read-only token that can clone ${RepoUrl}."
}

$config = Get-Config
$targetIp = Resolve-GuestIp -Config $config

$envFile = @"
PROJECT_TRUTH_REPO_URL='${RepoUrl}'
PROJECT_TRUTH_BRANCH='${Branch}'
PROJECT_TRUTH_GIT_USERNAME='x-access-token'
PROJECT_TRUTH_GIT_PASSWORD='${GitHubToken}'
"@
$envFile64 = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($envFile))

$remote = @"
set -e
sudo install -d -m 0700 /etc/project-truth
echo '$envFile64' | base64 -d | sudo tee /etc/project-truth/os-sync.env >/dev/null
sudo chmod 0600 /etc/project-truth/os-sync.env
sudo systemctl daemon-reload
if systemctl list-unit-files project-truth-ansible-pull.service >/dev/null 2>&1; then
  sudo systemctl enable --now project-truth-ansible-pull.timer
  sudo systemctl restart project-truth-ansible-pull.service
  sudo systemctl disable --now project-truth-os-sync.timer >/dev/null 2>&1 || true
  sudo cat /var/lib/project-truth/ansible-pull-state 2>/dev/null || true
else
  sudo systemctl restart project-truth-os-sync.service
  sudo systemctl enable --now project-truth-os-sync.timer
  sudo cat /var/lib/project-truth/os-sync-state 2>/dev/null || true
fi
"@

if (-not [string]::IsNullOrWhiteSpace($Password)) {
  $plink = Get-Command plink -ErrorAction SilentlyContinue
  if (-not $plink) {
    $plink = Get-Command 'C:\Program Files\PuTTY\plink.exe' -ErrorAction SilentlyContinue
  }
  if (-not $plink) {
    throw "PROJECT_TRUTH_SSH_PASSWORD was provided, but plink.exe was not found."
  }

  $plinkArgs = @('-ssh', '-batch', '-pw', $Password)
  if (-not [string]::IsNullOrWhiteSpace($SshHostKey)) {
    $plinkArgs += @('-hostkey', $SshHostKey)
  }
  $plinkArgs += @("${User}@${targetIp}", $remote)
  & $plink.Source @plinkArgs
} else {
  ssh -o BatchMode=yes -o StrictHostKeyChecking=accept-new -o ConnectTimeout=10 "$User@$targetIp" $remote
}

if ($LASTEXITCODE -ne 0) {
  throw "Failed to configure VM Git credentials on ${targetIp}."
}
