# Overnight multi-agent job — LAN DNS + reverse proxy (`*.bnpi-pats.lan`)

**File:** `docs/00-product/AGENT-PROMPT-lan-dns-reverse-proxy-bnpi-pats-lan.md`  
**Purpose:** Ordered agentic graph + continuous loop so operators open clean LAN hostnames (no `:3100` ports) via **local DNS + reverse proxy on the Project Truth VM**, without buying a public domain and **without touching/disabling Cloudflare**.  
**Law:** `AGENTS.md` + residual honesty + table-first reports + evidence-over-assumption.

---

## Operator setup

| Setting | Value |
|---|---|
| Repo | `C:\Users\stari\bandai-infra` |
| Branch | `develop` |
| Runtime VM | `10.184.37.19` (`project-truth-node`) |
| SSH | `ssh project-truth-bnpi-pats` or key to `infra@10.184.37.19` |
| Permissions | always-approve / `--permission-mode bypassPermissions` |
| Max turns | **`--max-turns 250`** |
| Forbidden | Disable Cloudflare; invent IPs; use `.local` zone; break public `*.bnpi-pats.tech` |

### Headless example

```powershell
cd C:\Users\stari\bandai-infra
grok -p (Get-Content -Raw docs\00-product\AGENT-PROMPT-lan-dns-reverse-proxy-bnpi-pats-lan.md) `
  --max-turns 250 `
  --permission-mode bypassPermissions
```

### CONTINUE

```text
CONTINUE LAN DNS + REVERSE PROXY LOOP.
Open docs/00-product/AGENT-PROMPT-lan-dns-reverse-proxy-bnpi-pats-lan.md.
Resume incomplete EXIT GATE. Spawn A-LOOP if missing.
Next = HEARTBEAT + tool call. No idle end.
```

---

## PASTE BLOCK

```text
================================================================
ROOT JOB CARD — LAN DNS + REVERSE PROXY (bnpi-pats.lan)
================================================================
You are ROOT for Project Truth. Not a chat summarizer.
Repo = C:\Users\stari\bandai-infra. Branch = develop.
Law = AGENTS.md + this card.

OPERATOR INTENT:
1. LAN operators open clean names without ports, e.g. http://dev.bnpi-pats.lan
2. No purchased domain required — local DNS only.
3. Prefer zone .lan or .home.arpa — NEVER create a custom .local zone (mDNS conflict).
4. Reverse proxy on the appliance VM routes hostname → existing DEV/UAT/PROD ports.
5. Public Cloudflare *.bnpi-pats.tech stays active and unchanged unless additive SAN/CORS.
6. Recover all recoverable: packages, services, firewall, CORS, GitOps, Windows host DNS client.
7. Graph + loop engineering: multi-agents + A-LOOP overnight monitor. Evidence under .runtime/.

================================================================
0. BOOTSTRAP (mandatory)
================================================================
Open with tools:
  .wwg/reports/wwg-agent-handoff.md
  .wwg/workspace/current-task.md
  .wwg/wiki/project-truth-summary.md
  cloudflared-bnpi-pats.yml (port map truth)
  gitops/runtime-k8s overlays for published ports
  this job card
Write Current-State Report, then spawn graph.

Stamp:
  $stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
  .runtime/lan-dns-proxy-$stamp/
  Write path to .runtime/current-lan-dns-proxy-dir.txt

Hard ban inventing LAN IPs. Re-prove VM IP live (expect 10.184.37.19 from Project Truth).

================================================================
1. EXIT GATE (all required)
================================================================
| # | Check | Evidence |
|---|---|---|
| G1 | Zone chosen (.lan or .home.arpa) documented; not .local | STATUS.md |
| G2 | dnsmasq (or CoreDNS) installed on VM, enabled, active | systemctl + dig |
| G3 | A records for prod/dev/uat (+ api/emp/grafana as scoped) → VM IP | dig @VM_IP |
| G4 | Reverse proxy (Caddy preferred) listens :80 (and :443 if TLS chosen) | ss/curl |
| G5 | Host routing works: curl -H Host:dev.bnpi-pats.lan http://VM_IP/ → DEV app | status 200 |
| G6 | API path works: curl -H Host:dev.bnpi-pats.lan http://VM_IP/api/health or paired api host | 200 |
| G7 | CORS / app API base accepts new LAN origins OR same-origin /api proxy | login proof |
| G8 | Windows host can resolve (DHCP DNS or hosts fallback) | nslookup/ping |
| G9 | Cloudflare tunnel still active; public *.tech still healthy | systemctl + health |
| G10 | Ansible/GitOps or appliance scripts make this repeatable | committed files |
| G11 | HEARTBEATS ≥ 20 OR full green; STATUS.md + handoff | stamp |

Hard bans:
- Disable/stop/mask cloudflared-bnpi-pats
- Break existing NodePort/LAN :3100/:3101 direct access
- Use .local as the private zone
- Claim green from dig alone without HTTP proof
- Invent router DHCP change if no access — use hosts fallback + document

================================================================
2. FROZEN SCOPE — Project Truth port map (re-prove live)
================================================================
Canonical VM IP seed (re-verify):
  10.184.37.19

Published origins (from cloudflared-bnpi-pats.yml truth — re-probe):
| Host role | LAN origin today | Proxy hostname target |
|---|---|---|
| PROD app | 10.184.37.19:3000 | prod.bnpi-pats.lan OR app.bnpi-pats.lan |
| PROD api | 10.184.37.19:3001 | api.bnpi-pats.lan OR path /api on prod |
| DEV app | 10.184.37.19:3100 | dev.bnpi-pats.lan |
| DEV api | 10.184.37.19:3101 | dev-api.bnpi-pats.lan OR /api on dev |
| UAT app | 10.184.37.19:3200 | uat.bnpi-pats.lan |
| UAT api | 10.184.37.19:3201 | uat-api.bnpi-pats.lan OR /api on uat |
| EMP prod | 10.184.37.19:3300 | emp.bnpi-pats.lan (optional phase 2) |
| EMP dev | 10.184.37.19:3310 | dev-emp.bnpi-pats.lan (optional) |
| EMP uat | 10.184.37.19:3320 | uat-emp.bnpi-pats.lan (optional) |
| Grafana | 10.184.37.19:53000 | grafana.bnpi-pats.lan (optional) |

Preferred product shape (match public tunnel mental model):
  http://dev.bnpi-pats.lan        → app :3100
  http://dev-api.bnpi-pats.lan    → api :3101
  http://uat.bnpi-pats.lan        → app :3200
  http://uat-api.bnpi-pats.lan    → api :3201
  http://app.bnpi-pats.lan        → app :3000
  http://api.bnpi-pats.lan        → api :3001

OR same-origin proxy (better for SPA CORS):
  http://dev.bnpi-pats.lan/       → :3100
  http://dev.bnpi-pats.lan/api/*  → :3101
  http://dev.bnpi-pats.lan/socket.io/* → :3101
  (mirror public cloudflared path routing)

Recommend same-origin path routing first (fewer CORS defects).

Zone recommendation (pick one, document):
  bnpi-pats.lan          (simple operator language)
  OR bnpi-pats.home.arpa (RFC 8375 home networks)

================================================================
3. ORDERED AGENTIC GRAPH
================================================================
```
A-ROOT  (orchestrator: gates, spawn, never invent)
  │
  ├─ A-LOOP     ★ continuous monitor 10–15m
  │              HEARTBEAT, restart dead children, refuse idle end
  │
  ├─ A-OBS      live inventory: VM IP, listening ports, existing DNS,
  │              Cloudflare status, K3s NodePorts, firewall
  │
  ├─ A-DESIGN   freeze hostname table + proxy mode (path vs split host)
  │              + DNS zone; write design.md under stamp
  │
  ├─ A-DNS      install/configure dnsmasq (preferred) on VM
  │              address=/dev.bnpi-pats.lan/10.184.37.19 ...
  │              enable, restart, dig proof
  │
  ├─ A-PROXY    install Caddy (preferred) or nginx
  │              reverse_proxy by Host + /api path map
  │              systemd unit, open ufw if needed
  │
  ├─ A-CORS     ensure API CORS / app API base allows LAN hostnames
  │              OR force same-origin /api so no CORS needed
  │              fix code if required → test → commit → push develop
  │              → rebuild/roll DEV API/app if CORS code change
  │
  ├─ A-CLIENT   Windows host resolution path:
  │              A) router DHCP DNS = VM (if operator can change)
  │              B) hosts file fallback on Windows workstation
  │              C) optional Set-DnsClientServerAddress on Wi-Fi
  │              Prove nslookup + browser/curl
  │
  ├─ A-GITOPS   ansible-pull / appliance scripts so rebuild survives reboot
  │              commit configs under repo (ansible/ or appliance/)
  │
  ├─ A-PW       Playwright login to http://dev.bnpi-pats.lan (or hosts path)
  │
  └─ A-TRUTH    STATUS.md + handoff + recommendation-registry
```

EDGES:
  A-OBS before A-DESIGN
  A-DESIGN before A-DNS and A-PROXY
  A-DNS + A-PROXY before A-CLIENT proof
  A-CORS before claiming browser green
  dryRun/config validate before service restart
  A-CODE (inside A-CORS) only with failing evidence
  A-LOOP never kills Cloudflare

Spawn pattern each cycle:
  1) Ensure A-LOOP
  2) A-OBS
  3) A-DESIGN (once frozen)
  4) Parallel A-DNS + A-PROXY after design
  5) A-CORS
  6) A-CLIENT
  7) A-GITOPS + A-PW
  8) A-TRUTH

================================================================
4. PHASE LOOP
================================================================
PHASE 0 — Discover
  ssh project-truth-bnpi-pats
  ip -4 addr; ss -lntp | egrep ':(80|443|3000|3001|3100|3101|3200|3201)\b'
  systemctl is-active cloudflared-bnpi-pats.service
  which dnsmasq caddy nginx 2>/dev/null
  curl -sS -m 5 http://127.0.0.1:3100/ | head
  curl -sS -m 5 http://127.0.0.1:3101/health
  Document CONFLICTING if ports differ from cloudflared map.

PHASE 1 — Design freeze (write stamp/design.md)
  Choose zone, hostname table, proxy mode (path same-origin recommended).
  List CORS impact and Windows client strategy.
  Do not install until design file exists.

PHASE 2 — DNS (dnsmasq)
  apt install dnsmasq
  /etc/dnsmasq.d/bnpi-pats-lan.conf:
    # do not break resolv if VM needs upstream
    # listen-address=10.184.37.19
    # bind-interfaces as needed
    address=/app.bnpi-pats.lan/10.184.37.19
    address=/api.bnpi-pats.lan/10.184.37.19
    address=/dev.bnpi-pats.lan/10.184.37.19
    address=/dev-api.bnpi-pats.lan/10.184.37.19
    address=/uat.bnpi-pats.lan/10.184.37.19
    address=/uat-api.bnpi-pats.lan/10.184.37.19
    # optional emp/grafana
  systemctl enable --now dnsmasq
  dig @10.184.37.19 dev.bnpi-pats.lan +short  → 10.184.37.19

PHASE 3 — Reverse proxy (Caddy example)
  Install caddy; Caddyfile:
    # Same-origin preferred
    http://dev.bnpi-pats.lan {
      handle /api/* { reverse_proxy 127.0.0.1:3101 }
      handle /socket.io/* { reverse_proxy 127.0.0.1:3101 }
      handle { reverse_proxy 127.0.0.1:3100 }
    }
    http://uat.bnpi-pats.lan { ... 3201/3200 }
    http://app.bnpi-pats.lan { ... 3001/3000 }
  Validate: caddy validate
  systemctl enable --now caddy
  curl -sS -H 'Host: dev.bnpi-pats.lan' http://127.0.0.1/ | head
  curl -sS -H 'Host: dev.bnpi-pats.lan' http://127.0.0.1/api/health

PHASE 4 — CORS / SPA API base
  If same-origin path proxy: ensure app uses relative /api on LAN hostnames
    (bnpi-pats-app already has bnpi-pats.tech same-origin logic — extend for .lan).
  If split hosts: add http://dev.bnpi-pats.lan to API CORS allowlist in GitOps/env.
  Prove admin login:
    POST http://dev.bnpi-pats.lan/api/auth/login
    {email,password,appCode:bnpi-pats}
  Capture JSON under stamp.

PHASE 5 — Client resolution
  Preferred: document router DHCP DNS = 10.184.37.19
  Recoverable without router:
    Windows hosts:
      10.184.37.19 dev.bnpi-pats.lan
      10.184.37.19 dev-api.bnpi-pats.lan
      ...
    Or Set-DnsClientServerAddress (session) to 10.184.37.19 with care
  Prove from Windows:
    nslookup dev.bnpi-pats.lan 10.184.37.19
    curl http://dev.bnpi-pats.lan/api/health

PHASE 6 — GitOps / appliance durability
  Check in:
    ansible templates or appliance/etc snippets for dnsmasq + Caddy
    scripts/ensure-lan-dns-proxy.sh or project-truth.ps1 targets
  Reboot-safe: enabled systemd units
  Document recovery if dnsmasq steals resolv.conf (common footgun)

PHASE 7 — Proof + heartbeat
  Playwright headless login to LAN hostname
  Screenshots under stamp
  HEARTBEAT every cycle
  STATUS.md + handoff

================================================================
5. RECOVERABLE vs REAL STOP
================================================================
Agent-owned recoveries (do not stop):
  - apt install fails → retry mirror / apt update
  - port 80 busy → identify process; prefer Caddy ownership; do not kill Cloudflare
  - dnsmasq breaks VM outbound DNS → fix resolv / no-resolv + server= upstream
  - CORS login fail → code/env fix + redeploy
  - SSH CF Access flap → retry; use direct LAN SSH if routable
  - Dirty git → focused commit for DNS/proxy only

Real stop only:
  3 distinct recovery failures with evidence
  irreversible data risk without backup
  missing irrecoverable credentials/network
  would invent secrets/evidence

================================================================
6. RESIDUAL HONESTY
================================================================
Never bare “DNS broken”. Use tables:

### Residual: <label> = <N>
| Bucket | Count | What it is | Blocker class | Next |

Blocker classes:
  code_defect | export_gap | apply_path | physical_boundary | optional_product

Examples:
  - router DHCP not agent-writable → physical_boundary / optional_product (hosts fallback)
  - CORS missing .lan → code_defect
  - dnsmasq unit failed → apply_path

================================================================
7. A-LOOP CONTRACT
================================================================
Every 10–15m:
  - read STATUS, dig, curl Host headers, cloudflared active
  - if dnsmasq/caddy dead → restart
  - if A-DNS/A-PROXY dead → respawn
  - HEARTBEAT | cycle=N | zone= | dig_ok= | proxy_ok= | cors_ok= | client_ok= | cf= | next=
Min 20 heartbeats OR full EXIT GATE.

================================================================
8. MULTI-AGENT SPAWN PROMPTS
================================================================
A-LOOP:
  "Monitor stamp <path>. Every 10-15m dig+curl+systemctl. Restart dead DNS/proxy.
   Never disable Cloudflare. HEARTBEAT. Respawn stuck children."

A-OBS:
  "Inventory VM IP, ports 80/443/3000-3201, existing DNS/proxy, Cloudflare.
   Write stamp/obs.json. No invent."

A-DESIGN:
  "Freeze zone + hostname table + same-origin path proxy design.md"

A-DNS:
  "Install dnsmasq, conf, enable, dig proof. Fix resolv footguns."

A-PROXY:
  "Install Caddy, Caddyfile path routing, enable, Host-header curl proof."

A-CORS:
  "Login via LAN hostname. Fix CORS or SPA base if needed. Commit/push/deploy."

A-CLIENT:
  "Windows hosts or DNS client config. Prove nslookup + curl from host."

A-GITOPS:
  "Persist via ansible/appliance scripts; reboot-safe."

A-PW:
  "Playwright login http://dev.bnpi-pats.lan"

A-TRUTH:
  "STATUS + handoff + recommendations Proposed only."

================================================================
9. SUCCESS PICTURE
================================================================
Operator on LAN:

  http://dev.bnpi-pats.lan     → DEV BNPI PATS UI (no :3100)
  http://uat.bnpi-pats.lan     → UAT
  http://app.bnpi-pats.lan     → PROD
  http://dev.bnpi-pats.lan/api/health → 200

Still works:
  http://10.184.37.19:3100 direct
  https://dev.bnpi-pats.tech public tunnel
  cloudflared-bnpi-pats.service active

================================================================
10. START NOW
================================================================
1. Bootstrap + stamp
2. Spawn A-LOOP
3. A-OBS → A-DESIGN
4. A-DNS + A-PROXY
5. A-CORS → A-CLIENT → A-GITOPS → A-PW
6. Loop until EXIT GATE
7. Commit/push green durability configs on develop
First tool call this turn. HEARTBEAT every cycle.
================================================================
```

---

## Quick visual graph

```text
                 ┌─────────────┐
                 │   A-ROOT    │
                 └──────┬──────┘
                        │
         ┌──────────────┼──────────────┐
         ▼              ▼              ▼
    ┌────────┐    ┌────────┐     ┌─────────┐
    │ A-LOOP │    │ A-OBS  │     │ A-TRUTH │
    └────┬───┘    └───┬────┘     └─────────┘
         │            ▼
         │       ┌─────────┐
         │       │ A-DESIGN│ zone + map
         │       └────┬────┘
         │      ┌─────┴─────┐
         │      ▼           ▼
         │ ┌────────┐  ┌─────────┐
         │ │ A-DNS  │  │ A-PROXY │
         │ │dnsmasq │  │ Caddy   │
         │ └───┬────┘  └────┬────┘
         │     └─────┬──────┘
         │           ▼
         │      ┌────────┐
         │      │ A-CORS │ SPA/API
         │      └────┬───┘
         │           ▼
         │      ┌─────────┐
         │      │ A-CLIENT│ hosts/DHCP
         │      └────┬────┘
         │           ▼
         │      ┌────────┐   ┌──────┐
         └─────►│ A-GITOPS│──►│ A-PW │
                └────────┘   └──────┘
```

---

## Related cards

| Card | When |
|---|---|
| This card | **LAN DNS + reverse proxy clean URLs** |
| `AGENT-PROMPT-promote-develop-to-uat-to-prod-app-first-multiagent.md` | promote images after CORS/app changes |
| `AGENT-PROMPT-nonstop-loop-engineering.md` | generic non-stop loop shell |
| `cloudflared-bnpi-pats.yml` | public hostname → port map (mirror for LAN) |

---

## Design defaults (agent should re-prove, not invent)

| Choice | Default | Why |
|---|---|---|
| Zone | `bnpi-pats.lan` | Operator-friendly; avoid `.local` |
| DNS | dnsmasq on VM `10.184.37.19` | Simple static A records |
| Proxy | Caddy path same-origin | Matches public tunnel `/api` pattern; fewer CORS bugs |
| TLS | HTTP first; optional internal CA later | Fast green; TLS is phase 2 |
| Public tunnel | **keep active** | AGENTS.md protected runtime |
| Direct IP:port | keep working | Diagnostic fallback |

---

## Acceptance one-liner

```text
From Windows LAN browser: open http://dev.bnpi-pats.lan → login works → dashboard.
dig @10.184.37.19 dev.bnpi-pats.lan = 10.184.37.19
cloudflared active; https://dev-api.bnpi-pats.tech/health still green.
```
