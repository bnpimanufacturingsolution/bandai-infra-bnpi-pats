# Task Writer: C++-first create/enroll raw truth (stop assuming)

**File:** `docs/00-product/AGENT-PROMPT-cpp-first-create-enroll-raw-truth.md`  
**Purpose:** Force agents to prove the **real wire** from Hikvision ACS → C++ listener → POST body → HRIS callback → DeviceEvent/DeviceUser → socket → UI **before** changing product code. Stops the failure mode of editing HRIS/UI while C++ still posts `employeeNo=""` and `fingerprintCount=0`.

**Use when:** User created/enrolled on device but raw FP/face never appear unless they click Capture; agents keep “fixing” helpers without quoting listener logs; you want one correct finish line.

---

## Why previous prompts/agents failed (session-learned — treat as facts)

| Failure | What actually happened | What this card forces |
|---|---|---|
| Assumed architecture, edited HRIS first | Live listener showed `callback_enrich_done` with `employeeNo=""`, `fingerprintCount=0`, `templatesAttached=false` then `post_result ok` — **C++ never sent templates** | **PHASE 0–2 = C++ only** until POST body proven |
| “Event should have raw” without wire proof | Blobs only arrive if C++ attaches them **or** HRIS ISAPI follow-up runs **after plain id** | Prove which path produces bytes |
| Manual Capture felt required | Auto path never got plain + templates on same POST; ISAPI capture not always scheduled at event create | Auto path must work without Capture button |
| Donor clone for synthetic FP | Device Progress status 5 rejects another person’s template | Never green donor as enroll success |
| Skipped WWG / AGENTS | Invented IPs, device counts, “always plain on socket” | Mandatory WWG + `.grok/rules/02-sdk-callback-wire-truth.md` |
| Claimed C++ done without rebuild | Old binary still listening | Rebuild + quote new log lines |
| Modal “Not captured” = no data | Sometimes DB had raw, UI read live-only SOURCE row | Prove API/DB before UI claims |

---

## Operator setup

| Setting | Value |
|---|---|
| Repo | `PROJECT_TRUTH_HYPERV_FRESH` root |
| Branch | `develop` |
| Permissions | Always approve / bypassPermissions |
| Max turns | **`--max-turns 300`** |
| Actor | `admin@bandai.local` / `password123` / `appCode=hris` |
| SSH | Prefer real LAN VM IP if known; on this host `10.184.37.19` may be **loopback** — use `ssh project-truth-hris` when LAN SSH fails. **Never** disable cloudflared. |

### Headless

```powershell
cd C:\Users\anoni\OneDrive\Desktop\PROJECT_TRUTH_HYPERV_FRESH

grok -p (Get-Content -Raw docs\00-product\AGENT-PROMPT-cpp-first-create-enroll-raw-truth.md) `
  --max-turns 300 `
  --permission-mode bypassPermissions
```

### CONTINUE

```text
CONTINUE C++-FIRST CREATE ENROLL RAW TRUTH.
Open docs/00-product/AGENT-PROMPT-cpp-first-create-enroll-raw-truth.md.
Do NOT edit HRIS/UI until PHASE 2 has listener quotes for plain id AND fingerprints/face or a documented C++ gap with evidence.
WWG open with tools. HEARTBEAT + tool call next.
```

---

## PASTE BLOCK

```text
================================================================
JOB CARD — C++-FIRST CREATE / ENROLL RAW TRUTH
================================================================
You are Project Truth owner-operator agent (NOT a chat summarizer).
Repo = workspace root. Branch = develop.

LAW (open with tools, do not skip):
1) AGENTS.md (auto-loaded — still obey)
2) .grok/rules/00-wwg-session-bootstrap.md
3) .grok/rules/01-agent-owned-execution.md
4) .grok/rules/02-sdk-callback-wire-truth.md  ← HARD for person id / socket
5) WWG operating contract order BEFORE substantive plan/edit:
   - .wwg/wiki/project-truth-summary.md (if present)
   - .wwg/wiki/project-truth.md (relevant sections)
   - .wwg/wiki/terminology.md (relevant terms)
   - .wwg/wiki/principles/README.md + evidence-over-assumption.md when reasoning
   - .wwg/workspace/current-task.md
   - .wwg/governance/drift-guard.md
   - README.md when needed
6) Spec: docs/HIKVISION_ENROLLMENT_IDENTITY_FLOW.md
7) Source of wire truth: vendor/hikvision-linux/hikvision_biometric_service.cpp
8) Live logs: /var/log/project-truth/hikvision-hot-reload-listener.jsonl (sudo if needed)

After open: short Current-State Report (what files say / STALE / CONFLICTING /
NEEDS_CONFIRMATION / finish line / will touch / will not).
Then plan. NO code edits before Current-State Report.

DURATION: up to 3–4 hours. Forbidden early stop. Min 20 HEARTBEATs or full green.

================================================================
A. EXIT GATE
================================================================
Before ANY final/summary-only message:

1) Re-list ACCEPTANCE F.
2) If any open: HEARTBEAT + tool call. No idle end.
3) NOT done if:
   - You edited HRIS/UI without PHASE 2 C++ wire evidence this session
   - You claim templates on socket without quoting listener callback_enrich_done
     with fingerprintCount>=1 OR faceTemplateChars>0 OR a full POST body dump
   - You claim plain on create/enroll without quoting employeeNo non-empty in
     listener post path (inventory_delta or acs_dwEmployeeNo)
   - C++ changed but binary not rebuilt/redeployed and proven
   - donor_blob as success
   - “you should click Capture / hard-refresh / restart” as exit
4) Real Stop only per AGENTS.md after 3 distinct recovery attempts with evidence.

================================================================
B. GOAL (operator product truth — do not invent beyond this)
================================================================
When user creates a person and/or enrolls fingerprint (and face if device has it)
on the Hikvision device that the C++ listener is armed on:

1) C++ receives ACS alarm (entry: alarm_callback)
2) C++ enrich fills plain person when ACS empty (inventory_delta / multipass)
3) C++ attaches raw fingerprint templates (base64) when that person has FP on device
4) C++ attaches face template/picture when card+face available
5) POST /api/hikvision/callback body includes:
   employeeNo plain (when resolved), fingerprintCount, fingerprints[], faceTemplate/facePicture
6) HRIS saves:
   - DeviceEvent USER_CREATED / FINGERPRINT_ENROLLED with plain employeeNo + deviceUserId
   - DeviceUser inventory with vendorUserId plain
   - Raw FP (and face if any) usable on DeviceUser AND on the create/enroll event
     payload so the journey is not “empty until manual Capture”
7) Socket device-event:saved reflects SAVED rows (plain when saved; not invented)
8) UI: ledger shows User N; Device user modal shows raw FP/face without false
   “Not captured yet” when API has data

Happy path does NOT require a manual Capture button. Capture = repair only.

PLANES (do not confuse):
- DeviceEvent = history ledger (operator now also wants raw blobs on create/enroll
  events so the journey is complete — implement only after C++ or auto-ISAPI proof)
- DeviceUser = inventory + biometric custody
- Employee = optional HRIS link (deviceEmpId plain)

================================================================
C. REALITY (proven this project — re-verify, do not “remember”)
================================================================
Re-open logs/code this session. Baseline from 2026-07-19 live evidence
(must re-confirm with tools):

| Fact | Evidence pattern |
|---|---|
| alarm_callback person ONLY from dwEmployeeNo>0 | C++ source |
| major=3 create/enroll often employeeNo empty | listener callback_enrich_done identitySource=empty |
| Live posts often fingerprintCount=0 templatesAttached=false | listener jsonl quote required |
| POST still ok=true with empty person | post_result ok with employeeNo="" |
| inventory_delta CAN set plain (e.g. 99182448, 16) | prior listener quotes — re-prove |
| Device FingerPrintDownload OK + Progress status 5 | clone of person-15 template rejected |
| ISAPI can READ raw FP for persons who already have FP (15,16,1) | prior .runtime proofs — re-prove |
| Face only if numOfFace/faceURL (person 1 yes; 16 no) | UserInfo proof |
| Event historically pointer-only; DeviceUser held raw after ISAPI capture | code + DB |

If live logs still show fingerprintCount=0 for all create/enroll traffic,
the gap is FIRST in C++ enrich (plain empty → templates skipped), NOT “UI forgot”.

================================================================
D. HARD ORDER OF WORK (do not reorder)
================================================================

### PHASE 0 — WWG + baseline (read-only)
- Open WWG + wire rule + current-task + handoff as required
- Current-State Report
- Evidence dir: .runtime/cpp-first-create-enroll-raw-<stamp>/
- API /health; reverse ports 59000/59443/53001 (SSH); device TCP 8000/443
- Listener service active; binary path/mtime
- HEARTBEAT cycle=1

### PHASE 1 — C++ SOURCE TRACE (read-only, write trace-map.md)
Open hikvision_biometric_service.cpp and quote line-backed map:

1. alarm_callback
   - employee_no assignment
   - include_fingerprints flags
   - queue_hris_device_event
2. enrich_hris_job_before_post
   - when identity empty → inventory_delta / repost
   - needs_callback_template_enrich gate (when it EARLY RETURNS with fingerprintCount 0)
   - read_source_fingerprints + read_fingerprints_via_isapi
   - face read conditions (card required?)
3. build_hikvision_callback_json
   - fields: employeeNo, fingerprintCount, fingerprints, faceTemplate, facePicture
4. post_hikvision_callback
   - actual POST URL and whether body is logged

Write: .runtime/.../trace-map.md with function names + what MUST be true for
templates to appear on the wire.

FORBIDDEN in PHASE 1: editing HRIS, React, “fix UI”.

### PHASE 2 — LIVE C++ WIRE PROOF (still prefer no HRIS product rewrite)
Using SSH to the VM listener host:

A) Capture last 100 enrich/post lines:
   callback_enrich_done, isapi_fingerprint_read, inventory_delta, post_result
   Save: listener-wire-baseline.jsonl excerpt

B) Induce a real create/enroll path on the armed TEST device (ISAPI create of
   unique high employeeNo P, and if possible FP enroll path). Prefer physical
   panel if operator can; else synthetic create + document FP stickiness.

C) Within the window, quote NEW listener lines for P:
   - Did inventory_delta set employeeNo=P?
   - Did fingerprintCount become >=1 for P?
   - faceTemplateChars / facePictureChars?
   - post_result employeeNo?

D) Capture the ACTUAL POST body if C++ logs it (preview/body field) OR
   capture at hris-api with a temporary evidence log of incoming
   fingerprints length / identitySource — evidence only, not a product “fix”.

E) Write wire-proof.md:
   | Signal | Plain id on POST? | fingerprintCount | face chars | Proof path |

IF fingerprintCount stays 0 whenever employeeNo empty:
  → C++ bug/gap: templates gated on plain id; inventory_delta failing or too late
  → FIX C++ FIRST (PHASE 3). Do not paper over with only UI Capture.

IF plain is set but fingerprintCount 0 while device numOfFP>=1 for that person:
  → C++ FP read path broken (SDK/ISAPI) — fix C++ read/retries/ISAPI path
  → Prove after rebuild with isapi_fingerprint_read fingerprintCount>=1

IF C++ posts fingerprints[] with data but HRIS DeviceUser empty:
  → THEN (and only then) fix callback.controller / persist path
  → Quote request body fingerprintCount and DB after POST

### PHASE 3 — C++ FIX + REBUILD (only if PHASE 2 shows C++ gap)
Allowed changes limited to making the wire true:
- Ensure after inventory_delta sets plain, template enrich always runs
- Ensure ISAPI FP read works through reverse :59443 as C++ uses it
- Face attach when plain + card + face exists (no invent)
- Log full enrich outcome including fingerprintCount and data length
- Delayed re-POST must re-run template enrich when plain newly found

MANDATORY after C++ edit:
1) SCP source to VM
2) Rebuild binary (known build.sh / g++ path under /home/infra/project-truth-hikvision-biometric-service)
3) systemctl restart project-truth-hikvision-hot-reload-listener
4) Prove binary mtime + strings or new log fields
5) Re-run live create/enroll; quote NEW enrich lines

### PHASE 4 — HRIS RECEIVE + STORAGE (only after PHASE 2/3 wire proof)
Open callback.controller.ts — do not guess:

When POST contains fingerprints[] / faceTemplate / facePicture:
- Persist to DeviceUser rawFingerprints / rawFace (not AES default)
- Persist SAME usable blobs onto create/enroll DeviceEvent payload
  (operator requirement: journey sees blobs on the ledger event, not only
  after manual Capture). If product size limits apply, document max and still
  store on DeviceUser always.
- Socket emits SAVED event with plain employeeNo when known

When POST has empty fingerprints but plain id + device has FP:
- After plain known (fast identity or backfill), auto ISAPI capture MUST run
  for USER_CREATED / FINGERPRINT_ENROLLED without operator Capture click
- Attach results to DeviceUser + those events

When opaque logSearch creates lifecycle rows:
- Backfill plain from inventory_delta / recent SDK plain
- Then auto capture raw for that plain person onto those events

Never store opaque token in DeviceEvent.employeeNo.

### PHASE 5 — UI (last)
Only after API returns rawPresent / event.payload.rawFingerprints:
- Device Events: User N on USER_CREATED / FINGERPRINT_ENROLLED
- Device user modal: show raw FP preview + face image when present
- Never show “Not captured yet” when GET device user or event has templates
- Capture button = repair only

### PHASE 6 — ACCEPTANCE PROOFS (all required unless Real Stop)
Proof pack under .runtime/cpp-first-create-enroll-raw-<stamp>/:

P1 Listener: enrich with plain employeeNo for create path (quote)
P2 Listener: fingerprintCount>=1 OR documented device has numOfFP=0 for that person
P3 If person has face on device: faceTemplateChars or facePictureChars >0 on enrich OR
   HRIS auto-capture face after plain with evidence
P4 POST/callback evidence: fingerprints length or rawTemplatesFromCallback true
P5 DeviceUser: raw FP base64 len>=8, not AES, not donor
P6 DeviceEvent USER_CREATED and/or FINGERPRINT_ENROLLED: plain employeeNo +
   raw fingerprints (or rawFace) on payload as implemented
P7 Socket/API list shows plain User N (no opaque employeeNo)
P8 Modal or API journey: raw visible without manual Capture for the proven path
P9 Focused tests for persist/backfill; commit+push develop when green

### PHASE 7 — CLOSEOUT
- summary.json goalVsReality table with proof paths
- current-task.md addendum
- Recommendation only for true out-of-scope (e.g. physical unique FP if device blocks clone)

================================================================
E. ACCEPTANCE CHECKLIST
================================================================
[ ] E0 WWG + wire rule opened; Current-State Report written
[ ] E1 trace-map.md from C++ source (line-backed)
[ ] E2 listener baseline quotes (fingerprintCount reality)
[ ] E3 live induce create/enroll; new listener quotes saved
[ ] E4 C++ gap fixed+rebuilt OR proven C++ already sends templates
[ ] E5 HRIS only fixed after wire proof that POST has or lacks templates
[ ] E6 DeviceUser raw FP for person with device FP
[ ] E7 Face: stored when device has face; honest empty when not
[ ] E8 Create/enroll events plain person + raw on event payload (operator goal)
[ ] E9 No manual Capture required for proven happy path
[ ] E10 UI not contradicting API
[ ] E11 evidence dir complete + summary.json
[ ] E12 commit/push develop when green
[ ] E13 min 20 HEARTBEATs or full green

================================================================
F. BANNED BEHAVIOR
================================================================
- Editing enroll.tsx / random helpers before quoting C++ enrich lines this session
- Declaring “architecture correct” from memory
- Green donor_blob
- Inventing employeeNo on socket
- “First ACS always plain”
- Skipping listener rebuild after C++ edit
- Ending with operator homework for recoverable steps
- Claiming face without UserInfo numOfFace/faceURL evidence

================================================================
G. START NOW
================================================================
1) Open WWG + 02-sdk-callback-wire-truth + C++ file + current-task (tools).
2) Current-State Report.
3) HEARTBEAT cycle=1 | phase=0
4) PHASE 0–2 tool calls immediately. No HRIS product rewrite until wire proof.

BEGIN.
```

---

## Goal vs reality (cheat sheet for the agent)

| Step | Goal | Live reality (re-verify) |
|---|---|---|
| ACS person | May be empty | Often empty on major=3 |
| C++ enrich plain | inventory_delta | Sometimes works; often still empty on repost |
| C++ fingerprints on POST | count≥1 when device has FP | Often **0** / templatesAttached false |
| Socket | What was saved | Cannot invent templates C++ never sent |
| Manual Capture | Not required | Currently often required → **bug** |
| Event ledger | Plain User N + raw usable | Plain after backfill; raw must come from C++ POST or auto-ISAPI |
| DeviceUser | Raw FP/face | ISAPI can fill when forced; must be automatic |

---

## Success

```text
exitGate GREEN only if:
- Listener quotes prove plain and/or explain empty with C++ fix
- When device has FP for that person, wire or auto-ISAPI puts raw on DeviceUser
  without Capture click
- Create/enroll events show plain person
- Operator journey not empty/confusing
- Evidence under .runtime/cpp-first-create-enroll-raw-*
```
