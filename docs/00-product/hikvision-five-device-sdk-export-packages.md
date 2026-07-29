# Hikvision five-device SDK export packages (CSV + Excel)

Last updated: 2026-07-29

## Local package path (in this repo tree)

Real packages with raw fingerprint/face blobs live here (gitignored via `templates/`):

```text
templates/hikvision-five-device-sdk-packages/
```

Open that folder in Explorer or the IDE. Do **not** commit the blob files.

| # | CSV | Excel | Device |
|---|---|---|---|
| 1 | `main-b-device-users.csv` | `main-b-device-users.xlsx` | Main Entrance Device B |
| 2 | `main-a-device-users.csv` | `main-a-device-users.xlsx` | Main Entrance Device A |
| 3 | `main-f-device-users.csv` | `main-f-device-users.xlsx` | Main Entrance Device F |
| 4 | `main-d-device-users.csv` | `main-d-device-users.xlsx` | Main Entrance Device D |
| 5 | `main-e-device-users.csv` | `main-e-device-users.xlsx` | Main Entrance Device E |

Also in that folder:

- `FIVE-CSV-XLSX.md` — short index
- `TALLY-AND-EXPORT-REPORT.md` / `.json` — full tally proof

Empty 7-column template (no blobs, committed):

```text
docs/00-product/hikvision-device-users-sdk-template.csv
```

## Columns (CSV / Excel `device-users` sheet)

1. `vendorUserId`
2. `displayName`
3. `userType`
4. `fingerprintStatus`
5. `rawFingerprintBlob` — multi-slot `FPn("...")` in one cell
6. `faceStatus`
7. `rawFaceBlob`

Excel also has a `manifest` sheet (device id/name/model/firmware, counts) once per file — not per row.

## Common tally (all five equal after Main B peer face fill)

| Metric | Value |
|---|---:|
| users | 874 |
| fingerprint users with raw | 825 |
| fingerprint slots | 1646 |
| face users with raw | 806 |
| face `missing_raw_blob` | 0 |
| face not enrolled | 68 |
| fingerprint not enrolled | 49 |

## Why Main B looked different

Not a different inventory. B matched A/F/D/E on users (874), FP (825 / 1646 slots), and face not-enrolled (68). B was short only on **raw face custody**: 95 enrolled faces had `missing_raw_blob` on B while the same `vendorUserId` had face bytes on A/F/D/E. Those 95 rows were filled from peer same-ID packages before export so all five tallies match. Bytes were not fabricated.

## Schema / policy

- Package schema: `project-truth.hikvision-device-users.v1`
- Import mode: existing `rawPackage` path only
- Real biometric blobs stay under `templates/` (gitignored). Do not push them to GitHub.

## Source / regenerate evidence

- Runtime source of this batch: `.runtime/five-sdk-csv-xlsx-tallied-20260729/`
- Peer face-gap matrix: `.runtime/five-sdk-b-face-gap-20260729/`
- Rebuild script used: `.runtime/five-sdk-b-face-gap-20260729/rebuild-five-csv-xlsx.js`
