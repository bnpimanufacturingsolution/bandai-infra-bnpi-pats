import { PrismaClient } from "../../generated/prisma";

const prisma = new PrismaClient();

/**
 * Script to check current reportToId values for all employees
 */
async function checkReportToId() {
	console.log("=== Checking reportToId for all Employees ===\n");

	const allEmployees = await prisma.employee.findMany({
		where: {
			isDeleted: false,
		},
		select: {
			id: true,
			employeeId: true,
			role: true,
			organizationId: true,
			reportToId: true,
		},
		orderBy: [{ organizationId: "asc" }, { role: "asc" }],
	});

	console.log(`Found ${allEmployees.length} total employees\n`);

	let currentOrg = "";
	let withReportTo = 0;
	let withoutReportTo = 0;

	for (const emp of allEmployees) {
		if (emp.organizationId !== currentOrg) {
			if (currentOrg) console.log(""); // Blank line between orgs
			currentOrg = emp.organizationId;
			console.log(`\n=== Organization: ${emp.organizationId} ===`);
		}

		const reportToStatus = emp.reportToId ? ` ${emp.reportToId}` : " NULL";
		console.log(
			`${emp.employeeId} (${emp.role || "NO_ROLE"}) -> reportToId: ${reportToStatus}`,
		);

		if (emp.reportToId) {
			withReportTo++;
		} else {
			withoutReportTo++;
		}
	}

	console.log("\n=== Summary ===");
	console.log(`Total Employees: ${allEmployees.length}`);
	console.log(`With reportToId: ${withReportTo}`);
	console.log(`Without reportToId (null): ${withoutReportTo}`);
}

// Run
(async () => {
	try {
		await checkReportToId();
	} catch (e) {
		console.error("Error:", e);
		process.exit(1);
	} finally {
		await prisma.$disconnect();
	}
})();
