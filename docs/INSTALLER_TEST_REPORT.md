# Installer Test Report

Generated during elevated proof pass on 2026-06-16.

Latest evidence folder: `.runtime\overnight\20260616-090206`.

## Latest VirtualBox DEV Current Artifact Proof

Generated during DEV-current GCP to VirtualBox proof on 2026-06-18.

Latest evidence folder: `.runtime\overnight-dev-current-gcp\20260618-014413`.

Current execution confirmation folder: `.runtime\overnight-virtualbox-gcp\20260618-081608`.

| Check | Result | Notes |
|---|---|---|
| Current DEV dump captured | PASS | `appliance/seeds/dev-current/dev-current.dump`, SHA256 `120e542fc0a42a7c3aaf5089f141fc4f64f233f907034af6c6b8e1f8eab75c43`. |
| Fresh GCP Packer image | PASS | `project-truth-node-gcp-1781718268`. |
| GCP postinstall image | PASS | `project-truth-node-devcurrent-postinstall-20260618-020148`. |
| Public VDI export | PASS | `public/project-truth/virtualbox/dev-current/latest/project-truth-node-devcurrent-postinstall-20260618-020148.vdi`, 14,859,698,688 bytes. |
| Public HTTP download | PASS | `curl -I` returned `HTTP/1.1 200 OK`. |
| Local VDI download | PASS | Downloaded to `C:\ProgramData\ProjectTruth\images\project-truth-node-devcurrent-postinstall-20260618-020148.vdi`. |
| Local VDI SHA256 | PASS | `860221ACF838356158C6F6600325002D743B2BC8E20570B683E7E160212C5404`. |
| VirtualBox import | PASS WITH SETTING | VM `project-truth-devcurrent-proof-20260618-070929` imported and booted with `--cpus 1`. |
| VirtualBox 4 vCPU boot | BLOCKED | GCP kernel stalled in initramfs on `raid6_pq` under VirtualBox. |
| Bridged LAN | PASS | Guest IP `192.168.100.84` on bridge `Hyper-V Virtual Ethernet Adapter #3`. |
| PROD app/API | PASS | `3000/auth/login` and `3001/health` returned 200. |
| DEV app/API | PASS | `3100/auth/login` and `3101/health` returned 200. |
| UAT app/API | PASS | `3200/auth/login` and `3201/health` returned 200. |
| DEV current data | PASS | Imported VM showed `dev_tables=70`, `dev_employees=2217`, `dev_users=2039`. |
| Browser login before reboot | PASS | Playwright passed PROD/DEV/UAT. |
| Auto-start after cold restart | PASS WITH WARM-UP | Containers and HTTP health returned after cold restart; warmed-up Playwright passed PROD/DEV/UAT. |
| Live HTTP re-check | PASS | Current run re-confirmed PROD/DEV/UAT login pages and API health at `192.168.100.84`. |
| ACPI shutdown | GAP | ACPI shutdown did not complete in proof timeout; proof used cold poweroff/start for the test VM. |

Full result: `docs\DEV_CURRENT_GCP_VDI_PROOF_RESULT.md`.

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

## VirtualBox Appliance Proof Attempt

Generated during VirtualBox/GCP appliance proof pass on 2026-06-17.

Latest evidence folder: `.runtime\overnight-virtualbox-gcp\20260617-210518`.

| Check | Result | Notes |
|---|---|---|
| VirtualBox installed | PASS | `VBoxManage --version` reported `7.2.8r173730`. |
| Bridged adapter available | PASS | `Hyper-V Virtual Ethernet Adapter #3` was up with host IP `192.168.100.174`. |
| GCP image exists | PASS | `project-truth-node-gcp-1781686573` exists in project `hris-492904`, family `project-truth-node`. |
| Exported VirtualBox artifact exists | PASS | `gs://project-truth-image-export-hris-492904-161377059311/project-truth-node-gcp-1781686573.vdi`, 11,647,910,400 bytes. |
| Local artifact download | BLOCKED | C: had only 925,638,656 bytes free, below the 10.85 GiB artifact size and below import/run overhead. |
| Clean VirtualBox import | NOT RUN | Blocked by local disk capacity. |
| Existing VM inspection | NON-ACCEPTANCE EVIDENCE | `project-truth-hris-local` reported guest IP `192.168.100.79`, but ping, SSH, and HTTP probes timed out/unreachable. |
| PROD/DEV/UAT login proof | NOT RUN | Requires clean imported VM from the exported artifact. |
