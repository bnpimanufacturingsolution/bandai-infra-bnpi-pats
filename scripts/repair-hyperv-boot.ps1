param(
  [string]$VhdxPath = "C:\ProgramData\ProjectTruth\images\project-truth-devcurrent-hyperv.vhdx",
  [string]$VmName = "project-truth-devcurrent-hyperv-proof",
  [string]$PreferredSwitch = "ProjectTruth-External",
  [int]$CpuCount = 2,
  [int]$StartupMemoryGB = 4,
  [int]$MaximumMemoryGB = 6,
  [switch]$ForceRecreate,
  [switch]$Start
)

$ErrorActionPreference = "Stop"

function Assert-Admin {
  $principal = [Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()
  if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    throw "Run this from Administrator PowerShell."
  }
}

function Write-Step {
  param([string]$Message)
  Write-Host ("{0} {1}" -f (Get-Date -Format "HH:mm:ss"), $Message)
}

Assert-Admin

if (-not (Get-Module -ListAvailable -Name Hyper-V)) {
  throw "Hyper-V PowerShell module is not available on this machine."
}

if (-not (Test-Path -LiteralPath $VhdxPath)) {
  throw "VHDX not found: $VhdxPath"
}

$resolvedVhdx = (Resolve-Path -LiteralPath $VhdxPath).Path
$extension = [IO.Path]::GetExtension($resolvedVhdx).ToLowerInvariant()
if ($extension -ne ".vhdx") {
  throw "Hyper-V boot repair requires the base .vhdx image. Got: $resolvedVhdx"
}

if ($resolvedVhdx -match "\.avhdx$") {
  throw "Do not boot from an .avhdx checkpoint/differencing disk. Use the base .vhdx instead."
}

$switch = Get-VMSwitch -Name $PreferredSwitch -ErrorAction SilentlyContinue
if (-not $switch) {
  $switch = Get-VMSwitch -Name "Default Switch" -ErrorAction SilentlyContinue
}
if (-not $switch) {
  $switch = Get-VMSwitch | Select-Object -First 1
}
if (-not $switch) {
  throw "No Hyper-V switch found. Create an External or Default Switch first."
}

$existing = Get-VM -Name $VmName -ErrorAction SilentlyContinue
if ($existing -and -not $ForceRecreate) {
  throw "VM already exists: $VmName. Rerun with -ForceRecreate to replace the VM definition."
}

if ($existing) {
  Write-Step "Removing existing VM $VmName"
  if ($existing.State -ne "Off") {
    Stop-VM -Name $VmName -TurnOff -Force
  }
  Remove-VM -Name $VmName -Force
}

$startupBytes = [int64]$StartupMemoryGB * 1GB
$maximumBytes = [int64]$MaximumMemoryGB * 1GB

Write-Step "Creating Gen 2 VM $VmName from $resolvedVhdx"
New-VM -Name $VmName -Generation 2 -MemoryStartupBytes $startupBytes -VHDPath $resolvedVhdx -SwitchName $switch.Name | Out-Null

Set-VMProcessor -VMName $VmName -Count $CpuCount
Set-VMMemory -VMName $VmName -DynamicMemoryEnabled $true -MinimumBytes 2GB -StartupBytes $startupBytes -MaximumBytes $maximumBytes
Set-VMFirmware -VMName $VmName -EnableSecureBoot Off
Set-VM -Name $VmName -AutomaticCheckpointsEnabled $false -CheckpointType Disabled

$disk = Get-VMHardDiskDrive -VMName $VmName | Select-Object -First 1
Set-VMFirmware -VMName $VmName -FirstBootDevice $disk

Write-Step "Boot settings"
Get-VM -Name $VmName | Select-Object Name, Generation, State, ProcessorCount, DynamicMemoryEnabled | Format-Table -AutoSize
Get-VMFirmware -VMName $VmName | Select-Object VMName, SecureBoot, PreferredNetworkBootProtocol, ConsoleMode | Format-List
Get-VMHardDiskDrive -VMName $VmName | Select-Object VMName, ControllerType, ControllerNumber, ControllerLocation, Path | Format-List
Get-VMNetworkAdapter -VMName $VmName | Select-Object VMName, SwitchName, MacAddress | Format-List

if ($Start) {
  Write-Step "Starting $VmName"
  Start-VM -Name $VmName
  Start-Sleep -Seconds 10
  Get-VM -Name $VmName | Select-Object Name, State, CPUUsage, MemoryAssigned, Uptime | Format-Table -AutoSize
  Get-VMNetworkAdapter -VMName $VmName | Select-Object VMName, SwitchName, MacAddress, IPAddresses | Format-List
}

Write-Host ""
Write-Host "Done. Open the VM console. A healthy boot should continue past GRUB/initrd to the Ubuntu login prompt."
