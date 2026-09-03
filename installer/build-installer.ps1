param(
  [string]$OutputDir = (Join-Path (Split-Path -Parent $PSScriptRoot) 'dist')
)

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
New-Item -ItemType Directory -Force -Path $OutputDir | Out-Null

$iscc = Get-Command iscc.exe -ErrorAction SilentlyContinue
if ($iscc) {
  & $iscc.Source (Join-Path $PSScriptRoot 'project-truth.iss')
  if ($LASTEXITCODE -ne 0) {
    throw "Inno Setup compiler failed with exit code $LASTEXITCODE"
  }
  Write-Host "Inno Setup installer built."
} else {
  Write-Warning 'iscc.exe not found. Inno Setup build skipped; PowerShell installer fallback remains available.'
}

$packageDir = Join-Path $OutputDir 'ProjectTruth-PowerShell'
if (Test-Path -LiteralPath $packageDir) {
  Remove-Item -LiteralPath $packageDir -Recurse -Force
}
New-Item -ItemType Directory -Force -Path $packageDir | Out-Null

foreach ($path in @('README.md','app','docs','gitops','terraform-hyperv','scripts','installer','image-factory')) {
  Copy-Item -LiteralPath (Join-Path $repoRoot $path) -Destination $packageDir -Recurse -Force
}

Write-Host "PowerShell installer package ready: $packageDir"
