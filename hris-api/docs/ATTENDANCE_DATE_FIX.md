# Attendance Date Timezone Issue - Fixed

## Problem Summary

The attendance `date` field was being stored incorrectly in the database due to timezone conversion issues.

### What Was Happening

When an employee in Philippines (UTC+8) clocked in on **December 10, 2025**, the attendance record was being saved with:
```
date: 2025-12-09T16:00:00.000Z
```

This is **December 9, 4:00 PM UTC** (which equals December 10, 12:00 AM in UTC+8).

### Why This Was Wrong

The `date` field should represent the **calendar date** of attendance, not a specific moment in time. It should be stored as:
```
date: 2025-12-10T00:00:00.000Z
```

This represents **December 10** in UTC, which is the correct calendar date.

## Root Cause

In `zod/attendance.zod.ts` (line 63-65), the code was:

```typescript
const today = new Date();
today.setHours(0, 0, 0, 0); // ❌ WRONG - uses LOCAL timezone
result.date = today;
```

### The Problem with `setHours()`

- `setHours(0, 0, 0, 0)` sets the time to midnight in the **local timezone**
- For UTC+8, midnight local time = 4:00 PM previous day in UTC
- When MongoDB stores this, it saves the UTC value, which is the **previous day**

### Example Timeline

1. Current time in Philippines: `Dec 10, 2025, 11:25 AM (UTC+8)`
2. `new Date()` creates: `2025-12-10T03:25:00.000Z`
3. `setHours(0, 0, 0, 0)` in local time (UTC+8) = `2025-12-09T16:00:00.000Z` in UTC
4. Stored in DB: `2025-12-09T16:00:00.000Z` ❌ **WRONG DATE!**

## The Fix

Changed `setHours()` to `setUTCHours()`:

```typescript
const today = new Date();
today.setUTCHours(0, 0, 0, 0); // ✅ CORRECT - uses UTC timezone
result.date = today;
```

### Why This Works

- `setUTCHours(0, 0, 0, 0)` sets the time to midnight in **UTC**
- This ensures the date represents the correct calendar day
- Works consistently across all timezones

### Example Timeline (Fixed)

1. Current time in Philippines: `Dec 10, 2025, 11:25 AM (UTC+8)`
2. `new Date()` creates: `2025-12-10T03:25:00.000Z`
3. `setUTCHours(0, 0, 0, 0)` = `2025-12-10T00:00:00.000Z`
4. Stored in DB: `2025-12-10T00:00:00.000Z` ✅ **CORRECT DATE!**

## Impact on Queries

### Before Fix
Querying for attendance on Dec 10 would fail because:
- Query looks for: `date >= 2025-12-10T00:00:00.000Z AND date <= 2025-12-10T23:59:59.999Z`
- Actual data has: `date = 2025-12-09T16:00:00.000Z`
- **No match!** ❌

### After Fix
Querying for attendance on Dec 10 works correctly:
- Query looks for: `date >= 2025-12-10T00:00:00.000Z AND date <= 2025-12-10T23:59:59.999Z`
- Actual data has: `date = 2025-12-10T00:00:00.000Z`
- **Match!** ✅

## Testing the Fix

### Before Testing
1. Delete existing attendance records with wrong dates
2. Or update them manually to correct dates

### Test Steps
1. Clock in from Philippines (UTC+8)
2. Check the database - `date` field should be `2025-12-10T00:00:00.000Z`
3. Run the test script: `npx ts-node scripts/test-attendance-metrics.ts`
4. Verify that employees show as PRESENT

## Additional Recommendations

### 1. Fix Existing Data
Run a migration script to fix existing attendance records:

```typescript
// Update all attendance records to use correct UTC dates
const attendances = await prisma.attendance.findMany();
for (const att of attendances) {
  if (att.date) {
    const correctDate = new Date(att.date);
    correctDate.setUTCHours(0, 0, 0, 0);
    await prisma.attendance.update({
      where: { id: att.id },
      data: { date: correctDate }
    });
  }
}
```

### 2. Consistent Date Handling
Always use UTC methods when working with dates that represent calendar days:
- Use `setUTCHours()` instead of `setHours()`
- Use `getUTCDate()` instead of `getDate()`
- Use `getUTCMonth()` instead of `getMonth()`

### 3. Frontend Considerations
When displaying dates in the UI, convert UTC dates to local timezone for display:

```typescript
// Convert UTC date to local date string
const displayDate = new Date(attendance.date).toLocaleDateString('en-PH', {
  timeZone: 'Asia/Manila',
  year: 'numeric',
  month: 'long',
  day: 'numeric'
});
```

## Files Modified

1. **zod/attendance.zod.ts** - Fixed date creation logic (line 64)
2. **scripts/test-attendance-metrics.ts** - Fixed TypeScript errors (field names, type annotations)

## Summary

The fix ensures that attendance dates are stored consistently as UTC midnight, representing the correct calendar date regardless of the user's timezone. This makes queries work correctly and prevents date-shifting issues.
