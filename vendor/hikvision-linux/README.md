# Project Truth Hikvision Linux Trial

Linux-side Hikvision connectivity and biometric-sync proof for Project Truth.

This folder intentionally does not vendor proprietary Hikvision SDK binaries,
headers, samples, device credentials, or local customer data. It provides a
small read-only Python probe and a Project Truth-named HCNetSDK biometric
service scaffold. Run them directly in the Ubuntu VM or in a container to prove
the network path, ISAPI handshake, SDK login, alarm callback, and dry-run
reconciliation before any device mutation.

## Device Targets

Default trial targets follow the current BNPI PATS Device row truth. Do not use old
SADP/dev watcher addresses as defaults.

| Name | Address | Port | Protocol |
| --- | --- | ---: | --- |
| Main Entrance Device ISAPI | `10.184.37.139` | 80 | HTTP ISAPI |
| Main Entrance Device SDK | `10.184.37.139` | 8000 | TCP SDK service |

Current UI truth: `Main Entrance Device`, vendor `Hikvision`, model
`DS-K1T341CMFW`, address `10.184.37.139`, HTTP port `80`. SDK port is `8000`
when present in device config. The BNPI PATS `Device` row is the source of truth.

## Local Python Trial

```bash
cd vendor/hikvision-linux
python3 -m venv .venv
. .venv/bin/activate
python -m pip install -r requirements.txt
python -m hikvision_linux_probe --mode tcp
```

For a read-only ISAPI system-time handshake, supply credentials at runtime:

```bash
export HIKVISION_USERNAME='<device-user>'
export HIKVISION_PASSWORD='<device-password>'
python -m hikvision_linux_probe --mode isapi-time
```

The probe calls `GET /ISAPI/System/time`. It does not write users, change
device configuration, clear logs, restart the device, or post BNPI PATS events.

BNPI PATS device-console **Preview time / Update time** uses this binary over
HCNetSDK `NET_DVR_STDXMLConfig`: `--get-time` (read) and `--set-time --local-time
<ISO+08:00> --execute` (write). That is SDK login on port 8000, not a host HTTP
PUT from Windows. Rebuild/restart the hot-reload listener after this source
changes.

## Source layout

```text
vendor/hikvision-linux/
  include/hikvision_bio/     types, common, time, runtime, matching module headers
  src/hikvision_bio/
    common.cpp               JSONL + STDXML + shared JSON extract helpers
    time.cpp                 --get-time / --set-time
    acs.cpp                  ACS classify + alarm_callback
    identity.cpp             UserInfo / person resolve
    fingerprint.cpp          fingerprint templates
    face.cpp                 face templates + stored-face writer
    copy.cpp                 peer copy
    spool.cpp                BNPI PATS post + replay
    runtime.cpp              queues, login/arm
    main.cpp                 CLI entry
```

Still one binary: `build/hikvision-biometric-service`. CLI and JSONL are unchanged.

## Rollback

If the new units fail to compile or the listener misbehaves after this split:

| Step | Action |
|---|---|
| Soft | Hot-reload wrapper keeps the last ELF if `g++` fails (`keeping existing binary`). Devices stay on the previous binary. |
| Hard | Revert `301ebb5` then `66868a2` on `develop` (restores `6b670a4` foldered `.inc.cpp` unity). Push. Wrapper rebuilds from `include/` + `src/`. |
| Last good source | `6b670a4` — `main.cpp` includes `.inc.cpp`; build is `common.cpp` + `time/device_time.cpp` + `main.cpp`. |

Do not go back to `ad98250` (monolith) unless `6b670a4` itself is broken.

Full table: `.wwg/reports/hikvision-cpp-maintainable-units-20260819.md`.

To query recent ACS event history directly from the device:

```bash
python -m hikvision_linux_probe --mode acs-events \
  --target "Main Entrance Device ISAPI=10.184.37.139:80:http" \
  --lookback-minutes 10
```

To watch while somebody taps:

```bash
python -m hikvision_linux_probe --mode watch \
  --target "Main Entrance Device ISAPI=10.184.37.139:80:http" \
  --lookback-minutes 10 \
  --loops 12 \
  --interval 5
```

These modes read from the biometric device only. They do not inspect BNPI PATS DB,
BNPI PATS API, attendance tables, or saved device events.

From the Windows repo root, the VM wrapper is:

```powershell
$env:HIKVISION_PASSWORD='<device-password>'
.\vendor\hikvision-linux\scripts\discover-device-truth.ps1
```

## Linux HCNetSDK Biometric Service

Build on the VM with the local SDK installed:

```bash
cd vendor/hikvision-linux
export HIKVISION_LINUX_SDK_ROOT=/home/infra/project-truth-hcnetsdk/EN-HCNetSDKV6.1.9.48_build20230410_linux64
scripts/build-hikvision-biometric-service.sh
```

Run the live listener against the current Device row target:

```bash
./build/hikvision-biometric-service \
  --device "main-entrance|<org-id>|Main Entrance Device|10.184.37.139|8000|$HIKVISION_USERNAME|$HIKVISION_PASSWORD|true" \
  --bnpi-pats-api-base "http://localhost:3001" \
  --evidence-jsonl ".runtime/hikvision-biometric-service.jsonl" \
  --seconds 60
```

For a managed service, prefer a root-readable device spec file so the device
password does not appear in process arguments:

```bash
./build/hikvision-biometric-service \
  --device-file /run/project-truth/hikvision-device.spec \
  --bnpi-pats-api-base "http://localhost:3001" \
  --evidence-jsonl ".runtime/hikvision-biometric-service.jsonl"
```

The default mode is execute for live tap debugging, so SDK alarm events are
posted to `/api/hikvision/callback` and saved in BNPI PATS. Pass `--dry-run` only
when you intentionally want preview-only evidence that does not persist saved
`DeviceEvent` rows. Raw fingerprint template bytes are never written to normal
BNPI PATS `User` records or JSONL evidence.

When the reviewed Device Users merge job must exclusively own SDK writes, set
`HIKVISION_AUTOMATIC_PEER_RECONCILE=false` on the managed listener. The listener
still logs in, arms alarm callbacks, and posts Device Events, while automatic
inventory polling and event-triggered peer writes are paused. Manual reviewed
copy processes remain enabled because they run as explicit `manual_*` jobs.

## Docker Trial

```bash
cd vendor/hikvision-linux
docker build -t project-truth-hikvision-linux-trial:local .
docker run --rm --network host project-truth-hikvision-linux-trial:local --mode tcp
docker run --rm --network host \
  -e HIKVISION_USERNAME \
  -e HIKVISION_PASSWORD \
  project-truth-hikvision-linux-trial:local --mode isapi-time
```

## Opaque log ID SDK dry-run probe (HCNetSDK)

Read-only C++ probe that logs in with HCNetSDK, pulls UserInfo + logSearch + AcsEvent
via `NET_DVR_STDXMLConfig`, tries `NET_DVR_FindDVRLog_V50`, and compares opaque
`LogAddInfo.EmployeeNo` tokens to plain inventory `employeeNo`.

```powershell
# From Windows repo root (agent-owned: export credentials, stage SDK, build, run, evidence)
$env:FORCE_DATABASE_URL = 'postgresql://postgres:postgres@127.0.0.1:55435/bnpi_pats?schema=public'
powershell -File vendor/hikvision-linux/scripts/run-opaque-id-sdk-probe.ps1
```

Sources:

- `opaque_id_sdk_probe.cpp` — dry-run probe (no device writes)
- `Dockerfile.opaque-id-sdk-probe` — debian + g++ + local linux64 SDK
- `scripts/export-test-a-device-spec.cjs` — writes `.runtime/opaque-id-sdk-probe/device.spec`
- Evidence lands under `.runtime/opaque-id-sdk-probe/<stamp>/`


Use host networking for the first VM proof so the container sees the same LAN
routing as the VM.

## Linux HCNetSDK Preparation

The official Linux HCNetSDK package is a local runtime input. Do not commit it
to this repo. When it is installed on the VM or mounted into a container, point
the probe at it for a non-invasive presence check:

```bash
export HIKVISION_LINUX_SDK_ROOT=/opt/hikvision/HCNetSDK
python -m hikvision_linux_probe --mode sdk-env
```

For Docker:

```bash
docker run --rm \
  -e HIKVISION_LINUX_SDK_ROOT=/opt/hikvision/HCNetSDK \
  -v /opt/hikvision/HCNetSDK:/opt/hikvision/HCNetSDK:ro \
  project-truth-hikvision-linux-trial:local --mode sdk-env
```

Passing `sdk-env` is not an alarm-listener proof. It only verifies that the
expected local SDK inputs are present without committing them.

## Output

The CLI writes one JSON object per stage. A successful TCP probe proves only
that a port is reachable. A successful `isapi-time` probe proves read-only ISAPI
device handshake. A future HCNetSDK listener must still prove login, alarm
receipt, BNPI PATS callback ingestion, saved device-event rows, browser rendering,
and LAN/public runtime evidence.
