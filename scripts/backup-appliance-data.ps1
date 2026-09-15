param(
  [Parameter(Mandatory = $true)][string]$GuestIp,
  [string]$User = 'infra',
  [string]$BackupRoot = (Join-Path (Split-Path -Parent $PSScriptRoot) '.runtime\backups')
)

$ErrorActionPreference = 'Stop'

$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$localDir = Join-Path $BackupRoot $stamp
$remoteDir = "/tmp/project-truth-backup-$stamp"
New-Item -ItemType Directory -Force -Path $localDir | Out-Null

function Invoke-Guest {
  param([string]$Command)
  ssh -o BatchMode=yes -o StrictHostKeyChecking=accept-new -o ConnectTimeout=10 "$User@$GuestIp" $Command
  if ($LASTEXITCODE -ne 0) {
    throw "Guest command failed with exit code ${LASTEXITCODE}: $Command"
  }
}

$backupCommand = @'
set -e
rm -rf "__REMOTE_DIR__"
mkdir -p "__REMOTE_DIR__"
docker exec bnpi-pats-postgres sh -lc 'pg_dump -U "${POSTGRES_USER:-postgres}" -d "${POSTGRES_DB:-bnpi-pats}" -Fc' > "__REMOTE_DIR__/bnpi-pats.dump"
docker exec bnpi-pats-api sh -lc 'cd /app/uploads && tar -czf /tmp/project-truth-apiuploads.tgz .'
docker cp bnpi-pats-api:/tmp/project-truth-apiuploads.tgz "__REMOTE_DIR__/apiuploads.tgz"
docker exec bnpi-pats-api rm -f /tmp/project-truth-apiuploads.tgz
docker ps --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}' > "__REMOTE_DIR__/docker-ps.txt"
project-truth-bnpi-pats-status > "__REMOTE_DIR__/project-truth-bnpi-pats-status.txt" 2>&1 || true
sudo kubectl get applications -n argocd -o wide > "__REMOTE_DIR__/argocd-applications.txt" 2>&1 || true
sha256sum "__REMOTE_DIR__/bnpi-pats.dump" "__REMOTE_DIR__/apiuploads.tgz" > "__REMOTE_DIR__/SHA256SUMS"
'@
Invoke-Guest ($backupCommand.Replace('__REMOTE_DIR__', $remoteDir))

scp -o BatchMode=yes -o StrictHostKeyChecking=accept-new -o ConnectTimeout=10 -r "${User}@${GuestIp}:${remoteDir}/*" $localDir
if ($LASTEXITCODE -ne 0) {
  throw "Failed to download backup from ${GuestIp}:${remoteDir}"
}

@{
  createdAt = (Get-Date).ToString('o')
  guestIp = $GuestIp
  user = $User
  backupPath = $localDir
  contents = @('bnpi-pats.dump', 'apiuploads.tgz', 'SHA256SUMS')
} | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath (Join-Path $localDir 'manifest.json') -Encoding UTF8

Invoke-Guest "rm -rf '$remoteDir'"

Write-Host "Project Truth appliance data backup: $localDir"
