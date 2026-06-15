param(
  [string]$GuestIp = '',
  [switch]$EnableTerraformApply,
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

Add-Report '## Terraform'
& "$PSScriptRoot\terraform-plan.ps1" *>&1 | Tee-Object -FilePath (Join-Path $runDir 'terraform.log') | Out-String | Add-Content -LiteralPath $report

if ($EnableTerraformApply) {
  Add-Report '## Terraform Apply'
  & "$PSScriptRoot\terraform-apply.ps1" -Apply *>&1 | Tee-Object -FilePath (Join-Path $runDir 'terraform-apply.log') | Out-String | Add-Content -LiteralPath $report
} else {
  Add-Report '## Terraform Apply'
  Add-Report 'Skipped by safety gate. Pass -EnableTerraformApply to run apply.'
}

Add-Report '## Health'
& "$PSScriptRoot\watch-until-healthy.ps1" -GuestIp $GuestIp -MaxHours $MaxHours *>&1 | Tee-Object -FilePath (Join-Path $runDir 'health.log') | Out-String | Add-Content -LiteralPath $report

Add-Report ''
Add-Report "Finished: $(Get-Date -Format o)"
Write-Host "Repair report: $report"
