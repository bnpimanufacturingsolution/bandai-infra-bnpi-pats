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

Date: 2026-06-15

Run folder:

```text
.runtime\overnight\20260615-232143
```

Install command attempted:

```powershell
.\installer\install-project-truth.ps1 -InstallDir "$env:ProgramFiles\ProjectTruth"
```

Result:

```text
BLOCKED: the shell was not elevated.
New-Item : Access to the path 'ProjectTruth' is denied.
```

Installed layout:

```text
C:\Program Files\ProjectTruth
BLOCKED: not created in this run because the shell was not elevated.
```

Config file:

```text
C:\ProgramData\ProjectTruth\config\project-truth.json
PROVEN: exists and points at C:\ProgramData\ProjectTruth\images\project-truth-node-latest.vhdx.
```

Shortcut proof:

```text
BLOCKED: C:\ProgramData\Microsoft\Windows\Start Menu\Programs\Project Truth did not exist after the failed Program Files install.
CI now validates the shortcut contract through a writable temp install path.
```

Repo command proof:

```text
.\scripts\project-truth.ps1 doctor
  PASS: PowerShell, Hyper-V module, Terraform, Git, gh, curl, ssh detected.
  WARN: not elevated.
  WARN: no selected image yet.

.\scripts\terraform-plan.ps1
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
reason: this run used CLI validation rather than GUI/browser screenshot tooling.
replacement proof: preflight output, install permission error, doctor output, terraform plan output, repair report, and GitHub Actions run status.
```
