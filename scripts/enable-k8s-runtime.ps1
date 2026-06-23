param(
  [Parameter(Mandatory = $true)][string]$GuestIp,
  [string]$User = 'infra',
  [string]$RepoRoot = (Split-Path -Parent $PSScriptRoot),
  [switch]$SkipComposeStop
)

$ErrorActionPreference = 'Stop'

function Invoke-Guest {
  param([string]$Command)
  ssh -o BatchMode=yes -o ConnectTimeout=10 "$User@$GuestIp" $Command
  if ($LASTEXITCODE -ne 0) {
    throw "Guest command failed with exit code ${LASTEXITCODE}: $Command"
  }
}

function Copy-DirectoryFiles {
  param(
    [string]$SourceDir,
    [string]$RemoteDir
  )
  if (-not (Test-Path -LiteralPath $SourceDir)) {
    throw "Source directory not found: $SourceDir"
  }
  Invoke-Guest "rm -rf '$RemoteDir' && mkdir -p '$RemoteDir'"
  $files = Get-ChildItem -LiteralPath $SourceDir -File
  if ($files.Count -eq 0) {
    throw "No files found in: $SourceDir"
  }
  foreach ($file in $files) {
    scp -o BatchMode=yes -o ConnectTimeout=10 $file.FullName "${User}@${GuestIp}:${RemoteDir}/"
    if ($LASTEXITCODE -ne 0) {
      throw "Failed to upload: $($file.FullName)"
    }
  }
}

$runtimeApps = Join-Path $RepoRoot 'gitops\argocd\runtime-applications'
Copy-DirectoryFiles -SourceDir $runtimeApps -RemoteDir '/tmp/project-truth-runtime-applications'

if (-not $SkipComposeStop) {
  Invoke-Guest @'
set -e
sudo systemctl stop project-truth-hris || true
cd /opt/project-truth/appliance
if docker compose version >/dev/null 2>&1; then
  docker compose -f docker-compose.environments.yml down --remove-orphans || true
  docker compose down --remove-orphans || true
else
  docker-compose -f docker-compose.environments.yml down --remove-orphans || true
  docker-compose down --remove-orphans || true
fi
'@
}

Invoke-Guest @'
set -e
for image in postgres:16-alpine hris-api-local:develop hris-api-db-init:develop hris-app-local:develop; do
  docker image inspect "$image" >/dev/null
done
sudo mkdir -p /var/lib/rancher/k3s/agent/images
docker save -o /tmp/project-truth-k8s-runtime-images.tar postgres:16-alpine hris-api-local:develop hris-api-db-init:develop hris-app-local:develop
sudo cp /tmp/project-truth-k8s-runtime-images.tar /var/lib/rancher/k3s/agent/images/project-truth-k8s-runtime-images.tar
sudo k3s ctr -n k8s.io images import /tmp/project-truth-k8s-runtime-images.tar
sudo mkdir -p \
  /var/lib/project-truth/k8s/prod/postgres /var/lib/project-truth/k8s/prod/uploads \
  /var/lib/project-truth/k8s/dev/postgres /var/lib/project-truth/k8s/dev/uploads \
  /var/lib/project-truth/k8s/uat/postgres /var/lib/project-truth/k8s/uat/uploads \
  /var/lib/rancher/k3s/server/manifests
sudo cp /tmp/project-truth-runtime-applications/*.yaml /var/lib/rancher/k3s/server/manifests/
sudo kubectl apply -n argocd -f /tmp/project-truth-runtime-applications
sudo kubectl get applications -n argocd -o wide
'@

& "$PSScriptRoot\verify-gitops-state.ps1" -GuestIp $GuestIp -RequireRuntimeApplications
& "$PSScriptRoot\watch-until-healthy.ps1" -GuestIp $GuestIp -MaxHours 1 -RetryIntervalSeconds 20
