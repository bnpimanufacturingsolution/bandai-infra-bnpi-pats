param(
  [Parameter(Mandatory = $true)][string]$GuestIp,
  [int]$TimeoutSeconds = 5
)

$ErrorActionPreference = 'Continue'

foreach ($item in @(
  @{ Name = 'lan-dev'; Port = 3001 },
  @{ Name = 'lan-uat'; Port = 3002 },
  @{ Name = 'lan-prod'; Port = 3000 }
)) {
  $url = "http://${GuestIp}:$($item.Port)/health"
  try {
    $response = Invoke-RestMethod -Uri $url -TimeoutSec $TimeoutSeconds
    [pscustomobject]@{ Name = $item.Name; Status = 'PASS'; Url = $url; Detail = ($response | ConvertTo-Json -Compress) }
  } catch {
    [pscustomobject]@{ Name = $item.Name; Status = 'FAIL'; Url = $url; Detail = $_.Exception.Message }
  }
}
