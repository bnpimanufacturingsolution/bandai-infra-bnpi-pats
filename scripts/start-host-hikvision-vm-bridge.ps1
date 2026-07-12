param(
  [ValidateSet('start', 'stop', 'status')]
  [string]$Action = 'start',
  [string]$DeviceIp = '192.168.254.194',
  [string[]]$DeviceIps = @(),
  [int]$HttpDevicePort = 80,
  [int]$SdkDevicePort = 8000,
  [int]$HttpListenPort = 58080,
  [int]$SdkListenPort = 58000
)

$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$runtimeRoot = Join-Path $repoRoot '.runtime\host-hikvision-vm-bridge'
$pidFile = Join-Path $runtimeRoot 'active-bridges.json'
New-Item -ItemType Directory -Force -Path $runtimeRoot | Out-Null

function Stop-ExistingBridge {
  if (-not (Test-Path -LiteralPath $pidFile)) { return }
  $records = @(Get-Content -Raw -LiteralPath $pidFile | ConvertFrom-Json)
  foreach ($record in $records) {
    try {
      Stop-Process -Id $record.ProcessId -Force -ErrorAction Stop
    } catch {}
  }
  Remove-Item -LiteralPath $pidFile -Force -ErrorAction SilentlyContinue
}

if ($Action -eq 'stop') {
  Stop-ExistingBridge
  Write-Host 'Stopped host Hikvision VM bridge.'
  exit 0
}

if ($Action -eq 'status') {
  if (Test-Path -LiteralPath $pidFile) {
    Get-Content -Raw -LiteralPath $pidFile
  } else {
    Write-Host 'No active host Hikvision VM bridge.'
  }
  exit 0
}

Stop-ExistingBridge

$targetDeviceIps = @($DeviceIps)
if (-not [string]::IsNullOrWhiteSpace($DeviceIp)) {
  $targetDeviceIps += $DeviceIp
}
$targetDeviceIps = @($targetDeviceIps | ForEach-Object { "$_".Trim() } | Where-Object { $_ } | Select-Object -Unique)
if ($targetDeviceIps.Count -eq 0) {
  throw 'Pass -DeviceIp or -DeviceIps with at least one Hikvision device address.'
}

$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$runRoot = Join-Path $runtimeRoot $stamp
New-Item -ItemType Directory -Force -Path $runRoot | Out-Null

$bridgeScript = @'
param(
  [int]$ListenPort,
  [string]$TargetHost,
  [int]$TargetPort,
  [string]$LogPath
)

$ErrorActionPreference = 'Stop'

$listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Any, $ListenPort)
$listener.Server.NoDelay = $true
$listener.Start()
"START listen=$ListenPort target=$TargetHost`:$TargetPort ts=$([DateTime]::UtcNow.ToString('o'))" | Add-Content -LiteralPath $LogPath

function Start-Pump {
  param(
    [System.IO.Stream]$InputStream,
    [System.IO.Stream]$OutputStream
  )

  $buffer = New-Object byte[] 8192
  try {
    while (($read = $InputStream.Read($buffer, 0, $buffer.Length)) -gt 0) {
      $OutputStream.Write($buffer, 0, $read)
      $OutputStream.Flush()
    }
  } catch {}
  try { $OutputStream.Close() } catch {}
  try { $InputStream.Close() } catch {}
}

while ($true) {
  try {
    $client = $listener.AcceptTcpClient()
    $client.NoDelay = $true
    $remote = [System.Net.Sockets.TcpClient]::new()
    $remote.NoDelay = $true
    $remote.Connect($TargetHost, $TargetPort)
    "CONNECT listen=$ListenPort target=$TargetHost`:$TargetPort ts=$([DateTime]::UtcNow.ToString('o'))" | Add-Content -LiteralPath $LogPath

    $clientStream = $client.GetStream()
    $remoteStream = $remote.GetStream()

    [System.Threading.Tasks.Task]::Run({ param($a,$b) Start-Pump -InputStream $a -OutputStream $b }, @($clientStream, $remoteStream)) | Out-Null
    [System.Threading.Tasks.Task]::Run({ param($a,$b) Start-Pump -InputStream $a -OutputStream $b }, @($remoteStream, $clientStream)) | Out-Null
  } catch {
    "ERROR listen=$ListenPort target=$TargetHost`:$TargetPort error=$($_.Exception.Message) ts=$([DateTime]::UtcNow.ToString('o'))" | Add-Content -LiteralPath $LogPath
    Start-Sleep -Milliseconds 500
  }
}
'@

$bridgeScriptPath = Join-Path $runRoot 'tcp-bridge.ps1'
$bridgeScript | Set-Content -LiteralPath $bridgeScriptPath -Encoding ascii

$bridges = @(
  @{ Name = 'http'; ListenPort = $HttpListenPort; TargetPort = $HttpDevicePort },
  @{ Name = 'sdk'; ListenPort = $SdkListenPort; TargetPort = $SdkDevicePort }
)

$records = @()
for ($deviceIndex = 0; $deviceIndex -lt $targetDeviceIps.Count; $deviceIndex++) {
  $targetDeviceIp = $targetDeviceIps[$deviceIndex]
  $portOffset = $deviceIndex * 100

  foreach ($bridge in $bridges) {
    $listenPort = $bridge.ListenPort + $portOffset
    $safeIp = $targetDeviceIp -replace '[^0-9A-Za-z\-]', '-'
    $logPath = Join-Path $runRoot "$safeIp-$($bridge.Name).log"
    $proc = Start-Process -FilePath 'powershell.exe' `
      -ArgumentList @(
        '-NoProfile',
        '-ExecutionPolicy', 'Bypass',
        '-File', $bridgeScriptPath,
        '-ListenPort', $listenPort,
        '-TargetHost', $targetDeviceIp,
        '-TargetPort', $bridge.TargetPort,
        '-LogPath', $logPath
      ) `
      -WindowStyle Hidden `
      -PassThru

    $records += [pscustomobject]@{
      Name = "$($bridge.Name)-$safeIp"
      DeviceIp = $targetDeviceIp
      ProcessId = $proc.Id
      ListenPort = $listenPort
      TargetHost = $targetDeviceIp
      TargetPort = $bridge.TargetPort
      LogPath = $logPath
    }
  }
}

$records | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath $pidFile -Encoding UTF8
Write-Host "Host Hikvision VM bridge started for $($targetDeviceIps -join ', ')"
$records | Format-Table -AutoSize
