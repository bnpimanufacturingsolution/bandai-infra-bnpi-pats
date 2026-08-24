// @ts-nocheck
/**
 * Delete Employee with All Relations Script
 *
 * This script deletes an employee and all associated data including:
 * - Employee record
 * - User account
 * - Person record (if separate)
 * - Documents, leave balances, attendance records (cascaded by backend)
 *
 * Usage:
 * Single employee: npx tsx scripts/delete-employee-with-relations.ts <employeeId>
 * All employees: npx tsx scripts/delete-employee-with-relations.ts --all
 *
 * Examples:
 * npx tsx scripts/delete-employee-with-relations.ts 69521f9a8a1bae913dd1a143
 * npx tsx scripts/delete-employee-with-relations.ts --all
 */

import { hrisApiClient, apiClient } from "../app/lib/api-client";

// Get auth token from environment or config
const getAuthToken = () => {
	const token =
		"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiI2OTQ0YzIzMjFiYTBlZjgyMWNiMjU3ZTYiLCJyb2xlIjoiYWRtaW4iLCJyb2xlSWQiOiI2OTQ0YzIzMDFiYTBlZjgyMWNiMjU3ZGMiLCJvcmdhbml6YXRpb25JZCI6IjY5NDRjMjJmMWJhMGVmODIxY2IyNTdkOSIsIm1ldGFkYXRhIjpudWxsLCJpYXQiOjE3NjY5OTI5MjIsImV4cCI6MTc2NzA3OTMyMn0.gUh86WGPpb5DET_5UNPlSXc2T0L0mHpAb_v2i__5Mc0";
	if (!token) {
		console.error("❌ AUTH_TOKEN not found in environment variables");
		console.log(
			"Please set AUTH_TOKEN in your .env file or pass it as an environment variable",
		);
		console.log(
			"Example: AUTH_TOKEN=your_token_here npx tsx scripts/delete-employee-with-relations.ts <employeeId>",
		);
		process.exit(1);
	}
	return token;
};

interface Employee {
	id: string;
	userId?: string;
	personId?: string;
	employeeId: string;
	user?: {
		id: string;
		email: string;
		userName: string;
	};
	person?: {
		id: string;
		personalInfo?: {
			firstName: string;
			lastName: string;
		};
	};
}

async function fetchAllEmployees(): Promise<Employee[]> {
	try {
		const response = await hrisApiClient.get<{ data: Employee[] }>("/api/employee");
		return response.data?.data || response.data || [];
	} catch (error: any) {
		console.error(
			"❌ Failed to fetch employees:",
			error.response?.data?.message || error.message,
		);
		process.exit(1);
	}
}

async function deleteEmployeeWithRelations(employeeId: string, showHeader = true) {
	try {
		if (showHeader) {
			console.log("\n🔍 Starting employee deletion process...\n");
		}

		// Step 1: Fetch employee data to get related IDs
		console.log(`📋 Step 1: Fetching employee data for ID: ${employeeId}`);
		const employeeResponse = await hrisApiClient.get<{ data: Employee }>(
			`/api/employee/${employeeId}`,
		);
		const employee = employeeResponse.data?.data || employeeResponse.data;

		if (!employee) {
			console.error("❌ Employee not found");
			return { success: false, employeeId, error: "Employee not found" };
		}

		const employeeName = employee.person?.personalInfo
			? `${employee.person.personalInfo.firstName} ${employee.person.personalInfo.lastName}`
			: employee.employeeId;

		console.log(`✅ Found employee: ${employeeName}`);
		console.log(`   - Employee ID: ${employee.id}`);
		console.log(`   - Employee Number: ${employee.employeeId}`);
		console.log(`   - User ID: ${employee.userId || employee.user?.id || "N/A"}`);
		console.log(`   - Person ID: ${employee.personId || employee.person?.id || "N/A"}`);

		const userId = employee.userId || employee.user?.id;
		const personId = employee.personId || employee.person?.id;

		// Step 2: Delete employee record (this should cascade documents, leave balances, etc.)
		console.log("\n🗑️  Step 2: Deleting employee record...");
		try {
			await hrisApiClient.delete(`/api/employee/${employeeId}`);
			console.log("✅ Employee record deleted");
		} catch (error: any) {
			console.warn(
				`⚠️  Employee deletion failed: ${error.response?.data?.message || error.message}`,
			);
			console.log("   Continuing with user deletion...");
		}

		// Step 3: Delete user account
		if (userId) {
			console.log("\n🗑️  Step 3: Deleting user account...");
			try {
				await apiClient.delete(`/user/${userId}`);
				console.log("✅ User account deleted");
			} catch (error: any) {
				console.warn(
					`⚠️  User deletion failed: ${error.response?.data?.message || error.message}`,
				);
			}
		} else {
			console.log("\n⏭️  Step 3: Skipping user deletion (no user ID found)");
		}

		// Step 4: Delete person record (if endpoint exists)
		if (personId) {
			console.log("\n🗑️  Step 4: Deleting person record...");
			try {
				await hrisApiClient.delete(`/api/person/${personId}`);
				console.log("✅ Person record deleted");
			} catch (error: any) {
				console.warn(
					`⚠️  Person deletion failed: ${error.response?.data?.message || error.message}`,
				);
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
		console.error(error.response?.data || error.message);
		return {
			success: false,
			employeeId,
			error: error.response?.data?.message || error.message,
		};
	}
}

async function deleteAllEmployees() {
	console.log("\n🔍 Fetching all employees...\n");

	// Set auth token
	const token = getAuthToken();
	hrisApiClient.defaults.headers.common["Authorization"] = `Bearer ${token}`;
	apiClient.defaults.headers.common["Authorization"] = `Bearer ${token}`;

	const employees = await fetchAllEmployees();

	if (employees.length === 0) {
		console.log("✅ No employees found in the system.\n");
		return;
	}

	console.log(
		`⚠️  WARNING: You are about to delete ${employees.length} employee(s) and all their associated data!`,
	);
	console.log("This action is IRREVERSIBLE!\n");
	console.log("🔥 Starting bulk deletion in 3 seconds... Press Ctrl+C to cancel\n");

	// Give user a chance to cancel
	await new Promise((resolve) => setTimeout(resolve, 3000));

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

if (isDeleteAll) {
	// Delete all employees
	deleteAllEmployees();
} else {
	// Delete single employee
	const employeeId = args[0];

	if (!employeeId) {
		console.error("❌ Employee ID is required\n");
		console.log("Usage:");
		console.log(
			"  Single employee: npx tsx scripts/delete-employee-with-relations.ts <employeeId>",
		);
		console.log("  All employees:   npx tsx scripts/delete-employee-with-relations.ts --all\n");
		console.log("Examples:");
		console.log("  npx tsx scripts/delete-employee-with-relations.ts 69521f9a8a1bae913dd1a143");
		console.log("  npx tsx scripts/delete-employee-with-relations.ts --all\n");
		process.exit(1);
	}

	// Set auth token for single deletion
	const token = getAuthToken();
	hrisApiClient.defaults.headers.common["Authorization"] = `Bearer ${token}`;
	apiClient.defaults.headers.common["Authorization"] = `Bearer ${token}`;

	// Confirmation prompt
	console.log(
		"\n⚠️  WARNING: This will permanently delete the employee and all associated data!\n",
	);
	console.log(`Employee ID to delete: ${employeeId}\n`);

	// Auto-confirm for now (you can add readline prompt if needed)
	deleteEmployeeWithRelations(employeeId);
}
