# Overnight Prompt: Prove Project Truth Hyper-V End To End

## Mission

You are running the next overnight Project Truth proof pass.

Do not stop at "repo looks good." Do not stop at "scripts exist." The missing proof is a real installed user journey plus a real Hyper-V VM boot from a selected Project Truth VHDX, followed by host-local health, LAN health, SSH, Kubernetes, Argo CD, and GitHub CI/CD verification.

The target architecture remains:

```text
prebuilt Project Truth Hyper-V VHDX
  -> Terraform on the Windows host creates/manages the VM
  -> VM boots K3s + Argo CD
  -> Argo CD syncs DEV/UAT/PROD GitOps manifests
  -> verifier proves host-local, LAN, and inside-VM health
```

Packer is maintainer-only. Terraform must not run `packer build`. VirtualBox/OVA is legacy only unless explicitly requested later.

## Working Folder

Primary fresh repo:

```text
C:\Users\anoni\OneDrive\Desktop\PROJECT_TRUTH_HYPERV_FRESH
```

Reference clean worktree, if needed:

```text
C:\Users\anoni\OneDrive\Desktop\INFRA_TERRAFORM_FIRST_CLEAN
```

Installed state to inspect first:

```text
C:\ProgramData\ProjectTruth\
|-- config\
|-- images\
|-- logs\
`-- state\
```

Current known gap:

```text
C:\ProgramData\ProjectTruth\images is empty or no valid Project Truth VHDX is selected.
Real terraform apply and live health have not been proven yet.
```

## Non-Negotiables

- Keep working until SUCCESS, TIMEOUT, or a real BLOCKED state with evidence.
- Use real paths and real command output. Do not invent health results.
- Run as Administrator for Hyper-V/Terraform apply work when needed.
- Do not delete existing VMs unless `DestroyExistingVmEnabled = true` is explicitly set by the user.
- Do not create a Windows user or invent a password.
- Do not install unrelated apps.
- Do not commit runtime logs, screenshots, local tfvars, credentials, or downloaded images.
- Every blocker must include the exact next command and the exact file/path that is missing or wrong.
- If a step fails, repair it once when safe, then rerun the exact validation.
- Final answer must distinguish PROVEN, BLOCKED, SKIPPED BY SAFETY GATE, and NOT TESTED.

## Research Anchors To Respect

- Terraform provisioners should be avoided unless there is no better option because Terraform cannot model their side effects predictably: https://developer.hashicorp.com/terraform/language/provisioners
- Hyper-V host and VM facts should be inspected with official Hyper-V PowerShell cmdlets such as `Get-VM` and `Get-VMNetworkAdapter`: https://learn.microsoft.com/en-us/powershell/module/hyper-v/
- Argo CD application state must be checked as live desired-vs-actual sync and health state: https://argo-cd.readthedocs.io/
- GitHub self-hosted runners require safety boundaries, especially for private repos and trusted workflows: https://docs.github.com/actions/hosting-your-own-runners
- Inno Setup silent installer behavior should be validated with documented command-line switches: https://jrsoftware.org/ishelp/topic_setupcmdline.htm

## Overnight Runtime Defaults

Use these defaults unless the user has explicitly overridden them:

```text
MaxHours = 8
TerraformApplyEnabled = true
DestroyExistingVmEnabled = false
CreateWindowsUserEnabled = false
UsePackerForNormalPath = false
CaptureScreenshots = true
PushGitHubChanges = true
WatchGitHubActions = true
```

If Administrator permission is required, open or instruct use of an elevated PowerShell and continue there. Do not silently skip Hyper-V proof because the shell is not elevated.

## Required Output Files

Create or update:

```text
docs\USER_JOURNEY_PROOF.md
docs\INSTALLER_TEST_REPORT.md
docs\HEALTHCHECKS.md
docs\DEVOPS_RUNBOOK.md
docs\GAPS_AND_NEXT_GOALS.md
.runtime\overnight\<timestamp>\run.log
.runtime\overnight\<timestamp>\summary.md
.runtime\overnight\<timestamp>\screenshots\
```

Do not commit `.runtime`.

## Ordered Execution

### Phase 0: Preflight Truth Capture

Run and log:

```powershell
cd C:\Users\anoni\OneDrive\Desktop\PROJECT_TRUTH_HYPERV_FRESH
git status --short --branch
git remote -v
gh auth status
gh run list --limit 5
$PSVersionTable
whoami /groups
Get-Command terraform, git, gh, ssh, curl -ErrorAction SilentlyContinue
Get-Command Get-VM, Get-VMSwitch, Get-VMNetworkAdapter -ErrorAction SilentlyContinue
Get-ChildItem -Recurse C:\ProgramData\ProjectTruth -ErrorAction SilentlyContinue
```

Write the truth into `.runtime\overnight\<timestamp>\preflight.md`.

If Hyper-V cmdlets are missing, document the Windows edition/feature blocker and continue installer, repo, CI, and static validation.

### Phase 1: Fresh Repo Drift Check

Verify the repo still matches the clean architecture:

```powershell
rg -n "VirtualBox|VBoxManage|OVA|terraform inside|packer build" .
rg -n "source_image_path|project-truth-node|NodePort|3001|3002|3000|argocd|k3s" .
```

Rules:

- Any VirtualBox/OVA wording must be legacy-only, not normal path.
- `terraform-hyperv` must consume a VHDX path.
- Terraform must not call Packer.
- Packer must live under `image-factory`.

Repair docs or scripts if they contradict this.

### Phase 2: Installer And Shortcut Proof

Build and install:

```powershell
.\installer\build-installer.ps1
.\installer\install-project-truth.ps1 -InstallDir "$env:ProgramFiles\ProjectTruth"
```

If Inno Setup exists, also build and run:

```powershell
iscc .\installer\project-truth.iss
.\dist\ProjectTruthSetup.exe /VERYSILENT /SUPPRESSMSGBOXES /NORESTART /LOG="$env:TEMP\project-truth-install.log"
```

If Inno Setup is missing, mark it as FALLBACK USED and prove the PowerShell installer works.

Inspect actual shortcuts:

```powershell
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
}
```

Required shortcuts:

```text
Project Truth Doctor
Select Project Truth Image
Terraform Plan
Apply Hyper-V VM
Watch Until Healthy
Repair And Verify
Open Project Truth Folder
Open Logs
Open Documentation
```

Acceptance:

- Shortcuts point to installed files under `%ProgramFiles%\ProjectTruth`, not the repo.
- Logs shortcut points to `C:\ProgramData\ProjectTruth\logs`.
- Docs shortcut points to installed docs.
- Doctor, configure, terraform-plan, and repair-and-verify run from the installed CLI.

Capture screenshots if a desktop UI or Start Menu inspection is available. Save under `.runtime\overnight\<timestamp>\screenshots`.

### Phase 3: Image Artifact Truth

Inspect config and images:

```powershell
Get-Content C:\ProgramData\ProjectTruth\config\project-truth.json
Get-ChildItem C:\ProgramData\ProjectTruth\images -Force
.\scripts\project-truth.ps1 doctor
```

If no VHDX is selected, search likely local locations without scanning the whole disk forever:

```powershell
$roots = @(
  "C:\ProgramData\ProjectTruth\images",
  "C:\Users\anoni\OneDrive\Desktop",
  "C:\Users\anoni\Downloads"
)
$roots | ForEach-Object {
  Get-ChildItem $_ -Recurse -Include *.vhdx,*.sha256 -ErrorAction SilentlyContinue |
    Select-Object FullName,Length,LastWriteTime
}
```

If a likely Project Truth VHDX exists:

```powershell
.\scripts\project-truth.ps1 select-image -ImagePath "<real-vhdx-path>"
.\scripts\project-truth.ps1 doctor
```

If no VHDX exists:

- Do not fake it.
- Do not switch to OVA.
- Do not run Packer unless the user explicitly approves maintainer image build.
- Mark BLOCKED: missing prebuilt VHDX.
- Still complete all static, installer, CI/CD, and runbook proof.
- Write the exact required artifact contract: file name, expected folder, checksum file, and next command.

### Phase 4: Terraform Static Proof

Run:

```powershell
terraform -chdir=terraform-hyperv fmt -recursive
terraform -chdir=terraform-hyperv init
terraform -chdir=terraform-hyperv validate
.\scripts\project-truth.ps1 terraform-plan
```

If plan fails from missing VHDX, repair image config if the VHDX exists. If no VHDX exists, report BLOCKED at the image artifact layer, not repo failure.

### Phase 5: Real Hyper-V Apply

Only run if a real selected VHDX exists and Hyper-V is available:

```powershell
.\scripts\project-truth.ps1 terraform-apply -Apply
```

After apply, inspect:

```powershell
Get-VM -Name project-truth-node-01 | Format-List *
Get-VMNetworkAdapter -VMName project-truth-node-01 | Format-List *
Get-VHD -Path "<selected-vhdx-or-created-vhdx-path>" | Format-List *
```

Do not destroy or recreate a conflicting VM by default. If a VM already exists, inspect and report whether it matches expected name, switch, memory, CPU, disk, and network.

### Phase 6: Guest IP Discovery

Find the guest IP using multiple sources:

```powershell
Get-VMNetworkAdapter -VMName project-truth-node-01 |
  Select-Object VMName,SwitchName,MacAddress,IPAddresses,Status

arp -a
Get-NetNeighbor -AddressFamily IPv4
```

If no IP appears, poll until timeout. Log VM state every loop. Do not call success without an IP or explicit host-local port forwarding proof.

### Phase 7: Health Watch

When guest IP is known:

```powershell
.\scripts\project-truth.ps1 watch-until-healthy -GuestIp <guest-lan-ip> -MaxHours 8
```

Required host-local checks:

```powershell
curl.exe http://127.0.0.1:3001/health
curl.exe http://127.0.0.1:3002/health
curl.exe http://127.0.0.1:3000/health
```

Required LAN checks:

```powershell
curl.exe http://<guest-lan-ip>:3001/health
curl.exe http://<guest-lan-ip>:3002/health
curl.exe http://<guest-lan-ip>:3000/health
```

Each health response must prove environment identity:

```json
{"status":"ok","environment":"DEV","version":"...","hostname":"..."}
```

If host-local fails but LAN passes, report the host-local port-forwarding/design gap and propose the exact fix. Do not hide it.

### Phase 8: Inside-VM Proof

Run:

```powershell
ssh infra@<guest-lan-ip> "hostname; ip -br addr; docker ps || true; sudo kubectl get nodes -o wide; sudo kubectl get pods -A -o wide; sudo kubectl get svc -A -o wide; sudo kubectl get applications -n argocd -o wide || true"
```

Also capture useful failure detail:

```powershell
ssh infra@<guest-lan-ip> "sudo kubectl get events -A --sort-by=.lastTimestamp | tail -80; sudo kubectl -n dev get deploy,svc,pods; sudo kubectl -n uat get deploy,svc,pods; sudo kubectl -n prod get deploy,svc,pods"
```

Acceptance:

- SSH connects.
- Hostname is captured.
- IP addresses are captured.
- Docker state is captured if Docker exists.
- Kubernetes node is Ready.
- DEV/UAT/PROD pods are Running or reason is documented.
- DEV/UAT/PROD services expose NodePorts 3001, 3002, 3000.
- Argo CD applications are Synced and Healthy, or exact drift is documented.

### Phase 9: GitHub CI/CD Watch

Run:

```powershell
gh run list --limit 10
gh run watch
gh run view --log-failed
gh pr list --state open
```

If workflows need changes, implement and push:

```powershell
git status --short
git add .
git commit -m "Prove Project Truth Hyper-V health journey"
git push
gh run watch
```

Validate at minimum:

- Node app syntax/install.
- PowerShell parser checks.
- Terraform fmt/init/validate.
- Kustomize render for dev/uat/prod.
- Packer validate only under image-factory, not normal install.
- Installer script validation.
- Shortcut contract validation if possible in CI.

### Phase 10: Self-Repair Loop

Run:

```powershell
.\scripts\project-truth.ps1 repair-and-verify -MaxHours 8
```

Repair policy:

- Missing Terraform: document install command; continue static checks where possible.
- Missing Hyper-V module: document Windows feature blocker; continue installer/CI/docs.
- Missing VHDX: search approved paths; if absent, BLOCKED with artifact contract.
- Bad checksum: delete only under `C:\ProgramData\ProjectTruth\images`, redownload once if URL configured, then BLOCKED if still bad.
- Terraform init provider failure: retry once; log failure.
- Existing VM: inspect, do not delete.
- No guest IP: poll Hyper-V adapter, ARP, DHCP hints; timeout with last known state.
- Health failure: collect curl output, Kubernetes events, pods, service state, app logs if available; retry until success or timeout.
- Bad shortcut: repair shortcut target and re-inspect.

### Phase 11: Final Report

Update:

```text
docs\USER_JOURNEY_PROOF.md
docs\INSTALLER_TEST_REPORT.md
docs\HEALTHCHECKS.md
docs\GAPS_AND_NEXT_GOALS.md
```

Final answer must include:

```text
Branch:
Commit:
Remote:
GitHub Actions:
Installed path:
ProgramData path:
Shortcut proof:
Screenshot folder:
Selected VHDX:
VHDX checksum:
Terraform init:
Terraform validate:
Terraform plan:
Terraform apply:
VM name:
VM switch:
VM IP:
Host-local DEV/UAT/PROD health:
LAN DEV/UAT/PROD health:
SSH:
Inside VM hostname/IPs:
Docker state:
Kubernetes nodes:
Kubernetes DEV/UAT/PROD pods:
Kubernetes DEV/UAT/PROD services:
Argo CD apps:
Self-repair result:
Truth:
Drift:
Gaps:
Next exact command:
```

Do not say "success" unless the real VM, health, and inside-VM proof passed. If blocked by missing VHDX, the correct final status is:

```text
BLOCKED ON IMAGE ARTIFACT, NOT REPO IMPLEMENTATION.
Installer/CLI/Terraform/GitOps/CI are proven.
Real Hyper-V boot and health are pending until a Project Truth VHDX exists at <exact path>.
Next exact command: .\scripts\project-truth.ps1 select-image -ImagePath <path-to-project-truth-node.vhdx>
```

## One-Shot Command Skeleton

Use this as the top-level flow:

```powershell
$ErrorActionPreference = "Continue"
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$runRoot = ".runtime\overnight\$stamp"
New-Item -ItemType Directory -Force -Path $runRoot, "$runRoot\screenshots" | Out-Null

git status --short --branch | Tee-Object "$runRoot\git-status.txt"
.\installer\build-installer.ps1 *>&1 | Tee-Object "$runRoot\installer-build.txt"
.\installer\install-project-truth.ps1 -InstallDir "$env:ProgramFiles\ProjectTruth" *>&1 | Tee-Object "$runRoot\installer-install.txt"
.\installer\verify-install.ps1 -InstallDir "$env:ProgramFiles\ProjectTruth" *>&1 | Tee-Object "$runRoot\installer-verify.txt"
.\scripts\project-truth.ps1 doctor *>&1 | Tee-Object "$runRoot\doctor.txt"
terraform -chdir=terraform-hyperv fmt -recursive *>&1 | Tee-Object "$runRoot\terraform-fmt.txt"
terraform -chdir=terraform-hyperv init *>&1 | Tee-Object "$runRoot\terraform-init.txt"
terraform -chdir=terraform-hyperv validate *>&1 | Tee-Object "$runRoot\terraform-validate.txt"
.\scripts\project-truth.ps1 terraform-plan *>&1 | Tee-Object "$runRoot\terraform-plan.txt"
.\scripts\project-truth.ps1 repair-and-verify -MaxHours 8 *>&1 | Tee-Object "$runRoot\repair-and-verify.txt"
gh run list --limit 10 *>&1 | Tee-Object "$runRoot\gh-runs.txt"
```

Then continue manually from the first BLOCKED/SUCCESS/TIMEOUT line. Do not abandon the run without writing the final report.
