import "dotenv/config";
import { PrismaClient } from "../generated/prisma";
const prisma = new PrismaClient();
async function main() {
  const emp = await prisma.employee.findFirst({ where: { employeeId: "01697", isDeleted: false } });
  const period = await prisma.payrollPeriod.findFirst({ where: { code: "PP-20260611-20260626" } });
  const ts = await prisma.timesheet.findFirst({
    where: { employeeId: emp!.id, payrollPeriodId: period!.id, isDeleted: false },
    select: {
      id: true, status: true, totalOvertimeHours: true, totalHoursWorked: true, totalRegularHours: true,
      timesheetlines: {
        where: { isDeleted: false, isEffective: true },
        orderBy: { date: "asc" },
        select: { date: true, overtimeHours: true, hoursWorked: true, regularHours: true, status: true, metadata: true },
      },
    },
  });
  const otLines = (ts?.timesheetlines || []).filter((l) => {
    const o = String(l.overtimeHours || "");
    return o && !["0","0:00","00:00",""].includes(o);
  });
  console.log(JSON.stringify({
    timesheetId: ts?.id,
    totals: { ot: ts?.totalOvertimeHours, worked: ts?.totalHoursWorked, reg: ts?.totalRegularHours },
    lineCount: ts?.timesheetlines?.length,
    otLineCount: otLines.length,
    sampleOt: otLines.slice(0, 5).map((l) => ({
      date: l.date.toISOString().slice(0,10),
      ot: l.overtimeHours,
      hasRepair: Boolean((l.metadata as any)?.bandaiPayrollSourceRepair),
      sourceTop: (l.metadata as any)?.source,
      repairSource: (l.metadata as any)?.bandaiPayrollSourceRepair?.source,
    })),
  }, null, 2));
}
main().finally(() => prisma.$disconnect());
