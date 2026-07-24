# Local Windows remote-dev bootstrap (2026-07-20)

Operator log for a Windows workstation that **cannot** reach the Project Truth VM
on LAN `10.184.37.19` and must use **Cloudflare Access SSH** for local
`hris-api` `npm run dev`.

Evidence pack (gitignored): `.runtime/local-dev-cf-ssh-db-tunnel-20260720/`.

## Symptoms fixed

| Symptom | Root cause |
|---|---|
| `SSH key not found at ...\node-health-appliance_ed25519` | Key missing on workstation |
| Login 500 `Can't reach database server at 127.0.0.1:55435` | Local SSH DB tunnel down or half-dead |
| Tunnel TCP open but Prisma still fails | Forward target K3s `10.43.130.9:5432` refused; compose `15433` OK |
| `remote port forwarding failed for listen port 59443` | Stale VM reverse-forward `sshd` still held 59443/59000 |
| UI **Unable to connect to the server** | Nothing listening on `:3001` (predev hung; API never reached `server.ready`) |

## Repo script changes

### `scripts/start-k8s-dev-db-access.ps1`

- Require **Postgres wire** (SSLRequest N/S), not TCP alone, before reusing `55435`.
- Replace half-dead local listeners.
- Prefer K3s DEV ClusterIP `10.43.130.9:5432`.
- **Fallback:** SSH `-L 127.0.0.1:55435:127.0.0.1:15433` (compose DEV on VM) when ClusterIP fails wire.

### `scripts/start-host-hikvision-vm-ssh-bridge.ps1`

- `Clear-RemoteReversePorts` uses `fuser -k <port>/tcp` over SSH so reverse
  ports can rebind after crashed host bridges (fixes broken here-string clear).

## Workstation setup (not committed)

```text
%USERPROFILE%\.ssh\node-health-appliance_ed25519
%USERPROFILE%\.ssh\config   # Host project-truth-hris + ssh.bnpi-hris.tech
cloudflared access ssh ProxyCommand
VM infra authorized_keys += matching public key
```

Verify:

```powershell
ssh project-truth-hris "echo SSH_OK; hostname; whoami"
```

## Daily local API recipes

### Normal (shared VM DEV via tunnel `55435`) — default

```powershell
cd <repo>\hris-api
npm.cmd run dev
```

Uses `.env` + predev tunnel bootstrap (`.env.development.local` regenerated for `127.0.0.1:55435`).
Writes to **shared DEV** — do not use for experimental mutations.

### Local clone (isolated Docker Postgres on `5433`) — one command

```powershell
cd <repo>\hris-api
npm.cmd run dev:local
```

Single command (`scripts/run-dev-local.cjs`) does all of:

1. Ensure `.env.local-clone` (copy from example if missing)
2. Start/create Docker `hris-local-dev-clone` on `5433` with named volume `hris-local-dev-clone-pgdata`
3. Wait until Postgres is ready
4. Run `prisma db push` against the local clone (`prisma/schema-postgres`) so tables exist for `/setup`
5. Run predev with BNPI tunnel + Hikvision bridges skipped
6. Start API watch against the local clone

Named volume (distinguishable in Docker Desktop / `docker volume ls`):

- Default name: `hris-local-dev-clone-pgdata`
- Override: `HRIS_LOCAL_CLONE_VOLUME`
- Container override: `HRIS_LOCAL_CLONE_CONTAINER` (default `hris-local-dev-clone`)
- Schema push opt-out: `HRIS_SKIP_LOCAL_CLONE_SCHEMA_PUSH=true`

Existing containers created before the named-volume change keep their old mount; recreate the container to adopt `hris-local-dev-clone-pgdata` (restore dump after if needed).

Writes only to **local clone** — safe for destructive local testing.

- **Schema**: auto-applied every `dev:local` (idempotent `db push`)
- **Business data**: still empty until you complete `/setup` initialize or restore a dump (see `.runtime/local-db-clone-*`)

Success line (both):

```text
Server running at http://localhost:3001
```

Health / login proof:

```powershell
Invoke-RestMethod http://localhost:3001/health
Invoke-RestMethod -Method Post http://localhost:3001/api/auth/login `
  -ContentType application/json `
  -Body '{"identifier":"admin@bandai.local","password":"password123","appCode":"hris"}'
```

If DB tunnel died:

```powershell
cd <repo>
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\start-k8s-dev-db-access.ps1 -LocalPort 55435
```

Hikvision Live capture reverse bridge remains optional. Skip it unless you need
device reverse tunnels from this PC; API login does not require it.

## Boundaries

- Does **not** claim K3s DEV Postgres ClusterIP is healthy.
- Does **not** replace LAN-first access when `10.184.37.19` is routable.
- Does **not** change public Cloudflare tunnel service on the VM.
- App UI still needs `hris-app` (e.g. Vite on `5175`) with
  `VITE_API_BASE_URL=http://localhost:3001`.
