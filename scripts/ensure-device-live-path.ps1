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
  [string]$DeviceIp = "",
  [int]$DbLocalPort = 55435,
  [int]$SdkListenPort = 59000,
  [int]$HttpListenPort = 59443,
  [int]$ApiLocalPort = 3001,
  [int]$ApiRemotePort = 53001,
  [string]$VmSshTarget = "auto"
)

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $repoRoot

function Get-VmSshCandidates {
  if ($VmSshTarget -and $VmSshTarget -ne 'auto') {
    return @([pscustomobject]@{ Label = $VmSshTarget; Args = @($VmSshTarget) })
  }

  $keyPath = Join-Path $env:USERPROFILE '.ssh\node-health-appliance_ed25519'
  $directArgs = if (Test-Path -LiteralPath $keyPath) {
    @('-i', $keyPath, 'infra@10.184.37.19')
  } else {
    @('infra@10.184.37.19')
  }

  @(
    [pscustomobject]@{ Label = 'lan:infra@10.184.37.19'; Args = $directArgs },
    [pscustomobject]@{ Label = 'alias:project-truth-hris'; Args = @('project-truth-hris') }
  )
}

function Select-VmSshCandidate {
  foreach ($candidate in Get-VmSshCandidates) {
    $args = @('-o', 'ConnectTimeout=5', '-o', 'BatchMode=yes') + @($candidate.Args) + @('echo SSH_OK')
    # Windows PowerShell promotes native stderr to a terminating NativeCommandError
    # under Stop, which previously aborted before the Cloudflare alias fallback.
    $previousErrorAction = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    $out = & ssh.exe @args 2>&1
    $sshExitCode = $LASTEXITCODE
    $ErrorActionPreference = $previousErrorAction
    if ($sshExitCode -eq 0 -and (($out | Out-String) -match 'SSH_OK')) {
      return $candidate
    }
  }
  return $null
}

$script:VmSshCandidate = Select-VmSshCandidate

function Invoke-VmSsh {
  param(
    [string]$Command,
    [int]$ConnectTimeoutSeconds = 12
  )
  if (-not $script:VmSshCandidate) {
    throw "No VM SSH target reachable (tried direct LAN 10.184.37.19, then project-truth-hris)."
  }
  $args = @('-o', "ConnectTimeout=$ConnectTimeoutSeconds", '-o', 'BatchMode=yes') + @($script:VmSshCandidate.Args) + @($Command)
  & ssh.exe @args
}

function Invoke-VmSshScript {
  param(
    [string]$Script,
    [int]$ConnectTimeoutSeconds = 20
  )
  if (-not $script:VmSshCandidate) {
    throw "No VM SSH target reachable (tried direct LAN 10.184.37.19, then project-truth-hris)."
  }
  $args = @('-o', "ConnectTimeout=$ConnectTimeoutSeconds", '-o', 'BatchMode=yes') + @($script:VmSshCandidate.Args) + @('bash -s')
  $Script | & ssh.exe @args
}

function Resolve-HikvisionBridgeDeviceIp {
  param([string]$Fallback = "192.168.254.102")

  if (-not [string]::IsNullOrWhiteSpace($DeviceIp)) {
    return $DeviceIp
  }

  $resolver = Join-Path $repoRoot "hris-api\scripts\resolve-hikvision-vm-bridge-targets.cjs"
  if (Test-Path -LiteralPath $resolver) {
    try {
      $json = & node.exe $resolver 2>$null
      $parsed = $json | ConvertFrom-Json
      # Prefer host-reachable reverse targets first (smart post-reboot lookup).
      $reachable = @(
        $parsed.targets |
          Where-Object { $_.deviceIp -and ($_.hostReachable -eq $true) }
      )
      $any = @(
        $parsed.targets |
          Where-Object { $_.deviceIp }
      )
      $pick = if ($reachable.Count -gt 0) { $reachable[0] } elseif ($any.Count -gt 0) { $any[0] } else { $null }
      if ($pick -and -not [string]::IsNullOrWhiteSpace([string]$pick.deviceIp)) {
        $src = [string]$parsed.source
        $open = @($pick.openPorts) -join ','
        Write-Host "Resolved reverse-bridge deviceIp=$($pick.deviceIp) source=$src hostReachable=$($pick.hostReachable) openPorts=$open"
        return [string]$pick.deviceIp
      }
    } catch {
      # Fall back below so predev remains recoverable if the DB is temporarily unavailable.
    }
  }

  return $Fallback
}

$DeviceIp = Resolve-HikvisionBridgeDeviceIp

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

function Test-VmListenPort([int]$Port, [int]$TimeoutSeconds = 12) {
  try {
    $probe = @"
set -e
if ss -ltn 2>/dev/null | grep -Eq '(^|[[:space:]])(127\.0\.0\.1|\[::1\]|\*|0\.0\.0\.0):$Port[[:space:]]'; then
  echo LISTEN
  exit 0
fi
if timeout 4 bash -lc '</dev/tcp/127.0.0.1/$Port' >/dev/null 2>&1; then
  echo CONNECT
  exit 0
fi
exit 1
"@
    $out = Invoke-VmSshScript -Script $probe -ConnectTimeoutSeconds $TimeoutSeconds 2>$null
    return (($out | Out-String) -match "LISTEN|CONNECT")
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
# A stale local ssh.exe process is not enough proof after sleep, Wi-Fi change, or
# Cloudflare reconnect. Prove the VM localhost ports that the listener uses.
$bridgeProcessMatches = $false
$sshProcs = Get-CimInstance Win32_Process -Filter "Name='ssh.exe'" -ErrorAction SilentlyContinue
foreach ($p in $sshProcs) {
  $cmd = [string]$p.CommandLine
  if ($cmd -match [regex]::Escape("${SdkListenPort}:") -and $cmd -match [regex]::Escape($DeviceIp)) {
    $bridgeProcessMatches = $true
    break
  }
  if ($cmd -match [regex]::Escape("${SdkListenPort}:${DeviceIp}:8000")) {
    $bridgeProcessMatches = $true
    break
  }
}

$vmSdkOpen = Test-VmListenPort $SdkListenPort
$vmHttpOpen = Test-VmListenPort $HttpListenPort

if ($bridgeProcessMatches -and $vmSdkOpen -and $vmHttpOpen) {
  $result.reverseBridge = $true
  $result.steps += [pscustomobject]@{
    step = "reverse_bridge"
    ok = $true
    detail = "VM reverse ports open for $DeviceIp (SDK $SdkListenPort, HTTP $HttpListenPort)"
  }
} else {
  $bridgeScript = Join-Path $repoRoot "scripts\start-host-hikvision-vm-ssh-bridge.ps1"
  if (-not (Test-Path $bridgeScript)) {
    $result.steps += [pscustomobject]@{ step = "reverse_bridge"; ok = $false; detail = "start-host-hikvision-vm-ssh-bridge.ps1 missing" }
  } else {
    try {
      if ($bridgeProcessMatches -and -not ($vmSdkOpen -and $vmHttpOpen)) {
        $result.steps += [pscustomobject]@{
          step = "reverse_bridge_stale"
          ok = $false
          detail = "Local ssh bridge exists, but VM ports are not proven (SDK=$vmSdkOpen HTTP=$vmHttpOpen); rebinding"
        }
      }
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
      $vmSdkOpen = Test-VmListenPort $SdkListenPort
      $vmHttpOpen = Test-VmListenPort $HttpListenPort
      $bridgeOk = [bool]($vmSdkOpen -and $vmHttpOpen)
      $result.reverseBridge = $bridgeOk
      $result.steps += [pscustomobject]@{
        step = "reverse_bridge"
        ok = $bridgeOk
        detail = if ($bridgeOk) {
          "Started and proved VM reverse ports for $DeviceIp (SDK $SdkListenPort, HTTP $HttpListenPort)"
        } else {
          "Bridge script finished but VM ports not proven (SDK=$vmSdkOpen HTTP=$vmHttpOpen); Cloudflare SSH may need login"
        }
      }
    } catch {
      $result.steps += [pscustomobject]@{ step = "reverse_bridge"; ok = $false; detail = "$_" }
    }
  }
}

# VM SDK/HTTP listen ports mean TEST A reverse path is usable even if host
# process detection failed during re-ensure.
$sdkPortOpen = $vmSdkOpen
if ($sdkPortOpen -and $vmHttpOpen) {
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
      detail = "VM 127.0.0.1:$SdkListenPort and :$HttpListenPort are listening - TEST A reverse path is available"
    }
  }
} elseif (-not $result.reverseBridge) {
  $result.steps += [pscustomobject]@{
    step = "reverse_bridge_sdk_port"
    ok = $false
    detail = "VM reverse ports missing (SDK=$vmSdkOpen HTTP=$vmHttpOpen) - device reverse tunnel missing"
  }
}

# --- 3) Host API reverse into VM (53001 -> host 3001) for SOCKET truth ---
# Listener posts to VM API base. Browser socket is on host:3001. Without this reverse,
# events save to DB (reload works) but device-event:saved never reaches the browser.
$apiReverseOk = $false
try {
  $vmApiListen = Invoke-VmSsh -ConnectTimeoutSeconds 12 -Command "ss -ltn 2>/dev/null | grep -E ':$ApiRemotePort\s' || true" 2>$null
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
    $apiForwardArgs = @(
      "-N", "-T",
      "-o", "ExitOnForwardFailure=yes",
      "-o", "ServerAliveInterval=30",
      "-o", "ServerAliveCountMax=3",
      "-R", "${ApiRemotePort}:127.0.0.1:${ApiLocalPort}",
      @($script:VmSshCandidate.Args)
    )
    $proc = Start-Process -FilePath "ssh.exe" -ArgumentList $apiForwardArgs -WindowStyle Hidden -RedirectStandardOutput $stdout -RedirectStandardError $stderr -PassThru
    Start-Sleep -Seconds 3
    if ($proc.HasExited) {
      $err = if (Test-Path $stderr) { Get-Content -Raw $stderr } else { "ssh exited" }
      $result.steps += [pscustomobject]@{ step = "api_reverse_bridge"; ok = $false; detail = "Failed to start API reverse: $err".Trim() }
    } else {
      $vmApiListen2 = Invoke-VmSsh -ConnectTimeoutSeconds 12 -Command "ss -ltn 2>/dev/null | grep -E ':$ApiRemotePort\s' || true" 2>$null
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
# Critical: EnvironmentFile=/etc/project-truth/hikvision-hot-reload.env often wins over drop-ins
# and defaults to VM :3101 (K3s). Host-local Device Events sockets need :53001 -> host :3001.
# Only restart when drift is proven — keep warm predev fast.
if ($apiReverseOk) {
  try {
    $retargetScript = @"
set -e
TARGET_BASE='http://127.0.0.1:$ApiRemotePort'
DROP_DIR=/etc/systemd/system/project-truth-hikvision-hot-reload-listener.service.d
ENV_FILE=/etc/project-truth/hikvision-hot-reload.env
UNIT=project-truth-hikvision-hot-reload-listener.service

# Prove current listener target from the LATEST service_started / apiBase line only.
# (journal may still contain older 3101 lines — do not treat those as current.)
RECENT=`$(sudo -n journalctl -u "`$UNIT" -n 80 --no-pager 2>/dev/null | grep -E 'service_started|hrisApiBase|\"apiBase\"' | tail -n 12 || true)
LAST=`$(echo "`$RECENT" | tail -n 1 || true)
if echo "`$LAST" | grep -q "127.0.0.1:$ApiRemotePort"; then
  if systemctl is-active --quiet "`$UNIT"; then
    echo "LISTENER_ALREADY_HOST_API"
    echo "`$LAST"
    systemctl is-active "`$UNIT"
    exit 0
  fi
fi

echo "LISTENER_RETARGET_NEEDED"
sudo -n mkdir -p "`$DROP_DIR"
# Clean single-purpose drop-in (avoid corrupted multi-Environment lines).
printf '%s\n' '[Service]' "Environment=HIKVISION_HOT_RELOAD_API_BASE=`$TARGET_BASE" | sudo -n tee "`$DROP_DIR/host-api-socket.conf" >/dev/null
# EnvironmentFile wins over unit Environment= — rewrite the file with python (no sed # issues).
sudo -n python3 - <<'PY'
from pathlib import Path
target = "http://127.0.0.1:$ApiRemotePort"
path = Path("/etc/project-truth/hikvision-hot-reload.env")
lines = []
if path.exists():
    for line in path.read_text().splitlines():
        if line.startswith("HIKVISION_HOT_RELOAD_API_BASE="):
            lines.append(f"HIKVISION_HOT_RELOAD_API_BASE={target}")
        else:
            lines.append(line)
else:
    lines = [f"HIKVISION_HOT_RELOAD_API_BASE={target}"]
if not any(l.startswith("HIKVISION_HOT_RELOAD_API_BASE=") for l in lines):
    lines.append(f"HIKVISION_HOT_RELOAD_API_BASE={target}")
path.write_text("\n".join(lines) + "\n")
print(path.read_text())
PY
sudo -n systemctl daemon-reload
sudo -n systemctl restart "`$UNIT"
sleep 3
systemctl is-active "`$UNIT"
sudo -n journalctl -u "`$UNIT" -n 40 --no-pager 2>/dev/null | grep -E 'service_started|hrisApiBase|apiBase' | tail -n 4 || true
"@
    $retarget = Invoke-VmSshScript -Script $retargetScript -ConnectTimeoutSeconds 20 2>&1
    $retargetText = ($retarget | Out-String)
    $listenerActive = $retargetText -match "(?m)^active\s*$|LISTENER_ALREADY_HOST_API|is-active"
    if ($retargetText -match "LISTENER_ALREADY_HOST_API") {
      $listenerActive = $true
    }
    if ($retargetText -match "(?m)^active$") { $listenerActive = $true }
    $postsHost = $retargetText -match "127\.0\.0\.1:$ApiRemotePort|LISTENER_ALREADY_HOST_API"
    $stillVm3101 = ($retargetText -match "localhost:3101") -and -not ($retargetText -match "LISTENER_ALREADY_HOST_API")
    $result.steps += [pscustomobject]@{
      step = "listener_api_base_host"
      ok = [bool]($listenerActive -and $postsHost -and -not $stillVm3101)
      detail = if ($retargetText -match "LISTENER_ALREADY_HOST_API") {
        "Already posts http://127.0.0.1:$ApiRemotePort (host $ApiLocalPort) - no restart"
      } elseif ($listenerActive -and $postsHost -and -not $stillVm3101) {
        "Listener retargeted to http://127.0.0.1:$ApiRemotePort (host $ApiLocalPort) for socket truth"
      } else {
        "Listener retarget attempted: $($retargetText.Trim().Substring(0, [Math]::Min(400, $retargetText.Trim().Length)))"
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
  "Reverse tunnel to device not ready - check direct LAN SSH or project-truth-hris / Cloudflare Access"
}

# Compact single-line JSON so host API parsers do not choke on pretty multi-line output.
$result | ConvertTo-Json -Depth 6 -Compress
if (-not $result.ok) { exit 2 }
exit 0
