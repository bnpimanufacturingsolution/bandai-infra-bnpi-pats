import { PrismaClient } from "../../generated/prisma";
import {
	buildAttendanceTimekeepingFields,
	fetchAttendanceEmployeeSnapshotFields,
	normalizeToEndOfDay,
	normalizeToStartOfDay,
} from "../../helper/attendance.helper";
import { recomputeAttendanceObligationsForRange } from "../../helper/attendance-obligation.helper";
import { refreshTimesheetForAttendanceDate } from "../../helper/timesheet.helper";

type AttendanceReconciliationDependencyOverrides = {
	fetchAttendanceEmployeeSnapshotFields?: typeof fetchAttendanceEmployeeSnapshotFields;
	buildAttendanceTimekeepingFields?: typeof buildAttendanceTimekeepingFields;
	recomputeAttendanceObligationsForRange?: typeof recomputeAttendanceObligationsForRange;
	refreshTimesheetForAttendanceDate?: typeof refreshTimesheetForAttendanceDate;
	now?: () => Date;
};

type LeaveAttendanceAction = "created" | "converted" | "unchanged";
type LeaveTimesheetAction = "refreshed" | "adjustment_required";

export type LeaveAttendanceResult = {
	dateKey: string;
	action: LeaveAttendanceAction;
	attendanceId: string | null;
	previousAttendanceId: string | null;
};

export type LeaveTimesheetResult = {
	dateKey: string;
	action: LeaveTimesheetAction;
	timesheetId: string | null;
	reason: string | null;
};

const DEFAULT_DEPENDENCIES: Required<AttendanceReconciliationDependencyOverrides> = {
	fetchAttendanceEmployeeSnapshotFields,
	buildAttendanceTimekeepingFields,
	recomputeAttendanceObligationsForRange,
	refreshTimesheetForAttendanceDate,
	now: () => new Date(),
};

const WEEKDAY_LABELS = [
	"Sunday",
	"Monday",
	"Tuesday",
	"Wednesday",
	"Thursday",
	"Friday",
	"Saturday",
];

const getDateKey = (value: Date) => normalizeToStartOfDay(value).toISOString().split("T")[0];

const findShiftForDayOfWeek = (employeeSchedule: any, dayOfWeek: number) => {
	const shifts = Array.isArray(employeeSchedule?.shifts) ? employeeSchedule.shifts : [];
	const weekdayLabel = WEEKDAY_LABELS[dayOfWeek];
	return (
		shifts.find((shift: any) => {
			const label = String(shift?.label || shift?.day || shift?.name || "").trim();
			return label.toLowerCase() === weekdayLabel.toLowerCase();
		}) || null
	);
};

const buildApprovedLeaveDeviceInfo = (params: {
	requestId: string;
	leaveType: string;
	actorEmployeeId?: string | null;
	durationUnit?: string | null;
	halfDaySession?: string | null;
	sessionWindowStart?: string | null;
	sessionWindowEnd?: string | null;
}) => ({
	source: "LEAVE_REQUEST_APPROVAL",
	leaveRequestId: params.requestId,
	leaveType: params.leaveType,
	actorEmployeeId: params.actorEmployeeId || null,
	durationUnit: params.durationUnit || null,
	halfDaySession: params.halfDaySession || null,
	sessionWindowStart: params.sessionWindowStart || null,
	sessionWindowEnd: params.sessionWindowEnd || null,
});

const buildEffectiveLeaveNotes = (params: {
	leaveType: string;
	notes?: string | null;
	durationUnit?: string | null;
	halfDaySession?: string | null;
	sessionWindowStart?: string | null;
	sessionWindowEnd?: string | null;
}) => {
	if (params.durationUnit !== "HALF_DAY") {
		return params.notes || `${params.leaveType} Leave - Approved`;
	}

	if (!params.halfDaySession) {
		return params.notes || "HALF_DAY LEAVE";
	}

	return [
		"HALF_DAY",
		params.halfDaySession,
		params.sessionWindowStart && params.sessionWindowEnd
			? `${params.sessionWindowStart}-${params.sessionWindowEnd}`
			: "",
		params.leaveType ? `(${params.leaveType})` : "",
	]
		.filter(Boolean)
		.join(" ");
};

export async function applyApprovedLeaveAttendanceReconciliation(params: {
	prisma: PrismaClient;
	organizationId: string;
	requestId: string;
	employeeId: string;
	startDate: Date;
	endDate: Date;
	employeeSchedule?: any;
	leaveType: string;
	notes?: string | null;
	actorEmployeeId?: string | null;
	durationUnit?: string | null;
	halfDaySession?: string | null;
	sessionWindowStart?: string | null;
	sessionWindowEnd?: string | null;
	dependencies?: AttendanceReconciliationDependencyOverrides;
}) {
	const {
		prisma,
		organizationId,
		requestId,
		employeeId,
		startDate,
		endDate,
		employeeSchedule,
		leaveType,
		notes,
		actorEmployeeId,
		durationUnit,
		halfDaySession,
		sessionWindowStart,
		sessionWindowEnd,
	} = params;

	const dependencies = {
		...DEFAULT_DEPENDENCIES,
		...(params.dependencies || {}),
	};
	const employeeSnapshotFields = await dependencies.fetchAttendanceEmployeeSnapshotFields(
		prisma,
		employeeId,
	);
	const nonWorkedFields = dependencies.buildAttendanceTimekeepingFields(
		{
			totalMinutesWorked: 0,
			regularMinutes: 0,
			overtimeMinutes: 0,
			undertimeMinutes: 0,
			lateMinutes: 0,
			earlyOutMinutes: 0,
			breakMinutes: 0,
		},
		{ isNonWorked: true },
	);
	const effectiveNotes = buildEffectiveLeaveNotes({
		leaveType,
		notes,
		durationUnit,
		halfDaySession,
		sessionWindowStart,
		sessionWindowEnd,
	});
	const deviceInfo = buildApprovedLeaveDeviceInfo({
		requestId,
		leaveType,
		actorEmployeeId,
		durationUnit,
		halfDaySession,
		sessionWindowStart,
		sessionWindowEnd,
	});

	const attendanceResults: LeaveAttendanceResult[] = [];
	const touchedDates: Date[] = [];
	const currentDate = normalizeToStartOfDay(new Date(startDate));
	const rangeEndDate =
		durationUnit === "HALF_DAY"
			? normalizeToEndOfDay(new Date(startDate))
			: normalizeToEndOfDay(new Date(endDate));

	while (currentDate <= rangeEndDate) {
		const dayDate = new Date(currentDate);
		const dateKey = getDateKey(dayDate);
		const shift = findShiftForDayOfWeek(employeeSchedule, dayDate.getUTCDay());
		if (shift?.isRestDay) {
			currentDate.setUTCDate(currentDate.getUTCDate() + 1);
			continue;
		}

		const sameDayAttendances = await prisma.attendance.findMany({
			where: {
				organizationId,
				employeeId,
				isDeleted: false,
				date: {
					gte: normalizeToStartOfDay(dayDate),
					lte: normalizeToEndOfDay(dayDate),
				},
			},
			orderBy: [{ isEffective: "desc" }, { updatedAt: "desc" }],
		});

		const effectiveAttendance =
			sameDayAttendances.find((attendance) => attendance.isEffective !== false) || null;
		if (
			effectiveAttendance &&
			effectiveAttendance.status === "LEAVE" &&
			effectiveAttendance.sourceRequestId === requestId
		) {
			attendanceResults.push({
				dateKey,
				action: "unchanged",
				attendanceId: effectiveAttendance.id,
				previousAttendanceId: effectiveAttendance.supersedesAttendanceId || null,
			});
			touchedDates.push(new Date(dayDate));
			currentDate.setUTCDate(currentDate.getUTCDate() + 1);
			continue;
		}

		let nextAttendance;
		if (effectiveAttendance) {
			await prisma.attendance.updateMany({
				where: {
					organizationId,
					employeeId,
					isDeleted: false,
					isEffective: true,
					date: {
						gte: normalizeToStartOfDay(dayDate),
						lte: normalizeToEndOfDay(dayDate),
					},
				},
				data: {
					isEffective: false,
				},
			});

			nextAttendance = await prisma.attendance.create({
				data: {
					organizationId,
					employeeId,
					date: dayDate,
					status: "LEAVE",
					behaviorFlags: [],
					scheduleSnapshot: shift || employeeSchedule || undefined,
					deviceInfo,
					isManualEntry: true,
					isEffective: true,
					ledgerType: "CORRECTION",
					sourceRequestId: requestId,
					supersedesAttendanceId: effectiveAttendance.id,
					appliedAt: dependencies.now(),
					appliedBy: actorEmployeeId || null,
					notes: effectiveNotes,
					...employeeSnapshotFields,
					...nonWorkedFields,
				},
			});

			attendanceResults.push({
				dateKey,
				action: "converted",
				attendanceId: nextAttendance.id,
				previousAttendanceId: effectiveAttendance.id,
			});
		} else {
			nextAttendance = await prisma.attendance.create({
				data: {
					organizationId,
					employeeId,
					date: dayDate,
					status: "LEAVE",
					behaviorFlags: [],
					scheduleSnapshot: shift || employeeSchedule || undefined,
					deviceInfo,
					isManualEntry: true,
					isEffective: true,
					ledgerType: "RAW",
					sourceRequestId: requestId,
					appliedAt: dependencies.now(),
					appliedBy: actorEmployeeId || null,
					notes: effectiveNotes,
					...employeeSnapshotFields,
					...nonWorkedFields,
				},
			});

			attendanceResults.push({
				dateKey,
				action: "created",
				attendanceId: nextAttendance.id,
				previousAttendanceId: null,
			});
		}

		touchedDates.push(new Date(dayDate));
		currentDate.setUTCDate(currentDate.getUTCDate() + 1);
	}

	await dependencies.recomputeAttendanceObligationsForRange(prisma, {
		organizationId,
		employeeId,
		fromDate: startDate,
		toDate: endDate,
		reason: "LeaveApproved",
	});

	const timesheetResults: LeaveTimesheetResult[] = [];
	const seenDateKeys = new Set<string>();
	for (const touchedDate of touchedDates) {
		const dateKey = getDateKey(touchedDate);
		if (seenDateKeys.has(dateKey)) continue;
		seenDateKeys.add(dateKey);

		const refreshResult = await dependencies.refreshTimesheetForAttendanceDate(prisma, {
			organizationId,
			employeeId,
			date: touchedDate,
		});

		if ((refreshResult as any)?.refreshSkipped) {
			timesheetResults.push({
				dateKey,
				action: "adjustment_required",
				timesheetId: (refreshResult as any)?.id || null,
				reason: (refreshResult as any)?.refreshSkipReason || null,
			});
			continue;
		}

		timesheetResults.push({
			dateKey,
			action: "refreshed",
			timesheetId: (refreshResult as any)?.id || null,
			reason: null,
		});
	}

	return {
		attendanceResults,
		timesheetResults,
	};
}
