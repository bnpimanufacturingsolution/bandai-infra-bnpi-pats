[CmdletBinding()]
param(
  [string]$VmName = 'project-truth-local-vhdx-proof',
  [string]$TaskName = 'ProjectTruth-BNPI-HRIS-Cloudflared',
  [string]$TunnelName = 'bnpi-hris',
  [string]$TunnelId = 'e3486f00-f974-46d3-9e11-911266749d00',
  [string]$ConfigPath = '',
  [string]$CredentialsFile = '',
  [string]$SshHostname = 'ssh.bnpi-hris.tech',
  [string[]]$Hostnames = @('bnpi-hris.tech', 'www.bnpi-hris.tech', 'app.bnpi-hris.tech'),
  [int]$OriginPort = 3000,
  [int]$OriginWarmupSeconds = 180,
  [int]$ConnectorWarmupSeconds = 60,
  [switch]$NoStartVm,
  [switch]$RepairScheduledTask,
  [switch]$ProvisionDns,
  [switch]$NoStartTunnel,
  [switch]$VerifyPublic
)

$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
if (-not $ConfigPath) {
  $ConfigPath = Join-Path $repoRoot 'cloudflared-bnpi-hris.yml'
}
if (-not $CredentialsFile) {
  $CredentialsFile = Join-Path $env:USERPROFILE ".cloudflared\$TunnelId.json"
}

$runtimeRoot = Join-Path $repoRoot '.runtime\cloudflare-named-tunnel'
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$runRoot = Join-Path $runtimeRoot $stamp

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

  throw 'cloudflared not found in PATH or the usual Program Files locations.'
}

function Assert-TunnelCredentials {
  if (-not (Test-Path -LiteralPath $CredentialsFile)) {
    throw @"
Named tunnel credentials were not found:
  $CredentialsFile

This host must be provisioned before it can run the bnpi-hris tunnel.
Run:
  .\scripts\project-truth.ps1 ensure-bnpi-cloudflare-host -Login

Or securely import the tunnel credential JSON for tunnel $TunnelId into the operator .cloudflared profile.
"@
  }
}

function Get-CurrentGuestIp {
  $adapter = Get-VMNetworkAdapter -VMName $VmName -ErrorAction Stop | Select-Object -First 1
  $ip = $adapter.IPAddresses |
    Where-Object { $_ -match '^\d+\.\d+\.\d+\.\d+$' -and $_ -notmatch '^169\.254\.' } |
    Select-Object -First 1

  if (-not $ip) {
    return ''
  }
  return $ip
}

function Wait-GuestIp {
  $deadline = (Get-Date).AddSeconds(90)
  do {
    $ip = Get-CurrentGuestIp
    if ($ip) { return $ip }
    Start-Sleep -Seconds 3
  } while ((Get-Date) -lt $deadline)

  throw "Could not discover a LAN IPv4 address for Hyper-V VM '$VmName'."
}

function Wait-Origin {
  param([string]$GuestIp)

  $url = "http://${GuestIp}:${OriginPort}/auth/login"
  $deadline = (Get-Date).AddSeconds($OriginWarmupSeconds)
  $lastError = ''
  do {
    try {
      $response = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 8
      $title = ''
      $match = [regex]::Match($response.Content, '<title>(.*?)</title>')
      if ($match.Success) { $title = $match.Groups[1].Value }
      return [pscustomobject]@{
        Url = $url
        StatusCode = $response.StatusCode
        Title = $title
      }
    } catch {
      $lastError = $_.Exception.Message
      Start-Sleep -Seconds 5
    }
  } while ((Get-Date) -lt $deadline)

  throw "Origin did not become healthy at $url within ${OriginWarmupSeconds}s. Last error: $lastError"
}

function Write-TunnelConfig {
  param([string]$GuestIp)

  $origin = "http://${GuestIp}:${OriginPort}"
  $targets = @()
  foreach ($hostname in $Hostnames) {
    $targets += [pscustomobject]@{ Hostname = $hostname; Service = $origin }
  }
  $targets += [pscustomobject]@{ Hostname = 'api.bnpi-hris.tech'; Service = "http://${GuestIp}:3001" }
  $targets += [pscustomobject]@{ Hostname = 'dev.bnpi-hris.tech'; Service = "http://${GuestIp}:3100" }
  $targets += [pscustomobject]@{ Hostname = 'dev-api.bnpi-hris.tech'; Service = "http://${GuestIp}:3101" }
  $targets += [pscustomobject]@{ Hostname = 'uat.bnpi-hris.tech'; Service = "http://${GuestIp}:3200" }
  $targets += [pscustomobject]@{ Hostname = 'uat-api.bnpi-hris.tech'; Service = "http://${GuestIp}:3201" }
  $targets += [pscustomobject]@{ Hostname = 'grafana.bnpi-hris.tech'; Service = "http://${GuestIp}:53000" }
  $targets += [pscustomobject]@{ Hostname = $SshHostname; Service = "ssh://${GuestIp}:22" }

  $lines = @(
    "tunnel: $TunnelId",
    "credentials-file: $CredentialsFile",
    '',
    'ingress:'
  )

  foreach ($hostname in $Hostnames) {
    $lines += "  - hostname: $hostname"
    $lines += '    path: /api/.*'
    $lines += "    service: http://${GuestIp}:3001"
    $lines += "  - hostname: $hostname"
    $lines += '    path: /socket.io/.*'
    $lines += "    service: http://${GuestIp}:3001"
  }

  $lines += '  - hostname: dev.bnpi-hris.tech'
  $lines += '    path: /api/.*'
  $lines += "    service: http://${GuestIp}:3101"
  $lines += '  - hostname: dev.bnpi-hris.tech'
  $lines += '    path: /socket.io/.*'
  $lines += "    service: http://${GuestIp}:3101"
  $lines += '  - hostname: uat.bnpi-hris.tech'
  $lines += '    path: /api/.*'
  $lines += "    service: http://${GuestIp}:3201"
  $lines += '  - hostname: uat.bnpi-hris.tech'
  $lines += '    path: /socket.io/.*'
  $lines += "    service: http://${GuestIp}:3201"

  foreach ($target in $targets) {
    $lines += "  - hostname: $($target.Hostname)"
    $lines += "    service: $($target.Service)"
  }
  $lines += '  - service: http_status:404'
  $lines += ''

  $lines | Set-Content -LiteralPath $ConfigPath -Encoding ASCII
  return $origin
}

function Stop-ConflictingNamedTunnel {
  $configLeaf = [regex]::Escape((Split-Path -Leaf $ConfigPath))
  $processes = Get-CimInstance Win32_Process -Filter "name = 'cloudflared.exe'" -ErrorAction SilentlyContinue |
    Where-Object {
      $_.CommandLine -match "run\s+$([regex]::Escape($TunnelName))" -or
      $_.CommandLine -match $configLeaf
    }

  foreach ($process in @($processes)) {
    Write-Step "Stopping conflicting named tunnel PID $($process.ProcessId)"
    Stop-Process -Id $process.ProcessId -Force -ErrorAction SilentlyContinue
  }
}

function Start-NamedTunnel {
  param([string]$CloudflaredPath)

  $stdoutPath = Join-Path $runRoot 'cloudflared.stdout.log'
  $stderrPath = Join-Path $runRoot 'cloudflared.stderr.log'
  $process = Start-Process -FilePath $CloudflaredPath `
    -ArgumentList @('tunnel', '--config', $ConfigPath, 'run', $TunnelName) `
    -RedirectStandardOutput $stdoutPath `
    -RedirectStandardError $stderrPath `
    -WindowStyle Hidden `
    -PassThru

  return [pscustomobject]@{
    ProcessId = $process.Id
    Stdout = $stdoutPath
    Stderr = $stderrPath
  }
}

function Test-Connector {
  $deadline = (Get-Date).AddSeconds($ConnectorWarmupSeconds)
  $last = ''
  do {
    $output = (& cmd.exe /c "cloudflared tunnel info $TunnelName 2>&1" | Out-String).Trim()
    $last = $output
    if ($output -match 'CONNECTOR ID' -and $output -notmatch 'does not have any active connection') {
      return [pscustomobject]@{ Status = 'PASS'; Detail = $output }
    }
    Start-Sleep -Seconds 5
  } while ((Get-Date) -lt $deadline)

  [pscustomobject]@{ Status = 'FAIL'; Detail = $last }
}

function Register-HostManagedTask {
  param([string]$CloudflaredPath)

  $powerShell = (Get-Command powershell.exe -ErrorAction Stop).Source
  $scriptPath = Join-Path $repoRoot 'scripts\start-bnpi-cloudflare-tunnel.ps1'
  $arguments = "-NoProfile -ExecutionPolicy Bypass -File `"$scriptPath`""
  $action = New-ScheduledTaskAction -Execute $powerShell -Argument $arguments -WorkingDirectory $repoRoot
  $trigger = New-ScheduledTaskTrigger -AtStartup
  $settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Minutes 10)

  Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Settings $settings -RunLevel Highest -Force | Out-Null
  Write-Step "Repaired scheduled task $TaskName to run the Project Truth wrapper."
}

function Invoke-DnsProvisioning {
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
    $SshHostname
  ) | Select-Object -Unique

  $results = @()
  foreach ($dnsName in $dnsNames) {
    $output = (& cmd.exe /c "cloudflared tunnel route dns --overwrite-dns $TunnelName $dnsName 2>&1" | Out-String).Trim()
    $exit = $LASTEXITCODE
    $results += [pscustomobject]@{
      Hostname = $dnsName
      ExitCode = $exit
      Detail = $output
    }
    if ($exit -ne 0) {
      Write-Warning "DNS route failed for ${dnsName}: $output"
    } else {
      Write-Step "DNS route ready: $dnsName -> $TunnelName"
    }
  }
  return $results
}

function Invoke-PublicChecks {
  $results = @()
  $checks = @(
    @{ Name = 'prod-app'; Url = 'https://bnpi-hris.tech/auth/login' },
    @{ Name = 'www-app'; Url = 'https://www.bnpi-hris.tech/auth/login' },
    @{ Name = 'app-app'; Url = 'https://app.bnpi-hris.tech/auth/login' },
    @{ Name = 'prod-api'; Url = 'https://api.bnpi-hris.tech/health' },
    @{ Name = 'dev-app'; Url = 'https://dev.bnpi-hris.tech/auth/login' },
    @{ Name = 'dev-api'; Url = 'https://dev-api.bnpi-hris.tech/health' },
    @{ Name = 'uat-app'; Url = 'https://uat.bnpi-hris.tech/auth/login' },
    @{ Name = 'uat-api'; Url = 'https://uat-api.bnpi-hris.tech/health' },
    @{ Name = 'grafana'; Url = 'https://grafana.bnpi-hris.tech/api/health' }
  )

  foreach ($check in $checks) {
    $url = $check.Url
    try {
      $response = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 20
      $title = ''
      $match = [regex]::Match($response.Content, '<title>(.*?)</title>')
      if ($match.Success) { $title = $match.Groups[1].Value }
      $results += [pscustomobject]@{ Name = $check.Name; Url = $url; Status = 'PASS'; Code = $response.StatusCode; Detail = $title }
    } catch {
      $response = $_.Exception.Response
      $code = if ($response) { [int]$response.StatusCode } else { 'ERR' }
      $results += [pscustomobject]@{ Name = $check.Name; Url = $url; Status = 'WARN'; Code = $code; Detail = $_.Exception.Message }
    }
  }
  return $results
}

New-Item -ItemType Directory -Force -Path $runRoot | Out-Null

$cloudflaredPath = Get-CloudflaredPath
Assert-TunnelCredentials
if ($RepairScheduledTask) {
  Register-HostManagedTask -CloudflaredPath $cloudflaredPath
}

$vm = Get-VM -Name $VmName -ErrorAction Stop
if ($vm.State -ne 'Running') {
  if ($NoStartVm) {
    throw "VM '$VmName' is $($vm.State), and -NoStartVm was set."
  }
  Write-Step "Starting VM $VmName from $($vm.State)"
  Start-VM -Name $VmName
}

$guestIp = Wait-GuestIp
Write-Step "Discovered VM LAN IP $guestIp"

$originCheck = Wait-Origin -GuestIp $guestIp
Write-Step "Origin check passed: $($originCheck.Url) HTTP $($originCheck.StatusCode) $($originCheck.Title)"

$origin = Write-TunnelConfig -GuestIp $guestIp
Write-Step "Wrote $ConfigPath -> $origin"

$dnsProvisioning = @()
if ($ProvisionDns) {
  $dnsProvisioning = @(Invoke-DnsProvisioning)
}

$tunnelProcess = $null
$connector = [pscustomobject]@{ Status = 'SKIPPED'; Detail = 'NoStartTunnel was set.' }
if (-not $NoStartTunnel) {
  Stop-ConflictingNamedTunnel
  $tunnelProcess = Start-NamedTunnel -CloudflaredPath $cloudflaredPath
  Write-Step "Started named tunnel PID $($tunnelProcess.ProcessId)"
  $connector = Test-Connector
  if ($connector.Status -eq 'PASS') {
    Write-Step 'Named tunnel connector is active.'
  } else {
    Write-Warning 'Named tunnel connector did not report active before timeout.'
  }
}

$publicChecks = @()
if ($VerifyPublic) {
  $publicChecks = @(Invoke-PublicChecks)
}

$evidence = [pscustomobject]@{
  GeneratedAt = (Get-Date).ToString('o')
  VmName = $VmName
  GuestIp = $guestIp
  Origin = $origin
  OriginCheck = $originCheck
  ConfigPath = (Resolve-Path -LiteralPath $ConfigPath).Path
  TaskName = $TaskName
  TaskRepaired = $RepairScheduledTask.IsPresent
  TunnelName = $TunnelName
  TunnelId = $TunnelId
  SshHostname = $SshHostname
  SshOrigin = "ssh://${guestIp}:22"
  DnsProvisioning = $dnsProvisioning
  TunnelProcess = $tunnelProcess
  Connector = $connector
  PublicChecks = $publicChecks
}

$jsonPath = Join-Path $runRoot 'bnpi-cloudflare-tunnel.json'
$evidence | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $jsonPath -Encoding UTF8
Set-Content -LiteralPath (Join-Path $runtimeRoot 'LATEST.txt') -Value $runRoot -Encoding ASCII

Write-Host ''
Write-Host "Evidence: $jsonPath"
$evidence | Select-Object GeneratedAt, VmName, GuestIp, Origin, TaskName, TunnelName | Format-List
if ($publicChecks.Count -gt 0) {
  $publicChecks | Format-Table -AutoSize
}

if ($connector.Status -eq 'FAIL') {
  exit 2
}
