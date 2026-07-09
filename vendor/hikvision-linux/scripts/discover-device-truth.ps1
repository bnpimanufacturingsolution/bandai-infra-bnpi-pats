param(
  [string]$VmHost = "10.184.37.19",
  [string]$VmUser = "infra",
  [string]$SshKey = "$env:USERPROFILE\.ssh\node-health-appliance_ed25519",
  [string]$DeviceHost = "10.184.37.139",
  [int]$HttpPort = 80,
  [int]$SdkPort = 8000,
  [string]$Username = $env:HIKVISION_USERNAME,
  [string]$Password = $env:HIKVISION_PASSWORD,
  [int]$Loops = 12,
  [int]$IntervalSeconds = 5,
  [string]$RemoteDir = "/tmp/project-truth-hikvision-linux"
)

$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..\..")
$localVendor = Join-Path $repoRoot "vendor\hikvision-linux"
$sshTarget = "$VmUser@$VmHost"
$sshBase = @(
  "-i", $SshKey,
  "-o", "BatchMode=yes",
  "-o", "ConnectTimeout=8",
  "-o", "StrictHostKeyChecking=no"
)

Write-Host "Project Truth Hikvision device-source discovery"
Write-Host "VM: $sshTarget"
Write-Host "Device: $DeviceHost"
Write-Host "Scope: vendor/device only; no HRIS DB/API reads"

ssh @sshBase $sshTarget "rm -rf '$RemoteDir' && mkdir -p '$RemoteDir'"
scp @sshBase -r (Join-Path $localVendor "*") "${sshTarget}:$RemoteDir/"

$setup = "cd '$RemoteDir' && python3 -m venv .venv && . .venv/bin/activate && python -m pip install -r requirements.txt >/tmp/project-truth-hikvision-pip.log && python -m unittest discover -s tests"
ssh @sshBase $sshTarget $setup

$targetHttp = "Bandai Hikvision ISAPI=${DeviceHost}:${HttpPort}:http"
$targetSdk = "Bandai Hikvision SDK=${DeviceHost}:${SdkPort}:tcp"
$tcp = "cd '$RemoteDir' && . .venv/bin/activate && python -m hikvision_linux_probe --mode tcp --timeout 8 --target '$targetHttp' --target '$targetSdk'"
ssh @sshBase $sshTarget $tcp

if ([string]::IsNullOrWhiteSpace($Username) -or [string]::IsNullOrWhiteSpace($Password)) {
  Write-Host "HIKVISION_USERNAME/HIKVISION_PASSWORD is not set. Skipping credentialed ISAPI/ACS event discovery."
  Write-Host "Set `$env:HIKVISION_USERNAME and `$env:HIKVISION_PASSWORD, then rerun this script while you tap the device."
  exit 0
}

$escapedPassword = $Password.Replace("'", "'\''")
$isapi = "cd '$RemoteDir' && . .venv/bin/activate && HIKVISION_USERNAME='$Username' HIKVISION_PASSWORD='$escapedPassword' python -m hikvision_linux_probe --mode isapi-time --timeout 10 --target '$targetHttp'"
ssh @sshBase $sshTarget $isapi

$watch = "cd '$RemoteDir' && . .venv/bin/activate && HIKVISION_USERNAME='$Username' HIKVISION_PASSWORD='$escapedPassword' python -m hikvision_linux_probe --mode watch --timeout 10 --target '$targetHttp' --lookback-minutes 10 --loops $Loops --interval $IntervalSeconds --limit 30 --sample-limit 10"
ssh @sshBase $sshTarget $watch
