param(
  [ValidateSet('start', 'stop', 'status')]
  [string]$Action = 'start',
  [string]$DeviceIp = '',
  [string[]]$DeviceIps = @(),
  [string]$VmSshTarget = 'project-truth-hris',
  [int]$HttpDevicePort = 443,
  [int]$SdkDevicePort = 8000,
  [int]$HttpListenPort = 58080,
  [int]$SdkListenPort = 58000
)

$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$runtimeRoot = Join-Path $repoRoot '.runtime\hikvision-vm-ssh-bridge'
$stateFile = Join-Path $runtimeRoot 'active-ssh-bridge.json'
New-Item -ItemType Directory -Force -Path $runtimeRoot | Out-Null

function Stop-ExistingBridge {
  if (-not (Test-Path -LiteralPath $stateFile)) { return }

  try {
    $state = Get-Content -Raw -LiteralPath $stateFile | ConvertFrom-Json
    if ($state.ProcessId) {
      try {
        Stop-Process -Id ([int]$state.ProcessId) -Force -ErrorAction Stop
      } catch {}
    }
  } finally {
    Remove-Item -LiteralPath $stateFile -Force -ErrorAction SilentlyContinue
  }
}

if ($Action -eq 'stop') {
  Stop-ExistingBridge
  Write-Host 'Stopped Hikvision VM SSH bridge.'
  exit 0
}

if ($Action -eq 'status') {
  if (Test-Path -LiteralPath $stateFile) {
    Get-Content -Raw -LiteralPath $stateFile
  } else {
    Write-Host 'No active Hikvision VM SSH bridge.'
  }
  exit 0
}

Stop-ExistingBridge

$targetDeviceIps = @($DeviceIps)
if (-not [string]::IsNullOrWhiteSpace($DeviceIp)) {
  $targetDeviceIps += $DeviceIp
}
$targetDeviceIps = @(
  $targetDeviceIps |
    ForEach-Object { "$_" -split ',' } |
    ForEach-Object { "$_".Trim() } |
    Where-Object { $_ } |
    Select-Object -Unique
)
if ($targetDeviceIps.Count -eq 0) {
  throw 'Pass -DeviceIp or -DeviceIps with at least one Hikvision device address.'
}

$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$runRoot = Join-Path $runtimeRoot $stamp
New-Item -ItemType Directory -Force -Path $runRoot | Out-Null

$forwardArgs = New-Object System.Collections.Generic.List[string]
foreach ($arg in @(
  '-N',
  '-T',
  '-o', 'ExitOnForwardFailure=yes',
  '-o', 'ServerAliveInterval=30',
  '-o', 'ServerAliveCountMax=3'
)) {
  $forwardArgs.Add([string]$arg) | Out-Null
}

$records = New-Object System.Collections.Generic.List[object]
$runtimeProtocol = if ($HttpDevicePort -eq 443) { 'https' } else { 'http' }

for ($deviceIndex = 0; $deviceIndex -lt $targetDeviceIps.Count; $deviceIndex++) {
  $targetDeviceIp = $targetDeviceIps[$deviceIndex]
  $portOffset = $deviceIndex * 100
  $httpPort = $HttpListenPort + $portOffset
  $sdkPort = $SdkListenPort + $portOffset

  $forwardArgs.Add('-R')
  $forwardArgs.Add("${httpPort}:${targetDeviceIp}:${HttpDevicePort}")
  $forwardArgs.Add('-R')
  $forwardArgs.Add("${sdkPort}:${targetDeviceIp}:${SdkDevicePort}")

  $records.Add([pscustomobject]@{
    DeviceIp = $targetDeviceIp
    RuntimeConfigHint = [pscustomobject]@{
      hikvisionRuntimeAddress = '127.0.0.1'
      hikvisionRuntimePort = $httpPort
      hikvisionRuntimeProtocol = $runtimeProtocol
      hikvisionSdkRuntimeAddress = '127.0.0.1'
      hikvisionSdkRuntimePort = $sdkPort
    }
  }) | Out-Null
}

$forwardArgs.Add($VmSshTarget)
$sshStdout = Join-Path $runRoot 'ssh-bridge.stdout.log'
$sshStderr = Join-Path $runRoot 'ssh-bridge.stderr.log'
$proc = Start-Process -FilePath 'ssh.exe' `
  -ArgumentList $forwardArgs `
  -WindowStyle Hidden `
  -RedirectStandardOutput $sshStdout `
  -RedirectStandardError $sshStderr `
  -PassThru

Start-Sleep -Seconds 3
if ($proc.HasExited) {
  $stderr = if (Test-Path -LiteralPath $sshStderr) {
    Get-Content -Raw -LiteralPath $sshStderr
  } else {
    ''
  }
  throw "SSH bridge exited early. $stderr".Trim()
}

$verifyPorts = @($records | ForEach-Object {
  $_.RuntimeConfigHint.hikvisionRuntimePort
  $_.RuntimeConfigHint.hikvisionSdkRuntimePort
} | Sort-Object -Unique)
$verifyPattern = ($verifyPorts | ForEach-Object { [string]$_ }) -join '|'
$verifyOutput = ssh $VmSshTarget "ss -ltn | grep -E ':($verifyPattern)[[:space:]]'" 2>&1
if ($LASTEXITCODE -ne 0) {
  Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue
  throw "SSH bridge started but VM did not expose the forwarded ports. ${verifyOutput}"
}
$verifyOutput | Set-Content -LiteralPath (Join-Path $runRoot 'vm-port-proof.txt') -Encoding UTF8

$state = [pscustomobject]@{
  generatedAt = (Get-Date).ToString('o')
  vmSshTarget = $VmSshTarget
  processId = $proc.Id
  deviceIps = $targetDeviceIps
  bridges = $records
  evidenceDir = $runRoot
  stopCommand = '.\scripts\project-truth.ps1 start-host-hikvision-vm-ssh-bridge stop'
}

$state | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $stateFile -Encoding UTF8
Write-Host 'Hikvision VM SSH bridge started.'
$state | ConvertTo-Json -Depth 8
