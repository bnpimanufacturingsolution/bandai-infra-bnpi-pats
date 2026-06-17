<#
.SYNOPSIS
    End-to-end setup for HRIS API GitHub CD to GCP.
#>

param(
    [Parameter(Mandatory = $true)]
    [ValidateSet("dev", "uat")]
    [string]$Environment,

    [Parameter(Mandatory = $false)]
    [string]$EnvFilePath,

    [Parameter(Mandatory = $false)]
    [string]$ProjectId = "hris-492904",

    [Parameter(Mandatory = $false)]
    [string]$Region = "asia-southeast1",

    [Parameter(Mandatory = $false)]
    [string]$ServiceName,

    [Parameter(Mandatory = $false)]
    [string]$RepositoryName = "hris-api-repo",

    [Parameter(Mandatory = $false)]
    [string]$Repo,

    [Parameter(Mandatory = $false)]
    [string]$BuildServiceAccountName,

    [Parameter(Mandatory = $false)]
    [string]$GitHubServiceAccountName,

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

function Get-GCloudProjectNumber {
    param([string]$ResolvedProjectId)

    $gcloudCommand = Get-Command gcloud -ErrorAction SilentlyContinue
    if (-not $gcloudCommand) {
        Write-Err "gcloud is required to resolve the project number."
        exit 1
    }

    $gcloudExecutable = $gcloudCommand.Source
    $candidateCmd = Join-Path (Split-Path $gcloudExecutable) "gcloud.cmd"
    if (Test-Path $candidateCmd) {
        $gcloudExecutable = $candidateCmd
    }

    $projectNumber = & $gcloudExecutable projects describe $ResolvedProjectId --format="value(projectNumber)"
    if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($projectNumber)) {
        Write-Err "Failed to resolve project number for $ResolvedProjectId"
        exit 1
    }

    return $projectNumber.Trim()
}

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

function Resolve-EnvironmentDefaults {
    param(
        [string]$ResolvedEnvironment,
        [string]$ProjectRootPath,
        [string]$ResolvedServiceName,
        [string]$ResolvedBuildServiceAccountName,
        [string]$ResolvedGitHubServiceAccountName
    )

    $config = @{
        ServiceName = $ResolvedServiceName
        BuildServiceAccountName = $ResolvedBuildServiceAccountName
        GitHubServiceAccountName = $ResolvedGitHubServiceAccountName
        EnvFilePath = Join-Path $ProjectRootPath ".env"
    }

    $suffix = $ResolvedEnvironment.ToLowerInvariant()
    if ([string]::IsNullOrWhiteSpace($config.ServiceName)) {
        $config.ServiceName = "hris-api-$suffix"
    }
    if ([string]::IsNullOrWhiteSpace($config.BuildServiceAccountName)) {
        $config.BuildServiceAccountName = "hris-$suffix-cb-deploy"
    }
    if ([string]::IsNullOrWhiteSpace($config.GitHubServiceAccountName)) {
        $config.GitHubServiceAccountName = "hris-$suffix-gh-deploy"
    }
    $config.EnvFilePath = Join-Path $ProjectRootPath ".env.$suffix"
    return $config
}

$scriptDir = $PSScriptRoot
$projectRoot = Split-Path -Parent $scriptDir
$envDefaults = Resolve-EnvironmentDefaults -ResolvedEnvironment $Environment -ProjectRootPath $projectRoot -ResolvedServiceName $ServiceName -ResolvedBuildServiceAccountName $BuildServiceAccountName -ResolvedGitHubServiceAccountName $GitHubServiceAccountName
$ServiceName = $envDefaults.ServiceName
$BuildServiceAccountName = $envDefaults.BuildServiceAccountName
$GitHubServiceAccountName = $envDefaults.GitHubServiceAccountName
if ([string]::IsNullOrWhiteSpace($EnvFilePath)) {
    $EnvFilePath = $envDefaults.EnvFilePath
}

$gcpDeployScript = Join-Path $scriptDir "gcp-deploy.ps1"
$syncSecretsScript = Join-Path $scriptDir "sync-github-deploy-secrets.ps1"
$setupWorkloadIdentityScript = Join-Path $scriptDir "setup-github-workload-identity.ps1"

foreach ($scriptPath in @($gcpDeployScript, $syncSecretsScript, $setupWorkloadIdentityScript)) {
    if (-not (Test-Path $scriptPath)) {
        Write-Err "Required script not found: $scriptPath"
        exit 1
    }
}

if ([string]::IsNullOrWhiteSpace($Repo)) {
    $gitCommand = Get-Command git -ErrorAction SilentlyContinue
    if ($gitCommand) {
        $originUrl = (& git -C $projectRoot remote get-url origin 2>$null)
        if ($LASTEXITCODE -eq 0 -and $originUrl -match "github\.com[:/](.+?)(?:\.git)?$") {
            $Repo = $matches[1]
        }
    }
}

if ([string]::IsNullOrWhiteSpace($Repo)) {
    Write-Err "Could not determine GitHub repo. Pass -Repo owner/name."
    exit 1
}

Write-Step "Bootstrapping GCP deploy resources and secrets"
if (-not $SkipInitialDeploy) {
    $gcpDeployArgs = @(
        "-File", $gcpDeployScript,
        "-Environment", $Environment,
        "-EnvFilePath", $EnvFilePath,
        "-ProjectId", $ProjectId,
        "-Region", $Region,
        "-ServiceName", $ServiceName,
        "-RepositoryName", $RepositoryName,
        "-BuildServiceAccountName", $BuildServiceAccountName
    )

    if ($CreateTrigger) {
        $gcpDeployArgs += "-CreateTrigger"
        if ($RepoOwner) {
            $gcpDeployArgs += @("-RepoOwner", $RepoOwner)
        }
        if ($RepoName) {
            $gcpDeployArgs += @("-RepoName", $RepoName)
        }
    }

    & powershell.exe @gcpDeployArgs
    Ensure-Success "GCP bootstrap/deploy failed"
    Write-OK "GCP bootstrap completed"
} else {
    Write-OK "Skipped initial deploy bootstrap"
}

Write-Step "Configuring GitHub Workload Identity"
$workloadIdentityArgs = @(
    "-File", $setupWorkloadIdentityScript,
    "-Environment", $Environment,
    "-ProjectId", $ProjectId,
    "-ServiceAccountName", $GitHubServiceAccountName,
    "-Repo", $Repo,
    "-PoolId", $WorkloadIdentityPoolId,
    "-ProviderId", $WorkloadIdentityProviderId
)

if ($ForceRecreateProvider) {
    $workloadIdentityArgs += "-ForceRecreateProvider"
}

& powershell.exe @workloadIdentityArgs
Ensure-Success "Failed to configure Workload Identity"
Write-OK "GitHub Workload Identity is ready"

Write-Step "Syncing GitHub workflow secrets"
$projectNumber = Get-GCloudProjectNumber -ResolvedProjectId $ProjectId
$syncSecretsArgs = @(
    "-File", $syncSecretsScript,
    "-Environment", $Environment,
    "-Repo", $Repo,
    "-EnvFilePath", $EnvFilePath,
    "-ProjectId", $ProjectId,
    "-Region", $Region,
    "-ServiceName", $ServiceName,
    "-ArtifactRepository", $RepositoryName,
    "-WorkloadIdentityProvider", "projects/$projectNumber/locations/global/workloadIdentityPools/$WorkloadIdentityPoolId/providers/$WorkloadIdentityProviderId",
    "-ServiceAccountEmail", "$GitHubServiceAccountName@$ProjectId.iam.gserviceaccount.com"
)

& powershell.exe @syncSecretsArgs
Ensure-Success "Failed to sync GitHub workflow secrets"
Write-OK "GitHub workflow secrets synced"

Write-Host ""
Write-Host "GitHub CD setup is complete for $Repo." -ForegroundColor Green
Write-Host "Environment: $Environment" -ForegroundColor Green
if (-not $SkipInitialDeploy) {
    Write-Host "An initial Cloud Build deployment was also submitted during setup." -ForegroundColor Green
}
