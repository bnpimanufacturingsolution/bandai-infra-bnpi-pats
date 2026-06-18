param(
	[string]$Repo = "hrisworkforcesystem-coder/hris-app",
	[string]$FirebaseToken = ""
)

$ErrorActionPreference = "Stop"

function Write-Step {
	param([string]$Message)
	Write-Host ""
	Write-Host "==> $Message" -ForegroundColor Cyan
}

function Ensure-Command {
	param([string]$CommandName)
	if (-not (Get-Command $CommandName -ErrorAction SilentlyContinue)) {
		throw "Missing required command: $CommandName"
	}
}

function Get-FirebaseProjectIds {
	$firebasercPath = Join-Path $projectRoot ".firebaserc"
	if (-not (Test-Path $firebasercPath)) {
		throw "Could not find .firebaserc at $firebasercPath"
	}

	$firebaserc = Get-Content -LiteralPath $firebasercPath -Raw | ConvertFrom-Json
	return @(
		[string]$firebaserc.projects.dev,
		[string]$firebaserc.projects.uat
	) | Where-Object { -not [string]::IsNullOrWhiteSpace($_) }
}

function Resolve-FirebaseToken {
	param([string]$ProvidedToken)

	if (-not [string]::IsNullOrWhiteSpace($ProvidedToken)) {
		return $ProvidedToken.Trim()
	}

	$entered = Read-Host "Firebase token"
	if (-not [string]::IsNullOrWhiteSpace($entered)) {
		return $entered.Trim()
	}

	if (Get-Command "Get-Clipboard" -ErrorAction SilentlyContinue) {
		try {
			$clipboardValue = Get-Clipboard
			if (-not [string]::IsNullOrWhiteSpace($clipboardValue)) {
				Write-Host "Using token from clipboard." -ForegroundColor Yellow
				return ([string]$clipboardValue).Trim()
			}
		} catch {
		}
	}

	if (-not [string]::IsNullOrWhiteSpace($env:FIREBASE_TOKEN)) {
		Write-Host "Using token from FIREBASE_TOKEN environment variable." -ForegroundColor Yellow
		return $env:FIREBASE_TOKEN.Trim()
	}

	return ""
}

$projectRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$syncScript = Join-Path $projectRoot "scripts\setup-firebase-github-env.ps1"

Ensure-Command "firebase"
Ensure-Command "gh"

if (-not (Test-Path $syncScript)) {
	throw "Could not find setup-firebase-github-env.ps1 at $syncScript"
}

Write-Step "Generate a Firebase CI token"
Write-Host "A browser login flow will open. After it finishes, copy the printed token and paste it here." -ForegroundColor Yellow
firebase login:ci

Write-Step "Paste the Firebase CI token"
$token = Resolve-FirebaseToken -ProvidedToken $FirebaseToken
if ([string]::IsNullOrWhiteSpace($token)) {
	throw "No Firebase token was provided. Pass -FirebaseToken, paste it at the prompt, copy it to clipboard first, or set FIREBASE_TOKEN in your shell."
}

Write-Step "Validating Firebase token"
$projectIds = @(Get-FirebaseProjectIds)
foreach ($projectId in $projectIds) {
	firebase use $projectId --token $token | Out-Null
	if ($LASTEXITCODE -ne 0) {
		throw "The provided Firebase token could not access project $projectId. Generate a fresh token with firebase login:ci using the Google account that can open that Firebase project."
	}
}

Write-Step "Syncing GitHub variables and token secrets"
& powershell.exe -File $syncScript `
	-Repo $Repo `
	-DevFirebaseToken $token `
	-UatFirebaseToken $token `
	-RemoveLegacy

if ($LASTEXITCODE -ne 0) {
	throw "Failed to sync GitHub Firebase token auth config."
}

Write-Step "Done"
Write-Host "GitHub repo: $Repo" -ForegroundColor Green
