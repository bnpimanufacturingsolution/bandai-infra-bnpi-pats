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

## Current Blockers

| Blocker | Type | Next command |
|---|---|---|
| No selected prebuilt Hyper-V VHDX | Environment | Create one: `.\scripts\project-truth.ps1 build-image -TargetPlatform hyperv`; or publish an existing bootable image: `.\scripts\project-truth.ps1 build-image -TargetPlatform hyperv -SkipBuild -BuiltImagePath <path-to-bootable-project-truth.vhdx>` |
| No selected prebuilt VirtualBox VDI | Environment | Create one on a VirtualBox-capable builder: `.\scripts\project-truth.ps1 build-image -TargetPlatform virtualbox`; or publish an existing bootable image: `.\scripts\project-truth.ps1 build-image -TargetPlatform virtualbox -SkipBuild -BuiltImagePath <path-to-bootable-project-truth.vdi>` |
| Local disk too full for GCP VirtualBox VDI proof | Environment | Free at least 25 GiB on `C:`, then run: `gsutil cp gs://project-truth-image-export-hris-492904-161377059311/project-truth-node-gcp-1781686573.vdi C:\ProgramData\ProjectTruth\images\project-truth-node-gcp-1781686573.vdi` |
| Inno Setup compiler not installed locally | Environment | Install Inno Setup or use PowerShell fallback installer |
| Real Hyper-V apply not run | Safety | Run from an Administrator PowerShell after image selection: `.\scripts\project-truth.ps1 terraform-apply -Apply` |
| No live guest IP yet | Environment | Apply VM, then run `.\scripts\project-truth.ps1 watch-until-healthy -GuestIp <ip>` |

## Recommended Next Goal

Produce or select the first real Project Truth Hyper-V VHDX for the Terraform path, or the first real VirtualBox VDI for client handoff. Then run the full Terraform apply and health watch for Hyper-V.

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
gs://project-truth-image-export-hris-492904-161377059311/project-truth-node-gcp-1781686573.vdi
size: 11,647,910,400 bytes
```

That proof is blocked locally because `C:` had only 925,638,656 bytes free. Existing VM `project-truth-hris-local` is not acceptable clean proof; it reported guest IP `192.168.100.79`, but ping, SSH, and HTTP probes were unreachable.

The self-elevating proof wrapper has been removed. Future proof runs must start from an already elevated Administrator PowerShell and must fail fast on `net session` failure.
