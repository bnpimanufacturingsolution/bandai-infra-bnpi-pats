import { PrismaClient } from "../generated/prisma";
import { seedGeneralEmployeesWithConfig } from "./seeds/generalEmployeeSeeder";
import { assertSeedDryRunNotRequested } from "./seeds/seedDryRunGuard";
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
