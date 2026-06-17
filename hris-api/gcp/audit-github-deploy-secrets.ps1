<#
.SYNOPSIS
    Audits and optionally cleans up GitHub Actions secrets used by the GCP deploy workflow.

.DESCRIPTION
    GitHub does not allow reading back secret values, only secret names. This script:
    - lists current GitHub Actions secret names for a repo
    - compares them against the expected `_DEV` / `_UAT` deploy secret set
    - identifies legacy unsuffixed deploy secrets that are no longer used
    - can optionally remove those legacy unsuffixed deploy secrets

.EXAMPLE
    .\gcp\audit-github-deploy-secrets.ps1 -Repo "hrisworkforcesystem-coder/hris-api"

.EXAMPLE
    .\gcp\audit-github-deploy-secrets.ps1 -Repo "hrisworkforcesystem-coder/hris-api" -RemoveLegacy

.EXAMPLE
    .\gcp\audit-github-deploy-secrets.ps1 -Repo "hrisworkforcesystem-coder/hris-api" -Fix -RemoveLegacy
#>

param(
    [Parameter(Mandatory = $false)]
    [string]$Repo,

    [Parameter(Mandatory = $false)]
    [switch]$Fix,

    [Parameter(Mandatory = $false)]
    [switch]$RemoveLegacy
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

function Get-ProjectNumberFromEnvFile {
    param([string]$ProjectId)

    $command = Get-Command gcloud -ErrorAction SilentlyContinue
    if (-not $command) {
        return $null
    }

    $gcloudExecutable = $command.Source
    $candidateCmd = Join-Path (Split-Path $gcloudExecutable) "gcloud.cmd"
    if (Test-Path $candidateCmd) {
        $gcloudExecutable = $candidateCmd
    }

    $projectNumber = & $gcloudExecutable projects describe $ProjectId --format="value(projectNumber)" 2>$null
    if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($projectNumber)) {
        return $null
    }

    return $projectNumber.Trim()
}

function Get-EnvProjectId {
    param([string]$EnvFilePath)

    if (-not (Test-Path $EnvFilePath)) {
        return "hris-492904"
    }

    $envVars = @{}
    Get-Content $EnvFilePath | ForEach-Object {
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
        $envVars[$key] = $value
    }

    if ($envVars.ContainsKey("GCS_PROJECT_ID") -and -not [string]::IsNullOrWhiteSpace($envVars["GCS_PROJECT_ID"])) {
        return $envVars["GCS_PROJECT_ID"]
    }

    if ($envVars.ContainsKey("GCP_PROJECT_ID") -and -not [string]::IsNullOrWhiteSpace($envVars["GCP_PROJECT_ID"])) {
        return $envVars["GCP_PROJECT_ID"]
    }

    return "hris-492904"
}

function Get-ExpectedSecretNames {
    $baseNames = @(
        "GCP_PROJECT_ID",
        "GCP_REGION",
        "CLOUD_RUN_SERVICE",
        "ARTIFACT_REPOSITORY",
        "ALLOW_UNAUTHENTICATED",
        "GCP_WORKLOAD_IDENTITY_PROVIDER",
        "GCP_SERVICE_ACCOUNT_EMAIL",
        "GCP_RUNTIME_SERVICE_ACCOUNT_EMAIL",
        "SECRET_DATABASE_URL",
        "SECRET_JWT_SECRET",
        "SECRET_CORS_ORIGINS",
        "SECRET_CORS_CREDENTIALS",
        "SECRET_GCS_BUCKET_NAME",
        "SECRET_GCS_PROJECT_ID",
        "SECRET_GCS_PUBLIC_BASE_URL",
        "SECRET_BETTER_STACK_SOURCE_TOKEN",
        "SECRET_BETTER_STACK_HOST"
    )

    $expected = New-Object System.Collections.Generic.List[string]
    foreach ($suffix in @("DEV", "UAT")) {
        foreach ($baseName in $baseNames) {
            $expected.Add("${baseName}_$suffix")
        }
    }

    return $expected
}

function Get-LegacySecretNames {
    return @(
        "GCP_PROJECT_ID",
        "GCP_REGION",
        "CLOUD_RUN_SERVICE",
        "ARTIFACT_REPOSITORY",
        "ALLOW_UNAUTHENTICATED",
        "GCP_WORKLOAD_IDENTITY_PROVIDER",
        "GCP_SERVICE_ACCOUNT_EMAIL",
        "GCP_RUNTIME_SERVICE_ACCOUNT_EMAIL",
        "GCP_SA_KEY",
        "SECRET_DATABASE_URL",
        "SECRET_JWT_SECRET",
        "SECRET_CORS_ORIGINS",
        "SECRET_CORS_CREDENTIALS",
        "SECRET_GCS_BUCKET_NAME",
        "SECRET_GCS_PROJECT_ID",
        "SECRET_GCS_PUBLIC_BASE_URL",
        "SECRET_BETTER_STACK_SOURCE_TOKEN",
        "SECRET_BETTER_STACK_HOST"
    )
}

$projectRoot = Split-Path -Parent $PSScriptRoot
$syncScript = Join-Path $PSScriptRoot "sync-github-deploy-secrets.ps1"

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

if ($Fix) {
    if (-not (Test-Path $syncScript)) {
        Write-Err "Required sync script not found: $syncScript"
        exit 1
    }

    Write-Step "Fix mode: syncing DEV and UAT env-specific deploy secrets"
    foreach ($environmentName in @("dev", "uat")) {
        $envFilePath = Join-Path $projectRoot ".env.$environmentName"
        $projectId = Get-EnvProjectId -EnvFilePath $envFilePath
        $projectNumber = Get-ProjectNumberFromEnvFile -ProjectId $projectId
        $workloadIdentityProvider = $null
        if (-not [string]::IsNullOrWhiteSpace($projectNumber)) {
            $workloadIdentityProvider = "projects/$projectNumber/locations/global/workloadIdentityPools/github-actions-pool/providers/github-provider"
        }

        $syncArgs = @(
            "-File", $syncScript,
            "-Environment", $environmentName,
            "-Repo", $Repo,
            "-EnvFilePath", $envFilePath,
            "-ProjectId", $projectId
        )

        if (-not [string]::IsNullOrWhiteSpace($workloadIdentityProvider)) {
            $syncArgs += @("-WorkloadIdentityProvider", $workloadIdentityProvider)
        }

        & powershell.exe @syncArgs
        if ($LASTEXITCODE -ne 0) {
            Write-Err "Failed to sync $environmentName secrets in fix mode."
            exit 1
        }
        Write-OK "Fix mode synced $environmentName secrets"
    }
}

Write-Step "Listing GitHub Actions secrets"
$secretJson = & gh secret list --repo $Repo --json name 2>$null
if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($secretJson)) {
    Write-Err "Failed to list GitHub secrets for $Repo"
    exit 1
}

$secretItems = $secretJson | ConvertFrom-Json
$existingSecretNames = @($secretItems | ForEach-Object { $_.name } | Sort-Object -Unique)
Write-OK "Found $($existingSecretNames.Count) GitHub Actions secrets"

$expectedSecretNames = Get-ExpectedSecretNames
$legacySecretNames = Get-LegacySecretNames

$missingExpected = @($expectedSecretNames | Where-Object { $_ -notin $existingSecretNames })
$presentLegacy = @($legacySecretNames | Where-Object { $_ -in $existingSecretNames })
$unexpectedSecrets = @($existingSecretNames | Where-Object { ($_ -notin $expectedSecretNames) -and ($_ -notin $legacySecretNames) })

Write-Host ""
Write-Host "Expected env-specific deploy secrets present: $($expectedSecretNames.Count - $missingExpected.Count)/$($expectedSecretNames.Count)" -ForegroundColor Green

if ($missingExpected.Count -gt 0) {
    Write-Warn "Missing expected env-specific secrets:"
    $missingExpected | ForEach-Object { Write-Host "  - $_" -ForegroundColor Yellow }
} else {
    Write-OK "All expected env-specific deploy secrets are present."
}

if ($presentLegacy.Count -gt 0) {
    Write-Warn "Legacy unsuffixed deploy secrets still present:"
    $presentLegacy | ForEach-Object { Write-Host "  - $_" -ForegroundColor Yellow }
} else {
    Write-OK "No legacy unsuffixed deploy secrets found."
}

if ($unexpectedSecrets.Count -gt 0) {
    Write-Host ""
    Write-Host "Other repo secrets not managed by this deploy setup:" -ForegroundColor Cyan
    $unexpectedSecrets | ForEach-Object { Write-Host "  - $_" }
}

if ($RemoveLegacy) {
    if ($presentLegacy.Count -eq 0) {
        Write-OK "No legacy deploy secrets to remove."
        exit 0
    }

    if ($missingExpected.Count -gt 0) {
        Write-Err "Refusing to remove legacy deploy secrets while expected env-specific secrets are still missing."
        exit 1
    }

    Write-Step "Removing legacy unsuffixed deploy secrets"
    foreach ($secretName in $presentLegacy) {
        & gh secret delete $secretName --repo $Repo
        if ($LASTEXITCODE -ne 0) {
            Write-Err "Failed to remove GitHub secret $secretName"
            exit 1
        }
        Write-OK "Removed $secretName"
    }

    Write-Host ""
    Write-Host "Legacy deploy secret cleanup completed." -ForegroundColor Green
} else {
    Write-Host ""
    if ($Fix) {
        Write-Host "Fix mode completed. If all expected env-specific secrets are present, you can now rerun with -RemoveLegacy." -ForegroundColor Green
    } else {
        Write-Host "Audit complete. Use -Fix to sync env-specific secrets, or use -RemoveLegacy after the env-specific secrets are complete." -ForegroundColor Green
    }
}
