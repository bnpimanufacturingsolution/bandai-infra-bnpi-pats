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
  $runRoot = Join-Path (Join-Path (Split-Path -Parent $PSScriptRoot) '.runtime\verify-gitops-state') (Get-Date -Format 'yyyyMMdd-HHmmss')
  New-Item -ItemType Directory -Force -Path $runRoot | Out-Null
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
  $remote = $remoteScript.Replace('__RUNTIME_CHECK__', $runtimeCheck)
  $localScript = Join-Path $runRoot 'verify-gitops-state.sh'
  $remotePath = "/tmp/project-truth-verify-gitops-$([System.Diagnostics.Process]::GetCurrentProcess().Id).sh"
  $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
  $normalizedRemote = ($remote -replace "`r`n", "`n") -replace "`r", "`n"
  [System.IO.File]::WriteAllText($localScript, ($normalizedRemote.TrimEnd() + "`n"), $utf8NoBom)
  scp -o BatchMode=yes -o StrictHostKeyChecking=accept-new -o ConnectTimeout=10 $localScript "${User}@${GuestIp}:${remotePath}" | Out-Null
  if ($LASTEXITCODE -ne 0) {
    Write-Error "GitOps verification failed: could not stage remote script on ${GuestIp}."
    exit $LASTEXITCODE
  }
  ssh -o BatchMode=yes -o StrictHostKeyChecking=accept-new -o ConnectTimeout=10 "$User@$GuestIp" "chmod 700 '$remotePath' && bash '$remotePath'; rc=`$?; rm -f '$remotePath'; exit `$rc"
  if ($LASTEXITCODE -ne 0) {
    Write-Error "GitOps verification failed: one or more Argo CD Applications are missing or Kubernetes is unavailable."
    exit $LASTEXITCODE
  }
}
