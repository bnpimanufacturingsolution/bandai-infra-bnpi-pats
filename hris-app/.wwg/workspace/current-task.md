# Current Task

## Status
done

## Summary
Employee Directory header UX: consolidate filters into one Filters popover; de-emphasize Columns / Export / Import chrome.

## Category
ui-ux

## Packages
- bandai-infra/hris-app
- Dual-app: **HR/emp-only (no counterpart)** for admin configuration employees

## Changes
- `app/components/shared/EmployeeList.tsx`
  - Department + Manager moved into `filterPopoverExtra` (inside Filters)
  - Renamed button label to **Filters**
  - Export title action uses subtle ghost styling
  - Filter badge counts department/manager too
- `app/components/atoms/DataTable.tsx`
  - Columns / Import / Export use subtle ghost toolbar styling
- `app/components/shared/EmployeeList.test.tsx`
  - Expectations updated for in-popover department/manager filters

## Truth delta
NO — layout/chrome polish only

## Drift
NONE
