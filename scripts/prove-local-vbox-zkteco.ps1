param(
  [string]$VmName = 'project-truth-final-vbox-proof',
  [string]$RuntimeDir = (Join-Path (Split-Path -Parent $PSScriptRoot) '.runtime\overnight-truth-proof'),
  [int[]]$Ports = @(22, 3000, 3001, 3100, 3101, 3200, 3201, 38080, 53000, 9091, 3110),
  [switch]$StartVm,
  [switch]$StopVm
)

$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $PSScriptRoot
$vboxManage = 'C:\Program Files\Oracle\VirtualBox\VBoxManage.exe'
if (-not (Test-Path -LiteralPath $vboxManage)) {
  throw "VBoxManage not found: $vboxManage"
}

if (-not [System.IO.Path]::IsPathRooted($RuntimeDir)) {
  $RuntimeDir = Join-Path $repoRoot $RuntimeDir
}

$runRoot = Join-Path ([System.IO.Path]::GetFullPath($RuntimeDir)) (Get-Date -Format 'yyyyMMdd-HHmmss')
New-Item -ItemType Directory -Force -Path $runRoot | Out-Null

function Write-Run {
  param([string]$Message)
  $Message | Tee-Object -FilePath (Join-Path $runRoot 'run.log') -Append
}

function Invoke-Capture {
  param(
    [string]$Name,
    [scriptblock]$Script
  )

  Write-Run "===== $Name ====="
  try {
    & $Script 2>&1 | Tee-Object -FilePath (Join-Path $runRoot "$Name.txt")
  } catch {
    $_ | Out-String | Tee-Object -FilePath (Join-Path $runRoot "$Name.error.txt")
    throw
  }
}

function Get-ConsoleIpFromScreenshotTextFallback {
  $neighbors = Get-NetNeighbor -AddressFamily IPv4 -ErrorAction SilentlyContinue |
    Where-Object { $_.IPAddress -like '192.168.*' -and $_.State -ne 'Permanent' } |
    Select-Object -ExpandProperty IPAddress -Unique
  return $neighbors
}

function Test-PortSet {
  param([string]$Ip, [string]$Name)

  $rows = foreach ($port in $Ports) {
    Test-NetConnection $Ip -Port $port -InformationLevel Detailed |
      Select-Object ComputerName, RemoteAddress, RemotePort, TcpTestSucceeded
  }
  $rows | Format-Table -AutoSize | Tee-Object -FilePath (Join-Path $runRoot "$Name.txt")
}

Write-Run "Runtime: $runRoot"
Write-Run "VM: $VmName"

Invoke-Capture 'vbox-runningvms-before' { & $vboxManage list runningvms }
Invoke-Capture 'vbox-vms' { & $vboxManage list vms }

if ($StartVm) {
  $running = & $vboxManage list runningvms
  if ($running -notmatch [regex]::Escape($VmName)) {
    Invoke-Capture 'vbox-startvm' { & $vboxManage startvm $VmName --type headless }
    Start-Sleep -Seconds 15
  }
}

Invoke-Capture 'showvminfo' { & $vboxManage showvminfo $VmName --machinereadable }
Invoke-Capture 'guestproperty' { & $vboxManage guestproperty enumerate $VmName }
Invoke-Capture 'host-ipv4' { Get-NetIPAddress -AddressFamily IPv4 | Sort-Object InterfaceAlias, IPAddress | Format-Table InterfaceAlias, IPAddress, PrefixLength, AddressState -AutoSize }
Invoke-Capture 'arp' { arp -a }
Invoke-Capture 'netneighbor' { Get-NetNeighbor -AddressFamily IPv4 | Sort-Object IPAddress | Format-Table -AutoSize }
Invoke-Capture 'docker-ps-before' { docker ps --format "table {{.Names}}\t{{.Image}}\t{{.Status}}\t{{.Ports}}" }

$screenshot = Join-Path $runRoot 'console.png'
& $vboxManage controlvm $VmName screenshotpng $screenshot
Write-Run "Console screenshot: $screenshot"

$candidateIps = @()
$guestProps = & $vboxManage guestproperty enumerate $VmName
$candidateIps += ($guestProps | Select-String -Pattern 'Value: ([0-9]+\.[0-9]+\.[0-9]+\.[0-9]+)' | ForEach-Object { $_.Matches[0].Groups[1].Value })
$candidateIps += Get-ConsoleIpFromScreenshotTextFallback
$candidateIps = $candidateIps | Where-Object { $_ } | Select-Object -Unique

foreach ($ip in $candidateIps) {
  Write-Run "Testing candidate IP: $ip"
  Test-PortSet -Ip $ip -Name "ports-before-host-stop-$ip"

  $hostOwned = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
    Where-Object { $_.IPAddress -eq $ip }
  if ($hostOwned) {
    Write-Run "Candidate IP is host-owned too: $ip"
  }
}

$hostContainers = @(
  'bnpi-pats-api',
  'bnpi-pats-app',
  'bnpi-pats-api-dev',
  'bnpi-pats-app-dev',
  'bnpi-pats-api-uat',
  'bnpi-pats-app-uat',
  'bnpi-pats-grafana',
  'bnpi-pats-prometheus',
  'bnpi-pats-loki'
)

$stopped = @()
try {
  $runningContainers = docker ps --format '{{.Names}}' | Where-Object { $hostContainers -contains $_ }
  $stopped = @($runningContainers)
  $stopped | Set-Content -LiteralPath (Join-Path $runRoot 'host-containers-stopped.txt')
  if ($stopped.Count -gt 0) {
    Invoke-Capture 'docker-stop-host-bnpi-pats' { docker stop $stopped }
    Start-Sleep -Seconds 3
  }

  foreach ($ip in $candidateIps) {
    foreach ($url in @("http://${ip}:3000/auth/login", "http://${ip}:3001/health")) {
      $safeName = ($url -replace '[^a-zA-Z0-9.-]', '_')
      Invoke-Capture "curl-after-host-stop-$safeName" { curl.exe -i --max-time 10 $url }
    }
  }
} finally {
  if ($stopped.Count -gt 0) {
    Invoke-Capture 'docker-restart-host-bnpi-pats' { docker start $stopped }
  }
}

Invoke-Capture 'docker-ps-after' { docker ps --format "table {{.Names}}\t{{.Image}}\t{{.Status}}\t{{.Ports}}" }

if ($StopVm) {
  Invoke-Capture 'vbox-acpipowerbutton' { & $vboxManage controlvm $VmName acpipowerbutton }
  Start-Sleep -Seconds 60
  $runningAfterAcpi = & $vboxManage list runningvms
  $runningAfterAcpi | Set-Content -LiteralPath (Join-Path $runRoot 'vbox-runningvms-after-acpi.txt')
  if ($runningAfterAcpi -match [regex]::Escape($VmName)) {
    Invoke-Capture 'vbox-poweroff' { & $vboxManage controlvm $VmName poweroff }
  }
}

Invoke-Capture 'vbox-runningvms-final' { & $vboxManage list runningvms }
Write-Run "Done: $runRoot"
Write-Output $runRoot
