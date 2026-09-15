# Overnight Local Dev Stack Recovery Loop (Project Truth)

**Saved path:** `docs/00-product/AGENT-PROMPT-overnight-local-dev-stack-recovery.md`
**Evidence root pattern:** `.runtime/overnight-dev-stack-recovery-<stamp>/`
**WWG stamp:** prepend status to `.wwg/workspace/current-task.md` and handoff when green or real-blocked.

## Why this exists (live 2026-07-22 host truth — re-probe every cycle)

Do **not** trust this section as eternal truth. Re-probe every cycle.

Observed failure chain on the Windows host:

1. **Login fails** because local API cannot query Postgres at `127.0.0.1:55435`.
2. **`55435` is not Postgres itself** — it is an SSH local-forward into the VM/K3s DEV Postgres (`10.43.130.9:5432`).
3. Host is often on Wi-Fi `192.168.1.x` with **no route to VM LAN** `10.184.37.19` → direct LAN SSH fails; use `ssh project-truth-bnpi-pats` (Cloudflare Access).
4. **`/health` can be healthy while login 500s** — API process does not require DB at boot (`startup.db_connect.disabled` path). Login hits Prisma → needs live DB forward.
5. **Device health offline** on local API when Hikvision host tunnels (`.20–.25` → `1008x/1044x/1800x`) are down. Host cannot reach device IPs directly.
6. Frontend on `5175` can still return HTTP 200 while API/DB/tunnels are dead → “app loads, login fails”.

Canonical local DEV DB: **K3s DEV forward `127.0.0.1:55435`**. Do not silently switch to compose DEV `10.184.37.19:15433` without explicit `PROJECT_TRUTH_ALLOW_COMPOSE_DEV_DB_FALLBACK=true`.

---

## Ordered recovery loop (mandatory sequence)

Run as a **recoverable cycle**. Each step has proof. If a step fails, try **≥3 distinct recoveries** before marking that step blocked; continue all other unblocked steps.

```text
CYCLE N (repeat until EXIT GATE green or Real Stop Condition)
  0) Bootstrap WWG with tools (never memory)
  1) Snapshot ports + network
  2) DEV DB forward 55435
  3) Local bnpi-pats-api npm run dev (3001)
  4) Admin login proof
  5) Hikvision tunnels .20-.25
  6) Device health API proof
  7) Frontend 5175 + optional Playwright login
  8) Write evidence + HEARTBEAT
  9) Sleep / next cycle (keep DB+API+tunnels alive)
```

### 0) Bootstrap (every cycle start)

Read with tools:

1. `.wwg/reports/wwg-agent-handoff.md`
2. `.wwg/workspace/current-task.md`
3. `.wwg/wiki/project-truth-summary.md` (runtime sections)
4. This file
5. `AGENTS.md` non-stop + real stop conditions

Emit Current-State Report: live ports, STALE/CONFLICTING/NEEDS_CONFIRMATION, finish line for this cycle.

### 1) Snapshot (prove before repair)

```powershell
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$dir = Join-Path '.runtime' "overnight-dev-stack-recovery-$stamp"
New-Item -ItemType Directory -Force -Path $dir | Out-Null
foreach ($p in 3001,5175,55435,10080,10081,10082,10083,10084,10085) {
  $l = Get-NetTCPConnection -LocalPort $p -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($l) { "$p LISTEN pid=$($l.OwningProcess)" } else { "$p CLOSED" }
}
"wifi=$((Get-NetIPAddress -AddressFamily IPv4 | Where-Object InterfaceAlias -match 'Wi-Fi' | Select-Object -First 1).IPAddress)"
"ping19=$(Test-Connection 10.184.37.19 -Count 1 -Quiet -ErrorAction SilentlyContinue)"
try { (Invoke-RestMethod http://localhost:3001/health -TimeoutSec 5).status } catch { "API_DOWN" }
```

Save stdout to `$dir/snapshot.txt`.

### 2) DEV DB forward (`127.0.0.1:55435`)

**Goal:** TCP listen + Postgres wire handshake OK.

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\start-k8s-dev-db-access.ps1
```

Recoveries if fail:

1. Re-run script after killing stale listeners on `55435`.
2. Warm Cloudflare Access: `ssh -o BatchMode=yes -o ConnectTimeout=25 project-truth-bnpi-pats "echo SSH_OK; hostname"` then re-run script.
3. Manual `-N` forward **without** stdio redirect (Windows OpenSSH + cloudflared often dies when redirected):

```powershell
Start-Process ssh -ArgumentList @(
  '-o','BatchMode=yes','-o','ConnectTimeout=25','-o','ExitOnForwardFailure=yes',
  '-o','ServerAliveInterval=20','-o','ServerAliveCountMax=6','-N',
  '-L','127.0.0.1:55435:10.43.130.9:5432','project-truth-bnpi-pats'
) -WindowStyle Hidden
```

4. If LAN route returns: prefer `ssh -i $env:USERPROFILE\.ssh\node-health-appliance_ed25519 infra@10.184.37.19` path (script does this when `:22` open).

**Proof:** Postgres SSLRequest returns a byte (script prints `POSTGRES OK`). Login still needs API.

### 3) Local API (`npm run dev` in `bnpi-pats-api` → `:3001`)

Prefer:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\restart-local-bnpi-pats-api-dev.ps1 -Port 3001 -WaitSeconds 120
```

Or:

```powershell
cd bnpi-pats-api
npm.cmd run dev
```

Recoveries:

1. Free port 3001; kill only this repo’s `run-dev-api-watch` / `index.ts` tree.
2. Confirm `bnpi-pats-api/.env.development.local` has `DATABASE_URL=...@127.0.0.1:55435/...`.
3. Re-run DB step if API log shows `Can't reach database server at 127.0.0.1:55435`.

**Proof:** `GET http://localhost:3001/health` → `status=healthy`.
**Do not stop here** — health alone is not login.

### 4) Admin login proof (DB path)

```powershell
$body = @{ email='admin@bandai.local'; password='password123'; appCode='bnpi-pats' } | ConvertTo-Json
$login = Invoke-RestMethod -Method Post 'http://localhost:3001/api/auth/login' -ContentType 'application/json' -Body $body -TimeoutSec 45
$login | ConvertTo-Json -Depth 6 | Set-Content (Join-Path $dir 'admin-login.json')
# require data.token length > 0
$headers = @{ Authorization = "Bearer $($login.data.token)" }
Invoke-RestMethod -Method Get 'http://localhost:3001/api/auth/me' -Headers $headers -TimeoutSec 30 |
  ConvertTo-Json -Depth 5 | Set-Content (Join-Path $dir 'auth-me.json')
```

If 500 with Prisma “Can't reach database” → return to step 2 (forward died).
If 401 wrong password → mark NEEDS_CONFIRMATION credentials (do not invent).

### 5) Hikvision remote tunnels (Main Entrance A–F `.20–.25`)

Host cannot reach device IPs. Local device health needs:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\start-hikvision-remote-device-tunnel.ps1
# or node path used by restart script:
node bnpi-pats-api/scripts/ensure-hikvision-remote-device-tunnel.cjs
```

Requires working SSH to VM (LAN or `project-truth-bnpi-pats`).
**Proof:** local TCP open on `10080–10085`, `10443–10448`, `18000–18005` (or script proof JSON with TcpOk).

Boundary: **TEST A/B** (`192.168.254.109/.110`) are a **separate reverse-bridge lane**, not this tunnel map.

### 6) Device health API (only after 4+5)

With admin token:

```powershell
# Endpoint shape may require pagination/count flags — use the same path the admin Devices UI uses.
# Capture full JSON; do not invent online counts.
Invoke-RestMethod -Method Get 'http://localhost:3001/api/device?limit=20&page=1&pagination=true' -Headers $headers -TimeoutSec 60 |
  ConvertTo-Json -Depth 8 | Set-Content (Join-Path $dir 'devices.json')
# Prefer dedicated health endpoint if present in code/UI (probe live; do not invent path).
```

Also optional K3s DEV LAN proof when `10.184.37.19` reachable:

```text
http://10.184.37.19:3101/health
```

### 7) Frontend

```powershell
# If 5175 down:
cd bnpi-pats-app
npm.cmd run dev -- --port 5175
# App env must point at local API:
# bnpi-pats-app/.env → VITE_API_BASE_URL=http://localhost:3001/api
```

Optional Playwright login smoke → screenshot under `$dir/browser/`.

### 8) Heartbeat + evidence (every cycle)

```text
HEARTBEAT | cycle=N | checklist=X/Y | db=up|down | api=up|down | login=ok|fail | tunnels=A-F ok/partial/down | next=<one action>
```

Write `$dir/summary.json` with boolean flags and evidence paths.
Update `.wwg/workspace/current-task.md` and `.wwg/reports/wwg-agent-handoff.md` only with **probed** facts.

### 9) Keep-alive policy overnight

- Leave DB SSH `-N` and API watchers running.
- Each cycle: re-probe; if 55435 dead, restart forward **before** blaming login.
- Cloudflare Access timeouts: re-auth via one short `ssh project-truth-bnpi-pats "echo SSH_OK"` then re-open `-N`.
- Never disable `cloudflared-bnpi-pats.service` / host BNPI tunnel for this recovery.

---

## EXIT GATE (done)

All must be green with evidence under `.runtime/overnight-dev-stack-recovery-<stamp>/`:

- [ ] `127.0.0.1:55435` Postgres handshake OK
- [ ] `http://localhost:3001/health` → healthy
- [ ] Admin login `admin@bandai.local` / `password123` / `appCode=bnpi-pats` returns token
- [ ] `/api/auth/me` succeeds
- [ ] App responds on `5175` (or documented active Vite port)
- [ ] Device tunnels: proof file for `.20–.25` (or honest partial with which TcpOk false)
- [ ] Device list/health JSON saved (online/offline per device from **live** response only)
- [ ] WWG current-task + handoff stamped; no invented merge/device sync completion

## Real Stop Conditions

Only after 3 distinct recoveries with evidence per step:

- Cloudflare Access permanently blocks SSH (`context deadline exceeded` / login required and no browser path).
- K3s `dev/bnpi-pats-postgres` not Running on VM (prove via `ssh project-truth-bnpi-pats` kubectl).
- Missing irrecoverable credentials/device hardware for TEST A/B (document boundary; do not block Main A–F).

## Banned claims

- Do not claim “npm run dev works” from frontend 200 alone.
- Do not claim all devices healthy from stale handoff (2026-07-22 afternoon proof is **STALE** until re-probed).
- Do not claim merge/sync complete from this stack recovery.
- Do not invent TEST A/B health.

## Min heartbeats

Overnight: **≥20** heartbeats or full EXIT GATE green. Do not self-stop after one partial restart.
