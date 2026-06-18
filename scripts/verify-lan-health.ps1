param(
  [Parameter(Mandatory = $true)][string]$GuestIp,
  [int]$TimeoutSeconds = 5
)

$ErrorActionPreference = 'Continue'

foreach ($item in @(
  @{ Name = 'lan-hris-api'; Port = 3001; Path = '/health'; Expected = 'json' },
  @{ Name = 'lan-hris-app'; Port = 3000; Path = '/'; Expected = 'html' }
)) {
  $url = "http://${GuestIp}:$($item.Port)$($item.Path)"
  try {
    if ($item.Expected -eq 'html') {
      $response = Invoke-WebRequest -Uri $url -TimeoutSec $TimeoutSeconds -UseBasicParsing
      [pscustomobject]@{ Name = $item.Name; Status = 'PASS'; Url = $url; Detail = "HTTP $($response.StatusCode) $($response.Headers['Content-Type'])" }
    } else {
      $response = Invoke-RestMethod -Uri $url -TimeoutSec $TimeoutSeconds
      [pscustomobject]@{ Name = $item.Name; Status = 'PASS'; Url = $url; Detail = ($response | ConvertTo-Json -Compress) }
    }
  } catch {
    [pscustomobject]@{ Name = $item.Name; Status = 'FAIL'; Url = $url; Detail = $_.Exception.Message }
  }
}
