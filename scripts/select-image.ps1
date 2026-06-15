param(
  [string]$ImagePath,
  [string]$ExpectedSha256 = '',
  [string]$ConfigPath = "$env:ProgramData\ProjectTruth\config\image.json"
)

$ErrorActionPreference = 'Stop'

if (-not $ImagePath) {
  $default = "$env:ProgramData\ProjectTruth\images\project-truth-node-latest.vhdx"
  if (Test-Path -LiteralPath $default) {
    $ImagePath = $default
  } else {
    throw "No image path supplied and default image not found: $default"
  }
}

$resolved = (Resolve-Path -LiteralPath $ImagePath).Path
if ([IO.Path]::GetExtension($resolved).ToLowerInvariant() -ne '.vhdx') {
  throw "Selected image must be a .vhdx file: $resolved"
}

$configDir = Split-Path -Parent $ConfigPath
New-Item -ItemType Directory -Force -Path $configDir | Out-Null

[pscustomobject]@{
  imagePath = $resolved
  sha256    = $ExpectedSha256
  selectedAt = (Get-Date).ToString('o')
} | ConvertTo-Json | Set-Content -LiteralPath $ConfigPath -Encoding UTF8

Write-Host "Selected Project Truth image: $resolved"
