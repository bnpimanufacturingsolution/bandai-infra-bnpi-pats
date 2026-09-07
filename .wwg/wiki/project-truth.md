# Project Truth

## Day-Status Review & Resolution Pipeline (2026-08-27)

- Status: `CONFIRMED_CODE_AND_LIVE_LOCAL`.
- Schedule truth: Universal Monday–Saturday schedule with Sunday rest (zero Sunday punches across 19,507 cells proves Sunday REST is safe; future Sunday work auto-classified PRESENT via punch).
- Precedence pipeline: `OUT_OF_TENURE` > `REST_SUNDAY` > `PRESENT_PUNCH` > `PRESENT_SCHEDULE_POSITIVE` > `ABSENT_AWOL_EVIDENCED` > `LEAVE_PAID` > `LEAVE_UNPAID` > `REVIEW_NO_EVIDENCE`.
- Review queue: Bare no-show days land in `REVIEW_NO_EVIDENCE` surfaced to HR with `ESTIMATE_ONLY` exposure notes; never silently auto-charged as absent (prevents ₱462.8k–₱573.5k/window of false phantom charges on 405–494 uncharged people, mostly Saturdays).
- Workbooks: AWOL workbook provides DA/disciplinary absence evidence labels (244/186 days labeled; never prices payroll). Leave workbook provides paid vs unpaid day-level breakdown.
- API Endpoints:
  - `GET /api/payrollperiod/:id/day-status-review` — DB-only bucket counts + review queue.
  - `POST /api/payrollperiod/:id/day-status-review/workbook` — In-memory refinement using multipart `leaveFile` and `awolFile` (persists nothing).
- Helper: `hris-api/helper/day-status-resolution.helper.ts` (12/12 unit tests).
- UI: `/hr/day-status-review` (AuthGuard, period selector, bucket chips, weekday histogram, review queue DataTable, CSV export, upload refine).

## Recruitment identity history (first name + last name + birthday) (2026-08-22)

- Status: `CONFIRMED_CODE`.
- Match key for previous Bandai record is **first name + last name + birthday only**. Middle name is not part of this check. Email is not the identity key.
- Sources: `Applicant.person.personalInfo` and `Employee.person.personalInfo` in the same organization.
- Purpose: **show history**, not block apply. Recruiter drawer shows previous applications (including Rejected) and employee records (including Resigned / Terminated).
- Public apply collects date of birth. `GET /api/applicant/:id` and create attach `identityHistory`. Same email + same name/birthday reuses the Person so they can apply again.
- Helper: `hris-api/helper/person-identity-history.helper.ts`. UI: recruiter candidate drawer **Previous Bandai record**.
- Gap: older applicants with no stored birthday cannot match until DOB exists on that Person.


## Beneficiaries (children/dependents) (2026-08-31)

- Status: `CONFIRMED_CODE`.
- **User-facing term**: "Beneficiaries" (UI labels, section headers, button text, comments).
- **Prisma relation**: `person.children` (schema constraint; cannot change without migration).
- **API payload key**: `person.children` (must match Prisma relation for the API to work).
- **Backend function/variable names**: `syncPersonBeneficiaries`, `beneficiaries` (not `children`).
- **Frontend local variable names**: `beneficiaries`, `addBeneficiary`, `removeBeneficiary` (not `children`, `addChild`, `removeChild`).
- **Exception**: Form field paths like `person.children.${index}.firstName` must use `children` to match the API payload structure.
- Purpose: Track employee dependents for birthday gift eligibility during payroll generation — ₱300 per birthday per person (employee + each dependent beneficiary with birthday in the payroll month).
- Backend: `syncPersonBeneficiaries()` in `hris-api/helper/employee.helper.ts` handles upsert/delete. Called in employee create/update flows. GET endpoint includes beneficiaries where `isDeleted=false`.
- Frontend: `PersonalDetailsForm.tsx` has dynamic add/remove rows (firstName, middleName, lastName, dateOfBirth, gender, isDependent toggle). `personal-info-tab.tsx` has read-only display with `Baby` icon.
- Terminology: `.wwg/wiki/terminology.md` "Beneficiaries vs children" conflict entry.


## GitOps db-init Job (2026-08-21)

- Status: `CONFIRMED_CODE` (push authorized 2026-08-22).
- Runtime Argo **Degraded** on `project-truth-runtime-{dev,uat,prod}` is Failed Job `hris-api-db-init` (`BackoffLimitExceeded`), not GǣPostgres emptyGǥ. App/API can be healthy.
- Job command is `prisma-postgres:push` only. Seed can delete timesheet/attendance rows. **Do not** seed, `prisma-reset`, or `--accept-data-loss` on UAT/PROD.
- Argo `selfHeal` will recreate the Job from git. **Do not delete** the Failed Job until `origin/develop` is schema-only (`push` only).
- GitOps Job is schema-only (`prisma-postgres:push`). Operator authorized push 2026-08-22. UAT/PROD dumps on the VM.
- Operator: `docs/DB_INIT_JOB.md`. Evidence: `.wwg/reports/db-init-repair-20260821.md`.


## Section Head & Line Leader Assignment (2026-09-07 audit)

- Status: `CONFIRMED_CODE_AUDIT`.
- **Section Head** — Fully implemented:
  - Schema: `Section.headId` (nullable FK to `Employee`) + reverse `Employee.managedSections` (1:N).
  - Admin UI: `/admin/configuration/sections.tsx` — dropdown to assign/unset head per section.
  - Backend: `sections.service.ts` CRUD includes `headId`; cleanup script clears `headId` on employee removal.
- **Line Leader** — Partial implementation (role + payroll only, no positional assignment):
  - Auth role: `hris-line-leader` exists in role derivation (`role-derivation.ts`). Treated as manager (`isManager: true`).
  - Payroll: `EmployeePayroll.lineLeaderAllowance` (Float, default 0) — LLA / Line Leader Allowance, post-net receivable.
  - Workflows: Used in boarding template, request approvals, notifications, PAN post-actions.
  - **Gap**: No `Employee.lineLeaderFor` relation, no `Position.isLineLeader`, no section/team-level assignment stored.
  - Timesheet/day-labor (2026-08-20): "Line Leader tags people per day on timesheet" — `Timesheetline.dayLaborType` (DIRECT/INDIRECT) was added but **Line Leader assignment itself is not persisted**.
- Terminology: "Section Head" (canonical), "Line Leader" (role code `hris-line-leader`).

### Section Line Leader assignment — IMPLEMENTED (2026-09-07)

- Status: `CONFIRMED_CODE_AND_LIVE_LOCAL`.
- Operator chose **multiple line leaders per section** (option B): join model `SectionLineLeader`
  (table `section_line_leaders`, unique `sectionId+employeeId`); `Section.lineLeaders` /
  `Employee.lineLeaderSections` reverse relations. An employee may lead many sections.
- Assignment screen: `/admin/configuration/sections` — "Line Leaders (optional)" multi-add
  (removable chips) beside Section Head; table column + view row + CSV column.
- **Role is now live**: membership derives `hris-line-leader` (`isManager=true`) via
  `deriveRoleAndFlags({ ..., isLineLeader })`; precedence HR > manager level > line leader
  (no downgrade of stronger org roles). Add/remove/section-delete all re-derive roles
  through `syncLineLeaderRolesForEmployees`.
- API: section create/update accept `lineLeaderIds` (same-org validated, deduped);
  `reconcileSectionLineLeaders` transactionally diffs join rows; list GET batches
  memberships. Employee hard delete now also detaches `Section.headId` (pre-existing gap)
  and deletes join rows.
- LLA money unchanged: still `EmployeeBenefit` `LLA` enrollment-driven; no auto-award.
- Tests: `tests/section-line-leaders.spec.ts` 15/15; `role-derivation.spec.ts` 55/55;
  Playwright smoke 2/2. Live proof incl. add→upgrade, remove→demote, delete→demote:
  `hris-api/.runtime/20260907-section-ll-proof/`, `.wwg/reports/section-line-leader-assignment-20260907.md`.
- Boundary: local DEV proven; VM/GitOps promotion follows develop push. Day-labor
  tagging scope (leader tags own-section people only) remains a candidate REC.

## Employee weekly hours vs schedule templates (2026-08-20)

- Status: `CONFIRMED_CODE`.
- **Schedule templates** (`/admin/configuration/schedule-templates`) are reusable org patterns (7/14-day cycles, shift types per day). Assign them to many people.
- **One employee's hours** (Zen Monday 06:00-15:00, Tuesday 07:00-16:00) live on `Employee.embeddedSchedule.pattern`. HR/admin edit that from:
  1. Dedicated roster: HR Timekeeping **Schedules** (`/hr/employee-schedules`) and admin **Employee Schedules** (`/admin/configuration/employee-schedules`). Filter by department/section, click a person to see current hours, then **Change schedule**.
  2. Employee edit form Active Schedule weekly pattern (`/hr/employees/:id/edit` or admin twin).
  3. Employee profile **Work Schedule** tab > **Change schedule** > **Days** (weekday start/end/off). `POST /api/employee-schedules` with `pattern`. Takes effect next Monday UTC and recomputes attendance obligations.
  4. Same modal **Dates** tab: pick a calendar date and set hours for that date only (`POST /api/scheduleOverride`). Not next Monday.
- A one-off date uses **schedule override**. The Dates tab is that path.
- Team assign modal can still pick a template or one manual shift for every day; it is not the per-weekday hours editor.


## Day labor on timesheet (2026-08-20)

- Status: `CONFIRMED_CODE_LOCAL`. **Do not push** until the operator says so.
- Lead requirement: Direct vs Indirect **work** can change every day. Line Leader tags people under them. Store it on the timesheet **day**.
- Field: `Timesheetline.dayLaborType` (`DayLaborType` `DIRECT` \| `INDIRECT`, nullable). Also on `AttendanceObligation` for the same day. **Not** `Employee.workforceSource`.
- UI: Timesheet day editor G�� **Day labor**. Persist when the timesheet breakdown is saved.
- The Workforce **Direct vs Indirect** report remains hire source (BNPI vs Agency). Do not mix the two.
- Line Leader is not a separate auth role yet; whoever can edit the timesheet day can set the tag (HR / manager / employee-with-edit).
- Report: `.wwg/reports/direct-indirect-lead-claim-validation-20260820.md`.


## Direct vs Indirect labor report UI (2026-08-20)

- Status: `CONFIRMED_CODE_AND_LIVE_LOCAL`. Public DEV until `6aad83c5` is serving is `NEEDS_CONFIRMATION`.
- Timesheet sheet **2.1.7** is two surfaces. Tardiness / UT / OT stay on `/hr/reports/attendance` (`tab=tardiness` / `tab=overtime`). Direct vs Indirect labor is **not** those tabs.
- Workforce Analytics (`/hr/reports/workforce`) has three tabs: Agency Attendance (`agency`), Manpower Distribution (`labor`, **default**), Direct vs Indirect (`direct-indirect`). Do not remap `labor` to this report.
- **DIRECT** = `Employee.workforceSource` is not `AGENCY`. **INDIRECT** = `AGENCY`. Employment type is not the bucket.
- Metric: `POST /api/metrics` model `Attendance`, `data=["directIndirectLaborSummary"]`. Live local 2026-08-20: **872** direct / **1355** indirect, 15 departments.
- Gender / Agency / Total Manpower blocks on this tab still come from a client employee roster and can show **0** while the API cards are filled. That is not Gǣno Direct people.Gǥ
- Operator: `docs/00-product/DIRECT_INDIRECT_LABOR_REPORT.md`. Report: `.wwg/reports/direct-indirect-labor-ui-20260820.md`.


## UAT/PROD app+API auto-roll (2026-08-20)

- Status: `CONFIRMED_CODE`. ansible-pull after a **rebuild** of `hris-api` / `hris-app` restarts those Deployments in `dev`, `uat`, and `prod` if present. Not GitHub branches. Not docs-only. Report: `.wwg/reports/uat-prod-app-api-auto-roll-20260820.md`.
- Revert: `PROJECT_TRUTH_ROLLOUT_NAMESPACES=dev`. `promote-gitops.yml` remains tag/registry promote.


## On-prem DEV/UAT/PROD ports (2026-08-20)

- Status: `CONFIRMED_LIVE`. Operator doc: `docs/ONPREM_PORT_ACCESS.md`. Report: `.wwg/reports/onprem-port-access-20260820.md`.
- One VM `10.184.37.19` publishes PROD `:3000/:3001`, DEV `:3100/:3101`, UAT `:3200/:3201`. Cloudflare `*.bnpi-hris.tech` is that VM, not a second cloud.
- VM loopback HTTP **200** on all six. This Windows host WiG��Fi **cannot** TCP those LAN ports (`host_not_on_lan`). Public API `/health` **200**.
- Observe jobs `onprem-{prod,dev,uat}-{api,app}` prove VM bind, not this laptopG��s LAN NIC.


## GitHub Actions CI / Observe / Validate (2026-08-19 documented 2026-08-20)

- Status: `CONFIRMED_LIVE_20260819`; operator 2026-08-20 authorized push of the CI/Observe harden.
- Root workflows only: `ci.yml` (per-type tests), `observe-deploy.yml` (GitHub Deployments wait on VM reporter), `validate.yml` (Windows terraform/packer/installer/self-heal). `promote-gitops.yml` is manual.
- Nested `hris-api/.github` Cloud Run and `hris-app/.github` Firebase workflows **do not run** on `bandai-infra`.
- Observe environment `success` is the VM reporter. `k8s-runtime-image-state` `services=none` still posts **success** with Gǣnot rebuilt this SHAGǥ. That is not a live API/app image SHA. `/health` has no `buildSha`.
- Live proof SHA `efc86c56`: CI + Observe + Validate green; VM ansible-pull match; Argo contract apps Synced/Healthy; runtime apps Synced/**Degraded** because Job `hris-api-db-init` Failed `BackoffLimitExceeded`.
- Full map: `.wwg/reports/devops-ci-observe-validate-20260819.md`. Evidence: `.runtime/devops-ci-validate-20260819/`.


## Hikvision biometric device clock and Manila time (2026-08-19)

- Status: `CONFIRMED_CODE_AND_VENDOR`; live 2026-08-19 GET is `NEEDS_CONFIRMATION`.
- Punch Time In/Out uses **device event time**, not HRIS `receivedAt`. Naive SDK stamps are treated as `Asia/Manila` (`+08:00`). Clocks that differ across terminals break pairing.
- Admin device console **Preview time / Update time** uses `POST /api/device/:id/time-sync`. Check and write prefer **HCNetSDK STDXML** (`NET_DVR_STDXMLConfig` GET/PUT `/ISAPI/System/time` on the VM listener binary). ISAPI HTTP is fallback if SDK cannot arm. That is Time Settings **manual** sync, **not** NTP. Health still GETs ISAPI for reachability.
- Vendor MinMoe / DS-K1T **can** set time: panel Time Settings, web Manual or NTP, Hik-Connect, iVMS Batch Time Sync, ISAPI `PUT /ISAPI/System/time`, `PUT /ISAPI/System/time/ntpServers`.
- Manila on the device is POSIX **`CST-8:00:00`** (UTC+8), DST **off**, `localTime` with `+08:00`. Not IANA `Asia/Manila`. US Central GǣCSTGǥ is a different offset.
- Surviving BNPI Time XML (2026-07-01 through 2026-08-17): `timeMode=manual`, `timeZone=CST-8:00:00`. Offset is already Manila; mode is not fleet NTP. Inter-device drift of tens of seconds was recorded (Main D ~40s ahead of B/E on 2026-08-17).
- Report: `.wwg/reports/hikvision-biometric-time-manila-20260819.md`.


## EmployeePayroll hourlySalary snapshot (2026-08-19)

- Status: `CONFIRMED_CODE`.
- **Snapshot only.** `EmployeePayroll.hourlySalary` is a `Float` default `0` written at payroll generate (and the same generate-timesheet / preview engine path). It freezes the **attendance hourly already used for OT and late/UT** on that run. It is not a live formula field after save.
- **Not Employee input.** `Employee` still has only `basicSalary` + `currency` + `payFrequency`. There is no `Employee.hourlyRate` / `Employee.hourlySalary`. Hire and edit forms do not collect hourly. `basicSalary` remains source of truth.
- **Formula (derived, then snapshotted):** hourly = daily / `workingHoursPerDay`. BNPI 313 attendance / approved-bucket path uses `BANDAI_WORKING_HOURS_PER_DAY = 8` (`daily = monthly +� 12 / 313`, then `/ 8`). Same `hourlyRate` already computed in `resolveBnpiAttendanceDailyRate` / `resolveBandaiApprovedBucketRateBasis`.
- **Existing rows** stay `0` until unpaid regenerate **or** the optional hourlySalary backfill. Regenerating writes the snapshot; paid money history is not rewritten.
- **Backfill of existing `0` rows:** `cd hris-api` then `npm run backfill:employee-payroll-hourly-salary` (dry-run default) or `npm run backfill:employee-payroll-hourly-salary:execute`. Fills `EmployeePayroll.hourlySalary` from current `dailySalary` / payroll `metadata` (`hourlyRate`, else daily ++ hours). Does **not** change payroll computation. Stored column is still not used in compute.
- **Not a Sheet2 register column.** Register mapping stays G Monthly / H Daily / I No. of Days. Do not add an Hourly Salary column to the BNPI computation workbook or treat `hourlySalary` as register parity.
- **Not SoT. Not used in current computation.** Generate/preview still price OT/late/UT/absent from in-memory `attendanceRate.hourlyRate` (daily ++ hours). They write `hourlySalary` after money is done. They do not read the stored column. The backfill also does not feed compute.
- Canonical write-up: `.wwg/reports/employee-payroll-hourly-salary-snapshot-20260819.md`.


## Zen 00010 salary, timesheet, payroll preview (2026-08-17)

- Status: `CONFIRMED_LIVE_DEV`. Timesheet sync **code** is on this `develop` push.
- Operator could not generate payroll: **Timesheet is missing for this payroll period** on Period 1 Aug 2026 (`PP-20260811-20260826`, 11G��25 Aug Manila). Hire 12 Aug 2026; no DM4/bulk draft existed.
- **Salary:** `basicSalary` G�11,000, `SEMI_MONTHLY`, PHP. Monthly display G�22,000 = Technician `minSalary` floor. Not a Sheet2 register basic.
- **Timesheet:** `cmswwobaz05mxlp01e8p71f9q` APPROVED. Fourteen `Timesheetline` rows were materialized from `AttendanceObligation` (DEV DB `127.0.0.1:55435`).
- **Preview after lines (Manila clocks):** 3 ABSENT (14G��16 Aug) G��G�2,357.14; late+UT 1,229 min G��G�2,011.76; gross G�6,631.10; SSS G�675 + PhilHealth G�331.56 + Pag-IBIG G�200; net G�5,424.54. Still preview G�� no `EmployeePayroll` row.
- **Engine:** generate reads saved lines. Empty lines G�� daily rate G�0 G�� no attendance deduct. `POST /api/payrollPeriod/:id/generate-timesheet` writes payroll from **APPROVED** timesheets; it does not create timesheets.
- **Code:** `POST /api/timesheet/:id/sync-obligation-lines`; `ensure-period-drafts` accepts `employeeIds`.
- Math: `.wwg/reports/zen-00010-payroll-preview-math-20260817.md`. Code: `.wwg/reports/zen-payroll-timesheet-code-20260817.md`.


## User-facing encoding / boarding notification titles (2026-08-17)

- Status: `CONFIRMED_CODE_AND_LIVE_DEV_ROW`.
- Operator notification showed `Onboarding Completed! +�++++GǦ`. That is UTF-8 `=���` stored as Latin-1 in `checklistItem.controller.ts`, then copied into `notifications.title`.
- **Product:** boarding complete titles are ASCII: `Onboarding Completed!` and `Exit Clearance Completed!`. Do not put emoji in those literals.
- Live DEV row `cmswtgafn0cn3lp01zmus0q06` was patched to the ASCII title. New completes stay clean after this SHA is serving.
- Same pass: documents default-icon compare, enroll ellipsis/bullet, Grafana `Open in Tempo`, migration `Level N - GǪ` descriptions, and `POST /api/employee/:id/schedules/set-active` now recomputes `AttendanceObligation` (`ScheduleChanged`) so `/hr/attendance` does not keep a leftover Off Day.
- Report: `.wwg/reports/mojibake-encoding-20260817.md`.


## Device Events TAP display and person-10 inventory (2026-08-17)

- Status: `CONFIRMED_CODE_AND_LIVE_LOCAL_GET` (commit `a6dce32`). Public DEV UI is `NEEDS_CONFIRMATION` until that SHA is serving.
- Operator tap Device D serial `9652` person `10` (Check Out, major=5 / minor=38) already set `ATTENDANCE_UPDATED` on attendance `cmsr4ngt2011jvxj4wardyw9f`. The Unknown Vendor / Unknown evidence / Direct No labels were **stale stored taxonomy**, not a failed punch.
- **Classify:** ACS `major=2` + `minor=38` empty-person is an armed-device exception (not a punch). `major=5` + fingerprint-pass / `minor=38` is `ATTENDANCE` / `TAP`.
- **GET / UI:** if stored `eventCategory`/`eventAction` is empty, `UNKNOWN`, or `UNKNOWN_VENDOR`, display uses live `classifyDeviceEvent`. SDK listener rows missing evidence stamp as `SDK_CALLBACK` + `directDeviceEvidence=true`. The **list** GET can background-heal stored columns. The **item** GET (`/api/device/events/item/:eventId`) shows the same display taxonomy but does not heal the row.
- **Callback match:** attendance lookup uses `resolveLinkedEmployeeForDevicePerson` (`deviceEmpId` or padded `employeeId`, e.g. `10`/`00010` and `01515`/`1515`). On match, the callback upserts/links `DeviceUser` and sets `deviceUserId` on the event. Pad does **not** mean `10` = `01515`.
- **Inventory this session:** DeviceUser `10` on Main B/D/E (`uzaro_zen`) was manually linked ACTIVE to employee `00010` Zen Andrei. The other unmatched DeviceUsers with no HRIS employee were left unmatched.
- Report: `.wwg/reports/device-event-tap-display-20260817.md`.


## Device Events saved-event details deeplink (2026-08-17)

- Status: `CONFIRMED_CODE_AND_LIVE_LOCAL_API`.
- Operator URL with `action=view-event&id=<DeviceEvent.id>&page=116` used to open
  **Device event details** and say the event was not on the current table page.
- **Cause:** modal resolved only `rows.find(id)` on the current saved page
  (`limit` default 10, `sort=receivedAt desc`). `page` is leftover table
  position. New listener rows shift paging; socket prepend is same-tab only.
- **Contract:** details load by id via `GET /api/device/events/item/:eventId`
  (org-scoped, uncached). Table `page=` must not gate the modal.
- Live proof: `cmsr688py002xvxwwttxhdsal` is `ATTENDANCE` / `TAP` / person `10`.
  Device D `page=116` did not contain it. Item route did.
- Local Vite (`:5175`) needs API (`:3001`) up. Cached table rows are not API proof.
- Spec: `docs/00-product/DEVICE-EVENTS-SAVED-EVENT-DEEPLINK.md`.
  Architecture: `.wwg/wiki/05-architecture/device-events-saved-event-deeplink.md`.
  Evidence: `.runtime/device-event-deeplink-20260817/`.


## Hikvision panel Select Status mapping (2026-08-13)

- Status: `CONFIRMED_CODE_AND_LIVE_DEV_DB` (audit only; no mapping implemented).
- Operator physical: Hikvision terminals show **Select Status** with Check In, Check Out, Break Out, Break In, Overtime In, Overtime Out. Users often pick **Check In** on every device. Devices do not auto-detect in vs out unless T&A mode is Auto/schedule.
- **Three vocabularies (do not mix):**
  1. Panel Select Status G�� Hikvision T&A (`attendanceStatus` / `label`).
  2. `DeviceEvent.eventAction` G�� attendance punches are `TAP` / `TAP_REJECTED`.
  3. `Attendance.status` G�� day class `PRESENT` / `INCOMPLETE` / `ABSENT` plus `timeIn` / `timeOut`.
- **Live SDK path (`EN_HCNETSDK_ALARM`):** C++ `alarm_callback` copies ACS extend `byAttendanceStatus` (0G��6) into the POST as `attendanceStatus` + `label` when `byAcsEventInfoExtend==1`. Pre-fix DEV snapshot: 0 / 32,489 SDK rows had the field. Live proof after rebuild: listener logs include `attendanceStatusPresent`. Same tap serial `9619` (person `10`, Device D) was `checkIn` on ISAPI while the pre-fix SDK POST was Not sent.
- **ISAPI / Sync path (`HIKVISION_CALLBACK`):** `AcsEventInfo.attendanceStatus` + `label` is extracted (`deviceAttendanceStatus` / `panelSelectStatus`) and stamped on persist. Device Events shows **Device status**.
- **HRIS attendance write:** when the day's punches include panel `checkIn`/`checkOut`, Time In = earliest Check In and Time Out = latest Check Out. Extra Check Ins do not become Time Out. If no panel in/out is present, first/later punch pairing still applies.
- **Hard ban:** do not treat `currentVerifyMode` as Check In/Out. Do not treat callback-controller `attendanceStatus` as panel status G�� that name is the day class from `determineAttendanceStatus`.
- Spec: `docs/HIKVISION_SELECT_STATUS_MAPPING.md`. Architecture: `.wwg/wiki/05-architecture/hikvision-select-status-attendance.md`. Report: `.wwg/reports/hikvision-select-status-audit-20260813.md`.


## Payroll Preview results on page (2026-08-12)

- **CONFIRMED_LOCAL_IMPLEMENTATION:** Preview Payroll journey is confirm G��
  progress in a **modal**, then **page-level results** when
  `previewStep=results` on `/hr/run-payroll`. Completed dry-run employee list
  is not shown inside the modal. Employee payroll summary detail remains a
  modal over the results page.
- Evidence: `hris-app/app/components/templates/common/run-payroll-template.tsx`,
  `payroll-preview-modal.ts` (`isPreviewPayrollModalStep`,
  `isPreviewPayrollResultsPage`).


## Payroll Preview includes non-submitted timesheets (2026-08-12)

- Status: `CONFIRMED_LOCAL_IMPLEMENTATION` (live API proof on host DEV clone).
- **Product rule:** On `/hr/run-payroll`, **Preview Payroll** may compute dry-run
  money for employees whose period timesheet is **not yet APPROVED**, as long as
  a timesheet exists with payroll inputs (basic salary + schedule) and effective
  lines. Each such row is **estimate-only** and must show workflow readiness
  (e.g. **Timesheet not submitted**, **Pending approval**, **Needs correction**).
- **Why money is still valid:** payroll math uses **timesheet lines** + benefits /
  loans / calculator rates. Changing timesheet status from `DRAFT` G�� `SUBMITTED`
  G�� `APPROVED` does **not** by itself change computed pay when lines are unchanged.
  Status is a **workflow gate**, not a money formula input.
- **Start Payroll unchanged:** real generation (`generatePayrollFromTimesheets` /
  Start Payroll job size) still uses **APPROVED + salary + schedule only**.
  Preview must never inflate payable / job total with draft rows.
- **Summary contract** (`GET GǪ/generate-timesheet/preview`):
  - `includedEmployeesCount` = payroll-ready (**APPROVED** + inputs) G�� Start Payroll.
  - `previewComputableEmployeesCount` = all previewable statuses with inputs.
  - `estimatedIncludesNonApproved` = true when preview set is wider than ready.
  - Row fields: `timesheetStatus`, `isPayrollReady`, `readinessKey`,
    `readinessLabel`, `metadata.estimateOnly`.
- **Statuses in preview set:** `APPROVED`, `DRAFT`, `SUBMITTED`, `REJECTED`,
  `REVISED` (`PAYROLL_PREVIEW_TIMESHEET_STATUSES`).
- **Boundary:** employees with **no timesheet** for the period still cannot get
  amounts (no lines). Generate/import timesheets first; then draft rows preview.
- **Live proof (2026-08-12):** period `PP-20260711-20260726` G��
  approved 650, payroll-ready 641, **previewComputable 834**,
  `estimatedIncludesNonApproved=true`. Evidence:
  `.runtime/preview-non-submitted-20260812/`.
- **Code:** `hris-api/helper/payroll-period.helper.ts`
  (`previewPayrollFromTimesheets`, `resolvePayrollPreviewReadiness`);
  UI `hris-app/.../run-payroll-template.tsx`,
  `hris-app/app/lib/utils/payroll-preview-modal.ts`.


## BNPI Jun 26G��Jul 10 2026 payroll tally investigation (2026-08-11)

- Status: `INVESTIGATED_CODE_AND_LIVE_PREVIEW` (fleet money not green).
- Period under study: `PP-20260626-20260711` (Sheet2 payroll computation vs
  Run Payroll / generate-timesheet preview with `calculateRows=true`).
- **Fleet result (818 compared):** 4 exact money-core tallied; 1 Alexa-near
  (01792, +� TotalReceivable G��G�0.77); majority not tallied. Evidence pack:
  `.runtime/full-tally-20260811/FINDINGS.md`,
  `.wwg/reports/bnpi-june26-jul10-payroll-tally-20260811.md`.
- **Register No. of Days (col I) definition (CONFIRMED from code + live proof):**
  - Target Sheet2 GǣNo. of DaysGǥ aligns with paid regular days G�� sum of Bandai
    timesheet `approvedBuckets.regularDays` (`sourceRegularDays`).
  - App `payrollRegister.numberOfDays` is currently `totalWorkDays` = count of
    timesheet reporting lines with `status !== REST_DAY` (includes ABSENT and
    other non-rest statuses). Implemented in `payroll-period.helper.ts`.
  - Therefore day-count can fail for every employee while OT hours and bucket
    regular days still match target. Example: Alexa target 9 / buckets 9 / app
    days 13; Rio target 12 / buckets 12 / app days 13.
- **Hard ban for tally agents:** do not treat universal day-column mismatch as
  proof that biometrics data is globally wrong. Classify day fail as
  `definition_mismatch` first; only then inspect PRESENT/ABSENT data faults.
- **Hard ban:** do not claim Gǣfixing numberOfDays will tally payroll.Gǥ BNPI
  Basic Salary is largely semi-monthly allocation when Bandai buckets drive
  rates; Gross/Net/TotalReceivable residuals are dominated by absent, late,
  OT pay/rate, loans, DMA/MHDMF2 period pin, and tax cascade.
- Alexa-era path notes: OT bucket hours apply fleet-wide strongly; BNPI 313
  attendance daily applies when buckets present; WorkSharing file upload is retired
  (REC-20260826-DAY-STATUS-REVIEW-QUEUE) in favor of Monday–Saturday schedule truth
  and Day-Status Review (`/hr/day-status-review`).


## BNPI Meal Allowance (MLA) coverage expectation (2026-08-07)

- Status: `CONFIRMED_OPERATOR_PRODUCT_TRUTH`.
- **Coverage expectation:** every Bandai / BNPI employee **should have** an
  active Meal Allowance (`MLA`) enrollment so payroll can pay MLA for each cut.
- **Still enrollment-driven:** Run Payroll does **not** invent MLA for employees
  without a resolving `EmployeeBenefit`. Missing MLA on a payslip is
  `missing_enrollment` (or date/status/scope), not engine default pay.
- **Hard ban G�� do not auto-enroll:** agents must **not** implement or run
  automatic bulk/system enroll of MLA for all employees unless the operator
  explicitly requests a deliberate enrollment job. Product note G�� auto-grant.
- **Money path when enrolled:** `BenefitType` MLA is compensation with BNPI
  wiring `RECEIVABLE_ONLY` (post-net; named field `mealAllowance`; adds to
  TotalReceivable, not GrossPay). Standing/recurring enrollments apply even when
  MLA is absent from that cutG��s compensation mass upload.
- Operator confirmation: 2026-08-07 G�� all Bandai employees should have MLA;
  keep enrollment-driven; do not auto-enroll.


## BNPI payroll compensation / deduction source ownership (2026-08-05)

- Status: `CONFIRMED_OPERATOR_PRODUCT_TRUTH`.
- **Hard ban for payroll tally work:** do **not** assume every compensation or
  deduction on the HRIS Payroll Computation register (or on a generated payslip)
  must appear in the periodG��s **compensation / deduction mass-upload** workbooks.
- Run Payroll applies money from **active `EmployeeBenefit` / `EmployeeLoan`
  sources that resolve for the payroll period**, including:
  1. **Cutoff mass upload** G�� period-scoped (or superseding) enrollments from
     DM3 compensation / deduction mass upload for that cut.
  2. **Recurring / standing enrollments** G�� benefits and deductions already on
     the employee (catalog, prior enrollment, open-horizon or multi-cutoff
     recurring) that remain active and eligible for the period **even when
     those codes are absent from the cutoff mass-upload file**.
  3. **Engine-only** lines G�� e.g. SSS Cont / PhilHealth / Pag-IBIG (BNPI
     semi-monthly schedule: period 1 full, period 2 zero), W/Tax from taxable
     gross. Not mass-upload rows.
  4. **Attendance / OT path** G�� basic/absent/UT, approved OT buckets (DM4), not
     mass-upload compensation.
- **Tally method:** for each register or payslip line, classify source as
  `mass_upload` | `recurring_enrollment` | `engine` | `ot_attendance` |
  `missing_enrollment` before blaming incomplete mass files or inventing
  imports. Missing from mass upload is **not** proof the line should be zero if
  a valid recurring enrollment exists (and is in period scope).
- **Stacking guard:** when both a period-scoped mass-upload enrollment and an
  open-horizon peer exist for the same employee + benefit code, generation
  prefers period-scoped and mass import supersedes open-horizon peers (anti
  double ARP). Recurring truth remains valid when no period-scoped peer exists.
- Operator confirmation: 2026-08-05 G�� not all compensation/deduction comes from
  mass upload; recurring benefits apply without a mass-upload row.
- Related checklists: `docs/BNPI_JUNE26_JULY10_2026_PAYROLL_PARITY_CHECKLIST.md`,
  `docs/BNPI_JUNE11_25_2026_PAYROLL_PARITY_CHECKLIST.md`,
  `docs/dm-migration-workflow.md` (DM3 mass upload is additive cutoff path, not
  sole benefit source).


## Shared DEV/UAT/PROD observability recovery (2026-07-28)

- Status: `CONFIRMED_VM_GITOPS_PUBLIC_BROWSER`.
- Prometheus has three healthy environment API targets and nine healthy
  blackbox probes covering each PROD/DEV/UAT app, API, and employee frontend
  host port; no target is down and no alert is firing.
- Loki has current `prod`, `dev`, and `uat` logs. The OpenTelemetry collector
  has zero refused or failed spans, and Tempo returns traces for
  `hris-api-prod`, `hris-api-dev`, and `hris-api-uat`.
- Public `https://grafana.bnpi-hris.tech` authentication and the API Health,
  Overview, Logs, and Traces dashboards pass headless Playwright without
  no-data panels, datasource errors, page/console errors, or HTTP 5xx.
- Backup now creates atomic, validated PostgreSQL custom dumps of Grafana's
  durable database only. Mutable telemetry stores use their own retention
  policies. Defaults retain four rolling and two full dumps.
- Tempo was upgraded from 2.6.1 to supported 2.10.5 while preserving vParquet4
  data. Cloudflare remained enabled/active and all six Argo applications were
  `Synced/Healthy`.
- Evidence: `.runtime/observability-audit-20260728-142401/`.


## DEV/UAT/PROD data parity snapshot (2026-07-24)

- Status: `CONFIRMED_K3S_RUNTIME_WITH_PUBLIC_NETWORK_BOUNDARY`.
- The verified K3s DEV `hris` PostgreSQL snapshot from 2026-07-24 was restored
  into UAT and PROD after SHA-256-verified pre-clone backups of all three
  databases and upload volumes.
- DEV, UAT, and PROD now match on 75 public tables and current business counts,
  including 2,225 employees, 2,048 users, 8,680 documents, 42 workflow
  instances, 87,217 attendances, 10,965 timesheets, 129,255 timesheet lines,
  5,692 device users, and 20,374 device events.
- All three environment upload volumes contain the same 71-file SHA-256 set.
  DM import/source files remain shared VM host paths already mounted into every
  environment; Kubernetes secrets and per-environment configuration were not
  replaced.
- LAN PROD/DEV/UAT app/API routes, admin authentication, `/api/auth/me`, and
  headless browser dashboard entry passed. All six Argo CD applications were
  `Synced/Healthy` at revision `3c831d8`.
- The VM-managed Cloudflare service stayed enabled/active, but public HTTPS
  from the BNPI workstation still reset at TLS. Public reachability is
  `NEEDS_CONFIRMATION` from an unfiltered external vantage point.
- Rollback/evidence:
  `.runtime/dev-to-uat-prod-20260724-144222/REPORT.md` and VM backup directory
  `/var/lib/project-truth/backups/dev-to-uat-prod-20260724-144222`.

Adoption status: INFERRED_FROM_EXISTING_PROJECT
Status: Inferred from repository evidence. Requires human/agent review before becoming accepted project truth.
Truth confidence: HIGH
Last adoption audit: 2026-06-29

This file was populated from existing code, documentation, package metadata, configuration, and observed implementation.

Items marked `INFERRED`, `NEEDS_CONFIRMATION`, `CONFLICTING`, or `STALE` should be reviewed before major future work.

If this file conflicts with lower-priority reports, generated notes, task files, or stale documentation, this file wins once confirmed.

Project Truth must not be silently overwritten. Requirement evolution is allowed when documented and accepted.


## Credential Recovery Queue Truth (2026-07-24)

- Status: `CONFIRMED_CODE_EVIDENCE_WITH_RUNTIME_BOUNDARY`.
- The Merge device users UI's current `Recovery queued` headline is not a
  durable or executing backend queue. The backend assigns recovery-stage
  classifications while building a plan, and the frontend counts operations
  that are neither selectable nor locally classified as requiring physical
  action. No recovery worker consumes that displayed population.
- `Ready now 0` means the displayed plan has zero recommended operations with
  `executionEligibility=ready_from_raw_blob` that pass the frontend physical
  action filter. It does not mean there are no gaps and does not prove recovery
  is running.
- The currently callable software-recovery primitive is selected per-device
  biometric metadata backfill followed by a fresh plan, guarded merge write,
  and physical target reread. Historical selected batches recovered 209/209
  and 21/21 source rows, but this does not prove automatic recovery.
- The 2026-07-24 operator screenshot is historical evidence only: 3,257
  potential operations, 505 fingerprint, 2,630 face, 122 card, ready 0,
  recovery queued 3,237, and headline physical action 20. Its backend stage
  summary reported physical identity action 18. The 18-versus-20 total is
  `CONFLICTING` because the frontend and backend use different classification
  logic.
- A future honest running state requires a durable recovery job, task/worker
  leases, heartbeat, resume cursor, deduplicated source custody work, shared
  physical-device locks, pollable stage timings, and physical-reread-owned gap
  counters. Until then, use `Recovery needed` rather than `queued`.
- Architecture and evidence:
  `docs/00-product/HIKVISION_CREDENTIAL_RECOVERY_ARCHITECTURE.md`.


## Confirmed Local DEV and Sync Center Runtime Truth (2026-07-23)

- Canonical Windows hot-reload PostgreSQL is the K3s DEV forward at `127.0.0.1:55435`; compose DEV is not an automatic fallback.
- Local app/API are `http://localhost:5175` and `http://localhost:3001`. API startup probe-first restores required DB, A-F device forwards, VM reverse API/callback port `53001`, and the listener path. Optional TEST A/B bridges must not hold API startup open.
- Main Entrance A-F use host-forward HTTP `10080-10085`, HTTPS `10443-10448`, and SDK `18000-18005`. Health requires traffic proof, not merely an SSH process or listening port.
- Sync Center merge availability is sourced from bounded per-device quick health. Missing `vendorUserCount` from `sync-preview?quick=true` is not offline evidence.
- Transport-online and full inventory-readable are separate truths. Read-only merge planning preserves partial reads, reports exact failures, and must not start physical writes without reviewed scope.
- Saved `DeviceEvent` rows are PostgreSQL truth independent of listener readiness; background listener checks cannot clear or replace the saved ledger.
- Hikvision SDK command routing is execution-location aware. Windows hot reload uses the VM bridge and reverse API `53001`; a native API process on the Linux VM executes the SDK wrapper locally with no SSH; K3s/Docker API containers use only the direct same-VM control target and their VM-local API port (`3001` PROD, `3101` DEV, `3201` UAT), with no Cloudflare SSH fallback and no callback route back to Windows. Container-to-host command execution remains an internal SSH boundary until a VM-local SDK control service or sidecar replaces it.
- Evidence: `.runtime/sync-center-dev-green-20260723-114317/` and `.wwg/reports/wwg-agent-handoff.md`.

### Current device-count conflict and write boundary

- Operator physical evidence reports exactly five Main Entrance devices online
  and Main Entrance Device C down.
- Earlier A-F quick-health responses are weaker, conflicting transport evidence;
  they do not establish six physically online or inventory-readable devices.
- The conflict must be root-caused across device identity, tunnel mapping, cache,
  endpoint semantics, authentication, and full inventory logs.
- The previous merge pass stopped at a read-only plan with zero write requests.
  It is not a completed merge. An explicitly authorized merge task must continue
  through frozen-scope write execution, terminal monitoring, failure repair, and
  post-write physical rereads.


# Project Truth


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
- Item: Current workspace source shape includes `hris-api`, `hris-app`, and `hris-emp-app`, with `hris-emp-app` vendored into the repo root as a git submodule on the upstream `develop` branch and integrated through parent-owned Compose/K3s runtime wrappers.
  - Status: IMPLEMENTED_FROM_USER_REQUEST
  - Evidence: `.gitmodules`; `hris-emp-app`; `appliance/docker-compose.yml`; `appliance/docker-compose.environments.yml`; `gitops/runtime-k8s/overlays/dev/runtime.yaml`; `gitops/runtime-k8s/overlays/uat/runtime.yaml`; `gitops/runtime-k8s/overlays/prod/runtime.yaml`.
- Item: Local/VM employee self-service runtime now uses dedicated frontend ports `3300` (PROD), `3310` (DEV), and `3320` (UAT), while proxying browser `/api` and `socket.io` traffic to the paired `hris-api` ports.
  - Status: IMPLEMENTED_FROM_USER_REQUEST
  - Evidence: `appliance/dockerfiles/hris-emp-app.nginx.conf.template`; `appliance/docker-compose.yml`; `appliance/docker-compose.environments.yml`; `scripts/configure.ps1`; `scripts/verify-host-health.ps1`; `scripts/verify-lan-health.ps1`.
- Item: Employee-app public Cloudflare targets are `emp.bnpi-hris.tech`, `dev-emp.bnpi-hris.tech`, and `uat-emp.bnpi-hris.tech`, each serving the employee frontend while same-host `/api` and `/socket.io` routes stay pinned to the paired per-environment API origin.
  - Status: IMPLEMENTED_FROM_USER_REQUEST
  - Evidence: `cloudflared-bnpi-hris.yml`; `scripts/start-bnpi-cloudflare-tunnel.ps1`; `appliance/bin/project-truth-cloudflare-vm-tunnel.sh`; `appliance/env/hris-api.env`.
- Item: PROD, DEV, and UAT employee portals are runtime-proven through the VM-managed `bnpi-hris` tunnel: frontend origins `3300/3310/3320`, paired APIs `3001/3101/3201`, same-host public API routing, linked-employee login, authenticated refresh, and logout all pass. The employee image is now included in governed VM build/import and environment restart handling so `NeverPull` pods do not recur after reconciliation.
  - Status: CONFIRMED_RUNTIME_EVIDENCE
  - Evidence: `.runtime/employee-portals-recovery-20260728-122800/final-vm-origin-matrix.txt`; `.runtime/employee-portals-recovery-20260728-122800/final-public-http-api-matrix.json`; `.runtime/employee-portals-recovery-20260728-122800/playwright-final-results.json`; `.runtime/employee-portals-recovery-20260728-122800/argocd-six-apps-c0.txt`; `ansible/project-truth-pull.yml`; `gitops/runtime-k8s/overlays/dev/runtime.yaml`; `gitops/runtime-k8s/overlays/uat/runtime.yaml`; `gitops/runtime-k8s/overlays/prod/runtime.yaml`.
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
- Item: Local DEV Hikvision reverse forwarding treats an armed quiet listener as stable; only a stopped, unarmed, or genuinely login-failed listener should be force-rearmed. `receiving` is a short freshness signal, not tunnel-process liveness. TEST A is DB-configured at `192.168.254.102`, reached by Windows on TCP `8000`/`443`, and exposed to the VM listener as loopback `59000`/`59443`; VM ICMP ping to the physical address is not reverse-tunnel proof.
  - Status: CONFIRMED_LOCAL_RUNTIME_EVIDENCE_WITH_BOUNDARY
  - Evidence: On 2026-07-19, VM loopback `53001`, `59000`, and `59443` remained listening, callback posts succeeded, and listener PID `2458362` stayed unchanged from `11:04:27Z` through `11:09:55Z` after Keep-ready stopped restarting armed/quiet state. Boundary: local Windows/VM DEV proof; public/GitOps promotion is separate.
- Item: Local DEV Hikvision authentication callbacks have an independent immediate delivery lane; slow empty-person lifecycle/operation identity enrichment must not share their active worker or hold the callback spool mutex during HTTP.
  - Status: IMPLEMENTED_LOCAL_RUNTIME_WITH_BOUNDARY
  - Evidence: On 2026-07-19, `vendor/hikvision-linux/hikvision_biometric_service.cpp` was changed to use two bounded immediate workers and one separate enrichment worker, attendance HTTP attempts were bounded to five seconds with durable spool replay, lane notifications wake all predicate-specific consumers, and callback replay tracks in-flight files without serializing HTTP. Fourteen focused tests and a Linux HCNetSDK compile passed. The managed VM listener rebuilt from source hash `c2493e7630c33cff14aad070ff74838a584104ec31cebdf62893abc14c7e249d`; its running ELF contains `callback_immediate_ready`, and live no-person operation serials `3979`/`3980` entered `lane=enrichment`. Boundary: a physical post-deploy major-5 attendance tap is still `NEEDS_CONFIRMATION`; GitOps/public promotion is separate. Evidence: `.wwg/reports/hikvision-attendance-fast-lane-20260719.md`.
- Item: Hikvision integration exists through HRIS API `/api/hikvision/callback`, ISAPI client helpers, device event persistence, admin device event UI filters, and realtime `device-event:saved`; editable Linux source is tracked as `vendor/hikvision-linux`, while proprietary HCNetSDK binaries remain local-only runtime inputs.
  - Status: CONFIRMED_CODE_EVIDENCE
  - Evidence: docs/HIKVISION_RUNTIME_TRUTH.md; hris-api/app/hikvision; hris-api/helper/hikvision-event-contract.helper.ts; hris-api/tests/hikvision-event-contract.helper.spec.ts; hris-app/app/routes/admin/devices/events.tsx; vendor/hikvision-linux.
- Item: Hikvision create/enroll biometric custody is dual-plane after a plain device person id is evidenced: DeviceUser holds current raw fingerprint/face custody, while USER_CREATED and FINGERPRINT_ENROLLED DeviceEvent payloads also retain the same usable blobs. Automatic ISAPI capture after plain-id resolution is the happy path; the UI Capture action is repair-only. UserInfo enrichment must preserve callback-owned raw custody with an optimistic `updatedAt` merge/retry so a slower inventory write cannot erase the saved template.
  - Status: CONFIRMED_LOCAL_RUNTIME_EVIDENCE_WITH_BOUNDARY
  - Evidence: On 2026-07-19, TEST A person `15` remained `numOfFP=1`, a same-person (non-donor) rewrite completed with device progress status 6 and sticky read-back, DeviceUser `cmrrkhpba00017ziwplzxgkce` stored one 684-character raw base64 template, and saved FINGERPRINT_ENROLLED rows stored the same 684-character template with plain `employeeNo=15`, the DeviceUser FK, and custody `raw_on_event_and_device_user`. Socket evidence delivered saved lifecycle rows with plain `15` while opaque tokens remained in payload evidence. Boundary: the existing-person ACS callbacks themselves still carried empty employee identity and zero templates; HRIS logSearch/plain-id resolution plus automatic ISAPI capture closed the journey. Person `15` has `numOfFace=0`, so no face is claimed. Evidence pack: `.runtime/cpp-first-create-enroll-raw-20260719-200043/`.
- Item: `DeviceEvent` is the single saved source of truth for physical-device events; current device inventory is a separate evidence plane and cannot create lifecycle history by itself.
  - Status: CONFIRMED_LOCAL_RUNTIME_EVIDENCE_WITH_BOUNDARY
  - Evidence: On 2026-07-16, Main Entrance Device A at `10.184.38.173:443` directly returned 167 users, 162 users with fingerprints, 161 with faces, 109 with cards, and 2,107 device logs. A frozen window returned 70 ACS rows whose serials matched 70/70 saved SDK `DeviceEvent` rows. `ContentMgmt/logSearch` returned 23 rows across two raw XML pages; all 23 saved with direct evidence and a repeat execution reported 23 duplicates. Cleanup preview and backup isolated 219 false current-state lifecycle rows (120 `USER_CREATED`, 99 `FINGERPRINT_ENROLLED`) with zero attendance links; execute deleted those rows and zero attendance, and postcondition preview returned zero. Retained rows carry evidence source/directness/raw vendor evidence, and API action/evidence summaries reconcile to saved-row totals. Boundary: proof is local/shared-DEV runtime evidence; full historical 2,107-row ACS serial reconciliation and GitOps/public promotion remain open. Detailed evidence: `.wwg/reports/hikvision-device-events-sync-center-current-state-20260716.md`.
- Item: `DeviceUser` is the durable admin device identity/enrollment record for the simplified device-management architecture; `EmployeeDeviceEnrollment` is not required on current evidence.
  - Status: CONFIRMED_LOCAL_IMPLEMENTATION_WITH_BOUNDARY
  - Evidence: On 2026-07-06 local hot-reload implementation added `DeviceUser` with direct optional `employeeId`, unique `organizationId + deviceId + vendorUserId`, status values `ACTIVE`, `UNMATCHED`, `CONFLICT`, and `DISABLED`, source payload fields, sync timestamps, and relations from `Device`, `Employee`, and `DeviceEvent`. Hikvision `UserInfo/Search` sync upserts `DeviceUser` rows and auto-links only exact unambiguous employee matches; manual link/unlink exists for admin correction. Event import now resolves `DeviceEvent.employeeNo` / `vendorUserId` through `DeviceUser(deviceId + vendorUserId)` before falling back to legacy `Employee.deviceEmpId`. Legacy `Employee.deviceId` and `Employee.deviceEmpId` remain for compatibility. On 2026-07-13 `DeviceUser.vendorMetadata` was added as additive JSON/JSONB storage for per-device vendor SDK/ISAPI user metadata while preserving `rawPayload`; the Sync Center details modal exposes the value through a preview tooltip and expandable JSON. The earlier 2026-07-14 encrypted-envelope export proof is now STALE for the active Device Users export/import journey. As of 2026-07-20, owner requirement and implementation direction are raw biometric custody: package CSV/Excel/JSON uses evidenced raw fingerprint fingerData and raw face/image blobs from DeviceUser, with matching DeviceEvent payload fallback, and uses explicit `not_enrolled`, `missing_raw_blob`, or `not_requested` statuses when bytes are absent. Boundary: physical target-device write-back still requires focused SDK proof; no biometric values may be fabricated from counts.
- Item: Device-user sync and device-log sync are separate admin workflows, with review/confirmation before the user sync mutates identity records.
  - Status: CONFIRMED_LOCAL_UI_EVIDENCE_WITH_BOUNDARY
  - Evidence: On 2026-07-06 local browser proof at `localhost:5175/admin/configuration/devices?deviceId=cmpxw13hx002h7zwso7dyedrn&action=enroll-users` showed the `Device Users` modal, device row dropdown link `View Device Users`, `Review sync` as the first action, and a final `Sync device users` confirmation inside the status modal. The copy distinguishes identity records from attendance/device logs. Screenshot evidence: `.runtime/browser-evidence/screenshots/device-users-review-sync-modal.png`. As of 2026-07-21, Device Users sync first builds a missing-record decision matrix from saved HRIS `DeviceUser` truth, source summary evidence, missing raw custody, stale/no-data evidence, and sync capability. The sync-job start endpoint supports non-mutating `dryRun=true` planner proof before job creation. The default fast job targets actionable missing work (`needs_attention_only`) and skips source-device user rereads when the matrix says saved HRIS state is sufficient. Already-present rows and known no-data/stale count-only rows do not dominate default runtime, and biometric bytes must not be fabricated from counts. Evidence: `.runtime/sync-center-decision-matrix-20260721-110520/` and `.runtime/sync-center-dry-run-scope-20260721-112157/`.
- Item: Device sync run summaries persist known skipped device-log rows so preview can distinguish saved, known skipped, failed, and truly missing source records.
  - Status: CONFIRMED_LOCAL_RUNTIME_EVIDENCE_WITH_BOUNDARY
  - Evidence: On 2026-07-06 local Hikvision log sync processed 982 source rows for `Main Entrance Device`, saved/imported 376, classified 606 as skipped/known skipped, failed 0, and left missing 0. A `DeviceSyncRun` row records those counts, and the admin events preview labels `Known skipped` separately from `Still missing`. Boundary: local hot-reload proof only until GitOps/K3s/public DEV is promoted and verified.
- Item: Hikvision can partially run through Linux diagnostics, and the active C++ HCNetSDK source is now the Project Truth `hikvision-biometric-service`, but Linux SDK login/alarm arm/tap proof is not yet proven from a reachable runtime.
  - Status: CONFIRMED_CURRENT_BOUNDARY
  - Evidence: docs/HIKVISION_RUNTIME_TRUTH.md records DEV VM/K3s `hris-hikvision-watcher` ACS-pull proof and current SDK research showing Hikvision publishes a Linux 64-bit Device Network SDK; `vendor/hikvision-linux` now contains a read-only TCP/ISAPI Python diagnostic, VM discovery wrapper, Dockerfile, and Project Truth-named C++ `hikvision_biometric_service.cpp`. On 2026-07-09, the old active `hcnetsdk_alarm_probe` source/build path was removed; the service now queues ACS alarms and posts them to `/api/hikvision/callback` with source `EN_HCNETSDK_ALARM`, leaving the existing callback controller as the single owner of `DeviceEvent` persistence, attendance/timesheet projection, and `device-event:saved` socket emission. Local endpoint preview proved the active `Main Entrance Device` HRIS row as `10.184.37.139:80` / `http`, model `DS-K1T341CMFW`, SDK port `8000`, and did not save the preview marker. Initial VM `10.184.37.19` build/link proof against HCNetSDK passed and proved `NET_DVR_Init` plus callback registration, but that VM could not route to `10.184.37.139:80/8000`. Later same-day host-test VM `10.184.37.241` reached `10.184.37.139` by ping, TCP `80`, and TCP `8000`, built the current service source, and again proved SDK init/callback registration. Boundary: real `NET_DVR_Login_V40` still failed with HCNetSDK error `1` because no documented Hikvision credential pair was available from VM env, Docker env, Kubernetes env, local config, or previous evidence searched; alarm arm and real physical tap callback remain unproven. Non-production callback simulations proved saved `DeviceEvent`, `device-event:saved`, and browser live-row behavior only.
- Item: Hikvision biometric enrollment sync target architecture is Linux/VM-owned HCNetSDK alarm callback plus queued reconciliation, not Windows AlarmDemo runtime.
  - Status: TARGET_ARCHITECTURE_PENDING_IMPLEMENTATION
  - Evidence: User architecture request on 2026-07-09; `.wwg/wiki/05-architecture/hikvision-biometric-sync-architecture.md`; local Windows reference source `C:\Users\anoni\OneDrive\Desktop\HRIS-PROJECT\EN-HCNetSDKV6.1.9.4_build20220412_win64\AlarmDemo.cpp`. The reference code shows multi-device SDK login, `NET_DVR_SetDVRMessageCallBack_V51`, alarm arming, ACS classification, user sync, fingerprint read/write, broker enrollment, queued employee sync, and event-triggered reconcile. Target Linux implementation should use Project Truth service names such as `hikvision-biometric-service` or `hikvision-alarm-listener`, load devices from HRIS `Device` rows, queue reconcile work from enrollment/user-change callbacks, sync user/fingerprint records to peer biometric devices, and persist HRIS `DeviceUser`/biometric metadata with dry-run/audit gates. Boundary: raw fingerprint template storage in normal `User` records is not approved without encryption/access-control/retention design; destructive device operations require backup/recovery proof; Linux HCNetSDK login/alarm callback remains unproven until VM/device evidence passes.
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
- Item: Hikvision watcher runtime must use HRIS Device config as the single device-address truth.
  - Status: CONFIRMED_LOCAL_RUNTIME_EVIDENCE_WITH_GITOPS_PATCH
  - Evidence: On 2026-07-02, SSH to active VM `10.184.38.138` showed DEV `hris-app`, `hris-api`, `hris-postgres`, and `hris-hikvision-watcher` pods running against the then-configured `Main Entrance Device` row `10.184.38.215:80` / `http`; that IP is now historical evidence, not a manifest constant. On 2026-07-08, local DEV showed the active `Main Entrance Device` row `cmpxw13hx002h7zwso7dyedrn` configured as `10.184.38.96:80` / `http` with `vendor=Hikvision`, `source=vendor/hikvision-linux`, `sdkPort=8000`, and `webhookPath=/api/hikvision/callback`. `scripts/audit-hikvision-device-events.ts --all-hikvision --limit=10 --apply --watch --until-clean --loops=1` discovered that device from the DB, saved employee-bearing rows through the `HIKVISION_CALLBACK` path, and reported `gap.missingWithEmployeeNo=0`. `gitops/runtime-k8s/overlays/dev/runtime.yaml` now calls `--all-hikvision` and no longer sets a hardcoded `HIKVISION_DEVICE_ADDRESS`. Local Windows-host bootstrap explicitly does not start a Hikvision watcher; the ongoing watcher owner remains the Linux/VM runtime. GitOps/K3s rollout proof after this patch remains required.
- Item: Current DEV Hikvision callback/save truth is VM-owned, while localhost admin live-update truth still has a socket-delivery boundary.
  - Status: CONFIRMED_RUNTIME_EVIDENCE_WITH_BOUNDARY
  - Evidence: On 2026-07-08, the active DEV K3s `hris-hikvision-watcher` Deployment was stale and unhealthy: pod args still used `--deviceAddress` with `HIKVISION_DEVICE_ADDRESS=10.184.38.215`, and K3s pod recreation was blocked by missing sandbox image `rancher/mirrored-pause:3.6`. The real working Linux path was the VM Docker image `hris-api-db-init:develop` patched to image ID `ab9bce3e9182`; that watcher resolved `Main Entrance Device` from the HRIS DB as `10.184.38.96:80` / `http` and saved physical-device rows through `/api/hikvision/callback`, including employee-bearing serials `1156`, `1154`, `1153`, and `1151` as `DeviceEvent` rows `cmrbky6930063la014qvsjusl`, `cmrbl3h390069la01atoi7pl0`, `cmrbl5hoe006fla01ngkb2592`, and `cmrblc0o4006zla01hbejrc3e`; localhost admin browser proof on `http://localhost:5175/admin/configuration/devices/events?view=saved&deviceId=cmpxw13hx002h7zwso7dyedrn&source=HIKVISION_CALLBACK&sort=eventTime&order=desc` rendered the saved `Jul 8, 2026, 12:17 PM` rows for `Ernst tey Malasa` from `10.184.38.96`. The same investigation proved a boundary: the original localhost app talked to host-local API/socket `localhost:3001`, so it only observed VM callback writes through shared DB reads; after local retargeting to `localhost:3101` bridged to the VM DEV API, the page did connect to `ws://localhost:3101/socket.io`, but a fresh callback write at `2026-07-08T04:44:34.451Z` still did not change the page total within 12 seconds. Current truth: physical callback save into the VM-backed DEV DB is proven; immediate localhost `device-event:saved` delivery remains unproven and the UI must not imply that it is already verified.
- Item: Hikvision UAT temporary seed can match employee no. `1` and create attendance through the callback path.
  - Status: TEMPORARY_UAT_RUNTIME_EVIDENCE
  - Evidence: On 2026-06-30, the UAT K3s `Main Entrance Device` row `cmqqv5x45002ele3dqt3a233i` was corrected to `192.168.254.181:80` / `http`; temporary employees `UAT-HIK-001` through `UAT-HIK-005` were created with `deviceEmpId` values `1` through `5`; a callback-shaped Hikvision punch for employee no. `1`, `major=5`, `minor=38`, event time `2026-06-30T16:17:07+08:00`, and device IP `192.168.254.181` saved UAT device event `cmr0hh22y0025nq011uukvetx` with status `ATTENDANCE_CREATED`, matched employee `uat-temp-hikvision-employee-1`, and created attendance `cmr0hh27a0027nq01elxja5k7`. Playwright headless browser verification on `https://uat.bnpi-hris.tech/admin/configuration/devices/events?view=saved` showed `UAT Hikvision Temp Test 1`, no. `1`, `Main Entrance Device`, `192.168.254.181`, and save path `Device callback`. Boundary: this is temporary UAT seed/callback proof; UAT API pod health against `192.168.254.181:80` returned `EHOSTUNREACH`, so UAT physical ACS pull remains unproven.
- Item: Current Hyper-V proof VM exists as `project-truth-local-vhdx-proof` on the `ProjectTruth-External` switch.
  - Status: CONFIRMED_RUNTIME_EVIDENCE
  - Evidence: `Get-VM` and `Get-VMNetworkAdapter` on 2026-06-29 showed VM `project-truth-local-vhdx-proof`, Generation 2, attached to switch `ProjectTruth-External`.
- Item: Current canonical Project Truth LAN/runtime target is pure static address `10.184.37.19`; `10.184.37.78` is retained only as a secondary transition address/TLS SAN until all runtime surfaces have reconciled.
  - Status: CONFIRMED_RUNTIME_EVIDENCE
  - Evidence: 2026-07-03 operator SSH through `ssh project-truth-hris` reached `project-truth-node`; `eth0` showed `10.184.37.78/24` and `10.184.37.19/24` with `dhcp4: false` and default route `10.184.38.254 on-link`. Read-only probes from inside the VM proved ping, SSH, and PROD/DEV/UAT API health on `10.184.37.19`; ansible-pull now persists `PROJECT_TRUTH_LAN_IP=10.184.37.19`, writes `10.184.37.19/24` before `10.184.37.78/24`, and reconciles K3s `node-ip` / `advertise-address` to `10.184.37.19` while retaining `10.184.37.78` as a TLS SAN. 2026-07-01 SSH to historical transient address `10.184.38.144` and earlier `192.168.254.148` are retained as non-current interface evidence.
- Item: Host-local VM drift checks should use direct LAN SSH before public Cloudflare SSH aliases.
  - Status: ACCEPTED_RUNTIME_OPERATING_RULE
  - Evidence: User correction on 2026-07-08; direct Windows-host SSH to `infra@10.184.37.19` with `%USERPROFILE%\.ssh\node-health-appliance_ed25519` returned hostname `project-truth-node`, user `infra`, and `eth0` addresses `10.184.37.19/24` then `10.184.37.78/24`. Use `ssh project-truth-hris` as fallback or explicit public-path proof, while keeping the VM-managed Cloudflare Tunnel active.
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

- Item: Main Entrance Hikvision DEV inventory is six active rows on `10.184.37.20` through `10.184.37.25`; Windows localhost hot reload reaches those VM-routable terminals through one SSH tunnel map covering HTTP `80`, HTTPS `443`, and SDK `8000` for every address.
  - Status: CONFIRMED_LOCAL_AND_K3S_RUNTIME_EVIDENCE_WITH_PUBLIC_BOUNDARY
  - Evidence: On 2026-07-22, direct LAN SSH to `infra@10.184.37.19` succeeded. K3s DEV Postgres returned six active rows: B `.20`, A `.21`, C `.22`, D `.23`, E `.24`, and F `.25`, all HTTPS `443` with SDK `8000`. VM probes reached all six on TCP `80/443/8000`; K3s DEV quick health reported all six online. The prior Windows bootstrap mapped only `.20-.23`, which made `.24/.25` fall back to unavailable direct Windows routing and display offline. The default tunnel/predev set was extended to `.20-.25`; after API restart, local quick health and Playwright reported all six online through `env_tunnel_map`, and full authenticated health for `.24/.25` read device system time successfully. Boundary: LAN/K3s and localhost are proven, but public `bnpi-hris.tech` ingress returned Cloudflare 503/TLS resets while the named service remained active; QUIC and two additive HTTP/2 connector attempts from VM source `.19` and `.78` all hit edge TLS/control-stream resets. Evidence root: `.runtime/hikvision-six-device-20260722-143712/`.


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


## Device Sync Progress And Availability Boundaries

- Status: CONFIRMED by source, direct API timing, and headless Playwright on 2026-07-15.
- Biometric extraction may outlive a modal. Its job state must remain visible and reopenable, with processed, captured, failed, cached, remaining, current item, elapsed time, and last-update evidence. Closing the modal does not cancel the job.
- A persisted `processing` device-user sync snapshot is active only while it has recent progress evidence. If the stored job has not updated for 30 minutes, the API/UI must treat it as stopped/stale and require a fresh admin-triggered Sync device users run instead of reviving it on app/dev-server startup.
- A credential count is inventory evidence only. Failed or missing SDK bytes remain a failed modality and must not be promoted into a portable envelope.
- Device merge and log previews use bounded concurrent availability checks. Offline/unavailable devices are identified and skipped; they must not block available devices. Background refetch preserves the last usable rows rather than replacing the table with a full loading skeleton.
- Hikvision device-user merge preview must show one selectable merge row per unique device/vendor person ID read from the selected physical devices. Saved HRIS `DeviceUser` rows may attach link/status/manual-link context, but they must not drive the unique-ID count or collapse two different vendor IDs into one selectable unique ID. Duplicate source rows for the same device/user ID are truth/evidence to collapse and report; they must not create duplicate "unique ID" choices. Evidence: `.runtime/merge-strict-device-id-truth-20260721-113511/api-merge-plan-strict-device-id-summary.json`.
- Evidence: `.runtime/device-preflight-latency-20260715-151721/` and `.runtime/biometric-portability-proof-20260715-114841/playwright-main-c-background/`.



## Integration employee-search API (2026-09-04)

- Status: `CONFIRMED_CODE_AND_LIVE_LOCAL`.
- `GET /api/employee/search` is the canonical integration employee lookup for external apps: JWT or `X-API-Key` (env `INTEGRATION_API_KEYS`, comma-separated, fail-closed 503 when unset). Handler `searchEmployees` in `hris-api/app/employee/employee.controller.ts`; route registered before `/:id` in `employee.router.ts`; guard `middleware/integrationApiKey.ts` wired in `index.ts` for `X-API-Key`-bearing `/employee/search` requests only.
- Contract: `query` (aliases `q`/`search`, required) with AND-of-terms matching over employeeId/fullName/name parts/email; fuzzy typo tolerance (Damerau-Levenshtein per word, distance cap 1 for 3-6 char terms, 2 for 7+, 1-2 char terms exact-only); `page`/`limit` (cap 100) with honest `pagination`; `sort=relevance|employeeId|employeeId:desc|fullName|fullName:desc`; exact filters `employmentStatus`/`employmentType`/`departmentId`/`positionId`. Pool query applies structural filters only (take 5000) so typo-only candidates reach the scorer; named sorts page matched rows only. Row shape excludes salary/payroll data. 30s per-query-string cache. Activity-logged (`SEARCH_EMPLOYEES`).
- Canonical doc for consumers and operators: `docs/INTEGRATION_EMPLOYEE_SEARCH_API.md`. Tests: `tests/employee-integration-search.spec.ts` + `tests/integration-api-key.spec.ts` (22 passing). Runtime envs need `INTEGRATION_API_KEYS` set or API-key mode answers 503 by design. Live local proof 2026-09-04: `query=z` total 486; filters chain 486 -> 455 -> 454; `zan andrei` fuzzy-matches Zen Andrei; deep pages honest (`page=455` empty, `hasNext=false`). Evidence: `.runtime/employee-search-proof-20260904-153358/`.
