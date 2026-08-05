# Terminology

This file defines canonical and observed project language.

Adoption status: INFERRED_FROM_EXISTING_PROJECT
Status: Inferred from repository evidence. Requires human/agent review before becoming accepted project truth.

## Observed Terms

| Observed Term | Where Found | Inferred Meaning | Status |
|---|---|---|---|
| flow | README heading | Observed project term; confirm canonical meaning before broad use. | INFERRED |
| package | app/package-lock.json, app/package.json | Observed project term; confirm canonical meaning before broad use. | INFERRED |
| target | README heading | Observed project term; confirm canonical meaning before broad use. | INFERRED |
| truth | package/name, README heading | Observed project term; confirm canonical meaning before broad use. | INFERRED |
| architecture | README heading | Observed project term; confirm canonical meaning before broad use. | NEEDS_CONFIRMATION |
| autopilot | README heading | Observed project term; confirm canonical meaning before broad use. | NEEDS_CONFIRMATION |
| branch | README heading | Observed project term; confirm canonical meaning before broad use. | NEEDS_CONFIRMATION |
| cli | README heading | Observed project term; confirm canonical meaning before broad use. | NEEDS_CONFIRMATION |
| admin / hris-admin | User correction; admin route folders | Canonical role for admin configuration, device management, ZKTeco device events, runtime health, and repair/operations work. Do not substitute HR manager for admin surfaces. | CONFIRMED |
| hris-hr-manager | Existing role tests and HR route code | HR workflow role only where code/docs explicitly require it; not the default actor for `/admin` device/configuration work. | CONFIRMED_WITH_BOUNDARY |
| current | README heading | Observed project term; confirm canonical meaning before broad use. | NEEDS_CONFIRMATION |
| dockerfile | app/Dockerfile | Observed project term; confirm canonical meaning before broad use. | NEEDS_CONFIRMATION |
| documents | README heading | Observed project term; confirm canonical meaning before broad use. | NEEDS_CONFIRMATION |
| format | README heading | Observed project term; confirm canonical meaning before broad use. | NEEDS_CONFIRMATION |
| fresh | package/name | Observed project term; confirm canonical meaning before broad use. | NEEDS_CONFIRMATION |
| goal | README heading | Observed project term; confirm canonical meaning before broad use. | NEEDS_CONFIRMATION |
| hyper | README heading | Observed project term; confirm canonical meaning before broad use. | NEEDS_CONFIRMATION |
| operator/LAN IP | Runtime repair evidence; appliance summary; WWG Project Truth | The LAN address operators should use for direct SSH/HTTP checks when their workstation can route to the VM LAN. | CONFIRMED_WITH_BOUNDARY |
| pure static LAN | Runtime repair evidence; netplan state | DHCP-disabled VM network mode where all required VM LAN addresses, default route, DNS, and search domains are persisted through Project Truth config. | CONFIRMED |
| K3s node/API IP | Runtime repair evidence; K3s node and Kubernetes endpoint checks | Static VM address used by K3s node InternalIP and Kubernetes API endpoint identity. The accepted canonical target is now `10.184.37.19`; `10.184.37.78` is retained only as a secondary transition address/TLS SAN. | CONFIRMED_WITH_BOUNDARY |
| VM-managed Cloudflare Tunnel | Runtime banner and Project Truth tunnel evidence | The live VM-side `cloudflared-bnpi-hris.service` connector for named tunnel `bnpi-hris`, including public HRIS, Grafana, DB Access TCP helper hostnames, and SSH through `ssh.bnpi-hris.tech`. This must remain active by default on the running server. | CONFIRMED |
| Hikvision execution location | 2026-07-23 runtime-route implementation | Explicit API runtime classification: `windows-host`, `vm-host`, or `vm-container`. It determines SDK command transport and the VM-local HRIS API callback base. `vm-host` is truly local/no-SSH; `vm-container` is same-VM internal control with no Cloudflare fallback and must not route callbacks back to Windows. | CONFIRMED_LOCAL_IMPLEMENTATION_WITH_DEPLOYMENT_BOUNDARY |
| cloud mode / local mode | 2026-07-03 incident correction | A discouraged toggle concept for the running server. Agents must not make default-local/cloud-mode behavior control the live `cloudflared-bnpi-hris.service`; Cloudflare must stay enabled unless the user explicitly approves a time-bounded outage with recovery. | ACCEPTED_RUNTIME_SAFETY_RULE |
| DeviceUser / Device Users | 2026-07-06 local implementation; admin device UI; 2026-07-13 vendor metadata addendum; 2026-07-19/2026-07-20 raw biometric custody correction | Durable HRIS record for a user identity read from a physical device and optionally linked to an Employee. It may carry additive per-device vendor metadata for SDK/ISAPI user context. Active Hikvision Device Users export/import custody uses evidenced raw fingerprint fingerData and raw face/image blobs from DeviceUser, with DeviceEvent payload fallback when available; missing bytes stay explicit as `not_enrolled`, `missing_raw_blob`, or `not_requested`. This is identity/enrollment data, not attendance/device-log data. Earlier encrypted-envelope export wording is stale for this journey. | CONFIRMED_LOCAL_IMPLEMENTATION_WITH_BOUNDARY |
| Recovery needed | 2026-07-24 credential convergence architecture audit | A planned credential operation whose safe software prerequisites are incomplete and which is not owned by a running durable recovery worker. This is the honest replacement for the current planner-only `Recovery queued` label. | CONFIRMED_ARCHITECTURE_TERM |
| Credential recovery job | 2026-07-24 credential convergence architecture | A durable, restart-safe backend job with frozen scope, task leases, heartbeat, resume cursor, stage timings, counters, errors, and physical-reread verification. This term may be used as running truth only after that architecture is implemented and a worker owns the work. | CANDIDATE_NOT_IMPLEMENTED |
| Ready now | 2026-07-24 Merge device users UI/code audit | A recommended operation with `executionEligibility=ready_from_raw_blob` that is not classified as requiring physical action and is therefore selectable in the current plan. It does not mean the gap has been written or physically verified. | CONFIRMED_LOCAL_IMPLEMENTATION_WITH_BOUNDARY |
| Sync device users | 2026-07-06 local implementation; admin device UI; 2026-07-21 decision-matrix fast path | Admin action that reviews Device Users, builds a missing-record decision matrix first, then runs the quickest valid path for only records Sync can create or repair. It pulls physical device user identities through vendor APIs such as Hikvision `UserInfo/Search` only when the matrix proves source evidence is needed, upserts `DeviceUser`, and auto-links only safe exact employee matches. | CONFIRMED_LOCAL_IMPLEMENTATION_WITH_BOUNDARY |
| Device-user merge unique ID | 2026-07-21 merge truth repair | One selectable merge row for a unique device/vendor person ID read from the selected physical devices. Saved HRIS `DeviceUser` rows can provide link/status context, but they do not define the unique-ID count and must not collapse two different vendor IDs into one unique choice. Source rows and per-device records can be more numerous than unique IDs; duplicates for the same device/user ID must be collapsed/reported as evidence, not shown as extra unique choices. | CONFIRMED_LOCAL_IMPLEMENTATION_WITH_BOUNDARY |
| Missing-record decision matrix | 2026-07-21 Sync Center fast-path implementation | Pre-mutation Sync Center classification that groups Device Users into `missing_device_user_record`, `missing_employee_link`, `missing_raw_fingerprint_blob`, `missing_raw_face_blob`, `already_present`, `stale_count_only_or_live_no_data`, and `unsupported_by_sync`, with bucket counts, why copy, filters, selected fast plan, and source-read requirement. Counts can guide reads; they cannot fabricate biometric bytes. | CONFIRMED_LOCAL_IMPLEMENTATION_WITH_BOUNDARY |
| Sync logs / Sync device logs | 2026-07-06 local implementation; admin device UI | Admin action that imports or classifies physical device attendance/event records. It remains separate from Sync device users and resolves employee identity through `DeviceUser` first, then legacy fields. | CONFIRMED_LOCAL_IMPLEMENTATION_WITH_BOUNDARY |
| Hikvision alarm listener | 2026-07-09 Hikvision biometric sync architecture | Linux/VM-owned HCNetSDK service that logs into configured Hikvision devices, registers SDK alarm callbacks, arms alarm channels, classifies ACS events, and queues reconciliation work. It must not be named or treated as Windows `AlarmDemo` runtime. | TARGET_ARCHITECTURE_PENDING_IMPLEMENTATION |
| Biometric enrollment sync | 2026-07-09 Hikvision biometric sync architecture | Target workflow where a device enrollment/user-change event triggers source user/fingerprint reads, syncs the employee/device user to peer biometric devices, and persists HRIS `DeviceUser`/biometric metadata with dry-run/audit gates. This is higher-risk than device identity sync or attendance log sync. | TARGET_ARCHITECTURE_PENDING_IMPLEMENTATION |
| Biometric reconciliation worker | 2026-07-09 Hikvision biometric sync architecture | Background worker that performs the slow/sensitive user and fingerprint template read/write work after the alarm listener queues a reconcile event. It should provide dry-run, audit, and recovery evidence before mutating devices. | TARGET_ARCHITECTURE_PENDING_IMPLEMENTATION |
| Device events | 2026-07-09 local device-event model hard cutover | Generic admin ledger for persisted physical-device/runtime events. This replaces `Device attendance` as the page identity. Attendance punches are one event action, not the ledger concept. | CONFIRMED_LOCAL_IMPLEMENTATION_WITH_BOUNDARY |
| Plain device person id | 2026-07-19 enrollment identity architecture | Readable Hikvision person number (e.g. `15`). Canonical on `DeviceUser.vendorUserId`, `DeviceEvent.employeeNo`, and `Employee.deviceEmpId` (all plain). Distinct from opaque log tokens and from padded `Employee.employeeId` display codes. Spec: `docs/HIKVISION_ENROLLMENT_IDENTITY_FLOW.md`. | CONFIRMED_LOCAL_RUNTIME_EVIDENCE_WITH_BOUNDARY |
| Opaque person token | 2026-07-17 / 2026-07-19 enrollment identity | logSearch `LogAddInfo.EmployeeNo` privacy token (e.g. base64). Must not be shown as employee no. Mapped via `DevicePersonToken` and inventory delta to plain device person id. | CONFIRMED_LOCAL_RUNTIME_EVIDENCE_WITH_BOUNDARY |
| Employee.deviceEmpId | 2026-07-19 operator correction + live API | Plain device person id matching vendor user (e.g. `15`, `1029`). Not zero-padded. Live proof: vendor `1029` → `deviceEmpId=1029`, `employeeId=01029`. | CONFIRMED_LOCAL_RUNTIME_EVIDENCE |
| Employee.employeeId pad display | 2026-07-19 | HRIS business code may use leading zeros (`01029`, `00015`). Used for display and secondary match; do not treat as deviceEmpId. | CONFIRMED_LOCAL_RUNTIME_EVIDENCE_WITH_BOUNDARY |
| Evidence source | 2026-07-16 Hikvision Device Events source-truth repair | Persisted provenance for a `DeviceEvent`, such as `SDK_CALLBACK`, `ISAPI_LOGSEARCH`, `STATE_TRANSITION_INFERRED`, or `RUNTIME_PROCESS`. It is distinct from runtime path: runtime path names transport, while evidence source names the proof used to classify the row. | CONFIRMED_LOCAL_RUNTIME_EVIDENCE_WITH_BOUNDARY |
| Direct device evidence | 2026-07-16 Hikvision Device Events source-truth repair | Evidence explicitly returned by a device SDK callback or ISAPI endpoint. Current inventory can be direct device evidence while still remaining inventory rather than lifecycle history. | CONFIRMED_LOCAL_RUNTIME_EVIDENCE_WITH_BOUNDARY |
| Event category / event action | 2026-07-09 `DeviceEvent` schema/API/UI hard cutover | Persisted canonical event truth on `DeviceEvent` used by API filters and admin UI: category describes the human event family, action describes the specific event behavior. | CONFIRMED_LOCAL_IMPLEMENTATION_WITH_BOUNDARY |
| Event confidence | 2026-07-09 `DeviceEvent` schema/API/UI hard cutover | Persisted confidence for how the category/action was classified: `PROVEN`, `SUPPORTED`, `INFERRED`, or `UNKNOWN`. | CONFIRMED_LOCAL_IMPLEMENTATION_WITH_BOUNDARY |
| Runtime path | 2026-07-09 device-event copy hard cutover | User-facing/debug name for raw `DeviceEvent.source`, meaning the listener/callback/transport path that delivered the event, not the human event concept. | CONFIRMED_LOCAL_IMPLEMENTATION_WITH_BOUNDARY |
| HRIS result | 2026-07-09 device-event copy hard cutover | User-facing name for raw `DeviceEvent.status`, meaning HRIS processing result such as received, matched, ignored, or attendance updated; it is not the generic event status. | CONFIRMED_LOCAL_IMPLEMENTATION_WITH_BOUNDARY |
| Employee hard delete preview | 2026-07-09 admin employee delete safety implementation | Admin-only non-mutating preview that reports employee relation blockers and the exact delete/detach/archive plan before any hard-delete execute path can be enabled. This is not offboarding, termination, archival, or soft delete. | CONFIRMED_LOCAL_IMPLEMENTATION_WITH_BOUNDARY |
| Cutoff compensation / deduction mass upload | DM3 migration UI; BNPI payroll parity checklists; operator 2026-08-05 | Period workbook import that creates/updates **period-scoped** (or loan) enrollments for that cutoff. It is an **additive** source for Run Payroll, **not** the only source of compensations and deductions. | CONFIRMED |
| Recurring / standing benefit enrollment | EmployeeBenefit schedule; Run Payroll `buildPayrollSourceAmountsByEmployeeId`; operator 2026-08-05 | Active employee benefit (or loan) already enrolled outside the current mass-upload file—catalog, prior cut, open-horizon, or multi-cutoff recurring—that still applies when it resolves for the payroll period. Must be considered in register vs app payroll tally. | CONFIRMED |
| Payroll money source class | BNPI tally method 2026-08-05 | Required classification per line when comparing target register to generated payroll: `mass_upload` \| `recurring_enrollment` \| `engine` \| `ot_attendance` \| `missing_enrollment`. Prevents false “mass file incomplete” diagnoses. | CONFIRMED |
| Full-height list table / containedScroll | DESIGN.md; AdminTablePageShell; admin/HR viewport-fill helpers; 2026-08-05 benefits-management alignment | Dense list `DataTable` pages must fill remaining main-pane height at any browser height: layout viewport-fill path + page shell (`flex h-full min-h-0 flex-col overflow-hidden`) + `containedScroll`. Body scrolls inside the card; do not ship content-height-only list tables. | CONFIRMED |
| Count-only table column fetch | DESIGN.md; Benefits Management Enrolled; 2026-08-05 | Aggregate/count columns must request `document=false&pagination=false&count=true` (or a dedicated counts endpoint) so the payload is `{ count }` only — never hydrate full enrollment/user/event documents just to display a number. | CONFIRMED |

## Canonical Term Candidates

| Concept | Recommended Canonical Term | Also Seen As | Confidence | Evidence |
|---|---|---|---|---|
| flow | Flow | None detected | MEDIUM | README heading |
| package | Package | None detected | MEDIUM | app/package-lock.json, app/package.json |
| target | Target | None detected | MEDIUM | README heading |
| truth | Truth | None detected | MEDIUM | package/name, README heading |
| architecture | Architecture | None detected | MEDIUM | README heading |
| autopilot | Autopilot | None detected | MEDIUM | README heading |
| branch | Branch | None detected | MEDIUM | README heading |
| cli | Cli | None detected | MEDIUM | README heading |
| admin role | admin / hris-admin | administrator, admin user | HIGH | User correction 2026-06-29; `hris-app/app/routes/admin` |
| HR manager role | hris-hr-manager | HR Manager, hr-manager route legacy | HIGH | Existing HRIS role tests and HR workflow code |
| operator LAN access address | operator/LAN IP | LAN IP, stable VM address, static operator/LAN address | HIGH | 2026-07-03 pure static LAN repair evidence |
| pure static VM LAN mode | pure static LAN | static LAN, hard cutover, DHCP-disabled LAN | HIGH | 2026-07-03 netplan and `/etc/project-truth/lan.env` evidence |
| K3s node identity address | K3s node/API IP | node IP, Kubernetes endpoint IP | HIGH | 2026-07-03 user correction establishing `10.184.37.19` as canonical runtime truth |
| live VM named tunnel connector | VM-managed Cloudflare Tunnel | VM-side Cloudflare, cloudflared service, named tunnel connector, cloud mode | HIGH | 2026-07-03 VM banner and user correction after tunnel disable incident |
| physical device identity record | DeviceUser / Device Users | device users, enroll users, enrollment data | HIGH | 2026-07-06 schema/API/UI implementation |
| device identity sync action | Sync device users | review sync, user sync, enroll users sync | HIGH | 2026-07-06 admin device UI implementation |
| device event import action | Sync logs / Sync device logs | sync events, device log sync, attendance log sync | HIGH | 2026-07-06 admin events UI implementation |
| Hikvision SDK callback service | Hikvision alarm listener | HCNetSDK alarm listener, Linux alarm service | HIGH | 2026-07-09 architecture intake |
| cross-device fingerprint/user sync | Biometric enrollment sync | biometric sync, ONENROLL event, enrollment sync, fingerprint sync | HIGH | 2026-07-09 architecture intake |
| incomplete credential prerequisite without an active worker | Recovery needed | Recovery queued | HIGH | 2026-07-24 credential recovery architecture audit |
| durable background credential prerequisite recovery | Credential recovery job | recovery queue, custody recovery | MEDIUM | 2026-07-24 architecture candidate; not implemented |
| persisted device event ledger | Device events | Device attendance, punches page, saved punches | HIGH | 2026-07-09 schema/API/UI hard cutover |
| persisted event provenance | Evidence source | proof source, evidence path | HIGH | 2026-07-16 evidence contract and direct device proof |
| explicit device-origin proof | Direct device evidence | directness, device proof | HIGH | 2026-07-16 SDK/ISAPI evidence contract |
| persisted event family | Event category | source filter, status filter, attendance type | HIGH | 2026-07-09 `DeviceEvent.eventCategory` schema/API/UI hard cutover |
| persisted event behavior | Event action | punch type, event type, action code | HIGH | 2026-07-09 `DeviceEvent.eventAction` schema/API/UI hard cutover |
| raw transport/source path | Runtime path | source, runtime source | HIGH | 2026-07-09 device-event hard cutover |
| HRIS processing result | HRIS result | status, processing status | HIGH | 2026-07-09 device-event hard cutover |
| admin destructive employee delete dry-run | Employee hard delete preview | preview hard delete, hard-delete dry-run | HIGH | 2026-07-09 admin employee delete safety implementation |

## Terminology Conflicts

| Conflict | Evidence | Recommendation |
|---|---|---|
| Admin device/configuration work was previously left as inferred generic roles | `.wwg/wiki/project-truth.md` previously listed `user, owner, guest`; user correction 2026-06-29 says this is clearly admin role | Use admin / `hris-admin` for `/admin` device, runtime, GitOps, VM, and ZKTeco drift work; use `hris-hr-manager` only for explicit HR workflows |
| `Enroll Users` sounded like a new attendance/biometric enrollment flow | Earlier admin device button/modal copy and user correction on 2026-07-06 | Use `Device Users` for the durable identity table, `Review sync` before the mutating pull, and keep `Sync logs` terminology for attendance/event import |
| `Device attendance`, `Punches`, `Saved punches`, and `Live punches` made the ledger sound attendance-only | 2026-07-09 hard cutover request and implementation on `/admin/configuration/devices/events` | Use `Device events`, `Events`, `Saved events`, and `Live events`; reserve `attendance punch` only for actual `ATTENDANCE/TAP` labels |
| Raw `source` and `status` were used as primary event concepts | 2026-07-09 hard cutover request and implementation | Treat `source` as `Runtime path` and `status` as `HRIS result`; primary filters and summaries must use persisted event category/action |

## Rules

- Do not rename core concepts casually.
- If a prompt introduces a synonym, decide whether it is canonical before using it broadly.
- If terminology changes, update this file and reconcile code/docs.
- If terminology changes, reconcile reports, tests, governance files, and generated context too.
- For adopted projects, confirm inferred canonical terms before large renames.
