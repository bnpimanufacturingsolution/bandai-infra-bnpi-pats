/**
 * Test script for Attendance Summary Helper
 * Demonstrates how to get attendance aggregates for today, week, and month
 */

import { PrismaClient } from "../generated/prisma";
import { getAttendanceSummaryReport } from "../helper/attendance-summary.helper";

const prisma = new PrismaClient();

async function main() {
	try {
		console.log("=== ATTENDANCE SUMMARY REPORT ===\n");

		// Replace with your actual organization ID
		const organizationId = "69884da971e2dc9d6ac67b59";

		// Get comprehensive summary
		const report = await getAttendanceSummaryReport(prisma, organizationId);

		console.log("📅 Generated At:", report.generatedAt.toLocaleString());
		console.log("\n" + "=".repeat(80));

		// TODAY'S SUMMARY
		console.log("\n📊 TODAY'S ATTENDANCE");
		console.log("─".repeat(80));
		printSummary(report.today);

		// THIS WEEK'S SUMMARY
		console.log("\n📊 THIS WEEK'S ATTENDANCE");
		console.log("─".repeat(80));
		printSummary(report.thisWeek);

		// THIS MONTH'S SUMMARY
		console.log("\n📊 THIS MONTH'S ATTENDANCE");
		console.log("─".repeat(80));
		printSummary(report.thisMonth);

		console.log("\n" + "=".repeat(80));
	} catch (error) {
		console.error("Error:", error);
	} finally {
		await prisma.$disconnect();
	}
}

function printSummary(summary: any) {
	const {
		totalEmployees,
		present,
		absent,
		onLeave,
		late,
		undertime,
		overtime,
		notYetIn,
		attendanceRate,
	} = summary;

	console.log(`Total Employees:     ${totalEmployees}`);
	console.log(`Present:             ${present} ${createBar(present, totalEmployees, "green")}`);
	console.log(`Absent:              ${absent} ${createBar(absent, totalEmployees, "red")}`);
	console.log(`On Leave:            ${onLeave} ${createBar(onLeave, totalEmployees, "blue")}`);
	console.log(`Late:                ${late} ${createBar(late, totalEmployees, "yellow")}`);
	console.log(
		`Undertime:           ${undertime} ${createBar(undertime, totalEmployees, "orange")}`,
	);
	console.log(`Overtime:            ${overtime} ${createBar(overtime, totalEmployees, "cyan")}`);

	if (notYetIn > 0) {
		console.log(
			`Not Yet In:          ${notYetIn} ${createBar(notYetIn, totalEmployees, "gray")}`,
		);
	}

	console.log(`\nAttendance Rate:     ${attendanceRate.toFixed(2)}%`);
	console.log(createPercentageBar(attendanceRate));
}

function createBar(value: number, total: number, color: string): string {
	if (total === 0 || value === 0) return "";

	const percentage = Math.min((value / total) * 100, 100); // Cap at 100%
	const barLength = Math.max(0, Math.min(50, Math.round(percentage / 2))); // Scale to 50 chars max, ensure non-negative
	const emptyLength = Math.max(0, 50 - barLength); // Ensure non-negative

	const colors: Record<string, string> = {
		green: "\x1b[32m",
		red: "\x1b[31m",
		blue: "\x1b[34m",
		yellow: "\x1b[33m",
		orange: "\x1b[38;5;208m",
		cyan: "\x1b[36m",
		gray: "\x1b[90m",
	};

	const reset = "\x1b[0m";
	const colorCode = colors[color] || "";

	return `${colorCode}${"█".repeat(barLength)}${reset}${"░".repeat(emptyLength)} ${percentage.toFixed(1)}%`;
}

function createPercentageBar(percentage: number): string {
	const barLength = Math.round(percentage / 2);
	const emptyLength = 50 - barLength;

	let color = "\x1b[31m"; // Red
	if (percentage >= 90)
		color = "\x1b[32m"; // Green
	else if (percentage >= 75) color = "\x1b[33m"; // Yellow

	const reset = "\x1b[0m";

	return `${color}${"█".repeat(barLength)}${reset}${"░".repeat(emptyLength)} ${percentage.toFixed(1)}%`;
}

main();
