# Manager Attendance Approval Feature

## Overview

This feature allows managers to review and approve their team members' weekly attendance records before they are processed by HR. Managers can verify the accuracy of clock-in/out times, hours worked, and attendance status for each employee.

## Key Features

### 1. Weekly Attendance Review

- **Week Navigation**: Managers can navigate between different weeks to review historical or current attendance records
- **Current Week Default**: The system defaults to showing the current week's attendance
- **Week-at-a-Glance**: View all team members' attendance for a selected week in a single view

### 2. Approval Workflow

The attendance approval follows this workflow:

1. **Pending Approval** - New attendance records submitted by employees
2. **Approved** - Manager has verified and approved the attendance
3. **Rejected** - Manager has rejected the attendance (requires reason)
4. **Pending HR Review** - Approved by manager, awaiting HR final processing

### 3. Detailed Attendance View

Managers can view detailed information for each employee's weekly attendance:

- Daily clock-in and clock-out times
- Hours worked per day
- Total hours for the week
- Attendance status (Present, Late, Absent, Sick, Overtime)
- Location and device information
- Employee notes and explanations
- Summary statistics (total days, present days, late days, absent days)

### 4. Approval Actions

- **Quick Approve**: Approve entire week with one click from the main table
- **View Details**: See detailed daily breakdown before approving
- **Reject with Reason**: Reject attendance records with mandatory reason
- **Bulk Actions**: Approve or reject multiple employees' attendance

## Components

### AttendanceApprovalsSection

**Location**: `app/components/molecules/employee/AttendanceApprovalsSection.tsx`

Main component for the attendance approval interface.

**Features**:

- Week navigation with current/past week selection
- Summary cards showing team metrics
- DataTable with searchable/filterable attendance records
- Approve/Reject actions
- Integration with detail modal

**Props**:

```typescript
interface AttendanceApprovalsSectionProps {
	onApprove?: (employeeId: string, weekStart: string, weekEnd: string) => void;
	onReject?: (employeeId: string, weekStart: string, weekEnd: string, reason: string) => void;
	onViewDetails?: (employeeId: string, weekStart: string, weekEnd: string) => void;
}
```

### AttendanceDetailModal

**Location**: `app/components/molecules/employee/AttendanceDetailModal.tsx`

Modal component for viewing detailed daily attendance records.

**Features**:

- Employee information header
- Week summary statistics
- Daily attendance cards with full details
- Approve/Reject actions from modal
- Responsive design

**Props**:

```typescript
interface AttendanceDetailModalProps {
	isOpen: boolean;
	onClose: () => void;
	employeeName: string;
	employeeId: string;
	department: string;
	weekStartDate: string;
	weekEndDate: string;
	records: AttendanceRecord[];
	onApprove?: () => void;
	onReject?: () => void;
}
```

## Types

### WeeklyAttendanceApproval

**Location**: `app/types/attendance.ts`

```typescript
export interface WeeklyAttendanceApproval {
	employeeId: string;
	employeeName: string;
	department: string;
	weekStartDate: string;
	weekEndDate: string;
	records: AttendanceRecord[];
	totalHours: number;
	totalDays: number;
	presentDays: number;
	lateDays: number;
	absentDays: number;
	approvalStatus: AttendanceApprovalStatus;
}
```

### AttendanceApprovalStatus

```typescript
export type AttendanceApprovalStatus =
	| "pending_approval"
	| "approved"
	| "rejected"
	| "pending_hr_review";
```

### AttendanceRecord (Enhanced)

```typescript
export interface AttendanceRecord {
	id: string;
	employeeId: string;
	employeeName?: string;
	date: string;
	clockIn?: string;
	clockOut?: string;
	hoursWorked: number;
	status: AttendanceStatus;
	location?: string;
	device?: string;
	notes?: string;
	approvedBy?: string;
	approvedAt?: string;
	approvalStatus?: AttendanceApprovalStatus;
	managerNotes?: string;
}
```

## Services

### AttendanceService (Enhanced)

**Location**: `app/services/attendance.service.ts`

New methods added:

```typescript
// Get weekly attendance for team members
async getTeamWeeklyAttendance(params?: {
  managerId?: string;
  weekStartDate?: string;
  weekEndDate?: string;
  approvalStatus?: string;
}): Promise<ApiResponse<any[]>>

// Approve weekly attendance for an employee
async approveWeeklyAttendance(
  employeeId: string,
  weekStartDate: string,
  weekEndDate: string,
  notes?: string,
): Promise<ApiResponse<any>>

// Reject weekly attendance for an employee
async rejectWeeklyAttendance(
  employeeId: string,
  weekStartDate: string,
  weekEndDate: string,
  reason: string,
): Promise<ApiResponse<any>>

// Approve individual attendance record
async approveAttendanceRecord(
  recordId: string,
  notes?: string,
): Promise<ApiResponse<AttendanceRecord>>

// Reject individual attendance record
async rejectAttendanceRecord(
  recordId: string,
  reason: string,
): Promise<ApiResponse<AttendanceRecord>>
```

## Hooks

### useTeamAttendance

**Location**: `app/lib/hooks/useTeamAttendance.ts`

Custom hooks for managing team attendance:

```typescript
// Fetch team attendance data
useTeamAttendance(managerId?: string, weekStartDate?: string, weekEndDate?: string)

// Approve weekly attendance
useApproveWeeklyAttendance()

// Reject weekly attendance
useRejectWeeklyAttendance()

// Approve individual record
useApproveAttendanceRecord()

// Reject individual record
useRejectAttendanceRecord()
```

## Integration

### Manager Approvals Tab

**Location**: `app/routes/employee/approvals/HRApprovalsTab.tsx`

The attendance approval feature is integrated into the Manager's HR Approvals tab with two sections:

1. **Attendance Approvals** - New section for weekly attendance review
2. **Leave & Other Requests** - Existing section for other HR approvals

Users can switch between sections using tab navigation.

## Usage Example

```typescript
import AttendanceApprovalsSection from "~/components/molecules/employee/AttendanceApprovalsSection";

function MyComponent() {
  const handleApprove = (employeeId: string, weekStart: string, weekEnd: string) => {
    // API call to approve attendance
    console.log(`Approving attendance for ${employeeId}`);
  };

  const handleReject = (
    employeeId: string,
    weekStart: string,
    weekEnd: string,
    reason: string
  ) => {
    // API call to reject attendance
    console.log(`Rejecting attendance for ${employeeId}: ${reason}`);
  };

  return (
    <AttendanceApprovalsSection
      onApprove={handleApprove}
      onReject={handleReject}
    />
  );
}
```

## API Endpoints (Backend Requirements)

The following endpoints need to be implemented on the backend:

### GET `/attendance/team/weekly`

Get weekly attendance for team members managed by the current user.

**Query Parameters**:

- `managerId` (optional): Filter by manager ID
- `weekStartDate` (optional): Start date of the week
- `weekEndDate` (optional): End date of the week
- `approvalStatus` (optional): Filter by approval status

**Response**:

```json
{
  "success": true,
  "data": [
    {
      "employeeId": "EMP001",
      "employeeName": "John Doe",
      "department": "Engineering",
      "weekStartDate": "2024-02-12",
      "weekEndDate": "2024-02-18",
      "totalHours": 42.5,
      "totalDays": 5,
      "presentDays": 5,
      "lateDays": 0,
      "absentDays": 0,
      "approvalStatus": "pending_approval",
      "records": [...]
    }
  ]
}
```

### POST `/attendance/approve/weekly`

Approve weekly attendance for an employee.

**Request Body**:

```json
{
	"employeeId": "EMP001",
	"weekStartDate": "2024-02-12",
	"weekEndDate": "2024-02-18",
	"notes": "Approved - all records accurate"
}
```

### POST `/attendance/reject/weekly`

Reject weekly attendance for an employee.

**Request Body**:

```json
{
	"employeeId": "EMP001",
	"weekStartDate": "2024-02-12",
	"weekEndDate": "2024-02-18",
	"reason": "Multiple clock-in/out discrepancies"
}
```

### POST `/attendance/approve/:recordId`

Approve individual attendance record.

**Request Body**:

```json
{
	"notes": "Approved"
}
```

### POST `/attendance/reject/:recordId`

Reject individual attendance record.

**Request Body**:

```json
{
	"reason": "Clock-in time incorrect"
}
```

## Benefits

1. **Accuracy**: Ensures attendance records are verified before HR processing
2. **Transparency**: Employees know their attendance has been reviewed by their manager
3. **Accountability**: Creates an audit trail of who approved attendance and when
4. **Efficiency**: Reduces errors in payroll processing by catching discrepancies early
5. **Communication**: Rejection reasons provide feedback to employees
6. **Week-by-Week Review**: Managers can review attendance on a weekly basis, matching typical work cycles

## Future Enhancements

1. **Notifications**: Notify managers when attendance is ready for approval
2. **Bulk Approvals**: Approve all pending attendance with one action
3. **Comparison View**: Compare current week with previous weeks
4. **Anomaly Detection**: Highlight unusual patterns (excessive overtime, frequent late arrivals)
5. **Export Reports**: Export attendance reports for specific periods
6. **Mobile Support**: Mobile-optimized view for managers on the go
7. **Comments**: Allow managers to add comments to individual records
8. **Auto-Approval Rules**: Set rules for automatic approval of certain attendance patterns
