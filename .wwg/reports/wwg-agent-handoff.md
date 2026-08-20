# WWG Agent Handoff

## 2026-08-20 - 2.1.7 readiness re-check

| Field | Value |
|---|---|
| Verdict | `READY_WITH_RESIDUAL` |
| Screenshot “not shown in UI” | **STALE** — tab is mounted |
| Re-proof | vitest 3, Playwright 1, API 872/1355 |
| Residual | roster Gender/Agency/Total Manpower = 0; public DEV SHA unproven |
| Report | `.wwg/reports/direct-indirect-labor-ui-20260820.md` |

## 2026-08-20 - Timesheet 2.1.7 Direct vs Indirect labor UI

| Field | Value |
|---|---|
| Status | `IMPLEMENTED_LOCAL_BROWSER_PROOF` |
| Gap | Audit 2.1.7: tardiness/OT existed; Direct vs Indirect tab was not mounted |
| Fix | Third Workforce tab `direct-indirect` renders `DirectIndirectLaborTab` |
| Default | `tab=labor` still Manpower Distribution |
| Live API | 872 direct / 1355 indirect (2026-08-20) |
| Tests | vitest workforce 3 + manpower 3; Playwright `hr-workforce-direct-indirect.spec.ts` |
| Open | Client roster tables on that tab can be 0; no-work / daily manpower still unmounted (2.1.9) |
| Operator doc | `docs/00-product/DIRECT_INDIRECT_LABOR_REPORT.md` |
| Report | `.wwg/reports/direct-indirect-labor-ui-20260820.md` |

## 2026-08-20 - UAT/PROD app+API auto-roll

| Field | Value |
|---|---|
| Change | ansible-pull `rollout restart` for app/API in `dev uat prod` (skip missing) |
| Trigger | still `develop` push + path-filter rebuild |
| Not | GitHub branches `uat`/`production` |
| Revert | `PROJECT_TRUTH_ROLLOUT_NAMESPACES=dev` |
| Report | `.wwg/reports/uat-prod-app-api-auto-roll-20260820.md` |

## 2026-08-20 - Document on-prem port access

| Field | Value |
|---|---|
| Operator page | `docs/ONPREM_PORT_ACCESS.md` |
| Evidence | `.wwg/reports/onprem-port-access-20260820.md` |
| VM binds | six HTTP 200 |
| This PC LAN | six `tcp=false` |
| Public APIs | 200 |

## 2026-08-20 - On-prem DEV/UAT/PROD port Observe

| Field | Value |
|---|---|
| Meaning | Operator asked for on-prem instance port access (DEV/UAT/PROD app+API), not Cloudflare-only |
| Probe | VM `curl 127.0.0.1:{3000,3001,3100,3101,3200,3201}` |
| Live bind | all six HTTP 200 (2026-08-20 SSH) |
| Observe | `onprem-{prod,dev,uat}-{api,app}`; failure if port down |

## 2026-08-20 - Non-breaking DevOps CI/Observe harden (push authorized)

| Field | Value |
|---|---|
| Operator | Improve without breaking, then **do it** (push `develop`). |
| CI | Additive jobs `zkteco`, `ansible` syntax-check. Existing jobs unchanged. |
| Observe | Still green on not-rebuilt. Summary shows VM description. Informational URL GET does not fail the job. |
| Reporter | `outcome=` token; precise image needles. Never posts failure. |

## 2026-08-20 - Document CI/Observe/Validate (no push)

| Field | Value |
|---|---|
| Operator | Document well. **Do not push. Do not deploy** until ordered. |
| Canonical | `.wwg/reports/devops-ci-observe-validate-20260819.md` |
| Tip at proof | `efc86c56` CI + Observe + Validate green |
| Honesty | Observe image envs were **not rebuilt** (`services=none`). Runtime Argo **Degraded** = failed `hris-api-db-init` Job. |
| Evidence | `.runtime/devops-ci-validate-20260819/` |

## 2026-08-19 - CI checks per deploy type

| Field | Value |
|---|---|
| CI workflow | `.github/workflows/ci.yml` jobs: hris-api, hris-app, hris-emp-app, hikvision, callback-outbox, gitops |
| Observe | matrix environments `vm-gitops`, `hris-api`, `hris-app`, `hris-emp-app`, `callback-outbox` |
| VM | `project-truth-report-github-deploy` reports each environment |

## 2026-08-19 - GitHub Action observe VM deploy

| Field | Value |
|---|---|
| Gap | Actions tab had no live “is this SHA deployed” signal |
| Workflow | `.github/workflows/observe-deploy.yml` — environment `vm-gitops` |
| VM report | `project-truth-report-github-deploy` after ansible-pull state |
| How to watch | `gh run list --workflow observe-deploy.yml --branch develop` |
| Live proof | SHA `e8046073` — Action [32257214024](https://github.com/hrisworkforcesystem-coder/bandai-infra/actions/runs/32257214024) success; VM `synced_at=2026-08-19T13:20:58Z`; deployment `5983215227` |

## 2026-08-19 - infra git login on VM

| Field | Value |
|---|---|
| Before | `infra` had no git login (`gh` missing, no `~/.git-credentials`); ansible-pull already worked via `argocd/project-truth-repo-creds` as `g-zenr` |
| After | `credential.helper=store`; `~/.git-credentials` mode 0600; `user.name=g-zenr` |
| Proof | `git ls-remote` as `infra` → `6f973877ca13` develop |
| LAN SSH | still timeout from this host (`192.168.1.26` Wi-Fi, not on `10.184.37.0/24`); use `ssh project-truth-hris` |
| Evidence | `.runtime/vm-git-login-20260819/` |

## 2026-08-19 - Local attendance request missing on public DEV

| Field | Value |
|---|---|
| Symptom | Local Vite showed **Request time** / attendance request. `https://dev.bnpi-hris.tech` did not. |
| Cause 1 | DEV GitOps serves `develop`. Feature lived on `bryan-task` `3bad2d1`. Merging `develop` into `bryan-task` does not deploy it. |
| Cause 2 | Layout CSS was uncommitted. |
| Cause 3 | Root `.gitignore` `templates/` ignored `hris-app/app/components/templates/AttendanceRateDonut.tsx`, so the first develop image build failed `UNRESOLVED_IMPORT`. |
| Before | Argo/image `b409ca4`. Live HTML `root-pLw9zlEI.css`, no Request time. |
| After | `origin/develop` `f93f30d`. ansible-pull `2026-08-19T10:01:21Z`. DEV app pod `hris-app-77fcb5db6f-d69md`. HTML `root-CIRKoZkC.css`. Chunk `_id.attendance-DI1eNUjI.js` contains **Request time**. CSS has `attendance-period-layout`. |
| Tests | API mocha 30; app vitest 26; local `hris-app` production build green. |

## 2026-08-20 - Attendance records compact + sticky employee

| Field | Value |
|---|---|
| Ask | Compress table; freeze employee name on horizontal scroll; smaller text |
| Fix | DataTable `density=compact`; employee `pin: left`; smaller avatars/times/badges |
| Tests | vitest 31 |
| Browser | `.runtime/attendance-records-compact-20260820/result.json` — Shift Date scrolled away, Employee stayed |

## 2026-08-20 - Attendance overview return from list filters

| Field | Value |
|---|---|
| Symptom | Clocked In (and other overview filters) set `?status=&view=list`. Sidebar Attendance stayed on that URL. |
| Fix | Back link → `/hr/attendance` (date/period kept). Metric toggle-off returns to overview. Sidebar same-path click clears search. |
| Tests | vitest 23 (attendance 19 + sidebar 4) |
| Browser | `.runtime/attendance-overview-return-20260820/result.json` |

## 2026-08-19 - Overtime request hours/minutes + HR payable OT

| Field | Value |
|---|---|
| Symptom | OT form was a number spinner; 2h 50m not enterable. Workflow was manager. Approve did not write payable OT. |
| UI | DatePicker + Hours/Minutes. Example 2:50. |
| Workflow | `WF-OVERTIME-DEFAULT` employee → **HR** → system |
| Apply | HR approve writes `timesheet_lines.overtimeHours` `2:50` (170 min) |
| Tests | vitest 7; mocha 3 |

## 2026-08-19 - Payroll Management sheet audit (actual users)

| Field | Value |
|---|---|
| Status | `AUDITED_LIVE` |
| Sheet claim | 98.08% — **wrong** |
| Report | `audits/payroll-management-2026-08-19.md` |
| Records | **46** `EmployeePayroll` (35 Jun P1 + 11 Jul P1). Payslip files **0**. Special runs **0**. Loans **1321**. Corrections **0** |
| Current Aug | OPEN `PP-20260811-20260826`. Approved timesheets **0**. Zen TS `cmswwobaz05mxlp01e8p71f9q` **404** |
| Actors | Maria Santos HR · Juan Mendoza employee · Zen `00010` via API |

## 2026-08-19 - ansible-pull fixed (suspended GitHub user)

| Field | Value |
|---|---|
| Cause | VM secret `argocd/project-truth-repo-creds` used **suspended** GitHub user `ernestdodz` → `403` |
| Fix | Replaced secret with this PC’s working `gh` token (`x-access-token` / `g-zenr`) |
| Second fail | submodule `hris-emp-app` **404** (token cannot read that private sibling) |
| Script | `project-truth-ansible-pull` now applies the playbook from the main checkout if submodule fetch fails |
| Applied | `d73b464` at **2026-08-19T06:00:30Z** (`ansible-pull-state`) |
| SDK ELF | still the LAN-built **2026-08-19 05:21** binary, listener **active** |

## 2026-08-19 - SDK callback listener deployed via LAN (GitOps still 403)

| Field | Value |
|---|---|
| Status | `DEPLOYED_LAN` |
| How | Host scp → `/opt` `include/`+`src/` + new wrapper → `systemctl restart` (ansible-pull still 403) |
| ELF | `/home/infra/.../build/hikvision-biometric-service` **2026-08-19 05:21 UTC** size `1548384` (was 2026-08-13 `1499832`) |
| Process | started **2026-08-19 05:20:59** `sdk_login`/`sdk_alarm_arm` ok; `acs_alarm_received` at 05:21:40Z |
| Rollback ELF | `hikvision-biometric-service.bak-20260813` |
| GitOps | still not pulling GitHub |

## 2026-08-19 - Push vs VM pull check

| Step | Last working | Now |
|---|---|---|
| Host `git push origin develop` | yes | **yes** — GitHub tip `68dd7ae` (2026-08-19T04:59:02Z) |
| VM `ansible-pull` | last **success** `bedf705` at **2026-08-12T09:51:24Z** | **fail every ~5 min** — GitHub `403` `Your account is suspended` |
| Listener rebuild | ELF **2026-08-13 06:59** | **not since** |

Host push still works (same as last time). VM pull does **not**. SDK listener is not receiving those pushes.

## 2026-08-19 - Live VM: deployed listener is NOT the new units

| Field | Value |
|---|---|
| Status | `PROVEN_STALE_DEPLOY` |
| VM | `10.184.37.19` `project-truth-node` (LAN SSH 2026-08-19 04:54 UTC) |
| Listener | `project-truth-hikvision-hot-reload-listener.service` **active** since **2026-08-13 06:59 UTC** |
| Running ELF | `/home/infra/project-truth-hikvision-biometric-service/build/hikvision-biometric-service` dated **2026-08-13 06:59** |
| Installed wrapper | `/usr/local/bin/project-truth-hikvision-hot-reload-listener` dated **2026-08-13 06:07** still keys on `hikvision_biometric_service.cpp` |
| `/opt` + git source | still **monolith** `hikvision_biometric_service.cpp`; no `src/hikvision_bio/` |
| Git source SHA | `/var/lib/project-truth/source` `a6fdd26a` (not `e1ddfba`) |
| Why not updating | `ansible-pull` **failed**: GitHub `403` `Your account is suspended` on `https://github.com/hrisworkforcesystem-coder/bandai-infra.git` |
| Scratch compile | **OK** — new 10 TUs linked at `/tmp/hikvision-units-proof/build/hikvision-biometric-service` 2026-08-19 04:58 UTC. **Did not replace** the running ELF. |

## 2026-08-19 - Hikvision C++ real units rollback docs

| Field | Value |
|---|---|
| Status | `DOCUMENTED` |
| Report | `.wwg/reports/hikvision-cpp-maintainable-units-20260819.md` |
| Last good unity | `6b670a4` |
| Hard rollback | revert `301ebb5` then `66868a2` |
| Soft | wrapper keeps last `hikvision-biometric-service` ELF if rebuild fails |
| Live compile | `NEEDS_CONFIRMATION` |

## 2026-08-19 - Hikvision C++ real .cpp/.hpp compilation units

| Field | Value |
|---|---|
| Status | `IMPLEMENTED_SOURCE` (VM rebuild `NEEDS_CONFIRMATION`) |
| Supersedes | 2026-08-19 foldered `.inc.cpp` include/src split |
| Headers | `vendor/hikvision-linux/include/hikvision_bio/` — `types.hpp`, `common.hpp`, `time.hpp`, `runtime.hpp`, `prelude.hpp`, `acs.hpp`, `identity.hpp`, `fingerprint.hpp`, `face.hpp`, `copy.hpp`, `spool.hpp` |
| Sources | `vendor/hikvision-linux/src/hikvision_bio/` — `common.cpp`, `time.cpp`, `acs.cpp`, `identity.cpp`, `fingerprint.cpp`, `face.cpp`, `copy.cpp`, `spool.cpp`, `runtime.cpp`, `main.cpp` |
| Split | fingerprint vs face are separate units; leftover `.inc.cpp` dumps removed |
| Binary / CLI | same `hikvision-biometric-service`; CLI/JSONL unchanged; wrapper still syncs whole include/ + src/ |
| Time | still SDK STDXML GET/PUT `/ISAPI/System/time`, `CST-8:00:00`, `execute=false` default; no NTP |

## 2026-08-19 - Hikvision C++ include/src folder split

- Status: `SUPERSEDED` by **Hikvision C++ real .cpp/.hpp compilation units**.
- Folders: `acs/`, `identity/`, `biometric/`, `copy/`, `spool/`, `runtime/`, `time/`.
- Entry: `src/hikvision_bio/main.cpp`. Mocha 37 green.

## 2026-08-19 - HRIS Hikvision Update time button

- Status: `IMPLEMENTED_SDK_FIRST`. Preview-first. Check+write prefer HCNetSDK STDXML.
- C++: `--get-time` / `--set-time` via `NET_DVR_STDXMLConfig` GET/PUT `/ISAPI/System/time`.
- HRIS: `runHikvisionDeviceTimeOnVm`; ISAPI HTTP fallback. Response `transport`.
- UI shows SDK vs ISAPI path. Not NTP. VM listener must rebuild this C++ for SDK path.
- Tests: mocha 7 green; vitest time-sync UI 1.

## 2026-08-19 - Hikvision biometric clock / Manila fleet sync research

- Status: `RESEARCHED_CODE_VENDOR_AND_STALE_LIVE`. No panel writes.
- Devices **can** set time: panel Time Settings, web Manual/NTP, Hik-Connect, iVMS Batch Time Sync, ISAPI `PUT /ISAPI/System/time`, NTP `ntpServers`.
- HRIS today: **GET only**. Health badge Readable. No SET/NTP writer.
- Manila on wire: `CST-8:00:00` + DST off + `+08:00`. Already matches BNPI GET. Preferred fleet: NTP + that TZ.
- Last XML: `timeMode=manual`; B/D/E 2026-08-17 drifted ~20–61s vs API. Live today `NEEDS_CONFIRMATION`.
- Report: `.wwg/reports/hikvision-biometric-time-manila-20260819.md`. REC-20260819-HIKVISION-DEVICE-NTP-FLEET.

## 2026-08-19 - EmployeePayroll.hourlySalary live DEV backfill

- Status: `EXECUTED_LIVE_DEV`. K3s DEV via `127.0.0.1:55435`.
- Dry-run: scanned 46, wouldUpdate 46, alreadySet 0. Execute: **updated 46 / errors 0**.
- Source: `metadata.hourlyRate`. Second dry-run: alreadySet 46, wouldUpdate 0.
- Money fields not rewritten. Sample `cmsednryg0190nxvsgfr4utaa` daily 1471.43 → hourly 196.19.

## 2026-08-19 - EmployeePayroll.hourlySalary backfill script

- Status: `IMPLEMENTED_DOCUMENTED`. Dry-run default. Writes `hourlySalary` only.
- Commands: `cd hris-api`; `npm run backfill:employee-payroll-hourly-salary` or `:execute`. Wrapper: `scripts/backfill-employee-payroll-hourly-salary.ps1`.
- Source: existing `metadata.hourlyRate` / `rateBreakdown` / `dailySalary`. Not used in compute.
- Optional script fills existing `EmployeePayroll.hourlySalary = 0` from current `dailySalary` / payroll `metadata`. Still **not** used in OT/late/UT/absent/gross.
- Dry-run default: `cd hris-api` then `npm run backfill:employee-payroll-hourly-salary`.
- Writes only on `npm run backfill:employee-payroll-hourly-salary:execute`. Column only; paid money history is not regenerated.
- Derive: `computeEmployeePayrollHourlySalarySnapshot` — prefer metadata `hourlyRate`, else daily ÷ hours (BNPI 313 uses 8).
- WWG: project-truth hourlySalary bullet + summary one-liner + current-task addendum + snapshot report **Backfill** section.

## 2026-08-19 - EmployeePayroll.hourlySalary generate-time snapshot

- Status: `IMPLEMENTED_DOCUMENTED`. Operator: snapshot only; auto-computed; no extra features.
- Compute audit 2026-08-19: `hourlySalary` is **not** read for OT/late/UT/absent/gross. Money still uses in-memory `attendanceRate.hourlyRate`. Contract test in `employee-payroll-hourly-salary-snapshot.spec.ts`.
- Field: `EmployeePayroll.hourlySalary` Float default 0. Written on generate/preview register persist via `computeEmployeePayrollHourlySalarySnapshot`.
- `Employee` SoT remains `basicSalary` + `currency` + `payFrequency`. No `Employee.hourlyRate`. Hire/edit, Sheet2 columns, metrics, and payroll UI unchanged.
- Formula: prefer attendance `hourlyRate`, else `daily / workingHoursPerDay` (BNPI 313 uses 8).
- Tests: `hris-api/tests/employee-payroll-hourly-salary-snapshot.spec.ts` (5 cases) green with existing 313 daily-rate tests (8 passing).
- Migration: `hris-api/prisma/schema-postgres/migrations/20260819_add_employee_payroll_hourly_salary.sql`. Existing rows stay 0 until unpaid regenerate. Runtime apply on DEV is `NEEDS_CONFIRMATION` until the SQL is applied.
- Report: `.wwg/reports/employee-payroll-hourly-salary-snapshot-20260819.md`.

## 2026-08-17 - Zen 00010 timesheet lines + sync API

- Status: `IMPLEMENTED_DOCUMENTED` — operator asked to push leftover timesheet sync + docs.
- Missing timesheet → created/approved `cmswwobaz05mxlp01e8p71f9q`; 14 lines materialized; preview deducts absent/late.
- `POST /api/timesheet/:id/sync-obligation-lines` + `ensure-period-drafts` `employeeIds`.
- Reports: `.wwg/reports/zen-00010-payroll-preview-math-20260817.md`, `.wwg/reports/zen-payroll-timesheet-code-20260817.md`.

## 2026-08-17 - Encoding / boarding titles + set-active recompute

- Status: `IMPLEMENTED_DOCUMENTED` — operator asked to document and push `develop`.
- Boarding titles ASCII. Documents icon compare, enroll copy, Grafana Tempo title, level descriptions cleaned.
- `set-active` calls `recomputeAttendanceObligationsForRange` after assign.
- Report: `.wwg/reports/mojibake-encoding-20260817.md`.
- Tests: boarding + user-facing mojibake + set-active recompute contracts.

## 2026-08-17 - Device Event TAP display + person-10 link

- Status: `IMPLEMENTED_DOCUMENTED_LOCAL` (`a6dce32` already on `origin/develop` from before the no-push instruction).
- Operator serial 9652 person 10 Check Out: attendance was already updated. Unknown Vendor / Unknown evidence = stale stored taxonomy.
- GET/UI reclassify stale UNKNOWN → TAP; SDK evidence stamp; callback pad match + DeviceUser link on next tap.
- Data: DeviceUser 10 on B/D/E linked to `00010` Zen Andrei. Other unmatched left unmatched.
- Proof: local GET TAP/`SDK_CALLBACK` on `cmsr688py002xvxwwttxhdsal`. Report: `.wwg/reports/device-event-tap-display-20260817.md`.
- Do not push unless asked. Public DEV UI until API SHA rolls is `NEEDS_CONFIRMATION`.

## 2026-08-17 - Device Events view-event deeplink

- Status: `IMPLEMENTED_DOCUMENTED_LOCAL_NOT_PUSHED`.
- `action=view-event&id=` must fetch `GET /api/device/events/item/:eventId`.
- Table `page=` is not identity. Do not use `rows.find` alone.
- Proof: `.runtime/device-event-deeplink-20260817/`. Spec: `docs/00-product/DEVICE-EVENTS-SAVED-EVENT-DEEPLINK.md`.
- Operator must have `localhost:3001` healthy; Vite cache is not API proof.

## 2026-08-17 - Device event details SHE + icon/label (push)

- Status: `IMPLEMENTED`. Report: `.wwg/reports/device-event-details-she-20260817.md`.
- Shrink/Hide/Embody + icon and full button labels on view-event modal.
- Principle + grok rule 06 + DESIGN.md. Push when this commit is green.

## 2026-08-17 - SHE UI doctrine saved

- Status: `PRINCIPLE_ACTIVE`.
- Shrink, Hide, Embody (Maeda). Hide is the forgotten third word.
- `.wwg/wiki/principles/shrink-hide-embody.md` + `.grok/rules/06-shrink-hide-embody.md` + `DESIGN.md`.
- Pull when operator says clean UI / Carpati UI / SHE.

## 2026-08-17 - Dup updates documented (no push)

- Status: `DOCUMENTED_LOCAL_API_PROVEN`.
- Local `:3001` skip persist proven (smoke serial `GROK-DOC-M2-38-20260817`, 0 DB rows).
- Canonical: `.wwg/reports/device-events-dup-20260817.md` + project-truth + terminology **Armed-device ACS exception**.
- CONFLICTING: live `2/38` still saved `02:51:12Z` after API start — do not claim every writer is on the skip.
- No push (operator standing order).

## 2026-08-17 - Duplicate per active device

- Status: `ROOT_CAUSED_AND_FIXED_LOCAL`.
- Armed B/D/E each POST ACS **exception** major=2 minor=38 every 301s with empty person. A/C/F silent.
- Not HRIS fan-out (0 same-second / 0 shared serial). Real taps are major=5 with person.
- HRIS no longer persists that exception. C++ classify requires major=5 (needs listener rebuild on VM).
- Evidence: `.runtime/device-event-dup-20260817/per-active-device/`.

## 2026-08-17 - Device Events duplicated on Sync

- Status: `ROOT_CAUSED_AND_FIXED_LOCAL`.
- Screenshot 63,933 = live empty-person SDK taps + huge historical ledger, not four copies of one punch.
- Live extra rows: same ACS serial inserted again on `identity_repost` because `dedupeKey` includes `employeeNo` and serial fallback required a person + same source.
- Fix: serial-only match/update; Sync skip by serial; one ACS searchID; taxonomy/evidence stamps; Listener save + device name on socket.
- Proof: `.runtime/device-event-dup-20260817/FINDINGS.md`. Mocha serial/socket 16 green; app vitest 20 green.
- Existing 1,992 duplicate serial rows remain in DEV until a reviewed cleanup. New POSTs will collapse.

## 2026-08-13 - Timesheet Check In/Out from panel

- Status: `IMPLEMENTED`.
- Panel Check In → Time In. Panel Check Out → Time Out. Two Check Ins do not close the day.
- Fallback: no panel status → first/last punch.

## 2026-08-13 - Select Status copied (document + push)

- Status: `IMPLEMENTED_DOCUMENTED`.
- C++ POST + API extract + Device Events **Device status**. Pairing still first/later.
- Proof: serial 9619 ISAPI `checkIn`; listener rebuilt with `attendanceStatusPresent`.
- Spec: `docs/HIKVISION_SELECT_STATUS_MAPPING.md`.

## 2026-08-13 - Live biometric logs were silent (listener wrapper)

- Status: `REPAIRED_RUNTIME`.
- systemd `active` but no C++ process. Wrapper preferred outbox `:30108/health` then `POST /api/auth/login` **404**. Last SDK row before repair: 2026-08-12T14:05Z.
- Fix: drop-in `HIKVISION_PREFER_CALLBACK_OUTBOX=0` + API `53001`; restart listener. C++ running; E/D/B armed; new rows `receivedAt=2026-08-13T06:18:33Z`.
- A/F SDK login error 7. Select Status still not on SDK JSON.
- Evidence: `.runtime/biometric-silence-20260813-141526/FINDINGS.md`.

## 2026-08-13 - Vendor SDK setup has byAttendanceStatus (unread)

- Status: `INVESTIGATED_VM_HEADER`.
- Setup SDK = `EN-HCNetSDKV6.1.9.48` at `/home/infra/project-truth-hcnetsdk/.../incEn/HCNetSDK.h`.
- Header defines `byAttendanceStatus` on the **same** `NET_DVR_ACS_EVENT_INFO_EXTEND` the listener uses for `byEmployeeNo`.
- Not a wrong-vendor problem. Field unused. T&A mode not set by HRIS.
- Evidence: `.runtime/hikvision-status-audit-20260813/16-vendor-sdk-setup-investigation.md`.

## 2026-08-13 - Device status on biometric APIs (not pushed)

- Status: `API_AND_UI_DISPLAY_LOCAL_NOT_PUSHED`.
- `GET /api/device/events` returns `panelSelectStatus`. ACS list adds `hrisPanelSelectStatus`. Persist stamps `payload.panelSelectStatus`.
- Pairing/C++ unchanged. HEAD `f93adc5`. Do not push.

## 2026-08-13 - Device status column (display only, not pushed)

- Status: `DISPLAY_ONLY_LOCAL_NOT_PUSHED`.
- Device Events **Device status** reads `payload.AcsEventInfo.attendanceStatus` + `label`. Live SDK rows = Not sent. Pairing/C++ unchanged.
- Tests: `hikvision-panel-select-status.test.ts` 7 green. HEAD still `f93adc5`. **Do not push.**

## 2026-08-13 - Hikvision Select Status → HRIS audit

- Status: `AUDITED_NO_IMPLEMENTATION`.
- Panel Select Status is real T&A. Live `EN_HCNETSDK_ALARM` POST has **no** in/out field (0 / 32,489). ISAPI Sync can nest `attendanceStatus`+`label` (689 rows; 678 `checkIn`). HRIS pairing ignores it (first punch in, later out).
- C++ already has ACS extend pointer and only copies `byEmployeeNo`.
- ZK `attStateName` is also unused for pairing (time first/last).
- Documented, **not committed**: `docs/HIKVISION_SELECT_STATUS_MAPPING.md`, `.wwg/reports/hikvision-select-status-audit-20260813.md`, `.wwg/wiki/05-architecture/hikvision-select-status-attendance.md`.
- 10 reports: `.runtime/hikvision-status-audit-20260813/01`–`10` + `11-lead-synthesis.md`.
- RECs: `REC-20260813-HIKVISION-SDK-ATTENDANCE-STATUS-WIRE`, `REC-20260813-HIKVISION-SELECT-STATUS-HRIS-MAP`.

## 2026-08-13 - Device 5 reverse tunnel (192.168.1.136)

- Status: `LIVE_AND_TRUTH_SYNCED`.
- Device 5 `cmsq47r9t0039vxbwt9rfxk68` = physical `192.168.1.136:80` on PC Wi‑Fi `192.168.1.116`.
- Reverse: `ssh-reverse-forward` → VM `127.0.0.1:59443` (HTTPS/ISAPI) and `127.0.0.1:59000` (SDK).
- Proof: host TCP open; VM listeners `59443`/`59000`; pack ISAPI `401` on `58480`; local quick health `online`.
- STALE: TEST A at `192.168.254.102` and TEST A owning `59000`/`59443`. Live TEST A `.109:58080`, TEST B `.110:58180`.
- Evidence: `.runtime/device5-reverse-20260813-005641/`.

## 2026-08-12 - BNPI OT rate always 313 (not source-daily ≤700)

- Status: `FIXED_LOCAL_CLONE`.
- Problem: ~397 employees with matching OT **hours** used
  `periodBasic/regularDays` OT rate when that daily ≤ ₱700, so app OT pay ≠
  pure BNPI `periodBasic×24/313/8×1.25`.
- Fix: `resolveBandaiApprovedBucketRateBasis` always `BNPI_DIRECT_313_APPROVED_BUCKETS`
  for approved-bucket OT/premium pay. Source daily kept diagnostic only.
- Proof: `.runtime/ot-rate-proof-20260812/` — after fix, hours-matched BNPI OT
  self-consistency **719/719** (was 322/719). Sheet2 OT mismatches may increase
  where file uses ~₱93.75/hr (operator chose BNPI, not Sheet2 OT $).
- Absent policy unchanged: empty biometrics = full-day ABSENT.
- Tests: `tests/bandai-ot-rate-basis.spec.ts` (3) green.
- Scan after: `.runtime/payroll-scan-after-ot-rate-20260812/`.

## 2026-08-12 - Attendance Step1 WorkSharing+late applied; Step2 no false absents

- Status: `STEP1_APPLIED_LOCAL_CLONE` / `STEP2_PROBED_NO_WRITES`.
- Period `PP-20260626-20260711`: re-imported WorkSharing day flags (9114 overrides
  updated) and recomputed late/EO/UT + scheduleSnapshot on **9785** PRESENT/INCOMPLETE lines.
- **Rio 01360:** late minutes **183→0**, UT/Late-Amt **277.72→0**, Gross **12591→12869**;
  Jul 4 remains ABSENT (no punches in biometrics file or DB) — true absence.
- **Alexa 01792:** multi-day late collapsed; shortfall still ~₱420.41 (late 2:55 + EO 2:35)
  ≈ prior near-tally residual vs target ~419.64.
- Step2 tool `repair-period-false-absent-from-punches.ts`: **1597** ABSENT all have
  **zero** punches on line/attendance → bucket A = 0; no status flips.
- Evidence: `.runtime/attend-repair-20260812-093657/REPORT.md`.

## 2026-08-11 - Mass-upload apply gaps closed (COMP/DED present data)

- Status: `FIXED_LOCAL_CLONE` for mass-upload **present→apply** path.
- Scope: Jun 26–Jul 10 compensation + deduction mass upload only (not target file).
- Before: multi-row ABS last-write-wins; 00147 double installments; loan source codes null.
- After live re-measure: **apply-gap rows = 0** (all mass COMP/DED codes match payroll sources).
- Code: sum multi-row COMP import; installment dedupe + amount refresh; loan DEDCODE on sources.
- Evidence: `.runtime/mass-upload-apply-gap-20260811/FINDINGS.md`, `repair-apply.json`.
- Still open for fleet target unmatch: attendance/late/WS, target-only lines, OT pay rate.

## 2026-08-11 - BNPI Jun 26–Jul 10 full payroll tally investigation

- Status: `INVESTIGATED_NOT_FLEET_TALLIED` (no fleet money fix claimed).
- Period: `PP-20260626-20260711`. Compared **818** app preview rows vs **860**
  target Sheet2 rows (unlocked payroll computation workbook).
- **Fleet money:** only **4** exact tallied (`00269`, `00344`, `01687`, `01729`);
  **1** Alexa-near (`01792`, Δ TotalReceivable **−₱0.77** late residual);
  **346** OT match only; **463** unmatch. ~81% \|Δ Total\| > ₱500.
- **Alexa (01792):** OT + absent match after BNPI 313 / OT bucket path; late +0.77.
- **Rio (01360):** OT/AON/PFA/MLA/HDMF SL match; absent/late/DMA/RCBC/SSS/tax far
  (Δ Total **+₱2,195.73**). WorkSharing overrides exist; line schedules often not rebuilt.
- **No. of Days always fails (818/818):** **code definition**, not universal biometrics
  failure. Target = sum `approvedBuckets.regularDays`; app = non-`REST_DAY` line count
  (includes ABSENT). Alexa 9 vs app 13 (buckets=9); Rio 12 vs app 13 (buckets=12).
- **Fixing day-count alone does not tally payroll** (display/definition; money gaps elsewhere).
- Evidence pack: `.runtime/full-tally-20260811/FINDINGS.md` (master),
  `summary.json`, `compare.csv`; Rio `.runtime/rio-tally-20260811/`;
  WWG report `.wwg/reports/bnpi-june26-jul10-payroll-tally-20260811.md`.
- Open recommendations: REC-20260811-PAYROLL-NUMBER-OF-DAYS-BUCKETS,
  REC-20260811-PAYROLL-WS-LINE-REBUILD, REC-20260811-PAYROLL-PERIOD-PIN-ENROLLMENTS.

## 2026-08-07 - Preview Payroll modal parity with Start Payroll

- Status: `IMPLEMENTED_LOCAL`.
- `/hr/run-payroll` **Preview Payroll** now opens a multi-step modal aligned with
  Start Payroll: confirm → progress → results + employee detail, with **Preview only**
  chrome and no writes.
- API: `calculateRows=true` on timesheet payroll preview for full dry-run row amounts.
- Tests: `hris-app/app/lib/utils/payroll-preview-modal.test.ts` green.
- Evidence: `.runtime/preview-payroll-modal-20260807-140641/`.
- Open: browser Playwright proof when a period has approved timesheets with amounts;
  optional Phase B extract of shared Payroll summary panel with live management.

## 2026-08-05 - Benefits Management full-height table standard

- Status: `IMPLEMENTED`.
- `/hr/benefits-management` now uses `AdminTablePageShell` + `containedScroll`
  so the table fills remaining main-pane height like admin list tables.
- Unified layout gains viewport-fill via `isUnifiedViewportFillPath` for HR
  dense list routes (benefits-management, benefit-types, activity/audit logs,
  settings/documents). Create path `/hr/benefits-management/new` stays page-scroll.
- Durable standard documented in `DESIGN.md`,
  `.grok/rules/05-datatable-full-height.md`, `AdminTablePageShell` JSDoc,
  terminology. Always: viewport-fill path + shell + `containedScroll`.
- Tests: `unified-viewport-fill.test.ts` + admin viewport-fill tests green.

## 2026-08-04 - DM3 compensation/deduction detailed import results + history

- Status: `IMPLEMENTED_LOCAL_CLONE_PROVEN`.
- Problem: mass upload UI only showed success/failed counts; no failure why and
  no durable history.
- Backend: `MassUploadImportLog` model + SQL
  `20260804_add_mass_upload_import_logs.sql`; service returns row-level
  `errors`/`results` and persists logs; list/detail/CSV routes under
  `/api/migration/dm3/mass-upload-imports*`.
- Frontend: DM3 modal keeps open with failure/success tables; Import history
  panel on compensation/deduction section.
- Local DB truth: table applied on `hris-local-dev-clone` `127.0.0.1:5433`
  (user local runtime via `npm run dev:local`). Not applied to VM shared DEV.
- Live proof: compensation upload 2/2 failed with messages
  `Missing COMCODE` and `Employee 99999 was not found.`; history row
  `cmseb02uw0010vg2w4ca1pcx9` linked to migration run
  `cmryj0vpm00huvgaks2t2js57`.
- Tests: 8 mass-upload helper/summary specs passing.
- Operator: hard-refresh DM3 page after app rebuild if UI lagging; API already
  serving new routes on local clone.

## 2026-07-29 - Special Payroll one-time compensation (implemented)

- Status: `IMPLEMENTED_LOCAL_AWAITING_DB_MIGRATE`.
- Plan: `docs/00-product/AGENT-PROMPT-special-payroll-one-time.md`.
- Backend: Prisma models `SpecialPayrollRun|Line|Payslip`, routes under
  `/api/special-payroll/*`, pure normalization helper, create/release/cancel
  service with idempotency + once-per-period uniqueness. Does **not** touch
  regular `EmployeePayroll` generation.
- Frontend: secondary **Special Payroll** control on Run Payroll card; modal
  (Manual Entry + Mass Upload); employee history Special Payroll badge + detail
  route; special PDF helper.
- Validation: helper+service specs **10 passing**. Full API typecheck still has
  pre-existing unrelated errors; no special-payroll TS errors after
  `buildSuccessResponse(message, data)` fix.
- Open: apply `20260729_add_special_payroll_tables.sql` when DEV Postgres
  `127.0.0.1:55435` is up; Playwright/live API proof after migrate; truth doc
  polish in wiki terminology if product names need promotion.
- No confidential workbook was imported into the repo.

## 2026-07-28 - Shared observability recovered for PROD/DEV/UAT

- Status: `FULFILLED`.
- Prometheus has three paired API targets and nine app/API/employee probes up;
  Loki has current environment streams; Tempo returns all three API service
  names; OTEL refused/failed span counters are zero.
- Public authenticated Grafana Playwright passed four dashboards without
  no-data panels, datasource, page/console, or HTTP 5xx errors. Only optional
  Cloudflare `/cdn-cgi/rum` beacons aborted during navigation.
- Backup now creates atomic, checksum- and catalog-validated Grafana PostgreSQL
  dumps. Replacement rolling/full dumps validated before 29 quarantined
  invalid files and legacy tar/partial artifacts were irreversibly removed.
  Root usage fell from 81% to 53%.
- Tempo 2.6.1's recurring local poller/compactor race was reproduced and the
  runtime upgraded to supported 2.10.5 with vParquet4 preserved.
- CI through runtime revision `c0c00ee` passed. All six Argo applications were
  `Synced/Healthy`; Cloudflare remained enabled/active.
- Direct LAN SSH still times out from this host; `ssh project-truth-hris`
  works. Existing `REC-20260703-002` owns that drift.
- Evidence: `.runtime/observability-audit-20260728-142401/`.
- No new recommendations were identified.

## 2026-07-25 - Agent-owned blocker-fix overnight prompt (primary)

- Status: `JOB_CARD_READY`.
- **Primary prompt:**
  `docs/00-product/AGENT-PROMPT-overnight-agent-owned-blocker-fix-and-gap-burn.md`
- Explicit: UI “Exporting source credential” / owner scan incomplete = **code/export
  defect**, not physical action. Multi-agent root loop: preview→dryRun→write→match;
  fix gate/budget/unique-person; burn until unique face/FP + residual fall.
- Proven burn: residual 2813→~2k; unique face 690→~500; non-B FDLib rereads; FP
  still scan-gated. Fixes: `cec3b6f` preview, `39d5a7d` unique-person+retry budget.
- Evidence: `.runtime/overnight-gap-loop-20260725-075850/`.

## 2026-07-25 - Multi-agent gap loop executed (face burn proven)

- Status: `SUPERSEDED_AS_PRIMARY_SEE_BLOCKER_FIX_CARD` (still valid history).
- Stamp: `.runtime/overnight-gap-loop-20260725-075850/`.

## 2026-07-25 - Multi-agent overnight gap loop prompt ready

- Status: `EXECUTED_SEE_ABOVE`.
- Path:
  `docs/00-product/AGENT-PROMPT-overnight-multiagent-gap-loop-with-execution-preview.md`

## 2026-07-25 - Stable overnight gap-convergence job card ready

- Status: `SUPERSEDED_AS_PRIMARY_BY_MULTIAGENT_LOOP` (still useful companion).
- Path:
  `docs/00-product/AGENT-PROMPT-overnight-five-device-gap-convergence-stable-job.md`

## 2026-07-24 - Overnight biometric convergence in progress (live writes)

- Status: `IN_PROGRESS_WITH_PROVEN_FACE_AND_FP_PATH`.
- Runtime: K3s DEV on `project-truth-node`; write path proven under API SHA
  `5a2851c` then timeout-retry fix `ce93414` (CI `30105690726` success,
  API-only GitOps). Later docs commits may show `services=none` without
  wiping the rebuilt API image.
- Observability: Grafana `:53000` / Loki `:3110` / Prometheus `:9091` healthy
  after start; named `credential_recovery_write_progress` events for face and
  fingerprint (not bare Bad Request).
- Baseline plan: 3254 credentialWrites (FP 503 / face 2629 / card 122).
- **Verified this session (physical reread):** ~**429 face** + **2 fingerprint**
  → remaining **2823** (from 3254).
  - Face: FDLib picture import primarily A→B; B LOCALS faceURL 404 is
    cosmetic/half-success while model/FDLib reread passes.
  - Fingerprint proven: vendor **1616** F→B and **901** A→B stored template
    reread pass.
- Residual: face `target_write_unsupported` (FDLib capability on non-B);
  FP mostly `target_owner_scan_incomplete` (owner checksum exports). Prefer
  modality-scoped recovery jobs (unscoped jobs burn unimplemented card paths).
- Evidence:
  `.runtime/overnight-biometric-convergence-20260724-230000/STATUS.md`.
- Next: continue FP custody-only + canary when `fp_ready>0`; attest FDLib on
  non-B face targets; keep Main C / TEST A/B excluded.
- No new recommendations beyond continuing durable recovery overnight work.

## 2026-07-24 - DEV data cloned to UAT and PROD

- Status: `FULFILLED_WITH_PUBLIC_NETWORK_WARNING`.
- Backups first: all DEV/UAT/PROD pre-clone PostgreSQL custom dumps and upload
  archives passed SHA-256 verification and are retained under
  `/var/lib/project-truth/backups/dev-to-uat-prod-20260724-144222`.
- Execution: the verified DEV snapshot was restored independently into UAT,
  then PROD, with each target API writer stopped. DEV's 71 uploads were
  mirrored to both targets. Kubernetes secrets/config, shared DM source paths,
  GitOps manifests, devices, and Cloudflare configuration were not changed.
- Logical parity: all three environments report 75 tables, 2,225 employees,
  2,048 users, 34 departments, 8,680 documents, 42 workflow instances, 100
  workflow-step executions, 17 requests, 87,217 attendances, 10,965
  timesheets, 129,255 timesheet lines, 5,692 device users, and 20,374 device
  events. The 71-file upload set hash is identical in all three environments.
- Operational audit/login rows began diverging after environment-specific
  verification, as expected; business/workflow counts remained equal.
- Runtime proof: all six LAN app/API routes return 200; admin login and
  `/api/auth/me` pass as `hris-admin`; Playwright reached `/admin/dashboard`
  in PROD/DEV/UAT with zero console errors. All six Argo CD apps were
  `Synced/Healthy` at `3c831d8`; Cloudflare remained enabled/active.
- Public boundary: this BNPI workstation still gets TLS resets for all public
  HRIS hosts. With LAN/K3s/Argo/tunnel green, public reachability remains
  `NEEDS_CONFIRMATION` from an unfiltered external vantage, not a database
  restore defect.
- Full evidence and rollback hashes:
  `.runtime/dev-to-uat-prod-20260724-144222/REPORT.md`.
- No new recommendations were identified.

## 2026-07-24 - Credential recovery architecture truth and owner prompt

- Status: `DOCUMENTED_NOT_IMPLEMENTED`.
- Current truth: the Merge device users `Recovery queued` count is a
  planner/frontend classification, not a durable queue with a worker,
  heartbeat, or resume cursor. `Ready now 0` means no currently selectable
  reviewed raw-custody write, not that recovery is active.
- Operator screenshot baseline is historical only: 3,257 potential operations,
  505 fingerprint, 2,630 face, 122 card, ready 0, recovery queued 3,237, and
  headline physical action 20. Backend recovery stages reported physical
  identity action 18; the classification mismatch is `CONFLICTING`.
- Existing recovery primitive: exact selected biometric metadata backfill,
  replan, guarded merge write, then physical reread. Historical batches
  recovered 209/209 and 21/21 custody rows, but no current backend worker
  automatically performs that sequence.
- Architecture:
  `docs/00-product/HIKVISION_CREDENTIAL_RECOVERY_ARCHITECTURE.md`.
- Ordered no-assumption owner prompt:
  `docs/00-product/AGENT-PROMPT-durable-credential-recovery-and-live-gap-convergence.md`.
- Governance: proposed
  `REC-20260724-HIKVISION-DURABLE-CREDENTIAL-RECOVERY`. No runtime, database,
  device, deployment, or physical credential write was changed in this
  documentation pass.

## 2026-07-23 - Hikvision execution-location routing

- Status: `DEPLOYED_AND_PROVEN_WITH_PREEXISTING_ARGO_JOB_WARNING`.
- Safety: live merge job `bc087d4c-52f1-4df8-8455-2c9e1c0a3039` reached terminal `completed_with_attention` before watched API source changed: `194/194`, `102` success, `92` failed. No active worker was killed by this patch.
- Runtime contract: `windows-host` uses VM SSH plus reverse API `53001` and retains direct-LAN/Cloudflare fallback; native `vm-host` executes locally with no SSH; `vm-container` uses only the direct same-VM control target and VM-local environment API (`3001/3101/3201`), never the Cloudflare alias or Windows reverse API.
- K3s/Docker boundary: HCNetSDK remains managed by the VM host systemd service, so containers still require an internal same-VM SSH control hop. This is explicitly reported as `vm-container`, not mislabeled local.
- Runtime configuration: K3s PROD/DEV/UAT and VM Docker Compose now declare the execution location and correct environment API base; K3s PROD/UAT received the same read-only SSH-key mount already used by DEV.
- Observability: merge `vm_copy_attempt_started` progress events now include `runtimeLocation`, `commandTransport`, and `apiBase`.
- Validation: seven route-helper tests passed; combined Hikvision contracts passed `29`; API TypeScript passed; five YAML documents parsed without errors; restarted local API health passed. GitHub Actions run `29990599061` passed every validation step for commit `6fbcbff`.
- Deployment proof: VM ansible-pull synced exact commit `6fbcbff` with `failed=0`, rebuilt/imported the API image, and rolled DEV. The live pod contains the runtime-location code and reports `vm-container`, API base `http://127.0.0.1:3101`, readable direct-VM key, and successful internal direct SSH. VM API health and all DEV Deployments/StatefulSet are ready; `cloudflared-bnpi-hris.service` remained active. Evidence: `.runtime/hikvision-runtime-route-20260723-160450/`.
- Warning: Argo reports `Synced/Degraded` solely alongside the pre-existing six-hour-old failed `hris-api-db-init` Job; current API/app/employee-app/watcher/Postgres workloads are ready. The failed seed/schema Job was not deleted or rerun because that would be an unrelated database mutation.
- Recommendation: `REC-20260723-HIKVISION-VM-LOCAL-CONTROL-SERVICE`.

## 2026-07-23 - Correction: five-device physical truth and incomplete write

- Status: `NOT_FULFILLED_WRITE_NOT_EXECUTED`.
- Operator correction: exactly five Main Entrance devices are physically online and Main Entrance Device C is not. The prior quick-health result showing A-F transport-positive conflicts with this and must not be summarized as six online.
- Evidence correction: quick health proved a response through the configured transport/tunnel path; it did not prove current physical device identity, operator-room state, or full inventory readability.
- Completion correction: the prior loop generated a read-only plan and zero physical write requests. The actual merge job was not started, watched, repaired, or post-write verified.
- Required next execution is governed by `docs/00-product/AGENT-PROMPT-five-device-live-merge-root-cause-owner-loop.md`: root-cause the five-versus-six conflict, freeze exactly five excluding Main C, validate the plan, execute the authorized write, monitor logs/job to terminal, and reread all five targets.
- Every `Unauthorized`, `fetch failed`, timeout, or unknown result remains an open defect until correlated logs name the failing layer/root cause. Missing diagnostic detail is itself an observability bug.

## 2026-07-23 - Local DEV and Sync Center bounded green loop

- Status: `FULFILLED_WITH_REAL_DEVICE_BOUNDARY`.
- Runtime repair: canonical DEV startup now probes/restores K3s PostgreSQL `127.0.0.1:55435`, all A-F HTTP/HTTPS/SDK forwards, VM reverse callback/API `53001`, and listener dependencies through a single-flight structured watchdog. Optional TEST A/B bridge failures no longer block API startup. A documented restart completed healthy in 18.4 seconds.
- Runtime proof: all 18 A-F ports carry TCP, VM `53001` curls host API health, Cloudflare stayed active, and listener reads were `running=true` three consecutive times in 4.453s / 0.589s / 0.404s.
- State/UX repair: TanStack Query owns listener/preview/per-device health state with AbortSignal propagation, cached data preservation, targeted refresh, independent per-device settling, and no premature `VM stopped`. Recoverable merge failures expose Retry availability and Refresh tunnels/status instead of a Close-only dead end.
- Merge contract repair: availability uses bounded per-device quick health, never missing quick-preview source counts. Full inventory uses two workers, does not retry deterministic authentication failures, retries a transient transport failure once, preserves partial results, and blocks writes when any selected device read failed.
- Browser proof: final read-only review settled in 142 seconds with 865 union IDs, 4 readable devices, 2 exact live-read failures, 2 offline TEST devices, and zero physical-write requests. The page emitted zero console errors and zero non-aborted failed requests. Screenshot: `.runtime/sync-center-dev-green-20260723-114317/browser-merge-final.png`; trace: `browser-merge-trace.zip`.
- Saved Events proof: persisted rows rendered before listener status settled and remained visible during background work; final screenshot shows 18,803 saved rows and a separate listener/tap-proof surface. Evidence: `browser-saved-events-independent.png` and `browser-critical-proof.json`.
- API evidence: `.runtime/sync-center-dev-green-20260723-114317/api-proof-final.json`; current quick health is A-F online, TEST A/B offline; preview completed in 8.299s; saved-event API reports 18,835 rows.
- Validation: API typecheck passed; focused backend contracts `30 passing`; focused Device Users/Device Events contracts `31 passing`; targeted frontend ESLint zero errors; `git diff --check` passed.
- Commit: implementation `59be99dff6e2acefce007c4c3ca07c3abad20967`, pushed to `develop`.
- Physical boundary: Main A-F are transport-online, but one bounded all-main plan had two full UserInfo read failures (`Unauthorized`/transport-class). The UI now reports that boundary and remains usable; no fake six-readable claim and no write was attempted. TEST A/B remain offline.
- Recommendation capture: `REC-20260721-HIKVISION-API-REVERSE-ENSURE-BUG` is now implemented. No new recommendations were identified.

## 2026-07-22 - Merge listener truth and TEST A/B boundary

- Status: `PARTIALLY_FULFILLED_WITH_REAL_DEVICE_BOUNDARY`.
- Task mode: mixed live runtime recovery, listener-status UX hardening, and merge-plan evidence.
- Runtime truth: API and frontend were both recovered locally; admin login works; DEV DB forward `127.0.0.1:55435` is open; `.20/.21/.22/.23` tunnels remained active; Cloudflare was not disabled.
- Merge job truth: original job `a9d3acf7-7dee-406a-9198-c413fbd699d4` is not pollable after API restart. Completion was not invented.
- Valid current reread for the four production LAN devices `.20/.21/.22/.23`: `unionUsers=698`, `sourceRows=2759`, `dedupedDeviceRecords=2759`, `conflicts=862`, `missing=33`, `missingHrisLinks=47`, `plannedWrites=2094`, `errorCount=0`.
- Current six-device reread remains invalid for final counts: after adding host-local forwards for TEST A/B, the plan still had TEST A and TEST B `fetch failed` plus one Main Entrance Device A `Unauthorized` sample. Its counts are diagnostic only.
- TEST A/B boundary: Windows and VM physical probes cannot reliably reach TEST A/B on normal HTTP/SDK ports; TEST A clean SDK retry still gives login `lastError=9`. TEST B isolated employee `9` peer copy succeeded earlier with two fingerprint templates and no face bytes, but TEST B cannot be treated as generally six-device-reread healthy.
- UI repair: listener modal now waits `15s` for VM status and separates HRIS post failures from SDK login failures. Browser proof shows `0 receiving / 1 armed / 1 login failed`, Main B armed, TEST A login failed, and `HRIS callback post failed after reading 10.184.37.20` instead of false Main B SDK-login blame.
- Evidence:
  - Browser listener modal: `.runtime/merge-users-final-run-20260722-042955/browser-listener-modal-live-20260722-145705/`.
  - Valid four-device plan: `.runtime/merge-users-final-run-20260722-042955/fresh-four-device-plan-current-20260722-144103/`.
  - Invalid six-device diagnostic plan: `.runtime/merge-users-final-run-20260722-042955/fresh-six-device-plan-after-host-forward-20260722-143756/`.
  - TEST A/B host-local forward proof: `.runtime/merge-users-final-run-20260722-042955/testab-host-local-forward-20260722-143736/`.
- Validation: API typecheck passed; Hikvision biometric sync contract passed (`16` passing); Device Users UI contract passed; targeted ESLint for `events.tsx` and `enroll.tsx` exited `0` with existing warnings only; `git diff --check` had CRLF warnings only.
- Boundary: do not claim all `852` unique IDs or the current six-device diagnostic unique IDs are fully synced; do not claim fingerprint/face bytes are fixed from counts; do not start a blind six-device retry until TEST A/B HTTP reread and TEST A SDK login are repaired or explicitly excluded.
- Recommendation capture: No new recommendations were identified.

## 2026-07-22 - Main Entrance A-F (.20-.25) six-device tunnel repair

- Status: `COMPLETE_LOCAL_AND_K3S_DEV_HEALTH_PROOF`.
- Task mode: live runtime reachability + tunnel bootstrap repair (no product code change required).
- Root cause: K3s DEV Device rows for Main Entrance A-F already pointed at `10.184.37.20-.25` with credentials; VM TCP `80/443/8000` was OK for all six. Windows host cannot reach those IPs directly. Local health only saw four devices because the live SSH tunnel and `PROJECT_TRUTH_HIKVISION_TUNNEL_MAP` stopped at `.23` (ports for `.24/.25` were closed).
- Repair: restarted `scripts/start-hikvision-remote-device-tunnel.ps1` with DeviceIps `.20-.25`; all 18 local forwards TcpOk; env map updated in `hris-api/.env.development.local`.
- Local API health (`localhost:3001`): A-F all `online` via `env_tunnel_map` (E=.24, F=.25 included).
- K3s DEV LAN API (`10.184.37.19:3101`): A-F all `online` via `resolved_runtime_endpoint`.
- psql (K3s DEV): A=`10.184.37.21`, B=`.20`, C=`.22`, D=`.23`, E=`.24`, F=`.25`; all have access username+password keys.
- Boundary: TEST A/B (`192.168.254.109/.110`) remain a separate reverse-bridge lane; not part of this six-device tunnel map. Cloudflare tunnel left active.
- Evidence root: `.runtime/device-a-f-reach-20260722-143906/`.
- Bootstrap: `npm run dev` ensure path already defaults to six IPs in `ensure-hikvision-remote-device-tunnel.cjs`; re-run tunnel script if a stale four-device tunnel is still bound.
## 2026-07-22 - Merge Users Overnight Loop Terminal Evidence

- Status: `PARTIALLY_FULFILLED_WITH_REAL_DEVICE_BOUNDARY`.
- Task mode: mixed live runtime ownership, backend merge-job repair, admin UX hardening, and evidence handoff.
- Runtime truth: local API is healthy after restart, admin login works, DEV DB forward remains `127.0.0.1:55435`, and the `.20/.21/.22/.23` Hikvision tunnels remain active. Cloudflare was not disabled. The optional TEST A/B listener/bridge helper still reports a recoverable 502/SSH issue, but API/DB/four-device tunnels are healthy.
- Job truth: fast retry job `8498a8cf-81a8-42b1-b836-6f77ca9323ca` reached `processedWrites=2813/2813` before reread/finalize failed with `Cannot read properties of undefined (reading 'counts')`. The last honest processing poll showed `successfulWrites=366` and `failedWrites=2447`; the terminal failed payload collapsed failed writes and must not be used as copy-row truth.
- Fresh backend truth after restart: the six-device merge plan returned `852` unique IDs, `3715` source/device records, `needsDecisionIds=0`, `4260` all planned writes, `1235` conflicts, `1397` missing, and `51` missing HRIS links. This proves the original selected Needs-decision scope was consumed/resolved, but it does not prove all six devices are synced.
- Fresh four-device truth for the VM-reachable `.20/.21/.22/.23` devices returned `687` unique IDs, `2748` source/device records, `needsDecisionIds=0`, `2061` all planned writes, `952` conflicts, `0` missing, and `47` missing HRIS links. This narrows the remaining device-record missing issue to TEST A/B participation in the six-device scope, but the four-device conflicts/link gaps still need reviewed handling.
- Backend repaired: reread finalization now accepts the actual plan shape instead of crashing on `counts`; failed jobs preserve latest processed/success/failed counts; progress/list responses expose grouped copy failure summaries; VM manual-copy SDK preflight/spec generation bypasses the Windows-local tunnel map and uses physical saved endpoints for VM-side copy.
- Failure pattern: capped progress evidence deduped `213` copy-error events, led by D to C (`35`), D to A (`33`), and D to TEST B (`31`). Root samples included timeout circuit skips and `VM cannot reach 127.0.0.1:18003 before SDK login`, which the resolver patch addresses for `.20-.23`.
- VM SDK reachability proof: `ssh project-truth-hris` showed `.20/.21/.22/.23:8000` OK, while TEST A/B `192.168.254.109/.110:8000` failed. A blind six-device retry is not safe.
- UI proof: Playwright with a stubbed failed job response verified the modal shows locked scope, `569` selected unique IDs, `2,845` peer copy attempts, grouped copy failures by path, no editable review controls, and no `Preview only` wording while a job exists.
- Validation: API typecheck passed; `hris-api/tests/hikvision-biometric-sync-contract.spec.ts` passed (`16` passing); Device Users UI contract passed; targeted `enroll.tsx` ESLint had `0` errors with existing warnings only.
- Evidence root: `.runtime/merge-users-final-run-20260722-042955/`.
- Important boundary: do not claim all `852` unique IDs are fully synced; do not claim fingerprint/face bytes are fixed from counts; do not retry the six-device job blindly until TEST A/B VM SDK reachability or a scoped non-TEST remaining plan is explicitly reviewed.

## 2026-07-22 - Merge users unique-row frontend drift repair

- Status: `COMPLETE_LOCAL_API_AND_STATIC_UI_PROOF`.
- Task mode: Focused admin UX truth repair.
- User symptom repaired:
  - In Merge device users, clicking `Needs decision` showed repeated selectable rows for the same vendor user ID because the frontend rendered raw issue rows. This contradicted the Project Truth requirement that selectable merge rows are one unique device/vendor person ID.
- Implementation:
  - `hris-app/app/routes/admin/devices/enroll.tsx` now renders `mergeList=issues` from `sdkMergeReviewRows`, which are unique-ID rows, while resolving filter/device scope through the underlying issue rows.
  - Filter chips and per-device impact counts use unique user-key counts (`sdkMergeUniqueIssueCount`, `sdkMergeUniqueIssueDeviceCount`) instead of `sdkMergeRows.length`.
  - The raw conflict/credential issue rows remain available through the per-row `Review sources` drilldown.
  - The stale/dead `sdkMergePreviewOnly` gate was replaced by a `Review selected merge` confirmation modal. The first modal is planning/review; the second modal is the final real-write confirmation.
- API proof:
  - Evidence root: `.runtime/merge-users-review-confirm-20260722-032110/`.
  - Non-mutating admin merge plan returned 4 selected Hikvision devices, 687 unique IDs, 2,748 device ID records, 0 duplicate unique keys, 0 blocking read errors, and 2,061 potential device writes.
- Validation:
  - `npm exec -- vitest run app/routes/admin/devices/device-user-ui-contract.test.ts`: passed.
  - `npx tsx node_modules/mocha/bin/mocha --no-config tests/device-user-merge.helper.spec.ts`: 12 passing.
  - `npx eslint app/routes/admin/devices/enroll.tsx --max-warnings=999`: 0 errors, existing warnings only.
  - `git diff --check -- hris-app/app/routes/admin/devices/enroll.tsx hris-app/app/routes/admin/devices/device-user-ui-contract.test.ts`: no whitespace errors; CRLF warnings only.
  - App-wide frontend typecheck still fails on unrelated existing drift across guide/calendar/examples/leave/TimesheetsTab and other non-device files.
- Recommendation capture: No new recommendations were identified.

## 2026-07-21 - Sync Center Needs link click rows

- Status: `COMPLETE_LOCAL_API_AND_BROWSER_PROOF`.
- Task mode: Focused admin UX regression repair.
- User symptom repaired:
  - In Sync Center > Device Users, clicking the `Needs link` count for Device C opened an empty table even though the metric showed 46 rows requiring employee links.
- Implementation:
  - `hris-app/app/routes/admin/devices/enroll.tsx` now sets `deviceUserStatus=UNMATCHED` when the `open` / `Needs link` view is selected from the metric cards.
  - The source-scoped Device Users optimization is limited to `shown` and `source` views, so `open` and `linked` views use saved HRIS `DeviceUser` truth.
  - `hris-app/app/routes/admin/devices/device-user-ui-contract.test.ts` guards the routing/filter contract.
- API proof:
  - Evidence root: `.runtime/sync-center-needs-link-click-20260721-133728/`.
  - Admin `GET /api/device/cmripjwbx00ewl001ihcke210/users?limit=50&status=UNMATCHED` returned `rowCount=46`, `summary.unmatched=46`, and sample rows all had `status=UNMATCHED`.
- Browser proof:
  - Evidence root: `.runtime/sync-center-needs-link-click-browser-20260721T053934Z/`.
  - Headless Playwright clicked Device C `Needs link: 46`, verified final URL `deviceUserView=open&deviceUserStatus=UNMATCHED`, saw the network request with `status=UNMATCHED`, and confirmed the table showed `1 - 8 of 46` with no `No device users found for this view.` empty state.
- Validation:
  - `npm exec -- vitest run app/routes/admin/devices/device-user-ui-contract.test.ts`: passed.
  - `git diff --check`: passed with CRLF normalization warnings only.
- Recommendation capture: No new recommendations were identified.

## 2026-07-21 - Device-user link employee picker and padded-ID proof

- Status: `COMPLETE_LOCAL_API_AND_BROWSER_PROOF`.
- Task mode: Mixed admin UX regression repair and device-user/employee matching proof.
- User symptom repaired:
  - In the Link device user modal, the employee dropdown did not visibly open from inside the modal and could not reliably search the full employee list for expected padded employee codes such as vendor `989` -> employee `00989`.
- Implementation:
  - `hris-app/app/components/ui/popover.tsx` now renders popover portals above the custom modal shell/backdrop.
  - `hris-app/app/routes/admin/devices/enroll.tsx` uses the async `EmployeePickerSelect` for manual device-user linking instead of a preloaded 1000-row `SearchableSelect`.
  - `hris-app/app/components/molecules/employee/EmployeePickerSelect.tsx` includes `deviceEmpId` in requested fields and shows it in option metadata.
  - `hris-api/tests/device-user-sync.helper.spec.ts` now explicitly covers padded employee-code fallback for `21 -> 00021` and `989 -> 00989`.
- API proof:
  - Evidence root: `.runtime/device-user-link-selector-20260721-123032/`.
  - `employee-picker-search-proof.json`: admin search for `21` returned `00021` / `deviceEmpId=21`; search for `989` returned `00989` / `deviceEmpId=989`.
  - `device-user-padded-link-dryrun-proof.json`: saved DeviceUser rows on the current four Hikvision devices show vendor `21` linked to employee `00021` and vendor `989` linked to employee `00989`.
- Browser proof:
  - Evidence root: `.runtime/device-user-link-selector-playwright-20260721-043453/`.
  - Playwright opened Device Users for vendor `989`, opened the Link device user modal, opened the employee picker above the modal, typed `989`, and verified `00989` was visible. Screenshot: `link-modal-employee-picker-989.png`.
- Validation:
  - `npx tsx node_modules/mocha/bin/mocha --no-config tests/device-user-sync.helper.spec.ts`: `11` passing.
  - `npm exec -- vitest run app/routes/admin/devices/device-user-ui-contract.test.ts`: passed.
  - `npx tsc --noEmit --pretty false --incremental false --listFiles false` in `hris-api`: passed.
  - `git diff --check`: passed.
  - Frontend broad `npx tsc -p tsconfig.test.json --noEmit --pretty false` still fails on unrelated existing `TimesheetsTab.test.tsx` React Query mock drift already tracked by `REC-20260706-TEST-TYPECHECK-MOCKS`.
- Recommendation capture: No new recommendations were identified.

## 2026-07-21 - Hikvision faceURL 404 raw-custody sanitization

- Status: `COMPLETE_LOCAL_BROWSER_PROOF`.
- Task mode: Bug fix with backend custody safety and admin UX repair.
- User symptom repaired:
  - Device-user sync status for Main Entrance Device C showed raw Hikvision `404 -- Not Found` HTML from `/LOCALS/pic/enrlFace/...` in Recent missing raw / missing raw summaries, making it look like HRIS broke or like "no face" had been proven.
- Implementation:
  - `hris-api/helper/device-user-raw-fingerprint.helper.ts` classifies Hikvision faceURL binary responses before base64 conversion. HTML 404 becomes `face_image_not_found_on_device`, XML/401 becomes `face_image_unauthorized`, empty/tiny responses remain `face_binary_empty`, and other non-image HTML/XML/text responses become `face_binary_not_image`.
  - Non-image faceURL bodies are never stored as `rawFace`; the sync records short diagnostic reason/status/path evidence and continues other raw-custody tasks.
  - `hris-api/app/device/device.controller.ts` sanitizes live and persisted device-user sync failure reasons, aggregate `biometricFailureReasons`, result summaries, and failure logs.
  - `hris-app/app/routes/admin/devices/enroll.tsx` renders friendly reason labels and sanitizes legacy persisted aggregate messages before display.
- Runtime proof:
  - Evidence root: `.runtime/hikvision-face-404-sanitize-20260721-121324/`.
  - Current Device C job `1e7d9de2-7be8-460d-a031-d9fb3b0735b1` was reopened in the Sync Center status modal.
  - Final browser proof file: `browser-device-c-status-modal-after-summary-sanitize.json`.
  - Proof result: modal contained `Face image not found on device`; did not contain `<!DOCTYPE html>`, `<html>`, `Access Error: 404`, or `can't locate document`; run state was completed with `262` captured raw payloads and `270` missing raw reads still shown as review/repair items.
- Validation:
  - `npx tsx node_modules/mocha/bin/mocha --no-config tests/device-user-raw-fingerprint.helper.spec.ts tests/hikvision-biometric-sync-contract.spec.ts`: `24` passing.
  - `npx tsc --noEmit --pretty false` in `hris-api`: passed.
  - `npm exec -- vitest run app/routes/admin/devices/device-user-ui-contract.test.ts` in `hris-app`: `1` passing.
  - `git diff --check`: no whitespace errors; CRLF normalization warnings only.
- Recommendation capture: No new recommendations were identified.

## 2026-07-21 - Device-user merge unique-ID truth repair

- Status: `COMPLETE_LOCAL_API_PROOF_WITH_BROWSER_WARNING`.
- Task mode: Mixed backend correctness and admin UX truth repair.
- User symptom repaired:
  - The merge modal said `Unique IDs` while showing duplicate selectable rows such as `21, 21, 32, 32`, which made the merge count feel dishonest and made it unclear which row an admin should select.
- Implementation:
  - `hris-api/helper/device-user-merge.helper.ts` now groups merge rows by strict device/vendor person ID from live selected-device reads. Same `vendorUserId` always collapses to one merge row; saved HRIS manual employee links no longer collapse two different vendor IDs into one "unique ID" choice.
  - Duplicate source rows for the same device/user ID are collapsed before unique-ID counting, keeping the richest source row and reporting duplicate source evidence on the plan.
  - `hris-app/app/routes/admin/devices/enroll.tsx` now uses `Device ID records` for per-device/read rows, reports the unique list count as IDs, and shows duplicate-collapse copy only when the plan reports collapsed duplicates.
  - Frontend response types and focused contract tests were updated for `sourceRows`, `dedupedDeviceRecords`, and `duplicateSourceRows`.
- Runtime/API proof:
  - Evidence root: `.runtime/merge-strict-device-id-truth-20260721-113511/`.
  - API restarted successfully; final listener PID `9228`, `/health` status `healthy`.
  - Non-mutating admin `POST /api/device/hikvision/sdk-users/merge/plan` for the current four Hikvision target devices returned `uniqueDeviceIdCount=687`, `apiCountUnionUsers=687`, `sourceRowsFromDevice=2748`, `dedupedDeviceRecords=2748`, `duplicateSourceRows=0`, `hasDuplicateUniqueIdsShown=false`, and zero groups with more than one vendor ID.
- Validation:
  - Backend merge helper: `12` passing.
  - Backend typecheck: passed.
- Warning:
  - Browser automation could not complete login because the current `5175` frontend dev server rendered no login inputs in headless DOM for `/auth/login`; debug artifacts are in the same evidence directory. The merge endpoint proof is still valid and non-mutating.
- Recommendation capture: No new recommendations were identified.

## 2026-07-21 - Sync Center dry-run planner scope correction

- Status: `COMPLETE_LOCAL_API_AND_BROWSER_PROOF`.
- Task mode: Mixed admin UX truth repair, backend dry-run safety, and regression proof.
- User symptom repaired:
  - The status/review experience still made the sync feel like it was starting with a broad `Reading source users` step, and the earlier review panel could disagree with the actual job planner on raw-gap counts.
- Implementation:
  - `hris-api/app/device/device.controller.ts` now supports non-mutating `dryRun=true` on `POST /api/device/users/sync-jobs`; the response includes `willCreateJob=false`, `jobId=null`, `decisionMatrix`, and an `executionPlan`.
  - The job status lookup marks persisted `processing` jobs stale after API restart, preventing old saved statuses from masquerading as active workers.
  - `hris-app/app/routes/admin/devices/enroll.tsx` now uses the dry-run sync-job planner for `Review sync`, shows the same matrix counts the job will use, and uses scoped missing-work copy when source reread is skipped.
  - `hris-app/app/services/devices.service.ts` now types dry-run sync-job responses.
- API proof:
  - Evidence root: `.runtime/sync-center-dry-run-scope-20260721-112157/`.
  - `api-device-user-sync-dry-run-plan-final.json`: admin `admin@bandai.local` / `hris`, payload `{ mode: "needs_attention_only", deviceIds: ["cmpxw13hx002h7zwso7dyedrn"], dryRun: true }`, mutation `none_dry_run`, `7.586s`.
  - Result: `mode=dry_run`, `willCreateJob=false`, `jobId=null`, `selectedFastPlan=needs_attention_only`, `sourceReadRequired=false`, `sourceReadSkipped=true`.
  - Matrix counts: `missing_device_user_record=0`, `missing_employee_link=49`, `missing_raw_fingerprint_blob=106`, `missing_raw_face_blob=65`, `already_present=741`, `stale_count_only_or_live_no_data=0`, `unsupported_by_sync=0`.
  - Execution steps skip full source-user reread, process missing links only, capture missing fingerprint/face raw bytes only, and skip already-present rows.
- Browser proof:
  - `browser-sync-center-scoped-review-final.json` and `browser-sync-center-scoped-review-final.png`.
  - Browser verified `What Sync can fix`, `Missing employee links=49`, `Missing fingerprint raw blobs=106`, `Missing face raw blobs=65`, `Already present=741`, `Fastest valid plan: needs_attention_only`, `Saved-state first`, and absence of `Reading source device users`.
- Validation:
  - `npx tsx node_modules/mocha/bin/mocha --no-config tests/hikvision-biometric-sync-contract.spec.ts`: `15` passing.
  - `npx tsc --noEmit --pretty false` in `hris-api`: passed.
  - `npm exec -- vitest run app/routes/admin/devices/device-user-ui-contract.test.ts`: `1` passing.
  - Frontend repo-wide `npx tsc --noEmit --pretty false` still fails on unrelated existing app-wide type drift outside this Device Users surface.
- Warning:
  - The fast plan may still perform live raw-capture reads for the 106 fingerprint and 65 face candidate rows. It should not reread every source user first and should not process the 741 already-present rows by default.
- Recommendation capture: No new recommendations were identified.

## 2026-07-21 - Sync Center missing-record decision matrix handoff

- Status: `COMPLETE_LOCAL_PROOF`.
- Task mode: Mixed admin UX/performance feature and backend fast-path repair.
- Code changed:
  - `hris-api/app/device/device.controller.ts`: added Device Users sync decision matrix buckets, preview payload, job persistence fields, selected fast plan, source-read skip logic, and saved-state raw-custody skip.
  - `hris-app/app/services/devices.service.ts`: exposed matrix/job-stage types to the UI.
  - `hris-app/app/routes/admin/devices/enroll.tsx`: changed default job mode to `needs_attention_only`, added `What Sync can fix` bucket summary/filter view, selected plan display, and truthful stage copy.
  - Focused backend/frontend contract tests updated.
- API proof:
  - `.runtime/sync-center-decision-matrix-20260721-110520/api-sync-preview-decision-matrix-final.json`.
  - Main Entrance Device B (`cmpxw13hx002h7zwso7dyedrn`, `10.184.37.20`) returned `selectedFastPlan=needs_attention_only`, `sourceReadRequired=false`, `missing_employee_link=49`, `already_present=638`, and zero missing raw blobs in `3.818s`.
- Browser proof:
  - `.runtime/sync-center-decision-matrix-20260721-110520/browser-sync-center-review-modal.json`.
  - `.runtime/sync-center-decision-matrix-20260721-110520/browser-sync-center-review-modal.png`.
  - Browser verified `What Sync can fix`, all seven bucket/filter labels, `Fastest valid plan`, `Building missing-record matrix`, and absence of old `Reading source device users` wording.
- Validation:
  - `npx tsx node_modules/mocha/bin/mocha --no-config tests/hikvision-biometric-sync-contract.spec.ts`: `15` passing.
  - `npx tsc --noEmit --pretty false` in `hris-api`: passed.
  - `npm exec -- vitest run app/routes/admin/devices/device-user-ui-contract.test.ts`: `1` passing.
  - `git diff --check`: no whitespace errors; CRLF normalization warnings only.
- Warning:
  - Frontend broad `npx tsc -p tsconfig.test.json --noEmit --pretty false` still fails outside touched device scope at `app/routes/employee/dashboard/TimesheetsTab.test.tsx(54,46)`, already tracked by `REC-20260706-TEST-TYPECHECK-MOCKS`.
- Recommendation capture: No new recommendations were identified.

## 2026-07-21 - Four Hikvision devices online/armed handoff

- Task mode: Mixed live runtime repair, native listener regression repair, and evidence closeout.
- Evidence directory: `.runtime/hikvision-four-device-online-20260721-064751/`.
- Final runtime state:
  - Direct Windows-to-VM LAN SSH and TCP to `10.184.37.19` timed out, so the verified path used `ssh project-truth-hris`.
  - VM `cloudflared-bnpi-hris.service` stayed active and K3s stayed Ready.
  - VM direct device probes passed for all four target devices on TCP `80`, `443`, and SDK `8000`.
  - Host API reverse `VM 127.0.0.1:53001 -> Windows 127.0.0.1:3001` was restored and returned `/health`.
  - Managed `project-truth-hikvision-hot-reload-listener.service` is active again; temporary per-device listener units used during recovery were stopped.
- Final four-device truth:
  - `10.184.37.20` / Main Entrance Device B / `cmpxw13hx002h7zwso7dyedrn`: API health `online`; SDK login OK; armed; receiving callbacks; callback post success in VM log.
  - `10.184.37.21` / Main Entrance Device A / `cmrht5s2w00ei7zgsre8y3o5n`: API health `online`; SDK login OK; armed; receiving callbacks; callback post success in VM log.
  - `10.184.37.22` / Main Entrance Device C / `cmripjwbx00ewl001ihcke210`: API health `online`; SDK login OK; armed; receiving callbacks; callback post success in VM log.
  - `10.184.37.23` / Main Entrance Device D / `cmripjwkw00ffl0013lfxcbxw`: API health `online`; SDK login OK; armed; receiving callbacks; callback post success in VM log.
- Key evidence files:
  - `phase3-local-api-target-devices.json`: saved HRIS config rows for `.20`-`.23`.
  - `phase4-vm-device-network-fixed.txt`: VM TCP proof to all four devices on `80/443/8000`.
  - `phase6-vm-53001-after-simple-reverse.txt`: callback reverse `/health` proof.
  - `phase7-aggregate-per-device-log-proof.txt`: per-device login/arm/receive/callback log proof.
  - `phase10-final-api-health-listener-readiness.json` and `phase10-final-four-device-table.json`: final API health/listener/readiness proof.
  - `phase10-devices-page-findings.json` and `phase10-devices-page.png`: browser proof for `/admin/configuration/devices`.
- Code/runtime repair:
  - The deployed native listener source includes the session-vector race fix already present in the worktree: session mutex, safer callback host-to-device lookup, reserved session storage, and worker startup after initial arming.
  - This fixed source was copied to the VM listener source/work tree and rebuilt by the managed wrapper.
- Validation:
  - VM native C++ build passed with the Hikvision SDK.
  - Focused backend contract passed: `hris-api/tests/hikvision-biometric-sync-contract.spec.ts` (`14` passing).
  - Focused listener-status helper passed: `hris-api/tests/hikvision-listener-status.helper.spec.ts` (`10` passing).
  - Broad `npm --prefix hris-api test -- ...` accidentally expanded to the full suite and failed on unrelated existing suite drift plus stale compose DB `10.184.37.19:15433`; use the focused rerun artifacts for this task.
- Remaining warning:
  - `scripts/ensure-device-live-path.ps1` failed to start the API reverse bridge because `Start-Process -ArgumentList` received an object array. The reverse was started manually and proven; recommendation `REC-20260721-HIKVISION-API-REVERSE-ENSURE-BUG` captures durable hardening.

## 2026-07-20 - Device Events saved view fast/truthful listener UX handoff

- Task mode: Mixed admin UX/performance regression repair.
- User symptom repaired:
  - `/admin/configuration/devices/events?view=saved` felt stale/slow because saved ledger truth, device health, listener armed state, and live receiving proof were collapsed in the UI.
  - Armed-but-quiet listener proof now reads as `Ready for tap proof`, not `Live path needs proof` or `not checked for a long time`.
- Implementation:
  - `hris-api/app/device/device.controller.ts`:
    - `GET /api/device/:id/health?quick=true` now uses bounded TCP reachability (`tcpReachability`) and skips slow Hikvision system-time/source-count reads.
    - Hikvision listener status prefers direct LAN SSH first, uses one bounded VM read, and caches status briefly for readiness/listener consumers.
  - `hris-api/helper/device-live-readiness.helper.ts` and `hris-app/app/lib/device-live-readiness-shared.ts`:
    - Armed-but-quiet/no-fresh-tap state is yellow `Ready for tap proof`; DB ok + armed listener is safe to tap but not safe to enroll until fresh receiving/post proof exists.
  - `hris-app/app/routes/admin/devices/events.tsx`:
    - Saved ledger render is independent of background listener/proof checks.
    - Added separate quick device-health summary with copy: `Reachability is separate from listener armed state and tap proof.`
  - Frontend device service/hooks now pass `quick=true` and short client timeouts for saved-view health summaries.
- Runtime proof:
  - Evidence dir: `.runtime/device-events-stale-fast-20260720-211150/`.
  - API timing summary:
    - saved rows `2.629s`, saved facets `1.924s`, exact device list `0.561s`.
    - listener status cached repeat exposed `cache.hit=true`, TTL `5000ms`.
    - quick health server durations for sampled devices: `1327ms`, `1214ms`, `1ms`, `0ms`; all used `provenBy=tcpReachability`.
  - Browser proof:
    - `.runtime/device-events-stale-fast-20260720-211150/browser/playwright-settled-clean-result.json`.
    - Settled page showed saved rows for the current saved-ledger filter.
    - Clean follow-up proof showed the new health strip as `4 online / 0 degraded / 3 offline` followed by `/` and the reachability separation copy.
    - Page text included `Ready for tap proof` and saved rows.
    - Page text did not include `Live path needs proof` or `not checked for a long time`.
- Validation:
  - Backend typecheck passed: `npx tsc --noEmit --pretty false --incremental false --listFiles false`.
  - Backend focused tests passed: `25` passing for listener-status helper, readiness, listener fast-path, and quick-health contracts.
  - Frontend focused contract passed: `12` passing for `app/lib/device-events-page-contract.test.ts`.
  - Frontend `npx tsc -p tsconfig.test.json --noEmit --pretty false` still fails on unrelated existing `app/routes/employee/dashboard/TimesheetsTab.test.tsx` `UseQueryResult` fixture drift.
- Worktree note:
  - `hris-api/tests/device-log-sync-targeted.contract.spec.ts` had pre-existing unrelated edits and was not changed for this repair.
- Recommendation capture: No new recommendations were identified.

## 2026-07-20 - Remote local-dev Hikvision tunnel handoff

- Task mode: Focused local-dev runtime access repair.
- Implemented:
  - `PROJECT_TRUTH_HIKVISION_TUNNEL_MAP` now lets local `hris-api` route Hikvision HTTP/ISAPI and SDK probes through localhost SSH forwards while preserving the saved device address shown in HRIS.
  - `scripts/start-hikvision-remote-device-tunnel.ps1` starts forwards for Main Entrance Device A `10.184.37.21` on HTTP `80`, HTTPS `443`, and SDK `8000`, and writes the ignored local API env override into `hris-api/.env.development.local`.
  - `hris-api/scripts/ensure-bnpi-db-access.cjs` preserves that tunnel-map env line when it regenerates local DB overrides.
- Runtime proof:
  - Tunnel proof saved to `.runtime/hikvision-remote-device-tunnel-last.json`: PID `17684`, TCP OK on `127.0.0.1:10080`, `127.0.0.1:10443`, and `127.0.0.1:18000`.
  - Local API health proof saved to `.runtime/remote-device-tunnel-proof-20260720-161455/device-a-health-with-tunnel-map.json`: Main Entrance Device A returned `summary.status=online`, `device.address=10.184.37.21`, `baseUrl=https://127.0.0.1:10443`, `network.source=env_tunnel_map`, and `deviceApi.provenBy=systemTime`.
  - Browser proof saved to `.runtime/remote-device-browser-proof-20260720082234/summary.json`: `localhost:5175/admin/configuration/devices` showed Main Entrance Device A and `Online`; device health API responses were HTTP 200.
- Validation:
  - Focused backend tests passed: `6` passing for `device health helper` and `hikvision client endpoint resolution`.
  - `hris-api` `npx tsc --noEmit --pretty false` passed.
- Boundary:
  - `ssh project-truth-hris` from the current network reset through Cloudflare edge during this session. The helper therefore used direct LAN fallback `infra@10.184.37.19` for proof. Far-away usage depends on Cloudflare Access SSH being reachable from that network.
- Recommendation capture: No new recommendations were identified.

## 2026-07-20 - TEST A zero-missing recovery boundary handoff

- Task mode: Agent-owned live biometric recovery attempt, truth classification, and UI clarity repair.
- Evidence: `.runtime/test-a-zero-missing-raw-recovery-20260720-113320/`.
- Runtime/API evidence:
  - Local API was restarted with `HIKVISION_RAW_BIOMETRIC_SYNC_CONCURRENCY=1` and health saved in `api-health-after-concurrency1-restart.json`.
  - Raw-only job `48f654ff-8ed0-4ccb-8470-8f51d9654dbb` completed for TEST A: `136` missing credentials processed, `0` captured, `938` cached, `136` failed.
  - Failure reasons remained explicit: `no_face_on_device` and `no_fingerprint_data_from_device`.
- SQL evidence:
  - `raw-sql-before.json` and `raw-sql-after.json` match after recovery.
  - Current custody remains `394` DeviceUser rows; `348` raw-ok/not-enrolled rows; `45` rows missing both fingerprint and face raw; `1` row missing fingerprint raw only.
  - Fingerprint custody remains `718` inventory slots / `628` raw stored / `91` raw missing; face custody remains `356` inventory / `311` raw stored / `45` raw missing.
- Direct live capture evidence:
  - `direct-capture-samples-summary.json` covers visible/prior rows `83`, `839`, `984`, `1008`, `1076`, and `1143`.
  - All six fingerprint captures returned HTTP `422`, `status: "error"`, `no_fingerprint_data_from_device`.
  - All six face captures returned HTTP `422`, `status: "error"`, `no_face_on_device`.
- Device probe evidence:
  - `deep-isapi-fingerprint-probe-summary.json` proves control user `1004` still returns bytes through the same read path (`13` hits across probe shapes).
  - Missing users `8`, `83`, and `984` returned `0` hits across `54` probe attempts each, so no parser/probe code bug was proven for the remaining rows.
- Code/UI changes:
  - No new raw blob recovery code was justified by the live evidence.
  - `hris-app/app/routes/admin/devices/enroll.tsx` now distinguishes inventory counts from raw stored bytes in the sync review modal and states that no blobs are fabricated.
- Validation:
  - Backend focused tests already passed with the no-data contract fix: `20` passing.
  - Backend `tsc --noEmit --pretty false` passed.
  - Targeted frontend ESLint on `enroll.tsx` passed with existing warnings only.
  - Frontend `typecheck:test` remains blocked by unrelated existing `TimesheetsTab.test.tsx` `UseQueryResult` fixture type drift.
  - Same-environment Playwright saved `playwright-modal-copy-proof.png`, `playwright-modal-copy-proof.txt`, `playwright-modal-copy-network.json`, and `playwright-modal-copy-summary.json`; the summary confirms the modal shows `inventory vs raw`, `inventory enrolled`, `raw no-data/missing`, and `no blobs are fabricated`.
- Remaining boundary: zero missing raw blobs cannot be truthfully reached from the current panel reads. The remaining missing values are stale/count-only inventory claims unless the physical panel is re-enrolled/refreshed or a different verified device-side export path returns actual raw bytes.

## 2026-07-20 - TEST A missing raw root-cause follow-up handoff

- Task mode: Focused biometric custody root-cause repair and API contract truth repair.
- Evidence: `.runtime/test-a-missing-raw-root-cause-20260720-111215/`.
- Raw SQL proof:
  - TEST A `cmrlgqsjv000oob01165tbd8n` remains the scoped Hikvision device.
  - Active DB table is `public."Device"` plus `device_users`; SQL artifacts include `raw-sql-classification.sql`, `raw-sql-01-test-a-device.json`, `raw-sql-02-device-user-classification.json`, `raw-sql-03-sample-rows.json`, and `raw-sql-04-aggregate.json`.
  - Current aggregate: `394` DeviceUser rows; `348` raw-ok/not-enrolled rows; `45` rows missing both fingerprint and face raw; `1` row missing fingerprint raw only. Fingerprint custody is `718` reported slots / `628` stored raw templates / `91` missing; face custody is `356` reported / `311` raw / `45` missing.
- Direct API/device proof:
  - Login actor: `admin@bandai.local` / `hris` admin.
  - Modal/source endpoints were captured: `/api/device/sync-preview?deviceId=cmrlgqsjv000oob01165tbd8n` and `/api/device/cmrlgqsjv000oob01165tbd8n/users`.
  - Sample rows `83`, `839`, `984`, `1008`, `1076`, and `1143` all returned live raw capture no-data: fingerprints `no_fingerprint_data_from_device`, faces `no_face_on_device`.
  - Root-cause classification: stale/count-only inventory claims with true live raw no-data for sampled rows; no parser, merge, or probe bug was proven for these rows.
- Code bug repaired:
  - Manual raw fingerprint/face capture endpoints previously returned HTTP `422` with `buildSuccessResponse`, causing `status: "success"` on no-data and sometimes very large stale metadata bodies.
  - `hris-api/app/device/device.controller.ts` now returns compact `buildErrorResponse` bodies with `capture.reason` on no-data and keeps success envelopes only for actual raw capture success.
  - Regression coverage added in `hris-api/tests/hikvision-biometric-sync-contract.spec.ts`.
- Validation:
  - `npx tsx node_modules/mocha/bin/mocha --no-config tests/device-user-raw-fingerprint.helper.spec.ts tests/hikvision-biometric-sync-contract.spec.ts`: `20` passing.
  - `npx tsc --noEmit --pretty false`: passed.
  - Same-environment Playwright against `http://127.0.0.1:5175` saved `playwright-sync-center-device-users.png`, `playwright-page-text.txt`, `playwright-network.json`, `playwright-api-results.json`, and `playwright-summary.json`. Browser-side authenticated capture calls all returned HTTP `422` / `status: "error"` with exact no-data reasons.
- Remaining boundary:
  - This pass repaired `0` raw blobs. It fixed the no-data API contract and classified the requested six rows. The other `40` rows with missing raw were not directly captured in this pass and remain SQL-evidenced missing rows unless/until sampled by direct device calls.

## 2026-07-20 - TEST A raw biometric repair loop handoff

- Task mode: Mixed biometric custody repair + UI truth repair + live TEST A proof.
- TEST A: `cmrlgqsjv000oob01165tbd8n` (`192.168.254.102:443`, Hikvision), identified through API/DB evidence.
- Implementation truth:
  - Raw fingerprint sync now counts template slots, not just users.
  - `FingerPrintUpload` bulk can under-return templates; helper now probes per-finger when stored raw count is below `UserInfo.numOfFP`, then merges existing and newly fetched raw templates.
  - Raw-only job status completes with needs-attention semantics when `missing_raw_blob` remains; it does not hard-fail a device just because some rows have real no-data responses.
  - UI copy now says raw custody, current modality/vendor user, recent missing rows, and finished-with-missing review instead of stale `0%`/encrypted-envelope text.
- Live evidence in `.runtime/test-a-raw-repair-loop-20260720-103434/`:
  - Initial preview: source `314`, HRIS DeviceUsers `394`, fingerprint slots `718`, fingerprint raw `325`, fingerprint missing `393`, face reported `356`, face raw `311`, face missing `45`.
  - Job `bbccf2b6-75be-4e78-a7fa-e1a683149c02`: `266` captured, reduced fingerprint missing to `120`.
  - Job `834d6273-74d8-416f-aecf-8fd92430a062` with local `HIKVISION_RAW_BIOMETRIC_SYNC_CONCURRENCY=2`: `29` captured, removed transient `Unauthorized` class, final fingerprint raw `627`, missing `91`.
  - Remaining sample repair for users `1008`, `1076`, `1143` returned exact HTTP `422` bodies: `no_fingerprint_data_from_device` and `no_face_on_device`.
- UI evidence:
  - `browser-review-sync-dialog.png/.txt`: review modal shows `718 enrolled Â· 627 raw Â· 91 missing_raw_blob` and `356 enrolled Â· 311 raw Â· 45 missing_raw_blob`.
  - `browser-details-1004.png/.txt`: repaired user shows `2 of 2 stored` and raw face stored.
  - `browser-details-1008-search-open.png/.txt`: remaining no-data user shows `2 missing_raw_blob`, raw repair buttons, and count-only missing face truth.
- Validation:
  - Backend biometric sync + raw helper tests: 19 passing.
  - Controller/router/helper import check: passed.
  - Frontend device-user UI contract: passed.
  - Backend `tsc --noEmit`: passed.
  - Frontend targeted ESLint on touched files: warnings only, no errors.
  - Frontend `typecheck:test` still fails on unrelated existing `TimesheetsTab.test.tsx` `UseQueryResult` fixture type drift.

## Purpose

This file is the generic WWG Agent Handoff for a chosen implementation agent working from WWG project truth. The Codex compatibility artifact is written separately at `.wwg/reports/wwg-handoff-to-codex.md`.

This handoff applies to any implementation agent. `.wwg/reports/wwg-handoff-to-codex.md` remains a Codex compatibility artifact while Codex-specific flows require it.

Shared handoff logic is owned by `src/core/agent-handoff.ts`; `src/core/codex-handoff.ts` is a compatibility wrapper.

## Required Read Order

1. `.wwg/wiki/project-truth.md`
2. `.wwg/wiki/terminology.md`
3. `.wwg/wiki/principles/README.md`
4. Relevant `.wwg/wiki/principles/*.md` files when the task may affect durable reasoning
5. `.wwg/workspace/current-task.md`
6. `.wwg/workspace/context/project-context.md`
7. `.wwg/governance/drift-guard.md`
8. `.wwg/governance/quality-gates.md`
9. Root `AGENTS.md`
10. Relevant source, tests, templates, and docs

## Summary

Your WWG project is ready for a chosen implementation agent to continue from project truth, Workspace context, and Governance checks.

## Scenario

Validation Failure Handoff

## Current State

- The latest WWG validation report indicates blockers or required follow-up.
- Overall status: FAIL
- PASS Required WWG directories exist - 1 finding(s)
- FAIL WWG operating loop files are present and actionable - 2 finding(s)
- HIGH wwg-report-truth-sync-fields-missing (reports/wwg-adoption-plan.md): evidence=confirmed Report claims readiness or completion without required WWG truth synchronization fields. Recommendation: Add WWG Truth Synchronization, task mode, truth/update/governance/drift fields, and remaining stale context before claiming completion.
- HIGH wwg-report-truth-sync-fields-missing (reports/wwg-existing-audit-report.md): evidence=confirmed Report claims readiness or completion without required WWG truth synchronization fields. Recommendation: Add WWG Truth Synchronization, task mode, truth/update/governance/drift fields, and remaining stale context before claiming completion.
- Candidate counts: total 0, high-risk 0, requires-approval 0, truth 0, recommendations 0, current-task 0, warnings 0.

## Next Actions

1. Fix top validation blockers before implementation or release work.
2. Prioritize generated report contract findings, truth-sync field failures, then missing test/regression findings.
3. Regenerate or repair WWG-owned generated reports through the responsible WWG command.
4. Rerun validation and test-check after each focused fix.

## Commands To Run

```bash
wwg doctor --apply
wwg validate
wwg test-check --format plain
wwg reconcile --format plain --json
# Run repo-specific validation from package.json, for example:
npm run build
npm test
npm run lint
```

## Candidate / Truth Review

- Candidate counts: total 0, high-risk 0, requires-approval 0, truth 0, recommendations 0, current-task 0, warnings 0.
- If validation reports truth-sync field failures, update the report generator or explicit report classification instead of weakening validation broadly.
- Do not rewrite `.wwg/wiki` semantic truth to mask generated-report contract failures.
- Review reconciliation candidates only after validation blockers are understood.

## Boundaries

- Do not approve, apply, or promote high-risk truth candidates automatically.
- Do not rewrite `.wwg/wiki` semantic truth during a governance-only pass.
- Do not treat Vorter runtime evidence as accepted WWG truth.
- Do not mutate `.vorter` unless the task is explicitly Vorter-owned.
- Do not mutate application source files during report-only, validation-only, upgrade-review, or governance-only passes.
- Reports and candidates are evidence; `.wwg/wiki` remains canonical truth.

## Commit Readiness

- Do not commit release or upgrade completion while `wwg validate` fails.
- `wwg validate` passes or has only documented acceptable warnings.
- `wwg test-check` has no unexplained blocker.
- Repo-specific build, tests, lint, smoke, or package checks pass.
- Boundary diff is reviewed for `.wwg/wiki`, `.vorter`, generated reports, and source changes.
- High-risk candidates are reviewed but not automatically applied.

## Stop Conditions

- `wwg validate` fails.
- High-risk truth candidates exist and have not been reviewed.
- Unexpected `.wwg/wiki` changes appear.
- Unexpected `.vorter` changes appear.
- Source code changes appear during a governance-only pass.
- Package dry-run is unsafe.
- Tests fail.

## Report Location

- .wwg/reports/wwg-validate-report.md

## WWG Readiness

Must Have items are required for agent-safe operation. Other Features are recommendations, not automatic authorization to expand task scope.

### Must Have

- [x] WWG workspace present (present)
  - Evidence: `.wwg`
- [x] Project config present (present)
  - Evidence: `.wwg/config/wwg.project.yaml`
- [x] Project Truth present (present)
  - Evidence: `.wwg/wiki/project-truth.md`
- [x] Terminology present (present)
  - Evidence: `.wwg/wiki/terminology.md`
- [x] Principles README present (present)
  - Evidence: `.wwg/wiki/principles/README.md`
- [x] Workspace current task present (present)
  - Evidence: `.wwg/workspace/current-task.md`
- [x] Governance drift guard present (present)
  - Evidence: `.wwg/governance/drift-guard.md`
- [ ] Recommendation Registry present (missing)
  - Agent action: Complete the missing WWG-owned structure before relying on the project as agent-ready.
  - CLI support: `wwg generate-governance`
  - Evidence: `.wwg/governance/recommendation-registry.md`
- [x] Reports directory present (present)
  - Evidence: `.wwg/reports`
- [x] Root AGENTS.md present (present)
  - Evidence: `AGENTS.md`
- [ ] Test enforcement governance present (missing)
  - Agent action: Complete the missing WWG-owned structure before relying on the project as agent-ready.
  - CLI support: `wwg generate-governance`
  - Evidence: `.wwg/governance/test-enforcement.md`
- [ ] Regression guardrail governance present (missing)
  - Agent action: Complete the missing WWG-owned structure before relying on the project as agent-ready.
  - CLI support: `wwg generate-governance`
  - Evidence: `.wwg/governance/regression-guardrail-catalog.md`
- [x] Validation report present (present)
  - Evidence: `.wwg/reports/wwg-validate-report.md`
- [x] Audit report present (present)
  - Evidence: `.wwg/reports/wwg-audit-report.md`
- [x] Agent handoff present (present)
  - Evidence: `.wwg/reports/wwg-agent-handoff.md`, `.wwg/reports/wwg-handoff-to-codex.md`
- [x] Adoption regression baseline present (present)
  - Evidence: `.wwg/governance/regression-manifest.md`, `.wwg/governance/regression-manifest.json`

### Other Features

- [ ] Changelog missing (missing)
  - Reason: Package, product, or git history signals make release memory relevant.
  - Agent action: Prepare or review release narrative before treating changelog wording as final.
  - CLI support: `wwg changelog generate --from-git --weekly --dry-run`
  - Evidence: `CHANGELOG.md`
- [ ] Infrastructure readiness not checked (available)
  - Reason: Build, deploy, env, or infrastructure indicators were detected.
  - Agent action: Inspect infrastructure readiness before deployment-related work.
  - CLI support: `wwg infra check`
  - Evidence: `.env.example`, `.github/workflows`
- [ ] GitHub publishing readiness not checked (available)
  - Reason: Git or GitHub context exists.
  - Agent action: Do not publish without explicit approval; review readiness and secret safety first.
  - CLI support: `wwg publish github --dry-run`
  - Evidence: `.git`, `.github`, `package.json repository`
- [ ] Current version, optional candidate review (available)
  - Reason: Workspace is current. Optional semantic/candidate review artifacts exist; run only if adopting candidate surfaces.
  - Agent action: Treat candidate/review artifacts as optional review surfaces unless the user asks to promote them.
  - CLI support: `wwg audit --upgrade-candidates`
  - Evidence: `.wwg/reports/generated-project-upgrade-review.md`

### Recommended Next

- [ ] Complete Must Have readiness first (available)
  - Reason: 3 Must Have item(s) are missing.
  - Agent action: Do not treat Other Features as blockers until Must Have readiness is clear.
  - CLI support: `wwg maintain`

Agents should follow Must Have items first. Missing Other Features are not blockers unless the current task depends on them.

## Target Folder

C:\Users\anoni\OneDrive\Desktop\PROJECT_TRUTH_HYPERV_FRESH

## GitHub Repository

Not published.

## Selected Profiles

- None.

## Governed Skill State

- Skill manifest: not present
- Runtime activation: not performed by WWG; future Vorter responsibility.

## Runtime Skill Candidates

WWG generated runtime skill candidates only. WWG did not activate these skills. Vorter is responsible for runtime activation, task-level context loading, tool routing, permissions, and token budgeting. HomeDesk is responsible for user visibility, approval, disabling, and override controls.

- Status: not generated
- Reason: Skill Manifest is not present.
- Activation owner: Vorter

## Project Summary

- Project: TBD
- Summary: TBD
- Status: TBD

## Key Decisions

- Use Wiki truth as the source of planning and implementation context.
- Use Workspace context, prompts, and skills as generated agent operating material.
- Use Governance checks for validation, release, evidence, and approval gates.
- Keep secrets out of Wiki truth, reports, Workspace, and commits.

## Users and Roles

TBD

## MVP Features

TBD

## Pages / Screens

TBD

## Architecture and Hosting Preferences

TBD

## Design Preferences

TBD

## Sources and References

No source index or source report was available.

Accessible external-chat files, screenshots, docs, and images should be registered through WWG source intake so they land under `.wwg/wiki/01-sources/raw/uploads/`. If a chat-only reference is not accessible as a file or upload, add a raw source note documenting the missing artifact.

Keep raw originals in `.wwg/wiki/01-sources/raw`; use `.wwg/wiki/01-sources/processed` only for later cleaned extracts or summaries.

## Infrastructure Readiness

Not checked yet.

## Governance Level and Approval Gates

Level: TBD. Approval gates should follow AGENTS.md and governance checklists.

## Current Native Structure

- Canonical WWG metadata lives under `.wwg/`: `.wwg/config`, `.wwg/wiki`, `.wwg/workspace`, `.wwg/governance`, and `.wwg/reports`.
- `.wwg/config/wwg.project.yaml` is the canonical native registry.
- Root `wwg.project.yaml` is a legacy compatibility mirror/fallback when present.
- `.wwg/reports/` is canonical for generated WWG reports.
- Root `reports/` may remain for historical, release, package, external-upload, or human-facing reports.
- Config fallback/mirror status: canonical config present; no root fallback detected.

## Truth Loop

Implementation changes must reconcile code, project truth, terminology, principles, Workspace context, Governance checks, templates, tests, generated outputs, and reports when relevant.

## Principle Review

- Principles reviewed:
  - No principle-impacting changes detected.
- Principles updated:
  - None.
- Candidate principle changes:
  - None.
- Principle drift concerns:
  - None.

No principle-impacting changes detected.

## Truth Loop Review

- Project truth updated: N/A
- Terminology updated: N/A
- Principles updated: N/A
- Governance updated: N/A
- Workspace updated: N/A
- Templates/tests updated: N/A
- Reports updated:
  - .wwg/reports/wwg-agent-handoff.md
  - .wwg/reports/wwg-agent-handoff.json
  - .wwg/reports/wwg-handoff-to-codex.md
  - .wwg/reports/wwg-handoff-to-codex.json
  - .wwg/reports/runtime-skill-candidates.json
  - .wwg/reports/runtime-skill-candidates.md

No truth-loop-impacting changes detected.

## Native Structure Review

- `.wwg/config/wwg.project.yaml` present: yes
- `.wwg/reports/` present: yes
- Legacy root metadata folders present: none
- Config fallback/mirror status: canonical config present; no root fallback detected

## Maintenance Awareness

- Maintenance review recommended: yes
- Reason: Current audit or handoff inputs contain maintenance drift signals.
- Suggested command: `wwg maintain --target <path>`

## Recommendation Capture

Review whether this task revealed useful future work outside the approved scope.
If yes, add or update `.wwg/governance/recommendation-registry.md`.
If no, state that no new recommendations were identified.

Recommendations are candidate work only. They are not project truth, active work, or commitments until reviewed and promoted.

## WWG Truth Synchronization

- Task mode: TBD
- New truth detected: YES / NO
- Wiki updated: YES / NO / N/A
- Workspace updated: YES / NO
- Governance review completed: YES / NO
- Drift status: NONE / LOW / MEDIUM / HIGH
- Canonical files changed:
  - TBD
- Implementation discoveries synced:
  - TBD
- Remaining stale context:
  - TBD

Reports cannot override `.wwg/wiki/project-truth.md`. If this handoff or another report conflicts with project truth, update the stale report or leave a drift finding.

## Open Questions

- Missing planning input: .wwg/wiki/02-project/project-brief.md.
- Missing planning input: .wwg/wiki/03-requirements/functional-requirements.md.
- Missing planning input: .wwg/wiki/05-architecture/deployment-model.md.
- Missing planning input: .wwg/wiki/07-ux/screens.md.
- Missing planning input: .wwg/wiki/11-synthesis/open-questions.md.
- Missing planning input: .wwg/wiki/11-synthesis/planning-summary.md.

## Generated WWG Files

- .wwg/config/wwg.project.yaml
- .wwg/governance
- .wwg/governance/drift-guard.md
- .wwg/reports/adoption-audit.md
- .wwg/reports/adoption-regression-report.json
- .wwg/reports/adoption-regression-report.md
- .wwg/reports/readme-validation.md
- .wwg/reports/wwg-adoption-plan.md
- .wwg/reports/wwg-adoption-report.md
- .wwg/reports/wwg-audit-report.md
- .wwg/reports/wwg-doctor-report.md
- .wwg/reports/wwg-upgrade-history.md
- .wwg/reports/wwg-upgrade-report.md
- .wwg/reports/wwg-validate-report.md
- .wwg/wiki
- .wwg/wiki/principles/README.md
- .wwg/wiki/project-truth.md
- .wwg/wiki/terminology.md
- .wwg/workspace
- .wwg/workspace/current-task.md
- AGENTS.md
- reports/wwg-adoption-plan.json
- reports/wwg-adoption-report.json
- reports/wwg-existing-audit-report.json

## Missing Inputs

- .wwg/config/intake.answers.yaml
- .wwg/config/skill-manifest.yaml
- .wwg/reports/truth-reconciliation-candidates.json
- .wwg/reports/truth-reconciliation-candidates.md
- .wwg/reports/wwg-infra-check-report.md
- .wwg/reports/wwg-sources-report.md
- .wwg/reports/wwg-upgrade-plan.md
- .wwg/wiki/01-sources/source-index.json
- .wwg/wiki/01-sources/source-index.md
- .wwg/wiki/02-project/project-brief.md
- .wwg/wiki/03-requirements/functional-requirements.md
- .wwg/wiki/05-architecture/deployment-model.md
- .wwg/wiki/07-ux/design-preferences.md
- .wwg/wiki/07-ux/screens.md
- .wwg/wiki/11-synthesis/open-questions.md
- .wwg/wiki/11-synthesis/planning-summary.md
- intake answers

## Validation Result

- Report: .wwg/reports/wwg-validate-report.md

## Audit Result

- Report: .wwg/reports/wwg-audit-report.md

## Recommended First Agent Prompt

```txt
Read AGENTS.md and .wwg/reports/wwg-agent-handoff.md. Follow the WWG operating loop, then continue from the WWG plan and begin implementation with your chosen implementation agent.
```

## Implementation Log

Use `.wwg/reports/agent-implementation-log.md` for implementation notes across agents. Treat `.wwg/reports/codex-implementation-log.md` as a legacy name and prefer renaming or avoiding it in new work.

## Suggested First Implementation Tasks

```txt id="starter-tasks"
1. Read WWG project context and confirm assumptions.
2. Review open questions before building.
3. Create the initial app architecture plan.
4. Implement the first MVP page/screen.
5. Add tests and update WWG context after implementation.
```

# 2026-07-20 DeviceUser Raw Biometric Export/Import Handoff

- Status: `PARTIAL_COMPLETE_WITH_EVIDENCED_MISSING_RAW_BLOBS` for TEST A raw biometric custody. No biometric blobs were fabricated from counts.
- Current proven TEST A export/package truth:
  - DeviceUser rows: 394 total, 338 linked, 56 unlinked.
  - Fingerprint rows: 361 reported, 316 rows with raw blobs; latest package import preview carries 628 raw fingerprint templates. Earlier repair preview proved 718 enrolled fingerprint template slots, so the latest package is still short by 90 template slots against that reference.
  - Face rows: 356 reported, 311 raw face blobs, 45 missing face blobs.
  - Package status: `partial_missing_requested_raw_blobs`; 46 rows carry the reason `Reported biometric enrollment exists but no evidenced raw blob is stored`.
- Recovery loop run by agent:
  - Checked prior all-device sync first. Existing all-Hikvision job `6c7e3e4c-f722-4b00-a57c-81e06ab709d4` was still `processing` and repeatedly failing Main Entrance Device B fetches.
  - Ran TEST A biometrics-only job `e692290a-1d4f-4965-887f-c107bd473992`: completed, no new captures, cached 938 existing custody entries, 136 failed/missing checks.
  - Retried TEST A biometrics-only job `8d3a48df-a85e-44e2-abd3-3120d21e046f`: completed with the same no-new-capture result.
- Export/import journey proof:
  - Real CSV, Excel, and Package JSON browser downloads were saved and parsed. Headers are HR-friendly, no duplicate columns were found, no encrypted/passphrase wording remains in this modal journey, and CSV/XLSX preserve multi-fingerprint values as `FPn("...");FPn("...")`.
  - Package JSON preview of the full 22,968,896-byte file succeeded non-mutating with 394 matches, 0 conflicts, and 55 missing HRIS employees. Execute without typed confirmation was rejected with HTTP 400.
  - CSV subset import preview proved the modal shows preview-first copy and package-data status without mutation.
- Code truth changed:
  - API request body limit now uses `HRIS_API_BODY_LIMIT || "75mb"` and the security config is aligned at 75 MB so real package JSON import preview is accepted.
  - Import parsing accepts FP-pattern cells, JSON array/object cells, and semicolon/comma separated raw fingerprint templates, preserving all templates in rawPackage import.
  - Export/import modal loading copy is HR-friendly and operational.
- Validation:
  - Backend focused contracts: 25 passing.
  - Frontend focused UI contract: 1 passing.
  - Backend typecheck: passed.
  - Frontend targeted ESLint: 0 errors, existing warnings only.
  - Full frontend typecheck still fails outside this scope in pre-existing app/type drift such as `LoginDebug.tsx`, calendar/guide imports, leave route imports, `TimesheetsTab.test.tsx`, and other unrelated files.
- Evidence root: `.runtime/device-user-raw-export-proof-20260720-110129/`.
- Recommendations recorded: `REC-20260720-HIKVISION-RAW-SYNC-STALE-JOB-CANCEL` and `REC-20260720-HIKVISION-RAW-SYNC-DEVICE-PREFLIGHT`.

# 2026-07-21 Overnight Hikvision Listener Self-Repair Handoff

- Status: `GREEN_WITH_BOUNDARY`. Runtime is software-green and truthful UI state settled to `Ready for tap proof`; physical fresh-tap evidence remains the only boundary for changing quiet armed devices to `receiving`.
- Direct LAN SSH to `infra@10.184.37.19` timed out from the Windows host; fallback `ssh project-truth-hris` worked and was used for runtime proof. The VM kept `cloudflared-bnpi-hris.service` active/running, PID `1842402`.
- Listener recovery: VM reverse/API ports were restored/proven on `127.0.0.1:53001`, `59000`, and `59443`; `project-truth-hikvision-hot-reload-listener.service` is active/running, PID `2912473`, with no `bad_alloc`, `length_error`, `Aborted`, or wrapper `Usage:` crashes after the patched restart window.
- C++ runtime repair deployed on the VM: the active work tree and `/opt/project-truth/vendor/hikvision-linux/hikvision_biometric_service.cpp` contain the session-list mutex/callback source-device copy fix, and the rebuilt binary hash is recorded. This checkout has no tracked C++ diff for that file, so the durable repo source boundary must be reviewed before a production promotion claim.
- Device classification from final listener/API proof: Main Entrance Device A `10.184.37.21`, B `10.184.37.20`, C `10.184.37.22`, and D `10.184.37.23` all logged `sdk_login ok`, `sdk_alarm_arm ok`, and `device_armed`; final API classified them as `armed_waiting_for_tap`. D/C/A also have fresh HRIS post proof in the final window; B is armed and waiting for a new physical callback/post proof.
- HRIS callback post path is proven: listener logs show successful `hikvision_callback_post_result` rows and `hris_contract_post ok=true` through `apiBase=http://127.0.0.1:53001`.
- Saved Device Events performance/truth proof: final API timings were `summaryScope=facets` 3178ms, listener 5745ms, live-readiness 1793ms, saved-events 2288ms. Saved view returned real DeviceEvent rows and did not block on listener proof.
- UI proof: Playwright opened `http://localhost:5175/admin/configuration/devices/events?view=saved&action=listener-control`, showed the listener modal, `Service enabled`, `Ready for tap proof`, saved events, and no stale `Live path needs proof` or `not checked for a long time` wording. Evidence screenshot: `.runtime/overnight-hikvision-listener-green-20260721-065548/playwright-listener-modal-saved-events-final.png`.
- Code repair in this checkout: `hris-api/app/device/device.controller.ts` restores `summaryScope=facets` handling so facet counts are not collapsed by selected taxonomy leaf filters.
- Validation: API typecheck passed; focused API contracts passed 32/32; focused frontend Vitest contracts passed 31/31; live Playwright proof passed after three recoverable script/tooling retries. Python/C++ local tests could not run on Windows because `python`/`py` were unavailable, but the VM build/rebuild proof passed.
- Evidence root: `.runtime/overnight-hikvision-listener-green-20260721-065548/`.
- Recommendations: no new recommendations were added; existing `REC-20260721-HIKVISION-API-REVERSE-ENSURE-BUG` already covers the direct recovery issue observed in this run.

# 2026-07-21 Sync Center DB/Live Gate Removal + Four Hikvision Device Proof

- Status: `FULFILLED_WITH_WARNINGS`.
- Code changed: Sync Center no longer renders or owns the `Checking DB + live path` / Keep Ready / Prove-fix readiness strip. `GET /api/device/sync-preview?quick=true` is now the default Sync Center path and treats skipped live source counts as neutral `saved_preview` instead of a blocking error. The host-local Hikvision tunnel env map is generated as a single-line value so all `.20-.23` forwards are loaded by the local API.
- Runtime proof: `ssh project-truth-hris` worked while direct LAN SSH to `10.184.37.19` timed out; Cloudflare tunnel stayed active. VM fast reachability proved `.20-.23` required TCP ports `80/443/8000` open. Host-local forwards for all four devices were open.
- API proof: local API quick health proved `.20`, `.21`, `.22`, `.23` `online` via `env_tunnel_map`. Quick Sync Center preview returned target HRIS DeviceUser counts `.20=459`, `.21=687`, `.22=416`, `.23=399` in 2454ms without live source blocking. Separate live Hikvision user-info count succeeded for all four in 1574ms-4784ms. Device Users endpoint returned saved totals for all four.
- Listener proof: `/api/device/hikvision/listener` returned running/armed/receiving overall with four device rows; `.20` receiving and `.21-.23` armed.
- Browser proof: Playwright on `http://127.0.0.1:5175` proved `/admin/configuration/devices`, Sync Center, and Device Users show all four target IPs; no `Checking DB + live path`, `Prove / fix now`, or `Keep ready ON` text was present. Network captured quick health, `sync-preview?quick=true`, and listener calls only.
- Validation: backend focused contracts passed 17/17; frontend focused contract passed 1/1; API typecheck passed. Frontend `typecheck:test` still fails outside this scope at `app/routes/employee/dashboard/TimesheetsTab.test.tsx(54,46)`, covered by existing `REC-20260706-TEST-TYPECHECK-MOCKS`.
- Evidence root: `.runtime/sync-center-four-hikvision-20260721-090712/`.
- Boundary: stale non-target Hikvision devices still exist in config/list results, but they no longer block target-device health, Sync Center render, or Device Users proof. No biometric bytes were inferred from counts.

## Next Steps

- Open VSCode.
- File -> Open Folder.
- Select: C:\Users\anoni\OneDrive\Desktop\PROJECT_TRUTH_HYPERV_FRESH.
- Start your chosen coding agent.
- Use the recommended first prompt above.
# 2026-07-19 â€” Raw fingerprint enrollment custody race repaired

- The C++ listener was not the failing layer: TEST A person `18` produced one raw template, attached it to the callback, and received HTTP success.
- Root cause was a last-writer-wins race in API UserInfo enrichment. A stale inventory snapshot could overwrite the DeviceUser raw metadata after the callback, while DeviceEvent still retained the template.
- API repair uses optimistic `updatedAt` merge/retry and preserves raw fingerprint/face custody. Exact evidenced-event replay remained present after the delayed enrichment window.
- Modal repair suppresses the false `Not captured yet` state while its saved DeviceUser refetch is pending. Users `15` and `18` render `1 stored` in headless proof.
- Evidence and boundary: `.runtime/fingerprint-enroll-raw-race-20260719/summary.md`.

# 2026-07-21 Device C DeviceUser Gap Repair Handoff

- Status: `FULFILLED_WITH_BOUNDARY`.
- Root cause: DeviceUser sync job planning used saved HRIS DeviceUser state only (`vendorUserCount: null`) for its decision matrix, so the running `needs_attention_only` job reported `missing_device_user_record=0` even while Sync Center preview proved Main Entrance Device C had `687` physical users and only `416` saved HRIS DeviceUser rows.
- Code changed: the job planner now calls the fast Hikvision device-user count before deciding missing source identities are zero. When the live source count exceeds saved HRIS rows, the job sets `sourceReadRequired=true` and reads source users before raw-custody repair.
- UI changed: job progress no longer labels failed raw capture attempts as remaining HRIS "raw gaps"; it uses `Device no-data` / `raw reads failed`, matching device 404/no-data evidence.
- Runtime repair: API was restarted locally on port `3001`. Repaired dry-run for Device C returned `missingDeviceUsers=271`, `sourceReadRequired=true`, `sourceReadSkipped=false`. Real job `690dbe6d-c751-4dc3-9dff-f1f70738012a` completed with `created=271`, `updated=416`, `linked=640`, and `unmatched=46`.
- Final proof: fresh Sync Center preview returned Device C `fromDevice=687`, `savedInHris=687`, `gap=0`, `missingDeviceUsers=0`, `needsLink=46`, `alreadyPresent=641`. Fresh merge plan showed `687` unique IDs and no duplicate unique IDs.
- Validation: backend focused contracts passed 27/27; API typecheck passed; frontend focused UI contract passed 1/1; `git diff --check` passed with only CRLF warnings.
- Boundary: 118 face raw reads failed because Device C returned 404/no-data for face image URLs. No raw biometric bytes were inferred or fabricated from counts.
- Evidence root: `.runtime/device-c-repaired-sync-20260721-1153/`.

# 2026-07-21 New Cutoff Payroll Dry-Run/Seed Handoff

- Status: `PARTIALLY_FULFILLED`. Payroll was not generated because preview/comparison still has severe unexplained source gaps after the safe seeds.
- Evidence root: `.runtime/overnight-payroll-new-cutoff-20260721-144322/`.
- Same local DEV lane was used: API `127.0.0.1:3001`, app `127.0.0.1:5175`, and canonical DEV DB `127.0.0.1:55435`. No production mutation and no Cloudflare tunnel changes.
- Workbook intake:
  - All provided new-cutoff XLSX files were inventoried.
  - HRIS Payroll Computation workbooks were encrypted; `officecrypto-tool` decrypted them into the evidence folder after verifying SheetJS/ExcelJS are not the right decrypt-first path for modern encrypted XLSX.
- Applied for July 15 (`2026-06-26` to `2026-07-10`, pay date `2026-07-15`):
  - Biometrics attendance seed from `Biometrics Data_Jun 26 - Jul 10.xlsx`.
  - Fast approved timesheet/line seed from the seeded attendance.
  - Scoped OT metadata repair from `2rptOvertimeDetails - June 26 - July 10, 2026.xlsx`.
  - Scoped mass-upload seed from `Compensation Mass Upload 07.15.26.xlsx` and `Deduction Mass Upload 07.15.26.xlsx`: 1,307 EmployeeBenefit rows and 65 EmployeeLoan rows applied. Nineteen employee codes stayed unmatched.
- July 15 post-seed comparison still failed the generate gate: 859 workbook rows, 838 employees matched, 824 approved timesheets found, 0 exact/tolerance matches. Remaining categories: `SOURCE_MISSING_APPROVED_OT=553`, `SOURCE_MISSING_ALLOWANCE=124`, `SOURCE_MISSING_MANUAL_ADJUSTMENT=73`, `SOURCE_MISSING_DEDUCTION_OR_LOAN=43`, `HRIS_LOGIC_MISMATCH_REPAIRABLE=25`, `TIMESHEET_NOT_FOUND=14`, `EMPLOYEE_NOT_FOUND=21`, `SOURCE_MISSING_STATUTORY_CONFIG=6`.
- June 30 (`2026-06-11` to `2026-06-25`, pay date `2026-06-30`) stayed dry-run only:
  - No biometrics workbook exists in `docs/new-cutoff`.
  - DEV has no attendance/timesheets for the period.
  - Compensation upload has unmapped `INC` code across 816 rows; do not infer its payroll treatment without HR/source confirmation.
- July 30 (`2026-07-11` to `2026-07-25`) remains biometrics-mapping-only because no HRIS Payroll Computation comparator workbook was provided.
- Validation: `hris-api npm run test:regression:payroll-source-truth` passed 52 specs; `hris-api npm run typecheck` passed.

# 2026-07-22 Merge Users Selected-ID Matrix Review Handoff

- Status: `GREEN_NO_WRITE_EXECUTED`. The merge review flow was verified through the real non-mutating plan endpoint and browser modal, but the real merge job was not started.
- User problem addressed: the prior â€œNeeds decisionâ€ view was misleading because it could show duplicate rows for the same unique device ID. The review modal also hid the most important operator question: what selected ID writes from which source device to which target devices, and whether fingerprint/face will be copied.
- Frontend changed: `mergeList=issues` now renders one row per unique selected ID. The final review modal shows metrics for selected unique IDs, peer copy attempts, fingerprint gaps, face gaps, and conflicts resolved; per-target and per-source matrices; and a full selected-ID write matrix with physical source, targets, biometric source evidence, selected-device coverage/gaps, copy count, and an Edit action back to the row before starting.
- Backend changed: device-user merge job progress now includes `writeMatrix` and uses that matrix for `totalWrites`, so the job polling contract can match the final review counts. The matrix includes selected unique IDs, total writes, fingerprint gaps, face gaps, per-target/per-source summaries, and per-row source/target/coverage details.
- Browser proof: Playwright on `http://localhost:5175/admin/configuration/devices?action=device-users&syncPanel=users` authenticated as `admin@bandai.local`, hit `POST /api/device/hikvision/sdk-users/merge/plan`, used recommended sources, and opened the final review without pressing Start. The modal showed `754` selected unique IDs, `3,770` peer copy attempts, `3,493` fingerprint gaps, `3,655` face gaps, `1093/1093` conflicts resolved, `Writes by target device`, `Sources used`, `Selected ID write matrix`, `Physical source`, `Fingerprint`, `Face`, and `Edit`. Row proof for ID `1`: fingerprint `Source 2`, `5/6 devices; 1 gap`; face `Source 1`, `6/6 devices; aligned`; copy `5`.
- Validation: frontend contract test passed; targeted `enroll.tsx` ESLint passed with existing warnings only; backend merge-helper tests passed 12/12; backend typecheck passed; `git diff --check` passed with only CRLF notices.
- Evidence root: `.runtime/merge-users-ui-proof-20260722-035213/`.

# 2026-07-22 Merge Users Running-State Stage Repair Handoff

- Status: `CODE_VALIDATED_NO_NEW_WRITE_EXECUTED`.
- User problem addressed: after pressing Start, the merge modal still showed review/edit controls below the running progress card. This was misleading because recommended sources, selected rows, and scope are no longer editable once the job exists.
- Frontend changed: `enroll.tsx` now gates the review/editor body with `!hasSdkMergeJob`. While a job exists, the modal renders only the job monitor plus a `Locked job scope` section from backend `writeMatrix`, including selected unique IDs, peer copy attempts, fingerprint gaps at start, face gaps at start, targets receiving copies, and physical sources used.
- Validation: focused frontend UI contract passed; targeted `enroll.tsx` ESLint passed with existing warnings only; backend typecheck passed.
- Boundary: no additional real merge job was started during this repair. Browser proof against the exact operator-visible job needs the active `mergeJobId` or a fresh approved job run.

# 2026-07-22 Merge Users Live Progress Truth Repair Handoff

- Status: `LIVE_JOB_INSPECTED_PROGRESS_UI_REPAIRED`.
- Live job inspected: `d4fe5561-64f7-4349-b53e-922486c7436b`. API still returned `processing`, `totalWrites=3770`, `processedWrites=565`, `successfulWrites=0`, `failedWrites=0`, `results=[]`, `startedAt=2026-07-21T19:54:47.863Z`. The honest interpretation is that the backend is still inside the long device-copy call and has not returned actual per-target write rows.
- UI repair: running merge card now shows `Progress estimate` instead of `Completed` while processing. It also shows `Current phase`, `Elapsed`, `UI polling`, and `Backend update`, plus explicit copy that Applied/Needs attention stay zero until per-target results return and devices are reread.
- Backend repair: merge job updates now stamp `updatedAt`; frontend type accepts `updatedAt`.
- Validation: focused frontend contract passed; targeted `enroll.tsx` ESLint passed with existing warnings only; backend typecheck passed.

# 2026-07-22 Main Entrance A-F Health and Local Bootstrap Repair Handoff

- Status: `FULFILLED_WITH_PUBLIC_WARNING`.
- DB comparison: K3s DEV has exactly six active Main Entrance rows: B `.20`, A `.21`, C `.22`, D `.23`, E `.24`, F `.25`. All share HTTPS `443`, Hikvision SDK `8000`, and the same governed runtime shape. `.24` was not offline because of a malformed row.
- Root cause: `scripts/start-hikvision-remote-device-tunnel.ps1` and `hris-api/scripts/ensure-hikvision-remote-device-tunnel.cjs` defaulted to `.20-.23`; the running tunnel/env map confirmed only those four. Local health for `.24/.25` consequently used `resolved_runtime_endpoint` and failed from Windows, while K3s health was online.
- Code repair: default device IPs now include `.24/.25`; predev and manual restart labels say `.20-.25`; the focused contract asserts all six.
- Runtime proof: the regenerated tunnel has 18 working forwards. After local API restart, A-F quick health all returned `online`, `reachable`, `source=env_tunnel_map`. Full `.24/.25` checks returned `systemTime=readable`, `deviceApi=online`, proven by authenticated system-time reads. Playwright captured all six addresses and online health responses at `localhost:5175`.
- Validation: focused Mocha 11/11; API TypeScript typecheck passed; Node syntax checks passed; PowerShell tunnel script parse passed. An accidentally broad repository test invocation surfaced existing unrelated failures and is not counted as a focused regression failure.
- Public boundary: VM LAN app/API are 200 and the protected named tunnel service stayed active. Public hosts returned Cloudflare 503/TLS resets; current QUIC logs show repeated control-stream failures, and additive HTTP/2 attempts from both VM `.19` and `.78` were reset during edge TLS on port `7844`. No tunnel outage or destructive reconfiguration was performed.
- Evidence root: `.runtime/hikvision-six-device-20260722-143712/`.

# 2026-07-22 Merge Listener Truth and Active Progress UI Handoff

- Status: `LIVE_LISTENER_ACTIVE_MERGE_JOB_EXPIRED_NO_SAFE_WRITE_RETRY`.
- Original merge job `a9d3acf7-7dee-406a-9198-c413fbd699d4` remains unproven after API restart. Latest saved poll `.runtime/merge-users-final-run-20260722-042955/poll-loop-20260722-152326/` returned 404 `SDK user merge job not found or expired`; do not mark it completed and do not infer final six-device sync from counts.
- TEST B bridge was repaired with `scripts/start-host-hikvision-vm-ssh-bridge.ps1 -DeviceIp 192.168.254.110 -HttpListenPort 58180 -SdkListenPort 58100`; evidence `.runtime/hikvision-vm-ssh-bridge/20260722-151306/`. VM/host ports bind and SDK TCP connects on `58100`; HTTP/ISAPI through `58180` still times out.
- Original-six reread after TEST B bridge is invalid for final counts: `.runtime/merge-users-final-run-20260722-042955/fresh-original-six-plan-after-testb-bridge-20260722-151423/operator-summary.json` shows `validForFinalCounts=false`, `unionUsers=694`, `sourceRows=1381`, `plannedWrites=3470`, `errorCount=4` with Main Entrance D `Unauthorized`, TEST B `fetch failed`, Main Entrance C `Unauthorized`, TEST A `fetch failed`.
- Focused Main A-D reread narrowed the LAN blocker to Main Entrance D: `.runtime/merge-users-final-run-20260722-042955/fresh-main-a-d-plan-after-cd-unauthorized-20260722-151915/operator-summary.json` has `errorCount=1`, D `Unauthorized`. Separate D health proof `.runtime/merge-users-final-run-20260722-042955/device-d-health-20260722-152010/` shows D online with system time readable and `userRead.count=744`; treat the plan error as endpoint/path-specific or transient until a clean reread proves otherwise.
- One post-health A-D plan attempt was invalidated by API restart/connection close; evidence `.runtime/merge-users-final-run-20260722-042955/fresh-main-a-d-plan-after-device-d-health-20260722-152052/operator-error.json`. API recovered and health is green through the watcher; do not treat that failed attempt as device count truth.
- Live listener is active independently of the expired merge job. Latest progress `.runtime/merge-users-final-run-20260722-042955/poll-loop-20260722-152326/operator-progress.json` shows API uptime advancing, listener `running=true`, `sdkState=receiving`, `callbacks=true`, `armed=true`, `deviceSummary=receiving=6`, and source inventory reads from Main Entrance Device E (`cmriu5ab102goi001x9o7nfct`) in 30-user pages through `totalMatches=740`.
- Frontend polish/hardening: the Hikvision listener modal now labels callback receiving separately from armed/listening and shows `Active SDK work` parsed from actual listener JSONL rows. Browser proof copied to `.runtime/merge-users-final-run-20260722-042955/browser-listener-active-work-20260722-151819/` confirms the modal renders raw log tail plus `0 callbacks / 6 armed/listening / 0 login failed / SDK work active` and `Active SDK work`.
- Validation completed: API typecheck passed; frontend Device User UI contract passed; targeted frontend ESLint for `events.tsx` and `enroll.tsx` passed with 0 errors and existing warnings only. Earlier API Hikvision contract still passed in this run context.
- Remaining real gaps: TEST A/TEST B are not final-reread-clean; Main Entrance D needs a clean merge-plan reread after the health proof; the listener/API log contains invalid biometric reconcile retries rejected with 400 because `sourceDeviceId` and `employeeNo` are empty; no safe retry write job was started. Cloudflare stayed active and no SDK files were deleted.
- Final non-mutating reread before handoff: `.runtime/merge-users-final-run-20260722-042955/fresh-main-a-d-plan-after-d-live-read-20260722-152629/operator-summary.json` remained invalid with Main Entrance D `Unauthorized` and Main Entrance B `Unauthorized`; listener receiving state must not be treated as merge-plan readiness.

# 2026-07-22 Active Merge Job 77df35c4 Live Watch Handoff

- Status: `ACTIVE_JOB_RUNNING_NOT_TERMINAL`. Keep watching; do not close out.
- Original job `a9d3acf7-7dee-406a-9198-c413fbd699d4` is still expired/404. The active job now visible through the API is `77df35c4-6c9b-4a68-9201-8ffc71fcb14b`, plan `328f5da4-71bd-4619-a281-05aaac6329e5`, started `2026-07-22T07:34:04.123Z`. This agent turn did not start that job.
- Important scope mismatch: active job `writeMatrix` reports `selectedUniqueIds=852` and `totalWrites=2551`. That differs from the previously intended selected scope (`569` needs-decision IDs, `2845` peer copy attempts). Do not rewrite history; document this as the scope of the running job and prove final postcondition from a fresh reread after terminal state.
- Evidence root: `.runtime/merge-users-final-run-20260722-042955/active-job-77df35c4-6c9b-4a68-9201-8ffc71fcb14b/`. The robust watcher writes full `poll-*.json` files and concise `polls-robust.jsonl`.
- Live progress observed in this window: backend exposed actual `currentStage`, `currentUserKey`, `updatedAt`, real `processedWrites/successfulWrites/failedWrites`, progress events, and `writeMatrix`. Events proved employees/sources/targets/credential stages such as employee `469` from Main Entrance Device E to B/C/F and employee `1340` from Main Entrance Device B to C/E/F. Later polls showed timeout/circuit-skip failures on Main Entrance Device E to C/F paths.
- Latest direct poll in this handoff window showed the job still `processing`; progress had advanced past `407/2551`, with failures rising from real timeout/circuit-skip paths. Treat failures as real rows to group after terminal state; do not claim all copies succeeded.
- Frontend changed: `hris-app/app/routes/admin/devices/enroll.tsx` running merge monitor now shows `Live copy now` from backend `progressEvents` with Employee now, Source, Targets, Credential stage, plus `Latest backend events`. It keeps pre-run review/edit controls hidden while `hasSdkMergeJob` is true.
- Browser proof: `.runtime/merge-users-final-run-20260722-042955/browser-merge-live-work-20260722-1545/operator-proof.json` and `merge-live-work.png` prove the modal shows Merge job running, live copy now, employee/source/targets/credential stage, selected unique IDs, peer copy attempts, latest backend events, and no editable review controls.
- Validation: frontend device-user UI contract passed after the UI patch; targeted frontend ESLint passed with 0 errors and existing warnings; API TypeScript passed after hardening the merge-plan biometric status assignment in `device.controller.ts`.
- Runtime guardrails preserved: API remained healthy, DB forward `127.0.0.1:55435` was rechecked, Cloudflare was not disabled, and no SDK files were deleted. TEST B bridge ports were repaired earlier but TEST B HTTP/ISAPI still timed out and is not final-count proof.
- Next required loop: keep polling job `77df35c4-6c9b-4a68-9201-8ffc71fcb14b`; if `updatedAt` stalls over 2 minutes, inspect `.runtime/local-api-watch/latest.log`, DB forward, and VM listener logs; if terminal failed, group failed rows by user/source/target/error; if terminal completed/attention, run a fresh non-mutating reread/merge plan for the same devices before claiming any final counts.

# 2026-07-22 Merge Job 77df35c4 Terminal Failed-Stale Handoff

- Status: `TERMINAL_FAILED_STALE_NO_SAFE_AUTO_RETRY`.
- Terminal poll evidence: `.runtime/merge-users-final-run-20260722-042955/active-job-77df35c4-6c9b-4a68-9201-8ffc71fcb14b/terminal-poll-20260722-155537.json`.
- Backend terminal state: `status=failed`, `currentStage=failed_stale`, `processedWrites=428`, `successfulWrites=361`, `failedWrites=67`, `totalWrites=2551`, message `Device-user merge worker is no longer active after API restart. Last progress was persisted; start a fresh merge for remaining failures only.`
- This is not completion. The API restarted and the durable snapshot correctly refused to keep pretending the worker was active.
- Failed rows were inspected from `.runtime/merge-ledger/77df35c4-6c9b-4a68-9201-8ffc71fcb14b/`: 361 success ledger rows and 67 failure ledger rows. Failure groups: E -> F 31, E -> C 31, B -> E 3, B -> C 1, B -> F 1. Failure status groups: 56 `circuit_skip`, 9 `timeout`, 2 `error`.
- Fresh four-device B/C/E/F plan after failure closed at the request boundary and was saved as invalid evidence under `.runtime/merge-users-final-run-20260722-042955/fresh-bcef-plan-after-77df35c4-failed-stale-20260722-1556/operator-error.json`.
- Pair reread evidence root: `.runtime/merge-users-final-run-20260722-042955/pair-rereads-after-77df35c4-failed-stale-20260722-1559/`.
- Pair reread results after terminal failure:
  - E-C: valid reread, E `740`, C `740`, `unionUsers=740`, `missing=0`, `plannedWrites=0`, conflicts `588`.
  - E-F: valid reread, E `740`, F `687`, `unionUsers=852`, `missing=277`, `plannedWrites=277`, conflicts `85`.
  - B-E: valid reread after DB-forward confirmation, B `687`, E `740`, `missing=53`, `plannedWrites=53`, conflicts `725`.
  - B-C: valid reread, B `687`, C `740`, `missing=53`, `plannedWrites=53`, conflicts `468`.
  - B-F: valid reread, B `687`, F `687`, `unionUsers=837`, `missing=300`, `plannedWrites=300`, conflicts `579`.
- Safe retry boundary: no `retryPlanId` was provided; the active job scope already differed from the intended operator scope; and fresh remaining plans still carry conflicts/source-choice decisions. Do not start another write job by guessing `applyAll` or recommended sources. A safe retry requires a reviewed remaining-scope plan or a backend-generated retry plan that locks only remaining actionable rows.
- Validation during this pass: API typecheck passed after the biometric status literal hardening; frontend device-user contract passed; targeted frontend ESLint passed with 0 errors and existing warnings. Browser proof of the running modal is under `.runtime/merge-users-final-run-20260722-042955/browser-merge-live-work-20260722-1545/`.

# 2026-07-23 Overnight Merge Device Users Owner Loop Handoff

- Status: `PARTIALLY FULFILLED`. Evidence root: `.runtime/merge-device-users-overnight-20260722-205845/`; full closeout: `WAKEUP-REPORT.md`.
- Fresh accepted scope was Main Entrance B/A/D/E/F. Main Entrance C was excluded after repeated `EHOSTUNREACH` user reads; TEST A/B remained outside the proven normal HTTP/SDK scope.
- Fresh before/after physical counts: B `687→812`, A `697→813`, D `744→849`, E `740→822`, F `715→748`. Device records increased `3583→4044` (+461); unique union stayed 865; peer gaps fell `742→281`.
- Final plan `3e08ac56-2f8f-4b91-8c69-b9eed346df95` read all five devices cleanly with zero errors. All remaining 281 peer gaps are on 205 IDs with unresolved conflicts; zero conflict-free rows remain. The loop stopped rather than guessing source identity fields.
- Biometric boundary: zero readable raw fingerprint records and zero readable raw face records were available. Final evidence is 1,746 fingerprint count-only records, 1,351 face count-only records, and explicit not-enrolled rows. Nothing count-only was called synchronized raw data.
- Failure-only retry was proven: canary timeouts were retried as only eight remaining rows; seven were ledger successes and the eighth immediate-verification failure was subsequently present on physical reread. Later stale-inventory false noops were detected by fresh reread, repaired in code, and retried rather than accepted.
- Corrected jobs applied 280/280 physical writes with zero already-matched and zero failures: `f457c844...`, `32dea565...`, `5c812f2b...`, `24e40a51...`.
- Repairs pushed to `develop`: `6977afd`, `8a52316`, `a32f264`, `a037f4b`, `fb8750e`. VM ansible/GitOps runtime proved exact deployed commit `fb8750e`; the named Cloudflare tunnel stayed active.
- Close health: canonical `127.0.0.1:55435` PostgreSQL handshake and Prisma query pass; local API health/login/auth-me pass; frontend `:5175` passes; public DEV health passes; all 18 A–F HTTP/HTTPS/SDK forwards pass and remain running.
- Validation: API typecheck pass; 30 focused Hikvision contracts pass; Device Users UI contract pass; targeted frontend ESLint 0 errors; deployed headless Playwright terminal-job proof pass. Full frontend typecheck has unrelated existing failures and was not called green.

# 2026-07-23 Overnight Merge Fresh Revalidation Handoff

- Status: `PARTIALLY FULFILLED`; evidence `.runtime/merge-device-users-overnight-20260723-050702/`; use its `WAKEUP-REPORT.md` as the current closeout.
- Previous five-device final-count evidence is historical only. Fresh read-only plans were unstable and invalid: `1d1ff7d3...` was 4/5 valid with 1,132 conflicts; `f062afa4...` was 1/2; `2cd6cd3c...` was 1/5 after DB transport loss; `39f0ab6c...` was 3/5 with 1,081 conflicts and 186 missing target records.
- Zero writes were attempted. There was no safe canary or reviewed remaining-scope matrix, and no circuit/timeout was counted as success.
- Listener repair was deployed and freshly armed A/B/D/E/F; C remained login error 7. The final SSH path later failed three direct-LAN attempts and repeated Cloudflare Access banner exchanges, while the already-established host tunnels and reverse bridge remained non-destructively preserved.
- Runtime/API repairs are covered by focused tests: 37 API contracts, 13 UI/events contracts, the PowerShell bridge contract, and API typecheck passed. Controlled `npm run dev` recovered health without operator action.
- Final browser proof is deliberately red: login and Sync Center pass, Merge says 0/8 available, and Listener says status unreachable. Do not reuse the earlier green browser state as current truth.
- Required next condition for any future write is a fresh zero-read-error plan with explicit conflict adjudication and a physical canary/reread. This is not operator homework for the current run; it is an external connectivity/decision boundary.

# 2026-07-28 DEV/UAT/PROD Employee Portal Recovery Handoff

- Status: `FULFILLED`. Evidence root: `.runtime/employee-portals-recovery-20260728-122800/`.
- Original failure and root cause: PROD/DEV/UAT `hris-emp-app` pods were `ErrImageNeverPull`; the employee image was missing from K3s, ports `3300/3310/3320` refused connections, and correlated `cloudflared` logs showed origin dial failures. The tunnel itself remained enabled and active.
- Durable runtime repair: `ansible/project-truth-pull.yml` now treats `hris-emp-app` as a governed image build/import/restart target. GitOps employee image tags, promotion coverage, and cluster-scoped ownership contracts were corrected. The employee frontend now keeps biometric kiosk polling fail-closed unless explicitly enabled, and the API permits only the two exact public employee calendar/birthday routes.
- Schema repair: fresh full custom-format backups were captured before mutation under `/var/lib/project-truth/backups/employee-portals-schema-repair-20260728-124806`. Prisma schema push then restored the required benefit/payroll columns in DEV/UAT/PROD.
- Final runtime: all employee and API pods are Ready with zero restarts in the verification window. VM origin health/login/same-host API and public health/login/same-host API matrices pass in all environments. The final tunnel window contains no origin dial, 502, or 1033 errors.
- Final browser: isolated headless Playwright contexts completed linked-employee login, authenticated same-host API access, refresh/session retention, and logout in PROD/DEV/UAT. There were zero unexpected console errors, page errors, failed required requests, CORS/mixed-content errors, and HTTP 5xx responses. Expected unauthenticated `/api/auth/me` 401s and navigation-aborted Cloudflare RUM requests are retained and explicitly classified in the raw evidence.
- Deployment: employee submodule `778d16d52cfe3a549426f4579d183870ec629717`; parent repair revisions through `c0c47f9339cd944588de9efd91e9172a2ae3ae29`. GitHub Actions validation run `30332330766` passed. All six Argo applications were `Synced/Healthy` at `c0c47f9339cd944588de9efd91e9172a2ae3ae29` before truth-sync closeout.
- Access boundary: direct LAN SSH and HTTP from this Windows host timed out. `ssh project-truth-hris` passed and provided VM-local runtime proof; public employee paths independently passed. Do not infer a VM/application outage from the host's unavailable direct LAN route.


# 2026-07-28 SDK Device-User Export / Import Handoff

- Fresh source truth: Main Entrance B is authenticated and inventory-readable with exactly 874 SDK IDs. Actual existing-path package export also contains 874 unique rows and no duplicates.
- Protected audit decoded 1,634 FP slots and 313 faces; 9 FP and 493 face rows remain explicit `missing_raw_blob`. See `.runtime/sdk-export-import-20260728-152250/`.
- Product projection is exactly seven columns; package schema/endpoints are unchanged; new package users are SDK-focused and omit HRIS identity/link duplication.
- Import false-success/conflict gates were hardened. No write ran because every readable Main Entrance peer already contains 874 users and Main A preview found 1 conflict; offline devices cannot be used as a backed-up target.
- Continue only after a new compatible device is added and becomes authenticated/inventory-readable. Then run backup → fresh preview → smallest multimodal canary → independent FP/face reread → remaining scope.
- No new recommendation was identified; the remaining work is the expected physical-device boundary already stated by the user.
# 2026-07-28 — Fast exact Hikvision inventory

- Main B exact UserInfo inventory improved from 21.993s sequential average to
  5.417s at page concurrency 8, with identical 874-row hash and biometric
  totals. A/F/D also matched at concurrency 8.
- Main E has intermittent 401/502 page failures, including at concurrency 1.
  The new path retries pages, requires exact `totalMatches` row/unique counts,
  and starts a fresh serialized inventory if parallel validation fails.
- Scope boundary: concurrency bypass is only for read-only UserInfo inventory.
  Capture and write operations keep the normal serialized device lane.
- Evidence:
  `.wwg/reports/hikvision-userinfo-pagination-benchmark-20260728.md`.

# 2026-07-28 Five-Device SDK Package Handoff

- Status: `PACKAGES_AND_PREVIEWS_FULFILLED_PHYSICAL_IMPORT_BLOCKED_BY_MISSING_TARGET_DEVICE`.
- Final accepted physical truth for B/A/F/D/E is identical: 874 unique IDs,
  zero duplicates, 825 FP users / 1,646 slots, 806 face users, stable hash
  `707e8800a55a44a2d106bafdc5eac2a5031bde9e9d877ebba2f96fe96b6223d1`.
- Five independent schema-v1 packages and seven-column CSV projections are
  protected under `.runtime/five-device-sdk-packages-final-accepted-20260728/`.
  Every package has 874 valid rows and all 1,646 FP slots.
- A/F/D/E contain all 806 face blobs. B contains 711 readable face blobs and 95
  explicit `missing_raw_blob` rows caused by physical face-picture 404s.
- Five existing-path import previews succeeded. B→A and E→B expose one
  `displayName` conflict at ID `1616`; the other three previews are 874 matches.
- No physical import ran: all five compatible `DS-K1T341CMFW V3.3.40` targets
  are populated with 874 users. A new blank/frozen compatible device is required.
- Focused backend tests (38), frontend UI contract, targeted lint, API and
  frontend production builds, and production-build Playwright passed. API typecheck has
  only 13 unrelated pre-existing errors and no error from this change.
- Detailed report:
  `.wwg/reports/sdk-device-user-export-import-20260728.md`.
