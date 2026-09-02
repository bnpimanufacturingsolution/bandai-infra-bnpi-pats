# DataTable list standards (always on)

Auto-loaded from `.grok/rules/`. Complements root `AGENTS.md` and `DESIGN.md`.

## A) Full-height list layout

When **creating or adjusting** any dense list/table page (admin configuration
lists, HR list screens, device ledgers, audit/activity logs):

1. **Layout viewport-fill** — add/keep the route in
   `hris-app/app/lib/admin-viewport-fill.ts` (admin layout) or
   `hris-app/app/lib/unified-viewport-fill.ts` (HR/unified layout).
2. **Page shell** — wrap with `AdminTablePageShell` or the same classes:
   `flex h-full min-h-0 flex-col overflow-hidden`. Optional chrome above the
   table is `shrink-0`; table region is `flex-1 min-h-0`.
3. **DataTable** — always pass `containedScroll` so the body fills remaining
   height and scrolls inside the card.

The table height must **occupy all remaining main-pane space** regardless of
browser height. Rows scroll inside the shell; the document does not leave a
large empty gap under a short table.

## B) Count / aggregate columns (performance)

When a column shows a **count, total, or aggregate** (Enrolled, Members, etc.):

1. **Count-only fetch** — use `document=false`, `pagination=false`, `count=true`
   (or a dedicated counts/group endpoint). Payload must be `{ count }` / grouped
   totals, **not** full row documents.
2. **No client-side `rows.length` over a data dump** — never pull enrollments,
   users, or events just to count them for a chip.
3. **Filter to the row’s identity** — e.g. `benefitTypeId:{id}`, not a global
   sample window (`limit=1000` of all types).
4. **Separate list loads** — drawer/detail may load documents; the table column
   must not.

Canonical: `employeeBenefitService.countByBenefitTypeId` and
`useEmployeeBenefitCountsByTypeIds` on Benefits Management.

## Forbidden

- New list tables with only `space-y-6` + default `DataTable` (content height only).
- `containedScroll` without a height-locked layout path (body collapses or page still scrolls).
- Inventing a one-off max-height / fixed `vh` table for list pages when the
  standard flex chain works.
- Column totals via hydrated list pages (`document=true` + `fields=…` + joins)
  when only a number is displayed.

## Reference

| Layer | Path / symbol |
|---|---|
| Design doc | `DESIGN.md` → “Full-height list tables” + “Count / aggregate columns” |
| Shell | `hris-app/app/components/templates/AdminTablePageShell.tsx` |
| Admin paths | `isAdminViewportFillPath` |
| HR paths | `isUnifiedViewportFillPath` |
| Component | `DataTable` prop `containedScroll` |
| Count example | `countByBenefitTypeId` / Benefits Management **Enrolled** |
| Example HR | `/hr/benefits-management` |
| Example admin | `/admin/configuration/agencies` |

## Multi-view exception

Pages with tabs / non-table views (e.g. `/hr/employees` list + org chart) stay
page-scroll until the active list view is height-chained correctly. Do not force
viewport-fill on multi-view pages without restructuring the active pane.
