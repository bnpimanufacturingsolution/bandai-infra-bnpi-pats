param(
  [Parameter(Mandatory = $true)][string]$GuestIp,
  [int]$TimeoutSeconds = 5
)

$ErrorActionPreference = 'Continue'

foreach ($item in @(
  @{ Name = 'lan-prod-app'; Port = 3000; Path = '/auth/login'; Expected = 'html' },
  @{ Name = 'lan-prod-api'; Port = 3001; Path = '/health'; Expected = 'json' },
  @{ Name = 'lan-prod-emp-app'; Port = 3300; Path = '/auth/login'; Expected = 'html' },
  @{ Name = 'lan-dev-app'; Port = 3100; Path = '/auth/login'; Expected = 'html' },
  @{ Name = 'lan-dev-api'; Port = 3101; Path = '/health'; Expected = 'json' },
  @{ Name = 'lan-dev-emp-app'; Port = 3310; Path = '/auth/login'; Expected = 'html' },
  @{ Name = 'lan-uat-app'; Port = 3200; Path = '/auth/login'; Expected = 'html' },
  @{ Name = 'lan-uat-api'; Port = 3201; Path = '/health'; Expected = 'json' },
  @{ Name = 'lan-uat-emp-app'; Port = 3320; Path = '/auth/login'; Expected = 'html' }
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
