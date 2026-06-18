import { PrismaClient } from "./generated/prisma";

const prisma = new PrismaClient();

async function debugGenerateDocument() {
	console.log("\n🔍 === Debugging Generate Document Flow ===\n");

	try {
		// This is a completed request
		const requestId = "69858ebda9a219cb8ca0e5b7";
		const hrUserId = "69784d8d15f93cab3912ef20"; // HR Staff User ID

		console.log("1️⃣ Finding HR Employee");
		const hrEmployee = await prisma.employee.findFirst({
			where: { userId: hrUserId, isDeleted: false },
			select: { id: true, employeeId: true, role: true },
		});

		if (!hrEmployee) {
			console.log("   ❌ HR Employee NOT found!");
			return;
		}
		console.log(`   ✅ Found: ${hrEmployee.employeeId} (Role: ${hrEmployee.role})`);

		console.log("\n2️⃣ Finding request");
		const request = await prisma.request.findUnique({
			where: { id: requestId },
			include: {
				stepExecutions: {
					where: { stepName: "HR Review & Document Generation" },
				},
			},
		});

		if (!request) {
			console.log("   ❌ Request NOT found!");
			return;
		}
		console.log(`   ✅ Found: ${request.code}`);

		console.log("\n3️⃣ Finding current HR step");
		const hrStep = request.stepExecutions[0];
		if (!hrStep) {
			console.log("   ❌ HR step NOT found!");
			return;
		}
		console.log(`   ✅ Found: ${hrStep.stepName}`);
		console.log(`      Status: ${hrStep.status}`);
		console.log(`      Current Assignee ID: ${hrStep.assigneeId}`);
		console.log(`      Assignee Type: ${hrStep.assigneeType}`);

		console.log("\n4️⃣ Checking role validation");
		const roleCheckResult = hrEmployee.role?.includes("hr");
		console.log(`   Role: "${hrEmployee.role}"`);
		console.log(`   Includes 'hr': ${roleCheckResult}`);

		if (!roleCheckResult) {
			console.log("   ❌ ROLE CHECK FAILED! Employee cannot complete HR task!");
			return;
		}

		console.log("\n5️⃣ Ready to complete task step");
		console.log(`   Would update step ${hrStep.id}`);
		console.log(`   To status: COMPLETED`);
		console.log(`   Assigned to: ${hrEmployee.id} (${hrEmployee.employeeId})`);

		console.log("\n6️⃣ Attempting completeTaskStep...");
		const { completeTaskStep } = await import("../helper/request-workflow.helper");

		try {
			await completeTaskStep(
				prisma,
				requestId,
				"HR Review & Document Generation",
				hrEmployee.id,
				"Document generated successfully",
			);
			console.log("   ✅ completeTaskStep succeeded!");
		} catch (error) {
			console.log("   ❌ completeTaskStep FAILED!");
			console.log(`   Error: ${error instanceof Error ? error.message : String(error)}`);
			return;
		}

		console.log("\n7️⃣ Checking final request state");
		const finalRequest = await prisma.request.findUnique({
			where: { id: requestId },
			include: {
				currentStepExecution: true,
				stepExecutions: { orderBy: { stepNumber: "asc" } },
			},
		});

		console.log(`   Status: ${finalRequest?.status}`);
		console.log(`   Current Step: ${finalRequest?.currentStepExecution?.stepName || "NULL"}`);
		console.log(`   All Steps:`);
		finalRequest?.stepExecutions.forEach((s) => {
			console.log(`      ${s.stepNumber}. ${s.stepName} - ${s.status}`);
		});
	} catch (error) {
		console.error("❌ Error:", error);
	} finally {
		await prisma.$disconnect();
	}
}

debugGenerateDocument();
