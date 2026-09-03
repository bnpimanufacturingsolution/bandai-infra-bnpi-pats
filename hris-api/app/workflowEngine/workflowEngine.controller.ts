import { Response, NextFunction } from "express";
import {
	PrismaClient,
	Prisma,
	type RequestType,
	type WorkflowDomain,
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
	CreateWorkflowInstanceSchema,
	UpdateWorkflowInstanceSchema,
} from "../../zod/WorkflowInstance.zod";
import { logActivity } from "../../utils/activityLogger";
import { logAudit } from "../../utils/auditLogger";
import { config } from "../../config/constant";
import { redisClient } from "../../config/redis";
import { invalidateCache } from "../../middleware/cache";
import type { AuthRequest } from "../../middleware/verifyToken";

const logger = getLogger();
const workflowInstanceLogger = logger.child({ module: "workflowEngine" });

const resolveRequestData = (req: AuthRequest) => {
	let requestData = req.body;
	const contentType = req.get("Content-Type") || "";

	if (
		contentType.includes("application/x-www-form-urlencoded") ||
		contentType.includes("multipart/form-data")
	) {
		workflowInstanceLogger.info("Original form data:", JSON.stringify(req.body, null, 2));
		requestData = transformFormDataToObject(req.body);
		workflowInstanceLogger.info(
			"Transformed form data to object structure:",
			JSON.stringify(requestData, null, 2),
		);
	}

	return requestData;
};

const toInputJsonValue = (value: unknown): Prisma.InputJsonValue => value as Prisma.InputJsonValue;

type EditableWorkflowState = {
	key: string;
	label: string;
	order: number;
	isTerminal?: boolean;
};

type EditableWorkflowStep = {
	step_number: number;
	step_name: string;
	step_type: "SUBMISSION" | "APPROVAL" | "TASK";
	assignee_type:
		| "REQUESTER"
		| "SUPERVISOR"
		| "TARGET_DEPARTMENT_MANAGER"
		| "HR"
		| "SYSTEM";
	assignee_role?: string | null;
	is_required?: boolean;
	state_on_enter?: string | null;
	state_on_approve?: string | null;
	state_on_reject?: string | null;
	state_on_complete?: string | null;
	state_on_skip?: string | null;
};

const RECRUITMENT_APPLICANT_STATE_HINTS = new Set([
	"APPLIED",
	"SCREENING",
	"INTERVIEW_SCHEDULING",
	"INTERVIEW",
	"OFFER_APPROVAL",
	"OFFER_SENT",
	"ONBOARDING_READY",
	"HIRED",
	"REJECTED",
]);

const normalizeStateKey = (value: unknown) => String(value || "").trim().toUpperCase();

const buildStateLabelFromKey = (value: string) =>
	value
		.toLowerCase()
		.split("_")
		.filter(Boolean)
		.map((part) => part.charAt(0).toUpperCase() + part.slice(1))
		.join(" ");

const parseEditableWorkflowStates = (value: unknown): EditableWorkflowState[] =>
	Array.isArray(value)
		? value.map((item: any, index) => {
				const key = normalizeStateKey(item?.key || `STATE_${index + 1}`);
				return {
					key,
					label: String(item?.label || buildStateLabelFromKey(key) || `State ${index + 1}`),
					order: Number.isFinite(Number(item?.order)) ? Number(item.order) : index,
					isTerminal: item?.isTerminal === true,
				};
			})
		: [];

const parseEditableWorkflowSteps = (value: unknown): EditableWorkflowStep[] =>
	Array.isArray(value)
		? value.map((item: any, index) => ({
				step_number: index + 1,
				step_name: String(item?.step_name || `Step ${index + 1}`).trim(),
				step_type: (String(item?.step_type || "TASK").trim().toUpperCase() ||
					"TASK") as EditableWorkflowStep["step_type"],
				assignee_type: (String(item?.assignee_type || "HR").trim().toUpperCase() ||
					"HR") as EditableWorkflowStep["assignee_type"],
				assignee_role: String(item?.assignee_role || "").trim(),
				is_required: item?.is_required !== false,
				state_on_enter: normalizeStateKey(item?.state_on_enter) || "",
				state_on_approve: normalizeStateKey(item?.state_on_approve) || "",
				state_on_reject: normalizeStateKey(item?.state_on_reject) || "",
				state_on_complete: normalizeStateKey(item?.state_on_complete) || "",
				state_on_skip: normalizeStateKey(item?.state_on_skip) || "",
			}))
		: [];

const isRecruitmentApplicantTemplate = (params: {
	domain?: WorkflowDomain | null;
	domainRecordId?: string | null;
	steps?: unknown;
	states?: unknown;
}) => {
	if (params.domain !== "RECRUITMENT" || params.domainRecordId) return false;

	const states = parseEditableWorkflowStates(params.states);
	const steps = parseEditableWorkflowSteps(params.steps);
	const candidateKeys = new Set<string>();

	for (const state of states) {
		if (state.key) candidateKeys.add(state.key);
	}
	for (const step of steps) {
		if (step.state_on_enter) candidateKeys.add(step.state_on_enter);
		if (step.state_on_complete) candidateKeys.add(step.state_on_complete);
		if (step.state_on_approve) candidateKeys.add(step.state_on_approve);
		if (step.state_on_reject) candidateKeys.add(step.state_on_reject);
	}

	return (
		candidateKeys.has("APPLIED") &&
		(candidateKeys.has("HIRED") ||
			[...candidateKeys].some((key) => RECRUITMENT_APPLICANT_STATE_HINTS.has(key)))
	);
};

const normalizeRecruitmentApplicantTemplate = (params: {
	domain?: WorkflowDomain | null;
	domainRecordId?: string | null;
	steps?: unknown;
	states?: unknown;
	currentStateKey?: string | null;
}) => {
	if (!isRecruitmentApplicantTemplate(params)) {
		return {
			steps: params.steps,
			states: params.states,
			currentStateKey: params.currentStateKey,
		};
	}

	const steps = parseEditableWorkflowSteps(params.steps);
	const states = parseEditableWorkflowStates(params.states);
	if (!steps.length) {
		return {
			steps: params.steps,
			states: params.states,
			currentStateKey: params.currentStateKey,
		};
	}

	const stateMeta = new Map(
		states.map((state) => [
			state.key,
			{ label: state.label, isTerminal: state.isTerminal === true },
		]),
	);
	const terminalStateKeys = new Set(
		states.filter((state) => state.isTerminal).map((state) => state.key),
	);
	const fallbackRejectKey =
		steps.find((step) => step.state_on_reject)?.state_on_reject ||
		(terminalStateKeys.has("REJECTED") ? "REJECTED" : "");
	const fallbackFinalKey =
		(terminalStateKeys.has("HIRED") ? "HIRED" : "") ||
		steps[steps.length - 1]?.state_on_complete ||
		steps[steps.length - 1]?.state_on_approve ||
		"";

	const normalizedSteps = steps.map((step, index) => {
		const nextEnterKey = steps[index + 1]?.state_on_enter || "";
		if (step.step_type === "APPROVAL") {
			return {
				...step,
				step_number: index + 1,
				state_on_approve: nextEnterKey || fallbackFinalKey || "",
				state_on_reject: step.state_on_reject || fallbackRejectKey || "",
				state_on_complete: "",
			};
		}

		return {
			...step,
			step_number: index + 1,
			state_on_complete: nextEnterKey || fallbackFinalKey || "",
			state_on_approve: "",
		};
	});

	const orderedStateKeys: string[] = [];
	const addStateKey = (value?: string | null) => {
		const key = normalizeStateKey(value);
		if (!key || orderedStateKeys.includes(key)) return;
		orderedStateKeys.push(key);
	};

	for (const step of normalizedSteps) {
		addStateKey(step.state_on_enter);
	}
	addStateKey(fallbackFinalKey);
	for (const step of normalizedSteps) {
		addStateKey(step.state_on_reject);
		addStateKey(step.state_on_skip);
	}
	for (const state of [...states].sort((left, right) => left.order - right.order)) {
		addStateKey(state.key);
	}

	const normalizedStates = orderedStateKeys.map((key, index) => ({
		key,
		label: stateMeta.get(key)?.label || buildStateLabelFromKey(key) || `State ${index + 1}`,
		order: index,
		isTerminal:
			stateMeta.get(key)?.isTerminal === true ||
			terminalStateKeys.has(key) ||
			key === fallbackFinalKey ||
			key === fallbackRejectKey,
	}));

	const currentStateKey = normalizeStateKey(params.currentStateKey);

	return {
		steps: normalizedSteps,
		states: normalizedStates,
		currentStateKey:
			normalizedStates.find((state) => state.key === currentStateKey)?.key ||
			normalizedStates[0]?.key ||
			currentStateKey ||
			"OPEN",
	};
};

const toWorkflowInstanceCreateInput = (data: {
	organizationId: string;
	domain: WorkflowDomain;
	domainRecordId?: string;
	requestType?: RequestType;
	code?: string;
	name?: string;
	description?: string;
	steps: unknown;
	states?: unknown;
	currentStateKey: string;
	stateHistory: unknown[];
	isDeleted: boolean;
}): Prisma.WorkflowInstanceCreateInput => ({
	organizationId: data.organizationId,
	domain: data.domain,
	domainRecordId: data.domainRecordId ?? null,
	requestType: data.requestType ?? null,
	code: data.code ?? null,
	name: data.name ?? null,
	description: data.description ?? null,
	steps: toInputJsonValue(data.steps),
	states: data.states === undefined ? undefined : toInputJsonValue(data.states),
	currentStateKey: data.currentStateKey,
	stateHistory: data.stateHistory.map((item: unknown) => toInputJsonValue(item)),
	isDeleted: data.isDeleted,
});

const toWorkflowInstanceUpdateInput = (data: {
	domain?: WorkflowDomain;
	domainRecordId?: string;
	requestType?: RequestType;
	code?: string;
	name?: string;
	description?: string;
	steps?: unknown;
	states?: unknown;
	currentStateKey?: string;
	stateHistory?: unknown[];
	isDeleted?: boolean;
}): Prisma.WorkflowInstanceUpdateInput => ({
	domain: data.domain,
	domainRecordId: data.domainRecordId === undefined ? undefined : (data.domainRecordId ?? null),
	requestType: data.requestType === undefined ? undefined : (data.requestType ?? null),
	code: data.code === undefined ? undefined : (data.code ?? null),
	name: data.name === undefined ? undefined : (data.name ?? null),
	description: data.description === undefined ? undefined : (data.description ?? null),
	steps: data.steps === undefined ? undefined : toInputJsonValue(data.steps),
	states: data.states === undefined ? undefined : toInputJsonValue(data.states),
	currentStateKey: data.currentStateKey,
	stateHistory:
		data.stateHistory === undefined
			? undefined
			: data.stateHistory.map((item: unknown) => toInputJsonValue(item)),
	isDeleted: data.isDeleted,
});

const requireOrganizationId = (req: AuthRequest, res: Response): string | null => {
	const organizationId = String(req.organizationId || req.body?.organizationId || "").trim();
	if (!organizationId) {
		res.status(401).json(buildErrorResponse("Organization ID is required", 401));
		return null;
	}
	return organizationId;
};

export const controller = (prisma: PrismaClient) => {
	const create = async (req: AuthRequest, res: Response, _next: NextFunction) => {
		const organizationId = requireOrganizationId(req, res);
		if (!organizationId) return;

		const requestData = {
			...resolveRequestData(req),
			organizationId,
		};

		const validation = CreateWorkflowInstanceSchema.safeParse(requestData);
		if (!validation.success) {
			const formattedErrors = formatZodErrors(validation.error.format());
			workflowInstanceLogger.error(`Validation failed: ${JSON.stringify(formattedErrors)}`);
			res.status(400).json(buildErrorResponse("Validation failed", 400, formattedErrors));
			return;
		}

		try {
			if (!validation.data.domainRecordId && validation.data.code) {
				const existingTemplate = await prisma.workflowInstance.findFirst({
					where: {
						organizationId,
						domain: validation.data.domain,
						domainRecordId: null,
						code: validation.data.code,
						isDeleted: false,
					},
					select: { id: true },
				});

				if (existingTemplate) {
					res.status(409).json(
						buildErrorResponse(
							"Workflow template code already exists for this domain",
							409,
						),
					);
					return;
				}
			}

			const normalizedRecruitmentTemplate = normalizeRecruitmentApplicantTemplate({
				domain: validation.data.domain,
				domainRecordId: validation.data.domainRecordId,
				steps: validation.data.steps,
				states: validation.data.states,
				currentStateKey: validation.data.currentStateKey,
			});

			const createData = toWorkflowInstanceCreateInput({
				...validation.data,
				steps: normalizedRecruitmentTemplate.steps,
				states: normalizedRecruitmentTemplate.states,
				currentStateKey: normalizedRecruitmentTemplate.currentStateKey || "OPEN",
				stateHistory: validation.data.stateHistory || [],
			});
			const workflowInstance = await prisma.workflowInstance.create({
				data: createData,
			});

			logActivity(req, {
				userId: req.userId || "unknown",
				action: config.ACTIVITY_LOG.WORKFLOWINSTANCE.ACTIONS.CREATE_WORKFLOWINSTANCE,
				description: `${config.ACTIVITY_LOG.WORKFLOWINSTANCE.DESCRIPTIONS.WORKFLOWINSTANCE_CREATED}: ${workflowInstance.name || workflowInstance.code || workflowInstance.id}`,
				page: {
					url: req.originalUrl,
					title: config.ACTIVITY_LOG.WORKFLOWINSTANCE.PAGES.WORKFLOWINSTANCE_CREATION,
				},
			});

			logAudit(req, {
				userId: req.userId || "unknown",
				action: config.AUDIT_LOG.ACTIONS.CREATE,
				resource: config.AUDIT_LOG.RESOURCES.WORKFLOWINSTANCE,
				severity: config.AUDIT_LOG.SEVERITY.LOW,
				entityType: config.AUDIT_LOG.ENTITY_TYPES.WORKFLOWINSTANCE,
				entityId: workflowInstance.id,
				changesBefore: null,
				changesAfter: workflowInstance,
				description: `${config.AUDIT_LOG.WORKFLOWINSTANCE.DESCRIPTIONS.WORKFLOWINSTANCE_CREATED}: ${workflowInstance.name || workflowInstance.code || workflowInstance.id}`,
				organizationId,
			});

			try {
				await invalidateCache.byPattern("cache:workflowEngine:list:*");
			} catch (cacheError) {
				workflowInstanceLogger.warn(
					"Failed to invalidate cache after workflow instance creation:",
					cacheError,
				);
			}

			res.status(201).json(
				buildSuccessResponse(
					config.SUCCESS.WORKFLOWINSTANCE.CREATED,
					{ workflowInstance },
					201,
				),
			);
		} catch (error) {
			workflowInstanceLogger.error(
				`${config.ERROR.WORKFLOWINSTANCE.CREATE_FAILED}: ${error}`,
			);
			res.status(500).json(
				buildErrorResponse(config.ERROR.COMMON.INTERNAL_SERVER_ERROR, 500),
			);
		}
	};

	const getAll = async (req: AuthRequest, res: Response, _next: NextFunction) => {
		const organizationId = requireOrganizationId(req, res);
		if (!organizationId) return;

		const validationResult = validateQueryParams(req, workflowInstanceLogger);
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
			templateOnly,
		} = validationResult.validatedParams!;

		try {
			const whereClause: Prisma.WorkflowInstanceWhereInput = {
				organizationId,
				isDeleted: false,
			};

			const searchFields = [
				"code",
				"name",
				"description",
				"domain",
				"requestType",
				"currentStateKey",
			];

			if (query) {
				const searchConditions = buildSearchConditions(
					"WorkflowInstance",
					query,
					searchFields,
				);
				if (searchConditions.length > 0) {
					whereClause.OR = searchConditions;
				}
			}

			if (filter) {
				const filterConditions = buildFilterConditions("WorkflowInstance", filter);
				if (filterConditions.length > 0) {
					whereClause.AND = filterConditions;
				}
			}

			if (templateOnly) {
				whereClause.domainRecordId = null;
			}

			const findManyQuery = buildFindManyQuery(whereClause, skip, limit, order, sort, fields);
			const [workflowInstances, total] = await Promise.all([
				document ? prisma.workflowInstance.findMany(findManyQuery) : [],
				count ? prisma.workflowInstance.count({ where: whereClause }) : 0,
			]);

			const processedData =
				groupBy && document
					? groupDataByField(workflowInstances, groupBy as string)
					: workflowInstances;

			res.status(200).json(
				buildSuccessResponse(
					config.SUCCESS.WORKFLOWINSTANCE.RETRIEVED_ALL,
					{
						...(document && { workflowInstances: processedData }),
						...(count && { count: total }),
						...(pagination && { pagination: buildPagination(total, page, limit) }),
						...(groupBy && { groupedBy: groupBy }),
					},
					200,
				),
			);
		} catch (error) {
			workflowInstanceLogger.error(
				`${config.ERROR.WORKFLOWINSTANCE.GET_ALL_FAILED}: ${error}`,
			);
			res.status(500).json(
				buildErrorResponse(config.ERROR.COMMON.INTERNAL_SERVER_ERROR, 500),
			);
		}
	};

	const getById = async (req: AuthRequest, res: Response, _next: NextFunction) => {
		const organizationId = requireOrganizationId(req, res);
		if (!organizationId) return;

		const { id } = req.params;
		const { fields } = req.query;

		try {
			if (!id) {
				res.status(400).json(buildErrorResponse(config.ERROR.QUERY_PARAMS.MISSING_ID, 400));
				return;
			}

			if (fields && typeof fields !== "string") {
				res.status(400).json(
					buildErrorResponse(config.ERROR.QUERY_PARAMS.POPULATE_MUST_BE_STRING, 400),
				);
				return;
			}

			const cacheKey = `cache:workflowEngine:byId:${id}:${fields || "full"}`;
			let workflowInstance = null;

			try {
				if (redisClient.isClientConnected()) {
					workflowInstance = await redisClient.getJSON(cacheKey);
				}
			} catch (cacheError) {
				workflowInstanceLogger.warn(
					`Redis cache retrieval failed for workflow instance ${id}:`,
					cacheError,
				);
			}

			if (!workflowInstance) {
				const queryArgs: Prisma.WorkflowInstanceFindFirstArgs = {
					where: {
						id,
						organizationId,
						isDeleted: false,
					},
				};

				const selectedFields = getNestedFields(fields);
				if (selectedFields) {
					queryArgs.select = selectedFields;
				}

				workflowInstance = await prisma.workflowInstance.findFirst(queryArgs);

				if (workflowInstance && redisClient.isClientConnected()) {
					try {
						await redisClient.setJSON(cacheKey, workflowInstance, 3600);
					} catch (cacheError) {
						workflowInstanceLogger.warn(
							`Failed to store workflow instance ${id} in Redis cache:`,
							cacheError,
						);
					}
				}
			}

			if (!workflowInstance) {
				res.status(404).json(
					buildErrorResponse(config.ERROR.WORKFLOWINSTANCE.NOT_FOUND, 404),
				);
				return;
			}

			res.status(200).json(
				buildSuccessResponse(
					config.SUCCESS.WORKFLOWINSTANCE.RETRIEVED,
					{ workflowInstance },
					200,
				),
			);
		} catch (error) {
			workflowInstanceLogger.error(
				`${config.ERROR.WORKFLOWINSTANCE.ERROR_GETTING}: ${error}`,
			);
			res.status(500).json(
				buildErrorResponse(config.ERROR.COMMON.INTERNAL_SERVER_ERROR, 500),
			);
		}
	};

	const update = async (req: AuthRequest, res: Response, _next: NextFunction) => {
		const organizationId = requireOrganizationId(req, res);
		if (!organizationId) return;

		const { id } = req.params;
		if (!id) {
			res.status(400).json(buildErrorResponse(config.ERROR.QUERY_PARAMS.MISSING_ID, 400));
			return;
		}

		const requestData = resolveRequestData(req);
		if (!requestData || Object.keys(requestData).length === 0) {
			res.status(400).json(buildErrorResponse(config.ERROR.COMMON.NO_UPDATE_FIELDS, 400));
			return;
		}

		const validation = UpdateWorkflowInstanceSchema.safeParse(requestData);
		if (!validation.success) {
			const formattedErrors = formatZodErrors(validation.error.format());
			workflowInstanceLogger.error(`Validation failed: ${JSON.stringify(formattedErrors)}`);
			res.status(400).json(buildErrorResponse("Validation failed", 400, formattedErrors));
			return;
		}

		try {
			const existingWorkflowInstance = await prisma.workflowInstance.findFirst({
				where: {
					id,
					organizationId,
					isDeleted: false,
				},
			});

			if (!existingWorkflowInstance) {
				res.status(404).json(
					buildErrorResponse(config.ERROR.WORKFLOWINSTANCE.NOT_FOUND, 404),
				);
				return;
			}

			const normalizedRecruitmentTemplate = normalizeRecruitmentApplicantTemplate({
				domain: validation.data.domain ?? existingWorkflowInstance.domain,
				domainRecordId:
					validation.data.domainRecordId === undefined
						? existingWorkflowInstance.domainRecordId
						: validation.data.domainRecordId,
				steps: validation.data.steps ?? existingWorkflowInstance.steps,
				states: validation.data.states ?? existingWorkflowInstance.states,
				currentStateKey:
					validation.data.currentStateKey ?? existingWorkflowInstance.currentStateKey,
			});

			const updatedWorkflowInstance = await prisma.workflowInstance.update({
				where: { id },
				data: toWorkflowInstanceUpdateInput({
					...validation.data,
					steps: normalizedRecruitmentTemplate.steps,
					states: normalizedRecruitmentTemplate.states,
					currentStateKey:
						normalizedRecruitmentTemplate.currentStateKey ||
						validation.data.currentStateKey,
				}),
			});

			logActivity(req, {
				userId: req.userId || "unknown",
				action: config.ACTIVITY_LOG.WORKFLOWINSTANCE.ACTIONS.UPDATE_WORKFLOWINSTANCE,
				description: `${config.ACTIVITY_LOG.WORKFLOWINSTANCE.DESCRIPTIONS.WORKFLOWINSTANCE_UPDATED}: ${updatedWorkflowInstance.name || updatedWorkflowInstance.code || updatedWorkflowInstance.id}`,
				page: {
					url: req.originalUrl,
					title: config.ACTIVITY_LOG.WORKFLOWINSTANCE.PAGES.WORKFLOWINSTANCE_UPDATE,
				},
			});

			logAudit(req, {
				userId: req.userId || "unknown",
				action: config.AUDIT_LOG.ACTIONS.UPDATE,
				resource: config.AUDIT_LOG.RESOURCES.WORKFLOWINSTANCE,
				severity: config.AUDIT_LOG.SEVERITY.LOW,
				entityType: config.AUDIT_LOG.ENTITY_TYPES.WORKFLOWINSTANCE,
				entityId: updatedWorkflowInstance.id,
				changesBefore: existingWorkflowInstance,
				changesAfter: updatedWorkflowInstance,
				description: `${config.AUDIT_LOG.WORKFLOWINSTANCE.DESCRIPTIONS.WORKFLOWINSTANCE_UPDATED}: ${updatedWorkflowInstance.name || updatedWorkflowInstance.code || updatedWorkflowInstance.id}`,
				organizationId,
			});

			try {
				await invalidateCache.byPattern(`cache:workflowEngine:byId:${id}:*`);
				await invalidateCache.byPattern("cache:workflowEngine:list:*");
			} catch (cacheError) {
				workflowInstanceLogger.warn(
					"Failed to invalidate cache after workflow instance update:",
					cacheError,
				);
			}

			res.status(200).json(
				buildSuccessResponse(
					config.SUCCESS.WORKFLOWINSTANCE.UPDATED,
					{ workflowInstance: updatedWorkflowInstance },
					200,
				),
			);
		} catch (error) {
			workflowInstanceLogger.error(
				`${config.ERROR.WORKFLOWINSTANCE.ERROR_UPDATING}: ${error}`,
			);
			res.status(500).json(
				buildErrorResponse(config.ERROR.COMMON.INTERNAL_SERVER_ERROR, 500),
			);
		}
	};

	const remove = async (req: AuthRequest, res: Response, _next: NextFunction) => {
		const organizationId = requireOrganizationId(req, res);
		if (!organizationId) return;

		const { id } = req.params;
		if (!id) {
			res.status(400).json(buildErrorResponse(config.ERROR.QUERY_PARAMS.MISSING_ID, 400));
			return;
		}

		try {
			const existingWorkflowInstance = await prisma.workflowInstance.findFirst({
				where: {
					id,
					organizationId,
					isDeleted: false,
				},
			});

			if (!existingWorkflowInstance) {
				res.status(404).json(
					buildErrorResponse(config.ERROR.WORKFLOWINSTANCE.NOT_FOUND, 404),
				);
				return;
			}

			const deletedWorkflowInstance = await prisma.workflowInstance.update({
				where: { id },
				data: {
					isDeleted: true,
				},
			});

			logActivity(req, {
				userId: req.userId || "unknown",
				action: config.ACTIVITY_LOG.WORKFLOWINSTANCE.ACTIONS.DELETE_WORKFLOWINSTANCE,
				description: `${config.ACTIVITY_LOG.WORKFLOWINSTANCE.DESCRIPTIONS.WORKFLOWINSTANCE_DELETED}: ${deletedWorkflowInstance.name || deletedWorkflowInstance.code || deletedWorkflowInstance.id}`,
				page: {
					url: req.originalUrl,
					title: config.ACTIVITY_LOG.WORKFLOWINSTANCE.PAGES.WORKFLOWINSTANCE_DELETION,
				},
			});

			logAudit(req, {
				userId: req.userId || "unknown",
				action: config.AUDIT_LOG.ACTIONS.DELETE,
				resource: config.AUDIT_LOG.RESOURCES.WORKFLOWINSTANCE,
				severity: config.AUDIT_LOG.SEVERITY.LOW,
				entityType: config.AUDIT_LOG.ENTITY_TYPES.WORKFLOWINSTANCE,
				entityId: deletedWorkflowInstance.id,
				changesBefore: existingWorkflowInstance,
				changesAfter: deletedWorkflowInstance,
				description: `${config.AUDIT_LOG.WORKFLOWINSTANCE.DESCRIPTIONS.WORKFLOWINSTANCE_DELETED}: ${deletedWorkflowInstance.name || deletedWorkflowInstance.code || deletedWorkflowInstance.id}`,
				organizationId,
			});

			try {
				await invalidateCache.byPattern(`cache:workflowEngine:byId:${id}:*`);
				await invalidateCache.byPattern("cache:workflowEngine:list:*");
			} catch (cacheError) {
				workflowInstanceLogger.warn(
					"Failed to invalidate cache after workflow instance deletion:",
					cacheError,
				);
			}

			res.status(200).json(
				buildSuccessResponse(
					config.SUCCESS.WORKFLOWINSTANCE.DELETED,
					{ id: deletedWorkflowInstance.id },
					200,
				),
			);
		} catch (error) {
			workflowInstanceLogger.error(
				`${config.ERROR.WORKFLOWINSTANCE.DELETE_FAILED}: ${error}`,
			);
			res.status(500).json(
				buildErrorResponse(config.ERROR.COMMON.INTERNAL_SERVER_ERROR, 500),
			);
		}
	};

	return { create, getAll, getById, update, remove };
};
