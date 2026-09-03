param(
  [string]$DeviceIp = '',
  [int]$HttpPort = 80,
  [int]$SdkPort = 8000,
  [string]$HttpHostname = $(if ($env:PROJECT_TRUTH_CF_HIKVISION_HTTP_HOSTNAME) { $env:PROJECT_TRUTH_CF_HIKVISION_HTTP_HOSTNAME } else { 'hikvision-http.bnpi-hris.tech' }),
  [string]$SdkHostname = $(if ($env:PROJECT_TRUTH_CF_HIKVISION_SDK_HOSTNAME) { $env:PROJECT_TRUTH_CF_HIKVISION_SDK_HOSTNAME } else { 'hikvision-sdk.bnpi-hris.tech' }),
  [int]$StartupTimeoutSeconds = 10,
  [switch]$StopExisting
)

$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$runtimeRoot = Join-Path $repoRoot '.runtime\cloudflare-hikvision-device-tcp'
$pidFile = Join-Path $runtimeRoot 'active-pids.json'
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$runRoot = Join-Path $runtimeRoot $stamp

function Stop-ActiveTcpTunnels {
  if (-not (Test-Path -LiteralPath $pidFile)) { return }
  $active = Get-Content -Raw -LiteralPath $pidFile | ConvertFrom-Json
  foreach ($item in @($active)) {
    try {
      $process = Get-Process -Id $item.ProcessId -ErrorAction Stop
      Stop-Process -Id $process.Id -Force
      Write-Host "Stopped $($item.Name) cloudflared PID $($process.Id)"
    } catch {
      Write-Host "PID $($item.ProcessId) for $($item.Name) is not running"
    }
  }
  Remove-Item -LiteralPath $pidFile -Force -ErrorAction SilentlyContinue
}

if ($StopExisting) {
  Stop-ActiveTcpTunnels
  if ($PSBoundParameters.Count -eq 1) { return }
}

if ([string]::IsNullOrWhiteSpace($DeviceIp)) {
  throw 'Pass -DeviceIp <hikvision-device-ip>. This helper publishes only the device TCP ports, not the HRIS app/API.'
}

$cloudflared = Get-Command cloudflared -ErrorAction SilentlyContinue
if (-not $cloudflared) {
  throw 'cloudflared not found in PATH. Install cloudflared and authenticate with Cloudflare Access/Tunnel first.'
}

New-Item -ItemType Directory -Force -Path $runRoot | Out-Null

$targets = @(
  [pscustomobject]@{
    Name = 'hikvision-http'
    Hostname = $HttpHostname
    TargetUrl = "tcp://${DeviceIp}:$HttpPort"
  },
  [pscustomobject]@{
    Name = 'hikvision-sdk'
    Hostname = $SdkHostname
    TargetUrl = "tcp://${DeviceIp}:$SdkPort"
  }
)

$missing = @($targets | Where-Object { [string]::IsNullOrWhiteSpace($_.Hostname) })
if ($missing.Count -gt 0) {
  throw 'Hikvision Cloudflare TCP hostnames are missing. Set PROJECT_TRUTH_CF_HIKVISION_HTTP_HOSTNAME and PROJECT_TRUTH_CF_HIKVISION_SDK_HOSTNAME or pass parameters.'
}

$processRecords = @()

foreach ($target in $targets) {
  $stdoutPath = Join-Path $runRoot "$($target.Name).stdout.log"
  $stderrPath = Join-Path $runRoot "$($target.Name).stderr.log"
  $process = Start-Process -FilePath $cloudflared.Source `
    -ArgumentList @('tunnel', '--no-autoupdate', '--hostname', $target.Hostname, '--url', $target.TargetUrl) `
    -RedirectStandardOutput $stdoutPath `
    -RedirectStandardError $stderrPath `
    -WindowStyle Hidden `
    -PassThru

  Start-Sleep -Seconds $StartupTimeoutSeconds
  $stderrText = Get-Content -Raw -LiteralPath $stderrPath -ErrorAction SilentlyContinue
  if (-not (Get-Process -Id $process.Id -ErrorAction SilentlyContinue)) {
    throw "Cloudflare Hikvision device TCP tunnel failed for $($target.Name). $stderrText"
  }

  $processRecords += [pscustomobject]@{
    Name = $target.Name
    ProcessId = $process.Id
    Hostname = $target.Hostname
    TargetUrl = $target.TargetUrl
    ClientCommand = if ($target.Name -eq 'hikvision-http') {
      "cloudflared access tcp --hostname $($target.Hostname) --url localhost:58080"
    } else {
      "cloudflared access tcp --hostname $($target.Hostname) --url localhost:58000"
    }
    RequestedDirectUrlStatus = 'Direct public raw TCP is not created for normal Cloudflare Access TCP. Use the client-side cloudflared access tcp forward on the localhost machine.'
  }
}

$processRecords | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath $pidFile -Encoding utf8
$processRecords | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath (Join-Path $runRoot 'cloudflare-hikvision-device-tcp.json') -Encoding utf8

Write-Host "Cloudflare Hikvision device TCP tunnel processes started."
Write-Host "Device IP: $DeviceIp"
Write-Host "Evidence: $runRoot"
$processRecords | Format-Table -AutoSize
Write-Host ''
Write-Host 'Run these on the localhost machine that needs device access:'
foreach ($record in $processRecords) {
  Write-Host "  $($record.ClientCommand)"
}
Write-Host ''
Write-Host 'Then point your local testing at:'
Write-Host '  HTTP/ISAPI -> http://127.0.0.1:58080'
Write-Host '  HCNetSDK    -> 127.0.0.1:58000'
