# Current Task

## Status
done

## Summary
Applied full-viewport table layout (no page scrollbar; table body fills remaining height) across admin configuration and other admin list/table pages in `bandai-infra/hris-app`.

## Category
ui-ux

## Packages
- bandai-infra/hris-app
- Dual-app: **HR/emp-only (no counterpart)** for admin configuration tables

## Changes
- `app/lib/admin-viewport-fill.ts` (+ test) — route detector for viewport-fill list pages
- `app/layouts/admin-layout.tsx` — uses detector (overflow-hidden vs page scroll)
- `app/components/templates/AdminTablePageShell.tsx` — shared shell helper
- Config list pages: full-height wrappers + `containedScroll` (users, departments, sections, positions, levels, schedule templates, leave types, holidays, agencies, loan types, workflows, calendars, calendar items, attendance, employees, benefit types, payroll periods, document 201 types, devices, …)
- Also: audit logs, activity logs, disciplinary action, device manage/events/users, user activity logs

## Truth delta
NO — layout chrome only

## Drift
NONE
