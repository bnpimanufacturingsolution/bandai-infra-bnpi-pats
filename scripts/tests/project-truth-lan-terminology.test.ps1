[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent (Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path))
$activeRoots = @(
  'ansible',
  'appliance',
  'image-factory',
  'scripts',
  'docs',
  '.wwg/wiki',
  '.wwg/workspace',
  '.wwg/governance'
)

$bannedLiteralParts = @(
  @('project-truth-lan-', 'dhcp'),
  @('LAN ', 'DHCP'),
  @('DHCP ', 'drift'),
  @('DHCP ', 'is enabled')
)

$allowedHistoricalFiles = @(
  'docs/BNPI_DESEC_CLOUDFLARE_TUNNEL_STATUS_20260629.md',
  'docs/BNPI_PATS_TECH_CLOUDFLARE_STATUS_20260629.md',
  'docs/HIKVISION_LINUX_TRIAL_20260701.md',
  'docs/REMOTE_BNPI_PATS_SYNC_RECOVERY_PROMPT_20260702.md',
  'docs/UZARO_CLOUDFLARE_CUTOVER_20260629.md',
  'docs/ZKTECO_LINUX_PYZK_TRIAL_20260701.md',
  '.wwg/wiki/01-sources/raw/hikvision-dev-vm-watcher-proof-20260630.md'
) | ForEach-Object { ($_ -replace '/', [IO.Path]::DirectorySeparatorChar) }

$violations = New-Object System.Collections.Generic.List[string]
foreach ($root in $activeRoots) {
  $rootPath = Join-Path $repoRoot $root
  if (-not (Test-Path -LiteralPath $rootPath)) {
    continue
  }

  Get-ChildItem -LiteralPath $rootPath -Recurse -File |
    Where-Object { $_.FullName -notmatch '\\node_modules\\' } |
    ForEach-Object {
      $relative = $_.FullName.Substring($repoRoot.Length).TrimStart('\', '/')
      if ($allowedHistoricalFiles -contains $relative) {
        return
      }

      $text = Get-Content -Raw -LiteralPath $_.FullName -ErrorAction SilentlyContinue
      if ($null -eq $text) {
        return
      }
      foreach ($parts in $bannedLiteralParts) {
        $needle = -join $parts
        if ($text.Contains($needle)) {
          $violations.Add("${relative}: contains banned current LAN terminology '$needle'")
        }
      }
    }
}

if ($violations.Count -gt 0) {
  throw ($violations -join [Environment]::NewLine)
}

Write-Host 'Project Truth LAN terminology regression checks passed.'
