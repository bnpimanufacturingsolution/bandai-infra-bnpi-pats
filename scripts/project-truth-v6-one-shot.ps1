[CmdletBinding()]
param(
  [string]$GuestIp = '',
  [string]$User = 'infra',
  [string]$Branch = 'develop',
  [string]$SshKeyPath = '',
  [string]$CredentialPath = 'C:\ProgramData\ProjectTruth\secrets\cloudflared\e3486f00-f974-46d3-9e11-911266749d00.json',
  [string]$TunnelId = 'e3486f00-f974-46d3-9e11-911266749d00',
  [string]$TunnelName = 'bnpi-hris',
  [string]$ConfigPath = "$env:ProgramData\ProjectTruth\config\project-truth.json",
  [switch]$SkipRuntimeRepair
)

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
if (-not $SshKeyPath) {
  $SshKeyPath = Join-Path $env:USERPROFILE '.ssh\node-health-appliance_ed25519'
}

$runtimeRoot = Join-Path $repoRoot '.runtime\v6-one-shot'
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$runRoot = Join-Path $runtimeRoot $stamp
New-Item -ItemType Directory -Force -Path $runRoot | Out-Null

function Write-Step {
  param([string]$Message)
  Write-Host ("{0} {1}" -f (Get-Date -Format 'HH:mm:ss'), $Message)
}

function Save-Text {
  param(
    [string]$Name,
    [object]$Value
  )
  $path = Join-Path $runRoot $Name
  ($Value | Out-String).Trim() | Set-Content -LiteralPath $path -Encoding UTF8
  return $path
}

function Read-ProjectTruthConfig {
  if (-not (Test-Path -LiteralPath $ConfigPath)) {
    return $null
  }
  try {
    return Get-Content -Raw -LiteralPath $ConfigPath | ConvertFrom-Json
  } catch {
    Write-Warning "Could not parse Project Truth config at ${ConfigPath}: $($_.Exception.Message)"
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

  throw "Could not resolve VM IP. Re-run with -GuestIp <vm-lan-ip>, set PROJECT_TRUTH_GUEST_IP, or save guestIpHint in $ConfigPath."
}

function Assert-Credential {
  if (-not (Test-Path -LiteralPath $CredentialPath)) {
    throw "Cloudflare named tunnel credential is missing: $CredentialPath"
  }
  $json = Get-Content -Raw -LiteralPath $CredentialPath | ConvertFrom-Json
  $missing = @()
  foreach ($field in @('AccountTag', 'TunnelSecret', 'TunnelID')) {
    if ([string]::IsNullOrWhiteSpace([string]$json.$field)) {
      $missing += $field
    }
  }
  if ($missing.Count -gt 0) {
    throw "Cloudflare credential JSON is missing expected fields: $($missing -join ', ')"
  }
  if ($json.TunnelID -ne $TunnelId) {
    throw "Cloudflare credential TunnelID '$($json.TunnelID)' does not match expected '$TunnelId'."
  }
  [pscustomobject]@{
    Path = $CredentialPath
    Exists = $true
    HasAccountTag = $true
    HasTunnelSecret = $true
    TunnelID = $json.TunnelID
  }
}

function Get-SshArgs {
  param([string]$TargetIp)
  @(
    '-i', $SshKeyPath,
    '-o', 'BatchMode=yes',
    '-o', 'StrictHostKeyChecking=accept-new',
    '-o', 'ConnectTimeout=15',
    "${User}@${TargetIp}"
  )
}

function Invoke-Remote {
  param(
    [string]$TargetIp,
    [string]$Command,
    [string]$EvidenceName = ''
  )

  $output = & ssh @(Get-SshArgs -TargetIp $TargetIp) $Command 2>&1
  $exitCode = $LASTEXITCODE
  if ($EvidenceName) {
    Save-Text -Name $EvidenceName -Value $output | Out-Null
  }
  [pscustomobject]@{
    Command = $Command
    ExitCode = $exitCode
    Output = ($output | Out-String).Trim()
  }
}

function Invoke-RemoteBash {
  param(
    [string]$TargetIp,
    [string]$Script,
    [string]$EvidenceName
  )

  $safeName = ($EvidenceName -replace '[^A-Za-z0-9_.-]', '_')
  $localScript = Join-Path $runRoot "$safeName.sh"
  $remoteScript = "/tmp/project-truth-v6-${stamp}-${safeName}.sh"
  $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
  $normalizedScript = ($Script -replace "`r`n", "`n") -replace "`r", "`n"
  [System.IO.File]::WriteAllText($localScript, ($normalizedScript.TrimEnd() + "`n"), $utf8NoBom)

  & scp -i $SshKeyPath -o BatchMode=yes -o StrictHostKeyChecking=accept-new -o ConnectTimeout=15 $localScript "${User}@${TargetIp}:${remoteScript}" | Out-Null
  if ($LASTEXITCODE -ne 0) {
    throw "Failed to upload remote script $localScript to ${TargetIp}:${remoteScript}"
  }

  $remoteCommand = "chmod 700 '$remoteScript' && bash '$remoteScript'; rc=`$?; rm -f '$remoteScript'; exit `$rc"
  $previousErrorActionPreference = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  $output = & ssh @(Get-SshArgs -TargetIp $TargetIp) $remoteCommand 2>&1
  $exitCode = $LASTEXITCODE
  $ErrorActionPreference = $previousErrorActionPreference
  Save-Text -Name $EvidenceName -Value $output | Out-Null
  [pscustomobject]@{
    ExitCode = $exitCode
    Output = ($output | Out-String).Trim()
  }
}

function Copy-ToGuest {
  param(
    [string]$TargetIp,
    [string]$Source,
    [string]$RemotePath
  )

  & scp -i $SshKeyPath -o BatchMode=yes -o StrictHostKeyChecking=accept-new -o ConnectTimeout=15 $Source "${User}@${TargetIp}:${RemotePath}" | Out-Null
  if ($LASTEXITCODE -ne 0) {
    throw "Failed to copy $Source to ${TargetIp}:${RemotePath}"
  }
}

function Install-AnsiblePullPath {
  param([string]$TargetIp)

  Write-Step 'Installing or refreshing VM ansible-pull path.'
  Invoke-Remote -TargetIp $TargetIp -Command 'mkdir -p /tmp/project-truth-v6/appliance/bin /tmp/project-truth-v6/appliance/systemd /tmp/project-truth-v6/ansible' -EvidenceName '01-prepare-staging.txt' | Out-Null

  $uploads = @(
    @{ Source = 'appliance\bin\project-truth-ansible-pull.sh'; Remote = '/tmp/project-truth-v6/appliance/bin/project-truth-ansible-pull.sh' },
    @{ Source = 'appliance\bin\project-truth-os-sync.sh'; Remote = '/tmp/project-truth-v6/appliance/bin/project-truth-os-sync.sh' },
    @{ Source = 'appliance\bin\project-truth-cloudflare-vm-tunnel.sh'; Remote = '/tmp/project-truth-v6/appliance/bin/project-truth-cloudflare-vm-tunnel.sh' },
    @{ Source = 'appliance\systemd\project-truth-ansible-pull.service'; Remote = '/tmp/project-truth-v6/appliance/systemd/project-truth-ansible-pull.service' },
    @{ Source = 'appliance\systemd\project-truth-ansible-pull.timer'; Remote = '/tmp/project-truth-v6/appliance/systemd/project-truth-ansible-pull.timer' },
    @{ Source = 'appliance\systemd\project-truth-os-sync.service'; Remote = '/tmp/project-truth-v6/appliance/systemd/project-truth-os-sync.service' },
    @{ Source = 'appliance\systemd\project-truth-os-sync.timer'; Remote = '/tmp/project-truth-v6/appliance/systemd/project-truth-os-sync.timer' },
    @{ Source = 'ansible\project-truth-pull.yml'; Remote = '/tmp/project-truth-v6/ansible/project-truth-pull.yml' }
  )

  foreach ($upload in $uploads) {
    Copy-ToGuest -TargetIp $TargetIp -Source (Join-Path $repoRoot $upload.Source) -RemotePath $upload.Remote
  }

  $installScript = @'
set -euo pipefail
sudo install -m 0755 /tmp/project-truth-v6/appliance/bin/project-truth-ansible-pull.sh /usr/local/bin/project-truth-ansible-pull
sudo install -m 0755 /tmp/project-truth-v6/appliance/bin/project-truth-os-sync.sh /usr/local/bin/project-truth-os-sync
sudo install -m 0755 /tmp/project-truth-v6/appliance/bin/project-truth-cloudflare-vm-tunnel.sh /usr/local/bin/project-truth-cloudflare-vm-tunnel
sudo install -m 0644 /tmp/project-truth-v6/appliance/systemd/project-truth-ansible-pull.service /etc/systemd/system/project-truth-ansible-pull.service
sudo install -m 0644 /tmp/project-truth-v6/appliance/systemd/project-truth-ansible-pull.timer /etc/systemd/system/project-truth-ansible-pull.timer
sudo install -m 0644 /tmp/project-truth-v6/appliance/systemd/project-truth-os-sync.service /etc/systemd/system/project-truth-os-sync.service
sudo install -m 0644 /tmp/project-truth-v6/appliance/systemd/project-truth-os-sync.timer /etc/systemd/system/project-truth-os-sync.timer
sudo systemctl daemon-reload
sudo systemctl enable --now project-truth-ansible-pull.timer
sudo systemctl disable --now project-truth-os-sync.timer >/dev/null 2>&1 || true
'@
  $result = Invoke-RemoteBash -TargetIp $TargetIp -Script $installScript -EvidenceName '02-install-ansible-pull.txt'
  if ($result.ExitCode -ne 0) {
    throw "Failed to install VM ansible-pull path. See $runRoot\02-install-ansible-pull.txt"
  }
}

function Invoke-HttpCheck {
  param(
    [string]$Name,
    [string]$Url,
    [string]$Method = 'GET',
    [hashtable]$Headers = @{}
  )
  try {
    $response = Invoke-WebRequest -Uri $Url -Method $Method -Headers $Headers -UseBasicParsing -TimeoutSec 20
    [pscustomobject]@{
      Name = $Name
      Url = $Url
      Method = $Method
      Status = 'PASS'
      Code = $response.StatusCode
      AllowOrigin = $response.Headers['Access-Control-Allow-Origin']
      AllowCredentials = $response.Headers['Access-Control-Allow-Credentials']
    }
  } catch {
    $code = if ($_.Exception.Response) { [int]$_.Exception.Response.StatusCode } else { 'ERR' }
    [pscustomobject]@{
      Name = $Name
      Url = $Url
      Method = $Method
      Status = 'FAIL'
      Code = $code
      Detail = $_.Exception.Message
    }
  }
}

function Test-EnvironmentHealth {
  param([string]$TargetIp)
  $checks = @(
    @{ Name = 'lan-prod-app'; Url = "http://${TargetIp}:3000/health" },
    @{ Name = 'lan-prod-api'; Url = "http://${TargetIp}:3001/health" },
    @{ Name = 'lan-dev-app'; Url = "http://${TargetIp}:3100/health" },
    @{ Name = 'lan-dev-api'; Url = "http://${TargetIp}:3101/health" },
    @{ Name = 'lan-uat-app'; Url = "http://${TargetIp}:3200/health" },
    @{ Name = 'lan-uat-api'; Url = "http://${TargetIp}:3201/health" }
  )
  foreach ($check in $checks) {
    Invoke-HttpCheck -Name $check.Name -Url $check.Url
  }
}

function Test-LanCors {
  param([string]$TargetIp)
  $targets = @(
    @{ Name = 'lan-prod-cors'; Origin = "http://${TargetIp}:3000"; Api = "http://${TargetIp}:3001/api/system-provisioning/status" },
    @{ Name = 'lan-dev-cors'; Origin = "http://${TargetIp}:3100"; Api = "http://${TargetIp}:3101/api/system-provisioning/status" },
    @{ Name = 'lan-uat-cors'; Origin = "http://${TargetIp}:3200"; Api = "http://${TargetIp}:3201/api/system-provisioning/status" }
  )
  foreach ($target in $targets) {
    Invoke-HttpCheck -Name $target.Name -Url $target.Api -Method OPTIONS -Headers @{
      Origin = $target.Origin
      'Access-Control-Request-Method' = 'GET'
      'Access-Control-Request-Headers' = 'content-type,authorization'
    }
  }
}

function Test-PublicCors {
  $targets = @(
    @{ Name = 'public-prod-cors'; Origin = 'https://bnpi-hris.tech'; Api = 'https://bnpi-hris.tech/api/system-provisioning/status' },
    @{ Name = 'public-dev-cors'; Origin = 'https://dev.bnpi-hris.tech'; Api = 'https://dev-api.bnpi-hris.tech/api/system-provisioning/status' },
    @{ Name = 'public-uat-cors'; Origin = 'https://uat.bnpi-hris.tech'; Api = 'https://uat-api.bnpi-hris.tech/api/system-provisioning/status' }
  )
  foreach ($target in $targets) {
    Invoke-HttpCheck -Name $target.Name -Url $target.Api -Method OPTIONS -Headers @{
      Origin = $target.Origin
      'Access-Control-Request-Method' = 'GET'
      'Access-Control-Request-Headers' = 'content-type,authorization'
    }
  }
}

function Test-PublicHealth {
  $checks = @(
    @{ Name = 'public-prod-app'; Url = 'https://bnpi-hris.tech/auth/login' },
    @{ Name = 'public-prod-api'; Url = 'https://api.bnpi-hris.tech/health' },
    @{ Name = 'public-dev-app'; Url = 'https://dev.bnpi-hris.tech/auth/login' },
    @{ Name = 'public-dev-api'; Url = 'https://dev-api.bnpi-hris.tech/health' },
    @{ Name = 'public-uat-app'; Url = 'https://uat.bnpi-hris.tech/auth/login' },
    @{ Name = 'public-uat-api'; Url = 'https://uat-api.bnpi-hris.tech/health' },
    @{ Name = 'public-grafana'; Url = 'https://grafana.bnpi-hris.tech/api/health' }
  )
  foreach ($check in $checks) {
    Invoke-HttpCheck -Name $check.Name -Url $check.Url
  }
}

$config = Read-ProjectTruthConfig
$targetIp = Resolve-GuestIp -Config $config
$credentialState = Assert-Credential
if (-not (Test-Path -LiteralPath $SshKeyPath)) {
  throw "SSH key missing: $SshKeyPath"
}

Write-Step "Target VM IP: $targetIp"
Write-Step 'Credential preflight passed without printing secret content.'

$sshProof = Invoke-Remote -TargetIp $targetIp -Command 'echo SSH_OK; hostname; whoami; ip -br addr' -EvidenceName '00-ssh-proof.txt'
if ($sshProof.ExitCode -ne 0) {
  throw "SSH verification failed against ${targetIp}. See $runRoot\00-ssh-proof.txt"
}

Install-AnsiblePullPath -TargetIp $targetIp

Write-Step "Running ansible-pull on branch $Branch."
$pullScript = @"
set -euo pipefail
sudo PROJECT_TRUTH_BRANCH='$Branch' project-truth-ansible-pull
project-truth-ansible-pull --status || true
test -f /opt/project-truth/scripts/project-truth.ps1
test -f /opt/project-truth/appliance/docker-compose.yml
if [ -f /var/lib/project-truth/ansible-pull-state ]; then
  echo
  cat /var/lib/project-truth/ansible-pull-state
fi
"@
$pullResult = Invoke-RemoteBash -TargetIp $targetIp -Script $pullScript -EvidenceName '03-ansible-pull.txt'
if ($pullResult.ExitCode -ne 0) {
  throw "ansible-pull failed. See $runRoot\03-ansible-pull.txt"
}

Write-Step 'Importing Cloudflare credential into VM runtime state.'
$remoteCredentialTemp = "/tmp/${TunnelId}.json"
Copy-ToGuest -TargetIp $targetIp -Source $CredentialPath -RemotePath $remoteCredentialTemp
$cloudflareScript = @"
set -euo pipefail
sudo install -d -m 0755 /etc/cloudflared
sudo PROJECT_TRUTH_CLOUDFLARE_TUNNEL_NAME='$TunnelName' PROJECT_TRUTH_CLOUDFLARE_TUNNEL_ID='$TunnelId' project-truth-cloudflare-vm-tunnel '$remoteCredentialTemp'
sudo rm -f '$remoteCredentialTemp'
sudo cloudflared tunnel --config /etc/cloudflared/config.yml ingress validate
sudo systemctl enable --now cloudflared-bnpi-hris.service
sudo systemctl restart cloudflared-bnpi-hris.service
sudo systemctl is-enabled cloudflared-bnpi-hris.service
sudo systemctl is-active cloudflared-bnpi-hris.service
sudo sed -n '1,80p' /etc/cloudflared/config.yml
"@
$cloudflareResult = Invoke-RemoteBash -TargetIp $targetIp -Script $cloudflareScript -EvidenceName '04-cloudflare-vm-tunnel.txt'
if ($cloudflareResult.ExitCode -ne 0) {
  throw "VM Cloudflare credential import/service setup failed. See $runRoot\04-cloudflare-vm-tunnel.txt"
}

if (-not $SkipRuntimeRepair) {
  Write-Step 'Checking LAN health before runtime repair.'
  $initialHealth = @(Test-EnvironmentHealth -TargetIp $targetIp)
  $initialHealth | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath (Join-Path $runRoot '05-initial-lan-health.json') -Encoding UTF8
  if (($initialHealth | Where-Object Status -ne 'PASS').Count -gt 0) {
    Write-Step 'LAN health failed; attempting runtime repair/recreate.'
    $repairScript = @'
set -euo pipefail
if ! sudo docker image inspect hris-api-local:develop >/dev/null 2>&1; then
  cd /opt/project-truth/hris-api
  sudo docker build -t hris-api-local:develop .
fi
if ! sudo docker image inspect hris-app-local:develop >/dev/null 2>&1; then
  cd /opt/project-truth/hris-app
  sudo docker build --build-arg VITE_ASSET_NAMESPACE=v6-one-shot -t hris-app-local:develop .
fi
cd /opt/project-truth/appliance
if sudo docker compose version >/dev/null 2>&1; then
  compose_cmd="sudo docker compose"
else
  compose_cmd="sudo docker-compose"
fi
$compose_cmd -f docker-compose.yml up -d --no-build --force-recreate hris-api hris-app || true
$compose_cmd -f docker-compose.environments.yml up -d --no-build --force-recreate hris-api-dev hris-api-uat hris-app-dev hris-app-uat || true
if command -v kubectl >/dev/null 2>&1; then
  for env_name in prod dev uat; do
    sudo kubectl -n "$env_name" rollout restart deployment/hris-api deployment/hris-app >/dev/null 2>&1 || true
  done
fi
'@
    $repairResult = Invoke-RemoteBash -TargetIp $targetIp -Script $repairScript -EvidenceName '06-runtime-repair.txt'
    if ($repairResult.ExitCode -ne 0) {
      Write-Warning "Runtime repair reported failure. Continuing to validation; see $runRoot\06-runtime-repair.txt"
    }
  }
}

Write-Step 'Collecting VM runtime state.'
$stateScript = @'
set +e
echo "== ansible-pull status =="
project-truth-ansible-pull --status
echo
echo "== docker ps =="
sudo docker ps --format 'table {{.Names}}\t{{.Image}}\t{{.Status}}\t{{.Ports}}'
echo
echo "== cloudflared service =="
sudo systemctl --no-pager --full status cloudflared-bnpi-hris.service
echo
echo "== kubectl nodes =="
sudo kubectl get nodes
echo
echo "== argocd applications =="
sudo kubectl get applications -n argocd -o wide
echo
echo "== pods =="
sudo kubectl get pods -A
'@
Invoke-RemoteBash -TargetIp $targetIp -Script $stateScript -EvidenceName '07-vm-runtime-state.txt' | Out-Null

Write-Step 'Running LAN and public network validation.'
$lanHealth = @(Test-EnvironmentHealth -TargetIp $targetIp)
$lanCors = @(Test-LanCors -TargetIp $targetIp)
$publicHealth = @(Test-PublicHealth)
$publicCors = @(Test-PublicCors)

$networkEvidence = [pscustomobject]@{
  LanHealth = $lanHealth
  LanCors = $lanCors
  PublicHealth = $publicHealth
  PublicCors = $publicCors
}
$networkEvidence | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath (Join-Path $runRoot '08-network-validation.json') -Encoding UTF8

$failedNetwork = @($lanHealth + $lanCors + $publicHealth + $publicCors | Where-Object Status -ne 'PASS')
$result = [pscustomobject]@{
  GeneratedAt = (Get-Date).ToString('o')
  Command = 'v6-one-shot'
  GuestIp = $targetIp
  User = $User
  Branch = $Branch
  SshKeyPath = $SshKeyPath
  Credential = $credentialState
  TunnelName = $TunnelName
  TunnelId = $TunnelId
  RunRoot = $runRoot
  SshProof = [pscustomobject]@{ ExitCode = $sshProof.ExitCode; Evidence = (Join-Path $runRoot '00-ssh-proof.txt') }
  AnsiblePull = [pscustomobject]@{ ExitCode = $pullResult.ExitCode; Evidence = (Join-Path $runRoot '03-ansible-pull.txt') }
  CloudflareVmTunnel = [pscustomobject]@{ ExitCode = $cloudflareResult.ExitCode; Evidence = (Join-Path $runRoot '04-cloudflare-vm-tunnel.txt') }
  NetworkValidation = [pscustomobject]@{ FailedCount = $failedNetwork.Count; Evidence = (Join-Path $runRoot '08-network-validation.json') }
}
$resultPath = Join-Path $runRoot 'v6-one-shot-result.json'
$result | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $resultPath -Encoding UTF8
Set-Content -LiteralPath (Join-Path $runtimeRoot 'LATEST.txt') -Value $runRoot -Encoding ASCII

Write-Host ''
Write-Host "Evidence: $resultPath"
$lanHealth + $lanCors + $publicHealth + $publicCors | Format-Table -AutoSize

if ($failedNetwork.Count -gt 0) {
  Write-Warning "V6 one-shot completed setup but network validation has $($failedNetwork.Count) failure(s)."
  exit 2
}

Write-Step 'V6 one-shot completed network validation.'
