/**
 * Materialize Computed Attendance Script
 *
 * Creates persisted Attendance records for missing computed days:
 * - REST_DAY from effective schedule
 * - LEAVE from approved/completed leave requests on work days
 * - ABSENT for missing work-day attendance
 *
 * Defaults to dry-run and excludes today to avoid blocking live clock-in.
 */

import * as dotenv from "dotenv";
import { PrismaClient, type AttendanceStatus } from "../generated/prisma";
import {
	materializeComputedAttendance,
	type MaterializeAttendanceConfig,
	type MaterializeAttendanceProgress,
} from "../helper/attendance-materialization.helper";
import { normalizeToStartOfDay } from "../helper/attendance.helper";

dotenv.config();

const prisma = new PrismaClient();

type CliConfig = Omit<MaterializeAttendanceConfig, "startDate" | "endDate"> & {
	startDate?: Date;
	endDate?: Date;
	allMissing?: boolean;
};

function parseDateArg(value: string, label: string): Date {
	const dateOnlyMatch = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
	const parsed = dateOnlyMatch
		? new Date(Date.UTC(Number(dateOnlyMatch[1]), Number(dateOnlyMatch[2]) - 1, Number(dateOnlyMatch[3])))
		: new Date(value);
	if (Number.isNaN(parsed.getTime())) {
		throw new Error(`Invalid ${label} date: ${value}`);
	}
	return normalizeToStartOfDay(parsed);
}

function getYesterdayUtcStart(): Date {
	const today = normalizeToStartOfDay(new Date());
	today.setUTCDate(today.getUTCDate() - 1);
	return today;
}

function getDefaultEndDate(includeToday?: boolean): Date {
	return includeToday ? normalizeToStartOfDay(new Date()) : getYesterdayUtcStart();
}

function parseStatuses(value: string): AttendanceStatus[] {
	const valid = new Set<AttendanceStatus>(["PRESENT", "LEAVE", "INCOMPLETE", "ABSENT", "REST_DAY"]);
	const statuses = value
		.split(",")
		.map((entry) => entry.trim().toUpperCase())
		.filter(Boolean);

	for (const status of statuses) {
		if (!valid.has(status as AttendanceStatus)) {
			throw new Error(`Invalid status "${status}". Use ABSENT, REST_DAY, or LEAVE.`);
		}
	}

	return statuses as AttendanceStatus[];
}

function parseArguments(): CliConfig {
	const args = process.argv.slice(2);
	const config: CliConfig = {
		execute: false,
		includeToday: false,
	};
	const positionalDates: string[] = [];
	const positionalNumbers: string[] = [];

	for (let index = 0; index < args.length; index++) {
		const arg = args[index];

		switch (arg) {
			case "--org":
			case "-o":
				config.organizationId = args[++index];
				break;
			case "--employee":
			case "-emp":
				config.employeeId = args[++index];
				break;
			case "--start":
			case "-s":
				config.startDate = parseDateArg(args[++index], "start");
				break;
			case "--end":
			case "-e":
				config.endDate = parseDateArg(args[++index], "end");
				break;
			case "--statuses":
				config.statuses = parseStatuses(args[++index]);
				break;
			case "--limit":
				config.employeeLimit = Number(args[++index]);
				break;
			case "--concurrency":
				config.concurrency = Number(args[++index]);
				break;
			case "--progress-ms":
				config.progressIntervalMs = Number(args[++index]);
				break;
			case "--execute":
				config.execute = true;
				break;
			case "--dry-run":
				config.execute = false;
				break;
			case "--include-today":
				config.includeToday = true;
				break;
			case "--all-missing":
			case "--from-earliest":
				config.allMissing = true;
				break;
			case "--help":
			case "-h":
				printUsage();
				process.exit(0);
				break;
			default:
				if (/^\d{4}-\d{2}-\d{2}/.test(arg)) {
					positionalDates.push(arg);
					break;
				}
				if (/^\d+$/.test(arg)) {
					positionalNumbers.push(arg);
					break;
				}
				throw new Error(`Unknown argument: ${arg}`);
		}
	}

	const env = process.env;
	config.organizationId = config.organizationId || env.npm_config_org || undefined;
	config.employeeId = config.employeeId || env.npm_config_employee || undefined;
	if (!config.startDate && env.npm_config_start && env.npm_config_start !== "true") {
		config.startDate = parseDateArg(env.npm_config_start, "start");
	}
	if (!config.endDate && env.npm_config_end && env.npm_config_end !== "true") {
		config.endDate = parseDateArg(env.npm_config_end, "end");
	}
	if (!config.statuses?.length && env.npm_config_statuses) {
		config.statuses = parseStatuses(env.npm_config_statuses);
	}
	if (!config.employeeLimit && env.npm_config_limit && env.npm_config_limit !== "true") {
		config.employeeLimit = Number(env.npm_config_limit);
	}
	if (!config.concurrency && env.npm_config_concurrency && env.npm_config_concurrency !== "true") {
		config.concurrency = Number(env.npm_config_concurrency);
	}
	if (!config.progressIntervalMs && env.npm_config_progress_ms && env.npm_config_progress_ms !== "true") {
		config.progressIntervalMs = Number(env.npm_config_progress_ms);
	}
	if (env.npm_config_execute === "true") config.execute = true;
	if (env.npm_config_include_today === "true") config.includeToday = true;
	if (env.npm_config_all_missing === "true" || env.npm_config_from_earliest === "true") {
		config.allMissing = true;
	}

	if (!config.startDate && positionalDates[0]) {
		config.startDate = parseDateArg(positionalDates[0], "start");
	}
	if (!config.endDate && positionalDates[1]) {
		config.endDate = parseDateArg(positionalDates[1], "end");
	}
	if (!config.employeeLimit && positionalNumbers[0]) {
		config.employeeLimit = Number(positionalNumbers[0]);
	}
	if (!config.concurrency && positionalNumbers[1]) {
		config.concurrency = Number(positionalNumbers[1]);
	}

	if (!config.allMissing) {
		const defaultDate = getYesterdayUtcStart();
		config.startDate = config.startDate || defaultDate;
		config.endDate = config.endDate || config.startDate;
	} else if (!config.endDate) {
		config.endDate = getDefaultEndDate(config.includeToday);
	}

	return config;
}

async function resolveEarliestEmploymentStartDate(config: CliConfig): Promise<Date | null> {
	const employeeWhere: any = {
		isDeleted: false,
	};
	if (config.organizationId) employeeWhere.organizationId = config.organizationId;
	if (config.employeeId) employeeWhere.id = config.employeeId;

	const employees = await prisma.employee.findMany({
		where: employeeWhere,
		select: {
			employmentStartDate: true,
			employmentHireDate: true,
		},
	});

	let earliest: Date | null = null;
	for (const employee of employees) {
		const rawDate = employee.employmentStartDate || employee.employmentHireDate;
		if (!rawDate) continue;
		const normalized = normalizeToStartOfDay(rawDate);
		if (Number.isNaN(normalized.getTime())) continue;
		if (!earliest || normalized < earliest) earliest = normalized;
	}

	return earliest;
}

function formatDuration(ms: number): string {
	const totalSeconds = Math.max(0, Math.floor(ms / 1000));
	const minutes = Math.floor(totalSeconds / 60);
	const seconds = totalSeconds % 60;
	if (minutes <= 0) return `${seconds}s`;
	return `${minutes}m ${String(seconds).padStart(2, "0")}s`;
}

function buildProgressBar(current: number, total: number, width = 32): string {
	if (total <= 0) return `[${"-".repeat(width)}]`;
	const ratio = Math.max(0, Math.min(1, current / total));
	const filled = Math.round(ratio * width);
	return `[${"#".repeat(filled)}${"-".repeat(width - filled)}]`;
}

function formatProgressBar(progress: MaterializeAttendanceProgress): string {
	const total = Math.max(0, progress.totalEmployees || 0);
	const completed = Math.min(total, Math.max(0, progress.completedEmployees || 0));
	const percent = total > 0 ? Math.floor((completed / total) * 100) : 0;
	const writeLabel = progress.dryRun ? "would create" : "created";
	const activeEmployee = progress.activeEmployeeCode
		? ` | active ${progress.activeEmployeeCode}`
		: "";
	const orgLabel =
		progress.organizationIndex && progress.organizationCount
			? ` | org ${progress.organizationIndex}/${progress.organizationCount}`
			: "";

	return [
		buildProgressBar(completed, total),
		`${String(percent).padStart(3, " ")}%`,
		`| ${progress.phase}`,
		orgLabel,
		` | employees ${completed}/${total}`,
		` | days ${progress.scannedDays}`,
		` | ${writeLabel} ${progress.created}`,
		` | skipped ${progress.skippedExisting + progress.skippedNoSchedule + progress.skippedOutOfEmployment + progress.skippedStatusFiltered}`,
		` | errors ${progress.errors.length}`,
		activeEmployee,
		` | ${formatDuration(progress.elapsedMs)}`,
	].join("");
}

function createProgressReporter() {
	const useInlineProgress = Boolean(process.stdout.isTTY);

	return (progress: MaterializeAttendanceProgress) => {
		const line = formatProgressBar(progress);

		if (!useInlineProgress) {
			console.log(line);
			return;
		}

		const terminalWidth = process.stdout.columns || 120;
		const safeLine =
			line.length >= terminalWidth ? `${line.slice(0, Math.max(0, terminalWidth - 4))}...` : line;

		process.stdout.clearLine(0);
		process.stdout.cursorTo(0);
		process.stdout.write(safeLine);

		if (progress.phase === "complete") {
			process.stdout.write("\n");
		}
	};
}

function printUsage() {
	console.log(`
MATERIALIZE COMPUTED ATTENDANCE

Creates persisted Attendance rows for missing ABSENT, REST_DAY, and LEAVE days.
By default this is a dry-run and excludes today.

USAGE:
  npm run backfill:attendance-computed -- [options]
  npm run backfill:attendance-computed:execute -- [options]

OPTIONS:
  -o, --org <id>            Filter by organization ID
  -emp, --employee <id>     Filter by employee ID
  -s, --start <date>        Start date in YYYY-MM-DD format
  -e, --end <date>          End date in YYYY-MM-DD format
  --statuses <list>         Comma list: ABSENT,REST_DAY,LEAVE
  --limit <number>          Limit employees processed, useful for smoke tests
  --concurrency <number>    Employee concurrency, default 6, max 20
  --progress-ms <number>    Progress heartbeat interval, default 5000
  --execute                 Write records to the database
  --dry-run                 Preview only (default)
  --include-today           Allow materializing today
  --all-missing             Start from earliest employee start/hire date
  -h, --help                Show this help message

EXAMPLES:
  npm run backfill:attendance-computed
  npm run backfill:attendance-computed:execute
  npm run backfill:attendance-computed -- --start 2026-05-01 --end 2026-05-06
  npm run backfill:attendance-computed -- --include-today
  npm run backfill:attendance-computed:execute -- --org <organizationId> --start 2026-05-01 --end 2026-05-06
  npm run backfill:attendance-computed:execute -- --employee <employeeId> --start 2026-05-06

NOTE:
  If your npm version strips option names, positional values also work:
  npm run backfill:attendance-computed -- 2026-05-01 2026-05-06 10 2
`);
}

async function main() {
	try {
		const config = parseArguments();
		if (config.allMissing && !config.startDate) {
			config.startDate = (await resolveEarliestEmploymentStartDate(config)) || config.endDate;
		}
		const startDate = config.startDate as Date;
		const endDate = config.endDate as Date;

		if (startDate > endDate) {
			throw new Error("Start date must be on or before end date");
		}

		console.log("Starting computed attendance materialization...");
		console.log("=".repeat(80));
		console.log(`Mode: ${config.execute ? "EXECUTE" : "DRY RUN"}`);
		console.log(`Start Date: ${startDate.toISOString().split("T")[0]}`);
		console.log(`End Date: ${endDate.toISOString().split("T")[0]}`);
		if (config.organizationId) console.log(`Organization ID: ${config.organizationId}`);
		if (config.employeeId) console.log(`Employee ID: ${config.employeeId}`);
		if (config.statuses?.length) console.log(`Statuses: ${config.statuses.join(", ")}`);
		if (config.employeeLimit) console.log(`Employee Limit: ${config.employeeLimit}`);
		if (config.concurrency) console.log(`Concurrency: ${config.concurrency}`);
		console.log(`Progress Heartbeat: ${Math.max(1000, Math.floor(config.progressIntervalMs || 5000))}ms`);
		console.log(`Include Today: ${config.includeToday ? "Yes" : "No"}`);
		console.log(
			config.execute
				? "Write Safety: EXECUTE mode will create missing system-generated Attendance rows only."
				: "Write Safety: DRY RUN only; no database writes will be made.",
		);
		console.log("=".repeat(80));

		const reportProgress = createProgressReporter();
		const result = await materializeComputedAttendance(prisma, {
			...config,
			startDate,
			endDate,
			onProgress: reportProgress,
		});

		console.log("SUMMARY");
		console.log("=".repeat(80));
		console.log(`Dry Run: ${result.dryRun ? "Yes" : "No"}`);
		console.log(`Employees Scanned: ${result.scannedEmployees}`);
		console.log(`Days Scanned: ${result.scannedDays}`);
		console.log(`${result.dryRun ? "Would Create" : "Created"}: ${result.created}`);
		console.log(`Skipped Existing: ${result.skippedExisting}`);
		console.log(`Skipped No Schedule: ${result.skippedNoSchedule}`);
		console.log(`Skipped Outside Employment: ${result.skippedOutOfEmployment}`);
		console.log(`Skipped By Status Filter: ${result.skippedStatusFiltered}`);
		console.log(`Errors: ${result.errors.length}`);

		if (result.errors.length) {
			console.log("\nFirst errors:");
			for (const error of result.errors.slice(0, 10)) {
				console.log(`  - ${error.employeeId} ${error.date}: ${error.error}`);
			}
		}

		if (!config.execute) {
			console.log("\nNo database writes were made. Re-run with --execute to apply.");
		}
	} finally {
		await prisma.$disconnect();
	}
}

if (require.main === module) {
	main().catch((error: any) => {
		console.error(`Error: ${error?.message || String(error)}`);
		console.log("Use --help for usage information");
		process.exit(1);
	});
}
