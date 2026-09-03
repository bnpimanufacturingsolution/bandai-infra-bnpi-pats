import { PrismaClient } from "../generated/prisma";
import { materializeTimesheetLinesFromObligations } from "../helper/attendance-obligation.helper";
import {
	assertSafeMigrationExecution,
	collectMigrationDatabaseTargets,
	resolveExecutionMode,
	summarizeIdempotentBackfillRun,
} from "./migration/script-safety";

export function getArg(name: string, args = process.argv.slice(2)): string | undefined {
	const prefix = `--${name}=`;
	return args.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
}

export function toDateOnlyUtc(value: string | Date): Date {
	const parsed = value instanceof Date ? value : new Date(value);
	if (Number.isNaN(parsed.getTime())) {
		throw new Error(`Invalid date: ${String(value)}`);
	}
	return new Date(Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth(), parsed.getUTCDate()));
}

export function todayUtc(): Date {
	const now = new Date();
	return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

export function dateKey(date: Date): string {
	return date.toISOString().slice(0, 10);
}

export function selectTimesheetLineBackfillPeriods<T extends { startDate: Date; endDate: Date }>(
	periods: T[],
	params: { today: Date; completedPeriods: number; hasExplicitRange: boolean },
): T[] {
	if (params.hasExplicitRange) return periods;
	return periods
		.filter((period) => period.endDate < params.today)
		.slice(0, params.completedPeriods)
		.concat(periods.filter((period) => period.startDate <= params.today && period.endDate >= params.today));
}

export function buildTimesheetLineBackfillInput(params: {
	organizationId: string;
	employeeId: string;
	payrollPeriodId: string;
	timesheetId: string;
	periodStartDate: Date;
	periodEndDate: Date;
	today: Date;
}) {
	const yesterday = new Date(params.today);
	yesterday.setUTCDate(yesterday.getUTCDate() - 1);
	return {
		organizationId: params.organizationId,
		employeeId: params.employeeId,
		payrollPeriodId: params.payrollPeriodId,
		timesheetId: params.timesheetId,
		fromDate: params.periodStartDate,
		toDate: params.periodEndDate < params.today ? params.periodEndDate : yesterday,
		sourceOfTruth: "ATTENDANCE_OBLIGATION" as const,
		targetTruth: "TIMESHEETLINE_EFFECTIVE_ROWS" as const,
	};
}

export const TIMESHEET_LINE_BACKFILL_SOURCE_TRUTH_CONTRACT = {
	liveOperationalAttendance: "AttendanceObligation",
	clockLedger: "Attendance",
	pastSubmittedApprovedPayrollReadyTotals: "Timesheetline.effectiveRows",
	paidPayrollHistory: "EmployeePayroll.timesheetSnapshot",
} as const;

async function resolveOrganizationId(prisma: PrismaClient, args = process.argv.slice(2)) {
	const organizationId = getArg("organizationId", args);
	if (organizationId) return organizationId;

	const employee = await prisma.employee.findFirst({
		where: { isDeleted: false },
		select: { organizationId: true },
	});
	if (!employee?.organizationId) {
		throw new Error("No organization found for timesheet-line backfill.");
	}
	return employee.organizationId;
}

export async function main() {
	const prisma = new PrismaClient();
	try {
		const executionMode = resolveExecutionMode();
		assertSafeMigrationExecution({
			scriptName: "backfill-timesheet-lines",
			execute: executionMode.execute,
			databaseTargets: collectMigrationDatabaseTargets(),
		});

		const organizationId = await resolveOrganizationId(prisma);
		const completedPeriods = Math.max(1, Number(getArg("completedPeriods") || 2));
		const fromArg = getArg("from");
		const toArg = getArg("to");
		const today = todayUtc();
		const yesterday = new Date(today);
		yesterday.setUTCDate(yesterday.getUTCDate() - 1);

		const periodWhere = fromArg || toArg
			? {
					organizationId,
					isDeleted: false,
					startDate: { lte: toDateOnlyUtc(toArg || dateKey(yesterday)) },
					endDate: { gte: toDateOnlyUtc(fromArg || "1970-01-01") },
				}
			: {
					organizationId,
					isDeleted: false,
					OR: [
						{ endDate: { lt: today } },
						{ startDate: { lte: today }, endDate: { gte: today } },
					],
				};

		const periods = await prisma.payrollPeriod.findMany({
			where: periodWhere as any,
			select: {
				id: true,
				code: true,
				startDate: true,
				endDate: true,
			},
			orderBy: { startDate: "desc" },
			take: fromArg || toArg ? 100 : completedPeriods + 1,
		});

		const selectedPeriods = selectTimesheetLineBackfillPeriods(periods, {
			today,
			completedPeriods,
			hasExplicitRange: Boolean(fromArg || toArg),
		});

		let timesheetsChecked = 0;
		let linesMaterialized = 0;
		const failures: Array<{ timesheetId: string; message: string }> = [];

		for (const period of selectedPeriods) {
			const timesheets = await prisma.timesheet.findMany({
				where: {
					organizationId,
					payrollPeriodId: period.id,
					isDeleted: false,
					status: { in: ["DRAFT", "SUBMITTED", "APPROVED", "REVISED", "REJECTED"] as any },
				},
				select: {
					id: true,
					code: true,
					employeeId: true,
				},
				orderBy: { updatedAt: "asc" },
			});

			for (const timesheet of timesheets) {
				timesheetsChecked += 1;
				try {
					const input = buildTimesheetLineBackfillInput({
						organizationId,
						employeeId: timesheet.employeeId,
						payrollPeriodId: period.id,
						timesheetId: timesheet.id,
						periodStartDate: period.startDate,
						periodEndDate: period.endDate,
						today,
					});
					if (!executionMode.execute) continue;
					const lines = await materializeTimesheetLinesFromObligations(prisma, input);
					linesMaterialized += lines.length;
				} catch (error) {
					failures.push({
						timesheetId: timesheet.id,
						message: error instanceof Error ? error.message : String(error),
					});
				}
			}
		}

		console.log(
			JSON.stringify(
				{
					organizationId,
					dryRun: executionMode.dryRun,
					sourceTruth: TIMESHEET_LINE_BACKFILL_SOURCE_TRUTH_CONTRACT,
					periods: selectedPeriods.map((period) => ({
						id: period.id,
						code: period.code,
						startDate: dateKey(period.startDate),
						endDate: dateKey(period.endDate),
					})),
					timesheetsChecked,
					linesMaterialized,
					failures,
					idempotency: summarizeIdempotentBackfillRun({
						scanned: timesheetsChecked,
						created: linesMaterialized,
						skippedExisting: executionMode.dryRun ? timesheetsChecked : 0,
						failures: failures.length,
						dryRun: executionMode.dryRun,
					}),
				},
				null,
				2,
			),
		);

		if (failures.length) {
			process.exitCode = 1;
		}
	} finally {
		await prisma.$disconnect();
	}
}

if (require.main === module) {
	main().catch((error) => {
		console.error(error);
		process.exitCode = 1;
	});
}
