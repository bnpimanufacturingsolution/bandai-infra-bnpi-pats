# Device Event TAP display + person-10 inventory (2026-08-17)

**Task mode:** bug fix + truth sync (docs).  
**Code commit:** `a6dce32` on `develop` (pushed before the operator said stop pushing).  
**Do not push** further unless the operator asks.

## Operator question this answers

The Device D tap for **Zen Andrei / person 10 / serial 9652** already wrote attendance. The **other info** on the row (Unknown Vendor, Unknown action, Unknown evidence, Direct evidence No, DeviceUser still unmatched) was wrong. This pack records what we changed and what we did **not** change.

## Current-state

| Surface | Before | After (local API proof) | Care? |
|---|---|---|---|
| Event `cmsr688py002xvxwwttxhdsal` serial 9652 | Stored `UNKNOWN_VENDOR` / `UNKNOWN` | GET returns `ATTENDANCE` / `TAP` / label Fingerprint attendance punch | Yes — this is the screenshot |
| Evidence on that row | Missing → UI “Unknown evidence” / Direct No | `SDK_CALLBACK` + `directDeviceEvidence=true` | Yes |
| HRIS result | Attendance updated `cmsr4ngt2011jvxj4wardyw9f` | Unchanged | Attendance was already correct |
| DeviceUser 10 on B/D/E | UNMATCHED `uzaro_zen` | Linked ACTIVE → employee `00010` Zen Andrei | Inventory now matches the tap |
| Other unmatched DeviceUsers | 50 with no HRIS employee | Unchanged | Do not invent employees |

## What is true (do not mix)

| Vocabulary | Example on this tap | Not the same as |
|---|---|---|
| Panel Select Status | Check Out | TAP / PRESENT |
| `DeviceEvent.eventAction` | **TAP** after classify | Unknown Vendor |
| `DeviceEvent.status` (HRIS result) | `ATTENDANCE_UPDATED` | Category/action |
| ACS major/minor | **5 / 38** = real punch | **2 / 38** = armed-device exception, not a punch |
| Device person id | `10` | `01515` (Rheyjie) is a different person |
| `Employee.employeeId` | `00010` | pad of `10`, not of `01515` |
| DeviceUser inventory | row vendor `10` on each device | Event list “Matched HRIS” badge (can hydrate employee without a DeviceUser link) |

## Residual: unmatched DeviceUsers (Device B at census)

| Bucket | Count | What it is | Blocker | Next |
|---|---:|---|---|---|
| Person 10 B/D/E | 3 rows | Linked this session to `00010` | done | — |
| No HRIS employee | 48 | Panel ids with no `deviceEmpId` / `employeeId` hit | `optional_product` / data | Leave unmatched |
| Test-like ids | 2 | `t18rt124015`, `t18stay63721` | `optional_product` | Leave unmatched |

Do **not** treat “51 unmatched” as “taps do not work.” Person 10 tapped and attendance updated while DeviceUser was still unmatched.

## Code (commit `a6dce32`)

| Path | Behavior |
|---|---|
| `classifyDeviceEvent` | major=2 + minor 38 → `DEVICE_HEALTH` / `LISTENER_RECEIVED`. major≠2 + fingerprint-pass / minor 38 → `ATTENDANCE` / `TAP`. |
| `resolveDeviceEventDisplayTaxonomy` | If stored category/action is empty / `UNKNOWN` / `UNKNOWN_VENDOR`, use live classify. |
| `ensureSdkCallbackEvidence` | `source=EN_HCNETSDK_ALARM` and missing evidence → `SDK_CALLBACK` + `directDeviceEvidence=true`. |
| GET `/api/device/events` | Returns display taxonomy + stamped evidence; **list** GET background-heals stale stored columns when classify is not UNKNOWN. |
| GET `/api/device/events/item/:eventId` | Same display overlay + evidence stamp. **Does not** write healed columns. |
| Device Events UI | If stored action/category is Unknown, show taxonomy TAP. SDK source fills evidence even if payload omitted it. |
| Hikvision callback | `resolveLinkedEmployeeForDevicePerson` (deviceEmpId **or** padded employeeId). On match, `upsertDeviceUserInventoryStub` and set `deviceUserId` on the event. |

## Live proof (local API, same DEV DB)

```text
GET /api/device/events … Device D, person 10, serial 9652
id=cmsr688py002xvxwwttxhdsal
eventAction=TAP eventCategory=ATTENDANCE
evidenceSource=SDK_CALLBACK directDeviceEvidence=true
employeeNo=10 attendanceId=cmsr4ngt2011jvxj4wardyw9f
```

DeviceUser link (admin `POST /api/device/users/:id/link`, not a panel write):

| Device | DeviceUser id | After |
|---|---|---|
| B | `cmritozpr01ori001wheuffq2` | ACTIVE → `00010` |
| D | `cmrj4yi4v005x7zhg07pen3e8` | ACTIVE → `00010` |
| E | `cmrkcno7u00y87zas1w1dtdwn` | ACTIVE → `00010` |

Employee: `cmspnnxot02s5qw01yk7yy2er` / `00010` / `deviceEmpId=10` / Zen Andrei.

## Tests

- `hris-api/tests/device-event-taxonomy.helper.spec.ts` — 11 passing, including stale UNKNOWN punch → TAP and SDK evidence stamp.
- Focused callback tests for persist skip of major=2 and serial collapse — passing.
- Device Events page contract: new string guards for `UNKNOWN_VENDOR` fallback and SDK evidence. One **pre-existing** fail remains (`? 2_000` socket interval) — not this change.

## Deploy / push boundary

| Claim | Status |
|---|---|
| Commit on `origin/develop` | `a6dce32` was pushed **before** the operator said stop pushing |
| Further git push | **Banned** unless the operator asks |
| Public DEV UI | Shows new labels only after K3s/API runs `a6dce32` |
| Local GET | Already proved TAP for 9652 |
| Person 10 DeviceUser link | On the DEV database now, independent of image roll |

## Hard bans for later agents

- Do not map person `10` to `01515`. `01515` is Rheyjie (`deviceEmpId=1515`).
- Do not auto-link the remaining unmatched DeviceUsers without an employee hit and operator proof.
- Do not treat TAP chip = 0 as “no tap” while stored action is still UNKNOWN on unhealed rows.
- Do not treat major=2 / minor=38 empty-person rows as clock-ins.

## Related

- Duplicate / major=2 keep-alive: `.runtime/device-event-dup-20260817/`
- Select Status: `docs/HIKVISION_SELECT_STATUS_MAPPING.md`
- Enrollment identity pad rule: `docs/HIKVISION_ENROLLMENT_IDENTITY_FLOW.md`
