[CmdletBinding()]
param(
    [switch]$BuildApi,
    [switch]$SmokePost,
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
        Write-WarnLine "Docker is not in Linux mode. Run HRIS Linux services before using the Windows-container ZKTeco profile."
    } else {
        Write-Pass "Docker is in Linux mode for HRIS API/app/Postgres."
    }

    Write-Step "Compose config"
    docker compose -f .\appliance\docker-compose.yml config --quiet
    docker compose -f .\appliance\docker-compose.yml --profile zkteco config --quiet
    Write-Pass "Default and zkteco profile compose files parse."

    Write-Step "ZKTeco SDK bridge files"
    $requiredFiles = @(
        ".\vendor\zkteco-sdk\Program.cs",
        ".\vendor\zkteco-sdk\Interop.zkemkeeper.dll",
        ".\vendor\zkteco-sdk\Dockerfile.windows"
    )
    foreach ($file in $requiredFiles) {
        if (-not (Test-Path -LiteralPath $file)) {
            throw "Missing required bridge file: $file"
        }
    }
    Write-Pass "SDK bridge files exist."

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

    if ($SmokePost) {
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
        Write-Pass "Smoke post reached the ZKTeco bridge endpoint."
    }

    Write-Step "Best finish state"
    Write-Host "Stop when API/app are healthy, the Windows bridge is posting to $ApiBaseUrl/api/zkteco/events, and saved events show under /admin/devices/events?view=saved&source=ZKTECO_EVENT."
} finally {
    Pop-Location
}
