# Multi-agent job — Fix DEV login HTTP 0 / Cloud Run vs K3s API drift

You are **ROOT**. Operator symptom:

```text
dev.bnpi-hris.tech/auth/login
Login Failed — HTTP 0: Unable to connect to the server

Network tab Request URL:
https://hris-api-dev-161377059311.asia-southeast1.run.app/api/auth/login
```

| | |
|---|---|
| **Repo** | `C:\Users\stari\bandai-infra` |
| **Working runtime** | K3s DEV `http://10.184.37.19:3101` + tunnel `dev.bnpi-hris.tech` / `dev-api.bnpi-hris.tech` |
| **Broken runtime** | Cloud Run `hris-api-dev-*.run.app` → Cloud SQL unreachable |
| **Forbidden** | Disable Cloudflare; invent login success |

---

## 0. Paste kickoff

```text
Execute docs/00-product/AGENT-PROMPT-dev-login-http0-cloud-run-vs-k3s.md as ROOT.
Spawn multi-agents. Prove why browser hits Cloud Run, fix runtime API base so
dev.bnpi-hris.tech uses tunnel/K3s (same-origin /api or dev-api.bnpi-hris.tech),
rebuild/roll DEV hris-app, Playwright login green, never stop Cloudflare.
```

---

## 1. Why it keeps happening (evidence — re-probe)

```text
Browser https://dev.bnpi-hris.tech  (static app — may be tunnel→K3s :3100)
    │
    │  getRuntimeApiBase() defaults to Cloud Run DEV for almost every host
    ▼
https://hris-api-dev-….run.app/api/auth/login
    │  health=200 (process up)
    │  login=500 Prisma Can't reach Cloud SQL socket
    ▼
Browser often surfaces as HTTP 0 / Unable to connect (CORS/network/failed fetch)
```

| Surface | Login |
|---|---|
| Cloud Run API | **500** DB unreachable at `/cloudsql/hris-492904:asia-southeast1:hris-api-dev-pg:5432` |
| LAN K3s `10.184.37.19:3101` | **200** admin login OK |
| Tunnel `dev.bnpi-hris.tech/api/*` | Configured → `10.184.37.19:3101` in `cloudflared-bnpi-hris.yml` |

Code default (drift):

`hris-app/app/lib/runtime-api-base.ts` — `DEV_API_BASE = Cloud Run`;  
any non-localhost host (including `dev.bnpi-hris.tech`) falls through to **Cloud Run**.

---

## 2. EXIT GATE

| # | Check | Evidence |
|---|---|---|
| G1 | Network proof table: Cloud Run login vs LAN login vs tunnel `/api` | `.runtime/dev-login-fix-*/api-proof.json` |
| G2 | `runtime-api-base.ts` maps `*.bnpi-hris.tech` to same-origin or `dev-api`/`uat-api`/`api` hosts — **not** Cloud Run by default | git diff |
| G3 | Built DEV app no longer emits Cloud Run host on login from `dev.bnpi-hris.tech` | network capture / Playwright |
| G4 | Playwright: open login → admin login → leave login page (dashboard or home) | screenshot + report |
| G5 | Cloudflare tunnel still active | systemctl |
| G6 | STATUS.md + HEARTBEATS | stamp |

Optional parallel track (do **not** block G2–G4):

| # | Cloud Run repair | Evidence |
|---|---|---|
| C1 | Cloud SQL instance RUNNABLE | gcloud |
| C2 | Cloud Run attached SQL + SA `cloudsql.client` | gcloud describe |
| C3 | Cloud Run login 200 | curl |

---

## 3. Ordered graph

```text
A-ROOT
  ├─ A-OBS     curl health/login Cloud Run vs LAN vs dev-api.bnpi-hris.tech
  ├─ A-CODE    fix runtime-api-base.ts (+ tests)
  ├─ A-DEPLOY  build/import/roll hris-app (and API only if K3s path needs it)
  ├─ A-PW      Playwright login on https://dev.bnpi-hris.tech (or LAN :3100)
  ├─ A-DRIFT   ensure no hard-coded Cloud Run left for bnpi hosts
  └─ A-TRUTH   STATUS + handoff
```

**Edges:** A-CODE before A-DEPLOY before A-PW. Never claim fixed from LAN alone.

---

## 4. Code fix contract (authoritative)

Update `getRuntimeApiBase()`:

| Host | API base |
|---|---|
| `localhost` / `127.0.0.1` | `http://localhost:3001` |
| `dev.bnpi-hris.tech` | **same origin** `https://dev.bnpi-hris.tech` (tunnel `/api` → 3101) **or** `https://dev-api.bnpi-hris.tech` |
| `uat.bnpi-hris.tech` | same-origin or `https://uat-api.bnpi-hris.tech` |
| `app.bnpi-hris.tech` / `bnpi-hris.tech` | same-origin or `https://api.bnpi-hris.tech` |
| Firebase DEV hosts | Cloud Run DEV (legacy) **or** document explicit env |
| Explicit `VITE_API_BASE_URL` | always wins |

Prefer **same-origin** so cookies/CORS stay simple and tunnel path is used.

---

## 5. Playwright acceptance (after deploy)

```text
1. baseURL = https://dev.bnpi-hris.tech (or http://10.184.37.19:3100 if public TLS blocked)
2. goto /auth/login
3. fill admin@bandai.local / password123 (or site seed)
4. click Sign In
5. expect URL not stuck on /auth/login; no toast "HTTP 0"
6. network: login request host is NOT *.run.app for bnpi-hris.tech
7. screenshot + JSON report under .runtime/
```

If public HTTPS resets from this LAN, use **LAN app URL** with `VITE`/built same-host API via tunnel hostname in hosts file, or Playwright `baseURL=http://10.184.37.19:3100` and assert API base is not Cloud Run when page host is bnpi (unit-test `getRuntimeApiBase` with mocked window).

Unit test (required even if Playwright public blocked):

```ts
// window.location.hostname = 'dev.bnpi-hris.tech'
// expect(getRuntimeApiBase()).not.toContain('run.app')
```

---

## 6. HEARTBEAT

```text
HEARTBEAT | cycle=N | cloudRunLogin=500|0|200 | lanLogin=200|fail | feBase= | next=
```

---

## 7. Operator one-liner

**You keep seeing this because the app is built/defaulted to talk to Cloud Run DEV, whose database is down — not because K3s login is broken.**  
Fix FE API routing to tunnel/K3s for `*.bnpi-hris.tech`, then rebuild DEV app.
