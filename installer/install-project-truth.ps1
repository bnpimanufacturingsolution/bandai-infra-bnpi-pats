param(
  [string]$InstallDir = "$env:ProgramFiles\ProjectTruth",
  [switch]$DesktopShortcut
)

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
$programData = Join-Path $env:ProgramData 'ProjectTruth'
$localData = Join-Path $env:LOCALAPPDATA 'ProjectTruth'
$logDir = Join-Path $programData 'logs'
$logPath = Join-Path $logDir ("install-{0}.log" -f (Get-Date -Format 'yyyyMMdd-HHmmss'))

foreach ($dir in @($InstallDir, "$programData\config", "$programData\images", "$programData\logs", "$programData\state", $localData)) {
  New-Item -ItemType Directory -Force -Path $dir | Out-Null
}

"Installing Project Truth to $InstallDir" | Tee-Object -FilePath $logPath -Append

foreach ($path in @('README.md','app','docs','gitops','terraform-hyperv','scripts','image-factory')) {
  $source = Join-Path $repoRoot $path
  if (Test-Path -LiteralPath $source) {
    Copy-Item -LiteralPath $source -Destination $InstallDir -Recurse -Force
  }
}

$launcher = Join-Path $InstallDir 'ProjectTruth.cmd'
@'
@echo off
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\project-truth.ps1" %*
'@ | Set-Content -LiteralPath $launcher -Encoding ASCII

$shell = New-Object -ComObject WScript.Shell
$commonStartMenuDir = Join-Path $env:ProgramData 'Microsoft\Windows\Start Menu\Programs\Project Truth'
$userStartMenuDir = Join-Path ([Environment]::GetFolderPath('StartMenu')) 'Programs\Project Truth'
try {
  New-Item -ItemType Directory -Force -Path $commonStartMenuDir -ErrorAction Stop | Out-Null
  $startMenuDir = $commonStartMenuDir
} catch {
  "Common Start Menu unavailable, using current user Start Menu: $($_.Exception.Message)" | Tee-Object -FilePath $logPath -Append
  New-Item -ItemType Directory -Force -Path $userStartMenuDir | Out-Null
  $startMenuDir = $userStartMenuDir
}
$shortcutPath = Join-Path $startMenuDir 'Project Truth.lnk'
$shortcut = $shell.CreateShortcut($shortcutPath)
$shortcut.TargetPath = $launcher
$shortcut.Arguments = 'doctor'
$shortcut.WorkingDirectory = $InstallDir
$shortcut.Description = 'Project Truth CLI'
$shortcut.Save()

if ($DesktopShortcut) {
  $desktopShortcut = Join-Path ([Environment]::GetFolderPath('Desktop')) 'Project Truth.lnk'
  $shortcut = $shell.CreateShortcut($desktopShortcut)
  $shortcut.TargetPath = $launcher
  $shortcut.Arguments = 'doctor'
  $shortcut.WorkingDirectory = $InstallDir
  $shortcut.Description = 'Project Truth CLI'
  $shortcut.Save()
}

& "$PSScriptRoot\verify-install.ps1" -InstallDir $InstallDir -ShortcutPath $shortcutPath | Tee-Object -FilePath $logPath -Append

Write-Host "Project Truth installed. Log: $logPath"
