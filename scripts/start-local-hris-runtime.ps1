param(
  [ValidateSet('prod','dev','uat','all')]
  [string]$Environment = 'prod',
  [switch]$IncludeZkteco,
  [switch]$SkipVerify
)

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
$applianceRoot = Join-Path $repoRoot 'appliance'
$logsRoot = Join-Path $repoRoot 'logs'
New-Item -ItemType Directory -Force -Path $logsRoot | Out-Null

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
  throw 'Docker CLI not found in PATH.'
}

function Test-DockerEngine {
  $previousErrorActionPreference = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  $output = & docker info 2>&1
  $exitCode = $LASTEXITCODE
  $ErrorActionPreference = $previousErrorActionPreference
  return [pscustomobject]@{
    Ok = ($exitCode -eq 0)
    Output = ($output | Out-String).Trim()
  }
}

$dockerState = Test-DockerEngine
if (-not $dockerState.Ok) {
  $dockerDesktop = 'C:\Program Files\Docker\Docker\Docker Desktop.exe'
  if (Test-Path -LiteralPath $dockerDesktop) {
    $existing = Get-Process -ErrorAction SilentlyContinue |
      Where-Object { $_.ProcessName -like '*Docker Desktop*' -or $_.ProcessName -like '*com.docker*' }
    if (-not $existing) {
      Start-Process -FilePath $dockerDesktop -WindowStyle Hidden
    }

    $deadline = (Get-Date).AddMinutes(4)
    do {
      Start-Sleep -Seconds 10
      $dockerState = Test-DockerEngine
      if ($dockerState.Ok) { break }
    } while ((Get-Date) -lt $deadline)
  }
}

if (-not $dockerState.Ok) {
  throw "Docker is installed, but the Docker engine is not reachable after recovery attempts. Last output: $($dockerState.Output)"
}

$envFile = Join-Path $applianceRoot 'env\hris-api.env'
if (-not (Test-Path -LiteralPath $envFile)) {
  throw "Required appliance env file not found: $envFile"
}

$null = docker network inspect hris-observability 2>$null
if ($LASTEXITCODE -ne 0) {
  docker network create hris-observability | Out-Null
}

$composeArgs = @('compose')
if ($Environment -eq 'prod') {
  $composeArgs += @('-f', 'docker-compose.yml', 'up', '-d')
} elseif ($Environment -eq 'all') {
  $composeArgs += @('-f', 'docker-compose.yml', '-f', 'docker-compose.environments.yml', 'up', '-d')
} else {
  $composeArgs += @('-f', 'docker-compose.environments.yml', 'up', '-d')
}

if ($IncludeZkteco) {
  Write-Host "ZKTeco bridge is part of the default Linux appliance stack; -IncludeZkteco is retained for compatibility."
}

$log = Join-Path $logsRoot ("start-local-hris-runtime-{0}.log" -f (Get-Date -Format 'yyyyMMdd-HHmmss'))
Push-Location $applianceRoot
try {
  "docker $($composeArgs -join ' ')" | Tee-Object -FilePath $log
  $previousComposeIgnoreOrphans = $env:COMPOSE_IGNORE_ORPHANS
  $env:COMPOSE_IGNORE_ORPHANS = 'true'
  $stdoutLog = Join-Path $logsRoot ("docker-compose-stdout-{0}.log" -f (Get-Date -Format 'yyyyMMdd-HHmmss'))
  $stderrLog = Join-Path $logsRoot ("docker-compose-stderr-{0}.log" -f (Get-Date -Format 'yyyyMMdd-HHmmss'))
  $process = Start-Process -FilePath 'docker' -ArgumentList $composeArgs -NoNewWindow -Wait -PassThru -RedirectStandardOutput $stdoutLog -RedirectStandardError $stderrLog
  if (Test-Path -LiteralPath $stdoutLog) {
    Get-Content -LiteralPath $stdoutLog | Tee-Object -FilePath $log -Append
  }
  if (Test-Path -LiteralPath $stderrLog) {
    Get-Content -LiteralPath $stderrLog | Tee-Object -FilePath $log -Append
  }
  $composeExitCode = $process.ExitCode
  $env:COMPOSE_IGNORE_ORPHANS = $previousComposeIgnoreOrphans
  if ($composeExitCode -ne 0) {
    throw "docker $($composeArgs -join ' ') failed with exit code $composeExitCode. Log: $log"
  }
} finally {
  if (Get-Variable -Name previousComposeIgnoreOrphans -Scope Local -ErrorAction SilentlyContinue) {
    $env:COMPOSE_IGNORE_ORPHANS = $previousComposeIgnoreOrphans
  }
  Pop-Location
}

Write-Host 'Runtime URLs:'
Write-Host '  PROD app: http://127.0.0.1:3000/auth/login'
Write-Host '  PROD API: http://127.0.0.1:3001/health'
Write-Host '  DEV app:  http://127.0.0.1:3100/auth/login'
Write-Host '  DEV API:  http://127.0.0.1:3101/health'
Write-Host '  UAT app:  http://127.0.0.1:3200/auth/login'
Write-Host '  UAT API:  http://127.0.0.1:3201/health'
Write-Host "Log: $log"

if (-not $SkipVerify) {
  & "$PSScriptRoot\verify-local-hris-runtime.ps1" -Environment $Environment
  exit $LASTEXITCODE
}

exit 0
