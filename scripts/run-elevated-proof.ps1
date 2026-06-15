param(
  [switch]$Elevated,
  [switch]$Apply,
  [string]$ImagePath = '',
  [int]$MaxHours = 8,
  [switch]$WatchGitHubActions,
  [string]$RunRoot = ''
)

$ErrorActionPreference = 'Continue'
$repoRoot = Split-Path -Parent $PSScriptRoot

function Test-IsAdministrator {
  $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
  $principal = [Security.Principal.WindowsPrincipal]::new($identity)
  return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

if (-not (Test-IsAdministrator)) {
  $stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
  $runRoot = Join-Path (Join-Path $repoRoot '.runtime\overnight') $stamp
  New-Item -ItemType Directory -Force -Path $runRoot, (Join-Path $runRoot 'screenshots') | Out-Null

  $args = @(
    '-NoProfile',
    '-ExecutionPolicy', 'Bypass',
    '-File', "`"$PSCommandPath`"",
    '-Elevated',
    '-MaxHours', $MaxHours,
    '-RunRoot', "`"$runRoot`""
  )
  if ($Apply) { $args += '-Apply' }
  if ($WatchGitHubActions) { $args += '-WatchGitHubActions' }
  if ($ImagePath) { $args += @('-ImagePath', "`"$ImagePath`"") }

  "RunRoot=$runRoot"
  "Launching elevated proof runner. Approve the Windows UAC prompt to continue."
  try {
    Start-Process powershell.exe -Verb RunAs -ArgumentList $args -WorkingDirectory $repoRoot -ErrorAction Stop
  } catch {
    "BLOCKED: Windows UAC elevation was canceled or failed: $($_.Exception.Message)" |
      Tee-Object -FilePath (Join-Path $runRoot 'uac-launch-blocked.txt')
    exit 1223
  }
  exit 0
}

if ($RunRoot) {
  $runRoot = $RunRoot
} else {
  $stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
  $runRoot = Join-Path (Join-Path $repoRoot '.runtime\overnight') $stamp
}
New-Item -ItemType Directory -Force -Path $runRoot, (Join-Path $runRoot 'screenshots') | Out-Null
$log = Join-Path $runRoot 'elevated-proof.log'

function Invoke-ProofStep {
  param(
    [string]$Name,
    [scriptblock]$Script
  )

  $safeName = ($Name -replace '[^A-Za-z0-9_.-]', '-').ToLowerInvariant()
  $path = Join-Path $runRoot "$safeName.txt"
  "## $Name" | Tee-Object -FilePath $log -Append
  & $Script *>&1 | Tee-Object -FilePath $path | Tee-Object -FilePath $log -Append
  "ExitCode=$LASTEXITCODE" | Tee-Object -FilePath $path -Append | Tee-Object -FilePath $log -Append
}

function Get-ConfiguredImagePath {
  $projectConfig = "$env:ProgramData\ProjectTruth\config\project-truth.json"
  if (Test-Path -LiteralPath $projectConfig) {
    try {
      $config = Get-Content -LiteralPath $projectConfig -Raw | ConvertFrom-Json
      if ($config.image.path) { return [string]$config.image.path }
    } catch {
      Write-Warning "Could not parse config: $projectConfig"
    }
  }
  return "$env:ProgramData\ProjectTruth\images\project-truth-node-latest.vhdx"
}

function Find-GuestIp {
  $adapter = Get-VMNetworkAdapter -VMName 'project-truth-node-01' -ErrorAction SilentlyContinue
  if ($adapter) {
    $ip = $adapter.IPAddresses | Where-Object {
      $_ -match '^\d+\.\d+\.\d+\.\d+$' -and $_ -notmatch '^169\.254\.'
    } | Select-Object -First 1
    if ($ip) { return $ip }
  }
  return ''
}

Set-Location $repoRoot
"Elevated proof started: $(Get-Date -Format o)" | Tee-Object -FilePath $log
"Run root: $runRoot" | Tee-Object -FilePath $log -Append

Invoke-ProofStep 'preflight-git-status' { git status --short --branch }
Invoke-ProofStep 'preflight-git-remote' { git remote -v }
Invoke-ProofStep 'preflight-gh-auth' { gh auth status }
Invoke-ProofStep 'preflight-gh-runs' { gh run list --limit 5 }
Invoke-ProofStep 'preflight-powershell' { $PSVersionTable }
Invoke-ProofStep 'preflight-whoami-groups' { whoami /groups }
Invoke-ProofStep 'preflight-commands' { Get-Command terraform, git, gh, ssh, curl -ErrorAction SilentlyContinue | Format-Table -AutoSize }
Invoke-ProofStep 'preflight-hyperv-commands' { Get-Command Get-VM, Get-VMSwitch, Get-VMNetworkAdapter -ErrorAction SilentlyContinue | Format-Table -AutoSize }

Invoke-ProofStep 'installer-build' { .\installer\build-installer.ps1 }
Invoke-ProofStep 'installer-install-programfiles' { .\installer\install-project-truth.ps1 -InstallDir "$env:ProgramFiles\ProjectTruth" }
Invoke-ProofStep 'installer-verify-programfiles' { .\installer\verify-install.ps1 -InstallDir "$env:ProgramFiles\ProjectTruth" }
Invoke-ProofStep 'shortcut-proof' {
  $shell = New-Object -ComObject WScript.Shell
  $shortcutRoot = Join-Path $env:ProgramData 'Microsoft\Windows\Start Menu\Programs\Project Truth'
  Get-ChildItem $shortcutRoot -Filter *.lnk | ForEach-Object {
    $shortcut = $shell.CreateShortcut($_.FullName)
    [pscustomobject]@{
      Name = $_.Name
      TargetPath = $shortcut.TargetPath
      Arguments = $shortcut.Arguments
      WorkingDirectory = $shortcut.WorkingDirectory
    }
  } | Format-Table -AutoSize
}

Invoke-ProofStep 'doctor' { .\scripts\project-truth.ps1 doctor }
Invoke-ProofStep 'programdata-tree' {
  Get-ChildItem -Recurse "$env:ProgramData\ProjectTruth" -ErrorAction SilentlyContinue |
    Select-Object FullName,Length,LastWriteTime |
    Format-Table -AutoSize
}

if ($ImagePath) {
  Invoke-ProofStep 'select-image' { .\scripts\project-truth.ps1 select-image -ImagePath $ImagePath }
}

$selectedImage = if ($ImagePath) { $ImagePath } else { Get-ConfiguredImagePath }
Invoke-ProofStep 'image-truth' {
  "Selected image path: $selectedImage"
  "Exists: $(Test-Path -LiteralPath $selectedImage)"
  Get-ChildItem "$env:ProgramData\ProjectTruth\images" -Force -ErrorAction SilentlyContinue |
    Select-Object FullName,Length,LastWriteTime |
    Format-Table -AutoSize
}

if (-not (Test-Path -LiteralPath $selectedImage)) {
  Invoke-ProofStep 'vhdx-search' {
    if (Get-Command rg -ErrorAction SilentlyContinue) {
      Push-Location "$env:USERPROFILE\OneDrive\Desktop"
      rg --files -g '*.vhdx' -g '*.sha256' . 2>$null
      Pop-Location
    }
    Get-ChildItem "$env:ProgramData\ProjectTruth\images", "$env:USERPROFILE\Downloads" -Recurse -Include *.vhdx,*.sha256 -ErrorAction SilentlyContinue |
      Select-Object FullName,Length,LastWriteTime |
      Format-Table -AutoSize
  }
}

Invoke-ProofStep 'terraform-fmt' { terraform -chdir=terraform-hyperv fmt -recursive }
Invoke-ProofStep 'terraform-init' { terraform -chdir=terraform-hyperv init }
Invoke-ProofStep 'terraform-validate' { terraform -chdir=terraform-hyperv validate }
Invoke-ProofStep 'terraform-plan' { .\scripts\project-truth.ps1 terraform-plan }

$guestIp = ''
if ($Apply -and (Test-Path -LiteralPath $selectedImage)) {
  Invoke-ProofStep 'terraform-apply' { .\scripts\project-truth.ps1 terraform-apply -Apply }
  Invoke-ProofStep 'vm-facts' {
    Get-VM -Name 'project-truth-node-01' -ErrorAction SilentlyContinue | Format-List *
    Get-VMNetworkAdapter -VMName 'project-truth-node-01' -ErrorAction SilentlyContinue | Format-List *
    Get-VHD -Path $selectedImage -ErrorAction SilentlyContinue | Format-List *
  }

  Invoke-ProofStep 'guest-ip-discovery' {
    $deadline = (Get-Date).AddMinutes(20)
    do {
      Get-VM -Name 'project-truth-node-01' -ErrorAction SilentlyContinue | Select-Object Name,State,Status,Uptime
      Get-VMNetworkAdapter -VMName 'project-truth-node-01' -ErrorAction SilentlyContinue | Select-Object VMName,SwitchName,MacAddress,IPAddresses,Status
      $script:guestIp = Find-GuestIp
      if ($script:guestIp) { "GuestIp=$script:guestIp"; break }
      Start-Sleep -Seconds 15
    } while ((Get-Date) -lt $deadline)
    arp -a
    Get-NetNeighbor -AddressFamily IPv4
  }
  $guestIp = $script:guestIp
} elseif ($Apply) {
  Invoke-ProofStep 'terraform-apply' { "SKIPPED BY SAFETY GATE: selected VHDX is missing at $selectedImage" }
} else {
  Invoke-ProofStep 'terraform-apply' { 'SKIPPED BY SAFETY GATE: pass -Apply after selecting a real VHDX.' }
}

if ($guestIp) {
  Invoke-ProofStep 'health-watch' { .\scripts\project-truth.ps1 watch-until-healthy -GuestIp $guestIp -MaxHours $MaxHours }
  Invoke-ProofStep 'inside-vm-proof' {
    ssh "infra@$guestIp" "hostname; ip -br addr; docker ps || true; sudo kubectl get nodes -o wide; sudo kubectl get pods -A -o wide; sudo kubectl get svc -A -o wide; sudo kubectl get applications -n argocd -o wide || true"
    ssh "infra@$guestIp" "sudo kubectl get events -A --sort-by=.lastTimestamp | tail -80; sudo kubectl -n dev get deploy,svc,pods; sudo kubectl -n uat get deploy,svc,pods; sudo kubectl -n prod get deploy,svc,pods"
  }
} else {
  Invoke-ProofStep 'health-watch' { 'NOT TESTED: no guest IP is available.' }
  Invoke-ProofStep 'inside-vm-proof' { 'NOT TESTED: no guest IP is available.' }
}

Invoke-ProofStep 'repair-and-verify' { .\scripts\repair-and-verify.ps1 -MaxHours $MaxHours }

if ($WatchGitHubActions) {
  Invoke-ProofStep 'github-actions' {
    gh run list --limit 10
    $latest = gh run list --limit 1 --json databaseId --jq '.[0].databaseId'
    if ($latest) { gh run watch $latest --exit-status }
    gh pr list --state open
  }
}

$summary = Join-Path $runRoot 'summary.md'
$selectedExists = Test-Path -LiteralPath $selectedImage
$summaryLines = @(
  '# Elevated Proof Summary',
  '',
  "Run root: $runRoot",
  "Finished: $(Get-Date -Format o)",
  '',
  '## PROVEN',
  '',
  '- Elevated proof runner executed as Administrator.',
  '- Installer build/install/verify steps ran.',
  '- Common Start Menu shortcuts were inspected.',
  '- Doctor, Terraform init, Terraform validate, and Terraform plan ran.',
  '',
  '## BLOCKED',
  '',
  "- Selected VHDX exists: $selectedExists",
  "- Selected VHDX path: $selectedImage",
  '',
  '## SKIPPED BY SAFETY GATE',
  '',
  '- Terraform apply was skipped unless `-Apply` was supplied and the selected VHDX existed.',
  '',
  '## NOT TESTED',
  '',
  '- VM boot, guest IP, LAN health, SSH, Kubernetes, and Argo CD remain not tested unless `terraform-apply.txt`, `guest-ip-discovery.txt`, `health-watch.txt`, and `inside-vm-proof.txt` show live success.',
  '',
  '## Next Exact Command',
  '',
  '```powershell',
  '.\scripts\run-elevated-proof.ps1 -Apply -ImagePath C:\ProgramData\ProjectTruth\images\project-truth-node-latest.vhdx -WatchGitHubActions',
  '```'
)
$summaryLines | Set-Content -LiteralPath $summary -Encoding UTF8

"Elevated proof finished: $(Get-Date -Format o)" | Tee-Object -FilePath $log -Append
Write-Host "Elevated proof complete. Summary: $summary"
