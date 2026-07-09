# Current Task

Status: IN PROGRESS

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
