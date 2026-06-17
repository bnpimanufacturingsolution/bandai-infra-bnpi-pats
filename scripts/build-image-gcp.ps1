param(
  [string]$PackerDir = (Join-Path (Split-Path -Parent $PSScriptRoot) 'image-factory\packer'),
  [string]$RuntimeDir = (Join-Path (Split-Path -Parent $PSScriptRoot) '.runtime\gcp-image-build'),
  [string]$TemplateName = 'ubuntu-googlecompute.pkr.hcl',
  [string]$ProjectId = 'hris-492904',
  [string]$Zone = 'asia-southeast1-a',
  [switch]$ValidateOnly,
  [switch]$SkipStage
)

$ErrorActionPreference = 'Stop'

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
Safety: This script does not delete VM, disk, image, bucket, cache, or output resources. Packer build uses -on-error=abort to preserve cloud build resources for inspection on failure.
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

if (-not (Get-Command packer -ErrorAction SilentlyContinue)) {
  throw 'packer not found in PATH. Install HashiCorp Packer before building the Project Truth image.'
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
}

Push-Location $PackerDir
try {
  Write-Checkpoint -Name 'packer-init' -IntendedAction 'Install or verify required Packer plugins.' -Command "packer init $TemplateName"
  Invoke-LoggedCommand -Name 'packer-init' -Command @('packer', 'init', $TemplateName)

  Write-Checkpoint -Name 'packer-validate' -IntendedAction 'Validate the GCP Packer template without launching a VM.' -Command "packer validate -var project_id=$ProjectId -var zone=$Zone $TemplateName"
  Invoke-LoggedCommand -Name 'packer-validate' -Command @('packer', 'validate', '-var', "project_id=$ProjectId", '-var', "zone=$Zone", $TemplateName)

  if ($ValidateOnly) {
    Write-Host 'ValidateOnly was set; skipping packer build.'
    return
  }

  Write-Checkpoint -Name 'packer-build' -IntendedAction 'Build a Project Truth custom image on Google Compute.' -Command "packer build -on-error=abort -var project_id=$ProjectId -var zone=$Zone $TemplateName"
  Invoke-LoggedCommand -Name 'packer-build' -Command @('packer', 'build', '-on-error=abort', '-var', "project_id=$ProjectId", '-var', "zone=$Zone", $TemplateName)
} finally {
  Pop-Location
}
