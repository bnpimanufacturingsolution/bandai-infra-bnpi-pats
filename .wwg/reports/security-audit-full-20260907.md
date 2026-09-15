# FULL Security Audit — Overall System (2026-09-07)

Status: `AUDIT_COMPLETE_READ_ONLY` — no code, config, or runtime state was modified.
Method: 11 parallel read-only audit workstreams (2 phases) + direct orchestrator verification + live VM runtime probes via `ssh project-truth-bnpi-pats` (read-only).
- Phase 1 report: `.wwg/reports/security-audit-20260907.md` (secrets, API auth, GitOps/K8s, CI/scripts, device plane)
- Phase 2 (this report): frontend, employee portal, database/PII/logging, money-path/workflows, dependencies/uploads/realtime, public surface/observability, VM runtime hardening
- Evidence: `.runtime/security-audit-full-20260907/` (`vm-probe.txt`, `vm-probe-2.txt`, `AUDIT-STAMP.txt`)

---

## Executive Summary

**Posture: HIGH RISK.** The architecture has genuinely good bones (parameterized SQL, fail-closed API-key auth, scope-locked device writes, no command injection found, correct tunnel surface), but the audit found **12 CRITICAL**, **~22 HIGH**, and **~35 MEDIUM** findings across 11 domains. Three clusters dominate risk:

1. **Secrets are effectively public.** Real prod DB passwords, third-party API secrets, device passwords, and a shared placeholder JWT signing key are committed to git (2+ years of history) and to installer packages.
2. **The money and attendance paths are wide open to any authenticated user — and two paths to anonymous ones.** Payroll generation, bulk adjustments, and mass imports have no role gates; imports write into PAID periods; the workflow engine auto-approves self-requests; the device callback and socket.io feeds are unauthenticated.
3. **The VM itself is soft from the inside:** SSH password auth enabled, likely weak `infra` password (hardcoded in repo scripts), passwordless sudo, no fail2ban, and a world-readable k3s admin kubeconfig.

Consolidated findings by severity (unique, after de-duplication across workstreams):

| Severity | Count |
|---|---|
| CRITICAL | 12 |
| HIGH | 22 |
| MEDIUM | ~35 |
| LOW | ~20 |
| Confirmed-secure (positive) | 14 |
| Accepted-by-design | 3 |
| NEEDS_CONFIRMATION | 8 |

---

## CRITICAL findings (C1–C12)

| ID | Finding | Evidence |
|---|---|---|
| **C1** | Real production secrets in git since 2023: Cloud SQL passwords (UAT=PROD shared), Cloudinary secret+key, Better Stack token, Neon/MongoDB passwords, `INTEGRATION_API_KEYS` | `bnpi-pats-api/.env*` tracked (`git ls-files`); added `272dc5de`/`4ce3712d` |
| **C2** | Unauthenticated device callback → attendance punch injection via public tunnel or LAN | `bnpi-pats-api/index.ts:666` excludes `/hikvision` from auth; `callback.router.ts:12` "intentionally PUBLIC"; no HMAC/IP check |
| **C3** | Real Hikvision device password committed | `scripts/verify-hikvision-isapi-postman.ps1:4` (`@1bis…`); **plus** `prisma/seeds/deviceSeeder.ts:33-35` (`admin/20262027@`) |
| **C4** | Postgres superuser `postgres/postgres` committed in K8s secrets + compose + env files; **app connects as superuser** → SQLi = full cluster (`COPY FROM PROGRAM`, `pg_read_file`) | `gitops/runtime-k8s/overlays/*/runtime.yaml:8`; `bnpi-pats-api/.env*` |
| **C5** | Shared placeholder JWT secret across DEV/UAT/PROD manifests → token forgery on all envs | `JWT_SECRET: project-truth-local-appliance-jwt-secret-change-me` in all 3 overlays |
| **C6** | SSH private key mounted into API pods via hostPath → container escape = VM control | `/var/lib/project-truth/ssh` hostPath mounts in all overlays |
| **C7** | Installer ships secret-bearing trees (`scripts/` → C3; `gitops/` → C4/C5). Corrected: `bnpi-pats-api/.env.cloud.*` NOT packaged | `installer/build-installer.ps1:28`; `installer/project-truth.iss:20-25` |
| **C8** | **Any authenticated user can move money:** payroll `generate`, `generate-timesheet`, `bulk-generate`, `bulk-adjust`, mass imports, `PATCH/DELETE /api/employeePayroll/:id` — all `verifyToken` only, zero role checks | `payrollperiod.router.ts:400,448-548`; `employeepayroll.router.ts:325-435` |
| **C9** | `xlsx@0.18.5` parses user-supplied workbooks — CVE-2023-30533 (prototype pollution/ReDoS) on every DM3/DM4/import endpoint | `bnpi-pats-api/package-lock.json` (`node_modules/xlsx` 0.18.5); `migration.controller.ts:1340-1368` |
| **C10** | **socket.io has no handshake auth**: any anonymous client joins `device-events:org:*`, `employee:*`, `attendance:org:*` rooms → live biometric tap feed + employee notifications; `io.emit("eligibility-updated")` global broadcast | `bnpi-pats-api/index.ts:179-274,308` |
| **C11** | **Workflow self-approval**: requester assigned to an APPROVAL step is auto-`APPROVED` (OT writes payable `overtimeHours`; same for corrections/payroll-correction) | `request-runtime.helper.ts:2324-2356,2451-2469`; `overtime-approval.helper.ts:216-220` |
| **C12** | **VM LAN-to-root chain**: sshd `passwordauthentication yes` (3 config.d files) + `infra` password likely `infra` (hardcoded in `scripts/hyperv-visual-proof-loop.ps1:68`, `login-visual-proof-loop.ps1:127` via `plink -pw`) + **passwordless sudo** (`SUDO_NOPASS_OK`) + no fail2ban | Live probe `vm-probe-2.txt` (sshd -T); W4 script findings; `vm-probe.txt` §2/§9 |

---

## HIGH findings (H1–H22)

| ID | Finding | Evidence |
|---|---|---|
| H1 | Rate limiting disabled by default; no login lockout | `config/config.ts:88` (`ENABLE_RATE_LIMIT` off) |
| H2 | TLS verification disabled for device ISAPI (`rejectUnauthorized:false` + global bypass) | `lib/hikvision-client.ts:520-526,696-701` |
| H3 | Device credentials plaintext in DB | `prisma/schema/device.prisma:82-98` |
| H4 | Admin routes mostly `verifyToken`-only; `verifyRole` middleware nearly unused (employee CRUD, migration, device ops) | `employee.router.ts`, `middleware/verifyRole.ts` |
| H5 | Padding match `10`↔`00010` enables punch-fraud via colliding device person IDs | `device-person-token.helper.ts:773-803` |
| H6 | `password123` default in 15+ scripts; `plink -pw` patterns | multiple `scripts/*.ps1` |
| H7 | `.env.cloud.prod` DATABASE_URL points at **UAT** Cloud SQL instance | `.env.cloud.prod:6` (verified) |
| H8 | Listener + cloudflared run as **root** on VM (confirmed live); BNPI PATS creds embedded in systemd unit | `vm-probe.txt` §10/§11; `appliance/systemd/...listener.service:8-21` |
| H9 | Grafana `admin/admin123` + Grafana-DB `postgres/postgres` committed (`.env`, `grafana.ini`, compose) | `observability/.../.env`, `grafana.ini` |
| H10 | All observability components (Prometheus/Loki/Tempo/Alertmanager/exporters) **zero auth**, UFW allows from Anywhere on LAN — confirmed live | `vm-probe.txt` §5/§6; `observability/docker-compose.yml` |
| H11 | **No BNPI PATS Postgres backups at all** — backup script hardcodes Grafana DB only; unencrypted dumps | `observability/backup/backup.sh:20-24` |
| H12 | **Mass imports write into PAID/COMPLETED periods** (no isPaid check in any import path) | `bnpi-mass-upload-import.service.ts:1132,1245-1277,1489,1624-1647` |
| H13 | JWT in localStorage (XSS-stealable), 24h tokens, no refresh/revocation | `bnpi-pats-app/app/lib/api-client.ts:15-19,150-157` |
| H14 | **No security headers on any public app surface** (no CSP, X-Frame-Options, nosniff) — bnpi-pats-app `server.cjs` and emp-app nginx template | `bnpi-pats-app/server.cjs:1-155`; `appliance/dockerfiles/bnpi-pats-emp-app.nginx.conf.template` |
| H15 | AuthGuard is client-side only; backend must be sole enforcement (ties to H4/C8) | `bnpi-pats-app/app/guards/auth-guard.tsx:22-27` |
| H16 | Floating git submodule (`branch=develop`) for bnpi-pats-emp-app — upstream push = code injection into builds | `.gitmodules` |
| H17 | Better Stack ships PII (names, emails, IPs, request payload field names) to third-party SaaS; redaction misses TIN/SSS/PhilHealth/salary | `logger.helper.ts:191-196`; `apiActivityLogging.ts:100-118,298-330` |
| H18 | Biometric templates + government IDs (TIN/SSS/PhilHealth/Pag-IBIG) plaintext at rest; encryption helpers exist but unwired | `device.prisma:195-196`; `employee.prisma:65`; `document.prisma:27-28` |
| H19 | Postgres StatefulSet runs without securityContext (root, no caps drop), hostPort binds; init container root | `gitops/.../prod/runtime.yaml:99-131` |
| H20 | `/api/docs/*` public (auth-excluded): enumerates every route incl. admin/migration/device via live router scan; Postman collection downloadable | `index.ts:661-675`; `app/docs/endpointGenerator.ts:13-49` |
| H21 | K8s priority classes (up to 1,000,000) risk starving system pods; images not digest-pinned; `imagePullPolicy: Never` | `gitops/runtime-k8s/base/priority-classes.yaml`; Dockerfiles |
| H22 | 15 destructive endpoints (payroll gen, imports, device reset/time-sync/merge, employeePayroll PATCH/DELETE, employee hard delete) have **no second factor** — the documented "admin passcode" requirement is 0% implemented | W9 disruptive-endpoint table; `docs/00-product/REQUIREMENT-ADMIN-PASSCODE-FOR-DISRUPTIVE-ACTIONS.md` |

## MEDIUM findings (condensed)

- Login prefill stores **password in localStorage** (`LoginForm.tsx:15,48-62`); open-redirect via unvalidated `state.originalPath` (`callback.tsx:56-60`); `credentials:"include"` without SameSite guarantees.
- XSS surface: `dangerouslySetInnerHTML` in guide content, `document.write` print flows ×7, 16 × `target="_blank"` without `noopener`, announcements `innerHTML`.
- `/auth/me` returns full PII (DOB, address, government IDs) to any role; payroll types over-broad.
- `/health/redis` publicly exposes Redis memory/key count; 75 MB global body limit; no compression.
- Seeds create known-password users + write credential JSON to disk; `TestSecretKEy12345` in `.env.example`; no env gate on seed (`SEED_ALLOWED_ENVS`).
- `$executeRawUnsafe` in 15+ repair scripts (superuser context); activity-log `entityType` spoofable from URL; audit logs soft-deletable, no tamper evidence; no retention/TTL for device events (63k+ and growing).
- ZKTeco bridge: no per-device credential store, single shared password arg, unauthenticated webhook posts.
- K8s `hostPort` everywhere; callback-outbox NodePort 30108 unauthenticated; ansible `become: true` playbook-wide; Terraform local unencrypted state; GitHub Actions pinned by mutable tags; `validate.yml` missing `permissions:`.
- bnpi-pats-app + bnpi-pats-emp-app containers run as **root** (no USER directive); nginx `server_tokens` on; no rate limiting on emp-app nginx; `/uploads` proxied without API-side auth verification.
- VM: `k3s.yaml` world-readable **644** (embedded cluster-admin credential; mitigated by only root/infra users existing); `X11Forwarding yes`; UFW allows 53/80/443/38080/8088/9110/9115/9093/9091/3110/53000 from Anywhere (v4+v6).
- Host `cloudflared-bnpi-pats.yml` commits operator-specific path (`C:\Users\anoni\…`); TryCloudflare dead code remains (disabled by ansible — confirmed).
- Alertmanager has no real receivers (alerting non-functional).

## LOW (condensed)

bcrypt cost 10 (argon2 unused) · placeholder JWTs in env examples · `node-fetch@2` EOL · pyzk 0.9 unmaintained · `normalize-image-acl.ps1` broad icacls grant · temp-file secret writes in GCP sync scripts · activity-log GET-skip means read access is unaudited · device-events dedupe/serial controls noted positive.

---

## Live VM runtime evidence (probes 2026-09-07, read-only)

| Check | Result | Verdict |
|---|---|---|
| Passwordless sudo for `infra` | `SUDO_NOPASS_OK` | ⚠️ High-consequence (feeds C12) |
| sshd effective | `passwordauthentication yes`, `permitrootlogin without-password`, `maxauthtries 6` | ⚠️ C12 |
| sshd_config.d | 3 files force `PasswordAuthentication yes` (cloud-init, packer, project-truth) | ⚠️ C12 |
| fail2ban | absent | ⚠️ C12 |
| unattended-upgrades | enabled + active | ✅ |
| UFW | active, default-deny incoming, but 20+ allow rules from Anywhere incl. unauth observability ports | ⚠️ H10 |
| DB ports 15432-15434 | **not listening** currently (K3s/compose DB down); 15435 (Grafana DB) on 0.0.0.0 but no UFW rule → firewall-blocked | ✅ today, conditional |
| Device spec files | `/run/project-truth/*.spec` all `600 root` | ✅ |
| Tunnel credential JSON | `/etc/cloudflared/…json` `600 root`; config backups 644 (no secrets) | ✅ |
| SSH key | `/var/lib/project-truth/ssh/…ed25519` `600` | ✅ |
| Docker socket | `660 root:docker`, no group members | ✅ |
| k3s.yaml | `644 root` (world-readable admin kubeconfig) | ⚠️ MEDIUM |
| cloudflared / hikvision listener | both run as `root` | ⚠️ H8 |
| Last logins | all via 127.0.0.1 (tunnel) — consistent | ℹ️ |

## Public attack surface (verified mapping, both tunnel configs)

16 documented hostnames only, catch-all `http_status:404` present in both configs, no `noTLSVerify`, no undocumented hosts. Public-unauthenticated-by-design: device callback (C2!), `/api/docs/*` (H20!), `/health*`, socket.io handshake (C10!), employee calendar/birthday routes (exact-match guard NEEDS_CONFIRMATION — submodule not checked out). Everything else JWT-gated at API; DB/SSH behind Cloudflare Access.

## Confirmed-secure (positive findings)

1. Integration API-key middleware fail-closed + timing-safe, scoped to `/employee/search` ✅
2. Parameterized `Prisma.sql` in device controller raw SQL ✅
3. **No command injection** in any `execFile`/`spawn` path (SSH args single-quote-escaped, hosts regex-validated, args from DB constants) ✅
4. Upload path traversal blocked (`resolveLocalUploadPath` prefix check) ✅
5. Error responses normalized; no stack traces ✅
6. `searchEmployees` minimal select (no salary fields) ✅
7. Merge jobs: admin role assertion + SHA-256 scope-hash lock ✅
8. Terminal pay: preview-only, no write path ✅
9. Anti-stack supersede fix present (`preferPeriodScopedPayrollBenefitSources`) ✅
10. Payslip access: owner-or-admin enforced (`ensureEmployeePayrollAccess`) ✅
11. GitHub workflows: no `pull_request_target`, no injection, no hardcoded secrets ✅
12. Cloudflare tunnel: credentials runtime-only, root:0600; V6/V7 packaging clean; surface matches docs; catch-all 404 ✅
13. `bnpi-pats-app/build` + `.react-router` NOT tracked in git (build-output leak claim from Phase-1 adoption list is stale — corrected) ✅
14. Kiosk biometric polling fail-closed default `false` in all envs ✅

## Accepted-by-design (operator decisions, recorded as risk)

Raw biometric custody plaintext (2026-07-20) · device credentials plaintext in DB · air-gapped `imagePullPolicy: Never`.

## NEEDS_CONFIRMATION

Cloudinary/BetterStack/CloudSQL current validity (treat as compromised regardless) · actual strength of VM `infra` password (scripts suggest `infra`) · bnpi-pats-emp-app code-level guards (submodule not checked out) · calendar/birthday exact-match guard · Cloudflare Access policy configs (external) · other employee-scoped API endpoints (schedule/attendance/leave/docs) ownership checks · hard-delete execute route existence (conflicts with project-truth 2026-07-09 entry) · `undici` transitive versions.

---

## Remediation roadmap

**P0 — this week (stop the bleeding):**
1. Rotate everything in C1/C3 (+ Grafana/admin123, `20262027@`, superadmin, VM `infra` password) and purge `.env*` + secret literals from git history.
2. Auth-gate `/api/hikvision/callback` (+ ZKTeco ingress) with shared secret; add socket.io handshake JWT auth + room scoping.
3. Restrict `/api/docs/*` to admin or disable in prod; disable SSH password auth on VM (keys only) and set `PermitRootLogin no`.
4. Role-gate payroll/migration/employeePayroll mutation endpoints; block self-approval in workflow engine; add isPaid guards to imports + EmployeePayroll PATCH/DELETE.
5. Upgrade `xlsx` ≥ 0.20.2 (or migrate parsing to exceljs).
6. Sealed-secrets for `postgres/postgres` + per-env JWT secrets; fix `.env.cloud.prod` DB target.

**P1 — this month:** admin-passcode second factor for the 15 disruptive endpoints · BNPI PATS Postgres encrypted backups + restore test · least-privilege DB role for app · security headers (CSP/XFO/nosniff) on both app servers · localStorage→httpOnly cookie migration · ISAPI TLS validation · SSH key out of hostPath · non-root service users + containers · log PII redaction · Better Stack DPA/minimization.

**P2 — this quarter:** encrypt biometric blobs + government IDs at rest · pin actions/digests · `permissions:` on validate.yml · fail2ban or CF-rate-limit on SSH · k3s.yaml 600 · UFW tightening (observability → LAN-CIDR-scoped or auth) · retention/TTL for device events · audit-log tamper evidence · ZKTeco per-device creds · emp-app submodule pinning + branch protection · install-gcp-build-guard audit · Terraform remote state.

**P3:** argon2 migration, refresh-token rotation, SRI/Trusted-Types, magic-byte upload validation, Alertmanager receivers, mock/dead-code purge (existing RECs), device VLAN HTTPS.

---

## Compliance note (Philippines context)

Biometric templates are special-category personal data (Data Privacy Act of 2012). Current plaintext custody (accepted-by-design) + third-party log shipping (H17) + no encryption at rest (H18) + no dedicated BNPI PATS backups (H11) should be reviewed together as one DPIA item, not four separate backlog entries.

## Audit boundary

Read-only. No endpoints executed against devices/DBs; VM probes were non-mutating SSH reads. Rotation, history rewrite, and config changes require operator authorization (PROD is live; Cloudflare tunnel must stay active per Project Truth rules).
