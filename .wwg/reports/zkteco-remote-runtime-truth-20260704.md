# ZKTeco Remote Runtime Truth - 2026-07-04

Task mode: Mixed runtime investigation, SDK performance proof, and WWG evidence
capture.

## Goal

Establish current ZKTeco source-device truth from the real remote/client-side
runtime path, not from host-local assumptions.

The user specifically asked to care about the remote/client SSH path and to
query the existing client ZKTeco devices through the Linux/PyZK runtime as fast
as practical, while identifying when a read takes too long for interactive use.

## Scope

In scope:

- Prove remote SSH path through `ssh project-truth-bnpi-pats`.
- Query the active Linux/PyZK bridge runtime on the remote VM.
- Check all four known ZKTeco devices:
  - `10.184.38.9:4370`
  - `10.184.38.235:4370`
  - `10.184.38.234:4370`
  - `10.184.38.10:4370`
- Measure TCP reachability, PyZK handshake, `get_users()`, and
  `get_attendance()` timing.
- Compare source-device counts to existing DEV BNPI PATS saved ZKTeco rows.
- Capture performance recommendation without silently promoting it to accepted
  project truth.

Out of scope:

- Writing to devices.
- Clearing attendance.
- Changing device config.
- Starting/stopping the VM-managed Cloudflare Tunnel.
- Triggering BNPI PATS sync writes.
- Fixing the unreachable devices.

## Remote Runtime Proof

Remote SSH was verified with:

```text
ssh project-truth-bnpi-pats
```

Evidence returned:

- Hostname: `project-truth-node`
- VM time during proof: `2026-07-04T04:39:56+00:00`
- VM `eth0`: `10.184.37.19/24`, `10.184.37.78/24`
- `cloudflared-bnpi-pats.service`: `active`
- Runtime source checkout: `/var/lib/project-truth/ansible-pull`
- Runtime branch/commit: `develop@9a82734`

This confirms the investigation ran through the remote Project Truth VM path
that depends on the named Cloudflare SSH/tunnel route.

## Active Bridge State

Docker showed the active ZKTeco bridge containers running and healthy:

| Container | Status | Host port |
| --- | --- | ---: |
| `project-truth-zkteco-linux-bridge` | healthy | `4371` |
| `project-truth-zkteco-linux-bridge-dev` | healthy | `4372` |
| `project-truth-zkteco-linux-bridge-uat` | healthy | `4373` |

The runtime capability command reported the active canonical path as:

```text
vendor/zkteco-linux PyZK Linux bridge
```

Capability boundary still listed as not proven:

- attendance log read parity;
- realtime watch mode;
- GitOps/K3s managed runtime.

## Current Device Query Truth

All probes below were run from the remote VM runtime path. Device reads used
the running `project-truth-zkteco-linux-bridge` container and its PyZK
dependency.

| Device | TCP from remote VM | PyZK users | PyZK attendance events | Latest source event | Result |
| --- | --- | ---: | ---: | --- | --- |
| `10.184.38.9:4370` | FAIL | unavailable | unavailable | unavailable | TCP/PyZK timeout |
| `10.184.38.235:4370` | OK | 904 | 18,085 | `2026-07-04T08:06:55` | Queryable |
| `10.184.38.234:4370` | OK | 904 | 21,507 | `2026-07-04T07:07:17` | Queryable |
| `10.184.38.10:4370` | FAIL | unavailable | unavailable | unavailable | TCP/PyZK timeout |

Current truth:

- Only 2 of 4 known ZKTeco devices were queryable from the remote VM during
  this pass.
- `10.184.38.9` and `10.184.38.10` failed at TCP reachability and timed out in
  PyZK. No SDK tuning can read those devices until their LAN/device path is
  restored.
- `10.184.38.235` and `10.184.38.234` returned real users and current-day
  source-device attendance history.

## Reachability Recheck And Discovery - Later 2026-07-04

The user challenged whether `.9`, `.10`, or `.1` were really unreachable and
asked whether a protocol/SDK discovery path could find nearby ZKTeco devices
without manually trusting configured IPs.

Additional remote VM checks were run after the initial source-device truth
pass.

### Long TCP Timeout Recheck

TCP connect probes to port `4370` were retried with 1s, 3s, 10s, and 20s
timeouts:

| IP | TCP `4370` result |
| --- | --- |
| `10.184.38.1` | connection refused immediately |
| `10.184.38.9` | timed out through 20s |
| `10.184.38.10` | timed out through 20s |
| `10.184.38.234` | connected immediately |
| `10.184.38.235` | connected immediately |
| `10.184.38.254` | connection refused immediately |

A parallel TCP sweep of `10.184.38.1-254` on port `4370` found only:

- `10.184.38.234`
- `10.184.38.235`

### UDP SDK Recheck

PyZK UDP mode with `read_sizes()` was retried with 5s, 10s, and 20s timeouts:

| IP | UDP/ZK result |
| --- | --- |
| `10.184.38.1` | timed out through 20s |
| `10.184.38.9` | timed out through 20s |
| `10.184.38.10` | timed out through 20s |
| `10.184.38.234` | quick count OK in about 0.07-0.09s end to end |
| `10.184.38.235` | quick count OK in about 0.10-0.14s end to end |

A directed UDP/ZK sweep of `10.184.38.1-254` using read-only
`connect + read_sizes()` found only:

- `10.184.38.234`
- `10.184.38.235`

### UDP Broadcast Discovery

A bounded UDP broadcast probe sent a ZK `CMD_CONNECT` packet to:

- `255.255.255.255:4370`
- `10.184.38.255:4370`
- `10.184.37.255:4370`

No devices replied. This does not prove that broadcast discovery is impossible
on every LAN placement, but from this VM it is not a reliable discovery method.
The VM is on `10.184.37.0/24` and routes toward `10.184.38.0/24` through
`10.184.38.254`, so broadcast behavior is expected to be weaker than directed
probes.

### ICMP Recheck

ICMP evidence from the remote VM:

| IP | Ping result |
| --- | --- |
| `10.184.38.1` | replies, ~63-90ms |
| `10.184.38.9` | 100% packet loss |
| `10.184.38.10` | 100% packet loss |
| `10.184.38.234` | replies, under 1ms |
| `10.184.38.235` | replies, under 1ms |
| `10.184.38.254` | replies, ~1ms |

Current interpretation:

- `.9` and `.10` are not just slow SDK reads. They did not answer ICMP, TCP
  `4370`, or UDP ZK protocol probes from the remote VM.
- `.1` is alive as a network host but is not a ZKTeco SDK endpoint on port
  `4370` in this proof.
- `.234` and `.235` are the only currently discoverable/queryable ZKTeco
  endpoints on `10.184.38.0/24` from the VM.
- The best removable runtime discovery architecture is a bounded directed
  UDP/ZK sweep over configured CIDR ranges using `read_sizes()` only, with a
  short timeout and parallelism cap. Broadcast discovery should be treated as a
  best-effort optimization, not as the source of truth for this routed VM path.

## Performance Measurements

### Quick Device Count Probe

The ZKTeco protocol includes a quick device-status/count operation:

```text
CMD_GET_FREE_SIZES
```

The `adrobinoga/zk-protocol` documentation describes this as a 92-byte status
structure that includes user count, attendance-log count, capacities, remaining
slots, fingerprint count, and face count. The installed PyZK build exposes this
operation as `read_sizes()`.

Read-only `read_sizes()` probes from the active bridge container returned:

| Device | TCP | Connect | `read_sizes()` | Users | Attendance log count | Result |
| --- | --- | ---: | ---: | ---: | ---: | --- |
| `10.184.38.9:4370` | timeout | unavailable | unavailable | unavailable | unavailable | unreachable |
| `10.184.38.235:4370` | OK | 0.337s | 1.022s | 904 | 18,086 | quick count works |
| `10.184.38.234:4370` | OK | 0.661s | 0.951s | 904 | 21,508 | quick count works |
| `10.184.38.10:4370` | timeout | unavailable | unavailable | unavailable | unavailable | unreachable |

End-to-end elapsed time including TCP probe, connect, `read_sizes()`, and
disconnect was about 2.3s for `.235` and 2.5s for `.234`.

This is the correct fast path for sync preflight summary counts. It avoids
downloading every user or attendance row when the UI only needs a count.

Note: the quick attendance-log counts were one higher than the earlier full
history read counts for both reachable devices. This is likely because new
events arrived after the earlier full-history pass, but exact off-by-one
semantics should be treated as runtime evidence to verify during implementation.

### TCP Mode

| Device | Handshake | Users read | Full attendance read |
| --- | ---: | ---: | ---: |
| `10.184.38.235` | 6.137s | 6.602s | 28.525s |
| `10.184.38.234` | 3.929s | 10.907s | 33.511s |

### PyZK `force_udp=True`

| Device | Handshake | Users read | Full attendance read |
| --- | ---: | ---: | ---: |
| `10.184.38.235` | 0.079s | 3.229s | 67.673s |
| `10.184.38.234` | 0.065s | 6.183s | 88.012s |

Performance truth:

- `read_sizes()` is the fastest proven source-device summary path for current
  users and attendance-log count on reachable ZKTeco terminals.
- UDP `read_sizes()` is faster than TCP `read_sizes()` on the two reachable
  terminals; later UDP proof returned quick counts in about 0.07-0.14s end to
  end for `.234` and `.235`.
- UDP is much faster for handshake and user-count reads on the two reachable
  iFace302 terminals.
- UDP is much slower for full attendance-history reads in this runtime.
- TCP is currently the faster proven path for full `get_attendance()`.
- Full source-device attendance extraction exceeds the user's 15-second
  interactive threshold even on reachable devices.

## BNPI PATS DEV Saved Count Comparison

DEV BNPI PATS saved ZKTeco rows were queried from `bnpi-pats-postgres-dev`:

| Device | DEV BNPI PATS saved `ZKTECO_EVENT` rows | Latest BNPI PATS event time | Latest received time |
| --- | ---: | --- | --- |
| `10.184.38.10` | 72,090 | `2026-07-01 08:30:36` | `2026-07-01 08:35:07.545` |
| `10.184.38.234` | 55,833 | `2026-07-01 13:55:29` | `2026-07-01 08:14:52.281` |
| `10.184.38.235` | 41,305 | `2026-07-03 00:12:52` | `2026-07-03 02:19:41.748` |
| `10.184.38.9` | 24,492 | `2026-07-03 02:04:26` | `2026-07-03 02:19:03.519` |

Interpretation:

- BNPI PATS already contains more saved ZKTeco rows for some devices than PyZK can
  currently read from the source terminals.
- Current PyZK reads should not be treated as full historical parity evidence.
- The likely runtime reality is either source-device log truncation/rotation,
  previous higher-volume import/sync history, SDK behavior differences, or a
  combination. This requires a separate parity investigation before claiming
  full historical source parity.

## SDK / Research Notes

Reviewed current PyZK and community references during the pass:

- PyZK exposes `ZK(ip, port=4370, timeout=..., force_udp=...)`.
- PyZK exposes `get_users()` and `get_attendance()` for user and attendance
  pulls.
- PyZK exposes `live_capture(new_timeout=10)`, but Project Truth has not yet
  proven realtime watch parity for this runtime.
- PyZK examples commonly call `disable_device()` during operations to prevent
  user activity while processing. This pass did not disable devices because the
  investigation was read-only and avoided operational interruption.
- Community material supports `force_udp` as a possible connection workaround,
  but the actual Project Truth measurement shows operation-specific behavior:
  fast for handshake/users, slow for full attendance history.
- `adrobinoga/zk-protocol` documents `CMD_GET_FREE_SIZES` as the protocol path
  for device status/counts; Project Truth confirmed the installed PyZK
  `read_sizes()` wrapper works for quick user/attendance-count summaries on
  the two currently reachable devices.

Sources reviewed:

- `https://pyzk.readthedocs.io/en/stable/zk_base.html`
- `https://github.com/fananimi/pyzk`
- `https://stackoverflow.com/questions/60161858/pyzk-how-to-get-the-result-of-live-capture`
- `https://discuss.frappe.io/t/connection-zkteco-with-erpnext/52915?page=2`
- `https://github.com/adrobinoga/zk-protocol`
- `https://raw.githubusercontent.com/adrobinoga/zk-protocol/master/sections/terminal.md`

## Recommendation Capture

Added proposed recommendation:

```text
REC-20260704-ZKTECO-PREVIEW-PERF
```

Location:

```text
.wwg/governance/recommendation-registry.md
```

Recommendation summary:

- Do not block ZKTeco sync preflight on sequential full-history reads.
- Probe devices in parallel.
- Skip TCP-unreachable devices quickly.
- Use `read_sizes()` / `CMD_GET_FREE_SIZES` for fast source-device summary
  counts.
- Use PyZK `force_udp` for quick handshake/user-count checks on these reachable
  iFace302 devices.
- Keep full attendance-history extraction asynchronous or cached because live
  full pulls exceeded 15 seconds.

## WWG Truth Synchronization

- Task mode: Mixed runtime investigation and documentation.
- New truth detected: YES.
- Wiki updated: YES.
- Workspace updated: NO.
- Governance updated: YES, recommendation captured as proposed work.
- Reports updated: YES, this report and implementation log entry.
- Drift status: MEDIUM.
- Canonical files changed:
  - `.wwg/reports/zkteco-remote-runtime-truth-20260704.md`
  - `.wwg/reports/agent-implementation-log.md`
  - `.wwg/governance/recommendation-registry.md`
  - `.wwg/wiki/project-truth.md`
  - `.wwg/wiki/project-truth-summary.md`
- Implementation discoveries synced:
  - Current remote queryable device count is 2 of 4.
  - Current fastest measured PyZK operation paths differ by operation.
  - Full attendance reads exceed 15 seconds and should not block interactive UI.
  - `read_sizes()` / `CMD_GET_FREE_SIZES` provides a fast source-device summary
    count path.
  - Later TCP/UDP/ICMP rechecks still found `.9` and `.10` unreachable, while
    `.1` is not a ZKTeco SDK endpoint on port `4370`.
- Remaining stale context:
  - Existing Project Truth still contains earlier 2026-07-01 evidence where all
    four devices were reachable. That remains historical evidence but is not
    current runtime state for 2026-07-04.
  - Full count parity remains unresolved.

## Final Status

FULFILLED WITH WARNINGS.

The requested remote/client-side ZKTeco truth was queried and documented. The
warning is that two devices were unreachable from the remote VM at TCP level,
and full source attendance reads on reachable devices are too slow for the
user's stated interactive threshold.
