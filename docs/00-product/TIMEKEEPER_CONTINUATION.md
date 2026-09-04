# Timekeeper Accounts — Continuation & Operations Guide

Kiosk biometric time-logging accounts (`hris-timekeeper` role, `/time-logging` route).

- Implemented on: commit `7c9638cb` (`feat(timekeeper): provision missing hris-timekeeper kiosk accounts + scoped runtime script`)
- Companion quick doc: `TIMEKEEPER_SEED_PROMPT.md` (repo root)
- Tooling: `hris-api/scripts/provision-timekeeper-accounts.ts`

## 1. Background

Operators could not open any timekeeper account. Root cause (DB-proven 2026-09-04): the two
`hris-timekeeper` accounts existed only as a seeder definition and were never materialized in any
runtime database. Runtime DBs are never seeded by design — the GitOps `hris-api-db-init` Job is
schema-only (`prisma-postgres:push`), and full `prisma-seed` on runtime data is banned because it
can reset timesheet/attendance rows.

The fix is a scoped, idempotent provisioning script that creates ONLY the missing
Person/User/Employee rows and links them. It never deletes or resets anything.

## 2. Account credentials

| Email | Password | Role | Person | Employee code |
|---|---|---|---|---|
| `timekeeper1@seed.local` | `password123` | `hris-timekeeper` | Rosa Aquino | `EMP-HR-TK-001` |
| `timekeeper2@seed.local` | `password123` | `hris-timekeeper` | Pedro Castro | `EMP-HR-TK-002` |

Login lands on the `/time-logging` kiosk (BIOMETRIC TIME SYSTEM screen). Reporting line:
`hris-timekeeper` → `hris-hr-manager` (`hris-api/prisma/seeds/addReportToId.ts:20`).

## 3. Environment status (2026-09-04)

| Environment | App host | DB (VM publish) | Accounts exist | Login proven |
|---|---|---|---|---|
| DEV | `dev.bnpi-hris.tech` | K3s forward `127.0.0.1:55435` | YES | YES — login 200, `/auth/me` role `hris-timekeeper`, kiosk renders |
| UAT | `uat.bnpi-hris.tech` | `localhost:15434` via forward script | NO | — |
| PROD | `bnpi-hris.tech` | `localhost:15432` via forward script | NO | PROD API 401 proven pre-fix |

## 4. How to provision UAT / PROD

Run everything from the repo root on the Windows host. The script is idempotent — re-running is
safe and reports what already exists.

### Step 1 — Open the DB forwards

The workstation cannot reach VM LAN ports directly (`host_not_on_lan`), so tunnel them over SSH
through the VM-managed Cloudflare tunnel (leave the tunnel itself untouched):

```powershell
.\scripts\start-project-truth-remote-lan-forward.ps1
```

This opens, among others: `localhost:15434` → UAT Postgres, `localhost:15432` → PROD Postgres
(SSH alias `project-truth-hris`, VM `10.184.37.19`).

### Step 2 — Dry-run (read-only plan)

```powershell
cd hris-api
npx tsx scripts/provision-timekeeper-accounts.ts --database-url "postgresql://postgres:postgres@127.0.0.1:15434/hris?schema=public"   # UAT
npx tsx scripts/provision-timekeeper-accounts.ts --database-url "postgresql://postgres:postgres@127.0.0.1:15432/hris?schema=public"   # PROD
```

Expected output: `mode: dry-run`, resolved `organizationId` + org refs, and per-account rows with
`userExists:false / willCreateUser:true`. If `userExists:true`, the plan shows what it would
relink/repair instead — review before executing.

### Step 3 — Execute

Re-run with `--execute` (same `--database-url`). Optionally add `--reset-password` to also reset an
existing account's password back to `password123`.

### Step 4 — Verify (API first, then browser)

```powershell
$body = @{ email='timekeeper1@seed.local'; password='password123'; appCode='hris' } | ConvertTo-Json
$login = Invoke-RestMethod -Method Post 'https://<env-api-host>/api/auth/login' -ContentType 'application/json' -Body $body
# expect 200 + data.role = hris-timekeeper
```

- PROD API host: `https://api.bnpi-hris.tech`
- UAT: verify through the app host `https://uat.bnpi-hris.tech` (same-host `/api`) or LAN `localhost:3201` when forwarded
- Then headless Playwright: login at `<env-app-host>/auth/login` and confirm redirect to
  `/time-logging` with the BIOMETRIC TIME SYSTEM kiosk rendered.

DEV used the K3s DEV forward instead: `--database-url "postgresql://postgres:postgres@127.0.0.1:55435/hris?schema=public"`.

## 5. Safety rules

- **Never** run `npm run prisma-seed` against DEV/UAT/PROD databases. Full seeding on runtime data
  is banned (it can delete timesheet/attendance rows). The provisioning script is the only
  sanctioned path for these accounts.
- The script is create-only and idempotent; it never deletes rows and never touches attendance,
  timesheet, or payroll data.
- `--reset-password` is the only mutation on existing users (plus role/org repair if drifted).
- Do not stop, disable, or mode-toggle the VM-managed `cloudflared-bnpi-hris` tunnel — the forward
  script rides on it.

## 6. Troubleshooting

- **`Can't reach database server at 10.184.37.19:15433`** — the host env
  `PROJECT_TRUTH_DEV_PG_DATABASE_URL` points at the compose DEV host port, which is not routable
  from this workstation. Always pass `--database-url` explicitly (K3s DEV: `55435`, UAT: `15434`,
  PROD: `15432` after Step 1).
- **`@prisma/client did not initialize yet`** — the script imports the repo-generated client
  (`../generated/prisma`); run it from `hris-api/`.
- **Headless browser "Camera access denied"** — expected; headless Chrome has no camera. Not a
  defect.
- **Console 401 on `/api/auth/me` before login** — known pre-login bootstrap noise, unrelated.

## 7. Evidence appendix

| Evidence | Path |
|---|---|
| Pre-fix 401 probe (all three API hosts) | `.runtime/timekeeper-login-probe-20260904-112100/login-probe.json` |
| DEV role counts proving zero timekeeper rows | recorded in `.wwg/workspace/current-task.md` addendum 2026-09-04 |
| Post-fix login + `/auth/me` proof | `.runtime/timekeeper-postfix-proof-20260904-113225/postfix-login-proof.json` |
| Headless Playwright kiosk proof (both accounts, screenshots, scripts) | `.runtime/timekeeper-kiosk-proof-20260904/` |
| Provisioning script | `hris-api/scripts/provision-timekeeper-accounts.ts` |
| Seeder definitions | `hris-api/prisma/seeds/generalEmployeeSeeder.shared.ts` (timekeeper1/2 entries) |
