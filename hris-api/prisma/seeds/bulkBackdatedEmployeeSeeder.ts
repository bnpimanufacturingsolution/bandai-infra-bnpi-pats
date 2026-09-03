import {
	disconnectGeneralEmployeeSeederPrisma,
	seedBulkBackdatedEmployees,
} from "./generalEmployeeSeeder.shared";
import { assertSeedDryRunNotRequested } from "./seedDryRunGuard";

type BulkBackdatedSeedOptions = NonNullable<Parameters<typeof seedBulkBackdatedEmployees>[0]>;

const BULK_SEED_CONFIG: BulkBackdatedSeedOptions = {
	employeeCount: 2000,
	timesheetsPerEmployee: 2,
	resumeFromLastCheckpoint: false,
	resumeFromDatabase: true,
	enableProgressCheckpoint: true,
	resumeFromEmployeeEmail: undefined,
	executionMode: "phased",
	seedConfig: {
		skipEmployeeDocumentUploads: true,
		generateBackdatedOperationalData: true,
		generateDemoRequests: true,
		skipTodayAttendance: true,
	},
};

export async function runBulkBackdatedEmployeeSeeder() {
	assertSeedDryRunNotRequested("seed:bulk-backdated-employees");
	return seedBulkBackdatedEmployees(BULK_SEED_CONFIG);
}

if (require.main === module) {
	runBulkBackdatedEmployeeSeeder()
		.catch((error) => {
			console.error("Bulk backdated employee seeding failed:", error);
			process.exitCode = 1;
		})
		.finally(async () => {
			await disconnectGeneralEmployeeSeederPrisma();
		});
}
