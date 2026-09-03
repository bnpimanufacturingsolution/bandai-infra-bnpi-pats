import "dotenv/config";
import { PrismaClient } from "../generated/prisma";
const prisma = new PrismaClient();
async function main() {
  const emp = await prisma.employee.findFirst({ where: { employeeId: "01474" }, select: { id: true } });
  const period = await prisma.payrollPeriod.findFirst({ where: { code: "PP-20260526-20260611" } });
  const ts = await prisma.timesheet.findFirst({
    where: { employeeId: emp!.id, payrollPeriodId: period!.id, isDeleted: false },
    select: {
      id: true, status: true, totalOvertimeHours: true, approvedBy: true, metadata: true,
      timesheetlines: {
        where: { isDeleted: false, isEffective: true },
        orderBy: { date: "asc" },
        select: {
          date: true, overtimeHours: true, hoursWorked: true, regularHours: true,
          status: true, primaryMarker: true, metadata: true, timeIn: true, timeOut: true,
        },
      },
    },
  });
  const lines = (ts?.timesheetlines || []).map((l) => ({
    date: l.date.toISOString().slice(0,10),
    ot: l.overtimeHours,
    worked: l.hoursWorked,
    reg: l.regularHours,
    status: l.status,
    marker: l.primaryMarker,
    timeIn: l.timeIn,
    timeOut: l.timeOut,
    hasRepair: Boolean((l.metadata as any)?.bandaiPayrollSourceRepair),
    buckets: (l.metadata as any)?.bandaiPayrollSourceRepair?.approvedBuckets || null,
    source: (l.metadata as any)?.bandaiPayrollSourceRepair?.source || null,
    metaSource: (l.metadata as any)?.source || (l.metadata as any)?.snapshotType || null,
  }));
  const otLines = lines.filter((l) => l.ot && !["0:00","0","00:00",""].includes(String(l.ot)));
  console.log(JSON.stringify({
    period: period?.code,
    timesheetId: ts?.id,
    status: ts?.status,
    totalOT: ts?.totalOvertimeHours,
    approvedBy: ts?.approvedBy,
    allLineCount: lines.length,
    otLines,
  }, null, 2));
}
main().finally(() => prisma.$disconnect());
