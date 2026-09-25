# Project Truth Hyper-V

This branch is the clean Hyper-V image and appliance direction for Project Truth, with a
separate maintainer image-factory track for VirtualBox client artifacts.

The normal user flow is:

```text
prebuilt Hyper-V image
  -> direct Hyper-V import/start on the Windows host
  -> Argo CD sync inside the VM
  -> host-local, LAN, and inside-VM verification
```

Packer is not part of the normal install path. Packer belongs only to the optional maintainer image-factory flow that publishes a new Hyper-V VHDX or VirtualBox VDI/OVA when the base platform changes.

## Current Working Branch

```text
main
```

Canonical remote: `https://github.com/bnpimanufacturingsolution/bandai-infra-bnpi-pats`

## Main Documents

- [BNPI PATS Documentation Index](docs/README.md)
- [PATS System Overview](docs/01-overview-and-requirements/PATS_SYSTEM_OVERVIEW.md)
- [Business Requirements Document (BRD)](docs/01-overview-and-requirements/BUSINESS_REQUIREMENTS_BRD.md)
- [Product Requirements Document (PRD)](docs/01-overview-and-requirements/PRODUCT_REQUIREMENTS_PRD.md)
- [Domain Foundation](docs/02-domain-and-architecture/DOMAIN_FOUNDATION.md)
- [Configurable Workflow Model](docs/02-domain-and-architecture/CONFIGURABLE_WORKFLOW_MODEL.md)
- [Routing & Variance Engine](docs/02-domain-and-architecture/ROUTING_AND_VARIANCE_ENGINE.md)
- [Planning Desk](docs/03-user-journeys-and-workstations/PLANNING_DESK.md)
- [Line Setup & Stations](docs/03-user-journeys-and-workstations/LINE_SETUP_AND_STATIONS.md)
- [Line Operations & Execution](docs/03-user-journeys-and-workstations/LINE_OPERATIONS_AND_EXECUTION.md)
- [Warehouse & Inventory](docs/03-user-journeys-and-workstations/WAREHOUSE_AND_INVENTORY.md)
- [On-Premises Appliance Architecture](docs/04-infrastructure-and-operations/ONPREM_APPLIANCE_ARCHITECTURE.md)
- [Local Development Setup](docs/04-infrastructure-and-operations/LOCAL_DEV_SETUP.md)
- [Cloudflare Named Tunnel Runbook](docs/CLOUDFLARE_NAMED_TUNNEL_RUNBOOK.md)
- [GitOps Client Scaling Runbook](docs/GITOPS_CLIENT_ENV_SCALING.md)

## Normal CLI Flow

```powershell
.\scripts\project-truth.ps1 doctor
.\scripts\project-truth.ps1 select-image -ImagePath C:\ProgramData\BandaiApp\Bnpipats\images\project-truth-node-latest.vhdx
.\scripts\project-truth.ps1 vhdx-autopilot -Mode Import -VhdxPath C:\ProgramData\BandaiApp\Bnpipats\images\project-truth-node-latest.vhdx -VmName bnpi-pats
.\scripts\project-truth.ps1 watch-until-healthy -GuestIp <guest-lan-ip>
```

The normal path uses the direct Hyper-V PowerShell flow. It does not run Packer and does not use a Terraform state or apply step.

## VHDX Autopilot

For a direct Hyper-V smoke test from an already-built `.vhdx`, use the VHDX autopilot command. It self-elevates through UAC, starts the Hyper-V management service, creates a fallback switch if needed, imports the VHDX, starts the VM, and prints guest IP/curl checks when an IP appears.

```powershell
.\scripts\project-truth.ps1 vhdx-autopilot -Mode Import -VhdxPath "C:\ProgramData\BandaiApp\Bnpipats\images\project-truth-devcurrent-hyperv.vhdx" -VmName "project-truth-devcurrent"
```

If the host cannot allocate the requested `4GB` startup RAM, the script automatically retries with lower startup RAM before failing.

To prove the full scoped lifecycle in one loop, create/start/delete the Hyper-V VM without deleting the source VHDX:

```powershell
.\scripts\project-truth.ps1 vhdx-autopilot -Mode SelfTestHyperV -VhdxPath "C:\ProgramData\BandaiApp\Bnpipats\images\project-truth-devcurrent-hyperv.vhdx" -VmName "project-truth-devcurrent" -PollCount 6 -PollSeconds 5
```

Cleanup commands are scoped to Project Truth names by default:

```powershell
.\scripts\project-truth.ps1 vhdx-autopilot -Mode DeleteHyperV -VmName "project-truth-devcurrent"
.\scripts\project-truth.ps1 vhdx-autopilot -Mode ResetHyperV
.\scripts\project-truth.ps1 vhdx-autopilot -Mode ResetVirtualBox
.\scripts\project-truth.ps1 vhdx-autopilot -Mode ResetImages
.\scripts\project-truth.ps1 vhdx-autopilot -Mode ResetAll -VmName "project-truth-devcurrent"
```

Add `-DeleteVhdx` only when the Hyper-V `.vhdx`/`.vhd` image files should be removed from `C:\ProgramData\BandaiApp\Bnpipats\images`.

## Installer Flow

```powershell
.\installer\build-installer.ps1
.\installer\install-project-truth.ps1 -InstallDir "$env:ProgramFiles\ProjectTruth"
```

If Inno Setup is installed, `build-installer.ps1` compiles `dist\ProjectTruthSetup.exe`. If it is not installed, the PowerShell installer remains the fallback.

## Target Architecture

```text
Windows Host
|
|-- Project Truth CLI
|   |-- doctor
|   |-- select-image
|   |-- download-image
|   |-- vhdx-autopilot
|   `-- verify
|
|-- Prebuilt Hyper-V Image
|   |-- project-truth-node-<version>.vhdx
|   `-- project-truth-node-<version>.sha256
|
`-- Direct Hyper-V Host Layer
    |-- selects/creates a Hyper-V switch
    |-- imports the VHDX as a Gen2 VM
    |-- starts the VM and reports its address
    `-- records the selected image and VM settings

Hyper-V Ubuntu VM
|
`-- K3s + Argo CD
    |
    |-- prod -> app 3000, API 3001 -> /health
    |-- dev  -> app 3100, API 3101 -> /health
    `-- uat  -> app 3200, API 3201 -> /health
```

## Target Repo Shape

```text
app/
gitops/
image-factory/
bnpi-pats-api/
bnpi-pats-app/
scripts/
docs/
.github/workflows/
```

## Image Format Targets

```powershell
.\scripts\project-truth.ps1 build-image -TargetPlatform hyperv
.\scripts\project-truth.ps1 build-image -TargetPlatform virtualbox
```

Hyper-V uses `.vhdx` and is consumed by the direct Hyper-V CLI path. VirtualBox uses
`.vdi` first, with `.ova` allowed as a handoff appliance format.

## Ownership Rules

| Concern | Owner |
|---|---|
| Hyper-V VM lifecycle | Project Truth CLI and Hyper-V PowerShell |
| Base VM image rebuild | Optional Packer image factory |
| K3s and Argo CD platform | Prebuilt image or platform bootstrap |
| DEV/UAT/PROD application state | GitOps manifests synced by Argo CD |
| Health verification | Project Truth CLI scripts |

## Verification Goal

The final verifier must prove:

```text
Host-local health:
  http://127.0.0.1:3000/auth/login
  http://127.0.0.1:3001/health
  http://127.0.0.1:3300/auth/login
  http://127.0.0.1:3100/auth/login
  http://127.0.0.1:3101/health
  http://127.0.0.1:3310/auth/login
  http://127.0.0.1:3200/auth/login
  http://127.0.0.1:3201/health
  http://127.0.0.1:3320/auth/login

LAN health:
  http://<guest-lan-ip>:3000/auth/login
  http://<guest-lan-ip>:3001/health
  http://<guest-lan-ip>:3300/auth/login
  http://<guest-lan-ip>:3100/auth/login
  http://<guest-lan-ip>:3101/health
  http://<guest-lan-ip>:3310/auth/login
  http://<guest-lan-ip>:3200/auth/login
  http://<guest-lan-ip>:3201/health
  http://<guest-lan-ip>:3320/auth/login

Inside VM:
  hostname
  IP addresses
  Docker containers, if present
  Kubernetes nodes
  Kubernetes pods
  Kubernetes services
  Argo CD applications

Public Cloudflare:
  https://bnpi-pats.tech/auth/login
  https://api.bnpi-pats.tech/health
  https://dev.bnpi-pats.tech/auth/login
  https://uat.bnpi-pats.tech/auth/login
  https://emp.bnpi-pats.tech/auth/login
  https://dev-emp.bnpi-pats.tech/auth/login
  https://uat-emp.bnpi-pats.tech/auth/login
  https://grafana.bnpi-pats.tech/api/health
```

## Legacy Note

Older VirtualBox-first and Terraform-based workflows may exist in the source history. They are source material only. The current VirtualBox support is limited to a separate image artifact track, and Hyper-V uses the direct CLI path.
