# ZKTeco Runtime Truth

Task mode: Linux-first runtime truth.
Last updated: 2026-07-01.

## Active Runtime

Project Truth now treats `vendor/zkteco-linux` as the canonical ZKTeco runtime
path.

The runtime is a Linux/PyZK bridge that:

- connects to the four known ZKTeco TCP terminals on port `4370`;
- serves `/health`, `/status`, and `POST /sync` on port `4371` inside the
  container;
- posts BNPI PATS event payloads to `/api/zkteco/events`;
- is wired into Docker Compose as `zkteco-linux-bridge`,
  `zkteco-linux-bridge-dev`, and `zkteco-linux-bridge-uat`.

The retired Windows COM SDK and retired Node bridge are no longer normal
Project Truth runtime paths. Do not reintroduce `vendor/zkteco-sdk`,
`appliance/zkteco-standalone-sdk`, or `appliance/zkteco-bridge` as active
dependencies.

## Current Evidence

On 2026-07-01, after expanding the VM disk, Ubuntu root was grown from the full
78 GB partition to a 491 GB filesystem with about 394 GB free.

The Linux VM at `10.184.38.144` proved TCP reachability to all four terminals:

| Target | Result |
| --- | --- |
| `10.184.38.9:4370` | TCP OK |
| `10.184.38.235:4370` | TCP OK |
| `10.184.38.234:4370` | TCP OK |
| `10.184.38.10:4370` | TCP OK |

The prior VM-only Node bridge was observed posting to PROD, DEV, and UAT, but
that bridge was a drift source because it existed on the VM while the repo did
not contain the matching runtime. The replacement path is the repo-owned
Linux/PyZK bridge in `vendor/zkteco-linux`.

## Device Contract

For each ZKTeco device row:

- `protocol` is `tcp`;
- `port` is `4370`;
- `config.vendor` is `ZKTeco`;
- `config.source` is `vendor/zkteco-linux`;
- `config.webhookPath` is `/api/zkteco/events`.

Incoming ZKTeco events are stored with `DeviceEventSource` value
`ZKTECO_EVENT`.

The admin device events screen is an `bnpi-pats-admin` surface:

```text
/admin/configuration/devices/events?view=saved&source=ZKTECO_EVENT
```

## Remaining Boundaries

Still not claimed:

- exact event-count parity with the earlier Windows SDK baseline;
- realtime push parity versus polling;
- GitOps/K3s-managed Linux bridge runtime;
- production attendance/payroll readiness from ZKTeco events beyond the
  existing tested BNPI PATS event contract.

Historical Windows SDK counts remain useful only as migration comparison data.
They are not active runtime instructions.
