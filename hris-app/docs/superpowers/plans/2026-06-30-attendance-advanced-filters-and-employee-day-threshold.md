# Attendance Advanced Filters And Employee-Day Threshold Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the attendance `present > 10 days` threshold to the existing advanced filter flow without splitting the attendance page or weakening the current URL-backed filter contract.

**Architecture:** Keep `AttendanceManagement` as the single owner of attendance filter state. Reuse the existing advanced filter popover for manager and employee scope, add a URL-backed boolean threshold flag in the top filter strip, and derive the eligible employee set from attendance rows with a small pure helper. If the current page slice is not enough to count present days correctly, widen the fetch or stop and raise a follow-up before merge.

**Tech Stack:** React, TypeScript, React Router, React Testing Library, Vitest.

---

### Task 1: Add the threshold filter contract to the attendance page

**Files:**
- Modify: `app/components/templates/common/attendance-management-template.tsx`
- Modify: `app/components/templates/common/attendance-management-template.test.tsx`

- [x] **Step 1: Add a URL-backed boolean state for the `presentGt10Days` threshold and include it in the same reset path as the other attendance filters.**

- [x] **Step 2: Render the threshold as a top filter control in the existing attendance filter strip, not inside a separate route or screen.**

- [x] **Step 3: Keep the advanced filter popover focused on manager and employee scope so the filter UI still has one obvious place for org/person filters.**

- [x] **Step 4: Add regression coverage for deep-linking and filter clearing, including a URL like `/hr/attendance?view=list&presentGt10Days=1`.**

- [x] **Step 5: Run the attendance management template test file and confirm the threshold state is visible, serializes to the URL, and clears with the other filters.**

Run: `npm test -- app/components/templates/common/attendance-management-template.test.tsx`
Expected: PASS

### Task 2: Compute the employee-day threshold from attendance rows

**Files:**
- Create: `app/lib/utils/attendance-threshold.ts`
- Test: `app/lib/utils/attendance-threshold.test.ts`
- Modify: `app/components/templates/common/attendance-management-template.tsx`

- [x] **Step 1: Add a pure helper that groups attendance rows by employee and unique date, counts only work-day rows using the existing attendance display bucket rules, and returns the employees whose present-day total is greater than 10.**

- [x] **Step 2: Wire the helper into `AttendanceManagement` so the table uses the thresholded employee set when the toggle is active and falls back to the current behavior when it is off.**

- [x] **Step 3: If the current query payload is only a page slice, widen the fetch or add a dedicated full-range lookup before filtering so the threshold is based on the full selected window, not one page.**

- [x] **Step 4: Add helper coverage for duplicate dates, non-work-day rows, and the `> 10` cutoff so the rule is deterministic.**

- [x] **Step 5: Run the helper test file and confirm the counting rule is stable before touching the page-level assertions.**

Run: `npm test -- app/lib/utils/attendance-threshold.test.ts`
Expected: PASS

### Task 3: Lock the attendance-page regression surface

**Files:**
- Modify: `app/components/templates/common/attendance-management-template.test.tsx`
- Modify: `app/components/templates/common/attendance-management-template.tsx`

- [x] **Step 1: Verify the threshold toggle survives navigation and preserves the current `department`, `section`, `position`, `level`, `manager`, `employee`, `shiftType`, `status`, `search`, `period`, `from`, and `to` params.**

- [x] **Step 2: Add an empty-state test for the case where no employees clear the `present > 10 days` threshold.**

- [x] **Step 3: Confirm the `Clear all filters` action resets the threshold together with the rest of the attendance filter state.**

- [x] **Step 4: Run the attendance page tests again after the page-level assertions are in place.**

Run: `npm test -- app/components/templates/common/attendance-management-template.test.tsx`
Expected: PASS

## Non-Goals

- No new attendance route.
- No redesign of the daily trend chart section.
- No payroll or timesheet source-of-truth changes.
- No backend authorization or persistence changes unless the current app payload proves insufficient for the threshold logic.

## Risks

- If the current attendance detail payload is page-limited, the threshold can undercount employee presence unless the fetch is widened first.
- If threshold state is not serialized consistently, the filter experience will feel broken on reload and shared links.
- If the threshold control is hidden away from the other attendance filters, the UI will fragment again.

## Success Criteria

- The attendance filter strip exposes the new threshold alongside the existing attendance controls.
- The `present > 10 days` filter is shareable through the URL.
- The empty state and row counts remain correct after combining the threshold with date, department, section, position, level, manager, employee, shift type, status, and search filters.
- The plan stays app-side unless evidence forces a wider data contract.
