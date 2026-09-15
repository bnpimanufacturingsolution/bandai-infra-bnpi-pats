param(
  [string]$GuestIp = '',
  [switch]$HostLocal,
  [switch]$VerifyLocalFirst,
  [switch]$Force,
  [switch]$StopExisting,
  [switch]$TemporarilyMoveCloudflaredConfig,
  [string[]]$TargetName = @(),
  [int]$StartupTimeoutSeconds = 60,
  [int]$PublicVerifyTimeoutSeconds = 15,
  [int]$PublicVerifyAttempts = 5
)

$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$runtimeRoot = Join-Path $repoRoot '.runtime\trycloudflare'
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$runRoot = Join-Path $runtimeRoot $stamp
$pidFile = Join-Path $runtimeRoot 'active-pids.json'

function Import-DotEnv {
  param([string]$Path)
  if (-not (Test-Path -LiteralPath $Path)) { return }
  Get-Content -LiteralPath $Path | ForEach-Object {
    $line = $_.Trim()
    if (-not $line -or $line.StartsWith('#') -or $line -notmatch '^[A-Za-z_][A-Za-z0-9_]*=') { return }
    $parts = $line.Split('=', 2)
    $name = $parts[0].Trim()
    $value = $parts[1].Trim().Trim('"').Trim("'")
    [Environment]::SetEnvironmentVariable($name, $value, 'Process')
  }
}

function Test-FlagEnabled {
  $value = [Environment]::GetEnvironmentVariable('EXPERIMENTAL_TRY_CLOUDFLARE', 'Process')
  return $value -match '^(?i:true|1|yes|on)$'
}

function Stop-ActiveTunnels {
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

function Invoke-HttpCheck {
  param(
    [string]$Name,
    [string]$Url,
    [int]$TimeoutSeconds,
    [int]$Attempts = 1,
    [int]$DelaySeconds = 3
  )
  $lastError = ''
  for ($attempt = 1; $attempt -le $Attempts; $attempt++) {
    try {
      $response = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec $TimeoutSeconds
      return [pscustomobject]@{
        Name = $Name
        Status = 'PASS'
        Url = $Url
        Detail = "HTTP $($response.StatusCode) $($response.Headers['Content-Type'])"
      }
    } catch {
      $lastError = $_.Exception.Message
      if ($attempt -lt $Attempts) {
        Start-Sleep -Seconds $DelaySeconds
      }
    }
  }
  [pscustomobject]@{
    Name = $Name
    Status = 'FAIL'
    Url = $Url
    Detail = $lastError
  }
}

function Get-QuickTunnelUrl {
  param(
    [string[]]$LogPaths,
    [int]$TimeoutSeconds
  )
  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  while ((Get-Date) -lt $deadline) {
    foreach ($path in $LogPaths) {
      if (-not (Test-Path -LiteralPath $path)) { continue }
      $content = Get-Content -Raw -LiteralPath $path -ErrorAction SilentlyContinue
      if ([string]::IsNullOrEmpty($content)) { continue }
      $match = [regex]::Match($content, 'https://[-a-zA-Z0-9]+\.trycloudflare\.com')
      if ($match.Success) { return $match.Value }
    }
    Start-Sleep -Seconds 2
  }
  return ''
}

function Invoke-PublicQuickTunnelCheck {
  param(
    [string]$Name,
    [string]$Url,
    [int]$TimeoutSeconds,
    [int]$Attempts
  )

  $direct = Invoke-HttpCheck -Name $Name -Url $Url -TimeoutSeconds $TimeoutSeconds -Attempts $Attempts -DelaySeconds 5
  if ($direct.Status -eq 'PASS') { return $direct }

  $uri = [Uri]$Url
  $edgeAddress = ''
  try {
    $edgeAddress = Resolve-DnsName -Name $uri.Host -Server 1.1.1.1 -Type A -ErrorAction Stop |
      Select-Object -First 1 -ExpandProperty IPAddress
  } catch {
    return $direct
  }

  if (-not $edgeAddress -or -not (Get-Command curl.exe -ErrorAction SilentlyContinue)) {
    return $direct
  }

  $statusCode = ''
  $curlOutput = ''
  try {
    $curlOutput = & curl.exe -sS -o NUL -w '%{http_code}' --max-time $TimeoutSeconds --resolve "$($uri.Host):443:$edgeAddress" $Url 2>&1
    $statusCode = ($curlOutput | Out-String).Trim()
  } catch {
    return [pscustomobject]@{
      Name = $Name
      Status = 'FAIL'
      Url = $Url
      Detail = "Direct check failed: $($direct.Detail); Cloudflare edge fallback failed: $($_.Exception.Message)"
    }
  }

  if ($statusCode -match '^[23][0-9][0-9]$') {
    return [pscustomobject]@{
      Name = $Name
      Status = 'PASS'
      Url = $Url
      Detail = "HTTP $statusCode via Cloudflare edge $edgeAddress after local resolver check failed: $($direct.Detail)"
    }
  }

  [pscustomobject]@{
    Name = $Name
    Status = 'FAIL'
    Url = $Url
    Detail = "Direct check failed: $($direct.Detail); Cloudflare edge fallback returned HTTP $statusCode"
  }
}

Import-DotEnv -Path (Join-Path $repoRoot '.env')

if ($StopExisting) {
  Stop-ActiveTunnels
  if (-not $GuestIp -and -not $HostLocal) {
    return
  }
  if (-not $Force -and -not (Test-FlagEnabled)) {
    return
  }
}

if (-not $Force -and -not (Test-FlagEnabled)) {
  throw 'EXPERIMENTAL_TRY_CLOUDFLARE is not true. Set it in .env or the current process, or pass -Force for an explicit test run.'
}

$cloudflared = Get-Command cloudflared -ErrorAction SilentlyContinue
if (-not $cloudflared) {
  throw 'cloudflared not found in PATH. Install cloudflared, refresh PATH, and retry.'
}

$cloudflaredConfig = Join-Path $HOME '.cloudflared\config.yaml'
$movedConfig = ''
if (Test-Path -LiteralPath $cloudflaredConfig) {
  if ($TemporarilyMoveCloudflaredConfig) {
    $movedConfig = "$cloudflaredConfig.project-truth-disabled-$stamp"
    Move-Item -LiteralPath $cloudflaredConfig -Destination $movedConfig
    Write-Warning "Temporarily moved $cloudflaredConfig to $movedConfig. Restore it after stopping quick tunnels."
  } else {
    Write-Warning "Cloudflare docs note quick tunnels are not supported when $cloudflaredConfig exists. Pass -TemporarilyMoveCloudflaredConfig only when it is safe to move it for this test."
  }
}

New-Item -ItemType Directory -Force -Path $runRoot | Out-Null

$hostName = if ($HostLocal) { '127.0.0.1' } elseif ($GuestIp) { $GuestIp } else { throw 'Pass -GuestIp <vm-lan-ip> or -HostLocal.' }

$targets = @(
  @{ Name = 'prod-app'; Base = "http://${hostName}:3000"; CheckPath = '/auth/login'; PublicRequired = $true },
  @{ Name = 'prod-api'; Base = "http://${hostName}:3001"; CheckPath = '/health'; PublicRequired = $true },
  @{ Name = 'dev-app'; Base = "http://${hostName}:3100"; CheckPath = '/auth/login'; PublicRequired = $false },
  @{ Name = 'dev-api'; Base = "http://${hostName}:3101"; CheckPath = '/health'; PublicRequired = $false },
  @{ Name = 'uat-app'; Base = "http://${hostName}:3200"; CheckPath = '/auth/login'; PublicRequired = $false },
  @{ Name = 'uat-api'; Base = "http://${hostName}:3201"; CheckPath = '/health'; PublicRequired = $false },
  @{ Name = 'grafana'; Base = "http://${hostName}:53000"; CheckPath = '/api/health'; PublicRequired = $true },
  @{ Name = 'prometheus'; Base = "http://${hostName}:9091"; CheckPath = '/-/ready'; PublicRequired = $false },
  @{ Name = 'loki'; Base = "http://${hostName}:3110"; CheckPath = '/ready'; PublicRequired = $false }
)

if ($TargetName.Count -gt 0) {
  $wanted = @($TargetName | ForEach-Object { $_ -split '[,\s]+' } | Where-Object { $_ } | ForEach-Object { $_.ToLowerInvariant() })
  $targets = @($targets | Where-Object { $wanted -contains $_.Name.ToLowerInvariant() })
  if ($targets.Count -eq 0) {
    throw "No matching targets for -TargetName $($TargetName -join ', ')."
  }
}

$results = @()
$processRecords = @()

foreach ($target in $targets) {
  $name = $target.Name
  $baseUrl = $target.Base
  $checkUrl = "$baseUrl$($target.CheckPath)"
  $stdoutPath = Join-Path $runRoot "$name.stdout.log"
  $stderrPath = Join-Path $runRoot "$name.stderr.log"

  $localCheck = Invoke-HttpCheck -Name $name -Url $checkUrl -TimeoutSeconds 8
  if ($VerifyLocalFirst -and $localCheck.Status -ne 'PASS') {
    $results += [pscustomobject]@{
      Name = $name
      LocalUrl = $checkUrl
      PublicUrl = ''
      PublicCheckUrl = ''
      LocalStatus = $localCheck.Status
      PublicStatus = 'SKIPPED'
      Detail = $localCheck.Detail
      ProcessId = $null
    }
    continue
  }

  $process = Start-Process -FilePath $cloudflared.Source `
    -ArgumentList @('tunnel', '--no-autoupdate', '--url', $baseUrl) `
    -RedirectStandardOutput $stdoutPath `
    -RedirectStandardError $stderrPath `
    -WindowStyle Hidden `
    -PassThru

  $publicUrl = Get-QuickTunnelUrl -LogPaths @($stdoutPath, $stderrPath) -TimeoutSeconds $StartupTimeoutSeconds
  $publicCheckUrl = if ($publicUrl) { "$publicUrl$($target.CheckPath)" } else { '' }
  $publicCheck = if ($publicCheckUrl) {
    Invoke-PublicQuickTunnelCheck -Name $name -Url $publicCheckUrl -TimeoutSeconds $PublicVerifyTimeoutSeconds -Attempts $PublicVerifyAttempts
  } else {
    [pscustomobject]@{ Name = $name; Status = 'FAIL'; Url = ''; Detail = "No trycloudflare URL found within ${StartupTimeoutSeconds}s" }
  }

  $record = [pscustomobject]@{
    Name = $name
    LocalUrl = $checkUrl
    PublicUrl = $publicUrl
    PublicCheckUrl = $publicCheckUrl
    LocalStatus = $localCheck.Status
    PublicStatus = $publicCheck.Status
    Detail = $publicCheck.Detail
    ProcessId = $process.Id
  }
  $results += $record
  $processRecords += [pscustomobject]@{ Name = $name; ProcessId = $process.Id; PublicUrl = $publicUrl; LocalBaseUrl = $baseUrl }
}

$dbFacts = @(
  [pscustomobject]@{ Name = 'prod-postgres'; InternalService = 'postgres:5432'; HostPort = '15432'; DatabaseUrlShape = "postgresql://postgres:<redacted>@${hostName}:15432/bnpi_pats"; PublicTunnel = 'Cloudflare Access TCP only' },
  [pscustomobject]@{ Name = 'dev-postgres'; InternalService = 'bnpi-pats-postgres-dev:5432'; HostPort = '15433'; DatabaseUrlShape = "postgresql://postgres:<redacted>@${hostName}:15433/bnpi-pats"; PublicTunnel = 'Cloudflare Access TCP only' },
  [pscustomobject]@{ Name = 'uat-postgres'; InternalService = 'bnpi-pats-postgres-uat:5432'; HostPort = '15434'; DatabaseUrlShape = "postgresql://postgres:<redacted>@${hostName}:15434/bnpi-pats"; PublicTunnel = 'Cloudflare Access TCP only' }
)

$summary = [pscustomobject]@{
  GeneratedAt = (Get-Date).ToString('o')
  Scope = 'EXPERIMENTAL TryCloudflare quick tunnels for verified HTTP targets only'
  Temporary = $true
  Host = $hostName
  RunRoot = $runRoot
  MovedCloudflaredConfig = $movedConfig
  Results = $results
  DatabaseFacts = $dbFacts
}

$jsonPath = Join-Path $runRoot 'public-urls.json'
$mdPath = Join-Path $runRoot 'public-urls.md'
$summary | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $jsonPath -Encoding utf8
$processRecords | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath $pidFile -Encoding utf8

$md = @()
$md += '# Experimental TryCloudflare Public URLs'
$md += ''
$md += "Generated: $($summary.GeneratedAt)"
$md += ''
$md += 'These URLs are temporary quick-tunnel URLs. They rotate whenever cloudflared restarts and are not production architecture.'
$md += ''
$md += '| Target | Local check | Public check | Public URL |'
$md += '|---|---|---|---|'
foreach ($result in $results) {
  $md += "| $($result.Name) | $($result.LocalStatus) | $($result.PublicStatus) | $($result.PublicUrl) |"
}
$md += ''
$md += '## Database Facts'
$md += ''
$md += 'Raw database access is not served through trycloudflare HTTP quick tunnels. LAN URLs below are redacted topology facts; public DB access must use Cloudflare Access arbitrary TCP.'
$md += ''
$md += '| Name | Internal service | Host port | URL shape | Public DB path |'
$md += '|---|---|---:|---|---|'
foreach ($db in $dbFacts) {
  $md += "| $($db.Name) | $($db.InternalService) | $($db.HostPort) | $($db.DatabaseUrlShape) | $($db.PublicTunnel) |"
}
$md += ''
$md += 'Client-side TCP examples after named Cloudflare hostnames and Access policies exist:'
$md += ''
$md += '```powershell'
$md += 'cloudflared access tcp --hostname db.bnpi-pats.tech --url localhost:5432'
$md += 'cloudflared access tcp --hostname dev-db.bnpi-pats.tech --url localhost:5433'
$md += 'cloudflared access tcp --hostname uat-db.bnpi-pats.tech --url localhost:5434'
$md += '```'
$md | Set-Content -LiteralPath $mdPath -Encoding utf8

Write-Host "Wrote $mdPath"
$results | Format-Table -AutoSize

$requiredFailures = @($results | Where-Object { $_.PublicStatus -ne 'PASS' -and $_.Name -in @('prod-app', 'prod-api', 'grafana') })
if ($requiredFailures.Count -gt 0) {
  Write-Warning "One or more preferred proof targets did not pass publicly: $($requiredFailures.Name -join ', ')"
}

exit 0
