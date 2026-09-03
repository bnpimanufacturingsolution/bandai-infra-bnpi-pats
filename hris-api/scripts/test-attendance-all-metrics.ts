/**
 * Comprehensive Attendance Metrics Script
 * Uses the same calculation logic as timesheet.controller.ts view endpoint
 *
 * Features:
 *   - Displays 4 main clickable metrics (Present, Absent, Late, On Leave)
 *   - Shows attendance log table with all schema columns (up to 30 records)
 *   - Includes virtual records for ABSENT and REST_DAY statuses
 *   - Sorted by date descending (most recent first)
 *
 * Usage:
 *   npm run metrics:attendance
 *   npm run metrics:attendance:detailed
 *
 * Options:
 *   --detailed        Show detailed per-employee breakdown
 *   --export          Export results to JSON file
 *   -org <orgId>      Organization ID (defaults to first found)
 *   -from <date>      Start date (YYYY-MM-DD, default: 7 days ago)
 *   -to <date>        End date (YYYY-MM-DD, default: today)
 */

import { PrismaClient } from "../generated/prisma";
import * as fs from "fs";
import { generateTimesheetSummary, generateDailyBreakdown } from "../helper/timekeeping.helper";

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

function formatMinutesAsTime(minutes: number): string {
	const hours = Math.floor(minutes / 60);
	const mins = minutes % 60;
	return `${hours}:${mins.toString().padStart(2, "0")}`;
}

// ============================================================================
// Types
// ============================================================================

interface EmployeeMetrics {
	employeeId: string;
	name: string;
	department: string;
	position: string;
	// 4 Main Status Counts (clickable/filterable)
	present: number;
	absent: number;
	late: number;
	onLeave: number;
	// Additional counts
	totalDays: number;
	daysRestDay: number;
	attendanceRate: number;
	// Time metrics from generateTimesheetSummary
	totalMinutesWorked: number;
	totalRegularMinutes: number;
	totalOvertimeMinutes: number;
	totalUndertimeMinutes: number;
	totalLateMinutes: number;
	totalEarlyOutMinutes: number;
}

interface OrgMetrics {
	organizationId: string;
	dateRange: { from: string; to: string };
	summary: {
		totalEmployees: number;
		// 4 Main Metrics (clickable/filterable)
		totalPresent: number;
		totalAbsent: number;
		totalLate: number;
		totalOnLeave: number;
		// Additional info
		avgAttendanceRate: number;
		totalMinutesWorked: number;
		totalOvertimeMinutes: number;
		totalUndertimeMinutes: number;
		totalLateMinutes: number;
		totalRestDay: number;
	};
	employees: EmployeeMetrics[];
}

// ============================================================================
// Helpers
// ============================================================================

function getArgValue(args: string[], flag: string): string | null {
	const index = args.indexOf(flag);
	return index !== -1 && index + 1 < args.length ? args[index + 1] : null;
}

// ============================================================================
// Main Calculation - Same as timesheet.controller.ts view endpoint
// ============================================================================

async function calculateEmployeeMetrics(
	employeeId: string,
	startDate: Date,
	endDate: Date,
): Promise<EmployeeMetrics | null> {
	// Get employee with schedule
	const employee = await prisma.employee.findUnique({
		where: { id: employeeId },
		include: {
			person: { select: { personalInfo: true } },
			department: true,
			position: true,
		},
	});

	if (!employee) return null;

	const name = `${employee.person?.personalInfo?.firstName || ""} ${employee.person?.personalInfo?.lastName || ""}`.trim() || employee.employeeId;

	// Get attendance records for the period
	const attendances = await prisma.attendance.findMany({
		where: {
			employeeId,
			isDeleted: false,
			date: { gte: startDate, lte: endDate },
		},
		orderBy: { date: "asc" },
	});

	// Create attendance map for quick lookup
	const attendanceMap = new Map<string, any>();
	attendances.forEach((att) => {
		if (att.date) {
			const dateKey = att.date.toISOString().split("T")[0];
			attendanceMap.set(dateKey, att);
		}
	});

	// Build full attendance records (same as timesheet.controller.ts view)
	const fullAttendanceRecords: any[] = [];
	const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

	if (employee.schedule && employee.schedule.shifts) {
		const currentDate = new Date(startDate);

		while (currentDate <= endDate) {
			const dateKey = currentDate.toISOString().split("T")[0];
			const dayOfWeek = currentDate.getDay();
			const dayName = dayNames[dayOfWeek];

			// Find shift for this day (same logic as timesheet controller)
			const shift = employee.schedule.shifts.find((s: any) => {
				const label = (s.label || "").toLowerCase();
				return (
					label.includes(dayName.toLowerCase()) ||
					label.includes(dayName.substring(0, 3).toLowerCase())
				);
			});

			const existingAttendance = attendanceMap.get(dateKey);

			if (shift) {
				if (shift.isRestDay) {
					// Rest day - virtual record
					fullAttendanceRecords.push({
						id: `rest-${dateKey}`,
						date: new Date(currentDate),
						timeIn: null,
						timeOut: null,
						status: "REST_DAY",
						scheduleSnapshot: employee.schedule,
						totalMinutesWorked: 0,
						regularMinutes: 0,
						overtimeMinutes: 0,
						undertimeMinutes: 0,
						lateMinutes: 0,
						earlyOutMinutes: 0,
					});
				} else if (existingAttendance) {
					// Work day with attendance - include schedule snapshot
					fullAttendanceRecords.push({
						...existingAttendance,
						scheduleSnapshot: existingAttendance.scheduleSnapshot || employee.schedule,
					});
				} else {
					// Work day without attendance - ABSENT
					fullAttendanceRecords.push({
						id: `absent-${dateKey}`,
						date: new Date(currentDate),
						timeIn: null,
						timeOut: null,
						status: "ABSENT",
						scheduleSnapshot: employee.schedule,
						totalMinutesWorked: 0,
						regularMinutes: 0,
						overtimeMinutes: 0,
						undertimeMinutes: 0,
						lateMinutes: 0,
						earlyOutMinutes: 0,
					});
				}
			}

			currentDate.setDate(currentDate.getDate() + 1);
		}
	} else {
		// No schedule - just use actual attendances
		fullAttendanceRecords.push(...attendances);
	}

	// Use generateTimesheetSummary (same as timesheet.controller.ts)
	const summary = generateTimesheetSummary(fullAttendanceRecords);

	// Count 4 Main Status Metrics (clickable/filterable)
	let present = 0;
	let absent = 0;
	let late = 0;
	let onLeave = 0;
	let daysRestDay = 0;

	for (const record of fullAttendanceRecords) {
		if (record.status === "REST_DAY") {
			daysRestDay++;
		} else if (record.status === "ABSENT") {
			absent++;
		} else if (record.status === "LEAVE") {
			onLeave++;
		} else if (record.status === "LATE" || record.lateMinutes > 0) {
			// Count as both present AND late
			present++;
			late++;
		} else if (record.timeIn) {
			present++;
		}
	}

	const totalWorkDays = present + absent + onLeave;
	const attendanceRate = totalWorkDays > 0 ? ((present + onLeave) / totalWorkDays) * 100 : 0;

	// Extract metrics from summary
	const totalMinutesWorked = summary.metadata.totalMinutesWorked;
	const totalRegularMinutes = summary.metadata.totalRegularMinutes;
	const totalOvertimeMinutes = summary.metadata.totalOvertimeMinutes;
	const totalUndertimeMinutes = summary.metadata.totalUndertimeMinutes;
	const totalLateMinutes = summary.metadata.totalLateMinutes;
	const totalEarlyOutMinutes = summary.metadata.totalEarlyOutMinutes;

	return {
		employeeId: employee.employeeId,
		name,
		department: employee.department?.name || "N/A",
		position: employee.position?.title || "N/A",
		// 4 Main Status Counts
		present,
		absent,
		late,
		onLeave,
		// Additional info
		totalDays: fullAttendanceRecords.length,
		daysRestDay,
		attendanceRate: Math.round(attendanceRate * 100) / 100,
		totalMinutesWorked,
		totalRegularMinutes,
		totalOvertimeMinutes,
		totalUndertimeMinutes,
		totalLateMinutes,
		totalEarlyOutMinutes,
	};
}

async function calculateOrgMetrics(
	organizationId: string,
	startDate: Date,
	endDate: Date,
): Promise<OrgMetrics> {
	// Get all active employees
	const employees = await prisma.employee.findMany({
		where: {
			organizationId,
			isDeleted: false,
			employmentStatus: "ACTIVE",
		},
		select: { id: true },
	});

	const employeeMetrics: EmployeeMetrics[] = [];

	for (const emp of employees) {
		const metrics = await calculateEmployeeMetrics(emp.id, startDate, endDate);
		if (metrics) {
			employeeMetrics.push(metrics);
		}
	}

	// Calculate organization totals
	const count = employeeMetrics.length || 1;
	
	// 4 Main Metrics (clickable/filterable)
	const totalPresent = employeeMetrics.reduce((sum, e) => sum + e.present, 0);
	const totalAbsent = employeeMetrics.reduce((sum, e) => sum + e.absent, 0);
	const totalLate = employeeMetrics.reduce((sum, e) => sum + e.late, 0);
	const totalOnLeave = employeeMetrics.reduce((sum, e) => sum + e.onLeave, 0);
	
	// Additional metrics
	const avgAttendanceRate = employeeMetrics.reduce((sum, e) => sum + e.attendanceRate, 0) / count;
	const totalMinutesWorked = employeeMetrics.reduce((sum, e) => sum + e.totalMinutesWorked, 0);
	const totalOvertimeMinutes = employeeMetrics.reduce((sum, e) => sum + e.totalOvertimeMinutes, 0);
	const totalUndertimeMinutes = employeeMetrics.reduce((sum, e) => sum + e.totalUndertimeMinutes, 0);
	const totalLateMinutes = employeeMetrics.reduce((sum, e) => sum + e.totalLateMinutes, 0);
	const totalRestDay = employeeMetrics.reduce((sum, e) => sum + e.daysRestDay, 0);

	return {
		organizationId,
		dateRange: {
			from: startDate.toISOString().split("T")[0],
			to: endDate.toISOString().split("T")[0],
		},
		summary: {
			totalEmployees: employeeMetrics.length,
			// 4 Main Metrics
			totalPresent,
			totalAbsent,
			totalLate,
			totalOnLeave,
			// Additional info
			avgAttendanceRate: Math.round(avgAttendanceRate * 100) / 100,
			totalMinutesWorked,
			totalOvertimeMinutes,
			totalUndertimeMinutes,
			totalLateMinutes,
			totalRestDay,
		},
		employees: employeeMetrics,
	};
}

// ============================================================================
// Display Functions
// ============================================================================

function displayMetrics(result: OrgMetrics, detailed: boolean = false): void {
	console.clear();

	// Header
	console.log("\n");
	console.log(BOLD + "╔═══════════════════════════════════════════════════════════════════════╗" + RESET);
	console.log(BOLD + "║                  📊 ATTENDANCE METRICS DASHBOARD 📊                   ║" + RESET);
	console.log(BOLD + "╚═══════════════════════════════════════════════════════════════════════╝" + RESET);
	console.log("\n");

	// Date Range
	console.log(`${DIM}📅 Period: ${result.dateRange.from} to ${result.dateRange.to}${RESET}`);
	console.log(`${DIM}🏢 Organization: ${result.organizationId}${RESET}`);
	console.log(`${DIM}👥 Employees Analyzed: ${result.summary.totalEmployees}${RESET}`);
	console.log("\n");

	// ========================================
	// 4 MAIN CLICKABLE METRICS
	// ========================================
	console.log(BOLD + "┌─ � TODAY'S ATTENDANCE SNAPSHOT (Clickable Metrics)" + RESET);
	console.log("│");
	
	// Calculate total for percentage
	const total = result.summary.totalPresent + result.summary.totalAbsent + result.summary.totalOnLeave;
	
	// 1. PRESENT
	const presentPct = total > 0 ? (result.summary.totalPresent / total) * 100 : 0;
	const presentColor = getColorCode(presentPct);
	console.log(`│  ${presentColor}✅ PRESENT${RESET}     ${BOLD}${result.summary.totalPresent}${RESET} employees`);
	console.log(`│     ${DIM}Filter: status = "PRESENT"${RESET}`);
	console.log("│");
	
	// 2. ABSENT
	const absentPct = total > 0 ? 100 - (result.summary.totalAbsent / total) * 100 : 100;
	const absentColor = getColorCode(absentPct);
	console.log(`│  ${absentColor}❌ ABSENT${RESET}      ${BOLD}${result.summary.totalAbsent}${RESET} employees`);
	console.log(`│     ${DIM}Filter: No attendance record on work day${RESET}`);
	console.log("│");
	
	// 3. LATE
	const latePct = result.summary.totalLate > 0 ? 100 - Math.min(100, (result.summary.totalLate / result.summary.totalPresent) * 100) : 100;
	const lateColor = getColorCode(latePct);
	console.log(`│  ${lateColor}⏰ LATE${RESET}        ${BOLD}${result.summary.totalLate}${RESET} employees`);
	console.log(`│     ${DIM}Filter: status = "LATE" or lateMinutes > 0${RESET}`);
	console.log("│");
	
	// 4. ON LEAVE
	console.log(`│  \x1b[36m🏖️ ON LEAVE${RESET}    ${BOLD}${result.summary.totalOnLeave}${RESET} employees`);
	console.log(`│     ${DIM}Filter: status = "LEAVE"${RESET}`);
	console.log("│");
	console.log("└" + "─".repeat(70));
	console.log("\n");

	// Summary Stats
	console.log(BOLD + "┌─ 📈 SUMMARY STATS" + RESET);
	console.log("│");
	const attColor = getColorCode(result.summary.avgAttendanceRate);
	console.log(`│  Attendance Rate:    ${attColor}${BOLD}${Math.round(result.summary.avgAttendanceRate)}%${RESET}`);
	console.log(`│  Rest Days:          ${result.summary.totalRestDay}`);
	console.log("└" + "─".repeat(70));
	console.log("\n");

	// Time Summary
	console.log(BOLD + "┌─ ⏱️ TIME SUMMARY" + RESET);
	console.log("│");
	console.log(`│  Total Hours Worked:     ${BOLD}${formatMinutesAsTime(result.summary.totalMinutesWorked)}${RESET} hrs`);
	console.log(`│  Total Overtime:         ${BOLD}\x1b[33m${formatMinutesAsTime(result.summary.totalOvertimeMinutes)}${RESET} hrs`);
	console.log(`│  Total Undertime:        ${BOLD}\x1b[31m${formatMinutesAsTime(result.summary.totalUndertimeMinutes)}${RESET} hrs`);
	console.log(`│  Total Late:             ${BOLD}\x1b[31m${result.summary.totalLateMinutes}${RESET} mins`);
	console.log("└" + "─".repeat(70));
	console.log("\n");

	// Detailed Employee Breakdown
	if (detailed && result.employees.length > 0) {
		console.log(BOLD + "┌─ 👥 DETAILED EMPLOYEE BREAKDOWN" + RESET);
		console.log("│");

		// Sort by attendance rate (lowest first)
		const sorted = [...result.employees].sort((a, b) => a.attendanceRate - b.attendanceRate);

		for (const emp of sorted) {
			const empAttColor = getColorCode(emp.attendanceRate);

			console.log(`│  ${BOLD}${emp.name}${RESET} ${DIM}(${emp.employeeId})${RESET}`);
			console.log(`│  ${DIM}${emp.department} | ${emp.position}${RESET}`);
			console.log("│");
			console.log(`│     ✅ Present: ${emp.present}  ❌ Absent: ${emp.absent}  ⏰ Late: ${emp.late}  🏖️ Leave: ${emp.onLeave}`);
			console.log(`│     📅 Attendance Rate: ${empAttColor}${emp.attendanceRate}%${RESET}`);
			console.log("│");
			console.log(`│     ⏱️ Hours Worked:   ${formatMinutesAsTime(emp.totalMinutesWorked)} hrs`);
			console.log(`│     📈 Overtime:       ${formatMinutesAsTime(emp.totalOvertimeMinutes)} hrs`);
			console.log(`│     📉 Undertime:      ${formatMinutesAsTime(emp.totalUndertimeMinutes)} hrs`);
			console.log(`│     ⏳ Late Minutes:   ${emp.totalLateMinutes} mins`);
			console.log("│");
			console.log("│  " + "─".repeat(60));
		}

		console.log("└" + "─".repeat(70));
		console.log("\n");
	} else if (result.employees.length > 0) {
		console.log(`${DIM}💡 Run with --detailed flag to see per-employee breakdown${RESET}`);
		console.log("\n");
	}

	// Footer
	console.log(`${DIM}Generated at: ${new Date().toLocaleString()}${RESET}`);
	console.log(`${DIM}Run: npm run metrics:attendance:detailed for more info${RESET}`);
	console.log("\n");
}

// ============================================================================
// Attendance Log Table (API Response Format)
// ============================================================================

interface AttendanceLogRecord {
	id: string;
	employeeId: string;
	employeeName: string;
	date: string;
	timeIn: string | null;
	timeBreak: string | null;
	timeOut: string | null;
	status: string;
	hoursWorked: string | null;
	regularHours: string | null;
	overtimeHours: string | null;
	undertimeHours: string | null;
	lateHours: string | null;
	earlyOutHours: string | null;
	breakMinutes: number | null;
	isManualEntry: boolean;
	notes: string | null;
	timesheetId: string | null;
}

async function fetchAttendanceLog(
	organizationId: string,
	startDate: Date,
	endDate: Date,
	limit: number = 30,
): Promise<AttendanceLogRecord[]> {
	// Get all employees with their schedules
	const employees = await prisma.employee.findMany({
		where: {
			organizationId,
			isDeleted: false,
		},
		include: {
			person: { select: { personalInfo: true } },
			attendances: {
				where: {
					isDeleted: false,
					date: { gte: startDate, lte: endDate },
				},
			},
		},
	});

	const fullAttendanceRecords: AttendanceLogRecord[] = [];
	const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

	// Generate full attendance records for each employee (including ABSENT and REST_DAY)
	for (const employee of employees) {
		// Create attendance map for quick lookup
		const attendanceMap = new Map<string, any>();
		employee.attendances.forEach((att) => {
			if (att.date) {
				const dateKey = att.date.toISOString().split("T")[0];
				attendanceMap.set(dateKey, att);
			}
		});

		const schedule = employee.schedule;
		if (!schedule || !schedule.shifts) continue;

		const currentDate = new Date(startDate);
		while (currentDate <= endDate) {
			const dateKey = currentDate.toISOString().split("T")[0];
			const dayOfWeek = currentDate.getDay();
			const dayName = dayNames[dayOfWeek];

			// Find shift for this day
			const shift = (schedule.shifts as any[]).find((s: any) => {
				const label = (s.label || "").toLowerCase();
				return (
					label.includes(dayName.toLowerCase()) ||
					label.includes(dayName.substring(0, 3).toLowerCase())
				);
			});

			const existingAttendance = attendanceMap.get(dateKey);
			const empName = `${employee.person?.personalInfo?.firstName || ""} ${employee.person?.personalInfo?.lastName || ""}`.trim() || employee.employeeId;

			if (shift) {
				if (shift.isRestDay) {
					// Rest day - virtual record
					fullAttendanceRecords.push({
						id: `rest-${employee.id}-${dateKey}`,
						employeeId: employee.employeeId,
						employeeName: empName,
						date: dateKey,
						timeIn: null,
						timeBreak: null,
						timeOut: null,
						status: "REST_DAY",
						hoursWorked: "0:00",
						regularHours: "0:00",
						overtimeHours: "0:00",
						undertimeHours: "0:00",
						lateHours: "0:00",
						earlyOutHours: "0:00",
						breakMinutes: 0,
						isManualEntry: false,
						notes: null,
						timesheetId: null,
					});
				} else if (existingAttendance) {
					// Work day with attendance - actual record
					fullAttendanceRecords.push({
						id: existingAttendance.id,
						employeeId: employee.employeeId,
						employeeName: empName,
						date: dateKey,
						timeIn: existingAttendance.timeIn ? existingAttendance.timeIn.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" }) : null,
						timeBreak: existingAttendance.timeBreak ? existingAttendance.timeBreak.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" }) : null,
						timeOut: existingAttendance.timeOut ? existingAttendance.timeOut.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" }) : null,
						status: existingAttendance.status,
						hoursWorked: existingAttendance.hoursWorked || null,
						regularHours: existingAttendance.regularHours || null,
						overtimeHours: existingAttendance.overtimeHours || null,
						undertimeHours: existingAttendance.undertimeHours || null,
						lateHours: existingAttendance.lateHours || null,
						earlyOutHours: existingAttendance.earlyOutHours || null,
						breakMinutes: existingAttendance.breakMinutes || null,
						isManualEntry: existingAttendance.isManualEntry,
						notes: existingAttendance.notes || null,
						timesheetId: existingAttendance.timesheetId || null,
					});
				} else {
					// Work day without attendance - ABSENT (virtual record)
					fullAttendanceRecords.push({
						id: `absent-${employee.id}-${dateKey}`,
						employeeId: employee.employeeId,
						employeeName: empName,
						date: dateKey,
						timeIn: null,
						timeBreak: null,
						timeOut: null,
						status: "ABSENT",
						hoursWorked: "0:00",
						regularHours: "0:00",
						overtimeHours: "0:00",
						undertimeHours: "0:00",
						lateHours: "0:00",
						earlyOutHours: "0:00",
						breakMinutes: 0,
						isManualEntry: false,
						notes: null,
						timesheetId: null,
					});
				}
			}

			currentDate.setDate(currentDate.getDate() + 1);
		}
	}

	// Sort by date descending (most recent first) and limit to 30
	return fullAttendanceRecords
		.sort((a, b) => b.date.localeCompare(a.date))
		.slice(0, limit);
}

function displayAttendanceLogTable(records: AttendanceLogRecord[]): void {
	console.log(BOLD + "┌─ 📋 ATTENDANCE LOG (Table Format - API Response)" + RESET);
	console.log("│");
	console.log(`│  ${DIM}Showing up to 30 most recent records${RESET}`);
	console.log("│");

	if (records.length === 0) {
		console.log("│  No attendance records found.");
		console.log("└" + "─".repeat(70));
		return;
	}

	// Table Header
	console.log("│  ┌" + "─".repeat(160) + "┐");
	console.log("│  │ " + 
		"Date".padEnd(12) + 
		"Employee".padEnd(20) + 
		"EmpID".padEnd(10) +
		"Status".padEnd(10) + 
		"Time In".padEnd(10) + 
		"Time Out".padEnd(10) + 
		"Hrs Worked".padEnd(12) +
		"Reg Hrs".padEnd(10) +
		"OT Hrs".padEnd(10) +
		"Late".padEnd(8) +
		"UT".padEnd(8) +
		"Manual".padEnd(8) +
		"Notes".padEnd(20) +
		" │"
	);
	console.log("│  ├" + "─".repeat(160) + "┤");

	// Table Rows
	for (const rec of records) {
		const statusColor = 
			rec.status === "PRESENT" ? "\x1b[32m" : 
			rec.status === "LATE" ? "\x1b[33m" : 
			rec.status === "LEAVE" ? "\x1b[36m" : 
			rec.status === "ABSENT" ? "\x1b[31m" : 
			rec.status === "REST_DAY" ? "\x1b[90m" : // Dim gray for rest days
			"\x1b[37m";

		const row = 
			rec.date.padEnd(12) + 
			rec.employeeName.substring(0, 18).padEnd(20) + 
			rec.employeeId.substring(0, 8).padEnd(10) +
			(statusColor + rec.status.padEnd(10) + RESET) + 
			(rec.timeIn || "-").padEnd(10) + 
			(rec.timeOut || "-").padEnd(10) + 
			(rec.hoursWorked || "-").padEnd(12) +
			(rec.regularHours || "-").padEnd(10) +
			(rec.overtimeHours || "-").padEnd(10) +
			(rec.lateHours || "-").padEnd(8) +
			(rec.undertimeHours || "-").padEnd(8) +
			(rec.isManualEntry ? "Yes" : "No").padEnd(8) +
			(rec.notes ? rec.notes.substring(0, 18) : "-").padEnd(20);

		console.log("│  │ " + row + " │");
	}

	console.log("│  └" + "─".repeat(160) + "┘");
	console.log("│");

	// Column Legend
	console.log("│  " + DIM + "Column Definitions (from Attendance Schema):" + RESET);
	console.log("│  " + DIM + "─────────────────────────────────────────────" + RESET);
	console.log("│  " + DIM + "  • id             : Unique record ID (ObjectId)" + RESET);
	console.log("│  " + DIM + "  • employeeId     : Reference to Employee model" + RESET);
	console.log("│  " + DIM + "  • date           : Attendance date (DateTime)" + RESET);
	console.log("│  " + DIM + "  • timeIn         : Clock-in time (DateTime)" + RESET);
	console.log("│  " + DIM + "  • timeBreak      : Break start time (DateTime)" + RESET);
	console.log("│  " + DIM + "  • timeOut        : Clock-out time (DateTime)" + RESET);
	console.log("│  " + DIM + "  • status         : AttendanceStatus enum (PRESENT, LEAVE, LATE, UNDERTIME, OVERTIME)" + RESET);
	console.log("│  " + DIM + "  • hoursWorked    : Total hours worked (formatted string)" + RESET);
	console.log("│  " + DIM + "  • regularHours   : Regular hours within schedule" + RESET);
	console.log("│  " + DIM + "  • overtimeHours  : Hours exceeding schedule" + RESET);
	console.log("│  " + DIM + "  • undertimeHours : Hours short of schedule" + RESET);
	console.log("│  " + DIM + "  • lateHours      : Hours late for clock-in" + RESET);
	console.log("│  " + DIM + "  • earlyOutHours  : Hours early for clock-out" + RESET);
	console.log("│  " + DIM + "  • breakMinutes   : Total break time (minutes)" + RESET);
	console.log("│  " + DIM + "  • isManualEntry  : Whether entry was manual" + RESET);
	console.log("│  " + DIM + "  • notes          : Additional notes" + RESET);
	console.log("│  " + DIM + "  • timesheetId    : Reference to Timesheet model" + RESET);
	console.log("│  " + DIM + "  • scheduleSnapshot: Copy of employee schedule on this date (JSON)" + RESET);
	console.log("│  " + DIM + "  • timeInLocation : Geolocation at clock-in (JSON)" + RESET);
	console.log("│  " + DIM + "  • timeOutLocation: Geolocation at clock-out (JSON)" + RESET);
	console.log("│  " + DIM + "  • deviceInfo     : Device details for mobile check-in (JSON)" + RESET);
	console.log("│  " + DIM + "  • approvedBy     : Approver ID for manual entries (ObjectId)" + RESET);
	console.log("│");
	console.log("└" + "─".repeat(70));
	console.log("\n");
}

// ============================================================================
// Main Entry Point
// ============================================================================

async function main() {
	const args = process.argv.slice(2);

	const isDetailed = args.includes("--detailed");
	const isExport = args.includes("--export");

	const orgIdArg = getArgValue(args, "-org");
	const fromArg = getArgValue(args, "-from");
	const toArg = getArgValue(args, "-to");

	try {
		console.log("🔍 Fetching attendance data from database...\n");

		// Get organization ID
		let organizationId: string | null = orgIdArg;
		if (!organizationId) {
			const org = await prisma.employee.findFirst({
				where: { isDeleted: false },
				select: { organizationId: true },
			});
			organizationId = org?.organizationId ?? null;
		}

		if (!organizationId) {
			console.error("❌ No organization found. Please provide -org <orgId>");
			process.exit(1);
		}

		// Set date range (default: 7 days)
		let startDate: Date;
		let endDate: Date;

		if (fromArg) {
			startDate = new Date(fromArg);
			startDate.setHours(0, 0, 0, 0);
		} else {
			startDate = new Date();
			startDate.setDate(startDate.getDate() - 7);
			startDate.setHours(0, 0, 0, 0);
		}

		if (toArg) {
			endDate = new Date(toArg);
			endDate.setHours(23, 59, 59, 999);
		} else {
			endDate = new Date();
			endDate.setHours(23, 59, 59, 999);
		}

		// Run analysis
		const result = await calculateOrgMetrics(organizationId, startDate, endDate);

		// Display metrics
		displayMetrics(result, isDetailed);

		// Fetch and display attendance log table (up to 30 records)
		const attendanceLog = await fetchAttendanceLog(organizationId, startDate, endDate, 30);
		displayAttendanceLogTable(attendanceLog);

		// Export if requested
		if (isExport) {
			const filename = `attendance-metrics-${result.dateRange.from}-to-${result.dateRange.to}.json`;
			fs.writeFileSync(filename, JSON.stringify(result, null, 2));
			console.log(`📁 Exported to: ${filename}\n`);
		}

		await prisma.$disconnect();
		process.exit(0);
	} catch (error: any) {
		console.error("\n❌ Error:", error.message);
		await prisma.$disconnect();
		process.exit(1);
	}
}

// Run the script
main();
