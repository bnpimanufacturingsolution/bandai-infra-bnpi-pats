param(
  [ValidateSet('Test', 'SdkExport', 'CapabilityProbe')]
  [string]$Mode = 'Test',
  [string]$TestGrep = 'credential recovery|Hikvision biometric sync contract',
  [string]$DeviceId,
  [string]$VendorUserId,
  [ValidateSet('face', 'fingerprint')]
  [string]$Modality = 'face'
)

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
$runId = "$(Get-Date -Format 'yyyyMMdd-HHmmss')-$([guid]::NewGuid().ToString('N').Substring(0, 8))"
$remoteStage = "/home/infra/project-truth-hotloop/runs/$runId"
$directKey = Join-Path $env:USERPROFILE '.ssh/node-health-appliance_ed25519'
$sshTarget = 'project-truth-hris'
$sshPrefix = @()

$directAvailable = $false
$priorErrorPreference = $ErrorActionPreference
try {
  $ErrorActionPreference = 'Continue'
  & ssh -i $directKey -o BatchMode=yes -o ConnectTimeout=4 'infra@10.184.37.19' 'echo SSH_OK' 2>$null | Out-Null
  $directAvailable = $LASTEXITCODE -eq 0
} catch {
  $directAvailable = $false
} finally {
  $ErrorActionPreference = $priorErrorPreference
}
if ($directAvailable) {
  $sshTarget = 'infra@10.184.37.19'
  $sshPrefix = @('-i', $directKey)
}

function Invoke-Ssh {
  param([Parameter(Mandatory)][string]$Command)
  & ssh @sshPrefix $sshTarget $Command | ForEach-Object { Write-Host $_ }
  if ($LASTEXITCODE -ne 0) {
    throw "VM command failed with exit code $LASTEXITCODE"
  }
}

function Copy-ToVm {
  param(
    [Parameter(Mandatory)][string]$LocalPath,
    [Parameter(Mandatory)][string]$RemotePath,
    [switch]$Recursive
  )
  $arguments = @()
  if ($Recursive) { $arguments += '-r' }
  $arguments += $sshPrefix
  $arguments += @($LocalPath, "${sshTarget}:$RemotePath")
  & scp @arguments
  if ($LASTEXITCODE -ne 0) {
    throw "SCP failed for $LocalPath"
  }
}

Push-Location $repoRoot
$archivePath = $null
try {
  Invoke-Ssh @"
set -euo pipefail
stage='$remoteStage'
case "`$stage" in /home/infra/project-truth-hotloop/*) ;; *) exit 2 ;; esac
mkdir -p "`$stage/hris-api" "`$stage/scripts" "`$stage/vendor"
"@

  $transferPaths = @(
    'hris-api/app',
    'hris-api/config',
    'hris-api/helper',
    'hris-api/lib',
    'hris-api/middleware',
    'hris-api/scripts',
    'hris-api/tests',
    'hris-api/utils',
    'hris-api/zod',
    'hris-api/package.json',
    'hris-api/package-lock.json',
    'hris-api/tsconfig.json',
    'hris-api/webpack.config.js',
    'hris-api/index.ts',
    'scripts/project-truth-hikvision-hot-reload-listener.sh',
    'scripts/project-truth-credential-recovery-hotloop.sh',
    'vendor/hikvision-linux'
  )
  $transferRoot = Join-Path $repoRoot '.runtime/hotloop-transfer'
  New-Item -ItemType Directory -Force -Path $transferRoot | Out-Null
  $archiveName = "credential-recovery-hotloop-$([guid]::NewGuid().ToString('N')).tar.gz"
  $archivePath = Join-Path $transferRoot $archiveName
  & tar -czf $archivePath -- @transferPaths
  if ($LASTEXITCODE -ne 0) {
    throw 'Failed to prepare the compressed hot-loop source bundle'
  }
  Copy-ToVm -LocalPath $archivePath -RemotePath "/tmp/$archiveName"
  Invoke-Ssh @"
set -euo pipefail
tar -xzf '/tmp/$archiveName' -C '$remoteStage'
rm -f '/tmp/$archiveName'
current=/home/infra/project-truth-hotloop/current
if [[ -e "`$current" && ! -L "`$current" ]]; then
  mv "`$current" "/home/infra/project-truth-hotloop/current-legacy-$runId"
fi
ln -sfnT '$remoteStage' "`$current"
"@
  Invoke-Ssh "chmod 0755 '$remoteStage/scripts/project-truth-hikvision-hot-reload-listener.sh' '$remoteStage/scripts/project-truth-credential-recovery-hotloop.sh'"

  if ($Mode -eq 'Test') {
    $encodedGrep = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($TestGrep))
    Invoke-Ssh "'$remoteStage/scripts/project-truth-credential-recovery-hotloop.sh' test '$remoteStage' '$encodedGrep'"
  } elseif ($Mode -eq 'SdkExport') {
    if ($DeviceId -notmatch '^[A-Za-z0-9_-]+$') {
      throw 'SdkExport requires a safe DeviceId'
    }
    if ($VendorUserId -notmatch '^[A-Za-z0-9_.@-]+$') {
      throw 'SdkExport requires a safe VendorUserId'
    }
    Invoke-Ssh "'$remoteStage/scripts/project-truth-credential-recovery-hotloop.sh' sdk-export '$remoteStage' '$DeviceId' '$VendorUserId' '$Modality'"
  } else {
    if ($DeviceId -notmatch '^[A-Za-z0-9_-]+$') {
      throw 'CapabilityProbe requires a safe DeviceId'
    }
    Invoke-Ssh "'$remoteStage/scripts/project-truth-credential-recovery-hotloop.sh' capability-probe '$remoteStage' '$DeviceId'"
  }
} finally {
  if ($archivePath -and (Test-Path -LiteralPath $archivePath)) {
    $resolvedArchive = (Resolve-Path -LiteralPath $archivePath).Path
    $resolvedTransferRoot = (Resolve-Path -LiteralPath (Join-Path $repoRoot '.runtime/hotloop-transfer')).Path
    if ($resolvedArchive.StartsWith($resolvedTransferRoot, [StringComparison]::OrdinalIgnoreCase)) {
      Remove-Item -LiteralPath $resolvedArchive -Force
    }
  }
  Pop-Location
}
