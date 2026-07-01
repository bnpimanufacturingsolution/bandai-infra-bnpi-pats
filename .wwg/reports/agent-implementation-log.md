# Agent Implementation Log

## 2026-07-01 Public HRIS Restore

Task mode: Mixed runtime incident repair and WWG documentation update.

Current-state finding:
- PROD and UAT public app pages were loading, but the stale frontend container
  image caused browser traffic to attempt public `:3001` API calls and strand
  session validation.
- DEV public `https://dev.bnpi-hris.tech/` returned Cloudflare 502 because
  `hris-api-dev` and `hris-app-dev` Docker containers were missing; only
  `hris-postgres-dev` was running.
- K3s HRIS workloads for DEV/UAT/PROD were already paused at zero replicas.
  Docker Compose, not K3s, is the current public serving path.

Actions taken:
- Stopped a stale interrupted frontend build process on the VM.
- Recreated only `hris-app` and `hris-app-uat` from existing
  `hris-app-local:develop`
  `sha256:fa41efd235cbb372b7b9c2cd631081d8f7a6738af464b7ca67a0dcf47cdd83c5`.
- Recreated only `hris-api-dev` and `hris-app-dev` with Docker Compose
  `--no-build`, leaving `hris-postgres-dev` and its volume untouched.
- Did not run migrations, seeders, imports, database resets, K3s re-enable, or
  Argo app creation during this restore.

Validation:
- PROD origin:
  `http://localhost:3000/auth/login` HTTP 200,
  `http://localhost:3000/api/auth/me` HTTP 401,
  `http://localhost:3001/health` HTTP 200.
- UAT origin:
  `http://localhost:3200/auth/login` HTTP 200,
  `http://localhost:3201/health` HTTP 200.
- DEV origin:
  `http://localhost:3100/auth/login` HTTP 200,
  `http://localhost:3100/api/auth/me` HTTP 401,
  `http://localhost:3101/health` HTTP 200.
- Browser verification:
  `https://bnpi-hris.tech/` and `https://dev.bnpi-hris.tech/` both loaded the
  HR Management System login screen.
- Browser network proof:
  PROD requested `https://bnpi-hris.tech/api/system-provisioning/status` HTTP
  200; DEV requested `https://dev.bnpi-hris.tech/api/system-provisioning/status`
  HTTP 200. No public browser request to `:3001` was observed.

Evidence:
- VM restore evidence:
  `/var/lib/project-truth/backups/public-app-session-restore-20260701-061721`
- DEV restore evidence:
  `/var/lib/project-truth/backups/dev-public-origin-restore-20260701-062006`
- Browser screenshots:
  `.runtime/browser-evidence/screenshots/bnpi-public-after-restore.png`
  and `.runtime/browser-evidence/screenshots/dev-public-after-restore.png`

Drift guard note:
- Do not “fix” this by importing workbook data, resetting databases, or
  re-enabling K3s. The incident was public runtime routing/container drift, not
  a DM workbook mount problem.
- Future agents must first prove which runtime is serving the public hostname
  before touching data. As of this entry, public HRIS is Docker Compose behind
  the named Cloudflare Tunnel.

## 2026-07-01 Device Linux SDK Truth Documentation

Task mode: Mixed docs/truth synchronization with external SDK research.

Current-state finding:
- ZKTeco realtime attendance-terminal ingestion is not currently proven inside
  the Ubuntu VM or Linux Docker. Project Truth's proven sidecar path is still
  `appliance/zkteco-standalone-sdk`, which targets Windows COM / .NET Framework
  4.8.
- Hikvision has a proven DEV VM/K3s ACS-pull watcher through the existing ISAPI
  flow, but Project Truth does not yet have a Linux HCNetSDK/AlarmDemo listener
  or SDK container.

Actions taken:
- Updated `docs/ZKTECO_RUNTIME_TRUTH.md` with Linux VM/Docker feasibility
  boundaries and SDK-source findings.
- Updated `docs/HIKVISION_RUNTIME_TRUTH.md` with Linux VM/Docker feasibility
  boundaries and SDK-source findings.
- Synced the same boundaries into `.wwg/wiki/project-truth.md` and
  `.wwg/wiki/project-truth-summary.md`.
- Added proposed follow-up `REC-20260701-DEVICE-LINUX-SDK-PROOF` to
  `.wwg/governance/recommendation-registry.md`.

External source findings:
- Official ZKTeco Linux SDK material found during this pass is `ZKFinger SDK
  Linux`, which is scanner/template focused, not confirmed as the
  attendance-terminal Standalone/Pull runtime Project Truth needs.
- Hikvision publishes a Linux 64-bit Device Network SDK, so a Linux HCNetSDK
  runtime is plausible but remains unimplemented and unproven here.

## 2026-07-01 ZKTeco Linux PyZK VM/Docker Trial

Task mode: Mixed experimental runtime proof and vendor scaffold.

Current-state finding:
- The proof VM was reachable at `10.184.38.144` using
  `%USERPROFILE%\.ssh\bnpi_hris_cloudflare_ed25519`.
- The previously documented `192.168.254.148:22` path timed out from this
  Windows host during this pass.

Actions taken:
- Created `vendor/zkteco-linux` with a read-only Python probe, `pyzk==0.9`
  dependency, Dockerfile, and README.
- Added `--mode capabilities` so the scaffold emits its own boundary:
  experimental read-only proof only, not the canonical HRIS runtime.
- Synced that folder to `/tmp/project-truth-zkteco-linux` on the VM.
- Installed missing VM dependency `python3.12-venv`.
- Installed `pyzk` in a VM-local virtualenv and ran TCP plus handshake probes.
- Built Docker image `project-truth-zkteco-linux-trial:local` inside the VM
  and ran TCP plus handshake probes with `--network host`.

Validation:
- VM TCP probe passed for:
  `10.184.38.9:4370`, `10.184.38.235:4370`,
  `10.184.38.234:4370`, and `10.184.38.10:4370`.
- VM TCP probe failed for `192.168.1.61:8000` with `No route to host`.
- Bare PyZK handshake passed for all four ZKTeco devices.
- Dockerized PyZK handshake passed for all four ZKTeco devices.
- Local scaffold regression tests passed for target parsing, TCP failure
  reporting, and the non-canonical runtime capability boundary.
- All four devices reported `iFace302`, firmware `Ver 6.60 Sep 10 2019`, and
  platform `ZMM220_TFT`; serials were `6160062176999`, `6160062176995`,
  `6160062176990`, and `6160062176989`.

Boundary:
- This proves read-only Linux/PyZK handshake from the VM and Docker.
- It does not yet prove attendance-log sync parity, realtime watch, HRIS
  `/api/zkteco/events` posting, sidecar health/status API compatibility, or a
  managed GitOps/K3s runtime.

## 2026-07-01 ZKTeco Capability Boundary and WWG Validation Repair

Task mode: Mixed scaffold hardening, docs sync, browser verification, and
governance validation repair.

Actions taken:
- Added `--mode capabilities` to `vendor/zkteco-linux` so the trial emits an
  executable boundary report: experimental read-only, not canonical HRIS
  runtime.
- Added regression coverage for the capability boundary.
- Updated ZKTeco runtime docs and the Linux PyZK trial report to reference the
  capability command.
- Repaired WWG report-contract drift in historical generated reports by adding
  required WWG Truth Synchronization fields without changing their historical
  findings.

Validation:
- `python -m unittest discover -s vendor\zkteco-linux\tests` passed.
- `python -m zkteco_linux_probe --mode capabilities` returned
  `canonicalHrisRuntime: false` and listed HRIS posting, realtime watch,
  sidecar status/sync APIs, and GitOps/K3s runtime as not proven.
- `agent-browser` loaded `https://bnpi-hris.tech/`, redirected to
  `/auth/login`, and recorded same-origin
  `https://bnpi-hris.tech/api/system-provisioning/status` HTTP 200 with no
  public `:3001` browser request in the trace.
- `wwg test-check --format plain` passed.
- `wwg validate` passed after report-contract repair.

Warning:
- A host `curl.exe -I https://bnpi-hris.tech/api/system-provisioning/status`
  probe hit `Recv failure: Connection was reset`; browser Fetch evidence for
  the same same-origin endpoint returned HTTP 200.

## 2026-07-01 ZKTeco Linux PyZK Source History Truth Pass

Task mode: Runtime validation and truth synchronization.

Goal:
- Verify source-device truth from the ZKTeco terminals themselves, not HRIS API
  or HRIS database rows.

Actions taken:
- Followed the Agent Meta-Prompt discovery/plan/validation loop.
- Used the existing `vendor/zkteco-linux` read-only `history` mode from inside
  VM `project-truth-node` at `10.184.38.144`.
- Ran bare VM PyZK per-device history reads for all four terminals.
- Ran Dockerized PyZK with `--network host`; reran `10.184.38.10` with
  `--timeout 20` after the default timeout was too short for the full history
  read.

Source-device results:

| Device | PyZK users | Bare VM PyZK events | First event | Last event |
| --- | ---: | ---: | --- | --- |
| `10.184.38.9:4370` | 904 | 8,410 | `2022-12-31T17:39:06` | `2026-07-01T15:21:06` |
| `10.184.38.235:4370` | 904 | 17,033 | `2026-05-01T05:33:18` | `2026-07-01T13:50:15` |
| `10.184.38.234:4370` | 904 | 20,697 | `2022-12-31T05:36:18` | `2026-07-01T13:55:29` |
| `10.184.38.10:4370` | 904 | 30,511 | `2022-12-31T05:47:24` | `2026-07-01T15:23:40` |

Docker result:
- Dockerized PyZK read the same history shape. Counts matched the bare VM pass
  for `10.184.38.235` and `10.184.38.234`.
- `10.184.38.9` returned 8,412 and `10.184.38.10` returned 30,527 in later
  Docker passes because new punches arrived during testing.

Truth finding:
- Linux/PyZK can read real source-device users and stored attendance history
  from all four known terminals.
- Linux/PyZK is not yet equivalent to the Windows Standalone SDK path because
  PyZK stored-event counts are lower than the 2026-06-29 Windows SDK baseline
  on every device.
- Realtime watch, HRIS posting, sidecar `/health`/`/status`/`/sync`, and
  GitOps/K3s managed runtime remain unproven.

## 2026-07-01 Hikvision Linux Probe Scaffold

Task mode: Mixed experimental runtime scaffold, Docker proof, and truth sync.

Current-state finding:
- Hikvision already has DEV VM/K3s ACS-pull watcher evidence through the HRIS
  ISAPI flow, but Project Truth did not have a dedicated Linux/Docker probe
  scaffold or Linux HCNetSDK listener.
- The current proof VM was reachable at `10.184.38.144` using
  `%USERPROFILE%\.ssh\bnpi_hris_cloudflare_ed25519`.
- The previously documented `192.168.254.148:22` path timed out from this
  Windows host during this pass.

Actions taken:
- Created `vendor/hikvision-linux` with a read-only Python probe, Dockerfile,
  `requests==2.32.3` dependency, tests, and README.
- The probe supports TCP checks, optional read-only
  `GET /ISAPI/System/time` checks, and a non-invasive local Linux SDK
  environment presence check.
- Synced the folder to `/tmp/project-truth-hikvision-linux` on the VM.
- Built Docker image `project-truth-hikvision-linux-trial:local` inside the VM.
- Added `docs/HIKVISION_LINUX_TRIAL_20260701.md` and synced boundaries into
  `docs/HIKVISION_RUNTIME_TRUTH.md`, `.wwg/wiki/project-truth.md`, and
  `.wwg/wiki/project-truth-summary.md`.

Validation:
- Local tests: `python -m unittest discover -s vendor\hikvision-linux\tests`
  passed with `Ran 6 tests OK`.
- VM tests under `/tmp/project-truth-hikvision-linux` passed with
  `Ran 6 tests OK`.
- VM Docker build passed; image:
  `project-truth-hikvision-linux-trial:local eec31e2e976c 182MB`.
- Host TCP probe to `192.168.254.181:80` and `192.168.254.181:8000` timed out.
- VM TCP probe to `192.168.254.181:80` timed out.
- VM TCP probe to `192.168.254.181:8000` returned `No route to host` or timed
  out across retries.
- VM TCP probe to historical `192.168.1.61:8000` returned `No route to host`.
- Dockerized VM TCP probe with `--network host` matched the VM route failure.

Boundary:
- This proves the Linux/Docker probe scaffold and Docker build/run shape.
- It does not prove live ISAPI system-time handshake, Linux HCNetSDK login,
  alarm receipt, HRIS callback posting, saved device events, browser rendering,
  attendance creation, or a managed GitOps/K3s Linux Hikvision runtime.

## 2026-07-01 Hikvision Vendor-Only Device Truth Pass

Task mode: Vendor/device-source runtime discovery and tooling.

Scope correction:
- User explicitly narrowed this pass to biometric-device truth only.
- HRIS DB, HRIS API, saved device events, attendance rows, and browser UI were
  intentionally excluded as evidence sources.
- `Agent-Meta-Prompt-Template.md` was not changed.

Actions taken:
- Stopped an interrupted leftover ZKTeco history probe on the VM.
- Added direct Hikvision ACS event query/watch modes to
  `vendor/hikvision-linux/hikvision_linux_probe/__main__.py`:
  `--mode acs-events` and `--mode watch`.
- Added VM wrapper:
  `vendor/hikvision-linux/scripts/discover-device-truth.ps1`.
- The wrapper syncs only `vendor/hikvision-linux` to the Linux VM, runs VM
  tests, checks direct TCP reachability, and only runs credentialed ISAPI/ACS
  discovery when `HIKVISION_PASSWORD` is supplied.

Device-source findings:
- VM: `project-truth-node` reachable at `10.184.38.144`.
- Current Bandai Hikvision candidate: `10.184.38.215`.
- Username identified by user for next credentialed pass:
  `admin@bandai.local`.
- From inside the Linux VM, TCP to `10.184.38.215:80` passed.
- From inside the Linux VM, TCP to `10.184.38.215:8000` passed.

Validation:
- Local tests for `vendor/hikvision-linux` passed with `Ran 8 tests OK`.
- `git diff --check -- vendor\hikvision-linux` passed.
- `.\vendor\hikvision-linux\scripts\discover-device-truth.ps1` passed VM
  sync, VM tests, and device TCP discovery.

Boundary:
- This proves device network reachability from the Linux VM.
- It does not yet prove credentialed ISAPI login, direct ACS event history,
  watch-mode tap observation, HCNetSDK alarm listener behavior, HRIS callback,
  DB persistence, attendance, or UI rendering.

## 2026-07-01 Hikvision Linux SDK / Device-Source Runtime Pass

Task mode: Vendor/device-source runtime proof and SDK acquisition.

Actions taken:
- Downloaded official Hikvision `Device Network SDK_Linux64` from HiTools:
  `EN-HCNetSDKV6.1.9.48_build20230410_linux64.zip`.
- Downloaded older regional SDK RAR:
  `EN-HCNetSDKV6.1.9.4_build20220412_linux64.rar`.
- Added ignored local SDK paths to `.gitignore` so proprietary SDK downloads
  and extracts remain local-only.
- Added `vendor/hikvision-linux/hcnetsdk_alarm_probe.cpp`.
- Added `vendor/hikvision-linux/scripts/build-hcnetsdk-alarm-probe.sh`.
- Recovered VM disk by pruning Docker build cache and removing only
  experimental trial images; HRIS containers and database volumes were not
  removed.
- Installed `g++` and `make` in the Linux VM.
- Extracted SDK on the VM and compiled the C++ HCNetSDK probe.

Device-source findings:
- Device: `10.184.38.215`.
- ISAPI username that works: `admin`.
- ISAPI username `admin@bandai.local` returned HTTP 401.
- ISAPI time returned HTTP 200 with local time
  `2026-07-01T15:35:56+08:00`, `timeMode=manual`,
  `timeZone=CST-8:00:00`.
- Direct ACS query returned recent device history. A 7-day query returned
  `eventCount=30`; sample access event:
  employee no. `1`, name `ernest`, major `5`, minor `75`, serial `160`,
  time `2026-07-01T11:42:42+08:00`, door `1`.
- Watch mode ran successfully for three loops but no fresh tap event appeared
  in that short 5-minute window.

SDK findings:
- SDK page metadata: version `V6.1.9.48`, size `64.12MB`, date `2026/05/25`.
- ZIP SHA-256:
  `8DE553FB2E8DBB0AC441EE1BD73C5ECB73D720C1359396750479A6E169ABF93F`.
- RAR SHA-256:
  `EFE0F478F8DB88A1DE0356FE432862A9514B3A7E4E8DB303650A295460A141CF`.
- VM SDK files present:
  `incEn/HCNetSDK.h` and `lib/libhcnetsdk.so`.
- C++ probe compiled to:
  `/home/infra/project-truth-hikvision-linux/build/hcnetsdk_alarm_probe`.
- SDK init/version proof passed:
  `sdkVersion=393217`, `sdkBuildVersion=100731184`.
- SDK login to `10.184.38.215:8000` failed for both `admin` and
  `admin@bandai.local` with `lastError=1`.
- `HCNetSDK.h` defines `lastError=1` as `NET_DVR_PASSWORD_ERROR`.

Boundary:
- This pass proves ISAPI device-source event history and proves the Linux SDK
  is downloaded, installed, compiled, and callable on the VM.
- It does not yet prove HCNetSDK login, alarm arming, alarm callback receipt,
  HRIS posting, HRIS DB persistence, attendance, or UI rendering.
