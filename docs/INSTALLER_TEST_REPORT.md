# Installer Test Report

Generated during overnight proof pass on 2026-06-15.

| Check | Result | Notes |
|---|---|---|
| Installer scripts present | PASS | `installer/install-project-truth.ps1`, `installer/uninstall-project-truth.ps1`, `installer/build-installer.ps1`, and `installer/verify-install.ps1` exist. |
| Inno Setup script present | PASS | `installer/project-truth.iss` exists. |
| Inno Setup compile | BLOCKED/FALLBACK USED | `iscc.exe` was not found, so the build script used the PowerShell fallback. |
| PowerShell fallback package | PASS | `dist\ProjectTruth-PowerShell` was built. |
| `%ProgramFiles%` install | BLOCKED | Non-elevated shell failed with `Access to the path 'ProjectTruth' is denied.` |
| Installed CLI launch | BLOCKED | `C:\Program Files\ProjectTruth\ProjectTruth.cmd` was not created in this non-elevated run. |
| Clean-user or Sandbox test | NOT TESTED | Windows Sandbox was not launched automatically in this run. |
| Shortcut inspection | BLOCKED | `C:\ProgramData\Microsoft\Windows\Start Menu\Programs\Project Truth` did not exist after the failed install. |
| Helper shortcuts | BLOCKED | Requires successful install. CI now validates the shortcut contract through a writable temp install path. |
| Config file | PASS | `C:\ProgramData\ProjectTruth\config\project-truth.json` exists. |
| Repo terraform-plan | PASS | Dry-run plan renders Hyper-V switch, VHDX, and VM resources without apply. |
| Repo repair-and-verify | PASS/BLOCKED | Direct repair script runs and reports the correct blocker: no guest IP because no VM has booted. |

The installer is designed to avoid Packer in the normal path and to launch the installed CLI, not repo-local legacy scripts.
