import "dotenv/config";
import { getPayrollPeriodOtReadiness } from "../helper/payroll-ot-readiness.helper";
import { PrismaClient } from "../generated/prisma";
const prisma = new PrismaClient();
async function main() {
  for (const code of ["PP-20260526-20260611","PP-20260611-20260626","PP-20260626-20260711"]) {
    const p = await prisma.payrollPeriod.findFirst({ where: { code } });
    if (!p) { console.log(code, "missing"); continue; }
    const r = await getPayrollPeriodOtReadiness(prisma, {
      payrollPeriodId: p.id, organizationId: p.organizationId, page: 1, limit: 5, onlyWithOt: true,
    });
    console.log(JSON.stringify({
      code,
      peopleWithApprovedOt: r.summary.peopleWithApprovedOt,
      peopleWithLineOt: r.summary.peopleWithLineOt,
      totalApprovedHrs: r.summary.totalApprovedLineOtHours,
      totalLineHrs: r.summary.totalLineOtHours,
      sample: r.people.slice(0,3).map(x => ({ name: x.name, code: x.employeeCode, hrs: x.lineOtHours, days: x.lineDaysWithOt, label: x.approvalLabel })),
      meta: r.queryMeta,
    }));
  }
  // Lowela June 11-25
  const emp = await prisma.employee.findFirst({ where: { employeeId: "01474" } });
  const p2 = await prisma.payrollPeriod.findFirst({ where: { code: "PP-20260611-20260626" } });
  const ts = await prisma.timesheet.findFirst({ where: { employeeId: emp!.id, payrollPeriodId: p2!.id } });
  if (ts) {
    const { getPayrollPeriodOtPersonDetail } = await import("../helper/payroll-ot-readiness.helper");
    const d = await getPayrollPeriodOtPersonDetail(prisma, { payrollPeriodId: p2!.id, organizationId: p2!.organizationId, timesheetId: ts.id });
    console.log("LOWELA", JSON.stringify({ days: d.otDayCount, total: d.totalLineOtHours, dayList: d.days.map(x => ({ date: x.date, ot: x.overtimeHours, buckets: x.approvedBuckets })) }, null, 2));
  }
}
main().finally(() => prisma.$disconnect());
