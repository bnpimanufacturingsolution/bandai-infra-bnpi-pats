param(
  [Parameter(Mandatory = $true)]
  [string]$VhdxPath,
  [string]$VmName = "bnpi-pats",
  [string]$SwitchName = "ProjectTruth-External",
  [int]$MemoryMb = 2048,
  [int]$CpuCount = 2,
  [string]$BaseDir = "C:\ProgramData\BandaiApp\Bnpipats",
  [string]$GuestIp = "",
  [int]$IpWaitSeconds = 600,
  [int]$IpPollSeconds = 10,
  [switch]$WithPublic
)

$ErrorActionPreference = "Stop"

function Write-Step {
  param([string]$Message)
  Write-Host ("{0} {1}" -f (Get-Date -Format "HH:mm:ss"), $Message)
}

function Test-Admin {
  $p = [Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()
  return $p.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

if (-not (Test-Admin)) {
  throw "Run this script in an elevated PowerShell (Run as Administrator). Hyper-V operations need admin."
}

foreach ($cmd in @("Get-VM", "Get-VMNetworkAdapter", "Get-VMSwitch")) {
  if (-not (Get-Command $cmd -ErrorAction SilentlyContinue)) {
    throw "Hyper-V PowerShell cmdlets missing ($cmd). Enable Hyper-V Management Tools on this server first."
  }
}

$resolved = (Resolve-Path -LiteralPath $VhdxPath -ErrorAction Stop).Path
if ([IO.Path]::GetExtension($resolved).ToLowerInvariant() -ne ".vhdx") {
  throw "VHDX path must end with .vhdx. Got: $resolved"
}
Write-Step "Using VHDX: $resolved"

$vmPath = Join-Path $BaseDir "HyperV"
$imageConfigPath = Join-Path $BaseDir "config\image.json"
$projectConfigPath = Join-Path $BaseDir "config\project-truth.json"
foreach ($dir in @($vmPath, (Join-Path $BaseDir "images"), (Join-Path $BaseDir "logs"), (Join-Path $BaseDir "secrets\cloudflared"), (Split-Path -Parent $imageConfigPath))) {
  New-Item -ItemType Directory -Force -Path $dir | Out-Null
}
Write-Step "Base layout ready under $BaseDir"

$expectedSha256 = ''
$shaFile = "$resolved.sha256"
if (Test-Path -LiteralPath $shaFile) {
  $expectedSha256 = ((Get-Content -LiteralPath $shaFile -TotalCount 1) -split "\s+")[0].Trim().ToLowerInvariant()
  $actualSha256 = (Get-FileHash -LiteralPath $resolved -Algorithm SHA256).Hash.ToLowerInvariant()
  if ($expectedSha256 -ne $actualSha256) {
    throw "SHA256 mismatch. sidecar=$expectedSha256 actual=$actualSha256 file=$shaFile"
  }
  Write-Step "SHA256 verified: $actualSha256"
} else {
  Write-Warning "No .sha256 sidecar found at $shaFile. Continuing without checksum proof."
}

Write-Step "Selecting image (host config only, no VM change yet)"
& "$PSScriptRoot\select-image.ps1" -ImagePath $resolved -ExpectedSha256 $expectedSha256 -TargetPlatform hyperv -ConfigPath $imageConfigPath
if ($LASTEXITCODE -ne 0) { throw "select-image failed with exit code $LASTEXITCODE" }

$startupMemoryGB = [Math]::Max(1, [int][Math]::Ceiling($MemoryMb / 1024.0))
$minimumMemoryGB = [Math]::Max(1, [int][Math]::Floor($MemoryMb / 2048.0))
$maximumMemoryGB = [Math]::Max($startupMemoryGB + 2, 3)
$pollCount = [Math]::Max(1, [int][Math]::Ceiling($IpWaitSeconds / [Math]::Max(1, $IpPollSeconds)))

Write-Step "Direct Hyper-V import: vm=$VmName switch=$SwitchName mem=${MemoryMb}MB cpu=$CpuCount"
$autopilotArgs = @(
  '-Mode', 'Import',
  '-VhdxPath', $resolved,
  '-VmName', $VmName,
  '-PreferredSwitch', $SwitchName,
  '-RequireExternalSwitch',
  '-CpuCount', $CpuCount,
  '-StartupMemoryGB', $startupMemoryGB,
  '-MinimumMemoryGB', $minimumMemoryGB,
  '-MaximumMemoryGB', $maximumMemoryGB,
  '-PollSeconds', $IpPollSeconds,
  '-PollCount', $pollCount
)
& "$PSScriptRoot\vhdx-autopilot.ps1" @autopilotArgs
if ($LASTEXITCODE -ne 0) { throw "vhdx-autopilot failed with exit code $LASTEXITCODE" }

$targetIp = $GuestIp.Trim()
if ([string]::IsNullOrWhiteSpace($targetIp)) {
  Write-Step "Reading guest IP from Hyper-V (up to ${IpWaitSeconds}s)"
  $deadline = (Get-Date).AddSeconds($IpWaitSeconds)
  while ((Get-Date) -lt $deadline -and [string]::IsNullOrWhiteSpace($targetIp)) {
    try {
      $ips = Get-VMNetworkAdapter -VMName $VmName -ErrorAction Stop |
        Select-Object -ExpandProperty IPAddresses -ErrorAction SilentlyContinue
      $v4 = @($ips | Where-Object { $_ -match "^\d+\.\d+\.\d+\.\d+$" -and $_ -notlike "169.254.*" })
      if ($v4.Count -gt 0) { $targetIp = $v4[0] }
    } catch { }
    if ([string]::IsNullOrWhiteSpace($targetIp)) { Start-Sleep -Seconds $IpPollSeconds }
  }
}
if ([string]::IsNullOrWhiteSpace($targetIp)) {
  throw "No guest IP appeared for VM $VmName. Check with: Get-VMNetworkAdapter -VMName $VmName"
}
Write-Step "Guest IP: $targetIp"

Write-Step "Writing direct Hyper-V host configuration"
& "$PSScriptRoot\configure.ps1" `
  -ConfigPath $projectConfigPath `
  -ImagePath $resolved `
  -ExpectedSha256 $expectedSha256 `
  -TargetPlatform hyperv `
  -VmName $VmName `
  -SwitchName $SwitchName `
  -VmPath $vmPath `
  -CpuCount $CpuCount `
  -MemoryMb $MemoryMb `
  -GuestIpHint $targetIp
if ($LASTEXITCODE -ne 0) { throw "configure failed with exit code $LASTEXITCODE" }

Write-Step "watch-until-healthy -GuestIp $targetIp"
& "$PSScriptRoot\watch-until-healthy.ps1" -GuestIp $targetIp
if ($LASTEXITCODE -ne 0) { throw "watch-until-healthy failed with exit code $LASTEXITCODE" }

if ($WithPublic) {
  Write-Step "ensure-bnpi-cloudflare-host -ProvisionDns -StartTunnel -VerifyPublic"
  & "$PSScriptRoot\ensure-bnpi-cloudflare-host.ps1" -ProvisionDns -StartTunnel -VerifyPublic
  if ($LASTEXITCODE -ne 0) { throw "Cloudflare host step failed with exit code $LASTEXITCODE" }
}

Write-Host ""
Write-Host "DONE. New VM: $VmName @ $targetIp"
Write-Host "LAN PROD: http://${targetIp}:3000/auth/login + http://${targetIp}:3001/health"
Write-Host "LAN DEV:  http://${targetIp}:3100/auth/login + http://${targetIp}:3101/health"
Write-Host "LAN UAT:  http://${targetIp}:3200/auth/login + http://${targetIp}:3201/health"
Write-Host "SSH: ssh -i %USERPROFILE%\.ssh\node-health-appliance_ed25519 infra@$targetIp"
if (-not $WithPublic) {
  Write-Host "Public: rerun with -WithPublic after the tunnel credential is on this host."
}
