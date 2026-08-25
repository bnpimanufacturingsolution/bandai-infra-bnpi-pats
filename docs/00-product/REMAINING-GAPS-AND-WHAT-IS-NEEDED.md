# Remaining Gaps — What Is Needed To Complete The Key Modules

> Canonical companion to `HRIS_KEY_MODULES_FUNCTIONAL_SCOPE_CHECKLIST.md` (statuses + evidence live there).
> **2026-08-26 chain-completion update:** salary loan application flow, leave tardiness/UT columns,
> pregnant employees list (flag + tab), age brackets, Annual BIR pack, PhilHealth RF-1, SSS R-3,
> Pag-ibig MF, the 201 File tab, the annual leave credits upload UI (with live sample proof) and
> the terminal-pay preview engine are now built and live-proven. Scored completion is **~84%**
> (22 PRESENT / 10 PARTIAL / 0 MISSING of 32; M6 and T.4 excluded).
>
> Local commits on `feature/spec-gap-remediation` (`bd909245` … chain-completion commit); NO PUSH yet.
>
> **Current scored completion: ~84%** — see the checklist rate table for per-module numbers.

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

### A2. Item T.4 — Government API integrations (SSS / Pag-ibig / PhilHealth / BIR) — EXTERNAL (BNPI-owned, per operator 2026-08-26)

- Exists: local contribution rate tables only (`config/payroll.config.ts`); file-based reports live (RF-1, Annual BIR pack, BIR 2316).
- Missing: HTTP clients/auth to government endpoints.
- Blocker: **recorded in Project Truth as an external BNPI-owned dependency** — each agency requires the company to register for API access and issue credentials/keys; this is not included on the dev side until BNPI provides keys. Agents must not invent endpoints or placeholder credentials.

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

## C. Operator gate answers (updated 2026-08-26)

Answered:
1. ~~Statutory formats~~ → **PhilHealth RF-1 first — BUILT**, then SSS R-3 + Pag-ibig MF also built (all three live).
2. ~~201 filing scope~~ → **per-employee document checklist — BUILT** (`201 File` tab on employee profile).
3. ~~Assembly Standing~~ → **create ASA, taxable like LLA — BUILT end-to-end** (catalog, register column, Sheet2 CX, mass-upload code, payslip row; live-proven).
4. ~~Manhour reference~~ → **standard definition (one man-hour = one hour of work by one person) — BUILT** (`manhoursReport` + Manhours tab).

### Pending operator questions (parked 2026-08-26 — operator to answer when ready)

These block final closure of the last PARTIAL items. Buildable with flagged assumptions if operator prefers.

1. **Terminal pay tax basis (8.1):** (a) normal withholding table, (b) BIR final-tax rules for separated employees (>₱90k 13th-month threshold), or (c) compute and flag for accountant review?
2. **Terminal pay leave monetization:** Vacation + Personal only, or also Sick Leave? 13th-month pro-rata confirmed included?
3. **Uniform deduction report (1.4):** remaining balance per employee, or totals per cutoff? Amortized one-time deduction?
4. **Loan report (1.4):** all loans with running balances per employee/period, xlsx export — confirm format.
5. **Recruitment polish (7.1/7.2):** is a screening-funnel summary + activity-feed polish enough, or something specific?
6. **Login 2FA (T.2):** TOTP for everyone vs admin/HR only? Or does the admin-passcode requirement doc cover this item?
7. **Backups (T.6):** offsite target (Google Drive / other machine / VM-only) and retention days?
8. **Encryption at rest (T.3):** scope — biometric templates only, salary fields, all PII? At-rest only or also in-LAN transit?

## D. Evidence

- Chain prompt + rules: `docs/00-product/AGENT-PROMPT-spec-gaps-modules-1-to-5-chain.md`
- Stage evidence: `.runtime/spec-gap-m1-5/stage-*` and `.runtime/spec-gap-m1-5/resume-20260825-173211/RESUME-SUMMARY.json`
- Statuses/evidence per item: `HRIS_KEY_MODULES_FUNCTIONAL_SCOPE_CHECKLIST.md`
