# Lead claim vs shipped 2.1.7 — 2026-08-20

| Field | Value |
|---|---|
| Status | `CONFLICTING` |
| Question | Does the lead’s 2.1.7 meaning match the app? |
| Answer | **No** for Direct vs Indirect. **Partial** for tardiness. **No** for overtime as raw extra hours. |

Lead text:

> Tardiness/Overtime → Actual TI/TO vs Sched  
> Direct vs Indirect Labor → Employee tagging per day. Line Leader does it for everyone under them. Today Direct, tomorrow Indirect. Attach to timesheet schedule per day as a property.

## Verdict (plain)

| Lead said | App today | Match? |
|---|---|---|
| Tardiness = actual Time In vs schedule | Late minutes **come from** punch vs scheduled start, then the **report** only shows totals (not a TI/TO vs sched grid) | **Partial** |
| Overtime = actual Time Out extra vs schedule | Extra punch time is only a **candidate**. Report/payroll pay **approved** OT | **No** (BNPI policy) |
| Direct/Indirect = Line Leader tags that day’s **work** | Direct/Indirect = is this person **BNPI Direct or Agency** on the employee record | **No** |
| Can change every day | Employee field is static until HR edits hire source | **No** |
| Line Leader does the tagging | No Line Leader timesheet role. “Line Leader” in payroll is **LLA allowance** | **No** |
| Stick it on timesheet sched per day | Day row **copies** employee Direct/Agency. Nobody edits it as a day tag | **Not that product** |

## Tardiness / OT

| Surface | What it actually is |
|---|---|
| Attendance Overview Late / UT / Hours | Closest to “actual TI/TO vs sched” |
| `/hr/reports/attendance?tab=tardiness` | Rollup of stored late (and UT in KPI). No TI/TO/sched columns |
| `/hr/reports/attendance?tab=overtime` | Sum of stored **payable** OT hours, not raw extra after shift |
| Policy | `requireManagerApprovedOvertime` default **true** |

## Direct vs Indirect (shipped)

| Item | Truth |
|---|---|
| SoT | `Employee.workforceSource` = `DIRECT` \| `AGENCY` |
| Report mapping | `AGENCY` → Indirect; else Direct |
| UI | HR report `/hr/reports/workforce?tab=direct-indirect` |
| Who sets it | HR employee form / import, not Line Leader |
| Day copy | `Timesheetline.workforceSourceSnapshot` = copy of employee at generate |

That snapshot is **not** “today Direct work, tomorrow Indirect work.” It is “this person is BNPI or Agency.”

## What the lead wants (not built)

Per-day work type, Line Leader tags their people, can flip Direct/Indirect each day, stored on the timesheet day.

That needs **new** product: day field (not hire `DIRECT`/`AGENCY`), Line Leader UI, writes onto `Timesheetline` (or obligation), reports that **sum days** not people.

Do not pretend the Workforce tab is that. Do not reuse `Employee.workforceSource` for daily work type — that would mix hire source with daily assignment.

## Recommendation

`REC-20260820-DAILY-LABOR-TYPE-TIMESHEET` Proposed. Separate from shipped 2.1.7 report.

## Evidence

- `hris-api/helper/workforce-metrics.helper.ts` `getLaborBucket`
- `hris-api/helper/timesheet.helper.ts` snapshot copy
- `hris-api/prisma/schema/agency.prisma` enum `DIRECT` \| `AGENCY`
- `docs/00-product/DIRECT_INDIRECT_LABOR_REPORT.md`
- `docs/OVERTIME_SOURCE_OF_TRUTH.md`
