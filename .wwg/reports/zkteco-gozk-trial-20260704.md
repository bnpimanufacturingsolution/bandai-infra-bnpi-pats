# ZKTeco gozk Trial - 2026-07-04

Task mode: Mixed SDK performance investigation and WWG evidence capture.

## Goal

Check whether `github.com/canhlinh/gozk` should replace or improve the
current Linux/PyZK ZKTeco path for reading users and attendance events from the
four known client devices.

The user asked for testing before making gozk a default stack choice.

## Scope

In scope:

- Research the gozk API surface.
- Install and run gozk from the remote Project Truth VM path, not from
  host-local assumptions.
- Point the probe at the four existing ZKTeco device addresses already used by
  BNPI PATS:
  - `10.184.38.9:4370`
  - `10.184.38.235:4370`
  - `10.184.38.234:4370`
  - `10.184.38.10:4370`
- Measure TCP reachability, connect, firmware read, user call behavior, and
  full attendance-history read behavior.
- Decide whether gozk should become the default runtime path.

Out of scope:

- Writing to devices.
- Clearing attendance.
- Changing BNPI PATS sync defaults.
- Replacing PyZK in application code.
- Stopping or changing the VM-managed Cloudflare Tunnel.

## Research Finding

The gozk README advertises:

- get all check-in list;
- get all users;
- realtime capturing events.

Source reviewed:

- `https://github.com/canhlinh/gozk`

Local source inspection found an important implementation boundary:

- `GetAllScannedEvents()` returns scanned attendance events.
- `GetUsers()` currently returns only `error`, not user objects.
- The code comment on `GetUsers()` says it is a placeholder-style method to
  run for now, with implementation to come later.

Therefore gozk is not currently a drop-in replacement for PyZK user extraction
in Project Truth.

## Probe Method

A disposable read-only Go probe was created under `.runtime/gozk-probe` and
copied to the remote VM at:

```text
/tmp/project-truth-gozk-probe
```

Because Go was not installed on the VM host, the probe ran through a disposable
container:

```text
golang:1.22-bookworm
```

The container used `--network host` so the probe ran from the same VM network
position as the active bridge services.

Dependency resolution used:

```text
github.com/canhlinh/gozk v0.0.0-20250721083631-a631ea7e93da
```

The upstream module did not resolve cleanly at `v1.0.0`; the working test used
the current `master` pseudo-version.

## Four-Device Parallel Probe

Run date: 2026-07-04.

| Device | TCP | gozk connect | Users call | Attendance read | Result |
| --- | --- | ---: | ---: | ---: | --- |
| `10.184.38.9:4370` | timeout after ~10.0s | not attempted | not attempted | not attempted | unreachable |
| `10.184.38.235:4370` | OK in ~0.002s | ~0.195s | OK in ~3.590s, no user objects returned | OK: 18,085 events in ~22.056s | partial success |
| `10.184.38.234:4370` | OK in ~0.001s | ~0.716s | failed after ~4.329s with timeout on command `1504` | failed after ~3.001s with timeout on command `1100` | failed history |
| `10.184.38.10:4370` | timeout after ~10.0s | not attempted | not attempted | not attempted | unreachable |

For `.235`, gozk read the same 18,085 attendance count seen by PyZK and
reported latest event `2026-07-04T08:06:55+08:00`.

## Isolated Reachable-Device Retry

The two TCP-reachable devices were retried one at a time to check whether the
`.234` failure was caused by parallel contention.

| Device | TCP | gozk connect | Firmware | Users call | Attendance read |
| --- | ---: | ---: | --- | ---: | --- |
| `10.184.38.235:4370` | ~0.001s | ~0.718s | `Ver 6.60 Sep 10 2019` | OK in ~4.827s, no user objects returned | failed after ~4.007s with timeout on command `201` |
| `10.184.38.234:4370` | ~0.001s | ~0.085s | `Ver 6.60 Sep 10 2019` | OK in ~4.637s, no user objects returned | failed after ~24.809s with timeout on command `1504` |

This retry reduced confidence in gozk as a default history-pull path. It proved
fast connection behavior, but full attendance extraction was not stable.

## Comparison To Current PyZK Evidence

Current PyZK evidence from the same remote VM runtime pass:

| Device | PyZK users | PyZK TCP attendance | PyZK latest source event |
| --- | ---: | ---: | --- |
| `10.184.38.235:4370` | 904 users in ~6.602s | 18,085 events in ~28.525s | `2026-07-04T08:06:55` |
| `10.184.38.234:4370` | 904 users in ~10.907s | 21,507 events in ~33.511s | `2026-07-04T07:07:17` |

gozk was faster than PyZK for one successful `.235` attendance pull
(~22.056s versus ~28.525s), but:

- it still exceeded the user's 15-second interactive threshold;
- it did not return user objects;
- it failed `.234` attendance where PyZK succeeded;
- it failed isolated attendance retries on both reachable devices.

## Decision

Do not make gozk the default ZKTeco runtime path now.

Current best truth:

- PyZK remains the safer active stack for user extraction and full attendance
  reads.
- gozk may be useful later as an experimental realtime or supplemental
  attendance reader, but it needs code-level user extraction support and stable
  history-read proof on `.234` before promotion.
- The larger performance problem is still product/runtime design: full
  source-device history pulls should not block the sync modal or preflight.

## WWG Truth Synchronization

- Task mode: Mixed SDK/runtime investigation and documentation.
- New truth detected: YES.
- Wiki updated: YES.
- Workspace updated: NO.
- Governance updated: YES, recommendation captured as proposed work.
- Reports updated: YES, this report and implementation log entry.
- Drift status: MEDIUM.
- Canonical files changed:
  - `.wwg/reports/zkteco-gozk-trial-20260704.md`
  - `.wwg/reports/agent-implementation-log.md`
  - `.wwg/governance/recommendation-registry.md`
  - `.wwg/wiki/project-truth.md`
  - `.wwg/wiki/project-truth-summary.md`
- Implementation changes: none.
- Runtime changes: none.

## Final Status

FULFILLED WITH WARNING.

gozk was tested from the remote VM against the four configured ZKTeco devices.
It should not replace PyZK by default based on current evidence.
