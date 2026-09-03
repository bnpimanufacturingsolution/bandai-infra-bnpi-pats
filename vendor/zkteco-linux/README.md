# Project Truth ZKTeco Linux Trial

Experimental Linux-side ZKTeco connectivity proof for Project Truth.

This folder intentionally does not vendor third-party source. It installs the
`pyzk` package from PyPI inside a Python virtual environment or Docker image and
uses it only for read-only connectivity/handshake trials by default.

## Device Targets

Default trial targets:

| Name | Address | Port | Protocol |
| --- | --- | ---: | --- |
| ZKTeco Device 10.184.38.9 | `10.184.38.9` | 4370 | TCP |
| ZKTeco Device 10.184.38.235 | `10.184.38.235` | 4370 | TCP |
| ZKTeco Device 10.184.38.234 | `10.184.38.234` | 4370 | TCP |
| ZKTeco Device 10.184.38.10 | `10.184.38.10` | 4370 | TCP |

Hikvision `192.168.1.61:8000` is included only in TCP probe commands when
explicitly supplied. It is not a ZKTeco/PyZK target.

## Local Python Trial

```bash
cd vendor/zkteco-linux
python3 -m venv .venv
. .venv/bin/activate
python -m pip install -r requirements.txt
python -m zkteco_linux_probe --mode tcp
python -m zkteco_linux_probe --mode handshake
python -m zkteco_linux_probe --mode count --force-udp
python -m zkteco_linux_probe --mode discover --discover-cidr 10.184.38.0/24 --timeout 1 --discover-workers 96
python -m zkteco_linux_probe --mode users
python -m zkteco_linux_probe --mode attendance
python -m zkteco_linux_probe --mode history
python -m zkteco_linux_probe --mode capabilities
```

The handshake mode connects, reads light metadata when supported, and
disconnects. It does not clear logs, write users, restart devices, or post HRIS
events.

The count mode uses PyZK `read_sizes()` / ZKTeco `CMD_GET_FREE_SIZES` to read
source-device summary counts without downloading every user or attendance row.
Use `--force-udp` for the fastest proven count path on the current Project
Truth terminals.

The discover mode performs a bounded directed UDP/ZK sweep over explicitly
supplied CIDR ranges and reports only devices that answer `read_sizes()`. It is
read-only and intended for admin recovery/debugging when configured ZKTeco IPs
drift. Broadcast discovery is not assumed to work across the current routed VM
network.

The `users`, `attendance`, and `history` modes read source-device user and
stored attendance records from the terminals through PyZK. They are read-only
probe modes for runtime truth collection; they do not post to HRIS and they do
not prove realtime watch behavior.

The capabilities mode prints the current runtime boundary as JSON. It reports
the Linux PyZK bridge as the canonical Project Truth ZKTeco path. Attendance
count parity, realtime push mode, and managed GitOps/K3s runtime still require
separate evidence before they are claimed.

## Docker Trial

```bash
cd vendor/zkteco-linux
docker build -t project-truth-zkteco-linux-trial:local .
docker run --rm --network host project-truth-zkteco-linux-trial:local --mode tcp
docker run --rm --network host project-truth-zkteco-linux-trial:local --mode handshake
docker run --rm --network host project-truth-zkteco-linux-trial:local --mode count --force-udp
docker run --rm --network host project-truth-zkteco-linux-trial:local --mode discover --discover-cidr 10.184.38.0/24 --timeout 1 --discover-workers 96
docker run --rm --network host project-truth-zkteco-linux-trial:local --mode history
docker run --rm --network host project-truth-zkteco-linux-trial:local --mode capabilities
```

Use host networking for the first VM proof so the container sees the same LAN
routing as the VM.

## Output

The CLI writes one JSON object per device. A successful TCP probe is not the
same as a successful ZKTeco protocol handshake.

This scaffold is the Linux-first sidecar replacement for Project Truth. The
retired Windows COM SDK and Node bridge paths should not be reintroduced as
normal runtime dependencies.
