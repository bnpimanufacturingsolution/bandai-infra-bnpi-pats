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

Assert-Contains -Path 'cloudflared-bnpi-hris.yml' -Pattern 'hostname:\s+ssh\.bnpi-hris\.tech' -Message 'SSH hostname ingress must stay in the generated tunnel config'
Assert-Contains -Path 'cloudflared-bnpi-hris.yml' -Pattern 'service:\s+ssh://192\.168\.254\.148:22' -Message 'SSH ingress must target the VM SSH origin'
Assert-Contains -Path 'scripts/start-bnpi-cloudflare-tunnel.ps1' -Pattern '\$SshHostname\s*=\s*''ssh\.bnpi-hris\.tech''' -Message 'Tunnel wrapper must keep the canonical SSH hostname'
Assert-Contains -Path 'scripts/start-bnpi-cloudflare-tunnel.ps1' -Pattern 'ssh://\$\{GuestIp\}:22' -Message 'Tunnel wrapper must generate SSH origin from discovered VM IP'
Assert-Contains -Path 'scripts/start-bnpi-cloudflare-tunnel.ps1' -Pattern 'ProvisionDns' -Message 'Tunnel wrapper must keep DNS provisioning switch'
Assert-Contains -Path 'scripts/ensure-bnpi-cloudflare-host.ps1' -Pattern 'ssh\.bnpi-hris\.tech' -Message 'Host readiness helper must provision SSH DNS route'
Assert-Contains -Path 'scripts/ensure-bnpi-cloudflare-host.ps1' -Pattern 'project-truth-hris' -Message 'Host readiness helper must repair the easy public SSH alias'
Assert-Contains -Path 'scripts/ensure-bnpi-cloudflare-host.ps1' -Pattern 'VerifySsh' -Message 'Host readiness helper must support public SSH verification'
Assert-Contains -Path 'scripts/project-truth.ps1' -Pattern 'ensure-bnpi-cloudflare-host' -Message 'Main CLI must expose host readiness helper'
Assert-Contains -Path 'appliance/bin/project-truth-cloudflare-vm-tunnel.sh' -Pattern 'ssh://localhost:22' -Message 'VM tunnel helper must route public SSH to the VM SSH daemon'
Assert-Contains -Path 'appliance/bin/project-truth-cloudflare-vm-tunnel.sh' -Pattern 'cloudflared-bnpi-hris\.service' -Message 'VM tunnel helper must install the VM-side systemd connector'
Assert-Contains -Path 'appliance/bin/project-truth-cloudflare-vm-tunnel.sh' -Pattern 'Do not run this in image baking' -Message 'VM tunnel helper must preserve the no-baked-credentials boundary'
Assert-Contains -Path 'appliance/bin/project-truth-os-sync.sh' -Pattern 'project-truth-cloudflare-vm-tunnel\.sh' -Message 'OS sync must install the VM tunnel helper'
Assert-Contains -Path 'appliance/bin/project-truth-lan-summary.sh' -Pattern 'ssh project-truth-hris' -Message 'VM summary must show the easy public SSH alias'
Assert-Contains -Path 'appliance/bin/project-truth-lan-summary.sh' -Pattern 'cloudflared-bnpi-hris\.service' -Message 'VM summary must detect an active VM-managed connector'
Assert-Contains -Path 'appliance/bin/project-truth-lan-summary.sh' -Pattern 'cloudflared access ssh --hostname %h' -Message 'VM summary must show the verified Cloudflare Access SSH proxy command'
Assert-Contains -Path 'appliance/profile.d/project-truth-hris-help.sh' -Pattern 'ssh project-truth-hris' -Message 'Login helper must show the easy public SSH alias'
Assert-Contains -Path 'appliance/profile.d/project-truth-hris-help.sh' -Pattern 'project-truth-cloudflare-vm-tunnel' -Message 'Login helper must show the VM-managed tunnel setup command'
Assert-Contains -Path 'appliance/profile.d/project-truth-hris-help.sh' -Pattern 'dev-api\.bnpi-hris\.tech/health' -Message 'Login helper must show full public URL list'
Assert-Contains -Path 'docs/CLOUDFLARE_NAMED_TUNNEL_RUNBOOK.md' -Pattern 'ensure-bnpi-cloudflare-host -ProvisionDns -StartTunnel -VerifyPublic' -Message 'Runbook must document exportable host provisioning command'
Assert-Contains -Path 'docs/CLOUDFLARE_NAMED_TUNNEL_RUNBOOK.md' -Pattern 'project-truth-cloudflare-vm-tunnel' -Message 'Runbook must document VM-managed runtime connector setup'

Write-Host 'bnpi Cloudflare config regression checks passed.'
