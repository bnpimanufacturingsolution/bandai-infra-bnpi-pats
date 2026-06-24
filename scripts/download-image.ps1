param(
  [string]$ImageUrl = $env:PROJECT_TRUTH_IMAGE_URL,
  [string]$ExpectedSha256 = $env:PROJECT_TRUTH_IMAGE_SHA256,
  [ValidateSet('hyperv','virtualbox')]
  [string]$TargetPlatform = $(if ($env:PROJECT_TRUTH_TARGET_PLATFORM) { $env:PROJECT_TRUTH_TARGET_PLATFORM } else { 'hyperv' }),
  [string]$ImagesDir = "$env:ProgramData\ProjectTruth\images"
)

$ErrorActionPreference = 'Stop'

if (-not $ImageUrl) {
  throw "No image URL configured. Set PROJECT_TRUTH_IMAGE_URL or pass -ImageUrl."
}

New-Item -ItemType Directory -Force -Path $ImagesDir | Out-Null
$fileName = Split-Path -Leaf ([Uri]$ImageUrl).AbsolutePath
if (-not $fileName) {
  $defaultExtension = if ($TargetPlatform -eq 'virtualbox') { 'vdi' } else { 'vhdx' }
  $fileName = "project-truth-node-latest.$defaultExtension"
}
$target = Join-Path $ImagesDir $fileName

Invoke-WebRequest -Uri $ImageUrl -OutFile $target

& "$PSScriptRoot\normalize-image-acl.ps1" -ImagePath $target

if ($ExpectedSha256) {
  $actual = (Get-FileHash -LiteralPath $target -Algorithm SHA256).Hash.ToLowerInvariant()
  if ($actual -ne $ExpectedSha256.ToLowerInvariant()) {
    Remove-Item -LiteralPath $target -Force
    throw "Checksum failed for downloaded image. actual=$actual expected=$ExpectedSha256"
  }
}

& "$PSScriptRoot\select-image.ps1" -ImagePath $target -ExpectedSha256 $ExpectedSha256 -TargetPlatform $TargetPlatform
