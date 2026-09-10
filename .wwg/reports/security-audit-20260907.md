# Deep Security Audit — Infrastructure (2026-09-07)

Status: `AUDIT_COMPLETE_READ_ONLY` — no files, config, or runtime state were modified.
Method: 5 parallel read-only audit workstreams (secrets-in-repo, API auth/AuthZ, GitOps/K8s/Compose/Ansible, CI/scripts/tunnel, device/biometric plane) + direct verification of top claims by the orchestrator.
Repo: `bandai-infra` (origin: `github.com/hrisworkforcesystem-coder/bandai-infra`, pushes to `develop`).

---

## Executive Summary

The audit found **7 CRITICAL**, **~10 HIGH**, and ~20 MEDIUM/LOW findings. The single most urgent cluster is **real production secrets committed to git for 2+ years** (Cloud SQL passwords, Cloudinary secret, Better Stack token, MongoDB/Neon passwords, integration API key, and a real Hikvision device password in a script). The second urgent cluster is the **fully unauthenticated Hikvision callback endpoint** reachable through the public Cloudflare tunnel, which permits attendance-punch injection (payroll fraud vector).

| Severity | Count |
|---|---|
| CRITICAL | 7 |
| HIGH | 10 |
| MEDIUM | ~15 |
| LOW | ~10 |
| Confirmed-secure (positive) | 8 |
| Accepted-by-design (operator decisions) | 3 |

---

## CRITICAL findings (verified)

### C1. Production secrets committed to git since 2023
- **Evidence:** `hris-api/.env.cloud.{dev,uat,prod}`, `hris-api/.env.{dev,uat,prod}`, `hris-api/.env`, `appliance/.env` are **tracked in git** (`git ls-files` verified). Files added ~2023 (`272dc5de` monorepo import, `4ce3712d`) and present in history today.
- Real values present (redacted here):
  - Cloud SQL passwords: dev `CJwV…(40c)`, UAT/prod `FLso…(40c)` — **UAT and PROD share the same password**.
  - Cloudinary API secret `3VlK…(27c)` + API key `9314…` — **identical across dev/uat/prod**.
  - Better Stack ingestion token `2FCW…(24c)` — identical across all envs.
  - Neon.tech dev DB password `npg_…(14c)`; MongoDB Atlas UAT password `28eH…(16c)`.
  - `INTEGRATION_API_KEYS` real key `hris_…` (50+ chars) in `hris-api/.env` (flagged pre-existing 2026-09-04).
- Root `.gitignore` has **no `.env` rules**; `hris-api/.gitignore` ignores only `.env.*.local` variants, allowing the main envs to be tracked.
- **Impact:** anyone with repo read access (or access to any clone/backup/fork) holds prod DB and third-party credentials. One compromised shared secret compromises all environments.
- **Remediation:** rotate ALL listed secrets immediately; purge `.env*` from git history (`git filter-repo`/BFG); add `.env*` to root `.gitignore` (keep `!.env.example`); move secrets to GitHub Actions secrets / GCP Secret Manager / K8s sealed-secrets (the repo already has `hris-api/gcp/sync-github-deploy-secrets.ps1` plumbing).

### C2. Unauthenticated device callback endpoint (punch injection)
- **Evidence:** `hris-api/index.ts:666` excludes all `/hikvision` paths from `verifyToken`; `hris-api/app/hikvision/routes/callback.router.ts:12` states "intentionally PUBLIC (no authentication required)"; `callback.controller.ts` has no HMAC, shared secret, or IP allowlist. The ZKTeco bridge also posts unauthenticated (`vendor/zkteco-linux/.../__main__.py` `post_json`).
- **Impact:** any LAN actor, or anyone on the internet via the public tunnel (`api.bnpi-hris.tech`), can POST fake `major=5` punches for a known `employeeNo`/`deviceIP` → attendance and payroll fraud. Device `deviceIP` in the payload is trusted for device resolution.
- **Remediation (P0):** shared-secret header on all device callbacks (validated against `Device.config`), Cloudflare/WAF source restriction, and/or restrict callback ingress to the VM listener path only.

### C3. Real Hikvision device password hardcoded in a tracked script
- **Evidence:** `scripts/verify-hikvision-isapi-postman.ps1:4` — `[string]$Password = "@1bislangmalakas"`. Verified by direct read.
- **Impact:** physical biometric terminal credential in git history; device compromise (enrollment tampering, punch manipulation).
- **Remediation:** rotate device password(s); strip from script; parameterize like `run-remote-hikvision-sdk-matrix.ps1` already does correctly (`HIKVISION_PASSWORD` env, throws when empty).

### C4. Plaintext superuser DB credentials in GitOps manifests
- **Evidence:** `gitops/runtime-k8s/overlays/{dev,uat,prod}/runtime.yaml` — `POSTGRES_PASSWORD: postgres` inside `stringData` secrets (line 8, verified); `appliance/docker-compose*.yml` and `appliance/env/hris-api.env` use `postgresql://postgres:postgres@…` URLs.
- **Impact:** DB superuser access for anyone with repo read.
- **Remediation:** sealed-secrets / external secret operator; unique per-env strong passwords.

### C5. Shared placeholder JWT signing secret across DEV/UAT/PROD K8s
- **Evidence:** `JWT_SECRET: project-truth-local-appliance-jwt-secret-change-me` in all three overlays (agent-read; variable names verified at lines ~218-234).
- **Impact:** anyone with repo read can forge valid JWTs for any role on any environment (24h expiry, no revocation).
- **Remediation:** per-env cryptographically random secrets at deploy time; fail startup when unset (currently only fails at first request — `middleware/verifyToken.ts:213-221`).

### C6. SSH private key mounted into K3s pods via hostPath
- **Evidence:** `gitops/runtime-k8s/overlays/*/runtime.yaml` mount `/var/lib/project-truth/ssh` (hostPath `DirectoryOrCreate`) into `hris-api` containers for VM SSH control.
- **Impact:** container compromise → SSH key for `infra@10.184.37.19` (the management path to the whole VM).
- **Remediation:** dedicated low-privilege key scoped to the listener control role, delivered as K8s Secret; or a VM-side SDK control sidecar (already a documented target architecture) to remove the SSH dependency entirely.

### C7. Installer ships sensitive trees (corrected scope after verification)
- **Evidence:** `installer/build-installer.ps1:28` copies `README.md, app, docs, gitops, terraform-hyperv, scripts, installer, image-factory` recursively; `installer/project-truth.iss:20-25` packages the same. **Correction:** `hris-api/` is NOT packaged (so `.env.cloud.*` are NOT in the installer), but the package does include `scripts/` (→ C3 Hikvision password), `gitops/` (→ C4/C5 manifest secrets), and docs.
- **Remediation:** add `-Exclude *.env*`-style filters AND strip known secret-bearing literals from `scripts/`; treat `gitops/` secrets as blocked until C4/C5 are fixed. (Note: V6/V7 one-click zips download-only — that path is clean.)

---

## HIGH findings (selected, evidence-backed)

| # | Finding | Evidence |
|---|---|---|
| H1 | Rate limiting **disabled by default** (`ENABLE_RATE_LIMIT` not `true`), no lockout on `/api/auth/login` | `hris-api/config/config.ts:88`; `index.ts:552-639` |
| H2 | TLS verification disabled for Hikvision ISAPI: `rejectUnauthorized:false` + global `NODE_TLS_REJECT_UNAUTHORIZED=0` bypass | `hris-api/lib/hikvision-client.ts:520-526, 696-701` |
| H3 | Device credentials (`Device.access.password`) stored **plaintext in DB** | `hris-api/prisma/schema/device.prisma:82-98` |
| H4 | Admin-ish routes (employee create/delete/import, device ops, payroll) mostly guarded by `verifyToken` only; `verifyRole` middleware exists but nearly unused | `employee.router.ts`, `middleware/verifyRole.ts`; role sets defined in `device.controller.ts:257-262` |
| H5 | Padding-based employee matching creates punch-fraud collision risk (`10` ↔ `00010`) | `hris-api/helper/device-person-token.helper.ts:773-803` |
| H6 | `password123` hardcoded as default credential in 15+ scripts; `plink -pw` patterns in `configure-vm-git-creds.ps1:100`, `vm-pull.ps1:79,99`; VM password `infra` in visual-proof scripts | multiple `scripts/*.ps1` |
| H7 | `.env.cloud.prod` DATABASE_URL points at the **UAT** Cloud SQL instance (`hris-api-uat-pg`) — config bug | `hris-api/.env.cloud.prod:6` (verified) |
| H8 | systemd listener runs as root with HRIS admin creds embedded; K8s callback-outbox exposed on NodePort 30108 unauthenticated; ansible `become: true` playbook-wide | `appliance/systemd/project-truth-hikvision-hot-reload-listener.service:8-21`; `gitops/.../dev/runtime.yaml:430-446`; `ansible/project-truth-pull.yml:6` |
| H9 | Default Grafana `admin/admin123` (compose DEV/UAT + observability `.env`) | `appliance/docker-compose.environments.yml:477-510` |
| H10 | Default/weak passwords committed: `postgres`, `password123`, `Password123!`, `admin123`, `template` (REDaaS/Redis) | tracked env files |

---

## MEDIUM/LOW (summary)

- CORS: LAN-wide regex origin allowlist default-ON with `credentials:true` reflection (`config.ts:58-67`, `index.ts:442-461`) — set `ALLOW_LAN_CORS=false` in prod.
- JWT: no explicit `algorithms:["HS256"]` pinning; 24h tokens, no refresh/revocation; bcrypt cost 10 (argon2 dep unused).
- K8s: `hostPort` everywhere; `imagePullPolicy: Never` (intentional air-gap but no image scanning); high PriorityClasses risk starving system pods; C++ HCNetSDK build not supply-chain-verified.
- GitHub Actions: actions pinned by mutable tags (pin to SHAs); `validate.yml` missing explicit `permissions:`; `promote-gitops.yml` manual-only (OK).
- Terraform: local unencrypted state; installer lacks VHDX SHA-256 verification step (V6/V7 one-click path DOES verify — the fallback installer doesn't).
- `cloudflared-bnpi-hris.yml` committed with operator-username path (`C:\Users\anoni\…`) — info leak, low.

## Confirmed-secure (positive findings)

1. `middleware/integrationApiKey.ts` — fail-closed 503, timing-safe compare, scoped to `/employee/search` only ✅
2. Raw SQL in device controller uses parameterized `Prisma.sql` templates (no string interpolation found in sampled sites) ✅
3. Error responses normalized; no stack traces/Prisma internals to clients ✅
4. `searchEmployees` explicit select; no salary/payroll fields ✅
5. Merge jobs require SHA-256 scope-hash lock (`expectedScopeHash`) + admin role assertion ✅
6. GitHub workflows: no `pull_request_target`, no untrusted-input script injection, no secrets hardcoded in YAML ✅
7. Cloudflare tunnel credentials honored runtime-only (`~/.cloudflared`, `C:\ProgramData\ProjectTruth\secrets`, `/etc/cloudflared` root:0600); V6/V7 packaging verified clean ✅
8. No PEM/SSH keys/kubeconfig/tokened `.npmrc` tracked in git ✅

## Accepted-by-design (operator decisions, not defects — but recorded as risk)

- **Raw biometric custody at rest** (fingerprint/face blobs plaintext in `DeviceUser.vendorMetadata/rawPayload`) — deliberate 2026-07-20 decision; encryption helpers exist unused (`biometric-envelope.helper.ts`). Risk: irrevocable biometric data readable by any DB admin; revisit when compliance requires.
- **Device credentials plaintext in DB** — same decision family (A2 in device-plane audit).
- **`imagePullPolicy: Never` air-gapped appliance** — intentional; add image scanning later.

---

## Remediation roadmap

**P0 — this week (credential rotation + injection fix):**
1. Rotate: Cloud SQL (dev/uat/prod — split UAT/prod creds), Cloudinary, Better Stack, Neon, MongoDB Atlas, `INTEGRATION_API_KEYS`, Hikvision device password(s), Grafana admin, VM `infra` password, superadmin `password123`.
2. Purge `.env*` + secret-bearing scripts from git history; untrack and ignore them.
3. Add shared-secret auth (or Cloudflare-only source restriction) to `/api/hikvision/callback` and the ZKTeco ingress.
4. Fix `.env.cloud.prod` DB instance bug; replace K8s/compose `postgres/postgres` + placeholder JWT secrets via sealed-secrets.

**P1 — this month:** per-device Hikvision credentials + app-layer encryption of `Device.access` and biometric blobs at rest; role-guard admin routes (`verifyRole`); enable `ENABLE_RATE_LIMIT` + login lockout; JWT HS256 pinning + startup secret validation; SSH key out of hostPath; installer excludes secret-bearing files; device ISAPI TLS validation.

**P2 — this quarter:** argon2 migration + short tokens/refresh; CORS hardening in prod; CI action SHA pinning + `permissions:` on validate.yml; Terraform remote encrypted state; ZKTeco per-device credential store; device VLAN HTTPS enforcement; listener non-root service user; supply-chain verification for HCNetSDK build.

---

## Evidence pointers

- Workstream outputs (full unredacted detail retained in session): audit dirs created by orchestrator under `.runtime/security-audit-20260907/` (see handoff entry).
- Direct verification performed by orchestrator: `git ls-files`, `index.ts:666`, `callback.router.ts:12`, `build-installer.ps1:28`, `project-truth.iss:20-25`, `.env.cloud.prod:6`, K8s overlays lines 8/218-234, `verify-hikvision-isapi-postman.ps1:4`.
- Pre-existing flags honored: `hris-api/.env` git-tracking (handoff 2026-09-04); Cloudflare runtime-only credential rule (Project Truth) — still honored.

## Audit boundary

- Read-only; no endpoints executed against devices or DBs; no rotations performed (rotation requires operator authorization + coordination with running PROD).
- Several secrets' *current validity* (Cloudinary/Better Stack/Cloud SQL) is `NEEDS_CONFIRMATION` — treat as compromised regardless.
