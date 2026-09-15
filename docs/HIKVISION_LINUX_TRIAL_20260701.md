# Hikvision Linux Trial - 2026-07-01

Task mode: Experimental runtime scaffold and Docker proof.

## Summary

Project Truth now has a Linux/Docker Hikvision probe scaffold at
`vendor/hikvision-linux`.

The scaffold proves the tool shape, local tests, VM tests, Docker image build,
and direct Linux VM TCP reachability to the current Bandai Hikvision candidate
device at `10.184.38.215`.

This file records vendor/device-source truth only. BNPI PATS DB/API rows, saved
device events, and attendance tables are intentionally not used as evidence for
this pass.

## VM Target

- VM hostname: `project-truth-node`
- Current reachable VM IP for this pass: `10.184.38.144`
- SSH key used from Windows host:
  `%USERPROFILE%\.ssh\bnpi_pats_cloudflare_ed25519`
- Stale path observed during this pass: `192.168.254.148:22` timed out from
  the Windows host.

## Current Device-Source Finding

On 2026-07-01, the vendor-only discovery wrapper was added and run:

```powershell
.\vendor\hikvision-linux\scripts\discover-device-truth.ps1
```

Scope:

```text
vendor/device only; no BNPI PATS DB/API reads
```

Result from inside Linux VM `project-truth-node`:

| Target | Result |
| --- | --- |
| `10.184.38.215:80` / ISAPI HTTP | TCP OK |
| `10.184.38.215:8000` / SDK service | TCP OK |

The default username for the next credentialed pass is:

```text
admin@bandai.local
```

`HIKVISION_PASSWORD` was not set in the shell, so credentialed ISAPI time and
ACS event discovery were skipped by design.

Follow-up credentialed pass on 2026-07-01:

| Probe | Result |
| --- | --- |
| `GET /ISAPI/System/time` with username `admin` | HTTP 200 |
| `GET /ISAPI/System/time` with username `admin@bandai.local` | HTTP 401 |
| `POST /ISAPI/AccessControl/AcsEvent?format=json` with username `admin` | HTTP 200 |
| HTTP request to SDK port `10.184.38.215:8000` | TCP connects, then remote closes HTTP connection |

Device clock returned by ISAPI:

```text
localTime=2026-07-01T15:35:56+08:00
timeMode=manual
timeZone=CST-8:00:00
```

Direct device ACS history returned events. The latest observed access event
sample was:

```text
time=2026-07-01T11:42:42+08:00
employeeNoString=1
name=ernest
major=5
minor=75
serialNo=160
verifyMode=faceOrFpOrCardOrPw
doorNo=1
```

A wider 7-day ACS query returned `eventCount=30`. Recent events include access
events for employee no. `1` / `ernest` and related invalid/open/close style
events with major `5`, minors `21`, `22`, and `75`, plus device/system major
`3` events.

Watch mode was run for three loops with a 5-minute lookback. It successfully
queried the device each loop but observed no fresh tap event during that short
window.

## Live ISAPI ACS Sample - Raw and Normalized

On 2026-07-01, a development credential was supplied at runtime for username
`admin` and the VM queried the SADP-visible device at `10.184.38.215:80`.
The password was intentionally not written into tracked repo files.

The first live watch pass ran 12 loops at 5-second intervals and wrote evidence
under:

```text
/tmp/project-truth-hikvision-isapi-samples/20260701T082034Z-raw-acs.jsonl
/tmp/project-truth-hikvision-isapi-samples/20260701T082034Z-normalized-acs.jsonl
/tmp/project-truth-hikvision-isapi-samples/20260701T082034Z-summary.json
```

That watch pass had no new tap during the exact 60-second window:

```text
uniqueEvents=0
likelyFingerprintPunches=0
errors=[]
```

A widened 180-minute snapshot then captured current raw ACS history:

```text
/tmp/project-truth-hikvision-isapi-samples/20260701T082201Z-raw-acs-snapshot.jsonl
/tmp/project-truth-hikvision-isapi-samples/20260701T082201Z-normalized-acs-snapshot.jsonl
/tmp/project-truth-hikvision-isapi-samples/20260701T082201Z-summary-snapshot.json
```

Snapshot result:

```text
eventCount=7
likelyFingerprintPunches=2
statusCode=200
```

The latest raw event in that snapshot was a device access-control event:

```json
{
  "cardReaderNo": 1,
  "cardType": 1,
  "currentVerifyMode": "faceOrFpOrCardOrPw",
  "doorNo": 1,
  "major": 5,
  "mask": "unknown",
  "minor": 39,
  "serialNo": 169,
  "time": "2026-07-01T16:22:52+08:00"
}
```

One likely fingerprint/attendance raw event shape was:

```json
{
  "FaceRect": {
    "height": 0.118,
    "width": 0.211,
    "x": 0.009,
    "y": 0.835
  },
  "cardReaderNo": 1,
  "cardType": 1,
  "currentVerifyMode": "faceOrFpOrCardOrPw",
  "doorNo": 1,
  "employeeNoString": "1",
  "major": 5,
  "mask": "no",
  "minor": 75,
  "name": "ernest",
  "serialNo": 166,
  "time": "2026-07-01T15:49:46+08:00",
  "userType": "normal"
}
```

The normalized/socket-candidate shape used for the sample was:

```json
{
  "type": "device.hikvision.acs_event",
  "source": "HIKVISION_CALLBACK",
  "deviceId": "HIKVISION-TEST001",
  "employeeNo": "1",
  "eventTime": "2026-07-01T15:49:46+08:00",
  "verifyMode": "faceOrFpOrCardOrPw",
  "major": 5,
  "minor": 75,
  "serialNo": 166,
  "doorNo": 1,
  "raw": {
    "employeeNoString": "1",
    "major": 5,
    "minor": 75,
    "name": "ernest"
  }
}
```

For ISAPI ACS polling, Project Truth should treat `major=5`, `minor=75`,
and a present `employeeNoString` as a likely attendance/fingerprint-success
candidate until a wider device-code mapping is confirmed.

## Linux HCNetSDK Pass

Official SDK source used:

- Hikvision HiTools page:
  `https://www.hikvision.com/en/support/tools/hitools/clf4633a00e385d6ea/`
- Downloaded asset:
  `https://assets.hikvision.com/prd/normal/all/files/202605/EN-HCNetSDKV6.1.9.48_build20230410_linux64.zip`
- Page metadata observed: `Device Network SDK_Linux64`, version `V6.1.9.48`,
  size `64.12MB`, date `2026/05/25`.
- SHA-256:
  `8DE553FB2E8DBB0AC441EE1BD73C5ECB73D720C1359396750479A6E169ABF93F`.

The older regional SDK page also exposed:

- `https://www.hikvision.com/mena-en/support/download/sdk/device-network-sdk--for-linux-64-bit-/`
- Asset:
  `/content/dam/hikvision/en/support/download/sdk/device-network-sdk/EN-HCNetSDKV6.1.9.4_build20220412_linux64.rar`
- SHA-256:
  `EFE0F478F8DB88A1DE0356FE432862A9514B3A7E4E8DB303650A295460A141CF`.

The Linux SDK zip was extracted locally under ignored
`vendor/hikvision-linux/sdk-local/` and copied to the Linux VM under:

```text
/home/infra/project-truth-hcnetsdk/EN-HCNetSDKV6.1.9.48_build20230410_linux64
```

Expected SDK files were present on the VM:

```text
incEn/HCNetSDK.h
lib/libhcnetsdk.so
```

The VM initially lacked `g++`; `g++` and `make` were installed through apt.

Project Truth compiled a bounded SDK alarm probe:

```text
/home/infra/project-truth-hikvision-linux/build/hcnetsdk_alarm_probe
```

SDK runtime result:

```text
sdk_init ok=true
sdkVersion=393217
sdkBuildVersion=100731184
sdk_login ok=false
lastError=1
```

`lastError=1` maps to `NET_DVR_PASSWORD_ERROR` in `HCNetSDK.h`.

Boundary: this proves the official Linux HCNetSDK is downloaded, extracted,
present in the VM, loadable, and callable enough for `NET_DVR_Init()` and
version reads. It does not yet prove SDK login, `NET_DVR_SetupAlarmChan_V50`,
or callback receipt because SDK login is rejected with error `1`.

## Scaffold

Runtime path:

```text
vendor/hikvision-linux
```

Contents:

- Read-only Python probe package: `hikvision_linux_probe`
- Dockerfile: `project-truth-hikvision-linux-trial:local`
- Tests for target parsing, ISAPI URL construction, system-time XML parsing,
  TCP failure handling, and SDK environment checks.
- ACS event history and watch modes for direct device-source polling:
  `--mode acs-events` and `--mode watch`.
- VM wrapper script:
  `vendor/hikvision-linux/scripts/discover-device-truth.ps1`.
- SDK boundary: proprietary Linux HCNetSDK files are local runtime inputs only
  and must not be committed.

## Local Validation

Command:

```powershell
python -m unittest discover -s vendor\hikvision-linux\tests
```

Result:

```text
Ran 6 tests
OK
```

Host TCP probe from the Windows host to the current SADP-observed device
address failed during this pass:

| Target | Result |
| --- | --- |
| `192.168.254.181:80` | TCP timeout |
| `192.168.254.181:8000` | TCP timeout |

No direct credentialed ISAPI probe was run on the Windows host because
`HIKVISION_USERNAME` and `HIKVISION_PASSWORD` were not set in the shell
environment.

## VM Validation

The folder was copied to:

```text
/tmp/project-truth-hikvision-linux
```

VM tests passed:

```text
Ran 6 tests
OK
```

VM TCP probe results:

| Target | Result |
| --- | --- |
| `192.168.254.181:80` | TCP timeout |
| `192.168.254.181:8000` | `No route to host` or timeout across retries |
| `192.168.1.61:8000` | `No route to host` |

VM route lookup sent both `192.168.254.181` and `192.168.1.61` via gateway
`10.184.38.254` from source `10.184.38.144`, but device TCP reachability still
failed.

## Docker Validation

Command:

```bash
cd /tmp/project-truth-hikvision-linux
sudo docker build -t project-truth-hikvision-linux-trial:local .
sudo docker run --rm --network host project-truth-hikvision-linux-trial:local --mode tcp --timeout 5
```

Result:

- Docker image built successfully:
  `project-truth-hikvision-linux-trial:local eec31e2e976c 182MB`.
- Docker TCP run matched the VM route failure:

| Target | Result |
| --- | --- |
| `192.168.254.181:80` | TCP timeout |
| `192.168.254.181:8000` | `No route to host` |

## Boundary

Proven:

- `vendor/hikvision-linux` scaffold exists.
- Read-only probe tests pass locally and inside the VM.
- Docker image builds inside the VM.
- Dockerized probe runs with `--network host`.
- Linux VM can reach current Bandai Hikvision candidate
  `10.184.38.215:80` and `10.184.38.215:8000`.
- Vendor-only discovery script exists and avoids BNPI PATS DB/API evidence.
- Credentialed ISAPI time and ACS history work with username `admin`.
- Official Hikvision Linux SDK was downloaded, extracted, copied to the VM,
  and compiled against.
- HCNetSDK initializes and returns SDK/build versions on the Linux VM.
- Current route failure is captured instead of treated as success.

Not yet proven:

- Watch-mode event observation while an operator taps.
- Linux HCNetSDK login or alarm listener behavior; current SDK login fails
  with `NET_DVR_PASSWORD_ERROR (1)`.
- Device alarm receipt.
- BNPI PATS callback posting from the Linux probe.
- Saved `device_events` rows from the Linux probe.
- Browser/socket/attendance proof from the Linux path.
- GitOps/K3s managed Linux Hikvision runtime.

## Next Proof Step

Restore or verify the network route from `project-truth-node`
`10.184.38.144` to the active Hikvision device, then run:

```powershell
$env:HIKVISION_PASSWORD='<device-password>'
.\vendor\hikvision-linux\scripts\discover-device-truth.ps1
```

While the operator taps, the script runs direct device ACS polling with:

```text
python -m hikvision_linux_probe --mode watch --target "Bandai Hikvision ISAPI=10.184.38.215:80:http"
```

Only after direct device-source watch evidence passes should BNPI PATS callback, DB,
attendance, browser, or Linux HCNetSDK listener proof be promoted as the next
implementation target.
