<#
.SYNOPSIS
    Configures GitHub Actions Workload Identity Federation for HRIS API.
#>

param(
    [Parameter(Mandatory = $true)]
    [ValidateSet("dev", "uat")]
    [string]$Environment,

    [Parameter(Mandatory = $false)]
    [string]$ProjectId = "hris-492904",

    [Parameter(Mandatory = $false)]
    [string]$PoolId = "github-actions-pool",

    [Parameter(Mandatory = $false)]
    [string]$ProviderId = "github-provider",

    [Parameter(Mandatory = $false)]
    [string]$ServiceAccountName,

    [Parameter(Mandatory = $false)]
    [string]$RuntimeServiceAccountName,

    [Parameter(Mandatory = $false)]
    [switch]$ForceRecreateProvider,

    [Parameter(Mandatory = $true)]
    [string]$Repo
)

$ErrorActionPreference = "Stop"
$script:GCloudCommand = $null

function Write-Step { param([string]$Message) Write-Host "`n[STEP] $Message" -ForegroundColor Cyan }
function Write-OK { param([string]$Message) Write-Host "[OK] $Message" -ForegroundColor Green }
function Write-Err { param([string]$Message) Write-Host "[ERROR] $Message" -ForegroundColor Red }
function Ensure-Success { param([string]$Message) if ($LASTEXITCODE -ne 0) { Write-Err $Message; exit 1 } }

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
    try { & $script:GCloudCommand @Arguments } finally { $ErrorActionPreference = $prevPref }
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
        Write-Host $stderr.Trim() -ForegroundColor Yellow
    }
    return $stdout.Trim()
}

function Resolve-EnvironmentDefaults {
    param(
        [string]$ResolvedEnvironment,
        [string]$ResolvedServiceAccountName,
        [string]$ResolvedRuntimeServiceAccountName
    )

    $config = @{
        ServiceAccountName = $ResolvedServiceAccountName
        RuntimeServiceAccountName = $ResolvedRuntimeServiceAccountName
    }

    $suffix = $ResolvedEnvironment.ToLowerInvariant()
    if ([string]::IsNullOrWhiteSpace($config.ServiceAccountName)) {
        $config.ServiceAccountName = "hris-$suffix-gh-deploy"
    }
    if ([string]::IsNullOrWhiteSpace($config.RuntimeServiceAccountName)) {
        $config.RuntimeServiceAccountName = "hris-$suffix-runtime"
    }
    return $config
}

Initialize-GCloudCommand
if (-not $script:GCloudCommand) {
    Write-Err "gcloud is not installed or not available in PATH."
    exit 1
}

$envConfig = Resolve-EnvironmentDefaults -ResolvedEnvironment $Environment -ResolvedServiceAccountName $ServiceAccountName -ResolvedRuntimeServiceAccountName $RuntimeServiceAccountName
$ServiceAccountName = $envConfig.ServiceAccountName
$RuntimeServiceAccountName = $envConfig.RuntimeServiceAccountName

$serviceAccountEmail = "$ServiceAccountName@$ProjectId.iam.gserviceaccount.com"
$runtimeServiceAccountEmail = "$RuntimeServiceAccountName@$ProjectId.iam.gserviceaccount.com"
Write-Step "Setting project"
Invoke-GCloud config set project $ProjectId *> $null
Ensure-Success "Failed to set project"

$projectNumber = Get-GCloudValue projects describe $ProjectId --format="value(projectNumber)"
Ensure-Success "Failed to get project number"
$defaultBuildServiceAccountEmail = "$projectNumber-compute@developer.gserviceaccount.com"

Write-Step "Enabling IAM Credentials API"
Invoke-GCloud services enable iamcredentials.googleapis.com iam.googleapis.com cloudresourcemanager.googleapis.com --project $ProjectId --quiet *> $null
Ensure-Success "Failed to enable required APIs"

Write-Step "Ensuring service account exists"
Invoke-GCloud iam service-accounts describe $serviceAccountEmail --project $ProjectId *> $null
if ($LASTEXITCODE -ne 0) {
    Invoke-GCloud iam service-accounts create $ServiceAccountName --display-name "HRIS API GitHub Deployer $ServiceAccountName" --project $ProjectId *> $null
    Ensure-Success "Failed to create service account"
}
Write-OK "Service account ready: $serviceAccountEmail"

Write-Step "Ensuring runtime service account exists"
Invoke-GCloud iam service-accounts describe $runtimeServiceAccountEmail --project $ProjectId *> $null
if ($LASTEXITCODE -ne 0) {
    Invoke-GCloud iam service-accounts create $RuntimeServiceAccountName --display-name "HRIS API Runtime $RuntimeServiceAccountName" --project $ProjectId *> $null
    Ensure-Success "Failed to create runtime service account"
}
Write-OK "Runtime service account ready: $runtimeServiceAccountEmail"

Write-Step "Granting deploy roles to service account"
$roles = @(
    "roles/cloudbuild.builds.builder",
    "roles/run.admin",
    "roles/artifactregistry.writer",
    "roles/secretmanager.secretAccessor",
    "roles/storage.admin",
    "roles/iam.serviceAccountUser"
)
foreach ($role in $roles) {
    Invoke-GCloud projects add-iam-policy-binding $ProjectId --member "serviceAccount:$serviceAccountEmail" --role $role --quiet *> $null
    Ensure-Success "Failed to grant $role"
}

Write-Step "Granting Cloud Build execution permissions"
$buildExecutionRoles = @(
    "roles/storage.admin",
    "roles/artifactregistry.writer"
)
foreach ($role in $buildExecutionRoles) {
    Invoke-GCloud projects add-iam-policy-binding $ProjectId --member "serviceAccount:$defaultBuildServiceAccountEmail" --role $role --quiet *> $null
    Ensure-Success "Failed to grant $role to $defaultBuildServiceAccountEmail"
}
Write-OK "Cloud Build execution identity permissions granted: $defaultBuildServiceAccountEmail"

Write-Step "Granting runtime permissions"
$runtimeRoles = @(
    "roles/secretmanager.secretAccessor",
    "roles/storage.objectAdmin",
    "roles/logging.logWriter"
)
foreach ($role in $runtimeRoles) {
    Invoke-GCloud projects add-iam-policy-binding $ProjectId --member "serviceAccount:$runtimeServiceAccountEmail" --role $role --quiet *> $null
    Ensure-Success "Failed to grant $role to $runtimeServiceAccountEmail"
}
Write-OK "Runtime service account permissions granted: $runtimeServiceAccountEmail"

Write-Step "Ensuring workload identity pool exists"
Invoke-GCloud iam workload-identity-pools describe $PoolId --location global --project $ProjectId *> $null
if ($LASTEXITCODE -ne 0) {
    Invoke-GCloud iam workload-identity-pools create $PoolId --location global --display-name "GitHub Actions Pool" --project $ProjectId *> $null
    Ensure-Success "Failed to create workload identity pool"
}

$issuerUri = "https://token.actions.githubusercontent.com"
Write-Step "Ensuring workload identity provider is configured for $Repo"
$providerExists = $false
$attributeMapping = "google.subject=assertion.sub,attribute.actor=assertion.actor,attribute.repository=assertion.repository,attribute.repository_owner=assertion.repository_owner,attribute.ref=assertion.ref"
$attributeCondition = "assertion.repository=='$Repo'"
Invoke-GCloud iam workload-identity-pools providers describe $ProviderId --workload-identity-pool $PoolId --location global --project $ProjectId *> $null
if ($LASTEXITCODE -eq 0) {
    $providerExists = $true
}

if (-not $providerExists) {
    Invoke-GCloud iam workload-identity-pools providers create-oidc $ProviderId `
        --location global `
        --workload-identity-pool $PoolId `
        --display-name "GitHub Provider" `
        --issuer-uri $issuerUri `
        --attribute-mapping $attributeMapping `
        --attribute-condition $attributeCondition `
        --project $ProjectId *> $null
    Ensure-Success "Failed to create workload identity provider"
    Write-OK "Workload identity provider created for $Repo"
} else {
    if ($ForceRecreateProvider) {
        Write-Host "[WARN] Updating existing workload identity provider to refresh repo condition" -ForegroundColor Yellow
    } else {
        Write-Host "[WARN] Existing provider found. Refreshing attribute condition and mapping in place." -ForegroundColor Yellow
    }

    Invoke-GCloud iam workload-identity-pools providers update-oidc $ProviderId `
        --location global `
        --workload-identity-pool $PoolId `
        --issuer-uri $issuerUri `
        --attribute-mapping $attributeMapping `
        --attribute-condition $attributeCondition `
        --project $ProjectId *> $null
    Ensure-Success "Failed to update existing workload identity provider"
    Write-OK "Workload identity provider updated for $Repo"
}

$poolResource = "projects/$projectNumber/locations/global/workloadIdentityPools/$PoolId"
Write-Step "Granting workload identity user binding"
Invoke-GCloud iam service-accounts add-iam-policy-binding $serviceAccountEmail `
    --project $ProjectId `
    --role roles/iam.workloadIdentityUser `
    --member "principalSet://iam.googleapis.com/$poolResource/attribute.repository/$Repo" *> $null
Ensure-Success "Failed to bind workload identity user role"

Write-Host ""
Write-Host "Workload Identity setup complete." -ForegroundColor Green
Write-Host "Provider:" -ForegroundColor Green
Write-Host "projects/$projectNumber/locations/global/workloadIdentityPools/$PoolId/providers/$ProviderId" -ForegroundColor Green
Write-Host "Service account:" -ForegroundColor Green
Write-Host $serviceAccountEmail -ForegroundColor Green
