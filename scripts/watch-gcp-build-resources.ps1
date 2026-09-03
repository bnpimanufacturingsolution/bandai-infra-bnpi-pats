param(
  [string]$ProjectId = 'hris-492904',
  [int]$MaxRunningMinutes = 30,
  [switch]$StopLeakedBuildVms,
  [switch]$SkipAlert,
  [string]$LogDir = (Join-Path (Split-Path -Parent $PSScriptRoot) '.runtime\gcp-build-guard')
)

$ErrorActionPreference = 'Stop'

if (-not [System.IO.Path]::IsPathRooted($LogDir)) {
  $LogDir = Join-Path (Get-Location).Path $LogDir
}
$LogDir = [System.IO.Path]::GetFullPath($LogDir)
New-Item -ItemType Directory -Force -Path $LogDir | Out-Null

function Write-GuardAlert {
  param(
    [string]$Status,
    [string]$Message
  )

  $path = Join-Path $LogDir ("guard-alert-{0}.txt" -f (Get-Date -Format 'yyyyMMdd-HHmmss'))
  @"
Timestamp: $(Get-Date -Format o)
Status: $Status
Project: $ProjectId
Message: $Message
"@ | Set-Content -LiteralPath $path -Encoding UTF8

  Write-Host "PROJECT TRUTH GCP GUARD: $Status"
  Write-Host $Message
  Write-Host "Alert file: $path"

  if ($SkipAlert) {
    return
  }

  if (Get-Command New-BurntToastNotification -ErrorAction SilentlyContinue) {
    New-BurntToastNotification -Text "Project Truth GCP guard: $Status", $Message | Out-Null
    return
  }

  if (Get-Command msg.exe -ErrorAction SilentlyContinue) {
    & msg.exe $env:USERNAME "Project Truth GCP guard: $Status - $Message" 2>$null | Out-Null
    return
  }

  [console]::Beep(900, 250)
}

if (-not (Get-Command gcloud -ErrorAction SilentlyContinue)) {
  Write-GuardAlert -Status 'GCLOUD MISSING' -Message 'Google Cloud SDK was not found; cannot inspect Compute Engine build resources.'
  exit 1
}

$rows = & gcloud compute instances list `
  --project $ProjectId `
  --format 'csv[no-heading](name,zone.basename(),status,creationTimestamp,labels.app,labels.purpose)' 2>$null

$running = @($rows | Where-Object {
  if ([string]::IsNullOrWhiteSpace($_)) {
    $false
  } else {
    $parts = $_.Split(',')
    $parts.Length -ge 6 -and
      $parts[2].Trim() -eq 'RUNNING' -and
      (
        $parts[0].Trim() -like 'project-truth-node-gcp-build-*' -or
        ($parts[4].Trim() -eq 'project-truth' -and $parts[5].Trim() -eq 'packer-image-build')
      )
  }
})
if ($running.Count -eq 0) {
  "Timestamp: $(Get-Date -Format o)`nStatus: OK`nMessage: No running Project Truth GCP build VMs found." |
    Set-Content -LiteralPath (Join-Path $LogDir 'last-ok.txt') -Encoding UTF8
  exit 0
}

$now = Get-Date
foreach ($row in $running) {
  $parts = $row.Split(',')
  if ($parts.Length -lt 4) {
    continue
  }

  $name = $parts[0].Trim()
  $zone = $parts[1].Trim()
  $createdAt = [datetime]::Parse($parts[3].Trim())
  $ageMinutes = [math]::Round(($now - $createdAt).TotalMinutes, 1)
  $message = "Running build VM found: $name in $zone, age ${ageMinutes}m."

  if ($StopLeakedBuildVms -and $ageMinutes -ge $MaxRunningMinutes) {
    & gcloud compute instances stop $name --project $ProjectId --zone $zone --quiet | Out-Host
    Write-GuardAlert -Status 'STOPPED LEAKED BUILD VM' -Message "$message It exceeded ${MaxRunningMinutes}m and was stopped."
  } else {
    Write-GuardAlert -Status 'RUNNING BUILD VM' -Message "$message Use -StopLeakedBuildVms to auto-stop build VMs older than ${MaxRunningMinutes}m."
  }
}
