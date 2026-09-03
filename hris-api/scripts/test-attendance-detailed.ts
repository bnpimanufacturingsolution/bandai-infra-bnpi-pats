/**
 * Detailed Attendance Analytics Script
 * Calculates attendance metrics (Regular, OT, Late, Undertime) without payroll computations.
 * Useful for verifying timekeeping logic and troubleshooting attendance issues.
 *
 * Usage:
 *   npx ts-node scripts/test-attendance-detailed.ts <employeeId> [options]
 *   npx ts-node scripts/test-attendance-detailed.ts -all [options]
 *
 * Options:
 *   -tz <timezone>  Specify timezone (default: Asia/Manila)
 *   -d <date>       Specific date to check (YYYY-MM-DD)
 *   -org <orgId>    Organization ID
 *
 * Examples:
 *   npx ts-node scripts/test-attendance-detailed.ts 695b356af70742645a95f293
 *   npx ts-node scripts/test-attendance-detailed.ts -all -tz "Asia/Manila"
 */

import { PrismaClient } from "../generated/prisma";
import {
	calculateTimekeeping,
	formatMinutesAsTime,
	TimekeepingCalculation,
} from "../helper/timekeeping.helper";

const prisma = new PrismaClient();

interface AttendanceMetricsSummary {
	totalScheduledDays: number;
	totalWorkDays: number;
	totalPresent: number;
	totalAbsent: number;
	totalRestDays: number;
	// Time Metrics (in minutes)
	totalMinutesWorked: number;
	totalRegularMinutes: number;
	totalOvertimeMinutes: number;
	totalUndertimeMinutes: number;
	totalLateMinutes: number;
	totalEarlyOutMinutes: number;
}

/**
 * Helper to parse args
 */
function getArgValue(args: string[], flag: string): string | null {
	const index = args.indexOf(flag);
	return index !== -1 && index + 1 < args.length ? args[index + 1] : null;
}

async function calculateAttendanceForEmployee(
	employeeId: string,
	organizationId: string,
	timeZone: string = "Asia/Manila",
	specificDate: Date | null = null,
) {
	console.log("=".repeat(80));
	console.log("ATTENDANCE ANALYTICS REPORT");
	console.log(`Timezone: ${timeZone}`);
	console.log("=".repeat(80));
	console.log();

	try {
		// Step 1: Get Employee Details with Schedule
		const employee = await prisma.employee.findUnique({
			where: { id: employeeId },
			include: {
				person: {
					select: {
						personalInfo: true,
					},
				},
				department: true,
				position: true,
				// Get schedule embedded in employee
			},
		});

		if (!employee) {
			console.error("❌ Employee not found!");
			return;
		}

		console.log(
			`👤 Employee: ${employee.person?.personalInfo?.firstName} ${employee.person?.personalInfo?.lastName}`,
		);
		console.log(`🆔 Employee ID: ${employee.employeeId}`);
		console.log(
			`🏢 Department: ${employee.department.name} | Position: ${employee.position.title}`,
		);

		if (!employee.schedule) {
			console.error("❌ Employee has no schedule assigned!");
			return;
		}

		console.log(
			`📋 Schedule: ${employee.schedule.scheduleName} (${employee.schedule.scheduleCode})`,
		);
		console.log();

		// Step 2: Determine Date Range
		let startDate: Date;
		let endDate: Date;

		if (specificDate) {
			startDate = new Date(specificDate);
			startDate.setHours(0, 0, 0, 0);
			endDate = new Date(specificDate);
			endDate.setHours(23, 59, 59, 999);
			console.log(`📅 Analyzing Specific Date: ${startDate.toDateString()}`);
		} else {
			// Find active payroll period
			const payrollPeriod = await prisma.payrollPeriod.findFirst({
				where: {
					organizationId,
				},
				orderBy: {
					startDate: "desc",
				},
			});

			if (payrollPeriod) {
				startDate = new Date(payrollPeriod.startDate);
				endDate = new Date(payrollPeriod.endDate);
				console.log(
					`📅 Analyzing Period: ${payrollPeriod.name} (${startDate.toISOString().split("T")[0]} - ${endDate.toISOString().split("T")[0]})`,
				);
			} else {
				// Fallback to last 30 days
				endDate = new Date();
				startDate = new Date();
				startDate.setDate(endDate.getDate() - 30);
				console.log(
					`📅 Analyzing Last 30 Days: ${startDate.toISOString().split("T")[0]} - ${endDate.toISOString().split("T")[0]}`,
				);
			}
		}

		// Step 3: Fetch Attendance Records
		const attendances = await prisma.attendance.findMany({
			where: {
				employeeId,
				isDeleted: false,
				date: {
					gte: startDate,
					lte: endDate,
				},
			},
			orderBy: {
				date: "asc",
			},
		});

		// Step 4: Analyze Day by Day
		const summary: AttendanceMetricsSummary = {
			totalScheduledDays: 0,
			totalWorkDays: 0,
			totalPresent: 0,
			totalAbsent: 0,
			totalRestDays: 0,
			totalMinutesWorked: 0,
			totalRegularMinutes: 0,
			totalOvertimeMinutes: 0,
			totalUndertimeMinutes: 0,
			totalLateMinutes: 0,
			totalEarlyOutMinutes: 0,
		};

		console.log("-".repeat(80));
		console.log("DAILY BREAKDOWN");
		console.log("-".repeat(80));
		console.log(
			"Date".padEnd(12) +
				"Day".padEnd(5) +
				"Type".padEnd(6) +
				"In/Out".padEnd(14) +
				"Worked".padEnd(8) +
				"Regular".padEnd(8) +
				"OT".padEnd(6) +
				"Late".padEnd(6) +
				"UT".padEnd(6) +
				"Status",
		);
		console.log("-".repeat(80));

		const currentDate = new Date(startDate);
		const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

		// Create map for O(1) lookup
		const attendanceMap = new Map();
		attendances.forEach((a) => {
			if (a.date) attendanceMap.set(a.date.toISOString().split("T")[0], a);
		});

		while (currentDate <= endDate) {
			const dateKey = currentDate.toISOString().split("T")[0];
			const dayIndex = currentDate.getDay();
			const dayName = dayNames[dayIndex];

			summary.totalScheduledDays++;

			const fullDayNames = [
				"Sunday",
				"Monday",
				"Tuesday",
				"Wednesday",
				"Thursday",
				"Friday",
				"Saturday",
			];
			const fullDayName = fullDayNames[dayIndex];
			const shift = employee.schedule.shifts.find(
				(s: any) =>
					s.label.toLowerCase().includes(fullDayName.toLowerCase()) ||
					s.label.toLowerCase().includes(dayName.toLowerCase()),
			);

			if (!shift) {
				// No shift defined
			} else {
				if (shift.isRestDay) {
					summary.totalRestDays++;
					console.log(
						`${dateKey} ${dayName} REST  ------------------------------------------------------------- [REST DAY]`,
					);
				} else {
					summary.totalWorkDays++;

					const record = attendanceMap.get(dateKey);

					if (record) {
						summary.totalPresent++;

						const metrics: TimekeepingCalculation = calculateTimekeeping(
							record.timeIn,
							record.timeOut,
							record.scheduleSnapshot || employee.schedule,
							record.date || currentDate,
							timeZone,
						);

						summary.totalMinutesWorked += metrics.totalMinutesWorked;
						summary.totalRegularMinutes += metrics.regularMinutes;
						summary.totalOvertimeMinutes += metrics.overtimeMinutes;
						summary.totalUndertimeMinutes += metrics.undertimeMinutes;
						summary.totalLateMinutes += metrics.lateMinutes;
						summary.totalEarlyOutMinutes += metrics.earlyOutMinutes;

						const timeInStr = record.timeIn
							? extractLocalTime(record.timeIn, timeZone)
							: "--:--";
						const timeOutStr = record.timeOut
							? extractLocalTime(record.timeOut, timeZone)
							: "--:--";
						const inOut = `${timeInStr}-${timeOutStr}`;

						const worked = formatMinutesAsTime(metrics.totalMinutesWorked);
						const reg = formatMinutesAsTime(metrics.regularMinutes);
						const ot = formatMinutesAsTime(metrics.overtimeMinutes);
						const late = metrics.lateMinutes > 0 ? `${metrics.lateMinutes}m` : "-";
						const ut =
							metrics.undertimeMinutes > 0
								? formatMinutesAsTime(metrics.undertimeMinutes)
								: "-";

						let statusBits = [];
						if (metrics.lateMinutes > 0) statusBits.push("LATE");
						if (metrics.overtimeMinutes > 0) statusBits.push("OT");
						if (metrics.undertimeMinutes > 0) statusBits.push("UT");
						if (statusBits.length === 0) statusBits.push("OK");

						console.log(
							`${dateKey} ` +
								`${dayName}  ` +
								`WORK  ` +
								`${inOut.padEnd(14)} ` +
								`${worked.padEnd(8)} ` +
								`${reg.padEnd(8)} ` +
								`${ot.padEnd(6)} ` +
								`${late.padEnd(6)} ` +
								`${ut.padEnd(6)} ` +
								`[${statusBits.join(",")}]`,
						);
					} else {
						summary.totalAbsent++;
						console.log(
							`${dateKey} ${dayName} WORK  ------------------------------------------------------------- ❌ ABSENT`,
						);
					}
				}
			}

			currentDate.setDate(currentDate.getDate() + 1);
		}

		console.log();
		console.log("-".repeat(80));
		console.log("📊 METRICS SUMMARY");
		console.log("-".repeat(80));

		console.log(`Presence:`);
		console.log(`   Present: ${summary.totalPresent} / ${summary.totalWorkDays} days`);
		console.log(`   Absent:  ${summary.totalAbsent} days`);
		console.log();

		console.log(`Hours Breakdown:`);
		console.log(
			`   Total Worked:    ${formatMinutesAsTime(summary.totalMinutesWorked)} hrs  (${summary.totalMinutesWorked} min)`,
		);
		console.log(`   Regular Hours:   ${formatMinutesAsTime(summary.totalRegularMinutes)} hrs`);
		console.log(`   Overtime:        ${formatMinutesAsTime(summary.totalOvertimeMinutes)} hrs`);
		console.log();

		console.log(`Exceptions:`);
		console.log(
			`   Undertime:       ${formatMinutesAsTime(summary.totalUndertimeMinutes)} hrs`,
		);
		console.log(`   Late:            ${summary.totalLateMinutes} mins`);
		console.log(`   Early Out:       ${summary.totalEarlyOutMinutes} mins`);

		console.log("=".repeat(80));
	} catch (error) {
		console.error("❌ Error:", error);
	}
}

function extractLocalTime(date: Date, timeZone: string): string {
	try {
		return new Intl.DateTimeFormat("en-US", {
			timeZone,
			hour: "2-digit",
			minute: "2-digit",
			hour12: false,
		}).format(date);
	} catch (e) {
		return "err";
	}
}

async function main() {
	const args = process.argv.slice(2);
	const employeeIdArg = args[0];

	const timeZone = getArgValue(args, "-tz") || "Asia/Manila";
	const dateStr = getArgValue(args, "-d");
	const orgIdArg = getArgValue(args, "-org");
	const specificDate = dateStr ? new Date(dateStr) : null;

	const organizationId = orgIdArg || "69884da971e2dc9d6ac67b59";

	if (!employeeIdArg || employeeIdArg.startsWith("-")) {
		if (args.includes("-all")) {
			// OK
		} else {
			console.error("❌ Error: Employee ID or -all is required");
			console.log(
				"Usage: npx ts-node scripts/test-attendance-detailed.ts <employeeId> [-tz Asia/Manila] [-org <orgId>]",
			);
			process.exit(1);
		}
	}

	try {
		if (orgIdArg) {
			console.log(`🏢 Using Organization ID: ${organizationId}`);
		}

		if (employeeIdArg === "-all" || args.includes("-all")) {
			console.log("🔍 Fetching all active employees...");
			const employees = await prisma.employee.findMany({
				where: {
					organizationId,
					isDeleted: false,
					employmentStatus: "ACTIVE",
				},
				select: { id: true, employeeId: true, person: { select: { personalInfo: true } } },
			});

			console.log(`Found ${employees.length} employees.\n`);

			for (const emp of employees) {
				await calculateAttendanceForEmployee(
					emp.id,
					organizationId,
					timeZone,
					specificDate,
				);
				console.log("\n");
			}
		} else {
			await calculateAttendanceForEmployee(
				employeeIdArg,
				organizationId,
				timeZone,
				specificDate,
			);
		}
	} catch (error) {
		console.error("❌ Fatal Error:", error);
	} finally {
		await prisma.$disconnect();
	}
}

main();
