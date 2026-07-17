<#
.SYNOPSIS
  Bring host-side live path deps up (DB tunnel + Hikvision reverse bridge).
  Used by Device Events "Keep ready" / Prove so operators don't need AI/predev each time.

.NOTES
  - Safe to re-run (probe-first).
  - Does NOT start hris-api itself (assumes already running).
  - Listener restart remains an API/VM step after this script.
#>
param(
  [string]$DeviceIp = "192.168.254.189",
  [int]$DbLocalPort = 55435,
  [int]$SdkListenPort = 59000,
  [int]$HttpListenPort = 59443,
  [int]$ApiLocalPort = 3001,
  [int]$ApiRemotePort = 53001,
  [string]$VmSshTarget = "project-truth-hris"
)

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $repoRoot

function Test-Tcp([string]$HostName, [int]$Port, [int]$TimeoutMs = 1200) {
  try {
    $c = [System.Net.Sockets.TcpClient]::new()
    $iar = $c.BeginConnect($HostName, $Port, $null, $null)
    if (-not $iar.AsyncWaitHandle.WaitOne($TimeoutMs, $false)) {
      $c.Close()
      return $false
    }
    $c.EndConnect($iar)
    $c.Close()
    return $true
  } catch {
    return $false
  }
}

$result = [ordered]@{
  ok = $false
  generatedAt = (Get-Date).ToString("o")
  steps = @()
  dbPort = $DbLocalPort
  dbOpen = $false
  reverseBridge = $false
  sdkPort = $SdkListenPort
  httpPort = $HttpListenPort
  apiPort = $ApiLocalPort
  deviceIp = $DeviceIp
  message = ""
}

# --- 1) DB tunnel ---
if (Test-Tcp "127.0.0.1" $DbLocalPort) {
  $result.dbOpen = $true
  $result.steps += [pscustomobject]@{ step = "db_tunnel"; ok = $true; detail = "127.0.0.1:$DbLocalPort already open" }
} else {
  $dbScript = Join-Path $repoRoot "scripts\start-k8s-dev-db-access.ps1"
  if (-not (Test-Path $dbScript)) {
    $result.steps += [pscustomobject]@{ step = "db_tunnel"; ok = $false; detail = "start-k8s-dev-db-access.ps1 missing" }
  } else {
    try {
      & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $dbScript -LocalPort $DbLocalPort 2>&1 | Out-Null
      Start-Sleep -Seconds 2
      $result.dbOpen = Test-Tcp "127.0.0.1" $DbLocalPort
      $result.steps += [pscustomobject]@{
        step = "db_tunnel"
        ok = $result.dbOpen
        detail = if ($result.dbOpen) { "DB tunnel opened on $DbLocalPort" } else { "DB tunnel still closed after ensure" }
      }
    } catch {
      $result.steps += [pscustomobject]@{ step = "db_tunnel"; ok = $false; detail = "$_" }
    }
  }
}

# --- 2) Reverse bridge (VM listens → host reaches device) ---
# Prove from VM is expensive; host-side we only ensure SSH process exists with the right -R flags.
$bridgeOk = $false
$sshProcs = Get-CimInstance Win32_Process -Filter "Name='ssh.exe'" -ErrorAction SilentlyContinue
foreach ($p in $sshProcs) {
  $cmd = [string]$p.CommandLine
  if ($cmd -match [regex]::Escape("${SdkListenPort}:") -and $cmd -match [regex]::Escape($DeviceIp)) {
    $bridgeOk = $true
    break
  }
  if ($cmd -match "59000:192\.168\.254\.189:8000" -or $cmd -match "${SdkListenPort}:${DeviceIp}:8000") {
    $bridgeOk = $true
    break
  }
}

if ($bridgeOk) {
  $result.reverseBridge = $true
  $result.steps += [pscustomobject]@{ step = "reverse_bridge"; ok = $true; detail = "SSH reverse for $DeviceIp / SDK $SdkListenPort already running" }
} else {
  $bridgeScript = Join-Path $repoRoot "scripts\start-host-hikvision-vm-ssh-bridge.ps1"
  if (-not (Test-Path $bridgeScript)) {
    $result.steps += [pscustomobject]@{ step = "reverse_bridge"; ok = $false; detail = "start-host-hikvision-vm-ssh-bridge.ps1 missing" }
  } else {
    try {
      & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $bridgeScript `
        -Action start `
        -DeviceIp $DeviceIp `
        -VmSshTarget $VmSshTarget `
        -ApiLocalPort $ApiLocalPort `
        -ApiRemotePort $ApiRemotePort `
        -HttpListenPort $HttpListenPort `
        -SdkListenPort $SdkListenPort `
        -HttpDevicePort 443 `
        -SdkDevicePort 8000 2>&1 | Out-Null
      Start-Sleep -Seconds 3
      $bridgeOk = $false
      foreach ($p in (Get-CimInstance Win32_Process -Filter "Name='ssh.exe'" -ErrorAction SilentlyContinue)) {
        $cmd = [string]$p.CommandLine
        if ($cmd -match [regex]::Escape($DeviceIp) -and ($cmd -match "$SdkListenPort" -or $cmd -match "58000")) {
          $bridgeOk = $true
          break
        }
      }
      $result.reverseBridge = $bridgeOk
      $result.steps += [pscustomobject]@{
        step = "reverse_bridge"
        ok = $bridgeOk
        detail = if ($bridgeOk) {
          "Started reverse bridge $DeviceIp SDK port $SdkListenPort HTTP $HttpListenPort"
        } else {
          "Bridge script finished but SSH process for $DeviceIp not found (Cloudflare SSH may need browser login)"
        }
      }
    } catch {
      $result.steps += [pscustomobject]@{ step = "reverse_bridge"; ok = $false; detail = "$_" }
    }
  }
}

$result.ok = [bool]($result.dbOpen -and $result.reverseBridge)
$result.message = if ($result.ok) {
  "Host live path deps ready (DB + reverse bridge). Listener re-arm is next."
} elseif (-not $result.dbOpen) {
  "Database tunnel not ready on port $DbLocalPort"
} else {
  "Reverse tunnel to device not ready - check ssh $VmSshTarget / Cloudflare Access"
}

$result | ConvertTo-Json -Depth 6
if (-not $result.ok) { exit 2 }
exit 0
