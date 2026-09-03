# Attendance Fix UI/UX Redesign Brief

Status: ACTIVE_DRAFT
Last reviewed: 2026-06-26
Task mode: docs-only / design planning
Delivery mode: AI-agent

## 1. Current-State Critique

The current "Fix Attendance" flow successfully separates the backfill and correction business logic, but the UI feels like a generic database CRUD tool rather than a premium, purpose-built HR application. 

**Specific issues identified:**
- **Layout & Hierarchy:** The form is presented as a standard two-column grid inside a modal. It lacks a clear visual hierarchy between the "context" (who and when) and the "action" (what is being changed).
- **Copy & State Communication:** The UI heavily relies on dense, technical explanation banners (e.g., "Attendance ledger behavior", "Created Ledger Result", "Superseded"). This reads like developer-speak rather than intuitive HR guidance.
- **Affordances:** The "Status" field uses a basic dropdown. Since changing the status fundamentally alters the form (hides/shows time inputs), a standard select doesn't provide a strong enough affordance for this mode switch.
- **Context Loss:** Triggering the fix from the main attendance page navigates the user to a separate `/hr/time-corrections` route just to pop open the modal, breaking the user's visual context of the timesheet they were reviewing.
- **Visual Tone:** The use of bright orange and emerald alert boxes makes the interface visually noisy and stressful, rather than projecting the calm, trustworthy tone expected of an HR system handling sensitive payroll-adjacent data.

## 2. Redesign Approaches

### Direction 1: The Contextual Side-Panel (Drawer)
- **Concept:** Move the UI out of a centered modal and into a right-aligned sliding panel (Sheet). 
- **Pros:** Keeps the main attendance data table visible in the background for reference. Feels like a modern, professional "tool" rather than a disruptive pop-up.
- **Cons:** Requires introducing a new Drawer/Sheet component if not already standard in the design system.

### Direction 2: The "Before & After" Repair Station (Full Page)
- **Concept:** A dedicated, focused full-page view where the left column shows the original attendance context and the right column contains the repair tools.
- **Pros:** Maximum focus and space for complex corrections and historical audit trails.
- **Cons:** Too heavy for quick, simple fixes. Breaks the fast, inline workflow.

### Direction 3: Elevated Task Modal (Recommended)
- **Concept:** Retain the modal pattern but elevate its internal design to feel like a specialized "repair wizard." Extract it into a standalone component so it can be opened directly on the Attendance Management page without routing away. Use large, selectable cards for the status, and replace technical banners with clean, human-readable headers and "Before/After" visual comparisons.
- **Pros:** Fits perfectly into the existing component ecosystem (`<Modal>`), minimizes context switching, and directly addresses the generic CRUD feel by introducing purpose-built UI elements.

## 3. Recommended Direction: Elevated Task Modal

We will proceed with **Direction 3: Elevated Task Modal**. It offers the best balance of UX improvement and implementation safety, reusing the existing `<Modal>` foundation while completely overhauling the internal layout to feel HR-grade, intentional, and trustworthy.

## 4. Implementation-Ready Design Brief

### Entry Point & Context
- **Action:** The "Fix Attendance" button on the Attendance Management page will now open the modal **in place**, without navigating to `/hr/time-corrections`. (The Corrections page will remain as a read-only history/log).
- **Benefit:** HR users keep their visual anchor on the main attendance list.

### Modal Header & Mode Distinction
Remove the dense technical banners. The modal header will clearly establish the mode based on the data:
- **Missing Row:** Title: "Create Missing Attendance". Subtitle: "Record an attendance entry for a day with no existing data."
- **Existing Row:** Title: "Correct Attendance". Subtitle: "Update an existing attendance record. The original entry will be preserved in history."

### Form Grouping & Hierarchy
The modal will be divided into three distinct visual sections:

**Section A: The Subject (Read-only Context)**
- A subtle, gray-tinted summary block at the top showing the Employee Name, ID, Date, and Original Status/Times (if correcting).

**Section B: The Action (Interactive)**
- **Status Selection:** Replace the dropdown with a segmented control or a grid of selectable, icon-backed cards:
  - `[ 🏢 Work Day ]` (Present / Incomplete)
  - `[ 🌴 Leave ]`
  - `[ ❌ Absent / Rest Day ]`
- **Time Window (Conditional):** If a "Work Day" status is selected, slide in a dedicated "Time Window" card containing the Time In and Time Out pickers side-by-side.

**Section C: The Justification (Required)**
- **Reason & Notes:** Grouped together in a distinct block. The Reason dropdown remains, but the Notes textarea is expanded with placeholder text prompting for the required explanation ("e.g., Employee forgot to clock out after the client meeting...").

### Critical States
- **Empty / Prefilled:** Time inputs default to empty for Backfills, and pre-fill with original times for Corrections. 
- **Validation Error:** Inline red text below the specific field, plus a subtle red outline on the input. Remove the generic "Form error" block unless it's a network failure.
- **Locked Period Exception:** If the period is payroll-locked, the entire "Action" and "Justification" sections are hidden. They are replaced by a centered, locked-state illustration/icon and a message: *"This attendance date is locked for payroll processing. Direct edits are disabled."* Below it, a single primary button: **"Create Time Adjustment Request"**.
- **Submit Loading:** The submit button transitions to a spinner, and all inputs become disabled.
- **Success:** The modal closes automatically, and a toast notification confirms the action (e.g., "Attendance correction applied successfully.").

### Visual Tone
- **Spacing:** Increase padding between form sections. Use whitespace instead of borders to separate logical blocks.
- **Color:** Tone down the use of large colored backgrounds (emerald/orange). Use color only for small badges (e.g., status pills) and the primary submit button.
- **Typography:** Use heavier font weights (Semibold) for section labels and employee names to establish a clear reading hierarchy.

## 5. Suggested File-Level Implementation Plan (Next Pass)

### [NEW] `app/components/organisms/hr/AttendanceFixModal.tsx`
- Extract the form logic from `time-corrections.tsx` into a standalone, reusable modal component.
- Implement the new UI layout (Cards for status, Before/After visual, Locked state handling).
- Retain the exact same mutation hooks (`useCreateAttendanceCorrection`, `useCreateAttendanceBackfill`) and validation rules.

### [MODIFY] `app/routes/hr/time-corrections.tsx`
- Remove the inline modal and form logic.
- Keep this route strictly as the read-only history/log of past corrections (the data table).

### [MODIFY] `app/components/templates/common/attendance-management-template.tsx`
- Import and render `<AttendanceFixModal />` within this template.
- Update the "Fix Attendance" row action to open this local modal and pass the selected record data via React state, rather than navigating via `useNavigate` and URL search params.

### [NEW] `app/components/molecules/StatusSelectCards.tsx` (Optional but recommended)
- A small, reusable UI component for the grid of selectable status cards to replace the generic dropdown, using the Phase 1 design tokens.
