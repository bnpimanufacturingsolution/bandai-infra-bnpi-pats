# Full-height list DataTable standard (always on)

Auto-loaded from `.grok/rules/`. Complements root `AGENTS.md` and `DESIGN.md`.

## Hard rule

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

## Forbidden

- New list tables with only `space-y-6` + default `DataTable` (content height only).
- `containedScroll` without a height-locked layout path (body collapses or page still scrolls).
- Inventing a one-off max-height / fixed `vh` table for list pages when the
  standard flex chain works.

## Reference

| Layer | Path / symbol |
|---|---|
| Design doc | `DESIGN.md` → “Full-height list tables” |
| Shell | `hris-app/app/components/templates/AdminTablePageShell.tsx` |
| Admin paths | `isAdminViewportFillPath` |
| HR paths | `isUnifiedViewportFillPath` |
| Component | `DataTable` prop `containedScroll` |
| Example HR | `/hr/benefits-management` |
| Example admin | `/admin/configuration/agencies` |

## Multi-view exception

Pages with tabs / non-table views (e.g. `/hr/employees` list + org chart) stay
page-scroll until the active list view is height-chained correctly. Do not force
viewport-fill on multi-view pages without restructuring the active pane.
