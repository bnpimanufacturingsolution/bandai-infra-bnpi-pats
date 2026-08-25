## 2026-08-25 Period leave import (LVP) + Gross includes leavePay

- `Leave (July 1-31, 2026).xlsx` sheet **Leave (2)** is the cutoff feed: covers 376/376 Sheet2 Jul 11–25 leave people; money matches 99.2% via dual basis (dailyRate or ×24/313).
- New: DM3 **Upload leave (period)** — imports immediately like other DM3 uploads (preview via `dryRun=true`), with a **payroll-period selector** (default OPEN) so month files land in the chosen cutoff.
- Engine truth change: **GrossPay now includes leavePay** (generate + preview); Net/TR/tax follow. Register Leave column unchanged.
- Executed on local clone (5433): PP-20260711-20260726 → 321 created / 6 failed / ₱327,991.84 (log `cmt86rh9b00s8vgewuoj41i4j`). After-tally pending; baseline at `.runtime/tally-jul1125-before-leave-20260825/`. Canonical §14e.

## 2026-08-22 Recruitment identity history

- First name + last name + birthday is the only match key for previous applicant/employee records. Recruiter sees history (rejected, resigned, etc.). Apply is not blocked. Public apply now requires date of birth.


## 2026-08-21 GitOps db-init (no UAT/PROD seed)

- Runtime Argo **Degraded** = Failed Job `hris-api-db-init`, not an empty database. Live UAT/PROD still have ~2225 employees and ~129k timesheet lines.
- **Do not** run `prisma-seed` / `prisma-reset` / `--accept-data-loss` on UAT/PROD. **Do not** delete the Failed Job until `origin/develop` is schema-only (`prisma-postgres:push` only).
- Operator: `docs/DB_INIT_JOB.md`. Evidence: `.wwg/reports/db-init-repair-20260821.md`. Operator authorized **push** 2026-08-22.


## 2026-08-21 Employee schedule roster

- Dedicated page: HR Timekeeping **Schedules** `/hr/employee-schedules` and admin `/admin/configuration/employee-schedules`. Table of people, department/section filter, click to see current week then **Change schedule**.


## 2026-08-20 10-agent DevOps audit

- CI and Validate are green on `37b443a`. Observe success is **not** Gǣthis SHA is servingGǥ (`services=none` still success; `/health` has no `buildSha`).
- Runtime Argo overlay apps Healthy; runtime apps Synced/**Degraded** because Job `hris-api-db-init` Failed in **dev, uat, and prod**.
- Full: `.wwg/reports/devops-audit-20260820.md`.


## 2026-08-20 Timesheet G�� schedule

- Changing schedule updates **expected** work windows (`AttendanceObligation`). It does **not** rewrite punches or submitted timesheet lines. Stored late/OT stay vs the schedule frozen at first punch. **Days** = weekly pattern (next Monday). **Dates** = that day (`ScheduleOverride`). Full: `.wwg/reports/timesheet-schedule-connection-20260820.md`.


## 2026-08-20 Employee weekly hours

- Templates = reusable org patterns. Per-person Mon/Tue different hours = employee **Work Schedule** G�� **Change schedule** G�� **Days**. One calendar date = same modal **Dates** tab (`scheduleOverride`). Roster page is the easy bulk path.


## 2026-08-20 Day labor on timesheet (no push)

- Per-day work type `Timesheetline.dayLaborType` Direct/Indirect. Timesheet day editor **Day labor**. Not the BNPI vs Agency report. **Do not push** until operator says.


## 2026-08-20 Timesheet 2.1.7 Direct vs Indirect labor UI

- Workforce Analytics has a third tab **Direct vs Indirect** at `/hr/reports/workforce?tab=direct-indirect`.
- Manpower Distribution stays the default `labor` tab. Tardiness/OT stay on Attendance Reports.
- Live metric `directIndirectLaborSummary`: 872 direct / 1355 indirect (2026-08-20). Gender/agency/total-manpower on that tab can still be empty from the client roster.
- Operator: `docs/00-product/DIRECT_INDIRECT_LABOR_REPORT.md`. Full: `.wwg/reports/direct-indirect-labor-ui-20260820.md`.


## 2026-08-20 UAT/PROD app+API auto-roll

- `git push origin develop` that rebuilds hris-api/hris-app now restarts those Deployments in **dev, uat, and prod** (skip missing). Not a new git branch. Docs-only still does not roll. Report: `.wwg/reports/uat-prod-app-api-auto-roll-20260820.md`.


## 2026-08-20 On-prem ports vs this PC

- VM still serves DEV/UAT/PROD on `10.184.37.19` ports `3000/3001`, `3100/3101`, `3200/3201` (loopback HTTP 200).
- This home WiG��Fi cannot open those LAN ports. Use Cloudflare or SSH then `127.0.0.1`. Doc: `docs/ONPREM_PORT_ACCESS.md`.


## 2026-08-20 GitHub Actions CI / Observe / Validate

- Three root workflows: **CI** (per-type tests), **Observe VM GitOps deploy** (VM reporter), **Validate** (Windows terraform/packer/installer). Nested Cloud Run/Firebase YAML does not run on this repo.
- Observe `success` can mean **not rebuilt** (`services=none`). `/health` has no `buildSha`. Runtime Argo can be Synced/**Degraded** (failed `hris-api-db-init` Job) while Observe is green.
- Operator 2026-08-20 authorized push of the CI/Observe harden. Full: `.wwg/reports/devops-ci-observe-validate-20260819.md`.


## 2026-08-19 Hikvision C++ current layout

- Live HCNetSDK sources are `vendor/hikvision-linux/src/hikvision_bio/*.cpp` (`acs.cpp`, `spool.cpp`, `identity.cpp`, `fingerprint.cpp`, `face.cpp`, `time.cpp`, `copy.cpp`, `runtime.cpp`, `common.cpp`, `main.cpp`) plus matching `include/hikvision_bio/*.hpp`. Same binary `hikvision-biometric-service`. The 2026-07-09 monolith `hikvision_biometric_service.cpp` is historical.
- Rollback: last unity source `6b670a4`; revert `301ebb5` then `66868a2`. Report: `.wwg/reports/hikvision-cpp-maintainable-units-20260819.md`.


## 2026-08-19 Hikvision biometric clock / Manila

- Devices can set time (panel / web / iVMS / ISAPI PUT / NTP). HRIS Preview/Update time prefers HCNetSDK STDXML, ISAPI HTTP fallback. Wire TZ `CST-8:00:00` = UTC+8, no DST.
- Last proven `timeMode=manual`. Attendance uses device punch time. Report: `.wwg/reports/hikvision-biometric-time-manila-20260819.md`.


## 2026-08-19 EmployeePayroll.hourlySalary snapshot

- Generate-time snapshot of derived hourly (daily ++ working hours; BNPI 313 uses 8). Not Employee input. No `Employee.hourlyRate`. Not a Sheet2 column. `basicSalary` stays SoT. Existing `0` rows can be filled by the dry-run-default backfill from current daily/metadata; still unused in compute.
- Full: `.wwg/wiki/project-truth.md` section **EmployeePayroll hourlySalary snapshot (2026-08-19)**. Report: `.wwg/reports/employee-payroll-hourly-salary-snapshot-20260819.md`.


## 2026-08-17 Zen 00010 payroll / timesheet

- Missing timesheet blocked generate for Period 1 Aug 2026 (11G��25 Aug Manila).
- Salary G�11,000 SEMI_MONTHLY (Technician floor). Timesheet approved; 14 lines attached; preview net G�5,424.54.
- API: `POST /api/timesheet/:id/sync-obligation-lines` (this `develop` push).
- Math: `.wwg/reports/zen-00010-payroll-preview-math-20260817.md`. Code: `.wwg/reports/zen-payroll-timesheet-code-20260817.md`.


## 2026-08-17 Encoding / boarding notification titles

- `Onboarding Completed! +�++++GǦ` was Latin-1 of `=���` in source, then stored on the notification.
- Titles are now ASCII. Live DEV row `cmswtgafn0cn3lp01zmus0q06` patched.
- `set-active` schedule also recomputes attendance obligations so HR Attendance is not leftover Off Day.
- Report: `.wwg/reports/mojibake-encoding-20260817.md`.


## 2026-08-17 Device Events TAP display + person 10

- Operator Check Out on Device D (person `10`, serial `9652`) already updated attendance. Unknown Vendor / Unknown evidence was stale stored taxonomy.
- GET/UI now reclassify those rows as **Attendance / TAP** and stamp **SDK callback** + direct evidence. Commit `a6dce32` (already on origin; **do not push** further unless asked). Public DEV UI is `NEEDS_CONFIRMATION` until that SHA is serving. List GET can heal stored columns; item GET display-only.
- Callback next tap matches `deviceEmpId` or padded `employeeId` and links DeviceUser. `10` G�� `01515`.
- DeviceUser `10` on B/D/E linked to Zen Andrei `00010`. Other unmatched ids without an employee were not linked.
- Report: `.wwg/reports/device-event-tap-display-20260817.md`.


## 2026-08-17 Device Events saved-event details deeplink

- `action=view-event&id=` opens **Device event details** by `DeviceEvent.id`.
- Table `page=` is not the event identity. Do not resolve the modal from the current page only.
- API: `GET /api/device/events/item/:eventId`. Spec: `docs/00-product/DEVICE-EVENTS-SAVED-EVENT-DEEPLINK.md`.


## 2026-08-13 Hikvision Select Status G�� HRIS (audit)

- Panel **Select Status** (Check In / Out, Break In / Out, Overtime In / Out) is real T&A.
- Live SDK listener **now copies** `byAttendanceStatus` onto the callback JSON. ISAPI `checkIn`/`label` is extracted and shown as Device Events **Device status**.
- Time In/Out follows panel Check In/Out when present; unsigned punches still pair first/later.
- Spec: `docs/HIKVISION_SELECT_STATUS_MAPPING.md`. Report: `.wwg/reports/hikvision-select-status-audit-20260813.md`.


## 2026-08-13 Device 5 reverse tunnel (host WiG��Fi)

- Device 5 (`cmsq47r9t0039vxbwt9rfxk68`) physical `192.168.1.136:80` on the same WiG��Fi as the Windows PC `192.168.1.116`.
- Reverse is on: `ssh-reverse-forward`, VM `https://127.0.0.1:59443` + SDK `127.0.0.1:59000`.
- TEST A live address is `192.168.254.109:443` via `127.0.0.1:58080` G�� not `192.168.254.102`. Wiki `59000`/`59443` = TEST A is **STALE**.
- Evidence: `.runtime/device5-reverse-20260813-005641/`.


## 2026-08-12 Preview Payroll results on page

- After Run Preview loading finishes, results render **on the page** at
  `action=preview-payroll&previewStep=results` (not inside the modal).
- Modal still hosts confirm + progress only; employee detail stays modal.
- Full: terminology **Payroll Preview**; handoff 2026-08-12 page results.


## 2026-08-12 Payroll Preview includes non-submitted timesheets

- **Preview Payroll** dry-run may include `DRAFT` / `SUBMITTED` / `REJECTED` /
  `REVISED` timesheets (with salary + schedule) and labels them estimate-only.
- Money uses timesheet **lines** + benefits G�� status alone does not change pay.
- **Start Payroll** still APPROVED + payroll-ready only
  (`includedEmployeesCount` unchanged contract).
- Summary adds `previewComputableEmployeesCount` +
  `estimatedIncludesNonApproved`.
- Live: `PP-20260711-20260726` preview 834 vs ready 641.
- Evidence: `.runtime/preview-non-submitted-20260812/`.
- Full: `.wwg/wiki/project-truth.md` section
  **Payroll Preview includes non-submitted timesheets (2026-08-12)**.


## 2026-08-11 BNPI Jun 26G��Jul 10 payroll tally investigation

- Full-fleet preview vs target Sheet2: **not fleet-tallied** (4 exact + Alexa G��G�0.77).
- **No. of Days** register field G�� target paid regular days: app counts non-`REST_DAY`
  timesheet lines (includes ABSENT); target G�� sum Bandai `approvedBuckets.regularDays`.
  Universal day-column mismatch is a **definition/code** issue, not Gǣall biometrics wrong.Gǥ
- Fixing day-count alone does **not** make Gross/Net/TotalReceivable tally.
- Master evidence: `.runtime/full-tally-20260811/FINDINGS.md` and
  `.wwg/reports/bnpi-june26-jul10-payroll-tally-20260811.md`.


## 2026-08-07 BNPI Meal Allowance (MLA) coverage

- **Coverage expectation:** every Bandai employee **should have** an active MLA
  enrollment.
- **Still enrollment-driven** G�� payroll does not invent MLA without a resolving
  `EmployeeBenefit`.
- **Do not auto-enroll** all employees unless the operator explicitly orders a
  deliberate enrollment job.
- Full write-up: `.wwg/wiki/project-truth.md` section
  **BNPI Meal Allowance (MLA) coverage expectation (2026-08-07)**.


## 2026-08-05 BNPI payroll money sources (tally)

- **Confirmed:** Not every compensation/deduction on the register or payslip
  comes from cutoff mass-upload files.
- Run Payroll also applies **recurring / standing `EmployeeBenefit` and
  `EmployeeLoan` enrollments** that are active for the period even when the
  code is **absent** from that cutG��s compensation/deduction mass upload.
- Tally agents must classify each line as mass-upload, recurring enrollment,
  engine (tax/contrib schedule), or OT/attendance G�� never Gǣmissing mass = must
  be zero.Gǥ
- Full write-up: `.wwg/wiki/project-truth.md` section
  **BNPI payroll compensation / deduction source ownership (2026-08-05)**.


## 2026-07-28 shared observability recovery

- PROD, DEV, and UAT have healthy API scrapes plus app/API/employee blackbox
  probes. Loki and Tempo contain environment-specific logs and traces.
- Public Grafana authentication and four operational dashboards pass headless
  Playwright without application errors or HTTP 5xx.
- Backup is enabled as atomic Grafana PostgreSQL custom dumps with four rolling
  and two full restore points. Mutable telemetry stores are not tarred live.
- Tempo runs supported 2.10.5 with vParquet4 data after the 2.6.1
  poller/compactor race was reproduced and repaired.
- Evidence: `.runtime/observability-audit-20260728-142401/`.


## 2026-07-24 environment data parity

- A SHA-256-verified K3s DEV database snapshot and DEV upload set were cloned
  into UAT and PROD after verified pre-clone backups of every environment.
- DEV/UAT/PROD match on 75 public tables and current business/workflow counts,
  including 2,225 employees, 2,048 users, 8,680 documents, 42 workflow
  instances, 87,217 attendances, 10,965 timesheets, 129,255 timesheet lines,
  5,692 device users, and 20,374 device events.
- PROD/DEV/UAT LAN app/API health, admin authentication, and browser dashboard
  entry pass. Argo CD is `Synced/Healthy`; the VM Cloudflare service is active.
- Public HTTPS remains `NEEDS_CONFIRMATION` from an unfiltered vantage because
  the BNPI workstation resets these hosts during TLS.
- Evidence: `.runtime/dev-to-uat-prod-20260724-144222/REPORT.md`.


# Project Truth Summary

Last updated: 2026-08-12


## Current Runtime Truth

- Local Windows hot-reload uses canonical K3s DEV PostgreSQL at `127.0.0.1:55435`, API `http://localhost:3001`, and app `http://localhost:5175`. The API dependency watchdog probe-first repairs A-F device forwards, VM reverse API/callback port `53001`, and the managed listener while keeping optional TEST A/B bridges non-blocking.
- The current A-F host-forward map is HTTP `10080-10085`, HTTPS `10443-10448`, and SDK `18000-18005`. A listening SSH process alone is not health proof; every port must carry traffic.
- Sync Center transport availability is sourced from bounded quick health, not `sync-preview?quick=true` source-user counts. Full merge inventory and physical/operator state are separate evidence. Current operator truth is exactly five Main Entrance devices online with Main C down; the earlier A-F quick-health result is `CONFLICTING` transport evidence until its mapping/cache/probe semantics are root-caused. The latest plan was read-only and no physical write was started, so the merge is not fulfilled.
- Saved `DeviceEvent` rows are independent of listener readiness. The Saved Events UI preserves database rows while listener/tap status loads or refreshes.

- Hyper-V is available from the elevated Windows host context.
- Repo source shape now includes `hris-api`, `hris-app`, and `hris-emp-app`, with `hris-emp-app` tracked as a git submodule rooted in this workspace and intended to remain visible/editable beside the other HRIS surfaces.
- The current discovered Hyper-V proof VM is `project-truth-local-vhdx-proof`.
- The VM is attached to the `ProjectTruth-External` switch.
- The VM boots from `C:\ProgramData\ProjectTruth\images\project-truth-node-latest.vhdx`.
- The VM initially failed to start with 4 GB startup memory, then started after reducing dynamic memory to 1536 MB startup, 1024 MB minimum, and 3072 MB maximum.
- The current canonical Project Truth LAN/runtime target from 2026-07-03 SSH/HTTP proof is `10.184.37.19`.
- The VM uses pure static LAN addressing on `eth0` with DHCP disabled. Desired reconciled order is `10.184.37.19/24` first and `10.184.37.78/24` retained as a secondary transition address/TLS SAN.
- SSH is exposed on the current stable operator/LAN address at `10.184.37.19:22`.
- SSH server banner evidence: `SSH-2.0-OpenSSH_9.6p1 Ubuntu-3ubuntu13.16`.
- SSH password login was previously proven on `192.168.254.148` with the repo-documented appliance credential `infra / infra` through pinned-host-key `plink`; current host key fingerprint is `SHA256:+Xxejdej6SPlSKBEvEO/++Hh3j+QvoFSetx6DZXxiok`.
- SSH key login is proven on `10.184.37.19` with Windows OpenSSH using `%USERPROFILE%\.ssh\node-health-appliance_ed25519`.
- OpenSSH proof returned hostname `project-truth-node`, user `infra`, VM `eth0` with both `10.184.37.19/24` and `10.184.37.78/24`, and active SSH service while the appliance summary reports `LAN IP: 10.184.37.19`.
- Current LAN SSH command: `ssh -i %USERPROFILE%\.ssh\node-health-appliance_ed25519 infra@10.184.37.19`.
- Public Cloudflare SSH is now verified through `ssh.bnpi-hris.tech` using Cloudflare Access and the host-managed named tunnel.
- Verified public SSH command: `ssh -i %USERPROFILE%\.ssh\node-health-appliance_ed25519 -o ProxyCommand="cloudflared access ssh --hostname %h" infra@ssh.bnpi-hris.tech`.
- Windows OpenSSH alias `project-truth-hris` was added to `%USERPROFILE%\.ssh\config`; `ssh project-truth-hris` returned `SSH_ALIAS_OK`, hostname `project-truth-node`, and user `infra`.
- Preferred clean remote-admin journey is browser-rendered SSH at `https://ssh.bnpi-hris.tech` through the VM-managed Cloudflare Tunnel, with the BNPI Windows Server kept Hyper-V-only and not used for inbound SSH or Windows SSH configuration.
- VM login/banner summary currently reports `LAN IP: 10.184.37.19`, `SSH: ssh infra@10.184.37.19`, app/API ports for PROD/DEV/UAT, and VM-managed Cloudflare public targets.
- Current generated overview line-width check: `MaxLineLength=66`; stale `10.184.38.91` was not present in `/etc/issue`, `/run/project-truth/network-summary.txt`, or the generated overview.
- Historical evidence: on 2026-07-01, DEV LAN checks passed on transient address `10.184.38.144` for app/API (`3100`, `3101`) and SSH (`22`); earlier 2026-06-29 checks passed on transient address `192.168.254.148` for PROD/DEV/UAT app/API and Grafana.
- On 2026-07-02, the active DEV LAN target checked by SSH and HTTP probes was `10.184.38.138`. `http://10.184.38.138:3100/admin/configuration/devices/events?view=saved` and `http://10.184.38.138:3100/auth/login` returned HTTP 200 from the VM, and `http://10.184.38.138:3101/health` returned HTTP 200 with healthy API status.
- On 2026-07-02, `10.184.38.138:3100` and `10.184.38.138:3101` were served by K3s DEV workloads, not Docker Compose HRIS app/API containers. K3s namespace `dev` had `hris-app` and `hris-api` deployments using `hris-app-local:develop` and `hris-api-local:develop`; Docker only showed observability port matches such as Grafana and Loki.
- Later on 2026-07-02, transient address `10.184.38.138` stopped answering SSH and HRIS port probes from the Windows host. SSH to transient address `10.184.38.144` still reached `project-truth-node`; this was superseded on 2026-07-03 by pure static LAN addressing with `10.184.37.78/24` and `10.184.37.19/24`.
- On 2026-07-02, host-managed `cloudflared-bnpi-hris.yml` was corrected to target the stable VM address `10.184.37.19` for app/API/dev/uat/Grafana/SSH origins.
- On 2026-07-02, the VM source checkout for runtime was `/var/lib/project-truth/ansible-pull` on `develop@b1a8678e74229e10f5cfd2f1a1e5e658319c69af`, while the Windows repo was on feature branch `sync/upstream-hris-dryrun-20260702@0b88e12bcd53869a1f6072911c876654658c0692`. Therefore the DEV LAN URL does not automatically preview feature-branch changes unless the VM source/image path is deliberately synced and rebuilt/imported into K3s.
- The `bnpi-hris.tech` Cloudflare 1033 issue was repaired by logging into the Cloudflare account that owns `bnpi-hris.tech`, creating named tunnel `e3486f00-f974-46d3-9e11-911266749d00`, and routing app/API/dev/uat/Grafana hostnames to it.
- Public checks passed for `bnpi-hris.tech`, `www.bnpi-hris.tech`, `app.bnpi-hris.tech`, `api.bnpi-hris.tech`, `dev.bnpi-hris.tech`, `dev-api.bnpi-hris.tech`, `uat.bnpi-hris.tech`, `uat-api.bnpi-hris.tech`, and `grafana.bnpi-hris.tech`.
- Current named tunnel bootstrap ownership remains host-managed on the Windows host through `scripts/start-bnpi-cloudflare-tunnel.ps1`, scheduled task `ProjectTruth-BNPI-HRIS-Cloudflared`, `scripts/ensure-bnpi-cloudflare-host.ps1`, and `cloudflared-bnpi-hris.yml`.
- Current proof VM also has a VM-side Cloudflare named tunnel connector active through `cloudflared-bnpi-hris.service`, using root-only runtime credentials under `/etc/cloudflared` and localhost ingress, including `ssh.bnpi-hris.tech -> ssh://localhost:22`.
- Running-server Cloudflare access is a protected runtime dependency. Agents must not disable, stop, mask, remove, or toggle off `cloudflared-bnpi-hris.service`, and must not introduce a default-local/cloud-mode guard for the already-running server, unless the user explicitly requests a time-bounded outage and a verified recovery path is already documented.
- Fresh/final images must not bake Cloudflare tunnel credentials. The repeatable setup is to boot/import the VM, discover its LAN IP, then run `.\scripts\project-truth.ps1 ensure-bnpi-cloudflare-host -ProvisionDns -StartTunnel -VerifyPublic` from a Windows host that has `cloudflared` and the named tunnel credentials.
- VM-managed Cloudflare Tunnel is now current runtime proof for the proof VM only after deliberate credential import. Fresh/final images still must not bake Cloudflare credentials.
- The V2 one-click reference under `.runtime/gcp-v2-format` is the accepted packaging shape for V6: ship a small extracted zip with a double-click `.cmd`, download the large VHDX and sidecars from the public storage bucket at install time, verify SHA-256, import/start Hyper-V, keep the console window open, and then run V6 runtime proof steps. V6 must add credential preflight/import from `C:\ProgramData\ProjectTruth\secrets\cloudflared\...json`; it must not place the credential in the zip, bucket image, repo, or baked VM.
- V6 one-shot proof on 2026-06-30 passed SSH, ansible-pull, VM-side Cloudflare credential import, LAN health, public `bnpi-hris.tech` health, public CORS, and CLI SSH through `ssh.bnpi-hris.tech`; the serving app/API runtime was healthy Docker Compose containers while K3s pods remained resource-constrained.
- V7 is published under `gs://project-truth-image-export-hris-492904-161377059311/public/project-truth/hyperv/v7/latest/` as a V2/V6-style one-click public lane. It promotes the known clean V5 base VHDX to `project-truth-node-local-hyperv-v7-current-state.vhdx` and ships a small V7 installer zip that runs the latest V6 runtime proof/import path after Hyper-V import. The live proof VM disk was not uploaded because it has contained root-only Cloudflare runtime credentials.
- On 2026-07-03, the live VM observability rolling backups were pruned for a
  compact retained current-state artifact: `/srv/hris/observability/backups/rolling`
  dropped from about `161G` to zero files, `/srv/hris/observability` dropped to
  about `8.2G`, and the VM root filesystem ended at about `164G` used / `308G`
  free after the retained VHDX build.
- On 2026-07-03, an in-VM retained current-state VHDX was built at
  `/var/lib/project-truth/retained-vhdx/20260703-102324/project-truth-node-current-state-20260703-102324.vhdx`.
  It is a dynamic VHDX with virtual size `500 GiB`, file length about `92.6 GiB`,
  disk size about `83.2 GiB`, and SHA-256
  `486378d08bb76cde3716f3f9d4a24fc02c15636b2e39e895b0c59fba1d8a9a1c`.
  `qemu-img check -f vhdx` reported no errors, EFI was copied, and GRUB was
  installed. Boundary: this is a live rsync current-state artifact, not an
  offline Hyper-V checkpoint.
- Later on 2026-07-03, the Windows host-test copy of the retained VHDX
  completed at `C:\ProgramData\ProjectTruth\images\project-truth-node-latest.vhdx`
  with SHA-256
  `b1274ae7b50214b0888cd97aa43a79b0e901c19c4ebce1824923778a0a77a8aa`.
  Hyper-V read it as a dynamic `500 GiB` VHDX with `88.32 GiB` file size and
  `0` fragmentation. `project-truth-local-vhdx-proof` started successfully from
  it; Hyper-V Worker/Admin event `18601` reported the VM successfully booted an
  operating system, heartbeat was OK, and KVP reported `10.184.37.78` and
  `10.184.37.19`. Boundary: direct Windows host probes to SSH and HRIS ports
  still failed because the current `ProjectTruth-External` host/vSwitch path is
  on `192.168.254.149/24` and does not route to the guest's static
  `10.184.37.x` addresses.
- The same host-tested VHDX became reachable for local validation after moving
  `project-truth-local-vhdx-proof` to the internal
  `ProjectTruth-HostTest-10-184-37` switch and setting the host vEthernet to
  `10.184.37.250/24` with `SkipAsSource=False`. SSH plus PROD/DEV/UAT app/API
  ports passed on both static guest IPs, and HTTP probes returned `200` for
  PROD/DEV/UAT login and API health on `10.184.37.19`. Playwright VM login
  smoke passed for PROD and UAT; DEV rendered the dashboard but failed the
  strict console-health assertion on the already-known non-blocking
  `400 action metrics` warning.
- Host-local PROD and DEV checks passed during validation, but host-local UAT ports `3200` and `3201` failed while LAN UAT passed.
- `%ProgramData%\ProjectTruth\config\project-truth.json` was previously backed up and updated to use VM `project-truth-local-vhdx-proof`, guest IP hint `192.168.254.148`, memory `1536`, and SSH port `22`; current operator/LAN evidence now points to pure static LAN address `10.184.37.19`.
- Current local DEV reverse-path proof uses DB device TEST A at `192.168.254.102`, Windows-to-device TCP `8000`/`443`, and VM loopback forwards `59000`/`59443` plus callback reverse `53001`. VM ping to the physical device address is not a tunnel test. A running armed listener is stable while quiet; `receiving` is short-lived event freshness, and Keep ready must not restart armed state merely because no tap arrived recently. This supersedes older local claims that Linux SDK arm/callback was unproven for this reverse-forward path; public/GitOps promotion remains separate.
- Hikvision integration exists in code through `/api/hikvision/callback`, ISAPI helpers, event persistence, admin device-event filters, and realtime `device-event:saved`; editable source is now `vendor/hikvision-linux`, while proprietary Linux HCNetSDK binaries remain local-only runtime inputs.
- On 2026-07-16, direct stored-credential proof against Main Entrance Device A (`10.184.38.173:443`) returned 167 users, 162 users with fingerprints, 161 with faces, 109 with cards, and 2,107 device logs. `DeviceEvent` is now enforced as the single saved event ledger: 70 frozen-window ACS serials matched 70 saved SDK rows, 23 two-page logSearch rows saved with 23/23 repeat deduplication, and API totals reconciled to 93 direct-evidence rows. Backup-first cleanup removed 219 false current-state lifecycle rows and zero attendance rows. Current inventory remains a separate `DEVICE_CURRENT_STATE` plane and never creates lifecycle history.
- Local hot-reload implementation on 2026-07-06 adds `DeviceUser` as the durable admin device identity/enrollment record. `DeviceUser` belongs to `Device`, optionally belongs to `Employee`, and is unique by `organizationId + deviceId + vendorUserId`; `DeviceEvent` can now link to `DeviceUser` and resolves employee identity through `DeviceUser` before the legacy `Employee.deviceEmpId` fallback. `Employee.deviceId` and `Employee.deviceEmpId` remain as legacy compatibility fields in this pass. `EmployeeDeviceEnrollment` was intentionally not introduced because the current relationship only needs direct optional `employeeId` plus status and source metadata. On 2026-07-13 `DeviceUser.vendorMetadata` was added as an additive JSON/JSONB field for per-device vendor SDK/ISAPI user metadata while preserving `rawPayload` as compatibility/fallback source payload; the Sync Center device-user details modal previews this metadata with a tooltip and expandable JSON. On 2026-07-14 the local DeviceUser metadata cache was extended to hold separate AES-256-GCM fingerprint and face envelopes captured from the Hikvision SDK. Portable CSV/Excel/JSON exports expose separate key-source/blob columns per modality, never copy one encrypted envelope into both modality columns, and keep SDK-empty users explicit.
- Local hot-reload Hikvision user sync proof on 2026-07-06 read `UserInfo/Search` for the physical `Main Entrance Device` at `192.168.18.37:80`, created 6 physical-source `DeviceUser` rows, auto-linked 4 exact matches, left 2 `UNMATCHED`, then backfilled 2,213 additional legacy rows from `Employee.deviceEmpId` for 2,219 total `DeviceUser` rows. Device log sync persisted durable `DeviceSyncRun` summaries: a 982-row source log sync saved 376 events, classified 606 as known skipped, failed 0, and left 0 truly missing. Boundary: this is local host hot-reload evidence against the configured DEV database and physical device, not yet GitOps/K3s/public deployment proof.
- ZKTeco is now Linux-first through `vendor/zkteco-linux`. User-supplied device-screen photos in `docs/zkteco-ips/` confirm the four terminals are configured as `10.184.38.9`, `10.184.38.10`, `10.184.38.234`, and `10.184.38.235`, all with mask `255.255.255.0`, gateway `10.184.38.254`, TCP COMM.Port `4370`, and DHCP off. On 2026-07-01 the VM root filesystem was expanded to 491 GB with about 394 GB free, local and VM Linux bridge tests passed, and all four known terminals passed TCP from the VM. Docker Compose now defines `zkteco-linux-bridge`, `zkteco-linux-bridge-dev`, and `zkteco-linux-bridge-uat`; the old Windows SDK submodule and Windows sidecar implementation were removed from the repo. PyZK history counts remain lower than the historical Windows SDK baseline, so exact count parity and GitOps/K3s runtime are still open. On 2026-07-04, current remote/client-side proof through `ssh project-truth-hris` showed only 2 of 4 devices queryable from the active Linux bridge container: `10.184.38.235` and `10.184.38.234` returned 904 users each and 18,085 / 21,507 source-device attendance rows, while `10.184.38.9` and `10.184.38.10` timed out at TCP/PyZK level. Later same-day rechecks found `.9` and `.10` unreachable through 20s TCP, 20s UDP/ZK, and ICMP; `10.184.38.1` replied to ICMP but is not a ZKTeco `4370` endpoint. Reversible same-subnet and gateway/source-route tests, including temporary `10.184.38.144/24` and `/32` source variants through gateway `10.184.38.254`, did not recover `.9/.10`; cleanup restored canonical VM networking and Cloudflare remained active. TCP and directed UDP/ZK sweeps of likely ranges found only `.234` and `.235`. Full recovery reads later returned `.234` with 904 users and 21,510 events and `.235` with 904 users and 18,087 events; `.9` and `.10` failed full PyZK reads after about 34s each. Full attendance pulls on reachable devices are too slow for an interactive sync preflight; PyZK `force_udp=True` is faster for handshake/user counts but slower for full attendance history in this runtime. PyZK `read_sizes()` / ZKTeco `CMD_GET_FREE_SIZES` is now proven as the fast summary-count path: `.235` and `.234` returned user and attendance-log counts in about 2.3s and 2.5s end to end over TCP, and about 0.07-0.14s end to end over UDP in later checks. A same-day gozk trial connected quickly but did not return user objects, failed `.234` attendance history where PyZK succeeded, and failed isolated history retries on both reachable devices; do not make gozk the default on current evidence.
- Hikvision can partially run inside Linux/VM through ISAPI ACS polling and the DEV VM/K3s watcher. An experimental `vendor/hikvision-linux` read-only TCP/ISAPI probe, ACS event watch mode, Docker image scaffold, VM discovery wrapper, and C++ HCNetSDK alarm probe now exist. Vendor-only TCP proof from the Linux VM passed for current Bandai Hikvision candidate `10.184.38.215:80` and `10.184.38.215:8000`; HTTP/ISAPI uses port `80`, the SDK/server port is `8000`, and `800` is not supported by current evidence. Credentialed ISAPI with username `admin` read device time and ACS history including employee no. `1` / `ernest`. Official Linux HCNetSDK `V6.1.9.48` was downloaded, extracted, compiled against, and initialized on the VM, but SDK login/alarm callback is not yet proven because SDK login returned `NET_DVR_PASSWORD_ERROR (1)`.
- Hikvision biometric enrollment sync target architecture is documented at `.wwg/wiki/05-architecture/hikvision-biometric-sync-architecture.md`. The intended runtime is a Linux/VM-owned HCNetSDK alarm listener plus queued reconciliation worker: enrollment/user-change callbacks trigger user/fingerprint reads from the source device, peer-device sync, and HRIS `DeviceUser`/biometric metadata persistence. The local Windows reference at `C:\Users\anoni\OneDrive\Desktop\HRIS-PROJECT\EN-HCNetSDKV6.1.9.4_build20220412_win64\AlarmDemo.cpp` is behavior evidence only; future Linux code should use Project Truth service names, not `AlarmDemo`. Boundary: raw fingerprint template storage in normal `User` records is not approved without an encrypted biometric-custody design; Linux HCNetSDK login/alarm callback remains unproven.
- On 2026-07-09, `vendor/hikvision-linux/hikvision_biometric_service.cpp` became the single active C++ HCNetSDK runtime source. The service queues ACS alarms and posts them to `/api/hikvision/callback` with source `EN_HCNETSDK_ALARM`, leaving the existing callback controller as the single owner of `DeviceEvent` persistence, attendance/timesheet projection, and `device-event:saved` socket emission. The old active `hcnetsdk_alarm_probe` source/build path was removed. Endpoint preview and biometric reconcile dry-run passed locally against `Main Entrance Device` at `10.184.37.139`; VM build/link and SDK init/callback registration passed. Boundary from the single-source pass: VM `10.184.37.19` could not route to `10.184.37.139:80/8000`. Later same-day host-test VM `10.184.37.241` did reach `10.184.37.139` by ping, TCP `80`, and TCP `8000`; the current service source built and linked there, and SDK init/callback registration passed. Real SDK login still failed with HCNetSDK error `1` because no documented Hikvision device credentials were available, so alarm arm and real tap proof remain unproven. Non-production callback simulations proved the HRIS saved-row/socket/browser-live leg only.
- Local DEV callback parser proof on 2026-07-08 accepts Hikvision HTTP-host XML aliases `ipAddress` and `dateTime`. A localhost API smoke callback with `ipAddress=10.184.38.96` matched the current local `Main Entrance Device` row and persisted a marked `HIKVISION_CALLBACK` `DeviceEvent`; the marked smoke row was deleted after verification. Boundary: `localhost` is valid for a local SDK/watcher process only. A physical Hikvision terminal must post to a LAN-reachable or tunneled HRIS API URL, not to its own `localhost`.
- A 2026-06-30 chat-provided SADP screenshot shows one active Hikvision `DS-K1T201AEF` device, ID `001`, at `192.168.254.181:8000`; this is physical discovery evidence only, not end-to-end HRIS callback or attendance proof.
- DEV Hikvision physical-device proof on 2026-06-30 passed after correcting `Main Entrance Device` to `192.168.254.181:80` / `http`: HRIS device health reached ISAPI time, ACS event pull returned a physical event (`major=5`, `minor=38`, employee no. `1`, serial `997`), DEV `device_events` saved row `cmr0e1jk2002lm601rul855z2` as `HIKVISION_CALLBACK` / `UNMATCHED`, and the admin saved-events UI rendered it with address `192.168.254.181` and save path `Device callback`.
- DEV Hikvision VM/K3s watcher proof on 2026-06-30 added GitOps-managed Deployment `hris-hikvision-watcher` in namespace `dev`; it runs the existing ACS-pull apply loop against `cmqquro2g002em73cdp74rx0q`, reached `READY 1/1`, reported `live.withEmployeeNo=5`, `saved.matchingAfterApply=5`, and `gap.missingWithEmployeeNo=0`, saved fresh `HIKVISION_CALLBACK` rows received at `2026-06-30T13:48:29Z`, and browser-rendered the public DEV saved-events page for `Main Entrance Device`.
- On 2026-07-02, live DEV K3s at `10.184.38.138` had `Main Entrance Device` configured as `10.184.38.215:80` / `http`, with device config merged to include `vendor=Hikvision`, `source=vendor/hikvision-linux`, `sdkPort=8000`, and `webhookPath=/api/hikvision/callback` while preserving existing `hikvisionClockSkew*` evidence. Recent DEV rows for that device were `HIKVISION_CALLBACK` / `ATTENDANCE_CREATED`.
- UAT temporary Hikvision seed proof on 2026-06-30 passed after correcting the K3s UAT `Main Entrance Device` row `cmqqv5x45002ele3dqt3a233i` to `192.168.254.181:80` / `http` and adding temporary employee mappings `UAT-HIK-001` through `UAT-HIK-005` for device employee numbers `1` through `5`. A callback-shaped event for no. `1` saved device event `cmr0hh22y0025nq011uukvetx` with status `ATTENDANCE_CREATED`, matched `uat-temp-hikvision-employee-1`, created attendance `cmr0hh27a0027nq01elxja5k7`, and rendered in the UAT admin saved-events UI with terminal `Main Entrance Device`, address `192.168.254.181`, and save path `Device callback`.


## Current Drift

- Earlier `10.184.38.91` runtime proof is stale; the 2026-06-29 repair pass used transient address `192.168.254.148`, 2026-07-01 operator/LAN proof used transient address `10.184.38.144`, and the 2026-07-02 DEV serving-path check used transient address `10.184.38.138`. Later 2026-07-02 probes found `10.184.38.138` unreachable; current operator/LAN access should use pure static address `10.184.37.19`, while K3s remains pinned to `10.184.37.78`.
- Public `bnpi-hris.tech` verification from the client LAN is currently affected by a network policy block/reset: plain HTTP returns a company-policy "Web Page Blocked" response and HTTPS to `bnpi-hris.tech` / `api.bnpi-hris.tech` resets during TLS, while general HTTPS to Cloudflare and Google succeeds. Treat public checks from this LAN as blocked by network policy until verified from an unfiltered vantage point.
- `verify-gitops-state -GuestIp 10.184.38.91` previously reached the VM over SSH, but that IP is stale for the current session. Argo CD/Application state should be checked against canonical LAN/runtime target `10.184.37.19` or through `ssh project-truth-hris`; `10.184.37.78` is only a retained secondary transition address.
- V6 runtime proof shows a split serving reality: public/LAN HRIS is green through Docker Compose and VM-side Cloudflare, while many K3s pods are `Pending`, `Evicted`, or `ContainerStatusUnknown` under memory pressure despite Argo Applications reporting `Synced/Healthy`.
- The 2026-07-03 paused/broken observability backup state is stale. On
  2026-07-28 backup was re-enabled as bounded, atomic, validated Grafana
  PostgreSQL dumps; invalid live-filesystem archives were removed only after
  replacement restore points passed checksum and catalog validation.
- Runtime quick tunnels are deprecated for normal public access. Historical TryCloudflare evidence may remain in old reports, but active VM boot/sync paths keep the TryCloudflare service disabled by default.
- Hikvision has Docker DEV DB evidence for `HIKVISION_CALLBACK` and `EN_HCNETSDK_ALARM`, DEV physical ACS-pull saved-event proof, DEV VM/K3s watcher proof, and UAT temporary callback/attendance seed proof. It still needs Linux HCNetSDK login/alarm callback proof, direct spontaneous device push proof, UAT physical pull routing, and PROD parity.
- DeviceUser architecture and UI have local hot-reload proof only as of 2026-07-06. Remaining drift is GitOps/K3s/public DEV promotion and proof that the same `DeviceUser` schema, user sync, event resolver, and durable skipped-row summaries operate in the VM/public serving path.
- Device SDK runtime drift: ZKTeco has been converted to a repo-owned Linux/PyZK bridge path; remaining ZKTeco drift is count-parity explanation, realtime push parity, GitOps/K3s runtime, current reachability repair for `10.184.38.9` / `10.184.38.10` after the 2026-07-04 remote proof found them TCP/PyZK-unreachable, and any future gozk adoption would require stable user extraction plus stable history reads. The ZKTeco sync modal/preflight should use `read_sizes()` for quick counts and should not treat live full-history PyZK pulls as a sub-15-second operation. Hikvision now has a Linux/Docker probe scaffold and a successful VM Docker build, but Project Truth has not converted Hikvision into a managed VM/Docker HCNetSDK listener.
- Hikvision physical discovery has advanced from no reachable-device observation to SADP seeing `DS-K1T201AEF` at `192.168.254.181:8000`; runtime ingestion and cross-environment proof remain open.
- Hikvision DEV runtime ingestion is now proven for physical-device ACS pull into saved device events, including a DEV K3s watcher that starts with the runtime, and UAT callback-shaped ingestion is proven for employee matching plus attendance creation using temporary employees `1` through `5`. Spontaneous device push callback, Linux HCNetSDK managed runtime, UAT pod-to-device routing, DEV attendance matching for employee no. `1`, and PROD parity remain open.


## Operating Notes

- VM/GitOps/runtime work is admin / `hris-admin` operational work.
- Current local/VM employee-app runtime integration ports are `3300` (PROD), `3310` (DEV), and `3320` (UAT), each proxying browser `/api` and `socket.io` traffic back to the paired `hris-api` service.
- Current verified LAN access summary for `10.184.37.19` from 2026-07-14:
  - SSH: `ssh -i %USERPROFILE%\.ssh\node-health-appliance_ed25519 infra@10.184.37.19`
  - PROD HRIS app/API: `http://10.184.37.19:3000/auth/login`,
    `http://10.184.37.19:3001/health`
  - PROD employee portal: `http://10.184.37.19:3300/auth/login`
  - DEV HRIS app/API: `http://10.184.37.19:3100/auth/login`,
    `http://10.184.37.19:3101/health`
  - DEV employee portal: `http://10.184.37.19:3310/auth/login`
  - UAT HRIS app/API: `http://10.184.37.19:3200/auth/login`,
    `http://10.184.37.19:3201/health`
  - UAT employee portal: `http://10.184.37.19:3320/auth/login`
  - Grafana: `http://10.184.37.19:53000/` and health
    `http://10.184.37.19:53000/api/health`
  - Observability health/metrics: Prometheus
    `http://10.184.37.19:9091/-/healthy`, Loki
    `http://10.184.37.19:3110/ready`, Tempo
    `http://10.184.37.19:3202/ready`, Alertmanager
    `http://10.184.37.19:9093/-/healthy`, node exporter
    `http://10.184.37.19:9110/metrics`, cAdvisor
    `http://10.184.37.19:8088/metrics`, Blackbox exporter
    `http://10.184.37.19:9115/-/healthy`, OTEL collector metrics
    `http://10.184.37.19:8889/metrics`
  - ZKTeco bridge health: PROD `http://10.184.37.19:4371/health`, DEV
    `http://10.184.37.19:4372/health`, UAT
    `http://10.184.37.19:4373/health`
  - Verified TCP endpoints, not browser URLs: PROD DB `10.184.37.19:15432`,
    DEV DB `10.184.37.19:15433`, UAT DB `10.184.37.19:15434`,
    observability DB `10.184.37.19:15435`, OTEL gRPC/HTTP
    `10.184.37.19:4317` and `10.184.37.19:4318`
  - Host-side HTTP checks returned 200 for the listed app/API/portal,
    observability, and ZKTeco health URLs; TCP probes passed for SSH, DB, and
    OTEL ports. The VM-managed Cloudflare Tunnel was active during verification.
- Employee-app public endpoint targets are `https://emp.bnpi-hris.tech/auth/login`, `https://dev-emp.bnpi-hris.tech/auth/login`, and `https://uat-emp.bnpi-hris.tech/auth/login`, mapped to the same per-environment API origins used by Project Truth app/API routing.
- From the Windows host, host-local VM, LAN, device, DB, GitOps, and runtime
  drift checks should collect direct LAN evidence through
  `ssh -i %USERPROFILE%\.ssh\node-health-appliance_ed25519 infra@10.184.37.19`
  before using `ssh project-truth-hris`. The Cloudflare alias remains valid for
  fallback/public-path proof and must stay active, but it is not the first
  evidence path for local VM drift.
- Host-local Docker health is diagnostic only; the finish line remains VM LAN, GitOps, K3s/Argo CD, and HRIS app/API proof.
- Keep the running VM-managed `bnpi-hris` Cloudflare Tunnel active during normal work. Do not implement "cloud mode off" as a default for the live server, because public HRIS and `ssh project-truth-hris` depend on it.
- Treat runtime IPs as evidence snapshots unless persisted through Project Truth configuration or static addressing.
- Long-running device-user biometric extraction is a persistent background job: the admin can close and reopen an orange progress surface without cancelling work. Reported counts are not equivalent to captured biometric envelopes.
- Persisted processing device-user sync jobs require recent progress evidence. A stored processing snapshot that has not updated for 30 minutes is stale and must not be reopened as active on app/dev-server startup; the admin must trigger a fresh Sync device users run.
- Device-user spreadsheet/package biometric columns now use raw custody for the active Hikvision Device Users journey. CSV/Excel/JSON carry evidenced raw fingerprint `fingerData` and raw face/image blobs only when DeviceUser or matching DeviceEvent payloads prove the bytes; absent bytes remain explicit as `not_enrolled`, `missing_raw_blob`, or `not_requested`. The earlier v2 AES/passphrase envelope proof is historical/stale for this journey and must not drive current UI copy or package requirements.
- Multi-device merge/preflight must use bounded concurrent reads and skip unavailable devices instead of serially consuming the full device timeout. Refreshing Sync Logs must preserve already loaded rows.
- For historical `10.184.38.138:3100` / `10.184.38.138:3101` evidence, the serving path pointed to K3s DEV hostPort traffic. Current 2026-07-03 operator/LAN access should use pure static address `10.184.37.19`, and agents should not assume Docker Compose app/API or local feature-branch code is being served without image digest and pod evidence.

