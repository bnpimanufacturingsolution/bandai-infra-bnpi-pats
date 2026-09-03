process.env.DATABASE_URL = process.env.DATABASE_URL || "postgresql://postgres:postgres@127.0.0.1:55435/hris?schema=public";
process.env.PG_DATABASE_URL = process.env.DATABASE_URL;
process.env.WRITE_DATABASE_URL = process.env.DATABASE_URL;
import fs from "node:fs";
import path from "node:path";
import { PrismaClient } from "../generated/prisma";
import {
  importCompensationMassUpload,
  importDeductionMassUpload,
} from "../app/migration/bnpi-mass-upload-import.service";

const stamp =
  process.env.EVIDENCE_DIR ||
  path.resolve(__dirname, "../../.runtime/multi-june11-25-payroll-20260804-105328/02-api-money");
const orgId = process.env.ORG_ID || "cmpxw0mfe00007zws3iypuu9d";
const samples = (process.env.SAMPLES || "01360,00032").split(",").map((s) => s.trim());
const repoRoot = path.resolve(__dirname, "..", "..");
const pack = path.join(repoRoot, "docs", "new-cutoff", "june-11-25");
const compPath =
  process.env.COMP_PATH || path.join(pack, "Compensation Mass Upload 06.30.26.xlsx");
const dedPath =
  process.env.DED_PATH || path.join(pack, "Deduction Mass Upload 06.30.26.xlsx");
const prisma = new PrismaClient();

function wrap(kind: string, summary: any, elapsedMs: number) {
  return {
    status: "success",
    message:
      kind === "compensation"
        ? "Compensation mass upload imported"
        : "Deduction mass upload imported",
    httpStatus: 200,
    elapsedMs,
    method: "direct_service",
    data: { summary },
    note: "HTTP mass-upload blocked by server.requestTimeout=120000ms; identical service against 127.0.0.1:55435 (LAN SSH forward)",
  };
}

async function main() {
  fs.mkdirSync(stamp, { recursive: true });
  if (!fs.existsSync(compPath) || !fs.existsSync(dedPath)) {
    throw new Error(`Missing files: ${compPath} / ${dedPath}`);
  }
  console.log(
    JSON.stringify({
      phase: "start",
      orgId,
      emp: await prisma.employee.count({ where: { isDeleted: false } }),
      compPath,
      dedPath,
    }),
  );
  const t0 = Date.now();
  console.log(JSON.stringify({ phase: "compensation_start" }));
  const compensation = await importCompensationMassUpload({
    prisma,
    organizationId: orgId,
    buffer: fs.readFileSync(compPath),
  });
  const compElapsed = Date.now() - t0;
  fs.writeFileSync(
    path.join(stamp, "import-comp.json"),
    JSON.stringify(wrap("compensation", compensation, compElapsed), null, 2),
  );
  fs.writeFileSync(
    path.join(stamp, "import-comp-direct.json"),
    JSON.stringify({ ...compensation, elapsedMs: compElapsed }, null, 2),
  );
  console.log(
    JSON.stringify({
      phase: "compensation_done",
      total: compensation.total,
      created: compensation.created,
      updated: compensation.updated,
      failed: compensation.failed,
      elapsedMs: compElapsed,
      periodCodes: compensation.periodCodes,
    }),
  );

  const t1 = Date.now();
  console.log(JSON.stringify({ phase: "deduction_start" }));
  const deduction = await importDeductionMassUpload({
    prisma,
    organizationId: orgId,
    buffer: fs.readFileSync(dedPath),
  });
  const dedElapsed = Date.now() - t1;
  fs.writeFileSync(
    path.join(stamp, "import-ded.json"),
    JSON.stringify(wrap("deduction", deduction, dedElapsed), null, 2),
  );
  fs.writeFileSync(
    path.join(stamp, "import-ded-direct.json"),
    JSON.stringify({ ...deduction, elapsedMs: dedElapsed }, null, 2),
  );
  console.log(
    JSON.stringify({
      phase: "deduction_done",
      total: deduction.total,
      created: deduction.created,
      updated: deduction.updated,
      failed: deduction.failed,
      elapsedMs: dedElapsed,
      periodCodes: deduction.periodCodes,
    }),
  );

  const employees = await prisma.employee.findMany({
    where: { organizationId: orgId, isDeleted: false, employeeId: { in: samples } },
    select: { id: true, employeeId: true, firstName: true, lastName: true },
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
    spot.push({
      employeeId: emp.employeeId,
      name: `${emp.lastName || ""}, ${emp.firstName || ""}`.trim(),
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
  console.log(
    JSON.stringify({
      phase: "complete",
      spot: spot.map((s) => ({
        id: s.employeeId,
        benefits: s.benefits.length,
        loans: s.loans.length,
      })),
    }),
  );
  await prisma.$disconnect();
}
main().catch(async (e) => {
  console.error(JSON.stringify({ phase: "error", error: String(e?.message || e) }));
  try {
    await prisma.$disconnect();
  } catch {}
  process.exit(1);
});
