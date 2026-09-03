<#
.SYNOPSIS
  Thin wrapper for the EmployeePayroll.hourlySalary backfill.

.DESCRIPTION
  cds to hris-api and runs npm.cmd run backfill:employee-payroll-hourly-salary.
  Dry-run by default. -Execute passes --execute. Remaining args are forwarded.

.EXAMPLE
  powershell -File scripts/backfill-employee-payroll-hourly-salary.ps1
  powershell -File scripts/backfill-employee-payroll-hourly-salary.ps1 -Execute
  powershell -File scripts/backfill-employee-payroll-hourly-salary.ps1 -Execute --force --limit=10
#>
[CmdletBinding()]
param(
  [switch]$Execute,
  [Parameter(ValueFromRemainingArguments = $true)]
  [string[]]$RemainingArgs
)

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent $PSScriptRoot
$hrisApi = Join-Path $repoRoot "hris-api"
if (-not (Test-Path (Join-Path $hrisApi "package.json"))) {
  throw "hris-api package.json not found at $hrisApi"
}

$forward = [System.Collections.Generic.List[string]]::new()
if ($Execute) {
  $forward.Add("--execute")
}
foreach ($arg in @($RemainingArgs)) {
  if ($null -ne $arg -and "$arg".Length -gt 0) {
    $forward.Add([string]$arg)
  }
}

Push-Location $hrisApi
try {
  & npm.cmd run backfill:employee-payroll-hourly-salary -- @forward
  exit $LASTEXITCODE
} finally {
  Pop-Location
}
