param(
  [string]$ImagePath = "$env:ProgramData\ProjectTruth\images\project-truth-node-latest.vdi",
  [string]$VmName = 'project-truth-node-01',
  [string]$BridgeAdapterName = '',
  [int]$MemoryMb = 4096,
  [int]$CpuCount = 1,
  [switch]$Start
)

$ErrorActionPreference = 'Stop'

if (-not (Get-Command VBoxManage -ErrorAction SilentlyContinue)) {
  $defaultVBoxManage = Join-Path $env:ProgramFiles 'Oracle\VirtualBox\VBoxManage.exe'
  if (Test-Path -LiteralPath $defaultVBoxManage) {
    $env:Path = "$(Split-Path -Parent $defaultVBoxManage);$env:Path"
  }
}

if (-not (Get-Command VBoxManage -ErrorAction SilentlyContinue)) {
  throw 'VBoxManage not found in PATH. Install Oracle VirtualBox before configuring the Project Truth VM.'
}

if (-not (Test-Path -LiteralPath $ImagePath)) {
  throw "VirtualBox image not found: $ImagePath"
}

$resolvedImagePath = (Resolve-Path -LiteralPath $ImagePath).Path
$extension = [IO.Path]::GetExtension($resolvedImagePath).ToLowerInvariant()
if ($extension -notin @('.vdi', '.vmdk')) {
  throw "VirtualBox VM image must be .vdi or .vmdk. Got: $resolvedImagePath"
}

& "$PSScriptRoot\normalize-image-acl.ps1" -ImagePath $resolvedImagePath

function Get-BridgeAdapterName {
  $interfaces = & VBoxManage list bridgedifs
  $currentName = ''
  foreach ($line in $interfaces) {
    if ($line -match '^Name:\s+(.+)$') {
      $currentName = $Matches[1].Trim()
    } elseif ($line -match '^Status:\s+Up$' -and $currentName) {
      return $currentName
    }
  }

  throw 'No active VirtualBox bridged network adapter found. Connect LAN/Wi-Fi or pass -BridgeAdapterName explicitly.'
}

if ([string]::IsNullOrWhiteSpace($BridgeAdapterName)) {
  $BridgeAdapterName = Get-BridgeAdapterName
}

$existingVm = & VBoxManage list vms | Select-String ([regex]::Escape("`"$VmName`""))
if (-not $existingVm) {
  & VBoxManage createvm --name $VmName --ostype Ubuntu_64 --register | Out-Host
  & VBoxManage modifyvm $VmName `
    --memory $MemoryMb `
    --cpus $CpuCount `
    --firmware efi `
    --chipset ich9 `
    --graphicscontroller vmsvga `
    --boot1 disk `
    --nic1 bridged `
    --bridgeadapter1 $BridgeAdapterName | Out-Host
  & VBoxManage storagectl $VmName --name 'SATA Controller' --add sata --controller IntelAhci --bootable on | Out-Host
  & VBoxManage storageattach $VmName --storagectl 'SATA Controller' --port 0 --device 0 --type hdd --medium $resolvedImagePath | Out-Host
} else {
  & VBoxManage modifyvm $VmName --nic1 bridged --bridgeadapter1 $BridgeAdapterName | Out-Host
}

if ($Start) {
  & VBoxManage startvm $VmName | Out-Host
}

Write-Host "Project Truth VirtualBox VM configured: $VmName"
Write-Host "Image: $resolvedImagePath"
Write-Host "Network: bridged"
Write-Host "Bridge adapter: $BridgeAdapterName"
Write-Host "CPU count: $CpuCount"
