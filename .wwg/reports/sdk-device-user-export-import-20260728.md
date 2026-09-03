# Five-Device SDK Device-User Export / Import Evidence — 2026-07-28

Status: `PACKAGES_AND_PREVIEWS_FULFILLED_PHYSICAL_IMPORT_BLOCKED_BY_MISSING_TARGET_DEVICE`.

## Governed contract

- Existing schema remains `project-truth.hikvision-device-users.v1`.
- Existing Device Users export, import preview/execute, `rawPackage`, biometric
  backfill, and physical SDK reread paths remain authoritative.
- Each readable projection has exactly:
  `vendorUserId,displayName,userType,fingerprintStatus,rawFingerprintBlob,faceStatus,rawFaceBlob`.
- Package/device metadata occurs once in the manifest. No HRIS identity columns
  or duplicate `employeeNo` column were added.
- Counts, URLs, status fields, and peer identities were never converted into
  biometric bytes.

## Final physical inventory

Evidence: `.runtime/five-device-final-inventory-20260728/`.

Two complete agreeing reads were accepted for B/A/F/D. Main E's incomplete
parallel read (844/874) was discarded; two new serialized reads then agreed.

| Device | Unique IDs | Duplicates | FP users | FP slots | Face users | Face slots | Hash |
|---|---:|---:|---:|---:|---:|---:|---|
| B | 874 | 0 | 825 | 1,646 | 806 | 806 | `707e8800…6223d1` |
| A | 874 | 0 | 825 | 1,646 | 806 | 806 | `707e8800…6223d1` |
| F | 874 | 0 | 825 | 1,646 | 806 | 806 | `707e8800…6223d1` |
| D | 874 | 0 | 825 | 1,646 | 806 | 806 | `707e8800…6223d1` |
| E | 874 | 0 | 825 | 1,646 | 806 | 806 | `707e8800…6223d1` |

All five are `DS-K1T341CMFW`, firmware `V3.3.40`, with distinct serials.

## Recovery and final packages

Evidence root:
`.runtime/five-device-sdk-packages-final-accepted-20260728/`.

- Fingerprint same-device recovery completed on the exact missing scopes.
- Face same-device recovery completed on A/F/D/E.
- B recovered from 313 to 711 readable face blobs. Its remaining 95 rows are
  explicit `missing_raw_blob`; the device returned physical face-picture 404s.
  Sample IDs: `5, 6, 9, 50, 105, 147, 153, 166, 411, 432`.
- Transient face capture failures F `916` and B `997` succeeded on exact retry.
- A user `10` and F user `12` exposed duplicate stale FP slots. Fresh physical
  counts were separated from saved custody; F reparsed as two unique slots and
  A's stale count/blob was omitted because the final physical inventory reports
  no enrollment for that stale row.

| Device | Rows | Raw FP users/slots | FP missing | FP not enrolled | Raw face users | Face missing | Face not enrolled | Invalid rows |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| B | 874 | 825 / 1,646 | 0 / 0 | 49 | 711 | 95 | 68 | 0 |
| A | 874 | 825 / 1,646 | 0 / 0 | 49 | 806 | 0 | 68 | 0 |
| F | 874 | 825 / 1,646 | 0 / 0 | 49 | 806 | 0 | 68 | 0 |
| D | 874 | 825 / 1,646 | 0 / 0 | 49 | 806 | 0 | 68 | 0 |
| E | 874 | 825 / 1,646 | 0 / 0 | 49 | 806 | 0 | 68 | 0 |

Every JSON row and seven-column CSV projection decoded and reparsed without
duplicate IDs/slots, empty present blobs, invalid base64, or cross-modality
reuse. Real packages remain ignored under `.runtime`.

## Five import previews and physical boundary

Evidence: `.runtime/five-device-import-previews-final-20260728/`.

- B → A: 873 match, 1 display-name conflict (`1616`), 1,646 FP blobs, 711 faces.
- A → F: 874 match, 0 conflicts, 1,646 FP blobs, 806 faces.
- F → D: 874 match, 0 conflicts, 1,646 FP blobs, 806 faces.
- D → E: 874 match, 0 conflicts, 1,646 FP blobs, 806 faces.
- E → B: 873 match, 1 display-name conflict (`1616`), 1,646 FP blobs, 806 faces.

All five compatible devices are populated with 874 users. No blank/frozen
target exists, so no canary or full physical import was started. Physical import
and target reread are correctly `BLOCKED_BY_MISSING_TARGET_DEVICE`.

## Validation

- Backend focused contracts: 38 passing.
- Frontend Device Users UI contract: 1 passing.
- Targeted backend lint and execution-script syntax: clean.
- API production webpack build: passed (one existing protobuf dynamic-require warning).
- Frontend production build: passed.
- Production-build Playwright: passed for authenticated Device Users, Main
  Entrance B, Import control, Export control, and device API traffic.
- API typecheck: no errors from this change; repo remains red on 13 unrelated
  pre-existing attendance, migration, PDF, and activity-logging errors.
- No biometric bytes, runtime packages, credentials, or secrets are tracked.

No new recommendation was identified. The remaining physical import is the
explicit external target-device boundary already defined by the operator.

## WWG Truth Synchronization

- Task mode: mixed feature repair, live-device recovery, protected export, and non-mutating import proof.
- New truth detected: YES.
- Wiki updated: NO; this is runtime evidence for the existing governed Device Users contract, not a new durable product principle.
- Workspace updated: YES.
- Governance review completed: YES; no new recommendation was identified.
- Drift status: `PHYSICAL_IMPORT_BLOCKED_BY_MISSING_TARGET_DEVICE`.
- Canonical files changed: Device Users export implementation, focused contracts, current task, handoff, and this report.
- Implementation discoveries synced: fresh physical counts and protected recovered custody must remain separate evidence planes.
- Remaining stale context: older 313-face / 1,634-FP evidence is historical and must not override this final five-device report.
