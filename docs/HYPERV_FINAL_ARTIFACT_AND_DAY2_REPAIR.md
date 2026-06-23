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

1. App/API/UI changes: commit and push `develop`; GitHub Actions and GitOps
   should move the runtime forward.
2. Kubernetes drift: Argo CD applications already use automated sync with
   explicit enablement, `prune: true`, `selfHeal: true`, and retry. If the
   Applications are missing from the VM, `repair-appliance-online -Mode
   GitOpsRefresh` now uploads the host repo manifests and reapplies them.
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
.\scripts\project-truth.ps1 enable-k8s-runtime -GuestIp <vm-lan-ip>
```

This moves HRIS app/API/Postgres from Compose into K3s Deployments/StatefulSets
managed by Argo CD. Use this when the VM should self-heal runtime drift through
Kubernetes instead of systemd/Compose.

6. Platform/base-image change: rebuild or patch the VHDX, boot-prove it, then
   rerun `finalize-local-vhdx`.

See `docs/SELF_HEALING_AND_DRIFT_RECOVERY.md` for the full no-rebuild recovery
ladder and the remaining data-backup gaps.

## Why This Avoids Constant Rebuilds

The image should contain the base platform: Ubuntu, Docker, K3s, Argo CD, local
appliance helper commands, firewall rules, and first-boot identity cleanup. It
should not be the normal delivery mechanism for every HRIS code change.

Argo CD automated sync lets a pipeline deploy by committing desired state to Git
instead of calling the cluster API directly. K3s can also auto-apply manifests
placed under `/var/lib/rancher/k3s/server/manifests`, which is useful for base
cluster bootstrap. Hyper-V VHDX files can be mounted from Windows with
`Mount-VHD` for emergency offline servicing, but prefer online repair and
GitOps when the VM can boot.

The default HRIS app/API runtime still runs through the appliance Docker stack.
The opt-in `enable-k8s-runtime` command promotes the runtime into Kubernetes
Deployments/StatefulSets so Argo CD and K3s can own drift repair for the
workload layer too.

References:

- Microsoft `Mount-VHD`: https://learn.microsoft.com/en-us/powershell/module/hyper-v/mount-vhd
- Argo CD automated sync/self-heal: https://argo-cd.readthedocs.io/en/latest/user-guide/auto_sync/
- K3s auto-deploy manifests: https://docs.k3s.io/installation/packaged-components
- cloud-init NoCloud/local seed pattern: https://docs.cloud-init.io/en/latest/reference/datasources/nocloud.html
