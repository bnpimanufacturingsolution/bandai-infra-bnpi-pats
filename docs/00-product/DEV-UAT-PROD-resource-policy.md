# DEV / UAT / PROD resource policy

Last updated: 2026-07-29

> **2026-09-15 retirement note:** the HRIS employee-portal (`bnpi-pats-emp-app`) and
> device lanes (`bnpi-pats-hikvision-watcher`, `bnpi-pats-callback-outbox`) are
> retired. The measured tables below are kept as the 2026-07-29 historical snapshot
> (they include those workloads). Live K3s workloads are now postgres / api / app only.

**Policy:** **DEV < UAT < PROD** for CPU and RAM **limits** on the shared K3s node  
(`project-truth-node`). Business data should stay **DEV = UAT = PROD** after clone.

Watcher + callback-outbox were **DEV-only** (device lane — retired 2026-09-15).

---

## CURRENT (live measured 2026-07-29 before apply)

| Metric | DEV | UAT | PROD |
|---|---:|---:|---:|
| CPU limit total (cores) | 3.55 | 2.40 | 4.25 |
| CPU limit API | 1.5 | 1.0 | 2.0 |
| CPU limit App | 0.3 | 0.4 | 0.5 |
| CPU limit Emp-app | 0.2 | 0.2 | 0.25 |
| CPU limit Postgres | 0.8 | 0.8 | 1.5 |
| CPU limit Hikvision watcher | 0.5 | — | — |
| CPU limit callback-outbox | 0.25 | — | — |
| RAM limit total | 4.75 Gi | 3.12 Gi | 5.75 Gi |
| RAM limit API | 2 Gi | 1.5 Gi | 3 Gi |
| RAM limit App | 256 Mi | 384 Mi | 512 Mi |
| RAM limit Emp-app | 256 Mi | 256 Mi | 256 Mi |
| RAM limit Postgres | 1.5 Gi | 1 Gi | 2 Gi |
| RAM limit Hikvision watcher | 512 Mi | — | — |
| RAM limit callback-outbox | 256 Mi | — | — |

Problem: UAT is the weak middle (PROD > DEV > UAT), not a clean ladder.

---

## EXPECTED (apply target)

| Metric | DEV | UAT | PROD |
|---|---:|---:|---:|
| CPU limit total (cores) | 3.0 | 4.0 | 5.0 |
| CPU limit API | 1.25 | 1.5 | 2.0 |
| CPU limit App | 0.3 | 0.4 | 0.5 |
| CPU limit Emp-app | 0.2 | 0.25 | 0.3 |
| CPU limit Postgres | 0.8 | 1.0 | 1.5 |
| CPU limit Hikvision watcher | 0.5 | — | — |
| CPU limit callback-outbox | 0.25 | — | — |
| RAM limit total | 4.0 Gi | 5.0 Gi | 6.5 Gi |
| RAM limit API | 1.5 Gi | 2 Gi | 3 Gi |
| RAM limit App | 256 Mi | 384 Mi | 512 Mi |
| RAM limit Emp-app | 256 Mi | 256 Mi | 384 Mi |
| RAM limit Postgres | 1.25 Gi | 1.5 Gi | 2 Gi |
| RAM limit Hikvision watcher | 512 Mi | — | — |
| RAM limit callback-outbox | 256 Mi | — | — |

Order: **DEV < UAT < PROD**.

### Manifest mapping

| Workload | GitOps file | limit keys |
|---|---|---|
| postgres | `gitops/runtime-k8s/overlays/{env}/runtime.yaml` | StatefulSet `bnpi-pats-postgres` |
| api | same | Deployment `bnpi-pats-api` (+ `NODE_OPTIONS` heap) |
| app | same | Deployment `bnpi-pats-app` |

---

## Shared node budget note

Guest ~19 Gi / K3s ~13 Gi allocatable. Sum of **limits** will overcommit (normal).  
Scheduler uses **requests**. Keep request totals well under allocatable.

---

## LIVE APPLIED (2026-07-29)

- Commit: `3606339`
- Live prove: `.runtime/resource-ladder-20260729-145307/04-live-limits.md`
- G4: all workloads match EXPECTED (�5%)
- Cloudflare: active/enabled (not stopped)
