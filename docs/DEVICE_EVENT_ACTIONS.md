# DeviceEvent actions — triggers, storage, post-effects

**Source of truth:** `hris-api/prisma/schema/device.prisma` enums +  
`hris-api/helper/device-event-taxonomy.helper.ts` +  
`hris-api/app/hikvision/controller/callback.controller.ts` +  
`hris-api/helper/device-person-token.helper.ts`

**No assumptions:** only paths that exist in code.

**Visual cards:** open [`docs/device-event-actions.html`](./device-event-actions.html) in a browser.

---

## 1. Two different fields (do not mix)

| Field | What it is | Examples |
|---|---|---|
| **`eventAction`** | *What happened on the device / ledger concept* | `USER_CREATED`, `FINGERPRINT_ENROLLED`, `TAP` |
| **`status`** | *HRIS processing result* | `RECEIVED`, `MATCHED`, `UNMATCHED`, `ATTENDANCE_CREATED`, `IGNORED` |
| **`source`** | *Runtime path that delivered the row* | `EN_HCNETSDK_ALARM`, `HIKVISION_CALLBACK`, `ZKTECO_EVENT` |
| **Panel Select Status** | *Hikvision T&A choice on the glass* — **not** a DeviceEvent column today | `checkIn`, `checkOut`, `breakOut`, `breakIn`, `overtimeIn`, `overtimeOut` |

Hikvision **Select Status** is a third vocabulary. Live SDK and ISAPI extract now copy it to **Device status**. Attendance `timeIn`/`timeOut` is still pair-by-time. Spec: [`docs/HIKVISION_SELECT_STATUS_MAPPING.md`](./HIKVISION_SELECT_STATUS_MAPPING.md).
| **`employeeNo`** | Plain device person id when known | `"15"` |
| **`employeeId`** | FK to HRIS `Employee` row | ObjectId or null |
| **`deviceUserId`** | FK to `DeviceUser` inventory row | ObjectId or null |

Schema (`DeviceEvent`):

```text
employeeNo   String?          // plain device person id
employeeId   String?          // Employee FK
deviceUserId String?          // DeviceUser FK
eventAction  DeviceEventAction
eventCategory DeviceEventCategory
status       DeviceEventStatus
source       DeviceEventSource
payload      Json?
```

Identity truth (your model):

```text
DeviceUser.vendorUserId = "15"
DeviceEvent.employeeNo  = "15"
Employee.deviceEmpId    = "15"      // plain
Employee.employeeId     = "00015"   // org/display code only
```

---

## 2. Who can create / update a DeviceEvent?

```text
┌─────────────────────────────────────────────────────────────────────────┐
│ ENTRY POINTS (code)                                                     │
├─────────────────────────────────────────────────────────────────────────┤
│ A. POST /api/hikvision/callback                                         │
│    • HCNetSDK listener posts source=EN_HCNETSDK_ALARM                   │
│    • Device HTTP host / watcher may post source=HIKVISION_CALLBACK      │
│    Owner: callback.controller.ts handleCallback                         │
│                                                                         │
│ B. Follow-up on the SAME callback path (not a product poller)           │
│    • scheduleOperationLogResolveAfterSdkSignal                          │
│      → ISAPI ContentMgmt/logSearch → creates typed lifecycle rows       │
│    • applyFastEnrollmentIdentityOnSdkCallback / inventory delta         │
│      → UPDATES existing rows (employeeNo, deviceUserId, status)         │
│    Owner: device-person-token.helper.ts                                 │
│                                                                         │
│ C. Admin / device API (selected)                                        │
│    • device.controller.ts paths that deviceEvent.create + emit socket   │
│      (sync import, synthetic/proof, inventory-derived lifecycle, etc.)  │
│                                                                         │
│ D. ZKTeco                                                                 │
│    • zkteco.controller → source=ZKTECO_EVENT → TAP taxonomy             │
└─────────────────────────────────────────────────────────────────────────┘
```

**Live panel enroll / tap for TEST A reverse path:** almost always **A** (SDK) then **B** (logSearch/UserInfo follow-up).

---

## 3. Schema enum — full `DeviceEventAction` list

From `device.prisma`:

| eventAction | eventCategory (typical) | Meaning |
|---|---|---|
| `TAP` | ATTENDANCE | Successful punch |
| `TAP_REJECTED` | ATTENDANCE | Failed verify |
| `USER_CREATED` | USER_MANAGEMENT | Person added on device |
| `USER_UPDATED` | USER_MANAGEMENT | Person modified on device |
| `USER_DELETED` | USER_MANAGEMENT | Person removed on device |
| `FINGERPRINT_ENROLLED` | ENROLLMENT | FP added |
| `FINGERPRINT_UPDATED` | ENROLLMENT | FP modified |
| `FINGERPRINT_DELETED` | ENROLLMENT | FP removed |
| `FACE_ENROLLED` / `FACE_UPDATED` / `FACE_DELETED` | ENROLLMENT | Face credential (enum exists; classification depends on signal) |
| `CARD_ENROLLED` / `CARD_UPDATED` / `CARD_DELETED` | ENROLLMENT | Card credential |
| `SYNC_SIGNAL` | RUNTIME | Opaque major=3 / operation-sync “something happened” |
| `SYNC_IMPORTED` | (import runs) | Imported via sync-logs style path |
| `LISTENER_RECEIVED` | UNKNOWN_VENDOR / RUNTIME | Weak/unknown listener receipt |
| `UNKNOWN` | UNKNOWN_VENDOR | Unclassified |

---

## 4. Master flow: SDK callback arrives

```text
                    POST /api/hikvision/callback
                              │
                              ▼
                    parse body → match Device row
                              │
                              ▼
                    save DeviceEvent (always if not preview)
                    taxonomy from major/minor/actionCode
                    employeeNo from payload if present
                              │
                              ▼
                    emit device-event:saved  ◄── socket #1 (liveness)
                              │
              ┌───────────────┴───────────────┐
              │                               │
    is attendance punch?              non-attendance
    (major=5 / TAP minors)            (user / enroll / major=3)
              │                               │
              ▼                               ▼
    resolve DeviceUser(vendorUserId)   schedule logSearch if SYNC_SIGNAL
    / Employee.deviceEmpId="15"        apply fast identity if plain known
              │                               │
              ▼                               ▼
    create/update Attendance           upsert DeviceUser + metadata
    status ATTENDANCE_CREATED|…        status MATCHED|UNMATCHED|IGNORED
              │                               │
              ▼                               ▼
    emit device-event:saved            emit again after identity resolve
```

---

## 5. Post-action matrix (what storage changes)

### Legend

| Symbol | Meaning |
|---|---|
| **W** | Writes / creates row |
| **U** | Updates existing row |
| **—** | Does not touch |
| **?** | Only if identity resolved / match exists |

### 5.1 Operator families you care about

| Operator name | Typical `eventAction` | Primary trigger | DeviceEvent | DeviceUser | Employee | Attendance |
|---|---|---|---|---|---|---|
| **onUserCreate** | `USER_CREATED` | SDK callback (+ often logSearch leaf `addUserInfo`) | **W** then **U** plain id | **W/U** vendorUserId=`15` + raw metadata | **?** link if `deviceEmpId="15"` | **—** |
| **onEnrollUser** | `FINGERPRINT_ENROLLED` | SDK callback (+ logSearch `addFpByEmployeeNo`) | **W** then **U** | **U** metadata / FP counts | **?** same link | **—** |
| **onAttendanceTap** | `TAP` | SDK callback major=5 auth pass | **W** then **U** status | **?** lookup only (no invent) | **?** match | **W/U** if matched |

### 5.2 Full action → storage (Hikvision callback path)

| eventAction | How taxonomy is chosen (code) | DeviceEvent | DeviceUser | Attendance | Socket |
|---|---|---|---|---|---|
| `SYNC_SIGNAL` | major=`3` or `OBSERVED_OPERATION_MINOR_*` or `biometric_operation_sync` | **W** first packet; often `status=IGNORED` + resolving | **—** until follow-up | **—** | Yes |
| `USER_CREATED` | `MINOR_ADD_USER_INFO` or logSearch `addUserInfo` | **W**; set `employeeNo` when plain known | **W/U** inventory + UserInfo raw | **—** | Yes (+ re-emit on resolve) |
| `USER_UPDATED` | `MINOR_MODIFY_USER_INFO` / modifyUserInfo leaf | **W/U** | **U** metadata | **—** | Yes |
| `USER_DELETED` | `MINOR_CLR_USER_INFO` / clearUserInfo leaf | **W** | may mark / leave inventory (no hard-delete assumed here) | **—** | Yes |
| `FINGERPRINT_ENROLLED` | `MINOR_ADD_FINGER_*` / `addFpByEmployeeNo` | **W** | **U** credential summary; templates **not** on event | **—** | Yes |
| `FINGERPRINT_UPDATED` | `MINOR_MOD_FINGER_*` | **W** | **U** | **—** | Yes |
| `FINGERPRINT_DELETED` | `MINOR_DEL_FINGER` / clear finger | **W** | **U** | **—** | Yes |
| `CARD_*` | card minors | **W** | **U** optional | **—** | Yes |
| `TAP` | FP/card pass minors / major=5 verify | **W** | lookup by `vendorUserId` | **W/U** if employee matched | Yes |
| `TAP_REJECTED` | FP fail minors | **W** | lookup optional | **—** | Yes |
| `LISTENER_RECEIVED` / `UNKNOWN` | fallback classify | **W** | **—** | **—** | Yes |

### 5.3 HRIS `status` after post-processing

| status | When set (callback path) |
|---|---|
| `RECEIVED` | Initial insert |
| `IGNORED` | Non-attendance without identity yet; missing employeeNo on tap; explicit non-attendance |
| `UNMATCHED` | Person known on device (`employeeNo=15`) but no Employee with `deviceEmpId=15` |
| `MATCHED` | Employee linked (enrollment path) |
| `ATTENDANCE_CREATED` / `ATTENDANCE_UPDATED` | Tap path wrote attendance |
| `FAILED` | Processing error |

---

## 6. Three event visualizations (callback)

### 6.1 onUserCreate

```text
PANEL: create person 15
        │
        ▼
SDK LISTENER ──POST──► /api/hikvision/callback
        │
        ├─► [always] DeviceEvent row
        │      eventAction: USER_CREATED   (or SYNC_SIGNAL first, then USER_CREATED from logSearch)
        │      source: EN_HCNETSDK_ALARM
        │      employeeNo: null → "15" when resolved
        │      payload.opaquePersonToken: keep if present
        │
        ├─► [identity] DeviceUser
        │      vendorUserId: "15"
        │      employeeNo: "15"
        │      rawPayload / vendorMetadata: UserInfo JSON
        │      employeeId: set only if Employee.deviceEmpId = "15"
        │
        ├─► [optional] Employee
        │      no create; only link if deviceEmpId matches plain "15"
        │
        └─► socket device-event:saved (1–2 times: raw then resolved)
```

**Does NOT create Attendance.**

### 6.2 onEnrollUser (fingerprint)

```text
PANEL: enroll FP for 15
        │
        ▼
SDK LISTENER ──POST──► /api/hikvision/callback
        │
        ├─► DeviceEvent
        │      eventAction: FINGERPRINT_ENROLLED
        │      employeeNo: "15" when resolved
        │
        ├─► DeviceUser (same plain "15")
        │      refresh credential counts from UserInfo
        │      FP template bytes: raw DeviceUser custody when evidenced; matching
        │      DeviceEvent payload may also retain the raw lifecycle blob
        │
        └─► socket
```

**Does NOT create Attendance.**

### 6.3 onAttendanceTap

```text
PANEL: person 15 taps OK
        │
        ▼
SDK LISTENER ──POST──► /api/hikvision/callback
        │
        ├─► DeviceEvent
        │      eventAction: TAP
        │      employeeNo: "15" (usually on ACS packet)
        │
        ├─► lookup DeviceUser vendorUserId="15"
        │      else Employee.deviceEmpId="15"
        │
        ├─► if linked Employee:
        │      Attendance CREATE/UPDATE
        │      DeviceEvent.status = ATTENDANCE_CREATED|UPDATED
        │      DeviceEvent.attendanceId set
        │   else:
        │      status = UNMATCHED (or IGNORED if no employeeNo)
        │
        └─► socket
```

**Does NOT create DeviceUser** unless other code paths do; tap path **looks up** inventory.

---

## 7. Trigger map: Hikvision signal → action

| Hikvision signal (payload / minor / leaf) | Classified eventAction | Follow-up |
|---|---|---|
| major=3 / `OBSERVED_OPERATION_MINOR_*` | `SYNC_SIGNAL` | Multipass logSearch |
| logSearch `…/addUserInfo` | `USER_CREATED` | Inventory delta / DeviceUser |
| logSearch `…/modifyUserInfo` | `USER_UPDATED` | DeviceUser update |
| logSearch `…/clearUserInfo` | `USER_DELETED` | — |
| logSearch `…/addFpByEmployeeNo` | `FINGERPRINT_ENROLLED` | DeviceUser enrich |
| `MINOR_ADD_USER_INFO` | `USER_CREATED` | Fast identity if plain present |
| `MINOR_ADD_FINGER_BY_EMPLOYEE_NO` | `FINGERPRINT_ENROLLED` | Fast identity if plain present |
| `MINOR_FINGERPRINT_COMPARE_PASS` / minor 38 | `TAP` | Attendance if matched |
| FP fail minors | `TAP_REJECTED` | No attendance |

---

## 8. Endpoint vs SDK (same callback, different sources)

| Caller | Typical HTTP | `source` value | Notes |
|---|---|---|---|
| HCNetSDK Linux listener | `POST /api/hikvision/callback` JSON | `EN_HCNETSDK_ALARM` | Primary live path for TEST A reverse tunnel |
| Device HTTP host / legacy watcher | same route (XML/JSON) | `HIKVISION_CALLBACK` | Still `handleCallback` |
| Admin ISAPI proxy e.g. UserInfo/Search | `/api/hikvision/access-control/...` | — | Does **not** itself write DeviceEvent unless another path does |
| logSearch resolve | internal after SDK signal | new rows often `HIKVISION_CALLBACK` or tagged payload | Creates lifecycle rows after signal |

Preview: `?preview=true` / `dryRun=true` on callback → **no DeviceEvent write**.

---

## 9. Socket contract

Every successful save/update that calls `emitDeviceEventSaved`:

```text
event name: device-event:saved
rooms: device-events:org:<organizationId>
       device-events:device:<deviceId>
payload: { eventId, status, source, event: { employeeNo, employeeId, eventAction, … } }
```

UI Device Events listens for this to append/update rows without full refresh.

---

## 10. Quick “what will happen if…”

| If this happens on panel | First storage write | Later storage | Attendance? |
|---|---|---|---|
| Create user `15` | DeviceEvent (`SYNC_SIGNAL` and/or `USER_CREATED`) | DeviceUser `15` + plain on event | No |
| Enroll FP for `15` | DeviceEvent `FINGERPRINT_ENROLLED` | DeviceUser metadata | No |
| Tap as `15` with HRIS employee `deviceEmpId=15` | DeviceEvent `TAP` | Attendance row | **Yes** |
| Tap as `15` with no Employee | DeviceEvent `TAP` UNMATCHED | — | No |
| Major=3 only | DeviceEvent `SYNC_SIGNAL` IGNORED | logSearch typed rows | No |

---

## 11. Code map

| Concern | File |
|---|---|
| Enums | `hris-api/prisma/schema/device.prisma` |
| Classify action | `hris-api/helper/device-event-taxonomy.helper.ts` |
| Callback entry | `hris-api/app/hikvision/routes/callback.router.ts` → `callback.controller.ts` |
| Attendance vs not | `isHikvisionAttendancePunchEvent` in `hikvision-event-contract.helper.ts` |
| Identity + DeviceUser | `device-person-token.helper.ts` |
| Socket | `device-event-realtime.helper.ts` |
| Identity model docs | `docs/HIKVISION_ENROLLMENT_IDENTITY_FLOW.md` |

---

## 12. Related HTML visualizations

| File | Content |
|---|---|
| `docs/device-event-actions.html` | This doc as interactive cards |
| `docs/hikvision-callback-event-flows.html` | Create / enroll / tap identity model |
