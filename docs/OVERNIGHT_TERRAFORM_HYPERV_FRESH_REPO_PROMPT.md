# Overnight Prompt: Fresh Terraform Hyper-V Project Truth Repo

## Non-Negotiable Mission

You are not polishing the old appliance repo.

You are creating a fresh, clean Project Truth Hyper-V/Terraform repo based on the corrected architecture.

The final result must read like a new repo whose default path is:

```text
prebuilt Hyper-V image
  -> Terraform on the Windows host creates/manages the VM
  -> VM boots K3s + Argo CD platform
  -> Argo CD syncs DEV/UAT/PROD GitOps manifests
  -> verifier proves host-local, LAN, and inside-VM health
```

Do not design the normal path around Packer. Do not design it around VirtualBox. Do not design it around Terraform running inside the VM.

## Working Folder And Branch

Work only here:

```text
C:\Users\anoni\OneDrive\Desktop\INFRA_TERRAFORM_FIRST_CLEAN
```

Branch:

```text
terraform-hyperv-clean-plan
```

Do not work in the dirty source folder except to inspect or copy known-good source files. Treat the old repo as a source-material archive, not as the final product.

Do not copy:

```text
logs/
output/
packer_cache/
.terraform/
dist/*.ova
UACME/
local state files
dirty retry loops
VirtualBox-first scripts
Terraform-inside-VM deployment flow
```

## Goal

Create a fresh, minimal Project Truth repo shape based on the corrected architecture.

```text
Normal install:
  prebuilt Hyper-V image -> terraform apply -> Argo CD sync -> verify

Maintainer-only image rebuild:
  packer build -> publish VHDX artifact -> normal users consume artifact
```

The overnight output must make it obvious that:

```text
Terraform owns Hyper-V VM lifecycle.
Packer is optional image factory only.
Kubernetes + Argo CD own DEV/UAT/PROD apps.
The CLI verifies host-local and LAN health.
The verifier also proves what is actually running inside the VM.
The result is a clean repo/project, not a copied legacy repo.
```

## Architecture To Implement

This is the architecture to implement as the new Project Truth. Treat this hierarchy as the source of truth for the fresh repo.

```text
Physical Server / Laptop
|
|-- Windows Host OS
|   |
|   |-- Host Local Access
|   |   `-- 127.0.0.1
|   |
|   |-- Host LAN Access
|   |   `-- Example: 192.168.1.50
|   |
|   |-- Project Truth CLI
|   |   |-- doctor
|   |   |-- select-image
|   |   |-- download-image
|   |   |-- terraform-plan
|   |   |-- terraform-apply
|   |   |-- verify
|   |   `-- watch-until-healthy
|   |
|   |-- Prebuilt Hyper-V Image Artifact
|   |   |-- project-truth-node-<version>.vhdx
|   |   |-- project-truth-node-<version>.sha256
|   |   `-- checksum verified before Terraform uses it
|   |
|   |-- Terraform Host Layer
|   |   |-- provider: taliesins/hyperv
|   |   |-- creates/selects Hyper-V switch
|   |   |-- creates/copies/attaches VM disk from prebuilt VHDX
|   |   |-- creates Hyper-V VM
|   |   |-- sets CPU and memory
|   |   |-- connects VM network adapter
|   |   `-- outputs VM access info
|   |
|   `-- GitHub Actions Self-Hosted Runner
|       |-- runs tests
|       |-- builds app image
|       |-- pushes app image
|       `-- updates GitOps overlays
|
`-- Microsoft Hyper-V
    |
    |-- External / Bridge Switch
    |   `-- connected to physical LAN adapter
    |       `-- Wi-Fi or Ethernet
    |
    `-- Ubuntu Server VM: project-truth-node-01
        |
        |-- Guest LAN IP
        |   `-- Example: 192.168.1.80
        |
        |-- Platform
        |   |
        |   |-- K3s single-node Kubernetes
        |   |
        |   |-- Argo CD
        |   |   `-- watches GitOps manifests in GitHub
        |   |
        |   `-- Local Registry / Image Pull Config
        |
        `-- Kubernetes Cluster
            |
            |-- Namespace: dev
            |   |
            |   `-- DEV Application
            |       |
            |       |-- Kubernetes Deployment
            |       |   `-- Container: HR App / Node.js App
            |       |
            |       `-- Kubernetes Service
            |           `-- NodePort 3001
            |
            |-- Namespace: uat
            |   |
            |   `-- UAT Application
            |       |
            |       |-- Kubernetes Deployment
            |       |   `-- Container: HR App / Node.js App
            |       |
            |       `-- Kubernetes Service
            |           `-- NodePort 3002
            |
            `-- Namespace: prod
                |
                `-- PROD Application
                    |
                    |-- Kubernetes Deployment
                    |   `-- Container: HR App / Node.js App
                    |
                    `-- Kubernetes Service
                        `-- NodePort 3000
```

Packer belongs outside the normal hierarchy:

```text
Optional Image Factory / Maintainer Flow
|
`-- Packer
    |-- starts from Ubuntu media
    |-- installs/seeds base platform dependencies
    |-- prepares K3s / Argo CD bootstrap assets
    `-- builds/publishes a new VHDX only when the base platform changes
```

Do not let implementation drift from this architecture. If old files disagree with this hierarchy, the hierarchy wins.

## Research Basis

Use the tool boundaries from primary docs:

- Terraform manages infrastructure and should exhaust alternatives before using provisioners because Terraform cannot predictably model provisioner side effects: https://developer.hashicorp.com/terraform/language/provisioners
- Packer creates machine images; the Hyper-V builder can create and export Hyper-V VMs/images: https://developer.hashicorp.com/packer/integrations/hashicorp/hyperv
- Argo CD continuously compares Kubernetes live state to desired Git state: https://argo-cd.readthedocs.io/
- GitHub self-hosted runners execute workflows on machines we manage: https://docs.github.com/actions/hosting-your-own-runners
- Hyper-V Terraform provider docs: https://registry.terraform.io/providers/taliesins/hyperv/latest/docs/resources/machine_instance
- Hyper-V PowerShell cmdlets are the official Windows host management surface for detecting switches, VMs, adapters, and host capability: https://learn.microsoft.com/en-us/powershell/module/hyper-v/
- Windows Sandbox is a disposable isolated Windows desktop environment suitable for installer/user-journey testing: https://learn.microsoft.com/en-us/windows/security/application-security/application-isolation/windows-sandbox/
- Inno Setup supports command-line and silent install parameters for logged installer verification: https://jrsoftware.org/ishelp/topic_setupcmdline.htm
- GitHub Actions deployments support environments, concurrency groups, and protection rules for controlled releases: https://docs.github.com/actions/deployment/about-deployments/deploying-with-github-actions
- GitHub Actions concurrency prevents overlapping workflow/job runs for the same group: https://docs.github.com/actions/writing-workflows/choosing-what-your-workflow-does/control-the-concurrency-of-workflows-and-jobs
- GitHub warns that self-hosted runners are not clean ephemeral machines and can be persistently compromised by untrusted workflow code: https://docs.github.com/en/actions/reference/security/secure-use
- Argo CD automated sync lets CI/CD deploy by committing desired state to Git instead of directly calling the cluster: https://argo-cd.readthedocs.io/en/latest/user-guide/auto_sync/
- Argo CD sync phases and waves let manifests/hooks run in a predictable order: https://argo-cd.readthedocs.io/en/stable/user-guide/sync-waves/
- Kubernetes readiness, liveness, and startup probes are the platform-native health gates for containers: https://kubernetes.io/docs/concepts/workloads/pods/probes/

## DevOps / CI-CD Goal

The overnight work must prove the DevOps story, not only the local scripts.

The correct delivery model is:

```text
Developer push / PR
  -> GitHub Actions validate
  -> optional image build
  -> GitOps overlay update
  -> Argo CD detects Git drift
  -> Argo CD syncs DEV/UAT/PROD
  -> verifier watches GitHub run, Argo CD status, Kubernetes rollout, and health URLs
```

CI/CD must respect this boundary:

```text
GitHub Actions:
  validates code
  builds/pushes app images when configured
  updates GitOps manifests
  watches workflow status

Argo CD:
  owns Kubernetes apply/sync
  owns self-heal/prune behavior
  reports Synced/OutOfSync and Healthy/Degraded

Project Truth CLI:
  verifies host tools, image artifact, Terraform VM layer, health URLs, and inside-VM state
```

Do not make CI/CD SSH into the VM and manually mutate Kubernetes as the default deployment path. SSH is allowed only for diagnostics, image loading in a local lab fallback, or inside-VM verification.

Required CI/CD files:

```text
.github/workflows/
|-- validate.yml
|-- promote-gitops.yml
|-- release-image.yml, if image publishing is implemented
`-- nightly-verify.yml, if scheduled verification is safe
```

Required DevOps scripts/docs:

```text
scripts/watch-github-run.ps1
scripts/verify-gitops-state.ps1
docs/DEVOPS_RUNBOOK.md
docs/GAPS_AND_NEXT_GOALS.md
```

Minimum GitHub Actions expectations:

```text
validate.yml:
  runs on PR and push
  installs Terraform explicitly
  checks Node syntax/tests
  checks PowerShell parse
  checks Terraform fmt/init/validate
  checks Kustomize render for dev/uat/prod
  does not require Hyper-V on GitHub-hosted runners

promote-gitops.yml:
  workflow_dispatch only, unless release policy is decided
  validates environment input is dev/uat/prod
  validates image tag format
  updates only the selected overlay
  commits desired state to Git
  uses concurrency per environment

nightly-verify.yml:
  only if a trusted self-hosted runner is configured
  runs doctor
  verifies selected VHDX
  optionally runs terraform plan
  does not apply/destroy by default
  watches health and reports exact blockers
```

GitHub environments:

```text
DEV:
  automatic promotion allowed after validate

UAT:
  manual workflow_dispatch or protected environment gate

PROD:
  manual approval/protected environment gate
  no overlapping prod deploys
```

Self-hosted runner safety:

```text
Use self-hosted runner only for trusted private repo workflows.
Do not run untrusted fork PR code on the Windows Hyper-V runner.
Do not store long-lived secrets in the runner workspace.
Prefer repository/environment secrets and variables.
Clean workspaces after jobs where possible.
Label the runner clearly, for example: self-hosted, Windows, X64, project-truth-hyperv.
```

Watch commands the overnight run should use:

```powershell
gh run list --limit 10
gh run view <run-id>
gh run view <run-id> --log-failed
gh run watch <run-id>
gh pr checks --watch
```

DevOps success is not "workflow file exists." DevOps success means a workflow run is observed, failures are repaired, and the final run is green or has an exact external blocker.

## Installer And User Journey Goal

The overnight work must not stop at infrastructure files. It must create the install/run experience a normal Windows user would actually touch.

Build one of these installer paths, choosing the most practical option for the repo:

```text
Preferred:
  Inno Setup installer
  -> ProjectTruthSetup.exe
  -> installs CLI, docs, examples, shortcuts, and optional bundled Terraform helper assets

Fallback if Inno Setup is unavailable:
  signed or unsigned PowerShell bootstrap installer
  -> install-project-truth.ps1
  -> same installed layout and shortcuts
```

The installed user experience should be:

```text
User downloads ProjectTruthSetup.exe or install-project-truth.ps1
User runs installer
Installer creates Project Truth folder
Installer installs or checks CLI entrypoint
Installer creates Start Menu shortcut
Installer optionally creates Desktop shortcut
User opens "Project Truth"
User runs doctor
User selects or downloads a prebuilt VHDX
User runs terraform-plan
User runs terraform-apply
User runs watch-until-healthy
User sees DEV/UAT/PROD health and inside-VM state
```

Required installer files:

```text
installer/
|-- README.md
|-- build-installer.ps1
|-- project-truth.iss
|-- install-project-truth.ps1
|-- uninstall-project-truth.ps1
`-- assets/
    `-- ProjectTruth.ico, if available or generated simply
```

Required installed layout:

```text
%ProgramData%\ProjectTruth\
|-- config\
|-- images\
|-- logs\
`-- state\

%LocalAppData%\ProjectTruth\
`-- user settings, if needed

%ProgramFiles%\ProjectTruth\
|-- project-truth.ps1
|-- scripts\
|-- terraform-hyperv\
|-- gitops\
|-- docs\
`-- uninstall entry, if installer supports it
```

Rules:

```text
Do not require Packer for normal installation.
Do not silently install random unrelated apps.
Do not store secrets in the repo.
Do not hardcode personal paths.
Do not require a Git checkout for a normal installed run unless explicitly documented as developer mode.
Do not create a Windows user account unless explicitly necessary and safe.
Prefer Windows Sandbox or a clean Windows VM for clean-user installer testing.
If a local test user is truly required, stop and document the exact command and reason instead of inventing a password.
```

Shortcut verification must inspect the actual shortcut target and working directory:

```powershell
$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut("<path-to-shortcut>")
$shortcut.TargetPath
$shortcut.Arguments
$shortcut.WorkingDirectory
```

The Start Menu/Desktop shortcut must launch a user-facing Project Truth CLI/console entrypoint, not a stale repo path.

## Execution Budget And Safety Gates

The overnight run should be persistent, but not reckless.

Default runtime budget:

```text
MaxHours: 8
RetryIntervalSeconds: 30
LongPollIntervalSeconds: 60
TerraformApplyEnabled: false unless explicitly enabled for the run
CreateWindowsUserEnabled: false
DestroyExistingVmEnabled: false
DeleteDownloadedImageOnChecksumFailure: true only inside configured Project Truth image cache
```

Allowed automatic actions:

```text
create or update files inside this repo
create ignored .runtime logs
run formatters and validators
create installer output under dist/ or installer output folder
install Project Truth into a test install directory
repair Project Truth shortcuts
download configured prebuilt image artifacts
retry failed network/provider downloads once
create Git branch, commit, push, PR, and merge with gh when authenticated and checks pass
```

Actions that must not happen automatically:

```text
delete existing Hyper-V VMs
delete existing virtual switches
delete user data outside Project Truth install/runtime/cache folders
create local Windows users
invent passwords
install unrelated software silently
commit secrets, logs, state, VHDX, OVA, or downloaded artifacts
run packer build as part of normal install
turn Terraform provisioners into the default bootstrap strategy
```

If a blocked action is needed, write the exact command, reason, risk, and expected result into the final report instead of guessing.

## Fresh-Start Contract

Before implementing, write a short decision record into `docs/OPERATIONS.md`:

```text
This branch is a fresh Hyper-V/Terraform implementation.
Legacy VirtualBox/OVA/Terraform-inside-VM behavior is source material only.
Normal users consume a prebuilt VHDX.
Packer is maintainer-only.
Terraform runs on the Windows host.
Kubernetes and Argo CD run inside the VM.
```

If a file or script contradicts that contract, either remove it from the fresh repo shape or rewrite it so it supports the new architecture.

## Fresh Repo Shape

Create or converge toward this minimal structure:

```text
project-truth-hyperv/
|
|-- README.md
|
|-- docs/
|   |-- ARCHITECTURE.md
|   |-- OPERATIONS.md
|   |-- HEALTHCHECKS.md
|   `-- INSTALLER_TEST_REPORT.md
|
|-- app/
|   |-- Dockerfile
|   |-- package.json
|   |-- package-lock.json
|   `-- server.js
|
|-- gitops/
|   |-- base/
|   |   |-- deployment.yaml
|   |   |-- service.yaml
|   |   `-- kustomization.yaml
|   |
|   |-- overlays/
|   |   |-- dev/
|   |   |-- uat/
|   |   `-- prod/
|   |
|   `-- argocd/
|       `-- applications/
|
|-- terraform-hyperv/
|   |-- providers.tf
|   |-- variables.tf
|   |-- main.tf
|   |-- outputs.tf
|   |-- terraform.tfvars.example
|   |
|   `-- modules/
|       `-- project-truth-hyperv-vm/
|           |-- main.tf
|           |-- variables.tf
|           `-- outputs.tf
|
|-- image-factory/
|   |-- README.md
|   `-- packer/
|       |-- ubuntu-hyperv.pkr.hcl
|       |-- provision.sh
|       `-- http/
|
|-- installer/
|   |-- README.md
|   |-- build-installer.ps1
|   |-- project-truth.iss
|   |-- install-project-truth.ps1
|   |-- uninstall-project-truth.ps1
|   `-- assets/
|
|-- scripts/
|   |-- project-truth.ps1
|   |-- doctor.ps1
|   |-- select-image.ps1
|   |-- download-image.ps1
|   |-- terraform-plan.ps1
|   |-- terraform-apply.ps1
|   |-- verify-host-health.ps1
|   |-- verify-lan-health.ps1
|   |-- verify-inside-vm.sh
|   |-- watch-until-healthy.ps1
|   `-- repair-and-verify.ps1
|
`-- .github/
    `-- workflows/
        |-- validate.yml
        `-- promote-gitops.yml
```

## Extract Only What Is Needed

From the current repo, reuse only:

```text
app/
gitops/
packer/ubuntu-hyperv.pkr.hcl
packer/provision.sh
packer/http/
scripts/verify-inside-vm.sh
scripts/verify-health.ps1 ideas only
scripts/verify-hyperv-appliance.ps1 ideas only
docs/TERRAFORM_HYPERV_ARCHITECTURE.md
```

Do not bring forward:

```text
VirtualBox-first flow
OVA-only installer flow
dist/*.ova
logs/
output/
packer_cache/
UACME/
old dirty self-loop scripts unless rewritten cleanly
Terraform-inside-VM app deployment as the target design
VirtualBox as the target design
```

## Implementation Order

### Phase 1: Inventory

Run:

```powershell
git status --short --branch
terraform version
gh auth status
rg -n "VirtualBox|VBoxManage|OVA|packer build|terraform|hyperv|Argo CD|k3s" .
```

Write the results into:

```text
docs/OPERATIONS.md
```

Then decide, file by file, whether each old component is:

```text
KEEP: directly supports Hyper-V/Terraform/K3s/Argo/CD health verification
REWRITE: useful idea, wrong architecture
DROP: VirtualBox/OVA/legacy/noisy output/state/cache
```

Do not assume the old repo structure is correct.

### Phase 2: Terraform Host Layer

Build `terraform-hyperv/` around `taliesins/hyperv`.

Required inputs:

```text
vm_name
switch_name
source_image_path
vm_path
memory_mb
cpu_count
ssh_port
dev_port
uat_port
prod_port
allow_destroy_existing_vm = false
```

Required outputs:

```text
vm_name
switch_name
guest_ip_hint
ssh_target
dev_health_url
uat_health_url
prod_health_url
```

Rules:

```text
Terraform consumes a prebuilt VHDX/export artifact.
Terraform does not call packer build.
Terraform does not use provisioners unless absolutely unavoidable.
Terraform does not delete an existing VM unless explicitly configured.
Terraform state stays on the Windows host.
Terraform must not install K3s, Argo CD, Docker, or the app through ad hoc remote scripts.
```

Validate:

```powershell
terraform -chdir=terraform-hyperv fmt -recursive
terraform -chdir=terraform-hyperv init
terraform -chdir=terraform-hyperv validate
```

### Phase 3: CLI Wrapper

Create:

```text
scripts/project-truth.ps1
```

Commands:

```powershell
.\scripts\project-truth.ps1 doctor
.\scripts\project-truth.ps1 select-image
.\scripts\project-truth.ps1 download-image
.\scripts\project-truth.ps1 terraform-plan
.\scripts\project-truth.ps1 terraform-apply
.\scripts\project-truth.ps1 verify
.\scripts\project-truth.ps1 watch-until-healthy
```

The wrapper should call small scripts instead of hiding everything in one giant file.

`doctor` must check:

```text
PowerShell version
Administrator or Hyper-V permissions
Hyper-V cmdlets
Terraform
Git
GitHub CLI
curl
ssh
selected image path
image checksum
```

Packer check is optional and should be reported as:

```text
Packer: optional, only required for image-factory rebuilds.
```

The CLI must fail clearly if no usable VHDX is selected or downloaded. Do not silently build one with Packer.

### Phase 4: Installer And Shortcut Build

Create the installer surface before claiming the repo is usable by a normal Windows user.

Required commands:

```powershell
.\installer\build-installer.ps1
.\installer\install-project-truth.ps1 -InstallDir "$env:ProgramFiles\ProjectTruth"
```

If Inno Setup is installed, compile:

```powershell
iscc .\installer\project-truth.iss
```

If `iscc` is not installed, the build script must:

```text
detect that clearly
fall back to PowerShell installer packaging
write exact install instructions
not block the rest of the repo implementation
```

Installer must verify:

```text
installed Project Truth files exist
project-truth.ps1 can run doctor
Start Menu shortcut exists
optional Desktop shortcut exists, if enabled
shortcut target points to installed files, not repo files
uninstall script exists
install log exists
```

Silent install test, when Inno Setup output exists:

```powershell
.\dist\ProjectTruthSetup.exe /VERYSILENT /SUPPRESSMSGBOXES /NORESTART /LOG="$env:TEMP\project-truth-install.log"
```

### Phase 5: GitOps/App Layer

Make DEV/UAT/PROD clear in GitOps:

```text
gitops/
|
|-- base/
|   |-- deployment.yaml
|   |-- service.yaml
|   `-- kustomization.yaml
|
`-- overlays/
    |-- dev/
    |   |-- namespace.yaml
    |   |-- deployment-patch.yaml
    |   |-- service-patch.yaml
    |   `-- kustomization.yaml
    |
    |-- uat/
    |   |-- namespace.yaml
    |   |-- deployment-patch.yaml
    |   |-- service-patch.yaml
    |   `-- kustomization.yaml
    |
    `-- prod/
        |-- namespace.yaml
        |-- deployment-patch.yaml
        |-- service-patch.yaml
        `-- kustomization.yaml
```

Keep health endpoints:

```text
DEV  -> NodePort 3001 -> /health
UAT  -> NodePort 3002 -> /health
PROD -> NodePort 3000 -> /health
```

The app health response must show the environment and enough identity to prove the right workload is running, for example:

```json
{"status":"ok","environment":"DEV","version":"...","hostname":"..."}
```

### Phase 6: Health Verification Loop

Create:

```text
scripts/watch-until-healthy.ps1
```

It must not stop until one of these is true:

```text
SUCCESS:
  host-local health passes for DEV/UAT/PROD
  LAN health passes for DEV/UAT/PROD
  SSH works
  inside-VM checks show Docker/container state if Docker is present
  inside-VM checks show Kubernetes node, pods, services, and Argo CD state

BLOCKED:
  missing Hyper-V permissions
  missing image artifact
  Terraform provider cannot manage the VM
  VM never gets a usable IP before timeout

TIMEOUT:
  max hours reached, with logs and last known state written
```

Checks:

```powershell
curl http://127.0.0.1:3001/health
curl http://127.0.0.1:3002/health
curl http://127.0.0.1:3000/health

curl http://<guest-lan-ip>:3001/health
curl http://<guest-lan-ip>:3002/health
curl http://<guest-lan-ip>:3000/health

ssh infra@<guest-lan-ip> "hostname; ip -br addr; docker ps || true; sudo kubectl get nodes; sudo kubectl get pods -A; sudo kubectl get svc -A; sudo kubectl get applications -n argocd || true"
```

The output should explicitly show what is inside the VM:

```text
Inside VM:
  hostname
  IP addresses
  Docker containers, if Docker is used
  Kubernetes nodes
  Kubernetes pods
  Argo CD applications
  DEV/UAT/PROD service endpoints
```

The verifier must write logs under a fresh ignored runtime folder such as:

```text
.runtime/
```

Do not commit runtime logs.

### Phase 7: Self-Repair Loop

Create a self-repair loop that keeps moving until success, timeout, or a real blocker.

Required script:

```text
scripts/repair-and-verify.ps1
```

It must run in this order:

```text
1. doctor
2. installer verification
3. image selection/checksum verification
4. terraform fmt/init/validate
5. terraform plan
6. terraform apply, only when explicitly enabled
7. Hyper-V VM discovery
8. guest IP discovery
9. host-local health
10. LAN health
11. SSH inside-VM checks
12. Kubernetes and Argo CD checks
13. write final report
```

Self-repair policy:

```text
If Terraform is missing:
  report install command and continue with remaining static validation where possible.

If Hyper-V module is missing:
  report Windows edition/feature blocker and continue docs/installer validation.

If selected VHDX is missing:
  run download-image if configured.
  otherwise mark image artifact as BLOCKED, not failed.

If checksum fails:
  delete only the bad downloaded artifact after confirming it is under the configured images folder.
  re-download once.
  if checksum still fails, BLOCKED.

If Terraform init fails due to provider download/network:
  retry once.
  then capture logs and BLOCKED.

If VM exists:
  do not delete it by default.
  inspect it and report whether it matches expected name/path/switch.

If VM has no IP:
  poll Hyper-V network adapter and ARP/DHCP hints until timeout.
  write last known VM state.

If health fails:
  capture host curl output, LAN curl output, VM service state, Kubernetes pods, events, and logs where available.
  retry until max hours or success.

If shortcut is wrong:
  repair shortcut target and re-run shortcut inspection.
```

Every repair action must be logged to:

```text
.runtime/repair/<timestamp>/
```

Do not claim success unless the final report proves the user journey and architecture checks.

### Phase 8: Clean-User Or Sandbox Journey Test

Test the install experience in the cleanest environment available.

Preferred:

```text
Windows Sandbox
```

Fallback:

```text
clean Windows VM
```

Last resort:

```text
current user profile, with all limitations documented
```

Do not create a new local Windows user account automatically unless the user has explicitly approved that. If clean-user creation is needed, write the exact proposed command and stop at that point.

Clean journey checklist:

```text
installer launches
silent install works or fallback installer works
Start Menu shortcut appears
shortcut target is correct
Project Truth CLI launches from shortcut target
doctor runs from installed location
doctor reports Packer optional
select-image/download-image path is clear
terraform-plan can run or reports exact missing prerequisite
watch-until-healthy can run or reports exact blocker
uninstaller removes installed files but preserves ProgramData state unless explicitly asked
```

Write the clean-user journey results to:

```text
docs/INSTALLER_TEST_REPORT.md
```

### Phase 9: Image Factory Separation

Move Packer into:

```text
image-factory/packer/
```

Document:

```text
Normal users do not run this.
Maintainers run this only when the base platform changes.
A released VHDX and checksum are the contract between image factory and Terraform.
```

Do not wire `packer build` into `terraform apply`.

### Phase 10: README And Docs Must Match The New Goal

Rewrite `README.md` so the first screen says this is a fresh Hyper-V/Terraform project.

The README must not present VirtualBox, OVA, or Terraform-inside-VM as the primary workflow. If legacy notes remain, put them behind a clearly labeled historical/legacy section or remove them from the fresh repo.

Required docs:

```text
docs/ARCHITECTURE.md
docs/OPERATIONS.md
docs/HEALTHCHECKS.md
```

`docs/ARCHITECTURE.md` must mirror `docs/TERRAFORM_HYPERV_ARCHITECTURE.md`.

### Phase 11: GitHub Branch, PR, And Merge

Create or update a branch:

```powershell
git checkout -B terraform-hyperv-clean-plan
git status --short
git add README.md docs app gitops terraform-hyperv image-factory installer scripts .github
git commit -m "Create clean Terraform Hyper-V Project Truth architecture"
```

Use GitHub CLI instead of stopping at local-only work when authentication is available:

```powershell
gh auth status
git push -u origin terraform-hyperv-clean-plan
gh pr create --fill --base main --head terraform-hyperv-clean-plan
gh pr checks --watch
```

If checks pass and the branch is intended to become the new clean baseline, merge it:

```powershell
gh pr merge --squash --delete-branch
```

If there is no remote repo yet but `gh` is authenticated, create one instead of blocking:

```powershell
gh repo create project-truth-hyperv --private --source . --remote origin --push
```

If an existing `origin` points to the wrong repository, do not guess. Report the current remote URL and create a clearly named local branch/commit. If `gh` is not authenticated, report the exact `gh auth status` output and the next command to run.

Do not use "push failed or hung" as a final blocker without checking:

```powershell
git remote -v
gh auth status
gh repo view
gh pr list --state open
```

Leave the local branch committed and report the exact commit SHA whenever remote work is impossible.

### Phase 12: DevOps Watch, Repair, And Gap Report

After pushing, watch the CI/CD system.

Required run loop:

```powershell
gh run list --limit 10
gh run watch <latest-run-id>
gh run view <latest-run-id> --log-failed
```

If a workflow fails:

```text
read the failed log
classify the failure
repair the repo when the failure is under repo control
commit and push the fix
watch the next run
repeat until green or external blocker
```

Failure classification:

```text
REPO BUG:
  syntax error
  missing setup action
  wrong file path
  bad workflow permissions
  bad kustomize/terraform syntax

ENVIRONMENT BLOCKER:
  missing GitHub secret/variable
  missing trusted self-hosted runner
  missing VHDX artifact
  Hyper-V unavailable on runner
  GitHub permission/plan restriction

POLICY DECISION:
  how dev promotes to uat/prod
  whether prod requires approval
  image registry choice
  whether nightly verify may run terraform apply
```

Create:

```text
docs/DEVOPS_RUNBOOK.md
docs/GAPS_AND_NEXT_GOALS.md
scripts/watch-github-run.ps1
scripts/verify-gitops-state.ps1
```

`docs/DEVOPS_RUNBOOK.md` must explain:

```text
what each workflow does
which runner each workflow needs
which secrets/variables are required
how DEV/UAT/PROD promotion works
how to watch and debug a failed run
how Argo CD sync is expected to happen
```

`docs/GAPS_AND_NEXT_GOALS.md` must list:

```text
done now
blocked by missing artifact/runner/secret
recommended next goal
exact next command
risk level
```

## Overnight Success Criteria

By morning, report:

```text
Branch:
Folder:
Commit SHA:
Remote push status:
PR status:
Merge status:
GitHub Actions latest run:
GitHub Actions watch/repair result:
Fresh repo tree:
Legacy files removed or quarantined:
Installer build result:
Installed layout result:
Shortcut inspection result:
Clean-user or Windows Sandbox journey result:
Terraform init/validate result:
CLI doctor result:
Image artifact status:
Hyper-V Terraform plan/apply result:
Guest IP:
Host-local health DEV/UAT/PROD:
LAN health DEV/UAT/PROD:
Inside-VM Docker/Kubernetes state:
Argo CD app state:
Self-repair loop result:
DevOps runbook:
Gaps and next goals:
Blockers:
Next exact command:
```

Do not report success if only docs were changed. Success means the clean repo shape exists, installer path exists, shortcut/user journey verification exists, and the verification/repair commands/scripts are present. If real Hyper-V apply cannot run, report exactly why and leave the repo ready for the next exact command.

## Final Note

Prefer a working clean path over preserving old compatibility:

```text
prebuilt image
  -> terraform-managed Hyper-V VM
  -> K3s + Argo CD
  -> GitOps DEV/UAT/PROD
  -> host-local and LAN health verification
```
