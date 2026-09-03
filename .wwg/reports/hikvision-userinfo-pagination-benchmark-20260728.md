# Hikvision UserInfo Pagination Benchmark — 2026-07-28

Status: `CONFIRMED_LOCAL_READ_ONLY_WITH_ADAPTIVE_FALLBACK`

Evidence: `.runtime/hikvision-pagination-benchmark-20260728/`.

## Result

Main B returned the exact same 874 unique IDs, sorted per-row inventory hash
`707e8800a55a44a2d106bafdc5eac2a5031bde9e9d877ebba2f96fe96b6223d1`,
825 fingerprint users / 1,646 slots, and 806 face users / slots at every
successful concurrency level.

| Page concurrency | Main B average | Exact trials | Errors |
|---:|---:|---:|---:|
| 1 | 21,993 ms | 2/2 | 0 |
| 2 | 12,501 ms | 2/2 | 0 |
| 4 | 7,602 ms | 2/2 | 0 |
| 6 | 5,882 ms | 2/2 | 0 |
| 8 | 5,417 ms | 2/2 | 0 |

An earlier additional Main B comparison also matched at concurrency 1, 2, and
4. Main A, F, and D each matched their sequential 874-row hash at concurrency
8 in 7.18–7.23 seconds.

Main E exposed intermittent device authentication/transport failures:

- sequential reads could fail the first page or lose one later 30-row page;
- concurrency 2 succeeded 1/2;
- concurrency 4 succeeded 0/2;
- the isolated concurrency-8 retry succeeded 2/2 in 10.24–12.60 seconds;
- an earlier concurrency-8 cross-device run lost one 30-row page.

No incomplete run was accepted. Failed runs reported 814 or 844 unique rows
against `totalMatches=874`, with exact failed positions and 401/502 categories.

## Adopted setting

- `HIKVISION_USER_SYNC_PAGE_CONCURRENCY=8` by default, bounded to 1–8.
- One `searchID` is created per complete inventory and reused by all positions.
- The first page discovers the physical page size; current devices cap at 30
  even when 100 is requested.
- Each page gets three attempts. The final attempt uses the normal serialized
  device request lane.
- The result is accepted only when raw row count and unique normalized ID count
  both equal `totalMatches`.
- Any remaining parallel error or count mismatch discards the entire result and
  starts a new serialized inventory with a new `searchID`.

This setting is limited to read-only `UserInfo/Search` pagination. Biometric
capture and physical writes remain serialized per device.

## Validation

- Targeted ESLint on client, controller, count probe, and benchmark: clean.
- Hikvision tunnel plus biometric contracts: 51 passing.
- No biometric bytes or device credentials are written to benchmark evidence.

## WWG Truth Synchronization

- Task mode: performance diagnosis and read-only inventory regression repair.
- New truth detected: YES.
- Wiki updated: NO; the adopted runtime setting and evidence are captured in workspace/handoff rather than changing durable product semantics.
- Workspace updated: YES.
- Governance review completed: YES; no new recommendation was identified.
- Drift status: `CONFIRMED_WITH_SERIAL_FALLBACK`.
- Canonical files changed: Hikvision client/controller pagination path, focused contracts, current task, handoff, and this report.
- Implementation discoveries synced: a parallel result is valid only when rows and unique IDs both equal `totalMatches`; Main E requires discard-and-serialized fallback.
- Remaining stale context: earlier sequential timing remains historical baseline only.
