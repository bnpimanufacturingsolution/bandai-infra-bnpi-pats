# Hikvision five-device SDK export packages (CSV + Excel)

Last updated: 2026-08-03

## Local package path (in this repo tree)

Real packages with raw fingerprint/face blobs live here (gitignored via `templates/`):

```text
templates/hikvision-five-device-sdk-packages/
```

Same path on the Project Truth VM host checkout:

```text
/opt/project-truth/templates/hikvision-five-device-sdk-packages/
```

Open that folder in Explorer or the IDE. Do **not** commit the blob files.

## Six import-ready templates (current durable host install)

| # | CSV | Purpose |
|---|---|---|
| 1 | `main-a-device-users.csv` | Main Entrance Device A |
| 2 | `main-b-device-users.csv` | Main Entrance Device B |
| 3 | `main-d-device-users.csv` | Main Entrance Device D |
| 4 | `main-e-device-users.csv` | Main Entrance Device E |
| 5 | `main-f-device-users.csv` | Main Entrance Device F |
| 6 | `unique-richest-device-users.csv` | Unique people package (richest blob pick across fleet) |

Also in that folder:

- `main-*-device-users.export.json` — original API export responses per device
- `fleet-all-devices-REAL-BLOBS.csv` — full 5-device fleet projection
- `source-20260727-sync-export-blobs/` — exact recovered VM `/tmp` originals
- `FIVE-CSV-XLSX.md` — short index
- `TALLY-AND-EXPORT-REPORT.md` / `.json` — full tally proof for this install
- `BLOB-QA-REPORT.json` — original QA report from the recovered batch

Empty 7-column template (no blobs, committed):

```text
docs/00-product/hikvision-device-users-sdk-template.csv
```

## Columns (CSV import projection) — 5 columns

1. `vendorUserId`
2. `displayName`
3. `userType`
4. `rawFingerprintBlob`
5. `rawFaceBlob`

**No separate status columns.** Enrollment state is obvious from the blob cell:

| Blob cell value | Meaning |
|---|---|
| `FP1("base64")` / `FP1(...);FP2(...)` | fingerprint enrolled + raw present |
| face base64 (e.g. `/9j/...`) | face enrolled + raw present |
| `not_enrolled` | no enrollment on device for that modality |
| `missing_raw_blob` | device reports enrollment, but host has no exportable bytes |

### Fingerprint cell standard (2026-08-03)

Always `FPn("...")` when present (never plain base64). Generator: `bnpi-pats-api/scripts/project-five-device-sdk-csv.mjs`.

Host packages:

```text
templates/hikvision-five-device-sdk-packages-standardized/
templates/hikvision-five-device-sdk-packages/
```

### Overnight import to a reachable panel (agent-owned)

When importing Main A CSV into a host-reachable Hikvision (e.g. `192.168.18.35`) via reverse tunnel + Sync Center `rawPackage`:

```text
docs/00-product/AGENT-PROMPT-overnight-import-main-a-csv-to-reachable-hikvision-192-168-18-35.md
```

## Current durable tallies (recovered 2026-07-27 batch)

| Device | Users | FP raw | FP missing | FP none | Face raw | Face missing | Face none |
|---|---:|---:|---:|---:|---:|---:|---:|
| Main Entrance Device A | 865 | 818 | 44 | 3 | 319 | 520 | 26 |
| Main Entrance Device B | 865 | 818 | 23 | 24 | 308 | 476 | 81 |
| Main Entrance Device D | 865 | 817 | 45 | 3 | 337 | 503 | 25 |
| Main Entrance Device E | 865 | 818 | 0 | 47 | 706 | 91 | 68 |
| Main Entrance Device F | 865 | 819 | 0 | 46 | 274 | 520 | 71 |
| Unique richest package | 865 | 819 | — | — | 797 | — | — |

Use **Main E** or **unique-richest** when you need the densest face custody for later import to a blank/compatible target device.

## Historical July-28/29 accepted batch (docs only; files were missing on VM)

Earlier operator work accepted a later five-device package set with equal tallies after Main B peer face fill:

| Metric | Value |
|---|---:|
| users | 874 |
| fingerprint users with raw | 825 |
| fingerprint slots | 1646 |
| face users with raw | 806 |
| face `missing_raw_blob` | 0 |
| face not enrolled | 68 |
| fingerprint not enrolled | 49 |

On 2026-08-03 those final package files were **not present** under `templates/` or `.runtime/` on the VM. What remained was `/tmp/sync-export-blobs` (865-user real-blob batch). That evidence was promoted into durable host `templates/` so it survives reboot and is available for later `rawPackage` import.

## Why Main B looked different (July-28 historical note)

Not a different inventory. B matched A/F/D/E on users (874), FP (825 / 1646 slots), and face not-enrolled (68). B was short only on **raw face custody**: 95 enrolled faces had `missing_raw_blob` on B while the same `vendorUserId` had face bytes on A/F/D/E. Those 95 rows were filled from peer same-ID packages before export so all five tallies match. Bytes were not fabricated.

## Schema / policy

- Package schema: `project-truth.hikvision-device-users.v1`
- Import mode: existing `rawPackage` path only
- Real biometric blobs stay under `templates/` (gitignored). Do not push them to GitHub.
- Physical import remains blocked until a compatible blank/target device is available.

## Source / regenerate evidence

- Durable host install source: VM `/tmp/sync-export-blobs` → `templates/hikvision-five-device-sdk-packages/`
- Installer used: `.runtime/install-host-templates.py`
- WWG report: `.wwg/reports/sdk-device-user-export-import-20260728.md`
- Historical runtime sources (if recreated later): `.runtime/five-sdk-csv-xlsx-tallied-20260729/`, `.runtime/five-sdk-b-face-gap-20260729/`
