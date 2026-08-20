# On-prem DEV / UAT / PROD port access

One Linux VM owns Project Truth runtime. Cloudflare public hostnames are **that same VM**, not a second cloud app.

| Field | Value |
|---|---|
| VM LAN IP | `10.184.37.19` (secondary `10.184.37.78`) |
| Hostname | `project-truth-node` |
| SSH (LAN, if your PC routes there) | `ssh -i %USERPROFILE%\.ssh\node-health-appliance_ed25519 infra@10.184.37.19` |
| SSH (this workstation when LAN times out) | `ssh project-truth-hris` |
| Canonical evidence | `.wwg/reports/onprem-port-access-20260820.md` |

## Three access classes (do not mix)

| Class | Who can use it | What it proves |
|---|---|---|
| **A. On the VM** | Anyone SSH’d into the box | Process is listening (`127.0.0.1`) |
| **B. On-prem LAN ports** | PCs on BNPI `10.184.37.0/24` or `10.184.38.0/24` | Direct `http://10.184.37.19:<port>` |
| **C. Public Cloudflare** | Internet / this home Wi‑Fi | Named tunnel `bnpi-hris` → those same ports |

This Windows PC on home Wi‑Fi (`192.168.1.26`) is **class C only**. Class B from here is `tcp=false`. That does **not** mean the ports were removed.

## Port map (HRIS app + API)

| Env | Role | On-prem (class B) | On the VM (class A) | Public (class C) |
|---|---|---|---|---|
| **PROD** | App | `http://10.184.37.19:3000/auth/login` | `http://127.0.0.1:3000/auth/login` | `https://bnpi-hris.tech/auth/login` |
| **PROD** | API | `http://10.184.37.19:3001/health` | `http://127.0.0.1:3001/health` | `https://api.bnpi-hris.tech/health` |
| **DEV** | App | `http://10.184.37.19:3100/auth/login` | `http://127.0.0.1:3100/auth/login` | `https://dev.bnpi-hris.tech/auth/login` |
| **DEV** | API | `http://10.184.37.19:3101/health` | `http://127.0.0.1:3101/health` | `https://dev-api.bnpi-hris.tech/health` |
| **UAT** | App | `http://10.184.37.19:3200/auth/login` | `http://127.0.0.1:3200/auth/login` | `https://uat.bnpi-hris.tech/auth/login` |
| **UAT** | API | `http://10.184.37.19:3201/health` | `http://127.0.0.1:3201/health` | `https://uat-api.bnpi-hris.tech/health` |

Employee apps (same VM, extra ports): PROD `:3300`, DEV `:3310`, UAT `:3320`.

## How to check

**On the VM** (after `ssh project-truth-hris`):

```bash
curl -sS -o /dev/null -w '%{http_code}\n' --max-time 5 http://127.0.0.1:3001/health
curl -sS -o /dev/null -w '%{http_code}\n' --max-time 5 http://127.0.0.1:3101/health
curl -sS -o /dev/null -w '%{http_code}\n' --max-time 5 http://127.0.0.1:3201/health
```

Expect `200`.

**From a BNPI LAN PC:**

```powershell
Test-NetConnection 10.184.37.19 -Port 3101
Invoke-WebRequest http://10.184.37.19:3101/health -UseBasicParsing
```

**From GitHub Actions:** workflow **Observe VM GitOps deploy** jobs `onprem-{prod,dev,uat}-{api,app}`. Those jobs wait for the VM reporter, which curls **class A**. GitHub runners never open class B.

**From this home Wi‑Fi:** use class C URLs. Do not treat class B timeout as “instance down”.

## Live proof (2026-08-20)

| Probe | Result |
|---|---|
| VM `127.0.0.1` prod/dev/uat app+API | HTTP **200** all six |
| This PC → `10.184.37.19:3000,3001,3100,3101,3200,3201` | ping=false **tcp=false** all six |
| Public `dev-api` / `uat-api` / `api.bnpi-hris.tech/health` | HTTP **200** |
| Observe run | [32325378487](https://github.com/hrisworkforcesystem-coder/bandai-infra/actions/runs/32325378487) success including all `onprem-*` jobs |

## Push vs ports

`git push origin develop` does **not** move HRIS to a second cloud. It updates GitHub, then ansible-pull on this VM. Class B ports stay on `10.184.37.19`. Class C keeps pointing at them.

Images rebuild only when path filters hit (`hris-api/`, `hris-app/`, …). Docs-only commits leave `services=none`; ports still answer on the previous image.

## Hard bans

| Do not say | Because |
|---|---|
| “Ports are gone because this laptop times out” | This PC is not on `10.184.37.0/24` |
| “Cloudflare is a different deploy than on-prem” | Same VM, named tunnel |
| “Observe onprem success = this PC can open :3100” | Observe is VM loopback, not your LAN NIC |
