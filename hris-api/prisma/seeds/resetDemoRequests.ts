import {
	disconnectGeneralEmployeeSeederPrisma,
	resetDemoRequestsAndRebuildCoeTickets,
} from "./generalEmployeeSeeder.shared";
import { resolveDefaultSeedOrganizationId } from "./seedOrganizationResolver";
import { assertSeedDryRunNotRequested } from "./seedDryRunGuard";

const DEFAULT_SOURCE_LABEL = "bulkBackdatedEmployeeSeeder";

async function runResetDemoRequests() {
	assertSeedDryRunNotRequested("seed:reset-demo-requests");
	const organizationId = await resolveDefaultSeedOrganizationId();
	const result = await resetDemoRequestsAndRebuildCoeTickets({
		organizationId,
		sourceLabel: DEFAULT_SOURCE_LABEL,
	});

	console.log("[seed] Demo request reset complete.");
	console.log(`[seed] Organization: ${organizationId}`);
	console.log(`[seed] Source label: ${result.sourceLabel}`);
	console.log(`[seed] Resolved employee count: ${result.resolvedEmployeeCount}`);
	console.log(`[seed] Timesheet edit permissions cleared: ${result.clearedTimesheetEditPermissionCount}`);
	console.log(`[seed] Request step executions deleted: ${result.deletedStepExecutionCount}`);
	console.log(`[seed] Requests deleted: ${result.deletedRequestCount}`);
	console.log(`[seed] COE tickets rebuilt: ${result.rebuilt ? "yes" : "no"}`);
}

export { runResetDemoRequests };

if (require.main === module) {
	runResetDemoRequests()
		.catch((error) => {
			console.error("Demo request reset failed:", error);
			process.exitCode = 1;
		})
		.finally(async () => {
			await disconnectGeneralEmployeeSeederPrisma();
		});
}
