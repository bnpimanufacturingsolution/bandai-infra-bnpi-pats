param(
  [int]$LocalPort = 55435,
  [int]$PollSeconds = 10,
  [int]$FailureThreshold = 2,
  [switch]$RunLoop,
  [switch]$Stop
)

$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $PSScriptRoot
$runtimeRoot = Join-Path $repoRoot '.runtime\k8s-dev-db-watch'
$stateFile = Join-Path $runtimeRoot 'active.json'
$logFile = Join-Path $runtimeRoot 'latest.log'
$accessScript = Join-Path $PSScriptRoot 'start-k8s-dev-db-access.ps1'
New-Item -ItemType Directory -Force -Path $runtimeRoot | Out-Null

function Write-WatchLog {
  param([string]$Message)
  $line = "$(Get-Date -Format o) | $Message"
  $written = $false
  for ($attempt = 1; $attempt -le 5 -and -not $written; $attempt++) {
    try {
      Add-Content -LiteralPath $logFile -Value $line -Encoding UTF8 -ErrorAction Stop
      $written = $true
    } catch {
      if ($attempt -lt 5) { Start-Sleep -Milliseconds (100 * $attempt) }
    }
  }
  if (-not $RunLoop) { Write-Host "[k8s-db-watch] $Message" }
}

function Get-WatcherState {
  if (-not (Test-Path -LiteralPath $stateFile)) { return $null }
  try { return Get-Content -Raw -LiteralPath $stateFile | ConvertFrom-Json } catch { return $null }
}

function Test-PostgresHandshake {
  try {
    $timeoutMs = 5000
    $client = [System.Net.Sockets.TcpClient]::new()
    $async = $client.BeginConnect('127.0.0.1', $LocalPort, $null, $null)
    if (-not $async.AsyncWaitHandle.WaitOne($timeoutMs, $false)) {
      $client.Close()
      return $false
    }
    $client.EndConnect($async)
    $stream = $client.GetStream()
    $stream.ReadTimeout = $timeoutMs
    $sslRequest = [byte[]](0, 0, 0, 8, 4, 210, 22, 47)
    $stream.Write($sslRequest, 0, $sslRequest.Length)
    $buffer = New-Object byte[] 1
    $read = $stream.Read($buffer, 0, 1)
    $client.Close()
    return $read -gt 0
  } catch {
    return $false
  }
}

if ($Stop) {
  $state = Get-WatcherState
  if ($state -and $state.ProcessId) {
    Stop-Process -Id ([int]$state.ProcessId) -Force -ErrorAction SilentlyContinue
  }
  Remove-Item -LiteralPath $stateFile -Force -ErrorAction SilentlyContinue
  Write-WatchLog 'stopped'
  exit 0
}

if ($RunLoop) {
  [pscustomobject]@{
    GeneratedAt = (Get-Date).ToString('o')
    ProcessId = $PID
    LocalPort = $LocalPort
    PollSeconds = $PollSeconds
    FailureThreshold = $FailureThreshold
  } | ConvertTo-Json | Set-Content -LiteralPath $stateFile -Encoding UTF8

  Write-WatchLog "loop_started pid=$PID port=$LocalPort"
  $consecutiveFailures = 0
  while ($true) {
    if (Test-PostgresHandshake) {
      if ($consecutiveFailures -gt 0) {
        Write-WatchLog "handshake_recovered failures=$consecutiveFailures"
      }
      $consecutiveFailures = 0
    } else {
      $consecutiveFailures += 1
      Write-WatchLog "handshake_failed consecutive=$consecutiveFailures threshold=$FailureThreshold"
      if ($consecutiveFailures -ge $FailureThreshold) {
        try {
          Write-WatchLog 'repair_start'
          & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $accessScript -LocalPort $LocalPort *>> $logFile
          if (Test-PostgresHandshake) {
            Write-WatchLog 'repair_ok'
            $consecutiveFailures = 0
          } else {
            Write-WatchLog 'repair_returned_without_handshake'
          }
        } catch {
          Write-WatchLog "repair_failed error=$($_.Exception.Message)"
        }
      }
    }
    Start-Sleep -Seconds ([Math]::Max($PollSeconds, 2))
  }
}

$state = Get-WatcherState
if ($state -and (Get-Process -Id ([int]$state.ProcessId) -ErrorAction SilentlyContinue)) {
  Write-WatchLog "already_running pid=$($state.ProcessId)"
  exit 0
}

Remove-Item -LiteralPath $stateFile -Force -ErrorAction SilentlyContinue
$process = Start-Process powershell.exe `
  -ArgumentList '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', $PSCommandPath, '-RunLoop', '-LocalPort', $LocalPort, '-PollSeconds', $PollSeconds, '-FailureThreshold', $FailureThreshold `
  -WindowStyle Hidden `
  -PassThru
Write-WatchLog "started pid=$($process.Id)"

$deadline = (Get-Date).AddSeconds(5)
while ((Get-Date) -lt $deadline) {
  $state = Get-WatcherState
  if ($state -and [int]$state.ProcessId -eq $process.Id) {
    Write-Host "[k8s-db-watch] running pid=$($process.Id)"
    exit 0
  }
  Start-Sleep -Milliseconds 200
}
throw "K3s DEV DB watcher did not publish state for PID $($process.Id)"
