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

Install command:

```powershell
.\installer\install-project-truth.ps1 -InstallDir C:\tmp\ProjectTruthInstallTest
```

Installed layout:

```text
C:\tmp\ProjectTruthInstallTest
|-- ProjectTruth.cmd
|-- app
|-- docs
|-- gitops
|-- image-factory
|-- installer
|-- scripts
`-- terraform-hyperv
```

Config file:

```text
C:\ProgramData\ProjectTruth\config\project-truth.json
```

Shortcut proof:

```text
Start Menu / Project Truth contains 9 helper shortcuts:
  Apply Hyper-V VM
  Open Documentation
  Open Logs
  Open Project Truth Folder
  Project Truth Doctor
  Repair And Verify
  Select Project Truth Image
  Terraform Plan
  Watch Until Healthy
```

Installed command proof:

```text
C:\tmp\ProjectTruthInstallTest\ProjectTruth.cmd doctor
  PASS: PowerShell, Hyper-V module, Terraform, Git, gh, curl, ssh detected.
  WARN: not elevated.
  WARN: no selected image yet.

C:\tmp\ProjectTruthInstallTest\ProjectTruth.cmd configure
  PASS: wrote ProgramData config and backed up existing config.

C:\tmp\ProjectTruthInstallTest\ProjectTruth.cmd terraform-plan
  PASS: terraform init and validate succeeded.
  PASS: dry-run plan showed Hyper-V switch, VHDX, and VM resources.
```

Repair proof:

```text
C:\tmp\ProjectTruthInstallTest\ProjectTruth.cmd repair-and-verify -MaxHours 0
  PASS: doctor ran.
  PASS: installer package fallback ran.
  PASS: terraform plan ran.
  PASS: terraform apply skipped by safety gate.
  BLOCKED: health did not run because no VM/VHDX/guest IP exists yet.
```

## Screenshot Policy

Screenshots are preferred when a UI is available. If screenshots cannot be captured, textual proof from shortcut inspection, installed file tree, CLI output, GitHub run status, and health checks is accepted.

SCREENSHOT NOT CAPTURED:

```text
reason: this run used CLI validation rather than GUI/browser screenshot tooling.
replacement proof: shortcut inspection table, installed file tree, doctor output, terraform plan output, repair report, and GitHub Actions run status.
```
