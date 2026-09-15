# Overnight — Fast Hikvision Biometric Count, Raw-Custody Recovery, Export, and Import

Run in execution mode. Own the loop until every safe branch is terminal or a
physical/firmware boundary is proven. Do not create another schema, importer,
database model, export workflow, or biometric representation.

## Confirmed starting evidence — 2026-07-28

Treat these as a starting checkpoint and reread before mutation:

- Main Entrance Device B has two agreeing full `UserInfo/Search` reads of 874
  unique users, 806 face users / 806 face slots, and 825 fingerprint users /
  1,646 fingerprint slots.
- Each full read reused one `searchID` across all 30 device-capped pages.
- An older same-day export reported 826 fingerprint users / 1,648 slots. Keep
  that two-slot difference `CONFLICTING` until the exact changed ID is found.
- `GET /ISAPI/Intelligent/FDLib/Count?format=json` is supported, but it returns
  face-library records rather than unique device users. Main B returned
  blackFD=637 plus infraredFD=199, total 836, which is 30 above its 806
  `UserInfo` face enrollments.
- `GET /ISAPI/AccessControl/FingerPrint/Count?format=json` returned
  `notSupport` on all five authorized Main devices. Do not retry it in a tight
  loop or interpret 404 as zero fingerprints.
- Fast FDLib totals for B/A/F/D/E were 836/803/804/908/755. These are library
  inventory signals, not person-to-blob mappings.
- The earlier Main B package held 313 raw face blobs against 806 enrolled faces:
  493 raw face gaps.
- Nine Main B fingerprint-gap IDs were physically recaptured through the
  existing biometric metadata backfill endpoint. Re-export proved all nine now
  have complete real SDK slots: `460,1277,1301,1384,1401,1448,1541,1558,1657`.
- Face canary ID `5` remained `missing_raw_blob`: both SDK capture and the ISAPI
  `faceURL` fallback returned physical 404. No bytes were fabricated.

## Product finish line

Use the existing package schema
`project-truth.hikvision-device-users.v1`, existing export/import endpoints,
existing raw-custody writers, and existing durable recovery jobs.

The readable CSV/Excel projection must remain exactly:

1. `vendorUserId`
2. `displayName`
3. `userType`
4. `fingerprintStatus`
5. `rawFingerprintBlob`
6. `faceStatus`
7. `rawFaceBlob`

Package JSON remains authoritative. Multiple fingerprint slots remain in one
cell as `FPn("...")`. Device model, firmware, source identity, schema version,
and export time remain once in the package manifest.

## Hard invariants

- A count is not a blob and cannot create one.
- Never derive biometric bytes from counts, URLs, another modality, BNPI PATS data,
  or another user.
- Devices may be probed in parallel. Full `UserInfo/Search` inventory uses
  bounded page concurrency 8 on the currently proven Main firmware, with
  exact-count validation, per-page retries, and serialized full-read fallback.
  Other device operations remain on one physical request lane per device.
- Generate one `searchID` once per device/read and reuse it on every page,
  including concurrent page positions and retries.
  Advance only `searchResultPosition`. Never regenerate `searchID` per page.
- Do not assume the device honors requested `maxResults`. Continue until
  `searchResultPosition >= totalMatches`; Main B currently caps pages at 30.
- Deduplicate by normalized `vendorUserId` after a complete read. Report
  duplicate IDs rather than silently collapsing them.
- FDLib counts are aggregate library evidence. They do not prove which
  `vendorUserId` has a face or whether the raw face bytes are readable.
- If fingerprint Count is `notSupport`, capability-cache that result for the
  device/model/firmware and use per-user `UserInfo.numOfFP`.
- Never run overlapping recovery, merge, import, or custody writers.
- Freeze each reviewed scope with IDs, source device, modality, checksums, plan
  ID, and scope hash. Execute must equal preview.

## Ordered engineering graph

```text
A Bootstrap and freeze authorized devices
  -> B Fast capability/count probes in parallel
  -> C Stable full per-user inventory
  -> D Raw-custody row audit
  -> E Residual classifier
       -> E1 already complete
       -> E2 not enrolled
       -> E3 source bytes recoverable on same device
       -> E4 source bytes recoverable on an authorized peer
       -> E5 count-only / broken URL / unsupported firmware
  -> F Durable recovery review and queue
       -> F1 source capture tasks
       -> F2 target write tasks only when explicitly required
  -> G One-user modality canary
  -> H Bounded recovery waves
  -> I Fresh reread and convergence proof
  -> J Seven-column export and row-by-row decode/reparse
  -> K Existing rawPackage import preview
  -> L Compatible blank-device canary, full import, physical reread
  -> M Tests, CI/GitOps/deployed-SHA proof, truth sync
```

## A — Bootstrap and writer safety

Read `AGENTS.md` and WWG in required order. Produce a Current-State Report.
Use exactly the currently authorized five Main devices B/A/F/D/E unless fresh
operator truth changes that scope. Exclude Main C and TEST devices.

List recovery and merge jobs. Refuse a new writer if another job owns any
device/user/modality in the proposed scope. Preserve a protected `.runtime`
snapshot before mutation.

## B — Fast count probes

Run:

```powershell
cd bnpi-pats-api
npm run probe:hikvision-biometric-counts -- --device-ids=<B,A,F,D,E>
```

For each device record endpoint, elapsed time, HTTP/device status,
model/firmware, component counts, and capability status.

- Face: call `/ISAPI/Intelligent/FDLib/Count?format=json` once per device.
  Preserve every `(FDID, faceLibType, recordDataNumber)` component and their
  sum. Do not label the sum “face users.”
- Fingerprint: call
  `/ISAPI/AccessControl/FingerPrint/Count?format=json` once per device.
  On `notSupport`, stop retrying and fall back to stable `UserInfo/Search`.
- A person-specific Count request may be used only after the all-person
  capability succeeds on that same device/firmware.

## C — Stable full inventory

Run two full reads per source device when establishing a mutation baseline.
Both reads must agree or the device is `CONFLICTING`.

For each read:

- one stable `searchID`;
- pages continue to `totalMatches`;
- page concurrency defaults to 8 and never exceeds 8;
- each failed page is retried up to three times; the final retry uses the
  serialized request lane;
- if rows or unique IDs do not exactly equal `totalMatches`, discard the
  parallel result and rerun the entire inventory with a new `searchID` at
  concurrency 1;
- one row per unique `employeeNo` mapped internally to `vendorUserId`;
- tally `numOfFP` per user and as total slots;
- tally `numOfFace` per user and as total slots;
- retain sanitized per-ID counts for comparison;
- compute a stable hash over sorted
  `(vendorUserId,numOfFP,numOfFace)` rows.

Do not perform a full inventory on every progress poll. Use the fast count
signals for change detection and full reads at freeze, canary verification,
wave terminal, and final acceptance.

## D — Raw-custody audit

Use the existing package/export path and audit helper. For every row compare:

- reported FP slots vs distinct decoded `FPn` slots;
- reported face enrollment vs decoded raw face bytes;
- biometric status vs actual byte presence;
- duplicate slot IDs;
- invalid base64;
- zero-length bytes;
- cross-user or cross-modality checksum reuse;
- stale extra raw slots where raw exceeds the latest device count.

Never net missing and extra slots. Report both buckets separately.

## E — Exact residual buckets

Every residual row must include device, `vendorUserId`, reported count, raw
count, gap, source candidates, chosen source, evidence checksum/status, blocker
class, and next agent action.

Use:

- `complete_raw_custody`
- `not_enrolled_fresh_read`
- `same_device_capture_ready`
- `peer_source_capture_ready`
- `broken_face_url_or_no_device_bytes`
- `unsupported_firmware_or_endpoint`
- `source_conflict`
- `stale_extra_raw_custody`

Allowed exported statuses remain only:

- `raw_blob_present`
- `not_enrolled`
- `missing_raw_blob`

## F — Review and durable queue

Use existing:

- `POST /api/device/:id/users/biometric-metadata/backfill`
- `POST /api/device/hikvision/sdk-users/merge/plan`
- `POST /api/device/hikvision/sdk-users/merge/recovery/review`
- `POST /api/device/hikvision/sdk-users/merge/recovery/jobs`

Dry-run first. Queue only rows whose exact source bytes can be physically read.
Separate source-capture from peer-target writes. A face count or stale
`faceURL` is not source readiness.

Jobs must be idempotent by
`deviceId + vendorUserId + modality + source checksum + scope hash`, expose
queued/running/rereading/completed/failed/needs-attention states, heartbeat,
last advancement, attempt count, exact error, and terminal reread evidence.

## G/H — Canary and bounded waves

Canary one fingerprint and one face independently. A successful fingerprint
must not hide a failed face, and vice versa.

After each canary:

- re-export the row;
- decode every returned slot/blob;
- compare count and checksums;
- physically reread the source/target as applicable;
- require the exact residual to decrease.

Then run bounded waves, serial within one device and parallel across different
devices. The concurrency-8 exception applies only to read-only
`UserInfo/Search` inventory pages with the validation/fallback gates above. Do
not retry deterministic `notSupport` or physical 404 rows without a different
evidenced source/path.

## I/J — Final reread and export

Require two agreeing stable full reads after recovery. Generate the package only
through the existing export path, then run:

```powershell
npm run audit:hikvision-sdk-export -- --input=<protected-package.json> --evidence-dir=<protected-runtime-dir>
```

Prove all seven columns exactly, every blob decodes, all FP slots survive
reparse, every face survives reparse, and no enrolled selected credential is
silently empty. Keep real packages only under protected `.runtime`.

## K/L — Existing import only

Use existing import preview and
`biometricTransferMode="rawPackage"`. Freeze and back up a compatible target,
reject conflicts/overwrites, and require execute scope to equal preview scope.

Run the smallest FP/face canary with a fresh preview token,
`execute=true`, and `confirmation="IMPORT DEVICE USERS"`. Physically reread
each modality independently before full import. Do not use a populated peer as
the future blank-device proof.

## Agent-owned loop

```text
probe -> classify -> dry-run -> freeze -> capture/write -> poll
-> physical reread -> export audit -> compare residual
-> retry only recoverable failures -> repeat
```

Do not stop at preview, API 200, queued, or database persistence. Stop only when
the requested safe scope is terminal and physically reread, or when the same
boundary survives the required distinct recovery attempts.

## Final report

Report per device:

- unique IDs and duplicate IDs;
- FDLib component totals, never mislabeled as unique people;
- fingerprint users and reported slots;
- face users and reported slots;
- raw FP users/slots and missing users/slots;
- raw face users/blobs and missing users/blobs;
- stale extra raw custody;
- canary and wave successes/failures;
- exact blocker buckets with sample IDs;
- final export row-by-row audit;
- import preview/write/reread results;
- tests, typecheck, lint, Playwright, CI, GitOps, deployed SHA;
- confirmation that no real biometric blobs or secrets were committed.
