# Workforce Manpower Databank Design

**Date:** 2026-06-30

**Ticket:** `Workforce: manpower databank and per-position lists`

## Summary

Extend the existing HR workforce report instead of creating a new route. Add a `Manpower Databank` section inside the live `Manpower Distribution` report that groups active manpower by position and lets HR drill into filtered employee lists by position, department, section, workforce source, and employment type.

This keeps the feature aligned with the current workforce report shell, reuses the existing employee-directory drilldown contract, and avoids fragmenting headcount reporting across multiple screens.

## Current Context

The current workforce report already has a stable home at `/hr/reports/workforce` with two live tabs: `Agency Attendance` and `Manpower Distribution`. The `Manpower Distribution` tab already:

- loads the active employee roster through `useEmployees`
- derives active manpower totals from `ACTIVE`, `ONBOARDING`, and `ON_LEAVE`
- renders summary cards and grouped report tables
- links report totals back into `/hr/employees` through URL-backed drilldown filters

The employee directory already supports URL and API filtering for:

- `departmentId`
- `sectionId`
- `positionId`
- `levelId`
- `gender`
- `workforceSource`
- `agency`
- `statusScope=active-manpower`

The current manpower drilldown helper uses `agencyName` as its input property but emits the employee-directory URL parameter `agency`. For this feature, the drilldown contract should end up using one consistent name in code and tests.

The biggest gap for this ticket is that the manpower drilldown helper does not yet carry `positionId` or `employmentType`, even though the employee model already exposes both.

## Goals

- Add a manpower databank view as an extension of the existing `Manpower Distribution` report.
- Provide position-level workforce summaries that open filtered employee lists.
- Support drilldown dimensions for `position`, `department`, `section`, and `employment type`.
- Keep counts aligned with the same active-manpower population used by the current workforce report.
- Preserve the current report/export/report-to-directory workflow instead of inventing a separate navigation model.

## Non-Goals

- No new standalone workforce route for the first ship.
- No workforce taxonomy redesign.
- No vacancy, requisition, or target-headcount comparison in this card.
- No absorption of the separate ready item `Workforce: classify direct/agency and direct/indirect labor`.
- No backend persistence, schema change, or new API endpoint for the first ship.

## Assumptions To Lock

- `Employment type` in this ticket maps to the existing employee field `employmentType` with current values such as `REGULAR`, `PROBATIONARY`, `CONTRACTUAL`, `PART_TIME`, `CONSULTANT`, and `INTERN`.
- The first ship is roster-focused. It shows current filled manpower by position, not recruitment demand, vacancy, or approved headcount targets.
- The employee directory remains the destination for row-level review; the report should summarize and link, not duplicate the full directory table.

## Approaches Considered

### 1. Extend the live `Manpower Distribution` tab with new databank sections

Add one or more new sections below the current summary tables and reuse the existing drilldown pattern into `/hr/employees`.

**Pros**

- Lowest navigation cost for HR
- Reuses the current active-manpower logic and export flow
- Keeps one reporting surface for headcount review
- Smallest app-only change set

**Cons**

- The current tab grows taller and needs careful section ordering
- Export config becomes broader

### 2. Add a third tab under the existing workforce page for `Manpower Databank`

Keep the same route shell but split the databank into its own sibling tab.

**Pros**

- Cleaner visual separation
- Easier to expand later with more databank-specific controls

**Cons**

- Adds one more navigation decision for users
- Duplicates some filter/report framing already present in `Manpower Distribution`
- Not necessary for the first ship

### 3. Build a new dedicated workforce route

Create a separate screen outside the current workforce report page.

**Pros**

- Maximum layout freedom

**Cons**

- Splits related reporting across multiple pages
- Duplicates report shell behavior
- Highest implementation and regression cost

## Recommended Approach

Use approach 1.

Add a `Manpower Databank` section to the current `Manpower Distribution` tab, and make it position-first. The existing report already behaves like a headcount control center, so the databank should feel like a deeper layer of that same report rather than a parallel feature.

## Proposed UX

The existing `Monthly Manpower Distribution` card remains the container.

Below the current sections, add:

### 1. Position Summary

One row per position with:

- `Position`
- `Headcount`
- `Direct`
- `Agency`
- `Departments`
- `Sections`
- `Employment type mix`

Behavior:

- The position name links to `/hr/employees` filtered by `statusScope=active-manpower` and that `positionId`.
- Headcount links to the same position-scoped list.
- Direct and Agency cells further refine by `workforceSource`.
- Departments and Sections render counts only in v1. They do not become conditional links.
- `Employment type mix` renders compact summary text only in v1: show the top two employment types with counts, then `+N more` if additional types exist. Example: `Regular 5, Probationary 3, +1 more`.
- `Employment type mix` is not a per-cell link in the first ship. Employment-type drilldown is owned by the dedicated `Employment Type Summary` section.

### 2. Employment Type Summary

Compact summary rows for the active manpower pool by `employmentType`.

Behavior:

- Each row links to `/hr/employees` filtered by `statusScope=active-manpower` and `employmentType`.
- This gives HR a quick databank slice for regular, probationary, contractual, part-time, and similar categories without making the position table too wide.

### 3. Empty-State Rules

- If there are no active manpower rows, show a databank-specific empty message under the section header.
- If a position exists in the roster but has zero active employees after active-manpower filtering, it should not render as a visible row in the first ship.
- If active employees exist without a position assignment, render a visible `Unassigned position` row so headcount is not understated. In v1, that row is plain text only and does not deep-link unless explicit null-position drilldown is implemented as part of the same helper contract.

## Data Model And Aggregation Rules

Primary source:

- current active employee roster from `useEmployees`

Query strategy:

- reuse the same full-roster query pattern already used by `ManpowerDistributionTab`, which calls `useEmployees({ limit: 10000 })`
- do not aggregate from a paginated employee-directory slice
- the databank must share the existing full-roster dataset instead of introducing a second paginated grouping query

Population rule:

- use the same active-manpower statuses already used by `Manpower Distribution`
- `ACTIVE`
- `ONBOARDING`
- `ON_LEAVE`

Grouping rule:

- group rows by `position.id`, falling back to `positionId`, then a display-safe `Unassigned position` bucket when missing

Per-position derived values:

- total headcount
- direct headcount
- agency headcount
- unique department count
- unique section count
- employment type counts

Employment type summary rule:

- aggregate across the same active-manpower pool
- do not recalculate from a different query or a recruitment-only dataset

## Drilldown Contract

Extend the current manpower drilldown helper so report links can include:

- `positionId`
- `employmentType`

Continue using:

- `statusScope=active-manpower`
- `departmentId`
- `sectionId`
- `workforceSource`
- `agency`
- `gender`

Implementation note:

- normalize the helper interface to use `agency` consistently instead of a mixed `agencyName` input and `agency` URL output

The employee directory should remain the drilldown target. The report owns grouping and summary; the directory owns row-level browsing.

## Export Behavior

Keep the current report export modal and extend the exported workbook/config rather than adding a second export action.

For first ship:

- add a `Position Summary` sheet to the workforce export
- add an `Employment Type Summary` sheet
- keep CSV/PDF behavior aligned with the visible report sections where practical

No separate databank export screen is needed.

## Testing Strategy

### App Unit And Integration Coverage

- drilldown helper tests in `app/lib/utils/manpower-distribution-links.test.ts` for `positionId`, `employmentType`, and the normalized `agency` contract
- a new pure aggregation test file, recommended as `app/lib/utils/manpower-databank.test.ts`, for:
  - position grouping
  - direct vs agency counts within a position
  - employment-type summary counts
  - unassigned-position behavior
- employee directory tests in `app/components/shared/EmployeeList.test.tsx` proving databank deep links survive URL parsing and filter serialization
- workforce report rendering tests in `app/routes/hr/reports/tabs/ManpowerDistributionTab.test.tsx` or `app/routes/hr/reports/tabs/ManpowerDatabankSection.test.tsx` for:
  - empty-state rendering
  - drill link generation

### Validation Gates

- targeted Vitest for helper and report tests
- targeted `EmployeeList` regression tests
- `npm run typecheck`
- `npm run quality:ci`

## Risks And Checks

### 1. Employment Type Filter Contract

Confirmed: the sibling API query builder accepts enum filtering through the generic filter contract, and the employee controller already routes `filter` through `buildFilterConditions("Employee", filter)`. `employmentType:<value>` is therefore an app-usable filter contract, not an open backend risk.

### 2. Scope Creep Into Other Workforce Cards

This card must not absorb:

- labor-classification normalization
- manager multi-section coverage
- recruitment target/vacancy comparison

Those are separate concerns and should stay on their own tickets.

### 3. Report Width And File Size

The position table can become too wide if department, section, and employment type are all expanded inline. The first ship should keep employment-type detail compact and use drilldown links instead of building a giant matrix.

`ManpowerDistributionTab.tsx` is already large, so the databank should be extracted into focused child units instead of adding another long inline block. Preferred decomposition:

- `app/lib/utils/manpower-databank.ts` for aggregation helpers
- `app/routes/hr/reports/tabs/ManpowerDatabankSection.tsx` for the rendered databank UI
- keep `ManpowerDistributionTab.tsx` as the container that composes the existing sections and the new databank section

## Acceptance Criteria

- HR can open the existing workforce report and review a new `Manpower Databank` section without leaving the current route.
- HR can see active manpower grouped by position.
- HR can open filtered employee lists from position, workforce-source, and employment-type cells.
- Databank counts match the same active-manpower population already used by the workforce report.
- Export output includes the new databank summaries.
- Empty states and zero-count behavior are covered by regression tests.

## Delivery Shape

Planned implementation passes:

1. Drilldown contract and full-roster query pass
2. Databank aggregation and extracted UI-section pass
3. Export, regression, and validation pass

This is expected to stay app-owned.
