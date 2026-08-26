param(
	[string]$ApiBase = "http://localhost:3001",
	[string]$AppBase = "http://localhost:5175",
	[string]$Email = "admin@bandai.local",
	[string]$Password = "password123",
	[string]$AppCode = "hris",
	[string]$SourceDeviceId = "cmrht5s2w00ei7zgsre8y3o5n",
	[string]$TargetDeviceId = "cmpxw13hx002h7zwso7dyedrn",
	[string]$VendorUserId = "6",
	[int]$SyntheticFaceCount = 2,
	[double]$MaxSeconds = 5,
	[switch]$SkipPlaywright
)

$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$evidenceDir = Join-Path $root ".runtime\hikvision-device-user-proof-$stamp"
New-Item -ItemType Directory -Force -Path $evidenceDir | Out-Null

function Write-JsonFile {
	param(
		[string]$Path,
		[Parameter(ValueFromPipeline = $true)]$InputObject
	)

	process {
		$InputObject | ConvertTo-Json -Depth 20 | Set-Content -LiteralPath $Path -Encoding UTF8
	}
}

$loginBody = @{
	email = $Email
	password = $Password
	appCode = $AppCode
} | ConvertTo-Json

$login = Invoke-RestMethod -Method Post "$ApiBase/api/auth/login" -ContentType "application/json" -Body $loginBody
$headers = @{ Authorization = "Bearer $($login.data.token)" }

[pscustomobject]@{
	email = $login.data.email
	role = $login.data.role
	organizationId = $login.data.organizationId
	loginAt = Get-Date
} | Write-JsonFile (Join-Path $evidenceDir "login-summary.json")

$previewBefore = Invoke-RestMethod -Method Get "$ApiBase/api/device/sync-preview" -Headers $headers
$previewBefore | Write-JsonFile (Join-Path $evidenceDir "sync-preview-before.json")

$sourceUsersBefore = Invoke-RestMethod -Method Get "$ApiBase/api/device/$SourceDeviceId/users?limit=50&page=1" -Headers $headers
$targetUsersBefore = Invoke-RestMethod -Method Get "$ApiBase/api/device/$TargetDeviceId/users?limit=50&page=1" -Headers $headers
$sourceUsersBefore | Write-JsonFile (Join-Path $evidenceDir "source-users-before.json")
$targetUsersBefore | Write-JsonFile (Join-Path $evidenceDir "target-users-before.json")

$clearTargetFaceBody = @{
	deviceId = $TargetDeviceId
	vendorUserId = $VendorUserId
	faceCount = 0
} | ConvertTo-Json
$clearTargetFace = Invoke-RestMethod -Method Post "$ApiBase/api/device/hikvision/mock-face" -Headers $headers -ContentType "application/json" -Body $clearTargetFaceBody
$clearTargetFace | Write-JsonFile (Join-Path $evidenceDir "target-clear-mock-face.json")

$applySourceFaceBody = @{
	deviceId = $SourceDeviceId
	vendorUserId = $VendorUserId
	faceCount = $SyntheticFaceCount
} | ConvertTo-Json
$applySourceFace = Invoke-RestMethod -Method Post "$ApiBase/api/device/hikvision/mock-face" -Headers $headers -ContentType "application/json" -Body $applySourceFaceBody
$applySourceFace | Write-JsonFile (Join-Path $evidenceDir "source-apply-mock-face.json")

$copyBody = @{
	sourceDeviceId = $SourceDeviceId
	targetDeviceId = $TargetDeviceId
	employeeNo = $VendorUserId
	includeFingerprints = $true
} | ConvertTo-Json

$copyElapsed = Measure-Command {
	$copyResult = Invoke-RestMethod -Method Post "$ApiBase/api/device/hikvision/copy-user" -Headers $headers -ContentType "application/json" -Body $copyBody
}
$copyResult | Write-JsonFile (Join-Path $evidenceDir "copy-user-result.json")
[pscustomobject]@{
	totalSeconds = [math]::Round($copyElapsed.TotalSeconds, 3)
	maxSeconds = $MaxSeconds
	passed = ($copyElapsed.TotalSeconds -le $MaxSeconds)
} | Write-JsonFile (Join-Path $evidenceDir "copy-user-timing.json")

$targetUsersAfter = Invoke-RestMethod -Method Get "$ApiBase/api/device/$TargetDeviceId/users?limit=50&page=1" -Headers $headers
$previewAfter = Invoke-RestMethod -Method Get "$ApiBase/api/device/sync-preview" -Headers $headers
$targetUsersAfter | Write-JsonFile (Join-Path $evidenceDir "target-users-after.json")
$previewAfter | Write-JsonFile (Join-Path $evidenceDir "sync-preview-after.json")

$targetRow = @($targetUsersAfter.data.deviceUsers) | Where-Object { "$($_.vendorUserId)" -eq $VendorUserId } | Select-Object -First 1
if (-not $targetRow) {
	throw "Target vendor user $VendorUserId was not found after copy"
}

$syntheticSummary = $targetRow.rawPayload._hrisDeviceMetadata.syntheticCredentialSummary
$actualSyntheticFaceCount = 0
if ($null -ne $syntheticSummary -and $null -ne $syntheticSummary.faceCount) {
	$actualSyntheticFaceCount = [int]$syntheticSummary.faceCount
}
if ($actualSyntheticFaceCount -lt $SyntheticFaceCount) {
	throw "Synthetic face tally verification failed for vendor user $VendorUserId. Expected at least $SyntheticFaceCount, got $actualSyntheticFaceCount."
}
if ($copyElapsed.TotalSeconds -gt $MaxSeconds) {
	throw "copy-user endpoint exceeded $MaxSeconds seconds: $([math]::Round($copyElapsed.TotalSeconds, 3))s"
}

if (-not $SkipPlaywright) {
	$env:PT_ROOT = $root
	$env:PT_BASE_URL = $AppBase
	$env:PT_AUTH_TOKEN = "$($login.data.token)"
	$env:PT_DEVICE_ID = $TargetDeviceId
	$env:PT_VENDOR_USER_ID = $VendorUserId
	$env:PT_EXPECTED_SYNTHETIC_FACE_COUNT = [string]$SyntheticFaceCount
	$env:PT_EVIDENCE_DIR = $evidenceDir
	node (Join-Path $root "scripts\hikvision-device-user-proof.cjs")
	if ($LASTEXITCODE -ne 0) {
		throw "Playwright verification failed with exit code $LASTEXITCODE"
	}
	$playwrightCaptured = $true
} else {
	$playwrightCaptured = $false
}

[pscustomobject]@{
	evidenceDir = $evidenceDir
	sourceDeviceId = $SourceDeviceId
	targetDeviceId = $TargetDeviceId
	vendorUserId = $VendorUserId
	copySeconds = [math]::Round($copyElapsed.TotalSeconds, 3)
	syntheticFaceCount = $actualSyntheticFaceCount
	playwrightCaptured = $playwrightCaptured
} | Write-JsonFile (Join-Path $evidenceDir "summary.json")

Write-Output "Evidence saved to $evidenceDir"
