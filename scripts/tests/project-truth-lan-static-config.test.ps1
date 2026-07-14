[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent (Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path))
$scriptPath = Join-Path $repoRoot 'appliance/bin/project-truth-lan-config.sh'
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
Assert-Matches 'PROJECT_TRUTH_LAN_IP' 'Static LAN reconciler must preserve a preferred operator/runtime LAN IP'
Assert-Matches 'addresses="\$\{PROJECT_TRUTH_LAN_ADDRESSES:-\}"' 'Static LAN reconciler must read the multi-address variable before loading config'
Assert-Matches 'addresses="\$\{PROJECT_TRUTH_LAN_ADDRESSES:-\$addresses\}"' 'Static LAN reconciler must let /etc/project-truth/lan.env override multi-address state'
Assert-Matches 'tr '','' ''\\n''' 'Static LAN reconciler must split comma-separated address lists into YAML entries'
Assert-Matches 'static_address_yaml=' 'Static LAN reconciler must render static addresses from the address list'
Assert-Matches 'on-link: true' 'Static LAN reconciler must keep the cross-subnet static gateway reachable'
Assert-Matches 'PROJECT_TRUTH_LAN_STATIC_ROUTES' 'Static LAN reconciler must support persisted extra static routes'
Assert-Matches 'route_to="\$\{route_entry%@\*\}"' 'Static LAN reconciler must parse static route destinations'
Assert-Matches 'route_via="\$\{route_entry#\*@\}"' 'Static LAN reconciler must parse static route gateways'
Assert-Matches 'PROJECT_TRUTH_LAN_SEARCH_DOMAINS' 'Static LAN reconciler must persist LAN DNS search domains'
Assert-Matches 'search: \[\$\{search_yaml\}\]' 'Static LAN reconciler must render DNS search domains into netplan'
Assert-Matches 'dhcp4: false' 'Static LAN reconciler must support pure static mode without DHCP fallback'

$summaryPath = Join-Path $repoRoot 'appliance/bin/project-truth-lan-summary.sh'
$summaryContent = Get-Content -Raw -LiteralPath $summaryPath
if ($summaryContent -notmatch 'PROJECT_TRUTH_LAN_IP:-10\.184\.37\.19') {
  throw 'LAN summary must prefer 10.184.37.19 as the canonical runtime/client IP.'
}
foreach ($pattern in @(
    'PROD"\s+"emp"\s+"\$ip_addr"\s+"3300"',
    'DEV"\s+"emp"\s+"\$ip_addr"\s+"3310"',
    'UAT"\s+"emp"\s+"\$ip_addr"\s+"3320"',
    'OTEL metrics'
  )) {
  if ($summaryContent -notmatch $pattern) {
    throw "LAN summary must display verified employee portal and observability URLs. Missing pattern: $pattern"
  }
}
if ($summaryContent -match '"Gateway"\s+"\$ip_addr"\s+"38080"') {
  throw 'LAN summary must not advertise the stale Gateway :38080 URL after host-side verification failed.'
}

$loginHelpPath = Join-Path $repoRoot 'appliance/profile.d/project-truth-hris-help.sh'
$loginHelpContent = Get-Content -Raw -LiteralPath $loginHelpPath
foreach ($pattern in @(
    'PROD"\s+"\$lan_ip"\s+"3300"',
    'DEV"\s+"\$lan_ip"\s+"3310"',
    'UAT"\s+"\$lan_ip"\s+"3320"',
    'OTEL metrics'
  )) {
  if ($loginHelpContent -notmatch $pattern) {
    throw "SSH login help must display verified employee portal and observability URLs. Missing pattern: $pattern"
  }
}
if ($loginHelpContent -match '"Gateway"\s+"\$lan_ip"\s+"38080"') {
  throw 'SSH login help must not advertise the stale Gateway :38080 URL after host-side verification failed.'
}

$agentsContent = Get-Content -Raw -LiteralPath (Join-Path $repoRoot 'AGENTS.md')
if ($agentsContent -notmatch 'Host-Local VM First Rule') {
  throw 'AGENTS.md must keep the host-local VM first rule so agents use direct LAN SSH before public aliases for local drift.'
}
if ($agentsContent -notmatch 'infra@10\.184\.37\.19') {
  throw 'AGENTS.md must document direct LAN SSH to infra@10.184.37.19 as the first host-local VM path.'
}

$driftGuardContent = Get-Content -Raw -LiteralPath (Join-Path $repoRoot '.wwg/governance/drift-guard.md')
if ($driftGuardContent -notmatch 'Host-Local VM First Guard') {
  throw 'WWG drift guard must protect direct LAN evidence as the first host-local VM path.'
}

$helperPaths = @(
  'appliance/profile.d/project-truth-hris-help.sh',
  'appliance/bin/project-truth-clean-console.sh',
  'appliance/bin/project-truth-db-access.sh',
  'appliance/bin/project-truth-hris-status.sh',
  'appliance/bin/project-truth-progress.sh',
  'appliance/bin/project-truth-status.sh'
)

foreach ($helperPath in $helperPaths) {
  $helperContent = Get-Content -Raw -LiteralPath (Join-Path $repoRoot $helperPath)
  if ($helperContent -notmatch 'PROJECT_TRUTH_LAN_IP:-10\.184\.37\.19') {
    throw "$helperPath must prefer 10.184.37.19 before route-source IP fallback."
  }
}

Write-Host 'Project Truth LAN static config regression checks passed.'
