$ErrorActionPreference = "Stop"

function Resolve-HikvisionSdkRoot {
	param([string]$RepoRoot)

	$candidates = @()
	if ($env:HIKVISION_SDK_ROOT) {
		$candidates += $env:HIKVISION_SDK_ROOT
	}
	$candidates += Join-Path $RepoRoot "vendor\hikvision-bio"
	$candidates += Join-Path $RepoRoot "EN-HCNetSDKV6.1.9.4_build20220412_win64"
	$candidates += "C:\Users\anoni\OneDrive\Desktop\HRIS-PROJECT\EN-HCNetSDKV6.1.9.4_build20220412_win64"

	foreach ($candidate in $candidates) {
		if (-not $candidate) { continue }
		$exe = Join-Path $candidate "build\AlarmDemo.exe"
		if (Test-Path -LiteralPath $exe) {
			return (Resolve-Path -LiteralPath $candidate).Path
		}
	}

	return $null
}

$apiRoot = Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..")
$repoRoot = Split-Path -Parent $apiRoot
$sdkRoot = Resolve-HikvisionSdkRoot -RepoRoot $repoRoot
$exePath = if ($sdkRoot) { Join-Path $sdkRoot "build\AlarmDemo.exe" } else { $null }
$alarmProcess = $null

$skipAlarmDemo = $env:HRIS_SKIP_HIKVISION_ALARMDEMO -in @("1", "true", "TRUE", "yes", "YES")

if (-not $skipAlarmDemo -and $exePath -and (Test-Path -LiteralPath $exePath)) {
	$outLog = Join-Path $apiRoot "tmp-hikvision-alarmdemo.log"
	$errLog = Join-Path $apiRoot "tmp-hikvision-alarmdemo.err.log"
	$alarmArgs = @("--no-startup-sync", "--no-startup-normalize", "--verbose-events")

	Write-Host "[dev] Starting Hikvision AlarmDemo listener..."
	$alarmProcess = Start-Process `
		-FilePath $exePath `
		-ArgumentList $alarmArgs `
		-WorkingDirectory $sdkRoot `
		-RedirectStandardOutput $outLog `
		-RedirectStandardError $errLog `
		-PassThru `
		-WindowStyle Hidden
	Write-Host "[dev] AlarmDemo pid=$($alarmProcess.Id), logs: $outLog"
}
elseif ($skipAlarmDemo) {
	Write-Host "[dev] Skipping Hikvision AlarmDemo because HRIS_SKIP_HIKVISION_ALARMDEMO is set."
}
else {
	Write-Host "[dev] AlarmDemo.exe not found; starting API only. Set HIKVISION_SDK_ROOT or build vendor\hikvision-bio\build\AlarmDemo.exe."
}

$dotenvCmd = Join-Path $apiRoot "node_modules\.bin\dotenv.cmd"
if (-not (Test-Path -LiteralPath $dotenvCmd)) {
	throw "dotenv command not found. Run npm install in hris-api first."
}

try {
	Push-Location $apiRoot
	& $dotenvCmd tsx watch index.ts
	exit $LASTEXITCODE
}
finally {
	Pop-Location
	if ($alarmProcess -and -not $alarmProcess.HasExited) {
		Write-Host "[dev] Stopping Hikvision AlarmDemo pid=$($alarmProcess.Id)..."
		Stop-Process -Id $alarmProcess.Id -Force
	}
}
