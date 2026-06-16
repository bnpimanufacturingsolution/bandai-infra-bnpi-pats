param(
  [string]$PackerDir = (Join-Path (Split-Path -Parent $PSScriptRoot) 'image-factory\packer'),
  [string]$ImagesDir = "$env:ProgramData\ProjectTruth\images",
  [string]$PublishedImagePath = "$env:ProgramData\ProjectTruth\images\project-truth-node-latest.vhdx",
  [string]$BuiltImagePath = '',
  [string]$IsoUrl = 'https://releases.ubuntu.com/24.04/ubuntu-24.04.4-live-server-amd64.iso',
  [string]$IsoSha256 = 'e907d92eeec9df64163a7e454cbc8d7755e8ddc7ed42f99dbc80c40f1a138433',
  [string]$IsoCachePath = (Join-Path (Join-Path (Split-Path -Parent $PSScriptRoot) '.runtime\image-cache') 'ubuntu-24.04.4-live-server-amd64.iso'),
  [int]$IsoChunkMb = 64,
  [bool]$PredownloadIso = $true,
  [string]$TerraformVarsPath = (Join-Path (Split-Path -Parent $PSScriptRoot) 'terraform-hyperv\terraform.tfvars'),
  [string]$VmName = 'project-truth-node-01',
  [string]$SwitchName = 'ProjectTruth-Internal',
  [ValidateSet('External','Internal','Private')]
  [string]$SwitchType = 'Internal',
  [string[]]$NetAdapterNames = @(),
  [string]$VmPath = "$env:ProgramData\ProjectTruth\HyperV",
  [int]$MemoryMb = 4096,
  [int]$CpuCount = 2,
  [switch]$SkipBuild
)

$ErrorActionPreference = 'Stop'

if (-not (Get-Command packer -ErrorAction SilentlyContinue)) {
  throw 'packer not found in PATH. Install HashiCorp Packer before building the Project Truth image.'
}

if ($PredownloadIso -and -not (Get-Command curl.exe -ErrorAction SilentlyContinue)) {
  throw 'curl.exe not found in PATH. It is required for explicit Ubuntu ISO predownload.'
}

if (-not (Get-Command Get-VHD -ErrorAction SilentlyContinue)) {
  throw 'Hyper-V PowerShell cmdlets are missing. Get-VHD is required to validate the published VHDX.'
}

if (-not (Test-Path -LiteralPath $PackerDir)) {
  throw "Packer directory not found: $PackerDir"
}

New-Item -ItemType Directory -Force -Path $ImagesDir | Out-Null

function Get-RemoteContentLength {
  param([string]$Url)

  $headers = & curl.exe --silent --show-error -I --max-time 60 $Url 2>&1
  if ($LASTEXITCODE -ne 0) {
    throw "Unable to read remote headers for $Url"
  }

  $lengthLine = $headers | Where-Object { $_ -match '^Content-Length:\s*(\d+)' } | Select-Object -Last 1
  if (-not $lengthLine -or $lengthLine -notmatch '^Content-Length:\s*(\d+)') {
    throw "Content-Length not found for $Url"
  }

  return [int64]$Matches[1]
}

function Add-FileBytes {
  param(
    [string]$Source,
    [string]$Destination
  )

  $inputStream = [System.IO.File]::OpenRead($Source)
  try {
    $outputStream = $null
    for ($attempt = 1; $attempt -le 10 -and -not $outputStream; $attempt++) {
      try {
        $outputStream = [System.IO.File]::Open($Destination, [System.IO.FileMode]::Append, [System.IO.FileAccess]::Write, [System.IO.FileShare]::ReadWrite)
      } catch {
        if ($attempt -eq 10) { throw }
        Start-Sleep -Seconds 2
      }
    }
    try {
      $inputStream.CopyTo($outputStream)
    } finally {
      $outputStream.Dispose()
    }
  } finally {
    $inputStream.Dispose()
  }
}

function Save-FileInChunks {
  param(
    [string]$Url,
    [string]$Destination,
    [int64]$ExpectedBytes,
    [int]$ChunkMb
  )

  $partial = "$Destination.part"
  $chunkBytes = [int64]$ChunkMb * 1024 * 1024

  if (-not (Test-Path -LiteralPath $partial)) {
    New-Item -ItemType File -Path $partial -Force | Out-Null
  }

  if ((Get-Item -LiteralPath $partial).Length -gt $ExpectedBytes) {
    Write-Warning "Partial download is larger than expected. Restarting: $partial"
    Remove-Item -LiteralPath $partial -Force
    New-Item -ItemType File -Path $partial -Force | Out-Null
  }

  while ((Test-Path -LiteralPath $partial) -and ((Get-Item -LiteralPath $partial).Length -lt $ExpectedBytes)) {
    $current = (Get-Item -LiteralPath $partial).Length
    $end = [Math]::Min($current + $chunkBytes - 1, $ExpectedBytes - 1)
    $range = "$current-$end"
    $chunk = "$Destination.chunk"
    Remove-Item -LiteralPath $chunk -Force -ErrorAction SilentlyContinue

    Write-Host ("Downloading Ubuntu ISO bytes {0}-{1} of {2}" -f $current, $end, $ExpectedBytes)
    & curl.exe --silent --show-error -L --fail --retry 5 --retry-delay 10 --connect-timeout 30 --max-time 1800 --range $range --output $chunk $Url
    if ($LASTEXITCODE -ne 0) {
      throw "Ubuntu ISO chunk download failed for range $range with curl exit code $LASTEXITCODE"
    }

    $expectedChunkBytes = $end - $current + 1
    $actualChunkBytes = (Get-Item -LiteralPath $chunk).Length
    if ($actualChunkBytes -ne $expectedChunkBytes) {
      throw "Ubuntu ISO chunk size mismatch for range $range. actual=$actualChunkBytes expected=$expectedChunkBytes"
    }

    Add-FileBytes -Source $chunk -Destination $partial
    Remove-Item -LiteralPath $chunk -Force

    $downloaded = (Get-Item -LiteralPath $partial).Length
    Write-Host ("Ubuntu ISO downloaded {0:n0}/{1:n0} bytes" -f $downloaded, $ExpectedBytes)
  }

  if ((Get-Item -LiteralPath $partial).Length -eq $ExpectedBytes) {
    Move-Item -LiteralPath $partial -Destination $Destination -Force
  }
}

if (-not $SkipBuild) {
  if ($PredownloadIso) {
    $isoDir = Split-Path -Parent $IsoCachePath
    New-Item -ItemType Directory -Force -Path $isoDir | Out-Null

    $needsDownload = $true
    if (Test-Path -LiteralPath $IsoCachePath) {
      $existingHash = (Get-FileHash -LiteralPath $IsoCachePath -Algorithm SHA256).Hash.ToLowerInvariant()
      if ($existingHash -eq $IsoSha256.ToLowerInvariant()) {
        $needsDownload = $false
        Write-Host "Ubuntu ISO cache verified: $IsoCachePath"
      } else {
        Write-Warning "Ubuntu ISO cache checksum mismatch. Removing stale cache: $IsoCachePath"
        Remove-Item -LiteralPath $IsoCachePath -Force
      }
    }

    if ($needsDownload) {
      $expectedBytes = Get-RemoteContentLength -Url $IsoUrl
      Write-Host "Downloading Ubuntu ISO in $IsoChunkMb MiB chunks: $IsoUrl"
      Write-Host "Download target: $IsoCachePath"
      Save-FileInChunks -Url $IsoUrl -Destination $IsoCachePath -ExpectedBytes $expectedBytes -ChunkMb $IsoChunkMb

      $actualIsoHash = (Get-FileHash -LiteralPath $IsoCachePath -Algorithm SHA256).Hash.ToLowerInvariant()
      if ($actualIsoHash -ne $IsoSha256.ToLowerInvariant()) {
        throw "Ubuntu ISO checksum failed. actual=$actualIsoHash expected=$($IsoSha256.ToLowerInvariant())"
      }
      Write-Host "Ubuntu ISO cache verified: $IsoCachePath"
    }
  }

  Push-Location $PackerDir
  try {
    packer init .
    packer validate .
    if ($PredownloadIso) {
      $resolvedIso = (Resolve-Path -LiteralPath $IsoCachePath).Path
      packer build -force -var "iso_url=$resolvedIso" -var "iso_checksum=sha256:$IsoSha256" .
    } else {
      packer build -force .
    }
  } finally {
    Pop-Location
  }
}

$searchRoots = @(
  (Join-Path $PackerDir 'output'),
  (Join-Path (Split-Path -Parent $PackerDir) 'output'),
  (Join-Path (Split-Path -Parent (Split-Path -Parent $PackerDir)) 'output')
) | Select-Object -Unique

if ($BuiltImagePath) {
  if (-not (Test-Path -LiteralPath $BuiltImagePath)) {
    throw "Built image path not found: $BuiltImagePath"
  }
  $candidate = Get-Item -LiteralPath $BuiltImagePath
} else {
  $candidate = $searchRoots |
    Where-Object { Test-Path -LiteralPath $_ } |
    ForEach-Object { Get-ChildItem -LiteralPath $_ -Recurse -Filter *.vhdx -ErrorAction SilentlyContinue } |
    Sort-Object LastWriteTime -Descending |
    Select-Object -First 1
}

if (-not $candidate) {
  throw "No VHDX produced by Packer. Searched: $($searchRoots -join '; '). Run without -SkipBuild, or pass -BuiltImagePath <bootable-project-truth.vhdx>."
}

Copy-Item -LiteralPath $candidate.FullName -Destination $PublishedImagePath -Force

$hash = Get-FileHash -LiteralPath $PublishedImagePath -Algorithm SHA256
$shaPath = "$PublishedImagePath.sha256"
"$($hash.Hash.ToLowerInvariant())  $(Split-Path -Leaf $PublishedImagePath)" | Set-Content -LiteralPath $shaPath -Encoding ASCII

Get-VHD -Path $PublishedImagePath | Format-List * | Out-String | Write-Host

& "$PSScriptRoot\configure.ps1" `
  -ImagePath $PublishedImagePath `
  -ExpectedSha256 $hash.Hash `
  -VmName $VmName `
  -SwitchName $SwitchName `
  -VmPath $VmPath `
  -CpuCount $CpuCount `
  -MemoryMb $MemoryMb

& "$PSScriptRoot\select-image.ps1" -ImagePath $PublishedImagePath -ExpectedSha256 $hash.Hash

$adapterList = ($NetAdapterNames | ForEach-Object {
  $escaped = $_ -replace '\\', '\\' -replace '"', '\"'
  '"{0}"' -f $escaped
}) -join ', '
@"
vm_name           = "$VmName"
switch_name       = "$SwitchName"
switch_type       = "$SwitchType"
net_adapter_names = [$adapterList]
source_image_path = "$($PublishedImagePath -replace '\\', '\\')"
vm_path           = "$($VmPath -replace '\\', '\\')"
memory_mb         = $MemoryMb
cpu_count         = $CpuCount
ssh_port          = 2222
dev_port          = 3001
uat_port          = 3002
prod_port         = 3000
guest_ip_hint     = ""
"@ | Set-Content -LiteralPath $TerraformVarsPath -Encoding ASCII

Write-Host "Published Project Truth VHDX: $PublishedImagePath"
Write-Host "SHA256: $($hash.Hash)"
Write-Host "Checksum file: $shaPath"
Write-Host "Terraform vars: $TerraformVarsPath"
