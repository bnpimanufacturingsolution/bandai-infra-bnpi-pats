import 'dotenv/config';
import { PrismaClient } from '../generated/prisma';
import { resolveZeroPayReason, previewPayrollFromTimesheets } from '../helper/payroll-period.helper';

const prisma = new PrismaClient();

async function main() {
  const emp = await prisma.employee.findFirst({
    where: { employeeId: '01432' },
    include: {
      person: true,
      timesheets: {
        where: {
          payrollPeriod: {
            startDate: { lte: new Date('2026-08-26') },
            endDate: { gte: new Date('2026-09-10') }
          }
        },
        include: { timesheetlines: true }
      }
    }
  });

  const hasSchedule = Boolean(
    emp?.embeddedSchedule &&
      (emp.embeddedSchedule as any)?.pattern &&
      Array.isArray((emp.embeddedSchedule as any).pattern) &&
      (emp.embeddedSchedule as any).pattern.length > 0
  );

  const lines = emp?.timesheets?.[0]?.timesheetlines || [];

  const res = resolveZeroPayReason(lines, [], {
    effectiveWorkedDays: 0,
    paidLeaveDays: 0,
    hasApprovedBucketPay: false,
    hasSchedule
  });

  console.log('Employee 01432 Zero Pay Status:');
  console.log('- Has Schedule:', hasSchedule);
  console.log('- Timesheet lines:', lines.length);
  console.log('- Zero Pay Reason:', res.zeroPayReason);
  console.log('- Zero Pay Label:', res.zeroPayLabel);
}

main().catch(console.error).finally(() => prisma.$disconnect());
