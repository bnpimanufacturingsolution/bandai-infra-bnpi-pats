# Agent prompt — Device Events DEV all-green (graph + loop engineering)

**Paste this into a high max-turns agent session.** Own DEV Device Events until acceptance is green or a Real Stop Condition is hit. Use observability (API, SSH, Loki/Grafana when up), not screenshots alone.

## Product goal

```text
https://dev.bnpi-hris.tech/admin/configuration/devices/events?view=saved
```

On **startup and continuously**:

| Tier | Meaning | Target |
|---|---|---|
| **G1 path green** | DB up + listener armed/running + callback path open + TAP YES | **Always when services are up** (no human tap required) |
| **G2 live green** | G1 + receiving + fresh post + ENROLL YES | After a real major-5 tap (or documented synthetic prove) |
| **No error spam** | Watcher not 400-looping; ghost devices soft-deleted; socket All-devices works | Continuous |

**Screenshot trap:** Red strip `DB down` + `Keep ready ON · repairing` during API rollout is **startup lag**, not permanent truth. Re-probe API after pods Ready before declaring red.

---

## Ordered graph (do not skip)

```text
A. Bootstrap truth
   AGENTS.md → WWG handoff/current-task → this prompt → runtime evidence
   →
B. Public + in-VM health matrix
   dev-api/health, api/health, uat-api/health
   ssh project-truth-hris: kubectl -n dev get pods; postgres SELECT 1; listener is-active
   →
C. Auth + live-readiness (same role as UI: hris-admin)
   POST /api/auth/login (admin@bandai.local / password123 / appCode=hris)
   GET  /api/device/events/live-readiness
   Capture: overall, pathReady, database.ok, listener.*, callbackPost.pathOk,
            safeToTap, safeToEnroll, headline
   →
D. Classify against known errors (fix only agent-owned)
   HV-001 ghost NO_ACCESS → soft-delete isDeleted=true
   HV-002 socket intersection → union emit (device-event-realtime.helper)
   HV-003 pathOk null → probe wired on GET/Prove
   HV-004 watcher 400 spam → skip no-creds + soft-delete ghost
   HV-005 API mid-rollout DB red → wait Ready, re-probe (not invent)
   HV-006 Saved 0 with history → check filters/query/org; not clear DB
   →
E. Repair recoverables (loop)
   pod not Ready → rollout status / restart only failed scope
   postgres down → recover STS (3 distinct tries)
   listener inactive → systemctl start/status (no Cloudflare kill)
   ghost active → soft-delete empty access Main Entrance Device
   image missing pathReady → rebuild/import hris-api-local:develop at ansible-pull HEAD
   →
F. Prove
   POST /api/device/events/live-readiness/prove
   GET  /api/device/events?limit=5
   Playwright: login → Device Events → strip not DB-down; Keep ready path green
   →
G. Observability
   Loki/Grafana if reachable (LAN or CF); else journalctl + kubectl logs
   watcher: zero "missing access credentials" in last 15m
   listener: unit active; last post age is proof not "broken" if armed quiet
   →
H. Continuous monitor
   scripts/monitor-hikvision-device-events-health.ps1 -IntervalSeconds 60
   or internal HEARTBEAT every cycle until acceptance green
   →
I. Truth-sync + commit/push develop when green
```

---

## Engineering loop (every cycle)

```text
HEARTBEAT | cycle=N | checklist=X/Y | last_proof=<path|fail> | next=<one action>

discover → measure (API first) → classify → repair → re-measure →
Playwright when UI claimed → observe logs → only then green/red
```

**Banned:** stop at one red screenshot; invent DB healthy; disable Cloudflare; declare green from health 200 alone without live-readiness.

**Real stop only:** 3 distinct recovery failures with evidence; irreversible data risk; missing irrecoverable access.

---

## Acceptance checklist (DEV Device Events)

- [ ] `GET https://dev-api.bnpi-hris.tech/health` → 200
- [ ] Login admin works
- [ ] `live-readiness.database.ok === true`
- [ ] `live-readiness.pathReady === true` (after deploy of pathReady code)
- [ ] `live-readiness.listener.running && armed === true`
- [ ] `live-readiness.callbackPost.pathOk === true` (not null forever)
- [ ] `safeToTap === true`
- [ ] UI strip **not** `DB down` / not permanent red after settle (30–60s post-rollout)
- [ ] Watcher: `missing access credentials` count last 15m = 0
- [ ] Ghost `cmry9tvve000gnr3oqo2zhzgw` `isDeleted=true` on DEV (and UAT/PROD if present)
- [ ] `GET /api/device/events` returns ledger rows (or honest empty with filter proof)
- [ ] Heartbeat monitor running or at least 10 green cycles recorded
- [ ] Optional G2: one physical major-5 tap → receiving + person id (not required for G1)

---

## Canonical probes (PowerShell)

```powershell
$loginBody = @{ email='admin@bandai.local'; password='password123'; appCode='hris' } | ConvertTo-Json
$login = Invoke-RestMethod -Method Post 'https://dev-api.bnpi-hris.tech/api/auth/login' -ContentType 'application/json' -Body $loginBody
$h = @{ Authorization = "Bearer $($login.data.token)" }
Invoke-RestMethod -Method Get 'https://dev-api.bnpi-hris.tech/api/device/events/live-readiness' -Headers $h |
  ConvertTo-Json -Depth 8
```

```powershell
ssh -o BatchMode=yes -o ConnectTimeout=30 project-truth-hris @"
kubectl -n dev get pods
systemctl is-active project-truth-hikvision-hot-reload-listener.service
kubectl -n dev logs deploy/hris-hikvision-watcher --since=15m | grep -c 'missing access credentials' || true
"@
```

```powershell
powershell -File scripts/monitor-hikvision-device-events-health.ps1 -IntervalSeconds 60
```

---

## Graph of runtime dependencies

```text
Browser https://dev.bnpi-hris.tech
  → Cloudflare Tunnel (must stay ON)
  → K3s DEV hris-app :3100
  → K3s DEV hris-api :3101  ← Socket.IO + /api/device/events/*
       ← postgres hris-postgres:5432
       ← systemd hikvision-biometric-service
            → POST http://localhost:3101/api/hikvision/callback
       ← hris-hikvision-watcher (ACS pull gap-fill only)
            → POST http://hris-api:3001/api/hikvision/callback
```

**G1 green** = app/api/postgres/listener armed + callback probe OK.  
**G2 green** = G1 + fresh ACS receive/post.  
**Saved ledger** independent of listener (rows can exist while quiet).

---

## Related contracts / code

- `docs/00-product/HIKVISION-DEVICE-EVENTS-REALTIME-CONTRACT.md`
- `hris-api/helper/device-live-readiness.helper.ts` (`pathReady`, `liveReceiving`)
- `hris-api/helper/device-event-realtime.helper.ts` (socket UNION emit)
- `hris-api/scripts/audit-hikvision-device-events.ts` (skip no-creds)
- `scripts/monitor-hikvision-device-events-health.ps1`

---

## Exit gate

Do not stop until G1 checklist is green with evidence under `.runtime/`, or Real Stop Condition with 3 failed recoveries. Prefer commit/push `develop` when code changed and tests pass.
