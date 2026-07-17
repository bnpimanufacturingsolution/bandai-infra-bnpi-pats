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

# SDK listen port open means TEST A reverse path is usable even if SSH process
# detection or optional remote API port (53001) failed during re-ensure.
$sdkPortOpen = Test-Tcp "127.0.0.1" $SdkListenPort
if ($sdkPortOpen) {
  $result.reverseBridge = $true
  $fixedSteps = @()
  foreach ($s in $result.steps) {
    if ($s.step -eq "reverse_bridge" -and -not $s.ok) {
      $fixedSteps += [pscustomobject]@{
        step = "reverse_bridge"
        ok = $true
        detail = "SDK reverse path up; API reverse handled separately"
      }
    } else {
      $fixedSteps += $s
    }
  }
  $result.steps = $fixedSteps
  if (-not ($result.steps | Where-Object { $_.step -eq "reverse_bridge_sdk_port" })) {
    $result.steps += [pscustomobject]@{
      step = "reverse_bridge_sdk_port"
      ok = $true
      detail = "127.0.0.1:$SdkListenPort is listening - TEST A SDK reverse path is available"
    }
  }
} elseif (-not $result.reverseBridge) {
  $result.steps += [pscustomobject]@{
    step = "reverse_bridge_sdk_port"
    ok = $false
    detail = "127.0.0.1:$SdkListenPort not listening - device reverse tunnel missing"
  }
}

# --- 3) Host API reverse into VM (53001 -> host 3001) for SOCKET truth ---
# Listener posts to VM API base. Browser socket is on host:3001. Without this reverse,
# events save to DB (reload works) but device-event:saved never reaches the browser.
$apiReverseOk = $false
try {
  $vmApiListen = ssh -o ConnectTimeout=12 -o BatchMode=yes $VmSshTarget "ss -ltn 2>/dev/null | grep -E ':$ApiRemotePort\s' || true" 2>$null
  if ($vmApiListen -match [string]$ApiRemotePort) {
    $apiReverseOk = $true
    $result.steps += [pscustomobject]@{
      step = "api_reverse_bridge"
      ok = $true
      detail = "VM already listens on $ApiRemotePort (host API reverse)"
    }
  }
} catch {
  # continue to start
}

if (-not $apiReverseOk) {
  try {
    $apiBridgeRoot = Join-Path $repoRoot ".runtime\hikvision-api-reverse-bridge"
    New-Item -ItemType Directory -Force -Path $apiBridgeRoot | Out-Null
    $apiState = Join-Path $apiBridgeRoot "active.json"
    if (Test-Path $apiState) {
      try {
        $st = Get-Content -Raw $apiState | ConvertFrom-Json
        if ($st.ProcessId) { Stop-Process -Id ([int]$st.ProcessId) -Force -ErrorAction SilentlyContinue }
      } catch {}
    }
    $stdout = Join-Path $apiBridgeRoot "ssh.stdout.log"
    $stderr = Join-Path $apiBridgeRoot "ssh.stderr.log"
    $proc = Start-Process -FilePath "ssh.exe" -ArgumentList @(
      "-N", "-T",
      "-o", "ExitOnForwardFailure=yes",
      "-o", "ServerAliveInterval=30",
      "-o", "ServerAliveCountMax=3",
      "-R", "${ApiRemotePort}:127.0.0.1:${ApiLocalPort}",
      $VmSshTarget
    ) -WindowStyle Hidden -RedirectStandardOutput $stdout -RedirectStandardError $stderr -PassThru
    Start-Sleep -Seconds 3
    if ($proc.HasExited) {
      $err = if (Test-Path $stderr) { Get-Content -Raw $stderr } else { "ssh exited" }
      $result.steps += [pscustomobject]@{ step = "api_reverse_bridge"; ok = $false; detail = "Failed to start API reverse: $err".Trim() }
    } else {
      $vmApiListen2 = ssh -o ConnectTimeout=12 -o BatchMode=yes $VmSshTarget "ss -ltn 2>/dev/null | grep -E ':$ApiRemotePort\s' || true" 2>$null
      $apiReverseOk = $vmApiListen2 -match [string]$ApiRemotePort
      @{ ProcessId = $proc.Id; ApiRemotePort = $ApiRemotePort; ApiLocalPort = $ApiLocalPort; generatedAt = (Get-Date).ToString("o") } |
        ConvertTo-Json | Set-Content -LiteralPath $apiState -Encoding UTF8
      $result.steps += [pscustomobject]@{
        step = "api_reverse_bridge"
        ok = $apiReverseOk
        detail = if ($apiReverseOk) {
          "Started SSH -R ${ApiRemotePort}:127.0.0.1:${ApiLocalPort} so VM posts hit host API (socket)"
        } else {
          "SSH process started but VM :$ApiRemotePort not listening yet"
        }
      }
    }
  } catch {
    $result.steps += [pscustomobject]@{ step = "api_reverse_bridge"; ok = $false; detail = "$_" }
  }
}

# --- 4) Point listener at host API reverse when available (socket process = browser process) ---
if ($apiReverseOk) {
  try {
    $retarget = ssh -o ConnectTimeout=20 -o BatchMode=yes $VmSshTarget @"
set -e
DROP_DIR=/etc/systemd/system/project-truth-hikvision-hot-reload-listener.service.d
sudo mkdir -p "`$DROP_DIR"
printf '%s\n' '[Service]' 'Environment=HIKVISION_HOT_RELOAD_API_BASE=http://127.0.0.1:$ApiRemotePort' | sudo tee "`$DROP_DIR/host-api-socket.conf" >/dev/null
sudo systemctl daemon-reload
sudo systemctl restart project-truth-hikvision-hot-reload-listener.service
sleep 2
systemctl is-active project-truth-hikvision-hot-reload-listener.service
"@ 2>&1
    $listenerActive = ($retarget | Out-String) -match "active"
    $result.steps += [pscustomobject]@{
      step = "listener_api_base_host"
      ok = $listenerActive
      detail = if ($listenerActive) {
        "Listener posts to http://127.0.0.1:$ApiRemotePort (host $ApiLocalPort) so device-event:saved hits browser socket"
      } else {
        "Listener retarget attempted: $($retarget | Out-String)".Trim().Substring(0, [Math]::Min(280, ("$retarget").Length))
      }
    }
  } catch {
    $result.steps += [pscustomobject]@{ step = "listener_api_base_host"; ok = $false; detail = "$_" }
  }
} else {
  $result.steps += [pscustomobject]@{
    step = "listener_api_base_host"
    ok = $false
    detail = "Skipped - API reverse $ApiRemotePort not up; listener may still post to VM :3101 (reload works, socket lag)"
  }
}

$result.apiReverseOk = $apiReverseOk
$result.ok = [bool]($result.dbOpen -and ($result.reverseBridge -or $sdkPortOpen))
$result.message = if ($result.ok -and $apiReverseOk) {
  "Host live path ready: DB + SDK reverse + API reverse (socket-aligned)."
} elseif ($result.ok) {
  "DB + SDK reverse OK. API reverse missing - UI may need reload until 53001 bridge is up."
} elseif (-not $result.dbOpen) {
  "Database tunnel not ready on port $DbLocalPort"
} else {
  "Reverse tunnel to device not ready - check ssh $VmSshTarget / Cloudflare Access"
}

# Compact single-line JSON so host API parsers do not choke on pretty multi-line output.
$result | ConvertTo-Json -Depth 6 -Compress
if (-not $result.ok) { exit 2 }
exit 0
