import { PrismaClient } from "../generated/prisma";
import { getPayrollPeriodOtReadiness } from "../helper/payroll-ot-readiness.helper";
const url = "postgresql://postgres:postgres@127.0.0.1:55435/hris?schema=public&connection_limit=3&pool_timeout=90&connect_timeout=30";
const prisma = new PrismaClient({ datasources: { db: { url } } });
async function main() {
  const periods = [
    { name: "june11-25", id: "cmpxw13ac00177zwswptdhh03" },
    { name: "may26-june11", id: "cmpxw13a400157zwsxlfmlro5" },
  ];
  const meta = await prisma.payrollPeriod.findFirst({ where: { id: periods[0].id }, select: { organizationId: true } });
  if (!meta) throw new Error("period missing");
  for (const p of periods) {
    const t0 = performance.now();
    const result = await getPayrollPeriodOtReadiness(prisma, { payrollPeriodId: p.id, organizationId: meta.organizationId, page: 1, limit: 25, onlyWithOt: true });
    const cold = Number(((performance.now()-t0)/1000).toFixed(3));
    const t1 = performance.now();
    await getPayrollPeriodOtReadiness(prisma, { payrollPeriodId: p.id, organizationId: meta.organizationId, page: 1, limit: 25, onlyWithOt: true });
    const warm = Number(((performance.now()-t1)/1000).toFixed(3));
    const row = { phase:"after", name:p.name, id:p.id, code:result.period.code, coldSeconds:cold, warmSeconds:warm, strategy:result.queryMeta?.strategy, summary:result.summary, peopleReturned:result.people.length, totalItems:result.pagination.totalItems, sample:result.people.slice(0,5).map(x=>({employeeCode:x.employeeCode,name:x.name,timesheetOtHours:x.timesheetOtHours,lineOtHours:x.lineOtHours,blockerClass:x.blockerClass})) };
    console.log(JSON.stringify(row));
  }
}
main().catch(e=>{console.error("FAIL", e.message||e); process.exitCode=1}).finally(()=>prisma.$disconnect());
