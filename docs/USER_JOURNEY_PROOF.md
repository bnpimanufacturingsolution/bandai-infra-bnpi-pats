# User Journey Proof

This file is updated by implementation and validation runs.

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
.runtime\overnight\20260616-071428
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
