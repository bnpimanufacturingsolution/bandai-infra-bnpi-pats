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
        [Parameter(Mandatory = $true)][System.Collections.Generic.List[object]]$Items,
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
& $gcloudExe config set project $ProjectId | Out-Host
$authOutput = (& $gcloudExe auth list --format='value(account)' 2>&1 | Out-String).Trim()
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
    'upload-project-truth-v7-to-gcs.ps1',
    'prepare-project-truth-v7-staging.ps1',
    'prepare-project-truth-v7-staging.ps1.sha256',
    'GCS-V7-UPLOAD-README.txt',
    'step-up.md'
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
    & $gcloudExe storage cp $item.Path "$Bucket/$ObjectPath/$($item.Name)"
    if ($LASTEXITCODE -ne 0) {
        throw "gcloud storage cp failed for $($item.Name) with exit code $LASTEXITCODE"
    }
}

Write-Host ''
Write-Host 'GCS objects after upload:'
& $gcloudExe storage ls "$Bucket/$ObjectPath/"
if ($LASTEXITCODE -ne 0) {
    throw "gcloud storage ls failed with exit code $LASTEXITCODE"
}

Write-Host ''
Write-Host 'PROJECT_TRUTH_V7_UPLOAD_OK'
