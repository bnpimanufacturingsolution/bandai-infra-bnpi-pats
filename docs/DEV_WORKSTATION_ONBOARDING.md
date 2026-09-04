# Dev Workstation Onboarding (SSH + DEV DB access)

Goal: `npm run dev` inside `hris-api` works on a brand-new Windows machine
without manual SSH ceremony. When the DEV DB tunnel cannot come up because the
workstation lacks the VM SSH key, predev now diagnoses the blocker and offers a
one-time guided setup.

## Fast path (recommended)

```powershell
cd <repo>\hris-api
npm run setup:ssh     # or: powershell -NoProfile -ExecutionPolicy Bypass -File ..\scripts\setup-dev-ssh-access.ps1
npm run dev
```

`scripts/setup-dev-ssh-access.ps1` is interactive and idempotent. It:

1. Generates `%USERPROFILE%\.ssh\node-health-appliance_ed25519` **only if missing**
   (never overwrites an existing key; recovers a lost `.pub` from the private key).
2. Appends `Host project-truth-lan` (direct `infra@10.184.37.19`) and
   `Host project-truth-hris` (Cloudflare Access SSH via cloudflared ProxyCommand)
   to `%USERPROFILE%\.ssh\config` (backs up the file first).
3. Installs the new public key into the VM `infra` user's `authorized_keys`:
   direct LAN first; if the LAN is unreachable it uses the Cloudflare SSH alias —
   a browser window opens for the **1bis.solutions.tech Cloudflare Access
   sign-in**, then one interactive `infra` password prompt authorizes the key.
   The VM sshd has `PasswordAuthentication yes` (verified 2026-09-03), so this
   works with only the password — no operator round-trip required.
4. Verifies end-to-end with BatchMode SSH (`SSH_OK` + whoami + hostname).
5. Offers to install `cloudflared` via winget when the LAN is closed and it is
   missing.

Evidence per run: `.runtime/dev-ssh-setup-<stamp>/` in the repo.

## What `npm run dev` does when the key is missing

`hris-api/scripts/ensure-bnpi-db-access.cjs` now:

- prints the exact blocker (`SSH key missing: <path>`, `ssh.exe not found`),
- prints the one-time fix command and the `npm run dev:local` alternative,
- on an interactive terminal asks: `Run the one-time workstation SSH setup
  now? (recommended) [Y/n]` — answering yes runs the guided setup and retries
  the DB forward automatically,
- non-interactive sessions (CI/agents/piped output) never hang: the prompt is
  skipped, guidance is printed, and the run fails with the same actionable text.

Prompt suppression flags: `HRIS_SKIP_DEV_SSH_SETUP=true` (skip the offer),
`HRIS_PREDEV_NONINTERACTIVE=true` (force non-interactive inside the setup
script). Key path override: `PROJECT_TRUTH_SSH_KEY`.

The compose DEV fallback refusal (AGENTS.md DB rule) is unchanged and explicit
(`PROJECT_TRUTH_ALLOW_COMPOSE_DEV_DB_FALLBACK=true`).

## Manual fallback (no password / no LAN)

Any machine already SSH-authorized to the VM can run the one-liner printed by
the setup script (`Show-ManualFallback`):

```powershell
ssh -i %USERPROFILE%\.ssh\node-health-appliance_ed25519 infra@10.184.37.19 "mkdir -p ~/.ssh && chmod 700 ~/.ssh && echo '<PUBKEY>' >> ~/.ssh/authorized_keys && chmod 600 ~/.ssh/authorized_keys"
```

`<PUBKEY>` is the new workstation's `node-health-appliance_ed25519.pub` first
line. The operator can also run `scripts/setup-dev-ssh-access.ps1 -VerifyOnly`
on the new machine after install to confirm.

## Isolated lanes without VM access

| Lane | Command | DB |
|---|---|---|
| Docker clone | `npm run dev:local` | `5433` |
| Native embedded | `npm run dev:native` | `5434` |

Details: `docs/LOCAL_WINDOWS_REMOTE_DEV_BOOTSTRAP_20260720.md`.

## Boundaries

- Does not change the VM-managed Cloudflare tunnel or any VM service; it only
  appends one line to the `infra` user's `authorized_keys` (deduped).
- Does not make compose DEV a fallback for `npm run dev`.
- The shared K3s DEV DB remains `127.0.0.1:55435` via the single-port SSH
  forward; writes are still shared-DEV-writes (do not experiment against it).
