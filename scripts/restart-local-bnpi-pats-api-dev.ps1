param(
	[int]$Port = 3001,
	[int]$WaitSeconds = 90
)

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$apiDir = Join-Path $repoRoot "bnpi-pats-api"
$runtimeDir = Join-Path $repoRoot ".runtime\local-api-watch"
New-Item -ItemType Directory -Force -Path $runtimeDir | Out-Null
$logPath = Join-Path $runtimeDir "latest.log"
$dotenvCli = Join-Path $apiDir "node_modules\dotenv-cli\cli.js"
$nodeBinary = (Get-Command node.exe).Source
$ensureDbAccessScript = Join-Path $apiDir "scripts\ensure-bnpi-db-access.cjs"
$ensureDbWatchScript = Join-Path $repoRoot "scripts\watch-k8s-dev-db-access.ps1"

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
	if ($processes.Count -eq 0) { return }

	# Killing only the listening index.ts child leaves tsx-watch/dotenv alive;
	# those parents can respawn an old worker in the middle of a durable job.
	# Walk upward through this repo's known dev-watch chain and kill only its
	# highest roots so the entire tree exits exactly once.
	$all = @(Get-CimInstance Win32_Process -ErrorAction SilentlyContinue)
	$byId = @{}
	foreach ($candidate in $all) { $byId[[int]$candidate.ProcessId] = $candidate }
	$treeIds = [System.Collections.Generic.HashSet[int]]::new()
	foreach ($proc in $processes) { [void]$treeIds.Add([int]$proc.ProcessId) }

	$changed = $true
	while ($changed) {
		$changed = $false
		foreach ($processId in @($treeIds)) {
			$current = $byId[$processId]
			if (-not $current) { continue }
			$parent = $byId[[int]$current.ParentProcessId]
			if (-not $parent) { continue }
			$parentCommand = ([string]$parent.CommandLine).ToLower().Replace("\", "/")
			$isKnownWatchParent =
				$parentCommand.Contains("run-dev-api-watch.cjs") -or
				$parentCommand.Contains("dotenv-cli/cli.js") -or
				($parent.Name -eq "cmd.exe" -and $parentCommand.Contains("dotenv") -and $parentCommand.Contains("run-dev-api-watch.cjs"))
			if ($isKnownWatchParent -and $treeIds.Add([int]$parent.ProcessId)) {
				$changed = $true
			}
		}
	}

	$roots = @($treeIds | Where-Object {
		$current = $byId[[int]$_]
		-not $current -or -not $treeIds.Contains([int]$current.ParentProcessId)
	})
	foreach ($processId in $roots) {
		Write-Host "[local-api-restart] Stopping API watch tree root PID $processId"
		taskkill /PID $processId /T /F | Out-Null
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

if (Test-Path $ensureDbWatchScript) {
	Write-Host "[local-api-restart] Ensuring canonical DEV DB self-repair watcher"
	& powershell.exe -NoProfile -ExecutionPolicy Bypass -File $ensureDbWatchScript
}

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
	throw "Local bnpi-pats-api did not become healthy on port $Port within $WaitSeconds seconds. Check $logPath."
}

Write-Host "[local-api-restart] Local bnpi-pats-api is healthy on http://localhost:$Port/health"
