param(
  [string]$ConfigPath = "$env:ProgramData\ProjectTruth\config\project-truth.json",
  [string]$ImagePath = "$env:ProgramData\ProjectTruth\images\project-truth-node-latest.vhdx",
  [string]$ExpectedSha256 = '',
  [ValidateSet('hyperv','virtualbox')]
  [string]$TargetPlatform = 'hyperv',
  [string]$VmName = 'project-truth-node-01',
  [string]$SwitchName = 'ProjectTruth-External',
  [string]$BridgeAdapterName = '',
  [string]$VmPath = "$env:ProgramData\ProjectTruth\HyperV",
  [int]$CpuCount = 2,
  [int]$MemoryMb = 4096,
  [string]$GuestIpHint = '',
  [string]$GitOpsRepoUrl = 'https://github.com/ernestdodz/project-truth-hyperv.git'
)

$ErrorActionPreference = 'Stop'
$configDir = Split-Path -Parent $ConfigPath
New-Item -ItemType Directory -Force -Path $configDir | Out-Null

if (Test-Path -LiteralPath $ConfigPath) {
  $backup = "$ConfigPath.bak-$(Get-Date -Format 'yyyyMMdd-HHmmss')"
  Copy-Item -LiteralPath $ConfigPath -Destination $backup -Force
  Write-Host "Backed up existing config to $backup"
}

$config = [ordered]@{
  image = [ordered]@{
    path = $ImagePath
    targetPlatform = $TargetPlatform
    sha256 = $ExpectedSha256
  }
  hyperv = [ordered]@{
    vmName = $VmName
    switchName = $SwitchName
    vmPath = $VmPath
    cpuCount = $CpuCount
    memoryMb = $MemoryMb
    guestIpHint = $GuestIpHint
  }
  virtualbox = [ordered]@{
    vmName = $VmName
    bridgeAdapterName = $BridgeAdapterName
    cpuCount = $CpuCount
    memoryMb = $MemoryMb
    guestIpHint = $GuestIpHint
  }
  ports = [ordered]@{
    hrisApi = 3001
    hrisApp = 3000
    ssh = 2222
  }
  gitops = [ordered]@{
    repoUrl = $GitOpsRepoUrl
    applications = @('project-truth-hris-api', 'project-truth-hris-app')
  }
  updatedAt = (Get-Date).ToString('o')
}

$config | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $ConfigPath -Encoding UTF8
Write-Host "Project Truth config written: $ConfigPath"
$config | ConvertTo-Json -Depth 8
