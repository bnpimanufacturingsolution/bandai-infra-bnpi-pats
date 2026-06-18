<#
.SYNOPSIS
    Helps configure local Google Cloud Storage access for HRIS API.

.DESCRIPTION
    This script:
    1. Locates gcloud
    2. Verifies or starts Google Cloud login
    3. Verifies or starts Application Default Credentials login
    4. Sets the active project
    5. Optionally checks access to a GCS bucket
    6. Prints the .env values needed by HRIS API

.EXAMPLE
    .\gcp\setup-gcs-local.ps1 -ProjectId "hris-492904" -BucketName "hris-492904-uploads"
#>

param(
    [Parameter(Mandatory = $false)]
    [string]$ProjectId = "hris-492904",

    [Parameter(Mandatory = $false)]
    [string]$BucketName = "hris-492904-uploads",

    [Parameter(Mandatory = $false)]
    [switch]$SkipBucketCheck
)

$ErrorActionPreference = "Stop"
$script:GCloudCommand = $null

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

function Ensure-Success {
    param([string]$Message)
    if ($LASTEXITCODE -ne 0) {
        Write-Err $Message
        exit 1
    }
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
        return
    }

    $candidates = @(
        "$env:LOCALAPPDATA\Google\Cloud SDK\google-cloud-sdk\bin\gcloud.cmd",
        "$env:ProgramFiles\Google\Cloud SDK\google-cloud-sdk\bin\gcloud.cmd",
        "${env:ProgramFiles(x86)}\Google\Cloud SDK\google-cloud-sdk\bin\gcloud.cmd"
    )

    foreach ($candidate in $candidates) {
        if (Test-Path $candidate) {
            $script:GCloudCommand = $candidate
            return
        }
    }
}

function Invoke-GCloud {
    param(
        [Parameter(ValueFromRemainingArguments = $true)]
        [string[]]$Arguments
    )

    $prevPref = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    try {
        & $script:GCloudCommand @Arguments
    } finally {
        $ErrorActionPreference = $prevPref
    }
}

function Get-GCloudValue {
    param(
        [Parameter(ValueFromRemainingArguments = $true)]
        [string[]]$Arguments
    )

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

Write-Step "Locating Google Cloud CLI"
Initialize-GCloudCommand
if (-not $script:GCloudCommand) {
    Write-Err "gcloud was not found. Install Google Cloud CLI first, then run this script again."
    exit 1
}
Write-OK "Using gcloud at $script:GCloudCommand"

Write-Step "Checking active gcloud account"
$activeAccount = Get-GCloudValue config get-value account
if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($activeAccount) -or $activeAccount -eq "(unset)") {
    Write-Warn "No active gcloud account found. Starting browser login."
    Invoke-GCloud auth login
    Ensure-Success "gcloud auth login failed"
    $activeAccount = Get-GCloudValue config get-value account
}
Write-OK "Authenticated with gcloud as $activeAccount"

Write-Step "Setting active project"
Invoke-GCloud config set project $ProjectId *> $null
Ensure-Success "Failed to set gcloud project"
Write-OK "Project set to $ProjectId"

Write-Step "Checking Application Default Credentials"
$adcJsonPath = Join-Path $env:APPDATA "gcloud\application_default_credentials.json"
if (-not (Test-Path $adcJsonPath)) {
    Write-Warn "Application Default Credentials not found. Starting ADC login."
    Invoke-GCloud auth application-default login
    Ensure-Success "gcloud auth application-default login failed"
} else {
    Write-OK "ADC file found at $adcJsonPath"
}

Write-Step "Setting ADC quota project"
Invoke-GCloud auth application-default set-quota-project $ProjectId *> $null
if ($LASTEXITCODE -eq 0) {
    Write-OK "ADC quota project set to $ProjectId"
} else {
    Write-Warn "Could not set ADC quota project automatically. You can retry manually if needed."
}

if (-not $SkipBucketCheck) {
    Write-Step "Checking bucket access"
    Invoke-GCloud storage ls "gs://$BucketName" *> $null
    if ($LASTEXITCODE -eq 0) {
        Write-OK "Bucket access verified for gs://$BucketName"
    } else {
        Write-Warn "Could not list gs://$BucketName"
        Write-Warn "Your account may need Storage Object Admin or similar access on the bucket."
    }
}

$publicBaseUrl = "https://storage.googleapis.com/$BucketName"

Write-Host ""
Write-Host "Add these values to hris-api/.env:" -ForegroundColor Yellow
Write-Host "GCS_BUCKET_NAME=$BucketName"
Write-Host "GCS_PROJECT_ID=$ProjectId"
Write-Host "GCS_PUBLIC_BASE_URL=$publicBaseUrl"
Write-Host ""
Write-Host "Optional for local dev:" -ForegroundColor Yellow
Write-Host "# GOOGLE_APPLICATION_CREDENTIALS is NOT needed when using ADC"
Write-Host "# Only set it if you later switch to a service-account JSON file"
Write-Host ""
Write-Host "Manual commands this script covers:" -ForegroundColor Yellow
Write-Host "  gcloud auth login"
Write-Host "  gcloud config set project $ProjectId"
Write-Host "  gcloud auth application-default login"
Write-Host "  gcloud auth application-default set-quota-project $ProjectId"
Write-Host "  gcloud storage ls gs://$BucketName"
