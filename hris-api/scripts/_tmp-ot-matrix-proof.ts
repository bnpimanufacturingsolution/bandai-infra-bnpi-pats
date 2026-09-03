import "dotenv/config";
import { PrismaClient } from "../generated/prisma";
import { getPayrollPeriodOtPersonDetail } from "../helper/payroll-ot-readiness.helper";
const prisma = new PrismaClient();
async function main() {
  const period = await prisma.payrollPeriod.findFirst({ where: { code: "PP-20260611-20260626" } });
  const emp = await prisma.employee.findFirst({ where: { employeeId: "00722" } });
  const ts = await prisma.timesheet.findFirst({
    where: { employeeId: emp!.id, payrollPeriodId: period!.id, isDeleted: false },
  });
  const d = await getPayrollPeriodOtPersonDetail(prisma, {
    payrollPeriodId: period!.id,
    organizationId: period!.organizationId,
    timesheetId: ts!.id,
  });
  console.log(JSON.stringify({
    name: d.name,
    code: d.employeeCode,
    payable: d.totalLineOtHours,
    otDays: d.otDayCount,
    categoryTotals: d.categoryTotals,
    sampleDays: d.days.slice(0, 4).map((x) => ({
      date: x.date,
      payable: x.overtimeHours,
      buckets: x.approvedBuckets,
    })),
  }, null, 2));
  // Felix P1 for screenshot matrix style
  const emp2 = await prisma.employee.findFirst({ where: { employeeId: "01713" } });
  const ts2 = await prisma.timesheet.findFirst({
    where: { employeeId: emp2!.id, payrollPeriodId: period!.id, isDeleted: false },
  });
  if (ts2) {
    const f = await getPayrollPeriodOtPersonDetail(prisma, {
      payrollPeriodId: period!.id,
      organizationId: period!.organizationId,
      timesheetId: ts2.id,
    });
    console.log("FELIX", JSON.stringify({ payable: f.totalLineOtHours, totals: f.categoryTotals, days: f.days.length }));
  }
}
main().finally(() => prisma.$disconnect());
