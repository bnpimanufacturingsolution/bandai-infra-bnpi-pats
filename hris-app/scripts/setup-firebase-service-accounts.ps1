param(
    [string]$Repo = "hrisworkforcesystem-coder/hris-app",
    [string]$DevProjectId = "hris-workforce-dev-20260416",
    [string]$UatProjectId = "hris-workforce-uat-20260416",
    [string]$DevServiceAccountName = "gha-firebase-deploy-dev",
    [string]$UatServiceAccountName = "gha-firebase-deploy-uat",
    [string]$DevKeyFile = "",
    [string]$UatKeyFile = "",
    [string]$GcloudAccount = "",
    [switch]$NoAccountPrompt,
    [switch]$SkipTokenSecretCleanup
)

$ErrorActionPreference = "Stop"
$script:HadFailures = $false
if (Get-Variable -Name PSNativeCommandUseErrorActionPreference -ErrorAction SilentlyContinue) {
    $PSNativeCommandUseErrorActionPreference = $false
}

function Require-Command {
    param([Parameter(Mandatory = $true)][string]$Name)
    if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
        throw "Missing required command: $Name"
    }
}

function Ensure-GcloudAuth {
    $accountsJson = gcloud auth list --format=json
    if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($accountsJson)) {
        throw "Failed to query gcloud accounts. Run: gcloud auth login"
    }

    $accounts = $accountsJson | ConvertFrom-Json
    if ($null -eq $accounts -or $accounts.Count -eq 0) {
        throw "No gcloud accounts found. Run: gcloud auth login"
    }

    if (-not [string]::IsNullOrWhiteSpace($GcloudAccount)) {
        Write-Host "Using provided gcloud account: $GcloudAccount"
        gcloud config set account $GcloudAccount | Out-Null
        if ($LASTEXITCODE -ne 0) {
            throw "Failed to set gcloud account to $GcloudAccount."
        }
    } elseif (-not $NoAccountPrompt -and $accounts.Count -gt 1) {
        Write-Host ""
        Write-Host "Select gcloud account for Firebase setup:"
        for ($i = 0; $i -lt $accounts.Count; $i++) {
            $isActive = if ($accounts[$i].status -eq "ACTIVE") { " (active)" } else { "" }
            Write-Host "[$($i + 1)] $($accounts[$i].account)$isActive"
        }
        $choice = Read-Host "Enter number"
        if (-not ($choice -as [int]) -or [int]$choice -lt 1 -or [int]$choice -gt $accounts.Count) {
            throw "Invalid selection. Re-run script and choose a valid number."
        }
        $selectedAccount = $accounts[[int]$choice - 1].account
        gcloud config set account $selectedAccount | Out-Null
        if ($LASTEXITCODE -ne 0) {
            throw "Failed to set gcloud account to $selectedAccount."
        }
    }

    $activeAccount = gcloud auth list --filter=status:ACTIVE --format="value(account)"
    if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($activeAccount)) {
        throw "No active gcloud account after selection."
    }
    Write-Host "Active gcloud account: $($activeAccount.Trim())"
    return $activeAccount.Trim()
}

function Ensure-GhAuth {
    gh auth status | Out-Null
    if ($LASTEXITCODE -ne 0) {
        throw "GitHub CLI is not authenticated. Run: gh auth login"
    }
}

function Try-DeleteSecret {
    param(
        [Parameter(Mandatory = $true)][string]$SecretName,
        [Parameter(Mandatory = $true)][string]$RepoName
    )

    $previousErrorActionPreference = $ErrorActionPreference
    try {
        $ErrorActionPreference = "Continue"
        & gh secret delete $SecretName --repo $RepoName 2>$null | Out-Null
        if ($LASTEXITCODE -eq 0) {
            Write-Host "Deleted $SecretName"
        } else {
            Write-Host "$SecretName not found or could not be deleted (ok)."
        }
    } finally {
        $ErrorActionPreference = $previousErrorActionPreference
    }
}

function Set-GitHubSecretFromKeyFile {
    param(
        [Parameter(Mandatory = $true)][string]$SecretName,
        [Parameter(Mandatory = $true)][string]$RepoName,
        [Parameter(Mandatory = $true)][string]$KeyFilePath,
        [Parameter(Mandatory = $true)][string]$ExpectedProjectId
    )

    if (-not (Test-Path -LiteralPath $KeyFilePath)) {
        throw "Key file not found: $KeyFilePath"
    }

    $json = Get-Content -LiteralPath $KeyFilePath -Raw
    if ([string]::IsNullOrWhiteSpace($json)) {
        throw "Key file is empty: $KeyFilePath"
    }

    $keyObj = $json | ConvertFrom-Json
    if ($null -eq $keyObj.project_id -or [string]::IsNullOrWhiteSpace($keyObj.project_id)) {
        throw "Invalid key file (missing project_id): $KeyFilePath"
    }
    if ($keyObj.project_id -ne $ExpectedProjectId) {
        throw "Key file project_id '$($keyObj.project_id)' does not match expected '$ExpectedProjectId'."
    }

    Write-Host "Setting GitHub secret from key file: $SecretName"
    $json | & gh secret set $SecretName --repo $RepoName
    if ($LASTEXITCODE -ne 0) {
        throw "Failed to set GitHub secret $SecretName."
    }
}

function Ensure-ServiceAccount {
    param(
        [Parameter(Mandatory = $true)][string]$ProjectId,
        [Parameter(Mandatory = $true)][string]$ServiceAccountName
    )

    $serviceAccountEmail = "$ServiceAccountName@$ProjectId.iam.gserviceaccount.com"
    gcloud iam service-accounts describe $serviceAccountEmail --project $ProjectId *> $null
    $exists = ($LASTEXITCODE -eq 0)

    if (-not $exists) {
        Write-Host "Creating service account: $serviceAccountEmail"
        gcloud iam service-accounts create $ServiceAccountName --project $ProjectId | Out-Null
    } else {
        Write-Host "Service account already exists: $serviceAccountEmail"
    }

    $serviceAccountEmail
}

function Ensure-HostingRole {
    param(
        [Parameter(Mandatory = $true)][string]$ProjectId,
        [Parameter(Mandatory = $true)][string]$ServiceAccountEmail
    )

    Write-Host "Granting roles/firebasehosting.admin to $ServiceAccountEmail on $ProjectId"
    gcloud projects add-iam-policy-binding $ProjectId `
        --member "serviceAccount:$ServiceAccountEmail" `
        --role "roles/firebasehosting.admin" `
        --quiet | Out-Null
    if ($LASTEXITCODE -ne 0) {
        throw "Failed to grant roles/firebasehosting.admin on project $ProjectId."
    }
}

function Set-GitHubSecretFromServiceAccount {
    param(
        [Parameter(Mandatory = $true)][string]$ProjectId,
        [Parameter(Mandatory = $true)][string]$ServiceAccountEmail,
        [Parameter(Mandatory = $true)][string]$SecretName,
        [Parameter(Mandatory = $true)][string]$RepoName
    )

    $tempFile = Join-Path $env:TEMP ("$SecretName-" + [guid]::NewGuid().ToString("N") + ".json")

    try {
        Write-Host "Creating key for $ServiceAccountEmail"
        gcloud iam service-accounts keys create $tempFile `
            --iam-account $ServiceAccountEmail `
            --project $ProjectId | Out-Null
        if ($LASTEXITCODE -ne 0) {
            throw "Failed to create key for $ServiceAccountEmail."
        }

        Write-Host "Setting GitHub secret: $SecretName"
        $secretValue = Get-Content -LiteralPath $tempFile -Raw
        if ([string]::IsNullOrWhiteSpace($secretValue)) {
            throw "Generated key file is empty. Cannot set $SecretName."
        }
        $secretValue | & gh secret set $SecretName --repo $RepoName
        if ($LASTEXITCODE -ne 0) {
            throw "Failed to set GitHub secret $SecretName."
        }
    } finally {
        if (Test-Path -LiteralPath $tempFile) {
            Remove-Item -LiteralPath $tempFile -Force
        }
    }
}

function Setup-Environment {
    param(
        [Parameter(Mandatory = $true)][string]$ProjectId,
        [Parameter(Mandatory = $true)][string]$ServiceAccountName,
        [Parameter(Mandatory = $true)][string]$SecretName,
        [Parameter(Mandatory = $true)][string]$RepoName,
        [string]$KeyFilePath = ""
    )

    Write-Host ""
    Write-Host "===== Setting up $ProjectId ($SecretName) ====="
    try {
        if (-not [string]::IsNullOrWhiteSpace($KeyFilePath)) {
            Set-GitHubSecretFromKeyFile `
                -SecretName $SecretName `
                -RepoName $RepoName `
                -KeyFilePath $KeyFilePath `
                -ExpectedProjectId $ProjectId
            Write-Host "SUCCESS: $ProjectId ($SecretName) [local key file mode]"
            return
        }

        gcloud projects describe $ProjectId --format="value(projectId)" *> $null
        if ($LASTEXITCODE -ne 0) {
            throw "Active account cannot access project $ProjectId."
        }
        $serviceAccountEmail = Ensure-ServiceAccount -ProjectId $ProjectId -ServiceAccountName $ServiceAccountName
        Ensure-HostingRole -ProjectId $ProjectId -ServiceAccountEmail $serviceAccountEmail
        Set-GitHubSecretFromServiceAccount -ProjectId $ProjectId -ServiceAccountEmail $serviceAccountEmail -SecretName $SecretName -RepoName $RepoName
        Write-Host "SUCCESS: $ProjectId ($SecretName)"
    } catch {
        $script:HadFailures = $true
        Write-Host "FAILED: $ProjectId ($SecretName)" -ForegroundColor Red
        Write-Host $_.Exception.Message -ForegroundColor Red
    }
}

Require-Command -Name "gh"
Ensure-GhAuth
$usingLocalKeys = (-not [string]::IsNullOrWhiteSpace($DevKeyFile)) -or (-not [string]::IsNullOrWhiteSpace($UatKeyFile))
$activeAccount = ""
if (-not $usingLocalKeys) {
    Require-Command -Name "gcloud"
    $activeAccount = Ensure-GcloudAuth
} else {
    Write-Host "Local key file mode enabled. Skipping gcloud account/project IAM setup."
}

Setup-Environment `
    -ProjectId $DevProjectId `
    -ServiceAccountName $DevServiceAccountName `
    -SecretName "FIREBASE_SERVICE_ACCOUNT_DEV" `
    -RepoName $Repo `
    -KeyFilePath $DevKeyFile

Setup-Environment `
    -ProjectId $UatProjectId `
    -ServiceAccountName $UatServiceAccountName `
    -SecretName "FIREBASE_SERVICE_ACCOUNT_UAT" `
    -RepoName $Repo `
    -KeyFilePath $UatKeyFile

if (-not $SkipTokenSecretCleanup) {
    Write-Host ""
    Write-Host "Removing deprecated token secrets if they exist..."
    Try-DeleteSecret -SecretName "FIREBASE_TOKEN_DEV" -RepoName $Repo
    Try-DeleteSecret -SecretName "FIREBASE_TOKEN_UAT" -RepoName $Repo
}

Write-Host ""
if ($script:HadFailures) {
    Write-Host "Completed with failures." -ForegroundColor Yellow
    Write-Host "Fix account/permissions and re-run the script."
    exit 1
}

Write-Host "All done successfully."
if (-not [string]::IsNullOrWhiteSpace($activeAccount)) {
    Write-Host "Active gcloud account used: $activeAccount"
}
Write-Host "Re-run your GitHub Actions workflow."
