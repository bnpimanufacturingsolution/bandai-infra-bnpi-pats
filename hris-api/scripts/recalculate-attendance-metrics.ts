/**
 * Recalculate Attendance Metrics Script
 * Backfills persisted timekeeping facts and employee snapshots on attendance rows.
 */

import * as dotenv from "dotenv";
import { PrismaClient } from "../generated/prisma";
import {
	buildAttendanceTimekeepingFields,
	fetchAttendanceEmployeeSnapshotFields,
} from "../helper/attendance.helper";
import { calculateTimekeeping, deriveBehaviorFlags } from "../helper/timekeeping.helper";

dotenv.config();

const prisma = new PrismaClient();

interface RecalculateConfig {
	organizationId?: string;
	employeeId?: string;
	startDate?: Date;
	endDate?: Date;
	forceUpdate?: boolean;
}

function parseArguments(): RecalculateConfig {
	const args = process.argv.slice(2);
	const config: RecalculateConfig = {
		forceUpdate: false,
	};

	for (let i = 0; i < args.length; i++) {
		const arg = args[i];

		switch (arg) {
			case "--org":
			case "-o":
				config.organizationId = args[++i];
				break;
			case "--employee":
			case "-emp":
				config.employeeId = args[++i];
				break;
			case "--start":
			case "-s":
				config.startDate = new Date(args[++i]);
				break;
			case "--end":
			case "-e":
				config.endDate = new Date(args[++i]);
				break;
			case "--force":
			case "-f":
				config.forceUpdate = true;
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

	return config;
}

function printUsage() {
	console.log(`
RECALCULATE ATTENDANCE METRICS

Rebuilds persisted timekeeping minute fields and employee snapshots on attendance rows.

USAGE:
  npx ts-node scripts/recalculate-attendance-metrics.ts [options]

OPTIONS:
  -o, --org <id>        Filter by organization ID
  -emp, --employee <id> Filter by employee ID
  -s, --start <date>    Start date in YYYY-MM-DD format
  -e, --end <date>      End date in YYYY-MM-DD format
  -f, --force           Recalculate all matching rows
  -h, --help            Show this help message
`);
}

async function getOvertimeFlagThresholdMinutes(organizationId: string): Promise<number> {
	try {
		const timesheetConfig = await prisma.timesheetConfig.findUnique({
			where: { organizationId },
			select: { overtimeFlagThresholdMinutes: true } as any,
		});
		const threshold = (timesheetConfig as any)?.overtimeFlagThresholdMinutes;
		return typeof threshold === "number" ? threshold : 60;
	} catch {
		return 60;
	}
}

async function recalculateMetrics(config: RecalculateConfig) {
	console.log("Starting attendance metrics recalculation...");
	console.log("=".repeat(80));
	if (config.organizationId) console.log(`Organization ID: ${config.organizationId}`);
	if (config.employeeId) console.log(`Employee ID: ${config.employeeId}`);
	if (config.startDate) console.log(`Start Date: ${config.startDate.toLocaleDateString()}`);
	if (config.endDate) console.log(`End Date: ${config.endDate.toLocaleDateString()}`);
	console.log(`Force Update: ${config.forceUpdate ? "Yes" : "No"}`);
	console.log("=".repeat(80));

	try {
		const where: any = {
			isDeleted: false,
		};

		if (config.organizationId) {
			where.organizationId = config.organizationId;
		}

		if (config.employeeId) {
			where.employeeId = config.employeeId;
		}

		if (config.startDate || config.endDate) {
			where.date = {};
			if (config.startDate) where.date.gte = config.startDate;
			if (config.endDate) where.date.lte = config.endDate;
		}

		if (!config.forceUpdate) {
			where.OR = [
				{ totalMinutesWorked: null },
				{ regularMinutes: null },
				{ overtimeMinutes: null },
				{ undertimeMinutes: null },
				{ lateMinutes: null },
				{ earlyOutMinutes: null },
				{ employeeCodeSnapshot: null },
				{ employeeNameSnapshot: null },
				{ departmentIdSnapshot: null },
				{ reportToIdSnapshot: null },
				{ hoursWorked: null },
			];
		}

		const attendances = await prisma.attendance.findMany({
			where,
			include: {
				employee: {
					select: {
						employeeId: true,
					},
				},
			},
			orderBy: {
				date: "asc",
			},
		});

		console.log(`Found ${attendances.length} attendance records to process`);

		let totalUpdated = 0;
		let totalSkipped = 0;
		let totalErrors = 0;

		for (const attendance of attendances) {
			try {
				if (!attendance.employeeId) {
					totalSkipped++;
					continue;
				}

				const normalizedStatus = String(attendance.status || "").toUpperCase();
				const isNonWorkedStatus =
					normalizedStatus === "ABSENT" ||
					normalizedStatus === "LEAVE" ||
					normalizedStatus === "REST_DAY";
				const calculations = calculateTimekeeping(
					attendance.timeIn,
					attendance.timeOut,
					attendance.scheduleSnapshot as any,
					attendance.date || new Date(),
				);
				const timekeepingFields = buildAttendanceTimekeepingFields(calculations, {
					isNonWorked: isNonWorkedStatus,
				});
				const overtimeThresholdMinutes = await getOvertimeFlagThresholdMinutes(
					attendance.organizationId,
				);
				const behaviorFlags = isNonWorkedStatus
					? []
					: deriveBehaviorFlags({
							timeIn: attendance.timeIn,
							timeOut: attendance.timeOut,
							schedule: attendance.scheduleSnapshot as any,
							date: attendance.date || new Date(),
							overtimeThresholdMinutes,
						});
				const employeeSnapshotFields = await fetchAttendanceEmployeeSnapshotFields(
					prisma,
					attendance.employeeId,
				);

				await prisma.attendance.update({
					where: { id: attendance.id },
					data: {
						...employeeSnapshotFields,
						...timekeepingFields,
						behaviorFlags,
					},
				});
				await (prisma as any).attendanceObligation.updateMany({
					where: { attendanceId: attendance.id, isDeleted: false },
					data: {
						...employeeSnapshotFields,
						hoursWorked: timekeepingFields.hoursWorked,
						regularHours: timekeepingFields.regularHours,
						overtimeHours: timekeepingFields.overtimeHours,
						undertimeHours: timekeepingFields.undertimeHours,
						lateHours: timekeepingFields.lateHours,
						earlyOutHours: timekeepingFields.earlyOutHours,
						breakMinutes: timekeepingFields.breakMinutes,
						behaviorFlags,
					},
				});

				console.log(
					`Updated ${attendance.employee.employeeId} on ${attendance.date?.toLocaleDateString()}`,
				);
				totalUpdated++;
			} catch (error: any) {
				console.error(
					`Error updating ${attendance.employee.employeeId} on ${attendance.date?.toLocaleDateString()}: ${error.message}`,
				);
				totalErrors++;
			}
		}

		console.log("=".repeat(80));
		console.log("SUMMARY");
		console.log("=".repeat(80));
		console.log(`Records Updated: ${totalUpdated}`);
		console.log(`Records Skipped: ${totalSkipped}`);
		console.log(`Errors: ${totalErrors}`);
		console.log("Recalculation complete");
	} catch (error) {
		console.error("Fatal error during recalculation:", error);
		throw error;
	} finally {
		await prisma.$disconnect();
	}
}

async function main() {
	try {
		const config = parseArguments();
		await recalculateMetrics(config);
	} catch (error: any) {
		console.error(`Error: ${error.message}`);
		console.log("Use --help for usage information");
		process.exit(1);
	}
}

if (require.main === module) {
	main();
}

export { recalculateMetrics, RecalculateConfig };
