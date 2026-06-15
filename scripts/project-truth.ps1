param(
  [Parameter(Position = 0)]
  [ValidateSet('doctor','select-image','download-image','terraform-plan','terraform-apply','verify','watch-until-healthy','repair-and-verify')]
  [string]$Command = 'doctor',

  [Parameter(ValueFromRemainingArguments = $true)]
  [string[]]$RemainingArgs
)

$ErrorActionPreference = 'Stop'
$scriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path

$scriptMap = @{
  'doctor'              = 'doctor.ps1'
  'select-image'        = 'select-image.ps1'
  'download-image'      = 'download-image.ps1'
  'terraform-plan'      = 'terraform-plan.ps1'
  'terraform-apply'     = 'terraform-apply.ps1'
  'verify'              = 'verify-host-health.ps1'
  'watch-until-healthy' = 'watch-until-healthy.ps1'
  'repair-and-verify'   = 'repair-and-verify.ps1'
}

$target = Join-Path $scriptRoot $scriptMap[$Command]
if (-not (Test-Path -LiteralPath $target)) {
  throw "Command script not found: $target"
}

& powershell.exe -NoProfile -ExecutionPolicy Bypass -File $target @RemainingArgs
exit $LASTEXITCODE
