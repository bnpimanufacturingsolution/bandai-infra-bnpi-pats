param(
  [Parameter(Mandatory = $true)][string]$GuestIp,
  [string]$User = 'infra',
  [string]$RepoRoot = (Split-Path -Parent $PSScriptRoot),
  [ValidateSet('Status','GitOpsRefresh','RestartRuntime','FullRepair')]
  [string]$Mode = 'FullRepair'
)

$ErrorActionPreference = 'Stop'

function Invoke-Guest {
  param([string]$Command)
  ssh -o BatchMode=yes -o StrictHostKeyChecking=accept-new -o ConnectTimeout=10 "$User@$GuestIp" $Command
}

function Copy-HostGitOpsApplications {
  $appsDir = Join-Path $RepoRoot 'gitops\argocd\applications'
  if (-not (Test-Path -LiteralPath $appsDir)) {
    throw "Host GitOps applications directory not found: $appsDir"
  }

  Invoke-Guest 'rm -rf /tmp/project-truth-argocd-applications && mkdir -p /tmp/project-truth-argocd-applications'
  $manifests = Get-ChildItem -LiteralPath $appsDir -Filter '*.yaml' -File
  if ($manifests.Count -eq 0) {
    throw "No Argo CD Application manifests found in: $appsDir"
  }
  foreach ($manifest in $manifests) {
    scp -o BatchMode=yes -o StrictHostKeyChecking=accept-new -o ConnectTimeout=10 $manifest.FullName "${User}@${GuestIp}:/tmp/project-truth-argocd-applications/"
    if ($LASTEXITCODE -ne 0) {
      throw "Failed to upload Argo CD Application manifest: $($manifest.FullName)"
    }
  }
  Invoke-Guest 'sudo mkdir -p /var/lib/rancher/k3s/server/manifests && sudo cp /tmp/project-truth-argocd-applications/*.yaml /var/lib/rancher/k3s/server/manifests/ && sudo kubectl apply -n argocd -f /tmp/project-truth-argocd-applications'
}

function Copy-HostArgocdPlatform {
  $platformDir = Join-Path $RepoRoot 'gitops\argocd\platform'
  if (-not (Test-Path -LiteralPath $platformDir)) {
    throw "Host Argo CD platform directory not found: $platformDir"
  }

  Invoke-Guest 'rm -rf /tmp/project-truth-argocd-platform && mkdir -p /tmp/project-truth-argocd-platform'
  $manifests = Get-ChildItem -LiteralPath $platformDir -Filter '*.yaml' -File
  if ($manifests.Count -eq 0) {
    throw "No Argo CD platform manifests found in: $platformDir"
  }
  foreach ($manifest in $manifests) {
    scp -o BatchMode=yes -o StrictHostKeyChecking=accept-new -o ConnectTimeout=10 $manifest.FullName "${User}@${GuestIp}:/tmp/project-truth-argocd-platform/"
    if ($LASTEXITCODE -ne 0) {
      throw "Failed to upload Argo CD platform manifest: $($manifest.FullName)"
    }
  }
  Invoke-Guest 'sudo kubectl apply -k /tmp/project-truth-argocd-platform'
}

$status = @'
set -e
echo "===== host ====="
hostname
ip -br addr || true
echo "===== docker ====="
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}" || true
echo "===== hris ====="
project-truth-hris-status || true
echo "===== kubernetes ====="
sudo kubectl get nodes -o wide || true
sudo kubectl get pods -A -o wide || true
sudo kubectl get svc -A || true
echo "===== argocd ====="
sudo kubectl get applications -n argocd -o wide || true
'@

$gitopsRefresh = @'
set -e
echo "Refreshing Argo CD applications from in-image bootstrap manifests when present."
if [ -d /opt/project-truth/gitops/argocd/applications ]; then
  sudo kubectl apply -n argocd -f /opt/project-truth/gitops/argocd/applications
else
  echo "No /opt/project-truth/gitops/argocd/applications directory found; relying on existing Argo CD app definitions."
fi
sudo kubectl get applications -n argocd -o wide || true
'@

$verifyApplications = @'
set -e
missing=""
for app in project-truth-dev project-truth-uat project-truth-prod; do
  if ! sudo kubectl get application -n argocd "$app" >/dev/null 2>&1; then
    missing="$missing $app"
  fi
done
if [ -n "$missing" ]; then
  echo "MISSING_ARGO_APPLICATIONS:$missing" >&2
  exit 42
fi
sudo kubectl get applications -n argocd -o wide
'@

function Repair-GitOpsApplications {
  Copy-HostArgocdPlatform
  Invoke-Guest $gitopsRefresh
  Invoke-Guest $verifyApplications
  $verifyExit = $LASTEXITCODE
  if ($verifyExit -eq 42) {
    Write-Warning "Argo CD Applications are missing after in-image refresh. Uploading host GitOps application manifests."
    Copy-HostGitOpsApplications
    Invoke-Guest $verifyApplications
  } elseif ($verifyExit -ne 0) {
    throw "Argo CD Application verification failed with exit code $verifyExit"
  }
}

$restartRuntime = @'
set -e
echo "Restarting Project Truth runtime services."
sudo systemctl restart docker || true
sudo systemctl restart k3s || true
sudo systemctl restart project-truth-hris || true
if command -v project-truth-hris-env-start >/dev/null 2>&1; then
  sudo project-truth-hris-env-start || true
fi
if command -v project-truth-hris-observability-start >/dev/null 2>&1; then
  sudo project-truth-hris-observability-start || true
fi
project-truth-hris-status || true
'@

switch ($Mode) {
  'Status' {
    Invoke-Guest $status
  }
  'GitOpsRefresh' {
    Repair-GitOpsApplications
    Invoke-Guest $status
  }
  'RestartRuntime' {
    Invoke-Guest $restartRuntime
    Invoke-Guest $status
  }
  'FullRepair' {
    Repair-GitOpsApplications
    Invoke-Guest $restartRuntime
    Invoke-Guest $status
    & "$PSScriptRoot\verify-lan-health.ps1" -GuestIp $GuestIp
  }
}
