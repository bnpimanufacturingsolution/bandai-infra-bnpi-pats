---
type: architecture
status: active
mutability: medium
scope: hikvision-enrollment-identity
last_reviewed: 2026-07-19
---

# Hikvision enrollment identity architecture

Canonical long-form operator/spec document (diagrams, acceptance, code map):

**`docs/HIKVISION_ENROLLMENT_IDENTITY_FLOW.md`**

## One-line truth

Live enroll path is **HCNetSDK ACS callback → `/api/hikvision/callback` → DeviceEvent + socket**; plain device person id and DeviceUser inventory are resolved **on that path or seconds later via logSearch + UserInfo inventory delta** — not by inventing people from polling alone.

## Identity planes

| Plane | Record | Person key |
|---|---|---|
| Device inventory | `DeviceUser` | plain `vendorUserId` (e.g. `15`) |
| Event ledger | `DeviceEvent` | plain `employeeNo` when resolved; keep opaque in payload |
| HRIS employee | `Employee` | `deviceEmpId` plain when used as device match (`15`); `employeeId` may carry leading-zero business code (`00015`) |
| Opaque map | `DevicePersonToken` | opaque log token → plain |

## Required behaviors

1. Socket quickly on save (liveness).
2. Never show opaque tokens as employee numbers.
3. Upsert DeviceUser for new plains as soon as UserInfo inventory sees them.
4. Link Employee when exact `deviceEmpId` or accepted `employeeId` pad-variant match succeeds.
5. Device Events “Device user” navigates by plain id; employee link uses HRIS employee.

## Current operator note

`project-truth-db-access` / Cloudflare / SSH helper access is not a general route
to the Hikvision private LAN. ICMP ping to a reverse-bridged panel (current
Device 5 `192.168.1.136`, or the 2026-07-19 TEST A example `192.168.254.102`)
can fail with TTL expiry while HRIS DB/API access is still healthy. The accepted
pattern is selected TCP reverse forwards or a site agent on the device LAN
posting callback evidence to HRIS.

## Related

- Biometric peer-sync target: `./hikvision-biometric-sync-architecture.md`
- Panel Select Status / clock in-out (not person id): `./hikvision-select-status-attendance.md`
- Runtime evidence: `docs/HIKVISION_RUNTIME_TRUTH.md`
- Terminology: DeviceUser, Device events, Evidence source, Sync logs vs Sync device users
