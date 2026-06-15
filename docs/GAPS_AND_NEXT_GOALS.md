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
| Installed CLI terraform-plan proof | DONE |
| Installed repair-and-verify proof | DONE |
| GitOps overlays for DEV/UAT/PROD | DONE |
| GitHub validation workflow | DONE |
| Health watcher missing-IP fast fail | DONE |

## Current Blockers

| Blocker | Type | Next command |
|---|---|---|
| No selected prebuilt VHDX | Environment | `.\scripts\project-truth.ps1 select-image -ImagePath C:\ProgramData\ProjectTruth\images\project-truth-node-latest.vhdx` |
| `%ProgramFiles%` install needs elevation | Environment | Open elevated PowerShell and run `.\installer\install-project-truth.ps1 -InstallDir "$env:ProgramFiles\ProjectTruth"` |
| Inno Setup compiler not installed locally | Environment | Install Inno Setup or use PowerShell fallback installer |
| Real Hyper-V apply not run | Safety | Run from elevated shell after image selection: `.\scripts\project-truth.ps1 terraform-apply -Apply` |
| No live guest IP yet | Environment | Apply VM, then run `.\scripts\project-truth.ps1 watch-until-healthy -GuestIp <ip>` |

## Recommended Next Goal

Produce or select the first real Project Truth Hyper-V VHDX, then run the full Terraform apply and health watch.

Risk level: medium, because it creates/runs a Hyper-V VM.

## Truth

The current repo proves config, CLI doctor, Terraform init/validate/plan, GitOps overlay rendering, and GitHub validation. This non-elevated run did not prove the `%ProgramFiles%` installer journey, shortcuts, real VM boot, or health endpoints because the install needed elevation and there is no selected prebuilt VHDX artifact in this environment.
