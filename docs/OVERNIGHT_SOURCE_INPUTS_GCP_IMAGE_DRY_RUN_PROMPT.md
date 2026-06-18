# Overnight Prompt: Source Inputs In GCP Image Dry Run

## Mission

Continue from the real Project Truth state on 2026-06-18. Do not restart the old VDI proof and do not use the stale VDI. This run is for proving the next Google Compute/Packer image can include the organized HRIS source inputs, suppress the VirtualBox serial warning text above the boot logo, and preserve PROD/DEV/UAT app/API/browser behavior.

Default mode is dry run. Do not run a real `packer build`, create a GCP image, export a VDI, or upload a public artifact unatil the dry-run gates below are green and the operator explicitly switches to build mode.

## Working Folders

```powershell
cd C:\Users\anoni\OneDrive\Desktop\PROJECT_TRUTH_HYPERV_FRESH
```

Organized source inputs:

```text
C:\Users\anoni\OneDrive\Desktop\HRIS-PROJECT\source-inputs-organized
```

Expected source-input shape:

```text
DM1-master-data             11 files, 31.20 MB
DM2-policy-reference         5 files, 0.02 MB
DM3-employee-data           21 files, 275.42 MB
DM4-attendance-timesheet    15 files, 7.68 MB
manifests-and-notes          7 files, 0.09 MB
payroll-reference          208 files, 69.91 MB
```

Key source notes:

```text
source-inputs-organized\manifests-and-notes\README.md
source-inputs-organized\manifests-and-notes\dm-migration-workflow.md
source-inputs-organized\manifests-and-notes\dm-source-input-manifest.json
```

## Repo Changes To Preserve

```text
scripts\build-image-gcp.ps1
  Adds -IncludeSourceInputs and -SourceInputsDir.
  When enabled, stages source inputs into:
    image-factory\packer\staging\appliance\source-inputs-organized
  In the VM/image, this becomes:
    /opt/project-truth/appliance/source-inputs-organized
  Normal builds remain unchanged unless -IncludeSourceInputs is passed.

image-factory\packer\provision.sh
  Applies quiet GRUB/console settings and removes serial console args that cause:
    serial port com0 isn't found
    terminal serial isn't found
  This is intended to hide that boot text above the VirtualBox logo on the next exported VDI.
```

Existing dev-current changes must also be preserved:

```text
appliance\bin\project-truth-hris-dev-current-restore.sh
appliance\bin\project-truth-hris-env-seed.sh
image-factory\packer\provision.sh
```

## Phase 0: Safety Gate

Confirm this is dry-run mode:

```powershell
git status --short
```

Do not revert unrelated changes. Do not delete generated staging unless specifically cleaning this run. `image-factory\packer\staging\` is gitignored.

Confirm the build command that must not run during dry run:

```powershell
rg -n "packer build|-ValidateOnly|IncludeSourceInputs" scripts\build-image-gcp.ps1 image-factory\packer\ubuntu-googlecompute.pkr.hcl
```

Dry-run success requires evidence that `-ValidateOnly` returned before the `packer build` checkpoint.

## Phase 1: Source Input Organization Proof

```powershell
$src = "C:\Users\anoni\OneDrive\Desktop\HRIS-PROJECT\source-inputs-organized"
Get-ChildItem -Directory $src | ForEach-Object {
  $files = Get-ChildItem -Recurse -File $_.FullName
  [PSCustomObject]@{
    Folder = $_.Name
    Files = $files.Count
    MB = [math]::Round((($files | Measure-Object Length -Sum).Sum / 1MB), 2)
  }
} | Format-Table -AutoSize
Get-Content "$src\manifests-and-notes\dm-migration-workflow.md" -TotalCount 80
```

Expected top-level folders are `DM1-master-data`, `DM2-policy-reference`, `DM3-employee-data`, `DM4-attendance-timesheet`, `manifests-and-notes`, and `payroll-reference`.

Block if raw files are mixed at the source root or if the manifest/readme files are missing.

## Phase 2: GCP Packer Validate-Only Dry Run

Run staging and Packer validation only:

```powershell
.\scripts\build-image-gcp.ps1 `
  -ValidateOnly `
  -IncludeSourceInputs `
  -SourceInputsDir "C:\Users\anoni\OneDrive\Desktop\HRIS-PROJECT\source-inputs-organized" `
  -RuntimeDir ".runtime\source-inputs-gcp-dry-run\$(Get-Date -Format yyyyMMdd-HHmmss)"
```

Expected:

```text
packer init passes
packer validate passes
ValidateOnly was set; skipping packer build.
No new GCP image is created.
No new VDI is exported.
```

Evidence files:

```text
.runtime\source-inputs-gcp-dry-run\<timestamp>\checkpoint-stage.txt
.runtime\source-inputs-gcp-dry-run\<timestamp>\checkpoint-stage-source-inputs.txt
.runtime\source-inputs-gcp-dry-run\<timestamp>\checkpoint-packer-init.txt
.runtime\source-inputs-gcp-dry-run\<timestamp>\checkpoint-packer-validate.txt
.runtime\source-inputs-gcp-dry-run\<timestamp>\packer-validate.log
```

Prove staged files:

```powershell
$staged = "image-factory\packer\staging\appliance\source-inputs-organized"
Test-Path $staged
Get-ChildItem -Directory $staged | Select-Object Name
Get-ChildItem -Recurse -File $staged | Measure-Object
```

## Phase 3: Quiet Boot Dry-Run Review

Do not boot a new image in dry-run mode. Review that provisioning now updates GRUB:

```powershell
rg -n "GRUB_TERMINAL|GRUB_CMDLINE_LINUX_DEFAULT|update-grub|ttyS|quiet splash" image-factory\packer\provision.sh
```

Next real image proof must check inside the VM:

```bash
grep -E 'GRUB_TERMINAL|GRUB_CMDLINE_LINUX' /etc/default/grub
grep -R "serial\|ttyS\|console=ttyS" /boot/grub/grub.cfg || true
```

Expected next-VDI behavior: VirtualBox no longer shows the serial/com0 warning text above the logo. If Ubuntu still boots and services pass, this cosmetic boot-noise issue is closed.

## Phase 4: Build Mode, Only After Approval

Run only after dry-run evidence is accepted:

```powershell
.\scripts\build-image-gcp.ps1 `
  -IncludeSourceInputs `
  -SourceInputsDir "C:\Users\anoni\OneDrive\Desktop\HRIS-PROJECT\source-inputs-organized" `
  -RuntimeDir ".runtime\source-inputs-gcp-build\$(Get-Date -Format yyyyMMdd-HHmmss)"
```

This uses `image-factory\packer\ubuntu-googlecompute.pkr.hcl`, so the build path is Google Compute. Record the produced image name from the Packer output.

## Phase 5: Postinstall / Image Proof

On the fresh GCP image or postinstall instance:

```bash
test -d /opt/project-truth/appliance/source-inputs-organized
find /opt/project-truth/appliance/source-inputs-organized -maxdepth 1 -type d -printf '%f\n' | sort
find /opt/project-truth/appliance/source-inputs-organized -type f | wc -l
du -sh /opt/project-truth/appliance/source-inputs-organized
test -f /opt/project-truth/appliance/source-inputs-organized/manifests-and-notes/dm-migration-workflow.md
systemctl cat project-truth-hris.service
project-truth-hris-env-start all
```

Expected service contract remains:

```text
ExecStart=/usr/local/bin/project-truth-hris-env-start all
```

## Phase 6: PROD/DEV/UAT Health Proof

Replace `<guest-ip>` after export/import or use localhost on the GCP instance:

```cmd
curl.exe -i --max-time 20 http://<guest-ip>:3000/auth/login
curl.exe -i --max-time 20 http://<guest-ip>:3001/health
curl.exe -i --max-time 20 http://<guest-ip>:3100/auth/login
curl.exe -i --max-time 20 http://<guest-ip>:3101/health
curl.exe -i --max-time 20 http://<guest-ip>:3200/auth/login
curl.exe -i --max-time 20 http://<guest-ip>:3201/health
```

Expected:

```text
PROD login/API -> 200
DEV login/API -> 200
UAT login/API -> 200
```

## Phase 7: DM Workflow Checks

Inside the running appliance, use the baked source folder as evidence:

```bash
SRC=/opt/project-truth/appliance/source-inputs-organized
test -f "$SRC/manifests-and-notes/dm-migration-workflow.md"
grep -n "DM1 Departments -> Sections -> Positions" "$SRC/manifests-and-notes/dm-migration-workflow.md"
grep -n "DM4 Timesheets + Approved Overtime Details" "$SRC/manifests-and-notes/dm-migration-workflow.md"
```

Run non-mutating checks first:

```bash
docker exec hris-api-dev npm run test:migration:quality || true
docker exec hris-api-dev npm run dry-run:bnpi-dm3-reporting-lines || true
docker exec hris-api-dev npm run dry-run:dm3-opening-leave-balances || true
docker exec hris-api-dev npm run dry-run:bandai-payroll-source || true
docker exec hris-api-dev npm run dry-run:bandai-payroll-timesheet-lines || true
docker exec hris-api-dev npm run dry-run:bandai-payroll-comparison || true
docker exec hris-api-dev npm run dm3:live || true
docker exec hris-api-dev npm run dm4:live || true
```

Do not run `repair:*`, `--execute`, `--apply`, or live import jobs unless the dry-run report explicitly calls for it and the operator approves the mutation.

## Phase 8: UI Proof

Browser-login proof is required; API health alone is not enough.

Open:

```text
PROD: http://<guest-ip>:3000/auth/login
DEV:  http://<guest-ip>:3100/auth/login
UAT:  http://<guest-ip>:3200/auth/login
```

Demo accounts:

```text
hr-manager@seed.local / Password123!
hr-user@seed.local / Password123!
employee@seed.local / Password123!
```

Capture screenshots:

```text
prod-login.png
prod-dashboard.png
dev-dashboard.png
dev-migration-dm3.png
dev-migration-dm4.png
uat-dashboard.png
```

Migration UI pages to inspect:

```text
http://<guest-ip>:3100/admin/configuration/migration?workbook=dm3
http://<guest-ip>:3100/admin/configuration/migration?workbook=dm4
```

## Final Report Template

```text
Result: DRY-RUN PASSED, PROVEN, or BLOCKED
Run root:
Source inputs path:
Source input folder counts:
Packer validate-only:
Build executed: YES/NO
GCP template:
Staged image path:
Inside VM image path:
Quiet boot config:
Boot serial warning hidden:
PROD login/API:
DEV login/API:
UAT login/API:
DM workflow dry-runs:
DM3/DM4 UI screenshots:
Browser screenshots:
Blockers:
Repo gaps:
Next exact command:
```

## Success Bar

```text
DRY-RUN PASSED: Source inputs are organized, staged into the GCP/Packer image path, Packer validation passes with -ValidateOnly, no build occurs, and the next build has an explicit boot-noise cleanup.

PROVEN: A fresh Google Compute-built Project Truth image includes /opt/project-truth/appliance/source-inputs-organized, exports/imports as VirtualBox VDI, boots without the serial/com0 warning above the logo, auto-starts PROD/DEV/UAT, passes health and browser login, and can run the DM workflow dry-run checks from the baked source inputs without hidden data gaps.
```
