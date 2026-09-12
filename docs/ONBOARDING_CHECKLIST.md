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
| admin / hris-admin | YES | YES | ALL | any item |
| HR (hris-hr-manager / hris-hr-user) | view only | YES | ALL | any item |
| ONBOARDING employee (own checklist) | no | sees own | ALL of own | **never own checklist** |
| other employees | no | YES | own-dept items + no-dept context (read-only) | own-dept items only |

No-department items are shown to every employee as context but are signable only by
admin/HR (`canSign:false`, `isContextOnly:true` on the wire). Signing requires the caller
to be linked to an employee profile (a real human name lands on the signature) — a
passwordless account gets `409 Set a password first`.

## Endpoints (`/api/onboarding`, behind the global `verifyToken`)

Roster / visibility

- `GET  /employees` — onboarding employees + checklist summary (any authenticated user)
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
  `401` wrong password · `403` wrong dept / own checklist / no-dept item · `409` already
  signed or no password set.
- `POST /items/:id/unsign` (admin/HR) — reverts to `PENDING`, keeps audit rows
- `GET  /items/:id/signatures` — audit trail (admin/HR, the signer dept, or the onboarded self)

## Frontend (`hris-app`)

- `app/components/organisms/onboarding/checklist.tsx` — **page preview only**: renders THE
  created checklist (single active template) full-page in the builder-preview layout via
  the shared `ChecklistPreviewTable`. Nothing employee-related (no roster/sign/provision
  widgets); honest "No checklist has been built yet" empty state + Build CTA.
- `app/components/organisms/onboarding/builder.tsx` — **single-template editor**:
  auto-opens the FIRST template created (no template selector, no "New template…"
  affordance); Save always updates that one template (`POST` + `PUT /tree`). Sections and
  items support inline rename + delete (subtree removal with confirm); helpers
  `updateSectionName`, `removeSectionById`, `updateItemInItems`, `removeItemFromItems`
  are exported + tested. `add-item.tsx` doubles as the item edit dialog (department stays
  optional → no-dept context item).
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
- `hris-app` vitest: `builder.test.tsx` (single-template UI contract, section/item edit+delete,
  tree payload, pure helpers), `checklist.test.tsx` (page preview contract),
  `onboarding.service.test.ts`
- `hris-app/tests/smoke/admin-onboarding-checklist-live-proof.spec.ts` — live browser proof
- Live DEV proofs: `.runtime/onboarding-module-proof-<stamp>/` (v1 E2E) and
  `.runtime/onboarding-provision-proof-<stamp>/` (scoped provision-all create → idempotent
  skip → visible deep-copy intact → rollback cleanup)

## Boundaries

- **Single-app exception:** the surfaces are admin/HR configuration (`/admin/configuration/onboarding/*`);
  `hris-emp-app` has no counterpart and is not a checked-in path on this branch. A general-employee
  self-service view of the dept-filtered checklist is a candidate follow-up (see recommendation registry).
- No change to the generic `BoardingProcess` / `ChecklistItem` / `BoardingTemplate` / `TemplateItem`
  controllers or offboarding flows.
- No automatic notification on checklist completion (the legacy boarding stack keeps its own).
