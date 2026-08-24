param(
  [string]$LanIp = '10.184.37.19',
  [string]$SshAlias = 'project-truth-hris',
  [switch]$StopExisting,
  [switch]$IncludeProdApi,
  [switch]$Force
)

$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $PSScriptRoot
$runtimeRoot = Join-Path $repoRoot '.runtime\project-truth-remote-lan-forward'
$pidFile = Join-Path $runtimeRoot 'remote-lan-forward-active.json'
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$runRoot = Join-Path $runtimeRoot "remote-lan-forward-$stamp"
$sshExe = (Get-Command ssh.exe -ErrorAction Stop).Source
$loopbackAlias = 'Loopback Pseudo-Interface 1'

$forwards = @(
  @{ Name = 'prod-app'; LocalPort = 3000; RemoteHost = 'localhost'; RemotePort = 3000; ProbePath = '/auth/login' },
  @{ Name = 'dev-app'; LocalPort = 3100; RemoteHost = 'localhost'; RemotePort = 3100; ProbePath = '/auth/login' },
  @{ Name = 'dev-api'; LocalPort = 3101; RemoteHost = 'localhost'; RemotePort = 3101; ProbePath = '/health' },
  @{ Name = 'uat-app'; LocalPort = 3200; RemoteHost = 'localhost'; RemotePort = 3200; ProbePath = '/auth/login' },
  @{ Name = 'uat-api'; LocalPort = 3201; RemoteHost = 'localhost'; RemotePort = 3201; ProbePath = '/health' },
  @{ Name = 'grafana'; LocalPort = 53000; RemoteHost = 'localhost'; RemotePort = 53000; ProbePath = '/api/health' },
  @{ Name = 'prometheus'; LocalPort = 9091; RemoteHost = 'localhost'; RemotePort = 9091; ProbePath = '/-/healthy' },
  @{ Name = 'loki'; LocalPort = 3110; RemoteHost = 'localhost'; RemotePort = 3110; ProbePath = '/ready' },
  @{ Name = 'gateway'; LocalPort = 38080; RemoteHost = 'localhost'; RemotePort = 38080; ProbePath = '/' },
  @{ Name = 'prod-db'; LocalPort = 15432; RemoteHost = 'localhost'; RemotePort = 15432 },
  @{ Name = 'dev-db'; LocalPort = 15433; RemoteHost = 'localhost'; RemotePort = 15433 },
  @{ Name = 'uat-db'; LocalPort = 15434; RemoteHost = 'localhost'; RemotePort = 15434 },
  @{ Name = 'dev-k8s-db'; LocalPort = 55435; RemoteHost = '10.43.130.9'; RemotePort = 5432 }
)

if ($IncludeProdApi) {
  $forwards = @(@{ Name = 'prod-api'; LocalPort = 3001; RemoteHost = 'localhost'; RemotePort = 3001; ProbePath = '/health' }) + $forwards
}

function Test-IsAdmin {
  $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
  $principal = [Security.Principal.WindowsPrincipal]$identity
  return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

function Stop-ExistingForward {
  if (-not (Test-Path -LiteralPath $pidFile)) { return }
  $record = Get-Content -Raw -LiteralPath $pidFile | ConvertFrom-Json
  try {
    Stop-Process -Id $record.ProcessId -Force -ErrorAction Stop
    Write-Host "Stopped Project Truth remote LAN forward PID $($record.ProcessId)"
  } catch {
    Write-Host "Project Truth remote LAN forward PID $($record.ProcessId) is not running"
  }
  Remove-Item -LiteralPath $pidFile -Force -ErrorAction SilentlyContinue
}

function Get-ActiveForwardRecord {
  if (-not (Test-Path -LiteralPath $pidFile)) { return $null }
  try {
    $record = Get-Content -Raw -LiteralPath $pidFile | ConvertFrom-Json
    $process = Get-Process -Id $record.ProcessId -ErrorAction SilentlyContinue
    if (-not $process) { return $null }
    return $record
  } catch {
    return $null
  }
}

function Test-TcpConnect {
  param([string]$HostName, [int]$Port, [int]$TimeoutMs = 1000)
  try {
    $client = [System.Net.Sockets.TcpClient]::new()
    $async = $client.BeginConnect($HostName, $Port, $null, $null)
    if (-not $async.AsyncWaitHandle.WaitOne($TimeoutMs, $false)) {
      $client.Close()
      return $false
    }
    $client.EndConnect($async)
    $client.Close()
    return $true
  } catch {
    return $false
  }
}

function Test-SshTarget {
  param([string]$Target, [int]$TimeoutSeconds = 12)
  $previousErrorActionPreference = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  try {
    & $sshExe -o BatchMode=yes -o "ConnectTimeout=$TimeoutSeconds" $Target 'true' *> $null
    return $LASTEXITCODE -eq 0
  } catch {
    return $false
  } finally {
    $ErrorActionPreference = $previousErrorActionPreference
  }
}

function Get-PortListeners {
  param([int]$Port)
  @(Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue)
}

function Test-PortBindable {
  param([string]$Address, [int]$Port)
  $listeners = Get-PortListeners -Port $Port
  foreach ($listener in $listeners) {
    if ($listener.LocalAddress -eq '0.0.0.0' -or $listener.LocalAddress -eq '::') {
      return $false
    }
    if ($listener.LocalAddress -eq $Address) {
      return $false
    }
  }
  return $true
}

function Ensure-LoopbackAddress {
  param([string]$Address)
  $existing = Get-NetIPAddress -IPAddress $Address -ErrorAction SilentlyContinue
  if ($existing) { return $existing.InterfaceAlias }

  if (-not (Test-IsAdmin)) {
    throw "Admin rights are required to add $Address to $loopbackAlias for LAN-style URL forwarding."
  }

  netsh interface ip add address name="$loopbackAlias" addr=$Address mask=255.255.255.255 | Out-Null
  Start-Sleep -Milliseconds 500
  $created = Get-NetIPAddress -IPAddress $Address -ErrorAction SilentlyContinue
  if (-not $created) {
    throw "Could not add $Address to $loopbackAlias."
  }
  return $created.InterfaceAlias
}

if ($StopExisting) {
  Stop-ExistingForward
  if ($PSBoundParameters.Count -eq 1) { return }
}

New-Item -ItemType Directory -Force -Path $runRoot | Out-Null

$activeRecord = Get-ActiveForwardRecord
if ($activeRecord) {
  $listeningForward = $false
  foreach ($forward in @($activeRecord.Forwards)) {
    if ($forward.Listening -and (Test-TcpConnect -HostName $LanIp -Port ([int]($forward.Local -replace '^.*:', '')) -TimeoutMs 500)) {
      $listeningForward = $true
      break
    }
  }
  if ($listeningForward) {
    Write-Host "Project Truth remote LAN forward is already running through $($activeRecord.SshAlias) as PID $($activeRecord.ProcessId)."
    Write-Host "Evidence: $pidFile"
    return
  }
}

if (-not $Force -and (Test-TcpConnect -HostName $LanIp -Port 22 -TimeoutMs 1200)) {
  Write-Host "Direct LAN path to ${LanIp}:22 is reachable; remote LAN forwarding is not needed."
  return
}

if (-not (Test-SshTarget -Target $SshAlias)) {
  throw "SSH alias $SshAlias is not reachable. Confirm Cloudflare Access is logged in and ssh $SshAlias works."
}

$interfaceAlias = Ensure-LoopbackAddress -Address $LanIp
$selectedForwards = @()
$skippedForwards = @()

foreach ($forward in $forwards) {
  if (Test-PortBindable -Address $LanIp -Port $forward.LocalPort) {
    $selectedForwards += $forward
  } else {
    $skippedForwards += [pscustomobject]@{
      Name = $forward.Name
      Local = "${LanIp}:$($forward.LocalPort)"
      Reason = 'port-already-listening-on-address-or-wildcard'
    }
  }
}

if ($selectedForwards.Count -eq 0) {
  throw "No Project Truth remote LAN ports were available to forward on $LanIp."
}

$stdoutPath = Join-Path $runRoot 'remote-lan-forward.stdout.log'
$stderrPath = Join-Path $runRoot 'remote-lan-forward.stderr.log'
$argumentList = @(
  '-o', 'ExitOnForwardFailure=yes',
  '-o', 'ServerAliveInterval=30',
  '-o', 'ServerAliveCountMax=3',
  '-N'
)

foreach ($forward in $selectedForwards) {
  $argumentList += @(
    '-L',
    "${LanIp}:$($forward.LocalPort):$($forward.RemoteHost):$($forward.RemotePort)"
  )
}
$argumentList += $SshAlias

$process = Start-Process -FilePath $sshExe `
  -ArgumentList $argumentList `
  -RedirectStandardOutput $stdoutPath `
  -RedirectStandardError $stderrPath `
  -WindowStyle Hidden `
  -PassThru

Start-Sleep -Seconds 3

$activeForwards = @()
foreach ($forward in $selectedForwards) {
  $listening = [bool](Get-NetTCPConnection -LocalAddress $LanIp -LocalPort $forward.LocalPort -State Listen -ErrorAction SilentlyContinue)
  $activeForwards += [pscustomobject]@{
    Name = $forward.Name
    Url = if ($forward.ProbePath) { "http://${LanIp}:$($forward.LocalPort)$($forward.ProbePath)" } else { $null }
    Local = "${LanIp}:$($forward.LocalPort)"
    Remote = "$($forward.RemoteHost):$($forward.RemotePort)"
    Listening = $listening
  }
}

if (-not ($activeForwards | Where-Object { $_.Listening })) {
  $stderrText = Get-Content -Raw -LiteralPath $stderrPath -ErrorAction SilentlyContinue
  throw "Project Truth remote LAN forward did not start on $LanIp. $stderrText"
}

$record = [pscustomobject]@{
  GeneratedAt = (Get-Date).ToString('o')
  LanIp = $LanIp
  LoopbackInterface = $interfaceAlias
  SshAlias = $SshAlias
  ProcessId = $process.Id
  Forwards = $activeForwards
  Skipped = $skippedForwards
  StopCommand = '.\scripts\start-project-truth-remote-lan-forward.ps1 -StopExisting'
  Stdout = $stdoutPath
  Stderr = $stderrPath
}

$record | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath (Join-Path $runRoot 'remote-lan-forward.json') -Encoding UTF8
$record | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $pidFile -Encoding UTF8

Write-Host "Project Truth remote LAN forward is running through $SshAlias."
Write-Host "LAN-style address added on ${interfaceAlias}: $LanIp"
foreach ($active in $activeForwards | Where-Object { $_.Listening }) {
  if ($active.Url) {
    Write-Host "$($active.Name): $($active.Url)"
  } else {
    Write-Host "$($active.Name): $($active.Local) -> $($active.Remote)"
  }
}
if ($skippedForwards.Count -gt 0) {
  Write-Host "Skipped occupied ports:"
  foreach ($skipped in $skippedForwards) {
    Write-Host "$($skipped.Name): $($skipped.Local) ($($skipped.Reason))"
  }
}
Write-Host "Evidence: $(Join-Path $runRoot 'remote-lan-forward.json')"
