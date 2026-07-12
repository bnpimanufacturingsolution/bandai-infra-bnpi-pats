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

Assert-Contains -Path 'scripts/start-host-hikvision-vm-ssh-bridge.ps1' -Pattern 'VmSshTarget\s*=\s*''project-truth-hris''' -Message 'SSH bridge must default to the public Project Truth VM alias'
Assert-Contains -Path 'scripts/start-host-hikvision-vm-ssh-bridge.ps1' -Pattern 'ExitOnForwardFailure=yes' -Message 'SSH bridge must fail fast if remote forwards are not established'
Assert-Contains -Path 'scripts/start-host-hikvision-vm-ssh-bridge.ps1' -Pattern 'ServerAliveInterval=30' -Message 'SSH bridge must keep the remote forward session alive'
Assert-Contains -Path 'scripts/start-host-hikvision-vm-ssh-bridge.ps1' -Pattern '58080' -Message 'SSH bridge must preserve the default forwarded HTTPS port base'
Assert-Contains -Path 'scripts/start-host-hikvision-vm-ssh-bridge.ps1' -Pattern '58000' -Message 'SSH bridge must preserve the default forwarded SDK port base'
Assert-Contains -Path 'scripts/start-host-hikvision-vm-ssh-bridge.ps1' -Pattern 'hikvisionRuntimeAddress = ''127\.0\.0\.1''' -Message 'SSH bridge must emit localhost runtime hints for the VM listener'
Assert-Contains -Path 'scripts/start-host-hikvision-vm-ssh-bridge.ps1' -Pattern 'hikvisionSdkRuntimeAddress = ''127\.0\.0\.1''' -Message 'SSH bridge must emit localhost SDK hints for the VM listener'
Assert-Contains -Path 'scripts/project-truth.ps1' -Pattern 'start-host-hikvision-vm-ssh-bridge' -Message 'Main CLI must expose the SSH-based Hikvision VM bridge helper'

Write-Host 'Hikvision VM SSH bridge contract checks passed.'
