param(
  [string]$GuestIp = '',
  [string]$User = 'infra'
)

$ErrorActionPreference = 'Continue'

$localChecks = foreach ($envName in @('dev', 'uat', 'prod')) {
  $overlay = "gitops/overlays/$envName"
  $render = kubectl kustomize $overlay 2>&1
  [pscustomobject]@{
    Scope = "render-$envName"
    Status = $(if ($LASTEXITCODE -eq 0) { 'PASS' } else { 'FAIL' })
    Detail = ($render | Out-String).Trim()
  }
}

$localChecks | Format-Table -AutoSize

if ($GuestIp) {
  ssh -o BatchMode=yes -o ConnectTimeout=10 "$User@$GuestIp" "sudo kubectl get applications -n argocd || true; sudo kubectl get pods -A; sudo kubectl get svc -A"
}
