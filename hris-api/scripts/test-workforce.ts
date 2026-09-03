/**
 * Test script for workforce metrics
 * Run with: npm run test:workforce
 */

import { PrismaClient } from "../generated/prisma";
import {
	calculateAgencyAttendanceSummary,
	calculateDailyActiveManpower,
	calculateNoWorkReport,
} from "../helper/workforce-metrics.helper";

const prisma = new PrismaClient();

function printEmployeeRows(rows: Array<{
	employeeId: string;
	name: string;
	department: string;
	position: string;
	employer?: string;
	status?: string;
}>) {
	if (rows.length === 0) {
		console.log("No employee rows found.\n");
		return;
	}

	rows.forEach((row, index) => {
		console.log(
			`${index + 1}. ${row.name} (${row.employeeId}) | Dept: ${row.department} | Position: ${row.position} | Employer: ${row.employer || "N/A"}${row.status ? ` | Status: ${row.status}` : ""}`,
		);
	});
	console.log("");
}

async function main() {
	try {
		console.log("=== WORKFORCE METRICS TEST ===\n");

		// Replace with your actual organization ID when needed
		const organizationId = "69b39a3cf32f1e6aa097b4cd";
		const targetDate = new Date("2026-03-13");

		console.log(`Organization ID: ${organizationId}`);
		console.log(`Target Date: ${targetDate.toISOString().split("T")[0]}\n`);

		console.log("Test 1: No Work Report");
		const noWorkReport = await calculateNoWorkReport(prisma, organizationId, targetDate);
		console.log(`No Work Count: ${noWorkReport.noWorkCount}`);
		console.log("Expected meaning: employees scheduled to work but with no attendance record");
		printEmployeeRows(noWorkReport.employees);

		console.log("Test 2: Daily Active Manpower");
		const dailyActiveManpower = await calculateDailyActiveManpower(
			prisma,
			organizationId,
			targetDate,
		);
		console.log(`Active Manpower Count: ${dailyActiveManpower.activeManpowerCount}`);
		console.log(
			"Expected meaning: employees with PRESENT, INCOMPLETE, or any attendance with time-in",
		);
		printEmployeeRows(dailyActiveManpower.employees);

		console.log("Test 3: Agency Attendance Summary");
		const agencyAttendanceSummary = await calculateAgencyAttendanceSummary(
			prisma,
			organizationId,
			targetDate,
			targetDate,
		);
		console.log(`Total Agencies: ${agencyAttendanceSummary.totalAgencies}`);
		console.log("Expected meaning: grouped attendance summary by employee.employer.name\n");

		if (agencyAttendanceSummary.items.length === 0) {
			console.log("No agency attendance summary rows found.\n");
		} else {
			agencyAttendanceSummary.items.forEach((item, index) => {
				console.log(`${index + 1}. Agency: ${item.agency}`);
				console.log(`   Total Agency Employees: ${item.totalAgencyEmployees}`);
				console.log(`   Scheduled Work Days: ${item.scheduledWorkDays}`);
				console.log(`   Active Manpower: ${item.activeManpower}`);
				console.log(`   No Work Report Count: ${item.noWorkReportCount}`);
				console.log(`   Leave Count: ${item.leaveCount}`);
				console.log(`   Attendance Rate: ${item.attendanceRate.toFixed(2)}%\n`);
			});
		}

		console.log("=== ALL WORKFORCE TESTS COMPLETED ===");
	} catch (error) {
		console.error("Error running workforce test:", error);
		process.exitCode = 1;
	} finally {
		await prisma.$disconnect();
	}
}

main();
