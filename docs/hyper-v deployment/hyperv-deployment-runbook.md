# BNPI PATS — Hyper-V Deployment Runbook

Authoritative deployment contract for hosting the BNPI PATS app inside a
Hyper-V VM, exposed publicly through the named Cloudflare Tunnel
`bnpi-pats` (`12e89b6a-dabb-4897-9925-08ce9213b983`).

Every port mapping in this document is taken from the compose files in this
repository, not from memory. See [Evidence](#evidence).

---

## 1. Architecture

```text
Windows Hyper-V host
  └─ Hyper-V VM (Linux, Project Truth appliance)
       ├─ Docker Engine
       ├─ bnpi-pats-app     (frontend)  :3000
       ├─ bnpi-pats-api      (API)       :3001
       ├─ bnpi-pats-postgres            :15432
       └─ cloudflared  ──────────────► Cloudflare edge
                                            │
                     bnpipats.tech / www / dev / uat / ssh
```

The Windows host runs **Hyper-V only**. It must not run the Project Truth
Docker runtime. The app, API, and database live **inside the VM**.

Two separate concerns must both be true for the public domains to work:

| Concern | Requires | Symptom if missing |
|---|---|---|
| **Infrastructure** | VM running + tunnel connector registered | HTTP `530` |
| **Application** | App/API containers listening on their ports | HTTP `502` |

This is the single most important distinction in this runbook. A correct
ingress configuration with no connector behind it still returns `530`.

---

## 2. Port contract (source of truth)

### Production — `appliance/docker-compose.yml`

| Service | Container | Host port |
|---|---|---|
| Frontend | `bnpi-pats-app` | `3000:3000` |
| API | `bnpi-pats-api` | `3001:3001` |
| Postgres | `bnpi-pats-postgres` | `15432:5432` |
| Redis | `bnpi-pats-redis` | profile-gated |

### DEV / UAT — `appliance/docker-compose.environments.yml`

| Env | Frontend | API | Postgres |
|---|---|---|---|
| DEV | `3100:3000` | `3101:3001` | `15433:5432` |
| UAT | `3200:3000` | `3201:3001` | `15434:5432` |
| Grafana (UAT) | `53002:3000` | — | — |
| Grafana (DEV) | `53001:3000` | — | — |

### Environment credentials

| | API | App |
|---|---|---|
| PROD | `3001` | `3000` |
| DEV | `3101` | `3100` |
| UAT | `3201` | `3200` |

---

## 3. Tunnel ingress contract

The tunnel is **remotely managed**. Ingress rules are evaluated **top to
bottom and the first match wins**, so path rules for the API must appear
*before* the per-hostname catch-all that points at the frontend.

```yaml
# API and websocket path rules FIRST
- hostname: bnpipats.tech       path: /api/.*        service: http://localhost:3001
- hostname: bnpipats.tech       path: /socket.io/.*  service: http://localhost:3001
- hostname: www.bnpipats.tech   path: /api/.*        service: http://localhost:3001
- hostname: www.bnpipats.tech   path: /socket.io/.*  service: http://localhost:3001
- hostname: dev.bnpipats.tech   path: /api/.*        service: http://localhost:3101
- hostname: dev.bnpipats.tech   path: /socket.io/.*  service: http://localhost:3101
- hostname: uat.bnpipats.tech   path: /api/.*        service: http://localhost:3201
- hostname: uat.bnpipats.tech   path: /socket.io/.*  service: http://localhost:3201

# Frontend catch-alls
- hostname: bnpipats.tech       service: http://localhost:3000
- hostname: www.bnpipats.tech   service: http://localhost:3000
- hostname: dev.bnpipats.tech   service: http://localhost:3100
- hostname: uat.bnpipats.tech   service: http://localhost:3200

# VM SSH
- hostname: ssh.bnpipats.tech   service: ssh://localhost:22

# catch-all must stay last
- service: http_status:404
```

### Why `localhost` and not a fixed IP

When the connector runs **inside the VM**, `localhost` resolves to the VM
itself, so the ingress is correct without knowing the VM's dynamic IP. This is
why the tunnel must be VM-managed rather than started from an unrelated host.

### `localhost:PORT` must be plain `http://`

The containers serve plain HTTP. Declaring `https://` against them makes
cloudflared attempt a TLS handshake that fails, producing `502` rather than a
connection error. DEV and UAT previously failed this way.

---

## 4. DNS

All public names are `CNAME` records pointed at the tunnel, proxied:

```text
bnpipats.tech      CNAME  12e89b6a-dabb-4897-9925-08ce9213b983.cfargotunnel.com
www.bnpipats.tech  CNAME  12e89b6a-dabb-4897-9925-08ce9213b983.cfargotunnel.com
dev.bnpipats.tech  CNAME  12e89b6a-dabb-4897-9925-08ce9213b983.cfargotunnel.com
uat.bnpipats.tech  CNAME  12e89b6a-dabb-4897-9925-08ce9213b983.cfargotunnel.com
ssh.bnpipats.tech  CNAME  12e89b6a-dabb-4897-9925-08ce9213b983.cfargotunnel.com
```

No DNS change is required to bring the domains online. They resolve as soon as
a connector is registered.

---

## 5. In-VM application commands

`image-factory/packer/provision.sh` installs these into the image:

| Command | Purpose |
|---|---|
| `project-truth-bnpi-pats-seed` | Prisma `db push` + seed via the `db-init` service |
| `project-truth-bnpi-pats-start` | Start app, API, and Postgres |
| `project-truth-bnpi-pats-status` | Runtime health of the stack |
| `project-truth-ansible-pull` | GitOps: pull latest source and reconcile |
| `project-truth-bnpi-pats-env-start` | Start a specific DEV/UAT environment |

Seeding creates the schema and the default admin used by the appliance
(`admin@bandai.local` / `password123`). Seeding is **not** the same as restoring
production data; a real restore needs `scripts/restore-appliance-data.ps1`.

---

## 6. Deployment flow

```text
1. VHDX present and SHA-256 verified
2. Import and start the VM                 -> VM obtains an IP
3. project-truth-bnpi-pats-seed           -> schema + seed data
4. project-truth-bnpi-pats-start          -> app :3000, api :3001
5. install cloudflared in the VM          -> connector registers, 530 clears
6. ingress: ssh.bnpipats.tech -> localhost:22
7. Verify: 4 hostnames (frontend + API) and SSH
```

Step 6 is required because the tunnel is VM-managed: `ssh://localhost:22` is
the VM's own `sshd`. Pointing SSH at a fixed LAN address is wrong here, since a
VM behind a NAT-style switch receives a dynamic address.

---

## 7. Verification

### Public edge

```powershell
foreach ($h in 'bnpipats.tech','www.bnpipats.tech','dev.bnpipats.tech','uat.bnpipats.tech') {
  $fe  = curl.exe -s -o NUL -w "%{http_code}|%{content_type}" "https://$h/auth/login"
  $api = curl.exe -s -o NUL -w "%{http_code}|%{content_type}" "https://$h/api/health"
  "{0,-22} FE={1,-28} API={2}" -f $h, $fe, $api
}
```

Expected:

```text
bnpipats.tech           FE=200|text/html              API=200|application/json
www.bnpipats.tech       FE=200|text/html              API=200|application/json
dev.bnpipats.tech       FE=200|text/html              API=200|application/json
uat.bnpipats.tech       FE=200|text/html              API=200|application/json
```

The frontend check is the discriminating one. `text/html` means the app is
serving; `application/json` at `/auth/login` means a backend API is answering a
frontend route, which is a misrouting fault rather than a healthy site.

### Tunnel health

```powershell
$env:CLOUDFLARE_CERT = "$env:USERPROFILE\.cloudflared\cert.pem"
& cloudflared tunnel info 12e89b6a-dabb-4897-9925-08ce9213b983
```

A healthy deployment shows at least one connector with a current `CREATED`
timestamp and a `windows_amd64` or `linux_amd64` architecture. `status=down` or
an empty connector list explains any `530`.

### Inside the VM

```bash
ss -ltn | grep -E ':(3000|3001|3100|3101|3200|3201|22)\b'
curl -i http://127.0.0.1:3001/health
curl -I http://127.0.0.1:3000/
project-truth-bnpi-pats-status
```

A port absent from `ss` output is the port whose tunnel rule will return `502`.

### SSH

```powershell
ssh project-truth-lan        # direct LAN address
ssh project-truth-bnpi-pats  # through the tunnel
```

Cloudflare Access requires one interactive browser sign-in before the
command-line path can be used. That step cannot be automated.

---

## 8. Failure modes

| Symptom | Cause | Action |
|---|---|---|
| `530` on all hosts | No tunnel connector registered | Start cloudflared in the VM; check `tunnel info` |
| `502` on one environment | Container not listening, or `https://` against an HTTP origin | Check `ss -ltn`; use `http://` |
| Frontend returns JSON | Frontend catch-all ordered above the API path rules, or an unrelated app owns the port | Reorder ingress; confirm the origin process |
| `/auth/login` returns `404` JSON | An API is answering a frontend route | Same as above |
| `403` on a direct object URL | Expected. The bucket and tunnel are private | Use signed URLs or an authenticated host |

An unrelated application can occupy a port and be silently published. Because
ingress uses `localhost:<port>`, the tunnel forwards to whatever holds that
port; nothing in Cloudflare detects the mismatch. Always confirm the origin
process before trusting a `200`.

---

## 9. Evidence

| Claim | Source |
|---|---|
| Production ports `3000` / `3001` / `15432` | `appliance/docker-compose.yml` L8-9, L75-76, L103-104 |
| DEV ports `3100` / `3101` / `15433` | `appliance/docker-compose.environments.yml` L8-9, L93-94, L159-160 |
| UAT ports `3200` / `3201` / `15434` | `appliance/docker-compose.environments.yml` L180-181, L263-264, L329-330 |
| VHDX build and provisioning | `image-factory/packer/provision.sh` L189-206 |
| API health shape `{"status":"healthy",...}` | `bnpi-pats-api/app/create-app.ts` L175-190 |
| Tunnel ID and DNS names | `cloudflared-bnpi-pats.yml` L1, L5-60 |
| VM-managed tunnel requirement | `AGENTS.md` "Running Cloudflare Tunnel Safety Rule" |
| Host-local VM architecture | `AGENTS.md` "Local Windows Host + Hyper-V VM Architecture Rule" |

The API root route in this repository returns
`{"status":"healthy","timestamp":...,"uptime":N}`. A production response of
`{"message":"... API is running","health":"/api/health"}` is therefore **not**
this codebase, and should be treated as a misrouted origin until proven
otherwise.

---

## 10. Related documents

| Document | Purpose |
|---|---|
| `docs/step-by-step.md` | End-to-end GCS to VM sequence |
| `docs/bandai-bnpi-pats/step-by-step.md` | Packaged copy shipped to the GCS release path |
| `docs/CLOUDFLARE_NAMED_TUNNEL_RUNBOOK.md` | Tunnel operation reference |
| `docs/hyper-v deployment/hyperV-image.md` | Building the image |
| `docs/hyper-v deployment/hyperv-vm-from-vhdx.md` | Generic VM creation from a VHDX |
| `docs/ssh-bnpi-pats.md` | SSH access notes |
