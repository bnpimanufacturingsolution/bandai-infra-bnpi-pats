import "dotenv/config";
import { PrismaClient } from "../generated/prisma";

const CATALOG: Record<string, string> = {
  BGE: "Birthday Gift (Employee)",
  BGK: "Birthday Gift (Kid)",
  CGK: "Christmas Gift (Kid)",
  CGF: "1K Christmas Gift",
  DMA: "De Minimis Allowance",
  ECD: "Excess Deduction",
  LLA: "Line Leader Allowance",
  MLA: "Meal Allowance",
  PFA: "Perfect Attendance",
  ANT: "Adjustment Non-Tax",
  AON: "Adjustment OT/ND",
  ABS: "Adjustment Basic",
  OTC: "Other Compensation",
  OTM: "OT Meal Allowance",
  AVL: "ACL/VL Conversion",
  AVLTAX: "ACL/VL Conversion Tax",
  "13M": "13th Month",
  "13A": "13th Month Adjustment",
  PDI: "Production Incentives",
  TXR: "Tax Refund",
  CTC: "Community Tax Certificate",
  AOL: "Adjustment Overused Leave",
  TSA: "Technical Skills Allowance",
  MTX: "Matrix / Other Comp",
  INC: "Incentive",
  ARP: "Attendance Recognition Pay",
  OAD: "Other Compensation",
  OBA: "OB Allowance",
  HYS: "HYS Meal Allowance",
  LVP: "Leave Pay / ACL-VL Conversion",
  UFD: "Uniform Deduction",
  MHDMF2: "Modified HDMF 2",
  NEGADJ: "Negative Adjustment",
  UNIDED: "Unidentified Deduction",
};

const prisma = new PrismaClient();
async function main() {
  let updated = 0;
  for (const [code, name] of Object.entries(CATALOG)) {
    const rows = await prisma.benefitType.findMany({
      where: { code: { equals: code, mode: "insensitive" }, isDeleted: false },
      select: { id: true, code: true, name: true, description: true },
    });
    for (const row of rows) {
      const nameIsCode = String(row.name || "").trim().toUpperCase() === code.toUpperCase();
      const descNeeds = /needs_?confirmation/i.test(String(row.description || ""));
      if (!nameIsCode && !descNeeds) continue;
      await prisma.benefitType.update({
        where: { id: row.id },
        data: {
          name,
          description: `BNPI ComCode ${code}: ${name}`,
        },
      });
      updated += 1;
      console.log(JSON.stringify({ code: row.code, from: row.name, to: name }));
    }
  }
  console.log(JSON.stringify({ updated }));
}
main().finally(() => prisma.$disconnect());
