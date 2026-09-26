param(
  [string]$ImagePath,
  [string]$ExpectedSha256 = '',
  [ValidateSet('hyperv','virtualbox')]
  [string]$TargetPlatform = 'hyperv',
  [string]$ConfigPath = "$env:ProgramData\BandaiApp\Bnpipats\config\image.json"
)

$ErrorActionPreference = 'Stop'

if (-not $ImagePath) {
  $defaultExtension = if ($TargetPlatform -eq 'virtualbox') { 'vdi' } else { 'vhdx' }
  $default = "$env:ProgramData\BandaiApp\Bnpipats\images\project-truth-node-latest.$defaultExtension"
  if (Test-Path -LiteralPath $default) {
    $ImagePath = $default
  } else {
    throw "No image path supplied and default image not found: $default"
  }
}

$resolved = (Resolve-Path -LiteralPath $ImagePath).Path
$extension = [IO.Path]::GetExtension($resolved).ToLowerInvariant()
$allowedExtensions = if ($TargetPlatform -eq 'virtualbox') { @('.vdi', '.ova') } else { @('.vhdx') }
if ($extension -notin $allowedExtensions) {
  throw "Selected $TargetPlatform image must use one of these extensions: $($allowedExtensions -join ', '). Got: $resolved"
}

if ($extension -in @('.vdi', '.vmdk', '.vhdx')) {
  & "$PSScriptRoot\normalize-image-acl.ps1" -ImagePath $resolved
}

$configDir = Split-Path -Parent $ConfigPath
New-Item -ItemType Directory -Force -Path $configDir | Out-Null

[pscustomobject]@{
  imagePath      = $resolved
  targetPlatform = $TargetPlatform
  sha256         = $ExpectedSha256
  selectedAt = (Get-Date).ToString('o')
} | ConvertTo-Json | Set-Content -LiteralPath $ConfigPath -Encoding UTF8

Write-Host "Selected Project Truth $TargetPlatform image: $resolved"
