param(
  [Parameter(Mandatory = $true)]
  [string]$ImagePath
)

$ErrorActionPreference = 'Stop'

if (-not (Test-Path -LiteralPath $ImagePath)) {
  throw "Image not found: $ImagePath"
}

$resolved = (Resolve-Path -LiteralPath $ImagePath).Path
$item = Get-Item -LiteralPath $resolved -Force

if ($item.Attributes -band [IO.FileAttributes]::ReadOnly) {
  $item.Attributes = $item.Attributes -band (-bnot [IO.FileAttributes]::ReadOnly)
}

$user = "$env:USERDOMAIN\$env:USERNAME"
& icacls.exe $resolved /grant "$user`:(M)" | Out-Null
if ($LASTEXITCODE -ne 0) {
  throw "Failed to grant Modify access to $user for image: $resolved"
}

$stream = [System.IO.File]::Open($resolved, [System.IO.FileMode]::Open, [System.IO.FileAccess]::ReadWrite, [System.IO.FileShare]::ReadWrite)
try {
  Write-Host "Image ACL normalized for ${user}: $resolved"
} finally {
  $stream.Dispose()
}
