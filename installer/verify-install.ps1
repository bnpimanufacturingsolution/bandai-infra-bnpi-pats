param(
  [string]$InstallDir = "$env:ProgramFiles\ProjectTruth",
  [string]$ShortcutPath = ''
)

$ErrorActionPreference = 'Stop'
$required = @(
  (Join-Path $InstallDir 'ProjectTruth.cmd'),
  (Join-Path $InstallDir 'scripts\project-truth.ps1'),
  (Join-Path $InstallDir 'terraform-hyperv\providers.tf'),
  (Join-Path $InstallDir 'gitops\base\deployment.yaml'),
  (Join-Path $InstallDir 'docs\ARCHITECTURE.md')
)

foreach ($path in $required) {
  if (-not (Test-Path -LiteralPath $path)) {
    throw "Installed file missing: $path"
  }
}

if (-not $ShortcutPath) {
  $common = Join-Path $env:ProgramData 'Microsoft\Windows\Start Menu\Programs\Project Truth\Project Truth.lnk'
  $user = Join-Path ([Environment]::GetFolderPath('StartMenu')) 'Programs\Project Truth\Project Truth.lnk'
  $ShortcutPath = if (Test-Path -LiteralPath $common) { $common } else { $user }
}

if (-not (Test-Path -LiteralPath $ShortcutPath)) {
  throw "Shortcut missing: $ShortcutPath"
}

$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut($ShortcutPath)
$inspection = [pscustomobject]@{
  ShortcutPath     = $ShortcutPath
  TargetPath       = $shortcut.TargetPath
  Arguments        = $shortcut.Arguments
  WorkingDirectory = $shortcut.WorkingDirectory
}

$inspection | Format-List

if ($shortcut.TargetPath -notlike "$InstallDir*") {
  throw "Shortcut target points outside install dir: $($shortcut.TargetPath)"
}

Write-Host 'Installer verification passed.'
