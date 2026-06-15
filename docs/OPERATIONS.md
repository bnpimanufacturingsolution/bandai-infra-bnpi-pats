# Operations

## Fresh-Start Contract

This branch is a fresh Hyper-V/Terraform implementation.

Legacy VirtualBox, OVA, and Terraform-inside-VM behavior is source material only.

Normal users consume a prebuilt VHDX. Packer is maintainer-only. Terraform runs on the Windows host. Kubernetes and Argo CD run inside the VM.

## Inventory Snapshot

The implementation run verified:

```text
terraform version: available
gh auth status: authenticated
repo branch: terraform-hyperv-clean-plan
terraform init: passed with taliesins/hyperv v1.2.1
terraform validate: passed
terraform plan: passed with runtime-only test tfvars
installer fallback: passed into C:\tmp\ProjectTruthInstallTest
installed CLI doctor: passed
terraform apply: skipped by safety gate because no prebuilt VHDX is selected
```

## Normal Commands

```powershell
.\scripts\project-truth.ps1 doctor
.\scripts\project-truth.ps1 select-image
.\scripts\project-truth.ps1 terraform-plan
.\scripts\project-truth.ps1 terraform-apply -Apply
.\scripts\project-truth.ps1 watch-until-healthy -GuestIp <guest-lan-ip>
```

## Safety Defaults

```text
Terraform apply is not automatic.
Existing VMs are not deleted automatically.
Packer is not invoked by normal installer or Terraform commands.
Runtime logs stay in .runtime/.
```
