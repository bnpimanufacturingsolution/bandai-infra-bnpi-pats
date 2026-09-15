# User Journey Proof

This file is updated by implementation and validation runs.

## Latest DEV Current VirtualBox Appliance Proof

Date: 2026-06-18

Current execution run:

```text
.runtime\overnight-virtualbox-gcp\20260618-081608
```

Result:

```text
PROVEN WITH VIRTUALBOX BOOT WORKAROUND
```

Evidence folder:

```text
.runtime\overnight-dev-current-gcp\20260618-014413
```

Artifact:

```text
https://storage.googleapis.com/project-truth-image-export-bnpi-pats-492904-161377059311/public/project-truth/virtualbox/dev-current/latest/project-truth-node-devcurrent-postinstall-20260618-020148.vdi
```

Local import proof:

```text
VDI path: C:\ProgramData\ProjectTruth\images\project-truth-node-devcurrent-postinstall-20260618-020148.vdi
VDI size: 14,859,698,688 bytes
VDI SHA256: 860221ACF838356158C6F6600325002D743B2BC8E20570B683E7E160212C5404
VirtualBox VM: project-truth-devcurrent-proof-20260618-070929
Bridge adapter: Hyper-V Virtual Ethernet Adapter #3
Guest LAN IP: 192.168.100.84
```

Acceptance proof:

```text
PROD app/API: 3000/3001 -> 200
DEV app/API: 3100/3101 -> 200
UAT app/API: 3200/3201 -> 200
DEV current data: dev_tables=70, dev_employees=2217, dev_users=2039
Browser login: PROD/DEV/UAT passed before reboot and after reboot warm-up.
```

Live re-check during the current execution:

```text
http://192.168.100.84:3000/auth/login -> 200
http://192.168.100.84:3001/health     -> 200
http://192.168.100.84:3100/auth/login -> 200
http://192.168.100.84:3101/health     -> 200
http://192.168.100.84:3200/auth/login -> 200
http://192.168.100.84:3201/health     -> 200
```

Important import setting:

```text
Use --cpus 1 for this VDI in VirtualBox.
```

At 4 vCPU the imported GCP kernel stalled in initramfs on `raid6_pq` under VirtualBox. The one-vCPU import booted, got LAN config, started Docker/BNPI PATS, and passed login proof.

Full result:

```text
docs\DEV_CURRENT_GCP_VDI_PROOF_RESULT.md
```

## Intended Journey

```text
Install Project Truth
  -> Start Menu / Project Truth shortcuts appear
  -> Project Truth Doctor runs from installed folder
  -> user config exists in ProgramData
  -> Terraform plan validates Hyper-V VM layer
  -> real apply waits for a selected prebuilt VHDX
  -> watch/repair scripts summarize health and blockers
```

## Latest Local Proof

Date: 2026-06-16

Run folder:

```text
.runtime\overnight\20260616-090206
```

Admin proof:

```text
PROVEN: whoami /groups reported Mandatory Label\High Mandatory Level.
PROVEN: net session succeeded.
```

Elevated install command:

```powershell
.\installer\install-project-truth.ps1 -InstallDir "$env:ProgramFiles\ProjectTruth"
```

Installed layout:

```text
C:\Program Files\ProjectTruth
PROVEN: ProjectTruth.cmd, app, docs, gitops, image-factory, installer, scripts, and terraform-hyperv were installed.
```

Config file:

```text
C:\ProgramData\ProjectTruth\config\project-truth.json
PROVEN: exists and points at C:\ProgramData\ProjectTruth\images\project-truth-node-latest.vhdx.
```

Shortcut proof:

```text
C:\ProgramData\Microsoft\Windows\Start Menu\Programs\Project Truth
PROVEN: 9 common Start Menu shortcuts were created and verified.
All command shortcuts target C:\Program Files\ProjectTruth\ProjectTruth.cmd.
Open Logs targets C:\ProgramData\ProjectTruth\logs.
Open Documentation targets C:\Program Files\ProjectTruth\docs.
```

Installed command proof:

```text
.\scripts\project-truth.ps1 doctor
  PASS: Administrator, Hyper-V module, Terraform, Git, gh, curl, ssh detected.
  WARN: no selected image yet.

.\scripts\project-truth.ps1 terraform-plan
  PASS: terraform init and validate succeeded.
  PASS: dry-run plan showed Hyper-V switch, copied VHDX, and VM resources.
  BLOCKED FOR APPLY: source VHDX does not exist at C:\ProgramData\ProjectTruth\images\project-truth-node-latest.vhdx.
```

Image artifact proof:

```text
Test-Path C:\ProgramData\ProjectTruth\images\project-truth-node-latest.vhdx
  False

Approved-path search:
  BLOCKED: no .vhdx found under C:\ProgramData\ProjectTruth\images, C:\Users\anoni\OneDrive\Desktop, or C:\Users\anoni\Downloads.
```

Repair proof:

```text
.\scripts\repair-and-verify.ps1 -MaxHours 8
  PASS: doctor ran.
  PASS: installer package fallback ran.
  PASS: terraform plan ran.
  SKIPPED BY SAFETY GATE: terraform apply was not enabled.
  BLOCKED: health, SSH, Kubernetes, and Argo CD proof require a booted VM with a discovered LAN IP.
```

## Screenshot Policy

Screenshots are preferred when a UI is available. If screenshots cannot be captured, textual proof from shortcut inspection, installed file tree, CLI output, GitHub run status, and health checks is accepted.

SCREENSHOT NOT CAPTURED:

```text
reason: this run used elevated CLI validation rather than GUI/browser screenshot tooling.
replacement proof: elevated installer output, common Start Menu shortcut inspection, doctor output, terraform plan output, repair report, and GitHub Actions run status.
```

## VirtualBox GCP Appliance Proof Attempt

Date: 2026-06-17

Run folder:

```text
.runtime\overnight-virtualbox-gcp\20260617-210518
```

Result:

```text
BLOCKED: clean VirtualBox import could not proceed because local C: free space was only 925,638,656 bytes.
```

Artifact proof:

```text
PROVEN: GCP image exists: project-truth-node-gcp-1781686573 in project bnpi-pats-492904.
PROVEN: exported VirtualBox VDI exists:
  gs://project-truth-image-export-bnpi-pats-492904-161377059311/project-truth-node-gcp-1781686573.vdi
  size: 11,647,910,400 bytes
```

Host proof:

```text
PROVEN: Oracle VirtualBox 7.2.8r173730 is installed.
PROVEN: bridged adapter is available: Hyper-V Virtual Ethernet Adapter #3 at 192.168.100.174.
```

Clean import proof:

```text
NOT RUN: the VDI could not be downloaded to C:\ProgramData\ProjectTruth\images because the disk had less than 1 GiB free.
```

Existing VM note:

```text
project-truth-bnpi-pats-local is present and running, but it is not clean proof.
VirtualBox guest properties reported 192.168.100.79.
Ping, SSH, and HTTP probes to 192.168.100.79 timed out or were unreachable.
```

Next exact command after freeing at least 25 GiB on C::

```powershell
gsutil cp gs://project-truth-image-export-bnpi-pats-492904-161377059311/project-truth-node-gcp-1781686573.vdi C:\ProgramData\ProjectTruth\images\project-truth-node-gcp-1781686573.vdi
```
