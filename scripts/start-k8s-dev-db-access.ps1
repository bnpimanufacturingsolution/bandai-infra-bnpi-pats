param(
  [int]$LocalPort = 55435,
  [switch]$StopExisting
)

$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $PSScriptRoot
$runtimeRoot = Join-Path $repoRoot '.runtime\k8s-dev-db-tcp'
$pidFile = Join-Path $runtimeRoot 'k8s-dev-db-access-active.json'
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$runRoot = Join-Path $runtimeRoot "k8s-dev-db-access-$stamp"
$sshKey = Join-Path $env:USERPROFILE '.ssh\node-health-appliance_ed25519'
$sshExe = (Get-Command ssh.exe -ErrorAction Stop).Source
$vmHost = '10.184.37.19'
$vmUser = 'infra'
$sshAlias = 'project-truth-hris'
$targetHost = '10.43.130.9'
$targetPort = 5432

function Stop-ExistingForward {
  if (-not (Test-Path -LiteralPath $pidFile)) { return }
  $record = Get-Content -Raw -LiteralPath $pidFile | ConvertFrom-Json
  try {
    Stop-Process -Id $record.ProcessId -Force -ErrorAction Stop
    Write-Host "Stopped K3s DEV DB forward PID $($record.ProcessId)"
  } catch {
    Write-Host "K3s DEV DB forward PID $($record.ProcessId) is not running"
  }
  Remove-Item -LiteralPath $pidFile -Force -ErrorAction SilentlyContinue
}

function Test-LoopbackPortFree {
  param([int]$Port)
  # Only treat 127.0.0.1 / ::1 as busy. A remote-LAN loopback alias on 10.184.37.19:port
  # must not block a localhost forward that Windows apps (Prisma) can always reach.
  $listeners = @(Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue)
  foreach ($listener in $listeners) {
    if ($listener.LocalAddress -eq '127.0.0.1' -or $listener.LocalAddress -eq '::1' -or $listener.LocalAddress -eq '0.0.0.0' -or $listener.LocalAddress -eq '::') {
      return $false
    }
  }
  return $true
}

function Test-TcpConnect {
  param([string]$HostName, [int]$Port, [int]$TimeoutMs = 1500)
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

if ($StopExisting) {
  Stop-ExistingForward
  if ($PSBoundParameters.Count -eq 1) { return }
}

if (-not (Test-Path -LiteralPath $sshKey)) {
  throw "SSH key not found at $sshKey"
}

# Reuse an already-healthy localhost forward.
if (Test-TcpConnect -HostName '127.0.0.1' -Port $LocalPort -TimeoutMs 800) {
  $reuseRecord = [pscustomobject]@{
    GeneratedAt = (Get-Date).ToString('o')
    Environment = 'dev-k8s-runtime'
    LocalPort = $LocalPort
    ProcessId = $null
    VmHost = $vmHost
    SshPath = 'reused-existing-localhost-listener'
    SshTarget = '127.0.0.1'
    TargetHost = $targetHost
    TargetPort = $targetPort
    DatabaseUrl = "postgresql://postgres:postgres@127.0.0.1:$LocalPort/hris?schema=public"
    StopCommand = '.\scripts\start-k8s-dev-db-access.ps1 -StopExisting'
    Note = 'Existing 127.0.0.1 listener reused; no new ssh process started.'
  }
  New-Item -ItemType Directory -Force -Path $runRoot | Out-Null
  $reuseRecord | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath (Join-Path $runRoot 'k8s-dev-db-access.json') -Encoding UTF8
  $reuseRecord | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath $pidFile -Encoding UTF8
  Write-Host "K3s DEV database forward already reachable on 127.0.0.1:$LocalPort"
  Write-Host "DATABASE_URL=$($reuseRecord.DatabaseUrl)"
  return
}

if (-not (Test-LoopbackPortFree -Port $LocalPort)) {
  throw "Local port $LocalPort is already in use on 127.0.0.1/0.0.0.0. Stop the existing listener or choose another port."
}

New-Item -ItemType Directory -Force -Path $runRoot | Out-Null
$stdoutPath = Join-Path $runRoot 'dev-k8s-db.stdout.log'
$stderrPath = Join-Path $runRoot 'dev-k8s-db.stderr.log'

function Test-SshTarget {
  param([string[]]$Arguments)
  $previousErrorActionPreference = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  try {
    & $sshExe @Arguments 'true' *> $null
    return $LASTEXITCODE -eq 0
  } catch {
    return $false
  } finally {
    $ErrorActionPreference = $previousErrorActionPreference
  }
}

$directProbeArgs = @(
  '-i', $sshKey,
  '-o', 'BatchMode=yes',
  '-o', 'ConnectTimeout=8',
  '-o', 'StrictHostKeyChecking=accept-new',
  "${vmUser}@${vmHost}"
)
$aliasProbeArgs = @(
  '-o', 'BatchMode=yes',
  '-o', 'ConnectTimeout=20',
  $sshAlias
)

$selectedPath = 'direct-lan'
$selectedTarget = "${vmUser}@${vmHost}"
$argumentList = @(
  '-i', $sshKey,
  '-o', 'ExitOnForwardFailure=yes',
  '-o', 'ServerAliveInterval=30',
  '-o', 'ServerAliveCountMax=3',
  '-o', 'StrictHostKeyChecking=accept-new',
  '-N',
  # Bind explicitly to loopback so Prisma always has a stable host even when
  # 10.184.37.19 is only a temporary LAN-style loopback alias.
  '-L', "127.0.0.1:${LocalPort}:${targetHost}:${targetPort}",
  $selectedTarget
)

if (-not (Test-SshTarget -Arguments $directProbeArgs)) {
  if (-not (Test-SshTarget -Arguments $aliasProbeArgs)) {
    throw "Neither direct LAN SSH to ${vmUser}@${vmHost} nor SSH alias $sshAlias is reachable from this workstation."
  }
  $selectedPath = "alias:$sshAlias"
  $selectedTarget = $sshAlias
  $argumentList = @(
    '-o', 'ExitOnForwardFailure=yes',
    '-o', 'ServerAliveInterval=30',
    '-o', 'ServerAliveCountMax=3',
    '-N',
    '-L', "127.0.0.1:${LocalPort}:${targetHost}:${targetPort}",
    $selectedTarget
  )
}

$process = Start-Process -FilePath $sshExe `
  -ArgumentList $argumentList `
  -RedirectStandardOutput $stdoutPath `
  -RedirectStandardError $stderrPath `
  -WindowStyle Hidden `
  -PassThru

Start-Sleep -Seconds 3
$listening = [bool](Get-NetTCPConnection -LocalAddress '127.0.0.1' -LocalPort $LocalPort -State Listen -ErrorAction SilentlyContinue) -or
  (Test-TcpConnect -HostName '127.0.0.1' -Port $LocalPort -TimeoutMs 1200)
if (-not $listening) {
  $stderrText = Get-Content -Raw -LiteralPath $stderrPath -ErrorAction SilentlyContinue
  throw "K3s DEV DB forward did not start on localhost:$LocalPort. $stderrText"
}

$record = [pscustomobject]@{
  GeneratedAt = (Get-Date).ToString('o')
  Environment = 'dev-k8s-runtime'
  LocalPort = $LocalPort
  ProcessId = $process.Id
  VmHost = $vmHost
  SshPath = $selectedPath
  SshTarget = $selectedTarget
  TargetHost = $targetHost
  TargetPort = $targetPort
  DatabaseUrl = "postgresql://postgres:postgres@127.0.0.1:$LocalPort/hris?schema=public"
  StopCommand = '.\scripts\start-k8s-dev-db-access.ps1 -StopExisting'
  Stdout = $stdoutPath
  Stderr = $stderrPath
}

$record | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath (Join-Path $runRoot 'k8s-dev-db-access.json') -Encoding UTF8
$record | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath $pidFile -Encoding UTF8

Write-Host "K3s DEV database forward is running."
Write-Host "DATABASE_URL=$($record.DatabaseUrl)"
Write-Host "Stop with: .\scripts\start-k8s-dev-db-access.ps1 -StopExisting"
Write-Host "Evidence: $(Join-Path $runRoot 'k8s-dev-db-access.json')"
