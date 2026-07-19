param(
	[int]$Port = 3001,
	[int]$WaitSeconds = 90
)

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$apiDir = Join-Path $repoRoot "hris-api"
$runtimeDir = Join-Path $repoRoot ".runtime\local-api-watch"
New-Item -ItemType Directory -Force -Path $runtimeDir | Out-Null
$logPath = Join-Path $runtimeDir "latest.log"
$dotenvCli = Join-Path $apiDir "node_modules\dotenv-cli\cli.js"
$nodeBinary = (Get-Command node.exe).Source
$ensureDbAccessScript = Join-Path $apiDir "scripts\ensure-bnpi-db-access.cjs"

function Get-RepoApiProcesses {
	$connections = @(Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue)
	$portPids = @($connections | Select-Object -ExpandProperty OwningProcess -Unique)
	$nodeProcesses = @(Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" -ErrorAction SilentlyContinue)
	$normalizedApiDir = $apiDir.ToLower().Replace("\", "/")

	$matches = @()
	foreach ($proc in $nodeProcesses) {
		$commandLine = [string]$proc.CommandLine
		$normalizedCommand = $commandLine.ToLower().Replace("\", "/")
		if (-not $normalizedCommand.Contains($normalizedApiDir)) { continue }
		if (-not $normalizedCommand.Contains("index.ts")) { continue }
		$matches += [pscustomobject]@{
			ProcessId = [int]$proc.ProcessId
			CommandLine = $commandLine
			IsListeningOnPort = $portPids -contains [int]$proc.ProcessId
		}
	}
	return $matches | Sort-Object `
		@{ Expression = "IsListeningOnPort"; Descending = $true }, `
		@{ Expression = "ProcessId"; Descending = $false } `
		-Unique
}

function Stop-RepoApiProcesses {
	$processes = @(Get-RepoApiProcesses)
	foreach ($proc in $processes) {
		Write-Host "[local-api-restart] Stopping PID $($proc.ProcessId)"
		taskkill /PID $proc.ProcessId /T /F | Out-Null
	}
}

function Clear-LogFileWithRetry {
	param(
		[string]$Path,
		[int]$Attempts = 20
	)

	for ($attempt = 1; $attempt -le $Attempts; $attempt++) {
		try {
			Set-Content -Path $Path -Value ""
			return
		} catch {
			if ($attempt -eq $Attempts) { throw }
			Start-Sleep -Milliseconds 500
		}
	}
}

function Wait-ForApiHealth {
	$deadline = (Get-Date).AddSeconds($WaitSeconds)
	while ((Get-Date) -lt $deadline) {
		try {
			# The local development stack can take just over two seconds to answer
			# while Prisma and route modules are warm. A two-second client timeout
			# repeatedly misclassified an already-listening API as failed.
			$response = Invoke-RestMethod -Method Get "http://localhost:$Port/health" -TimeoutSec 10
			if ($response) {
				return $true
			}
		} catch {
			Start-Sleep -Milliseconds 750
		}
	}
	return $false
}

Stop-RepoApiProcesses
Clear-LogFileWithRetry -Path $logPath

if (-not (Test-Path $ensureDbAccessScript)) {
	throw "Missing DB access preflight script at $ensureDbAccessScript"
}

Write-Host "[local-api-restart] Running DB access preflight"
& $nodeBinary $ensureDbAccessScript

$launchScript = @"
Set-Location '$apiDir'
`$env:CHOKIDAR_USEPOLLING='true'
`$env:CHOKIDAR_INTERVAL='150'
`$env:WATCHPACK_POLLING='true'
& '$nodeBinary' '$dotenvCli' -o -e .env -e .env.development.local -- node scripts/run-dev-api-watch.cjs *> '$logPath'
"@

$process = Start-Process powershell `
	-ArgumentList "-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", $launchScript `
	-WorkingDirectory $apiDir `
	-WindowStyle Hidden `
	-PassThru

Write-Host "[local-api-restart] Started watcher PID $($process.Id)"
Write-Host "[local-api-restart] Log: $logPath"

if (-not (Wait-ForApiHealth)) {
	throw "Local hris-api did not become healthy on port $Port within $WaitSeconds seconds. Check $logPath."
}

Write-Host "[local-api-restart] Local hris-api is healthy on http://localhost:$Port/health"

# Keep Live capture usable for TEST A after every local API restart.
$bridgeScript = Join-Path $repoRoot "scripts\start-host-hikvision-vm-ssh-bridge.ps1"
$listenerRestartScript = Join-Path $repoRoot "scripts\restart-local-hikvision-listener.ps1"
if (Test-Path $bridgeScript) {
	try {
		Write-Host "[local-api-restart] Ensuring TEST A SSH reverse bridge for Live capture"
		& powershell.exe -NoProfile -ExecutionPolicy Bypass -File $bridgeScript `
			-Action start `
			-HttpDevicePort 443 `
			-SdkDevicePort 8000 `
			-HttpListenPort 59443 `
			-SdkListenPort 59000 `
			-ApiLocalPort $Port `
			-ApiRemotePort 53001
	} catch {
		Write-Host "[local-api-restart] Bridge ensure skipped: $($_.Exception.Message)"
	}
}
if (Test-Path $listenerRestartScript) {
	try {
		& powershell.exe -NoProfile -ExecutionPolicy Bypass -File $listenerRestartScript -ApiBase "http://localhost:$Port" -WaitHealthSeconds 0
	} catch {
		Write-Host "[local-api-restart] Listener restart skipped: $($_.Exception.Message)"
	}
}
