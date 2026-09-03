<#
.SYNOPSIS
    Syncs local HRIS API deploy settings into GitHub Actions secrets.

.DESCRIPTION
    This script reads the selected HRIS API environment file, derives the GitHub
    Actions secrets used by .github/workflows/deploy.yml, and pushes them to the
    target GitHub repository using GitHub CLI.
#>

param(
    [Parameter(Mandatory = $true)]
    [ValidateSet("dev", "uat")]
    [string]$Environment,

    [Parameter(Mandatory = $false)]
    [string]$Repo,

    [Parameter(Mandatory = $false)]
    [string]$EnvFilePath,

    [Parameter(Mandatory = $false)]
    [string]$ProjectId,

    [Parameter(Mandatory = $false)]
    [string]$WorkloadIdentityProvider,

    [Parameter(Mandatory = $false)]
    [string]$ServiceAccountEmail,

    [Parameter(Mandatory = $false)]
    [string]$RuntimeServiceAccountEmail,

    [Parameter(Mandatory = $false)]
    [string]$WorkloadIdentityPoolId = "github-actions-pool",

    [Parameter(Mandatory = $false)]
    [string]$WorkloadIdentityProviderId = "github-provider",

    [Parameter(Mandatory = $false)]
    [string]$Region = "asia-southeast1",

    [Parameter(Mandatory = $false)]
    [string]$ServiceName,

    [Parameter(Mandatory = $false)]
    [string]$ArtifactRepository = "hris-api-repo",

    [Parameter(Mandatory = $false)]
    [string]$AllowUnauthenticated = "true",

    [Parameter(Mandatory = $false)]
    [switch]$SkipWorkloadIdentity
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

function Write-Warn {
    param([string]$Message)
    Write-Host "[WARN] $Message" -ForegroundColor Yellow
}

function Write-Err {
    param([string]$Message)
    Write-Host "[ERROR] $Message" -ForegroundColor Red
}

function Ensure-Command {
    param([string]$CommandName)

    $command = Get-Command $CommandName -ErrorAction SilentlyContinue
    if (-not $command) {
        Write-Err "$CommandName is not installed or not available in PATH."
        exit 1
    }

    return $command.Source
}

function Get-GCloudProjectNumber {
    param([string]$ResolvedProjectId)

    $command = Get-Command gcloud -ErrorAction SilentlyContinue
    if (-not $command) {
        return $null
    }

    $gcloudExecutable = $command.Source
    $candidateCmd = Join-Path (Split-Path $gcloudExecutable) "gcloud.cmd"
    if (Test-Path $candidateCmd) {
        $gcloudExecutable = $candidateCmd
    }

    $projectNumber = & $gcloudExecutable projects describe $ResolvedProjectId --format="value(projectNumber)" 2>$null
    if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($projectNumber)) {
        return $null
    }

    return $projectNumber.Trim()
}

function Get-EnvMap {
    param([string]$Path)

    $values = @{}
    if (-not (Test-Path $Path)) {
        return $values
    }

    Get-Content $Path | ForEach-Object {
        $line = $_.Trim()
        if (-not $line -or $line.StartsWith("#")) {
            return
        }

        $eqIndex = $line.IndexOf("=")
        if ($eqIndex -le 0) {
            return
        }

        $key = $line.Substring(0, $eqIndex).Trim()
        $value = $line.Substring($eqIndex + 1).Trim().Trim('"').Trim("'")
        $values[$key] = $value
    }

    return $values
}

function Resolve-GitHubRepo {
    param([string]$RemoteUrl)

    if ([string]::IsNullOrWhiteSpace($RemoteUrl)) {
        return $null
    }

    if ($RemoteUrl -match "github\.com[:/](.+?)(?:\.git)?$") {
        return $matches[1]
    }

    return $null
}

function Set-GitHubSecret {
    param(
        [string]$RepoName,
        [string]$SecretName,
        [string]$SecretValue
    )

    if ([string]::IsNullOrWhiteSpace($SecretValue)) {
        Write-Warn "Skipping $SecretName because it has no value."
        return
    }

    & gh secret set $SecretName --repo $RepoName --body $SecretValue
    if ($LASTEXITCODE -ne 0) {
        throw "Failed to set GitHub secret $SecretName"
    }
    Write-OK "Synced $SecretName"
}

function Resolve-EnvironmentDefaults {
    param(
        [string]$ResolvedEnvironment,
        [string]$ProjectRootPath,
        [string]$ResolvedServiceName,
        [string]$ResolvedServiceAccountEmail,
        [string]$ResolvedRuntimeServiceAccountEmail
    )

    $config = @{
        EnvFilePath = Join-Path $ProjectRootPath ".env"
        ServiceName = $ResolvedServiceName
        ServiceAccountEmail = $ResolvedServiceAccountEmail
        RuntimeServiceAccountEmail = $ResolvedRuntimeServiceAccountEmail
        SecretPrefix = "hris-api"
        SecretSuffix = ""
    }

    $suffix = $ResolvedEnvironment.ToLowerInvariant()
    $upperSuffix = $suffix.ToUpperInvariant()
    $config.EnvFilePath = Join-Path $ProjectRootPath ".env.$suffix"
    $config.SecretPrefix = "hris-api-$suffix"
    $config.SecretSuffix = "_$upperSuffix"
    if ([string]::IsNullOrWhiteSpace($config.ServiceName)) {
        $config.ServiceName = "hris-api-$suffix"
    }
    if ([string]::IsNullOrWhiteSpace($config.ServiceAccountEmail)) {
        $config.ServiceAccountEmail = "hris-$suffix-gh-deploy@$ProjectId.iam.gserviceaccount.com"
    }
    if ([string]::IsNullOrWhiteSpace($config.RuntimeServiceAccountEmail)) {
        $config.RuntimeServiceAccountEmail = "hris-$suffix-runtime@$ProjectId.iam.gserviceaccount.com"
    }

    return $config
}

function Get-SecretNameMap {
    param([string]$SecretPrefix)

    return [ordered]@{
        "SECRET_DATABASE_URL" = "$SecretPrefix-database-url"
        "SECRET_JWT_SECRET" = "$SecretPrefix-jwt-secret"
        "SECRET_CORS_ORIGINS" = "$SecretPrefix-cors-origins"
        "SECRET_CORS_CREDENTIALS" = "$SecretPrefix-cors-credentials"
        "SECRET_GCS_BUCKET_NAME" = "$SecretPrefix-gcs-bucket-name"
        "SECRET_GCS_PROJECT_ID" = "$SecretPrefix-gcs-project-id"
        "SECRET_GCS_PUBLIC_BASE_URL" = "$SecretPrefix-gcs-public-base-url"
        "SECRET_BETTER_STACK_SOURCE_TOKEN" = "$SecretPrefix-better-stack-source-token"
        "SECRET_BETTER_STACK_HOST" = "$SecretPrefix-better-stack-host"
        "SECRET_CLOUDINARY_CLOUD_NAME" = "$SecretPrefix-cloudinary-cloud-name"
        "SECRET_CLOUDINARY_API_KEY" = "$SecretPrefix-cloudinary-api-key"
        "SECRET_CLOUDINARY_API_SECRET" = "$SecretPrefix-cloudinary-api-secret"
    }
}

$projectRoot = Split-Path -Parent $PSScriptRoot
if ([string]::IsNullOrWhiteSpace($ProjectId)) {
    $ProjectId = "hris-492904"
}

Write-Step "Checking required tools"
Ensure-Command "gh" | Out-Null
Ensure-Command "git" | Out-Null
Write-OK "gh and git are available"

Write-Step "Checking GitHub authentication"
& gh auth status | Out-Null
if ($LASTEXITCODE -ne 0) {
    Write-Err "GitHub CLI is not authenticated. Run: gh auth login"
    exit 1
}
Write-OK "GitHub CLI authentication detected"

Write-Step "Resolving target repository"
if (-not $Repo) {
    $originUrl = (& git -C $projectRoot remote get-url origin 2>$null)
    if ($LASTEXITCODE -eq 0) {
        $Repo = Resolve-GitHubRepo -RemoteUrl $originUrl
    }
}

if ([string]::IsNullOrWhiteSpace($Repo)) {
    Write-Err "Could not determine GitHub repo. Pass -Repo owner/name."
    exit 1
}
Write-OK "Using repository $Repo"

if ([string]::IsNullOrWhiteSpace($ProjectId)) {
    $ProjectId = "hris-492904"
}

$envDefaults = Resolve-EnvironmentDefaults -ResolvedEnvironment $Environment -ProjectRootPath $projectRoot -ResolvedServiceName $ServiceName -ResolvedServiceAccountEmail $ServiceAccountEmail -ResolvedRuntimeServiceAccountEmail $RuntimeServiceAccountEmail
$ServiceName = $envDefaults.ServiceName
$ServiceAccountEmail = $envDefaults.ServiceAccountEmail
$RuntimeServiceAccountEmail = $envDefaults.RuntimeServiceAccountEmail
$secretNames = Get-SecretNameMap -SecretPrefix $envDefaults.SecretPrefix

if (-not $EnvFilePath) {
    $EnvFilePath = $envDefaults.EnvFilePath
}

Write-Step "Loading environment values"
$envVars = Get-EnvMap -Path $EnvFilePath
if ($envVars.Count -eq 0) {
    Write-Err "No values found in $EnvFilePath"
    exit 1
}
Write-OK "Loaded $($envVars.Count) values from $EnvFilePath"

$secretSuffix = $envDefaults.SecretSuffix
$projectNumber = $null
if (-not $SkipWorkloadIdentity -and [string]::IsNullOrWhiteSpace($WorkloadIdentityProvider)) {
    $projectNumber = Get-GCloudProjectNumber -ResolvedProjectId $ProjectId
    if (-not [string]::IsNullOrWhiteSpace($projectNumber)) {
        $WorkloadIdentityProvider = "projects/$projectNumber/locations/global/workloadIdentityPools/$WorkloadIdentityPoolId/providers/$WorkloadIdentityProviderId"
    }
}

$secretValues = [ordered]@{
    "GCP_PROJECT_ID$secretSuffix" = $ProjectId
    "GCP_REGION$secretSuffix" = $Region
    "CLOUD_RUN_SERVICE$secretSuffix" = $ServiceName
    "ARTIFACT_REPOSITORY$secretSuffix" = $ArtifactRepository
    "ALLOW_UNAUTHENTICATED$secretSuffix" = $AllowUnauthenticated
}

foreach ($entry in $secretNames.GetEnumerator()) {
    $secretValues["$($entry.Key)$secretSuffix"] = $entry.Value
}

if (-not $SkipWorkloadIdentity) {
    if (-not [string]::IsNullOrWhiteSpace($WorkloadIdentityProvider)) {
        $secretValues["GCP_WORKLOAD_IDENTITY_PROVIDER$secretSuffix"] = $WorkloadIdentityProvider
    }
    if (-not [string]::IsNullOrWhiteSpace($ServiceAccountEmail)) {
        $secretValues["GCP_SERVICE_ACCOUNT_EMAIL$secretSuffix"] = $ServiceAccountEmail
    }
    if (-not [string]::IsNullOrWhiteSpace($RuntimeServiceAccountEmail)) {
        $secretValues["GCP_RUNTIME_SERVICE_ACCOUNT_EMAIL$secretSuffix"] = $RuntimeServiceAccountEmail
    }
}

Write-Step "Syncing GitHub Actions secrets"
foreach ($entry in $secretValues.GetEnumerator()) {
    Set-GitHubSecret -RepoName $Repo -SecretName $entry.Key -SecretValue $entry.Value
}

if ($SkipWorkloadIdentity) {
    Write-Warn "Skipped Workload Identity secrets because -SkipWorkloadIdentity was set."
} elseif (-not $secretValues.Contains("GCP_WORKLOAD_IDENTITY_PROVIDER$secretSuffix")) {
    Write-Warn "GCP_WORKLOAD_IDENTITY_PROVIDER$secretSuffix was not synced. Pass -WorkloadIdentityProvider or ensure gcloud can resolve the project number."
}

Write-Host ""
Write-Host "GitHub deploy secrets are now synced for $Repo." -ForegroundColor Green
Write-Host "Environment: $Environment" -ForegroundColor Green
