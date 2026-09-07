// @ts-nocheck
import { Request, Response, NextFunction } from "express";
import { PrismaClient, Prisma } from "../../generated/prisma";
import { getLogger } from "../../helper/logger.helper";
import { validateQueryParams } from "../../helper/validation-helper";
import {
	buildFilterConditions,
	buildFindManyQuery,
	buildSearchConditions,
	getNestedFields,
} from "../../helper/query-builder.helper";
import {
	generateTimesheetSummary,
	generateDailyBreakdown,
	calculateTimekeeping,
	deriveGracePeriodStatus,
	formatMinutesAsTime,
	computeNightShiftForDay,
} from "../../helper/timekeeping.helper";
import {
	generateTimesheetForEmployee,
	generateUniqueTimesheetCode,
	refreshTimesheetForAttendanceDate,
	ensurePeriodDraftsAndTodayLinesFromAggregate,
	ensurePayrollPeriodTimesheetsAutoApproved,
	repairCurrentPeriodAttendanceTimesheetCoverage,
	syncTimesheetLinesFromBreakdown,
	attachTimesheetBreakdownFromLines,
	buildBreakdownFromTimesheetLines,
} from "../../helper/timesheet.helper";
import {
	getEffectiveAttendanceRecordsForRange,
	getEffectiveEmploymentStartDate,
	getDateKeyInBusinessTimeZone,
	normalizeToStartOfDay,
} from "../../helper/attendance.helper";
import { buildSuccessResponse, buildPagination } from "../../helper/success-handler.helper";
import { normalizeDayLaborType } from "../../helper/day-labor-type.helper";
import { groupDataByField } from "../../helper/dataGrouping";
import { buildErrorResponse, formatZodErrors } from "../../helper/error-handler";
import {
	CreateTimesheetSchema,
	UpdateTimesheetSchema,
	SubmitTimesheetSchema,
	TimesheetActionSchema,
	UpdateTimesheetConfigSchema,
	RequestCurrentTimesheetEditPermissionSchema,
	RequestTimesheetEditPermissionSchema,
	ReviewTimesheetEditPermissionSchema,
	NormalizeTimesheetBreakdownPreviewSchema,
} from "../../zod/timesheet.zod";
import { logActivity } from "../../utils/activityLogger";
import { logAudit } from "../../utils/auditLogger";
import { config } from "../../config/constant";
import { redisClient } from "../../config/redis";
import { invalidateCache } from "../../middleware/cache";
import { AuthRequest } from "../../middleware/verifyToken";
import {
	createRequestStepExecutions,
	getDefaultRequestWorkflow,
	updateRequestStepProgress,
} from "../../helper/request-runtime.helper";
import { REQUEST_WORKFLOW_CODES } from "../../helper/workflow-config.helper";
import { canActAsLineLeaderForEmployee } from "../../helper/section-leader-scope.helper";
import { isDayLaborOnlyBreakdownChange } from "../../helper/timesheet-day-labor-guard.helper";
import { enrichBreakdownWithLeaveHolidayContext } from "../../helper/day-context.helper";
import {
	publishRequestCreatedNotification,
	publishTimesheetDecisionFallbackNotification,
	publishTimesheetReminderNotification,
} from "../../helper/notification-dispatch.helper";
import { findShiftForDay } from "../../helper/schedule.helper";
import {
	collectShiftTypeIdsFromEmployeeScheduleData,
	resolveEffectiveShift,
	resolveEffectiveShiftFromEmployeeData,
	type EmployeeScheduleSnapshot as EmployeeSchedule,
} from "../../helper/employee-schedule.helper";
import {
	buildTimesheetBreakdownFromObligations,
	materializeTimesheetLinesFromObligations,
} from "../../helper/attendance-obligation.helper";
import {
	getOrCreateNormalizedTimesheetConfig,
	mergeTimesheetConfigRules,
	normalizeTimesheetRulesConfig,
	resolveTimesheetAutoApprovalEnabled,
	buildTimesheetAutoApprovalPatch,
} from "../../helper/timesheet-config.helper";
import { applyApprovedOvertimeCompensatoryCredit } from "./approved-overtime-comp-leave.service";
import { createOvertimeRequestForTimesheetLine } from "./overtime-request.service";
import {
	createPayrollCorrectionRequest,
	listPayrollCorrectionsForTimesheet,
} from "../payrollCorrection/payroll-correction.service";
import {
	mergeOvertimeMetadata,
	requiresManagerApprovedOvertime,
	resolveOvertimePolicyApplication,
} from "../../helper/overtime-approval.helper";

const logger = getLogger();
const timesheetLogger = logger.child({ module: "timesheet" });

type TimesheetSubmitEligibility = {
	canSubmit: boolean;
	isCorrectionResubmit: boolean;
	requiresEditPermission: boolean;
	reason: "EDIT_PERMISSION_REQUIRED_FOR_RESUBMISSION" | "INVALID_SUBMIT_STATUS" | null;
};

export const evaluateTimesheetSubmitEligibility = (
	status: string | null | undefined,
	editPermissionStatus?: string | null,
): TimesheetSubmitEligibility => {
	const normalizedStatus = String(status || "").toUpperCase();
	const normalizedPermission = String(editPermissionStatus || "").toUpperCase();
	const hasEditPermission =
		normalizedPermission === "APPROVED" || normalizedPermission === "CONSUMED";

	if (normalizedStatus === "DRAFT" || normalizedStatus === "REVISED") {
		return {
			canSubmit: true,
			isCorrectionResubmit: false,
			requiresEditPermission: false,
			reason: null,
		};
	}

	if (normalizedStatus === "SUBMITTED" || normalizedStatus === "APPROVED") {
		if (hasEditPermission) {
			return {
				canSubmit: true,
				isCorrectionResubmit: true,
				requiresEditPermission: false,
				reason: null,
			};
		}

		return {
			canSubmit: false,
			isCorrectionResubmit: false,
			requiresEditPermission: true,
			reason: "EDIT_PERMISSION_REQUIRED_FOR_RESUBMISSION",
		};
	}

	return {
		canSubmit: false,
		isCorrectionResubmit: false,
		requiresEditPermission: false,
		reason: "INVALID_SUBMIT_STATUS",
	};
};

export const TIMESHEET_AUTO_APPROVE_METADATA_REASON = "ORG_POLICY_ENABLE_AUTO_APPROVE";

export type TimesheetSubmissionOutcome = {
	status: "SUBMITTED" | "APPROVED";
	autoApproved: boolean;
};

/**
 * Resolves the terminal status of a timesheet submission under the
 * organization's TimesheetConfig.enableAutoApprove policy.
 *
 * - OFF (default/undefined): lands SUBMITTED and an approval request is created
 *   for supervisor/HR review (historic behavior).
 * - ON: lands directly APPROVED — no approval request is created and no review
 *   step is needed (Bandai requirement: automatic approval on submission).
 *
 * The flag only affects future submissions; timesheets already sitting in
 * SUBMITTED keep requiring manual approval.
 */
export const resolveTimesheetSubmissionOutcome = (
	enableAutoApprove: boolean | null | undefined,
): TimesheetSubmissionOutcome => {
	return Boolean(enableAutoApprove)
		? { status: "APPROVED", autoApproved: true }
		: { status: "SUBMITTED", autoApproved: false };
};

/**
 * Builds the metadata patch stamped when a submission is auto-approved by org
 * policy. Mirrors the APPROVED snapshot shape produced by the manual APPROVE
 * action (snapshotState/snapshotLockedAt/snapshotLockedBy) plus explicit
 * autoApproved markers so policy self-approvals stay distinguishable in audit.
 */
export const buildAutoApprovedSubmissionMetadata = (
	existingMetadata: Record<string, unknown>,
	submittedAt: Date,
	submittedBy: string | null | undefined,
): Record<string, unknown> => ({
	...existingMetadata,
	snapshotState: "APPROVED",
	snapshotSubmittedAt: submittedAt.toISOString(),
	snapshotSubmittedBy: submittedBy ?? null,
	snapshotType: "TIMESHEET_PERIOD",
	snapshotLockedAt: submittedAt.toISOString(),
	snapshotLockedBy: submittedBy ?? null,
	autoApproved: true,
	autoApprovedReason: TIMESHEET_AUTO_APPROVE_METADATA_REASON,
});

export const controller = (prisma: PrismaClient) => {
	const ENABLE_EDITABLE_TIMESHEET_REFRESH_ON_READ = true;
	const findTimesheetLock = async (params: {
		organizationId: string;
		timesheetId: string;
	}) => {
		const timesheet = await (prisma as any).timesheet.findFirst({
			where: {
				organizationId: params.organizationId,
				isDeleted: false,
				id: params.timesheetId,
			},
			select: {
				id: true,
				lockedAt: true,
				lockedBy: true,
				lockReason: true,
				lockRunId: true,
				lockedEmployeePayrollId: true,
				employeePayroll: {
					select: {
						id: true,
						isPaid: true,
						paidAt: true,
						referenceNumber: true,
						snapshotLockedAt: true,
					},
				},
			},
		});
		if (!timesheet) return null;
		const payroll = timesheet.employeePayroll;
		if (!timesheet.lockedAt && !payroll) return null;
		return {
			id: timesheet.lockedEmployeePayrollId || payroll?.id || timesheet.id,
			timesheetId: timesheet.id,
			isPaid: Boolean(payroll?.isPaid),
			paidAt: payroll?.paidAt || null,
			referenceNumber: payroll?.referenceNumber || null,
			snapshotLockedAt: payroll?.snapshotLockedAt || null,
			lockedAt: timesheet.lockedAt || null,
			lockedBy: timesheet.lockedBy || null,
			lockReason: timesheet.lockReason || null,
			lockRunId: timesheet.lockRunId || null,
		};
	};
	const buildTimesheetLockResponse = (lock: {
		id: string;
		timesheetId?: string;
		isPaid?: boolean;
		paidAt?: Date | null;
		referenceNumber?: string | null;
		snapshotLockedAt?: Date | null;
		lockedAt?: Date | null;
	}) =>
		buildErrorResponse(
			"This timesheet is locked because the payroll period already consumed its approved snapshot. Request a payroll correction for the next open payroll instead of changing paid source truth.",
			409,
			[
				{
					field: "timesheetId",
					message: `TIMESHEET_LOCKED:${lock.id}`,
				},
				{
					field: "correctionPath",
					message: "USE_PAYROLL_CORRECTION",
				},
			],
		);

	type EditAuditChangeType = "TIME" | "STATUS" | "NOTES" | "MIXED";
	type EditAuditDaySnapshot = {
		date: string;
		changeType: EditAuditChangeType;
		before: Record<string, unknown>;
		after: Record<string, unknown>;
	};
	type ApprovedEditedDaySummaryItem = {
		entryId: string;
		timesheetId: string;
		date: string;
		periodLabel: string;
		sourcePeriodType: "CURRENT" | "PAST";
		approvedAt: string;
		changeType: EditAuditChangeType;
		isManualEdit?: boolean;
		changedFields?: TimesheetDayRevisionFieldChange[];
		dayPreview: {
			timeIn: string | null;
			timeOut: string | null;
			status: string | null;
			hoursWorked: string;
			regularHours: string;
			overtimeHours: string;
			undertimeHours: string;
			lateHours: string;
			earlyOutHours: string;
			employeeNotes: string | null;
			approverNotes: string | null;
			metadata: {
				breakMinutes: number | null;
				breakDisplay: string | null;
			};
		};
	};
	type TimesheetDayRevisionFieldChange = {
		field: string;
		label: string;
		before: unknown;
		after: unknown;
	};
	type TimesheetDayRevisionSummary = {
		isModified: boolean;
		isManualEdit?: boolean;
		lineId: string;
		previousLineId: string;
		revisionNo: number;
		ledgerType: string;
		editedAt: string | null;
		editedBy: string | null;
		editReason: string | null;
		changeType: EditAuditChangeType;
		changedFields: TimesheetDayRevisionFieldChange[];
	};
	const resolveDayKey = (value: unknown): string => {
		if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value)) {
			return value.slice(0, 10);
		}
		const parsed = new Date(String(value || ""));
		if (Number.isNaN(parsed.getTime())) return "";
		const year = parsed.getUTCFullYear();
		const month = String(parsed.getUTCMonth() + 1).padStart(2, "0");
		const day = String(parsed.getUTCDate()).padStart(2, "0");
		return `${year}-${month}-${day}`;
	};
	const resolveBusinessDayKey = (value: unknown, timeZone = "Asia/Manila"): string => {
		if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value)) {
			return value.slice(0, 10);
		}
		const parsed = value instanceof Date ? value : new Date(String(value || ""));
		if (Number.isNaN(parsed.getTime())) return "";
		const parts = new Intl.DateTimeFormat("en-CA", {
			timeZone,
			year: "numeric",
			month: "2-digit",
			day: "2-digit",
		}).formatToParts(parsed);
		const year = parts.find((part) => part.type === "year")?.value ?? "0000";
		const month = parts.find((part) => part.type === "month")?.value ?? "01";
		const day = parts.find((part) => part.type === "day")?.value ?? "01";
		return `${year}-${month}-${day}`;
	};
	const resolveBreakdownBusinessDayKey = (day: any): string =>
		String(
			day?.businessDate ||
				(day?.metadata && typeof day.metadata === "object"
					? day.metadata.businessDate
					: "") ||
				"",
		).slice(0, 10) || resolveBusinessDayKey(day?.date);
	const resolveLineBusinessDayKey = (line: any): string =>
		resolveBreakdownBusinessDayKey({
			businessDate:
				line?.metadata && typeof line.metadata === "object"
					? line.metadata.businessDate
					: undefined,
			date: line?.date,
		});
	const toBusinessDayEnd = (value: Date): Date => {
		const key = resolveBusinessDayKey(value);
		return new Date(`${key}T23:59:59.999+08:00`);
	};
	const toUtcDate = (value: string): Date => {
		const normalized = /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00.000Z` : value;
		const parsed = new Date(normalized);
		if (Number.isNaN(parsed.getTime())) {
			return new Date(`${new Date().toISOString().slice(0, 10)}T00:00:00.000Z`);
		}
		return parsed;
	};
	const EMPLOYEE_MEANINGFUL_REVISION_FIELDS = new Set([
		"timeIn",
		"timeOut",
		"hoursWorked",
		"regularHours",
		"overtimeHours",
		"undertimeHours",
		"lateHours",
		"earlyOutHours",
		"status",
		"employeeNotes",
		"approverNotes",
		"dayLaborType",
	]);

	const toAuditEpochMinute = (value: unknown): number | null => {
		if (!value) return null;
		if (value instanceof Date) return Math.floor(value.getTime() / 60000);
		if (typeof value === "string") {
			const parsed = new Date(value);
			if (Number.isNaN(parsed.getTime())) return null;
			return Math.floor(parsed.getTime() / 60000);
		}
		return null;
	};

	const normalizeBreakdownDayForAudit = (day: any): Record<string, unknown> => {
		const metadata =
			day?.metadata && typeof day.metadata === "object" && !Array.isArray(day.metadata)
				? (day.metadata as Record<string, unknown>)
				: {};
		return {
			timeIn: day?.timeIn ?? null,
			timeOut: day?.timeOut ?? null,
			status: day?.status ?? null,
			hoursWorked: day?.hoursWorked ?? "0:00",
			regularHours: day?.regularHours ?? "0:00",
			overtimeHours: day?.overtimeHours ?? "0:00",
			undertimeHours: day?.undertimeHours ?? "0:00",
			lateHours: day?.lateHours ?? "0:00",
			earlyOutHours: day?.earlyOutHours ?? "0:00",
			employeeNotes: day?.employeeNotes ?? null,
			approverNotes: day?.approverNotes ?? null,
			breakMinutes: metadata.breakMinutes ?? null,
			breakDisplay: metadata.breakDisplay ?? null,
			dayLaborType: day?.dayLaborType ?? null,
		};
	};

	const normalizeStatusForComparison = (status: unknown): string | null => {
		const normalized = String(status || "").toUpperCase();
		if (!normalized) return null;
		if (normalized === "NOT_CLOCKED_IN" || normalized === "ABSENT") return "ABSENT";
		return normalized;
	};

	const normalizeAuditDayForComparison = (day: Record<string, unknown>): Record<string, unknown> => ({
		timeIn: toAuditEpochMinute(day.timeIn),
		timeOut: toAuditEpochMinute(day.timeOut),
		status: normalizeStatusForComparison(day.status),
		hoursWorked: day.hoursWorked ?? "0:00",
		regularHours: day.regularHours ?? "0:00",
		overtimeHours: day.overtimeHours ?? "0:00",
		undertimeHours: day.undertimeHours ?? "0:00",
		lateHours: day.lateHours ?? "0:00",
		earlyOutHours: day.earlyOutHours ?? "0:00",
		employeeNotes: day.employeeNotes ?? null,
		approverNotes: day.approverNotes ?? null,
	});

	const EMPLOYEE_MANUAL_EDIT_SOURCE = "EMPLOYEE_MANUAL_EDIT";

	const hasEmployeeMeaningfulRevisionChange = (
		changedFields: TimesheetDayRevisionFieldChange[],
	): boolean =>
		changedFields.some((change) => EMPLOYEE_MEANINGFUL_REVISION_FIELDS.has(change.field));

	const isEmployeeManualEditLine = (line: any): boolean => {
		const metadata =
			line?.metadata && typeof line.metadata === "object" && !Array.isArray(line.metadata)
				? (line.metadata as Record<string, unknown>)
				: {};
		const revision =
			metadata.revision &&
			typeof metadata.revision === "object" &&
			!Array.isArray(metadata.revision)
				? (metadata.revision as Record<string, unknown>)
				: {};
		return revision.source === EMPLOYEE_MANUAL_EDIT_SOURCE;
	};

	const resolveVersionDayKeys = (
		editedDayKeys: string[] | undefined,
		changedDays: EditAuditDaySnapshot[],
		options?: { manualOnly?: boolean },
	): Set<string> | undefined => {
		if (Array.isArray(editedDayKeys) && editedDayKeys.length) {
			return new Set(editedDayKeys);
		}
		if (options?.manualOnly) {
			return undefined;
		}
		if (changedDays.length) {
			return new Set(changedDays.map((day) => day.date));
		}
		return undefined;
	};

	const resolveManualEditDayKeys = (
		editedDayKeys: string[] | undefined,
		versionDayKeys?: Set<string>,
	): Set<string> | undefined => {
		if (!Array.isArray(editedDayKeys) || !editedDayKeys.length || !versionDayKeys?.size) {
			return undefined;
		}
		return new Set(editedDayKeys.filter((dayKey) => versionDayKeys.has(dayKey)));
	};
	const normalizeTimesheetLineForRevisionAudit = (line: any): Record<string, unknown> => {
		const metadata =
			line?.metadata && typeof line.metadata === "object" && !Array.isArray(line.metadata)
				? (line.metadata as Record<string, unknown>)
				: {};
		return {
			timeIn: line?.timeIn instanceof Date ? line.timeIn.toISOString() : line?.timeIn ?? null,
			timeOut:
				line?.timeOut instanceof Date ? line.timeOut.toISOString() : line?.timeOut ?? null,
			status: line?.status ?? null,
			hoursWorked: line?.hoursWorked ?? "0:00",
			regularHours: line?.regularHours ?? "0:00",
			overtimeHours: line?.overtimeHours ?? "0:00",
			undertimeHours: line?.undertimeHours ?? "0:00",
			lateHours: line?.lateHours ?? "0:00",
			earlyOutHours: line?.earlyOutHours ?? "0:00",
			employeeNotes: line?.employeeNotes ?? line?.notes ?? null,
			approverNotes: line?.approverNotes ?? null,
			breakMinutes: line?.breakMinutes ?? metadata.breakMinutes ?? null,
			breakDisplay: metadata.breakDisplay ?? null,
			dayLaborType: line?.dayLaborType ?? null,
		};
	};

	const revisionFieldLabels: Record<string, string> = {
		timeIn: "Time in",
		timeOut: "Time out",
		status: "Status",
		hoursWorked: "Hours worked",
		regularHours: "Regular",
		overtimeHours: "Overtime",
		undertimeHours: "Undertime",
		lateHours: "Late",
		earlyOutHours: "Early out",
		employeeNotes: "Employee note",
		approverNotes: "Approver note",
		breakMinutes: "Break",
		breakDisplay: "Break label",
		dayLaborType: "Day labor",
	};

	const buildRevisionFieldChanges = (
		before: Record<string, unknown>,
		after: Record<string, unknown>,
	): TimesheetDayRevisionFieldChange[] =>
		Object.keys({ ...before, ...after })
			.filter((field) => JSON.stringify(before[field]) !== JSON.stringify(after[field]))
			.map((field) => ({
				field,
				label: revisionFieldLabels[field] || field,
				before: before[field] ?? null,
				after: after[field] ?? null,
			}));

	const detectChangeType = (
		before: Record<string, unknown>,
		after: Record<string, unknown>,
	): EditAuditChangeType => {
		const changedFields = Object.keys({ ...before, ...after }).filter(
			(key) => JSON.stringify(before[key]) !== JSON.stringify(after[key]),
		);
		if (!changedFields.length) return "MIXED";
		const timeFields = new Set([
			"timeIn",
			"timeOut",
			"hoursWorked",
			"regularHours",
			"overtimeHours",
			"undertimeHours",
			"lateHours",
			"earlyOutHours",
			"breakMinutes",
			"breakDisplay",
		]);
		const statusFields = new Set(["status"]);
		const notesFields = new Set(["employeeNotes", "approverNotes"]);
		const hasTime = changedFields.some((field) => timeFields.has(field));
		const hasStatus = changedFields.some((field) => statusFields.has(field));
		const hasNotes = changedFields.some((field) => notesFields.has(field));
		if (hasTime && !hasStatus && !hasNotes) return "TIME";
		if (hasStatus && !hasTime && !hasNotes) return "STATUS";
		if (hasNotes && !hasStatus && !hasTime) return "NOTES";
		return "MIXED";
	};

	const buildChangedDaysFromBreakdown = (
		beforeBreakdown: any[] | null | undefined,
		afterBreakdown: any[] | null | undefined,
	): EditAuditDaySnapshot[] => {
		const beforeMap = new Map<string, Record<string, unknown>>();
		const afterMap = new Map<string, Record<string, unknown>>();
		for (const day of beforeBreakdown || []) {
			const key = resolveBreakdownBusinessDayKey(day);
			if (!key) continue;
			beforeMap.set(key, normalizeBreakdownDayForAudit(day));
		}
		for (const day of afterBreakdown || []) {
			const key = resolveBreakdownBusinessDayKey(day);
			if (!key) continue;
			afterMap.set(key, normalizeBreakdownDayForAudit(day));
		}
		const uniqueKeys = new Set([...beforeMap.keys(), ...afterMap.keys()]);
		const changes: EditAuditDaySnapshot[] = [];
		for (const key of uniqueKeys) {
			const before = beforeMap.get(key) || {};
			const after = afterMap.get(key) || {};
			const comparableBefore = normalizeAuditDayForComparison(before);
			const comparableAfter = normalizeAuditDayForComparison(after);
			if (JSON.stringify(comparableBefore) === JSON.stringify(comparableAfter)) continue;
			changes.push({
				date: key,
				changeType: detectChangeType(before, after),
				before,
				after,
			});
		}
		return changes.sort((a, b) => a.date.localeCompare(b.date));
	};

	const toRecord = (value: unknown): Record<string, unknown> | null => {
		if (!value || typeof value !== "object" || Array.isArray(value)) return null;
		return value as Record<string, unknown>;
	};

	const toStringOrNull = (value: unknown): string | null => {
		if (typeof value !== "string") return null;
		const normalized = value.trim();
		return normalized ? normalized : null;
	};

	const toTimeDurationString = (value: unknown): string => {
		if (typeof value !== "string") return "0:00";
		const normalized = value.trim();
		return normalized || "0:00";
	};

	const toNumberOrNull = (value: unknown): number | null => {
		if (typeof value === "number" && Number.isFinite(value)) return value;
		if (typeof value === "string" && value.trim()) {
			const parsed = Number(value);
			if (Number.isFinite(parsed)) return parsed;
		}
		return null;
	};

	const normalizeLedgerDayPreview = (
		afterPayload: unknown,
	): ApprovedEditedDaySummaryItem["dayPreview"] => {
		const after = toRecord(afterPayload) || {};
		return {
			timeIn: toStringOrNull(after.timeIn),
			timeOut: toStringOrNull(after.timeOut),
			status: toStringOrNull(after.status),
			hoursWorked: toTimeDurationString(after.hoursWorked),
			regularHours: toTimeDurationString(after.regularHours),
			overtimeHours: toTimeDurationString(after.overtimeHours),
			undertimeHours: toTimeDurationString(after.undertimeHours),
			lateHours: toTimeDurationString(after.lateHours),
			earlyOutHours: toTimeDurationString(after.earlyOutHours),
			employeeNotes: toStringOrNull(after.employeeNotes),
			approverNotes: toStringOrNull(after.approverNotes),
			metadata: {
				breakMinutes: toNumberOrNull(after.breakMinutes),
				breakDisplay: toStringOrNull(after.breakDisplay),
			},
		};
	};

	const enrichTimesheetBreakdownWithRevisionSummary = async (timesheet: any) => {
		if (!timesheet || typeof timesheet !== "object") return timesheet;
		const organizationId = String(timesheet.organizationId || "");
		const timesheetId = String(timesheet.id || "");
		if (!organizationId || !timesheetId || !Array.isArray(timesheet.breakdown)) return timesheet;

		const currentRevisionLines = await (prisma as any).timesheetline.findMany({
			where: {
				organizationId,
				timesheetId,
				isDeleted: false,
				isEffective: true,
				supersedesLineId: { not: null },
				ledgerType: "CORRECTION",
			},
			select: {
				id: true,
				date: true,
				revisionNo: true,
				ledgerType: true,
				supersedesLineId: true,
				editedAt: true,
				editedBy: true,
				editReason: true,
				timeIn: true,
				timeOut: true,
				status: true,
				hoursWorked: true,
				regularHours: true,
				overtimeHours: true,
				undertimeHours: true,
				lateHours: true,
				earlyOutHours: true,
				employeeNotes: true,
				approverNotes: true,
				notes: true,
				breakMinutes: true,
				metadata: true,
			},
		});

		const previousLineIds = currentRevisionLines
			.map((line) => line.supersedesLineId)
			.filter((value): value is string => typeof value === "string" && value.length > 0);
		if (!previousLineIds.length) return timesheet;

		const previousLines = await (prisma as any).timesheetline.findMany({
			where: {
				organizationId,
				id: { in: previousLineIds },
			},
			select: {
				id: true,
				timeIn: true,
				timeOut: true,
				status: true,
				hoursWorked: true,
				regularHours: true,
				overtimeHours: true,
				undertimeHours: true,
				lateHours: true,
				earlyOutHours: true,
				employeeNotes: true,
				approverNotes: true,
				notes: true,
				breakMinutes: true,
				metadata: true,
			},
		});
		const previousLineById = new Map(previousLines.map((line) => [line.id, line]));
		const revisionSummaryByDate = new Map<string, TimesheetDayRevisionSummary>();

		for (const currentLine of currentRevisionLines) {
			const previousLine = previousLineById.get(currentLine.supersedesLineId);
			if (!previousLine) continue;
			const before = normalizeTimesheetLineForRevisionAudit(previousLine);
			const after = normalizeTimesheetLineForRevisionAudit(currentLine);
			const changedFields = buildRevisionFieldChanges(before, after);
			if (!changedFields.length || !hasEmployeeMeaningfulRevisionChange(changedFields)) continue;
			if (!isEmployeeManualEditLine(currentLine)) continue;
			const dayKey = resolveLineBusinessDayKey(currentLine);
			if (!dayKey) continue;
			const editedAt = currentLine.editedAt ? currentLine.editedAt.toISOString() : null;
			const existing = revisionSummaryByDate.get(dayKey);
			if (
				existing &&
				new Date(existing.editedAt || 0).getTime() >= new Date(editedAt || 0).getTime()
			) {
				continue;
			}
			revisionSummaryByDate.set(dayKey, {
				isModified: true,
				isManualEdit: true,
				lineId: currentLine.id,
				previousLineId: previousLine.id,
				revisionNo: Number(currentLine.revisionNo || 1),
				ledgerType: String(currentLine.ledgerType || "CORRECTION"),
				editedAt,
				editedBy: currentLine.editedBy || null,
				editReason: currentLine.editReason || null,
				changeType: detectChangeType(before, after),
				changedFields,
			});
		}

		if (!revisionSummaryByDate.size) return timesheet;

		timesheet.breakdown = timesheet.breakdown.map((day: any) => {
			const dayKey = resolveBreakdownBusinessDayKey(day);
			const revisionSummary = dayKey ? revisionSummaryByDate.get(dayKey) : null;
			return revisionSummary ? { ...day, revisionSummary } : day;
		});

		return timesheet;
	};

	const isRevisionWithinSubmissionWindow = (
		line: { editedAt?: Date | null; updatedAt?: Date | null; date?: Date | null },
		submittedAt?: Date | string | null,
	): boolean => {
		if (!submittedAt) return true;
		const cutoff = new Date(submittedAt);
		if (Number.isNaN(cutoff.getTime())) return true;
		cutoff.setTime(cutoff.getTime() - 5 * 60 * 1000);
		const editedAt = line.editedAt || line.updatedAt || line.date;
		if (!editedAt) return false;
		return new Date(editedAt).getTime() >= cutoff.getTime();
	};

	const getApprovedEditedDaysSummary = async (params: {
		organizationId: string;
		employeeId: string;
		timesheetId?: string;
		submittedAt?: Date | string | null;
	}) => {
		const revisionLineSelect = {
			id: true,
			timesheetId: true,
			date: true,
			updatedAt: true,
			editedAt: true,
			ledgerType: true,
			supersedesLineId: true,
			timeIn: true,
			timeOut: true,
			status: true,
			hoursWorked: true,
			regularHours: true,
			overtimeHours: true,
			undertimeHours: true,
			lateHours: true,
			earlyOutHours: true,
			employeeNotes: true,
			approverNotes: true,
			notes: true,
			breakMinutes: true,
			metadata: true,
		} as const;

		const currentRevisionLines = await (prisma as any).timesheetline.findMany({
			where: {
				organizationId: params.organizationId,
				employeeId: params.employeeId,
				isDeleted: false,
				isEffective: true,
				supersedesLineId: { not: null },
				ledgerType: "CORRECTION",
				...(params.timesheetId ? { timesheetId: params.timesheetId } : {}),
			},
			select: revisionLineSelect,
			orderBy: [{ editedAt: "desc" }, { date: "desc" }],
			take: 500,
		});

		const previousLineIds = currentRevisionLines
			.map((line: any) => line.supersedesLineId)
			.filter((value: unknown): value is string => typeof value === "string" && value.length > 0);
		const previousLines = previousLineIds.length
			? await (prisma as any).timesheetline.findMany({
					where: {
						organizationId: params.organizationId,
						id: { in: previousLineIds },
					},
					select: revisionLineSelect,
				})
			: [];
		const previousLineById = new Map(previousLines.map((line: any) => [line.id, line]));

		const itemsByDate = new Map<string, ApprovedEditedDaySummaryItem>();

		for (const currentLine of currentRevisionLines) {
			if (!isRevisionWithinSubmissionWindow(currentLine, params.submittedAt)) continue;
			const previousLine = previousLineById.get(currentLine.supersedesLineId);
			if (!previousLine) continue;
			const before = normalizeTimesheetLineForRevisionAudit(previousLine);
			const after = normalizeTimesheetLineForRevisionAudit(currentLine);
			const changedFields = buildRevisionFieldChanges(before, after);
			if (!changedFields.length || !hasEmployeeMeaningfulRevisionChange(changedFields)) continue;
			if (!isEmployeeManualEditLine(currentLine)) continue;

			const dayKey = resolveLineBusinessDayKey(currentLine);
			if (!dayKey) continue;

			const approvedAt = (
				currentLine.editedAt ||
				currentLine.updatedAt ||
				currentLine.date
			).toISOString();
			const existing = itemsByDate.get(dayKey);
			if (
				existing &&
				new Date(existing.approvedAt).getTime() >= new Date(approvedAt).getTime()
			) {
				continue;
			}

			itemsByDate.set(dayKey, {
				entryId: currentLine.id,
				timesheetId: currentLine.timesheetId,
				date: dayKey,
				periodLabel: currentLine.ledgerType || "Timesheet",
				sourcePeriodType: "PAST",
				approvedAt,
				changeType: detectChangeType(before, after),
				isManualEdit: true,
				changedFields,
				dayPreview: normalizeLedgerDayPreview(after),
			});
		}

		const historicalRows = await (prisma as any).timesheetline.findMany({
			where: {
				organizationId: params.organizationId,
				employeeId: params.employeeId,
				isEffective: false,
				isDeleted: false,
				...(params.timesheetId ? { timesheetId: params.timesheetId } : {}),
			},
			select: revisionLineSelect,
			orderBy: [{ editedAt: "desc" }, { date: "desc" }],
			take: 500,
		});

		const orphanedHistoricalRows = historicalRows.filter(
			(row: any) => !previousLineById.has(row.id) && !itemsByDate.has(resolveLineBusinessDayKey(row)),
		);
		const supersedingLineIds = orphanedHistoricalRows.map((row: any) => row.id);
		const supersedingLines = supersedingLineIds.length
			? await (prisma as any).timesheetline.findMany({
					where: {
						organizationId: params.organizationId,
						employeeId: params.employeeId,
						isDeleted: false,
						isEffective: true,
						supersedesLineId: { in: supersedingLineIds },
						ledgerType: "CORRECTION",
						...(params.timesheetId ? { timesheetId: params.timesheetId } : {}),
					},
					select: revisionLineSelect,
				})
			: [];
		const supersedingLineByPreviousId = new Map(
			supersedingLines.map((line: any) => [line.supersedesLineId, line]),
		);

		for (const historicalRow of orphanedHistoricalRows) {
			const supersedingLine = supersedingLineByPreviousId.get(historicalRow.id);
			if (!supersedingLine) continue;
			if (!isRevisionWithinSubmissionWindow(supersedingLine, params.submittedAt)) continue;

			const before = normalizeTimesheetLineForRevisionAudit(historicalRow);
			const after = normalizeTimesheetLineForRevisionAudit(supersedingLine);
			const changedFields = buildRevisionFieldChanges(before, after);
			if (!changedFields.length || !hasEmployeeMeaningfulRevisionChange(changedFields)) continue;
			if (!isEmployeeManualEditLine(supersedingLine)) continue;

			const dayKey = resolveLineBusinessDayKey(supersedingLine);
			if (!dayKey || itemsByDate.has(dayKey)) continue;

			itemsByDate.set(dayKey, {
				entryId: supersedingLine.id,
				timesheetId: supersedingLine.timesheetId,
				date: dayKey,
				periodLabel: supersedingLine.ledgerType || "Timesheet",
				sourcePeriodType: "PAST",
				approvedAt: (
					supersedingLine.editedAt ||
					supersedingLine.updatedAt ||
					supersedingLine.date
				).toISOString(),
				changeType: detectChangeType(before, after),
				isManualEdit: true,
				changedFields,
				dayPreview: normalizeLedgerDayPreview(after),
			});
		}

		const items = Array.from(itemsByDate.values()).sort((a, b) => {
			const approvedDiff =
				new Date(b.approvedAt).getTime() - new Date(a.approvedAt).getTime();
			if (approvedDiff !== 0) return approvedDiff;
			return b.date.localeCompare(a.date);
		});

		return {
			total: items.length,
			items,
		};
	};

	const TIMESHEETLINE_EFFECTIVE_READ_ORDER = [
		{ date: "asc" as const },
		{ revisionNo: "asc" as const },
		{ createdAt: "asc" as const },
		{ id: "asc" as const },
	];

	/**
	 * Normalize Prisma select for timesheet reads.
	 * - `breakdown` is a virtual response field (built from timesheetlines), not a DB column.
	 *   Clients often request `fields=...,breakdown,...`; map that to timesheetlines instead.
	 * - Always apply effective-line filters/order when timesheetlines are selected.
	 */
	const applySelectiveTimesheetlineReadContract = (selectFields: any) => {
		if (!selectFields || typeof selectFields !== "object") return selectFields;

		const requestedBreakdown = Boolean(selectFields.breakdown);
		if ("breakdown" in selectFields) {
			delete selectFields.breakdown;
		}

		// Virtual computed fields that must never be passed to Prisma select
		for (const virtualKey of [
			"approvedEditedDaysSummary",
			"canRequestEditPermission",
			"requestEditPermissionMode",
			"isCalculated",
		]) {
			if (virtualKey in selectFields) {
				delete selectFields[virtualKey];
			}
		}

		if (requestedBreakdown && !selectFields.timesheetlines) {
			selectFields.timesheetlines = true;
		}

		const timesheetlineSelection = selectFields?.timesheetlines;
		if (!timesheetlineSelection) return selectFields;

		if (timesheetlineSelection === true) {
			selectFields.timesheetlines = {
				where: { isDeleted: false, isEffective: true },
				orderBy: TIMESHEETLINE_EFFECTIVE_READ_ORDER,
			};
			return selectFields;
		}

		if (typeof timesheetlineSelection === "object") {
			timesheetlineSelection.where = {
				...(timesheetlineSelection.where || {}),
				isDeleted: false,
				isEffective: true,
			};
			timesheetlineSelection.orderBy = TIMESHEETLINE_EFFECTIVE_READ_ORDER;
		}
		return selectFields;
	};

	const invalidateTimesheetCaches = async (timesheetId: string, code?: string) => {
		await invalidateCache.byPattern(`cache:timesheet:byId:${timesheetId}:*`);
		if (code) {
			await invalidateCache.byPattern(`cache:timesheet:byCode:${code}:*`);
		}
		await invalidateCache.byPattern(`cache:timesheet:byIdentifier:${timesheetId}:*`);
		if (code) {
			await invalidateCache.byPattern(`cache:timesheet:byIdentifier:${code}:*`);
		}
		await invalidateCache.byPattern("cache:timesheet:list:*");
		await invalidateCache.byPattern("cache:timesheet:view:*");
	};

	const getRequestStateKey = (
		request: { currentWorkflowStateKey?: string | null } | null | undefined,
	) => String(request?.currentWorkflowStateKey || "").toUpperCase();

	const isRequestActiveState = (
		request:
			| { currentWorkflowStateKey?: string | null; currentStepExecutionId?: string | null }
			| null
			| undefined,
	) => {
		const stateKey = getRequestStateKey(request);
		return (
			Boolean(request?.currentStepExecutionId) ||
			["OPEN", "FOR_APPROVAL", "IN_PROCESS"].includes(stateKey)
		);
	};

	const timeStringToMinutes = (value?: string | null): number => {
		if (!value) return 0;
		const [hoursStr, minsStr] = value.split(":");
		const hours = Number(hoursStr);
		const minutes = Number(minsStr);
		if (Number.isNaN(hours) || Number.isNaN(minutes)) return 0;
		return hours * 60 + minutes;
	};

	const minutesToTimeString = (totalMinutes: number): string => {
		const safeMinutes = Math.max(0, totalMinutes);
		const hours = Math.floor(safeMinutes / 60);
		const minutes = safeMinutes % 60;
		return `${hours}:${String(minutes).padStart(2, "0")}`;
	};

	const getMaxStartDate = (periodStart: Date, effectiveStartDate: Date | null) => {
		const normalizedPeriodStart = normalizeToStartOfDay(new Date(periodStart));
		if (!effectiveStartDate) return normalizedPeriodStart;
		return effectiveStartDate > normalizedPeriodStart
			? effectiveStartDate
			: normalizedPeriodStart;
	};

	const sanitizeBreakdownByEffectiveStartDate = (
		breakdown: any[] | null | undefined,
		effectiveStartDate: Date | null,
	) => {
		const source = Array.isArray(breakdown) ? breakdown : [];
		if (!effectiveStartDate) return source;
		const effectiveStartDateKey = resolveBusinessDayKey(effectiveStartDate);
		return source.filter((day) => {
			const dayDateKey = resolveBreakdownBusinessDayKey(day);
			return Boolean(dayDateKey) && dayDateKey >= effectiveStartDateKey;
		});
	};

	const sanitizeBreakdownByEndDate = (
		breakdown: any[] | null | undefined,
		endDate: Date | null,
	) => {
		const source = Array.isArray(breakdown) ? breakdown : [];
		if (!endDate) return source;
		const endDateKey = resolveBusinessDayKey(endDate);
		return source.filter((day) => {
			const dayDateKey = resolveBreakdownBusinessDayKey(day);
			return Boolean(dayDateKey) && dayDateKey <= endDateKey;
		});
	};

	const calculateSummaryFromBreakdown = (breakdown: any[]) => {
		const totals = breakdown.reduce(
			(acc, day) => {
				acc.totalHoursWorked += timeStringToMinutes(day.hoursWorked);
				acc.totalRegularHours += timeStringToMinutes(day.regularHours);
				acc.totalOvertimeHours += timeStringToMinutes(day.overtimeHours);
				acc.totalUndertimeHours += timeStringToMinutes(day.undertimeHours);
				acc.totalLateHours += timeStringToMinutes(day.lateHours);
				acc.totalEarlyOutHours += timeStringToMinutes(day.earlyOutHours);
				if (day.nightShift?.isNightShiftDay && day.nightShift.actualNightHours) {
					acc.totalNightShiftHours += timeStringToMinutes(
						day.nightShift.actualNightHours,
					);
				}
				return acc;
			},
			{
				totalHoursWorked: 0,
				totalRegularHours: 0,
				totalOvertimeHours: 0,
				totalUndertimeHours: 0,
				totalLateHours: 0,
				totalEarlyOutHours: 0,
				totalNightShiftHours: 0,
			},
		);

		return {
			totalDays: breakdown.length,
			totalHoursWorked: minutesToTimeString(totals.totalHoursWorked),
			totalRegularHours: minutesToTimeString(totals.totalRegularHours),
			totalOvertimeHours: minutesToTimeString(totals.totalOvertimeHours),
			totalUndertimeHours: minutesToTimeString(totals.totalUndertimeHours),
			totalLateHours: minutesToTimeString(totals.totalLateHours),
			totalEarlyOutHours: minutesToTimeString(totals.totalEarlyOutHours),
			metadata: {
				totalMinutesWorked: totals.totalHoursWorked,
				totalRegularMinutes: totals.totalRegularHours,
				totalOvertimeMinutes: totals.totalOvertimeHours,
				totalUndertimeMinutes: totals.totalUndertimeHours,
				totalLateMinutes: totals.totalLateHours,
				totalEarlyOutMinutes: totals.totalEarlyOutHours,
				totalNightShiftMinutes: totals.totalNightShiftHours,
				totalNightShiftHours: minutesToTimeString(totals.totalNightShiftHours),
			},
		};
	};

	const formatBreakDisplayFromShift = (schedule: EmployeeSchedule | null, dayDate: Date) => {
		if (!schedule) return "No break";
		const shift = findShiftForDay(schedule as any, dayDate.getUTCDay());
		const breakSlots = shift?.timeSlots?.filter((slot: any) => slot?.type === "break") || [];
		if (!breakSlots.length) return "No break";
		return breakSlots
			.map((slot: any) => `${slot.startTime || ""} - ${slot.endTime || ""}`)
			.join(", ");
	};

	const resolveDayStatus = (params: {
		incomingStatus?: string | null;
		timeIn: Date | null;
		timeOut: Date | null;
		schedule: EmployeeSchedule | null;
		dayDate: Date;
	}) => {
		const { incomingStatus, timeIn, timeOut, schedule, dayDate } = params;
		if (incomingStatus === "LEAVE") return "LEAVE";
		const shift = schedule ? findShiftForDay(schedule as any, dayDate.getUTCDay()) : null;
		const isRestDay = Boolean(shift?.isRestDay);

		if (!timeIn && !timeOut) {
			if (incomingStatus === "REST_DAY" || isRestDay) return "REST_DAY";
			return incomingStatus === "ABSENT" ? "ABSENT" : "ABSENT";
		}

		if (timeIn && !timeOut) return "INCOMPLETE";
		return incomingStatus === "REST_DAY" && isRestDay ? "REST_DAY" : "PRESENT";
	};

	const normalizeApprovalStatus = (
		value: unknown,
	): "DRAFT" | "SUBMITTED" | "APPROVED" | "REJECTED" | "REVISED" | undefined => {
		const normalized = String(value || "").toUpperCase();
		if (normalized === "DRAFT") return "DRAFT";
		if (normalized === "SUBMITTED") return "SUBMITTED";
		if (normalized === "APPROVED") return "APPROVED";
		if (normalized === "REJECTED") return "REJECTED";
		if (normalized === "REVISED") return "REVISED";
		return undefined;
	};

	const normalizeBreakdownForPersistence = async (params: {
		organizationId: string;
		employeeId: string;
		breakdown: any[];
	}) => {
		const normalizedInput = Array.isArray(params.breakdown) ? params.breakdown : [];
		if (!normalizedInput.length) return [];

		const normalizedDayDates = normalizedInput
			.map((day) => new Date(day?.date))
			.filter((d) => !Number.isNaN(d.getTime()));

		if (!normalizedDayDates.length) {
			return normalizedInput;
		}

		return Promise.all(
			normalizedInput.map(async (day) => {
				try {
					const dayDate = new Date(day?.date);
					const normalizedDayDate = Number.isNaN(dayDate.getTime())
						? new Date()
						: dayDate;
					// Use DB resolver so normalize path matches schedule tab/source-of-truth exactly.
					const schedule = await resolveEffectiveShift(prisma as any, {
						organizationId: params.organizationId,
						employeeId: params.employeeId,
						date: normalizedDayDate,
					});

					const timeIn = day?.timeIn ? new Date(day.timeIn) : null;
					const timeOut = day?.timeOut ? new Date(day.timeOut) : null;
					const validTimeIn = timeIn && !Number.isNaN(timeIn.getTime()) ? timeIn : null;
					let validTimeOut =
						timeOut && !Number.isNaN(timeOut.getTime()) ? timeOut : null;

					if (
						schedule?.isOvernight &&
						validTimeIn &&
						validTimeOut &&
						validTimeOut.getTime() <= validTimeIn.getTime()
					) {
						validTimeOut = new Date(validTimeOut.getTime() + 24 * 60 * 60 * 1000);
					}

					const calc = calculateTimekeeping(
						validTimeIn,
						validTimeOut,
						schedule,
						normalizedDayDate,
						"Asia/Manila",
					);

					const breakDisplayFromSchedule = formatBreakDisplayFromShift(
						schedule,
						normalizedDayDate,
					);
					const incomingMetadata: Record<string, any> =
						day?.metadata &&
						typeof day.metadata === "object" &&
						!Array.isArray(day.metadata)
							? day.metadata
							: {};
					const graceStatus = deriveGracePeriodStatus(
						validTimeIn,
						schedule,
						normalizedDayDate,
						"Asia/Manila",
					);

					const graceEarlyOutMinutes = Math.max(
						0,
						Number((schedule as any)?.graceEarlyOutMinutes ?? 0),
					);
					// Policy: early-out grace is currently disabled in computations; keep explicit metadata for UI clarity.
					const rawEarlyOutMinutes = calc.earlyOutMinutes;
					const normalizedBreakDisplay = breakDisplayFromSchedule || "No break";
					const overtimeApplication = await resolveOvertimePolicyApplication(
						prisma,
						params.organizationId,
						{
							calc,
							timeIn: validTimeIn,
							timeOut: validTimeOut,
							schedule,
							date: normalizedDayDate,
							existingMetadata: incomingMetadata,
							attendanceStatus: day?.status || null,
							approvedOvertimeMinutes:
								incomingMetadata.overtimeApprovalStatus === "APPROVED"
									? Number(incomingMetadata.pendingOvertimeMinutes || 0)
									: 0,
						},
					);

					return {
						approvalStatus: normalizeApprovalStatus(day?.approvalStatus),
						date: normalizedDayDate,
						timeIn: validTimeIn,
						timeOut: validTimeOut,
						hoursWorked: formatMinutesAsTime(calc.totalMinutesWorked),
						regularHours: formatMinutesAsTime(calc.regularMinutes),
						overtimeHours: overtimeApplication.timekeepingFields.overtimeHours,
						undertimeHours: formatMinutesAsTime(calc.undertimeMinutes),
						lateHours: formatMinutesAsTime(calc.lateMinutes),
						earlyOutHours: formatMinutesAsTime(calc.earlyOutMinutes),
						status: resolveDayStatus({
							incomingStatus: day?.status || null,
							timeIn: validTimeIn,
							timeOut: validTimeOut,
							schedule,
							dayDate: normalizedDayDate,
						}),
						employeeNotes:
							typeof day?.employeeNotes === "string" ? day.employeeNotes : null,
						approverNotes:
							typeof day?.approverNotes === "string" ? day.approverNotes : null,
						dayLaborType: normalizeDayLaborType(day?.dayLaborType),
						metadata: {
							...incomingMetadata,
							...mergeOvertimeMetadata(incomingMetadata, overtimeApplication.metadata),
							totalMinutes: calc.totalMinutesWorked,
							regularMinutes: calc.regularMinutes,
							overtimeMinutes: overtimeApplication.timekeepingFields.overtimeMinutes,
							undertimeMinutes: calc.undertimeMinutes,
							lateMinutes: calc.lateMinutes,
							earlyOutMinutes: calc.earlyOutMinutes,
							rawLateMinutes: graceStatus.rawLateMinutes,
							gracePeriodMinutes: graceStatus.gracePeriodMinutes,
							rawEarlyOutMinutes,
							graceEarlyOutMinutes,
							withinGrace: graceStatus.withinGrace,
							breakMinutes: calc.breakMinutes,
							breakDisplay: normalizedBreakDisplay,
						},
					};
				} catch (dayError) {
					timesheetLogger.error(
						`normalizeBreakdownForPersistence day normalization failed for ${String(day?.date || "unknown-date")}: ${dayError}`,
					);

					const fallbackDate = new Date(day?.date);
					const fallbackTimeIn = day?.timeIn ? new Date(day.timeIn) : null;
					const fallbackTimeOut = day?.timeOut ? new Date(day.timeOut) : null;
					return {
						approvalStatus: normalizeApprovalStatus(day?.approvalStatus),
						date: Number.isNaN(fallbackDate.getTime()) ? new Date() : fallbackDate,
						timeIn:
							fallbackTimeIn && !Number.isNaN(fallbackTimeIn.getTime())
								? fallbackTimeIn
								: null,
						timeOut:
							fallbackTimeOut && !Number.isNaN(fallbackTimeOut.getTime())
								? fallbackTimeOut
								: null,
						hoursWorked:
							typeof day?.hoursWorked === "string" ? day.hoursWorked : "0:00",
						regularHours:
							typeof day?.regularHours === "string" ? day.regularHours : "0:00",
						overtimeHours:
							typeof day?.overtimeHours === "string" ? day.overtimeHours : "0:00",
						undertimeHours:
							typeof day?.undertimeHours === "string" ? day.undertimeHours : "0:00",
						lateHours: typeof day?.lateHours === "string" ? day.lateHours : "0:00",
						earlyOutHours:
							typeof day?.earlyOutHours === "string" ? day.earlyOutHours : "0:00",
						status: typeof day?.status === "string" ? day.status : "ABSENT",
						employeeNotes:
							typeof day?.employeeNotes === "string" ? day.employeeNotes : null,
						approverNotes:
							typeof day?.approverNotes === "string" ? day.approverNotes : null,
						dayLaborType: normalizeDayLaborType(day?.dayLaborType),
						metadata:
							day?.metadata &&
							typeof day.metadata === "object" &&
							!Array.isArray(day.metadata)
								? day.metadata
								: {},
					};
				}
			}),
		);
	};

	const injectNightShiftIntoBreakdown = async (params: {
		organizationId: string;
		employeeId: string;
		breakdown: any[];
	}) => {
		const rows = Array.isArray(params.breakdown) ? params.breakdown : [];
		if (!rows.length) return rows;

		return Promise.all(
			rows.map(async (day) => {
				const dayDate = new Date(day?.date);
				if (Number.isNaN(dayDate.getTime())) return day;

				const schedule = await resolveEffectiveShift(prisma as any, {
					organizationId: params.organizationId,
					employeeId: params.employeeId,
					date: dayDate,
				});

				const nightShift = computeNightShiftForDay({
					isOvernight: schedule?.isOvernight,
					scheduleStartTime: schedule?.startTime,
					scheduleEndTime: schedule?.endTime,
					hoursWorked: day?.hoursWorked || "0:00",
					timeIn: day?.timeIn || null,
					timeOut: day?.timeOut || null,
				});

				if (!nightShift) {
					if (!day?.nightShift) return day;
					return { ...day, nightShift: undefined };
				}

				return {
					...day,
					nightShift: {
						isNightShiftDay: true,
						scheduledWindow: nightShift.scheduledWindow,
						actualNightHours: nightShift.actualNightHours || "0:00",
					},
				};
			}),
		);
	};

	const refreshEditableCurrentTimesheetSnapshotForRead = async (params: {
		timesheet: any;
		date?: Date;
		refetch: () => Promise<any>;
	}) => {
		if (!ENABLE_EDITABLE_TIMESHEET_REFRESH_ON_READ) return params.timesheet;

		const timesheet = params.timesheet;
		if (!timesheet?.id || !timesheet?.organizationId || !timesheet?.employeeId) {
			return timesheet;
		}

		const period = timesheet.payrollPeriod;
		const currentDate = params.date || new Date();
		const periodCheckDate = new Date(currentDate);
		periodCheckDate.setUTCHours(0, 0, 0, 0);
		const isCurrentPeriodTimesheet =
			period?.startDate &&
			period?.endDate &&
			new Date(period.startDate) <= currentDate &&
			new Date(period.endDate) >= periodCheckDate;

		if (!isCurrentPeriodTimesheet) return timesheet;

		const refreshedTimesheet = await refreshTimesheetForAttendanceDate(prisma, {
			organizationId: String(timesheet.organizationId),
			employeeId: String(timesheet.employeeId),
			date: currentDate,
		});

		if (
			!refreshedTimesheet ||
			(refreshedTimesheet as any).refreshSkipped ||
			(refreshedTimesheet as any).id !== timesheet.id
		) {
			return timesheet;
		}

		await invalidateTimesheetCaches(timesheet.id, timesheet.code);

		const refetchedTimesheet = (await params.refetch()) || timesheet;
		if (
			Array.isArray((refreshedTimesheet as any).breakdown) &&
			(refreshedTimesheet as any).breakdown.length &&
			(!Array.isArray((refetchedTimesheet as any).breakdown) ||
				(refetchedTimesheet as any).breakdown.length === 0)
		) {
			(refetchedTimesheet as any).breakdown = (refreshedTimesheet as any).breakdown;
		}
		return refetchedTimesheet;
	};

	const isCurrentPeriodTimesheet = (timesheet: any, date: Date = new Date()): boolean => {
		const period = timesheet?.payrollPeriod;
		if (!period?.startDate || !period?.endDate) return false;
		const periodCheckDate = new Date(date);
		periodCheckDate.setUTCHours(0, 0, 0, 0);
		return new Date(period.startDate) <= date && new Date(period.endDate) >= periodCheckDate;
	};

	const enrichCurrentPeriodTimesheetWithLiveDays = async (timesheet: any, date: Date = new Date()) => {
		if (
			!timesheet?.id ||
			!timesheet?.organizationId ||
			!timesheet?.employeeId ||
			!timesheet?.payrollPeriodId ||
			!isCurrentPeriodTimesheet(timesheet, date)
		) {
			return timesheet;
		}

		const effectiveStartDate = getEffectiveEmploymentStartDate(timesheet.employee);
		const fromDate = getMaxStartDate(
			new Date(timesheet.payrollPeriod.startDate),
			effectiveStartDate,
		);
		const periodEndDate = new Date(timesheet.payrollPeriod.endDate);
		const toDate = toBusinessDayEnd(periodEndDate);

		const obligations = await (prisma as any).attendanceObligation.findMany({
			where: {
				organizationId: String(timesheet.organizationId),
				employeeId: String(timesheet.employeeId),
				payrollPeriodId: String(timesheet.payrollPeriodId),
				date: { gte: fromDate, lte: toDate },
				isDeleted: false,
			},
			include: {
				attendance: true,
			},
			orderBy: { date: "asc" },
		});

		if (!obligations.length) return timesheet;

		const obligationBreakdown = buildTimesheetBreakdownFromObligations(obligations, date);
		const lineBreakdown = buildBreakdownFromTimesheetLines((timesheet as any).timesheetlines);
		const obligationByDate = new Map(
			obligations.map((obligation: any) => [
				String(obligation.businessDate || resolveBusinessDayKey(obligation.date)),
				obligation,
			]),
		);
		const lineBreakdownByDate = new Map(
			lineBreakdown.map((day: any) => [resolveBreakdownBusinessDayKey(day), day]),
		);
		const liveDateKeys = new Set<string>();

		const mergedBreakdown = obligationBreakdown.map((day: any) => {
			const dayKey = resolveBreakdownBusinessDayKey(day);
			liveDateKeys.add(dayKey);
			const approvedLineDay = lineBreakdownByDate.get(dayKey);
			const obligation = obligationByDate.get(dayKey);
			if (!approvedLineDay) {
				return {
					...day,
					metadata: {
						...(day.metadata || {}),
						attendanceId: obligation?.attendanceId || null,
					},
				};
			}

			return {
				...approvedLineDay,
				metadata: {
					...(approvedLineDay.metadata || {}),
					sourceOfTruth: "TIMESHEETLINE",
					liveAttendanceObligation: obligation
						? {
								id: obligation.id,
								status: obligation.status,
								phase: obligation.phase,
								attendanceId: obligation.attendanceId || null,
							}
						: null,
				},
			};
		});

		for (const day of lineBreakdown) {
			const dayKey = resolveBreakdownBusinessDayKey(day);
			if (!liveDateKeys.has(dayKey)) mergedBreakdown.push(day);
		}

		mergedBreakdown.sort((a: any, b: any) =>
			resolveBreakdownBusinessDayKey(a).localeCompare(resolveBreakdownBusinessDayKey(b)),
		);

		const attendanceById = new Map<string, any>();
		for (const attendance of Array.isArray(timesheet.attendances) ? timesheet.attendances : []) {
			if (attendance?.id) attendanceById.set(attendance.id, attendance);
		}
		for (const obligation of obligations) {
			if (obligation?.attendance?.id) attendanceById.set(obligation.attendance.id, obligation.attendance);
		}

		timesheet.breakdown = mergedBreakdown;
		timesheet.attendances = [...attendanceById.values()];
		timesheet.attendanceObligations = obligations;
		Object.assign(timesheet, calculateSummaryFromBreakdown(mergedBreakdown));
		return timesheet;
	};

	const getOrCreateTimesheetConfig = async (organizationId: string) =>
		getOrCreateNormalizedTimesheetConfig(prisma, organizationId);

	const isTimesheetPolicyManager = (role?: string) =>
		["hris-hr-manager", "hris-hr-user", "hris-admin", "admin", "super_admin"].includes(
			role || "",
		);

	const isManagerRole = (role?: string) =>
		[
			"hris-employee-manager",
			"hris-line-leader",
			"hris-hr-user",
			"hris-hr-manager",
			"hris-admin",
			"admin",
			"super_admin",
		].includes(role || "");

	const generateRequestCode = async (organizationId: string): Promise<string> => {
		const requestsWithCodes = await prisma.request.findMany({
			where: {
				organizationId,
				code: { not: null },
			},
			select: {
				code: true,
			},
		});

		let maxNumber = 0;
		for (const request of requestsWithCodes) {
			if (!request.code) continue;
			const match = request.code.match(/REQ-(\d+)/);
			if (!match) continue;
			const number = parseInt(match[1], 10);
			if (number > maxNumber) {
				maxNumber = number;
			}
		}

		return `REQ-${(maxNumber + 1).toString().padStart(5, "0")}`;
	};

	const getActingEmployeeId = async (authReq: AuthRequest): Promise<string | null> => {
		if (authReq.metadata?.employee?.id) {
			return authReq.metadata.employee.id;
		}

		if (!authReq.userId || !authReq.organizationId) {
			return null;
		}

		const employee = await prisma.employee.findFirst({
			where: {
				organizationId: authReq.organizationId,
				userId: authReq.userId,
				isDeleted: false,
			},
			select: { id: true },
		});

		return employee?.id ?? null;
	};

	const buildEmployeeSummary = (employee?: any | null) => {
		if (!employee) return null;
		const firstName = employee.person?.personalInfo?.firstName || null;
		const lastName = employee.person?.personalInfo?.lastName || null;
		return {
			id: employee.id,
			firstName,
			lastName,
			employeeId: employee.employeeId || null,
		};
	};

	const enrichTimesheetPermissionDisplay = async (timesheet: any) => {
		if (!timesheet) return timesheet;

		const grantedById = timesheet.editPermissionGrantedBy || null;
		const rejectedById = timesheet.editPermissionRejectedBy || null;
		const actorIds = [grantedById, rejectedById].filter(Boolean) as string[];

		let actorMap = new Map<string, any>();
		if (actorIds.length) {
			const actors = await prisma.employee.findMany({
				where: {
					id: { in: actorIds },
					organizationId: timesheet.organizationId,
					isDeleted: false,
				},
				select: {
					id: true,
					employeeId: true,
					person: {
						select: {
							personalInfo: true,
						},
					},
				},
			});
			actorMap = new Map(actors.map((actor) => [actor.id, actor]));
		}

		const manager = timesheet.employee?.reportTo
			? buildEmployeeSummary(timesheet.employee.reportTo)
			: null;

		return {
			...timesheet,
			employee: timesheet.employee
				? {
						...timesheet.employee,
						reportTo: manager,
					}
				: timesheet.employee,
			editPermissionGrantedByEmployee: grantedById
				? buildEmployeeSummary(actorMap.get(grantedById))
				: null,
			editPermissionRejectedByEmployee: rejectedById
				? buildEmployeeSummary(actorMap.get(rejectedById))
				: null,
		};
	};

	const shouldRequireEditPermission = (status: string, editPermissionStatus?: string | null) => {
		if (["DRAFT", "REVISED"].includes(status)) {
			return false;
		}

		if (!["SUBMITTED", "APPROVED"].includes(status)) {
			return false;
		}

		return !["APPROVED", "CONSUMED"].includes(editPermissionStatus || "");
	};

	const resolvePayrollPeriod = async (params: {
		organizationId: string;
		periodCode?: string;
	}) => {
		const now = new Date();
		const periodCheckDate = new Date(now);
		periodCheckDate.setUTCHours(0, 0, 0, 0);

		if (params.periodCode?.trim()) {
			return prisma.payrollPeriod.findFirst({
				where: {
					organizationId: params.organizationId,
					code: params.periodCode.trim(),
					isDeleted: false,
				},
			});
		}

		return prisma.payrollPeriod.findFirst({
			where: {
				organizationId: params.organizationId,
				startDate: { lte: now },
				endDate: { gte: periodCheckDate },
				isDeleted: false,
			},
		});
	};

	const resolveTimesheetWorkflow = async (
		organizationId: string,
		mode: "SUBMISSION" | "EDIT_PERMISSION" = "SUBMISSION",
	) => {
		await getOrCreateTimesheetConfig(organizationId);
		return getDefaultRequestWorkflow(
			prisma,
			organizationId,
			"TIMESHEET",
			mode === "EDIT_PERMISSION"
				? REQUEST_WORKFLOW_CODES.TIMESHEET_EDIT_PERMISSION
				: REQUEST_WORKFLOW_CODES.TIMESHEET_SUBMISSION,
		);
	};

	const assertEditingPolicyEnabled = async (organizationId: string) => {
		const timesheetConfig = await getOrCreateTimesheetConfig(organizationId);
		if (!timesheetConfig.enableEditBeforeSubmission) {
			throw new Error("POLICY_DISABLED");
		}
		return timesheetConfig;
	};

	const createEditPermissionRequestForTimesheet = async (params: {
		authReq: AuthRequest;
		timesheet: {
			id: string;
			code: string;
			employeeId: string;
			payrollPeriod?: { code?: string | null } | null;
			editPermissionStatus?: string | null;
			status: string;
		};
		reason: string;
	}) => {
		const { authReq, timesheet, reason } = params;
		const actingEmployeeId = await getActingEmployeeId(authReq);
		if (!actingEmployeeId) {
			throw new Error("EMPLOYEE_CONTEXT_REQUIRED");
		}

		if (timesheet.employeeId !== actingEmployeeId) {
			throw new Error("ONLY_OWNER_CAN_REQUEST");
		}

		if (timesheet.status === "REVISED") {
			throw new Error("PERMISSION_NOT_REQUIRED_FOR_REVISED");
		}

		if (timesheet.editPermissionStatus === "REQUESTED") {
			throw new Error("EDIT_PERMISSION_ALREADY_REQUESTED");
		}

		if (timesheet.editPermissionStatus === "APPROVED") {
			throw new Error("EDIT_PERMISSION_ALREADY_APPROVED");
		}

		const workflow = await resolveTimesheetWorkflow(authReq.organizationId!, "EDIT_PERMISSION");
		if (!workflow) {
			throw new Error("WORKFLOW_NOT_CONFIGURED");
		}

		const requester = await prisma.employee.findFirst({
			where: {
				id: actingEmployeeId,
				organizationId: authReq.organizationId,
				isDeleted: false,
			},
			select: {
				id: true,
				reportToId: true,
			},
		});
		if (!requester) {
			throw new Error("REQUESTER_NOT_FOUND");
		}

		const requestCode = await generateRequestCode(authReq.organizationId!);
		const now = new Date();

		const request = await prisma.$transaction(async (tx) => {
			const created = await tx.request.create({
				data: {
					organizationId: authReq.organizationId!,
					code: requestCode,
					type: "TIMESHEET",
					currentWorkflowStateKey: "OPEN",
					description: "Timesheet edit permission request",
					startDate: now,
					endDate: now,
					requester: {
						connect: {
							id: requester.id,
						},
					},
						metadata: {
							timesheetAction: "EDIT_PERMISSION",
							timesheetId: timesheet.id,
						employeeId: requester.id,
						periodCode: timesheet.payrollPeriod?.code ?? null,
						reason,
					},
					notes: reason,
				},
			});

			await createRequestStepExecutions(tx, {
				organizationId: authReq.organizationId!,
				requestId: created.id,
				steps: workflow.steps,
				workflowStates: workflow.states,
				workflowCode: workflow.code,
				workflowName: workflow.name,
				workflowDescription: workflow.description,
				requestType: "TIMESHEET",
				requesterId: requester.id,
				reportToId: requester.reportToId,
			});

			await tx.timesheet.update({
				where: { id: timesheet.id },
				data: {
					editPermissionStatus: "REQUESTED",
					editPermissionRequestId: created.id,
					editPermissionRequestedAt: now,
					editPermissionReason: reason,
					editPermissionGrantedAt: null,
					editPermissionGrantedBy: null,
					editPermissionRejectedAt: null,
					editPermissionRejectedBy: null,
					editPermissionRejectionReason: null,
					editPermissionConsumedAt: null,
				},
			});

			return created;
		});

		await invalidateTimesheetCaches(timesheet.id, timesheet.code);

		try {
			await publishRequestCreatedNotification(
				prisma,
				(authReq as any).io,
				request.id,
				requester.id,
			);
		} catch (notificationError) {
			timesheetLogger.warn(
				`Failed to publish timesheet edit permission notification for ${request.id}: ${notificationError}`,
			);
		}

		return {
			requestId: request.id,
			timesheetId: timesheet.id,
			editPermissionStatus: "REQUESTED" as const,
		};
	};

	const getLatestTimesheetSubmissionRequest = async (params: {
		organizationId: string;
		timesheetId: string;
		requesterId: string;
	}) => {
		const requests = await prisma.request.findMany({
			where: {
				organizationId: params.organizationId,
				requesterId: params.requesterId,
				type: "TIMESHEET",
				isDeleted: false,
			},
			select: {
				id: true,
				currentWorkflowStateKey: true,
				workflowInstanceId: true,
				metadata: true,
			},
			orderBy: { createdAt: "desc" },
			take: 20,
		});

		return requests.find((request) => {
			const metadata = (request.metadata || {}) as Record<string, any>;
			return (
				metadata.timesheetAction === "SUBMISSION" &&
				String(metadata.timesheetId || "") === params.timesheetId
			);
		});
	};

	const createOrReuseTimesheetSubmissionRequest = async (params: {
		authReq: AuthRequest;
		timesheet: {
			id: string;
			code: string;
			employeeId: string;
			payrollPeriod?: { code?: string | null } | null;
		};
		reason?: string;
	}) => {
		const { authReq, timesheet, reason } = params;
		const requester = await prisma.employee.findFirst({
			where: {
				id: timesheet.employeeId,
				organizationId: authReq.organizationId,
				isDeleted: false,
			},
			select: {
				id: true,
				reportToId: true,
			},
		});
		if (!requester) {
			throw new Error("REQUESTER_NOT_FOUND");
		}

		const workflow = await resolveTimesheetWorkflow(authReq.organizationId!, "SUBMISSION");
		if (!workflow) {
			throw new Error("WORKFLOW_NOT_CONFIGURED");
		}

		const now = new Date();
		const existing = await getLatestTimesheetSubmissionRequest({
			organizationId: authReq.organizationId!,
			timesheetId: timesheet.id,
			requesterId: requester.id,
		});

		const request = await prisma.$transaction(async (tx) => {
			if (!existing || !existing.workflowInstanceId) {
				const requestCode = await generateRequestCode(authReq.organizationId!);
				const created = await tx.request.create({
					data: {
						organizationId: authReq.organizationId!,
						code: requestCode,
						type: "TIMESHEET",
						currentWorkflowStateKey: "OPEN",
						description: "Timesheet submission request",
						startDate: now,
						endDate: now,
						requester: {
							connect: {
								id: requester.id,
							},
						},
						metadata: {
							timesheetAction: "SUBMISSION",
							timesheetId: timesheet.id,
							employeeId: requester.id,
							periodCode: timesheet.payrollPeriod?.code ?? null,
						},
						notes: reason || null,
					},
				});

				await createRequestStepExecutions(tx, {
					organizationId: authReq.organizationId!,
					requestId: created.id,
					steps: workflow.steps,
					workflowStates: workflow.states,
					workflowCode: workflow.code,
					workflowName: workflow.name,
					workflowDescription: workflow.description,
					requestType: "TIMESHEET",
					requesterId: requester.id,
					reportToId: requester.reportToId,
				});

				return created;
			}

			await tx.workflowStepExecution.updateMany({
				where: {
					requestId: existing.id,
					isDeleted: false,
				},
				data: {
					isDeleted: true,
				},
			});

			const updated = await tx.request.update({
				where: { id: existing.id },
				data: {
					currentWorkflowStateKey: "OPEN",
					workflowInstanceId: existing.workflowInstanceId,
					notes: reason ? reason : undefined,
					currentStepExecutionId: null,
					lastCompletedStepExecutionId: null,
					metadata: {
						...((existing.metadata || {}) as Record<string, any>),
						timesheetAction: "SUBMISSION",
						timesheetId: timesheet.id,
						employeeId: requester.id,
						periodCode: timesheet.payrollPeriod?.code ?? null,
					},
				},
			});

			await createRequestStepExecutions(tx, {
				organizationId: authReq.organizationId!,
				requestId: updated.id,
				steps: workflow.steps,
				workflowStates: workflow.states,
				workflowCode: workflow.code,
				workflowName: workflow.name,
				workflowDescription: workflow.description,
				requestType: "TIMESHEET",
				requesterId: requester.id,
				reportToId: requester.reportToId,
			});

			return updated;
		});

		try {
			await publishRequestCreatedNotification(
				prisma,
				(authReq as any).io,
				request.id,
				requester.id,
			);
		} catch (notificationError) {
			timesheetLogger.warn(
				`Failed to publish timesheet submission notification for ${request.id}: ${notificationError}`,
			);
		}

		return request.id;
	};

	const applySubmissionRequestReview = async (params: {
		organizationId: string;
		requestId: string;
		decision: "approve" | "reject";
		actingEmployeeId: string;
		reason?: string;
	}) => {
		const now = new Date();
		const requestRecord = await prisma.request.findFirst({
			where: {
				id: params.requestId,
				organizationId: params.organizationId,
				isDeleted: false,
				type: "TIMESHEET",
			},
			select: {
				id: true,
				currentWorkflowStateKey: true,
				currentStepExecutionId: true,
				metadata: true,
			},
		});

		if (!requestRecord) {
			return;
		}

		if (!isRequestActiveState(requestRecord)) {
			return;
		}

		if (!requestRecord.currentStepExecutionId) {
			await prisma.request.update({
				where: { id: requestRecord.id },
				data: {
					currentWorkflowStateKey:
						params.decision === "approve" ? "APPROVED" : "REJECTED",
					notes: params.reason?.trim() || undefined,
				},
			});
			return;
		}

		const currentStep = await prisma.workflowStepExecution.findFirst({
			where: {
				id: requestRecord.currentStepExecutionId,
				requestId: requestRecord.id,
				isDeleted: false,
				status: "PENDING",
			},
			select: {
				id: true,
			},
		});

		if (!currentStep) {
			return;
		}

		await prisma.$transaction(async (tx) => {
			await tx.workflowStepExecution.update({
				where: { id: currentStep.id },
				data: {
					status: params.decision === "approve" ? "APPROVED" : "REJECTED",
					completedAt: now,
					assigneeId: params.actingEmployeeId,
					comments: params.reason?.trim() || null,
				},
			});

			if (params.decision === "approve") {
				await updateRequestStepProgress(tx, requestRecord.id, currentStep.id);

				const requestAfterProgress = await tx.request.findUnique({
					where: { id: requestRecord.id },
					select: { currentStepExecutionId: true },
				});
				const isFullyApproved = !requestAfterProgress?.currentStepExecutionId;
				await tx.request.update({
					where: { id: requestRecord.id },
					data: {
						...(isFullyApproved ? { currentWorkflowStateKey: "APPROVED" } : {}),
						notes: params.reason?.trim() || undefined,
					},
				});
				return;
			}

			await tx.request.update({
				where: { id: requestRecord.id },
				data: {
					currentWorkflowStateKey: "REJECTED",
					currentStepExecutionId: null,
					lastCompletedStepExecutionId: currentStep.id,
					notes: params.reason?.trim() || null,
				},
			});
		});
	};

	const create = async (req: Request, res: Response, _next: NextFunction) => {
		const validation = CreateTimesheetSchema.safeParse(req.body);
		if (!validation.success) {
			const formattedErrors = formatZodErrors(validation.error.format());
			timesheetLogger.error(`Validation failed: ${JSON.stringify(formattedErrors)}`);
			const errorResponse = buildErrorResponse("Validation failed", 400, formattedErrors);
			res.status(400).json(errorResponse);
			return;
		}

		try {
			const { organizationId, employeeId, payrollPeriodId } = validation.data;

			// Check if timesheet already exists for this period
			const existingTimesheet = await prisma.timesheet.findFirst({
				where: {
					organizationId,
					employeeId,
					payrollPeriodId,
					isDeleted: false,
				},
			});

			if (existingTimesheet) {
				timesheetLogger.warn(
					`Timesheet already exists for employee ${employeeId} for payroll period ${payrollPeriodId}`,
				);
				const errorResponse = buildErrorResponse(
					"Timesheet already exists for this period",
					409,
				);
				res.status(409).json(errorResponse);
				return;
			}

			// Generate unique timesheet code
			const code = await generateUniqueTimesheetCode(prisma, organizationId);
			timesheetLogger.info(`Generated unique timesheet code: ${code}`);

			// Create timesheet without summary first
			const timesheet = await prisma.timesheet.create({
				data: {
					code,
					organizationId,
					employeeId,
					payrollPeriodId,
					status: validation.data.status || "DRAFT",
					notes: validation.data.notes,
				},
				include: {
					employee: {
						include: {
							person: true,
							position: true,
							department: true,
						},
					},
					attendances: true,
					timesheetlines: {
						where: { isDeleted: false, isEffective: true },
						orderBy: { date: "asc" },
					},
				},
			});

			timesheetLogger.info(`Timesheet created successfully: ${timesheet.id}`);

			logActivity(req, {
				userId: (req as any).user?.id || "unknown",
				action:
					config.ACTIVITY_LOG.TIMESHEET?.ACTIONS?.CREATE_TIMESHEET || "CREATE_TIMESHEET",
				description: `Timesheet created: ${timesheet.id}`,
				page: {
					url: req.originalUrl,
					title:
						config.ACTIVITY_LOG.TIMESHEET?.PAGES?.TIMESHEET_CREATION ||
						"Timesheet Creation",
				},
			});

			logAudit(req, {
				userId: (req as any).user?.id || "unknown",
				action: config.AUDIT_LOG.ACTIONS.CREATE,
				resource: "TIMESHEET",
				severity: config.AUDIT_LOG.SEVERITY.LOW,
				entityType: "TIMESHEET",
				entityId: timesheet.id,
				changesBefore: null,
				changesAfter: {
					id: timesheet.id,
					employeeId: timesheet.employeeId,
					payrollPeriodId: timesheet.payrollPeriodId,
					status: timesheet.status,
					createdAt: timesheet.createdAt,
				},
				description: `Timesheet created: ${timesheet.id}`,
			});

			try {
				await invalidateCache.byPattern("cache:timesheet:list:*");
				await invalidateCache.byPattern("cache:timesheet:view:*");
				timesheetLogger.info("Timesheet list cache invalidated after creation");
			} catch (cacheError) {
				timesheetLogger.warn(
					"Failed to invalidate cache after timesheet creation:",
					cacheError,
				);
			}

			const successResponse = buildSuccessResponse(
				"Timesheet created successfully",
				timesheet,
				201,
			);
			res.status(201).json(successResponse);
		} catch (error) {
			timesheetLogger.error(`Failed to create timesheet: ${error}`);
			const errorResponse = buildErrorResponse("Failed to create timesheet", 500);
			res.status(500).json(errorResponse);
		}
	};

	const getAll = async (req: Request, res: Response, _next: NextFunction) => {
		const validationResult = validateQueryParams(req, timesheetLogger);

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
			filter,
			groupBy,
			pagination,
			count,
			document,
		} = validationResult.validatedParams!;

		try {
			timesheetLogger.info("Fetching all timesheets");

			const whereClause: Prisma.TimesheetWhereInput = {
				isDeleted: false,
			};

			const searchFields = [
				"code",
				"notes",
				"employee.employeeId",
				"employee.person.personalInfo.firstName",
				"employee.person.personalInfo.lastName",
				"payrollPeriod.name",
				"payrollPeriod.code",
			];

			if (query) {
				const searchConditions = buildSearchConditions("Timesheet", query, searchFields);
				if (searchConditions.length > 0) {
					whereClause.OR = searchConditions;
				}
			}

			if (filter) {
				const filterConditions = buildFilterConditions("Timesheet", filter);
				if (filterConditions.length > 0) {
					whereClause.AND = filterConditions;
				}
			}

			const scheduleCoverage = String(req.query.scheduleCoverage || "").trim();
			if (scheduleCoverage === "with" || scheduleCoverage === "without") {
				const scheduleCoverageCondition: Prisma.TimesheetWhereInput =
					scheduleCoverage === "with"
						? {
								employee: {
									AND: [
										{
											NOT: [
												{
													embeddedSchedule: {
														equals: Prisma.DbNull,
													},
												},
											],
										},
										{
											NOT: [
												{
													embeddedSchedule: {
														equals: Prisma.JsonNull,
													},
												},
											],
										},
										{
											NOT: [
												{
													embeddedSchedule: {
														equals: null as any,
													},
												},
											],
										},
									],
								},
							}
						: {
								employee: {
									OR: [
										{ embeddedSchedule: { equals: Prisma.DbNull } },
										{ embeddedSchedule: { equals: Prisma.JsonNull } },
										{ embeddedSchedule: { equals: null as any } },
									],
								},
							};
				whereClause.AND = [...((whereClause.AND as any[]) || []), scheduleCoverageCondition];
			}

			if (String(req.query.timesheetQueues || "").toLowerCase() === "hr") {
				const rawQueueLimit = Number(req.query.queueLimit || limit || 5);
				const queueLimit = Number.isFinite(rawQueueLimit)
					? Math.min(Math.max(Math.floor(rawQueueLimit), 1), 25)
					: 5;
				const queuePage = 1;
				const queueSkip = 0;
				const buildQueueWhere = (statuses: string[]): Prisma.TimesheetWhereInput => ({
					AND: [
						whereClause,
						statuses.length === 1
							? { status: statuses[0] as any }
							: { OR: statuses.map((status) => ({ status: status as any })) },
					],
				});
				const queueGroups = {
					draft: ["DRAFT"],
					submitted: ["SUBMITTED"],
					correction: ["REJECTED", "REVISED"],
					approved: ["APPROVED"],
				};
				const buildQueueQuery = (statuses: string[]) =>
					buildFindManyQuery(
						buildQueueWhere(statuses),
						queueSkip,
						queueLimit,
						order,
						sort || "updatedAt",
						fields,
					);

				const [
					draftTimesheets,
					submittedTimesheets,
					correctionTimesheets,
					approvedTimesheets,
					total,
					draftCount,
					submittedCount,
					correctionCount,
					approvedCount,
				] = await Promise.all([
					prisma.timesheet.findMany(buildQueueQuery(queueGroups.draft)),
					prisma.timesheet.findMany(buildQueueQuery(queueGroups.submitted)),
					prisma.timesheet.findMany(buildQueueQuery(queueGroups.correction)),
					prisma.timesheet.findMany(buildQueueQuery(queueGroups.approved)),
					prisma.timesheet.count({ where: whereClause }),
					prisma.timesheet.count({ where: buildQueueWhere(queueGroups.draft) }),
					prisma.timesheet.count({ where: buildQueueWhere(queueGroups.submitted) }),
					prisma.timesheet.count({ where: buildQueueWhere(queueGroups.correction) }),
					prisma.timesheet.count({ where: buildQueueWhere(queueGroups.approved) }),
				]);

				const buildQueueBucket = (timesheets: any[], totalItems: number) => ({
					timesheets,
					count: totalItems,
					pagination: buildPagination(totalItems, queuePage, queueLimit),
				});

				res.status(200).json(
					buildSuccessResponse(
						"HR timesheet queues retrieved successfully",
						{
							timesheetSummary: {
								total,
								draft: draftCount,
								submitted: submittedCount,
								correction: correctionCount,
								approved: approvedCount,
							},
							timesheetQueues: {
								draft: buildQueueBucket(draftTimesheets, draftCount),
								submitted: buildQueueBucket(submittedTimesheets, submittedCount),
								correction: buildQueueBucket(
									correctionTimesheets,
									correctionCount,
								),
								approved: buildQueueBucket(approvedTimesheets, approvedCount),
							},
						},
						200,
					),
				);
				return;
			}

			const findManyQuery = buildFindManyQuery(
				whereClause,
				skip,
				limit,
				order,
				sort,
				fields,
			);

			// Only include default relations if no specific fields are requested
			// If fields are specified, buildFindManyQuery handles the selection (via select)
			if (!fields) {
				findManyQuery.include = {
					employee: {
						include: {
							person: true,
							position: true,
							department: true,
						},
					},
					attendances: true,
					timesheetlines: {
						where: { isDeleted: false, isEffective: true },
						orderBy: { date: "asc" },
					},
				};
			}

			const [timesheets, total] = await Promise.all([
				document ? prisma.timesheet.findMany(findManyQuery) : [],
				count ? prisma.timesheet.count({ where: whereClause }) : 0,
			]);

			timesheetLogger.info(`Retrieved ${timesheets.length} timesheets`);
			if (!fields) {
				for (const timesheet of timesheets as any[]) {
					attachTimesheetBreakdownFromLines(timesheet);
				}
			}
			const processedData =
				groupBy && document ? groupDataByField(timesheets, groupBy as string) : timesheets;

			const responseData: Record<string, any> = {
				...(document && { timesheets: processedData }),
				...(count && { count: total }),
				...(pagination && { pagination: buildPagination(total, page, limit) }),
				...(groupBy && { groupedBy: groupBy }),
			};

			res.status(200).json(
				buildSuccessResponse("Timesheets retrieved successfully", responseData, 200),
			);
		} catch (error) {
			timesheetLogger.error(`Failed to fetch timesheets: ${error}`);
			res.status(500).json(buildErrorResponse("Failed to fetch timesheets", 500));
		}
	};

	const getById = async (req: Request, res: Response, _next: NextFunction) => {
		const { id } = req.params;
		const { fields } = req.query;

		try {
			if (!id) {
				timesheetLogger.error("Timesheet ID or code is required");
				const errorResponse = buildErrorResponse("Timesheet ID or code is required", 400);
				res.status(400).json(errorResponse);
				return;
			}

			if (fields && typeof fields !== "string") {
				timesheetLogger.error(`Invalid fields parameter: ${fields}`);
				const errorResponse = buildErrorResponse("Fields must be a string", 400);
				res.status(400).json(errorResponse);
				return;
			}

			const searchField = "identifier";

			timesheetLogger.info(`Getting timesheet by ${searchField}: ${id}`);

			const cacheKey = `cache:timesheet:byIdentifier:${id}:${fields || "full"}`;
			let timesheet = null;

			try {
				if (redisClient.isClientConnected()) {
					timesheet = await redisClient.getJSON(cacheKey);
					if (timesheet) {
						timesheetLogger.info(`Cache hit for timesheet ${id}`);
					}
				}
			} catch (cacheError) {
				timesheetLogger.warn(`Cache error for timesheet ${id}:`, cacheError);
			}

			if (!timesheet) {
				const findQuery: any = {
					where: {
						isDeleted: false,
						OR: [{ id }, { code: id }],
					},
				};

				if (fields) {
					const selectFields = getNestedFields(fields);
					applySelectiveTimesheetlineReadContract(selectFields);
					findQuery.select = selectFields;
				} else {
					findQuery.include = {
						payrollPeriod: true,
						employee: {
							include: {
								person: true,
								position: true,
								department: true,
							},
						},
						attendances: true,
						timesheetlines: {
							where: { isDeleted: false, isEffective: true },
							orderBy: TIMESHEETLINE_EFFECTIVE_READ_ORDER,
						},
					};
				}

				timesheet = await prisma.timesheet.findFirst(findQuery);

				if (timesheet && redisClient.isClientConnected()) {
					try {
						await redisClient.setJSON(cacheKey, timesheet, 90);
					} catch (cacheError) {
						timesheetLogger.warn(`Failed to cache timesheet ${id}:`, cacheError);
					}
				}
			}

			if (!timesheet) {
				timesheetLogger.error(`Timesheet not found: ${id}`);
				const errorResponse = buildErrorResponse("Timesheet not found", 404);
				res.status(404).json(errorResponse);
				return;
			}

			timesheet = await refreshEditableCurrentTimesheetSnapshotForRead({
				timesheet,
				refetch: () =>
					prisma.timesheet.findFirst({
						where: {
							isDeleted: false,
							OR: [{ id }, { code: id }],
						},
						...(fields
							? (() => {
									const refetchSelectFields = getNestedFields(fields as string);
									applySelectiveTimesheetlineReadContract(refetchSelectFields);
									return { select: refetchSelectFields };
								})()
							: {
									include: {
										payrollPeriod: true,
										employee: {
											include: {
												person: true,
												position: true,
												department: true,
											},
										},
										attendances: true,
										timesheetlines: {
											where: { isDeleted: false, isEffective: true },
											orderBy: TIMESHEETLINE_EFFECTIVE_READ_ORDER,
										},
									},
								}),
					}),
			});

			attachTimesheetBreakdownFromLines(timesheet as any);
			timesheet = await enrichCurrentPeriodTimesheetWithLiveDays(timesheet as any);

			try {
				if (
					Array.isArray((timesheet as any).breakdown) &&
					(timesheet as any).breakdown.length
				) {
					(timesheet as any).breakdown = await enrichBreakdownWithLeaveHolidayContext(
						prisma,
						{
							organizationId: String((timesheet as any).organizationId || ""),
							employeeId: String((timesheet as any).employeeId || ""),
							breakdown: (timesheet as any).breakdown,
						},
					);
					const organizationId = String((timesheet as any).organizationId || "");
					const employeeId = String((timesheet as any).employeeId || "");
					if (organizationId && employeeId) {
						(timesheet as any).breakdown = await injectNightShiftIntoBreakdown({
							organizationId,
							employeeId,
							breakdown: (timesheet as any).breakdown,
						});
					}
					await enrichTimesheetBreakdownWithRevisionSummary(timesheet);
				}
			} catch (enrichmentError) {
				timesheetLogger.warn(
					`Failed to enrich timesheet day context for ${id}:`,
					enrichmentError,
				);
			}

			const organizationId = String((timesheet as any).organizationId || "");
			const employeeId = String((timesheet as any).employeeId || "");
			if (organizationId && employeeId) {
				(timesheet as any).approvedEditedDaysSummary = await getApprovedEditedDaysSummary({
					organizationId,
					employeeId,
					timesheetId: String((timesheet as any).id || ""),
					submittedAt: (timesheet as any).submittedAt || null,
				});
			}

			timesheetLogger.info(`Timesheet retrieved by ${searchField}: ${id}`);
			const successResponse = buildSuccessResponse(
				"Timesheet retrieved successfully",
				timesheet,
				200,
			);
			res.status(200).json(successResponse);
		} catch (error) {
			timesheetLogger.error(`Failed to get timesheet: ${error}`);
			const errorResponse = buildErrorResponse("Failed to get timesheet", 500);
			res.status(500).json(errorResponse);
		}
	};

	const update = async (req: Request, res: Response, _next: NextFunction) => {
		const { id } = req.params;
		const authReq = req as AuthRequest;

		try {
			if (!id) {
				timesheetLogger.error("Timesheet ID or code is required");
				const errorResponse = buildErrorResponse("Timesheet ID or code is required", 400);
				res.status(400).json(errorResponse);
				return;
			}

			const validationResult = UpdateTimesheetSchema.safeParse(req.body);

			if (!validationResult.success) {
				const formattedErrors = formatZodErrors(validationResult.error.format());
				timesheetLogger.error(`Validation failed: ${JSON.stringify(formattedErrors)}`);
				const errorResponse = buildErrorResponse("Validation failed", 400, formattedErrors);
				res.status(400).json(errorResponse);
				return;
			}

			if (Object.keys(req.body).length === 0) {
				timesheetLogger.error("No fields to update");
				const errorResponse = buildErrorResponse("No fields to update", 400);
				res.status(400).json(errorResponse);
				return;
			}

			const validatedData = validationResult.data;
			const editedDayKeysInput = Array.isArray(validatedData.editedDayKeys)
				? validatedData.editedDayKeys
				: undefined;
			const updatePayload: any = { ...validatedData };
			delete updatePayload.editedDayKeys;
			let normalizedBreakdownForLineSync: any[] | null = null;
			let lineVersionMode: "update" | "version" = "update";
			let versionDayKeys: Set<string> | undefined;

			const searchField = "identifier";

			timesheetLogger.info(`Updating timesheet by ${searchField}: ${id}`);

			const existingTimesheet = await prisma.timesheet.findFirst({
				where: {
					isDeleted: false,
					OR: [{ id }, { code: id }],
				},
			});

			if (!existingTimesheet) {
				timesheetLogger.error(`Timesheet not found: ${id}`);
				const errorResponse = buildErrorResponse("Timesheet not found", 404);
				res.status(404).json(errorResponse);
				return;
			}

			const paidPayrollLock = await findTimesheetLock({
				organizationId: existingTimesheet.organizationId,
				timesheetId: existingTimesheet.id,
			});
			if (paidPayrollLock) {
				res.status(409).json(buildTimesheetLockResponse(paidPayrollLock));
				return;
			}

			// Enforce employee edit policy for own timesheet updates.
			const isEmployeeOwner =
				authReq.metadata?.employee?.id &&
				authReq.metadata.employee.id === existingTimesheet.employeeId;
			const isBreakdownUpdate = validatedData.breakdown !== undefined;
			const isBreakdownOnlyUpdate =
				Object.keys(validatedData).every(
					(key) => key === "breakdown" || key === "editedDayKeys",
				) && validatedData.breakdown !== undefined;

			if (isEmployeeOwner && authReq.organizationId) {
				await assertEditingPolicyEnabled(authReq.organizationId);

				if (isBreakdownUpdate) {
					if (
						shouldRequireEditPermission(
							existingTimesheet.status,
							existingTimesheet.editPermissionStatus,
						)
					) {
						const errorResponse = buildErrorResponse("EDIT_PERMISSION_REQUIRED", 403, [
							{
								field: "editPermissionStatus",
								message: `EDIT_PERMISSION_REQUIRED (${existingTimesheet.editPermissionStatus ?? "NONE"})`,
							},
						]);
						res.status(403).json(errorResponse);
						return;
					}
				}
			} else {
				// Non-owners: identity-based authorization (D2 security fix,
				// 2026-09-07). Previously any authenticated user could write a
				// non-APPROVED timesheet by id. Now only HR/admin or the member's
				// responsible line leader may write, and a line leader may only
				// change dayLaborType (D2 + day-labor tagging requirement).
				const actingEmployeeId = authReq.metadata?.employee?.id || null;
				const actingRole = String(authReq.role || "")
					.trim()
					.toLowerCase();
				const isHrOrAdminActor = [
					"hris-admin",
					"admin",
					"super_admin",
					"superadmin",
					"hris-hr-manager",
					"hris-hr-user",
					"hris-timekeeper",
				].includes(actingRole);
				let leaderScope: Awaited<
					ReturnType<typeof import("../../helper/section-leader-scope.helper").canActAsLineLeaderForEmployee>
				> | null = null;
				if (
					!isHrOrAdminActor &&
					actingEmployeeId &&
					authReq.organizationId
				) {
					leaderScope = await canActAsLineLeaderForEmployee(prisma, {
						organizationId: authReq.organizationId,
						leaderEmployeeId: actingEmployeeId,
						targetEmployeeId: existingTimesheet.employeeId,
					});
				}
				if (!isHrOrAdminActor && !(leaderScope && leaderScope.ok)) {
					timesheetLogger.warn(
						`Timesheet write denied: actor=${actingEmployeeId || "unknown"} role=${actingRole || "unknown"} timesheet=${existingTimesheet.id}`,
					);
					const errorResponse = buildErrorResponse(
						"You are not allowed to update this timesheet.",
						403,
					);
					res.status(403).json(errorResponse);
					return;
				}

				// Shared status guardrails (unchanged for authorized actors).
				if (existingTimesheet.status === "APPROVED") {
					timesheetLogger.warn(`Cannot update timesheet in APPROVED status`);
					const errorResponse = buildErrorResponse(
						`Cannot update timesheet in APPROVED status`,
						400,
					);
					res.status(400).json(errorResponse);
					return;
				}

				if (existingTimesheet.status === "SUBMITTED" && !isBreakdownOnlyUpdate) {
					timesheetLogger.warn(
						`Cannot update timesheet in SUBMITTED status. Only breakdown updates are allowed for approval workflow.`,
					);
					const errorResponse = buildErrorResponse(
						`Cannot update timesheet in SUBMITTED status. Only breakdown updates are allowed for approval workflow.`,
						400,
					);
					res.status(400).json(errorResponse);
					return;
				}

				// Leader writes are day-labor-only.
				if (
					!isHrOrAdminActor &&
					leaderScope &&
					leaderScope.ok &&
					isBreakdownUpdate
				) {
					const guard = await isDayLaborOnlyBreakdownChange(prisma, {
						organizationId: existingTimesheet.organizationId,
						timesheetId: existingTimesheet.id,
						breakdown: (validatedData.breakdown as any[]) || [],
					});
					if (!guard.ok) {
						timesheetLogger.warn(
							`Leader day-labor guard rejected: day=${guard.dayKey} field=${guard.field} reason=${guard.reason}`,
						);
						const errorResponse = buildErrorResponse(
							"Line leaders can only tag day labor (Direct/Indirect). Timesheet changes must go through an adjustment request.",
							403,
						);
						res.status(403).json(errorResponse);
						return;
					}
				}
			}

			if (
				isEmployeeOwner &&
				isBreakdownUpdate &&
				existingTimesheet.editPermissionStatus === "APPROVED"
			) {
				updatePayload.editPermissionStatus = "CONSUMED";
				updatePayload.editPermissionConsumedAt = new Date();
			}

			if (Array.isArray(updatePayload.breakdown)) {
				const normalizedBreakdown = await normalizeBreakdownForPersistence({
					organizationId: existingTimesheet.organizationId,
					employeeId: existingTimesheet.employeeId,
					breakdown: updatePayload.breakdown,
				});
				normalizedBreakdownForLineSync = normalizedBreakdown;
				delete updatePayload.breakdown;

				Object.assign(updatePayload, calculateSummaryFromBreakdown(normalizedBreakdown));

				const isEditAuditEligible =
					isEmployeeOwner &&
					(existingTimesheet.editPermissionStatus === "APPROVED" ||
						existingTimesheet.editPermissionStatus === "CONSUMED" ||
						existingTimesheet.status === "REVISED" ||
						existingTimesheet.status === "DRAFT");
				if (isEditAuditEligible) {
					const existingLines = await (prisma as any).timesheetline.findMany({
						where: {
							organizationId: existingTimesheet.organizationId,
							timesheetId: existingTimesheet.id,
							isDeleted: false,
							isEffective: true,
						},
						orderBy: { date: "asc" },
					});
					const changedDays = buildChangedDaysFromBreakdown(
						buildBreakdownFromTimesheetLines(existingLines),
						normalizedBreakdown,
					);
					versionDayKeys = resolveVersionDayKeys(editedDayKeysInput, changedDays, {
						manualOnly: isEmployeeOwner,
					});
					if (versionDayKeys?.size) {
						lineVersionMode = "version";
					}
				}
			}

			const updatedTimesheet = await prisma.timesheet.update({
				where: { id: existingTimesheet.id },
				data: updatePayload,
				include: {
					employee: {
						include: {
							person: true,
							position: true,
							department: true,
						},
					},
					attendances: true,
					timesheetlines: {
						where: { isDeleted: false, isEffective: true },
						orderBy: { date: "asc" },
					},
				},
			});

			if (Array.isArray(normalizedBreakdownForLineSync)) {
				await syncTimesheetLinesFromBreakdown(prisma, {
					organizationId: updatedTimesheet.organizationId,
					employeeId: updatedTimesheet.employeeId,
					payrollPeriodId: updatedTimesheet.payrollPeriodId,
					timesheetId: updatedTimesheet.id,
					breakdown: normalizedBreakdownForLineSync,
					versionMode: lineVersionMode,
					versionDayKeys,
					manualEditDayKeys: resolveManualEditDayKeys(
						editedDayKeysInput,
						versionDayKeys,
					),
					ledgerType: lineVersionMode === "version" ? "CORRECTION" : "SNAPSHOT",
					editedBy: authReq.metadata?.employee?.id || authReq.userId || null,
					editReason: updatePayload.notes || updatePayload.editPermissionReason || null,
					attendances: Array.isArray((updatedTimesheet as any).attendances)
						? (updatedTimesheet as any).attendances
						: [],
				});
				(updatedTimesheet as any).timesheetlines = await (prisma as any).timesheetline.findMany({
					where: {
						organizationId: updatedTimesheet.organizationId,
						timesheetId: updatedTimesheet.id,
						isDeleted: false,
						isEffective: true,
					},
					orderBy: { date: "asc" },
				});
			}

			attachTimesheetBreakdownFromLines(updatedTimesheet as any);

			if (action === "APPROVE") {
				const approvedOvertimeResult =
					await applyApprovedOvertimeCompensatoryCredit({
						prisma,
						organizationId: updatedTimesheet.organizationId,
						timesheetId: updatedTimesheet.id,
						approvedByEmployeeId:
							(actingEmployeeId as string | null | undefined) ||
							(authReq.userId as string | null | undefined) ||
							null,
						approvedAt: updateData.approvalDate || new Date(),
					});
				(updatedTimesheet as any).metadata = approvedOvertimeResult.metadata;
			}

			logActivity(req, {
				userId: (req as any).user?.id || "unknown",
				action:
					config.ACTIVITY_LOG.TIMESHEET?.ACTIONS?.UPDATE_TIMESHEET || "UPDATE_TIMESHEET",
				description: `Timesheet updated: ${updatedTimesheet.id}`,
				page: {
					url: req.originalUrl,
					title:
						config.ACTIVITY_LOG.TIMESHEET?.PAGES?.TIMESHEET_UPDATE ||
						"Timesheet Update",
				},
			});

			logAudit(req, {
				userId: (req as any).user?.id || "unknown",
				action: config.AUDIT_LOG.ACTIONS.UPDATE,
				resource: "TIMESHEET",
				severity: config.AUDIT_LOG.SEVERITY.LOW,
				entityType: "TIMESHEET",
				entityId: updatedTimesheet.id,
				changesBefore: existingTimesheet,
				changesAfter: updatedTimesheet,
				description: `Timesheet updated: ${updatedTimesheet.id}`,
			});

			try {
				await invalidateTimesheetCaches(updatedTimesheet.id, updatedTimesheet.code);
				timesheetLogger.info(
					`Cache invalidated after timesheet update (searched by ${searchField}: ${id})`,
				);
			} catch (cacheError) {
				timesheetLogger.warn(
					"Failed to invalidate cache after timesheet update:",
					cacheError,
				);
			}

			timesheetLogger.info(`Timesheet updated: ${updatedTimesheet.id}`);
			const successResponse = buildSuccessResponse(
				"Timesheet updated successfully",
				{ timesheet: updatedTimesheet },
				200,
			);
			res.status(200).json(successResponse);
		} catch (error: any) {
			const message = String(error?.message || "UNKNOWN_ERROR");
			if (message === "POLICY_DISABLED") {
				const errorResponse = buildErrorResponse("POLICY_DISABLED", 403, [
					{
						field: "enableEditBeforeSubmission",
						message: "POLICY_DISABLED",
					},
				]);
				res.status(403).json(errorResponse);
				return;
			}
			timesheetLogger.error(`Failed to update timesheet: ${error}`);
			const errorResponse = buildErrorResponse("Failed to update timesheet", 500);
			res.status(500).json(errorResponse);
		}
	};

	const normalizeBreakdownPreview = async (req: Request, res: Response, _next: NextFunction) => {
		const authReq = req as AuthRequest;

		try {
			const validation = NormalizeTimesheetBreakdownPreviewSchema.safeParse(req.body);
			if (!validation.success) {
				const formattedErrors = formatZodErrors(validation.error.format());
				res.status(400).json(buildErrorResponse("Validation failed", 400, formattedErrors));
				return;
			}

			const { timesheetId, breakdown } = validation.data;
			const timesheet = await prisma.timesheet.findFirst({
				where: {
					id: timesheetId,
					organizationId: authReq.organizationId!,
					isDeleted: false,
				},
				select: {
					id: true,
					organizationId: true,
					employeeId: true,
				},
			});

			if (!timesheet) {
				res.status(404).json(buildErrorResponse("Timesheet not found", 404));
				return;
			}

			const isOwner = authReq.metadata?.employee?.id === timesheet.employeeId;
			const isManager = isManagerRole(authReq.role);
			if (!isOwner && !isManager) {
				res.status(403).json(buildErrorResponse("Forbidden", 403));
				return;
			}

			const normalizedBreakdown = await normalizeBreakdownForPersistence({
				organizationId: timesheet.organizationId,
				employeeId: timesheet.employeeId,
				breakdown,
			});

			const summary = calculateSummaryFromBreakdown(normalizedBreakdown);
			res.status(200).json(
				buildSuccessResponse(
					"Timesheet breakdown normalized successfully",
					{
						breakdown: normalizedBreakdown,
						summary,
					},
					200,
				),
			);
		} catch (error) {
			timesheetLogger.error(`Failed to normalize timesheet breakdown preview: ${error}`);
			res.status(500).json(buildErrorResponse("Failed to normalize breakdown preview", 500));
		}
	};

	const remove = async (req: Request, res: Response, _next: NextFunction) => {
		const { id } = req.params;

		try {
			if (!id) {
				timesheetLogger.error("Timesheet ID is required");
				const errorResponse = buildErrorResponse("Timesheet ID is required", 400);
				res.status(400).json(errorResponse);
				return;
			}

			timesheetLogger.info(`Deleting timesheet: ${id}`);

			const existingTimesheet = await prisma.timesheet.findFirst({
				where: { id, isDeleted: false },
			});

			if (!existingTimesheet) {
				timesheetLogger.error(`Timesheet not found: ${id}`);
				const errorResponse = buildErrorResponse("Timesheet not found", 404);
				res.status(404).json(errorResponse);
				return;
			}

			// Soft delete
			await prisma.timesheet.update({
				where: { id },
				data: { isDeleted: true },
			});

			try {
				await invalidateTimesheetCaches(id, existingTimesheet.code);
				timesheetLogger.info(`Cache invalidated after timesheet ${id} deletion`);
			} catch (cacheError) {
				timesheetLogger.warn("Failed to invalidate cache after deletion:", cacheError);
			}

			logActivity(req, {
				userId: (req as any).user?.id || "unknown",
				action:
					config.ACTIVITY_LOG.TIMESHEET?.ACTIONS?.DELETE_TIMESHEET || "DELETE_TIMESHEET",
				description: `Timesheet deleted: ${id}`,
				page: {
					url: req.originalUrl,
					title:
						config.ACTIVITY_LOG.TIMESHEET?.PAGES?.TIMESHEET_DELETION ||
						"Timesheet Deletion",
				},
			});

			logAudit(req, {
				userId: (req as any).user?.id || "unknown",
				action: config.AUDIT_LOG.ACTIONS.DELETE,
				resource: "TIMESHEET",
				severity: config.AUDIT_LOG.SEVERITY.MEDIUM,
				entityType: "TIMESHEET",
				entityId: id,
				changesBefore: existingTimesheet,
				changesAfter: null,
				description: `Timesheet deleted: ${id}`,
			});

			timesheetLogger.info(`Timesheet deleted successfully: ${id}`);
			const successResponse = buildSuccessResponse(
				"Timesheet deleted successfully",
				null,
				200,
			);
			res.status(200).json(successResponse);
		} catch (error) {
			timesheetLogger.error(`Failed to delete timesheet: ${error}`);
			const errorResponse = buildErrorResponse("Failed to delete timesheet", 500);
			res.status(500).json(errorResponse);
		}
	};

	type SubmitBreakdownPersistenceResult = {
		normalizedBreakdownForLineSync: any[] | null;
		lineVersionMode: "update" | "version";
		versionDayKeys?: Set<string>;
		manualEditDayKeys?: Set<string>;
		summaryPatch: Record<string, unknown>;
		skipObligationMaterialize: boolean;
		errorResponse: ReturnType<typeof buildErrorResponse> | null;
	};

	const prepareSubmitBreakdownPersistence = async (params: {
		existingTimesheet: {
			organizationId: string;
			employeeId: string;
			status: string;
			editPermissionStatus?: string | null;
			timesheetlines?: any[];
			employee?: { schedule?: unknown } | null;
		};
		breakdown: unknown;
		editedDayKeys?: string[];
		isCorrectionResubmit: boolean;
		isEmployeeOwner: boolean;
		employeeSchedule?: unknown;
	}): Promise<SubmitBreakdownPersistenceResult> => {
		const emptyResult: SubmitBreakdownPersistenceResult = {
			normalizedBreakdownForLineSync: null,
			lineVersionMode: "update",
			summaryPatch: {},
			skipObligationMaterialize: false,
			errorResponse: null,
		};

		const hasBreakdown = Array.isArray(params.breakdown) && params.breakdown.length > 0;
		const normalizedStatus = String(params.existingTimesheet.status || "").toUpperCase();
		const isEditAuditEligible =
			params.isEmployeeOwner &&
			(params.existingTimesheet.editPermissionStatus === "APPROVED" ||
				params.existingTimesheet.editPermissionStatus === "CONSUMED" ||
				normalizedStatus === "REVISED" ||
				normalizedStatus === "DRAFT");

		if (params.isCorrectionResubmit) {
			if (hasBreakdown) {
				const normalizedBreakdown = await normalizeBreakdownForPersistence({
					organizationId: params.existingTimesheet.organizationId,
					employeeId: params.existingTimesheet.employeeId,
					breakdown: params.breakdown as any[],
					employeeSchedule:
						params.employeeSchedule ||
						(params.existingTimesheet.employee as any)?.schedule ||
						null,
				});
				const changedDays = buildChangedDaysFromBreakdown(
					buildBreakdownFromTimesheetLines(params.existingTimesheet.timesheetlines),
					normalizedBreakdown,
				);
				const versionDayKeys = resolveVersionDayKeys(params.editedDayKeys, changedDays, {
					manualOnly: params.isEmployeeOwner,
				});
				if (!versionDayKeys?.size) {
					return {
						...emptyResult,
						errorResponse: buildErrorResponse("NO_CHANGES_TO_RESUBMIT", 409, [
							{ field: "breakdown", message: "NO_CHANGES_TO_RESUBMIT" },
						]),
					};
				}
				return {
					normalizedBreakdownForLineSync: normalizedBreakdown,
					lineVersionMode: "version",
					versionDayKeys,
					manualEditDayKeys: resolveManualEditDayKeys(
						params.editedDayKeys,
						versionDayKeys,
					),
					summaryPatch: calculateSummaryFromBreakdown(normalizedBreakdown),
					skipObligationMaterialize: true,
					errorResponse: null,
				};
			}

			if (params.existingTimesheet.editPermissionStatus === "CONSUMED") {
				return {
					...emptyResult,
					skipObligationMaterialize: true,
				};
			}

			return {
				...emptyResult,
				errorResponse: buildErrorResponse("NO_CHANGES_TO_RESUBMIT", 409, [
					{ field: "breakdown", message: "NO_CHANGES_TO_RESUBMIT" },
				]),
			};
		}

		if (hasBreakdown) {
			const normalizedBreakdown = await normalizeBreakdownForPersistence({
				organizationId: params.existingTimesheet.organizationId,
				employeeId: params.existingTimesheet.employeeId,
				breakdown: params.breakdown as any[],
				employeeSchedule:
					params.employeeSchedule ||
					(params.existingTimesheet.employee as any)?.schedule ||
					null,
			});

			// Pre-update PATCH already synced lines and consumed edit permission.
			// Skip duplicate line sync on submit for DRAFT/REVISED first submissions.
			if (params.existingTimesheet.editPermissionStatus === "CONSUMED") {
				return {
					normalizedBreakdownForLineSync: null,
					lineVersionMode: "update",
					versionDayKeys: undefined,
					summaryPatch: calculateSummaryFromBreakdown(normalizedBreakdown),
					skipObligationMaterialize: true,
					errorResponse: null,
				};
			}

			let lineVersionMode: "update" | "version" = "update";
			let versionDayKeys: Set<string> | undefined;
			let manualEditDayKeys: Set<string> | undefined;
			if (isEditAuditEligible) {
				const changedDays = buildChangedDaysFromBreakdown(
					buildBreakdownFromTimesheetLines(params.existingTimesheet.timesheetlines),
					normalizedBreakdown,
				);
				versionDayKeys = resolveVersionDayKeys(params.editedDayKeys, changedDays, {
					manualOnly: params.isEmployeeOwner,
				});
				if (versionDayKeys?.size) {
					lineVersionMode = "version";
					manualEditDayKeys = resolveManualEditDayKeys(
						params.editedDayKeys,
						versionDayKeys,
					);
				}
			}
			return {
				normalizedBreakdownForLineSync: normalizedBreakdown,
				lineVersionMode,
				versionDayKeys,
				manualEditDayKeys,
				summaryPatch: calculateSummaryFromBreakdown(normalizedBreakdown),
				skipObligationMaterialize: true,
				errorResponse: null,
			};
		}

		return emptyResult;
	};

	/**
	 * Helper function to generate a timesheet for an employee
	 * Can be called by various endpoints when timesheet needs to be created
	 */

	/**
	 * Handle timesheet actions (approve, reject, revise)
	 * POST /api/timesheet/:id/action
	 * Manager/Admin actions only - use /submit endpoint for employee submission
	 */
	const action = async (req: Request, res: Response, _next: NextFunction) => {
		const { id } = req.params;
		const authReq = req as AuthRequest;

		try {
			if (!id) {
				const errorResponse = buildErrorResponse("Timesheet ID is required", 400);
				res.status(400).json(errorResponse);
				return;
			}

			const validation = TimesheetActionSchema.safeParse(req.body);
			if (!validation.success) {
				const formattedErrors = formatZodErrors(validation.error.format());
				timesheetLogger.error(`Validation failed: ${JSON.stringify(formattedErrors)}`);
				const errorResponse = buildErrorResponse("Validation failed", 400, formattedErrors);
				res.status(400).json(errorResponse);
				return;
			}

			const { action, rejectionReason, notes, breakdown, editedDayKeys } = validation.data;
			const actingEmployeeId = await getActingEmployeeId(authReq);

			// Get existing timesheet
			const existingTimesheet = await prisma.timesheet.findFirst({
				where: { id, isDeleted: false },
				include: {
					payrollPeriod: {
						select: {
							id: true,
							code: true,
							name: true,
							startDate: true,
							endDate: true,
						},
					},
					timesheetlines: {
						where: { isDeleted: false, isEffective: true },
						orderBy: { date: "asc" },
					},
				},
			});

			if (!existingTimesheet) {
				const errorResponse = buildErrorResponse("Timesheet not found", 404);
				res.status(404).json(errorResponse);
				return;
			}

			const paidPayrollLock = await findTimesheetLock({
				organizationId: existingTimesheet.organizationId,
				timesheetId: existingTimesheet.id,
			});

			// Prepare update data
			const updateData: any = {};
			let submitAutoApproved = false;
			let normalizedBreakdownForLineSync: any[] | null = null;
			let lineVersionMode: "update" | "version" = "update";
			let versionDayKeys: Set<string> | undefined;
			let manualEditDayKeys: Set<string> | undefined;
			const existingMetadata =
				existingTimesheet.metadata &&
				typeof existingTimesheet.metadata === "object" &&
				!Array.isArray(existingTimesheet.metadata)
					? { ...(existingTimesheet.metadata as Record<string, unknown>) }
					: {};
			const timesheetConfig = await getOrCreateTimesheetConfig(
				existingTimesheet.organizationId,
			);
			const submissionOutcome = resolveTimesheetSubmissionOutcome(
				timesheetConfig.enableAutoApprove,
			);

			switch (action) {
				case "SUBMIT":
					if (paidPayrollLock) {
						res.status(409).json(buildTimesheetLockResponse(paidPayrollLock));
						return;
					}
					if (!actingEmployeeId || actingEmployeeId !== existingTimesheet.employeeId) {
						const errorResponse = buildErrorResponse(
							"Only the timesheet owner can submit this timesheet",
							403,
						);
						res.status(403).json(errorResponse);
						return;
					}
					const submitEligibility = evaluateTimesheetSubmitEligibility(
						existingTimesheet.status,
						existingTimesheet.editPermissionStatus,
					);
					if (!submitEligibility.canSubmit) {
						if (submitEligibility.requiresEditPermission) {
							const errorResponse = buildErrorResponse(
								"EDIT_PERMISSION_REQUIRED_FOR_RESUBMISSION",
								403,
								[
									{
										field: "editPermissionStatus",
										message: `EDIT_PERMISSION_REQUIRED_FOR_RESUBMISSION (${existingTimesheet.editPermissionStatus ?? "NONE"})`,
									},
								],
							);
							res.status(403).json(errorResponse);
							return;
						}

						const errorResponse = buildErrorResponse(
							`Cannot submit timesheet in ${existingTimesheet.status} status`,
							400,
						);
						res.status(400).json(errorResponse);
						return;
					}

					{
						const submitBreakdownPersistence = await prepareSubmitBreakdownPersistence({
							existingTimesheet,
							breakdown,
							editedDayKeys,
							isCorrectionResubmit: submitEligibility.isCorrectionResubmit,
							isEmployeeOwner: true,
						});
						if (submitBreakdownPersistence.errorResponse) {
							res.status(409).json(submitBreakdownPersistence.errorResponse);
							return;
						}
						normalizedBreakdownForLineSync =
							submitBreakdownPersistence.normalizedBreakdownForLineSync;
						lineVersionMode = submitBreakdownPersistence.lineVersionMode;
						versionDayKeys = submitBreakdownPersistence.versionDayKeys;
						manualEditDayKeys = submitBreakdownPersistence.manualEditDayKeys;
						Object.assign(updateData, submitBreakdownPersistence.summaryPatch);
						(updateData as any).__skipObligationMaterialize =
							submitBreakdownPersistence.skipObligationMaterialize;
					}

					updateData.status = submissionOutcome.status;
					updateData.submittedAt = new Date();
					updateData.submittedBy = actingEmployeeId;
					updateData.rejectionReason = null;
					updateData.editPermissionStatus = "NONE";
					updateData.editPermissionConsumedAt = null;
					updateData.editPermissionExpiresAt = null;
					if (submissionOutcome.autoApproved) {
						// Org policy auto-approval: submission lands APPROVED with no
						// review step; snapshot mirrors the manual APPROVE action and
						// stays marked autoApproved for audit.
						updateData.approvedBy = actingEmployeeId || authReq.userId || null;
						updateData.approvalDate = updateData.submittedAt;
						updateData.metadata = {
							...(updateData.metadata || {}),
							...buildAutoApprovedSubmissionMetadata(
								existingMetadata,
								updateData.submittedAt,
								updateData.approvedBy,
							),
						};
					} else {
						updateData.metadata = {
							...existingMetadata,
							...(updateData.metadata || {}),
							snapshotState: "SUBMITTED",
							snapshotSubmittedAt: updateData.submittedAt.toISOString(),
							snapshotSubmittedBy: actingEmployeeId,
							snapshotType: "TIMESHEET_PERIOD",
						};
					}
					if (notes) updateData.notes = notes;
					if (
						!Array.isArray(normalizedBreakdownForLineSync) &&
						!(updateData as any).__skipObligationMaterialize
					) {
						// Normal first submission snapshots from AttendanceObligation.
						await materializeTimesheetLinesFromObligations(prisma, {
							organizationId: existingTimesheet.organizationId,
							employeeId: existingTimesheet.employeeId,
							payrollPeriodId: existingTimesheet.payrollPeriodId,
							timesheetId: existingTimesheet.id,
							fromDate: existingTimesheet.payrollPeriod.startDate,
							toDate: existingTimesheet.payrollPeriod.endDate,
						});
					}
					delete (updateData as any).__skipObligationMaterialize;
					if (resolveTimesheetAutoApprovalEnabled(timesheetConfig.enableAutoApprove)) {
						Object.assign(
							updateData,
							buildTimesheetAutoApprovalPatch(
								{ ...existingMetadata, ...((updateData.metadata as any) || {}) },
								updateData.submittedAt,
							),
						);
						updateData.submittedAt = updateData.submittedAt || new Date();
						updateData.submittedBy = updateData.submittedBy || actingEmployeeId;
						submitAutoApproved = true;
					}
					break;

				case "APPROVE":
					if (existingTimesheet.status !== "SUBMITTED") {
						const errorResponse = buildErrorResponse(
							`Cannot approve timesheet in ${existingTimesheet.status} status`,
							400,
						);
						res.status(400).json(errorResponse);
						return;
					}
					updateData.status = "APPROVED";
					updateData.approvedBy = actingEmployeeId || authReq.userId;
					updateData.approvalDate = new Date();
					updateData.metadata = {
						...existingMetadata,
						snapshotState: "APPROVED",
						snapshotLockedAt: updateData.approvalDate.toISOString(),
						snapshotLockedBy: updateData.approvedBy || null,
						snapshotType: "TIMESHEET_PERIOD",
					};
					if (notes) updateData.notes = notes;
					break;

				case "REJECT":
					if (existingTimesheet.status !== "SUBMITTED") {
						const errorResponse = buildErrorResponse(
							`Cannot reject timesheet in ${existingTimesheet.status} status`,
							400,
						);
						res.status(400).json(errorResponse);
						return;
					}
					updateData.status =
						timesheetConfig.rejectBehavior === "REJECT" ? "REJECTED" : "REVISED";
					updateData.rejectionReason = rejectionReason;
					if (notes) updateData.notes = notes;
					break;

				case "REVISE":
					if (existingTimesheet.status !== "REJECTED") {
						const errorResponse = buildErrorResponse(
							`Cannot revise timesheet in ${existingTimesheet.status} status`,
							400,
						);
						res.status(400).json(errorResponse);
						return;
					}
					updateData.status = "REVISED";
					updateData.rejectionReason = null;
					if (notes) updateData.notes = notes;
					break;

				default:
					const errorResponse = buildErrorResponse("Invalid action", 400);
					res.status(400).json(errorResponse);
					return;
			}

			// Update timesheet
			const updatedTimesheet = await prisma.timesheet.update({
				where: { id },
				data: updateData,
				include: {
					employee: {
						include: {
							person: true,
							position: true,
							department: true,
						},
					},
					attendances: true,
					timesheetlines: {
						where: { isDeleted: false, isEffective: true },
						orderBy: { date: "asc" },
					},
				},
			});

			if (Array.isArray(normalizedBreakdownForLineSync)) {
				await syncTimesheetLinesFromBreakdown(prisma, {
					organizationId: updatedTimesheet.organizationId,
					employeeId: updatedTimesheet.employeeId,
					payrollPeriodId: updatedTimesheet.payrollPeriodId,
					timesheetId: updatedTimesheet.id,
					breakdown: normalizedBreakdownForLineSync,
					versionMode: lineVersionMode,
					versionDayKeys,
					manualEditDayKeys,
					ledgerType: lineVersionMode === "version" ? "CORRECTION" : "SNAPSHOT",
					editedBy: actingEmployeeId || authReq.userId || null,
					editReason: notes || null,
					attendances: Array.isArray((updatedTimesheet as any).attendances)
						? (updatedTimesheet as any).attendances
						: [],
				});
				(updatedTimesheet as any).timesheetlines = await (prisma as any).timesheetline.findMany({
					where: {
						organizationId: updatedTimesheet.organizationId,
						timesheetId: updatedTimesheet.id,
						isDeleted: false,
						isEffective: true,
					},
					orderBy: { date: "asc" },
				});
			}
			attachTimesheetBreakdownFromLines(updatedTimesheet as any);

			if (action === "SUBMIT" && !submitAutoApproved) {
				await createOrReuseTimesheetSubmissionRequest({
					authReq,
					timesheet: {
						id: updatedTimesheet.id,
						code: updatedTimesheet.code,
						employeeId: updatedTimesheet.employeeId,
						payrollPeriod: { code: existingTimesheet.payrollPeriod?.code || undefined },
					},
					reason: notes,
				});
			}

			if (action === "SUBMIT" && submitAutoApproved) {
				try {
					await publishTimesheetDecisionFallbackNotification(prisma, (authReq as any).io, {
						timesheetId: existingTimesheet.id,
						status: "APPROVED",
						sourceEmployeeId: actingEmployeeId || null,
						comment: "Auto-approved by timesheet approval settings",
					});
				} catch (notificationError) {
					timesheetLogger.warn(
						`Failed to publish auto-approval notification for ${existingTimesheet.id}: ${notificationError}`,
					);
				}
			}

			if (action === "APPROVE" || action === "REJECT") {
				const linkedRequest = await getLatestTimesheetSubmissionRequest({
					organizationId: existingTimesheet.organizationId,
					timesheetId: existingTimesheet.id,
					requesterId: existingTimesheet.employeeId,
				});

				if (linkedRequest?.id && actingEmployeeId) {
					await applySubmissionRequestReview({
						organizationId: existingTimesheet.organizationId,
						requestId: linkedRequest.id,
						decision: action === "APPROVE" ? "approve" : "reject",
						actingEmployeeId,
						reason: rejectionReason || notes,
					});
				} else {
					await publishTimesheetDecisionFallbackNotification(
						prisma,
						(authReq as any).io,
						{
							timesheetId: existingTimesheet.id,
							status: action === "APPROVE" ? "APPROVED" : "REJECTED",
							sourceEmployeeId: actingEmployeeId || authReq.userId,
							comment: rejectionReason || notes || null,
						},
					);
				}
			}

			timesheetLogger.info(`Timesheet ${id} ${action} action completed`);

			logActivity(req, {
				userId: authReq.userId || "unknown",
				action:
					(config.ACTIVITY_LOG.TIMESHEET?.ACTIONS as any)?.[`${action}_TIMESHEET`] ||
					`${action}_TIMESHEET`,
				description: `Timesheet ${action.toLowerCase()}: ${id}`,
				page: {
					url: req.originalUrl,
					title: `Timesheet ${action}`,
				},
			});

			logAudit(req, {
				userId: authReq.userId || "unknown",
				action: config.AUDIT_LOG.ACTIONS.UPDATE,
				resource: "TIMESHEET",
				severity: config.AUDIT_LOG.SEVERITY.MEDIUM,
				entityType: "TIMESHEET",
				entityId: id,
				changesBefore: existingTimesheet,
				changesAfter: updatedTimesheet,
				description: `Timesheet ${action}: ${id}`,
			});

			try {
				await invalidateTimesheetCaches(id, updatedTimesheet.code);
				timesheetLogger.info(`Cache invalidated after timesheet ${id} action`);
			} catch (cacheError) {
				timesheetLogger.warn(
					"Failed to invalidate cache after timesheet action:",
					cacheError,
				);
			}

			const successResponse = buildSuccessResponse(
				`Timesheet ${action.toLowerCase()} successfully`,
				updatedTimesheet,
				200,
			);
			res.status(200).json(successResponse);
		} catch (error) {
			timesheetLogger.error(`Failed to perform action on timesheet: ${error}`);
			const errorResponse = buildErrorResponse("Failed to perform action on timesheet", 500);
			res.status(500).json(errorResponse);
		}
	};

	/**
	 * Get current timesheet for the authenticated employee
	 * GET /api/timesheet/view
	 * Returns the timesheet for the current payroll period (saved or calculated on-the-fly)
	 */
	const view = async (req: Request, res: Response, _next: NextFunction) => {
		const authReq = req as AuthRequest;
		const { fields } = req.query;

		try {
			// Get employee ID from authenticated user
			const employeeId = authReq.metadata?.employee?.id;

			if (!employeeId) {
				const errorResponse = buildErrorResponse(
					"Employee ID not found in authentication token",
					400,
				);
				res.status(400).json(errorResponse);
				return;
			}

			timesheetLogger.info(`Fetching current timesheet for employee: ${employeeId}`);

			// Find current payroll period
			const currentDate = new Date();
			// Normalize to partial day for inclusive date check
			const periodCheckDate = new Date(currentDate);
			periodCheckDate.setUTCHours(0, 0, 0, 0);

			const payrollPeriod = await prisma.payrollPeriod.findFirst({
				where: {
					organizationId: authReq.organizationId!,
					startDate: { lte: currentDate },
					endDate: { gte: periodCheckDate },
					isDeleted: false,
				},
			});

			if (!payrollPeriod) {
				// No current period, return 404
				const errorResponse = buildErrorResponse("No current payroll period found", 404);
				res.status(404).json(errorResponse);
				return;
			}

			// Try to find existing timesheet for this period
			let timesheet = await prisma.timesheet.findFirst({
				where: {
					organizationId: authReq.organizationId!,
					employeeId: employeeId,
					payrollPeriodId: payrollPeriod.id,
					isDeleted: false,
				},
				include: {
					payrollPeriod: true,
					employee: {
						include: {
							person: true,
							position: true,
							department: true,
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
					},
					attendances: true,
					timesheetlines: {
						where: { isDeleted: false, isEffective: true },
						orderBy: { date: "asc" },
					},
				},
			});

			const approvedEditedDaysSummary = await getApprovedEditedDaysSummary({
				organizationId: authReq.organizationId!,
				employeeId,
			});

			// If timesheet exists, return it
			if (timesheet) {
				timesheetLogger.info(
					`Retrieved saved timesheet for current period: ${timesheet.id}`,
				);
				timesheet = await refreshEditableCurrentTimesheetSnapshotForRead({
					timesheet,
					date: currentDate,
					refetch: () =>
						prisma.timesheet.findFirst({
							where: {
								id: timesheet.id,
								isDeleted: false,
							},
							include: {
							payrollPeriod: true,
							employee: {
								include: {
									person: true,
									position: true,
									department: true,
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
							},
							attendances: true,
							timesheetlines: {
								where: { isDeleted: false, isEffective: true },
								orderBy: { date: "asc" },
							},
						},
					}),
				});
				attachTimesheetBreakdownFromLines(timesheet as any);
				timesheet = await enrichCurrentPeriodTimesheetWithLiveDays(
					timesheet as any,
					currentDate,
				);
				const enrichedTimesheet = await enrichTimesheetPermissionDisplay(timesheet);
				try {
					if (
						Array.isArray((enrichedTimesheet as any).breakdown) &&
						(enrichedTimesheet as any).breakdown.length
					) {
						(enrichedTimesheet as any).breakdown =
							await enrichBreakdownWithLeaveHolidayContext(prisma, {
								organizationId: authReq.organizationId!,
								employeeId,
								breakdown: (enrichedTimesheet as any).breakdown,
							});
					}
				} catch (enrichmentError) {
					timesheetLogger.warn(
						`Failed to enrich current timesheet day context for employee ${employeeId}:`,
						enrichmentError,
					);
				}
				const effectiveStartDate = getEffectiveEmploymentStartDate(
					(enrichedTimesheet as any)?.employee,
				);
				const sanitizedBreakdown = sanitizeBreakdownByEffectiveStartDate(
					(enrichedTimesheet as any)?.breakdown,
					effectiveStartDate,
				);
				const periodBoundedBreakdown = sanitizeBreakdownByEndDate(
					sanitizedBreakdown,
					(enrichedTimesheet as any)?.payrollPeriod?.endDate || payrollPeriod.endDate,
				);
				if (
					Array.isArray((enrichedTimesheet as any)?.breakdown) &&
					periodBoundedBreakdown.length !== (enrichedTimesheet as any).breakdown.length
				) {
					(enrichedTimesheet as any).breakdown = periodBoundedBreakdown;
					Object.assign(
						enrichedTimesheet as any,
						calculateSummaryFromBreakdown(periodBoundedBreakdown),
					);
				}
				if (
					Array.isArray((enrichedTimesheet as any)?.breakdown) &&
					(enrichedTimesheet as any).breakdown.length
				) {
					(enrichedTimesheet as any).breakdown = await injectNightShiftIntoBreakdown({
						organizationId: authReq.organizationId!,
						employeeId,
						breakdown: (enrichedTimesheet as any).breakdown,
					});
					await enrichTimesheetBreakdownWithRevisionSummary(enrichedTimesheet);
				}

				const successResponse = buildSuccessResponse(
					"Timesheet retrieved successfully",
					{
						timesheet: enrichedTimesheet,
						approvedEditedDaysSummary,
					},
					200,
				);
				res.status(200).json(successResponse);
				return;
			}

			// No saved timesheet found - calculate on-the-fly from current period
			timesheetLogger.info(
				`No saved timesheet found, calculating on-the-fly for employee ${employeeId}`,
			);

			// Get employee details with schedule
			const employee = await prisma.employee.findUnique({
				where: { id: employeeId },
				include: {
					person: true,
					position: true,
					department: true,
					scheduleOverrides: {
						where: { isDeleted: false },
						include: {
							shiftType: true,
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

			if (!employee) {
				const errorResponse = buildErrorResponse("Employee not found", 404);
				res.status(404).json(errorResponse);
				return;
			}

			// Draft employee previews show the full open payroll-period obligation grid.
			const actualEndDate = payrollPeriod.endDate;
			const effectiveStartDate = getEffectiveEmploymentStartDate(employee);
			const timesheetStartDate = getMaxStartDate(payrollPeriod.startDate, effectiveStartDate);

			const attendances = await getEffectiveAttendanceRecordsForRange(prisma, {
				organizationId: authReq.organizationId!,
				employeeId,
				startDate: timesheetStartDate,
				endDate: actualEndDate,
			});

			// Create attendance map for quick lookup
			const attendanceMap = new Map<string, any>();
			attendances.forEach((att) => {
				if (att.date) {
					const dateKey = getDateKeyInBusinessTimeZone(att.date);
					attendanceMap.set(dateKey, att);
				}
			});

			// Generate full attendance records including absent and rest days
			const fullAttendanceRecords: any[] = [];
			const todayDateKey = resolveBusinessDayKey(new Date());
			const shiftTypeIds = collectShiftTypeIdsFromEmployeeScheduleData(employee);
			const shiftTypes = shiftTypeIds.length
				? await (prisma as any).shiftType.findMany({
						where: {
							organizationId: authReq.organizationId!,
							id: { in: shiftTypeIds },
							isDeleted: false,
						},
					})
				: [];
			const shiftTypeById = new Map<string, any>(
				shiftTypes.map((shiftType: any) => [String(shiftType.id), shiftType]),
			);

			const resolvedShiftByDateKey = new Map<string, any>();

			if (employee) {
				let currDateKey = getDateKeyInBusinessTimeZone(timesheetStartDate);
				const actualEndDateKey = getDateKeyInBusinessTimeZone(actualEndDate);

				while (currDateKey <= actualEndDateKey) {
					const dateKey = currDateKey;
					const currDate = new Date(`${dateKey}T00:00:00.000Z`);
					const resolvedShift = resolveEffectiveShiftFromEmployeeData(
						employee,
						currDate,
						shiftTypeById,
					);

					if (resolvedShift) resolvedShiftByDateKey.set(dateKey, resolvedShift);

					const existingAttendance = attendanceMap.get(dateKey);

					if (resolvedShift) {
						if (resolvedShift.isOff) {
							fullAttendanceRecords.push({
								id: `rest-${dateKey}`,
								date: new Date(currDate),
								timeIn: null,
								timeOut: null,
								status: "REST_DAY",
								notes: null,
								totalMinutesWorked: 0,
								regularMinutes: 0,
								overtimeMinutes: 0,
								undertimeMinutes: 0,
								lateMinutes: 0,
								earlyOutMinutes: 0,
							});
						} else if (existingAttendance) {
							fullAttendanceRecords.push(existingAttendance);
						} else {
							const dayDateKey = getDateKeyInBusinessTimeZone(currDate);
							const virtualStatus =
								dayDateKey > todayDateKey
									? "NOT_CLOCKED_IN"
									: dayDateKey === todayDateKey
										? "NOT_CLOCKED_IN"
										: "ABSENT";
							fullAttendanceRecords.push({
								id: `${virtualStatus === "ABSENT" ? "absent" : "pending"}-${dateKey}`,
								date: new Date(currDate),
								timeIn: null,
								timeOut: null,
								status: virtualStatus,
								notes: null,
								totalMinutesWorked: 0,
								regularMinutes: 0,
								overtimeMinutes: 0,
								undertimeMinutes: 0,
								lateMinutes: 0,
								earlyOutMinutes: 0,
							});
						}
					}

					const nextDate = new Date(`${dateKey}T12:00:00.000Z`);
					nextDate.setUTCDate(nextDate.getUTCDate() + 1);
					currDateKey = getDateKeyInBusinessTimeZone(nextDate);
				}
			} else {
				// No schedule - just use actual attendances
				fullAttendanceRecords.push(...attendances);
			}

			// Calculate summary and breakdown (using full records including absent/rest)
			const summary = generateTimesheetSummary(fullAttendanceRecords);
			const rawBreakdown = generateDailyBreakdown(fullAttendanceRecords);
			const breakdown = rawBreakdown.map((day: any) => {
				const dk =
					day.date instanceof Date
						? getDateKeyInBusinessTimeZone(day.date)
						: String(day.date || "").split("T")[0];
				const metadata =
					day.metadata && typeof day.metadata === "object" && !Array.isArray(day.metadata)
						? day.metadata
						: {};
				const shift = resolvedShiftByDateKey.get(dk);
				const dayWithBusinessDate = {
					...day,
					businessDate: dk,
					metadata: {
						...metadata,
						businessDate: dk,
					},
				};
				if (!shift?.isOvernight) return dayWithBusinessDate;
				const ns = computeNightShiftForDay({
					isOvernight: shift.isOvernight,
					scheduleStartTime: shift.startTime,
					scheduleEndTime: shift.endTime,
					hoursWorked: day.hoursWorked || "0:00",
					timeIn: day.timeIn,
					timeOut: day.timeOut,
				});
				return ns ? { ...dayWithBusinessDate, nightShift: ns } : dayWithBusinessDate;
			});

			// Create calculated timesheet object (not saved to DB)
			const calculatedTimesheet = {
				id: null, // Not saved
				code: "PREVIEW", // Indicate this is a preview
				tempId: `preview:${authReq.organizationId}:${employeeId}:${payrollPeriod.id}`,
				organizationId: authReq.organizationId!,
				employeeId: employeeId,
				employee: {
					...employee,
					reportTo: buildEmployeeSummary(employee.reportTo),
				},
				payrollPeriodId: payrollPeriod.id,
				payrollPeriod: payrollPeriod,
				status: "DRAFT",
				notes: null,
				totalDays: fullAttendanceRecords.length,
				...summary,
				breakdown: breakdown,
				attendances: fullAttendanceRecords,
				submittedAt: null,
				submittedBy: null,
				approvedBy: null,
				approvalDate: null,
				rejectionReason: null,
				editPermissionStatus: "NONE",
				editPermissionRequestId: null,
				editPermissionRequestedAt: null,
				editPermissionGrantedAt: null,
				editPermissionGrantedBy: null,
				editPermissionRejectedAt: null,
				editPermissionRejectedBy: null,
				editPermissionRejectionReason: null,
				editPermissionConsumedAt: null,
				editPermissionExpiresAt: null,
				editPermissionReason: null,
				editPermissionGrantedByEmployee: null,
				editPermissionRejectedByEmployee: null,
				isDeleted: false,
				createdAt: null,
				updatedAt: null,
				isCalculated: true, // Flag to indicate this is calculated, not saved
				canRequestEditPermission: true,
				requestEditPermissionMode: "CREATE_DRAFT_THEN_REQUEST",
			};
			try {
				(calculatedTimesheet as any).breakdown =
					await enrichBreakdownWithLeaveHolidayContext(prisma, {
						organizationId: authReq.organizationId!,
						employeeId,
						breakdown: calculatedTimesheet.breakdown,
					});
			} catch (enrichmentError) {
				timesheetLogger.warn(
					`Failed to enrich calculated timesheet day context for employee ${employeeId}:`,
					enrichmentError,
				);
			}

			timesheetLogger.info(`Calculated timesheet preview for employee ${employeeId}`);

			res.status(200).json(
				buildSuccessResponse(
					"Timesheet calculated successfully",
					{
						timesheet: calculatedTimesheet,
						approvedEditedDaysSummary,
					},
					200,
				),
			);
		} catch (error) {
			timesheetLogger.error(`Failed to fetch/calculate timesheets: ${error}`);
			res.status(500).json(buildErrorResponse("Failed to fetch timesheets", 500));
		}
	};

	const ensurePeriodDrafts = async (req: Request, res: Response, _next: NextFunction) => {
		const authReq = req as AuthRequest;
		const organizationId = authReq.organizationId;
		const payrollPeriodId = String(req.body?.payrollPeriodId || "").trim();
		const requestedCreateLimit = Number(req.body?.createLimit);
		const createLimit = Number.isFinite(requestedCreateLimit)
			? Math.min(Math.max(Math.floor(requestedCreateLimit), 1), 500)
			: 250;
		const requestedEmployeeIds = Array.isArray(req.body?.employeeIds)
			? req.body.employeeIds.map((value: unknown) => String(value || "").trim()).filter(Boolean)
			: [];

		if (!organizationId) {
			res.status(401).json(buildErrorResponse("Unauthorized access", 401));
			return;
		}

		if (!isTimesheetPolicyManager(authReq.role)) {
			res.status(403).json(buildErrorResponse("You are not authorized to prepare timesheets", 403));
			return;
		}

		if (!payrollPeriodId) {
			res.status(400).json(buildErrorResponse("payrollPeriodId is required", 400));
			return;
		}

		try {
			const actorEmployeeId = authReq.metadata?.employee?.id || null;
			const materialized = await ensurePeriodDraftsAndTodayLinesFromAggregate(prisma, {
				organizationId,
				payrollPeriodId,
				actorEmployeeId,
				employeeIds: requestedEmployeeIds,
				limit: createLimit,
			});

			if (materialized.created > 0 || materialized.refreshed > 0) {
				await invalidateCache.byPattern("cache:timesheet:list:*");
				await invalidateCache.byPattern("cache:timesheet:view:*");
				await invalidateCache.byPattern("cache:timesheetline:list:*");
			}

			res.status(200).json(
				buildSuccessResponse(
					"Timesheet drafts prepared successfully",
					{
						payrollPeriodId,
						eligibleEmployees: materialized.eligibleEmployees,
						existing: materialized.existing,
						created: materialized.created,
						refreshed: materialized.refreshed,
						skippedExistingEmployees: materialized.existing,
						missingEmployees: materialized.missingEmployees,
						createLimit: materialized.createLimit,
						remainingDraftsToPrepare: materialized.remainingDraftsToPrepare,
						errors: materialized.errors,
					},
					200,
				),
			);
		} catch (error: any) {
			if (String(error?.message || "") === "PAYROLL_PERIOD_NOT_FOUND") {
				res.status(404).json(buildErrorResponse("Payroll period not found", 404));
				return;
			}
			timesheetLogger.error(`Failed to prepare period draft timesheets: ${error}`);
			res.status(500).json(buildErrorResponse("Failed to prepare draft timesheets", 500));
		}
	};

		const ensureAutoApprovedTimesheets = async (req: Request, res: Response, _next: NextFunction) => {
		const authReq = req as AuthRequest;
		const organizationId = authReq.organizationId;
		const payrollPeriodId = String(req.body?.payrollPeriodId || "").trim();
		const requestedCreateLimit = Number(req.body?.createLimit);
		const createLimit = Number.isFinite(requestedCreateLimit)
			? Math.min(Math.max(Math.floor(requestedCreateLimit), 1), 500)
			: 250;
		const requestedEmployeeIds = Array.isArray(req.body?.employeeIds)
			? req.body.employeeIds.map((value: unknown) => String(value || "").trim()).filter(Boolean)
			: [];
		const departmentId =
			typeof req.body?.departmentId === "string" && req.body.departmentId.trim() !== ""
				? req.body.departmentId.trim()
				: null;
		const sectionId =
			typeof req.body?.sectionId === "string" && req.body.sectionId.trim() !== ""
				? req.body.sectionId.trim()
				: null;

		if (!organizationId) {
			res.status(401).json(buildErrorResponse("Unauthorized access", 401));
			return;
		}

		if (!isTimesheetPolicyManager(authReq.role)) {
			res.status(403).json(buildErrorResponse("You are not authorized to prepare timesheets", 403));
			return;
		}

		if (!payrollPeriodId) {
			res.status(400).json(buildErrorResponse("payrollPeriodId is required", 400));
			return;
		}

		try {
			const actorEmployeeId = authReq.metadata?.employee?.id || null;
			const ensured = await ensurePayrollPeriodTimesheetsAutoApproved(prisma, {
				organizationId,
				payrollPeriodId,
				actorEmployeeId,
				employeeIds: requestedEmployeeIds,
				departmentId,
				sectionId,
				limit: createLimit,
			});

			if (ensured.created > 0 || ensured.autoApproved > 0 || ensured.refreshedLines > 0) {
				await invalidateCache.byPattern("cache:timesheet:list:*");
				await invalidateCache.byPattern("cache:timesheet:view:*");
				await invalidateCache.byPattern("cache:timesheetline:list:*");
				await invalidateCache.byPattern("cache:metrics:*");
			}

			logActivity(req, {
				userId: (req as any).user?.id || "unknown",
				action: "TIMESHEET_ENSURE_AUTO_APPROVED",
				description: `Timesheets ensured auto-approved for period ${payrollPeriodId}: ${ensured.created} created, ${ensured.autoApproved} auto-approved`,
				page: {
					url: req.originalUrl,
					title: "Timesheet Auto-Approve Ensure",
				},
			});

			res.status(200).json(
				buildSuccessResponse(
					"Timesheets generated and auto-approved successfully",
					{
						payrollPeriodId,
						eligibleEmployees: ensured.eligibleEmployees,
						created: ensured.created,
						autoApproved: ensured.autoApproved,
						refreshedLines: ensured.refreshedLines,
						preservedManual: ensured.preservedManual,
						skippedLocked: ensured.skippedLocked,
						skippedPaid: ensured.skippedPaid,
						remainingToPrepare: ensured.remainingToPrepare,
						createLimit: ensured.createLimit,
						errors: ensured.errors,
					},
					200,
				),
			);
		} catch (error: any) {
			if (String(error?.message || "") === "PAYROLL_PERIOD_NOT_FOUND") {
				res.status(404).json(buildErrorResponse("Payroll period not found", 404));
				return;
			}
			timesheetLogger.error(`Failed to ensure auto-approved timesheets: ${error}`);
			res.status(500).json(buildErrorResponse("Failed to generate auto-approved timesheets", 500));
		}
	};

	const syncObligationLines = async (req: Request, res: Response, _next: NextFunction) => {		const authReq = req as AuthRequest;
		const organizationId = authReq.organizationId;
		const id = String(req.params.id || "").trim();

		if (!organizationId) {
			res.status(401).json(buildErrorResponse("Unauthorized access", 401));
			return;
		}

		if (!isTimesheetPolicyManager(authReq.role)) {
			res.status(403).json(
				buildErrorResponse("You are not authorized to prepare timesheets", 403),
			);
			return;
		}

		if (!id) {
			res.status(400).json(buildErrorResponse("Timesheet ID is required", 400));
			return;
		}

		try {
			const timesheet = await prisma.timesheet.findFirst({
				where: {
					organizationId,
					isDeleted: false,
					OR: [{ id }, { code: id }],
				},
				select: {
					id: true,
					code: true,
					employeeId: true,
					payrollPeriodId: true,
					organizationId: true,
					payrollPeriod: {
						select: {
							startDate: true,
							endDate: true,
						},
					},
					employee: {
						select: {
							employmentStartDate: true,
							employmentHireDate: true,
						},
					},
				},
			});

			if (!timesheet) {
				res.status(404).json(buildErrorResponse("Timesheet not found", 404));
				return;
			}

			if (!timesheet.payrollPeriod) {
				res.status(400).json(buildErrorResponse("Timesheet has no payroll period", 400));
				return;
			}

			const periodStart = normalizeToStartOfDay(new Date(timesheet.payrollPeriod.startDate));
			const hireDate = getEffectiveEmploymentStartDate(timesheet.employee);
			const fromDate = hireDate && hireDate > periodStart ? hireDate : periodStart;

			const lines = await materializeTimesheetLinesFromObligations(prisma, {
				organizationId: timesheet.organizationId,
				employeeId: timesheet.employeeId,
				payrollPeriodId: timesheet.payrollPeriodId,
				timesheetId: timesheet.id,
				fromDate,
				toDate: timesheet.payrollPeriod.endDate,
			});

			try {
				await invalidateTimesheetCaches(timesheet.id, timesheet.code);
			} catch (cacheError) {
				timesheetLogger.warn(
					`Failed to invalidate cache after obligation line sync for ${timesheet.id}:`,
					cacheError,
				);
			}

			res.status(200).json(
				buildSuccessResponse(
					"Timesheet obligation lines materialized",
					{
						timesheetId: timesheet.id,
						lineCount: Array.isArray(lines) ? lines.length : 0,
					},
					200,
				),
			);
		} catch (error) {
			timesheetLogger.error(`Failed to sync obligation lines: ${error}`);
			res.status(500).json(buildErrorResponse("Failed to sync obligation lines", 500));
		}
	};

	const repairCurrentPeriodCoverage = async (
		req: Request,
		res: Response,
		_next: NextFunction,
	) => {
		const authReq = req as AuthRequest;
		const organizationId = authReq.organizationId;
		const adminRepairRoles = new Set(["hris-admin", "admin", "super_admin"]);

		if (!organizationId) {
			res.status(401).json(buildErrorResponse("Unauthorized access", 401));
			return;
		}

		if (!adminRepairRoles.has(String(authReq.role || ""))) {
			res.status(403).json(buildErrorResponse("You are not authorized to run admin repair", 403));
			return;
		}

		try {
			const dryRun = req.body?.dryRun !== false;
			const report = await repairCurrentPeriodAttendanceTimesheetCoverage(prisma, {
				organizationId,
				actorEmployeeId: authReq.metadata?.employee?.id || null,
				dryRun,
				options: {
					repairAttendanceObligations:
						req.body?.options?.repairAttendanceObligations !== false,
					repairDraftTimesheets: req.body?.options?.repairDraftTimesheets !== false,
					includeEmployeesMissingSchedules:
						req.body?.options?.includeEmployeesMissingSchedules === true,
					showSampleRows: req.body?.options?.showSampleRows !== false,
				},
			});

			if (!dryRun) {
				await invalidateCache.byPattern("cache:timesheet:list:*");
				await invalidateCache.byPattern("cache:timesheet:view:*");
				await invalidateCache.byPattern("cache:timesheetline:list:*");
				await invalidateCache.byPattern("cache:metrics:*");
			}

			res.status(200).json(
				buildSuccessResponse(
					dryRun
						? "Current payroll period repair dry run completed"
						: "Current payroll period repair applied",
					report,
					200,
				),
			);
		} catch (error: any) {
			if (String(error?.message || "") === "CURRENT_OPEN_PAYROLL_PERIOD_NOT_FOUND") {
				res.status(404).json(buildErrorResponse("No current open payroll period found", 404));
				return;
			}
			timesheetLogger.error(`Failed to repair current period coverage: ${error}`);
			res.status(500).json(buildErrorResponse("Failed to repair current period coverage", 500));
		}
	};

	const lockPeriodTimesheets = async (req: Request, res: Response, _next: NextFunction) => {
		const authReq = req as AuthRequest;
		const organizationId = authReq.organizationId;
		const payrollPeriodId = String(req.body?.payrollPeriodId || "").trim();

		if (!organizationId) {
			res.status(401).json(buildErrorResponse("Unauthorized access", 401));
			return;
		}

		if (!isTimesheetPolicyManager(authReq.role)) {
			res.status(403).json(buildErrorResponse("You are not authorized to lock timesheets", 403));
			return;
		}

		if (!payrollPeriodId) {
			res.status(400).json(buildErrorResponse("payrollPeriodId is required", 400));
			return;
		}

		try {
			const payrollPeriod = await prisma.payrollPeriod.findFirst({
				where: {
					id: payrollPeriodId,
					organizationId,
					isDeleted: false,
				},
				select: {
					id: true,
					name: true,
					code: true,
				},
			});

			if (!payrollPeriod) {
				res.status(404).json(buildErrorResponse("Payroll period not found", 404));
				return;
			}

			const approvedTotal = await prisma.timesheet.count({
				where: {
					organizationId,
					payrollPeriodId,
					status: "APPROVED",
					isDeleted: false,
				},
			});
			const alreadyLocked = await prisma.timesheet.count({
				where: {
					organizationId,
					payrollPeriodId,
					status: "APPROVED",
					lockedAt: { not: null },
					isDeleted: false,
				},
			});
			const openBlockers = await prisma.timesheet.groupBy({
				by: ["status"],
				where: {
					organizationId,
					payrollPeriodId,
					status: { in: ["DRAFT", "SUBMITTED", "REJECTED", "REVISED"] },
					isDeleted: false,
				},
				_count: {
					status: true,
				},
			});

			const now = new Date();
			const actingEmployeeId = authReq.metadata?.employee?.id || null;
			const lockRunId = `manual-period-lock:${payrollPeriodId}:${now.getTime()}`;
			const result = await prisma.timesheet.updateMany({
				where: {
					organizationId,
					payrollPeriodId,
					status: "APPROVED",
					lockedAt: null,
					isDeleted: false,
				},
				data: {
					lockedAt: now,
					lockedBy: actingEmployeeId,
					lockReason: "MANUAL_PERIOD_LOCK",
					lockRunId,
				},
			});

			if (result.count > 0) {
				await invalidateCache.byPattern("cache:timesheet:list:*");
				await invalidateCache.byPattern("cache:timesheet:view:*");
				await invalidateCache.byPattern("cache:timesheet:byIdentifier:*");
			}

			logActivity(req, {
				userId: authReq.userId || "unknown",
				action: "LOCK_PAYROLL_PERIOD_TIMESHEETS",
				description: `Locked ${result.count} approved timesheet(s) for ${payrollPeriod.name || payrollPeriod.code || payrollPeriod.id}`,
				page: {
					url: req.originalUrl,
					title: "HR Timesheets",
				},
			});

			res.status(200).json(
				buildSuccessResponse(
					"Payroll period timesheets locked",
					{
						payrollPeriodId,
						approvedTotal,
						locked: result.count,
						alreadyLocked,
						lockRunId,
						blockers: openBlockers.reduce(
							(acc, row) => ({
								...acc,
								[row.status]: row._count?.status || 0,
							}),
							{} as Record<string, number>,
						),
					},
					200,
				),
			);
		} catch (error) {
			timesheetLogger.error(`Failed to lock payroll period timesheets: ${error}`);
			res.status(500).json(buildErrorResponse("Failed to lock payroll period timesheets", 500));
		}
	};

	/**
	 * Submit timesheet - auto-generates if doesn't exist
	 * POST /api/timesheet/submit
	 * Employee action: Submit timesheet for current period
	 */
	const submit = async (req: Request, res: Response, _next: NextFunction) => {
		const authReq = req as AuthRequest;

		try {
			const employeeId = authReq.metadata?.employee?.id;

			if (!employeeId) {
				const errorResponse = buildErrorResponse(
					"Employee ID not found in authentication token",
					400,
				);
				res.status(400).json(errorResponse);
				return;
			}

			const submitValidation = SubmitTimesheetSchema.safeParse(req.body || {});
			if (!submitValidation.success) {
				const formattedErrors = formatZodErrors(submitValidation.error.format());
				const errorResponse = buildErrorResponse("Validation failed", 400, formattedErrors);
				res.status(400).json(errorResponse);
				return;
			}
			const { notes, breakdown, editedDayKeys } = submitValidation.data;
			const currentDate = new Date();
			// Normalize to partial day for inclusive date check
			const periodCheckDate = new Date(currentDate);
			periodCheckDate.setUTCHours(0, 0, 0, 0);

			// Find current payroll period
			const payrollPeriod = await prisma.payrollPeriod.findFirst({
				where: {
					organizationId: authReq.organizationId!,
					startDate: { lte: currentDate },
					endDate: { gte: periodCheckDate },
					isDeleted: false,
				},
			});

			if (!payrollPeriod) {
				const errorResponse = buildErrorResponse("No current payroll period found", 404);
				res.status(404).json(errorResponse);
				return;
			}

			const timesheetConfig = await getOrCreateTimesheetConfig(authReq.organizationId!);
			const autoApproveEnabled = resolveTimesheetAutoApprovalEnabled(
				timesheetConfig.enableAutoApprove,
			);

			// Check if timesheet exists for current period
			const existingTimesheet = await prisma.timesheet.findFirst({
				where: {
					organizationId: authReq.organizationId!,
					employeeId: employeeId,
					payrollPeriodId: payrollPeriod.id,
					isDeleted: false,
				},
				include: {
					employee: {
						include: {
							person: true,
							position: true,
							department: true,
						},
					},
					attendances: true,
					timesheetlines: {
						where: { isDeleted: false, isEffective: true },
						orderBy: { date: "asc" },
					},
				},
			});

			// If exists, resubmit it
			if (existingTimesheet) {
				const paidPayrollLock = await findTimesheetLock({
					organizationId: existingTimesheet.organizationId,
					timesheetId: existingTimesheet.id,
				});
				if (paidPayrollLock) {
					res.status(409).json(buildTimesheetLockResponse(paidPayrollLock));
					return;
				}

				const submitEligibility = evaluateTimesheetSubmitEligibility(
					existingTimesheet.status,
					existingTimesheet.editPermissionStatus,
				);
				const isCorrectionResubmit = submitEligibility.isCorrectionResubmit;

				if (!submitEligibility.canSubmit) {
					if (submitEligibility.requiresEditPermission) {
						const errorResponse = buildErrorResponse(
							"EDIT_PERMISSION_REQUIRED_FOR_RESUBMISSION",
							403,
							[
								{
									field: "editPermissionStatus",
									message: `EDIT_PERMISSION_REQUIRED_FOR_RESUBMISSION (${existingTimesheet.editPermissionStatus ?? "NONE"})`,
								},
							],
						);
						res.status(403).json(errorResponse);
						return;
					}

					const errorResponse = buildErrorResponse(
						`Cannot submit timesheet in ${existingTimesheet.status} status`,
						400,
					);
					res.status(400).json(errorResponse);
					return;
				}

				const existingMetadata =
					existingTimesheet.metadata &&
					typeof existingTimesheet.metadata === "object" &&
					!Array.isArray(existingTimesheet.metadata)
						? { ...(existingTimesheet.metadata as Record<string, unknown>) }
						: {};
				const updateData: any = {
					status: submissionOutcome.status,
					submittedAt: new Date(),
					submittedBy: employeeId,
					editPermissionStatus: "NONE",
					editPermissionConsumedAt: null,
					editPermissionExpiresAt: null,
					...(notes && { notes }),
				};
				if (submissionOutcome.autoApproved) {
					// Org policy auto-approval: submission lands APPROVED with no
					// review step; snapshot mirrors the manual APPROVE action and
					// stays marked autoApproved for audit.
					updateData.approvedBy = employeeId;
					updateData.approvalDate = updateData.submittedAt;
					updateData.metadata = buildAutoApprovedSubmissionMetadata(
						existingMetadata,
						updateData.submittedAt,
						updateData.approvedBy,
					);
				}
				let normalizedBreakdownForLineSync: any[] | null = null;
				let lineVersionMode: "update" | "version" = "update";
				let versionDayKeys: Set<string> | undefined;
				let manualEditDayKeys: Set<string> | undefined;
				let skipObligationMaterialize = false;
				const submitBreakdownPersistence = await prepareSubmitBreakdownPersistence({
					existingTimesheet,
					breakdown,
					editedDayKeys,
					isCorrectionResubmit,
					isEmployeeOwner: true,
					employeeSchedule: (existingTimesheet.employee as any)?.schedule || null,
				});
				if (submitBreakdownPersistence.errorResponse) {
					res.status(409).json(submitBreakdownPersistence.errorResponse);
					return;
				}
				normalizedBreakdownForLineSync =
					submitBreakdownPersistence.normalizedBreakdownForLineSync;
				lineVersionMode = submitBreakdownPersistence.lineVersionMode;
				versionDayKeys = submitBreakdownPersistence.versionDayKeys;
				manualEditDayKeys = submitBreakdownPersistence.manualEditDayKeys;
				skipObligationMaterialize = submitBreakdownPersistence.skipObligationMaterialize;
				Object.assign(updateData, submitBreakdownPersistence.summaryPatch);
				if (autoApproveEnabled) {
					const existingMetadata = {
						...(existingTimesheet.metadata &&
						typeof existingTimesheet.metadata === "object" &&
						!Array.isArray(existingTimesheet.metadata)
							? (existingTimesheet.metadata as Record<string, unknown>)
							: {}),
						...((updateData.metadata as any) || {}),
					};
					Object.assign(
						updateData,
						buildTimesheetAutoApprovalPatch(existingMetadata, updateData.submittedAt),
					);
					updateData.submittedAt = updateData.submittedAt || new Date();
					updateData.submittedBy = updateData.submittedBy || employeeId;
				}

				if (!Array.isArray(normalizedBreakdownForLineSync) && !skipObligationMaterialize) {
					// Normal first submission snapshots from AttendanceObligation.
					await materializeTimesheetLinesFromObligations(prisma, {
						organizationId: existingTimesheet.organizationId,
						employeeId: existingTimesheet.employeeId,
						payrollPeriodId: existingTimesheet.payrollPeriodId,
						timesheetId: existingTimesheet.id,
						fromDate: payrollPeriod.startDate,
						toDate: payrollPeriod.endDate,
					});
				}

				const updatedTimesheet = await prisma.timesheet.update({
					where: { id: existingTimesheet.id },
					data: updateData,
					include: {
						employee: {
							include: {
								person: true,
								position: true,
								department: true,
							},
						},
						attendances: true,
						timesheetlines: {
							where: { isDeleted: false, isEffective: true },
							orderBy: { date: "asc" },
						},
					},
				});

				if (Array.isArray(normalizedBreakdownForLineSync)) {
					await syncTimesheetLinesFromBreakdown(prisma, {
						organizationId: updatedTimesheet.organizationId,
						employeeId: updatedTimesheet.employeeId,
						payrollPeriodId: updatedTimesheet.payrollPeriodId,
						timesheetId: updatedTimesheet.id,
						breakdown: normalizedBreakdownForLineSync,
						versionMode: lineVersionMode,
						versionDayKeys,
						manualEditDayKeys,
						ledgerType: lineVersionMode === "version" ? "CORRECTION" : "SNAPSHOT",
						editedBy: employeeId,
						editReason: notes || null,
						attendances: Array.isArray((updatedTimesheet as any).attendances)
							? (updatedTimesheet as any).attendances
							: [],
					});
					(updatedTimesheet as any).timesheetlines = await (prisma as any).timesheetline.findMany({
						where: {
							organizationId: updatedTimesheet.organizationId,
							timesheetId: updatedTimesheet.id,
							isDeleted: false,
							isEffective: true,
						},
						orderBy: { date: "asc" },
					});
				}
				attachTimesheetBreakdownFromLines(updatedTimesheet as any);

				if (!autoApproveEnabled) {
					await createOrReuseTimesheetSubmissionRequest({
						authReq,
						timesheet: {
							id: updatedTimesheet.id,
							code: updatedTimesheet.code,
							employeeId: updatedTimesheet.employeeId,
							payrollPeriod: { code: payrollPeriod.code },
						},
						reason: notes,
					});
				} else {
					try {
						await publishTimesheetDecisionFallbackNotification(prisma, (authReq as any).io, {
							timesheetId: updatedTimesheet.id,
							status: "APPROVED",
							sourceEmployeeId: employeeId || null,
							comment: "Auto-approved by timesheet approval settings",
						});
					} catch (notificationError) {
						timesheetLogger.warn(
							`Failed to publish auto-approval notification for ${updatedTimesheet.id}: ${notificationError}`,
						);
					}
				}

				timesheetLogger.info(
					`Timesheet resubmitted: ${updatedTimesheet.id}${autoApproveEnabled ? " (auto-approved)" : ""}`,
				);

				logActivity(req, {
					userId: authReq.userId || "unknown",
					action:
						(config.ACTIVITY_LOG.TIMESHEET?.ACTIONS as any)?.SUBMIT_TIMESHEET ||
						"SUBMIT_TIMESHEET",
					description: `Timesheet resubmitted: ${updatedTimesheet.id}`,
					page: {
						url: req.originalUrl,
						title: "Timesheet Submission",
					},
				});

				logAudit(req, {
					userId: authReq.userId || "unknown",
					action: config.AUDIT_LOG.ACTIONS.UPDATE,
					resource: "TIMESHEET",
					severity: config.AUDIT_LOG.SEVERITY.MEDIUM,
					entityType: "TIMESHEET",
					entityId: updatedTimesheet.id,
					changesBefore: existingTimesheet,
					changesAfter: updatedTimesheet,
					description: `Timesheet resubmitted: ${updatedTimesheet.id}`,
				});

				try {
					await invalidateTimesheetCaches(updatedTimesheet.id, updatedTimesheet.code);
					timesheetLogger.info("Cache invalidated after timesheet resubmission");
				} catch (cacheError) {
					timesheetLogger.warn(
						"Failed to invalidate cache after resubmission:",
						cacheError,
					);
				}

				const successResponse = buildSuccessResponse(
					"Timesheet submitted successfully",
					updatedTimesheet,
					200,
				);
				res.status(200).json(successResponse);
				return;
			}

			// Doesn't exist - auto-generate and submit
			try {
				const newTimesheet = await generateTimesheetForEmployee(
					prisma,
					employeeId,
					authReq.organizationId!,
					currentDate,
					notes,
					submissionOutcome.status,
				);

				let submittedTimesheet: any = newTimesheet;
				await materializeTimesheetLinesFromObligations(prisma, {
					organizationId: submittedTimesheet.organizationId,
					employeeId: submittedTimesheet.employeeId,
					payrollPeriodId: submittedTimesheet.payrollPeriodId,
					timesheetId: submittedTimesheet.id,
					fromDate: payrollPeriod.startDate,
					toDate: payrollPeriod.endDate,
				});

				if (autoApproveEnabled) {
					submittedTimesheet = await prisma.timesheet.update({
						where: { id: submittedTimesheet.id },
						data: buildTimesheetAutoApprovalPatch(
							(submittedTimesheet.metadata as Record<string, unknown>) || null,
						),
						include: {
							attendances: true,
							timesheetlines: {
								where: { isDeleted: false, isEffective: true },
								orderBy: { date: "asc" },
							},
						},
					});
					try {
						await publishTimesheetDecisionFallbackNotification(prisma, (authReq as any).io, {
							timesheetId: submittedTimesheet.id,
							status: "APPROVED",
							sourceEmployeeId: employeeId || null,
							comment: "Auto-approved by timesheet approval settings",
						});
					} catch (notificationError) {
						timesheetLogger.warn(
							`Failed to publish auto-approval notification for ${submittedTimesheet.id}: ${notificationError}`,
						);
					}
				}

				submittedTimesheet = await prisma.timesheet.findUnique({
					where: { id: submittedTimesheet.id },
					include: {
						attendances: true,
						timesheetlines: {
							where: { isDeleted: false, isEffective: true },
							orderBy: { date: "asc" },
						},
					},
				});
				attachTimesheetBreakdownFromLines(submittedTimesheet as any);

				if (!autoApproveEnabled) {
					await createOrReuseTimesheetSubmissionRequest({
						authReq,
						timesheet: {
							id: submittedTimesheet.id,
							code: submittedTimesheet.code,
							employeeId: submittedTimesheet.employeeId,
							payrollPeriod: { code: payrollPeriod.code },
						},
						reason: notes,
					});
				}

				timesheetLogger.info(
					`Timesheet auto-generated and submitted for employee ${employeeId}: ${newTimesheet.id}${autoApproveEnabled ? " (auto-approved)" : ""}`,
				);

				logActivity(req, {
					userId: authReq.userId || "unknown",
					action:
						(config.ACTIVITY_LOG.TIMESHEET?.ACTIONS as any)?.SUBMIT_TIMESHEET ||
						"SUBMIT_TIMESHEET",
					description: `Timesheet generated and submitted: ${submittedTimesheet.id}`,
					page: {
						url: req.originalUrl,
						title: "Timesheet Submission",
					},
				});

				logAudit(req, {
					userId: authReq.userId || "unknown",
					action: config.AUDIT_LOG.ACTIONS.CREATE,
					resource: "TIMESHEET",
					severity: config.AUDIT_LOG.SEVERITY.MEDIUM,
					entityType: "TIMESHEET",
					entityId: submittedTimesheet.id,
					changesBefore: null,
					changesAfter: submittedTimesheet,
					description: `Timesheet generated and submitted: ${submittedTimesheet.id}`,
				});

				try {
					await invalidateCache.byPattern("cache:timesheet:list:*");
					await invalidateCache.byPattern("cache:timesheet:view:*");
					timesheetLogger.info("Cache invalidated after timesheet submission");
				} catch (cacheError) {
					timesheetLogger.warn(
						"Failed to invalidate cache after submission:",
						cacheError,
					);
				}

				const successResponse = buildSuccessResponse(
					"Timesheet submitted successfully",
					submittedTimesheet,
					201,
				);
				res.status(201).json(successResponse);
			} catch (error: any) {
				const errorResponse = buildErrorResponse(
					error.message || "Failed to generate timesheet",
					400,
				);
				res.status(400).json(errorResponse);
			}
		} catch (error) {
			timesheetLogger.error(`Failed to submit timesheet: ${error}`);
			const errorResponse = buildErrorResponse("Failed to submit timesheet", 500);
			res.status(500).json(errorResponse);
		}
	};

	const requestCurrentEditPermission = async (
		req: Request,
		res: Response,
		_next: NextFunction,
	) => {
		const authReq = req as AuthRequest;
		const validation = RequestCurrentTimesheetEditPermissionSchema.safeParse(req.body);

		if (!validation.success) {
			const formattedErrors = formatZodErrors(validation.error.format());
			const errorResponse = buildErrorResponse("Validation failed", 400, formattedErrors);
			res.status(400).json(errorResponse);
			return;
		}

		try {
			if (!authReq.organizationId) {
				const errorResponse = buildErrorResponse("Organization ID is required", 400);
				res.status(400).json(errorResponse);
				return;
			}

			await assertEditingPolicyEnabled(authReq.organizationId);

			const actingEmployeeId = await getActingEmployeeId(authReq);
			if (!actingEmployeeId) {
				const errorResponse = buildErrorResponse("Employee context is required", 401);
				res.status(401).json(errorResponse);
				return;
			}

			const payrollPeriod = await resolvePayrollPeriod({
				organizationId: authReq.organizationId,
				periodCode: validation.data.periodCode,
			});

			if (!payrollPeriod) {
				const errorResponse = buildErrorResponse("Payroll period not found", 404);
				res.status(404).json(errorResponse);
				return;
			}

			let timesheet = await prisma.timesheet.findFirst({
				where: {
					organizationId: authReq.organizationId,
					employeeId: actingEmployeeId,
					payrollPeriodId: payrollPeriod.id,
					isDeleted: false,
				},
				include: {
					payrollPeriod: {
						select: {
							code: true,
						},
					},
				},
			});

			let createdDraft = false;
			if (!timesheet) {
				const generated = await generateTimesheetForEmployee(
					prisma,
					actingEmployeeId,
					authReq.organizationId,
					payrollPeriod.startDate,
					undefined,
					"DRAFT",
				);

				createdDraft = true;
				timesheet = await prisma.timesheet.findFirst({
					where: {
						id: generated.id,
						isDeleted: false,
					},
					include: {
						payrollPeriod: {
							select: {
								code: true,
							},
						},
					},
				});
			}

			if (!timesheet) {
				const errorResponse = buildErrorResponse(
					"Failed to resolve timesheet for edit permission request",
					500,
				);
				res.status(500).json(errorResponse);
				return;
			}

			const paidPayrollLock = await findTimesheetLock({
				organizationId: timesheet.organizationId,
				timesheetId: timesheet.id,
			});
			if (paidPayrollLock) {
				res.status(409).json(buildTimesheetLockResponse(paidPayrollLock));
				return;
			}

			const created = await createEditPermissionRequestForTimesheet({
				authReq,
				timesheet,
				reason: validation.data.reason,
			});

			res.status(200).json(
				buildSuccessResponse("Edit permission request submitted successfully", {
					...created,
					createdDraft,
				}),
			);
		} catch (error: any) {
			const message = String(error?.message || "UNKNOWN_ERROR");
			if (message === "POLICY_DISABLED") {
				res.status(403).json(
					buildErrorResponse("POLICY_DISABLED", 403, [
						{
							field: "enableEditBeforeSubmission",
							message: "POLICY_DISABLED",
						},
					]),
				);
				return;
			}
			if (message === "EMPLOYEE_CONTEXT_REQUIRED") {
				res.status(401).json(buildErrorResponse("Employee context is required", 401));
				return;
			}
			if (message === "ONLY_OWNER_CAN_REQUEST") {
				res.status(403).json(
					buildErrorResponse("Only the timesheet owner can request edit permission", 403),
				);
				return;
			}
			if (message === "PERMISSION_NOT_REQUIRED_FOR_REVISED") {
				res.status(409).json(
					buildErrorResponse(
						"Edit permission is not required for REVISED timesheets",
						409,
					),
				);
				return;
			}
			if (message === "EDIT_PERMISSION_ALREADY_REQUESTED") {
				res.status(409).json(
					buildErrorResponse("EDIT_PERMISSION_ALREADY_REQUESTED", 409, [
						{
							field: "editPermissionStatus",
							message: "EDIT_PERMISSION_ALREADY_REQUESTED",
						},
					]),
				);
				return;
			}
			if (message === "EDIT_PERMISSION_ALREADY_APPROVED") {
				res.status(409).json(
					buildErrorResponse(
						"Edit permission is already approved for this timesheet",
						409,
					),
				);
				return;
			}
			if (message === "WORKFLOW_NOT_CONFIGURED") {
				res.status(409).json(
					buildErrorResponse("Timesheet edit permission workflow is not configured", 409),
				);
				return;
			}
			if (message === "WORKFLOW_INVALID") {
				res.status(409).json(
					buildErrorResponse(
						"Configured edit permission workflow is invalid or inactive",
						409,
					),
				);
				return;
			}
			if (message === "REQUESTER_NOT_FOUND") {
				res.status(404).json(buildErrorResponse("Requester not found", 404));
				return;
			}

			timesheetLogger.error(`Failed to request current edit permission: ${error}`);
			res.status(500).json(buildErrorResponse("Failed to request edit permission", 500));
		}
	};

	const requestEditPermission = async (req: Request, res: Response, _next: NextFunction) => {
		const authReq = req as AuthRequest;
		const { id } = req.params;
		const validation = RequestTimesheetEditPermissionSchema.safeParse(req.body);

		if (!validation.success) {
			const formattedErrors = formatZodErrors(validation.error.format());
			const errorResponse = buildErrorResponse("Validation failed", 400, formattedErrors);
			res.status(400).json(errorResponse);
			return;
		}

		try {
			if (!id || !authReq.organizationId) {
				const errorResponse = buildErrorResponse("Timesheet ID is required", 400);
				res.status(400).json(errorResponse);
				return;
			}

			await assertEditingPolicyEnabled(authReq.organizationId);

			const timesheet = await prisma.timesheet.findFirst({
				where: {
					id,
					organizationId: authReq.organizationId,
					isDeleted: false,
				},
				include: {
					payrollPeriod: {
						select: {
							code: true,
						},
					},
				},
			});

			if (!timesheet) {
				const errorResponse = buildErrorResponse("Timesheet not found", 404);
				res.status(404).json(errorResponse);
				return;
			}

			const paidPayrollLock = await findTimesheetLock({
				organizationId: timesheet.organizationId,
				timesheetId: timesheet.id,
			});
			if (paidPayrollLock) {
				res.status(409).json(buildTimesheetLockResponse(paidPayrollLock));
				return;
			}

			const created = await createEditPermissionRequestForTimesheet({
				authReq,
				timesheet,
				reason: validation.data.reason,
			});

			res.status(200).json(
				buildSuccessResponse("Edit permission request submitted successfully", {
					...created,
				}),
			);
		} catch (error: any) {
			const message = String(error?.message || "UNKNOWN_ERROR");
			if (message === "POLICY_DISABLED") {
				res.status(403).json(
					buildErrorResponse("POLICY_DISABLED", 403, [
						{
							field: "enableEditBeforeSubmission",
							message: "POLICY_DISABLED",
						},
					]),
				);
				return;
			}
			if (message === "EMPLOYEE_CONTEXT_REQUIRED") {
				res.status(401).json(buildErrorResponse("Employee context is required", 401));
				return;
			}
			if (message === "ONLY_OWNER_CAN_REQUEST") {
				res.status(403).json(
					buildErrorResponse("Only the timesheet owner can request edit permission", 403),
				);
				return;
			}
			if (message === "PERMISSION_NOT_REQUIRED_FOR_REVISED") {
				res.status(409).json(
					buildErrorResponse(
						"Edit permission is not required for REVISED timesheets",
						409,
					),
				);
				return;
			}
			if (message === "EDIT_PERMISSION_ALREADY_REQUESTED") {
				res.status(409).json(
					buildErrorResponse("EDIT_PERMISSION_ALREADY_REQUESTED", 409, [
						{
							field: "editPermissionStatus",
							message: "EDIT_PERMISSION_ALREADY_REQUESTED",
						},
					]),
				);
				return;
			}
			if (message === "EDIT_PERMISSION_ALREADY_APPROVED") {
				res.status(409).json(
					buildErrorResponse(
						"Edit permission is already approved for this timesheet",
						409,
					),
				);
				return;
			}
			if (message === "WORKFLOW_NOT_CONFIGURED") {
				res.status(409).json(
					buildErrorResponse("Timesheet edit permission workflow is not configured", 409),
				);
				return;
			}
			if (message === "WORKFLOW_INVALID") {
				res.status(409).json(
					buildErrorResponse(
						"Configured edit permission workflow is invalid or inactive",
						409,
					),
				);
				return;
			}
			if (message === "REQUESTER_NOT_FOUND") {
				res.status(404).json(buildErrorResponse("Requester not found", 404));
				return;
			}

			timesheetLogger.error(`Failed to request timesheet edit permission: ${error}`);
			res.status(500).json(buildErrorResponse("Failed to request edit permission", 500));
		}
	};

	const reviewEditPermission = async (req: Request, res: Response, _next: NextFunction) => {
		const authReq = req as AuthRequest;
		const { id } = req.params;
		const validation = ReviewTimesheetEditPermissionSchema.safeParse(req.body);

		if (!validation.success) {
			const formattedErrors = formatZodErrors(validation.error.format());
			const errorResponse = buildErrorResponse("Validation failed", 400, formattedErrors);
			res.status(400).json(errorResponse);
			return;
		}

		try {
			if (!id || !authReq.organizationId) {
				const errorResponse = buildErrorResponse("Timesheet ID is required", 400);
				res.status(400).json(errorResponse);
				return;
			}

			if (!isManagerRole(authReq.role)) {
				const errorResponse = buildErrorResponse(
					"You are not authorized to review edit permission requests",
					403,
				);
				res.status(403).json(errorResponse);
				return;
			}

			const actingEmployeeId = await getActingEmployeeId(authReq);
			if (!actingEmployeeId) {
				const errorResponse = buildErrorResponse("Employee context is required", 401);
				res.status(401).json(errorResponse);
				return;
			}

			const timesheet = await prisma.timesheet.findFirst({
				where: {
					id,
					organizationId: authReq.organizationId,
					isDeleted: false,
				},
			});

			if (!timesheet) {
				const errorResponse = buildErrorResponse("Timesheet not found", 404);
				res.status(404).json(errorResponse);
				return;
			}

			if (!timesheet.editPermissionRequestId) {
				const errorResponse = buildErrorResponse(
					"No edit permission request is linked to this timesheet",
					409,
				);
				res.status(409).json(errorResponse);
				return;
			}

			if (timesheet.editPermissionRequestId !== validation.data.requestId) {
				const errorResponse = buildErrorResponse(
					"Request ID does not match the linked edit permission request",
					409,
				);
				res.status(409).json(errorResponse);
				return;
			}

			const requestRecord = await prisma.request.findFirst({
				where: {
					id: validation.data.requestId,
					organizationId: authReq.organizationId,
					type: "TIMESHEET",
					isDeleted: false,
				},
				select: {
					id: true,
					currentWorkflowStateKey: true,
					requesterId: true,
					metadata: true,
					currentStepExecutionId: true,
				},
			});

			if (!requestRecord) {
				const errorResponse = buildErrorResponse("Request not found", 404);
				res.status(404).json(errorResponse);
				return;
			}

			const metadata = (requestRecord.metadata || {}) as Record<string, any>;
			if (
				metadata.timesheetAction !== "EDIT_PERMISSION" ||
				String(metadata.timesheetId || "") !== String(timesheet.id)
			) {
				const errorResponse = buildErrorResponse(
					"Request is not a timesheet edit permission request",
					409,
				);
				res.status(409).json(errorResponse);
				return;
			}

			if (!isRequestActiveState(requestRecord)) {
				const errorResponse = buildErrorResponse(
					`Cannot review request in ${getRequestStateKey(requestRecord)} state`,
					409,
				);
				res.status(409).json(errorResponse);
				return;
			}

			if (!requestRecord.currentStepExecutionId) {
				const errorResponse = buildErrorResponse("No active workflow step found", 409);
				res.status(409).json(errorResponse);
				return;
			}

			const currentStep = await prisma.workflowStepExecution.findFirst({
				where: {
					id: requestRecord.currentStepExecutionId,
					requestId: requestRecord.id,
					isDeleted: false,
					status: "PENDING",
				},
				select: {
					id: true,
					stepType: true,
					assigneeId: true,
				},
			});

			if (!currentStep) {
				const errorResponse = buildErrorResponse("Active workflow step not found", 409);
				res.status(409).json(errorResponse);
				return;
			}

			if (currentStep.stepType !== "APPROVAL") {
				const errorResponse = buildErrorResponse(
					"Current workflow step is not approvable from this endpoint",
					409,
				);
				res.status(409).json(errorResponse);
				return;
			}

			if (currentStep.assigneeId && currentStep.assigneeId !== actingEmployeeId) {
				const errorResponse = buildErrorResponse(
					"Only the assigned approver can review this request",
					403,
				);
				res.status(403).json(errorResponse);
				return;
			}

			const now = new Date();
			const isApprove = validation.data.decision === "approve";

			const outcome = await prisma.$transaction(async (tx) => {
				await tx.workflowStepExecution.update({
					where: { id: currentStep.id },
					data: {
						status: isApprove ? "APPROVED" : "REJECTED",
						completedAt: now,
						assigneeId: actingEmployeeId,
						comments: validation.data.reason?.trim() || null,
					},
				});

				if (isApprove) {
					await updateRequestStepProgress(tx, requestRecord.id, currentStep.id);

					const requestAfterProgress = await tx.request.findUnique({
						where: { id: requestRecord.id },
						select: {
							currentStepExecutionId: true,
						},
					});

					const isFullyApproved = !requestAfterProgress?.currentStepExecutionId;
					await tx.request.update({
						where: { id: requestRecord.id },
						data: {
							...(isFullyApproved ? { currentWorkflowStateKey: "APPROVED" } : {}),
							notes: validation.data.reason?.trim() || undefined,
						},
					});

					const timesheetUpdate = isFullyApproved
						? {
								editPermissionStatus: "APPROVED" as const,
								editPermissionGrantedAt: now,
								editPermissionGrantedBy: actingEmployeeId,
								editPermissionRejectedAt: null,
								editPermissionRejectedBy: null,
								editPermissionRejectionReason: null,
							}
						: {
								editPermissionStatus: "REQUESTED" as const,
							};

					const updatedTimesheet = await tx.timesheet.update({
						where: { id: timesheet.id },
						data: timesheetUpdate,
					});

					return updatedTimesheet;
				}

				await tx.request.update({
					where: { id: requestRecord.id },
					data: {
						currentWorkflowStateKey: "REJECTED",
						currentStepExecutionId: null,
						lastCompletedStepExecutionId: currentStep.id,
						notes: validation.data.reason?.trim() || null,
					},
				});

				const updatedTimesheet = await tx.timesheet.update({
					where: { id: timesheet.id },
					data: {
						editPermissionStatus: "REJECTED",
						editPermissionRejectedAt: now,
						editPermissionRejectedBy: actingEmployeeId,
						editPermissionRejectionReason: validation.data.reason?.trim() || null,
					},
				});

				return updatedTimesheet;
			});

			await invalidateTimesheetCaches(timesheet.id, timesheet.code);

			res.status(200).json(
				buildSuccessResponse("Edit permission review completed", {
					timesheetId: outcome.id,
					requestId: requestRecord.id,
					editPermissionStatus: outcome.editPermissionStatus,
				}),
			);
		} catch (error) {
			timesheetLogger.error(`Failed to review timesheet edit permission: ${error}`);
			res.status(500).json(buildErrorResponse("Failed to review edit permission", 500));
		}
	};

	const consumeEditPermission = async (req: Request, res: Response, _next: NextFunction) => {
		const authReq = req as AuthRequest;
		const { id } = req.params;

		try {
			if (!id || !authReq.organizationId) {
				const errorResponse = buildErrorResponse("Timesheet ID is required", 400);
				res.status(400).json(errorResponse);
				return;
			}

			const actingEmployeeId = await getActingEmployeeId(authReq);
			if (!actingEmployeeId) {
				const errorResponse = buildErrorResponse("Employee context is required", 401);
				res.status(401).json(errorResponse);
				return;
			}

			const timesheet = await prisma.timesheet.findFirst({
				where: {
					id,
					organizationId: authReq.organizationId,
					isDeleted: false,
				},
			});

			if (!timesheet) {
				const errorResponse = buildErrorResponse("Timesheet not found", 404);
				res.status(404).json(errorResponse);
				return;
			}

			if (timesheet.employeeId !== actingEmployeeId) {
				const errorResponse = buildErrorResponse(
					"Only the timesheet owner can consume edit permission",
					403,
				);
				res.status(403).json(errorResponse);
				return;
			}

			if (timesheet.editPermissionStatus !== "APPROVED") {
				const errorResponse = buildErrorResponse(
					"Edit permission is not in APPROVED state",
					409,
				);
				res.status(409).json(errorResponse);
				return;
			}

			const updatedTimesheet = await prisma.timesheet.update({
				where: { id: timesheet.id },
				data: {
					editPermissionStatus: "CONSUMED",
					editPermissionConsumedAt: new Date(),
				},
			});

			await invalidateTimesheetCaches(timesheet.id, timesheet.code);

			res.status(200).json(
				buildSuccessResponse("Edit permission consumed", {
					timesheetId: updatedTimesheet.id,
					editPermissionStatus: updatedTimesheet.editPermissionStatus,
				}),
			);
		} catch (error) {
			timesheetLogger.error(`Failed to consume edit permission: ${error}`);
			res.status(500).json(buildErrorResponse("Failed to consume edit permission", 500));
		}
	};

	const getConfig = async (req: Request, res: Response, _next: NextFunction) => {
		const authReq = req as AuthRequest;
		try {
			if (!authReq.organizationId) {
				const errorResponse = buildErrorResponse("Organization ID is required", 400);
				res.status(400).json(errorResponse);
				return;
			}

			const timesheetConfig = await getOrCreateTimesheetConfig(authReq.organizationId);
			const successResponse = buildSuccessResponse(
				"Timesheet configuration retrieved successfully",
				{
					...timesheetConfig,
					approvalRequired: !resolveTimesheetAutoApprovalEnabled(
						timesheetConfig.enableAutoApprove,
					),
					blockPayrollOnUnsubmitted: !resolveTimesheetAutoApprovalEnabled(
						timesheetConfig.enableAutoApprove,
					),
				},
				200,
			);
			res.status(200).json(successResponse);
		} catch (error) {
			timesheetLogger.error(`Failed to retrieve timesheet config: ${error}`);
			res.status(500).json(buildErrorResponse("Failed to retrieve timesheet config", 500));
		}
	};

	const updateConfig = async (req: Request, res: Response, _next: NextFunction) => {
		const authReq = req as AuthRequest;
		try {
			if (!authReq.organizationId) {
				const errorResponse = buildErrorResponse("Organization ID is required", 400);
				res.status(400).json(errorResponse);
				return;
			}

			if (!isTimesheetPolicyManager(authReq.role)) {
				const errorResponse = buildErrorResponse(
					"You are not authorized to update timesheet configuration",
					403,
				);
				res.status(403).json(errorResponse);
				return;
			}

			const validationResult = UpdateTimesheetConfigSchema.safeParse(req.body);
			if (!validationResult.success) {
				const formattedErrors = formatZodErrors(validationResult.error.format());
				const errorResponse = buildErrorResponse("Validation failed", 400, formattedErrors);
				res.status(400).json(errorResponse);
				return;
			}

			const payload: any = { ...validationResult.data };
			if (Object.keys(payload).length === 0) {
				const errorResponse = buildErrorResponse("No fields to update", 400);
				res.status(400).json(errorResponse);
				return;
			}

			const existingConfig = await getOrCreateTimesheetConfig(authReq.organizationId);
			const rules = normalizeTimesheetRulesConfig({
				workTimeRounding: payload.workTimeRounding ?? existingConfig.workTimeRounding,
				overtimeQualification:
					payload.overtimeQualification ??
					existingConfig.overtimeQualification ?? {
						minimumMinutesBeforeQualification:
							payload.overtimeFlagThresholdMinutes ??
							existingConfig.overtimeFlagThresholdMinutes,
					},
				payrollFinalization:
					payload.payrollFinalization ?? existingConfig.payrollFinalization,
			});
			payload.workTimeRounding = rules.workTimeRounding;
			payload.overtimeQualification = rules.overtimeQualification;
			payload.payrollFinalization = rules.payrollFinalization;
			payload.overtimeFlagThresholdMinutes =
				rules.overtimeQualification.minimumMinutesBeforeQualification;
			const updatedConfig = await prisma.timesheetConfig.update({
				where: { organizationId: authReq.organizationId },
				data: payload,
			});

			logActivity(req, {
				userId: authReq.userId || "unknown",
				action: "UPDATE_TIMESHEET_CONFIG",
				description: `Timesheet config updated for org ${authReq.organizationId}`,
				page: {
					url: req.originalUrl,
					title: "Timesheet Settings",
				},
			});

			logAudit(req, {
				userId: authReq.userId || "unknown",
				action: config.AUDIT_LOG.ACTIONS.UPDATE,
				resource: "TIMESHEET_CONFIG",
				severity: config.AUDIT_LOG.SEVERITY.LOW,
				entityType: "TIMESHEET_CONFIG",
				entityId: updatedConfig.id,
				changesBefore: existingConfig,
				changesAfter: updatedConfig,
				description: `Timesheet config updated for org ${authReq.organizationId}`,
			});

			const successResponse = buildSuccessResponse(
				"Timesheet configuration updated successfully",
				{
					...mergeTimesheetConfigRules(updatedConfig),
					approvalRequired: !resolveTimesheetAutoApprovalEnabled(
						updatedConfig.enableAutoApprove,
					),
					blockPayrollOnUnsubmitted: !resolveTimesheetAutoApprovalEnabled(
						updatedConfig.enableAutoApprove,
					),
				},
				200,
			);
			res.status(200).json(successResponse);
		} catch (error) {
			timesheetLogger.error(`Failed to update timesheet config: ${error}`);
			res.status(500).json(buildErrorResponse("Failed to update timesheet config", 500));
		}
	};

	const sendReminder = async (req: Request, res: Response, _next: NextFunction) => {
		const authReq = req as AuthRequest;
		try {
			const id = req.params.id;
			if (!id || !authReq.organizationId) {
				res.status(400).json(buildErrorResponse("Timesheet ID and organization are required", 400));
				return;
			}

			if (!isTimesheetPolicyManager(authReq.role)) {
				res.status(403).json(
					buildErrorResponse("You are not authorized to send timesheet reminders", 403),
				);
				return;
			}

			const requestedKind = String(req.body?.kind || "").trim() || null;
			const allowedKinds = new Set(["employee_submit", "employee_correct", "manager_approval"]);
			if (requestedKind && !allowedKinds.has(requestedKind)) {
				res.status(400).json(buildErrorResponse("Invalid reminder kind", 400));
				return;
			}

			const timesheet = await prisma.timesheet.findFirst({
				where: {
					id,
					organizationId: authReq.organizationId,
					isDeleted: false,
				},
				select: {
					id: true,
					code: true,
					status: true,
					employeeId: true,
					employee: {
						select: {
							reportToId: true,
						},
					},
				},
			});

			if (!timesheet) {
				res.status(404).json(buildErrorResponse("Timesheet not found", 404));
				return;
			}

			const status = String(timesheet.status || "").toUpperCase();
			const inferredKind =
				status === "SUBMITTED"
					? "manager_approval"
					: status === "DRAFT"
						? "employee_submit"
						: status === "REJECTED" || status === "REVISED"
							? "employee_correct"
							: null;

			if (!inferredKind) {
				res.status(400).json(
					buildErrorResponse("This timesheet status does not require a reminder", 400),
				);
				return;
			}

			if (requestedKind && requestedKind !== inferredKind) {
				res.status(400).json(
					buildErrorResponse("Reminder kind does not match the timesheet status", 400),
				);
				return;
			}

			if (inferredKind === "manager_approval" && !timesheet.employee?.reportToId) {
				res.status(400).json(
					buildErrorResponse("No reporting manager is assigned for this employee", 400),
				);
				return;
			}

			const actingEmployeeId = await getActingEmployeeId(authReq);
			const notification = await publishTimesheetReminderNotification(
				prisma,
				(authReq as any).io,
				{
					timesheetId: timesheet.id,
					kind: inferredKind,
					sourceEmployeeId: actingEmployeeId || authReq.userId || null,
				},
			);

			if (!notification) {
				res.status(400).json(buildErrorResponse("No reminder recipient was available", 400));
				return;
			}

			logActivity(req, {
				userId: authReq.userId || "unknown",
				action: "SEND_TIMESHEET_REMINDER",
				description: `Timesheet reminder sent for ${timesheet.code || timesheet.id}`,
				page: {
					url: req.originalUrl,
					title: "HR Timesheets",
				},
			});

			res.status(200).json(
				buildSuccessResponse("Timesheet reminder sent", {
					timesheetId: timesheet.id,
					notificationId: notification.id,
					kind: inferredKind,
				}),
			);
		} catch (error) {
			timesheetLogger.error(`Failed to send timesheet reminder: ${error}`);
			res.status(500).json(buildErrorResponse("Failed to send timesheet reminder", 500));
		}
	};

	const createOvertimeRequest = async (req: Request, res: Response, _next: NextFunction) => {
		const { id } = req.params;
		const authReq = req as AuthRequest;

		try {
			const employeeId = authReq.metadata?.employee?.id;
			const organizationId = authReq.organizationId;
			if (!employeeId || !organizationId) {
				res.status(400).json(buildErrorResponse("Employee context is required", 400));
				return;
			}

			const body = (req.body || {}) as Record<string, unknown>;
			const date = body.date ? new Date(String(body.date)) : null;
			const timesheetLineId = body.timesheetLineId ? String(body.timesheetLineId) : null;
			if (!date && !timesheetLineId) {
				res
					.status(400)
					.json(buildErrorResponse("date or timesheetLineId is required", 400));
				return;
			}

			const result = await createOvertimeRequestForTimesheetLine({
				prisma,
				organizationId,
				employeeId,
				timesheetId: id,
				timesheetLineId,
				date: date || new Date(),
				description: typeof body.description === "string" ? body.description : undefined,
				notes: typeof body.notes === "string" ? body.notes : undefined,
				generateRequestCode,
			});

			await invalidateTimesheetCaches(id);

			try {
				await publishRequestCreatedNotification(
					prisma,
					(authReq as any).io,
					result.requestId,
					employeeId,
				);
			} catch (notificationError) {
				timesheetLogger.warn(
					`Failed to publish overtime request notification for ${result.requestId}: ${notificationError}`,
				);
			}

			res.status(201).json(buildSuccessResponse("Overtime request created", result, 201));
		} catch (error) {
			const message = String((error as Error)?.message || error || "");
			if (message === "TIMESHEET_NOT_FOUND" || message === "TIMESHEET_LINE_NOT_FOUND") {
				res.status(404).json(buildErrorResponse(message, 404));
				return;
			}
			if (
				message === "NOT_OVERTIME_CANDIDATE" ||
				message === "OVERTIME_REQUEST_ALREADY_FILED"
			) {
				res.status(409).json(buildErrorResponse(message, 409));
				return;
			}
			if (message === "WORKFLOW_NOT_CONFIGURED") {
				res.status(409).json(buildErrorResponse(message, 409));
				return;
			}
			timesheetLogger.error(`Failed to create overtime request: ${error}`);
			res.status(500).json(buildErrorResponse("Failed to create overtime request", 500));
		}
	};

	const createPayrollCorrection = async (req: Request, res: Response, _next: NextFunction) => {
		const { id } = req.params;
		const authReq = req as AuthRequest;

		try {
			const employeeId = authReq.metadata?.employee?.id;
			const organizationId = authReq.organizationId;
			if (!employeeId || !organizationId) {
				res.status(400).json(buildErrorResponse("Employee context is required", 400));
				return;
			}

			const body = (req.body || {}) as Record<string, unknown>;
			const reason = typeof body.reason === "string" ? body.reason : "";
			const dayDeltas = body.dayDeltas;

			const result = await createPayrollCorrectionRequest({
				prisma,
				organizationId,
				employeeId,
				timesheetId: id,
				reason,
				dayDeltas,
				description: typeof body.description === "string" ? body.description : undefined,
				notes: typeof body.notes === "string" ? body.notes : undefined,
				generateRequestCode,
			});

			await invalidateTimesheetCaches(id);

			try {
				await publishRequestCreatedNotification(
					prisma,
					(authReq as any).io,
					result.requestId,
					employeeId,
				);
			} catch (notificationError) {
				timesheetLogger.warn(
					`Failed to publish payroll correction notification for ${result.requestId}: ${notificationError}`,
				);
			}

			res
				.status(201)
				.json(buildSuccessResponse("Payroll correction request created", result, 201));
		} catch (error) {
			const message = String((error as Error)?.message || error || "");
			if (message === "TIMESHEET_NOT_FOUND") {
				res.status(404).json(buildErrorResponse(message, 404));
				return;
			}
			if (
				message === "TIMESHEET_NOT_PAYROLL_LOCKED" ||
				message === "DUPLICATE_OPEN_CORRECTION_DAY" ||
				message === "WORKFLOW_NOT_CONFIGURED" ||
				message === "DAY_DELTAS_REQUIRED" ||
				message === "REASON_REQUIRED"
			) {
				res.status(409).json(buildErrorResponse(message, 409));
				return;
			}
			timesheetLogger.error(`Failed to create payroll correction: ${error}`);
			res.status(500).json(buildErrorResponse("Failed to create payroll correction", 500));
		}
	};

	const listPayrollCorrections = async (req: Request, res: Response, _next: NextFunction) => {
		const { id } = req.params;
		const authReq = req as AuthRequest;

		try {
			const organizationId = authReq.organizationId;
			if (!organizationId) {
				res.status(400).json(buildErrorResponse("Organization context is required", 400));
				return;
			}

			const employeeId = authReq.metadata?.employee?.id as string | undefined;
			const rows = await listPayrollCorrectionsForTimesheet({
				prisma,
				organizationId,
				timesheetId: id,
				// Employees see own; managers/HR with broader access can omit filter via role later
				employeeId: employeeId || undefined,
			});

			res.status(200).json(
				buildSuccessResponse("Payroll corrections retrieved", { items: rows }),
			);
		} catch (error) {
			timesheetLogger.error(`Failed to list payroll corrections: ${error}`);
			res.status(500).json(buildErrorResponse("Failed to list payroll corrections", 500));
		}
	};

	return {
		create,
		getAll,
		getById,
		update,
		remove,
		action,
		submit,
		view,
		getConfig,
		updateConfig,
		requestCurrentEditPermission,
		requestEditPermission,
		reviewEditPermission,
		consumeEditPermission,
		createOvertimeRequest,
		createPayrollCorrection,
		listPayrollCorrections,
		normalizeBreakdownPreview,
		ensurePeriodDrafts,
		ensureAutoApprovedTimesheets,
		syncObligationLines,
		repairCurrentPeriodCoverage,
		lockPeriodTimesheets,
		sendReminder,
	};
};
