# Project Truth Shortcuts

The installer must create a visible Start Menu group:

```text
Start Menu / Project Truth
```

Expected shortcuts:

| Shortcut | Target | Arguments | Purpose |
|---|---|---|---|
| Project Truth Doctor | `ProjectTruth.cmd` | `doctor` | Check local prerequisites and selected image state. |
| Select Project Truth Image | `ProjectTruth.cmd` | `select-image` | Select a prebuilt VHDX. |
| Terraform Plan | `ProjectTruth.cmd` | `terraform-plan` | Validate and plan the Hyper-V VM layer. |
| Apply Hyper-V VM | `ProjectTruth.cmd` | `terraform-apply` | Apply only when safety gate is explicitly used. |
| Watch Until Healthy | `ProjectTruth.cmd` | `watch-until-healthy` | Watch DEV/UAT/PROD health. |
| Repair And Verify | `ProjectTruth.cmd` | `repair-and-verify` | Run the repair/report loop. |
| Open Project Truth Folder | `explorer.exe` | install directory | Open installed files. |
| Open Logs | `explorer.exe` | `%ProgramData%\ProjectTruth\logs` | Open logs. |
| Open Documentation | `explorer.exe` | installed docs folder | Open docs. |

Validation command:

```powershell
.\installer\verify-install.ps1 -InstallDir C:\tmp\ProjectTruthInstallTest
```

The shortcut target must never point to the development repo.

## Latest Validation

Date: 2026-06-15

Install path:

```text
C:\tmp\ProjectTruthInstallTest
```

Shortcut folder:

```text
C:\Users\anoni\AppData\Roaming\Microsoft\Windows\Start Menu\Programs\Project Truth
```

Validated shortcuts:

```text
Apply Hyper-V VM.lnk
Open Documentation.lnk
Open Logs.lnk
Open Project Truth Folder.lnk
Project Truth Doctor.lnk
Repair And Verify.lnk
Select Project Truth Image.lnk
Terraform Plan.lnk
Watch Until Healthy.lnk
```

Result:

```text
PASS: installer\verify-install.ps1 inspected all expected shortcuts.
PASS: command shortcuts target C:\tmp\ProjectTruthInstallTest\ProjectTruth.cmd.
PASS: folder/documentation shortcuts target explorer.exe.
PASS: no shortcut points at the development repo.
```
