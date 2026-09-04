# Disciplinary Action Auto-Escalation (Attendance-Driven)

Status: REQUIREMENT ACCEPTED BY OPERATOR 2026-09-02. Implementation in progress on
local clone. Not pushed.

**Operator update 2026-09-03 (supersedes decision 1 partially):** bare no-show
days (day-status `REVIEW_NO_EVIDENCE`) now **auto-file**. A scheduled workday
(Mon-Sat) whose `AttendanceObligation` stays `EXPECTED`/`ABSENT` with no
biometric punch counts as an evidenced absent day. The engine runs hourly via a
cron worker (`cron-entry.ts` → `runDisciplinaryAutoEscalation`), scans the last
30 completed days, and files DRAFT cases only when an occurrence cluster reaches
`DISCIPLINARY_AUTO_MIN_ABSENT_DAYS` (default 3). All DRAFT cases remain
HR-confirmable on the `/hr/disciplinary-action` page, which is the review gate.

**Operator decisions 2026-09-03 (review workflow + notifications):**

1. **Status workflow on `/hr/disciplinary-action`:** `DRAFT --Confirm--> OPEN
   --Mark Ongoing--> ONGOING --Mark Resolved--> RESOLVED`; DISMISSED is
   reachable from OPEN/ONGOING. Terminal states offer no transitions.
2. **Offense type comes from the Disciplinary Rule Book:** the File/Edit form's
   offense select lists active Rule Book rules (value = rule code); backend
   `offenseType` accepts rule codes (`z.string()`, legacy enum values remain
   valid). Selecting a rule prefills severity (rule CRITICAL → case HIGH) and
   description.
3. **Rule Book consequence plan:** `Rule.consequencePlan` (JSONB) stores
   per-severity next steps `{ LOW | MEDIUM | HIGH | CRITICAL: { action,
   employeeStep, managerStep, responseWindowDays } }`. Seeded from the standard
   progressive-discipline ladder (SHRM/AIHR) + PH Labor Code twin-notice due
   process (Art. 277(b)/292(b), *Agabon v. NLRC* 2004): LOW = verbal coaching;
   MEDIUM = written warning, 5-day written explanation; HIGH = final warning /
   suspension, NTE + hearing, 5 days; CRITICAL = termination twin-notice with
   management escalation, 5 days.
4. **Notifications:** when HR confirms a case (`DRAFT → OPEN`) and when it is
   `RESOLVED`, the employee and their direct manager (`reportTo`) receive an
   in-app notification (category `DISCIPLINARY`, type `ALERT` for HIGH/CRITICAL
   else `WARNING`/`INFO`) carrying the matching consequence-plan next step.
   Plan source: rule-book plan when `offenseType` matches a rule code, else the
   standard ladder. Implemented in `helper/disciplinary-notify.helper.ts`,
   hooked in the DA update handler; failures are non-blocking.
5. **Live proof 2026-09-03:** confirming cron-filed case (Rey Capito, HIGH)
   produced notification to 2 recipients with NTE next-step text.

## Product rule

The company wants disciplinary actions (DA) to be **self-managing** for absence
offenses: when an employee accumulates absence days, the system proposes a DA with
severity derived from the days absent in the window and escalates severity for
repeat offenses.

## Accepted operator decisions (2026-09-02)

1. **Trigger evidence:** evidenced absences + HR-approved review queue.
   - `ABSENT` effective timesheet-day classes and `ABSENT_AWOL_EVIDENCED`
     (AWOL workbook-backed) day statuses auto-file.
   - `REVIEW_NO_EVIDENCE` (bare no-show) days are included **only** when HR
     explicitly accepts them from the review queue context — the engine never
     silently converts a bare no-show into a chargeable absence
     (project truth: phantom-absence guard, ₱462.8k–573.5k/window class).
2. **Severity matrix (days AWOL/absent in window):**
   - 1 day → `LOW`
   - 2 days → `MEDIUM`
   - 3+ days → `HIGH`
3. **Attempts escalation:** each prior non-dismissed DA for the same employee +
   offense family within the rolling lookback window bumps severity one level.
   Capped at `HIGH` (auto engine never files CRITICAL; CRITICAL stays manual).
4. **Filing mode:** the engine creates DAs in a new `DRAFT` status. No employee
   or payroll surface sees a DRAFT case. An HR/admin user must confirm the draft
   (status → `OPEN`) from the Disciplinary Action page before the case exists
   officially.
5. **Dedup:** one auto DRAFT per employee + offense family + occurrence window.
   Re-running evaluation never duplicates an existing DRAFT/OPEN/ONGOING case
   that overlaps the same window.

## Mechanics

- Endpoint: `POST /api/disciplinaryAction/auto-evaluate`
  - `execute=false` (default) → dry-run proposal list, zero writes.
  - `execute=true` → writes only DRAFT cases for the reviewed window scope.
- Window: caller supplies `dateFrom`/`dateTo` (the payroll/schedule window being
  audited). Suggested default: last completed semi-monthly cutoff.
- Occurrence counting: consecutive/grouped evidenced absence days per employee
  are collapsed into one occurrence cluster (weekend/rest days do not split a
  cluster); a new cluster starts after a gap of an attended/scheduled-worked day.
- Escalation lookback: 6 months by default (`DISCIPLINARY_ESCALATION_LOOKBACK_DAYS`,
  default 180).
- Provenance: auto-created rows stamp `metadata.autoRule = { version, evaluatedAt,
  window, evidenceClasses, dayCount, priorAttempts, source: "attendance-auto-escalation" }`
  so HR and audits can distinguish engine-filed cases from manual filings.
- Offense family: `ABSENTEEISM` (AWOL clusters map here; `offenseType` string
  stays compatible with the existing UI options).

## Out of scope (this pass)

- Late/tardiness escalation (PUNCTUALITY family) — engine is absence-only.
- CRITICAL severity auto-filing.
- Notification to employee on draft creation (only on HR confirm, later task).
- Per-company configurable matrix (single accepted BNPI matrix for now; the
  helper exports the matrix so a future Rule-catalog UI can override it).

## Safety boundaries

- Never mutates Attendance, Timesheetline, or payroll money. Read-only over
  day-status evidence; writes only `DisciplinaryAction` rows in `DRAFT`.
- `execute=false` default everywhere; the UI runs preview first and requires an
  explicit confirm click.
- Soft-delete and org scoping identical to manual DAs.
