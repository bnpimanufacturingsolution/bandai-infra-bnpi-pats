<#
.SYNOPSIS
    Syncs selected values from .env.dev or .env.uat directly into GCP Secret Manager.

.DESCRIPTION
    This script is a lightweight alternative to the broader deploy/GitHub sync flow.
    It only talks to gcloud, so it is useful when you want to update Secret Manager
    without waiting on GitHub CLI or a full deploy bootstrap.
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
    [switch]$DryRun
)

$ErrorActionPreference = "Stop"
$script:GCloudCommand = $null

function Write-Step { param([string]$Message) Write-Host "`n[STEP] $Message" -ForegroundColor Cyan }
function Write-OK { param([string]$Message) Write-Host "[OK] $Message" -ForegroundColor Green }
function Write-Warn { param([string]$Message) Write-Host "[WARN] $Message" -ForegroundColor Yellow }
function Write-Err { param([string]$Message) Write-Host "[ERROR] $Message" -ForegroundColor Red }

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

function Resolve-EnvironmentDefaults {
    param(
        [string]$ResolvedEnvironment,
        [string]$ProjectRootPath
    )

    $suffix = $ResolvedEnvironment.ToLowerInvariant()
    return @{
        EnvFilePath = Join-Path $ProjectRootPath ".env.$suffix"
        SecretPrefix = "hris-api-$suffix"
    }
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

    if ($DryRun) {
        Write-Host "[DRY-RUN] gcloud secrets describe $SecretName --project $Project" -ForegroundColor DarkGray
        Write-Host "[DRY-RUN] gcloud secrets create $SecretName --project $Project --replication-policy automatic" -ForegroundColor DarkGray
        Write-Host "[DRY-RUN] gcloud secrets versions add $SecretName --project $Project --data-file <tempfile>" -ForegroundColor DarkGray
        return
    }

    Invoke-GCloud secrets describe $SecretName --project $Project *> $null
    if ($LASTEXITCODE -ne 0) {
        Invoke-GCloud secrets create $SecretName --project $Project --replication-policy automatic *> $null
        if ($LASTEXITCODE -ne 0) {
            throw "Failed to create secret $SecretName"
        }
    }

    $tmpFile = New-TemporaryFile
    try {
        Set-Content -LiteralPath $tmpFile -Value $SecretValue -NoNewline
        Invoke-GCloud secrets versions add $SecretName --project $Project --data-file $tmpFile *> $null
        if ($LASTEXITCODE -ne 0) {
            throw "Failed to add secret version for $SecretName"
        }
        Write-OK "Secret synced: $SecretName"
    } finally {
        Remove-Item -LiteralPath $tmpFile -ErrorAction SilentlyContinue
    }
}

Initialize-GCloudCommand
if (-not $script:GCloudCommand) {
    Write-Err "gcloud is not installed or not available in PATH."
    exit 1
}

$projectRoot = Split-Path -Parent $PSScriptRoot
$envDefaults = Resolve-EnvironmentDefaults -ResolvedEnvironment $Environment -ProjectRootPath $projectRoot
if ([string]::IsNullOrWhiteSpace($EnvFilePath)) {
    $EnvFilePath = $envDefaults.EnvFilePath
}

$envVars = Get-EnvMap -Path $EnvFilePath
if ($envVars.Count -eq 0) {
    Write-Err "No values found in $EnvFilePath"
    exit 1
}

$secretPairs = Get-SecretPairs -SecretPrefix $envDefaults.SecretPrefix

Write-Step "Setting active project"
Invoke-GCloud config set project $ProjectId *> $null
if ($LASTEXITCODE -ne 0) {
    Write-Err "Failed to set project $ProjectId"
    exit 1
}
Write-OK "Using project $ProjectId"

Write-Step "Syncing environment values into Secret Manager"
foreach ($envKey in $secretPairs.Keys) {
    Ensure-SecretVersion -Project $ProjectId -SecretName $secretPairs[$envKey] -SecretValue $envVars[$envKey]
}

Write-Host ""
Write-Host "Secret Manager sync completed." -ForegroundColor Green
Write-Host "Project: $ProjectId" -ForegroundColor Green
Write-Host "Environment: $Environment" -ForegroundColor Green
Write-Host "Env file: $EnvFilePath" -ForegroundColor Green
