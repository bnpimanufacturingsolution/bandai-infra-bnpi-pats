import "dotenv/config";
import { PrismaClient } from "../generated/prisma";
import { getPayrollPeriodOtReadiness } from "../helper/payroll-ot-readiness.helper";
const prisma = new PrismaClient();
async function main() {
  const p = await prisma.payrollPeriod.findFirst({ where: { code: "PP-20260626-20260711" } });
  const r = await getPayrollPeriodOtReadiness(prisma, {
    payrollPeriodId: p!.id, organizationId: p!.organizationId, page: 1, limit: 100, onlyWithOt: true, query: "01713",
  });
  const person = r.people.find(x => x.employeeCode === "01713") || r.people[0];
  console.log(JSON.stringify({
    summary: { people: r.summary.peopleWithApprovedOt, hrs: r.summary.totalApprovedLineOtHours },
    person,
    pagination: r.pagination,
  }, null, 2));
}
main().finally(() => prisma.$disconnect());
