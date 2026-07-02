import { PrismaClient, AttendanceStatus as PrismaAttendanceStatus } from "../../generated/prisma";
import {
	buildAttendanceLedgerSummary,
	buildAttendanceTimekeepingFields,
	fetchAttendanceEmployeeSnapshotFields,
	normalizeToEndOfDay,
	normalizeToStartOfDay,
} from "../../helper/attendance.helper";
import {
	calculateTimekeeping,
	deriveBehaviorFlags,
	determineAttendanceStatus,
} from "../../helper/timekeeping.helper";
import { applyAttendanceToObligation } from "../../helper/attendance-obligation.helper";
import { refreshTimesheetForAttendanceDate } from "../../helper/timesheet.helper";
import { invalidateCache } from "../../middleware/cache";
import { getLogger } from "../../helper/logger.helper";

const ATTENDANCE_STATUS_VALUES = new Set<string>(Object.values(PrismaAttendanceStatus));

export const ATTENDANCE_CORRECTION_REASON_CATEGORY_OPTIONS = [
	"MISSED_PUNCH",
	"WRONG_STATUS",
	"MANUAL_REVIEW",
	"DEVICE_SYNC",
] as const;

export const ATTENDANCE_CORRECTION_NON_WORK_STATUSES = [
	"ABSENT",
	"LEAVE",
	"REST_DAY",
] as const;

export type AttendanceCorrectionSource =
	| "HR_DIRECT_CORRECTION"
	| "ATTENDANCE_CORRECTION_REQUEST"
	| "HR_DIRECT_BACKFILL";

export type AttendanceCorrectionClassification =
	| "WORKED"
	| "NON_WORKED"
	| "INCOMPLETE";

export type AttendanceStatus = (typeof PrismaAttendanceStatus)[keyof typeof PrismaAttendanceStatus];

export interface AttendanceCorrectionRawInput {
	attendanceId?: unknown;
	employeeId?: unknown;
	correctionDate?: unknown;
	status?: unknown;
	timeIn?: unknown;
	timeOut?: unknown;
	reasonCategory?: unknown;
	notes?: unknown;
	timeInLocation?: unknown;
	timeOutLocation?: unknown;
}

export interface AttendanceCorrectionNormalizationOptions {
	source?: AttendanceCorrectionSource;
	actorEmployeeId?: string | null;
	sourceRequestId?: string | null;
	requireAttendanceId?: boolean;
	allowDerivedStatus?: boolean;
	allowedReasonCategories?: readonly string[];
	notesFallbacks?: readonly unknown[];
}

export interface AttendanceCorrectionClassificationResult {
	status: AttendanceStatus;
	classification: AttendanceCorrectionClassification;
	isNonWorked: boolean;
	requiresFullWindow: boolean;
	allowsPartialWindow: boolean;
	requiresTimeIn: boolean;
}

export interface AttendanceCorrectionNormalizationIssue {
	field: string;
	message: string;
}

export interface AttendanceCorrectionNormalizedPayload {
	attendanceId: string | null;
	employeeId: string;
	correctionDate: Date;
	correctionDateKey: string;
	startOfDay: Date;
	endOfDay: Date;
	status: AttendanceStatus;
	classification: AttendanceCorrectionClassification;
	reasonCategory: string;
	notes: string | null;
	timeIn: Date | null;
	timeOut: Date | null;
	timeInLocation: unknown | null;
	timeOutLocation: unknown | null;
	source: AttendanceCorrectionSource;
	actorEmployeeId: string | null;
	sourceRequestId: string | null;
}

export interface AttendanceCorrectionNormalizationResult {
	ok: boolean;
	issues: AttendanceCorrectionNormalizationIssue[];
	payload: AttendanceCorrectionNormalizedPayload | null;
}

export class AttendanceCorrectionError extends Error {
	statusCode: number;
	issues?: AttendanceCorrectionNormalizationIssue[];

	constructor(
		message: string,
		statusCode = 400,
		issues?: AttendanceCorrectionNormalizationIssue[],
	) {
		super(message);
		this.name = "AttendanceCorrectionError";
		this.statusCode = statusCode;
		this.issues = issues;
	}
}

export interface AttendanceCorrectionMutationDependencies {
	buildAttendanceLedgerSummary?: typeof buildAttendanceLedgerSummary;
	buildAttendanceTimekeepingFields?: typeof buildAttendanceTimekeepingFields;
	fetchAttendanceEmployeeSnapshotFields?: typeof fetchAttendanceEmployeeSnapshotFields;
	calculateTimekeeping?: typeof calculateTimekeeping;
	deriveBehaviorFlags?: typeof deriveBehaviorFlags;
	applyAttendanceToObligation?: typeof applyAttendanceToObligation;
	refreshTimesheetForAttendanceDate?: typeof refreshTimesheetForAttendanceDate;
	invalidateCacheByPattern?: typeof invalidateCache.byPattern;
	now?: () => Date;
	logger?: ReturnType<typeof getLogger> | null;
}

export interface AttendanceCorrectionMutationParams {
	prisma: PrismaClient;
	organizationId: string;
	rawInput: AttendanceCorrectionRawInput;
	source: AttendanceCorrectionSource;
	actorEmployeeId: string | null;
	sourceRequestId?: string | null;
	allowedReasonCategories?: readonly string[];
	notesFallbacks?: readonly unknown[];
	requireAttendanceId?: boolean;
	allowDerivedStatus?: boolean;
	dependencies?: AttendanceCorrectionMutationDependencies;
}

export interface AttendanceCorrectionMutationResult {
	normalized: AttendanceCorrectionNormalizedPayload;
	sameDayAttendances: any[];
	rawAttendance: any;
	effectiveAttendance: any;
	createdAttendance: any;
	attendanceHistory: any[];
	obligation: any;
	refreshedTimesheet: any;
}

const normalizeTrimmedString = (value: unknown): string => String(value ?? "").trim();

const normalizeUppercaseString = (value: unknown): string =>
	normalizeTrimmedString(value).toUpperCase();

const getAttendanceStatusValue = (value: unknown): AttendanceStatus | null => {
	const normalized = normalizeUppercaseString(value);
	if (!normalized || !ATTENDANCE_STATUS_VALUES.has(normalized)) {
		return null;
	}

	return normalized as AttendanceStatus;
};

export function classifyAttendanceCorrectionStatus(
	status: AttendanceStatus,
): AttendanceCorrectionClassificationResult {
	if (status === "INCOMPLETE") {
		return {
			status,
			classification: "INCOMPLETE",
			isNonWorked: false,
			requiresFullWindow: false,
			allowsPartialWindow: true,
			requiresTimeIn: true,
		};
	}

	if (ATTENDANCE_CORRECTION_NON_WORK_STATUSES.includes(status as any)) {
		return {
			status,
			classification: "NON_WORKED",
			isNonWorked: true,
			requiresFullWindow: false,
			allowsPartialWindow: false,
			requiresTimeIn: false,
		};
	}

	return {
		status,
		classification: "WORKED",
		isNonWorked: false,
		requiresFullWindow: true,
		allowsPartialWindow: false,
		requiresTimeIn: true,
	};
}

export function parseAttendanceCorrectionClockValue(
	date: Date,
	value: unknown,
): { value: Date | null; issue?: string } {
	const normalized = normalizeTrimmedString(value);
	if (!normalized) {
		return { value: null };
	}

	if (value instanceof Date) {
		return Number.isNaN(value.getTime())
			? { value: null, issue: "must be a valid date and time." }
			: { value: new Date(value) };
	}

	const isoCandidate = new Date(normalized);
	if (normalized.includes("T") && !Number.isNaN(isoCandidate.getTime())) {
		return { value: isoCandidate };
	}

	const match = normalized.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
	if (!match) {
		return { value: null, issue: "must use a valid 24-hour time format." };
	}

	const hours = Number(match[1]);
	const minutes = Number(match[2]);
	const seconds = Number(match[3] || "0");
	if (
		Number.isNaN(hours) ||
		Number.isNaN(minutes) ||
		Number.isNaN(seconds) ||
		hours < 0 ||
		hours > 23 ||
		minutes < 0 ||
		minutes > 59 ||
		seconds < 0 ||
		seconds > 59
	) {
		return { value: null, issue: "must use a valid 24-hour time format." };
	}

	const dateKey = normalizeToStartOfDay(date).toISOString().slice(0, 10);
	return {
		value: new Date(
			`${dateKey}T${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}.000Z`,
		),
	};
}

export function normalizeAttendanceCorrectionReasonCategory(
	value: unknown,
	allowedReasonCategories: readonly string[] = ATTENDANCE_CORRECTION_REASON_CATEGORY_OPTIONS,
): { value: string | null; issue?: string } {
	const normalized = normalizeUppercaseString(value);
	if (!normalized) {
		return { value: null, issue: "Reason category is required." };
	}

	const allowed = new Set(allowedReasonCategories.map((item) => normalizeUppercaseString(item)));
	if (!allowed.has(normalized)) {
		return {
			value: null,
			issue: `Reason category must be one of: ${Array.from(allowed).join(", ")}`,
		};
	}

	return { value: normalized };
}

const pickFirstMeaningfulString = (values: readonly unknown[]): string | null => {
	for (const value of values) {
		const normalized = normalizeTrimmedString(value);
		if (normalized) return normalized;
	}

	return null;
};

export function normalizeAttendanceCorrectionPayload(
	input: AttendanceCorrectionRawInput,
	options: AttendanceCorrectionNormalizationOptions = {},
): AttendanceCorrectionNormalizationResult {
	const issues: AttendanceCorrectionNormalizationIssue[] = [];
	const source = options.source || "HR_DIRECT_CORRECTION";
	const attendanceId = normalizeTrimmedString(input.attendanceId) || null;
	const employeeId = normalizeTrimmedString(input.employeeId) || null;
	const correctionDateValue =
		input.correctionDate instanceof Date ? input.correctionDate : input.correctionDate;

	if (options.requireAttendanceId === true && !attendanceId) {
		issues.push({ field: "attendanceId", message: "Attendance ID is required." });
	}

	if (!employeeId) {
		issues.push({ field: "employeeId", message: "Employee is required." });
	}

	const parsedDate =
		correctionDateValue instanceof Date
			? correctionDateValue
			: new Date(String(correctionDateValue || "").trim());
	if (Number.isNaN(parsedDate.getTime())) {
		issues.push({ field: "correctionDate", message: "Correction date is invalid." });
		return { ok: false, issues, payload: null };
	}

	const startOfDay = normalizeToStartOfDay(parsedDate);
	const endOfDay = normalizeToEndOfDay(parsedDate);
	const correctionDateKey = startOfDay.toISOString().slice(0, 10);
	const timeInResult = parseAttendanceCorrectionClockValue(startOfDay, input.timeIn);
	const timeOutResult = parseAttendanceCorrectionClockValue(startOfDay, input.timeOut);

	const explicitStatus = getAttendanceStatusValue(input.status);
	const derivedStatusMode = !explicitStatus && options.allowDerivedStatus === true;
	let status = explicitStatus;
	if (!status && derivedStatusMode) {
		status = determineAttendanceStatus(
			{
				totalMinutesWorked: 0,
				regularMinutes: 0,
				overtimeMinutes: 0,
				undertimeMinutes: 0,
				lateMinutes: 0,
				earlyOutMinutes: 0,
				breakMinutes: 0,
			},
			Boolean(timeOutResult.value),
		);
	}

	if (!status) {
		issues.push({ field: "status", message: "Status is invalid." });
	}

	const classification = status ? classifyAttendanceCorrectionStatus(status) : null;
	const reasonCategoryResult = normalizeAttendanceCorrectionReasonCategory(
		input.reasonCategory,
		options.allowedReasonCategories,
	);
	if (reasonCategoryResult.issue) {
		issues.push({ field: "reasonCategory", message: reasonCategoryResult.issue });
	}

	if (!classification) {
		return { ok: false, issues, payload: null };
	}

	let timeIn: Date | null = null;
	let timeOut: Date | null = null;
	let timeInLocation: unknown | null = input.timeInLocation ?? null;
	let timeOutLocation: unknown | null = input.timeOutLocation ?? null;

	if (classification.classification === "NON_WORKED") {
		timeInLocation = null;
		timeOutLocation = null;
		if (timeInResult.issue) {
			issues.push({ field: "timeIn", message: timeInResult.issue });
		}
		if (timeOutResult.issue) {
			issues.push({ field: "timeOut", message: timeOutResult.issue });
		}
	} else if (classification.classification === "WORKED") {
		if (timeInResult.issue) {
			issues.push({ field: "timeIn", message: timeInResult.issue });
		}
		if (timeOutResult.issue) {
			issues.push({ field: "timeOut", message: timeOutResult.issue });
		}
		if (!derivedStatusMode && !timeInResult.value) {
			issues.push({ field: "timeIn", message: "Time In is required for worked-day corrections." });
		}
		if (!derivedStatusMode && !timeOutResult.value) {
			issues.push({
				field: "timeOut",
				message: "Time Out is required for worked-day corrections.",
			});
		}
		if (timeInResult.value && timeOutResult.value && timeOutResult.value <= timeInResult.value) {
			issues.push({
				field: "timeOut",
				message: "Time Out must be later than Time In for worked-day corrections.",
			});
		}
		timeIn = timeInResult.value;
		timeOut = timeOutResult.value;
	} else {
		if (timeInResult.issue) {
			issues.push({ field: "timeIn", message: timeInResult.issue });
		}
		if (timeOutResult.issue) {
			issues.push({ field: "timeOut", message: timeOutResult.issue });
		}
		if (!timeInResult.value) {
			issues.push({
				field: "timeIn",
				message: "Time In is required for incomplete corrections.",
			});
		}
		if (timeInResult.value && timeOutResult.value && timeOutResult.value <= timeInResult.value) {
			issues.push({
				field: "timeOut",
				message: "Time Out must be later than Time In for incomplete corrections.",
			});
		}
		timeIn = timeInResult.value;
		timeOut = timeOutResult.value;
	}

	const notes = pickFirstMeaningfulString([input.notes, ...(options.notesFallbacks || [])]);
	if (!notes) {
		issues.push({
			field: "notes",
			message: "Explanation is required for attendance corrections.",
		});
	}

	if (issues.length > 0 || !reasonCategoryResult.value || !notes) {
		return { ok: false, issues, payload: null };
	}

	return {
		ok: true,
		issues: [],
		payload: {
			attendanceId,
			employeeId: employeeId as string,
			correctionDate: startOfDay,
			correctionDateKey,
			startOfDay,
			endOfDay,
			status: status as AttendanceStatus,
			classification: classification.classification,
			reasonCategory: reasonCategoryResult.value,
			notes,
			timeIn,
			timeOut,
			timeInLocation,
			timeOutLocation,
			source,
			actorEmployeeId: normalizeTrimmedString(options.actorEmployeeId) || null,
			sourceRequestId: normalizeTrimmedString(options.sourceRequestId) || null,
		},
	};
}

const attendanceCorrectionServiceLogger = getLogger().child({
	module: "attendance-correction-service",
});

const ATTENDANCE_CORRECTION_RELATION_INCLUDE = {
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

const getAttendanceCorrectionCachePatterns = (params: {
	attendanceId?: string | null;
	employeeId: string;
	createdAttendanceId: string;
}) => {
	const patterns = [
		"cache:attendance:list:*",
		`cache:attendance:employee:${params.employeeId}:*`,
		`cache:attendance:byId:${params.createdAttendanceId}:*`,
		"cache:timesheet:list:*",
		"cache:timesheet:view:*",
	];

	if (params.attendanceId) {
		patterns.push(`cache:attendance:byId:${params.attendanceId}:*`);
	}

	return Array.from(new Set(patterns));
};

export async function applyAttendanceCorrection(
	params: AttendanceCorrectionMutationParams,
): Promise<AttendanceCorrectionMutationResult> {
	const dependencies = params.dependencies || {};
	const normalizeResult = normalizeAttendanceCorrectionPayload(params.rawInput, {
		source: params.source,
		actorEmployeeId: params.actorEmployeeId,
		sourceRequestId: params.sourceRequestId,
		requireAttendanceId: params.requireAttendanceId,
		allowDerivedStatus: params.allowDerivedStatus,
		allowedReasonCategories: params.allowedReasonCategories,
		notesFallbacks: params.notesFallbacks,
	});

	if (!normalizeResult.ok || !normalizeResult.payload) {
		throw new AttendanceCorrectionError(
			"Attendance correction validation failed.",
			400,
			normalizeResult.issues,
		);
	}

	const normalized = normalizeResult.payload;
	const buildAttendanceLedgerSummaryFn =
		dependencies.buildAttendanceLedgerSummary || buildAttendanceLedgerSummary;
	const buildAttendanceTimekeepingFieldsFn =
		dependencies.buildAttendanceTimekeepingFields || buildAttendanceTimekeepingFields;
	const fetchAttendanceEmployeeSnapshotFieldsFn =
		dependencies.fetchAttendanceEmployeeSnapshotFields || fetchAttendanceEmployeeSnapshotFields;
	const calculateTimekeepingFn = dependencies.calculateTimekeeping || calculateTimekeeping;
	const deriveBehaviorFlagsFn = dependencies.deriveBehaviorFlags || deriveBehaviorFlags;
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
		include: ATTENDANCE_CORRECTION_RELATION_INCLUDE,
		orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
	});

	if (!sameDayAttendances.length) {
		throw new AttendanceCorrectionError(
			"Attendance correction requires an existing attendance record for the selected date.",
			400,
		);
	}

	const ledgerSummary = buildAttendanceLedgerSummaryFn(sameDayAttendances as any[]);
	const rawAttendance =
		ledgerSummary.rawAttendance ||
		sameDayAttendances.find((attendance) => String((attendance as any).ledgerType || "RAW") === "RAW") ||
		sameDayAttendances[0];
	const targetAttendance = normalized.attendanceId
		? sameDayAttendances.find((attendance) => attendance.id === normalized.attendanceId)
		: null;
	if (normalized.attendanceId && !targetAttendance) {
		throw new AttendanceCorrectionError("Attendance not found for selected day.", 404);
	}

	const effectiveAttendance =
		ledgerSummary.effectiveAttendance || targetAttendance || rawAttendance || sameDayAttendances[0];
	const isNonWorkedCorrection = normalized.classification === "NON_WORKED";
	const correctedTimeIn = isNonWorkedCorrection ? null : normalized.timeIn;
	const correctedTimeOut = isNonWorkedCorrection ? null : normalized.timeOut;
	const scheduleSnapshot =
		(effectiveAttendance as any)?.scheduleSnapshot || (rawAttendance as any)?.scheduleSnapshot || null;
	const timekeepingCalc = calculateTimekeepingFn(
		correctedTimeIn,
		correctedTimeOut,
		scheduleSnapshot,
		normalized.correctionDate,
	);
	const behaviorFlags = isNonWorkedCorrection
		? []
		: deriveBehaviorFlagsFn({
				timeIn: correctedTimeIn,
				timeOut: correctedTimeOut,
				schedule: scheduleSnapshot,
				date: normalized.correctionDate,
		  });
	const employeeSnapshotFields = await fetchAttendanceEmployeeSnapshotFieldsFn(
		params.prisma,
		normalized.employeeId,
	);
	const timekeepingFields = buildAttendanceTimekeepingFieldsFn(timekeepingCalc, {
		isNonWorked: isNonWorkedCorrection,
	});

	const createdAttendance = await params.prisma.$transaction(async (tx) => {
		await tx.attendance.updateMany({
			where: {
				organizationId: params.organizationId,
				employeeId: normalized.employeeId,
				isDeleted: false,
				date: {
					gte: normalized.startOfDay,
					lte: normalized.endOfDay,
				},
				isEffective: true,
			},
			data: {
				isEffective: false,
			},
		});

		return tx.attendance.create({
			data: {
				organizationId: params.organizationId,
				employeeId: normalized.employeeId,
				date: normalized.correctionDate,
				timeIn: correctedTimeIn,
				timeOut: correctedTimeOut,
				status: normalized.status,
				notes: normalized.notes,
				scheduleSnapshot,
				isManualEntry: true,
				approvedBy: params.actorEmployeeId || null,
				ledgerType: "CORRECTION",
				sourceRequestId: normalized.sourceRequestId || null,
				supersedesAttendanceId: effectiveAttendance?.id || rawAttendance?.id || null,
				appliedAt: now,
				appliedBy: params.actorEmployeeId || null,
				isEffective: true,
				behaviorFlags,
				...employeeSnapshotFields,
				...timekeepingFields,
				timeInLocation: isNonWorkedCorrection
					? null
					: normalized.timeInLocation ??
						(effectiveAttendance as any)?.timeInLocation ??
						(rawAttendance as any)?.timeInLocation ??
						null,
				timeOutLocation: isNonWorkedCorrection
					? null
					: normalized.timeOutLocation ??
						(effectiveAttendance as any)?.timeOutLocation ??
						(rawAttendance as any)?.timeOutLocation ??
						null,
				deviceInfo: {
					source: params.source,
					attendanceId: normalized.attendanceId,
					requestId: normalized.sourceRequestId || null,
					reasonCategory: normalized.reasonCategory,
					actorEmployeeId: params.actorEmployeeId,
					classification: normalized.classification,
				},
			},
			include: ATTENDANCE_CORRECTION_RELATION_INCLUDE,
		});
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

	const cachePatterns = getAttendanceCorrectionCachePatterns({
		attendanceId: normalized.attendanceId,
		employeeId: normalized.employeeId,
		createdAttendanceId: createdAttendance.id,
	});
	for (const pattern of cachePatterns) {
		try {
			await invalidateCacheByPattern(pattern);
		} catch (cacheError) {
			attendanceCorrectionServiceLogger.warn(
				`Failed to invalidate attendance correction cache pattern ${pattern}:`,
				cacheError,
			);
		}
	}

	return {
		normalized,
		sameDayAttendances,
		rawAttendance,
		effectiveAttendance,
		createdAttendance,
		attendanceHistory: [createdAttendance, ...sameDayAttendances],
		obligation,
		refreshedTimesheet,
	};
}
