import { PrismaClient } from "../generated/prisma";
import { seedGeneralEmployeesWithConfig } from "./seeds/generalEmployeeSeeder";
import { seedKioskLoginContent } from "./seeds/kioskLoginSeeder";
import { resolveDefaultSeedOrganizationId } from "./seeds/seedOrganizationResolver";
import { assertSeedDryRunNotRequested } from "./seeds/seedDryRunGuard";
import { ensureDefaultBenefitTypes } from "./seeds/benefitTypeSeeder";
import { seedAuditLoggingDemo } from "./seeds/auditLoggingSeeder";
const prisma = new PrismaClient();

const generalEmployeeSeedConfig = {
	skipEmployeeDocumentUploads: true,
	generateBackdatedOperationalData: true,
	generateDemoRequests: false,
	skipTodayAttendance: true,
} as const;

async function main() {
	assertSeedDryRunNotRequested("prisma-seed");
	// Seed HRIS employees (non-admin roles)
	// await seedEmployees();
	// await seedUzaroEmployees();
	await seedGeneralEmployeesWithConfig(generalEmployeeSeedConfig);
	const organizationId = await resolveDefaultSeedOrganizationId();
	const organization = await prisma.organization.findUnique({
		where: { id: organizationId },
		select: { id: true, code: true, name: true },
	});
	await ensureDefaultBenefitTypes(prisma, organizationId);
	const kioskSeedSummary = await seedKioskLoginContent(prisma, organizationId);
	console.log("Kiosk login seed summary:", kioskSeedSummary);
	console.log(
		"Kiosk public feeds org (use VITE_KIOSK_ORGANIZATION_CODE for emp-app login):",
		{
			organizationId: organization?.id || organizationId,
			organizationCode: organization?.code || "bnei",
			organizationName: organization?.name || null,
		},
	);

	// HR change history (`/hr/audit-logs`) demo rows: payroll, requests, approvals, timesheets.
	const auditSeedSummary = await seedAuditLoggingDemo(prisma, organizationId);
	console.log("Audit logging seed summary:", auditSeedSummary);

	console.log("Seeding completed successfully!");
}

main()
	.then(async () => {
		await prisma.$disconnect();
	})
	.catch(async (e) => {
		console.error("Error during seeding:", e);
		await prisma.$disconnect();
		process.exit(1);
	});
