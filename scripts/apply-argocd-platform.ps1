param(
  [Parameter(Mandatory = $true)][string]$GuestIp,
  [string]$User = 'infra',
  [string]$KeyPath = (Join-Path $env:USERPROFILE '.ssh\node-health-appliance_ed25519'),
  [string]$RepoRoot = (Split-Path -Parent $PSScriptRoot)
)

$ErrorActionPreference = 'Stop'

function Invoke-Guest {
  param([string]$Command)
  ssh -i $KeyPath -o BatchMode=yes -o StrictHostKeyChecking=accept-new -o ConnectTimeout=10 "$User@$GuestIp" $Command
  if ($LASTEXITCODE -ne 0) {
    throw "Guest command failed with exit code ${LASTEXITCODE}: $Command"
  }
}

$platformDir = Join-Path $RepoRoot 'gitops\argocd\platform'
if (-not (Test-Path -LiteralPath $platformDir)) {
  throw "Argo CD platform directory not found: $platformDir"
}

Invoke-Guest 'rm -rf /tmp/project-truth-argocd-platform && mkdir -p /tmp/project-truth-argocd-platform'
$files = Get-ChildItem -LiteralPath $platformDir -Filter '*.yaml' -File
foreach ($file in $files) {
  scp -i $KeyPath -o BatchMode=yes -o StrictHostKeyChecking=accept-new -o ConnectTimeout=10 $file.FullName "${User}@${GuestIp}:/tmp/project-truth-argocd-platform/"
  if ($LASTEXITCODE -ne 0) {
    throw "Failed to upload Argo CD platform manifest: $($file.FullName)"
  }
}

Invoke-Guest 'sudo kubectl apply -k /tmp/project-truth-argocd-platform && sudo kubectl -n argocd set env deployment/argocd-repo-server ARGOCD_GIT_MODULES_ENABLED=false && sudo kubectl -n argocd rollout status deployment/argocd-repo-server --timeout=180s && sudo kubectl get configmap argocd-cm -n argocd -o jsonpath="{.data.timeout\.reconciliation}{\"\n\"}"'
