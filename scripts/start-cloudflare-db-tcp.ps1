param(
  [string]$GuestIp = '',
  [switch]$HostLocal,
  [switch]$StopExisting,
  [string]$ProdHostname = $(if ($env:PROJECT_TRUTH_CF_PROD_DB_HOSTNAME) { $env:PROJECT_TRUTH_CF_PROD_DB_HOSTNAME } else { 'db.bnpipats.tech' }),
  [string]$DevHostname = $(if ($env:PROJECT_TRUTH_CF_DEV_DB_HOSTNAME) { $env:PROJECT_TRUTH_CF_DEV_DB_HOSTNAME } else { 'dev-db.bnpipats.tech' }),
  [string]$UatHostname = $(if ($env:PROJECT_TRUTH_CF_UAT_DB_HOSTNAME) { $env:PROJECT_TRUTH_CF_UAT_DB_HOSTNAME } else { 'uat-db.bnpipats.tech' }),
  [int]$ProdClientPort = $(if ($env:PROJECT_TRUTH_CF_PROD_DB_CLIENT_PORT) { [int]$env:PROJECT_TRUTH_CF_PROD_DB_CLIENT_PORT } else { 5432 }),
  [int]$DevClientPort = $(if ($env:PROJECT_TRUTH_CF_DEV_DB_CLIENT_PORT) { [int]$env:PROJECT_TRUTH_CF_DEV_DB_CLIENT_PORT } else { 5433 }),
  [int]$UatClientPort = $(if ($env:PROJECT_TRUTH_CF_UAT_DB_CLIENT_PORT) { [int]$env:PROJECT_TRUTH_CF_UAT_DB_CLIENT_PORT } else { 5434 }),
  [int]$StartupTimeoutSeconds = 10
)

$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$runtimeRoot = Join-Path $repoRoot '.runtime\cloudflare-db-tcp'
$pidFile = Join-Path $runtimeRoot 'active-pids.json'
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$runRoot = Join-Path $runtimeRoot $stamp

function Stop-ActiveTcpTunnels {
  if (-not (Test-Path -LiteralPath $pidFile)) { return }
  $active = Get-Content -Raw -LiteralPath $pidFile | ConvertFrom-Json
  foreach ($item in @($active)) {
    try {
      $process = Get-Process -Id $item.ProcessId -ErrorAction Stop
      Stop-Process -Id $process.Id -Force
      Write-Host "Stopped $($item.Name) cloudflared PID $($process.Id)"
    } catch {
      Write-Host "PID $($item.ProcessId) for $($item.Name) is not running"
    }
  }
  Remove-Item -LiteralPath $pidFile -Force -ErrorAction SilentlyContinue
}

if ($StopExisting) {
  Stop-ActiveTcpTunnels
  if (-not $GuestIp -and -not $HostLocal) { return }
}

$cloudflared = Get-Command cloudflared -ErrorAction SilentlyContinue
if (-not $cloudflared) {
  throw 'cloudflared not found in PATH. Install cloudflared and authenticate with Cloudflare Access/Tunnel first.'
}

$targetHost = if ($HostLocal) { '127.0.0.1' } elseif ($GuestIp) { $GuestIp } else { throw 'Pass -GuestIp <vm-lan-ip> or -HostLocal.' }

$targets = @(
  [pscustomobject]@{ Name = 'prod-db'; Hostname = $ProdHostname; TargetUrl = "tcp://${targetHost}:15432"; ClientPort = $ProdClientPort },
  [pscustomobject]@{ Name = 'dev-db'; Hostname = $DevHostname; TargetUrl = "tcp://${targetHost}:15433"; ClientPort = $DevClientPort },
  [pscustomobject]@{ Name = 'uat-db'; Hostname = $UatHostname; TargetUrl = "tcp://${targetHost}:15434"; ClientPort = $UatClientPort }
)

$missing = @($targets | Where-Object { [string]::IsNullOrWhiteSpace($_.Hostname) })
if ($missing.Count -gt 0) {
  Write-Warning "Cloudflare DB TCP hostnames are missing: $($missing.Name -join ', ')"
  Write-Host 'Set these environment variables or pass parameters:'
  Write-Host '  PROJECT_TRUTH_CF_PROD_DB_HOSTNAME=db.bnpipats.tech'
  Write-Host '  PROJECT_TRUTH_CF_DEV_DB_HOSTNAME=dev-db.bnpipats.tech'
  Write-Host '  PROJECT_TRUTH_CF_UAT_DB_HOSTNAME=uat-db.bnpipats.tech'
  Write-Host 'Cloudflare requirements: managed domain on Cloudflare, named tunnel auth, Access policy, and cloudflared on every DB client.'
  Write-Host "LAN URLs remain available at:"
  Write-Host "  postgresql://postgres:postgres@${targetHost}:15432/bnpi_pats"
  Write-Host "  postgresql://postgres:postgres@${targetHost}:15433/bnpi_pats"
  Write-Host "  postgresql://postgres:postgres@${targetHost}:15434/bnpi_pats"
  exit 2
}

New-Item -ItemType Directory -Force -Path $runRoot | Out-Null
$processRecords = @()

foreach ($target in $targets) {
  $stdoutPath = Join-Path $runRoot "$($target.Name).stdout.log"
  $stderrPath = Join-Path $runRoot "$($target.Name).stderr.log"
  $process = Start-Process -FilePath $cloudflared.Source `
    -ArgumentList @('tunnel', '--no-autoupdate', '--hostname', $target.Hostname, '--url', $target.TargetUrl) `
    -RedirectStandardOutput $stdoutPath `
    -RedirectStandardError $stderrPath `
    -WindowStyle Hidden `
    -PassThru

  Start-Sleep -Seconds $StartupTimeoutSeconds
  $processRecords += [pscustomobject]@{
    Name = $target.Name
    ProcessId = $process.Id
    Hostname = $target.Hostname
    TargetUrl = $target.TargetUrl
    ClientCommand = "cloudflared access tcp --hostname $($target.Hostname) --url localhost:$($target.ClientPort)"
    DatabaseUrl = "postgresql://postgres:postgres@localhost:$($target.ClientPort)/bnpi_pats"
    RequestedPublicUrl = "postgresql://postgres:postgres@$($target.Hostname):5432/bnpi_pats"
    RequestedPublicUrlStatus = 'Not valid with normal Cloudflare Access TCP; use the local DatabaseUrl after starting the client-side cloudflared access tcp process.'
  }
}

$processRecords | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath $pidFile -Encoding utf8
$processRecords | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath (Join-Path $runRoot 'cloudflare-db-tcp.json') -Encoding utf8

Write-Host "Cloudflare DB TCP tunnel processes started."
Write-Host "Evidence: $runRoot"
$processRecords | Format-Table -AutoSize
Write-Host ''
Write-Host 'Run these on each client machine before opening psql/DB tools:'
foreach ($record in $processRecords) {
  Write-Host "  $($record.ClientCommand)"
}
Write-Host ''
Write-Host 'Then use these DB URLs locally:'
foreach ($record in $processRecords) {
  Write-Host "  $($record.Name): $($record.DatabaseUrl)"
}
Write-Host ''
Write-Host 'Direct URLs like postgresql://postgres:postgres@db.bnpipats.tech:5432/bnpi_pats require WARP private routing or Spectrum/raw TCP, not normal Cloudflare Access TCP.'
