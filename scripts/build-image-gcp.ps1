param(
  [string]$PackerDir = (Join-Path (Split-Path -Parent $PSScriptRoot) 'image-factory\packer'),
  [string]$RuntimeDir = (Join-Path (Split-Path -Parent $PSScriptRoot) '.runtime\gcp-image-build'),
  [string]$TemplateName = 'ubuntu-googlecompute.pkr.hcl',
  [string]$ProjectId = 'hris-492904',
  [string]$Zone = 'asia-southeast1-a',
  [string]$StagingBucket = 'project-truth-image-export-hris-492904-161377059311',
  [string]$StagingObjectPrefix = 'public/project-truth/gcp-image-build/staging',
  [string]$SourceInputsDir = 'C:\Users\anoni\OneDrive\Desktop\HRIS-PROJECT\source-inputs-organized',
  [switch]$IncludeSourceInputs,
  [switch]$ValidateOnly,
  [switch]$SkipStage,
  [switch]$PreserveFailedBuildResources,
  [switch]$SkipBuildAlert
)

$ErrorActionPreference = 'Stop'

if (-not [System.IO.Path]::IsPathRooted($RuntimeDir)) {
  $RuntimeDir = Join-Path (Get-Location).Path $RuntimeDir
}
$RuntimeDir = [System.IO.Path]::GetFullPath($RuntimeDir)
$RunStartedAt = Get-Date
$BuildSucceeded = $false

function Write-Alert {
  param(
    [string]$Status,
    [string]$Message
  )

  New-Item -ItemType Directory -Force -Path $RuntimeDir | Out-Null
  $alertPath = Join-Path $RuntimeDir ("alert-{0}.txt" -f (Get-Date -Format 'yyyyMMdd-HHmmss'))
  @"
Timestamp: $(Get-Date -Format o)
Status: $Status
Project: $ProjectId
Zone: $Zone
Message: $Message
"@ | Set-Content -LiteralPath $alertPath -Encoding UTF8

  Write-Host ""
  Write-Host "PROJECT TRUTH GCP BUILD ALERT: $Status" -ForegroundColor Yellow
  Write-Host $Message
  Write-Host "Alert file: $alertPath"

  if ($SkipBuildAlert) {
    return
  }

  if (Get-Command New-BurntToastNotification -ErrorAction SilentlyContinue) {
    New-BurntToastNotification -Text "Project Truth GCP build: $Status", $Message | Out-Null
    return
  }

  if (Get-Command msg.exe -ErrorAction SilentlyContinue) {
    & msg.exe $env:USERNAME "Project Truth GCP build: $Status - $Message" 2>$null | Out-Null
    return
  }

  [console]::Beep(900, 250)
}

function Invoke-Gcloud {
  param([string[]]$Arguments)

  if (-not (Get-Command gcloud -ErrorAction SilentlyContinue)) {
    throw 'gcloud not found in PATH. Install Google Cloud SDK before building the Project Truth GCP image.'
  }

  & gcloud @Arguments
}

function Invoke-Gsutil {
  param([string[]]$Arguments)

  $gsutil = Get-Command gsutil.cmd, gsutil -ErrorAction SilentlyContinue | Select-Object -First 1
  if (-not $gsutil) {
    throw 'gsutil not found in PATH. Install Google Cloud SDK before building the Project Truth GCP image.'
  }

  & $gsutil.Source @Arguments
}

function Get-ProjectTruthBuildInstances {
  Invoke-Gcloud -Arguments @(
    'compute', 'instances', 'list',
    '--project', $ProjectId,
    '--format', 'csv[no-heading](name,zone.basename(),status,creationTimestamp,labels.app,labels.purpose)'
  ) 2>$null | Where-Object {
    $parts = $_.Split(',')
    $parts.Length -ge 6 -and (
      $parts[0].Trim() -like 'project-truth-node-gcp-build-*' -or
      ($parts[4].Trim() -eq 'project-truth' -and $parts[5].Trim() -eq 'packer-image-build')
    )
  }
}

function Remove-LeakedBuildResources {
  if ($PreserveFailedBuildResources) {
    Write-Host 'PreserveFailedBuildResources was set; skipping automatic GCP build resource cleanup.'
    return
  }

  $instances = @(Get-ProjectTruthBuildInstances | Where-Object { -not [string]::IsNullOrWhiteSpace($_) })
  foreach ($row in $instances) {
    $parts = $row.Split(',')
    if ($parts.Length -lt 4) {
      continue
    }
    $name = $parts[0].Trim()
    $instanceZone = $parts[1].Trim()
    $createdAt = [datetime]::Parse($parts[3].Trim())
    if ($createdAt -lt $RunStartedAt.AddMinutes(-5)) {
      continue
    }
    if ([string]::IsNullOrWhiteSpace($name) -or [string]::IsNullOrWhiteSpace($instanceZone)) {
      continue
    }

    Write-Host "Deleting leftover build VM: $name ($instanceZone)"
    Invoke-Gcloud -Arguments @('compute', 'instances', 'delete', $name, '--project', $ProjectId, '--zone', $instanceZone, '--quiet') | Out-Host
  }

  $diskRows = Invoke-Gcloud -Arguments @(
    'compute', 'disks', 'list',
    '--project', $ProjectId,
    '--format', 'csv[no-heading](name,zone.basename(),creationTimestamp,users)'
  ) 2>$null

  foreach ($row in @($diskRows | Where-Object { -not [string]::IsNullOrWhiteSpace($_) })) {
    $parts = $row.Split(',')
    if ($parts.Length -lt 4) {
      continue
    }
    $name = $parts[0].Trim()
    $diskZone = $parts[1].Trim()
    $createdAt = [datetime]::Parse($parts[2].Trim())
    $users = $parts[3].Trim()
    if ($name -notlike 'project-truth-node-gcp-build-*' -or -not [string]::IsNullOrWhiteSpace($users)) {
      continue
    }
    if ($createdAt -lt $RunStartedAt.AddMinutes(-5)) {
      continue
    }
    if ([string]::IsNullOrWhiteSpace($name) -or [string]::IsNullOrWhiteSpace($diskZone)) {
      continue
    }

    Write-Host "Deleting leftover unattached build disk: $name ($diskZone)"
    Invoke-Gcloud -Arguments @('compute', 'disks', 'delete', $name, '--project', $ProjectId, '--zone', $diskZone, '--quiet') | Out-Host
  }
}

function Write-Checkpoint {
  param(
    [string]$Name,
    [string]$IntendedAction,
    [string]$Command
  )

  New-Item -ItemType Directory -Force -Path $RuntimeDir | Out-Null
  @"
Timestamp: $(Get-Date -Format o)
Intended action: $IntendedAction
Command: $Command
Safety: This script auto-cleans temporary Project Truth Google Compute build VMs and unattached build disks. Use -PreserveFailedBuildResources only when you intentionally need failed resources for debugging.
"@ | Set-Content -LiteralPath (Join-Path $RuntimeDir "checkpoint-$Name.txt") -Encoding UTF8
}

function Invoke-LoggedCommand {
  param(
    [string]$Name,
    [string[]]$Command
  )

  $logPath = Join-Path $RuntimeDir "$Name.log"
  Write-Host "Running: $($Command -join ' ')"
  Write-Host "Log: $logPath"

  $previousPackerLog = $env:PACKER_LOG
  $previousPackerLogPath = $env:PACKER_LOG_PATH
  $env:PACKER_LOG = '1'
  $env:PACKER_LOG_PATH = Join-Path $RuntimeDir "$Name.packer-debug.log"

  try {
    & $Command[0] @($Command | Select-Object -Skip 1) 2>&1 | Tee-Object -FilePath $logPath
    if ($LASTEXITCODE -ne 0) {
      throw "Command failed with exit code ${LASTEXITCODE}: $($Command -join ' ')"
    }
  } finally {
    $env:PACKER_LOG = $previousPackerLog
    $env:PACKER_LOG_PATH = $previousPackerLogPath
  }
}

function Sync-PackerStagingDirectory {
  param(
    [string]$Source,
    [string]$Destination
  )

  if (-not (Test-Path -LiteralPath $Source)) {
    throw "Staging source not found: $Source"
  }

  if (Test-Path -LiteralPath $Destination) {
    Remove-Item -LiteralPath $Destination -Recurse -Force
  }
  New-Item -ItemType Directory -Force -Path $Destination | Out-Null

  $excludedDirectories = @(
    '.git',
    '.github',
    'node_modules',
    'dist',
    'build',
    '.next',
    '.react-router',
    'coverage',
    'test-results',
    'playwright-report',
    'output',
    '.runtime',
    'logs',
    '.cache',
    '.prisma'
  )

  $excludedFiles = @(
    '.env',
    '.env.*',
    '*.tmp',
    '*.log',
    'npm-debug.log*',
    'yarn-debug.log*',
    'yarn-error.log*',
    'pnpm-debug.log*'
  )

  & robocopy.exe $Source $Destination /MIR /NFL /NDL /NJH /NJS /NP /XD $excludedDirectories /XF $excludedFiles | Out-Host
  if ($LASTEXITCODE -gt 7) {
    throw "robocopy failed while staging $Source to $Destination with exit code $LASTEXITCODE"
  }
}

function New-PackerStagingArchive {
  param([string]$StagingRoot)

  $tar = Get-Command tar.exe, tar -ErrorAction SilentlyContinue | Select-Object -First 1
  if (-not $tar) {
    throw 'tar was not found on PATH. It is required to create the single-file GCP staging archive.'
  }

  $archivePath = Join-Path $StagingRoot 'project-truth-staging.tar'
  $manifestPath = Join-Path $StagingRoot 'project-truth-staging.manifest.json'

  $requiredEntries = @('gitops', 'appliance', 'hris-api', 'hris-app', 'vendor')
  foreach ($entry in $requiredEntries) {
    $entryPath = Join-Path $StagingRoot $entry
    if (-not (Test-Path -LiteralPath $entryPath)) {
      throw "Required staging entry not found: $entryPath"
    }
  }

  $stagingFullPath = [System.IO.Path]::GetFullPath($StagingRoot).TrimEnd('\', '/') + [System.IO.Path]::DirectorySeparatorChar
  $manifestEntries = foreach ($entry in $requiredEntries) {
    $entryPath = Join-Path $StagingRoot $entry
    Get-ChildItem -LiteralPath $entryPath -Recurse -Force -File | ForEach-Object {
      [pscustomobject]@{
        path              = $_.FullName.Substring($stagingFullPath.Length).Replace('\', '/')
        length            = $_.Length
        lastWriteTimeUtc  = $_.LastWriteTimeUtc.Ticks
      }
    }
  }

  $manifest = [pscustomobject]@{
    createdBy       = 'scripts/build-image-gcp.ps1'
    requiredEntries = $requiredEntries
    fileCount       = @($manifestEntries).Count
    files           = @($manifestEntries | Sort-Object path)
  } | ConvertTo-Json -Depth 5

  if (Test-Path -LiteralPath $archivePath) {
    $existingArchive = Get-Item -LiteralPath $archivePath
    $existingManifest = if (Test-Path -LiteralPath $manifestPath) {
      Get-Content -LiteralPath $manifestPath -Raw
    } else {
      $null
    }

    if ($existingArchive.Length -gt 0 -and $existingManifest -eq $manifest) {
      Write-Host ("Reusing GCP staging archive: {0} ({1:n2} MiB)" -f $existingArchive.FullName, ($existingArchive.Length / 1MB))
      return
    }
  }

  Remove-Item -LiteralPath $archivePath -Force -ErrorAction SilentlyContinue

  Write-Checkpoint -Name 'stage-archive' -IntendedAction 'Create a single tar payload for the GCP Packer upload.' -Command "tar -cf `"$archivePath`" -C `"$StagingRoot`" $($requiredEntries -join ' ')"
  & $tar.Source -cf $archivePath -C $StagingRoot @requiredEntries
  if ($LASTEXITCODE -ne 0) {
    throw "tar failed while creating GCP staging archive with exit code $LASTEXITCODE"
  }

  $manifest | Set-Content -LiteralPath $manifestPath -Encoding UTF8

  $archive = Get-Item -LiteralPath $archivePath
  Write-Host ("GCP staging archive: {0} ({1:n2} MiB, {2:n0} files)" -f $archive.FullName, ($archive.Length / 1MB), @($manifestEntries).Count)
}

function Publish-PackerStagingArchive {
  param(
    [string]$ArchivePath,
    [string]$Bucket,
    [string]$ObjectPrefix
  )

  if (-not (Test-Path -LiteralPath $ArchivePath)) {
    throw "Staging archive not found: $ArchivePath"
  }

  $archive = Get-Item -LiteralPath $ArchivePath
  $objectName = ('{0}/{1:yyyyMMdd-HHmmss}-{2}' -f $ObjectPrefix.Trim('/'), (Get-Date), $archive.Name)
  $destination = "gs://$Bucket/$objectName"
  $authenticatedUrl = "https://storage.googleapis.com/$Bucket/$objectName"

  Write-Checkpoint -Name 'stage-upload' -IntendedAction 'Publish the GCP staging archive to Cloud Storage so the build VM downloads it directly.' -Command "gsutil cp `"$ArchivePath`" $destination"
  Invoke-Gsutil -Arguments @('-o', 'GSUtil:parallel_composite_upload_threshold=150M', '-h', 'Content-Type:application/x-tar', 'cp', $ArchivePath, $destination) | Out-Host

  $statPath = Join-Path $RuntimeDir 'staging-archive-gcs-stat.txt'
  Invoke-Gsutil -Arguments @('ls', '-l', $destination) 2>&1 | Tee-Object -FilePath $statPath | Out-Host
  if ($LASTEXITCODE -ne 0) {
    throw "Published staging archive was not readable with current GCP credentials at $destination"
  }

  "gcs_uri=$destination`nauthenticated_url=$authenticatedUrl`nbytes=$($archive.Length)" |
    Set-Content -LiteralPath (Join-Path $RuntimeDir 'staging-archive-url.txt') -Encoding UTF8

  return $authenticatedUrl
}

if (-not (Get-Command packer -ErrorAction SilentlyContinue)) {
  throw 'packer not found in PATH. Install HashiCorp Packer before building the Project Truth image.'
}

if (-not (Get-Command gcloud -ErrorAction SilentlyContinue)) {
  throw 'gcloud not found in PATH. Install Google Cloud SDK before building the Project Truth GCP image.'
}

if (-not (Test-Path -LiteralPath $PackerDir)) {
  throw "Packer directory not found: $PackerDir"
}

$templatePath = Join-Path $PackerDir $TemplateName
if (-not (Test-Path -LiteralPath $templatePath)) {
  throw "Packer template not found: $templatePath"
}

New-Item -ItemType Directory -Force -Path $RuntimeDir | Out-Null

if (-not $SkipStage) {
  Write-Checkpoint -Name 'stage' -IntendedAction 'Stage slim Project Truth source folders for the GCP Packer build.' -Command 'robocopy selected source folders into image-factory/packer/staging'
  $repoRoot = Split-Path -Parent (Split-Path -Parent $PackerDir)
  $stagingRoot = Join-Path $PackerDir 'staging'
  New-Item -ItemType Directory -Force -Path $stagingRoot | Out-Null
  Sync-PackerStagingDirectory -Source (Join-Path $repoRoot 'gitops') -Destination (Join-Path $stagingRoot 'gitops')
  Sync-PackerStagingDirectory -Source (Join-Path $repoRoot 'appliance') -Destination (Join-Path $stagingRoot 'appliance')
  Sync-PackerStagingDirectory -Source (Join-Path $repoRoot 'hris-api') -Destination (Join-Path $stagingRoot 'hris-api')
  Sync-PackerStagingDirectory -Source (Join-Path $repoRoot 'hris-app') -Destination (Join-Path $stagingRoot 'hris-app')
  Sync-PackerStagingDirectory -Source (Join-Path $repoRoot 'vendor\zkteco-sdk') -Destination (Join-Path $stagingRoot 'vendor\zkteco-sdk')

  if ($IncludeSourceInputs) {
    $sourceInputsDestination = Join-Path $stagingRoot 'appliance\source-inputs-organized'
    Write-Checkpoint -Name 'stage-source-inputs' -IntendedAction 'Stage organized HRIS source input workbooks for baking into the GCP image.' -Command "robocopy `"$SourceInputsDir`" `"$sourceInputsDestination`" /MIR"
    Sync-PackerStagingDirectory -Source $SourceInputsDir -Destination $sourceInputsDestination
  }
}

$stagingRoot = Join-Path $PackerDir 'staging'
New-PackerStagingArchive -StagingRoot $stagingRoot
$stagingArchivePath = Join-Path $stagingRoot 'project-truth-staging.tar'
$stagingArchiveUrl = Publish-PackerStagingArchive -ArchivePath $stagingArchivePath -Bucket $StagingBucket -ObjectPrefix $StagingObjectPrefix

Push-Location $PackerDir
try {
  Write-Alert -Status 'STARTED' -Message "Google Compute image build started. Temporary build VMs will be auto-cleaned on success, failure, or interruption."

  Write-Checkpoint -Name 'packer-init' -IntendedAction 'Install or verify required Packer plugins.' -Command "packer init $TemplateName"
  Invoke-LoggedCommand -Name 'packer-init' -Command @('packer', 'init', $TemplateName)

  Write-Checkpoint -Name 'packer-validate' -IntendedAction 'Validate the GCP Packer template without launching a VM.' -Command "packer validate -var project_id=$ProjectId -var zone=$Zone -var staging_archive_url=$stagingArchiveUrl $TemplateName"
  Invoke-LoggedCommand -Name 'packer-validate' -Command @('packer', 'validate', '-var', "project_id=$ProjectId", '-var', "zone=$Zone", '-var', "staging_archive_url=$stagingArchiveUrl", $TemplateName)

  if ($ValidateOnly) {
    Write-Host 'ValidateOnly was set; skipping packer build.'
    $BuildSucceeded = $true
    Write-Alert -Status 'VALIDATED' -Message 'GCP Packer template validated only; no Google Compute VM was launched.'
    return
  }

  $onError = if ($PreserveFailedBuildResources) { 'abort' } else { 'cleanup' }
  Write-Checkpoint -Name 'packer-build' -IntendedAction 'Build a Project Truth custom image on Google Compute.' -Command "packer build -on-error=$onError -var project_id=$ProjectId -var zone=$Zone -var staging_archive_url=$stagingArchiveUrl $TemplateName"
  Invoke-LoggedCommand -Name 'packer-build' -Command @('packer', 'build', "-on-error=$onError", '-var', "project_id=$ProjectId", '-var', "zone=$Zone", '-var', "staging_archive_url=$stagingArchiveUrl", $TemplateName)
  $BuildSucceeded = $true
  Write-Alert -Status 'SUCCEEDED' -Message 'Google Compute image build completed. Checking for leftover temporary build resources now.'
} finally {
  try {
    Remove-LeakedBuildResources
  } catch {
    Write-Warning "Automatic GCP build cleanup failed: $($_.Exception.Message)"
    Write-Alert -Status 'CLEANUP FAILED' -Message "Manual cleanup may be needed in project $ProjectId. Error: $($_.Exception.Message)"
  }

  if (-not $BuildSucceeded) {
    Write-Alert -Status 'FAILED OR INTERRUPTED' -Message 'GCP image build did not complete successfully. Temporary build resources were auto-cleaned where possible.'
  }

  Pop-Location
}
