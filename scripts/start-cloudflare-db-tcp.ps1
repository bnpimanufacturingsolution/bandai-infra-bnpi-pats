param(
  [string]$GuestIp = '',
  [switch]$HostLocal,
  [switch]$StopExisting,
  [string]$ProdHostname = $env:PROJECT_TRUTH_CF_PROD_DB_HOSTNAME,
  [string]$DevHostname = $env:PROJECT_TRUTH_CF_DEV_DB_HOSTNAME,
  [string]$UatHostname = $env:PROJECT_TRUTH_CF_UAT_DB_HOSTNAME,
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
  [pscustomobject]@{ Name = 'prod-db'; Hostname = $ProdHostname; TargetUrl = "tcp://${targetHost}:15432"; ClientPort = 15432 },
  [pscustomobject]@{ Name = 'dev-db'; Hostname = $DevHostname; TargetUrl = "tcp://${targetHost}:15433"; ClientPort = 15433 },
  [pscustomobject]@{ Name = 'uat-db'; Hostname = $UatHostname; TargetUrl = "tcp://${targetHost}:15434"; ClientPort = 15434 }
)

$missing = @($targets | Where-Object { [string]::IsNullOrWhiteSpace($_.Hostname) })
if ($missing.Count -gt 0) {
  Write-Warning "Cloudflare DB TCP hostnames are missing: $($missing.Name -join ', ')"
  Write-Host 'Set these environment variables or pass parameters:'
  Write-Host '  PROJECT_TRUTH_CF_PROD_DB_HOSTNAME=prod-db.example.com'
  Write-Host '  PROJECT_TRUTH_CF_DEV_DB_HOSTNAME=dev-db.example.com'
  Write-Host '  PROJECT_TRUTH_CF_UAT_DB_HOSTNAME=uat-db.example.com'
  Write-Host 'Cloudflare requirements: managed domain on Cloudflare, named tunnel auth, Access policy, and cloudflared on every DB client.'
  Write-Host "LAN URLs remain available at:"
  Write-Host "  postgresql://postgres:postgres@${targetHost}:15432/hris"
  Write-Host "  postgresql://postgres:postgres@${targetHost}:15433/hris"
  Write-Host "  postgresql://postgres:postgres@${targetHost}:15434/hris"
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
    DatabaseUrl = "postgresql://postgres:postgres@localhost:$($target.ClientPort)/hris"
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
