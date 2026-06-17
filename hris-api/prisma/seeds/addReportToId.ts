import { PrismaClient } from "../../generated/prisma";

const prisma = new PrismaClient();

/**
 * Script to add reportToId to employees that don't have it
 * Maps employees to their managers based on role:
 * - hris-employee -> hris-employee-manager
 * - hris-hr-user -> hris-hr-manager
 * - hris-timekeeper -> hris-hr-manager
 * - Managers should have null reportToId
 */
export async function addReportToId() {
	console.log("=== Adding reportToId to Employees ===\n");

	// Define reporting hierarchy: employee role -> manager role
	const reportingHierarchy: Record<string, string | null> = {
		"hris-employee": "hris-employee-manager",
		"hris-hr-user": "hris-hr-manager",
		"hris-timekeeper": "hris-hr-manager",
		"hris-employee-manager": null, // Managers don't report to anyone
		"hris-hr-manager": null, // Managers don't report to anyone
	};

	// Find all managers first, grouped by organizationId and role
	const allManagers = await prisma.employee.findMany({
		where: {
			isDeleted: false,
			role: {
				in: ["hris-employee-manager", "hris-hr-manager"],
			},
		},
		select: {
			id: true,
			employeeId: true,
			role: true,
			organizationId: true,
		},
	});

	// Create a map: organizationId -> role -> manager employee ID
	const managersByOrgAndRole = new Map<string, Map<string, string>>();
	for (const manager of allManagers) {
		if (!manager.role) continue;

		if (!managersByOrgAndRole.has(manager.organizationId)) {
			managersByOrgAndRole.set(manager.organizationId, new Map());
		}

		const orgManagers = managersByOrgAndRole.get(manager.organizationId)!;
		// If multiple managers with same role in same org, use the first one
		if (!orgManagers.has(manager.role)) {
			orgManagers.set(manager.role, manager.id);
			console.log(
				`Found manager: ${manager.role} (${manager.employeeId}) in org ${manager.organizationId} -> ${manager.id}`,
			);
		}
	}

	// Find all employees that need reportToId (null reportToId)
	const employeesNeedingReportTo = await prisma.employee.findMany({
		where: {
			isDeleted: false,
			reportToId: null,
			role: {
				in: Object.keys(reportingHierarchy),
			},
		},
		select: {
			id: true,
			employeeId: true,
			role: true,
			organizationId: true,
		},
	});

	console.log(`\nFound ${employeesNeedingReportTo.length} employee(s) needing reportToId\n`);

	let totalUpdated = 0;
	let totalSkipped = 0;
	let totalErrors = 0;

	// Process each employee
	for (const employee of employeesNeedingReportTo) {
		if (!employee.role) {
			console.log(` Skipping ${employee.employeeId}: no role assigned`);
			totalSkipped++;
			continue;
		}

		const managerRole = reportingHierarchy[employee.role];

		// If this is a manager role, set reportToId to null (already null, so skip)
		if (managerRole === null) {
			console.log(
				`- ${employee.employeeId} (${employee.role}): Manager - keeping reportToId as null`,
			);
			totalSkipped++;
			continue;
		}

		// Find the manager for this employee in the same organization
		if (!managerRole) {
			console.log(
				` Skipping ${employee.employeeId} (${employee.role}): No manager role defined`,
			);
			totalSkipped++;
			continue;
		}

		const orgManagers = managersByOrgAndRole.get(employee.organizationId);
		if (!orgManagers) {
			console.log(
				` Skipping ${employee.employeeId} (${employee.role}): No managers found in organization ${employee.organizationId}`,
			);
			totalSkipped++;
			continue;
		}

		const managerId = orgManagers.get(managerRole);
		if (!managerId) {
			console.log(
				` Skipping ${employee.employeeId} (${employee.role}): Manager ${managerRole} not found in organization ${employee.organizationId}`,
			);
			totalSkipped++;
			continue;
		}

		// Update the employee with the manager's ID
		try {
			await prisma.employee.update({
				where: { id: employee.id },
				data: { reportToId: managerId },
			});
			console.log(
				` ${employee.employeeId} (${employee.role}): Set reportToId to ${managerId} (${managerRole})`,
			);
			totalUpdated++;
		} catch (e) {
			console.error(` ${employee.employeeId}: Failed to update - ${e}`);
			totalErrors++;
		}
	}

	console.log("\n=== Summary ===");
	console.log(`Total Updated: ${totalUpdated}`);
	console.log(`Total Skipped: ${totalSkipped}`);
	console.log(`Total Errors: ${totalErrors}`);
	console.log("\n=== Complete ===");
}

// Run if executed directly
(async () => {
	try {
		await addReportToId();
	} catch (e) {
		console.error("Error:", e);
		process.exit(1);
	} finally {
		await prisma.$disconnect();
	}
})();
