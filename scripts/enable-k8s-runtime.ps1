param(
  [Parameter(Mandatory = $true)][string]$GuestIp,
  [string]$User = 'infra',
  [string]$RepoRoot = (Split-Path -Parent $PSScriptRoot),
  [ValidatePattern('^[A-Za-z0-9._-]+$')]
  [string]$ImageTag = 'develop',
  [switch]$SkipComposeStop
)

$ErrorActionPreference = 'Stop'

function Invoke-Guest {
  param([string]$Command)
  ssh -o BatchMode=yes -o StrictHostKeyChecking=accept-new -o ConnectTimeout=10 "$User@$GuestIp" $Command
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
    scp -o BatchMode=yes -o StrictHostKeyChecking=accept-new -o ConnectTimeout=10 $file.FullName "${User}@${GuestIp}:${RemoteDir}/"
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
sudo systemctl stop project-truth-bnpi-pats || true
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

$imageImportScript = @'
set -e
image_tag='__IMAGE_TAG__'
for image_name in bnpi-pats-api-local bnpi-pats-api-db-init bnpi-pats-app-local; do
  if ! docker image inspect "${image_name}:${image_tag}" >/dev/null 2>&1; then
    if [ "${image_tag}" != "develop" ] && docker image inspect "${image_name}:develop" >/dev/null 2>&1; then
      docker tag "${image_name}:develop" "${image_name}:${image_tag}"
    fi
  fi
done
for image in postgres:16-alpine "bnpi-pats-api-local:${image_tag}" "bnpi-pats-api-db-init:${image_tag}" "bnpi-pats-app-local:${image_tag}"; do
  docker image inspect "$image" >/dev/null
done
sudo mkdir -p /var/lib/rancher/k3s/agent/images
docker save -o /tmp/project-truth-k8s-runtime-images.tar postgres:16-alpine "bnpi-pats-api-local:${image_tag}" "bnpi-pats-api-db-init:${image_tag}" "bnpi-pats-app-local:${image_tag}"
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

Invoke-Guest ($imageImportScript.Replace('__IMAGE_TAG__', $ImageTag))

& "$PSScriptRoot\verify-gitops-state.ps1" -GuestIp $GuestIp -RequireRuntimeApplications
& "$PSScriptRoot\watch-until-healthy.ps1" -GuestIp $GuestIp -MaxHours 1 -RetryIntervalSeconds 20
