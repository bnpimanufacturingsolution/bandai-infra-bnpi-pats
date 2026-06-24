param(
  [string]$LocalUrl = 'http://127.0.0.1:3000',
  [switch]$VerifyLocalFirst
)

$ErrorActionPreference = 'Stop'

if (-not (Get-Command cloudflared -ErrorAction SilentlyContinue)) {
  throw 'cloudflared not found in PATH. Install cloudflared before starting a trycloudflare tunnel.'
}

if ($VerifyLocalFirst) {
  $uri = [Uri]$LocalUrl
  $checkUrl = if ($uri.AbsolutePath -eq '/') { "$($uri.Scheme)://$($uri.Authority)/auth/login" } else { $LocalUrl }
  try {
    $response = Invoke-WebRequest -Uri $checkUrl -UseBasicParsing -TimeoutSec 5
    Write-Host "Local check passed: $checkUrl HTTP $($response.StatusCode)"
  } catch {
    throw "Local check failed for $checkUrl. Start/verify the local runtime before exposing it. $($_.Exception.Message)"
  }
}

Write-Host "Starting temporary trycloudflare tunnel for $LocalUrl"
Write-Host 'This URL is public and temporary. Stop this process to close the tunnel.'
cloudflared tunnel --url $LocalUrl
