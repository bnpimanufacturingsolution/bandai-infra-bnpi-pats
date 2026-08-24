param(
  [string]$Domain = "uzaro.net",
  [string]$Hostname = "bnpi-hris.uzaro.net",
  [string]$ServiceUrl = "http://10.184.37.19:3000",
  [string]$TunnelName = "bnpi-hris",
  [string]$TunnelId = "1c8ee2c4-c9c5-4840-be39-639e4b5f605b",
  [string]$CloudflareApiToken = "",
  [string]$DigitalPlatApiToken = "",
  [string[]]$Nameservers = @()
)

$ErrorActionPreference = "Stop"

if (-not $Hostname) {
  $Hostname = $Domain
}

function Write-Step($message) {
  Write-Host ""
  Write-Host "==> $message" -ForegroundColor Cyan
}

function Invoke-JsonRequest {
  param(
    [Parameter(Mandatory)] [string]$Uri,
    [Parameter(Mandatory)] [hashtable]$Headers,
    [string]$Method = "GET",
    [object]$Body = $null
  )

  $args = @{
    Uri = $Uri
    Headers = $Headers
    Method = $Method
    TimeoutSec = 30
    UseBasicParsing = $true
  }
  if ($null -ne $Body) {
    $args.Body = ($Body | ConvertTo-Json -Depth 10)
  }

  try {
    $response = Invoke-WebRequest @args
    if ($response.Content) {
      return $response.Content | ConvertFrom-Json
    }
    return $null
  } catch {
    $status = if ($_.Exception.Response) { [int]$_.Exception.Response.StatusCode } else { "ERR" }
    $bodyText = ""
    try {
      $stream = $_.Exception.Response.GetResponseStream()
      if ($stream) {
        $reader = [IO.StreamReader]::new($stream)
        $bodyText = $reader.ReadToEnd()
      }
    } catch {}
    throw "HTTP $status from $Uri`n$bodyText"
  }
}

function Get-CloudflaredTokenParts {
  $certPath = Join-Path $env:USERPROFILE ".cloudflared\cert.pem"
  if (-not (Test-Path $certPath)) {
    return $null
  }

  $raw = Get-Content $certPath -Raw
  if ($raw -notmatch "BEGIN ARGO TUNNEL TOKEN") {
    return $null
  }

  $b64 = ($raw `
    -replace "-----BEGIN ARGO TUNNEL TOKEN-----", "" `
    -replace "-----END ARGO TUNNEL TOKEN-----", "" `
    -replace "\s", "")
  return ([Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($b64)) | ConvertFrom-Json)
}

if (-not $CloudflareApiToken) {
  $parts = Get-CloudflaredTokenParts
  if ($parts -and $parts.apiToken) {
    $CloudflareApiToken = $parts.apiToken
    $CloudflareAccountId = $parts.accountID
  }
} else {
  $CloudflareAccountId = $env:CLOUDFLARE_ACCOUNT_ID
}

if (-not $DigitalPlatApiToken) {
  $DigitalPlatApiToken = $env:DIGITALPLAT_API_TOKEN
}

if (-not $CloudflareApiToken) {
  throw "Cloudflare token missing. Pass -CloudflareApiToken or run cloudflared tunnel login first."
}
if (-not $DigitalPlatApiToken) {
  throw "DigitalPlat token missing. Pass -DigitalPlatApiToken or set DIGITALPLAT_API_TOKEN."
}

$cfHeaders = @{
  Authorization = "Bearer $CloudflareApiToken"
  Accept = "application/json"
  "Content-Type" = "application/json"
}
$dpHeaders = @{
  Authorization = "Bearer $DigitalPlatApiToken"
  Accept = "application/json"
  "Content-Type" = "application/json"
}

Write-Step "Verifying Cloudflare token"
$verify = Invoke-JsonRequest -Uri "https://api.cloudflare.com/client/v4/user/tokens/verify" -Headers $cfHeaders
if (-not $verify.success) {
  throw "Cloudflare token verification failed."
}
Write-Host "Cloudflare token active."

if (-not $CloudflareAccountId) {
  Write-Step "Finding Cloudflare account"
  $accounts = Invoke-JsonRequest -Uri "https://api.cloudflare.com/client/v4/accounts" -Headers $cfHeaders
  if (-not $accounts.result -or $accounts.result.Count -eq 0) {
    throw "No Cloudflare account visible to this token."
  }
  $CloudflareAccountId = $accounts.result[0].id
}

Write-Step "Ensuring Cloudflare zone exists: $Domain"
$zoneQuery = [uri]::EscapeDataString($Domain)
$zones = Invoke-JsonRequest -Uri "https://api.cloudflare.com/client/v4/zones?name=$zoneQuery&account.id=$CloudflareAccountId&per_page=1" -Headers $cfHeaders
$zone = $zones.result | Select-Object -First 1
if (-not $zone) {
  try {
    $createBody = @{
      account = @{ id = $CloudflareAccountId }
      name = $Domain
      type = "full"
    }
    $created = Invoke-JsonRequest -Uri "https://api.cloudflare.com/client/v4/zones" -Headers $cfHeaders -Method "POST" -Body $createBody
    $zone = $created.result
  } catch {
    Write-Warning "Cloudflare zone create failed. This token probably lacks account zone-create permission."
    Write-Warning $_
    if ($Nameservers.Count -eq 0) {
      throw "Create $Domain in Cloudflare UI first, then rerun with -Nameservers <ns1>,<ns2>."
    }
  }
}

if ($zone) {
  $Nameservers = @($zone.name_servers)
  Write-Host "Cloudflare zone status: $($zone.status)"
  Write-Host "Cloudflare nameservers: $($Nameservers -join ', ')"
}

if ($Nameservers.Count -lt 2) {
  throw "Need at least two Cloudflare nameservers for DigitalPlat registration."
}

Write-Step "Checking DigitalPlat account"
$dpDomains = Invoke-JsonRequest -Uri "https://domain-api.digitalplat.org/api/v1/domains" -Headers $dpHeaders
Write-Host "DigitalPlat visible domains: $($dpDomains.meta.count)"

$alreadyRegistered = $false
foreach ($item in @($dpDomains.data)) {
  if ($item.domain -eq $Domain -or $item.name -eq $Domain) {
    $alreadyRegistered = $true
  }
}

if (-not $alreadyRegistered) {
  Write-Step "Registering DigitalPlat domain with Cloudflare nameservers"
  $registerBody = @{
    domain = $Domain
    nameservers = $Nameservers
  }
  try {
    $null = Invoke-JsonRequest -Uri "https://domain-api.digitalplat.org/api/v1/domains" -Headers $dpHeaders -Method "POST" -Body $registerBody
    Write-Host "DigitalPlat registration request accepted."
  } catch {
    throw "DigitalPlat registration failed. If the body is a Cloudflare challenge page, run this from a browser-authenticated session or register in the dashboard using nameservers: $($Nameservers -join ', ')`n$_"
  }
} else {
  Write-Host "DigitalPlat domain is already registered."
}

Write-Step "Creating Cloudflare tunnel CNAME"
if (-not $zone) {
  $zones = Invoke-JsonRequest -Uri "https://api.cloudflare.com/client/v4/zones?name=$zoneQuery&account.id=$CloudflareAccountId&per_page=1" -Headers $cfHeaders
  $zone = $zones.result | Select-Object -First 1
}
if (-not $zone) {
  throw "Cloudflare zone is still not visible; cannot add DNS record yet."
}

$dnsQueryName = [uri]::EscapeDataString($Hostname)
$records = Invoke-JsonRequest -Uri "https://api.cloudflare.com/client/v4/zones/$($zone.id)/dns_records?type=CNAME&name=$dnsQueryName&per_page=1" -Headers $cfHeaders
$target = "$TunnelId.cfargotunnel.com"
$recordBody = @{
  type = "CNAME"
  name = $Hostname
  content = $target
  ttl = 1
  proxied = $true
}
if ($records.result -and $records.result.Count -gt 0) {
  $recordId = $records.result[0].id
  $null = Invoke-JsonRequest -Uri "https://api.cloudflare.com/client/v4/zones/$($zone.id)/dns_records/$recordId" -Headers $cfHeaders -Method "PUT" -Body $recordBody
  Write-Host "Updated CNAME $Hostname -> $target"
} else {
  $null = Invoke-JsonRequest -Uri "https://api.cloudflare.com/client/v4/zones/$($zone.id)/dns_records" -Headers $cfHeaders -Method "POST" -Body $recordBody
  Write-Host "Created CNAME $Hostname -> $target"
}

Write-Step "Updating cloudflared ingress"
$configPath = Join-Path (Get-Location) "cloudflared-bnpi-hris.yml"
if (-not (Test-Path $configPath)) {
  throw "Missing $configPath"
}
$config = Get-Content $configPath -Raw
if ($config -notmatch [regex]::Escape("hostname: $Hostname")) {
  $insert = "  - hostname: $Hostname`r`n    service: $ServiceUrl`r`n"
  $config = $config -replace "(?m)^  - service: http_status:404", "$insert  - service: http_status:404"
  Set-Content -Path $configPath -Value $config -Encoding ASCII
  Write-Host "Added ingress hostname to $configPath"
} else {
  Write-Host "Ingress hostname already present."
}

Write-Step "Restarting scheduled cloudflared tunnel"
if (Get-ScheduledTask -TaskName "ProjectTruth-BNPI-HRIS-Cloudflared" -ErrorAction SilentlyContinue) {
  Stop-ScheduledTask -TaskName "ProjectTruth-BNPI-HRIS-Cloudflared" -ErrorAction SilentlyContinue
  Start-ScheduledTask -TaskName "ProjectTruth-BNPI-HRIS-Cloudflared"
  Start-Sleep -Seconds 5
  Get-ScheduledTask -TaskName "ProjectTruth-BNPI-HRIS-Cloudflared" | Select-Object TaskName, State | Format-Table -AutoSize
} else {
  Write-Warning "Scheduled task ProjectTruth-BNPI-HRIS-Cloudflared not found."
}

Write-Step "Verification hints"
Write-Host "DNS NS: Resolve-DnsName $Domain -Type NS"
Write-Host "DNS CNAME: Resolve-DnsName $Hostname -Type CNAME"
Write-Host "HTTPS: curl.exe -I https://$Hostname/auth/login"
