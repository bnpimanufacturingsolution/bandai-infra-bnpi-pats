# Overnight multi-agent job — Main E + C device/BNPI PATS tally → unique ID truth

**File:** `docs/00-product/AGENT-PROMPT-overnight-main-e-c-device-bnpi-pats-tally-loop.md`  
**Purpose:** Ordered agentic graph + continuous overnight loop so **From device**, **Saved in BNPI PATS**, **Gap**, **Needs link**, and **merge-plan unique IDs** converge for **Main Entrance Device E** and **C** (then keep A/B/D/F honest).  
**Law:** `AGENTS.md` + residual detail (`.grok/rules/03-residual-count-detail.md`) + table-first reports + **no invented online / no bare residual integers**.

---

## Operator setup (before paste)

| Setting | Value |
|---|---|
| Repo | `C:\Users\stari\bandai-infra` |
| Branch | `develop` |
| Runtime | K3s DEV LAN first: app `http://10.184.37.19:3100`, API `http://10.184.37.19:3101` |
| Permissions | always-approve / `--permission-mode bypassPermissions` |
| Max turns | **`--max-turns 400`** (overnight; 50–80 fake-stops) |
| Wall clock | Plan **overnight (6–12h)**; do not kill after 10–30 min |
| Forbidden | Disable Cloudflare; invent login; claim green from stale UI alone |

### Headless example

```powershell
cd C:\Users\stari\bandai-infra
grok -p (Get-Content -Raw docs\00-product\AGENT-PROMPT-overnight-main-e-c-device-bnpi-pats-tally-loop.md) `
  --max-turns 400 `
  --permission-mode bypassPermissions
```

### CONTINUE (if session dies)

```text
CONTINUE OVERNIGHT MAIN E+C TALLY LOOP.
Open docs/00-product/AGENT-PROMPT-overnight-main-e-c-device-bnpi-pats-tally-loop.md.
Resume last incomplete PHASE / incomplete EXIT GATE row.
Spawn A-LOOP if missing. Next action = HEARTBEAT + tool call.
Do not re-plan from zero unless live evidence is missing.
```

---

## PASTE BLOCK — copy everything inside the fence

```text
================================================================
ROOT JOB CARD — OVERNIGHT MAIN E + C DEVICE/BNPI PATS TALLY + MERGE PLAN
================================================================
You are ROOT for Project Truth. Not a chat summarizer.
Repo = C:\Users\stari\bandai-infra. Branch = develop.
Runtime = K3s DEV http://10.184.37.19:3101 (LAN first).
Law = AGENTS.md + this card + residual honesty rules.

OPERATOR SYMPTOM (screenshot seed — MUST re-probe live; do not treat as final):

| Device | IP | From device | Saved BNPI PATS | Gap | Needs link |
|---|---|---:|---:|---|---:|
| Main Entrance Device E | 10.184.37.24:443 | 740 | 874 | 0 | 50 |
| Main Entrance Device C | 10.184.37.22:443 | 874 | 704 | 170 | 46 |
| Main A | 10.184.37.21 | 874 | 874 | 0 | 50 |
| Main B | 10.184.37.20 | 874 | 874 | 0 | 50 |
| Main D | 10.184.37.23 | 874 | 874 | 0 | 50 |
| Main F | 10.184.37.25 | 874 | 874 | 0 | 50 |
| TEST A / TEST B | 192.168.254.x | Unavailable | 507 / 172 | Unavail | 56 / 18 |
| Main 192.168.110.24 | — | Unavailable | 0 | Unavail | 0 |

OPERATOR INTENT (plain English):
1. Device truth ("From device") and BNPI PATS truth ("Saved in BNPI PATS") must be explained and repaired.
2. Merge plan unique-ID tally must match the real union of readable Main A–F panels (target ~874 when all readable).
3. Main E and Main C must reach: inventory readable + Saved≈From (or explained residual) + Gap→0 + Needs link burned/linked where auto-linkable + merge plan includes them honestly.
4. Run overnight with multi-agents + a LOOP/monitor agent. Fix code defects when software gates inflate residual.
5. No assumptions. Evidence under .runtime/ only.

================================================================
0. BOOTSTRAP (mandatory every resume)
================================================================
Open with tools (do not invent):
  .wwg/reports/wwg-agent-handoff.md
  .wwg/workspace/current-task.md
  .wwg/wiki/project-truth-summary.md
  task-relevant project-truth / terminology
  .grok/rules/03-residual-count-detail.md
  this job card
Write short Current-State Report, then spawn graph.

Stamp:
  $stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
  .runtime/overnight-main-ec-tally-$stamp/
  Write path to .runtime/current-overnight-main-ec-tally-dir.txt

Admin actor (never print tokens long-term):
  POST http://10.184.37.19:3101/api/auth/login
  { email:'admin@bandai.local', password:'password123', appCode:'bnpi-pats' }

================================================================
1. EXIT GATE (all required before DONE)
================================================================
| # | Check | Evidence |
|---|---|---|
| G1 | Live per-device matrix re-probed (not screenshot alone) | devices-matrix.json |
| G2 | Main C: Gap→0 OR residual table with vendorIds + blocker class | plan + reread |
| G3 | Main E: From device readable and explained vs Saved 874; either From→union target OR honest export/physical residual table | inventory + plan |
| G4 | Merge plan uniqueIds for scope Main A–F (exclude TEST while Unavail) equals live union; no double-count | plan JSON planId |
| G5 | Saved-in-BNPI PATS for C and E matches post-sync device-user rows (count + samples) | /users summary API |
| G6 | Needs link for C/E: auto-linkable burned OR residual table (unmatched vendorId list) | link job / UNMATCHED list |
| G7 | At least one authorized write wave when dryRun wouldWrite>0 (preview→dryRun→write→poll→reread) | job JSON |
| G8 | Code defects found fixed + unit/contract when software gate | git commit on develop |
| G9 | Cloudflare tunnel still active (never disable) | systemctl/ssh proof |
| G10 | HEARTBEATS ≥ 40 OR full green; STATUS.md + handoff | stamp |

Hard bans:
- Bare "gap=170" without vendorId samples
- Include TEST A/B while Unavailable as write targets
- Claim green from LAN health alone without device-user reread
- Write without dryRun
- Disable Cloudflare
- Stop overnight because "10 minutes elapsed"

================================================================
2. FROZEN SCOPE (re-verify IDs live every cycle)
================================================================
Include when inventory-readable:
  A 10.184.37.21  id seed cmrht5s2w00ei7zgsre8y3o5n
  B 10.184.37.20  id seed cmpxw13hx002h7zwso7dyedrn
  C 10.184.37.22  id seed cmripjwbx00ewl001ihcke210   ★ GAP 170 burn
  D 10.184.37.23  id seed cmripjwkw00ffl0013lfxcbxw
  E 10.184.37.24  id seed cmriu5ab102goi001x9o7nfct   ★ FROM 740 vs SAVED 874
  F 10.184.37.25  id seed cmrim1zop05ik7zp4zgm2sm4k

Exclude while Unavailable / unless live proves readable:
  TEST A 192.168.254.109
  TEST B 192.168.254.110
  Main Entrance Device 192.168.110.24

Canonical unique-ID target for Main A–F when all readable:
  ~874 unique vendor person IDs (re-prove from live plan; do not hardcode if plan differs).

================================================================
3. ORDERED AGENTIC GRAPH
================================================================
```
A-ROOT  (orchestrator: gates, spawn, never invent)
  │
  ├─ A-LOOP     ★ OVERNIGHT MONITOR (always on)
  │              every 10–15 min: read STATUS, job polls, restart dead children,
  │              HEARTBEAT, escalate blockers, refuse idle end
  │
  ├─ A-OBS      live matrix: ping/TCP + device health + users summary
  │              From device / Saved BNPI PATS / Gap / Needs link per device
  │
  ├─ A-E-TRUTH  Main E deep: why From=740 vs Saved=874 Gap=0
  │              full inventory reread, export gaps, stale BNPI PATS orphans,
  │              transport vs auth vs inventory-readable classes
  │
  ├─ A-C-GAP    Main C deep: Gap 170 = which vendorIds on peers not on C / not in BNPI PATS
  │              set diff A∪B∪D∪F∪E vs C vs DeviceUser rows
  │
  ├─ A-PLAN     POST merge/plan {deviceIds: live Main A–F readable}
  │              uniqueIds, per-device source rows, conflicts, credential residuals
  │
  ├─ A-SYNC     device-user sync / import for C (and E if under-read)
  │              so Saved in BNPI PATS catches From device
  │
  ├─ A-MERGE    recovery review → dryRun → write waves (face/fp/profile as needed)
  │              max 50 unique-person per wave; poll terminal; replan
  │
  ├─ A-LINK     Needs link burn: UNMATCHED → auto-link when employeeNo match
  │              residual unmatched table only
  │
  ├─ A-CODE     when residual software-inflated: fix planner/UI/sync path,
  │              tests, commit/push develop, redeploy DEV image if required
  │
  ├─ A-PW       Playwright: Device Users matrix + merge plan modal tallies
  │
  └─ A-TRUTH    STATUS.md + residual tables + handoff + recommendation-registry
```

EDGES (hard):
  A-OBS before A-PLAN
  A-PLAN before A-MERGE
  dryRun before write
  A-E-TRUTH + A-C-GAP before claiming G2/G3
  A-CODE only with failing evidence; redeploy before re-claiming UI green
  A-LOOP never kills Cloudflare; restarts only agent work / API if down

Spawn pattern each cycle:
  1) Ensure A-LOOP running (scheduler or background subagent)
  2) Parallel: A-OBS + A-E-TRUTH + A-C-GAP (read-only)
  3) Serial: A-PLAN → A-SYNC → A-MERGE → A-LINK
  4) If residual blocked by code: A-CODE → redeploy → re-OBS
  5) A-PW when UI claims change
  6) A-TRUTH every cycle end

================================================================
4. PHASE LOOP (repeat until EXIT GATE or real stop)
================================================================
PHASE 0 — Discover
  Login admin. List devices. Build live matrix matching UI columns.
  Classify each device: transport / auth / inventory-readable / callback (do not say "online").

PHASE 1 — Explain screenshot deltas (non-mutating)
  Main C Gap 170:
    Compute set: vendorIds on peers not saved for C; vendorIds on C not in DeviceUser.
    Table top 30 vendorIds + blocker class.
  Main E From 740 vs Saved 874 Gap 0:
    Prove whether inventory truly 740 (partial read?) vs BNPI PATS 874 orphans
    vs peer-only IDs never on E panel. Gap formula must be quoted from code/UI.

PHASE 2 — Sync / import (Saved in BNPI PATS)
  For C (and E if needed): run the real device-user sync path the UI uses
  (discover exact endpoint from code — do not invent).
  Poll until terminal. Re-count Saved in BNPI PATS.
  Goal: C Saved → ~874 (or From if From is truth); E explained.

PHASE 3 — Merge plan unique ID
  POST /api/device/hikvision/sdk-users/merge/plan
  Scope = readable Main A–F only.
  Record planId, uniqueIds, per-device counts, decision/FP/face residuals
  with residual honesty tables (never bare integers).

PHASE 4 — Merge / recovery writes
  recovery/review → dryRun → if wouldWrite>0 execute waves ≤50
  Poll job. Reread. Replan. Burn C gap and E under-inventory if writeable.
  Owner-scan incomplete / missing_raw_blob = agent export, not human enroll.

PHASE 5 — Needs link
  For C and E UNMATCHED lists: auto-link by vendorId/employeeNo when safe.
  Residual Needs link table with reason (no employee, duplicate, etc.).

PHASE 6 — Code defect loop
  If UI Gap/Saved/From disagree with API after fresh sync:
    Trace UI field path + API serializer + planner.
    Fix + test + commit + push develop + roll DEV image.
    Re-prove.

PHASE 7 — Proof + heartbeat
  Playwright matrix screenshot + plan modal.
  HEARTBEAT line. STATUS.md. Continue unless EXIT GATE green.

================================================================
5. API / endpoint contract (discover live; adapt)
================================================================
Login:
  POST /api/auth/login

Devices / users (examples — confirm in code):
  GET  /api/device
  GET  /api/device/:id/users?limit=&status=
  GET  /api/device/:id/users/summary   (or page-equivalent used by matrix)
  POST device sync/import endpoints used by Device Users "Sync" (trace from FE)

Merge:
  POST /api/device/hikvision/sdk-users/merge/plan  { deviceIds: [...] }
  POST /api/device/hikvision/sdk-users/merge/recovery/review
  POST /api/device/hikvision/sdk-users/merge/recovery/jobs
       { planId, dryRun, canaryModality?, maxVerifiedWrites? }
  GET  /api/device/hikvision/sdk-users/merge/recovery/jobs/:jobId
  POST /api/device/hikvision/sdk-users/merge/jobs   (profile apply only after plan valid)

Link (discover exact path from FE "Needs link"):
  deviceUserStatus=UNMATCHED queries + link employee endpoints

All mutating calls: Measure-Command + full JSON under stamp.

================================================================
6. RESIDUAL HONESTY (every count)
================================================================
### Residual: <label> = <N>
| Bucket | Count | What it is | Blocker class | Next step |
| vendorId | device | fields | A vs C/E | Why | Next |

Blocker classes only:
  code_defect | export_gap | apply_path | physical_boundary | optional_product

Needs link is NOT the same as Gap.
Gap is inventory/sync residual.
Needs link is employee match residual.
Decision/FP/FACE chips are merge residual — separate tables.

================================================================
7. A-LOOP CONTRACT (overnight monitor)
================================================================
A-LOOP must:
- Run continuously (background subagent or scheduler every 10–15m).
- Read stamp STATUS.md + latest job poll.
- If A-OBS/A-MERGE/A-CODE dead or stuck >2 cycles with no evidence: respawn.
- If API :3101 down: restart per AGENTS.md (npm.cmd / k8s rollout) — agent-owned.
- If write job processing: poll until terminal before new wave.
- Emit:
  HEARTBEAT | cycle=N | C_gap= | E_from= | E_saved= | uniqueIds= | needsLink_C= | needsLink_E= | job= | next=
- Min 40 heartbeats OR full EXIT GATE.
- Never end with "you should hard-refresh / click Sync".

Forbidden A-LOOP exits:
  summary-only; waiting on human; "continue tomorrow" without real stop condition.

Real stop only (AGENTS.md):
  3 distinct recovery failures with evidence; irreversible data risk; missing irrecoverable access; would invent secrets.

================================================================
8. MULTI-AGENT SPAWN PROMPTS (ROOT uses these)
================================================================
A-LOOP:
  "You are A-LOOP overnight monitor for stamp <path>. Every 10-15m read STATUS,
   poll active merge/sync jobs, ensure children alive, write HEARTBEAT, respawn
   stuck work. Never disable Cloudflare. Never invent green."

A-OBS:
  "Re-probe all devices. Build From/Saved/Gap/NeedsLink matrix JSON matching UI.
   Quote endpoints. No 'online' word — use evidence classes."

A-E-TRUTH:
  "Main E only. Explain 740 vs 874 vs Gap 0 from live inventory + DeviceUser + plan.
   Output vendorId set diffs and blocker classes."

A-C-GAP:
  "Main C only. Enumerate Gap 170 as vendorId list (or top buckets). Propose sync then merge wave."

A-PLAN:
  "Fresh merge plan Main A–F readable only. Save planId + uniqueIds + residual tables."

A-SYNC:
  "Run device-user sync for C (and E if under-read). Poll terminal. Re-count Saved."

A-MERGE:
  "recovery review→dryRun→write≤50→poll→reread→replan until C gap/E truth burn or physical_boundary only."

A-LINK:
  "Burn auto-linkable Needs link on C/E; residual unmatched table."

A-CODE:
  "Only if evidence shows code/UI/planner defect. Fix, test, commit, push, deploy DEV."

A-PW:
  "Playwright Device Users matrix + merge plan; screenshot under stamp."

A-TRUTH:
  "STATUS.md + handoff + recommendations Proposed only."

================================================================
9. SUCCESS PICTURE (what operator should see)
================================================================
| Device | From device | Saved BNPI PATS | Gap | Needs link |
|---|---|---|---|---|
| Main C | ~874 | ~874 | 0 | residual explained or ↓ |
| Main E | ~874 (or honest <874 with physical table) | matches truth | 0 | residual explained or ↓ |
| Main A/B/D/F | stay ~874/874/0 | stable | 0 | residual explained |

Merge plan modal: unique IDs = live union; no TEST noise while Unavailable.

================================================================
10. START NOW
================================================================
1. Bootstrap + stamp
2. Spawn A-LOOP (persistent)
3. Spawn A-OBS + A-E-TRUTH + A-C-GAP in parallel
4. Then A-PLAN → A-SYNC → A-MERGE → A-LINK
5. Loop until EXIT GATE or real stop
6. Commit/push green code fixes on develop
First tool call within this turn. HEARTBEAT every cycle.
================================================================
```

---

## Quick reference graph (visual)

```text
                    ┌─────────────┐
                    │   A-ROOT    │
                    └──────┬──────┘
                           │
              ┌────────────┼────────────┐
              ▼            ▼            ▼
         ┌────────┐   ┌────────┐   ┌─────────┐
         │ A-LOOP │   │ A-OBS  │   │ A-TRUTH │
         │overnight│   │matrix │   │ STATUS  │
         └────┬───┘   └───┬────┘   └─────────┘
              │           │
              │     ┌─────┴──────┐
              │     ▼            ▼
              │ ┌────────┐  ┌────────┐
              │ │A-E-TRUTH│  │A-C-GAP │
              │ │ E 740? │  │ C 170  │
              │ └────┬───┘  └───┬────┘
              │      └────┬─────┘
              │           ▼
              │      ┌────────┐
              │      │ A-PLAN │ uniqueIds
              │      └────┬───┘
              │           ▼
              │      ┌────────┐
              │      │ A-SYNC │ Saved BNPI PATS
              │      └────┬───┘
              │           ▼
              │      ┌────────┐
              │      │ A-MERGE│ dryRun→write
              │      └────┬───┘
              │           ▼
              │      ┌────────┐
              │      │ A-LINK │ Needs link
              │      └────┬───┘
              │           ▼
              │      ┌────────┐     ┌──────┐
              └─────►│ A-CODE │────►│ A-PW │
                     └────────┘     └──────┘
```

---

## Screenshot seed interpretation (agent must re-prove)

| Signal | Likely meaning (hypothesis only until live proof) | Agent next |
|---|---|---|
| **C Gap 170** | Panel has 874 people; BNPI PATS only saved 704 for C | Sync/import C → Saved 874; then merge residual if peers differ |
| **E From 740 / Saved 874 / Gap 0** | BNPI PATS ahead of panel **or** partial inventory read **or** Gap formula ignores Saved>From | Full E inventory reread; set-diff vs peers; classify export vs physical |
| **Needs link ~46–50** | DeviceUser rows without employee link | UNMATCHED list + auto-link; residual table |
| **A/B/D/F 874/874/0** | Healthy reference for unique-ID target | Keep in plan scope; do not break |
| **TEST / 192.168.110 Unavail** | Out of write scope | Exclude until readable |

---

## Related cards

| Card | When |
|---|---|
| `AGENT-PROMPT-merge-users-zero-decision-fp-face-gap-multiagent.md` | DECISION/FP/FACE → 0 after tally green |
| `AGENT-PROMPT-sync-logs-truth-3hr-marathon.md` | Sync logs UI marathon |
| This card | **Device matrix + Saved BNPI PATS + unique ID for Main E/C overnight** |
