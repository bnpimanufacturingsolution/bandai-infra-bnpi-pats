param(
	[switch]$SelfTest,
	[int]$Duration = 300
)

$ErrorActionPreference = "Stop"

$apiRoot = Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..")
$repoRoot = Split-Path -Parent $apiRoot
$sdkRoot = Join-Path $repoRoot "EN-HCNetSDKV6.1.9.4_build20220412_win64"
$exePath = Join-Path $sdkRoot "build\AlarmDemo.exe"

if (-not (Test-Path -LiteralPath $exePath)) {
	throw "AlarmDemo.exe not found at $exePath. Build it from the SDK folder with .\build-alarmdemo.ps1."
}

$argsList = @("--no-startup-sync", "--no-startup-normalize", "--verbose-events")
if ($SelfTest) {
	$argsList = @("--self-test", "--duration", [string]$Duration) + $argsList
}

Push-Location $sdkRoot
try {
	& $exePath @argsList
	exit $LASTEXITCODE
}
finally {
	Pop-Location
}
