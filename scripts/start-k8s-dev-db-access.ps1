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

function Write-K8sDbProgress {
  param([string]$Message)
  $ts = Get-Date -Format 'HH:mm:ss'
  Write-Host "[k8s-db-access $ts] $Message"
}

function Stop-ExistingForward {
  if (-not (Test-Path -LiteralPath $pidFile)) { return }
  $record = Get-Content -Raw -LiteralPath $pidFile | ConvertFrom-Json
  try {
    Stop-Process -Id $record.ProcessId -Force -ErrorAction Stop
    Write-K8sDbProgress "Stopped previous forward PID $($record.ProcessId)"
  } catch {
    Write-K8sDbProgress "Previous forward PID $($record.ProcessId) already gone"
  }
  Remove-Item -LiteralPath $pidFile -Force -ErrorAction SilentlyContinue
}

function Test-LoopbackPortFree {
  param([int]$Port)
  # A direct bind answers the actual question and avoids the ~2s cost of
  # Get-NetTCPConnection on Windows. A listener on 127.0.0.1 or a wildcard
  # address makes this fail; a separate 10.184.37.19 alias does not.
  $probe = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, $Port)
  try {
    $probe.Start()
    return $true
  } catch {
    return $false
  } finally {
    $probe.Stop()
  }
}

function Test-TcpConnect {
  param([string]$HostName, [int]$Port, [int]$TimeoutMs = 300)
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

function New-SshForwardArgs {
  param(
    [string]$Target,
    [switch]$UseKey,
    [int]$ConnectTimeoutSec = 12
  )
  $args = @(
    '-o', 'BatchMode=yes',
    '-o', "ConnectTimeout=$ConnectTimeoutSec",
    '-o', 'ExitOnForwardFailure=yes',
    '-o', 'ServerAliveInterval=30',
    '-o', 'ServerAliveCountMax=3',
    '-o', 'StrictHostKeyChecking=accept-new',
    '-N',
    # Bind explicitly to loopback so Prisma always has a stable host even when
    # 10.184.37.19 is only a temporary LAN-style loopback alias.
    '-L', "127.0.0.1:${LocalPort}:${targetHost}:${targetPort}",
    $Target
  )
  if ($UseKey) {
    $args = @('-i', $sshKey) + $args
  }
  return $args
}

if ($StopExisting) {
  Stop-ExistingForward
  if ($PSBoundParameters.Count -eq 1) { return }
}

if (-not (Test-Path -LiteralPath $sshKey)) {
  throw "SSH key not found at $sshKey"
}

# --- WARM PATH: no PowerShell SSH, no Cloudflare ---
Write-K8sDbProgress "probe 127.0.0.1:$LocalPort (reuse if open)..."
if (Test-TcpConnect -HostName '127.0.0.1' -Port $LocalPort -TimeoutMs 250) {
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
  Write-K8sDbProgress "REUSE OK -- 127.0.0.1:$LocalPort already listening (no SSH)"
  Write-Host "DATABASE_URL=$($reuseRecord.DatabaseUrl)"
  return
}

Write-K8sDbProgress "cold path -- open single-port SSH forward only (no multi-port LAN)"

if (-not (Test-LoopbackPortFree -Port $LocalPort)) {
  throw "Local port $LocalPort is already in use on 127.0.0.1/0.0.0.0. Stop the existing listener or choose another port."
}

New-Item -ItemType Directory -Force -Path $runRoot | Out-Null
$stdoutPath = Join-Path $runRoot 'dev-k8s-db.stdout.log'
$stderrPath = Join-Path $runRoot 'dev-k8s-db.stderr.log'

# Path selection: cheap TCP first. Do NOT run a separate `ssh true` probe --
# that doubles Cloudflare SSH cost. Start the real -L forward immediately.
$preferAlias = $env:PROJECT_TRUTH_SSH_PREFER_ALIAS -eq 'true'
$forceLan = $env:PROJECT_TRUTH_SSH_FORCE_LAN -eq 'true'
$selectedPath = $null
$selectedTarget = $null
$argumentList = $null

if (-not $preferAlias -or $forceLan) {
  Write-K8sDbProgress "TCP probe ${vmHost}:22 (300ms)..."
  $lanOpen = Test-TcpConnect -HostName $vmHost -Port 22 -TimeoutMs 300
  if ($lanOpen -or $forceLan) {
    $selectedPath = 'direct-lan'
    $selectedTarget = "${vmUser}@${vmHost}"
    $argumentList = New-SshForwardArgs -Target $selectedTarget -UseKey -ConnectTimeoutSec 8
    Write-K8sDbProgress "selected direct LAN $selectedTarget"
  } else {
    Write-K8sDbProgress "LAN :22 not open in 300ms -- using Cloudflare alias (skip wasted SSH probe)"
  }
}

if (-not $selectedTarget) {
  $selectedPath = "alias:$sshAlias"
  $selectedTarget = $sshAlias
  $argumentList = New-SshForwardArgs -Target $selectedTarget -ConnectTimeoutSec 15
  Write-K8sDbProgress "selected $selectedTarget -- if quiet >15s complete Cloudflare Access in browser"
}

Write-K8sDbProgress "start ssh -N -L 127.0.0.1:${LocalPort}:${targetHost}:${targetPort} via $selectedPath"
$process = Start-Process -FilePath $sshExe `
  -ArgumentList $argumentList `
  -RedirectStandardOutput $stdoutPath `
  -RedirectStandardError $stderrPath `
  -WindowStyle Hidden `
  -PassThru

# Poll fast; Cloudflare cold can take several seconds after Access is warm.
$readyTimer = [System.Diagnostics.Stopwatch]::StartNew()
$listening = $false
$lastTick = -1
$maxWaitSec = 20
do {
  $process.Refresh()
  if ($process.HasExited) { break }
  $listening = Test-TcpConnect -HostName '127.0.0.1' -Port $LocalPort -TimeoutMs 120
  if ($listening) { break }
  $sec = [int][math]::Floor($readyTimer.Elapsed.TotalSeconds)
  if ($sec -ne $lastTick -and $sec -gt 0) {
    Write-K8sDbProgress "waiting for 127.0.0.1:$LocalPort ($sec/${maxWaitSec}s)..."
    $lastTick = $sec
  }
  Start-Sleep -Milliseconds 100
} while ($readyTimer.Elapsed.TotalSeconds -lt $maxWaitSec)

if ($listening) {
  Write-K8sDbProgress ("LISTEN OK after {0:N1}s via $selectedPath" -f $readyTimer.Elapsed.TotalSeconds)
} else {
  $stderrText = Get-Content -Raw -LiteralPath $stderrPath -ErrorAction SilentlyContinue
  if ($process.HasExited) {
    throw "K3s DEV DB forward ssh exited before 127.0.0.1:$LocalPort opened. stderr: $stderrText"
  }
  try { Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue } catch {}
  throw "K3s DEV DB forward did not open 127.0.0.1:$LocalPort within ${maxWaitSec}s via $selectedPath. stderr: $stderrText"
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

Write-K8sDbProgress "OK -- forward running (leave it up for instant next predev)"
Write-Host "DATABASE_URL=$($record.DatabaseUrl)"
Write-Host "Stop with: .\scripts\start-k8s-dev-db-access.ps1 -StopExisting"
Write-Host "Evidence: $(Join-Path $runRoot 'k8s-dev-db-access.json')"
