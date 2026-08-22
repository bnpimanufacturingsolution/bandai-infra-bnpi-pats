[CmdletBinding()]
param(
    [switch]$BuildApi,
    [switch]$SmokePost,
    [switch]$ContractOnly,
    [string]$ApiBaseUrl = "http://localhost:3001",
    [string]$DeviceIp = "10.184.38.10",
    [int]$DevicePort = 4370,
    [string]$EnrollNumber = "1"
)

$ErrorActionPreference = "Stop"

function Write-Step {
    param([string]$Message)
    Write-Host "`n==> $Message" -ForegroundColor Cyan
}

function Write-Pass {
    param([string]$Message)
    Write-Host "PASS $Message" -ForegroundColor Green
}

function Write-WarnLine {
    param([string]$Message)
    Write-Host "WARN $Message" -ForegroundColor Yellow
}

$root = Split-Path -Parent $PSScriptRoot
Push-Location $root
try {
    Write-Step "Docker engine mode"
    $dockerMode = docker info --format '{{.OSType}} {{.OperatingSystem}}'
    Write-Host $dockerMode
    if ($dockerMode -notmatch '^linux\b') {
        throw "Docker must be in Linux mode for the Project Truth ZKTeco Linux bridge."
    }
    Write-Pass "Docker is in Linux mode for HRIS API/app/Postgres and the ZKTeco Linux bridge."

    Write-Step "Compose config"
    docker compose -f .\appliance\docker-compose.yml config --quiet
    Write-Pass "Default compose file parses with the ZKTeco Linux bridge service."

    Write-Step "ZKTeco Linux bridge files"
    $requiredFiles = @(
        ".\vendor\zkteco-linux\Dockerfile",
        ".\vendor\zkteco-linux\zkteco_linux_probe\__main__.py",
        ".\vendor\zkteco-linux\requirements.txt"
    )
    foreach ($file in $requiredFiles) {
        if (-not (Test-Path -LiteralPath $file)) {
            throw "Missing required ZKTeco Linux bridge file: $file."
        }
    }
    Write-Pass "ZKTeco Linux bridge files exist."

    if ($BuildApi) {
        Write-Step "Build HRIS API image"
        docker compose -f .\appliance\docker-compose.yml build hris-api
        Write-Pass "HRIS API image builds with ZKTeco route included."
    }

    Write-Step "API health"
    try {
        $health = Invoke-RestMethod -Uri "$ApiBaseUrl/health" -Method Get -TimeoutSec 10
        Write-Host ($health | ConvertTo-Json -Depth 5)
        Write-Pass "API health responded."
    } catch {
        Write-WarnLine "API health did not respond at $ApiBaseUrl/health. Start the stack before live smoke: docker compose -f .\appliance\docker-compose.yml up -d postgres hris-api hris-app"
    }

    if ($SmokePost -or $ContractOnly) {
        Write-Step "Smoke post ZKTeco event"
        $body = @{
            device = @{
                type = "ZKTeco"
                ip = $DeviceIp
                port = $DevicePort
            }
            attendance = @{
                enrollNumber = $EnrollNumber
                userName = "Project Truth Smoke"
                timestamp = (Get-Date).ToString("yyyy-MM-ddTHH:mm:ss")
                verifyMethod = 1
                verifyMethodName = "Fingerprint"
                attState = 0
                attStateName = "Check In"
                isValid = $true
                workCode = 0
            }
            eventType = "AttendanceTransaction"
        } | ConvertTo-Json -Depth 8

        $response = Invoke-RestMethod `
            -Method Post `
            -Uri "$ApiBaseUrl/api/zkteco/events" `
            -ContentType "application/json" `
            -Body $body `
            -TimeoutSec 20

        Write-Host ($response | ConvertTo-Json -Depth 8)
        Write-Pass "Smoke post reached the HRIS ZKTeco webhook endpoint."

        if ($response.data.reason -eq "device_not_found") {
            Write-WarnLine "Contract accepted the payload, but no HRIS Device matched $DeviceIp`:$DevicePort."
        } elseif ($response.data.reason -eq "employee_not_found") {
            Write-WarnLine "Device matched, but no Employee.deviceEmpId matched enroll number $EnrollNumber."
        } elseif ($response.data.matched -eq $true) {
            if ($response.data.attendanceId) {
                Write-Pass "Device and Employee.deviceEmpId matched. ZKTeco punch projected into Attendance $($response.data.attendanceId) with action $($response.data.attendanceAction)."
            } else {
                Write-Pass "Device and Employee.deviceEmpId matched. Event was recorded without Attendance mutation."
            }
        }
    }

    Write-Step "Best finish state"
    Write-Host "Stop when API/app are healthy, the ZKTeco Linux bridge or mock posts reach $ApiBaseUrl/api/zkteco/events, and saved events show under /admin/devices/events?view=saved&source=ZKTECO_EVENT."
    Write-Host "Attendance truth note: ZKTeco ingestion records DeviceEvent evidence only. It must not create/update Attendance, AttendanceObligation, timesheets, or payroll unless a separate tested applicator is deliberately enabled."
} finally {
    Pop-Location
}
