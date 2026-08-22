// @ts-nocheck
import { Request, Response, NextFunction } from "express";
import { PrismaClient, Prisma } from "../../generated/prisma";
import { z } from "zod";
import { getLogger } from "../../helper/logger.helper";
import { transformFormDataToObject } from "../../helper/transformObject";
import { validateQueryParams } from "../../helper/validation-helper";
import {
	analyzeAttendanceAction,
	buildAttendanceDateQuery,
	buildAttendanceTimekeepingFields,
	fetchAttendanceEmployeeSnapshotFields,
	getEffectiveAttendanceRecordsForRange,
	getDateKeyInBusinessTimeZone,
	getBusinessDayBounds,
	getBusinessDayDate,
	getEffectiveEmploymentStartDate,
	getTodayBusinessDayBounds,
	isBeforeEffectiveEmploymentStartDate,
	normalizeToStartOfDay,
} from "../../helper/attendance.helper";
import {
	buildFilterConditions,
	buildFindManyQuery,
	buildSearchConditions,
	getNestedFields,
	normalizeAndValidateFieldSelection,
	appendAndConditions,
} from "../../helper/query-builder.helper";
import { processGroupedCounts } from "../../helper/employee.helper";
import { buildSuccessResponse, buildPagination } from "../../helper/success-handler.helper";
import { groupDataByField } from "../../helper/dataGrouping";
import {
	buildErrorResponse,
	formatZodErrors,
	limitErrorDetails,
	type ErrorDetail,
} from "../../helper/error-handler";
import { syncDepartmentDefaultScheduleLink } from "../../helper/department-schedule.helper";

import {
	UpdateEmployeeSchema,
	CreateEmployeeWithAccountSchema,
	UpdateEmployeeWithAccountSchema,
} from "../../zod/employee.zod";
import { logActivity } from "../../utils/activityLogger";
import { logAudit } from "../../utils/auditLogger";
import { config } from "../../config/constant";
import { redisClient } from "../../config/redis";
import { CreateAttendanceSchema, UpdateAttendanceSchema } from "../../zod/attendance.zod";
import { UpdatePersonSchema } from "../../zod/person.zod";
import { UpdateUserSchema } from "../../zod/user.zod";
import { createEmployeeHelpers } from "../../helper/employee.helper";
import { lockIncomingPersonToApplicant } from "../../helper/applicant-hire-identity.helper";
import {
	calculateTimekeeping,
	determineAttendanceStatus,
	deriveBehaviorFlags,
	deriveGracePeriodStatus,
} from "../../helper/timekeeping.helper";
import { resolveOvertimePolicyApplication } from "../../helper/overtime-approval.helper";
import {
	ensureCurrentPayrollPeriodDraftTimesheet,
	refreshTimesheetForAttendanceDate,
} from "../../helper/timesheet.helper";
import { enrichBreakdownWithLeaveHolidayContext } from "../../helper/day-context.helper";
import { EmployeeImportService } from "./employee-import.service";
import { EmployeeImportRow } from "../../helper/employee-import.helper";
import * as XLSX from "xlsx";
import { normalizeEmployeeBenefitPayload } from "../../helper/employee-benefit-program.helper";
import { deriveRoleAndFlagsFromRecord } from "../../utils/role-derivation";
import { reserveNextEmployeeId } from "../../helper/employee-id-code.helper";
import { invalidateCache } from "../../middleware/cache";
import {
	appendEmployeeScheduleHistory,
	copyTemplateToEmployeeEmbeddedSchedule,
	collectShiftTypeIdsFromEmployeeScheduleData,
	type EmployeeScheduleSnapshot,
	normalizeEmployeeScheduleEntries as normalizeEmployeeSchedules,
	resolveEffectiveShift,
	resolveEffectiveShiftFromEmployeeData,
	resolveEmployeeActiveSchedule,
} from "../../helper/employee-schedule.helper";
import {
	createDocumentChecklistItems,
	getPendingActiveDocumentChecklistCandidates,
	reconcileEmployeeOnboardingState,
} from "../../helper/boarding-documents.helper";
import { validateEmployeeMutationDatePayload } from "../../helper/employee-date-validation.helper";
import { getEmployeeDocumentPriorityData } from "../../helper/employee-document-priority.helper";
import {
	applyInferredDocumentFieldValidation,
	validateDocumentFieldValue,
	type DocumentFieldValidationTarget,
} from "../../helper/document-field-validation.helper";
import {
	buildDocumentReviewCompatibilityMetadata,
	buildPendingDocumentReviewData,
	createDocumentReviewEvent,
	DocumentReviewEventType,
	DocumentReviewSource,
	DocumentReviewStatus,
	extractDocumentReviewSnapshot,
} from "../../helper/document-review.helper";
import { publishDocumentReviewSubmittedNotification } from "../../helper/notification-dispatch.helper";
import {
	applyAttendanceToObligation,
	backfillOpenPayrollPeriodAttendanceObligations,
	recomputeAttendanceObligationsForRange,
} from "../../helper/attendance-obligation.helper";
import { emitAttendanceRealtimeEvent } from "../../helper/attendance-realtime.helper";

const logger = getLogger();
const employeeLogger = logger.child({ module: "employee" });
const EMPLOYEE_FIELD_ALIASES: Record<string, string> = {
	activeSchedule: "embeddedSchedule",
};

const fieldSelectionIncludesRoot = (fields: string | undefined, root: string) =>
	typeof fields === "string" &&
	fields
		.split(",")
		.map((item) => item.trim())
		.some((item) => item === root || item.startsWith(`${root}.`));

const stripFieldSelectionRoot = (fields: string | undefined, root: string) => {
	if (typeof fields !== "string") return undefined;
	const kept = fields
		.split(",")
		.map((item) => item.trim())
		.filter(Boolean)
		.filter((item) => item !== root && !item.startsWith(`${root}.`));
	return kept.length > 0 ? kept.join(",") : undefined;
};

const applyEmployeeDocumentSelectionDefaults = (fieldSelections: Record<string, any>) => {
	if (!fieldSelections?.documents) return;

	if (fieldSelections.documents === true) {
		fieldSelections.documents = {
			where: { isDeleted: false },
		};
		return;
	}

	if (typeof fieldSelections.documents === "object") {
		fieldSelections.documents = {
			...fieldSelections.documents,
			where: {
				...(fieldSelections.documents.where || {}),
				isDeleted: false,
			},
			...(fieldSelections.documents.select
				? {
						select: {
							id: true,
							...fieldSelections.documents.select,
						},
					}
				: {}),
		};
	}
};

/**
 * Bare `employeeBenefits: true` expands to every EmployeeBenefit scalar in the
 * generated Prisma client. Prefer an explicit scalar select so new optional
 * columns (for example eligibilityMode) cannot hard-500 employee profile reads
 * when a DB is behind a pending additive migration.
 */
const EMPLOYEE_BENEFIT_PROFILE_SCALAR_SELECT = {
	id: true,
	organizationId: true,
	employeeId: true,
	benefitTypeId: true,
	payrollPeriodId: true,
	name: true,
	description: true,
	totalAmount: true,
	currency: true,
	totalInstallments: true,
	installmentAmount: true,
	remainingBalance: true,
	scheduleMode: true,
	recurrenceFrequency: true,
	attendanceBased: true,
	attendanceAmountBasis: true,
	eligibilityMode: true,
	eligibilityDisqualifyOnAbsent: true,
	eligibilityDisqualifyOnLate: true,
	eligibilityDisqualifyOnUndertime: true,
	eligibilityDisqualifyOnLeave: true,
	amount: true,
	startDate: true,
	endDate: true,
	startPayrollCutOff: true,
	endPayrollCutOff: true,
	agreedToTerms: true,
	agreedAt: true,
	agreedByIp: true,
	status: true,
	isActive: true,
	approvedById: true,
	approvedAt: true,
	notes: true,
	remarks: true,
	isDeleted: true,
	createdAt: true,
	updatedAt: true,
} as const;

const applyEmployeeBenefitSelectionDefaults = (fieldSelections: Record<string, any>) => {
	if (!fieldSelections?.employeeBenefits) return;

	if (fieldSelections.employeeBenefits === true) {
		fieldSelections.employeeBenefits = {
			where: { isDeleted: false },
			select: { ...EMPLOYEE_BENEFIT_PROFILE_SCALAR_SELECT },
		};
		return;
	}

	if (typeof fieldSelections.employeeBenefits === "object") {
		fieldSelections.employeeBenefits = {
			...fieldSelections.employeeBenefits,
			where: {
				...(fieldSelections.employeeBenefits.where || {}),
				isDeleted: false,
			},
			...(fieldSelections.employeeBenefits.select
				? {
						select: {
							id: true,
							...fieldSelections.employeeBenefits.select,
						},
					}
				: {
						select: { ...EMPLOYEE_BENEFIT_PROFILE_SCALAR_SELECT },
					}),
		};
	}
};

const MAX_EMPLOYEE_CREATE_VALIDATION_ERRORS = 6;

const normalizeValidationFieldPath = (field: string) => field.replace(/\[(\d+)\]/g, ".$1");

const humanizeDocumentFieldKey = (value: string) =>
	value
		.split(".")
		.filter(Boolean)
		.map((segment) =>
			segment
				.replace(/([a-z0-9])([A-Z])/g, "$1 $2")
				.replace(/[_-]+/g, " ")
				.trim(),
		)
		.filter(Boolean)
		.map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
		.join(" ");

const buildDocumentValidationMessage = (fieldPath: string, originalMessage: string) => {
	const documentMatch = fieldPath.match(/^employee\.documents\.(\d+)(?:\.(.+))?$/);
	if (!documentMatch) return originalMessage;

	const documentIndex = Number(documentMatch[1]);
	const nestedField = String(documentMatch[2] || "").trim();
	const documentLabel =
		`Document ${Number.isNaN(documentIndex) ? "" : `#${documentIndex + 1} `}`.trim();

	if (!nestedField) {
		return originalMessage || `${documentLabel} contains invalid values.`;
	}

	if (nestedField === "documentTypeId") {
		return `${documentLabel} type is invalid.`;
	}

	if (nestedField === "number") {
		return originalMessage || `${documentLabel} number is required.`;
	}

	if (nestedField === "issueDate") {
		return originalMessage || `${documentLabel} issue date is invalid.`;
	}

	if (nestedField === "expiryDate") {
		return originalMessage || `${documentLabel} expiry date is invalid.`;
	}

	if (nestedField === "name") {
		return originalMessage || `${documentLabel} name is required.`;
	}

	if (nestedField === "type") {
		return originalMessage || `${documentLabel} type is required.`;
	}

	if (nestedField.startsWith("fieldValues.")) {
		const fieldKey = nestedField.slice("fieldValues.".length);
		const fieldLabel = humanizeDocumentFieldKey(fieldKey) || "Document field";
		return originalMessage || `${fieldLabel} is invalid.`;
	}

	return originalMessage || `${documentLabel} contains invalid values.`;
};

const uploadEmployeeAvatarFile = async (params: {
	file: Express.Multer.File;
	employeeIdentifier: string;
}) => {
	const { uploadToCloudinary } = require("../../helper/cloudinary.helper");
	const safeIdentifier =
		String(params.employeeIdentifier || "employee")
			.trim()
			.replace(/[^a-zA-Z0-9_-]+/g, "_") || "employee";

	return uploadToCloudinary(params.file.buffer, {
		folder: `hris/employees/${safeIdentifier}/avatar`,
		resourceType: "image",
		publicId: `avatar_${safeIdentifier}_${Date.now()}`,
		overwrite: true,
	});
};

const summarizeEmbeddedScheduleForLog = (embeddedSchedule: any) => {
	if (!embeddedSchedule || typeof embeddedSchedule !== "object") {
		return null;
	}

	const pattern = Array.isArray(embeddedSchedule?.pattern) ? embeddedSchedule.pattern : [];
	return {
		templateId: embeddedSchedule?.templateId || null,
		cycleDays:
			typeof embeddedSchedule?.cycleDays === "number" ? embeddedSchedule.cycleDays : null,
		patternDays: pattern.length,
		templateLinkedDays: pattern.filter((day: any) => day?.shiftTypeId).length,
		manualSnapshotDays: pattern.filter((day: any) => day?.shiftSnapshot).length,
	};
};

const summarizeEmployeeCreatePayloadForLog = (requestData: any, files?: Express.Multer.File[]) => {
	const employee = requestData?.employee || {};
	const person = requestData?.person || {};
	return {
		roleId: requestData?.roleId || null,
		hasUserPayload: Boolean(requestData?.user),
		person: {
			hasEmail: Boolean(person?.contactInfo?.email),
			hasIdentification: Boolean(person?.identification?.number),
		},
		employee: {
			organizationId: employee?.organizationId || null,
			employeeId: employee?.employeeId || null,
			departmentId: employee?.departmentId || null,
			positionId: employee?.positionId || null,
			workforceSource: employee?.workforceSource || "DIRECT",
			documentCount: Array.isArray(employee?.documents) ? employee.documents.length : 0,
			benefitCount: Array.isArray(employee?.employeeBenefits)
				? employee.employeeBenefits.length
				: 0,
			embeddedSchedule: summarizeEmbeddedScheduleForLog(employee?.embeddedSchedule),
		},
		fileCount: Array.isArray(files) ? files.length : 0,
	};
};

const normalizeEmployeeCreateValidationError = (error: ErrorDetail): ErrorDetail => {
	const field = normalizeValidationFieldPath(String(error?.field || "system"));
	const message = String(error?.message || "Invalid value");

	if (field.startsWith("employee.embeddedSchedule.pattern")) {
		return {
			field: "employee.embeddedSchedule",
			message: "One or more schedule pattern days contain invalid shift details.",
		};
	}

	if (field.startsWith("employee.embeddedSchedule")) {
		return {
			field: "employee.embeddedSchedule",
			message: "Embedded schedule data is invalid.",
		};
	}

	if (field.startsWith("employee.documents")) {
		return {
			field,
			message: buildDocumentValidationMessage(field, message),
		};
	}

	return { field, message };
};

const buildEmployeeCreateValidationErrors = (errors: ErrorDetail[]) => {
	const normalized = errors.map(normalizeEmployeeCreateValidationError);
	const seen = new Set<string>();
	const deduped = normalized.filter((error) => {
		const key = `${error.field || "system"}:${error.message}`;
		if (seen.has(key)) {
			return false;
		}
		seen.add(key);
		return true;
	});

	return limitErrorDetails(deduped, MAX_EMPLOYEE_CREATE_VALIDATION_ERRORS) || [];
};

const sanitizeUsername = (value?: string | null) =>
	typeof value === "string"
		? value
				.toLowerCase()
				.replace(/[^a-z0-9_-]+/g, "-")
				.replace(/-+/g, "-")
				.replace(/^-|-$/g, "")
		: value;

const toAttendanceScheduleSnapshot = (shift: EmployeeScheduleSnapshot) => ({
	source: shift.source || "template",
	scheduleOverrideId: shift.scheduleOverrideId || null,
	scheduleTemplateId: shift.scheduleTemplateId || null,
	scheduleTemplateName: shift.scheduleTemplateName || null,
	shiftTypeId: shift.shiftTypeId || null,
	shiftTypeCode: shift.shiftTypeCode || null,
	shiftTypeName: shift.shiftTypeName || null,
	templateDay: shift.templateDay ?? null,
	cycleDays: shift.cycleDays ?? null,
	isOff: Boolean(shift.isOff),
	isOvernight: Boolean(shift.isOvernight),
	breakMinutes: shift.breakMinutes ?? null,
	graceLateMinutes: shift.graceLateMinutes ?? null,
	graceEarlyOutMinutes: shift.graceEarlyOutMinutes ?? null,
	startTime: shift.startTime || null,
	endTime: shift.endTime || null,
	timeSlots: Array.isArray(shift.timeSlots) ? shift.timeSlots : [],
	metadata: shift.metadata ?? null,
});

const getScheduleGraceLateMinutes = (schedule?: any): number =>
	Math.max(0, Number(schedule?.graceLateMinutes ?? schedule?.gracePeriodMinutes ?? 0));

const shouldRepairTodayScheduleSnapshot = (
	attendanceScheduleSnapshot: any,
	currentScheduleSnapshot: any,
): boolean => {
	if (!currentScheduleSnapshot) return false;
	if (!attendanceScheduleSnapshot) return true;

	return (
		String(attendanceScheduleSnapshot.shiftTypeId || "") !==
			String(currentScheduleSnapshot.shiftTypeId || "") ||
		String(attendanceScheduleSnapshot.startTime || "") !==
			String(currentScheduleSnapshot.startTime || "") ||
		String(attendanceScheduleSnapshot.endTime || "") !==
			String(currentScheduleSnapshot.endTime || "") ||
		getScheduleGraceLateMinutes(attendanceScheduleSnapshot) !==
			getScheduleGraceLateMinutes(currentScheduleSnapshot) ||
		JSON.stringify(attendanceScheduleSnapshot.timeSlots || []) !==
			JSON.stringify(currentScheduleSnapshot.timeSlots || [])
	);
};

const timeToMinutes = (value?: string | null): number | null => {
	if (!value) return null;
	const [hours, minutes] = String(value).split(":").map(Number);
	if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
	return hours * 60 + minutes;
};

const getManilaMinutes = (value?: Date | string | null): number | null => {
	if (!value) return null;
	const date = value instanceof Date ? value : new Date(value);
	if (Number.isNaN(date.getTime())) return null;
	const parts = new Intl.DateTimeFormat("en-US", {
		timeZone: "Asia/Manila",
		hour12: false,
		hour: "2-digit",
		minute: "2-digit",
	}).formatToParts(date);
	const hours = Number(parts.find((part) => part.type === "hour")?.value ?? "0");
	const minutes = Number(parts.find((part) => part.type === "minute")?.value ?? "0");
	if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
	return hours * 60 + minutes;
};

const isOvernightWindow = (startTime?: string | null, endTime?: string | null): boolean => {
	const start = timeToMinutes(startTime);
	const end = timeToMinutes(endTime);
	return start !== null && end !== null && end <= start;
};

const normalizeActualMinutesForSchedule = (
	actualMinutes: number,
	scheduledStartMinutes: number,
	isOvernight: boolean,
) => {
	const halfDayMinutes = 12 * 60;
	if (
		isOvernight &&
		actualMinutes < scheduledStartMinutes &&
		scheduledStartMinutes - actualMinutes > halfDayMinutes
	) {
		return actualMinutes + 24 * 60;
	}
	return actualMinutes;
};

const getFirstWorkStartTime = (scheduleSnapshot: any): string | null => {
	const workSlots = Array.isArray(scheduleSnapshot?.timeSlots)
		? scheduleSnapshot.timeSlots.filter(
				(slot: any) => String(slot?.type).toLowerCase() === "work",
			)
		: [];
	return workSlots[0]?.startTime || scheduleSnapshot?.startTime || null;
};

const getLastWorkEndTime = (scheduleSnapshot: any): string | null => {
	const workSlots = Array.isArray(scheduleSnapshot?.timeSlots)
		? scheduleSnapshot.timeSlots.filter(
				(slot: any) => String(slot?.type).toLowerCase() === "work",
			)
		: [];
	return workSlots[workSlots.length - 1]?.endTime || scheduleSnapshot?.endTime || null;
};

const getScheduledWorkMinutesBefore = (
	scheduleSnapshot: any,
	actualMinutes: number,
	scheduledStartMinutes: number,
	isOvernight: boolean,
): number => {
	const workSlots = Array.isArray(scheduleSnapshot?.timeSlots)
		? scheduleSnapshot.timeSlots.filter(
				(slot: any) => String(slot?.type).toLowerCase() === "work",
			)
		: [];
	if (workSlots.length === 0) {
		return Math.max(0, actualMinutes - scheduledStartMinutes);
	}

	return workSlots.reduce((total: number, slot: any) => {
		const slotStart = timeToMinutes(slot?.startTime);
		const slotEnd = timeToMinutes(slot?.endTime);
		if (slotStart === null || slotEnd === null) return total;

		let absoluteStart = slotStart;
		let absoluteEnd = slotEnd;
		if (isOvernight && absoluteStart < scheduledStartMinutes) {
			absoluteStart += 24 * 60;
		}
		if (absoluteEnd <= absoluteStart) {
			absoluteEnd += 24 * 60;
		}
		if (actualMinutes <= absoluteStart) return total;
		return total + Math.max(0, Math.min(actualMinutes, absoluteEnd) - absoluteStart);
	}, 0);
};

const buildAttendanceTimingMetadata = (params: {
	attendance: any;
	scheduleSnapshot: any;
	rawLateMinutes: number;
	gracePeriodMinutes: number;
	withinGrace: boolean;
	referenceTime?: Date | string | null;
}) => {
	const { attendance, scheduleSnapshot, rawLateMinutes, gracePeriodMinutes, withinGrace } =
		params;
	if (!scheduleSnapshot || scheduleSnapshot?.isOff) return null;

	const startTime = getFirstWorkStartTime(scheduleSnapshot);
	const endTime = getLastWorkEndTime(scheduleSnapshot);
	const scheduledStartMinutes = timeToMinutes(startTime);
	const referenceTime = attendance?.timeIn || params.referenceTime || null;
	const actualMinutes = getManilaMinutes(referenceTime);
	if (scheduledStartMinutes === null || actualMinutes === null) return null;

	const isOvernight =
		Boolean(scheduleSnapshot?.isOvernight) || isOvernightWindow(startTime, endTime);
	const normalizedActualMinutes = normalizeActualMinutesForSchedule(
		actualMinutes,
		scheduledStartMinutes,
		isOvernight,
	);
	const minutesBeforeStart =
		normalizedActualMinutes < scheduledStartMinutes
			? scheduledStartMinutes - normalizedActualMinutes
			: 0;
	const hasTimeIn = Boolean(attendance?.timeIn);
	const inferredRawLateMinutes =
		hasTimeIn || minutesBeforeStart > 0
			? Math.max(0, Number(rawLateMinutes || 0))
			: getScheduledWorkMinutesBefore(
					scheduleSnapshot,
					normalizedActualMinutes,
					scheduledStartMinutes,
					isOvernight,
				);
	const missedScheduledWorkMinutes = getScheduledWorkMinutesBefore(
		scheduleSnapshot,
		normalizedActualMinutes,
		scheduledStartMinutes,
		isOvernight,
	);
	const chargeableLateMinutes = Math.max(
		0,
		missedScheduledWorkMinutes - gracePeriodMinutes,
	);
	const effectiveWithinGrace =
		withinGrace || (!hasTimeIn && inferredRawLateMinutes > 0 && chargeableLateMinutes === 0);
	const state =
		chargeableLateMinutes > 0
			? "late"
			: effectiveWithinGrace
				? "withinGrace"
				: minutesBeforeStart > 0
					? "early"
					: "onTime";

	return {
		state,
		hasTimeIn,
		minutesBeforeStart,
		rawLateMinutes: inferredRawLateMinutes,
		chargeableLateMinutes,
		gracePeriodMinutes,
		withinGrace: effectiveWithinGrace,
		schedule: {
			shiftTypeCode: scheduleSnapshot?.shiftTypeCode || null,
			shiftTypeName: scheduleSnapshot?.shiftTypeName || null,
			scheduleTemplateName: scheduleSnapshot?.scheduleTemplateName || null,
			startTime,
			endTime,
			isOvernight,
			breakMinutes: scheduleSnapshot?.breakMinutes ?? null,
			templateDay: scheduleSnapshot?.templateDay ?? null,
			cycleDays: scheduleSnapshot?.cycleDays ?? null,
		},
	};
};

const refetchEmployeeWithRelations = (prisma: PrismaClient, id: string) =>
	prisma.employee.findFirst({
		where: { id },
		include: {
			person: true,
			documents: {
				where: { isDeleted: false },
			},
			department: true,
			section: true,
			position: true,
			level: true,
			agency: {
				select: {
					id: true,
					name: true,
					code: true,
				},
			},
			reportTo: {
				select: {
					id: true,
					employeeId: true,
					person: {
						select: {
								personalInfo: true,
							contactInfo: true,
						},
					},
				},
			},
		},
	});

const normalizeAndValidateAgencyAssignment = async (
	prisma: PrismaClient,
	payload: any,
	organizationId: string,
) => {
	const workforceSource = payload.workforceSource || "DIRECT";
	if (workforceSource === "DIRECT") {
		return { workforceSource, agencyId: null, agencyRecord: null };
	}

	if (!payload.agencyId) {
		throw new Error("agencyId is required when workforceSource is AGENCY");
	}

	const agencyRecord = await prisma.agency.findFirst({
		where: {
			id: payload.agencyId,
			organizationId,
			isDeleted: false,
		},
		select: {
			id: true,
			name: true,
			code: true,
		},
	});

	if (!agencyRecord) {
		throw new Error(`Agency with ID ${payload.agencyId} not found`);
	}

	return { workforceSource, agencyId: agencyRecord.id, agencyRecord };
};

const SCHEDULE_ASSIGNMENT_EDIT_ROLES = new Set([
	"hris-hr-manager",
	"hris-hr-user",
	"hris-employee-manager",
	"admin",
	"hris-admin",
]);

const toDateOrNull = (value?: string | Date | null): Date | null => {
	if (!value) return null;
	const parsed = value instanceof Date ? value : new Date(value);
	return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const enumerateDatesInclusive = (from: Date, to: Date) => {
	const dates: Date[] = [];
	const cursor = new Date(from);
	cursor.setHours(0, 0, 0, 0);
	const end = new Date(to);
	end.setHours(0, 0, 0, 0);

	while (cursor <= end) {
		dates.push(new Date(cursor));
		cursor.setDate(cursor.getDate() + 1);
	}

	return dates;
};

const formatEmployeeDisplayName = (employee: any): string => {
	const firstName = employee?.person?.personalInfo?.firstName || "";
	const lastName = employee?.person?.personalInfo?.lastName || "";
	const fullName = `${firstName} ${lastName}`.trim();
	return fullName || employee?.employeeId || "Unknown";
};

const resolveShiftForDate = (shifts: any[], date: Date) => {
	if (!Array.isArray(shifts) || shifts.length === 0) return null;
	const dayIndex = (date.getDay() + 6) % 7;
	return shifts[dayIndex] || null;
};

const normalizeDateOnly = (input: Date): Date => {
	const value = new Date(input);
	value.setHours(0, 0, 0, 0);
	return value;
};

const toUtcDateKey = (value?: string | Date | null): string => {
	const parsed = toDateOrNull(value);
	if (!parsed) return "";
	const year = parsed.getUTCFullYear();
	const month = String(parsed.getUTCMonth() + 1).padStart(2, "0");
	const day = String(parsed.getUTCDate()).padStart(2, "0");
	return `${year}-${month}-${day}`;
};

const enumerateUtcDateKeysInclusive = (from: Date, to: Date): string[] => {
	const fromKey = toUtcDateKey(from);
	const toKey = toUtcDateKey(to);
	if (!fromKey || !toKey) return [];

	const [fromYear, fromMonth, fromDay] = fromKey.split("-").map(Number);
	const [toYear, toMonth, toDay] = toKey.split("-").map(Number);
	const cursor = new Date(Date.UTC(fromYear, fromMonth - 1, fromDay));
	const end = new Date(Date.UTC(toYear, toMonth - 1, toDay));
	const keys: string[] = [];

	while (cursor <= end) {
		keys.push(toUtcDateKey(cursor));
		cursor.setUTCDate(cursor.getUTCDate() + 1);
	}

	return keys;
};

const toUtcStartOfDay = (input: Date): Date => {
	const date = new Date(input);
	date.setUTCHours(0, 0, 0, 0);
	return date;
};

const toUtcEndOfDay = (input: Date): Date => {
	const date = new Date(input);
	date.setUTCHours(23, 59, 59, 999);
	return date;
};

const buildEmployeeScheduleTimelineWindows = (employee: any) => {
	const historyRows = Array.isArray(employee?.scheduleHistoryRecords)
		? employee.scheduleHistoryRecords
		: [];
	const sorted = historyRows
		.filter((row: any) => row?.effectiveAt)
		.sort((a: any, b: any) => {
			const effectiveDelta =
				(toDateOrNull(a?.effectiveAt)?.getTime() || 0) -
				(toDateOrNull(b?.effectiveAt)?.getTime() || 0);
			if (effectiveDelta !== 0) return effectiveDelta;
			return (
				(toDateOrNull(a?.createdAt)?.getTime() || 0) -
				(toDateOrNull(b?.createdAt)?.getTime() || 0)
			);
		});

	const windows: Array<{
		snapshot: any;
		startDate: Date | null;
		endDate: Date | null;
	}> = [];

	if (sorted.length > 0) {
		const earliest = sorted[0];
		if (earliest?.beforeSchedule && typeof earliest.beforeSchedule === "object") {
			const earliestStart = toDateOrNull(earliest?.effectiveAt);
			const beforeEnd = earliestStart ? new Date(earliestStart.getTime() - 1) : null;
			windows.push({
				snapshot: earliest.beforeSchedule,
				startDate: toDateOrNull(earliest.beforeSchedule?.effectiveStartDate) || null,
				endDate: beforeEnd,
			});
		}
		for (let index = 0; index < sorted.length; index += 1) {
			const row = sorted[index];
			const next = sorted[index + 1];
			const rowStart =
				toDateOrNull(row?.effectiveAt) ||
				toDateOrNull(row?.afterSchedule?.effectiveStartDate);
			const rowEnd = next?.effectiveAt
				? new Date(new Date(next.effectiveAt).getTime() - 1)
				: null;
			if (!row?.afterSchedule || typeof row.afterSchedule !== "object") continue;
			windows.push({
				snapshot: row.afterSchedule,
				startDate: rowStart || null,
				endDate: rowEnd,
			});
		}
		return windows;
	}

	if (employee?.embeddedSchedule && typeof employee.embeddedSchedule === "object") {
		windows.push({
			snapshot: employee.embeddedSchedule,
			startDate:
				toDateOrNull(employee.embeddedSchedule?.effectiveStartDate) ||
				toDateOrNull(employee.embeddedSchedule?.assignedAt) ||
				null,
			endDate: null,
		});
	}

	return windows;
};

const buildRangeScheduleEntrySummaries = (employee: any, rangeStart: Date, rangeEnd: Date) => {
	const timelineWindows = buildEmployeeScheduleTimelineWindows(employee);
	const nowMs = Date.now();
	const rangeStartMs = rangeStart.getTime();
	const rangeEndMs = rangeEnd.getTime();

	return timelineWindows
		.filter((window) => {
			const startMs = window.startDate?.getTime() ?? Number.NEGATIVE_INFINITY;
			const endMs = window.endDate?.getTime() ?? Number.POSITIVE_INFINITY;
			return startMs <= rangeEndMs && endMs >= rangeStartMs;
		})
		.map((window) => {
			const scheduleId = window.snapshot?.templateId
				? String(window.snapshot.templateId)
				: null;
			const scheduleCode = String(window.snapshot?.templateCode || "UNKNOWN");
			const scheduleName = String(window.snapshot?.templateName || "Unknown Schedule");
			const startMs = window.startDate?.getTime() ?? Number.NEGATIVE_INFINITY;
			const endMs = window.endDate?.getTime() ?? Number.POSITIVE_INFINITY;
			const status = nowMs < startMs ? "SCHEDULED" : nowMs > endMs ? "SUPERSEDED" : "ACTIVE";
			const entryKey = toUtcDateKey(window.startDate || undefined) || "open";

			return {
				scheduleEntryId: `${scheduleId || scheduleCode || "manual"}:${entryKey}`,
				scheduleId,
				scheduleCode,
				scheduleName,
				startDate: window.startDate ? window.startDate.toISOString() : null,
				endDate: window.endDate ? window.endDate.toISOString() : null,
				status,
			};
		})
		.sort(
			(a, b) =>
				(toDateOrNull(b.startDate)?.getTime() || 0) -
				(toDateOrNull(a.startDate)?.getTime() || 0),
		);
};

const isDateWithinRange = (
	date: Date,
	startDate?: string | Date | null,
	endDate?: string | Date | null,
) => {
	const day = normalizeDateOnly(date).getTime();
	const start = toDateOrNull(startDate);
	const end = toDateOrNull(endDate);
	const startTime = start ? normalizeDateOnly(start).getTime() : Number.NEGATIVE_INFINITY;
	const endTime = end ? normalizeDateOnly(end).getTime() : Number.POSITIVE_INFINITY;
	return day >= startTime && day <= endTime;
};

const pickEmployeeScheduleEntryForDate = (entries: any[], date: Date): any | null => {
	const covering = (entries || []).filter((entry) =>
		isDateWithinRange(date, entry?.startDate, entry?.endDate),
	);
	if (!covering.length) return null;
	return covering.sort((a, b) => {
		const sourceA = String(a?.source || "").toLowerCase();
		const sourceB = String(b?.source || "").toLowerCase();
		const priority = (source: string) =>
			source.includes("override") ? 3 : source.includes("rotation") ? 2 : 1;
		const byPriority = priority(sourceB) - priority(sourceA);
		if (byPriority !== 0) return byPriority;
		const aChanged = toDateOrNull(a?.changedAt)?.getTime() || 0;
		const bChanged = toDateOrNull(b?.changedAt)?.getTime() || 0;
		if (bChanged !== aChanged) return bChanged - aChanged;
		const aStart = toDateOrNull(a?.startDate)?.getTime() || 0;
		const bStart = toDateOrNull(b?.startDate)?.getTime() || 0;
		return bStart - aStart;
	})[0];
};

const mapRotationPatternToDate = (params: { rotationConfig: any; date: Date; startDate: Date }) => {
	const cycleLength = Number(params.rotationConfig?.cycleLength || 0);
	if (!Number.isFinite(cycleLength) || cycleLength <= 0) return null;
	const dateMs = normalizeDateOnly(params.date).getTime();
	const startMs = normalizeDateOnly(params.startDate).getTime();
	if (dateMs < startMs) return null;
	const dayOffset = Math.floor((dateMs - startMs) / (1000 * 60 * 60 * 24));
	const dayIndex = dayOffset % cycleLength;
	const pattern = Array.isArray(params.rotationConfig?.pattern)
		? params.rotationConfig.pattern
		: [];
	return (
		pattern.find((item: any) => Number(item?.dayIndex) === dayIndex) || {
			dayIndex,
			isOff: true,
		}
	);
};

const buildRotationEntryId = (employeeId: string, startDate: Date, scheduleCode: string) =>
	`rot_${employeeId}_${scheduleCode.toLowerCase()}_${normalizeDateOnly(startDate)
		.toISOString()
		.slice(0, 10)
		.replace(/-/g, "")}_${Math.random().toString(36).slice(2, 7)}`;

const createOffDayShifts = () =>
	["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((label) => ({
		label,
		isRestDay: true,
		timeSlots: [],
	}));

const buildEmployeeDocumentAuditSnapshot = (documents: any[] = []) =>
	documents
		.map((document) => ({
			id: document.id,
			documentTypeId: document.documentTypeId || null,
			type: document.type || null,
			name: document.name || null,
			number: document.number || null,
			issueDate: document.issueDate ? new Date(document.issueDate).toISOString() : null,
			expiryDate: document.expiryDate ? new Date(document.expiryDate).toISOString() : null,
			fileUrl: document.fileUrl || null,
			ext: document.ext || null,
			fieldValues: document.fieldValues || null,
		}))
		.sort((left, right) =>
			String(left.documentTypeId || left.type || left.id).localeCompare(
				String(right.documentTypeId || right.type || right.id),
			),
		);

const matchesDocumentLookupValue = (document: any, lookupValue: string) => {
	const normalizedLookupValue = String(lookupValue || "").trim();
	if (!normalizedLookupValue) return false;

	const metadata = document?.metadata || {};
	const fieldValues = document?.fieldValues || {};
	const candidates = [
		document?.id,
		document?.documentId,
		document?.number,
		metadata?.documentId,
		metadata?.documentNumber,
		metadata?.number,
		fieldValues?.documentId,
		fieldValues?.documentNumber,
		fieldValues?.number,
	];

	return candidates.some((candidate) => String(candidate || "").trim() === normalizedLookupValue);
};

const findEmployeeDocumentByLookupValue = async (
	prisma: PrismaClient,
	lookupValue: string,
	employeeId?: string | null,
) => {
	const documentLookupValue = String(lookupValue || "").trim();
	if (!documentLookupValue) return null;

	const scopedWhere = {
		isDeleted: false,
		...(employeeId ? { employeeId } : {}),
	};

	const exactDocument = await prisma.document.findFirst({
		where: {
			...scopedWhere,
			OR: [
				{ id: documentLookupValue },
				{ number: documentLookupValue },
			],
		},
		orderBy: { createdAt: "asc" },
	});
	if (exactDocument) return exactDocument;

	if (!employeeId) return null;

	const employeeDocuments = await prisma.document.findMany({
		where: scopedWhere,
		orderBy: { createdAt: "asc" },
	});

	return (
		employeeDocuments.find((document) =>
			matchesDocumentLookupValue(document, documentLookupValue),
		) || null
	);
};

const logEmployeeDocumentConfigurationAudit = async (params: {
	req: Request;
	employee: {
		id: string;
		employeeId?: string | null;
		organizationId?: string | null;
	};
	beforeDocuments: any[];
	afterDocuments: any[];
}) => {
	const beforeSnapshot = buildEmployeeDocumentAuditSnapshot(params.beforeDocuments);
	const afterSnapshot = buildEmployeeDocumentAuditSnapshot(params.afterDocuments);

	if (JSON.stringify(beforeSnapshot) === JSON.stringify(afterSnapshot)) {
		return;
	}

	await logAudit(params.req, {
		userId: (params.req as any).user?.id || "unknown",
		action: config.AUDIT_LOG.ACTIONS.UPDATE,
		resource: config.AUDIT_LOG.RESOURCES.EMPLOYEE,
		severity: config.AUDIT_LOG.SEVERITY.LOW,
		entityType: config.AUDIT_LOG.ENTITY_TYPES.EMPLOYEE,
		entityId: params.employee.id,
		changesBefore: {
			documents: beforeSnapshot,
		},
		changesAfter: {
			documents: afterSnapshot,
		},
		description: `Employee documents configured: ${params.employee.employeeId || params.employee.id}`,
		organizationId: params.employee.organizationId || undefined,
	});
};

const invalidateEmployeeDocumentCaches = async (employeeId: string) => {
	await invalidateCache.byPattern(`cache:employee:byId:${employeeId}:*`);
	await invalidateCache.byPattern("cache:employee:list:*");
	await invalidateCache.byPattern(`cache:employee:document-priorities:${employeeId}`);
	await invalidateCache.byPattern("cache:metrics:*");
};

const getDocumentMetadataRecord = (value: unknown): Record<string, any> =>
	value && typeof value === "object" && !Array.isArray(value)
		? { ...(value as Record<string, any>) }
		: {};

const normalizeDocumentTypeIdentity = (value: unknown) => {
	const normalized = String(value || "")
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "");
	if (normalized === "tinid") return "tin";
	if (normalized === "sssid") return "sss";
	if (normalized === "philhealthid") return "philhealth";
	if (normalized === "pagibigid") return "pagibig";
	return normalized;
};

const buildPendingDocumentReviewMetadata = (params: {
	existingMetadata?: unknown;
	submittedByEmployeeId: string;
}): Record<string, any> => {
	const now = new Date();
	return buildDocumentReviewCompatibilityMetadata({
		existingMetadata: params.existingMetadata,
		status: DocumentReviewStatus.PENDING,
		submittedAt: now,
		submittedByEmployeeId: params.submittedByEmployeeId,
		source: DocumentReviewSource.EMPLOYEE_UPLOAD,
	});
};

const shouldRequireDocumentApproval = (params: {
	actorEmployeeId?: string | null;
	targetEmployeeId: string;
	documentType?: { uploadBy?: string | null; isEmployeeVisible?: boolean | null } | null;
}): boolean => {
	if (!params.actorEmployeeId || params.actorEmployeeId !== params.targetEmployeeId) {
		return false;
	}

	const uploadBy = String(params.documentType?.uploadBy || "")
		.trim()
		.toUpperCase();
	return (
		Boolean(params.documentType?.isEmployeeVisible) &&
		(uploadBy === "EMPLOYEE" || uploadBy === "BOTH")
	);
};

const findMatchingDocumentType = async (params: {
	prisma: PrismaClient;
	organizationId: string;
	documentTypeId?: string | null;
	type?: string | null;
	name?: string | null;
}) => {
	const candidates = [
		params.documentTypeId,
		params.type,
		params.name,
		String(params.type || "").replace(/_/g, " "),
	]
		.map(normalizeDocumentTypeIdentity)
		.filter(Boolean);

	if (!candidates.length) return null;

	const documentTypes = await params.prisma.documentType.findMany({
		where: {
			organizationId: params.organizationId,
			isDeleted: false,
		},
		select: {
			id: true,
			code: true,
			name: true,
			uploadBy: true,
			isEmployeeVisible: true,
		},
	});

	return (
		documentTypes.find((documentType) => {
			const documentTypeCandidates = [
				documentType.id,
				documentType.code,
				documentType.name,
				String(documentType.code || "").replace(/_/g, " "),
				String(documentType.name || "").replace(/_/g, " "),
			].map(normalizeDocumentTypeIdentity);

			return candidates.some((candidate) => documentTypeCandidates.includes(candidate));
		}) || null
	);
};

const syncEmployeeDocuments = async (
	prisma: PrismaClient,
	employeeId: string,
	documents?: Array<{
		name?: string | null;
		type?: string | null;
		documentTypeId?: string | null;
		number?: string | null;
		issueDate?: Date | null;
		expiryDate?: Date | null;
		fileUrl?: string | null;
		ext?: string | null;
		fieldValues?: Record<string, any> | null;
		metadata?: Record<string, any> | null;
	}>,
) => {
	if (!documents) {
		return {
			beforeDocuments: [] as any[],
			afterDocuments: [] as any[],
			changed: false,
		};
	}

	const existingDocuments = await prisma.document.findMany({
		where: { employeeId, isDeleted: false },
	});
	const existingByKey = new Map(
		existingDocuments.map((document) => [
			String(document.documentTypeId || document.type || document.id),
			document,
		]),
	);
	const incomingKeys = new Set<string>();

	for (const document of documents) {
		const type = String(document.type || "").trim();
		const documentTypeId = String(document.documentTypeId || "").trim();
		const documentKey = documentTypeId || type;
		if (!documentKey) continue;

		incomingKeys.add(documentKey);
		const existingDocument = existingByKey.get(documentKey);
		const payload = {
			name: document.name || existingDocument?.name || type,
			type: type || existingDocument?.type || "document",
			documentTypeId: documentTypeId || existingDocument?.documentTypeId || null,
			number: document.number ?? existingDocument?.number ?? "",
			issueDate: document.issueDate ?? existingDocument?.issueDate ?? new Date(),
			expiryDate: document.expiryDate ?? existingDocument?.expiryDate ?? null,
			fileUrl: document.fileUrl ?? existingDocument?.fileUrl ?? null,
			ext: document.ext ?? existingDocument?.ext ?? null,
			fieldValues: document.fieldValues ?? existingDocument?.fieldValues ?? null,
			metadata: document.metadata ?? existingDocument?.metadata ?? null,
			reviewStatus: existingDocument?.reviewStatus ?? null,
			reviewSubmittedAt: existingDocument?.reviewSubmittedAt ?? null,
			reviewSubmittedById: existingDocument?.reviewSubmittedById ?? null,
			reviewApprovedAt: existingDocument?.reviewApprovedAt ?? null,
			reviewApprovedById: existingDocument?.reviewApprovedById ?? null,
			reviewRejectedAt: existingDocument?.reviewRejectedAt ?? null,
			reviewRejectedById: existingDocument?.reviewRejectedById ?? null,
			reviewRejectionReason: existingDocument?.reviewRejectionReason ?? null,
			reviewSource: existingDocument?.reviewSource ?? null,
		};

		if (existingDocument) {
			await prisma.document.update({
				where: { id: existingDocument.id },
				data: payload,
			});
			continue;
		}

		await prisma.document.create({
			data: {
				...payload,
				employeeId,
				isDeleted: false,
			},
		});
	}

	const removedDocumentIds = existingDocuments
		.filter((document) => {
			const key = String(document.documentTypeId || document.type || document.id);
			return !incomingKeys.has(key);
		})
		.map((document) => document.id);

	if (removedDocumentIds.length > 0) {
		await prisma.document.updateMany({
			where: { id: { in: removedDocumentIds } },
			data: { isDeleted: true },
		});
	}

	const syncedDocuments = await prisma.document.findMany({
		where: { employeeId, isDeleted: false },
	});

	return {
		beforeDocuments: existingDocuments,
		afterDocuments: syncedDocuments,
		changed:
			JSON.stringify(buildEmployeeDocumentAuditSnapshot(existingDocuments)) !==
			JSON.stringify(buildEmployeeDocumentAuditSnapshot(syncedDocuments)),
	};
};

const RESERVED_EMPLOYEE_DOCUMENT_FIELD_KEYS = new Set(["number", "issueDate", "expiryDate"]);

const getEmployeeDocumentFieldValueForValidation = (
	document: Record<string, any>,
	fieldKey?: string | null,
) => {
	const key = String(fieldKey || "").trim();
	if (!key) return undefined;
	if (RESERVED_EMPLOYEE_DOCUMENT_FIELD_KEYS.has(key)) return document[key];
	const fieldValues =
		document.fieldValues && typeof document.fieldValues === "object"
			? document.fieldValues
			: {};
	return fieldValues[key];
};

const validateEmployeeDocumentAgainstDocumentType = (
	documentType: { fields?: any[]; name?: string | null } | null | undefined,
	document: Record<string, any>,
	pathPrefix: string,
): ErrorDetail[] => {
	if (!documentType?.fields || !Array.isArray(documentType.fields)) return [];
	const documentTypeWithValidation = applyInferredDocumentFieldValidation(documentType as any);

	return documentTypeWithValidation.fields.flatMap((rawField: any) => {
		const field = rawField as DocumentFieldValidationTarget & { type?: string | null };
		if (String(field.type || "").toLowerCase() === "file") return [];

		const value = getEmployeeDocumentFieldValueForValidation(document, field.key);
		const validationResult = validateDocumentFieldValue(field, value);
		if (validationResult.isValid) return [];

		const key = String(field.key || "").trim();
		const fieldPath = RESERVED_EMPLOYEE_DOCUMENT_FIELD_KEYS.has(key)
			? `${pathPrefix}.${key}`
			: `${pathPrefix}.fieldValues.${key}`;

		return [
			{
				field: fieldPath,
				message:
					validationResult.message || `${field.label || "Document field"} is invalid.`,
			},
		];
	});
};

const validateEmployeeDocumentsAgainstConfiguredTypes = async (params: {
	prisma: PrismaClient;
	organizationId: string;
	documents?: Array<Record<string, any>> | null;
	basePath?: string;
}) => {
	const documents = params.documents || [];
	if (!Array.isArray(documents) || documents.length === 0) return [] as ErrorDetail[];

	const errors: ErrorDetail[] = [];
	for (let index = 0; index < documents.length; index++) {
		const document = documents[index];
		const matchedDocumentType = await findMatchingDocumentType({
			prisma: params.prisma,
			organizationId: params.organizationId,
			documentTypeId: document.documentTypeId,
			type: document.type,
			name: document.name,
		});
		errors.push(
			...validateEmployeeDocumentAgainstDocumentType(
				matchedDocumentType,
				document,
				`${params.basePath || "employee.documents"}.${index}`,
			),
		);
	}

	return errors;
};

export const controller = (prisma: PrismaClient) => {
	// Initialize employee helpers
	const helpers = createEmployeeHelpers(prisma, employeeLogger);
	const resolveOrganizationIdFromRequest = (req: Request): string => {
		const bodyOrgId =
			typeof (req as any)?.body?.organizationId === "string"
				? (req as any).body.organizationId
				: "";
		const directOrgId =
			typeof (req as any)?.organizationId === "string" ? (req as any).organizationId : "";
		const userOrgId =
			typeof (req as any)?.user?.organizationId === "string"
				? (req as any).user.organizationId
				: "";
		const userNestedOrgId =
			typeof (req as any)?.user?.organization?.id === "string"
				? (req as any).user.organization.id
				: "";
		const metadataOrgId =
			typeof (req as any)?.metadata?.organizationId === "string"
				? (req as any).metadata.organizationId
				: "";
		return String(
			bodyOrgId || directOrgId || userOrgId || userNestedOrgId || metadataOrgId || "",
		).trim();
	};

	const resolveActor = async (req: Request, organizationId: string) => {
		const role = String((req as any)?.role || (req as any)?.user?.role || "").trim();
		const actorEmployeeId = String(
			(req as any)?.metadata?.employee?.id || (req as any)?.metadata?.employeeId || "",
		).trim();
		const actorEmployeeCode = String(
			(req as any)?.metadata?.employee?.employeeId || (req as any)?.user?.employeeId || "",
		).trim();
		const actorUserId = String((req as any)?.userId || (req as any)?.user?.id || "").trim();

		let actorEmployeeRecord: any = null;
		if (actorEmployeeId) {
			actorEmployeeRecord = await prisma.employee.findFirst({
				where: {
					id: actorEmployeeId,
					organizationId,
					isDeleted: false,
				},
				select: {
					id: true,
					employeeId: true,
					departmentId: true,
					person: {
						select: {
							personalInfo: true,
						},
					},
				},
			});
		}

		if (!actorEmployeeRecord && actorUserId) {
			actorEmployeeRecord = await prisma.employee.findFirst({
				where: {
					userId: actorUserId,
					organizationId,
					isDeleted: false,
				},
				select: {
					id: true,
					employeeId: true,
					departmentId: true,
					person: {
						select: {
							personalInfo: true,
						},
					},
				},
			});
		}

		if (!actorEmployeeRecord && actorEmployeeCode) {
			actorEmployeeRecord = await prisma.employee.findFirst({
				where: {
					employeeId: actorEmployeeCode,
					organizationId,
					isDeleted: false,
				},
				select: {
					id: true,
					employeeId: true,
					departmentId: true,
					person: {
						select: {
							personalInfo: true,
						},
					},
				},
			});
		}

		return {
			role,
			actorEmployeeRecord,
		};
	};

	const getManagedDepartmentIds = async (
		organizationId: string,
		actorEmployeeId: string | null,
	): Promise<string[]> => {
		if (!actorEmployeeId) return [];
		const managed = await prisma.department.findMany({
			where: {
				organizationId,
				managerId: actorEmployeeId,
				isDeleted: false,
				isActive: true,
			},
			select: { id: true },
		});
		return managed.map((item) => item.id);
	};

	const getDirectReportDepartmentIds = async (
		organizationId: string,
		actorEmployeeId: string | null,
	): Promise<string[]> => {
		if (!actorEmployeeId) return [];
		const directReports = await prisma.employee.findMany({
			where: {
				organizationId,
				reportToId: actorEmployeeId,
				isDeleted: false,
			},
			select: {
				departmentId: true,
			},
		});
		return Array.from(
			new Set(
				directReports
					.map((item: any) => item.departmentId)
					.filter((departmentId: string | null | undefined) => Boolean(departmentId)),
			),
		) as string[];
	};

	const assertCanManageSchedule = async (
		role: string,
		organizationId: string,
		actorEmployeeId: string | null,
		targetEmployee: any,
	): Promise<{ allowed: boolean; message?: string }> => {
		if (!SCHEDULE_ASSIGNMENT_EDIT_ROLES.has(role)) {
			return { allowed: false, message: "You are not allowed to assign schedules" };
		}

		const isHrRole =
			role === "hris-hr-manager" ||
			role === "hris-hr-user" ||
			role === "admin" ||
			role === "hris-admin";
		if (isHrRole) return { allowed: true };

		if (role === "hris-employee-manager") {
			if (!actorEmployeeId) {
				return { allowed: false, message: "Manager employee profile not found" };
			}
			if (targetEmployee.organizationId !== organizationId) {
				return { allowed: false, message: "Cross-organization update is not allowed" };
			}
			const managedDepartmentIds = await getManagedDepartmentIds(
				organizationId,
				actorEmployeeId,
			);
			if (
				!targetEmployee.departmentId ||
				!managedDepartmentIds.includes(targetEmployee.departmentId)
			) {
				return {
					allowed: false,
					message: "Department head can only assign schedules within owned departments",
				};
			}
			return { allowed: true };
		}

		return { allowed: false, message: "You are not allowed to assign schedules" };
	};

	const buildDepartmentScheduleCollection = async (
		organizationId: string,
		departmentId: string,
		_scopedEmployeeIds?: string[],
	): Promise<
		Array<{
			id: string;
			code: string;
			name: string;
			description?: string | null;
			startDate?: Date | null;
			endDate?: Date | null;
			shifts?: any[];
			gracePeriodMinutes?: number;
			totalHours?: number | null;
			requiredHeadcount?: number | null;
			rotationConfig?: any | null;
			source: "department_default" | "department_head_created" | "department_head_linked";
			collectionId?: string;
			isActive?: boolean;
		}>
	> => {
		await syncDepartmentDefaultScheduleLink(prisma, {
			organizationId,
			departmentId,
			scheduleId: null,
		});

		const rows = await (prisma as any).departmentScheduleTemplate.findMany({
			where: {
				organizationId,
				departmentId,
				isActive: true,
				isDeleted: false,
				scheduleTemplate: {
					isDeleted: false,
					isActive: true,
				},
			},
			include: {
				scheduleTemplate: {
					select: {
						id: true,
						code: true,
						name: true,
						description: true,
						cycleDays: true,
						pattern: true,
						isActive: true,
						isDeleted: true,
					},
				},
			},
			orderBy: [{ createdAt: "desc" }],
		});

		return rows
			.filter((row: any) => row?.scheduleTemplate && !row.scheduleTemplate.isDeleted)
			.map((row: any) => ({
				id: row.scheduleTemplate.id,
				code: row.scheduleTemplate.code,
				name: row.scheduleTemplate.name,
				description: row.scheduleTemplate.description || null,
				startDate: null,
				endDate: null,
				shifts: [],
				gracePeriodMinutes: 0,
				totalHours: null,
				requiredHeadcount: null,
				rotationConfig: {
					cycleLength: Number(row.scheduleTemplate.cycleDays || 0),
					repeats: true,
					pattern: Array.isArray(row.scheduleTemplate.pattern)
						? row.scheduleTemplate.pattern.map((item: any) => ({
								dayIndex: Math.max(0, Number(item?.day || 1) - 1),
								isOff: false,
							}))
						: [],
				},
				source: row.source,
				collectionId: row.id,
				isActive: !!row.isActive,
			}))
			.sort((a: any, b: any) => a.name.localeCompare(b.name));
	};

	const reserveEmployeeId = async (req: Request, res: Response, _next: NextFunction) => {
		const organizationId = resolveOrganizationIdFromRequest(req);
		if (!organizationId) {
			res.status(400).json(buildErrorResponse("organizationId is required", 400));
			return;
		}

		try {
			const reserved = await reserveNextEmployeeId(prisma, organizationId);
			logActivity(req, {
				userId: (req as any).user?.id || "unknown",
				action: config.ACTIVITY_LOG.EMPLOYEE.ACTIONS.RESERVE_EMPLOYEE_ID,
				description: `${config.ACTIVITY_LOG.EMPLOYEE.DESCRIPTIONS.EMPLOYEE_ID_RESERVED}: ${reserved.employeeId}`,
				page: {
					url: req.originalUrl,
					title: config.ACTIVITY_LOG.EMPLOYEE.PAGES.EMPLOYEE_ID_RESERVATION,
				},
			});
			const successResponse = buildSuccessResponse(
				"Employee ID reserved successfully",
				{
					employeeId: reserved.employeeId,
					sequence: reserved.sequence,
					organizationId,
					source: reserved.source,
				},
				200,
			);
			res.status(200).json(successResponse);
		} catch (error) {
			employeeLogger.error(`Error reserving employee ID: ${error}`);
			res.status(500).json(
				buildErrorResponse(config.ERROR.COMMON.INTERNAL_SERVER_ERROR, 500),
			);
		}
	};

	const ScheduleAssignmentCreateSchema = z.object({
		scheduleCode: z.string().min(1, "scheduleCode is required"),
		startDate: z.string().datetime("startDate must be a valid ISO date").optional(),
		endDate: z.string().datetime("endDate must be a valid ISO date").optional().nullable(),
		reason: z.string().trim().max(500).optional(),
	});

	const TeamScheduleTimeSlotSchema = z.object({
		type: z.string().min(1),
		label: z.string().optional(),
		startTime: z.string().min(1),
		endTime: z.string().min(1),
	});

	const TeamScheduleShiftSchema = z.object({
		label: z.string().min(1),
		isRestDay: z.boolean().optional(),
		timeSlots: z.array(TeamScheduleTimeSlotSchema).optional().default([]),
	});

	const TeamRotationPatternItemSchema = z.object({
		dayIndex: z.number().int().min(0),
		scheduleCode: z.string().min(1).optional(),
		isOff: z.boolean().optional(),
	});

	const TeamRotationConfigSchema = z.object({
		cycleLength: z.number().int().min(1),
		repeats: z.boolean().optional().default(true),
		pattern: z.array(TeamRotationPatternItemSchema).default([]),
	});

	const TeamScheduleCollectionCreateSchema = z.object({
		departmentId: z.string().min(1),
		name: z.string().min(1),
		code: z.string().min(1),
		description: z.string().optional().nullable(),
		startDate: z.string().datetime("startDate must be a valid ISO date"),
		endDate: z.string().datetime("endDate must be a valid ISO date"),
		shifts: z.array(TeamScheduleShiftSchema).min(1),
		gracePeriodMinutes: z.number().int().min(0).optional().default(0),
		totalHours: z.number().optional().nullable(),
		requiredHeadcount: z.number().int().min(0).optional().nullable(),
		rotationConfig: TeamRotationConfigSchema.optional().nullable(),
	});

	const TeamScheduleCollectionUpdateSchema = z.object({
		name: z.string().min(1).optional(),
		description: z.string().optional().nullable(),
		startDate: z.string().datetime("startDate must be a valid ISO date").optional(),
		endDate: z.string().datetime("endDate must be a valid ISO date").optional(),
		shifts: z.array(TeamScheduleShiftSchema).min(1).optional(),
		gracePeriodMinutes: z.number().int().min(0).optional(),
		totalHours: z.number().optional().nullable(),
		requiredHeadcount: z.number().int().min(0).optional().nullable(),
		rotationConfig: TeamRotationConfigSchema.optional().nullable(),
		isActive: z.boolean().optional(),
	});

	const TeamLedgerApplyRotationSchema = z.object({
		departmentId: z.string().min(1),
		rotationTemplateCode: z.string().min(1),
		employeeIds: z.array(z.string().min(1)).min(1),
		startDate: z.string().datetime("startDate must be a valid ISO date"),
		endDate: z.string().datetime("endDate must be a valid ISO date"),
	});

	const TeamLedgerOverrideSchema = z.object({
		departmentId: z.string().min(1),
		targetScheduleCode: z.string().optional().nullable(),
		overrides: z
			.array(
				z.object({
					employeeId: z.string().min(1),
					date: z.string().datetime("date must be a valid ISO date"),
					scheduleCode: z.string().optional().nullable(),
					isOff: z.boolean().optional(),
				}),
			)
			.min(1),
	});

	const setActiveEmployeeSchedule = async (req: Request, res: Response, _next: NextFunction) => {
		const organizationId = resolveOrganizationIdFromRequest(req);
		const employeeId = String(req.params.id || "").trim();
		if (!organizationId || !employeeId) {
			res.status(400).json(
				buildErrorResponse("organizationId and employee id are required", 400),
			);
			return;
		}

		const validation = ScheduleAssignmentCreateSchema.safeParse(req.body || {});
		if (!validation.success) {
			const formattedErrors = formatZodErrors(validation.error.format());
			res.status(400).json(buildErrorResponse("Validation failed", 400, formattedErrors));
			return;
		}

		try {
			const parsed = validation.data;
			const startDate = parsed.startDate ? toDateOrNull(parsed.startDate) : new Date();
			if (!startDate) {
				res.status(400).json(buildErrorResponse("startDate is invalid", 400));
				return;
			}
			const endDate = parsed.endDate ? toDateOrNull(parsed.endDate) : null;
			if (parsed.endDate && !endDate) {
				res.status(400).json(buildErrorResponse("endDate is invalid", 400));
				return;
			}
			if (endDate && endDate < startDate) {
				res.status(400).json(
					buildErrorResponse("endDate must be on or after startDate", 400),
				);
				return;
			}

			const targetEmployee = await prisma.employee.findFirst({
				where: {
					id: employeeId,
					organizationId,
					isDeleted: false,
				},
				select: {
					id: true,
					organizationId: true,
					employeeId: true,
					reportToId: true,
					departmentId: true,
					employmentHireDate: true,
					employmentStartDate: true,
					embeddedSchedule: true,
					person: {
						select: {
							personalInfo: true,
						},
					},
				},
			});

			if (!targetEmployee) {
				res.status(404).json(buildErrorResponse("Employee not found", 404));
				return;
			}

			const actor = await resolveActor(req, organizationId);
			const permission = await assertCanManageSchedule(
				actor.role,
				organizationId,
				actor.actorEmployeeRecord?.id || null,
				targetEmployee,
			);
			if (!permission.allowed) {
				res.status(403).json(buildErrorResponse(permission.message || "Forbidden", 403));
				return;
			}

			const scheduleTemplate = await prisma.scheduleTemplate.findFirst({
				where: {
					organizationId,
					code: parsed.scheduleCode,
					isDeleted: false,
				},
				select: {
					id: true,
					code: true,
					name: true,
					cycleDays: true,
					graceLateMinutes: true,
					graceEarlyOutMinutes: true,
					pattern: true,
				},
			});

			if (!scheduleTemplate) {
				res.status(404).json(buildErrorResponse("Schedule template not found", 404));
				return;
			}

			const isManagerRole = actor.role === "hris-employee-manager";
			if (isManagerRole) {
				const targetDepartmentId = targetEmployee.departmentId || null;
				const managedDepartmentIds = await getManagedDepartmentIds(
					organizationId,
					actor.actorEmployeeRecord?.id || null,
				);
				if (!targetDepartmentId || !managedDepartmentIds.includes(targetDepartmentId)) {
					res.status(403).json(
						buildErrorResponse(
							"Department head can only assign schedules within owned departments",
							403,
						),
					);
					return;
				}

				const allowedSchedules = await buildDepartmentScheduleCollection(
					organizationId,
					targetDepartmentId,
				);
				const allowedScheduleIds = new Set(allowedSchedules.map((item) => item.id));
				if (!allowedScheduleIds.has(scheduleTemplate.id)) {
					res.status(403).json(
						buildErrorResponse(
							"Selected schedule is not available in this department schedule collection",
							403,
						),
					);
					return;
				}
			}

			const previousEmbeddedSchedule = targetEmployee.embeddedSchedule || null;
			const nextEmbeddedSchedule = copyTemplateToEmployeeEmbeddedSchedule({
				template: scheduleTemplate,
				assignedByEmployeeId: actor.actorEmployeeRecord?.id || null,
				reason: parsed.reason || null,
				effectiveStartDate: startDate || new Date(),
				version: Number((previousEmbeddedSchedule as any)?.version || 0) + 1,
			});

			await prisma.employee.update({
				where: { id: employeeId },
				data: {
					embeddedSchedule: { set: nextEmbeddedSchedule } as any,
				},
			});
			await appendEmployeeScheduleHistory(prisma, {
				organizationId,
				employeeId,
				action: previousEmbeddedSchedule ? "reassigned" : "assigned",
				actorEmployeeId: actor.actorEmployeeRecord?.id || null,
				reason: parsed.reason || null,
				effectiveAt: startDate || new Date(),
				beforeSchedule: previousEmbeddedSchedule,
				afterSchedule: nextEmbeddedSchedule,
			});

			await recomputeAttendanceObligationsForRange(prisma, {
				organizationId,
				employeeId,
				fromDate: startDate,
				toDate: endDate || new Date(startDate.getTime() + 60 * 24 * 60 * 60 * 1000),
				reason: "ScheduleChanged",
			});

			await invalidateCache.byPattern(`cache:employee:byId:${employeeId}:*`);
			await invalidateCache.byPattern("cache:employee:list:*");
			await invalidateCache.byPattern("cache:scheduleOverride:list:*");
			await invalidateCache.byPattern("cache:attendance:*");
			await invalidateCache.byPattern("cache:timesheet:*");
			await invalidateCache.byPattern("cache:metrics:*");

			const updatedEmployee = await prisma.employee.findFirst({
				where: { id: employeeId, organizationId },
				select: {
					id: true,
					embeddedSchedule: true,
				},
			});

			logActivity(req, {
				userId: (req as any).user?.id || "unknown",
				action: config.ACTIVITY_LOG.EMPLOYEE.ACTIONS.SET_EMPLOYEE_SCHEDULE,
				description: `${config.ACTIVITY_LOG.EMPLOYEE.DESCRIPTIONS.EMPLOYEE_SCHEDULE_SET}: ${targetEmployee.employeeId || employeeId} (${parsed.scheduleCode})`,
				page: {
					url: req.originalUrl,
					title: config.ACTIVITY_LOG.EMPLOYEE.PAGES.EMPLOYEE_SCHEDULE,
				},
			});
			logAudit(req, {
				userId: (req as any).user?.id || "unknown",
				action: config.AUDIT_LOG.ACTIONS.UPDATE,
				resource: config.AUDIT_LOG.RESOURCES.EMPLOYEE,
				severity: config.AUDIT_LOG.SEVERITY.MEDIUM,
				entityType: config.AUDIT_LOG.ENTITY_TYPES.EMPLOYEE,
				entityId: employeeId,
				changesBefore: { embeddedSchedule: previousEmbeddedSchedule },
				changesAfter: {
					embeddedSchedule: (updatedEmployee as any)?.embeddedSchedule || null,
				},
				description: `${config.AUDIT_LOG.EMPLOYEE.DESCRIPTIONS.EMPLOYEE_SCHEDULE_SET}: ${targetEmployee.employeeId || employeeId} (${parsed.scheduleCode})`,
				organizationId,
			});

			const successResponse = buildSuccessResponse(
				"Employee active schedule updated successfully",
				{
					embeddedSchedule: (updatedEmployee as any)?.embeddedSchedule || null,
					activeSchedule: resolveEmployeeActiveSchedule(updatedEmployee),
				},
				201,
			);
			res.status(201).json(successResponse);
		} catch (error) {
			employeeLogger.error(`Error setting active employee schedule: ${error}`);
			res.status(500).json(
				buildErrorResponse(config.ERROR.COMMON.INTERNAL_SERVER_ERROR, 500),
			);
		}
	};

	const getTeamScheduleCalendar = async (req: Request, res: Response, _next: NextFunction) => {
		const organizationId = resolveOrganizationIdFromRequest(req);
		if (!organizationId) {
			res.status(400).json(buildErrorResponse("organizationId is required", 400));
			return;
		}

		const from = toDateOrNull(String(req.query.from || ""));
		const to = toDateOrNull(String(req.query.to || ""));
		const departmentId = String(req.query.departmentId || "").trim() || null;
		const managerId = String(req.query.managerId || "").trim() || null;
		const targetEmployeeId = String(req.query.employeeId || "").trim() || null;

		if (!from || !to) {
			res.status(400).json(buildErrorResponse("from and to are required ISO dates", 400));
			return;
		}
		if (to < from) {
			res.status(400).json(buildErrorResponse("to must be on or after from", 400));
			return;
		}

		try {
			const actor = await resolveActor(req, organizationId);
			const actorEmployeeId = actor.actorEmployeeRecord?.id || null;
			if (!actorEmployeeId) {
				res.status(403).json(
					buildErrorResponse("Only department heads can access team schedules", 403),
				);
				return;
			}

			const managedDepartmentIds = await getManagedDepartmentIds(
				organizationId,
				actorEmployeeId,
			);
			if (managedDepartmentIds.length === 0) {
				res.status(403).json(
					buildErrorResponse("Only department heads can access team schedules", 403),
				);
				return;
			}

			let roleScope: "department" | "organization" = "department";
			let scopeDepartmentId: string | null = null;
			let scopedDepartmentIds: string[] = [];

			const employeeWhere: any = {
				organizationId,
				isDeleted: false,
			};
			if (departmentId && !managedDepartmentIds.includes(departmentId)) {
				res.status(403).json(
					buildErrorResponse(
						"Department head can only view schedules for owned departments",
						403,
					),
				);
				return;
			}
			scopedDepartmentIds = departmentId ? [departmentId] : managedDepartmentIds;
			scopeDepartmentId = scopedDepartmentIds.length === 1 ? scopedDepartmentIds[0] : null;
			employeeWhere.departmentId = { in: scopedDepartmentIds };
			if (targetEmployeeId) employeeWhere.id = targetEmployeeId;
			if (managerId) {
				employeeWhere.reportToId = managerId;
			}

			const employees = await prisma.employee.findMany({
				where: employeeWhere,
				select: {
					id: true,
					employeeId: true,
					reportToId: true,
					departmentId: true,
					embeddedSchedule: true,
					scheduleHistoryRecords: {
						where: {
							organizationId,
							effectiveAt: {
								lte: toUtcEndOfDay(to),
							},
						},
						orderBy: [{ effectiveAt: "asc" }, { createdAt: "asc" }],
						select: {
							effectiveAt: true,
							createdAt: true,
							beforeSchedule: true,
							afterSchedule: true,
						},
					},
					scheduleOverrides: {
						where: { isDeleted: false },
						select: {
							id: true,
							date: true,
							shiftTypeId: true,
							shiftSnapshot: true,
							createdAt: true,
							updatedAt: true,
						},
					},
					person: {
						select: {
							personalInfo: true,
						},
					},
				},
			});
			const employeeIds = employees.map((item) => item.id);
			const departmentRows = scopedDepartmentIds.length
				? await prisma.department.findMany({
						where: {
							organizationId,
							id: { in: scopedDepartmentIds },
							isDeleted: false,
						},
						select: {
							id: true,
							name: true,
							code: true,
							managerId: true,
						},
					})
				: [];
			const allowedScheduleMap = new Map<
				string,
				{
					id: string;
					code: string;
					name: string;
					source:
						| "department_default"
						| "department_head_created"
						| "department_head_linked";
					collectionId?: string;
					isActive?: boolean;
				}
			>();
			for (const department of departmentRows) {
				const departmentSchedules = await buildDepartmentScheduleCollection(
					organizationId,
					department.id,
					employeeIds,
				);
				for (const schedule of departmentSchedules) {
					if (!allowedScheduleMap.has(schedule.id)) {
						allowedScheduleMap.set(schedule.id, schedule);
					}
				}
			}
			const allowedSchedules = Array.from(allowedScheduleMap.values()).sort((a, b) =>
				a.name.localeCompare(b.name),
			);
			const managedDepartments = departmentRows.map((department) => ({
				id: department.id,
				name: department.name,
				code: department.code,
				canManage: !!actorEmployeeId && department.managerId === actorEmployeeId,
			}));

			if (employeeIds.length === 0) {
				logActivity(req, {
					userId: (req as any).user?.id || "unknown",
					action: config.ACTIVITY_LOG.EMPLOYEE.ACTIONS.GET_TEAM_SCHEDULE_CALENDAR,
					description: config.ACTIVITY_LOG.EMPLOYEE.DESCRIPTIONS.TEAM_SCHEDULE_CALENDAR_RETRIEVED,
					page: {
						url: req.originalUrl,
						title: config.ACTIVITY_LOG.EMPLOYEE.PAGES.TEAM_SCHEDULE,
					},
				});
				res.status(200).json(
					buildSuccessResponse(
						"Team schedule calendar retrieved successfully",
						{
							from,
							to,
							scope: {
								departmentId: scopeDepartmentId,
								roleScope,
							},
							managedDepartments,
							allowedSchedules,
							items: [],
						},
						200,
					),
				);
				return;
			}
			const items = employees.flatMap((employee) => {
				const firstName = employee?.person?.personalInfo?.firstName || "";
				const lastName = employee?.person?.personalInfo?.lastName || "";
				const employeeName =
					`${firstName} ${lastName}`.trim() || employee.employeeId || "Unknown";
				const summaries = buildRangeScheduleEntrySummaries(
					employee,
					toUtcStartOfDay(from),
					toUtcEndOfDay(to),
				);
				return summaries.map((summary) => ({
					scheduleEntryId: summary.scheduleEntryId,
					employeeId: employee.id,
					employeeCode: employee.employeeId || null,
					employeeName,
					departmentId: employee?.departmentId || null,
					managerId: employee?.reportToId || null,
					scheduleCode: summary.scheduleCode,
					scheduleName: summary.scheduleName,
					startDate: summary.startDate,
					effectiveDate: summary.startDate,
					endDate: summary.endDate,
					status: summary.status,
				}));
			});

			logActivity(req, {
				userId: (req as any).user?.id || "unknown",
				action: config.ACTIVITY_LOG.EMPLOYEE.ACTIONS.GET_TEAM_SCHEDULE_CALENDAR,
				description: `${config.ACTIVITY_LOG.EMPLOYEE.DESCRIPTIONS.TEAM_SCHEDULE_CALENDAR_RETRIEVED}: ${items.length} item(s)`,
				page: {
					url: req.originalUrl,
					title: config.ACTIVITY_LOG.EMPLOYEE.PAGES.TEAM_SCHEDULE,
				},
			});
			res.status(200).json(
				buildSuccessResponse(
					"Team schedule calendar retrieved successfully",
					{
						from,
						to,
						scope: {
							departmentId: scopeDepartmentId,
							roleScope,
						},
						managedDepartments,
						allowedSchedules,
						items,
					},
					200,
				),
			);
		} catch (error) {
			employeeLogger.error(`Error getting team schedule calendar: ${error}`);
			res.status(500).json(
				buildErrorResponse(config.ERROR.COMMON.INTERNAL_SERVER_ERROR, 500),
			);
		}
	};

	const getTeamScheduleCalendarGrid = async (
		req: Request,
		res: Response,
		_next: NextFunction,
	) => {
		const organizationId = resolveOrganizationIdFromRequest(req);
		if (!organizationId) {
			res.status(400).json(buildErrorResponse("organizationId is required", 400));
			return;
		}

		const from = toDateOrNull(String(req.query.from || ""));
		const to = toDateOrNull(String(req.query.to || ""));
		const departmentId = String(req.query.departmentId || "").trim() || null;
		const targetEmployeeId = String(req.query.employeeId || "").trim() || null;

		if (!from || !to) {
			res.status(400).json(buildErrorResponse("from and to are required ISO dates", 400));
			return;
		}
		if (to < from) {
			res.status(400).json(buildErrorResponse("to must be on or after from", 400));
			return;
		}

		try {
			const actor = await resolveActor(req, organizationId);
			const actorEmployeeId = actor.actorEmployeeRecord?.id || null;
			if (!actorEmployeeId) {
				res.status(403).json(
					buildErrorResponse(
						"Only department heads can access team schedule calendar",
						403,
					),
				);
				return;
			}

			const managedDepartmentIds = await getManagedDepartmentIds(
				organizationId,
				actorEmployeeId,
			);
			if (managedDepartmentIds.length === 0) {
				res.status(403).json(
					buildErrorResponse(
						"Only department heads can access team schedule calendar",
						403,
					),
				);
				return;
			}

			const employeeWhere: any = {
				organizationId,
				isDeleted: false,
			};
			let scopedDepartmentIds: string[] = [];
			let roleScope: "department" | "organization" = "department";

			if (departmentId && !managedDepartmentIds.includes(departmentId)) {
				res.status(403).json(
					buildErrorResponse(
						"Department head can only view schedules for owned departments",
						403,
					),
				);
				return;
			}
			scopedDepartmentIds = departmentId ? [departmentId] : managedDepartmentIds;
			employeeWhere.departmentId = { in: scopedDepartmentIds };

			if (targetEmployeeId) employeeWhere.id = targetEmployeeId;

			const employees = await prisma.employee.findMany({
				where: employeeWhere,
				select: {
					id: true,
					employeeId: true,
					reportToId: true,
					departmentId: true,
					embeddedSchedule: true,
					scheduleHistoryRecords: {
						where: {
							organizationId,
							effectiveAt: {
								lte: toUtcEndOfDay(to),
							},
						},
						orderBy: [{ effectiveAt: "asc" }, { createdAt: "asc" }],
						select: {
							effectiveAt: true,
							createdAt: true,
							beforeSchedule: true,
							afterSchedule: true,
						},
					},
					scheduleOverrides: {
						where: { isDeleted: false },
						select: {
							id: true,
							date: true,
							shiftTypeId: true,
							shiftSnapshot: true,
							createdAt: true,
							updatedAt: true,
						},
					},
					person: {
						select: {
							personalInfo: true,
						},
					},
					department: {
						select: {
							id: true,
							name: true,
							code: true,
						},
					},
				},
			});

			const departmentRows = scopedDepartmentIds.length
				? await prisma.department.findMany({
						where: {
							organizationId,
							id: { in: scopedDepartmentIds },
							isDeleted: false,
						},
						select: {
							id: true,
							name: true,
							code: true,
							managerId: true,
						},
					})
				: [];
			const managedDepartments = departmentRows.map((department) => ({
				id: department.id,
				name: department.name,
				code: department.code,
				canManage: !!actorEmployeeId && department.managerId === actorEmployeeId,
			}));
			const departmentScheduleCollections = await Promise.all(
				departmentRows.map(async (department) => ({
					departmentId: department.id,
					schedules: await buildDepartmentScheduleCollection(
						organizationId,
						department.id,
					),
				})),
			);
			const shiftTypeIds = new Set<string>();
			for (const employee of employees) {
				for (const id of collectShiftTypeIdsFromEmployeeScheduleData(employee)) {
					shiftTypeIds.add(String(id));
				}
			}
			const shiftTypes = shiftTypeIds.size
				? await (prisma as any).shiftType.findMany({
						where: {
							organizationId,
							isDeleted: false,
							id: { in: Array.from(shiftTypeIds) },
						},
					})
				: [];
			const shiftTypeById = new Map<string, any>(
				(shiftTypes || []).map((item: any) => [String(item.id), item]),
			);

			const dateKeys = enumerateUtcDateKeysInclusive(from, to);
			const dates = dateKeys.map((key) => `${key}T00:00:00.000Z`);

			if (employees.length === 0) {
				const scheduleSummaries = departmentScheduleCollections.flatMap((collection) => {
					const departmentMatch = departmentRows.find(
						(item) => item.id === collection.departmentId,
					);
					return (collection.schedules || []).map((schedule) => ({
						scheduleId: schedule.id || null,
						scheduleCode: schedule.code || "UNKNOWN",
						scheduleName: schedule.name || "Unknown Schedule",
						startDate: schedule.startDate || null,
						endDate: schedule.endDate || null,
						source: schedule.source || null,
						departmentId: collection.departmentId || null,
						departmentName: departmentMatch?.name || null,
						employeeCount: 0,
						scheduleEntryCount: 0,
						requiredHeadcount: 0,
						rotationConfig: schedule.rotationConfig || null,
					}));
				});

				res.status(200).json(
					buildSuccessResponse(
						"Team schedule calendar grid retrieved successfully",
						{
							from,
							to,
							dates,
							scope: {
								departmentId,
								roleScope,
							},
							managedDepartments,
							scheduleSummaries,
							coverageHeatmap: [],
							stats: {
								totalEmployees: 0,
								coveragePercent: 0,
								understaffedDays: 0,
								openSlots: 0,
							},
							actionNeeded: {
								understaffedDates: [],
								consecutiveWorkDaysExceeded: [],
								emptyShifts: [],
							},
							rows: [],
						},
						200,
					),
				);
				return;
			}

			const consecutiveLimit = Math.max(1, Number(req.query.consecutiveLimit || 6));

			const rows = employees
				.slice()
				.sort((a, b) => {
					const departmentCompare = String(a.department?.name || "").localeCompare(
						String(b.department?.name || ""),
					);
					if (departmentCompare !== 0) return departmentCompare;
					return formatEmployeeDisplayName(a).localeCompare(formatEmployeeDisplayName(b));
				})
				.map((employee) => {
					const employeeName = formatEmployeeDisplayName(employee);
					const scheduleEntrySummaries = buildRangeScheduleEntrySummaries(
						employee,
						toUtcStartOfDay(from),
						toUtcEndOfDay(to),
					);
					const cells = dateKeys.map((dateKey) => {
						const dayStart = new Date(`${dateKey}T00:00:00.000Z`);
						const resolvedShift = resolveEffectiveShiftFromEmployeeData(
							employee,
							dayStart,
							shiftTypeById,
						);
						if (!resolvedShift) {
							return {
								date: dayStart.toISOString(),
								scheduleEntryId: null,
								status: "UNASSIGNED",
								scheduleId: null,
								scheduleCode: null,
								scheduleName: null,
								gracePeriodMinutes: 0,
								shift: null,
								timeSlots: [],
								isRestDay: false,
								profilePath: `/employee/${employee.id}`,
								startDate: null,
								effectiveDate: null,
								endDate: null,
								snapshotSource: "unassigned",
							};
						}
						const timeSlots = Array.isArray(resolvedShift.timeSlots)
							? resolvedShift.timeSlots
							: [];
						const shiftLabel =
							resolvedShift.shiftTypeName ||
							resolvedShift.scheduleTemplateName ||
							resolvedShift.shiftTypeCode ||
							"Shift";
						const scheduleCode = resolvedShift.shiftTypeCode || "SHIFT";
						const scheduleName = resolvedShift.scheduleTemplateName || shiftLabel;
						return {
							date: dayStart.toISOString(),
							scheduleEntryId: resolvedShift.scheduleOverrideId || null,
							status: "ACTIVE",
							scheduleId: resolvedShift.scheduleTemplateId || null,
							scheduleCode,
							scheduleName,
							gracePeriodMinutes: Number(resolvedShift.graceLateMinutes || 0),
							shift: {
								label: shiftLabel,
								isRestDay: Boolean(resolvedShift.isOff),
								timeSlots,
							},
							timeSlots,
							isRestDay: Boolean(resolvedShift.isOff),
							profilePath: `/employee/${employee.id}`,
							startDate: null,
							effectiveDate: dayStart.toISOString(),
							endDate: null,
							snapshotSource: resolvedShift.source || "resolved_shift",
						};
					});

					return {
						employeeId: employee.id,
						employeeCode: employee.employeeId,
						employeeName,
						profilePath: `/employee/${employee.id}`,
						departmentId: employee.departmentId || null,
						departmentName: employee.department?.name || null,
						departmentCode: employee.department?.code || null,
						managerId: employee.reportToId || null,
						scheduleEntries: scheduleEntrySummaries,
						cells,
					};
				});

			const scheduleSummaryMap = new Map<
				string,
				{
					scheduleId: string | null;
					scheduleCode: string;
					scheduleName: string;
					startDate: Date | null;
					endDate: Date | null;
					source: string | null;
					departmentId: string | null;
					departmentName: string | null;
					employeeIds: Set<string>;
					scheduleEntryCount: number;
					requiredHeadcount: number;
					rotationConfig: any | null;
				}
			>();

			for (const collection of departmentScheduleCollections) {
				for (const schedule of collection.schedules || []) {
					const key = `${collection.departmentId}:${schedule.id || schedule.code}`;
					if (!scheduleSummaryMap.has(key)) {
						scheduleSummaryMap.set(key, {
							scheduleId: schedule.id || null,
							scheduleCode: schedule.code || "UNKNOWN",
							scheduleName: schedule.name || "Unknown Schedule",
							startDate: schedule.startDate || null,
							endDate: schedule.endDate || null,
							source: schedule.source || null,
							departmentId: collection.departmentId || null,
							departmentName:
								departmentRows.find((item) => item.id === collection.departmentId)
									?.name || null,
							employeeIds: new Set<string>(),
							scheduleEntryCount: 0,
							requiredHeadcount: 0,
							rotationConfig: schedule.rotationConfig || null,
						});
					}
				}
			}

			for (const row of rows) {
				for (const scheduleEntry of row.scheduleEntries || []) {
					const key = `${row.departmentId || "none"}:${
						scheduleEntry.scheduleId ||
						scheduleEntry.scheduleCode ||
						scheduleEntry.scheduleEntryId
					}`;
					const existing = scheduleSummaryMap.get(key) || {
						scheduleId: scheduleEntry.scheduleId || null,
						scheduleCode: scheduleEntry.scheduleCode || "UNKNOWN",
						scheduleName: scheduleEntry.scheduleName || "Unknown Schedule",
						startDate: scheduleEntry.startDate
							? new Date(scheduleEntry.startDate)
							: null,
						endDate: scheduleEntry.endDate ? new Date(scheduleEntry.endDate) : null,
						source: "schedule_entry",
						departmentId: row.departmentId || null,
						departmentName: row.departmentName || null,
						employeeIds: new Set<string>(),
						scheduleEntryCount: 0,
						requiredHeadcount: 0,
						rotationConfig: null,
					};
					existing.employeeIds.add(row.employeeId);
					existing.scheduleEntryCount += 1;
					scheduleSummaryMap.set(key, existing);
				}
			}

			const scheduleSummaries = Array.from(scheduleSummaryMap.values())
				.map((item) => ({
					scheduleId: item.scheduleId,
					scheduleCode: item.scheduleCode,
					scheduleName: item.scheduleName,
					startDate: item.startDate,
					endDate: item.endDate,
					source: item.source,
					departmentId: item.departmentId,
					departmentName: item.departmentName,
					employeeCount: item.employeeIds.size,
					scheduleEntryCount: item.scheduleEntryCount,
					requiredHeadcount: item.requiredHeadcount,
					rotationConfig: item.rotationConfig,
				}))
				.sort(
					(a, b) =>
						b.employeeCount - a.employeeCount ||
						a.scheduleName.localeCompare(b.scheduleName),
				);

			const coverageHeatmap: Array<{
				date: string;
				scheduleCode: string;
				scheduleName: string;
				required: number;
				assigned: number;
				delta: number;
				status: "UNDERSTAFFED" | "FULLY_STAFFED" | "OVERSTAFFED";
			}> = [];

			const understaffedDates: Array<{
				date: string;
				scheduleCode: string;
				missing: number;
			}> = [];
			const emptyShifts: Array<{ date: string; scheduleCode: string; scheduleName: string }> =
				[];
			const assignedWorkByDate = new Map<string, number>();
			for (const key of dateKeys) {
				assignedWorkByDate.set(key, 0);
			}
			for (const row of rows) {
				for (const cell of row.cells || []) {
					const key = toUtcDateKey(cell?.date);
					if (!key || !assignedWorkByDate.has(key)) continue;
					const isWorkingDay = !!cell?.scheduleCode && !cell?.isRestDay;
					if (isWorkingDay) {
						assignedWorkByDate.set(key, (assignedWorkByDate.get(key) || 0) + 1);
					}
				}
			}

			const consecutiveWorkDaysExceeded: Array<{
				employeeId: string;
				employeeName: string;
				consecutiveDays: number;
				limit: number;
			}> = [];
			for (const row of rows) {
				let maxRun = 0;
				let currentRun = 0;
				for (const cell of row.cells || []) {
					const isWorkingDay = !!cell.scheduleCode && !cell.isRestDay;
					if (isWorkingDay) {
						currentRun += 1;
						if (currentRun > maxRun) maxRun = currentRun;
					} else {
						currentRun = 0;
					}
				}
				if (maxRun > consecutiveLimit) {
					consecutiveWorkDaysExceeded.push({
						employeeId: row.employeeId,
						employeeName: row.employeeName,
						consecutiveDays: maxRun,
						limit: consecutiveLimit,
					});
				}
			}

			const coveragePercent = rows.length > 0 ? 100 : 0;
			let totalOpenSlots = 0;
			for (const [key, assignedWork] of assignedWorkByDate.entries()) {
				const openSlots = Math.max(0, rows.length - assignedWork);
				if (openSlots > 0) {
					understaffedDates.push({
						date: `${key}T00:00:00.000Z`,
						scheduleCode: "UNASSIGNED",
						missing: openSlots,
					});
					totalOpenSlots += openSlots;
				}
				if (assignedWork === 0) {
					emptyShifts.push({
						date: `${key}T00:00:00.000Z`,
						scheduleCode: "UNASSIGNED",
						scheduleName: "No assigned shifts",
					});
				}
			}

			logActivity(req, {
				userId: (req as any).user?.id || "unknown",
				action: config.ACTIVITY_LOG.EMPLOYEE.ACTIONS.GET_TEAM_SCHEDULE_CALENDAR_GRID,
				description: `${config.ACTIVITY_LOG.EMPLOYEE.DESCRIPTIONS.TEAM_SCHEDULE_CALENDAR_GRID_RETRIEVED}: ${rows.length} row(s)`,
				page: {
					url: req.originalUrl,
					title: config.ACTIVITY_LOG.EMPLOYEE.PAGES.TEAM_SCHEDULE,
				},
			});
			res.status(200).json(
				buildSuccessResponse(
					"Team schedule calendar grid retrieved successfully",
					{
						from,
						to,
						dates,
						scope: {
							departmentId,
							roleScope,
						},
						managedDepartments,
						scheduleSummaries,
						coverageHeatmap,
						stats: {
							totalEmployees: rows.length,
							coveragePercent,
							understaffedDays: understaffedDates.length,
							openSlots: totalOpenSlots,
						},
						actionNeeded: {
							understaffedDates,
							consecutiveWorkDaysExceeded,
							emptyShifts,
						},
						rows,
					},
					200,
				),
			);
		} catch (error) {
			employeeLogger.error(`Error getting team schedule calendar grid: ${error}`);
			res.status(500).json(
				buildErrorResponse(config.ERROR.COMMON.INTERNAL_SERVER_ERROR, 500),
			);
		}
	};

	const getTeamScheduleCollections = async (req: Request, res: Response, _next: NextFunction) => {
		const organizationId = resolveOrganizationIdFromRequest(req);
		if (!organizationId) {
			res.status(400).json(buildErrorResponse("organizationId is required", 400));
			return;
		}

		try {
			const actor = await resolveActor(req, organizationId);
			const actorEmployeeId = actor.actorEmployeeRecord?.id || null;
			if (!actorEmployeeId) {
				res.status(403).json(
					buildErrorResponse("Only department heads can view team schedules", 403),
				);
				return;
			}

			const queryDepartmentId = String(req.query.departmentId || "").trim() || null;
			const managedDepartmentIds = await getManagedDepartmentIds(
				organizationId,
				actorEmployeeId,
			);
			if (managedDepartmentIds.length === 0) {
				res.status(403).json(
					buildErrorResponse("Only department heads can view team schedules", 403),
				);
				return;
			}
			const whereClause: any = {
				organizationId,
				isDeleted: false,
			};
			if (queryDepartmentId && !managedDepartmentIds.includes(queryDepartmentId)) {
				res.status(403).json(
					buildErrorResponse("Department head can only view owned departments", 403),
				);
				return;
			}
			whereClause.id = { in: queryDepartmentId ? [queryDepartmentId] : managedDepartmentIds };

			const departments = await prisma.department.findMany({
				where: whereClause,
				select: {
					id: true,
					name: true,
					code: true,
					managerId: true,
				},
				orderBy: { name: "asc" },
			});

			const data = [];
			for (const department of departments) {
				const schedules = await buildDepartmentScheduleCollection(
					organizationId,
					department.id,
				);
				data.push({
					id: department.id,
					name: department.name,
					code: department.code,
					canManage: !!actorEmployeeId && department.managerId === actorEmployeeId,
					schedules,
				});
			}

			logActivity(req, {
				userId: (req as any).user?.id || "unknown",
				action: config.ACTIVITY_LOG.EMPLOYEE.ACTIONS.GET_TEAM_SCHEDULE_COLLECTIONS,
				description: `${config.ACTIVITY_LOG.EMPLOYEE.DESCRIPTIONS.TEAM_SCHEDULE_COLLECTIONS_RETRIEVED}: ${data.length} department(s)`,
				page: {
					url: req.originalUrl,
					title: config.ACTIVITY_LOG.EMPLOYEE.PAGES.TEAM_SCHEDULE,
				},
			});
			res.status(200).json(
				buildSuccessResponse(
					"Team schedule collections retrieved successfully",
					{
						departments: data,
						canManageAny: data.some((item) => item.canManage),
					},
					200,
				),
			);
		} catch (error) {
			employeeLogger.error(`Error fetching team schedule collections: ${error}`);
			res.status(500).json(
				buildErrorResponse(config.ERROR.COMMON.INTERNAL_SERVER_ERROR, 500),
			);
		}
	};

	const createTeamScheduleCollection = async (
		req: Request,
		res: Response,
		_next: NextFunction,
	) => {
		const organizationId = resolveOrganizationIdFromRequest(req);
		if (!organizationId) {
			res.status(400).json(buildErrorResponse("organizationId is required", 400));
			return;
		}
		res.status(405).json(
			buildErrorResponse(
				"Team schedule collection create is not supported in the new schedule schema. Use schedule templates + department links.",
				405,
			),
		);
		return;

		const validation = TeamScheduleCollectionCreateSchema.safeParse(req.body || {});
		if (!validation.success) {
			const formattedErrors = formatZodErrors(validation.error.format());
			res.status(400).json(buildErrorResponse("Validation failed", 400, formattedErrors));
			return;
		}

		try {
			const actor = await resolveActor(req, organizationId);
			const actorEmployeeId = actor.actorEmployeeRecord?.id || null;
			const isHrViewer =
				actor.role === "hris-hr-manager" ||
				actor.role === "hris-hr-user" ||
				actor.role === "admin" ||
				actor.role === "hris-admin";
			if (isHrViewer) {
				res.status(403).json(
					buildErrorResponse("HR/Admin is view-only in Team Schedules workspace", 403),
				);
				return;
			}

			const managedDepartmentIds = await getManagedDepartmentIds(
				organizationId,
				actorEmployeeId,
			);
			if (!managedDepartmentIds.includes(validation.data.departmentId)) {
				res.status(403).json(
					buildErrorResponse(
						"Only department head can manage this department schedules",
						403,
					),
				);
				return;
			}

			const startDate = toDateOrNull(validation.data.startDate);
			const endDate = toDateOrNull(validation.data.endDate);
			if (!startDate || !endDate || endDate < startDate) {
				res.status(400).json(buildErrorResponse("Invalid schedule date range", 400));
				return;
			}

			const schedule = await prisma.schedule.create({
				data: {
					organizationId,
					name: validation.data.name,
					code: validation.data.code,
					description: validation.data.description || null,
					startDate,
					endDate,
					shifts: validation.data.shifts as any,
					gracePeriodMinutes: Number(validation.data.gracePeriodMinutes || 0),
					totalHours: validation.data.totalHours ?? null,
					requiredHeadcount: validation.data.requiredHeadcount ?? null,
					rotationConfig: validation.data.rotationConfig || null,
					isDefault: false,
					isActive: true,
					isDeleted: false,
				},
			});

			const collection = await collectionClient.create({
				data: {
					organizationId,
					departmentId: validation.data.departmentId,
					scheduleId: schedule.id,
					source: "department_head_created",
					createdByEmployeeId: actorEmployeeId,
					isActive: true,
					isDeleted: false,
				},
			});

			res.status(201).json(
				buildSuccessResponse(
					"Department schedule created successfully",
					{
						collectionId: collection.id,
						schedule,
					},
					201,
				),
			);
		} catch (error: any) {
			const message =
				typeof error?.message === "string" && error.message.includes("Unique")
					? "Schedule code already exists"
					: config.ERROR.COMMON.INTERNAL_SERVER_ERROR;
			employeeLogger.error(`Error creating team schedule collection: ${error}`);
			res.status(message === config.ERROR.COMMON.INTERNAL_SERVER_ERROR ? 500 : 409).json(
				buildErrorResponse(
					message,
					message === config.ERROR.COMMON.INTERNAL_SERVER_ERROR ? 500 : 409,
				),
			);
		}
	};

	const updateTeamScheduleCollection = async (
		req: Request,
		res: Response,
		_next: NextFunction,
	) => {
		const organizationId = resolveOrganizationIdFromRequest(req);
		const collectionId = String(req.params.collectionId || "").trim();
		if (!organizationId || !collectionId) {
			res.status(400).json(
				buildErrorResponse("organizationId and collectionId are required", 400),
			);
			return;
		}
		res.status(405).json(
			buildErrorResponse(
				"Team schedule collection update is not supported in the new schedule schema. Use schedule templates + department links.",
				405,
			),
		);
		return;

		const validation = TeamScheduleCollectionUpdateSchema.safeParse(req.body || {});
		if (!validation.success) {
			const formattedErrors = formatZodErrors(validation.error.format());
			res.status(400).json(buildErrorResponse("Validation failed", 400, formattedErrors));
			return;
		}

		try {
			const actor = await resolveActor(req, organizationId);
			const actorEmployeeId = actor.actorEmployeeRecord?.id || null;
			const collection = await collectionClient.findFirst({
				where: {
					id: collectionId,
					organizationId,
					isDeleted: false,
				},
				include: {
					department: {
						select: {
							id: true,
							managerId: true,
						},
					},
					schedule: {
						select: {
							id: true,
							startDate: true,
							endDate: true,
						},
					},
				},
			});
			if (!collection) {
				res.status(404).json(
					buildErrorResponse("Department schedule collection not found", 404),
				);
				return;
			}
			if (!collection.department || collection.department.managerId !== actorEmployeeId) {
				res.status(403).json(
					buildErrorResponse("Only department head can update this schedule", 403),
				);
				return;
			}

			const updateData = validation.data;
			const candidateStart = updateData.startDate
				? toDateOrNull(updateData.startDate)
				: collection.schedule?.startDate;
			const candidateEnd = updateData.endDate
				? toDateOrNull(updateData.endDate)
				: collection.schedule?.endDate;
			if (!candidateStart || !candidateEnd || candidateEnd < candidateStart) {
				res.status(400).json(buildErrorResponse("Invalid schedule date range", 400));
				return;
			}
			if (collection.source === "department_default" && updateData.isActive === false) {
				res.status(400).json(
					buildErrorResponse("Department default schedule cannot be deactivated", 400),
				);
				return;
			}

			const updatedSchedule = await prisma.schedule.update({
				where: { id: collection.scheduleId },
				data: {
					...(updateData.name !== undefined ? { name: updateData.name } : {}),
					...(updateData.description !== undefined
						? { description: updateData.description || null }
						: {}),
					...(updateData.startDate !== undefined ? { startDate: candidateStart } : {}),
					...(updateData.endDate !== undefined ? { endDate: candidateEnd } : {}),
					...(updateData.shifts !== undefined
						? { shifts: updateData.shifts as any }
						: {}),
					...(updateData.gracePeriodMinutes !== undefined
						? { gracePeriodMinutes: Number(updateData.gracePeriodMinutes || 0) }
						: {}),
					...(updateData.totalHours !== undefined
						? { totalHours: updateData.totalHours }
						: {}),
					...(updateData.requiredHeadcount !== undefined
						? { requiredHeadcount: updateData.requiredHeadcount }
						: {}),
					...(updateData.rotationConfig !== undefined
						? { rotationConfig: updateData.rotationConfig || null }
						: {}),
				},
			});

			const updatedCollection =
				updateData.isActive === undefined
					? collection
					: await collectionClient.update({
							where: { id: collection.id },
							data: { isActive: updateData.isActive },
						});

			res.status(200).json(
				buildSuccessResponse(
					"Department schedule updated successfully",
					{
						collection: updatedCollection,
						schedule: updatedSchedule,
					},
					200,
				),
			);
		} catch (error) {
			employeeLogger.error(`Error updating team schedule collection: ${error}`);
			res.status(500).json(
				buildErrorResponse(config.ERROR.COMMON.INTERNAL_SERVER_ERROR, 500),
			);
		}
	};

	const archiveTeamScheduleCollection = async (
		req: Request,
		res: Response,
		_next: NextFunction,
	) => {
		const organizationId = resolveOrganizationIdFromRequest(req);
		const collectionId = String(req.params.collectionId || "").trim();
		if (!organizationId || !collectionId) {
			res.status(400).json(
				buildErrorResponse("organizationId and collectionId are required", 400),
			);
			return;
		}
		res.status(405).json(
			buildErrorResponse(
				"Team schedule collection archive is not supported in the new schedule schema. Use schedule templates + department links.",
				405,
			),
		);
		return;

		try {
			const actor = await resolveActor(req, organizationId);
			const actorEmployeeId = actor.actorEmployeeRecord?.id || null;
			const collection = await collectionClient.findFirst({
				where: {
					id: collectionId,
					organizationId,
					isDeleted: false,
				},
				include: {
					department: {
						select: {
							managerId: true,
						},
					},
				},
			});
			if (!collection) {
				res.status(404).json(
					buildErrorResponse("Department schedule collection not found", 404),
				);
				return;
			}
			if (!collection.department || collection.department.managerId !== actorEmployeeId) {
				res.status(403).json(
					buildErrorResponse("Only department head can archive this schedule", 403),
				);
				return;
			}
			if (collection.source === "department_default") {
				res.status(400).json(
					buildErrorResponse("Department default schedule cannot be archived", 400),
				);
				return;
			}

			const archived = await collectionClient.update({
				where: { id: collectionId },
				data: {
					isActive: false,
					isDeleted: true,
				},
			});

			res.status(200).json(
				buildSuccessResponse(
					"Department schedule archived successfully",
					{
						collection: archived,
					},
					200,
				),
			);
		} catch (error) {
			employeeLogger.error(`Error archiving team schedule collection: ${error}`);
			res.status(500).json(
				buildErrorResponse(config.ERROR.COMMON.INTERNAL_SERVER_ERROR, 500),
			);
		}
	};

	const applyTeamScheduleLedgerRotation = async (
		req: Request,
		res: Response,
		_next: NextFunction,
	) => {
		const organizationId = resolveOrganizationIdFromRequest(req);
		if (!organizationId) {
			res.status(400).json(buildErrorResponse("organizationId is required", 400));
			return;
		}
		res.status(405).json(
			buildErrorResponse(
				"Team schedule ledger rotation is not supported in embedded schedule v1.",
				405,
			),
		);
		return;
	};

	const overrideTeamScheduleLedger = async (req: Request, res: Response, _next: NextFunction) => {
		const organizationId = resolveOrganizationIdFromRequest(req);
		if (!organizationId) {
			res.status(400).json(buildErrorResponse("organizationId is required", 400));
			return;
		}
		res.status(405).json(
			buildErrorResponse(
				"Team schedule ledger override is not supported in embedded schedule v1.",
				405,
			),
		);
		return;
	};

	const getEmployeeSchedules = async (req: Request, res: Response, _next: NextFunction) => {
		const organizationId = resolveOrganizationIdFromRequest(req);
		const employeeId = String(req.params.id || "").trim();
		if (!organizationId || !employeeId) {
			res.status(400).json(
				buildErrorResponse("organizationId and employee id are required", 400),
			);
			return;
		}

		try {
			const targetEmployee = await prisma.employee.findFirst({
				where: {
					id: employeeId,
					organizationId,
					isDeleted: false,
				},
				select: {
					id: true,
					organizationId: true,
					reportToId: true,
					employeeId: true,
					embeddedSchedule: true,
					employmentHireDate: true,
					employmentStartDate: true,
					person: {
						select: {
							personalInfo: true,
						},
					},
				},
			});
			if (!targetEmployee) {
				res.status(404).json(buildErrorResponse("Employee not found", 404));
				return;
			}

			const actor = await resolveActor(req, organizationId);
			const role = actor.role;
			const actorEmployeeId = actor.actorEmployeeRecord?.id || null;
			const isSelf = actorEmployeeId && actorEmployeeId === employeeId;
			const isHr =
				role === "hris-hr-manager" ||
				role === "hris-hr-user" ||
				role === "admin" ||
				role === "hris-admin";
			const isDirectManager =
				role === "hris-employee-manager" && targetEmployee.reportToId === actorEmployeeId;

			if (!isSelf && !isHr && !isDirectManager) {
				res.status(403).json(
					buildErrorResponse("You are not allowed to view schedule timeline", 403),
				);
				return;
			}

			const historyRows = await (prisma as any).employeeScheduleHistory.findMany({
				where: {
					organizationId,
					employeeId,
				},
				orderBy: {
					createdAt: "desc",
				},
				take: 50,
			});
			const timeline = historyRows.map((row: any) => ({
				id: row.id,
				action: row.action,
				scheduleCode:
					row?.afterSchedule?.templateCode ||
					row?.beforeSchedule?.templateCode ||
					"UNKNOWN",
				scheduleName:
					row?.afterSchedule?.templateName ||
					row?.beforeSchedule?.templateName ||
					"Unknown Schedule",
				effectiveDate: row.effectiveAt || row.createdAt,
				changedAt: row.createdAt,
				reason: row.reason || null,
				changedBy: {
					employeeId: row.actorEmployeeId || undefined,
					name: undefined,
				},
				before: row.beforeSchedule || null,
				after: row.afterSchedule || null,
			}));

			logActivity(req, {
				userId: (req as any).user?.id || "unknown",
				action: config.ACTIVITY_LOG.EMPLOYEE.ACTIONS.GET_EMPLOYEE_SCHEDULES,
				description: `${config.ACTIVITY_LOG.EMPLOYEE.DESCRIPTIONS.EMPLOYEE_SCHEDULES_RETRIEVED}: ${targetEmployee.employeeId || employeeId}`,
				page: {
					url: req.originalUrl,
					title: config.ACTIVITY_LOG.EMPLOYEE.PAGES.EMPLOYEE_SCHEDULE,
				},
			});
			const successResponse = buildSuccessResponse(
				"Employee schedules retrieved successfully",
				{
					employeeId,
					activeSchedule: resolveEmployeeActiveSchedule(targetEmployee),
					embeddedSchedule: (targetEmployee as any).embeddedSchedule || null,
					schedules: timeline,
				},
				200,
			);
			res.status(200).json(successResponse);
		} catch (error) {
			employeeLogger.error(`Error getting employee schedules: ${error}`);
			res.status(500).json(
				buildErrorResponse(config.ERROR.COMMON.INTERNAL_SERVER_ERROR, 500),
			);
		}
	};

	const deactivateEmployeeSchedule = async (req: Request, res: Response, _next: NextFunction) => {
		const organizationId = resolveOrganizationIdFromRequest(req);
		const employeeId = String(req.params.id || "").trim();
		if (!organizationId || !employeeId) {
			res.status(400).json(
				buildErrorResponse("organizationId and employee id are required", 400),
			);
			return;
		}

		try {
			const targetEmployee = await prisma.employee.findFirst({
				where: {
					id: employeeId,
					organizationId,
					isDeleted: false,
				},
				select: {
					id: true,
					organizationId: true,
					reportToId: true,
					embeddedSchedule: true,
				},
			});
			if (!targetEmployee) {
				res.status(404).json(buildErrorResponse("Employee not found", 404));
				return;
			}

			const actor = await resolveActor(req, organizationId);
			const permission = await assertCanManageSchedule(
				actor.role,
				organizationId,
				actor.actorEmployeeRecord?.id || null,
				targetEmployee,
			);
			if (!permission.allowed) {
				res.status(403).json(buildErrorResponse(permission.message || "Forbidden", 403));
				return;
			}

			const previousEmbeddedSchedule = targetEmployee.embeddedSchedule || null;
			if (!previousEmbeddedSchedule) {
				res.status(404).json(buildErrorResponse("No active embedded schedule found", 404));
				return;
			}
			await prisma.employee.update({
				where: { id: employeeId },
				data: {
					embeddedSchedule: { unset: true } as any,
				},
			});
			await appendEmployeeScheduleHistory(prisma, {
				organizationId,
				employeeId,
				action: "cleared",
				actorEmployeeId: actor.actorEmployeeRecord?.id || null,
				reason: "Manual schedule clear",
				effectiveAt: new Date(),
				beforeSchedule: previousEmbeddedSchedule,
				afterSchedule: null,
			});
			await invalidateCache.byPattern(`cache:employee:byId:${employeeId}:*`);
			await invalidateCache.byPattern("cache:employee:list:*");
			await invalidateCache.byPattern("cache:scheduleOverride:list:*");
			await invalidateCache.byPattern("cache:attendance:*");
			await invalidateCache.byPattern("cache:timesheet:*");
			await invalidateCache.byPattern("cache:metrics:*");

			logActivity(req, {
				userId: (req as any).user?.id || "unknown",
				action: config.ACTIVITY_LOG.EMPLOYEE.ACTIONS.DEACTIVATE_EMPLOYEE_SCHEDULE,
				description: `${config.ACTIVITY_LOG.EMPLOYEE.DESCRIPTIONS.EMPLOYEE_SCHEDULE_DEACTIVATED}: ${employeeId}`,
				page: {
					url: req.originalUrl,
					title: config.ACTIVITY_LOG.EMPLOYEE.PAGES.EMPLOYEE_SCHEDULE,
				},
			});
			logAudit(req, {
				userId: (req as any).user?.id || "unknown",
				action: config.AUDIT_LOG.ACTIONS.UPDATE,
				resource: config.AUDIT_LOG.RESOURCES.EMPLOYEE,
				severity: config.AUDIT_LOG.SEVERITY.MEDIUM,
				entityType: config.AUDIT_LOG.ENTITY_TYPES.EMPLOYEE,
				entityId: employeeId,
				changesBefore: { embeddedSchedule: previousEmbeddedSchedule },
				changesAfter: { embeddedSchedule: null },
				description: `${config.AUDIT_LOG.EMPLOYEE.DESCRIPTIONS.EMPLOYEE_SCHEDULE_DEACTIVATED}: ${employeeId}`,
				organizationId,
			});

			res.status(200).json(
				buildSuccessResponse(
					"Employee schedule deactivated successfully",
					{ embeddedSchedule: null },
					200,
				),
			);
		} catch (error) {
			employeeLogger.error(`Error deactivating employee schedule: ${error}`);
			res.status(500).json(
				buildErrorResponse(config.ERROR.COMMON.INTERNAL_SERVER_ERROR, 500),
			);
		}
	};

	const getOvertimeFlagThresholdMinutes = async (organizationId: string): Promise<number> => {
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
	};

	const queueEmployeeCreatedAttendanceBackfill = (params: {
		organizationId: string;
		employeeId: string;
		employeeCode?: string | null;
		employmentStartDate?: Date | string | null;
	}) => {
		const run = async () => {
			try {
				const results = await backfillOpenPayrollPeriodAttendanceObligations(prisma, {
					organizationId: params.organizationId,
					employeeId: params.employeeId,
				});
				const timesheet = await ensureCurrentPayrollPeriodDraftTimesheet(prisma, {
					organizationId: params.organizationId,
					employeeId: params.employeeId,
					date: params.employmentStartDate || new Date(),
				});
				await invalidateCache.byPattern("cache:attendance:*");
				await invalidateCache.byPattern("cache:metrics:*");
				await invalidateCache.byPattern("cache:timesheet:*");
				employeeLogger.info(
					`EmployeeCreated attendance/timesheet post-action completed for ${params.employeeCode || params.employeeId}: obligations=${JSON.stringify(results)}, draftTimesheetId=${timesheet?.id || "none"}`,
				);
			} catch (error) {
				employeeLogger.error(
					`EmployeeCreated attendance/timesheet post-action failed for ${params.employeeCode || params.employeeId}: ${error}`,
				);
			}
		};

		setImmediate(() => {
			void run();
		});
	};

	const create = async (req: Request, res: Response, _next: NextFunction) => {
		let requestData = req.body;
		const contentType = req.get("Content-Type") || "";
		const files = ((req as any).documentFiles as Express.Multer.File[] | undefined) || [];

		// Transform form data if needed
		if (
			contentType.includes("application/x-www-form-urlencoded") ||
			contentType.includes("multipart/form-data")
		) {
			// If there's a 'data' field, it means JSON was sent as part of multipart
			if (req.body.data) {
				try {
					requestData = JSON.parse(req.body.data);
					employeeLogger.info("Parsed JSON from multipart data field");
				} catch (error) {
					employeeLogger.error("Failed to parse JSON from data field:", error);
					requestData = transformFormDataToObject(req.body);
				}
			} else {
				requestData = transformFormDataToObject(req.body);
			}

			employeeLogger.info(
				"Transformed form data to object structure:",
				JSON.stringify(requestData, null, 2),
			);

			// Log uploaded files
			if (files.length > 0) {
				employeeLogger.info(`Received ${files.length} file(s) for upload`);
				files.forEach((file, index) => {
					employeeLogger.info(
						`File ${index + 1}: ${file.originalname}, size: ${file.size} bytes`,
					);
				});
			}
		}

		employeeLogger.info(
			`Employee create payload summary: ${JSON.stringify(
				summarizeEmployeeCreatePayloadForLog(requestData, files),
			)}`,
		);

		const createDateValidationErrors = validateEmployeeMutationDatePayload({
			payload: requestData,
			requireDateOfBirth: true,
		});
		if (createDateValidationErrors.length > 0) {
			employeeLogger.error(
				`Employee create date validation failed: ${JSON.stringify(createDateValidationErrors)}`,
			);
			const errorResponse = buildErrorResponse(
				"Validation failed",
				400,
				createDateValidationErrors,
			);
			res.status(400).json(errorResponse);
			return;
		}

		// Validate request data
		const validation = CreateEmployeeWithAccountSchema.safeParse(requestData);
		if (!validation.success) {
			employeeLogger.error(
				"Validation failed. Raw error:",
				JSON.stringify(validation.error.format(), null, 2),
			);
			const formattedErrors = formatZodErrors(validation.error.format());
			const responseErrors = buildEmployeeCreateValidationErrors(formattedErrors);
			employeeLogger.error(
				`Employee create validation failed: ${JSON.stringify({
					errorCount: formattedErrors.length,
					errors: responseErrors,
				})}`,
			);
			const errorResponse = buildErrorResponse("Validation failed", 400, responseErrors);
			res.status(400).json(errorResponse);
			return;
		}

		try {
			const parsedData: z.infer<typeof CreateEmployeeWithAccountSchema> = validation.data;
			const { roleId, person, employee } = parsedData;

			const documentValidationErrors = await validateEmployeeDocumentsAgainstConfiguredTypes({
				prisma,
				organizationId: employee.organizationId,
				documents: employee.documents as any,
			});
			if (documentValidationErrors.length > 0) {
				res.status(400).json(
					buildErrorResponse(
						"Validation failed",
						400,
						limitErrorDetails(
							documentValidationErrors,
							MAX_EMPLOYEE_CREATE_VALIDATION_ERRORS,
						),
					),
				);
				return;
			}

			const sourceApplicantIdFromPayload = String(
				(employee as any)?.metadata?.sourceApplicantId ||
					(employee as any)?.metadata?.applicantId ||
					"",
			).trim();
			let applicantPersonIdForHire: string | null = null;
			if (sourceApplicantIdFromPayload) {
				const sourceApplicant = await prisma.applicant.findFirst({
					where: {
						id: sourceApplicantIdFromPayload,
						organizationId: employee.organizationId,
						isDeleted: false,
					},
					include: { person: true },
				});
				if (!sourceApplicant?.personId || !sourceApplicant.person) {
					res.status(400).json(
						buildErrorResponse(
							"Applicant person record is required before creating the employee profile.",
							400,
							[
								{
									field: "metadata.sourceApplicantId",
									message:
										"This hire must use the person details from the public job application.",
								},
							],
						),
					);
					return;
				}
				applicantPersonIdForHire = sourceApplicant.personId;
				const lockedPerson = lockIncomingPersonToApplicant(person, sourceApplicant.person);
				(person as any).personalInfo = lockedPerson.personalInfo;
				(person as any).contactInfo = lockedPerson.contactInfo;
			}

			employeeLogger.info(
				`Validated employee create data summary: ${JSON.stringify(
					summarizeEmployeeCreatePayloadForLog({ roleId, person, employee }, files),
				)}`,
			);
			employeeLogger.info(`Employee.role value: ${employee.role || "none"}`);

			try {
				const agencyAssignment = await normalizeAndValidateAgencyAssignment(
					prisma,
					employee,
					employee.organizationId,
				);
				(employee as any).workforceSource = agencyAssignment.workforceSource;
				(employee as any).agencyId = agencyAssignment.agencyId;
				if (agencyAssignment.agencyRecord && !(employee as any).employer) {
					(employee as any).employer = {
						name: agencyAssignment.agencyRecord.name,
						tin: "",
						rdoCode: "",
						branchCode: "",
						address: "",
						isVerified: false,
						metadata: {
							source: "agency",
							agencyId: agencyAssignment.agencyRecord.id,
							agencyCode: agencyAssignment.agencyRecord.code,
						},
					};
				}
			} catch (agencyError) {
				res.status(400).json(
					buildErrorResponse(
						agencyError instanceof Error
							? agencyError.message
							: "Invalid agency assignment",
						400,
					),
				);
				return;
			}

			// ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ Role Derivation (centralized) ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬
			// Look up department, level, and position so we can derive the system role.
			if (!employee.departmentId) {
				res.status(400).json(
					buildErrorResponse("Department is required for role derivation", 400),
				);
				return;
			}

			const [deptRecord, levelRecord, positionRecord] = await Promise.all([
				prisma.department.findFirst({
					where: {
						id: employee.departmentId,
						organizationId: employee.organizationId,
					},
				}),
				employee.levelId
					? prisma.level.findFirst({
							where: {
								id: employee.levelId,
								organizationId: employee.organizationId,
							},
						})
					: Promise.resolve({
							name: "none",
							isManager: false,
							isDeleted: false,
							isActive: true,
						} as any),
				employee.positionId
					? prisma.position.findFirst({
							where: {
								id: employee.positionId,
								organizationId: employee.organizationId,
							},
						})
					: Promise.resolve(null),
			]);

			if (!deptRecord) {
				res.status(400).json(
					buildErrorResponse(
						`Department with ID ${employee.departmentId} not found`,
						400,
					),
				);
				return;
			}

			if (employee.sectionId) {
				const sectionRecord = await prisma.section.findFirst({
					where: {
						id: employee.sectionId,
						organizationId: employee.organizationId,
						departmentId: employee.departmentId,
						isDeleted: false,
					},
					select: { id: true },
				});
				if (!sectionRecord) {
					res.status(400).json(
						buildErrorResponse("Section must belong to the selected department", 400),
					);
					return;
				}
			}

			if (!positionRecord) {
				res.status(400).json(
					buildErrorResponse(
						`Position with ID ${employee.positionId} not found`,
						400,
					),
				);
				return;
			}

			if (employee.levelId && !levelRecord) {
				res.status(400).json(
					buildErrorResponse("Level must be a valid level when provided", 400),
				);
				return;
			}

			// ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ Org-ownership validation ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬
			// ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ Optional: block on soft-deleted / inactive records ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬
			if (deptRecord.isDeleted || !deptRecord.isActive) {
				res.status(400).json(
					buildErrorResponse(
						`Department "${deptRecord.name}" is inactive or deleted`,
						400,
					),
				);
				return;
			}

			if (levelRecord && (levelRecord.isDeleted || !levelRecord.isActive)) {
				res.status(400).json(
					buildErrorResponse(`Level "${levelRecord.name}" is inactive or deleted`, 400),
				);
				return;
			}

			if (positionRecord.isDeleted || !positionRecord.isActive) {
				res.status(400).json(
					buildErrorResponse(
						`Position "${positionRecord.title}" is inactive or deleted`,
						400,
					),
				);
				return;
			}

			employeeLogger.info(
				"[ROLE_DERIVATION][SERVER][INPUT]",
				JSON.stringify(
					{
						departmentId: employee.departmentId,
						levelId: employee.levelId,
						positionId: employee.positionId,
						departmentKeys: Object.keys(deptRecord as Record<string, unknown>),
						levelKeys: levelRecord
							? Object.keys(levelRecord as Record<string, unknown>)
							: [],
						positionKeys: Object.keys(positionRecord as Record<string, unknown>),
						departmentIsHr: (deptRecord as any).isHr,
						levelIsManager: (levelRecord as any)?.isManager,
						positionIsManager: (positionRecord as any).isManager,
					},
					null,
					2,
				),
			);

			// ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ Role derivation (uses DB boolean flags ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â never trusts client) ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬
			const derivedFlags = deriveRoleAndFlagsFromRecord(
				deptRecord,
				levelRecord,
				positionRecord,
			);

			// Override flags with derived values -- never trust client-provided flags
			(employee as any).isManager = derivedFlags.isManager;
			(employee as any).isHrManager = derivedFlags.isHrManager;
			(employee as any).role = derivedFlags.role; // override with derived role name

			employeeLogger.info(
				`Role derived: dept="${deptRecord.name}" level="${levelRecord.name}" -> role="${derivedFlags.role}" isManager=${derivedFlags.isManager} isHrManager=${derivedFlags.isHrManager}`,
			);
			// ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬

			// Step 1: Check for duplicates
			employeeLogger.info("Checking for duplicate person");
			await helpers.checkForDuplicatePerson(person);

			employeeLogger.info("Checking for duplicate employee ID");
			await helpers.checkForDuplicateEmployeeId(employee);

			let createdPerson: any = null;
			let createdEmployee: any = null;

			// Step 2-3: Create person and employee atomically
			employeeLogger.info(
				"Creating person and employee atomically in a single database transaction",
			);
			if (applicantPersonIdForHire) {
				const existingEmployeeForApplicant = await prisma.employee.findFirst({
					where: {
						personId: applicantPersonIdForHire,
						organizationId: employee.organizationId,
						isDeleted: false,
					},
					select: { id: true, employeeId: true },
				});
				if (existingEmployeeForApplicant) {
					res.status(409).json(
						buildErrorResponse(
							"This applicant already has an employee record",
							409,
							[
								{
									field: "metadata.sourceApplicantId",
									message: `Applicant is already linked to employee ${existingEmployeeForApplicant.employeeId}.`,
								},
							],
						),
					);
					return;
				}

				createdPerson = await prisma.person.update({
					where: { id: applicantPersonIdForHire },
					data: {
						personalInfo: person.personalInfo as any,
						contactInfo: person.contactInfo as any,
						...(person.identification
							? { identification: person.identification as any }
							: {}),
						organizationId: employee.organizationId,
					},
				});
				createdEmployee = await helpers.createEmployeeInTransaction(
					employee,
					applicantPersonIdForHire,
				);
			} else {
				const creationResult = await helpers.createPersonAndEmployeeInTransaction(
					person,
					employee,
				);
				createdPerson = creationResult.person;
				createdEmployee = creationResult.employee;
			}
			const personId = createdPerson.id;
			employeeLogger.info(
				`Atomic employee creation succeeded with personId=${personId} employeeId=${createdEmployee.id}`,
			);

			// Step 4: Build employee metadata
			employeeLogger.info("Building employee metadata");
			const employeeMetadata = helpers.buildEmployeeMetadata(createdEmployee, person);

			// Step 5: Generate user credentials
			let credentials;
			try {
				credentials = helpers.generateUserCredentials(person, employee);
			} catch (credError) {
				helpers.handleCreateEmployeeError(credError, res);
				return;
			}

			const { email, userName, password, organizationId } = credentials;
			const defaultAvatar =
				"https://res.cloudinary.com/dmhxygxg9/image/upload/v1764813409/Profile_Avatar_uu9uqd.png";

			// Step 6: Create user account via auth service
			const userPayload = {
				email,
				userName,
				password,
				avatar: defaultAvatar,
				status: "active",
				loginMethod: "email",
				role: derivedFlags.role,
				roleId,
				organizationId,
				personId,
				metadata: {
					employee: employeeMetadata,
					requirePasswordChange: true, // Force password change on first login
				},
			};

			employeeLogger.info(
				"Creating user account via auth service with metadata:",
				JSON.stringify(userPayload, null, 2),
			);

			let userId: string;
			let roleName: string | null;
			try {
				const userResult = await helpers.createUserAccount(userPayload, req);
				userId = userResult.userId;
				roleName = userResult.roleName;
			} catch (userError) {
				await helpers.rollbackLocalEmployeeCreation(createdEmployee?.id, createdPerson?.id);
				helpers.handleCreateEmployeeError(userError, res);
				return;
			}

			// Step 7: Update employee with userId and role
			// Role persisted on employee is always derived from department + level.
			const finalRoleName = derivedFlags.role;

			// Soft-validate that auth service returned the expected derived role
			if (roleName && roleName !== derivedFlags.role) {
				employeeLogger.warn(
					`Role mismatch: auth service returned "${roleName}" but derived role is "${derivedFlags.role}". Using derived role for employee record.`,
				);
			}

			let updatedEmployee = await helpers.updateEmployeeWithUserId(
				createdEmployee.id,
				userId,
				finalRoleName,
				{ isManager: derivedFlags.isManager, isHrManager: derivedFlags.isHrManager },
			);

			// Step 7.5: Patch user metadata with employee information (sync to auth service)
			try {
				await helpers.syncUserMetadataFromEmployee(userId, updatedEmployee.id, req);
				employeeLogger.info(`User metadata patched successfully for userId: ${userId}`);
			} catch (metadataError) {
				employeeLogger.warn(
					`Failed to patch user metadata (non-critical): ${metadataError}`,
				);
				// Don't throw - metadata patching is non-critical
			}

			// Step 8: Log activity and audit
			helpers.logEmployeeCreation(req, updatedEmployee);

			// Step 8.5: Create birthday calendar item
			const personName =
				`${person.personalInfo?.firstName || ""} ${person.personalInfo?.lastName || ""}`.trim();
			await helpers.createOrUpdateBirthdayCalendarItem(
				updatedEmployee.id,
				organizationId,
				person.personalInfo?.dateOfBirth,
				personName,
			);

			const sourceApplicantId = String(
				(employee as any)?.metadata?.sourceApplicantId ||
					(employee as any)?.metadata?.applicantId ||
					"",
			).trim();
			if (sourceApplicantId) {
				const applicant = await prisma.applicant.findFirst({
					where: {
						id: sourceApplicantId,
						organizationId,
						isDeleted: false,
					},
					select: {
						id: true,
						convertedToEmployeeId: true,
						workflowInstanceId: true,
						currentWorkflowStateKey: true,
					},
				});

				if (
					applicant &&
					!applicant.convertedToEmployeeId &&
					(!applicantPersonIdForHire ||
						applicantPersonIdForHire === updatedEmployee.personId)
				) {
					await prisma.applicant.update({
						where: { id: applicant.id },
						data: { convertedToEmployeeId: updatedEmployee.id },
					});
					await prisma.recruitmentActivity.create({
						data: {
							organizationId,
							applicantId: applicant.id,
							workflowInstanceId: applicant.workflowInstanceId ?? null,
							stepExecutionId: null,
							stateKey: applicant.currentWorkflowStateKey ?? null,
							type: "SYSTEM_EVENT",
							title: "Employee record created from Add Employee",
							details: {
								employeeRecordId: updatedEmployee.id,
								employeeCode: updatedEmployee.employeeId,
								source: "hr_add_employee_deeplink",
							},
						},
					});
				}
			}

			// Step 8.6: Handle file uploads if present
			if (files.length > 0) {
				employeeLogger.info(`Processing ${files.length} document file(s)`);
				const { uploadToCloudinary } = require("../../helper/cloudinary.helper");

				// Get document types from request
				const documentTypes = req.body.documentTypes
					? Array.isArray(req.body.documentTypes)
						? req.body.documentTypes
						: [req.body.documentTypes]
					: [];

				employeeLogger.info("Document types:", documentTypes);

				const organizationIdForDocumentUpload =
					updatedEmployee.organizationId ||
					req.body?.employee?.organizationId ||
					req.body?.organizationId ||
					null;

				const documentTypeRecords = organizationIdForDocumentUpload
					? await prisma.documentType.findMany({
							where: {
								organizationId: organizationIdForDocumentUpload,
								isDeleted: false,
							},
							select: { id: true, code: true, name: true },
						})
					: [];

				// Get current related documents for this employee
				const existingDocuments = await prisma.document.findMany({
					where: {
						employeeId: updatedEmployee.id,
						isDeleted: false,
					},
				});

				// Upload each file and collect file URLs
				for (let i = 0; i < files.length; i++) {
					const file = files[i];
					const docType = documentTypes[i] || `Document_${i + 1}`;
					const matchedDocumentType =
						documentTypeRecords.find(
							(item: any) => item.id === docType || item.code === docType,
						) || null;

					try {
						employeeLogger.info(`Uploading ${docType} document to Cloudinary`);

						const uploadResult = await uploadToCloudinary(file.buffer, {
							folder: `hris/employees/${updatedEmployee.employeeId}/documents`,
							resourceType: "auto",
						});

						if (!uploadResult || !uploadResult.secureUrl) {
							employeeLogger.error(
								`Failed to upload ${docType} document to Cloudinary`,
							);
							continue;
						}

						const fileUrl = uploadResult.secureUrl;
						const fileExt =
							uploadResult.format || file.originalname?.split(".").pop() || "jpg";
						employeeLogger.info(`${docType} document uploaded: ${fileUrl}`);

						// Find and update the corresponding document with the file URL
						const targetDocument = existingDocuments.find((doc: any) => {
							if (
								matchedDocumentType?.id &&
								doc.documentTypeId === matchedDocumentType.id
							) {
								return true;
							}
							return doc.type === docType;
						});

						if (targetDocument) {
							await prisma.document.update({
								where: { id: targetDocument.id },
								data: {
									fileUrl,
									ext: fileExt,
									documentTypeId:
										matchedDocumentType?.id || targetDocument.documentTypeId,
									type: matchedDocumentType?.code || targetDocument.type,
									name:
										targetDocument.name || matchedDocumentType?.name || docType,
								},
							});
							employeeLogger.info(
								`Marked ${docType} document for update with fileUrl`,
							);
						} else {
							await prisma.document.create({
								data: {
									employeeId: updatedEmployee.id,
									name: matchedDocumentType?.name || docType,
									type: matchedDocumentType?.code || docType,
									documentTypeId: matchedDocumentType?.id || null,
									number: "",
									issueDate: new Date(),
									expiryDate: null,
									fileUrl,
									ext: fileExt,
									isDeleted: false,
								},
							});
						}
					} catch (uploadError) {
						employeeLogger.error(`Error uploading ${docType} document:`, uploadError);
						// Continue with other files even if one fails
					}
				}

				updatedEmployee = await prisma.employee.findUnique({
					where: { id: updatedEmployee.id },
					include: {
						person: true,
						documents: {
							where: { isDeleted: false },
						},
						department: {
							select: {
								id: true,
								name: true,
								code: true,
								description: true,
							},
						},
						position: {
							select: {
								id: true,
								title: true,
								code: true,
							},
						},
						level: {
							select: {
								id: true,
								name: true,
								rank: true,
							},
						},
						reportTo: {
							select: {
								id: true,
								employeeId: true,
								person: {
									select: {
										personalInfo: true,
									},
								},
							},
						},
					},
				});
				employeeLogger.info(`Updated employee with ${files.length} document file URLs`);
			}

			const templateBoard = await prisma.boardingTemplate.findFirst({
				where: {
					role: updatedEmployee.role || undefined,
					type: "ONBOARDING",
					isActive: true,
					isDeleted: false,
				},
				include: {
					items: {
						where: {
							isDeleted: false,
						},
						orderBy: {
							order: "asc",
						},
					},
				},
			});

			const pendingDocumentChecklistCandidates =
				await getPendingActiveDocumentChecklistCandidates({
					prisma,
					organizationId,
					employeeId: updatedEmployee.id,
				});

			// Determine if we should create a boarding process
			const hasTemplateItems =
				templateBoard && templateBoard.items && templateBoard.items.length > 0;
			const hasPendingDocumentTasks = pendingDocumentChecklistCandidates.length > 0;

			if (templateBoard || hasPendingDocumentTasks) {
				const targetDate = employee.employmentHireDate
					? new Date(employee.employmentHireDate)
					: new Date();

				// Prepare process data
				const boardingProcessData: any = {
					organizationId: organizationId,
					employeeId: updatedEmployee.id,
					departmentId: employee.departmentId,
					type: "ONBOARDING", // Always ONBOARDING
					status: "NOT_STARTED",
					startDate: new Date(),
					targetDate: targetDate,
					metadata: {},
				};

				if (templateBoard) {
					employeeLogger.info(
						`Found boarding template: ${templateBoard.name} for role ${updatedEmployee.role}`,
					);
					boardingProcessData.metadata = {
						templateId: templateBoard.id,
						templateName: templateBoard.name,
					};
					// Use template type if matches (should be ONBOARDING)
					boardingProcessData.type = templateBoard.type;
				} else {
					employeeLogger.info(
						`No boarding template found. Creating process based on skipped active documents.`,
					);
					boardingProcessData.metadata = {
						generatedFromSkippedDocuments: true,
					};
				}

				const boardingProcess = await prisma.boardingProcess.create({
					data: boardingProcessData,
				});

				employeeLogger.info(`Created boarding process with ID: ${boardingProcess.id}`);

				const checklistItemsData: any[] = [];
				let currentOrder = 1;

				// 1. Add items from template if exists
				if (hasTemplateItems) {
					employeeLogger.info(
						`Adding ${templateBoard.items.length} checklist items from template`,
					);
					const templateItems = templateBoard.items.map((item) => {
						// Use onboarding start date as the baseline for task deadlines
						// so newly created onboarding items are not backdated.
						const dueDate = new Date(boardingProcess.startDate);
						dueDate.setDate(dueDate.getDate() + item.dueOffset);

						// Update current order based on template items
						if (item.order >= currentOrder) {
							currentOrder = item.order + 1;
						}

						return {
							organizationId: organizationId,
							processId: boardingProcess.id,
							title: item.title,
							description: item.description,
							category: item.category,
							status: "PENDING" as const,
							priority: item.priority,
							dueDate: dueDate,
							order: item.order,
							metadata: item.metadata || {},
						};
					});
					checklistItemsData.push(...templateItems);
				}

				// Bulk create all items
				if (checklistItemsData.length > 0) {
					await prisma.checklistItem.createMany({
						data: checklistItemsData,
					});
					employeeLogger.info(
						`Successfully created ${checklistItemsData.length} total checklist items for boarding process`,
					);
				}

				await createDocumentChecklistItems({
					prisma,
					organizationId,
					employeeId: updatedEmployee.id,
					processId: boardingProcess.id,
					targetDate,
				});
			} else {
				employeeLogger.info(
					`No boarding template found and no skipped active documents. Skipping boarding process creation.`,
				);

				if (hasPendingDocumentTasks) {
					employeeLogger.info(
						`No template found, but found ${pendingDocumentChecklistCandidates.length} skipped active document tasks. Creating boarding process.`,
					);

					const targetDate = employee.employmentHireDate
						? new Date(employee.employmentHireDate)
						: new Date();

					const boardingProcess = await prisma.boardingProcess.create({
						data: {
							organizationId: organizationId,
							employeeId: updatedEmployee.id,
							departmentId: employee.departmentId,
							type: "ONBOARDING", // Default to onboarding
							status: "NOT_STARTED",
							startDate: new Date(),
							targetDate: targetDate,
							metadata: {
								generatedFromSkippedDocuments: true,
							},
						},
					});

					await createDocumentChecklistItems({
						prisma,
						organizationId,
						employeeId: updatedEmployee.id,
						processId: boardingProcess.id,
						targetDate,
					});

					employeeLogger.info(
						`Created boarding process ${boardingProcess.id} with skipped active document items via helper`,
					);
				}
			}

			// Step 9: EmployeeCreated attendance post-action.
			// Employee/person/account creation is the blocking source-of-truth write. Attendance
			// obligations can be projected immediately after the response; they are idempotent and
			// also repairable by existing period/timesheet ensure paths.
			queueEmployeeCreatedAttendanceBackfill({
				organizationId,
				employeeId: updatedEmployee.id,
				employeeCode: updatedEmployee.employeeId,
				employmentStartDate: updatedEmployee.employmentStartDate || updatedEmployee.employmentHireDate,
			});
			await helpers.invalidateEmployeeCaches();
			employeeLogger.info("Cache invalidated after employee creation with account");

			// Step 10: Return success response
			const successResponse = buildSuccessResponse(
				"Employee created successfully with user account",
				{
					employee: updatedEmployee,
					person: createdPerson,
					user: {
						personId,
						userId,
						email,
						userName,
						status: "active",
						loginMethod: "email",
						roleId,
					},
				},
				201,
			);
			res.status(201).json(successResponse);
		} catch (error) {
			helpers.handleCreateEmployeeError(error, res);
		}
	};

	const getAll = async (req: Request, res: Response, _next: NextFunction) => {
		const validationResult = validateQueryParams(req, employeeLogger);

		if (!validationResult.isValid) {
			res.status(400).json(validationResult.errorResponse);
			return;
		}

		const {
			page,
			limit,
			order,
			fields,
			sort,
			skip,
			query,
			document,
			pagination,
			count,
			filter,
			groupBy,
			aggregateBy,
			countBy,
		} = validationResult.validatedParams!;

		employeeLogger.info(
			`Getting employees, page: ${page}, limit: ${limit}, query: ${query}, order: ${order}, groupBy: ${groupBy}`,
		);

		try {
			const rawEmployeeFields = typeof fields === "string" ? fields : undefined;
			const includeDerivedSchedules = fieldSelectionIncludesRoot(
				rawEmployeeFields,
				"schedules",
			);
			const employeeFieldsForValidation = stripFieldSelectionRoot(
				rawEmployeeFields,
				"schedules",
			);
			const { normalizedFields: normalizedEmployeeFields, errors: employeeFieldErrors } =
				normalizeAndValidateFieldSelection(
					"Employee",
					employeeFieldsForValidation,
					EMPLOYEE_FIELD_ALIASES,
					{
						derivedRoots: ["activeSchedule"],
					},
				);
			if (employeeFieldErrors.length > 0) {
				res.status(400).json(
					buildErrorResponse("Invalid fields parameter", 400, [
						{ field: "fields", message: employeeFieldErrors.join(" ") },
					]),
				);
				return;
			}

			// Base where clause
			const whereClause: Prisma.EmployeeWhereInput = {
				isDeleted: false,
			};

			// Handle search query - simple contains search across fields
			// Handle search query - split into terms for multi-word support across fields
			if (query) {
				const terms = query
					.trim()
					.split(/\s+/)
					.filter((t) => t.length > 0);
				if (terms.length > 0) {
					// If there's already an AND array (e.g., from filters later), we'll append; otherwise initialize
					whereClause.AND = terms.map((term) => ({
						OR: [
							{ employeeId: { contains: term, mode: "insensitive" } },
							{
								person: {
									is: {
										personalInfo: {
											path: ["firstName"],
											string_contains: term,
											mode: "insensitive",
										},
									},
								},
							},
							{
								person: {
									is: {
										personalInfo: {
											path: ["lastName"],
											string_contains: term,
											mode: "insensitive",
										},
									},
								},
							},
							{
								person: {
									is: {
										contactInfo: {
											path: ["email"],
											string_contains: term,
											mode: "insensitive",
										},
									},
								},
							},
						],
					}));
				}
			}
			if (filter) {
				console.log("Filter param:", filter);
				const filterConditions = buildFilterConditions("Employee", filter);
				if (filterConditions.length > 0) {
					Object.assign(whereClause, appendAndConditions(whereClause, filterConditions));
				}
			}
			const findManyQuery = buildFindManyQuery(
				whereClause,
				skip,
				limit,
				order,
				sort,
				normalizedEmployeeFields,
				aggregateBy,
				countBy,
				undefined,
				EMPLOYEE_FIELD_ALIASES,
				"Employee",
			);
			const findManyQueryAny = findManyQuery as any;
			if (findManyQueryAny.select) {
				applyEmployeeDocumentSelectionDefaults(findManyQueryAny.select);
				applyEmployeeBenefitSelectionDefaults(findManyQueryAny.select);
			}
			if (document) {
				if (findManyQueryAny.select) {
					findManyQueryAny.select.agency = {
						select: { id: true, name: true, code: true },
					};
				} else {
					findManyQueryAny.include = {
						...(findManyQueryAny.include || {}),
						agency: { select: { id: true, name: true, code: true } },
					};
				}
			}

			// Ensure required fields are present for attendance-based absence computation
			if (aggregateBy === "attendances" && countBy === "status") {
				if (findManyQuery.select) {
					// Include embedded schedule for absence computation
					findManyQuery.select.embeddedSchedule = true;
					findManyQuery.select.employmentHireDate = true;
					findManyQuery.select.employmentTerminationDate = true;
				}
			}
			if (includeDerivedSchedules && findManyQuery.select) {
				findManyQuery.select.embeddedSchedule = true;
			}

			let employees = [] as any[];
			const [fetched, total] = await Promise.all([
				document ? prisma.employee.findMany(findManyQuery) : Promise.resolve([]),
				// Calculate total when pagination is enabled (needs it) OR when count is explicitly requested
				pagination || count
					? prisma.employee.count({ where: whereClause })
					: Promise.resolve(0),
			]);
			employees = fetched as any[];

			// Enrich each employee with user data from auth service when available
			if (document && employees.length > 0) {
				const employeeIds = employees
					.map((employee: any) => String(employee?.id || "").trim())
					.filter(Boolean);
				const directReportRows =
					employeeIds.length > 0
						? await prisma.employee.findMany({
								where: {
									reportToId: { in: employeeIds },
									isDeleted: false,
								},
								select: { reportToId: true },
							})
						: [];
				const managerIdsWithReports = new Set(
					directReportRows
						.map((employee) => String(employee.reportToId || "").trim())
						.filter(Boolean),
				);

				await helpers.enrichEmployeesWithUserData(employees, req);
				employees = employees.map((employee: any) => ({
					...employee,
					isManager:
						Boolean(employee.isManager) ||
						String(employee.role || "")
							.trim()
							.toLowerCase() === "hris-employee-manager" ||
						managerIdsWithReports.has(String(employee.id || "")) ||
						Boolean(employee.level?.isManager) ||
						(!!employee.department?.managerId &&
							employee.department.managerId === employee.id),
					activeSchedule: resolveEmployeeActiveSchedule(employee),
					...(includeDerivedSchedules
						? { schedules: normalizeEmployeeSchedules(employee) }
						: {}),
					agency:
						employee.agency && employee.workforceSource === "AGENCY"
							? {
									id: employee.agency.id,
									name: employee.agency.name,
									code: employee.agency.code,
								}
							: null,
					agencyId: employee.agencyId || null,
				}));
			}

			// Process grouped counts if countBy is specified
			if (countBy && aggregateBy) {
				// Define default values based on the relation and field being counted
				let defaultValues: string[] | undefined;

				// For attendance status, include all possible values
				if (aggregateBy === "attendances" && countBy === "status") {
					// Include ABSENT so clients always receive an explicit zero when no records exist
					defaultValues = ["PRESENT", "LEAVE", "ABSENT"];
				}
				// Add more mappings here as needed for other relations/fields

				employees = processGroupedCounts(employees, aggregateBy, countBy, defaultValues);
			}

			employeeLogger.info(`Retrieved ${employees.length} employees`);
			const processedData =
				groupBy && document ? groupDataByField(employees, groupBy as string) : employees;

			const responseData: Record<string, any> = {
				...(document && { employees: processedData }),
				...(count && { count: total }),
				...(pagination && { pagination: buildPagination(total, page, limit) }),
				...(groupBy && { groupedBy: groupBy }),
			};

			logActivity(req, {
				userId: (req as any).user?.id || "unknown",
				action: config.ACTIVITY_LOG.EMPLOYEE.ACTIONS.GET_ALL_EMPLOYEE,
				description: config.ACTIVITY_LOG.EMPLOYEE.DESCRIPTIONS.EMPLOYEES_RETRIEVED,
				page: {
					url: req.originalUrl,
					title: config.ACTIVITY_LOG.EMPLOYEE.PAGES.EMPLOYEE_LIST,
				},
			});

			res.status(200).json(
				buildSuccessResponse(config.SUCCESS.EMPLOYEE.RETRIEVED_ALL, responseData, 200),
			);
		} catch (error) {
			employeeLogger.error(`${config.ERROR.EMPLOYEE.GET_ALL_FAILED}: ${error}`);
			res.status(500).json(
				buildErrorResponse(config.ERROR.COMMON.INTERNAL_SERVER_ERROR, 500),
			);
		}
	};

	const getById = async (req: Request, res: Response, _next: NextFunction) => {
		const { id } = req.params;
		const { fields } = req.query;

		try {
			if (!id) {
				employeeLogger.error(config.ERROR.QUERY_PARAMS.MISSING_ID);
				const errorResponse = buildErrorResponse(config.ERROR.QUERY_PARAMS.MISSING_ID, 400);
				res.status(400).json(errorResponse);
				return;
			}

			if (fields && typeof fields !== "string") {
				employeeLogger.error(`${config.ERROR.QUERY_PARAMS.INVALID_POPULATE}: ${fields}`);
				const errorResponse = buildErrorResponse(
					config.ERROR.QUERY_PARAMS.POPULATE_MUST_BE_STRING,
					400,
				);
				res.status(400).json(errorResponse);
				return;
			}

			employeeLogger.info(`${config.SUCCESS.EMPLOYEE.GETTING_BY_ID}: ${id}`);
			const rawEmployeeFields = typeof fields === "string" ? fields : undefined;
			const includeDerivedSchedules = fieldSelectionIncludesRoot(
				rawEmployeeFields,
				"schedules",
			);
			const employeeFieldsForValidation = stripFieldSelectionRoot(
				rawEmployeeFields,
				"schedules",
			);
			const { normalizedFields: normalizedEmployeeFields, errors: employeeFieldErrors } =
				normalizeAndValidateFieldSelection(
					"Employee",
					employeeFieldsForValidation,
					EMPLOYEE_FIELD_ALIASES,
					{
						derivedRoots: ["activeSchedule"],
					},
				);
			if (employeeFieldErrors.length > 0) {
				res.status(400).json(
					buildErrorResponse("Invalid fields parameter", 400, [
						{ field: "fields", message: employeeFieldErrors.join(" ") },
					]),
				);
				return;
			}

			const cacheKey = `cache:employee:byId:${id}:${normalizedEmployeeFields || "full"}:${includeDerivedSchedules ? "withSchedules" : "base"}`;
			let employee = null;

			try {
				if (redisClient.isClientConnected()) {
					employee = await redisClient.getJSON(cacheKey);
					if (employee) {
						employeeLogger.info(`Employee ${id} retrieved from direct Redis cache`);
					}
				}
			} catch (cacheError) {
				employeeLogger.warn(`Redis cache retrieval failed for employee ${id}:`, cacheError);
			}

			if (!employee) {
				const query: Prisma.EmployeeFindFirstArgs = {
					where: { id },
				};

				// If fields parameter is provided, use it; otherwise, include related entities by default
				const fieldSelections = getNestedFields(
					normalizedEmployeeFields,
					EMPLOYEE_FIELD_ALIASES,
					"Employee",
				);
				if (fieldSelections) {
					applyEmployeeDocumentSelectionDefaults(fieldSelections);
					applyEmployeeBenefitSelectionDefaults(fieldSelections);
					if (includeDerivedSchedules) {
						fieldSelections.embeddedSchedule = true;
					}
					query.select = fieldSelections;
				} else {
					// Default includes for employee
					// Note: schedule is embedded, no need to include as relation
					query.include = {
						person: true,
						department: true,
						section: true,
						position: true,
						level: true,
						agency: {
							select: {
								id: true,
								name: true,
								code: true,
							},
						},
						reportTo: {
							select: {
								id: true,
								employeeId: true,
								person: {
									select: {
										personalInfo: true,
										contactInfo: true,
									},
								},
							},
						},
					};
				}

				employee = await prisma.employee.findFirst(query);

				// Enrich with user data from auth service if available
				const userId = (employee as any)?.userId;
				if (userId) {
					const userData = await helpers.fetchUserDataFromAuthService(userId, req);
					if (userData) {
						(employee as any).user = userData;
					}
				}

				if (employee && redisClient.isClientConnected()) {
					try {
						await redisClient.setJSON(cacheKey, employee, 3600);
						employeeLogger.info(`Employee ${id} stored in direct Redis cache`);
					} catch (cacheError) {
						employeeLogger.warn(
							`Failed to store employee ${id} in Redis cache:`,
							cacheError,
						);
					}
				}
			}

			if (!employee) {
				employeeLogger.error(`${config.ERROR.EMPLOYEE.NOT_FOUND}: ${id}`);
				const errorResponse = buildErrorResponse(config.ERROR.EMPLOYEE.NOT_FOUND, 404);
				res.status(404).json(errorResponse);
				return;
			}

			if ((employee as any).workforceSource === "AGENCY") {
				(employee as any).agencyId =
					(employee as any).agencyId || (employee as any).agency?.id;
				(employee as any).agency = (employee as any).agency
					? {
							id: (employee as any).agency.id,
							name: (employee as any).agency.name,
							code: (employee as any).agency.code,
						}
					: null;
			}
			(employee as any).activeSchedule = resolveEmployeeActiveSchedule(employee);
			if (includeDerivedSchedules) {
				(employee as any).schedules = normalizeEmployeeSchedules(employee);
			}

			employeeLogger.info(`${config.SUCCESS.EMPLOYEE.RETRIEVED}: ${(employee as any).id}`);
			logActivity(req, {
				userId: (req as any).user?.id || "unknown",
				action: config.ACTIVITY_LOG.EMPLOYEE.ACTIONS.GET_EMPLOYEE,
				description: `${config.ACTIVITY_LOG.EMPLOYEE.DESCRIPTIONS.EMPLOYEE_RETRIEVED}: ${(employee as any).employeeId || id}`,
				page: {
					url: req.originalUrl,
					title: config.ACTIVITY_LOG.EMPLOYEE.PAGES.EMPLOYEE_DETAILS,
				},
			});
			const successResponse = buildSuccessResponse(
				config.SUCCESS.EMPLOYEE.RETRIEVED,
				employee,
				200,
			);
			res.status(200).json(successResponse);
		} catch (error) {
			employeeLogger.error(`${config.ERROR.EMPLOYEE.ERROR_GETTING}: ${error}`);
			const errorResponse = buildErrorResponse(
				config.ERROR.COMMON.INTERNAL_SERVER_ERROR,
				500,
			);
			res.status(500).json(errorResponse);
		}
	};

	const update = async (req: Request, res: Response, _next: NextFunction) => {
		const { id } = req.params;
		let requestData = req.body;
		const contentType = req.get("Content-Type") || "";
		const files = ((req as any).documentFiles as Express.Multer.File[] | undefined) || [];
		const avatarFile = ((req as any).avatarFile as Express.Multer.File | null) || null;

		// Handle form data transformation
		if (
			contentType.includes("application/x-www-form-urlencoded") ||
			contentType.includes("multipart/form-data")
		) {
			employeeLogger.info("Original form data:", JSON.stringify(req.body, null, 2));

			// If there's a 'data' field, it means JSON was sent as part of multipart
			if (req.body.data) {
				try {
					requestData = JSON.parse(req.body.data);
					employeeLogger.info("Parsed JSON from multipart data field");
				} catch (error) {
					employeeLogger.error("Failed to parse JSON from data field:", error);
					requestData = transformFormDataToObject(req.body);
				}
			} else {
				requestData = transformFormDataToObject(req.body);
			}

			employeeLogger.info(
				"Transformed form data to object structure:",
				JSON.stringify(requestData, null, 2),
			);

			// Log uploaded files
			if (files.length > 0 || avatarFile) {
				employeeLogger.info(`Received ${files.length} file(s) for update`);
				files.forEach((file, index) => {
					employeeLogger.info(
						`File ${index + 1}: ${file.originalname}, size: ${file.size} bytes`,
					);
				});
				if (avatarFile) {
					employeeLogger.info(
						`Avatar file: ${avatarFile.originalname}, size: ${avatarFile.size} bytes`,
					);
				}
			}
		}

		try {
			if (!id) {
				employeeLogger.error(config.ERROR.QUERY_PARAMS.MISSING_ID);
				const errorResponse = buildErrorResponse(config.ERROR.QUERY_PARAMS.MISSING_ID, 400);
				res.status(400).json(errorResponse);
				return;
			}

			// Check if this is a composite update (user, person, employee) or simple employee update
			const isCompositeUpdate =
				requestData.user !== undefined ||
				requestData.person !== undefined ||
				(requestData.employee !== undefined && Object.keys(requestData).length === 1);

			let validationResult;
			if (isCompositeUpdate) {
				// Validate composite update schema
				validationResult = UpdateEmployeeWithAccountSchema.safeParse(requestData);
			} else {
				// Validate simple employee update schema
				validationResult = UpdateEmployeeSchema.safeParse(requestData);
			}

			if (!validationResult.success) {
				const formattedErrors = formatZodErrors(validationResult.error.format());
				employeeLogger.error(`Validation failed: ${JSON.stringify(formattedErrors)}`);
				const errorResponse = buildErrorResponse("Validation failed", 400, formattedErrors);
				res.status(400).json(errorResponse);
				return;
			}

			const hasUploadedFiles = files.length > 0 || Boolean(avatarFile);
			if (Object.keys(requestData).length === 0 && !hasUploadedFiles) {
				employeeLogger.error(config.ERROR.COMMON.NO_UPDATE_FIELDS);
				const errorResponse = buildErrorResponse(config.ERROR.COMMON.NO_UPDATE_FIELDS, 400);
				res.status(400).json(errorResponse);
				return;
			}

			employeeLogger.info(`Updating employee: ${id}`);

			// Get existing employee to extract personId and userId
			const existingEmployee = await prisma.employee.findFirst({
				where: { id },
				include: {
					person: true,
				},
			});

			if (!existingEmployee) {
				employeeLogger.error(`${config.ERROR.EMPLOYEE.NOT_FOUND}: ${id}`);
				const errorResponse = buildErrorResponse(config.ERROR.EMPLOYEE.NOT_FOUND, 404);
				res.status(404).json(errorResponse);
				return;
			}

			const personId = existingEmployee.personId;
			const userId = existingEmployee.userId;
			let uploadedAvatarUrl: string | null = null;

			const updateDocumentPayload = isCompositeUpdate
				? requestData.employee?.documents
				: requestData.documents;
			const documentValidationErrors = await validateEmployeeDocumentsAgainstConfiguredTypes({
				prisma,
				organizationId: existingEmployee.organizationId,
				documents: updateDocumentPayload,
			});
			if (documentValidationErrors.length > 0) {
				res.status(400).json(
					buildErrorResponse("Validation failed", 400, documentValidationErrors),
				);
				return;
			}

			if (avatarFile && userId) {
				const avatarUploadResult = await uploadEmployeeAvatarFile({
					file: avatarFile,
					employeeIdentifier: existingEmployee.employeeId || id,
				});

				if (!avatarUploadResult?.success || !avatarUploadResult?.secureUrl) {
					employeeLogger.warn(
						"Avatar upload failed during employee update; continuing without avatar",
						{
							employeeId: id,
							userId,
							fileName: avatarFile.originalname,
							fileSize: avatarFile.size,
							uploadResult: avatarUploadResult || null,
						},
					);
				} else {
					uploadedAvatarUrl = avatarUploadResult.secureUrl;
				}
			}

			// Handle composite update
			if (isCompositeUpdate) {
				const compositeData = validationResult.data as {
					user?: z.infer<typeof UpdateUserSchema>;
					person?: z.infer<typeof UpdatePersonSchema>;
					employee?: z.infer<typeof UpdateEmployeeSchema>;
				};
				const { user, person, employee } = compositeData;

				// Step 1: Update person if provided
				if (person && personId) {
					employeeLogger.info(
						`Updating person: ${personId}`,
						JSON.stringify(person, null, 2),
					);
					const personValidation = UpdatePersonSchema.partial().safeParse(person);
					if (personValidation.success) {
						try {
							await prisma.person.update({
								where: { id: personId },
								data: personValidation.data,
							});
							employeeLogger.info(`Person updated successfully: ${personId}`);

							// Update user metadata if person info changed (affects personalInfo in metadata)
							if (userId && existingEmployee) {
								employeeLogger.info("Updating user metadata after person update");
								await helpers.updateUserMetadata(userId, existingEmployee.id, req);
							}

							// Check if date of birth was updated and update birthday calendar item
							if (personValidation.data.personalInfo) {
								const personalInfo = personValidation.data.personalInfo as any;
								if (personalInfo.dateOfBirth !== undefined) {
									employeeLogger.info(
										`Date of birth changed, updating birthday calendar item for employee ${id}`,
									);
									const updatedPerson = await prisma.person.findUnique({
										where: { id: personId },
										select: { personalInfo: true },
									});
									const personInfo = updatedPerson?.personalInfo as any;
									const firstName = personInfo?.firstName || "";
									const lastName = personInfo?.lastName || "";
									const personName = `${firstName} ${lastName}`.trim();

									await helpers.createOrUpdateBirthdayCalendarItem(
										id,
										existingEmployee.organizationId,
										personalInfo.dateOfBirth,
										personName,
									);
								}
							}
						} catch (personError) {
							employeeLogger.error(`Error updating person ${personId}:`, personError);
							throw personError;
						}
					} else {
						employeeLogger.error(
							`Person validation failed:`,
							JSON.stringify(personValidation.error.format(), null, 2),
						);
						const formattedErrors = formatZodErrors(personValidation.error.format());
						const errorResponse = buildErrorResponse(
							"Person validation failed",
							400,
							formattedErrors,
						);
						res.status(400).json(errorResponse);
						return;
					}
				}

				// Step 2: Update user via auth service if provided
				if (user && userId) {
					employeeLogger.info(`Updating linked user account: ${userId}`);

					const userPayload: any = {};
					if (user.email !== undefined) userPayload.email = user.email;
					if (user.userName !== undefined)
						userPayload.userName = sanitizeUsername(user.userName);
					if (user.password !== undefined) userPayload.password = user.password;
					if (uploadedAvatarUrl) userPayload.avatar = uploadedAvatarUrl;
					else if (user.avatar !== undefined) userPayload.avatar = user.avatar;
					if (user.status !== undefined) userPayload.status = user.status;
					if (user.loginMethod !== undefined) userPayload.loginMethod = user.loginMethod;
					// roleId and organizationId are not in UpdateUserSchema, but may be in the request
					if ((user as any).roleId !== undefined)
						userPayload.roleId = (user as any).roleId;
					if ((user as any).organizationId !== undefined)
						userPayload.organizationId = (user as any).organizationId;

					try {
						await helpers.updateUserAccount(userId, userPayload, req);
						employeeLogger.info(`User updated successfully: ${userId}`);
					} catch (fetchError) {
						employeeLogger.error(`Failed to update linked user: ${fetchError}`);
						helpers.handleCreateEmployeeError(fetchError, res);
						return;
					}
				}

				// Step 3: Update employee if provided
				if (employee) {
					employeeLogger.info(
						"Employee data to update:",
						JSON.stringify(employee, null, 2),
					);
					const employeeValidation = UpdateEmployeeSchema.safeParse(employee);
					if (employeeValidation.success) {
						employeeLogger.info(
							"Validated employee data:",
							JSON.stringify(employeeValidation.data, null, 2),
						);

						const validatedEmployeeData: any = { ...employeeValidation.data };
						if (
							validatedEmployeeData.workforceSource !== undefined ||
							validatedEmployeeData.agencyId !== undefined
						) {
							try {
								const sourceForValidation =
									validatedEmployeeData.workforceSource ||
									(existingEmployee as any).workforceSource ||
									"DIRECT";
								const assignment = await normalizeAndValidateAgencyAssignment(
									prisma,
									{
										workforceSource: sourceForValidation,
										agencyId:
											validatedEmployeeData.agencyId === undefined
												? (existingEmployee as any).agencyId
												: validatedEmployeeData.agencyId,
									},
									existingEmployee.organizationId,
								);
								validatedEmployeeData.workforceSource = assignment.workforceSource;
								validatedEmployeeData.agencyId = assignment.agencyId;
							} catch (agencyError) {
								res.status(400).json(
									buildErrorResponse(
										agencyError instanceof Error
											? agencyError.message
											: "Invalid agency assignment",
										400,
									),
								);
								return;
							}
						}

						if (validatedEmployeeData.sectionId) {
							const targetDepartmentId =
								validatedEmployeeData.departmentId ||
								(existingEmployee as any).departmentId;
							const sectionRecord = await prisma.section.findFirst({
								where: {
									id: validatedEmployeeData.sectionId,
									organizationId: existingEmployee.organizationId,
									departmentId: targetDepartmentId,
									isDeleted: false,
								},
								select: { id: true },
							});
							if (!sectionRecord) {
								res.status(400).json(
									buildErrorResponse(
										"Section must belong to the selected department",
										400,
									),
								);
								return;
							}
						}

						// Filter out relation payloads that need dedicated sync handling
						const { documents, employeeBenefits, ...otherData } = validatedEmployeeData;
						const updateData = Object.fromEntries(
							Object.entries(otherData).filter(([_, value]) => value !== undefined),
						);

						employeeLogger.info(
							"Filtered update data (removed undefined):",
							JSON.stringify(updateData, null, 2),
						);

						let updatedEmployee = await prisma.employee.update({
							where: { id },
							data: updateData,
							include: {
								person: true,
								documents: {
									where: { isDeleted: false },
								},
								department: true,
								section: true,
								position: true,
								level: true,
								agency: {
									select: {
										id: true,
										name: true,
										code: true,
									},
								},
								reportTo: {
									select: {
										id: true,
										employeeId: true,
										person: {
											select: {
												personalInfo: true,
												contactInfo: true,
											},
										},
									},
								},
							},
						});

						const documentSyncResult = await syncEmployeeDocuments(
							prisma,
							id,
							documents,
						);
						await backfillOpenPayrollPeriodAttendanceObligations(prisma, {
							organizationId: updatedEmployee.organizationId,
							employeeId: id,
						});
						await reconcileEmployeeOnboardingState({
							prisma,
							organizationId: updatedEmployee.organizationId,
							employeeId: id,
							targetDate: updatedEmployee.employmentHireDate || new Date(),
							departmentId: updatedEmployee.departmentId,
							role: updatedEmployee.role,
						});
						updatedEmployee =
							(await refetchEmployeeWithRelations(prisma, id)) || updatedEmployee;
						if (documentSyncResult.changed) {
							await logEmployeeDocumentConfigurationAudit({
								req,
								employee: updatedEmployee,
								beforeDocuments: documentSyncResult.beforeDocuments,
								afterDocuments:
									updatedEmployee.documents || documentSyncResult.afterDocuments,
							});
						}

						// Handle Employee Benefits Sync
						if (employeeBenefits) {
							employeeLogger.info(
								`Syncing ${employeeBenefits.length} employee benefits`,
							);
							const existingBenefits = await prisma.employeeBenefit.findMany({
								where: { employeeId: id, isDeleted: false },
								select: { id: true },
							});
							const existingIds = existingBenefits.map((b) => b.id);

							for (const benefit of employeeBenefits) {
								const { id: benefitId, ...benefitData } = benefit;

								// Ensure organizationId is set
								const benefitPayload: any = {
									...normalizeEmployeeBenefitPayload({
										...benefitData,
										organizationId:
											benefitData.organizationId ||
											updatedEmployee.organizationId,
										employeeId: id,
									}),
								};

								if (benefitId && existingIds.includes(benefitId)) {
									// Update existing
									await prisma.employeeBenefit.update({
										where: { id: benefitId },
										data: benefitPayload,
									});
								} else {
									// Create new
									await prisma.employeeBenefit.create({
										data: {
											...benefitPayload,
											isActive: true,
											isDeleted: false,
										},
									});
								}
							}

							// Delete missing (Soft Delete)
							const incomingIds = employeeBenefits
								.filter((b: { id?: string }) => b.id)
								.map((b: { id?: string }) => b.id as string);

							const toDelete = existingIds.filter(
								(eid) => !incomingIds.includes(eid),
							);

							if (toDelete.length > 0) {
								employeeLogger.info(
									`Soft deleting ${toDelete.length} removed benefits`,
								);
								await prisma.employeeBenefit.updateMany({
									where: { id: { in: toDelete } },
									data: { isDeleted: true },
								});
							}
						}

						await helpers.invalidateEmployeeCaches(id);
						employeeLogger.info(`Cache invalidated after employee ${id} update`);

						employeeLogger.info(
							`${config.SUCCESS.EMPLOYEE.UPDATED}: ${updatedEmployee.id}`,
						);
						employeeLogger.info(
							"Updated employee relations:",
							JSON.stringify(
								{
									departmentId: updatedEmployee.departmentId,
									positionId: updatedEmployee.positionId,
									levelId: updatedEmployee.levelId,
									reportToId: updatedEmployee.reportToId,
								},
								null,
								2,
							),
						);

						// Update user metadata if employee data changed (especially department or position)
						if (userId) {
							employeeLogger.info("Updating user metadata after employee update");
							await helpers.updateUserMetadata(userId, updatedEmployee.id, req);
						}

						if (uploadedAvatarUrl && userId && !user) {
							await helpers.updateUserAccount(
								userId,
								{ avatar: uploadedAvatarUrl },
								req,
							);
						}

						// Log activity and audit
						logActivity(req, {
							userId: (req as any).user?.id || "unknown",
							action: config.ACTIVITY_LOG.EMPLOYEE.ACTIONS.UPDATE_EMPLOYEE,
							description: `Employee updated: ${updatedEmployee.employeeId || updatedEmployee.id}`,
							page: {
								url: req.originalUrl,
								title: config.ACTIVITY_LOG.EMPLOYEE.PAGES.EMPLOYEE_UPDATE,
							},
						});

						logAudit(req, {
							userId: (req as any).user?.id || "unknown",
							action: config.AUDIT_LOG.ACTIONS.UPDATE,
							resource: config.AUDIT_LOG.RESOURCES.EMPLOYEE,
							severity: config.AUDIT_LOG.SEVERITY.LOW,
							entityType: config.AUDIT_LOG.ENTITY_TYPES.EMPLOYEE,
							entityId: updatedEmployee.id,
							changesBefore: existingEmployee,
							changesAfter: updatedEmployee,
							description: `Employee updated: ${updatedEmployee.employeeId || updatedEmployee.id}`,
						});

						const successResponse = buildSuccessResponse(
							config.SUCCESS.EMPLOYEE.UPDATED,
							{ employee: updatedEmployee },
							200,
						);
						res.status(200).json(successResponse);
						return;
					} else {
						employeeLogger.error(
							"Employee validation failed:",
							JSON.stringify(employeeValidation.error.format(), null, 2),
						);
					}
				} else {
					// If only user or person was updated, refetch employee with relations
					await helpers.invalidateEmployeeCaches(id);
					employeeLogger.info(`Cache invalidated after composite update ${id}`);

					// Refetch employee with updated person data
					const updatedEmployee = await refetchEmployeeWithRelations(prisma, id);

					// Update user metadata if user or person data changed
					if (userId && updatedEmployee) {
						employeeLogger.info("Updating user metadata after user/person update");
						await helpers.updateUserMetadata(userId, updatedEmployee.id, req);
					}

					if (uploadedAvatarUrl && userId && !user) {
						await helpers.updateUserAccount(userId, { avatar: uploadedAvatarUrl }, req);
					}

					// Log activity and audit
					logActivity(req, {
						userId: (req as any).user?.id || "unknown",
						action: config.ACTIVITY_LOG.EMPLOYEE.ACTIONS.UPDATE_EMPLOYEE,
						description: `Employee updated: ${updatedEmployee?.employeeId || updatedEmployee?.id || id}`,
						page: {
							url: req.originalUrl,
							title: config.ACTIVITY_LOG.EMPLOYEE.PAGES.EMPLOYEE_UPDATE,
						},
					});

					logAudit(req, {
						userId: (req as any).user?.id || "unknown",
						action: config.AUDIT_LOG.ACTIONS.UPDATE,
						resource: config.AUDIT_LOG.RESOURCES.EMPLOYEE,
						severity: config.AUDIT_LOG.SEVERITY.LOW,
						entityType: config.AUDIT_LOG.ENTITY_TYPES.EMPLOYEE,
						entityId: id,
						changesBefore: existingEmployee,
						changesAfter: updatedEmployee || existingEmployee,
						description: `Employee updated: ${updatedEmployee?.employeeId || updatedEmployee?.id || id}`,
					});

					const successResponse = buildSuccessResponse(
						config.SUCCESS.EMPLOYEE.UPDATED,
						{ employee: updatedEmployee || existingEmployee },
						200,
					);
					res.status(200).json(successResponse);
					return;
				}
			} else {
				// Simple employee update (existing logic)
				const validatedData = validationResult.data as z.infer<typeof UpdateEmployeeSchema>;
				if (validatedData.sectionId) {
					const targetDepartmentId =
						validatedData.departmentId || (existingEmployee as any).departmentId;
					const sectionRecord = await prisma.section.findFirst({
						where: {
							id: validatedData.sectionId,
							organizationId: existingEmployee.organizationId,
							departmentId: targetDepartmentId,
							isDeleted: false,
						},
						select: { id: true },
					});
					if (!sectionRecord) {
						res.status(400).json(
							buildErrorResponse(
								"Section must belong to the selected department",
								400,
							),
						);
						return;
					}
				}
				// Build Prisma update data, excluding relation payloads that need dedicated sync handling
				const { documents, employeeBenefits, ...otherData } = validatedData;
				const prismaData: any = {};
				Object.keys(otherData).forEach((key) => {
					if (otherData[key as keyof typeof otherData] !== undefined) {
						prismaData[key] = otherData[key as keyof typeof otherData];
					}
				});

				let updatedEmployee = await prisma.employee.update({
					where: { id },
					data: prismaData,
					include: {
						person: true,
						documents: {
							where: { isDeleted: false },
						},
						section: true,
					},
				});

				const documentSyncResult = await syncEmployeeDocuments(prisma, id, documents);
				await backfillOpenPayrollPeriodAttendanceObligations(prisma, {
					organizationId: updatedEmployee.organizationId,
					employeeId: id,
				});
				await reconcileEmployeeOnboardingState({
					prisma,
					organizationId: updatedEmployee.organizationId,
					employeeId: id,
					targetDate: updatedEmployee.employmentHireDate || new Date(),
					departmentId: updatedEmployee.departmentId,
					role: updatedEmployee.role,
				});
				updatedEmployee =
					(await refetchEmployeeWithRelations(prisma, id)) || updatedEmployee;
				if (documentSyncResult.changed) {
					await logEmployeeDocumentConfigurationAudit({
						req,
						employee: updatedEmployee,
						beforeDocuments: documentSyncResult.beforeDocuments,
						afterDocuments:
							updatedEmployee.documents || documentSyncResult.afterDocuments,
					});
				}

				// Handle Employee Benefits Sync (Simple Update Flow)
				if (employeeBenefits) {
					employeeLogger.info(`Syncing ${employeeBenefits.length} employee benefits`);
					const existingBenefits = await prisma.employeeBenefit.findMany({
						where: { employeeId: id, isDeleted: false },
						select: { id: true },
					});
					const existingIds = existingBenefits.map((b) => b.id);

					for (const benefit of employeeBenefits) {
						const { id: benefitId, ...benefitData } = benefit;
						const benefitPayload: any = {
							...normalizeEmployeeBenefitPayload({
								...benefitData,
								organizationId:
									benefitData.organizationId || updatedEmployee.organizationId,
								employeeId: id,
							}),
						};

						if (benefitId && existingIds.includes(benefitId)) {
							await prisma.employeeBenefit.update({
								where: { id: benefitId },
								data: benefitPayload,
							});
						} else {
							// Check if benefit exists by type and employeeId check to avoid duplicates
							const existingByType = await prisma.employeeBenefit.findFirst({
								where: {
									employeeId: id,
									benefitTypeId: benefitData.benefitTypeId,
									isDeleted: false,
								},
								select: { id: true },
							});

							if (existingByType) {
								// Update existing instead of creating duplicate
								await prisma.employeeBenefit.update({
									where: { id: existingByType.id },
									data: benefitPayload,
								});
							} else {
								await prisma.employeeBenefit.create({
									data: {
										...benefitPayload,
										isActive: true,
										isDeleted: false,
									},
								});
							}
						}
					}

					const incomingIds = employeeBenefits
						.filter((b) => b.id)
						.map((b) => b.id as string);

					const toDelete = existingIds.filter((eid) => !incomingIds.includes(eid));

					if (toDelete.length > 0) {
						employeeLogger.info(`Soft deleting ${toDelete.length} removed benefits`);
						await prisma.employeeBenefit.updateMany({
							where: { id: { in: toDelete } },
							data: { isDeleted: true },
						});
					}
				}

				// Handle file uploads if present
				if (files.length > 0) {
					employeeLogger.info(`Processing ${files.length} document file(s) for update`);
					const { uploadToCloudinary } = require("../../helper/cloudinary.helper");

					// Get document types from request
					const documentTypes = req.body.documentTypes
						? Array.isArray(req.body.documentTypes)
							? req.body.documentTypes
							: [req.body.documentTypes]
						: [];

					const organizationIdForDocumentUpload =
						updatedEmployee.organizationId ||
						req.body?.employee?.organizationId ||
						req.body?.organizationId ||
						null;

					const documentTypeRecords = organizationIdForDocumentUpload
						? await prisma.documentType.findMany({
								where: {
									organizationId: organizationIdForDocumentUpload,
									isDeleted: false,
								},
								select: { id: true, code: true, name: true },
							})
						: [];

					// Get current related documents
					const existingDocuments = await prisma.document.findMany({
						where: {
							employeeId: updatedEmployee.id,
							isDeleted: false,
						},
					});

					// Upload each file and collect file URLs
					for (let i = 0; i < files.length; i++) {
						const file = files[i];
						const docType = documentTypes[i] || `Document_${i + 1}`;
						const matchedDocumentType =
							documentTypeRecords.find(
								(item: any) => item.id === docType || item.code === docType,
							) || null;

						try {
							employeeLogger.info(`Uploading ${docType} document to Cloudinary`);

							const uploadResult = await uploadToCloudinary(file.buffer, {
								folder: `hris/employees/${updatedEmployee.employeeId}/documents`,
								resourceType: "auto",
							});

							if (!uploadResult || !uploadResult.secureUrl) {
								employeeLogger.error(
									`Failed to upload ${docType} document to Cloudinary`,
								);
								continue;
							}

							const fileUrl = uploadResult.secureUrl;
							const fileExt =
								uploadResult.format || file.originalname?.split(".").pop() || "jpg";
							employeeLogger.info(`${docType} document uploaded: ${fileUrl}`);

							// Find and update the corresponding document with file URL
							const targetDocument = existingDocuments.find((doc: any) => {
								if (
									matchedDocumentType?.id &&
									doc.documentTypeId === matchedDocumentType.id
								) {
									return true;
								}
								return doc.type === docType;
							});

							if (targetDocument) {
								await prisma.document.update({
									where: { id: targetDocument.id },
									data: {
										fileUrl,
										ext: fileExt,
										documentTypeId:
											matchedDocumentType?.id ||
											targetDocument.documentTypeId,
										type: matchedDocumentType?.code || targetDocument.type,
										name:
											targetDocument.name ||
											matchedDocumentType?.name ||
											docType,
									},
								});
								employeeLogger.info(
									`Marked ${docType} document for update with fileUrl`,
								);
							} else {
								await prisma.document.create({
									data: {
										employeeId: updatedEmployee.id,
										name: matchedDocumentType?.name || docType,
										type: matchedDocumentType?.code || docType,
										documentTypeId: matchedDocumentType?.id || null,
										number: "",
										issueDate: new Date(),
										expiryDate: null,
										fileUrl,
										ext: fileExt,
										isDeleted: false,
									},
								});
							}
						} catch (uploadError) {
							employeeLogger.error(
								`Error uploading ${docType} document:`,
								uploadError,
							);
							// Continue with other files even if one fails
						}
					}

					const refreshedEmployee = await prisma.employee.findUnique({
						where: { id: updatedEmployee.id },
						include: {
							person: true,
							documents: {
								where: { isDeleted: false },
							},
							department: {
								select: {
									id: true,
									name: true,
									code: true,
									description: true,
								},
							},
							position: {
								select: {
									id: true,
									title: true,
									code: true,
								},
							},
							level: {
								select: {
									id: true,
									name: true,
									rank: true,
								},
							},
							reportTo: {
								select: {
									id: true,
									employeeId: true,
									person: {
										select: {
											personalInfo: true,
										},
									},
								},
							},
						},
					});

					if (!refreshedEmployee) {
						throw new Error("Employee not found after document upload refresh");
					}
					updatedEmployee = refreshedEmployee;
					employeeLogger.info(`Updated employee with ${files.length} document file URLs`);

					if (files.length > 0) {
						await reconcileEmployeeOnboardingState({
							prisma,
							organizationId: updatedEmployee.organizationId,
							employeeId: updatedEmployee.id,
							targetDate: updatedEmployee.employmentHireDate || new Date(),
							departmentId: updatedEmployee.departmentId,
							role: updatedEmployee.role,
						});
						updatedEmployee =
							(await refetchEmployeeWithRelations(prisma, updatedEmployee.id)) ||
							updatedEmployee;
					}
				}

				await helpers.invalidateEmployeeCaches(id);
				employeeLogger.info(`Cache invalidated after employee ${id} update`);

				employeeLogger.info(`${config.SUCCESS.EMPLOYEE.UPDATED}: ${updatedEmployee.id}`);

				// Update user metadata if employee data changed (especially department or position)
				if (userId) {
					employeeLogger.info("Updating user metadata after employee update");
					await helpers.updateUserMetadata(userId, updatedEmployee.id, req);
				}

				if (uploadedAvatarUrl && userId) {
					await helpers.updateUserAccount(userId, { avatar: uploadedAvatarUrl }, req);
				}

				// Note: Simple employee update doesn't change person data (name/DOB), so birthday item stays the same

				// Log activity and audit
				logActivity(req, {
					userId: (req as any).user?.id || "unknown",
					action: config.ACTIVITY_LOG.EMPLOYEE.ACTIONS.UPDATE_EMPLOYEE,
					description: `Employee updated: ${updatedEmployee.employeeId || updatedEmployee.id}`,
					page: {
						url: req.originalUrl,
						title: config.ACTIVITY_LOG.EMPLOYEE.PAGES.EMPLOYEE_UPDATE,
					},
				});

				logAudit(req, {
					userId: (req as any).user?.id || "unknown",
					action: config.AUDIT_LOG.ACTIONS.UPDATE,
					resource: config.AUDIT_LOG.RESOURCES.EMPLOYEE,
					severity: config.AUDIT_LOG.SEVERITY.LOW,
					entityType: config.AUDIT_LOG.ENTITY_TYPES.EMPLOYEE,
					entityId: updatedEmployee.id,
					changesBefore: existingEmployee,
					changesAfter: updatedEmployee,
					description: `Employee updated: ${updatedEmployee.employeeId || updatedEmployee.id}`,
				});

				const successResponse = buildSuccessResponse(
					config.SUCCESS.EMPLOYEE.UPDATED,
					{ employee: updatedEmployee },
					200,
				);
				res.status(200).json(successResponse);
			}
		} catch (error) {
			employeeLogger.error(`${config.ERROR.EMPLOYEE.ERROR_UPDATING}: ${error}`);
			const errorResponse = buildErrorResponse(
				config.ERROR.COMMON.INTERNAL_SERVER_ERROR,
				500,
			);
			res.status(500).json(errorResponse);
		}
	};

	const remove = async (req: Request, res: Response, _next: NextFunction) => {
		const { id } = req.params;

		try {
			if (!id) {
				employeeLogger.error(config.ERROR.QUERY_PARAMS.MISSING_ID);
				const errorResponse = buildErrorResponse(config.ERROR.QUERY_PARAMS.MISSING_ID, 400);
				res.status(400).json(errorResponse);
				return;
			}

			employeeLogger.info(`${config.SUCCESS.EMPLOYEE.DELETED}: ${id}`);

			const existingEmployee = await prisma.employee.findFirst({
				where: { id },
			});

			if (!existingEmployee) {
				employeeLogger.error(`${config.ERROR.EMPLOYEE.NOT_FOUND}: ${id}`);
				const errorResponse = buildErrorResponse(config.ERROR.EMPLOYEE.NOT_FOUND, 404);
				res.status(404).json(errorResponse);
				return;
			}

			await prisma.employee.delete({
				where: { id },
			});

			await helpers.invalidateEmployeeCaches(id);
			employeeLogger.info(`Cache invalidated after employee ${id} deletion`);

			logActivity(req, {
				userId: (req as any).user?.id || "unknown",
				action: config.ACTIVITY_LOG.EMPLOYEE.ACTIONS.DELETE_EMPLOYEE,
				description: `${config.ACTIVITY_LOG.EMPLOYEE.DESCRIPTIONS.EMPLOYEE_DELETED}: ${existingEmployee.employeeId || id}`,
				page: {
					url: req.originalUrl,
					title: config.ACTIVITY_LOG.EMPLOYEE.PAGES.EMPLOYEE_DELETION,
				},
			});
			logAudit(req, {
				userId: (req as any).user?.id || "unknown",
				action: config.AUDIT_LOG.ACTIONS.DELETE,
				resource: config.AUDIT_LOG.RESOURCES.EMPLOYEE,
				severity: config.AUDIT_LOG.SEVERITY.HIGH,
				entityType: config.AUDIT_LOG.ENTITY_TYPES.EMPLOYEE,
				entityId: id,
				changesBefore: existingEmployee,
				changesAfter: null,
				description: `${config.AUDIT_LOG.EMPLOYEE.DESCRIPTIONS.EMPLOYEE_DELETED}: ${existingEmployee.employeeId || id}`,
			});

			employeeLogger.info(`${config.SUCCESS.EMPLOYEE.DELETED}: ${id}`);
			const successResponse = buildSuccessResponse(config.SUCCESS.EMPLOYEE.DELETED, {}, 200);
			res.status(200).json(successResponse);
		} catch (error) {
			employeeLogger.error(`${config.ERROR.EMPLOYEE.DELETE_FAILED}: ${error}`);
			const errorResponse = buildErrorResponse(
				config.ERROR.COMMON.INTERNAL_SERVER_ERROR,
				500,
			);
			res.status(500).json(errorResponse);
		}
	};

	// Employee-specific attendance methods
	const getAttendanceRecords = async (req: Request, res: Response, _next: NextFunction) => {
		const { id: employeeId } = req.params;
		const {
			dateFrom,
			dateTo,
			page = 1,
			limit = 10,
			order = "desc",
			sort = "createdAt",
		} = req.query;

		try {
			if (!employeeId) {
				employeeLogger.error("Missing employee ID");
				const errorResponse = buildErrorResponse("Employee ID is required", 400);
				res.status(400).json(errorResponse);
				return;
			}

			// Validate employee exists and get schedule
			const employee = await prisma.employee.findUnique({
				where: { id: employeeId },
				include: {
					person: {
						select: {
							personalInfo: true,
						},
					},
					scheduleHistoryRecords: {
						where: {
							effectiveAt: {
								lte: toUtcEndOfDay(toDateOrNull(dateTo as string) || new Date()),
							},
						},
						orderBy: [{ effectiveAt: "asc" }, { createdAt: "asc" }],
						select: {
							effectiveAt: true,
							createdAt: true,
							beforeSchedule: true,
							afterSchedule: true,
						},
					},
					scheduleOverrides: {
						where: { isDeleted: false },
						include: {
							shiftType: true,
						},
					},
				},
			});

			if (!employee) {
				employeeLogger.error(`Employee not found: ${employeeId}`);
				const errorResponse = buildErrorResponse("Employee not found", 404);
				res.status(404).json(errorResponse);
				return;
			}
			const effectiveEmploymentStartDate = getEffectiveEmploymentStartDate(employee);

			// Build date filter using business-day bounds so Manila calendar days
			// include raw attendance rows stored at the prior UTC evening.
			const dateFilter: any = {};
			if (dateFrom) {
				const requestedStart = getBusinessDayDate(new Date(dateFrom as string));
				dateFilter.gte =
					effectiveEmploymentStartDate && requestedStart < effectiveEmploymentStartDate
						? getBusinessDayBounds(effectiveEmploymentStartDate).start
						: getBusinessDayBounds(requestedStart).start;
			} else if (effectiveEmploymentStartDate) {
				dateFilter.gte = getBusinessDayBounds(effectiveEmploymentStartDate).start;
			}
			if (dateTo) {
				dateFilter.lte = getBusinessDayBounds(new Date(dateTo as string)).end;
			}

			// Build where clause
			const whereClause: Prisma.AttendanceWhereInput = {
				employeeId,
				isDeleted: false,
				...(Object.keys(dateFilter).length > 0 && { date: dateFilter }),
			};

			// Get effective attendance records (without pagination for mapping)
			const attendances = await getEffectiveAttendanceRecordsForRange(prisma, {
				organizationId: employee.organizationId,
				employeeId,
				startDate:
					(dateFilter.gte as Date | undefined) ||
					effectiveEmploymentStartDate ||
					normalizeToStartOfDay(new Date()),
				endDate: (dateFilter.lte as Date | undefined) || new Date(),
			});

			// Create attendance map for quick lookup
			const attendanceMap = new Map<string, any>();
			attendances.forEach((att) => {
				if (att.date) {
					attendanceMap.set(getDateKeyInBusinessTimeZone(att.date), att);
				}
			});

			const schedule = resolveEmployeeActiveSchedule(employee);
			const shiftTypeIds = collectShiftTypeIdsFromEmployeeScheduleData(employee);
			const shiftTypes =
				shiftTypeIds.length > 0
					? await prisma.shiftType.findMany({
							where: {
								organizationId: employee.organizationId,
								isDeleted: false,
								id: {
									in: shiftTypeIds,
								},
							},
						})
					: [];
			const shiftTypeById = new Map(
				shiftTypes.map((shiftType) => [String(shiftType.id), shiftType]),
			);

			// Generate full attendance records including absent and rest days
			const fullAttendanceRecords: any[] = [];
			const dayNames = [
				"Sunday",
				"Monday",
				"Tuesday",
				"Wednesday",
				"Thursday",
				"Friday",
				"Saturday",
			];

			// Determine date range for processing
			let startDate: Date | null = null;
			let endDate: Date | null = null;

			if (dateFrom && dateTo) {
				startDate = getBusinessDayDate(new Date(dateFrom as string));
				if (effectiveEmploymentStartDate && startDate < effectiveEmploymentStartDate) {
					startDate = effectiveEmploymentStartDate;
				}
				endDate = getBusinessDayDate(new Date(dateTo as string));
			} else if (attendances.length > 0) {
				// Only generate date range if employee has at least one attendance record
				// Set endDate to today's business date.
				endDate = getBusinessDayDate(new Date());

				// Use first attendance record business date to today.
				const dates = attendances.map((att) => att.date).filter((d) => d) as Date[];
				const minAttendanceDate = getBusinessDayDate(
					new Date(Math.min(...dates.map((d) => d.getTime()))),
				);
				startDate =
					effectiveEmploymentStartDate && minAttendanceDate < effectiveEmploymentStartDate
						? effectiveEmploymentStartDate
						: minAttendanceDate;
			} else {
				// No attendance records and no date range specified - don't generate absent records
				startDate = null;
				endDate = null;
			}

			// Keep generated virtual status aligned with existing normalized date keys.
			const todayDateKey = getDateKeyInBusinessTimeZone(new Date());

			if (startDate && endDate) {
				// Ensure currentDate starts at beginning of day in UTC
				const currentDate = normalizeToStartOfDay(new Date(startDate));

				while (currentDate <= endDate) {
					const dateKey = currentDate.toISOString().split("T")[0];
					const dayOfWeek = currentDate.getDay();
					const dayName = dayNames[dayOfWeek];

					// Find effective shift for this day from assignment/template + overrides
					const shift = resolveEffectiveShiftFromEmployeeData(
						employee,
						currentDate,
						shiftTypeById,
					);

					const existingAttendance = attendanceMap.get(dateKey);

					if (shift) {
						if (shift.isOff) {
							// Rest day
							fullAttendanceRecords.push({
								id: `rest-${dateKey}`,
								organizationId: employee.organizationId,
								employeeId,
								date: normalizeToStartOfDay(new Date(currentDate)),
								timeIn: null,
								timeOut: null,
								status: "REST_DAY",
								breakMinutes: 0,
								hoursWorked: "0:00",
								regularHours: "0:00",
								overtimeHours: "0:00",
								undertimeHours: "0:00",
								lateHours: "0:00",
								earlyOutHours: "0:00",
								dayOfWeek: dayName,
								isRestDay: true,
								employee: {
									id: employee.id,
									employeeId: employee.employeeId,
									personId: employee.personId,
								},
								isDeleted: false,
								createdAt: new Date(),
								updatedAt: new Date(),
							});
						} else if (existingAttendance) {
							// Present - use existing attendance
							fullAttendanceRecords.push({
								...existingAttendance,
								dayOfWeek: dayName,
								isRestDay: false,
							});
						} else {
							// Work day with no attendance:
							// - today => NOT_CLOCKED_IN
							// - past dates => ABSENT
							const virtualStatus =
								dateKey === todayDateKey ? "NOT_CLOCKED_IN" : "ABSENT";
							fullAttendanceRecords.push({
								id: `absent-${dateKey}`,
								organizationId: employee.organizationId,
								employeeId,
								date: normalizeToStartOfDay(new Date(currentDate)),
								timeIn: null,
								timeOut: null,
								status: virtualStatus,
								breakMinutes: 0,
								hoursWorked: "0:00",
								regularHours: "0:00",
								overtimeHours: "0:00",
								undertimeHours: "0:00",
								lateHours: "0:00",
								earlyOutHours: "0:00",
								dayOfWeek: dayName,
								isRestDay: false,

								employee: {
									id: employee.id,
									employeeId: employee.employeeId,
									personId: employee.personId,
								},
								remarks:
									virtualStatus === "NOT_CLOCKED_IN"
										? "No attendance record yet (Not Clocked In)"
										: "No attendance record (Absent)",
								isDeleted: false,
								createdAt: new Date(),
								updatedAt: new Date(),
							});
						}
					}

					// Move to next day
					currentDate.setDate(currentDate.getDate() + 1);
				}
			} else {
				// If no schedule or date range, return existing attendance records only
				fullAttendanceRecords.push(
					...attendances.map((att) => ({
						...att,
						dayOfWeek: dayNames[att.date ? att.date.getDay() : 0],
						isRestDay: false,
					})),
				);
			}

			// Sort fullAttendanceRecords by date (latest first by default)
			const sortField = sort === "date" || sort === "createdAt" ? "date" : (sort as string);
			const sortOrder = order === "asc" ? 1 : -1;

			fullAttendanceRecords.sort((a, b) => {
				const aValue = a[sortField];
				const bValue = b[sortField];

				if (aValue instanceof Date && bValue instanceof Date) {
					return (aValue.getTime() - bValue.getTime()) * sortOrder;
				}
				if (aValue < bValue) return -1 * sortOrder;
				if (aValue > bValue) return 1 * sortOrder;
				return 0;
			});

			// Apply pagination to the full records
			const total = fullAttendanceRecords.length;
			const skip = (Number(page) - 1) * Number(limit);
			const paginatedRecords = fullAttendanceRecords.slice(skip, skip + Number(limit));

			let enrichedPaginatedRecords = paginatedRecords;
			try {
				enrichedPaginatedRecords = await enrichBreakdownWithLeaveHolidayContext(prisma, {
					organizationId: employee.organizationId,
					employeeId,
					breakdown: paginatedRecords,
				});
			} catch (enrichError) {
				employeeLogger.warn(
					`Failed to enrich attendance leave/holiday context for employee ${employeeId}: ${enrichError}`,
				);
			}

			// Calculate summary statistics
			const summary = {
				totalDays: fullAttendanceRecords.length,
				daysPresent: fullAttendanceRecords.filter((r) => r.status === "PRESENT").length,
				daysAbsent: fullAttendanceRecords.filter(
					(r) => r.status === "ABSENT" || r.status === "NOT_CLOCKED_IN",
				).length,
				restDays: fullAttendanceRecords.filter((r) => r.status === "REST_DAY").length,
				daysLate: fullAttendanceRecords.filter((r) => r.isLate).length,
			};

			employeeLogger.info(
				`Retrieved ${enrichedPaginatedRecords.length} attendance records for employee ${employeeId} (${summary.daysPresent} present, ${summary.daysAbsent} absent, ${summary.restDays} rest)`,
			);

			const responseData = {
				attendances: enrichedPaginatedRecords.map(
					({ scheduleSnapshot, metadata, ...rest }: any) => {
						const graceStatus = deriveGracePeriodStatus(
							rest.timeIn || null,
							scheduleSnapshot || null,
							rest.date || new Date(),
						);
						const safeMetadata =
							metadata && typeof metadata === "object"
								? (metadata as Record<string, any>)
								: {};
						const timing = buildAttendanceTimingMetadata({
							attendance: rest,
							scheduleSnapshot: scheduleSnapshot || null,
							rawLateMinutes: graceStatus.rawLateMinutes,
							gracePeriodMinutes: graceStatus.gracePeriodMinutes,
							withinGrace: graceStatus.withinGrace,
						});
						return {
							...rest,
							metadata: {
								...safeMetadata,
								rawLateMinutes: graceStatus.rawLateMinutes,
								gracePeriodMinutes: graceStatus.gracePeriodMinutes,
								withinGrace: graceStatus.withinGrace,
								...(timing ? { timing } : {}),
							},
						};
					},
				),
				schedule: schedule
					? {
							scheduleCode: schedule.scheduleCode,
							scheduleName: schedule.scheduleName,
							startDate: schedule.startDate,
							endDate: schedule.endDate,
							shifts: schedule.shifts,
							gracePeriodMinutes: schedule.gracePeriodMinutes || 0,
						}
					: null,
				employment: {
					employmentHireDate: employee.employmentHireDate || null,
					employmentStartDate: employee.employmentStartDate || null,
					effectiveStartDate: effectiveEmploymentStartDate,
					isPreStartToday: effectiveEmploymentStartDate
						? getBusinessDayDate(new Date()) < effectiveEmploymentStartDate
						: false,
				},
				summary,
				pagination: {
					page: Number(page),
					limit: Number(limit),
					total,
					totalPages: Math.ceil(total / Number(limit)),
				},
			};

			logActivity(req, {
				userId: (req as any).user?.id || "unknown",
				action: config.ACTIVITY_LOG.EMPLOYEE.ACTIONS.GET_ATTENDANCE_RECORDS,
				description: `${config.ACTIVITY_LOG.EMPLOYEE.DESCRIPTIONS.ATTENDANCE_RECORDS_RETRIEVED}: ${employeeId}`,
				page: {
					url: req.originalUrl,
					title: config.ACTIVITY_LOG.EMPLOYEE.PAGES.EMPLOYEE_ATTENDANCE_LIST,
				},
			});

			res.status(200).json(
				buildSuccessResponse(
					"Employee attendance records retrieved successfully",
					responseData,
					200,
				),
			);
		} catch (error) {
			employeeLogger.error(
				`Error getting attendance records for employee ${employeeId}: ${error}`,
			);
			const errorResponse = buildErrorResponse(
				config.ERROR.COMMON.INTERNAL_SERVER_ERROR,
				500,
			);
			res.status(500).json(errorResponse);
		}
	};

	const getTodayAttendance = async (req: Request, res: Response, _next: NextFunction) => {
		const { id: employeeId } = req.params;

		try {
			if (!employeeId) {
				employeeLogger.error("Missing employee ID");
				const errorResponse = buildErrorResponse("Employee ID is required", 400);
				res.status(400).json(errorResponse);
				return;
			}

			// Validate employee exists
			const employee = await helpers.validateEmployeeExists(employeeId);

			if (!employee) {
				employeeLogger.error(`Employee not found: ${employeeId}`);
				const errorResponse = buildErrorResponse("Employee not found", 404);
				res.status(404).json(errorResponse);
				return;
			}
			const effectiveEmploymentStartDate = getEffectiveEmploymentStartDate(employee);

			const { start: todayBusinessStart, end: todayBusinessEnd } =
				getTodayBusinessDayBounds();
			const today = getBusinessDayDate(new Date());
			const isPreStartToday =
				effectiveEmploymentStartDate !== null && today < effectiveEmploymentStartDate;

			if (isPreStartToday) {
				const preStartAttendance = {
					id: `today-pre-start-${today.toISOString().split("T")[0]}`,
					organizationId: employee.organizationId,
					employeeId,
					date: today,
					timeIn: null,
					timeOut: null,
					status: "PRE_START",
					notes: "Employee start date has not been reached yet.",
					isDeleted: false,
					createdAt: new Date(),
					updatedAt: new Date(),
					isPreStart: true,
					effectiveStartDate: effectiveEmploymentStartDate,
					employmentStartDate: employee.employmentStartDate || null,
					employmentHireDate: employee.employmentHireDate || null,
				} as any;

				logActivity(req, {
					userId: (req as any).user?.id || "unknown",
					action: config.ACTIVITY_LOG.EMPLOYEE.ACTIONS.GET_TODAY_ATTENDANCE,
					description: `${config.ACTIVITY_LOG.EMPLOYEE.DESCRIPTIONS.TODAY_ATTENDANCE_RETRIEVED}: ${employeeId} (pre-start)`,
					page: {
						url: req.originalUrl,
						title: config.ACTIVITY_LOG.EMPLOYEE.PAGES.EMPLOYEE_ATTENDANCE,
					},
				});
				res.status(200).json(
					buildSuccessResponse(
						"Today's attendance status retrieved successfully",
						{
							attendance: preStartAttendance,
							status: "pre-start",
							hasTimeIn: false,
							hasTimeOut: false,
						},
						200,
					),
				);
				return;
			}

			const todaysAttendances = await getEffectiveAttendanceRecordsForRange(prisma, {
				organizationId: employee.organizationId,
				employeeId,
				startDate: todayBusinessStart,
				endDate: todayBusinessEnd,
			});
			let todayAttendance = todaysAttendances[0] || null;

			employeeLogger.info(`Retrieved today's attendance for employee ${employeeId}`);

			const todayDay = getDateKeyInBusinessTimeZone(new Date());
			const shiftTypeIds = collectShiftTypeIdsFromEmployeeScheduleData(employee);
			const shiftTypes =
				shiftTypeIds.length > 0
					? await prisma.shiftType.findMany({
							where: {
								organizationId: employee.organizationId,
								isDeleted: false,
								id: { in: shiftTypeIds },
							},
						})
					: [];
			const shiftTypeById = new Map(
				shiftTypes.map((shiftType) => [String(shiftType.id), shiftType]),
			);
			const todayShift = resolveEffectiveShiftFromEmployeeData(
				employee,
				today,
				shiftTypeById,
			);
			const todayScheduleSnapshot = todayShift
				? toAttendanceScheduleSnapshot(todayShift)
				: null;
			if (
				todayAttendance?.id &&
				todayAttendance.timeIn &&
				todayScheduleSnapshot &&
				shouldRepairTodayScheduleSnapshot(
					(todayAttendance as any).scheduleSnapshot,
					todayScheduleSnapshot,
				)
			) {
				const timekeepingCalc = calculateTimekeeping(
					todayAttendance.timeIn,
					todayAttendance.timeOut || null,
					todayScheduleSnapshot,
					todayAttendance.date || today,
				);
				const overtimeApplication = await resolveOvertimePolicyApplication(
					prisma,
					employee.organizationId,
					{
						calc: timekeepingCalc,
						timeIn: todayAttendance.timeIn,
						timeOut: todayAttendance.timeOut || null,
						schedule: todayScheduleSnapshot,
						date: todayAttendance.date || today,
						attendanceStatus: todayAttendance.status,
					},
				);
				todayAttendance = await prisma.attendance.update({
					where: { id: todayAttendance.id },
					data: {
						scheduleSnapshot: todayScheduleSnapshot as any,
						behaviorFlags: overtimeApplication.behaviorFlags,
						...overtimeApplication.timekeepingFields,
					},
				});
				await applyAttendanceToObligation(prisma, {
					organizationId: employee.organizationId,
					employeeId,
					attendanceId: todayAttendance.id,
				});
				await refreshTimesheetForAttendanceDate(prisma, {
					organizationId: employee.organizationId,
					employeeId,
					date: todayAttendance.date || today,
				});
			}
			const defaultTodayStatus = todayShift?.isOff ? "REST_DAY" : "NOT_CLOCKED_IN";
			const todayBaseAttendance = todayAttendance
				? todayAttendance
				: ({
						id: `today-${todayDay}`,
						organizationId: employee.organizationId,
						employeeId,
						date: today,
						timeIn: null,
						timeOut: null,
						status: defaultTodayStatus,
						notes: defaultTodayStatus === "REST_DAY" ? "Scheduled rest day" : null,
						isDeleted: false,
						createdAt: new Date(),
						updatedAt: new Date(),
						...(todayScheduleSnapshot
							? { scheduleSnapshot: todayScheduleSnapshot }
							: {}),
					} as any);

			let enrichedTodayAttendance = todayBaseAttendance;
			try {
				const enrichedDays = await enrichBreakdownWithLeaveHolidayContext(prisma, {
					organizationId: employee.organizationId,
					employeeId,
					breakdown: [todayBaseAttendance],
				});
				if (Array.isArray(enrichedDays) && enrichedDays[0]) {
					enrichedTodayAttendance = enrichedDays[0] as any;
				}
			} catch (enrichError) {
				employeeLogger.warn(
					`Failed to enrich today's attendance leave/holiday context for employee ${employeeId}: ${enrichError}`,
				);
			}
			enrichedTodayAttendance = {
				...enrichedTodayAttendance,
				isPreStart: false,
				effectiveStartDate: effectiveEmploymentStartDate,
				employmentStartDate: employee.employmentStartDate || null,
				employmentHireDate: employee.employmentHireDate || null,
			};
			const todayScheduleForTiming =
				todayScheduleSnapshot || (enrichedTodayAttendance as any)?.scheduleSnapshot || null;
			const todayGraceStatus = deriveGracePeriodStatus(
				(enrichedTodayAttendance as any)?.timeIn || null,
				todayScheduleForTiming,
				(enrichedTodayAttendance as any)?.date || today,
			);
			const todayTiming = buildAttendanceTimingMetadata({
				attendance: enrichedTodayAttendance,
				scheduleSnapshot: todayScheduleForTiming,
				rawLateMinutes: todayGraceStatus.rawLateMinutes,
				gracePeriodMinutes: todayGraceStatus.gracePeriodMinutes,
				withinGrace: todayGraceStatus.withinGrace,
				referenceTime: new Date(),
			});
			if (todayTiming) {
				enrichedTodayAttendance = {
					...enrichedTodayAttendance,
					metadata: {
						...(((enrichedTodayAttendance as any)?.metadata as Record<string, any>) ||
							{}),
						rawLateMinutes: todayGraceStatus.rawLateMinutes,
						gracePeriodMinutes: todayGraceStatus.gracePeriodMinutes,
						withinGrace: todayGraceStatus.withinGrace,
						timing: todayTiming,
					},
				};
			}

			// Determine status based on attendance data and marker
			let status = "not-clocked-in";
			if (enrichedTodayAttendance?.primaryMarker === "HOLIDAY") {
				status = "holiday";
			} else if (enrichedTodayAttendance?.primaryMarker === "LEAVE") {
				status = "leave";
			} else if (enrichedTodayAttendance?.timeIn) {
				status = "present";
			}

			const responseData = {
				attendance: enrichedTodayAttendance,
				status: status,
				hasTimeIn: enrichedTodayAttendance?.timeIn ? true : false,
				hasTimeOut: enrichedTodayAttendance?.timeOut ? true : false,
			};

			logActivity(req, {
				userId: (req as any).user?.id || "unknown",
				action: config.ACTIVITY_LOG.EMPLOYEE.ACTIONS.GET_TODAY_ATTENDANCE,
				description: `${config.ACTIVITY_LOG.EMPLOYEE.DESCRIPTIONS.TODAY_ATTENDANCE_RETRIEVED}: ${employeeId}`,
				page: {
					url: req.originalUrl,
					title: config.ACTIVITY_LOG.EMPLOYEE.PAGES.EMPLOYEE_ATTENDANCE,
				},
			});

			res.status(200).json(
				buildSuccessResponse(
					"Today's attendance status retrieved successfully",
					responseData,
					200,
				),
			);
		} catch (error) {
			employeeLogger.error(
				`Error getting today's attendance for employee ${employeeId}: ${error}`,
			);
			const errorResponse = buildErrorResponse(
				config.ERROR.COMMON.INTERNAL_SERVER_ERROR,
				500,
			);
			res.status(500).json(errorResponse);
		}
	};

	const getAttendanceById = async (req: Request, res: Response, _next: NextFunction) => {
		const { id: employeeId, attendanceId } = req.params;

		try {
			if (!employeeId || !attendanceId) {
				employeeLogger.error("Missing employee ID or attendance ID");
				const errorResponse = buildErrorResponse(
					"Employee ID and attendance ID are required",
					400,
				);
				res.status(400).json(errorResponse);
				return;
			}

			// Validate employee exists
			const employee = await helpers.validateEmployeeExists(employeeId);

			if (!employee) {
				employeeLogger.error(`Employee not found: ${employeeId}`);
				const errorResponse = buildErrorResponse("Employee not found", 404);
				res.status(404).json(errorResponse);
				return;
			}

			// Get specific attendance record
			const attendance = await prisma.attendance.findFirst({
				where: {
					id: attendanceId,
					employeeId,
					isDeleted: false,
				},
				include: {
					employee: {
						select: {
							id: true,
							employeeId: true,
							personId: true,
						},
					},
				},
			});

			if (!attendance) {
				employeeLogger.error(
					`Attendance record not found: ${attendanceId} for employee ${employeeId}`,
				);
				const errorResponse = buildErrorResponse("Attendance record not found", 404);
				res.status(404).json(errorResponse);
				return;
			}

			employeeLogger.info(
				`Retrieved attendance record ${attendanceId} for employee ${employeeId}`,
			);

			logActivity(req, {
				userId: (req as any).user?.id || "unknown",
				action: config.ACTIVITY_LOG.EMPLOYEE.ACTIONS.GET_ATTENDANCE,
				description: `${config.ACTIVITY_LOG.EMPLOYEE.DESCRIPTIONS.ATTENDANCE_RETRIEVED}: ${attendanceId}`,
				page: {
					url: req.originalUrl,
					title: config.ACTIVITY_LOG.EMPLOYEE.PAGES.EMPLOYEE_ATTENDANCE,
				},
			});

			res.status(200).json(
				buildSuccessResponse(
					"Attendance record retrieved successfully",
					{ attendance },
					200,
				),
			);
		} catch (error) {
			employeeLogger.error(
				`Error getting attendance record ${attendanceId} for employee ${employeeId}: ${error}`,
			);
			const errorResponse = buildErrorResponse(
				config.ERROR.COMMON.INTERNAL_SERVER_ERROR,
				500,
			);
			res.status(500).json(errorResponse);
		}
	};

	const updateAttendance = async (req: Request, res: Response, _next: NextFunction) => {
		const { id: employeeId, attendanceId } = req.params;

		try {
			if (!employeeId || !attendanceId) {
				employeeLogger.error("Missing employee ID or attendance ID");
				const errorResponse = buildErrorResponse(
					"Employee ID and attendance ID are required",
					400,
				);
				res.status(400).json(errorResponse);
				return;
			}

			// Validate employee exists
			const employee = await helpers.validateEmployeeExists(employeeId);

			if (!employee) {
				employeeLogger.error(`Employee not found: ${employeeId}`);
				const errorResponse = buildErrorResponse("Employee not found", 404);
				res.status(404).json(errorResponse);
				return;
			}

			// Validate attendance exists and belongs to employee
			const existingAttendance = await prisma.attendance.findFirst({
				where: {
					id: attendanceId,
					employeeId,
					isDeleted: false,
				},
			});

			if (!existingAttendance) {
				employeeLogger.error(
					`Attendance record not found: ${attendanceId} for employee ${employeeId}`,
				);
				const errorResponse = buildErrorResponse("Attendance record not found", 404);
				res.status(404).json(errorResponse);
				return;
			}

			// Validate update data
			const validationResult = UpdateAttendanceSchema.safeParse(req.body);

			if (!validationResult.success) {
				const formattedErrors = formatZodErrors(validationResult.error.format());
				employeeLogger.error(`Validation failed: ${JSON.stringify(formattedErrors)}`);
				const errorResponse = buildErrorResponse("Validation failed", 400, formattedErrors);
				res.status(400).json(errorResponse);
				return;
			}

			if (Object.keys(req.body).length === 0) {
				employeeLogger.error("No update fields provided");
				const errorResponse = buildErrorResponse("No update fields provided", 400);
				res.status(400).json(errorResponse);
				return;
			}

			const validatedData = validationResult.data;

			const hasTimeInInput = Object.prototype.hasOwnProperty.call(validatedData, "timeIn");
			const hasTimeOutInput = Object.prototype.hasOwnProperty.call(validatedData, "timeOut");
			const hasStatusInput = Object.prototype.hasOwnProperty.call(validatedData, "status");
			const requestedStatus = String(
				(hasStatusInput ? validatedData.status : existingAttendance.status) || "",
			).toUpperCase();
			const isNonWorkedStatus =
				requestedStatus === "ABSENT" ||
				requestedStatus === "LEAVE" ||
				requestedStatus === "REST_DAY";

			// Attendance edits must refresh persisted metrics and snapshots, not just display fields.
			let finalUpdateData: any = {
				...validatedData,
				...(await fetchAttendanceEmployeeSnapshotFields(prisma, employeeId)),
			};

			if (hasTimeInInput || hasTimeOutInput || hasStatusInput) {
				// Get employee schedule for timekeeping calculation
				const employee = await prisma.employee.findUnique({
					where: { id: employeeId },
					select: { embeddedSchedule: true },
				});

				const scheduleSnapshot =
					existingAttendance.scheduleSnapshot ||
					resolveEmployeeActiveSchedule(employee) ||
					null;
				const attendanceDate = existingAttendance.date || new Date();
				const nextTimeIn = isNonWorkedStatus
					? null
					: hasTimeInInput
						? (validatedData.timeIn ?? null)
						: existingAttendance.timeIn;
				const nextTimeOut = isNonWorkedStatus
					? null
					: hasTimeOutInput
						? (validatedData.timeOut ?? null)
						: existingAttendance.timeOut;
				// Recalculate timekeeping metrics with the effective attendance values.
				const timekeepingCalc = calculateTimekeeping(
					nextTimeIn,
					nextTimeOut,
					scheduleSnapshot,
					attendanceDate,
				);

				// Update status if not explicitly provided
				const finalStatus =
					validatedData.status ||
					determineAttendanceStatus(
						timekeepingCalc,
						Boolean(nextTimeOut),
						Boolean(nextTimeIn),
					);
				const overtimeApplication = await resolveOvertimePolicyApplication(
					prisma,
					existingAttendance.organizationId,
					{
						calc: timekeepingCalc,
						timeIn: nextTimeIn,
						timeOut: nextTimeOut,
						schedule: scheduleSnapshot,
						date: attendanceDate,
						isNonWorked: isNonWorkedStatus,
						attendanceStatus: finalStatus,
					},
				);

				// Add calculated fields to update data
				finalUpdateData = {
					...finalUpdateData,
					timeIn: nextTimeIn,
					timeOut: nextTimeOut,
					status: finalStatus,
					behaviorFlags: isNonWorkedStatus ? [] : overtimeApplication.behaviorFlags,
					...overtimeApplication.timekeepingFields,
				};

				employeeLogger.info(
					`Recalculated timekeeping for attendance ${attendanceId}: ` +
						`hoursWorked=${finalUpdateData.hoursWorked}, ` +
						`earlyOutHours=${finalUpdateData.earlyOutHours}, ` +
						`lateHours=${finalUpdateData.lateHours}`,
				);
			}

			// Update attendance record
			const updatedAttendance = await prisma.attendance.update({
				where: { id: attendanceId },
				data: finalUpdateData,
				include: {
					employee: {
						select: {
							id: true,
							employeeId: true,
							personId: true,
						},
					},
				},
			});

			// Invalidate cache
			const obligation = await applyAttendanceToObligation(prisma, {
				organizationId: updatedAttendance.organizationId,
				employeeId,
				attendanceId: updatedAttendance.id,
			});
			emitAttendanceRealtimeEvent((req as any).io, {
				attendance: updatedAttendance,
				obligation,
				action: "attendance_updated",
				source: "EMPLOYEE_ATTENDANCE_API",
			});
			await helpers.invalidateAttendanceCaches(attendanceId, employeeId);
			employeeLogger.info(`Cache invalidated after attendance ${attendanceId} update`);

			logActivity(req, {
				userId: (req as any).user?.id || "unknown",
				action: config.ACTIVITY_LOG.EMPLOYEE.ACTIONS.UPDATE_ATTENDANCE,
				description: `${config.ACTIVITY_LOG.EMPLOYEE.DESCRIPTIONS.ATTENDANCE_UPDATED}: ${attendanceId}`,
				page: {
					url: req.originalUrl,
					title: config.ACTIVITY_LOG.EMPLOYEE.PAGES.EMPLOYEE_ATTENDANCE,
				},
			});
			logAudit(req, {
				userId: (req as any).user?.id || "unknown",
				action: config.AUDIT_LOG.ACTIONS.UPDATE,
				resource: config.AUDIT_LOG.RESOURCES.ATTENDANCE,
				severity: config.AUDIT_LOG.SEVERITY.MEDIUM,
				entityType: config.AUDIT_LOG.ENTITY_TYPES.ATTENDANCE,
				entityId: attendanceId,
				changesBefore: existingAttendance,
				changesAfter: updatedAttendance,
				description: `${config.AUDIT_LOG.EMPLOYEE.DESCRIPTIONS.ATTENDANCE_UPDATED}: ${attendanceId}`,
			});

			res.status(200).json(
				buildSuccessResponse(
					"Attendance record updated successfully",
					{ attendance: updatedAttendance },
					200,
				),
			);
		} catch (error) {
			employeeLogger.error(
				`Error updating attendance record ${attendanceId} for employee ${employeeId}: ${error}`,
			);
			const errorResponse = buildErrorResponse(
				config.ERROR.COMMON.INTERNAL_SERVER_ERROR,
				500,
			);
			res.status(500).json(errorResponse);
		}
	};

	const deleteAttendance = async (req: Request, res: Response, _next: NextFunction) => {
		const { id: employeeId, attendanceId } = req.params;

		try {
			if (!employeeId || !attendanceId) {
				employeeLogger.error("Missing employee ID or attendance ID");
				const errorResponse = buildErrorResponse(
					"Employee ID and attendance ID are required",
					400,
				);
				res.status(400).json(errorResponse);
				return;
			}

			// Validate employee exists
			const employee = await helpers.validateEmployeeExists(employeeId);

			if (!employee) {
				employeeLogger.error(`Employee not found: ${employeeId}`);
				const errorResponse = buildErrorResponse("Employee not found", 404);
				res.status(404).json(errorResponse);
				return;
			}

			// Validate attendance exists and belongs to employee
			const existingAttendance = await prisma.attendance.findFirst({
				where: {
					id: attendanceId,
					employeeId,
					isDeleted: false,
				},
			});

			if (!existingAttendance) {
				employeeLogger.error(
					`Attendance record not found: ${attendanceId} for employee ${employeeId}`,
				);
				const errorResponse = buildErrorResponse("Attendance record not found", 404);
				res.status(404).json(errorResponse);
				return;
			}

			// Delete attendance record
			await prisma.attendance.delete({
				where: { id: attendanceId },
			});
			await recomputeAttendanceObligationsForRange(prisma, {
				organizationId: existingAttendance.organizationId,
				employeeId,
				fromDate: existingAttendance.date || new Date(),
				toDate: existingAttendance.date || new Date(),
				reason: "AttendanceDeleted",
			});

			// Invalidate cache
			await helpers.invalidateAttendanceCaches(attendanceId, employeeId);
			employeeLogger.info(`Cache invalidated after attendance ${attendanceId} deletion`);

			employeeLogger.info(
				`Deleted attendance record ${attendanceId} for employee ${employeeId}`,
			);

			logActivity(req, {
				userId: (req as any).user?.id || "unknown",
				action: config.ACTIVITY_LOG.EMPLOYEE.ACTIONS.DELETE_ATTENDANCE,
				description: `${config.ACTIVITY_LOG.EMPLOYEE.DESCRIPTIONS.ATTENDANCE_DELETED}: ${attendanceId}`,
				page: {
					url: req.originalUrl,
					title: config.ACTIVITY_LOG.EMPLOYEE.PAGES.EMPLOYEE_ATTENDANCE,
				},
			});
			logAudit(req, {
				userId: (req as any).user?.id || "unknown",
				action: config.AUDIT_LOG.ACTIONS.DELETE,
				resource: config.AUDIT_LOG.RESOURCES.ATTENDANCE,
				severity: config.AUDIT_LOG.SEVERITY.MEDIUM,
				entityType: config.AUDIT_LOG.ENTITY_TYPES.ATTENDANCE,
				entityId: attendanceId,
				changesBefore: existingAttendance,
				changesAfter: null,
				description: `${config.AUDIT_LOG.EMPLOYEE.DESCRIPTIONS.ATTENDANCE_DELETED}: ${attendanceId}`,
			});

			res.status(200).json(
				buildSuccessResponse("Attendance record deleted successfully", {}, 200),
			);
		} catch (error) {
			employeeLogger.error(
				`Error deleting attendance record ${attendanceId} for employee ${employeeId}: ${error}`,
			);
			const errorResponse = buildErrorResponse(
				config.ERROR.COMMON.INTERNAL_SERVER_ERROR,
				500,
			);
			res.status(500).json(errorResponse);
		}
	};

	const debugDeleteTodayAttendance = async (
		req: Request,
		res: Response,
		_next: NextFunction,
	) => {
		const { id: employeeId } = req.params;

		try {
			if (!employeeId) {
				const errorResponse = buildErrorResponse("Employee ID is required", 400);
				res.status(400).json(errorResponse);
				return;
			}

			if (req.query.debug !== "true") {
				const errorResponse = buildErrorResponse(
					"Debug flag is required for attendance reset",
					400,
				);
				res.status(400).json(errorResponse);
				return;
			}

			const employee = await helpers.validateEmployeeExists(employeeId);

			if (!employee) {
				const errorResponse = buildErrorResponse("Employee not found", 404);
				res.status(404).json(errorResponse);
				return;
			}

			const businessDate = getDateKeyInBusinessTimeZone(new Date());
			const businessDayDate = new Date(`${businessDate}T00:00:00.000Z`);
			const { start, end } = getBusinessDayBounds(new Date());

			const attendanceWhere = {
				organizationId: employee.organizationId,
				employeeId,
				isDeleted: false,
				date: {
					gte: start,
					lte: end,
				},
			};

			const [attendanceRows, obligationRows] = await Promise.all([
				prisma.attendance.findMany({
					where: attendanceWhere,
					select: { id: true },
				}),
				(prisma as any).attendanceObligation.findMany({
					where: {
						organizationId: employee.organizationId,
						employeeId,
						isDeleted: false,
						OR: [{ businessDate }, { date: businessDayDate }],
					},
					select: { id: true },
				}),
			]);

			const [obligationDeleteResult, attendanceDeleteResult] = await prisma.$transaction([
				(prisma as any).attendanceObligation.deleteMany({
					where: {
						id: { in: obligationRows.map((row: { id: string }) => row.id) },
					},
				}),
				prisma.attendance.deleteMany({
					where: {
						id: { in: attendanceRows.map((row) => row.id) },
					},
				}),
			]);

			await Promise.all(
				attendanceRows.map((row) => helpers.invalidateAttendanceCaches(row.id, employeeId)),
			);
			await invalidateCache.byPattern("cache:metrics:*");
			await invalidateCache.byPattern("cache:attendance:*");

			employeeLogger.warn(
				`Debug reset deleted today's attendance for employee ${employeeId}: ` +
					`${attendanceDeleteResult.count} attendance row(s), ` +
					`${obligationDeleteResult.count} obligation row(s) for ${businessDate}`,
			);

			res.status(200).json(
				buildSuccessResponse(
					"Debug attendance reset completed",
					{
						businessDate,
						attendanceDeleted: attendanceDeleteResult.count,
						attendanceObligationsDeleted: obligationDeleteResult.count,
					},
					200,
				),
			);
		} catch (error) {
			employeeLogger.error(
				`Error debug-resetting today's attendance for employee ${employeeId}: ${error}`,
			);
			const errorResponse = buildErrorResponse(
				config.ERROR.COMMON.INTERNAL_SERVER_ERROR,
				500,
			);
			res.status(500).json(errorResponse);
		}
	};

	const markAttendance = async (req: Request, res: Response, _next: NextFunction) => {
		const { id: employeeId } = req.params;
		let requestData = req.body;
		const contentType = req.get("Content-Type") || "";

		if (
			contentType.includes("application/x-www-form-urlencoded") ||
			contentType.includes("multipart/form-data")
		) {
			employeeLogger.info("Original form data:", JSON.stringify(req.body, null, 2));
			requestData = transformFormDataToObject(req.body);
			employeeLogger.info(
				"Transformed form data to object structure:",
				JSON.stringify(requestData, null, 2),
			);
		}

		try {
			if (!employeeId) {
				employeeLogger.error("Missing employee ID");
				const errorResponse = buildErrorResponse("Employee ID is required", 400);
				res.status(400).json(errorResponse);
				return;
			}

			// Validate employee exists
			const employee = await helpers.validateEmployeeExists(employeeId);

			if (!employee) {
				employeeLogger.error(`Employee not found: ${employeeId}`);
				const errorResponse = buildErrorResponse("Employee not found", 404);
				res.status(404).json(errorResponse);
				return;
			}

			// Add employeeId and organizationId to request data
			const validationData = {
				...requestData,
				employeeId,
				organizationId: employee.organizationId,
			};

			const validation = CreateAttendanceSchema.safeParse(validationData);
			if (!validation.success) {
				const formattedErrors = formatZodErrors(validation.error.format());
				employeeLogger.error(`Validation failed: ${JSON.stringify(formattedErrors)}`);
				const errorResponse = buildErrorResponse("Validation failed", 400, formattedErrors);
				res.status(400).json(errorResponse);
				return;
			}

			const { date, organizationId } = validation.data;
			const attendanceDate = date || new Date();
			if (
				isBeforeEffectiveEmploymentStartDate(
					employee as {
						employmentStartDate?: Date | null;
						employmentHireDate?: Date | null;
					},
					attendanceDate,
				)
			) {
				const effectiveStartDate = getEffectiveEmploymentStartDate(
					employee as {
						employmentStartDate?: Date | null;
						employmentHireDate?: Date | null;
					},
				);
				const formattedStartDate = effectiveStartDate
					? effectiveStartDate.toISOString().split("T")[0]
					: "the configured start date";
				const errorResponse = buildErrorResponse(
					`Attendance cannot be recorded before employment start date (${formattedStartDate})`,
					409,
				);
				res.status(409).json(errorResponse);
				return;
			}

			// Use attendance helper to build proper date range query
			const {
				where: attendanceQuery,
				startOfDay,
				endOfDay,
			} = buildAttendanceDateQuery(employeeId, attendanceDate, organizationId);

			employeeLogger.info(
				`Checking attendance for employee ${employeeId} on ${startOfDay.toISOString().split("T")[0]}`,
			);

			// Single DB call to check for existing attendance using date range
			const existingAttendance = await prisma.attendance.findFirst({
				where: attendanceQuery,
				select: {
					id: true,
					employeeId: true,
					date: true,
					timeIn: true,
					timeOut: true,
					status: true,
					notes: true,
				},
				orderBy: { createdAt: "desc" },
			});

			const hasExplicitTimeIn = Object.prototype.hasOwnProperty.call(requestData, "timeIn");
			const hasExplicitTimeOut = Object.prototype.hasOwnProperty.call(requestData, "timeOut");
			// Generic punch callbacks may omit time fields; after a time-in exists, treat the punch as clock-out.
			const requestedAction = hasExplicitTimeOut
				? "clock-out"
				: hasExplicitTimeIn
					? "clock-in"
					: existingAttendance?.timeIn
						? "clock-out"
						: "clock-in";
			const requestedTimeOut =
				requestedAction === "clock-out"
					? validation.data.timeOut || new Date()
					: validation.data.timeOut || null;
			const analysis = analyzeAttendanceAction(existingAttendance, requestedAction);

			if (!analysis.canProceed) {
				employeeLogger.warn(
					`Cannot ${requestedAction} for employee ${employeeId}: ${analysis.reason}`,
				);
				const errorResponse = buildErrorResponse(
					analysis.reason || "Action not allowed",
					409,
				);
				res.status(409).json(errorResponse);
				return;
			}

			// Handle clock-out (update existing record)
			if (analysis.action === "update-clock-out" && existingAttendance) {
				// Get the full attendance record to access scheduleSnapshot
				const fullAttendance = await prisma.attendance.findUnique({
					where: { id: existingAttendance.id },
					select: {
						id: true,
						employeeId: true,
						date: true,
						timeIn: true,
						timeOut: true,
						scheduleSnapshot: true,
						status: true,
						notes: true,
					},
				});

				if (!fullAttendance) {
					employeeLogger.error(`Attendance record not found: ${existingAttendance.id}`);
					const errorResponse = buildErrorResponse("Attendance record not found", 404);
					res.status(404).json(errorResponse);
					return;
				}

				// Calculate timekeeping metrics with timeOut
				const timekeepingCalc = calculateTimekeeping(
					fullAttendance.timeIn,
					requestedTimeOut,
					fullAttendance.scheduleSnapshot,
					fullAttendance.date || new Date(),
				);

				// Determine status based on calculations (unless explicitly provided)
				const finalStatus =
					validation.data.status || determineAttendanceStatus(timekeepingCalc, true);
				const overtimeApplication = await resolveOvertimePolicyApplication(
					prisma,
					organizationId,
					{
						calc: timekeepingCalc,
						timeIn: fullAttendance.timeIn,
						timeOut: requestedTimeOut,
						schedule: fullAttendance.scheduleSnapshot,
						date: fullAttendance.date || new Date(),
						attendanceStatus: finalStatus,
					},
				);

				const updatedAttendance = await prisma.attendance.update({
					where: { id: existingAttendance.id },
					data: {
						timeOut: requestedTimeOut,
						timeOutLocation: validation.data.timeOutLocation,
						status: finalStatus,
						behaviorFlags:
							finalStatus === "LEAVE" ? [] : overtimeApplication.behaviorFlags,
						notes: validation.data.notes || existingAttendance.notes,
						...(await fetchAttendanceEmployeeSnapshotFields(prisma, employeeId)),
						...overtimeApplication.timekeepingFields,
					},
					include: {
						employee: {
							select: {
								id: true,
								employeeId: true,
								personId: true,
							},
						},
					},
				});

				employeeLogger.info(
					`Attendance clock out updated: ${updatedAttendance.id} - ` +
						`hoursWorked=${updatedAttendance.hoursWorked}, ` +
						`earlyOutHours=${updatedAttendance.earlyOutHours}, ` +
						`lateHours=${updatedAttendance.lateHours}`,
				);

				// Invalidate cache
				const obligation = await applyAttendanceToObligation(prisma, {
					organizationId,
					employeeId,
					attendanceId: updatedAttendance.id,
				});
				emitAttendanceRealtimeEvent((req as any).io, {
					attendance: updatedAttendance,
					obligation,
					action: "clock_out_updated",
					source: "EMPLOYEE_ATTENDANCE_API",
				});
				await helpers.invalidateAttendanceCaches(updatedAttendance.id, employeeId);
				const refreshedTimesheet = await refreshTimesheetForAttendanceDate(prisma, {
					organizationId,
					employeeId,
					date: updatedAttendance.date || attendanceDate,
				});
				if (refreshedTimesheet) {
					await invalidateCache.byPattern("cache:timesheet:*");
				}

				logActivity(req, {
					userId: (req as any).user?.id || "unknown",
					action: config.ACTIVITY_LOG.EMPLOYEE.ACTIONS.MARK_ATTENDANCE,
					description: `${config.ACTIVITY_LOG.EMPLOYEE.DESCRIPTIONS.ATTENDANCE_MARKED}: ${updatedAttendance.id} (clock-out)`,
					page: {
						url: req.originalUrl,
						title: config.ACTIVITY_LOG.EMPLOYEE.PAGES.EMPLOYEE_ATTENDANCE,
					},
				});
				logAudit(req, {
					userId: (req as any).user?.id || "unknown",
					action: config.AUDIT_LOG.ACTIONS.UPDATE,
					resource: config.AUDIT_LOG.RESOURCES.ATTENDANCE,
					severity: config.AUDIT_LOG.SEVERITY.MEDIUM,
					entityType: config.AUDIT_LOG.ENTITY_TYPES.ATTENDANCE,
					entityId: updatedAttendance.id,
					changesBefore: fullAttendance,
					changesAfter: updatedAttendance,
					description: `${config.AUDIT_LOG.EMPLOYEE.DESCRIPTIONS.ATTENDANCE_MARKED}: ${updatedAttendance.id} (clock-out)`,
				});

				const successResponse = buildSuccessResponse(
					"Clock out successful",
					{ attendance: updatedAttendance },
					200,
				);
				res.status(200).json(successResponse);
				return;
			}

			const resolvedShift = await resolveEffectiveShift(prisma, {
				organizationId: employee.organizationId,
				employeeId,
				date: attendanceDate,
			});
			const scheduleSnapshot = resolvedShift
				? toAttendanceScheduleSnapshot(resolvedShift)
				: null;

			if (!scheduleSnapshot) {
				employeeLogger.warn(
					`No effective schedule found for employee ${employeeId}. Attendance will be created without schedule snapshot.`,
				);
			} else {
				employeeLogger.info(
					`Using effective schedule "${scheduleSnapshot.shiftTypeName || scheduleSnapshot.scheduleTemplateName || "Unknown"}" (${scheduleSnapshot.shiftTypeCode || "N/A"}) for employee ${employeeId}`,
				);
			}

			// Calculate timekeeping metrics for clock-in
			const timekeepingCalc = calculateTimekeeping(
				validation.data.timeIn || new Date(),
				validation.data.timeOut || null,
				scheduleSnapshot,
				attendanceDate,
			);

			// Determine status based on calculations (unless explicitly provided)
			const finalStatus =
				validation.data.status ||
				determineAttendanceStatus(timekeepingCalc, !!validation.data.timeOut);
			const overtimeApplication = await resolveOvertimePolicyApplication(
				prisma,
				organizationId,
				{
					calc: timekeepingCalc,
					timeIn: validation.data.timeIn || new Date(),
					timeOut: validation.data.timeOut || null,
					schedule: scheduleSnapshot,
					date: attendanceDate,
					attendanceStatus: finalStatus,
				},
			);

			// Create new attendance record with scheduleSnapshot and timekeeping calculations
			// Default isManualEntry to false (biometric) if not explicitly provided
			const attendanceData = {
				...validation.data,
				status: finalStatus,
				behaviorFlags:
					finalStatus === "LEAVE" ? [] : overtimeApplication.behaviorFlags,
				...(scheduleSnapshot ? { scheduleSnapshot: scheduleSnapshot as any } : {}),
				// If isManualEntry is not provided, default to false (biometric)
				// Only set to true if explicitly provided in the request
				isManualEntry: validation.data.isManualEntry ?? false,
				...(await fetchAttendanceEmployeeSnapshotFields(prisma, employeeId)),
				...overtimeApplication.timekeepingFields,
			};

			const attendance = await prisma.attendance.create({
				data: attendanceData,
			});
			employeeLogger.info(`Attendance created successfully: ${attendance.id}`);
			const obligation = await applyAttendanceToObligation(prisma, {
				organizationId,
				employeeId,
				attendanceId: attendance.id,
			});
			emitAttendanceRealtimeEvent((req as any).io, {
				attendance,
				obligation,
				action: "clock_in_created",
				source: "EMPLOYEE_ATTENDANCE_API",
			});

			// Invalidate cache
			await helpers.invalidateAttendanceCaches(undefined, employeeId);
			const refreshedTimesheet = await refreshTimesheetForAttendanceDate(prisma, {
				organizationId,
				employeeId,
				date: attendance.date || attendanceDate,
			});
			if (refreshedTimesheet) {
				await invalidateCache.byPattern("cache:timesheet:*");
			}
			employeeLogger.info("Cache invalidated after attendance creation");

			logActivity(req, {
				userId: (req as any).user?.id || "unknown",
				action: config.ACTIVITY_LOG.EMPLOYEE.ACTIONS.MARK_ATTENDANCE,
				description: `${config.ACTIVITY_LOG.EMPLOYEE.DESCRIPTIONS.ATTENDANCE_MARKED}: ${attendance.id}`,
				page: {
					url: req.originalUrl,
					title: config.ACTIVITY_LOG.EMPLOYEE.PAGES.EMPLOYEE_ATTENDANCE,
				},
			});
			logAudit(req, {
				userId: (req as any).user?.id || "unknown",
				action: config.AUDIT_LOG.ACTIONS.CREATE,
				resource: config.AUDIT_LOG.RESOURCES.ATTENDANCE,
				severity: config.AUDIT_LOG.SEVERITY.MEDIUM,
				entityType: config.AUDIT_LOG.ENTITY_TYPES.ATTENDANCE,
				entityId: attendance.id,
				changesBefore: null,
				changesAfter: {
					id: attendance.id,
					employeeId: attendance.employeeId,
					date: attendance.date,
					status: attendance.status,
				},
				description: `${config.AUDIT_LOG.EMPLOYEE.DESCRIPTIONS.ATTENDANCE_MARKED}: ${attendance.id}`,
			});

			const successResponse = buildSuccessResponse(
				"Attendance marked successfully",
				{ attendance },
				201,
			);
			res.status(201).json(successResponse);
		} catch (error) {
			employeeLogger.error(`Error marking attendance for employee ${employeeId}: ${error}`);
			const errorResponse = buildErrorResponse(
				config.ERROR.COMMON.INTERNAL_SERVER_ERROR,
				500,
			);
			res.status(500).json(errorResponse);
		}
	};

	// Get all departments managed by an employee
	const getManagedDepartments = async (req: Request, res: Response, _next: NextFunction) => {
		const { id: employeeId } = req.params;
		const { fields, include, count, active } = req.query;

		try {
			if (!employeeId) {
				employeeLogger.error(config.ERROR.QUERY_PARAMS.MISSING_ID);
				const errorResponse = buildErrorResponse(config.ERROR.QUERY_PARAMS.MISSING_ID, 400);
				res.status(400).json(errorResponse);
				return;
			}

			employeeLogger.info(`Getting managed departments for employee: ${employeeId}`);

			// Check if employee exists
			const employee = await helpers.validateEmployeeExists(employeeId, {
				id: true,
				organizationId: true,
				departmentId: true,
			});

			if (!employee) {
				employeeLogger.error(`Employee not found: ${employeeId}`);
				const errorResponse = buildErrorResponse("Employee not found", 404);
				res.status(404).json(errorResponse);
				return;
			}

			// Build where clause for departments
			const whereClause: Prisma.DepartmentWhereInput = {
				managerId: employeeId,
				isDeleted: false,
			};

			// Filter active departments if requested
			if (active === "true") {
				whereClause.isActive = true;
			}

			// Build select fields
			const selectFields = getNestedFields(fields as string);

			// Build include fields
			const includeFields = helpers.buildDepartmentIncludeFields(include as string);

			// Build query
			const query: Prisma.DepartmentFindManyArgs = {
				where: whereClause,
				orderBy: { createdAt: "desc" },
			};

			if (selectFields && Object.keys(selectFields).length > 0) {
				query.select = selectFields;
			}

			if (Object.keys(includeFields).length > 0) {
				query.include = includeFields;
			}

			// Execute queries
			const [departments, totalCount] = await Promise.all([
				prisma.department.findMany(query),
				count === "true" ? prisma.department.count({ where: whereClause }) : 0,
			]);

			// Add employee count to each department if requested
			let departmentsWithCount = departments;
			if (count === "true") {
				departmentsWithCount = await Promise.all(
					departments.map(
						async (dept) => await helpers.addEmployeeCountToDepartment(dept),
					),
				);
			}

			employeeLogger.info(
				`Retrieved ${departments.length} managed departments for employee ${employeeId}`,
			);

			// Log activity
			logActivity(req, {
				userId: (req as any).user?.id || "unknown",
				action: "GET_MANAGED_DEPARTMENTS",
				description: `Retrieved managed departments for employee ${employeeId}`,
				page: {
					url: req.originalUrl,
					title: "Employee Managed Departments",
				},
			});

			const responseData: Record<string, any> = {
				departments: departmentsWithCount,
				...(count === "true" && { count: totalCount }),
			};

			const successResponse = buildSuccessResponse(
				"Managed departments retrieved successfully",
				responseData,
				200,
			);
			res.status(200).json(successResponse);
		} catch (error) {
			employeeLogger.error(
				`Error getting managed departments for employee ${employeeId}: ${error}`,
			);
			const errorResponse = buildErrorResponse(
				config.ERROR.COMMON.INTERNAL_SERVER_ERROR,
				500,
			);
			res.status(500).json(errorResponse);
		}
	};

	// Get specific managed department details
	const getManagedDepartmentById = async (req: Request, res: Response, _next: NextFunction) => {
		const { id: employeeId, departmentId } = req.params;
		const { fields, include, count } = req.query;

		try {
			if (!employeeId || !departmentId) {
				employeeLogger.error("Missing employee ID or department ID");
				const errorResponse = buildErrorResponse(
					"Missing employee ID or department ID",
					400,
				);
				res.status(400).json(errorResponse);
				return;
			}

			employeeLogger.info(
				`Getting managed department ${departmentId} for employee: ${employeeId}`,
			);

			// Check if employee exists
			const employee = await helpers.validateEmployeeExists(employeeId, {
				id: true,
				organizationId: true,
				departmentId: true,
			});

			if (!employee) {
				employeeLogger.error(`Employee not found: ${employeeId}`);
				const errorResponse = buildErrorResponse("Employee not found", 404);
				res.status(404).json(errorResponse);
				return;
			}

			// Build where clause for department
			const whereClause: Prisma.DepartmentWhereInput = {
				id: departmentId,
				managerId: employeeId,
				isDeleted: false,
			};

			// Build select fields
			const selectFields = getNestedFields(fields as string);

			// Build include fields
			const includeFields = helpers.buildDepartmentIncludeFields(include as string);

			// Build query
			const query: Prisma.DepartmentFindFirstArgs = {
				where: whereClause,
			};

			if (selectFields && Object.keys(selectFields).length > 0) {
				query.select = selectFields;
			}

			if (Object.keys(includeFields).length > 0) {
				query.include = includeFields;
			}

			// Execute query
			const department = await prisma.department.findFirst(query);

			if (!department) {
				employeeLogger.error(
					`Managed department ${departmentId} not found for employee ${employeeId}`,
				);
				const errorResponse = buildErrorResponse("Managed department not found", 404);
				res.status(404).json(errorResponse);
				return;
			}

			// Add employee count if requested
			let departmentWithCount = department;
			if (count === "true") {
				departmentWithCount = await helpers.addEmployeeCountToDepartment(
					department,
					departmentId,
				);
			}

			employeeLogger.info(
				`Retrieved managed department ${departmentId} for employee ${employeeId}`,
			);

			// Log activity
			logActivity(req, {
				userId: (req as any).user?.id || "unknown",
				action: "GET_MANAGED_DEPARTMENT",
				description: `Retrieved managed department ${departmentId} for employee ${employeeId}`,
				page: {
					url: req.originalUrl,
					title: "Employee Managed Department Details",
				},
			});

			const responseData: Record<string, any> = {
				department: departmentWithCount,
			};

			const successResponse = buildSuccessResponse(
				"Managed department retrieved successfully",
				responseData,
				200,
			);
			res.status(200).json(successResponse);
		} catch (error) {
			employeeLogger.error(
				`Error getting managed department ${departmentId} for employee ${employeeId}: ${error}`,
			);
			const errorResponse = buildErrorResponse(
				config.ERROR.COMMON.INTERNAL_SERVER_ERROR,
				500,
			);
			res.status(500).json(errorResponse);
		}
	};

	// Get the department that an employee belongs to
	const getEmployeeDepartment = async (req: Request, res: Response, _next: NextFunction) => {
		const { id: employeeId } = req.params;
		const { fields, include, count } = req.query;

		try {
			if (!employeeId) {
				employeeLogger.error(config.ERROR.QUERY_PARAMS.MISSING_ID);
				const errorResponse = buildErrorResponse(config.ERROR.QUERY_PARAMS.MISSING_ID, 400);
				res.status(400).json(errorResponse);
				return;
			}

			employeeLogger.info(`Getting department for employee: ${employeeId}`);

			// Check if employee exists
			const employee = await helpers.validateEmployeeExists(employeeId, {
				id: true,
				organizationId: true,
				departmentId: true,
			});

			if (!employee) {
				employeeLogger.error(`Employee not found: ${employeeId}`);
				const errorResponse = buildErrorResponse("Employee not found", 404);
				res.status(404).json(errorResponse);
				return;
			}

			if (!employee.departmentId) {
				employeeLogger.error(`Employee ${employeeId} has no department assigned`);
				const errorResponse = buildErrorResponse(
					"Employee has no department assigned",
					404,
				);
				res.status(404).json(errorResponse);
				return;
			}

			// Build where clause for department
			const whereClause: Prisma.DepartmentWhereInput = {
				id: employee.departmentId,
				isDeleted: false,
			};

			// Build select fields
			const selectFields = getNestedFields(fields as string);

			// Build include fields
			const includeFields = helpers.buildDepartmentIncludeFields(include as string);

			// Build query
			const query: Prisma.DepartmentFindFirstArgs = {
				where: whereClause,
			};

			if (selectFields && Object.keys(selectFields).length > 0) {
				query.select = selectFields;
			}

			if (Object.keys(includeFields).length > 0) {
				query.include = includeFields;
			}

			// Execute query
			const department = await prisma.department.findFirst(query);

			if (!department) {
				employeeLogger.error(`Department not found for employee ${employeeId}`);
				const errorResponse = buildErrorResponse("Department not found", 404);
				res.status(404).json(errorResponse);
				return;
			}

			// Add employee count if requested
			let departmentWithCount = department;
			if (count === "true") {
				const employeeCount = await prisma.employee.count({
					where: { departmentId: employee.departmentId, isDeleted: false },
				});
				departmentWithCount = { ...department, employeeCount } as any;
			}

			employeeLogger.info(`Retrieved department for employee ${employeeId}`);

			// Log activity
			logActivity(req, {
				userId: (req as any).user?.id || "unknown",
				action: "GET_EMPLOYEE_DEPARTMENT",
				description: `Retrieved department for employee ${employeeId}`,
				page: {
					url: req.originalUrl,
					title: "Employee Department",
				},
			});

			const responseData: Record<string, any> = {
				department: departmentWithCount,
			};

			const successResponse = buildSuccessResponse(
				"Employee department retrieved successfully",
				responseData,
				200,
			);
			res.status(200).json(successResponse);
		} catch (error) {
			employeeLogger.error(`Error getting department for employee ${employeeId}: ${error}`);
			const errorResponse = buildErrorResponse(
				config.ERROR.COMMON.INTERNAL_SERVER_ERROR,
				500,
			);
			res.status(500).json(errorResponse);
		}
	};

	const getDocumentPriorities = async (req: Request, res: Response, _next: NextFunction) => {
		const { id: employeeId } = req.params;

		try {
			if (!employeeId) {
				const errorResponse = buildErrorResponse(config.ERROR.QUERY_PARAMS.MISSING_ID, 400);
				res.status(400).json(errorResponse);
				return;
			}

			const employee = await prisma.employee.findFirst({
				where: {
					id: employeeId,
					isDeleted: false,
				},
				select: {
					id: true,
					organizationId: true,
				},
			});

			if (!employee) {
				const errorResponse = buildErrorResponse("Employee not found", 404);
				res.status(404).json(errorResponse);
				return;
			}

			const { items, summary } = await getEmployeeDocumentPriorityData({
				prisma,
				employeeId,
				organizationId: employee.organizationId,
			});

			logActivity(req, {
				userId: (req as any).user?.id || "unknown",
				action: config.ACTIVITY_LOG.EMPLOYEE.ACTIONS.GET_DOCUMENT_PRIORITIES,
				description: `${config.ACTIVITY_LOG.EMPLOYEE.DESCRIPTIONS.DOCUMENT_PRIORITIES_RETRIEVED}: ${employeeId}`,
				page: {
					url: req.originalUrl,
					title: config.ACTIVITY_LOG.EMPLOYEE.PAGES.EMPLOYEE_DOCUMENT_PRIORITIES,
				},
			});

			res.status(200).json(
				buildSuccessResponse(
					"Employee document priorities retrieved successfully",
					{
						summary,
						items,
					},
					200,
				),
			);
		} catch (error) {
			employeeLogger.error(
				`Error getting document priorities for employee ${employeeId}: ${error}`,
			);
			res.status(500).json(
				buildErrorResponse(config.ERROR.COMMON.INTERNAL_SERVER_ERROR, 500),
			);
		}
	};

	const importEmployees = async (req: Request, res: Response, _next: NextFunction) => {
		const organizationId = (req as any).organizationId;
		const authToken = req.headers.authorization?.split(" ")[1];

		if (!organizationId) {
			const errorResponse = buildErrorResponse("Organization ID not found", 401);
			res.status(401).json(errorResponse);
			return;
		}

		if (!authToken) {
			const errorResponse = buildErrorResponse("Authorization token not found", 401);
			res.status(401).json(errorResponse);
			return;
		}

		try {
			const file = (req as any).file;

			if (!file) {
				const errorResponse = buildErrorResponse("No file uploaded", 400);
				res.status(400).json(errorResponse);
				return;
			}

			employeeLogger.info(
				`Starting employee import for organization ${organizationId}, file: ${file.originalname}`,
			);

			// Parse file using XLSX with proper CSV handling
			const workbook = XLSX.read(file.buffer, {
				type: "buffer",
				// Critical: For CSV files, preserve empty cells
				raw: false,
				// Parse dates as strings to avoid auto-conversion
				cellDates: false,
			});
			const sheetName = workbook.SheetNames[0];
			const worksheet = workbook.Sheets[sheetName];

			// Convert to JSON with proper empty cell handling
			const rawData = XLSX.utils.sheet_to_json(worksheet, {
				// Set empty cells to empty string
				defval: "",
				// Don't skip empty cells
				blankrows: true,
				// Use raw values to prevent type conversion
				raw: false,
			});

			if (!rawData || rawData.length === 0) {
				const errorResponse = buildErrorResponse("Excel file is empty or invalid", 400);
				res.status(400).json(errorResponse);
				return;
			}

			// Map raw data to EmployeeImportRow and ensure EMP_ID is string
			// Also trim all string values and handle empty strings
			const rows = rawData.map((row: any) => {
				const cleanedRow: any = {};
				Object.keys(row).forEach((key) => {
					const value = row[key];
					// Trim strings and convert empty/whitespace to undefined
					if (typeof value === "string") {
						const trimmed = value.trim();
						cleanedRow[key] = trimmed === "" ? undefined : trimmed;
					} else {
						cleanedRow[key] = value;
					}
				});
				// Ensure EMP_ID is always a string
				if (cleanedRow.EMP_ID !== undefined) {
					cleanedRow.EMP_ID = String(cleanedRow.EMP_ID);
				}
				cleanedRow.DM3_IMPORT_WORKBOOK = file.originalname;
				return cleanedRow as EmployeeImportRow;
			});

			employeeLogger.info(`Parsed ${rows.length} rows from file ${file.originalname}`);

			const autoCreate = req.body.autoCreate === "true" || req.body.autoCreate === true;
			const applyDefaultLeaveBalances =
				req.body.applyDefaultLeaveBalances === undefined
					? false
					: req.body.applyDefaultLeaveBalances === "true" ||
						req.body.applyDefaultLeaveBalances === true;
			const importMode = req.body.importMode === "fast" ? "fast" : "full";
			const enableAccountProvisioning =
				req.body.enableAccountProvisioning === undefined
					? importMode !== "fast"
					: req.body.enableAccountProvisioning === "true" ||
						req.body.enableAccountProvisioning === true;
			const enableCredentialEmails =
				req.body.enableCredentialEmails === undefined
					? importMode !== "fast" && enableAccountProvisioning
					: req.body.enableCredentialEmails === "true" ||
						req.body.enableCredentialEmails === true;
			const enablePostActions =
				req.body.enablePostActions === undefined
					? importMode !== "fast" && enableAccountProvisioning
					: req.body.enablePostActions === "true" ||
						req.body.enablePostActions === true;

			const importService = new EmployeeImportService(prisma);

			// Create job and get jobId immediately (before processing)
			const jobId = importService.startImport(rows.length);

			employeeLogger.info(`Started import job ${jobId} for ${rows.length} employees`);

			// Process import in background (don't await - let it run async)
			importService
				.processImport({
					jobId,
					rows,
					organizationId,
					authToken,
					autoCreate,
					applyDefaultLeaveBalances,
					importMode,
					enableAccountProvisioning,
					enableCredentialEmails,
					enablePostActions,
				})
				.catch((error) => {
					employeeLogger.error(`Error processing import job ${jobId}:`, error);
					// Mark job as failed - access the job directly from the Map
					const job = EmployeeImportService.getJobProgress(jobId);
					if (job) {
						const errorMessage =
							error?.message || String(error || "Employee import failed unexpectedly");
						job.status = "failed";
						job.phase = "failed";
						job.failed = Math.max(job.failed || 0, Math.max(1, job.total - job.processed));
						job.blocked = Math.max(job.blocked || 0, job.failed || 1);
						job.errors.push({
							row: 0,
							employeeId: "batch",
							error: errorMessage,
						});
						job.recentLog.push({
							row: 0,
							employeeId: "batch",
							success: false,
							message: `[system] ${errorMessage}`,
							createdAt: new Date().toISOString(),
						});
						if (job.recentLog.length > 50) {
							job.recentLog.splice(0, job.recentLog.length - 50);
						}
						job.completedAt = new Date();
					}
				});

			logActivity(req, {
				userId: (req as any).user?.id || "unknown",
				action: config.ACTIVITY_LOG.EMPLOYEE.ACTIONS.IMPORT_EMPLOYEES,
				description: `${config.ACTIVITY_LOG.EMPLOYEE.DESCRIPTIONS.EMPLOYEES_IMPORTED}: ${rows.length} row(s), jobId=${jobId}`,
				page: {
					url: req.originalUrl,
					title: config.ACTIVITY_LOG.EMPLOYEE.PAGES.EMPLOYEE_IMPORT,
				},
			});
			logAudit(req, {
				userId: (req as any).user?.id || "unknown",
				action: config.AUDIT_LOG.ACTIONS.CREATE,
				resource: config.AUDIT_LOG.RESOURCES.EMPLOYEE,
				severity: config.AUDIT_LOG.SEVERITY.LOW,
				entityType: config.AUDIT_LOG.ENTITY_TYPES.EMPLOYEE,
				entityId: jobId,
				changesBefore: null,
				changesAfter: {
					jobId,
					totalRows: rows.length,
					organizationId,
					importMode,
				},
				description: `${config.AUDIT_LOG.EMPLOYEE.DESCRIPTIONS.EMPLOYEES_IMPORTED}: ${rows.length} row(s), jobId=${jobId}`,
				organizationId,
			});

			// Return jobId immediately (202 Accepted for async operation)
			const responseData = {
				jobId,
				message: "Import started",
				total: rows.length,
			};

			const successResponse = buildSuccessResponse(
				"Employee import started successfully",
				responseData,
				202,
			);
			res.setHeader("Location", `/api/employee/import/progress/${jobId}`);
			res.setHeader("Retry-After", "2");
			res.status(202).json(successResponse);
		} catch (error) {
			employeeLogger.error(`Error importing employees: ${error}`);
			const errorResponse = buildErrorResponse(
				config.ERROR.COMMON.INTERNAL_SERVER_ERROR,
				500,
			);
			res.status(500).json(errorResponse);
		}
	};

	const getImportProgress = async (req: Request, res: Response, _next: NextFunction) => {
		try {
			const { jobId } = req.params;

			if (!jobId) {
				const errorResponse = buildErrorResponse("Job ID is required", 400);
				res.status(400).json(errorResponse);
				return;
			}

			const progress = EmployeeImportService.getJobProgress(jobId);

			if (!progress) {
				const errorResponse = buildErrorResponse("Import job not found or expired", 404);
				res.status(404).json(errorResponse);
				return;
			}

			// Serialize for JSON (dates + ensure recentLog exists)
			const payload = {
				...progress,
				recentLog: progress.recentLog || [],
				credentialExports: progress.credentialExports || [],
				warnings: progress.warnings || [],
				created: progress.created || 0,
				updated: progress.updated || 0,
				skipped: progress.skipped || 0,
				blocked: progress.blocked || progress.failed || 0,
				durationMs: progress.completedAt
					? progress.completedAt.getTime() - progress.startedAt.getTime()
					: Date.now() - progress.startedAt.getTime(),
				startedAt:
					progress.startedAt instanceof Date
						? progress.startedAt.toISOString()
						: progress.startedAt,
				completedAt: progress.completedAt
					? progress.completedAt instanceof Date
						? progress.completedAt.toISOString()
						: progress.completedAt
					: undefined,
			};

			const successResponse = buildSuccessResponse(
				"Import progress retrieved successfully",
				payload,
				200,
			);
			res.status(200).json(successResponse);
		} catch (error) {
			employeeLogger.error(`Error getting import progress: ${error}`);
			const errorResponse = buildErrorResponse(
				config.ERROR.COMMON.INTERNAL_SERVER_ERROR,
				500,
			);
			res.status(500).json(errorResponse);
		}
	};

	// Get filtered users from auth service by role
	const getEmployeesByUserRole = async (req: Request, res: Response, _next: NextFunction) => {
		const { roles } = req.query;

		try {
			employeeLogger.info("Getting filtered users from auth service");

			// Parse role names from query parameter
			// Format: ?roles=hris-hr-manager,hris-hr-user or ?roles=hris-hr-manager
			let roleNames: string[] | undefined;
			if (roles && typeof roles === "string") {
				roleNames = roles.split(",").map((role) => role.trim());
				employeeLogger.info(`Filtering by roles: ${roleNames.join(", ")}`);
			} else {
				// Default to HR manager and HR user roles
				roleNames = ["hris-hr-manager", "hris-hr-user"];
				employeeLogger.info(`Using default roles: ${roleNames.join(", ")}`);
			}

			// Fetch filtered users from auth service
			const filteredUsers = await helpers.fetchFilteredUsers(req, roleNames);

			// Check if filteredUsers is null or not an array
			if (!filteredUsers) {
				employeeLogger.error("Failed to fetch users from auth service");
				const errorResponse = buildErrorResponse(
					"Failed to fetch users from authentication service",
					500,
				);
				res.status(500).json(errorResponse);
				return;
			}

			if (!Array.isArray(filteredUsers)) {
				employeeLogger.error(
					`Expected array from fetchFilteredUsers but got: ${typeof filteredUsers}`,
				);
				const errorResponse = buildErrorResponse(
					"Invalid response from authentication service",
					500,
				);
				res.status(500).json(errorResponse);
				return;
			}

			employeeLogger.info(`Retrieved ${filteredUsers.length} users from auth service`);

			// Log activity
			logActivity(req, {
				userId: (req as any).user?.id || "unknown",
				action: "GET_FILTERED_USERS",
				description: `Retrieved filtered users by roles: ${roleNames.join(", ")}`,
				page: {
					url: req.originalUrl,
					title: "Filtered Users by Role",
				},
			});

			const responseData = {
				users: filteredUsers,
				count: filteredUsers.length,
				filteredRoles: roleNames,
			};

			const successResponse = buildSuccessResponse(
				"Users retrieved successfully from auth service",
				responseData,
				200,
			);
			res.status(200).json(successResponse);
		} catch (error) {
			employeeLogger.error(`Error getting filtered users: ${error}`);
			const errorResponse = buildErrorResponse(
				config.ERROR.COMMON.INTERNAL_SERVER_ERROR,
				500,
			);
			res.status(500).json(errorResponse);
		}
	};

	const uploadDocument = async (req: Request, res: Response, _next: NextFunction) => {
		const { id } = req.params;
		const { type, documentTypeId, number, issueDate, expiryDate, fieldValues } = req.body;

		try {
			employeeLogger.info(`Uploading document for employee: ${id}`);

			// Check if employee exists
			const existingEmployee = await prisma.employee.findUnique({
				where: { id },
				select: {
					id: true,
					employeeId: true,
					organizationId: true,
					departmentId: true,
					role: true,
					employmentHireDate: true,
				},
			});

			if (!existingEmployee) {
				employeeLogger.error(`Employee not found: ${id}`);
				const errorResponse = buildErrorResponse("Employee not found", 404);
				res.status(404).json(errorResponse);
				return;
			}

			const beforeDocuments = await prisma.document.findMany({
				where: {
					employeeId: id,
					isDeleted: false,
				},
			});

			const parsedFieldValues =
				typeof fieldValues === "string"
					? (() => {
							try {
								return JSON.parse(fieldValues);
							} catch (_error) {
								return null;
							}
						})()
					: fieldValues || null;
			const actorEmployeeId =
				String((req as any)?.metadata?.employee?.id || "").trim() || null;

			const matchedDocumentType = await findMatchingDocumentType({
				prisma,
				organizationId: existingEmployee.organizationId,
				documentTypeId,
				type,
			});

			const documentType = matchedDocumentType?.code || type || "document";
			const documentNumber =
				number ||
				req.file?.originalname ||
				`${String(documentType || "document").toUpperCase()}-${Date.now()}`;
			const documentValidationErrors = validateEmployeeDocumentAgainstDocumentType(
				matchedDocumentType,
				{
					number: documentNumber,
					issueDate,
					expiryDate,
					fieldValues: parsedFieldValues,
				},
				"employee.documents.0",
			);
			if (documentValidationErrors.length > 0) {
				res.status(400).json(
					buildErrorResponse("Validation failed", 400, documentValidationErrors),
				);
				return;
			}
			let fileUrl: string | null = null;
			let fileExt: string | null = null;

			if (req.file) {
				const { uploadToCloudinary } = require("../../helper/cloudinary.helper");

				employeeLogger.info("Uploading document to Cloudinary");
				const uploadResult = await uploadToCloudinary(req.file.buffer, {
					folder: "employees/documents",
					resourceType: "auto",
					publicId: `document_${id}_${documentType}_${req.file.originalname.replace(/\.[^/.]+$/, "")}`,
				});

				if (!uploadResult.success || !uploadResult.secureUrl) {
					employeeLogger.error("Failed to upload document to Cloudinary");
					const errorResponse = buildErrorResponse("Failed to upload document file", 500);
					res.status(500).json(errorResponse);
					return;
				}

				fileUrl = uploadResult.secureUrl;
				fileExt = uploadResult.format || req.file.originalname?.split(".").pop() || null;
				employeeLogger.info(`Document uploaded to Cloudinary: ${fileUrl}`);
			}

			const requiresReview = shouldRequireDocumentApproval({
				actorEmployeeId,
				targetEmployeeId: id,
				documentType: matchedDocumentType,
			});
			const isHrDirectUpload = Boolean(actorEmployeeId && actorEmployeeId !== id);
			const now = new Date();

			// Create document object
			const newDocument = {
				name: matchedDocumentType?.name || req.file?.originalname || documentType,
				type: documentType,
				documentTypeId: matchedDocumentType?.id || null,
				number: documentNumber,
				issueDate: issueDate ? new Date(issueDate) : new Date(),
				expiryDate:
					typeof expiryDate === "string" && expiryDate.trim()
						? new Date(expiryDate)
						: null,
				fieldValues: parsedFieldValues,
				fileUrl,
				ext: fileExt,
				metadata: requiresReview
					? buildPendingDocumentReviewMetadata({
							submittedByEmployeeId: actorEmployeeId!,
						})
					: isHrDirectUpload
						? buildDocumentReviewCompatibilityMetadata({
								status: DocumentReviewStatus.APPROVED,
								submittedAt: now,
								submittedByEmployeeId: actorEmployeeId,
								approvedAt: now,
								approvedByEmployeeId: actorEmployeeId,
								source: DocumentReviewSource.HR_UPLOAD,
							})
						: null,
				...(requiresReview
					? buildPendingDocumentReviewData({
							submittedByEmployeeId: actorEmployeeId!,
							source: DocumentReviewSource.EMPLOYEE_UPLOAD,
						})
					: isHrDirectUpload
						? {
								reviewStatus: DocumentReviewStatus.APPROVED,
								reviewSubmittedAt: now,
								reviewSubmittedById: actorEmployeeId,
								reviewApprovedAt: now,
								reviewApprovedById: actorEmployeeId,
								reviewRejectedAt: null,
								reviewRejectedById: null,
								reviewRejectionReason: null,
								reviewSource: DocumentReviewSource.HR_UPLOAD,
							}
						: {}),
			};

			// Create related Document model record
			const createdDocument = await prisma.document.create({
				data: {
					employeeId: id,
					...newDocument,
				},
			});

			if (requiresReview) {
				await createDocumentReviewEvent({
					prisma,
					organizationId: existingEmployee.organizationId,
					document: createdDocument,
					eventType: DocumentReviewEventType.SUBMITTED,
					toStatus: DocumentReviewStatus.PENDING,
					actorEmployeeId,
					source: DocumentReviewSource.EMPLOYEE_UPLOAD,
				});

				try {
					await publishDocumentReviewSubmittedNotification(prisma, (req as any).io, {
						organizationId: existingEmployee.organizationId,
						documentId: createdDocument.id,
						employeeId: existingEmployee.id,
						documentName: matchedDocumentType?.name || createdDocument.name,
						documentTypeCode: matchedDocumentType?.code || createdDocument.type,
						sourceEmployeeId: actorEmployeeId,
					});
				} catch (notificationError) {
					employeeLogger.warn(
						`Failed to publish document review notification for ${createdDocument.id}: ${notificationError}`,
					);
				}
			} else if (isHrDirectUpload) {
				await createDocumentReviewEvent({
					prisma,
					organizationId: existingEmployee.organizationId,
					document: {
						...createdDocument,
						reviewStatus: null,
						metadata: null,
					},
					eventType: DocumentReviewEventType.APPROVED,
					toStatus: DocumentReviewStatus.APPROVED,
					actorEmployeeId,
					comments: "HR recorded this document directly.",
					source: DocumentReviewSource.HR_UPLOAD,
				});
			}

			await reconcileEmployeeOnboardingState({
				prisma,
				organizationId: existingEmployee.organizationId,
				employeeId: id,
				targetDate: existingEmployee.employmentHireDate || new Date(),
				departmentId: existingEmployee.departmentId,
				role: existingEmployee.role,
			});

			const updatedEmployee = await prisma.employee.findUnique({
				where: { id },
				include: {
					person: {
						select: {
							personalInfo: true,
							contactInfo: true,
						},
					},
					documents: {
						where: { isDeleted: false },
						include: {
							documentType: {
								select: {
									id: true,
									code: true,
									name: true,
									category: true,
									isRequired: true,
									isEmployeeVisible: true,
									fields: true,
								},
							},
						},
					},
					department: {
						select: {
							id: true,
							name: true,
							code: true,
						},
					},
					position: {
						select: {
							id: true,
							title: true,
						},
					},
				},
			});

			await logEmployeeDocumentConfigurationAudit({
				req,
				employee: {
					id: existingEmployee.id,
					employeeId: existingEmployee.employeeId,
					organizationId: existingEmployee.organizationId,
				},
				beforeDocuments,
				afterDocuments: updatedEmployee?.documents || [],
			});
			logAudit(req, {
				userId: (req as any).user?.id || "unknown",
				action: config.AUDIT_LOG.ACTIONS.CREATE,
				resource: config.AUDIT_LOG.RESOURCES.DOCUMENT,
				severity: config.AUDIT_LOG.SEVERITY.MEDIUM,
				entityType: config.AUDIT_LOG.ENTITY_TYPES.DOCUMENT,
				entityId: createdDocument.id,
				changesBefore: null,
				changesAfter: {
					id: createdDocument.id,
					type: createdDocument.type,
					employeeId: id,
				},
				description: `${config.AUDIT_LOG.EMPLOYEE.DESCRIPTIONS.EMPLOYEE_DOCUMENT_UPLOADED}: ${createdDocument.id}`,
				organizationId: existingEmployee.organizationId,
			});

			// Invalidate cache
			try {
				await invalidateEmployeeDocumentCaches(id);
				employeeLogger.info(`Cache invalidated after document upload for employee ${id}`);
			} catch (cacheError) {
				employeeLogger.warn(
					"Failed to invalidate cache after document upload:",
					cacheError,
				);
			}

			logActivity(req, {
				userId: (req as any).user?.id || "unknown",
				action: config.ACTIVITY_LOG.EMPLOYEE.ACTIONS.UPLOAD_EMPLOYEE_DOCUMENT,
				description: `${config.ACTIVITY_LOG.EMPLOYEE.DESCRIPTIONS.EMPLOYEE_DOCUMENT_UPLOADED}: ${createdDocument.id} (${documentType})`,
				page: {
					url: req.originalUrl,
					title: config.ACTIVITY_LOG.EMPLOYEE.PAGES.EMPLOYEE_DOCUMENT,
				},
			});

			employeeLogger.info(`Document uploaded successfully for employee: ${id}`);
			const successResponse = buildSuccessResponse(
				"Document uploaded successfully",
				{ employee: updatedEmployee, document: createdDocument },
				200,
			);
			res.status(200).json(successResponse);
		} catch (error) {
			employeeLogger.error(`Failed to upload document: ${error}`);
			const errorResponse = buildErrorResponse(
				config.ERROR.COMMON.INTERNAL_SERVER_ERROR,
				500,
			);
			res.status(500).json(errorResponse);
		}
	};

	const updateDocument = async (req: Request, res: Response, _next: NextFunction) => {
		const { documentNumber } = req.params;
		const { type, documentTypeId, number, issueDate, expiryDate, fieldValues } = req.body;
		const documentLookupValue = String(documentNumber || "").trim();
		const scopedEmployeeId = String(req.query.employeeId || "").trim() || null;

		try {
			employeeLogger.info(`Updating document: ${documentLookupValue}`);

			const existingDocument = await findEmployeeDocumentByLookupValue(
				prisma,
				documentLookupValue,
				scopedEmployeeId,
			);

			if (!existingDocument) {
				employeeLogger.error(`Document not found: ${documentLookupValue}`);
				const errorResponse = buildErrorResponse("Document not found", 404);
				res.status(404).json(errorResponse);
				return;
			}

			const existingEmployee = await prisma.employee.findUnique({
				where: { id: existingDocument.employeeId },
				select: {
					id: true,
					employeeId: true,
					organizationId: true,
					departmentId: true,
					role: true,
					employmentHireDate: true,
				},
			});

			if (!existingEmployee) {
				employeeLogger.error(`Employee not found for document: ${documentLookupValue}`);
				const errorResponse = buildErrorResponse("Employee not found", 404);
				res.status(404).json(errorResponse);
				return;
			}

			const beforeDocuments = await prisma.document.findMany({
				where: {
					employeeId: existingEmployee.id,
					isDeleted: false,
				},
			});

			const parsedFieldValues =
				typeof fieldValues === "string"
					? (() => {
							try {
								return JSON.parse(fieldValues);
							} catch (_error) {
								return null;
							}
						})()
					: fieldValues || null;
			const actorEmployeeId =
				String((req as any)?.metadata?.employee?.id || "").trim() || null;

			const matchedDocumentType = await findMatchingDocumentType({
				prisma,
				organizationId: existingEmployee.organizationId,
				documentTypeId,
				type,
				name: existingDocument.name,
			});
			const documentValidationErrors = validateEmployeeDocumentAgainstDocumentType(
				matchedDocumentType,
				{
					number: number || existingDocument.number,
					issueDate: issueDate || existingDocument.issueDate,
					expiryDate:
						typeof expiryDate === "string" ? expiryDate : existingDocument.expiryDate,
					fieldValues: parsedFieldValues ?? existingDocument.fieldValues,
				},
				"employee.documents.0",
			);
			if (documentValidationErrors.length > 0) {
				res.status(400).json(
					buildErrorResponse("Validation failed", 400, documentValidationErrors),
				);
				return;
			}

			let fileUrl = existingDocument.fileUrl;
			let fileExt = existingDocument.ext;

			// If a new file is uploaded, replace the old one
			if (req.file) {
				const { uploadToCloudinary } = require("../../helper/cloudinary.helper");
				employeeLogger.info("Uploading new document file to Cloudinary");

				const documentType =
					matchedDocumentType?.code || type || existingDocument.type || "document";
				const uploadResult = await uploadToCloudinary(req.file.buffer, {
					folder: "employees/documents",
					resourceType: "auto",
					publicId: `document_${existingEmployee.id}_${documentType}_${req.file.originalname.replace(/\.[^/.]+$/, "")}`,
				});

				if (!uploadResult.success || !uploadResult.secureUrl) {
					employeeLogger.error("Failed to upload document to Cloudinary");
					const errorResponse = buildErrorResponse("Failed to upload document file", 500);
					res.status(500).json(errorResponse);
					return;
				}

				fileUrl = uploadResult.secureUrl;
				fileExt = uploadResult.format || req.file.originalname?.split(".").pop() || fileExt;
				employeeLogger.info(`New document uploaded to Cloudinary: ${fileUrl}`);
			}

			const requiresReview = shouldRequireDocumentApproval({
				actorEmployeeId,
				targetEmployeeId: existingEmployee.id,
				documentType: matchedDocumentType,
			});
			const isHrDirectUpdate = Boolean(
				actorEmployeeId && actorEmployeeId !== existingEmployee.id,
			);
			const now = new Date();
			const reviewData = requiresReview
				? buildPendingDocumentReviewData({
						submittedByEmployeeId: actorEmployeeId!,
						source: DocumentReviewSource.EMPLOYEE_UPLOAD,
					})
				: isHrDirectUpdate
					? {
							reviewStatus: DocumentReviewStatus.APPROVED,
							reviewSubmittedAt: existingDocument.reviewSubmittedAt || now,
							reviewSubmittedById:
								existingDocument.reviewSubmittedById || actorEmployeeId,
							reviewApprovedAt: now,
							reviewApprovedById: actorEmployeeId,
							reviewRejectedAt: null,
							reviewRejectedById: null,
							reviewRejectionReason: null,
							reviewSource: DocumentReviewSource.HR_UPLOAD,
						}
					: {};
			const nextMetadata = requiresReview
				? buildPendingDocumentReviewMetadata({
						existingMetadata: existingDocument.metadata,
						submittedByEmployeeId: actorEmployeeId!,
					})
				: isHrDirectUpdate
					? buildDocumentReviewCompatibilityMetadata({
							existingMetadata: existingDocument.metadata,
							status: DocumentReviewStatus.APPROVED,
							submittedAt: existingDocument.reviewSubmittedAt || now,
							submittedByEmployeeId:
								existingDocument.reviewSubmittedById || actorEmployeeId,
							approvedAt: now,
							approvedByEmployeeId: actorEmployeeId,
							source: DocumentReviewSource.HR_UPLOAD,
						})
					: existingDocument.metadata;

			const updatedDocument = await prisma.document.update({
				where: { id: existingDocument.id },
				data: {
					name:
						matchedDocumentType?.name ||
						req.file?.originalname ||
						existingDocument.name,
					type: matchedDocumentType?.code || type || existingDocument.type,
					documentTypeId:
						typeof documentTypeId === "string" || matchedDocumentType
							? matchedDocumentType?.id || null
							: existingDocument.documentTypeId,
					number: number || existingDocument.number,
					issueDate: issueDate ? new Date(issueDate) : existingDocument.issueDate,
					expiryDate:
						typeof expiryDate === "string"
							? expiryDate.trim()
								? new Date(expiryDate)
								: null
							: existingDocument.expiryDate,
					fieldValues: parsedFieldValues ?? existingDocument.fieldValues,
					fileUrl: fileUrl || null,
					ext: fileExt,
					metadata: nextMetadata,
					...reviewData,
				},
			});

			if (requiresReview) {
				await createDocumentReviewEvent({
					prisma,
					organizationId: existingEmployee.organizationId,
					document: existingDocument,
					eventType:
						extractDocumentReviewSnapshot(existingDocument)?.status ===
						DocumentReviewStatus.PENDING
							? DocumentReviewEventType.RESUBMITTED
							: DocumentReviewEventType.SUBMITTED,
					toStatus: DocumentReviewStatus.PENDING,
					actorEmployeeId,
					source: DocumentReviewSource.EMPLOYEE_UPLOAD,
				});

				try {
					await publishDocumentReviewSubmittedNotification(prisma, (req as any).io, {
						organizationId: existingEmployee.organizationId,
						documentId: updatedDocument.id,
						employeeId: existingEmployee.id,
						documentName: matchedDocumentType?.name || updatedDocument.name,
						documentTypeCode: matchedDocumentType?.code || updatedDocument.type,
						sourceEmployeeId: actorEmployeeId,
					});
				} catch (notificationError) {
					employeeLogger.warn(
						`Failed to publish document review notification for ${updatedDocument.id}: ${notificationError}`,
					);
				}
			} else if (isHrDirectUpdate) {
				await createDocumentReviewEvent({
					prisma,
					organizationId: existingEmployee.organizationId,
					document: existingDocument,
					eventType: DocumentReviewEventType.APPROVED,
					toStatus: DocumentReviewStatus.APPROVED,
					actorEmployeeId,
					comments: "HR updated this employee document directly.",
					source: DocumentReviewSource.HR_UPLOAD,
				});
			}

			const responseDocument = {
				id: updatedDocument.id,
				name: updatedDocument.name,
				type: updatedDocument.type,
				documentTypeId: updatedDocument.documentTypeId,
				number: updatedDocument.number,
				issueDate: updatedDocument.issueDate,
				expiryDate: updatedDocument.expiryDate,
				fileUrl: updatedDocument.fileUrl,
				ext: updatedDocument.ext,
				fieldValues: updatedDocument.fieldValues,
				metadata: updatedDocument.metadata,
				reviewStatus: updatedDocument.reviewStatus,
				reviewSubmittedAt: updatedDocument.reviewSubmittedAt,
				reviewSubmittedById: updatedDocument.reviewSubmittedById,
				reviewApprovedAt: updatedDocument.reviewApprovedAt,
				reviewApprovedById: updatedDocument.reviewApprovedById,
				reviewRejectedAt: updatedDocument.reviewRejectedAt,
				reviewRejectedById: updatedDocument.reviewRejectedById,
				reviewRejectionReason: updatedDocument.reviewRejectionReason,
				reviewSource: updatedDocument.reviewSource,
			};

			await reconcileEmployeeOnboardingState({
				prisma,
				organizationId: existingEmployee.organizationId,
				employeeId: existingEmployee.id,
				targetDate: existingEmployee.employmentHireDate || new Date(),
				departmentId: existingEmployee.departmentId,
				role: existingEmployee.role,
			});

			const updatedEmployee = await prisma.employee.findUnique({
				where: { id: existingEmployee.id },
				include: {
					person: {
						select: {
							personalInfo: true,
							contactInfo: true,
						},
					},
					documents: {
						where: { isDeleted: false },
						include: {
							documentType: {
								select: {
									id: true,
									code: true,
									name: true,
									category: true,
									isRequired: true,
									isEmployeeVisible: true,
									fields: true,
								},
							},
						},
					},
					department: {
						select: {
							id: true,
							name: true,
							code: true,
						},
					},
					position: {
						select: {
							id: true,
							title: true,
						},
					},
				},
			});

			await logEmployeeDocumentConfigurationAudit({
				req,
				employee: {
					id: existingEmployee.id,
					employeeId: existingEmployee.employeeId,
					organizationId: existingEmployee.organizationId,
				},
				beforeDocuments,
				afterDocuments: updatedEmployee?.documents || [],
			});
			logAudit(req, {
				userId: (req as any).user?.id || "unknown",
				action: config.AUDIT_LOG.ACTIONS.UPDATE,
				resource: config.AUDIT_LOG.RESOURCES.DOCUMENT,
				severity: config.AUDIT_LOG.SEVERITY.MEDIUM,
				entityType: config.AUDIT_LOG.ENTITY_TYPES.DOCUMENT,
				entityId: updatedDocument.id,
				changesBefore: {
					id: existingDocument.id,
					type: existingDocument.type,
					number: existingDocument.number,
				},
				changesAfter: {
					id: updatedDocument.id,
					type: updatedDocument.type,
					number: updatedDocument.number,
				},
				description: `${config.AUDIT_LOG.EMPLOYEE.DESCRIPTIONS.EMPLOYEE_DOCUMENT_UPDATED}: ${updatedDocument.id}`,
				organizationId: existingEmployee.organizationId,
			});

			// Invalidate cache
			try {
				await invalidateEmployeeDocumentCaches(existingEmployee.id);
				employeeLogger.info(
					`Cache invalidated after document update for employee ${existingEmployee.id}`,
				);
			} catch (cacheError) {
				employeeLogger.warn(
					"Failed to invalidate cache after document update:",
					cacheError,
				);
			}

			// Log activity
			logActivity(req, {
				userId: (req as any).user?.id || "unknown",
				action: config.ACTIVITY_LOG.EMPLOYEE.ACTIONS.UPDATE_EMPLOYEE_DOCUMENT,
				description: `${config.ACTIVITY_LOG.EMPLOYEE.DESCRIPTIONS.EMPLOYEE_DOCUMENT_UPDATED}: ${updatedDocument.id}`,
				page: {
					url: req.originalUrl,
					title: config.ACTIVITY_LOG.EMPLOYEE.PAGES.EMPLOYEE_DOCUMENT,
				},
			});

			employeeLogger.info(`Document updated successfully: ${documentNumber}`);
			const successResponse = buildSuccessResponse(
				"Document updated successfully",
				{ employee: updatedEmployee, document: responseDocument },
				200,
			);
			res.status(200).json(successResponse);
		} catch (error) {
			employeeLogger.error(`Failed to update document: ${error}`);
			const errorResponse = buildErrorResponse(
				config.ERROR.COMMON.INTERNAL_SERVER_ERROR,
				500,
			);
			res.status(500).json(errorResponse);
		}
	};

	const reviewDocument = async (req: Request, res: Response, _next: NextFunction) => {
		const { documentId } = req.params;
		const action = String(req.body?.action || "")
			.trim()
			.toLowerCase();
		const rejectionReason =
			String(req.body?.rejectionReason || req.body?.reason || "").trim() || null;
		const comments = String(req.body?.comments || "").trim() || null;

		try {
			if (!["approve", "reject"].includes(action)) {
				res.status(400).json(
					buildErrorResponse("Document review action must be approve or reject.", 400),
				);
				return;
			}

			if (action === "reject" && !rejectionReason) {
				res.status(400).json(
					buildErrorResponse(
						"Rejection reason is required when returning a document.",
						400,
					),
				);
				return;
			}

			const actorEmployeeId =
				String((req as any)?.metadata?.employee?.id || "").trim() || null;
			const actorRole = String(
				(req as any)?.role ||
					(req as any)?.user?.role ||
					(req as any)?.metadata?.role ||
					(req as any)?.metadata?.employee?.role ||
					"",
			)
				.trim()
				.toLowerCase();
			const canReview =
				actorRole.includes("hris-admin") ||
				actorRole.includes("hris-hr") ||
				actorRole === "admin" ||
				actorRole === "super_admin" ||
				actorRole === "superadmin";

			if (!canReview) {
				res.status(403).json(
					buildErrorResponse("Only HR can approve or return employee documents.", 403),
				);
				return;
			}

			const existingDocument = await prisma.document.findFirst({
				where: {
					id: documentId,
					isDeleted: false,
				},
			});

			if (!existingDocument) {
				res.status(404).json(buildErrorResponse("Document not found", 404));
				return;
			}

			const existingEmployee = await prisma.employee.findUnique({
				where: { id: existingDocument.employeeId },
				select: {
					id: true,
					employeeId: true,
					organizationId: true,
					departmentId: true,
					role: true,
					employmentHireDate: true,
				},
			});

			if (!existingEmployee) {
				res.status(404).json(buildErrorResponse("Employee not found", 404));
				return;
			}

			const now = new Date();
			const nextStatus =
				action === "approve"
					? DocumentReviewStatus.APPROVED
					: DocumentReviewStatus.REJECTED;
			const snapshot = extractDocumentReviewSnapshot(existingDocument);
			const submittedAt = snapshot?.submittedAt ? new Date(snapshot.submittedAt) : null;
			const submittedByEmployeeId = snapshot?.submittedByEmployeeId || null;
			const nextMetadata = buildDocumentReviewCompatibilityMetadata({
				existingMetadata: existingDocument.metadata,
				status: nextStatus,
				submittedAt:
					submittedAt instanceof Date && !Number.isNaN(submittedAt.getTime())
						? submittedAt
						: null,
				submittedByEmployeeId,
				approvedAt: action === "approve" ? now : null,
				approvedByEmployeeId: action === "approve" ? actorEmployeeId : null,
				rejectedAt: action === "reject" ? now : null,
				rejectedByEmployeeId: action === "reject" ? actorEmployeeId : null,
				rejectionReason: action === "reject" ? rejectionReason : null,
				source:
					(existingDocument.reviewSource as any) ||
					(snapshot?.source as any) ||
					DocumentReviewSource.EMPLOYEE_UPLOAD,
			});

			const updatedDocument = await prisma.document.update({
				where: { id: existingDocument.id },
				data: {
					reviewStatus: nextStatus,
					reviewApprovedAt: action === "approve" ? now : null,
					reviewApprovedById: action === "approve" ? actorEmployeeId : null,
					reviewRejectedAt: action === "reject" ? now : null,
					reviewRejectedById: action === "reject" ? actorEmployeeId : null,
					reviewRejectionReason: action === "reject" ? rejectionReason : null,
					reviewSource:
						existingDocument.reviewSource || DocumentReviewSource.EMPLOYEE_UPLOAD,
					metadata: nextMetadata,
				},
			});

			await createDocumentReviewEvent({
				prisma,
				organizationId: existingEmployee.organizationId,
				document: existingDocument,
				eventType:
					action === "approve"
						? DocumentReviewEventType.APPROVED
						: DocumentReviewEventType.REJECTED,
				toStatus: nextStatus,
				actorEmployeeId,
				reason: rejectionReason,
				comments,
				source: existingDocument.reviewSource || DocumentReviewSource.EMPLOYEE_UPLOAD,
			});

			await reconcileEmployeeOnboardingState({
				prisma,
				organizationId: existingEmployee.organizationId,
				employeeId: existingEmployee.id,
				targetDate: existingEmployee.employmentHireDate || new Date(),
				departmentId: existingEmployee.departmentId,
				role: existingEmployee.role,
			});

			try {
				await invalidateEmployeeDocumentCaches(existingEmployee.id);
				await invalidateCache.byPattern(`cache:document:byId:${updatedDocument.id}:*`);
				await invalidateCache.byPattern("cache:document:list:*");
			} catch (cacheError) {
				employeeLogger.warn(
					"Failed to invalidate cache after document review:",
					cacheError,
				);
			}

			await logEmployeeDocumentConfigurationAudit({
				req,
				employee: {
					id: existingEmployee.id,
					employeeId: existingEmployee.employeeId,
					organizationId: existingEmployee.organizationId,
				},
				beforeDocuments: [existingDocument],
				afterDocuments: [updatedDocument],
			});
			logAudit(req, {
				userId: (req as any).user?.id || "unknown",
				action: config.AUDIT_LOG.ACTIONS.UPDATE,
				resource: config.AUDIT_LOG.RESOURCES.DOCUMENT,
				severity: config.AUDIT_LOG.SEVERITY.MEDIUM,
				entityType: config.AUDIT_LOG.ENTITY_TYPES.DOCUMENT,
				entityId: updatedDocument.id,
				changesBefore: {
					id: existingDocument.id,
					reviewStatus: existingDocument.reviewStatus,
				},
				changesAfter: {
					id: updatedDocument.id,
					reviewStatus: updatedDocument.reviewStatus,
				},
				description: `${config.AUDIT_LOG.EMPLOYEE.DESCRIPTIONS.EMPLOYEE_DOCUMENT_REVIEWED}: ${updatedDocument.id} (${action})`,
				organizationId: existingEmployee.organizationId,
			});

			logActivity(req, {
				userId: (req as any).user?.id || "unknown",
				action: config.ACTIVITY_LOG.EMPLOYEE.ACTIONS.REVIEW_EMPLOYEE_DOCUMENT,
				description: `${config.ACTIVITY_LOG.EMPLOYEE.DESCRIPTIONS.EMPLOYEE_DOCUMENT_REVIEWED}: ${updatedDocument.id} (${action})`,
				page: {
					url: req.originalUrl,
					title: config.ACTIVITY_LOG.EMPLOYEE.PAGES.EMPLOYEE_DOCUMENT,
				},
			});

			res.status(200).json(
				buildSuccessResponse("Document review saved", { document: updatedDocument }, 200),
			);
		} catch (error) {
			employeeLogger.error(`Failed to review document: ${error}`);
			res.status(500).json(
				buildErrorResponse(config.ERROR.COMMON.INTERNAL_SERVER_ERROR, 500),
			);
		}
	};

	const deleteDocument = async (req: Request, res: Response, _next: NextFunction) => {
		const { documentNumber } = req.params;
		const documentLookupValue = String(documentNumber || "").trim();
		const scopedEmployeeId = String(req.query.employeeId || "").trim() || null;

		try {
			employeeLogger.info(`Deleting document: ${documentLookupValue}`);

			const existingDocument = await findEmployeeDocumentByLookupValue(
				prisma,
				documentLookupValue,
				scopedEmployeeId,
			);

			if (!existingDocument) {
				employeeLogger.error(`Document not found: ${documentLookupValue}`);
				const errorResponse = buildErrorResponse("Document not found", 404);
				res.status(404).json(errorResponse);
				return;
			}

			const existingEmployee = await prisma.employee.findUnique({
				where: { id: existingDocument.employeeId },
				select: {
					id: true,
					employeeId: true,
					organizationId: true,
					departmentId: true,
					role: true,
					employmentHireDate: true,
				},
			});

			if (!existingEmployee) {
				employeeLogger.error(`Employee not found for document: ${documentLookupValue}`);
				const errorResponse = buildErrorResponse("Employee not found", 404);
				res.status(404).json(errorResponse);
				return;
			}

			const beforeDocuments = await prisma.document.findMany({
				where: {
					employeeId: existingEmployee.id,
					isDeleted: false,
				},
			});

			await prisma.document.delete({
				where: { id: existingDocument.id },
			});

			await reconcileEmployeeOnboardingState({
				prisma,
				organizationId: existingEmployee.organizationId,
				employeeId: existingEmployee.id,
				targetDate: existingEmployee.employmentHireDate || new Date(),
				departmentId: existingEmployee.departmentId,
				role: existingEmployee.role,
			});

			const responseDocument = {
				name: existingDocument.name,
				type: existingDocument.type,
				number: existingDocument.number,
				issueDate: existingDocument.issueDate,
				expiryDate: existingDocument.expiryDate,
				fileUrl: existingDocument.fileUrl,
				ext: existingDocument.ext,
			};

			const afterDocuments = await prisma.document.findMany({
				where: {
					employeeId: existingEmployee.id,
					isDeleted: false,
				},
			});

			await logEmployeeDocumentConfigurationAudit({
				req,
				employee: {
					id: existingEmployee.id,
					employeeId: existingEmployee.employeeId,
					organizationId: existingEmployee.organizationId,
				},
				beforeDocuments,
				afterDocuments,
			});
			logAudit(req, {
				userId: (req as any).user?.id || "unknown",
				action: config.AUDIT_LOG.ACTIONS.DELETE,
				resource: config.AUDIT_LOG.RESOURCES.DOCUMENT,
				severity: config.AUDIT_LOG.SEVERITY.MEDIUM,
				entityType: config.AUDIT_LOG.ENTITY_TYPES.DOCUMENT,
				entityId: existingDocument.id,
				changesBefore: {
					id: existingDocument.id,
					type: existingDocument.type,
					employeeId: existingEmployee.id,
				},
				changesAfter: null,
				description: `${config.AUDIT_LOG.EMPLOYEE.DESCRIPTIONS.EMPLOYEE_DOCUMENT_DELETED}: ${existingDocument.id}`,
				organizationId: existingEmployee.organizationId,
			});

			// Invalidate cache
			try {
				await invalidateEmployeeDocumentCaches(existingEmployee.id);
				employeeLogger.info(
					`Cache invalidated after document deletion for employee ${existingEmployee.id}`,
				);
			} catch (cacheError) {
				employeeLogger.warn(
					"Failed to invalidate cache after document deletion:",
					cacheError,
				);
			}

			logActivity(req, {
				userId: (req as any).user?.id || "unknown",
				action: config.ACTIVITY_LOG.EMPLOYEE.ACTIONS.DELETE_EMPLOYEE_DOCUMENT,
				description: `${config.ACTIVITY_LOG.EMPLOYEE.DESCRIPTIONS.EMPLOYEE_DOCUMENT_DELETED}: ${existingDocument.id}`,
				page: {
					url: req.originalUrl,
					title: config.ACTIVITY_LOG.EMPLOYEE.PAGES.EMPLOYEE_DOCUMENT,
				},
			});

			employeeLogger.info(`Document deleted successfully: ${documentLookupValue}`);
			const successResponse = buildSuccessResponse(
				"Document deleted successfully",
				{ document: responseDocument },
				200,
			);
			res.status(200).json(successResponse);
		} catch (error) {
			employeeLogger.error(`Failed to delete document: ${error}`);
			const errorResponse = buildErrorResponse(
				config.ERROR.COMMON.INTERNAL_SERVER_ERROR,
				500,
			);
			res.status(500).json(errorResponse);
		}
	};

	return {
		reserveEmployeeId,
		create,
		getAll,
		getById,
		update,
		setActiveEmployeeSchedule,
		getEmployeeSchedules,
		deactivateEmployeeSchedule,
		getTeamScheduleCalendar,
		getTeamScheduleCalendarGrid,
		getTeamScheduleCollections,
		createTeamScheduleCollection,
		updateTeamScheduleCollection,
		archiveTeamScheduleCollection,
		applyTeamScheduleLedgerRotation,
		overrideTeamScheduleLedger,
		remove,
		markAttendance,
		getAttendanceRecords,
		getTodayAttendance,
		getAttendanceById,
		updateAttendance,
		deleteAttendance,
		debugDeleteTodayAttendance,
		getManagedDepartments,
		getManagedDepartmentById,
		getEmployeeDepartment,
		getDocumentPriorities,
		importEmployees,
		getImportProgress,
		getEmployeesByUserRole,
		uploadDocument,
		updateDocument,
		reviewDocument,
		deleteDocument,
	};
};
