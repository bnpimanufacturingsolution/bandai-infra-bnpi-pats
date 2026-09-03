import type { Request } from "express";
import { Prisma, PrismaClient } from "../generated/prisma";
import {
	getSeededWorkflowConfigs,
	getWorkflowConfigByCode,
} from "./workflow-config.helper";
import { createEmployeeHelpers } from "./employee.helper";
import { deriveRoleAndFlagsFromRecord } from "../utils/role-derivation";
import { getLogger } from "./logger.helper";
import { config as appConfig } from "../config/config";
import {
	countCurrentHeadcount,
	getOrCreateWorkforceRecruitmentSetting,
	resolveWorkforcePolicy,
	serializeWorkforceRecruitmentSetting,
} from "./workforce-recruitment.helper";

type PrismaExecutor = PrismaClient | Prisma.TransactionClient;

const recruitmentRuntimeLogger = getLogger().child({
	module: "recruitment-runtime",
});

export const DEFAULT_RECRUITMENT_WORKFLOW_CODE = "WF-RECRUITMENT-APPLICANT-DEFAULT";

type RuntimeState = {
	key: string;
	label: string;
	order: number;
	isTerminal?: boolean;
};

type RuntimeStep = {
	step_number: number;
	step_name: string;
	step_type: "SUBMISSION" | "APPROVAL" | "TASK";
	assignee_type: "REQUESTER" | "SUPERVISOR" | "HR" | "SYSTEM";
	assignee_role?: string | null;
	is_required?: boolean;
	state_on_enter?: string | null;
	state_on_approve?: string | null;
	state_on_reject?: string | null;
	state_on_complete?: string | null;
	state_on_skip?: string | null;
};

export type ApplicantActionCommand =
	| "ADVANCE"
	| "APPROVE_STEP"
	| "REJECT_STEP"
	| "COMPLETE_STEP"
	| "ASSIGN_RECRUITER"
	| "SCHEDULE_INTERVIEW"
	| "SEND_OFFER"
	| "SAVE_PRE_HIRE_SETUP"
	| "MARK_ONBOARDING_READY"
	| "MARK_HIRED";

const RECRUITMENT_STAGE_MOVEMENT_ACTIONS = new Set<ApplicantActionCommand>([
	"ADVANCE",
	"APPROVE_STEP",
	"COMPLETE_STEP",
	"SCHEDULE_INTERVIEW",
	"SEND_OFFER",
	"MARK_ONBOARDING_READY",
	"MARK_HIRED",
]);

const POST_HIRE_BLOCKED_ACTIONS = new Set<ApplicantActionCommand>([
	"ADVANCE",
	"APPROVE_STEP",
	"REJECT_STEP",
	"COMPLETE_STEP",
	"ASSIGN_RECRUITER",
	"SCHEDULE_INTERVIEW",
	"SEND_OFFER",
	"SAVE_PRE_HIRE_SETUP",
	"MARK_ONBOARDING_READY",
	"MARK_HIRED",
]);

type ApplicantSetupGroupKey = "PERSONAL" | "EMPLOYMENT" | "COMPENSATION" | "ACCESS";

type ApplicantSetupMissingField = {
	field: string;
	label: string;
	group: ApplicantSetupGroupKey;
};

type ApplicantSetupGroup = {
	key: ApplicantSetupGroupKey;
	label: string;
	isReady: boolean;
	missingCount: number;
};

export type ApplicantPreHireSetupReadiness = {
	employeeId: string | null;
	isReady: boolean;
	missingFields: ApplicantSetupMissingField[];
	groups: ApplicantSetupGroup[];
	draft: Record<string, unknown> | null;
	access: {
		role: string | null;
		loginEmail: string | null;
		loginMethod: "email";
		generatedUserName: string | null;
		hasLinkedUser: boolean;
	};
};

export class ApplicantActionValidationError extends Error {
	statusCode: number;
	errors?: Array<{ field?: string; message: string }>;

	constructor(
		message: string,
		statusCode: number = 400,
		errors?: Array<{ field?: string; message: string }>,
	) {
		super(message);
		this.name = "ApplicantActionValidationError";
		this.statusCode = statusCode;
		this.errors = errors;
	}
}

const toJsonValue = (value: unknown) => value as Prisma.InputJsonValue;

const parseStates = (value: unknown): RuntimeState[] =>
	Array.isArray(value)
		? value.map((item: any, index) => ({
				key: String(item?.key || `STATE_${index + 1}`).trim().toUpperCase(),
				label: String(item?.label || item?.key || `State ${index + 1}`).trim(),
				order: Number.isFinite(Number(item?.order)) ? Number(item.order) : index,
				isTerminal: item?.isTerminal === true,
			}))
		: [];

const parseSteps = (value: unknown): RuntimeStep[] =>
	Array.isArray(value)
		? value.map((item: any, index) => ({
				step_number: Number.isFinite(Number(item?.step_number))
					? Number(item.step_number)
					: index + 1,
				step_name: String(item?.step_name || `Step ${index + 1}`).trim(),
				step_type: (String(item?.step_type || "TASK").trim().toUpperCase() ||
					"TASK") as RuntimeStep["step_type"],
				assignee_type: (String(item?.assignee_type || "HR").trim().toUpperCase() ||
					"HR") as RuntimeStep["assignee_type"],
				assignee_role: item?.assignee_role ? String(item.assignee_role).trim() : null,
				is_required: item?.is_required !== false,
				state_on_enter: item?.state_on_enter ? String(item.state_on_enter).trim() : null,
				state_on_approve: item?.state_on_approve
					? String(item.state_on_approve).trim()
					: null,
				state_on_reject: item?.state_on_reject
					? String(item.state_on_reject).trim()
					: null,
				state_on_complete: item?.state_on_complete
					? String(item.state_on_complete).trim()
					: null,
				state_on_skip: item?.state_on_skip ? String(item.state_on_skip).trim() : null,
			}))
		: [];

const buildStateLabel = (states: RuntimeState[], key: string) =>
	states.find((state) => state.key === key)?.label ||
	key
		.toLowerCase()
		.split("_")
		.map((part) => part.charAt(0).toUpperCase() + part.slice(1))
		.join(" ");

const PRE_HIRE_GROUP_LABELS: Record<ApplicantSetupGroupKey, string> = {
	PERSONAL: "Personal",
	EMPLOYMENT: "Employment",
	COMPENSATION: "Compensation",
	ACCESS: "Access",
};

type ApplicantPreHireDraft = {
	employeeId?: string;
	email?: string;
	dateOfBirth?: string;
	gender?: string;
	nationality?: string;
	phoneCountryCode?: string;
	phoneNumber?: string;
	street?: string;
	city?: string;
	state?: string;
	country?: string;
	postalCode?: string;
	departmentId?: string;
	sectionId?: string;
	positionId?: string;
	levelId?: string;
	scheduleId?: string;
	workLocation?: string;
	employmentType?: string;
	employmentHireDate?: string;
	employmentStartDate?: string;
	probationEndDate?: string;
	reportToId?: string;
	basicSalary?: string;
	currency?: string;
	payFrequency?: string;
	scheduleSnapshot?: Record<string, unknown> | null;
};

const normalizeText = (value: unknown): string =>
	typeof value === "string" ? value.trim() : "";

const parseJsonRecord = (value: unknown): Record<string, unknown> | null =>
	value && typeof value === "object" && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: null;

const getApplicantPreHireDraft = (applicant: any): ApplicantPreHireDraft | null => {
	const applicantMetadata = parseJsonRecord(applicant?.metadata);
	const applicantDraft = parseJsonRecord(applicantMetadata?.preHireDraft);
	if (applicantDraft && Object.keys(applicantDraft).length > 0) {
		return applicantDraft as ApplicantPreHireDraft;
	}

	// First try the current step execution, then the last completed step,
	// and finally scan all step executions so the draft is never lost when
	// the saving step is no longer "current" at hire time.
	const candidateMetadataSources: unknown[] = [
		applicant?.currentStepExecution?.metadata,
		applicant?.lastCompletedStepExecution?.metadata,
		...(Array.isArray(applicant?._allStepExecutions)
			? (applicant._allStepExecutions as Array<{ metadata: unknown }>).map(
					(s) => s.metadata,
			  )
			: []),
	];

	for (const raw of candidateMetadataSources) {
		const metadata = parseJsonRecord(raw);
		const draft = parseJsonRecord(metadata?.preHireDraft);
		if (draft && Object.keys(draft).length > 0) {
			return draft as ApplicantPreHireDraft;
		}
	}
	return null;
};

const getIncomingPreHireDraft = (
	metadata?: Record<string, unknown> | null,
): ApplicantPreHireDraft | null => {
	if (!metadata) return null;
	const nestedDraft = parseJsonRecord(metadata.preHireDraft);
	if (nestedDraft && Object.keys(nestedDraft).length > 0) {
		return nestedDraft as ApplicantPreHireDraft;
	}
	const directDraft = parseJsonRecord(metadata);
	if (directDraft && Object.keys(directDraft).length > 0) {
		return directDraft as ApplicantPreHireDraft;
	}
	return null;
};

const persistPreHireDraftOnApplicant = async (
	prisma: PrismaExecutor,
	params: {
		applicantId: string;
		currentMetadata: unknown;
		metadata?: Record<string, unknown>;
	},
): Promise<ApplicantPreHireDraft | null> => {
	const preHireDraft = getIncomingPreHireDraft(params.metadata);
	if (!preHireDraft) return null;

	const existingMetadata = parseJsonRecord(params.currentMetadata) || {};
	await prisma.applicant.update({
		where: { id: params.applicantId },
		data: {
			metadata: toJsonValue({
				...existingMetadata,
				preHireDraft,
			}),
		},
	});

	return preHireDraft;
};

const parseDraftDate = (value: unknown): Date | null => {
	const raw = normalizeText(value);
	if (!raw) return null;
	const parsed = new Date(raw);
	return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const anchorDateToMondayUtc = (value: Date): Date => {
	const anchored = new Date(value);
	anchored.setUTCHours(0, 0, 0, 0);
	const day = anchored.getUTCDay();
	const diff = day === 0 ? -6 : 1 - day;
	anchored.setUTCDate(anchored.getUTCDate() + diff);
	return anchored;
};

const normalizeEmbeddedScheduleShiftSnapshot = (value: unknown) => {
	const snapshot = parseJsonRecord(value);
	if (!snapshot) return null;

	const timeSlots = Array.isArray(snapshot.timeSlots)
		? snapshot.timeSlots
				.filter(
					(slot: any) =>
						slot &&
						typeof slot.startTime === "string" &&
						typeof slot.endTime === "string" &&
						slot.startTime &&
						slot.endTime,
				)
				.map((slot: any) => ({
					type: normalizeText(slot.type) || "work",
					label: normalizeText(slot.label) || null,
					startTime: String(slot.startTime),
					endTime: String(slot.endTime),
				}))
		: [];

	return {
		name: normalizeText(snapshot.name) || null,
		code: normalizeText(snapshot.code) || null,
		isOvernight: Boolean(snapshot.isOvernight),
		isOff: Boolean(snapshot.isOff),
		timeSlots,
	};
};

const normalizeEmbeddedScheduleFromDraft = (
	value: Record<string, unknown> | null,
	fallbacks?: {
		effectiveStartDate?: Date | null;
		assignedAt?: Date | null;
	},
) => {
	if (!value) return null;

	const cycleDays = [7, 14, 21, 28].includes(Number(value.cycleDays))
		? Number(value.cycleDays)
		: 7;
	const graceLateMinutes = Number(value.graceLateMinutes);
	const graceEarlyOutMinutes = Number(value.graceEarlyOutMinutes);
	const rawEffectiveStartDate =
		parseDraftDate(value.effectiveStartDate) || fallbacks?.effectiveStartDate || null;
	const effectiveStartDate =
		rawEffectiveStartDate && cycleDays % 7 === 0
			? anchorDateToMondayUtc(rawEffectiveStartDate)
			: rawEffectiveStartDate;
	const assignedAt = parseDraftDate(value.assignedAt) || fallbacks?.assignedAt || effectiveStartDate;
	const safePattern = Array.isArray(value.pattern) ? value.pattern : [];

	return {
		templateId: normalizeText(value.templateId) || null,
		templateCode: normalizeText(value.templateCode) || null,
		templateName: normalizeText(value.templateName) || null,
		cycleDays,
		graceLateMinutes:
			Number.isFinite(graceLateMinutes) && graceLateMinutes >= 0
				? Math.round(graceLateMinutes)
				: 0,
		graceEarlyOutMinutes:
			Number.isFinite(graceEarlyOutMinutes) && graceEarlyOutMinutes >= 0
				? Math.round(graceEarlyOutMinutes)
				: 0,
		pattern: Array.from({ length: cycleDays }).map((_, index) => {
			const day = index + 1;
			const existing =
				safePattern.find((item: any) => Number(item?.day) === day) || safePattern[index] || null;
			const shiftTypeId = normalizeText(existing?.shiftTypeId) || null;
			return {
				day,
				shiftTypeId,
				shiftSnapshot: normalizeEmbeddedScheduleShiftSnapshot(existing?.shiftSnapshot),
			};
		}),
		effectiveStartDate,
		assignedAt,
		assignedByEmployeeId: normalizeText(value.assignedByEmployeeId) || null,
		reason: normalizeText(value.reason) || null,
		version: Number.isFinite(Number(value.version)) ? Number(value.version) : 1,
	};
};

const parseDraftAmount = (value: unknown): number | null => {
	const amount = Number(value);
	return Number.isFinite(amount) && amount > 0 ? amount : null;
};

const hasPrimaryPhone = (phones: unknown) =>
	Array.isArray(phones) &&
	phones.some((phone: any) => {
		const number = normalizeText(phone?.number);
		return Boolean(number) && (phone?.isPrimary === true || phone?.isPrimary == null);
	});

const hasPrimaryAddress = (addresses: unknown) =>
	Array.isArray(addresses) &&
	addresses.some((address: any) => {
		const hasStreet = Boolean(normalizeText(address?.street) || normalizeText(address?.houseNumber));
		const hasCity = Boolean(normalizeText(address?.city));
		const hasCountry = Boolean(normalizeText(address?.country));
		return hasStreet && hasCity && hasCountry;
	});

const hasDraftAddress = (draft?: ApplicantPreHireDraft | null) =>
	Boolean(
		normalizeText(draft?.street) &&
			normalizeText(draft?.city) &&
			normalizeText(draft?.country),
	);

const buildGeneratedUsername = (firstName: unknown, lastName: unknown) =>
	`${normalizeText(firstName)}-${normalizeText(lastName)}`
		.toLowerCase()
		.replace(/[^a-z0-9_-]+/g, "-")
		.replace(/-+/g, "-")
		.replace(/^-|-$/g, "");

const extractAuthTokenFromRequest = (req?: Request | null): string | null => {
	if (!req) return null;
	const cookieToken = (req as any)?.cookies?.token;
	if (typeof cookieToken === "string" && cookieToken.trim()) {
		return cookieToken.trim();
	}

	const authHeader = req.headers?.authorization;
	if (!authHeader || typeof authHeader !== "string") return null;
	return authHeader.startsWith("Bearer ")
		? authHeader.slice(7).trim()
		: authHeader.trim();
};

const extractRoleDocuments = (payload: any): any[] => {
	if (Array.isArray(payload?.data?.roles)) return payload.data.roles;
	if (Array.isArray(payload?.data?.documents)) return payload.data.documents;
	if (Array.isArray(payload?.data?.docs)) return payload.data.docs;
	if (Array.isArray(payload?.data?.data)) return payload.data.data;
	if (Array.isArray(payload?.data)) return payload.data;
	if (Array.isArray(payload?.roles)) return payload.roles;
	if (Array.isArray(payload?.documents)) return payload.documents;
	if (Array.isArray(payload?.docs)) return payload.docs;
	return [];
};

const resolveAuthRoleIdByName = async (
	req: Request | undefined,
	roleName: string,
): Promise<string | null> => {
	if (!appConfig.idpEnabled) return null;

	const token = extractAuthTokenFromRequest(req);
	if (!token) {
		throw new ApplicantActionValidationError(
			"Unable to provision login access without an authenticated role context.",
			400,
			[{ field: "user.roleId", message: "Role access could not be resolved for this hire." }],
		);
	}

	const upstream = await fetch(
		`${appConfig.authBaseUrl}/api/role?document=true&pagination=false&limit=200`,
		{
			method: "GET",
			headers: {
				Accept: "application/json",
				Authorization: `Bearer ${token}`,
				Cookie: `token=${token}`,
			},
		},
	);

	if (!upstream.ok) {
		const body = await upstream.text();
		throw new ApplicantActionValidationError(
			`Failed to resolve auth role for ${roleName}.`,
			400,
			[
				{
					field: "user.roleId",
					message: body || `Auth role lookup failed with status ${upstream.status}.`,
				},
			],
		);
	}

	const payload = await upstream.json();
	const matchingRole = extractRoleDocuments(payload).find((role: any) => role?.name === roleName);
	const roleId =
		typeof matchingRole?.id === "string"
			? matchingRole.id
			: typeof matchingRole?._id === "string"
				? matchingRole._id
				: "";

	if (!roleId) {
		throw new ApplicantActionValidationError(
			`No auth role mapping was found for ${roleName}.`,
			400,
			[{ field: "user.roleId", message: `Role ${roleName} is not available in auth.` }],
		);
	}

	return roleId;
};

const getDefaultRecruitmentConfig = () =>
	getSeededWorkflowConfigs().find((config) => config.code === DEFAULT_RECRUITMENT_WORKFLOW_CODE);

const appendStateHistory = async (prisma: PrismaExecutor, params: {
	workflowInstanceId: string;
	stateKey: string;
	stateLabel: string;
	source: string;
	stepExecutionId?: string | null;
	stepNumber?: number | null;
	stepName?: string | null;
	changedByEmployeeId?: string | null;
	metadata?: Record<string, unknown>;
}) => {
	const workflowInstance = await prisma.workflowInstance.findUnique({
		where: { id: params.workflowInstanceId },
		select: { stateHistory: true },
	});
	const history: Prisma.JsonValue[] = Array.isArray(workflowInstance?.stateHistory)
		? [...(workflowInstance.stateHistory as Prisma.JsonValue[])]
		: [];

	const historyEntry = {
		key: params.stateKey,
		label: params.stateLabel,
		source: params.source,
		stepExecutionId: params.stepExecutionId ?? null,
		stepNumber: params.stepNumber ?? null,
		stepName: params.stepName ?? null,
		changedAt: new Date().toISOString(),
		changedByEmployeeId: params.changedByEmployeeId ?? null,
		metadata: params.metadata ? toJsonValue(params.metadata) : {},
	} satisfies Prisma.InputJsonObject;

	history.push(historyEntry as unknown as Prisma.JsonValue);

	await prisma.workflowInstance.update({
		where: { id: params.workflowInstanceId },
		data: {
			currentStateKey: params.stateKey,
			stateHistory: history as unknown as Prisma.InputJsonValue[],
		},
	});
};

const createActivity = async (prisma: PrismaExecutor, params: {
	organizationId: string;
	applicantId: string;
	workflowInstanceId?: string | null;
	stepExecutionId?: string | null;
	stateKey?: string | null;
	type:
		| "NOTE"
		| "INTERVIEW"
		| "REJECTION"
		| "OFFER"
		| "ASSIGNMENT"
		| "EMAIL_EVENT"
		| "SYSTEM_EVENT";
	title: string;
	details?: Record<string, unknown>;
	actorEmployeeId?: string | null;
}) => {
	return prisma.recruitmentActivity.create({
		data: {
			organizationId: params.organizationId,
			applicantId: params.applicantId,
			workflowInstanceId: params.workflowInstanceId ?? null,
			stepExecutionId: params.stepExecutionId ?? null,
			stateKey: params.stateKey ?? null,
			type: params.type,
			title: params.title,
			details: params.details ? toJsonValue(params.details) : undefined,
			actorEmployeeId: params.actorEmployeeId ?? null,
		},
	});
};

const findCurrentApplicantStep = async (
	prisma: PrismaExecutor,
	applicantId: string,
	explicitStepExecutionId?: string | null,
) => {
	if (explicitStepExecutionId) {
		return prisma.workflowStepExecution.findFirst({
			where: {
				id: explicitStepExecutionId,
				applicantId,
				isDeleted: false,
			},
		});
	}

	return prisma.workflowStepExecution.findFirst({
		where: {
			applicantId,
			status: "PENDING",
			isDeleted: false,
		},
		orderBy: { stepNumber: "asc" },
	});
};

const syncApplicantCurrentStep = async (
	prisma: PrismaExecutor,
	applicantId: string,
	lastCompletedStepExecutionId?: string | null,
) => {
	const nextPending = await prisma.workflowStepExecution.findFirst({
		where: {
			applicantId,
			status: "PENDING",
			isDeleted: false,
		},
		orderBy: { stepNumber: "asc" },
		select: { id: true },
	});

	return prisma.applicant.update({
		where: { id: applicantId },
		data: {
			currentStepExecutionId: nextPending?.id ?? null,
			lastCompletedStepExecutionId: lastCompletedStepExecutionId ?? undefined,
		},
	});
};

const transitionApplicantState = async (prisma: PrismaExecutor, params: {
	applicantId: string;
	workflowInstanceId: string;
	nextStateKey: string;
	source: string;
	stepExecutionId?: string | null;
	stepNumber?: number | null;
	stepName?: string | null;
	changedByEmployeeId?: string | null;
	metadata?: Record<string, unknown>;
}) => {
	const workflowInstance = await prisma.workflowInstance.findUnique({
		where: { id: params.workflowInstanceId },
		select: {
			states: true,
		},
	});
	const states = parseStates(workflowInstance?.states);
	const stateLabel = buildStateLabel(states, params.nextStateKey);

	await appendStateHistory(prisma, {
		workflowInstanceId: params.workflowInstanceId,
		stateKey: params.nextStateKey,
		stateLabel,
		source: params.source,
		stepExecutionId: params.stepExecutionId,
		stepNumber: params.stepNumber,
		stepName: params.stepName,
		changedByEmployeeId: params.changedByEmployeeId,
		metadata: params.metadata,
	});

	await prisma.applicant.update({
		where: { id: params.applicantId },
		data: {
			currentWorkflowStateKey: params.nextStateKey,
		},
	});
};

export const initializeApplicantWorkflow = async (
	prisma: PrismaExecutor,
	params: {
		organizationId: string;
		applicantId: string;
		changedByEmployeeId?: string | null;
	},
) => {
	const organization = await prisma.organization.findFirst({
		where: {
			id: params.organizationId,
			isDeleted: false,
		},
		select: {
			branding: true,
		},
	});

	const brandingConfig = organization?.branding
		? getWorkflowConfigByCode(organization.branding, DEFAULT_RECRUITMENT_WORKFLOW_CODE)
		: null;

	const template =
		brandingConfig ||
		(await prisma.workflowInstance.findFirst({
			where: {
				organizationId: params.organizationId,
				domain: "RECRUITMENT",
				domainRecordId: null,
				code: DEFAULT_RECRUITMENT_WORKFLOW_CODE,
				isDeleted: false,
			},
			select: {
				code: true,
				name: true,
				description: true,
				steps: true,
				states: true,
			},
		})) ||
		getDefaultRecruitmentConfig();

	if (!template) {
		throw new Error("Recruitment applicant workflow template is not configured");
	}

	const states = parseStates(template.states);
	const steps = parseSteps(template.steps);
	const initialStateKey =
		steps[0]?.state_on_enter || states[0]?.key || "APPLIED";
	const initialStateLabel = buildStateLabel(states, initialStateKey);

	const workflowInstance = await prisma.workflowInstance.create({
		data: {
			organizationId: params.organizationId,
			domain: "RECRUITMENT",
			domainRecordId: params.applicantId,
			code: template.code,
			name: template.name,
			description: template.description ?? null,
			steps: toJsonValue(steps),
			states: toJsonValue(states),
			currentStateKey: initialStateKey,
			stateHistory: [
				{
					key: initialStateKey,
					label: initialStateLabel,
					source: "workflow_initialized",
					stepExecutionId: null,
					stepNumber: null,
					stepName: null,
					changedAt: new Date().toISOString(),
					changedByEmployeeId: params.changedByEmployeeId ?? null,
					metadata: {},
				},
			],
		},
	});

	if (steps.length > 0) {
		await prisma.workflowStepExecution.createMany({
			data: steps.map((step) => ({
				organizationId: params.organizationId,
				workflowInstanceId: workflowInstance.id,
				applicantId: params.applicantId,
				stepNumber: step.step_number,
				stepName: step.step_name,
				stepType: step.step_type,
				assigneeType: step.assignee_type,
				assigneeRole: step.assignee_role || null,
				status: "PENDING",
				isRequired: step.is_required !== false,
				metadata: toJsonValue({
					state_on_enter: step.state_on_enter || null,
					state_on_approve: step.state_on_approve || null,
					state_on_reject: step.state_on_reject || null,
					state_on_complete: step.state_on_complete || null,
					state_on_skip: step.state_on_skip || null,
				}),
			})),
		});
	}

	const currentStep = await prisma.workflowStepExecution.findFirst({
		where: {
			applicantId: params.applicantId,
			workflowInstanceId: workflowInstance.id,
			status: "PENDING",
			isDeleted: false,
		},
		orderBy: { stepNumber: "asc" },
		select: { id: true },
	});

	await prisma.applicant.update({
		where: { id: params.applicantId },
		data: {
			workflowInstanceId: workflowInstance.id,
			currentWorkflowStateKey: initialStateKey,
			currentStepExecutionId: currentStep?.id ?? null,
			lastCompletedStepExecutionId: null,
		},
	});

	return workflowInstance;
};

const getApplicantPreHireContext = async (
	prisma: PrismaExecutor,
	params: {
		organizationId: string;
		applicantId: string;
	},
) => {
	const applicant = await prisma.applicant.findFirst({
		where: {
			id: params.applicantId,
			organizationId: params.organizationId,
			isDeleted: false,
		},
		include: {
			person: true,
			currentStepExecution: {
				select: {
					id: true,
					status: true,
					metadata: true,
				},
			},
			lastCompletedStepExecution: {
				select: {
					id: true,
					status: true,
					metadata: true,
				},
			},
			position: {
				include: {
					section: {
						include: {
							department: true,
						},
					},
				},
			},
			department: true,
			job: {
				include: {
					position: {
						include: {
							section: {
								include: {
									department: true,
								},
							},
						},
					},
					level: true,
					section: true,
				},
			},
			convertedToEmployee: {
				include: {
					person: true,
					department: true,
					position: true,
					level: true,
					reportTo: {
						select: {
							id: true,
							person: {
								select: {
									personalInfo: true,
									contactInfo: true,
								},
							},
						},
					},
					agency: {
						select: {
							id: true,
							name: true,
							code: true,
						},
					},
				},
			},
		},
	});

	if (!applicant) return null;

	// Scan ALL step executions for this applicant to find any preHireDraft,
	// because the draft may have been saved on a step that is no longer
	// current or last-completed by the time MARK_HIRED fires.
	const allStepExecutions = await prisma.workflowStepExecution.findMany({
		where: { applicantId: params.applicantId, isDeleted: false },
		select: { id: true, status: true, metadata: true, stepNumber: true },
		orderBy: { stepNumber: "desc" },
	});
	(applicant as any)._allStepExecutions = allStepExecutions;

	return applicant;
};

const sanitizeApplicantActionMetadata = (metadata?: Record<string, unknown> | null) => {
	if (!metadata || typeof metadata !== "object") return metadata;
	const next = { ...metadata };
	delete next.preHireDraft;
	return Object.keys(next).length > 0 ? next : null;
};

export const getApplicantPreHireSetupReadiness = async (
	prisma: PrismaExecutor,
	params: {
		organizationId: string;
		applicantId: string;
	},
): Promise<ApplicantPreHireSetupReadiness | null> => {
	const applicant = await getApplicantPreHireContext(prisma, params);
	if (!applicant) return null;

	const employee = applicant.convertedToEmployee;
	const person = employee?.person || applicant.person;
	const draft = getApplicantPreHireDraft(applicant);
	const personalInfo = (person?.personalInfo as any) || {};
	const contactInfo = (person?.contactInfo as any) || {};
	const phones = Array.isArray(contactInfo?.phones) ? contactInfo.phones : [];
	const addresses = Array.isArray(contactInfo?.address) ? contactInfo.address : [];
	const derivedDraftDepartment = normalizeText(draft?.departmentId)
		? await prisma.department.findFirst({
				where: {
					id: normalizeText(draft?.departmentId),
					organizationId: params.organizationId,
					isDeleted: false,
				},
		  })
		: null;
	const derivedDraftLevel = normalizeText(draft?.levelId)
		? await prisma.level.findFirst({
				where: {
					id: normalizeText(draft?.levelId),
					organizationId: params.organizationId,
					isDeleted: false,
				},
		  })
		: null;
	const fallbackRoleDepartment =
		employee?.department ||
		derivedDraftDepartment ||
		applicant.department ||
		applicant.position?.section?.department ||
		applicant.job?.position?.section?.department ||
		null;
	const fallbackRoleLevel = employee?.level || derivedDraftLevel || applicant.job?.level || null;
	const derivedRole =
		fallbackRoleDepartment && fallbackRoleLevel
			? deriveRoleAndFlagsFromRecord(fallbackRoleDepartment as any, fallbackRoleLevel as any)
			: null;
	const resolvedEmployeeCode = normalizeText(employee?.employeeId) || normalizeText(draft?.employeeId) || "";

	const missingFields: ApplicantSetupMissingField[] = [];
	const addMissing = (
		group: ApplicantSetupGroupKey,
		field: string,
		label: string,
		condition: boolean,
	) => {
		if (condition) {
			missingFields.push({ group, field, label });
		}
	};

	addMissing("PERSONAL", "person.personalInfo.firstName", "First name", !normalizeText(personalInfo.firstName));
	addMissing("PERSONAL", "person.personalInfo.lastName", "Last name", !normalizeText(personalInfo.lastName));
	addMissing(
		"PERSONAL",
		"person.personalInfo.dateOfBirth",
		"Date of birth",
		!personalInfo.dateOfBirth && !parseDraftDate(draft?.dateOfBirth),
	);
	addMissing(
		"PERSONAL",
		"person.personalInfo.gender",
		"Gender",
		!normalizeText(personalInfo.gender) && !normalizeText(draft?.gender),
	);
	addMissing(
		"PERSONAL",
		"person.personalInfo.nationality",
		"Nationality",
		!normalizeText(personalInfo.nationality) && !normalizeText(draft?.nationality),
	);
	addMissing(
		"PERSONAL",
		"person.contactInfo.email",
		"Contact email",
		!normalizeText(contactInfo.email) && !normalizeText(draft?.email),
	);
	addMissing(
		"PERSONAL",
		"person.contactInfo.phones",
		"Primary phone number",
		!hasPrimaryPhone(phones) && !normalizeText(draft?.phoneNumber),
	);
	addMissing(
		"PERSONAL",
		"person.contactInfo.address",
		"Primary address",
		!hasPrimaryAddress(addresses) && !hasDraftAddress(draft),
	);

	addMissing("EMPLOYMENT", "preHireDraft", "Employee record setup", !employee && !draft);
	addMissing(
		"EMPLOYMENT",
		"employee.employeeId",
		"Employee ID",
		!resolvedEmployeeCode,
	);
	addMissing(
		"EMPLOYMENT",
		"employee.departmentId",
		"Department",
		!normalizeText(employee?.departmentId) &&
			!normalizeText(draft?.departmentId) &&
			!normalizeText(applicant.departmentId) &&
			!normalizeText(applicant.position?.section?.departmentId) &&
			!normalizeText(applicant.job?.position?.section?.departmentId),
	);
	addMissing(
		"EMPLOYMENT",
		"employee.positionId",
		"Position",
		!normalizeText(employee?.positionId) &&
			!normalizeText(draft?.positionId) &&
			!normalizeText(applicant.positionId) &&
			!normalizeText(applicant.job?.positionId) &&
			!normalizeText(applicant.position?.id),
	);
	addMissing(
		"EMPLOYMENT",
		"employee.embeddedSchedule",
		"Work schedule",
		!employee?.embeddedSchedule && !normalizeText(draft?.scheduleId),
	);
	addMissing(
		"EMPLOYMENT",
		"employee.workLocation",
		"Work location",
		!normalizeText(employee?.workLocation) && !normalizeText(draft?.workLocation),
	);
	addMissing(
		"EMPLOYMENT",
		"employee.employmentHireDate",
		"Hire date",
		!employee?.employmentHireDate && !parseDraftDate(draft?.employmentHireDate),
	);
	addMissing(
		"EMPLOYMENT",
		"employee.employmentStartDate",
		"Start date",
		!employee?.employmentStartDate && !parseDraftDate(draft?.employmentStartDate),
	);
	addMissing(
		"EMPLOYMENT",
		"employee.employmentType",
		"Employment type",
		!normalizeText(employee?.employmentType) && !normalizeText(draft?.employmentType),
	);
	addMissing(
		"EMPLOYMENT",
		"employee.probationEndDate",
		"Probation end date",
		!employee?.probationEndDate &&
			String(employee?.employmentType || draft?.employmentType || "").toUpperCase() === "PROBATIONARY" &&
			!parseDraftDate(draft?.probationEndDate),
	);

	addMissing(
		"COMPENSATION",
		"employee.basicSalary",
		"Basic salary",
		!(Number(employee?.basicSalary) > 0) && !parseDraftAmount(draft?.basicSalary),
	);
	addMissing(
		"COMPENSATION",
		"employee.currency",
		"Currency",
		!normalizeText(employee?.currency) && !normalizeText(draft?.currency),
	);
	addMissing(
		"COMPENSATION",
		"employee.payFrequency",
		"Pay frequency",
		!normalizeText(employee?.payFrequency) && !normalizeText(draft?.payFrequency),
	);

	let generatedUserName: string | null = null;
	generatedUserName =
		buildGeneratedUsername(personalInfo.firstName, personalInfo.lastName) || null;

	addMissing(
		"ACCESS",
		"employee.role",
		"Resolved employee role",
		!normalizeText(employee?.role) && !normalizeText(derivedRole?.role),
	);
	addMissing(
		"ACCESS",
		"user.email",
		"Login email",
		!normalizeText(draft?.email) && !normalizeText(contactInfo.email),
	);
	addMissing("ACCESS", "user.userName", "Generated username", !normalizeText(generatedUserName));

	const groups = (Object.keys(PRE_HIRE_GROUP_LABELS) as ApplicantSetupGroupKey[]).map((key) => {
		const missingCount = missingFields.filter((field) => field.group === key).length;
		return {
			key,
			label: PRE_HIRE_GROUP_LABELS[key],
			isReady: missingCount === 0,
			missingCount,
		};
	});

	return {
		employeeId: resolvedEmployeeCode || null,
		isReady: missingFields.length === 0,
		missingFields,
		groups,
		draft: draft ? { ...draft } : null,
		access: {
			role: normalizeText(employee?.role) || derivedRole?.role || null,
			loginEmail: normalizeText(draft?.email) || normalizeText(contactInfo.email) || null,
			loginMethod: "email",
			generatedUserName,
			hasLinkedUser: Boolean(employee?.userId),
		},
	};
};

const assertApplicantReadyForHire = async (
	prisma: PrismaExecutor,
	params: {
		organizationId: string;
		applicantId: string;
	},
) => {
	const readiness = await getApplicantPreHireSetupReadiness(prisma, params);
	if (!readiness) {
		throw new ApplicantActionValidationError("Applicant not found", 404);
	}

	if (readiness.isReady) return readiness;

	throw new ApplicantActionValidationError(
		"Complete employee setup before marking this candidate as hired.",
		400,
		readiness.missingFields.map((field) => ({
			field: field.field,
			message: `${field.label} is required before hire.`,
		})),
	);
};

const assertWorkforceHeadcountCapacityForHire = async (
	prisma: PrismaExecutor,
	params: {
		organizationId: string;
		departmentId?: string | null;
		sectionId?: string | null;
		positionId?: string | null;
		levelId?: string | null;
	},
) => {
	const settingsRecord = await getOrCreateWorkforceRecruitmentSetting(
		prisma,
		params.organizationId,
	);
	const settings = serializeWorkforceRecruitmentSetting(settingsRecord);
	if (!settings.isEnabled) return;

	const policy = resolveWorkforcePolicy(settings, {
		departmentId: params.departmentId,
		sectionId: params.sectionId,
		positionId: params.positionId,
		levelId: params.levelId,
	});
	const targetHeadcount = Number(policy?.targetHeadcount || 0);
	if (!policy || targetHeadcount <= 0) return;

	const currentHeadcount = await countCurrentHeadcount(prisma, {
		organizationId: params.organizationId,
		departmentId: params.departmentId,
		sectionId: params.sectionId,
		positionId: params.positionId,
		levelId: params.levelId,
	});
	const projectedHeadcount = currentHeadcount + 1;
	if (projectedHeadcount <= targetHeadcount) return;

	throw new ApplicantActionValidationError(
		"Cannot mark this candidate as hired because it exceeds the saved recruitment headcount target.",
		409,
		[
			{
				field: "headcount",
				message: `Current headcount is ${currentHeadcount}; hiring this candidate would make ${projectedHeadcount}, above the target of ${targetHeadcount}.`,
			},
		],
	);
};

const assertApplicantJobPipelineNotFull = async (
	prisma: PrismaExecutor,
	params: {
		applicant: {
			id: string;
			organizationId: string;
			jobId?: string | null;
			currentWorkflowStateKey?: string | null;
			convertedToEmployeeId?: string | null;
		};
		action: ApplicantActionCommand;
	},
) => {
	if (!RECRUITMENT_STAGE_MOVEMENT_ACTIONS.has(params.action)) return;

	const currentState = String(params.applicant.currentWorkflowStateKey || "").toUpperCase();
	if (currentState === "HIRED") return;

	const jobId = String(params.applicant.jobId || "").trim();
	if (!jobId) return;

	const job = await prisma.job.findFirst({
		where: {
			id: jobId,
			organizationId: params.applicant.organizationId,
			isDeleted: false,
		},
		select: {
			headcountRequested: true,
		},
	});
	const targetCount = Math.max(1, Number(job?.headcountRequested || 1));

	const hiredApplicantCount = await prisma.applicant.count({
		where: {
			organizationId: params.applicant.organizationId,
			jobId,
			isDeleted: false,
			id: { not: params.applicant.id },
			OR: [
				{ currentWorkflowStateKey: "HIRED" },
				{ convertedToEmployeeId: { not: null } },
			],
		},
	});

	const projectedHiredCount =
		params.action === "MARK_HIRED" ? hiredApplicantCount + 1 : hiredApplicantCount;
	const isFull =
		params.action === "MARK_HIRED"
			? projectedHiredCount > targetCount
			: hiredApplicantCount >= targetCount;
	if (!isFull) return;

	throw new ApplicantActionValidationError(
		"This job is already full. Stage movement is locked for remaining candidates.",
		409,
		[
			{
				field: "job.headcountRequested",
				message: `Hired count is ${hiredApplicantCount}/${targetCount}; this requisition cannot move more candidates through the pipeline.`,
			},
		],
	);
};

const assertApplicantNotPostHireLocked = (
	applicant: {
		currentWorkflowStateKey?: string | null;
		convertedToEmployeeId?: string | null;
	},
	action: ApplicantActionCommand,
) => {
	if (!POST_HIRE_BLOCKED_ACTIONS.has(action)) return;
	const isHired =
		String(applicant.currentWorkflowStateKey || "").toUpperCase() === "HIRED" ||
		Boolean(String(applicant.convertedToEmployeeId || "").trim());
	if (!isHired) return;

	throw new ApplicantActionValidationError(
		"Already hired. Employee record is the source of truth.",
		409,
		[
			{
				field: "currentWorkflowStateKey",
				message:
					"This candidate is terminally hired and cannot be moved through the recruitment pipeline.",
			},
		],
	);
};

const provisionApplicantEmployeeAccount = async (
	prisma: PrismaExecutor,
	params: {
		organizationId: string;
		applicantId: string;
		actingEmployeeId?: string | null;
		req?: Request;
	},
) => {
	const applicant = await getApplicantPreHireContext(prisma, params);
	const employee = applicant?.convertedToEmployee;
	const person = applicant?.person;

	if (!applicant || !employee || !person) {
		throw new ApplicantActionValidationError(
			"Unable to finalize this hire because the employee setup is incomplete.",
			400,
			[{ field: "convertedToEmployeeId", message: "Employee setup must exist before hire." }],
		);
	}

	if (employee.userId) {
		return employee;
	}

	const helpers = createEmployeeHelpers(
		prisma as unknown as PrismaClient,
		recruitmentRuntimeLogger,
	);
	const derivedFlags = deriveRoleAndFlagsFromRecord(
		employee.department as any,
		employee.level as any,
	);
	const roleName = derivedFlags.role || employee.role || "hris-employee";
	const roleId = await resolveAuthRoleIdByName(params.req, roleName);
	const credentials = helpers.generateUserCredentials(person, employee);
	const employeeMetadata = helpers.buildEmployeeMetadata(employee, person);
	const reqLike =
		params.req ||
		({
			headers: {},
			cookies: {},
			get: () => undefined,
		} as Partial<Request>);

	const userResult = await helpers.createUserAccount(
		{
			email: credentials.email,
			userName: credentials.userName,
			password: credentials.password,
			status: "active",
			loginMethod: "email",
			role: roleName,
			roleId: roleId ?? undefined,
			organizationId: credentials.organizationId,
			personId: person.id,
			metadata: {
				employee: employeeMetadata,
				requirePasswordChange: true,
			},
		},
		reqLike as Request,
	);
	const updatedEmployee = await helpers.updateEmployeeWithUserId(
		employee.id,
		userResult.userId,
		roleName,
		{
			isManager: derivedFlags.isManager,
			isHrManager: derivedFlags.isHrManager,
		},
	);
	await helpers.syncUserMetadataFromEmployee(userResult.userId, updatedEmployee.id, reqLike as Request);

	await createActivity(prisma, {
		organizationId: params.organizationId,
		applicantId: params.applicantId,
		workflowInstanceId: applicant.workflowInstanceId ?? null,
		stepExecutionId: null,
		stateKey: "HIRED",
		type: "SYSTEM_EVENT",
		title: "Employee login account provisioned",
		details: {
			employeeRecordId: updatedEmployee.id,
			userId: userResult.userId,
			role: roleName,
		},
		actorEmployeeId: params.actingEmployeeId ?? null,
	});

	return updatedEmployee;
};

export const provisionApplicantEmployeeAccountAfterHire = async (
	prisma: PrismaExecutor,
	params: {
		organizationId: string;
		applicantId: string;
		actingEmployeeId?: string | null;
		req?: Request;
	},
) => {
	return provisionApplicantEmployeeAccount(prisma, params);
};

/**
 * After recruitment marks an applicant HIRED, ensure Applicant.convertedToEmployeeId
 * (+ Person.employeeId) points at the employee source-of-truth record.
 * Idempotent: if the applicant/person is already converted, return or link the existing employee.
 */
export const convertHiredApplicantToEmployee = async (
	prisma: PrismaExecutor,
	params: {
		organizationId: string;
		applicantId: string;
		actingEmployeeId?: string | null;
	},
) => {
	const applicant = await getApplicantPreHireContext(prisma, params);
	if (!applicant) {
		throw new ApplicantActionValidationError("Applicant not found", 404);
	}

	if (applicant.convertedToEmployeeId) {
		return prisma.employee.findUnique({
			where: { id: applicant.convertedToEmployeeId },
		});
	}

	if (!applicant.personId || !applicant.person) {
		throw new ApplicantActionValidationError(
			"Applicant person record is required before creating the employee profile.",
			400,
			[{ field: "personId", message: "Applicant must have a linked person record." }],
		);
	}

	const personId = applicant.personId;
	const person = applicant.person;
	const draft = getApplicantPreHireDraft(applicant);
	const employeeCode = normalizeText(draft?.employeeId);
	if (!employeeCode) {
		throw new ApplicantActionValidationError(
			"Employee ID is required before marking this candidate as hired.",
			400,
			[{ field: "employee.employeeId", message: "Reserve or enter an employee ID first." }],
		);
	}

	const existingEmployeeByPerson = await prisma.employee.findUnique({
		where: { personId },
		select: { id: true, employeeId: true },
	});
	if (existingEmployeeByPerson) {
		await prisma.applicant.update({
			where: { id: applicant.id },
			data: { convertedToEmployeeId: existingEmployeeByPerson.id },
		});

		await prisma.person.update({
			where: { id: personId },
			data: {
				employeeId: existingEmployeeByPerson.id,
				...(applicant.organizationId ? { organizationId: applicant.organizationId } : {}),
			},
		});

		await createActivity(prisma, {
			organizationId: params.organizationId,
			applicantId: params.applicantId,
			workflowInstanceId: applicant.workflowInstanceId ?? null,
			stepExecutionId: null,
			stateKey: "HIRED",
			type: "SYSTEM_EVENT",
			title: "Existing employee record linked to hire",
			details: {
				employeeRecordId: existingEmployeeByPerson.id,
				employeeCode: existingEmployeeByPerson.employeeId,
			},
			actorEmployeeId: params.actingEmployeeId ?? null,
		});

		return existingEmployeeByPerson;
	}

	const existingEmployeeByCode = await prisma.employee.findFirst({
		where: {
			organizationId: params.organizationId,
			employeeId: employeeCode,
			isDeleted: false,
		},
		select: { id: true },
	});
	if (existingEmployeeByCode) {
		throw new ApplicantActionValidationError(
			"Employee ID is already in use.",
			400,
			[
				{
					field: "employee.employeeId",
					message: `${employeeCode} is already assigned to another employee.`,
				},
			],
		);
	}

	const positionId =
		normalizeText(draft?.positionId) ||
		applicant.positionId ||
		applicant.job?.positionId ||
		applicant.position?.id ||
		null;
	const departmentId =
		normalizeText(draft?.departmentId) ||
		applicant.departmentId ||
		applicant.position?.section?.departmentId ||
		applicant.job?.position?.section?.departmentId ||
		null;
	const sectionId =
		normalizeText(draft?.sectionId) ||
		applicant.job?.sectionId ||
		applicant.position?.sectionId ||
		applicant.job?.position?.sectionId ||
		null;
	const levelId = normalizeText(draft?.levelId) || applicant.job?.levelId || null;
	if (!positionId || !departmentId) {
		throw new ApplicantActionValidationError(
			"Department and position are required before creating the employee record.",
			400,
			[
				{ field: "employee.departmentId", message: "Department is required before hire." },
				{ field: "employee.positionId", message: "Position is required before hire." },
			],
		);
	}

	await assertWorkforceHeadcountCapacityForHire(prisma, {
		organizationId: params.organizationId,
		departmentId,
		sectionId,
		positionId,
		levelId,
	});

	const expectedSalary =
		parseDraftAmount(draft?.basicSalary) ||
		(typeof applicant.expectedSalary === "number" && applicant.expectedSalary > 0
			? applicant.expectedSalary
			: typeof applicant.position?.minSalary === "number" && applicant.position.minSalary > 0
				? applicant.position.minSalary
				: 1);
	const currency = normalizeText(draft?.currency || applicant.currency || "PHP") || "PHP";
	const payFrequency = normalizeText(draft?.payFrequency || "SEMI_MONTHLY") || "SEMI_MONTHLY";
	const workLocation = normalizeText(draft?.workLocation || "ONSITE") || "ONSITE";
	const employmentType =
		normalizeText(draft?.employmentType || "PROBATIONARY") || "PROBATIONARY";
	const employmentHireDate = parseDraftDate(draft?.employmentHireDate) ?? new Date();
	const probationEndDate = parseDraftDate(draft?.probationEndDate);
	const reportToId = normalizeText(draft?.reportToId) || null;

	let employmentStart = new Date();
	const draftStart = parseDraftDate(draft?.employmentStartDate);
	if (draftStart) {
		employmentStart = draftStart;
	} else if (applicant.availabilityDate) {
		const parsedAvailability = new Date(applicant.availabilityDate);
		if (!Number.isNaN(parsedAvailability.getTime())) {
			employmentStart = parsedAvailability;
		}
	}

	const embeddedSchedule = normalizeEmbeddedScheduleFromDraft(
		parseJsonRecord(draft?.scheduleSnapshot),
		{
			effectiveStartDate: employmentStart,
			assignedAt: employmentHireDate ?? null,
		},
	);

	const existingPersonalInfo =
		typeof person.personalInfo === "object" && person.personalInfo !== null
			? (person.personalInfo as Record<string, unknown>)
			: {};
	const draftDateOfBirth = parseDraftDate(draft?.dateOfBirth);
	const draftGender = normalizeText(draft?.gender);
	const draftNationality = normalizeText(draft?.nationality);
	const existingContactInfo =
		((person.contactInfo as Record<string, unknown> | null) || {}) as Record<string, unknown>;
	const existingContactEmail = normalizeText((existingContactInfo.email as string | undefined) || "");
	const mergedPersonalInfo = {
		...existingPersonalInfo,
		firstName: existingPersonalInfo.firstName,
		lastName: existingPersonalInfo.lastName,
		...(draftDateOfBirth ? { dateOfBirth: draftDateOfBirth } : {}),
		...(draftGender ? { gender: draftGender } : {}),
		...(draftNationality ? { nationality: draftNationality } : {}),
	};

	await prisma.person.update({
		where: { id: personId },
		data: {
			personalInfo: mergedPersonalInfo as any,
			contactInfo: {
				...existingContactInfo,
				email: existingContactEmail || normalizeText(draft?.email),
				phones: [
					{
						type: "mobile",
						countryCode: normalizeText(draft?.phoneCountryCode) || "+63",
						number: normalizeText(draft?.phoneNumber),
						isPrimary: true,
					},
				],
				address: [
					{
						street: normalizeText(draft?.street),
						city: normalizeText(draft?.city),
						state: normalizeText(draft?.state),
						country: normalizeText(draft?.country) || "Philippines",
						postalCode: normalizeText(draft?.postalCode),
						zipCode: normalizeText(draft?.postalCode),
						houseNumber: "",
					},
				],
			},
		},
	});

	const employeeRecord = await prisma.employee.create({
		data: {
			organizationId: params.organizationId,
			employeeId: employeeCode,
			role: "hris-employee",
			departmentId,
			sectionId,
			positionId,
			levelId,
			basicSalary: expectedSalary,
			currency,
			payFrequency: payFrequency as any,
			employmentStatus: "ONBOARDING",
			employmentType: employmentType as any,
			workforceSource: "DIRECT",
			workLocation: workLocation as any,
			personId,
			...(reportToId ? { reportToId } : {}),
			employmentHireDate,
			employmentStartDate: employmentStart,
			...(probationEndDate ? { probationEndDate } : {}),
			leaveBalances: [],
			employmentHistory: [],
			isDeleted: false,
			isTour: false,
			isManager: false,
			isHrManager: false,
			...(embeddedSchedule ? { embeddedSchedule: embeddedSchedule as any } : {}),
			metadata: toJsonValue({
				source: "recruitment_hire",
				applicantId: applicant.id,
			}),
		},
		select: { id: true, employeeId: true },
	});

	await prisma.applicant.update({
		where: { id: applicant.id },
		data: { convertedToEmployeeId: employeeRecord.id },
	});

	await prisma.person.update({
		where: { id: personId },
		data: {
			employeeId: employeeRecord.id,
			...(applicant.organizationId ? { organizationId: applicant.organizationId } : {}),
		},
	});

	await createActivity(prisma, {
		organizationId: params.organizationId,
		applicantId: params.applicantId,
		workflowInstanceId: applicant.workflowInstanceId ?? null,
		stepExecutionId: null,
		stateKey: "HIRED",
		type: "SYSTEM_EVENT",
		title: "Employee record created from hire",
		details: {
			employeeRecordId: employeeRecord.id,
			employeeCode: employeeRecord.employeeId,
		},
		actorEmployeeId: params.actingEmployeeId ?? null,
	});

	return employeeRecord;

};

export const executeApplicantAction = async (
	prisma: PrismaExecutor,
	params: {
		organizationId: string;
		applicantId: string;
		action: ApplicantActionCommand;
		req?: Request;
		actingEmployeeId?: string | null;
		stepExecutionId?: string | null;
		comments?: string | null;
		targetStateKey?: string | null;
		metadata?: Record<string, unknown>;
	},
) => {
	const applicant = await prisma.applicant.findFirst({
		where: {
			id: params.applicantId,
			organizationId: params.organizationId,
			isDeleted: false,
		},
	});

	if (!applicant || !applicant.workflowInstanceId) {
		throw new Error("Applicant workflow is not initialized");
	}

	const workflowInstance = await prisma.workflowInstance.findUnique({
		where: { id: applicant.workflowInstanceId },
		select: {
			id: true,
			states: true,
			steps: true,
			currentStateKey: true,
		},
	});

	if (!workflowInstance) {
		throw new Error("Workflow instance not found");
	}

	const currentStep = await findCurrentApplicantStep(
		prisma,
		params.applicantId,
		params.stepExecutionId,
	);

	const states = parseStates(workflowInstance.states);
	const steps = parseSteps(workflowInstance.steps);

	assertApplicantNotPostHireLocked(applicant, params.action);

	await assertApplicantJobPipelineNotFull(prisma, {
		applicant,
		action: params.action,
	});

	const completeStepWithTransition = async (
		step: NonNullable<typeof currentStep>,
		status: "APPROVED" | "REJECTED" | "COMPLETED",
		nextStateKey: string | null,
		source: string,
		activity?:
			| {
					type:
						| "NOTE"
						| "INTERVIEW"
						| "REJECTION"
						| "OFFER"
						| "ASSIGNMENT"
						| "EMAIL_EVENT"
						| "SYSTEM_EVENT";
					title: string;
			  }
			| undefined,
	) => {
		const safeMetadata = sanitizeApplicantActionMetadata(params.metadata);
		await prisma.workflowStepExecution.update({
			where: { id: step.id },
			data: {
				status,
				completedAt: new Date(),
				comments: params.comments || null,
				assigneeId: step.assigneeId ?? params.actingEmployeeId ?? null,
				metadata: safeMetadata ? toJsonValue(safeMetadata) : undefined,
			},
		});

		if (activity) {
			await createActivity(prisma, {
				organizationId: params.organizationId,
				applicantId: params.applicantId,
				workflowInstanceId: workflowInstance.id,
				stepExecutionId: step.id,
				stateKey: nextStateKey || applicant.currentWorkflowStateKey,
				type: activity.type,
				title: activity.title,
				details: safeMetadata || undefined,
				actorEmployeeId: params.actingEmployeeId,
			});
		}

		if (nextStateKey) {
			await transitionApplicantState(prisma, {
				applicantId: params.applicantId,
				workflowInstanceId: workflowInstance.id,
				nextStateKey,
				source,
				stepExecutionId: step.id,
				stepNumber: step.stepNumber,
				stepName: step.stepName,
				changedByEmployeeId: params.actingEmployeeId,
				metadata: safeMetadata || undefined,
			});
		}

		await syncApplicantCurrentStep(prisma, params.applicantId, step.id);
	};

	switch (params.action) {
		case "ASSIGN_RECRUITER": {
		const assigneeId = String(
			params.metadata?.assignedEmployeeId || params.metadata?.assigneeId || "",
		).trim();
			if (!assigneeId || !currentStep) {
				throw new Error("assigneeId and an active workflow step are required");
			}

			await prisma.workflowStepExecution.update({
				where: { id: currentStep.id },
				data: {
					assigneeId,
					metadata: toJsonValue({
						...(typeof currentStep.metadata === "object" && currentStep.metadata
							? (currentStep.metadata as Record<string, unknown>)
							: {}),
						assignedAt: new Date().toISOString(),
						assignedByEmployeeId: params.actingEmployeeId ?? null,
					}),
				},
			});

			await createActivity(prisma, {
				organizationId: params.organizationId,
				applicantId: params.applicantId,
				workflowInstanceId: workflowInstance.id,
				stepExecutionId: currentStep.id,
				stateKey: applicant.currentWorkflowStateKey,
				type: "ASSIGNMENT",
				title: "Recruiter assigned",
				details: params.metadata,
				actorEmployeeId: params.actingEmployeeId,
			});
			break;
		}
		case "SAVE_PRE_HIRE_SETUP": {
			const persistedDraft = await persistPreHireDraftOnApplicant(prisma, {
				applicantId: params.applicantId,
				currentMetadata: (applicant as any).metadata,
				metadata: params.metadata,
			});

			await createActivity(prisma, {
				organizationId: params.organizationId,
				applicantId: params.applicantId,
				workflowInstanceId: workflowInstance.id,
				stepExecutionId: currentStep?.id ?? null,
				stateKey: applicant.currentWorkflowStateKey,
				type: "SYSTEM_EVENT",
				title: "Pre-hire setup draft saved",
				details: {
					fieldsSaved: Object.keys(persistedDraft || {}),
				},
				actorEmployeeId: params.actingEmployeeId,
			});
			break;
		}
		case "ADVANCE":
		case "COMPLETE_STEP":
		case "SCHEDULE_INTERVIEW":
		case "SEND_OFFER":
		case "MARK_ONBOARDING_READY":
		case "MARK_HIRED": {
			if (!currentStep) {
				throw new Error("No active workflow step found");
			}

			if (params.action === "MARK_HIRED" && params.metadata) {
				await persistPreHireDraftOnApplicant(prisma, {
					applicantId: params.applicantId,
					currentMetadata: (applicant as any).metadata,
					metadata: params.metadata,
				});
			}

			if (params.action === "MARK_HIRED") {
				await assertApplicantReadyForHire(prisma, {
					organizationId: params.organizationId,
					applicantId: params.applicantId,
				});
			}

			const nextStateKey =
				params.targetStateKey ||
				steps.find((step) => step.step_number === currentStep.stepNumber)?.state_on_complete ||
				null;

			await completeStepWithTransition(
				currentStep,
				"COMPLETED",
				nextStateKey,
				params.action.toLowerCase(),
				params.action === "SCHEDULE_INTERVIEW"
					? { type: "INTERVIEW", title: "Interview scheduled" }
					: params.action === "SEND_OFFER"
						? { type: "OFFER", title: "Offer sent to candidate" }
						: params.action === "MARK_HIRED"
							? { type: "SYSTEM_EVENT", title: "Candidate marked as hired" }
							: undefined,
			);
			break;
		}
		case "APPROVE_STEP": {
			if (!currentStep) {
				throw new Error("No active workflow step found");
			}
			if (currentStep.stepType !== "APPROVAL") {
				throw new Error("Current workflow step is not approvable");
			}

			const nextStateKey =
				params.targetStateKey ||
				steps.find((step) => step.step_number === currentStep.stepNumber)?.state_on_approve ||
				null;

			await completeStepWithTransition(
				currentStep,
				"APPROVED",
				nextStateKey,
				"step_approved",
			);
			break;
		}
		case "REJECT_STEP": {
			if (!currentStep) {
				throw new Error("No active workflow step found");
			}
			const nextStateKey =
				params.targetStateKey ||
				steps.find((step) => step.step_number === currentStep.stepNumber)?.state_on_reject ||
				"REJECTED";

			await completeStepWithTransition(
				currentStep,
				"REJECTED",
				nextStateKey,
				"step_rejected",
				{ type: "REJECTION", title: "Candidate rejected" },
			);
			break;
		}
		default:
			throw new Error(`Unsupported applicant action: ${params.action}`);
	}

	if (params.action === "MARK_HIRED") {
		await convertHiredApplicantToEmployee(prisma, {
			organizationId: params.organizationId,
			applicantId: params.applicantId,
			actingEmployeeId: params.actingEmployeeId ?? null,
		});
	}

	return {
		applicantId: params.applicantId,
		requiresPostCommitAccountProvisioning: params.action === "MARK_HIRED",
	};
};
