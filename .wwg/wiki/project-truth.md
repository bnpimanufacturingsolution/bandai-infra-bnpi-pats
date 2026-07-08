# Project Truth

Adoption status: INFERRED_FROM_EXISTING_PROJECT
Status: Inferred from repository evidence. Requires human/agent review before becoming accepted project truth.
Truth confidence: HIGH
Last adoption audit: 2026-06-29

This file was populated from existing code, documentation, package metadata, configuration, and observed implementation.

Items marked `INFERRED`, `NEEDS_CONFIRMATION`, `CONFLICTING`, or `STALE` should be reviewed before major future work.

If this file conflicts with lower-priority reports, generated notes, task files, or stale documentation, this file wins once confirmed.

Project Truth must not be silently overwritten. Requirement evolution is allowed when documented and accepted.

## Product Identity

- Product name: project_truth_hyperv_fresh
- Status: INFERRED
- Evidence: package.json (package name)

## Product Category

- Category: Web application
- Status: INFERRED
- Evidence: package/source (frontend framework or route folders detected)

## One-Line Description

- Description: project_truth_hyperv_fresh appears to be a web application.
- Status: INFERRED
- Evidence: package.json (package name); package/source (frontend framework or route folders detected)

## Primary Users and Roles

- Role: admin / hris-admin
  - Status: CONFIRMED
  - Evidence: User correction 2026-06-29; admin device/configuration routes under `hris-app/app/routes/admin`; ZKTeco device work occurs under `/admin/configuration/devices`.
  - Rule: Device management, device event review, runtime health checks, and ZKTeco repair/operations are admin-role work. Do not infer `hris-hr-manager` for `/admin` device or configuration tasks.
- Role: hris-hr-manager
  - Status: CONFIRMED_WITH_BOUNDARY
  - Evidence: Existing HRIS role tests and HR route code.
  - Rule: HR manager is valid for HR workflows where the code/docs explicitly require it, but it is not the default actor for admin configuration, device operations, GitOps, VM, or ZKTeco runtime drift work.
- Role: hris-hr-user, hris-employee-manager, hris-employee
  - Status: OBSERVED
  - Evidence: Existing HRIS role tests and app role types.

## Canonical Scope

Currently includes:

- Feature: Current Working Branch, Main Documents, Normal CLI Flow, VHDX Autopilot, Target Architecture, Target Repo Shape, Image Format Targets, Ownership Rules, app/server
  - Status: INFERRED
  - Evidence: README.md (README headings or route files)

Currently does not include unless approved:

- Boundary: mock/demo files detected
  - Status: INFERRED
  - Evidence: README/source/package (safety boundary indicators)

## Canonical Terminology

See `.wwg/wiki/terminology.md`.

Critical terms:

- Term: flow
  - Meaning: Observed project term; confirm canonical meaning before broad use.
  - Status: INFERRED
  - Evidence: README heading
- Term: package
  - Meaning: Observed project term; confirm canonical meaning before broad use.
  - Status: INFERRED
  - Evidence: app/package-lock.json, app/package.json
- Term: target
  - Meaning: Observed project term; confirm canonical meaning before broad use.
  - Status: INFERRED
  - Evidence: README heading
- Term: truth
  - Meaning: Observed project term; confirm canonical meaning before broad use.
  - Status: INFERRED
  - Evidence: package/name, README heading
- Term: architecture
  - Meaning: Observed project term; confirm canonical meaning before broad use.
  - Status: NEEDS_CONFIRMATION
  - Evidence: README heading

## Architecture Truth

Accepted or observed architecture:

- Item: source folders: app
  - Status: INFERRED
  - Evidence: source/config (folders and package metadata)
- Item: ZKTeco runtime is now Linux-first through `vendor/zkteco-linux`; Windows COM SDK and Node bridge paths are retired from the active repo/runtime path.
  - Status: CONFIRMED_RUNTIME_EVIDENCE
  - Evidence: On 2026-07-01, VM root storage was expanded to a 491 GB filesystem, `vendor/zkteco-linux` tests passed locally and in the VM, all four physical terminals at `10.184.38.9`, `10.184.38.235`, `10.184.38.234`, and `10.184.38.10` passed TCP from the VM, and the repo Docker Compose now defines Linux bridge services `zkteco-linux-bridge`, `zkteco-linux-bridge-dev`, and `zkteco-linux-bridge-uat` using image `project-truth-zkteco-linux:develop`. The old `vendor/zkteco-sdk` submodule and `appliance/zkteco-standalone-sdk` Windows implementation were removed from the repo.
- Item: ZKTeco Linux/PyZK source-device reads and HRIS bridge posting are proven enough to be the active appliance path, but exact historical count parity and GitOps/K3s runtime are still open.
  - Status: CONFIRMED_WITH_BOUNDARY
  - Evidence: Earlier 2026-07-01 PyZK history reads reported 904 users on every device and stored-event counts of 8,410; 17,033; 20,697; and 30,511 respectively, with latest events on 2026-07-01. The VM-only Node bridge drift also proved HRIS posting was viable, but the active repo implementation is now the Python Linux bridge with `/health`, `/status`, and `/sync`. Boundary: PyZK stored-event counts remain lower than the historical 2026-06-29 Windows SDK baseline on every device; realtime push parity and GitOps/K3s-managed Linux runtime are not yet proven. See docs/ZKTECO_RUNTIME_TRUTH.md and docs/ZKTECO_LINUX_PYZK_TRIAL_20260701.md.
- Item: Current ZKTeco remote/client-side source-device queryability is 2 of 4 devices, and live full-history PyZK pulls are too slow for an interactive preflight.
  - Status: CONFIRMED_RUNTIME_EVIDENCE_WITH_BOUNDARY
  - Evidence: On 2026-07-04, remote SSH through `ssh project-truth-hris` reached `project-truth-node` on `develop@9a82734` with VM-managed Cloudflare active. User-supplied device-screen photos in `docs/zkteco-ips/` confirm the four terminals are configured as `10.184.38.9`, `10.184.38.10`, `10.184.38.234`, and `10.184.38.235`, all with mask `255.255.255.0`, gateway `10.184.38.254`, TCP COMM.Port `4370`, and DHCP off. Running read-only probes inside the active `project-truth-zkteco-linux-bridge` container showed `10.184.38.235:4370` and `10.184.38.234:4370` reachable, each with 904 users and source-device PyZK attendance counts of 18,085 and 21,507. `10.184.38.9:4370` and `10.184.38.10:4370` timed out at TCP/PyZK level from the remote VM. Later same-day rechecks found `.9` and `.10` unreachable through 20s TCP `4370`, 20s UDP/ZK, and ICMP; `10.184.38.1` replied to ICMP but refused TCP `4370` and did not answer UDP/ZK. A reversible same-subnet test temporarily added `10.184.38.144/24` to VM `eth0`; Cloudflare stayed active, `.234/.235` still worked, but `.9/.10` changed to `No route to host` for TCP and still failed UDP/ZK, consistent with failed neighbor/L2 reachability. Reversible gateway/source-route variants using `10.184.38.144/32`, `10.184.38.91/32`, and `10.184.38.138/32` via gateway `10.184.38.254` did not recover `.9` or `.10`; after cleanup, canonical VM networking and Cloudflare remained healthy. TCP and directed UDP/ZK sweeps of likely ranges found only `.234` and `.235` as ZKTeco endpoints. Full PyZK recovery reads later returned `.234` with 904 users and 21,510 events and `.235` with 904 users and 18,087 events; `.9` and `.10` failed after about 34s each. PyZK `force_udp=True` was fastest for handshake/user-count checks, but TCP was faster for full `get_attendance()` reads; full attendance pulls exceeded the 15-second interactive threshold. A later same-day protocol proof showed PyZK `read_sizes()` / ZKTeco `CMD_GET_FREE_SIZES` can return quick source-device summary counts for `.235` and `.234`, with UDP `read_sizes()` taking about 0.07-0.14s end to end in later checks. DEV HRIS already had saved `ZKTECO_EVENT` rows of 72,090 (`.10`), 55,833 (`.234`), 41,305 (`.235`), and 24,492 (`.9`), so current PyZK source reads must not be treated as full historical parity evidence. Detailed evidence: `.wwg/reports/zkteco-remote-runtime-truth-20260704.md` and `.wwg/reports/zkteco-four-device-recovery-20260704.md`.
- Item: `github.com/canhlinh/gozk` is not currently proven as a better default than PyZK for Project Truth ZKTeco history/user reads.
  - Status: CONFIRMED_RUNTIME_EVIDENCE_WITH_BOUNDARY
  - Evidence: On 2026-07-04, a disposable gozk probe ran from the remote VM against the four configured ZKTeco devices. gozk connected quickly to the two TCP-reachable devices, but its `GetUsers()` call returned no user objects, `10.184.38.234` attendance history failed where PyZK succeeded, and isolated attendance retries failed on both `10.184.38.235` and `10.184.38.234`. One successful `.235` gozk attendance read returned 18,085 events in about 22.1s, still above the 15-second interactive threshold. Detailed evidence: `.wwg/reports/zkteco-gozk-trial-20260704.md`.
- Item: Hikvision integration exists through HRIS API `/api/hikvision/callback`, ISAPI client helpers, device event persistence, admin device event UI filters, and realtime `device-event:saved`; editable Linux source is tracked as `vendor/hikvision-linux`, while proprietary HCNetSDK binaries remain local-only runtime inputs.
  - Status: CONFIRMED_CODE_EVIDENCE
  - Evidence: docs/HIKVISION_RUNTIME_TRUTH.md; hris-api/app/hikvision; hris-api/helper/hikvision-event-contract.helper.ts; hris-api/tests/hikvision-event-contract.helper.spec.ts; hris-app/app/routes/admin/devices/events.tsx; vendor/hikvision-linux.
- Item: `DeviceUser` is the durable admin device identity/enrollment record for the simplified device-management architecture; `EmployeeDeviceEnrollment` is not required on current evidence.
  - Status: CONFIRMED_LOCAL_IMPLEMENTATION_WITH_BOUNDARY
  - Evidence: On 2026-07-06 local hot-reload implementation added `DeviceUser` with direct optional `employeeId`, unique `organizationId + deviceId + vendorUserId`, status values `ACTIVE`, `UNMATCHED`, `CONFLICT`, and `DISABLED`, source payload fields, sync timestamps, and relations from `Device`, `Employee`, and `DeviceEvent`. Hikvision `UserInfo/Search` sync upserts `DeviceUser` rows and auto-links only exact unambiguous employee matches; manual link/unlink exists for admin correction. Event import now resolves `DeviceEvent.employeeNo` / `vendorUserId` through `DeviceUser(deviceId + vendorUserId)` before falling back to legacy `Employee.deviceEmpId`. Legacy `Employee.deviceId` and `Employee.deviceEmpId` remain for compatibility. Boundary: proven locally against the configured DEV database and physical `Main Entrance Device`; not yet promoted/proven through GitOps/K3s/public DEV.
- Item: Device-user sync and device-log sync are separate admin workflows, with review/confirmation before the user sync mutates identity records.
  - Status: CONFIRMED_LOCAL_UI_EVIDENCE_WITH_BOUNDARY
  - Evidence: On 2026-07-06 local browser proof at `localhost:5175/admin/configuration/devices?deviceId=cmpxw13hx002h7zwso7dyedrn&action=enroll-users` showed the `Device Users` modal, device row dropdown link `View Device Users`, `Review sync` as the first action, and a final `Sync device users` confirmation inside the status modal. The copy distinguishes identity records from attendance/device logs. Screenshot evidence: `.runtime/browser-evidence/screenshots/device-users-review-sync-modal.png`.
- Item: Device sync run summaries persist known skipped device-log rows so preview can distinguish saved, known skipped, failed, and truly missing source records.
  - Status: CONFIRMED_LOCAL_RUNTIME_EVIDENCE_WITH_BOUNDARY
  - Evidence: On 2026-07-06 local Hikvision log sync processed 982 source rows for `Main Entrance Device`, saved/imported 376, classified 606 as skipped/known skipped, failed 0, and left missing 0. A `DeviceSyncRun` row records those counts, and the admin events preview labels `Known skipped` separately from `Still missing`. Boundary: local hot-reload proof only until GitOps/K3s/public DEV is promoted and verified.
- Item: Hikvision can partially run inside Linux/VM through ISAPI ACS polling, and now has a Linux/Docker probe scaffold, but Linux HCNetSDK alarm callback is not yet proven in Project Truth.
  - Status: CONFIRMED_CURRENT_BOUNDARY
  - Evidence: docs/HIKVISION_RUNTIME_TRUTH.md records DEV VM/K3s `hris-hikvision-watcher` ACS-pull proof and current SDK research showing Hikvision publishes a Linux 64-bit Device Network SDK; `vendor/hikvision-linux` now contains a TCP/ISAPI probe, ACS event watch mode, VM discovery wrapper, Dockerfile, and C++ HCNetSDK alarm probe; docs/HIKVISION_LINUX_TRIAL_20260701.md records local/VM tests, a successful VM Docker build, vendor-only TCP proof from Linux VM `10.184.38.144` to current Bandai Hikvision candidate `10.184.38.215:80` and `10.184.38.215:8000`, with HTTP/ISAPI on port `80`, SDK/server on port `8000`, and no current evidence for port `800`; credentialed ISAPI time/ACS history with username `admin`; and Linux HCNetSDK `V6.1.9.48` download/extract/compile/init proof. Boundary: tap/watch observation, HCNetSDK login/alarm callback, HRIS DB/API persistence, attendance, and UI proof are not yet proven; SDK login currently returns `NET_DVR_PASSWORD_ERROR (1)`.
- Item: Local DEV Hikvision callback parsing accepts HTTP-host XML aliases and can persist a saved event without a `deviceId` query parameter when the observed device IP matches a configured HRIS device.
  - Status: CONFIRMED_LOCAL_RUNTIME_EVIDENCE_WITH_BOUNDARY
  - Evidence: On 2026-07-08, `parseHikvisionBodyPayload` was updated and regression-tested for Hikvision XML `ipAddress` and `dateTime` aliases. After restarting the local `hris-api` dev server, a localhost POST to `/api/hikvision/callback` with `ipAddress=10.184.38.96`, `employeeNoString=CODEX-SMOKE`, and a unique serial matched local DEV `Main Entrance Device` row `cmpxw13hx002h7zwso7dyedrn`, persisted `DeviceEvent` `cmrbgi592000e7zi84s6bdboz` as `HIKVISION_CALLBACK` / `UNMATCHED`, and then deleted only that marked smoke row. Boundary: `localhost` works for a local SDK/watcher process on the HRIS API host; a physical Hikvision terminal must use a LAN-reachable or tunneled HRIS API URL, not terminal-local `localhost`. This does not prove spontaneous physical-device push, Linux HCNetSDK alarm receipt, GitOps/K3s promotion, or public DEV parity.
- Item: Hikvision runtime has Docker DEV database evidence but is not yet proven at the same physical-device and cross-environment evidence level as ZKTeco.
  - Status: NEEDS_RUNTIME_EVIDENCE
  - Evidence: docs/HIKVISION_RUNTIME_TRUTH.md records Docker DEV `HIKVISION_CALLBACK` and `EN_HCNETSDK_ALARM` rows, while Docker PROD/UAT and public DEV did not show equivalent Hikvision event evidence during the 2026-06-30 verification pass; physical-device, browser/socket, LAN/public, and attendance journey proof remain required for the intended production path.
- Item: A Hikvision physical device is visible to SADP on the LAN, but is not yet proven through the HRIS runtime path.
  - Status: OBSERVED_DEVICE_DISCOVERY
  - Evidence: 2026-06-30 chat-provided SADP screenshot recorded in `.wwg/wiki/01-sources/raw/hikvision-sadp-device-screenshot-20260630.md` shows one active device, ID `001`, device type `DS-K1T201AEF`, IPv4 `192.168.254.181`, port `8000`, Enhanced SDK service `N/A`, and software version prefix `V1.3.45 build 2...` with the full build truncated. This proves LAN discovery only; callback, AlarmDemo, device-event persistence, admin browser/socket update, attendance write, VM LAN, and public Cloudflare proof remain required.
- Item: Hikvision DEV physical-device ACS pull can save and render device events.
  - Status: CONFIRMED_DEV_RUNTIME_EVIDENCE
  - Evidence: On 2026-06-30, the DEV `Main Entrance Device` row `cmqquro2g002em73cdp74rx0q` was corrected from stale `192.168.110.24` / `https` to SADP-observed `192.168.254.181:80` / `http`. Host TCP checks passed on `192.168.254.181:8000` and `:80`; direct ISAPI digest-auth system-time probe returned HTTP 200; DEV HRIS device health reached `http://192.168.254.181:80` and returned `deviceApi.ok=true`; `POST https://dev-api.bnpi-hris.tech/api/hikvision/access-control/acs-events` returned HTTP 200 for a dated ACS query containing `major=5`, `minor=38`, employee no. `1`, serial no. `997`, time `2026-06-30T16:17:07+08:00`; the pull saved DEV device-event row `cmr0e1jk2002lm601rul855z2` with source `HIKVISION_CALLBACK`, status `UNMATCHED`, event time `2026-06-30T08:17:07.000Z`, received at `2026-06-30T08:31:59.811Z`; Playwright browser verification on `/admin/configuration/devices/events?view=saved` showed the event with terminal `Main Entrance Device`, address `192.168.254.181`, employee no. `1`, and save path `Device callback`. Remaining proof: spontaneous device push callback, Windows AlarmDemo managed service, employee matching, attendance creation, and PROD/UAT/public parity.
- Item: Hikvision DEV VM/K3s watcher starts with runtime and saves employee-bearing ACS events.
  - Status: CONFIRMED_DEV_RUNTIME_EVIDENCE
  - Evidence: On 2026-06-30, GitOps DEV runtime added Deployment `hris-hikvision-watcher` in `gitops/runtime-k8s/overlays/dev/runtime.yaml`. Hot-apply to the proof VM created pod `hris-hikvision-watcher-86d6549-nmm8m` in namespace `dev` with `READY 1/1`; watcher logs reported `live.total=10`, `live.withEmployeeNo=5`, `saved.matchingAfterApply=5`, and `gap.missingWithEmployeeNo=0`. Public DEV API returned newly saved `HIKVISION_CALLBACK` rows for device `cmqquro2g002em73cdp74rx0q` received at `2026-06-30T13:48:29Z`; headless browser verification at `https://dev.bnpi-hris.tech/admin/configuration/devices/events?view=saved&deviceId=cmqquro2g002em73cdp74rx0q&source=HIKVISION_CALLBACK&sort=receivedAt&order=desc` rendered fresh saved punches for `Main Entrance Device`. Boundary: this proves VM/K3s ACS-pull watcher startup and ingestion, not spontaneous device HTTP-host push, Windows AlarmDemo as a managed service, employee matching for no. `1`, DEV attendance creation, or PROD/UAT parity.
- Item: Hikvision DEV K3s runtime is currently aligned to the `10.184.38.215` device truth.
  - Status: CONFIRMED_DEV_RUNTIME_EVIDENCE
  - Evidence: On 2026-07-02, SSH to active VM `10.184.38.138` showed DEV `hris-app`, `hris-api`, `hris-postgres`, and `hris-hikvision-watcher` pods running. DEV Postgres row `Main Entrance Device` was `10.184.38.215:80` / `http`, with config merged to include `vendor=Hikvision`, `source=vendor/hikvision-linux`, `sdkPort=8000`, and `webhookPath=/api/hikvision/callback` while preserving `hikvisionClockSkew*` evidence. Recent `device_events` rows for that device were `HIKVISION_CALLBACK` / `ATTENDANCE_CREATED`. TCP from the Windows host passed for `10.184.38.215:80` and `10.184.38.215:8000`, and failed for `10.184.38.215:800`.
- Item: Hikvision UAT temporary seed can match employee no. `1` and create attendance through the callback path.
  - Status: TEMPORARY_UAT_RUNTIME_EVIDENCE
  - Evidence: On 2026-06-30, the UAT K3s `Main Entrance Device` row `cmqqv5x45002ele3dqt3a233i` was corrected to `192.168.254.181:80` / `http`; temporary employees `UAT-HIK-001` through `UAT-HIK-005` were created with `deviceEmpId` values `1` through `5`; a callback-shaped Hikvision punch for employee no. `1`, `major=5`, `minor=38`, event time `2026-06-30T16:17:07+08:00`, and device IP `192.168.254.181` saved UAT device event `cmr0hh22y0025nq011uukvetx` with status `ATTENDANCE_CREATED`, matched employee `uat-temp-hikvision-employee-1`, and created attendance `cmr0hh27a0027nq01elxja5k7`. Playwright headless browser verification on `https://uat.bnpi-hris.tech/admin/configuration/devices/events?view=saved` showed `UAT Hikvision Temp Test 1`, no. `1`, `Main Entrance Device`, `192.168.254.181`, and save path `Device callback`. Boundary: this is temporary UAT seed/callback proof; UAT API pod health against `192.168.254.181:80` returned `EHOSTUNREACH`, so UAT physical ACS pull remains unproven.
- Item: Current Hyper-V proof VM exists as `project-truth-local-vhdx-proof` on the `ProjectTruth-External` switch.
  - Status: CONFIRMED_RUNTIME_EVIDENCE
  - Evidence: `Get-VM` and `Get-VMNetworkAdapter` on 2026-06-29 showed VM `project-truth-local-vhdx-proof`, Generation 2, attached to switch `ProjectTruth-External`.
- Item: Current canonical Project Truth LAN/runtime target is pure static address `10.184.37.19`; `10.184.37.78` is retained only as a secondary transition address/TLS SAN until all runtime surfaces have reconciled.
  - Status: CONFIRMED_RUNTIME_EVIDENCE
  - Evidence: 2026-07-03 operator SSH through `ssh project-truth-hris` reached `project-truth-node`; `eth0` showed `10.184.37.78/24` and `10.184.37.19/24` with `dhcp4: false` and default route `10.184.38.254 on-link`. Read-only probes from inside the VM proved ping, SSH, and PROD/DEV/UAT API health on `10.184.37.19`; ansible-pull now persists `PROJECT_TRUTH_LAN_IP=10.184.37.19`, writes `10.184.37.19/24` before `10.184.37.78/24`, and reconciles K3s `node-ip` / `advertise-address` to `10.184.37.19` while retaining `10.184.37.78` as a TLS SAN. 2026-07-01 SSH to historical transient address `10.184.38.144` and earlier `192.168.254.148` are retained as non-current interface evidence.
- Item: Earlier SSH proof at `10.184.38.91:22` is historical evidence only.
  - Status: STALE
  - Evidence: Earlier 2026-06-29 TCP, password, key, and VMConnect proofs used `10.184.38.91`, but the current Cloudflare/SSH repair pass proved `192.168.254.148` and probes to `10.184.38.91` later timed out.
- Item: Current Hyper-V proof VM exposes HRIS app/API on pure static operator/LAN target `10.184.37.19`.
  - Status: CONFIRMED_RUNTIME_EVIDENCE
  - Evidence: 2026-07-03 checks returned healthy API JSON for `http://10.184.37.19:3001/health` and `http://10.184.37.78:3001/health`; earlier checks on `10.184.38.144`, `10.184.38.138`, and `192.168.254.148` are historical runtime evidence.
- Item: Current Hyper-V proof VM exposes SSH on LAN at `10.184.37.19:22`.
  - Status: CONFIRMED_RUNTIME_EVIDENCE
  - Evidence: 2026-07-02 `Test-NetConnection 10.184.37.19 -Port 22` passed; Windows OpenSSH with `%USERPROFILE%\.ssh\node-health-appliance_ed25519` reached hostname `project-truth-node` and user `infra`.
- Item: Current Hyper-V proof VM uses pure static dual-address LAN config on `eth0`, with `10.184.37.19` first/canonical.
  - Status: CONFIRMED_RUNTIME_EVIDENCE
  - Evidence: On 2026-07-03, `/etc/netplan/99-project-truth-lan.yaml` used `dhcp4: false`, static default route via `10.184.38.254` with `on-link: true`, and DNS `10.184.1.144,10.184.37.1` with search domain `bhk.local`. The canonical desired address order is `10.184.37.19/24` first, then retained secondary `10.184.37.78/24`.
- Item: Host-managed Cloudflare Tunnel config targets the static VM operator/LAN address `10.184.37.19`.
  - Status: CONFIRMED_RUNTIME_EVIDENCE
  - Evidence: On 2026-07-02, `cloudflared-bnpi-hris.yml` was corrected from stale DHCP-origin routing to `10.184.37.19`; after the 2026-07-03 pure static cutover, app/API/dev/uat/Grafana origins and `ssh.bnpi-hris.tech` continue to point at the static operator/LAN VM address.
- Item: Public `bnpi-hris.tech` verification from the client LAN is currently blocked by network policy.
  - Status: CONFIRMED_WITH_BOUNDARY
  - Evidence: On 2026-07-02, plain HTTP to `http://bnpi-hris.tech` returned a company-policy "Web Page Blocked" response, while HTTPS to `bnpi-hris.tech`, `api.bnpi-hris.tech`, DEV, UAT, Grafana, and Cloudflare Access SSH reset during TLS from both Windows and the VM. General HTTPS to `www.cloudflare.com` and `www.google.com` still returned HTTP 200, and `cloudflared tunnel info bnpi-hris` showed active Windows and Linux connectors. Public HRIS checks need an unfiltered vantage point before being treated as origin failure.
- Item: VM-visible Project Truth summary shows the current operator/LAN SSH target and public Cloudflare endpoints.
  - Status: CONFIRMED_RUNTIME_EVIDENCE
  - Evidence: 2026-07-02 SSH banner and refreshed summary showed `LAN IP: 10.184.37.19`, `SSH: ssh infra@10.184.37.19`, PROD/DEV/UAT LAN app/API endpoints, VM-managed Cloudflare public endpoints, and `project-truth-lan-summary` entrypoints.
- Item: `bnpi-hris.tech` public Cloudflare Tunnel access is repaired through named tunnel `e3486f00-f974-46d3-9e11-911266749d00` in the Cloudflare account that owns the `bnpi-hris.tech` zone.
  - Status: CONFIRMED_RUNTIME_EVIDENCE
  - Evidence: 2026-06-29 repair pass verified HTTP 200 for `bnpi-hris.tech`, `www.bnpi-hris.tech`, `app.bnpi-hris.tech`, `api.bnpi-hris.tech`, `dev.bnpi-hris.tech`, `dev-api.bnpi-hris.tech`, `uat.bnpi-hris.tech`, `uat-api.bnpi-hris.tech`, and `grafana.bnpi-hris.tech`; public CORS preflight returned HTTP 204 and wrong-password auth returned HTTP 401 through both `api.bnpi-hris.tech` and same-host `bnpi-hris.tech/api/*`. On 2026-06-30, headless browser proof reached `/admin/dashboard` for PROD, DEV, and UAT public app hosts, used the expected public API path for each environment, and received HTTP 200 from `/auth/me` and `/dashboard/overview`; DEV/UAT `/api/system-provisioning/status` CORS headers were repaired and verified for paired public app origins.
- Item: Current named Cloudflare Tunnel runtime path is VM-side, with Windows host ownership retained as bootstrap/management context until connector ownership is decided.
  - Status: CONFIRMED_RUNTIME_EVIDENCE
  - Evidence: `cloudflared tunnel info bnpi-hris` on 2026-06-29 showed active connector architecture `windows_amd64`; `scripts/start-bnpi-cloudflare-tunnel.ps1` discovers the live VM IP, rewrites `cloudflared-bnpi-hris.yml`, can provision DNS routes, and starts the named connector; `scripts/ensure-bnpi-cloudflare-host.ps1` checks host credential/readiness state; scheduled task `ProjectTruth-BNPI-HRIS-Cloudflared` owns host startup. On 2026-06-30, Windows had no active `cloudflared` process, the VM `cloudflared-bnpi-hris.service` was active using root-only credentials under `/etc/cloudflared`, and public PROD/DEV/UAT app/API browser traffic verified through the VM runtime path.
- Item: Running-server Cloudflare Tunnel access must stay enabled by default.
  - Status: ACCEPTED_RUNTIME_SAFETY_RULE
  - Evidence: On 2026-07-03, the live VM banner reported `Cloudflare named tunnel mode: VM-managed active`, `OS pull last: develop@75e7c1d845df`, and public/SSH targets including `https://bnpi-hris.tech`, `https://api.bnpi-hris.tech/health`, `https://grafana.bnpi-hris.tech/api/health`, and `ssh project-truth-hris`. User correction on 2026-07-03 explicitly banned agents from disabling Cloudflare or introducing default-local/cloud-mode behavior on the running server after a prior attempted toggle disrupted remote access. Agents must not stop, disable, mask, remove, or toggle off `cloudflared-bnpi-hris.service` on the running server unless the user explicitly requests a time-bounded outage and a verified recovery path exists.
- Item: Fresh/final Project Truth images must not bake Cloudflare tunnel credentials.
  - Status: CONFIRMED
  - Evidence: Current named tunnel credentials live under the Windows operator profile, outside the repo. The active repeatable setup is to boot/import the fresh VM, let it obtain a LAN IP, then run `.\scripts\project-truth.ps1 ensure-bnpi-cloudflare-host -ProvisionDns -StartTunnel -VerifyPublic` from a configured Windows host.
- Item: Current proof VM can run the named Cloudflare Tunnel from inside the VM after deliberate credential import.
  - Status: CONFIRMED_RUNTIME_EVIDENCE
  - Evidence: On 2026-06-29 the existing named tunnel credential was copied into the proof VM as root-only runtime state at `/etc/cloudflared/e3486f00-f974-46d3-9e11-911266749d00.json`; `/etc/cloudflared/config.yml` routes app/API/dev/uat/Grafana to localhost services and `ssh.bnpi-hris.tech` to `ssh://localhost:22`; `cloudflared-bnpi-hris.service` was enabled and active; `cloudflared tunnel info bnpi-hris` showed a `linux_amd64` connector; public HTTP checks returned 200; and SSH through `ssh.bnpi-hris.tech` returned `SSH_DOMAIN_OK`, hostname `project-truth-node`, user `infra`, and active VM connector state.
- Item: VM-managed Cloudflare Tunnel is not allowed to be baked into fresh/final images.
  - Status: CONFIRMED
  - Evidence: VM-managed mode requires the named tunnel credential JSON, which remains secret material. Repo support is limited to `project-truth-cloudflare-vm-tunnel`, a runtime import/install helper that writes root-only VM state and localhost ingress after the credential is supplied deliberately.
- Item: V6 packaging should retain the V2 one-click installer shape while adding runtime credential import and proof.
  - Status: ACCEPTED
  - Evidence: The V2 reference under `.runtime/gcp-v2-format` ships a small extracted zip with `ProjectTruth-Install-HyperV-v2.cmd`, downloads the large VHDX and sidecars from a public storage bucket, verifies SHA-256, imports/starts Hyper-V, and leaves the console open. User guidance on 2026-06-30 requested retaining the same one-click extracted-zip journey for V6 rather than creating a competing command path. V6 must add Cloudflare credential preflight/import from `C:\ProgramData\ProjectTruth\secrets\cloudflared\...\json`, then run the V6 proof path, without baking credentials into the image, zip, repo, or bucket artifact.
- Item: V7 is the current published public package lane for the Hyper-V one-click installer.
  - Status: CONFIRMED_RUNTIME_EVIDENCE
  - Evidence: On 2026-06-30, `gs://project-truth-image-export-hris-492904-161377059311/public/project-truth/hyperv/v7/latest/` was populated with `project-truth-node-local-hyperv-v7-current-state.vhdx`, VHDX SHA-256 sidecar, import script, README files, V7 manifest, V7 installer scripts, and `project-truth-hyperv-one-click-installer-v7.zip`. GCS metadata showed the V7 VHDX at `75635884032` bytes, public HEAD checks returned HTTP 200 for all V7 URLs, the downloaded public V7 zip matched SHA-256 `4534136199EEBA85FFAFBF08C8EAFEEDA1BBC784D9F4D3A269F30D9F95D75088`, and the V7 installer dry run targeted the V7 VHDX and manifest while preserving the V6 runtime proof path. The V7 VHDX is a server-side promotion of the known clean V5 public base, not an upload of the live proof VM disk, because the live proof VM has contained root-only Cloudflare runtime credentials.
- Item: V6 proof currently serves HRIS through Docker Compose while K3s remains resource-constrained.
  - Status: CONFIRMED_RUNTIME_EVIDENCE
  - Evidence: `.runtime\v6-one-shot\20260630-112256\v6-one-shot-result.json` recorded SSH, ansible-pull, VM Cloudflare import, and zero network validation failures; live public checks on 2026-06-30 returned HTTP 200 for PROD/DEV/UAT app/API and Grafana, and SSH through `ssh.bnpi-hris.tech` returned `SSH_DOMAIN_LIVE_OK`. Live `docker ps` showed app/API/Postgres containers healthy on ports 3000/3001, 3100/3101, and 3200/3201, while `kubectl get pods -A` showed many pods `Pending`, `Evicted`, `Completed`, or `ContainerStatusUnknown` under low-memory conditions.
- Item: Public SSH through `ssh.bnpi-hris.tech` is verified through Cloudflare Access and the named tunnel, including the VM-side `ssh://localhost:22` connector.
  - Status: CONFIRMED_RUNTIME_EVIDENCE
  - Evidence: 2026-06-29 provisioning evidence `.runtime/cloudflare-named-tunnel/20260629-223910/bnpi-cloudflare-tunnel.json` recorded `ssh.bnpi-hris.tech` DNS route success and `SshOrigin` `ssh://192.168.254.148:22`; `cloudflared-bnpi-hris.yml` contains `ssh.bnpi-hris.tech -> ssh://192.168.254.148:22`; VM-side `/etc/cloudflared/config.yml` contains `ssh.bnpi-hris.tech -> ssh://localhost:22`; `Resolve-DnsName ssh.bnpi-hris.tech -Type A` returned Cloudflare edge IPs; LAN SSH to `192.168.254.148:22` passed; after Cloudflare Access app policy allowed `1bis.solutions.tech@gmail.com`, Windows OpenSSH with `-o ProxyCommand="cloudflared access ssh --hostname %h"` returned `SSH_ACCESS_OK` and later `SSH_DOMAIN_OK`, hostname `project-truth-node`, user `infra`, and active VM connector state; Windows SSH alias `project-truth-hris` also returned `SSH_ALIAS_OK`.
- Item: Postgres can be published through Cloudflare Access TCP hostnames for client-side local forwarding, but not as a normal raw public Postgres URL through Cloudflare Tunnel alone.
  - Status: CONFIRMED_RUNTIME_EVIDENCE_WITH_BOUNDARY
  - Evidence: On 2026-07-03, Project Truth tunnel config and helpers were updated to include `db.bnpi-hris.tech -> tcp://<VM>:15432`, `dev-db.bnpi-hris.tech -> tcp://<VM>:15433`, and `uat-db.bnpi-hris.tech -> tcp://<VM>:15434`; the stable helper ports are PROD `localhost:55432`, DEV `localhost:55433`, and UAT `localhost:55434`. After Cloudflare Access browser token return, real Postgres query proof through temporary local forwards passed for PROD, DEV, and UAT: each hostname returned `current_database=hris`, `current_user=postgres`, server port `5432`, and `public_tables=70` through a Node `pg` probe. Later local dev verification kept all three helper forwards active, ran the local API against the DEV forward on `localhost:55433`, and confirmed Playwright login to `http://localhost:5175/admin/dashboard` with dashboard counts matching the DEV DB snapshot: `users=2039`, `employees=2217`, `departments=12`. Boundary: direct `postgresql://postgres:postgres@db.bnpi-hris.tech:5432/hris` requires Cloudflare WARP private routing, Cloudflare Spectrum/raw TCP, or another direct TCP path; with normal Access TCP, clients use `postgresql://postgres:postgres@localhost:<forwarded-port>/hris` after starting `cloudflared`.
- Item: Preferred BNPI remote-admin path is VM-managed Cloudflare Tunnel with browser-rendered SSH at `https://ssh.bnpi-hris.tech`, leaving the BNPI Windows Server as Hyper-V-only with no inbound SSH exposure or Windows `.ssh/config` dependency.
  - Status: ACCEPTED_PENDING_RUNTIME_PROOF
  - Evidence: User clarification on 2026-06-30 requested the clean journey `BNPI Windows Server -> just Hyper-V`, `BNPI Linux VM -> cloudflared on boot`, and `remote admin -> browser terminal`; current repo evidence already confirms VM-side `ssh://localhost:22` ingress and Cloudflare Access CLI SSH, but browser-rendered SSH still requires Cloudflare Access application setting proof.
- Item: Current host-local UAT ports are not healthy while VM LAN UAT is healthy.
  - Status: NEEDS_CONFIRMATION
  - Evidence: `.\scripts\project-truth.ps1 verify -GuestIp 10.184.38.91` on 2026-06-29 showed host-local PROD/DEV PASS, host-local UAT ports `3200` and `3201` FAIL, and LAN UAT PASS through `10.184.38.91`.
- Item: Previous LAN HRIS proof target `10.184.38.91` is historical evidence, not current reachable state from this host.
  - Status: STALE
  - Evidence: Earlier 2026-06-29 proofs showed LAN app/API PASS at `10.184.38.91`; during the 2026-06-29 21:23 PHT Cloudflare repair pass, probes to `10.184.38.91` timed out while `192.168.254.148` passed.
- Item: Terraform SSH port config currently differs from the live VM.
  - Status: RESOLVED
  - Evidence: `terraform-hyperv/terraform.tfvars`, `terraform-hyperv/terraform.tfvars.example`, `terraform-hyperv/variables.tf`, `scripts/configure.ps1`, and `scripts/build-image.ps1` now document LAN SSH port `22`, matching the live bridged VM.

Do not introduce without approval:

- Auth/security changes beyond appliance/bin/project-truth-console-session-hook.sh, hris-api/.wwg/governance/security-review.md, hris-api/app/auth/auth.controller.ts, hris-api/app/auth/auth.router.ts, hris-api/app/auth/index.ts, hris-api/config/security.ts, hris-api/docs/MD Files/auth-api.md, hris-api/docs/SECURITY.md
  - Status: NEEDS_CONFIRMATION
  - Evidence: Existing project adoption audit
- Payment/billing changes beyond hris-app/.react-router/types/app/routes/hr/+types/billings.$id.ts, hris-app/.react-router/types/app/routes/hr/+types/billings.ts, hris-app/app/components/templates/common/billings-template.tsx, hris-app/app/lib/mock-soa-billings.ts, hris-app/app/routes/hr/billings.$id.tsx, hris-app/app/routes/hr/billings.tsx, hris-app/build/client/assets/billings-aJ54d_bS.js, hris-app/build/client/assets/billings._id-sRB6gk7r.js
  - Status: NEEDS_CONFIRMATION
  - Evidence: Existing project adoption audit
- Deployment changes beyond .github/workflows/promote-gitops.yml, .github/workflows/validate.yml, app/Dockerfile, appliance/docker-compose.yml, appliance/zkteco-bridge/Dockerfile, hris-api/Dockerfile, hris-api/docker-compose.yml, hris-api/infrastructure/onprem/observability/docker-compose.yml, hris-app/Dockerfile, hris-app/firebase.json
  - Status: NEEDS_CONFIRMATION
  - Evidence: Existing project adoption audit

## Safety and Production Boundaries

Current boundaries:

- Boundary: mock/demo files detected
  - Status: INFERRED
  - Evidence: README/source/package (safety boundary indicators)

Mock/demo-only areas:

- Area: No mock/demo-only area confirmed
  - Status: NEEDS_CONFIRMATION
  - Evidence: Lightweight audit did not confirm explicit mock/demo areas.

Do not claim production readiness for:

- Capability: appliance/bin/project-truth-console-session-hook.sh, hris-api/.wwg/governance/security-review.md, hris-api/app/auth/auth.controller.ts, hris-api/app/auth/auth.router.ts, hris-api/app/auth/index.ts, hris-api/config/security.ts, hris-api/docs/MD Files/auth-api.md, hris-api/docs/SECURITY.md
  - Status: CONFIRMED
  - Evidence: appliance/bin/project-truth-console-session-hook.sh (auth/security indicator)
- Capability: hris-app/.react-router/types/app/routes/hr/+types/billings.$id.ts, hris-app/.react-router/types/app/routes/hr/+types/billings.ts, hris-app/app/components/templates/common/billings-template.tsx, hris-app/app/lib/mock-soa-billings.ts, hris-app/app/routes/hr/billings.$id.tsx, hris-app/app/routes/hr/billings.tsx, hris-app/build/client/assets/billings-aJ54d_bS.js, hris-app/build/client/assets/billings._id-sRB6gk7r.js
  - Status: CONFIRMED
  - Evidence: hris-app/.react-router/types/app/routes/hr/+types/billings.$id.ts (payments/billing indicator)

## Current Product Direction

Current direction:

- Direction: Current Working Branch, Main Documents, Normal CLI Flow, VHDX Autopilot, Target Architecture, Target Repo Shape, Image Format Targets, Ownership Rules, app/server
  - Status: INFERRED
  - Evidence: README.md (README headings or route files)

Avoid drifting into:

- Drift risk: package metadata vs actual stack
  - Status: NEEDS_CONFIRMATION
  - Evidence: JS/TS source detected without package dependencies.

## Open Questions

- Question: Confirm product category.
  - Why it matters: Category affects profile selection, architecture defaults, and governance gates.
  - Evidence / uncertainty: INFERRED: Web application
- Question: Confirm remaining non-admin role boundaries.
  - Why it matters: Roles affect permissions, UX, terminology, and task routing.
  - Evidence / uncertainty: Admin device/configuration ownership is confirmed; remaining HR/employee sub-role boundaries remain code-observed unless separately reviewed.

## Update Rules

Update this file when:
- product category changes
- user roles change
- canonical terminology changes
- architecture boundaries change
- safety boundaries change
- production-readiness boundaries change
- major product decisions become accepted truth
- high-risk behavior, production claims, approval requirements, or verification expectations change

For adopted projects, do not treat inferred truth as final confirmed truth until reviewed.
