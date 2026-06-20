param(
  [string]$ProjectId = 'hris-492904',
  [int]$MaxRunningMinutes = 30,
  [int]$IntervalMinutes = 15,
  [string]$TaskName = 'Project Truth GCP Build Guard'
)

$ErrorActionPreference = 'Stop'

$scriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$watchScript = Join-Path $scriptRoot 'watch-gcp-build-resources.ps1'
if (-not (Test-Path -LiteralPath $watchScript)) {
  throw "Watch script not found: $watchScript"
}

$powerShellPath = (Get-Command powershell.exe -ErrorAction Stop).Source
$arguments = @(
  '-NoProfile',
  '-ExecutionPolicy', 'Bypass',
  '-File', "`"$watchScript`"",
  '-ProjectId', $ProjectId,
  '-MaxRunningMinutes', $MaxRunningMinutes,
  '-StopLeakedBuildVms'
) -join ' '

$action = New-ScheduledTaskAction -Execute $powerShellPath -Argument $arguments
$trigger = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) `
  -RepetitionInterval (New-TimeSpan -Minutes $IntervalMinutes) `
  -RepetitionDuration (New-TimeSpan -Days 3650)
$settings = New-ScheduledTaskSettingsSet `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries `
  -StartWhenAvailable `
  -MultipleInstances IgnoreNew

Register-ScheduledTask `
  -TaskName $TaskName `
  -Action $action `
  -Trigger $trigger `
  -Settings $settings `
  -Description 'Alerts when Project Truth Google Compute image-build VMs are running and stops them after the configured age.' `
  -Force | Out-Null

Write-Host "Installed scheduled task: $TaskName"
Write-Host "Runs every $IntervalMinutes minutes."
Write-Host "Stops Project Truth build VMs older than $MaxRunningMinutes minutes in project $ProjectId."
