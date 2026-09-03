/**
 * Attendance Metrics Reports Script
 * Tests different aggregation strategies for attendance metrics
 * Demonstrates best practices for Employee vs Attendance aggregation
 *
 * Usage:
 *   npm run metrics:reports
 *   npm run metrics:reports:detailed
 *
 * Options:
 *   --detailed        Show detailed per-employee breakdown with progress bars
 */

import { PrismaClient } from "../generated/prisma";
import { calculatePerfectAttendanceMetrics } from "../helper/perfect-attendance-metrics.helper";
import { calculateTardinessMetrics } from "../helper/tardiness-metrics.helper";
import { calculateOvertimeMetrics } from "../helper/overtime-metrics.helper";
import { calculateLeaveBalanceMetrics } from "../helper/leave-balance-metrics.helper";

const prisma = new PrismaClient();

// ============================================================================
// Console Formatting
// ============================================================================

const RESET = "\x1b[0m";
const BOLD = "\x1b[1m";
const DIM = "\x1b[2m";

function getColorCode(percentage: number): string {
	if (percentage >= 90) return "\x1b[32m"; // Green
	if (percentage >= 75) return "\x1b[33m"; // Yellow
	if (percentage >= 60) return "\x1b[36m"; // Cyan
	return "\x1b[31m"; // Red
}

function progressBar(percentage: number, width: number = 30): string {
	const filled = Math.round((percentage / 100) * width);
	const empty = width - filled;
	return `[${"█".repeat(filled)}${"░".repeat(empty)}]`;
}

async function testMetricsAggregation(detailed: boolean = false) {
	console.clear();
	console.log("\n");
	console.log(
		BOLD + "╔═══════════════════════════════════════════════════════════════════════╗" + RESET,
	);
	console.log(
		BOLD + "║              📊 ATTENDANCE METRICS REPORTS DASHBOARD 📊               ║" + RESET,
	);
	console.log(
		BOLD + "╚═══════════════════════════════════════════════════════════════════════╝" + RESET,
	);
	console.log("\n");

	// Get organization
	const org = await prisma.employee.findFirst({
		where: { isDeleted: false },
		select: { organizationId: true },
	});

	if (!org?.organizationId) {
		console.error("❌ No organization found!");
		return;
	}

	console.log(`${DIM}🏢 Organization ID: ${org.organizationId}${RESET}`);

	// Date range - last 30 days
	const endDate = new Date();
	endDate.setHours(23, 59, 59, 999);
	const startDate = new Date(endDate);
	startDate.setDate(startDate.getDate() - 30);
	startDate.setHours(0, 0, 0, 0);

	console.log(
		`${DIM}📅 Date Range: ${startDate.toISOString().split("T")[0]} to ${endDate.toISOString().split("T")[0]}${RESET}`,
	);
	console.log("\n");

	// ========================================================================
	// 1. PERFECT ATTENDANCE
	// ========================================================================
	console.log(BOLD + "┌─ ✅ PERFECT ATTENDANCE (Start from Employee)" + RESET);
	console.log("│");

	const perfectMetrics = await calculatePerfectAttendanceMetrics(
		prisma,
		org.organizationId,
		startDate,
		endDate,
	);

	const perfectPct = perfectMetrics.perfectAttendanceRate;
	const perfectColor = getColorCode(perfectPct);

	console.log(`│  Total Active Employees: ${BOLD}${perfectMetrics.totalEmployees}${RESET}`);
	console.log(
		`│  Perfect Attendance:     ${perfectColor}${BOLD}${perfectMetrics.perfectAttendanceCount}${RESET} (${Math.round(perfectPct)}%)`,
	);
	console.log(`│  ${perfectColor}${progressBar(perfectPct, 50)}${RESET}`);
	console.log("│");

	if (detailed && perfectMetrics.perfectAttendanceCount > 0) {
		console.log("│  Perfect Attendance Employees:");
		perfectMetrics.employees
			.filter((emp) => emp.isPerfect)
			.slice(0, 10)
			.forEach((emp) => {
				console.log(`│    • ${emp.name} ${DIM}(${emp.employeeId})${RESET}`);
			});
		const perfectCount = perfectMetrics.employees.filter((e) => e.isPerfect).length;
		if (perfectCount > 10) {
			console.log(`│    ${DIM}... and ${perfectCount - 10} more${RESET}`);
		}
		console.log("│");
	}
	console.log("└" + "─".repeat(70));
	console.log("\n");

	// ========================================================================
	// 2. TARDINESS & UNDERTIME DETAILS
	// ========================================================================
	console.log(
		BOLD + "┌─ ⏰ TARDINESS, UNDERTIME & EARLY OUT DETAILS (Start from Employee)" + RESET,
	);
	console.log("│");

	const tardinessMetrics = await calculateTardinessMetrics(
		prisma,
		org.organizationId,
		startDate,
		endDate,
	);

	console.log(
		`│  Employees with Issues:  ${BOLD}\x1b[31m${tardinessMetrics.employeesWithIssues}${RESET}`,
	);
	console.log("│");
	console.log(`│  ${BOLD}Late (Clock-In):${RESET}`);
	console.log(
		`│    Instances: ${BOLD}${tardinessMetrics.totalTardinessInstances}${RESET} | Total Hours: ${BOLD}\x1b[31m${tardinessMetrics.totalLateHours}${RESET} hrs`,
	);
	console.log("│");
	console.log(`│  ${BOLD}Undertime (Short of Schedule):${RESET}`);
	console.log(
		`│    Instances: ${BOLD}${tardinessMetrics.totalUndertimeInstances}${RESET} | Total Hours: ${BOLD}\x1b[31m${tardinessMetrics.totalUndertimeHours}${RESET} hrs`,
	);
	console.log("│");
	console.log(`│  ${BOLD}Early Out (Clock-Out):${RESET}`);
	console.log(
		`│    Instances: ${BOLD}${tardinessMetrics.totalEarlyOutInstances}${RESET} | Total Hours: ${BOLD}\x1b[31m${tardinessMetrics.totalEarlyOutHours}${RESET} hrs`,
	);
	console.log("│");

	if (detailed && tardinessMetrics.employees.length > 0) {
		console.log("│  " + BOLD + "Top 10 Employees with Time Violations:" + RESET);
		console.log("│");

		tardinessMetrics.employees.slice(0, 10).forEach((stat, idx) => {
			const lateHrs = Math.round((stat.totalLateMinutes / 60) * 100) / 100;
			const utHrs = Math.round((stat.totalUndertimeMinutes / 60) * 100) / 100;
			const eoHrs = Math.round((stat.totalEarlyOutMinutes / 60) * 100) / 100;

			console.log(
				`│    ${idx + 1}. ${stat.name} ${DIM}(${stat.employeeId}) - ${stat.department}${RESET}`,
			);
			console.log(
				`│       Late: ${stat.tardinessCount}× (${lateHrs}hrs) | Undertime: ${stat.undertimeCount}× (utHrs}hrs) | Early Out: ${stat.earlyOutCount}× (${eoHrs}hrs)`,
			);
		});
		console.log("│");
	}
	console.log("└" + "─".repeat(70));
	console.log("\n");

	// ========================================================================
	// 3. OVERTIME DETAILS
	// ========================================================================
	console.log(BOLD + "┌─ 📈 OVERTIME DETAILS (Start from Employee)" + RESET);
	console.log("│");

	const overtimeMetrics = await calculateOvertimeMetrics(
		prisma,
		org.organizationId,
		startDate,
		endDate,
	);

	console.log(
		`│  Employees with Overtime: ${BOLD}\x1b[33m${overtimeMetrics.employeesWithOvertime}${RESET}`,
	);
	console.log(
		`│  Total Overtime Hours:    ${BOLD}\x1b[33m${overtimeMetrics.totalOvertimeHours}${RESET} hrs`,
	);
	console.log("│");

	if (detailed && overtimeMetrics.employees.length > 0) {
		console.log("│  Top 10 Overtime Workers:");
		overtimeMetrics.employees.slice(0, 10).forEach((stat, idx) => {
			console.log(`│    ${idx + 1}. ${stat.name} ${DIM}(${stat.employeeId})${RESET}`);
			console.log(
				`│       ${stat.overtimeCount} days, ${stat.totalOvertimeHours}hrs total OT`,
			);
		});
		console.log("│");
	}
	console.log("└" + "─".repeat(70));
	console.log("\n");

	// ========================================================================
	// 4. LEAVE BALANCE TRACKING
	// ========================================================================
	console.log(
		BOLD + "┌─ 🏖️ LEAVE BALANCE TRACKING (Start from Employee - Embedded Data)" + RESET,
	);
	console.log("│");

	const leaveMetrics = await calculateLeaveBalanceMetrics(prisma, org.organizationId);

	console.log(`│  Active Employees: ${BOLD}${leaveMetrics.totalEmployees}${RESET}`);
	console.log("│");

	console.log("│  " + BOLD + "Leave Balance Summary by Type:" + RESET);
	leaveMetrics.leaveTypeSummary.forEach((summary) => {
		const utilColor = getColorCode(100 - summary.utilizationRate);

		console.log(`│    ${summary.leaveType}:`);
		console.log(`│      Employees: ${summary.employeeCount}`);
		console.log(
			`│      Avg: ${summary.avgEntitled} entitled | ${summary.avgUsed} used | ${summary.avgAvailable} available`,
		);
		console.log(
			`│      Utilization: ${utilColor}${summary.utilizationRate}%${RESET} ${utilColor}${progressBar(summary.utilizationRate, 30)}${RESET}`,
		);
	});
	console.log("│");

	// Display comprehensive leave balance for each employee (if detailed)
	if (detailed && leaveMetrics.employees.length > 0) {
		console.log("│  " + BOLD + "Detailed Employee Leave Balances:" + RESET);
		console.log("│");

		leaveMetrics.employees.slice(0, 10).forEach((emp) => {
			console.log(
				`│    👤 ${emp.name} ${DIM}(${emp.employeeId}) - ${emp.department}${RESET}`,
			);

			if (!emp.leaveBalances || emp.leaveBalances.length === 0) {
				console.log("│       ⚠️  No leave balances configured");
			} else {
				emp.leaveBalances.forEach((lb) => {
					console.log(
						`│       📋 ${lb.leaveType}: ${lb.totalEntitled} entitled | ${lb.used} used | ${lb.pending} pending | ${lb.available} available`,
					);
					if (lb.carriedOver > 0) {
						console.log(`│          Carried Over: ${lb.carriedOver} days`);
					}
				});
			}
			console.log("│");
		});

		if (leaveMetrics.employees.length > 10) {
			console.log(
				`│    ${DIM}... and ${leaveMetrics.employees.length - 10} more employees${RESET}`,
			);
			console.log("│");
		}
	}

	console.log("└" + "─".repeat(70));
	console.log("\n");

	// ========================================================================
	// SUMMARY
	// ========================================================================
	console.log(
		BOLD + "╔═══════════════════════════════════════════════════════════════════════╗" + RESET,
	);
	console.log(
		BOLD + "║                    AGGREGATION STRATEGY SUMMARY                       ║" + RESET,
	);
	console.log(
		BOLD + "╚═══════════════════════════════════════════════════════════════════════╝" + RESET,
	);
	console.log();
	console.log("✓ All metrics use " + BOLD + "Employee" + RESET + " as the starting point");
	console.log("✓ This ensures we capture ALL employees, including those with zero values");
	console.log("✓ Attendance, Request, and LeaveBalance data are joined/filtered as needed");
	console.log();
	console.log(BOLD + "Key Benefits:" + RESET);
	console.log("  1. Complete roster visibility (no missing employees)");
	console.log("  2. Ability to show 0 values (perfect attendance, no OT, etc.)");
	console.log("  3. Easy filtering by department, status, etc.");
	console.log("  4. Consistent pattern across all metrics");
	console.log();
	console.log(`${DIM}💡 Run with --detailed flag for per-employee breakdown${RESET}`);
	console.log(`${DIM}Generated at: ${new Date().toLocaleString()}${RESET}`);
	console.log("\n");
}

// Run the test
const args = process.argv.slice(2);
const isDetailed = args.includes("--detailed");

testMetricsAggregation(isDetailed)
	.catch((error) => {
		console.error("Test failed:", error);
		process.exit(1);
	})
	.finally(async () => {
		await prisma.$disconnect();
	});
