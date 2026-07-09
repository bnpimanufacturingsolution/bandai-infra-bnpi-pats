# Hikvision Runtime Truth

Task mode: Linux-first SDK/runtime truth.
Last updated: 2026-07-09.

## 2026-07-09 Host-Test VM Real-Tap Continuation

Current evidence from `.runtime/hikvision-real-tap-pipeline-20260709-125441`:

- Local API dry-run proof passed against `http://localhost:3001`: health
  returned healthy, `admin@bandai.local` login succeeded, and
  `/api/hikvision/callback?preview=true` matched `Main Entrance Device`
  `cmpxw13hx002h7zwso7dyedrn` at `10.184.37.139:80` with source
  `EN_HCNETSDK_ALARM`. The preview marker saved zero rows.
- Host-test VM `10.184.37.241` now reaches the physical Hikvision device:
  ping to `10.184.37.139` passed with 0% loss, TCP `80` passed, and TCP
  `8000` passed.
- Docker is running on the host-test VM. PROD/DEV/UAT HRIS app/API containers
  are healthy enough for runtime inspection, and the VM has Linux HCNetSDK at
  `/home/infra/project-truth-hcnetsdk/EN-HCNetSDKV6.1.9.48_build20230410_linux64`.
- The current local `vendor/hikvision-linux` source was copied to a task-scoped
  VM temp folder and built with
  `scripts/build-hikvision-biometric-service.sh`; the resulting
  `hikvision-biometric-service` binary linked to `libhcnetsdk.so`, `libhpr.so`,
  and `libHCCore.so`.
- A bounded service run proved `NET_DVR_Init` and
  `NET_DVR_SetDVRMessageCallBack_V51` registration on the host-test VM, then
  `NET_DVR_Login_V40` failed with HCNetSDK error `1` because no real Hikvision
  device credential pair was available from VM env, Docker env, Kubernetes env,
  local config, or previous evidence searched in this pass.
- Because SDK login and alarm arm were blocked by missing credentials, the
  saved-row/socket/browser proof is explicitly a non-production simulation:
  a unique SDK-shaped `EN_HCNETSDK_ALARM` callback saved `DeviceEvent`
  `cmrd1gb4900347zk0v59jp7e6`, emitted `device-event:saved`, and the API query
  returned the saved row. A second browser-in-the-loop simulation opened
  `http://localhost:5175/admin/configuration/devices/events?deviceId=cmpxw13hx002h7zwso7dyedrn&source=EN_HCNETSDK_ALARM`
  before posting, waited for "Saved rows update live", then displayed the new
  marker `CODEX-UI-LIVE-HCNETSDK-READY-1783573373427` with "Socket received"
  without manual refresh.
- Host-test VM drift was observed: the existing `hris-hikvision-watcher` path is
  still running with stale `HIKVISION_DEVICE_ADDRESS=10.184.38.215`. That
  watcher is not the real-tap HCNetSDK service and must not be used as proof for
  the current `10.184.37.139` device row.

Boundary: VM/device reachability is no longer the blocker for the host-test VM.
Real SDK login, `NET_DVR_SetupAlarmChan_V50`, physical tap callback receipt,
attendance/timesheet projection from a real tap, and real browser live-row proof
remain unproven until valid Hikvision SDK credentials are supplied through a
documented runtime source. The simulation rows prove only the HRIS
callback/persistence/socket/UI leg.

## 2026-07-09 HCNetSDK Single-Source Pass

Current implementation state:

- `hikvision_biometric_service.cpp` is the only active C++ HCNetSDK runtime
  source under `vendor/hikvision-linux`.
- The old `hcnetsdk_alarm_probe.cpp` source and `build-hcnetsdk-alarm-probe.sh`
  active build path were removed. The active build script is
  `scripts/build-hikvision-biometric-service.sh`.
- The service registers `NET_DVR_SetDVRMessageCallBack_V51`, arms devices with
  `NET_DVR_SetupAlarmChan_V50` after login, queues every ACS alarm for HRIS
  posting, and queues biometric/user-management reconcile work separately.
- The HRIS event post target is `/api/hikvision/callback` with source
  `EN_HCNETSDK_ALARM`; that existing callback controller remains the single
  owner of `DeviceEvent` persistence, attendance/timesheet projection, cache
  invalidation, and `device-event:saved` socket emission.
- `/api/hikvision/callback?preview=true` now provides a safe non-mutating
  endpoint proof path. Preview matched `Main Entrance Device` at
  `10.184.37.139:80`, classified the SDK-shaped event as attendance-capable,
  returned the dedupe key, and did not create a saved row for the preview marker.
- `/api/device/biometric-sync/reconcile` dry-run returned planned
  `DeviceUser`/biometric metadata changes with `rawFingerprintTemplateStored:
  false`.

Current runtime-owner evidence:

- Windows host reached `10.184.37.139:80` and `10.184.37.139:8000`.
- Direct VM runtime at `10.184.37.19` still failed TCP to
  `10.184.37.139:80` and `:8000` with `No route to host`.
- The VM has Linux HCNetSDK and `g++`; the service compiled and linked against
  `libhcnetsdk.so`.
- A bounded VM service run proved `NET_DVR_Init` and
  `NET_DVR_SetDVRMessageCallBack_V51` registration, but `NET_DVR_Login_V40`
  failed before alarm arming because the VM cannot route to the device.
- WSL is not currently a usable host-local Linux service runtime: only
  `docker-desktop` is registered and it has no normal `bash` userland; Docker
  Desktop's Linux engine was not running during this pass.

Boundary: real SDK login, `NET_DVR_SetupAlarmChan_V50` arm success, physical tap
callback receipt, saved-row socket delivery, and browser live-row proof remain
unproven until a Linux runtime that can reach `10.184.37.139:8000` is available
and valid Hikvision device credentials are supplied at runtime.

## Active Runtime Direction

Project Truth now treats `vendor/hikvision-linux` as the only active Hikvision
SDK/runtime scaffold in this repo.

Runtime watchers must not encode a physical Hikvision IP in GitOps, Docker, or
script defaults. The HRIS `Device` row is the single config truth for the device
name, model, address, port, protocol, SDK port, and webhook path. Watchers should
use `scripts/audit-hikvision-device-events.ts --all-hikvision` so they discover
configured Hikvision devices from the DB and follow admin-side device config
changes without a manifest edit. This watcher belongs in the Linux/VM runtime
path; Windows-host local-dev bootstrap must not start a second Hikvision watcher
process.

Current admin UI / HRIS Device row truth, as verified on 2026-07-09:

| Field | Value |
| --- | --- |
| Device name | `Main Entrance Device` |
| Vendor/model | `Hikvision` / `DS-K1T341CMFW` |
| HTTP address | `10.184.37.139:80` |
| Protocol | `http` |
| SDK port | `8000` when present in device config |

Older Hikvision addresses such as `192.168.254.181`, `10.184.38.215`, and
`10.184.38.96` are historical evidence only. They must not be used as defaults
or active runtime targets unless the HRIS `Device` row is deliberately changed
and re-verified.

The removed Windows `vendor/hikvision-bio` submodule and AlarmDemo helper
scripts are no longer normal runtime dependencies. Do not reintroduce
`vendor/hikvision-bio`, `AlarmDemo.exe`, or a Windows HCNetSDK listener as the
Project Truth default path.

## Current Linux Evidence

`vendor/hikvision-linux` contains:

- a read-only Python probe for TCP reachability, ISAPI system time, ACS event
  history, and bounded watch diagnostics;
- a Dockerfile for Linux VM/container tests;
- one Project Truth-named C++ Linux HCNetSDK service source file,
  `hikvision_biometric_service.cpp`, built as `hikvision-biometric-service`;
- scripts for VM-side device-source discovery.

On 2026-07-01, the Linux VM at `10.184.38.144` proved TCP reachability to the
historical Bandai Hikvision candidate:

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
version reads worked. SDK login/alarm callback against the current device row
is still not proven.

## HRIS Contract

The HRIS callback path remains:

```text
/api/hikvision/callback
```

Accepted stored sources remain:

- `HIKVISION_CALLBACK`
- `EN_HCNETSDK_ALARM`

The intended live tap path is now one service pipeline:

```text
hikvision-biometric-service / HCNetSDK callback
  -> queue worker posts JSON to /api/hikvision/callback
  -> callback controller persists DeviceEvent
  -> callback controller updates Attendance/timesheet projections where applicable
  -> callback controller emits device-event:saved
  -> localhost:5175 saved-events UI receives the row through the socket path
```

Biometric enrollment/user-change alarms still queue the slower reconcile worker.
The callback thread must not perform fingerprint template reads, peer writes, or
HRIS biometric reconcile writes inline. Dry-run remains the default for
biometric reconcile; `--execute` is required for HRIS/device mutation. Raw
fingerprint template bytes must not be written into normal `User` records or
JSONL evidence.

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

On this workstation, `localhost` admin testing can still show fresh saved
Hikvision rows because the local app/API session is pointed at the running VM
database and reflects writes produced by the VM-hosted Linux watcher. Do not
misread local UI freshness as proof that a Windows-host Hikvision watcher should
be started.

On 2026-07-08, that warning became concrete runtime evidence:

- the DEV K3s Deployment `hris-hikvision-watcher` was still stale and unhealthy,
  with pod args hardcoding `HIKVISION_DEVICE_ADDRESS=10.184.38.215` and
  `--deviceAddress`, while K3s itself was degraded by missing sandbox image
  `rancher/mirrored-pause:3.6`;
- the VM Docker image `hris-api-db-init:develop` was patched to the current
  watcher code (`ab9bce3e9182`) and proved the real Linux watcher path against
  the then-configured `Main Entrance Device` row `10.184.38.96:80` / `http`;
- bounded apply runs from that VM image saved physical-device rows with
  employee-bearing serials `1156`, `1154`, `1153`, and `1151` through
  `/api/hikvision/callback`, producing DEV `DeviceEvent` rows
  `cmrbky6930063la014qvsjusl`, `cmrbl3h390069la01atoi7pl0`,
  `cmrbl5hoe006fla01ngkb2592`, and `cmrblc0o4006zla01hbejrc3e`;
- localhost browser proof at `http://localhost:5175/admin/configuration/devices/events`
  showed those saved physical rows for `Ernst tey Malasa` on `Main Entrance Device`
  after the writes landed in the VM-backed DEV DB.

Boundary: browser visibility on `localhost:5175` does not by itself prove the
immediate socket/callback path. The page originally used host-local API
`localhost:3001`, which only observed VM-written rows through shared DB reads.
After local retargeting to `localhost:3101` (bridged to VM DEV API), the page
did connect to the VM socket owner, but fresh callback writes still did not
surface within a 12-second observation window. Current truth: physical callback
save into the VM DB is proven; immediate localhost `device-event:saved` delivery
is still drifting and must not be presented as verified.

The active seed source for the default Hikvision device is now
`vendor/hikvision-linux`. Runtime should read the configured HRIS `Device` row
rather than carrying a second IP value. The current local admin UI shows `Main Entrance Device` as `10.184.37.139:80` / `http`, model `DS-K1T341CMFW`, with SDK/server port `8000` recorded separately in device config. Do not treat `800`, `8000`, and HTTP port `80` as
interchangeable values.

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
- The historical Linux candidate path was `10.184.38.215`, which was reachable
  from the VM on HTTP/ISAPI port `80` and SDK/server port `8000`, and worked for
  ISAPI history reads on 2026-07-01/02. It is no longer a manifest-level runtime
  constant.
- On 2026-07-02, DEV K3s runtime at `10.184.38.138` had `Main Entrance Device`
  configured as `10.184.38.215:80` / `http`; its config was merged with
  `vendor=Hikvision`, `source=vendor/hikvision-linux`, `sdkPort=8000`, and
  `webhookPath=/api/hikvision/callback` while preserving existing
  `hikvisionClockSkew*` evidence. Recent `device_events` rows for that device
  were `HIKVISION_CALLBACK` / `ATTENDANCE_CREATED`.
- On 2026-07-09, the admin UI shows the active DB-configured device as
  `10.184.37.139:80` / `http`, model `DS-K1T341CMFW`. The watcher path must
  follow the HRIS device row as config truth.

## Remaining Boundaries

Still not claimed:

- Linux HCNetSDK login and alarm callback receipt against `10.184.37.139`;
- spontaneous device push callback from the physical terminal;
- promoted GitOps/K3s proof after the watcher config-truth correction;
- PROD/UAT parity from direct physical ACS pull;
- full attendance journey proof from the Linux SDK path.
- authoritative Hikvision minor-code mapping for every ACS event variant beyond
  the observed ISAPI polling sample.

Linux ISAPI/ACS polling is retained only as a read-only diagnostic/gap-sync
tool. The active live-tap runtime owner is the Linux `hikvision-biometric-service`
HCNetSDK path. It must remain experimental until SDK login and callback receipt
are proven with device-source evidence.

## Biometric Sync Target Architecture

The target Hikvision biometric architecture is now documented in WWG at:

```text
.wwg/wiki/05-architecture/hikvision-biometric-sync-architecture.md
```

The design intent is to use a Linux/VM-owned HCNetSDK alarm listener for
enrollment and user-change events, then queue reconciliation work that reads
source user/fingerprint records and syncs them to peer biometric devices and
HRIS. The callback should trigger sync work; it should not perform long-running
template transfer inline.

The local Windows reference implementation is:

```text
C:\Users\anoni\OneDrive\Desktop\HRIS-PROJECT\EN-HCNetSDKV6.1.9.4_build20220412_win64\AlarmDemo.cpp
```

Use that file as a behavior reference only. It already demonstrates multi-device
login, `NET_DVR_SetDVRMessageCallBack_V51`, alarm arming, ACS event
classification, user sync, fingerprint read/write, broker enrollment, and
event-triggered reconcile. Future Linux code should use Project Truth service
names such as `hikvision-biometric-service` or `hikvision-alarm-listener`, not
`AlarmDemo`.

Target event flow:

- enrollment/user-change on a biometric terminal triggers an SDK alarm callback;
- the service classifies user/fingerprint management events and queues a
  reconcile job;
- the worker reads user/fingerprint data from the source device, syncs peer
  devices, and persists HRIS state;
- attendance verification still flows through callback/log import into
  `Attendance` and timesheet projections;
- admin web app controls include recon/status, add/delete device, and
  activation/deactivation with dry-run/audit gates.

Boundary: Project Truth must not store or expose raw fingerprint templates in
normal `User` records without an explicit encrypted biometric-custody design.
The existing `DeviceUser` architecture remains the current durable device
identity/enrollment record and should be extended or explicitly superseded by a
reviewed biometric model.

## Fast Gap Sync Evidence

On 2026-07-08, the local DEV path proved a bounded dry-run against the physical`n`Main Entrance Device` at the then-configured HRIS Device row target:

```powershell
npx tsx scripts/audit-hikvision-device-events.ts --deviceName="Main Entrance Device" --limit=13 --target-unsaved=3
```

The dry run read 13 latest-first ACS rows from the device, compared generated
HRIS dedupe keys against `device_events`, and found 4 missing rows in about 8
seconds: 2 with employee no. and 2 employee-less device rows. This confirms the
fast safe sync architecture for small gaps:

- Use ISAPI ACS event paging with `timeReverseOrder=true`, `searchResultPosition`,
  and a small `maxResults`.
- Compute HRIS fingerprints/dedupe keys locally and compare against the DB.
- Stop after the target missing count is found or after a bounded latest-row
  scan limit.
- Do not present the device's historical total as the sync job size for a small
  targeted gap.

Boundary: Hikvision ISAPI does not know which rows are absent from HRIS, so the
physical device cannot directly query "only unsaved HRIS rows." HRIS must read a
bounded latest page and perform the missing-row comparison.

## Config-Truth Watcher Evidence

On 2026-07-08, the local DEV watcher command proved that hardcoded watcher IPs
are unnecessary:

```powershell
npx dotenv -- tsx scripts/audit-hikvision-device-events.ts --all-hikvision --limit=10 --apply --watch --until-clean --loops=1 --interval=5
```

The watcher discovered `Main Entrance Device` from the HRIS DB, read 10 latest`nACS rows, found 7 employee-bearing
rows and 3 employee-less rows, and reported `gap.missingWithEmployeeNo=0`.
Recent local DB rows show serials `1130`, `1132`, and `1133` saved as
`HIKVISION_CALLBACK` at `2026-07-08T03:13:23Z`. Remaining missing rows in that
window were employee-less non-attendance device rows (`major=5`, `minor=21/22`),
not HRIS attendance punches.

Boundary: this proves the DB-config-truth watcher contract and callback/save
behavior. The canonical runtime owner for ongoing watch mode remains the
Linux/VM service, not a Windows-host helper.
