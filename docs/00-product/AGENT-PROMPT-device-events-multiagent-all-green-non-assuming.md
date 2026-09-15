# Agent job card — Device Events multi-agent all-green (non-assuming)

**Mode:** execution · owner-operator · **100% agent-owned** · non-stop until EXIT GATE  
**Primary UI:** `https://dev.bnpi-pats.tech/admin/configuration/devices/events?view=saved`  
**Primary API:** `https://dev-api.bnpi-pats.tech`  
**Actor:** `admin@bandai.local` / `password123` / `appCode='bnpi-pats'` (bnpi-pats-admin)

Paste into a high-budget agent (`--max-turns` high enough for multi-hour work).  
**Do not invent.** Every claim needs opened WWG/code/runtime/API/SSH/log evidence or label `NEEDS_CONFIRMATION` / `CONFLICTING` / `STALE`.

### Agent-owned hard ban (no human homework)

Root and all children **own every recoverable step**. Forbidden exit patterns:

- "you should hard-refresh / open Device Events / click Prove"
- "restart the API and try again"
- "I will continue later" / "ready for you to verify"
- ending with only a SPAWNED list while EXIT GATE open

**Required agent ownership map**

| Need | Agent does (never asks human) |
|---|---|
| API / pod down | restart deploy, wait Ready, re-probe |
| DB down | recover postgres / re-probe live-readiness |
| Listener inactive / login_failed | systemctl status/start/restart (no thrash when armed quiet) |
| Watcher 400 / ghost | soft-delete NO_ACCESS ghost; deploy skip-guard; bounce watcher |
| pathReady / pathOk missing | wire probe; rebuild/import image; roll DEV |
| Socket All-devices miss | UNION emit fix + unit tests |
| UI vs API red | Playwright login + settle; fix auth if code defect |
| Manager loop dead | restart `loop-device-events-manager.ps1` |
| Code defect | implement + unit test + commit/push develop |
| Dirty recoverable git | focused commit + push |

**Physical only (not agent-fakeable):** major-5 attendance tap for G2 liveReceiving / ENROLL YES. Everything else is agent-owned.

---

## 0. Non-assuming rules (hard)

1. **Screenshot ≠ truth.** Red strip during Keep ready repairing / API restart is **startup lag** until re-proved after pods `Ready`.
2. **Health 200 ≠ Device Events green.** Always call live-readiness + events list + listener/watcher logs.
3. **Armed quiet ≠ broken.** G1 path green does **not** require a tap. G2 live green **does**.
4. **Empty person on major=3** is wire truth until multipass proven — not automatic “listener dead”.
5. **Never disable** `cloudflared-bnpi-pats.service`.
6. **Never soft-delete** devices that still have credentials without evidence they are ghosts.
7. Prefer **direct API evidence first**, then browser/Playwright.
8. Prefer **LAN/VM SSH** when routable; `ssh project-truth-bnpi-pats` is OK when LAN times out (documented host drift).

---

## 1. Finish line (EXIT GATE)

### G1 — Path green at boot / after restart (must always pass)

| # | Check | How to prove |
|---|---|---|
| G1.1 | DEV API `/health` 200 | public `dev-api` |
| G1.2 | Login + `/api/auth/me` admin | token works |
| G1.3 | `live-readiness.database.ok === true` | GET live-readiness |
| G1.4 | `pathReady === true` | field present after deploy |
| G1.5 | `listener.running && listener.armed` | live-readiness + systemd |
| G1.6 | `callbackPost.pathOk === true` | not stuck `null` forever |
| G1.7 | `safeToTap === true` | live-readiness |
| G1.8 | UI strip not permanent **DB down** after 60s settle | Playwright or API+screenshot |
| G1.9 | Watcher: 0× `missing access credentials` in last 15m | kubectl logs |
| G1.10 | Ghost no-creds Main Entrance Device soft-deleted if present | psql `isDeleted=true` |
| G1.11 | **Restart resilience:** stop/start watcher (and/or roll API once) → re-run G1.1–G1.10 still green | intentional bounce |

### G2 — Live receiving green (required if task asks “realtime always”)

| # | Check | How |
|---|---|---|
| G2.1 | After major-5 tap (or approved synthetic prove): `listener.receiving` or fresh `lastPostAt` | live-readiness |
| G2.2 | New `DeviceEvent` row appears without hard refresh | socket and/or 2s poll + API |
| G2.3 | Person id plain when ACS provides it (major 5) | row fields |
| G2.4 | All-devices filter receives `device-event:saved` (union rooms) | socket test / inject / live |

### Observability green

| # | Check |
|---|---|
| O.1 | Grafana/Loki/Prometheus health when reachable (CF or in-VM) |
| O.2 | No repeating error class unfixed after 3 recoveries without bucket table |
| O.3 | Heartbeats written every cycle to `.runtime/` |

**Stop only** on Real Stop Conditions (3 distinct recovery failures with evidence, irreversible data risk, missing irrecoverable access, would invent secrets/evidence).

---

## 2. Root agent + multi-agent roles

### Root (you)

- Own EXIT GATE, heartbeats, merge decisions, commit/push when green.
- **You MUST spawn child agents with the tool API** (`spawn_subagent` / Task / equivalent). Doing all work only in root is a **prompt violation** unless a tool outage is evidenced in MANIFEST + chat (`tool_unavailable` / `ROOT_FALLBACK`).
- **You MUST print SPAWNED and AGENT_DONE lines in chat** every time (see Operator visibility). Tool-only spawns are not enough.
- Never wait idle on one blocked path — spawn others.
- Resolve `CONFLICTING` evidence yourself (do not pick the convenient side).

### Hard multi-agent protocol (anti “nothing is spawning”)

**HARD — not optional.** Silent solo root work is a **prompt violation**.  
“Spawn when possible” / “background only” / “I did it myself for speed” are **banned** without a recorded tool-outage path below.

Root **must** do all of the following in **cycle 1** (before claiming progress):

1. Create stamp dir `.runtime/device-events-allgreen-<stamp>/` and write `LATEST` pointer.
2. **MUST-SPAWN in parallel in one turn (cycle 1):** **A-OBS**, **A-CLASS**, **A-MON**, **A-DRIFT**  
   (add A-FIX-BE / A-FIX-RT / A-VERIFY as soon as defects or verify phase starts; spawn **A-PROMPT** if multi-agent visibility or this card is broken).
3. Immediately write `MULTI-AGENT-MANIFEST.json` under the stamp dir (exact filename):

```json
{
  "stampDir": ".runtime/device-events-allgreen-<stamp>/",
  "spawnedAt": "<iso>",
  "mode": "multi_agent",
  "goalReached": false,
  "agents": [
    { "role": "A-OBS", "subagent_id": "<id>", "status": "running", "deliverable": "01-obs.md" },
    { "role": "A-CLASS", "subagent_id": "<id>", "status": "running", "deliverable": "02-error-classification.md" },
    { "role": "A-MON", "subagent_id": "<id>", "status": "running", "deliverable": "05-monitor.md" },
    { "role": "A-DRIFT", "subagent_id": "<id>", "status": "running", "deliverable": "06-drift-compliance.md" }
  ]
}
```

4. **Chat-visible SPAWNED line** (required in root reply text every spawn — not only tool logs):

```text
SPAWNED | A-OBS=<id> | A-CLASS=<id> | A-MON=<id> | A-DRIFT=<id> | stamp=<path>
```

5. Update manifest when each agent completes (`status=completed|failed|root_fallback`, `output_path`, `finishedAt`).
6. **Re-spawn on missing deliverable:** if a child fails to write its deliverable within a reasonable cycle → **re-spawn that role once**, then root fills the file with evidence and labels the agent row `ROOT_FALLBACK` in both chat and manifest.
7. Root may do probes **in parallel with** children, but root must **not** replace spawning when spawn tools work.

### Operator visibility (hard — chat must show multi-agent)

Root **must print these lines in the visible chat reply every time** (operators cannot see tool-only background spawns):

| When | Required chat line |
|---|---|
| After every successful spawn batch | `SPAWNED \| A-OBS=<id> \| A-CLASS=<id> \| A-MON=<id> \| A-DRIFT=<id> \| stamp=<path>` |
| After any additional spawn | `SPAWNED \| <ROLE>=<id> \| stamp=<path>` |
| When a child finishes (success or fail) | `AGENT_DONE \| role=<ROLE> \| id=<id> \| status=completed\|failed\|root_fallback \| deliverable=<path>` |
| When A-DRIFT finds protocol drift | `DRIFT_ALERT \| severity=<red\|yellow> \| item=<code> \| next=<spawn role or fix>` |
| When re-spawning | `SPAWNED \| <ROLE>=<id> \| reason=re-spawn_missing_deliverable \| stamp=<path>` |
| When tools unavailable (see below) | `SPAWNED \| mode=ROOT_FALLBACK \| reason=tool_unavailable \| stamp=<path>` then still emit `AGENT_DONE` per role when that deliverable is written by root |

Also keep `MULTI-AGENT-MANIFEST.json` in sync with every SPAWNED / AGENT_DONE event.  
If the operator cannot see SPAWNED / AGENT_DONE in chat, the multi-agent protocol **failed** even if background work ran.

### Failure mode: agent tools unavailable (never silent solo)

If `spawn_subagent` / Task / equivalent agent tools are **missing, erroring, or return no id**:

1. **Do not** continue as silent solo. Explain once in chat with evidence (tool error text or “no spawn API”).
2. Write / update `MULTI-AGENT-MANIFEST.json` immediately with:

```json
{
  "stampDir": ".runtime/device-events-allgreen-<stamp>/",
  "spawnedAt": "<iso>",
  "mode": "ROOT_FALLBACK",
  "toolStatus": "tool_unavailable",
  "toolEvidence": "<error or missing-tool description>",
  "agents": [
    { "role": "A-OBS", "subagent_id": null, "status": "tool_unavailable", "deliverable": "01-obs.md", "owner": "ROOT_FALLBACK" },
    { "role": "A-CLASS", "subagent_id": null, "status": "tool_unavailable", "deliverable": "02-error-classification.md", "owner": "ROOT_FALLBACK" },
    { "role": "A-MON", "subagent_id": null, "status": "tool_unavailable", "deliverable": "05-monitor.md", "owner": "ROOT_FALLBACK" }
  ]
}
```

3. Still produce **all mandatory deliverables** under the stamp dir as **ROOT_FALLBACK** (root executes the same jobs A-OBS / A-CLASS / A-MON would have done).
4. Print chat lines:

```text
SPAWNED | mode=ROOT_FALLBACK | reason=tool_unavailable | stamp=<path>
AGENT_DONE | role=A-OBS | id=ROOT | status=root_fallback | deliverable=<path>
AGENT_DONE | role=A-CLASS | id=ROOT | status=root_fallback | deliverable=<path>
AGENT_DONE | role=A-MON | id=ROOT | status=root_fallback | deliverable=<path>
```

5. Optionally spawn **A-PROMPT** (or root-edit this card) only to document the tool gap — do **not** invent that multi-agent ran.

**Banned:** claiming multi-agent progress with empty/missing MANIFEST, or solo EXIT GATE work with no `tool_unavailable` record.

### Spawn these agents (mandatory roster)

| Agent | Type | Job | Deliverable |
|---|---|---|---|
| **A-OBS** | general-purpose (execute) | Collect health, live-readiness, pod status, systemd, watcher/API/listener logs, Loki/Grafana if up | `01-obs.md` + JSON |
| **A-CLASS** | explore or general | Classify every distinct error (bucket table) | `02-error-classification.md` |
| **A-FIX-BE** | general-purpose | Code/config fixes only when OPEN code defects | code + tests |
| **A-FIX-RT** | general-purpose | Runtime bounce, image roll, ghost SQL | `03-runtime-actions.md` |
| **A-VERIFY** | general-purpose | API prove + Playwright + restart bounce | `04-verify.md` + screenshots |
| **A-MON** | general-purpose | 12+ **product** health cycles (API pathReady / listener / watcher) writing HEARTBEAT lines | `05-monitor.md` |
| **A-DRIFT** | general-purpose (compliance) | **Prompt + roster compliance cop.** Runs from cycle 1 and **re-runs every cycle while EXIT GATE not green**. Detects root solo drift, missing SPAWNED/MANIFEST/deliverables, goal stall | `06-drift-compliance.md` + `06-drift-compliance.json` |
| **A-PROMPT** | general-purpose (prompt writer) | **Must** be spawnable when multi-agent is invisible, SPAWNED lines missing, or this job card is soft/broken; revises hard protocol only | updated job card under `docs/00-product/` |

**Cycle-1 must-spawn:** A-OBS + A-CLASS + A-MON + **A-DRIFT** (parallel).  
**A-DRIFT re-spawn rule:** while `goalReached=false` (G1 incomplete), root **must** keep A-DRIFT running or re-spawn it at least every cycle (or use the drift script loop).  
**A-PROMPT:** not required every run; **required** when A-DRIFT severity=red on protocol, or operator reports spawn invisibility.

Root synthesizes `00-ROOT-STATUS.md` each cycle (G1 table + agent roster status + MANIFEST path + last A-DRIFT verdict).

### A-DRIFT — prompt status / anti-drift (hard, **non-stop loop**)

**Purpose:** A-MON watches **DEV product health**. A-DRIFT watches **whether this job card is being followed** and whether the goal is stalling.

**Critical operator complaint we fix here:** Subagents must **not** fire once and disappear. A-DRIFT + the **manager loop** keep the job alive until the goal **holds**.

**Persistent manager (required while goal not held):**

```powershell
# Does not exit on first green. Holds HoldGreenCycles then may stop.
# While red/drift: rewrites MANAGER-NEXT-SPAWNS.md every cycle (root must spawn those roles).
powershell -File scripts/loop-device-events-manager.ps1 -IntervalSeconds 60 -HoldGreenCycles 5 -MaxHours 24
# Optional full realtime gate:
# powershell -File scripts/loop-device-events-manager.ps1 -RequireG2 -HoldGreenCycles 3 -MaxHours 48
```

Root **must** start this loop in cycle 1 (background process or scheduler). If the loop is dead and goal not held → **protocol red** (D-LOOP).

**When A-DRIFT / manager must run**

| Trigger | Action |
|---|---|
| Cycle 1 | Always spawn A-DRIFT + start `loop-device-events-manager.ps1` |
| Every manager interval while goal not held | Re-run drift script; rewrite `MANAGER-NEXT-SPAWNS.md`; root re-spawns listed roles |
| Subagent completes | **Do not treat as job done** — only manager `GOAL-HELD.flag` or EXIT GATE table all PASS + hold cycles |
| Operator says “nothing spawning” / “drifting” | Spawn A-DRIFT + A-PROMPT + restart manager loop immediately |
| Goal held (HoldGreenCycles) | Manager writes `GOAL-HELD.flag`; A-DRIFT final compliant pass; then may stop |

**Checks (fail closed → DRIFT_ALERT)**

| Code | Check | Severity if fail |
|---|---|---|
| D1 | `MULTI-AGENT-MANIFEST.json` exists in stamp | red |
| D2 | MANIFEST lists A-OBS, A-CLASS, A-MON, A-DRIFT (or tool_unavailable fallback) | red |
| D3 | Heartbeats file has recent lines (not silent > 2 cycles) | yellow/red |
| D4 | Deliverables exist for completed roles: `01-obs.md`, `02-error-classification.md`, `05-monitor.md` | red if role claimed done |
| D5 | `00-ROOT-STATUS.md` exists and has G1 table | yellow |
| D6 | G1 open items have a **next agent action** (not only “operator should…”) | red |
| D7 | No solo root EXIT GATE without `mode=ROOT_FALLBACK` + tool evidence | red |
| D8 | Goal stall: same G1 fail set for ≥3 heartbeats with no new SPAWNED/fix | red → spawn A-FIX-* |
| D9 | `pathReady`/live-readiness regression vs last GREEN snapshot | yellow/red |
| D10 | Watcher miss / ghost active reappeared | red → A-FIX-RT |

**Scripts:**

```powershell
# One-shot compliance (also called every manager cycle)
powershell -File scripts/check-device-events-prompt-drift.ps1 -StampDir <stamp>
# exit 0 = compliant/goal_reached, 2 = drift

# Persistent manager (preferred — does not die when a subagent exits)
powershell -File scripts/loop-device-events-manager.ps1 -IntervalSeconds 60 -HoldGreenCycles 5 -MaxHours 24
```

**A-DRIFT / manager chat lines**

```text
SPAWNED | A-DRIFT=<id> | stamp=<path>
SPAWNED | MANAGER_LOOP=running | pid=<optional> | stamp=<path>
DRIFT_ALERT | severity=red | item=D1 | next=write_MANIFEST
MANAGER | cycle=N | g1=pass|fail | drift=... | consecGreen=k/H | next=see MANAGER-NEXT-SPAWNS.md
AGENT_DONE | role=A-DRIFT | id=<id> | status=completed | deliverable=06-drift-compliance.md | verdict=compliant|drift
```

**Banned:** Treating a single `AGENT_DONE` as job complete. Job complete only when:

1. G1 table all PASS (and G2 if in scope), **and**
2. Manager `consecutiveGreen >= HoldGreenCycles` **or** `GOAL-HELD.flag` present, **and**
3. Latest A-DRIFT verdict is `compliant` or `goal_reached` (not `drift`).

**A-DRIFT must not** silently fix product bugs itself — it **orders** root to spawn A-FIX-BE / A-FIX-RT / A-VERIFY / A-PROMPT via `MANAGER-NEXT-SPAWNS.md`.

### Heartbeat (every major cycle)

```text
HEARTBEAT | cycle=<N> | checklist=<done>/<total> | g1=<pass|fail> | g2=<pass|fail|n/a> |
  agents=<running|done ids> | last_proof=<path|fail> | watcher_miss_15m=<n> |
  db=<ok|down> | listener=<state> | next=<one action>
```

Minimum **20** heartbeats for multi-surface work or full EXIT GATE — do not self-stop at 5–10 minutes.

---

## 3. Dependency graph (diagnose in this order)

```text
                    ┌─────────────────────────────┐
                    │ Cloudflare Tunnel (protected)│
                    └──────────────┬──────────────┘
                                   │
         ┌─────────────────────────┼─────────────────────────┐
         ▼                         ▼                         ▼
  dev.bnpi-pats.tech         dev-api.bnpi-pats.tech     grafana / logs (if used)
  bnpi-pats-app (K3s DEV)         bnpi-pats-api (K3s DEV :3101)
         │                         │
         │                    ┌────┴────┐
         │                    ▼         ▼
         │              postgres    Socket.IO
         │              ready?      device-event:saved
         │                    │         │
         │                    │    UNION rooms:
         │                    │    org + device
         │                    │
         │         ┌──────────┴──────────┐
         │         ▼                     ▼
         │   systemd listener      bnpi-pats-hikvision-watcher
         │   hikvision-biometric   (DEV only ACS pull)
         │   → POST localhost:3101 → POST bnpi-pats-api:3001
         │         │                     │
         │         └──────────┬──────────┘
         │                    ▼
         │            /api/hikvision/callback
         │                    ▼
         └──────────── DeviceEvent ledger
                              ▼
                    UI /admin/.../devices/events
```

**Restart resilience requirement:**  
If watcher is stopped → started, or API rolled → Ready, G1 must recover without human homework (agent restarts, re-probes, soft-deletes ghosts, redeploys if code missing).

---

## 4. Diagnosis loop (measure before mutate)

### 4.1 Bootstrap (mandatory open order)

1. `AGENTS.md` / `.grok/rules/*` (already loaded — still obey)
2. `.wwg/reports/wwg-agent-handoff.md`
3. `.wwg/workspace/current-task.md`
4. `.wwg/wiki/project-truth-summary.md` (Device Events / listener sections)
5. `docs/00-product/HIKVISION-DEVICE-EVENTS-REALTIME-CONTRACT.md`
6. This job card
7. Latest `.runtime/hikvision-status-full-agents/*` or create new stamp dir

Write **Current-State Report** before edits.

### 4.2 Observability collection (A-OBS)

Run and save under `.runtime/device-events-allgreen-<stamp>/`:

```powershell
# Public health
@('https://dev-api.bnpi-pats.tech/health','https://api.bnpi-pats.tech/health','https://uat-api.bnpi-pats.tech/health') |
  ForEach-Object { try { "$_ -> $((Invoke-WebRequest $_ -UseBasicParsing -TimeoutSec 15).StatusCode)" } catch { "$_ -> FAIL" } }

# Auth + live-readiness + events
$loginBody = @{ email='admin@bandai.local'; password='password123'; appCode='bnpi-pats' } | ConvertTo-Json
$login = Invoke-RestMethod -Method Post 'https://dev-api.bnpi-pats.tech/api/auth/login' -ContentType 'application/json' -Body $loginBody
$h = @{ Authorization = "Bearer $($login.data.token)" }
Invoke-RestMethod -Method Get 'https://dev-api.bnpi-pats.tech/api/device/events/live-readiness' -Headers $h |
  ConvertTo-Json -Depth 10 | Set-Content live-readiness.json
# Events list (do not assume Saved N from UI alone)
Invoke-RestMethod -Method Get 'https://dev-api.bnpi-pats.tech/api/device/events?limit=10&sort=receivedAt&order=desc' -Headers $h |
  ConvertTo-Json -Depth 6 | Set-Content events.json
```

```bash
# Via: ssh project-truth-bnpi-pats
kubectl -n dev get pods,deploy,sts -o wide
kubectl -n dev logs deploy/bnpi-pats-api --tail=80
kubectl -n dev logs deploy/bnpi-pats-hikvision-watcher --since=30m | tail -100
systemctl status project-truth-hikvision-hot-reload-listener.service --no-pager -l | head -40
journalctl -u project-truth-hikvision-hot-reload-listener.service --no-pager -n 50
# Ghost / creds
kubectl -n dev exec sts/bnpi-pats-postgres -- psql -U postgres -d bnpi-pats -c \
  "SELECT id,name,address, CASE WHEN access::text IN ('null','{}') THEN 'NO_ACCESS' ELSE 'HAS_ACCESS' END, \"isDeleted\" FROM \"Device\" WHERE name ILIKE '%entrance%' OR address LIKE '10.184.37.%' ORDER BY name;"
# Observability in-VM
curl -sS -m 5 http://127.0.0.1:3110/ready; curl -sS -m 5 http://127.0.0.1:9091/-/ready; curl -sS -m 5 http://127.0.0.1:53000/api/health
```

If Loki ready, query last 24h for:

- `missing access credentials`
- `hikvision_callback_post`
- `acs_alarm_received`
- `pathReady` / live-readiness errors
- `EHOSTUNREACH` / password / NET_DVR

### 4.3 Error classification template (A-CLASS)

Every distinct failure:

| Error ID | Symptom (UI/log) | Root cause (evidence path) | Layer | Class (`code_defect`\|`config`\|`ops`\|`physical_boundary`\|`intentional`) | Recurring? | Fix | Owner | Status |

**Known classes to always re-check (do not assume fixed forever):**

| ID | Symptom | Class | Typical fix |
|---|---|---|---|
| HV-001 | Watcher 400 missing credentials / ghost Main Entrance Device | config | Soft-delete empty-access ghost; deploy skip-guard |
| HV-002 | All-devices UI misses live socket rows | code_defect | UNION emit org+device rooms |
| HV-003 | `callbackPost.pathOk` null / path yellow forever | code_defect | Probe on GET/Prove |
| HV-004 | UI DB down during API rollout | ops | Wait Ready; re-probe; do not thrash restart |
| HV-005 | Armed quiet / ENROLL NO | expected G1 | Not a failure for G1 |
| HV-006 | major=3 Unknown person | wire/product | Do not invent person id |
| HV-007 | PROD/UAT no watcher | intentional | Do not “fix” without product change |
| HV-008 | Host LAN 10.184.37.19 timeout, CF OK | ops | Use CF SSH |
| HV-009 | Watcher soft-fail `\|\| true` hides failures | code_defect | Metrics/probes; skip logging |
| HV-010 | Main C EHOSTUNREACH | physical_boundary | Exclude from green math |
| HV-011 | Saved 0 while history exists | FE/API filter/deploy | Prove API total separately |

---

## 5. Fix loop (mutate only after classify) — **all agent-owned**

### Priority order (root/A-FIX execute; never hand off)

1. **DB / API Ready** — no green without postgres + bnpi-pats-api Ready (agent restarts pods)  
2. **Ghost / watcher spam** — soft-delete NO_ACCESS ghost; ensure skip-guard in image; bounce watcher  
3. **Listener armed** — systemd active; login_failed → credentials/network (3 tries, agent-owned)  
4. **pathOk probe + pathReady** — code + live image SHA; rebuild/import if lag  
5. **Socket union** — unit tests green; live image has helper  
6. **Start manager loop** — `loop-device-events-manager.ps1` always on until GOAL-HELD  
7. **Restart resilience** — bounce watcher (+ optional API); re-prove G1  
8. **UI settle** — Playwright login/auth fix if G1.8 open (agent-owned)  
9. **G2 tap** — physical only if in scope; do not invent attendance  
10. **Commit/push develop** when code changed and tests pass  

### Graph engineering loop (agent-owned continuous)

```text
[manager loop always running]
    │
    ├─► probe G1 (API) + drift script every interval
    ├─► write MANAGER-NEXT-SPAWNS.md
    │
    ▼
[root reads NEXT-SPAWNS — no human]
    │
    ├─► spawn A-FIX-BE for code_defect
    ├─► spawn A-FIX-RT for ops/runtime
    ├─► spawn A-VERIFY for prove/Playwright/bounce
    ├─► spawn A-DRIFT every cycle until goal held
    │
    ▼
[implement → test → commit/push → roll image if needed]
    │
    ▼
[re-probe until HoldGreenCycles — only then stop]
```

### Restart resilience script (must pass)

```text
1. Record G1 baseline green
2. kubectl -n dev rollout restart deploy/bnpi-pats-hikvision-watcher
3. Wait Ready
4. Re-check watcher_miss_15m == 0 and G1 still green
5. Optional: rollout restart deploy/bnpi-pats-api → wait Ready 60–120s → re-check G1
   (Expect brief red during restart; permanent red after Ready = fail)
```

### Code touchpoints (verify, do not rewrite blindly)

| Concern | Path |
|---|---|
| pathReady / G1 overall | `bnpi-pats-api/helper/device-live-readiness.helper.ts` |
| pathOk probe | `bnpi-pats-api/app/device/device.controller.ts` (`probeHikvisionCallbackPostPath`) |
| Socket UNION | `bnpi-pats-api/helper/device-event-realtime.helper.ts` |
| Watcher skip no-creds | `bnpi-pats-api/scripts/audit-hikvision-device-events.ts` |
| FE join All devices | `bnpi-pats-app/app/routes/admin/devices/events.tsx` |
| Monitor | `scripts/monitor-hikvision-device-events-health.ps1` |
| Contract | `docs/00-product/HIKVISION-DEVICE-EVENTS-REALTIME-CONTRACT.md` |

If live API lacks `pathReady` field → **image lag**: rebuild/import `bnpi-pats-api-local:develop` from ansible-pull HEAD and roll DEV deploy (document SHA).

---

## 6. Verification (A-VERIFY)

1. API live-readiness JSON saved under stamp dir  
2. Prove endpoint: `POST .../live-readiness/prove`  
3. Playwright (headless preferred on Windows):

```text
Login → /admin/configuration/devices/events?view=saved
→ wait strip settle (not "Checking..." forever)
→ assert not permanent DB-down after Ready
→ Keep ready ON; TAP YES for G1
→ optional: socket inject if DEV hooks present
```

4. Restart bounce (section 5)  
5. Unit tests if code changed:

```powershell
cd bnpi-pats-api
npm.cmd test -- --grep "device-live-readiness helper"
npm.cmd test -- --grep "device event realtime helper"
```

---

## 7. Continuous monitoring

```powershell
powershell -File scripts/monitor-hikvision-device-events-health.ps1 -IntervalSeconds 60
```

Or agent-internal loop writing `.runtime/hikvision-health-monitor/health-YYYYMMDD.md`.

**Fail closed in monitor:**

- watcher_miss_5m > 0  
- listener not active  
- public health fail  
- ghost isDeleted=false  

---

## 8. Multi-agent coordination protocol

```text
Root cycle N:
  1. Cycle 1: MUST spawn A-OBS + A-CLASS + A-MON in parallel; write MANIFEST;
     print SPAWNED chat line (or ROOT_FALLBACK if tools unavailable)
  2. On open defects → spawn A-FIX-BE and/or A-FIX-RT (write/execute); print SPAWNED
  3. Spawn A-VERIFY; print SPAWNED
  4. Keep A-MON running; print AGENT_DONE when each role finishes
  5. Missing deliverable → re-spawn once → else ROOT_FALLBACK file + AGENT_DONE
  6. Merge into 00-ROOT-STATUS.md table:
       | Item | Before | Now | Green? | Evidence | Next |
  7. If G1 incomplete and not real-stop → next cycle
  8. If G1 green and G2 in scope incomplete → physical tap path only
  9. Commit/push when code green
```

**Conflict rule:** if UI red and API green → capture both; prefer API+pod Ready timestamps; hard-refresh path is agent-owned (Playwright), not homework for human.

**Visibility rule:** every spawn and completion must be visible as `SPAWNED` / `AGENT_DONE` in chat **and** in `MULTI-AGENT-MANIFEST.json` — tool-only background work without those lines is a protocol fail.

---

## 9. Explicit non-goals

- Do not invent biometric bytes or person ids  
- Do not require continuous receiving for G1  
- Do not add PROD watcher without product change  
- Do not thrash listener restart when armed+quiet (no forceReArm by default)  
- Do not treat Main C offline as code defect without reachability proof  

---

## 10. Deliverables before “done”

| File | Content |
|---|---|
| `.runtime/device-events-allgreen-<stamp>/MULTI-AGENT-MANIFEST.json` | Spawn roster, ids, status, tool_unavailable / ROOT_FALLBACK if any |
| `.runtime/device-events-allgreen-<stamp>/00-ROOT-STATUS.md` | Done/open table + agent roster |
| `01-obs.md` + JSON probes | Raw measurements (child or ROOT_FALLBACK) |
| `02-error-classification.md` | Full bucket table (child or ROOT_FALLBACK) |
| `03-runtime-actions.md` | What was bounced/deleted/rebuilt |
| `04-verify.md` | API + Playwright + restart bounce |
| `05-monitor.md` | Heartbeat path + last GREEN (child or ROOT_FALLBACK) |
| Chat transcript | SPAWNED + AGENT_DONE lines for every role |
| Git | commit/push `develop` if code changed |

---

## 11. One-line mission

**Diagnose with observability, classify without assumption, fix every recurring agent-owned defect, prove G1 after cold start and after intentional watcher/API restart, keep monitoring until green sticks — then stop.**
