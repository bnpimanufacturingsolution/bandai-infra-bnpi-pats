import { PrismaClient } from "../../generated/prisma";
import { getLeavePolicyByType } from "../../helper/leave-policy.helper";

const DEFAULT_WORKDAY_HOURS = 8;
const DEFAULT_LEAVE_TYPE = "COMPENSATORY";
const DAYS_PRECISION = 10000;
const DATE_KEY_FORMATTER = new Intl.DateTimeFormat("en-CA", {
	timeZone: "Asia/Manila",
	year: "numeric",
	month: "2-digit",
	day: "2-digit",
});

type ApprovedOvertimeCreditDay = {
	date: string;
	overtimeHours: string;
	overtimeMinutes: number;
	workdayHours: number;
	approvalReason: string | null;
	employeeReason: string | null;
};

export type ApprovedOvertimeCompLeaveCreditSummary = {
	source: "APPROVED_OVERTIME_TIMESHEETLINES";
	leaveType: "COMPENSATORY";
	totalMinutes: number;
	totalDays: number;
	deltaMinutes: number;
	deltaDays: number;
	lineCount: number;
	creditedAt: string;
	creditedByEmployeeId: string | null;
	approvedOvertimeDays: ApprovedOvertimeCreditDay[];
	creditApplied: boolean;
	skipReason?: "NO_COMPENSATORY_LEAVE_POLICY";
};

const toRecord = (value: unknown): Record<string, any> => {
	if (!value || typeof value !== "object" || Array.isArray(value)) {
		return {};
	}
	return value as Record<string, any>;
};

const roundLeaveDays = (value: number) =>
	Math.round((Number.isFinite(value) ? value : 0) * DAYS_PRECISION) / DAYS_PRECISION;

const toDateKey = (value: Date) =>
	DATE_KEY_FORMATTER.formatToParts(value).reduce(
		(acc, part) => {
			if (part.type === "year") acc.year = part.value;
			if (part.type === "month") acc.month = part.value;
			if (part.type === "day") acc.day = part.value;
			return acc;
		},
		{ year: "0000", month: "01", day: "01" },
	);

const formatDateKey = (value: Date) => {
	const parts = toDateKey(value);
	return `${parts.year}-${parts.month}-${parts.day}`;
};

const parseDurationToMinutes = (value?: string | null) => {
	if (!value) return 0;
	const trimmed = String(value).trim();
	if (!trimmed) return 0;

	if (/^\d+(\.\d+)?$/.test(trimmed)) {
		return Math.round(Number(trimmed) * 60);
	}

	const [hoursPart, minutesPart] = trimmed.split(":");
	const hours = Number(hoursPart);
	const minutes = Number(minutesPart ?? 0);
	if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return 0;
	return Math.max(0, hours * 60 + minutes);
};

const resolveWorkdayHours = (line: any) => {
	const scheduleSnapshot = toRecord(line?.scheduleSnapshot);
	const metadata = toRecord(line?.metadata);
	const metadataScheduleSnapshot = toRecord(metadata.scheduleSnapshot);
	const candidates = [
		scheduleSnapshot.shiftHour,
		metadataScheduleSnapshot.shiftHour,
		metadata.shiftHour,
	];

	for (const candidate of candidates) {
		const numericValue = Number(candidate);
		if (Number.isFinite(numericValue) && numericValue > 0) {
			return numericValue;
		}
	}

	return DEFAULT_WORKDAY_HOURS;
};

const buildBalancePeriod = (referenceDate: Date) => {
	const year = referenceDate.getFullYear();
	return {
		periodStart: new Date(year, 0, 1),
		periodEnd: new Date(year, 11, 31),
	};
};

const doesBalanceContainDate = (balance: Record<string, any>, referenceDate: Date) => {
	const start = balance.periodStart ? new Date(balance.periodStart) : null;
	const end = balance.periodEnd ? new Date(balance.periodEnd) : null;
	if (!start || Number.isNaN(start.getTime()) || !end || Number.isNaN(end.getTime())) {
		return false;
	}
	return start <= referenceDate && end >= referenceDate;
};

const findCompensatoryBalanceIndex = (
	leaveBalances: Array<Record<string, any>>,
	referenceDate: Date,
) =>
	leaveBalances.findIndex((balance) => {
		if (String(balance.leaveType || "").trim().toUpperCase() !== DEFAULT_LEAVE_TYPE) {
			return false;
		}
		return doesBalanceContainDate(balance, referenceDate);
	});

const toNumeric = (value: unknown) => {
	const numericValue = Number(value);
	return Number.isFinite(numericValue) ? numericValue : 0;
};

export async function applyApprovedOvertimeCompensatoryCredit(params: {
	prisma: PrismaClient;
	organizationId: string;
	timesheetId: string;
	approvedByEmployeeId?: string | null;
	approvedAt?: Date;
	dependencies?: {
		getLeavePolicyByType?: typeof getLeavePolicyByType;
	};
}) {
	const { prisma, organizationId, timesheetId, approvedByEmployeeId } = params;
	const approvedAt = params.approvedAt || new Date();
	const deps = {
		getLeavePolicyByType,
		...(params.dependencies || {}),
	};

	const timesheet = await prisma.timesheet.findFirst({
		where: {
			id: timesheetId,
			organizationId,
			isDeleted: false,
		},
		select: {
			id: true,
			organizationId: true,
			employeeId: true,
			approvalDate: true,
			metadata: true,
			payrollPeriod: {
				select: {
					endDate: true,
				},
			},
			timesheetlines: {
				where: {
					isDeleted: false,
					isEffective: true,
				},
				orderBy: {
					date: "asc",
				},
				select: {
					date: true,
					overtimeHours: true,
					approverNotes: true,
					employeeNotes: true,
					notes: true,
					scheduleSnapshot: true,
					metadata: true,
				},
			},
		},
	});

	if (!timesheet) {
		throw new Error(`Approved timesheet ${timesheetId} not found.`);
	}

	const compensatoryLeavePolicy = await deps.getLeavePolicyByType(
		prisma,
		organizationId,
		DEFAULT_LEAVE_TYPE,
	);

	const approvedOvertimeDays = timesheet.timesheetlines
		.map((line) => {
			const overtimeMinutes = parseDurationToMinutes(line.overtimeHours);
			if (overtimeMinutes <= 0) return null;
			const workdayHours = resolveWorkdayHours(line);
			const approvalReason = String(line.approverNotes || "").trim() || null;
			const employeeReason =
				String(line.employeeNotes || line.notes || "").trim() || null;

			return {
				date: formatDateKey(new Date(line.date)),
				overtimeHours: String(line.overtimeHours || "0:00"),
				overtimeMinutes,
				workdayHours,
				approvalReason,
				employeeReason,
			} satisfies ApprovedOvertimeCreditDay;
		})
		.filter(Boolean) as ApprovedOvertimeCreditDay[];

	const totalMinutes = approvedOvertimeDays.reduce(
		(total, line) => total + line.overtimeMinutes,
		0,
	);
	const totalDays = roundLeaveDays(
		approvedOvertimeDays.reduce((total, line) => {
			const workdayMinutes = Math.max(1, Math.round(line.workdayHours * 60));
			return total + line.overtimeMinutes / workdayMinutes;
		}, 0),
	);

	const existingMetadata = toRecord(timesheet.metadata);
	const previousCredit = toRecord(existingMetadata.compensatoryLeaveCredit);
	const previousTotalMinutes = Math.max(0, Math.round(toNumeric(previousCredit.totalMinutes)));
	const previousTotalDays = Math.max(0, roundLeaveDays(toNumeric(previousCredit.totalDays)));
	const deltaMinutes = totalMinutes - previousTotalMinutes;
	const deltaDays = roundLeaveDays(totalDays - previousTotalDays);

	const referenceDate =
		params.approvedAt ||
		(timesheet.approvalDate ? new Date(timesheet.approvalDate) : null) ||
		(timesheet.payrollPeriod?.endDate ? new Date(timesheet.payrollPeriod.endDate) : null) ||
		new Date();

	const creditApplied = Boolean(compensatoryLeavePolicy) && Math.abs(deltaDays) > 0.00005;

	if (creditApplied) {
		const employee = await prisma.employee.findFirst({
			where: {
				id: timesheet.employeeId,
				organizationId,
				isDeleted: false,
			},
			select: {
				id: true,
				leaveBalances: true,
			},
		});

		if (!employee) {
			throw new Error(
				`Employee ${timesheet.employeeId} for timesheet ${timesheet.id} was not found.`,
			);
		}

		const leaveBalances = Array.isArray(employee.leaveBalances)
			? [...(employee.leaveBalances as Array<Record<string, any>>)]
			: [];
		const balanceIndex = findCompensatoryBalanceIndex(leaveBalances, referenceDate);
		const balancePeriod = buildBalancePeriod(referenceDate);
		const currentBalance =
			balanceIndex >= 0
				? { ...toRecord(leaveBalances[balanceIndex]) }
				: {
						leaveType: DEFAULT_LEAVE_TYPE,
						totalEntitled: 0,
						used: 0,
						pending: 0,
						available: 0,
						carriedOver: null,
						maxCarryOver: null,
						...balancePeriod,
					};
		const used = toNumeric(currentBalance.used);
		const pending = toNumeric(currentBalance.pending);
		const nextTotalEntitled = Math.max(
			0,
			roundLeaveDays(toNumeric(currentBalance.totalEntitled) + deltaDays),
		);
		const nextBalance = {
			...currentBalance,
			leaveType: DEFAULT_LEAVE_TYPE,
			totalEntitled: nextTotalEntitled,
			used,
			pending,
			available: roundLeaveDays(nextTotalEntitled - used - pending),
			carriedOver:
				currentBalance.carriedOver === undefined ? null : currentBalance.carriedOver,
			maxCarryOver:
				currentBalance.maxCarryOver === undefined ? null : currentBalance.maxCarryOver,
			periodStart: currentBalance.periodStart || balancePeriod.periodStart,
			periodEnd: currentBalance.periodEnd || balancePeriod.periodEnd,
		};

		if (balanceIndex >= 0) {
			leaveBalances[balanceIndex] = nextBalance;
		} else {
			leaveBalances.push(nextBalance);
		}

		await prisma.employee.update({
			where: { id: employee.id },
			data: {
				leaveBalances,
				leaveBalancesLastUpdated: approvedAt,
			},
		});
	}

	const creditSummary: ApprovedOvertimeCompLeaveCreditSummary = {
		source: "APPROVED_OVERTIME_TIMESHEETLINES",
		leaveType: "COMPENSATORY",
		totalMinutes,
		totalDays,
		deltaMinutes,
		deltaDays,
		lineCount: approvedOvertimeDays.length,
		creditedAt: approvedAt.toISOString(),
		creditedByEmployeeId: approvedByEmployeeId || null,
		approvedOvertimeDays,
		creditApplied,
		...(compensatoryLeavePolicy ? {} : { skipReason: "NO_COMPENSATORY_LEAVE_POLICY" as const }),
	};

	const nextMetadata = {
		...existingMetadata,
		compensatoryLeaveCredit: creditSummary,
	};

	await prisma.timesheet.update({
		where: { id: timesheet.id },
		data: {
			metadata: nextMetadata as any,
		},
	});

	return {
		timesheetId: timesheet.id,
		employeeId: timesheet.employeeId,
		metadata: nextMetadata,
		creditSummary,
	};
}
