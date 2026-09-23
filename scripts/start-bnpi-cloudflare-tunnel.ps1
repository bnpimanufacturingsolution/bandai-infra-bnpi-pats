[CmdletBinding()]
param(
  [string]$VmName = 'project-truth-local-vhdx-proof',
  [string]$TaskName = 'ProjectTruth-BNPI-PATS-Cloudflared',
  [string]$TunnelName = 'bnpi-pats',
  [string]$TunnelId = '12e89b6a-dabb-4897-9925-08ce9213b983',
  [string]$ConfigPath = '',
  [string]$CredentialsFile = '',
  [string]$PreferredGuestIp = $(if ($env:PROJECT_TRUTH_PREFERRED_GUEST_IP) { $env:PROJECT_TRUTH_PREFERRED_GUEST_IP } else { '10.184.37.19' }),
  [string]$SshHostname = 'ssh.bnpipats.tech',
  [string]$ProdDbHostname = 'db.bnpipats.tech',
  [string]$DevDbHostname = 'dev-db.bnpipats.tech',
  [string]$UatDbHostname = 'uat-db.bnpipats.tech',
  [string[]]$Hostnames = @('bnpipats.tech', 'www.bnpipats.tech', 'app.bnpipats.tech'),
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
  $ConfigPath = Join-Path $repoRoot 'cloudflared-bnpi-pats.yml'
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

This host must be provisioned before it can run the bnpi-pats tunnel.
Run:
  .\scripts\project-truth.ps1 ensure-bnpi-cloudflare-host -Login

Or securely import the tunnel credential JSON for tunnel $TunnelId into the operator .cloudflared profile.
"@
  }
}

function Get-CurrentGuestIp {
  if (-not [string]::IsNullOrWhiteSpace($PreferredGuestIp)) {
    $preferredTcp = Test-NetConnection -ComputerName $PreferredGuestIp -Port 22 -InformationLevel Quiet -WarningAction SilentlyContinue
    if ($preferredTcp) {
      return $PreferredGuestIp
    }
  }

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
  $targets += [pscustomobject]@{ Hostname = 'api.bnpipats.tech'; Service = "http://${GuestIp}:3001" }
  $targets += [pscustomobject]@{ Hostname = 'dev.bnpipats.tech'; Service = "http://${GuestIp}:3100" }
  $targets += [pscustomobject]@{ Hostname = 'dev-api.bnpipats.tech'; Service = "http://${GuestIp}:3101" }
  $targets += [pscustomobject]@{ Hostname = 'uat.bnpipats.tech'; Service = "http://${GuestIp}:3200" }
  $targets += [pscustomobject]@{ Hostname = 'uat-api.bnpipats.tech'; Service = "http://${GuestIp}:3201" }
  $targets += [pscustomobject]@{ Hostname = 'grafana.bnpipats.tech'; Service = "http://${GuestIp}:53000" }
  $targets += [pscustomobject]@{ Hostname = $SshHostname; Service = "ssh://${GuestIp}:22" }
  $targets += [pscustomobject]@{ Hostname = $ProdDbHostname; Service = "tcp://${GuestIp}:15432" }
  $targets += [pscustomobject]@{ Hostname = $DevDbHostname; Service = "tcp://${GuestIp}:15433" }
  $targets += [pscustomobject]@{ Hostname = $UatDbHostname; Service = "tcp://${GuestIp}:15434" }

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

  $lines += '  - hostname: dev.bnpipats.tech'
  $lines += '    path: /api/.*'
  $lines += "    service: http://${GuestIp}:3101"
  $lines += '  - hostname: dev.bnpipats.tech'
  $lines += '    path: /socket.io/.*'
  $lines += "    service: http://${GuestIp}:3101"
  $lines += '  - hostname: uat.bnpipats.tech'
  $lines += '    path: /api/.*'
  $lines += "    service: http://${GuestIp}:3201"
  $lines += '  - hostname: uat.bnpipats.tech'
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
    'bnpipats.tech',
    'www.bnpipats.tech',
    'app.bnpipats.tech',
    'api.bnpipats.tech',
    'dev.bnpipats.tech',
    'dev-api.bnpipats.tech',
    'uat.bnpipats.tech',
    'uat-api.bnpipats.tech',
    'grafana.bnpipats.tech',
    $SshHostname,
    $ProdDbHostname,
    $DevDbHostname,
    $UatDbHostname
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
    @{ Name = 'prod-app'; Url = 'https://bnpipats.tech/auth/login' },
    @{ Name = 'www-app'; Url = 'https://www.bnpipats.tech/auth/login' },
    @{ Name = 'app-app'; Url = 'https://app.bnpipats.tech/auth/login' },
    @{ Name = 'prod-api'; Url = 'https://api.bnpipats.tech/health' },
    @{ Name = 'dev-app'; Url = 'https://dev.bnpipats.tech/auth/login' },
    @{ Name = 'dev-api'; Url = 'https://dev-api.bnpipats.tech/health' },
    @{ Name = 'uat-app'; Url = 'https://uat.bnpipats.tech/auth/login' },
    @{ Name = 'uat-api'; Url = 'https://uat-api.bnpipats.tech/health' },
    @{ Name = 'grafana'; Url = 'https://grafana.bnpipats.tech/api/health' }
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
  DbTcp = [pscustomobject]@{
    ProdHostname = $ProdDbHostname
    DevHostname = $DevDbHostname
    UatHostname = $UatDbHostname
    ProdOrigin = "tcp://${guestIp}:15432"
    DevOrigin = "tcp://${guestIp}:15433"
    UatOrigin = "tcp://${guestIp}:15434"
    ClientCommands = @(
      "cloudflared access tcp --hostname $ProdDbHostname --url localhost:5432",
      "cloudflared access tcp --hostname $DevDbHostname --url localhost:5433",
      "cloudflared access tcp --hostname $UatDbHostname --url localhost:5434"
    )
  }
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
