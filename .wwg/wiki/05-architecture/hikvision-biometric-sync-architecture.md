# Hikvision Biometric Sync Architecture

Status: TARGET_ARCHITECTURE_PENDING_IMPLEMENTATION
Task mode: Docs-only architecture intake
Last updated: 2026-07-09

## Purpose

Project Truth needs a Linux/VM-owned Hikvision biometric service that uses the
official Linux HCNetSDK alarm callback path for enrollment/user-change events,
then reconciles users and fingerprint templates between Hikvision terminals and
the HRIS web app.

The Windows reference source is local-only implementation evidence:

```text
C:\Users\anoni\OneDrive\Desktop\HRIS-PROJECT\EN-HCNetSDKV6.1.9.4_build20220412_win64\AlarmDemo.cpp
```

That file should be treated as a behavior reference, not as a naming or runtime
shape to preserve. Future Linux files should use Project Truth names such as
`hikvision-biometric-service`, `hikvision-alarm-listener`, or
`hcnetsdk-biometric-sync`, not `AlarmDemo`.

## Current Evidence

- `vendor/hikvision-linux` is the active repo-owned Hikvision Linux scaffold.
- Linux HCNetSDK `V6.1.9.48` has been downloaded, extracted, copied to the VM,
  compiled against, initialized, and queried for SDK/build version.
- Linux SDK login/alarm callback is still not proven in Project Truth because
  the previous SDK login returned `NET_DVR_PASSWORD_ERROR (1)`.
- The Windows reference code proves the desired behavior shape:
  multi-device login, `NET_DVR_SetDVRMessageCallBack_V51`,
  `NET_DVR_SetupAlarmChan_V41`, ACS alarm classification, user sync,
  fingerprint read/write, broker enrollment, event-triggered reconcile, and
  cleanup.
- The current HRIS callback path is `/api/hikvision/callback`; accepted event
  sources include `HIKVISION_CALLBACK` and `EN_HCNETSDK_ALARM`.
- The Linux service path should post SDK alarm events to `/api/hikvision/callback`
  and let the existing callback controller persist `DeviceEvent` rows, update
  attendance/timesheet projections where applicable, and emit
  `device-event:saved`.

## Target Components

1. Linux Hikvision biometric service
   - Runs inside the Linux VM/runtime path.
   - Loads configured Hikvision devices from HRIS `Device` rows.
   - Uses SDK port `8000` for HCNetSDK login/alarm channels.
   - Uses HTTP/ISAPI port `80` only for supported read/write API calls when
     that path is the safer or already-proven route.
   - Keeps proprietary SDK binaries as local runtime inputs, not committed repo
     files.

2. Alarm callback listener
   - Registers `NET_DVR_SetDVRMessageCallBack_V51`.
   - Arms each logged-in device with an alarm channel.
   - Parses `COMM_ALARM_ACS` / `NET_DVR_ACS_ALARM_INFO`.
   - Classifies attendance, user-management, and fingerprint-management events.
   - Queues reconciliation work instead of doing long template transfer inside
     the callback thread.

3. Biometric reconciliation worker
   - Reads source user records and fingerprint templates after an enrollment or
     user-change event.
   - Syncs the source employee/device user to the other configured biometric
     devices.
   - Writes durable HRIS state and audit evidence.
   - Supports dry-run/recon mode before mutation.

4. HRIS API contract
   - Persists per-device biometric enrollment metadata on the employee/user
     model or the existing `DeviceUser` architecture.
   - Exposes safe admin status, recon, add/delete device, and
     activation/deactivation operations.
   - Keeps raw biometric templates protected. Do not store or expose raw
     fingerprint templates without an explicit security/encryption design.

## Event Flow: Biometrics To Web App

### Enrollment / User Change

1. Employee is enrolled or changed on one Hikvision terminal.
2. HCNetSDK alarm callback receives an ACS operation event.
3. Listener classifies the event as one of:
   - user added/modified/deleted;
   - card added/modified/deleted;
   - fingerprint added/modified/deleted;
   - generic config/user-management change needing reconciliation.
4. Listener queues a reconcile job for the source device and employee/device
   user.
5. Worker reads source user data and fingerprint templates from the source
   device.
6. Worker syncs the user/template to peer biometric devices.
7. Worker updates HRIS durable state.

Candidate API shape from the user request:

```http
PUT /user
```

Candidate body:

```json
{
  "employeeID": "XXX-00021",
  "devices": [
    {
      "deviceId": 1,
      "deviceUserId": "XXX00021",
      "fingerprintData": "base64encodedfingerprintdata"
    },
    {
      "deviceId": 2,
      "deviceUserId": "XXX00021",
      "fingerprintData": "base64encodedfingerprintdata"
    },
    {
      "deviceId": 3,
      "deviceUserId": "XXX00021",
      "fingerprintData": "base64encodedfingerprintdata"
    }
  ]
}
```

Implementation note: Project Truth already has `DeviceUser` as the durable
device identity/enrollment record. The final implementation should either
extend `DeviceUser`/employee metadata for biometric template references or
document why a separate encrypted biometric model is required. Do not silently
add raw template storage to the normal `User` table.

### Attendance / Timesheet

1. Employee verifies on a terminal.
2. Callback or bounded device-log sync receives an attendance event.
3. The Linux HCNetSDK service queues and posts the alarm payload to
   `/api/hikvision/callback` with source `EN_HCNETSDK_ALARM`.
4. HRIS resolves the employee through `DeviceUser` first, then legacy
   `Employee.deviceEmpId` fallback.
5. HRIS persists the raw/effective attendance ledger and timesheet-facing data.
6. HRIS emits `device-event:saved` so the admin saved-events UI can update from
   the real saved row.

Candidate API shape from the user request:

```http
POST /timesheet
```

Implementation note: existing attendance/timesheet source-of-truth rules still
apply. `Attendance` is the biometric/raw/effective clock ledger, while
timesheet lines are the payroll/submission-facing projection.

### Login / Employee Portal

Candidate API shape from the user request:

```http
GET /user
```

Target intent: validate that an employee has an active fingerprint enrollment
for Employee Portal access or identity status.

Boundary: Project Truth should not claim web-app-side fingerprint matching until
a matcher, security model, and template custody design are proven. The safer
default is device-side verification plus HRIS enrollment/status validation.

## Event Flow: Web App To Biometrics

Required admin capabilities:

- validation/reconciliation script for device-vs-HRIS data;
- admin status page for device login/alarm/reconcile state;
- add/delete biometric device;
- activate/deactivate device participation;
- preview/dry-run before user/template writes;
- typed confirmation and audit trail for destructive operations.

Add/delete user and template writes must be treated as high-risk until backup,
restore, rollback, and audit evidence exist.

## Linux Refactor Guidance

Port behavior from the Windows reference code, not the old demo identity:

- Convert `DeviceConfig` / `DeviceSession` to Linux service config and session
  types.
- Keep callback work minimal and queue reconciliation.
- Preserve cleanup for alarm channel close, logout, SDK cleanup, and signal
  handling.
- Preserve user/fingerprint operation classification, especially
  `MINOR_ADD_FINGER_BY_CARD`, `MINOR_ADD_FINGER_BY_EMPLOYEE_NO`,
  `MINOR_MOD_FINGER_BY_CARD`, `MINOR_MOD_FINGER_BY_EMPLOYEE_NO`, and
  `MINOR_DEL_FINGER`.
- Preserve fingerprint read/write primitives:
  `NET_DVR_GET_FINGERPRINT_CFG_V50`, `NET_DVR_SET_FINGERPRINT_CFG_V50`, and
  broker capture where supported.
- Emit JSON lines evidence for login, callback registration, alarm arm,
  enrollment event receipt, reconciliation result, HRIS API response, and
  cleanup.

## Validation Gates

Do not call this architecture implemented until evidence proves:

1. Linux VM can log into the active configured Hikvision device through SDK
   port `8000`.
2. Linux service registers callback and arms alarms.
3. A real enrollment/user-change event reaches the callback.
4. The event queues reconcile without blocking the callback.
5. Dry-run shows exactly which HRIS records and peer devices would change.
6. A controlled execute pass syncs one test user/template to a peer device.
7. HRIS persists the resulting `DeviceUser`/biometric metadata.
8. Attendance events still flow to `Attendance`/timesheet projections.
9. Admin status page/API shows device, alarm, and reconcile health.
10. VM/LAN/GitOps/runtime proof is captured without disabling the
    VM-managed Cloudflare Tunnel.

## Boundaries

- This is target architecture, not current production runtime truth.
- Linux HCNetSDK callback proof is still missing.
- Raw fingerprint template storage is not approved without explicit encryption,
  access-control, and retention rules.
- Destructive device operations are not approved without backup/recovery proof.
