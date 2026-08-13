# Hikvision Select Status mapping (HRIS)

**Status:** `WIRE_AND_DISPLAY_IMPLEMENTED` (pairing unchanged)  
**Last updated:** 2026-08-13  
**WWG twin:** `.wwg/wiki/05-architecture/hikvision-select-status-attendance.md`  
**Audit report:** `.wwg/reports/hikvision-select-status-audit-20260813.md`  
**Evidence:** `.runtime/hikvision-status-audit-20260813/`

## One-line truth

Panel **Select Status** (Check In / Out, Break In / Out, Overtime In / Out) is Hikvision T&A. The live SDK listener **now copies** `NET_DVR_ACS_EVENT_INFO_EXTEND.byAttendanceStatus` onto the callback JSON. ISAPI `AcsEventInfo.attendanceStatus` + `label` is extracted and shown on Device Events as **Device status**. HRIS **Time In / Time Out** is still first punch / later punch, not the panel choice.

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
HRIS callback-controller `attendanceStatus` (PRESENT / INCOMPLETE) is a **different** concept.

## What HRIS does today

| Path | Device sends Select Status? | Copied / stored? | Used for Time In/Out? |
|---|---|---|---|
| Live SDK `EN_HCNETSDK_ALARM` | Yes, on ACS **extend** when T&A is on | **Yes** — C++ POSTs `attendanceStatus` + `label` + `statusValue` | No — pair by time |
| ISAPI / Sync `HIKVISION_CALLBACK` `{ AcsEventInfo }` | Yes | **Yes** — extract + `payload.panelSelectStatus` | No — pair by time |
| Device Events UI | — | **Device status** column | No |

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
| C++ callback | `vendor/hikvision-linux/hikvision_biometric_service.cpp` `alarm_callback` | `ext->byAttendanceStatus` → job |
| C++ POST | same, `build_hikvision_callback_json` | `attendanceStatus`, `label`, `statusValue`, `attendanceStatusPresent` |
| Extract | `hris-api/helper/hikvision-event-contract.helper.ts` `extractHikvisionEventData` | `deviceAttendanceStatus`, `deviceAttendanceLabel`, `panelSelectStatus` |
| Normalize | `hris-api/helper/hikvision-panel-select-status.helper.ts` | Nested `AcsEventInfo` / `rawEvidence` / top-level |
| Persist | `callback.controller.ts` `withHikvisionPanelSelectStatus` | Stamps `payload.panelSelectStatus` |
| List API | `device.controller.ts` `getEvents` | `panelSelectStatus` on each row |
| ACS list | `access.control.controller.ts` | `hrisPanelSelectStatus` on InfoList |
| Socket | `device-event-realtime.helper.ts` | Slim event includes `panelSelectStatus` |
| UI | `hris-app/app/lib/hikvision-panel-select-status.ts` + `events.tsx` | **Device status** column + drawer |

## Three vocabularies (do not mix)

| Vocabulary | Field | Values |
|---|---|---|
| Panel Select Status | ISAPI / SDK `attendanceStatus` + `label` | `checkIn`, `checkOut`, … |
| Device event | `DeviceEvent.eventAction` | `TAP`, `TAP_REJECTED`, enroll actions |
| Attendance day | `Attendance.status` | `PRESENT`, `INCOMPLETE`, `ABSENT`, … |

## Pairing (unchanged)

`callback.controller.ts` still uses `pairPunchesAsClockOut` (default on, gap 0): first punch = `timeIn`, later punch = `timeOut`. Panel Check In on every device still becomes Time Out on the second tap.

`REC-20260813-HIKVISION-SELECT-STATUS-HRIS-MAP` remains Proposed until the operator chooses to honor panel status for pairing.

## Vendor SDK at setup

Managed listener uses HCNetSDK **6.1.9.48**:

`SDK_ROOT=/home/infra/project-truth-hcnetsdk/EN-HCNetSDKV6.1.9.48_build20230410_linux64`

That header defines `NET_DVR_ACS_EVENT_INFO_EXTEND.byAttendanceStatus` (0–6). Setup is `NET_DVR_Init` + `Login_V40` + `SetDVRMessageCallBack_V51` + `SetupAlarmChan_V50`. HRIS add-device does **not** set panel `attendanceMode`.

## Runtime notes (not in this commit)

- Listener wrapper must not treat outbox `:30108/health` as the HRIS API (`HIKVISION_PREFER_CALLBACK_OUTBOX=0` + `53001`).
- Device A `10.184.37.21` SDK login **7** = no route from VM. Not a Select Status bug.
- DEV `hris-hikvision-watcher --apply --watch` can flood old Fingerprint Enrolled rows.

## Related

- DeviceEvent TAP taxonomy: `docs/DEVICE_EVENT_ACTIONS.md`
- Enrollment identity: `docs/HIKVISION_ENROLLMENT_IDENTITY_FLOW.md`
- Runtime: `docs/HIKVISION_RUNTIME_TRUTH.md`
