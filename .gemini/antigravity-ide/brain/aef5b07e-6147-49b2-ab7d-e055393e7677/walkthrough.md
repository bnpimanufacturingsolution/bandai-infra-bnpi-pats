# Walkthrough: Attendance Daily Trend Shift Breakdown & Attendance Roster

We implemented the Shift Breakdown and Shift Attendance features in the Attendance Daily Trend report ([`AttendanceDailyTrendTab.tsx`](file:///c:/uzaro/bandai-infra/bnpi-pats-app/app/routes/hr/reports/tabs/AttendanceDailyTrendTab.tsx)), enabling HR to see shift distributions (e.g., Night Shift: 6:00 PM – 6:00 AM, Day Shift: 6:00 AM – 6:00 PM, Regular Shift: 8:00 AM – 5:00 PM), filter by shift, and view the list of employees present on each shift along with their actual clock-in and clock-out times.

---

## 1. Features Implemented

### 1. Shift View Mode (`chartMode: "shift"`)
- Added a dedicated **"Shift View"** mode in the view switcher alongside Line, Stacked Bars, and Table modes.
- **Shift Overview Cards**:
  - Automatically groups present & scheduled employees into shift buckets (e.g. `Night Shift (6:00 PM - 6:00 AM)`, `Day Shift (6:00 AM - 6:00 PM)`).
  - Displays day/night indicators with moon & sun icons.
  - Highlights Present count & percentage share (`X / Y present - 100%`).
  - Highlights Late, Undertime, and Absent counts for that shift.
  - Interactive click-to-filter: Clicking any shift card immediately filters the roster below to that specific shift.
- **Shift Attendance Roster**:
  - Displays all employees assigned to that shift with:
    - **Employee**: Avatar, Name, Employee Code
    - **Department**: Assigned Department
    - **Assigned Shift**: Shift Name + Time Window (e.g. `Night Shift • 6:00 PM - 6:00 AM`)
    - **Date**: Attendance business date
    - **Status**: Status badge (`PRESENT`, `LATE`, `UNDETIME`, `ABSENT`)
    - **Clock In & Clock Out**: Actual timestamp formatting
    - **Late & Undertime**: Duration tracking
    - **Hours**: Total hours worked

### 2. Shift Filter in Top Filter Toolbar
- Added **Shift Schedule** dropdown filter (`All Shifts`, plus dynamically loaded shift types via `useShiftTypes`) in the top single-line filter toolbar.
- Synchronized with URL search parameters (`shiftType`) and backed by `useAttendanceDailyTrendByDepartment` and `useAttendanceMetricsDetailed`.

### 3. General Table View & Export Upgrades
- Added **Shift Schedule** column to the main employee records table view.
- Added `Shift` and `Shift Schedule` columns to Excel (XLSX), CSV, and PDF report exports.

---

## 2. Verification & Automated Test Results

- Created [`attendance-shift.test.ts`](file:///c:/uzaro/bandai-infra/bnpi-pats-app/app/lib/utils/attendance-shift.test.ts):
  - Verified 12-hour AM/PM formatting, scheduleSnapshot start/end extraction, timeSlot range extraction, and clock-in based night/day shift inference (5/5 passed).
- Updated [`AttendanceDailyTrendTab.test.tsx`](file:///c:/uzaro/bandai-infra/bnpi-pats-app/app/routes/hr/reports/tabs/AttendanceDailyTrendTab.test.tsx):
  - Verified Shift View toggle, shift stat cards, shift roster table, and employee clock-in/out rendering (passed).
- Executed entire reports test suite:
  - **12 Test Files Passed (31 Tests Passed)**:
    - `AttendanceDailyTrendTab.test.tsx`
    - `attendance-shift.test.ts`
    - `ManpowerDistributionTab.test.tsx`
    - `PerfectAttendanceTab.test.tsx`
    - `TardinessUndetimeTab.test.tsx`
    - `OvertimeTab.test.tsx`
    - `workforce.test.tsx`
    - `ReportScopeDateFilters.test.tsx`
    - `ReportExportDialog.test.tsx`
    - and more.
