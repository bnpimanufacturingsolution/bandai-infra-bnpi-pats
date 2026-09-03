import "dotenv/config";
import { PrismaClient } from "../generated/prisma";
const prisma = new PrismaClient();
async function main() {
  const mtx = await prisma.benefitType.findMany({
    where: { OR: [{ code: { contains: "MTX", mode: "insensitive" } }, { name: { contains: "MTX", mode: "insensitive" } }, { code: { in: ["BGE","BGK","CGK","DMA","ECD","LLA","MLA","PFA","ANT","AON","ABS","OTC","OTM","AVL","13M","PDI","TXR","CGF","13A","CTC","AOL","AVLTAX","TSA"] } }] },
    select: { code: true, name: true, category: true, description: true, payrollDirection: true },
  });
  console.log("types", JSON.stringify(mtx, null, 2));
  const enroll = await prisma.employeeBenefit.findMany({
    where: { isDeleted: false, benefitType: { code: "MTX" } },
    take: 3,
    select: { name: true, notes: true, description: true, amount: true, benefitType: { select: { code: true, name: true, description: true, category: true } }, employee: { select: { employeeId: true } } },
  });
  console.log("mtx enroll", JSON.stringify(enroll, null, 2));
  const topCodes = await prisma.$queryRaw`
    SELECT bt.code, bt.name, bt.description, bt.category, COUNT(*)::int AS n
    FROM employee_benefits eb
    JOIN benefit_types bt ON bt.id = eb."benefitTypeId"
    WHERE eb."isDeleted" = false AND eb."isActive" = true
    GROUP BY bt.code, bt.name, bt.description, bt.category
    ORDER BY n DESC
    LIMIT 25
  `;
  console.log("top", JSON.stringify(topCodes, null, 2));
}
main().finally(() => prisma.$disconnect());
