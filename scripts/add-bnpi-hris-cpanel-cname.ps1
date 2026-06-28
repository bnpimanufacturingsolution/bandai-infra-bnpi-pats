param(
  [string]$CpanelHost = '143.95.235.24',
  [string]$Domain = 'uzaro.net',
  [string]$Name = 'bnpi-hris.uzaro.net.',
  [string]$Target = '1c8ee2c4-c9c5-4840-be39-639e4b5f605b.cfargotunnel.com.',
  [int]$Ttl = 300,
  [string]$Username = $env:CPANEL_USER,
  [string]$Token = $env:CPANEL_TOKEN
)

$ErrorActionPreference = 'Stop'

if ([string]::IsNullOrWhiteSpace($Username) -or [string]::IsNullOrWhiteSpace($Token)) {
  throw 'Set CPANEL_USER and CPANEL_TOKEN first, or pass -Username and -Token.'
}

[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
[Net.ServicePointManager]::ServerCertificateValidationCallback = { $true }

$base = "https://${CpanelHost}:2083"
$headers = @{
  Authorization = "cpanel ${Username}:${Token}"
}

$query = @{
  domain = $Domain
  name = $Name
  type = 'CNAME'
  ttl = $Ttl
  cname = $Target
}

$uriBuilder = [UriBuilder]"$base/execute/DNS/add_zone_record"
$uriBuilder.Query = ($query.GetEnumerator() | ForEach-Object {
  '{0}={1}' -f [Uri]::EscapeDataString($_.Key), [Uri]::EscapeDataString([string]$_.Value)
}) -join '&'

$response = Invoke-RestMethod -Uri $uriBuilder.Uri -Headers $headers -Method Get
$response | ConvertTo-Json -Depth 10

if (-not $response.status) {
  throw "cPanel did not report success."
}

Write-Host "Added ${Name} CNAME ${Target}"
