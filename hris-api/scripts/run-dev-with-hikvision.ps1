$ErrorActionPreference = "Stop"

$apiRoot = Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..")
$repoRoot = Split-Path -Parent $apiRoot
$sdkRoot = Join-Path $repoRoot "EN-HCNetSDKV6.1.9.4_build20220412_win64"
$exePath = Join-Path $sdkRoot "build\AlarmDemo.exe"
$alarmProcess = $null

$skipAlarmDemo = $env:HRIS_SKIP_HIKVISION_ALARMDEMO -in @("1", "true", "TRUE", "yes", "YES")

if (-not $skipAlarmDemo -and (Test-Path -LiteralPath $exePath)) {
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
	Write-Host "[dev] AlarmDemo.exe not found; starting API only."
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
