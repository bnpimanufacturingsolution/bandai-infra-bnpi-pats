import { PrismaClient } from "../../generated/prisma";
import {
	normalizeToEndOfDay,
	normalizeToStartOfDay,
} from "../../helper/attendance.helper";
import { recomputeAttendanceObligationsForRange } from "../../helper/attendance-obligation.helper";
import { refreshTimesheetForAttendanceDate } from "../../helper/timesheet.helper";

type TimeAdjustmentReconciliationDependencyOverrides = {
	recomputeAttendanceObligationsForRange?: typeof recomputeAttendanceObligationsForRange;
	refreshTimesheetForAttendanceDate?: typeof refreshTimesheetForAttendanceDate;
};

type TimeAdjustmentReconciliationAction = "refreshed" | "adjustment_required";

export type TimeAdjustmentAttendanceResult = {
	dateKey: string;
	action: TimeAdjustmentReconciliationAction;
	attendanceId: string | null;
	previousAttendanceId: string | null;
};

export type TimeAdjustmentTimesheetResult = {
	dateKey: string;
	action: TimeAdjustmentReconciliationAction;
	timesheetId: string | null;
	reason: string | null;
};

const DEFAULT_DEPENDENCIES: Required<TimeAdjustmentReconciliationDependencyOverrides> = {
	recomputeAttendanceObligationsForRange,
	refreshTimesheetForAttendanceDate,
};

const getDateKey = (value: Date) => normalizeToStartOfDay(value).toISOString().split("T")[0];

export async function applyApprovedTimeAdjustmentReconciliation(params: {
	prisma: PrismaClient;
	organizationId: string;
	requestId: string;
	employeeId: string;
	date: Date;
	dependencies?: TimeAdjustmentReconciliationDependencyOverrides;
}) {
	const { prisma, organizationId, employeeId } = params;
	const dependencies = {
		...DEFAULT_DEPENDENCIES,
		...(params.dependencies || {}),
	};
	const adjustmentDate = normalizeToStartOfDay(new Date(params.date));
	const dateKey = getDateKey(adjustmentDate);

	const sameDayAttendances = await prisma.attendance.findMany({
		where: {
			organizationId,
			employeeId,
			isDeleted: false,
			date: {
				gte: normalizeToStartOfDay(adjustmentDate),
				lte: normalizeToEndOfDay(adjustmentDate),
			},
		},
		orderBy: [{ isEffective: "desc" }, { updatedAt: "desc" }],
	});
	const effectiveAttendance =
		sameDayAttendances.find((attendance) => attendance.isEffective !== false) || null;

	await dependencies.recomputeAttendanceObligationsForRange(prisma, {
		organizationId,
		employeeId,
		fromDate: adjustmentDate,
		toDate: adjustmentDate,
		reason: "TimeAdjustmentApproved",
	});

	const refreshResult = await dependencies.refreshTimesheetForAttendanceDate(prisma, {
		organizationId,
		employeeId,
		date: adjustmentDate,
	});

	return {
		attendanceResults: [
			{
				dateKey,
				action: "refreshed" as const,
				attendanceId: effectiveAttendance?.id || null,
				previousAttendanceId: effectiveAttendance?.supersedesAttendanceId || null,
			},
		] satisfies TimeAdjustmentAttendanceResult[],
		timesheetResults: [
			(refreshResult as any)?.refreshSkipped
				? {
						dateKey,
						action: "adjustment_required" as const,
						timesheetId: (refreshResult as any)?.id || null,
						reason: (refreshResult as any)?.refreshSkipReason || null,
					}
				: {
						dateKey,
						action: "refreshed" as const,
						timesheetId: (refreshResult as any)?.id || null,
						reason: null,
					},
		] satisfies TimeAdjustmentTimesheetResult[],
	};
}
