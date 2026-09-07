# WWG Agent Handoff
## 2026-09-03 - Payroll domain audit (read-only)

- Report: `.wwg/reports/payroll-audit-20260903.md`. Domain intact post-restore: register rules (Basic Path A/B, 313 basis, FILE_DUAL) verified live in `generatePayrollFromTimesheets`/`previewPayrollFromTimesheets` (`payroll-period.helper.ts:2002/2029/:5091/:5116`); Run Payroll OT readiness wired (`payrollperiod.controller.ts:1079`); **184/184 tests passing** (22 runnable payroll specs, TESTEXIT=0).
- 5 findings (F1 org-policy auto-approve mislabeled as "Manager approved" in OT readiness — latent, flag OFF; F2 vitest dead spec for PayrollGenerationJobService; F3 test-only calculator with contradicting rate basis; F4 OT-import auto-approve chain is ops-script-only; F5 hris-api CI scope = source-truth only) → RECs registered: REC-20260903-OT-READINESS-POLICY-AUTOAPPROVE-LABEL, REC-20260903-PAYROLL-GENJOB-VITEST-DEAD-SPEC, REC-20260903-PAYROLL-CALC-HELPER-TEST-ONLY.
- No code/config/data changes; audit-only. Next: owner triage of the 3 Proposed RECs.


## 2026-09-03 - develop gutting incident: RESOLVED

- PR #9 conflict root cause = mass deletion on develop (3,793 files, commits fb326549/653d3c32 by malasaernestdodz). Restored via 5e4c3046 (fast-forward, no force push). Backup: backup/develop-gutted-20260903.
- Feature branch merged restored develop (1d04dd40, zero conflicts); tests green (15 passing). PR head on origin = 1d04dd40.
- Full evidence + rollback path: .wwg/reports/develop-gutted-restore-20260903.md
- PR #9 MERGED into develop (2026-09-03T01:07:35Z, merge commit c2a7d873; verified zero deletions vs 85327bd2; auto-approve tests 15 passing).
- Open next: PR #7 (develop->uat) shows CONFLICTING/DIRTY (develop-vs-uat divergence, separate matter); watch restored-develop CI (pre-existing runner-level 5s-fast failures, unrelated); owner confirmation with malasaernestdodz; project-truth.md conflict-marker housekeeping (pending user decision); backup/develop-gutted-20260903 deletable after team review.

---

## 2026-09-04 - Integration Employee Search API Audit

- **Task**: Audit `GET /api/employee/search` (fuzzy + pagination + X-API-Key auth).
- **Result**: ✅ `CONFIRMED_CODE_AND_LIVE_LOCAL` — shipped, tested, documented. No code changes required.
- **Tests**: 22/22 passing (13 search + 8 auth middleware).
- **Live Proof**: `query=z` chain 486→455→454; `zan andrei` count 1 fuzzy 1; deep pagination honest; `andersen` 0 (distance >2).
- **Evidence**:
  - Audit summary: `.runtime/integration-employee-search-audit-20260904/AUDIT-SUMMARY.md`
  - Live proof: `.runtime/employee-search-proof-20260904-153358/`
  - Consumer doc: `docs/INTEGRATION_EMPLOYEE_SEARCH_API.md`
- **Open Items**:
  1. `hris-api/.env` tracked in git (pre-existing drift) — real keys must use VM/K8s secret plumbing.
  2. Activity logging DB errors in tests (pre-existing test infra gap).
  3. Fleet >5000 pool cap → future trigram index.
  4. Key rotation: append → switch → remove (comma-separated = zero downtime).
- **Next**: Provision `INTEGRATION_API_KEYS` in VM DEV/UAT/PROD runtime envs; push `develop`; verify per-environment.

---

## 2026-09-07 - INTEGRATION_API_KEYS provisioned dev/uat/prod (employee-search exposure complete)

- **Status**: `CONFIRMED_RUNTIME_ALL_ENVS`.
- Pushed `4592e75a` (WWG truth-sync + baked conflict-marker repair in project-truth wiki files), `09a12b5a`/`e9bdd119` (GitOps provisioning).
- GitOps: `hris-api-integration-env` Secret (per-env distinct key) + secretKeyRef env on hris-api in all three overlays, following the existing hris-postgres-env in-git appliance-secret precedent (Argo prune:true requires git-tracked secrets).
- VM flow: ansible-pull picked SHA -> Argo auto-applied Secret + Deployment env -> all three hris-api rolled out 1/1 Running.
- Final live proof (.runtime/employee-search-env-probe-20260907-121922/final-key-proof.json):
  - Valid X-API-Key: PROD 200 (483 employees), DEV 200 (486), UAT 200 (483).
  - Invalid key: 401 on all three (was 503 fail-closed before provisioning).
  - JWT path: 200 on all three (unaffected).
- Key custody: keys live in git overlays (private repo) + generated-keys.json (local .runtime evidence only, not committed). Rotation: append new key to comma list -> consumers switch -> remove old (doc: docs/INTEGRATION_EMPLOYEE_SEARCH_API.md).
- Remaining handoff item closed: "Provision INTEGRATION_API_KEYS in VM DEV/UAT/PROD runtime envs; verify per-environment" - DONE 2026-09-07.

## 2026-09-07 - FULL security audit (overall system, read-only)

- Report: `.wwg/reports/security-audit-full-20260907.md` (supersedes/extends `.wwg/reports/security-audit-20260907.md` Phase 1).
- Method: 11 read-only workstreams (secrets, API auth, GitOps/K8s, CI/scripts, device plane, frontend, emp-app, DB/PII/logs, money-path, deps/uploads/socket, public surface) + live VM probes via `ssh project-truth-hris`.
- Headline: 12 CRITICAL / 22 HIGH / ~35 MEDIUM. Top: secrets-in-git (rotate+purge), unauthenticated /hikvision/callback, socket.io no handshake auth, any-user payroll generation (no RBAC), workflow self-approval, xlsx 0.18.5 CVE-2023-30533, imports write into PAID periods, VM SSH password-auth + passwordless sudo chain, no HRIS DB backups, no security headers.
- Live VM evidence: `.runtime/security-audit-full-20260907/vm-probe.txt`, `vm-probe-2.txt` (sshd passwordauthentication=yes, SUDO_NOPASS_OK, fail2ban absent, k3s.yaml 644, device specs 600 OK, tunnel cred 600 OK).
- No changes made. P0 remediation requires operator authorization (secrets rotation + git history rewrite touch PROD runtime).

---

## 2026-09-07 - Section Line Leader assignment implemented (option B)

- `SectionLineLeader` join (`section_line_leaders`, M:N) + role derivation: membership derives `hris-line-leader` (isManager=true), precedence HR > manager level > line leader; add/remove/section-delete re-derive roles (delete-path stale-role gap found by live proof and fixed).
- Admin UI: Line Leaders chips + add-select beside Section Head on /admin/configuration/sections; table column, view row, CSV.
- Tests: section-line-leaders 15/15, role-derivation 55/55, smoke 2/2; live API round-trip incl. upgrade/demote/delete-demote; browser proof on real app. Evidence: hris-api/.runtime/20260907-section-ll-proof/, .runtime/browser-evidence/sections-line-leaders-live/, report .wwg/reports/section-line-leader-assignment-20260907.md.
- Employee hard delete now detaches Section.headId (pre-existing gap) and deletes join rows.
- DEV db-init blocker removed: stale requests_type_backup_20260826 (47 rows) exported to .runtime/dev-dbinit-drift-repair-20260907/ then dropped; local prisma db push now clean. runtime-dev was Synced/Degraded (failed db-init) BEFORE this work; expect green after push + job release.
- Boundary: local DEV proven; VM/GitOps follows push. Day-labor own-section tagging scoping remains candidate REC.

## 2026-09-07 - Infrastructure-layer security audit (VM + host, read-only)

- Report: `.wwg/reports/security-audit-infra-20260907.md`. Evidence: `.runtime/security-audit-infra-20260907/vm-probe-3-deep-infra.txt` + `host-probe.txt`.
- Headline (infra layer): 4 CRITICAL - IC1 VM LAN-to-root chain confirmed at sudoers level (`infra NOPASSWD:ALL` + password sshd + hardcoded pw + no fail2ban), IC2 Windows host firewall DISABLED on all profiles with RDP enabled, IC3 no encryption at rest (no LUKS, K3s without --secrets-encryption), IC4 unauthenticated observability stack exposed LAN-wide (Prometheus/Loki run as root, UFW Anywhere).
- Highs: auditd inactive, reboot required + 54 pkgs pending, Docker no daemon.json/root containers, dnsmasq on LAN IP, packer bakes weak sshd, k3s.yaml 644, unmapped caddy.service (NEEDS_CONFIRMATION), X11Forwarding, GatewayPorts clientspecified.
- Positives: UFW default-deny + AppArmor enforcing + hardened sysctls + unattended-upgrades + K3s creds locked + no anonymous CRBs + no privileged containers.
- No changes made. P0 infra fixes (SSH keys-only, host firewall, sudoers scoping, obs binding) are additive and tunnel-safe; awaiting operator authorization.
