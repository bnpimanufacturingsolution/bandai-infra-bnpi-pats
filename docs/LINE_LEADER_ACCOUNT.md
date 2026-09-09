# Line Leader Account & Role Wiring (Operator Doc)

Status: `CONFIRMED_LIVE_LOCAL` (verified 2026-09-08 against local DEV: K3s Postgres forward `127.0.0.1:55435`, API `http://localhost:3001`)

This page documents the operator-facing **Line Leader login account** in DEV, how the
role wiring works end-to-end, how to verify it, and how to manage more line leaders.

> **2026-09-08 login fix:** the first real browser login with this account exposed a
> frontend bug — the post-login role allowlists in
> `hris-app/app/routes/auth/login.tsx` and `hris-app/app/routes/landing.tsx` were
> missing `"hris-line-leader"`, so line leaders were dumped on the Access Denied
> (`/403`) page even though API login, role derivation, and `/dashboard` (which renders
> `ManagerDashboard` for the role) were all correct. Both allowlists now include the
> role, proven by `hris-app/tests/smoke/line-leader-account-login.spec.ts` (headless
> Playwright: login 200 → lands on `/dashboard` → `/auth/me` returns
> `hris-line-leader`, `isManager=true`).

---

## 1. The account

| Item | Value |
|---|---|
| Login email | `leader@bandai.local` |
| Password | `password123` (standard local DEV default) |
| User ID | `cmtrfdw6d0003vxs830s1d9zs` |
| Auth role | `hris-line-leader` |
| Manager class | `isManager: true` |
| Account status | `active` |
| Created | 2026-09-07T15:58:47Z |
| Linked employee | TESTBEN004 — "Beneficiary Test Employee" |
| Employee ID | `cmtgu1hky0018vxj80dpacsp1` |
| Employee profile | ACTIVE, REGULAR, Operator position, Assembly department |
| Leads section | **Assembly** (section code `ASY`, id `cmpxw1jjm00377zwsqrwkofgq`) |

Log in at the app login screen with the email + password above. The account behaves as a
manager-class user because the role derives from section leadership, not from a manual
role override.

---

## 2. How the wiring works (end to end)

```text
section_line_leaders row (Assembly -> TESTBEN004)
        |  (created/edited in Admin > Configuration > Sections, "Line Leaders (optional)")
        v
reconcileSectionLineLeaders  (transactional diff on section create/update/delete)
        |
        v
syncLineLeaderRolesForEmployees  -> deriveRoleAndFlags({ isLineLeader: true })
        |                          precedence: HR > manager level > line leader > plain employee
        v
users.role = "hris-line-leader"  (persisted; never downgrades an HR/manager role)
        |
        v
POST /api/auth/login  -> token
GET  /api/auth/me     -> role=hris-line-leader, isManager=true, employee metadata embedded
```

Key guarantee: add a leader → role upgrades automatically. Remove a leader or delete the
section → the ex-leader is auto-demoted back to `hris-employee` (unless they separately
hold an HR or manager role). Employee hard delete also detaches section head and clears
line-leader membership rows before deleting.

---

## 3. Live verification (2026-09-08)

All checks ran against the local DEV runtime with the admin actor
(`admin@bandai.local`) plus a real login as the line leader account:

1. **Membership exists** — `GET /api/section?limit=100&document=true` shows section
   **Assembly** with `lineLeaders: [TESTBEN004]`.
2. **Role persisted** — employee record for TESTBEN004 includes its `user`:
   `email=leader@bandai.local`, `role=hris-line-leader`, `status=active`.
3. **Login works** — `POST /api/auth/login` with the credentials returned 200 and a
   token; `lastLogin` updated live.
4. **Derived truth correct** — `GET /api/auth/me` (with the leader token) returned
   `role=hris-line-leader`, `metadata.employee.isManager=true`, `isHrManager=false`,
   with TESTBEN004's employee metadata correctly embedded.
5. **Browser UI login works** — headless Playwright through the real login form:
   `POST /api/auth/login` 200 → redirects to `/dashboard` (ManagerDashboard, not 403) →
   in-page `GET /api/auth/me` returns `hris-line-leader`. Screenshot:
   `line-leader-dashboard.png` in the evidence directory. Regression spec:
   `hris-app/tests/smoke/line-leader-account-login.spec.ts`.

Evidence pack: `.runtime/line-leader-account-check-20260908-092132/`
(`SUMMARY.md`, `sections-list.json`, `leader-login-success.json`, `leader-me.json`,
`employee-testben004-full.json`, `browser-proof/ui-proof-passed.json`,
`browser-proof/line-leader-dashboard.png`, and more).

### Quick re-verify (PowerShell)

```powershell
# Login as the line leader
$loginBody = @{ email='leader@bandai.local'; password='password123'; appCode='hris' } | ConvertTo-Json
$ll = Invoke-RestMethod -Method Post 'http://localhost:3001/api/auth/login' -ContentType 'application/json' -Body $loginBody
$h = @{ Authorization = "Bearer $($ll.data.token)" }

# Derived role truth
$me = Invoke-RestMethod -Method Get 'http://localhost:3001/api/auth/me' -Headers $h
$me.data.role            # -> hris-line-leader
$me.data.metadata.employee.isManager   # -> True
```

Requires the local stack: API on `:3001` and the K3s DEV DB forward on `127.0.0.1:55435`.

---

## 4. Managing line leaders

### UI (canonical)

`/admin/configuration/sections` — open a section row → **Edit**:

- **Line Leaders (optional)**: removable chips of current leaders + "Add line leader..."
  single-select (clears after each add).
- The sections table shows a **Line Leaders** column (first 2 names + "+N").
- View modal shows the leaders row; CSV export includes the Line Leaders column.

### API

- Section create / update accept `lineLeaderIds` (array of Employee IDs, same-org
  validated, deduped): `POST /api/section` / `PATCH /api/section/:id`.
- `POST /api/section/:id/assign-members` assigns section members to specific leaders
  (one member per leader) when a section has multiple leaders.
- The section **list** GET (`document=true`) batches `lineLeaders` (employee + person
  identity). The single-section GET does not embed `lineLeaders` — the UI uses the list
  endpoint, so this is not a defect.

### Notes

- An employee can lead **many** sections; a section can have **multiple** leaders
  (many-to-many join model `SectionLineLeader`, table `section_line_leaders`, unique
  `sectionId + employeeId`).
- Related test employee: **TESTBEN003** (`beneficiary.test3@example.com`) exists but has
  no line-leader membership.

---

## 5. Boundaries (do not assume)

- **LLA money is NOT auto-awarded.** Line Leader Allowance stays enrollment-driven via
  `EmployeeBenefit` code `LLA`. Assigning a leader never creates pay.
- **Day-labor tagging scoping** (leader tags only own-section people on the timesheet) is
  a Proposed recommendation only (`REC-20260907-DAY-LABOR-LEADER-SECTION-SCOPING`) — not
  implemented.
- Role precedence: **HR > manager level > line leader > plain employee**. Making an HR
  or manager a line leader does not change their role.
- This account is DEV-local data. PROD/UAT have the schema and code deployed (verified
  2026-09-07, all six Argo apps Synced/Healthy) but their leader assignments are
  independent data.

---

## 6. References

- Implementation report: `.wwg/reports/section-line-leader-assignment-20260907.md`
- Timesheet adjustment for members: `docs/LEADER_TIMESHEET_ADJUSTMENT.md`
  (leader-filed, member's manager approves — manager-final, 2026-09-09)
- Overtime for members: `docs/LEADER_ASSIGN_OVERTIME.md`
- Project Truth: `.wwg/wiki/project-truth.md` — "Section Line Leader assignment — IMPLEMENTED (2026-09-07)"
- Terminology: `.wwg/wiki/terminology.md` — "Line Leader" entry
- Schema: `hris-api/prisma/schema-postgres/sectionlineleader.prisma`
- Backend: `hris-api/helper/section-line-leaders.helper.ts`,
  `hris-api/helper/employee-role-sync.helper.ts` (`syncLineLeaderRolesForEmployees`),
  `hris-api/utils/role-derivation.ts`, `hris-api/app/section/section.controller.ts`
- Frontend: `hris-app/app/routes/admin/configuration/sections.tsx`
- Tests: `hris-api/tests/section-line-leaders.spec.ts` (15/15),
  `hris-api/tests/role-derivation.spec.ts` (55/55),
  `hris-app/tests/smoke/admin-config-sections-line-leaders.spec.ts` (2/2)
- Account verification evidence (2026-09-08):
  `.runtime/line-leader-account-check-20260908-092132/`
