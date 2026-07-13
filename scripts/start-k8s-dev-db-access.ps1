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

function Test-PortFree {
  param([int]$Port)
  -not [bool](Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue)
}

if ($StopExisting) {
  Stop-ExistingForward
  if ($PSBoundParameters.Count -eq 1) { return }
}

if (-not (Test-Path -LiteralPath $sshKey)) {
  throw "SSH key not found at $sshKey"
}

if (-not (Test-PortFree -Port $LocalPort)) {
  throw "Local port $LocalPort is already in use. Stop the existing listener or choose another port."
}

New-Item -ItemType Directory -Force -Path $runRoot | Out-Null
$stdoutPath = Join-Path $runRoot 'dev-k8s-db.stdout.log'
$stderrPath = Join-Path $runRoot 'dev-k8s-db.stderr.log'

$argumentList = @(
  '-i', $sshKey,
  '-o', 'ExitOnForwardFailure=yes',
  '-o', 'ServerAliveInterval=30',
  '-o', 'ServerAliveCountMax=3',
  '-o', 'StrictHostKeyChecking=accept-new',
  '-N',
  '-L', "${LocalPort}:${targetHost}:${targetPort}",
  "${vmUser}@${vmHost}"
)

$process = Start-Process -FilePath $sshExe `
  -ArgumentList $argumentList `
  -RedirectStandardOutput $stdoutPath `
  -RedirectStandardError $stderrPath `
  -WindowStyle Hidden `
  -PassThru

Start-Sleep -Seconds 3
$listening = [bool](Get-NetTCPConnection -LocalPort $LocalPort -State Listen -ErrorAction SilentlyContinue)
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
