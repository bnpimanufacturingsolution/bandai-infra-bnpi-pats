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
# Preferred: K3s DEV ClusterIP. Fallback: compose DEV published on VM loopback.
$k8sTargetHost = '10.43.130.9'
$k8sTargetPort = 5432
$composeTargetHost = '127.0.0.1'
$composeTargetPort = 15433
$targetHost = $k8sTargetHost
$targetPort = $k8sTargetPort

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

function Test-PostgresWire {
  param(
    [string]$HostName = '127.0.0.1',
    [int]$Port,
    [int]$TimeoutMs = 800
  )
  # TCP open is not enough: a half-dead SSH -L can accept then refuse the remote.
  # Postgres SSLRequest -> reply N/S proves a live server.
  try {
    $client = [System.Net.Sockets.TcpClient]::new()
    $async = $client.BeginConnect($HostName, $Port, $null, $null)
    if (-not $async.AsyncWaitHandle.WaitOne($TimeoutMs, $false)) {
      $client.Close()
      return $false
    }
    $client.EndConnect($async)
    $client.ReceiveTimeout = $TimeoutMs
    $client.SendTimeout = $TimeoutMs
    $stream = $client.GetStream()
    $sslRequest = [byte[]](0, 0, 0, 8, 4, 210, 22, 47)
    $stream.Write($sslRequest, 0, $sslRequest.Length)
    $buf = New-Object byte[] 1
    $n = $stream.Read($buf, 0, 1)
    $client.Close()
    # 78 = 'N' (no SSL), 83 = 'S' (SSL)
    return ($n -eq 1 -and ($buf[0] -eq 78 -or $buf[0] -eq 83))
  } catch {
    return $false
  }
}

function New-SshForwardArgs {
  param(
    [string]$Target,
    [string]$RemoteHost,
    [int]$RemotePort,
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
    '-L', "127.0.0.1:${LocalPort}:${RemoteHost}:${RemotePort}",
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
Write-K8sDbProgress "probe 127.0.0.1:$LocalPort (reuse if open + live Postgres wire)..."
if (
  (Test-TcpConnect -HostName '127.0.0.1' -Port $LocalPort -TimeoutMs 250) -and
  (Test-PostgresWire -HostName '127.0.0.1' -Port $LocalPort -TimeoutMs 800)
) {
  $reuseRecord = [pscustomobject]@{
    GeneratedAt = (Get-Date).ToString('o')
    Environment = 'dev-db-runtime'
    LocalPort = $LocalPort
    ProcessId = $null
    VmHost = $vmHost
    SshPath = 'reused-existing-localhost-listener'
    SshTarget = '127.0.0.1'
    TargetHost = $targetHost
    TargetPort = $targetPort
    DatabaseUrl = "postgresql://postgres:postgres@127.0.0.1:$LocalPort/hris?schema=public"
    StopCommand = '.\scripts\start-k8s-dev-db-access.ps1 -StopExisting'
    Note = 'Existing 127.0.0.1 listener reused after Postgres wire check; no new ssh process started.'
  }
  New-Item -ItemType Directory -Force -Path $runRoot | Out-Null
  $reuseRecord | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath (Join-Path $runRoot 'k8s-dev-db-access.json') -Encoding UTF8
  $reuseRecord | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath $pidFile -Encoding UTF8
  Write-K8sDbProgress "REUSE OK -- 127.0.0.1:$LocalPort already serving Postgres (no SSH)"
  Write-Host "DATABASE_URL=$($reuseRecord.DatabaseUrl)"
  return
}

if (Test-TcpConnect -HostName '127.0.0.1' -Port $LocalPort -TimeoutMs 250) {
  Write-K8sDbProgress "127.0.0.1:$LocalPort is open but not Postgres (stale/half-dead) -- replacing"
  Stop-ExistingForward
  # Also kill any leftover ssh -L on this port not tracked in the pid file.
  Get-CimInstance Win32_Process -Filter "Name = 'ssh.exe'" -ErrorAction SilentlyContinue |
    Where-Object { $_.CommandLine -match [regex]::Escape("-L") -and $_.CommandLine -match [regex]::Escape("127.0.0.1:${LocalPort}:") } |
    ForEach-Object {
      try {
        Stop-Process -Id $_.ProcessId -Force -ErrorAction Stop
        Write-K8sDbProgress "Stopped stale ssh PID $($_.ProcessId)"
      } catch {}
    }
  Start-Sleep -Milliseconds 300
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
$useKey = $false
$connectTimeoutSec = 15

if (-not $preferAlias -or $forceLan) {
  Write-K8sDbProgress "TCP probe ${vmHost}:22 (300ms)..."
  $lanOpen = Test-TcpConnect -HostName $vmHost -Port 22 -TimeoutMs 300
  if ($lanOpen -or $forceLan) {
    $selectedPath = 'direct-lan'
    $selectedTarget = "${vmUser}@${vmHost}"
    $useKey = $true
    $connectTimeoutSec = 8
    Write-K8sDbProgress "selected direct LAN $selectedTarget"
  } else {
    Write-K8sDbProgress "LAN :22 not open in 300ms -- using Cloudflare alias (skip wasted SSH probe)"
  }
}

if (-not $selectedTarget) {
  $selectedPath = "alias:$sshAlias"
  $selectedTarget = $sshAlias
  $useKey = $false
  $connectTimeoutSec = 15
  Write-K8sDbProgress "selected $selectedTarget -- if quiet >15s complete Cloudflare Access in browser"
}

function Start-ForwardAndWait {
  param(
    [string]$RemoteHost,
    [int]$RemotePort,
    [string]$Label,
    [int]$MaxWaitSec = 20
  )

  $argumentList = New-SshForwardArgs `
    -Target $selectedTarget `
    -RemoteHost $RemoteHost `
    -RemotePort $RemotePort `
    -UseKey:$useKey `
    -ConnectTimeoutSec $connectTimeoutSec

  Write-K8sDbProgress "start ssh -N -L 127.0.0.1:${LocalPort}:${RemoteHost}:${RemotePort} via $selectedPath ($Label)"
  $process = Start-Process -FilePath $sshExe `
    -ArgumentList $argumentList `
    -RedirectStandardOutput $stdoutPath `
    -RedirectStandardError $stderrPath `
    -WindowStyle Hidden `
    -PassThru

  $readyTimer = [System.Diagnostics.Stopwatch]::StartNew()
  $listening = $false
  $lastTick = -1
  do {
    $process.Refresh()
    if ($process.HasExited) { break }
    $listening = Test-TcpConnect -HostName '127.0.0.1' -Port $LocalPort -TimeoutMs 120
    if ($listening) { break }
    $sec = [int][math]::Floor($readyTimer.Elapsed.TotalSeconds)
    if ($sec -ne $lastTick -and $sec -gt 0) {
      Write-K8sDbProgress "waiting for 127.0.0.1:$LocalPort ($sec/${MaxWaitSec}s)..."
      $lastTick = $sec
    }
    Start-Sleep -Milliseconds 100
  } while ($readyTimer.Elapsed.TotalSeconds -lt $MaxWaitSec)

  if (-not $listening) {
    $stderrText = Get-Content -Raw -LiteralPath $stderrPath -ErrorAction SilentlyContinue
    try { Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue } catch {}
    return [pscustomobject]@{
      Ok = $false
      Process = $null
      ElapsedSec = $readyTimer.Elapsed.TotalSeconds
      Stderr = $stderrText
      WireOk = $false
    }
  }

  Write-K8sDbProgress ("LISTEN OK after {0:N1}s via $selectedPath ($Label)" -f $readyTimer.Elapsed.TotalSeconds)
  # Give the first remote hop a brief moment, then require Postgres wire.
  Start-Sleep -Milliseconds 200
  $wireOk = Test-PostgresWire -HostName '127.0.0.1' -Port $LocalPort -TimeoutMs 900
  if (-not $wireOk) {
    Write-K8sDbProgress "LISTEN but Postgres wire failed for $Label -- remote $RemoteHost`:$RemotePort not serving"
    try { Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue } catch {}
    Start-Sleep -Milliseconds 250
    $stderrText = Get-Content -Raw -LiteralPath $stderrPath -ErrorAction SilentlyContinue
    return [pscustomobject]@{
      Ok = $false
      Process = $null
      ElapsedSec = $readyTimer.Elapsed.TotalSeconds
      Stderr = $stderrText
      WireOk = $false
    }
  }

  return [pscustomobject]@{
    Ok = $true
    Process = $process
    ElapsedSec = $readyTimer.Elapsed.TotalSeconds
    Stderr = $null
    WireOk = $true
  }
}

# 1) Prefer K3s DEV ClusterIP. 2) Fall back to compose DEV on VM :15433 when
# ClusterIP is down (common split-runtime: compose healthy, K3s pending).
$attempt = Start-ForwardAndWait -RemoteHost $k8sTargetHost -RemotePort $k8sTargetPort -Label 'k8s-clusterip'
$environment = 'dev-k8s-runtime'
$targetHost = $k8sTargetHost
$targetPort = $k8sTargetPort
$process = $null

if ($attempt.Ok) {
  $process = $attempt.Process
} else {
  Write-K8sDbProgress "K3s $k8sTargetHost`:$k8sTargetPort unreachable through tunnel -- falling back to compose DEV ${composeTargetHost}:${composeTargetPort}"
  if (-not (Test-LoopbackPortFree -Port $LocalPort)) {
    Get-CimInstance Win32_Process -Filter "Name = 'ssh.exe'" -ErrorAction SilentlyContinue |
      Where-Object { $_.CommandLine -match [regex]::Escape("127.0.0.1:${LocalPort}:") } |
      ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
    Start-Sleep -Milliseconds 300
  }
  $stdoutPath = Join-Path $runRoot 'dev-compose-db.stdout.log'
  $stderrPath = Join-Path $runRoot 'dev-compose-db.stderr.log'
  $attempt = Start-ForwardAndWait -RemoteHost $composeTargetHost -RemotePort $composeTargetPort -Label 'compose-dev-15433'
  if (-not $attempt.Ok) {
    throw "DEV DB forward failed for both K3s $k8sTargetHost`:$k8sTargetPort and compose $composeTargetHost`:$composeTargetPort. Confirm: ssh project-truth-hris and that VM Postgres is up on 15433. stderr: $($attempt.Stderr)"
  }
  $process = $attempt.Process
  $environment = 'dev-compose-runtime'
  $targetHost = $composeTargetHost
  $targetPort = $composeTargetPort
}

$record = [pscustomobject]@{
  GeneratedAt = (Get-Date).ToString('o')
  Environment = $environment
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
  Note = if ($environment -eq 'dev-compose-runtime') {
    "Fell back to compose DEV because K3s ClusterIP $k8sTargetHost`:$k8sTargetPort did not answer Postgres wire."
  } else {
    $null
  }
}

$record | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath (Join-Path $runRoot 'k8s-dev-db-access.json') -Encoding UTF8
$record | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath $pidFile -Encoding UTF8

Write-K8sDbProgress "OK -- forward running env=$environment remote=${targetHost}:${targetPort} (leave it up for instant next predev)"
Write-Host "DATABASE_URL=$($record.DatabaseUrl)"
Write-Host "Stop with: .\scripts\start-k8s-dev-db-access.ps1 -StopExisting"
Write-Host "Evidence: $(Join-Path $runRoot 'k8s-dev-db-access.json')"
