# Current Task

## Status
done

## Summary
Rebalanced `/hr/benefits-management` DataTable column widths so the layout is no longer sparse/uneven.

## Category
ui-ux / bugfix

## Packages
- hris-app
- Dual-app: **HR/emp-only (no counterpart)**

## Changes
- `app/components/templates/hr/benefits-management-template.tsx`
  - **Benefit**: flexible primary column (`width: 100%` + truncate) absorbs leftover space
  - **Direction**: fixed `10.5rem` (fits COMPENSATION/DEDUCTION badge)
  - **Tax**: fixed `7.5rem` (fits Non-taxable)
  - **Enrolled**: fixed `7rem` (fits header + icon/count)
  - Actions remains DataTable sticky `132px`

## Truth delta
NO — layout polish only; no domain/API/product truth change.

## Drift
NONE
