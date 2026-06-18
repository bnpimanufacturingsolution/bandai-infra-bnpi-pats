# Attendance Flow Documentation

## Overview

The attendance system ensures **one attendance record per employee per day** to prevent duplicates and maintain data integrity.

## Database Schema Changes

### Updated Attendance Model

```prisma
model Attendance {
  id               String           @id @default(auto()) @map("_id") @db.ObjectId
  organizationId   String           // Multi-tenancy support
  employee         Employee         @relation(fields: [employeeId], references: [id])
  employeeId       String           @db.ObjectId
  date             DateTime         // Date of attendance (YYYY-MM-DD)
  timeIn           DateTime?        @default(now())
  timeOut          DateTime?
  status           AttendanceStatus @default(PRESENT)

  // ... other fields ...

  @@unique([organizationId, employeeId, date]) // Prevent duplicate attendance per day
  @@index([organizationId])
  @@index([employeeId, date])
  @@map("attendances")
}
```

## API Endpoints

### 1. Create/Update Attendance

**POST** `/api/attendance`

**Flow Logic:**

1. **Check for existing attendance** for the employee on the specified date
2. **If no attendance exists**: Create new record
3. **If attendance exists**:
    - Has `timeIn` but no `timeOut` + request has `timeOut` → Update existing record (clock out)
    - Has `timeIn` but no `timeOut` + request has `timeIn` → Return 409 error (already clocked in)
    - Has both `timeIn` and `timeOut` → Return 409 error (attendance complete)

**Request Body:**

```json
{
	"employeeId": "507f1f77bcf86cd799439011",
	"date": "2024-12-15T00:00:00.000Z", // Optional, defaults to today
	"status": "PRESENT",
	"timeIn": "2024-12-15T09:00:00.000Z", // For clock in
	"timeOut": "2024-12-15T17:00:00.000Z", // For clock out
	"timeInLocation": { "lat": 40.7128, "lng": -74.006, "address": "Office" },
	"timeOutLocation": { "lat": 40.7128, "lng": -74.006, "address": "Office" },
	"deviceInfo": { "deviceId": "mobile-123", "platform": "ios" },
	"notes": "Optional notes"
}
```

### 2. Get Today's Attendance

**GET** `/api/attendance/today/{employeeId}`

Returns today's attendance record for a specific employee.

## Attendance States

### 1. **Not Clocked In**

- No attendance record exists for today
- Employee can clock in
- Status: No record

### 2. **Clocked In**

- Has `timeIn` but no `timeOut`
- Employee can clock out
- Status: PRESENT (or other status)

### 3. **Clocked Out**

- Has both `timeIn` and `timeOut`
- Attendance complete for the day
- Status: PRESENT (or other status)

## Frontend Integration

### Clock In Flow

```typescript
// Check if employee is already clocked in
const todayAttendance = await getTodayAttendance(employeeId);

if (!todayAttendance) {
	// No attendance today - can clock in
	await createAttendance({
		employeeId,
		status: "PRESENT",
		timeIn: new Date().toISOString(),
	});
} else if (todayAttendance.timeIn && !todayAttendance.timeOut) {
	// Already clocked in - show clock out button
	showClockOutButton(todayAttendance.id);
} else {
	// Already completed attendance today
	showAttendanceComplete();
}
```

### Clock Out Flow

```typescript
// Update existing attendance with timeOut
await createAttendance({
	employeeId,
	timeOut: new Date().toISOString(),
});
```

## Error Handling

### 409 Conflict Errors

- **"Employee has already clocked in today"** - When trying to clock in again
- **"Attendance already complete for today"** - When trying to clock in/out after completion

### 400 Bad Request

- Missing required fields
- Invalid date format
- Invalid employee ID

## Database Migration

After updating the schema, run:

```bash
npx prisma db push
# or
npx prisma migrate dev --name add-attendance-date-field
```

## Key Benefits

1. **No Duplicates**: Unique constraint prevents multiple attendance records per day
2. **Single Record**: One record tracks both clock in and clock out
3. **Data Integrity**: Proper validation and error handling
4. **Performance**: Indexed queries for fast lookups
5. **Audit Trail**: Complete history of attendance changes

## Example Scenarios

### Scenario 1: Normal Day

1. Employee clocks in at 9:00 AM → Creates attendance record
2. Employee clocks out at 5:00 PM → Updates same record with timeOut

### Scenario 2: Multiple Clock In Attempts

1. Employee clocks in at 9:00 AM → Creates attendance record
2. Employee tries to clock in again → Returns 409 error

### Scenario 3: Complete Attendance

1. Employee clocks in at 9:00 AM → Creates attendance record
2. Employee clocks out at 5:00 PM → Updates record with timeOut
3. Employee tries to clock in/out again → Returns 409 error

This flow ensures data consistency and prevents duplicate attendance records while providing a smooth user experience.
