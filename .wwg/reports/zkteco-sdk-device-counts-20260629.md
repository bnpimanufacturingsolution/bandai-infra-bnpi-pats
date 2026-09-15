# ZKTeco SDK Device Counts - 2026-06-29

## Task Mode

Mixed runtime evidence capture and truth synchronization.

## Request

Capture ZKTeco SDK user and event counts per device. If some devices do not connect, skip them for now and still produce the report.

## Evidence Command

```powershell
$env:ZKTECO_DEVICE_IPS="10.184.38.10,10.184.38.234,10.184.38.235,10.184.38.9"
$env:ZKTECO_BACKFILL_MAX_EVENTS="100000"
.\appliance\zkteco-standalone-sdk\bin\Debug\net48\ZKTecoStandalone.exe --summary
```

Command completed successfully on the Windows host. The SDK summary is read-only: it connects to each terminal, reads users and stored attendance logs, then disconnects.

## Per-Device Results

| Device IP | SDK connected | User count | Event count | Unique event users | First event | Last event |
|---|---:|---:|---:|---:|---|---|
| `10.184.38.10` | yes | 907 | 41,586 | 838 | 2022-12-31 05:47:24 | 2026-06-29 08:27:27 |
| `10.184.38.234` | yes | 905 | 31,391 | 785 | 2022-12-31 05:36:18 | 2026-06-29 08:11:17 |
| `10.184.38.235` | yes | 905 | 21,160 | 813 | 2026-04-01 05:03:55 | 2026-06-29 10:09:10 |
| `10.184.38.9` | yes | 905 | 12,581 | 747 | 2022-12-31 17:39:06 | 2026-06-29 06:15:12 |

No devices had to be skipped in this run.

## Sidecar Status Snapshot

`GET http://127.0.0.1:4371/status` returned the active sidecar process status:

| Field | Value |
|---|---|
| Runtime | `.NET Framework 4.8 + zkemkeeper COM` |
| Status | `online` |
| Started at | `2026-06-29T02:26:24.2863706Z` |
| Webhook URL | `http://127.0.0.1:3101/api/zkteco/events` |
| Configured devices | 1 |
| Connected devices | 1 |
| Device | `10.184.38.9:4370` |
| Device streaming | true |
| Events seen since sidecar start | 0 |
| Events posted since sidecar start | 0 |

## Interpretation

- The SDK count report proves all four known Project Truth ZKTeco devices were readable during this run.
- The active sidecar process was only configured to stream `10.184.38.9` at the time of the status check.
- Stored terminal log counts are not the same as BNPI PATS saved event counts or sidecar realtime counters.
- Earlier SDK error `-2` evidence for `10.184.38.234` and `10.184.38.235` is stale for count reporting after this successful read, but remains useful as transient connectivity history.

## WWG Truth Synchronization

- Task mode: mixed runtime evidence capture and truth synchronization.
- New truth detected: YES.
- Wiki updated: N/A; runtime count evidence was written to `docs/ZKTECO_RUNTIME_TRUTH.md` and this WWG report, not promoted into `.wwg/wiki/project-truth.md`.
- Workspace updated: NO.
- Governance review completed: YES.
- Drift status: LOW.
- Canonical files changed:
  - `docs/ZKTECO_RUNTIME_TRUTH.md`
  - `.wwg/reports/zkteco-sdk-device-counts-20260629.md`
- Implementation discoveries synced:
  - All four known Project Truth ZKTeco devices connected through the Windows Standalone SDK during the read-only summary run.
  - The active local sidecar status endpoint was configured for only `10.184.38.9:4370` during the status check.
  - Stored terminal log counts are distinct from BNPI PATS saved event counts and sidecar realtime counters.
- Remaining stale context:
  - Older SDK error `-2` evidence for `10.184.38.234` and `10.184.38.235` is stale for count reporting after this successful SDK read.
  - Existing generated report truth-sync failures remain outside this count-report scope.

## Recommendation Capture

No new recommendations were identified.
