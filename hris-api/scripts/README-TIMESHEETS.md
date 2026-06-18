# Timesheet Generation Script

This script automatically generates timesheets for all employees based on their existing attendance records.

## Features

- ✅ Generates timesheets for all active employees
- ✅ Supports multiple period types (weekly, biweekly, monthly, custom)
- ✅ Auto-calculates summaries (total hours, overtime, late minutes, etc.)
- ✅ Skips employees without attendance records
- ✅ Option to skip existing timesheets or regenerate them
- ✅ Detailed progress reporting

## Usage

### Basic Command

```bash
npm run generate:timesheets -- [options]
```

### Options

| Option | Alias | Description | Required |
|--------|-------|-------------|----------|
| `--org` | `-o` | Organization ID | ✅ Yes |
| `--period` | `-p` | Period type: `weekly`, `biweekly`, `monthly`, `custom` | ✅ Yes |
| `--start` | `-s` | Start date (YYYY-MM-DD format) | ✅ Yes |
| `--end` | `-e` | End date (YYYY-MM-DD format) | ✅ Yes |
| `--no-skip` | - | Don't skip existing timesheets (recreate all) | ❌ No |
| `--help` | `-h` | Show help message | ❌ No |

## Examples

### Generate Weekly Timesheets for January 2026

```bash
npm run generate:timesheets -- -o "org123" -p weekly -s 2026-01-01 -e 2026-01-31
```

This will create:
- Week 1: Jan 1-5 (Wed-Sun)
- Week 2: Jan 6-12 (Mon-Sun)
- Week 3: Jan 13-19 (Mon-Sun)
- Week 4: Jan 20-26 (Mon-Sun)
- Week 5: Jan 27-31 (Mon-Fri)

### Generate Monthly Timesheets for 2025

```bash
npm run generate:timesheets -- -o "org123" -p monthly -s 2025-01-01 -e 2025-12-31
```

This will create 12 timesheets (one for each month of 2025).

### Generate Biweekly Timesheets for Q1 2026

```bash
npm run generate:timesheets -- -o "org123" -p biweekly -s 2026-01-01 -e 2026-03-31
```

This will create timesheets for 2-week periods throughout Q1 2026.

### Generate Custom Period Timesheet

```bash
npm run generate:timesheets -- -o "org123" -p custom -s 2026-01-01 -e 2026-01-15
```

This creates a single timesheet for the exact date range specified.

### Regenerate Timesheets (Force Recreate)

```bash
npm run generate:timesheets -- -o "org123" -p weekly -s 2026-01-01 -e 2026-01-31 --no-skip
```

Use `--no-skip` to regenerate timesheets even if they already exist.

## Period Types Explained

### Weekly
- Starts: Monday
- Ends: Sunday
- Duration: 7 days

### Biweekly
- Starts: Monday
- Ends: Sunday (2 weeks later)
- Duration: 14 days

### Monthly
- Starts: 1st day of the month
- Ends: Last day of the month
- Duration: Variable (28-31 days)

### Custom
- Starts: Exact start date specified
- Ends: Exact end date specified
- Duration: As specified

## What Gets Created

For each employee with attendance in the period, a timesheet is created with:

- **Status**: `DRAFT` (ready for employee review/submission)
- **Attendance IDs**: References to all attendance records in the period
- **Auto-calculated fields**:
  - Total Days
  - Total Hours Worked
  - Total Regular Hours
  - Total Overtime Hours
  - Total Undertime Hours
  - Total Late Minutes
  - Total Early Out Minutes

## Behavior

### Default (Skip Existing)
- ✅ Only creates timesheets that don't already exist
- ⏭️ Skips periods that already have timesheets
- ⚠️ Skips employees with no attendance

### With --no-skip Flag
- ❌ **Warning**: This will attempt to create duplicate timesheets
- Use only if you need to regenerate timesheets
- May fail due to unique constraint (organizationId + employeeId + periodStart + periodEnd)

## Output Example

```
🕐 Starting timesheet generation...
================================================================================
Organization ID: org123
Period Type: weekly
Date Range: 1/1/2026 - 1/31/2026
Skip Existing: Yes
================================================================================

📋 Found 50 active employees

📅 Generating timesheets for 5 period(s)


👤 Processing: John Doe (EMP001)
   ✅ Created 1/6/2026 - 1/12/2026 (5 days, 40.00 hours)
   ✅ Created 1/13/2026 - 1/19/2026 (5 days, 40.00 hours)
   ✅ Created 1/20/2026 - 1/26/2026 (5 days, 40.00 hours)
   ⚠️  No attendance for 1/27/2026 - 1/31/2026


👤 Processing: Jane Smith (EMP002)
   ⏭️  Skipped 1/6/2026 - 1/12/2026 (already exists)
   ✅ Created 1/13/2026 - 1/19/2026 (5 days, 42.50 hours)
   ...

================================================================================
📊 SUMMARY
================================================================================
✅ Timesheets Created: 180
⏭️  Timesheets Skipped: 15
❌ Errors: 0
================================================================================
✨ Timesheet generation complete!
```

## Notes

- Only generates timesheets for **ACTIVE** or **ONBOARDING** employees
- Employees must have at least one attendance record in the period
- All timesheets are created in **DRAFT** status
- Timesheets can be submitted/approved through the API or UI afterward
- The script validates against duplicate timesheets (unique constraint)

## Troubleshooting

### Error: "Organization ID is required"
Make sure you're passing the `--org` or `-o` flag with a valid organization ID.

### Error: "Invalid period type"
Period must be one of: `weekly`, `biweekly`, `monthly`, or `custom`.

### Error: "Duplicate timesheet"
A timesheet already exists for this employee and period. Use `--no-skip` to attempt recreation (may still fail due to unique constraint).

### No timesheets created
Check that:
1. Employees have attendance records in the specified period
2. Employees are in ACTIVE or ONBOARDING status
3. The date range is correct

## Integration with Workflow

After generating timesheets, employees can:
1. Review their timesheets (DRAFT status)
2. Update the status to SUBMITTED when ready
3. Managers/HR can APPROVE or REJECT
4. Rejected timesheets can be revised and resubmitted

All status changes are done through the timesheet update API:

```bash
PATCH /api/timesheet/:id
{
  "status": "SUBMITTED"
}
```
