import 'dotenv/config';
import { PrismaClient } from '../generated/prisma';
import { previewPayrollFromTimesheets } from '../helper/payroll-period.helper';

const prisma = new PrismaClient();

async function main() {
  console.log('=== 1. PERIOD INFORMATION ===');
  const targetPeriod = await prisma.payrollPeriod.findUnique({
    where: { id: 'cmpxw13bf001h7zwsyy6k976f' }
  });
  if (!targetPeriod) throw new Error('Period not found');
  console.log(`Period: ${targetPeriod.startDate.toISOString().slice(0, 10)} to ${targetPeriod.endDate.toISOString().slice(0, 10)} (${targetPeriod.payFrequency}, Status: ${targetPeriod.status})`);

  console.log('\n=== 2. RUNNING PREVIEW ON BATCH 1 (limit: 20) ===');
  const preview = await previewPayrollFromTimesheets(prisma, targetPeriod.id, targetPeriod.organizationId, {
    calculateRows: true,
    limit: 20
  });

  console.log(`Summary:`);
  console.log(`- Scope Employees: ${preview.summary.scopeEmployeesCount}`);
  console.log(`- Included (Payable): ${preview.summary.includedEmployeesCount}`);
  console.log(`- Evaluated in this page: ${preview.includedEmployees.length}`);
  console.log(`- Estimated Gross Pay: ₱${preview.summary.estimatedGrossPay.toLocaleString('en-US', { minimumFractionDigits: 2 })}`);
  console.log(`- Estimated Net Pay: ₱${preview.summary.estimatedNetPay.toLocaleString('en-US', { minimumFractionDigits: 2 })}`);

  console.log('\n=== 3. RECORD DETAILS ===');
  for (const rec of preview.includedEmployees) {
    const meta = rec.metadata as any;
    const name = `${rec.firstName || ''} ${rec.lastName || ''}`.trim() || rec.employeeNumber || rec.employeeId;
    console.log(`- ${name} (Emp#: ${rec.employeeNumber || 'N/A'}, ID: ${rec.employeeId}):`);
    console.log(`    Monthly: ₱${meta?.monthlyRate || 0}, Daily: ₱${meta?.dailyRate || 0}`);
    console.log(`    Scheduled Days: ${meta?.scheduledWorkDays ?? 0}, Worked Days: ${meta?.effectiveWorkedDays ?? meta?.daysWorked ?? 0}, Absent Days: ${meta?.daysAbsent ?? 0}`);
    console.log(`    Basic Pay: ₱${rec.basicPay}, Absent Deductions: ₱${meta?.absentDeductions || 0}`);
    console.log(`    Gross Pay: ₱${rec.grossPay}, Net Pay: ₱${rec.netPay}`);
    console.log(`    Zero Pay Reason: ${meta?.zeroPayReason || 'NONE'}, Has Attendance: ${meta?.hasAttendance}`);
  }

  console.log('\n=== 4. TESTING SPECIFIC EMPLOYEES BY ATTENDANCE PATTERNS ===');
  const sampleTimesheets = await prisma.timesheet.findMany({
    where: {
      payrollPeriodId: targetPeriod.id,
      employee: {
        workforceSource: 'DIRECT',
        basicSalary: { gt: 0 }
      }
    },
    include: {
      timesheetlines: {
        where: {
          isDeleted: false,
          isEffective: true,
          OR: [
            { timeIn: { not: null } },
            { timeOut: { not: null } }
          ]
        }
      },
      employee: {
        select: {
          id: true,
          employeeId: true,
          workforceSource: true,
          basicSalary: true,
          dailyRate: true
        }
      }
    },
    take: 100
  });

  const zeroDaysTs = sampleTimesheets.find(ts => ts.timesheetlines.length === 0);
  const oneDayTs = sampleTimesheets.find(ts => ts.timesheetlines.length === 1);
  const multiDayTs = sampleTimesheets.find(ts => ts.timesheetlines.length >= 5);

  if (zeroDaysTs) {
    console.log(`\n>>> 0-DAY ATTENDANCE EMPLOYEE (${zeroDaysTs.employee.employeeId}):`);
    const p0 = await previewPayrollFromTimesheets(prisma, targetPeriod.id, targetPeriod.organizationId, {
      calculateRows: true,
      employeeId: zeroDaysTs.employeeId
    });
    const r0 = p0.includedEmployees[0];
    const m0 = r0?.metadata as any;
    const name0 = `${r0?.firstName || ''} ${r0?.lastName || ''}`.trim() || r0?.employeeNumber;
    console.log(`  Name: ${name0}`);
    console.log(`  Scheduled: ${m0?.scheduledWorkDays}, Worked: ${m0?.effectiveWorkedDays}, Absent: ${m0?.daysAbsent}`);
    console.log(`  BasicPay: ₱${r0?.basicPay}, AbsentDeductions: ₱${m0?.absentDeductions}, GrossPay: ₱${r0?.grossPay}, NetPay: ₱${r0?.netPay}`);
    console.log(`  ZeroPayReason: ${m0?.zeroPayReason}, HasAttendance: ${m0?.hasAttendance}`);
  }

  if (oneDayTs) {
    console.log(`\n>>> 1-DAY ATTENDANCE EMPLOYEE (${oneDayTs.employee.employeeId}):`);
    const p1 = await previewPayrollFromTimesheets(prisma, targetPeriod.id, targetPeriod.organizationId, {
      calculateRows: true,
      employeeId: oneDayTs.employeeId
    });
    const r1 = p1.includedEmployees[0];
    const m1 = r1?.metadata as any;
    const name1 = `${r1?.firstName || ''} ${r1?.lastName || ''}`.trim() || r1?.employeeNumber;
    console.log(`  Name: ${name1}`);
    console.log(`  Monthly: ₱${m1?.monthlyRate}, Daily: ₱${m1?.dailyRate}`);
    console.log(`  Scheduled: ${m1?.scheduledWorkDays}, Worked: ${m1?.effectiveWorkedDays}, Absent: ${m1?.daysAbsent}`);
    console.log(`  BasicPay: ₱${r1?.basicPay}, AbsentDeductions: ₱${m1?.absentDeductions}, GrossPay: ₱${r1?.grossPay}, NetPay: ₱${r1?.netPay}`);
    console.log(`  ZeroPayReason: ${m1?.zeroPayReason}, HasAttendance: ${m1?.hasAttendance}`);
  }

  if (multiDayTs) {
    console.log(`\n>>> MULTI-DAY ATTENDANCE EMPLOYEE (${multiDayTs.employee.employeeId}):`);
    const pm = await previewPayrollFromTimesheets(prisma, targetPeriod.id, targetPeriod.organizationId, {
      calculateRows: true,
      employeeId: multiDayTs.employeeId
    });
    const rm = pm.includedEmployees[0];
    const mm = rm?.metadata as any;
    const namem = `${rm?.firstName || ''} ${rm?.lastName || ''}`.trim() || rm?.employeeNumber;
    console.log(`  Name: ${namem}`);
    console.log(`  Monthly: ₱${mm?.monthlyRate}, Daily: ₱${mm?.dailyRate}`);
    console.log(`  Scheduled: ${mm?.scheduledWorkDays}, Worked: ${mm?.effectiveWorkedDays}, Absent: ${mm?.daysAbsent}`);
    console.log(`  BasicPay: ₱${rm?.basicPay}, AbsentDeductions: ₱${mm?.absentDeductions}, GrossPay: ₱${rm?.grossPay}, NetPay: ₱${rm?.netPay}`);
    console.log(`  ZeroPayReason: ${mm?.zeroPayReason}, HasAttendance: ${mm?.hasAttendance}`);
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
