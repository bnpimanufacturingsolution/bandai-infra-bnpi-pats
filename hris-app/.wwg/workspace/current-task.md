# Current Task

## Status
done

## Summary
Synced SummaryCard minimal white bg (keep themed borders) from standalone hris-app into bandai-infra/hris-app.

## Category
ui-ux

## Packages
- bandai-infra/hris-app
- Dual-app: **HR/emp-only (no counterpart)**
- Source: standalone `hris-app` (already applied)

## Changes
- `app/components/atoms/SummaryCard.tsx` — default colorVariants bg → white; borders unchanged
- `app/components/atoms/SummaryCard.test.tsx` — assert white bg + themed border

## Truth delta
NO — presentation only

## Drift
NONE

## Verification
- `npx vitest run app/components/atoms/SummaryCard.test.tsx` (from bandai-infra/hris-app)
