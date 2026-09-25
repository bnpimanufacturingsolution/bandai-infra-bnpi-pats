param(
  [string]$InstallDir = "$env:ProgramFiles\ProjectTruth",
  [switch]$DesktopShortcut
)

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
$programData = Join-Path $env:ProgramData 'BandaiApp\Bnpipats'
$localData = Join-Path $env:LOCALAPPDATA 'BandaiApp\Bnpipats'
$logDir = Join-Path $programData 'logs'
$configPath = Join-Path $programData 'config\project-truth.json'
$logPath = Join-Path $logDir ("install-{0}.log" -f (Get-Date -Format 'yyyyMMdd-HHmmss'))

foreach ($dir in @($InstallDir, "$programData\config", "$programData\images", "$programData\logs", "$programData\state", $localData)) {
  New-Item -ItemType Directory -Force -Path $dir | Out-Null
}

$legacyTerraformDir = Join-Path $InstallDir 'terraform-hyperv'
if (Test-Path -LiteralPath $legacyTerraformDir) {
  Remove-Item -LiteralPath $legacyTerraformDir -Recurse -Force
  "Removed legacy Terraform files from $InstallDir" | Tee-Object -FilePath $logPath -Append
}

"Installing Project Truth to $InstallDir" | Tee-Object -FilePath $logPath -Append

foreach ($path in @('README.md','app','docs','gitops','scripts','image-factory','installer')) {
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

function Test-ProjectTruthConfigCurrent {
  param([string]$Path)

  if (-not (Test-Path -LiteralPath $Path)) {
    return $false
  }

  try {
    $config = Get-Content -Raw -LiteralPath $Path | ConvertFrom-Json
  } catch {
    return $false
  }

  return (
    $config.gitops.repoUrl -eq 'https://github.com/bnpimanufacturingsolution/bandai-infra-bnpi-pats.git' -and
    $config.gitops.branch -eq 'develop' -and
    $config.ports.prodApp -eq 3000 -and
    $config.ports.prodApi -eq 3001 -and
    $config.ports.devApp -eq 3100 -and
    $config.ports.devApi -eq 3101 -and
    $config.ports.uatApp -eq 3200 -and
    $config.ports.uatApi -eq 3201
  )
}

if (Test-ProjectTruthConfigCurrent -Path $configPath) {
  "Preserving current config: $configPath" | Tee-Object -FilePath $logPath -Append
} else {
  "Writing current Project Truth config: $configPath" | Tee-Object -FilePath $logPath -Append
  & (Join-Path $InstallDir 'scripts\configure.ps1') -ConfigPath $configPath | Tee-Object -FilePath $logPath -Append
}

$shell = New-Object -ComObject WScript.Shell
$commonStartMenuDir = Join-Path $env:ProgramData 'Microsoft\Windows\Start Menu\Programs\Project Truth'
$userStartMenuDir = Join-Path ([Environment]::GetFolderPath('StartMenu')) 'Programs\Project Truth'

$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if ($isAdmin) {
  New-Item -ItemType Directory -Force -Path $commonStartMenuDir -ErrorAction Stop | Out-Null
  $startMenuDir = $commonStartMenuDir
} else {
  "Not elevated, using current user Start Menu." | Tee-Object -FilePath $logPath -Append
  New-Item -ItemType Directory -Force -Path $userStartMenuDir | Out-Null
  $startMenuDir = $userStartMenuDir
}

Get-ChildItem -LiteralPath $startMenuDir -Filter *.lnk -ErrorAction SilentlyContinue | Remove-Item -Force

function New-ProjectTruthShortcut {
  param(
    [string]$Name,
    [string]$TargetPath,
    [string]$Arguments,
    [string]$WorkingDirectory,
    [string]$Description
  )

  $path = Join-Path $startMenuDir "$Name.lnk"
  $shortcut = $shell.CreateShortcut($path)
  $shortcut.TargetPath = $TargetPath
  $shortcut.Arguments = $Arguments
  $shortcut.WorkingDirectory = $WorkingDirectory
  $shortcut.Description = $Description
  $shortcut.Save()
  return $path
}

$shortcutSpecs = @(
  @{ Name = 'Project Truth Doctor'; Target = $launcher; Args = 'doctor'; WorkDir = $InstallDir; Description = 'Run Project Truth doctor checks.' },
  @{ Name = 'Select Project Truth Image'; Target = $launcher; Args = 'select-image'; WorkDir = $InstallDir; Description = 'Select the prebuilt Project Truth VHDX.' },
  @{ Name = 'Watch Until Healthy'; Target = $launcher; Args = 'watch-until-healthy'; WorkDir = $InstallDir; Description = 'Watch health until DEV/UAT/PROD are healthy.' },
  @{ Name = 'Repair And Verify'; Target = $launcher; Args = 'repair-and-verify'; WorkDir = $InstallDir; Description = 'Run repair and verification loop.' },
  @{ Name = 'Open Project Truth Folder'; Target = 'explorer.exe'; Args = "`"$InstallDir`""; WorkDir = $InstallDir; Description = 'Open installed Project Truth files.' },
  @{ Name = 'Open Logs'; Target = 'explorer.exe'; Args = "`"$logDir`""; WorkDir = $InstallDir; Description = 'Open Project Truth logs.' },
  @{ Name = 'Open Documentation'; Target = 'explorer.exe'; Args = "`"$(Join-Path $InstallDir 'docs')`""; WorkDir = $InstallDir; Description = 'Open installed Project Truth docs.' }
)

$shortcutPaths = foreach ($spec in $shortcutSpecs) {
  New-ProjectTruthShortcut -Name $spec.Name -TargetPath $spec.Target -Arguments $spec.Args -WorkingDirectory $spec.WorkDir -Description $spec.Description
}

$shortcutPath = $shortcutPaths | Select-Object -First 1

if ($DesktopShortcut) {
  $desktopShortcut = Join-Path ([Environment]::GetFolderPath('Desktop')) 'Project Truth Doctor.lnk'
  $shortcut = $shell.CreateShortcut($desktopShortcut)
  $shortcut.TargetPath = $launcher
  $shortcut.Arguments = 'doctor'
  $shortcut.WorkingDirectory = $InstallDir
  $shortcut.Description = 'Project Truth CLI'
  $shortcut.Save()

  $desktopShortcut = Join-Path ([Environment]::GetFolderPath('Desktop')) 'Project Truth Repair And Verify.lnk'
  $shortcut = $shell.CreateShortcut($desktopShortcut)
  $shortcut.TargetPath = $launcher
  $shortcut.Arguments = 'repair-and-verify'
  $shortcut.WorkingDirectory = $InstallDir
  $shortcut.Description = 'Project Truth repair and verify'
  $shortcut.Save()
}

& "$PSScriptRoot\verify-install.ps1" -InstallDir $InstallDir | Tee-Object -FilePath $logPath -Append

Write-Host "Project Truth installed. Log: $logPath"
