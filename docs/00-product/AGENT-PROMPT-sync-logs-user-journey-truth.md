# Agent prompt: Sync logs → Device events user journey (truthful, not confusing)

**Paste or internalize for any Sync logs / Device events honesty work.**  
Always-on ownership: `.grok/rules/01-agent-owned-execution.md` + `AGENTS.md`.

---

## PASTE BLOCK

```text
================================================================
SYNC LOGS USER JOURNEY — TRUTH + CLARITY (AGENT-OWNED)
================================================================
Role: Project Truth owner-operator. You execute; no homework for the human.
Bootstrap WWG with tools, Current-State Report, then work until acceptance green.

### Product journey (must stay clear)
1) Admin opens Device events → Sync logs
2) Preview shows ONE compact table: Event | Category | Will add | Saved | Status
   Categories: USER MGMT / ENROLLMENT / ATTENDANCE / REVIEW (short chips)
3) "What to save" toggles (default both on):
   - Attendance taps = ACS access punches
   - User & enrollment activity = Information logSearch (User created, Fingerprint enrolled, …)
4) "How far back" time window (all / 7d / 30d / 90d)
5) Summary: "Will try to save about X (A attendance + B user/enrollment)"
6) Confirm Sync → progress modal shows LIVE truth:
   - Saved so far (imported)
   - Breakdown attendance vs user/enrollment
   - Rows scanned this pass vs scan limit
   - Preview estimate labeled as estimate (sample × totals), may need more passes
7) Device events ledger shows saved rows:
   - USER_CREATED / FINGERPRINT_ENROLLED with ISAPI logSearch evidence
   - Employee/User column: NEVER show raw base64 as "No. sQdO+…"
     → "Device person token (not a readable employee no.)" + Needs link
     when Hikvision LogAddInfo.EmployeeNo is a privacy token

### Known truth (prove live; do not invent)
- Device maintain Information logs classify:
  addUserInfo / Add Person* → USER_CREATED
  addFpByEmployeeNo / Add Fingerprint* → FINGERPRINT_ENROLLED
- metaId for operations: log.hikvision.com/Information (not std-cgi only)
- Preview willAdd for large catalogs uses sample classify + extrapolate
- Interactive sync may only complete PART of the preview estimate in one pass
  (scan caps). That is not a bug if Saved/Scanned progress is honest.
- Hikvision often returns EmployeeNo as base64 opaque token in operation logs
  (e.g. ADRenBQDnvFhBTMtB9zT3g==). That is NOT employee "17". Matching to BNPI PATS
  requires a plain person id or DeviceUser inventory reconciliation — do not
  pretend the token is a readable employee number.

### Forbidden UX lies
- Progress stuck at 0% while rows are scanning/saving → fix percent basis
- "Device total 4,782" implying full sync target when ops estimate is ~20k
- "No. <base64>" as if it were Employee ID
- Sync only attendance when both scopes selected
- Ending with "you should hard-refresh / click Sync"

### Acceptance (all required)
[ ] Sync logs modal: one table + scope toggles + honest summary
[ ] Live sync-preview JSON: Fingerprint enrolled + User created willAdd present
[ ] Live dual-source job: operationsImported>0 and/or attendanceImported>0 when selected
[ ] Progress modal: scan progress + save count + estimate labeled estimate
[ ] Device events UI: opaque person tokens labeled honestly (not "No. base64")
[ ] Playwright: admin-device-sync-logs-truth + opaque/display contract or smoke
[ ] Evidence under .runtime/sync-journey-truth-*/
[ ] Commit/push develop when green

### Commands (adapt)
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$dir = ".runtime/sync-journey-truth-$stamp"
# health + login + sync-preview + hikvision/sync (includeAttendance/includeOperations)
# poll import-jobs
# GET device/events?eventAction=USER_CREATED — check employeeNo shape
# mocha: hikvision-event-contract.helper.spec.ts
# playwright: tests/smoke/admin-device-sync-logs-truth.spec.ts

HEARTBEAT each cycle. Real stop only per AGENTS.md.
START NOW with tool Reads + live probes.
================================================================
```

---

## Short continue line

```text
CONTINUE Sync logs user-journey truth from docs/00-product/AGENT-PROMPT-sync-logs-user-journey-truth.md.
No homework exits. Prove opaque employee tokens labeled honestly + progress estimate honesty + dual-source save.
```

---

## Operator notes (you)

Rules are auto-loaded; you do **not** need to paste for agent ownership. Paste the PASTE BLOCK only when you want a focused multi-cycle honesty pass. Headless long runs: `--max-turns 250` + always-approve.
