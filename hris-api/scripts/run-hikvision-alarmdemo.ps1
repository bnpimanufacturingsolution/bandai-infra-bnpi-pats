param(
	[switch]$SelfTest,
	[int]$Duration = 300
)

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
if (-not $sdkRoot) {
	throw "AlarmDemo.exe not found. Build it in vendor\hikvision-bio or set HIKVISION_SDK_ROOT to the local HCNetSDK folder and run .\build-alarmdemo.ps1 there."
}
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
