# Payroll Schema Design - Using JSON Snapshot

## Why This Design Works Better

### 1. **Flexibility** 🎯
- Can store ANY timesheet data without schema changes
- Easy to add new fields (nightDiff hours, holiday hours, etc.)
- No migration needed when timesheet structure evolves

### 2. **Complete Audit Trail** 📋
```typescript
// When payroll is generated, snapshot captures EVERYTHING:
timesheetSnapshot: {
  totalHoursWorked: "39:20",
  totalRegularHours: "39:20",
  totalOvertimeHours: "0:00",
  totalUndertimeHours: "0:40",
  totalLateHours: "0:23",
  totalEarlyOutHours: "0:17",
  totalDays: 13,
  daysPresent: 5,
  daysAbsent: 4,
  daysRestDay: 3,
  metadata: {
    totalMinutesWorked: 2360,
    totalRegularMinutes: 2360,
    // ... all minute values
  }
}
```

### 3. **Historical Accuracy** 🔒
- Even if timesheet is corrected later, payroll snapshot remains unchanged
- You can prove exactly what data was used for payment
- Compliance-friendly for audits

### 4. **Performance** ⚡
- No JOIN needed for payroll reports
- Fast queries: `db.employeePayroll.find()` gets everything
- Can still JOIN to timesheet if you need current data

### 5. **Simple Queries** 💡

**Get payroll with hours:**
```typescript
const payroll = await prisma.employeePayroll.findUnique({
  where: { id },
  select: {
    grossPay: true,
    netPay: true,
    timesheetSnapshot: true, // All hours data here!
  }
});

// Access hours:
const hours = payroll.timesheetSnapshot.totalHoursWorked;
const late = payroll.timesheetSnapshot.totalLateHours;
```

**Generate payroll from timesheet:**
```typescript
const timesheet = await prisma.timesheet.findUnique({
  where: { id: timesheetId },
  include: { employee: true }
});

const payroll = await prisma.employeePayroll.create({
  data: {
    employeeId: timesheet.employeeId,
    payrollPeriodId: timesheet.payrollPeriodId,
    timesheetId: timesheet.id,
    
    // Snapshot the entire timesheet data
    timesheetSnapshot: {
      totalHoursWorked: timesheet.totalHoursWorked,
      totalRegularHours: timesheet.totalRegularHours,
      totalOvertimeHours: timesheet.totalOvertimeHours,
      totalUndertimeHours: timesheet.totalUndertimeHours,
      totalLateHours: timesheet.totalLateHours,
      totalEarlyOutHours: timesheet.totalEarlyOutHours,
      totalDays: timesheet.totalDays,
      metadata: timesheet.metadata,
      // Calculate attendance summary
      daysPresent: timesheet.breakdown.filter(d => d.status === 'PRESENT').length,
      daysAbsent: timesheet.breakdown.filter(d => d.status === 'ABSENT').length,
      daysRestDay: timesheet.breakdown.filter(d => d.status === 'REST_DAY').length,
    },
    
    // Calculate pay based on snapshot
    basicPay: calculateBasicPay(timesheet),
    overtimePay: calculateOvertimePay(timesheet),
    // ... other calculations
  }
});
```

## Comparison: Old vs New

### ❌ Old Design (Separate Fields)
```prisma
model EmployeePayroll {
  regularHours  Float
  overtimeHours Float
  // Need to add new field for every new hour type
  // nightDiffHours Float  <- requires migration!
}
```

### ✅ New Design (JSON Snapshot)
```prisma
model EmployeePayroll {
  timesheetSnapshot Json? // Can store anything!
  // {
  //   regularHours: 40,
  //   overtimeHours: 5,
  //   nightDiffHours: 8,  <- just add it!
  //   weekendHours: 16,
  //   holidayHours: 0
  // }
}
```

## Best Practices

1. **Always snapshot when generating payroll** - Don't reference live timesheet data
2. **Keep timesheetId link** - Allows comparing snapshot vs current timesheet
3. **Use TypeScript types** - Define interface for snapshot structure
4. **Validate snapshot data** - Ensure all required fields are present

## Example TypeScript Interface

```typescript
interface TimesheetSnapshot {
  totalHoursWorked: string;
  totalRegularHours: string;
  totalOvertimeHours: string;
  totalUndertimeHours: string;
  totalLateHours: string;
  totalEarlyOutHours: string;
  totalDays: number;
  daysPresent: number;
  daysAbsent: number;
  daysRestDay: number;
  daysLeave: number;
  metadata: {
    totalMinutesWorked: number;
    totalRegularMinutes: number;
    totalOvertimeMinutes: number;
    totalUndertimeMinutes: number;
    totalLateMinutes: number;
    totalEarlyOutMinutes: number;
  };
}
```

## Migration Path

If you already have payroll records without snapshots:

```typescript
// Backfill script
const payrolls = await prisma.employeePayroll.findMany({
  where: { timesheetSnapshot: null },
  include: { timesheet: true }
});

for (const payroll of payrolls) {
  if (payroll.timesheet) {
    await prisma.employeePayroll.update({
      where: { id: payroll.id },
      data: {
        timesheetSnapshot: {
          totalHoursWorked: payroll.timesheet.totalHoursWorked,
          // ... copy all fields
        }
      }
    });
  }
}
```
