# Operations

## Fresh-Start Contract

This branch is a fresh Hyper-V/Terraform implementation.

Legacy VirtualBox-first and Terraform-inside-VM behavior is source material only.
Current VirtualBox support is an image artifact track only.

Normal Hyper-V users consume a prebuilt VHDX. VirtualBox clients consume a prebuilt VDI/OVA. Packer is maintainer-only. Terraform runs on the Windows host for the Hyper-V path. Kubernetes and Argo CD run inside the VM.

## Inventory Snapshot

The implementation run verified:

```text
terraform version: available
gh auth status: authenticated
repo branch: develop
terraform init: passed with taliesins/hyperv v1.2.1
terraform validate: passed
terraform plan: passed with runtime-only test tfvars
installer fallback: passed into C:\tmp\ProjectTruthInstallTest
installed CLI doctor: passed
terraform apply: skipped by safety gate because no prebuilt VHDX is selected
```

Current checkout branch for this working tree is `develop`. Older archived prompts may still mention `terraform-hyperv-clean-plan`; treat those as historical source material, not the current branch source of truth.

## Normal Commands

```powershell
.\scripts\project-truth.ps1 doctor
.\scripts\project-truth.ps1 select-image
.\scripts\project-truth.ps1 terraform-plan
.\scripts\project-truth.ps1 terraform-apply -Apply
.\scripts\project-truth.ps1 watch-until-healthy -GuestIp <guest-lan-ip>
```

## Local BNPI PATS Appliance Runtime

Start the production local stack:

```powershell
.\scripts\project-truth.ps1 start-local-bnpi-pats-runtime -Environment prod
```

Start all local environment stacks:

```powershell
.\scripts\project-truth.ps1 start-local-bnpi-pats-runtime -Environment all
```

Verify without starting containers:

```powershell
.\scripts\project-truth.ps1 verify-local-bnpi-pats-runtime -Environment all
```

## Safety Defaults

```text
Terraform apply is not automatic.
Existing VMs are not deleted automatically.
Packer is not invoked by normal installer or Terraform commands.
Runtime logs stay in .runtime/.
```
