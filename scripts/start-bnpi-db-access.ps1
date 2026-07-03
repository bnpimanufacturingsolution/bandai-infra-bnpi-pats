param(
  [ValidateSet('prod', 'dev', 'uat', 'all')]
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
  prod = [pscustomobject]@{ Hostname = 'db.bnpi-hris.tech'; PreferredPort = 55432; FallbackPort = 56532 }
  dev  = [pscustomobject]@{ Hostname = 'dev-db.bnpi-hris.tech'; PreferredPort = 55433; FallbackPort = 56533 }
  uat  = [pscustomobject]@{ Hostname = 'uat-db.bnpi-hris.tech'; PreferredPort = 55434; FallbackPort = 56534 }
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
  if ($PSBoundParameters.Count -eq 1) { return }
}

$cloudflared = Get-Command cloudflared -ErrorAction SilentlyContinue
if (-not $cloudflared) {
  throw 'cloudflared not found. Install cloudflared, then rerun this command.'
}

New-Item -ItemType Directory -Force -Path $runRoot | Out-Null
$selected = if ($Environment -eq 'all') { @('prod', 'dev', 'uat') } else { @($Environment) }
if ($LocalPort -gt 0 -and $selected.Count -gt 1) {
  throw '-LocalPort can only be used when starting one environment.'
}

$records = @()
foreach ($envName in $selected) {
  $target = $targets[$envName]
  $port = $LocalPort
  if ($port -le 0) {
    $port = if (Test-PortFree -Port $target.PreferredPort) { $target.PreferredPort } else { $target.FallbackPort }
  }
  if (-not (Test-PortFree -Port $port)) {
    throw "Local port $port is already in use for $envName. Pass -LocalPort with another value."
  }

  $stdoutPath = Join-Path $runRoot "$envName.stdout.log"
  $stderrPath = Join-Path $runRoot "$envName.stderr.log"
  $process = Start-Process -FilePath $cloudflared.Source `
    -ArgumentList @('access', 'tcp', '--hostname', $target.Hostname, '--url', "localhost:$port") `
    -RedirectStandardOutput $stdoutPath `
    -RedirectStandardError $stderrPath `
    -WindowStyle Hidden `
    -PassThru

  Start-Sleep -Seconds 3
  $listening = [bool](Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue)
  if (-not $listening) {
    $stderrText = Get-Content -Raw -LiteralPath $stderrPath -ErrorAction SilentlyContinue
    throw "Cloudflare DB forward did not start on localhost:$port. $stderrText"
  }

  $records += [pscustomobject]@{
    GeneratedAt = (Get-Date).ToString('o')
    Environment = $envName
    Hostname = $target.Hostname
    LocalPort = $port
    ProcessId = $process.Id
    DatabaseUrl = "postgresql://postgres:postgres@localhost:$port/hris"
    SchemaDatabaseUrl = "postgresql://postgres:postgres@localhost:$port/hris?schema=public"
    StopCommand = '.\scripts\project-truth.ps1 start-bnpi-db-access -StopExisting'
    Stdout = $stdoutPath
    Stderr = $stderrPath
  }
}

$records | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath (Join-Path $runRoot 'bnpi-db-access.json') -Encoding UTF8
$records | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath $pidFile -Encoding UTF8

Write-Host "BNPI database forward(s) running."
foreach ($record in $records) {
  Write-Host "$($record.Environment.ToUpper())_DATABASE_URL=$($record.DatabaseUrl)"
}
Write-Host "Stop with: .\scripts\project-truth.ps1 start-bnpi-db-access -StopExisting"
Write-Host "Evidence: $(Join-Path $runRoot 'bnpi-db-access.json')"
