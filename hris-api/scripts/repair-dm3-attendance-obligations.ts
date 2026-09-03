import "dotenv/config";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { PrismaClient } from "../generated/prisma";

const prisma = new PrismaClient();

const BUSINESS_TIME_ZONE = "Asia/Manila";
const BUSINESS_UTC_OFFSET_MINUTES = 8 * 60;
const ELIGIBLE_STATUSES = ["ACTIVE", "ONBOARDING"];
const DEFAULT_ORG_CODE = "bnei";

type Args = {
	execute: boolean;
	repairSchedules: boolean;
	organizationCode: string;
	organizationId?: string;
	currentOnly: boolean;
	from?: string;
	to?: string;
	limitPeriods?: number;
};

type Period = {
	id: string;
	code: string | null;
	startDate: Date;
	endDate: Date;
	payFrequency: string | null;
};

type EmployeeRow = {
	id: string;
	employeeId: string;
	employmentStartDate: Date | null;
	employmentHireDate: Date | null;
	employmentTerminationDate: Date | null;
	employmentStatus: string;
	payFrequency: string;
	embeddedSchedule: any;
	departmentId: string;
	reportToId: string | null;
	workforceSource: string | null;
	agencyId: string | null;
	person: { personalInfo?: any } | null;
	department: { name: string | null } | null;
};

const readArg = (name: string) => {
	const prefix = `${name}=`;
	return process.argv.slice(2).find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
};

const parseArgs = (): Args => {
	const flags = new Set(process.argv.slice(2));
	return {
		execute: flags.has("--execute"),
		repairSchedules: flags.has("--repair-schedules"),
		organizationCode: readArg("--orgCode") || DEFAULT_ORG_CODE,
		organizationId: readArg("--org"),
		currentOnly: flags.has("--current-only"),
		from: readArg("--from"),
		to: readArg("--to"),
		limitPeriods: readArg("--limit-periods") ? Number(readArg("--limit-periods")) : undefined,
	};
};

const toDateOnlyUtc = (value: Date | string) => {
	const parsed = value instanceof Date ? value : new Date(`${value}T00:00:00.000Z`);
	const date = new Date(parsed);
	date.setUTCHours(0, 0, 0, 0);
	return date;
};

const normalizeEndDate = (date: Date) => {
	const end = new Date(date);
	end.setUTCHours(23, 59, 59, 999);
	return end;
};

const nextDate = (date: Date) => {
	const next = new Date(date);
	next.setUTCDate(next.getUTCDate() + 1);
	return next;
};

const dateKey = (date: Date) => toDateOnlyUtc(date).toISOString().slice(0, 10);

const getPatternDay = (date: Date) => {
	const day = date.getUTCDay();
	return day === 0 ? 7 : day;
};

const getExpectedDateTime = (businessDate: string, time?: string | null) => {
	if (!time) return null;
	const [hours, minutes] = String(time).split(":").map(Number);
	if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
	const utcMs =
		Date.UTC(
			Number(businessDate.slice(0, 4)),
			Number(businessDate.slice(5, 7)) - 1,
			Number(businessDate.slice(8, 10)),
			hours,
			minutes,
			0,
			0,
		) -
		BUSINESS_UTC_OFFSET_MINUTES * 60 * 1000;
	return new Date(utcMs);
};

const unwrapJsonSetEnvelope = (value: any) =>
	value?.set && typeof value.set === "object" && !Array.isArray(value.set) ? value.set : value;

const getEmployeeName = (employee: EmployeeRow) => {
	const info = employee.person?.personalInfo || {};
	return [info.firstName, info.middleName, info.lastName]
		.map((part) => String(part || "").trim())
		.filter(Boolean)
		.join(" ") || employee.employeeId;
};

const getShiftForDate = (employee: EmployeeRow, date: Date) => {
	const schedule = unwrapJsonSetEnvelope(employee.embeddedSchedule);
	const pattern = Array.isArray(schedule?.pattern) ? schedule.pattern : [];
	const patternDay = pattern.find((item: any) => Number(item?.day) === getPatternDay(date));
	const snapshot = patternDay?.shiftSnapshot || null;
	if (!snapshot) return null;
	return {
		...snapshot,
		templateId: schedule?.templateId || null,
		templateCode: schedule?.templateCode || null,
		templateName: schedule?.templateName || null,
	};
};

const buildScheduleFingerprint = (snapshot: any) =>
	[
		snapshot?.templateCode,
		snapshot?.code,
		snapshot?.startTime,
		snapshot?.endTime,
		snapshot?.isOff ? "off" : "work",
	]
		.filter(Boolean)
		.join(":") || null;

const getWorkWindow = (snapshot: any) => {
	const workSlots = Array.isArray(snapshot?.timeSlots)
		? snapshot.timeSlots.filter((slot: any) => String(slot?.type || "work").toLowerCase() === "work")
		: [];
	if (!workSlots.length) return { startTime: null, endTime: null };
	return {
		startTime: workSlots[0]?.startTime || null,
		endTime: workSlots[workSlots.length - 1]?.endTime || null,
	};
};

const countPeriodDays = (period: Period) => {
	let count = 0;
	for (let cursor = toDateOnlyUtc(period.startDate); cursor <= toDateOnlyUtc(period.endDate); cursor = nextDate(cursor)) {
		count += 1;
	}
	return count;
};

const runScheduleRepair = () => {
	execFileSync("npx", ["tsx", "scripts/backfill-employee-schedules-from-worksharing.ts", "--execute", "--write-csv"], {
		cwd: process.cwd(),
		stdio: "inherit",
		windowsHide: true,
	});
};

async function resolveOrganization(args: Args) {
	if (args.organizationId) return { id: args.organizationId, code: args.organizationCode };
	const organization = await prisma.organization.findUnique({
		where: { code: args.organizationCode },
		select: { id: true, code: true, name: true },
	});
	if (!organization) throw new Error(`Organization code ${args.organizationCode} was not found.`);
	return organization;
}

async function loadPeriods(organizationId: string, args: Args) {
	const targetDate = toDateOnlyUtc(args.from || new Date());
	const where: any = {
		organizationId,
		isDeleted: false,
		status: { in: ["OPEN", "PROCESSING"] },
	};
	if (args.currentOnly) {
		where.startDate = { lte: normalizeEndDate(targetDate) };
		where.endDate = { gte: targetDate };
	} else {
		if (args.from) where.endDate = { gte: toDateOnlyUtc(args.from) };
		if (args.to) where.startDate = { lte: normalizeEndDate(toDateOnlyUtc(args.to)) };
	}
	const periods = await prisma.payrollPeriod.findMany({
		where,
		select: { id: true, code: true, startDate: true, endDate: true, payFrequency: true },
		orderBy: { startDate: "asc" },
		take: args.limitPeriods,
	});
	return periods as Period[];
}

async function main() {
	const args = parseArgs();
	if (args.repairSchedules) runScheduleRepair();

	const organization = await resolveOrganization(args);
	const periods = await loadPeriods(organization.id, args);
	if (periods.length === 0) throw new Error("No open payroll periods matched the repair scope.");

	const employees = (await prisma.employee.findMany({
		where: {
			organizationId: organization.id,
			isDeleted: false,
			employmentStatus: { in: ELIGIBLE_STATUSES as any },
		},
		select: {
			id: true,
			employeeId: true,
			employmentStartDate: true,
			employmentHireDate: true,
			employmentTerminationDate: true,
			employmentStatus: true,
			payFrequency: true,
			embeddedSchedule: true,
			departmentId: true,
			reportToId: true,
			workforceSource: true,
			agencyId: true,
			person: { select: { personalInfo: true } },
			department: { select: { name: true } },
		},
		orderBy: { employeeId: "asc" },
	})) as EmployeeRow[];

	const scheduledEmployees = employees.filter((employee) => Boolean(unwrapJsonSetEnvelope(employee.embeddedSchedule)));
	const unscheduledEmployees = employees.filter((employee) => !unwrapJsonSetEnvelope(employee.embeddedSchedule));
	const existingBefore = await prisma.attendanceObligation.count({
		where: { organizationId: organization.id, isDeleted: false, payrollPeriodId: { in: periods.map((period) => period.id) } },
	});

	const rows: any[] = [];
	const skippedPayFrequency = new Set<string>();
	for (const period of periods) {
		for (const employee of scheduledEmployees) {
			if (period.payFrequency && employee.payFrequency !== period.payFrequency) {
				skippedPayFrequency.add(employee.employeeId);
				continue;
			}
			const employmentStart = employee.employmentStartDate || employee.employmentHireDate;
			let cursor = toDateOnlyUtc(period.startDate);
			const end = toDateOnlyUtc(period.endDate);
			while (cursor <= end) {
				if (employmentStart && cursor < toDateOnlyUtc(employmentStart)) {
					cursor = nextDate(cursor);
					continue;
				}
				const shift = getShiftForDate(employee, cursor);
				if (!shift) {
					cursor = nextDate(cursor);
					continue;
				}
				const businessDate = dateKey(cursor);
				const workWindow = getWorkWindow(shift);
				rows.push({
					organizationId: organization.id,
					employeeId: employee.id,
					payrollPeriodId: period.id,
					date: cursor,
					businessDate,
					timezone: BUSINESS_TIME_ZONE,
					status: shift.isOff ? "REST_DAY" : "EXPECTED",
					phase: businessDate <= dateKey(new Date()) ? "ACTIVE" : "PLANNED",
					expectedStartAt: getExpectedDateTime(businessDate, workWindow.startTime),
					expectedEndAt: getExpectedDateTime(businessDate, workWindow.endTime),
					hoursWorked: "0:00",
					regularHours: "0:00",
					overtimeHours: "0:00",
					undertimeHours: "0:00",
					lateHours: "0:00",
					earlyOutHours: "0:00",
					breakMinutes: shift.breakMinutes ?? null,
					behaviorFlags: [],
					scheduleSnapshot: shift,
					scheduleFingerprint: buildScheduleFingerprint(shift),
					source: "DM3_ATTENDANCE_OBLIGATION_REPAIR",
					metadata: {
						reason: "DM3 schedule-backed HR attendance coverage repair",
						sourceOfTruth: "Employee.embeddedSchedule",
						script: path.basename(__filename),
					},
					employeeCodeSnapshot: employee.employeeId,
					employeeNameSnapshot: getEmployeeName(employee),
					departmentIdSnapshot: employee.departmentId,
					departmentNameSnapshot: employee.department?.name || null,
					reportToIdSnapshot: employee.reportToId,
					workforceSourceSnapshot: employee.workforceSource,
					agencyIdSnapshot: employee.agencyId,
					isDeleted: false,
				});
				cursor = nextDate(cursor);
			}
		}
	}

	let inserted = 0;
	if (args.execute) {
		const chunkSize = 1000;
		for (let i = 0; i < rows.length; i += chunkSize) {
			const result = await prisma.attendanceObligation.createMany({
				data: rows.slice(i, i + chunkSize),
				skipDuplicates: true,
			});
			inserted += result.count;
		}
	}

	const existingAfter = await prisma.attendanceObligation.count({
		where: { organizationId: organization.id, isDeleted: false, payrollPeriodId: { in: periods.map((period) => period.id) } },
	});
	const expectedScheduledEmployeeDays = periods.reduce(
		(total, period) => total + countPeriodDays(period) * scheduledEmployees.length,
		0,
	);

	const report = {
		mode: args.execute ? "execute" : "dry-run",
		organization,
		scope: {
			currentOnly: args.currentOnly,
			from: args.from || null,
			to: args.to || null,
			periods: periods.map((period) => ({
				code: period.code,
				startDate: dateKey(period.startDate),
				endDate: dateKey(period.endDate),
				days: countPeriodDays(period),
			})),
		},
		employees: {
			eligible: employees.length,
			withSchedule: scheduledEmployees.length,
			withoutSchedule: unscheduledEmployees.length,
			withoutScheduleSamples: unscheduledEmployees.slice(0, 20).map((employee) => employee.employeeId),
			skippedPayFrequency: skippedPayFrequency.size,
		},
		obligations: {
			existingBefore,
			candidateRows: rows.length,
			inserted,
			existingAfter,
			expectedScheduledEmployeeDays,
			remainingScheduledGap: Math.max(0, expectedScheduledEmployeeDays - existingAfter),
		},
		stopConditionMet: args.execute
			? existingAfter >= expectedScheduledEmployeeDays
			: existingBefore >= expectedScheduledEmployeeDays,
	};

	console.log(JSON.stringify(report, null, 2));
}

main()
	.catch((error) => {
		console.error(error);
		process.exitCode = 1;
	})
	.finally(async () => {
		await prisma.$disconnect();
	});
