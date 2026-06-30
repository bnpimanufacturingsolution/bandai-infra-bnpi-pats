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
