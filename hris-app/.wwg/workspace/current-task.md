# Current Task

## Status
done

## Summary
Hide main role-aware sidebar nav scrollbar by default; show it only while the cursor hovers the sidebar. Applies to all roles via the shared `Sidebar` component. Dual-app parity with hris-emp-app.

## Category
ui-ux

## Packages
- hris-app
- hris-emp-app
- Dual-app: both updated

## Code changes
- `hris-app/app/app.css` — `.sidebar-scroll` hidden unless `.sidebar:hover` / `.sidebar-scroll:hover`
- `hris-app/app/components/organisms/Sidebar.tsx` — root gets `sidebar` class for hover scope
- `hris-emp-app/app/app.css` — same scrollbar behavior
- `hris-emp-app/app/components/organisms/Sidebar.tsx` — root `sidebar` + nav `sidebar-scroll` (was missing)

## Truth synchronization
- New truth detected: NO durable product domain change — cosmetic UX only
- MDs: this current-task (and emp-app current-task)
- Drift: NONE

## Residual risks
- Firefox/WebKit may differ slightly on scrollbar width reveal; scroll still works when hidden
