param(
  [Parameter(Position = 0)]
  [ValidateSet('doctor','configure','select-image','download-image','build-image','verify-gcp-image-boot','configure-virtualbox','vhdx-autopilot','finalize-local-vhdx','repair-appliance-online','backup-appliance-data','restore-appliance-data','enable-k8s-runtime','disable-k8s-runtime','repair-hyperv-boot','verify-hyperv-bridge','login-visual-proof-loop','terraform-plan','terraform-apply','verify','watch-until-healthy','repair-and-verify','watch-github-run','verify-gitops-state','start-local-hris-runtime','verify-local-hris-runtime','start-trycloudflare-tunnel')]
  [string]$Command = 'doctor',

  [Parameter(ValueFromRemainingArguments = $true)]
  [string[]]$RemainingArgs
)

$ErrorActionPreference = 'Stop'
$scriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path

$scriptMap = @{
  'doctor'              = 'doctor.ps1'
  'configure'           = 'configure.ps1'
  'select-image'        = 'select-image.ps1'
  'download-image'      = 'download-image.ps1'
  'build-image'         = 'build-image.ps1'
  'verify-gcp-image-boot' = 'verify-gcp-image-boot.ps1'
  'configure-virtualbox' = 'configure-virtualbox.ps1'
  'vhdx-autopilot'      = 'vhdx-autopilot.ps1'
  'finalize-local-vhdx' = 'finalize-local-vhdx.ps1'
  'repair-appliance-online' = 'repair-appliance-online.ps1'
  'backup-appliance-data' = 'backup-appliance-data.ps1'
  'restore-appliance-data' = 'restore-appliance-data.ps1'
  'enable-k8s-runtime' = 'enable-k8s-runtime.ps1'
  'disable-k8s-runtime' = 'disable-k8s-runtime.ps1'
  'repair-hyperv-boot'  = 'repair-hyperv-boot.ps1'
  'verify-hyperv-bridge' = 'verify-hyperv-bridge.ps1'
  'login-visual-proof-loop' = 'login-visual-proof-loop.ps1'
  'terraform-plan'      = 'terraform-plan.ps1'
  'terraform-apply'     = 'terraform-apply.ps1'
  'verify'              = 'verify-host-health.ps1'
  'watch-until-healthy' = 'watch-until-healthy.ps1'
  'repair-and-verify'   = 'repair-and-verify.ps1'
  'watch-github-run'    = 'watch-github-run.ps1'
  'verify-gitops-state' = 'verify-gitops-state.ps1'
  'start-local-hris-runtime' = 'start-local-hris-runtime.ps1'
  'verify-local-hris-runtime' = 'verify-local-hris-runtime.ps1'
  'start-trycloudflare-tunnel' = 'start-trycloudflare-tunnel.ps1'
}

$target = Join-Path $scriptRoot $scriptMap[$Command]
if (-not (Test-Path -LiteralPath $target)) {
  throw "Command script not found: $target"
}

& powershell.exe -NoProfile -ExecutionPolicy Bypass -File $target @RemainingArgs
exit $LASTEXITCODE
