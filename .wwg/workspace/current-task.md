# Current Task

Status: COMPLETE

## Latest Task Addendum - 2026-07-10 Hikvision Synthetic Fingerprint Tally And Live Device Reachability Blocker

- Task mode: Local API/UI truth repair plus runtime blocker isolation.
- User goal:
  - Prove whether fingerprint tally can be tested honestly when a temp
    Hikvision user has no real template bytes, and keep the Device Users modal
    truthful instead of pretending a synthetic count is a physical device
    fingerprint.
- Confirmed SDK truth:
  - Local HCNetSDK headers and Hikvision demo code confirm
    `NET_DVR_FINGER_PRINT_CFG_V50` requires real `dwFingerPrintLen` plus
    `byFingerData` blob content.
  - A temp or copied user with `numOfFP=0` cannot honestly become
    `fingerprintCount=1` at the physical-device truth layer unless a real
    template is read from a source device and written back through the SDK.
- Implemented change:
  - `hris-api/app/device/device.controller.ts` now exposes
    `POST /api/device/hikvision/mock-fingerprint` for a clearly labeled
    dev-only synthetic fingerprint tally on an existing HRIS `DeviceUser` row.
  - The same controller now carries that synthetic tally to the peer HRIS row
    during `POST /api/device/hikvision/copy-user` only when the source user has
    no real fingerprint templates to send, so the FE journey can be tested
    without claiming physical device truth.
  - `hris-app/app/routes/admin/devices/enroll.tsx`,
    `hris-app/app/lib/hooks/useDevices.ts`, and
    `hris-app/app/services/devices.service.ts` now expose the synthetic tally
    state separately from the real fingerprint truth in the Device Users modal.
- Proven local UI/API truth:
  - The exact screenshot row `vendorUserId=9023` on `Main Entrance Device A`
    was confirmed before the patch as:
    - `rawPayload.numOfFP=0`
    - `_hrisDeviceMetadata.credentialSummary.fingerprintCount=0`
  - After restarting the local API, `POST /api/device/hikvision/mock-fingerprint`
    with `fingerprintCount=1` wrote only
    `_hrisDeviceMetadata.syntheticCredentialSummary.fingerprintCount=1` while
    leaving the physical-device truth at `numOfFP=0`.
  - Clearing the same synthetic tally removed
    `_hrisDeviceMetadata.syntheticCredentialSummary` and returned the row to
    pure zero-truth state.
- Live blocker isolated with proof:
  - As of `2026-07-10T09:50Z`, both Hikvision devices were unreachable from
    the VM on both TCP `80` and `8000`.
  - The running VM listener journal simultaneously showed repeated
    `source_user_inventory_read ok=false lastError=7` for both device IDs.
  - Because of that reachability loss, I could not honestly complete a fresh
    real temp-user physical copy/delete pass in this slice even though the
    earlier under-5-second peer-copy proof remains recorded.
- Evidence:
  - `.runtime/hikvision-synth-proof-20260710-165311/mock-fingerprint-9023-proof.json`
  - `.runtime/hikvision-synth-proof-20260710-165311/vm-device-port-check.txt`
  - `.runtime/hikvision-synth-proof-20260710-165311/listener-device-failures.log`

## Latest Task Addendum - 2026-07-10 Hikvision FE To SDK Peer Copy Journey Under 5 Seconds

- Task mode: Local frontend/backend/runtime repair with real-device proof.
- User goal:
  - Make the admin device-user journey tell the truth and physically copy the
    selected Hikvision user to the peer device quickly enough that the flow
    feels under 5 seconds.
- Current-state finding before the final pass:
  - The new `POST /api/device/hikvision/copy-user` path existed, but the local
    API process at `localhost:3001` was stale and did not expose the route
    until the local dev API was restarted.
  - The first working API copy pass still felt slow because it waited on a
    scoped VM run window plus a full target-device user reread; real timings
    were about `10.4s`, then about `6.4s` after removing the whole-device
    source refresh.
- Final change:
  - `scripts/project-truth-hikvision-hot-reload-listener.sh` now supports
    scoped one-off runs with device filtering and a short run window intended
    for a single user-copy request.
  - `hris-api/app/device/device.controller.ts` now exposes a real
    admin-only `POST /api/device/hikvision/copy-user` path that:
    - runs a scoped VM SDK copy from a chosen source device to a chosen target
      device,
    - confirms the peer write from SDK evidence,
    - refreshes only the copied target user into HRIS truth instead of
      rereading the entire target device,
    - and reuses the same copy helper during Hikvision enrollment when the
      target device does not yet physically contain the requested vendor user.
  - `hris-app/app/routes/admin/devices/enroll.tsx`,
    `hris-app/app/lib/hooks/useDevices.ts`, and
    `hris-app/app/services/devices.service.ts` now expose a real
    `Copy to peer device` action in the Device Users panel instead of forcing
    the journey through metadata-only sync assumptions.
- Runtime proof:
  - Temp user `9022` proved the route after the stale API restart; the physical
    peer write landed immediately, but the old endpoint shape still returned in
    about `10.4s`.
  - Temp user `9025` proved the scoped single-user target refresh was active:
    the API response returned `targetSyncTotalSourceRecords=1` and the full
    copy request completed in about `6.392s`.
  - Temp user `9026` reduced the same end-to-end API call to about `5.601s`
    with the shorter VM run window.
  - Temp user `9027` completed the same real device-to-device copy in about
    `2.910s` end to end through the local API route, with
    `beforeTargetStatus=NO MATCH`, `targetSyncTotalSourceRecords=1`, and
    `targetAfterCopyStatus=OK`.
  - Cleanup then deleted temp users `9022` through `9027` from both devices;
    post-delete searches returned `NO MATCH` on `10.184.38.86` and
    `10.184.38.136`.
- Remaining truth:
  - The admin Device Users page now has a real FE-to-SDK copy action in code,
    and the backing API/runtime path is proven under 5 seconds by direct
    endpoint plus device truth.
  - I did not run a final browser-rendered click proof against the new modal in
    this pass; the FE code is wired, but the proof here is API plus direct
    device SDK truth.
- Evidence:
  - `.runtime/hikvision-peer-copy-proof-20260710-163204/copy-9022-proof.json`
  - `.runtime/hikvision-peer-copy-proof-20260710-163204/copy-9022-after-api-restart.json`
  - `.runtime/hikvision-peer-copy-proof-20260710-163204/copy-9023-summary.json`
  - `.runtime/hikvision-peer-copy-proof-20260710-163204/copy-9024-summary.json`
  - `.runtime/hikvision-peer-copy-proof-20260710-163204/copy-9025-summary.json`
  - `.runtime/hikvision-peer-copy-proof-20260710-163204/copy-9026-summary.json`
  - `.runtime/hikvision-peer-copy-proof-20260710-163204/copy-9027-summary.json`
  - `.runtime/hikvision-peer-copy-proof-20260710-163204/cleanup-9022-9027.json`

## Latest Task Addendum - 2026-07-10 Hikvision Fast User Delta Path

- Task mode: Local runtime refactor, device-to-device latency reduction, and
  real-device evidence.
- User goal:
  - Reduce the perceived Hikvision cross-device user-copy delay from about
    60 seconds to about 3-5 seconds in local dev mode.
- Current-state finding before the refactor:
  - Live VM listener logs showed generic Hikvision operation-sync callbacks
    (`OBSERVED_OPERATION_MINOR_112/121/122`) were triggering sequential
    full-mirror reconciles.
  - One observed 4-user mirror blocked the single worker from about
    `07:48:32Z` to `07:50:00Z`, with per-user fingerprint read/write waits
    dominating the latency.
- Change:
  - `vendor/hikvision-linux/hikvision_biometric_service.cpp` now routes
    generic operation-sync callbacks with no `employeeNo` through a fast
    inventory-delta path first.
  - The fast path reads source and peer employee inventories, computes missing
    employee numbers per peer, and writes only the missing user records
    immediately, without blocking on fingerprint reads/writes.
  - Manual full mirror behavior remains available for explicit/manual runs.
- Runtime proof:
  - After rebuilding on the VM and restarting
    `project-truth-hikvision-hot-reload-listener.service`, live callbacks at
    `07:57:03Z` showed `reconcile_fast_path_inventory_delta` and
    `reconcile_fast_path_completed` instead of the earlier long-running
    full-mirror pattern.
  - A real temp user `9012` was created on source device `AAA`
    (`10.184.38.86`) by ISAPI.
  - A one-off real-device reconcile using the patched binary then copied
    `9012` from `AAA` to `Main Entrance Device` in the same second:
    `reconcile_queued`, `source_user_read ok=true`, `peer_user_write ok=true`,
    and `reconcile_completed` all logged at `2026-07-10T07:59:44Z`.
  - A later live-listener proof with the polling fallback created temp user
    `9013` on `AAA`; the running service detected the missing peer user at
    `08:11:37Z`, queued `poll_missing_user`, wrote the peer user at
    `08:11:38Z`, and completed the reconcile at `08:11:38Z`.
  - A one-off single-user fingerprint mirror for existing employee `1`
    completed in about one second: `source_user_read` at `08:11:58Z`,
    `source_fingerprint_read`, `peer_user_write`, `peer_fingerprint_write`,
    and `reconcile_completed` all landed by `08:11:59Z`.
  - Direct current-device truth check for employee `21` then showed:
    `AAA -> numOfFP=0, numOfFace=0` and
    `Main Entrance Device A -> numOfFP=1, numOfFace=1, faceURL present`.
  - A local `POST /api/device/cmpxw13hx002h7zwso7dyedrn/users/sync` refresh
    updated the saved `DeviceUser` row for vendor user `21` so the API now
    returns `numOfFP=1`, `numOfFace=1`, and `faceURL` for
    `Main Entrance Device A`.
  - Cleanup delete calls for `9012` returned `statusString=OK` on both
    devices.
  - Cleanup delete calls for `9013` also returned `statusString=OK` on both
    devices.
- Remaining truth:
  - The user-copy path itself is now fast when driven through the user-only
    reconcile flow.
  - The fingerprint copy path itself is now fast when driven through the
    single-user reconcile flow.
  - Direct ISAPI create of `9012` on `AAA` still did not produce a usable
    user-management callback in the next 15 seconds, so automatic propagation
    for API-created users remains gated by device callback behavior unless the
    new poll fallback detects the missing peer user.
- Evidence:
  - `.runtime/hikvision-fast-path-20260710-155617/listener-fast-path-after-restart.log`
  - `.runtime/hikvision-fast-path-20260710-155617/temp-create-9012-proof.txt`
  - `.runtime/hikvision-fast-path-20260710-155617/listener-since-create-9012.log`
  - `.runtime/hikvision-fast-path-20260710-155617/manual-single-user-9012.jsonl`
  - `.runtime/hikvision-fast-path-20260710-155617/delete-9012-proof.txt`
  - `.runtime/hikvision-under5-proof-20260710-161015/auto-create-9013-journal.txt`
  - `.runtime/hikvision-under5-proof-20260710-161015/fingerprint-single-user-1.jsonl`
  - `.runtime/hikvision-under5-proof-20260710-161015/delete-9013.txt`
  - `.runtime/hikvision-ui-truth-20260710-161529/user21-both-devices.json`
  - `.runtime/hikvision-ui-truth-20260710-161529/main-user21-after-sync.json`

## Latest Task Addendum - 2026-07-10 VM Static IP 10.184.37.241 Host Route Repair

- Task mode: Runtime/network drift repair with local host evidence.
- User goal:
  - The running Hyper-V VM should be reachable from the Windows host at static
    `10.184.37.241`, not only through the transient `192.168.*` Default Switch
    address.
  - Local HRIS API/database access should work when the app/browser is
    refreshed.
- Current-state finding:
  - Hyper-V reported `project-truth-local-vhdx-proof` running on
    `Default Switch` with guest IPs `10.184.37.241`,
    `192.168.237.193`, and link-local IPv6.
  - Inside the VM, `eth0` had `10.184.37.241/24` and
    `192.168.237.193/20`; DB/API ports were listening on `0.0.0.0`.
  - Windows could reach the transient `192.168.237.193` address, but could not
    reach `10.184.37.241` because `vEthernet (Default Switch)` only had
    `192.168.224.1/20`, so Windows routed `10.184.37.241` through Wi-Fi.
- Repair:
  - Added host-side `10.184.37.250/24` to `vEthernet (Default Switch)`.
  - Added idempotent recovery script:
    `scripts/ensure-project-truth-vm-241-host-route.ps1`.
  - The script verifies the named VM, ensures the host-side Default Switch
    address exists, and probes `10.184.37.241` ports `22`, `3000`, `3001`,
    `15432`, `15433`, and `15434`.
- Validation:
  - Windows TCP probes to `10.184.37.241` passed for SSH, app/API, and
    PROD/DEV/UAT DB ports.
  - SSH to `infra@10.184.37.241` returned hostname `project-truth-node` and
    `eth0` with `10.184.37.241/24`.
  - Prisma from Windows to
    `postgresql://postgres:postgres@10.184.37.241:15433/hris?schema=public`
    returned `db=hris`, `user=postgres`, server port `5432`, and
    `public_tables=73`.
  - `http://10.184.37.241:3001/health`, `http://localhost:3001/health`, and
    admin login through both API paths passed.
  - Headless browser refresh/login at `http://localhost:5175/auth/login`
    reached `http://localhost:5175/admin/dashboard`.
- Evidence:
  - `.runtime/vm-static-ip-241-repair-20260710-075945/`
  - Screenshot proof:
    `.runtime/vm-static-ip-241-repair-20260710-075945/vm-10.184.37.241-proof.png`
    and
    `.runtime/vm-static-ip-241-repair-20260710-075945/localhost-app-refresh-login-proof.png`

## Latest Task Addendum - 2026-07-09 Device UX And Employee Hard Delete

- Task mode: Mixed UI/UX hardening, admin destructive-action safety, API
  contract repair, and local evidence.
- User goal:
  - Verify and clarify Add/Edit Device, device list event journeys, Device
    events modals/details, and responsive behavior for a normal HRIS admin.
  - Keep the Device events model truth centered on `eventCategory` and
    `eventAction`, with `source` only as Runtime path/debug and `status` only
    as HRIS result.
  - Add an admin-only Employee hard delete dropdown journey that previews
    relation blockers before any destructive execute path can run.
- UI result:
  - Add/Edit Device now groups adapter/callback fields under
    `Vendor and runtime routing`, while retaining `Runtime adapter`,
    `Internal adapter key`, and `Callback path` as intended terms with clearer
    helper copy.
  - Device events copy no longer presents browser socket connectivity as SDK
    tap truth. The page uses clearer labels such as
    `Browser connected; no recent SDK tap`,
    `No saved device event has arrived in this view yet`,
    `No recent SDK tap saved`, `Any event category`, and `Any event action`.
  - Employee admin rows expose `Preview hard delete` only for admin
    configuration users. The modal shows blocker, delete, detach, and archive
    counts, relation details, typed confirmation only when safe, and specific
    toasts.
- API result:
  - Added `POST /api/employee/:id/hard-delete-preview`.
  - Preview mode is non-mutating and returns the exact blocker/delete/detach
    plan.
  - Execute mode requires an admin actor, a safe preview with no blockers, and
    typed `DELETE <employeeId>` confirmation. Device events/users and audit
    references are detached rather than deleted; legal/payroll/attendance/time
    history blockers stop hard delete.
- Validation:
  - `hris-app` focused tests passed:
    `npm test -- app/lib/device-events-page-contract.test.ts app/lib/employee-hard-delete-ui-contract.test.ts app/services/employees.service.test.ts`.
  - `hris-api` focused direct Mocha tests passed:
    `npx tsx node_modules/mocha/bin/mocha --no-config tests/employee-hard-delete.contract.spec.ts tests/device-events-api-contract.spec.ts tests/device-event-taxonomy.helper.spec.ts`.
  - `hris-api npm run typecheck` passed.
  - `hris-app npm run typecheck:test` still fails only on the pre-existing
    `TimesheetsTab.test.tsx` React Query mock typing issue already tracked as
    `REC-20260706-TEST-TYPECHECK-MOCKS`.
  - Real local API dry-run as `admin@bandai.local` returned HTTP 200 with
    `blockerCount=2`, `deleteCount=2`, `detachCount=13`, and
    `archiveCount=0`; no execute call was made against live employee data.
  - Headless Playwright verified admin login, Add Device desktop/narrow,
    Edit Device from list, device list `View all events`, row
    `View Device Events`, Device events page desktop/narrow, Sync logs modal,
    Listener modal, event details modal, and employee hard-delete preview
    blocker modal.
- Evidence:
  - `.runtime/device-ui-ux-employee-delete-20260709-231712/`
  - API dry-run:
    `.runtime/device-ui-ux-employee-delete-20260709-231712/employee-hard-delete-preview-dry-run.json`
  - Browser proof:
    `.runtime/device-ui-ux-employee-delete-20260709-231712/playwright-verification.json`
    and screenshots under
    `.runtime/device-ui-ux-employee-delete-20260709-231712/screenshots/`

## Latest Task Addendum - 2026-07-09 Hikvision Listener Admin Control

- Task mode: Mixed UI/UX hardening, local runtime control, and operator
  evidence.
- User goal:
  - The Device attendance page should show the real VM listener heartbeat, not
    only recent tap evidence.
  - Admin should have a clean control journey to check, start/stop, and restart
    the local VM hot-reload Hikvision listener if it stops.
- Backend result:
  - Added admin-only fixed endpoints:
    `GET /api/device/hikvision/listener` and
    `POST /api/device/hikvision/listener`.
  - The API controls only the fixed VM systemd service
    `project-truth-hikvision-hot-reload-listener.service` over SSH to
    `10.184.37.241`; allowed actions are `start`, `stop`, and `restart`.
  - The implementation uses `execFile` with fixed arguments and an action
    allowlist, not arbitrary shell command input.
- UI result:
  - The header separates saved-row proof from VM listener heartbeat:
    `SDK listener recent` / `VM listener running`.
  - The status strip now treats a running VM service as healthy heartbeat and
    uses `Waiting for next tap` when no fresh tap has arrived yet.
  - Added a `Hikvision listener` modal with service status, enabled toggle,
    non-mutating `Check status`, restart action, runtime target, and recent
    listener log tail.
  - The shared modal component now wires its visible title into
    `aria-labelledby` and description into `aria-describedby`.
- Validation:
  - `npm test -- app/lib/device-events-page-contract.test.ts` passed in
    `hris-app`.
  - `npm test -- --grep "Hikvision biometric sync contract"` passed in
    `hris-api`.
  - Playwright proof logged in locally, opened the listener modal, refreshed
    status, closed/reopened, closed with Escape, and captured screenshots.
  - Admin API restart proof restarted the VM service from PID `129398` to
    `192455`, then returned `active/running`; SDK init/login/alarm arm and
    callback posts were `ok=true`.
- Evidence:
  - `.runtime/hikvision-listener-modal-playwright-20260709-221455/`
  - `.runtime/hikvision-listener-api-restart-20260709-221703/`

## Latest Task Addendum - 2026-07-09 Hikvision Live Listener Execute Default

- Task mode: Bug fix / operator workflow repair for local hot-reload tap
  debugging.
- User goal:
  - Live taps should save into the hot-reload HRIS path by default instead of
    silently running preview-only.
- Change:
  - `vendor/hikvision-linux/hikvision_biometric_service.cpp` now defaults
    `execute_mode` to `true`.
  - `--execute` remains accepted and idempotent.
  - New `--dry-run` flag restores preview-only behavior when intentionally
    needed.
  - `vendor/hikvision-linux/README.md` now documents execute as the live
    listener default.
- Validation:
  - Focused contract test passed:
    `npm test -- --grep "Hikvision biometric sync contract"` in `hris-api`.
  - The VM copy under
    `/tmp/project-truth-hikvision-live-20260709-credential-repair/vendor-hikvision-linux`
    was rebuilt.
  - Default-mode smoke ran without `--execute`, reported `mode=execute`,
    `sdk_alarm_arm ok true`, posted callback results with `ok=true`, and
    cleaned up the alarm channel.
- Evidence:
  - `.runtime/hikvision-default-execute-smoke-20260709-213551/`

## Latest Task Addendum - 2026-07-09 Hikvision Hot-Reload Listener Truth UI

- Task mode: Mixed local runtime repair, UI truth repair, and operator
  evidence.
- User goal:
  - The Device attendance page must not show a green/live state merely because
    the browser socket is connected when the VM Hikvision SDK listener is not
    actually receiving/posting tap events.
  - Local hot reload should keep receiving taps without an agent manually
    starting a one-off listener.
- Runtime repair:
  - Installed and enabled VM systemd service
    `project-truth-hikvision-hot-reload-listener.service`.
  - The service runs the rebuilt Linux HCNetSDK listener continuously against
    live Hikvision `192.168.254.189:8000` and posts to the Windows host local
    hot-reload API at `http://10.184.37.248:3001`.
  - The service uses `--device-file
    /run/project-truth/hikvision-hot-reload-device.spec` so the device password
    does not appear in process arguments.
  - Service status was active/running, posted callback results with `ok=true`,
    and local API showed recent rows including serial `1613` mapped to
    `Ernst tey Malasa`.
- UI repair:
  - Saved Hikvision/HCNetSDK views now poll saved rows every 2 seconds even
    when the browser socket is connected.
  - The page now distinguishes browser socket connectivity from fresh SDK
    listener evidence.
  - The prior green labels are replaced for SDK alarm scopes with:
    `SDK listener recent`, `SDK listener receiving taps`, and
    `SDK alarm rows fresh` only when recent `EN_HCNETSDK_ALARM` rows exist.
  - When no recent SDK row exists, the page shows SDK idle/not-recent wording
    instead of implying the physical tap path is live.
- Validation:
  - `npm test -- --grep "Hikvision biometric sync contract"` passed in
    `hris-api`.
  - `npm test -- app/lib/device-events-page-contract.test.ts` passed in
    `hris-app`.
  - Headless browser proof showed the localhost page contains
    `SDK listener recent`, `SDK listener receiving taps`, and no old
    `Saved rows live` / `Saved rows update live` wording.
- Evidence:
  - `.runtime/hikvision-hot-reload-daemon-20260709-213948/`
  - `.runtime/hikvision-hot-reload-service-20260709-214733/`

## Latest Task Addendum - 2026-07-09 Hikvision Credential Repair Success

- Task mode: Mixed credential repair, local hot-reload proof, VM SDK proof,
  and evidence.
- User supplied a new Digest Auth credential for `admin` on the live Hikvision
  terminal at `192.168.254.189`.
- Host direct credential proof:
  - `GET http://192.168.254.189:80/ISAPI/Security/userCheck` with Digest Auth
    returned HTTP `200`, `statusValue=200`, and `statusString=OK`.
- VM/PROD runtime repair:
  - Updated PROD `Main Entrance Device` `Device.access` in VM Postgres with
    username `admin` and a redacted 16-character password.
  - VM-backed `GET /api/device/:id/health` now reports network `reachable`,
    device API `online`, and reads terminal time from `192.168.254.189`.
  - Current PROD `sync-preview` still reports event-total unavailable
    (`code 1073741828`), which is now separate from credential auth because
    device health succeeds.
- Local hot-reload repair:
  - Local hot-reload API/app were already running at `localhost:3001` and
    `localhost:5175`.
  - Local API points at VM DEV Postgres on `10.184.37.241:15433`, so the DEV
    `Main Entrance Device` row was updated to `192.168.254.189:80`, protocol
    `http`, model `DS-K1T341CMFW`, SDK port `8000`, source
    `vendor/hikvision-linux`, callback path `/api/hikvision/callback`, and the
    same redacted credential.
  - Local `GET /api/device/:id/health` now reports `online`.
  - Local `GET /api/device/sync-preview?deviceId=cmpxw13hx002h7zwso7dyedrn`
    now reports `vendorEventCount=1518`, `vendorUserCount=7`,
    `canStartSync=true`, and `status=needs_sync`.
  - Local Playwright proof opened
    `http://localhost:5175/admin/configuration/devices/events?view=saved&deviceId=cmpxw13hx002h7zwso7dyedrn&source=EN_HCNETSDK_ALARM`
    and rendered the saved-events page with `Main Entrance Device`,
    `Ernst tey Malasa`, live-row text, and the updated configured address.
- VM HCNetSDK proof:
  - Current `vendor/hikvision-linux/hikvision_biometric_service.cpp` built and
    ran from the VM against `192.168.254.189:8000`.
  - SDK init succeeded, callback registration succeeded, SDK login succeeded
    with `lastError=0`, and alarm arm succeeded with `lastError=0`.
  - The listener received live ACS/fingerprint events, posted them to
    `/api/hikvision/callback`, and HRIS persisted 74 recent
    `EN_HCNETSDK_ALARM` rows for `Main Entrance Device`.
  - Recent saved rows include fingerprint pass events for `employeeNo=1`; they
    currently persist as `UNMATCHED` where employee mapping is not resolved in
    the PROD data.
- Evidence:
  - `.runtime/hikvision-credential-local-hotreload-20260709-210645/`
- Remaining boundary:
  - Credential auth and real SDK event delivery are no longer blocked.
  - Remaining work is product/data follow-up: reconcile employee/device-user
    mapping and classify why PROD sync-preview event-total still reports
    `code 1073741828` while health and SDK listener succeed.

## Latest Task Addendum - 2026-07-09 Hyper-V Default Switch Route Repair

- Task mode: Mixed VM route repair, credential boundary, SDK proof, and
  evidence.
- User goal:
  - Continue local Hyper-V plus Hikvision repair with Project Truth runtime
    inside `project-truth-local-vhdx-proof`, Docker inside the VM, and no new
    Hyper-V switch unless `Default Switch` is disproven.
  - First repair boot-time route drift, then repair live Hikvision credentials
    for `Main Entrance Device` at `192.168.254.189`, then rerun HRIS and SDK
    proof.
- Runtime result:
  - VM remains attached to `Default Switch`.
  - VM host-access IP remains `10.184.37.241/24`.
  - Boot-time LAN owner config was changed from stale static
    `172.31.99.250/23` plus default route `172.31.98.1` to
    `/etc/project-truth/lan.env` DHCP mode with pinned
    `PROJECT_TRUTH_LAN_DHCP_ADDRESSES=10.184.37.241/24`.
  - After reboot, netplan kept `dhcp4: true` plus `10.184.37.241/24`, the VM
    received `Default Switch` DHCP/NAT address `172.26.59.137/20`, defaulted
    through `172.26.48.1`, and reached `192.168.254.189:80` and `:8000`.
  - Stale failed `project-truth-hikvision-route.service` was disabled. The
    normal `project-truth-ansible-pull.timer` was re-enabled.
- HRIS/API proof:
  - `http://10.184.37.241:3001/health` returned healthy after reboot.
  - Admin login to the VM-backed API succeeded.
  - `/api/device/:id/health` for `Main Entrance Device` reported network
    `reachable` and device API `Unauthorized`.
  - `/api/device/sync-preview?deviceId=cmqq3ho8c002eti3dzzk94z1w` returned
    `source_unavailable` with error `Unauthorized`.
- Credential boundary:
  - The runtime `Device.access` source has username `admin` and a present
    9-character password, but direct digest auth to
    `http://192.168.254.189/ISAPI/System/time?format=json` returned HTTP `401`
    and the device reported `lockStatus=lock`.
  - Redacted credential-source search found no alternate documented runtime
    credential. Historical `AlarmDemo.config` matches the current 9-character
    credential hash; other hits are examples, tests, or placeholders.
- SDK proof:
  - Current `vendor/hikvision-linux/hikvision_biometric_service.cpp` was copied
    to the VM and built against the Linux HCNetSDK under
    `~/project-truth-hcnetsdk/EN-HCNetSDKV6.1.9.48_build20230410_linux64`.
  - SDK init and callback registration succeeded.
  - SDK login to `192.168.254.189:8000` failed with HCNetSDK error `153` while
    the device was locked, so no alarm channel was armed.
- Evidence:
  - `.runtime/hikvision-route-credential-repair-20260709-204243/`
- Remaining boundary:
  - Real tap proof is still missing. Route drift is repaired; the active
    blocker is credential custody/rotation for the live Hikvision terminal.
    Continuing without a verified credential would mean guessing an unknown
    device secret and can prolong terminal lockout.

## Latest Task Addendum - 2026-07-09 Hikvision Real-Tap Pipeline Continuation

- Task mode: Mixed runtime proof, credential boundary, callback/realtime
  simulation, tests, and evidence.
- User goal:
  - Continue the previously blocked real physical Hikvision tap pipeline now
    that host-test VM `10.184.37.241` can reach `10.184.37.139`.
  - Prove the path from Linux HCNetSDK alarm callback through
    `/api/hikvision/callback`, `DeviceEvent`, socket emit, and local saved-events
    UI when real tap evidence is available.
- Current-state result:
  - Local API dry-run proof passed. `http://localhost:3001/health` was healthy,
    admin login succeeded, `/api/hikvision/callback?preview=true` matched
    `Main Entrance Device` id `cmpxw13hx002h7zwso7dyedrn` at
    `10.184.37.139:80`, used source `EN_HCNETSDK_ALARM`, and saved zero rows
    for the preview marker.
  - Host-test VM `10.184.37.241` reached the Hikvision physical device:
    `ping 10.184.37.139` passed with 0% loss, TCP `80` passed, and TCP `8000`
    passed.
  - Docker is running on the host-test VM; PROD/DEV/UAT app/API containers are
    present. A stale existing `hris-hikvision-watcher` process was observed
    using old `10.184.38.215`, so it is drift and not current device proof.
  - Current local `vendor/hikvision-linux` source was copied to a task-scoped
    VM temp folder and built with
    `vendor/hikvision-linux/scripts/build-hikvision-biometric-service.sh`
    against Linux HCNetSDK.
  - Bounded SDK run proved `NET_DVR_Init` and
    `NET_DVR_SetDVRMessageCallBack_V51`; `NET_DVR_Login_V40` failed with
    HCNetSDK error `1` because no real Hikvision device credential pair was
    available from documented local config, VM env, Docker env, Kubernetes env,
    or previous evidence searched in this pass. `NET_DVR_SetupAlarmChan_V50`
    could not be reached without login.
- Simulation evidence, explicitly not real-tap proof:
  - Non-production SDK-shaped callback saved `DeviceEvent`
    `cmrd1gb4900347zk0v59jp7e6`, returned through the saved-events API, and
    emitted one `device-event:saved` socket payload.
  - Browser proof opened
    `http://localhost:5175/admin/configuration/devices/events?deviceId=cmpxw13hx002h7zwso7dyedrn&source=EN_HCNETSDK_ALARM`
    first, waited for "Saved rows update live", then a simulated callback made
    marker `CODEX-UI-LIVE-HCNETSDK-READY-1783573373427` appear with
    "Socket received" and no manual refresh.
- Evidence directory:
  - `.runtime/hikvision-real-tap-pipeline-20260709-125441/`
- Validation:
  - `python -m unittest vendor.hikvision-linux.tests.test_probe` passed
    11 tests.
  - `npm test -- --grep "Hikvision callback controller|Hikvision biometric sync contract|device event realtime helper"`
    in `hris-api` passed 7 tests.
  - `npm run typecheck` in `hris-api` passed.
  - `npm test -- app/lib/device-events-realtime-ui.test.ts` in `hris-app`
    passed 16 tests.
- Remaining boundary:
  - Real physical tap proof is still missing. The current blocker is not
    host-test VM reachability; it is absence of a documented real Hikvision
    credential source for SDK login/alarm arm. Once credentials are supplied,
    rerun the service, prove `NET_DVR_Login_V40`,
    `NET_DVR_SetupAlarmChan_V50`, capture real JSONL callback output, and then
    verify real saved row, attendance/timesheet projection where applicable,
    socket emit, and browser live-row update.

## Latest Task Addendum - 2026-07-09 Hikvision HCNetSDK Single Source

- Task mode: Mixed runtime path repair, API contract, tests, and evidence.
- User goal:
  - Make the Linux HCNetSDK path the clean single source of truth for live
    Hikvision tap events.
  - Keep HRIS `Device` row truth at `Main Entrance Device`,
    `10.184.37.139:80`, protocol `http`, model `DS-K1T341CMFW`, SDK port
    `8000`.
- Implementation result:
  - `vendor/hikvision-linux/hikvision_biometric_service.cpp` is now the only
    active C++ HCNetSDK runtime source.
  - Removed the old active `hcnetsdk_alarm_probe` build path and replaced it
    with `scripts/build-hikvision-biometric-service.sh`.
  - SDK callback work stays minimal: parse ACS alarm, emit JSONL evidence,
    queue HRIS callback posting, and queue biometric reconcile only for
    user/fingerprint management events.
  - Worker posts SDK alarm events to `/api/hikvision/callback` with source
    `EN_HCNETSDK_ALARM`, so existing callback logic owns `DeviceEvent`
    persistence, attendance/timesheet projection, cache invalidation, and
    `device-event:saved` socket emission.
  - Added `/api/hikvision/callback?preview=true` / `dryRun=true` as a
    non-mutating proof path before persistence.
  - DEV seed defaults and Hikvision tests now use `10.184.37.139` instead of
    stale Hikvision addresses.
- Evidence:
  - Endpoint/API proof:
    `.runtime/hikvision-hcnetsdk-single-source-20260709-100621/local-api-callback-preview-proof-after-restart.json`.
    Admin login passed, callback preview matched `Main Entrance Device`,
    no preview row was saved, and biometric reconcile dry-run returned planned
    changes with `rawFingerprintTemplateStored=false`.
  - Accidental stale-API preview row cleanup:
    `.runtime/hikvision-hcnetsdk-single-source-20260709-100621/accidental-preview-row-cleanup.json`
    deleted only `employeeNo=CODEX-PREVIEW` row
    `cmrcvgud903247zb8zk9bt6e4` after the stale API saved it before restart.
  - Network/runtime proof:
    `.runtime/hikvision-hcnetsdk-single-source-20260709-100621/network-runtime-owner-proof.json`
    and `vm-network-cloudflared-proof-clean.json`.
    Windows host reached `10.184.37.139:80` and `:8000`; direct VM at
    `10.184.37.19` failed both with `No route to host`.
  - SDK/build proof:
    `.runtime/hikvision-hcnetsdk-single-source-20260709-100621/vm-hikvision-biometric-service-build-proof-after-fix.json`
    compiled and linked `hikvision-biometric-service` against VM
    `libhcnetsdk.so`.
    `.runtime/hikvision-hcnetsdk-single-source-20260709-100621/vm-hikvision-biometric-service-bounded-run.json`
    proved `NET_DVR_Init` and callback registration, then `NET_DVR_Login_V40`
    failed with SDK error `7` before arm because the VM cannot route to the
    device.
  - Host-local Linux owner check:
    `.runtime/hikvision-hcnetsdk-single-source-20260709-100621/wsl-runtime-owner-proof.json`
    found only `docker-desktop` WSL and no usable bash userland; Docker Linux
    engine was not running.
- Validation:
  - `python -m unittest vendor.hikvision-linux.tests.test_probe` passed.
  - `npm test -- --grep "Hikvision callback controller|Hikvision biometric sync contract|Hikvision device seed defaults|Hikvision endpoint config|device event realtime helper|DEV Hikvision watcher runtime manifest"` passed.
  - `npm run typecheck` in `hris-api` passed.
  - `npm test -- app/lib/device-events-realtime-ui.test.ts` in `hris-app`
    passed.
- Remaining boundary:
  - Real SDK login, alarm arm, physical tap callback, saved row existence,
    socket delivery to `localhost:5175`, and browser live-row proof remain
    unproven until either VM-to-device routing is repaired or a real
    host-local Linux runtime with device reachability is prepared and supplied
    valid Hikvision credentials.

## Latest Task Addendum - 2026-07-09 Hikvision Device Row Drift Correction

- User clarified current Hikvision config truth from the admin UI:
  `Main Entrance Device`, `Hikvision` / `DS-K1T341CMFW`, address
  `10.184.37.139`, HTTP port `80`, protocol `HTTP`.
- Drift correction:
  - Hikvision Linux probe defaults, README examples, and discovery wrapper now
    use `10.184.37.139` instead of historical `192.168.254.181` /
    `10.184.38.215` candidates.
  - The discovery wrapper now uses direct LAN SSH `10.184.37.19` with
    `node-health-appliance_ed25519` and no longer defaults Hikvision username
    to HRIS `admin@bandai.local`.
  - Historical `.234/.235` references are ZKTeco evidence, not Hikvision
    config truth, and must not be copied into the Hikvision runtime path.

## Latest Task Addendum - 2026-07-09 Hikvision Biometric Sync Architecture

- Task mode: Docs-only architecture intake with code-discovery evidence.
- Latest user request:
  - Document the Hikvision Linux HCNetSDK alarm-callback biometric sync
    architecture in WWG.
  - Use the existing Windows HCNetSDK reference under
    `C:\Users\anoni\OneDrive\Desktop\HRIS-PROJECT\EN-HCNetSDKV6.1.9.4_build20220412_win64`
    as behavior evidence.
  - Make the future Linux runtime copy/refactor the callback/user/fingerprint
    sync behavior without preserving demo names such as `AlarmDemo`.
- Current-state finding:
  - The Windows reference `AlarmDemo.cpp` includes multi-device SDK login,
    `NET_DVR_SetDVRMessageCallBack_V51`, alarm arming, ACS event
    classification, user sync, fingerprint read/write, broker enrollment,
    queued employee sync, and event-triggered reconcile.
  - The Project Truth Linux scaffold already has a bounded
    `hcnetsdk_alarm_probe.cpp`, but Linux SDK login/alarm callback remains
    unproven from the VM because the earlier SDK login returned
    `NET_DVR_PASSWORD_ERROR (1)`.
- Documentation result:
  - Added `.wwg/wiki/05-architecture/hikvision-biometric-sync-architecture.md`
    as target architecture.
  - Synced Project Truth, Project Truth Summary, terminology, runtime truth,
    and recommendation registry with the target architecture and boundaries.
- Boundaries:
  - Raw fingerprint template storage in normal `User` records is not approved
    without encryption, access-control, and retention design.
  - Device writes/deletes and template propagation require dry-run, audit,
    backup/recovery, and rollback evidence before production use.
  - The running VM-managed Cloudflare Tunnel must remain active during future
    VM/GitOps/runtime proof.

## Latest Task Addendum - 2026-07-09 Real Endpoint Dry-Run Pattern

- User standardized the preferred investigation pattern: authenticate as the
  correct local actor, call the exact endpoint used by the page in dry-run or
  preview mode, time it with `Measure-Command`, and capture full JSON/API
  evidence before browser/UI diagnosis.
- `AGENTS.md` now records this as the Project Truth Real Endpoint Dry-Run Rule.
- `.wwg/governance/drift-guard.md` now enforces direct API/network endpoint
  proof before screenshots or code guessing, with `.runtime/<task-stamp>/`
  evidence capture.
- Browser verification remains Playwright-first for the current local
  environment, but browser proof follows endpoint proof for runtime regressions.

## Latest Task Addendum - 2026-07-09

- Task mode: Mixed governance update, runtime schema repair, and admin UI regression repair.
- Latest user request:
  - Prefer headless Playwright over Vercel `agent-browser` for current Project Truth browser verification because `agent-browser` is unreliable on this Windows host.
  - Use dry-run/API evidence against the actual page endpoint before guessing from the UI.
  - Repair `/admin/configuration/devices/events?view=saved&action=sync-logs` so the Sync device logs modal can find configured sync-capable devices.
- Local evidence:
  - Direct API proof hit the real frontend endpoint `GET http://localhost:3001/api/device/sync-preview`.
  - Initial API proof failed with HTTP 500 because local DEV Postgres was missing `public.device_sync_runs`.
  - Full `npm run prisma-postgres:push` was not applied because Prisma warned it would drop populated `benefit_types.sourceCode`, `sourceFrequency`, and `sourceSchedule` columns.
  - A narrow create-only SQL repair created `DeviceSyncRunType`, `DeviceSyncRunStatus`, `device_sync_runs`, its foreign key, and indexes without dropping data. Evidence: `.runtime/device-sync-preview-20260709-080841-db-repair/db-repair-output-split.json`.
  - After repair, `GET /api/device/sync-preview` returned HTTP 200 in about `0.075s` with one `Main Entrance Device` row. Evidence: `.runtime/device-sync-preview-20260709-080841/api-sync-preview-evidence.json`.
  - Headless Playwright against `http://localhost:5175/admin/configuration/devices/events?view=saved&action=sync-logs` captured one preview row, no "No sync-capable devices", and no "No device preview rows returned". Evidence: `.runtime/device-sync-preview-20260709-081043-playwright/playwright-sync-logs-evidence.json` and `.runtime/device-sync-preview-20260709-081043-playwright/sync-logs-modal.png`.
- Code/test result:
  - The sync preview path now tolerates a missing `device_sync_runs` table by continuing without latest skipped-run counts instead of blanking/failing the modal.
  - Focused backend regression passed: `npm test -- --grep "sync preview"`.
  - Focused Playwright smoke passed: `npx playwright test -c playwright.smoke.config.ts tests/smoke/admin-device-events-sync-modal.spec.ts`.
- Remaining drift:
  - Hikvision source-count and SDK proof must be rerun against the current
    `Main Entrance Device` row `10.184.37.139:80` with SDK port `8000` from
    device config. Older `10.184.38.x` Hikvision targets are historical only.
  - GitOps/K3s/public DEV promotion remains open before treating this local fix as production runtime proof.

## Latest Task Addendum - 2026-07-06

- Task mode: Mixed meaningful feature, persistence, admin UX, and local runtime verification.
- Latest user request:
  - Add Device Users as a clear row dropdown destination from `/admin/configuration/devices`.
  - Replace immediate user sync with a review-first flow and a final `Sync device users` confirmation inside the modal.
  - Keep the flow visually consistent with the existing Sync Logs modal while using distinct terminology so admins do not confuse identity records with attendance logs.
- Local decision:
  - `DeviceUser` is the durable device identity/enrollment record.
  - `EmployeeDeviceEnrollment` was avoided because current evidence supports direct optional `DeviceUser.employeeId` plus status/source metadata.
  - `Sync device users` and `Sync logs` remain separate admin actions.
  - Biometric template transfer was not implemented because safe vendor read/write plus backup/restore capability was not proven.
- Local evidence:
  - API and frontend hot reload used `localhost:3001` and `localhost:5175`.
  - Physical Hikvision `UserInfo/Search` sync created 6 physical-source `DeviceUser` rows; 4 were auto-linked and 2 remained `UNMATCHED`.
  - Legacy backfill from `Employee.deviceEmpId` created 2,213 additional rows, leaving 2,219 total `DeviceUser` rows and 2,217 linked rows.
  - Hikvision log sync processed 982 source rows, saved 376, classified 606 as known skipped, failed 0, and left 0 truly missing.
  - Browser proof exists at `.runtime/browser-evidence/screenshots/device-users-review-sync-modal.png` and `.runtime/browser-evidence/device-users-review-sync-evidence.json`.
- Remaining drift:
  - Promote and verify the implementation through VM/GitOps/public DEV before calling it production runtime truth.

## Task Summary

- Task mode: Mixed docs/config/runtime drift repair after Existing Project Adoption
- Existing Project Adoption context:
  - This repo was adopted into WWG from existing code/docs/config.
  - Code/docs/config remain evidence of operational reality.
  - Inferred or stale adoption truth must stay labeled and reconciled instead of silently overwritten.
- User request:
  - Make the `bnpi-hris.tech` named Cloudflare Tunnel the first-class public path.
  - Remove normal TryCloudflare usage from Project Truth, VM login, SSH login, visual proof, image/bootstrap, and WWG truth surfaces.
  - Clarify whether SSH can be accessed through the domain.
  - Clarify how fresh/final images work on another device.

## Current Decision

- Current tunnel bootstrap ownership: host-managed on the Windows host.
- Current proof VM also has a VM-managed connector active after deliberate root-only credential import.
- Running-server Cloudflare access must remain active by default. Agents must
  not disable, stop, mask, remove, or toggle off `cloudflared-bnpi-hris.service`
  on the live VM, and must not add a default-local/cloud-mode guard, unless the
  user explicitly requests a time-bounded outage and a verified recovery path is
  already documented.
- Preferred BNPI remote-admin journey is VM-managed Cloudflare Tunnel plus
  browser-rendered SSH at `https://ssh.bnpi-hris.tech`; the BNPI Windows Server
  should remain Hyper-V-only with no inbound ports, no Windows SSH setup, and no
  `.ssh/config` dependency.
- Canonical startup/repair command:

```powershell
.\scripts\project-truth.ps1 ensure-bnpi-cloudflare-host -ProvisionDns -StartTunnel -VerifyPublic
```

- Fresh/final images must not contain Cloudflare tunnel credentials.
- TryCloudflare is disabled by default and remains only a deprecated manual proof tool.
- Public SSH through `ssh.bnpi-hris.tech` is verified through Cloudflare Access and the host-managed named tunnel.
- Public SSH through `ssh.bnpi-hris.tech` is also verified through the VM-side connector using `ssh://localhost:22`.
- Postgres Cloudflare Access TCP hostnames are configured as client-forwarding targets: `db.bnpi-hris.tech` for PROD, `dev-db.bnpi-hris.tech` for DEV, and `uat-db.bnpi-hris.tech` for UAT. These require client-side `cloudflared access tcp` and produce local DB URLs such as `postgresql://postgres:postgres@localhost:55432/hris`; they are not raw public Postgres URLs through normal Cloudflare Tunnel.
- Local `npm run dev` for HRIS API/app is configured to use the deployed DEV
  VM-backed Postgres through the Cloudflare Access TCP helper on
  `localhost:55433`; PROD and UAT helper URLs are documented beside it.
- Browser-rendered SSH is the desired clean journey for unprepared office or
  remote PCs; it still needs Cloudflare Access browser-rendering proof after the
  Zero Trust application setting is enabled.
- V6 packaging should preserve the V2 one-click extracted-zip shape: a small
  zip with a double-click `.cmd`, public bucket VHDX download, SHA-256
  verification, Hyper-V import/start, visible log window, and then V6 runtime
  proof. The Cloudflare tunnel credential must come from ProgramData at runtime,
  not from the zip, bucket image, repo, or baked VM.
- V7 is the current public package lane. It promotes the known clean V5 base
  image into `hyperv/v7/latest`, then keeps the V6 runtime proof/import path so
  the latest scripts, Cloudflare VM connector setup, and public checks run after
  import. The live proof VM disk was not published because it has contained
  root-only Cloudflare runtime credentials.
- A compact in-VM retained current-state VHDX now exists for the live proof VM
  after pruning development-stage observability rolling backups. It is retained
  evidence/staging only until Windows Hyper-V boot/import validation passes.
- Client/local VHDX retention is intentional: the host/client live VHDX may
  differ from the reusable public image and must not be overwritten or promoted
  by default. If a host-side or in-VM retained copy is needed, create it as a
  separate retained artifact with hash/manifest evidence, while keeping the
  clean public V7 package lane separate from any credential-bearing or
  client-specific disk.
- Current V6 proof serves public/LAN HRIS through healthy Docker Compose
  containers and VM-side Cloudflare. K3s/Argo still needs follow-up because many
  pods remain Pending/Evicted under memory pressure even when Argo Applications
  summarize as Synced/Healthy.
- 2026-07-01 incident correction: the current public HRIS path for PROD, UAT,
  and DEV is Docker Compose app/API containers behind the `bnpi-hris` named
  Cloudflare Tunnel. Do not treat K3s HRIS pods as the active public serving
  path until K3s/Argo is deliberately re-enabled and proven end-to-end.
- 2026-07-01 incident correction: K3s HRIS deployments/statefulsets are paused
  at zero replicas for DEV/UAT/PROD to avoid runtime contention while Docker
  Compose serves public HRIS. PVCs and data were not deleted.
- 2026-07-01 incident correction: public browser traffic must not call
  `https://*.bnpi-hris.tech:3001`. The working public pattern is same-origin
  `/api` through the app proxy/tunnel for app hostnames, with API hostnames
  available for direct health and API checks.

## Evidence

- Runtime VM: `project-truth-local-vhdx-proof`
- Canonical Project Truth LAN/runtime IP: `10.184.37.19` (pure static)
- Retained secondary transition IP/TLS SAN: `10.184.37.78` (pure static)
- LAN SSH: `ssh -i %USERPROFILE%\.ssh\node-health-appliance_ed25519 infra@10.184.37.19`
- Named tunnel: `bnpi-hris`
- Named tunnel ID: `e3486f00-f974-46d3-9e11-911266749d00`
- Public verification artifact: `.runtime/cloudflare-drift-proof/20260629-220610/public-verification-final.json`
- VM text proof: `.runtime/cloudflare-drift-proof/20260629-220610/screen-overview.txt`, `.runtime/cloudflare-drift-proof/20260629-220610/screen-tunnels.txt`, `.runtime/cloudflare-drift-proof/20260629-220610/vm-text-surfaces.txt`
- Named tunnel wrapper evidence: `.runtime/cloudflare-named-tunnel/20260629-220627/bnpi-cloudflare-tunnel.json`
- Latest host readiness/provision evidence: `.runtime/cloudflare-host-readiness/20260629-223648/bnpi-cloudflare-host-readiness.json`
- Latest SSH DNS/ingress evidence: `.runtime/cloudflare-named-tunnel/20260629-223910/bnpi-cloudflare-tunnel.json`
- V2 packaging reference: `.runtime/gcp-v2-format/ProjectTruth-Install-HyperV-v2.cmd`,
  `.runtime/gcp-v2-format/ProjectTruth-Install-HyperV-v2.ps1`, and
  `.runtime/gcp-v2-format/README-v2.txt`
- Latest V6 one-shot proof:
  `.runtime/v6-one-shot/20260630-112256/v6-one-shot-result.json`
- V6 one-click zip artifact:
  `C:\ProgramData\ProjectTruth\exports\hyperv-v6\20260630-115040\project-truth-hyperv-one-click-installer-v6.zip`
- Published V6 tiny package path:
  `gs://project-truth-image-export-hris-492904-161377059311/public/project-truth/hyperv/v6/latest/project-truth-hyperv-one-click-installer-v6.zip`
- V7 one-click zip artifact:
  `C:\ProgramData\ProjectTruth\exports\hyperv-v7\20260630-161359\project-truth-hyperv-one-click-installer-v7.zip`
- Published V7 package path:
  `gs://project-truth-image-export-hris-492904-161377059311/public/project-truth/hyperv/v7/latest/project-truth-hyperv-one-click-installer-v7.zip`
- Published V7 VHDX path:
  `gs://project-truth-image-export-hris-492904-161377059311/public/project-truth/hyperv/v7/latest/project-truth-node-local-hyperv-v7-current-state.vhdx`
- Retained in-VM compact current-state VHDX:
  `/var/lib/project-truth/retained-vhdx/20260703-102324/project-truth-node-current-state-20260703-102324.vhdx`
- Retained current-state VHDX evidence:
  `.runtime/in-vm-vhdx-build/20260703-102324/current-state-vhdx-report.md`,
  `.runtime/in-vm-vhdx-build/20260703-102324/manifest.txt`,
  `.runtime/in-vm-vhdx-build/20260703-102324/project-truth-node-current-state-20260703-102324.vhdx.sha256`,
  `.runtime/in-vm-vhdx-build/20260703-102324/project-truth-node-current-state-20260703-102324.vhdx.qemu-img-info.json`,
  and
  `.runtime/in-vm-vhdx-build/20260703-102324/host-hyperv-boot-validation.md`
- 2026-07-01 public app restore evidence:
  `/var/lib/project-truth/backups/public-app-session-restore-20260701-061721`
- 2026-07-01 DEV public origin restore evidence:
  `/var/lib/project-truth/backups/dev-public-origin-restore-20260701-062006`
- Browser evidence screenshots:
  `.runtime/browser-evidence/screenshots/bnpi-public-after-restore.png`
  and `.runtime/browser-evidence/screenshots/dev-public-after-restore.png`

## Validation Notes

- LAN SSH and LAN HRIS endpoints passed.
- Public app/API/dev/uat/Grafana checks passed after connector warmup.
- CORS preflight returned HTTP 204.
- Wrong-password auth probe returned HTTP 401.
- `ssh.bnpi-hris.tech` DNS route and tunnel ingress were provisioned; LAN SSH passed; after Cloudflare Access policy allowed `1bis.solutions.tech@gmail.com`, SSH through `cloudflared access ssh --hostname %h` returned `SSH_ACCESS_OK`.
- On 2026-06-29, the named tunnel credential was imported into the proof VM as root-only runtime state, `cloudflared-bnpi-hris.service` was enabled and active, `cloudflared tunnel info bnpi-hris` showed a `linux_amd64` connector, and SSH through `ssh.bnpi-hris.tech` returned `SSH_DOMAIN_OK`.
- On 2026-07-03, live VM banner evidence after `sudo project-truth-ansible-pull`
  reported `Cloudflare named tunnel mode: VM-managed active`, public HRIS/API,
  Grafana, SSH browser, and `ssh project-truth-hris` targets, plus `OS pull
  last: develop@75e7c1d845df` and sync time `2026-07-03T04:40:53Z`.
- On 2026-06-30, V6 one-shot proof passed LAN PROD/DEV/UAT app/API health,
  public PROD/DEV/UAT app/API/Grafana health, public CORS, VM-side Cloudflare
  ingress validation, and CLI SSH through `ssh.bnpi-hris.tech`.
- On 2026-06-30, a V2-style V6 one-click zip was generated and uploaded as a
  tiny package under `hyperv/v6/latest`; public URL checks returned HTTP 200 for
  the zip, installer script, README, and manifest. The package contains no VHDX
  and no Cloudflare credential.
- On 2026-06-30, V7 was published under `hyperv/v7/latest`: GCS metadata showed
  the VHDX at `75635884032` bytes, all V7 sidecar and installer URLs returned
  HTTP 200, the downloaded public V7 zip matched SHA-256
  `4534136199EEBA85FFAFBF08C8EAFEEDA1BBC784D9F4D3A269F30D9F95D75088`, and a
  V7 installer dry run targeted the V7 VHDX/manifest paths while preserving the
  runtime-only Cloudflare credential import.
- On 2026-07-01, PROD and UAT app containers were recreated from
  `hris-app-local:develop` image
  `sha256:fa41efd235cbb372b7b9c2cd631081d8f7a6738af464b7ca67a0dcf47cdd83c5`.
  Browser verification for `https://bnpi-hris.tech/` loaded the HR login screen,
  requested `https://bnpi-hris.tech/api/system-provisioning/status` with HTTP
  200, and showed no public `:3001` browser request.
- On 2026-07-01, DEV Docker Compose API/app containers were restored without
  rebuilding or touching the DEV Postgres volume. VM origin checks passed:
  `http://localhost:3100/auth/login` HTTP 200,
  `http://localhost:3100/api/auth/me` HTTP 401, and
  `http://localhost:3101/health` HTTP 200. Browser verification for
  `https://dev.bnpi-hris.tech/` loaded the HR login screen, requested
  `https://dev.bnpi-hris.tech/api/system-provisioning/status` with HTTP 200,
  and showed no public `:3001` browser request.
- Earlier on 2026-07-02, `10.184.38.138` no longer answered SSH or HRIS port
  probes from the Windows host. The VM was temporarily reached through DHCP
  transient address `10.184.38.144`, and host-managed `cloudflared-bnpi-hris.yml` was
  temporarily corrected to that DHCP address. This was superseded by stable
  secondary address `10.184.37.19`.
- Public verification from the client LAN is currently blocked by network
  policy: plain HTTP returns a company-policy block page and HTTPS resets
  during TLS for `bnpi-hris.tech` hostnames, while general Cloudflare/Google
  HTTPS works.
- On 2026-07-03, after the LAN config drift follow-up, the VM was hard-cut over to
  pure static LAN addressing on `eth0`. The accepted canonical runtime target is
  now `10.184.37.19/24`; `10.184.37.78/24` is retained as a secondary transition
  address/TLS SAN. DHCP is disabled, the default route is static via
  `10.184.38.254`, and read-only VM probes proved ping, SSH, and PROD/DEV/UAT
  API health on `10.184.37.19`.
- On 2026-07-03, Postgres Access TCP DNS routes for `db.bnpi-hris.tech`,
  `dev-db.bnpi-hris.tech`, and `uat-db.bnpi-hris.tech` were provisioned to the
  named tunnel and resolved to Cloudflare A records. The host-managed connector
  was started with DB TCP ingress, and the live VM-side `/etc/cloudflared/config.yml`
  was updated with matching DB TCP ingress while preserving existing SSH routes.
  A client-side `cloudflared access tcp --hostname db.bnpi-hris.tech --url localhost:55432`
  smoke test opened the local listener but Postgres protocol probing failed with
  `websocket: bad handshake`, and a read-only Access API list returned HTTP 403.
  Treat DNS/tunnel ingress as applied, but teammate DB access is not fully
  verified until Cloudflare Access applications/policies are created for the DB
  hostnames.
- Later on 2026-07-03, after Access browser success and token return, real
  Postgres query proof passed through Cloudflare Access TCP for all three DB
  hostnames using a temporary Node `pg` probe under `.runtime/pg-probe`:
  `db.bnpi-hris.tech` via local `56532`, `dev-db.bnpi-hris.tech` via local
  `56533`, and `uat-db.bnpi-hris.tech` via local `56534` each returned
  `current_database=hris`, `current_user=postgres`, server port `5432`, and
  `public_tables=70`. The wrapper command timed out during cleanup, but no
  temporary test forwards remained afterward; only the intentional PROD helper
  forward on `localhost:55432` remained active.
- Later on 2026-07-03, local dev verification kept the stable DB helper
  forwards active on PROD `localhost:55432`, DEV `localhost:55433`, and UAT
  `localhost:55434`. `hris-api/.env` defaulted `npm run dev` to the DEV forward
  on `localhost:55433`, `http://localhost:3001/health` returned HTTP 200, direct
  API login for `admin@bandai.local` returned HTTP 200, and Playwright login
  through the local app at `http://localhost:5175/auth/login` reached
  `http://localhost:5175/admin/dashboard`. DEV DB snapshot and UI counts
  matched: `users=2039`, `employees=2217`, `departments=12`. Evidence:
  `.runtime/local-dev/20260703-verify/db-snapshot-dev-active.json`,
  `.runtime/local-dev/20260703-verify/api-auth-login-proof.json`, and
  `.runtime/local-dev/20260703-verify/browser/playwright-login-proof.json`.
- Later on 2026-07-03, development-stage observability rolling backups were
  hard-deleted as approved: `/srv/hris/observability/backups/rolling` dropped
  from about `161G` to zero files, `/srv/hris/observability/backups` was about
  `28K`, and `/srv/hris/observability` was about `8.2G`. Backup and replicator
  containers were intentionally left stopped to prevent immediate archive
  regeneration.
- Later on 2026-07-03, a compact retained current-state VHDX was built inside
  the VM after the prune. `qemu-img info` reported VHDX format, virtual size
  `500 GiB`, file length about `92.6 GiB`, and disk size about `83.2 GiB`;
  SHA-256 was
  `486378d08bb76cde3716f3f9d4a24fc02c15636b2e39e895b0c59fba1d8a9a1c`;
  `qemu-img check -f vhdx` reported no errors. Final local VM checks returned
  HTTP 200 for PROD/DEV/UAT app/API, Grafana, Prometheus, Loki, and Tempo.
- Later on 2026-07-03, the host-test copy of the retained current-state VHDX
  completed on the Windows host at
  `C:\ProgramData\ProjectTruth\images\project-truth-node-latest.vhdx`, with
  SHA-256
  `b1274ae7b50214b0888cd97aa43a79b0e901c19c4ebce1824923778a0a77a8aa`.
  Hyper-V `Get-VHD` read it as a dynamic VHDX with `500 GiB` virtual size,
  `88.32 GiB` file size, and `0` fragmentation. The
  `project-truth-local-vhdx-proof` VM started successfully from the image,
  Hyper-V Worker/Admin event `18601` reported that it successfully booted an
  operating system, heartbeat was OK, and KVP reported guest IPs
  `10.184.37.78` and `10.184.37.19`. Direct Windows host probes to SSH and
  HRIS ports still failed because the current `ProjectTruth-External`
  host/vSwitch path is on `192.168.254.149/24` and did not route to the guest's
  static `10.184.37.x` addresses, even after a temporary additive host
  `10.184.37.250/24` test address.
- The host-tested VHDX became fully reachable after moving
  `project-truth-local-vhdx-proof` to internal switch
  `ProjectTruth-HostTest-10-184-37` and setting the Windows host-side vEthernet
  to `10.184.37.250/24` with `SkipAsSource=False`. SSH and PROD/DEV/UAT
  app/API ports passed on both `10.184.37.19` and `10.184.37.78`; HTTP probes
  returned `200` for PROD/DEV/UAT login and health URLs on `10.184.37.19`;
  SSH to `infra@10.184.37.19` returned hostname `project-truth-node`; and
  Docker showed healthy PROD/DEV/UAT app/API containers.
- Playwright VM login smoke against `PROJECT_TRUTH_GUEST_IP=10.184.37.19`
  passed for PROD and UAT. DEV reached the dashboard and captured screenshots,
  but the strict console-health assertion failed on the already-known
  non-blocking DEV `400 action metrics` warning: `Employee context is required
  for action metrics`. Screenshot evidence was captured under
  `.runtime/browser-evidence/screenshots/host-test-vhdx/`.
- `git diff --check` passed.
- `wwg test-check --format plain` passes after the stable `10.184.37.19`
  runtime/config drift repair because the Cloudflare config regression guard was
  updated with the active SSH origin.
- `wwg validate` passes after the stable LAN target drift repair.
- On 2026-07-09, the local HRIS device-event model was hard-cut over from
  attendance/source/status-led UI language to persisted `DeviceEvent`
  taxonomy fields: `eventCategory`, `eventAction`, `eventLabel`, and
  `eventConfidence`. A narrow SQL migration/backfill preserved all 96 existing
  `device_events` rows, created backup table
  `device_events_backup_20260709_225223`, and backfilled:
  `ATTENDANCE/TAP/PROVEN=32`, `ACCESS_CONTROL/UNKNOWN/UNKNOWN=62`, and
  `UNKNOWN_VENDOR/LISTENER_RECEIVED/UNKNOWN=2`. The admin route now presents
  `Device events`, category/action filters, `HRIS result`, and debug-only
  runtime path wording while retaining raw `source` and processing `status`
  compatibility fields. Evidence:
  `.runtime/device-event-model-hardcutover-20260709-225223/`.

## Follow-Up Needed

- Decide whether VM-managed Cloudflare should become the canonical fresh-import path; this requires an explicit secure credential handoff procedure and must not bake credentials into images.
- Define the retained-client-VHDX artifact flow: host export/copy remains the
  reliable Hyper-V artifact, and any in-VM copy should be secondary evidence or
  staging only unless proven bootable/importable from Windows Hyper-V.
- Decide whether the internal `ProjectTruth-HostTest-10-184-37` switch should
  remain the standard local VHDX validation path when the Wi-Fi-backed
  `ProjectTruth-External` switch cannot route from the Windows host to the
  guest's static `10.184.37.x` addresses.
- Repair or classify the DEV `400 action metrics` console warning if future
  Playwright gates require zero console errors for DEV HR manager dashboard
  login. The dashboard renders and the warning is already documented as
  non-blocking in V6 evidence, but the strict smoke assertion still fails.
- Fix observability backup source/retention before re-enabling backup and
  replicator containers; the current backup loop generated about `161G` of
  rolling archives and logged stale `/data/grafana` archive errors.
- Keep Cloudflare Access SSH policy in the `933c5547e32839d664d155ce8a7424d5` Zero Trust account aligned with the allowed operator email.
- Replace shared Postgres superuser teammate URLs with limited per-environment
  database users before broadening DB Access TCP use beyond trusted operators.
- Enable and verify browser-rendered SSH for `https://ssh.bnpi-hris.tech` so
  remote admins can access the VM from unprepared browsers without configuring
  BNPI Windows host SSH or per-PC `.ssh/config`.
- Reconcile whether Docker Compose is the intended serving runtime for this V6
  appliance profile or tune K3s memory/capacity until Argo/K3s health matches
  the actually served HRIS app/API.
- Resolve existing WWG generated-report validation findings before release/commit claims that require a fully green WWG gate.

## Latest Task Addendum - 2026-07-12 Hikvision Listener VM Runtime Reachability And Live DEV Status Repair

- Task mode: VM listener/runtime repair, K3s DEV API promotion, and live
  endpoint proof.
- User goal:
  - Fix the Hikvision Linux listener path so the managed VM service is running
    and so the DEV API/UI can read truthful listener status from the same VM.
- Current-state finding before the fix:
  - The VM service could be started manually over `ssh project-truth-hris`,
    but the live DEV `hris-api` pod still used stale listener code that pointed
    at `10.184.37.241`.
  - After the first controller patch, the live DEV API still could not expose
    status/control because it ran inside a container without `ssh`, without a
    mounted VM key, and therefore could not reach the host-managed systemd
    service honestly.
- Implemented repair:
  - `scripts/project-truth-hikvision-hot-reload-listener.sh` now rebuilds from
    `/opt/project-truth/vendor/hikvision-linux` and defaults HRIS posts to
    `http://localhost:3101`.
  - Added managed VM daemon wrapper
    `scripts/project-truth-hikvision-hot-reload-daemon.sh` and managed unit
    `appliance/systemd/project-truth-hikvision-hot-reload-listener.service`.
  - `hris-api/app/device/device.controller.ts` now installs the wrapper,
    daemon, and systemd unit together and exposes corrected VM target logic for
    the managed listener controls.
  - `ansible/project-truth-pull.yml` and
    `appliance/bin/project-truth-os-sync.sh` now install the managed listener
    scripts/unit so the repair survives VM self-heal.
  - `hris-api/Dockerfile` now installs `openssh-client`, and
    `gitops/runtime-k8s/overlays/dev/runtime.yaml` now mounts
    `/var/lib/project-truth/ssh` plus `PROJECT_TRUTH_VM_HOST`,
    `PROJECT_TRUTH_VM_USER`, and `PROJECT_TRUTH_VM_SSH_KEY` env so the DEV API
    pod can SSH back to the VM host truthfully.
  - Provisioned VM-local SSH key
    `/var/lib/project-truth/ssh/node-health-appliance_ed25519`, authorized it
    for `infra`, rebuilt `hris-api-local:develop`, imported it into K3s, and
    rolled the DEV `hris-api` deployment after temporarily pausing
    `project-truth-ansible-pull.timer` to avoid stale checkout drift during the
    rebuild. The timer was restarted after the rollout.
- Proven live truth:
  - VM systemd now reports
    `project-truth-hikvision-hot-reload-listener.service` as
    `ActiveState=active`, `SubState=running`, `Result=success`.
  - The live DEV authenticated endpoint
    `GET /api/device/hikvision/listener` now returns:
    - `vm.host=10.184.37.19`
    - `running=true`
    - `status=running`
    - `control.available=true`
    - `logs.available=true`
    - `sdk.state=login_failed`
    - `lastLoginError=7`
  - The DEV pod now has `/usr/bin/ssh` and mounted key files at
    `/var/run/project-truth/ssh/node-health-appliance_ed25519`.
- Remaining blocker:
  - The listener runtime and API/UI visibility are repaired, but the physical
    device itself is still not armable from the VM today. Journals and live API
    logs show repeated `sdk_login host=10.184.37.139 lastError=7 ok=false` and
    `service_start_failed reason=no_armed_devices`, so endpoint truth now
    accurately reports a real device/network/credential failure instead of an
    opaque unknown state.

## Latest Task Addendum - 2026-07-12 Local Postgres Device Tables Drift Fallback Repair

- Task mode: Local API regression repair while the user exercises admin device
  journeys.
- User goal:
  - Stop local admin device pages from throwing repeated 500s while the current
    localhost runtime uses an older Postgres shape without `device_users` and
    without newer `device_events` taxonomy columns.
- Current-state finding before repair:
  - Local `localhost:3001` returned 500 for
    `GET /api/device/events?page=1&limit=10&sort=eventTime&order=desc&dateField=eventTime`
    because the raw SQL assumed:
    - `public.device_users` exists,
    - `device_events.deviceUserId` exists,
    - and taxonomy columns `eventCategory`, `eventAction`, `eventLabel`,
      `eventConfidence` exist.
  - The same local runtime returned 500 for `GET /api/device/sync-preview`
    because it called `prisma.deviceUser.findMany()` directly while
    `public.device_users` was absent.
- Implemented repair:
  - `hris-api/app/device/device.controller.ts` now detects local
    `device_events` column presence through `information_schema` and degrades
    raw SQL to safe defaults when older columns are missing.
  - The device-events query now:
    - avoids joining `device_users` when either the table or the
      `device_events.deviceUserId` column is missing,
    - substitutes safe fallback values for missing taxonomy columns,
    - and keeps response shape stable for the frontend.
  - `GET /api/device/sync-preview` now treats missing `device_users` as an
    empty per-device user inventory instead of crashing.
  - Device-user list retrieval now returns an empty success payload with
    `migrationState=device_users_table_missing` instead of a 500 when the table
    is absent.
  - `hris-api/tests/hikvision-biometric-sync-contract.spec.ts` now includes the
    contract coverage for these fallback paths.
- Proven local truth:
  - After restarting the local `tsx watch` API process, direct authenticated
    local endpoint proof succeeded:
    - `GET /api/device/events?...dateField=eventTime` returned HTTP 200 with
      populated saved-event rows.
    - `GET /api/device/sync-preview` returned HTTP 200 with device preview data
      and zeroed user summary values where `device_users` truth is unavailable.
  - The local DB truth probe showed the current `device_events` table is
    missing:
    - `deviceUserId`
    - `eventCategory`
    - `eventAction`
    - `eventLabel`
    - `eventConfidence`
  - Current behavior is now truthful: older local DB shape still works for read
    journeys, but richer device-user features remain naturally empty until the
    table is migrated.

## Latest Task Addendum - 2026-07-12 Listener Fallback and Cross-LAN Truth

- Task mode: Device listener runtime truth repair while the user continues the
  admin Sync Center journey from a host that is not currently on the VM's
  direct LAN path.
- Current-state finding before repair:
  - Local `GET /api/device/hikvision/listener` still returned HTTP 200 but with
    misleading degraded truth:
    - `running=false`
    - `status=unknown`
    - `control.available=false`
    - `error=ssh: connect to host 10.184.37.19 port 22: Connection timed out`
  - The admin Sync Center therefore rendered `VM stopped` even though the VM
    listener service was actually healthy when reached through the prepared
    Cloudflare SSH alias.
- Implemented repair:
  - `hris-api/app/device/device.controller.ts` now tries Hikvision VM commands
    against multiple targets in order:
    - direct LAN SSH to `infra@10.184.37.19`
    - fallback SSH alias `project-truth-hris`
  - The same fallback logic now applies to remote command execution and file
    copy operations used by listener status/control/runtime install flows.
  - Listener status payloads now expose the resolved path through
    `vm.path`, for example `alias:project-truth-hris`.
  - `hris-app/app/routes/admin/devices/enroll.tsx` now distinguishes
    `status unreachable` from `VM stopped` so the Sync Center stops claiming a
    healthy remote listener is down when only the local LAN probe failed.
  - `hris-app/app/routes/admin/devices/events.tsx` now treats
    `control.available=false` and endpoint-level listener errors as status
    unavailability, not just transport exceptions.
- Proven local truth after restart:
  - After restarting the local `tsx watch` API runtime, direct authenticated
    local endpoint proof now returns:
    - `running=true`
    - `status=running`
    - `control.available=true`
    - `vm.path=alias:project-truth-hris`
    - `sdk.state=login_failed`
    - `sdk.lastLoginError=7`
  - This confirms the cross-LAN admin/browser path is now repaired: the host
    can interrogate the VM listener through the prepared fallback route even
    when direct LAN SSH to `10.184.37.19` is unavailable from the workstation.
- Remaining blocker now isolated:
  - From the VM itself, direct probes show the physical device path is broken:
    - `10.184.37.139:8000` -> `No route to host`
    - `10.184.37.137:80` -> timed out
  - `GET /api/device/sync-preview` therefore still correctly reports
    `status=source_unavailable` with
    `error=Hikvision event total unavailable (code 20)`.
  - Current truth:
    - remote admin-to-VM listener visibility is repaired,
    - VM-managed listener service is running,
    - but VM-to-device network reachability still blocks real device user/tap
      acquisition.
