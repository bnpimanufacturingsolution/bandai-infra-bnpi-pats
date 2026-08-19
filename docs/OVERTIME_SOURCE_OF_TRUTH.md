# Overtime source of truth

**Status:** current implementation (local DEV clone, 2026-08-18)  
**Audience:** HR, payroll operators, and agents working attendance / timesheets / Run Payroll  
**Scope:** How OT is detected, approved, stored, and paid in this HRIS.  
**Not in WWG.** Product wiki is separate; this file is the working OT contract.

Related:

- DM4 biometrics vs approved OT workbook: `docs/dm-migration-workflow.md`
- Cutoff OT file vs Run Payroll probe: `docs/00-product/AGENT-PROMPT-e2e-ot-report-vs-run-payroll.md`
- June 26–Jul 10 parity checklist: `docs/BNPI_JUNE26_JULY10_2026_PAYROLL_PARITY_CHECKLIST.md`

---

## 1. One-line rule

**Payroll does not pay extra punch time.**  
It pays **approved overtime already written on an effective timesheet line**, and only when that timesheet is **APPROVED**.

Clock-in after shift end is a **candidate**. It is not OT pay.

---

## 2. Three different “OT” numbers

Do not mix these. They are different evidence classes.

| Name | Where you see it | What it is | Pays? |
|---|---|---|---|
| Punch / attendance OT | `Attendance.overtimeHours`, attendance table extras | Extra minutes vs schedule from time-in / time-out | **No** |
| OT candidate | Timesheet day **+OT**, `metadata.overtimeCandidate` | Detected extra hours waiting for a decision | **No** |
| Payable / approved OT | `timesheet_lines.overtimeHours`, Run Payroll OT chip, Bandai `approvedBuckets` | Hours payroll will use | **Yes**, if timesheet is APPROVED |

If punch OT is 176 hours and line OT is 54 hours, payroll uses **54**. That mismatch is expected when the approved OT report is smaller than raw extras.

---

## 3. Current policy (live config)

From `GET /api/timesheet/config` on 2026-08-18:

| Setting | Live value | Effect |
|---|---|---|
| `requireManagerApprovedOvertime` | **true** | Extra hours stay candidate until approved. Code treats unset as true (`!== false`). |
| `enableAutoApprove` | **false** | Submitting a timesheet does **not** auto-approve it. |
| `overtimeFlagThresholdMinutes` | **60** | Candidate / OVERTIME flag only if overtime ≥ 1 hour |

Seeds and `getOrCreateNormalizedTimesheetConfig` also default `requireManagerApprovedOvertime` to true.

---

## 4. How OT becomes payable

Two legal paths. Both write the same payable field: effective `timesheet_lines.overtimeHours`.

```text
Punch extra hours
    → OT candidate (+OT on the timesheet day)
    → line overtimeHours stays 0:00
         │
         ├─ Path A — Manager overtime request APPROVED
         │      → writes overtimeHours on that line
         │      → attendance overtimeHours only if request approved
         │
         └─ Path B — Approved OT workbook (DM4.3 / rptOvertimeDetails)
                → writes overtimeHours + approvedBuckets on the line
                → can auto-approve the timesheet as system:approved_ot_import

Run Payroll
    → only timesheets with status APPROVED
    → pays line overtimeHours / Bandai approvedBuckets
    → raw attendance OT is evidence only
```

### Path A — Manager OT request (day-to-day)

1. Timekeeping sees post-shift, rest-day, or holiday extra minutes.
2. Policy strips payable `OVERTIME` and sets `OT_CANDIDATE`.
3. Employee/HR files an overtime request from the timesheet day.
4. Request type `OVERTIME` goes through the configured workflow.
5. **Approve** writes `timesheetline.overtimeHours` and `overtimeApprovalStatus=APPROVED`.
6. **Reject** leaves hours unpaid.

UI: Timesheet day **+OT** → File overtime request → Requests hub.  
Submit warns if candidates are unfiled, but the user can still submit. The API does **not** hard-block submit with `OVERTIME_REQUEST_REQUIRED`.

### Path B — Approved OT workbook (BNPI cutoff)

BNPI payroll OT truth is the **OVERTIME/ND/HOLIDAY WORK DETAIL REPORT**, not the biometric punch file.

| Source file | Typical name | Role |
|---|---|---|
| Biometrics | `Biometrics Data_….xlsx` | Attendance punches only. No Reg OT / ND / RD / Hol hour columns. |
| Approved OT details | `rptOvertimeDetails` / `2rptOvertimeDetails - June 26 - July 10, 2026.xlsx` | Payable buckets: Regular Dys, Reg OTHrs, Reg NDHrs, Spcl Hrs, Spcl OTHrs, RHol Hrs, RHol OTHrs, RDHrs, RDOTHrs |

DM4.3 / `repair-bandai-payroll-source-timesheet-lines.ts` applies the workbook onto effective lines as `metadata.bandaiPayrollSourceRepair.approvedBuckets`. That metadata is treated as **pre-approved** and bypasses the manager-request gate.

After a historical OT import, timesheets that would block payroll (`DRAFT`, `SUBMITTED`, `REVISED`, `REJECTED`) can be flipped to **APPROVED** by `system:approved_ot_import`. That is import auto-approve, not “punches auto-pay.”

---

## 5. What Run Payroll actually pays

| Gate | Required | If missing |
|---|---|---|
| Effective timesheet line has `overtimeHours` (or Bandai buckets) | Yes | OT pay = 0 |
| Timesheet `status = APPROVED` | Yes | Employee is not in the payroll candidate set |
| Employee is DIRECT, has basic salary, has schedule | Yes | Preview shows not-ready |

Payroll generation (`generatePayrollFromTimesheets`) only loads **APPROVED** DIRECT timesheets.

When Bandai `approvedBuckets` exist on the lines, OT/ND/RD/holiday **money** is computed from those buckets (BNPI 313 daily rate path), not by re-deriving extras from punches.

When buckets are absent, the engine falls back to stored line `overtimeHours` × hourly rate × OT multiplier. On that fallback path it uses **whole OT hours only** (`Math.floor`).

Payable OT hours in readiness / person detail = Reg OT + Spcl OT + RHol OT + RD OT.  
ND / special hours / regular holiday hours / rest-day hours are **premium buckets**, not added into the payable OT hour total.

---

## 6. What does **not** pay OT

| Signal | Why it is not pay |
|---|---|
| Clock-in late / stay after end | Candidate only under current policy |
| `Attendance.overtimeHours` from punches | Evidence. Readiness label: *payroll uses lines, not raw punches* |
| Timesheet day **+OT** with no request and no workbook | `overtimeHours` remains `0:00` |
| Timesheet still DRAFT / SUBMITTED / REVISED / REJECTED | Not in Run Payroll set |
| Biometrics-only DM4 import | Builds attendance/timesheet shells; does not load OT buckets |
| Demo OT (`BNPI_DM4_DEMO`) | Must not appear in Approved OT |

---

## 7. Field map

| Layer | Field | Meaning |
|---|---|---|
| TimesheetConfig | `requireManagerApprovedOvertime` | Master policy |
| Timekeeping | `calc.overtimeMinutes` | Detected extras vs schedule |
| Attendance / line metadata | `overtimeCandidate`, `pendingOvertimeMinutes`, `overtimeCandidateReason` | `POST_SHIFT_EXCESS` \| `REST_DAY` \| `HOLIDAY` |
| Attendance / line metadata | `overtimeRequestId`, `overtimeApprovalStatus` | `NONE` \| `REQUESTED` \| `APPROVED` \| `REJECTED` |
| Behavior flags | `OT_CANDIDATE` vs `OVERTIME` | Candidate vs approved flag |
| Timesheet line | `overtimeHours` | **Payable hours** |
| Timesheet line metadata | `bandaiPayrollSourceRepair.approvedBuckets` | Workbook buckets + `source` / `sourceRow` / `appliedAt` |
| Timesheet | `status`, `approvedBy` | `system:approved_ot_import` = workbook auto-approve |
| Request | `type=OVERTIME` | Manager workflow |

Pre-approved exception: if metadata has `bandaiPayrollSourceRepair`, policy treats the line as already approved and does not zero `overtimeHours`.

---

## 8. Code map

| Concern | Path |
|---|---|
| Policy + candidate vs payable hours | `hris-api/helper/overtime-approval.helper.ts` |
| File / approve / reject OT request | `hris-api/app/timesheet/overtime-request.service.ts` |
| Timesheet config default | `hris-api/helper/timesheet-config.helper.ts` |
| Run Payroll OT readiness | `hris-api/helper/payroll-ot-readiness.helper.ts` |
| OT / bucket money | `hris-api/helper/payroll-period.helper.ts` |
| Workbook apply + timesheet auto-approve | `hris-api/helper/bandai-payroll-ot-auto-approve.helper.ts`, `hris-api/scripts/repair-bandai-payroll-source-timesheet-lines.ts`, DM4 adapter |
| UI candidate + submit warning | `hris-app/app/lib/utils/overtime-candidate.ts`, `TimesheetViewModal.tsx` |
| Run Payroll OT panel | `GET /api/payrollPeriod/:id/ot-readiness` |

---

## 9. Live snapshot (2026-08-18, this clone)

Evidence: `.runtime/ot-audit/`

| Period | Timesheets | Approved | People with payable line OT | Payable OT hours | Notes |
|---|---:|---:|---:|---:|---|
| `PP-20260626-20260711` | 840 | 840 | **725** | **15,239** | Workbook path. Example: punch 176:32 vs paid line **54:00** |
| `PP-20260726-20260811` | 312 | 7 | **0** | **0** | No payable line OT |
| `PP-20260811-20260826` (current) | 507 | 0 | **0** | **0** | No workbook apply, no approved OT requests |

Readiness API itself states:

- Payable source: `timesheetline.overtimeHours` (effective) / `timesheet.totalOvertimeHours`
- Raw attendance role: punch evidence only — not payable without approved OT on lines
- Note: import biometrics, then approved OT workbook, then Run Payroll

---

## 10. Operator checklist

**For a person who stayed late today**

1. Confirm the day shows **+OT** (candidate), not paid hours.
2. File an overtime request from the timesheet (or wait for the cutoff OT report).
3. Manager approves the request **or** HR imports `rptOvertimeDetails` for the period.
4. Timesheet must end **APPROVED**.
5. Run Payroll OT readiness should show that person under approved line OT.

**For a BNPI cutoff**

1. Import biometrics (attendance only).
2. Import the matching `rptOvertimeDetails` workbook (DM4.3 / repair script).
3. Dry-run until planned line updates = 0.
4. Confirm OT readiness people + hours vs the file.
5. Then preview / run payroll. Do not expect punches alone to create OT pay.

---

## 11. Honest limits

- Manager OT request exists in code and UI. On this clone it is not the BNPI cutoff path; Jun 26–Jul 10 payable OT came from the workbook.
- Submit-timesheet “file OT first” is a **warning**, not a hard API gate.
- Fallback payroll (no buckets) floors OT to whole hours. Bucket path uses the workbook hours as stored.
- This file describes **current code + this DEV clone**. If `requireManagerApprovedOvertime` is set to `false` in another org, punch extras can flow into `overtimeHours` without a request. That is not the live BNPI config.
