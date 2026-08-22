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
Assert-Contains -Path 'cloudflared-bnpi-hris.yml' -Pattern 'service:\s+ssh://10\.184\.37\.19:22' -Message 'SSH ingress must target the stable VM SSH origin'
Assert-Contains -Path 'scripts/start-bnpi-cloudflare-tunnel.ps1' -Pattern '\$SshHostname\s*=\s*''ssh\.bnpi-hris\.tech''' -Message 'Tunnel wrapper must keep the canonical SSH hostname'
Assert-Contains -Path 'scripts/start-bnpi-cloudflare-tunnel.ps1' -Pattern 'ssh://\$\{GuestIp\}:22' -Message 'Tunnel wrapper must generate SSH origin from discovered VM IP'
Assert-Contains -Path 'scripts/start-bnpi-cloudflare-tunnel.ps1' -Pattern 'ProvisionDns' -Message 'Tunnel wrapper must keep DNS provisioning switch'
Assert-Contains -Path 'scripts/ensure-bnpi-cloudflare-host.ps1' -Pattern 'ssh\.bnpi-hris\.tech' -Message 'Host readiness helper must provision SSH DNS route'
Assert-Contains -Path 'scripts/ensure-bnpi-cloudflare-host.ps1' -Pattern 'project-truth-hris' -Message 'Host readiness helper must repair the easy public SSH alias'
Assert-Contains -Path 'scripts/ensure-bnpi-cloudflare-host.ps1' -Pattern 'VerifySsh' -Message 'Host readiness helper must support public SSH verification'
Assert-Contains -Path 'scripts/project-truth.ps1' -Pattern 'ensure-bnpi-cloudflare-host' -Message 'Main CLI must expose host readiness helper'
Assert-Contains -Path 'scripts/project-truth.ps1' -Pattern 'v6-one-shot' -Message 'Main CLI must expose the V6 one-shot helper'
Assert-Contains -Path 'scripts/project-truth-v6-one-shot.ps1' -Pattern 'C:\\ProgramData\\ProjectTruth\\secrets\\cloudflared\\e3486f00-f974-46d3-9e11-911266749d00\.json' -Message 'V6 one-shot must use the stable host-side credential handoff path'
Assert-Contains -Path 'project-truth-v6-one-shot.cmd' -Pattern 'v6-one-shot' -Message 'Tired-human V6 wrapper must delegate to the project-truth v6-one-shot command'
Assert-Contains -Path 'appliance/bin/project-truth-cloudflare-vm-tunnel.sh' -Pattern 'ssh://localhost:22' -Message 'VM tunnel helper must route public SSH to the VM SSH daemon'
Assert-Contains -Path 'appliance/bin/project-truth-cloudflare-vm-tunnel.sh' -Pattern 'hostname:\s+dev\.bnpi-hris\.tech\s+path:\s+/api/\.\*\s+service:\s+http://localhost:3101' -Message 'VM tunnel helper must route DEV same-host API traffic to the DEV API origin'
Assert-Contains -Path 'appliance/bin/project-truth-cloudflare-vm-tunnel.sh' -Pattern 'hostname:\s+uat\.bnpi-hris\.tech\s+path:\s+/api/\.\*\s+service:\s+http://localhost:3201' -Message 'VM tunnel helper must route UAT same-host API traffic to the UAT API origin'
Assert-Contains -Path 'appliance/bin/project-truth-cloudflare-vm-tunnel.sh' -Pattern 'cloudflared-bnpi-hris\.service' -Message 'VM tunnel helper must install the VM-side systemd connector'
Assert-Contains -Path 'AGENTS.md' -Pattern 'Agents are banned from disabling, stopping, masking, removing, toggling off' -Message 'Agent rules must ban disabling the live VM-managed Cloudflare tunnel'
Assert-Contains -Path '.wwg/governance/drift-guard.md' -Pattern 'Cloudflare Tunnel Safety Guard' -Message 'WWG drift guard must protect the live VM-managed Cloudflare tunnel'
Assert-Contains -Path 'appliance/bin/project-truth-cloudflare-vm-tunnel.sh' -Pattern 'Do not run this in image baking' -Message 'VM tunnel helper must preserve the no-baked-credentials boundary'
Assert-Contains -Path 'appliance/bin/project-truth-os-sync.sh' -Pattern 'project-truth-cloudflare-vm-tunnel\.sh' -Message 'OS sync must install the VM tunnel helper'
Assert-Contains -Path 'ansible/project-truth-pull.yml' -Pattern 'project-truth-cloudflare-vm-tunnel' -Message 'ansible-pull must install the VM tunnel helper for fresh V6 sync'
Assert-Contains -Path 'appliance/bin/project-truth-lan-summary.sh' -Pattern 'browser: https://ssh\.bnpi-hris\.tech' -Message 'VM summary must show browser SSH as the clean remote access path'
Assert-Contains -Path 'appliance/bin/project-truth-lan-summary.sh' -Pattern 'ssh project-truth-hris' -Message 'VM summary must keep the CLI public SSH alias as a prepared-workstation option'
Assert-Contains -Path 'appliance/bin/project-truth-lan-summary.sh' -Pattern 'cloudflared-bnpi-hris\.service' -Message 'VM summary must detect an active VM-managed connector'
Assert-Contains -Path 'appliance/bin/project-truth-lan-summary.sh' -Pattern 'cloudflared access ssh --hostname %h' -Message 'VM summary must show the verified Cloudflare Access SSH proxy command'
Assert-Contains -Path 'appliance/profile.d/project-truth-hris-help.sh' -Pattern 'SSH browser: https://ssh\.bnpi-hris\.tech' -Message 'Login helper must show browser SSH for unprepared remote PCs'
Assert-Contains -Path 'appliance/profile.d/project-truth-hris-help.sh' -Pattern 'ssh project-truth-hris' -Message 'Login helper must keep the CLI public SSH alias as a prepared-workstation option'
Assert-Contains -Path 'appliance/profile.d/project-truth-hris-help.sh' -Pattern 'project-truth-cloudflare-vm-tunnel' -Message 'Login helper must show the VM-managed tunnel setup command'
Assert-Contains -Path 'appliance/profile.d/project-truth-hris-help.sh' -Pattern 'dev-api\.bnpi-hris\.tech/health' -Message 'Login helper must show full public URL list'
Assert-Contains -Path 'docs/CLOUDFLARE_NAMED_TUNNEL_RUNBOOK.md' -Pattern 'ensure-bnpi-cloudflare-host -ProvisionDns -StartTunnel -VerifyPublic' -Message 'Runbook must document exportable host provisioning command'
Assert-Contains -Path 'docs/CLOUDFLARE_NAMED_TUNNEL_RUNBOOK.md' -Pattern 'project-truth-cloudflare-vm-tunnel' -Message 'Runbook must document VM-managed runtime connector setup'
Assert-Contains -Path 'docs/CLOUDFLARE_NAMED_TUNNEL_RUNBOOK.md' -Pattern 'Browser SSH Access' -Message 'Runbook must document the browser SSH journey'
Assert-Contains -Path 'docs/CLOUDFLARE_NAMED_TUNNEL_RUNBOOK.md' -Pattern 'no inbound ports' -Message 'Runbook must preserve the no-inbound-BNPI-Windows-host boundary'
Assert-Contains -Path 'docs/CLOUDFLARE_NAMED_TUNNEL_RUNBOOK.md' -Pattern 'Enable browser-based SSH sessions' -Message 'Runbook must document the Cloudflare Access browser rendering switch'

Write-Host 'bnpi Cloudflare config regression checks passed.'
