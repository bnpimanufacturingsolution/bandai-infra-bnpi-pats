[CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = 'Medium')]
param(
    [string]$ProjectId = 'bandai-pats-vhdx-artifacts',
    [string]$Bucket = 'gs://bandai-pats-vhdx-artifacts',
    [string]$ObjectPath = 'project-truth/hyperv/v7',
    [string]$VhdDirectory = '',
    [string]$HelperDirectory = (Split-Path -Parent $MyInvocation.MyCommand.Path),
    [switch]$HelpersOnly
)

$ErrorActionPreference = 'Stop'

function Get-Sha256 {
    param([Parameter(Mandatory = $true)][string]$Path)
    return (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant()
}

function Find-ExistingFile {
    param(
        [Parameter(Mandatory = $true)][string]$Name,
        [Parameter(Mandatory = $true)][string[]]$Roots
    )

    foreach ($root in ($Roots | Where-Object { -not [string]::IsNullOrWhiteSpace($_) -and (Test-Path -LiteralPath $_) })) {
        $match = Get-ChildItem -LiteralPath $root -Recurse -File -Filter $Name -ErrorAction SilentlyContinue |
            Sort-Object LastWriteTime -Descending |
            Select-Object -First 1
        if ($match) {
            return $match.FullName
        }
    }

    return $null
}

function Add-UploadItem {
    param(
        [Parameter(Mandatory = $true)][AllowEmptyCollection()][System.Collections.Generic.List[object]]$Items,
        [Parameter(Mandatory = $true)][string]$Path,
        [Parameter(Mandatory = $true)][string]$Category,
        [switch]$Required
    )

    if ([string]::IsNullOrWhiteSpace($Path) -or -not (Test-Path -LiteralPath $Path -PathType Leaf)) {
        if ($Required) {
            throw "Required release file not found: $Path"
        }
        Write-Warning "Optional release file not found; skipping: $Path"
        return
    }

    $Items.Add([pscustomobject]@{
        Path = (Resolve-Path -LiteralPath $Path).Path
        Name = Split-Path -Leaf $Path
        Category = $Category
    })
}

$gcloud = Get-Command gcloud.cmd, gcloud -ErrorAction SilentlyContinue | Select-Object -First 1
if (-not $gcloud) {
    throw 'gcloud CLI not found. Install Google Cloud CLI and run gcloud auth login first.'
}

$gcloudExe = $gcloud.Source

function Invoke-Gcloud {
    <#
        Runs a gcloud subcommand without letting benign stderr output
        (for example the "does not have permission to access projects
        instance" warning that gcloud emits on `config set project`) become a
        terminating error. The real failure signal is the exit code.
    #>
    param(
        [Parameter(Mandatory = $true)][string[]]$GcloudArgs
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
    if ($exitCode -ne 0) {
        throw "gcloud $($GcloudArgs -join ' ') failed with exit code ${exitCode}: $text"
    }

    return $text
}

Write-Host (Invoke-Gcloud -GcloudArgs @('config', 'set', 'project', $ProjectId))
$authOutput = Invoke-Gcloud -GcloudArgs @('auth', 'list', '--format=value(account)')
if ([string]::IsNullOrWhiteSpace($authOutput)) {
    throw 'No active gcloud account. Run gcloud auth login first.'
}

$candidateRoots = @(
    $VhdDirectory,
    'C:\ProgramData\BandaiApp\Bnpipats\images',
    'C:\ProgramData\BandaiApp\Bnpipats',
    'C:\ProgramData\ProjectTruth\images',
    'C:\ProgramData\ProjectTruth'
) | Where-Object { -not [string]::IsNullOrWhiteSpace($_) } | Select-Object -Unique

$helperFiles = @(
    'download-project-truth-vhdx.ps1',
    'download-project-truth-vhdx.ps1.sha256',
    'deploy-project-truth-v7-from-gcs.ps1',
    'deploy-project-truth-v7-from-gcs.ps1.sha256',
    'upload-project-truth-v7-to-gcs.ps1',
    'prepare-project-truth-v7-staging.ps1',
    'prepare-project-truth-v7-staging.ps1.sha256',
    'GCS-V7-UPLOAD-README.txt',
    'step-up.md',
    'step-by-step.md'
)

$items = [System.Collections.Generic.List[object]]::new()
$vhdx = $null
$releaseDirectory = $null

if (-not $HelpersOnly) {
    $vhdx = Find-ExistingFile -Name 'project-truth-node-local-hyperv-v7-current-state.vhdx' -Roots $candidateRoots
    if (-not $vhdx) {
        throw 'V7 VHDX not found. Searched: ' + ($candidateRoots -join '; ')
    }

    $releaseDirectory = Split-Path -Parent $vhdx
    $sidecar = "$vhdx.sha256"
    if (-not (Test-Path -LiteralPath $sidecar -PathType Leaf)) {
        $hash = Get-Sha256 -Path $vhdx
        "$hash  $(Split-Path $vhdx -Leaf)" | Set-Content -LiteralPath $sidecar -Encoding ASCII
        Write-Host "Created missing checksum sidecar: $sidecar"
    }

    $declaredHash = ((Get-Content -LiteralPath $sidecar -Raw).Trim() -split '\s+')[0].ToLowerInvariant()
    $actualHash = Get-Sha256 -Path $vhdx
    if ($declaredHash -ne $actualHash) {
        throw "V7 VHDX checksum mismatch. actual=$actualHash declared=$declaredHash"
    }

    Add-UploadItem -Items $items -Path $vhdx -Category 'v7-image' -Required
    Add-UploadItem -Items $items -Path $sidecar -Category 'v7-image' -Required

    foreach ($name in @(
        'project-truth-hyperv-v7-manifest.json',
        'README-HYPERV-EXPORT.txt',
        'Import-ProjectTruthHyperV.ps1'
    )) {
        $path = Find-ExistingFile -Name $name -Roots @($releaseDirectory, $candidateRoots)
        Add-UploadItem -Items $items -Path $path -Category 'v7-release-metadata'
    }
}

foreach ($name in $helperFiles) {
    Add-UploadItem -Items $items -Path (Join-Path $HelperDirectory $name) -Category 'windows-downloader' -Required
}

# Hyper-V VM import scripts. bnpi-pats-vm.ps1 resolves its siblings through
# $PSScriptRoot, so these are uploaded flat into the same object path and must
# be restored side by side in one directory on the target host.
$vmScriptsDir = Join-Path $HelperDirectory 'vmscripts'
if (Test-Path -LiteralPath $vmScriptsDir -PathType Container) {
    Get-ChildItem -LiteralPath $vmScriptsDir -File -ErrorAction SilentlyContinue |
        Sort-Object Name |
        ForEach-Object {
            Add-UploadItem -Items $items -Path $_.FullName -Category 'hyperv-vm-scripts'
        }
}

$stagingManifest = Join-Path $HelperDirectory 'STAGING-MANIFEST.json'
if (Test-Path -LiteralPath $stagingManifest -PathType Leaf) {
    Add-UploadItem -Items $items -Path $stagingManifest -Category 'staging-manifest' -Required
}

if ($items.Count -eq 0) {
    throw 'No files were selected for upload.'
}

$manifestPath = Join-Path $HelperDirectory 'project-truth-hyperv-v7-upload-manifest.json'
$manifestFiles = @(
    $items | ForEach-Object {
        $file = Get-Item -LiteralPath $_.Path
        [ordered]@{
            name = $_.Name
            category = $_.Category
            bytes = $file.Length
            sha256 = Get-Sha256 -Path $_.Path
        }
    }
)

$manifest = [ordered]@{
    projectId = $ProjectId
    bucket = $Bucket
    objectPath = $ObjectPath
    generatedAtUtc = (Get-Date).ToUniversalTime().ToString('o')
    files = $manifestFiles
}

$manifest | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $manifestPath -Encoding UTF8
Add-UploadItem -Items $items -Path $manifestPath -Category 'generated-manifest' -Required

Write-Host ''
Write-Host 'Release files selected:'
$items | Sort-Object Category, Name | Select-Object Category, Name, Path | Format-Table -AutoSize
Write-Host ''
Write-Host "Upload destination: $Bucket/$ObjectPath/"
Write-Host ''

if (-not $PSCmdlet.ShouldProcess("Upload Project Truth V7 release to $Bucket/$ObjectPath")) {
    Write-Host 'Upload cancelled. No GCS objects were changed.'
    exit 0
}

foreach ($item in $items) {
    Write-Host "Uploading $($item.Name)..."
    Write-Host (Invoke-Gcloud -GcloudArgs @('storage', 'cp', $item.Path, "$Bucket/$ObjectPath/$($item.Name)"))
}

Write-Host ''
Write-Host 'GCS objects after upload:'
Write-Host (Invoke-Gcloud -GcloudArgs @('storage', 'ls', "$Bucket/$ObjectPath/"))

Write-Host ''
Write-Host 'PROJECT_TRUTH_V7_UPLOAD_OK'
