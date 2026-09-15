# Hyper-V Final Artifact And Day-2 Repair

The final Project Truth Hyper-V artifact is the boot-proven appliance VHDX from
`project-truth-local-vhdx-proof`, normalized into a stable local image name:

```powershell
.\scripts\project-truth.ps1 finalize-local-vhdx -VmName project-truth-local-vhdx-proof -Force
```

That command requires the VM to be off unless `-StopVm` is supplied. It writes:

- `C:\ProgramData\ProjectTruth\images\project-truth-node-latest.vhdx`
- `C:\ProgramData\ProjectTruth\images\project-truth-node-latest.vhdx.sha256`
- `C:\ProgramData\ProjectTruth\images\project-truth-node-latest.manifest.json`
- `C:\ProgramData\ProjectTruth\config\image.json`

It also updates `terraform-hyperv/terraform.tfvars` so Terraform consumes the
stable `project-truth-node-latest.vhdx` path.

## Repair Priority

Use the cheapest repair path that fits the change:

1. App/API/UI changes: commit and push `develop`; GitHub Actions validates the
   repo. Promote a concrete image tag when changing the Kubernetes runtime:

```powershell
gh workflow run promote-gitops.yml -f environment=dev -f image_tag=<tag>
```

   For the local/offline VM path, import the same tag into K3s:

```powershell
.\scripts\project-truth.ps1 enable-k8s-runtime -GuestIp <vm-lan-ip> -ImageTag <tag>
```

   Argo CD then polls GitHub, detects the runtime overlay change, and syncs it.
2. Kubernetes drift: Argo CD applications already use automated sync with
   explicit enablement, `prune: true`, `selfHeal: true`, and retry. If the
   Applications are missing from the VM, `repair-appliance-online -Mode
   GitOpsRefresh` now uploads the host repo manifests, reapplies Argo platform
   config, and reapplies the Applications.
3. Appliance runtime issue: boot the VM and run:

```powershell
.\scripts\project-truth.ps1 repair-appliance-online -GuestIp <vm-lan-ip>
.\scripts\project-truth.ps1 watch-until-healthy -GuestIp <vm-lan-ip>
```

4. Data safety before risky repair:

```powershell
.\scripts\project-truth.ps1 backup-appliance-data -GuestIp <vm-lan-ip>
```

5. Optional Kubernetes runtime ownership:

```powershell
.\scripts\project-truth.ps1 enable-k8s-runtime -GuestIp <vm-lan-ip> -ImageTag develop
```

This moves BNPI PATS app/API/Postgres from Compose into K3s Deployments/StatefulSets
managed by Argo CD. Use this when the VM should self-heal runtime drift through
Kubernetes instead of systemd/Compose.

6. Platform/base-image change: rebuild or patch the VHDX, boot-prove it, then
   rerun `finalize-local-vhdx`.

See `docs/SELF_HEALING_AND_DRIFT_RECOVERY.md` for the full no-rebuild recovery
ladder and the remaining data-backup gaps.

## Why This Avoids Constant Rebuilds

The image should contain the base platform: Ubuntu, Docker, K3s, Argo CD, local
appliance helper commands, firewall rules, and first-boot identity cleanup. It
should not be the normal delivery mechanism for every BNPI PATS code change.

Argo CD automated sync lets a pipeline deploy by committing desired state to Git
instead of calling the cluster API directly. K3s can also auto-apply manifests
placed under `/var/lib/rancher/k3s/server/manifests`, which is useful for base
cluster bootstrap. Hyper-V VHDX files can be mounted from Windows with
`Mount-VHD` for emergency offline servicing, but prefer online repair and
GitOps when the VM can boot.

Argo CD reconciliation is explicit in `gitops/argocd/platform`:

```text
timeout.reconciliation: 60s
timeout.reconciliation.jitter: 15s
```

The VM still does not need an exposed inbound port for normal GitOps. Optional
webhooks use `/api/webhook` only when Argo CD is deliberately exposed through an
approved public URL or tunnel.

The default BNPI PATS app/API runtime still runs through the appliance Docker stack.
The opt-in `enable-k8s-runtime` command promotes the runtime into Kubernetes
Deployments/StatefulSets so Argo CD and K3s can own drift repair for the
workload layer too. GitOps controls the desired runtime tag; the VM must still
have that image tag available locally or through a configured registry.

References:

- Microsoft `Mount-VHD`: https://learn.microsoft.com/en-us/powershell/module/hyper-v/mount-vhd
- Argo CD automated sync/self-heal: https://argo-cd.readthedocs.io/en/latest/user-guide/auto_sync/
- K3s auto-deploy manifests: https://docs.k3s.io/installation/packaged-components
- cloud-init NoCloud/local seed pattern: https://docs.cloud-init.io/en/latest/reference/datasources/nocloud.html
- Client/environment scaling: GITOPS_CLIENT_ENV_SCALING.md
