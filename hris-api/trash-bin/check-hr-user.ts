import { PrismaClient } from "./generated/prisma";

const prisma = new PrismaClient();

async function checkHRUser() {
	console.log("\n🔍 === Checking HR User Mapping ===\n");

	try {
		// This is the userId from your JWT token
		const userIdFromToken = "69784d8d15f93cab3912ef20";

		console.log(`1️⃣ Looking for employee with userId: ${userIdFromToken}`);

		const employee = await prisma.employee.findFirst({
			where: {
				userId: userIdFromToken,
				isDeleted: false,
			},
			select: {
				id: true,
				employeeId: true,
				userId: true,
				role: true,
				isDeleted: true,
				person: {
					select: {
						personalInfo: {
							select: {
								firstName: true,
								lastName: true,
							},
						},
					},
				},
			},
		});

		if (employee) {
			console.log("   ✅ Found employee record:");
			console.log(`      Employee ID: ${employee.employeeId}`);
			console.log(`      Database ID: ${employee.id}`);
			console.log(`      User ID: ${employee.userId}`);
			console.log(`      Role: ${employee.role}`);
			console.log(
				`      Name: ${employee.person?.personalInfo?.firstName} ${employee.person?.personalInfo?.lastName}`,
			);
			console.log(`      Is Deleted: ${employee.isDeleted}`);
		} else {
			console.log("   ❌ NO employee record found with this userId!");
			console.log("\n   Checking all HR employees in the system:");

			const allHR = await prisma.employee.findMany({
				where: {
					isDeleted: false,
					role: { in: ["hris-hr-user", "hris-hr-manager"] },
				},
				select: {
					id: true,
					employeeId: true,
					userId: true,
					role: true,
					person: {
						select: {
							personalInfo: {
								select: {
									firstName: true,
									lastName: true,
								},
							},
						},
					},
				},
			});

			console.log(`\n   Found ${allHR.length} HR employees:`);
			allHR.forEach((hr) => {
				console.log(
					`      - ${hr.employeeId}: userId="${hr.userId || "NULL"}", role=${hr.role}`,
				);
				console.log(
					`        Name: ${hr.person?.personalInfo?.firstName} ${hr.person?.personalInfo?.lastName}`,
				);
			});
		}

		// Check the request and its step executions
		console.log("\n2️⃣ Checking request 69858c9b76d69e2749e661fa:");
		const request = await prisma.request.findUnique({
			where: { id: "69858c9b76d69e2749e661fa" },
			include: {
				currentStepExecution: true,
				lastCompletedStepExecution: true,
				stepExecutions: {
					orderBy: { stepNumber: "asc" },
				},
			},
		});

		if (request) {
			console.log(`   Status: ${request.status}`);
			console.log(
				`   Current Step: ${request.currentStepExecution?.stepName} - ${request.currentStepExecution?.status}`,
			);
			console.log(`   Last Completed: ${request.lastCompletedStepExecution?.stepName}`);
			console.log(`\n   All steps:`);
			request.stepExecutions.forEach((step) => {
				console.log(
					`      ${step.stepNumber}. ${step.stepName} - ${step.status} (assigneeId: ${step.assigneeId})`,
				);
			});
		}
	} catch (error) {
		console.error("❌ Error:", error);
	} finally {
		await prisma.$disconnect();
	}
}

checkHRUser();
