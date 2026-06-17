<#
.SYNOPSIS
    Bootstraps both DEV and UAT HRIS API environments on GCP in one command.

.DESCRIPTION
    This is a convenience wrapper around setup-github-cd.ps1 so you do not need
    to run DEV and UAT setup separately.
#>

param(
    [Parameter(Mandatory = $false)]
    [string]$ProjectId = "hris-492904",

    [Parameter(Mandatory = $false)]
    [string]$Region = "asia-southeast1",

    [Parameter(Mandatory = $false)]
    [string]$RepositoryName = "hris-api-repo",

    [Parameter(Mandatory = $false)]
    [string]$Repo,

    [Parameter(Mandatory = $false)]
    [switch]$SkipInitialDeploy,

    [Parameter(Mandatory = $false)]
    [string]$WorkloadIdentityPoolId = "github-actions-pool",

    [Parameter(Mandatory = $false)]
    [string]$WorkloadIdentityProviderId = "github-provider",

    [Parameter(Mandatory = $false)]
    [switch]$ForceRecreateProvider,

    [Parameter(Mandatory = $false)]
    [switch]$CreateTrigger,

    [Parameter(Mandatory = $false)]
    [string]$RepoOwner,

    [Parameter(Mandatory = $false)]
    [string]$RepoName
)

$ErrorActionPreference = "Stop"

function Write-Step {
    param([string]$Message)
    Write-Host "`n[STEP] $Message" -ForegroundColor Cyan
}

function Write-OK {
    param([string]$Message)
    Write-Host "[OK] $Message" -ForegroundColor Green
}

function Write-Err {
    param([string]$Message)
    Write-Host "[ERROR] $Message" -ForegroundColor Red
}

function Ensure-Success {
    param([string]$Message)
    if ($LASTEXITCODE -ne 0) {
        Write-Err $Message
        exit 1
    }
}

$setupScript = Join-Path $PSScriptRoot "setup-github-cd.ps1"
if (-not (Test-Path $setupScript)) {
    Write-Err "Required script not found: $setupScript"
    exit 1
}

foreach ($environmentName in @("dev", "uat")) {
    Write-Step "Running full setup for $environmentName"

    $args = @(
        "-File", $setupScript,
        "-Environment", $environmentName,
        "-ProjectId", $ProjectId,
        "-Region", $Region,
        "-RepositoryName", $RepositoryName
    )

    if (-not [string]::IsNullOrWhiteSpace($Repo)) {
        $args += @("-Repo", $Repo)
    }

    if ($SkipInitialDeploy) {
        $args += "-SkipInitialDeploy"
    }

    if (-not [string]::IsNullOrWhiteSpace($WorkloadIdentityPoolId)) {
        $args += @("-WorkloadIdentityPoolId", $WorkloadIdentityPoolId)
    }

    if (-not [string]::IsNullOrWhiteSpace($WorkloadIdentityProviderId)) {
        $args += @("-WorkloadIdentityProviderId", $WorkloadIdentityProviderId)
    }

    if ($ForceRecreateProvider) {
        $args += "-ForceRecreateProvider"
    }

    if ($CreateTrigger) {
        $args += "-CreateTrigger"
    }

    if (-not [string]::IsNullOrWhiteSpace($RepoOwner)) {
        $args += @("-RepoOwner", $RepoOwner)
    }

    if (-not [string]::IsNullOrWhiteSpace($RepoName)) {
        $args += @("-RepoName", $RepoName)
    }

    & powershell.exe @args
    Ensure-Success "Failed while setting up environment $environmentName"
    Write-OK "Completed setup for $environmentName"
}

Write-Host ""
Write-Host "All environments are set up." -ForegroundColor Green
