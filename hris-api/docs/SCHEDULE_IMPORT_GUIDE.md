# Schedule Import Guide

## Overview

This guide explains how to import schedules from an Excel/CSV file into the HRIS system.

## Import Format

The schedule import uses a **wide format** where each row represents a complete schedule with all 7 days of the week.

### Required Columns

| Column | Type | Description | Example |
|--------|------|-------------|---------|
| `NAME` | String | Schedule name | "Regular Schedule" |
| `START_DATE` | Date | Start date of the schedule | 2024-01-01 |
| `END_DATE` | Date | End date of the schedule | 2024-12-31 |
| `MONDAY` | String | Monday schedule | "WORK(9:00AM-5:00PM);BREAK(12:00PM-1:00PM)" or "REST" |
| `TUESDAY` | String | Tuesday schedule | "WORK(9:00AM-5:00PM);BREAK(12:00PM-1:00PM)" or "REST" |
| `WEDNESDAY` | String | Wednesday schedule | "WORK(9:00AM-5:00PM);BREAK(12:00PM-1:00PM)" or "REST" |
| `THURSDAY` | String | Thursday schedule | "WORK(9:00AM-5:00PM);BREAK(12:00PM-1:00PM)" or "REST" |
| `FRIDAY` | String | Friday schedule | "WORK(9:00AM-5:00PM);BREAK(12:00PM-1:00PM)" or "REST" |
| `SATURDAY` | String | Saturday schedule | "REST" |
| `SUNDAY` | String | Sunday schedule | "REST" |

### Optional Columns

| Column | Type | Description | Example |
|--------|------|-------------|---------|
| `CODE` | String | Schedule code (auto-generated if not provided) | "REGULAR_SCHEDULE" |
| `TOTAL_HOURS` | Number | Total work hours per week | 40 |

## Time Slot Format

For work days, use the following format:

```
WORK(start1-end1,start2-end2);BREAK(start1-end1)
```

### Examples

**BNPI 2026 Migration Day Shift (8 paid hours with 1 unpaid break):**
```
WORK(8:00AM-12:00PM);BREAK(12:00PM-1:00PM);WORK(1:00PM-5:00PM)
```

**Full Day Work (8 hours with 1 hour break):**
```
WORK(9:00AM-12:00PM,1:00PM-5:00PM);BREAK(12:00PM-1:00PM)
```

**Single Continuous Work Period:**
```
WORK(8:00AM-5:00PM)
```

**Night Shift:**
```
WORK(10:00PM-6:00AM);BREAK(2:00AM-3:00AM)
```

**Multiple Breaks:**
```
WORK(8:00AM-12:00PM,12:30PM-3:00PM,3:15PM-5:00PM);BREAK(12:00PM-12:30PM,3:00PM-3:15PM)
```

**Rest Day:**
```
REST
```

## Sample CSV Template

```csv
NAME,CODE,START_DATE,END_DATE,MONDAY,TUESDAY,WEDNESDAY,THURSDAY,FRIDAY,SATURDAY,SUNDAY,TOTAL_HOURS
BNPI Mon-Fri Day 8-5,BNPI_MON_FRI_DAY_8_5,2026-01-01,2026-12-31,"WORK(8:00AM-12:00PM);BREAK(12:00PM-1:00PM);WORK(1:00PM-5:00PM)","WORK(8:00AM-12:00PM);BREAK(12:00PM-1:00PM);WORK(1:00PM-5:00PM)","WORK(8:00AM-12:00PM);BREAK(12:00PM-1:00PM);WORK(1:00PM-5:00PM)","WORK(8:00AM-12:00PM);BREAK(12:00PM-1:00PM);WORK(1:00PM-5:00PM)","WORK(8:00AM-12:00PM);BREAK(12:00PM-1:00PM);WORK(1:00PM-5:00PM)",REST,REST,40
Regular Schedule,REGULAR_SCHEDULE,2024-01-01,2024-12-31,"WORK(9:00AM-12:00PM,1:00PM-5:00PM);BREAK(12:00PM-1:00PM)","WORK(9:00AM-12:00PM,1:00PM-5:00PM);BREAK(12:00PM-1:00PM)","WORK(9:00AM-12:00PM,1:00PM-5:00PM);BREAK(12:00PM-1:00PM)","WORK(9:00AM-12:00PM,1:00PM-5:00PM);BREAK(12:00PM-1:00PM)","WORK(9:00AM-12:00PM,1:00PM-5:00PM);BREAK(12:00PM-1:00PM)",REST,REST,40
Flex Schedule,FLEX_SCHEDULE,2024-01-01,2024-12-31,"WORK(8:00AM-5:00PM);BREAK(12:00PM-1:00PM)","WORK(9:00AM-2:00PM)","WORK(8:00AM-5:00PM);BREAK(12:00PM-1:00PM)","WORK(2:00PM-10:00PM);BREAK(6:00PM-7:00PM)","WORK(10:00AM-3:00PM)",REST,REST,40
Night Shift,NIGHT_SHIFT,2024-01-01,2024-12-31,"WORK(10:00PM-6:00AM);BREAK(2:00AM-3:00AM)","WORK(10:00PM-6:00AM);BREAK(2:00AM-3:00AM)","WORK(10:00PM-6:00AM);BREAK(2:00AM-3:00AM)","WORK(10:00PM-6:00AM);BREAK(2:00AM-3:00AM)","WORK(10:00PM-6:00AM);BREAK(2:00AM-3:00AM)",REST,REST,35
Part Time,PART_TIME,2024-01-01,2024-12-31,"WORK(9:00AM-1:00PM)","WORK(9:00AM-1:00PM)","WORK(9:00AM-1:00PM)",REST,REST,REST,REST,12
```

**Note:** TOTAL_HOURS represents the total work hours per week, not per day.
- Regular Schedule: 40 hours = 8 hours/day × 5 working days
- Flex Schedule: 40 hours = varied hours across 5 working days
- Night Shift: 35 hours = 7 hours/day × 5 working days  
- Part Time: 12 hours = 4 hours/day × 3 working days

## Import Process

### Via Web Interface

1. Navigate to **Configuration > Schedules**
2. Click the **"Import"** button
3. Download the template if needed
4. Fill in your schedule data following the format above
5. Upload the completed file
6. Review the import summary

### Via API

**Endpoint:** `POST /api/scheduleTemplate/import`

**Headers:**
```
Authorization: Bearer <your-token>
Content-Type: multipart/form-data
```

**Body:**
```
file: <your-excel-or-csv-file>
```

**Response:**
```json
{
  "status": "success",
  "message": "Schedule import completed",
  "data": {
    "summary": {
      "totalRows": 4,
      "created": 3,
      "updated": 1,
      "skipped": 0,
      "errors": []
    }
  }
}
```

## Important Notes

1. **Time Format:** Both 12-hour (9:00AM) and 24-hour (09:00) formats are supported. Schedule template imports also accept `DAY_1` through `DAY_42` columns when importing multi-week cycles.
2. **Date Format:** Use ISO date format (YYYY-MM-DD) for best compatibility
3. **Total Hours:** The system now stores the `TOTAL_HOURS` value provided in the import
4. **Schedule Code:** If not provided, it will be auto-generated from the schedule name (uppercase with underscores)
5. **Duplicate Names:** If a schedule with the same name exists, it will be updated instead of creating a duplicate
6. **Break Time Calculation:** Break times are automatically subtracted from work periods
7. **Validation:** The system validates time formats and ensures no overlapping time slots

## Troubleshooting

### Common Issues

**Issue:** "Row missing NAME, START_DATE, or END_DATE"
- **Solution:** Ensure all three required fields are filled for every row

**Issue:** Invalid time format
- **Solution:** Use either 12-hour (9:00AM, 5:00PM) or 24-hour (09:00, 17:00) format

**Issue:** Schedule not appearing after import
- **Solution:** Check the import summary response for errors. The schedule might have been skipped due to validation errors

**Issue:** Break time not calculated correctly
- **Solution:** Ensure break times overlap with work times. Breaks outside work hours are ignored

## Version History

- **v1.1** (2026-01-02): Added `TOTAL_HOURS` column support
- **v1.0** (2024-12-29): Initial schedule import implementation

