# Hikvision UAT Temporary Seed Proof - 2026-06-30

Source type: runtime verification note

## Summary

UAT K3s runtime was temporarily seeded with Hikvision employee mappings for
device employee numbers `1` through `5`.

## Runtime Evidence

- UAT device row: `cmqqv5x45002ele3dqt3a233i`
- UAT organization: `cmqqv5whf0000le3de5dumtze`
- Device name: `Main Entrance Device`
- Device target after correction: `192.168.254.181:80` / `http`
- Temporary employees:
  - `UAT-HIK-001`, `deviceEmpId=1`
  - `UAT-HIK-002`, `deviceEmpId=2`
  - `UAT-HIK-003`, `deviceEmpId=3`
  - `UAT-HIK-004`, `deviceEmpId=4`
  - `UAT-HIK-005`, `deviceEmpId=5`
- Callback-shaped test event:
  - source `HIKVISION_CALLBACK`
  - major `5`
  - minor `38`
  - employee no. `1`
  - event time `2026-06-30T16:17:07+08:00`
  - device IP `192.168.254.181`
- Saved device event: `cmr0hh22y0025nq011uukvetx`
- Saved status: `ATTENDANCE_CREATED`
- Matched employee: `uat-temp-hikvision-employee-1`
- Created attendance: `cmr0hh27a0027nq01elxja5k7`

## Browser Evidence

Playwright headless screenshot:

```text
.runtime/browser-evidence/screenshots/hikvision-uat-device-events-temp-seed.png
```

The screenshot shows the UAT admin saved-events page with `UAT Hikvision Temp
Test 1`, no. `1`, `Main Entrance Device`, `192.168.254.181`, and save path
`Device callback`.

## Boundary

This is temporary UAT seed proof and callback-shaped ingestion proof. It is not
permanent enrollment truth. It also does not prove UAT K3s pod-to-device
network reachability; the UAT API pod health check returned `EHOSTUNREACH` for
`192.168.254.181:80`.
