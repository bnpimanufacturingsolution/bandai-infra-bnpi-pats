<#
.SYNOPSIS
    Bootstraps HRIS API resources on GCP and performs an initial Cloud Run deployment.

.DESCRIPTION
    This script is idempotent and designed to be called by setup-github-cd.ps1.
    It will:
    1. set active gcloud project
    2. enable required APIs
    3. ensure Artifact Registry repository exists
    4. ensure deploy/build service account exists with required IAM roles
    5. mirror selected environment values into Secret Manager
    6. build and push image via Cloud Build
    7. deploy image to Cloud Run with Secret Manager bindings
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
    [string]$BuildServiceAccountName,

    [Parameter(Mandatory = $false)]
    [string]$RuntimeServiceAccountName,

    [Parameter(Mandatory = $false)]
    [ValidateSet("all", "apis", "artifact-registry", "service-account", "secrets", "build", "deploy")]
    [string]$StartFrom = "all",

    [Parameter(Mandatory = $false)]
    [string]$Image,

    [Parameter(Mandatory = $false)]
    [switch]$CreateTrigger,

    [Parameter(Mandatory = $false)]
    [string]$RepoOwner,

    [Parameter(Mandatory = $false)]
    [string]$RepoName
)

$ErrorActionPreference = "Stop"
$script:GCloudCommand = $null

function Write-Step { param([string]$Message) Write-Host "`n[STEP] $Message" -ForegroundColor Cyan }
function Write-OK { param([string]$Message) Write-Host "[OK] $Message" -ForegroundColor Green }
function Write-Warn { param([string]$Message) Write-Host "[WARN] $Message" -ForegroundColor Yellow }
function Write-Err { param([string]$Message) Write-Host "[ERROR] $Message" -ForegroundColor Red }
function Ensure-Success { param([string]$Message) if ($LASTEXITCODE -ne 0) { Write-Err $Message; exit 1 } }

function Should-RunStep {
    param([string]$StepName)

    $order = @{
        "all" = 0
        "apis" = 1
        "artifact-registry" = 2
        "service-account" = 3
        "secrets" = 4
        "build" = 5
        "deploy" = 6
    }

    return $order[$StepName] -ge $order[$StartFrom]
}

function Initialize-GCloudCommand {
    $command = Get-Command gcloud -ErrorAction SilentlyContinue
    if ($command) {
        $binDir = Split-Path $command.Source
        $cmdPath = Join-Path $binDir "gcloud.cmd"
        if (Test-Path $cmdPath) {
            $script:GCloudCommand = $cmdPath
            return
        }

        $script:GCloudCommand = $command.Source
    }
}

function Invoke-GCloud {
    param([Parameter(ValueFromRemainingArguments = $true)][string[]]$Arguments)

    $prevPref = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    try {
        & $script:GCloudCommand @Arguments
    } finally {
        $ErrorActionPreference = $prevPref
    }
}

function Get-GCloudValue {
    param([Parameter(ValueFromRemainingArguments = $true)][string[]]$Arguments)

    $psi = New-Object System.Diagnostics.ProcessStartInfo
    $psi.FileName = $script:GCloudCommand
    $psi.Arguments = ($Arguments -join " ")
    $psi.RedirectStandardOutput = $true
    $psi.RedirectStandardError = $true
    $psi.UseShellExecute = $false
    $psi.CreateNoWindow = $true

    $process = New-Object System.Diagnostics.Process
    $process.StartInfo = $psi
    $null = $process.Start()
    $stdout = $process.StandardOutput.ReadToEnd()
    $stderr = $process.StandardError.ReadToEnd()
    $process.WaitForExit()
    $global:LASTEXITCODE = $process.ExitCode

    if ($process.ExitCode -ne 0 -and -not [string]::IsNullOrWhiteSpace($stderr)) {
        Write-Warn ($stderr.Trim())
    }

    return $stdout.Trim()
}

function Ensure-ServiceAccount {
    param(
        [string]$Project,
        [string]$ServiceAccountName,
        [string]$DisplayName
    )

    $serviceAccountEmail = "$ServiceAccountName@$Project.iam.gserviceaccount.com"
    Invoke-GCloud iam service-accounts describe $serviceAccountEmail --project $Project *> $null
    if ($LASTEXITCODE -ne 0) {
        Invoke-GCloud iam service-accounts create $ServiceAccountName --display-name $DisplayName --project $Project *> $null
        Ensure-Success "Failed to create service account $ServiceAccountName"
    }

    return $serviceAccountEmail
}

function Grant-ProjectRoles {
    param(
        [string]$Project,
        [string]$Member,
        [string[]]$Roles
    )

    foreach ($role in $Roles) {
        Invoke-GCloud projects add-iam-policy-binding $Project --member $Member --role $role --quiet *> $null
        Ensure-Success "Failed to grant $role to $Member"
    }
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

function Ensure-SecretVersion {
    param(
        [string]$Project,
        [string]$SecretName,
        [string]$SecretValue
    )

    if ([string]::IsNullOrWhiteSpace($SecretValue)) {
        Write-Warn "Skipping secret $SecretName (empty value)"
        return
    }

    Invoke-GCloud secrets describe $SecretName --project $Project *> $null
    if ($LASTEXITCODE -ne 0) {
        Invoke-GCloud secrets create $SecretName --project $Project --replication-policy automatic *> $null
        Ensure-Success "Failed to create secret $SecretName"
    }

    $tmpFile = New-TemporaryFile
    try {
        Set-Content -LiteralPath $tmpFile -Value $SecretValue -NoNewline
        Invoke-GCloud secrets versions add $SecretName --project $Project --data-file $tmpFile *> $null
        Ensure-Success "Failed to add secret version for $SecretName"
        Write-OK "Secret synced: $SecretName"
    } finally {
        Remove-Item -LiteralPath $tmpFile -ErrorAction SilentlyContinue
    }
}

function Resolve-DeployImage {
    param(
        [string]$ExplicitImage,
        [string]$ResolvedRegion,
        [string]$ResolvedProjectId,
        [string]$ResolvedRepositoryName,
        [string]$ResolvedServiceName
    )

    if (-not [string]::IsNullOrWhiteSpace($ExplicitImage)) {
        return $ExplicitImage
    }

    if (Should-RunStep "build") {
        $imageTag = "bootstrap-$([DateTimeOffset]::UtcNow.ToUnixTimeSeconds())"
        return "${ResolvedRegion}-docker.pkg.dev/$ResolvedProjectId/$ResolvedRepositoryName/${ResolvedServiceName}:$imageTag"
    }

    $latestImage = Get-GCloudValue artifacts docker images list "${ResolvedRegion}-docker.pkg.dev/$ResolvedProjectId/$ResolvedRepositoryName/$ResolvedServiceName" --include-tags --format="value(VERSION)" --sort-by="~UPDATE_TIME" --limit=1
    Ensure-Success "Failed to resolve latest Artifact Registry image"
    if ([string]::IsNullOrWhiteSpace($latestImage)) {
        Write-Err "No existing image found in Artifact Registry for $ResolvedServiceName."
        Write-Err "Run with -StartFrom build, or pass -Image with a fully qualified image reference."
        exit 1
    }

    return "${ResolvedRegion}-docker.pkg.dev/$ResolvedProjectId/$ResolvedRepositoryName/${ResolvedServiceName}@$latestImage"
}

function Resolve-EnvironmentDefaults {
    param(
        [string]$ResolvedEnvironment,
        [string]$ProjectRootPath,
        [string]$ResolvedServiceName,
        [string]$ResolvedBuildServiceAccountName,
        [string]$ResolvedRuntimeServiceAccountName
    )

    $config = @{
        ServiceName = $ResolvedServiceName
        BuildServiceAccountName = $ResolvedBuildServiceAccountName
        RuntimeServiceAccountName = $ResolvedRuntimeServiceAccountName
        EnvFilePath = $null
        SecretPrefix = "hris-api"
    }

    $suffix = $ResolvedEnvironment.ToLowerInvariant()
    if ([string]::IsNullOrWhiteSpace($config.ServiceName)) {
        $config.ServiceName = "hris-api-$suffix"
    }
    if ([string]::IsNullOrWhiteSpace($config.BuildServiceAccountName)) {
        $config.BuildServiceAccountName = "hris-$suffix-cb-deploy"
    }
    if ([string]::IsNullOrWhiteSpace($config.RuntimeServiceAccountName)) {
        $config.RuntimeServiceAccountName = "hris-$suffix-runtime"
    }
    $config.EnvFilePath = Join-Path $ProjectRootPath ".env.$suffix"
    $config.SecretPrefix = "hris-api-$suffix"
    return $config
}

function Get-SecretPairs {
    param([string]$SecretPrefix)

    return [ordered]@{
        "DATABASE_URL" = "$SecretPrefix-database-url"
        "JWT_SECRET" = "$SecretPrefix-jwt-secret"
        "CORS_ORIGINS" = "$SecretPrefix-cors-origins"
        "CORS_CREDENTIALS" = "$SecretPrefix-cors-credentials"
        "GCS_BUCKET_NAME" = "$SecretPrefix-gcs-bucket-name"
        "GCS_PROJECT_ID" = "$SecretPrefix-gcs-project-id"
        "GCS_PUBLIC_BASE_URL" = "$SecretPrefix-gcs-public-base-url"
        "BETTER_STACK_SOURCE_TOKEN" = "$SecretPrefix-better-stack-source-token"
        "BETTER_STACK_HOST" = "$SecretPrefix-better-stack-host"
        "CLOUDINARY_CLOUD_NAME" = "$SecretPrefix-cloudinary-cloud-name"
        "CLOUDINARY_API_KEY" = "$SecretPrefix-cloudinary-api-key"
        "CLOUDINARY_API_SECRET" = "$SecretPrefix-cloudinary-api-secret"
    }
}

Initialize-GCloudCommand
if (-not $script:GCloudCommand) {
    Write-Err "gcloud is not installed or not available in PATH."
    exit 1
}

$projectRoot = Split-Path -Parent $PSScriptRoot
$envConfig = Resolve-EnvironmentDefaults -ResolvedEnvironment $Environment -ProjectRootPath $projectRoot -ResolvedServiceName $ServiceName -ResolvedBuildServiceAccountName $BuildServiceAccountName -ResolvedRuntimeServiceAccountName $RuntimeServiceAccountName
$ServiceName = $envConfig.ServiceName
$BuildServiceAccountName = $envConfig.BuildServiceAccountName
$RuntimeServiceAccountName = $envConfig.RuntimeServiceAccountName
$secretPairs = Get-SecretPairs -SecretPrefix $envConfig.SecretPrefix

if ([string]::IsNullOrWhiteSpace($EnvFilePath)) {
    $EnvFilePath = $envConfig.EnvFilePath
}

$envVars = Get-EnvMap -Path $EnvFilePath
if ($envVars.Count -eq 0) {
    Write-Err "No values found in $EnvFilePath"
    exit 1
}

Write-Step "Setting active project"
Invoke-GCloud config set project $ProjectId *> $null
Ensure-Success "Failed to set project"
Write-OK "Using project $ProjectId"

$projectNumber = Get-GCloudValue projects describe $ProjectId --format="value(projectNumber)"
Ensure-Success "Failed to resolve project number"
$defaultBuildServiceAccountEmail = "$projectNumber-compute@developer.gserviceaccount.com"
$runtimeServiceAccountEmail = "$RuntimeServiceAccountName@$ProjectId.iam.gserviceaccount.com"
Write-OK "Detected default Cloud Build execution identity: $defaultBuildServiceAccountEmail"
Write-OK "Deploy environment: $Environment"

if (Should-RunStep "apis") {
    Write-Step "Enabling required APIs"
    Invoke-GCloud services enable run.googleapis.com artifactregistry.googleapis.com secretmanager.googleapis.com cloudbuild.googleapis.com iam.googleapis.com iamcredentials.googleapis.com --project $ProjectId --quiet *> $null
    if ($LASTEXITCODE -ne 0) {
        Write-Err "Failed to enable required APIs. This is commonly caused by missing project billing."
        Write-Err "Verify billing is enabled for project $ProjectId, then rerun this script."
        exit 1
    }
} else {
    Write-Warn "Skipping API enablement because StartFrom=$StartFrom"
}

if (Should-RunStep "artifact-registry") {
    Write-Step "Ensuring Artifact Registry repository exists"
    Invoke-GCloud artifacts repositories describe $RepositoryName --location $Region --project $ProjectId *> $null
    if ($LASTEXITCODE -ne 0) {
        Invoke-GCloud artifacts repositories create $RepositoryName --repository-format docker --location $Region --description "HRIS API Docker images" --project $ProjectId *> $null
        Ensure-Success "Failed to create Artifact Registry repository"
    }
    Write-OK "Artifact Registry ready: $RepositoryName"
} else {
    Write-Warn "Skipping Artifact Registry setup because StartFrom=$StartFrom"
}

$buildServiceAccountEmail = "$BuildServiceAccountName@$ProjectId.iam.gserviceaccount.com"
if (Should-RunStep "service-account") {
    Write-Step "Ensuring Cloud Build deployer service account exists"
    $buildServiceAccountEmail = Ensure-ServiceAccount -Project $ProjectId -ServiceAccountName $BuildServiceAccountName -DisplayName "HRIS API $($ServiceName) Cloud Build Deployer"
    Write-OK "Service account ready: $buildServiceAccountEmail"

    Write-Step "Ensuring Cloud Run runtime service account exists"
    $runtimeServiceAccountEmail = Ensure-ServiceAccount -Project $ProjectId -ServiceAccountName $RuntimeServiceAccountName -DisplayName "HRIS API $($ServiceName) Runtime"
    Write-OK "Runtime service account ready: $runtimeServiceAccountEmail"

    Write-Step "Granting IAM roles to deployer service account"
    $roles = @(
        "roles/cloudbuild.builds.builder",
        "roles/run.admin",
        "roles/artifactregistry.writer",
        "roles/secretmanager.secretAccessor",
        "roles/storage.admin",
        "roles/iam.serviceAccountUser"
    )
    Grant-ProjectRoles -Project $ProjectId -Member "serviceAccount:$buildServiceAccountEmail" -Roles $roles
    Write-OK "IAM roles granted"

    Write-Step "Granting Cloud Build execution permissions"
    $buildExecutionRoles = @(
        "roles/storage.admin",
        "roles/artifactregistry.writer"
    )
    Grant-ProjectRoles -Project $ProjectId -Member "serviceAccount:$defaultBuildServiceAccountEmail" -Roles $buildExecutionRoles
    Write-OK "Cloud Build execution identity permissions granted"

    Write-Step "Granting runtime permissions to Cloud Run service account"
    $runtimeRoles = @(
        "roles/secretmanager.secretAccessor",
        "roles/storage.objectAdmin",
        "roles/logging.logWriter"
    )
    Grant-ProjectRoles -Project $ProjectId -Member "serviceAccount:$runtimeServiceAccountEmail" -Roles $runtimeRoles
    Write-OK "Runtime service account permissions granted"
} else {
    Write-Warn "Skipping service account and IAM setup because StartFrom=$StartFrom"
}

if (Should-RunStep "secrets") {
    Write-Step "Syncing environment values into Secret Manager"
    foreach ($envKey in $secretPairs.Keys) {
        Ensure-SecretVersion -Project $ProjectId -SecretName $secretPairs[$envKey] -SecretValue $envVars[$envKey]
    }
} else {
    Write-Warn "Skipping Secret Manager sync because StartFrom=$StartFrom"
}

$resolvedImage = Resolve-DeployImage -ExplicitImage $Image -ResolvedRegion $Region -ResolvedProjectId $ProjectId -ResolvedRepositoryName $RepositoryName -ResolvedServiceName $ServiceName
if (Should-RunStep "build") {
    Write-Step "Building container image with Cloud Build"
    Invoke-GCloud builds submit --tag $resolvedImage --project $ProjectId --quiet
    Ensure-Success "Cloud Build submit failed"
    Write-OK "Built image: $resolvedImage"
} else {
    Write-Warn "Skipping Cloud Build because StartFrom=$StartFrom"
    Write-OK "Using existing image: $resolvedImage"
}

if (Should-RunStep "deploy") {
    Write-Step "Ensuring runtime access before deploy"
    $runtimeServiceAccountEmail = Ensure-ServiceAccount -Project $ProjectId -ServiceAccountName $RuntimeServiceAccountName -DisplayName "HRIS API $($ServiceName) Runtime"
    Grant-ProjectRoles -Project $ProjectId -Member "serviceAccount:$runtimeServiceAccountEmail" -Roles @(
        "roles/secretmanager.secretAccessor",
        "roles/storage.objectAdmin",
        "roles/logging.logWriter"
    )
    Start-Sleep -Seconds 10
    Write-OK "Runtime service account access refreshed"

    Write-Step "Deploying to Cloud Run"
    $allowFlag = "--allow-unauthenticated"
    $updateSecretArgs = @()
    foreach ($envKey in $secretPairs.Keys) {
        $updateSecretArgs += "$envKey=$($secretPairs[$envKey]):latest"
    }
    $updateSecretString = $updateSecretArgs -join ","

    Invoke-GCloud run deploy $ServiceName `
        --project $ProjectId `
        --region $Region `
        --platform managed `
        --image $resolvedImage `
        --service-account $runtimeServiceAccountEmail `
        --port "3001" `
        --set-env-vars "NODE_ENV=production" `
        --update-secrets $updateSecretString `
        $allowFlag `
        --quiet
    Ensure-Success "Cloud Run deployment failed"
    Write-OK "Cloud Run service deployed: $ServiceName"
} else {
    Write-Warn "Skipping Cloud Run deploy because StartFrom=$StartFrom"
}

if ($CreateTrigger) {
    Write-Warn "Cloud Build trigger creation is not yet automated in this script."
    Write-Warn "Use: gcloud builds triggers create github ..."
}

Write-Host ""
Write-Host "GCP bootstrap + deploy completed." -ForegroundColor Green
Write-Host "Project: $ProjectId" -ForegroundColor Green
Write-Host "Service: $ServiceName" -ForegroundColor Green
Write-Host "Env file: $EnvFilePath" -ForegroundColor Green
