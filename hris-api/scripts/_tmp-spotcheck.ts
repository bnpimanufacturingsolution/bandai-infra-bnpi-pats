process.env.DATABASE_URL = "postgresql://postgres:postgres@127.0.0.1:55435/hris?schema=public";
process.env.PG_DATABASE_URL = process.env.DATABASE_URL;
process.env.WRITE_DATABASE_URL = process.env.DATABASE_URL;
import fs from "node:fs";
import path from "node:path";
import { PrismaClient } from "../generated/prisma";

const stamp = process.env.EVIDENCE_DIR!;
const orgId = "cmpxw0mfe00007zws3iypuu9d";
const samples = ["01360", "00032"];
const prisma = new PrismaClient();

async function main() {
  const employees = await prisma.employee.findMany({
    where: { organizationId: orgId, isDeleted: false, employeeId: { in: samples } },
    select: { id: true, employeeId: true },
  });
  const spot: any[] = [];
  for (const emp of employees) {
    const benefits = await prisma.employeeBenefit.findMany({
      where: { organizationId: orgId, employeeId: emp.id, isDeleted: false },
      include: {
        benefitType: { select: { code: true, name: true, payrollDirection: true } },
      },
      orderBy: { updatedAt: "desc" },
      take: 50,
    });
    let loans: any[] = [];
    try {
      loans = await (prisma as any).employeeLoan.findMany({
        where: { organizationId: orgId, employeeId: emp.id, isDeleted: false },
        include: { loanType: { select: { code: true, name: true } } },
        take: 40,
      });
    } catch {
      loans = [];
    }
    const massBenefits = benefits.filter((b) => /Mass Upload/i.test(String(b.notes || "")));
    spot.push({
      employeeId: emp.employeeId,
      benefits: benefits.map((b) => ({
        code: b.benefitType?.code,
        name: b.benefitType?.name,
        direction: b.benefitType?.payrollDirection,
        amount: b.amount,
        startDate: b.startDate,
        isActive: b.isActive,
        notes: String(b.notes || "").slice(0, 160),
        updatedAt: b.updatedAt,
      })),
      massUploadBenefits: massBenefits.map((b) => ({
        code: b.benefitType?.code,
        direction: b.benefitType?.payrollDirection,
        amount: b.amount,
        notes: String(b.notes || "").slice(0, 120),
      })),
      loans: loans.map((l) => ({
        code: l.loanType?.code,
        name: l.loanType?.name,
        principal: l.principalAmount,
        monthlyPayment: l.monthlyPayment,
        balance: l.balance,
        status: l.status,
        notes: String(l.notes || "").slice(0, 160),
      })),
    });
  }
  fs.writeFileSync(path.join(stamp, "enrollment-spotcheck.json"), JSON.stringify(spot, null, 2));
  console.log(JSON.stringify({ phase: "spotcheck", rows: spot.map((s) => ({
    id: s.employeeId,
    benefitCount: s.benefits.length,
    massCount: s.massUploadBenefits.length,
    loanCount: s.loans.length,
    massCodes: s.massUploadBenefits.map((b: any) => `${b.code}:${b.amount}`),
    loanCodes: s.loans.map((l: any) => `${l.code || l.name}:${l.monthlyPayment || l.principal}`),
  })) }, null, 2));
  await prisma.$disconnect();
}
main().catch(async (e) => {
  console.error(e);
  try { await prisma.$disconnect(); } catch {}
  process.exit(1);
});
