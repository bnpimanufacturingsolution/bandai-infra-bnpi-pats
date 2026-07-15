# Agent Meta-Prompt Template v2.1

## Project Truth Long-Running Device Sync QA and Repair Campaign

Copy this entire prompt into the implementation agent. It is intentionally
preconfigured for a 3-5 hour Project Truth campaign when physical attendance
devices are offline, unavailable, or not safely testable.

The absence of a device is an evidence boundary, not a reason to stop useful
work. Use current code, captured evidence, redacted logs, contract tests,
deterministic synthetic adapters, fault injection, direct API probes, and
headless Playwright to prove every layer that can be proven honestly. Never
label synthetic or replayed evidence as physical-device proof.

---

# 0. CAMPAIGN CONTRACT

## Mission

Run a sustained, evidence-driven QA, architecture, repair, and UX campaign for
Project Truth device management and synchronization.

Improve the complete path:

```text
Hikvision / ZKTeco source truth
  -> Linux SDK, ISAPI, PyZK, or site-agent transport
  -> listener or polling intake
  -> durable queue and idempotent job
  -> per-device worker and retry policy
  -> HRIS API mutation boundary
  -> HRIS Postgres truth
  -> DeviceUser, DeviceEvent, and DeviceSyncRun evidence
  -> socket notification plus polling fallback
  -> admin modal, progress, logs, result, and recovery UX
```

The campaign must cover single-device and multi-device behavior, including the
case where one target fails and the remaining targets can still complete.

## Selected Operating Profile

* Execution mode: `PLAN_AND_APPLY`
* Target duration: `3-5 hours`
* Device availability: `OFFLINE_OR_UNAVAILABLE`
* Default actor: `admin / hris-admin`
* Default local login: repository-documented Project Truth admin credentials
* Browser verification: direct API first, then headless Playwright
* WWG mode: follow the repository's current authorization and ownership rules
* Sub-agent policy: `ALLOWED_WHEN_USEFUL`
* Maximum concurrent agents: `4`, including the lead agent
* Delivery: follow Project Truth repository instructions; commit and push
  `develop` only when the requested campaign, validation, and delivery gates
  authorize it

## Goal

Leave the device-sync system materially more reliable, observable, fast, and
understandable even without a connected physical device. Find and repair
recoverable drift across code, API contracts, persistence, SDK integration,
jobs, retries, callbacks, polling, realtime updates, imports/exports, and admin
user journeys. Produce a clear list of what is proven synthetically, what is
proven from historical evidence, and what still requires a physical device.

## Definition of Done

The campaign is complete only when all of the following are true or honestly
classified with evidence:

1. Every discoverable device-management user journey is inventoried and
   linked to its real route, hook, service, endpoint, mutation, and persistence
   effect.
2. The device-user sync, device-log sync, callback, polling, peer-copy,
   import/export, listener-control, and job-status paths have been inspected at
   both code and runtime layers.
3. A deterministic synthetic lab exercises at least 100 synthetic employees
   plus their corresponding per-device `DeviceUser` records without claiming
   physical-device truth.
4. Concurrent, duplicate, partial-failure, timeout, retry, cancellation,
   restart, and stale-job cases are tested where the architecture supports
   them.
5. One failed device does not erase successful per-device results or prevent
   independent targets from completing.
6. Interactive actions acknowledge quickly; long operations become trackable
   background jobs instead of blocking an open modal indefinitely.
7. Playwright verifies the real rendered UI for loading, progress, success,
   partial success, error, empty, retry, cancel, resume, stale, narrow-screen,
   keyboard, and modal-close/reopen states.
8. The Sync logs and Device Users surfaces show truthful per-device results and
   useful evidence when a device is unreachable.
9. The job/progress UX is compared with the existing payroll long-running
   mutation pattern and only the proven reusable interaction pattern is shared
   or copied.
10. Focused tests, affected regression tests, typecheck/build checks, API
    evidence, Playwright evidence, and an independent acceptance review are
    complete.
11. Real-device-only claims remain explicitly unproven when no device is
    available.

## In Scope

* `hris-api`, `hris-app`, `vendor/hikvision-linux`, `vendor/zkteco-linux`
* Device configuration and Device Users / Sync Center journeys
* Device events, Sync logs, listener status, and event detail journeys
* `DeviceUser`, `DeviceEvent`, `DeviceSyncRun`, job state, and related contracts
* SDK/ISAPI/PyZK intake boundaries and redacted historical evidence
* Callback, polling, socket, queue, worker, retry, dedupe, and concurrency
* User/fingerprint/face metadata custody boundaries
* CSV, Excel, JSON/package export, non-mutating import preview, and isolated
  synthetic import execute/rollback when the production contract supports it
* A deterministic synthetic population of at least 100 employees plus their
  corresponding per-device `DeviceUser` records
* Headless Playwright desktop and narrow viewport coverage
* Performance budgets and long-operation UX
* Focused hard cutovers when evidence proves the current compatibility path is
  harmful and migration/rollback are safe
* Relevant tests, docs, WWG reconciliation, and delivery required by repository
  rules

## Out of Scope Unless Separately Proven and Authorized

* Claiming a real fingerprint, face, tap, callback, SDK login, alarm arm, or
  physical write from synthetic or replayed input
* Guessing device credentials or repeatedly attempting a locked terminal
* Fabricating biometric template bytes from counts or metadata
* Destructive physical-device delete/reset without backup and recovery proof
* Storing plaintext biometric templates in ordinary user records
* Disabling the running VM-managed Cloudflare Tunnel
* Moving Project Truth runtime into Windows Docker Desktop or WSL
* Broad cosmetic redesign unrelated to device and job journeys
* Weakening tests, hiding errors, or relabeling missing proof as a warning

## Non-Negotiable Requirements

Create an Intent Ledger and assign stable IDs to these requirements:

* `R1` - Discover the real end-to-end device-sync architecture from current
  code, schema, jobs, evidence, and runtime configuration.
* `R2` - Preserve an explicit evidence boundary between real device, historical
  capture, replay, synthetic, code-only, and unproven claims.
* `R3` - Exercise at least 100 deterministic synthetic employees plus their
  corresponding per-device `DeviceUser` records.
* `R4` - Test concurrent jobs, callbacks, polling, duplicate requests,
  idempotency, retries, timeouts, cancellation, and process restart.
* `R5` - Make per-device partial failure first-class; one failed target must not
  fail unrelated targets or erase their results.
* `R6` - Verify all discoverable admin device user journeys with direct API
  evidence followed by headless Playwright.
* `R7` - Verify modal, loading, progress, log, error, empty, cancel, retry,
  resume, close/reopen, and stale-job states.
* `R8` - Inspect the existing payroll long-job user journey and reuse only the
  correct shared progress/recovery pattern, not payroll-specific naming.
* `R9` - Target under 5 seconds for ordinary interactive acknowledgment and
  clear background progress for bulk work that may take 8-20 seconds or more.
* `R10` - Research Hikvision Linux SDK behavior from repository vendor sources,
  official material when available, and recorded evidence; do not invent SDK
  behavior.
* `R11` - Apply focused hard cutovers when required to remove misleading or
  unsafe legacy paths, with migration, compatibility, and rollback evidence.
* `R12` - Use clear canonical Project Truth terminology and remove confusing
  attendance-only or transport-as-business-state labels.
* `R13` - Run sustained deterministic Playwright/API soak iterations for the
  remaining campaign time after focused repairs pass.
* `R14` - Preserve unrelated dirty work and all protected runtime invariants.
* `R15` - Produce an evidence-backed handoff with exact commands, artifacts,
  timings, remaining device-only proof, and independent review findings.

---

# 1. PROJECT TRUTH RULES

## Required Discovery Order

Before editing, read the current applicable `AGENTS.md` files and the required
WWG surfaces in their specified order. When present, start from:

1. `.wwg/reports/wwg-agent-handoff.md`
2. `.wwg/wiki/project-truth-summary.md`
3. `.wwg/wiki/terminology-summary.md`
4. `.wwg/wiki/project-truth.md`
5. `.wwg/wiki/terminology.md`
6. `.wwg/wiki/principles/README.md`
7. Relevant principle briefs
8. `.wwg/workspace/current-task.md`
9. `.wwg/governance/drift-guard.md`
10. `README.md`
11. Relevant source, schema, tests, docs, and evidence

If a listed optional summary does not exist, record that and continue to the
full canonical file. Do not silently replace missing truth with inference.

## Protected Runtime Invariants

* Keep `cloudflared-bnpi-hris.service` active. Do not stop, disable, mask,
  remove, or add a default-off/cloud-mode guard.
* From the Windows host, prefer direct LAN SSH to the canonical VM target
  before the public Cloudflare SSH alias. Use the alias only as a fallback or
  explicit public-path proof.
* Project Truth runtime belongs in the Linux Hyper-V VM. Do not create a
  Windows Docker Desktop or WSL dependency.
* Host-local Docker is diagnostic only. The finish line remains repository to
  GitHub/Actions to GitOps/Argo/K3s to VM LAN and, when in scope, public named
  tunnel proof.
* Use `admin / hris-admin` for admin device and configuration work.
* Preserve unrelated work in the root and nested repositories.

## Canonical Product Terms

Use these names consistently unless current accepted truth has changed:

* `Device Users` - durable physical-device identity records
* `Sync device users` - identity/user inventory sync
* `Sync logs` or `Sync device logs` - device event/log import
* `Device events` - the general persisted event ledger
* `Event category` and `Event action` - human event classification
* `Runtime path` - listener, callback, SDK, or transport source
* `HRIS result` - HRIS processing outcome
* `Hikvision alarm listener` - Linux/VM or site-agent SDK listener
* `Biometric reconciliation worker` - queued user/biometric reconciliation

Do not use `Device attendance` as the identity of the whole event ledger. Do
not use raw `source` or processing `status` as the primary human event concept.

---

# 2. EVIDENCE TRUTH MODEL

Every important finding and test result must carry one evidence class:

| Class | Meaning | May prove |
| --- | --- | --- |
| `REAL_DEVICE_CURRENT` | Newly observed from a reachable physical terminal | Exact tested physical behavior only |
| `REAL_DEVICE_HISTORICAL` | Existing timestamped device evidence from this repo | Historical behavior, not current availability |
| `CAPTURE_REPLAY` | Redacted captured SDK/API payload replayed through current code | Parser, job, persistence, socket, and UI handling |
| `SYNTHETIC_CONTRACT` | Deterministic generated users/events/failures | Contracts, concurrency, UX, retries, and invariants |
| `CODE_STATIC` | Source/schema/config inspection | Intended or implemented structure only |
| `RUNTIME_NON_DEVICE` | Current API/DB/VM/browser proof without a terminal | Current non-device layers only |
| `UNPROVEN` | Required higher-layer evidence is unavailable | Nothing beyond the stated limitation |

Rules:

1. Put the evidence class in filenames or evidence manifests where practical.
2. Never turn `CAPTURE_REPLAY` or `SYNTHETIC_CONTRACT` into
   `REAL_DEVICE_CURRENT` through wording.
3. Existing screenshots and logs are inputs, not automatic current proof.
4. A browser socket connection is not SDK listener proof.
5. A running listener service is not SDK login or alarm-arm proof.
6. SDK login/arm is not a real tap or biometric write proof.
7. A fingerprint count is not a fingerprint template.
8. Encrypted ciphertext custody is not plaintext restore/write-back proof.
9. Separate actual source-device rows, HRIS persisted rows, skipped-known rows,
   failed rows, and still-missing rows.

Create an Evidence Boundary Table during discovery:

| Claim | Required evidence class | Available evidence | Status | Limitation |
| --- | --- | --- | --- | --- |
| [CLAIM] | [CLASS] | [PATH/COMMAND] | proven/partial/unproven | [NOTE] |

---

# 3. LONG-RUN ORCHESTRATION

## Lead Agent

The lead agent owns the task contract, Intent Ledger, architecture decisions,
scope, integration, final diff, validation, delivery, and verdicts. Sub-agent
claims are not accepted until the lead checks their evidence.

## Useful Sub-Agent Roles

Use bounded sub-agents when available. Prefer parallel read-only discovery
before parallel edits.

### Evidence and Architecture Investigator

* Map the device-to-HRIS flow and evidence boundaries.
* Inspect SDK, callback, polling, queue, worker, schema, and runtime ownership.
* Do not edit unless given exact non-overlapping files.

### API, Job, and Persistence Specialist

* Inspect and test endpoint contracts, idempotency, per-device results,
  cancellation, retry, restart, and persistence.
* Own only assigned backend/test files.

### Playwright and Product UX Specialist

* Inventory and test the actual admin journeys.
* Capture network, console, URL, text, accessibility, timing, and screenshots.
* Compare device jobs with the existing payroll long-operation pattern.

### Independent Acceptance Reviewer

* Must not implement the reviewed slice.
* Compare the original contract, final diff, evidence, and remaining gaps.
* Look specifically for synthetic/real-device truth leakage, partial-failure
  bugs, misleading loading states, and no-op tests.

For every delegated task specify requirement IDs, exact allowed files, whether
editing is allowed, prohibited actions, expected evidence, and handoff format.
Editing agents must have non-overlapping ownership unless the lead serializes
their work.

## Timebox and Checkpoints

Use elapsed-time checkpoints rather than blindly running one long command:

| Elapsed | Target outcome |
| --- | --- |
| 0-25 min | Instructions, WWG, worktree, runtime, and evidence baseline |
| 25-60 min | Complete user-journey and architecture maps; plan reviewed |
| 60-120 min | Synthetic lab and focused reproductions established |
| 120-240 min | Repair vertical slices with immediate regression checks |
| 240-270 min | Fault, concurrency, restart, performance, and Playwright soak |
| 270-300 min | Independent review, final repair, truth/docs sync, delivery, handoff |

This is a target sequence, not permission to skip a gate. If a high-value
repair needs more time, revise the plan with evidence. Send concise progress
updates at meaningful milestones and at least every 45-60 minutes.

Create one stamped evidence root:

```text
.runtime/device-sync-campaign-YYYYMMDD-HHMMSS/
  00-baseline/
  01-journey-map/
  02-api-contracts/
  03-synthetic-lab/
  04-fault-concurrency/
  05-playwright/
  06-performance/
  07-final-validation/
  campaign-manifest.json
  final-report.md
```

Store the seed, iteration, environment, repository Git SHA, command, result,
timing, evidence class, and redaction status for every generated artifact.

---

# 4. DISCOVERY AND CURRENT-STATE REPORT

Do not edit before the Current-State Report and plan review are complete.

## Repository Baseline

Capture for root and relevant nested repositories:

* Working directory, repository root, branch, HEAD, remote tracking state
* Staged, unstaged, untracked, and nested-repository changes
* Task-owned versus unrelated changes
* Existing local servers, ports, VM state, LAN route, DB target, and current
  frontend API base
* Exact tests, typechecks, builds, and Playwright configs available

Do not stash, reset, delete, reformat, or absorb unrelated work.

## Evidence Intake

Search current source and timestamped evidence for:

* Hikvision SDK login, callback, alarm arm, user read/write, fingerprint
  read/write, listener, site-agent, and error-code behavior
* ZKTeco connection, quick count, full history, timeout, and reachability
* `DeviceUser`, `DeviceEvent`, `DeviceSyncRun`, sync jobs, and merge jobs
* Callback parsing, dedupe, attendance/timesheet projection, socket emission
* Polling intervals, query invalidation, job resume, local storage, stale jobs
* Existing synthetic fingerprint tally and biometric export boundaries
* Existing Playwright evidence for Sync logs, Device Users, events, listener,
  details, responsive views, and imports/exports
* Existing payroll job/modal/progress pattern

Historical evidence may guide test cases but must retain its timestamp and
evidence class.

## Code-Backed Starting Hypotheses to Verify

Treat these as hypotheses from prior inspection, not accepted current truth:

* Some device-log, device-user-sync, and SDK-merge job stores may be
  process-local maps with roughly one-hour cleanup, while package-import jobs
  may persist stronger snapshots.
* Relevant UIs may poll job progress about every 1.5 seconds, listener status
  about every 5 seconds, and saved events may combine sockets with polling.
* Bulk device-user sync may continue per device after one target fails while
  still reporting the overall job as `failed`.
* Existing backend SDK waits may reach 30-90 seconds in some paths.

Confirm these against current code before planning. Test cleanup timers,
terminal-state polling stop, duplicate suppression, socket/poll races, API
restart, job expiry, modal reopen, and safe rerun. Do not describe a job as
durable or resumable unless restart/recovery evidence proves it. If successful
targets survive but any failure makes the overall state `failed`, preserve a
UI/API state clearly distinguishable from total failure and prefer
`completed_with_errors` when adopting a new contract. Do not force an enum or
schema cutover without compatibility and migration evidence. Repair affected
API/UI/tests atomically and provide retry-failed-only behavior.

## Exact Endpoint First

For each UI journey, identify the real endpoint and call it directly with the
same actor before browser diagnosis.

Default local admin flow follows repository instructions and should use:

```text
admin@bandai.local
password123
appCode=hris
```

Use `execute=false`, `dryRun=true`, preview endpoints, or the documented
equivalent before any mutation. Time the request and save URL, method, redacted
payload, response status, full JSON, error, and elapsed seconds under the
campaign evidence root.

If a mutation has no safe preview and could alter real data, inspect the
implementation and add a safe preview when that is in scope. Do not invent a
fake safety flag.

## Required Current-State Report

Report:

* Instructions and truth applied
* Task classification and risk tier
* Repository and dirty-worktree state
* Current architecture and runtime ownership
* Current user journeys and endpoints
* Current device availability and evidence boundary
* Confirmed failures and likely root causes
* Available and unavailable validation
* Allowed and prohibited changes
* Initial performance baseline
* Truth conflicts and stale naming

---

# 5. USER-JOURNEY INVENTORY

Discover routes and interactions from real code. Do not assume the list below
is complete.

Create a Journey Matrix:

| Journey | Route / entry | Endpoint(s) | Mutation / job | Persistence | UI states | Evidence |
| --- | --- | --- | --- | --- | --- | --- |
| [NAME] | [ROUTE] | [ENDPOINT] | [ACTION] | [TABLES] | [STATES] | [PATH] |

At minimum cover:

1. Add Device and Edit Device.
2. Device list health/status and device-specific actions.
3. Open Device Users from a device row.
4. Review a single-device user sync.
5. Start `Sync device users`, observe trackable progress, and verify whether
   that progress is actually durable across restart or only process-local.
6. Bulk device-user refresh across all configured devices.
7. Retry failed or needs-attention targets only.
8. Copy one user to a peer device.
9. User link/unlink and conflict handling.
10. Device user detail, vendor metadata, fingerprint/face truth, and raw payload.
11. Export CSV, Excel, and JSON/package.
12. Non-mutating import preview for each supported format, followed in an
    isolated synthetic environment by execute, job polling, partial-row
    failure, cancel/retry, persistence verification, export round-trip, and
    cleanup/rollback proof when the production contract supports execution.
13. Open Device events from global and device-specific entry points.
14. Saved events and Live events.
15. Open Sync logs, preview counts, start sync, observe progress, and inspect
    final per-device result.
16. Event detail modal and raw/debug evidence.
17. Hikvision listener status, check, restart, unavailable, and log-tail states.
18. Close and reopen a running job modal.
19. Reload or restart the API while a job identifier exists.
20. Navigate away and return without losing the truthful job result.
21. Desktop and narrow/mobile layout.
22. Keyboard focus, Escape behavior, focus restoration, and accessible names.
23. Existing payroll run or other long-job pattern used as a UX reference.

For every journey identify the earliest point it can fail, the user-visible
message, recovery action, and whether successful results remain available when
another target fails.

---

# 6. TARGET ARCHITECTURE AND HARD-CUTOVER GATE

## Ownership Model

Use evidence to confirm or correct this desired ownership:

```text
Listener / site agent
  - owns SDK or device connection
  - performs minimal callback parsing
  - emits redacted structured evidence
  - enqueues work or posts to the fixed HRIS callback contract
  - does not directly invent HRIS business truth

Queue / job coordinator
  - owns idempotency key and durable job state
  - creates independent per-device target work
  - supports bounded concurrency, retry, cancellation, and restart recovery

Worker
  - owns slow device reads/writes and reconciliation
  - records attempt, timing, source counts, result, and redacted error
  - never lets one failed target erase successful peer results

HRIS API
  - owns authorization, preview/execute boundary, contract validation,
    DeviceUser/DeviceEvent/DeviceSyncRun persistence, and audit trail

Browser
  - starts or previews work
  - reads durable job truth
  - uses socket events as a latency optimization
  - uses polling as the correctness fallback
  - can close/reopen without cancelling work unless the user explicitly cancels
```

The existing Hikvision callback controller remains the single owner of saved
device-event persistence, attendance/timesheet projection, and
`device-event:saved` emission unless stronger current truth proves otherwise.

## Required Job Contract

For operations that may exceed the interactive budget, prefer this contract:

* Start returns quickly with a stable `jobId` and accepted target list.
* Status returns overall state plus every target state.
* Overall states are explicit, for example:
  `queued`, `running`, `completed`, `completed_with_errors`, `failed`,
  `cancel_requested`, `cancelled`.
* Target states are independent, for example:
  `queued`, `running`, `succeeded`, `skipped`, `retry_wait`, `failed`,
  `cancelled`.
* Counts never merge `failed`, `known skipped`, and `still missing`.
* Retrying failed targets creates a traceable attempt without redoing successful
  targets unless the user requests a full refresh.
* Preflight and fail early per target. An unreachable or invalid target should
  receive a precise failure immediately while independent targets continue.
* Duplicate start requests use an idempotency key or return the existing active
  job when their scope is equivalent.
* Cancellation is cooperative and never rewrites already completed results.
* Job state survives modal close, navigation, socket loss, and API process
  restart when durable-job architecture claims restart safety.
* Logs are bounded, redacted, ordered, and correlated by job, device, attempt,
  and request IDs.

If current jobs are intentionally process-local, make expiry and safe rerun
explicit in both API and UI, preserve completed durable Sync Run evidence, and
do not promise resume after restart. If the product requires true resume,
implement a repository-appropriate persistent job store and recovery contract
instead of hiding process loss behind a generic error toast.

## Callback, Polling, and Dedupe Rules

Test and repair as applicable:

* Bursts of callbacks for the same employee/device
* Duplicate vendor serial numbers or retried HTTP delivery
* Out-of-order callbacks and older event timestamps
* Callback received while a poll or manual sync is running
* Poll detects a user before or after a callback
* Socket disconnect while polling continues
* API restart after callback accepted but before browser observes it
* Worker retry after an ambiguous device write

Use stable dedupe keys derived from real vendor identifiers and timestamps when
available. Do not dedupe unrelated people merely because they arrive close
together. Record why a row is saved, skipped-known, failed, or still missing.
For burst and duplicate tests, assert exact cardinality: no distinct event is
lost, and every true duplicate is persisted once or explicitly classified as
known skipped with its dedupe reason.

## Hard-Cutover Decision

Use a hard cutover only when all are true:

1. Current legacy behavior is proven misleading, unsafe, or architecturally
   incompatible.
2. The owning layer and replacement contract are clear.
3. Existing data is preserved, migrated, or explicitly reset with authorization.
4. Compatibility consumers are enumerated.
5. Regression coverage exists for the new single source of truth.
6. Rollback or forward-repair is documented.
7. Canonical terminology, docs, WWG, and reports can be reconciled.

Do not maintain two active writers for the same business truth merely to avoid
a focused migration. Do not delete compatibility fields still required by
proven consumers.

---

# 7. NO-DEVICE SYNTHETIC LAB

The synthetic lab must exercise production contracts without pretending to be
a physical terminal.

## Test Layers

Use the strongest available layers in this order:

1. Existing redacted real payload fixtures and historical evidence
2. Parser and contract tests
3. Capture replay through the actual callback/job/API boundary
4. Deterministic vendor adapter at the transport boundary
5. Real API plus isolated test database
6. Real rendered frontend plus Playwright

Do not scatter test-only branches through business logic. Prefer a narrow
explicit adapter/interface at the device transport boundary. Synthetic mode
must be impossible to confuse with production device configuration and must
label every result `SYNTHETIC_CONTRACT`.

## Deterministic Population

Create at least 100 synthetic employees plus their corresponding per-device
`DeviceUser` records with a fixed seed and non-real identifiers. Include:

* Exact matches
* Unmatched users
* Ambiguous/conflicting matches
* Disabled users
* Duplicate vendor user IDs across different devices
* Same employee legitimately present on multiple devices
* Users with no credential
* Fingerprint-count-only synthetic metadata clearly separated from real
  encrypted template custody
* Separate fingerprint and face metadata/envelopes where fixture contracts
  permit it
* Long names, Unicode names, empty optional fields, and text-overflow cases

Never generate plausible real biometric blobs. Use contract-safe sentinel
payloads that cannot be mistaken for vendor templates.

## Device Matrix

Use at least four deterministic synthetic devices:

| Device | Behavior |
| --- | --- |
| A | Healthy, fast, complete |
| B | Healthy but slow, 8-20 second bulk result |
| C | Intermittent timeout, succeeds after bounded retry |
| D | Hard failure or unreachable for the whole job |

Add a fifth device when useful for malformed or unsupported vendor payloads.

Expected invariant: A and B complete, C records retries then succeeds when the
scenario says so, D fails independently, and the overall result is a partial
success state clearly distinguishable from total failure. Use
`completed_with_errors` when the chosen compatible contract defines it; do not
force that enum without the required migration and consumer updates.

## Fault and Concurrency Matrix

Automate as many of these as the codebase supports:

* Two identical start requests at the same time
* Two different sync scopes at the same time
* User sync and log sync concurrently
* Manual peer copy during a bulk sync
* 10, 50, and 100 callbacks arriving in bursts
* Duplicate callback delivery
* Out-of-order events
* Socket disconnect/reconnect
* Poll response delayed beyond one interval
* API 429, 500, timeout, and connection reset
* Device unavailable before start
* Device fails mid-page or mid-batch
* Job coordinator restart
* Browser reload and modal close/reopen
* Cancellation before start, during work, and after some targets complete
* Retry failed targets only
* Database uniqueness collision or optimistic concurrency conflict
* Stale job ID after cleanup or version change
* Import preview and isolated synthetic execute with partial valid rows and
  explicit conflicts, followed by rollback/cleanup proof
* Export while another read-only sync is active

Every scenario needs an expected state transition and assertion. Do not accept
"no crash" as the only assertion.

## Mutation Safety

Use a disposable database or dedicated synthetic organization whose resolved
database target is explicitly verified not to be shared DEV, UAT, PROD, or
current client data. Do not rely on transaction cleanup as permission to use a
shared database, because localhost may proxy to deployed DEV and asynchronous
jobs outlive a request transaction. Before every synthetic execute, record the
resolved API base, database host, database name, organization, backup/rollback
state, and baseline counts. Prefix every synthetic identifier with a campaign
marker. Provide an idempotent teardown command keyed by that marker so cleanup
can resume after a crash, then prove cleanup with after counts. If isolation
cannot be proven, run preview/replay only. Never run destructive reset or
physical-device delete against current client data merely to simplify the lab.

---

# 8. PERFORMANCE AND RESPONSIVENESS BUDGETS

Measure from both API and user perspectives.

## Target Budgets

* UI loading/progress feedback: visible within `1 s`; immediate control feedback
  should still target `100 ms` when feasible
* Modal open using cached/local data: under `500 ms`
* Preview using quick counts or cached summaries: target under `5 s`
* Job start acknowledgment and `jobId`: target under `1.5 s`, hard UX budget
  under `5 s`
* Single-user copy/reconcile when the proven fast path is available: target
  under `5 s`
* Bulk work expected to finish in `8-20 s`: show determinate or count-based
  progress, current target, elapsed time, and safe modal close/reopen
* Work likely to exceed `20 s`: background job is mandatory; do not hold a
  blocking request or show an unexplained spinner
* Poll interval: responsive without request storms; add backoff/jitter when
  appropriate and stop polling terminal states

Do not force full device-history reads into an interactive preflight. For
ZKTeco, prefer the proven quick count path such as `read_sizes()` when current
code and evidence support it. Full history remains background work.

Capture p50, p95, maximum, failures, and sample size for repeated API and
Playwright runs. A single fast run is not a performance conclusion.

---

# 9. PLAYWRIGHT PRODUCT QA

Use the repository's headless Playwright path. Repair ordinary missing browser,
stale server, port, or auth-state issues instead of treating them as blockers.

## Evidence Order

For each journey:

1. Direct health/auth/API/preview proof
2. Playwright network capture
3. Playwright console capture
4. URL and visible-text assertions
5. Interaction and state assertions
6. Screenshot at meaningful states
7. Persistence or job-status verification after the UI action

Screenshots alone do not prove endpoint, CORS, job, or mutation behavior.

## Required UI State Contract

For each modal or long-running action verify as applicable:

* Default and review state
* Loading or skeleton state
* Disabled start while request is being accepted
* Accepted/queued state with stable job ID
* Running state with useful progress and elapsed time
* Per-device rows and current target
* Success
* Partial success / completed with errors
* Full failure
* Empty/no configured devices
* Source unavailable
* Cancel requested and cancelled
* Retry failed only
* Stale or expired job
* Socket disconnected while polling still recovers truth
* Close/reopen during a running job
* Browser reload and navigation away/back
* Long error text and overflow
* Desktop and narrow viewport
* Focus order, visible focus, accessible title/description, Escape behavior,
  focus restoration, and reduced-motion-safe behavior

The UI must never:

* Show a permanent spinner without explanation or recovery
* Say all devices failed when only one failed
* Say success when failed targets remain hidden
* Mark listener/device truth green based only on browser socket connection
* Lose completed per-device results after modal close
* Require the modal to remain open for the job to continue
* Use raw error codes without a plain-language summary and inspectable detail
* Mix identity sync with log/event sync terminology

## Payroll Pattern Review

Find the actual payroll run or comparable long-job implementation in current
code. Document its reusable interaction contract, such as:

* Preview before mutation
* Explicit confirmation
* Start acknowledgment
* Durable job ID
* Polling lifecycle
* Count-based progress
* Modal close/reopen behavior
* Partial result presentation
* Retry/cancel behavior
* Final summary and logs

Specifically check whether the current payroll flow already provides immediate
job ID, close/reopen progress, elapsed time, processed/success/failed counts,
cancellation, explicit terminal states, and recoverable unavailable-status UX.
Use those proven behaviors as a comparison baseline for device jobs.

Reuse or extract shared hooks/components only when ownership and behavior are
truly cross-domain. Keep device-specific concepts and payroll-specific concepts
separate. Do not copy payroll labels into device sync.

## Sustained Soak, Not Literal Infinity

After focused tests pass, run deterministic repeated Playwright/API journeys
until the timebox or a higher-priority repair consumes the remaining campaign
time.

* Use recorded seeds and iteration numbers.
* Rotate fast-success, slow-success, intermittent, hard-failure, callback burst,
  reload, and cancel scenarios.
* Reset browser context between iterations where isolation matters.
* Preserve the first failing evidence before retrying.
* Classify failures as product, test, environment, stale runtime, or flake.
* Fix product/test causes and rerun the narrow failure plus affected regression.
* Do not hide a recurring failure by increasing waits without root-cause proof.

Report iteration count, seeds, pass/fail distribution, p50/p95/max duration,
retries, and unresolved flakes.

---

# 10. HIKVISION AND VENDOR SDK RESEARCH

The campaign must leave an implementation-useful research result, not a list of
generic SDK links.

## Source Priority

1. Current Project Truth vendor source, headers, scripts, tests, and docs
2. Existing redacted runtime evidence and prior reports
3. Local official Hikvision SDK package/readme/demo material
4. Current official vendor documentation when network access is available
5. Secondary sources only when clearly labeled and corroborated

For online technical research, prefer primary official documentation and cite
the exact supporting source. Do not expose proprietary binaries or secrets.

## Required Questions

Resolve or clearly classify:

* Which port belongs to HTTP/ISAPI and which belongs to HCNetSDK
* Login, callback registration, alarm arm, cleanup, and reconnect lifecycle
* Meaning and observed context of relevant error codes, including historical
  codes `1`, `7`, `20`, and `153`
* Which callback/event types represent ACS taps versus user/fingerprint changes
* Whether direct device callbacks, SDK alarms, polling, or a site agent owns
  each supported journey
* Required user-read, fingerprint-read, face-read, user-write,
  fingerprint-write, and verification structures
* How template length and bytes are validated
* Thread-safety and callback restrictions
* Reconnect, timeout, retry, and cleanup behavior
* Multi-device session limits and safe bounded concurrency
* Whether an ambiguous write can be read back safely before retry
* Which operations are supported in Linux and which remain unproven in this
  hardware/firmware combination

Map every relevant SDK operation to its Project Truth owner, testability without
a device, error handling, and required future physical proof.

---

# 11. IMPLEMENTATION AND REPAIR LOOPS

## Plan Gate

Build a requirement-linked plan with:

* Objective and acceptance criteria
* Affected files and owning repository
* Architecture decisions and truth conflicts
* Sub-agent ownership
* Exact validation per requirement
* Data safety and rollback
* Time budget

Review the plan against the user goal, Project Truth, dirty state, no-device
boundary, partial-failure requirement, and no-op risks. Declare
`PLAN_ACCEPTED`, `PLAN_REVISED`, or `PLAN_BLOCKED` before edits.

## Vertical Slices

Prefer complete slices, for example:

1. Job contract and persistence
2. Per-device isolation and retry
3. Callback/polling/dedupe
4. UI progress and partial-failure truth
5. Import/export safety
6. Playwright and soak automation

After each slice:

* Run the narrow test
* Call the real endpoint or synthetic contract
* Check the relevant rendered state
* Inspect the diff and worktree
* Update the Intent Ledger

## Recovery Rule

Do not stop on ordinary recoverable failures such as stopped services, stale
dev servers, missing generated clients, closed ports, missing Playwright
browsers, or a test environment that needs the repository-documented setup.

Before declaring a recoverable issue blocked, make at least three documented
attempts using different plausible fixes. Preserve evidence for each attempt.

Stop only when continuing is technically impossible or risks irreversible loss,
secret exposure, or destructive client-data impact without verified recovery.
No physical device is not itself a blocker for the synthetic campaign.

## Implementation Rules

* Make the smallest complete and coherent change.
* Do not weaken acceptance criteria or delete valid tests.
* Add regression tests for bugs whenever practical.
* Keep preview and execute contracts explicit.
* Use idempotency and durable state for retryable long-running mutations.
* Preserve completed target results during failure and cancellation.
* Redact credentials, biometric bytes, tokens, and sensitive employee data.
* Use test-only synthetic adapters only at explicit boundaries.
* Do not claim a mock proves the production SDK path.
* Avoid broad renames; use canonical terms in touched surfaces.
* Reconcile code, docs, WWG, and governance when implementation changes
  accepted behavior or architecture.

---

# 12. VALIDATION MATRIX

At minimum run and record applicable checks at these layers:

## Static and Contract

* Diff and dirty-worktree review
* Format/lint/typecheck/build for affected packages
* Schema/migration safety check
* Unit and contract tests for parser, jobs, idempotency, partial failure,
  callback, polling, import/export, and terminology

## Integration

* Admin login and exact preview endpoints
* Synthetic contract for 100 employees plus corresponding per-device users
* Multi-device job with one permanent failure
* Retry failed only
* Duplicate start and callback burst
* Cancellation and restart/resume
* Persistence assertions for job, target, DeviceUser, DeviceEvent, and
  DeviceSyncRun as applicable

## Browser

* All required journey and UI-state cases
* Network and console assertions
* Desktop and narrow viewport
* Accessibility and focus behavior
* Timings and repeated soak

## Runtime and Architecture

* VM/LAN/API/DB state when reachable
* Listener status truth without claiming a device is online
* Cloudflare service preserved
* GitOps/K3s/public proof only when actually exercised

## Independent Acceptance

Reviewer compares:

* Original campaign contract
* Intent Ledger
* Final diff
* Test/API/Playwright evidence
* Evidence truth classifications
* WWG/docs reconciliation
* Delivery actions

Any mismatch returns to a bounded repair loop.

Use this validation record:

| Requirement IDs | Exact command/procedure | Environment | Evidence class | Result | Artifact/limitation |
| --- | --- | --- | --- | --- | --- |
| R1 | [CHECK] | [ENV] | [CLASS] | PASS/FAIL/WARNING/NOT_RUN | [PATH] |

A skipped or unavailable required check is not a pass.

---

# 13. DELIVERY AND TRUTH RECONCILIATION

Follow the current root and nested-repository instructions.

Before commit or push:

1. Recheck status in every affected repository.
2. Compare against the captured baseline.
3. Review the complete diff.
4. Preserve and exclude unrelated edits.
5. Stage exact paths only.
6. Re-run required validation after the final edit.
7. Confirm no secret, raw biometric material, or synthetic artifact is staged.
8. Reconcile Project Truth, terminology, workspace, governance, and relevant
   BRD/PRD/docs when the accepted implementation truth changed.
9. Check the recommendation registry for newly discovered out-of-scope work.

If authorized by Project Truth task rules, create focused commits, push
`develop`, watch GitHub Actions, then verify GitOps/VM/LAN/public state required
by the actual finish line. Do not call host-local success production proof.

If the physical device remains offline, delivery may still be complete for
code and synthetic validation while product/device readiness remains
`NEEDS_REAL_DEVICE_PROOF`.

---

# 14. FINAL VERDICTS AND HANDOFF

Do not collapse different kinds of readiness into one status.

## Required Verdicts

* Instruction Fulfillment:
  `FULFILLED`, `FULFILLED_WITH_WARNINGS`, `PARTIALLY_FULFILLED`,
  `NOT_FULFILLED`, or `BLOCKED`
* Validation:
  `PASSED`, `PASSED_WITH_WARNINGS`, `FAILED`, `NOT_RUN`, or `BLOCKED`
* Code / Synthetic Readiness:
  `READY`, `READY_WITH_WARNINGS`, `NEEDS_REPAIR`, or `BLOCKED`
* Physical Device Readiness:
  `PROVEN`, `NEEDS_REAL_DEVICE_PROOF`, `FAILED`, or `NOT_IN_SCOPE`
* Delivery:
  `NOT_REQUESTED`, `NOT_AUTHORIZED`, `READY_FOR_DELIVERY`, `DELIVERED`,
  `NOT_READY`, or `BLOCKED`

## Final Handoff Format

### Verdicts

[ALL REQUIRED VERDICTS]

### Executive Summary

[WHAT IMPROVED, WHAT WAS PROVEN, AND WHAT STILL NEEDS A DEVICE]

### Intent Compliance Table

| ID | Requirement | Result | Evidence | Status | Limitation |
| --- | --- | --- | --- | --- | --- |
| R1 | [REQUIREMENT] | [RESULT] | [PATH] | MET/PARTIAL/NOT_MET/BLOCKED | [NOTE] |

### Architecture and User-Journey Findings

* Final source-to-UI flow
* Job ownership and partial-failure model
* Callback/polling/socket model
* Payroll pattern reused or intentionally not reused
* Hard cutovers made and migration/rollback status

### Work Completed

* [CHANGE/FINDING]

### Files Changed

Group by repository and explain why.

### Validation and Soak Evidence

* Exact commands
* API results
* Synthetic seed and population
* Fault/concurrency results
* Playwright iterations and screenshots
* p50/p95/max timings
* Regression/typecheck/build results

### Evidence Boundary

Separate:

* Newly proven real-device behavior
* Historical real-device evidence reused
* Capture replay proof
* Synthetic proof
* Runtime non-device proof
* Still-unproven physical behavior

### Partial-Failure Proof

Show the exact job where one device failed and others completed, including
per-target results, overall state, retry behavior, persistence, and UI evidence.

### Independent Review

* Reviewer role
* Findings
* Corrections made
* Gate status

### WWG / Documentation Reconciliation

* Truth-write mode
* Accepted truth updated
* Candidates/recommendations recorded
* Conflicts remaining

### Repository and Delivery State

* Branch and HEAD per repository
* Commits and push result
* GitHub Actions result
* GitOps/VM/LAN/public proof actually completed
* Preserved unrelated changes

### Warnings and Required Real-Device Follow-Up

For every remaining physical test, give an exact runnable procedure, expected
evidence, safety preconditions, and pass/fail criteria. Do not merely say
"test with device later."

### Recommendation Capture

State either the recommendation registry entries added/updated or exactly:

`No new recommendations were identified.`

---

# 15. START NOW

Begin immediately with:

1. Instruction, WWG, repository, runtime, and evidence discovery
2. Current-State Report
3. Intent, Assumption, Evidence Boundary, Journey, and Validation ledgers
4. Requirement-linked plan and plan review
5. Bounded sub-agent discovery/review when useful
6. Synthetic lab and focused reproductions
7. Complete vertical-slice repairs
8. Direct API proof followed by Playwright
9. Concurrency, partial failure, restart, cancellation, and performance soak
10. Independent acceptance and final repair loop
11. Truth/docs reconciliation and authorized delivery
12. Evidence-backed final handoff

Keep going through recoverable failures. Use the remaining time for additional
deterministic journeys and soak after the core gates pass. Do not stop early
because the physical device is unavailable, and do not invent physical-device
success from synthetic evidence.
