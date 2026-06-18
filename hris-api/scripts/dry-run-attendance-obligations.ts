import "dotenv/config";
import { PrismaClient } from "../generated/prisma";
import { getDateKeyInBusinessTimeZone } from "../helper/attendance.helper";
import {
	deriveAttendanceObligationDisplayStatus,
	type AttendanceObligationStoredStatus,
} from "../helper/attendance-obligation.helper";
import { resolveEffectiveShift } from "../helper/employee-schedule.helper";

const prisma = new PrismaClient();
const APPROVED_LEAVE_STATES = ["APPROVED", "COMPLETED"];
const DEFAULT_LOCAL_ORGANIZATION_ID = "6a069f99fbe3fdbee8611ee1";

function getArg(name: string) {
	const prefix = `--${name}=`;
	return process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
}

function toDateOnlyUtc(value: Date | string): Date {
	const key =
		value instanceof Date
			? getDateKeyInBusinessTimeZone(value)
			: String(value || "").slice(0, 10);
	return new Date(`${key}T00:00:00.000Z`);
}

function normalizeEndDate(date: Date | string) {
	const end = toDateOnlyUtc(date);
	end.setUTCHours(23, 59, 59, 999);
	return end;
}

function addDays(date: Date, days: number) {
	const next = new Date(date);
	next.setUTCDate(next.getUTCDate() + days);
	return next;
}

function getDefaultTomorrow() {
	return addDays(toDateOnlyUtc(new Date()), 1);
}

function dateKey(date: Date | string) {
	return getDateKeyInBusinessTimeZone(date instanceof Date ? date : new Date(date));
}

function getEmployeeName(employee: any) {
	const personalInfo = employee?.person?.personalInfo || {};
	const name = [personalInfo.firstName, personalInfo.lastName].filter(Boolean).join(" ").trim();
	return name || employee.employeeId || employee.id;
}

async function getHolidayDateKeys(organizationId: string, fromDate: Date, toDate: Date) {
	const rows = await (prisma as any).calendarItem.findMany({
		where: {
			organizationId,
			type: "HOLIDAY",
			status: "ACTIVE",
			startDate: { lte: normalizeEndDate(toDate) },
			endDate: { gte: toDateOnlyUtc(fromDate) },
		},
		select: { id: true, title: true, startDate: true, endDate: true },
	});
	const byDate = new Map<string, any[]>();
	for (const row of rows) {
		let cursor = toDateOnlyUtc(row.startDate);
		const end = toDateOnlyUtc(row.endDate);
		while (cursor <= end) {
			const key = dateKey(cursor);
			const entries = byDate.get(key) || [];
			entries.push({
				calendarItemId: row.id,
				title: row.title,
			});
			byDate.set(key, entries);
			cursor = addDays(cursor, 1);
		}
	}
	return byDate;
}

async function getApprovedLeaveDateKeys(
	organizationId: string,
	employeeIds: string[],
	fromDate: Date,
	toDate: Date,
) {
	if (!employeeIds.length) return new Map<string, any>();
	const rows = await (prisma as any).request.findMany({
		where: {
			organizationId,
			type: "LEAVE",
			isDeleted: false,
			currentWorkflowStateKey: { in: APPROVED_LEAVE_STATES },
			OR: [{ requesterId: { in: employeeIds } }, { targetEmployeeId: { in: employeeIds } }],
			startDate: { lte: normalizeEndDate(toDate) },
			endDate: { gte: toDateOnlyUtc(fromDate) },
		},
		select: {
			id: true,
			requesterId: true,
			targetEmployeeId: true,
			startDate: true,
			endDate: true,
		},
	});

	const byEmployeeDate = new Map<string, any>();
	for (const row of rows) {
		const employeeId = row.targetEmployeeId || row.requesterId;
		let cursor = toDateOnlyUtc(row.startDate);
		const end = toDateOnlyUtc(row.endDate || row.startDate);
		while (cursor <= end) {
			byEmployeeDate.set(`${employeeId}:${dateKey(cursor)}`, row);
			cursor = addDays(cursor, 1);
		}
	}
	return byEmployeeDate;
}

function isOutOfEmployment(employee: any, targetDate: Date) {
	const start = employee.employmentStartDate || employee.employmentHireDate || null;
	const termination = employee.employmentTerminationDate || null;
	if (start && targetDate < toDateOnlyUtc(start)) return true;
	if (termination && targetDate > toDateOnlyUtc(termination)) return true;
	return false;
}

async function main() {
	const organizationId =
		getArg("organizationId") || process.env.ORGANIZATION_ID || DEFAULT_LOCAL_ORGANIZATION_ID;
	const employeeId = getArg("employeeId");
	const requestedDate = getArg("date");
	const fromDate = toDateOnlyUtc(requestedDate || getDefaultTomorrow());
	const dateWasDefaulted = !requestedDate;
	const days = Math.min(Math.max(Number(getArg("days") || 1), 1), 62);
	const toDate = addDays(fromDate, days - 1);
	const jsonOnly = process.argv.includes("--json");

	if (!organizationId) {
		throw new Error("organizationId is required. Pass --organizationId=<id> or ORGANIZATION_ID.");
	}

	const [organization, payrollPeriods, employees] = await Promise.all([
		prisma.organization.findFirst({
			where: { id: organizationId },
			select: { id: true, name: true },
		}),
		prisma.payrollPeriod.findMany({
			where: {
				organizationId,
				isDeleted: false,
				startDate: { lte: normalizeEndDate(toDate) },
				endDate: { gte: fromDate },
			},
			select: {
				id: true,
				code: true,
				name: true,
				startDate: true,
				endDate: true,
				status: true,
				payFrequency: true,
			},
			orderBy: { startDate: "asc" },
		}),
		prisma.employee.findMany({
			where: {
				organizationId,
				isDeleted: false,
				...(employeeId ? { id: employeeId } : {}),
			},
			include: { person: true, department: true },
			orderBy: { employeeId: "asc" },
		}),
	]);

	if (!organization) throw new Error(`Organization not found: ${organizationId}`);

	const holidayByDate = await getHolidayDateKeys(organizationId, fromDate, toDate);
	const leaveByEmployeeDate = await getApprovedLeaveDateKeys(
		organizationId,
		employees.map((employee) => employee.id),
		fromDate,
		toDate,
	);

	const rows: any[] = [];
	for (let cursor = fromDate; cursor <= toDate; cursor = addDays(cursor, 1)) {
		const key = dateKey(cursor);
		const payrollPeriod = payrollPeriods.find(
			(period) => period.startDate <= normalizeEndDate(cursor) && period.endDate >= cursor,
		);

		const existingObligations = payrollPeriod
			? await (prisma as any).attendanceObligation.findMany({
					where: {
						organizationId,
						payrollPeriodId: payrollPeriod.id,
						date: cursor,
						isDeleted: false,
					},
					select: {
						id: true,
						employeeId: true,
						status: true,
						phase: true,
						attendanceId: true,
						businessDate: true,
					},
			  })
			: [];
		const existingByEmployeeId = new Map<string, any>(
			existingObligations.map((obligation: any) => [obligation.employeeId, obligation]),
		);
		const existingTimesheetLines = payrollPeriod
			? await (prisma as any).timesheetline.findMany({
					where: {
						organizationId,
						payrollPeriodId: payrollPeriod.id,
						date: cursor,
						isDeleted: false,
						isEffective: true,
					},
					select: {
						id: true,
						employeeId: true,
						status: true,
						timesheetId: true,
					},
			  })
			: [];
		const timesheetLineByEmployeeId = new Map<string, any>(
			existingTimesheetLines.map((line: any) => [line.employeeId, line]),
		);

		for (const employee of employees) {
			const existing = existingByEmployeeId.get(employee.id) || null;
			const existingTimesheetLine = timesheetLineByEmployeeId.get(employee.id) || null;
			const base = {
				date: key,
				employeeId: employee.id,
				employeeCode: employee.employeeId,
				employeeName: getEmployeeName(employee),
				department: employee.department?.name || null,
				payFrequency: employee.payFrequency || null,
				payrollPeriodId: payrollPeriod?.id || null,
				payrollPeriodCode: payrollPeriod?.code || null,
				payrollPeriodStatus: payrollPeriod?.status || null,
				existingObligationId: existing?.id || null,
				existingStatus: existing?.status || null,
				existingPhase: existing?.phase || null,
				existingTimesheetLineId: existingTimesheetLine?.id || null,
				existingTimesheetLineStatus: existingTimesheetLine?.status || null,
			};

			if (!payrollPeriod) {
				rows.push({ ...base, outcome: "NO_PAYROLL_PERIOD", expectedStatus: null });
				continue;
			}

			if (!["OPEN", "PROCESSING"].includes(String(payrollPeriod.status || "").toUpperCase())) {
				rows.push({
					...base,
					outcome: "PERIOD_NOT_OPEN",
					expectedStatus: null,
				});
				continue;
			}

			const payFrequencyMismatch =
				Boolean(payrollPeriod.payFrequency) &&
				String(employee.payFrequency || "") !== String(payrollPeriod.payFrequency || "");
			if (payFrequencyMismatch) {
				rows.push({ ...base, outcome: "PAY_FREQUENCY_MISMATCH", expectedStatus: "CANCELLED" });
				continue;
			}

			if (isOutOfEmployment(employee, cursor)) {
				rows.push({ ...base, outcome: "OUT_OF_EMPLOYMENT", expectedStatus: "CANCELLED" });
				continue;
			}

			const scheduleSnapshot = await resolveEffectiveShift(prisma, {
				organizationId,
				employeeId: employee.id,
				date: cursor,
			});
			if (!scheduleSnapshot) {
				rows.push({ ...base, outcome: "NO_SCHEDULE", expectedStatus: null });
				continue;
			}

			const holidayEntries = holidayByDate.get(key) || [];
			const leave = leaveByEmployeeDate.get(`${employee.id}:${key}`) || null;
			let expectedStatus: AttendanceObligationStoredStatus = "EXPECTED";
			let source = "SCHEDULE";
			if (holidayEntries.length) {
				expectedStatus = "HOLIDAY";
				source = "HOLIDAY";
			} else if (scheduleSnapshot.isOff) {
				expectedStatus = "REST_DAY";
			} else if (leave) {
				expectedStatus = "LEAVE";
				source = "LEAVE_REQUEST";
			}

			const displayStatus = deriveAttendanceObligationDisplayStatus({
				status: expectedStatus,
				businessDate: key,
			});
			rows.push({
				...base,
				outcome: existing
					? String(existing.status || "").toUpperCase() === expectedStatus
						? "EXISTS_MATCH"
						: "EXISTS_MISMATCH"
					: "WOULD_CREATE",
				expectedStatus,
				displayStatus,
				source,
				shift: scheduleSnapshot.shiftTypeCode || scheduleSnapshot.shiftTypeName || null,
				startTime: scheduleSnapshot.startTime || null,
				endTime: scheduleSnapshot.endTime || null,
				isOff: Boolean(scheduleSnapshot.isOff),
				holidayCount: holidayEntries.length,
				leaveRequestId: leave?.id || null,
			});
		}
	}

	const counts = rows.reduce((acc: Record<string, number>, row) => {
		acc[row.outcome] = (acc[row.outcome] || 0) + 1;
		return acc;
	}, {});
	const statusCounts = rows.reduce((acc: Record<string, number>, row) => {
		const key = String(row.expectedStatus || "NONE");
		acc[key] = (acc[key] || 0) + 1;
		return acc;
	}, {});
	const hrAttendancePreview = rows.reduce(
		(acc, row) => {
			if (!row.displayStatus) {
				acc.notQueryable += 1;
				return acc;
			}
			acc.records += 1;
			if (["NOT_CLOCKED_IN", "SCHEDULED", "PRESENT", "INCOMPLETE"].includes(row.displayStatus)) {
				acc.scheduled += 1;
			}
			if (row.displayStatus === "NOT_CLOCKED_IN") acc.notClockedIn += 1;
			if (row.displayStatus === "SCHEDULED") acc.futureScheduled += 1;
			if (row.displayStatus === "PRESENT" || row.displayStatus === "INCOMPLETE") {
				acc.hasClockRecord += 1;
			}
			if (row.displayStatus === "REST_DAY") acc.restDay += 1;
			if (row.displayStatus === "HOLIDAY") acc.holiday += 1;
			if (row.displayStatus === "LEAVE") acc.leave += 1;
			if (row.displayStatus === "ABSENT") acc.absent += 1;
			return acc;
		},
		{
			records: 0,
			scheduled: 0,
			notClockedIn: 0,
			futureScheduled: 0,
			hasClockRecord: 0,
			restDay: 0,
			holiday: 0,
			leave: 0,
			absent: 0,
			notQueryable: 0,
		},
	);
	const timesheetLinePreview = rows.reduce(
		(acc, row) => {
			if (row.existingTimesheetLineId) {
				acc.existingSnapshotLines += 1;
			} else if (row.displayStatus) {
				acc.noSnapshotYet += 1;
			}
			return acc;
		},
		{ existingSnapshotLines: 0, noSnapshotYet: 0 },
	);

	const result = {
		dryRun: true,
		organization,
		dateFrom: dateKey(fromDate),
		dateTo: dateKey(toDate),
		dateDefault: dateWasDefaulted ? "tomorrow" : "explicit",
		days,
		employeeFilter: employeeId || null,
		sourceOfTruth: {
			hrAttendancePage: "AttendanceObligation",
			timesheetLine: "submitted/review/payroll snapshot only",
		},
		counts,
		statusCounts,
		hrAttendancePreview,
		timesheetLinePreview,
		rows,
	};

	if (jsonOnly) {
		console.log(JSON.stringify(result, null, 2));
		return;
	}

	console.log(`Attendance obligation dry run for ${organization.name} (${organization.id})`);
	console.log(`Range: ${result.dateFrom} to ${result.dateTo}`);
	if (dateWasDefaulted) console.log("Date omitted: defaulted to tomorrow in business time.");
	console.log("HR attendance page source: AttendanceObligation");
	console.log("Timesheetline source: submitted/review/payroll snapshot only");
	console.log("Outcomes:", counts);
	console.log("Expected statuses:", statusCounts);
	console.log("HR attendance preview:", hrAttendancePreview);
	console.log("Timesheetline snapshot preview:", timesheetLinePreview);
	console.table(
		rows.map((row) => ({
			date: row.date,
			employee: row.employeeCode,
			name: row.employeeName,
			period: row.payrollPeriodCode || "-",
			outcome: row.outcome,
			expected: row.expectedStatus || "-",
			display: row.displayStatus || "-",
			existing: row.existingStatus || "-",
			line: row.existingTimesheetLineStatus || "-",
			shift: row.shift || "-",
			time: row.startTime && row.endTime ? `${row.startTime}-${row.endTime}` : "-",
		})),
	);
}

main()
	.catch((error) => {
		console.error(error);
		process.exitCode = 1;
	})
	.finally(async () => {
		await prisma.$disconnect();
	});
