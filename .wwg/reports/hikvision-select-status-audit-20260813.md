# Hikvision Select Status → BNPI PATS mapping audit

**Status:** `WIRE_AND_DISPLAY_IMPLEMENTED` (pairing unchanged; documented 2026-08-13)  
**Date:** 2026-08-13  
**Mode:** Audit + documentation only. No product code. **Not committed** (operator request).

## Canonical pack

| Path | Role |
|---|---|
| `docs/HIKVISION_SELECT_STATUS_MAPPING.md` | Operator / agent spec |
| `.wwg/wiki/05-architecture/hikvision-select-status-attendance.md` | Architecture twin |
| `.runtime/hikvision-status-audit-20260813/11-lead-synthesis.md` | Lead synthesis |
| `.runtime/hikvision-status-audit-20260813/01`–`10-*.md` | Ten agent reports |
| `.runtime/hikvision-status-audit-20260813/samples/` | Live API/DB JSON |

## Headline truth

| Claim | Status |
|---|---|
| Panel **Select Status** is real Hikvision T&A (Check In, Check Out, Break Out, Break In, Overtime In, Overtime Out) | CONFIRMED |
| Live SDK listener POST does **not** include that status | CONFIRMED (0 / 32,489 `EN_HCNETSDK_ALARM`) |
| ISAPI Sync **can** nest `AcsEventInfo.attendanceStatus` + `label` | CONFIRMED (689 rows; 678 `checkIn`) |
| BNPI PATS clock in/out is **first tap / later tap**, not panel status | CONFIRMED |
| Mapping implemented | **No** |

## Special scenario (operator)

Users Check In on **all** Hikvision devices. The panel cannot auto-detect in vs out; the person picks Select Status.

| Panel | BNPI PATS today |
|---|---|
| Check In @ 08:00 Device A + Check In @ 17:00 Device B | 08:00 = `timeIn`, 17:00 = `timeOut` |
| Break Out / Break In | Another `TAP` (often becomes/extends `timeOut`) |
| Overtime In / Out | Another `TAP`. Payroll OT is approved buckets / BNPI 313 |

## Residual: 689 nested statuses (live DEV)

| Bucket | Count | Blocker | Next (not started) |
|---|---:|---|---|
| `checkIn` | 678 | `code_defect` — stored, unused | Product decision: honor vs pair-by-time |
| `checkOut` | 6 | same | same |
| `undefined` | 2 | T&A unset | Confirm device attendance mode |
| `overtimeOut` | 1 | same | Do not treat as payroll OT |
| `breakOut` / `breakIn` | 1 / 1 | same | Do not treat as schedule break |
| `overtimeIn` | 0 | not seen | Physical canary only if mapping approved |
| SDK TAP with status | 0 / 1,318 | `export_gap` — C++ omit | Copy `byAttendanceStatus` on POST |

## Three vocabularies (do not mix)

| Vocabulary | Values |
|---|---|
| Panel Select Status | Check In / Out, Break In / Out, Overtime In / Out |
| `DeviceEvent.eventAction` | `TAP` / `TAP_REJECTED` |
| `Attendance.status` (also named `attendanceStatus` in callback code) | `PRESENT` / `INCOMPLETE` / `ABSENT` … |

`currentVerifyMode` is how they authenticated, not Check In vs Out.

## Agent reports

| # | File |
|---|---|
| 01 | `.runtime/hikvision-status-audit-20260813/01-wwg-docs-report.md` |
| 02 | `.runtime/hikvision-status-audit-20260813/02-sdk-cpp-wire-report.md` |
| 03 | `.runtime/hikvision-status-audit-20260813/03-isapi-acsevent-report.md` |
| 04 | `.runtime/hikvision-status-audit-20260813/04-deviceevent-schema-report.md` |
| 05 | `.runtime/hikvision-status-audit-20260813/05-callback-ingest-report.md` |
| 06 | `.runtime/hikvision-status-audit-20260813/06-attendance-pairing-report.md` |
| 07 | `.runtime/hikvision-status-audit-20260813/07-ui-display-report.md` |
| 08 | `.runtime/hikvision-status-audit-20260813/08-zkteco-contrast-report.md` |
| 09 | `.runtime/hikvision-status-audit-20260813/09-live-payload-report.md` |
| 10 | `.runtime/hikvision-status-audit-20260813/10-vendor-research-report.md` |

## Recommendations (Proposed, not implemented)

| ID | Action |
|---|---|
| `REC-20260813-HIKVISION-SDK-ATTENDANCE-STATUS-WIRE` | C++ POST `byAttendanceStatus` from ACS extend |
| `REC-20260813-HIKVISION-SELECT-STATUS-BNPI-PATS-MAP` | After operator decision, honor or display panel status |

Do not implement pairing changes until the operator chooses pair-by-time vs honor Select Status.
