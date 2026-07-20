[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent (Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path))

function Assert-Contains {
  param(
    [string]$Path,
    [string]$Pattern,
    [string]$Message
  )

  $content = Get-Content -Raw -LiteralPath (Join-Path $repoRoot $Path)
  if ($content -notmatch $Pattern) {
    throw "$Message ($Path missing pattern: $Pattern)"
  }
}

Assert-Contains -Path 'scripts/start-host-hikvision-vm-ssh-bridge.ps1' -Pattern 'VmSshTarget\s*=\s*''auto''' -Message 'SSH bridge must default to automatic VM SSH target selection'
Assert-Contains -Path 'scripts/start-host-hikvision-vm-ssh-bridge.ps1' -Pattern 'infra@10\.184\.37\.19' -Message 'SSH bridge auto mode must try direct LAN first'
Assert-Contains -Path 'scripts/start-host-hikvision-vm-ssh-bridge.ps1' -Pattern 'project-truth-hris' -Message 'SSH bridge auto mode must retain public Project Truth VM alias fallback'
Assert-Contains -Path 'scripts/start-host-hikvision-vm-ssh-bridge.ps1' -Pattern 'ExitOnForwardFailure=yes' -Message 'SSH bridge must fail fast if remote forwards are not established'
Assert-Contains -Path 'scripts/start-host-hikvision-vm-ssh-bridge.ps1' -Pattern 'ServerAliveInterval=30' -Message 'SSH bridge must keep the remote forward session alive'
Assert-Contains -Path 'scripts/start-host-hikvision-vm-ssh-bridge.ps1' -Pattern '58080' -Message 'SSH bridge must preserve the default forwarded HTTPS port base'
Assert-Contains -Path 'scripts/start-host-hikvision-vm-ssh-bridge.ps1' -Pattern '58000' -Message 'SSH bridge must preserve the default forwarded SDK port base'
Assert-Contains -Path 'scripts/start-host-hikvision-vm-ssh-bridge.ps1' -Pattern '53001' -Message 'SSH bridge must expose the host-local HRIS API inside the VM for truth-based peer copy'
Assert-Contains -Path 'scripts/start-host-hikvision-vm-ssh-bridge.ps1' -Pattern 'hikvisionRuntimeAddress = ''127\.0\.0\.1''' -Message 'SSH bridge must emit localhost runtime hints for the VM listener'
Assert-Contains -Path 'scripts/start-host-hikvision-vm-ssh-bridge.ps1' -Pattern 'hikvisionSdkRuntimeAddress = ''127\.0\.0\.1''' -Message 'SSH bridge must emit localhost SDK hints for the VM listener'
Assert-Contains -Path 'scripts/project-truth.ps1' -Pattern 'start-host-hikvision-vm-ssh-bridge' -Message 'Main CLI must expose the SSH-based Hikvision VM bridge helper'

# Listener must not default to VM :3101 when host reverse :53001 is the host-local socket path.
Assert-Contains -Path 'scripts/project-truth-hikvision-hot-reload-listener.sh' -Pattern 'resolve_local_api_base' -Message 'Listener must resolve API base (prefer host reverse)'
Assert-Contains -Path 'scripts/project-truth-hikvision-hot-reload-listener.sh' -Pattern '127\.0\.0\.1:53001' -Message 'Listener must know host reverse 53001'
Assert-Contains -Path 'scripts/project-truth-hikvision-hot-reload-listener.sh' -Pattern 'HIKVISION_HOT_RELOAD_FORCE_API_BASE' -Message 'Listener must allow force override for pure-VM 3101'
Assert-Contains -Path 'appliance/systemd/project-truth-hikvision-hot-reload-listener.service' -Pattern '(?m)^Environment=HIKVISION_HOT_RELOAD_API_BASE=http://127\.0\.0\.1:53001\s*$' -Message 'Unit default must be host reverse 53001 not K3s 3101'
$unitLines = Get-Content -LiteralPath (Join-Path $repoRoot 'appliance/systemd/project-truth-hikvision-hot-reload-listener.service')
$envLines = $unitLines | Where-Object { $_ -match '^Environment=HIKVISION_HOT_RELOAD_API_BASE=' }
if ($envLines -match 'localhost:3101') {
  throw 'Unit Environment= must not set HIKVISION_HOT_RELOAD_API_BASE to localhost:3101'
}
$listener = Get-Content -Raw -LiteralPath (Join-Path $repoRoot 'scripts/project-truth-hikvision-hot-reload-listener.sh')
if ($listener -match 'LOCAL_API_BASE=\$\{HIKVISION_HOT_RELOAD_API_BASE:-http://localhost:3101\}') {
  throw 'Listener must not hard-default LOCAL_API_BASE to localhost:3101'
}

Write-Host 'Hikvision VM SSH bridge contract checks passed.'
