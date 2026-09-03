param(
    [string]$Repo = "hrisworkforcesystem-coder/hris-app",
    [string]$DevProjectId = "hris-workforce-dev-20260416",
    [string]$UatProjectId = "hris-workforce-uat-20260416",
    [string]$DevDisplayName = "HRIS DEV",
    [string]$UatDisplayName = "HRIS UAT",
    [switch]$SkipHostingSites,
    [switch]$SkipGitHubEnvSync,
    [string]$DevBaseUrl = "",
    [string]$UatBaseUrl = "",
    [string]$DevCloudinaryPath = "",
    [string]$UatCloudinaryPath = "",
    [string]$DevServiceAccountJsonPath = "",
    [string]$UatServiceAccountJsonPath = ""
)

$ErrorActionPreference = "Stop"

function Write-Step {
    param([string]$Message)
    Write-Host ""
    Write-Host "==> $Message" -ForegroundColor Cyan
}

$firebaseRoot = Split-Path -Parent $PSScriptRoot
$projectRoot = Split-Path -Parent $firebaseRoot
$manageScript = Join-Path $PSScriptRoot "manage-firebase-projects.ps1"
$syncScript = Join-Path $projectRoot "scripts\\setup-firebase-github-env.ps1"

if (-not (Test-Path $manageScript)) {
    throw "Could not find manage-firebase-projects.ps1 at $manageScript"
}

if (-not (Test-Path $syncScript)) {
    throw "Could not find setup-firebase-github-env.ps1 at $syncScript"
}

$manageArgs = @(
    "-File", $manageScript,
    "-Action", "ensure",
    "-Repo", $Repo,
    "-DevProjectId", $DevProjectId,
    "-UatProjectId", $UatProjectId,
    "-DevDisplayName", $DevDisplayName,
    "-UatDisplayName", $UatDisplayName
)

if (-not $SkipHostingSites) {
    $manageArgs += "-CreateHostingSites"
}

Write-Step "Creating or enabling Firebase DEV/UAT projects"
& powershell.exe @manageArgs
if ($LASTEXITCODE -ne 0) {
    throw "Failed while ensuring Firebase projects."
}

if (-not $SkipGitHubEnvSync) {
    $syncArgs = @(
        "-File", $syncScript,
        "-Repo", $Repo,
        "-DevBaseUrl", $DevBaseUrl,
        "-UatBaseUrl", $UatBaseUrl,
        "-DevCloudinaryPath", $DevCloudinaryPath,
        "-UatCloudinaryPath", $UatCloudinaryPath,
        "-DevServiceAccountJsonPath", $DevServiceAccountJsonPath,
        "-UatServiceAccountJsonPath", $UatServiceAccountJsonPath
    )

    Write-Step "Syncing Firebase GitHub variables and secrets"
    & powershell.exe @syncArgs
    if ($LASTEXITCODE -ne 0) {
        throw "Failed while syncing GitHub Firebase environment values."
    }
}

Write-Step "Done"
Write-Host "DEV project: $DevProjectId" -ForegroundColor Green
Write-Host "UAT project: $UatProjectId" -ForegroundColor Green
