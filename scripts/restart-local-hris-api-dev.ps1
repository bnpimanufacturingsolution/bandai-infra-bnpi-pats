param(
	[int]$Port = 3001,
	[int]$WaitSeconds = 45
)

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$apiDir = Join-Path $repoRoot "hris-api"
$runtimeDir = Join-Path $repoRoot ".runtime\local-api-watch"
New-Item -ItemType Directory -Force -Path $runtimeDir | Out-Null
$logPath = Join-Path $runtimeDir "latest.log"

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

function Wait-ForApiHealth {
	$deadline = (Get-Date).AddSeconds($WaitSeconds)
	while ((Get-Date) -lt $deadline) {
		try {
			$response = Invoke-RestMethod -Method Get "http://localhost:$Port/health" -TimeoutSec 2
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
Set-Content -Path $logPath -Value ""

$launchScript = @"
Set-Location '$apiDir'
`$env:CHOKIDAR_USEPOLLING='true'
`$env:CHOKIDAR_INTERVAL='150'
`$env:WATCHPACK_POLLING='true'
npm run dev:api-only *>&1 | Tee-Object -FilePath '$logPath'
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
