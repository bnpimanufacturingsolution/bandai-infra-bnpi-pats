# Project Truth Hyper-V Terraform

This branch is the clean Hyper-V/Terraform direction for Project Truth, with a
separate maintainer image-factory track for VirtualBox client artifacts.

The normal user flow is:

```text
prebuilt Hyper-V image
  -> Terraform apply on the Windows host
  -> Argo CD sync inside the VM
  -> host-local, LAN, and inside-VM verification
```

Packer is not part of the normal install path. Packer belongs only to the optional maintainer image-factory flow that publishes a new Hyper-V VHDX or VirtualBox VDI/OVA when the base platform changes.

## Current Working Branch

```text
terraform-hyperv-clean-plan
```

## Main Documents

- [Terraform Hyper-V Architecture](docs/TERRAFORM_HYPERV_ARCHITECTURE.md)
- [Overnight Fresh Repo Prompt](docs/OVERNIGHT_TERRAFORM_HYPERV_FRESH_REPO_PROMPT.md)
- [Operations](docs/OPERATIONS.md)
- [Image Formats](docs/IMAGE_FORMATS.md)
- [Health Checks](docs/HEALTHCHECKS.md)
- [Installer Test Report](docs/INSTALLER_TEST_REPORT.md)

## Normal CLI Flow

```powershell
.\scripts\project-truth.ps1 doctor
.\scripts\project-truth.ps1 select-image -ImagePath C:\ProgramData\ProjectTruth\images\project-truth-node-latest.vhdx
.\scripts\project-truth.ps1 terraform-plan
.\scripts\project-truth.ps1 terraform-apply -Apply
.\scripts\project-truth.ps1 watch-until-healthy -GuestIp <guest-lan-ip>
```

`terraform-apply` requires `-Apply` on purpose. The default path does not delete existing VMs and does not run Packer.

## VHDX Autopilot

For a direct Hyper-V smoke test from an already-built `.vhdx`, use the VHDX autopilot command. It self-elevates through UAC, starts the Hyper-V management service, creates a fallback switch if needed, imports the VHDX, starts the VM, and prints guest IP/curl checks when an IP appears.

```powershell
.\scripts\project-truth.ps1 vhdx-autopilot -Mode Import -VhdxPath "C:\ProgramData\ProjectTruth\images\project-truth-devcurrent-hyperv.vhdx" -VmName "project-truth-devcurrent"
```

If the host cannot allocate the requested `4GB` startup RAM, the script automatically retries with lower startup RAM before failing.

To prove the full scoped lifecycle in one loop, create/start/delete the Hyper-V VM without deleting the source VHDX:

```powershell
.\scripts\project-truth.ps1 vhdx-autopilot -Mode SelfTestHyperV -VhdxPath "C:\ProgramData\ProjectTruth\images\project-truth-devcurrent-hyperv.vhdx" -VmName "project-truth-devcurrent" -PollCount 6 -PollSeconds 5
```

Cleanup commands are scoped to Project Truth names by default:

```powershell
.\scripts\project-truth.ps1 vhdx-autopilot -Mode DeleteHyperV -VmName "project-truth-devcurrent"
.\scripts\project-truth.ps1 vhdx-autopilot -Mode ResetHyperV
.\scripts\project-truth.ps1 vhdx-autopilot -Mode ResetVirtualBox
.\scripts\project-truth.ps1 vhdx-autopilot -Mode ResetImages
.\scripts\project-truth.ps1 vhdx-autopilot -Mode ResetAll -VmName "project-truth-devcurrent"
```

Add `-DeleteVhdx` only when the Hyper-V `.vhdx`/`.vhd` image files should be removed from `C:\ProgramData\ProjectTruth\images`.

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
|   |-- terraform-plan
|   |-- terraform-apply
|   `-- verify
|
|-- Prebuilt Hyper-V Image
|   |-- project-truth-node-<version>.vhdx
|   `-- project-truth-node-<version>.sha256
|
`-- Terraform Host Layer
    |-- creates/selects Hyper-V switch
    |-- creates Hyper-V VM
    |-- attaches VHDX
    |-- sets CPU and memory
    `-- outputs VM access info

Hyper-V Ubuntu VM
|
`-- K3s + Argo CD
    |
    |-- dev  -> NodePort 3001 -> /health
    |-- uat  -> NodePort 3002 -> /health
    `-- prod -> NodePort 3000 -> /health
```

## Target Repo Shape

```text
app/
gitops/
terraform-hyperv/
image-factory/
scripts/
docs/
.github/workflows/
```

## Image Format Targets

```powershell
.\scripts\project-truth.ps1 build-image -TargetPlatform hyperv
.\scripts\project-truth.ps1 build-image -TargetPlatform virtualbox
```

Hyper-V uses `.vhdx` and remains the Terraform-managed host path. VirtualBox uses
`.vdi` first, with `.ova` allowed as a handoff appliance format.

## Ownership Rules

| Concern | Owner |
|---|---|
| Hyper-V VM lifecycle | Terraform on Windows host |
| Base VM image rebuild | Optional Packer image factory |
| K3s and Argo CD platform | Prebuilt image or platform bootstrap |
| DEV/UAT/PROD application state | GitOps manifests synced by Argo CD |
| Health verification | Project Truth CLI scripts |

## Verification Goal

The final verifier must prove:

```text
Host-local health:
  http://127.0.0.1:3001/health
  http://127.0.0.1:3002/health
  http://127.0.0.1:3000/health

LAN health:
  http://<guest-lan-ip>:3001/health
  http://<guest-lan-ip>:3002/health
  http://<guest-lan-ip>:3000/health

Inside VM:
  hostname
  IP addresses
  Docker containers, if present
  Kubernetes nodes
  Kubernetes pods
  Kubernetes services
  Argo CD applications
```

## Legacy Note

Older VirtualBox-first and Terraform-inside-VM workflows may exist in the source history. They are source material only. The current VirtualBox support is limited to a separate image artifact track, not the Hyper-V Terraform runtime path.
