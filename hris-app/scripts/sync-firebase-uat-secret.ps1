param(
    [string]$Repo = "hrisworkforcesystem-coder/hris-app",
    [string]$KeyPath = "firebase/hris-workforce-uat-20260416-firebase-adminsdk-fbsvc-ee4f65cccc.json",
    [string]$ExpectedProjectId = "hris-workforce-uat-20260416",
    [switch]$TriggerWorkflow,
    [string]$WorkflowFile = "firebase-hosting-develop.yml",
    [string]$WorkflowRef = "uat"
)

$ErrorActionPreference = "Stop"

function Ensure-Command {
    param([Parameter(Mandatory = $true)][string]$Name)
    if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
        throw "Missing required command: $Name"
    }
}

function Ensure-GhAuth {
    gh auth status | Out-Null
    if ($LASTEXITCODE -ne 0) {
        throw "GitHub CLI is not authenticated. Run: gh auth login"
    }
}

function Resolve-KeyPath {
    param([Parameter(Mandatory = $true)][string]$Path)

    $resolved = Resolve-Path -Path $Path -ErrorAction SilentlyContinue
    if (-not $resolved) {
        throw "Key file not found: $Path"
    }
    return $resolved.Path
}

function Read-JsonSafe {
    param([Parameter(Mandatory = $true)][string]$Path)

    $raw = Get-Content -LiteralPath $Path -Raw
    if ([string]::IsNullOrWhiteSpace($raw)) {
        throw "Key file is empty: $Path"
    }

    $obj = $raw | ConvertFrom-Json
    if ([string]::IsNullOrWhiteSpace([string]$obj.project_id)) {
        throw "Missing project_id in key file: $Path"
    }
    if ([string]::IsNullOrWhiteSpace([string]$obj.client_email)) {
        throw "Missing client_email in key file: $Path"
    }

    return $obj
}

function Set-SecretFromFile {
    param(
        [Parameter(Mandatory = $true)][string]$SecretName,
        [Parameter(Mandatory = $true)][string]$RepoName,
        [Parameter(Mandatory = $true)][string]$FilePath
    )

    Write-Host "Setting secret $SecretName" -ForegroundColor Green
    $secretValue = Get-Content -LiteralPath $FilePath -Raw
    if ([string]::IsNullOrWhiteSpace($secretValue)) {
        throw "Secret file is empty: $FilePath"
    }
    $secretValue | gh secret set $SecretName --repo $RepoName | Out-Null
    if ($LASTEXITCODE -ne 0) {
        throw "Failed to set secret: $SecretName"
    }
}

Ensure-Command -Name "gh"
Ensure-GhAuth

$resolvedKeyPath = Resolve-KeyPath -Path $KeyPath
$key = Read-JsonSafe -Path $resolvedKeyPath

if ($key.project_id -ne $ExpectedProjectId) {
    throw "Key project_id '$($key.project_id)' does not match expected '$ExpectedProjectId'."
}

Write-Host "Using key file: $resolvedKeyPath"
Write-Host "project_id: $($key.project_id)"
Write-Host "client_email: $($key.client_email)"

$uatSecrets = @(
    "FIREBASE_SERVICE_ACCOUNT_UAT"
)

foreach ($secret in $uatSecrets) {
    Set-SecretFromFile -SecretName $secret -RepoName $Repo -FilePath $resolvedKeyPath
}

Write-Host "UAT Firebase service-account secret synced (standard name)." -ForegroundColor Cyan

if ($TriggerWorkflow) {
    Write-Host "Dispatching workflow $WorkflowFile on ref $WorkflowRef" -ForegroundColor Cyan
    gh workflow run $WorkflowFile --repo $Repo --ref $WorkflowRef
    if ($LASTEXITCODE -ne 0) {
        throw "Failed to dispatch workflow: $WorkflowFile"
    }
    Write-Host "Workflow dispatched successfully." -ForegroundColor Green
}
