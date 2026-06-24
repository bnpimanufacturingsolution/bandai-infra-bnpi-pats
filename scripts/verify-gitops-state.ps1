param(
  [string]$GuestIp = '',
  [string]$User = 'infra',
  [switch]$RequireRuntimeApplications
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

$runtimeChecks = foreach ($envName in @('dev', 'uat', 'prod')) {
  $overlay = "gitops/runtime-k8s/overlays/$envName"
  $render = kubectl kustomize $overlay 2>&1
  [pscustomobject]@{
    Scope = "render-runtime-$envName"
    Status = $(if ($LASTEXITCODE -eq 0) { 'PASS' } else { 'FAIL' })
    Detail = ($render | Out-String).Trim()
  }
}

$localChecks = @($localChecks) + @($runtimeChecks)

$localChecks | Format-Table -AutoSize

$failedLocalChecks = @($localChecks | Where-Object { $_.Status -ne 'PASS' })
if ($failedLocalChecks.Count -gt 0) {
  Write-Error "GitOps verification failed: one or more overlays did not render."
  exit 1
}

if ($GuestIp) {
  $remoteScript = @'
set -e
sudo kubectl get applications -n argocd
for app in project-truth-dev project-truth-uat project-truth-prod; do
  sudo kubectl get application -n argocd "$app" >/dev/null
done
__RUNTIME_CHECK__
sudo kubectl get pods -A
sudo kubectl get svc -A
'@
  $runtimeCheck = ''
  if ($RequireRuntimeApplications) {
    $runtimeCheck = @'
for app in project-truth-runtime-dev project-truth-runtime-uat project-truth-runtime-prod; do
  sudo kubectl get application -n argocd "$app" >/dev/null
done
'@
  }
  ssh -o BatchMode=yes -o StrictHostKeyChecking=accept-new -o ConnectTimeout=10 "$User@$GuestIp" ($remoteScript.Replace('__RUNTIME_CHECK__', $runtimeCheck))
  if ($LASTEXITCODE -ne 0) {
    Write-Error "GitOps verification failed: one or more Argo CD Applications are missing or Kubernetes is unavailable."
    exit $LASTEXITCODE
  }
}
