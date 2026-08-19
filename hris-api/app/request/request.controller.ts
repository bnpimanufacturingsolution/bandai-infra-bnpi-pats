// @ts-nocheck
import { Request, Response, NextFunction } from "express";
import {
	PrismaClient,
	Prisma,
	AttendanceStatus,
	RequestTransactionEventCategory,
	RequestTransactionEventKey,
} from "../../generated/prisma";
import { getLogger } from "../../helper/logger.helper";
import { transformFormDataToObject } from "../../helper/transformObject";
import { validateQueryParams } from "../../helper/validation-helper";
import {
	buildFilterConditions,
	buildFindManyQuery,
	buildSearchConditions,
	getNestedFields,
} from "../../helper/query-builder.helper";
import { buildSuccessResponse, buildPagination } from "../../helper/success-handler.helper";
import { groupDataByField } from "../../helper/dataGrouping";
import { buildErrorResponse, formatZodErrors } from "../../helper/error-handler";
import {
	CreateRequestSchema,
	UpdateRequestSchema,
	RequestApprovalSchema,
	RequestDelegateStepSchema,
} from "../../zod/request.zod";
import { logActivity } from "../../utils/activityLogger";
import { logAudit } from "../../utils/auditLogger";
import { config } from "../../config/constant";
import { redisClient } from "../../config/redis";
import {
	buildRequestFieldChanges,
	createRequestTransaction,
	resolveRequestTransactionActorType,
} from "../../helper/request-transaction.helper";
import { invalidateCache } from "../../middleware/cache";
import { AuthRequest } from "../../middleware/verifyToken";
import {
	autoCompleteSystemSteps,
	createRequestStepExecutions,
	buildAssigneeResolutionMetadata,
	getDefaultWorkflowStates,
	getDefaultRequestWorkflow,
	completeAttendanceCorrectionHrReviewIfActorIsHr,
	repairAttendanceCorrectionHrReviewIfHrAlreadyApproved,
	repairAttendanceCorrectionSupervisorWorkflowIfNeeded,
	repairScheduleChangeHrApprovalQueueIfNeeded,
	repairScheduleChangeHrApprovalStepIfNeeded,
	resolveStepAssignee,
	updateRequestStepProgress,
} from "../../helper/request-runtime.helper";
import {
	getOrCreateWorkforceRecruitmentSetting,
	countCurrentHeadcount,
	isDepartmentJobRequisitionMetadata,
	resolveWorkforcePolicy,
	serializeWorkforceRecruitmentSetting,
	WORKFORCE_REQUISITION_REQUEST_SUBTYPE,
	WORKFORCE_REQUISITION_WORKFLOW_CODE,
} from "../../helper/workforce-recruitment.helper";
import {
	publishRequestCancelledNotification,
	publishRequestCreatedNotification,
	publishRequestDecisionNotification,
	publishDocumentRequestSubmittedNotification,
	publishDocumentRequestApprovalNeededNotification,
	publishDocumentRequestCompletedNotification,
} from "../../helper/notification-dispatch.helper";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { uploadToCloudinary } from "../../helper/cloudinary.helper";
import { applyAttendanceCorrectionRequest } from "../attendance/apply-attendance-correction-request";
import { applyApprovedLeaveAttendanceReconciliation } from "./leave-attendance-reconciliation.service";
import { applyApprovedTimeAdjustmentReconciliation } from "./time-adjustment-reconciliation.service";
import {
	resolveLeaveSessionWindows,
	isHalfDaySessionCutoffReached,
	type LeaveDurationUnit,
	type LeaveHalfDaySession,
} from "../../helper/leave-session.helper";
import {
	getLeavePolicyByType,
	normalizeLeaveType,
	validateLeaveRequestPolicy,
} from "../../helper/leave-policy.helper";
import { createBoardingProcess } from "../../helper/boarding.helper";
import { generateBir2316PdfForEmployee } from "../../helper/bir-2316-report.helper";
import {
	resolveEffectiveShift,
	resolveEmployeeActiveSchedule,
} from "../../helper/employee-schedule.helper";
import { calculateShiftHour } from "../../helper/schedule-normalization.helper";
import {
	calculateTimekeeping,
	deriveBehaviorFlags,
	determineAttendanceStatus,
	formatMinutesAsTime,
} from "../../helper/timekeeping.helper";
import {
	recomputeAttendanceObligationsForRange,
} from "../../helper/attendance-obligation.helper";
import { applyApprovedOvertimeCompensatoryCredit } from "../timesheet/approved-overtime-comp-leave.service";
import { applyOvertimeRequestApprovalSideEffects } from "../timesheet/overtime-request.service";
import { applyPayrollCorrectionApprovalSideEffects } from "../payrollCorrection/payroll-correction.service";
import { REQUEST_WORKFLOW_CODES } from "../../helper/workflow-config.helper";

const logger = getLogger();
const requestLogger = logger.child({ module: "request" });
const DEACTIVATED_ACCOUNT_MESSAGE =
	"Your account has been deactivated due to termination or resignation. Please contact HR for further assistance.";

const sanitizeRequestFields = (fields?: string) => {
	if (!fields) return fields;

	return Array.from(
		new Set(
			fields
				.split(",")
				.map((field) => field.trim())
				.filter(Boolean)
				.map((field) => (field === "status" ? "currentWorkflowStateKey" : field)),
		),
	).join(",");
};

const appendRequestWhereCondition = (
	whereClause: Prisma.RequestWhereInput,
	condition: Prisma.RequestWhereInput,
) => {
	const existingAnd = whereClause.AND;
	const nextAnd = Array.isArray(existingAnd)
		? existingAnd
		: existingAnd
			? [existingAnd]
			: [];
	whereClause.AND = [...nextAnd, condition];
};

const getRequestStateKey = (
	request: { currentWorkflowStateKey?: string | null } | null | undefined,
) => String(request?.currentWorkflowStateKey || "").toUpperCase();

const isRequestActiveForDecision = (
	request:
		| { currentWorkflowStateKey?: string | null; currentStepExecutionId?: string | null }
		| null
		| undefined,
) => {
	const stateKey = getRequestStateKey(request);
	return (
		Boolean(request?.currentStepExecutionId) ||
		["OPEN", "SUBMITTED", "FOR_APPROVAL", "IN_PROCESS", "APPROVED"].includes(stateKey)
	);
};

const isRequestApprovedState = (stateKey: string) => ["APPROVED", "COMPLETED"].includes(stateKey);

const PRIVILEGED_REQUISITION_REQUESTER_ROLES = new Set([
	"hris-admin",
	"hris-hr-manager",
	"admin",
	"super_admin",
]);

const HR_WORKFLOW_DECISION_ROLES = new Set([
	"admin",
	"super_admin",
	"superadmin",
	"hris-admin",
	"hris-hr-manager",
	"hris-hr-user",
]);

const PAN_REQUEST_TYPES = new Set([
	"REGULARIZATION",
	"PROMOTION",
	"SALARY_CHANGE",
	"TRANSFER",
	"TERMINATION",
]);

const PAN_REQUESTER_BYPASS_ROLES = new Set([
	"hris-admin",
	"hris-hr-manager",
	"hris-hr-user",
	"admin",
	"super_admin",
	"superadmin",
]);

const MANAGER_INITIATED_PAN_REQUEST_TYPES = new Set([
	"REGULARIZATION",
	"PROMOTION",
	"TRANSFER",
]);
const ACTIVE_DUPLICATE_REQUEST_STATES = [
	"OPEN",
	"SUBMITTED",
	"FOR_APPROVAL",
	"IN_PROCESS",
	"APPROVED",
];
const PENDING_DOCUMENT_DUPLICATE_REQUEST_STATES = [
	"OPEN",
	"SUBMITTED",
	"FOR_APPROVAL",
	"IN_PROCESS",
	"PENDING",
	"PENDING_APPROVAL",
];
const HR_TICKET_REQUEST_TYPES = [
	"DOCUMENT_REQUEST",
	"RESIGNATION",
	"TERMINATION",
	"TRANSFER",
	"REGULARIZATION",
	"PROMOTION",
	"SALARY_CHANGE",
	"SCHEDULE_CHANGE",
	"ATTENDANCE_CORRECTION",
	"OTHER",
];
const HR_TICKET_ACTIVE_STATES = ["OPEN", "SUBMITTED", "FOR_APPROVAL", "IN_PROCESS"];
const HR_TICKET_TASK_STATES = [...HR_TICKET_ACTIVE_STATES, "APPROVED"];
const HR_TICKET_RECENT_STATES = ["APPROVED", "COMPLETED", "REJECTED", "CANCELLED"];

const PAN_SOURCE_OF_TRUTH_METADATA_KEYS = new Set([
	"employee_snapshot",
	"current_values",
	"currentSalary",
	"currentDepartment",
	"currentDepartmentId",
	"currentPosition",
	"currentPositionId",
	"currentLevel",
	"currentLevelId",
	"currentEmploymentStatus",
	"currentEmploymentType",
	"currentWorkLocation",
	"basicSalary",
	"targetEmployeeId",
	"applicationMode",
	"applicationStatus",
	"initiatedByRole",
	"initiatedByEmployeeId",
	"initiatorRoleKey",
	"formActor",
]);

const getSafePanCreateMetadata = (metadata: unknown) => {
	const source =
		metadata && typeof metadata === "object" && !Array.isArray(metadata)
			? (metadata as Record<string, any>)
			: {};
	const safeMetadata: Record<string, any> = {};
	for (const [key, value] of Object.entries(source)) {
		if (!PAN_SOURCE_OF_TRUTH_METADATA_KEYS.has(key)) {
			safeMetadata[key] = value;
		}
	}
	return safeMetadata;
};

const normalizeDocumentRequestType = (metadata: unknown) => {
	if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return "";
	const record = metadata as Record<string, any>;
	return String(record.documentType || record.docType || record.type || "")
		.trim()
		.toUpperCase()
		.replace(/\s+/g, "_");
};

const normalizeDuplicateText = (value: unknown) =>
	String(value || "")
		.trim()
		.replace(/\s+/g, " ")
		.toLowerCase();

const normalizeDocumentRequestYear = (metadata: unknown) => {
	if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return "";
	const record = metadata as Record<string, any>;
	const rawYear = record.year ?? record.taxYear ?? record.documentYear;
	if (rawYear === undefined || rawYear === null || rawYear === "") return "";
	return String(rawYear).trim();
};

const buildDocumentRequestDuplicateSignature = (request: {
	description?: unknown;
	notes?: unknown;
	metadata?: unknown;
}) =>
	[
		normalizeDocumentRequestType(request.metadata),
		normalizeDocumentRequestYear(request.metadata),
		normalizeDuplicateText(request.description),
		normalizeDuplicateText(request.notes),
	].join("|");

const getPanActorFormRole = (role?: string | null) => {
	const normalizedRole = String(role || "")
		.trim()
		.toLowerCase();
	if (PAN_REQUESTER_BYPASS_ROLES.has(normalizedRole)) return "HR";
	if (normalizedRole === "hris-employee-manager" || normalizedRole.includes("manager")) {
		return "MANAGER";
	}
	return "EMPLOYEE";
};

const isEmployeeInReportingTree = async (params: {
	prisma: PrismaClient;
	managerEmployeeId: string;
	targetEmployeeId: string;
	organizationId?: string | null;
}) => {
	if (!params.managerEmployeeId || !params.targetEmployeeId) return false;
	if (params.managerEmployeeId === params.targetEmployeeId) return false;

	const visited = new Set<string>([params.managerEmployeeId]);
	let frontier = [params.managerEmployeeId];

	while (frontier.length > 0) {
		const reports = await params.prisma.employee.findMany({
			where: {
				reportToId: { in: frontier },
				isDeleted: false,
				...(params.organizationId ? { organizationId: params.organizationId } : {}),
			},
			select: {
				id: true,
			},
		});

		const nextFrontier: string[] = [];
		for (const report of reports) {
			if (visited.has(report.id)) continue;
			if (report.id === params.targetEmployeeId) return true;
			visited.add(report.id);
			nextFrontier.push(report.id);
		}

		frontier = nextFrontier;
	}

	return false;
};

const extractMetadataRequestSubtypeFilter = (filter?: string | string[]) => {
	if (typeof filter !== "string" || !filter.trim()) {
		return {
			filterWithoutSubtype: typeof filter === "string" ? filter : undefined,
			includeSubtypeFilters: [] as string[],
			excludeSubtypeFilters: [] as string[],
		};
	}

	const items = filter
		.split(",")
		.map((item) => item.trim())
		.filter(Boolean);
	const includeSubtypeFilters: string[] = [];
	const excludeSubtypeFilters: string[] = [];
	const remaining: string[] = [];

	for (const item of items) {
		if (item.startsWith("metadata.requestSubtype:")) {
			const value = item.slice("metadata.requestSubtype:".length).trim();
			if (value) includeSubtypeFilters.push(value);
			continue;
		}
		if (item.startsWith("metadata.requestSubtype!")) {
			const value = item.slice("metadata.requestSubtype!".length).trim();
			if (value) excludeSubtypeFilters.push(value);
			continue;
		}
		remaining.push(item);
	}

	return {
		filterWithoutSubtype: remaining.join(",") || undefined,
		includeSubtypeFilters,
		excludeSubtypeFilters,
	};
};

const getRequestMetadataSubtype = (metadata: Prisma.JsonValue | null | undefined) => {
	if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return null;

	const subtype = (metadata as Record<string, unknown>).requestSubtype;
	return typeof subtype === "string" && subtype.trim() ? subtype.trim() : null;
};

const matchesRequestSubtypeFilters = (
	metadata: Prisma.JsonValue | null | undefined,
	params: {
		includeSubtypeFilters: string[];
		excludeSubtypeFilters: string[];
	},
) => {
	const subtype = getRequestMetadataSubtype(metadata);

	if (
		params.includeSubtypeFilters.length > 0 &&
		!params.includeSubtypeFilters.includes(subtype || "")
	) {
		return false;
	}

	if (
		params.excludeSubtypeFilters.length > 0 &&
		params.excludeSubtypeFilters.includes(subtype || "")
	) {
		return false;
	}

	return true;
};

const parsePositiveIntegerQuery = (value: unknown, fallback: number) => {
	const parsed = Number(value);
	if (!Number.isFinite(parsed) || parsed < 1) return fallback;
	return Math.floor(parsed);
};

const normalizeStatesForResponse = (states: unknown) => {
	const source = Array.isArray(states) && states.length > 0 ? states : getDefaultWorkflowStates();
	return source
		.map((state: any, index: number) => ({
			key: String(state?.key || "")
				.trim()
				.toUpperCase(),
			label: String(state?.label || state?.key || "").trim() || `State ${index + 1}`,
			order: typeof state?.order === "number" ? state.order : index,
			isTerminal: state?.isTerminal === true,
			color:
				typeof state?.color === "string" && state.color.trim()
					? state.color.trim()
					: undefined,
			permissions: Array.isArray(state?.permissions) ? state.permissions : undefined,
			allowed_transitions: Array.isArray(state?.allowed_transitions)
				? state.allowed_transitions
				: undefined,
		}))
		.filter((state) => state.key);
};

/**
 * Generate the next request code in the format REQ-XXXXX
 * Finds the highest existing code and increments it
 */
const generateRequestCode = async (
	prisma: PrismaClient,
	organizationId: string,
): Promise<string> => {
	try {
		// Get all requests with codes for this organization to find the max number
		const requestsWithCodes = await prisma.request.findMany({
			where: {
				organizationId,
				code: {
					not: null,
				},
			},
			select: {
				code: true,
			},
		});

		let maxNumber = 0;

		// Find the highest number from existing codes
		for (const request of requestsWithCodes) {
			if (request.code) {
				const match = request.code.match(/REQ-(\d+)/);
				if (match) {
					const number = parseInt(match[1], 10);
					if (number > maxNumber) {
						maxNumber = number;
					}
				}
			}
		}

		// Generate next number
		let nextNumber = maxNumber + 1;
		let attempts = 0;
		const maxAttempts = 10;

		// Try to find a unique code (handle potential race conditions)
		while (attempts < maxAttempts) {
			const code = `REQ-${nextNumber.toString().padStart(5, "0")}`;

			// Check if code already exists
			const exists = await prisma.request.findUnique({
				where: { code },
			});

			if (!exists) {
				return code;
			}

			// If exists, try next number
			nextNumber++;
			attempts++;
		}

		// Fallback: use timestamp if we can't find a unique sequential number
		const timestamp = Date.now().toString().slice(-8);
		return `REQ-${timestamp}`;
	} catch (error) {
		requestLogger.error(`Error generating request code: ${error}`);
		// Fallback: use timestamp-based code
		const timestamp = Date.now().toString().slice(-8);
		return `REQ-${timestamp}`;
	}
};

export const controller = (prisma: PrismaClient) => {
	const getTerminationSeparationType = (
		metadata: Record<string, any> | null | undefined,
	): "RESIGNATION" | "TERMINATION" => {
		const rawType = String(metadata?.terminationType || metadata?.type || "").toLowerCase();
		return rawType.includes("resign") ? "RESIGNATION" : "TERMINATION";
	};

	const getSafeMetadataObject = (value: unknown): Record<string, any> => {
		if (!value || typeof value !== "object" || Array.isArray(value)) {
			return {};
		}
		return value as Record<string, any>;
	};

	const isTimesheetSubmissionRequest = (requestLike: {
		type?: string | null;
		metadata?: unknown;
	}) => {
		const metadata = getSafeMetadataObject(requestLike.metadata);
		return (
			String(requestLike.type || "").toUpperCase() === "TIMESHEET" &&
			String(metadata.timesheetAction || "").toUpperCase() === "SUBMISSION"
		);
	};

	const syncTimesheetSubmissionDecision = async (params: {
		requestData: {
			organizationId: string;
			type?: string | null;
			metadata?: unknown;
		};
		isApprove: boolean;
		now: Date;
		actingEmployeeId?: string | null;
		comment?: string | null;
	}) => {
		if (!isTimesheetSubmissionRequest(params.requestData)) {
			return;
		}

		const metadata = getSafeMetadataObject(params.requestData.metadata);
		const timesheetId = String(metadata.timesheetId || "").trim();
		if (!timesheetId) {
			return;
		}

		const linkedTimesheet = await prisma.timesheet.findFirst({
			where: {
				id: timesheetId,
				organizationId: params.requestData.organizationId,
				isDeleted: false,
			},
			select: {
				id: true,
				code: true,
				organizationId: true,
				status: true,
				payrollPeriod: {
					select: {
						name: true,
						startDate: true,
						endDate: true,
					},
				},
			},
		});

		if (!linkedTimesheet) {
			return;
		}

		const timesheetConfig = await prisma.timesheetConfig.findUnique({
			where: {
				organizationId: params.requestData.organizationId,
			},
			select: {
				rejectBehavior: true,
			},
		});

		if (params.isApprove) {
			await prisma.timesheet.update({
				where: { id: linkedTimesheet.id },
				data: {
					status: "APPROVED",
					approvedBy: params.actingEmployeeId || null,
					approvalDate: params.now,
					rejectionReason: null,
				},
			});

			await applyApprovedOvertimeCompensatoryCredit({
				prisma,
				organizationId: linkedTimesheet.organizationId,
				timesheetId: linkedTimesheet.id,
				approvedByEmployeeId: params.actingEmployeeId || null,
				approvedAt: params.now,
			});

		} else {
			await prisma.timesheet.update({
				where: { id: linkedTimesheet.id },
				data: {
					status: timesheetConfig?.rejectBehavior === "REJECT" ? "REJECTED" : "REVISED",
					approvedBy: null,
					approvalDate: null,
					rejectionReason: params.comment?.trim() || "Rejected by approver",
				},
			});

		}

		try {
			await invalidateCache.byPattern(`cache:timesheet:byId:${linkedTimesheet.id}:*`);
			await invalidateCache.byPattern(`cache:timesheet:byCode:${linkedTimesheet.code}:*`);
			await invalidateCache.byPattern("cache:timesheet:list:*");
			await invalidateCache.byPattern("cache:timesheet:view:*");
		} catch (cacheError) {
			requestLogger.warn(
				"Failed to invalidate cache after timesheet submission review:",
				cacheError,
			);
		}
	};

	const isHiringRequisitionRequest = (requestLike: {
		type?: string | null;
		metadata?: unknown;
	}) =>
		String(requestLike?.type || "").toUpperCase() === "OTHER" &&
		isDepartmentJobRequisitionMetadata(requestLike?.metadata);

	const createHiringRequisitionJob = async (params: {
		requestId: string;
		organizationId: string;
		metadata: Record<string, any>;
	}): Promise<{ jobId: string | null; skipped: boolean }> => {
		const requisition = getSafeMetadataObject(params.metadata.requisition);
		const positionId = String(requisition.positionId || "").trim();
		const sectionId = String(requisition.sectionId || "").trim() || null;
		const levelId = String(requisition.levelId || "").trim() || null;

		if (!positionId) {
			throw new Error("Approved hiring requisition is missing positionId.");
		}

		if (String(params.metadata.createdJobId || "").trim()) {
			return { jobId: String(params.metadata.createdJobId).trim(), skipped: true };
		}

		const job = await prisma.job.create({
			data: {
				organizationId: params.organizationId,
				departmentId: String(requisition.departmentId || "").trim() || null,
				sectionId,
				sourceRequestId: params.requestId,
				headcountRequested: Math.max(
					1,
					Math.floor(Number(requisition.requestedHeadcount || 1)),
				),
				positionId,
				levelId,
				tags: Array.isArray(requisition.jobTags)
					? requisition.jobTags
							.map((item: unknown) => String(item || "").trim())
							.filter(Boolean)
					: [],
				type:
					String(requisition.jobType || "HIRING_REQUISITION").trim() ||
					"HIRING_REQUISITION",
				location: String(requisition.jobLocation || "").trim() || null,
				description:
					String(requisition.jobDescription || requisition.justification || "").trim() ||
					null,
			},
		});

		await prisma.request.update({
			where: { id: params.requestId },
			data: {
				metadata: {
					...params.metadata,
					createdJobId: job.id,
					jobCreatedAt: new Date().toISOString(),
				},
			},
		});

		return { jobId: job.id, skipped: false };
	};

	const getStepDelegationHistory = (metadata: unknown): Record<string, any>[] => {
		const metadataObject = getSafeMetadataObject(metadata);
		return Array.isArray(metadataObject.delegationHistory)
			? metadataObject.delegationHistory.filter(
					(entry) => entry && typeof entry === "object" && !Array.isArray(entry),
				)
			: [];
	};

	const getActingEmployeeId = async (
		req: AuthRequest,
		organizationId: string,
	): Promise<string | null> => {
		const employeeIdFromToken = req.metadata?.employee?.id;
		if (employeeIdFromToken) {
			return employeeIdFromToken;
		}

		if (!req.userId) {
			return null;
		}

		const employee = await prisma.employee.findFirst({
			where: {
				organizationId,
				userId: req.userId,
				isDeleted: false,
			},
			select: {
				id: true,
			},
		});

		return employee?.id ?? null;
	};

	const canDelegateWorkflowStep = (params: {
		role?: string | null;
		actingEmployeeId?: string | null;
		currentAssigneeId?: string | null;
	}) => {
		const normalizedRole = String(params.role || "")
			.trim()
			.toLowerCase();
		if (
			["admin", "super_admin", "superadmin", "hris-admin", "hris-hr-manager"].includes(
				normalizedRole,
			)
		) {
			return true;
		}

		return Boolean(
			params.actingEmployeeId &&
				params.currentAssigneeId &&
				params.actingEmployeeId === params.currentAssigneeId,
		);
	};

	const getDateOnly = (date: Date): string => date.toISOString().split("T")[0];

	const getLeaveMetadata = (
		requestLike: any,
	): {
		leaveType: string;
		totalDays: number;
		durationUnit: LeaveDurationUnit;
		halfDaySession?: LeaveHalfDaySession;
	} => {
		const metadata = (requestLike?.metadata as Record<string, any>) || {};
		const rawDurationUnit = String(metadata.durationUnit || "FULL_DAY").toUpperCase();
		const durationUnit: LeaveDurationUnit =
			rawDurationUnit === "HALF_DAY" ? "HALF_DAY" : "FULL_DAY";
		const rawHalfDaySession = String(metadata.halfDaySession || "").toUpperCase();
		const halfDaySession: LeaveHalfDaySession | undefined =
			rawHalfDaySession === "AM" || rawHalfDaySession === "PM"
				? (rawHalfDaySession as LeaveHalfDaySession)
				: undefined;

		return {
			leaveType: String(metadata.leaveType || ""),
			totalDays: Number(metadata.totalDays || 0),
			durationUnit,
			halfDaySession,
		};
	};

	const validateLeaveRequestAgainstPolicyOrThrow = async (params: {
		organizationId: string;
		requestLike: any;
		employmentType?: any;
		now?: Date;
	}) => {
		const { organizationId, requestLike, employmentType, now } = params;
		const { leaveType, totalDays, durationUnit } = getLeaveMetadata(requestLike);

		const normalizedLeaveType = normalizeLeaveType(leaveType);
		if (!normalizedLeaveType) {
			throw new Error(`Unsupported leave type: ${leaveType}`);
		}

		const policy = await getLeavePolicyByType(prisma, organizationId, normalizedLeaveType);
		if (!policy) {
			throw new Error(`Leave policy for ${normalizedLeaveType} is not configured.`);
		}

		validateLeaveRequestPolicy({
			policy,
			leaveType: normalizedLeaveType,
			totalDays,
			durationUnit,
			startDate: requestLike.startDate ? new Date(requestLike.startDate) : undefined,
			attachments: Array.isArray(requestLike.attachments) ? requestLike.attachments : [],
			employmentType,
			now,
		});
	};

	const validateHalfDayLeaveAndResolveWindow = (params: {
		startDate?: Date | null;
		endDate?: Date | null;
		employeeSchedule: any;
		halfDaySession?: LeaveHalfDaySession;
		totalDays: number;
		now?: Date;
	}) => {
		const { startDate, endDate, employeeSchedule, halfDaySession, totalDays, now } = params;

		if (!startDate || !endDate) {
			throw new Error("Half-day leave requires startDate and endDate.");
		}

		if (getDateOnly(startDate) !== getDateOnly(endDate)) {
			throw new Error("Half-day leave must be for one date only.");
		}

		if (!halfDaySession) {
			throw new Error("Half-day leave requires halfDaySession (AM or PM).");
		}

		if (totalDays !== 0.5) {
			throw new Error("Half-day leave must have totalDays equal to 0.5.");
		}

		const sessionResolution = resolveLeaveSessionWindows(employeeSchedule, startDate);
		const selectedWindow =
			halfDaySession === "AM" ? sessionResolution.am : sessionResolution.pm;

		if (!selectedWindow.windowStart || !selectedWindow.windowEnd) {
			throw new Error("Unable to compute half-day session window from schedule.");
		}

		const referenceNow = now || new Date();
		if (isHalfDaySessionCutoffReached(startDate, selectedWindow.windowStart, referenceNow)) {
			throw new Error(
				`${halfDaySession} half-day leave is no longer allowed for today. Session starts at ${selectedWindow.windowStart}.`,
			);
		}

		return selectedWindow;
	};

	const enumerateDateRangeInclusive = (startDate: Date, endDate: Date): Date[] => {
		const start = new Date(startDate);
		start.setUTCHours(0, 0, 0, 0);
		const end = new Date(endDate);
		end.setUTCHours(0, 0, 0, 0);
		const dates: Date[] = [];

		let cursor = start;
		while (cursor.getTime() <= end.getTime()) {
			dates.push(new Date(cursor));
			cursor = new Date(cursor);
			cursor.setUTCDate(cursor.getUTCDate() + 1);
		}

		return dates;
	};

	const shiftHasWorkSlots = (shift: any) =>
		Array.isArray(shift?.timeSlots) &&
		shift.timeSlots.some(
			(slot: any) => slot?.type === "work" && slot?.startTime && slot?.endTime,
		);

	const validateLeaveDatesAgainstScheduleOrThrow = async (params: {
		organizationId: string;
		employeeId: string;
		startDate?: Date | null;
		endDate?: Date | null;
	}) => {
		const { organizationId, employeeId, startDate, endDate } = params;
		if (!startDate || !endDate) {
			return;
		}

		const leaveDates = enumerateDateRangeInclusive(startDate, endDate);
		for (const leaveDate of leaveDates) {
			const effectiveShift = await resolveEffectiveShift(prisma, {
				organizationId,
				employeeId,
				date: leaveDate,
			});

			if (!effectiveShift) {
				continue;
			}

			if (effectiveShift.isOff || !shiftHasWorkSlots(effectiveShift)) {
				throw new Error(
					`Leave requests cannot be filed on off days. ${getDateOnly(leaveDate)} is an off day.`,
				);
			}
		}
	};

	const applyAttendanceCorrectionApprovalSideEffects = async (params: {
		requestId: string;
		requestData: any;
		now: Date;
		appliedByEmployeeId?: string | null;
	}) => {
		const { requestId, requestData, appliedByEmployeeId } = params;
		return applyAttendanceCorrectionRequest({
			prisma,
			organizationId: requestData.organizationId,
			requestId,
			requesterId: requestData.requesterId,
			targetEmployeeId: requestData.targetEmployeeId,
			startDate: requestData.startDate,
			endDate: requestData.endDate,
			notes: requestData.notes,
			metadata: requestData.metadata,
			actorEmployeeId: appliedByEmployeeId || null,
			now,
		});
	};

	const applyTimeAdjustmentApprovalSideEffects = async (params: {
		requestId: string;
		requestData: any;
		now: Date;
	}) => {
		const { requestId, requestData, now } = params;
		const metadata = getSafeMetadataObject(requestData.metadata);

		const employeeId =
			String(requestData.targetEmployeeId || requestData.requesterId || "").trim() || null;
		if (!employeeId) {
			throw new Error("Time adjustment request is missing target employee.");
		}

		const adjustmentDateRaw = metadata.date || requestData.startDate || requestData.endDate;
		if (!adjustmentDateRaw) {
			throw new Error("Time adjustment request is missing date.");
		}

		const adjustmentDate =
			adjustmentDateRaw instanceof Date ? adjustmentDateRaw : new Date(adjustmentDateRaw);
		if (Number.isNaN(adjustmentDate.getTime())) {
			throw new Error("Time adjustment request has an invalid date.");
		}

		const reconciliation = await applyApprovedTimeAdjustmentReconciliation({
			prisma,
			organizationId: requestData.organizationId,
			requestId,
			employeeId,
			date: adjustmentDate,
		});

		await prisma.request.update({
			where: { id: requestId },
			data: {
				metadata: {
					...metadata,
					timeAdjustmentReconciliation: {
						attendanceResults: reconciliation.attendanceResults,
						timesheetResults: reconciliation.timesheetResults,
						reconciledAt: now.toISOString(),
					},
				},
			},
		});

		requestLogger.info(
			`Reconciled approved time adjustment request ${requestId}: ${reconciliation.attendanceResults.length} attendance day(s), ${reconciliation.timesheetResults.length} timesheet refresh result(s)`,
		);

		await invalidateCache.byPattern("cache:attendance:list:*");
		await invalidateCache.byPattern(`cache:attendance:employee:${employeeId}:*`);
		await invalidateCache.byPattern(`cache:request:byId:${requestId}:*`);

		return reconciliation;
	};

	const applyLeaveApprovalSideEffects = async (params: {
		requestId: string;
		requestData: any;
		now: Date;
		actingEmployeeId?: string | null;
	}) => {
		const { requestId, requestData, now, actingEmployeeId } = params;
		// LEAVE event contract:
		// Request is the workflow source of truth, and requesterId is the leave owner.
		// When a leave request becomes APPROVED/COMPLETED, this post-action must update every
		// live attendance read model that users expect to see immediately:
		// - employee leave balance
		// - calendar leave event
		// - raw/effective LEAVE attendance rows
		// - AttendanceObligation rows consumed by /hr/attendance stat cards and table
		// - mutable draft/revised/rejected timesheet snapshots derived from obligations
		// Locked submitted/approved timesheet snapshots are preserved and surfaced as
		// adjustment-required follow-up instead of being silently rewritten.
		const { leaveType, totalDays, durationUnit, halfDaySession } =
			getLeaveMetadata(requestData);

		if (!leaveType || totalDays <= 0) {
			throw new Error("Leave metadata must include leaveType and totalDays.");
		}

		const employee = await prisma.employee.findUnique({
			where: { id: requestData.requesterId },
			select: {
				id: true,
				leaveBalances: true,
				organizationId: true,
				embeddedSchedule: true,
				employmentType: true,
				person: {
					select: {
						personalInfo: true,
					},
				},
			},
		});

		if (!employee || !employee.leaveBalances) {
			throw new Error("Requester leave profile not found.");
		}

		await validateLeaveRequestAgainstPolicyOrThrow({
			organizationId: employee.organizationId,
			requestLike: requestData,
			employmentType: employee.employmentType,
			now,
		});

		const leaveBalances = employee.leaveBalances as any[];
		const balanceIndex = leaveBalances.findIndex(
			(balance: any) => balance.leaveType === leaveType,
		);
		if (balanceIndex === -1) {
			throw new Error(`No leave balance found for ${leaveType}.`);
		}

		const balance = leaveBalances[balanceIndex];
		const availableBalance = Number(balance.available || 0);
		if (availableBalance < totalDays) {
			throw new Error(
				`Insufficient ${leaveType} balance. Requested ${totalDays}, available ${availableBalance}.`,
			);
		}

		let sessionWindowStart: string | null | undefined;
		let sessionWindowEnd: string | null | undefined;

		if (durationUnit === "HALF_DAY") {
			const sessionWindow = validateHalfDayLeaveAndResolveWindow({
				startDate: requestData.startDate,
				endDate: requestData.endDate,
				employeeSchedule: resolveEmployeeActiveSchedule(
					employee,
					requestData.startDate || undefined,
				),
				halfDaySession,
				totalDays,
				now,
			});
			sessionWindowStart = sessionWindow.windowStart;
			sessionWindowEnd = sessionWindow.windowEnd;
		}

		const updatedBalance = {
			...balance,
			used: Number(balance.used || 0) + totalDays,
			available: Math.max(
				0,
				Number(balance.totalEntitled || 0) -
					(Number(balance.used || 0) + totalDays) -
					Number(balance.pending || 0),
			),
		};
		leaveBalances[balanceIndex] = updatedBalance;

		await prisma.employee.update({
			where: { id: employee.id },
			data: {
				leaveBalances: leaveBalances,
				leaveBalancesLastUpdated: now,
			},
		});

		requestLogger.info(
			`Leave balance updated for employee ${employee.id}: ${leaveType} used ${totalDays} days`,
		);

		const firstName = employee.person?.personalInfo?.firstName || "Employee";
		const lastName = employee.person?.personalInfo?.lastName || "";
		const employeeName = `${firstName} ${lastName}`.trim();
		const leaveStartDate = requestData.startDate || now;
		const leaveEndDate =
			durationUnit === "HALF_DAY" ? requestData.startDate || now : requestData.endDate || now;
		const leaveYear = new Date(leaveStartDate).getFullYear();

		const calendarTitle =
			durationUnit === "HALF_DAY" && halfDaySession
				? `${leaveType} Leave (${halfDaySession}) - ${employeeName}`
				: `${leaveType} Leave - ${employeeName}`;

		await prisma.calendarItem.create({
			data: {
				organizationId: employee.organizationId,
				year: leaveYear,
				title: calendarTitle,
				description: requestData.description || "",
				type: "EVENT",
				startDate: leaveStartDate,
				endDate: leaveEndDate,
				isAllDay: true,
			},
		});

		requestLogger.info(`Calendar item created for approved leave request ${requestId}`);

		const reconciliation = await applyApprovedLeaveAttendanceReconciliation({
			prisma,
			organizationId: employee.organizationId,
			requestId,
			employeeId: employee.id,
			startDate: leaveStartDate,
			endDate: leaveEndDate,
			employeeSchedule: resolveEmployeeActiveSchedule(employee, leaveStartDate),
			leaveType,
			notes: requestData.description || `${leaveType} Leave - Approved`,
			actorEmployeeId: actingEmployeeId || null,
			durationUnit,
			halfDaySession,
			sessionWindowStart,
			sessionWindowEnd,
		});

		await prisma.request.update({
			where: { id: requestId },
			data: {
				metadata: {
					...getSafeMetadataObject(requestData.metadata),
					leaveAttendanceReconciliation: {
						attendanceResults: reconciliation.attendanceResults,
						timesheetResults: reconciliation.timesheetResults,
						reconciledAt: now.toISOString(),
					},
				},
			},
		});

		requestLogger.info(
			`Reconciled approved leave request ${requestId}: ${reconciliation.attendanceResults.length} attendance day(s), ${reconciliation.timesheetResults.length} timesheet refresh result(s)`,
		);

		await invalidateCache.byPattern("cache:attendance:list:*");
		await invalidateCache.byPattern(`cache:attendance:employee:${employee.id}:*`);
		await invalidateCache.byPattern(`cache:request:byId:${requestId}:*`);
	};

	const create = async (req: AuthRequest, res: Response, _next: NextFunction) => {
		let requestData = req.body;
		const contentType = req.get("Content-Type") || "";

		if (
			contentType.includes("application/x-www-form-urlencoded") ||
			contentType.includes("multipart/form-data")
		) {
			requestLogger.info("Original form data:", JSON.stringify(req.body, null, 2));
			requestData = transformFormDataToObject(req.body);
			requestLogger.info(
				"Transformed form data to object structure:",
				JSON.stringify(requestData, null, 2),
			);
		}

		// Log the request data before validation to see what's being passed
		requestLogger.info("Request data before validation:", JSON.stringify(requestData, null, 2));

		const validation = CreateRequestSchema.safeParse(requestData);
		if (!validation.success) {
			const formattedErrors = formatZodErrors(validation.error.format());
			requestLogger.error(`Validation failed: ${JSON.stringify(formattedErrors)}`);
			const errorResponse = buildErrorResponse("Validation failed", 400, formattedErrors);
			res.status(400).json(errorResponse);
			return;
		}

		try {
			// Get organizationId from the request body or user context
			const organizationId =
				validation.data.organizationId || (req as any).user?.organizationId;

			if (!organizationId) {
				requestLogger.error("Organization ID is required");
				const errorResponse = buildErrorResponse("Organization ID is required", 400);
				res.status(400).json(errorResponse);
				return;
			}

			const actingEmployeeId = await getActingEmployeeId(req, organizationId);
			if (actingEmployeeId) {
				validation.data.requesterId = actingEmployeeId;
			}

			// Ensure requesterId is provided
			if (!validation.data.requesterId) {
				requestLogger.error("Requester ID is required");
				const errorResponse = buildErrorResponse("Requester ID is required", 400);
				res.status(400).json(errorResponse);
				return;
			}

			// Get user role from JWT
			const userRole = req.role;
			if (!userRole) {
				requestLogger.error("User role is required to determine reviewers");
				const errorResponse = buildErrorResponse(
					"User role not found in request. Please ensure you are authenticated.",
					401,
				);
				res.status(401).json(errorResponse);
				return;
			}

			// Check for existing active resignation request if type is RESIGNATION
			if (validation.data.type === "RESIGNATION") {
				const existingResignation = await prisma.request.findFirst({
					where: {
						requesterId: validation.data.requesterId,
						type: "RESIGNATION",
						currentWorkflowStateKey: {
							in: ["OPEN", "SUBMITTED", "APPROVED"],
						},
						isDeleted: false,
					},
				});

				if (existingResignation) {
					requestLogger.warn(
						`Attempt to create duplicate resignation request for user ${validation.data.requesterId}`,
					);
					const errorResponse = buildErrorResponse(
						"You already have an active resignation request. You cannot create another one while your current request is pending, processing, or approved.",
						409,
					);
					res.status(409).json(errorResponse);
					return;
				}
			}

			if (validation.data.type === "DOCUMENT_REQUEST") {
				const requestedDocumentType = normalizeDocumentRequestType(validation.data.metadata);
				if (!requestedDocumentType) {
					const errorResponse = buildErrorResponse("Document type is required", 400, [
						{
							field: "metadata.documentType",
							message: "Document type is required",
						},
					]);
					res.status(400).json(errorResponse);
					return;
				}
				const requestedDuplicateSignature = buildDocumentRequestDuplicateSignature({
					description: validation.data.description,
					notes: validation.data.notes,
					metadata: validation.data.metadata,
				});

				const activeDocumentRequests = await prisma.request.findMany({
					where: {
						organizationId,
						requesterId: validation.data.requesterId,
						type: "DOCUMENT_REQUEST",
						currentWorkflowStateKey: {
							in: PENDING_DOCUMENT_DUPLICATE_REQUEST_STATES,
						},
						isDeleted: false,
					},
					select: {
						id: true,
						code: true,
						description: true,
						notes: true,
						metadata: true,
					},
				});
				const existingDocumentRequest = activeDocumentRequests.find(
					(request) =>
						buildDocumentRequestDuplicateSignature(request) ===
						requestedDuplicateSignature,
				);
				if (existingDocumentRequest) {
					const errorResponse = buildErrorResponse(
						`A matching ${requestedDocumentType.replace(/_/g, " ")} document request is still pending approval.`,
						409,
						[
							{
								field: "metadata",
								message: `A matching pending document request already exists (${existingDocumentRequest.code || existingDocumentRequest.id}).`,
							},
						],
					);
					res.status(409).json(errorResponse);
					return;
				}
			}

			// Get requester details including reportTo
			const requester = await prisma.employee.findUnique({
				where: {
					id: validation.data.requesterId,
					isDeleted: false,
				},
				select: {
					id: true,
					organizationId: true,
					role: true,
					departmentId: true,
					reportToId: true,
					department: {
						select: {
							id: true,
							name: true,
							managerId: true,
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

			if (!requester) {
				requestLogger.error(`Requester not found: ${validation.data.requesterId}`);
				const errorResponse = buildErrorResponse("Requester not found", 404);
				res.status(404).json(errorResponse);
				return;
			}

			// Debug logging for reportTo
			requestLogger.info(
				`Requester ${requester.id} - reportToId: ${requester.reportToId}, reportTo.id: ${requester.reportTo?.id}`,
			);

			if (PAN_REQUEST_TYPES.has(String(validation.data.type || "").toUpperCase())) {
				const targetEmployeeId = String(validation.data.targetEmployeeId || "").trim();
				if (!targetEmployeeId) {
					const errorResponse = buildErrorResponse(
						"Target employee is required for personnel action requests",
						400,
					);
					res.status(400).json(errorResponse);
					return;
				}

				const targetEmployee = await prisma.employee.findFirst({
					where: {
						id: targetEmployeeId,
						organizationId,
						isDeleted: false,
					},
					select: {
						id: true,
						employeeId: true,
						reportToId: true,
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
						departmentId: true,
						positionId: true,
						levelId: true,
						basicSalary: true,
						employmentStatus: true,
						employmentType: true,
						probationEndDate: true,
						workLocation: true,
						person: {
							select: {
								personalInfo: true,
							},
						},
						department: {
							select: {
								id: true,
								name: true,
								managerId: true,
							},
						},
						position: {
							select: {
								id: true,
								title: true,
							},
						},
						level: {
							select: {
								id: true,
								name: true,
							},
						},
					},
				});

				if (!targetEmployee) {
					const errorResponse = buildErrorResponse("Target employee not found", 404);
					res.status(404).json(errorResponse);
					return;
				}

				const existingActivePanRequest = await prisma.request.findFirst({
					where: {
						organizationId,
						type: validation.data.type,
						targetEmployeeId,
						currentWorkflowStateKey: {
							in: ACTIVE_DUPLICATE_REQUEST_STATES,
						},
						isDeleted: false,
					},
					select: {
						id: true,
						code: true,
						type: true,
					},
				});
				if (existingActivePanRequest) {
					const requestTypeLabel = String(existingActivePanRequest.type || "PAN")
						.replace(/_/g, " ")
						.toLowerCase()
						.replace(/\b\w/g, (char) => char.toUpperCase());
					const errorResponse = buildErrorResponse(
						`An active ${requestTypeLabel} request already exists for this employee.`,
						409,
						[
							{
								field: "targetEmployeeId",
								message: `This employee already has an active ${requestTypeLabel} request (${existingActivePanRequest.code || existingActivePanRequest.id}).`,
							},
						],
					);
					res.status(409).json(errorResponse);
					return;
				}

				const requesterRole = String(requester.role || userRole || "")
					.trim()
					.toLowerCase();
				const isPrivilegedPanRequester = PAN_REQUESTER_BYPASS_ROLES.has(requesterRole);
				const requestedPanType = String(validation.data.type || "")
					.trim()
					.toUpperCase();
				if (
					!isPrivilegedPanRequester &&
					!MANAGER_INITIATED_PAN_REQUEST_TYPES.has(requestedPanType)
				) {
					const errorResponse = buildErrorResponse(
						"Only HR can initiate this personnel action type.",
						403,
					);
					res.status(403).json(errorResponse);
					return;
				}
				const isTargetInRequesterReportingTree =
					isPrivilegedPanRequester ||
					(await isEmployeeInReportingTree({
						prisma,
						managerEmployeeId: requester.id,
						targetEmployeeId,
						organizationId: requester.organizationId,
					}));
				if (!isPrivilegedPanRequester && !isTargetInRequesterReportingTree) {
					const errorResponse = buildErrorResponse(
						"Managers can only submit personnel action requests within their reporting tree.",
						403,
					);
					res.status(403).json(errorResponse);
					return;
				}
				const panInitiatorFormRole = isPrivilegedPanRequester
					? getPanActorFormRole(requesterRole)
					: "MANAGER";

				const currentMetadata = getSafePanCreateMetadata(validation.data.metadata);
				const proposedValues = getSafeMetadataObject(currentMetadata.proposed_values);
				const targetName = targetEmployee.person?.personalInfo
					? `${targetEmployee.person.personalInfo.firstName || ""} ${targetEmployee.person.personalInfo.lastName || ""}`.trim()
					: "";
				const targetReportToName = targetEmployee.reportTo?.person?.personalInfo
					? `${targetEmployee.reportTo.person.personalInfo.firstName || ""} ${targetEmployee.reportTo.person.personalInfo.lastName || ""}`.trim()
					: "";
				validation.data.metadata = {
					...currentMetadata,
					effectiveDate: currentMetadata.effectiveDate ?? proposedValues.effectiveDate,
					regularizationDate:
						currentMetadata.regularizationDate ?? proposedValues.regularizationDate,
					newPosition: currentMetadata.newPosition ?? proposedValues.newPosition,
					newPositionId: currentMetadata.newPositionId ?? proposedValues.newPositionId,
					newSalary: currentMetadata.newSalary ?? proposedValues.newSalary,
					proposedSalary: currentMetadata.proposedSalary ?? proposedValues.proposedSalary,
					promotionLevel: currentMetadata.promotionLevel ?? proposedValues.promotionLevel,
					promotionLevelId:
						currentMetadata.promotionLevelId ?? proposedValues.promotionLevelId,
					newDepartment: currentMetadata.newDepartment ?? proposedValues.newDepartment,
					newDepartmentId:
						currentMetadata.newDepartmentId ?? proposedValues.newDepartmentId,
					newLocation: currentMetadata.newLocation ?? proposedValues.newLocation,
					newSupervisor: currentMetadata.newSupervisor ?? proposedValues.newSupervisor,
					newSupervisorId:
						currentMetadata.newSupervisorId ?? proposedValues.newSupervisorId,
					terminationType:
						currentMetadata.terminationType ??
						proposedValues.terminationType ??
						currentMetadata.type,
					lastWorkingDay: currentMetadata.lastWorkingDay ?? proposedValues.lastWorkingDay,
					panSubType: validation.data.type,
					applicationMode: "IMMEDIATE",
					applicationStatus: "PENDING_WORKFLOW_COMPLETION",
					initiatedByRole: panInitiatorFormRole,
					initiatedByEmployeeId: requester.id,
					initiatorRoleKey: requesterRole || null,
					targetEmployeeId,
					formActor: {
						employeeId: requester.id,
						role: requesterRole || null,
						formRole: panInitiatorFormRole,
						targetEmployeeId,
					},
					employee_snapshot: {
						id: targetEmployee.id,
						employeeId: targetEmployee.employeeId,
						name: targetName || targetEmployee.employeeId,
						department: targetEmployee.department?.name ?? null,
						departmentId: targetEmployee.departmentId,
						position: targetEmployee.position?.title ?? null,
						positionId: targetEmployee.positionId,
						level: targetEmployee.level?.name ?? null,
						levelId: targetEmployee.levelId,
						employmentStatus: targetEmployee.employmentStatus,
						employmentType: targetEmployee.employmentType,
						basicSalary: targetEmployee.basicSalary,
						reportToId: targetEmployee.reportToId ?? null,
						reportTo: targetReportToName || targetEmployee.reportTo?.employeeId || null,
						supervisorId: targetEmployee.reportToId ?? null,
						supervisor:
							targetReportToName || targetEmployee.reportTo?.employeeId || null,
					},
					current_values: {
						departmentId: targetEmployee.departmentId,
						positionId: targetEmployee.positionId,
						levelId: targetEmployee.levelId,
						employmentStatus: targetEmployee.employmentStatus,
						employmentType: targetEmployee.employmentType,
						probationEndDate: targetEmployee.probationEndDate,
						workLocation: targetEmployee.workLocation,
						basicSalary: targetEmployee.basicSalary,
						reportToId: targetEmployee.reportToId ?? null,
						reportTo: targetReportToName || targetEmployee.reportTo?.employeeId || null,
						supervisorId: targetEmployee.reportToId ?? null,
						supervisor:
							targetReportToName || targetEmployee.reportTo?.employeeId || null,
					},
				};
			}

			if (validation.data.type === "LEAVE") {
				const { leaveType, totalDays, durationUnit, halfDaySession } = getLeaveMetadata(
					validation.data,
				);
				const now = new Date();
				const leaveContextEmployee = await prisma.employee.findUnique({
					where: {
						id: validation.data.requesterId,
						isDeleted: false,
					},
					select: {
						id: true,
						embeddedSchedule: true,
						leaveBalances: true,
						employmentType: true,
					},
				});

				if (!leaveContextEmployee) {
					const errorResponse = buildErrorResponse("Requester not found", 404);
					res.status(404).json(errorResponse);
					return;
				}

				try {
					await validateLeaveRequestAgainstPolicyOrThrow({
						organizationId,
						requestLike: validation.data,
						employmentType: leaveContextEmployee.employmentType,
						now,
					});
				} catch (policyError) {
					const message =
						policyError instanceof Error
							? policyError.message
							: "Leave policy validation failed.";
					const errorResponse = buildErrorResponse(message, 400);
					res.status(400).json(errorResponse);
					return;
				}

				try {
					await validateLeaveDatesAgainstScheduleOrThrow({
						organizationId,
						employeeId: validation.data.requesterId,
						startDate: validation.data.startDate,
						endDate: validation.data.endDate,
					});
				} catch (scheduleError) {
					const message =
						scheduleError instanceof Error
							? scheduleError.message
							: "Leave cannot be filed on off days.";
					const errorResponse = buildErrorResponse(message, 400);
					res.status(400).json(errorResponse);
					return;
				}

				if (durationUnit === "HALF_DAY") {
					try {
						validateHalfDayLeaveAndResolveWindow({
							startDate: validation.data.startDate,
							endDate: validation.data.endDate,
							employeeSchedule: resolveEmployeeActiveSchedule(
								leaveContextEmployee,
								validation.data.startDate,
							),
							halfDaySession,
							totalDays,
							now,
						});
					} catch (halfDayValidationError) {
						const message =
							halfDayValidationError instanceof Error
								? halfDayValidationError.message
								: "Invalid half-day leave request.";
						const errorResponse = buildErrorResponse(message, 400);
						res.status(400).json(errorResponse);
						return;
					}
				}

				const leaveBalances = (leaveContextEmployee.leaveBalances as any[]) || [];
				const leaveBalance = leaveBalances.find(
					(balance) => balance.leaveType === leaveType,
				);
				if (
					durationUnit === "HALF_DAY" &&
					(!leaveBalance || Number(leaveBalance.available || 0) < 0.5)
				) {
					const errorResponse = buildErrorResponse(
						`Insufficient ${leaveType || "leave"} balance for half-day request. At least 0.5 day is required.`,
						400,
					);
					res.status(400).json(errorResponse);
					return;
				}
			}

			if (validation.data.type === "SCHEDULE_CHANGE") {
				const metadata = getSafeMetadataObject(validation.data.metadata);
				const requestedDate = String(
					metadata.effectiveDate || metadata.requestedDate || "",
				)
					.trim()
					.slice(0, 10);
				const shiftTypeId = String(metadata.shiftTypeId || "").trim();
				const payloadTimeSlots = Array.isArray(metadata.requestedTimeSlots)
					? metadata.requestedTimeSlots
							.map((slot: any) => ({
								type: String(slot?.type || "work").trim().toLowerCase() || "work",
								label: String(slot?.label || "Work Slot").trim() || "Work Slot",
								startTime: String(slot?.startTime || "").trim(),
								endTime: String(slot?.endTime || "").trim(),
							}))
							.filter((slot) => slot.startTime && slot.endTime)
					: [];

				if (!requestedDate) {
					const errorResponse = buildErrorResponse(
						"Schedule change requests require a date.",
						400,
					);
					res.status(400).json(errorResponse);
					return;
				}

				const shiftType = shiftTypeId
					? await prisma.shiftType.findFirst({
							where: {
								id: shiftTypeId,
								organizationId,
								isDeleted: false,
							},
							select: {
								id: true,
								name: true,
								code: true,
								isOff: true,
								isOvernight: true,
								timeSlots: true,
								shiftHour: true,
							},
						})
					: null;

				if (shiftTypeId && !shiftType) {
					const errorResponse = buildErrorResponse(
						"Requested shift type was not found.",
						400,
						[
							{
								field: "metadata.shiftTypeId",
								message: "Requested shift type was not found.",
							},
						],
					);
					res.status(400).json(errorResponse);
					return;
				}

				const shiftTypeTimeSlots = shiftType
					? (Array.isArray(shiftType.timeSlots) ? shiftType.timeSlots : [])
							.map((slot: any) => ({
								type: String(slot?.type || "work").trim().toLowerCase() || "work",
								label:
									String(slot?.label || "").trim() ||
									(String(slot?.type || "").toLowerCase() === "break"
										? "Break"
										: "Work Slot"),
								startTime: String(slot?.startTime || "").trim(),
								endTime: String(slot?.endTime || "").trim(),
							}))
							.filter((slot) => slot.startTime && slot.endTime)
					: [];
				const requestedTimeSlots = payloadTimeSlots.length
					? payloadTimeSlots
					: shiftTypeTimeSlots;
				const hasRequestedWorkSlot = requestedTimeSlots.some(
					(slot) => slot.type === "work",
				);

				if (!shiftType && !hasRequestedWorkSlot) {
					const errorResponse = buildErrorResponse(
						"Flexitime schedule change requests require a requested start and end time.",
						400,
						[
							{
								field: "metadata.requestedTimeSlots",
								message:
									"Add a flexitime work window before submitting the request.",
							},
						],
					);
					res.status(400).json(errorResponse);
					return;
				}

				if (shiftType && !shiftType.isOff && !hasRequestedWorkSlot) {
					const errorResponse = buildErrorResponse(
						"Selected shift type has no configured work time slots.",
						400,
						[
							{
								field: "metadata.shiftTypeId",
								message:
									"Choose a shift type with work slots or use Flexitime.",
							},
						],
					);
					res.status(400).json(errorResponse);
					return;
				}

				const requestedWorkSlots = requestedTimeSlots.filter(
					(slot) => slot.type === "work",
				);
				const requestedBreakMinutes = requestedTimeSlots
					.filter((slot) => slot.type === "break")
					.reduce((total, slot) => {
						const [startHour, startMinute] = String(slot.startTime).split(":").map(Number);
						const [endHour, endMinute] = String(slot.endTime).split(":").map(Number);
						if (
							!Number.isFinite(startHour) ||
							!Number.isFinite(startMinute) ||
							!Number.isFinite(endHour) ||
							!Number.isFinite(endMinute)
						) {
							return total;
						}
						const start = startHour * 60 + startMinute;
						const end = endHour * 60 + endMinute;
						return total + Math.max(0, end <= start ? end + 24 * 60 - start : end - start);
					}, 0);
				const firstWorkSlot = requestedWorkSlots[0];
				const lastWorkSlot = requestedWorkSlots[requestedWorkSlots.length - 1];
				const requestedShiftIsOff = !hasRequestedWorkSlot && Boolean(shiftType?.isOff);
				const requestedShiftHour = calculateShiftHour({
					isOff: requestedShiftIsOff,
					timeSlots: requestedTimeSlots,
				});
				const requestedScheduleIsOvernight = requestedWorkSlots.length
					? requestedWorkSlots.some((slot) => {
							const [startHour, startMinute] = String(slot.startTime).split(":").map(Number);
							const [endHour, endMinute] = String(slot.endTime).split(":").map(Number);
							if (
								!Number.isFinite(startHour) ||
								!Number.isFinite(startMinute) ||
								!Number.isFinite(endHour) ||
								!Number.isFinite(endMinute)
							) {
								return false;
							}
							return endHour * 60 + endMinute <= startHour * 60 + startMinute;
					  })
					: Boolean(shiftType?.isOvernight);
				const requestedScheduleSnapshot = {
					source: shiftType ? "requested_shift_copy" : "requested_flexitime",
					shiftTypeId: shiftType?.id || null,
					shiftTypeName: shiftType
						? String(metadata.shiftTypeName || shiftType.name)
						: String(metadata.shiftTypeName || metadata.shiftTypeLabel || "Flexitime"),
					shiftTypeCode: shiftType
						? String(metadata.shiftTypeCode || shiftType.code)
						: String(metadata.shiftTypeCode || "FLEXITIME"),
					name: shiftType
						? String(metadata.shiftTypeName || shiftType.name)
						: String(metadata.shiftTypeName || metadata.shiftTypeLabel || "Flexitime"),
					code: shiftType
						? String(metadata.shiftTypeCode || shiftType.code)
						: String(metadata.shiftTypeCode || "FLEXITIME"),
					isOff: requestedShiftIsOff,
					isOvernight: requestedScheduleIsOvernight,
					breakMinutes: requestedBreakMinutes,
					startTime:
						String(metadata.manualStartTime || firstWorkSlot?.startTime || "").trim() ||
						null,
					endTime:
						String(metadata.manualEndTime || lastWorkSlot?.endTime || "").trim() ||
						null,
					timeSlots: requestedTimeSlots,
					shiftHour: requestedShiftHour,
				};

				const activeScheduleChange = await prisma.request.findFirst({
					where: {
						organizationId,
						requesterId: validation.data.requesterId,
						type: "SCHEDULE_CHANGE",
						currentWorkflowStateKey: {
							in: ACTIVE_DUPLICATE_REQUEST_STATES,
						},
						isDeleted: false,
						startDate: {
							gte: new Date(`${requestedDate}T00:00:00.000Z`),
							lte: new Date(`${requestedDate}T23:59:59.999Z`),
						},
					},
					select: {
						id: true,
						code: true,
					},
				});

				if (activeScheduleChange) {
					const errorResponse = buildErrorResponse(
						"A schedule change request for this date is already pending.",
						409,
						[
							{
								field: "metadata.requestedDate",
								message: `A pending schedule change request already exists (${activeScheduleChange.code || activeScheduleChange.id}).`,
							},
						],
					);
					res.status(409).json(errorResponse);
					return;
				}

				validation.data.metadata = {
					...metadata,
					effectiveDate: requestedDate,
					requestedDate,
					requestMode: shiftType ? "SHIFT_TYPE" : "FLEXITIME",
					shiftTypeId: shiftType?.id || null,
					shiftTypeName: requestedScheduleSnapshot.shiftTypeName,
					shiftTypeCode: requestedScheduleSnapshot.shiftTypeCode,
					shiftTypeIsOff: requestedScheduleSnapshot.isOff,
					shiftTypeIsOvernight: requestedScheduleSnapshot.isOvernight,
					shiftHour: requestedScheduleSnapshot.shiftHour,
					requestedTimeSlots,
					requestedScheduleSnapshot,
					manualStartTime:
						String(metadata.manualStartTime || firstWorkSlot?.startTime || "")
							.trim() || null,
					manualEndTime:
						String(metadata.manualEndTime || lastWorkSlot?.endTime || "")
							.trim() || null,
					reason: String(metadata.reason || validation.data.description || "").trim(),
					requestSource: "EMPLOYEE_SELF_SERVICE",
				};
			}

			const requestMetadata = getSafeMetadataObject(validation.data.metadata);
			const isHiringRequisition = isHiringRequisitionRequest({
				type: validation.data.type,
				metadata: requestMetadata,
			});

			if (isHiringRequisition) {
				const settings = serializeWorkforceRecruitmentSetting(
					await getOrCreateWorkforceRecruitmentSetting(prisma, organizationId),
				);

				if (!settings.isEnabled) {
					const errorResponse = buildErrorResponse(
						"Workforce recruitment settings are disabled.",
						409,
					);
					res.status(409).json(errorResponse);
					return;
				}

				const requisition = getSafeMetadataObject(requestMetadata.requisition);
				const departmentId = String(
					requisition.departmentId || requester.departmentId || "",
				).trim();
				const sectionId = String(
					requisition.sectionId || requester.sectionId || "",
				).trim();
				const positionId = String(requisition.positionId || "").trim();
				const levelId = String(requisition.levelId || "").trim();
				const requestedHeadcount = Math.max(
					0,
					Math.floor(Number(requisition.requestedHeadcount || 0)),
				);
				const justification = String(requisition.justification || "").trim();
				const isDepartmentManager =
					Boolean(requester.department?.managerId) &&
					requester.department?.managerId === requester.id;
				const isPrivilegedRequester = PRIVILEGED_REQUISITION_REQUESTER_ROLES.has(
					String(requester.role || "")
						.trim()
						.toLowerCase(),
				);
				const requesterDepartmentId = String(requester.department?.id || "").trim();
				const isOwnDepartmentScope =
					!departmentId ||
					(requesterDepartmentId && requesterDepartmentId === departmentId);

				if (
					settings.enforceDepartmentManagerScope &&
					!isPrivilegedRequester &&
					(!isDepartmentManager || !isOwnDepartmentScope)
				) {
					const errorResponse = buildErrorResponse(
						isDepartmentManager && !isOwnDepartmentScope
							? "Department managers can only submit hiring requisitions for their own department."
							: "Only department managers or HR admins can submit hiring requisitions.",
						403,
					);
					res.status(403).json(errorResponse);
					return;
				}

				if (
					!departmentId ||
					!positionId ||
					requestedHeadcount <= 0 ||
					!justification
				) {
					const errorResponse = buildErrorResponse(
						"Hiring requisitions require department, position, requested headcount, and justification.",
						400,
					);
					res.status(400).json(errorResponse);
					return;
				}

				const policy = resolveWorkforcePolicy(settings, {
					departmentId,
					sectionId,
					positionId,
					levelId: levelId || null,
				});

				if (!policy) {
					const errorResponse = buildErrorResponse(
						"No workforce policy is configured for this department and position.",
						409,
					);
					res.status(409).json(errorResponse);
					return;
				}

				const currentHeadcount = await countCurrentHeadcount(prisma, {
					organizationId,
					departmentId,
					sectionId,
					positionId,
					levelId: levelId || null,
				});
				const projectedHeadcount = currentHeadcount + requestedHeadcount;

				if (projectedHeadcount > Number(policy.targetHeadcount || 0)) {
					const errorResponse = buildErrorResponse(
						`Hiring request exceeds company policy headcount. Current: ${currentHeadcount}, requested: ${requestedHeadcount}, target: ${policy.targetHeadcount}.`,
						409,
					);
					res.status(409).json(errorResponse);
					return;
				}

				validation.data.metadata = {
					...requestMetadata,
					requestSubtype: WORKFORCE_REQUISITION_REQUEST_SUBTYPE,
					workflowCode: String(
						requestMetadata.workflowCode ||
							policy.defaultWorkflowCode ||
							settings.defaultWorkflowCode ||
							WORKFORCE_REQUISITION_WORKFLOW_CODE,
					)
						.trim()
						.toUpperCase(),
					requisition: {
						...requisition,
						departmentId,
						sectionId: sectionId || null,
						positionId,
						levelId: levelId || null,
						requestedHeadcount,
						justification,
						currentHeadcount,
						projectedHeadcount,
						policySnapshot: {
							id: policy.id,
							targetHeadcount: policy.targetHeadcount,
							limitBehavior: policy.limitBehavior,
							autoCreateJobOnApproval:
								policy.autoCreateJobOnApproval ?? settings.autoCreateJobOnApproval,
						},
						jobType: requisition.jobType || policy.jobType || "HIRING_REQUISITION",
						jobLocation: requisition.jobLocation || policy.jobLocation || null,
						jobTags:
							Array.isArray(requisition.jobTags) && requisition.jobTags.length > 0
								? requisition.jobTags
								: policy.jobTags || [],
						jobDescription:
							String(
								requisition.jobDescription ||
									policy.jobDescriptionTemplate ||
									justification,
							).trim() || justification,
					},
				};
			}

			const preferredWorkflowCode =
				String(
					(validation.data.metadata as Record<string, any> | undefined)?.workflowCode ||
						"",
				)
					.trim()
					.toUpperCase() ||
				(validation.data.type === "OVERTIME"
					? REQUEST_WORKFLOW_CODES.OVERTIME_DEFAULT
					: undefined);
			const workflow = await getDefaultRequestWorkflow(
				prisma,
				organizationId,
				validation.data.type,
				preferredWorkflowCode,
			);
			if (!workflow) {
				requestLogger.error(
					`No active workflow found for request type: ${validation.data.type}`,
				);
				const errorResponse = buildErrorResponse(
					`No active workflow configured for ${validation.data.type} requests`,
					400,
				);
				res.status(400).json(errorResponse);
				return;
			}

			const requestCode = await generateRequestCode(prisma, organizationId);

			// Prepare request data, excluding fields that don't exist in Prisma schema
			const { requesterId, targetEmployeeId, ...requestDataFields } = validation.data;

			// Set default dates if not provided (e.g. for DOCUMENT_REQUEST)
			if (!requestDataFields.startDate) requestDataFields.startDate = new Date();
			if (!requestDataFields.endDate) requestDataFields.endDate = new Date();

			// Create request with generated code
			const requestData: Prisma.RequestCreateInput = {
				...requestDataFields,
				code: requestCode,
				organizationId,
				requester: {
					connect: {
						id: requesterId,
					},
				},
				...(targetEmployeeId && {
					targetEmployee: {
						connect: {
							id: targetEmployeeId,
						},
					},
				}),
			};

			const request = await prisma.$transaction(
				async (tx) => {
					const created = await tx.request.create({
						data: requestData,
					});

					await createRequestStepExecutions(tx, {
						organizationId,
						requestId: created.id,
						steps: workflow.steps,
						workflowStates: workflow.states,
						workflowCode: workflow.code,
						workflowName: workflow.name,
						workflowDescription: workflow.description,
						requestType: validation.data.type,
						requesterId,
						targetEmployeeId: targetEmployeeId ?? null,
						reportToId: requester.reportToId || requester.reportTo?.id,
					});

					return tx.request.findUnique({
						where: { id: created.id },
						include: {
							requester: {
								include: {
									person: true,
									department: true,
								},
							},
							workflowInstance: true,
							stepExecutions: true,
						},
					});
				},
				{
					maxWait: 10_000,
					timeout: 20_000,
				},
			);

			if (!request) {
				const errorResponse = buildErrorResponse("Failed to create request", 500);
				res.status(500).json(errorResponse);
				return;
			}

			requestLogger.info(
				`Request created successfully: ${request.id} with code: ${request.code}`,
			);

			logActivity(req, {
				userId: (req as any).user?.id || "unknown",
				action: config.ACTIVITY_LOG.REQUEST.ACTIONS.CREATE_REQUEST,
				description: `${config.ACTIVITY_LOG.REQUEST.DESCRIPTIONS.REQUEST_CREATED}: ${request.id}`,
				page: {
					url: req.originalUrl,
					title: config.ACTIVITY_LOG.REQUEST.PAGES.REQUEST_CREATION,
				},
			});

			logAudit(req, {
				userId: (req as any).user?.id || "unknown",
				action: config.AUDIT_LOG.ACTIONS.CREATE,
				resource: config.AUDIT_LOG.RESOURCES.REQUEST,
				severity: config.AUDIT_LOG.SEVERITY.LOW,
				entityType: config.AUDIT_LOG.ENTITY_TYPES.REQUEST,
				entityId: request.id,
				changesBefore: null,
				changesAfter: {
					id: request.id,
					createdAt: request.createdAt,
					updatedAt: request.updatedAt,
				},
				description: `${config.AUDIT_LOG.REQUEST.DESCRIPTIONS.REQUEST_CREATED}: ${request.id}`,
			});

			try {
				await invalidateCache.byPattern("cache:request:list:*");
				requestLogger.info("Request list cache invalidated after creation");
			} catch (cacheError) {
				requestLogger.warn(
					"Failed to invalidate cache after request creation:",
					cacheError,
				);
			}

			try {
				if (request.type === "DOCUMENT_REQUEST") {
					await publishDocumentRequestSubmittedNotification(
						prisma,
						(req as any).io,
						request.id,
						request.requesterId,
					);
					await publishDocumentRequestApprovalNeededNotification(
						prisma,
						(req as any).io,
						request.id,
						request.requesterId,
					);
				} else {
					await publishRequestCreatedNotification(
						prisma,
						(req as any).io,
						request.id,
						request.requesterId,
					);
				}
			} catch (notificationError) {
				requestLogger.warn(
					`Failed to publish request creation notification for ${request.id}: ${notificationError}`,
				);
			}

			const successResponse = buildSuccessResponse(
				config.SUCCESS.REQUEST.CREATED,
				request,
				201,
			);
			res.status(201).json(successResponse);
		} catch (error) {
			requestLogger.error(`${config.ERROR.REQUEST.CREATE_FAILED}: ${error}`);
			const errorResponse = buildErrorResponse(
				config.ERROR.COMMON.INTERNAL_SERVER_ERROR,
				500,
			);
			res.status(500).json(errorResponse);
		}
	};

	const getStatusesByType = async (req: AuthRequest, res: Response, _next: NextFunction) => {
		const { requestType } = req.params;

		try {
			if (!requestType) {
				res.status(400).json(buildErrorResponse("Request type is required", 400));
				return;
			}

			const workflowTemplate = await getDefaultRequestWorkflow(
				prisma,
				req.organizationId || "",
				requestType,
			);
			const states = normalizeStatesForResponse(
				Array.isArray(workflowTemplate?.states) ? workflowTemplate.states : [],
			);

			res.status(200).json(
				buildSuccessResponse("Workflow states retrieved", {
					states,
					statuses: states,
					workflowCode: workflowTemplate?.code || null,
					workflowName: workflowTemplate?.name || null,
				}),
			);
		} catch (error) {
			requestLogger.error(`Error getting statuses by request type: ${error}`);
			res.status(500).json(
				buildErrorResponse(config.ERROR.COMMON.INTERNAL_SERVER_ERROR, 500),
			);
		}
	};

	const approval = async (req: AuthRequest, res: Response, _next: NextFunction) => {
		const { id } = req.params;

		try {
			if (!id) {
				requestLogger.error(config.ERROR.QUERY_PARAMS.MISSING_ID);
				const errorResponse = buildErrorResponse(config.ERROR.QUERY_PARAMS.MISSING_ID, 400);
				res.status(400).json(errorResponse);
				return;
			}

			const validation = RequestApprovalSchema.safeParse(req.body);
			if (!validation.success) {
				const formattedErrors = formatZodErrors(validation.error.format());
				requestLogger.error(`Validation failed: ${JSON.stringify(formattedErrors)}`);
				const errorResponse = buildErrorResponse("Validation failed", 400, formattedErrors);
				res.status(400).json(errorResponse);
				return;
			}

			let existingRequest = await prisma.request.findFirst({ where: { id } });
			if (!existingRequest) {
				requestLogger.error(`${config.ERROR.REQUEST.NOT_FOUND}: ${id}`);
				const errorResponse = buildErrorResponse(config.ERROR.REQUEST.NOT_FOUND, 404);
				res.status(404).json(errorResponse);
				return;
			}

			if (existingRequest.type === "SCHEDULE_CHANGE") {
				const repairedScheduleStep = await repairScheduleChangeHrApprovalStepIfNeeded(
					prisma,
					id,
				);
				if (repairedScheduleStep) {
					const repairedRequest = await prisma.request.findFirst({ where: { id } });
					if (repairedRequest) {
						existingRequest = repairedRequest;
					}
				}
			}

			if (existingRequest.type === "ATTENDANCE_CORRECTION") {
				try {
					const repairedHrReview =
						await repairAttendanceCorrectionHrReviewIfHrAlreadyApproved(prisma, id);
					if (repairedHrReview) {
						const repairedRequest = await prisma.request.findFirst({ where: { id } });
						if (repairedRequest) {
							existingRequest = repairedRequest;
						}
					}
				} catch (repairError) {
					requestLogger.warn(
						`Attendance correction HR review repair failed for ${id}: ${repairError}`,
					);
				}
			}

			if (!isRequestActiveForDecision(existingRequest)) {
				const currentStateKey = getRequestStateKey(existingRequest);
				const msg = `cannot ${validation.data.action} when state is ${currentStateKey || "UNKNOWN"}`;
				requestLogger.warn(msg);
				const errorResponse = buildErrorResponse(msg, 409);
				res.status(409).json(errorResponse);
				return;
			}

			const now = new Date();
			const userId = req.userId || (req as any).user?.id || "unknown";
			let actingEmployeeIdForSideEffects: string | null = null;
			const isApprove = validation.data.action === "approve";
			const updateData: any = {};

			if (validation.data.comment) {
				updateData.notes = validation.data.comment;
			}

			let shouldRunApprovalSideEffects = false;

			if (existingRequest.workflowInstanceId || existingRequest.currentStepExecutionId) {
				const actingEmployeeId = await getActingEmployeeId(
					req,
					existingRequest.organizationId,
				);
				actingEmployeeIdForSideEffects = actingEmployeeId;
				if (!actingEmployeeId) {
					const errorResponse = buildErrorResponse(
						"Unable to determine the acting employee for workflow approval",
						401,
					);
					res.status(401).json(errorResponse);
					return;
				}
				const actingEmployee = await prisma.employee.findFirst({
					where: {
						id: actingEmployeeId,
						organizationId: existingRequest.organizationId,
						isDeleted: false,
					},
					select: {
						id: true,
						role: true,
					},
				});
				const actingEmployeeRole = String(actingEmployee?.role || "")
					.trim()
					.toLowerCase();

				if (existingRequest.currentStepExecutionId) {
					const currentStepExecution = await prisma.workflowStepExecution.findFirst({
						where: {
							id: existingRequest.currentStepExecutionId,
							requestId: id,
							status: "PENDING",
							isDeleted: false,
						},
						select: {
							id: true,
							stepName: true,
							stepType: true,
							assigneeType: true,
							assigneeId: true,
							isRequired: true,
							metadata: true,
						},
					});

					if (!currentStepExecution) {
						const errorResponse = buildErrorResponse(
							"No active pending workflow step found for this request",
							409,
						);
						res.status(409).json(errorResponse);
						return;
					}

					if (currentStepExecution.stepType === "TASK") {
						if (!isApprove) {
							const errorResponse = buildErrorResponse(
								"This request is on a TASK step and cannot be rejected from this endpoint",
								409,
							);
							res.status(409).json(errorResponse);
							return;
						}

						const { completeTaskStep } = await import(
							"../../helper/request-runtime.helper"
						);
						await completeTaskStep(
							prisma,
							id,
							currentStepExecution.stepName,
							actingEmployeeId,
						);

						const finalTaskRequest = await prisma.request.findUnique({
							where: { id },
							include: {
								requester: {
									select: {
										id: true,
										employeeId: true,
										leaveBalances: true,
										person: {
											select: {
												personalInfo: true,
											},
										},
									},
								},
							},
						});

						try {
							await invalidateCache.byPattern(`cache:request:byId:${id}:*`);
							await invalidateCache.byPattern("cache:request:list:*");
						} catch (cacheError) {
							requestLogger.warn(
								"Failed to invalidate cache after task completion:",
								cacheError,
							);
						}

						const successResponse = buildSuccessResponse(
							config.SUCCESS.REQUEST.UPDATED,
							{ request: finalTaskRequest },
							200,
						);
						res.status(200).json(successResponse);
						return;
					}

					const requesterForResolution = await prisma.employee.findUnique({
						where: { id: existingRequest.requesterId },
						select: {
							reportToId: true,
						},
					});

					const assigneeResolution = await resolveStepAssignee(prisma, {
						organizationId: existingRequest.organizationId,
						requesterId: existingRequest.requesterId,
						assigneeType: currentStepExecution.assigneeType,
						requesterReportToId: requesterForResolution?.reportToId ?? null,
						targetEmployeeId: existingRequest.targetEmployeeId ?? null,
						currentAssigneeId: currentStepExecution.assigneeId ?? null,
					});

					let activeAssigneeId = currentStepExecution.assigneeId ?? null;
					if (assigneeResolution.assigneeId !== activeAssigneeId || !activeAssigneeId) {
						const currentStepMetadata = getSafeMetadataObject(
							currentStepExecution.metadata,
						);
						const reassignmentMetadata = {
							...currentStepMetadata,
							approvalResolution: buildAssigneeResolutionMetadata(assigneeResolution),
						};

						await prisma.workflowStepExecution.update({
							where: { id: currentStepExecution.id },
							data: {
								assigneeId: assigneeResolution.assigneeId,
								metadata: reassignmentMetadata as Prisma.InputJsonValue,
							},
						});

						activeAssigneeId = assigneeResolution.assigneeId;
					}

					if (!activeAssigneeId && currentStepExecution.isRequired) {
						const errorResponse = buildErrorResponse(
							"No available approver found for the current workflow step. Please update reporting hierarchy or approver availability.",
							409,
						);
						res.status(409).json(errorResponse);
						return;
					}

					let isHrRoleDecision = false;

					if (currentStepExecution.stepType === "APPROVAL") {
						if (actingEmployeeId === existingRequest.requesterId) {
							const errorResponse = buildErrorResponse(
								"Self-approval is not allowed",
								403,
							);
							res.status(403).json(errorResponse);
							return;
						}

						isHrRoleDecision =
							currentStepExecution.assigneeType === "HR" &&
							HR_WORKFLOW_DECISION_ROLES.has(actingEmployeeRole);

						if (
							!isHrRoleDecision &&
							(!activeAssigneeId || activeAssigneeId !== actingEmployeeId)
						) {
							const errorResponse = buildErrorResponse(
								"Only the current assigned approver can decide this step",
								403,
							);
							res.status(403).json(errorResponse);
							return;
						}
					}

					const stepStatus = isApprove ? "APPROVED" : "REJECTED";
					const currentStepMetadata = getSafeMetadataObject(
						currentStepExecution.metadata,
					);
					const stepDecisionMetadata = {
						...currentStepMetadata,
						lastDecision: {
							status: stepStatus,
							decidedBy: actingEmployeeId,
							decidedAt: now.toISOString(),
						},
					};

					await prisma.workflowStepExecution.update({
						where: { id: currentStepExecution.id },
						data: {
							status: stepStatus,
							completedAt: now,
							comments: validation.data.comment || null,
							assigneeId: isHrRoleDecision ? actingEmployeeId : activeAssigneeId,
							metadata: stepDecisionMetadata as Prisma.InputJsonValue,
						},
					});
					await createRequestTransaction(prisma, {
						organizationId: existingRequest.organizationId,
						requestId: id,
						workflowInstanceId: existingRequest.workflowInstanceId ?? null,
						stepExecutionId: currentStepExecution.id,
						actorEmployeeId: actingEmployeeId,
						actorRole: req.role || null,
						actorType: resolveRequestTransactionActorType(req.role || null),
						eventCategory: RequestTransactionEventCategory.WORKFLOW,
						eventKey: isApprove
							? RequestTransactionEventKey.STEP_APPROVED
							: RequestTransactionEventKey.STEP_REJECTED,
						eventSource: "approval",
						title: isApprove ? "Step approved" : "Step rejected",
						description: `The active workflow step was ${isApprove ? "approved" : "rejected"}.`,
						comments: validation.data.comment || null,
						fromStateKey: existingRequest.currentWorkflowStateKey ?? null,
						toStateKey: isApprove ? null : "REJECTED",
						metadata: {
							stepType: currentStepExecution.stepType,
							assigneeType: currentStepExecution.assigneeType,
						},
					});
					requestLogger.info(
						`Updated step execution ${currentStepExecution.id} to ${stepStatus} for request ${id}`,
					);

					if (isApprove) {
						await updateRequestStepProgress(prisma, id, currentStepExecution.id);
						await autoCompleteSystemSteps(prisma, {
							requestId: id,
							changedByEmployeeId: actingEmployeeId,
							source: "approval_decision",
						});
						requestLogger.info(`Advanced workflow to next step for request ${id}`);

						const requestAfterProgress = await prisma.request.findUnique({
							where: { id },
							select: {
								currentStepExecutionId: true,
								currentWorkflowStateKey: true,
								organizationId: true,
								requesterId: true,
								targetEmployeeId: true,
								requester: {
									select: {
										reportToId: true,
									},
								},
							},
						});

						if (requestAfterProgress?.currentStepExecutionId) {
							const nextStepExecution = await prisma.workflowStepExecution.findFirst({
								where: {
									id: requestAfterProgress.currentStepExecutionId,
									requestId: id,
									status: "PENDING",
									isDeleted: false,
								},
								select: {
									id: true,
									assigneeType: true,
									assigneeId: true,
									metadata: true,
								},
							});

							if (nextStepExecution) {
								const nextResolution = await resolveStepAssignee(prisma, {
									organizationId: requestAfterProgress.organizationId,
									requesterId: requestAfterProgress.requesterId,
									assigneeType: nextStepExecution.assigneeType,
									requesterReportToId:
										requestAfterProgress.requester?.reportToId ?? null,
									targetEmployeeId: requestAfterProgress.targetEmployeeId ?? null,
									currentAssigneeId: nextStepExecution.assigneeId ?? null,
								});

								if (
									nextResolution.assigneeId !== nextStepExecution.assigneeId ||
									!nextStepExecution.assigneeId
								) {
									const nextStepMetadata = getSafeMetadataObject(
										nextStepExecution.metadata,
									);
									const nextResolutionMetadata = {
										...nextStepMetadata,
										approvalResolution:
											buildAssigneeResolutionMetadata(nextResolution),
									};

									await prisma.workflowStepExecution.update({
										where: { id: nextStepExecution.id },
										data: {
											assigneeId: nextResolution.assigneeId,
											metadata:
												nextResolutionMetadata as Prisma.InputJsonValue,
										},
									});
								}
							}
						}

						if (existingRequest.type === "ATTENDANCE_CORRECTION") {
							const completedHrReview =
								await completeAttendanceCorrectionHrReviewIfActorIsHr(prisma, {
									requestId: id,
									actingEmployeeId,
									actingEmployeeRole,
									comment:
										"Completed because HR already approved this request",
								});
							if (completedHrReview) {
								const completedRequest = await prisma.request.findUnique({
									where: { id },
									select: {
										currentWorkflowStateKey: true,
									},
								});
								updateData.currentWorkflowStateKey =
									getRequestStateKey(completedRequest) || "COMPLETED";
								shouldRunApprovalSideEffects = isRequestApprovedState(
									updateData.currentWorkflowStateKey,
								);
							}
						}

						if (!updateData.currentWorkflowStateKey) {
							updateData.currentWorkflowStateKey =
								getRequestStateKey(requestAfterProgress) || "APPROVED";

							// Document requests stay visible as approved after manager approval
							// while an HR TASK is still pending. Attendance correction no longer
							// stops there when HR already acted — see auto-complete above.
							if (
								existingRequest.type === "DOCUMENT_REQUEST" &&
								requestAfterProgress?.currentStepExecutionId
							) {
								const nextStepForDocumentFlow =
									await prisma.workflowStepExecution.findFirst({
										where: {
											id: requestAfterProgress.currentStepExecutionId,
											requestId: id,
											isDeleted: false,
										},
										select: {
											stepType: true,
										},
									});

								if (nextStepForDocumentFlow?.stepType === "TASK") {
									updateData.currentWorkflowStateKey = "APPROVED";
								}
							}
							shouldRunApprovalSideEffects = isRequestApprovedState(
								updateData.currentWorkflowStateKey,
							);
						}
					} else {
						updateData.currentWorkflowStateKey = "REJECTED";
						updateData.currentStepExecutionId = null;
						updateData.lastCompletedStepExecutionId = currentStepExecution.id;
						shouldRunApprovalSideEffects = false;
					}
				} else {
					shouldRunApprovalSideEffects =
						isApprove &&
						isRequestApprovedState(
							getRequestStateKey(updateData) || (isApprove ? "APPROVED" : "REJECTED"),
						);
					if (isApprove) {
						updateData.currentWorkflowStateKey = "APPROVED";
					} else {
						updateData.currentWorkflowStateKey = "REJECTED";
					}
				}
			} else {
				updateData.currentWorkflowStateKey = isApprove ? "APPROVED" : "REJECTED";
				shouldRunApprovalSideEffects =
					isApprove && isRequestApprovedState(updateData.currentWorkflowStateKey);
			}

			if (isApprove && shouldRunApprovalSideEffects && existingRequest.type === "LEAVE") {
				const { leaveType, totalDays, durationUnit, halfDaySession } =
					getLeaveMetadata(existingRequest);

				const leaveValidationEmployee = await prisma.employee.findUnique({
					where: {
						id: existingRequest.requesterId,
						isDeleted: false,
					},
					select: {
						embeddedSchedule: true,
						leaveBalances: true,
						employmentType: true,
					},
				});

				if (!leaveValidationEmployee) {
					const errorResponse = buildErrorResponse("Requester not found", 404);
					res.status(404).json(errorResponse);
					return;
				}

				const leaveBalances = (leaveValidationEmployee.leaveBalances as any[]) || [];
				const currentLeaveBalance = leaveBalances.find(
					(balance) => balance.leaveType === leaveType,
				);
				const availableBalance = Number(currentLeaveBalance?.available || 0);

				if (!leaveType || totalDays <= 0) {
					const errorResponse = buildErrorResponse(
						"Leave metadata must include leaveType and totalDays.",
						400,
					);
					res.status(400).json(errorResponse);
					return;
				}

				try {
					await validateLeaveRequestAgainstPolicyOrThrow({
						organizationId: existingRequest.organizationId,
						requestLike: existingRequest,
						employmentType: leaveValidationEmployee.employmentType,
						now,
					});
				} catch (policyError) {
					const message =
						policyError instanceof Error
							? policyError.message
							: "Leave policy validation failed.";
					const errorResponse = buildErrorResponse(message, 400);
					res.status(400).json(errorResponse);
					return;
				}

				if (availableBalance < totalDays) {
					const errorResponse = buildErrorResponse(
						`Insufficient ${leaveType} balance. Requested ${totalDays}, available ${availableBalance}.`,
						400,
					);
					res.status(400).json(errorResponse);
					return;
				}

				if (durationUnit === "HALF_DAY") {
					try {
						validateHalfDayLeaveAndResolveWindow({
							startDate: existingRequest.startDate,
							endDate: existingRequest.endDate,
							employeeSchedule:
								resolveEmployeeActiveSchedule(
									leaveValidationEmployee,
									existingRequest.startDate || undefined,
								),
							halfDaySession,
							totalDays,
							now,
						});
					} catch (halfDayValidationError) {
						const message =
							halfDayValidationError instanceof Error
								? halfDayValidationError.message
								: "Invalid half-day leave request.";
						const errorResponse = buildErrorResponse(message, 400);
						res.status(400).json(errorResponse);
						return;
					}
				}
			}

			// For final document approvals only, mark document as ready for generation.
			if (
				isApprove &&
				shouldRunApprovalSideEffects &&
				existingRequest.type === "DOCUMENT_REQUEST"
			) {
				const currentMetadata = (existingRequest.metadata as Record<string, any>) || {};
				updateData.metadata = {
					...currentMetadata,
					documentStatus: "READY_TO_GENERATE",
				};
			}

			const updatedRequest = await prisma.request.update({
				where: { id },
				data: updateData,
				include: {
					requester: {
						select: {
							id: true,
							employeeId: true,
							leaveBalances: true,
							person: {
								select: {
									personalInfo: true,
								},
							},
						},
					},
				},
			});

			if (getRequestStateKey(existingRequest) !== getRequestStateKey(updatedRequest)) {
				await createRequestTransaction(prisma, {
					organizationId: existingRequest.organizationId,
					requestId: id,
					workflowInstanceId: existingRequest.workflowInstanceId ?? null,
					actorEmployeeId: actingEmployeeIdForSideEffects,
					actorRole: req.role || null,
					actorType: resolveRequestTransactionActorType(req.role || null),
					eventCategory: RequestTransactionEventCategory.WORKFLOW,
					eventKey: RequestTransactionEventKey.WORKFLOW_STATE_CHANGED,
					eventSource: "approval",
					title: `Workflow state changed to ${updatedRequest.currentWorkflowStateKey || "UNKNOWN"}`,
					fromStateKey: existingRequest.currentWorkflowStateKey ?? null,
					toStateKey: updatedRequest.currentWorkflowStateKey ?? null,
					comments: validation.data.comment || null,
				});
			}

			// Sync timesheet operational state when request approval happens from the request workflow.
			if (existingRequest.type === "TIMESHEET") {
				const requestMetadata =
					(existingRequest.metadata as Record<string, any> | null | undefined) || {};
				const timesheetAction = String(requestMetadata.timesheetAction || "").toUpperCase();
				const timesheetId = String(requestMetadata.timesheetId || "");

				if (timesheetAction === "SUBMISSION" && timesheetId) {
					await syncTimesheetSubmissionDecision({
						requestData: existingRequest,
						isApprove,
						now,
						actingEmployeeId: actingEmployeeIdForSideEffects || null,
						comment: validation.data.comment || null,
					});
				}

				if (timesheetAction === "EDIT_PERMISSION" && timesheetId) {
					if (isApprove && shouldRunApprovalSideEffects) {
						await prisma.timesheet.updateMany({
							where: {
								id: timesheetId,
								organizationId: existingRequest.organizationId,
								isDeleted: false,
							},
							data: {
								editPermissionStatus: "APPROVED",
								editPermissionGrantedAt: now,
								editPermissionGrantedBy: actingEmployeeIdForSideEffects || null,
								editPermissionRejectedAt: null,
								editPermissionRejectedBy: null,
								editPermissionRejectionReason: null,
							},
						});
					}

					if (!isApprove) {
						await prisma.timesheet.updateMany({
							where: {
								id: timesheetId,
								organizationId: existingRequest.organizationId,
								isDeleted: false,
							},
							data: {
								editPermissionStatus: "REJECTED",
								editPermissionRejectedAt: now,
								editPermissionRejectedBy: actingEmployeeIdForSideEffects || null,
								editPermissionRejectionReason:
									validation.data.comment || "Rejected by approver",
							},
						});
					}
				}
			}

			// If workflow approval reaches APPROVED/COMPLETED, run the LEAVE post-action event.
			// This is what turns request approval into visible /hr/attendance rows/cards.
			if (shouldRunApprovalSideEffects && existingRequest.type === "LEAVE") {
				try {
					await applyLeaveApprovalSideEffects({
						requestId: id,
						requestData: existingRequest,
						now,
						actingEmployeeId: actingEmployeeIdForSideEffects || null,
					});
				} catch (error) {
					requestLogger.error(`Error processing leave approval side effects: ${error}`);
					// Don't fail the approval, just log the error
				}
			}

			if (existingRequest.type === "OVERTIME") {
				const shouldRunOvertimeSideEffects =
					shouldRunApprovalSideEffects ||
					(!isApprove && updateData.currentWorkflowStateKey === "REJECTED");
				if (shouldRunOvertimeSideEffects) {
					try {
						await applyOvertimeRequestApprovalSideEffects({
							prisma,
							organizationId: existingRequest.organizationId,
							requestId: id,
							requestMetadata:
								((existingRequest.metadata as Record<string, unknown> | null) ||
									{}) as Record<string, unknown>,
							isApprove: shouldRunApprovalSideEffects && isApprove,
							approverEmployeeId: actingEmployeeIdForSideEffects || null,
							rejectionReason: validation.data.comment || null,
						});
					} catch (error) {
						requestLogger.error(
							`Error processing overtime approval side effects: ${error}`,
						);
					}
				}
			}

			if (shouldRunApprovalSideEffects && existingRequest.type === "ATTENDANCE_CORRECTION") {
				try {
					await applyAttendanceCorrectionApprovalSideEffects({
						requestId: id,
						requestData: existingRequest,
						now,
						appliedByEmployeeId: actingEmployeeIdForSideEffects || null,
					});
				} catch (error) {
					requestLogger.error(
						`Error processing attendance correction approval side effects: ${error}`,
					);
				}
			}

			if (shouldRunApprovalSideEffects && existingRequest.type === "TIME_ADJUSTMENT") {
				try {
					await applyTimeAdjustmentApprovalSideEffects({
						requestId: id,
						requestData: existingRequest,
						now,
					});
				} catch (error) {
					requestLogger.error(
						`Error processing time adjustment approval side effects: ${error}`,
					);
				}
			}

			if (existingRequest.type === "PAYROLL_CORRECTION") {
				const shouldRunPayrollCorrectionSideEffects =
					shouldRunApprovalSideEffects ||
					(!isApprove && updateData.currentWorkflowStateKey === "REJECTED");
				if (shouldRunPayrollCorrectionSideEffects) {
					try {
						await applyPayrollCorrectionApprovalSideEffects({
							prisma,
							organizationId: existingRequest.organizationId,
							requestId: id,
							requestMetadata:
								((existingRequest.metadata as Record<string, unknown> | null) ||
									{}) as Record<string, unknown>,
							isApprove: shouldRunApprovalSideEffects && isApprove,
							approverEmployeeId: actingEmployeeIdForSideEffects || null,
							rejectionReason: validation.data.comment || null,
						});
					} catch (error) {
						requestLogger.error(
							`Error processing payroll correction approval side effects: ${error}`,
						);
					}
				}
			}

			if (shouldRunApprovalSideEffects && isHiringRequisitionRequest(existingRequest)) {
				try {
					await createHiringRequisitionJob({
						requestId: id,
						organizationId: existingRequest.organizationId,
						metadata: getSafeMetadataObject(existingRequest.metadata),
					});
				} catch (error) {
					requestLogger.error(
						`Error processing hiring requisition approval side effects: ${error}`,
					);
				}
			}

			// PAN side-effects are applied when the workflow reaches COMPLETED (step completion),
			// not at approval time, so we avoid premature personnel changes.

			// Refetch request to get updated workflow step info
			const finalRequest = await prisma.request.findUnique({
				where: { id },
				include: {
					requester: {
						select: {
							id: true,
							employeeId: true,
							leaveBalances: true,
							person: {
								select: {
									personalInfo: true,
								},
							},
						},
					},
				},
			});

			if (
				finalRequest &&
				isHiringRequisitionRequest(finalRequest) &&
				isRequestApprovedState(getRequestStateKey(finalRequest)) &&
				!String(getSafeMetadataObject(finalRequest.metadata).createdJobId || "").trim()
			) {
				try {
					await createHiringRequisitionJob({
						requestId: id,
						organizationId: finalRequest.organizationId,
						metadata: getSafeMetadataObject(finalRequest.metadata),
					});
				} catch (error) {
					requestLogger.error(
						`Failed final hiring requisition job reconciliation for ${id}: ${error}`,
					);
				}
			}

			try {
				await invalidateCache.byPattern(`cache:request:byId:${id}:*`);
				await invalidateCache.byPattern("cache:request:list:*");
				requestLogger.info(`Cache invalidated after request ${id} approval action`);
			} catch (cacheError) {
				requestLogger.warn("Failed to invalidate cache after approval action:", cacheError);
			}

			logActivity(req, {
				userId,
				action: config.ACTIVITY_LOG.REQUEST.ACTIONS.UPDATE_REQUEST,
				description: `${config.ACTIVITY_LOG.REQUEST.DESCRIPTIONS.REQUEST_UPDATED}: ${id}`,
				page: {
					url: req.originalUrl,
					title: config.ACTIVITY_LOG.REQUEST.PAGES.REQUEST_UPDATE,
				},
			});

			logAudit(req, {
				userId,
				action: config.AUDIT_LOG.ACTIONS.UPDATE,
				resource: config.AUDIT_LOG.RESOURCES.REQUEST,
				severity: config.AUDIT_LOG.SEVERITY.MEDIUM,
				entityType: config.AUDIT_LOG.ENTITY_TYPES.REQUEST,
				entityId: id,
				changesBefore: { currentWorkflowStateKey: existingRequest.currentWorkflowStateKey },
				changesAfter: { currentWorkflowStateKey: updatedRequest.currentWorkflowStateKey },
				description: `${config.AUDIT_LOG.REQUEST.DESCRIPTIONS.REQUEST_UPDATED}: ${id}`,
			});

			const notificationStatus = getRequestStateKey(finalRequest || updatedRequest);
			const requestType = (finalRequest || updatedRequest)?.type;
			if (
				notificationStatus === "SUBMITTED" ||
				notificationStatus === "APPROVED" ||
				Boolean((finalRequest || updatedRequest)?.currentStepExecutionId)
			) {
				try {
					if (requestType === "DOCUMENT_REQUEST") {
						await publishDocumentRequestApprovalNeededNotification(
							prisma,
							(req as any).io,
							id,
							actingEmployeeIdForSideEffects,
						);
					} else {
						await publishRequestCreatedNotification(
							prisma,
							(req as any).io,
							id,
							actingEmployeeIdForSideEffects,
						);
					}
				} catch (notificationError) {
					requestLogger.warn(
						`Failed to publish next approver notification for ${id}: ${notificationError}`,
					);
				}
			} else if (
				["APPROVED", "REJECTED", "COMPLETED", "CANCELLED"].includes(notificationStatus)
			) {
				try {
					if (requestType === "DOCUMENT_REQUEST" && notificationStatus === "COMPLETED") {
						await publishDocumentRequestCompletedNotification(
							prisma,
							(req as any).io,
							id,
							actingEmployeeIdForSideEffects,
						);
					} else {
						await publishRequestDecisionNotification(prisma, (req as any).io, {
							requestId: id,
							status: notificationStatus,
							sourceEmployeeId: actingEmployeeIdForSideEffects,
							comment: validation.data.comment || null,
						});
					}
				} catch (notificationError) {
					requestLogger.warn(
						`Failed to publish decision notification for ${id}: ${notificationError}`,
					);
				}
			}

			const successResponse = buildSuccessResponse(
				config.SUCCESS.REQUEST.UPDATED,
				{ request: finalRequest || updatedRequest },
				200,
			);
			res.status(200).json(successResponse);
		} catch (error) {
			requestLogger.error(`Approval endpoint failed: ${error}`);
			const errorResponse = buildErrorResponse(
				config.ERROR.COMMON.INTERNAL_SERVER_ERROR,
				500,
			);
			res.status(500).json(errorResponse);
		}
	};
	const getAll = async (req: Request, res: Response, _next: NextFunction) => {
		const validationResult = validateQueryParams(req, requestLogger);

		if (!validationResult.isValid) {
			res.status(400).json(validationResult.errorResponse);
			return;
		}

		const {
			page,
			limit,
			order,
			fields,
			searchFields,
			sort,
			skip,
			query,
			document,
			pagination,
			count,
			filter,
			groupBy,
		} = validationResult.validatedParams!;

		requestLogger.info(
			`Getting requests, page: ${page}, limit: ${limit}, query: ${query}, order: ${order}, groupBy: ${groupBy}`,
		);

		try {
			// Base where clause
			const whereClause: Prisma.RequestWhereInput = {
				isDeleted: false,
				// Filter out orphaned records where requester doesn't exist
				// This ensures all requests have a valid requester relation
				requester: {
					isDeleted: false,
				},
			};

			const defaultSearchFields = [
				"code",
				"description",
				"type",
				"requester.employeeId",
				"requester.person.personalInfo.firstName",
				"requester.person.personalInfo.lastName",
			];
			const searchFieldAliases: Record<string, string[]> = {
				ticketCode: ["code"],
				employeeId: ["requester.employeeId"],
				employeeName: [
					"requester.person.personalInfo.firstName",
					"requester.person.personalInfo.lastName",
				],
			};
			const allowedSearchFields = new Set([
				...defaultSearchFields,
				...Object.keys(searchFieldAliases),
			]);
			const resolvedSearchFields = (searchFields || "")
				.split(",")
				.map((field) => field.trim())
				.filter((field) => allowedSearchFields.has(field))
				.flatMap((field) => searchFieldAliases[field] || [field]);
			const activeSearchFields =
				resolvedSearchFields.length > 0
					? Array.from(new Set(resolvedSearchFields))
					: defaultSearchFields;

			if (query) {
				const searchConditions = buildSearchConditions(
					"Request",
					query,
					activeSearchFields,
				);
				if (searchConditions.length > 0) {
					whereClause.OR = searchConditions;
				}
			}

			const { filterWithoutSubtype, includeSubtypeFilters, excludeSubtypeFilters } =
				extractMetadataRequestSubtypeFilter(filter);

			if (filterWithoutSubtype) {
				const filterConditions = buildFilterConditions("Request", filterWithoutSubtype);
				if (filterConditions.length > 0) {
					appendRequestWhereCondition(whereClause, { AND: filterConditions });
				}
			}

			const approvalActorId = String(req.query.approvalActorId || "").trim();
			const approvalActorType = String(req.query.approvalActorType || "")
				.trim()
				.toUpperCase();
			if (approvalActorId || approvalActorType === "HR") {
				const stepWhere: Prisma.WorkflowStepExecutionWhereInput = {
					isDeleted: false,
					requestId: { not: null },
					...(approvalActorId
						? { assigneeId: approvalActorId }
						: { assigneeType: "HR" as any }),
				};
				if ((req as any).organizationId) {
					stepWhere.organizationId = (req as any).organizationId;
				}

				const actorStepRequests = await prisma.workflowStepExecution.findMany({
					where: stepWhere,
					select: { requestId: true },
				});
				const actorRequestIds = Array.from(
					new Set(
						actorStepRequests
							.map((step) => step.requestId)
							.filter((id): id is string => Boolean(id)),
					),
				);

				appendRequestWhereCondition(whereClause, {
					id: { in: actorRequestIds },
				});
			}

			const sanitizedFields = sanitizeRequestFields(fields);
			const hasSubtypeFilters =
				includeSubtypeFilters.length > 0 || excludeSubtypeFilters.length > 0;
			const ticketQueues = String(req.query.ticketQueues || "")
				.trim()
				.toLowerCase();

			if (ticketQueues === "hr") {
				try {
					await repairScheduleChangeHrApprovalQueueIfNeeded(prisma, {
						organizationId:
							(req as any).organizationId || (req as any).user?.organizationId || null,
					});
				} catch (repairError) {
					requestLogger.warn(
						`Schedule change HR approval queue repair skipped: ${repairError}`,
					);
				}

				const ticketTypeParam = String(req.query.ticketType || "")
					.trim()
					.toLowerCase();
				const departmentParam = String(req.query.departmentId || "all").trim();
				const managerParam = String(req.query.managerId || "all").trim();
				const queueLimit = parsePositiveIntegerQuery(req.query.queueLimit, limit);
				const queuePage = 1;
				const queueSkip = 0;

				const requestTypes =
					ticketTypeParam === "document"
						? ["DOCUMENT_REQUEST"]
						: ticketTypeParam === "job_requisition"
							? ["OTHER"]
							: ticketTypeParam === "personnel_action"
								? HR_TICKET_REQUEST_TYPES.filter(
										(type) => type !== "DOCUMENT_REQUEST" && type !== "OTHER",
									)
								: HR_TICKET_REQUEST_TYPES;

				const baseTicketFilters = [
					...requestTypes.map((type) => `type:${type}`),
					...(departmentParam && departmentParam !== "all"
						? [`requester.departmentId:${departmentParam}`]
						: []),
					...(managerParam && managerParam !== "all"
						? [`requester.reportToId:${managerParam}`]
						: []),
				];
				const baseIncludeSubtypeFilters = [...includeSubtypeFilters];
				const baseExcludeSubtypeFilters = [...excludeSubtypeFilters];

				if (ticketTypeParam === "job_requisition") {
					baseIncludeSubtypeFilters.push("DEPARTMENT_JOB_REQUISITION");
				}
				if (ticketTypeParam === "personnel_action") {
					baseExcludeSubtypeFilters.push("DEPARTMENT_JOB_REQUISITION");
				}

				const sectionFilterConfig = {
					approval: {
						sectionFilters: [
							"currentStepExecution.assigneeType:HR",
							"currentStepExecution.stepType!TASK",
							...HR_TICKET_ACTIVE_STATES.map(
								(state) => `currentWorkflowStateKey:${state}`,
							),
						],
						sort: "createdAt",
					},
					task: {
						sectionFilters: [
							"currentStepExecution.assigneeType:HR",
							"currentStepExecution.stepType:TASK",
							...HR_TICKET_TASK_STATES.map(
								(state) => `currentWorkflowStateKey:${state}`,
							),
						],
						sort: "createdAt",
					},
					recent: {
						sectionFilters: [
							"currentStepExecution:null",
							"stepExecutions.assigneeType:HR",
							...HR_TICKET_RECENT_STATES.map(
								(state) => `currentWorkflowStateKey:${state}`,
							),
						],
						sort: "lastCompletedStepExecution.completedAt",
					},
				} as const;

				const sectionConditions = Object.fromEntries(
					Object.entries(sectionFilterConfig).map(([section, config]) => [
						section,
						buildFilterConditions(
							"Request",
							[...baseTicketFilters, ...config.sectionFilters].join(","),
						),
					]),
				) as Record<"approval" | "task" | "recent", Prisma.RequestWhereInput[]>;

				const broadQueueWhereClause: Prisma.RequestWhereInput = {
					AND: [
						whereClause,
						{
							OR: Object.values(sectionConditions).map((conditions) => ({
								AND: conditions,
							})),
						},
					],
				};
				const queueIncludeSubtypeFilters = Array.from(new Set(baseIncludeSubtypeFilters));
				const queueExcludeSubtypeFilters = Array.from(new Set(baseExcludeSubtypeFilters));
				const queueHasSubtypeFilters =
					queueIncludeSubtypeFilters.length > 0 || queueExcludeSubtypeFilters.length > 0;
				const fieldsForQueueClassification = [
					"id",
					"type",
					"metadata",
					"currentWorkflowStateKey",
					"currentStepExecution.id",
					"currentStepExecution.stepType",
					"currentStepExecution.assigneeType",
					"lastCompletedStepExecution.completedAt",
					"stepExecutions.assigneeType",
				].join(",");
				const queueFields = Array.from(
					new Set(
						`${sanitizedFields || ""},${fieldsForQueueClassification}`
							.split(",")
							.map((field) => field.trim())
							.filter(Boolean),
					),
				).join(",");
				const findManyQuery = buildFindManyQuery(
					broadQueueWhereClause,
					0,
					Math.max(limit, queueLimit),
					order,
					sort,
					queueFields,
				);
				delete findManyQuery.skip;
				delete findManyQuery.take;

				const queueCandidates = document
					? await prisma.request.findMany(findManyQuery)
					: await prisma.request.findMany({
							where: broadQueueWhereClause,
							select: {
								id: true,
								type: true,
								metadata: true,
								currentWorkflowStateKey: true,
								currentStepExecution: {
									select: { id: true, stepType: true, assigneeType: true },
								},
								lastCompletedStepExecution: { select: { completedAt: true } },
								stepExecutions: { select: { assigneeType: true } },
							},
						});

				const filteredQueueCandidates = queueHasSubtypeFilters
					? queueCandidates.filter((request) =>
							matchesRequestSubtypeFilters(request.metadata, {
								includeSubtypeFilters: queueIncludeSubtypeFilters,
								excludeSubtypeFilters: queueExcludeSubtypeFilters,
							}),
						)
					: queueCandidates;

				const isSectionMatch = (request: any, section: "approval" | "task" | "recent") => {
					const state = String(request.currentWorkflowStateKey || "").toUpperCase();
					const currentStep = request.currentStepExecution;

					if (section === "approval") {
						return (
							currentStep?.assigneeType === "HR" &&
							currentStep?.stepType !== "TASK" &&
							HR_TICKET_ACTIVE_STATES.includes(state)
						);
					}

					if (section === "task") {
						return (
							currentStep?.assigneeType === "HR" &&
							currentStep?.stepType === "TASK" &&
							HR_TICKET_TASK_STATES.includes(state)
						);
					}

					return (
						!currentStep &&
						(request.stepExecutions || []).some(
							(step: any) => step.assigneeType === "HR",
						) &&
						HR_TICKET_RECENT_STATES.includes(state)
					);
				};
				const getTimeValue = (value: unknown) => {
					const time = value ? new Date(String(value)).getTime() : 0;
					return Number.isFinite(time) ? time : 0;
				};
				const sortByNewestCreated = (a: any, b: any) =>
					getTimeValue(b.createdAt) - getTimeValue(a.createdAt);
				const sortByNewestCompleted = (a: any, b: any) =>
					getTimeValue(
						b.lastCompletedStepExecution?.completedAt || b.updatedAt || b.createdAt,
					) -
					getTimeValue(
						a.lastCompletedStepExecution?.completedAt || a.updatedAt || a.createdAt,
					);
				const buildQueue = (
					section: "approval" | "task" | "recent",
					sorter: (a: any, b: any) => number,
				) => {
					const sectionRequests = filteredQueueCandidates
						.filter((request) => isSectionMatch(request, section))
						.sort(sorter);

					return {
						requests: document
							? sectionRequests.slice(queueSkip, queueSkip + queueLimit)
							: [],
						count: sectionRequests.length,
						pagination: buildPagination(sectionRequests.length, queuePage, queueLimit),
					};
				};

				const approvalQueue = buildQueue("approval", sortByNewestCreated);
				const taskQueue = buildQueue("task", sortByNewestCreated);
				const recentQueue = buildQueue("recent", sortByNewestCompleted);
				const categoryBreakdown = filteredQueueCandidates.reduce(
					(acc, request: any) => {
						const isJobRequisition =
							request.type === "OTHER" &&
							getRequestMetadataSubtype(request.metadata) ===
								"DEPARTMENT_JOB_REQUISITION";
						if (request.type === "DOCUMENT_REQUEST") {
							acc.document += 1;
						} else if (request.type === "SCHEDULE_CHANGE") {
							acc.scheduleChange += 1;
						} else if (isJobRequisition) {
							acc.jobRequisition += 1;
						} else {
							acc.personnelAction += 1;
						}
						return acc;
					},
					{ document: 0, personnelAction: 0, jobRequisition: 0, scheduleChange: 0 },
				);

				const responseData = {
					ticketQueues: {
						approval: approvalQueue,
						task: taskQueue,
						recent: recentQueue,
					},
					ticketSummary: {
						pending: approvalQueue.count + taskQueue.count,
						total: filteredQueueCandidates.length,
						approval: approvalQueue.count,
						task: taskQueue.count,
						recent: recentQueue.count,
						categoryBreakdown,
					},
					queueLimit,
				};

				res.status(200).json(
					buildSuccessResponse(config.SUCCESS.REQUEST.RETRIEVED_ALL, responseData, 200),
				);
				return;
			}

			let requests: any[] = [];
			let total = 0;

			if (hasSubtypeFilters) {
				const subtypeLookupQuery = buildFindManyQuery(
					whereClause,
					0,
					limit,
					order,
					sort,
					"id,metadata",
				);
				delete subtypeLookupQuery.skip;
				delete subtypeLookupQuery.take;

				const subtypeMatches = await prisma.request.findMany(subtypeLookupQuery);
				const filteredIds = subtypeMatches
					.filter((request) =>
						matchesRequestSubtypeFilters(request.metadata, {
							includeSubtypeFilters,
							excludeSubtypeFilters,
						}),
					)
					.map((request) => request.id);

				total = filteredIds.length;

				if (document && filteredIds.length > 0) {
					const pagedIds = filteredIds.slice(skip, skip + limit);
					const pagedQuery = buildFindManyQuery(
						{
							AND: [whereClause, { id: { in: pagedIds } }],
						},
						0,
						pagedIds.length,
						order,
						sort,
						sanitizedFields,
					);
					const pagedRequests = await prisma.request.findMany(pagedQuery);
					const requestById = new Map(
						pagedRequests.map((request) => [request.id, request]),
					);
					requests = pagedIds
						.map((id) => requestById.get(id))
						.filter((request): request is NonNullable<typeof request> =>
							Boolean(request),
						);
				}
			} else {
				const findManyQuery = buildFindManyQuery(
					whereClause,
					skip,
					limit,
					order,
					sort,
					sanitizedFields,
				);

				[requests, total] = await Promise.all([
					document ? prisma.request.findMany(findManyQuery) : [],
					count
						? prisma.request
								.findMany({ where: whereClause, select: { id: true } })
								.then((res) => res.length)
						: 0,
				]);
			}

			requestLogger.info(`Retrieved ${requests.length} requests`);
			const processedData =
				groupBy && document ? groupDataByField(requests, groupBy as string) : requests;

			const responseData: Record<string, any> = {
				...(document && { requests: processedData }),
				...(count && { count: total }),
				...(pagination && { pagination: buildPagination(total, page, limit) }),
				...(groupBy && { groupedBy: groupBy }),
			};

			res.status(200).json(
				buildSuccessResponse(config.SUCCESS.REQUEST.RETRIEVED_ALL, responseData, 200),
			);
		} catch (error) {
			requestLogger.error(`${config.ERROR.REQUEST.GET_ALL_FAILED}: ${error}`);
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
				requestLogger.error(config.ERROR.QUERY_PARAMS.MISSING_ID);
				const errorResponse = buildErrorResponse(config.ERROR.QUERY_PARAMS.MISSING_ID, 400);
				res.status(400).json(errorResponse);
				return;
			}

			if (fields && typeof fields !== "string") {
				requestLogger.error(`${config.ERROR.QUERY_PARAMS.INVALID_POPULATE}: ${fields}`);
				const errorResponse = buildErrorResponse(
					config.ERROR.QUERY_PARAMS.POPULATE_MUST_BE_STRING,
					400,
				);
				res.status(400).json(errorResponse);
				return;
			}

			requestLogger.info(`${config.SUCCESS.REQUEST.GETTING_BY_ID}: ${id}`);

			try {
				const repaired = await repairAttendanceCorrectionSupervisorWorkflowIfNeeded(
					prisma,
					id,
				);
				const repairedHrReview =
					await repairAttendanceCorrectionHrReviewIfHrAlreadyApproved(prisma, id);
				if (repaired || repairedHrReview) {
					await invalidateCache.byPattern(`cache:request:byId:${id}:*`);
					await invalidateCache.byPattern("cache:request:list:*");
				}
			} catch (repairError) {
				requestLogger.warn(
					`Attendance correction workflow repair failed for ${id}: ${repairError}`,
				);
			}

			const cacheKey = `cache:request:byId:${id}:${fields || "full"}`;
			let request = null;

			try {
				if (redisClient.isClientConnected()) {
					request = await redisClient.getJSON(cacheKey);
					if (request) {
						requestLogger.info(`Request ${id} retrieved from direct Redis cache`);
					}
				}
			} catch (cacheError) {
				requestLogger.warn(`Redis cache retrieval failed for request ${id}:`, cacheError);
			}

			if (!request) {
				const query: Prisma.RequestFindFirstArgs = {
					where: { id },
				};

				const sanitizedFields =
					typeof fields === "string" ? sanitizeRequestFields(fields) : undefined;

				query.select = getNestedFields(sanitizedFields);

				request = await prisma.request.findFirst(query);

				if (request && redisClient.isClientConnected()) {
					try {
						await redisClient.setJSON(cacheKey, request, 3600);
						requestLogger.info(`Request ${id} stored in direct Redis cache`);
					} catch (cacheError) {
						requestLogger.warn(
							`Failed to store request ${id} in Redis cache:`,
							cacheError,
						);
					}
				}
			}

			if (!request) {
				requestLogger.error(`${config.ERROR.REQUEST.NOT_FOUND}: ${id}`);
				const errorResponse = buildErrorResponse(config.ERROR.REQUEST.NOT_FOUND, 404);
				res.status(404).json(errorResponse);
				return;
			}

			requestLogger.info(`${config.SUCCESS.REQUEST.RETRIEVED}: ${(request as any).id}`);
			const successResponse = buildSuccessResponse(
				config.SUCCESS.REQUEST.RETRIEVED,
				request,
				200,
			);
			res.status(200).json(successResponse);
		} catch (error) {
			requestLogger.error(`${config.ERROR.REQUEST.ERROR_GETTING}: ${error}`);
			const errorResponse = buildErrorResponse(
				config.ERROR.COMMON.INTERNAL_SERVER_ERROR,
				500,
			);
			res.status(500).json(errorResponse);
		}
	};

	const processApprovalSideEffects = async (
		requestId: string,
		request: any,
		userId: string,
		req?: Request,
	) => {
		const now = new Date();
		const actingEmployeeId =
			req && (req as AuthRequest)
				? await getActingEmployeeId(req as AuthRequest, request.organizationId)
				: null;

		// If approved and it's a LEAVE request, deduct leave balance and create calendar item
		if (request.type === "LEAVE") {
			try {
				await applyLeaveApprovalSideEffects({
					requestId,
					requestData: request,
					now,
					actingEmployeeId: actingEmployeeId || null,
				});
			} catch (error) {
				requestLogger.error(`Error processing leave approval side effects: ${error}`);
				// Don't fail the approval, just log the error
			}
		}

		if (request.type === "ATTENDANCE_CORRECTION") {
			try {
				await applyAttendanceCorrectionApprovalSideEffects({
					requestId,
					requestData: request,
					now,
					appliedByEmployeeId: actingEmployeeId || null,
				});
			} catch (error) {
				requestLogger.error(
					`Error processing attendance correction approval side effects: ${error}`,
				);
			}
		}

		if (request.type === "TIME_ADJUSTMENT") {
			try {
				await applyTimeAdjustmentApprovalSideEffects({
					requestId,
					requestData: request,
					now,
				});
			} catch (error) {
				requestLogger.error(
					`Error processing time adjustment approval side effects: ${error}`,
				);
			}
		}

		// Handle PAN (Personnel Action Notice) requests
		const PAN_TYPES = [
			"REGULARIZATION",
			"PROMOTION",
			"SALARY_CHANGE",
			"TRANSFER",
			"TERMINATION",
		];
		if (PAN_TYPES.includes(request.type)) {
			try {
				const metadata = request.metadata as any;
				const targetEmployeeId = request.targetEmployeeId || request.requesterId;

				if (!targetEmployeeId) {
					requestLogger.warn(`No target employee found for PAN request ${requestId}`);
				} else {
					const employeeUpdateData: any = {};
					const effectiveDate = request.startDate || now;

					// Common updates if present in metadata
					if (metadata.newSalary) {
						const newSalary = parseFloat(metadata.newSalary);
						if (!isNaN(newSalary)) {
							employeeUpdateData.basicSalary = newSalary;
						}
					}

					switch (request.type) {
						case "PROMOTION":
							// Update Position
							if (metadata.newPosition) {
								// Try to find position by ID first, then by title
								let positionId = metadata.newPositionId;

								if (!positionId && metadata.newPosition) {
									// Lookup position by title
									const position = await prisma.position.findFirst({
										where: {
											title: {
												equals: metadata.newPosition,
												mode: "insensitive",
											},
											isDeleted: false,
										},
									});
									if (position) {
										positionId = position.id;
									}
								}

								if (positionId) {
									employeeUpdateData.positionId = positionId;
								} else {
									requestLogger.warn(
										`Could not find position '${metadata.newPosition}' for promotion request ${requestId}`,
									);
								}
							}
							if (metadata.promotionLevel || metadata.promotionLevelId) {
								let levelId = metadata.promotionLevelId;

								if (!levelId && metadata.promotionLevel) {
									const level = await prisma.level.findFirst({
										where: {
											name: {
												equals: metadata.promotionLevel,
												mode: "insensitive",
											},
											organizationId: request.organizationId,
											isDeleted: false,
										},
									});
									if (level) {
										levelId = level.id;
									}
								}

								if (levelId) {
									employeeUpdateData.levelId = levelId;
								} else {
									requestLogger.warn(
										`Could not find level '${metadata.promotionLevel}' for promotion request ${requestId}`,
									);
								}
							}
							break;

						case "SALARY_CHANGE":
							// Salary already handled by common metadata.newSalary parsing above.
							break;

						case "TRANSFER":
							// Update Department
							if (metadata.newDepartment) {
								let departmentId = metadata.newDepartmentId;

								if (!departmentId && metadata.newDepartment) {
									const department = await prisma.department.findFirst({
										where: {
											name: {
												equals: metadata.newDepartment,
												mode: "insensitive",
											},
											isDeleted: false,
										},
									});
									if (department) {
										departmentId = department.id;
									}
								}

								if (departmentId) {
									employeeUpdateData.departmentId = departmentId;
								}
							}
							// Update Location
							if (metadata.newLocation) {
								// Validate against enum if strict, or map to closest
								const validLocations = ["ONSITE", "REMOTE", "HYBRID"];
								const normalizedLoc = metadata.newLocation.toUpperCase();
								if (validLocations.includes(normalizedLoc)) {
									employeeUpdateData.workLocation = normalizedLoc;
								}
							}
							if (metadata.newSupervisorId) {
								employeeUpdateData.reportToId = String(metadata.newSupervisorId);
							}
							break;

						case "REGULARIZATION":
							employeeUpdateData.employmentType = "REGULAR";
							employeeUpdateData.probationEndDate = null; // Clear probation date
							// If effectiveness is immediate
							if (new Date(effectiveDate) <= now) {
								employeeUpdateData.employmentStatus = "ACTIVE";
							}
							break;

						case "TERMINATION":
							// For approved/completed PAN termination requests, set final separation status
							// based on the selected termination type.
							const separationType = getTerminationSeparationType(metadata);
							employeeUpdateData.employmentStatus =
								separationType === "RESIGNATION" ? "RESIGNED" : "TERMINATED";
							employeeUpdateData.employmentTerminationDate = metadata.lastWorkingDay
								? new Date(metadata.lastWorkingDay)
								: new Date(effectiveDate);
							break;
					}

					if (Object.keys(employeeUpdateData).length > 0) {
						const employeeRecord = await prisma.employee.findUnique({
							where: { id: targetEmployeeId },
							select: { metadata: true },
						});
						const requestMetadata = getSafeMetadataObject(metadata);
						const currentEmployeeMetadata = getSafeMetadataObject(
							employeeRecord?.metadata,
						);
						const separationMetadata =
							request.type === "TERMINATION"
								? {
										employmentSeparationType:
											getTerminationSeparationType(requestMetadata),
									}
								: {};

						const updatedEmployee = await prisma.employee.update({
							where: { id: targetEmployeeId },
							data: {
								...employeeUpdateData,
								metadata: {
									...currentEmployeeMetadata,
									...requestMetadata,
									...separationMetadata,
									lastActionRequest: requestId,
									lastActionDate: now,
									lastActionType: request.type,
								},
							},
						});

						if (
							updatedEmployee.employmentStatus === "TERMINATED" ||
							updatedEmployee.employmentStatus === "RESIGNED"
						) {
							(req as any)?.io
								?.to(`employee:${targetEmployeeId}`)
								?.emit("account:deactivated", {
									employeeId: targetEmployeeId,
									employmentStatus: updatedEmployee.employmentStatus,
									message: DEACTIVATED_ACCOUNT_MESSAGE,
								});
						}
						requestLogger.info(
							`Updated employee ${targetEmployeeId} for approved ${request.type} request ${requestId}`,
						);
					}
				}
			} catch (panError) {
				requestLogger.error(`Error processing PAN approval side effects: ${panError}`);
			}
		}
	};

	const update = async (req: Request, res: Response, _next: NextFunction) => {
		const { id } = req.params;

		try {
			if (!id) {
				requestLogger.error(config.ERROR.QUERY_PARAMS.MISSING_ID);
				const errorResponse = buildErrorResponse(config.ERROR.QUERY_PARAMS.MISSING_ID, 400);
				res.status(400).json(errorResponse);
				return;
			}

			const validationResult = UpdateRequestSchema.safeParse(req.body);

			if (!validationResult.success) {
				const formattedErrors = formatZodErrors(validationResult.error.format());
				requestLogger.error(`Validation failed: ${JSON.stringify(formattedErrors)}`);
				const errorResponse = buildErrorResponse("Validation failed", 400, formattedErrors);
				res.status(400).json(errorResponse);
				return;
			}

			if (Object.keys(req.body).length === 0) {
				requestLogger.error(config.ERROR.COMMON.NO_UPDATE_FIELDS);
				const errorResponse = buildErrorResponse(config.ERROR.COMMON.NO_UPDATE_FIELDS, 400);
				res.status(400).json(errorResponse);
				return;
			}

			const validatedData = validationResult.data;

			requestLogger.info(`Updating request: ${id}`);

			const existingRequest = await prisma.request.findFirst({
				where: { id },
			});

			if (!existingRequest) {
				requestLogger.error(`${config.ERROR.REQUEST.NOT_FOUND}: ${id}`);
				const errorResponse = buildErrorResponse(config.ERROR.REQUEST.NOT_FOUND, 404);
				res.status(404).json(errorResponse);
				return;
			}

			if (existingRequest.type === "LEAVE") {
				const leaveValidationEmployee = await prisma.employee.findUnique({
					where: { id: existingRequest.requesterId, isDeleted: false },
					select: { employmentType: true },
				});

				if (!leaveValidationEmployee) {
					const errorResponse = buildErrorResponse("Requester not found", 404);
					res.status(404).json(errorResponse);
					return;
				}

				const mergedLeaveRequest = {
					...existingRequest,
					...validatedData,
					metadata: {
						...((existingRequest.metadata as Record<string, any>) || {}),
						...((validatedData.metadata as Record<string, any>) || {}),
					},
				};

				try {
					await validateLeaveRequestAgainstPolicyOrThrow({
						organizationId: existingRequest.organizationId,
						requestLike: mergedLeaveRequest,
						employmentType: leaveValidationEmployee.employmentType,
					});
				} catch (policyError) {
					const message =
						policyError instanceof Error
							? policyError.message
							: "Leave policy validation failed.";
					const errorResponse = buildErrorResponse(message, 400);
					res.status(400).json(errorResponse);
					return;
				}
			}

			const prismaData: Prisma.RequestUpdateInput = {
				...validatedData,
			};

			const updatedRequest = await prisma.request.update({
				where: { id },
				data: prismaData,
				include: {
					requester: {
						select: {
							id: true,
							employeeId: true,
							leaveBalances: true,
							person: {
								select: {
									personalInfo: true,
								},
							},
						},
					},
					workflowInstance: true,
					stepExecutions: true,
				},
			});

			const fieldChanges = buildRequestFieldChanges(
				{
					description: existingRequest.description,
					startDate: existingRequest.startDate,
					endDate: existingRequest.endDate,
					attachments: existingRequest.attachments,
					notes: existingRequest.notes,
					metadata: existingRequest.metadata,
					currentWorkflowStateKey: existingRequest.currentWorkflowStateKey,
				},
				{
					description: updatedRequest.description,
					startDate: updatedRequest.startDate,
					endDate: updatedRequest.endDate,
					attachments: updatedRequest.attachments,
					notes: updatedRequest.notes,
					metadata: updatedRequest.metadata,
					currentWorkflowStateKey: updatedRequest.currentWorkflowStateKey,
				},
			);

			if (fieldChanges.length > 0) {
				await createRequestTransaction(prisma, {
					organizationId: existingRequest.organizationId,
					requestId: id,
					workflowInstanceId: existingRequest.workflowInstanceId ?? null,
					actorEmployeeId: await getActingEmployeeId(
						req as AuthRequest,
						existingRequest.organizationId,
					),
					actorRole: (req as any).role || null,
					actorType: resolveRequestTransactionActorType((req as any).role || null),
					eventCategory: RequestTransactionEventCategory.BUSINESS_CHANGE,
					eventKey: RequestTransactionEventKey.REQUEST_UPDATED,
					eventSource: "request_update",
					title: "Request details updated",
					fieldChanges,
				});
			}

			// Direct/system updates can also move a request into APPROVED/COMPLETED.
			// Treat that transition as the same domain event as a normal approval click, so LEAVE
			// requests still refresh AttendanceObligation for /hr/attendance immediately.
			const updatedStateKey = getRequestStateKey(updatedRequest);
			const previousStateKey = getRequestStateKey(existingRequest);
			const isApprovedNow =
				isRequestApprovedState(updatedStateKey) &&
				!isRequestApprovedState(previousStateKey);

			if (isApprovedNow) {
				requestLogger.info(
					`Request ${id} state changed to ${updatedStateKey}. Triggering approval side-effects.`,
				);
				await processApprovalSideEffects(
					id,
					updatedRequest,
					(req as any).user?.id || "unknown",
					req,
				);
			}

			try {
				await invalidateCache.byPattern(`cache:request:byId:${id}:*`);
				await invalidateCache.byPattern("cache:request:list:*");
				requestLogger.info(`Cache invalidated after request ${id} update`);
			} catch (cacheError) {
				requestLogger.warn("Failed to invalidate cache after request update:", cacheError);
			}

			requestLogger.info(`${config.SUCCESS.REQUEST.UPDATED}: ${updatedRequest.id}`);
			const successResponse = buildSuccessResponse(
				config.SUCCESS.REQUEST.UPDATED,
				{ request: updatedRequest },
				200,
			);
			res.status(200).json(successResponse);
		} catch (error) {
			requestLogger.error(`${config.ERROR.REQUEST.ERROR_UPDATING}: ${error}`);
			const errorResponse = buildErrorResponse(
				config.ERROR.COMMON.INTERNAL_SERVER_ERROR,
				500,
			);
			res.status(500).json(errorResponse);
		}
	};

	const cancel = async (req: Request, res: Response, _next: NextFunction) => {
		const { id } = req.params;
		const { reason, rejectionReason } = req.body || {};
		const cancelReason = reason || rejectionReason;

		try {
			if (!id) {
				requestLogger.error(config.ERROR.QUERY_PARAMS.MISSING_ID);
				const errorResponse = buildErrorResponse(config.ERROR.QUERY_PARAMS.MISSING_ID, 400);
				res.status(400).json(errorResponse);
				return;
			}

			const existingRequest = await prisma.request.findFirst({
				where: { id },
			});

			if (!existingRequest) {
				requestLogger.error(`${config.ERROR.REQUEST.NOT_FOUND}: ${id}`);
				const errorResponse = buildErrorResponse(config.ERROR.REQUEST.NOT_FOUND, 404);
				res.status(404).json(errorResponse);
				return;
			}

			const existingStateKey = getRequestStateKey(existingRequest);
			if (existingStateKey === "CANCELLED") {
				const errorResponse = buildErrorResponse("Request is already cancelled", 409);
				res.status(409).json(errorResponse);
				return;
			}

			if (
				!["OPEN", "SUBMITTED", "APPROVED"].includes(existingStateKey) &&
				!existingRequest.currentStepExecutionId
			) {
				const errorResponse = buildErrorResponse(
					`Cannot cancel request when state is ${existingStateKey || "UNKNOWN"}`,
					409,
				);
				res.status(409).json(errorResponse);
				return;
			}

			const updatedRequest = await prisma.request.update({
				where: { id },
				data: {
					currentWorkflowStateKey: "CANCELLED",
					currentStepExecutionId: null,
					...(cancelReason ? { notes: cancelReason } : {}),
				},
			});

			await createRequestTransaction(prisma, {
				organizationId: existingRequest.organizationId,
				requestId: id,
				workflowInstanceId: existingRequest.workflowInstanceId ?? null,
				actorEmployeeId: await getActingEmployeeId(
					req as AuthRequest,
					existingRequest.organizationId,
				),
				actorRole: (req as any).role || null,
				actorType: resolveRequestTransactionActorType((req as any).role || null),
				eventCategory: RequestTransactionEventCategory.LIFECYCLE,
				eventKey: RequestTransactionEventKey.REQUEST_CANCELLED,
				eventSource: "request_cancel",
				title: "Request cancelled",
				description: cancelReason
					? "The request was cancelled with a reason."
					: "The request was cancelled.",
				comments: cancelReason || null,
				fromStateKey: existingStateKey,
				toStateKey: "CANCELLED",
			});

			if (existingRequest.type === "LEAVE" && existingRequest.startDate) {
				// Cancellation is also an attendance event: remove the leave effect from the
				// live AttendanceObligation source so /hr/attendance no longer counts this day
				// as approved leave after the request is cancelled.
				await recomputeAttendanceObligationsForRange(prisma, {
					organizationId: existingRequest.organizationId,
					employeeId: existingRequest.requesterId,
					fromDate: existingRequest.startDate,
					toDate: existingRequest.endDate || existingRequest.startDate,
					reason: "LeaveCancelled",
				});
			}

			try {
				await invalidateCache.byPattern(`cache:request:byId:${id}:*`);
				await invalidateCache.byPattern("cache:request:list:*");
				requestLogger.info(`Cache invalidated after request ${id} cancellation`);
			} catch (cacheError) {
				requestLogger.warn(
					"Failed to invalidate cache after request cancellation:",
					cacheError,
				);
			}

			try {
				await publishRequestCancelledNotification(prisma, (req as any).io, {
					requestId: id,
					sourceEmployeeId: existingRequest.requesterId,
					reason: cancelReason || null,
				});
			} catch (notificationError) {
				requestLogger.warn(
					`Failed to publish request cancellation notification for ${id}: ${notificationError}`,
				);
			}

			requestLogger.info(`Request cancelled successfully: ${id}`);
			res.status(200).json(
				buildSuccessResponse(
					"Request cancelled successfully",
					{ request: updatedRequest },
					200,
				),
			);
		} catch (error) {
			requestLogger.error(`Failed to cancel request: ${error}`);
			res.status(500).json(
				buildErrorResponse(config.ERROR.COMMON.INTERNAL_SERVER_ERROR, 500),
			);
		}
	};

	const remove = async (req: Request, res: Response, _next: NextFunction) => {
		const { id } = req.params;

		try {
			if (!id) {
				requestLogger.error(config.ERROR.QUERY_PARAMS.MISSING_ID);
				const errorResponse = buildErrorResponse(config.ERROR.QUERY_PARAMS.MISSING_ID, 400);
				res.status(400).json(errorResponse);
				return;
			}

			requestLogger.info(`${config.SUCCESS.REQUEST.DELETED}: ${id}`);

			const existingRequest = await prisma.request.findFirst({
				where: { id },
			});

			if (!existingRequest) {
				requestLogger.error(`${config.ERROR.REQUEST.NOT_FOUND}: ${id}`);
				const errorResponse = buildErrorResponse(config.ERROR.REQUEST.NOT_FOUND, 404);
				res.status(404).json(errorResponse);
				return;
			}

			await prisma.request.delete({
				where: { id },
			});

			try {
				await invalidateCache.byPattern(`cache:request:byId:${id}:*`);
				await invalidateCache.byPattern("cache:request:list:*");
				requestLogger.info(`Cache invalidated after request ${id} deletion`);
			} catch (cacheError) {
				requestLogger.warn(
					"Failed to invalidate cache after request deletion:",
					cacheError,
				);
			}

			requestLogger.info(`${config.SUCCESS.REQUEST.DELETED}: ${id}`);
			const successResponse = buildSuccessResponse(config.SUCCESS.REQUEST.DELETED, {}, 200);
			res.status(200).json(successResponse);
		} catch (error) {
			requestLogger.error(`${config.ERROR.REQUEST.DELETE_FAILED}: ${error}`);
			const errorResponse = buildErrorResponse(
				config.ERROR.COMMON.INTERNAL_SERVER_ERROR,
				500,
			);
			res.status(500).json(errorResponse);
		}
	};

	const generateDocument = async (req: Request, res: Response, _next: NextFunction) => {
		const { id } = req.params;
		const { type, documentType, year } = req.body; // type = document type for storage, documentType = COE | BIR_2316

		try {
			if (!id) {
				const errorResponse = buildErrorResponse("Request ID is required", 400);
				res.status(400).json(errorResponse);
				return;
			}

			// Validate documentType
			const validDocumentTypes = ["COE", "BIR_2316"];
			const selectedDocType = documentType || "COE"; // Default to COE for backwards compatibility
			if (!validDocumentTypes.includes(selectedDocType)) {
				const errorResponse = buildErrorResponse(
					`Invalid document type. Must be one of: ${validDocumentTypes.join(", ")}`,
					400,
				);
				res.status(400).json(errorResponse);
				return;
			}

			const request = await prisma.request.findUnique({
				where: { id },
				include: {
					requester: {
						include: {
							person: {
								select: {
									personalInfo: true,
								},
							},
							position: {
								select: {
									title: true,
								},
							},
						},
					},
				},
			});

			if (!request) {
				const errorResponse = buildErrorResponse("Request not found", 404);
				res.status(404).json(errorResponse);
				return;
			}

			const requester = request.requester;
			if (!requester) {
				const errorResponse = buildErrorResponse("Requester not found", 404);
				res.status(404).json(errorResponse);
				return;
			}

			// Update request metadata with year if provided (for BIR 2316 generation)
			if (year) {
				const currentMetadata = (request.metadata as Record<string, any>) || {};
				request.metadata = { ...currentMetadata, year: Number(year) };
			}

			// Generate a unique document number
			const documentNumber = `${new Date().getFullYear()}-${Math.floor(Math.random() * 1000)
				.toString()
				.padStart(3, "0")}-${Math.floor(Math.random() * 1000)
				.toString()
				.padStart(3, "0")}-${Math.floor(Math.random() * 1000)
				.toString()
				.padStart(3, "0")}`;

			// Generate PDF based on document type
			let buffer: Buffer;
			let filename: string;

			if (selectedDocType === "BIR_2316") {
				// Generate BIR 2316 form
				const result = await generateBIR2316Document(requester, request, documentNumber);
				buffer = result.buffer;
				filename = result.filename;
			} else {
				// Generate COE (Certificate of Employment) - existing logic
				const firstName = requester.person?.personalInfo?.firstName || "";
				const lastName = requester.person?.personalInfo?.lastName || "";
				const middleName = requester.person?.personalInfo?.middleName || "";
				const fullName =
					`${firstName} ${middleName ? middleName + " " : ""}${lastName}`.trim();
				const position = requester.position?.title || "Employee";
				const dateOfJoined = requester.employmentHireDate
					? new Date(requester.employmentHireDate).toLocaleDateString("en-US", {
							year: "numeric",
							month: "long",
							day: "numeric",
						})
					: "Unknown Date";

				const pdfDoc = await PDFDocument.create();
				const page = pdfDoc.addPage();
				const { width, height } = page.getSize();
				const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
				const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

				// Title
				page.drawText("CERTIFICATE OF EMPLOYMENT", {
					x: 50,
					y: height - 100,
					size: 24,
					font: boldFont,
					color: rgb(0, 0, 0),
				});

				// Date
				const currentDate = new Date().toLocaleDateString("en-US", {
					year: "numeric",
					month: "long",
					day: "numeric",
				});
				page.drawText(`Date: ${currentDate}`, {
					x: 50,
					y: height - 150,
					size: 12,
					font: font,
					color: rgb(0, 0, 0),
				});

				// Body
				const bodyText = `This is to certify that ${fullName} is currently employed with our company holding the position of ${position} since ${dateOfJoined}.

This certification is issued upon the request of the above-mentioned employee for whatever legal purpose it may serve.

Sincerely,

HR Department`;

				page.drawText(bodyText, {
					x: 50,
					y: height - 200,
					size: 12,
					font: font,
					color: rgb(0, 0, 0),
					maxWidth: width - 100,
					lineHeight: 24,
				});

				const pdfBytes = await pdfDoc.save();
				buffer = Buffer.from(pdfBytes);
				filename = `COE-${fullName.replace(/\s+/g, "-")}.pdf`;
			}

			// Upload to Cloudinary
			const uploadResult = await uploadToCloudinary(buffer, {
				folder: `hris/employees/${requester.employeeId}/documents`,
				resourceType: "raw",
			});

			if (!uploadResult.success || !uploadResult.secureUrl) {
				throw new Error(`Failed to upload generated document: ${uploadResult.error}`);
			}

			// Create the generated file as a related Document record
			if (request.requesterId) {
				const newDoc = {
					name: `${selectedDocType === "BIR_2316" ? "BIR Form 2316" : "Certificate of Employment"} - ${request.code}`,
					type: selectedDocType === "BIR_2316" ? "BIR_2316" : "CERTIFICATE",
					number: documentNumber,
					issueDate: new Date(),
					fileUrl: uploadResult.secureUrl,
					ext: "pdf",
				};

				await prisma.document.create({
					data: {
						employeeId: request.requesterId,
						...newDoc,
					},
				});
			}

			// Update Metadata with documentNumber, year (if provided), and set Status to Approved
			const metadata = (request.metadata as Record<string, any>) || {};

			// If it's a DOCUMENT_REQUEST with HR Review step, mark that step as completed
			let workflowCompleted = false;
			if (request.type === "DOCUMENT_REQUEST") {
				try {
					requestLogger.info(`Attempting to complete HR workflow for request ${id}`);
					const actingEmployeeId = await getActingEmployeeId(
						req as AuthRequest,
						request.organizationId,
					);
					requestLogger.info(
						`HR workflow actor resolution: request=${id}, actingEmployeeId=${actingEmployeeId ?? "none"}`,
					);

					if (actingEmployeeId) {
						const hrEmployee = await prisma.employee.findFirst({
							where: {
								id: actingEmployeeId,
								organizationId: request.organizationId,
								role: { in: ["hris-hr-manager", "hris-hr-user"] },
								isDeleted: false,
							},
							select: {
								id: true,
								employeeId: true,
								role: true,
								organizationId: true,
							},
						});

						requestLogger.info(
							`HR workflow actor validation: request=${id}, actor=${hrEmployee ? `${hrEmployee.employeeId} (${hrEmployee.id}, ${hrEmployee.role})` : "NOT_HR_OR_NOT_FOUND"}`,
						);

						if (!hrEmployee) {
							requestLogger.warn(
								`HR workflow completion skipped: acting employee ${actingEmployeeId} is not a valid HR assignee for organization ${request.organizationId}`,
							);
						} else {
							const { completeTaskStep } = await import(
								"../../helper/request-runtime.helper"
							);

							requestLogger.info(
								`Calling completeTaskStep for HR actor: ${hrEmployee.employeeId} (${hrEmployee.id})`,
							);

							// This will update status to COMPLETED if all steps are done
							await completeTaskStep(
								prisma,
								id,
								"HR Review & Document Generation",
								hrEmployee.id,
								"Document generated successfully",
							);

							workflowCompleted = true;
							const requestAfterStepCompletion = await prisma.request.findUnique({
								where: { id },
								select: {
									id: true,
									currentWorkflowStateKey: true,
									currentStepExecutionId: true,
								},
							});

							requestLogger.info(
								`Workflow transition after document generation: request=${id}, state=${requestAfterStepCompletion?.currentWorkflowStateKey ?? "UNKNOWN"}, currentStepExecutionId=${requestAfterStepCompletion?.currentStepExecutionId ?? "none"}`,
							);

							if (requestAfterStepCompletion?.currentWorkflowStateKey === "COMPLETED") {
								try {
									await publishDocumentRequestCompletedNotification(
										prisma,
										(req as any).io,
										id,
										hrEmployee.id,
									);
								} catch (notificationError) {
									requestLogger.warn(
										`Failed to publish document completion notification for ${id}: ${notificationError}`,
									);
								}
							}
						}
					} else {
						requestLogger.warn(
							`HR workflow completion skipped: could not resolve acting employee for request ${id}`,
						);
					}
				} catch (workflowError) {
					requestLogger.error(
						`Error completing workflow: ${workflowError instanceof Error ? workflowError.message : String(workflowError)}`,
					);
					requestLogger.error(
						`Stack: ${workflowError instanceof Error ? workflowError.stack : "N/A"}`,
					);
					// Don't fail document generation if workflow update fails
				}
			}

			// Update ONLY metadata - let completeTaskStep handle status updates
			// If completeTaskStep didn't run (not a DOCUMENT_REQUEST or error), set to APPROVED
			const updateData: any = {
				metadata: {
					...metadata,
					documentNumber: documentNumber,
					documentUrl: uploadResult.secureUrl,
					documentType: selectedDocType,
					generatedAt: new Date().toISOString(),
					documentStatus: "GENERATED",
				},
			};

			// Only set state if workflow wasn't completed (completeTaskStep already set it)
			if (!workflowCompleted) {
				updateData.currentWorkflowStateKey = "APPROVED";
			}

			await prisma.request.update({
				where: { id },
				data: updateData,
			});

			await createRequestTransaction(prisma, {
				organizationId: request.organizationId,
				requestId: id,
				workflowInstanceId: request.workflowInstanceId ?? null,
				actorEmployeeId: await getActingEmployeeId(
					req as AuthRequest,
					request.organizationId,
				),
				actorRole: (req as any).role || null,
				actorType: resolveRequestTransactionActorType((req as any).role || null),
				eventCategory: RequestTransactionEventCategory.ARTIFACT,
				eventKey: RequestTransactionEventKey.DOCUMENT_GENERATED,
				eventSource: "document_generation",
				title: "Document generated",
				description: `A ${selectedDocType} document was generated for this request.`,
				toStateKey: workflowCompleted ? null : "APPROVED",
				metadata: {
					documentNumber,
					documentType: selectedDocType,
					documentUrl: uploadResult.secureUrl,
				},
			});

			const successResponse = buildSuccessResponse(
				"Document generated successfully",
				{
					documentNumber,
					documentUrl: uploadResult.secureUrl,
					documentType: selectedDocType,
				},
				200,
			);
			res.status(200).json(successResponse);
		} catch (error) {
			requestLogger.error(`Error generating document: ${error}`);
			const errorMessage = error instanceof Error ? error.message : "Internal Server Error";
			const errorResponse = buildErrorResponse(errorMessage, 500);
			res.status(500).json(errorResponse);
		}
	};

	/**
	 * Generate BIR Form 2316 PDF document
	 * Uses existing PDF template and field mappings
	 */
	const generateBIR2316Document = async (
		_requester: any,
		request: any,
		_documentNumber: string,
	): Promise<{ buffer: Buffer; filename: string }> => {
		try {
			const metadata = (request.metadata as Record<string, any>) || {};
			const year = metadata.year || new Date().getFullYear();

			if (!metadata.year) {
				requestLogger.warn(
					`No year specified in request metadata. Using current year: ${year}`,
				);
			}
			const result = await generateBir2316PdfForEmployee(prisma, {
				employeeId: request.requesterId,
				year,
			});
			return result;
		} catch (error) {
			requestLogger.error(`Error generating BIR 2316 document: ${error}`);
			throw error;
		}
	};

	/**
	 * Start offboarding process for an approved request (resignation/termination)
	 * Creates a BoardingProcess with type OFFBOARDING and checklist items from template
	 */
	const startOffboarding = async (req: Request, res: Response, _next: NextFunction) => {
		const { id } = req.params;

		try {
			if (!id) {
				requestLogger.error(config.ERROR.QUERY_PARAMS.MISSING_ID);
				res.status(400).json(buildErrorResponse(config.ERROR.QUERY_PARAMS.MISSING_ID, 400));
				return;
			}

			// Find the request
			const existingRequest = await prisma.request.findFirst({
				where: { id },
				include: {
					requester: {
						select: {
							id: true,
							employeeId: true,
							organizationId: true,
							departmentId: true,
							role: true, // Select role to determine template
							person: {
								select: {
									personalInfo: true,
								},
							},
						},
					},
				},
			});

			if (!existingRequest) {
				requestLogger.error(`${config.ERROR.REQUEST.NOT_FOUND}: ${id}`);
				res.status(404).json(buildErrorResponse(config.ERROR.REQUEST.NOT_FOUND, 404));
				return;
			}

			// Validate request is already in an approved lifecycle state
			const currentStateKey = getRequestStateKey(existingRequest);
			const allowedStates = ["APPROVED", "COMPLETED"];
			if (!allowedStates.includes(currentStateKey)) {
				const msg = `Cannot start offboarding when state is ${currentStateKey}. Must be APPROVED or COMPLETED.`;
				requestLogger.warn(msg);
				res.status(409).json(buildErrorResponse(msg, 409));
				return;
			}

			const requester = existingRequest.requester;
			if (!requester) {
				res.status(404).json(buildErrorResponse("Requester employee not found", 404));
				return;
			}

			if (!requester.role) {
				requestLogger.error(`Employee ${requester.id} has no role assigned`);
				res.status(400).json(
					buildErrorResponse(
						"Employee has no role assigned, cannot determine offboarding checklist",
						400,
					),
				);
				return;
			}

			// Check if offboarding process already exists for this employee
			const existingProcess = await prisma.boardingProcess.findFirst({
				where: {
					employeeId: requester.id,
					type: "OFFBOARDING",
					isDeleted: false,
					status: { in: ["NOT_STARTED", "IN_PROGRESS"] },
				},
			});

			if (existingProcess) {
				res.status(409).json(
					buildErrorResponse(
						"An offboarding process already exists for this employee",
						409,
					),
				);
				return;
			}

			// Fetch boarding template based on employee role
			const templateBoard = await prisma.boardingTemplate.findFirst({
				where: {
					role: requester.role,
					type: "OFFBOARDING",
					isDeleted: false,
				},
				include: {
					items: {
						where: { isDeleted: false },
						orderBy: { order: "asc" },
					},
				},
			});

			if (!templateBoard) {
				requestLogger.error(`No OFFBOARDING template found for role: ${requester.role}`);
				res.status(404).json(
					buildErrorResponse(
						`No offboarding template found for role: ${requester.role}`,
						404,
					),
				);
				return;
			}

			// Calculate target date from request metadata (lastWorkingDay)
			const metadata = existingRequest.metadata as any;
			const lastWorkingDay = metadata?.lastWorkingDay
				? new Date(metadata.lastWorkingDay)
				: existingRequest.endDate || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // Default 30 days

			// Build exit reason from request data
			const exitReason = `${existingRequest.type} - ${metadata?.reasonCategory || "Resignation"}`;

			// Create the boarding process
			const boardingProcess = await prisma.boardingProcess.create({
				data: {
					organizationId: requester.organizationId,
					employeeId: requester.id,
					departmentId: requester.departmentId || "",
					type: "OFFBOARDING",
					status: "NOT_STARTED",
					startDate: new Date(),
					targetDate: lastWorkingDay,
					exitReason: exitReason,
					assignedToId: (req as any).user?.metadata?.employee?.id || null,
					assignedToName: (req as any).user?.email || null,
					completionPercentage: 0,
				},
			});

			requestLogger.info(
				`BoardingProcess created: ${boardingProcess.id} for role ${requester.role}, creating ${templateBoard.items.length} checklist items`,
			);

			// Create checklist items from template
			if (templateBoard.items.length > 0) {
				const processStartDate = boardingProcess.startDate;

				const checklistItemsData = templateBoard.items.map((item) => {
					let calculatedDueDate = new Date(processStartDate);
					if (item.dueOffset !== undefined && item.dueOffset !== null) {
						calculatedDueDate.setDate(calculatedDueDate.getDate() + item.dueOffset);
					}

					return {
						organizationId: boardingProcess.organizationId,
						processId: boardingProcess.id,
						title: item.title,
						description: item.description || null,
						category: item.category,
						status: "PENDING" as const,
						priority: item.priority,
						dueDate: calculatedDueDate,
						order: item.order,
						metadata: item.metadata || null,
					};
				});

				await prisma.checklistItem.createMany({
					data: checklistItemsData,
				});

				requestLogger.info(
					`Created ${checklistItemsData.length} checklist items for boarding process: ${boardingProcess.id}`,
				);
			}

			// Fetch the complete boarding process with checklist items
			const completeBoardingProcess = await prisma.boardingProcess.findFirst({
				where: { id: boardingProcess.id },
				include: {
					checklistItems: {
						where: { isDeleted: false },
						orderBy: { order: "asc" },
					},
				},
			});

			// Invalidate caches
			try {
				await invalidateCache.byPattern(`cache:request:byId:${id}:*`);
				await invalidateCache.byPattern("cache:request:list:*");
				await invalidateCache.byPattern("cache:boardingProcess:list:*");
				requestLogger.info("Caches invalidated after offboarding process creation");
			} catch (cacheError) {
				requestLogger.warn("Failed to invalidate cache:", cacheError);
			}

			logActivity(req, {
				userId: (req as any).user?.id || "unknown",
				action: "START_OFFBOARDING",
				description: `Started offboarding process for request ${id}`,
				page: {
					url: req.originalUrl,
					title: "Start Offboarding",
				},
			});

			res.status(201).json(
				buildSuccessResponse(
					"Offboarding process started successfully",
					{
						boardingProcess: completeBoardingProcess,
					},
					201,
				),
			);
		} catch (error) {
			requestLogger.error(`Error starting offboarding: ${error}`);
			res.status(500).json(
				buildErrorResponse(config.ERROR.COMMON.INTERNAL_SERVER_ERROR, 500),
			);
		}
	};

	const delegateStep = async (req: AuthRequest, res: Response, _next: NextFunction) => {
		const { id } = req.params;

		try {
			if (!id) {
				const errorResponse = buildErrorResponse(config.ERROR.QUERY_PARAMS.MISSING_ID, 400);
				res.status(400).json(errorResponse);
				return;
			}

			const validation = RequestDelegateStepSchema.safeParse(req.body);
			if (!validation.success) {
				const formattedErrors = formatZodErrors(validation.error.format());
				res.status(400).json(buildErrorResponse("Validation failed", 400, formattedErrors));
				return;
			}

			const existingRequest = await prisma.request.findFirst({
				where: { id },
				select: {
					id: true,
					organizationId: true,
					requesterId: true,
					currentWorkflowStateKey: true,
					currentStepExecutionId: true,
					requester: {
						select: {
							reportToId: true,
							reportTo: {
								select: {
									id: true,
									person: {
										select: {
											personalInfo: true,
										},
									},
								},
							},
						},
					},
				},
			});

			if (!existingRequest) {
				res.status(404).json(buildErrorResponse(config.ERROR.REQUEST.NOT_FOUND, 404));
				return;
			}

			const currentStateKey = getRequestStateKey(existingRequest);
			if (
				!["OPEN", "SUBMITTED", "APPROVED"].includes(currentStateKey) &&
				!existingRequest.currentStepExecutionId
			) {
				res.status(409).json(
					buildErrorResponse(
						`Cannot delegate a request with state ${currentStateKey || "UNKNOWN"}`,
						409,
					),
				);
				return;
			}

			if (!existingRequest.currentStepExecutionId) {
				res.status(409).json(
					buildErrorResponse("No active step execution to delegate", 409),
				);
				return;
			}

			const currentStep = await prisma.workflowStepExecution.findFirst({
				where: {
					id: existingRequest.currentStepExecutionId,
					requestId: id,
					isDeleted: false,
				},
				select: {
					id: true,
					stepType: true,
					assigneeId: true,
					assigneeType: true,
					metadata: true,
				},
			});

			if (!currentStep) {
				res.status(409).json(buildErrorResponse("Current step execution not found", 409));
				return;
			}

			if (currentStep.stepType !== "APPROVAL") {
				res.status(409).json(
					buildErrorResponse("Only approval steps can be delegated", 409),
				);
				return;
			}

			const actingEmployeeId = await getActingEmployeeId(req, existingRequest.organizationId);
			if (!actingEmployeeId) {
				res.status(401).json(
					buildErrorResponse(
						"Unable to determine the acting employee for workflow delegation",
						401,
					),
				);
				return;
			}

			if (
				!canDelegateWorkflowStep({
					role: req.user?.role || (req as any).user?.role,
					actingEmployeeId,
					currentAssigneeId: currentStep.assigneeId ?? null,
				})
			) {
				res.status(403).json(
					buildErrorResponse(
						"Only the current assignee, HR manager, or admin can delegate this step",
						403,
					),
				);
				return;
			}

			// Get the requester's supervisor (reportTo)
			const supervisorId = existingRequest.requester?.reportToId;
			if (!supervisorId) {
				res.status(409).json(
					buildErrorResponse(
						"No supervisor found for this employee. Please set up the reporting hierarchy.",
						409,
					),
				);
				return;
			}

			// Prevent escalating to the same person already assigned
			if (currentStep.assigneeId === supervisorId) {
				res.status(409).json(
					buildErrorResponse(
						"The supervisor is already the assigned approver for this step.",
						409,
					),
				);
				return;
			}

			const now = new Date();
			const currentStepMetadata = getSafeMetadataObject(currentStep.metadata);
			const delegationEvent = {
				mode: validation.data.mode,
				target: "SUPERVISOR",
				delegatedAt: now.toISOString(),
				delegatedByEmployeeId: actingEmployeeId,
				fromAssigneeId: currentStep.assigneeId ?? null,
				toAssigneeId: supervisorId,
				reason: validation.data.reason ?? null,
			};
			const delegationHistory = getStepDelegationHistory(currentStep.metadata);
			const supervisorName = existingRequest.requester?.reportTo?.person?.personalInfo
				? `${existingRequest.requester.reportTo.person.personalInfo.firstName || ""} ${existingRequest.requester.reportTo.person.personalInfo.lastName || ""}`.trim()
				: "supervisor";
			await prisma.workflowStepExecution.update({
				where: { id: currentStep.id },
				data: {
					assigneeId: supervisorId,
					metadata: {
						...currentStepMetadata,
						activeDelegation: delegationEvent,
						delegationHistory: [...delegationHistory, delegationEvent],
						escalatedAt: now.toISOString(),
						escalatedToSupervisor: true,
						previousAssigneeId: currentStep.assigneeId ?? null,
					} as Prisma.InputJsonValue,
				},
			});

			await createRequestTransaction(prisma, {
				organizationId: existingRequest.organizationId,
				requestId: id,
				workflowInstanceId: null,
				stepExecutionId: currentStep.id,
				actorEmployeeId: actingEmployeeId,
				actorRole: req.user?.role || (req as any).user?.role || null,
				actorType: resolveRequestTransactionActorType(
					req.user?.role || (req as any).user?.role || null,
				),
				eventCategory: RequestTransactionEventCategory.ASSIGNMENT,
				eventKey: RequestTransactionEventKey.STEP_DELEGATED,
				eventSource: "delegate_step",
				title:
					validation.data.mode === "TEMPORARY"
						? "Approval step delegated"
						: "Approval step reassigned",
				description: `Approval step was moved to ${supervisorName}.`,
				comments: validation.data.reason ?? null,
				metadata: {
					mode: validation.data.mode,
					fromAssigneeId: currentStep.assigneeId ?? null,
					toAssigneeId: supervisorId,
					target: "SUPERVISOR",
				},
			});

			// Invalidate cache
			await invalidateCache.byPattern(`cache:request:byId:${id}:*`);
			await invalidateCache.byPattern(`cache:request:list:*`);

			requestLogger.info(
				`Delegated step ${currentStep.id} to supervisor ${supervisorId} for request ${id}`,
			);

			try {
				await publishRequestCreatedNotification(
					prisma,
					(req as any).io,
					id,
					existingRequest.requesterId,
				);
			} catch (notificationError) {
				requestLogger.warn(
					`Failed to publish escalation notification for ${id}: ${notificationError}`,
				);
			}

			res.json(
				buildSuccessResponse(
					validation.data.mode === "TEMPORARY"
						? `Request step delegated to ${supervisorName} successfully`
						: `Request step reassigned to ${supervisorName} successfully`,
					{
						requestId: id,
						delegatedTo: supervisorId,
						delegatedToName: supervisorName,
						mode: validation.data.mode,
					},
					200,
				),
			);
		} catch (error: any) {
			requestLogger.error(`Error delegating step for request ${id}: ${error.message}`);
			res.status(500).json(
				buildErrorResponse(config.ERROR.COMMON.INTERNAL_SERVER_ERROR, 500),
			);
		}
	};

	const escalateStep = async (req: AuthRequest, res: Response, next: NextFunction) => {
		req.body = {
			mode: "REASSIGN",
			reason: req.body?.reason || "Compatibility escalation to supervisor",
		};
		return delegateStep(req, res, next);
	};

	return {
		create,
		getAll,
		getById,
		getStatusesByType,
		update,
		cancel,
		remove,
		approval,
		generateDocument,
		startOffboarding,
		delegateStep,
		escalateStep,
	};
};
