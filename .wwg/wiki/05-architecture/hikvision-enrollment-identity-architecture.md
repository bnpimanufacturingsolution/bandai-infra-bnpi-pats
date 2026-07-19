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
| HRIS employee | `Employee` | `deviceEmpId` often **5-digit pad** (`00015`) |
| Opaque map | `DevicePersonToken` | opaque log token → plain |

## Required behaviors

1. Socket quickly on save (liveness).
2. Never show opaque tokens as employee numbers.
3. Upsert DeviceUser for new plains as soon as UserInfo inventory sees them.
4. Link Employee when pad-aware deviceEmpId/employeeId match succeeds.
5. Device Events “Device user” navigates by plain id; employee link uses HRIS employee.

## Related

- Biometric peer-sync target: `./hikvision-biometric-sync-architecture.md`
- Runtime evidence: `docs/HIKVISION_RUNTIME_TRUTH.md`
- Terminology: DeviceUser, Device events, Evidence source, Sync logs vs Sync device users
