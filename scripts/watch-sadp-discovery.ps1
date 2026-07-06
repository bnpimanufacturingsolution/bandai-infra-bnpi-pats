[CmdletBinding()]
param(
  [string[]]$HikvisionIps = @('192.168.254.181', '10.184.38.215'),
  [string[]]$ZktecoIps = @('10.184.38.9', '10.184.38.10', '10.184.38.234', '10.184.38.235'),
  [int[]]$HikvisionPorts = @('80', '8000'),
  [int[]]$ZktecoPorts = @('4370'),
  [int]$PollSeconds = 5,
  [int]$Rounds = 1,
  [string]$SadpPath,
  [switch]$RestartSadp,
  [switch]$OpenDevice,
  [switch]$NoSadpLaunch
)

$ErrorActionPreference = 'Continue'

function Write-Step {
  param([string]$Message)
  Write-Host "`n==> $Message" -ForegroundColor Cyan
}

function Write-Pass {
  param([string]$Message)
  Write-Host "PASS $Message" -ForegroundColor Green
}

function Write-WarnLine {
  param([string]$Message)
  Write-Host "WARN $Message" -ForegroundColor Yellow
}

function Test-IsAdmin {
  $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
  $principal = [Security.Principal.WindowsPrincipal]::new($identity)
  return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

function Resolve-SadpPath {
  param([string]$ExplicitPath)

  if ($ExplicitPath -and (Test-Path -LiteralPath $ExplicitPath)) {
    return (Resolve-Path -LiteralPath $ExplicitPath).Path
  }

  $running = Get-Process -Name 'SADPTool' -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($running -and $running.Path -and (Test-Path -LiteralPath $running.Path)) {
    return $running.Path
  }

  $candidates = @(
    "$env:ProgramFiles\Hikvision\SADP\SADPTool.exe",
    "${env:ProgramFiles(x86)}\Hikvision\SADP\SADPTool.exe",
    "$env:ProgramFiles\SADP\SADPTool.exe",
    "${env:ProgramFiles(x86)}\SADP\SADPTool.exe",
    "$env:ProgramFiles\SADP\SADP\SADPTool.exe",
    "${env:ProgramFiles(x86)}\SADP\SADP\SADPTool.exe",
    "$env:ProgramFiles\HiTools Delivery\tools\SADPTool.exe",
    "${env:ProgramFiles(x86)}\HiTools Delivery\tools\SADPTool.exe"
  )

  foreach ($candidate in $candidates) {
    if ($candidate -and (Test-Path -LiteralPath $candidate)) {
      return $candidate
    }
  }

  $command = Get-Command 'SADPTool.exe' -ErrorAction SilentlyContinue
  if ($command -and $command.Source) {
    return $command.Source
  }

  return $null
}

function Get-TcpProbe {
  param(
    [string]$Target,
    [int]$Port
  )

  $ok = Test-NetConnection -ComputerName $Target -Port $Port -InformationLevel Quiet -WarningAction SilentlyContinue
  [pscustomobject]@{
    target = $Target
    port = $Port
    tcp = [bool]$ok
  }
}

function Get-HttpProbe {
  param([string]$Target)

  try {
    $response = Invoke-WebRequest -Uri "http://$Target/" -UseBasicParsing -TimeoutSec 4
    return [pscustomobject]@{
      target = $Target
      url = "http://$Target/"
      ok = $true
      statusCode = $response.StatusCode
      server = [string]$response.Headers.Server
    }
  } catch {
    $statusCode = $null
    if ($_.Exception.Response) {
      $statusCode = [int]$_.Exception.Response.StatusCode
    }
    return [pscustomobject]@{
      target = $Target
      url = "http://$Target/"
      ok = $statusCode -ne $null
      statusCode = $statusCode
      server = $null
      error = $_.Exception.Message
    }
  }
}

function Get-ArpRows {
  $lines = arp -a
  $rows = @()
  foreach ($line in $lines) {
    if ($line -match '^\s*(?<ip>(?:\d{1,3}\.){3}\d{1,3})\s+(?<mac>[0-9a-fA-F-]{17})\s+(?<type>\w+)') {
      $rows += [pscustomobject]@{
        ip = $Matches.ip
        mac = $Matches.mac.ToLowerInvariant()
        type = $Matches.type
      }
    }
  }
  return $rows
}

$root = Split-Path -Parent $PSScriptRoot
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$evidenceDir = Join-Path $root ".runtime\sadp-discovery\$stamp"
New-Item -ItemType Directory -Force -Path $evidenceDir | Out-Null

Write-Step "SADP / biometric discovery preflight"
$isAdmin = Test-IsAdmin
Write-Host "SADP discovery note: Hikvision SADP discovery uses UDP 37020 multicast on the local LAN/subnet; direct TCP reachability can prove the device is alive even when the SADP GUI is empty."
if ($isAdmin) {
  Write-Pass "PowerShell is elevated."
} else {
  Write-WarnLine "PowerShell is not elevated. The script can inspect state, but SADP should be launched elevated for best discovery behavior."
}

$sadpExe = Resolve-SadpPath -ExplicitPath $SadpPath
if ($sadpExe) {
  Write-Pass "SADP executable found: $sadpExe"
} else {
  Write-WarnLine "SADP executable was not found in common paths. Pass -SadpPath if it is installed elsewhere."
}

Write-Step "Windows proxy, VPN, adapter, and firewall state"
$winHttpProxy = (netsh winhttp show proxy) -join "`n"
$internetSettings = Get-ItemProperty -Path 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Internet Settings' |
  Select-Object ProxyEnable, ProxyServer, AutoConfigURL
$networkProfiles = Get-NetConnectionProfile |
  Select-Object Name, InterfaceAlias, NetworkCategory, IPv4Connectivity, IPv6Connectivity
$ipConfigs = Get-NetIPConfiguration |
  Select-Object InterfaceAlias, InterfaceDescription, IPv4Address, IPv4DefaultGateway
$sadpRules = Get-NetFirewallRule -PolicyStore ActiveStore -ErrorAction SilentlyContinue |
  Where-Object { $_.DisplayName -match 'SADP|Hikvision|Hik' -or $_.Program -match 'SADP|Hikvision|Hik' } |
  Select-Object DisplayName, Enabled, Direction, Action, Profile, Program
$interestingProcesses = Get-Process -ErrorAction SilentlyContinue |
  Where-Object { $_.ProcessName -match 'SADP|Hik|cloudflared|vpn|express|proxy|clash|v2ray|sing|warp' } |
  Select-Object ProcessName, Id, Path

$internetSettings | Format-List
$networkProfiles | Format-Table -AutoSize
if ($sadpRules) {
  $sadpRules | Format-Table -AutoSize
} else {
  Write-WarnLine "No active SADP/Hikvision firewall rule was found."
}
if ($interestingProcesses) {
  $interestingProcesses | Format-Table -AutoSize
}

Write-Step "Known device probes"
$allRounds = @()
$allTargets = @()
foreach ($ip in $HikvisionIps) {
  foreach ($port in $HikvisionPorts) {
    $allTargets += [pscustomobject]@{ vendor = 'Hikvision'; ip = $ip; port = $port }
  }
}
foreach ($ip in $ZktecoIps) {
  foreach ($port in $ZktecoPorts) {
    $allTargets += [pscustomobject]@{ vendor = 'ZKTeco'; ip = $ip; port = $port }
  }
}

for ($round = 1; $round -le $Rounds; $round++) {
  $tcpRows = @()
  foreach ($target in $allTargets) {
    $probe = Get-TcpProbe -Target $target.ip -Port $target.port
    $tcpRows += [pscustomobject]@{
      round = $round
      vendor = $target.vendor
      target = $probe.target
      port = $probe.port
      tcp = $probe.tcp
    }
  }

  $arpRows = Get-ArpRows
  $httpRows = @()
  foreach ($ip in $HikvisionIps) {
    $httpRows += Get-HttpProbe -Target $ip
  }

  $roundResult = [pscustomobject]@{
    round = $round
    timestamp = (Get-Date).ToString('o')
    tcp = $tcpRows
    http = $httpRows
    arp = $arpRows
  }
  $allRounds += $roundResult

  $tcpRows | Sort-Object vendor, target, port | Format-Table -AutoSize
  $seenKnownArp = $arpRows | Where-Object { $HikvisionIps -contains $_.ip -or $ZktecoIps -contains $_.ip }
  if ($seenKnownArp) {
    Write-Pass "Known device ARP entries are present:"
    $seenKnownArp | Format-Table -AutoSize
  } else {
    Write-WarnLine "No known device IPs are currently present in ARP."
  }

  if ($round -lt $Rounds) {
    Start-Sleep -Seconds $PollSeconds
  }
}

$hikReachable = $allRounds.tcp | Where-Object { $_.vendor -eq 'Hikvision' -and $_.tcp -eq $true }
$zktecoReachable = $allRounds.tcp | Where-Object { $_.vendor -eq 'ZKTeco' -and $_.tcp -eq $true }
$knownArp = $allRounds.arp | Where-Object { $HikvisionIps -contains $_.ip -or $ZktecoIps -contains $_.ip }

Write-Step "Verdict"
if ($hikReachable) {
  Write-Pass "At least one Hikvision/bio endpoint is reachable by direct TCP. If SADP is empty, this is a discovery/binding/firewall/adapter issue, not proof that the device is offline."
} else {
  Write-WarnLine "No Hikvision endpoint passed direct TCP. Check power, Wi-Fi/VLAN/subnet, gateway, and whether the device IP changed."
}

if ($knownArp) {
  Write-Pass "Windows has ARP evidence for at least one known device."
}

if ($networkProfiles | Where-Object { $_.NetworkCategory -eq 'Public' }) {
  Write-WarnLine "One or more active networks are Public. SADP UDP/multicast discovery is more reliable on a Private trusted LAN profile."
}

if ($ipConfigs | Where-Object { $_.InterfaceAlias -match 'vEthernet|VirtualBox|Default Switch' }) {
  Write-WarnLine "Virtual/bridged adapters are active. SADP may bind to the wrong adapter; prefer the adapter on the same subnet as the device."
}

$evidence = [pscustomobject]@{
  timestamp = (Get-Date).ToString('o')
  isAdmin = $isAdmin
  sadpPath = $sadpExe
  winHttpProxy = $winHttpProxy
  internetSettings = $internetSettings
  networkProfiles = $networkProfiles
  ipConfigurations = $ipConfigs
  sadpFirewallRules = $sadpRules
  interestingProcesses = $interestingProcesses
  targets = $allTargets
  rounds = $allRounds
}
$jsonPath = Join-Path $evidenceDir 'sadp-discovery.json'
$evidence | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $jsonPath -Encoding UTF8
Write-Pass "Evidence written to $jsonPath"

if ($OpenDevice -and $hikReachable) {
  $first = $hikReachable | Select-Object -First 1
  Start-Process "http://$($first.target)/"
}

if (-not $NoSadpLaunch -and $sadpExe) {
  if ($RestartSadp) {
    Write-Step "Restart SADP"
    Get-Process -Name 'SADPTool' -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 1
  } else {
    Write-Step "Launch SADP"
  }

  if ($isAdmin) {
    Start-Process -FilePath $sadpExe
  } else {
    Start-Process -FilePath $sadpExe -Verb RunAs
  }
}
