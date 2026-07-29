# Agent job card — Device Events multi-agent all-green (non-assuming)

**Mode:** execution · owner-operator · non-stop until EXIT GATE  
**Primary UI:** `https://dev.bnpi-hris.tech/admin/configuration/devices/events?view=saved`  
**Primary API:** `https://dev-api.bnpi-hris.tech`  
**Actor:** `admin@bandai.local` / `password123` / `appCode='hris'` (hris-admin)

Paste into a high-budget agent (`--max-turns` high enough for multi-hour work).  
**Do not invent.** Every claim needs opened WWG/code/runtime/API/SSH/log evidence or label `NEEDS_CONFIRMATION` / `CONFLICTING` / `STALE`.

---

## 0. Non-assuming rules (hard)

1. **Screenshot ≠ truth.** Red strip during Keep ready repairing / API restart is **startup lag** until re-proved after pods `Ready`.
2. **Health 200 ≠ Device Events green.** Always call live-readiness + events list + listener/watcher logs.
3. **Armed quiet ≠ broken.** G1 path green does **not** require a tap. G2 live green **does**.
4. **Empty person on major=3** is wire truth until multipass proven — not automatic “listener dead”.
5. **Never disable** `cloudflared-bnpi-hris.service`.
6. **Never soft-delete** devices that still have credentials without evidence they are ghosts.
7. Prefer **direct API evidence first**, then browser/Playwright.
8. Prefer **LAN/VM SSH** when routable; `ssh project-truth-hris` is OK when LAN times out (documented host drift).

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
- Spawn agents in parallel; never wait idle on one blocked path.
- Resolve `CONFLICTING` evidence yourself (do not pick the convenient side).

### Spawn these agents (parallel when possible)

| Agent | Type | Job | Deliverable |
|---|---|---|---|
| **A-OBS** | explore/execute | Collect health, live-readiness, pod status, systemd, watcher/API/listener logs, Loki/Grafana if up | `.runtime/device-events-allgreen-<stamp>/01-obs.md` + JSON |
| **A-CLASS** | explore | Classify every distinct error (bucket table: class, layer, recurring, fix) | `02-error-classification.md` |
| **A-FIX-BE** | general-purpose | Code/config fixes: socket union, readiness pathOk, watcher skip no-creds, ghost soft-delete SQL | PR-ready code + tests |
| **A-FIX-RT** | general-purpose | Runtime: restart units safely, roll pods, rebuild/import image if SHA stale | `03-runtime-actions.md` |
| **A-VERIFY** | general-purpose | API prove + Playwright Device Events + restart bounce test | `04-verify.md` + screenshots |
| **A-MON** | general-purpose | Start/keep `scripts/monitor-hikvision-device-events-health.ps1` or equivalent loop; min 10 green cycles | `05-monitor.md` |

Root synthesizes `00-ROOT-STATUS.md` each cycle.

### Heartbeat (every major cycle)

```text
HEARTBEAT | cycle=<N> | checklist=<done>/<total> | g1=<pass|fail> | g2=<pass|fail|n/a> |
  last_proof=<path|fail> | watcher_miss_15m=<n> | db=<ok|down> | listener=<state> | next=<one action>
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
  dev.bnpi-hris.tech         dev-api.bnpi-hris.tech     grafana / logs (if used)
  hris-app (K3s DEV)         hris-api (K3s DEV :3101)
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
         │   systemd listener      hris-hikvision-watcher
         │   hikvision-biometric   (DEV only ACS pull)
         │   → POST localhost:3101 → POST hris-api:3001
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
@('https://dev-api.bnpi-hris.tech/health','https://api.bnpi-hris.tech/health','https://uat-api.bnpi-hris.tech/health') |
  ForEach-Object { try { "$_ -> $((Invoke-WebRequest $_ -UseBasicParsing -TimeoutSec 15).StatusCode)" } catch { "$_ -> FAIL" } }

# Auth + live-readiness + events
$loginBody = @{ email='admin@bandai.local'; password='password123'; appCode='hris' } | ConvertTo-Json
$login = Invoke-RestMethod -Method Post 'https://dev-api.bnpi-hris.tech/api/auth/login' -ContentType 'application/json' -Body $loginBody
$h = @{ Authorization = "Bearer $($login.data.token)" }
Invoke-RestMethod -Method Get 'https://dev-api.bnpi-hris.tech/api/device/events/live-readiness' -Headers $h |
  ConvertTo-Json -Depth 10 | Set-Content live-readiness.json
# Events list (do not assume Saved N from UI alone)
Invoke-RestMethod -Method Get 'https://dev-api.bnpi-hris.tech/api/device/events?limit=10&sort=receivedAt&order=desc' -Headers $h |
  ConvertTo-Json -Depth 6 | Set-Content events.json
```

```bash
# Via: ssh project-truth-hris
kubectl -n dev get pods,deploy,sts -o wide
kubectl -n dev logs deploy/hris-api --tail=80
kubectl -n dev logs deploy/hris-hikvision-watcher --since=30m | tail -100
systemctl status project-truth-hikvision-hot-reload-listener.service --no-pager -l | head -40
journalctl -u project-truth-hikvision-hot-reload-listener.service --no-pager -n 50
# Ghost / creds
kubectl -n dev exec sts/hris-postgres -- psql -U postgres -d hris -c \
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

## 5. Fix loop (mutate only after classify)

### Priority order

1. **DB / API Ready** — no green without postgres + hris-api Ready  
2. **Ghost / watcher spam** — stop 400 loops (soft-delete + skip code deployed)  
3. **Listener armed** — systemd active; login_failed → credentials/network (3 tries)  
4. **pathOk probe + pathReady** — code present **and** running image SHA contains it  
5. **Socket union** — unit tests green; live image has helper  
6. **Restart resilience** — bounce watcher; re-check G1  
7. **G2 tap** — only if task requires realtime receiving green  
8. **Commit/push develop** when code changed and tests pass  

### Restart resilience script (must pass)

```text
1. Record G1 baseline green
2. kubectl -n dev rollout restart deploy/hris-hikvision-watcher
3. Wait Ready
4. Re-check watcher_miss_15m == 0 and G1 still green
5. Optional: rollout restart deploy/hris-api → wait Ready 60–120s → re-check G1
   (Expect brief red during restart; permanent red after Ready = fail)
```

### Code touchpoints (verify, do not rewrite blindly)

| Concern | Path |
|---|---|
| pathReady / G1 overall | `hris-api/helper/device-live-readiness.helper.ts` |
| pathOk probe | `hris-api/app/device/device.controller.ts` (`probeHikvisionCallbackPostPath`) |
| Socket UNION | `hris-api/helper/device-event-realtime.helper.ts` |
| Watcher skip no-creds | `hris-api/scripts/audit-hikvision-device-events.ts` |
| FE join All devices | `hris-app/app/routes/admin/devices/events.tsx` |
| Monitor | `scripts/monitor-hikvision-device-events-health.ps1` |
| Contract | `docs/00-product/HIKVISION-DEVICE-EVENTS-REALTIME-CONTRACT.md` |

If live API lacks `pathReady` field → **image lag**: rebuild/import `hris-api-local:develop` from ansible-pull HEAD and roll DEV deploy (document SHA).

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
cd hris-api
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
  1. Spawn A-OBS + A-CLASS (read)
  2. On open defects → spawn A-FIX-BE and/or A-FIX-RT (write/execute)
  3. Spawn A-VERIFY
  4. Keep A-MON running
  5. Merge into 00-ROOT-STATUS.md table:
       | Item | Before | Now | Green? | Evidence | Next |
  6. If G1 incomplete and not real-stop → next cycle
  7. If G1 green and G2 in scope incomplete → physical tap path only
  8. Commit/push when code green
```

**Conflict rule:** if UI red and API green → capture both; prefer API+pod Ready timestamps; hard-refresh path is agent-owned (Playwright), not homework for human.

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
| `.runtime/device-events-allgreen-<stamp>/00-ROOT-STATUS.md` | Done/open table |
| `01-obs.md` + JSON probes | Raw measurements |
| `02-error-classification.md` | Full bucket table |
| `03-runtime-actions.md` | What was bounced/deleted/rebuilt |
| `04-verify.md` | API + Playwright + restart bounce |
| `05-monitor.md` | Heartbeat path + last GREEN |
| Git | commit/push `develop` if code changed |

---

## 11. One-line mission

**Diagnose with observability, classify without assumption, fix every recurring agent-owned defect, prove G1 after cold start and after intentional watcher/API restart, keep monitoring until green sticks — then stop.**
