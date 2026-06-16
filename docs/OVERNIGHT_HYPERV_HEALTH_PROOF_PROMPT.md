# Overnight Self-Loop Prompt: Project Truth VHDX Gate To Full Hyper-V Proof

## Research Summary On Current Blocker

- `New-VHD` can create a `.vhdx`, but that would be an empty virtual disk, not a bootable Project Truth image. Microsoft docs: https://learn.microsoft.com/en-us/powershell/module/hyper-v/new-vhd
- `Convert-VHD` only converts an existing virtual disk; it cannot create the missing bootable K3s/Argo image from nothing. Microsoft docs: https://learn.microsoft.com/en-us/powershell/module/hyper-v/convert-vhd
- `Get-VHD` is the right proof command once a VHDX exists. Microsoft docs: https://learn.microsoft.com/en-us/powershell/module/hyper-v/get-vhd
- Packer Hyper-V can build/export a Hyper-V VM/image from ISO, but that is the maintainer image-factory path, not the normal installed-user path. HashiCorp docs: https://developer.hashicorp.com/packer/integrations/hashicorp/hyperv/latest/components/builder/iso

The real blocker is this:

```text
You need a bootable Project Truth VHDX artifact, not just any .vhdx file.
```

Important: do not create a fake empty VHDX. That would pass `Test-Path` but fail the real goal. The missing artifact must be a bootable Project Truth VHDX with K3s/Argo content.

## Mission

Run Project Truth proof in a safe self-loop until the actual goal is achieved:

```text
PROVEN: full installed user journey + Hyper-V VM + health + SSH + Kubernetes + Argo CD pass
```

Do not stop merely because the VHDX is missing. The agent must try to create it through the real image-factory path. Packer is expected to download the Ubuntu Server ISO declared in `image-factory\packer\ubuntu-hyperv.pkr.hcl`, install Ubuntu, provision K3s and Argo CD, and produce the bootable VHDX.

Hard stop only for conditions the agent cannot safely repair:

```text
BLOCKED: current shell is not Administrator
BLOCKED: Hyper-V is unavailable on this Windows host
BLOCKED: Packer cannot download Ubuntu after repeated retry with captured error
BLOCKED: bootable image build repeatedly fails with evidence
BLOCKED: a destructive operation would be required but was not explicitly allowed
```

For all other failures, repair or retry and keep looping.

Do not use:

- UACME
- Akagi
- UAC bypasses
- token tricks
- `Start-Process -Verb RunAs`
- `scripts\run-elevated-proof.ps1`
- security weakening steps

Work only from the current already-elevated Administrator shell.

## Working Folder

```powershell
cd C:\Users\anoni\OneDrive\Desktop\PROJECT_TRUTH_HYPERV_FRESH
```

## Runtime Defaults

```powershell
$CheckpointHours = 8
$SleepMinutes = 15
$RequiredVhdx = "C:\ProgramData\ProjectTruth\images\project-truth-node-latest.vhdx"
$NextCheckpoint = (Get-Date).AddHours($CheckpointHours)
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$runRoot = ".runtime\overnight\$stamp"
New-Item -ItemType Directory -Force -Path $runRoot, "$runRoot\screenshots" | Out-Null
"RunRoot=$runRoot" | Tee-Object "$runRoot\run.log"
```

## Stop Condition

The agent stops only when this file exists and says `PROVEN`:

```text
$runRoot\final-truth.txt
```

The goal is achieved only when all of these are proven from real command output:

```text
PROVEN: installed Project Truth works from Program Files
PROVEN: Start Menu shortcuts target installed files
PROVEN: bootable Project Truth VHDX exists and has SHA256
PROVEN: Terraform init/validate/plan pass
PROVEN: Terraform apply created/runs project-truth-node-01
PROVEN: VM IP discovered
PROVEN: host-local DEV/UAT/PROD health pass
PROVEN: LAN DEV/UAT/PROD health pass
PROVEN: SSH works
PROVEN: Kubernetes node is Ready
PROVEN: DEV/UAT/PROD pods and services exist
PROVEN: Argo CD applications are visible, ideally Synced/Healthy
```

## Phase 1: Fail Fast Admin Proof

```powershell
whoami /groups *>&1 | Tee-Object "$runRoot\whoami-groups.txt"
net session *>&1 | Tee-Object "$runRoot\net-session.txt"

if ($LASTEXITCODE -ne 0) {
  "BLOCKED ON ADMIN SHELL. Open Administrator PowerShell and rerun from C:\Users\anoni\OneDrive\Desktop\PROJECT_TRUTH_HYPERV_FRESH" | Tee-Object "$runRoot\final-truth.txt"
  exit 1
}
```

## Phase 2: Repo And Wrapper Proof

```powershell
git status --short --branch *>&1 | Tee-Object "$runRoot\git-status.txt"
git rev-parse --short HEAD *>&1 | Tee-Object "$runRoot\git-commit.txt"
git remote -v *>&1 | Tee-Object "$runRoot\git-remote.txt"

Test-Path scripts\run-elevated-proof.ps1 *>&1 | Tee-Object "$runRoot\wrapper-script-testpath.txt"
Test-Path docs\ELEVATED_OVERNIGHT_PROOF_PROMPT.md *>&1 | Tee-Object "$runRoot\wrapper-doc-testpath.txt"
rg -n "run-elevated-proof|ELEVATED_OVERNIGHT_PROOF_PROMPT|run-elevated" . *>&1 | Tee-Object "$runRoot\wrapper-rg.txt"
```

## Phase 3: Syntax And Preflight

```powershell
$errors = @()
Get-ChildItem -Recurse -Include *.ps1 | Where-Object { $_.FullName -notmatch '\\.runtime\\|\\dist\\' } | ForEach-Object {
  $tokens = $null
  $parseErrors = $null
  [System.Management.Automation.Language.Parser]::ParseFile($_.FullName, [ref]$tokens, [ref]$parseErrors) | Out-Null
  if ($parseErrors.Count -gt 0) { $errors += $parseErrors }
}
if ($errors.Count -gt 0) { throw $errors }

gh auth status *>&1 | Tee-Object "$runRoot\gh-auth.txt"
gh run list --limit 10 *>&1 | Tee-Object "$runRoot\gh-runs-before.txt"
Get-Command terraform, git, gh, ssh, curl -ErrorAction SilentlyContinue | Format-Table -AutoSize | Out-String | Tee-Object "$runRoot\commands.txt"
Get-Command Get-VM, Get-VMSwitch, Get-VMNetworkAdapter, Get-VHD -ErrorAction SilentlyContinue | Format-Table -AutoSize | Out-String | Tee-Object "$runRoot\hyperv-commands.txt"
```

## Phase 4: Installed User Journey

```powershell
.\installer\build-installer.ps1 *>&1 | Tee-Object "$runRoot\installer-build.txt"
.\installer\install-project-truth.ps1 -InstallDir "$env:ProgramFiles\ProjectTruth" *>&1 | Tee-Object "$runRoot\installer-install-programfiles.txt"
.\installer\verify-install.ps1 -InstallDir "$env:ProgramFiles\ProjectTruth" *>&1 | Tee-Object "$runRoot\installer-verify-programfiles.txt"

$shell = New-Object -ComObject WScript.Shell
$shortcutRoot = Join-Path $env:ProgramData "Microsoft\Windows\Start Menu\Programs\Project Truth"
Get-ChildItem $shortcutRoot -Filter *.lnk | ForEach-Object {
  $s = $shell.CreateShortcut($_.FullName)
  [pscustomobject]@{
    Name = $_.Name
    TargetPath = $s.TargetPath
    Arguments = $s.Arguments
    WorkingDirectory = $s.WorkingDirectory
  }
} | Format-Table -AutoSize | Out-String | Tee-Object "$runRoot\shortcut-proof.txt"
```

## Phase 5: Self-Loop VHDX Gate

First try to create the missing artifact through the real maintainer image-factory path. This is allowed because it uses Packer to build a bootable Project Truth image. It must not use `New-VHD` as a shortcut.

```powershell
if (-not (Test-Path $RequiredVhdx)) {
  "ACTION: starting real Packer Hyper-V image build. Packer will download Ubuntu ISO if not cached." | Tee-Object "$runRoot\image-build.txt"
  .\scripts\project-truth.ps1 build-image *>&1 | Tee-Object "$runRoot\image-build.txt" -Append
}
```

If a bootable VHDX already exists somewhere else, publish it explicitly instead of running a new build:

```powershell
.\scripts\project-truth.ps1 build-image -SkipBuild -BuiltImagePath "<path-to-bootable-project-truth.vhdx>" *>&1 | Tee-Object "$runRoot\image-publish-existing.txt"
```

Then loop until a real selected VHDX exists. Missing VHDX is not a stop condition.

```powershell
while ($true) {
  "LoopStart=$(Get-Date -Format o)" | Tee-Object "$runRoot\vhdx-loop.log" -Append

  Get-Content C:\ProgramData\ProjectTruth\config\project-truth.json *>&1 | Tee-Object "$runRoot\project-truth-config.txt"
  Get-ChildItem C:\ProgramData\ProjectTruth\images -Force *>&1 | Tee-Object "$runRoot\programdata-images.txt"
  Test-Path $RequiredVhdx | Tee-Object "$runRoot\selected-vhdx-testpath.txt"

  if (Test-Path $RequiredVhdx) {
    Get-VHD -Path $RequiredVhdx | Format-List * | Out-String | Tee-Object "$runRoot\vhd-facts.txt"
    Get-FileHash $RequiredVhdx -Algorithm SHA256 | Format-List | Out-String | Tee-Object "$runRoot\vhdx-checksum.txt"
    "PROVEN: selected VHDX exists at $RequiredVhdx" | Tee-Object "$runRoot\vhdx-loop.log" -Append
    break
  }

  $roots = @(
    "C:\ProgramData\ProjectTruth\images",
    "C:\Users\anoni\OneDrive\Desktop",
    "C:\Users\anoni\Downloads"
  )

  $found = $roots | ForEach-Object {
    Get-ChildItem $_ -Recurse -Include *.vhdx,*.sha256 -ErrorAction SilentlyContinue |
      Select-Object FullName,Length,LastWriteTime
  }

  $found | Format-Table -AutoSize | Out-String | Tee-Object "$runRoot\vhdx-search.txt"

  $projectTruthCandidate = $found |
    Where-Object { $_.FullName -like "*.vhdx" -and $_.FullName -match "project-truth|project_truth|projecttruth" } |
    Sort-Object LastWriteTime -Descending |
    Select-Object -First 1

  if ($projectTruthCandidate) {
    "ACTION: publishing trusted Project Truth VHDX candidate: $($projectTruthCandidate.FullName)" | Tee-Object "$runRoot\vhdx-loop.log" -Append
    .\scripts\project-truth.ps1 build-image -SkipBuild -BuiltImagePath $projectTruthCandidate.FullName *>&1 | Tee-Object "$runRoot\image-publish-candidate.txt"
    continue
  }

  if ((Get-Date) -ge $NextCheckpoint) {
    "CHECKPOINT: still building/searching for bootable Project Truth VHDX. Continuing until goal is achieved." | Tee-Object "$runRoot\checkpoint.txt" -Append
    gh run list --limit 10 *>&1 | Tee-Object "$runRoot\gh-runs-checkpoint.txt"
    $NextCheckpoint = (Get-Date).AddHours($CheckpointHours)
  }

  "ACTION: no trusted Project Truth VHDX yet. Retrying real Packer image build, then sleeping $SleepMinutes minutes." | Tee-Object "$runRoot\vhdx-loop.log" -Append
  .\scripts\project-truth.ps1 build-image *>&1 | Tee-Object "$runRoot\image-build-retry.txt"
  Start-Sleep -Seconds ($SleepMinutes * 60)
}
```

## Phase 6: Terraform Static Proof

```powershell
terraform -chdir=terraform-hyperv fmt -recursive *>&1 | Tee-Object "$runRoot\terraform-fmt.txt"
terraform -chdir=terraform-hyperv init *>&1 | Tee-Object "$runRoot\terraform-init.txt"
terraform -chdir=terraform-hyperv validate *>&1 | Tee-Object "$runRoot\terraform-validate.txt"
.\scripts\project-truth.ps1 terraform-plan *>&1 | Tee-Object "$runRoot\terraform-plan.txt"
```

## Phase 7: Terraform Apply

Only runs because the VHDX gate passed.

```powershell
.\scripts\project-truth.ps1 terraform-apply -Apply *>&1 | Tee-Object "$runRoot\terraform-apply.txt"
```

## Phase 8: VM Facts And IP Discovery

```powershell
Get-VM -Name project-truth-node-01 | Format-List * | Out-String | Tee-Object "$runRoot\vm-facts.txt"
Get-VMNetworkAdapter -VMName project-truth-node-01 | Format-List * | Out-String | Tee-Object "$runRoot\vm-network.txt"

Get-VMNetworkAdapter -VMName project-truth-node-01 |
  Select-Object VMName,SwitchName,MacAddress,IPAddresses,Status |
  Format-List | Out-String | Tee-Object "$runRoot\guest-ip-discovery.txt"

arp -a *>&1 | Tee-Object "$runRoot\arp.txt"
Get-NetNeighbor -AddressFamily IPv4 *>&1 | Tee-Object "$runRoot\net-neighbor.txt"
```

If no guest IP is discovered, run:

```powershell
.\scripts\repair-and-verify.ps1 -MaxHours 8 *>&1 | Tee-Object "$runRoot\repair-and-verify.txt"
```

## Phase 9: Health, SSH, Kubernetes, Argo CD

Replace `<guest-lan-ip>` with the discovered VM IP.

```powershell
curl.exe http://127.0.0.1:3001/health *>&1 | Tee-Object "$runRoot\health-host-dev.txt"
curl.exe http://127.0.0.1:3002/health *>&1 | Tee-Object "$runRoot\health-host-uat.txt"
curl.exe http://127.0.0.1:3000/health *>&1 | Tee-Object "$runRoot\health-host-prod.txt"

curl.exe http://<guest-lan-ip>:3001/health *>&1 | Tee-Object "$runRoot\health-lan-dev.txt"
curl.exe http://<guest-lan-ip>:3002/health *>&1 | Tee-Object "$runRoot\health-lan-uat.txt"
curl.exe http://<guest-lan-ip>:3000/health *>&1 | Tee-Object "$runRoot\health-lan-prod.txt"

ssh infra@<guest-lan-ip> "hostname; ip -br addr; docker ps || true; sudo kubectl get nodes -o wide; sudo kubectl get pods -A -o wide; sudo kubectl get svc -A -o wide; sudo kubectl get applications -n argocd -o wide || true" *>&1 | Tee-Object "$runRoot\inside-vm-proof.txt"
```

## Phase 10: CI And Docs

```powershell
gh run list --limit 10 *>&1 | Tee-Object "$runRoot\gh-runs-after.txt"
gh pr list --state open *>&1 | Tee-Object "$runRoot\gh-prs-open.txt"
```

## Phase 11: Goal Achievement Loop

After each full pass, evaluate the proof files. If any required proof is missing, repair the failing layer and loop back to the correct phase:

```text
Missing VHDX -> Phase 5, run real Packer image build again
Terraform failure -> Phase 6, capture error, repair tfvars/provider/config, retry
VM not running -> Phase 7/8, inspect Hyper-V state, retry apply without destructive reset
No guest IP -> Phase 8, poll Hyper-V adapter/ARP/neighbor table, run repair-and-verify, retry
Health failure -> Phase 9, collect curl + SSH + kubectl evidence, retry repair-and-verify
Kubernetes/Argo failure -> Phase 9, collect pods/events/apps, retry until healthy or hard blocker
CI failure -> Phase 10, inspect failed logs, repair source/docs/workflow, rerun
```

Use this completion check:

```powershell
$requiredProof = @{
  Installed = Test-Path "$runRoot\installer-verify-programfiles.txt"
  Shortcuts = Test-Path "$runRoot\shortcut-proof.txt"
  Vhdx = Test-Path $RequiredVhdx
  VhdxChecksum = Test-Path "$runRoot\vhdx-checksum.txt"
  TerraformInit = Test-Path "$runRoot\terraform-init.txt"
  TerraformValidate = Test-Path "$runRoot\terraform-validate.txt"
  TerraformPlan = Test-Path "$runRoot\terraform-plan.txt"
  TerraformApply = Test-Path "$runRoot\terraform-apply.txt"
  VmFacts = Test-Path "$runRoot\vm-facts.txt"
  GuestIp = Test-Path "$runRoot\guest-ip-discovery.txt"
  HostDev = Test-Path "$runRoot\health-host-dev.txt"
  HostUat = Test-Path "$runRoot\health-host-uat.txt"
  HostProd = Test-Path "$runRoot\health-host-prod.txt"
  LanDev = Test-Path "$runRoot\health-lan-dev.txt"
  LanUat = Test-Path "$runRoot\health-lan-uat.txt"
  LanProd = Test-Path "$runRoot\health-lan-prod.txt"
  InsideVm = Test-Path "$runRoot\inside-vm-proof.txt"
}

$missing = $requiredProof.GetEnumerator() | Where-Object { -not $_.Value } | Select-Object -ExpandProperty Key
if ($missing.Count -eq 0) {
  "PROVEN: full Project Truth installed user journey, VHDX, Hyper-V VM, health, SSH, Kubernetes, and Argo CD proof completed." | Tee-Object "$runRoot\final-truth.txt"
} else {
  "CHECKPOINT: missing proof: $($missing -join ', '). Continue loop; do not stop." | Tee-Object "$runRoot\checkpoint.txt" -Append
}
```

Update:

```text
docs\USER_JOURNEY_PROOF.md
docs\INSTALLER_TEST_REPORT.md
docs\HEALTHCHECKS.md
docs\DEVOPS_RUNBOOK.md
docs\GAPS_AND_NEXT_GOALS.md
```

Never commit:

```text
.runtime
logs
screenshots
tfstate
tfvars
credentials
VHDX files
images
```

## Final Truth

Use only:

```text
PROVEN
BLOCKED
```

There is no final success until the full goal is achieved.

Only write final `PROVEN` when all required proof exists and the command outputs show real success:

```text
PROVEN: full Project Truth installed user journey, VHDX, Hyper-V VM, health, SSH, Kubernetes, and Argo CD proof completed.
```

Only write final `BLOCKED` for a hard stop condition the agent cannot repair safely, with the exact command output and next manual action.
