---
type: architecture
status: active
mutability: medium
scope: hikvision-select-status-attendance
last_reviewed: 2026-08-13
---

# Hikvision Select Status (attendance direction)

Canonical long-form spec:

**`docs/HIKVISION_SELECT_STATUS_MAPPING.md`**

Audit: `.wwg/reports/hikvision-select-status-audit-20260813.md`

## One-line truth

Panel **Select Status** is Hikvision T&A. Live SDK and ISAPI copy it to Device Events. When Check In/Out is present, timesheet Time In/Out follows the panel. Unsigned punches still pair by time.

## Planes (do not mix)

| Plane | Record / field | Meaning |
|---|---|---|
| Device T&A | ISAPI `attendanceStatus` + `label`; SDK `byAttendanceStatus` | Six-way panel Select Status |
| Event ledger | `DeviceEvent.eventAction` | `TAP` / enroll / … |
| API projection | `panelSelectStatus` `{ code, label, present }` | Display / extract |
| Day attendance | `Attendance.status` + `timeIn` / `timeOut` | PRESENT / INCOMPLETE; pair-by-time |

## Required agent behavior

1. Live ACS callbacks **do** carry Check In/Out after the 2026-08-13 C++ copy when extend is present and T&A is on.
2. Do not treat callback-controller `attendanceStatus` (PRESENT/INCOMPLETE) as panel status.
3. Do not treat `currentVerifyMode` as in vs out.
4. Panel `checkIn`/`checkOut` drive Time In/Out when present. Do not treat Break/OT as payroll OT.
5. Break/OT panel labels are not payroll OT and not schedule `timeBreak`.

## Related

- Enrollment identity: `./hikvision-enrollment-identity-architecture.md`
- REC implemented: `REC-20260813-HIKVISION-SDK-ATTENDANCE-STATUS-WIRE`
- REC still Proposed: `REC-20260813-HIKVISION-SELECT-STATUS-BNPI-PATS-MAP`
