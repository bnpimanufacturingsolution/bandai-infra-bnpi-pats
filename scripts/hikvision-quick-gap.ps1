param(
	[ValidateSet("preview", "real-user-gap", "mock-face", "clear-mock-face", "delete-user")]
	[string]$Mode = "preview",
	[string]$ApiBase = "http://localhost:3001",
	[string]$Email = "admin@bandai.local",
	[string]$Password = "password123",
	[string]$AppCode = "hris",
	[string]$SourceDevice = "Main Entrance Device A",
	[string]$VendorUserId = "",
	[int]$FaceCount = 1,
	[switch]$RestartApiIfStale,
	[switch]$SyncSourceToHris,
	[switch]$DeleteFromAllDevices
)

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot

function Invoke-ApiLogin {
	$loginBody = @{
		email = $Email
		password = $Password
		appCode = $AppCode
	} | ConvertTo-Json
	return Invoke-RestMethod -Method Post "$ApiBase/api/auth/login" -ContentType "application/json" -Body $loginBody
}

function Get-ApiHeaders {
	$login = Invoke-ApiLogin
	return @{ Authorization = "Bearer $($login.data.token)" }
}

function Get-HikvisionDevices {
	param([hashtable]$Headers)
	$response = Invoke-RestMethod -Method Get "$ApiBase/api/device?page=1&limit=50&document=true" -Headers $Headers
	return @($response.data.devices) | Where-Object { [string]$_.config.vendor -eq "Hikvision" }
}

function Resolve-Device {
	param(
		[array]$Devices,
		[string]$Needle
	)
	$trimmed = [string]$Needle
	if ([string]::IsNullOrWhiteSpace($trimmed)) {
		throw "Device selector is required."
	}
	$matches = @($Devices | Where-Object {
		$_.id -eq $trimmed -or
		$_.name -like "*$trimmed*" -or
		$_.address -eq $trimmed
	})
	if ($matches.Count -eq 0) {
		throw "No Hikvision device matched '$trimmed'."
	}
	if ($matches.Count -gt 1) {
		throw "Multiple Hikvision devices matched '$trimmed'. Use an exact id, name, or address."
	}
	return $matches[0]
}

function Invoke-DeviceDigestRequest {
	param(
		[pscustomobject]$Device,
		[string]$Method,
		[string]$Path,
		[string]$JsonBody
	)
	$protocol = [string]$Device.protocol
	if ([string]::IsNullOrWhiteSpace($protocol)) {
		$protocol = "https"
	}
	$address = [string]$Device.address
	$port = [int]$Device.port
	$username = [string]$Device.access.username
	$password = [string]$Device.access.password
	$url = "{0}://{1}:{2}{3}" -f $protocol, $address, $port, $Path
	$tmpBody = Join-Path $env:TEMP ("hikvision-gap-{0}.json" -f ([guid]::NewGuid().ToString("N")))
	try {
		Set-Content -Path $tmpBody -Value $JsonBody -NoNewline
		$output = & curl.exe --digest -u "$username`:$password" -k -sS -H "Content-Type: application/json" -X $Method --data-binary "@$tmpBody" $url
		return $output
	} finally {
		Remove-Item $tmpBody -Force -ErrorAction SilentlyContinue
	}
}

function Get-SyncPreview {
	param([hashtable]$Headers)
	$response = Invoke-RestMethod -Method Get "$ApiBase/api/device/sync-preview?deviceId=all&source=all" -Headers $Headers
	return @($response.data.devices)
}

function Show-PreviewTable {
	param([array]$Rows)
	$Rows |
		Select-Object name, vendorUserCount, hrisUserCount, peerDriftTotalCount, openUserCount |
		Format-Table -AutoSize
}

if ($RestartApiIfStale) {
	& (Join-Path $repoRoot "scripts/ensure-local-hris-api-hotreload.ps1") -ApiBase $ApiBase -RestartIfStale
}

$headers = Get-ApiHeaders
$devices = Get-HikvisionDevices -Headers $headers
$source = Resolve-Device -Devices $devices -Needle $SourceDevice

if ([string]::IsNullOrWhiteSpace($VendorUserId) -and $Mode -ne "preview") {
	$VendorUserId = [string](9000 + (Get-Random -Minimum 10 -Maximum 989))
}

if ($Mode -eq "real-user-gap") {
	$payload = @{
		UserInfo = @{
			employeeNo = $VendorUserId
			name = "quick-gap-$VendorUserId"
			userType = "normal"
			Valid = @{
				enable = $true
				beginTime = "2026-07-13T00:00:00"
				endTime = "2036-07-12T23:59:59"
				timeType = "local"
			}
			doorRight = "1"
			RightPlan = @(@{
				doorNo = 1
				planTemplateNo = "1"
			})
			gender = "unknown"
			localUIRight = $false
			numOfCard = 0
			numOfFace = 0
			numOfFP = 0
			password = ""
		}
	} | ConvertTo-Json -Depth 8 -Compress
	$result = Invoke-DeviceDigestRequest -Device $source -Method "PUT" -Path "/ISAPI/AccessControl/UserInfo/SetUp?format=json" -JsonBody $payload
	Write-Host "[hikvision-gap] Created real user $VendorUserId on $($source.name)"
	Write-Host $result
}

if ($Mode -eq "mock-face" -or $Mode -eq "clear-mock-face") {
	if ($SyncSourceToHris) {
		Invoke-RestMethod -Method Post "$ApiBase/api/device/$($source.id)/users/sync" -Headers $headers -ContentType "application/json" -Body (@{} | ConvertTo-Json) | Out-Null
	}
	$facePayload = @{
		deviceId = $source.id
		vendorUserId = $VendorUserId
		faceCount = $(if ($Mode -eq "clear-mock-face") { 0 } else { $FaceCount })
	} | ConvertTo-Json
	$result = Invoke-RestMethod -Method Post "$ApiBase/api/device/hikvision/mock-face" -Headers $headers -ContentType "application/json" -Body $facePayload
	Write-Host "[hikvision-gap] Mock-face updated for $VendorUserId on $($source.name)"
	$result | ConvertTo-Json -Depth 8
}

if ($Mode -eq "delete-user") {
	$targets = if ($DeleteFromAllDevices) { $devices } else { @($source) }
	$deleteBody = @{
		UserInfoDetail = @{
			mode = "byEmployeeNo"
			EmployeeNoList = @(@{ employeeNo = $VendorUserId })
		}
	} | ConvertTo-Json -Depth 6 -Compress
	foreach ($target in $targets) {
		$result = Invoke-DeviceDigestRequest -Device $target -Method "POST" -Path "/ISAPI/AccessControl/UserInfoDetail/Delete?format=json" -JsonBody $deleteBody
		Write-Host "[hikvision-gap] Delete request for $VendorUserId on $($target.name)"
		Write-Host $result
	}
}

$previewRows = Get-SyncPreview -Headers $headers
Show-PreviewTable -Rows $previewRows

if ($Mode -ne "preview") {
	Write-Host "[hikvision-gap] VendorUserId: $VendorUserId"
}
