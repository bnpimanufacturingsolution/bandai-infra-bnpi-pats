# Remaining Gaps — What Is Needed To Complete The Key Modules

> Canonical companion to `HRIS_KEY_MODULES_FUNCTIONAL_SCOPE_CHECKLIST.md` (statuses + evidence live there).
> Written 2026-08-25 after spec-gap chain stages 0–2 and 4–10 landed on
> `feature/spec-gap-remediation` (local commits `bd909245`, `a811dba0`, `3dd6bab4`, `8e854abf`,
> `4f27b68e`, `a827dff3`; NO PUSH yet per chain rule 1).
>
> **Current scored completion: ~71%** — 16 PRESENT / 15 PARTIAL / 2 MISSING across 33 scored items.
> M6 Training & Performance is excluded from scoring (separate future module, operator decision 2026-08-25).

## How to read this document

Each gap lists: what exists today → what is missing → what it takes to close → who/what unblocks it.
Three kinds of blockers exist:

1. **OPERATOR GATE** — needs a product answer from the operator before code can be written.
2. **EXTERNAL** — needs credentials/enrollment only BNPI can obtain.
3. **BUILDABLE** — no blocker; an agent can implement it end-to-end.

---

## A. Fully missing items (2)

### A1. Item 8.2 — Annual BIR pack: alphalist + BIR Form 1604-CF — BUILDABLE

- Exists: BIR 2316 generator (`helper/bir-2316.generator.ts` + `report.router.ts` + BIRReportTab) as the pattern; payroll register data in `EmployeePayroll`.
- Missing: annual alphabetical list of employees with BIR documents; BIR Form 1604-CF generator (xlsx/pdf via existing `exceljs`/PDF helpers); UI button beside BIRReportTab.
- Effort: medium (generator + report route + button + fixture test). Same shape as 2316 work.

### A2. Item T.4 — Government API integrations (SSS / Pag-ibig / PhilHealth / BIR) — EXTERNAL

- Exists: local contribution rate tables only (`config/payroll.config.ts`).
- Missing: HTTP clients/auth to government endpoints.
- Blocker: BNPI must obtain API access/credentials for each agency. Until then, file-based reports (A1 + remittance forms below) are the compliant path. Do not invent endpoints or credentials.

---

## B. PARTIAL residuals (what each row still needs)

### Payroll & Compensation (M1 — 70%)

| Item | Remaining | Unblock |
|---|---|---|
| 1.1 Last pay computation | Engine is flag-only; needs real computation (final pay components, taxable vs non-taxable split, 1604-C tie-in) | BUILDABLE |
| 1.2 Assembly Standing allowance | No benefit type/register field/mass-upload code exists anywhere (Stage 0 search: zero hits) | **OPERATOR GATE 1**: create as new benefit type (suggested code `ASA`, taxable like LLA) or map to existing name |
| 1.2 Salary loan application | Employee-facing loan application flow not built (loan types page + `employeeLoan.router.ts` create API exist) | BUILDABLE |
| 1.4 Uniform deduction + loan reports | Register/report surfaces absent | BUILDABLE |

### Attendance & Timekeeping (M2 — 90%)

| Item | Remaining | Unblock |
|---|---|---|
| 2.4 Leave tardiness/UT columns | Columns joining tardiness metrics onto leave-balance rows | BUILDABLE (interpretation noted in stage 5) |
| 2.4 Manhour reference | Term appears only in an audit label; no definition anywhere | **OPERATOR GATE 2**: what should it show? (per-employee manhours per cutoff / dept totals / rate table). Until answered: stays PARTIAL |

### Leave & Disciplinary (M3 — 67%)

| Item | Remaining | Unblock |
|---|---|---|
| 3.1 Annual credit upload UI | Bulk endpoint `POST /api/request/leave-credits/bulk-upload` exists (dry-run default, contract-pinned); UI button + import-log surface + one small-sample execute proof missing | BUILDABLE |
| 3.3 Pregnant employees list | No employee field/list UI; default design agreed in chain (boolean `pregnant` + optional due date, HR/admin-only visibility) | BUILDABLE (stage 8) |
| 3.2 Disciplinary late-linkage polish | Read-only recent-tardiness display on the action form | BUILDABLE (small) |

### Employee Records (M4 — 90%)

| Item | Remaining | Unblock |
|---|---|---|
| 4.5 201 filing slice | TIN library is done/live; 201 file view absent | **OPERATOR GATE 3**: confirm default proposal (per-employee 201 document checklist over existing documents repo) or name own scope |

### Manpower & Statutory Reports (M5 — 75%)

| Item | Remaining | Unblock |
|---|---|---|
| 5.1 Remittance forms | SSS R-3 / Pag-ibig MF / PhilHealth RF-1 generators absent (contribution math exists) | **OPERATOR GATE 3b**: which form/format first? Default proposal if unanswered: PhilHealth RF-1 as xlsx |
| 5.3 Age brackets | Live tab lacks age dimension (brackets exist only in unmounted mock) | BUILDABLE |

### Recruitment & Onboarding (M7 — 67%)

| Item | Remaining | Unblock |
|---|---|---|
| 7.1 Tracker updates | Activity feed exists; update-notification polish residual | BUILDABLE (small) |
| 7.2 Screening | Stage + reject actions exist; scoring/screening summary residual | BUILDABLE (small) |

### Accounting & Compliance (M8 — 25%)

| Item | Remaining | Unblock |
|---|---|---|
| 8.1 Terminal pay computation | Flag-only; full engine incl. BIR 1604-C withholding | BUILDABLE (large; pairs with 1.1 last pay) |
| 8.2 | See A1 | BUILDABLE |

### Technical Requirements (TR — 58%)

| Item | Remaining | Unblock |
|---|---|---|
| T.2 2FA | RBAC done; 2FA is a settings stub (`useState(true)`), no totp library/routes | BUILDABLE (medium) |
| T.3 Encryption at rest | Audit logging done; at-rest encryption scope residual | NEEDS SCOPING with operator |
| T.6 Automated backups | Manual script only; cron placeholder never wired; offsite mirror disabled and images-only | BUILDABLE (wire cron + offsite DB dumps) |

---

## C. Operator gate answers currently pending (fast path)

Answering these three unlocks most of the remaining chain:

1. **Assembly Standing allowance**: create as new benefit type (suggested code `ASA`, taxable like Line Leader Allowance) — or tell us its real BNPI name/code.
2. **Manhour reference**: what should it show?
3. **Statutory formats**: which remittance form first (default proposal: PhilHealth RF-1 xlsx)? And confirm 201-filing default slice (per-employee document checklist).

## D. Evidence

- Chain prompt + rules: `docs/00-product/AGENT-PROMPT-spec-gaps-modules-1-to-5-chain.md`
- Stage evidence: `.runtime/spec-gap-m1-5/stage-*` and `.runtime/spec-gap-m1-5/resume-20260825-173211/RESUME-SUMMARY.json`
- Statuses/evidence per item: `HRIS_KEY_MODULES_FUNCTIONAL_SCOPE_CHECKLIST.md`
