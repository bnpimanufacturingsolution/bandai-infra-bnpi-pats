param(
  [Parameter(Position = 0)]
  [ValidateSet('doctor','configure','select-image','download-image','build-image','build-image-gcp','watch-gcp-image-build-progress','watch-gcp-build-resources','export-devcurrent-gcp-vhdx','verify-gcp-image-boot','configure-virtualbox','vhdx-autopilot','finalize-local-vhdx','bnpi-pats-vm','repair-appliance-online','backup-appliance-data','restore-appliance-data','enable-k8s-runtime','disable-k8s-runtime','test-self-heal-contract','repair-hyperv-boot','verify-hyperv-bridge','login-visual-proof-loop','hyperv-visual-proof-loop','terraform-plan','terraform-apply','verify','watch-until-healthy','repair-and-verify','watch-github-run','verify-gitops-state','gitops-pull','vm-pull','v6-one-shot','configure-vm-git-creds','apply-argocd-platform','configure-argocd-repo-creds','configure-argocd-webhook','start-local-bnpi-pats-runtime','verify-local-bnpi-pats-runtime','start-trycloudflare-tunnel','start-trycloudflare-suite','start-cloudflare-db-tcp','start-bnpi-db-access','ensure-bnpi-cloudflare-host','start-bnpi-cloudflare-tunnel')]
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
  'build-image-gcp'     = 'build-image-gcp.ps1'
  'watch-gcp-image-build-progress' = 'watch-gcp-image-build-progress.ps1'
  'watch-gcp-build-resources' = 'watch-gcp-build-resources.ps1'
  'export-devcurrent-gcp-vhdx' = 'export-devcurrent-gcp-vhdx.ps1'
  'verify-gcp-image-boot' = 'verify-gcp-image-boot.ps1'
  'configure-virtualbox' = 'configure-virtualbox.ps1'
  'vhdx-autopilot'      = 'vhdx-autopilot.ps1'
  'finalize-local-vhdx' = 'finalize-local-vhdx.ps1'
  'bnpi-pats-vm' = 'bnpi-pats-vm.ps1'
  'repair-appliance-online' = 'repair-appliance-online.ps1'
  'backup-appliance-data' = 'backup-appliance-data.ps1'
  'restore-appliance-data' = 'restore-appliance-data.ps1'
  'enable-k8s-runtime' = 'enable-k8s-runtime.ps1'
  'disable-k8s-runtime' = 'disable-k8s-runtime.ps1'
  'test-self-heal-contract' = 'test-self-heal-contract.ps1'
  'repair-hyperv-boot'  = 'repair-hyperv-boot.ps1'
  'verify-hyperv-bridge' = 'verify-hyperv-bridge.ps1'
  'login-visual-proof-loop' = 'login-visual-proof-loop.ps1'
  'hyperv-visual-proof-loop' = 'hyperv-visual-proof-loop.ps1'
  'terraform-plan'      = 'terraform-plan.ps1'
  'terraform-apply'     = 'terraform-apply.ps1'
  'verify'              = 'verify-host-health.ps1'
  'watch-until-healthy' = 'watch-until-healthy.ps1'
  'repair-and-verify'   = 'repair-and-verify.ps1'
  'watch-github-run'    = 'watch-github-run.ps1'
  'verify-gitops-state' = 'verify-gitops-state.ps1'
  'gitops-pull'         = 'gitops-pull.ps1'
  'vm-pull'             = 'vm-pull.ps1'
  'v6-one-shot'          = 'project-truth-v6-one-shot.ps1'
  'configure-vm-git-creds' = 'configure-vm-git-creds.ps1'
  'apply-argocd-platform' = 'apply-argocd-platform.ps1'
  'configure-argocd-repo-creds' = 'configure-argocd-repo-creds.ps1'
  'configure-argocd-webhook' = 'configure-argocd-webhook.ps1'
  'start-local-bnpi-pats-runtime' = 'start-local-bnpi-pats-runtime.ps1'
  'verify-local-bnpi-pats-runtime' = 'verify-local-bnpi-pats-runtime.ps1'
  'start-trycloudflare-tunnel' = 'start-trycloudflare-tunnel.ps1'
  'start-trycloudflare-suite' = 'start-trycloudflare-suite.ps1'
  'start-cloudflare-db-tcp' = 'start-cloudflare-db-tcp.ps1'
  'start-bnpi-db-access' = 'start-bnpi-db-access.ps1'
  'ensure-bnpi-cloudflare-host' = 'ensure-bnpi-cloudflare-host.ps1'
  'start-bnpi-cloudflare-tunnel' = 'start-bnpi-cloudflare-tunnel.ps1'
}

$target = Join-Path $scriptRoot $scriptMap[$Command]
if (-not (Test-Path -LiteralPath $target)) {
  throw "Command script not found: $target"
}

& powershell.exe -NoProfile -ExecutionPolicy Bypass -File $target @RemainingArgs
exit $LASTEXITCODE
