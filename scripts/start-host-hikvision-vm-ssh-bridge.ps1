param(
  [ValidateSet('start', 'stop', 'status')]
  [string]$Action = 'start',
  [string]$DeviceIp = '',
  [string[]]$DeviceIps = @(),
  [string]$VmSshTarget = 'auto',
  [int]$ApiLocalPort = 3001,
  [int]$ApiRemotePort = 53001,
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

function Get-VmSshCandidates {
  if ($VmSshTarget -and $VmSshTarget -ne 'auto') {
    return @([pscustomobject]@{ Label = $VmSshTarget; Args = @($VmSshTarget) })
  }

  $keyPath = Join-Path $env:USERPROFILE '.ssh\node-health-appliance_ed25519'
  $directArgs = if (Test-Path -LiteralPath $keyPath) {
    @('-i', $keyPath, 'infra@10.184.37.19')
  } else {
    @('infra@10.184.37.19')
  }

  @(
    [pscustomobject]@{ Label = 'lan:infra@10.184.37.19'; Args = $directArgs },
    [pscustomobject]@{ Label = 'alias:project-truth-hris'; Args = @('project-truth-hris') }
  )
}

function Select-VmSshCandidate {
  foreach ($candidate in Get-VmSshCandidates) {
    $args = @('-o', 'ConnectTimeout=5', '-o', 'BatchMode=yes') + @($candidate.Args) + @('echo SSH_OK')
    $out = & ssh.exe @args 2>$null
    if ($LASTEXITCODE -eq 0 -and (($out | Out-String) -match 'SSH_OK')) {
      Write-Host "Using VM SSH target $($candidate.Label)"
      return $candidate
    }
  }
  throw "No VM SSH target reachable (tried direct LAN 10.184.37.19, then project-truth-hris)."
}

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

# Free stale reverse listeners on the VM so -R rebinds cleanly after a crashed
# or elevated host SSH left remote ports occupied (common after thrash).
function Clear-RemoteReversePorts {
  param(
    [object]$Target,
    [int[]]$Ports
  )
  if (-not $Ports -or $Ports.Count -eq 0) { return }
  $portPattern = ($Ports | ForEach-Object { [string]$_ }) -join '|'
$script = @"
set -e
listeners=`$(sudo -n ss -ltnp 2>/dev/null || ss -ltnp 2>/dev/null || true)
echo "`$listeners" | grep -E ":($portPattern)[[:space:]]" || true
pids=`$(echo "`$listeners" | grep -E ":($portPattern)[[:space:]]" | sed -n 's/.*pid=\([0-9][0-9]*\).*/\1/p' | sort -u)
for p in `$pids; do
  # Only kill infra reverse-forward sshd sessions, never the main sshd daemon.
  cmd=`$(sudo -n ps -o cmd= -p `$p 2>/dev/null || ps -o cmd= -p `$p 2>/dev/null || true)
  if echo "`$cmd" | grep -q 'sshd: infra'; then
    echo "CLEAR_REMOTE_PID=`$p"
    sudo -n kill `$p 2>/dev/null || kill `$p 2>/dev/null || true
  fi
done
for i in 1 2 3 4 5; do
  remaining=`$(ss -ltn 2>/dev/null | grep -E ":($portPattern)[[:space:]]" || true)
  [ -z "`$remaining" ] && break
  sleep 0.2
done
ss -ltn 2>/dev/null | grep -E ":($portPattern)[[:space:]]" || echo REMOTE_PORTS_CLEAR
"@
  try {
    $sshArgs = @('-o', 'ConnectTimeout=20', '-o', 'BatchMode=yes') + @($Target.Args) + @('bash -s')
    $out = $script | & ssh.exe @sshArgs 2>&1 | Out-String
    if ($out.Trim()) { Write-Host $out.Trim() }
  } catch {
    Write-Warning "Could not clear remote reverse ports on $($Target.Label): $($_.Exception.Message)"
  }
}

if ($DeviceIps.Count -eq 0 -and [string]::IsNullOrWhiteSpace($DeviceIp)) {
  $resolver = Join-Path $repoRoot "hris-api\scripts\resolve-hikvision-vm-bridge-targets.cjs"
  if (Test-Path -LiteralPath $resolver) {
    try {
      $json = & node.exe $resolver 2>$null
      $parsed = $json | ConvertFrom-Json
      $resolvedIps = @($parsed.targets | Where-Object { $_.deviceIp } | ForEach-Object { [string]$_.deviceIp })
      if ($resolvedIps.Count -gt 0) {
        $DeviceIps = $resolvedIps
        Write-Host "Resolved Hikvision bridge target(s) from DB: $($DeviceIps -join ', ')"
      }
    } catch {
      Write-Warning "Could not resolve Hikvision bridge target from DB: $($_.Exception.Message)"
    }
  }
}

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

$sshCandidate = Select-VmSshCandidate

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
$remoteListenPorts = New-Object System.Collections.Generic.List[int]

for ($deviceIndex = 0; $deviceIndex -lt $targetDeviceIps.Count; $deviceIndex++) {
  $targetDeviceIp = $targetDeviceIps[$deviceIndex]
  $portOffset = $deviceIndex * 100
  $httpPort = $HttpListenPort + $portOffset
  $sdkPort = $SdkListenPort + $portOffset
  $remoteListenPorts.Add([int]$httpPort) | Out-Null
  $remoteListenPorts.Add([int]$sdkPort) | Out-Null

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

$forwardArgs.AddRange([string[]]@($sshCandidate.Args))
Clear-RemoteReversePorts -Target $sshCandidate -Ports @($remoteListenPorts | Select-Object -Unique)

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
$verifyArgs = @($sshCandidate.Args) + @("ss -ltn | grep -E ':($verifyPattern)[[:space:]]'")
$verifyOutput = & ssh.exe @verifyArgs 2>&1
if ($LASTEXITCODE -ne 0) {
  Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue
  throw "SSH bridge started but VM did not expose the forwarded ports. ${verifyOutput}"
}
$verifyOutput | Set-Content -LiteralPath (Join-Path $runRoot 'vm-port-proof.txt') -Encoding UTF8

$state = [pscustomobject]@{
  generatedAt = (Get-Date).ToString('o')
  vmSshTarget = $sshCandidate.Label
  processId = $proc.Id
  deviceIps = $targetDeviceIps
  bridges = $records
  evidenceDir = $runRoot
  stopCommand = '.\scripts\project-truth.ps1 start-host-hikvision-vm-ssh-bridge stop'
}

$state | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $stateFile -Encoding UTF8
Write-Host 'Hikvision VM SSH bridge started.'
$state | ConvertTo-Json -Depth 8
