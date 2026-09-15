param(
  [ValidateSet('all', 'http', 'sdk')]
  [string]$Target = 'all',
  [int]$HttpLocalPort = 58080,
  [int]$SdkLocalPort = 58000,
  [string]$HttpHostname = $(if ($env:PROJECT_TRUTH_CF_HIKVISION_HTTP_HOSTNAME) { $env:PROJECT_TRUTH_CF_HIKVISION_HTTP_HOSTNAME } else { 'hikvision-http.bnpi-pats.tech' }),
  [string]$SdkHostname = $(if ($env:PROJECT_TRUTH_CF_HIKVISION_SDK_HOSTNAME) { $env:PROJECT_TRUTH_CF_HIKVISION_SDK_HOSTNAME } else { 'hikvision-sdk.bnpi-pats.tech' }),
  [switch]$StopExisting
)

$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$runtimeRoot = Join-Path $repoRoot '.runtime\cloudflare-hikvision-device-tcp'
$pidFile = Join-Path $runtimeRoot 'bnpi-hikvision-device-access-active.json'
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$runRoot = Join-Path $runtimeRoot "bnpi-hikvision-device-access-$stamp"

function Stop-ExistingForward {
  if (-not (Test-Path -LiteralPath $pidFile)) { return }
  $records = @(Get-Content -Raw -LiteralPath $pidFile | ConvertFrom-Json)
  foreach ($record in $records) {
    try {
      Stop-Process -Id $record.ProcessId -Force -ErrorAction Stop
      Write-Host "Stopped $($record.Target) forward PID $($record.ProcessId)"
    } catch {
      Write-Host "Forward PID $($record.ProcessId) is not running"
    }
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

$cloudflared = Get-Command cloudflared -ErrorAction SilentlyContinue
if (-not $cloudflared) {
  throw 'cloudflared not found. Install cloudflared, then rerun this command.'
}

$targets = @()
if ($Target -in @('all', 'http')) {
  $targets += [pscustomobject]@{
    Target = 'http'
    Hostname = $HttpHostname
    LocalPort = $HttpLocalPort
    LocalUrl = "http://127.0.0.1:$HttpLocalPort"
  }
}
if ($Target -in @('all', 'sdk')) {
  $targets += [pscustomobject]@{
    Target = 'sdk'
    Hostname = $SdkHostname
    LocalPort = $SdkLocalPort
    LocalUrl = "127.0.0.1:$SdkLocalPort"
  }
}

foreach ($targetItem in $targets) {
  if (-not (Test-PortFree -Port $targetItem.LocalPort)) {
    throw "Local port $($targetItem.LocalPort) is already in use for $($targetItem.Target)."
  }
}

New-Item -ItemType Directory -Force -Path $runRoot | Out-Null

$records = @()
foreach ($targetItem in $targets) {
  $stdoutPath = Join-Path $runRoot "$($targetItem.Target).stdout.log"
  $stderrPath = Join-Path $runRoot "$($targetItem.Target).stderr.log"
  $process = Start-Process -FilePath $cloudflared.Source `
    -ArgumentList @('access', 'tcp', '--hostname', $targetItem.Hostname, '--url', "localhost:$($targetItem.LocalPort)") `
    -RedirectStandardOutput $stdoutPath `
    -RedirectStandardError $stderrPath `
    -WindowStyle Hidden `
    -PassThru

  Start-Sleep -Seconds 3
  $listening = [bool](Get-NetTCPConnection -LocalPort $targetItem.LocalPort -State Listen -ErrorAction SilentlyContinue)
  if (-not $listening) {
    $stderrText = Get-Content -Raw -LiteralPath $stderrPath -ErrorAction SilentlyContinue
    throw "Cloudflare Hikvision device forward did not start on localhost:$($targetItem.LocalPort). $stderrText"
  }

  $records += [pscustomobject]@{
    GeneratedAt = (Get-Date).ToString('o')
    Target = $targetItem.Target
    Hostname = $targetItem.Hostname
    LocalPort = $targetItem.LocalPort
    LocalUrl = $targetItem.LocalUrl
    ProcessId = $process.Id
    Stdout = $stdoutPath
    Stderr = $stderrPath
    StopCommand = '.\scripts\project-truth.ps1 start-bnpi-hikvision-device-access -StopExisting'
  }
}

$records | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath (Join-Path $runRoot 'bnpi-hikvision-device-access.json') -Encoding UTF8
$records | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath $pidFile -Encoding UTF8

Write-Host 'BNPI Hikvision device localhost forward(s) running.'
foreach ($record in $records) {
  Write-Host "$($record.Target.ToUpper()) -> $($record.LocalUrl)"
}
Write-Host 'Use your local testing target values:'
Write-Host "  Device HTTP address: 127.0.0.1"
Write-Host "  Device HTTP port: $HttpLocalPort"
Write-Host "  Device SDK host: 127.0.0.1"
Write-Host "  Device SDK port: $SdkLocalPort"
Write-Host 'Stop with: .\scripts\project-truth.ps1 start-bnpi-hikvision-device-access -StopExisting'
Write-Host "Evidence: $(Join-Path $runRoot 'bnpi-hikvision-device-access.json')"
