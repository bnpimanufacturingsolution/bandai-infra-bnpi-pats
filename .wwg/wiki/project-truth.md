# Project Truth

Adoption status: INFERRED_FROM_EXISTING_PROJECT
Status: Inferred from repository evidence. Requires human/agent review before becoming accepted project truth.
Truth confidence: HIGH
Last adoption audit: 2026-06-29

This file was populated from existing code, documentation, package metadata, configuration, and observed implementation.

Items marked `INFERRED`, `NEEDS_CONFIRMATION`, `CONFLICTING`, or `STALE` should be reviewed before major future work.

If this file conflicts with lower-priority reports, generated notes, task files, or stale documentation, this file wins once confirmed.

Project Truth must not be silently overwritten. Requirement evolution is allowed when documented and accepted.

## Product Identity

- Product name: project_truth_hyperv_fresh
- Status: INFERRED
- Evidence: package.json (package name)

## Product Category

- Category: Web application
- Status: INFERRED
- Evidence: package/source (frontend framework or route folders detected)

## One-Line Description

- Description: project_truth_hyperv_fresh appears to be a web application.
- Status: INFERRED
- Evidence: package.json (package name); package/source (frontend framework or route folders detected)

## Primary Users and Roles

- Role: admin / hris-admin
  - Status: CONFIRMED
  - Evidence: User correction 2026-06-29; admin device/configuration routes under `hris-app/app/routes/admin`; ZKTeco device work occurs under `/admin/configuration/devices`.
  - Rule: Device management, device event review, runtime health checks, and ZKTeco repair/operations are admin-role work. Do not infer `hris-hr-manager` for `/admin` device or configuration tasks.
- Role: hris-hr-manager
  - Status: CONFIRMED_WITH_BOUNDARY
  - Evidence: Existing HRIS role tests and HR route code.
  - Rule: HR manager is valid for HR workflows where the code/docs explicitly require it, but it is not the default actor for admin configuration, device operations, GitOps, VM, or ZKTeco runtime drift work.
- Role: hris-hr-user, hris-employee-manager, hris-employee
  - Status: OBSERVED
  - Evidence: Existing HRIS role tests and app role types.

## Canonical Scope

Currently includes:

- Feature: Current Working Branch, Main Documents, Normal CLI Flow, VHDX Autopilot, Target Architecture, Target Repo Shape, Image Format Targets, Ownership Rules, app/server
  - Status: INFERRED
  - Evidence: README.md (README headings or route files)

Currently does not include unless approved:

- Boundary: mock/demo files detected
  - Status: INFERRED
  - Evidence: README/source/package (safety boundary indicators)

## Canonical Terminology

See `.wwg/wiki/terminology.md`.

Critical terms:

- Term: flow
  - Meaning: Observed project term; confirm canonical meaning before broad use.
  - Status: INFERRED
  - Evidence: README heading
- Term: package
  - Meaning: Observed project term; confirm canonical meaning before broad use.
  - Status: INFERRED
  - Evidence: app/package-lock.json, app/package.json
- Term: target
  - Meaning: Observed project term; confirm canonical meaning before broad use.
  - Status: INFERRED
  - Evidence: README heading
- Term: truth
  - Meaning: Observed project term; confirm canonical meaning before broad use.
  - Status: INFERRED
  - Evidence: package/name, README heading
- Term: architecture
  - Meaning: Observed project term; confirm canonical meaning before broad use.
  - Status: NEEDS_CONFIRMATION
  - Evidence: README heading

## Architecture Truth

Accepted or observed architecture:

- Item: source folders: app
  - Status: INFERRED
  - Evidence: source/config (folders and package metadata)
- Item: ZKTeco runtime uses the Windows Standalone SDK sidecar under `appliance/zkteco-standalone-sdk`; the Node.js bridge under `appliance/zkteco-bridge` is retired from active Docker, K3s, and GitOps runtime paths.
  - Status: CONFIRMED
  - Evidence: docs/ZKTECO_RUNTIME_TRUTH.md; .wwg/reports/zkteco-node-bridge-retirement-20260629.md
- Item: Current Hyper-V proof VM exists as `project-truth-local-vhdx-proof` on the `ProjectTruth-External` switch.
  - Status: CONFIRMED_RUNTIME_EVIDENCE
  - Evidence: `Get-VM` and `Get-VMNetworkAdapter` on 2026-06-29 showed VM `project-truth-local-vhdx-proof`, Generation 2, attached to switch `ProjectTruth-External`.
- Item: Current Hyper-V proof VM LAN address is `192.168.254.148` after the 2026-06-29 21:23 PHT Cloudflare repair pass.
  - Status: CONFIRMED_RUNTIME_EVIDENCE
  - Evidence: `scripts/start-bnpi-cloudflare-tunnel.ps1` wrapper evidence `.runtime/cloudflare-named-tunnel/20260629-212301/bnpi-cloudflare-tunnel.json` reported `GuestIp` `192.168.254.148`; LAN app/API/Grafana probes to `192.168.254.148` returned HTTP 200.
- Item: Earlier SSH proof at `10.184.38.91:22` is historical evidence only.
  - Status: STALE
  - Evidence: Earlier 2026-06-29 TCP, password, key, and VMConnect proofs used `10.184.38.91`, but the current Cloudflare/SSH repair pass proved `192.168.254.148` and probes to `10.184.38.91` later timed out.
- Item: Current Hyper-V proof VM exposes HRIS app/API/Grafana on LAN after warmup at `192.168.254.148`.
  - Status: CONFIRMED_RUNTIME_EVIDENCE
  - Evidence: 2026-06-29 Cloudflare repair pass showed HTTP 200 for `http://192.168.254.148:3000/auth/login`, `3001/health`, `3100/auth/login`, `3101/health`, `3200/auth/login`, `3201/health`, and `53000/api/health`.
- Item: Current Hyper-V proof VM exposes SSH on LAN at `192.168.254.148:22`.
  - Status: CONFIRMED_RUNTIME_EVIDENCE
  - Evidence: `Test-NetConnection 192.168.254.148 -Port 22` passed; Windows OpenSSH with `%USERPROFILE%\.ssh\node-health-appliance_ed25519` returned hostname `project-truth-node`, user `infra`, `eth0 192.168.254.148/24`, and active SSH service; pinned-host-key `plink` password login with `infra / infra` returned `SSH_PASSWORD_OK` using fingerprint `SHA256:+Xxejdej6SPlSKBEvEO/++Hh3j+QvoFSetx6DZXxiok`.
- Item: VM-visible Project Truth summary shows the current LAN SSH target and public Cloudflare endpoints.
  - Status: CONFIRMED_RUNTIME_EVIDENCE
  - Evidence: `project-truth-lan-summary --screen-overview` on the VM showed `LAN IP: 192.168.254.148`, `OpenSSH: ssh infra@192.168.254.148`, key path `~/.ssh/node-health-appliance_ed25519`, public app/API/Grafana URLs, and line-width max `66`; `/etc/issue` and `/run/project-truth/network-summary.txt` did not contain stale `10.184.38.91`.
- Item: `bnpi-hris.tech` public Cloudflare Tunnel access is repaired through named tunnel `e3486f00-f974-46d3-9e11-911266749d00` in the Cloudflare account that owns the `bnpi-hris.tech` zone.
  - Status: CONFIRMED_RUNTIME_EVIDENCE
  - Evidence: 2026-06-29 repair pass verified HTTP 200 for `bnpi-hris.tech`, `www.bnpi-hris.tech`, `app.bnpi-hris.tech`, `api.bnpi-hris.tech`, `dev.bnpi-hris.tech`, `dev-api.bnpi-hris.tech`, `uat.bnpi-hris.tech`, `uat-api.bnpi-hris.tech`, and `grafana.bnpi-hris.tech`; public CORS preflight returned HTTP 204 and wrong-password auth returned HTTP 401 through both `api.bnpi-hris.tech` and same-host `bnpi-hris.tech/api/*`. On 2026-06-30, headless browser proof reached `/admin/dashboard` for PROD, DEV, and UAT public app hosts, used the expected public API path for each environment, and received HTTP 200 from `/auth/me` and `/dashboard/overview`; DEV/UAT `/api/system-provisioning/status` CORS headers were repaired and verified for paired public app origins.
- Item: Current named Cloudflare Tunnel runtime path is VM-side, with Windows host ownership retained as bootstrap/management context until connector ownership is decided.
  - Status: CONFIRMED_RUNTIME_EVIDENCE
  - Evidence: `cloudflared tunnel info bnpi-hris` on 2026-06-29 showed active connector architecture `windows_amd64`; `scripts/start-bnpi-cloudflare-tunnel.ps1` discovers the live VM IP, rewrites `cloudflared-bnpi-hris.yml`, can provision DNS routes, and starts the named connector; `scripts/ensure-bnpi-cloudflare-host.ps1` checks host credential/readiness state; scheduled task `ProjectTruth-BNPI-HRIS-Cloudflared` owns host startup. On 2026-06-30, Windows had no active `cloudflared` process, the VM `cloudflared-bnpi-hris.service` was active using root-only credentials under `/etc/cloudflared`, and public PROD/DEV/UAT app/API browser traffic verified through the VM runtime path.
- Item: Fresh/final Project Truth images must not bake Cloudflare tunnel credentials.
  - Status: CONFIRMED
  - Evidence: Current named tunnel credentials live under the Windows operator profile, outside the repo. The active repeatable setup is to boot/import the fresh VM, let it obtain a LAN IP, then run `.\scripts\project-truth.ps1 ensure-bnpi-cloudflare-host -ProvisionDns -StartTunnel -VerifyPublic` from a configured Windows host.
- Item: Current proof VM can run the named Cloudflare Tunnel from inside the VM after deliberate credential import.
  - Status: CONFIRMED_RUNTIME_EVIDENCE
  - Evidence: On 2026-06-29 the existing named tunnel credential was copied into the proof VM as root-only runtime state at `/etc/cloudflared/e3486f00-f974-46d3-9e11-911266749d00.json`; `/etc/cloudflared/config.yml` routes app/API/dev/uat/Grafana to localhost services and `ssh.bnpi-hris.tech` to `ssh://localhost:22`; `cloudflared-bnpi-hris.service` was enabled and active; `cloudflared tunnel info bnpi-hris` showed a `linux_amd64` connector; public HTTP checks returned 200; and SSH through `ssh.bnpi-hris.tech` returned `SSH_DOMAIN_OK`, hostname `project-truth-node`, user `infra`, and active VM connector state.
- Item: VM-managed Cloudflare Tunnel is not allowed to be baked into fresh/final images.
  - Status: CONFIRMED
  - Evidence: VM-managed mode requires the named tunnel credential JSON, which remains secret material. Repo support is limited to `project-truth-cloudflare-vm-tunnel`, a runtime import/install helper that writes root-only VM state and localhost ingress after the credential is supplied deliberately.
- Item: Public SSH through `ssh.bnpi-hris.tech` is verified through Cloudflare Access and the named tunnel, including the VM-side `ssh://localhost:22` connector.
  - Status: CONFIRMED_RUNTIME_EVIDENCE
  - Evidence: 2026-06-29 provisioning evidence `.runtime/cloudflare-named-tunnel/20260629-223910/bnpi-cloudflare-tunnel.json` recorded `ssh.bnpi-hris.tech` DNS route success and `SshOrigin` `ssh://192.168.254.148:22`; `cloudflared-bnpi-hris.yml` contains `ssh.bnpi-hris.tech -> ssh://192.168.254.148:22`; VM-side `/etc/cloudflared/config.yml` contains `ssh.bnpi-hris.tech -> ssh://localhost:22`; `Resolve-DnsName ssh.bnpi-hris.tech -Type A` returned Cloudflare edge IPs; LAN SSH to `192.168.254.148:22` passed; after Cloudflare Access app policy allowed `1bis.solutions.tech@gmail.com`, Windows OpenSSH with `-o ProxyCommand="cloudflared access ssh --hostname %h"` returned `SSH_ACCESS_OK` and later `SSH_DOMAIN_OK`, hostname `project-truth-node`, user `infra`, and active VM connector state; Windows SSH alias `project-truth-hris` also returned `SSH_ALIAS_OK`.
- Item: Current host-local UAT ports are not healthy while VM LAN UAT is healthy.
  - Status: NEEDS_CONFIRMATION
  - Evidence: `.\scripts\project-truth.ps1 verify -GuestIp 10.184.38.91` on 2026-06-29 showed host-local PROD/DEV PASS, host-local UAT ports `3200` and `3201` FAIL, and LAN UAT PASS through `10.184.38.91`.
- Item: Previous LAN HRIS proof target `10.184.38.91` is historical evidence, not current reachable state from this host.
  - Status: STALE
  - Evidence: Earlier 2026-06-29 proofs showed LAN app/API PASS at `10.184.38.91`; during the 2026-06-29 21:23 PHT Cloudflare repair pass, probes to `10.184.38.91` timed out while `192.168.254.148` passed.
- Item: Terraform SSH port config currently differs from the live VM.
  - Status: RESOLVED
  - Evidence: `terraform-hyperv/terraform.tfvars`, `terraform-hyperv/terraform.tfvars.example`, `terraform-hyperv/variables.tf`, `scripts/configure.ps1`, and `scripts/build-image.ps1` now document LAN SSH port `22`, matching the live bridged VM.

Do not introduce without approval:

- Auth/security changes beyond appliance/bin/project-truth-console-session-hook.sh, hris-api/.wwg/governance/security-review.md, hris-api/app/auth/auth.controller.ts, hris-api/app/auth/auth.router.ts, hris-api/app/auth/index.ts, hris-api/config/security.ts, hris-api/docs/MD Files/auth-api.md, hris-api/docs/SECURITY.md
  - Status: NEEDS_CONFIRMATION
  - Evidence: Existing project adoption audit
- Payment/billing changes beyond hris-app/.react-router/types/app/routes/hr/+types/billings.$id.ts, hris-app/.react-router/types/app/routes/hr/+types/billings.ts, hris-app/app/components/templates/common/billings-template.tsx, hris-app/app/lib/mock-soa-billings.ts, hris-app/app/routes/hr/billings.$id.tsx, hris-app/app/routes/hr/billings.tsx, hris-app/build/client/assets/billings-aJ54d_bS.js, hris-app/build/client/assets/billings._id-sRB6gk7r.js
  - Status: NEEDS_CONFIRMATION
  - Evidence: Existing project adoption audit
- Deployment changes beyond .github/workflows/promote-gitops.yml, .github/workflows/validate.yml, app/Dockerfile, appliance/docker-compose.yml, appliance/zkteco-bridge/Dockerfile, hris-api/Dockerfile, hris-api/docker-compose.yml, hris-api/infrastructure/onprem/observability/docker-compose.yml, hris-app/Dockerfile, hris-app/firebase.json
  - Status: NEEDS_CONFIRMATION
  - Evidence: Existing project adoption audit

## Safety and Production Boundaries

Current boundaries:

- Boundary: mock/demo files detected
  - Status: INFERRED
  - Evidence: README/source/package (safety boundary indicators)

Mock/demo-only areas:

- Area: No mock/demo-only area confirmed
  - Status: NEEDS_CONFIRMATION
  - Evidence: Lightweight audit did not confirm explicit mock/demo areas.

Do not claim production readiness for:

- Capability: appliance/bin/project-truth-console-session-hook.sh, hris-api/.wwg/governance/security-review.md, hris-api/app/auth/auth.controller.ts, hris-api/app/auth/auth.router.ts, hris-api/app/auth/index.ts, hris-api/config/security.ts, hris-api/docs/MD Files/auth-api.md, hris-api/docs/SECURITY.md
  - Status: CONFIRMED
  - Evidence: appliance/bin/project-truth-console-session-hook.sh (auth/security indicator)
- Capability: hris-app/.react-router/types/app/routes/hr/+types/billings.$id.ts, hris-app/.react-router/types/app/routes/hr/+types/billings.ts, hris-app/app/components/templates/common/billings-template.tsx, hris-app/app/lib/mock-soa-billings.ts, hris-app/app/routes/hr/billings.$id.tsx, hris-app/app/routes/hr/billings.tsx, hris-app/build/client/assets/billings-aJ54d_bS.js, hris-app/build/client/assets/billings._id-sRB6gk7r.js
  - Status: CONFIRMED
  - Evidence: hris-app/.react-router/types/app/routes/hr/+types/billings.$id.ts (payments/billing indicator)

## Current Product Direction

Current direction:

- Direction: Current Working Branch, Main Documents, Normal CLI Flow, VHDX Autopilot, Target Architecture, Target Repo Shape, Image Format Targets, Ownership Rules, app/server
  - Status: INFERRED
  - Evidence: README.md (README headings or route files)

Avoid drifting into:

- Drift risk: package metadata vs actual stack
  - Status: NEEDS_CONFIRMATION
  - Evidence: JS/TS source detected without package dependencies.

## Open Questions

- Question: Confirm product category.
  - Why it matters: Category affects profile selection, architecture defaults, and governance gates.
  - Evidence / uncertainty: INFERRED: Web application
- Question: Confirm remaining non-admin role boundaries.
  - Why it matters: Roles affect permissions, UX, terminology, and task routing.
  - Evidence / uncertainty: Admin device/configuration ownership is confirmed; remaining HR/employee sub-role boundaries remain code-observed unless separately reviewed.

## Update Rules

Update this file when:
- product category changes
- user roles change
- canonical terminology changes
- architecture boundaries change
- safety boundaries change
- production-readiness boundaries change
- major product decisions become accepted truth
- high-risk behavior, production claims, approval requirements, or verification expectations change

For adopted projects, do not treat inferred truth as final confirmed truth until reviewed.
