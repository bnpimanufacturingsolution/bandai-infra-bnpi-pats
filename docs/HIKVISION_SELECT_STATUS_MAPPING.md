# Hikvision Select Status mapping (BNPI PATS)

**Status:** `WIRE_DISPLAY_AND_PANEL_PAIRING`  
**Last updated:** 2026-08-13  
**WWG twin:** `.wwg/wiki/05-architecture/hikvision-select-status-attendance.md`  
**Audit report:** `.wwg/reports/hikvision-select-status-audit-20260813.md`  
**Evidence:** `.runtime/hikvision-status-audit-20260813/`

## One-line truth

Panel **Select Status** (Check In / Out, Break In / Out, Overtime In / Out) is Hikvision T&A. The live SDK listener **now copies** `NET_DVR_ACS_EVENT_INFO_EXTEND.byAttendanceStatus` onto the callback JSON. ISAPI `AcsEventInfo.attendanceStatus` + `label` is extracted and shown on Device Events as **Device status**. BNPI PATS **Time In / Time Out** is still first punch / later punch, not the panel choice.

## What the panel is

| Panel label | ISAPI `attendanceStatus` | SDK extend `byAttendanceStatus` |
|---|---|---|
| *(none / T&A off / not picked)* | `undefined` or omitted | `0` |
| Check In | `checkIn` | `1` |
| Check Out | `checkOut` | `2` |
| Break Out | `breakOut` | `3` |
| Break In | `breakIn` | `4` |
| Overtime In | `overtimeIn` | `5` |
| Overtime Out | `overtimeOut` (sometimes `overTimeOut`) | `6` |

Companion fields: `label` (e.g. `Check In`), `statusValue`.

**Prerequisite:** device **T&A / Attendance mode ≠ Disable**.

This is **not** door in/out (`dwDoorNo`). This is **not** `currentVerifyMode` (face/fp/card).  
BNPI PATS callback-controller `attendanceStatus` (PRESENT / INCOMPLETE) is a **different** concept.

## What BNPI PATS does today

| Path | Device sends Select Status? | Copied / stored? | Used for Time In/Out? |
|---|---|---|---|
| Live SDK `EN_HCNETSDK_ALARM` | Yes, on ACS **extend** when T&A is on | **Yes** — C++ POSTs `attendanceStatus` + `label` + `statusValue` | **Yes** — Check In/Out |
| ISAPI / Sync `HIKVISION_CALLBACK` `{ AcsEventInfo }` | Yes | **Yes** — extract + `payload.panelSelectStatus` | **Yes** — Check In/Out |
| Device Events UI | — | **Device status** column | Display |

### Live proof (2026-08-13, Device D, person 10, serial 9619)

Operator picked **Check In** on the panel.

| Read | Result |
|---|---|
| Live SDK POST (before C++ copy) | `panelSelectStatus.present=false` / Not sent |
| Same tap ISAPI `AcsEvent` | `attendanceStatus=checkIn`, `label=Check In` |
| Listener `acs_alarm_received` | `acsEventInfoExtend=true`, `employeeNo=10` |
| After C++ rebuild | `acs_alarm_received` includes `attendanceStatus` / `attendanceStatusPresent` |

## Code map

| Layer | Path | What it copies |
|---|---|---|
| C++ callback | `vendor/hikvision-linux/src/hikvision_bio/acs.cpp` `alarm_callback` | `ext->byAttendanceStatus` → job |
| C++ POST | same, `build_hikvision_callback_json` | `attendanceStatus`, `label`, `statusValue`, `attendanceStatusPresent` |
| Extract | `bnpi-pats-api/helper/hikvision-event-contract.helper.ts` `extractHikvisionEventData` | `deviceAttendanceStatus`, `deviceAttendanceLabel`, `panelSelectStatus` |
| Normalize | `bnpi-pats-api/helper/hikvision-panel-select-status.helper.ts` | Nested `AcsEventInfo` / `rawEvidence` / top-level |
| Persist | `callback.controller.ts` `withHikvisionPanelSelectStatus` | Stamps `payload.panelSelectStatus` |
| List API | `device.controller.ts` `getEvents` | `panelSelectStatus` on each row |
| ACS list | `access.control.controller.ts` | `bnpiPatsPanelSelectStatus` on InfoList |
| Socket | `device-event-realtime.helper.ts` | Slim event includes `panelSelectStatus` |
| UI | `bnpi-pats-app/app/lib/hikvision-panel-select-status.ts` + `events.tsx` | **Device status** column + drawer |

## Three vocabularies (do not mix)

| Vocabulary | Field | Values |
|---|---|---|
| Panel Select Status | ISAPI / SDK `attendanceStatus` + `label` | `checkIn`, `checkOut`, … |
| Device event | `DeviceEvent.eventAction` | `TAP`, `TAP_REJECTED`, enroll actions |
| Attendance day | `Attendance.status` | `PRESENT`, `INCOMPLETE`, `ABSENT`, … |

## Pairing (panel Check In / Check Out)

`selectHikvisionPunchPair` now has two modes:

| Mode | When | Time In | Time Out |
|---|---|---|---|
| `panel` | Any same-day punch has `checkIn` or `checkOut` | Earliest **Check In** (else earliest unsigned) | Latest **Check Out** after Time In. Later **Check In** is **not** Time Out |
| `time` | No panel Check In/Out on the day's punches | Earliest punch | Latest punch after gap (legacy) |

Break / OT panel labels do not set `timeIn`/`timeOut`. Timesheet refresh still runs after attendance create/update.

`REC-20260813-HIKVISION-SELECT-STATUS-BNPI-PATS-MAP` is Implemented for Check In/Out pairing.

## Vendor SDK at setup

Managed listener uses HCNetSDK **6.1.9.48**:

`SDK_ROOT=/home/infra/project-truth-hcnetsdk/EN-HCNetSDKV6.1.9.48_build20230410_linux64`

That header defines `NET_DVR_ACS_EVENT_INFO_EXTEND.byAttendanceStatus` (0–6). Setup is `NET_DVR_Init` + `Login_V40` + `SetDVRMessageCallBack_V51` + `SetupAlarmChan_V50`. BNPI PATS add-device does **not** set panel `attendanceMode`.

## Runtime notes (not in this commit)

- Listener wrapper must not treat outbox `:30108/health` as the BNPI PATS API (`HIKVISION_PREFER_CALLBACK_OUTBOX=0` + `53001`).
- Device A `10.184.37.21` SDK login **7** = no route from VM. Not a Select Status bug.
- DEV `bnpi-pats-hikvision-watcher --apply --watch` can flood old Fingerprint Enrolled rows.

## Related

- DeviceEvent TAP taxonomy: `docs/DEVICE_EVENT_ACTIONS.md`
- Enrollment identity: `docs/HIKVISION_ENROLLMENT_IDENTITY_FLOW.md`
- Runtime: `docs/HIKVISION_RUNTIME_TRUTH.md`
