import "dotenv/config";
import { Prisma, PrismaClient } from "../generated/prisma";
const prisma = new PrismaClient();
async function main() {
  const period = await prisma.payrollPeriod.findFirst({ where: { code: "PP-20260611-20260626" } });
  const sample = await prisma.$queryRaw<any[]>`
    SELECT
      COUNT(*)::int AS total_ot_lines,
      COUNT(*) FILTER (WHERE l.metadata ? 'bandaiPayrollSourceRepair')::int AS with_repair_key,
      COUNT(*) FILTER (
        WHERE (l.metadata->'bandaiPayrollSourceRepair') IS NOT NULL
          AND jsonb_typeof(l.metadata->'bandaiPayrollSourceRepair') = 'object'
      )::int AS with_repair_obj,
      COUNT(*) FILTER (
        WHERE COALESCE(l.metadata->>'source','') ILIKE '%DEMO%'
      )::int AS demo_source
    FROM timesheet_lines l
    WHERE l."payrollPeriodId" = ${period!.id}
      AND l."isDeleted" = false
      AND l."isEffective" = true
      AND l."overtimeHours" IS NOT NULL
      AND btrim(l."overtimeHours") NOT IN ('', '0:00', '0', '00:00')
  `;
  console.log(JSON.stringify(sample, null, 2));
  const one = await prisma.$queryRaw<any[]>`
    SELECT l.id, l."overtimeHours", l.metadata
    FROM timesheet_lines l
    WHERE l."payrollPeriodId" = ${period!.id}
      AND l."isDeleted" = false AND l."isEffective" = true
      AND l."overtimeHours" IS NOT NULL
      AND btrim(l."overtimeHours") NOT IN ('', '0:00', '0')
    LIMIT 2
  `;
  console.log(JSON.stringify(one, null, 2));
}
main().finally(() => prisma.$disconnect());
