import cron from "node-cron";
import { getEligibilityCandidates } from "../../helper/eligibility.helper";
import { prisma } from "../../config/database";
import { redisClient } from "../../config/redis";

export const initCronJobs = () => {
	console.log("Initializing Cron Jobs...");

	// 1. Eligibility Check (Runs every minute for testing)
	cron.schedule("* * * * *", async () => {
		console.log("[Cron] Checking Employee Eligibility...");
		try {
			// Fetch all organizations (assuming multi-tenant)
			// If Organization model doesn't exist, we can group employees by organizationId
			// For now, let's try to fetch distinct organizationIds from Employee table to be safe
			const employees = await prisma.employee.findMany({
				select: { organizationId: true },
				distinct: ["organizationId"],
			});

			const orgIds = employees.map((e) => e.organizationId);

			for (const orgId of orgIds) {
				if (!orgId) continue;
				console.log(`Checking Organization: ${orgId}`);
				const candidates = await getEligibilityCandidates(prisma, orgId);

				if (candidates.length > 0) {
					console.log(
						`[Eligibility] Found ${candidates.length} candidates for Org ${orgId}`,
					);
					// Log details for debugging
					candidates.forEach((c) => {
						console.log(
							`   - ${c.employeeName} (${c.eligibleFor}): ${c.eligibilityReason}`,
						);
					});

					// Publish event to Redis for API to pick up and emit via Socket.IO
					try {
						await redisClient.publish(
							"events:eligibility-updated",
							JSON.stringify({
								organizationId: orgId,
								count: candidates.length,
								timestamp: new Date().toISOString(),
							}),
						);
						console.log(`Published eligibility-updated event for Org ${orgId}`);
					} catch (redisError) {
						console.error("Failed to publish Redis event:", redisError);
					}
				} else {
					console.log(`   No candidates found.`);
				}
			}
		} catch (error) {
			console.error("[Cron] Error checking eligibility:", error);
		}
	});

	// Daily midnight job example
	cron.schedule("0 0 * * *", async () => {
		console.log("Running daily midnight maintenance...");
		try {
			// Example: Clean up old logs or temp files
			// await prisma.log.deleteMany({ ... })
			console.log("Daily maintenance completed.");
		} catch (error) {
			console.error("Error in daily maintenance:", error);
		}
	});

	console.log("Cron Jobs initialized and scheduled.");
};
