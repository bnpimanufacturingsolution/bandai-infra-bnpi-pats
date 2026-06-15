param(
  [string]$GuestIp = '',
  [int]$MaxHours = 8,
  [int]$RetryIntervalSeconds = 30
)

$ErrorActionPreference = 'Continue'
$deadline = (Get-Date).AddHours($MaxHours)
$runDir = Join-Path (Join-Path (Split-Path -Parent $PSScriptRoot) '.runtime\health') (Get-Date -Format 'yyyyMMdd-HHmmss')
New-Item -ItemType Directory -Force -Path $runDir | Out-Null
$log = Join-Path $runDir 'watch.log'

while ((Get-Date) -lt $deadline) {
  "[$(Get-Date -Format o)] health attempt" | Tee-Object -FilePath $log -Append
  & "$PSScriptRoot\verify-host-health.ps1" -GuestIp $GuestIp *>&1 | Tee-Object -FilePath $log -Append
  if ($LASTEXITCODE -eq 0) {
    if ($GuestIp) {
      ssh -o BatchMode=yes -o ConnectTimeout=5 "infra@$GuestIp" "hostname; ip -br addr; docker ps || true; sudo kubectl get nodes; sudo kubectl get pods -A; sudo kubectl get svc -A; sudo kubectl get applications -n argocd || true" *>&1 | Tee-Object -FilePath $log -Append
    }
    Write-Host "SUCCESS: health checks passed. Log: $log"
    exit 0
  }
  Start-Sleep -Seconds $RetryIntervalSeconds
}

Write-Warning "TIMEOUT: health checks did not pass before deadline. Log: $log"
exit 124
