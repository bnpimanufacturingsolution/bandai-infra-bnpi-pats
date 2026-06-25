[CmdletBinding()]
param(
    [string]$Project = "hris-492904",
    [string]$Region = "asia-southeast1",
    [string]$Zone = "asia-southeast1-a",
    [string]$Image = "project-truth-node-devcurrent-postinstall-20260618-020148",
    [string]$Bucket = "project-truth-image-export-hris-492904-161377059311",
    [string]$ObjectPrefix = "public/project-truth/hyperv/dev-current/latest",
    [string]$RunRoot = "",
    [int]$PollSeconds = 30,
    [int]$PollCount = 180
)

$ErrorActionPreference = "Stop"

function Write-Step {
    param([string]$Message)
    Write-Host ("{0} {1}" -f (Get-Date -Format "HH:mm:ss"), $Message)
}

function Find-Gcloud {
    $candidate = Get-Command gcloud.cmd -ErrorAction SilentlyContinue
    if ($candidate) {
        return $candidate.Source
    }
    $candidate = Get-Command gcloud -ErrorAction SilentlyContinue
    if ($candidate) {
        return $candidate.Source
    }
    throw "gcloud was not found on PATH."
}

if ([string]::IsNullOrWhiteSpace($RunRoot)) {
    $RunRoot = Join-Path ".runtime\gcp-vhdx-export" ("{0}-{1}" -f (Get-Date -Format "yyyyMMdd-HHmmss"), $Image)
}
if (-not [System.IO.Path]::IsPathRooted($RunRoot)) {
    $RunRoot = Join-Path (Get-Location).Path $RunRoot
}
$RunRoot = [System.IO.Path]::GetFullPath($RunRoot)
New-Item -ItemType Directory -Force -Path $RunRoot | Out-Null

$object = "$ObjectPrefix/$Image.vhdx"
$destination = "gs://$Bucket/$object"
$publicUrl = "https://storage.googleapis.com/$Bucket/$object"
$buildIdFile = Join-Path $RunRoot "cloudbuild-id.txt"
$statFile = Join-Path $RunRoot "gcp-exported-vhdx-stat.txt"

"destination=$destination`npublic_url=$publicUrl" | Set-Content (Join-Path $RunRoot "export-vars.txt")

Write-Step "Checking destination $destination"
$existing = $null
$existingExitCode = 1
try {
    $existing = & gsutil ls -l $destination 2>$null
    $existingExitCode = $LASTEXITCODE
} catch {
    $existing = $null
    $existingExitCode = 1
}
if ($existingExitCode -eq 0 -and $existing) {
    $existing | Tee-Object -FilePath $statFile
    Write-Step "Destination already exists"
    curl.exe -I --max-time 30 $publicUrl | Tee-Object -FilePath (Join-Path $RunRoot "public-vhdx-curl-head.txt")
    exit 0
}

$gcloud = Find-Gcloud
$outFile = Join-Path $RunRoot "gcloud-export-vhdx.out.txt"
$errFile = Join-Path $RunRoot "gcloud-export-vhdx.err.txt"
$args = @(
    "compute", "images", "export",
    "--project", $Project,
    "--image", $Image,
    "--destination-uri", $destination,
    "--export-format", "vhdx",
    "--zone", $Zone,
    "--timeout", "24h",
    "--quiet"
)

Write-Step "Starting Google Compute image export to VHDX"
$process = Start-Process -FilePath $gcloud -ArgumentList $args -NoNewWindow -PassThru -RedirectStandardOutput $outFile -RedirectStandardError $errFile

$buildId = $null
for ($i = 1; $i -le 60; $i++) {
    Start-Sleep -Seconds 5
    $text = ((Get-Content $outFile -ErrorAction SilentlyContinue) + (Get-Content $errFile -ErrorAction SilentlyContinue)) -join "`n"
    if ($text -match "/builds/([0-9a-f-]{36})") {
        $buildId = $matches[1]
        $buildId | Set-Content $buildIdFile
        Write-Step "Cloud Build ID: $buildId"
        break
    }
    if ($process.HasExited) {
        break
    }
}

if (-not $buildId) {
    throw "Could not discover Cloud Build ID. Check $outFile and $errFile."
}

for ($i = 1; $i -le $PollCount; $i++) {
    $status = & gcloud builds describe $buildId --project $Project --region $Region --format "value(status)"
    $objectStat = $null
    try {
        $objectStat = & gsutil ls -l $destination 2>$null
    } catch {
        $objectStat = $null
    }
    Write-Step "[$i/$PollCount] build=$status object=$($objectStat -replace '\s+', ' ')"
    if ($status -match "SUCCESS|FAILURE|CANCELLED|TIMEOUT|EXPIRED") {
        break
    }
    Start-Sleep -Seconds $PollSeconds
}

& gcloud builds describe $buildId --project $Project --region $Region --format json |
    Set-Content (Join-Path $RunRoot "cloudbuild-$buildId.json")

$finalStatus = & gcloud builds describe $buildId --project $Project --region $Region --format "value(status)"
if ($finalStatus -ne "SUCCESS") {
    throw "Export build ended with status $finalStatus"
}

& gsutil ls -l $destination | Tee-Object -FilePath $statFile
curl.exe -I --max-time 30 $publicUrl | Tee-Object -FilePath (Join-Path $RunRoot "public-vhdx-curl-head.txt")

Write-Host ""
Write-Host "PROVEN: Google Compute exported public Hyper-V VHDX"
Write-Host "GCS: $destination"
Write-Host "URL: $publicUrl"
