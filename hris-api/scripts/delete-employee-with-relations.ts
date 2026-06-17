/**
 * Delete Employee with All Relations Script (Backend)
 *
 * This script deletes an employee and all associated data:
 * - Employee record (via Prisma)
 * - User account (via API endpoint)
 * - Person record (via Prisma)
 * - Documents, leave balances, attendance records (cascaded by Prisma)
 *
 * Usage:
 * Single employee: npm run delete:employee <employeeId>
 * All employees: npm run delete:all-employees
 *
 * Examples:
 * npm run delete:employee 69521f9a8a1bae913dd1a143
 * npm run delete:all-employees
 */

import { PrismaClient } from "../generated/prisma";

const prisma = new PrismaClient();
const isLocalHostUrl = (value: string) => /^(https?:\/\/)?(localhost|127\.0\.0\.1)(:\d+)?(\/|$)/i.test(value);
const REQUIRE_CONFIRM_ENV = "ALLOW_LOCAL_DESTRUCTIVE_DELETE";

// API base URL and auth token for user deletion
const API_BASE_URL = process.env.API_BASE_URL || "http://localhost:3000";
const AUTH_TOKEN =
	"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiI2OTQ0YzIzMjFiYTBlZjgyMWNiMjU3ZTYiLCJyb2xlIjoiYWRtaW4iLCJyb2xlSWQiOiI2OTQ0YzIzMDFiYTBlZjgyMWNiMjU3ZGMiLCJvcmdhbml6YXRpb25JZCI6IjY5NDRjMjJmMWJhMGVmODIxY2IyNTdkOSIsIm1ldGFkYXRhIjpudWxsLCJpYXQiOjE3NjY5OTI5MjIsImV4cCI6MTc2NzA3OTMyMn0.gUh86WGPpb5DET_5UNPlSXc2T0L0mHpAb_v2i__5Mc0";

interface EmployeeData {
	id: string;
	employeeId: string;
	userId: string | null;
	personId: string | null;
	person?: {
		contactInfo: {
			email: string | null;
		};
	} | null;
}

async function fetchAllEmployees(): Promise<EmployeeData[]> {
	// Fetch all employees with person relation
	const allEmployees = await prisma.employee.findMany({
		select: {
			id: true,
			employeeId: true,
			userId: true,
			personId: true,
			person: {
				select: {
					contactInfo: true,
				},
			},
		},
	});

	// Filter out seeder employees (identified by @uzaro.local or @seed.local email domains)
	const employees = allEmployees.filter((emp) => {
		const email = emp.person?.contactInfo?.email;
		if (!email) return true;
		return !email.endsWith("@uzaro.local") && !email.endsWith("@seed.local");
	});

	return employees;
}

async function deleteUserViaAPI(userId: string): Promise<void> {
	try {
		const response = await fetch(`${API_BASE_URL}/user/${userId}`, {
			method: "DELETE",
			headers: {
				Authorization: `Bearer ${AUTH_TOKEN}`,
				"Content-Type": "application/json",
			},
		});

		if (!response.ok) {
			const error = await response.json();
			throw new Error(error.message || "User deletion failed");
		}
	} catch (error: any) {
		throw new Error(`Failed to delete user: ${error.message}`);
	}
}

async function deleteEmployeeWithRelations(
	employeeId: string,
	showHeader = true,
): Promise<{ success: boolean; employeeId: string; employeeName?: string; error?: string }> {
	try {
		if (showHeader) {
			console.log("\n🔍 Starting employee deletion process...\n");
		}

		// Step 1: Fetch employee data to get related IDs
		console.log(`📋 Step 1: Fetching employee data for ID: ${employeeId}`);
		const employee = await prisma.employee.findUnique({
			where: { id: employeeId },
			include: {
				person: {
					select: {
						contactInfo: true,
					},
				},
			},
		});

		if (!employee) {
			console.error("❌ Employee not found");
			return { success: false, employeeId, error: "Employee not found" };
		}

		// Protect seeder employees from deletion
		const email = employee.person?.contactInfo?.email;
		if (email && (email.endsWith("@uzaro.local") || email.endsWith("@seed.local"))) {
			console.error("❌ Cannot delete seeder employee");
			console.error(`   Email: ${email}`);
			console.error("   Seeder employees are protected from deletion");
			return { success: false, employeeId, error: "Cannot delete seeder employee" };
		}

		const employeeName = employee.employeeId;

		console.log(`✅ Found employee: ${employeeName}`);
		console.log(`   - Employee ID: ${employee.id}`);
		console.log(`   - Employee Number: ${employee.employeeId}`);
		console.log(`   - User ID: ${employee.userId || "N/A"}`);
		console.log(`   - Person ID: ${employee.personId || "N/A"}`);

		const userId = employee.userId;
		const personId = employee.personId;

		// Step 1.5: Clear reportTo relationships
		console.log("\n🔗 Step 1.5: Clearing reportTo relationships...");
		try {
			// Clear this employee's reportTo
			await prisma.employee.update({
				where: { id: employeeId },
				data: { reportToId: null },
			});
			// Clear any employees that report to this employee
			await prisma.employee.updateMany({
				where: { reportToId: employeeId },
				data: { reportToId: null },
			});
			console.log("✅ ReportTo relationships cleared");
		} catch (error: any) {
			console.warn(`⚠️  Failed to clear reportTo: ${error.message}`);
		}

		// Step 2: Delete employee record (this should cascade documents, leave balances, etc.)
		console.log("\n🗑️  Step 2: Deleting employee record...");
		try {
			await prisma.employee.delete({
				where: { id: employeeId },
			});
			console.log("✅ Employee record deleted");
		} catch (error: any) {
			console.warn(`⚠️  Employee deletion failed: ${error.message}`);
			console.log("   Continuing with user deletion...");
		}

		// Step 3: Delete user account via API
		if (userId) {
			console.log("\n🗑️  Step 3: Deleting user account...");
			try {
				await deleteUserViaAPI(userId);
				console.log("✅ User account deleted");
			} catch (error: any) {
				console.warn(`⚠️  User deletion failed: ${error.message}`);
			}
		} else {
			console.log("\n⏭️  Step 3: Skipping user deletion (no user ID found)");
		}

		// Step 4: Delete person record
		if (personId) {
			console.log("\n🗑️  Step 4: Deleting person record...");
			try {
				await prisma.person.delete({
					where: { id: personId },
				});
				console.log("✅ Person record deleted");
			} catch (error: any) {
				console.warn(`⚠️  Person deletion failed: ${error.message}`);
				console.log("   (Person deletion might not be supported or already cascaded)");
			}
		} else {
			console.log("\n⏭️  Step 4: Skipping person deletion (no person ID found)");
		}

		console.log("\n✨ Deletion process completed!\n");
		console.log("📊 Summary:");
		console.log(`   - Employee "${employeeName}" and all relations have been deleted`);
		console.log(`   - Employee ID: ${employeeId}`);
		console.log(`   - User ID: ${userId || "N/A"}`);
		console.log(`   - Person ID: ${personId || "N/A"}\n`);

		return { success: true, employeeId, employeeName };
	} catch (error: any) {
		console.error("\n❌ Error during deletion process:");
		console.error(error.message);
		return {
			success: false,
			employeeId,
			error: error.message,
	};
}

function assertLocalDestructiveExecutionAllowed(): void {
	const allowFlag = String(process.env[REQUIRE_CONFIRM_ENV] || "").trim().toLowerCase();
	if (allowFlag !== "true") {
		throw new Error(
			`Refusing to run destructive delete script. Set ${REQUIRE_CONFIRM_ENV}=true to confirm local-only execution.`,
		);
	}

	if (!isLocalHostUrl(API_BASE_URL)) {
		throw new Error(
			`Refusing to call non-local API_BASE_URL (${API_BASE_URL}). This script only allows localhost/127.0.0.1 targets.`,
		);
	}
}
}

async function deleteAllEmployees(): Promise<void> {
	console.log("\n🔍 Fetching all employees (excluding seeder employees)...\n");

	const employees = await fetchAllEmployees();

	if (employees.length === 0) {
		console.log("✅ No employees found in the system (seeder employees are protected).\n");
		return;
	}

	console.log(
		`⚠️  WARNING: You are about to delete ${employees.length} employee(s) and all their associated data!`,
	);
	console.log(
		"⚡ Seeder employees (@uzaro.local, @seed.local) are automatically excluded and protected.",
	);
	console.log("This action is IRREVERSIBLE!\n");
	console.log("🔥 Starting bulk deletion in 3 seconds... Press Ctrl+C to cancel\n");

	// Give user a chance to cancel
	await new Promise((resolve) => setTimeout(resolve, 3000));

	// Step 0: Clear all reportTo relationships first to avoid foreign key violations
	console.log("🔗 Step 0: Clearing all reportTo relationships...\n");
	try {
		await prisma.employee.updateMany({
			where: {
				reportToId: { not: null },
			},
			data: {
				reportToId: null,
			},
		});
		console.log("✅ All reportTo relationships cleared\n");
	} catch (error: any) {
		console.warn(`⚠️  Failed to clear reportTo relationships: ${error.message}\n`);
	}

	const results = {
		total: employees.length,
		success: 0,
		failed: 0,
		errors: [] as any[],
	};

	console.log("🚀 Starting bulk deletion process...\n");
	console.log("━".repeat(60));

	for (let i = 0; i < employees.length; i++) {
		const employee = employees[i];
		console.log(`\n[${i + 1}/${employees.length}] Processing employee: ${employee.id}`);
		console.log("─".repeat(60));

		const result = await deleteEmployeeWithRelations(employee.id, false);

		if (result.success) {
			results.success++;
		} else {
			results.failed++;
			results.errors.push({
				employeeId: employee.id,
				error: result.error,
			});
		}

		console.log("─".repeat(60));
	}

	console.log("\n" + "━".repeat(60));
	console.log("\n✨ Bulk deletion completed!\n");
	console.log("📊 Final Summary:");
	console.log(`   - Total employees processed: ${results.total}`);
	console.log(`   - Successfully deleted: ${results.success}`);
	console.log(`   - Failed: ${results.failed}\n`);

	if (results.errors.length > 0) {
		console.log("❌ Failed deletions:");
		results.errors.forEach((err, idx) => {
			console.log(`   ${idx + 1}. Employee ID: ${err.employeeId}`);
			console.log(`      Error: ${err.error}\n`);
		});
	}
}

// Main execution
const args = process.argv.slice(2);
const isDeleteAll = args.includes("--all");

async function main(): Promise<void> {
	assertLocalDestructiveExecutionAllowed();

	if (isDeleteAll) {
		// Delete all employees
		await deleteAllEmployees();
	} else {
		// Delete single employee
		const employeeId = args[0];

		if (!employeeId) {
			console.error("❌ Employee ID is required\n");
			console.log("Usage:");
			console.log("  Single employee: npm run delete:employee <employeeId>");
			console.log("  All employees:   npm run delete:all-employees\n");
			console.log("Examples:");
			console.log("  npm run delete:employee 69521f9a8a1bae913dd1a143");
			console.log("  npm run delete:all-employees\n");
			process.exit(1);
		}

		// Confirmation prompt
		console.log(
			"\n⚠️  WARNING: This will permanently delete the employee and all associated data!\n",
		);
		console.log(`Employee ID to delete: ${employeeId}\n`);

		await deleteEmployeeWithRelations(employeeId);
	}
}

// Run main and handle cleanup
main()
	.catch((error) => {
		console.error("Script failed:", error);
		process.exit(1);
	})
	.finally(async () => {
		await prisma.$disconnect();
	});
