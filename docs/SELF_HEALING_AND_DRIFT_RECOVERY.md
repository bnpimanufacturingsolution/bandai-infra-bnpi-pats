# Self-Healing And Drift Recovery

Project Truth can recover many day-2 failures without rebuilding the base
image, but the recovery boundary is explicit:

```text
Windows host repo
-> selected boot-proven VHDX
-> Hyper-V VM
-> K3s + Argo CD control plane
-> appliance Docker runtime
-> LAN HRIS app/API
-> optional trycloudflare tunnel
```

## What Self-Heals Today

| Layer | Current self-heal path | Rebuild required? |
|---|---|---|
| Selected image pointer | `select-image` and `finalize-local-vhdx` preserve a stable VHDX path and checksum. | No |
| Hyper-V VM lifecycle | Terraform recreates the VM from the selected VHDX. | No, unless the VHDX itself is bad |
| K3s control plane | `repair-appliance-online` restarts `k3s`. | No |
| Argo CD Application drift | Argo Applications use automated sync, pruning, self-heal, and retry. | No |
| Argo CD platform drift | `repair-appliance-online -Mode GitOpsRefresh` reapplies the explicit Argo reconciliation config. | No |
| Missing Argo Applications | `repair-appliance-online` first applies in-image manifests, then uploads host repo manifests if they are absent. | No |
| HRIS app/API containers | Docker Compose uses `restart: unless-stopped`; `project-truth-hris` starts the runtime on boot. | No |
| HRIS Kubernetes runtime | `enable-k8s-runtime` moves PROD/DEV/UAT HRIS app/API/Postgres into K3s Deployments/StatefulSets managed by Argo CD. | No |
| HRIS runtime outage | `repair-appliance-online -Mode RestartRuntime` restarts Docker, K3s, and HRIS services. | No |
| HRIS data safety net | `backup-appliance-data` captures Postgres and uploads; `restore-appliance-data -Force` restores them. | No |
| LAN health proof | `watch-until-healthy` and `verify-lan-health` prove app/API URLs. | No |
| Experimental TryCloudflare proof | `start-trycloudflare-suite` starts temporary public URLs only when `EXPERIMENTAL_TRY_CLOUDFLARE=true`; VM hook is installed but disabled by default. | No |

## What Does Not Fully Self-Heal Yet

| Gap | Why it matters | Target fix |
|---|---|---|
| HRIS Kubernetes runtime is opt-in | Compose remains the default proven runtime until a VM runs `enable-k8s-runtime`. | Run the K8s runtime migration after boot proof, then capture a new visual proof. |
| Postgres and uploads backup is manual, not scheduled | Container restart does not fix corrupted or deleted data volumes. | Schedule `backup-appliance-data` or move persistence to a managed backup target. |
| K3s snapshots are not yet wired to external durable storage | Local K3s snapshots help cluster metadata recovery but do not protect against disk loss. | Configure K3s snapshot retention and S3-compatible off-host copy. |
| VM disk corruption cannot be repaired by Argo or Compose | If the selected VHDX is unreadable, online repair cannot boot. | Restore from the stable VHDX artifact or a known-good archived copy. |
| TryCloudflare is temporary | Quick tunnels produce random test URLs and are not a production SLA. | Use only after LAN target is verified; use a named tunnel for production sharing. Raw database tunnels remain disabled by default. |

## No-Rebuild Repair Ladder

Use the cheapest repair that matches the failure.

1. Verify the selected artifact:

```powershell
Get-Content C:\ProgramData\ProjectTruth\config\image.json
Get-FileHash C:\ProgramData\ProjectTruth\images\project-truth-node-latest.vhdx -Algorithm SHA256
```

2. Verify GitOps locally:

```powershell
.\scripts\project-truth.ps1 verify-gitops-state
.\scripts\project-truth.ps1 test-self-heal-contract
```

`test-self-heal-contract` is also enforced in GitHub Actions. It verifies that
the rendered runtime overlays contain the Kubernetes workload objects, probes,
host ports, local image policy, hostPath persistence, Argo self-heal/retry
settings, K3s image pre-import, and K3s auto-deploy bootstrap.

3. Repair missing or drifted Argo Applications from a booted VM:

```powershell
.\scripts\project-truth.ps1 repair-appliance-online -GuestIp <vm-lan-ip> -Mode GitOpsRefresh
```

4. Move HRIS into Kubernetes/Argo ownership when the VM should self-heal app/API/Postgres without Compose:

```powershell
.\scripts\project-truth.ps1 backup-appliance-data -GuestIp <vm-lan-ip>
.\scripts\project-truth.ps1 enable-k8s-runtime -GuestIp <vm-lan-ip> -ImageTag develop
```

This stops the Compose runtime, imports the selected local image tag into K3s
containerd, stores the image archive under K3s's image pre-import directory,
writes the Argo runtime Application manifests to K3s's auto-deploy directory,
and applies the runtime Applications. If a promoted tag is used, pass the same
tag to `-ImageTag`; the script can retag the existing local `develop` images for
offline appliance promotion, or fail early if the selected local images are not
available.

To return to Compose:

```powershell
.\scripts\project-truth.ps1 disable-k8s-runtime -GuestIp <vm-lan-ip> -RestartCompose
```

5. Repair the appliance runtime:

```powershell
.\scripts\project-truth.ps1 repair-appliance-online -GuestIp <vm-lan-ip> -Mode RestartRuntime
```

6. Run full online repair and LAN proof:

```powershell
.\scripts\project-truth.ps1 repair-appliance-online -GuestIp <vm-lan-ip>
.\scripts\project-truth.ps1 watch-until-healthy -GuestIp <vm-lan-ip>
```

6a. Run optional temporary public proof after LAN health passes:

```powershell
$env:EXPERIMENTAL_TRY_CLOUDFLARE = "true"
.\scripts\project-truth.ps1 start-trycloudflare-suite -GuestIp <vm-lan-ip> -VerifyLocalFirst
```

The proof is written under `.runtime\trycloudflare\<timestamp>`. URLs are
temporary and rotate whenever the cloudflared processes restart.

7. Capture data before risky repairs:

```powershell
.\scripts\project-truth.ps1 backup-appliance-data -GuestIp <vm-lan-ip>
```

8. Restore data only from an intentional backup path:

```powershell
.\scripts\project-truth.ps1 restore-appliance-data -GuestIp <vm-lan-ip> -BackupPath <backup-folder> -Force
```

9. Only rebuild or patch the VHDX when the base platform changed or the VM
   cannot boot from the selected image.

## Argo Drift Contract

The repo now requires all three Argo CD Applications to exist:

- `project-truth-dev`
- `project-truth-uat`
- `project-truth-prod`

Each Application has:

- automated sync explicitly enabled
- `prune: true`
- `selfHeal: true`
- retry with exponential backoff

Argo CD platform config is also declared:

- `timeout.reconciliation: 60s`
- `timeout.reconciliation.jitter: 15s`

`verify-gitops-state -GuestIp <vm-lan-ip>` fails if any Application is missing.
`repair-appliance-online -Mode GitOpsRefresh` recovers missing Applications from
the host repo when the in-image copy is absent or stale.

When `enable-k8s-runtime` is used, three additional Applications are installed:

- `project-truth-runtime-dev`
- `project-truth-runtime-uat`
- `project-truth-runtime-prod`

Those Applications point at `gitops/runtime-k8s/overlays/*`, where HRIS app,
API, Postgres, hostPath persistence, health probes, and LAN host ports are
declared as Kubernetes state.

## Visual Proof Expectations

The first browser hit may be blank while the app warms up. Do not accept that as
failure or success by itself. A valid visual proof should include:

- `/auth/login` eventually renders.
- Admin user creation or login succeeds.
- Authenticated dashboard renders.
- API health endpoints return healthy JSON.
- PROD, DEV, and UAT app/API pairs pass LAN checks.

The latest proof folder with real screenshots is:

```text
.runtime\local-hyperv-proof-20260623-185743
```

It includes the authenticated HRIS admin dashboard, Prometheus, and Grafana
screenshots.

## References

- Kubernetes self-healing: https://kubernetes.io/docs/concepts/architecture/self-healing/
- Argo CD automated sync and self-heal: https://argo-cd.readthedocs.io/en/latest/user-guide/auto_sync/
- K3s snapshots and restore: https://docs.k3s.io/cli/etcd-snapshot
- K3s image pre-import: https://docs.k3s.io/add-ons/import-images
- TryCloudflare quick tunnels: https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/do-more-with-tunnels/trycloudflare/
