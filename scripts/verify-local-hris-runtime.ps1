param(
  [ValidateSet('all','prod','dev','uat')]
  [string]$Environment = 'all',
  [int]$TimeoutSeconds = 5
)

$ErrorActionPreference = 'Continue'

$targets = @(
  [pscustomobject]@{ Environment = 'prod'; Name = 'app'; Url = 'http://127.0.0.1:3000/auth/login' },
  [pscustomobject]@{ Environment = 'prod'; Name = 'api'; Url = 'http://127.0.0.1:3001/health' },
  [pscustomobject]@{ Environment = 'dev'; Name = 'app'; Url = 'http://127.0.0.1:3100/auth/login' },
  [pscustomobject]@{ Environment = 'dev'; Name = 'api'; Url = 'http://127.0.0.1:3101/health' },
  [pscustomobject]@{ Environment = 'uat'; Name = 'app'; Url = 'http://127.0.0.1:3200/auth/login' },
  [pscustomobject]@{ Environment = 'uat'; Name = 'api'; Url = 'http://127.0.0.1:3201/health' }
)

if ($Environment -ne 'all') {
  $targets = $targets | Where-Object { $_.Environment -eq $Environment }
}

$results = foreach ($target in $targets) {
  $status = 'FAIL'
  $detail = ''
  try {
    $response = Invoke-WebRequest -Uri $target.Url -UseBasicParsing -TimeoutSec $TimeoutSeconds
    $status = if ($response.StatusCode -ge 200 -and $response.StatusCode -lt 500) { 'PASS' } else { 'FAIL' }
    $detail = "HTTP $($response.StatusCode)"
  } catch {
    $detail = $_.Exception.Message
  }

  [pscustomobject]@{
    Environment = $target.Environment
    Target = $target.Name
    Url = $target.Url
    Status = $status
    Detail = $detail
  }
}

$results | Format-Table -AutoSize

if (($results | Where-Object { $_.Status -ne 'PASS' }).Count -gt 0) {
  exit 1
}

exit 0
