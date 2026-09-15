# Timesheet ↔ schedule connection (2026-08-20)

| Field | Value |
|---|---|
| Status | `AUDITED_CODE` |
| Question | How does timesheet stay tied to schedule when schedule can change? |
| Answer | **Three layers.** Changing schedule updates **expected work days** immediately. It does **not** rewrite punches or submitted timesheet lines. Late/OT on the punch stay vs the **old** schedule until something recalculates them. |

## Layers (do not mix)

| Layer | What it is | Changes when HR changes schedule? |
|---|---|---|
| **A. Live schedule** | Employee weekly hours / template / same-day override | **Yes** from effective date (weekly hours = next Monday by default) |
| **B. Expected day** | `AttendanceObligation` (HR Attendance “should work”) | **Yes** — `recomputeAttendanceObligationsForRange` (`ScheduleChanged`) |
| **C. Punch** | `Attendance.timeIn` / `timeOut` + frozen `scheduleSnapshot` + stored late/OT | **No** — punches stay; late stays vs clock-time schedule |
| **D. Timesheet day** | `Timesheetline` (submit / review / payroll) | **No** on schedule change. Rebuild only if someone **submits/saves** the sheet or calls `sync-obligation-lines` (unlocked) |

## Normal day (process)

1. Person has a **Work Schedule** (template or Mon–Sun hours).
2. For that date, app picks the shift: **same-day override** first, else the weekly/template pattern.
3. It writes an **obligation**: expected start/end.
4. Punch (Time In): freeze that day’s schedule on `Attendance.scheduleSnapshot`. Late is vs **that** start.
5. Punch (Time Out): still vs **frozen** snapshot, not a new live schedule.
6. Timesheet copies the day (clocks + hours + optional **Day labor** tag).

Lead “Tardiness = actual TI vs sched”: **true at punch time**, stored.  
Lead “OT = extra vs sched”: **detected**, **paid only if approved**.

## If schedule changes after that

| Action | Obligations (expected TI/TO) | Timesheet lines | Punches | Stored late/OT | Day labor tag |
|---|---|---|---|---|---|
| **Change schedule → Days** (weekday hours) `POST /api/employee-schedules` | Rebuild from **next Monday** (~60 days) | No | Keep | Keep (old sched) | Keep |
| **Change schedule → Dates** (that calendar day) `POST /api/scheduleOverride` | That date’s expected window updates | No | Keep | Keep (old sched) | Keep |
| **set-active** template | Rebuild from start date | No | Keep | Keep | Keep |
| Employee **schedule-change request** completed | That date + draft header refresh | Lines not rewritten | Keep | Keep | Keep |
| **Save/submit timesheet** / `sync-obligation-lines` (unlocked) | — | Can recalc hours vs **live** sched | Keep | Line hours can change; punch row may stay old | Copied / kept |

**No automatic job** walks old punches and re-runs late vs the new hours.

## Where “sched” can disagree

| Screen | Which schedule |
|---|---|
| Timesheet day editor “Scheduled shift” | **Live** (after the change) |
| Stored late on Attendance / tardiness report | **Frozen at first punch** |
| Timesheet line hours after submit | Frozen on the **line** until unlocked rebuild |
| HR Attendance expected times | **Live** obligation |

Same-day override after punches is the sharp case: editor shows 7–4, punch late still vs 6–3, until timesheet save recalcs the **line**.

## Day labor (Direct/Indirect work tag)

Lives on the **timesheet day** (`Timesheetline.dayLaborType`). Schedule change does **not** wipe it (recompute does not write that field; lines are not rebuilt).

It is **not** the schedule. Schedule = start/end. Day labor = Direct vs Indirect **work type** that day.

## Code

| Piece | Path |
|---|---|
| Resolve that day’s shift | `bnpi-pats-api/helper/employee-schedule.helper.ts` `resolveEffectiveShift` |
| Rebuild expected days | `recomputeAttendanceObligationsForRange` reason `ScheduleChanged` |
| Punch freeze | `attendance.controller.ts` / Hikvision callback stamp `scheduleSnapshot` |
| Timesheet persist math | `normalizeBreakdownForPersistence` uses **live** resolve |
| Line rebuild | `materializeTimesheetLinesFromObligations` — **not** called by schedule change |
