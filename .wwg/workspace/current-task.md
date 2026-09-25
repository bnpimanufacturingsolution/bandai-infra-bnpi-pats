# Current Task Workspace

> Full addendum history for this file is preserved in git:
> `git log --follow --oneline -- .wwg/workspace/current-task.md`
> (this file was compacted 2026-09-15 during the retirement pass; the product
> truth records live in `.wwg/wiki/project-truth.md` and dated reports).

## Latest Task Addendum - 2026-09-15 device lane + HRIS emp-app FULL retirement (operator: "it's not HRIS anymore, it's BNPI, so delete everything HRIS-related in the codebase")

- **Supersedes the earlier 2026-09-15 "IoT/Hikvision script sweep" addendum below-in-git** which concluded the device lane was live product truth and "NOT purged." The operator has since directed full retirement; the device lane and `bnpi-pats-emp-app` are now retired product truth (see `.wwg/wiki/project-truth.md` "Device lane + HRIS emp-app retired (2026-09-15)").
- **Pass 1 — infra** (commit `4e7325bd`, 102 files): GitOps dev/uat/prod overlays de-deviced and de-emp'd; `vendor/`, callback-outbox service, `services/`, postman, hik/zk dockerfiles, credential-recovery patch, 18 device scripts deleted; ansible build/rollout matrices, ci/observe/promote workflows, appliance bins/env cleaned. Proof: kustomize ×6, docker compose config, js-yaml ×12, greps.
- **Pass 2 — scripts/tests** (commit `f1a6b62f`): `restart-local-bnpi-pats-api-dev.ps1`, `start-local-bnpi-pats-runtime.ps1`, `project-truth.ps1` menu cleaned; `test-self-heal-contract.ps1` device/emp assertions inverted to Assert-NoText retirement guards across dev/uat/prod. Contract now **217 checks** (was 226: −9 retired positives, +retirement guards). LAN terminology + cloudflare + static-config PS tests green.
- **Pass 3 — docs + governance truth** (this commit): 68 device/HRIS docs deleted; runbooks/doctrine/product docs corrected or retirement-banded; `AGENTS.md`, `CLAUDE.md`, `.grok/rules/*` de-deviced (rules 02/03 deleted); principles `evidence-over-assumption.md` + `shrink-hide-embody.md` generalized; wiki banners in `project-truth.md`, `project-truth-summary.md`, `terminology.md`; drift-guard device guards generalized; `README.md` shape fixed; this file compacted.
- **Verification**: `scripts/test-self-heal-contract.ps1`, `scripts/tests/project-truth-lan-terminology.test.ps1`, `scripts/tests/bnpi-cloudflare-config.test.ps1`, `scripts/tests/project-truth-lan-static-config.test.ps1`, `scripts/verify-grok-wwg-bootstrap.ps1` (see handoff for results).
- **Deliberate residue (documented, not bugs)**: dated evidence kept read-only (`.wwg/reports/`, `audits/`, `client-handover/`, `*_2026*.md` docs); `scripts/disable-k8s-runtime.ps1` keeps emp-app delete entries for stale-object cleanup.
- **Pass 4 (completed 2026-09-25 per operator instruction)**: residual legacy device fields (`deviceId`, `deviceEmpId`) purged from `bnpi-pats-api` (`employee.prisma`, `employee.zod.ts`, `employee.service.ts`) and `bnpi-pats-app` (`employee.ts`); 54.7 MB `appliance/seeds/dev-current/dev-current.dump` deleted with directory preserved via `.gitkeep`; Prisma clients regenerated; tsc / typecheck clean (0 errors) on both API and app; self-heal contract 217 PASS.
- **Boundary**: nothing pushed; parent on local `main`.

## How to work here

1. Obey root `AGENTS.md` + `.grok/rules/*.md` (auto-loaded).
2. Open `.wwg/wiki/project-truth.md` (retirement section first), `terminology.md` (banner), `.wwg/reports/wwg-agent-handoff.md`, then task-relevant code/evidence.
3. Current product = BNPI PATS timekeeping/payroll. Device/emp-app vocabulary in older wiki rows is `RETIRED_HISTORY`.
