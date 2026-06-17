  import { PeriodStatus, PrismaClient } from "../generated/prisma";
import * as dotenv from "dotenv";
import { generateTimesheetSummary, generateDailyBreakdown } from "../helper/timekeeping.helper";
import { generatePayrollPeriodCode } from "../helper/payroll-period-code.helper";
import {
	generateUniqueTimesheetCode,
	syncTimesheetLinesFromBreakdown,
} from "../helper/timesheet.helper";

// Load environment variables
dotenv.config();

const prisma = new PrismaClient();

interface TimesheetConfig {
	organizationId: string;
	periodType: "weekly" | "biweekly" | "monthly" | "custom" | "semi-monthly-cutoff";
	startDate?: Date;
	endDate?: Date;
	skipExisting?: boolean; // Skip employees who already have timesheets for the period
}

type GeneratedPeriod = {
	start: Date;
	end: Date;
};

const FIRST_CUTOFF_START_DAY = 11;
const FIRST_CUTOFF_END_DAY = 25;
const SECOND_CUTOFF_START_DAY = 26;
const SECOND_CUTOFF_END_DAY = 10;

function createUtcDateStart(year: number, month: number, day: number): Date {
	return new Date(Date.UTC(year, month, day, 0, 0, 0, 0));
}

function createUtcDateEndExclusiveMinusOne(year: number, month: number, day: number): Date {
	return new Date(createUtcDateStart(year, month, day).getTime() - 1);
}

function formatDateKey(date: Date): string {
	return date.toISOString().split("T")[0];
}

function getMonthLabel(date: Date): string {
	return date.toLocaleString("en-US", { month: "short", timeZone: "UTC" });
}

/**
 * Get the start and end dates for a period
 */
function getPeriodDates(date: Date, periodType: "weekly" | "biweekly" | "monthly"): {
	start: Date;
	end: Date;
} {
	const start = new Date(date);
	const end = new Date(date);

	switch (periodType) {
		case "weekly":
			// Start from Monday of the week
			const day = start.getDay();
			const diff = start.getDate() - day + (day === 0 ? -6 : 1);
			start.setDate(diff);
			start.setHours(0, 0, 0, 0);

			// End on Sunday
			end.setDate(start.getDate() + 6);
			end.setHours(23, 59, 59, 999);
			break;

		case "biweekly":
			// Start from Monday of the week
			const biweekDay = start.getDay();
			const biweekDiff = start.getDate() - biweekDay + (biweekDay === 0 ? -6 : 1);
			start.setDate(biweekDiff);
			start.setHours(0, 0, 0, 0);

			// End 2 weeks later on Sunday
			end.setDate(start.getDate() + 13);
			end.setHours(23, 59, 59, 999);
			break;

		case "monthly":
			// Start from first day of month
			start.setDate(1);
			start.setHours(0, 0, 0, 0);

			// End on last day of month
			end.setMonth(start.getMonth() + 1);
			end.setDate(0);
			end.setHours(23, 59, 59, 999);
			break;
	}

	return { start, end };
}

/**
 * Get all periods between two dates
 */
function getAllPeriods(
	startDate: Date,
	endDate: Date,
	periodType: "weekly" | "biweekly" | "monthly",
): GeneratedPeriod[] {
	const periods: GeneratedPeriod[] = [];
	let currentDate = new Date(startDate);

	while (currentDate <= endDate) {
		const period = getPeriodDates(currentDate, periodType);

		// Only add if period start is not after endDate
		if (period.start <= endDate) {
			// Adjust period end to not exceed endDate
			if (period.end > endDate) {
				period.end = new Date(endDate);
				period.end.setHours(23, 59, 59, 999);
			}
			periods.push(period);
		}

		// Move to next period
		switch (periodType) {
			case "weekly":
				currentDate.setDate(currentDate.getDate() + 7);
				break;
			case "biweekly":
				currentDate.setDate(currentDate.getDate() + 14);
				break;
			case "monthly":
				currentDate.setMonth(currentDate.getMonth() + 1);
				break;
		}
	}

	return periods;
}

function getSemiMonthlyCutoffPeriodForDate(date: Date): GeneratedPeriod {
	const year = date.getUTCFullYear();
	const month = date.getUTCMonth();
	const day = date.getUTCDate();

	if (day >= FIRST_CUTOFF_START_DAY && day <= FIRST_CUTOFF_END_DAY) {
		return {
			start: createUtcDateStart(year, month, FIRST_CUTOFF_START_DAY),
			end: createUtcDateEndExclusiveMinusOne(year, month, FIRST_CUTOFF_END_DAY + 1),
		};
	}

	if (day >= SECOND_CUTOFF_START_DAY) {
		return {
			start: createUtcDateStart(year, month, SECOND_CUTOFF_START_DAY),
			end: createUtcDateEndExclusiveMinusOne(year, month + 1, SECOND_CUTOFF_END_DAY + 1),
		};
	}

	return {
		start: createUtcDateStart(year, month - 1, SECOND_CUTOFF_START_DAY),
		end: createUtcDateEndExclusiveMinusOne(year, month, SECOND_CUTOFF_END_DAY + 1),
	};
}

function getAllSemiMonthlyCutoffPeriods(startDate: Date, endDate: Date): GeneratedPeriod[] {
	const periods: GeneratedPeriod[] = [];
	const seen = new Set<string>();
	const cursor = new Date(startDate);
	const endBoundary = new Date(endDate);

	cursor.setUTCHours(0, 0, 0, 0);
	endBoundary.setUTCHours(0, 0, 0, 0);

	while (cursor <= endBoundary) {
		const period = getSemiMonthlyCutoffPeriodForDate(cursor);
		const key = `${formatDateKey(period.start)}:${formatDateKey(period.end)}`;

		if (!seen.has(key) && period.end >= startDate && period.start <= endDate) {
			periods.push(period);
			seen.add(key);
		}

		const nextStart = new Date(period.end.getTime() + 1);
		nextStart.setUTCHours(0, 0, 0, 0);
		cursor.setTime(nextStart.getTime());
	}

	return periods;
}

/**
 * Find or create a PayrollPeriod for the given date range
 */
async function findOrCreatePayrollPeriod(
	organizationId: string,
	start: Date,
	end: Date,
	periodType: string,
) {
	// Try to find existing period
	const existing = await prisma.payrollPeriod.findFirst({
		where: {
			organizationId,
			startDate: start,
			endDate: end,
			isDeleted: false,
		},
	});

	if (existing) {
		return existing;
	}

	// Create new period
	const periodName = `${periodType.charAt(0).toUpperCase() + periodType.slice(1)} - ${start.toLocaleDateString()} to ${end.toLocaleDateString()}`;

	return await prisma.payrollPeriod.create({
		data: {
			organizationId,
			name: periodName,
			startDate: start,
			endDate: end,
			payDate: end, // Default to end date, can be adjusted
			status: "OPEN", // Default to OPEN to allow submissions
		},
	});
}

/**
 * Resolve a seeded 11-25 / 26-10 payroll period, creating the same metadata shape
 * only when the seeder has not run for this exact cutoff yet.
 */
async function findOrCreateSemiMonthlyCutoffPayrollPeriod(
	organizationId: string,
	start: Date,
	end: Date,
) {
	const existing = await prisma.payrollPeriod.findFirst({
		where: {
			organizationId,
			startDate: start,
			endDate: end,
			isDeleted: false,
		},
	});

	if (existing) {
		return existing;
	}

	const periodNumber = start.getUTCDate() === FIRST_CUTOFF_START_DAY ? 1 : 2;
	const cutoffDay = periodNumber === 1 ? FIRST_CUTOFF_END_DAY : SECOND_CUTOFF_END_DAY;
	const startLabel = `${getMonthLabel(start)} ${start.getUTCDate()}`;
	const endLabel = `${getMonthLabel(end)} ${end.getUTCDate()}`;

	return await prisma.payrollPeriod.create({
		data: {
			organizationId,
			name: `Semi-Monthly Cutoff - ${startLabel} to ${endLabel}`,
			code: generatePayrollPeriodCode(start, end),
			startDate: start,
			endDate: end,
			payDate: end,
			cutoffDay,
			periodNumber,
			payFrequency: "SEMI_MONTHLY",
			status: PeriodStatus.OPEN,
			notes: `Payroll period using 11-25 / 26-10 cutoff - ${startLabel} to ${endLabel}`,
			generationMetadata: {
				cutoffPattern: "11-25/26-10",
				source: "generate-timesheets",
			},
		},
	});
}

/**
 * Calculate timesheet summary and day lines from attendance records
 * Now uses the helper functions that return formatted hours and metadata
 */
function calculateTimesheetData(attendances: any[]) {
	const summary = generateTimesheetSummary(attendances);
	const breakdown = generateDailyBreakdown(attendances);
	return {
		totalDays: attendances.length,
		...summary,
		breakdown,
	};
}

/**
 * Generate timesheets for all employees based on their attendance records
 */
async function generateTimesheets(config: TimesheetConfig) {
	console.log("🕐 Starting timesheet generation...");
	console.log("=".repeat(80));
	console.log(`Organization ID: ${config.organizationId}`);
	console.log(`Period Type: ${config.periodType}`);
	console.log(
		`Date Range: ${config.startDate?.toLocaleDateString()} - ${config.endDate?.toLocaleDateString()}`,
	);
	console.log(`Skip Existing: ${config.skipExisting ? "Yes" : "No"}`);
	console.log("=".repeat(80));

	try {
		// Get all active employees for the organization
		const employees = await prisma.employee.findMany({
			where: {
				organizationId: config.organizationId,
				isDeleted: false,
				employmentStatus: {
					in: ["ACTIVE", "ONBOARDING"],
				},
			},
			select: {
				id: true,
				employeeId: true,
				person: {
					select: {
						personalInfo: true,
					},
				},
			},
		});

		console.log(`\n📋 Found ${employees.length} active employees\n`);

		// Determine periods to generate
		let periods: GeneratedPeriod[] = [];

		if (config.periodType === "custom" && config.startDate && config.endDate) {
			periods = [{ start: config.startDate, end: config.endDate }];
		} else if (
			config.periodType === "semi-monthly-cutoff" &&
			config.startDate &&
			config.endDate
		) {
			periods = getAllSemiMonthlyCutoffPeriods(config.startDate, config.endDate);
		} else if (
			config.startDate &&
			config.endDate &&
			config.periodType !== "custom" &&
			config.periodType !== "semi-monthly-cutoff"
		) {
			periods = getAllPeriods(config.startDate, config.endDate, config.periodType);
		} else {
			console.error("❌ Invalid configuration. Please provide startDate and endDate.");
			return;
		}

		console.log(`📅 Generating timesheets for ${periods.length} period(s)\n`);

		let totalCreated = 0;
		let totalSkipped = 0;
		let totalErrors = 0;

		for (const employee of employees) {
			const employeeName =
				`${employee.person?.personalInfo?.firstName || ""} ${employee.person?.personalInfo?.lastName || ""}`.trim() ||
				employee.employeeId;

			console.log(`\n👤 Processing: ${employeeName} (${employee.employeeId})`);

			for (const period of periods) {
				try {
					// Find or create PayrollPeriod for this date range
					const payrollPeriod =
						config.periodType === "semi-monthly-cutoff"
							? await findOrCreateSemiMonthlyCutoffPayrollPeriod(
									config.organizationId,
									period.start,
									period.end,
								)
							: await findOrCreatePayrollPeriod(
									config.organizationId,
									period.start,
									period.end,
									config.periodType,
								);

					// Check if timesheet already exists for this period
					const existingTimesheet = await prisma.timesheet.findUnique({
						where: {
							unique_timesheet_per_period: {
								organizationId: config.organizationId,
								employeeId: employee.id,
								payrollPeriodId: payrollPeriod.id,
							},
						},
					});

					if (existingTimesheet && !existingTimesheet.isDeleted && config.skipExisting) {
						console.log(
							`   ⏭️  Skipped ${period.start.toLocaleDateString()} - ${period.end.toLocaleDateString()} (already exists)`,
						);
						totalSkipped++;
						continue;
					}

					// Get attendance records for this period (scheduleSnapshot is embedded, no need to include)
					const attendances = await prisma.attendance.findMany({
						where: {
							organizationId: config.organizationId,
							employeeId: employee.id,
							date: {
								gte: period.start,
								lte: period.end,
							},
							isDeleted: false,
						},
						orderBy: {
							date: "asc",
						},
					});

					// Skip if no attendance records
					if (attendances.length === 0) {
						console.log(
							`   ⚠️  No attendance for ${period.start.toLocaleDateString()} - ${period.end.toLocaleDateString()}`,
						);
						totalSkipped++;
						continue;
					}

					// Calculate summary and breakdown
					const timesheetData = calculateTimesheetData(attendances);
					const { breakdown, ...timesheetSummaryData } = timesheetData;

					// Create or update timesheet
					let timesheet;
					if (existingTimesheet && !existingTimesheet.isDeleted) {
						// Update existing timesheet - disconnect old attendances and connect new ones
						timesheet = await prisma.timesheet.update({
							where: { id: existingTimesheet.id },
							data: {
								...timesheetSummaryData,
								attendances: {
									set: attendances.map((a) => ({ id: a.id })),
								},
							},
						});
					} else {
						const code = await generateUniqueTimesheetCode(
							prisma,
							config.organizationId,
						);

						// Create new timesheet with attendance relation
						timesheet = await prisma.timesheet.create({
							data: {
								code,
								organizationId: config.organizationId,
								employeeId: employee.id,
								payrollPeriodId: payrollPeriod.id,
								status: "DRAFT",
								...timesheetSummaryData,
								attendances: {
									connect: attendances.map((a) => ({ id: a.id })),
								},
							},
						});
					}

					await syncTimesheetLinesFromBreakdown(prisma, {
						organizationId: config.organizationId,
						employeeId: employee.id,
						payrollPeriodId: payrollPeriod.id,
						timesheetId: timesheet.id,
						breakdown,
						attendances,
					});

					const action = existingTimesheet ? "Updated" : "Created";
					console.log(
						`   ✅ ${action} ${period.start.toLocaleDateString()} - ${period.end.toLocaleDateString()} ` +
							`(${attendances.length} days, ${timesheetData.totalHoursWorked})`,
					);
					totalCreated++;
				} catch (error: any) {
					console.error(
						`   ❌ Error creating timesheet for ${period.start.toLocaleDateString()} - ${period.end.toLocaleDateString()}: ${error.message}`,
					);
					totalErrors++;
				}
			}
		}

		console.log("\n" + "=".repeat(80));
		console.log("📊 SUMMARY");
		console.log("=".repeat(80));
		console.log(`✅ Timesheets Created: ${totalCreated}`);
		console.log(`⏭️  Timesheets Skipped: ${totalSkipped}`);
		console.log(`❌ Errors: ${totalErrors}`);
		console.log("=".repeat(80));
		console.log("✨ Timesheet generation complete!");
	} catch (error) {
		console.error("❌ Fatal error during timesheet generation:", error);
		throw error;
	} finally {
		await prisma.$disconnect();
	}
}

/**
 * Parse command line arguments
 */
function parseArguments(): TimesheetConfig {
	const args = process.argv.slice(2);
	const config: Partial<TimesheetConfig> = {
		skipExisting: true, // Default to skip existing
	};

	for (let i = 0; i < args.length; i++) {
		const arg = args[i];

		switch (arg) {
			case "--org":
			case "-o":
				config.organizationId = args[++i];
				break;
			case "--period":
			case "-p":
				const period = args[++i];
				if (
					!["weekly", "biweekly", "monthly", "custom", "semi-monthly-cutoff"].includes(
						period,
					)
				) {
					throw new Error(
						"Invalid period type. Must be: weekly, biweekly, monthly, custom, or semi-monthly-cutoff",
					);
				}
				config.periodType = period as any;
				break;
			case "--start":
			case "-s":
				config.startDate = new Date(args[++i]);
				break;
			case "--end":
			case "-e":
				config.endDate = new Date(args[++i]);
				break;
			case "--no-skip":
				config.skipExisting = false;
				break;
			case "--help":
			case "-h":
				printUsage();
				process.exit(0);
				break;
			default:
				console.error(`Unknown argument: ${arg}`);
				printUsage();
				process.exit(1);
		}
	}

	// Validate required fields
	if (!config.organizationId) {
		throw new Error("Organization ID is required (--org or -o)");
	}
	if (!config.periodType) {
		throw new Error("Period type is required (--period or -p)");
	}
	if (!config.startDate) {
		throw new Error("Start date is required (--start or -s)");
	}
	if (!config.endDate) {
		throw new Error("End date is required (--end or -e)");
	}

	return config as TimesheetConfig;
}

/**
 * Print usage instructions
 */
function printUsage() {
	console.log(`
╔════════════════════════════════════════════════════════════════════════════╗
║                     TIMESHEET GENERATION SCRIPT                             ║
╚════════════════════════════════════════════════════════════════════════════╝

Generate timesheets for all employees based on their existing attendance records.

USAGE:
  npm run generate:timesheets -- [options]

OPTIONS:
  -o, --org <id>        Organization ID (required)
  -p, --period <type>   Period type: weekly, biweekly, monthly, custom, semi-monthly-cutoff (required)
  -s, --start <date>    Start date in YYYY-MM-DD format (required)
  -e, --end <date>      End date in YYYY-MM-DD format (required)
  --no-skip             Don't skip existing timesheets (default: skip)
  -h, --help            Show this help message

EXAMPLES:
  # Generate weekly timesheets for January 2026
  npm run generate:timesheets -- -o "org123" -p weekly -s 2026-01-01 -e 2026-01-31

  # Generate monthly timesheets for 2025
  npm run generate:timesheets -- -o "org123" -p monthly -s 2025-01-01 -e 2025-12-31

  # Generate biweekly timesheets for Q1 2026
  npm run generate:timesheets -- -o "org123" -p biweekly -s 2026-01-01 -e 2026-03-31

  # Generate custom period timesheet (force recreate)
  npm run generate:timesheets -- -o "org123" -p custom -s 2026-01-01 -e 2026-01-15 --no-skip

  # Generate 11-25 / 26-10 cutoff timesheets for the current April 2026 cutoff
  npm run generate:timesheets -- --org "org123" --period semi-monthly-cutoff --start 2026-04-11 --end 2026-04-25

NOTES:
  - Only generates timesheets for employees with attendance records
  - Automatically calculates total hours, overtime, late minutes, etc.
  - Timesheets are created in DRAFT status
  - By default, skips periods that already have timesheets
  - Use --no-skip to regenerate existing timesheets

╚════════════════════════════════════════════════════════════════════════════╝
	`);
}

/**
 * Main execution
 */
async function main() {
	try {
		const config = parseArguments();
		await generateTimesheets(config);
	} catch (error: any) {
		console.error("\n❌ Error:", error.message);
		console.log("\nUse --help for usage information\n");
		process.exit(1);
	}
}

// Run if executed directly
if (require.main === module) {
	main();
}

export { generateTimesheets, TimesheetConfig };
