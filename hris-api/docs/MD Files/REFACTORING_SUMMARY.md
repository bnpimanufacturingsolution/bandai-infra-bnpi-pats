# Import Function Refactoring Summary

## Current State
The `importFromXLSX` function (lines 1149-1555) is **synchronous**:
- Parses Excel file
- Loops through all rows (lines 1197-1501)
- Processes each row immediately (employee lookup, date parsing, timekeeping calc, DB insert)
- Returns 200 with full results after everything is done

## Required Changes

### What to KEEP (lines 1149-1183):
- File validation
- Organization ID check
- Excel parsing with XLSX
- Empty file check

### What to REPLACE (lines 1184-1546):
Remove the entire `AttendanceImportResult` interface, `results` array, and processing loop.

Replace with:
1. Parse rows into simple objects (employeeId, date, timeIn, timeOut, status, notes)
2. Call `new AttendanceImportService(prisma, organizationId).importAttendance(rows)`
3. Get jobId from result
4. Return 202 with `{ jobId, message: "Import started", total: rows.length }`

## Why This is Hard
The processing loop is 350+ lines and includes:
- Employee lookup logic
- Date/time parsing helpers
- Timekeeping calculations
- Database operations
- Error handling

All of this needs to move to `AttendanceImportService` (which I already created).

## Solution
Since the service already has all the processing logic, I just need to:
1. Extract the row parsing (convert Excel rows to simple objects)
2. Remove all the DB operations
3. Call the service
4. Return jobId

The service will handle everything else in the background.
