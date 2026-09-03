# Task Writer: Create + Enroll → plain ledger + DeviceUser raw FP/face → correct UI journey

**File:** `docs/00-product/AGENT-PROMPT-create-enroll-raw-blob-ledger-journey-marathon.md`  
**Purpose:** Force a non-stop, **source-of-truth** loop until:

1. **C++ listener → callback → socket** correctly drives create/enroll identity  
2. **Saved ledger** `USER_CREATED` + `FINGERPRINT_ENROLLED` show **plain person** (avatar / User N)  
3. **DeviceUser** holds **real raw fingerprint** (and **face** when device has it)  
4. **Device User details modal** shows those blobs without a confusing “Not captured yet” when data exists  
5. No donor-blob fake green; no inventing person ids; rebuild listener when C++ changes  

**Use when:** User sees create/enroll rows without person, modal empty for raw FP/face, or agents assume “first socket always plain” / skip C++ rebuild.

**Related cards (do not replace):**

| Card | Focus |
|---|---|
| This card | Identity + raw FP/face custody + ledger UX from **SDK callback truth** |
| `AGENT-PROMPT-create-enroll-architecture-reality-marathon.md` | Device FP stickiness / clone anti-dupe matrix |
| `AGENT-PROMPT-device-user-enroll-journey-truth.md` | Opaque map + Sync Center click |

---

## Operator setup (BEFORE pasting)

| Setting | Required |
|---|---|
| Working directory | Repo root `PROJECT_TRUTH_HYPERV_FRESH` |
| Branch | `develop` |
| Permissions | Always approve / bypassPermissions |
| Max turns (headless) | **`--max-turns 300`** |
| Wall clock | Up to **3–4 hours**; do not kill at 10–20 minutes |
| Host/VM | Windows host + Hyper-V VM; reverse `59000→8000`, `59443→443`, `53001→3001` |
| Actor | `admin@bandai.local` / `password123` / `appCode=hris` |

### Headless

```powershell
cd C:\Users\anoni\OneDrive\Desktop\PROJECT_TRUTH_HYPERV_FRESH

grok -p (Get-Content -Raw docs\00-product\AGENT-PROMPT-create-enroll-raw-blob-ledger-journey-marathon.md) `
  --max-turns 300 `
  --permission-mode bypassPermissions
```

### CONTINUE (if session dies early)

```text
CONTINUE CREATE+ENROLL RAW BLOB LEDGER JOURNEY MARATHON.
Open docs/00-product/AGENT-PROMPT-create-enroll-raw-blob-ledger-journey-marathon.md.
Resume incomplete PHASE + open F-boxes.
Source of truth = C++ listener + live callback/logs — not assumptions.
No donor blob green. No summary-only end. HEARTBEAT + tool call next.
```

---

## PASTE BLOCK — copy everything inside the fence

```text
================================================================
JOB CARD — CREATE+ENROLL RAW FP/FACE + LEDGER JOURNEY (SOURCE TRUTH)
================================================================
You are Project Truth owner-operator agent (NOT a chat summarizer).
Repo = workspace root. Branch = develop.
Law = AGENTS.md + Agent-Meta-Prompt-Template.md + THIS CARD.
Always-on: .grok/rules/00-wwg-session-bootstrap.md
           .grok/rules/01-agent-owned-execution.md
           .grok/rules/02-sdk-callback-wire-truth.md

DURATION:
- Up to 3–4 hours continuous loop.
- FORBIDDEN self-stop at 10m / “code looks fine” / “user can capture raw” /
  “first socket always plain” / “rebuild later”.
- Early finish ONLY if ACCEPTANCE (F) fully green with .runtime evidence.

================================================================
A. EXIT GATE
================================================================
Before ANY final/idle/summary-only message:

1) Re-list ACCEPTANCE boxes (section F).
2) If any open:
   HEARTBEAT | cycle=N | phase=... | checklist=X/Y | last_proof=... | next=...
   + a tool call.
3) NOT done if:
   - C++ changed but listener binary not rebuilt/redeployed and quoted
   - USER_CREATED / FINGERPRINT_ENROLLED still empty person while DeviceUser plain exists
   - DeviceUser raw FP missing when device numOfFP>=1 for that person
   - Modal shows “Not captured yet” while API/DB has rawPresent + templates
   - donor_blob labeled as success
   - claims about person id without opening C++ + listener log + saved event JSON
4) Min 20 HEARTBEATs or full green.
5) Fake blockers banned (Docker/VM/port/PATH/npm.cmd/restart/rebuild).
6) Real Stop only per AGENTS.md.

OPERATOR STEPS ARE AGENT STEPS:
- Restart API with npm.cmd; poll /health
- SSH: prefer LAN if real VM IP; on this host 10.184.37.19 may be loopback —
  use ssh project-truth-hris when needed. NEVER disable cloudflared.
- Rebuild/redeploy hikvision-biometric-service after EVERY C++ change
- Login admin, hit real endpoints, write .runtime evidence
- Playwright when UI claimed; commit/push develop when green

================================================================
B. SOURCE OF TRUTH (HARD — NO ASSUMPTIONS)
================================================================
Canonical sources (OPEN WITH TOOLS; quote paths):

1) C++ wire: vendor/hikvision-linux/src/hikvision_bio/acs.cpp + spool.cpp + identity.cpp + fingerprint.cpp + face.cpp
   - alarm_callback (acs.cpp): person ONLY from dwEmployeeNo > 0
   - enrich_hris_job_before_post (spool.cpp): inventory_delta + FP/face attach
   - build_hikvision_callback_json (acs.cpp) → POST /api/hikvision/callback
2) Live listener logs (VM): /var/log/project-truth/hikvision-hot-reload-listener.jsonl
   Quote: identitySource, employeeNo, fingerprintCount, templatesAttached, post_result
3) HRIS callback: hris-api/app/hikvision/controller/callback.controller.ts
4) Identity/raw helpers:
   hris-api/helper/device-person-token.helper.ts
   hris-api/helper/device-user-raw-fingerprint.helper.ts
5) UI: hris-app Device Events + Device user details (enroll.tsx)
6) Spec: docs/HIKVISION_ENROLLMENT_IDENTITY_FLOW.md
7) Prior evidence (re-verify, do not trust alone):
   .runtime/create-enroll-arch-reality-*/
   .runtime/user16-raw-fp-journey/

BANNED ASSUMPTIONS (from live proof):
- “First ACS create/enroll always has plain person id” → FALSE (major=3 often empty)
- “Event row stores full fingerData” → FALSE (DeviceEvent = ledger/pointer only)
- “HTTP FingerPrintDownload OK = sticky enroll” → FALSE (Progress status 5 can reject clone)
- “Donor template on new person is success” → FALSE
- “Listener green = person matched” → FALSE
- “Host reverse tunnel means VM can ping device” → FALSE
- “UI Not captured yet means DB empty” → may be UI merge bug; prove API/DB first
- “Face always exists” → only when device numOfFace/faceURL proves it

If you did not open the file/log this session → label NEEDS_CONFIRMATION.

IDENTITY PLANES:
- DeviceEvent = history (USER_CREATED / FINGERPRINT_ENROLLED / SYNC_SIGNAL)
- DeviceUser = inventory (vendorUserId plain + rawFingerprints + optional rawFace)
- Employee = HRIS link (optional; deviceEmpId plain match)

TARGET WIRE:

  Device panel create/enroll
       → HCNetSDK ACS (C++ listener on VM, reverse :59000)
       → enrich: plain id (inventory_delta if needed) + optional fingerprints[]/face
       → POST /api/hikvision/callback (source EN_HCNETSDK_ALARM)
       → Save DeviceEvent (may start empty person)
       → Fast identity / multipass logSearch / opaque→plain backfill
       → USER_CREATED + FINGERPRINT_ENROLLED with plain employeeNo + deviceUserId
       → scheduleRawFingerprintCapture (and face when device has face)
       → DeviceUser.vendorMetadata.rawFingerprints.templates[].data (base64, not AES)
       → DeviceUser.vendorMetadata.rawFace (base64 picture) when face exists
       → socket device-event:saved reflects SAVED truth (plain when saved)
       → UI: ledger shows User N + avatar/badge; Device user modal shows raw FP/face

NO permanent dependency on manual “Capture raw” endpoint for happy path.
Manual capture = repair only if auto path fails (document if used).

================================================================
C. BOOTSTRAP
================================================================
1) Read with tools:
   - .wwg/workspace/current-task.md
   - docs/HIKVISION_ENROLLMENT_IDENTITY_FLOW.md (goal)
   - .grok/rules/02-sdk-callback-wire-truth.md
   - latest .runtime/*create-enroll* / user16-raw* summaries
2) Current-State Report: true now / STALE / CONFLICTING / NEEDS_CONFIRMATION /
   finish line = section F / will touch / will not
3) Evidence dir: .runtime/create-enroll-raw-ledger-journey-<stamp>/

================================================================
D. CODE OWNERS (change as needed)
================================================================
| Layer | Files |
|---|---|
| C++ alarm/enrich/POST/FP/face | vendor/hikvision-linux/src/hikvision_bio/acs.cpp + spool.cpp + identity.cpp + fingerprint.cpp + face.cpp |
| Build/deploy listener | VM build.sh / systemctl project-truth-hikvision-hot-reload-listener |
| Callback | hris-api/app/hikvision/controller/callback.controller.ts |
| Plain backfill + schedule raw | device-person-token.helper.ts |
| Raw FP/face persist | device-user-raw-fingerprint.helper.ts (+ face helper if needed) |
| Preserve raw on UserInfo enrich | device-person-token enrich must NOT wipe rawFingerprints/rawFace |
| List/details API | device.controller listDeviceUsers; org from req.organizationId |
| UI ledger | events.tsx person ref / avatar |
| UI Device user modal | enroll.tsx — always merge HRIS DeviceUser raw into details |
| Tests | focused mocha + Playwright for ledger person + modal raw preview |

================================================================
E. PHASES (loop)
================================================================

PHASE 0 — TRANSPORT + LISTENER BASELINE
- API /health; reverse ports on VM; device 8000/443
- Listener process + binary mtime; service active
- Quote last enrich lines from listener jsonl (sudo if needed)
- HEARTBEAT

PHASE 1 — TRACE (no code until map written)
Write .runtime/.../trace-map.md with actual path:
- ACS empty vs plain
- When USER_CREATED / FINGERPRINT_ENROLLED are inserted (SDK vs logSearch)
- When plain backfill runs
- When scheduleRawFingerprintCapture runs
- Where face is read (ISAPI faceURL / SDK)
- How modal loads vendorMetadata (SOURCE_ONLY trap)
Quote line numbers / function names from opened files.

PHASE 2 — C++ (if gaps)
- Plain enrich inventory_delta + delayed re-POST when empty
- When plain known: attach fingerprints[] if device has templates
- Face template/picture when available (do not invent)
- Progress verify on FP write (status 5 = fail, not sticky)
- Rebuild binary on VM; restart service; prove strings/log banner new
Quote: callback_identity_inventory_delta / fingerprintCount / post_result

PHASE 3 — HRIS CALLBACK / STORAGE
- Never put opaque in DeviceEvent.employeeNo
- On plain known (fast identity OR sibling backfill):
  - USER_CREATED + FINGERPRINT_ENROLLED get plain + deviceUserId
  - re-emit socket
  - schedule raw FP capture for that plain person
  - schedule face raw capture when UserInfo numOfFace/faceURL > 0
- DeviceEvent: pointer/status only (rawFingerprintCustody on DeviceUser plane)
- DeviceUser: rawFingerprints templates base64; rawFace base64 if present
- UserInfo enrich MUST preserve existing rawFingerprints/rawFace
- Capture HTTP handler (if present) must use req.organizationId like listDeviceUsers

PHASE 4 — UI JOURNEY (not confusing)
Device Events:
- USER_CREATED / FINGERPRINT_ENROLLED with plain → “User N” + Device user badge/link
- No forever “Identity check pending” unless actively resolving
- SYNC_SIGNAL is path-alive; must not be the only row that shows person while create/enroll empty
Device User details:
- On open: always refetch HRIS DeviceUser by vendorUserId (not live-source-only metadata)
- Show raw FP: count, source, preview 120 chars, expand full base64, copy
- Show raw face: thumbnail if base64/contentType present; honest “no face on device” if numOfFace=0
- “Capture raw” button = repair only; auto path must work without it for happy path
- Never show “Not captured yet” when API returns rawPresent + template length >= 8

PHASE 5 — LIVE PROOF (required)
Use unique new synthetic person P (create via ISAPI UserInfo) AND/OR physical panel if available.
Also control person with known FP (e.g. 15 or 16) for read path.

Proof A — Create identity:
1) Create P on device
2) Wait enrich/multipass window
3) Assert DeviceUser vendorUserId=P
4) Assert DeviceEvent USER_CREATED employeeNo=P plain (not opaque)
5) Listener quote inventory_delta or plain ACS for P when available

Proof B — Enroll / raw FP:
1) If device can sticky-store FP for P (unique template — not clone of another person):
   prove numOfFP>=1 + DeviceUser raw for P
2) If clone blocked (Progress status 5): document REAL BLOCKER with evidence;
   prove raw path on control person who already has FP (15/16)
3) DeviceUser raw: isAes=false, length>0, source device-owned not *donor*
4) Event FINGERPRINT_ENROLLED plain P (or control) + deviceUserId match

Proof C — Face:
1) From UserInfo: numOfFace / faceURL for that person
2) If face exists: rawFace present on DeviceUser + modal shows image/preview
3) If not: honest status, do not invent face blob

Proof D — Journey:
1) Device Events: filter/search plain id → User N on create + FP rows
2) Click Device user → modal shows same plain id
3) Modal shows raw FP preview (and face if any)
4) Optional Playwright screenshots under .runtime/

PHASE 6 — REGRESSION
- Opaque not stored as employeeNo
- AES envelope not default for enroll custody
- Person 15/16 raw not wiped by UserInfo enrich
- Attendance major=5 not regressed if shared callback touched

PHASE 7 — CLOSEOUT
- summary.json goalVsReality table
- Update current-task.md
- Truth-sync docs if behavior changed
- Focused tests green
- Commit + push develop when green
- Recommendation only for true out-of-scope (e.g. physical panel if blocked)

================================================================
F. ACCEPTANCE
================================================================
Transport / C++
[ ] F1 API healthy after agent restart if needed
[ ] F2 Reverse ports proven this run
[ ] F3 Listener rebuilt/redeployed if C++ changed; log proves new behavior

Ledger identity (source path)
[ ] F4 New or control create: USER_CREATED employeeNo PLAIN
[ ] F5 FINGERPRINT_ENROLLED employeeNo PLAIN same deviceUserId when enroll proven
[ ] F6 No opaque in employeeNo on those rows after resolve window
[ ] F7 Listener JSON quoted for identity (inventory_delta and/or plain ACS) — not assumed

DeviceUser raw custody
[ ] F8 Fingerprint: device has readable FP → DeviceUser rawPresent, tplLen>=8, not AES, not donor
[ ] F9 Face: if device numOfFace/faceURL → rawFace present; else documented no-face evidence
[ ] F10 UserInfo enrich does not wipe rawFingerprints/rawFace (prove before/after or code+test)

UI journey
[ ] F11 Device Events shows User N (avatar/label) for create/enroll plain rows
[ ] F12 Device user modal for that N shows raw FP preview from saved DeviceUser
[ ] F13 Modal does not show “Not captured yet” when API rawPresent true
[ ] F14 Face UI honest (preview or “no face on device”)
[ ] F15 Happy path does not require manual capture endpoint (repair OK if labeled)

Quality
[ ] F16 Evidence dir: summary.json + event JSON + deviceUser JSON + listener excerpts + screenshots if UI
[ ] F17 Focused unit tests for helper/backfill/raw; Playwright if UI claimed
[ ] F18 Commit + push develop when green
[ ] F19 Min 20 HEARTBEATs or full green earlier
[ ] F20 No “you should hard-refresh / restart / click capture” residual for recoverable work

================================================================
G. EVIDENCE CONTRACT
================================================================
$dir = .runtime/create-enroll-raw-ledger-journey-<stamp>/

Required:
- current-state.md
- trace-map.md
- host-health / reverse-ports
- listener-*.log excerpts (identity + fingerprintCount + post_result)
- create-P.json / events-P.json / device-user-P.json
- control-person-raw.json (15 or 16)
- face-status.json (present or no_face with UserInfo proof)
- ui-journey.md or Playwright + screenshots
- summary.json:
    exitGate: GREEN | GREEN_WITH_REAL_BLOCKER | RED
    goalVsReality: [{ step, goal, reality, status, proof }]
    stillIncomplete: []
    sourceQuotes: [{ path, claim }]

FORBIDDEN green:
- donor_blob as success for person P
- inventing plain id on socket without save
- C++ “done” without rebuild+log quote
- Modal green without API/DB proof of raw

================================================================
H. GOAL VS REALITY TABLE (maintain every cycle)
================================================================
| Step | Goal | Reality | Status | Proof |
| C++ ACS | may empty first | | | listener |
| C++ enrich plain | inventory_delta | | | listener |
| POST callback | saved event | | | API/DB |
| USER_CREATED plain | User N | | | events JSON |
| FINGERPRINT_ENROLLED plain | User N same DeviceUser | | | events JSON |
| DeviceUser raw FP | base64 not AES | | | deviceUser JSON |
| DeviceUser raw face | if device has face | | | deviceUser JSON |
| Socket | matches saved | | | payload quote |
| Modal | shows raw + person | | | screenshot/API |
| Manual capture endpoint | not required happy path | | | proof path |

================================================================
I. START NOW
================================================================
1) Bootstrap + Current-State Report from opened files only.
2) HEARTBEAT cycle=1.
3) PHASE 0 tool calls immediately.
4) Loop until F green or Real Stop with evidence pack.
5) Never invent. Never assume first socket plain. Always rebuild C++ when changed.

BEGIN.
```

---

## What success looks like (operator check)

Under `.runtime/create-enroll-raw-ledger-journey-*/summary.json`:

```text
exitGate: GREEN
USER_CREATED + FINGERPRINT_ENROLLED employeeNo = plain N
DeviceUser N rawFingerprints.templates[0].data length >= 8, not AES, not donor
Face: rawFace OR proven numOfFace=0
Device Events: User N on those rows
Modal: raw preview visible without “Not captured yet” contradiction
Listener quotes for identity (not assumed)
C++ rebuilt if code changed
```

---

## Session-learned traps (built into card)

| Trap | Truth |
|---|---|
| Create/enroll ledger empty person, SYNC_SIGNAL has person | Opaque logSearch race; backfill plain onto lifecycle rows |
| Event has no fingerData | Correct — blobs on DeviceUser only |
| Modal “Not captured” but API rawPresent | UI must refetch HRIS DeviceUser, not live-source-only metadata |
| Capture API 400 “deviceId required” | Use `req.organizationId` (middleware), not only `req.user.organizationId` |
| FingerPrintDownload OK, numOfFP=0 | Progress status 5 clone anti-dupe; not sticky |
| Face always expected | Only when device has face |
| C++ edit without rebuild | Listener still old binary — not proven |
