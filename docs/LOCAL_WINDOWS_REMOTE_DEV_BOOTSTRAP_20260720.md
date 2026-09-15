# Local Windows remote-dev bootstrap (2026-07-20)

Operator log for a Windows workstation that **cannot** reach the Project Truth VM
on LAN `10.184.37.19` and must use **Cloudflare Access SSH** for local
`bnpi-pats-api` `npm run dev`.

Evidence pack (gitignored): `.runtime/local-dev-cf-ssh-db-tunnel-20260720/`.

## Automated one-time setup (2026-09-03)

The missing-key blocker is now self-service: `cd bnpi-pats-api; npm run setup:ssh`
(`scripts/setup-dev-ssh-access.ps1`) generates the key, writes the ssh config,
installs the public key on the VM (LAN-first, Cloudflare Access sign-in
fallback), and verifies. `npm run dev` also offers this interactively when the
DB forward is blocked. See `docs/DEV_WORKSTATION_ONBOARDING.md`.

## Symptoms fixed

| Symptom | Root cause |
|---|---|
| `SSH key not found at ...\node-health-appliance_ed25519` | Key missing on workstation || Login 500 `Can't reach database server at 127.0.0.1:55435` | Local SSH DB tunnel down or half-dead |
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
%USERPROFILE%\.ssh\config   # Host project-truth-bnpi-pats + ssh.bnpi-pats.tech
cloudflared access ssh ProxyCommand
VM infra authorized_keys += matching public key
```

Verify:

```powershell
ssh project-truth-bnpi-pats "echo SSH_OK; hostname; whoami"
```

## Daily local API recipes

### Normal (shared VM DEV via tunnel `55435`) — default

```powershell
cd <repo>\bnpi-pats-api
npm.cmd run dev
```

Uses `.env` + predev tunnel bootstrap (`.env.development.local` regenerated for `127.0.0.1:55435`).
Writes to **shared DEV** — do not use for experimental mutations.

### Local clone (isolated Docker Postgres on `5433`) — one command

```powershell
cd <repo>\bnpi-pats-api
npm.cmd run dev:local
```

Requires Docker. Single command (`scripts/run-dev-local.cjs`) does all of:

1. Ensure `.env.local-clone` (copy from example if missing)
2. Start/create Docker `bnpi-pats-local-dev-clone` on `5433` with named volume `bnpi-pats-local-dev-clone-pgdata`
3. Wait until Postgres is ready
4. Run `prisma db push` against the local clone (`prisma/schema-postgres`) so tables exist for `/setup`
5. Run predev with BNPI tunnel + Hikvision bridges skipped
6. Start API watch against the local clone

### Native host Postgres (no Docker, no VM) — separate third lane

Does **not** replace `npm run dev` (VM tunnel `55435`) or `npm run dev:local` (Docker `5433`).

```powershell
cd <repo>\bnpi-pats-api
# one-time if binaries missing:
npm.cmd install --no-save embedded-postgres@18.4.0-beta.17
node node_modules/@embedded-postgres/windows-x64/scripts/hydrate-symlinks.js

npm.cmd run db:native:start      # Postgres only on 127.0.0.1:5434
npm.cmd run dev:native           # empty/schema-only API (.env.local-native)
npm.cmd run dev:native:restore   # restore shared golden dump, then API
npm.cmd run db:native:status
npm.cmd run db:native:stop
```

#### Same snapshot data as `dev:local:restore`?

**Yes.** Both lanes read the same portable dump:

```text
.runtime/local-db-snapshots/current/bnpi-pats-local.dump
```

| Action | Docker lane | Native lane |
|---|---|---|
| Capture | `npm run db:snapshot` (from running Docker clone) | `npm run db:snapshot:native` |
| Restore only | `npm run db:restore` | `npm run db:restore:native` |
| Restore + API | `npm run dev:local:restore` | `npm run dev:native:restore` |

The dump is gitignored. On a machine without a local capture, **copy** `.runtime/local-db-snapshots/` from a device that already ran `db:snapshot` (your other PCs that use `dev:local:restore`). Then `dev:native:restore` loads that same business data into port `5434`.

| Lane | Command | DB | Env file |
|---|---|---|---|
| Shared VM DEV | `npm run dev` | tunnel `55435` | `.env` / `.env.development.local` |
| Docker clone | `npm run dev:local` / `dev:local:restore` | Docker `5433` | `.env.local-clone` |
| Native host | `npm run dev:native` / `dev:native:restore` | embedded `5434` | `.env.local-native` |

Named volume (distinguishable in Docker Desktop / `docker volume ls`):

- Default name: `bnpi-pats-local-dev-clone-pgdata`
- Override: `BNPI_PATS_LOCAL_CLONE_VOLUME`
- Container override: `BNPI_PATS_LOCAL_CLONE_CONTAINER` (default `bnpi-pats-local-dev-clone`)
- Schema push opt-out: `BNPI_PATS_SKIP_LOCAL_CLONE_SCHEMA_PUSH=true`

Existing containers created before the named-volume change keep their old mount; recreate the container to adopt `bnpi-pats-local-dev-clone-pgdata` (restore dump after if needed).

Writes only to **local clone** — safe for destructive local testing.

- **Schema**: auto-applied every `dev:local` (idempotent `db push`)
- **Business data**: empty until you complete `/setup` initialize **or** restore a golden snapshot:
  - Capture after DM work: `cd bnpi-pats-api; npm run db:snapshot`
  - Restore only: `npm run db:restore`
  - Restore + start API: `npm run dev:local:restore`
  - Snapshot files live under `.runtime/local-db-snapshots/` (gitignored client data)

Success line (both):

```text
Server running at http://localhost:3001
```

Health / login proof:

```powershell
Invoke-RestMethod http://localhost:3001/health
Invoke-RestMethod -Method Post http://localhost:3001/api/auth/login `
  -ContentType application/json `
  -Body '{"identifier":"admin@bandai.local","password":"password123","appCode":"bnpi-pats"}'
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
- App UI still needs `bnpi-pats-app` (e.g. Vite on `5175`) with
  `VITE_API_BASE_URL=http://localhost:3001`.
