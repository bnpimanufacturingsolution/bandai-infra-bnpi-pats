param(
  [Parameter(Mandatory = $true)][string]$GuestIp,
  [string]$User = 'infra',
  [string]$RepoRoot = (Split-Path -Parent $PSScriptRoot)
)

$ErrorActionPreference = 'Stop'

function Invoke-Guest {
  param([string]$Command)
  ssh -o BatchMode=yes -o ConnectTimeout=10 "$User@$GuestIp" $Command
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
  scp -o BatchMode=yes -o ConnectTimeout=10 $file.FullName "${User}@${GuestIp}:/tmp/project-truth-argocd-platform/"
  if ($LASTEXITCODE -ne 0) {
    throw "Failed to upload Argo CD platform manifest: $($file.FullName)"
  }
}

Invoke-Guest 'sudo kubectl apply -k /tmp/project-truth-argocd-platform && sudo kubectl get configmap argocd-cm -n argocd -o jsonpath="{.data.timeout\.reconciliation}{\"\n\"}"'
