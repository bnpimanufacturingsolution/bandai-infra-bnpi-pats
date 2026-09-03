import { PrismaClient } from "./generated/prisma";
import {
	createRequestStepExecutions,
	getDefaultRequestWorkflow,
	completeTaskStep,
} from "../helper/request-workflow.helper";

const prisma = new PrismaClient();

async function testDocumentRequestWorkflow() {
	console.log("\n🧪 === Testing Document Request Workflow ===\n");

	try {
		const ORG_ID = "69884da971e2dc9d6ac67b59";

		// 1. Find test employee (requester)
		console.log("1️⃣ Finding test employee...");
		const requester = await prisma.employee.findFirst({
			where: {
				organizationId: ORG_ID,
				isDeleted: false,
				employeeId: "EMP-SW-DEV-001",
			},
			include: {
				reportTo: true,
			},
		});

		if (!requester) {
			throw new Error("Test employee not found");
		}
		console.log(`   ✓ Found requester: ${requester.employeeId}`);
		console.log(`   ✓ Reports to: ${requester.reportTo?.employeeId || "N/A"}`);

		// 2. Find HR employee
		console.log("\n2️⃣ Finding HR employee...");
		const hrEmployee = await prisma.employee.findFirst({
			where: {
				organizationId: ORG_ID,
				isDeleted: false,
				role: { in: ["hris-hr-manager", "hris-hr-user"] },
			},
		});

		if (!hrEmployee) {
			throw new Error("HR employee not found");
		}
		console.log(`   ✓ Found HR: ${hrEmployee.employeeId}`);

		// 3. Get the workflow for DOCUMENT_REQUEST
		console.log("\n3️⃣ Getting default workflow...");
		const workflow = await getDefaultRequestWorkflow(prisma, ORG_ID, "DOCUMENT_REQUEST");

		if (!workflow) {
			throw new Error("DOCUMENT_REQUEST workflow not found");
		}
		console.log(`   ✓ Found workflow: ${workflow.name} (${workflow.code})`);
		console.log(`   ✓ Steps:`, JSON.stringify(workflow.steps, null, 2));

		// 4. Create a test request
		console.log("\n4️⃣ Creating test document request...");
		const requestCode = `REQ-TEST-${Date.now()}`;

		const request = await prisma.request.create({
			data: {
				organizationId: ORG_ID,
				code: requestCode,
				type: "DOCUMENT_REQUEST",
				status: "PENDING",
				requesterId: requester.id,
				description: "Test COE request for workflow testing",
				startDate: new Date(),
				endDate: new Date(),
				workflowId: workflow.id,
				metadata: {
					documentType: "COE",
					test: true,
				},
			},
		});

		console.log(`   ✓ Created request: ${request.code} (${request.id})`);

		// 5. Create step executions
		console.log("\n5️⃣ Creating workflow step executions...");
		const stepCount = await createRequestStepExecutions(prisma, {
			organizationId: ORG_ID,
			requestId: request.id,
			steps: workflow.steps,
			requesterId: requester.id,
			reportToId: requester.reportToId,
		});

		console.log(`   ✓ Created ${stepCount} step executions`);

		// 6. Check initial state
		console.log("\n6️⃣ Checking initial request state...");
		const requestAfterCreation = await prisma.request.findUnique({
			where: { id: request.id },
			include: {
				currentStepExecution: true,
				lastCompletedStepExecution: true,
				stepExecutions: {
					orderBy: { stepNumber: "asc" },
				},
			},
		});

		console.log(`   Status: ${requestAfterCreation?.status}`);
		console.log(
			`   Current Step: ${requestAfterCreation?.currentStepExecution?.stepName || "N/A"}`,
		);
		console.log(
			`   Last Completed: ${requestAfterCreation?.lastCompletedStepExecution?.stepName || "N/A"}`,
		);
		console.log(`\n   All Steps:`);
		requestAfterCreation?.stepExecutions.forEach((step) => {
			console.log(`     ${step.stepNumber}. ${step.stepName} - ${step.status}`);
		});

		// 7. Simulate manager approval (if required)
		console.log("\n7️⃣ Simulating manager approval...");
		const managerApprovalStep = await prisma.requestStepExecution.findFirst({
			where: {
				requestId: request.id,
				stepName: "Manager Approval",
				isDeleted: false,
			},
		});

		if (managerApprovalStep && managerApprovalStep.status === "PENDING") {
			await prisma.requestStepExecution.update({
				where: { id: managerApprovalStep.id },
				data: {
					status: "APPROVED",
					completedAt: new Date(),
					comments: "Approved for testing",
				},
			});

			// Update request pointers
			const nextStep = await prisma.requestStepExecution.findFirst({
				where: {
					requestId: request.id,
					isDeleted: false,
					status: "PENDING",
				},
				orderBy: { stepNumber: "asc" },
			});

			await prisma.request.update({
				where: { id: request.id },
				data: {
					currentStepExecutionId: nextStep?.id ?? null,
					lastCompletedStepExecutionId: managerApprovalStep.id,
				},
			});

			console.log(`   ✓ Manager approval step updated`);
		} else {
			console.log(
				`   ⊘ Manager approval step is ${managerApprovalStep?.status || "not required"}`,
			);
		}

		// 8. Check state after manager approval
		console.log("\n8️⃣ Checking state after manager approval...");
		const requestAfterApproval = await prisma.request.findUnique({
			where: { id: request.id },
			include: {
				currentStepExecution: true,
				lastCompletedStepExecution: true,
				stepExecutions: {
					orderBy: { stepNumber: "asc" },
				},
			},
		});

		console.log(`   Status: ${requestAfterApproval?.status}`);
		console.log(
			`   Current Step: ${requestAfterApproval?.currentStepExecution?.stepName || "N/A"}`,
		);
		console.log(
			`   Last Completed: ${requestAfterApproval?.lastCompletedStepExecution?.stepName || "N/A"}`,
		);
		console.log(`\n   All Steps:`);
		requestAfterApproval?.stepExecutions.forEach((step) => {
			console.log(`     ${step.stepNumber}. ${step.stepName} - ${step.status}`);
		});

		// 9. Complete HR Review & Document Generation task
		console.log("\n9️⃣ Completing HR Review & Document Generation...");
		await completeTaskStep(
			prisma,
			request.id,
			"HR Review & Document Generation",
			hrEmployee.id,
			"Document generated successfully via test script",
		);

		console.log(`   ✓ Completed task step`);

		// 10. Check final state
		console.log("\n🔟 Checking final request state...");
		const finalRequest = await prisma.request.findUnique({
			where: { id: request.id },
			include: {
				currentStepExecution: true,
				lastCompletedStepExecution: true,
				stepExecutions: {
					orderBy: { stepNumber: "asc" },
				},
			},
		});

		console.log(`   Status: ${finalRequest?.status}`);
		console.log(
			`   Current Step: ${finalRequest?.currentStepExecution?.stepName || "NULL (workflow complete)"}`,
		);
		console.log(`   Current Step ID: ${finalRequest?.currentStepExecutionId || "NULL"}`);
		console.log(
			`   Last Completed: ${finalRequest?.lastCompletedStepExecution?.stepName || "N/A"}`,
		);
		console.log(`   Last Completed ID: ${finalRequest?.lastCompletedStepExecutionId || "N/A"}`);
		console.log(`\n   All Steps:`);
		finalRequest?.stepExecutions.forEach((step) => {
			console.log(
				`     ${step.stepNumber}. ${step.stepName} - ${step.status}${step.completedAt ? ` (completed: ${step.completedAt.toISOString()})` : ""}`,
			);
		});

		// 11. Validate results
		console.log("\n✅ === Validation Results ===\n");

		const allStepsCompleted = finalRequest?.stepExecutions.every(
			(s) => s.status === "COMPLETED" || s.status === "APPROVED" || s.status === "SKIPPED",
		);
		const currentStepIsNull = finalRequest?.currentStepExecutionId === null;
		const lastCompletedIsHR =
			finalRequest?.lastCompletedStepExecution?.stepName ===
			"HR Review & Document Generation";
		const statusIsCompleted = finalRequest?.status === "COMPLETED";

		console.log(`   All steps completed: ${allStepsCompleted ? "✅" : "❌"}`);
		console.log(`   Current step is null: ${currentStepIsNull ? "✅" : "❌"}`);
		console.log(`   Last completed is HR step: ${lastCompletedIsHR ? "✅" : "❌"}`);
		console.log(`   Request status is COMPLETED: ${statusIsCompleted ? "✅" : "❌"}`);

		if (allStepsCompleted && currentStepIsNull && lastCompletedIsHR && statusIsCompleted) {
			console.log(`\n🎉 Test PASSED! Workflow completed successfully.\n`);
		} else {
			console.log(`\n❌ Test FAILED! Some validations did not pass.\n`);
		}

		// 12. Cleanup
		console.log("🧹 Cleaning up test data...");
		await prisma.requestStepExecution.deleteMany({
			where: { requestId: request.id },
		});
		await prisma.request.delete({
			where: { id: request.id },
		});
		console.log(`   ✓ Deleted test request and steps\n`);
	} catch (error) {
		console.error("\n❌ Test failed with error:");
		console.error(error);
		throw error;
	} finally {
		await prisma.$disconnect();
	}
}

// Run the test
testDocumentRequestWorkflow()
	.then(() => {
		console.log("✅ Test script completed");
		process.exit(0);
	})
	.catch((error) => {
		console.error("💥 Test script failed:", error);
		process.exit(1);
	});
