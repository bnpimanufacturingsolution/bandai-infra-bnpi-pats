param(
  [Parameter(Mandatory = $true)][string]$GuestIp,
  [string]$User = 'infra',
  [switch]$RestartCompose
)

$ErrorActionPreference = 'Stop'

function Invoke-Guest {
  param([string]$Command)
  ssh -o BatchMode=yes -o StrictHostKeyChecking=accept-new -o ConnectTimeout=10 "$User@$GuestIp" $Command
  if ($LASTEXITCODE -ne 0) {
    throw "Guest command failed with exit code ${LASTEXITCODE}: $Command"
  }
}

Invoke-Guest @'
set -e
sudo rm -f \
  /var/lib/rancher/k3s/server/manifests/project-truth-runtime-dev.yaml \
  /var/lib/rancher/k3s/server/manifests/project-truth-runtime-uat.yaml \
  /var/lib/rancher/k3s/server/manifests/project-truth-runtime-prod.yaml
sudo kubectl delete application -n argocd project-truth-runtime-dev project-truth-runtime-uat project-truth-runtime-prod --ignore-not-found
sudo kubectl delete -n dev deployment/bnpi-pats-app deployment/bnpi-pats-emp-app deployment/bnpi-pats-api statefulset/bnpi-pats-postgres job/bnpi-pats-api-db-init service/bnpi-pats-app service/bnpi-pats-emp-app service/bnpi-pats-api service/bnpi-pats-postgres pvc/bnpi-pats-postgres pvc/bnpi-pats-uploads secret/bnpi-pats-postgres-env --ignore-not-found
sudo kubectl delete -n uat deployment/bnpi-pats-app deployment/bnpi-pats-emp-app deployment/bnpi-pats-api statefulset/bnpi-pats-postgres job/bnpi-pats-api-db-init service/bnpi-pats-app service/bnpi-pats-emp-app service/bnpi-pats-api service/bnpi-pats-postgres pvc/bnpi-pats-postgres pvc/bnpi-pats-uploads secret/bnpi-pats-postgres-env --ignore-not-found
sudo kubectl delete -n prod deployment/bnpi-pats-app deployment/bnpi-pats-emp-app deployment/bnpi-pats-api statefulset/bnpi-pats-postgres job/bnpi-pats-api-db-init service/bnpi-pats-app service/bnpi-pats-emp-app service/bnpi-pats-api service/bnpi-pats-postgres pvc/bnpi-pats-postgres pvc/bnpi-pats-uploads secret/bnpi-pats-postgres-env --ignore-not-found
'@

if ($RestartCompose) {
  Invoke-Guest 'sudo systemctl start project-truth-bnpi-pats'
  & "$PSScriptRoot\watch-until-healthy.ps1" -GuestIp $GuestIp -MaxHours 1 -RetryIntervalSeconds 20
}
