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
import {
	CreateBoardingTemplateSchema,
	UpdateBoardingTemplateSchema,
} from "../../zod/boardingTemplate.zod";
import { logActivity } from "../../utils/activityLogger";
import { logAudit } from "../../utils/auditLogger";
import { config } from "../../config/constant";
import { redisClient } from "../../config/redis";
import { invalidateCache } from "../../middleware/cache";

const logger = getLogger();
const boardingTemplateLogger = logger.child({ module: "boardingTemplate" });

export const controller = (prisma: PrismaClient) => {
	const create = async (req: Request, res: Response, _next: NextFunction) => {
		let requestData = req.body;
		const contentType = req.get("Content-Type") || "";

		if (
			contentType.includes("application/x-www-form-urlencoded") ||
			contentType.includes("multipart/form-data")
		) {
			boardingTemplateLogger.info("Original form data:", JSON.stringify(req.body, null, 2));
			requestData = transformFormDataToObject(req.body);
			boardingTemplateLogger.info(
				"Transformed form data to object structure:",
				JSON.stringify(requestData, null, 2),
			);
		}

		const validation = CreateBoardingTemplateSchema.safeParse(requestData);
		if (!validation.success) {
			const formattedErrors = formatZodErrors(validation.error.format());
			boardingTemplateLogger.error(`Validation failed: ${JSON.stringify(formattedErrors)}`);
			const errorResponse = buildErrorResponse("Validation failed", 400, formattedErrors);
			res.status(400).json(errorResponse);
			return;
		}

		try {
			// Check if a template with the same name already exists to prevent exact duplicates (optional validation requested by user)
			const existing = await prisma.boardingTemplate.findFirst({
				where: {
					name: validation.data.name,
					organizationId: validation.data.organizationId,
					isDeleted: false,
				},
			});

			if (existing) {
				const errorResponse = buildErrorResponse(
					"A boarding template with this name already exists",
					409,
				);
				res.status(409).json(errorResponse);
				return;
			}

			const boardingTemplate = await prisma.boardingTemplate.create({
				data: {
					...validation.data,
					// Explicitly cast role if needed, though Zod validation should cover type
				},
			});
			boardingTemplateLogger.info(
				`BoardingTemplate created successfully: ${boardingTemplate.id}`,
			);

			logActivity(req, {
				userId: (req as any).user?.id || "unknown",
				action: config.ACTIVITY_LOG.BOARDINGTEMPLATE.ACTIONS.CREATE_BOARDINGTEMPLATE,
				description: `${config.ACTIVITY_LOG.BOARDINGTEMPLATE.DESCRIPTIONS.BOARDINGTEMPLATE_CREATED}: ${boardingTemplate.name || boardingTemplate.id}`,
				page: {
					url: req.originalUrl,
					title: config.ACTIVITY_LOG.BOARDINGTEMPLATE.PAGES.BOARDINGTEMPLATE_CREATION,
				},
			});

			logAudit(req, {
				userId: (req as any).user?.id || "unknown",
				action: config.AUDIT_LOG.ACTIONS.CREATE,
				resource: config.AUDIT_LOG.RESOURCES.BOARDINGTEMPLATE,
				severity: config.AUDIT_LOG.SEVERITY.LOW,
				entityType: config.AUDIT_LOG.ENTITY_TYPES.BOARDINGTEMPLATE,
				entityId: boardingTemplate.id,
				changesBefore: null,
				changesAfter: {
					id: boardingTemplate.id,
					name: boardingTemplate.name,
					description: boardingTemplate.description,
					createdAt: boardingTemplate.createdAt,
					updatedAt: boardingTemplate.updatedAt,
				},
				description: `${config.AUDIT_LOG.BOARDINGTEMPLATE.DESCRIPTIONS.BOARDINGTEMPLATE_CREATED}: ${boardingTemplate.name || boardingTemplate.id}`,
			});

			try {
				await invalidateCache.byPattern("cache:boardingTemplate:list:*");
				boardingTemplateLogger.info(
					"BoardingTemplate list cache invalidated after creation",
				);
			} catch (cacheError) {
				boardingTemplateLogger.warn(
					"Failed to invalidate cache after boardingTemplate creation:",
					cacheError,
				);
			}

			const successResponse = buildSuccessResponse(
				config.SUCCESS.BOARDINGTEMPLATE.CREATED,
				boardingTemplate,
				201,
			);
			res.status(201).json(successResponse);
		} catch (error) {
			boardingTemplateLogger.error(
				`${config.ERROR.BOARDINGTEMPLATE.CREATE_FAILED}: ${error}`,
			);
			const errorResponse = buildErrorResponse(
				config.ERROR.COMMON.INTERNAL_SERVER_ERROR,
				500,
			);
			res.status(500).json(errorResponse);
		}
	};
	const getAll = async (req: Request, res: Response, _next: NextFunction) => {
		const validationResult = validateQueryParams(req, boardingTemplateLogger);

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

		boardingTemplateLogger.info(
			`Getting boardingTemplates, page: ${page}, limit: ${limit}, query: ${query}, order: ${order}, groupBy: ${groupBy}`,
		);

		try {
			// Base where clause
			const whereClause: Prisma.BoardingTemplateWhereInput = {
				isDeleted: false,
			};

			// search fields sample ("name", "description", "type")
			const searchFields = ["name", "description", "type", "role"];
			if (query) {
				const searchConditions = buildSearchConditions(
					"BoardingTemplate",
					query,
					searchFields,
				);
				if (searchConditions.length > 0) {
					whereClause.OR = searchConditions;
				}
			}

			if (filter) {
				const filterConditions = buildFilterConditions("BoardingTemplate", filter);
				if (filterConditions.length > 0) {
					whereClause.AND = filterConditions;
				}
			}
			const findManyQuery = buildFindManyQuery(whereClause, skip, limit, order, sort, fields);

			const [boardingTemplates, total] = await Promise.all([
				document ? prisma.boardingTemplate.findMany(findManyQuery) : [],
				count ? prisma.boardingTemplate.count({ where: whereClause }) : 0,
			]);

			boardingTemplateLogger.info(`Retrieved ${boardingTemplates.length} boardingTemplates`);
			const processedData =
				groupBy && document
					? groupDataByField(boardingTemplates, groupBy as string)
					: boardingTemplates;

			const responseData: Record<string, any> = {
				...(document && { boardingTemplates: processedData }),
				...(count && { count: total }),
				...(pagination && { pagination: buildPagination(total, page, limit) }),
				...(groupBy && { groupedBy: groupBy }),
			};

			res.status(200).json(
				buildSuccessResponse(
					config.SUCCESS.BOARDINGTEMPLATE.RETRIEVED_ALL,
					responseData,
					200,
				),
			);
		} catch (error) {
			boardingTemplateLogger.error(
				`${config.ERROR.BOARDINGTEMPLATE.GET_ALL_FAILED}: ${error}`,
			);
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
				boardingTemplateLogger.error(config.ERROR.QUERY_PARAMS.MISSING_ID);
				const errorResponse = buildErrorResponse(config.ERROR.QUERY_PARAMS.MISSING_ID, 400);
				res.status(400).json(errorResponse);
				return;
			}

			if (fields && typeof fields !== "string") {
				boardingTemplateLogger.error(
					`${config.ERROR.QUERY_PARAMS.INVALID_POPULATE}: ${fields}`,
				);
				const errorResponse = buildErrorResponse(
					config.ERROR.QUERY_PARAMS.POPULATE_MUST_BE_STRING,
					400,
				);
				res.status(400).json(errorResponse);
				return;
			}

			boardingTemplateLogger.info(`${config.SUCCESS.BOARDINGTEMPLATE.GETTING_BY_ID}: ${id}`);

			const cacheKey = `cache:boardingTemplate:byId:${id}:${fields || "full"}`;
			let boardingTemplate = null;

			try {
				if (redisClient.isClientConnected()) {
					boardingTemplate = await redisClient.getJSON(cacheKey);
					if (boardingTemplate) {
						boardingTemplateLogger.info(
							`BoardingTemplate ${id} retrieved from direct Redis cache`,
						);
					}
				}
			} catch (cacheError) {
				boardingTemplateLogger.warn(
					`Redis cache retrieval failed for boardingTemplate ${id}:`,
					cacheError,
				);
			}

			if (!boardingTemplate) {
				const query: Prisma.BoardingTemplateFindFirstArgs = {
					where: { id },
				};

				query.select = getNestedFields(fields);

				boardingTemplate = await prisma.boardingTemplate.findFirst(query);

				if (boardingTemplate && redisClient.isClientConnected()) {
					try {
						await redisClient.setJSON(cacheKey, boardingTemplate, 3600);
						boardingTemplateLogger.info(
							`BoardingTemplate ${id} stored in direct Redis cache`,
						);
					} catch (cacheError) {
						boardingTemplateLogger.warn(
							`Failed to store boardingTemplate ${id} in Redis cache:`,
							cacheError,
						);
					}
				}
			}

			if (!boardingTemplate) {
				boardingTemplateLogger.error(`${config.ERROR.BOARDINGTEMPLATE.NOT_FOUND}: ${id}`);
				const errorResponse = buildErrorResponse(
					config.ERROR.BOARDINGTEMPLATE.NOT_FOUND,
					404,
				);
				res.status(404).json(errorResponse);
				return;
			}

			boardingTemplateLogger.info(
				`${config.SUCCESS.BOARDINGTEMPLATE.RETRIEVED}: ${(boardingTemplate as any).id}`,
			);
			const successResponse = buildSuccessResponse(
				config.SUCCESS.BOARDINGTEMPLATE.RETRIEVED,
				boardingTemplate,
				200,
			);
			res.status(200).json(successResponse);
		} catch (error) {
			boardingTemplateLogger.error(
				`${config.ERROR.BOARDINGTEMPLATE.ERROR_GETTING}: ${error}`,
			);
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
				boardingTemplateLogger.error(config.ERROR.QUERY_PARAMS.MISSING_ID);
				const errorResponse = buildErrorResponse(config.ERROR.QUERY_PARAMS.MISSING_ID, 400);
				res.status(400).json(errorResponse);
				return;
			}

			const validationResult = UpdateBoardingTemplateSchema.safeParse(req.body);

			if (!validationResult.success) {
				const formattedErrors = formatZodErrors(validationResult.error.format());
				boardingTemplateLogger.error(
					`Validation failed: ${JSON.stringify(formattedErrors)}`,
				);
				const errorResponse = buildErrorResponse("Validation failed", 400, formattedErrors);
				res.status(400).json(errorResponse);
				return;
			}

			if (Object.keys(req.body).length === 0) {
				boardingTemplateLogger.error(config.ERROR.COMMON.NO_UPDATE_FIELDS);
				const errorResponse = buildErrorResponse(config.ERROR.COMMON.NO_UPDATE_FIELDS, 400);
				res.status(400).json(errorResponse);
				return;
			}

			const validatedData = validationResult.data;

			boardingTemplateLogger.info(`Updating boardingTemplate: ${id}`);

			const existingBoardingTemplate = await prisma.boardingTemplate.findFirst({
				where: { id },
			});

			if (!existingBoardingTemplate) {
				boardingTemplateLogger.error(`${config.ERROR.BOARDINGTEMPLATE.NOT_FOUND}: ${id}`);
				const errorResponse = buildErrorResponse(
					config.ERROR.BOARDINGTEMPLATE.NOT_FOUND,
					404,
				);
				res.status(404).json(errorResponse);
				return;
			}

			const updatedBoardingTemplate = await prisma.boardingTemplate.update({
				where: { id },
				data: validatedData,
			});

			try {
				await invalidateCache.byPattern(`cache:boardingTemplate:byId:${id}:*`);
				await invalidateCache.byPattern("cache:boardingTemplate:list:*");
				boardingTemplateLogger.info(
					`Cache invalidated after boardingTemplate ${id} update`,
				);
			} catch (cacheError) {
				boardingTemplateLogger.warn(
					"Failed to invalidate cache after boardingTemplate update:",
					cacheError,
				);
			}

			boardingTemplateLogger.info(
				`${config.SUCCESS.BOARDINGTEMPLATE.UPDATED}: ${updatedBoardingTemplate.id}`,
			);
			const successResponse = buildSuccessResponse(
				config.SUCCESS.BOARDINGTEMPLATE.UPDATED,
				{ boardingTemplate: updatedBoardingTemplate },
				200,
			);
			res.status(200).json(successResponse);
		} catch (error) {
			boardingTemplateLogger.error(
				`${config.ERROR.BOARDINGTEMPLATE.ERROR_UPDATING}: ${error}`,
			);
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
				boardingTemplateLogger.error(config.ERROR.QUERY_PARAMS.MISSING_ID);
				const errorResponse = buildErrorResponse(config.ERROR.QUERY_PARAMS.MISSING_ID, 400);
				res.status(400).json(errorResponse);
				return;
			}

			boardingTemplateLogger.info(`${config.SUCCESS.BOARDINGTEMPLATE.DELETED}: ${id}`);

			const existingBoardingTemplate = await prisma.boardingTemplate.findFirst({
				where: { id },
			});

			if (!existingBoardingTemplate) {
				boardingTemplateLogger.error(`${config.ERROR.BOARDINGTEMPLATE.NOT_FOUND}: ${id}`);
				const errorResponse = buildErrorResponse(
					config.ERROR.BOARDINGTEMPLATE.NOT_FOUND,
					404,
				);
				res.status(404).json(errorResponse);
				return;
			}

			await prisma.boardingTemplate.delete({
				where: { id },
			});

			try {
				await invalidateCache.byPattern(`cache:boardingTemplate:byId:${id}:*`);
				await invalidateCache.byPattern("cache:boardingTemplate:list:*");
				boardingTemplateLogger.info(
					`Cache invalidated after boardingTemplate ${id} deletion`,
				);
			} catch (cacheError) {
				boardingTemplateLogger.warn(
					"Failed to invalidate cache after boardingTemplate deletion:",
					cacheError,
				);
			}

			boardingTemplateLogger.info(`${config.SUCCESS.BOARDINGTEMPLATE.DELETED}: ${id}`);
			const successResponse = buildSuccessResponse(
				config.SUCCESS.BOARDINGTEMPLATE.DELETED,
				{},
				200,
			);
			res.status(200).json(successResponse);
		} catch (error) {
			boardingTemplateLogger.error(
				`${config.ERROR.BOARDINGTEMPLATE.DELETE_FAILED}: ${error}`,
			);
			const errorResponse = buildErrorResponse(
				config.ERROR.COMMON.INTERNAL_SERVER_ERROR,
				500,
			);
			res.status(500).json(errorResponse);
		}
	};

	return { create, getAll, getById, update, remove };
};
