import { PrismaClient } from "../../generated/prisma";
import { getLogger } from "../../helper/logger.helper";
import { resolveEffectiveShift } from "../../helper/employee-schedule.helper";
import { calculateTimekeeping } from "../../helper/timekeeping.helper";
import { resolveOvertimePolicyApplication } from "../../helper/overtime-approval.helper";
import {
	fetchAttendanceEmployeeSnapshotFields,
	normalizeToStartOfDay,
} from "../../helper/attendance.helper";
import { applyAttendanceToObligation } from "../../helper/attendance-obligation.helper";
import { refreshTimesheetForAttendanceDate } from "../../helper/timesheet.helper";
import { invalidateCache } from "../../middleware/cache";
import {
	AttendanceCorrectionError,
	type AttendanceCorrectionMutationDependencies,
	type AttendanceCorrectionNormalizedPayload,
	type AttendanceCorrectionRawInput,
	type AttendanceCorrectionSource,
	normalizeAttendanceCorrectionPayload,
} from "./attendance-correction.service";

const attendanceBackfillLogger = getLogger().child({
	module: "attendance-backfill-service",
});

const ATTENDANCE_BACKFILL_RELATION_INCLUDE = {
	employee: {
		select: {
			id: true,
			employeeId: true,
			person: { select: { personalInfo: true } },
			position: { select: { title: true } },
			department: { select: { name: true } },
		},
	},
	appliedByEmployee: {
		select: {
			id: true,
			employeeId: true,
			person: { select: { personalInfo: true } },
			position: { select: { title: true } },
			department: { select: { name: true } },
		},
	},
} as const;

export interface AttendanceBackfillMutationParams {
	prisma: PrismaClient;
	organizationId: string;
	rawInput: AttendanceCorrectionRawInput;
	source: AttendanceCorrectionSource;
	actorEmployeeId: string | null;
	sourceRequestId?: string | null;
	allowedReasonCategories?: readonly string[];
	notesFallbacks?: readonly unknown[];
	dependencies?: AttendanceCorrectionMutationDependencies & {
		resolveEffectiveShift?: typeof resolveEffectiveShift;
		resolveOvertimePolicyApplication?: typeof resolveOvertimePolicyApplication;
	};
}

export interface AttendanceBackfillMutationResult {
	normalized: AttendanceCorrectionNormalizedPayload;
	sameDayAttendances: any[];
	rawAttendance: any | null;
	effectiveAttendance: any | null;
	createdAttendance: any;
	attendanceHistory: any[];
	obligation: any;
	refreshedTimesheet: any;
}

const getAttendanceBackfillCachePatterns = (params: {
	employeeId: string;
	createdAttendanceId: string;
}) => [
	"cache:attendance:list:*",
	`cache:attendance:employee:${params.employeeId}:*`,
	`cache:attendance:byId:${params.createdAttendanceId}:*`,
	"cache:timesheet:list:*",
	"cache:timesheet:view:*",
];

const ATTENDANCE_BACKFILL_RELATION_SELECT = ATTENDANCE_BACKFILL_RELATION_INCLUDE;

export async function applyAttendanceBackfill(
	params: AttendanceBackfillMutationParams,
): Promise<AttendanceBackfillMutationResult> {
	const dependencies = params.dependencies || {};
	const normalizeResult = normalizeAttendanceCorrectionPayload(params.rawInput, {
		source: params.source,
		actorEmployeeId: params.actorEmployeeId,
		sourceRequestId: params.sourceRequestId,
		requireAttendanceId: false,
		allowedReasonCategories: params.allowedReasonCategories,
		notesFallbacks: params.notesFallbacks,
	});

	if (!normalizeResult.ok || !normalizeResult.payload) {
		throw new AttendanceCorrectionError(
			"Attendance backfill validation failed.",
			400,
			normalizeResult.issues,
		);
	}

	const normalized = normalizeResult.payload;
	const fetchAttendanceEmployeeSnapshotFieldsFn =
		dependencies.fetchAttendanceEmployeeSnapshotFields || fetchAttendanceEmployeeSnapshotFields;
	const calculateTimekeepingFn = dependencies.calculateTimekeeping || calculateTimekeeping;
	const resolveEffectiveShiftFn = dependencies.resolveEffectiveShift || resolveEffectiveShift;
	const resolveOvertimePolicyApplicationFn =
		dependencies.resolveOvertimePolicyApplication || resolveOvertimePolicyApplication;
	const applyAttendanceToObligationFn =
		dependencies.applyAttendanceToObligation || applyAttendanceToObligation;
	const refreshTimesheetForAttendanceDateFn =
		dependencies.refreshTimesheetForAttendanceDate || refreshTimesheetForAttendanceDate;
	const invalidateCacheByPattern =
		dependencies.invalidateCacheByPattern || invalidateCache.byPattern;
	const now = dependencies.now ? dependencies.now() : new Date();

	const sameDayAttendances = await params.prisma.attendance.findMany({
		where: {
			organizationId: params.organizationId,
			employeeId: normalized.employeeId,
			isDeleted: false,
			date: {
				gte: normalized.startOfDay,
				lte: normalized.endOfDay,
			},
		},
		include: ATTENDANCE_BACKFILL_RELATION_SELECT,
		orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
	});

	if (sameDayAttendances.length > 0) {
		throw new AttendanceCorrectionError(
			"Attendance backfill requires no existing attendance record for the selected date.",
			409,
		);
	}

	const attendanceDate = normalizeToStartOfDay(normalized.correctionDate);
	const scheduleSnapshot =
		(await resolveEffectiveShiftFn(params.prisma, {
			organizationId: params.organizationId,
			employeeId: normalized.employeeId,
			date: attendanceDate,
		})) || null;
	const isNonWorkedCorrection = normalized.classification === "NON_WORKED";
	const correctedTimeIn = isNonWorkedCorrection ? null : normalized.timeIn;
	const correctedTimeOut = isNonWorkedCorrection ? null : normalized.timeOut;
	const timekeepingCalc = calculateTimekeepingFn(
		correctedTimeIn,
		correctedTimeOut,
		scheduleSnapshot,
		normalized.correctionDate,
	);
	const employeeSnapshotFields = await fetchAttendanceEmployeeSnapshotFieldsFn(
		params.prisma,
		normalized.employeeId,
	);
	const overtimeApplication = await resolveOvertimePolicyApplicationFn(
		params.prisma,
		params.organizationId,
		{
			calc: timekeepingCalc,
			timeIn: correctedTimeIn,
			timeOut: correctedTimeOut,
			schedule: scheduleSnapshot,
			date: normalized.correctionDate,
			isNonWorked: isNonWorkedCorrection,
			attendanceStatus: normalized.status,
		},
	);
	const behaviorFlags = isNonWorkedCorrection ? [] : overtimeApplication.behaviorFlags;
	const timekeepingFields = overtimeApplication.timekeepingFields;

	const createdAttendance = await params.prisma.attendance.create({
		data: {
			organizationId: params.organizationId,
			employeeId: normalized.employeeId,
			date: normalized.correctionDate,
			timeIn: correctedTimeIn,
			timeOut: correctedTimeOut,
			status: normalized.status,
			notes: normalized.notes,
			scheduleSnapshot: scheduleSnapshot || undefined,
			isManualEntry: true,
			ledgerType: "RAW",
			appliedAt: now,
			appliedBy: params.actorEmployeeId || null,
			isEffective: true,
			behaviorFlags,
			...employeeSnapshotFields,
			...timekeepingFields,
			timeInLocation: isNonWorkedCorrection
				? undefined
				: normalized.timeInLocation ?? undefined,
			timeOutLocation: isNonWorkedCorrection
				? undefined
				: normalized.timeOutLocation ?? undefined,
			deviceInfo: {
				source: params.source,
				mode: "BACKFILL",
				attendanceId: null,
				requestId: normalized.sourceRequestId || null,
				reasonCategory: normalized.reasonCategory,
				actorEmployeeId: params.actorEmployeeId,
				classification: normalized.classification,
			},
		},
		include: ATTENDANCE_BACKFILL_RELATION_SELECT,
	});

	const obligation = await applyAttendanceToObligationFn(params.prisma, {
		organizationId: params.organizationId,
		employeeId: normalized.employeeId,
		attendanceId: createdAttendance.id,
	});

	const refreshedTimesheet = await refreshTimesheetForAttendanceDateFn(params.prisma, {
		organizationId: params.organizationId,
		employeeId: normalized.employeeId,
		date: normalized.correctionDate,
	});

	for (const pattern of getAttendanceBackfillCachePatterns({
		employeeId: normalized.employeeId,
		createdAttendanceId: createdAttendance.id,
	})) {
		try {
			await invalidateCacheByPattern(pattern);
		} catch (cacheError) {
			attendanceBackfillLogger.warn(
				`Failed to invalidate attendance backfill cache pattern ${pattern}:`,
				cacheError,
			);
		}
	}

	return {
		normalized,
		sameDayAttendances,
		rawAttendance: null,
		effectiveAttendance: null,
		createdAttendance,
		attendanceHistory: [createdAttendance],
		obligation,
		refreshedTimesheet,
	};
}
