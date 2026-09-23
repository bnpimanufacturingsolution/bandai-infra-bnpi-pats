param(
  [Parameter(Mandatory = $true)]
  [string]$VhdxPath,
  [string]$VmName = "bnpi-pats",
  [string]$SwitchName = "ProjectTruth-External",
  [int]$MemoryMb = 2048,
  [int]$CpuCount = 2,
  [string]$BaseDir = "C:\ProgramData\ProjectTruth",
  [string]$GuestIp = "",
  [int]$IpWaitSeconds = 600,
  [int]$IpPollSeconds = 10,
  [switch]$WithPublic
)

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent $PSScriptRoot

function Write-Step {
  param([string]$Message)
  Write-Host ("{0} {1}" -f (Get-Date -Format "HH:mm:ss"), $Message)
}

function Test-Admin {
  $p = [Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()
  return $p.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

if (-not (Test-Admin)) {
  throw "Run this script in an elevated PowerShell (Run as Administrator). Hyper-V + Terraform need admin."
}

foreach ($cmd in @("Get-VM", "Get-VMNetworkAdapter", "Get-VHD")) {
  if (-not (Get-Command $cmd -ErrorAction SilentlyContinue)) {
    throw "Hyper-V PowerShell cmdlets missing ($cmd). Enable Hyper-V Management Tools on this server first."
  }
}
if (-not (Get-Command terraform -ErrorAction SilentlyContinue)) {
  throw "terraform not found in PATH. Install Terraform on this server first."
}

$resolved = (Resolve-Path -LiteralPath $VhdxPath -ErrorAction Stop).Path
if ([IO.Path]::GetExtension($resolved).ToLowerInvariant() -ne ".vhdx") {
  throw "VHDX path must end with .vhdx. Got: $resolved"
}
Write-Step "Using VHDX: $resolved"

$vmPath = Join-Path $BaseDir "HyperV"
$hostConfigPath = Join-Path $BaseDir "config\image.json"
foreach ($dir in @($vmPath, (Join-Path $BaseDir "images"), (Join-Path $BaseDir "logs"), (Join-Path $BaseDir "secrets\cloudflared"), (Split-Path -Parent $hostConfigPath))) {
  New-Item -ItemType Directory -Force -Path $dir | Out-Null
}
Write-Step "Base layout ready under $BaseDir (HyperV, images, logs, secrets\cloudflared, config)"

$shaFile = "$resolved.sha256"
if (Test-Path -LiteralPath $shaFile) {
  $first = ((Get-Content -LiteralPath $shaFile -TotalCount 1) -split "\s+")[0].Trim().ToLowerInvariant()
  $actual = (Get-FileHash -LiteralPath $resolved -Algorithm SHA256).Hash.ToLowerInvariant()
  if ($first -ne $actual) {
    throw "SHA256 mismatch. sidecar=$first actual=$actual file=$shaFile"
  }
  Write-Step "SHA256 verified: $actual"
} else {
  Write-Warning "No .sha256 sidecar found at $shaFile. Continuing without checksum proof."
}

Write-Step "Selecting image (host config only, no VM change yet)"
& "$PSScriptRoot\select-image.ps1" -ImagePath $resolved -TargetPlatform hyperv -ConfigPath $hostConfigPath
if ($LASTEXITCODE -ne 0) { throw "select-image failed with exit code $LASTEXITCODE" }

$tfvars = Join-Path $repoRoot "terraform-hyperv\terraform.tfvars"
$example = Join-Path $repoRoot "terraform-hyperv\terraform.tfvars.example"
if (-not (Test-Path -LiteralPath $tfvars)) {
  if (-not (Test-Path -LiteralPath $example)) { throw "Missing both $tfvars and $example" }
  Write-Step "Creating $tfvars from example"
  Copy-Item -LiteralPath $example -Destination $tfvars -Force
}

$content = Get-Content -LiteralPath $tfvars -Raw
$escapedVhdx = $resolved.Replace("\", "\\")
$escapedVmPath = $vmPath.Replace("\", "\\")
$content = $content -replace '(?m)^\s*vm_name\s*=.*$', ('vm_name           = "{0}"' -f $VmName)
$content = $content -replace '(?m)^\s*switch_name\s*=.*$', ('switch_name       = "{0}"' -f $SwitchName)
$content = $content -replace '(?m)^\s*source_image_path\s*=.*$', ('source_image_path = "{0}"' -f $escapedVhdx)
$content = $content -replace '(?m)^\s*vm_path\s*=.*$', ('vm_path           = "{0}"' -f $escapedVmPath)
$content = $content -replace '(?m)^\s*memory_mb\s*=.*$', ('memory_mb         = {0}' -f $MemoryMb)
$content = $content -replace '(?m)^\s*cpu_count\s*=.*$', ('cpu_count         = {0}' -f $CpuCount)
Set-Content -LiteralPath $tfvars -Value $content -Encoding ASCII
Write-Step "Terraform vars pinned: vm=$VmName switch=$SwitchName mem=${MemoryMb}MB cpu=$CpuCount path=$vmPath"

Write-Step "terraform-plan (fmt/init/validate/plan)"
& "$PSScriptRoot\terraform-plan.ps1"
if ($LASTEXITCODE -ne 0) { throw "terraform-plan failed with exit code $LASTEXITCODE" }

Write-Step "terraform-apply -Apply (creates switch + copies disk + starts Gen2 VM)"
& "$PSScriptRoot\terraform-apply.ps1" -Apply
if ($LASTEXITCODE -ne 0) { throw "terraform-apply failed with exit code $LASTEXITCODE" }

$targetIp = $GuestIp.Trim()
if ([string]::IsNullOrWhiteSpace($targetIp)) {
  Write-Step "Waiting for guest IP from Hyper-V KVP (up to ${IpWaitSeconds}s)"
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
