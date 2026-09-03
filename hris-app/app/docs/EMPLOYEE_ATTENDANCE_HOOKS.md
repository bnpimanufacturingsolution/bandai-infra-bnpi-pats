# Employee Attendance Hooks Documentation

This document provides comprehensive documentation for the employee-specific attendance hooks and service.

## Overview

The employee attendance system provides hooks and services for managing individual employee attendance records. It supports clock in/out functionality, attendance record management, and querying with filtering and pagination.

## Service

### `employee-attendance.service.ts`

The service provides methods for all employee-specific attendance operations:

#### Methods

- `markAttendance(employeeId, data)` - Mark attendance (clock in/out)
- `getEmployeeAttendance(employeeId, params)` - Get employee's attendance records with filtering
- `getTodayAttendance(employeeId)` - Get today's attendance status
- `getAttendanceRecord(employeeId, attendanceId)` - Get specific attendance record
- `updateAttendanceRecord(employeeId, attendanceId, data)` - Update attendance record
- `deleteAttendanceRecord(employeeId, attendanceId)` - Delete attendance record
- `clockIn(employeeId, location?, notes?)` - Clock in convenience method
- `clockOut(employeeId, location?, notes?)` - Clock out convenience method

## Hooks

### Query Hooks

#### `useEmployeeAttendance(employeeId, params?)`

Fetches employee's attendance records with optional filtering and pagination.

**Parameters:**

- `employeeId: string` - Employee ID
- `params?: EmployeeAttendanceQueryParams` - Query parameters

**Returns:**

- `attendance: EmployeeAttendanceResponse | undefined` - Attendance data
- `loading: boolean` - Loading state
- `error: Error | null` - Error state
- `refetch: () => void` - Refetch function

**Example:**

```tsx
const { attendance, loading, error, refetch } = useEmployeeAttendance("emp-123", {
	dateFrom: "2024-01-01",
	dateTo: "2024-01-31",
	page: 1,
	limit: 10,
	order: "desc",
	sort: "createdAt",
});
```

#### `useTodayAttendance(employeeId)`

Fetches today's attendance status for an employee.

**Parameters:**

- `employeeId: string` - Employee ID

**Returns:**

- `todayAttendance: EmployeeAttendanceRecord | null | undefined` - Today's attendance
- `loading: boolean` - Loading state
- `error: Error | null` - Error state
- `refetch: () => void` - Refetch function

**Example:**

```tsx
const { todayAttendance, loading, error, refetch } = useTodayAttendance("emp-123");
```

#### `useAttendanceRecord(employeeId, attendanceId)`

Fetches a specific attendance record.

**Parameters:**

- `employeeId: string` - Employee ID
- `attendanceId: string` - Attendance record ID

**Returns:**

- `attendanceRecord: EmployeeAttendanceRecord | undefined` - Specific attendance record
- `loading: boolean` - Loading state
- `error: Error | null` - Error state
- `refetch: () => void` - Refetch function

**Example:**

```tsx
const { attendanceRecord, loading, error } = useAttendanceRecord("emp-123", "att-456");
```

### Mutation Hooks

#### `useClockIn()`

Clock in for an employee.

**Returns:**

- `clockIn: (params) => void` - Clock in function
- `loading: boolean` - Loading state
- `error: Error | null` - Error state

**Parameters for clockIn:**

- `employeeId: string` - Employee ID
- `location?: { lat: number; lng: number }` - Optional location
- `notes?: string` - Optional notes

**Example:**

```tsx
const { clockIn, loading, error } = useClockIn();

const handleClockIn = () => {
	clockIn({
		employeeId: "emp-123",
		location: { lat: 14.5995, lng: 120.9842 },
		notes: "Clock in from office",
	});
};
```

#### `useClockOut()`

Clock out for an employee.

**Returns:**

- `clockOut: (params) => void` - Clock out function
- `loading: boolean` - Loading state
- `error: Error | null` - Error state

**Parameters for clockOut:**

- `employeeId: string` - Employee ID
- `location?: { lat: number; lng: number }` - Optional location
- `notes?: string` - Optional notes

**Example:**

```tsx
const { clockOut, loading, error } = useClockOut();

const handleClockOut = () => {
	clockOut({
		employeeId: "emp-123",
		location: { lat: 14.5995, lng: 120.9842 },
		notes: "Clock out from office",
	});
};
```

#### `useMarkAttendance()`

Mark attendance with custom data.

**Returns:**

- `markAttendance: (params) => void` - Mark attendance function
- `loading: boolean` - Loading state
- `error: Error | null` - Error state

**Parameters for markAttendance:**

- `employeeId: string` - Employee ID
- `data: MarkAttendanceRequest` - Attendance data

**Example:**

```tsx
const { markAttendance, loading, error } = useMarkAttendance();

const handleMarkAttendance = () => {
	markAttendance({
		employeeId: "emp-123",
		data: {
			clockInTime: new Date().toISOString(),
			location: { lat: 14.5995, lng: 120.9842 },
			notes: "Manual attendance entry",
		},
	});
};
```

#### `useUpdateAttendanceRecord()`

Update an existing attendance record.

**Returns:**

- `updateAttendanceRecord: (params) => void` - Update function
- `loading: boolean` - Loading state
- `error: Error | null` - Error state

**Parameters for updateAttendanceRecord:**

- `employeeId: string` - Employee ID
- `attendanceId: string` - Attendance record ID
- `data: UpdateAttendanceRequest` - Update data

**Example:**

```tsx
const { updateAttendanceRecord, loading, error } = useUpdateAttendanceRecord();

const handleUpdate = () => {
	updateAttendanceRecord({
		employeeId: "emp-123",
		attendanceId: "att-456",
		data: {
			status: "present",
			notes: "Updated attendance record",
		},
	});
};
```

#### `useDeleteAttendanceRecord()`

Delete an attendance record.

**Returns:**

- `deleteAttendanceRecord: (params) => void` - Delete function
- `loading: boolean` - Loading state
- `error: Error | null` - Error state

**Parameters for deleteAttendanceRecord:**

- `employeeId: string` - Employee ID
- `attendanceId: string` - Attendance record ID

**Example:**

```tsx
const { deleteAttendanceRecord, loading, error } = useDeleteAttendanceRecord();

const handleDelete = () => {
	deleteAttendanceRecord({
		employeeId: "emp-123",
		attendanceId: "att-456",
	});
};
```

## Types

### `EmployeeAttendanceRecord`

```typescript
interface EmployeeAttendanceRecord {
	id: string;
	employeeId: string;
	clockInTime?: string;
	clockOutTime?: string;
	date: string;
	status: "present" | "absent" | "late" | "half-day";
	location?: {
		lat: number;
		lng: number;
	};
	notes?: string;
	createdAt: string;
	updatedAt: string;
}
```

### `EmployeeAttendanceResponse`

```typescript
interface EmployeeAttendanceResponse {
	data: EmployeeAttendanceRecord[] | { attendance: EmployeeAttendanceRecord[] };
	pagination?: {
		total: number;
		page: number;
		limit: number;
	};
}
```

### `EmployeeAttendanceQueryParams`

```typescript
interface EmployeeAttendanceQueryParams extends ApiQueryParams {
	dateFrom?: string;
	dateTo?: string;
}
```

### `MarkAttendanceRequest`

```typescript
interface MarkAttendanceRequest {
	clockInTime?: string;
	clockOutTime?: string;
	location?: {
		lat: number;
		lng: number;
	};
	notes?: string;
}
```

### `UpdateAttendanceRequest`

```typescript
interface UpdateAttendanceRequest {
	clockInTime?: string;
	clockOutTime?: string;
	status?: "present" | "absent" | "late" | "half-day";
	location?: {
		lat: number;
		lng: number;
	};
	notes?: string;
}
```

## API Endpoints

The service connects to the following API endpoints:

- `POST /employee/:id/attendance` - Mark attendance (clock in/out)
- `GET /employee/:id/attendance` - Get employee's attendance records
- `GET /employee/:id/attendance/today` - Get today's attendance status
- `GET /employee/:id/attendance/:attendanceId` - Get specific attendance record
- `PATCH /employee/:id/attendance/:attendanceId` - Update attendance record
- `DELETE /employee/:id/attendance/:attendanceId` - Delete attendance record

### Query Parameters for GET /employee/:id/attendance

- `dateFrom=2024-01-01` - Start date filter
- `dateTo=2024-01-31` - End date filter
- `page=1` - Page number
- `limit=10` - Records per page
- `order=desc` - Sort order (asc/desc)
- `sort=createdAt` - Sort field

## Usage Examples

### Basic Clock In/Out

```tsx
import { useClockIn, useClockOut, useTodayAttendance } from "~/hooks/enhanced";

function AttendanceWidget({ employeeId }: { employeeId: string }) {
	const { clockIn, loading: clockInLoading } = useClockIn();
	const { clockOut, loading: clockOutLoading } = useClockOut();
	const { todayAttendance, refetch } = useTodayAttendance(employeeId);

	const handleClockIn = () => {
		clockIn({
			employeeId,
			location: { lat: 14.5995, lng: 120.9842 },
			notes: "Clock in from office",
		});
	};

	const handleClockOut = () => {
		clockOut({
			employeeId,
			location: { lat: 14.5995, lng: 120.9842 },
			notes: "Clock out from office",
		});
	};

	return (
		<div>
			<h3>Today's Attendance</h3>
			{todayAttendance ? (
				<div>
					<p>Status: {todayAttendance.status}</p>
					<p>Clock In: {todayAttendance.clockInTime || "Not clocked in"}</p>
					<p>Clock Out: {todayAttendance.clockOutTime || "Not clocked out"}</p>
				</div>
			) : (
				<p>No attendance record for today</p>
			)}

			<button onClick={handleClockIn} disabled={clockInLoading}>
				Clock In
			</button>
			<button onClick={handleClockOut} disabled={clockOutLoading}>
				Clock Out
			</button>
		</div>
	);
}
```

### Attendance Records with Pagination

```tsx
import { useEmployeeAttendance } from "~/hooks/enhanced";
import { useState } from "react";

function AttendanceHistory({ employeeId }: { employeeId: string }) {
	const [page, setPage] = useState(1);
	const [dateFrom, setDateFrom] = useState("2024-01-01");
	const [dateTo, setDateTo] = useState("2024-01-31");

	const { attendance, loading, refetch } = useEmployeeAttendance(employeeId, {
		dateFrom,
		dateTo,
		page,
		limit: 10,
		order: "desc",
		sort: "createdAt",
	});

	return (
		<div>
			<div>
				<input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
				<input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
				<button onClick={() => refetch()}>Filter</button>
			</div>

			{loading ? (
				<p>Loading...</p>
			) : (
				<div>
					{attendance?.data && Array.isArray(attendance.data) ? (
						attendance.data.map((record) => (
							<div key={record.id}>
								<p>Date: {record.date}</p>
								<p>Status: {record.status}</p>
								<p>Clock In: {record.clockInTime || "N/A"}</p>
								<p>Clock Out: {record.clockOutTime || "N/A"}</p>
							</div>
						))
					) : (
						<p>No records found</p>
					)}

					{attendance?.pagination && (
						<div>
							<button onClick={() => setPage(page - 1)} disabled={page === 1}>
								Previous
							</button>
							<span>
								Page {page} of{" "}
								{Math.ceil(
									attendance.pagination.total / attendance.pagination.limit,
								)}
							</span>
							<button
								onClick={() => setPage(page + 1)}
								disabled={
									page >=
									Math.ceil(
										attendance.pagination.total / attendance.pagination.limit,
									)
								}>
								Next
							</button>
						</div>
					)}
				</div>
			)}
		</div>
	);
}
```

## Error Handling

All hooks include built-in error handling and will show notifications using the notification context. Errors are also available in the hook return values for custom error handling.

## Caching and Invalidation

The hooks use React Query for caching and automatic invalidation. When mutations are performed, related queries are automatically invalidated to ensure data consistency.

## Dependencies

- `@tanstack/react-query` - For data fetching and caching
- `~/contexts/enhanced/NotificationContext` - For notifications
- `~/services/employee-attendance.service` - For API calls
