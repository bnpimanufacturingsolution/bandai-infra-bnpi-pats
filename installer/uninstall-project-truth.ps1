param(
  [string]$InstallDir = "$env:ProgramFiles\ProjectTruth",
  [switch]$RemoveState
)

$ErrorActionPreference = 'Stop'
$shortcutDirs = @(
  (Join-Path $env:ProgramData 'Microsoft\Windows\Start Menu\Programs\Project Truth'),
  (Join-Path ([Environment]::GetFolderPath('StartMenu')) 'Programs\Project Truth')
)

foreach ($shortcutDir in $shortcutDirs) {
  if (Test-Path -LiteralPath $shortcutDir) {
    Remove-Item -LiteralPath $shortcutDir -Recurse -Force
  }
}

if (Test-Path -LiteralPath $InstallDir) {
  Remove-Item -LiteralPath $InstallDir -Recurse -Force
}

if ($RemoveState) {
  $stateDir = Join-Path $env:ProgramData 'ProjectTruth'
  if (Test-Path -LiteralPath $stateDir) {
    Remove-Item -LiteralPath $stateDir -Recurse -Force
  }
}

Write-Host "Project Truth uninstalled. ProgramData state preserved: $(-not $RemoveState)"
