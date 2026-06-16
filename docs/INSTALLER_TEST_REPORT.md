# Installer Test Report

Generated during elevated proof pass on 2026-06-16.

Latest evidence folder: `.runtime\overnight\20260616-090206`.

| Check | Result | Notes |
|---|---|---|
| Installer scripts present | PASS | `installer/install-project-truth.ps1`, `installer/uninstall-project-truth.ps1`, `installer/build-installer.ps1`, and `installer/verify-install.ps1` exist. |
| Inno Setup script present | PASS | `installer/project-truth.iss` exists. |
| Inno Setup compile | BLOCKED/FALLBACK USED | `iscc.exe` was not found, so the build script used the PowerShell fallback. |
| PowerShell fallback package | PASS | `dist\ProjectTruth-PowerShell` was built. |
| `%ProgramFiles%` install | PASS | Elevated install succeeded at `C:\Program Files\ProjectTruth`. |
| Installed CLI launch | PASS | Installed doctor ran through the installed Project Truth scripts and reported Administrator PASS. |
| Clean-user or Sandbox test | NOT TESTED | Windows Sandbox was not launched automatically in this run. |
| Common Start Menu shortcut inspection | PASS | `C:\ProgramData\Microsoft\Windows\Start Menu\Programs\Project Truth` exists and contains the required 9 shortcuts. |
| Helper shortcuts | PASS | Command shortcuts target `C:\Program Files\ProjectTruth\ProjectTruth.cmd`; Logs and Documentation shortcuts target ProgramData logs and installed docs. |
| Config file | PASS | `C:\ProgramData\ProjectTruth\config\project-truth.json` exists. |
| Repo terraform-plan | PASS | Dry-run plan renders Hyper-V switch, VHDX, and VM resources without apply. |
| Repo repair-and-verify | PASS/BLOCKED | Direct repair script runs and reports the correct blocker: no guest IP because no VM has booted. |
| Selected VHDX artifact | BLOCKED | `C:\ProgramData\ProjectTruth\images\project-truth-node-latest.vhdx` does not exist; approved-path search found no `.vhdx`. |
| Terraform apply | SKIPPED BY SAFETY GATE | Apply was not run because the selected VHDX is missing. |

The installer is designed to avoid Packer in the normal path and to launch the installed CLI, not repo-local legacy scripts.
