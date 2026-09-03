import "dotenv/config";
import { PrismaClient } from "../generated/prisma";
const prisma = new PrismaClient();
async function main() {
  const types = await prisma.benefitType.findMany({
    where: { isDeleted: false },
    select: { code: true, name: true, category: true, payrollDirection: true, description: true },
    orderBy: { code: "asc" },
    take: 80,
  });
  console.log(JSON.stringify(types, null, 2));
  const sample = await prisma.employeeBenefit.findMany({
    where: { isDeleted: false, isActive: true },
    take: 8,
    orderBy: { updatedAt: "desc" },
    select: {
      id: true, name: true, amount: true,
      benefitType: { select: { code: true, name: true, category: true, description: true } },
      employee: { select: { employeeId: true } },
    },
  });
  console.log("---samples---");
  console.log(JSON.stringify(sample, null, 2));
}
main().finally(() => prisma.$disconnect());
