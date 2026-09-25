param(
  [string]$GuestIp = '',
  [int]$MaxHours = 8
)

$ErrorActionPreference = 'Continue'
$runDir = Join-Path (Join-Path (Split-Path -Parent $PSScriptRoot) '.runtime\repair') (Get-Date -Format 'yyyyMMdd-HHmmss')
New-Item -ItemType Directory -Force -Path $runDir | Out-Null
$report = Join-Path $runDir 'final-report.md'

function Add-Report {
  param([string]$Text)
  $Text | Tee-Object -FilePath $report -Append
}

Add-Report '# Project Truth Repair And Verify Report'
Add-Report ''
Add-Report "Started: $(Get-Date -Format o)"

Add-Report '## Doctor'
& "$PSScriptRoot\doctor.ps1" *>&1 | Tee-Object -FilePath (Join-Path $runDir 'doctor.log') | Out-String | Add-Content -LiteralPath $report

Add-Report '## Installer Verification'
& (Join-Path (Split-Path -Parent $PSScriptRoot) 'installer\build-installer.ps1') *>&1 | Tee-Object -FilePath (Join-Path $runDir 'installer.log') | Out-String | Add-Content -LiteralPath $report

Add-Report '## Host Configuration'
Add-Report 'The VM lifecycle is managed by the direct Hyper-V CLI path; no Terraform state or apply step is used.'

Add-Report '## Health'
if ([string]::IsNullOrWhiteSpace($GuestIp)) {
  $message = 'BLOCKED: GuestIp was not provided. Health, SSH, Kubernetes, and Argo CD proof require a booted VM with a discovered LAN IP.'
  $message | Tee-Object -FilePath (Join-Path $runDir 'health.log') | Out-String | Add-Content -LiteralPath $report
} else {
  & "$PSScriptRoot\watch-until-healthy.ps1" -GuestIp $GuestIp -MaxHours $MaxHours *>&1 | Tee-Object -FilePath (Join-Path $runDir 'health.log') | Out-String | Add-Content -LiteralPath $report
}

Add-Report ''
Add-Report "Finished: $(Get-Date -Format o)"
Write-Host "Repair report: $report"
