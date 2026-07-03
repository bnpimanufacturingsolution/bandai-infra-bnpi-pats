param(
  [ValidateSet('prod', 'dev', 'uat')]
  [string]$Environment = 'prod',
  [int]$LocalPort = 0,
  [switch]$StopExisting
)

$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$runtimeRoot = Join-Path $repoRoot '.runtime\cloudflare-db-tcp'
$pidFile = Join-Path $runtimeRoot 'bnpi-db-access-active.json'
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$runRoot = Join-Path $runtimeRoot "bnpi-db-access-$stamp"

$targets = @{
  prod = [pscustomobject]@{ Hostname = 'db.bnpi-hris.tech'; PreferredPort = 5432; FallbackPort = 55432 }
  dev  = [pscustomobject]@{ Hostname = 'dev-db.bnpi-hris.tech'; PreferredPort = 5433; FallbackPort = 55433 }
  uat  = [pscustomobject]@{ Hostname = 'uat-db.bnpi-hris.tech'; PreferredPort = 5434; FallbackPort = 55434 }
}

function Stop-ExistingForward {
  if (-not (Test-Path -LiteralPath $pidFile)) { return }
  $records = @(Get-Content -Raw -LiteralPath $pidFile | ConvertFrom-Json)
  foreach ($record in $records) {
    try {
      Stop-Process -Id $record.ProcessId -Force -ErrorAction Stop
      Write-Host "Stopped $($record.Environment) DB forward PID $($record.ProcessId)"
    } catch {
      Write-Host "DB forward PID $($record.ProcessId) is not running"
    }
  }
  Remove-Item -LiteralPath $pidFile -Force -ErrorAction SilentlyContinue
}

function Test-PortFree {
  param([int]$Port)
  -not [bool](Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue)
}

if ($StopExisting) {
  Stop-ExistingForward
  if (-not $Environment) { return }
}

$cloudflared = Get-Command cloudflared -ErrorAction SilentlyContinue
if (-not $cloudflared) {
  throw 'cloudflared not found. Install cloudflared, then rerun this command.'
}

$target = $targets[$Environment]
if ($LocalPort -le 0) {
  $LocalPort = if (Test-PortFree -Port $target.PreferredPort) { $target.PreferredPort } else { $target.FallbackPort }
}
if (-not (Test-PortFree -Port $LocalPort)) {
  throw "Local port $LocalPort is already in use. Pass -LocalPort with another value, for example 55432."
}

New-Item -ItemType Directory -Force -Path $runRoot | Out-Null
$stdoutPath = Join-Path $runRoot "$Environment.stdout.log"
$stderrPath = Join-Path $runRoot "$Environment.stderr.log"

$process = Start-Process -FilePath $cloudflared.Source `
  -ArgumentList @('access', 'tcp', '--hostname', $target.Hostname, '--url', "localhost:$LocalPort") `
  -RedirectStandardOutput $stdoutPath `
  -RedirectStandardError $stderrPath `
  -WindowStyle Hidden `
  -PassThru

Start-Sleep -Seconds 3
$listening = [bool](Get-NetTCPConnection -LocalPort $LocalPort -State Listen -ErrorAction SilentlyContinue)
if (-not $listening) {
  $stderrText = Get-Content -Raw -LiteralPath $stderrPath -ErrorAction SilentlyContinue
  throw "Cloudflare DB forward did not start on localhost:$LocalPort. $stderrText"
}

$record = [pscustomobject]@{
  GeneratedAt = (Get-Date).ToString('o')
  Environment = $Environment
  Hostname = $target.Hostname
  LocalPort = $LocalPort
  ProcessId = $process.Id
  DatabaseUrl = "postgresql://postgres:postgres@localhost:$LocalPort/hris"
  StopCommand = '.\scripts\project-truth.ps1 start-bnpi-db-access -StopExisting'
  Stdout = $stdoutPath
  Stderr = $stderrPath
}

$record | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath (Join-Path $runRoot 'bnpi-db-access.json') -Encoding UTF8
$record | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath $pidFile -Encoding UTF8

Write-Host "BNPI $Environment database forward is running."
Write-Host "DATABASE_URL=$($record.DatabaseUrl)"
Write-Host "Stop with: $($record.StopCommand)"
Write-Host "Evidence: $(Join-Path $runRoot 'bnpi-db-access.json')"
