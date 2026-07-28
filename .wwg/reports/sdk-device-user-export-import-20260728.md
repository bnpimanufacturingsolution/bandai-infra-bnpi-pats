# SDK Device-User Export / Import Evidence — 2026-07-28

Status: `PARTIALLY_FULFILLED` pending a newly added compatible target device.

## Product contract implemented

- Existing package schema remains `project-truth.hikvision-device-users.v1`.
- Existing export/import endpoints and `rawPackage` execute path remain authoritative.
- CSV/Excel now project exactly:
  `vendorUserId,displayName,userType,fingerprintStatus,rawFingerprintBlob,faceStatus,rawFaceBlob`.
- Multiple fingerprint slots remain in one cell as `FPn("...")`.
- Source device identity, model, firmware, serial, schema version, and export time stay at package/device-manifest level rather than repeating per user.
- New exports omit per-user HRIS identity/link objects; import maps missing `employeeNo` from `vendorUserId` internally and continues accepting older packages/CSV rows.
- `rawPackage` no longer reports `imported` merely because at least one fingerprint write was attempted. Fingerprint and face retention are evaluated independently, and any requested unverified modality fails the row.
- Import preview surfaces conflicts before capped matching rows. Preview and execute now fail closed while any conflict exists.

## Fresh source proof

Evidence root: `.runtime/sdk-export-import-20260728-152250/`.

- Source: Main Entrance Device B, `cmpxw13hx002h7zwso7dyedrn`, `10.184.37.20:443`.
- Authenticated health: device API readable; SDK user inventory readable.
- Fresh export preview source count: 874.
- Fresh actual export source count: 874.
- Exported rows: 874; unique SDK IDs: 874; duplicates: 0.
- Fingerprint: 819 raw-present users, 1,634 decoded slots, 46 `not_enrolled`, 9 `missing_raw_blob`.
- Face: 313 raw-present users, 313 decoded blobs, 68 `not_enrolled`, 493 `missing_raw_blob`.
- Row audit: 874 valid, 0 invalid, 0 cross-modality blob reuse, 0 invalid base64.
- The audit reads, decodes, round-trips, and hashes every full blob value. It records per-row lengths and SHA-256 without duplicating biometric bytes outside the protected package.

## Import gate

- Main Entrance A non-mutating preview of the 874-row package: 0 new, 873 match, 1 conflict.
- Current authenticated inventory-readable Main Entrance A/B/D/E/F panels each already contain 874 users.
- Main Entrance C, TEST A, and TEST B are not currently inventory-readable.
- Therefore no current device is a safe blank target for the requested future-device restore. No canary or full write was started. Treating an existing populated panel as the new device would violate the conflict/overwrite gate.

## Validation

- Backend SDK row-audit tests: 4 passing.
- Backend Hikvision biometric contract: 34 passing.
- Frontend device-user UI contract: 1 passing.
- Targeted backend ESLint: 0 errors.
- Targeted frontend ESLint: 0 errors; existing warnings remain.
- Full API/app typechecks remain red on pre-existing unrelated attendance, migration, PDF, middleware, dashboard, calendar, and legacy device-service errors. No new type error remains in the SDK audit helper.
- No real biometric blob or secret is tracked by Git.

## Remaining physical boundary

When the additional device exists and is inventory-readable, rerun its live model/firmware compatibility probe, freeze it, back it up, preview the smallest FP/face canary, reject conflicts, execute with a fresh token and `biometricTransferMode="rawPackage"`, then physically reread fingerprint slots and face independently before full import.
