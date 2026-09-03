# ZKTeco Linux PyZK Trial - 2026-07-01

Task mode: Experimental runtime proof and vendor scaffold.

## Summary

Project Truth now has a read-only Linux VM and Docker proof for ZKTeco device
handshake using the PyPI `pyzk` package from a local repo scaffold at
`vendor/zkteco-linux`.

This evidence is now the basis for the canonical Linux-first ZKTeco runtime.
It proves that the Ubuntu VM and a Docker container inside that VM can reach
and handshake with the four listed ZKTeco terminals.

## VM Target

- VM hostname: `project-truth-node`
- Current reachable VM IP for this pass: `10.184.38.144`
- SSH key used from Windows host:
  `%USERPROFILE%\.ssh\bnpi_hris_cloudflare_ed25519`
- Stale path observed during this pass: `192.168.254.148:22` timed out from
  the Windows host.

## TCP Probe From Inside VM

Probe time: `2026-07-01T06:59:17Z`.

| Target | Result |
| --- | --- |
| `10.184.38.9:4370` | TCP OK |
| `10.184.38.235:4370` | TCP OK |
| `10.184.38.234:4370` | TCP OK |
| `10.184.38.10:4370` | TCP OK |
| `192.168.1.61:8000` | TCP FAIL: `No route to host` |

## Bare VM PyZK Handshake

Runtime path:

```text
/tmp/project-truth-zkteco-linux
python3 -m venv .venv
pip install -r requirements.txt
python -m zkteco_linux_probe --mode handshake
```

VM dependency repaired during this pass:

```text
sudo apt-get install -y python3.12-venv
```

Results at `2026-07-01T07:01:29Z` to `2026-07-01T07:01:49Z`:

| Target | Handshake | Device | Firmware | Platform | Serial |
| --- | --- | --- | --- | --- | --- |
| `10.184.38.9:4370` | OK | `iFace302` | `Ver 6.60 Sep 10 2019` | `ZMM220_TFT` | `6160062176999` |
| `10.184.38.235:4370` | OK | `iFace302` | `Ver 6.60 Sep 10 2019` | `ZMM220_TFT` | `6160062176995` |
| `10.184.38.234:4370` | OK | `iFace302` | `Ver 6.60 Sep 10 2019` | `ZMM220_TFT` | `6160062176990` |
| `10.184.38.10:4370` | OK | `iFace302` | `Ver 6.60 Sep 10 2019` | `ZMM220_TFT` | `6160062176989` |

## Docker PyZK Handshake

Runtime path:

```text
cd /tmp/project-truth-zkteco-linux
sudo docker build -t project-truth-zkteco-linux-trial:local .
sudo docker run --rm --network host project-truth-zkteco-linux-trial:local --mode handshake
```

Results at `2026-07-01T07:03:31Z` to `2026-07-01T07:03:51Z`:

| Target | Handshake | Device | Firmware | Platform | Serial |
| --- | --- | --- | --- | --- | --- |
| `10.184.38.9:4370` | OK | `iFace302` | `Ver 6.60 Sep 10 2019` | `ZMM220_TFT` | `6160062176999` |
| `10.184.38.235:4370` | OK | `iFace302` | `Ver 6.60 Sep 10 2019` | `ZMM220_TFT` | `6160062176995` |
| `10.184.38.234:4370` | OK | `iFace302` | `Ver 6.60 Sep 10 2019` | `ZMM220_TFT` | `6160062176990` |
| `10.184.38.10:4370` | OK | `iFace302` | `Ver 6.60 Sep 10 2019` | `ZMM220_TFT` | `6160062176989` |

## Scaffold Capability Contract

The repo scaffold now has an explicit read-only boundary command:

```text
python -m zkteco_linux_probe --mode capabilities
```

It reports `canonicalHrisRuntime: false`, `status: experimental_read_only`,
and lists HRIS event posting, realtime watch mode, sidecar health/status/sync
APIs, attendance log parity, and GitOps/K3s runtime as not proven.

## Source-Device Users And Historical Events

On 2026-07-01, the Linux/PyZK scaffold read users and stored attendance
history directly from the four physical ZKTeco terminals. This evidence is from
the devices through PyZK, not from HRIS API or HRIS database rows.

Bare VM command shape:

```text
cd /tmp/project-truth-zkteco-linux
. .venv/bin/activate
python -m zkteco_linux_probe --mode history --target <name>=<ip>:4370 --timeout 10 --sample-limit 2
```

For `10.184.38.10`, a second pass used `--timeout 20` because the full history
read took about 38 seconds.

| Target | PyZK users | PyZK stored events | First PyZK event | Last PyZK event | Latest sample user |
| --- | ---: | ---: | --- | --- | --- |
| `10.184.38.9:4370` | 904 | 8,410 | `2022-12-31T17:39:06` | `2026-07-01T15:21:06` | `1321` |
| `10.184.38.235:4370` | 904 | 17,033 | `2026-05-01T05:33:18` | `2026-07-01T13:50:15` | `909` |
| `10.184.38.234:4370` | 904 | 20,697 | `2022-12-31T05:36:18` | `2026-07-01T13:55:29` | `1691` |
| `10.184.38.10:4370` | 904 | 30,511 | `2022-12-31T05:47:24` | `2026-07-01T15:23:40` | `1811` |

Dockerized PyZK with `--network host` also read history:

| Target | Docker PyZK users | Docker PyZK stored events | Last Docker PyZK event | Note |
| --- | ---: | ---: | --- | --- |
| `10.184.38.9:4370` | 904 | 8,412 | `2026-07-01T15:23:59` | Two additional punches arrived after the bare VM pass. |
| `10.184.38.235:4370` | 904 | 17,033 | `2026-07-01T13:50:15` | Matched bare VM count. |
| `10.184.38.234:4370` | 904 | 20,697 | `2026-07-01T13:55:29` | Matched bare VM count. |
| `10.184.38.10:4370` | 904 | 30,527 | `2026-07-01T15:25:31` | Needed `--timeout 20`; new punches arrived after the bare VM pass. |

Comparison with the 2026-06-29 Windows Standalone SDK summary:

| Target | Windows SDK users | PyZK users | User drift | Windows SDK events | PyZK events | Event drift |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| `10.184.38.9:4370` | 905 | 904 | -1 | 12,581 | 8,410 | -4,171 |
| `10.184.38.235:4370` | 905 | 904 | -1 | 21,160 | 17,033 | -4,127 |
| `10.184.38.234:4370` | 905 | 904 | -1 | 31,391 | 20,697 | -10,694 |
| `10.184.38.10:4370` | 907 | 904 | -3 | 41,586 | 30,511 | -11,075 |

Interpretation:

- Linux/PyZK can read real users and historical punches from all four
  terminals.
- Linux/PyZK is not yet parity with the historical Windows SDK event totals.
- PyZK saw newer punches on 2026-07-01, so the lower counts are not simply
  stale connectivity.
- Do not promote PyZK as the canonical runtime until the count drift is
  explained and realtime/watch plus HRIS posting are proven.

## Boundary

Proven:

- VM network route to all four ZKTeco devices.
- PyZK import/install in the Linux VM.
- Read-only PyZK handshake and metadata reads in the Linux VM.
- Dockerized PyZK handshake inside the VM with `--network host`.
- Read-only PyZK user and stored-attendance history reads from all four known
  ZKTeco terminals.

Not yet proven:

- Attendance log read parity against the Windows SDK summary counts. The
  2026-07-01 PyZK history pass returned fewer stored events than the
  2026-06-29 historical Windows SDK summary on every device.
- Realtime event watch behavior.
- Dedupe and HRIS `/api/zkteco/events` posting.
- Sidecar `/health`, `/status`, and `/sync` API compatibility.
- GitOps/K3s deployment as the active runtime.
- Hikvision `192.168.1.61:8000` routing from the VM.
