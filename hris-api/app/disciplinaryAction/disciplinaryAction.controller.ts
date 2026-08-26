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

const logger = getLogger();
const disciplinaryActionLogger = logger.child({ module: "disciplinaryAction" });

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

	return { create, getAll, getById, update, remove };
};
