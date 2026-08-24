# Attendance Filter Unification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move all attendance scope controls to the top filter bar and keep the daily trend chart focused on the chart, title, and date window.

**Architecture:** The attendance management template will own every global attendance filter control, including department, section, position, and level. The trend section will become a pure chart surface that receives the selected period title and visible date-range subtitle from the parent.

**Tech Stack:** React, TypeScript, React Router, React Testing Library, Vitest.

---

### Task 1: Hoist the org filters into the top attendance filter bar

**Files:**
- Modify: `app/components/templates/common/attendance-management-template.tsx`
- Test: `app/components/templates/common/attendance-management-template.test.tsx`

- [ ] **Step 1: Update the top filter layout so it renders department, section, position, and level controls alongside the existing timesheet/date filters.**

- [ ] **Step 2: Remove the chart-section-only filter block so the trend card no longer owns duplicate filters.**

- [ ] **Step 3: Run the attendance-management template test file and confirm the new top-level filter placement is covered.**

### Task 2: Simplify the trend chart section header and lock the new contract

**Files:**
- Modify: `app/components/templates/common/AttendanceDailyTrendSection.tsx`
- Test: `app/components/templates/common/AttendanceDailyTrendSection.test.tsx`

- [ ] **Step 1: Remove the info popover and embedded org-filter popover from the trend card.**

- [ ] **Step 2: Make the chart header show the selected period title and the visible date-range subtitle directly.**

- [ ] **Step 3: Run the trend section test file and confirm the chart still renders, the subtitle is visible, and the filter popover is gone.**

