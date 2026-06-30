# Recommendation Registry

Recommendations are candidate work only. They are not accepted project truth,
active Workspace tasks, or commitments until reviewed and promoted.

## Proposed

### REC-20260629-001: Decide Canonical Cloudflare Connector Ownership

- Status: Proposed
- Evidence: The proof VM now has an active VM-side `cloudflared-bnpi-hris.service`
  connector with localhost ingress and verified public SSH through
  `ssh.bnpi-hris.tech`; the Windows host connector remains active and remains
  the fresh-import bootstrap path.
- Recommendation: Decide whether VM-managed Cloudflare should become the
  canonical post-import path, and document a secure credential handoff process
  that never bakes tunnel credentials into images.
- 2026-06-30 evidence: Public `bnpi-hris.tech` alternated between stale and
  repaired HRIS frontend bundles until the Windows host connector was stopped;
  public traffic stabilized after VM-managed ingress was routed to the verified
  VM LAN origin.

### REC-20260629-002: Upgrade Windows Host Cloudflared

- Status: Proposed
- Evidence: `cloudflared tunnel info bnpi-hris` reported Windows connector
  version `2025.6.0` and recommended `2026.6.1`; the VM-side connector is
  already `linux_amd64` version `2026.6.1`.
- Recommendation: Upgrade the Windows host `cloudflared` binary during a
  maintenance pass and reverify `bnpi-hris.tech` public HTTP and SSH routes.

### REC-20260630-003: Script Repeatable V5 Artifact Publishing

- Status: Proposed
- Evidence: The V5 publish pass required manual VM quiescing, offline VHDX
  hashing, stale gcloud tracker cleanup, sidecar metadata refresh, BOM-free JSON
  manifest repair, large-object upload monitoring, and public URL verification.
- Recommendation: Add a dedicated V5 publish script that performs those steps
  repeatably without baking Cloudflare credentials into the image.

### REC-20260630-004: Harden HRIS Static Asset Serving

- Status: Proposed
- Evidence: During public dashboard verification, missing `/assets/...` paths
  were served as SPA `index.html` with HTTP 200 and cached by Cloudflare, causing
  module MIME errors until a fresh asset namespace was deployed.
- Recommendation: Keep asset misses as non-cacheable 404 responses and add a
  regression check that public JS/CSS asset URLs never return HTML.

### REC-20260630-005: Add Public Environment Browser/CORS Smoke

- Status: Proposed
- Evidence: PROD public login worked while DEV/UAT initially failed in-browser
  because `/api/system-provisioning/status` did not emit CORS headers for the
  paired public app origins, even though API health and auth probes returned 200.
- Recommendation: Add a repeatable public smoke that checks PROD/DEV/UAT
  runtime API-base selection, CORS headers for pre-login provisioning endpoints,
  login, `/auth/me`, and dashboard overview responses.

### REC-20260630-006: Enable Browser-Rendered SSH for Remote Admins

- Status: Proposed
- Evidence: The accepted clean BNPI access journey keeps the Windows Server as
  Hyper-V-only, runs the Cloudflare connector inside the Linux VM, and expects
  remote admins to open `https://ssh.bnpi-hris.tech` from unprepared browsers.
  VM-side `ssh://localhost:22` ingress and CLI SSH are already proven, but
  browser-rendered SSH still needs Cloudflare Access application proof.
- Recommendation: Enable browser-based SSH sessions for `ssh.bnpi-hris.tech` in
  Cloudflare Zero Trust, verify Access policy/user mapping, and capture browser
  terminal evidence after the next V6 one-shot run.

### REC-20260630-007: Reconcile K3s Runtime Health With Serving Runtime

- Status: Proposed
- Evidence: During V6 one-shot proof on `192.168.254.148`, Argo CD Applications
  reported `Synced/Healthy` while many K3s pods were `Pending`, `Evicted`, or
  `ContainerStatusUnknown`; LAN/public HRIS traffic was restored by recreating
  Compose app/API containers from existing local images.
- Recommendation: Decide whether Compose remains the serving runtime for the V6
  appliance profile or increase/tune K3s capacity so Argo runtime Application
  health reflects actual app/API serving health.

### REC-20260630-008: Package V6 As V2-Style One-Click Zip

- Status: Proposed
- Evidence: The V2 reference under `.runtime/gcp-v2-format` provides the desired
  client journey: extract a tiny zip, double-click a `.cmd`, self-elevate,
  download the VHDX and sidecars from the public storage bucket, verify SHA-256,
  import/start Hyper-V, and leave the window open. The V6 runtime proof now
  requires an added credential preflight/import phase from ProgramData and must
  not bake Cloudflare credentials into the image or zip.
- Recommendation: Build the V6 installer zip by preserving the V2 click flow and
  adding the V6 one-shot runtime phase after import/start. Include only scripts
  and instructions in the zip; keep the VHDX in the bucket and keep the
  Cloudflare credential as host-side runtime state.

### REC-20260630-009: Make Hikvision Listener Runtime First-Class

- Status: Proposed
- Evidence: Hikvision API, DB, UI, and socket contracts exist, and
  `vendor/hikvision-bio` now provides editable AlarmDemo source, but current
  GitOps/VM manifests do not manage AlarmDemo as a service and physical-device
  runtime proof is still pending.
- Recommendation: Decide whether AlarmDemo remains a Windows-host sidecar like
  ZKTeco or becomes a managed VM/host service, then add a repeatable startup,
  health, log, and browser/socket verification path without committing HCNetSDK
  proprietary binaries or device credentials.
