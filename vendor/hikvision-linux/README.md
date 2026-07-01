# Project Truth Hikvision Linux Trial

Experimental Linux-side Hikvision connectivity proof for Project Truth.

This folder intentionally does not vendor proprietary Hikvision SDK binaries,
headers, samples, device credentials, or local customer data. It provides a
small read-only Python probe that can be run directly in the Ubuntu VM or in a
Docker container to prove the network path and ISAPI handshake before a later
Linux HCNetSDK listener is added.

## Device Targets

Default trial targets:

| Name | Address | Port | Protocol |
| --- | --- | ---: | --- |
| Main Entrance Device ISAPI | `192.168.254.181` | 80 | HTTP ISAPI |
| Main Entrance Device SDK | `192.168.254.181` | 8000 | TCP SDK service |

Earlier notes mention `192.168.1.61:8000`; use that only when the current LAN
route is proven.

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
device configuration, clear logs, restart the device, or post HRIS events.

To query recent ACS event history directly from the device:

```bash
python -m hikvision_linux_probe --mode acs-events \
  --target "Bandai Hikvision ISAPI=10.184.38.215:80:http" \
  --lookback-minutes 10
```

To watch while somebody taps:

```bash
python -m hikvision_linux_probe --mode watch \
  --target "Bandai Hikvision ISAPI=10.184.38.215:80:http" \
  --lookback-minutes 10 \
  --loops 12 \
  --interval 5
```

These modes read from the biometric device only. They do not inspect HRIS DB,
HRIS API, attendance tables, or saved device events.

From the Windows repo root, the VM wrapper is:

```powershell
$env:HIKVISION_PASSWORD='<device-password>'
.\vendor\hikvision-linux\scripts\discover-device-truth.ps1
```

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
receipt, HRIS callback ingestion, saved device-event rows, browser rendering,
and LAN/public runtime evidence.
