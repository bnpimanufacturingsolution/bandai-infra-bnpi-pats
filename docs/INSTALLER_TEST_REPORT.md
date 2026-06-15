# Installer Test Report

Generated during implementation on 2026-06-15.

| Check | Result | Notes |
|---|---|---|
| Installer scripts present | PASS | `installer/install-project-truth.ps1`, `installer/uninstall-project-truth.ps1`, `installer/build-installer.ps1`, and `installer/verify-install.ps1` exist. |
| Inno Setup script present | PASS | `installer/project-truth.iss` exists. |
| Inno Setup compile | BLOCKED | `iscc.exe` was not found, so the build script used the PowerShell fallback. |
| PowerShell fallback installer | PASS | Fallback installer installed into `C:\tmp\ProjectTruthInstallTest`. |
| Installed CLI launch | PASS | `C:\tmp\ProjectTruthInstallTest\ProjectTruth.cmd doctor` ran successfully. |
| Clean-user or Sandbox test | BLOCKED | Windows Sandbox was not launched automatically in this run. Current-user test install was used instead. |
| Shortcut inspection | PASS | Shortcut target was `C:\tmp\ProjectTruthInstallTest\ProjectTruth.cmd`; working directory was `C:\tmp\ProjectTruthInstallTest`. |
| Helper shortcuts | PASS | 9 Start Menu shortcuts created and inspected. |
| Config file | PASS | `C:\ProgramData\ProjectTruth\config\project-truth.json` exists and is preserved/backed up on configure. |
| Installed terraform-plan | PASS | Dry-run plan renders Hyper-V switch, VHDX, and VM resources without apply. |
| Installed repair-and-verify | PASS/BLOCKED | Loop runs and reports the correct blocker: no selected prebuilt VHDX / no live VM health yet. |

The installer is designed to avoid Packer in the normal path and to launch the installed CLI, not repo-local legacy scripts.
