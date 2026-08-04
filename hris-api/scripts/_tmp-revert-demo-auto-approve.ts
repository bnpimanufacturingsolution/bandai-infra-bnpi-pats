import "dotenv/config";
import { PrismaClient } from "../generated/prisma";
const prisma = new PrismaClient();
async function main() {
  // Timesheets system-approved from OT import but with ZERO approved-source OT lines
  const rows = await prisma.$queryRaw<Array<{ id: string; code: string; period: string }>>`
    SELECT t.id, pp.code AS period, e."employeeId" AS code
    FROM timesheets t
    JOIN payroll_periods pp ON pp.id = t."payrollPeriodId"
    JOIN employees e ON e.id = t."employeeId"
    WHERE t."isDeleted" = false
      AND t.status = 'APPROVED'
      AND t."approvedBy" = 'system:approved_ot_import'
      AND NOT EXISTS (
        SELECT 1 FROM timesheet_lines l
        WHERE l."timesheetId" = t.id
          AND l."isDeleted" = false
          AND l."isEffective" = true
          AND l.metadata ? 'bandaiPayrollSourceRepair'
          AND l."overtimeHours" IS NOT NULL
          AND btrim(l."overtimeHours") NOT IN ('', '0:00', '0', '00:00')
      )
  `;
  console.log(JSON.stringify({ wouldRevert: rows.length, sample: rows.slice(0, 8) }, null, 2));
  if (rows.length === 0) return;
  const ids = rows.map((r) => r.id);
  // batch
  const result = await prisma.timesheet.updateMany({
    where: { id: { in: ids } },
    data: {
      status: "DRAFT",
      approvedBy: null,
      approvalDate: null,
    },
  });
  console.log(JSON.stringify({ reverted: result.count }));
}
main().finally(() => prisma.$disconnect());
