param(
  [string]$RunId = '',
  [int]$Limit = 10
)

$ErrorActionPreference = 'Stop'

if (-not (Get-Command gh -ErrorAction SilentlyContinue)) {
  throw 'GitHub CLI not found in PATH.'
}

if (-not $RunId) {
  $runs = gh run list --limit $Limit --json databaseId,status,conclusion,name,headBranch,event,createdAt | ConvertFrom-Json
  $latest = $runs | Select-Object -First 1
  if (-not $latest) {
    throw 'No GitHub Actions runs found.'
  }
  $RunId = [string]$latest.databaseId
  Write-Host "Using latest run: $RunId $($latest.name) status=$($latest.status) conclusion=$($latest.conclusion)"
}

gh run watch $RunId
$view = gh run view $RunId --json status,conclusion,name,url,updatedAt | ConvertFrom-Json
$view | Format-List

if ($view.conclusion -and $view.conclusion -ne 'success') {
  Write-Host 'Failed log:'
  gh run view $RunId --log-failed
  exit 1
}
