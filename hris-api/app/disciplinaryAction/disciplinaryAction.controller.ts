import { Request, Response, NextFunction } from "express";
import { PrismaClient, Prisma } from "../../generated/prisma";
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
import { CreateDisciplinaryActionSchema, UpdateDisciplinaryActionSchema } from "../../zod/disciplinaryAction.zod";
import { logActivity } from "../../utils/activityLogger";
import { logAudit } from "../../utils/auditLogger";
import { config } from "../../config/constant";
import { redisClient } from "../../config/redis";
import { invalidateCache } from "../../middleware/cache";
import {
	buildAutoEvaluateProposals,
	buildAutoEvaluateProposalKey,
	DISCIPLINARY_AUTO_OFFENSE_TYPE,
	DISCIPLINARY_AUTO_RULE_VERSION,
	DISCIPLINARY_ESCALATION_LOOKBACK_DAYS,
} from "../../helper/disciplinary-escalation.helper";
import { notifyDisciplinaryStateChange } from "../../helper/disciplinary-notify.helper";

const logger = getLogger();
const disciplinaryActionLogger = logger.child({ module: "disciplinaryAction" });

const AUTO_EVALUATE_ROLES = ["super_admin", "admin", "hris-admin", "hris-hr-manager", "hris-hr-user"];

const toDayString = (value: unknown): string | null => {
	if (!value) return null;
	const parsed = new Date(String(value));
	if (Number.isNaN(parsed.getTime())) return null;
	return parsed.toISOString().slice(0, 10);
};

export const controller = (prisma: PrismaClient) => {
	const create = async (req: Request, res: Response, _next: NextFunction) => {
		let requestData = req.body;
		const contentType = req.get("Content-Type") || "";

		if (
			contentType.includes("application/x-www-form-urlencoded") ||
			contentType.includes("multipart/form-data")
		) {
			disciplinaryActionLogger.info("Original form data:", JSON.stringify(req.body, null, 2));
			requestData = transformFormDataToObject(req.body);
			disciplinaryActionLogger.info(
				"Transformed form data to object structure:",
				JSON.stringify(requestData, null, 2),
			);
		}

		const validation = CreateDisciplinaryActionSchema.safeParse(requestData);
		if (!validation.success) {
			const formattedErrors = formatZodErrors(validation.error.format());
			disciplinaryActionLogger.error(`Validation failed: ${JSON.stringify(formattedErrors)}`);
			const errorResponse = buildErrorResponse("Validation failed", 400, formattedErrors);
			res.status(400).json(errorResponse);
			return;
		}

		try {
			// Org scope + actor + denormalized employee name snapshot
			const employeeSnapshot = await prisma.employee.findFirst({
				where: {
					id: String(validation.data.employeeId || ""),
					organizationId: String((req as any).organizationId || ""),
					isDeleted: false,
				},
				select: {
					employeeId: true,
					person: { select: { personalInfo: true } },
				},
			});
			const employeeName = employeeSnapshot
				? `${employeeSnapshot.person?.personalInfo?.firstName || ""} ${
						employeeSnapshot.person?.personalInfo?.lastName || ""
					}`.trim() || employeeSnapshot.employeeId
				: String(validation.data.employeeId);

			const disciplinaryAction = await prisma.disciplinaryAction.create({
				data: {
					...validation.data,
					organizationId: String((req as any).organizationId || ""),
					createdByUserId: String((req as any).user?.id || "unknown"),
					employeeName,
				},
			});
			disciplinaryActionLogger.info(`DisciplinaryAction created successfully: ${disciplinaryAction.id}`);

			logActivity(req, {
				userId: (req as any).user?.id || "unknown",
				action: config.ACTIVITY_LOG.DISCIPLINARYACTION.ACTIONS.CREATE_DISCIPLINARYACTION,
				description: `${config.ACTIVITY_LOG.DISCIPLINARYACTION.DESCRIPTIONS.DISCIPLINARYACTION_CREATED}: ${disciplinaryAction.offenseType} / ${disciplinaryAction.employeeName || disciplinaryAction.id}`,
				page: {
					url: req.originalUrl,
					title: config.ACTIVITY_LOG.DISCIPLINARYACTION.PAGES.DISCIPLINARYACTION_CREATION,
				},
			});

			logAudit(req, {
				userId: (req as any).user?.id || "unknown",
				action: config.AUDIT_LOG.ACTIONS.CREATE,
				resource: config.AUDIT_LOG.RESOURCES.DISCIPLINARYACTION,
				severity: config.AUDIT_LOG.SEVERITY.LOW,
				entityType: config.AUDIT_LOG.ENTITY_TYPES.DISCIPLINARYACTION,
				entityId: disciplinaryAction.id,
				changesBefore: null,
				changesAfter: {
					id: disciplinaryAction.id,
					offenseType: disciplinaryAction.offenseType,
					employeeName: disciplinaryAction.employeeName,
					createdAt: disciplinaryAction.createdAt,
					updatedAt: disciplinaryAction.updatedAt,
				},
				description: `${config.AUDIT_LOG.DISCIPLINARYACTION.DESCRIPTIONS.DISCIPLINARYACTION_CREATED}: ${disciplinaryAction.offenseType} / ${disciplinaryAction.employeeName || disciplinaryAction.id}`,
			});

			try {
				await invalidateCache.byPattern("cache:disciplinaryAction:list:*");
				disciplinaryActionLogger.info("DisciplinaryAction list cache invalidated after creation");
			} catch (cacheError) {
				disciplinaryActionLogger.warn(
					"Failed to invalidate cache after disciplinaryAction creation:",
					cacheError,
				);
			}

			const successResponse = buildSuccessResponse(
				config.SUCCESS.DISCIPLINARYACTION.CREATED,
				disciplinaryAction,
				201,
			);
			res.status(201).json(successResponse);
		} catch (error) {
			disciplinaryActionLogger.error(`${config.ERROR.DISCIPLINARYACTION.CREATE_FAILED}: ${error}`);
			const errorResponse = buildErrorResponse(
				config.ERROR.COMMON.INTERNAL_SERVER_ERROR,
				500,
			);
			res.status(500).json(errorResponse);
		}
	};
	const getAll = async (req: Request, res: Response, _next: NextFunction) => {
		const validationResult = validateQueryParams(req, disciplinaryActionLogger);

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
		} = validationResult.validatedParams!;

		disciplinaryActionLogger.info(
			`Getting disciplinaryActions, page: ${page}, limit: ${limit}, query: ${query}, order: ${order}, groupBy: ${groupBy}`,
		);

		try {
			// Base where clause
			const whereClause: Prisma.DisciplinaryActionWhereInput = {
				isDeleted: false,
				organizationId: String((req as any).organizationId || ""),
			};

			// search fields present on the model
			const searchFields = ["description", "offenseType", "employeeName"];
			if (query) {
				const searchConditions = buildSearchConditions("DisciplinaryAction", query, searchFields);
				if (searchConditions.length > 0) {
					whereClause.OR = searchConditions;
				}
			}

			if (filter) {
				const filterConditions = buildFilterConditions("DisciplinaryAction", filter);
				if (filterConditions.length > 0) {
					whereClause.AND = filterConditions;
				}
			}
			const findManyQuery = buildFindManyQuery(whereClause, skip, limit, order, sort, fields);

			const [disciplinaryActions, total] = await Promise.all([
				document ? prisma.disciplinaryAction.findMany(findManyQuery) : [],
				count ? prisma.disciplinaryAction.count({ where: whereClause }) : 0,
			]);

			disciplinaryActionLogger.info(`Retrieved ${disciplinaryActions.length} disciplinaryActions`);

			logActivity(req, {
				userId: (req as any).user?.id || "unknown",
				action: config.ACTIVITY_LOG.DISCIPLINARYACTION.ACTIONS.GET_ALL_DISCIPLINARYACTION,
				description: config.ACTIVITY_LOG.DISCIPLINARYACTION.DESCRIPTIONS.DISCIPLINARYACTIONS_RETRIEVED,
				page: {
					url: req.originalUrl,
					title: config.ACTIVITY_LOG.DISCIPLINARYACTION.PAGES.DISCIPLINARYACTION_LIST,
				},
			});

			const processedData =
				groupBy && document ? groupDataByField(disciplinaryActions, groupBy as string) : disciplinaryActions;

			const responseData: Record<string, any> = {
				...(document && { disciplinaryActions: processedData }),
				...(count && { count: total }),
				...(pagination && { pagination: buildPagination(total, page, limit) }),
				...(groupBy && { groupedBy: groupBy }),
			};

			res.status(200).json(
				buildSuccessResponse(config.SUCCESS.DISCIPLINARYACTION.RETRIEVED_ALL, responseData, 200),
			);
		} catch (error) {
			disciplinaryActionLogger.error(`${config.ERROR.DISCIPLINARYACTION.GET_ALL_FAILED}: ${error}`);
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
				disciplinaryActionLogger.error(config.ERROR.QUERY_PARAMS.MISSING_ID);
				const errorResponse = buildErrorResponse(config.ERROR.QUERY_PARAMS.MISSING_ID, 400);
				res.status(400).json(errorResponse);
				return;
			}

			if (fields && typeof fields !== "string") {
				disciplinaryActionLogger.error(`${config.ERROR.QUERY_PARAMS.INVALID_POPULATE}: ${fields}`);
				const errorResponse = buildErrorResponse(
					config.ERROR.QUERY_PARAMS.POPULATE_MUST_BE_STRING,
					400,
				);
				res.status(400).json(errorResponse);
				return;
			}

			disciplinaryActionLogger.info(`${config.SUCCESS.DISCIPLINARYACTION.GETTING_BY_ID}: ${id}`);

			const cacheKey = `cache:disciplinaryAction:byId:${id}:${fields || "full"}`;
			let disciplinaryAction = null;

			try {
				if (redisClient.isClientConnected()) {
					disciplinaryAction = await redisClient.getJSON(cacheKey);
					if (disciplinaryAction) {
						disciplinaryActionLogger.info(`DisciplinaryAction ${id} retrieved from direct Redis cache`);
					}
				}
			} catch (cacheError) {
				disciplinaryActionLogger.warn(`Redis cache retrieval failed for disciplinaryAction ${id}:`, cacheError);
			}

			if (!disciplinaryAction) {
				const query: Prisma.DisciplinaryActionFindFirstArgs = {
					where: { id },
				};

				query.select = getNestedFields(fields);

				disciplinaryAction = await prisma.disciplinaryAction.findFirst(query);

				if (disciplinaryAction && redisClient.isClientConnected()) {
					try {
						await redisClient.setJSON(cacheKey, disciplinaryAction, 3600);
						disciplinaryActionLogger.info(`DisciplinaryAction ${id} stored in direct Redis cache`);
					} catch (cacheError) {
						disciplinaryActionLogger.warn(
							`Failed to store disciplinaryAction ${id} in Redis cache:`,
							cacheError,
						);
					}
				}
			}

			if (!disciplinaryAction) {
				disciplinaryActionLogger.error(`${config.ERROR.DISCIPLINARYACTION.NOT_FOUND}: ${id}`);
				const errorResponse = buildErrorResponse(config.ERROR.DISCIPLINARYACTION.NOT_FOUND, 404);
				res.status(404).json(errorResponse);
				return;
			}

			disciplinaryActionLogger.info(`${config.SUCCESS.DISCIPLINARYACTION.RETRIEVED}: ${(disciplinaryAction as any).id}`);

			logActivity(req, {
				userId: (req as any).user?.id || "unknown",
				action: config.ACTIVITY_LOG.DISCIPLINARYACTION.ACTIONS.GET_DISCIPLINARYACTION,
				description: `${config.ACTIVITY_LOG.DISCIPLINARYACTION.DESCRIPTIONS.DISCIPLINARYACTION_RETRIEVED}: ${(disciplinaryAction as any).id}`,
				page: {
					url: req.originalUrl,
					title: config.ACTIVITY_LOG.DISCIPLINARYACTION.PAGES.DISCIPLINARYACTION_DETAILS,
				},
			});

			const successResponse = buildSuccessResponse(
				config.SUCCESS.DISCIPLINARYACTION.RETRIEVED,
				disciplinaryAction,
				200,
			);
			res.status(200).json(successResponse);
		} catch (error) {
			disciplinaryActionLogger.error(`${config.ERROR.DISCIPLINARYACTION.ERROR_GETTING}: ${error}`);
			const errorResponse = buildErrorResponse(
				config.ERROR.COMMON.INTERNAL_SERVER_ERROR,
				500,
			);
			res.status(500).json(errorResponse);
		}
	};

	const update = async (req: Request, res: Response, _next: NextFunction) => {
		const { id } = req.params;

		try {
			if (!id) {
				disciplinaryActionLogger.error(config.ERROR.QUERY_PARAMS.MISSING_ID);
				const errorResponse = buildErrorResponse(config.ERROR.QUERY_PARAMS.MISSING_ID, 400);
				res.status(400).json(errorResponse);
				return;
			}

			const validationResult = UpdateDisciplinaryActionSchema.safeParse(req.body);

			if (!validationResult.success) {
				const formattedErrors = formatZodErrors(validationResult.error.format());
				disciplinaryActionLogger.error(`Validation failed: ${JSON.stringify(formattedErrors)}`);
				const errorResponse = buildErrorResponse("Validation failed", 400, formattedErrors);
				res.status(400).json(errorResponse);
				return;
			}

			if (Object.keys(req.body).length === 0) {
				disciplinaryActionLogger.error(config.ERROR.COMMON.NO_UPDATE_FIELDS);
				const errorResponse = buildErrorResponse(config.ERROR.COMMON.NO_UPDATE_FIELDS, 400);
				res.status(400).json(errorResponse);
				return;
			}

			const validatedData = validationResult.data;

			disciplinaryActionLogger.info(`Updating disciplinaryAction: ${id}`);

			const existingDisciplinaryAction = await prisma.disciplinaryAction.findFirst({
				where: {
					id,
					organizationId: String((req as any).organizationId || ""),
					isDeleted: false,
				},
			});

			if (!existingDisciplinaryAction) {
				disciplinaryActionLogger.error(`${config.ERROR.DISCIPLINARYACTION.NOT_FOUND}: ${id}`);
				const errorResponse = buildErrorResponse(config.ERROR.DISCIPLINARYACTION.NOT_FOUND, 404);
				res.status(404).json(errorResponse);
				return;
			}

			const prismaData = {
				...validatedData,
				updatedByUserId: String((req as any).user?.id || "unknown"),
			};

			const updatedDisciplinaryAction = await prisma.disciplinaryAction.update({
				where: { id },
				data: prismaData,
			});

			// Operator rule 2026-09-03: on DRAFT -> OPEN (case becomes official) and
			// on RESOLVED, notify the employee + their manager with the rule-book
			// consequence plan for the case severity as the next step.
			if (
				String(existingDisciplinaryAction.status) !== String(updatedDisciplinaryAction.status)
			) {
				let ruleConsequencePlan: unknown = null;
				try {
					const matchedRule = await prisma.rule.findFirst({
						where: {
							organizationId: String((req as any).organizationId || ""),
							isDeleted: false,
							code: { equals: String(updatedDisciplinaryAction.offenseType || ""), mode: "insensitive" },
						},
						select: { consequencePlan: true },
					});
					ruleConsequencePlan = matchedRule?.consequencePlan ?? null;
				} catch (ruleError) {
					disciplinaryActionLogger.warn("Failed to load rule consequence plan:", ruleError);
				}
				await notifyDisciplinaryStateChange({
					prisma,
					io: (req as any).io ?? null,
					organizationId: String((req as any).organizationId || ""),
					disciplinaryActionId: updatedDisciplinaryAction.id,
					employeeId: updatedDisciplinaryAction.employeeId,
					employeeName: updatedDisciplinaryAction.employeeName,
					offenseType: String(updatedDisciplinaryAction.offenseType || "OFFENSE"),
					severity: updatedDisciplinaryAction.severity,
					status: String(updatedDisciplinaryAction.status),
					consequencePlan: ruleConsequencePlan as any,
					changedByLabel: (req as any).user?.userName || (req as any).user?.email || null,
				});
			}

			try {
				await invalidateCache.byPattern(`cache:disciplinaryAction:byId:${id}:*`);
				await invalidateCache.byPattern("cache:disciplinaryAction:list:*");
				disciplinaryActionLogger.info(`Cache invalidated after disciplinaryAction ${id} update`);
			} catch (cacheError) {
				disciplinaryActionLogger.warn(
					"Failed to invalidate cache after disciplinaryAction update:",
					cacheError,
				);
			}

			disciplinaryActionLogger.info(`${config.SUCCESS.DISCIPLINARYACTION.UPDATED}: ${updatedDisciplinaryAction.id}`);

			logActivity(req, {
				userId: (req as any).user?.id || "unknown",
				action: config.ACTIVITY_LOG.DISCIPLINARYACTION.ACTIONS.UPDATE_DISCIPLINARYACTION,
				description: `${config.ACTIVITY_LOG.DISCIPLINARYACTION.DESCRIPTIONS.DISCIPLINARYACTION_UPDATED}: ${updatedDisciplinaryAction.id}`,
				page: {
					url: req.originalUrl,
					title: config.ACTIVITY_LOG.DISCIPLINARYACTION.PAGES.DISCIPLINARYACTION_UPDATE,
				},
			});

			logAudit(req, {
				userId: (req as any).user?.id || "unknown",
				action: config.AUDIT_LOG.ACTIONS.UPDATE,
				resource: config.AUDIT_LOG.RESOURCES.DISCIPLINARYACTION,
				severity: config.AUDIT_LOG.SEVERITY.LOW,
				entityType: config.AUDIT_LOG.ENTITY_TYPES.DISCIPLINARYACTION,
				entityId: updatedDisciplinaryAction.id,
				changesBefore: existingDisciplinaryAction,
				changesAfter: updatedDisciplinaryAction,
				description: `${config.AUDIT_LOG.DISCIPLINARYACTION.DESCRIPTIONS.DISCIPLINARYACTION_UPDATED}: ${updatedDisciplinaryAction.offenseType || updatedDisciplinaryAction.id}`,
			});

			const successResponse = buildSuccessResponse(
				config.SUCCESS.DISCIPLINARYACTION.UPDATED,
				{ disciplinaryAction: updatedDisciplinaryAction },
				200,
			);
			res.status(200).json(successResponse);
		} catch (error) {
			disciplinaryActionLogger.error(`${config.ERROR.DISCIPLINARYACTION.ERROR_UPDATING}: ${error}`);
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
				disciplinaryActionLogger.error(config.ERROR.QUERY_PARAMS.MISSING_ID);
				const errorResponse = buildErrorResponse(config.ERROR.QUERY_PARAMS.MISSING_ID, 400);
				res.status(400).json(errorResponse);
				return;
			}

			disciplinaryActionLogger.info(`${config.SUCCESS.DISCIPLINARYACTION.DELETED}: ${id}`);

			const existingDisciplinaryAction = await prisma.disciplinaryAction.findFirst({
				where: {
					id,
					organizationId: String((req as any).organizationId || ""),
					isDeleted: false,
				},
			});

			if (!existingDisciplinaryAction) {
				disciplinaryActionLogger.error(`${config.ERROR.DISCIPLINARYACTION.NOT_FOUND}: ${id}`);
				const errorResponse = buildErrorResponse(config.ERROR.DISCIPLINARYACTION.NOT_FOUND, 404);
				res.status(404).json(errorResponse);
				return;
			}

			// Soft delete (canon: disciplinary records are retained, never hard-deleted)
			await prisma.disciplinaryAction.update({
				where: { id },
				data: { isDeleted: true, updatedByUserId: String((req as any).user?.id || "unknown") },
			});

			try {
				await invalidateCache.byPattern(`cache:disciplinaryAction:byId:${id}:*`);
				await invalidateCache.byPattern("cache:disciplinaryAction:list:*");
				disciplinaryActionLogger.info(`Cache invalidated after disciplinaryAction ${id} deletion`);
			} catch (cacheError) {
				disciplinaryActionLogger.warn(
					"Failed to invalidate cache after disciplinaryAction deletion:",
					cacheError,
				);
			}

			disciplinaryActionLogger.info(`${config.SUCCESS.DISCIPLINARYACTION.DELETED}: ${id}`);

			logActivity(req, {
				userId: (req as any).user?.id || "unknown",
				action: config.ACTIVITY_LOG.DISCIPLINARYACTION.ACTIONS.DELETE_DISCIPLINARYACTION,
				description: `${config.ACTIVITY_LOG.DISCIPLINARYACTION.DESCRIPTIONS.DISCIPLINARYACTION_DELETED}: ${id}`,
				page: {
					url: req.originalUrl,
					title: config.ACTIVITY_LOG.DISCIPLINARYACTION.PAGES.DISCIPLINARYACTION_DELETION,
				},
			});

			logAudit(req, {
				userId: (req as any).user?.id || "unknown",
				action: config.AUDIT_LOG.ACTIONS.DELETE,
				resource: config.AUDIT_LOG.RESOURCES.DISCIPLINARYACTION,
				severity: config.AUDIT_LOG.SEVERITY.LOW,
				entityType: config.AUDIT_LOG.ENTITY_TYPES.DISCIPLINARYACTION,
				entityId: id,
				changesBefore: existingDisciplinaryAction,
				changesAfter: null,
				description: `${config.AUDIT_LOG.DISCIPLINARYACTION.DESCRIPTIONS.DISCIPLINARYACTION_DELETED}: ${existingDisciplinaryAction.offenseType || id}`,
			});

			const successResponse = buildSuccessResponse(config.SUCCESS.DISCIPLINARYACTION.DELETED, {}, 200);
			res.status(200).json(successResponse);
		} catch (error) {
			disciplinaryActionLogger.error(`${config.ERROR.DISCIPLINARYACTION.DELETE_FAILED}: ${error}`);
			const errorResponse = buildErrorResponse(
				config.ERROR.COMMON.INTERNAL_SERVER_ERROR,
				500,
			);
			res.status(500).json(errorResponse);
		}
	};

	/**
	 * Attendance-driven auto-escalation (operator-accepted 2026-09-02).
	 * Scans evidenced absent days (ABSENT effective timesheet lines +
	 * ABSENT_AWOL_EVIDENCED AWOL-ledger rows) in the requested window, clusters
	 * them into occurrences, and proposes/files DRAFT disciplinary actions.
	 * REVIEW_NO_EVIDENCE days are never converted into charges. execute=false
	 * (default) is a read-only preview.
	 */
	const autoEvaluate = async (req: Request, res: Response, _next: NextFunction) => {
		try {
			const organizationId = String((req as any).organizationId || "");
			if (!organizationId) {
				res.status(401).json(buildErrorResponse("Organization context missing", 401));
				return;
			}
			if (!AUTO_EVALUATE_ROLES.includes(String((req as any).role || ""))) {
				res.status(403).json(buildErrorResponse("You are not authorized to run disciplinary auto-evaluation", 403));
				return;
			}

			const body = (req.body || {}) as Record<string, unknown>;
			const execute = body.execute === true;
			const dateFrom = toDayString(body.dateFrom);
			const dateTo = toDayString(body.dateTo);
			if (!dateFrom || !dateTo || dateFrom > dateTo) {
				res.status(400).json(buildErrorResponse("body.dateFrom and body.dateTo (YYYY-MM-DD, from <= to) are required", 400));
				return;
			}

			const lookbackDays = Math.min(
				Math.max(Number(body.lookbackDays) || DISCIPLINARY_ESCALATION_LOOKBACK_DAYS, 1),
				3650,
			);
			const lookbackStart = new Date(`${dateFrom}T00:00:00Z`);
			lookbackStart.setUTCDate(lookbackStart.getUTCDate() - lookbackDays);
			const lookbackStartDay = lookbackStart.toISOString().slice(0, 10);

			// Evidence source 1: effective ABSENT timesheet lines in the window.
			const absentLines = await prisma.timesheetline.findMany({
				where: {
					organizationId,
					isDeleted: false,
					isEffective: true,
					status: "ABSENT",
					date: { gte: new Date(`${dateFrom}T00:00:00Z`), lte: new Date(`${dateTo}T23:59:59.999Z`) },
				},
				select: {
					employeeId: true,
					date: true,
					employee: { select: { employeeId: true, isDeleted: false } },
				},
			});

			// Evidence source 2: AWOL-ledger labeled days come through the day-status
			// ABSENT_AWOL_EVIDENCED class. That pipeline loads AWOL EmployeeBenefit
			// notes per payroll period; this engine accepts explicit rows instead so
			// the caller (UI) can pass the refined day-status review result.
			const awolRowsRaw = Array.isArray(body.evidencedAbsentDays) ? body.evidencedAbsentDays : [];
			type AwolRow = { code?: unknown; employeeId?: unknown; date?: unknown };
			const awolRows = (awolRowsRaw as AwolRow[])
				.map((row) => ({
					code: String(row.code ?? row.employeeId ?? "").trim(),
					date: toDayString(row.date),
				}))
				.filter((row): row is { code: string; date: string } =>
					Boolean(row.code && row.date && row.date >= dateFrom && row.date <= dateTo),
				);

			// Resolve employee identity by padded employeeId code (same pad rule as
			// day-status review: 5-digit display code).
			const employees = await prisma.employee.findMany({
				where: { organizationId, isDeleted: false },
				select: {
					id: true,
					employeeId: true,
					person: { select: { personalInfo: true } },
				},
			});
			const employeeIdByCode = new Map<string, { id: string; name: string }>();
			const codeByEmployeeId = new Map<string, string>();
			for (const e of employees) {
				const code = String(e.employeeId || "").trim().padStart(5, "0");
				if (!code) continue;
				const info = (e.person && e.person.personalInfo) || {};
				employeeIdByCode.set(code, {
					id: e.id,
					name: [info.firstName, info.lastName].filter(Boolean).join(" ").trim() || code,
				});
				codeByEmployeeId.set(e.id, code);
			}

			// Map ABSENT lines onto padded codes.
			const evidencedRows: Array<{ code: string; date: string; source: string }> = [];
			for (const line of absentLines) {
				const code = codeByEmployeeId.get(line.employeeId);
				if (!code) continue;
				evidencedRows.push({
					code,
					date: new Date(line.date).toISOString().slice(0, 10),
					source: "TIMESHEET_ABSENT_LINE",
				});
			}
			for (const row of awolRows) {
				evidencedRows.push({ code: row.code, date: row.date, source: "AWOL_LEDGER" });
			}

			// Prior attempts: non-dismissed ABSENTEEISM DAs in the lookback window.
			const priorCases = await prisma.disciplinaryAction.findMany({
				where: {
					organizationId,
					isDeleted: false,
					status: { not: "DISMISSED" },
					offenseType: { equals: DISCIPLINARY_AUTO_OFFENSE_TYPE, mode: "insensitive" },
					offenseDate: { gte: new Date(`${lookbackStartDay}T00:00:00Z`), lt: new Date(`${dateFrom}T00:00:00Z`) },
				},
				select: { employeeId: true },
			});
			const priorAttemptsByCode = new Map<string, number>();
			for (const c of priorCases) {
				const code = codeByEmployeeId.get(c.employeeId);
				if (!code) continue;
				priorAttemptsByCode.set(code, (priorAttemptsByCode.get(code) || 0) + 1);
			}

			const proposals = buildAutoEvaluateProposals({
				evidencedAbsentRows: evidencedRows.map((r) => ({ code: r.code, date: r.date })),
				employeeIdByCode,
				priorAttemptsByCode,
			});

			// Dedup: skip occurrences already covered by an existing auto-filed or
			// manual case (metadata.autoRule.dedupKey or same employee+window manual).
			const existingAuto = await prisma.disciplinaryAction.findMany({
				where: {
					organizationId,
					isDeleted: false,
					offenseType: { equals: DISCIPLINARY_AUTO_OFFENSE_TYPE, mode: "insensitive" },
					offenseDate: { gte: new Date(`${dateFrom}T00:00:00Z`), lte: new Date(`${dateTo}T23:59:59.999Z`) },
				},
				select: { id: true, employeeId: true, offenseDate: true, metadata: true },
			});
			const existingKeys = new Set<string>();
			for (const c of existingAuto) {
				const meta = c.metadata as Record<string, unknown> | null;
				const autoRule = meta && typeof meta === "object" ? (meta.autoRule as Record<string, unknown> | null) : null;
				if (autoRule && typeof autoRule.dedupKey === "string") {
					existingKeys.add(autoRule.dedupKey);
				} else {
					const code = codeByEmployeeId.get(c.employeeId);
					if (code) existingKeys.add(`${code}|${new Date(c.offenseDate).toISOString().slice(0, 10)}`);
				}
			}

			const skippedDuplicates: string[] = [];
			const actionable = proposals.filter((p) => {
				if (existingKeys.has(p.dedupKey)) {
					skippedDuplicates.push(p.dedupKey);
					return false;
				}
				// manual-case overlap: any existing case for the employee on the occurrence start day
				const manualKey = `${p.employeeCode}|${p.offenseDate}`;
				if (existingKeys.has(manualKey)) {
					skippedDuplicates.push(manualKey);
					return false;
				}
				return true;
			});

			if (!execute) {
				res.status(200).json(buildSuccessResponse(
					"Disciplinary auto-evaluation preview (dry-run, no records written)",
					{
						execute: false,
						window: { start: dateFrom, end: dateTo },
						lookbackDays,
						scope: {
							absentTimesheetLines: absentLines.length,
							awolLedgerRows: awolRows.length,
							priorCasesInLookback: priorCases.length,
						},
						proposals: actionable,
						proposalCount: actionable.length,
						skippedDuplicates,
						ruleVersion: DISCIPLINARY_AUTO_RULE_VERSION,
					},
					200,
				));
				return;
			}

			const created = [] as Array<Record<string, unknown>>;
			for (const p of actionable) {
				const row = await prisma.disciplinaryAction.create({
					data: {
						organizationId,
						employeeId: p.employeeId,
						employeeName: p.employeeName,
						offenseType: p.offenseType,
						offenseDate: new Date(`${p.offenseDate}T00:00:00Z`),
						description: p.description,
						severity: p.severity,
						status: "DRAFT",
						createdByUserId: String((req as any).user?.id || "auto-escalation-engine"),
						metadata: {
							autoRule: {
								version: DISCIPLINARY_AUTO_RULE_VERSION,
								dedupKey: p.dedupKey,
								source: "attendance-auto-escalation",
								evaluatedAt: new Date().toISOString(),
								window: { start: dateFrom, end: dateTo },
								occurrenceWindow: p.occurrenceWindow,
								absentDays: p.absentDays,
								baseSeverity: p.baseSeverity,
								priorAttempts: p.priorAttempts,
								evidenceClasses: p.evidenceClasses,
							},
						},
					},
				});
				created.push({ id: row.id, employeeCode: p.employeeCode, severity: p.severity, status: row.status });
			}

			disciplinaryActionLogger.info(`Disciplinary auto-evaluate created ${created.length} DRAFT case(s) for window ${dateFrom}..${dateTo}`);
			logActivity(req, {
				userId: (req as any).user?.id || "unknown",
				action: "DISCIPLINARYAUTO_AUTO_EVALUATE",
				description: `Disciplinary auto-evaluation filed ${created.length} DRAFT case(s) (${dateFrom}..${dateTo})`,
				page: { url: req.originalUrl, title: "Disciplinary Action Auto-Evaluation" },
			});
			logAudit(req, {
				userId: (req as any).user?.id || "unknown",
				action: config.AUDIT_LOG.ACTIONS.CREATE,
				resource: config.AUDIT_LOG.RESOURCES.DISCIPLINARYACTION,
				severity: config.AUDIT_LOG.SEVERITY.MEDIUM,
				entityType: config.AUDIT_LOG.ENTITY_TYPES.DISCIPLINARYACTION,
				entityId: "auto-evaluate",
				changesBefore: null,
				changesAfter: { window: { start: dateFrom, end: dateTo }, created: created.length, ruleVersion: DISCIPLINARY_AUTO_RULE_VERSION },
				description: `Disciplinary auto-evaluation filed ${created.length} DRAFT case(s)`,
			});

			try {
				await invalidateCache.byPattern("cache:disciplinaryAction:list:*");
			} catch (cacheError) {
				disciplinaryActionLogger.warn("Failed to invalidate cache after auto-evaluate:", cacheError);
			}

			res.status(200).json(buildSuccessResponse(
				`Disciplinary auto-evaluation filed ${created.length} DRAFT case(s)`,
				{
					execute: true,
					window: { start: dateFrom, end: dateTo },
					created,
					createdCount: created.length,
					skippedDuplicates,
					ruleVersion: DISCIPLINARY_AUTO_RULE_VERSION,
				},
				200,
			));
		} catch (error) {
			disciplinaryActionLogger.error(`Disciplinary auto-evaluate failed: ${error}`);
			res.status(500).json(buildErrorResponse("Failed disciplinary auto-evaluation", 500));
		}
	};

	return { create, getAll, getById, update, remove, autoEvaluate };
};
