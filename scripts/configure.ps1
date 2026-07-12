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
  [string]$GitOpsRepoUrl = 'https://github.com/hrisworkforcesystem-coder/bandai-infra.git'
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
    prodApp = 3000
    prodApi = 3001
    devApp = 3100
    devApi = 3101
    uatApp = 3200
    uatApi = 3201
    prodEmployeeApp = 3300
    devEmployeeApp = 3310
    uatEmployeeApp = 3320
    ssh = 22
  }
  gitops = [ordered]@{
    repoUrl = $GitOpsRepoUrl
    branch = 'develop'
    applications = @('project-truth-dev', 'project-truth-uat', 'project-truth-prod')
    runtimeApplications = @('project-truth-runtime-dev', 'project-truth-runtime-uat', 'project-truth-runtime-prod')
    paths = @('gitops/overlays/dev', 'gitops/overlays/uat', 'gitops/overlays/prod')
    runtimePaths = @('gitops/runtime-k8s/overlays/dev', 'gitops/runtime-k8s/overlays/uat', 'gitops/runtime-k8s/overlays/prod')
    reconciliation = [ordered]@{
      timeout = '60s'
      jitter = '15s'
    }
  }
  updatedAt = (Get-Date).ToString('o')
}

$config | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $ConfigPath -Encoding UTF8
Write-Host "Project Truth config written: $ConfigPath"
$config | ConvertTo-Json -Depth 8
