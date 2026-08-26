# Spec-Gap Chain Close-Out — Modules 1–5 (plus bonus M8.2)

> Chain prompt: `docs/00-product/AGENT-PROMPT-spec-gaps-modules-1-to-5-chain.md`
> Branch: `feature/spec-gap-remediation` · Closed 2026-08-26 · **NO PUSH happened from the agent; operator pushes `develop` when ready** (push triggers VM ansible-pull DEV deploy).
>
> Final scored completion: **~88%** (24 PRESENT / 8 PARTIAL / 0 MISSING of 32 items; M6 excluded as future module, T.4 excluded as external BNPI-owned per operator decisions).

## Stage-by-stage summary

| Stage | Scope item | Status | Commit(s) / Evidence |
|---|---|---|---|
| 0 | Discovery + gates | DONE — all gates since answered/closed | `.runtime/spec-gap-m1-5/stage-0-discovery/FINDINGS.md`; gate answers recorded in Project Truth |
| 1 | Wire NoWorkReportTab + DailyManpowerTab (2.5) | DONE | `bd909245` |
| 2 | OT summary Agency/Direct split (1.5) | DONE | `bd909245`; live smoke |
| 3a | Salary loan application flow (1.2) | DONE | `5b56d17e`; live loan `cmt8tz1d4001hvx7gzskt71z9` |
| 3b | Assembly Standing allowance (1.2) | DONE — operator chose ASA taxable | `57eb285a`; column applied on DEV, type seeded, write/read-back proof |
| 4 | Labor cost analysis report (1.4 part) | DONE | `a811dba0` |
| 5a | Leave tardiness/UT columns (2.4) | DONE | `5b56d17e`; live minutes on 2229 roster |
| 5b | Manhour reference (2.4) | DONE — operator definition | `0dcd22f2`; live Aug: 66 people / 1,144.4 man-hours |
| 6 | Leave conversion + annual credit uploads (3.1) | DONE | `3dd6bab4` conversion (live entitled shrink); upload UI + live sample proof in `8e16e946` |
| 7 | Disciplinary action backend + real UI (3.2) | DONE | `3dd6bab4`; live create/list; template spec replaced |
| 8 | Pregnant employees flag + list UI (3.3) | DONE | `5b56d17e`; live loop 0→1→0 zero residue |
| 9 | Org chart builder edit mode (4.2) | DONE | `3dd6bab4`; cycle-guard + PATCH proven live |
| 10 | TIN library (4.5) | DONE | `3dd6bab4` metric/page; live 2229 rows |
| 10b | 201 File checklist (4.5) | DONE — operator confirmed slice | `c29a9904`; logic unit-tested |
| 11a | PhilHealth RF-1 (5.1, operator first choice) | DONE | `c29a9904`; live Jul P1 xlsx |
| 11b | Age brackets on Manpower Distribution (5.3 polish) | DONE | `5b56d17e` |
| bonus | SSS R-3 + Pag-ibig MF (5.1/5.2 completion) | DONE | `8e16e946`; live Jul P1 both |
| bonus | Annual BIR pack alphalist + 1604-CF (M8.2!) | DONE | `5b56d17e`; live 2026 workbook verified |
| bonus | Terminal pay preview engine (M8.1/1.1 core) | DONE (preview-only) | `8e16e946`; live Zen smoke; tax basis NEEDS_CONFIRMATION |

## Excluded from scoring (operator decisions)

- **M6 Training & Performance** — separate future module.
- **T.4 Government API integrations** — external BNPI-owned dependency; agencies must issue credentials to the company. Recorded in Project Truth 2026-08-26. File-based reports are the compliant interim route.

## What remains open (all small or policy-gated)

1. 8.1 withholding-tax basis for terminal pay → operator question parked in roadmap §C.
2. 1.1 last-pay polish within payroll processing.
3. 1.4 uniform deduction + loan report surfaces.
4. 7.1 / 7.2 recruitment polish specifics.
5. T.2 login 2FA · T.3 encryption scope · T.6 backup cron wiring.

All parked questions: `REMAINING-GAPS-AND-WHAT-IS-NEEDED.md` §C "Pending operator questions".

## Truth surfaces updated

- Checklist rows flipped with evidence: 1.2, 1.5, 2.4, 2.5, 3.1, 3.2, 3.3, 4.2, 4.5, 5.1, 5.2, 5.3, 8.2 (+ rate table ~88%).
- Project Truth: gov-APIs-external entry; manhour definition; ASA approval (summary + full wiki).
- Terminology: Man-hour, ASA, 201 File, Annual BIR pack, Terminal pay rows added.
- Workspace addenda + handoff entries per session pass.

## Validation

- API focused suites: **48+ passing** across `spec-gap-m1-5-stages`, `philhealth-rf1`, `bir-annual-pack`, `statutory-remittance`, `terminal-pay`, `disciplinaryAction` specs.
- App vitest: **14 passing** across age-brackets, salary-loan-terms, filing-201, leave-credits-upload, disciplinary contract tests.
- Live smokes captured under `.runtime/spec-gap-m1-5/**` (xlsx downloads verified by ZIP magic + sheet/shared-string inspection).

## Deploy notes

- Push of `develop` rebuilds `hris-api`/`hris-app` images and rolls dev/uat/prod Deployments via ansible-pull (per GitOps truth).
- DB prerequisites already applied on shared DEV: `RequestType` enum `LEAVE_CONVERSION`; `employees.pregnant` + `expectedDueDate`; `employee_payrolls.assemblyStanding`. Migration SQLs committed under `hris-api/prisma/schema-postgres/migrations/`.
- UAT/PROD DB columns are NOT auto-applied — apply the three additive migration SQLs before/at first deploy there if register/pregnant features are exercised.
