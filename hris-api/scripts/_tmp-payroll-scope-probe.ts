import { PrismaClient, Prisma } from "@prisma/client";
const p = new PrismaClient();
async function main() {
  const periodId = "cmpxw13ac00177zwswptdhh03";
  const dept = "cmryaf7ms0016nj3o68cn814g";
  const period = await p.payrollPeriod.findUnique({ where: { id: periodId }, select: { payFrequency: true, organizationId: true, code: true }});
  if (!period) throw new Error("no period");
  const org = period.organizationId;
  const baseEmp: any = { organizationId: org, isDeleted: false, workforceSource: "DIRECT" };
  if (period.payFrequency) baseEmp.payFrequency = period.payFrequency;
  const scopeAll = await p.employee.count({ where: baseEmp });
  const scopeDept = await p.employee.count({ where: { ...baseEmp, departmentId: dept } });
  const anyDept = await p.employee.count({ where: { organizationId: org, isDeleted: false, departmentId: dept } });
  const activeDept = await p.employee.count({ where: { organizationId: org, isDeleted: false, departmentId: dept, employmentStatus: "ACTIVE" } });
  const tsApproved = await p.timesheet.count({ where: { organizationId: org, payrollPeriodId: periodId, isDeleted: false, status: "APPROVED" }});
  const tsApprovedDept = await p.timesheet.count({ where: { organizationId: org, payrollPeriodId: periodId, isDeleted: false, status: "APPROVED", employee: { departmentId: dept } }});
  const included = await p.timesheet.count({ where: { organizationId: org, payrollPeriodId: periodId, isDeleted: false, status: "APPROVED", employee: { ...baseEmp, basicSalary: { gt: 0 }, NOT: [{ embeddedSchedule: { equals: Prisma.DbNull } }] }}});
  const production = await p.department.findFirst({ where: { organizationId: org, name: { contains: "Production", mode: "insensitive" } }, select: { id: true, name: true }});
  let scopeProd = 0, tsProd = 0, inclProd = 0;
  if (production) {
    scopeProd = await p.employee.count({ where: { ...baseEmp, departmentId: production.id } });
    tsProd = await p.timesheet.count({ where: { organizationId: org, payrollPeriodId: periodId, isDeleted: false, status: "APPROVED", employee: { departmentId: production.id } }});
    inclProd = await p.timesheet.count({ where: { organizationId: org, payrollPeriodId: periodId, isDeleted: false, status: "APPROVED", employee: { ...baseEmp, departmentId: production.id, basicSalary: { gt: 0 }, NOT: [{ embeddedSchedule: { equals: Prisma.DbNull } }] }}});
  }
  const deptRow = await p.department.findUnique({ where: { id: dept }, select: { name: true, code: true }});
  console.log(JSON.stringify({ period, deptRow, scopeAll, scopeDept, anyDept, activeDept, tsApproved, tsApprovedDept, included, production, scopeProd, tsProd, inclProd }, null, 2));
  await p.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
