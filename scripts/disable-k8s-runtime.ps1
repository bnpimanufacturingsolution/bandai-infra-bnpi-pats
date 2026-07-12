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
sudo kubectl delete -n dev deployment/hris-app deployment/hris-emp-app deployment/hris-api statefulset/hris-postgres job/hris-api-db-init service/hris-app service/hris-emp-app service/hris-api service/hris-postgres pvc/hris-postgres pvc/hris-uploads secret/hris-postgres-env --ignore-not-found
sudo kubectl delete -n uat deployment/hris-app deployment/hris-emp-app deployment/hris-api statefulset/hris-postgres job/hris-api-db-init service/hris-app service/hris-emp-app service/hris-api service/hris-postgres pvc/hris-postgres pvc/hris-uploads secret/hris-postgres-env --ignore-not-found
sudo kubectl delete -n prod deployment/hris-app deployment/hris-emp-app deployment/hris-api statefulset/hris-postgres job/hris-api-db-init service/hris-app service/hris-emp-app service/hris-api service/hris-postgres pvc/hris-postgres pvc/hris-uploads secret/hris-postgres-env --ignore-not-found
'@

if ($RestartCompose) {
  Invoke-Guest 'sudo systemctl start project-truth-hris'
  & "$PSScriptRoot\watch-until-healthy.ps1" -GuestIp $GuestIp -MaxHours 1 -RetryIntervalSeconds 20
}
