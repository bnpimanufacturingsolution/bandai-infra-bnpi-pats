[CmdletBinding()]
param(
  [string]$TunnelName = 'bnpi-hris',
  [string]$TunnelId = 'e3486f00-f974-46d3-9e11-911266749d00',
  [string]$ConfigPath = '',
  [string]$CredentialsFile = '',
  [string]$TaskName = 'ProjectTruth-BNPI-HRIS-Cloudflared',
  [string]$SshHostname = 'ssh.bnpi-hris.tech',
  [string]$SshAlias = 'project-truth-hris',
  [string]$SshKeyPath = '',
  [switch]$Login,
  [switch]$ProvisionDns,
  [switch]$StartTunnel,
  [switch]$VerifyPublic,
  [switch]$VerifySsh
)

$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
if (-not $ConfigPath) {
  $ConfigPath = Join-Path $repoRoot 'cloudflared-bnpi-hris.yml'
}
if (-not $CredentialsFile) {
  $CredentialsFile = Join-Path $env:USERPROFILE ".cloudflared\$TunnelId.json"
}
if (-not $SshKeyPath) {
  $SshKeyPath = Join-Path $env:USERPROFILE '.ssh\node-health-appliance_ed25519'
}

$runtimeRoot = Join-Path $repoRoot '.runtime\cloudflare-host-readiness'
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$runRoot = Join-Path $runtimeRoot $stamp
New-Item -ItemType Directory -Force -Path $runRoot | Out-Null

function Write-Step {
  param([string]$Message)
  Write-Host ("{0} {1}" -f (Get-Date -Format 'HH:mm:ss'), $Message)
}

function Get-CloudflaredPath {
  $cmd = Get-Command cloudflared -ErrorAction SilentlyContinue
  if ($cmd) { return $cmd.Source }

  $candidates = @(
    "${env:ProgramFiles}\cloudflared\cloudflared.exe",
    "${env:ProgramFiles(x86)}\cloudflared\cloudflared.exe"
  )
  foreach ($candidate in $candidates) {
    if (Test-Path -LiteralPath $candidate) { return $candidate }
  }

  return ''
}

function Invoke-Cloudflared {
  param([string[]]$Arguments)

  $escaped = $Arguments | ForEach-Object {
    if ($_ -match '[\s"]') {
      '"' + ($_ -replace '"', '\"') + '"'
    } else {
      $_
    }
  }
  $command = "cloudflared $($escaped -join ' ')"
  $output = (& cmd.exe /c "$command 2>&1" | Out-String).Trim()
  [pscustomobject]@{
    Command = "cloudflared $($Arguments -join ' ')"
    ExitCode = $LASTEXITCODE
    Output = $output
  }
}

function Set-ProjectTruthSshConfig {
  param(
    [string]$CloudflaredPath
  )

  $sshDir = Join-Path $env:USERPROFILE '.ssh'
  $configPath = Join-Path $sshDir 'config'
  New-Item -ItemType Directory -Force -Path $sshDir | Out-Null

  $cloudflaredConfigPath = $CloudflaredPath
  $identityConfigPath = $SshKeyPath
  if ($identityConfigPath.StartsWith($env:USERPROFILE, [System.StringComparison]::OrdinalIgnoreCase)) {
    $identityConfigPath = '~' + $identityConfigPath.Substring($env:USERPROFILE.Length)
  }

  $aliasBlock = @"
Host $SshAlias
    HostName $SshHostname
    User infra
    IdentityFile $identityConfigPath
    IdentitiesOnly yes
    ProxyCommand "$cloudflaredConfigPath" access ssh --hostname %h
    StrictHostKeyChecking accept-new
"@

  $hostBlock = @"
Host $SshHostname
    HostName $SshHostname
    User infra
    IdentityFile $identityConfigPath
    IdentitiesOnly yes
    ProxyCommand "$cloudflaredConfigPath" access ssh --hostname %h
    StrictHostKeyChecking accept-new
"@

  $existing = if (Test-Path -LiteralPath $configPath) { Get-Content -Raw -LiteralPath $configPath } else { '' }
  $updated = $existing
  $changed = $false

  if ($updated -notmatch "(?m)^Host\s+$([regex]::Escape($SshAlias))\s*$") {
    $updated = ($updated.TrimEnd() + "`r`n`r`n" + $aliasBlock.Trim() + "`r`n")
    $changed = $true
  }

  if ($updated -notmatch "(?m)^Host\s+$([regex]::Escape($SshHostname))\s*$") {
    $updated = ($updated.TrimEnd() + "`r`n`r`n" + $hostBlock.Trim() + "`r`n")
    $changed = $true
  }

  if ($changed) {
    Set-Content -LiteralPath $configPath -Value $updated -Encoding ASCII
  }

  [pscustomobject]@{
    Path = $configPath
    Alias = $SshAlias
    Hostname = $SshHostname
    KeyPath = $SshKeyPath
    Changed = $changed
  }
}

function Test-ProjectTruthSshAlias {
  $output = (& cmd.exe /c "ssh -o BatchMode=yes -o ConnectTimeout=45 $SshAlias `"echo SSH_ALIAS_OK; hostname; whoami`" 2>&1" | Out-String).Trim()
  [pscustomobject]@{
    Command = "ssh $SshAlias"
    ExitCode = $LASTEXITCODE
    Output = $output
  }
}

$cloudflaredPath = Get-CloudflaredPath
$certPath = Join-Path $env:USERPROFILE '.cloudflared\cert.pem'

if (-not $cloudflaredPath) {
  throw 'cloudflared was not found. Install cloudflared, then rerun this command.'
}

if ($Login -and -not (Test-Path -LiteralPath $certPath)) {
  Write-Step 'Starting Cloudflare browser login for tunnel management certificate.'
  & cloudflared tunnel login
}

$cloudflaredVersion = (& cloudflared --version 2>&1 | Out-String).Trim()
$certExists = Test-Path -LiteralPath $certPath
$credentialExists = Test-Path -LiteralPath $CredentialsFile
$sshKeyExists = Test-Path -LiteralPath $SshKeyPath
$configExists = Test-Path -LiteralPath $ConfigPath
$task = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
$sshConfig = Set-ProjectTruthSshConfig -CloudflaredPath $cloudflaredPath

$tunnelInfo = $null
if ($certExists -or $credentialExists) {
  $tunnelInfo = Invoke-Cloudflared -Arguments @('tunnel', 'info', $TunnelName)
}

$dnsProvisioning = @()
if ($ProvisionDns) {
  if (-not $certExists) {
    throw "Cannot provision DNS because Cloudflare origin cert is missing: $certPath. Rerun with -Login."
  }

  $dnsNames = @(
    'bnpi-hris.tech',
    'www.bnpi-hris.tech',
    'app.bnpi-hris.tech',
    'api.bnpi-hris.tech',
    'dev.bnpi-hris.tech',
    'dev-api.bnpi-hris.tech',
    'uat.bnpi-hris.tech',
    'uat-api.bnpi-hris.tech',
    'grafana.bnpi-hris.tech',
    'ssh.bnpi-hris.tech',
    'db.bnpi-hris.tech',
    'dev-db.bnpi-hris.tech',
    'uat-db.bnpi-hris.tech'
  )

  foreach ($dnsName in $dnsNames) {
    Write-Step "Ensuring DNS route $dnsName -> $TunnelName"
    $dnsProvisioning += Invoke-Cloudflared -Arguments @('tunnel', 'route', 'dns', '--overwrite-dns', $TunnelName, $dnsName)
  }
}

$startEvidence = $null
if ($StartTunnel) {
  $args = @('-File', (Join-Path $repoRoot 'scripts\start-bnpi-cloudflare-tunnel.ps1'), '-RepairScheduledTask')
  if ($ProvisionDns) { $args += '-ProvisionDns' }
  if ($VerifyPublic) { $args += '-VerifyPublic' }
  Write-Step 'Starting host-managed bnpi-hris tunnel wrapper.'
  $quotedArgs = $args | ForEach-Object {
    if ($_ -match '[\s"]') {
      '"' + ($_ -replace '"', '\"') + '"'
    } else {
      $_
    }
  }
  $startCommand = "powershell.exe -NoProfile -ExecutionPolicy Bypass $($quotedArgs -join ' ')"
  $startOutput = (& cmd.exe /c "$startCommand 2>&1" | Out-String).Trim()
  $startEvidence = [pscustomobject]@{
    ExitCode = $LASTEXITCODE
    Output = $startOutput
  }
}

$sshVerification = $null
if ($VerifySsh) {
  Write-Step "Verifying public SSH alias $SshAlias"
  $sshVerification = Test-ProjectTruthSshAlias
}

$result = [pscustomobject]@{
  GeneratedAt = (Get-Date).ToString('o')
  CloudflaredPath = $cloudflaredPath
  CloudflaredVersion = $cloudflaredVersion
  OriginCert = [pscustomobject]@{
    Path = $certPath
    Exists = $certExists
  }
  TunnelCredential = [pscustomobject]@{
    Path = $CredentialsFile
    Exists = $credentialExists
  }
  SshClient = [pscustomobject]@{
    Alias = $SshAlias
    Hostname = $SshHostname
    KeyPath = $SshKeyPath
    KeyExists = $sshKeyExists
    Config = $sshConfig
    Verification = $sshVerification
  }
  Config = [pscustomobject]@{
    Path = $ConfigPath
    Exists = $configExists
  }
  ScheduledTask = [pscustomobject]@{
    Name = $TaskName
    Exists = [bool]$task
    State = if ($task) { $task.State.ToString() } else { 'Missing' }
  }
  TunnelInfo = $tunnelInfo
  DnsProvisioning = $dnsProvisioning
  StartTunnel = $startEvidence
  Missing = @(
    if (-not $certExists) { 'Cloudflare origin cert; run this command with -Login.' }
    if (-not $credentialExists) { 'Named tunnel credential JSON; securely import it or recreate the tunnel credential for this host.' }
    if (-not $sshKeyExists) { "SSH key missing: $SshKeyPath." }
    if (-not $configExists) { 'cloudflared-bnpi-hris.yml; run start-bnpi-cloudflare-tunnel after VM import.' }
    if (-not $task) { 'Scheduled task; run start-bnpi-cloudflare-tunnel -RepairScheduledTask.' }
  )
}

$jsonPath = Join-Path $runRoot 'bnpi-cloudflare-host-readiness.json'
$result | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $jsonPath -Encoding UTF8
Set-Content -LiteralPath (Join-Path $runtimeRoot 'LATEST.txt') -Value $runRoot -Encoding ASCII

Write-Host ''
Write-Host "Evidence: $jsonPath"
$result | Select-Object CloudflaredPath, CloudflaredVersion | Format-List
$result.OriginCert | Format-List
$result.TunnelCredential | Format-List
$result.SshClient | Format-List
$result.ScheduledTask | Format-List

if ($result.Missing.Count -gt 0) {
  Write-Warning "Host readiness is incomplete:"
  $result.Missing | ForEach-Object { Write-Warning "  $_" }
  exit 2
}

Write-Step 'Host readiness passed.'
