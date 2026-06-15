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
| Legit self-elevating proof runner | DONE |

## Current Blockers

| Blocker | Type | Next command |
|---|---|---|
| No selected prebuilt VHDX | Environment | `.\scripts\project-truth.ps1 select-image -ImagePath C:\ProgramData\ProjectTruth\images\project-truth-node-latest.vhdx` |
| Inno Setup compiler not installed locally | Environment | Install Inno Setup or use PowerShell fallback installer |
| Real Hyper-V apply not run | Safety | Run from elevated shell after image selection: `.\scripts\project-truth.ps1 terraform-apply -Apply` |
| No live guest IP yet | Environment | Apply VM, then run `.\scripts\project-truth.ps1 watch-until-healthy -GuestIp <ip>` |

## Recommended Next Goal

Produce or select the first real Project Truth Hyper-V VHDX, then run the full Terraform apply and health watch.

Risk level: medium, because it creates/runs a Hyper-V VM.

Preferred command:

```powershell
.\scripts\project-truth.ps1 run-elevated-proof -Apply -ImagePath C:\ProgramData\ProjectTruth\images\project-truth-node-latest.vhdx -WatchGitHubActions
```

## Truth

The current repo proves elevated install, common Start Menu shortcuts, config, CLI doctor, Terraform init/validate/plan, GitOps overlay rendering, and GitHub validation. It does not yet prove a real VM boot or health endpoint because there is no selected prebuilt VHDX artifact in this environment.
