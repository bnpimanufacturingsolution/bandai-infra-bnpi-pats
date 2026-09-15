# Project Truth Hyper-V Architecture

The fresh Hyper-V architecture is:

```text
prebuilt Hyper-V image
  -> Terraform on the Windows host creates/manages the VM
  -> VM boots K3s + Argo CD
  -> Argo CD syncs DEV/UAT/PROD GitOps manifests
  -> Project Truth CLI verifies host-local, LAN, and inside-VM health
```

Normal users do not run Packer. Packer lives in `image-factory/packer/` for maintainers who need to publish a new target artifact when the base platform changes.

## Responsibility Split

| Concern | Owner |
|---|---|
| VM lifecycle | `terraform-hyperv/` on the Windows host |
| Base image rebuild | `image-factory/packer/` maintainer flow for Hyper-V VHDX or VirtualBox VDI/OVA |
| Application desired state | `gitops/` consumed by Argo CD |
| User workflow | `scripts/project-truth.ps1` and installer shortcuts |
| Diagnostics | `scripts/watch-until-healthy.ps1` and `scripts/repair-and-verify.ps1` |

## Ports

The current BNPI PATS appliance runtime exposes app/API pairs. The GitOps overlays record these same ports as environment contract data.

| Environment | App | API Health | Postgres Host Port |
|---|---:|---:|---:|
| PROD | `3000` | `3001/health` | `15432` |
| DEV | `3100` | `3101/health` | `15433` |
| UAT | `3200` | `3201/health` | `15434` |

The default appliance runtime still uses the Docker stack. The Kubernetes GitOps
contract now includes both environment ConfigMaps and opt-in runtime overlays
for BNPI PATS app/API/Postgres Deployments/StatefulSets when `enable-k8s-runtime` is
used.

## Legacy Boundary

Terraform-inside-VM deployment is not part of this branch's normal product path. VirtualBox is supported only as a separate client image artifact track; it does not use `terraform-hyperv/`.
