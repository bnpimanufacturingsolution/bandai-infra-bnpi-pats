param(
  [string]$InstallDir = "$env:ProgramFiles\ProjectTruth",
  [string]$ShortcutPath = ''
)

$ErrorActionPreference = 'Stop'
$required = @(
  (Join-Path $InstallDir 'ProjectTruth.cmd'),
  (Join-Path $InstallDir 'scripts\project-truth.ps1'),
  (Join-Path $InstallDir 'scripts\configure.ps1'),
  (Join-Path $InstallDir 'installer\build-installer.ps1'),
  (Join-Path $InstallDir 'terraform-hyperv\providers.tf'),
  (Join-Path $InstallDir 'gitops\base\deployment.yaml'),
  (Join-Path $InstallDir 'docs\ARCHITECTURE.md')
)

foreach ($path in $required) {
  if (-not (Test-Path -LiteralPath $path)) {
    throw "Installed file missing: $path"
  }
}

$shell = New-Object -ComObject WScript.Shell
$commonDir = Join-Path $env:ProgramData 'Microsoft\Windows\Start Menu\Programs\Project Truth'
$userDir = Join-Path ([Environment]::GetFolderPath('StartMenu')) 'Programs\Project Truth'
$shortcutDir = if (Test-Path -LiteralPath $commonDir) { $commonDir } else { $userDir }

if (-not (Test-Path -LiteralPath $shortcutDir)) {
  throw "Shortcut folder missing: $shortcutDir"
}

$expectedShortcuts = @(
  'Project Truth Doctor',
  'Select Project Truth Image',
  'Terraform Plan',
  'Apply Hyper-V VM',
  'Watch Until Healthy',
  'Repair And Verify',
  'Open Project Truth Folder',
  'Open Logs',
  'Open Documentation'
)

$inspections = foreach ($name in $expectedShortcuts) {
  $path = Join-Path $shortcutDir "$name.lnk"
  if (-not (Test-Path -LiteralPath $path)) {
    throw "Shortcut missing: $path"
  }

  $shortcut = $shell.CreateShortcut($path)
  $row = [pscustomobject]@{
    Name             = $name
    ShortcutPath     = $path
    TargetPath       = $shortcut.TargetPath
    Arguments        = $shortcut.Arguments
    WorkingDirectory = $shortcut.WorkingDirectory
  }

  if ($name -like 'Open *') {
    if ($shortcut.TargetPath -notmatch 'explorer\.exe$') {
      throw "Open shortcut must use explorer.exe: $name -> $($shortcut.TargetPath)"
    }
  } elseif ($shortcut.TargetPath -notlike "$InstallDir*") {
    throw "Shortcut target points outside install dir: $name -> $($shortcut.TargetPath)"
  }

  if ($shortcut.WorkingDirectory -ne $InstallDir) {
    throw "Shortcut working directory mismatch: $name -> $($shortcut.WorkingDirectory)"
  }

  $row
}

$inspections | Format-Table -AutoSize

$configPath = Join-Path $env:ProgramData 'ProjectTruth\config\project-truth.json'
if (-not (Test-Path -LiteralPath $configPath)) {
  throw "Config file missing: $configPath"
}

Write-Host 'Installer verification passed.'
