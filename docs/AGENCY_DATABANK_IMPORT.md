# Agency Databank Import (Agency Daily Report pack)

Operator runbook for importing agency worker rosters and creating exactly one
agency coordinator per agency. Delivered 2026-09-14 for the client pack
`AGENCY-20260914T052438Z-1-001/AGENCY/*.xlsx` (one file per agency:
Avance, Cepol, CGSI, Kohsai, Natcorp).

The client folder itself is ignored (`.gitignore` → `Agency Daily Report/`,
`AGENCY-*/`); only the importer scripts are tracked.

## What it does

`hris-api/scripts/import-agency-databank.ts`:

1. **Agency** — `ensureAgency(code, name)` finds-or-creates the `Agency` row
   by org + code (codes: `AVANCE`, `CEPOL`, `CGSI`, `KOHSAI`, `NATCORP`).
2. **Coordinator** — `ensureCoordinator` creates exactly **one** login per
   agency: `coordinator-<code>@bandai.local`, role `hris-agency`, password
   `password123` (bcrypt), `User.metadata.agencyId` → the agency. Existing
   coordinators are self-repaired (real password hash, `active` status,
   agency link) — this is idempotent.
3. **Employees** — every data row upserts by `organizationId + employeeId`
   (`ID No.` / `No.` column, verbatim, e.g. `A-14441`, `CGSIBAT012235`,
   `KCSSI-BANDAI1050`, `NC-BNP1310`, `CPS-B4205`):
   - `workforceSource: AGENCY`, `agencyId` → the file's agency
   - Department / Section / Position matched by name or generated code,
     created when missing (Section always linked to its Department)
   - Name parsed (`Last, First Middle` or `First Middle Last`), gender,
     birthday, hire date, status (blank status = `ACTIVE`)
   - `isDeleted: false` (databank rows are current workers)
   - New employees get their own `Person`; existing ones keep their person
     link (names verified against the files — see `fix-agency-person-links.ts`)
   - Repeated-header/company-name junk rows are skipped.

Departments/sections/positions are cached per run, so steady-state cost is
~2 queries per employee row.

## How to run

Preconditions (canonical local DEV lane):

```powershell
# 1) K3s DEV DB forward on 127.0.0.1:55435 (Cloudflare SSH; complete the
#    browser Access prompt if it stalls >15s)
.\scripts\start-k8s-dev-db-access.ps1

# 2) import all five agencies, or one code at a time
cd hris-api
npx tsx scripts/import-agency-databank.ts
npx tsx scripts/import-agency-databank.ts CGSI
```

The script is **resumable**: if the SSH tunnel drops it exits `2`; just rerun
the same command (agencies/coordinators/employees are all matched-then-created).

Optional integrity pass after any import:

```powershell
npx tsx scripts/fix-agency-person-links.ts   # relink any Person whose name != file name
```

## When an agency re-sends an updated databank

Overwrite the same file path, rerun the import for that code. Rows are
upserted by `employeeId`; removed people are NOT deleted from HRIS (separation
is HRIS-owned). Verify with the roster page or a count query afterward.

## Agency coordinator accounts — ready to open (DEV)

One coordinator per agency, created by the importer and live-verified:

| Agency | Login | Password | Workers | agencyId (verified) |
|---|---|---|---|---|
| AVANCE | `coordinator-avance@bandai.local` | `password123` | 433 | `cmpxw1k2s006r7zwsgzkef8ze` |
| CEPOL | `coordinator-cepol@bandai.local` | `password123` | 130 | `cmpxw1k3w006t7zws05yjigg9` |
| CGSI | `coordinator-cgsi@bandai.local` | `password123` | 496 | `cmpxw1k3m006s7zwsv7xpa3go` |
| KOHSAI | `coordinator-kohsai@bandai.local` | `password123` | 120 | `cmpxw1k47006u7zwsqovbmwcq` |
| NATCORP | `coordinator-natcorp@bandai.local` | `password123` | 176 | `cmpxw1k4g006v7zwsz160blwj` |

**How to open:** go to `/auth/login` → paste the email + `password123`
(`appCode=hris`) → auto-redirects to `/agency` (Overview). Role
`hris-agency` + `User.metadata.agencyId` scope every page (Overview,
Employees, Attendance, Timesheets, Biometrics, Reports) to that agency's own
people — server-enforced via `hris-api/helper/agency-scope.helper.ts`, so no
cross-agency reads are possible through the API filters either.

**Re-verified live 2026-09-15** against the running local API: all five
`POST /api/auth/login` → 200 + token; `GET /api/auth/me` →
`role=hris-agency` + correct `metadata.agencyId`; `GET /api/employee` →
roster totals match the table above (433/130/496/120/176). (2026-09-14 first
pass covered login + CGSI roster + dashboard render with 496 members.)

**Before handing to real coordinators:**
- `password123` is the shared dev seed — change per account.
- Rosters are populated, but **attendance/time-entry data is NOT imported
  yet** (the databank files are roster-only), so Punches/Absent/Time-entries
  legitimately show 0 until a DM4-style attendance import runs for these
  workers.
- These accounts exist in the local DEV K3s DB (`127.0.0.1:55435`) only;
  opening them on VM/public DEV (`dev.bnpi-hris.tech`) requires replaying the
  import there first.
- If the dashboard briefly shows all-zeros with a red Vite badge right after
  login, that is the known transient `/api/auth/me` bootstrap 401 (app-wide,
  pre-existing) — refresh resolves it; queries re-run with the token.

## Boundaries

- **DEV clone only** (`127.0.0.1:55435`). VM/UAT/PROD were not touched.
- The pack's **Disciplinary Action Databank** sheet has no agency-scoped HRIS
  read yet (`GET /api/disciplinaryAction` filters by single `employeeId`);
  tracked as `REC-20260914-AGENCY-DA-DATABANK-NO-SCOPE` (registry, proposed).
- Absence reasons/advance-notice columns in the client absentee sheets are
  client-workbook data with no HRIS field; the Reports export leaves them
  blank rather than inventing values.
