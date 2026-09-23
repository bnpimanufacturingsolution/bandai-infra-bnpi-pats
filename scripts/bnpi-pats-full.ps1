param(
  [string]$VmName = "bnpi-pats",
  [string]$SwitchName = "ProjectTruth-External",
  [int]$MemoryMb = 2048,
  [int]$CpuCount = 2,
  [string]$BaseDir = "C:\ProgramData\BnpiPats",
  [string]$VhdxName = "project-truth-node-latest.vhdx",
  [string]$TunnelJson = "",
  [string]$SshKey = (Join-Path $env:USERPROFILE ".ssh\node-health-appliance_ed25519"),
  [switch]$SelfTest,
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
  throw "Run this script in an elevated PowerShell (Run as Administrator)."
}

$imagesDir = Join-Path $BaseDir "images"
$vhdxPath = Join-Path $imagesDir $VhdxName

if (-not (Test-Path -LiteralPath $vhdxPath)) {
  Write-Step "No VHDX at $vhdxPath. LEG 1: baking image (hours)."
  & "$PSScriptRoot\build-image.ps1" -TargetPlatform hyperv -SwitchName $SwitchName -ImagesDir $imagesDir -VmName $VmName -MemoryMb $MemoryMb -CpuCount $CpuCount
  if ($LASTEXITCODE -ne 0) { throw "build-image failed with exit code $LASTEXITCODE" }
} else {
  Write-Step "VHDX already present, skipping bake: $vhdxPath"
}

if ($SelfTest) {
  $testVm = "$VmName-test"
  Write-Step "LEG 2: self-test boot + finalize."
  & "$PSScriptRoot\vhdx-autopilot.ps1" -Mode SelfTestHyperV -VhdxPath $vhdxPath -VmName $testVm
  if ($LASTEXITCODE -ne 0) { throw "self-test failed with exit code $LASTEXITCODE" }
  & "$PSScriptRoot\finalize-local-vhdx.ps1" -VmName $testVm -ImagesDir $imagesDir -FinalImageName $VhdxName -StopVm -Force
  if ($LASTEXITCODE -ne 0) { throw "finalize failed with exit code $LASTEXITCODE" }
}

Write-Step "LEG 3: birthing VM $VmName."
& "$PSScriptRoot\bnpi-pats-vm.ps1" -VhdxPath $vhdxPath -VmName $VmName -SwitchName $SwitchName -MemoryMb $MemoryMb -CpuCount $CpuCount -BaseDir $BaseDir
if ($LASTEXITCODE -ne 0) { throw "bnpi-pats-vm failed with exit code $LASTEXITCODE" }

if ($WithPublic) {
  if ([string]::IsNullOrWhiteSpace($TunnelJson) -or -not (Test-Path -LiteralPath $TunnelJson)) {
    throw "WithPublic needs -TunnelJson pointing at the 12e89b6a credential JSON on this host."
  }
  if (-not (Test-Path -LiteralPath $SshKey)) {
    throw "SSH key not found: $SshKey. Copy the existing infra key to this host first."
  }
  $ip = Get-VMNetworkAdapter -VMName $VmName -ErrorAction Stop |
    Select-Object -ExpandProperty IPAddresses -ErrorAction SilentlyContinue |
    Where-Object { $_ -match "^\d+\.\d+\.\d+\.\d+$" -and $_ -notlike "169.254.*" } |
    Select-Object -First 1
  if (-not $ip) { throw "No guest IP for VM $VmName yet. Rerun with -WithPublic once it boots." }
  $leaf = Split-Path -Leaf $TunnelJson
  Write-Step "LEG 4: importing tunnel credential into the VM."
  & scp.exe -i $SshKey -o StrictHostKeyChecking=accept-new $TunnelJson "infra@${ip}:/tmp/$leaf"
  if ($LASTEXITCODE -ne 0) { throw "scp credential failed with exit code $LASTEXITCODE" }
  & ssh.exe -i $SshKey -o StrictHostKeyChecking=accept-new "infra@$ip" "sudo project-truth-cloudflare-vm-tunnel /tmp/$leaf; rm -f /tmp/$leaf; systemctl is-active cloudflared-bnpi-pats.service"
  if ($LASTEXITCODE -ne 0) { throw "VM tunnel import failed with exit code $LASTEXITCODE" }
  Write-Step "LEG 5: host tunnel + DNS + public verify."
  & "$PSScriptRoot\ensure-bnpi-cloudflare-host.ps1" -ProvisionDns -StartTunnel -VerifyPublic
  if ($LASTEXITCODE -ne 0) { throw "Cloudflare host step failed with exit code $LASTEXITCODE" }
}

Write-Host ""
Write-Host "DONE. VM $VmName is up from $vhdxPath."
if (-not $WithPublic) {
  Write-Host "Rerun with -WithPublic -TunnelJson <12e89b6a.json> once the credential is on this host."
}
