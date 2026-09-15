# DEV Current GCP VDI Proof Result

## Result

```text
PROVEN WITH VIRTUALBOX BOOT WORKAROUND
```

A fresh Google Compute/Packer build was created from the current repo, the current local DEV database snapshot was baked into the appliance, a GCP postinstall image was created, and that image was exported as a public VirtualBox VDI.

The VDI was downloaded locally, imported into a fresh VirtualBox VM, booted on bridged LAN, and PROD/DEV/UAT app/API/browser login checks passed.

## Artifact

```text
Run root:
  .runtime\overnight-dev-current-gcp\20260618-014413

Public VDI:
  https://storage.googleapis.com/project-truth-image-export-bnpi-pats-492904-161377059311/public/project-truth/virtualbox/dev-current/latest/project-truth-node-devcurrent-postinstall-20260618-020148.vdi

GCS object:
  gs://project-truth-image-export-bnpi-pats-492904-161377059311/public/project-truth/virtualbox/dev-current/latest/project-truth-node-devcurrent-postinstall-20260618-020148.vdi

VDI size:
  14,859,698,688 bytes

Local VDI:
  C:\ProgramData\ProjectTruth\images\project-truth-node-devcurrent-postinstall-20260618-020148.vdi

Local VDI SHA256:
  860221ACF838356158C6F6600325002D743B2BC8E20570B683E7E160212C5404
```

## GCP Build Images

```text
Fresh Packer image:
  project-truth-node-gcp-1781718268

Postinstall image:
  project-truth-node-devcurrent-postinstall-20260618-020148
```

The older artifact is stale for this DEV-current goal:

```text
gs://project-truth-image-export-bnpi-pats-492904-161377059311/project-truth-node-gcp-1781686573.vdi
```

## DEV Snapshot

```text
Source DEV dump:
  appliance\seeds\dev-current\dev-current.dump

Dump size:
  54,778,532 bytes

Dump SHA256:
  120e542fc0a42a7c3aaf5089f141fc4f64f233f907034af6c6b8e1f8eab75c43

Expected DEV counts:
  dev_tables=70
  dev_employees=2217
  dev_users=2039
```

Inside the imported VirtualBox VM:

```text
dev_tables=70
dev_employees=2217
dev_users=2039
```

## Local VirtualBox Proof

```text
VirtualBox:
  7.2.8r173730

VM:
  project-truth-devcurrent-proof-20260618-070929

Bridge adapter:
  Hyper-V Virtual Ethernet Adapter #3

Guest LAN IP:
  192.168.100.84

Console/SSH account:
  infra / infra
```

Important boot finding:

```text
4 vCPU boot:
  BLOCKED in initramfs on the GCP kernel.
  Serial log showed an RCU stall in raid6_pq on kernel 6.17.0-1018-gcp.

1 vCPU boot:
  PASSED.
  VM reached login, SSH started, LAN config worked, Docker services started.
```

Use this VirtualBox import setting for the current exported VDI:

```text
--cpus 1
```

Later local tuning showed the same VirtualBox VM can boot with `--cpus 2` and pass health checks, but `4` vCPU remains blocked by the GCP-kernel/VirtualBox stall.

## Local Hyper-V Proof

The same exported VDI was converted locally for Hyper-V:

```text
VDI:
  C:\ProgramData\ProjectTruth\images\project-truth-node-devcurrent-postinstall-20260618-020148.vdi

Converted VHDX:
  C:\ProgramData\ProjectTruth\images\project-truth-devcurrent-hyperv.vhdx

VM:
  project-truth-devcurrent-hyperv-proof

Hyper-V generation:
  2

CPU:
  2

Memory:
  Dynamic, up to 6 GB

Switch:
  ProjectTruth-External

Guest LAN IP:
  192.168.100.86
```

Important Hyper-V finding:

```text
VDI cannot be attached directly to Hyper-V.
The VDI must be converted to VHDX.
Generation 2 Hyper-V did not accept the intermediate VHD as a boot disk.
The VHDX booted successfully.
```

Hyper-V LAN health proof:

```text
PROD app login: http://192.168.100.86:3000/auth/login -> 200
PROD API:       http://192.168.100.86:3001/health     -> 200
DEV app login:  http://192.168.100.86:3100/auth/login -> 200
DEV API:        http://192.168.100.86:3101/health     -> 200
UAT app login:  http://192.168.100.86:3200/auth/login -> 200
UAT API:        http://192.168.100.86:3201/health     -> 200
```

Automation added:

```text
scripts\import-devcurrent-vdi-to-hyperv.ps1
```

This script converts VDI to VHDX when needed, creates/reuses a Hyper-V Gen 2 VM, attaches it to `ProjectTruth-External` when available, starts the VM, discovers the LAN IP through Hyper-V integration or ARP/MAC fallback, and loops until PROD/DEV/UAT health checks pass.
d
## Google Compute Hyper-V VHDX Export

To avoid local VDI-to-VHDX conversion and the temporary storage swell on small Windows hosts, Google Compute exported the postinstall image directly as a Hyper-V VHDX.

```text
Cloud Build:
  8435ea44-d7aa-4cb2-9434-772f75da8ab8

Cloud Build region:
  asia-southeast1

Source image:
  project-truth-node-devcurrent-postinstall-20260618-020148

Export format:
  vhdx

GCS object:
  gs://project-truth-image-export-bnpi-pats-492904-161377059311/public/project-truth/hyperv/dev-current/latest/project-truth-node-devcurrent-postinstall-20260618-020148.vhdx

Public HTTPS:
  https://storage.googleapis.com/project-truth-image-export-bnpi-pats-492904-161377059311/public/project-truth/hyperv/dev-current/latest/project-truth-node-devcurrent-postinstall-20260618-020148.vhdx

VHDX size:
  16,215,179,264 bytes
  about 15.1 GiB
```

Public HTTP verification returned:

```text
HTTP/1.1 200 OK
Content-Length: 16215179264
```

Evidence:

```text
.runtime\gcp-vhdx-export\20260618-devcurrent\gcp-exported-vhdx-stat.txt
.runtime\gcp-vhdx-export\20260618-devcurrent\public-vhdx-curl-head.txt
.runtime\gcp-vhdx-export\20260618-devcurrent\cloudbuild-8435ea44-d7aa-4cb2-9434-772f75da8ab8.json
```

Automation added:

```text
scripts\export-devcurrent-gcp-vhdx.ps1
```

This script starts/reuses the Google export target, polls Cloud Build, checks the GCS object, and verifies public HTTP access.

## Health Proof

Before reboot:

```text
PROD app login: http://192.168.100.84:3000/auth/login -> 200
PROD API:       http://192.168.100.84:3001/health     -> 200
DEV app login:  http://192.168.100.84:3100/auth/login -> 200
DEV API:        http://192.168.100.84:3101/health     -> 200
UAT app login:  http://192.168.100.84:3200/auth/login -> 200
UAT API:        http://192.168.100.84:3201/health     -> 200
```

After cold restart and warm-up:

```text
PROD app login: http://192.168.100.84:3000/auth/login -> 200
PROD API:       http://192.168.100.84:3001/health     -> 200
DEV app login:  http://192.168.100.84:3100/auth/login -> 200
DEV API:        http://192.168.100.84:3101/health     -> 200
UAT app login:  http://192.168.100.84:3200/auth/login -> 200
UAT API:        http://192.168.100.84:3201/health     -> 200
```

## Browser Login Proof

Playwright browser login passed for all three environments before reboot:

```text
PROD: passed
DEV:  passed
UAT:  passed
```

Evidence:

```text
.runtime\overnight-dev-current-gcp\20260618-014413\local-playwright-login-proof-2.txt
.runtime\overnight-dev-current-gcp\20260618-014413\screenshots\prod-login.png
.runtime\overnight-dev-current-gcp\20260618-014413\screenshots\prod-dashboard.png
.runtime\overnight-dev-current-gcp\20260618-014413\screenshots\dev-login.png
.runtime\overnight-dev-current-gcp\20260618-014413\screenshots\dev-dashboard.png
.runtime\overnight-dev-current-gcp\20260618-014413\screenshots\uat-login.png
.runtime\overnight-dev-current-gcp\20260618-014413\screenshots\uat-dashboard.png
```

After reboot, the first browser run was too early for the one-vCPU appliance and DEV/UAT were still slow to hydrate session state. A warmed-up rerun passed all three:

```text
PROD: passed
DEV:  passed
UAT:  passed
```

Evidence:

```text
.runtime\overnight-dev-current-gcp\20260618-014413\local-playwright-login-proof-after-reboot-warm.txt
.runtime\overnight-dev-current-gcp\20260618-014413\screenshots\after-reboot-warm\prod-login.png
.runtime\overnight-dev-current-gcp\20260618-014413\screenshots\after-reboot-warm\prod-dashboard.png
.runtime\overnight-dev-current-gcp\20260618-014413\screenshots\after-reboot-warm\dev-login.png
.runtime\overnight-dev-current-gcp\20260618-014413\screenshots\after-reboot-warm\dev-dashboard.png
.runtime\overnight-dev-current-gcp\20260618-014413\screenshots\after-reboot-warm\uat-login.png
.runtime\overnight-dev-current-gcp\20260618-014413\screenshots\after-reboot-warm\uat-dashboard.png
```

## Auto-Start Proof

After cold restart:

```text
project-truth-bnpi-pats.service:
  enabled
  active
  ExecStart=/usr/local/bin/project-truth-bnpi-pats-env-start all

Docker:
  bnpi-pats-postgres       healthy
  bnpi-pats-api            healthy
  bnpi-pats-app            healthy
  bnpi-pats-postgres-dev   healthy
  bnpi-pats-api-dev        healthy
  bnpi-pats-app-dev        healthy
  bnpi-pats-postgres-uat   healthy
  bnpi-pats-api-uat        healthy
  bnpi-pats-app-uat        healthy
```

ACPI shutdown did not complete within the proof timeout, so the proof used `VBoxManage controlvm <vm> poweroff` for the test VM and then started it again. BNPI PATS auto-start after that cold restart passed after warm-up.

## Repo Changes Behind This Artifact

```text
appliance/bin/project-truth-bnpi-pats-dev-current-restore.sh
  New DEV-only restore helper.

appliance/bin/project-truth-bnpi-pats-env-seed.sh
  DEV uses dev-current.dump when present.
  PROD/UAT keep the default seed path.

image-factory/packer/provision.sh
  Installs project-truth-bnpi-pats-dev-current-restore.

bnpi-pats-app/tests/smoke/project-truth-devcurrent-vbox-login.spec.ts
  Local proof-only Playwright browser login check.
```

## Gaps

```text
BOOT GAP:
  The exported GCP kernel stalls in VirtualBox at 4 vCPU.
  Workaround proven: import/run the VDI with --cpus 1.
  Better fix: build/export with a VirtualBox-friendly generic Ubuntu kernel or blacklist/avoid the problematic GCP kernel path.

SHUTDOWN GAP:
  ACPI shutdown did not complete within the proof timeout.
  Cold poweroff/start still proved service auto-start, but graceful shutdown should be improved.

WARM-UP GAP:
  On one vCPU, first browser login immediately after reboot can be slow.
  A warmed-up rerun passed PROD/DEV/UAT.

STATUS SCRIPT GAP:
  project-truth-bnpi-pats-status and docker ps are accurate.
  project-truth-status can still report old base-service names as missing even when the environment containers are healthy.
```

## Final Sentence

```text
PROVEN WITH VIRTUALBOX BOOT WORKAROUND: A Windows/VirtualBox user can download the public Project Truth dev-current VDI, import it with bridged LAN, boot it with one vCPU, and log in to PROD, DEV, and UAT BNPI PATS. DEV contains the current captured data snapshot; PROD and UAT keep default seed data.
```
