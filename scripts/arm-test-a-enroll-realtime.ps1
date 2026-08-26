<#
.SYNOPSIS
  Arm TEST A for live create/enroll proof against local HRIS API (:3001) + Device Events UI.

.DESCRIPTION
  1) Ensures API health + admin login
  2) Ensures a stay-on-device demo person exists (or creates one via journey proof)
  3) Starts a fast logSearch poller that imports USER_CREATED / FINGERPRINT_ENROLLED
     into local Device Events (so socket UI updates without waiting for VM SDK arm)
  4) Prints the exact browser URL and what to do on the terminal

  Why: VM SDK listener may be "running" but not armed / posting to local :3001.
  This local poller closes the gap for operator enroll proof on host-local UI.

.EXAMPLE
  powershell -File scripts/arm-test-a-enroll-realtime.ps1
  powershell -File scripts/arm-test-a-enroll-realtime.ps1 -Minutes 20 -EmployeeNo t18stay63721
#>
[CmdletBinding()]
param(
	[string]$DeviceId = "cmrlgqsjv000oob01165tbd8n",
	[string]$ApiBase = "http://localhost:3001",
	[string]$AppBase = "http://localhost:5175",
	[string]$EmployeeNo = "",
	[int]$Minutes = 15,
	[int]$PollSeconds = 3,
	[string]$Email = "admin@bandai.local",
	[string]$Password = "password123"
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
if (-not (Test-Path (Join-Path $root "hris-api"))) { $root = Get-Location }
Set-Location $root

$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$outDir = Join-Path $root ".runtime\enroll-realtime-arm-$stamp"
New-Item -ItemType Directory -Force -Path $outDir | Out-Null

function Write-Step($msg) { Write-Host "[arm] $msg" -ForegroundColor Cyan }
function Write-Ok($msg) { Write-Host "[ok]  $msg" -ForegroundColor Green }
function Write-Warn($msg) { Write-Host "[!!]  $msg" -ForegroundColor Yellow }

Write-Step "Checking API $ApiBase/health"
$healthy = $false
for ($i = 0; $i -lt 30; $i++) {
	try {
		$h = Invoke-RestMethod -Uri "$ApiBase/health" -TimeoutSec 3
		if ($h.status -eq "healthy") { $healthy = $true; break }
	} catch { Start-Sleep -Seconds 2 }
}
if (-not $healthy) {
	Write-Warn "API not healthy — attempting restart-local-hris-api-dev.ps1"
	& powershell -NoProfile -File (Join-Path $root "scripts\restart-local-hris-api-dev.ps1") -WaitSeconds 90
	$h = Invoke-RestMethod -Uri "$ApiBase/health" -TimeoutSec 8
	if ($h.status -ne "healthy") { throw "API still not healthy after restart" }
}
Write-Ok "API healthy"

$loginBody = @{ email = $Email; password = $Password; appCode = "hris" } | ConvertTo-Json
$login = Invoke-RestMethod -Method Post "$ApiBase/api/auth/login" -ContentType "application/json" -Body $loginBody -TimeoutSec 20
$token = $login.data.token
if (-not $token) { throw "Login failed" }
$headers = @{ Authorization = "Bearer $token" }
Write-Ok "Logged in as $Email"

# Listener status (informational)
try {
	$ls = Invoke-RestMethod -Method Get "$ApiBase/api/device/hikvision/listener" -Headers $headers -TimeoutSec 45
	$armed = [bool]$ls.data.sdk.armed
	$receiving = [bool]$ls.data.sdk.receivingCallbacks
	$running = [bool]$ls.data.running
	Write-Step "VM SDK listener running=$running armed=$armed receiving=$receiving lastAlarm=$($ls.data.sdk.lastAlarmAt)"
	$ls | ConvertTo-Json -Depth 6 | Set-Content (Join-Path $outDir "listener-status.json") -Encoding utf8
	if (-not $armed) {
		Write-Warn "SDK listener is NOT armed. Realtime for physical enroll will use local logSearch poller (reliable for this host UI)."
		try {
			$restart = Invoke-RestMethod -Method Post "$ApiBase/api/device/hikvision/listener" -Headers $headers -ContentType "application/json" -Body (@{ action = "restart" } | ConvertTo-Json) -TimeoutSec 90
			$restart | ConvertTo-Json -Depth 4 | Set-Content (Join-Path $outDir "listener-restart.json") -Encoding utf8
			Write-Step "Requested listener restart (must post VM :53001 -> host :3001 for socket truth)."
		} catch {
			Write-Warn "Listener restart failed: $($_.Exception.Message)"
		}
	}
} catch {
	Write-Warn "Listener status unavailable: $($_.Exception.Message)"
}

# Resolve / create demo employeeNo
if (-not $EmployeeNo) {
	# Prefer existing stay user
	try {
		$usersUrl = $ApiBase + '/api/device/' + $DeviceId + '/users?query=t18stay' + [char]38 + 'limit=10'
		$search = Invoke-RestMethod -Method Get -Uri $usersUrl -Headers $headers -TimeoutSec 60
		$hit = @($search.data.deviceUsers) | Where-Object { $_.vendorUserId -like "t18stay*" } | Select-Object -First 1
		if ($hit) { $EmployeeNo = [string]$hit.vendorUserId }
	} catch {}
}
if (-not $EmployeeNo) {
	Write-Step "No stay user in inventory — running create journey proof (UserInfo/Record + token map + DeviceUser)"
	$env:PROOF_DEVICE_ID = $DeviceId
	# Prefer tunnel URL if API uses remote DB; journey script uses process env DATABASE_URL from hris-api/.env
	if (Test-Path (Join-Path $root "hris-api\.env")) {
		$line = (Select-String -Path (Join-Path $root "hris-api\.env") -Pattern '^DATABASE_URL=' | Select-Object -First 1).Line
		if ($line) {
			$env:DATABASE_URL = $line.Substring("DATABASE_URL=".Length).Trim().Trim('"')
			$env:FORCE_DATABASE_URL = $env:DATABASE_URL
		}
	}
	# also try local tunnel
	try {
		$tcp = New-Object System.Net.Sockets.TcpClient
		$iar = $tcp.BeginConnect("127.0.0.1", 55435, $null, $null)
		$ok = $iar.AsyncWaitHandle.WaitOne(400)
		if ($ok -and $tcp.Connected) {
			$env:FORCE_DATABASE_URL = "postgresql://postgres:postgres@127.0.0.1:55435/hris?schema=public"
			$env:DATABASE_URL = $env:FORCE_DATABASE_URL
		}
		$tcp.Close()
	} catch {}
	npx --yes tsx (Join-Path $root "scripts\device-user-enroll-journey-proof.mjs") 2>&1 |
		Tee-Object -FilePath (Join-Path $outDir "create-journey.log") |
		Select-Object -Last 40
	$proof = Get-ChildItem (Join-Path $root ".runtime") -Directory -Filter "device-user-enroll-journey-*" |
		Sort-Object LastWriteTime -Descending | Select-Object -First 1
	if ($proof) {
		$jp = Join-Path $proof.FullName "journey-proof.json"
		if (Test-Path $jp) {
			$j = Get-Content $jp -Raw | ConvertFrom-Json
			$EmployeeNo = [string]$j.demo.emp
			Copy-Item $jp (Join-Path $outDir "journey-proof.json") -Force
		}
	}
}
if (-not $EmployeeNo) { throw "Could not resolve a demo employeeNo to enroll against" }
Write-Ok "Demo person: $EmployeeNo (device inventory, NOT HRIS Employee)"

$eventsUrl = "$AppBase/admin/configuration/devices/events?view=saved&deviceId=$DeviceId&eventAction=USER_CREATED"
$eventsAllUrl = "$AppBase/admin/configuration/devices/events?view=saved&deviceId=$DeviceId"
$fpUrl = "$AppBase/admin/configuration/devices/events?view=saved&deviceId=$DeviceId&eventAction=FINGERPRINT_ENROLLED"
$syncUrl = "$AppBase/admin/configuration/devices?action=device-users&deviceId=$DeviceId&syncPanel=users&deviceUserView=hris&deviceUserSearch=$([uri]::EscapeDataString($EmployeeNo))"

# Snapshot baseline event count (re-login if token expired during listener probe)
$baselineNote = "events_baseline=unknown"
try {
	$eventsProbeUrl = $ApiBase + '/api/device/events?deviceId=' + $DeviceId + [char]38 + 'limit=1'
	$baseEv = Invoke-RestMethod -Method Get -Uri $eventsProbeUrl -Headers $headers -TimeoutSec 30
	$baselineNote = "events_sample_employee=$($baseEv.data.events[0].employeeNo)"
} catch {
	Write-Warn "Events probe failed; re-login and retry. $($_.Exception.Message)"
	$login = Invoke-RestMethod -Method Post "$ApiBase/api/auth/login" -ContentType "application/json" -Body $loginBody -TimeoutSec 20
	$token = $login.data.token
	if (-not $token) { throw "Re-login failed" }
	$headers = @{ Authorization = "Bearer $token" }
	$eventsProbeUrl = $ApiBase + '/api/device/events?deviceId=' + $DeviceId + [char]38 + 'limit=1'
	$baseEv = Invoke-RestMethod -Method Get -Uri $eventsProbeUrl -Headers $headers -TimeoutSec 30
	$baselineNote = "events_sample_employee=$($baseEv.data.events[0].employeeNo)"
}

# Start background poller
$pollerScript = Join-Path $root "scripts\watch-test-a-enroll-logsearch.mjs"
if (-not (Test-Path $pollerScript)) {
	throw "Missing $pollerScript"
}
Write-Step "Starting local logSearch poller for $Minutes min (every ${PollSeconds}s) → saves USER_CREATED / FINGERPRINT_ENROLLED to local API DB"
$env:ENROLL_WATCH_DEVICE_ID = $DeviceId
$env:ENROLL_WATCH_MINUTES = "$Minutes"
$env:ENROLL_WATCH_POLL_MS = "$([Math]::Max(1000, $PollSeconds * 1000))"
$env:ENROLL_WATCH_OUT_DIR = $outDir
$env:ENROLL_WATCH_API_BASE = $ApiBase
$env:ENROLL_WATCH_TOKEN = $token
$env:ENROLL_WATCH_EMPLOYEE_HINT = $EmployeeNo

$pollerLog = Join-Path $outDir "poller.log"
$poller = Start-Process -FilePath "npx.cmd" -ArgumentList @("--yes","tsx",$pollerScript) `
	-WorkingDirectory $root -PassThru -WindowStyle Minimized `
	-RedirectStandardOutput $pollerLog -RedirectStandardError (Join-Path $outDir "poller.err.log")

$guide = @"
============================================================
TEST A ENROLL REALTIME — ARMED
============================================================
DeviceId:     $DeviceId (TEST A)
Demo person:  $EmployeeNo
Evidence:     $outDir
Poller PID:   $($poller.Id)  (logSearch → local DeviceEvent every ${PollSeconds}s for $Minutes min)
$baselineNote

OPEN THESE (after login as admin@bandai.local / password123):
  Device Events (all):
    $eventsAllUrl
  USER_CREATED filter:
    $eventsUrl
  FINGERPRINT_ENROLLED filter:
    $fpUrl
  Device user inventory (HRIS view for this person):
    $syncUrl

WHAT TO DO ON THE PHYSICAL TERMINAL (TEST A / 192.168.254.189):
  1) Log in as device admin (or use existing operator menu).
  2) User Management → Add / Edit person
     - Person ID / Employee No: $EmployeeNo  (or create a NEW plain no like t18liveXXXX)
     - Save person  → expect USER_CREATED in Device Events within ~${PollSeconds}-10s
  3) For fingerprint:
     - Select that person → Fingerprint enroll → place finger
     - Expect FINGERPRINT_ENROLLED within ~${PollSeconds}-10s (if device emits addFpByEmployeeNo log)
  4) Leave Device Events page open — socket + poller refresh show new rows fast.

IMPORTANT TRUTH:
  - SDK VM listener may be idle/not armed to host :3001. This arming uses LOCAL logSearch poller
    so host UI on $AppBase still gets events without waiting for SDK arm.
  - Opaque historical FP rows stay unresolved without a write-time map — NEW enrolls after map
    for a known plain employeeNo will resolve when capture succeeds.
  - Device user click must use deviceUserView=hris (sync URL above). Live Device(ISAPI) search
    is empty if the person was deleted off the terminal.

STOP POLLER:
  Stop-Process -Id $($poller.Id) -Force
============================================================
"@
$guide | Set-Content (Join-Path $outDir "OPERATOR-GUIDE.txt") -Encoding utf8
Write-Host $guide -ForegroundColor White

# Try open browser
try {
	Start-Process $eventsAllUrl
} catch {}

@{
	deviceId = $DeviceId
	employeeNo = $EmployeeNo
	pollerPid = $poller.Id
	outDir = $outDir
	eventsUrl = $eventsAllUrl
	syncUrl = $syncUrl
	minutes = $Minutes
} | ConvertTo-Json | Set-Content (Join-Path $outDir "arm-summary.json") -Encoding utf8

Write-Ok "Armed. Enroll on the terminal now. Watch Device Events."
