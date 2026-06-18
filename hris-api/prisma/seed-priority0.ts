import { PrismaClient } from "../generated/prisma";
import { seedProjectDefaults } from "./seeds/defaultProjectSeeder";

interface Priority0Summary {
  status: "ok" | "failed";
  organizationId?: string;
  durationMs: number;
  idempotentNoop?: boolean;
  counts?: {
    organizations: number;
    users: number;
    documentTypes: number;
    holidayCalendarItems: number;
    devices: number;
    benefitTypes: number;
    payrollPeriods: number;
    calculators: number;
  };
  error?: string;
}

const prisma = new PrismaClient();

const readCounts = async (organizationId: string) => {
  const [
    organizations,
    users,
    documentTypes,
    holidayCalendarItems,
    devices,
    benefitTypes,
    payrollPeriods,
    calculators,
  ] =
    await Promise.all([
      prisma.organization.count({ where: { id: organizationId, isDeleted: false } }),
      prisma.user.count({ where: { organizationId, isDeleted: false } }),
      prisma.documentType.count({ where: { organizationId, isDeleted: false } }),
      prisma.calendarItem.count({ where: { organizationId, type: "HOLIDAY" } }),
      prisma.device.count({ where: { organizationId, isDeleted: false } }),
      prisma.benefitType.count({ where: { organizationId, isDeleted: false } }),
      prisma.payrollPeriod.count({ where: { organizationId, isDeleted: false } }),
      prisma.calculator.count({ where: { organizationId, isDeleted: false } }),
    ]);

  return {
    organizations,
    users,
    documentTypes,
    holidayCalendarItems,
    devices,
    benefitTypes,
    payrollPeriods,
    calculators,
  };
};

const equalCounts = (a: Awaited<ReturnType<typeof readCounts>>, b: Awaited<ReturnType<typeof readCounts>>) =>
  a.organizations === b.organizations &&
  a.users === b.users &&
  a.documentTypes === b.documentTypes &&
  a.holidayCalendarItems === b.holidayCalendarItems &&
  a.devices === b.devices &&
  a.benefitTypes === b.benefitTypes &&
  a.payrollPeriods === b.payrollPeriods &&
  a.calculators === b.calculators;

async function main() {
  const startedAt = Date.now();
  let summary: Priority0Summary = {
    status: "ok",
    durationMs: 0,
  };

  try {
    const defaultsResult = await seedProjectDefaults(prisma, {
      ensureAdminUsers: true,
    });

    const organizationId = defaultsResult.organizationId;
    const beforeCounts = await readCounts(organizationId);

    await seedProjectDefaults(prisma, {
      organizationId,
      ensureAdminUsers: true,
    });

    const afterCounts = await readCounts(organizationId);

    summary = {
      status: "ok",
      organizationId,
      durationMs: Date.now() - startedAt,
      idempotentNoop: equalCounts(beforeCounts, afterCounts),
      counts: afterCounts,
    };

    console.log(JSON.stringify(summary, null, 2));
  } catch (error) {
    summary = {
      status: "failed",
      durationMs: Date.now() - startedAt,
      error: error instanceof Error ? error.message : String(error),
    };

    console.error(JSON.stringify(summary, null, 2));
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

main();
