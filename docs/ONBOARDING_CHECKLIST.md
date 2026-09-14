# Onboarding Checklist (dedicated module)

Dedicated `/api/onboarding` stack that powers the mock onboarding checklist/builder with
department ownership and **password-as-signature**. Intentionally separate from the generic
`BoardingProcess` / `ChecklistItem` stack, which continues to serve offboarding/exit clearance
unchanged.

## Data model (Prisma, `prisma/schema-postgres/onboarding.prisma`)

Template side (admin-managed, reusable):

- `OnboardingTemplate` → `OnboardingTemplateSection[]` → `OnboardingTemplateItem[]`
  (self-relation `parentId` for 6 / 6.1 / 6.2 nesting, max depth 3)

Instance side (per onboarding employee, deep-copied from a template):

- `OnboardingChecklist` (unique-ish per employee+org) → `OnboardingSection[]` → `OnboardingItem[]`
- `OnboardingSignature` — append-only audit row written on every sign (`method=PASSWORD`,
  `passwordVerified`, signer name + department snapshot)

Every item carries an OPTIONAL `responsibleDepartmentId` + `responsibleDepartmentName`
(parent rows typically have none). Completion state lives on `OnboardingItem`
(`status`, `completedDate`, `completedByEmployeeId`, `signedByName`, `remarks`) and is
**server-stamped only** — structure endpoints reject status/signature fields.

## Role matrix (operator-confirmed 2026-09-12)

| Actor | Template CRUD | Roster | Item visibility | Sign |
|---|---|---|---|---|
| admin / hris-admin | YES | YES | ALL | any ACTIONABLE item (see below) |
| HR (hris-hr-manager / hris-hr-user) | view only | YES | ALL | any ACTIONABLE item (see below) |
| ONBOARDING employee (own checklist) | no | sees own | ALL of own | **never own checklist** |
| other employees | no | YES | own-dept items + no-dept context (read-only) | own-dept items only |

**Actionable vs section rows (operator decision 2026-09-14):** an item counts toward
completion, the promotion gate, and the sign affordance ONLY when it has a responsible
department (`isActionableOnboardingItem` in `onboardingAccess.helper.ts`, with
`ACTIONABLE_ONBOARDING_ITEM_FILTER` as the matching Prisma fragment). Items WITHOUT a
responsible department are **section rows**: never counted in `completionPercentage`,
never block ONBOARDING→ACTIVE, and `canSign:false` for every role (the panel renders them
as a plain "—" row). The sign endpoint stays permissive — admin/HR may still directly
`POST /items/:id/sign` a section row, but the result is excluded from gate/progress math.
Signing requires the caller to be linked to an employee profile (a real human name lands
on the signature) — a passwordless account gets `409 Set a password first`.

## Endpoints (`/api/onboarding`, behind the global `verifyToken`)

Roster / visibility

- `GET  /employees` — onboarding employees + checklist summary (any authenticated user).
  Optional `?search` (multi-term AND over employee number + first/last name, server-side),
  `?departmentId` (exact; malformed values ignored), and `?page`/`?limit`
  (default 10/page, max 100). Response includes `pagination {total, page, limit, totalPages}`.
- `GET  /checklists/:id/visible` — role-filtered tree with per-item `canSign` + `isContextOnly`
- `GET  /checklists/:id` — full tree (admin/HR)

Templates (admin mutations; admin/HR reads)

- `GET/POST /templates` · `GET/PATCH/DELETE /templates/:id`
- `POST /templates/:id/sections` · `POST /templates/:id/items` · `POST /templates/:id/items/bulk`
- `PUT  /templates/:id/tree` — full-tree replace in one transaction (builder Save-all)

Checklist instances (admin/HR)

- `GET/POST /checklists` · `GET/PATCH/DELETE /checklists/:id`
- `POST /checklists/:id/sections` · `POST /checklists/:id/items` · `POST /checklists/:id/items/bulk`
- `POST /checklists/provision-all` — `{ dryRun?, employeeIds? }` (admin/HR): for every
  ONBOARDING employee lacking a checklist, deep-copies the single active template.
  Idempotent + re-runnable; `dryRun` returns the plan (`wouldCreate`, `alreadyHasChecklist`).
- `POST /checklists` may omit `templateId` → the single active template auto-resolves.

Shared structure edits (template=admin, checklist=admin/HR)

- `PATCH/DELETE /sections/:id` · `PATCH/DELETE /items/:id` (structure only, never status/sign)

### Create-on-hire provisioning (backend hooks)

`ensureOnboardingChecklistForEmployee()` (`app/onboarding/onboardingLifecycle.helper.ts`) is
idempotent and called best-effort (own try/catch, after commit, never fails the hire) from:

- `employee.controller.ts` create flow (Step 8.9, when `employmentStatus=ONBOARDING`)
- `reconcileEmployeeOnboardingState()` in `boarding-documents.helper.ts` — covers employee
  updates that hit the onboarding reconcile path and the CSV-import post-actions stage

Existing ONBOARDING employees are provisioned via `provision-all` (no bulk UI by design —
the admin checklist page shows nothing employee-related).

Sign

- `POST /items/:id/sign` `{ password, remarks? }` — bcrypt re-check of the caller's own
  password (no relogin) → department/role gate → server-stamped completion + signature row.
  `401` wrong password · `403` wrong dept / own checklist / no-dept item (for non-admin/HR;
  admin/HR may still sign a section row directly — it just never counts) · `409` already
  signed or no password set.
- `POST /items/:id/unsign` (admin/HR) — reverts to `PENDING`, keeps audit rows
- `GET  /items/:id/signatures` — audit trail (admin/HR, the signer dept, or the onboarded self)

## Frontend (`hris-app`)

- `app/components/organisms/onboarding/checklist.tsx` — **page preview only**: renders THE
  created checklist (single active template) full-page in the builder-preview layout via
  the shared `ChecklistPreviewTable`. Nothing employee-related (no roster/sign/provision
  widgets); honest "No checklist has been built yet" empty state + Build CTA.
- `app/components/organisms/onboarding/hr-onboarding-page.tsx` at **`/hr/onboarding`** —
  the per-employee experience rendered through the **shared `DataTable`** atom (same
  numbered pager with ellipsis — `1 2 3 … 17`, "Showing X to Y of Z results" range, and
  skeleton loading as every other admin/HR list) over the server-side
  GET /api/onboarding/employees list (search + department + `?page`/`?limit=10`), with
  "Open Profile" actions column. Search is `DataTable`'s integrated box (debounced);
  the department filter is the shared `SearchableSelect` (with an "All departments"
  clearing option) in the `customFilters` slot; filters reset to page 1. Selecting a row
  mounts the shared `onboarding-checklist-panel.tsx` inline; "Open Profile" navigates to
  `/employee/<id>?tab=onboarding&from=hr-onboarding` (Back returns to the list).
  NOTE: DataTable rows carry `role="button"` and a mobile-card duplicate exists — browser
  tests must match the real button via `{ name, exact: true }` + `visible=true`.
- `app/routes/employee/employee.$id.tsx` — an **Onboarding tab appears only while
  `employmentStatus === "ONBOARDING"`** and renders the same panel (deep-linkable via
  `?tab=onboarding`). The legacy boarding `OnboardingTab` is untouched/hidden.
- `onboarding-checklist-panel.tsx` — role-scoped tree from `.../visible` (actionable rows
  render a sign checkbox; **no-dept section rows render a plain "—" with a
  "Section row — no sign-off required" hint and never a checkbox** — since 2026-09-14),
  progress bar, **`Skeleton` loading blocks**
  (header/progress/two section cards with row placeholders) while the instance resolves,
  provision CTA for admin/HR when the employee has no checklist, and the sign modal: short
  instruction + **password** + optional remarks, inline error on wrong password
  (`retry: false` on all onboarding mutations so errors surface immediately), admin/HR unsign.
- Instance resolution composes existing endpoints: admin/HR `GET /checklists?employeeId=`,
  everyone else roster lookup; no dedicated by-employee route (operator choice).
- Sidebar/nav: "Onboarding" under HR Recruitment submenu; "Onboarding" in General for
  non-HR non-admin roles; "Onboarding Employees" in the admin configuration nav — all →
  `/hr/onboarding`.
- Service `app/services/onboarding.service.ts`, hooks `app/lib/hooks/useOnboarding.ts`,
  types `app/zod/onboarding.ts` (roster/visible/sign hooks remain for the future
  employee-facing surface).

## Tests / evidence

- `hris-api/tests/onboarding-access.contract.spec.ts` — sign matrix + visible-view (pure)
- `hris-api/tests/onboarding-sign.controller.spec.ts` — sign 200/401/403/409 via supertest+mock prisma
- `hris-api/tests/onboarding-crud.controller.spec.ts` — guards, org forcing, 409 dup,
  templateId auto-resolve, structure-only PATCH, provision-all (403 + dry-run + idempotent execute)
- `hris-api/tests/onboarding-lifecycle.spec.ts` — `ensureOnboardingChecklistForEmployee`
  (exists-noop, deep copy parents-before-children, active-template auto-resolve,
  requireTemplate skip, TEMPLATE_NOT_FOUND, employee-not-found)
- `hris-api/tests/onboarding-status-gate.spec.ts` — design C truth table (legacy AND
  dedicated ACTIONABLE items both required; PENDING section rows never block or reopen —
  filter shape pinned; reopen symmetry; no-dedicated = pure legacy)
- `hris-app` vitest: `builder.test.tsx` (single-template UI contract, section/item edit+delete,
  tree payload, pure helpers), `checklist.test.tsx` (page preview contract),
  `onboarding-checklist-panel.test.tsx` (sign modal, dept gating, inline errors, skeleton),
  `hr-onboarding-page.test.tsx` (DataTable numbered pager + ellipsis, page forwarding,
  skeletons, search/filter wiring, row→panel, Open Profile nav),
  `employee.$id.test.tsx` (Onboarding tab only for ONBOARDING status),
  `Sidebar.test.tsx` (Recruitment + general entries), `onboarding.service.test.ts`
- `hris-app/tests/smoke/admin-onboarding-checklist-live-proof.spec.ts` — live browser proof
- `hris-app/tests/smoke/onboarding-list-tab-live-proof.spec.ts` — live list→search→sign 6.1
  (wrong-password inline error → correct password → profile tab) with a self-healing
  unsign prelude so it is re-runnable
- Live DEV proofs: `.runtime/onboarding-module-proof-<stamp>/` (v1 E2E),
  `.runtime/onboarding-provision-proof-<stamp>/` (scoped provision-all create → idempotent
  skip → visible deep-copy intact → rollback cleanup),
  `.runtime/onboarding-list-tab-proof-<stamp>/` (list/tab journey screenshots + final visible)

## DEV test fixtures (created for browser proofs — documented on purpose)

- User `e2e-onb-signer2@bandai.local` / `password123` (role hris-hr-manager; note:
  login tokens carry the employee-derived role, so it signs via DEPARTMENT match, not HR
  bypass) linked to synthetic employee `KCSSI-BANDAI1129`
  (`cmq21pu5e04e87ztg4jeqn2cm`), whose `departmentId` was set to
  Software Development `cmry9tw4i000unr3o3eay9i80` (original `cmpxw1je6002r7zwsqa632swx`,
  saved in the proof dir) to match the template's IT items.
  **Drift note (2026-09-14):** the fixture had reverted to dept Production + role
  `employee`, which makes login land on `/403` (the frontend allow-list carries
  `hris-employee`, not bare `employee` — see REC in the registry). Restored both
  employee and user to `hris-employee` + Software Development
  (`.runtime/onboarding-section-gate-proof-20260914-213905/signer-fixture-repair.json`).
- Char Aznable's checklist (`cmty9opte00l77ktghwrtnnmx`, employee `cmtu4w68e06b27kkw7ovruznu`)
  intentionally keeps item 6.1 signed by "Mae Banaga" as the demo record; admin can
  `POST /api/onboarding/items/:id/unsign` to reset (the Playwright spec does this automatically).
- v1 test user `e2e-onb-signer@bandai.local` was deleted but its email stays reserved by the
  unique index.

## Promotion gate (design C — operator-confirmed 2026-09-12)

ONBOARDING → ACTIVE is a SINGLE shared rule evaluated by
`syncEmployeeEmploymentStatus` (`helper/boarding-documents.helper.ts`):
an employee stays/reopens to ONBOARDING while **either** side has unmet items:

- legacy `BoardingProcess`(ONBOARDING, NOT_STARTED/IN_PROGRESS) checklist items not COMPLETED, **or**
- a provisioned dedicated `OnboardingChecklist` with any non-deleted **ACTIONABLE** item
  still PENDING (responsible department set — 2026-09-14 refinement: section rows without
  a responsible department never block; parents that DO carry a department must be signed).

Triggers: all existing legacy doc-event call sites (reconcile from document
upload/update/review/delete, employee update, import post-actions) PLUS the dedicated
module's `sign`, `unsign`, `deleteItem`/`deleteSection` (checklist kind),
`createChecklist`, and `provision-all` — one resolver, both worlds.

- Employee with NO dedicated checklist → pure legacy behavior (existing hires never blocked).
- Empty dedicated checklist (0 items) → non-blocking (nothing pending).
- Checklist whose items are ALL section rows (0 actionable) → non-blocking AND honest
  100%/COMPLETED (`recomputeOnboardingChecklistProgress` in
  `onboardingLifecycle.helper.ts` is the single progress source for controller + ops script).
- No auto-sign/bulk-sign endpoints (declined): a signature always names a password-verified human.
- Sign/unsign responses echo the resolved `employmentStatus` for observability.
- Ops repair: `hris-api/scripts/resync-onboarding-employment-status.ts` (dry-run default,
  `--execute`) re-evaluates every ONBOARDING employee after gate-rule changes.

Live proof (2026-09-12, `.runtime/onboarding-gate-proof-<stamp>/`): EMP003
baseline ONBOARDING → provisioned (dedicated PENDING, legacy clean) → stays ONBOARDING →
signed only item → **ACTIVE** (direct read) → admin unsign → **ONBOARDING** (reopen) →
checklist deleted → ACTIVE again (legacy-only) → status restored. Hirotaka Tanaka:
dedicated 100% signed but one legacy 201 item PENDING → stayed ONBOARDING (AND-gate).

Section-row refinement live proof (2026-09-14,
`.runtime/onboarding-section-gate-proof-20260914-213905/`): dry-run → execute resync of 73
ONBOARDING employees → EMP3335 (Gabriel Berja; legacy clean, no dedicated checklist, no
trigger had ever fired) promoted to ACTIVE with 0 errors; Char Aznable's checklist shows
5 pending ACTIONABLE + 1 pending section row (`api-proof.json`); the restored SW-Dev
signer sees 6.1/6.2 `canSign:true` while the no-dept row 6 is `canSign:false`
(`api-proof-signer2.json`); browser smoke re-passed.

## Boundaries

- The per-employee list/signing surface lives in **hris-app** (`/hr/onboarding` + the profile
  Onboarding tab). `hris-emp-app` has no counterpart and is not a checked-in path on this
  branch; emp-app parity remains a candidate follow-up (recommendation registry).
- No change to the generic `BoardingProcess` / `ChecklistItem` / `BoardingTemplate` / `TemplateItem`
  controllers or offboarding flows.
- No automatic notification on checklist completion (the legacy boarding stack keeps its own).
