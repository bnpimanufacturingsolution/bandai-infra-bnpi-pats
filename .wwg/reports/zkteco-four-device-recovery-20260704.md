# ZKTeco Four-Device Recovery Attempt - 2026-07-04

Task mode: Mixed runtime recovery, network investigation, source-device proof,
and implementation.

## Goal

Recover/query all four configured ZKTeco devices without breaking the
VM-managed Cloudflare SSH/public tunnel.

Configured DEV devices from `hris-postgres-dev` / database `hris`:

| Device | Address | Port |
| --- | --- | ---: |
| ZKTeco Device 10.184.38.9 | `10.184.38.9` | 4370 |
| ZKTeco Device 10.184.38.10 | `10.184.38.10` | 4370 |
| ZKTeco Device 10.184.38.234 | `10.184.38.234` | 4370 |
| ZKTeco Device 10.184.38.235 | `10.184.38.235` | 4370 |

Device-screen photos supplied by the user also confirm the same network
configuration on the terminals:

| Photo | Device IP | Mask | Gateway | TCP COMM.Port | DHCP |
| --- | --- | --- | --- | ---: | --- |
| `docs/zkteco-ips/734128562_2108059896585606_7174992420756728937_n.jpg` | `10.184.38.9` | `255.255.255.0` | `10.184.38.254` | 4370 | Off |
| `docs/zkteco-ips/738142811_1039152328566808_6462855960619267699_n.jpg` | `10.184.38.10` | `255.255.255.0` | `10.184.38.254` | 4370 | Off |
| `docs/zkteco-ips/735475916_4555414284776659_7980313276103266968_n.jpg` | `10.184.38.234` | `255.255.255.0` | `10.184.38.254` | 4370 | Off |
| `docs/zkteco-ips/735504354_787372137733346_3163726000928591569_n.jpg` | `10.184.38.235` | `255.255.255.0` | `10.184.38.254` | 4370 | Off |

Interpretation: the four configured HRIS IPs match the device screens. The
current failure is not explained by a typo in the configured ZKTeco IPs or TCP
port. It is current reachability/path/device state for `.9` and `.10`.

## Cloudflare Safety

Before network recovery attempts:

- Remote path: `ssh project-truth-hris`
- Host: `project-truth-node`
- `cloudflared-bnpi-hris.service`: `active`
- `eth0`: `10.184.37.19/24`, `10.184.37.78/24`
- Default route: `default via 10.184.38.254 dev eth0 proto static onlink`
- ZKTeco bridge containers: running and healthy

The named Cloudflare tunnel service was not stopped, restarted, disabled,
masked, or modified.

## Recovery Attempts

### 1. Reversible Same-Subnet Address Test

Historical WWG evidence showed the VM previously had transient
`10.184.38.x` LAN presence when all four devices were reachable.

A temporary, non-persistent secondary address was added:

```text
10.184.38.144/24 on eth0
```

Effect:

- Routes to `10.184.38.x` changed to source from `10.184.38.144`.
- `cloudflared-bnpi-hris.service` remained active.
- `.234` and `.235` still worked.
- `.9` and `.10` changed from long TCP timeout to `No route to host` on TCP,
  which indicates failed neighbor/L2 resolution from the VM.
- UDP/ZK still timed out for `.9` and `.10`.

The temporary address did not recover the missing terminals and was not left as
a persistent VM configuration change. The VM returned to the canonical
`10.184.37.19/24` and `10.184.37.78/24` address state.

### 2. Reversible Gateway / Source-Route Variants

Additional temporary gateway/source settings were tested without changing
netplan:

- Added `10.184.38.144/32` to `eth0`.
- Added host routes for `.9`, `.10`, `.234`, and `.235` via gateway
  `10.184.38.254` with source `10.184.38.144`.
- Repeated the same style of test with historical source addresses
  `10.184.38.91/32` and `10.184.38.138/32`.

Results:

| Source address | `.9` | `.10` | `.234` | `.235` |
| --- | --- | --- | --- | --- |
| `10.184.38.144` via gateway `.254` | ping/TCP timeout | ping/TCP timeout | ping/TCP OK | ping/TCP OK |
| `10.184.38.91` via gateway `.254` | ping/TCP timeout | ping/TCP timeout | ping/TCP timeout | ping/TCP timeout |
| `10.184.38.138` via gateway `.254` | ping/TCP timeout | ping/TCP timeout | ping/TCP timeout | ping/TCP OK |

Interpretation:

- Gateway/source routing changes did not recover `.9` or `.10`.
- The `.144` source-route variant proved the gateway path can still reach
  `.234` and `.235`, while `.9` and `.10` remain unreachable.
- Historical source addresses are not a safe or useful recovery setting based
  on this pass.
- All temporary host routes and temporary `/32` addresses were removed after
  the test.
- Final VM state returned to canonical `10.184.37.19/24` and
  `10.184.37.78/24`; `cloudflared-bnpi-hris.service` remained active.

Post-cleanup validation:

- `.234` UDP `read_sizes()`: OK, 904 users, 21,510 records.
- `.235` UDP `read_sizes()`: OK, 904 users, 18,087 records.

### 3. Expanded Discovery

Read-only directed UDP/ZK discovery using `connect + read_sizes()` scanned:

- `10.184.37.0/24`
- `10.184.38.0/24`
- `10.184.39.0/24`
- `192.168.254.0/24`

Results:

| CIDR | ZKTeco responders |
| --- | --- |
| `10.184.37.0/24` | none |
| `10.184.38.0/24` | `10.184.38.234`, `10.184.38.235` |
| `10.184.39.0/24` | none |
| `192.168.254.0/24` | none |

TCP `4370` sweeps of the same likely ranges also found only:

- `10.184.38.234`
- `10.184.38.235`

Broadcast ZK discovery was already tested earlier in the same day and returned
no replies from the routed VM position.

### 4. Full SDK Read Attempts

Full PyZK reads after the recovery attempts:

| Device | Result |
| --- | --- |
| `10.184.38.9` | failed after about 34.0s, `ZKNetworkError('timed out')` |
| `10.184.38.10` | failed after about 34.0s, `ZKNetworkError('timed out')` |
| `10.184.38.234` | OK: 904 users, 21,510 events, latest `2026-07-04T13:53:12`, elapsed about 37.9s |
| `10.184.38.235` | OK: 904 users, 18,087 events, latest `2026-07-04T13:44:53`, elapsed about 44.4s |

Windows host direct probes were also checked. The Windows host could not reach
even `.234` and `.235` directly, matching existing WWG drift that host direct
LAN is not the trusted device proof path. The remote VM path remains the valid
runtime evidence path.

## Implementation

Added read-only recovery modes to `vendor/zkteco-linux`:

- `--mode count`
  - Uses PyZK `read_sizes()` / ZKTeco `CMD_GET_FREE_SIZES`.
  - Reads users, attendance-log count, capacities, and available slots without
    full user/event downloads.
  - Supports `--force-udp`, the fastest proven count path.
- `--mode discover`
  - Runs bounded directed UDP/ZK sweeps over explicit `--discover-cidr` ranges.
  - Reports only devices that answer `read_sizes()`.
  - Does not write to devices, clear logs, post HRIS events, or change runtime
    configuration.

Validation:

```text
python vendor\zkteco-linux\tests\test_probe.py
```

Result:

```text
Ran 10 tests in 0.220s - OK
```

Remote validation via `/tmp` copy inside the bridge container:

- `count --force-udp` returned `.234` and `.235` counts in about 0.12s each.
- `.9` and `.10` timed out after 8s each.
- `discover` scanned 1,016 hosts across four CIDRs and found only `.234` and
  `.235`.

## Current Blocker

The blocker is real network/device reachability for `10.184.38.9` and
`10.184.38.10` from the remote VM path.

Evidence:

- No ICMP replies.
- TCP `4370` failed through long timeouts before same-subnet test.
- Temporary same-subnet address produced `No route to host`, indicating failed
  neighbor/L2 resolution.
- Temporary gateway/source-route variants did not recover `.9` or `.10`.
- UDP/ZK failed through long timeouts.
- Full PyZK reads failed after about 34s.
- Directed TCP and UDP/ZK sweeps of likely adjacent ranges found no moved
  replacements.

The next recovery step requires external network/physical evidence outside the
VM, such as switch port/VLAN/cabling/power/device IP panel confirmation for
`.9` and `.10`, or access to the gateway/switch ARP/MAC tables. Continuing
inside the VM alone cannot prove users/events for devices that do not answer
ICMP, TCP, UDP, or ARP/neighbor resolution from that runtime path.

Because device-screen photos confirm `.9` and `.10` are configured with the
expected IPs, subnet, gateway, and TCP port, the most likely causes are now:

- the two devices are currently offline/rebooting/frozen;
- their Ethernet links or switch ports are down;
- their switch ports are on a different VLAN/path than `.234/.235`;
- gateway or switch policy currently blocks the VM path to those two IPs;
- the old Windows/zkemkeeper proof ran from a different network position or at
  a time when the devices were reachable.

## WWG Truth Synchronization

- New truth detected: YES.
- Wiki updated: YES.
- Workspace updated: NO.
- Governance updated: YES, recommendation registry retained discovery work.
- Reports updated: YES, this report and implementation log entry.
- Code updated: YES, removable read-only probe modes in `vendor/zkteco-linux`.
- Runtime changed: NO persistent runtime/network change left behind.
- Cloudflare tunnel changed: NO.

## Final Status

PARTIALLY FULFILLED WITH REAL BLOCKER.

Two devices were fully queried again. Two configured devices remain unreachable
from the remote runtime after reversible VM network recovery, directed
discovery, long timeout SDK attempts, and full source reads.
