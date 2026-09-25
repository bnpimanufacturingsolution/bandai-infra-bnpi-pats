param(
  [string]$ImagePath = $env:PROJECT_TRUTH_IMAGE_PATH,
  [string]$ExpectedSha256 = $env:PROJECT_TRUTH_IMAGE_SHA256
)

$ErrorActionPreference = 'Continue'
$results = New-Object System.Collections.Generic.List[object]

function Add-Check {
  param([string]$Name, [string]$Status, [string]$Detail)
  $results.Add([pscustomobject]@{ Name = $Name; Status = $Status; Detail = $Detail }) | Out-Null
}

function Find-Command {
  param([string]$Name)
  Get-Command $Name -ErrorAction SilentlyContinue
}

Add-Check 'PowerShell' 'PASS' $PSVersionTable.PSVersion.ToString()

$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
Add-Check 'Administrator' $(if ($isAdmin) { 'PASS' } else { 'WARN' }) $(if ($isAdmin) { 'Current shell is elevated.' } else { 'Not elevated. Hyper-V operations may fail.' })

$hyperv = Get-Module -ListAvailable -Name Hyper-V
Add-Check 'Hyper-V PowerShell module' $(if ($hyperv) { 'PASS' } else { 'BLOCKED' }) $(if ($hyperv) { 'Hyper-V cmdlets available.' } else { 'Hyper-V module is missing or Windows edition does not include it.' })

foreach ($tool in @('git','gh','curl','ssh')) {
  $cmd = Find-Command $tool
  Add-Check $tool $(if ($cmd) { 'PASS' } else { 'BLOCKED' }) $(if ($cmd) { $cmd.Source } else { "$tool not found in PATH." })
}

$packer = Find-Command 'packer'
Add-Check 'Packer' $(if ($packer) { 'OPTIONAL' } else { 'OPTIONAL' }) $(if ($packer) { "Optional image-factory tool found at $($packer.Source)." } else { 'Optional. Only required for image-factory rebuilds.' })

if ($ImagePath) {
  if (Test-Path -LiteralPath $ImagePath) {
    Add-Check 'Selected image' 'PASS' $ImagePath
    if ($ExpectedSha256) {
      $actual = (Get-FileHash -LiteralPath $ImagePath -Algorithm SHA256).Hash.ToLowerInvariant()
      $expected = $ExpectedSha256.Trim().ToLowerInvariant()
      Add-Check 'Image checksum' $(if ($actual -eq $expected) { 'PASS' } else { 'BLOCKED' }) "actual=$actual expected=$expected"
    } else {
      Add-Check 'Image checksum' 'WARN' 'No expected checksum supplied.'
    }
  } else {
    Add-Check 'Selected image' 'BLOCKED' "Image not found: $ImagePath"
  }
} else {
  Add-Check 'Selected image' 'WARN' 'No image selected. Set PROJECT_TRUTH_IMAGE_PATH or run select-image.'
}

$results | Format-Table -AutoSize

if ($results.Status -contains 'BLOCKED') {
  exit 2
}

exit 0
