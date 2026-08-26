import {
	Prisma,
	PrismaClient,
	RequestTransactionEventCategory,
	RequestTransactionEventKey,
} from "../generated/prisma";
import { applyPanCompletionSideEffects } from "./pan-post-actions.helper";
import { createRequestTransaction } from "./request-transaction.helper";
import { getRequestWorkflowConfig } from "./workflow-config.helper";
import { isEmployeeSelfServiceBlockedStatus } from "./employee-action-block.helper";
import { recomputeAttendanceObligationsForRange } from "./attendance-obligation.helper";
import { invalidateCache } from "../middleware/cache";
import { resolveEffectiveShift } from "./employee-schedule.helper";
import { refreshTimesheetForAttendanceDate } from "./timesheet.helper";
import { calculateShiftHour } from "./schedule-normalization.helper";
import {
	hasScheduleChangeWorkflowStepDrift,
	isScheduleChangeRequestType,
	isScheduleChangeWorkflowCode,
	isStaleScheduleChangeHrTaskExecution,
	normalizeScheduleChangeWorkflowStepsForHrApproval,
	SCHEDULE_CHANGE_HR_APPROVAL_STEP_NAME,
} from "./schedule-change-workflow.helper";
import {
	isAttendanceCorrectionHrRole,
	isAttendanceCorrectionRequestType,
	isAttendanceCorrectionWorkflowCode,
	isPendingAttendanceCorrectionHrReviewStep,
	normalizeAttendanceCorrectionWorkflowSteps,
	shouldAutoCompleteAttendanceCorrectionHrReview,
} from "./attendance-correction-workflow.helper";
import { applyAttendanceCorrectionRequest } from "../app/attendance/apply-attendance-correction-request";
import {
	isOvertimeRequestType,
	isOvertimeWorkflowCode,
	normalizeOvertimeWorkflowSteps,
} from "./overtime-workflow.helper";

export const DEFAULT_WORKFLOW_STATE_KEYS = {
	OPEN: "OPEN",
	FOR_APPROVAL: "FOR_APPROVAL",
	IN_PROCESS: "IN_PROCESS",
	SUBMITTED: "SUBMITTED",
	APPROVED: "APPROVED",
	REJECTED: "REJECTED",
	CANCELLED: "CANCELLED",
	COMPLETED: "COMPLETED",
} as const;

export type WorkflowStateKey = string;
export type WorkflowActionTiming =
	| "on_step_enter"
	| "on_step_complete"
	| "on_approve"
	| "on_reject"
	| "on_cancel"
	| "on_workflow_complete";
export type WorkflowActionType = "RUN_REQUEST_TYPE_POST_ACTION";

export type WorkflowStateConfig = {
	key: WorkflowStateKey;
	label: string;
	order: number;
	isTerminal?: boolean;
};

export type WorkflowPostActionConfig = {
	type: WorkflowActionType;
	timing: WorkflowActionTiming;
	config?: Record<string, unknown>;
};

export type WorkflowStepConfig = {
	step_number: number;
	step_name: string;
	step_type: "SUBMISSION" | "APPROVAL" | "TASK";
	assignee_type:
		| "REQUESTER"
		| "SUPERVISOR"
		| "TARGET_DEPARTMENT_MANAGER"
		| "HR"
		| "SYSTEM";
	is_required?: boolean;
	state_on_enter?: WorkflowStateKey;
	state_on_approve?: WorkflowStateKey;
	state_on_reject?: WorkflowStateKey;
	state_on_complete?: WorkflowStateKey;
	state_on_skip?: WorkflowStateKey;
	post_actions?: WorkflowPostActionConfig[];
};

export type AssigneeResolutionChain =
	| "REQUESTER"
	| "SYSTEM"
	| "CURRENT_ASSIGNEE"
	| "SUPERVISOR_CHAIN"
	| "HR_CHAIN"
	| "HIGHER_UP_CHAIN"
	| "SELF_APPROVAL"
	| "NONE";

export type AssigneeResolution = {
	assigneeId: string | null;
	chain: AssigneeResolutionChain;
	fallbackLevel: number;
	reason?: string;
};

type PrismaExecutor = PrismaClient | Prisma.TransactionClient;
const asRecord = (value: unknown): Record<string, any> =>
	value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, any>) : {};
const getJsonString = (value: unknown, key: string): string => {
	const raw = asRecord(value)[key];
	return typeof raw === "string" ? raw : "";
};

const normalizeToStartOfUtcDay = (value: Date): Date => {
	const normalized = new Date(value);
	normalized.setUTCHours(0, 0, 0, 0);
	return normalized;
};

const parseScheduleChangeDate = (value: unknown): Date | null => {
	if (value instanceof Date && !Number.isNaN(value.getTime())) {
		return normalizeToStartOfUtcDay(value);
	}
	const text = String(value || "").trim();
	if (!text) return null;
	const parsed = /^\d{4}-\d{2}-\d{2}$/.test(text)
		? new Date(`${text}T00:00:00.000Z`)
		: new Date(text);
	return Number.isNaN(parsed.getTime()) ? null : normalizeToStartOfUtcDay(parsed);
};

const normalizeScheduleTimeSlots = (value: unknown) =>
	(Array.isArray(value) ? value : [])
		.map((slot: any) => ({
			type: String(slot?.type || "work").trim().toLowerCase() || "work",
			label: String(slot?.label || "").trim() || null,
			startTime: String(slot?.startTime || "").trim(),
			endTime: String(slot?.endTime || "").trim(),
		}))
		.filter((slot) => slot.startTime && slot.endTime);

const scheduleTimeToMinutes = (value?: string | null): number | null => {
	if (!value) return null;
	const [hours, minutes] = String(value).split(":").map(Number);
	if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
	return hours * 60 + minutes;
};

const getScheduleWindowFromSlots = (
	timeSlots: Array<{ type: string; startTime: string; endTime: string }>,
) => {
	const workSlots = timeSlots.filter((slot) => slot.type === "work");
	if (!workSlots.length) return { startTime: null, endTime: null };
	return {
		startTime: workSlots[0]?.startTime || null,
		endTime: workSlots[workSlots.length - 1]?.endTime || null,
	};
};

const getScheduleBreakMinutesFromSlots = (
	timeSlots: Array<{ type: string; startTime: string; endTime: string }>,
) =>
	timeSlots
		.filter((slot) => slot.type === "break")
		.reduce((total, slot) => {
			const start = scheduleTimeToMinutes(slot.startTime);
			const end = scheduleTimeToMinutes(slot.endTime);
			if (start === null || end === null) return total;
			return total + Math.max(0, end <= start ? end + 24 * 60 - start : end - start);
		}, 0);

const isScheduleOvernight = (
	timeSlots: Array<{ type: string; startTime: string; endTime: string }>,
	fallback?: boolean | null,
) => {
	if (fallback !== undefined && fallback !== null) return Boolean(fallback);
	const { startTime, endTime } = getScheduleWindowFromSlots(timeSlots);
	const start = scheduleTimeToMinutes(startTime);
	const end = scheduleTimeToMinutes(endTime);
	return start !== null && end !== null && end <= start;
};

const toScheduleImpactSnapshot = (
	shift: Record<string, any> | null | undefined,
	overrides?: Record<string, any>,
) => {
	if (!shift) return null;
	const timeSlots = normalizeScheduleTimeSlots(shift.timeSlots);
	const { startTime, endTime } = getScheduleWindowFromSlots(timeSlots);
	const breakMinutes =
		typeof shift.breakMinutes === "number"
			? shift.breakMinutes
			: getScheduleBreakMinutesFromSlots(timeSlots);

	return {
		source: overrides?.source || shift.source || null,
		scheduleOverrideId:
			overrides?.scheduleOverrideId ?? shift.scheduleOverrideId ?? null,
		scheduleTemplateId: shift.scheduleTemplateId ?? null,
		scheduleTemplateName: shift.scheduleTemplateName ?? null,
		shiftTypeId: overrides?.shiftTypeId ?? shift.shiftTypeId ?? shift.id ?? null,
		shiftTypeCode: overrides?.shiftTypeCode ?? shift.shiftTypeCode ?? shift.code ?? null,
		shiftTypeName: overrides?.shiftTypeName ?? shift.shiftTypeName ?? shift.name ?? null,
		isOff: Boolean(shift.isOff),
		isOvernight: isScheduleOvernight(timeSlots, shift.isOvernight),
		breakMinutes,
		startTime: shift.startTime || startTime,
		endTime: shift.endTime || endTime,
		timeSlots,
		shiftHour:
			typeof shift.shiftHour === "number" && Number.isFinite(shift.shiftHour)
				? shift.shiftHour
				: null,
	};
};

const buildRequestedScheduleSnapshotFromMetadata = (metadata: Record<string, any>) => {
	const metadataSnapshot = asRecord(
		metadata.requestedScheduleSnapshot ||
			metadata.requestedShiftSnapshot ||
			metadata.shiftSnapshot,
	);
	const requestMode = String(metadata.requestMode || "").toUpperCase();
	const isFlexitimeRequest = requestMode === "FLEXITIME";
	const timeSlots = normalizeScheduleTimeSlots(
		Array.isArray(metadataSnapshot.timeSlots) && metadataSnapshot.timeSlots.length
			? metadataSnapshot.timeSlots
			: metadata.requestedTimeSlots,
	);
	const { startTime, endTime } = getScheduleWindowFromSlots(timeSlots);
	const isOff =
		metadataSnapshot.isOff !== undefined && metadataSnapshot.isOff !== null
			? Boolean(metadataSnapshot.isOff)
			: Boolean(metadata.shiftTypeIsOff) && !timeSlots.some((slot) => slot.type === "work");
	const shiftHour =
		typeof metadataSnapshot.shiftHour === "number" &&
		Number.isFinite(metadataSnapshot.shiftHour)
			? metadataSnapshot.shiftHour
			: typeof metadata.shiftHour === "number" && Number.isFinite(metadata.shiftHour)
				? metadata.shiftHour
				: calculateShiftHour({ ...metadataSnapshot, isOff, timeSlots });
	return {
		source:
			metadataSnapshot.source ||
			(String(metadata.requestMode || "").toUpperCase() === "FLEXITIME"
				? "requested_flexitime"
				: "requested_shift_copy"),
		scheduleOverrideId: null,
		scheduleTemplateId: null,
		scheduleTemplateName: null,
		shiftTypeId: isFlexitimeRequest
			? null
			: metadataSnapshot.shiftTypeId || metadata.shiftTypeId || null,
		shiftTypeCode: metadataSnapshot.shiftTypeCode || metadataSnapshot.code || metadata.shiftTypeCode || null,
		shiftTypeName:
			metadataSnapshot.shiftTypeName ||
			metadataSnapshot.name ||
			metadata.shiftTypeName ||
			metadata.shiftTypeLabel ||
			metadata.scheduleName ||
			metadata.newSchedule ||
			(String(metadata.requestMode || "").toUpperCase() === "FLEXITIME"
				? "Flexitime"
				: null),
		isOff,
		isOvernight: isScheduleOvernight(
			timeSlots,
			metadataSnapshot.isOvernight ?? metadata.shiftTypeIsOvernight ?? null,
		),
		breakMinutes:
			typeof metadataSnapshot.breakMinutes === "number"
				? metadataSnapshot.breakMinutes
				: getScheduleBreakMinutesFromSlots(timeSlots),
		startTime: metadataSnapshot.startTime || metadata.manualStartTime || startTime,
		endTime: metadataSnapshot.endTime || metadata.manualEndTime || endTime,
		timeSlots,
		shiftHour,
	};
};

const invalidateScheduleChangeImpactCaches = async (params: {
	requestId: string;
	scheduleOverrideId?: string | null;
}) => {
	try {
		await invalidateCache.byPattern(`cache:request:byId:${params.requestId}:*`);
		await invalidateCache.byPattern("cache:request:list:*");
		await invalidateCache.byPattern("cache:scheduleOverride:list:*");
		if (params.scheduleOverrideId) {
			await invalidateCache.byPattern(
				`cache:scheduleOverride:byId:${params.scheduleOverrideId}:*`,
			);
		}
		await invalidateCache.byPattern("cache:employee:*");
		await invalidateCache.byPattern("cache:attendance:*");
		await invalidateCache.byPattern("cache:timesheet:*");
		await invalidateCache.byPattern("cache:metrics:*");
	} catch {
		// Cache invalidation is best-effort; the database write remains the source of truth.
	}
};

async function applyScheduleChangeCompletionSideEffects(
	prisma: PrismaClient | Prisma.TransactionClient,
	params: {
		organizationId: string;
		requestId: string;
		requesterId: string;
		targetEmployeeId?: string | null;
		metadata?: Record<string, any> | null;
		actorEmployeeId?: string | null;
		now: Date;
	},
) {
	const metadata = { ...(params.metadata ?? {}) };
	const impactedEmployeeId = String(params.targetEmployeeId || params.requesterId || "").trim();
	const existingAppliedOverrideId = String(metadata.appliedScheduleOverrideId || "").trim();
	if (existingAppliedOverrideId) {
		return;
	}

	const effectiveDate = parseScheduleChangeDate(
		metadata.effectiveDate || metadata.requestedDate,
	);
	const isFlexitimeRequest = String(metadata.requestMode || "").toUpperCase() === "FLEXITIME";
	const shiftTypeId = isFlexitimeRequest ? "" : String(metadata.shiftTypeId || "").trim();
	const reason = String(metadata.reason || "").trim();

	if (!effectiveDate || !reason || !impactedEmployeeId) {
		throw new Error(
			"Schedule change completion requires effectiveDate, reason, and employee context.",
		);
	}

	let previousShiftSnapshot: Record<string, any> | null = null;
	try {
		previousShiftSnapshot = toScheduleImpactSnapshot(
			await resolveEffectiveShift(prisma as PrismaClient, {
				organizationId: params.organizationId,
				employeeId: impactedEmployeeId,
				date: effectiveDate,
			}),
		);
	} catch {
		previousShiftSnapshot = null;
	}
	const requestedScheduleSnapshot = buildRequestedScheduleSnapshotFromMetadata(metadata);
	const hasRequestedShiftSource =
		Boolean(requestedScheduleSnapshot.shiftTypeId || shiftTypeId) ||
		Boolean(requestedScheduleSnapshot.isOff) ||
		(Array.isArray(requestedScheduleSnapshot.timeSlots) &&
			requestedScheduleSnapshot.timeSlots.length > 0);
	if (!hasRequestedShiftSource) {
		throw new Error(
			"Schedule change completion requires a copied shift snapshot or shift type.",
		);
	}

	const shiftType = shiftTypeId
		? await prisma.shiftType.findFirst({
				where: {
					id: shiftTypeId,
					organizationId: params.organizationId,
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
		throw new Error("Requested shift type was not found for schedule change completion.");
	}
	const overrideShiftSnapshot = {
		...requestedScheduleSnapshot,
		source: "schedule_change_request",
		shiftTypeId: requestedScheduleSnapshot.shiftTypeId || shiftType?.id || null,
		shiftTypeName:
			requestedScheduleSnapshot.shiftTypeName || shiftType?.name || "Requested schedule",
		shiftTypeCode: requestedScheduleSnapshot.shiftTypeCode || shiftType?.code || null,
	};

	const existingOverride = await prisma.scheduleOverride.findUnique({
		where: {
			organizationId_employeeId_date: {
				organizationId: params.organizationId,
				employeeId: impactedEmployeeId,
				date: effectiveDate,
			},
		},
	});

	const scheduleOverride = await prisma.scheduleOverride.upsert({
		where: {
			organizationId_employeeId_date: {
				organizationId: params.organizationId,
				employeeId: impactedEmployeeId,
				date: effectiveDate,
			},
		},
		create: {
			organizationId: params.organizationId,
			employeeId: impactedEmployeeId,
			date: effectiveDate,
			shiftTypeId: shiftType?.id || null,
			shiftSnapshot: overrideShiftSnapshot as Prisma.InputJsonValue,
			reason,
			createdByEmployeeId: params.actorEmployeeId || null,
			isDeleted: false,
		},
		update: {
			shiftTypeId: shiftType?.id || null,
			shiftSnapshot: overrideShiftSnapshot as Prisma.InputJsonValue,
			reason,
			createdByEmployeeId: params.actorEmployeeId || null,
			isDeleted: false,
		},
	});

	await recomputeAttendanceObligationsForRange(prisma as PrismaClient, {
		organizationId: params.organizationId,
		employeeId: impactedEmployeeId,
		fromDate: effectiveDate,
		toDate: effectiveDate,
		reason: "ScheduleChangeRequestCompleted",
	});
	try {
		await refreshTimesheetForAttendanceDate(prisma as PrismaClient, {
			organizationId: params.organizationId,
			employeeId: impactedEmployeeId,
			date: effectiveDate,
		});
	} catch {
		// Timesheet refresh is best-effort; submitted, locked, and paid snapshots stay stable.
	}

	const effectiveShiftSnapshot = toScheduleImpactSnapshot(overrideShiftSnapshot, {
		source: "override",
		scheduleOverrideId: scheduleOverride.id,
		shiftTypeId: overrideShiftSnapshot.shiftTypeId,
		shiftTypeCode: overrideShiftSnapshot.shiftTypeCode,
		shiftTypeName: overrideShiftSnapshot.shiftTypeName,
	});

	await prisma.request.update({
		where: { id: params.requestId },
		data: {
			metadata: {
				...metadata,
				shiftTypeId: shiftType?.id || (isFlexitimeRequest ? null : metadata.shiftTypeId || null),
				shiftTypeName:
					metadata.shiftTypeName || overrideShiftSnapshot.shiftTypeName,
				shiftTypeCode:
					metadata.shiftTypeCode || overrideShiftSnapshot.shiftTypeCode,
				currentScheduleSnapshot:
					metadata.currentScheduleSnapshot || previousShiftSnapshot,
				requestedScheduleSnapshot: overrideShiftSnapshot,
				appliedScheduleOverrideId: scheduleOverride.id,
				scheduleChangeApplication: {
					status: existingOverride ? "UPDATED_EXISTING_OVERRIDE" : "CREATED_OVERRIDE",
					scheduleOverrideId: scheduleOverride.id,
					appliedAt: params.now.toISOString(),
					appliedByEmployeeId: params.actorEmployeeId || null,
					employeeId: impactedEmployeeId,
					effectiveDate: effectiveDate.toISOString(),
					previousShift: previousShiftSnapshot,
					effectiveShift: effectiveShiftSnapshot,
				},
			} as Prisma.InputJsonValue,
		},
	});
	await invalidateScheduleChangeImpactCaches({
		requestId: params.requestId,
		scheduleOverrideId: scheduleOverride.id,
	});
}

export async function repairCompletedScheduleChangeOverrideApplications(
	prisma: PrismaClient | Prisma.TransactionClient,
	params?: {
		organizationId?: string | null;
		limit?: number;
	},
): Promise<number> {
	const candidates = await prisma.request.findMany({
		where: {
			...(params?.organizationId ? { organizationId: params.organizationId } : {}),
			type: "SCHEDULE_CHANGE",
			currentWorkflowStateKey: "COMPLETED",
			isDeleted: false,
		},
		select: {
			id: true,
			organizationId: true,
			requesterId: true,
			targetEmployeeId: true,
			metadata: true,
			updatedAt: true,
		},
		orderBy: { updatedAt: "desc" },
		take: Math.max(1, params?.limit ?? 100),
	});

	let repaired = 0;
	for (const request of candidates) {
		const metadata = (request.metadata as Record<string, any> | null) ?? {};
		const appliedScheduleOverrideId = String(metadata.appliedScheduleOverrideId || "").trim();
		if (appliedScheduleOverrideId) {
			const existingOverride = await prisma.scheduleOverride.findFirst({
				where: {
					id: appliedScheduleOverrideId,
					organizationId: request.organizationId,
					isDeleted: false,
				},
				select: {
					id: true,
					employeeId: true,
					date: true,
					shiftSnapshot: true,
				},
			});
			if (!existingOverride || existingOverride.shiftSnapshot) {
				continue;
			}

			const requestedScheduleSnapshot = buildRequestedScheduleSnapshotFromMetadata(metadata);
			const isFlexitimeRequest =
				String(metadata.requestMode || "").toUpperCase() === "FLEXITIME";
			const overrideShiftSnapshot = {
				...requestedScheduleSnapshot,
				source: "schedule_change_request",
				shiftTypeId: isFlexitimeRequest
					? null
					: requestedScheduleSnapshot.shiftTypeId || metadata.shiftTypeId || null,
			};
			const effectiveShiftSnapshot = toScheduleImpactSnapshot(overrideShiftSnapshot, {
				source: "override",
				scheduleOverrideId: existingOverride.id,
				shiftTypeId: overrideShiftSnapshot.shiftTypeId,
				shiftTypeCode: overrideShiftSnapshot.shiftTypeCode,
				shiftTypeName: overrideShiftSnapshot.shiftTypeName,
			});

			await prisma.scheduleOverride.update({
				where: { id: existingOverride.id },
				data: {
					shiftTypeId: overrideShiftSnapshot.shiftTypeId,
					shiftSnapshot: overrideShiftSnapshot as Prisma.InputJsonValue,
				},
			});
			await recomputeAttendanceObligationsForRange(prisma as PrismaClient, {
				organizationId: request.organizationId,
				employeeId: existingOverride.employeeId,
				fromDate: existingOverride.date,
				toDate: existingOverride.date,
				reason: "ScheduleChangeOverrideSnapshotRepaired",
			});
			try {
				await refreshTimesheetForAttendanceDate(prisma as PrismaClient, {
					organizationId: request.organizationId,
					employeeId: existingOverride.employeeId,
					date: existingOverride.date,
				});
			} catch {
				// Existing submitted, locked, and paid timesheet snapshots remain stable.
			}
			await prisma.request.update({
				where: { id: request.id },
				data: {
					metadata: {
						...metadata,
						shiftTypeId: overrideShiftSnapshot.shiftTypeId,
						requestedScheduleSnapshot: overrideShiftSnapshot,
						scheduleChangeApplication: {
							...asRecord(metadata.scheduleChangeApplication),
							status:
								asRecord(metadata.scheduleChangeApplication).status ||
								"REPAIRED_OVERRIDE_SNAPSHOT",
							scheduleOverrideId: existingOverride.id,
							employeeId: existingOverride.employeeId,
							effectiveDate: existingOverride.date.toISOString(),
							effectiveShift: effectiveShiftSnapshot,
						},
					} as Prisma.InputJsonValue,
				},
			});
			await invalidateScheduleChangeImpactCaches({
				requestId: request.id,
				scheduleOverrideId: existingOverride.id,
			});
			repaired += 1;
			continue;
		}

		await applyScheduleChangeCompletionSideEffects(prisma, {
			organizationId: request.organizationId,
			requestId: request.id,
			requesterId: request.requesterId,
			targetEmployeeId: request.targetEmployeeId,
			metadata,
			actorEmployeeId:
				String(metadata.scheduleChangeApplication?.appliedByEmployeeId || "").trim() ||
				request.requesterId,
			now: new Date(),
		});
		repaired += 1;
	}

	return repaired;
}

const DEFAULT_WORKFLOW_STATES: WorkflowStateConfig[] = [
	{
		key: DEFAULT_WORKFLOW_STATE_KEYS.OPEN,
		label: "Open",
		order: 1,
		isTerminal: false,
	},
	{
		key: DEFAULT_WORKFLOW_STATE_KEYS.SUBMITTED,
		label: "Submitted",
		order: 2,
		isTerminal: false,
	},
	{
		key: DEFAULT_WORKFLOW_STATE_KEYS.FOR_APPROVAL,
		label: "For Approval",
		order: 3,
		isTerminal: false,
	},
	{
		key: DEFAULT_WORKFLOW_STATE_KEYS.IN_PROCESS,
		label: "In Process",
		order: 4,
		isTerminal: false,
	},
	{
		key: DEFAULT_WORKFLOW_STATE_KEYS.APPROVED,
		label: "Approved",
		order: 5,
		isTerminal: false,
	},
	{
		key: DEFAULT_WORKFLOW_STATE_KEYS.REJECTED,
		label: "Rejected",
		order: 6,
		isTerminal: true,
	},
	{
		key: DEFAULT_WORKFLOW_STATE_KEYS.CANCELLED,
		label: "Cancelled",
		order: 7,
		isTerminal: true,
	},
	{
		key: DEFAULT_WORKFLOW_STATE_KEYS.COMPLETED,
		label: "Completed",
		order: 8,
		isTerminal: true,
	},
];

const employeeHierarchySelect = {
	id: true,
	organizationId: true,
	role: true,
	reportToId: true,
	isDeleted: true,
	employmentStatus: true,
	level: {
		select: {
			rank: true,
		},
	},
} as const;

type EmployeeHierarchyNode = Prisma.EmployeeGetPayload<{
	select: typeof employeeHierarchySelect;
}>;

const ROLE_RANK_MAP: Record<string, number> = {
	"hris-employee": 1,
	"hris-timekeeper": 2,
	"hris-hr-user": 3,
	"hris-employee-manager": 4,
	"hris-hr-manager": 5,
	"hris-admin": 6,
	admin: 6,
	super_admin: 7,
	superadmin: 7,
};

const getNormalizedRole = (role: string | null | undefined): string =>
	typeof role === "string" ? role.trim().toLowerCase() : "";

const getRoleComparableRank = (role: string | null | undefined): number => {
	const normalized = getNormalizedRole(role);
	if (!normalized) {
		return 0;
	}

	if (ROLE_RANK_MAP[normalized] !== undefined) {
		return ROLE_RANK_MAP[normalized];
	}

	if (normalized.includes("ceo") || normalized.includes("chief")) {
		return 100;
	}
	if (normalized.includes("head")) {
		return 95;
	}
	if (normalized.includes("director")) {
		return 90;
	}
	if (normalized.includes("senior manager")) {
		return 80;
	}
	if (normalized.includes("manager")) {
		return 70;
	}
	if (normalized.includes("lead") || normalized.includes("supervisor")) {
		return 60;
	}
	if (normalized.includes("hr")) {
		return 50;
	}
	if (normalized.includes("admin")) {
		return 75;
	}

	return 10;
};

const getComparableRank = (employee: EmployeeHierarchyNode | null | undefined): number => {
	if (!employee) {
		return 0;
	}
	const levelRank = employee.level?.rank;
	if (typeof levelRank === "number") {
		return levelRank;
	}
	return getRoleComparableRank(employee.role);
};

const isAvailableApprover = (
	employee: EmployeeHierarchyNode | null,
	params: {
		organizationId: string;
		requesterId: string;
	},
): boolean => {
	if (!employee) {
		return false;
	}
	if (employee.organizationId !== params.organizationId) {
		return false;
	}
	if (employee.id === params.requesterId) {
		return false;
	}
	if (employee.isDeleted) {
		return false;
	}
	if (isEmployeeSelfServiceBlockedStatus(employee.employmentStatus)) {
		return false;
	}

	return true;
};

const getEmployeeHierarchyNode = async (
	prisma: PrismaExecutor,
	employeeId: string,
): Promise<EmployeeHierarchyNode | null> => {
	return prisma.employee.findFirst({
		where: {
			id: employeeId,
		},
		select: employeeHierarchySelect,
	});
};

const collectReportingChain = async (
	prisma: PrismaExecutor,
	params: {
		startEmployeeId?: string | null;
		organizationId: string;
		maxDepth?: number;
	},
): Promise<EmployeeHierarchyNode[]> => {
	const maxDepth = params.maxDepth ?? 20;
	const chain: EmployeeHierarchyNode[] = [];
	const visited = new Set<string>();
	let currentId = params.startEmployeeId ?? null;
	let depth = 0;

	while (currentId && depth < maxDepth && !visited.has(currentId)) {
		visited.add(currentId);
		const currentEmployee = await getEmployeeHierarchyNode(prisma, currentId);
		if (!currentEmployee) {
			break;
		}
		if (currentEmployee.organizationId !== params.organizationId) {
			break;
		}

		chain.push(currentEmployee);
		currentId = currentEmployee.reportToId ?? null;
		depth += 1;
	}

	return chain;
};

const getHigherUpFallbackCandidate = async (
	prisma: PrismaExecutor,
	params: {
		organizationId: string;
		requesterId: string;
		requesterRank: number;
		excludedIds: Set<string>;
	},
): Promise<EmployeeHierarchyNode | null> => {
	const employees = await prisma.employee.findMany({
		where: {
			organizationId: params.organizationId,
			isDeleted: false,
			id: {
				not: params.requesterId,
			},
		},
		select: employeeHierarchySelect,
	});

	const candidates = employees.filter(
		(candidate) =>
			!params.excludedIds.has(candidate.id) &&
			isAvailableApprover(candidate, {
				organizationId: params.organizationId,
				requesterId: params.requesterId,
			}),
	);

	if (candidates.length === 0) {
		return null;
	}

	const preferred = candidates.filter(
		(candidate) => getComparableRank(candidate) > params.requesterRank,
	);
	const source = preferred.length > 0 ? preferred : candidates;

	source.sort((a, b) => getComparableRank(b) - getComparableRank(a));
	return source[0] ?? null;
};

const resolveHrAssignee = async (
	prisma: PrismaExecutor,
	params: {
		organizationId: string;
		requesterId: string;
		excludedIds?: Set<string>;
	},
): Promise<AssigneeResolution> => {
	const excludedIds = params.excludedIds ?? new Set<string>();
	const hrCandidates = await prisma.employee.findMany({
		where: {
			organizationId: params.organizationId,
			isDeleted: false,
			role: {
				in: ["hris-hr-manager", "hris-hr-user"],
			},
		},
		select: employeeHierarchySelect,
	});

	const hrManagers = hrCandidates
		.filter((candidate) => getNormalizedRole(candidate.role) === "hris-hr-manager")
		.sort((a, b) => getComparableRank(b) - getComparableRank(a));
	const hrUsers = hrCandidates
		.filter((candidate) => getNormalizedRole(candidate.role) === "hris-hr-user")
		.sort((a, b) => getComparableRank(b) - getComparableRank(a));

	let fallbackLevel = 0;
	for (const hrCandidate of hrManagers) {
		excludedIds.add(hrCandidate.id);

		if (
			isAvailableApprover(hrCandidate, {
				organizationId: params.organizationId,
				requesterId: params.requesterId,
			})
		) {
			return {
				assigneeId: hrCandidate.id,
				chain: "HR_CHAIN",
				fallbackLevel,
				reason: "PRIMARY_HR_ASSIGNEE",
			};
		}

		fallbackLevel += 1;
	}

	for (const hrUser of hrUsers) {
		excludedIds.add(hrUser.id);
		if (
			isAvailableApprover(hrUser, {
				organizationId: params.organizationId,
				requesterId: params.requesterId,
			})
		) {
			return {
				assigneeId: hrUser.id,
				chain: "HR_CHAIN",
				fallbackLevel: fallbackLevel + 1,
				reason: "HR_MANAGER_UNAVAILABLE_FALLBACK_TO_HR_USER",
			};
		}
	}

	return {
		assigneeId: null,
		chain: "NONE",
		fallbackLevel,
		reason: "NO_AVAILABLE_HR_ASSIGNEE",
	};
};

export function buildAssigneeResolutionMetadata(
	resolution: AssigneeResolution,
): Record<string, unknown> {
	return {
		resolved_assignee_id: resolution.assigneeId,
		resolved_from_chain: resolution.chain,
		fallback_level: resolution.fallbackLevel,
		fallback_reason: resolution.reason ?? null,
		resolved_at: new Date().toISOString(),
	};
}

export async function resolveStepAssignee(
	prisma: PrismaExecutor,
	params: {
		organizationId: string;
		requesterId: string;
		assigneeType:
			| "REQUESTER"
			| "SUPERVISOR"
			| "TARGET_DEPARTMENT_MANAGER"
			| "HR"
			| "SYSTEM";
		requesterReportToId?: string | null;
		targetEmployeeId?: string | null;
		currentAssigneeId?: string | null;
		existingAssigneeIds?: Set<string>;
	},
): Promise<AssigneeResolution> {
	if (params.assigneeType === "SYSTEM") {
		return {
			assigneeId: null,
			chain: "SYSTEM",
			fallbackLevel: 0,
			reason: "SYSTEM_STEP",
		};
	}

	if (params.assigneeType === "REQUESTER") {
		return {
			assigneeId: params.requesterId,
			chain: "REQUESTER",
			fallbackLevel: 0,
			reason: "REQUESTER_STEP",
		};
	}

	const requester = await getEmployeeHierarchyNode(prisma, params.requesterId);
	const requesterRank = getComparableRank(requester);
	const excludedIds = new Set<string>([params.requesterId]);
	const targetEmployeeId = params.targetEmployeeId ?? null;
	if (targetEmployeeId) {
		excludedIds.add(targetEmployeeId);
	}

	if (params.existingAssigneeIds) {
		params.existingAssigneeIds.forEach((id) => excludedIds.add(id));
	}

	if (params.currentAssigneeId) {
		const currentAssignee = await getEmployeeHierarchyNode(prisma, params.currentAssigneeId);
		if (
			isAvailableApprover(currentAssignee, {
				organizationId: params.organizationId,
				requesterId: params.requesterId,
			})
		) {
			return {
				assigneeId: currentAssignee?.id ?? null,
				chain: "CURRENT_ASSIGNEE",
				fallbackLevel: 0,
				reason: "CURRENT_ASSIGNEE_IS_AVAILABLE",
			};
		}
		if (currentAssignee?.id) {
			excludedIds.add(currentAssignee.id);
		}
	}

	if (params.assigneeType === "TARGET_DEPARTMENT_MANAGER") {
		const targetEmployee = params.targetEmployeeId
			? await prisma.employee.findFirst({
					where: {
						id: params.targetEmployeeId,
						organizationId: params.organizationId,
						isDeleted: false,
					},
					select: {
						reportToId: true,
						department: {
							select: {
								managerId: true,
							},
						},
					},
			  })
			: null;

		const targetDepartmentManagerId = targetEmployee?.department?.managerId ?? null;
		if (targetDepartmentManagerId && targetDepartmentManagerId !== targetEmployeeId) {
			if (targetDepartmentManagerId === params.requesterId) {
				return {
					assigneeId: params.requesterId,
					chain: "SELF_APPROVAL",
					fallbackLevel: 0,
					reason: "TARGET_DEPARTMENT_MANAGER_IS_REQUESTER_AUTO_APPROVED",
				};
			}
			const targetDepartmentManager = await getEmployeeHierarchyNode(
				prisma,
				targetDepartmentManagerId,
			);
			excludedIds.add(targetDepartmentManagerId);
			if (
				isAvailableApprover(targetDepartmentManager, {
					organizationId: params.organizationId,
					requesterId: params.requesterId,
				})
			) {
				return {
					assigneeId: targetDepartmentManagerId,
					chain: "SUPERVISOR_CHAIN",
					fallbackLevel: 0,
					reason: "TARGET_DEPARTMENT_MANAGER_ASSIGNED",
				};
			}
		}

		const targetSupervisorId = targetEmployee?.reportToId ?? null;
		if (targetSupervisorId && targetSupervisorId !== targetEmployeeId) {
			if (targetSupervisorId === params.requesterId) {
				return {
					assigneeId: params.requesterId,
					chain: "SELF_APPROVAL",
					fallbackLevel: 1,
					reason: "TARGET_SUPERVISOR_IS_REQUESTER_AUTO_APPROVED",
				};
			}
			const targetSupervisor = await getEmployeeHierarchyNode(prisma, targetSupervisorId);
			excludedIds.add(targetSupervisorId);
			if (
				isAvailableApprover(targetSupervisor, {
					organizationId: params.organizationId,
					requesterId: params.requesterId,
				})
			) {
				return {
					assigneeId: targetSupervisorId,
					chain: "SUPERVISOR_CHAIN",
					fallbackLevel: 1,
					reason: "TARGET_DEPARTMENT_MANAGER_UNAVAILABLE_FALLBACK_TO_TARGET_SUPERVISOR",
				};
			}
		}

		const hrFallback = await resolveHrAssignee(prisma, {
			organizationId: params.organizationId,
			requesterId: params.requesterId,
			excludedIds,
		});
		if (hrFallback.assigneeId) {
			return {
				...hrFallback,
				reason: "TARGET_DEPARTMENT_MANAGER_UNAVAILABLE_FALLBACK_TO_HR_CHAIN",
			};
		}

		return {
			assigneeId: null,
			chain: "NONE",
			fallbackLevel: 2,
			reason: "NO_AVAILABLE_TARGET_DEPARTMENT_MANAGER_OR_FALLBACK_APPROVER",
		};
	}

	if (params.assigneeType === "SUPERVISOR") {
		const chainStartId = params.requesterReportToId ?? requester?.reportToId ?? null;
		const reportingChain = await collectReportingChain(prisma, {
			startEmployeeId: chainStartId,
			organizationId: params.organizationId,
		});

		for (let index = 0; index < reportingChain.length; index += 1) {
			const candidate = reportingChain[index];
			excludedIds.add(candidate.id);
			if (
				isAvailableApprover(candidate, {
					organizationId: params.organizationId,
					requesterId: params.requesterId,
				})
			) {
				return {
					assigneeId: candidate.id,
					chain: "SUPERVISOR_CHAIN",
					fallbackLevel: index,
					reason:
						index === 0
							? "DIRECT_SUPERVISOR_ASSIGNED"
							: "SUPERVISOR_UNAVAILABLE_ESCALATED_TO_HIGHER_SUPERVISOR",
				};
			}
		}

		const higherUp = await getHigherUpFallbackCandidate(prisma, {
			organizationId: params.organizationId,
			requesterId: params.requesterId,
			requesterRank,
			excludedIds,
		});
		if (higherUp) {
			return {
				assigneeId: higherUp.id,
				chain: "HIGHER_UP_CHAIN",
				fallbackLevel: reportingChain.length + 1,
				reason: "SUPERVISOR_CHAIN_EXHAUSTED_ESCALATED_BY_RANK",
			};
		}

		const hrFallback = await resolveHrAssignee(prisma, {
			organizationId: params.organizationId,
			requesterId: params.requesterId,
			excludedIds,
		});
		if (hrFallback.assigneeId) {
			return {
				...hrFallback,
				reason: "SUPERVISOR_CHAIN_EXHAUSTED_FALLBACK_TO_HR_CHAIN",
			};
		}

		return {
			assigneeId: null,
			chain: "NONE",
			fallbackLevel: reportingChain.length + 1,
			reason: "NO_AVAILABLE_SUPERVISOR_OR_HIGHER_UP_APPROVER",
		};
	}

	return resolveHrAssignee(prisma, {
		organizationId: params.organizationId,
		requesterId: params.requesterId,
		excludedIds,
	});
}

const normalizeWorkflowSteps = (steps: unknown): WorkflowStepConfig[] => {
	if (!Array.isArray(steps)) {
		return [];
	}

	return steps.filter((step): step is WorkflowStepConfig => {
		return (
			typeof step === "object" &&
			step !== null &&
			typeof (step as WorkflowStepConfig).step_number === "number" &&
			typeof (step as WorkflowStepConfig).step_name === "string" &&
			typeof (step as WorkflowStepConfig).step_type === "string" &&
			typeof (step as WorkflowStepConfig).assignee_type === "string"
		);
	});
};

const getWorkflowStepsForRequestType = (
	requestType: string | null | undefined,
	steps: unknown,
): WorkflowStepConfig[] => {
	const normalizedSteps = normalizeWorkflowSteps(steps);
	if (isAttendanceCorrectionRequestType(requestType)) {
		return normalizeAttendanceCorrectionWorkflowSteps(normalizedSteps);
	}
	if (isOvertimeRequestType(requestType)) {
		return normalizeOvertimeWorkflowSteps(normalizedSteps);
	}
	return isScheduleChangeRequestType(requestType)
		? normalizeScheduleChangeWorkflowStepsForHrApproval(normalizedSteps)
		: normalizedSteps;
};

const shouldNormalizeWorkflowTemplate = (workflow: {
	code?: string | null;
	requestType?: string | null;
}) =>
	isScheduleChangeWorkflowCode(workflow.code) ||
	isScheduleChangeRequestType(workflow.requestType) ||
	isAttendanceCorrectionWorkflowCode(workflow.code) ||
	isAttendanceCorrectionRequestType(workflow.requestType) ||
	isOvertimeWorkflowCode(workflow.code) ||
	isOvertimeRequestType(workflow.requestType);

const normalizeDefaultWorkflowTemplate = <T extends { code?: string | null; requestType?: string | null; steps: unknown }>(
	workflow: T,
): T => {
	if (isAttendanceCorrectionWorkflowCode(workflow.code) || isAttendanceCorrectionRequestType(workflow.requestType)) {
		return {
			...workflow,
			steps: normalizeAttendanceCorrectionWorkflowSteps(workflow.steps),
		};
	}
	if (isOvertimeWorkflowCode(workflow.code) || isOvertimeRequestType(workflow.requestType)) {
		return {
			...workflow,
			steps: normalizeOvertimeWorkflowSteps(workflow.steps),
		};
	}
	if (!shouldNormalizeWorkflowTemplate(workflow)) {
		return workflow;
	}

	return {
		...workflow,
		steps: normalizeScheduleChangeWorkflowStepsForHrApproval(workflow.steps),
	};
};

export async function repairScheduleChangeHrApprovalWorkflowTemplates(
	prisma: PrismaExecutor,
	params?: {
		organizationId?: string | null;
	},
): Promise<number> {
	const templates = await prisma.workflowInstance.findMany({
		where: {
			...(params?.organizationId ? { organizationId: params.organizationId } : {}),
			domain: "REQUEST",
			domainRecordId: null,
			isDeleted: false,
			OR: [
				{ code: "WF-SCHEDULE-CHANGE-DEFAULT" },
				{ requestType: "SCHEDULE_CHANGE" },
			],
		},
		select: {
			id: true,
			steps: true,
		},
	});

	let repaired = 0;
	for (const template of templates) {
		if (!hasScheduleChangeWorkflowStepDrift(template.steps)) {
			continue;
		}

		await prisma.workflowInstance.update({
			where: { id: template.id },
			data: {
				steps: normalizeScheduleChangeWorkflowStepsForHrApproval(
					template.steps,
				) as unknown as Prisma.InputJsonValue,
			},
		});
		repaired += 1;
	}

	return repaired;
}

export async function repairScheduleChangeHrApprovalStepIfNeeded(
	prisma: PrismaExecutor,
	requestId: string,
): Promise<boolean> {
	const request = await prisma.request.findFirst({
		where: {
			id: requestId,
			type: "SCHEDULE_CHANGE",
			isDeleted: false,
		},
		select: {
			id: true,
			currentWorkflowStateKey: true,
			currentStepExecution: {
				select: {
					id: true,
					stepNumber: true,
					stepName: true,
					stepType: true,
					assigneeType: true,
					status: true,
					metadata: true,
				},
			},
			workflowInstance: {
				select: {
					id: true,
					steps: true,
				},
			},
		},
	});

	if (!request) {
		return false;
	}

	let repaired = false;
	const currentStep = request.currentStepExecution;
	if (
		currentStep?.status === "PENDING" &&
		isStaleScheduleChangeHrTaskExecution(currentStep)
	) {
		const currentMetadata = asRecord(currentStep.metadata);
		await prisma.workflowStepExecution.update({
			where: { id: currentStep.id },
			data: {
				stepType: "APPROVAL",
				stepName: SCHEDULE_CHANGE_HR_APPROVAL_STEP_NAME,
				metadata: {
					...currentMetadata,
					scheduleChangeHrApprovalRepair: {
						repairedAt: new Date().toISOString(),
						fromStepType: currentStep.stepType,
						fromStepName: currentStep.stepName,
						toStepType: "APPROVAL",
						toStepName: SCHEDULE_CHANGE_HR_APPROVAL_STEP_NAME,
					},
				} as Prisma.InputJsonValue,
			},
		});
		repaired = true;
	}

	if (
		request.workflowInstance?.id &&
		hasScheduleChangeWorkflowStepDrift(request.workflowInstance.steps)
	) {
		await prisma.workflowInstance.update({
			where: { id: request.workflowInstance.id },
			data: {
				steps: normalizeScheduleChangeWorkflowStepsForHrApproval(
					request.workflowInstance.steps,
				) as unknown as Prisma.InputJsonValue,
			},
		});
		repaired = true;
	}

	if (
		repaired &&
		currentStep?.status === "PENDING" &&
		["IN_PROCESS", "APPROVED"].includes(
			String(request.currentWorkflowStateKey || "").toUpperCase(),
		)
	) {
		await prisma.request.update({
			where: { id: request.id },
			data: {
				currentWorkflowStateKey: "FOR_APPROVAL",
			},
		});
	}

	return repaired;
}

export async function repairAttendanceCorrectionSupervisorWorkflowIfNeeded(
	prisma: PrismaExecutor,
	requestId: string,
): Promise<boolean> {
	const request = await prisma.request.findFirst({
		where: {
			id: requestId,
			type: "ATTENDANCE_CORRECTION",
			isDeleted: false,
		},
		select: {
			id: true,
			organizationId: true,
			requesterId: true,
			targetEmployeeId: true,
			currentWorkflowStateKey: true,
			currentStepExecutionId: true,
			workflowInstanceId: true,
			requester: {
				select: {
					reportToId: true,
				},
			},
			workflowInstance: {
				select: {
					id: true,
					steps: true,
				},
			},
			stepExecutions: {
				where: { isDeleted: false },
				orderBy: { stepNumber: "asc" },
				select: {
					id: true,
					stepNumber: true,
					stepName: true,
					stepType: true,
					assigneeType: true,
					assigneeId: true,
					status: true,
					metadata: true,
				},
			},
		},
	});

	if (!request) {
		return false;
	}

	const alreadySupervisorLed = request.stepExecutions.some(
		(step) =>
			String(step.assigneeType || "").toUpperCase() === "SUPERVISOR" &&
			String(step.stepType || "").toUpperCase() === "APPROVAL",
	);
	if (alreadySupervisorLed) {
		return false;
	}

	const completedHrSubmission = request.stepExecutions.find(
		(step) =>
			String(step.status || "").toUpperCase() === "COMPLETED" &&
			String(step.stepType || "").toUpperCase() === "SUBMISSION" &&
			String(step.assigneeType || "").toUpperCase() === "HR",
	);
	if (completedHrSubmission) {
		await prisma.workflowStepExecution.update({
			where: { id: completedHrSubmission.id },
			data: {
				stepNumber: 1,
				stepName: "Employee Submission",
				assigneeType: "REQUESTER",
				assigneeId: request.requesterId,
			},
		});
	}

	const pendingHrApproval = request.stepExecutions.find(
		(step) =>
			String(step.status || "").toUpperCase() === "PENDING" &&
			String(step.stepType || "").toUpperCase() === "APPROVAL" &&
			String(step.assigneeType || "").toUpperCase() === "HR",
	);
	if (!pendingHrApproval) {
		return false;
	}

	const resolution = await resolveStepAssignee(prisma, {
		organizationId: request.organizationId,
		requesterId: request.requesterId,
		assigneeType: "SUPERVISOR",
		requesterReportToId: request.requester?.reportToId ?? null,
		targetEmployeeId: request.targetEmployeeId ?? null,
	});

	const currentMetadata = asRecord(pendingHrApproval.metadata);
	await prisma.workflowStepExecution.update({
		where: { id: pendingHrApproval.id },
		data: {
			stepNumber: 2,
			stepName: "Manager Approval",
			stepType: "APPROVAL",
			assigneeType: "SUPERVISOR",
			assigneeId: resolution.assigneeId,
			metadata: {
				...currentMetadata,
				approvalResolution: buildAssigneeResolutionMetadata(resolution),
				attendanceCorrectionSupervisorRepair: {
					repairedAt: new Date().toISOString(),
					fromAssigneeType: pendingHrApproval.assigneeType,
					fromStepName: pendingHrApproval.stepName,
				},
			} as Prisma.InputJsonValue,
		},
	});

	const hasHrReviewTask = request.stepExecutions.some(
		(step) =>
			String(step.assigneeType || "").toUpperCase() === "HR" &&
			String(step.stepType || "").toUpperCase() === "TASK" &&
			step.id !== pendingHrApproval.id,
	);
	if (!hasHrReviewTask) {
		const hrResolution = await resolveStepAssignee(prisma, {
			organizationId: request.organizationId,
			requesterId: request.requesterId,
			assigneeType: "HR",
			requesterReportToId: request.requester?.reportToId ?? null,
			targetEmployeeId: request.targetEmployeeId ?? null,
		});
		await prisma.workflowStepExecution.create({
			data: {
				organizationId: request.organizationId,
				workflowInstanceId: request.workflowInstanceId,
				requestId: request.id,
				stepNumber: 3,
				stepName: "HR Review",
				stepType: "TASK",
				assigneeType: "HR",
				assigneeId: hrResolution.assigneeId,
				status: "PENDING",
				isRequired: true,
				metadata: {
					approvalResolution: buildAssigneeResolutionMetadata(hrResolution),
				} as Prisma.InputJsonValue,
			},
		});
	}

	const systemStep = request.stepExecutions.find(
		(step) => String(step.assigneeType || "").toUpperCase() === "SYSTEM",
	);
	if (systemStep) {
		await prisma.workflowStepExecution.update({
			where: { id: systemStep.id },
			data: {
				stepNumber: 4,
				stepName: "Attendance Correction Completion",
			},
		});
	}

	if (request.workflowInstance?.id) {
		await prisma.workflowInstance.update({
			where: { id: request.workflowInstance.id },
			data: {
				steps: normalizeAttendanceCorrectionWorkflowSteps(
					request.workflowInstance.steps,
				) as unknown as Prisma.InputJsonValue,
			},
		});
	}

	if (request.currentStepExecutionId === pendingHrApproval.id) {
		await prisma.request.update({
			where: { id: request.id },
			data: {
				currentWorkflowStateKey: "SUBMITTED",
			},
		});
	}

	return true;
}

export async function completeAttendanceCorrectionHrReviewIfActorIsHr(
	prisma: PrismaExecutor,
	params: {
		requestId: string;
		actingEmployeeId: string;
		actingEmployeeRole?: string | null;
		comment?: string;
	},
): Promise<boolean> {
	const request = await prisma.request.findFirst({
		where: {
			id: params.requestId,
			type: "ATTENDANCE_CORRECTION",
			isDeleted: false,
		},
		select: {
			id: true,
			type: true,
			currentStepExecution: {
				select: {
					id: true,
					stepName: true,
					stepType: true,
					assigneeType: true,
					status: true,
				},
			},
		},
	});

	if (
		!shouldAutoCompleteAttendanceCorrectionHrReview({
			requestType: request?.type,
			actingEmployeeRole: params.actingEmployeeRole,
			nextStep: request?.currentStepExecution ?? null,
		})
	) {
		return false;
	}

	await completeTaskStep(
		prisma,
		params.requestId,
		request!.currentStepExecution!.stepName,
		params.actingEmployeeId,
		params.comment || "Completed because an HR actor already approved this request",
	);
	return true;
}

export async function repairAttendanceCorrectionHrReviewIfHrAlreadyApproved(
	prisma: PrismaExecutor,
	requestId: string,
): Promise<boolean> {
	const request = await prisma.request.findFirst({
		where: {
			id: requestId,
			type: "ATTENDANCE_CORRECTION",
			isDeleted: false,
		},
		select: {
			id: true,
			type: true,
			currentStepExecution: {
				select: {
					id: true,
					stepName: true,
					stepType: true,
					assigneeType: true,
					status: true,
				},
			},
			stepExecutions: {
				where: { isDeleted: false },
				select: {
					id: true,
					stepName: true,
					stepType: true,
					assigneeType: true,
					assigneeId: true,
					status: true,
					metadata: true,
				},
			},
		},
	});

	if (
		!request ||
		!isPendingAttendanceCorrectionHrReviewStep(request.currentStepExecution)
	) {
		return false;
	}

	const managerStep = request.stepExecutions.find(
		(step) =>
			normalizeTokenForAttendanceRepair(step.stepName) === "MANAGER_APPROVAL" &&
			["APPROVED", "COMPLETED"].includes(normalizeTokenForAttendanceRepair(step.status)),
	);
	if (!managerStep) {
		return false;
	}

	const managerMetadata = asRecord(managerStep.metadata);
	const lastDecision = asRecord(managerMetadata.lastDecision);
	const actingEmployeeId =
		(typeof lastDecision.decidedBy === "string" && lastDecision.decidedBy) ||
		managerStep.assigneeId ||
		null;
	if (!actingEmployeeId) {
		return false;
	}

	const actingEmployee = await prisma.employee.findFirst({
		where: { id: actingEmployeeId, isDeleted: false },
		select: { id: true, role: true },
	});
	if (!isAttendanceCorrectionHrRole(actingEmployee?.role)) {
		return false;
	}

	return completeAttendanceCorrectionHrReviewIfActorIsHr(prisma, {
		requestId,
		actingEmployeeId,
		actingEmployeeRole: actingEmployee?.role,
		comment: "Auto-completed because HR already approved the manager step",
	});
}

const normalizeTokenForAttendanceRepair = (value?: string | null) =>
	String(value || "")
		.trim()
		.toUpperCase()
		.replace(/[\s-]+/g, "_");

export async function repairScheduleChangeHrApprovalQueueIfNeeded(
	prisma: PrismaExecutor,
	params?: {
		organizationId?: string | null;
		limit?: number;
	},
): Promise<number> {
	await repairScheduleChangeHrApprovalWorkflowTemplates(prisma, {
		organizationId: params?.organizationId,
	});

	const candidates = await prisma.request.findMany({
		where: {
			...(params?.organizationId ? { organizationId: params.organizationId } : {}),
			type: "SCHEDULE_CHANGE",
			isDeleted: false,
			currentStepExecutionId: { not: null },
			currentWorkflowStateKey: {
				in: ["OPEN", "SUBMITTED", "FOR_APPROVAL", "IN_PROCESS", "APPROVED"],
			},
		},
		select: {
			id: true,
			currentStepExecution: {
				select: {
					stepNumber: true,
					stepName: true,
					stepType: true,
					assigneeType: true,
					status: true,
				},
			},
		},
		take: Math.max(1, params?.limit ?? 100),
	});

	let repaired = 0;
	for (const request of candidates) {
		if (!isStaleScheduleChangeHrTaskExecution(request.currentStepExecution)) {
			continue;
		}
		if (await repairScheduleChangeHrApprovalStepIfNeeded(prisma, request.id)) {
			repaired += 1;
		}
	}

	return repaired;
}

export const getDefaultWorkflowStates = (): WorkflowStateConfig[] =>
	DEFAULT_WORKFLOW_STATES.map((state) => ({
		...state,
	}));

export const normalizeWorkflowStates = (states: unknown): WorkflowStateConfig[] => {
	if (!Array.isArray(states) || states.length === 0) {
		return getDefaultWorkflowStates();
	}

	const normalized = states
		.filter((state): state is WorkflowStateConfig => {
			return (
				typeof state === "object" &&
				state !== null &&
				typeof (state as WorkflowStateConfig).key === "string" &&
				(state as WorkflowStateConfig).key.trim().length > 0
			);
		})
		.map((state, index) => ({
			key: state.key.trim().toUpperCase().replace(/\s+/g, "_"),
			label: state.label || state.key,
			order: typeof state.order === "number" ? state.order : index + 1,
			isTerminal: state.isTerminal === true,
		}))
		.sort((a, b) => a.order - b.order);

	return normalized.length > 0 ? normalized : getDefaultWorkflowStates();
};

export const getStateLabel = (states: WorkflowStateConfig[], key: WorkflowStateKey): string =>
	states.find((state) => state.key === key)?.label || key.replace(/_/g, " ");

export const getStepEnterState = (
	step: WorkflowStepConfig | null | undefined,
): WorkflowStateKey => {
	if (step?.state_on_enter) {
		return step.state_on_enter;
	}
	if (step?.step_type === "SUBMISSION") {
		return DEFAULT_WORKFLOW_STATE_KEYS.OPEN;
	}
	if (step?.step_type === "APPROVAL") {
		return DEFAULT_WORKFLOW_STATE_KEYS.SUBMITTED;
	}
	if (step?.step_type === "TASK") {
		return step.assignee_type === "SYSTEM"
			? DEFAULT_WORKFLOW_STATE_KEYS.APPROVED
			: DEFAULT_WORKFLOW_STATE_KEYS.IN_PROCESS;
	}
	return DEFAULT_WORKFLOW_STATE_KEYS.OPEN;
};

export const getFinalStateForSteps = (steps: WorkflowStepConfig[]): WorkflowStateKey => {
	const lastStep = steps[steps.length - 1];
	if (lastStep?.step_type === "TASK") {
		return DEFAULT_WORKFLOW_STATE_KEYS.COMPLETED;
	}
	return DEFAULT_WORKFLOW_STATE_KEYS.APPROVED;
};

export async function autoCompleteSystemSteps(
	prisma: PrismaClient | Prisma.TransactionClient,
	params: {
		requestId: string;
		changedByEmployeeId?: string | null;
		source?: string;
	},
): Promise<void> {
	for (let index = 0; index < 10; index += 1) {
		const request = await prisma.request.findUnique({
			where: { id: params.requestId },
			select: {
				currentStepExecutionId: true,
				requesterId: true,
			},
		});

		if (!request?.currentStepExecutionId) {
			return;
		}

		const currentSystemStep = await prisma.workflowStepExecution.findFirst({
			where: {
				id: request.currentStepExecutionId,
				requestId: params.requestId,
				isDeleted: false,
				status: "PENDING",
				assigneeType: "SYSTEM",
			},
			select: {
				id: true,
				metadata: true,
			},
		});

		if (!currentSystemStep) {
			return;
		}

		const now = new Date();
		const currentMetadata =
			currentSystemStep.metadata && typeof currentSystemStep.metadata === "object"
				? (currentSystemStep.metadata as Record<string, unknown>)
				: {};

		await prisma.workflowStepExecution.update({
			where: { id: currentSystemStep.id },
			data: {
				status: "COMPLETED",
				completedAt: now,
				assigneeId: null,
				comments: "Automatically completed by system",
				metadata: {
					...currentMetadata,
					systemCompletion: {
						completedAt: now.toISOString(),
						source: params.source ?? "system_step_auto_completed",
					},
				} as Prisma.InputJsonValue,
			},
		});

		await updateRequestStepProgress(prisma, params.requestId, currentSystemStep.id, {
			changedByEmployeeId: params.changedByEmployeeId ?? request.requesterId ?? null,
			source: params.source ?? "system_step_auto_completed",
		});
	}
}

const getStepActorLabel = async (
	prisma: PrismaExecutor,
	employeeId?: string | null,
): Promise<string | null> => {
	if (!employeeId) {
		return null;
	}

	const employee = await prisma.employee.findFirst({
		where: { id: employeeId },
		select: {
			employeeId: true,
			person: {
				select: {
					personalInfo: true,
				},
			},
		},
	});

	const fullName = employee?.person?.personalInfo
		? `${getJsonString((employee as any).person?.personalInfo, "firstName")} ${getJsonString((employee as any).person?.personalInfo, "lastName")}`.trim()
		: "";

	return fullName || employee?.employeeId || null;
};

const logRequestCreatedTransactionIfNeeded = async (
	prisma: PrismaExecutor,
	params: {
		organizationId: string;
		requestId: string;
		requesterId: string;
		workflowInstanceId?: string | null;
		description?: string | null;
	},
) => {
	const existingCount = await prisma.requestTransaction.count({
		where: { requestId: params.requestId },
	});

	if (existingCount > 0) {
		return;
	}

	await createRequestTransaction(prisma, {
		organizationId: params.organizationId,
		requestId: params.requestId,
		workflowInstanceId: params.workflowInstanceId ?? null,
		actorEmployeeId: params.requesterId,
		eventCategory: RequestTransactionEventCategory.LIFECYCLE,
		eventKey: RequestTransactionEventKey.REQUEST_CREATED,
		eventSource: "request_runtime",
		title: "Request created",
		description: params.description || "The request was created.",
	});
};

const logRequestStepAssignment = async (
	prisma: PrismaExecutor,
	params: {
		organizationId: string;
		requestId: string;
		workflowInstanceId?: string | null;
		stepExecutionId?: string | null;
		actorEmployeeId?: string | null;
		eventSource: string;
	},
) => {
	if (!params.stepExecutionId) {
		return;
	}

	const step = await prisma.workflowStepExecution.findFirst({
		where: {
			id: params.stepExecutionId,
			requestId: params.requestId,
			isDeleted: false,
		},
		select: {
			id: true,
			stepNumber: true,
			stepName: true,
			stepType: true,
			assigneeType: true,
			assigneeId: true,
			assigneeRole: true,
		},
	});

	if (!step) {
		return;
	}

	const assigneeLabel =
		(await getStepActorLabel(prisma, step.assigneeId)) ||
		(step.assigneeType === "REQUESTER"
			? "Requester"
			: step.assigneeType === "SUPERVISOR"
				? "Supervisor"
				: step.assigneeType === "HR"
					? "HR"
					: "System");

	await createRequestTransaction(prisma, {
		organizationId: params.organizationId,
		requestId: params.requestId,
		workflowInstanceId: params.workflowInstanceId ?? null,
		stepExecutionId: step.id,
		actorEmployeeId: params.actorEmployeeId ?? null,
		eventCategory: RequestTransactionEventCategory.ASSIGNMENT,
		eventKey: RequestTransactionEventKey.STEP_ASSIGNED,
		eventSource: params.eventSource,
		title: `Step ${step.stepNumber} assigned`,
		description: `${step.stepName} is now assigned to ${assigneeLabel}.`,
		metadata: {
			stepNumber: step.stepNumber,
			stepName: step.stepName,
			stepType: step.stepType,
			assigneeType: step.assigneeType,
			assigneeId: step.assigneeId,
			assigneeLabel,
		},
	});
};

export async function setRequestWorkflowState(
	prisma: PrismaExecutor,
	params: {
		requestId: string;
		stateKey: WorkflowStateKey;
		states: WorkflowStateConfig[];
		source: string;
		stepExecutionId?: string | null;
		stepNumber?: number | null;
		stepName?: string | null;
		changedByEmployeeId?: string | null;
		metadata?: Record<string, unknown>;
	},
): Promise<void> {
	const request = await prisma.request.findUnique({
		where: { id: params.requestId },
		select: {
			workflowInstanceId: true,
			currentWorkflowStateKey: true,
			organizationId: true,
		},
	});

	if (!request) {
		throw new Error(`Request not found: ${params.requestId}`);
	}

	await prisma.request.update({
		where: { id: params.requestId },
		data: {
			currentWorkflowStateKey: params.stateKey as any,
		},
	});

	if (request.workflowInstanceId) {
		await prisma.workflowInstance.update({
			where: { id: request.workflowInstanceId },
			data: {
				currentStateKey: params.stateKey,
			},
		});
	}

	if (request.currentWorkflowStateKey !== params.stateKey) {
		await createRequestTransaction(prisma, {
			organizationId: request.organizationId,
			requestId: params.requestId,
			workflowInstanceId: request.workflowInstanceId ?? null,
			stepExecutionId: params.stepExecutionId ?? null,
			actorEmployeeId: params.changedByEmployeeId ?? null,
			eventCategory: RequestTransactionEventCategory.WORKFLOW,
			eventKey: RequestTransactionEventKey.WORKFLOW_STATE_CHANGED,
			eventSource: params.source,
			title: `Workflow state changed to ${getStateLabel(params.states, params.stateKey)}`,
			description: params.stepName
				? `State changed during ${params.stepName}.`
				: "Workflow state changed.",
			fromStateKey: request.currentWorkflowStateKey ?? null,
			toStateKey: params.stateKey,
			metadata: {
				stepNumber: params.stepNumber ?? null,
				stepName: params.stepName ?? null,
				label: getStateLabel(params.states, params.stateKey),
				...(params.metadata || {}),
			},
		});
	}
}

export async function getDefaultRequestWorkflow(
	prisma: PrismaClient | Prisma.TransactionClient,
	organizationId: string,
	requestType: string,
	preferredCode?: string | null,
) {
	const normalizedPreferredCode = String(preferredCode || "")
		.trim()
		.toUpperCase();
	const normalizedRequestType = String(requestType || "")
		.trim()
		.toUpperCase();

	const workflowTemplates = await prisma.workflowInstance.findMany({
		where: {
			organizationId,
			domain: "REQUEST",
			domainRecordId: null,
			isDeleted: false,
		},
		select: {
			code: true,
			name: true,
			description: true,
			domain: true,
			requestType: true,
			steps: true,
			states: true,
			createdAt: true,
			updatedAt: true,
		},
	});

	if (workflowTemplates.length > 0) {
		const exactCodeMatch = normalizedPreferredCode
			? workflowTemplates.find(
					(template) =>
						String(template.code || "")
							.trim()
							.toUpperCase() === normalizedPreferredCode,
			  )
			: null;

		if (exactCodeMatch) {
			return normalizeDefaultWorkflowTemplate({
				code: exactCodeMatch.code,
				name: exactCodeMatch.name,
				description: exactCodeMatch.description,
				domain: exactCodeMatch.domain,
				requestType: exactCodeMatch.requestType,
				steps: exactCodeMatch.steps,
				states: exactCodeMatch.states,
				isActive: true,
				isDefault: true,
				createdAt: exactCodeMatch.createdAt,
				updatedAt: exactCodeMatch.updatedAt,
			});
		}

		const requestTypeMatches = workflowTemplates.filter(
			(template) =>
				String(template.requestType || "")
					.trim()
					.toUpperCase() === normalizedRequestType,
		);

		if (requestTypeMatches.length === 1) {
			const selected = requestTypeMatches[0];
			return normalizeDefaultWorkflowTemplate({
				code: selected.code,
				name: selected.name,
				description: selected.description,
				domain: selected.domain,
				requestType: selected.requestType,
				steps: selected.steps,
				states: selected.states,
				isActive: true,
				isDefault: true,
				createdAt: selected.createdAt,
				updatedAt: selected.updatedAt,
			});
		}

		if (requestTypeMatches.length > 1) {
			const selected =
				requestTypeMatches.find((template) => Boolean(String(template.code || "").trim())) ||
				requestTypeMatches[0];
			return normalizeDefaultWorkflowTemplate({
				code: selected.code,
				name: selected.name,
				description: selected.description,
				domain: selected.domain,
				requestType: selected.requestType,
				steps: selected.steps,
				states: selected.states,
				isActive: true,
				isDefault: true,
				createdAt: selected.createdAt,
				updatedAt: selected.updatedAt,
			});
		}
	}

	const organization = await prisma.organization.findFirst({
		where: {
			id: organizationId,
			isDeleted: false,
		},
		select: {
			branding: true,
		},
	});

	const brandingWorkflow = getRequestWorkflowConfig({
		branding: organization?.branding,
		requestType: normalizedRequestType,
		preferredCode: normalizedPreferredCode || undefined,
	});

	if (brandingWorkflow) {
		return normalizeDefaultWorkflowTemplate(brandingWorkflow);
	}

	return null;
}

export async function createRequestStepExecutions(
	prisma: PrismaClient | Prisma.TransactionClient,
	params: {
		organizationId: string;
		requestId: string;
		steps: unknown;
		workflowStates?: unknown;
		workflowCode?: string | null;
		workflowName?: string | null;
		workflowDescription?: string | null;
		requestType?: string | null;
		requesterId: string;
		reportToId?: string | null;
		targetEmployeeId?: string | null;
	},
): Promise<number> {
	const requestRecord = await prisma.request.findUnique({
		where: { id: params.requestId },
		select: {
			id: true,
			type: true,
			workflowInstanceId: true,
			description: true,
		},
	});

	if (!requestRecord) {
		throw new Error(`Request not found: ${params.requestId}`);
	}

	const normalizedSteps = getWorkflowStepsForRequestType(
		params.requestType || requestRecord.type,
		params.steps,
	);
	if (normalizedSteps.length === 0) {
		return 0;
	}

	const workflowStates = normalizeWorkflowStates(params.workflowStates);
	let workflowInstanceId = requestRecord.workflowInstanceId ?? null;
	if (!workflowInstanceId) {
		const workflowInstance = await prisma.workflowInstance.create({
			data: {
				organizationId: params.organizationId,
				domain: "REQUEST",
				domainRecordId: params.requestId,
				requestType: (params.requestType || requestRecord.type) as any,
				code: params.workflowCode || null,
				name: params.workflowName || null,
				description: params.workflowDescription || null,
				steps: normalizedSteps as unknown as Prisma.InputJsonValue,
				states: workflowStates as unknown as Prisma.InputJsonValue,
				currentStateKey: DEFAULT_WORKFLOW_STATE_KEYS.OPEN,
			},
		});
		workflowInstanceId = workflowInstance.id;
		await prisma.request.update({
			where: { id: params.requestId },
			data: { workflowInstanceId },
		});
	} else {
		await prisma.workflowInstance.update({
			where: { id: workflowInstanceId },
			data: {
				domain: "REQUEST",
				domainRecordId: params.requestId,
				requestType: (params.requestType || requestRecord.type) as any,
				code: params.workflowCode || null,
				name: params.workflowName || null,
				description: params.workflowDescription || null,
				steps: normalizedSteps as unknown as Prisma.InputJsonValue,
				states: workflowStates as unknown as Prisma.InputJsonValue,
				currentStateKey: DEFAULT_WORKFLOW_STATE_KEYS.OPEN,
			},
		});
	}

	await logRequestCreatedTransactionIfNeeded(prisma, {
		organizationId: params.organizationId,
		requestId: params.requestId,
		requesterId: params.requesterId,
		workflowInstanceId,
		description: requestRecord.description,
	});

	const now = new Date();
	const requester = await getEmployeeHierarchyNode(prisma, params.requesterId);
	const requesterReportToId = params.reportToId ?? requester?.reportToId ?? null;

	const executionData: Prisma.WorkflowStepExecutionCreateManyInput[] = [];
	const assignedIds = new Set<string>();

	for (const step of normalizedSteps) {
		const isRequired = step.is_required !== false;
		const resolution = await resolveStepAssignee(prisma, {
			organizationId: params.organizationId,
			requesterId: params.requesterId,
			assigneeType: step.assignee_type,
			requesterReportToId,
			targetEmployeeId: params.targetEmployeeId ?? null,
			existingAssigneeIds: step.step_type === "APPROVAL" ? assignedIds : undefined,
		});
		const assigneeId = resolution.assigneeId;

		if (assigneeId && step.step_type !== "SUBMISSION") {
			assignedIds.add(assigneeId);
		}

		// SUBMISSION steps are auto-completed because submission already happened during request creation
		const isSubmissionStep = step.step_type === "SUBMISSION";
		const isRequesterApprovalStep =
			step.step_type === "APPROVAL" && assigneeId === params.requesterId;
		const shouldSkip = !isRequired && !assigneeId;
		const metadata = {
			approvalResolution: buildAssigneeResolutionMetadata(resolution),
			...(isRequesterApprovalStep
				? {
						autoApproved: true,
						autoApprovedReason: resolution.reason,
					}
				: {}),
		} as Prisma.InputJsonValue;

		executionData.push({
			organizationId: params.organizationId,
			workflowInstanceId,
			requestId: params.requestId,
			stepNumber: step.step_number,
			stepName: step.step_name,
			stepType: step.step_type,
			assigneeType: step.assignee_type,
			assigneeId,
			status: shouldSkip
				? "SKIPPED"
				: isRequesterApprovalStep
					? "APPROVED"
					: isSubmissionStep
						? "COMPLETED"
						: "PENDING",
			completedAt: shouldSkip || isSubmissionStep || isRequesterApprovalStep ? now : null,
			isRequired: isRequired,
			metadata,
		});
	}

	const result = await prisma.workflowStepExecution.createMany({
		data: executionData,
	});

	const createdSteps = await prisma.workflowStepExecution.findMany({
		where: {
			requestId: params.requestId,
			workflowInstanceId,
			isDeleted: false,
		},
		orderBy: { stepNumber: "asc" },
		select: {
			id: true,
			stepNumber: true,
			stepName: true,
			stepType: true,
			status: true,
		},
	});

	// Update request with current step execution (first pending step) and last completed step
	const firstPendingStep = await prisma.workflowStepExecution.findFirst({
		where: {
			workflowInstanceId,
			requestId: params.requestId,
			isDeleted: false,
			status: "PENDING",
		},
		orderBy: { stepNumber: "asc" },
		select: { id: true, stepNumber: true, stepName: true, stepType: true },
	});

	// Find the last completed step (should be SUBMISSION if it was completed)
	const lastCompletedStep = await prisma.workflowStepExecution.findFirst({
		where: {
			workflowInstanceId,
			requestId: params.requestId,
			isDeleted: false,
			status: { in: ["COMPLETED", "APPROVED"] },
		},
		orderBy: { stepNumber: "desc" },
		select: { id: true },
	});

	await prisma.request.update({
		where: { id: params.requestId },
		data: {
			currentStepExecutionId: firstPendingStep?.id ?? null,
			lastCompletedStepExecutionId: lastCompletedStep?.id ?? null,
		},
	});

	const currentStepConfig = firstPendingStep
		? (normalizedSteps.find((step) => step.step_number === firstPendingStep.stepNumber) ??
			normalizedSteps[0])
		: normalizedSteps[normalizedSteps.length - 1];
	const initialStateKey = firstPendingStep
		? getStepEnterState(currentStepConfig)
		: getFinalStateForSteps(normalizedSteps);

	await setRequestWorkflowState(prisma, {
		requestId: params.requestId,
		stateKey: initialStateKey,
		states: workflowStates,
		source: "request_created",
		stepExecutionId: firstPendingStep?.id ?? lastCompletedStep?.id ?? null,
		stepNumber: firstPendingStep?.stepNumber ?? currentStepConfig?.step_number ?? null,
		stepName: firstPendingStep?.stepName ?? currentStepConfig?.step_name ?? null,
		changedByEmployeeId: params.requesterId,
	});

	for (const step of createdSteps) {
		if (step.stepType === "SUBMISSION" && step.status === "COMPLETED") {
			await createRequestTransaction(prisma, {
				organizationId: params.organizationId,
				requestId: params.requestId,
				workflowInstanceId,
				stepExecutionId: step.id,
				actorEmployeeId: params.requesterId,
				eventCategory: RequestTransactionEventCategory.WORKFLOW,
				eventKey: RequestTransactionEventKey.STEP_COMPLETED,
				eventSource: "request_created",
				title: `Step ${step.stepNumber} completed`,
				description: `${step.stepName} was completed.`,
				metadata: {
					stepNumber: step.stepNumber,
					stepName: step.stepName,
					stepType: step.stepType,
				},
			});
		}
		if (step.stepType === "APPROVAL" && step.status === "APPROVED") {
			await createRequestTransaction(prisma, {
				organizationId: params.organizationId,
				requestId: params.requestId,
				workflowInstanceId,
				stepExecutionId: step.id,
				actorEmployeeId: params.requesterId,
				eventCategory: RequestTransactionEventCategory.WORKFLOW,
				eventKey: RequestTransactionEventKey.STEP_APPROVED,
				eventSource: "request_created",
				title: `Step ${step.stepNumber} auto-approved`,
				description: `${step.stepName} was auto-approved because the requester is the assigned actor.`,
				metadata: {
					stepNumber: step.stepNumber,
					stepName: step.stepName,
					stepType: step.stepType,
					reason: "REQUESTER_IS_STEP_ACTOR",
				},
			});
		}
	}

	await logRequestStepAssignment(prisma, {
		organizationId: params.organizationId,
		requestId: params.requestId,
		workflowInstanceId,
		stepExecutionId: firstPendingStep?.id ?? null,
		actorEmployeeId: params.requesterId,
		eventSource: "request_created",
	});

	await autoCompleteSystemSteps(prisma, {
		requestId: params.requestId,
		changedByEmployeeId: params.requesterId,
		source: "request_created",
	});

	return result.count ?? executionData.length;
}

/**
 * Update request denormalized fields after step completion
 * Call this after marking a step as APPROVED/REJECTED/COMPLETED
 * @param justCompletedStepId - The ID of the step that was just completed (optional for explicit setting)
 */
export async function updateRequestStepProgress(
	prisma: PrismaClient | Prisma.TransactionClient,
	requestId: string,
	justCompletedStepId?: string,
	params?: {
		changedByEmployeeId?: string | null;
		source?: string;
	},
): Promise<void> {
	const nextPendingStep = await prisma.workflowStepExecution.findFirst({
		where: { requestId, isDeleted: false, status: "PENDING" },
		orderBy: { stepNumber: "asc" },
		select: { id: true, stepNumber: true, stepName: true },
	});

	// Use the explicitly passed step ID if provided, otherwise query for the last completed
	let lastCompletedStepId = justCompletedStepId;
	if (!lastCompletedStepId) {
		const lastCompletedStep = await prisma.workflowStepExecution.findFirst({
			where: {
				requestId,
				isDeleted: false,
				status: { in: ["APPROVED", "COMPLETED"] },
			},
			orderBy: { stepNumber: "desc" },
			select: { id: true },
		});
		lastCompletedStepId = lastCompletedStep?.id ?? undefined;
	}

	await prisma.request.update({
		where: { id: requestId },
		data: {
			currentStepExecutionId: nextPendingStep?.id ?? null,
			lastCompletedStepExecutionId: lastCompletedStepId,
		},
	});

	const request = await prisma.request.findUnique({
		where: { id: requestId },
		select: {
			id: true,
			type: true,
			organizationId: true,
			requesterId: true,
			targetEmployeeId: true,
			metadata: true,
			startDate: true,
			endDate: true,
			workflowInstance: {
				select: {
					id: true,
					steps: true,
					states: true,
				},
			},
		},
	});

	if (!request?.workflowInstance) {
		return;
	}

	const workflowStates = normalizeWorkflowStates(request.workflowInstance.states);
	const normalizedSteps = normalizeWorkflowSteps(request.workflowInstance.steps);
	const nextStepConfig = nextPendingStep
		? normalizedSteps.find((step) => step.step_number === nextPendingStep.stepNumber)
		: undefined;
	const nextStateKey = nextPendingStep
		? getStepEnterState(nextStepConfig)
		: getFinalStateForSteps(normalizedSteps);

	await setRequestWorkflowState(prisma, {
		requestId,
		stateKey: nextStateKey,
		states: workflowStates,
		source: params?.source ?? "step_progressed",
		stepExecutionId: nextPendingStep?.id ?? lastCompletedStepId ?? null,
		stepNumber: nextPendingStep?.stepNumber ?? nextStepConfig?.step_number ?? null,
		stepName: nextPendingStep?.stepName ?? nextStepConfig?.step_name ?? null,
		changedByEmployeeId: params?.changedByEmployeeId ?? request.requesterId,
	});

	await logRequestStepAssignment(prisma, {
		organizationId: request.organizationId,
		requestId,
		workflowInstanceId: request.workflowInstance?.id ?? null,
		stepExecutionId: nextPendingStep?.id ?? null,
		actorEmployeeId: params?.changedByEmployeeId ?? request.requesterId,
		eventSource: params?.source ?? "step_progressed",
	});

	// PAN side effects should run automatically once the workflow reaches COMPLETED.
	const isWorkflowCompleted = String(nextStateKey || "").toUpperCase() === "COMPLETED";
	if (isWorkflowCompleted && isAttendanceCorrectionRequestType(request.type)) {
		try {
			await applyAttendanceCorrectionRequest({
				prisma: prisma as PrismaClient,
				organizationId: request.organizationId,
				requestId,
				requesterId: request.requesterId,
				targetEmployeeId: request.targetEmployeeId,
				startDate: request.startDate,
				endDate: request.endDate,
				metadata: request.metadata,
				actorEmployeeId: params?.changedByEmployeeId ?? request.requesterId,
			});
		} catch (error) {
			console.error(
				`[attendance-correction] Failed to apply completed request ${requestId}:`,
				error,
			);
		}
	}
	if (isWorkflowCompleted && String(request.type || "").toUpperCase() === "LEAVE") {
		// LEAVE workflow completion is an attendance event even when it happens through the
		// shared runtime/system path instead of request.controller approval. Recompute the live
		// AttendanceObligation projection so /hr/attendance rows/cards see the completed leave
		// without waiting for a timesheet draft.
		await recomputeAttendanceObligationsForRange(prisma as PrismaClient, {
			organizationId: request.organizationId,
			employeeId: request.requesterId,
			fromDate: request.startDate ?? new Date(),
			toDate: request.endDate ?? request.startDate ?? new Date(),
			reason: "LeaveSystemCompleted",
		});
	}
	if (isWorkflowCompleted && String(request.type || "").toUpperCase() === "SCHEDULE_CHANGE") {
		await applyScheduleChangeCompletionSideEffects(prisma, {
			organizationId: request.organizationId,
			requestId,
			requesterId: request.requesterId,
			targetEmployeeId: request.targetEmployeeId,
			metadata: (request.metadata as Record<string, any> | null) ?? null,
			actorEmployeeId: params?.changedByEmployeeId ?? request.requesterId,
			now: new Date(),
		});
	}
	const panTypes = new Set([
		"REGULARIZATION",
		"PROMOTION",
		"SALARY_CHANGE",
		"TRANSFER",
		"TERMINATION",
		"LEAVE_CONVERSION",
	]);
	if (isWorkflowCompleted && panTypes.has(String(request.type || "").toUpperCase())) {
		const targetEmployeeId = String(request.targetEmployeeId || request.requesterId || "");
		if (targetEmployeeId) {
			try {
				await applyPanCompletionSideEffects(prisma, {
					organizationId: request.organizationId,
					requestId,
					requestType: request.type,
					targetEmployeeId,
					startDate: request.startDate ?? null,
					metadata: (request.metadata as Record<string, any> | null) ?? null,
					now: new Date(),
				});
			} catch {
				// best-effort
			}
		}
	}

	await autoCompleteSystemSteps(prisma, {
		requestId,
		changedByEmployeeId: params?.changedByEmployeeId ?? request.requesterId,
		source: params?.source ?? "step_progressed",
	});
}

/**
 * Complete a TASK step (like document generation)
 * Marks the task as COMPLETED and advances workflow
 * Any employee with the required role (e.g., HR role for HR tasks) can complete it
 * @param requestId - The request ID
 * @param taskStepName - The name of the TASK step to complete (e.g., "HR Review & Document Generation")
 * @param completedByEmployeeId - Employee ID of who completed the task
 * @param comments - Optional comments about task completion
 */
export async function completeTaskStep(
	prisma: PrismaClient | Prisma.TransactionClient,
	requestId: string,
	taskStepName: string,
	completedByEmployeeId: string,
	comments?: string,
): Promise<void> {
	const now = new Date();

	console.log(
		`[completeTaskStep] Starting - requestId: ${requestId}, taskStepName: ${taskStepName}, completedBy: ${completedByEmployeeId}`,
	);

	// Find the task step to complete
	const taskStep = await prisma.workflowStepExecution.findFirst({
		where: {
			requestId,
			stepName: taskStepName,
			isDeleted: false,
		},
	});

	console.log(`[completeTaskStep] Task step found:`, taskStep);

	if (!taskStep) {
		// List available steps for debugging
		const availableSteps = await prisma.workflowStepExecution.findMany({
			where: { requestId, isDeleted: false },
			select: { stepName: true, status: true, assigneeType: true },
		});
		const stepList = availableSteps
			.map((s) => `${s.stepName} (${s.status}, assignee: ${s.assigneeType})`)
			.join(", ");
		throw new Error(
			`Task step "${taskStepName}" not found for request ${requestId}. Available steps: ${stepList || "none"}`,
		);
	}

	// If already completed, skip
	if (taskStep.status === "COMPLETED") {
		console.log(
			`[completeTaskStep] Task step "${taskStepName}" is already completed for request ${requestId}`,
		);
		return;
	}

	// For HR-assigned tasks, verify the completing employee has HR role
	if (taskStep.assigneeType === "HR") {
		const completingEmployee = await prisma.employee.findUnique({
			where: { id: completedByEmployeeId },
			select: { id: true, role: true, employeeId: true },
		});

		if (!completingEmployee) {
			throw new Error(`Employee not found: ${completedByEmployeeId}`);
		}

		const isHRRole = isAttendanceCorrectionHrRole(completingEmployee.role);
		console.log(
			`[completeTaskStep] Completing HR task - Employee: ${completingEmployee.employeeId}, Role: ${completingEmployee.role}, isHR: ${isHRRole}`,
		);

		if (!isHRRole) {
			throw new Error(
				`Only HR staff can complete this step. Employee ${completingEmployee.employeeId} has role: ${completingEmployee.role}`,
			);
		}
	}

	console.log(`[completeTaskStep] Updating task step to COMPLETED`);

	const completionAssigneeId = taskStep.assigneeType === "SYSTEM" ? null : completedByEmployeeId;

	// Mark task as COMPLETED and assign to whoever completed it
	await prisma.workflowStepExecution.update({
		where: { id: taskStep.id },
		data: {
			status: "COMPLETED",
			completedAt: now,
			comments: comments || null,
			assigneeId: completionAssigneeId,
		},
	});

	console.log(`[completeTaskStep] Task step updated successfully`);

	// Recalculate denormalized request step pointers + workflow state using shared logic.
	await updateRequestStepProgress(prisma, requestId, taskStep.id, {
		changedByEmployeeId: completedByEmployeeId,
		source: "task_step_completed",
	});

	const requestAfterProgress = await prisma.request.findUnique({
		where: { id: requestId },
		select: {
			currentWorkflowStateKey: true,
			currentStepExecutionId: true,
			lastCompletedStepExecutionId: true,
		},
	});

	console.log(
		`[completeTaskStep] Request progressed: state=${requestAfterProgress?.currentWorkflowStateKey ?? "UNKNOWN"}, currentStepExecutionId=${requestAfterProgress?.currentStepExecutionId ?? "none"}, lastCompletedStepExecutionId=${requestAfterProgress?.lastCompletedStepExecutionId ?? "none"}`,
	);
}
