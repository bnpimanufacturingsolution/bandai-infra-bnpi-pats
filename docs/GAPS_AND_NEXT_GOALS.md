# Gaps And Next Goals

## Done Now

| Item | Status |
|---|---|
| Fresh repo without OVA/VirtualBox baggage | DONE |
| Terraform Hyper-V host layer | DONE |
| CLI wrapper | DONE |
| Installer fallback | DONE |
| Start Menu helper shortcut contract | DONE |
| Start Menu helper shortcut implementation | DONE |
| Config file creation | DONE |
| Elevated `%ProgramFiles%` install proof | DONE |
| Common Start Menu shortcut proof | DONE |
| Installed CLI terraform-plan proof | DONE |
| Installed repair-and-verify proof | DONE |
| GitOps overlays for DEV/UAT/PROD | DONE |
| GitHub validation workflow | DONE |
| Health watcher missing-IP fast fail | DONE |
| Direct admin proof without elevation wrapper | DONE |
| Wrapper removal from CLI/docs | DONE |
| Maintainer image-factory build command | DONE |
| DEV-current GCP VirtualBox VDI export | DONE |
| Public organized VirtualBox VDI URL | DONE |
| Local VirtualBox import proof | DONE WITH WORKAROUND |
| PROD/DEV/UAT browser login proof | DONE |
| DEV current data preserved in imported VM | DONE |

## Current Blockers

| Blocker | Type | Next command |
|---|---|---|
| No selected prebuilt Hyper-V VHDX | Environment | Create one: `.\scripts\project-truth.ps1 build-image -TargetPlatform hyperv`; or publish an existing bootable image: `.\scripts\project-truth.ps1 build-image -TargetPlatform hyperv -SkipBuild -BuiltImagePath <path-to-bootable-project-truth.vhdx>` |
| VirtualBox 4 vCPU boot stalls on current GCP kernel | Image/compatibility | Workaround for current VDI: import/run with `--cpus 1`. Better next fix: build/export with a VirtualBox-friendly generic Ubuntu kernel. |
| ACPI shutdown does not complete in proof timeout | Image/guest behavior | Investigate guest shutdown blockers; current proof used cold poweroff/start and BNPI PATS auto-start passed after warm-up. |
| One-vCPU appliance needs warm-up before browser login after reboot | Performance | Keep one-vCPU workaround for boot, then wait for services to settle; better fix is the generic-kernel VirtualBox image so 4 vCPU can be used. |
| Current C: free space is low | Environment | Free at least 25 GiB before downloading or importing another full VDI; the proven local VDI already exists at `C:\ProgramData\ProjectTruth\images\project-truth-node-devcurrent-postinstall-20260618-020148.vdi`. |
| Inno Setup compiler not installed locally | Environment | Install Inno Setup or use PowerShell fallback installer |
| Real Hyper-V apply not run | Safety | Run from an Administrator PowerShell after image selection: `.\scripts\project-truth.ps1 terraform-apply -Apply` |
| No live guest IP yet | Environment | Apply VM, then run `.\scripts\project-truth.ps1 watch-until-healthy -GuestIp <ip>` |

## Recommended Next Goal

Produce or select the first real Project Truth Hyper-V VHDX for the Terraform path, or the first real VirtualBox VDI for client handoff. Then run the full Terraform apply and health watch for Hyper-V.

For the VirtualBox path, the first real DEV-current VDI now exists and is proven with a one-vCPU boot workaround:

```text
https://storage.googleapis.com/project-truth-image-export-bnpi-pats-492904-161377059311/public/project-truth/virtualbox/dev-current/latest/project-truth-node-devcurrent-postinstall-20260618-020148.vdi
```

Next VirtualBox hardening goal:

```text
Build a VirtualBox-friendly image variant that boots with 4 vCPU by using a generic Ubuntu kernel instead of the GCP kernel path that stalls in raid6_pq under VirtualBox.
```

Risk level: medium, because it creates/runs a Hyper-V VM.

Preferred command:

```powershell
.\scripts\project-truth.ps1 build-image
.\scripts\project-truth.ps1 terraform-apply -Apply
```

## Truth

The current repo proves elevated install, common Start Menu shortcuts, config, CLI doctor, Terraform init/validate/plan, GitOps overlay rendering, GitHub validation, and Packer template validation. It now includes a maintainer `build-image` command for creating and publishing the bootable Project Truth VHDX. It does not yet prove a real VM boot or health endpoint because the Packer image build and Terraform apply have not completed in this environment.

Latest evidence folder: `.runtime\overnight\20260616-090206`.

VirtualBox/GCP appliance proof attempt on 2026-06-17 found a real exported VDI in GCS:

```text
gs://project-truth-image-export-bnpi-pats-492904-161377059311/project-truth-node-gcp-1781686573.vdi
size: 11,647,910,400 bytes
```

That proof is superseded by the DEV-current proof on 2026-06-18. The current proven VDI is:

```text
gs://project-truth-image-export-bnpi-pats-492904-161377059311/public/project-truth/virtualbox/dev-current/latest/project-truth-node-devcurrent-postinstall-20260618-020148.vdi
size: 14,859,698,688 bytes
local SHA256 after download: 860221ACF838356158C6F6600325002D743B2BC8E20570B683E7E160212C5404
```

Imported VM `project-truth-devcurrent-proof-20260618-070929` booted with `--cpus 1`, received LAN IP `192.168.100.84`, passed PROD/DEV/UAT HTTP and browser-login checks, and preserved DEV current data counts.

The self-elevating proof wrapper has been removed. Future proof runs must start from an already elevated Administrator PowerShell and must fail fast on `net session` failure.
