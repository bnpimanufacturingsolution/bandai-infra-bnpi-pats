param(
  [ValidateSet('start', 'stop', 'status')]
  [string]$Action = 'start',
  [string]$DeviceIp = '192.168.254.194',
  [string]$VmSshTarget = 'project-truth-hris',
  [string]$DeviceUsername = 'admin',
  [string]$DevicePassword = '',
  [int]$HttpPort = 80,
  [int]$SdkPort = 8000,
  [int]$VmHttpLocalPort = 58080,
  [int]$VmSdkLocalPort = 58000,
  [string]$SdkRoot = '/home/infra/project-truth-hcnetsdk/EN-HCNetSDKV6.1.9.48_build20230410_linux64'
)

$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$runtimeRoot = Join-Path $repoRoot '.runtime\hikvision-vm-cloudflare-bridge'
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$runRoot = Join-Path $runtimeRoot $stamp
$stateFile = Join-Path $runtimeRoot 'active-bridge.json'
New-Item -ItemType Directory -Force -Path $runRoot | Out-Null

function Stop-VmConsumers {
  param([string]$SshTarget)
  $script = @'
pkill -f "cloudflared access tcp --hostname .*trycloudflare.com --url localhost:58080" || true
pkill -f "cloudflared access tcp --hostname .*trycloudflare.com --url localhost:58000" || true
'@
  $script | ssh $SshTarget 'bash -s' | Out-Null
}

if ($Action -eq 'stop') {
  try { & powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'start-cloudflare-hikvision-device-tcp.ps1') -StopExisting } catch {}
  try { Stop-VmConsumers -SshTarget $VmSshTarget } catch {}
  if (Test-Path -LiteralPath $stateFile) { Remove-Item -LiteralPath $stateFile -Force }
  Write-Host 'Stopped Hikvision VM Cloudflare bridge.'
  exit 0
}

if ($Action -eq 'status') {
  if (Test-Path -LiteralPath $stateFile) {
    Get-Content -Raw -LiteralPath $stateFile
  } else {
    Write-Host 'No active Hikvision VM Cloudflare bridge.'
  }
  exit 0
}

if ([string]::IsNullOrWhiteSpace($DevicePassword)) {
  throw 'Pass -DevicePassword so the bridge can verify both HTTP and SDK from the VM.'
}

& powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'start-cloudflare-hikvision-device-tcp.ps1') -StopExisting
& powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'start-cloudflare-hikvision-device-tcp.ps1') -DeviceIp $DeviceIp -HttpPort $HttpPort -SdkPort $SdkPort

$activeTcp = Get-Content -Raw -LiteralPath (Join-Path $repoRoot '.runtime\cloudflare-hikvision-device-tcp\active-pids.json') | ConvertFrom-Json
$latestRun = Get-ChildItem (Join-Path $repoRoot '.runtime\cloudflare-hikvision-device-tcp') -Directory | Sort-Object LastWriteTime -Descending | Select-Object -First 1
if (-not $latestRun) {
  throw 'Could not locate Cloudflare Hikvision device TCP evidence directory.'
}

$httpHost = ((Get-Content -LiteralPath (Join-Path $latestRun.FullName 'hikvision-http.stderr.log')) | Select-String 'https://.*trycloudflare.com').Matches.Value | Select-Object -First 1
$sdkHost = ((Get-Content -LiteralPath (Join-Path $latestRun.FullName 'hikvision-sdk.stderr.log')) | Select-String 'https://.*trycloudflare.com').Matches.Value | Select-Object -First 1
if (-not $httpHost -or -not $sdkHost) {
  throw 'Could not extract trycloudflare hostnames from the host-side Hikvision TCP logs.'
}

$httpHostname = ([Uri]$httpHost).Host
$sdkHostname = ([Uri]$sdkHost).Host

Stop-VmConsumers -SshTarget $VmSshTarget

$vmScript = @"
set -e
nohup cloudflared access tcp --hostname $httpHostname --url localhost:$VmHttpLocalPort >/tmp/hik-http-access-try.log 2>&1 &
nohup cloudflared access tcp --hostname $sdkHostname --url localhost:$VmSdkLocalPort >/tmp/hik-sdk-access-try.log 2>&1 &
sleep 6
ss -ltnp | grep -E '$VmHttpLocalPort|$VmSdkLocalPort' || true
curl -sS --digest -u '${DeviceUsername}:${DevicePassword}' --max-time 15 'http://127.0.0.1:$VmHttpLocalPort/ISAPI/Security/userCheck' >/tmp/hik-usercheck.xml
cd /tmp/project-truth-hikvision-sdk-matrix
LD_LIBRARY_PATH='${SdkRoot}/lib:${SdkRoot}:${SdkRoot}/HCNetSDKCom' ./hikvision_login_probe 127.0.0.1 $VmSdkLocalPort $DeviceUsername '$DevicePassword' 0 0 0 >/tmp/hik-sdk-login.txt 2>&1
cat /tmp/hik-usercheck.xml
echo '---SDK---'
cat /tmp/hik-sdk-login.txt
"@

$vmOutput = $vmScript | ssh $VmSshTarget 'bash -s'
$vmOutput | Set-Content -LiteralPath (Join-Path $runRoot 'vm-bridge-proof.txt') -Encoding UTF8

$state = [pscustomobject]@{
  generatedAt = (Get-Date).ToString('o')
  deviceIp = $DeviceIp
  vmSshTarget = $VmSshTarget
  httpHostname = $httpHostname
  sdkHostname = $sdkHostname
  vmHttpLocalPort = $VmHttpLocalPort
  vmSdkLocalPort = $VmSdkLocalPort
  runtimeConfigHint = @{
    hikvisionRuntimeAddress = '127.0.0.1'
    hikvisionRuntimePort = $VmHttpLocalPort
    hikvisionRuntimeProtocol = 'http'
    hikvisionSdkRuntimeAddress = '127.0.0.1'
    hikvisionSdkRuntimePort = $VmSdkLocalPort
  }
  evidenceDir = $runRoot
} | ConvertTo-Json -Depth 6

$state | Set-Content -LiteralPath $stateFile -Encoding UTF8
Write-Host 'Hikvision VM Cloudflare bridge is working.'
Write-Host "Evidence: $runRoot"
Write-Host $state
