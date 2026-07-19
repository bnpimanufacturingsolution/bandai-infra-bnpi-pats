# Task Writer: Create + Enroll architecture → reality (non-stop marathon)

**File:** `docs/00-product/AGENT-PROMPT-create-enroll-architecture-reality-marathon.md`  
**Purpose:** Force iterative C++ / SDK / reverse-tunnel / callback / DeviceUser / socket / UI work until the **goal architecture in** `docs/HIKVISION_ENROLLMENT_IDENTITY_FLOW.md` **is live-proven**, not partial (`GREEN_WITH_BOUNDARIES` / donor blob is **not** done).  
**Use when:** You already have plain create + ledger + raw storage, but device FP re-read stays `numOfFP=0`, C++ still posts `fingerprintCount=0`, templates are donor-labeled, or first ACS is empty until later — and you want agents to **keep changing code and re-proving** until the ideal path works.

**Related (do not confuse):**

| Card | Focus |
|---|---|
| This card | Wire path: create/enroll → plain id **from enrich** → **device-owned** raw FP on DeviceUser → socket truth |
| `AGENT-PROMPT-device-user-enroll-journey-truth.md` | Admin journey: opaque map → inventory → Sync Center click |
| `AGENT-PROMPT-sync-logs-truth-3hr-marathon.md` | Sync logs dual-source import UI |

---

## Why short prompts fail on this goal (session-learned)

| Failure | Root cause | What this card forces |
|---|---|---|
| Stops after G3–G5 “green with donor” | Treating boundary as finish | **HARD goal:** template source = **that person on device**, not donor |
| Declares C++ done after rebuild | No listener quote of plain + templates | Must quote `identitySource` + `fingerprintCount` + post_result |
| “FP write OK” = enrolled | Device re-read `numOfFP=0` | **Matrix of write paths** until re-read ≥1 or 3-path fail with evidence |
| First socket always plain claimed without trace | major=3 empty ACS | Open C++ + live log; enrich path mandatory |
| Only API path, no rebuild/redeploy | Listener still old binary | Rebuild on VM, restart listener, prove new log lines |
| Donor blob hides gap | Custody looks “raw 684” | Source label must be device person read, not donor |
| Ends with “you should enroll on panel” | Operator homework | Agent does synthetic + documents panel-only steps only if hardware-blocked after 3 recoveries |
| 10-minute self-stop | Soft keep-going | EXIT GATE + min heartbeats + multi-cycle matrix |

---

## Operator setup (BEFORE pasting)

| Setting | Required value |
|---|---|
| Working directory | Repo root `PROJECT_TRUTH_HYPERV_FRESH` |
| Branch | `develop` |
| Tool permissions | **Always approve** / bypassPermissions / yolo |
| Max turns (headless) | **`--max-turns 300`** (150 is often too low for C++ rebuild + multi-matrix) |
| Wall clock | Plan **up to 3–4 hours**; do not kill at 10–20 minutes |
| Host/VM | Windows host + Hyper-V VM with reverse `59000→8000`, `59443→443`, `53001→3001` |
| Actor | `admin@bandai.local` / `password123` / `appCode=hris` |

### Headless example

```powershell
cd C:\Users\anoni\OneDrive\Desktop\PROJECT_TRUTH_HYPERV_FRESH

grok -p (Get-Content -Raw docs\00-product\AGENT-PROMPT-create-enroll-architecture-reality-marathon.md) `
  --max-turns 300 `
  --permission-mode bypassPermissions
```

### If session dies early (paste only this)

```text
CONTINUE CREATE+ENROLL ARCHITECTURE REALITY MARATHON.
Open docs/00-product/AGENT-PROMPT-create-enroll-architecture-reality-marathon.md.
Resume last incomplete PHASE and open ACCEPTANCE boxes.
EXIT GATE still applies: no summary-only end, no donor-blob as final green,
no "you should restart API / enroll on panel" homework.
Next action = HEARTBEAT + tool call. Do operator steps yourself.
Do not re-plan from zero unless evidence dir is missing.
```

---

## Baseline truth (do not invent — re-open evidence)

Last known stamp (verify may be superseded):  
`.runtime/create-enroll-flow-proof-20260719-181730/`

| Fact | Value |
|---|---|
| Create plain DeviceUser + USER_CREATED | **Worked** (`99182448`, G3) |
| C++ inventory_delta → plain POST | **Worked** (`identitySource=inventory_delta`) |
| FINGERPRINT_ENROLLED plain same DeviceUser | **Worked** (often backfill, G4) |
| Raw 684 on DeviceUser not AES | **Worked as storage** (G5) |
| Device re-read after synthetic write | **`numOfFP=0`** (gap) |
| C++ templates on that POST | **`fingerprintCount=0`** (gap) |
| Raw source label | `device_write_ok_reread_empty_donor_blob_labeled` (not goal) |
| Person 15 already on device with FP | ISAPI raw read works (proves **read** path; not synthetic write) |

**Exit of that stamp:** `GREEN_WITH_BOUNDARIES` — **this marathon treats that as incomplete.**

---

## PASTE BLOCK — copy everything inside the fence into the agent

```text
================================================================
JOB CARD — CREATE + ENROLL ARCHITECTURE → REALITY (NON-STOP)
================================================================
You are Project Truth owner-operator agent (NOT a chat summarizer).
Repo = this workspace root. Branch = develop.
Law = AGENTS.md + Agent-Meta-Prompt-Template.md + THIS JOB CARD.
Always-on: .grok/rules/00-wwg-session-bootstrap.md,
           .grok/rules/01-agent-owned-execution.md,
           .grok/rules/02-sdk-callback-wire-truth.md

DURATION CONTRACT:
- Budget: UP TO 3–4 HOURS continuous loop engineering.
- FORBIDDEN self-stops at 30s / 1m / 10m / 15m / “G3–G5 with donor is enough” /
  “rebuild later” / “user can press finger on panel” / “enough for now”.
- Wall-clock is NOT a finish line.
- Early finish ONLY if ACCEPTANCE (section F) is fully green with .runtime proof
  and goal architecture is reality (not GREEN_WITH_BOUNDARIES).

================================================================
A. EXIT GATE (read twice)
================================================================
Before ANY final/idle/summary-only message you MUST:

1) Re-list ACCEPTANCE boxes (section F).
2) If ANY required box is open:
   - You are NOT allowed to end the turn.
   - Next output MUST include:
     HEARTBEAT | cycle=N | phase=... | checklist=X/Y | last_proof=... | next=...
   - And MUST include a tool call (Read / Shell / Edit / SSH / Playwright / etc.)
3) Partial success is NOT done. Especially NOT done:
   - plain create works but enroll still donor-labeled
   - FP write HTTP OK but device numOfFP still 0 after all matrix attempts
   - C++ rebuilt but listener log never shows fingerprintCount>=1 for new person
   - DeviceUser has raw blob but source is donor / not device-person-read
   - code on disk, old binary still listening
   - “user should restart API / rebuild listener / enroll on panel”
4) Min heartbeats: 20 cycles OR full green — do not self-stop at cycle 3–8.
5) One sub-path blocked after 3 distinct recoveries with evidence → mark blocked,
   CONTINUE every other open box immediately.
6) Fake blockers (FORBIDDEN to stop on alone): Docker/VM off, port down, warm-up,
   PATH, npm install, flaky test, dirty git you can isolate, reverse tunnel needs
   start, DB 55435, Windows Start-Process npm (use npm.cmd), need rebuild/redeploy.
7) Real Stop only per AGENTS.md.

OPERATOR STEPS ARE AGENT STEPS:
- Restart hris-api with npm.cmd; poll http://localhost:3001/health.
- SSH LAN-first: ssh -i %USERPROFILE%\.ssh\node-health-appliance_ed25519 infra@10.184.37.19
  (fallback ssh project-truth-hris only if LAN fails). NEVER disable cloudflared.
- Rebuild/redeploy hikvision_biometric_service on VM; restart listener; prove new binary.
- Prove reverse: VM:59000→device:8000, :59443→443, :53001→host:3001.
- Login admin@bandai.local / password123 / appCode=hris.
- Synthetic create + enroll + re-read + callback proof under .runtime/.
- Playwright when UI claimed. Commit + push develop when green.

================================================================
B. GOAL ARCHITECTURE (must become REALITY — not aspirational)
================================================================
Canonical spec (OPEN WITH TOOLS):
  docs/HIKVISION_ENROLLMENT_IDENTITY_FLOW.md
  .wwg/wiki/05-architecture/hikvision-enrollment-identity-architecture.md
  .grok/rules/02-sdk-callback-wire-truth.md

Target wire (end state):

  [Device] User create (UserInfo) + fingerprint enroll (real templates on device)
       │
       ▼
  [Reverse] host SSH: VM 59000→device 8000 (SDK), 59443→443 (ISAPI), 53001→host 3001
       │
       ▼
  [C++ HCNetSDK] alarm_callback
       │  major=3 often dwEmployeeNo empty — DO NOT invent person id
       ▼
  [C++ enrich_hris_job_before_post]
       │  1) inventory delta / multipass → plain employeeNo + identitySource
       │  2) when plain known + enroll/user-mgmt → READ that person's FP templates
       │     (SDK NET_DVR_GET_FINGERPRINT_CFG_V50 primary; ISAPI FingerPrintUpload fallback)
       │  3) attach fingerprints[] raw base64 (NOT AES) + fingerprintCount>=1 when device has FP
       │  4) optional delayed re-POST 2s/5s/10s if first enrich still empty
       ▼
  POST /api/hikvision/callback  (source EN_HCNETSDK_ALARM)
       │  employeeNo PLAIN when enrich succeeded
       │  fingerprints[] optional on same POST when readable
       ▼
  [hris-api callback.controller]
       │  DeviceEvent USER_CREATED / FINGERPRINT_ENROLLED (ledger) employeeNo PLAIN
       │  DeviceUser upsert vendorUserId=plain + rawFingerprints from callback and/or follow-up read
       │  NEVER store opaque as employeeNo
       │  Socket device-event:saved reflects SAVED truth (empty until plain known — then plain)
       ▼
  [UI] Device Events: User <plain>  |  Device Users: raw present, NOT AES, source = device-person

HARD GOAL (new — replaces GREEN_WITH_BOUNDARIES):
  After create+enroll of NEW synthetic person P:
  1) Device re-read for P shows numOfFP >= 1 (or equivalent readable template count >=1)
  2) C++ listener log shows fingerprintCount >= 1 for P on a successful enrich/post
     OR HRIS path proves templates were read from device for P (not donor person 15)
  3) DeviceUser for P has raw template base64, isAes=false, source label device-owned
     (e.g. isapi_upload_person / sdk_get_fingerprint_cfg / callback_fingerprints)
     FORBIDDEN final label: *donor_blob*
  4) DeviceEvent USER_CREATED + FINGERPRINT_ENROLLED plain employeeNo=P same deviceUserId
  5) Socket/API list shows plain P (not stuck on Resolving if plain saved)

ALLOWED lag:
  First ACS packet may be empty person for ~seconds. Goal is plain after enrich/delta,
  not “first byte of ACS always has dwEmployeeNo”.

FORBIDDEN “fake green”:
  - raw 684 donor from person 15 labeled as success for person P
  - write statusCode OK without re-read proof
  - claiming C++ always plain without quoting listener JSON
  - inventing person id on socket that SDK never sent / enrich never set

================================================================
C. BOOTSTRAP (every session / resume)
================================================================
1) Read with tools (order):
   - .wwg/wiki/project-truth-summary.md (if present)
   - docs/HIKVISION_ENROLLMENT_IDENTITY_FLOW.md (goal)
   - .wwg/workspace/current-task.md
   - .wwg/reports/wwg-agent-handoff.md
   - .grok/rules/02-sdk-callback-wire-truth.md
   - latest .runtime/create-enroll* / live-cpp-enroll* summary.json
2) Emit short Current-State Report:
   - what is true now
   - STALE / CONFLICTING / NEEDS_CONFIRMATION
   - finish line = section F full green
   - will touch / will not touch
3) Then plan + execute. No edits before Current-State Report.

================================================================
D. TRACE PATH — OWNERS (change whatever is needed)
================================================================
You MAY edit any of these until acceptance is green. Prefer smallest proven fix.

| Layer | Primary files / surfaces |
|---|---|
| C++ alarm + enrich + POST | vendor/hikvision-linux/hikvision_biometric_service.cpp |
| C++ FP read/write SDK/ISAPI | same; NET_DVR_GET/SET_FINGERPRINT_CFG_V50, FingerPrintDownload/Upload |
| Build/deploy listener | VM rebuild scripts; restart service/process; prove binary mtime + log banner |
| Reverse tunnel | host scripts that map 59000/59443/53001; do NOT disable cloudflared |
| Callback API | hris-api/app/hikvision/controller/callback.controller.ts |
| Identity / multipass / opaque | hris-api/helper/device-person-token.helper.ts |
| Raw FP custody | hris-api/helper/device-user-raw-fingerprint.helper.ts |
| Socket emit | emitDeviceEventSaved / device-event realtime path |
| UI truth copy | Device Events + Device User details (only if data path green) |
| Tests | focused mocha/unit + optional Playwright for events/details |
| Docs/WWG | truth-sync after proven behavior change; current-task + handoff |

Do NOT invent endpoint shapes — open code first.

================================================================
E. EXECUTION PHASES (loop; re-enter failed phases)
================================================================

PHASE 0 — DISCOVERY / BASELINE
- Prove host API /health, DB path if needed.
- Prove reverse ports + device 8000/443 reachability from correct side.
- Prove listener process running; capture version/build stamp if any.
- Snapshot: person 15 rawPresent (control that READ works).
- Create evidence dir: .runtime/create-enroll-arch-reality-<stamp>/
- HEARTBEAT.

PHASE 1 — CODE TRACE (no assumptions)
- Open C++: alarm_callback, enrich_hris_job_before_post, build_hikvision_callback_json,
  FP get/set, inventory pagination, delayed re-POST, arm baseline seed.
- Open HRIS callback + raw fingerprint helper + applyFastEnrollmentIdentity.
- Write .runtime/.../trace-map.md: actual if/else for empty person and FP attach.
- Identify why synthetic write → numOfFP=0 and fingerprintCount=0 (hypotheses list).

PHASE 2 — FIX MATRIX: DEVICE FP STICKINESS (highest priority gap)
Goal: after enroll write for new person P, device re-read shows templates.

Attempt AT LEAST these distinct strategies (document each; 3+ recoveries before block):
  A) ISAPI FingerPrintDownload then FingerPrintUpload re-read (existing)
  B) SDK NET_DVR_SET_FINGERPRINT_CFG_V50 write + GET_V50 read
  C) Legacy NET_DVR_SET_FINGERPRINT if V50 fails
  D) Different fingerPrintID slots (1..10), enable flags, cardNo linkage if required
  E) Wait/retry after write (device async): 1s / 3s / 8s / 15s re-read
  F) Ensure UserInfo exists and is searchable BEFORE FP write
  G) If card required by device for FP: set minimal card/password per device docs/code
  H) Compare with person 15: dump working template meta (len, id, type) and mirror shape
  I) Delete+recreate P if half-state; never thrash production people (use high synthetic ids)

Each attempt → JSON evidence: write response, re-read numOfFP, template lengths, errors.

If device HARD-refuses sticky FP after full matrix with evidence:
  - Mark DEVICE_FP_STICKY = blocked with proof
  - Still continue PHASE 3–5 using person 15 (or known numOfFP>=1) for C++ attach proof
  - Do NOT call whole job done; record Real boundary honestly

PHASE 3 — C++ ENRICH: PLAIN ID + TEMPLATES ON POST
For create of new P:
  - Arm baseline seed so P is a real delta
  - On ACS empty: inventory_delta sets plain P; identitySource=inventory_delta
  - post_result / callback body employeeNo=P (quote listener log)
For enroll when device has FP for P (or control person with FP):
  - fingerprintCount >= 1, templatesAttached=true (or equivalent), fingerprints[] base64
  - identitySource correct
  - Delayed re-POST if first pass still empty templates after write settles
Improve C++ as needed: retries, ISAPI fallback, pagination, card→FP lookup, logging.

Rebuild + redeploy listener EVERY time C++ changes. Prove new log lines.

PHASE 4 — HRIS CALLBACK / DEVICEUSER / SOCKET
- Accept callback fingerprints[] → DeviceUser raw store immediately (no AES default)
- USER_CREATED / FINGERPRINT_ENROLLED employeeNo plain; same deviceUserId
- If first event empty person: multipass must backfill plain; socket re-emit
- Source labeling: if templates from callback, label callback_fingerprints;
  if from ISAPI helper for same person, label device read for that vendorUserId
- BAN promoting donor as success path in product code (dev-only diagnostic OK if labeled fail)

PHASE 5 — LIVE PROOF RUNS (must re-run after each material fix)
Synthetic person id: use unique high id e.g. 99YYMMDDHHMM or random 8-digit unused.
Run:
  1) Create P on device → wait enrich window → assert DeviceUser + USER_CREATED plain
  2) Enroll FP (best matrix path that achieved numOfFP>=1) → assert device re-read
  3) Trigger or wait ACS / force re-POST path → assert C++ fingerprintCount or HRIS device-read of P
  4) GET device users API: rawPresent, tplLen, isAes=false, source not donor
  5) GET device events: both actions plain, same deviceUserId
  6) Optional Playwright: Device Events shows User P; Device User details raw preview
Save full JSON under evidence dir. Update summary.json gates.

PHASE 6 — REGRESSION / CONTROL
- Person 15 (or known FP person): still raw readable, not broken by changes
- Empty ACS still must not invent person id
- Opaque must not land in employeeNo
- Attendance major=5 path not regressed if you touch shared callback

PHASE 7 — TRUTH SYNC + COMMIT
- Update .wwg/workspace/current-task.md with proven vs remaining
- If product behavior changed: sync docs/HIKVISION_ENROLLMENT_IDENTITY_FLOW.md gaps section
- Focused unit tests for helper/callback changes when applicable
- Commit + push develop when green (focused files only)
- Recommendation registry only for true out-of-scope follow-ups

================================================================
F. ACCEPTANCE CHECKLIST (all required unless Real Stop)
================================================================
Transport / runtime
[ ] F1 API /health green after agent restart if needed
[ ] F2 Reverse 59000/59443/53001 proven this run
[ ] F3 Listener rebuilt/redeployed if C++ changed; log proves new behavior

Create path
[ ] F4 New person P exists on device (UserInfo/Search)
[ ] F5 DeviceUser vendorUserId=P exists
[ ] F6 DeviceEvent USER_CREATED employeeNo=P (plain)
[ ] F7 Listener shows inventory_delta or plain ACS for P (quoted JSON)

Enroll path (HARD GOAL)
[ ] F8 Device re-read for P: numOfFP>=1 OR readable template count>=1
[ ] F9 Raw templates for P on DeviceUser: present, length>0, isAes=false
[ ] F10 Source label is device-owned for P — NOT *donor*
[ ] F11 DeviceEvent FINGERPRINT_ENROLLED employeeNo=P same deviceUserId as create
[ ] F12 C++ enrich/post for P with fingerprintCount>=1 OR documented device-read
     path for P with same-run evidence (not person 15 substitute)

Socket / API truth
[ ] F13 Saved events/API return plain P (no opaque in employeeNo)
[ ] F14 Socket path does not claim plain before save (wire-truth rule)

Quality / closeout
[ ] F15 Evidence dir complete: summary.json + per-step JSON + listener excerpts
[ ] F16 Goal-vs-reality table updated in summary (all goal rows Met or Real blocked)
[ ] F17 Focused tests green for code touched (or documented N/A)
[ ] F18 Commit + push develop when green
[ ] F19 No “you should…” residual for recoverable work
[ ] F20 Min 20 HEARTBEAT cycles OR all boxes green earlier

OPTIONAL (if hardware allows in same session)
[ ] F21 Physical panel create/enroll one finger for a new id — same F8–F12

================================================================
G. EVIDENCE CONTRACT
================================================================
$dir = .runtime/create-enroll-arch-reality-<yyyyMMdd-HHmmss>/
Required artifacts:
  - current-state.md
  - host-tcp.json / health
  - reverse-ports.json
  - listener-*.log excerpts (identity + fingerprintCount + post_result)
  - create-P.json, enroll-P.json, reread-P.json
  - device-user-P.json (rawPresent, source, isAes, tplLen)
  - events-P.json (USER_CREATED + FINGERPRINT_ENROLLED)
  - fp-matrix/*.json (each write strategy attempt)
  - summary.json:
      exitGate: GREEN | GREEN_WITH_REAL_BLOCKER | RED
      gates: F1..F20
      stillIncomplete: []
      goalVsReality: [ { step, goal, reality, status, proof } ]

FORBIDDEN:
  - exitGate GREEN while source is donor_blob
  - exitGate GREEN while numOfFP=0 and no Real Stop evidence pack
  - inventing listener lines or person ids

================================================================
H. GOAL VS REALITY TABLE (maintain every major cycle)
================================================================
Keep this table in summary / heartbeat notes:

| Step | Goal | Reality | Status |
| Create write | P on device | ... | |
| ACS first packet | may be empty | ... | |
| C++ inventory_delta | plain P | ... | |
| POST callback create | plain P | ... | |
| DeviceUser create | vendorUserId P | ... | |
| USER_CREATED | plain P | ... | |
| FP write | device accepts | ... | |
| FP re-read | numOfFP>=1 for P | ... | |
| C++ FP attach | fingerprintCount>=1 for P | ... | |
| DeviceUser raw | raw base64 not AES, source=device P | ... | |
| FINGERPRINT_ENROLLED | plain P same DeviceUser | ... | |
| Socket | matches saved plain | ... | |

================================================================
I. ANTI-HALLUCINATION / WIRE TRUTH
================================================================
- Do not claim first ACS always has plain id.
- employeeNo on socket = what was saved on that POST only.
- Opaque tokens are not plain person ids.
- DeviceEvent = history; DeviceUser = inventory.
- Ping ≠ reverse tunnel.
- Quote paths and log lines. Missing fact = NEEDS_CONFIRMATION or go read.

================================================================
J. START NOW
================================================================
1) Bootstrap + Current-State Report.
2) HEARTBEAT cycle=1.
3) PHASE 0 tool calls immediately.
4) Loop phases until section F green or Real Stop with evidence.
5) Never end with operator homework.

BEGIN.
```

---

## CONTINUE block (if agent stops early)

```text
CONTINUE CREATE+ENROLL ARCHITECTURE REALITY MARATHON.
Open docs/00-product/AGENT-PROMPT-create-enroll-architecture-reality-marathon.md.
Resume incomplete PHASE + open F-boxes.
Donor blob / numOfFP=0 / fingerprintCount=0 is NOT done.
EXIT GATE applies. HEARTBEAT + tool call next.
```

---

## What “success” looks like (operator check)

You should see under `.runtime/create-enroll-arch-reality-*/summary.json`:

```text
exitGate: GREEN
F8 numOfFP>=1 for new person P
F10 source not donor
F12 C++ fingerprintCount>=1 OR same-person device read proven
commit on develop
```

If device firmware truly cannot sticky-store synthetic FP, exit should be  
`GREEN_WITH_REAL_BLOCKER` with a full `fp-matrix/` failure pack — **not** silent donor green.

---

## Recommendation after first green

- Capture physical panel enroll as a second stamp (F21).
- Keep person-15 as regression control for ISAPI read.
- Do not weaken donor ban in product code after green.
