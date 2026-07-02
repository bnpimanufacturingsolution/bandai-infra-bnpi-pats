[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent (Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path))
$scriptPath = Join-Path $repoRoot 'appliance/bin/project-truth-lan-dhcp.sh'
$content = Get-Content -Raw -LiteralPath $scriptPath

function Assert-Matches {
  param(
    [string]$Pattern,
    [string]$Message
  )

  if ($content -notmatch $Pattern) {
    throw "$Message (missing pattern: $Pattern)"
  }
}

Assert-Matches 'PROJECT_TRUTH_LAN_ADDRESSES' 'Static LAN reconciler must accept a persisted multi-address CIDR list'
Assert-Matches 'addresses="\$\{PROJECT_TRUTH_LAN_ADDRESSES:-\}"' 'Static LAN reconciler must read the multi-address variable before loading config'
Assert-Matches 'addresses="\$\{PROJECT_TRUTH_LAN_ADDRESSES:-\$addresses\}"' 'Static LAN reconciler must let /etc/project-truth/lan.env override multi-address state'
Assert-Matches 'tr '','' ''\\n''' 'Static LAN reconciler must split comma-separated address lists into YAML entries'
Assert-Matches 'static_address_yaml=' 'Static LAN reconciler must render static addresses from the address list'
Assert-Matches 'on-link: true' 'Static LAN reconciler must keep the cross-subnet static gateway reachable'
Assert-Matches 'PROJECT_TRUTH_LAN_SEARCH_DOMAINS' 'Static LAN reconciler must persist LAN DNS search domains'
Assert-Matches 'search: \[\$\{search_yaml\}\]' 'Static LAN reconciler must render DNS search domains into netplan'
Assert-Matches 'dhcp4: false' 'Static LAN reconciler must support pure static mode without DHCP fallback'

Write-Host 'Project Truth LAN static config regression checks passed.'
