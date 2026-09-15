param(
	[string]$ApiBase = "http://localhost:3001",
	[string]$Email = "admin@bandai.local",
	[string]$Password = "password123",
	[string]$AppCode = "bnpi-pats",
	[switch]$RestartIfStale
)

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$evidenceDir = Join-Path $repoRoot ".runtime\api-hotreload-check\$stamp"
New-Item -ItemType Directory -Force -Path $evidenceDir | Out-Null

function Invoke-PreviewCheck {
	param([string]$BaseUrl)

	$loginBody = @{
		email = $Email
		password = $Password
		appCode = $AppCode
	} | ConvertTo-Json

	$login = Invoke-RestMethod -Method Post "$BaseUrl/api/auth/login" -ContentType "application/json" -Body $loginBody
	$headers = @{ Authorization = "Bearer $($login.data.token)" }
	$preview = Invoke-RestMethod -Method Get "$BaseUrl/api/device/sync-preview?deviceId=all&source=all" -Headers $headers
	$preview | ConvertTo-Json -Depth 10 | Set-Content (Join-Path $evidenceDir "sync-preview.json")

	$rows = @($preview.data.devices)
	$hasPeerDriftField = $false
	if ($rows.Count -gt 0) {
		$hasPeerDriftField = $null -ne ($rows[0].PSObject.Properties["peerDriftTotalCount"])
	}

	return [pscustomobject]@{
		Rows = $rows
		HasPeerDriftField = $hasPeerDriftField
	}
}

$firstCheck = $null
try {
	$firstCheck = Invoke-PreviewCheck -BaseUrl $ApiBase
} catch {
	$firstCheck = [pscustomobject]@{
		Rows = @()
		HasPeerDriftField = $false
	}
}

if (-not $firstCheck.HasPeerDriftField -and $RestartIfStale) {
	Write-Host "[api-hotreload] Preview shape is stale. Restarting local bnpi-pats-api watcher..."
	& (Join-Path $repoRoot "scripts/restart-local-bnpi-pats-api-dev.ps1")
	Start-Sleep -Seconds 2
}

$finalCheck = Invoke-PreviewCheck -BaseUrl $ApiBase

$summary = [pscustomobject]@{
	apiBase = $ApiBase
	hasPeerDriftField = $finalCheck.HasPeerDriftField
	deviceCount = $finalCheck.Rows.Count
	evidenceDir = $evidenceDir
}
$summary | ConvertTo-Json -Depth 5 | Set-Content (Join-Path $evidenceDir "summary.json")

if (-not $finalCheck.HasPeerDriftField) {
	throw "Local sync-preview is still stale. Expected peerDriftTotalCount in response rows. Evidence: $evidenceDir"
}

Write-Host "[api-hotreload] sync-preview is fresh and exposes peerDriftTotalCount."
Write-Host "[api-hotreload] Evidence: $evidenceDir"
