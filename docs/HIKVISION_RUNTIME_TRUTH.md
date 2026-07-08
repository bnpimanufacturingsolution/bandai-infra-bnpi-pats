# Hikvision Runtime Truth

Task mode: Linux-first SDK/runtime truth.
Last updated: 2026-07-08.

## Active Runtime Direction

Project Truth now treats `vendor/hikvision-linux` as the only active Hikvision
SDK/runtime scaffold in this repo.

The removed Windows `vendor/hikvision-bio` submodule and AlarmDemo helper
scripts are no longer normal runtime dependencies. Do not reintroduce
`vendor/hikvision-bio`, `AlarmDemo.exe`, or a Windows HCNetSDK listener as the
Project Truth default path.

## Current Linux Evidence

`vendor/hikvision-linux` contains:

- a read-only Python probe for TCP reachability, ISAPI system time, ACS event
  history, and watch loops;
- a Dockerfile for Linux VM/container tests;
- a bounded C++ Linux HCNetSDK alarm probe source file;
- scripts for VM-side device-source discovery.

On 2026-07-01, the Linux VM at `10.184.38.144` proved TCP reachability to the
current Bandai Hikvision candidate:

| Target | Result |
| --- | --- |
| `10.184.38.215:80` | TCP OK |
| `10.184.38.215:8000` | TCP OK |

Credentialed ISAPI with username `admin` read device time and ACS history from
`10.184.38.215:80`. Recent ACS history included employee no. `1` / `ernest`.
On 2026-07-01, a runtime-only development credential was supplied to capture
raw and normalized ISAPI ACS samples on the VM under
`/tmp/project-truth-hikvision-isapi-samples/`. The widened snapshot captured
7 raw ACS events and 2 likely fingerprint/attendance candidates. The observed
candidate shape used `major=5`, `minor=75`, `employeeNoString=1`,
`currentVerifyMode=faceOrFpOrCardOrPw`, `doorNo=1`, and `serialNo`.

Official Hikvision Linux HCNetSDK `V6.1.9.48` was downloaded, extracted, copied
to the Linux VM, compiled against, and initialized. `NET_DVR_Init()` and SDK
version reads worked. SDK login/alarm callback is still not proven because SDK
login returned `NET_DVR_PASSWORD_ERROR (1)`.

## HRIS Contract

The HRIS callback path remains:

```text
/api/hikvision/callback
```

Accepted stored sources remain:

- `HIKVISION_CALLBACK`
- `EN_HCNETSDK_ALARM`

As of 2026-07-08, the HRIS callback parser accepts Hikvision HTTP-host XML
aliases used by physical terminals, including `ipAddress` for observed device
matching and `dateTime` for punch time. Localhost callback proof passed against
the DEV API after restart: posting XML with `ipAddress=10.184.38.96` matched
the current local `Main Entrance Device` row and persisted a marked
`HIKVISION_CALLBACK` `DeviceEvent`; the marked smoke row was deleted after
verification. Boundary: `localhost` is valid for a local SDK/watcher process
running on the same machine as the HRIS API. A physical Hikvision terminal must
post to a LAN-reachable or tunneled HRIS API URL; configuring the terminal
itself to `localhost` points back at the terminal, not the Windows host API.

The active seed source for the default Hikvision device is now
`vendor/hikvision-linux`. Default seeding uses the current reachable Hikvision
candidate `10.184.38.215` for HTTP/ISAPI on port `80`, with SDK/server port
`8000` recorded separately in device config. Do not treat `800`, `8000`, and
HTTP port `80` as interchangeable values.

## Current Device Evidence

Hikvision physical-device evidence remains split:

- Historical SADP screenshot evidence showed `DS-K1T201AEF` at
  `192.168.254.181:8000`.
- DEV proof on 2026-06-30 showed HRIS can reach `192.168.254.181:80`, pull ACS
  events, save a `HIKVISION_CALLBACK` row, and render it in the admin
  saved-events UI.
- DEV VM/K3s watcher proof showed ACS-pull ingestion into saved device events.
- UAT temporary seed proof showed callback-shaped attendance creation for
  employee no. `1`.
- The current Linux candidate path is `10.184.38.215`, which is reachable from
  the VM on HTTP/ISAPI port `80` and SDK/server port `8000`, and works for
  ISAPI history reads.
- On 2026-07-02, DEV K3s runtime at `10.184.38.138` had `Main Entrance Device`
  configured as `10.184.38.215:80` / `http`; its config was merged with
  `vendor=Hikvision`, `source=vendor/hikvision-linux`, `sdkPort=8000`, and
  `webhookPath=/api/hikvision/callback` while preserving existing
  `hikvisionClockSkew*` evidence. Recent `device_events` rows for that device
  were `HIKVISION_CALLBACK` / `ATTENDANCE_CREATED`.

## Remaining Boundaries

Still not claimed:

- Linux HCNetSDK login and alarm callback receipt;
- spontaneous device push callback from the physical terminal;
- managed Linux Hikvision container/service in Docker Compose or GitOps;
- PROD/UAT parity from direct physical ACS pull;
- full attendance journey proof from the Linux SDK path.
- authoritative Hikvision minor-code mapping for every ACS event variant beyond
  the observed ISAPI polling sample.

Linux ISAPI/ACS polling is the safe current path. Linux HCNetSDK alarm listening
must remain experimental until SDK login and callback receipt are proven with
device-source evidence.
