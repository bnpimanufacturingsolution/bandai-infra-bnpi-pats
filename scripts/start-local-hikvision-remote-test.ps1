param(
  [string]$ApiUrl = 'http://127.0.0.1:3001',
  [string]$AppUrl = 'http://127.0.0.1:5175',
  [string]$LoginEmail = 'admin@bandai.local',
  [string]$LoginPassword = 'password123',
  [string]$LoginAppCode = 'hris',
  [int]$StartupTimeoutSeconds = 60,
  [switch]$StopExisting
)

$ErrorActionPreference = 'Stop'

if (-not (Get-Command cloudflared -ErrorAction SilentlyContinue)) {
  throw 'cloudflared not found in PATH. Install cloudflared before starting remote-test tunnels.'
}

$repoRoot = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$runtimeRoot = Join-Path $repoRoot '.runtime\local-hikvision-remote-test'
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$runRoot = Join-Path $runtimeRoot $stamp
$pidFile = Join-Path $runtimeRoot 'active-pids.json'

function Stop-ActiveTunnels {
  if (-not (Test-Path -LiteralPath $pidFile)) { return }
  $active = Get-Content -Raw -LiteralPath $pidFile | ConvertFrom-Json
  foreach ($item in @($active)) {
    try {
      Stop-Process -Id $item.ProcessId -Force -ErrorAction Stop
      Write-Host "Stopped $($item.Name) cloudflared PID $($item.ProcessId)"
    } catch {
      Write-Host "PID $($item.ProcessId) for $($item.Name) is not running"
    }
  }
  Remove-Item -LiteralPath $pidFile -Force -ErrorAction SilentlyContinue
}

function Invoke-HealthCheck {
  param(
    [string]$Name,
    [string]$Url,
    [int]$TimeoutSeconds = 8
  )
  try {
    $response = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec $TimeoutSeconds
    return [pscustomobject]@{
      Name = $Name
      Status = 'PASS'
      Detail = "HTTP $($response.StatusCode)"
    }
  } catch {
    return [pscustomobject]@{
      Name = $Name
      Status = 'FAIL'
      Detail = $_.Exception.Message
    }
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
      if ([string]::IsNullOrWhiteSpace($content)) { continue }
      $match = [regex]::Match($content, 'https://[-a-zA-Z0-9]+\.trycloudflare\.com')
      if ($match.Success) { return $match.Value }
    }
    Start-Sleep -Seconds 2
  }
  return ''
}

if ($StopExisting) {
  Stop-ActiveTunnels
}

New-Item -ItemType Directory -Force -Path $runRoot | Out-Null

$targets = @(
  [pscustomobject]@{ Name = 'local-api'; BaseUrl = $ApiUrl; CheckUrl = "$($ApiUrl.TrimEnd('/'))/health" },
  [pscustomobject]@{ Name = 'local-app'; BaseUrl = $AppUrl; CheckUrl = "$($AppUrl.TrimEnd('/'))/auth/login" }
)

$results = @()
$pidRecords = @()

foreach ($target in $targets) {
  $check = Invoke-HealthCheck -Name $target.Name -Url $target.CheckUrl
  if ($check.Status -ne 'PASS') {
    throw "$($target.Name) local check failed at $($target.CheckUrl): $($check.Detail)"
  }

  $stdoutPath = Join-Path $runRoot "$($target.Name).stdout.log"
  $stderrPath = Join-Path $runRoot "$($target.Name).stderr.log"
  $process = Start-Process -FilePath 'cloudflared' `
    -ArgumentList @('tunnel', '--no-autoupdate', '--url', $target.BaseUrl) `
    -RedirectStandardOutput $stdoutPath `
    -RedirectStandardError $stderrPath `
    -WindowStyle Hidden `
    -PassThru

  $publicUrl = Get-QuickTunnelUrl -LogPaths @($stdoutPath, $stderrPath) -TimeoutSeconds $StartupTimeoutSeconds
  if (-not $publicUrl) {
    throw "No trycloudflare URL found for $($target.Name) within ${StartupTimeoutSeconds}s."
  }

  $results += [pscustomobject]@{
    Name = $target.Name
    LocalUrl = $target.BaseUrl
    PublicUrl = $publicUrl
    ProcessId = $process.Id
  }
  $pidRecords += [pscustomobject]@{
    Name = $target.Name
    ProcessId = $process.Id
    PublicUrl = $publicUrl
  }
}

$apiPublicUrl = ($results | Where-Object Name -eq 'local-api' | Select-Object -First 1 -ExpandProperty PublicUrl)
$appPublicUrl = ($results | Where-Object Name -eq 'local-app' | Select-Object -First 1 -ExpandProperty PublicUrl)

$envLines = @(
  'HIKVISION_HOT_RELOAD_DEVICE_SOURCE=api'
  "HIKVISION_HOT_RELOAD_API_BASE=$apiPublicUrl"
  "HIKVISION_HOT_RELOAD_LOGIN_EMAIL=$LoginEmail"
  "HIKVISION_HOT_RELOAD_LOGIN_PASSWORD=$LoginPassword"
  "HIKVISION_HOT_RELOAD_LOGIN_APP_CODE=$LoginAppCode"
  'HIKVISION_HOT_RELOAD_DEVICE_FETCH_LIMIT=200'
  '# Optional when the remote site agent should only arm one device row.'
  '# HIKVISION_DEVICE_ID_FILTER=cmpxw13hx002h7zwso7dyedrn'
)

$envPath = Join-Path $runRoot 'hikvision-remote-site-agent.env'
$envLines | Set-Content -LiteralPath $envPath -Encoding utf8
$pidRecords | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath $pidFile -Encoding utf8

$summary = @()
$summary += '# Local Hikvision Remote Test'
$summary += ''
$summary += "Generated: $(Get-Date -Format o)"
$summary += ''
$summary += '| Target | Local URL | Public URL |'
$summary += '|---|---|---|'
foreach ($result in $results) {
  $summary += "| $($result.Name) | $($result.LocalUrl) | $($result.PublicUrl) |"
}
$summary += ''
$summary += '## Remote Site Agent Env'
$summary += ''
$summary += '```env'
$summary += $envLines
$summary += '```'
$summary += ''
$summary += '## Notes'
$summary += ''
$summary += "- Point the remote Linux site agent at $apiPublicUrl."
$summary += '- Keep this PowerShell session or the cloudflared processes alive while testing.'
$summary += '- Stop and replace these quick tunnels whenever the local dev server is restarted or the public URLs rotate.'
$summaryPath = Join-Path $runRoot 'README.md'
$summary | Set-Content -LiteralPath $summaryPath -Encoding utf8

Write-Host "Wrote $summaryPath"
$results | Format-Table -AutoSize
Write-Host ''
Write-Host "Remote site-agent env file: $envPath"
