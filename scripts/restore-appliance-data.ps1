param(
  [Parameter(Mandatory = $true)][string]$GuestIp,
  [Parameter(Mandatory = $true)][string]$BackupPath,
  [string]$User = 'infra',
  [switch]$Force
)

$ErrorActionPreference = 'Stop'

if (-not $Force) {
  throw "Restore is destructive. Re-run with -Force after confirming BackupPath and GuestIp."
}

$backup = Resolve-Path -LiteralPath $BackupPath
$dump = Join-Path $backup 'bnpi-pats.dump'
$uploads = Join-Path $backup 'apiuploads.tgz'
if (-not (Test-Path -LiteralPath $dump)) {
  throw "Backup is missing bnpi-pats.dump: $dump"
}
if (-not (Test-Path -LiteralPath $uploads)) {
  throw "Backup is missing apiuploads.tgz: $uploads"
}

$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$remoteDir = "/tmp/project-truth-restore-$stamp"

function Invoke-Guest {
  param([string]$Command)
  ssh -o BatchMode=yes -o StrictHostKeyChecking=accept-new -o ConnectTimeout=10 "$User@$GuestIp" $Command
  if ($LASTEXITCODE -ne 0) {
    throw "Guest command failed with exit code ${LASTEXITCODE}: $Command"
  }
}

Invoke-Guest "rm -rf '$remoteDir' && mkdir -p '$remoteDir'"
scp -o BatchMode=yes -o StrictHostKeyChecking=accept-new -o ConnectTimeout=10 $dump "${User}@${GuestIp}:${remoteDir}/bnpi-pats.dump"
if ($LASTEXITCODE -ne 0) {
  throw "Failed to upload database dump."
}
scp -o BatchMode=yes -o StrictHostKeyChecking=accept-new -o ConnectTimeout=10 $uploads "${User}@${GuestIp}:${remoteDir}/apiuploads.tgz"
if ($LASTEXITCODE -ne 0) {
  throw "Failed to upload uploads archive."
}

$restoreCommand = @'
set -e
cd /opt/project-truth/appliance
docker compose stop bnpi-pats-app bnpi-pats-api || docker-compose stop bnpi-pats-app bnpi-pats-api
cat "__REMOTE_DIR__/bnpi-pats.dump" | docker exec -i bnpi-pats-postgres sh -lc 'pg_restore -U "${POSTGRES_USER:-postgres}" -d "${POSTGRES_DB:-bnpi-pats}" --clean --if-exists --no-owner'
docker cp "__REMOTE_DIR__/apiuploads.tgz" bnpi-pats-api:/tmp/project-truth-apiuploads.tgz
docker exec bnpi-pats-api sh -lc 'rm -rf /app/uploads/* && cd /app/uploads && tar -xzf /tmp/project-truth-apiuploads.tgz && rm -f /tmp/project-truth-apiuploads.tgz'
docker compose up -d bnpi-pats-api bnpi-pats-app || docker-compose up -d bnpi-pats-api bnpi-pats-app
project-truth-bnpi-pats-status || true
'@
Invoke-Guest ($restoreCommand.Replace('__REMOTE_DIR__', $remoteDir))

Invoke-Guest "rm -rf '$remoteDir'"
& "$PSScriptRoot\verify-lan-health.ps1" -GuestIp $GuestIp
