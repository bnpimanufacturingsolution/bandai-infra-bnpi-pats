# Task Writer: Device user enroll journey truth (opaque map → events → inventory → Sync Center click)

**File:** `docs/00-product/AGENT-PROMPT-device-user-enroll-journey-truth.md`  
**Purpose:** Force a non-stop loop until the **real device-user journey** works end-to-end: create/enroll on Hikvision → write-time opaque map → Device Events show plain person no → DeviceUser inventory has the person → Sync Center “Device user” click opens that inventory row (not empty, not HRIS Employees).  
**Use when:** Device Events show USER_CREATED / FINGERPRINT_ENROLLED but Sync Center Device Users is empty; clicks feel broken; opaque “Device person token” still appears; you are not sure callback / socket / on-enroll actually works.

---

## What the human already did (ground truth from session)

1. Proved on TEST A Hikvision device (`cmrlgqsjv000oob01165tbd8n`, e.g. `192.168.254.189`) that:
   - `UserInfo/Record` with plain `employeeNo` (e.g. `t18live80695`, `t18tmp458`) works.
   - Device logSearch `addUserInfo` emits **opaque** `LogAddInfo.EmployeeNo` (base64, 16-byte-style token such as `+M+Q+tGsTOTHIoXFK4rr2A==`).
   - Opaque tokens **cannot** be reverse-looked-up as employeeNo on the device.
   - Write-time capture after create maps opaque → plain and stores `DevicePersonToken`.
2. Opened **Device Events** and filtered:
   - **USER_CREATED** → saw rows with plain nos like `t18live80695` / `t18tmp458`, labels like “Device user plane / Direct device evidence” (partial success).
   - **FINGERPRINT_ENROLLED** → still saw **opaque** person tokens and “Device person token / Not linked to HRIS yet” (failure for historical / unmapped FP rows).
3. Clicked **Device user** (or opened Sync Center Device Users) for that person:
   - Landed on Sync Center / Device Users with search for `t18live80695` (or similar).
   - Source/view was effectively **live Device (ISAPI)** (or default merge that depends on live source).
   - Result: **“No device users found”** / empty table — even though Device Events show the create.
4. Correct mental model the human is enforcing:
   - These temp people are **device-side users**, not HRIS Employees.
   - Device Events = **what happened** (lifecycle ledger).
   - Device Users = **who is on the device inventory** (durable `DeviceUser` rows).
   - Clicking Device user must open **inventory on that device**, not Employees, and not an empty live-source search after the person was deleted or never stubbed.

---

## Problem statement (do not re-argue — fix)

| Surface | What human sees | What is actually wrong |
|---|---|---|
| Device Events USER_CREATED | Plain `t18…` after write-time map | Events can resolve without inventory existing |
| Device Events FINGERPRINT_ENROLLED | Opaque `+M+Q…` / `Device person token` | No map at FP enroll time, or historical rows never captured; list/callback resolve only when map exists |
| Sync Center Device Users | Empty for `t18live80695` | Click path used live **Source: Device (ISAPI)** or default “shown” merge; person may be **gone from terminal** (temp deletes) and/or **never upserted as DeviceUser**; wrong view = empty |
| “SDK / callback / on enroll / on create” feel | Nothing trustworthy | Journey not closed: write → capture → event → **DeviceUser stub** → deep-link to **HRIS inventory view** → optional FP enroll map → socket `device-event:saved` |

**Root causes already known (treat as facts unless evidence overturns):**

1. **Two planes:** `DeviceEvent` ≠ `DeviceUser`. Saving events alone does not guarantee Sync Center inventory rows unless code upserts stubs.
2. **Opaque IDs:** Hikvision log plane uses privacy tokens; plain `employeeNo` only appears on UserInfo write path. Map must be captured **write-time** (create/modify/enroll), not reverse-engineered offline.
3. **Temp demo cleanup:** Earlier proofs deleted users off the device → live ISAPI search returns 0 even when events still exist.
4. **UI deep-link bug/drift:** “Device user” must open  
   `action=device-users&deviceId=…&syncPanel=users&deviceUserView=hris&deviceUserSearch=<plainNo>`  
   not live source-only and not Employees.
5. **Uncommitted / unrestarted code:** Inventory stub + deep-link work may exist in working tree but not running process / not on `develop` yet — always restart API/app and re-prove live.

---

## Goal / finish line (what “actually works” means)

A new admin/device journey must be **provably true** for TEST A:

```text
Create (or enroll) person on device with plain employeeNo
  → write-time opaque capture succeeds (DevicePersonToken row)
  → DeviceEvent USER_CREATED (and FP enroll if performed) saved with resolved plain employeeNo
  → DeviceUser inventory stub exists for (deviceId, vendorUserId=plainNo)
  → Device Events UI shows plain person no (not “Device person token”) for that new work
  → Click “Device user” opens Sync Center HRIS inventory filtered to that plain no
  → Table shows the DeviceUser row (name/status/fingerprint flags as available)
  → Person is still on device OR inventory view still shows HRIS DeviceUser stub with honest empty-source note
  → socket/list/callback path uses same resolve helper (no second truth)
  → evidence in .runtime/ + commit/push develop when green
```

**Out of scope unless unblocked by evidence:** remapping **historical** opaque FP rows with no write-time map (cannot invent mapping); full HCNetSDK alarm login if credentials fail; turning Cloudflare tunnel off.

---

## PASTE BLOCK — copy everything inside the fence into Grok / Codex / Claude

```text
================================================================
TASK CARD — DEVICE USER ENROLL JOURNEY TRUTH (OPAQUE → EVENTS → INVENTORY → CLICK)
================================================================
You are Project Truth owner-operator agent (NOT a chat summarizer).
Repo = workspace root. Branch = develop.
Law = AGENTS.md + Agent-Meta-Prompt-Template.md + THIS CARD.
Open WWG with tools before edits (project-truth-summary, current-task, handoff, drift-guard).

----------------------------------------------------------------
A) WHAT THE HUMAN DID (recreate / continue — do not dismiss)
----------------------------------------------------------------
1. On Hikvision TEST A device id cmrlgqsjv000oob01165tbd8n they created temp
   device people with plain employeeNo (examples: t18live80695, t18tmp458).
2. Write-time logSearch capture mapped opaque LogAddInfo.EmployeeNo → plain no
   (example opaque for t18live80695: +M+Q+tGsTOTHIoXFK4rr2A==).
3. Device Events → USER_CREATED shows those plain nos (partial win).
4. Device Events → FINGERPRINT_ENROLLED still shows opaque “Device person token”
   for unmapped / historical rows (pain).
5. Click Device user / Sync Center Device Users for t18live80695 shows
   “No device users found” under Device (ISAPI) / empty table (blocker).
6. Human wants proof that create/enroll callbacks, sockets, and post-action
   events truly work for the admin journey — not just a ledger row that cannot
   open inventory.

----------------------------------------------------------------
B) PROBLEM TO FIX
----------------------------------------------------------------
- Device Events can show USER_CREATED without DeviceUser inventory existing.
- Deep-link / Sync Center defaults to live source or wrong view → empty when
  person deleted off terminal or never stubbed.
- FP enroll historical opaques stay unresolved without write-time map.
- Journey must treat people as DEVICE inventory (DeviceUser), not HRIS Employees.
- Agent must not end with “you should hard-refresh / click Sync / restart API”.

----------------------------------------------------------------
C) TARGET BEHAVIOR
----------------------------------------------------------------
1. On every successful UserInfo Record/Modify and fingerprint enroll path that
   knows plain employeeNo: captureOpaqueTokenAfterUserWrite + upsert
   DevicePersonToken + upsertDeviceUserInventoryStub.
2. On DeviceEvent persist (import/callback/list heal): if plain employeeNo
   resolved, upsert DeviceUser inventory stub (non-blocking).
3. Device Events “Device user” link MUST be:
   /admin/configuration/devices?action=device-users&deviceId=<id>&syncPanel=users
   &deviceUserView=hris&deviceUserSearch=<plainEmployeeNo>
4. Sync Center default when opened from events must show HRIS DeviceUser rows
   for that search even if live ISAPI currently returns 0.
5. New FP enrolls after map capture must resolve plain no on list/callback.
6. Optional but preferred: leave at least one stay-on-device demo user
   (e.g. t18stay*) for click proof; document if later deleted.

----------------------------------------------------------------
D) EXECUTION LOOP (non-stop)
----------------------------------------------------------------
PHASE 0 — Bootstrap + Current-State Report
- Read AGENTS.md intent, WWG summary/current-task/handoff, relevant code:
  hris-api/helper/device-person-token.helper.ts
  hris-api/app/device/device.controller.ts (persist + list resolve)
  hris-api/app/hikvision/controller/* (record/callback)
  hris-app/app/routes/admin/devices/events.tsx (Device user deep-link)
  hris-app/app/routes/admin/devices/enroll.tsx (deviceUserView filters)
- Report: STALE / CONFLICTING / NEEDS_CONFIRMATION / finish line this turn.

PHASE 1 — Runtime recover (agent-owned)
- Ensure DB reachable (local 5432 and/or tunnel 55435 as this host uses).
- Restart API with npm.cmd / scripts/restart-local-hris-api-dev.ps1; poll /health.
- Ensure app on :3000 if browser proof needed.
- Login admin@bandai.local / password123 appCode=hris for all probes.

PHASE 2 — Inventory backfill for known mapped people
- For each DevicePersonToken on TEST A (and any t18* events with resolved plain no):
  upsert DeviceUser (organizationId, deviceId, vendorUserId=employeeNo).
- Prove GET /api/device/:id/users (or /api/device/users?deviceId=) contains
  vendorUserId t18live80695 / t18tmp458 / new demo ids.
- If missing, fix helper/controller paths and re-run create with capture.

PHASE 3 — Live create stay-on-device demo (do not auto-delete)
- Create UserInfo/Record plain employeeNo t18stay<suffix>.
- captureOpaqueTokenAfterUserWrite; assert DevicePersonToken + DeviceUser.
- Import or persist USER_CREATED DeviceEvent with resolved employeeNo.
- Confirm person still on device via UserInfo/Search (or note inventory-only).
- Write evidence JSON under .runtime/device-user-enroll-journey-<stamp>/.

PHASE 4 — Deep-link + Sync Center UI truth
- Ensure events.tsx getDeviceUserSyncCenterUrl uses deviceUserView=hris.
- Ensure enroll.tsx honors deviceUserSearch + deviceUserView=hris and does not
  clear search on modal open.
- API + Playwright (preferred headless): open Device Events USER_CREATED for
  demo person → click Device user → URL has deviceUserView=hris and search →
  table row visible (not “No device users found”).
- If empty: fix view filter / query / missing stub — do not blame the human.

PHASE 5 — Fingerprint enroll path (best effort, still try 3 ways)
- If ISAPI/SDK enroll with known plain employeeNo is possible: enroll → capture
  map source FINGERPRINT_ENROLL → DeviceEvent FINGERPRINT_ENROLLED resolves.
- If physical finger not available: simulate only the resolve/stub path with a
  marked proof row and document boundary; still keep create-user journey green.
- Historical opaque FP without map: label NEEDS_CONFIRMATION / unresolvable;
  do not fake resolve.

PHASE 6 — Callback / socket truth
- Prove list API returns personTokenResolved + plain employeeNo for mapped tokens.
- Prove callback/persist path calls resolve + inventory stub.
- If io available, note device-event:saved emission on save (existing path).
- Dual-source: do not invent SDK alarm success without device credentials proof.

PHASE 7 — Commit / push / truth-sync
- Commit only when acceptance green for create→inventory→click journey.
- Push develop. Update WWG current-task / recommendation-registry if residual.
- No operator homework in the closing message.

----------------------------------------------------------------
E) ACCEPTANCE CHECKLIST (all required unless real blocker)
----------------------------------------------------------------
[ ] API healthy; admin login works
[ ] At least one NEW mapped create (t18stay* or equivalent) with:
    DevicePersonToken + DeviceUser + DeviceEvent USER_CREATED plain no
[ ] GET device users API returns that vendorUserId
[ ] Device Events UI shows plain employeeNo for that create (not opaque badge)
[ ] Device user deep-link URL includes deviceUserView=hris and deviceUserSearch
[ ] Sync Center Device Users shows the row when opened from that link
[ ] FINGERPRINT path: either resolved new enroll OR documented boundary with
    3 attempts evidence
[ ] Evidence folder under .runtime/ with API JSON (+ Playwright screenshots if UI)
[ ] Relevant code committed + pushed develop when green
[ ] Closing summary lists remaining residuals honestly (historical opaque FP, etc.)

----------------------------------------------------------------
F) EXIT GATE (hard ban)
----------------------------------------------------------------
FORBIDDEN to end the turn if any required acceptance box is open and the issue
is recoverable (API down, missing stub, wrong deep-link, uncommitted UI fix,
app not restarted, empty search because view=source).
FORBIDDEN exit lines: “you should hard-refresh”, “restart the API”, “open Sync
and click”, “try Playwright yourself”.
ALLOWED early stop only on Real Stop Conditions in AGENTS.md after 3 distinct
documented recovery failures with evidence.

----------------------------------------------------------------
G) CONTINUE (if session dies)
----------------------------------------------------------------
CONTINUE DEVICE USER ENROLL JOURNEY TRUTH.
Open docs/00-product/AGENT-PROMPT-device-user-enroll-journey-truth.md.
Resume incomplete PHASE and open ACCEPTANCE boxes.
Do not re-plan from zero. Next action = tool call + evidence.
EXIT GATE still applies.
```

---

## Operator setup (before paste)

| Setting | Value |
|---|---|
| Working directory | Repo root `PROJECT_TRUTH_HYPERV_FRESH` |
| Branch | `develop` |
| Permissions | Always approve / bypassPermissions |
| Max turns (headless) | **≥ 120** (80 is often too low for device + UI) |
| Wall clock | 45–120 minutes typical; not a stop signal |

```powershell
cd C:\Users\anoni\OneDrive\Desktop\PROJECT_TRUTH_HYPERV_FRESH
grok -p (Get-Content -Raw docs\00-product\AGENT-PROMPT-device-user-enroll-journey-truth.md) `
  --max-turns 150 `
  --permission-mode bypassPermissions
```

### Short CONTINUE paste

```text
CONTINUE DEVICE USER ENROLL JOURNEY TRUTH.
Open docs/00-product/AGENT-PROMPT-device-user-enroll-journey-truth.md.
Resume incomplete PHASE and open ACCEPTANCE boxes.
Next action = tool call. No operator homework. EXIT GATE applies.
```

---

## One-paragraph “what’s happening in my screenshots”

**Image 1 (USER_CREATED):** The event ledger is partially winning — write-time map resolved plain device person nos for recent creates. That proves **events**, not that inventory or click-through works.  
**Image 2 (Sync Center empty):** You opened **device user inventory / live source search** for that person and got zero. Either the temp user is **no longer on the terminal**, the UI is on **Device (ISAPI)** instead of **HRIS DeviceUser inventory**, or the backend never created a **DeviceUser** stub when the event was saved.  
**Image 3 (FINGERPRINT_ENROLLED opaque):** Fingerprint lifecycle rows still carry Hikvision’s privacy token because those enrolls were **not write-time mapped** (often older imports). Without a `DevicePersonToken` row, HRIS correctly cannot invent a plain employeeNo.

The product gap is not “events don’t exist” — it is **closing the journey**: map + inventory stub + correct Sync Center view so create/enroll → click Device user → see the person.
