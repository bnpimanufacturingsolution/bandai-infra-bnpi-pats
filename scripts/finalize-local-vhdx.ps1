param(
  [string]$VmName = 'project-truth-local-vhdx-proof',
  [string]$ImagesDir = "$env:ProgramData\ProjectTruth\images",
  [string]$FinalImageName = 'project-truth-node-latest.vhdx',
  [string]$ConfigPath = "$env:ProgramData\ProjectTruth\config\image.json",
  [string]$TerraformVarsPath = (Join-Path (Split-Path -Parent $PSScriptRoot) 'terraform-hyperv\terraform.tfvars'),
  [switch]$StopVm,
  [switch]$Force,
  [switch]$SkipCopy,
  [switch]$SkipTerraformUpdate
)

$ErrorActionPreference = 'Stop'

function Write-Step {
  param([string]$Message)
  Write-Host ("{0} {1}" -f (Get-Date -Format "HH:mm:ss"), $Message)
}

function Write-Manifest {
  param(
    [string]$Path,
    [object]$Data
  )
  $Data | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $Path -Encoding UTF8
}

New-Item -ItemType Directory -Force -Path $ImagesDir | Out-Null

$vm = Get-VM -Name $VmName -ErrorAction Stop
if ($vm.State -ne 'Off') {
  if (-not $StopVm) {
    throw "VM must be Off before finalizing a VHDX artifact to avoid disk mutation. Current state: $($vm.State). Re-run with -StopVm if you want this script to shut it down."
  }
  Write-Step "Stopping VM $VmName before artifact finalization"
  Stop-VM -Name $VmName -Shutdown -ErrorAction SilentlyContinue
  $vm | Wait-VM -For Heartbeat -Timeout 30 -ErrorAction SilentlyContinue | Out-Null
  $vm = Get-VM -Name $VmName
  if ($vm.State -ne 'Off') {
    Stop-VM -Name $VmName -TurnOff -Force
  }
}

$disk = Get-VMHardDiskDrive -VMName $VmName | Select-Object -First 1
if (-not $disk -or -not $disk.Path) {
  throw "No VHDX disk is attached to VM: $VmName"
}

$sourcePath = (Resolve-Path -LiteralPath $disk.Path).Path
if ([IO.Path]::GetExtension($sourcePath).ToLowerInvariant() -ne '.vhdx') {
  throw "Final Hyper-V artifact must be a .vhdx. Found: $sourcePath"
}

$finalPath = Join-Path $ImagesDir $FinalImageName
$sourceItem = Get-Item -LiteralPath $sourcePath

if (-not $SkipCopy -and $sourcePath -ne $finalPath) {
  if (Test-Path -LiteralPath $finalPath) {
    $existingHash = (Get-FileHash -LiteralPath $finalPath -Algorithm SHA256).Hash
    $sourceHash = (Get-FileHash -LiteralPath $sourcePath -Algorithm SHA256).Hash
    if ($existingHash -ne $sourceHash) {
      if (-not $Force) {
        throw "Final image already exists with a different hash: $finalPath. Use -Force to archive it and replace it."
      }
      $archivePath = Join-Path $ImagesDir ("{0}.previous-{1}.vhdx" -f ([IO.Path]::GetFileNameWithoutExtension($FinalImageName)), (Get-Date -Format 'yyyyMMdd-HHmmss'))
      Write-Step "Archiving existing final image to $archivePath"
      Move-Item -LiteralPath $finalPath -Destination $archivePath
    }
  }

  if (-not (Test-Path -LiteralPath $finalPath)) {
    Write-Step "Copying proven VM disk to stable artifact path"
    Copy-Item -LiteralPath $sourcePath -Destination $finalPath
  }
}
elseif ($SkipCopy) {
  $finalPath = $sourcePath
}

$hash = (Get-FileHash -LiteralPath $finalPath -Algorithm SHA256).Hash.ToLowerInvariant()
$shaPath = "$finalPath.sha256"
("{0}  {1}" -f $hash, (Split-Path -Leaf $finalPath)) | Set-Content -LiteralPath $shaPath -Encoding ASCII

& "$PSScriptRoot\normalize-image-acl.ps1" -ImagePath $finalPath
& "$PSScriptRoot\select-image.ps1" -ImagePath $finalPath -ExpectedSha256 $hash -TargetPlatform hyperv -ConfigPath $ConfigPath

if (-not $SkipTerraformUpdate -and (Test-Path -LiteralPath $TerraformVarsPath)) {
  $escaped = $finalPath.Replace('\', '\\')
  $content = Get-Content -LiteralPath $TerraformVarsPath -Raw
  $content = $content -replace 'source_image_path\s*=\s*".*"', ('source_image_path = "{0}"' -f $escaped)
  Set-Content -LiteralPath $TerraformVarsPath -Value $content -Encoding UTF8
}

$evidencePointer = Join-Path (Split-Path -Parent $PSScriptRoot) '.runtime\local-hyperv-proof-LATEST.txt'
$evidenceDir = if (Test-Path -LiteralPath $evidencePointer) { Get-Content -LiteralPath $evidencePointer -ErrorAction SilentlyContinue } else { '' }
$manifestPath = Join-Path $ImagesDir ("{0}.manifest.json" -f ([IO.Path]::GetFileNameWithoutExtension($FinalImageName)))

Write-Manifest -Path $manifestPath -Data ([pscustomobject]@{
  artifactPath = $finalPath
  sha256 = $hash
  sha256Path = $shaPath
  sourceVmName = $VmName
  sourceDiskPath = $sourcePath
  sourceDiskLastWriteTime = $sourceItem.LastWriteTime.ToString('o')
  finalizedAt = (Get-Date).ToString('o')
  evidenceDir = $evidenceDir
  terraformVarsPath = $TerraformVarsPath
  selectedImageConfigPath = $ConfigPath
})

Write-Host ""
Write-Host "Final Hyper-V VHDX artifact: $finalPath"
Write-Host "SHA256: $hash"
Write-Host "Manifest: $manifestPath"
