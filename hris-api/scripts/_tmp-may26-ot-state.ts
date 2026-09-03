import "dotenv/config";
import { PrismaClient } from "../generated/prisma";
const prisma = new PrismaClient();
async function main() {
  const code = "PP-20260526-20260611";
  const p = await prisma.payrollPeriod.findFirst({ where: { code, isDeleted: false } });
  if (!p) { console.log(JSON.stringify({ missing: true })); return; }
  const ts = await prisma.timesheet.groupBy({
    by: ["status"],
    where: { payrollPeriodId: p.id, isDeleted: false },
    _count: { _all: true },
  });
  const anyOt = await prisma.$queryRaw<any[]>`
    SELECT COUNT(*)::int AS n FROM timesheet_lines l
    WHERE l."payrollPeriodId" = ${p.id} AND l."isDeleted"=false AND l."isEffective"=true
      AND l."overtimeHours" IS NOT NULL AND btrim(l."overtimeHours") NOT IN ('','0','0:00','00:00')
  `;
  const repairOt = await prisma.$queryRaw<any[]>`
    SELECT COUNT(*)::int AS n,
      COUNT(DISTINCT l."timesheetId")::int AS people
    FROM timesheet_lines l
    WHERE l."payrollPeriodId" = ${p.id} AND l."isDeleted"=false AND l."isEffective"=true
      AND (l.metadata->'bandaiPayrollSourceRepair') IS NOT NULL
      AND l."overtimeHours" IS NOT NULL AND btrim(l."overtimeHours") NOT IN ('','0','0:00','00:00')
  `;
  const demoOt = await prisma.$queryRaw<any[]>`
    SELECT COUNT(*)::int AS n,
      COUNT(DISTINCT l."timesheetId")::int AS people
    FROM timesheet_lines l
    WHERE l."payrollPeriodId" = ${p.id} AND l."isDeleted"=false AND l."isEffective"=true
      AND (
        COALESCE(l.metadata->>'source','') ILIKE '%DEMO%'
        OR COALESCE(l.metadata::text,'') ILIKE '%BNPI_DM4_DEMO%'
      )
      AND l."overtimeHours" IS NOT NULL AND btrim(l."overtimeHours") NOT IN ('','0','0:00','00:00')
  `;
  console.log(JSON.stringify({
    period: { id: p.id, code: p.code, start: p.startDate, end: p.endDate, status: p.status },
    timesheetStatus: ts,
    anyOtLines: anyOt[0],
    repairOt: repairOt[0],
    demoOt: demoOt[0],
  }, null, 2));
}
main().finally(() => prisma.$disconnect());
