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
listener started on `0.0.0.0:3001`, then direct health passed in 2.29 seconds.
The restart helper's readiness behavior remains a reliability follow-up.

## Direct device evidence

`10.184.38.173:443` is currently unreachable from both required paths:

- canonical VM: route via `10.184.37.250`, TCP 80/443/8000 and HTTPS timeout;
- Windows LAN: source `10.184.38.170/24`, target neighbor entry incomplete,
  ping and TCP 443 fail.

Therefore the claimed 165 users and 2,033 logs, direct fingerprint/face/card
counts, ACS window total, logSearch availability, pagination, and exact `.173`
metaIds are `NEEDS_REVERIFY`. Cached HRIS current state is not substituted.

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

Window: Manila business day 2026-07-16, from midnight through discovery time.

| Saved action | Count | Source |
|---|---:|---|
| `TAP` | 5 | `SDK_CALLBACK` raw rows; evidence keys not yet backfilled |
| `TAP_REJECTED` | 5 | `SDK_CALLBACK` raw rows; evidence keys not yet backfilled |
| `SYNC_SIGNAL` | 29 | `SDK_CALLBACK` raw rows; mapping requires review |
| `UNKNOWN` | 23 | `SDK_CALLBACK` raw rows, intentionally unmapped |
| Total | 62 | `DEVICE_EVENT_DATABASE` |

## Existing implementation found

Pre-existing dirty work already adds logSearch XML construction/parsing,
pagination, SDK/logSearch/state-transition normalization, face action enums,
runtime sync events, exact cleanup scoping, and focused tests. The focused suite
passes 49 tests. Missing work discovered by this audit includes retained-row
evidence migration, evidence/confidence API filters and summaries, full UI
contract, cleanup execution/recount, direct `.173` raw proof, and end-to-end
verification.

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

