# Timekeeping Deep Audit (read-only)

Date: 2026-09-08
Task mode: audit-only (no code/config/data changes)
Scope: every timekeeping surface that feeds payroll — attendance ingestion, obligations, schedules, punch pairing, timesheet lifecycle, OT policy, day-status, metrics, and the generate/preview money path.
Method: 2 exhaustive discovery maps (backend + frontend), direct source verification of every critical claim (file:line quoted), focused test runs, WWG cross-check for drift.

---

## Verdict

`CONFIRMED_CODE_AUDIT_WITH_ONE_MONEY_PATH_CONFLICT`

The core money pipeline is structurally sound (APPROVED+DIRECT gate, paid/locked skips, OT approval gate, snapshot semantics, Manila-day handling — all verified in code). But **Start Payroll now auto-approves DRAFT/SUBMITTED/REVISED and even REJECTED timesheets and does not consult the org's `enableAutoApprove` config** — a 2026-09-04 lane whose over-reach conflicts with the manager-approval workflow product surface. That is the headline finding (F1) and needs an operator decision.

Test health at audit time: core helpers 34/34 passing (`timekeeping.helper`, `day-status-resolution.helper`, `overtime-approval.helper`, `timesheet-auto-approve` specs); money-path source-truth regression 24/24 (`test:regression:payroll-source-truth`).

---

## Part 1 — What is verified correct (do not "fix" these)

| Claim | Evidence |
|---|---|
| Generate reads APPROVED + `workforceSource='DIRECT'` only; agency excluded by design; payFrequency + dept/section scoped | `findPayrollTimesheetCandidateIds` `payroll-period.helper.ts:616-642` |
| Preview is read-only — no auto-approve inside `previewPayrollFromTimesheets` | sole `ensurePayrollPeriodTimesheetsAutoApproved` call site is in generate at `payroll-period.helper.ts:1634` |
| Paid employees skipped; locked sheets skipped; manual manager approvals preserved (`approvedBy !== SYSTEM_AUTO_APPROVE`) | `timesheet.helper.ts:1823-1837`, `resolveTimesheetAutoApproveEnsureAction` :65-76 |
| Payable OT is zero unless `overtimeApprovalStatus === "APPROVED"` or pre-approved metadata; raw extra time stays candidate-only | `applyOvertimeApprovalPolicyToTimekeepingFields` `overtime-approval.helper.ts:177-230` |
| Submit blocked on unfiled OT candidates | `findUnfiledOvertimeCandidateLines` `overtime-approval.helper.ts:317-339` (frontend gate `TimesheetViewModal.tsx:550-569`) |
| Materialization preserves SUBMITTED/APPROVED manual snapshots; refreshes only system-auto-approved sheets; soft-deletes lines whose obligations vanished; rewrites summary from effective lines | `materializeTimesheetLinesFromObligations` `attendance-obligation.helper.ts:1108-1330` |
| Obligation engine is Manila-day aware: `timezone @default("Asia/Manila")`, `getBusinessDayBounds`, `getBusinessDayBounds`-bounded attendance lookup; status precedence holiday > rest > leave > attendance; hire/termination gating; pay-frequency mismatch → CANCELLED | `attendance-obligation.helper.ts:771-884`; schema `attendanceObligation.prisma:12` |
| Hikvision punch pairing: panel mode earliest `checkIn` → latest eligible `checkOut` with min-gap; naive device timestamps normalized to `+08:00` | `selectHikvisionPunchPair` `hikvision-event-contract.helper.ts:988-1051`, `:1053-1064` |
| Day-status pipeline is read-only, never prices payroll (binding split honored) | `day-status-resolution.helper.ts` (pure classifier); AGENTS.md source-of-truth addendum |
| Raw-SQL naive-UTC wall-clock reconciliation has a canonical primitive | `readQueryRawUtcTimestamp` `attendance.helper.ts:33-105` |

---

## Part 2 — Findings

Severity: CRITICAL = can pay the wrong people; HIGH = money-adjacent integrity/observability; MEDIUM = drift, performance, hygiene; LOW = traps.

### F1 — CRITICAL — Payroll-generate auto-approve lane ignores org config and approves REJECTED timesheets

- `ensurePayrollPeriodTimesheetsAutoApproved` runs **unconditionally inside Start Payroll** (`payroll-period.helper.ts:1627-1658`, lane comment "System auto-approval lane (2026-09-04)").
- `resolveTimesheetAutoApproveEnsureAction` (`timesheet.helper.ts:65-76`) returns **"upgrade" for `DRAFT | SUBMITTED | REVISED | REJECTED`**; the upgrade branch materializes lines then stamps `status=APPROVED` via `buildTimesheetAutoApprovalPatch` (`timesheet-config.helper.ts:171-189`).
- `TimesheetConfig.enableAutoApprove` is **never consulted** in this chain. The config gate exists only in the employee submit path (`timesheet.controller.ts:4783`) and the approve-action path (:3601). `resolveTimesheetAutoApprovalEnabled` has zero callers in helpers.
- Consequences: (a) an org with `enableAutoApprove=false` still gets auto-approval at payroll time — the admin toggle ("auto-approve" switch in `/admin/rules-policies/timesheet`) no longer controls the money path; (b) a manager **REJECTED** timesheet is flipped to system-APPROVED and paid — rejecting for correction does not block payment; (c) REJECTED→APPROVED bypasses the `rejectBehavior` workflow semantics entirely.
- The 2026-09-03 payroll audit's F1 (org-policy auto-approve mislabeled "Manager approved" in OT readiness) is the same family: the lane outran its labels.
- Classification: `CONFLICTING` with Project Truth 2026-08-12 ("Start Payroll unchanged: APPROVED + salary + schedule only" — technically still true, but Start Payroll now *manufactures* the APPROVED set) and with the UI approval workflow. The create/upgrade for DRAFT/SUBMITTED may be intended ("payroll runs any time on live data"); **REJECTED→paid is almost certainly not intended**.
- Needs: operator decision → then RECs REC-20260908-PAYROLL-AUTOAPPROVE-REJECTED-UPGRADE and the config-gate question.

### F2 — HIGH — D2 day-labor guard diffs a narrower field set than the write surface

- Guard alias list is 11 fields (`timesheet-day-labor-guard.helper.ts:23-35`): timeIn/timeOut/status + 8 hour/note strings.
- The write path a passing guard feeds (`syncTimesheetLinesFromBreakdown` `timesheet.helper.ts:206-382`) also persists from the request day: `metadata` (including `breakMinutes` :299-304, `leaveType`, `leaveEntries`, `holidayEntries`, `primaryMarker` via `buildTimesheetLineMetadata` :108-126), `notes` :352, and arbitrary `dayLaborType`.
- A line leader can therefore pass the "day-labor only" check while smuggling metadata changes (e.g. `metadata.breakMinutes`, `leaveType` decoration) that the guard never compares. Bounded impact (hours/status/time are guarded) but it is a real gap in a 2026-09-07 security fix, and it rides on `breakdown: z.array(z.any())` (`timesheet.zod.ts:206/212/224`) which validates nothing.
- Fix direction: make the guard diff the exact write field set (or strip the request day to `dayLaborType` for leader writes before persistence) + regression test.

### F3 — HIGH — Type safety is disabled across the money path; one controller is committed compiled JS

- 13 files carry `// @ts-nocheck` on line 1, including `attendance.controller.ts`, `timesheet.controller.ts`, `payrollperiod.controller.ts`, `request.controller.ts`, `employee.controller.ts`, `attendance-obligation.helper.ts`, and the metrics helpers. Prisma type errors cannot surface exactly where money flows.
- `app/payrollperiod/payrollperiod.controller.ts` is **compiled CommonJS emitted as .ts** (`"use strict"`, `require`, `__awaiter` — verified lines 1-12). Day-status, OT-readiness, generate/preview handlers live inside this artifact; edits are fragile and invisible to TS tooling.
- Both facts are structural debt, not immediate bugs; but any future money-path change here is unguarded at compile time.

### F4 — HIGH — Hikvision callback ingest: public by design, and the documented preview/dry-run lane has regressed

- `POST /api/hikvision/callback` is intentionally unauthenticated (`callback.router.ts` "NOTE: This endpoint is intentionally PUBLIC"); spoofed punches would flow to Attendance → obligation → timesheet → payroll. Already tracked as REC-20260814-PUBLIC-DEVICE-INGEST-AUTH — cross-referenced here because this audit confirms the money path reaches payroll from that endpoint.
- **`?preview=true` / `dryRun` no longer exists in the callback controller** (grep: only `deviceId` query param remains; no preview branch). WWG 2026-07-09 documented the preview lane as the safe probe. Drift-guard's canonical dry-run pattern references preview endpoints; this lane silently regressed. Full callback payloads are also `console.log`-dumped (controller head ~:308-315) — PII/biometric-adjacent logging.

### F5 — HIGH — Approved-OT import is script-only; buckets live in untyped JSON

- `approvedBuckets` (regularDays, regOtHrs, rdHrs, spclHrs, rholHrs, nightDiffPayAmount…) live inside `Timesheetline.metadata` — no schema validation anywhere; money is computed from `metadata.bandaiPayrollSourceRepair.approvedBuckets` (`payroll-period.helper.ts:644-735`).
- The DM4.3 apply path has **no HTTP route** — it runs only via `scripts/repair-bandai-payroll-source-timesheet-lines.ts` (`bandai-ot-line-patch.helper.ts` consumers). Migration endpoints only upload/store workbooks (`migration.router.ts:394-398`). Operator parity therefore depends on agent-run scripts (the known "VM replay later" debt) and cannot be previewed dry-run through the product.
- Hour totals are stored as `"H:MM"` display strings; `Timesheetline` has **no minute columns**; OT readiness parses the strings in SQL (`LINE_OT_MINUTES_SQL` `payroll-ot-readiness.helper.ts:36-46`); money math parses strings via `convertTimeToDecimal` :865. Fragile double representation.

### F6 — HIGH — Attendance import job progress is in-memory

- `attendance-import.service.ts:93-94` keeps `importJobs` in a static Map (self-comment: "use Redis in production"). An API restart loses pollable state — same failure class as the expired merge jobs and the stale processing snapshots fixed elsewhere. Violates the Long-Running Job Observability rule for a heavy job that runs minutes.

### F7 — MEDIUM — Two timekeeping math engines

- `calculateTimekeeping` (`timekeeping.helper.ts:471-625`) computes the persisted late/UT/OT values; `calculateStrictScheduleMetrics` (`schedule-work-metrics.helper.ts:198`) feeds `deriveBehaviorFlags` (`timekeeping.helper.ts:70-93`). Two implementations of the same business rules can diverge (behavior flag says one thing, stored hours another). Consolidate or derive flags from the same calc.

### F8 — MEDIUM — ZKTeco live path never creates attendance

- ZK callbacks save DeviceEvent + match the employee, then return `attendanceAction: "not_applied"` (`zkteco.controller.ts:324`, `:339-340`); `selectZktecoPunchPair` exists but is unused in the write path. Hikvision is the only vendor whose live callback writes Attendance. ZK punches reach attendance only via sync/import lanes. `NEEDS_CONFIRMATION`: if this is intended (ZK sites are legacy/import), document it; if not, it is a silent attendance hole on mixed-device sites.

### F9 — MEDIUM — Performance: per-employee×per-day obligation recompute

- `recomputeAttendanceObligationsForRange` does `findFirst` + `resolveEffectiveShift` + `attendance.findFirst` per employee-day (`attendance-obligation.helper.ts:775-928`). The ensure lane mitigates (no-signal prefilter, only-if-missing, bounded pool of 5, skipRefresh in generate) — code comments record a proven ">300s on DEV" full recompute. Department-wide schedule changes still pay the full cost.

### F10 — MEDIUM — Schema/repo hygiene drift

- Legacy **MongoDB schema tree still present** (`prisma/schema/` — `datasource mongodb`, `@db.ObjectId`); the typed `AttendanceScheduleSnapshot` shape exists only in the dead tree while the live Postgres side uses untyped `Json?`.
- `DayLaborType` enum lives in `agency.prisma:6` (placement smell).
- Attendance OpenAPI still documents 24-hex Mongo ids (`attendance.router.ts` id patterns) while the DB uses cuids.
- Tracked junk: `app/attendance/attendance.controller.ts.backup`, 40 `_tmp-*` scripts, `scratch/` — noise that pollutes future audits/greps.
- WorkSharing import is retired product truth (REC-20260826) but the route + service remain live.

### F11 — LOW — Naming/behavior traps

- `determineAttendanceStatus(_calc, _hasTimeOut, hasTimeIn)` ignores its first two args (`timekeeping.helper.ts:58-68`) — name suggests calculation-driven status; it is purely timeIn-presence. Callers assuming otherwise will be wrong.
- `schedule.helper.findShiftForDay` is label-matching (`label.includes("Mon")` etc.) — resilient but can mis-match abbreviated labels; keep day-name inputs canonical.
- `enableAutoApprove` Prisma default flipped to `true` (2026-09-03 operator decision, `timesheet.prisma:37`): orgs with no explicit config row silently get the behavior F1 describes.

### F12 — LOW — Frontend timekeeping honesty gaps (no money impact found)

- `/hr/attendance` runs **three** `useAttendanceMetricsDetailed` queries (rows/summary/overview) where two are identical `limit=1` shapes (`attendance-management-template.tsx:1177-1236`); `presentGt10Days` fetches **10,000 rows** client-side (:1176).
- `/hr/day-status-review`: search box inert (`searchValue=""` with no handler), server truncation at 5000 disclosed only in description text.
- `change-weekly-schedule-modal.tsx:177-184` applies multi-date overrides as sequential mutations — mid-loop failure leaves partial application, no batch/rollback.
- Dead mock surfaces with real-looking attendance shapes still exist (fully-simulated `attendance-approval.service.ts`, 404-lane `useTeamAttendance`, `Math.random` `TeamAttendanceTab` — largely covered by REC-20260825-MOCK-DEAD-CODE-PURGE).

---

## Part 3 — Payroll coupling verdict

The chain punch → DeviceEvent → Attendance → AttendanceObligation → Timesheetline (snapshot) → generate/preview → EmployeePayroll is coherent and each seam has a named owner (AGENTS.md source-of-truth split honored). The verified gates:

1. Identity: DeviceUser-first matching + padded-id fallback (callback + import paths).
2. Status precedence in obligations: holiday > rest > leave > attendance.
3. Snapshot freeze: manual SUBMITTED/APPROVED preserved; system-auto-approved sheets refresh until payroll locks.
4. Payroll set: APPROVED + DIRECT + payFrequency + scope; paid/locked skipped.
5. OT: payable only on APPROVED approval status; submit gate on unfiled candidates.
6. Money: buckets from effective lines' metadata; preview never mutates.

The single structural conflict is F1's approval lane. Everything else observed is hardening/observability debt, not wrong money.

---

## Part 4 — Test evidence

- `npx tsx node_modules/mocha/bin/mocha --no-config tests/timekeeping.helper.spec.ts tests/day-status-resolution.helper.spec.ts tests/overtime-approval.helper.spec.ts tests/timesheet-auto-approve.spec.ts` → **34 passing** (2026-09-08, local).
- `npm run test:regression:payroll-source-truth` → **24 passing** (api + db source-truth contracts).
- Coverage gaps mapped: no test pins `resolveTimesheetAutoApproveEnsureAction` against REJECTED input (F1 would have been caught); no regression test compares guard diff-list vs write field-set (F2).

---

## Part 5 — Operator decisions requested

1. **F1 (money)**: Should Start Payroll's auto-approval lane (a) exclude REJECTED sheets, (b) honor `enableAutoApprove=false`, (c) both, or (d) stay as-is with the UI toggle removed/relabeled? Current behavior pays manager-rejected timesheets.
2. **F8**: Confirm ZKTeco live-callback no-attendance is an intended boundary (sync/import lanes own ZK attendance) or a gap to close.
3. **F4**: Restore `?preview=true` dry-run on the callback (Real Endpoint Dry-Run rule depends on it) and add ingest auth per existing REC.

## New recommendations registered

- REC-20260908-PAYROLL-AUTOAPPROVE-REJECTED-UPGRADE (F1)
- REC-20260908-DAY-LABOR-GUARD-WRITE-SURFACE (F2)
- REC-20260908-CALLBACK-PREVIEW-LANE-REGRESSED (F4)
- REC-20260908-IMPORT-JOB-PROGRESS-DURABILITY (F6)

No code was changed. This audit supersedes nothing; it complements `.wwg/reports/payroll-audit-20260903.md` (money engine) from the timekeeping side.
