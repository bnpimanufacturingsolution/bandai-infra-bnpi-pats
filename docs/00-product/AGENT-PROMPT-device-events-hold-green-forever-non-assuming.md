# Device Events — Hold Green Forever (non-assuming, multi-agent)

**Mode:** agent-owned · evidence-over-assumption · no human homework  
**Paste to root Grok/Claude** when continuing after pool-starvation repair.

---

## What is true NOW (re-prove every cycle; do not trust memory)

| Claim | Expected after pool fix | Re-prove how |
|---|---|---|
| Red “DB down / Keep ready repairing” | **Mostly fixed** — was Prisma pool limit 9, not Postgres dead | Loki: zero `connection limit: 9` timeouts last 15m; API live-readiness `database.ok=true` |
| UI strip | **Yellow OK**: “Ready for tap proof · DB ok · Live armed · proof aging” | Playwright/screenshot or live-readiness JSON |
| Ledger loads | **Yes** — ~37k saved rows | GET `/api/device/events` 200 |
| Always full green TAP+ENROLL | **No** until G2 fresh proof | `proof.fresh` / last ACS age < 10m |
| Empty log = broken listener | **False** when armed-quiet | listener systemd active + last ACS time |
| Stack | Grafana `:53000` Loki `:3110` Prom `:9091` Tempo `:3202` on VM | `ssh project-truth-bnpi-pats` → curl localhost |

**Root cause that caused “not always green”:**

```text
UI poll every 2s + GET /device/events = 10 parallel SQL
→ Prisma pool limit ~9
→ pool timeout 500s
→ UI maps to “Database connection failed / Keep ready repairing”
→ Keep ready thrash ≠ real DB down
```

**Shipped on `develop` (re-check SHAs live):**

| Commit | What |
|---|---|
| `458eb89` | API `summaryScope=page` / facets-only aggregates; pool defaults; DEV gitops `connection_limit=30`; UI 8s poll + page scope |
| `e20529a` | TS fix: single `total` key in `savedSummary` |

Live image must show `PROJECT_TRUTH_BUILD_SHA` ≥ `458eb89` and `DATABASE_URL` containing `connection_limit=30`.

---

## Finish line (G1 hold forever + G2 honest)

### G1 — infrastructure green (must hold forever)

- [ ] `live-readiness.pathReady === true`
- [ ] `database.ok === true` latency < 100ms typical
- [ ] `listener.armed === true` (or receiving)
- [ ] `callbackPost.pathOk === true`
- [ ] **Zero** `Timed out fetching a new connection` in last 30m Loki/API logs
- [ ] GET events (page or full) **200** not 500 under normal open of Device Events
- [ ] UI **not** red “DB down”
- [ ] Image SHA on DEV includes pool + summaryScope code
- [ ] GitOps DATABASE_URL durable (not only one-shot kubectl env)

### G2 — live receiving / enroll green (honest; needs real taps)

- [ ] Fresh major-5 (or proven ACS) within proof window → TAP YES · ENROLL YES
- [ ] Socket delivers row without inventing person id
- [ ] Unknown-person rows classified (opaque vs empty vs plain) — no fake employeeNo

### Residual (do not collapse)

| Residual | Class | Owner |
|---|---|---|
| Events list 10–45s slow | `code_defect` query plan / indexes | BUGFIX agent |
| proof aging / ENROLL NO while armed | `physical_boundary` or quiet armed | A-MON honesty only until real tap |
| 3 offline devices in health chip | reachability separate from listener | A-HEALTH |
| Main C EHOSTUNREACH | physical_boundary | do not block G1 |
| Unknown person / no person id on ACS | wire truth (major 3 empty often) | classify, not invent |

---

## Multi-agent roster (spawn every cycle; MANIFEST)

| ID | Role | Job | Done when |
|---|---|---|---|
| **A-ROOT** | manager | this checklist; spawn; HEARTBEAT; hold 5 green cycles | G1 held ×5 + open residuals tracked |
| **A-MON** | monitor | every 60–120s: health, live-readiness, pool errors, page latency | stamp + HEARTBEAT |
| **A-OBS** | observability | Loki/Prom via SSH (not host LAN timeout): pool, events 500, callback | FINDINGS table |
| **A-DEPLOY** | gitops/K3s | ansible-pull SHA, image-state, DATABASE_URL, roll | SHA ≥ e20529a when app needed |
| **A-BUG** | code defect | slow `page_events`, fan-out, false DB copy | PR/push + re-prove |
| **A-UI** | Playwright | Device Events strip not red; Keep ready quiet; ledger rows | screenshot + network |
| **A-DRIFT** | prompt compliance | re-read this file; refuse “done” without evidence | A-DRIFT PASS |

Chat lines required:

```text
SPAWNED | id=A-MON | ...
HEARTBEAT | cycle=N | G1=x/y | last_proof=path | next=...
AGENT_DONE | id=A-BUG | evidence=...
```

---

## Ordered non-assuming steps (every cycle)

1. **Bootstrap** — open WWG handoff + this prompt + last `.runtime/device-events-*` stamp. Write Current-State Report.
2. **Live API** — login `admin@bandai.local` / `password123` / `appCode=bnpi-pats` →  
   - GET `/health`  
   - GET `/api/device/events/live-readiness`  
   - GET `/api/device/events?summaryScope=page&limit=5` (time ms)  
   Save JSON under `.runtime/device-events-hold-YYYYMMDD-HHMMSS/`.
3. **SSH K3s** (`ssh project-truth-bnpi-pats`):  
   - image-state, ansible-pull-state, pod Ready  
   - `PROJECT_TRUTH_BUILD_SHA`, `DATABASE_URL` has `connection_limit=30`  
   - grep pool timeouts last 15m  
   - listener `systemctl is-active …hikvision…listener`
4. **Loki (via SSH localhost:3110)** — count `connection pool` last 30m. If >0 → A-BUG + A-DEPLOY.
5. **Classify UI color** (non-assuming):  
   | UI | Means | Action |
   |---|---|---|
   | Red DB down | pool or true DB | logs first |
   | Yellow proof aging | G1 ok, G2 quiet | do **not** restart listener |
   | Green TAP+ENROLL | full path | hold |
6. **If code gap** — fix → test → commit → push `develop` → ansible-pull / wait image-state → re-prove. Agent owns push.
7. **Hold gate** — 5 consecutive green G1 samples ≥2m apart → `GOAL-HELD`. Continue A-MON forever (or until user stops).
8. **Never** invent: device counts, person ids on major-3, “always green ENROLL” without fresh proof.

---

## Banned exits

- “Hard-refresh and check”
- “Restart API yourself”
- “Probably network”
- Declaring forever-green without 5 hold samples + zero pool errors

## Real stop only

3 distinct recovery failures with evidence · irreversible data risk · missing irrecoverable access · would invent secrets/evidence.

---

## Operator one-liner (for you)

Paste:

> Execute `docs/00-product/AGENT-PROMPT-device-events-hold-green-forever-non-assuming.md` as ROOT. Agent-owned. Multi-agent MANIFEST. Push develop. Watch K3s SSH. Hold G1 forever; classify G2 honestly. No assumptions.
