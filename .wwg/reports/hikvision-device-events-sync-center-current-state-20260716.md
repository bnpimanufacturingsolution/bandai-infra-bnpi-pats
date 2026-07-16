# Hikvision Device Events and Sync Center - Current-State Audit

## Classification and plan review

- Task mode: mixed meaningful feature, regression repair, persistence cleanup,
  runtime repair, and high-risk data migration.
- Delivery: AI-agent owner-operator.
- Plan review: revised before execution to add retained-row evidence migration
  and evidence/confidence API filtering before UI work.

## Runtime evidence

| Check | Result |
|---|---|
| Windows `3001` bind | Repaired; dynamic excluded range moved by bounded WinNAT restart |
| `http://localhost:3001/health` | HTTP 200 |
| admin login | HTTP 200, bearer token returned |
| `http://10.184.37.19:3001/health` | HTTP 200 |
| `http://10.184.37.19:3101/health` | HTTP 200 |
| `cloudflared-bnpi-hris.service` | active |
| K3s node | Ready |
| Argo apps | prod/dev/uat application apps healthy; runtime-dev degraded at discovery |

The local API startup timeout was not a listener failure after repair: the
listener started on `0.0.0.0:3001`, but the helper used a two-second client
timeout while warm health took slightly longer. The helper now allows ten
seconds; a clean restart completed in 12.6 seconds and reported healthy.

## Direct device evidence

The device was intermittent during discovery, first timing out through both
the canonical VM route and the Windows LAN. Subsequent stored-credential ISAPI
requests succeeded. Final direct capture at `2026-07-16T09:16:50Z` proves:

| Direct metric | Count |
|---|---:|
| Users | 167 |
| Users with fingerprints | 162 |
| Users with faces | 161 |
| Users with cards | 109 |
| Device log total | 2,107 |
| ACS rows in frozen window | 70 |

`UserInfo/Search` paginated across six pages; ACS paginated across three. The
former 165/2,033 screen claims are stale. The UI uses these current direct
counts only while `inventoryEvidenceSource=DEVICE_CURRENT_STATE`; failure falls
back to an explicit `Needs reverify` state rather than cached substitution.

`ContentMgmt/logSearch` returned 23 rows across two raw XML pages. Proven exact
metaIds are:

| Raw `.173` metaId | Count | Normalized action |
|---|---:|---|
| `log.hikvision.com/Information/addFpByEmployeeNo` | 2 | `FINGERPRINT_ENROLLED` |
| `log.hikvision.com/Information/addUserInfo` | 2 | `USER_CREATED` |
| `log.hikvision.com/Operation/localfaceDataAppend` | 3 | `FACE_ENROLLED` |
| `log.hikvision.com/Operation/localfaceDataDelete` | 2 | `FACE_DELETED` |
| `log.hikvision.com/Operation/enterLocalUIBackground` | 14 | `UNKNOWN` |

## Saved-row audit before cleanup

Device ID: `cmrht5s2w00ei7zgsre8y3o5n`.

| Measure | Count |
|---|---:|
| Total saved rows | 1,075 |
| Matched | 214 |
| Needs match | 175 |
| Ignored | 570 |
| Attendance created | 36 |
| Attendance updated | 80 |
| Failed | 0 |
| `PROVEN` | 83 |
| `SUPPORTED` | 83 |
| `INFERRED` | 397 |
| `UNKNOWN` | 512 |
| Rows with `payload.evidenceSource` | 0 |
| Rows with `directDeviceEvidence=true` | 0 |
| Proven fake lifecycle rows | 219 |
| Fake rows linked to attendance | 0 |

Fake scope:

| Event type | Action | Count |
|---|---|---:|
| `BiometricStateBackfill` | `USER_CREATED` | 120 |
| `BiometricStateBackfill` | `FINGERPRINT_ENROLLED` | 99 |

Predicate: `eventType=BiometricStateBackfill`, `eventConfidence=INFERRED`, and
`payload.derivedFromCurrentDeviceState=true`.

## Selected window

Frozen window: `2026-07-16T00:00:00+08:00` through
`2026-07-16T16:46:14+08:00`.

| Saved action | Count | Source |
|---|---:|---|
| `TAP` | 9 | SDK callback / ACS serial proof |
| `TAP_REJECTED` | 7 | SDK callback / ACS serial proof |
| `FINGERPRINT_ENROLLED` | 2 | ISAPI logSearch |
| `FACE_ENROLLED` | 3 | ISAPI logSearch |
| `FACE_DELETED` | 2 | ISAPI logSearch |
| `USER_CREATED` | 2 | ISAPI logSearch |
| `SYNC_SIGNAL` | 33 | SDK callback |
| `UNKNOWN` | 35 | 21 SDK + 14 logSearch |
| Total | 93 | `DEVICE_EVENT_DATABASE` |

All 70 ACS serials match saved SDK rows; zero source rows are missing in the
frozen window. All 23 logSearch rows were saved, and a second execution returned
23 duplicate flags with no additional rows.

## Cleanup execution and postconditions

The preview remained 219 events and zero linked attendance immediately before
execution. Backup directory:
`.runtime/backups/device-events-reset-2026-07-16T08-44-37-937Z`.

The backup independently parses to 219 rows: 120 false `USER_CREATED` and 99
false `FINGERPRINT_ENROLLED`, all `BiometricStateBackfill`. Execution deleted
219 `DeviceEvent` rows and zero attendance rows. The same preview predicate now
returns zero.

## Verification

- Evidence, face-action, and numeric taxonomy migrations executed successfully.
- Backend TypeScript check passes.
- Focused backend suite: 49 passing.
- UI contract suite: 11 passing; task-local frontend type errors: zero.
- Frozen-window API total, pagination total, action sum, and direct evidence
  source sum all equal 93.
- Playwright live proof passes against localhost and captured the ledger and
  raw-payload details drawer; today-view API/UI total was 95 at capture.
- Raw evidence is under
  `.runtime/device-events-sync-center-20260716-160910/`.

## Final count table

Capture times: direct inventory `2026-07-16T09:16:50Z`; all-time saved ledger
`2026-07-16T09:18:55Z`; frozen event window ends `2026-07-16T16:46:14+08:00`.

| Metric | Count | Source | Remaining drift |
|---|---:|---|---|
| Current device users | 167 | `DEVICE_CURRENT_STATE` | Former UI claim 165 was stale; HRIS cache had 151 |
| Current users with fingerprints | 162 | `DEVICE_CURRENT_STATE` | HRIS cache had 149 |
| Current users with faces | 161 | `DEVICE_CURRENT_STATE` | HRIS cache had 147 |
| Current users with cards | 109 | `DEVICE_CURRENT_STATE` | No prior trusted direct count |
| Current device log total | 2,107 | `DEVICE_CURRENT_STATE` | 1,236-row calculated gap versus 871 all-time SDK rows; full historical serial reconciliation remains |
| New ACS events in frozen window | 70 | direct ACS search | 0 missing serials; 70/70 saved |
| New logSearch events in frozen window | 23 | `ISAPI_LOGSEARCH` | 0 missing; second execute was 23/23 duplicates |
| New saved events in frozen window | 93 | `DEVICE_EVENT_DATABASE` | 70 SDK + 23 logSearch; exact source sum |
| Total saved HRIS rows | 894 | `DEVICE_EVENT_DATABASE` | Includes 871 SDK and 23 logSearch rows |
| Matched | 130 | `DEVICE_EVENT_DATABASE` | 14 matched + 36 attendance-created + 80 attendance-updated |
| Unmatched / needs employee match | 160 | `DEVICE_EVENT_DATABASE` | Requires identity resolution, not event invention |
| Ignored | 585 | `DEVICE_EVENT_DATABASE` | Raw evidence retained |
| Failed | 0 | `DEVICE_EVENT_DATABASE` | None |
| Direct evidence | 894 | `DEVICE_EVENT_DATABASE` | 100% of retained rows |
| Inferred evidence | 0 | `DEVICE_EVENT_DATABASE` | Current-state lifecycle inference removed |
| Unknown evidence | 328 | `DEVICE_EVENT_DATABASE` | Preserved for future vendor mapping review |
| Known skipped source rows | 0 | `DEVICE_SYNC_RUN` | Latest run/preview reports none |
| Source rows missing in frozen window | 0 | ACS serial reconciliation | Exact 70/70 proof |

## Existing implementation found

Pre-existing dirty work supplied the initial logSearch parser, normalization,
face enum, runtime event, cleanup scope, and test foundation. This task completed
the retained-row evidence migration, numeric taxonomy reconciliation,
evidence/confidence filtering and summaries, direct-inventory API/UI contract,
cleanup execution/recount, direct `.173` proof, deduplication proof, and live
Playwright verification.

## Allowed and restricted areas

Allowed: device-event schema/migration/controller/helper/router/tests; device
events service/hooks/page and focused UI tests; requested product docs; WWG
truth/report synchronization; `.runtime` evidence.

Restricted: unrelated dirty `time-logging.tsx`; ZKTeco/attendance evidence;
linked attendance; VM tunnel lifecycle; biometric template custody; unrelated
runtime or repo refactors.

## Validation plan

Focused tests, Prisma generation/typecheck, migration review, reset preview,
backup manifest inspection, cleanup recount, API filter/summary parity,
local/VM health, direct device retry, and Playwright after API proof.
