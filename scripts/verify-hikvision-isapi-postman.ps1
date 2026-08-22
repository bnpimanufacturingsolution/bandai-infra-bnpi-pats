param(
    [string]$DeviceHost = "192.168.254.102",
    [string]$Username = "admin",
    [string]$Password = "@1bislangmalakas",
    [string]$EmployeeNo = "15",
    [string]$CallbackHost = "127.0.0.1",
    [int]$CallbackPort = 53001,
    [string]$CallbackPath = "/api/hikvision/callback",
    [switch]$TestHttpHostPut
)

$ErrorActionPreference = "Stop"

function New-SafeName([string]$Value) {
    $safe = $Value -replace '[^A-Za-z0-9_.-]+', '-'
    $safe.Trim('-')
}

function Get-HeaderValue([string]$Headers, [string]$Name) {
    foreach ($line in ($Headers -split "`r?`n")) {
        if ($line -match ("^" + [regex]::Escape($Name) + ":\s*(.+)$")) {
            return $Matches[1].Trim()
        }
    }
    return ""
}

function Invoke-IsapiRequest {
    param(
        [string]$Name,
        [string]$BaseUrl,
        [string]$Method,
        [string]$Path,
        [string]$Body = "",
        [string]$ContentType = "application/json",
        [int]$TimeoutSeconds = 15
    )

    $safe = New-SafeName $Name
    $requestFile = Join-Path $script:EvidenceDir "$safe.request.txt"
    $headersFile = Join-Path $script:EvidenceDir "$safe.headers.txt"
    $bodyFile = Join-Path $script:EvidenceDir "$safe.response.txt"
    $payloadFile = Join-Path $script:EvidenceDir "$safe.payload.txt"
    $url = "$BaseUrl$Path"
    $auth = "${Username}:$Password"
    $args = @(
        "--silent", "--show-error", "--insecure", "--digest",
        "--user", $auth,
        "--request", $Method,
        "--connect-timeout", "5",
        "--max-time", "$TimeoutSeconds",
        "--header", "Accept: application/json, application/xml;q=0.9, text/xml;q=0.9, */*;q=0.8",
        "--dump-header", $headersFile,
        "--output", $bodyFile,
        "--write-out", "%{http_code}`n%{content_type}`n%{time_total}`n%{url_effective}`n",
        $url
    )
    if ($Body.Trim()) {
        Set-Content -LiteralPath $payloadFile -Value $Body -Encoding UTF8
        $args += @("--header", "Content-Type: $ContentType", "--data-binary", "@$payloadFile")
    }

    $started = Get-Date
    $stdout = & curl.exe @args 2>&1
    $exitCode = $LASTEXITCODE
    $ended = Get-Date
    $lines = @($stdout)
    $statusCode = if ($lines.Count -ge 1 -and $lines[0] -match '^\d+$') { [int]$lines[0] } else { 0 }
    $contentType = if ($lines.Count -ge 2) { [string]$lines[1] } else { "" }
    $timeTotal = if ($lines.Count -ge 3) { [double]::Parse(([string]$lines[2]), [Globalization.CultureInfo]::InvariantCulture) } else { [math]::Round(($ended - $started).TotalSeconds, 3) }
    $effectiveUrl = if ($lines.Count -ge 4) { [string]$lines[3] } else { $url }
    $responseText = if (Test-Path $bodyFile) { Get-Content -Raw -LiteralPath $bodyFile } else { "" }
    $headersText = if (Test-Path $headersFile) { Get-Content -Raw -LiteralPath $headersFile } else { "" }
    $wwwAuth = Get-HeaderValue $headersText "WWW-Authenticate"
    $ok = $statusCode -ge 200 -and $statusCode -lt 300

    $payloadPathForLog = if ($Body.Trim()) { $payloadFile } else { "" }
    $requestText = @(
        "$Method $url",
        "started=$($started.ToString("o"))",
        "timeoutSeconds=$TimeoutSeconds",
        "contentType=$ContentType",
        "bodyFile=$payloadPathForLog"
    ) -join "`n"
    Set-Content -LiteralPath $requestFile -Value $requestText -Encoding UTF8

    [pscustomobject]@{
        name = $Name
        method = $Method
        baseUrl = $BaseUrl
        path = $Path
        url = $url
        ok = $ok
        statusCode = $statusCode
        curlExitCode = $exitCode
        contentType = $contentType
        elapsedSeconds = $timeTotal
        effectiveUrl = $effectiveUrl
        responseBytes = [Text.Encoding]::UTF8.GetByteCount($responseText)
        responsePreview = ($responseText -replace '\s+', ' ').Substring(0, [Math]::Min(320, ($responseText -replace '\s+', ' ').Length))
        wwwAuthenticate = $wwwAuth
        requestFile = $requestFile
        headersFile = $headersFile
        responseFile = $bodyFile
        payloadFile = if ($Body.Trim()) { $payloadFile } else { $null }
    }
}

function New-JsonBody($Value) {
    $Value | ConvertTo-Json -Depth 20 -Compress
}

function New-LogSearchXml([string]$SearchId, [string]$StartTime, [string]$EndTime, [int]$MaxResults, [string]$MetaId) {
    return @"
<?xml version="1.0" encoding="utf-8"?>
<CMSearchDescription version="2.0" xmlns="http://www.hikvision.com/ver20/XMLSchema">
<searchID>$SearchId</searchID>
<metaId>$MetaId</metaId>
<timeSpanList>
<timeSpan>
<startTime>$StartTime</startTime>
<endTime>$EndTime</endTime>
</timeSpan>
</timeSpanList>
<maxResults>$MaxResults</maxResults>
<searchResultPostion>0</searchResultPostion>
</CMSearchDescription>
"@
}

function New-PostmanRequest($Name, $Method, $Path, $Description, $Body = $null, $ContentType = "application/json") {
    $headers = @(@{ key = "Accept"; value = "application/json, application/xml;q=0.9, text/xml;q=0.9, */*;q=0.8"; type = "text" })
    $request = @{
        auth = @{ type = "inherit" }
        method = $Method
        header = $headers
        url = @{
            raw = "{{baseUrl}}$Path"
            host = @("{{baseUrl}}")
            path = ($Path.TrimStart("/") -split "/")
        }
        description = $Description
    }
    if ($Body -ne $null) {
        $request.header += @{ key = "Content-Type"; value = $ContentType; type = "text" }
        $request.body = @{
            mode = "raw"
            raw = $Body
            options = @{ raw = @{ language = if ($ContentType -match "xml") { "xml" } else { "json" } } }
        }
    }
    return @{ name = $Name; request = $request }
}

if (-not (Get-Command curl.exe -ErrorAction SilentlyContinue)) {
    throw "curl.exe is required for Digest-auth verification."
}

$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$script:EvidenceDir = Join-Path ".runtime" "hikvision-isapi-postman-verified-$stamp"
New-Item -ItemType Directory -Force -Path $script:EvidenceDir | Out-Null
New-Item -ItemType Directory -Force -Path "postman" | Out-Null

$startTime = (Get-Date).Date.AddDays(-1).ToString("yyyy-MM-ddTHH:mm:sszzz")
$endTime = (Get-Date).Date.AddDays(1).AddSeconds(-1).ToString("yyyy-MM-ddTHH:mm:sszzz")
$callbackUrl = "http://${CallbackHost}:${CallbackPort}$CallbackPath"

$baseCandidates = @(
    "https://${DeviceHost}",
    "http://${DeviceHost}",
    "https://${DeviceHost}:443",
    "http://${DeviceHost}:80"
) | Select-Object -Unique

$baseTrials = @()
foreach ($base in $baseCandidates) {
    $baseTrials += Invoke-IsapiRequest -Name "base-$base-deviceInfo" -BaseUrl $base -Method "GET" -Path "/ISAPI/System/deviceInfo" -TimeoutSeconds 8
}
$chosenBase = ($baseTrials | Where-Object { $_.ok } | Select-Object -First 1).BaseUrl
if (-not $chosenBase) {
    $chosenBase = ($baseTrials | Sort-Object statusCode -Descending | Select-Object -First 1).BaseUrl
}

$endpointSpecs = @(
    @{ name = "GET System deviceInfo"; method = "GET"; path = "/ISAPI/System/deviceInfo"; kind = "readonly" },
    @{ name = "GET System time"; method = "GET"; path = "/ISAPI/System/time"; kind = "readonly" },
    @{ name = "GET System status"; method = "GET"; path = "/ISAPI/System/status"; kind = "readonly" },
    @{ name = "GET Network interfaces"; method = "GET"; path = "/ISAPI/System/Network/interfaces"; kind = "readonly" },
    @{ name = "GET Security userCheck"; method = "GET"; path = "/ISAPI/Security/userCheck"; kind = "readonly" },
    @{ name = "GET Security users"; method = "GET"; path = "/ISAPI/Security/users"; kind = "readonly" },
    @{ name = "POST UserInfo Search employee"; method = "POST"; path = "/ISAPI/AccessControl/UserInfo/Search?format=json"; kind = "readonly"; contentType = "application/json"; body = New-JsonBody @{ UserInfoSearchCond = @{ searchID = "pt-postman-user-$stamp"; searchResultPosition = 0; maxResults = 5; EmployeeNoList = @(@{ employeeNo = $EmployeeNo }) } } },
    @{ name = "GET UserInfo Count"; method = "GET"; path = "/ISAPI/AccessControl/UserInfo/Count?format=json"; kind = "readonly" },
    @{ name = "POST AcsEvent recent"; method = "POST"; path = "/ISAPI/AccessControl/AcsEvent?format=json"; kind = "readonly"; contentType = "application/json"; body = New-JsonBody @{ AcsEventCond = @{ searchID = "pt-postman-acs-$stamp"; searchResultPosition = 0; maxResults = 10; major = 0; minor = 0; startTime = $startTime; endTime = $endTime; timeReverseOrder = $true } } },
    @{ name = "POST ContentMgmt logSearch Information"; method = "POST"; path = "/ISAPI/ContentMgmt/logSearch"; kind = "readonly"; contentType = "application/xml; charset=UTF-8"; body = New-LogSearchXml "pt-postman-log-$stamp" $startTime $endTime 10 "log.hikvision.com/Information" },
    @{ name = "POST FingerPrintUpload employee"; method = "POST"; path = "/ISAPI/AccessControl/FingerPrintUpload?format=json"; kind = "readonly-sensitive"; contentType = "application/json"; body = New-JsonBody @{ FingerPrintCond = @{ searchID = "pt-postman-fp-$stamp"; searchResultPosition = 0; maxResults = 8; employeeNo = $EmployeeNo } } },
    @{ name = "GET HTTP hosts"; method = "GET"; path = "/ISAPI/Event/notification/httpHosts"; kind = "callback-read" },
    @{ name = "GET HTTP hosts capabilities"; method = "GET"; path = "/ISAPI/Event/notification/httpHosts/capabilities"; kind = "callback-read" },
    @{ name = "GET HTTP host slot 1"; method = "GET"; path = "/ISAPI/Event/notification/httpHosts/1"; kind = "callback-read" },
    @{ name = "GET Event alertStream"; method = "GET"; path = "/ISAPI/Event/notification/alertStream"; kind = "stream"; timeout = 8 }
)

$results = @()
foreach ($spec in $endpointSpecs) {
    $results += Invoke-IsapiRequest `
        -Name $spec.name `
        -BaseUrl $chosenBase `
        -Method $spec.method `
        -Path $spec.path `
        -Body ([string]$spec.body) `
        -ContentType ($(if ($spec.contentType) { $spec.contentType } else { "application/json" })) `
        -TimeoutSeconds ($(if ($spec.timeout) { [int]$spec.timeout } else { 15 }))
}

$httpHostReadOk = ($results | Where-Object { $_.name -eq "GET HTTP hosts" }).ok -and
    ($results | Where-Object { $_.name -eq "GET HTTP hosts capabilities" }).ok -and
    ($results | Where-Object { $_.name -eq "GET HTTP host slot 1" }).ok

$httpHostPutResult = $null
$httpHostPutBody = New-JsonBody @{
    HttpHostNotification = @{
        id = 1
        url = $callbackUrl
        protocolType = "HTTP"
        parameterFormatType = "JSON"
        addressingFormatType = "ipaddress"
        ipAddress = $CallbackHost
        portNo = $CallbackPort
        httpAuthenticationMethod = "none"
        enabled = $true
    }
}
if ($TestHttpHostPut -and $httpHostReadOk) {
    $httpHostPutResult = Invoke-IsapiRequest -Name "PUT HTTP host slot 1" -BaseUrl $chosenBase -Method "PUT" -Path "/ISAPI/Event/notification/httpHosts/1?format=json" -Body $httpHostPutBody -ContentType "application/json" -TimeoutSeconds 15
    $results += $httpHostPutResult
} else {
    $results += [pscustomobject]@{
        name = "PUT HTTP host slot 1"
        method = "PUT"
        baseUrl = $chosenBase
        path = "/ISAPI/Event/notification/httpHosts/1?format=json"
        url = "$chosenBase/ISAPI/Event/notification/httpHosts/1?format=json"
        ok = $false
        statusCode = 0
        curlExitCode = $null
        contentType = ""
        elapsedSeconds = 0
        effectiveUrl = ""
        responseBytes = 0
        responsePreview = if ($TestHttpHostPut) { "Skipped because HTTPHost reads/capabilities/slot did not all pass." } else { "Skipped because -TestHttpHostPut was not supplied." }
        wwwAuthenticate = ""
        requestFile = $null
        headersFile = $null
        responseFile = $null
        payloadFile = $null
    }
}

$collectionItems = @(
    @{
        name = "01 Read-only health and security"
        item = @(
            New-PostmanRequest "Device info" "GET" "/ISAPI/System/deviceInfo" "Verified by script when endpoint-results reports this item ok."
            New-PostmanRequest "System time" "GET" "/ISAPI/System/time" "Read device clock."
            New-PostmanRequest "System status" "GET" "/ISAPI/System/status" "Read device status where supported."
            New-PostmanRequest "Network interfaces" "GET" "/ISAPI/System/Network/interfaces" "Read device network config."
            New-PostmanRequest "Security userCheck" "GET" "/ISAPI/Security/userCheck" "Digest auth check."
            New-PostmanRequest "Security users" "GET" "/ISAPI/Security/users" "Read device login users if firmware permits."
        )
    },
    @{
        name = "02 AccessControl users and events"
        item = @(
            New-PostmanRequest "UserInfo Search employee" "POST" "/ISAPI/AccessControl/UserInfo/Search?format=json" "Read device person inventory for employeeNo." (New-JsonBody @{ UserInfoSearchCond = @{ searchID = "pm-user-{{$timestamp}}"; searchResultPosition = 0; maxResults = 5; EmployeeNoList = @(@{ employeeNo = "{{employeeNo}}" }) } })
            New-PostmanRequest "UserInfo Count" "GET" "/ISAPI/AccessControl/UserInfo/Count?format=json" "Read device person count where supported."
            New-PostmanRequest "AcsEvent recent" "POST" "/ISAPI/AccessControl/AcsEvent?format=json" "Read recent ACS/access events. Attendance taps commonly appear here." (New-JsonBody @{ AcsEventCond = @{ searchID = "pm-acs-{{$timestamp}}"; searchResultPosition = 0; maxResults = 10; major = 0; minor = 0; startTime = "{{startTime}}"; endTime = "{{endTime}}"; timeReverseOrder = $true } })
            New-PostmanRequest "ContentMgmt logSearch Information" "POST" "/ISAPI/ContentMgmt/logSearch" "Read operation/lifecycle logs. EmployeeNo inside LogAddInfo may be opaque." (New-LogSearchXml "pm-log-{{$timestamp}}" "{{startTime}}" "{{endTime}}" 10 "log.hikvision.com/Information") "application/xml; charset=UTF-8"
            New-PostmanRequest "FingerPrintUpload employee" "POST" "/ISAPI/AccessControl/FingerPrintUpload?format=json" "Sensitive read. Pulls raw fingerprint template data for employeeNo if supported." (New-JsonBody @{ FingerPrintCond = @{ searchID = "pm-fp-{{$timestamp}}"; searchResultPosition = 0; maxResults = 8; employeeNo = "{{employeeNo}}" } })
        )
    },
    @{
        name = "03 Event callback / HTTPHost"
        item = @(
            New-PostmanRequest "HTTP hosts" "GET" "/ISAPI/Event/notification/httpHosts" "Read configured HTTP listening callback destinations."
            New-PostmanRequest "HTTP hosts capabilities" "GET" "/ISAPI/Event/notification/httpHosts/capabilities" "Read HTTPHost schema/capability before writing."
            New-PostmanRequest "HTTP host slot 1" "GET" "/ISAPI/Event/notification/httpHosts/1" "Read slot 1 before any PUT."
            New-PostmanRequest "WRITE HTTP host slot 1" "PUT" "/ISAPI/Event/notification/httpHosts/1?format=json" "MUTATING. Use only after GET/capability proof. Sets callback target variables." $httpHostPutBody
            New-PostmanRequest "Alert stream" "GET" "/ISAPI/Event/notification/alertStream" "Long-running event stream. Stop manually in Postman after proof."
        )
    }
)

$collection = @{
    info = @{
        name = "Project Truth Hikvision ISAPI TEST A Verified"
        description = "Generated by scripts/verify-hikvision-isapi-postman.ps1 after Digest-auth trials. See endpoint-results.json and trial-summary.json in $script:EvidenceDir."
        schema = "https://schema.getpostman.com/json/collection/v2.1.0/collection.json"
    }
    auth = @{
        type = "digest"
        digest = @(
            @{ key = "username"; value = "{{hikvision_username}}"; type = "string" },
            @{ key = "password"; value = "{{hikvision_password}}"; type = "string" },
            @{ key = "algorithm"; value = "MD5"; type = "string" },
            @{ key = "qop"; value = "auth"; type = "string" }
        )
    }
    variable = @(
        @{ key = "baseUrl"; value = $chosenBase; type = "string" },
        @{ key = "hikvision_username"; value = $Username; type = "string" },
        @{ key = "hikvision_password"; value = $Password; type = "string" },
        @{ key = "employeeNo"; value = $EmployeeNo; type = "string" },
        @{ key = "callbackHost"; value = $CallbackHost; type = "string" },
        @{ key = "callbackPort"; value = "$CallbackPort"; type = "string" },
        @{ key = "callbackPath"; value = $CallbackPath; type = "string" },
        @{ key = "callbackUrl"; value = $callbackUrl; type = "string" },
        @{ key = "startTime"; value = $startTime; type = "string" },
        @{ key = "endTime"; value = $endTime; type = "string" }
    )
    item = $collectionItems
}

$environment = @{
    name = "Project Truth Hikvision TEST A"
    values = @(
        @{ key = "baseUrl"; value = $chosenBase; type = "text"; enabled = $true },
        @{ key = "hikvision_username"; value = $Username; type = "text"; enabled = $true },
        @{ key = "hikvision_password"; value = $Password; type = "secret"; enabled = $true },
        @{ key = "employeeNo"; value = $EmployeeNo; type = "text"; enabled = $true },
        @{ key = "callbackHost"; value = $CallbackHost; type = "text"; enabled = $true },
        @{ key = "callbackPort"; value = "$CallbackPort"; type = "text"; enabled = $true },
        @{ key = "callbackPath"; value = $CallbackPath; type = "text"; enabled = $true },
        @{ key = "callbackUrl"; value = $callbackUrl; type = "text"; enabled = $true },
        @{ key = "startTime"; value = $startTime; type = "text"; enabled = $true },
        @{ key = "endTime"; value = $endTime; type = "text"; enabled = $true }
    )
    "_postman_variable_scope" = "environment"
    "_postman_exported_at" = (Get-Date).ToUniversalTime().ToString("o")
    "_postman_exported_using" = "Project Truth verifier"
}

$collectionPath = Join-Path "postman" "hikvision-isapi-tested.postman_collection.json"
$environmentPath = Join-Path "postman" "hikvision-isapi-tested.postman_environment.json"
$resultsPath = Join-Path $script:EvidenceDir "endpoint-results.json"
$summaryPath = Join-Path $script:EvidenceDir "trial-summary.json"
$readmePath = Join-Path $script:EvidenceDir "README.md"

$collection | ConvertTo-Json -Depth 50 | Set-Content -LiteralPath $collectionPath -Encoding UTF8
$environment | ConvertTo-Json -Depth 50 | Set-Content -LiteralPath $environmentPath -Encoding UTF8
$results | ConvertTo-Json -Depth 20 | Set-Content -LiteralPath $resultsPath -Encoding UTF8

$passed = @($results | Where-Object { $_.ok })
$failed = @($results | Where-Object { -not $_.ok })
$summary = [pscustomobject]@{
    generatedAt = (Get-Date).ToString("o")
    deviceHost = $DeviceHost
    chosenBaseUrl = $chosenBase
    username = $Username
    passwordPreset = $true
    employeeNo = $EmployeeNo
    callbackUrl = $callbackUrl
    newman = if (Get-Command newman -ErrorAction SilentlyContinue) { (& newman --version) } else { "NEWMAN_NOT_FOUND; curl digest verifier used" }
    baseTrials = $baseTrials
    passedCount = $passed.Count
    failedCount = $failed.Count
    passedEndpoints = @($passed | Select-Object name, method, path, statusCode, contentType, elapsedSeconds, responseFile)
    failedEndpoints = @($failed | Select-Object name, method, path, statusCode, curlExitCode, responsePreview)
    httpHostReadsVerified = [bool]$httpHostReadOk
    httpHostPutAttempted = [bool]($TestHttpHostPut -and $httpHostReadOk)
    httpHostPutVerified = [bool]($httpHostPutResult -and $httpHostPutResult.ok)
    realCallbackPayloadReceived = $false
    realCallbackPayloadNote = "This verifier does not trigger a physical panel event. HTTPHost config proof is separate from real callback receipt."
    collectionPath = (Resolve-Path $collectionPath).Path
    environmentPath = (Resolve-Path $environmentPath).Path
    evidenceDir = (Resolve-Path $script:EvidenceDir).Path
}
$summary | ConvertTo-Json -Depth 30 | Set-Content -LiteralPath $summaryPath -Encoding UTF8

$readme = @"
# Hikvision ISAPI Postman Verification

Generated: $($summary.generatedAt)

Device host: `$DeviceHost`
Chosen base URL: `$chosenBase`
Digest username: `$Username`
EmployeeNo probe: `$EmployeeNo`
Callback URL variable: `$callbackUrl`

## Results

- Passed endpoints: $($passed.Count)
- Failed/skipped endpoints: $($failed.Count)
- HTTPHost reads verified: $httpHostReadOk
- HTTPHost PUT attempted: $($summary.httpHostPutAttempted)
- HTTPHost PUT verified: $($summary.httpHostPutVerified)
- Real callback payload received: false

## Important Boundaries

- `FingerPrintUpload` is a sensitive read because it can return raw fingerprint template data.
- `WRITE HTTP host slot 1` is mutating and should only be used after the GET/capability/slot reads pass on this firmware.
- `alertStream` is long-running; a timeout can still mean the endpoint opened but no event arrived in the bounded test window.
- This script does not create/enroll a physical user and does not trigger a physical panel event. Callback receipt must be proven separately by making the panel post to a reachable HRIS callback URL and saving the payload.

## Evidence Files

- `endpoint-results.json`
- `trial-summary.json`
- `*.request.txt`
- `*.headers.txt`
- `*.response.txt`
- `*.payload.txt` for POST/PUT bodies
"@
Set-Content -LiteralPath $readmePath -Value $readme -Encoding UTF8

Write-Host "EVIDENCE_DIR=$((Resolve-Path $script:EvidenceDir).Path)"
Write-Host "COLLECTION=$((Resolve-Path $collectionPath).Path)"
Write-Host "ENVIRONMENT=$((Resolve-Path $environmentPath).Path)"
Write-Host "PASSED=$($passed.Count) FAILED=$($failed.Count)"
Write-Host "HTTPHOST_READS_VERIFIED=$httpHostReadOk HTTPHOST_PUT_VERIFIED=$($summary.httpHostPutVerified)"
