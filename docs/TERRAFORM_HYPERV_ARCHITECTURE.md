# Project Truth Terraform Hyper-V Architecture

This is the clean architecture direction for the current `develop` branch.

The important decision:

```text
Normal users consume a prebuilt Hyper-V image.
Terraform creates and manages the Hyper-V VM.
Kubernetes + Argo CD own DEV/UAT/PROD environment contract sync.
Packer is only for the optional maintainer image-factory flow.
```

## Normal Target Hierarchy

This is the main architecture. Packer is not in this tree because normal users should not rebuild the VM image every time.

```text
Physical Server / Laptop
|
|-- Windows Host OS
|   |
|   |-- Host IP
|   |   `-- 127.0.0.1
|   |
|   |-- Host LAN IP
|   |   `-- Example: 192.168.1.50
|   |
|   |-- Project Truth Installer / CLI
|   |   |-- doctor
|   |   |-- install-prereqs
|   |   |-- select-image
|   |   |-- download-image
|   |   |-- terraform-plan
|   |   |-- terraform-apply
|   |   `-- verify
|   |
|   |-- Prebuilt Hyper-V Image Artifact
|   |   |-- project-truth-node-<version>.vhdx
|   |   |-- project-truth-node-<version>.sha256
|   |   `-- checksum verified before use
|   |
|   |-- Terraform Host Layer
|   |   |-- provider: taliesins/hyperv
|   |   |-- creates/selects Hyper-V switch
|   |   |-- creates/attaches VM disk
|   |   |-- creates Hyper-V VM
|   |   |-- sets CPU and memory
|   |   `-- outputs VM access info
|   |
|   `-- GitHub Actions Self-Hosted Runner
|       |-- runs tests
|       |-- builds app image
|       |-- pushes app image
|       `-- updates GitOps overlays
|
`-- Microsoft Hyper-V
    |
    |-- External / Bridge Switch
    |   `-- connected to physical LAN adapter
    |       `-- Wi-Fi or Ethernet
    |
    `-- Ubuntu Server VM: project-truth-node-01
        |
        |-- Guest LAN IP
        |   `-- Example: 192.168.1.80
        |
        |-- Platform
        |   |
        |   |-- K3s single-node Kubernetes
        |   |
        |   |-- Argo CD
        |   |   `-- watches GitOps manifests in GitHub
        |   |
        |   `-- Local Registry / Image Pull Config
        |
        `-- Kubernetes Cluster
            |
            |-- Namespace: dev
            |   |
            |   `-- DEV Environment Contract
            |       |
            |       `-- ConfigMap: project-truth-environment
            |           |-- app_port: 3100
            |           `-- api_port: 3101
            |
            |-- Namespace: uat
            |   |
            |   `-- UAT Environment Contract
            |       |
            |       `-- ConfigMap: project-truth-environment
            |           |-- app_port: 3200
            |           `-- api_port: 3201
            |
            `-- Namespace: prod
                |
                `-- PROD Environment Contract
                    |
                    `-- ConfigMap: project-truth-environment
                        |-- app_port: 3000
                        `-- api_port: 3001
```

## Optional Image Factory

Packer is still useful, but it belongs here, not in the normal install path.

```text
Image Maintainer / Release Builder
|
|-- Packer
|   |-- starts from Ubuntu ISO
|   |-- installs base platform dependencies
|   |-- installs or seeds K3s / Argo CD bootstrap files
|   |-- copies Project Truth bootstrap assets
|   `-- outputs VHDX or exported Hyper-V artifact
|
|-- Release Artifact Store
|   |-- project-truth-node-<version>.vhdx
|   |-- project-truth-node-<version>.sha256
|   `-- release notes
|
`-- Normal Users
    |-- download/select prebuilt image
    |-- terraform apply
    `-- verify health
```

So the default path is:

```text
Normal install:
  prebuilt image -> terraform apply -> Argo CD sync -> verify

Image rebuild only when base platform changes:
  packer build -> publish artifact -> terraform users consume new version
```

## Control Plane Vs Runtime Plane

```text
Control Plane
|
|-- GitHub
|   |-- source code
|   |-- pull requests
|   |-- GitOps manifests
|   `-- workflow history
|
|-- GitHub Actions Runner
|   |-- may physically run on the Windows host
|   `-- logically stays outside the VM runtime
|
|-- Terraform Host Layer
|   `-- creates/manages Hyper-V infrastructure
|
`-- Project Truth CLI
    `-- wraps doctor/select-image/download/plan/apply/verify

Runtime Plane
|
`-- Hyper-V Ubuntu VM
    |
    `-- Kubernetes
        |
        `-- Argo CD
            |
            `-- DEV / UAT / PROD apps from GitOps manifests
```

## Responsibility Split

| Concern | Recommended Owner | Why |
|---|---|---|
| Normal VM setup | Project Truth CLI + Terraform | Users should not run many low-level commands |
| Base VM image | Prebuilt artifact | Normal users should not wait for image builds |
| Image rebuilds | Packer image factory | Image building is Packer's job |
| Hyper-V VM lifecycle | Terraform on Windows host | VM creation is infrastructure lifecycle |
| Hyper-V switch/disk/CPU/memory | Terraform on Windows host | These are host infrastructure resources |
| K3s installation | Prebuilt image or first-boot bootstrap | The VM should boot into a known platform state |
| Argo CD installation | Prebuilt image or bootstrap | It is platform bootstrap, not app release flow |
| DEV/UAT/PROD application resources | GitOps manifests consumed by Argo CD | Kubernetes apps should be declarative and versioned in Git |
| Image tags/promotions | GitHub Actions updating GitOps overlays | CI/CD should promote versions by changing Git state |
| Health verification | Project Truth CLI / PowerShell verifier | Diagnostics should be easy to run |

## What Changed From The Old Mental Model

```text
Old:
Physical Server / Laptop
|
`-- VirtualBox
    |
    `-- Ubuntu Server
        |
        `-- Terraform inside VM
            |
            |-- DEV
            |-- UAT
            `-- PROD
                |
                `-- Docker
                    |
                    `-- Node.js / HR App

New:
Physical Server / Laptop
|
|-- Terraform on Windows host
|   `-- creates/manages Hyper-V VM
|
`-- Hyper-V
    |
    `-- Ubuntu Server VM
        |
        `-- Kubernetes + Argo CD
            |
            |-- DEV namespace
            |   `-- HR App / Node.js App
            |
            |-- UAT namespace
            |   `-- HR App / Node.js App
            |
            `-- PROD namespace
                `-- HR App / Node.js App
```

## Promotion Flow

```text
Developer
|
`-- pushes code / opens PR
    |
    `-- GitHub Actions
        |-- runs tests
        |-- builds app image
        |-- pushes image to registry
        `-- updates GitOps overlay release tag
            |
            |-- gitops/overlays/dev
            |-- gitops/overlays/uat
            `-- gitops/overlays/prod
                |
                `-- Argo CD sees Git change
                    |
                    `-- Kubernetes reconciles environment contracts
                        |-- PROD app/API -> :3000 / :3001
                        |-- DEV app/API  -> :3100 / :3101
                        `-- UAT app/API  -> :3200 / :3201
```

## Terraform Host Layer Shape

```text
terraform-hyperv/
|
|-- providers.tf
|   `-- taliesins/hyperv provider
|
|-- variables.tf
|   |-- vm_name
|   |-- switch_name
|   |-- memory_mb
|   |-- cpu_count
|   |-- source_vhdx_path
|   |-- vm_path
|   |-- ssh_port
|   |-- dev_port
|   |-- uat_port
|   `-- prod_port
|
|-- main.tf
|   |
|   `-- module "project_truth_hyperv_vm"
|       |-- passes VM settings
|       |-- passes network settings
|       `-- passes artifact path
|
|-- outputs.tf
|   |-- vm_name
|   |-- switch_name
|   |-- ssh_target
|   |-- dev_health_url
|   |-- uat_health_url
|   `-- prod_health_url
|
`-- modules/
    |
    `-- project-truth-hyperv-vm/
        |
        |-- main.tf
        |   |-- Hyper-V switch or selected existing switch
        |   |-- VHDX/disk attachment
        |   |-- VM instance
        |   |-- CPU setting
        |   |-- memory setting
        |   `-- network adapter connection
        |
        |-- variables.tf
        |   `-- module inputs
        |
        `-- outputs.tf
            `-- module outputs
```

## Flexible Bridge Verification

The external switch name is stable (`ProjectTruth-External`), but the physical
adapter behind it is device-specific. On a laptop it may be Wi-Fi; on another
host it may be Ethernet. Verify the current host bridge and VM attachment with:

```powershell
.\scripts\project-truth.ps1 verify-hyperv-bridge -VmName PROJECT-TRUTH-NODE -SwitchName ProjectTruth-External -RequireExternal -FixVmAdapter
```

For VHDX autopilot imports, use `-RequireExternalSwitch` to prevent accidental
fallback to `Default Switch`, and pass `-BridgeAdapterName` when a device has
more than one active physical LAN adapter:

```powershell
.\scripts\project-truth.ps1 vhdx-autopilot -Mode Import -VhdxPath <path-to-vhdx> -VmName PROJECT-TRUTH-NODE -PreferredSwitch ProjectTruth-External -RequireExternalSwitch -BridgeAdapterName "Wi-Fi" -Start
```

The guest LAN address is reconciled by the LAN config service inside the VM. A correct
bridge proves the VM NIC is attached to the LAN-facing switch; endpoint proof
still requires the guest to acquire or report a usable LAN IP.

## Short Boss Explanation

```text
The normal installer does not build the image. It consumes a versioned prebuilt
Hyper-V artifact, then Terraform creates the VM. Packer remains as a maintainer
tool for refreshing the base image only when the platform changes. DEV/UAT/PROD
are Kubernetes namespaces managed by Argo CD from GitOps manifests.
```

## References

- Packer is for image creation: https://developer.hashicorp.com/packer
- Terraform provisioners are fallback behavior: https://developer.hashicorp.com/terraform/language/provisioners
- Argo CD is declarative GitOps CD for Kubernetes: https://argo-cd.readthedocs.io/
- GitHub self-hosted runners execute workflows on your own machine: https://docs.github.com/actions/hosting-your-own-runners
