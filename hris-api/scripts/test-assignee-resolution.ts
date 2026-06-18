import { PrismaClient } from "../generated/prisma";
import { resolveStepAssignee } from "../helper/request-runtime.helper";

const prisma = new PrismaClient();
const ORG_ID = "69884da971e2dc9d6ac67b59";

async function runTest() {
	try {
		// 1. Find an active employee
		const requester = await prisma.employee.findFirst({
			where: {
				organizationId: ORG_ID,
				isDeleted: false,
			},
		});

		if (!requester) {
			console.log("No active employee found to act as requester.");
			return;
		}

		console.log(`Using Requester: ${requester.id}`);

		const existingAssigneeIds = new Set<string>();

		// 2. Simulate Step 1 Resolution (SUPERVISOR) with a missing supervisor
		// We pass a dummy reportToId that doesn't exist to force fallback
		const resolution1 = await resolveStepAssignee(prisma, {
			organizationId: ORG_ID,
			requesterId: requester.id,
			assigneeType: "SUPERVISOR",
			requesterReportToId: "aaaaaaaaaaaaaaaaaaaaaaaa",
			existingAssigneeIds: undefined, // For the first step, we don't pass anything
		});

		console.log("--- Step 1 Resolution (Manager Fallback) ---");
		console.log(resolution1);

		if (resolution1.assigneeId) {
			existingAssigneeIds.add(resolution1.assigneeId);
		}

		// 3. Simulate Step 2 Resolution (HR)
		const resolution2 = await resolveStepAssignee(prisma, {
			organizationId: ORG_ID,
			requesterId: requester.id,
			assigneeType: "HR",
			existingAssigneeIds: existingAssigneeIds, // Pass the previously assigned ID
		});

		console.log("--- Step 2 Resolution (HR Task) ---");
		console.log(resolution2);
	} catch (error) {
		console.error("Test Error:", error);
	} finally {
		await prisma.$disconnect();
	}
}

runTest();
