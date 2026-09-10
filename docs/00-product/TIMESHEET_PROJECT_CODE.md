# Timesheet Project Code (per-day default)

**Status:** `CONFIRMED_CODE_AND_LIVE_LOCAL` (local DEV; not yet pushed to `develop`)
**Owner surface:** HR/HR-manager timesheet day editor; API `Timesheetline`
**Related:** `docs/00-product/DIRECT_INDIRECT_LABOR_REPORT.md` (hire-source report — different concept), `Timesheetline.dayLaborType` (day tag — the classification input)

---

## 1. What this is

Every timesheet line (one line per employee per calendar day) carries a **project code**. The code is a *default-derived* value: HR/leaders never have to type it, but they can override it per day.

Operator rule (2026-09-08):

| Day classification | Default project code |
|---|---|
| Direct labor day | `bnpi-dl-<year>` |
| Indirect labor day | `bnpi-id-<year>` |

**Per-day by design.** Because codes live on the line (per date), the same employee can be `bnpi-dl-2026` on Monday and `bnpi-id-2026` on Tuesday. There is no employee-level or timesheet-level code — the day is the grain.

This is the foundation for project management where each person's time is assigned to a project: the day-level code on every worked day is the attribution key future features (project cost rollups, per-project hours reports, per-project payroll slices) will aggregate.

## 2. Resolution rule (exact)

Precedence, evaluated per line at write time:

1. **Explicit override** — if the write request carries a non-empty `projectCode`, it is stored as-is (trimmed, max 64 chars; longer values are rejected by validation).
2. **Day tag** — `Timesheetline.dayLaborType` on that date: `DIRECT` → `bnpi-dl-<year>`, `INDIRECT` → `bnpi-id-<year>`.
3. **Hire source fallback** — no tag: `Employee.workforceSource` snapshot (`AGENCY` → `bnpi-id-<year>`; BNPI or **missing** source → `bnpi-dl-<year>`, per canonical terminology "not AGENCY = DIRECT").

`<year>` is the **Asia/Manila year of the line's date** (not the UTC year, not the payroll-period year). A punch just after Manila midnight on Jan 1 belongs to the new year's code even if UTC still says Dec 31.

**Guarantee:** every classifiable line gets exactly one code. There is no "unknown" bucket — a line with no tag and no workforce source classifies as DIRECT (missing source = DIRECT is the canonical Direct-vs-Indirect rule). The only nullable case is a garbage/empty date, which cannot occur through the normal write paths.

## 3. Where it is stored and written

- **Schema:** `Timesheetline.projectCode String?` (additive, nullable) in both `prisma/schema/timesheetline.prisma` and `prisma/schema-postgres/timesheetline.prisma`.
- **Resolver helper:** `hris-api/helper/timesheet-project-code.helper.ts`
  - `resolveTimesheetProjectCode({ dayLaborType, workforceSource, date })` — the canonical derivation.
  - `normalizeProjectCodeOverride(value)` — validates/normalizes explicit overrides.
  - `resolveManilaYearOfDate(value)` — Manila-year extraction.
- **Write paths (all three):**
  1. Breakdown save from the day editor / sync — `helper/timesheet.helper.ts` (`syncTimesheetLinesFromBreakdown` data block).
  2. Attendance-obligation materialization (auto line creation) — `helper/attendance-obligation.helper.ts`.
  3. Controller breakdown normalization — `app/timesheet/timesheet.controller.ts` (both success and fallback day branches).
- **Read surfaces:** breakdown builder payload, line mappers, revision audit (`Project code` label), API `timesheet`/`timesheetline` services and Zod schemas (`DailyBreakdownSchema`, `TimesheetlineSchema` + create/update partials).

## 4. UI

- **Timesheet day editor** (`hris-app/.../molecules/TimesheetDayEditor.tsx`): new **Project code** text input below **Day labor**. Placeholder previews the default (`bnpi-dl-YYYY` / `bnpi-id-YYYY` depending on the selected labor type). Empty = use the derived default. Max 64 chars.
- **Day tooltip** (`TimesheetDayTooltipContent.tsx`): shows `Project code: <code>` when present.
- Dual-app note: **HR-only** — the timesheet day editor has no `hris-emp-app` counterpart.

## 5. Backfill (one-time, already executed on local DEV)

Script: `hris-api/scripts/backfill-timesheet-project-codes.ts` (dry-run by default; `--execute` applies; `--org=` scopes; `--force-overwrite` also fills rows that already carry an explicit code — default preserves existing non-null values).

Local DEV result (2026-09-08):
- Scanned 177,948 effective lines → 0 unclassifiable.
- Distribution: `bnpi-dl-2026` ×173,517 · `bnpi-dl-2025` ×4,416 · `bnpi-id-2026` ×15.
- Executed as one atomic grouped SQL UPDATE: 177,942 rows updated; 6 pre-existing explicit codes preserved; post-verify 0 NULLs; employees confirmed carrying `dl-2025` **and** `dl-2026` across days (per-day + year-rollover proof).

Other environments (UAT/PROD) run the same script after the schema change deploys there.

## 6. Schema-change operational note (important for the develop push)

`prisma db push` on the current DB warns it wants to **drop the stray `EmployeeApplicationAccess` table** (1 row, pre-existing drift, not introduced by this feature). Do **not** run a blind `--accept-data-loss` push. The column was applied locally via the narrow create-only runner `scripts/migrate-add-timesheet-project-code.ts`, which adds the column if missing and drops nothing. Before this feature reaches the VM runtime, decide the stray table's fate (adopt into schema or accept its loss) — see the handoff entry.

## 7. Tests and proof

- `hris-api/tests/timesheet-project-code.helper.spec.ts` — 16/16 (precedence, AGENCY/missing-source buckets, Manila year boundary, per-day difference, override validation, canonical prefixes).
- Regressions: `timesheet-day-labor-guard.spec.ts` 7/7, `attendance-obligation.helper.spec.ts` 17/17, app `TimesheetDayCell` vitest 6/6.
- Typecheck: zero errors in touched files (repo-wide 121 pre-existing drift lines unchanged, none on touched surfaces).

## 8. Boundaries (what this is NOT)

- **Not a payroll input.** `projectCode` is stored metadata. Payroll computation does not read it; money results are unchanged (same pattern as the `hourlySalary` snapshot).
- **Not the Direct vs Indirect report.** That report buckets people by `Employee.workforceSource` (hire source). Project code *consumes* the same signals per day but is its own field.
- **Not the Day labor concept.** `dayLaborType` is the per-day work-type tag; project code is derived *from* it plus hire source.
- **Not an employee- or timesheet-level attribute.** The day is the grain; there is deliberately no employee-level default stored.
- **Not yet project-management.** This is the attribution key. Rolling time up per project (cost, hours, payroll slices) is future work once project entities/registries exist.

## 9. Roadmap hooks for project management (person-time → project)

Current state provides the per-person, per-day, per-project-code ledger. The natural next steps, in order:

1. **Project registry** — a `Project` entity (code unique per org, name, status, dates) so `bnpi-dl-2026` etc. become rows instead of free-text, with FK validation and admin CRUD.
2. **Validation against registry** — reject overrides whose code isn't in the registry; derive still works for the standard codes.
3. **Per-project hours report** — `SUM(regularHours/overtimeHours)` grouped by `projectCode` (already queryable today, free text or registry).
4. **Per-project payroll slice** — extend payroll money attribution by line-level `projectCode` (requires a product decision on how statutory/contribution lines split).
5. **Leader assignment UX** — line leaders tagging DIRECT/INDIRECT on a member's day automatically set the member's project code for that day (already automatic via derivation once the tag is set).

Items 1–2 are the gate for calling this "project management" rather than "project labeling"; nothing else in this document needs to change when they land.
