[CmdletBinding()]
param(
    [string]$StagingDirectory = '',
    [string]$VhdDirectory = ''
)

$ErrorActionPreference = 'Stop'

function Get-Sha256 {
    param([Parameter(Mandatory = $true)][string]$Path)
    return (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant()
}

function Find-File {
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

$scriptDirectory = Split-Path -Parent $MyInvocation.MyCommand.Path
if ([string]::IsNullOrWhiteSpace($StagingDirectory)) {
    # Stage beside this script when it already lives in a release package
    # folder. The folder name is not significant, so both the original
    # "gcs-v7-release" name and the current "bandai-bnpi-pats" name are
    # accepted. When the script sits in a parent folder (for example the
    # external Setup flow directory), stage into a package subfolder instead.
    $packageFolderNames = @('gcs-v7-release', 'bandai-bnpi-pats')
    if ($packageFolderNames -contains (Split-Path -Leaf $scriptDirectory)) {
        $StagingDirectory = $scriptDirectory
    }
    else {
        $StagingDirectory = Join-Path $scriptDirectory 'bandai-bnpi-pats'
    }
}
New-Item -ItemType Directory -Force -Path $StagingDirectory | Out-Null

$sourceRoots = @(
    $VhdDirectory,
    $StagingDirectory,
    'C:\ProgramData\BandaiApp\Bnpipats\images',
    'C:\ProgramData\BandaiApp\Bnpipats',
    'C:\ProgramData\ProjectTruth\images',
    'C:\ProgramData\ProjectTruth'
) | Where-Object { -not [string]::IsNullOrWhiteSpace($_) } | Select-Object -Unique

$vhdx = Find-File -Name 'project-truth-node-local-hyperv-v7-current-state.vhdx' -Roots $sourceRoots
if (-not $vhdx) {
    throw "V7 VHDX not found. Searched: $($sourceRoots -join '; ')"
}

$releaseDirectory = Split-Path -Parent $vhdx
$sidecar = "$vhdx.sha256"
if (-not (Test-Path -LiteralPath $sidecar -PathType Leaf)) {
    $hash = Get-Sha256 -Path $vhdx
    "$hash  $(Split-Path $vhdx -Leaf)" | Set-Content -LiteralPath $sidecar -Encoding ASCII
}

$actualHash = Get-Sha256 -Path $vhdx
$declaredHash = ((Get-Content -LiteralPath $sidecar -Raw).Trim() -split '\s+')[0].ToLowerInvariant()
if ($actualHash -ne $declaredHash) {
    throw "V7 VHDX checksum mismatch. actual=$actualHash declared=$declaredHash"
}

$helperNames = @(
    'download-project-truth-vhdx.ps1',
    'download-project-truth-vhdx.ps1.sha256',
    'upload-project-truth-v7-to-gcs.ps1',
    'upload-project-truth-v7-to-gcs.ps1.sha256',
    'GCS-V7-UPLOAD-README.txt',
    'step-up.md'
)

$releaseNames = @(
    'project-truth-hyperv-v7-manifest.json',
    'README-HYPERV-EXPORT.txt',
    'Import-ProjectTruthHyperV.ps1'
)

$copied = [System.Collections.Generic.List[object]]::new()

function Copy-ToStaging {
    param(
        [Parameter(Mandatory = $true)][string]$Source,
        [string]$Category
    )

    $name = Split-Path -Leaf $Source
    $destination = Join-Path $StagingDirectory $name
    $sourceFull = (Resolve-Path -LiteralPath $Source).Path
    $destinationFull = [IO.Path]::GetFullPath($destination)

    if ($sourceFull -ne $destinationFull) {
        Write-Host "Staging $name..."
        Copy-Item -LiteralPath $sourceFull -Destination $destinationFull -Force
    }

    $copied.Add([pscustomobject]@{
        name = $name
        category = $Category
        bytes = (Get-Item -LiteralPath $destinationFull).Length
        sha256 = Get-Sha256 -Path $destinationFull
    })
}

Copy-ToStaging -Source $vhdx -Category 'v7-image'
Copy-ToStaging -Source $sidecar -Category 'v7-image'

foreach ($name in $releaseNames) {
    $source = Find-File -Name $name -Roots @($releaseDirectory, $sourceRoots)
    if ($source) {
        Copy-ToStaging -Source $source -Category 'v7-release-metadata'
    }
    else {
        Write-Warning "Optional V7 release file not found: $name"
    }
}

foreach ($name in $helperNames) {
    $source = Join-Path $scriptDirectory $name
    if (-not (Test-Path -LiteralPath $source -PathType Leaf)) {
        throw "Helper file not found: $source"
    }
    Copy-ToStaging -Source $source -Category 'windows-downloader'
}

$stagingManifest = [ordered]@{
    release = 'project-truth-hyperv-v7'
    generatedAtUtc = (Get-Date).ToUniversalTime().ToString('o')
    files = @($copied | Sort-Object category, name)
}

$stagingManifestPath = Join-Path $StagingDirectory 'STAGING-MANIFEST.json'
$stagingManifest | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $stagingManifestPath -Encoding UTF8

Write-Host ''
Write-Host 'Staging complete:'
Get-ChildItem -LiteralPath $StagingDirectory -File |
    Select-Object Name, Length, LastWriteTime |
    Sort-Object Name |
    Format-Table -AutoSize

Write-Host ''
Write-Host "STAGING_V7_READY=$StagingDirectory"
