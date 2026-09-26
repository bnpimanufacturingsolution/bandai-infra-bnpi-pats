<#
.SYNOPSIS
    Pulls the Project Truth V7 release from the private GCS bucket on a Windows
    Hyper-V host, verifies it, and optionally imports/starts the VM.

.DESCRIPTION
    This is the server-side script for the GCS -> VM flow. It does not use
    signed URLs and does not require the bucket to be public: the host runs
    `gcloud storage cp` with its own authenticated Google account.

    It downloads:
      gs://<Bucket>/<ObjectPath>/project-truth-node-local-hyperv-v7-current-state.vhdx
      gs://<Bucket>/<ObjectPath>/project-truth-node-local-hyperv-v7-current-state.vhdx.sha256

    The SHA-256 sidecar is treated as the trust anchor. The download is only
    accepted when the computed hash matches the sidecar. A mismatch deletes the
    partial file and throws.

.PARAMETER ImagesDir
    Destination directory for the VHDX.
    Default: C:\ProgramData\BandaiApp\Bnpipats\images

.PARAMETER RepoRoot
    Path to a bandai-infra-bnpi-pats checkout. Required with -StartVm.

.PARAMETER StartVm
    After a verified download, import and start the VM using
    <RepoRoot>\scripts\bnpi-pats-vm.ps1.

.EXAMPLE
    .\deploy-project-truth-v7-from-gcs.ps1

.EXAMPLE
    .\deploy-project-truth-v7-from-gcs.ps1 -RepoRoot 'C:\src\bandai-infra-bnpi-pats' -StartVm
#>
[CmdletBinding()]
param(
    [string]$ProjectId = 'bandai-pats-vhdx-artifacts',
    [string]$Bucket = 'bandai-pats-vhdx-artifacts',
    [string]$ObjectPath = 'project-truth/hyperv/v7',
    [string]$VhdName = 'project-truth-node-local-hyperv-v7-current-state.vhdx',
    [string]$ImagesDir = "$env:ProgramData\BandaiApp\Bnpipats\images",
    [string]$RepoRoot = '',
    [string]$VmName = 'bnpi-pats',
    [switch]$StartVm
)

$ErrorActionPreference = 'Stop'

function Write-Step {
    param([string]$Message)
    Write-Host ("{0} {1}" -f (Get-Date -Format 'HH:mm:ss'), $Message)
}

function Get-Sha256 {
    param([Parameter(Mandatory = $true)][string]$Path)
    return (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant()
}

$gcloud = Get-Command gcloud.cmd, gcloud -ErrorAction SilentlyContinue | Select-Object -First 1
if (-not $gcloud) {
    throw 'gcloud CLI not found. Install Google Cloud CLI on this host and run: gcloud auth login'
}
$gcloudExe = $gcloud.Source

function Invoke-Gcloud {
    <#
        Runs a gcloud subcommand. gcloud writes informational text to stderr on
        success (for example the "does not have permission to access projects
        instance" warning), so stderr is captured instead of treated as a fatal
        error. The exit code is the real failure signal.
    #>
    param(
        [Parameter(Mandatory = $true)][string[]]$GcloudArgs,
        [switch]$AllowFailure
    )

    $previousErrorActionPreference = $ErrorActionPreference
    $ErrorActionPreference = 'SilentlyContinue'
    try {
        $captured = & $gcloudExe @GcloudArgs 2>&1
        $exitCode = $LASTEXITCODE
    }
    finally {
        $ErrorActionPreference = $previousErrorActionPreference
    }

    $text = ($captured | Out-String).Trim()
    if ($exitCode -ne 0 -and -not $AllowFailure) {
        throw "gcloud $($GcloudArgs -join ' ') failed with exit code ${exitCode}: $text"
    }

    return $text
}

Write-Step "Using gcloud: $gcloudExe"
Write-Host (Invoke-Gcloud -GcloudArgs @('config', 'set', 'project', $ProjectId))

$authOutput = Invoke-Gcloud -GcloudArgs @('auth', 'list', '--format=value(account)')
if ([string]::IsNullOrWhiteSpace($authOutput)) {
    throw 'No active gcloud account on this host. Run: gcloud auth login'
}
Write-Step "Authenticated account: $authOutput"

$releaseUri = "gs://$Bucket/$ObjectPath"
$vhdxUri = "$releaseUri/$VhdName"
$sidecarUri = "$vhdxUri.sha256"

Write-Step 'Checking the VHDX exists in the private bucket'
$listing = Invoke-Gcloud -GcloudArgs @('storage', 'ls', $vhdxUri) -AllowFailure
if ([string]::IsNullOrWhiteSpace($listing)) {
    throw "VHDX not found in the bucket: $vhdxUri`n" +
    "The image has to be uploaded first. On the machine that holds the V7 VHDX run:`n" +
    "  .\prepare-project-truth-v7-staging.ps1`n" +
    "  .\upload-project-truth-v7-to-gcs.ps1"
}
Write-Step "Found: $vhdxUri"

New-Item -ItemType Directory -Force -Path $ImagesDir | Out-Null
$vhdxPath = Join-Path $ImagesDir $VhdName
$sidecarPath = "$vhdxPath.sha256"

Write-Step "Downloading checksum sidecar"
Write-Host (Invoke-Gcloud -GcloudArgs @('storage', 'cp', $sidecarUri, $sidecarPath))

if (-not (Test-Path -LiteralPath $sidecarPath -PathType Leaf)) {
    throw "Checksum sidecar was not written: $sidecarPath"
}

$expectedSha256 = ((Get-Content -LiteralPath $sidecarPath -Raw).Trim() -split '\s+')[0].ToLowerInvariant()
if ($expectedSha256 -notmatch '^[0-9a-f]{64}$') {
    throw "Checksum sidecar does not contain a valid SHA-256 value: $expectedSha256"
}
Write-Step "Expected SHA-256: $expectedSha256"

Write-Step "Downloading VHDX to $vhdxPath (this can take a long time)"
Write-Host (Invoke-Gcloud -GcloudArgs @('storage', 'cp', $vhdxUri, $vhdxPath))

if (-not (Test-Path -LiteralPath $vhdxPath -PathType Leaf)) {
    throw "VHDX was not written: $vhdxPath"
}

$actualSha256 = Get-Sha256 -Path $vhdxPath
if ($actualSha256 -ne $expectedSha256) {
    Remove-Item -LiteralPath $vhdxPath -Force -ErrorAction SilentlyContinue
    throw "VHDX checksum mismatch. actual=$actualSha256 expected=$expectedSha256 (partial file removed)"
}

$sizeGb = [math]::Round((Get-Item -LiteralPath $vhdxPath).Length / 1GB, 2)
Write-Step "VHDX verified: $sizeGb GB, sha256=$actualSha256"

if (-not $StartVm) {
    Write-Step 'Download complete. Re-run with -RepoRoot and -StartVm to create the VM.'
    Write-Host ''
    Write-Host 'PROJECT_TRUTH_V7_DOWNLOAD_OK'
    exit 0
}

if ([string]::IsNullOrWhiteSpace($RepoRoot)) {
    throw '-StartVm requires -RepoRoot pointing at a bandai-infra-bnpi-pats checkout.'
}

$vmScript = Join-Path $RepoRoot 'scripts\bnpi-pats-vm.ps1'
if (-not (Test-Path -LiteralPath $vmScript -PathType Leaf)) {
    throw "VM script not found: $vmScript"
}

$admin = ([Security.Principal.WindowsPrincipal] `
        [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole(
    [Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $admin) {
    throw 'Run this script in an elevated PowerShell. Hyper-V import needs Administrator.'
}

Write-Step "Importing and starting VM '$VmName'"
& $vmScript -VhdxPath $vhdxPath -VmName $VmName -BaseDir "$env:ProgramData\BandaiApp\Bnpipats"
if ($LASTEXITCODE -ne 0) {
    throw "bnpi-pats-vm.ps1 failed with exit code $LASTEXITCODE"
}

Write-Step 'VM import finished. Next: GitOps/runtime and Cloudflare via scripts\project-truth-v6-one-shot.ps1'
Write-Host ''
Write-Host 'PROJECT_TRUTH_V7_DEPLOY_OK'
