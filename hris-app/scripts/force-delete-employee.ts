/**
 * Force Delete Employee Script
 *
 * Deletes employee and related accounts from both HRIS and Auth Service.
 * Uses native fetch for standalone execution.
 *
 * Usage:
 * npx tsx scripts/force-delete-employee.ts <employeeId>
 * npx tsx scripts/force-delete-employee.ts --all
 */

import { fetch } from "undici"; // Or native fetch in Node 18+

const DEFAULT_API_BASE_URL = "https://hris-api-dev-161377059311.asia-southeast1.run.app";
const resolveApiBase = () =>
	(process.env.VITE_API_BASE_URL || process.env.AUTH_BASE_URL || DEFAULT_API_BASE_URL).replace(
		/\/+$/,
		"",
	);
const withApiSuffix = (base: string) =>
	base.toLowerCase().endsWith("/api") ? base : `${base}/api`;

// Configuration
const API_BASE_URL = resolveApiBase();
const HRIS_API_URL = withApiSuffix(API_BASE_URL);
const AUTH_API_URL = withApiSuffix(API_BASE_URL);

// Helper to get auth token
const getAuthToken = () => {
	return (
		process.env.AUTH_TOKEN ||
		"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiI2OTQ0YzIzMjFiYTBlZjgyMWNiMjU3ZTYiLCJyb2xlIjoiYWRtaW4iLCJyb2xlSWQiOiI2OTQ0YzIzMDFiYTBlZjgyMWNiMjU3ZGMiLCJvcmdhbml6YXRpb25JZCI6IjY5NDRjMjJmMWJhMGVmODIxY2IyNTdkOSIsIm1ldGFkYXRhIjpudWxsLCJpYXQiOjE3Njc1ODUxNDksImV4cCI6MTc2NzY3MTU0OX0.hCvujSEc0-88lRzuMk1JbSsHB-2P5gM61gRIdHuJ8Es"
	);
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
	const token = getAuthToken();
	try {
		console.log(`Fetching employees from ${HRIS_API_URL}/employee...`);
		const response = await fetch(`${HRIS_API_URL}/employee`, {
			headers: { Authorization: `Bearer ${token}` },
		});

		if (!response.ok) {
			throw new Error(`HTTP Error: ${response.status} ${response.statusText}`);
		}

		const data: any = await response.json();
		return data?.data || data || [];
	} catch (error: any) {
		console.error("❌ Failed to fetch employees:", error.message);
		process.exit(1);
	}
}

async function deleteEmployeeWithRelations(employeeId: string, showHeader = true) {
	const token = getAuthToken();
	try {
		if (showHeader) {
			console.log("\n🔍 Starting employee deletion process...\n");
		}

		// Step 1: Fetch employee data to get related IDs
		console.log(`📋 Step 1: Fetching employee data for ID: ${employeeId}`);
		const response = await fetch(`${HRIS_API_URL}/employee/${employeeId}`, {
			headers: { Authorization: `Bearer ${token}` },
		});

		if (!response.ok) {
			console.warn(
				`⚠️  Cannot fetch employee ${employeeId}: ${response.status} ${response.statusText}`,
			);
			return { success: false, employeeId, error: "Employee not found via API" };
		}

		const json: any = await response.json();
		const employee: Employee = json?.data || json;

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

		// Step 2: Delete employee record
		console.log("\n🗑️  Step 2: Deleting employee record...");
		try {
			const delResp = await fetch(`${HRIS_API_URL}/employee/${employeeId}`, {
				method: "DELETE",
				headers: { Authorization: `Bearer ${token}` },
			});
			if (delResp.ok) {
				console.log("✅ Employee record deleted");
			} else {
				console.warn(`⚠️  Employee deletion failed: ${delResp.status}`);
			}
		} catch (error: any) {
			console.warn(`⚠️  Employee deletion error: ${error.message}`);
			console.log("   Continuing with user deletion...");
		}

		// Step 3: Delete user account
		if (userId) {
			console.log("\n🗑️  Step 3: Deleting user account...");
			try {
				const userDelResp = await fetch(`${AUTH_API_URL}/user/${userId}`, {
					method: "DELETE",
					headers: { Authorization: `Bearer ${token}` },
				});
				if (userDelResp.ok) {
					console.log("✅ User account deleted");
				} else {
					const text = await userDelResp.text();
					console.warn(`⚠️  User deletion failed: ${userDelResp.status} - ${text}`);
				}
			} catch (error: any) {
				console.warn(`⚠️  User deletion error: ${error.message}`);
			}
		} else {
			console.log("\n⏭️  Step 3: Skipping user deletion (no user ID found)");
		}

		// Step 4: Delete person record
		if (personId) {
			console.log("\n🗑️  Step 4: Deleting person record...");
			try {
				const personDelResp = await fetch(`${HRIS_API_URL}/person/${personId}`, {
					method: "DELETE",
					headers: { Authorization: `Bearer ${token}` },
				});
				if (personDelResp.ok) {
					console.log("✅ Person record deleted");
				} else {
					console.warn(`⚠️  Person deletion failed: ${personDelResp.status}`);
				}
			} catch (error: any) {
				console.warn(`⚠️  Person deletion error: ${error.message}`);
			}
		} else {
			console.log("\n⏭️  Step 4: Skipping person deletion (no person ID found)");
		}

		console.log("\n✨ Deletion process completed!\n");
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
}

async function deleteAllEmployees() {
	console.log("\n🔍 Fetching all employees...\n");

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

	console.log("🚀 Starting bulk deletion process...\n");
	console.log("━".repeat(60));

	for (let i = 0; i < employees.length; i++) {
		const employee = employees[i];
		console.log(`\n[${i + 1}/${employees.length}] Processing employee: ${employee.id}`);
		console.log("─".repeat(60));
		await deleteEmployeeWithRelations(employee.id, false);
		// Small delay
		await new Promise((r) => setTimeout(r, 500));
	}
	console.log("\nAll done.");
}

// Main execution
const args = process.argv.slice(2);
const allFlag = args.includes("--all");
const employeeId = args.find((arg) => !arg.startsWith("--"));

if (allFlag) {
	deleteAllEmployees();
} else if (employeeId) {
	deleteEmployeeWithRelations(employeeId);
} else {
	console.log("Usage:");
	console.log("  npx tsx scripts/force-delete-employee.ts <employeeId>");
	console.log("  npx tsx scripts/force-delete-employee.ts --all");
}
