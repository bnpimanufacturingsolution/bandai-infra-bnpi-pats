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
import { CreateGuideSchema, UpdateGuideSchema } from "../../zod/guide.zod";
import { logActivity } from "../../utils/activityLogger";
import { logAudit } from "../../utils/auditLogger";
import { config } from "../../config/constant";
import { redisClient } from "../../config/redis";
import { invalidateCache } from "../../middleware/cache";

const logger = getLogger();
const guideLogger = logger.child({ module: "guide" });

export const controller = (prisma: PrismaClient) => {
	const create = async (req: Request, res: Response, _next: NextFunction) => {
		let requestData = req.body;
		const contentType = req.get("Content-Type") || "";

		if (
			contentType.includes("application/x-www-form-urlencoded") ||
			contentType.includes("multipart/form-data")
		) {
			guideLogger.info("Original form data:", JSON.stringify(req.body, null, 2));
			requestData = transformFormDataToObject(req.body);
			guideLogger.info(
				"Transformed form data to object structure:",
				JSON.stringify(requestData, null, 2),
			);
		}

		const validation = CreateGuideSchema.safeParse(requestData);
		if (!validation.success) {
			const formattedErrors = formatZodErrors(validation.error.format());
			guideLogger.error(`Validation failed: ${JSON.stringify(formattedErrors)}`);
			const errorResponse = buildErrorResponse("Validation failed", 400, formattedErrors);
			res.status(400).json(errorResponse);
			return;
		}

		try {
			const guide = await prisma.guide.create({
				data: validation.data as Prisma.GuideCreateInput,
			});
			guideLogger.info(`Guide created successfully: ${guide.id}`);

			logActivity(req, {
				userId: (req as any).user?.id || "unknown",
				action: config.ACTIVITY_LOG.GUIDE.ACTIONS.CREATE_GUIDE,
				description: `${config.ACTIVITY_LOG.GUIDE.DESCRIPTIONS.GUIDE_CREATED}: ${guide.id}`,
				page: {
					url: req.originalUrl,
					title: config.ACTIVITY_LOG.GUIDE.PAGES.GUIDE_CREATION,
				},
			});

			logAudit(req, {
				userId: (req as any).user?.id || "unknown",
				action: config.AUDIT_LOG.ACTIONS.CREATE,
				resource: config.AUDIT_LOG.RESOURCES.GUIDE,
				severity: config.AUDIT_LOG.SEVERITY.LOW,
				entityType: config.AUDIT_LOG.ENTITY_TYPES.GUIDE,
				entityId: guide.id,
				changesBefore: null,
				changesAfter: {
					id: guide.id,
					description: guide.description,
					createdAt: guide.createdAt,
					updatedAt: guide.updatedAt,
				},
				description: `${config.AUDIT_LOG.GUIDE.DESCRIPTIONS.GUIDE_CREATED}: ${guide.id}`,
			});

			try {
				await invalidateCache.byPattern("cache:guide:list:*");
				guideLogger.info("Guide list cache invalidated after creation");
			} catch (cacheError) {
				guideLogger.warn("Failed to invalidate cache after guide creation:", cacheError);
			}

			const successResponse = buildSuccessResponse(config.SUCCESS.GUIDE.CREATED, guide, 201);
			res.status(201).json(successResponse);
		} catch (error) {
			guideLogger.error(`${config.ERROR.GUIDE.CREATE_FAILED}: ${error}`);
			const errorResponse = buildErrorResponse(
				config.ERROR.COMMON.INTERNAL_SERVER_ERROR,
				500,
			);
			res.status(500).json(errorResponse);
		}
	};
	const getAll = async (req: Request, res: Response, _next: NextFunction) => {
		const validationResult = validateQueryParams(req, guideLogger);

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

		guideLogger.info(
			`Getting guides, page: ${page}, limit: ${limit}, query: ${query}, order: ${order}, groupBy: ${groupBy}`,
		);

		try {
			// Base where clause
			const whereClause: Prisma.GuideWhereInput = {
				isDeleted: false,
			};

			// search fields sample ("name", "description", "type")
			const searchFields = ["name", "description", "type"];
			if (query) {
				const searchConditions = buildSearchConditions("Guide", query, searchFields);
				if (searchConditions.length > 0) {
					whereClause.OR = searchConditions;
				}
			}

			if (filter) {
				const filterConditions = buildFilterConditions("Guide", filter);
				if (filterConditions.length > 0) {
					whereClause.AND = filterConditions;
				}
			}
			const findManyQuery = buildFindManyQuery(whereClause, skip, limit, order, sort, fields);

			const [guides, total] = await Promise.all([
				document ? prisma.guide.findMany(findManyQuery) : [],
				count ? prisma.guide.count({ where: whereClause }) : 0,
			]);

			guideLogger.info(`Retrieved ${guides.length} guides`);
			const processedData =
				groupBy && document ? groupDataByField(guides, groupBy as string) : guides;

			const responseData: Record<string, any> = {
				...(document && { guides: processedData }),
				...(count && { count: total }),
				...(pagination && { pagination: buildPagination(total, page, limit) }),
				...(groupBy && { groupedBy: groupBy }),
			};

			res.status(200).json(
				buildSuccessResponse(config.SUCCESS.GUIDE.RETRIEVED_ALL, responseData, 200),
			);
		} catch (error) {
			guideLogger.error(`${config.ERROR.GUIDE.GET_ALL_FAILED}: ${error}`);
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
				guideLogger.error(config.ERROR.QUERY_PARAMS.MISSING_ID);
				const errorResponse = buildErrorResponse(config.ERROR.QUERY_PARAMS.MISSING_ID, 400);
				res.status(400).json(errorResponse);
				return;
			}

			if (fields && typeof fields !== "string") {
				guideLogger.error(`${config.ERROR.QUERY_PARAMS.INVALID_POPULATE}: ${fields}`);
				const errorResponse = buildErrorResponse(
					config.ERROR.QUERY_PARAMS.POPULATE_MUST_BE_STRING,
					400,
				);
				res.status(400).json(errorResponse);
				return;
			}

			guideLogger.info(`${config.SUCCESS.GUIDE.GETTING_BY_ID}: ${id}`);

			const cacheKey = `cache:guide:byId:${id}:${fields || "full"}`;
			let guide = null;

			try {
				if (redisClient.isClientConnected()) {
					guide = await redisClient.getJSON(cacheKey);
					if (guide) {
						guideLogger.info(`Guide ${id} retrieved from direct Redis cache`);
					}
				}
			} catch (cacheError) {
				guideLogger.warn(`Redis cache retrieval failed for guide ${id}:`, cacheError);
			}

			if (!guide) {
				const query: Prisma.GuideFindFirstArgs = {
					where: { id },
				};

				query.select = getNestedFields(fields);

				guide = await prisma.guide.findFirst(query);

				if (guide && redisClient.isClientConnected()) {
					try {
						await redisClient.setJSON(cacheKey, guide, 3600);
						guideLogger.info(`Guide ${id} stored in direct Redis cache`);
					} catch (cacheError) {
						guideLogger.warn(`Failed to store guide ${id} in Redis cache:`, cacheError);
					}
				}
			}

			if (!guide) {
				guideLogger.error(`${config.ERROR.GUIDE.NOT_FOUND}: ${id}`);
				const errorResponse = buildErrorResponse(config.ERROR.GUIDE.NOT_FOUND, 404);
				res.status(404).json(errorResponse);
				return;
			}

			guideLogger.info(`${config.SUCCESS.GUIDE.RETRIEVED}: ${(guide as any).id}`);
			const successResponse = buildSuccessResponse(
				config.SUCCESS.GUIDE.RETRIEVED,
				guide,
				200,
			);
			res.status(200).json(successResponse);
		} catch (error) {
			guideLogger.error(`${config.ERROR.GUIDE.ERROR_GETTING}: ${error}`);
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
				guideLogger.error(config.ERROR.QUERY_PARAMS.MISSING_ID);
				const errorResponse = buildErrorResponse(config.ERROR.QUERY_PARAMS.MISSING_ID, 400);
				res.status(400).json(errorResponse);
				return;
			}

			const validationResult = UpdateGuideSchema.safeParse(req.body);

			if (!validationResult.success) {
				const formattedErrors = formatZodErrors(validationResult.error.format());
				guideLogger.error(`Validation failed: ${JSON.stringify(formattedErrors)}`);
				const errorResponse = buildErrorResponse("Validation failed", 400, formattedErrors);
				res.status(400).json(errorResponse);
				return;
			}

			if (Object.keys(req.body).length === 0) {
				guideLogger.error(config.ERROR.COMMON.NO_UPDATE_FIELDS);
				const errorResponse = buildErrorResponse(config.ERROR.COMMON.NO_UPDATE_FIELDS, 400);
				res.status(400).json(errorResponse);
				return;
			}

			const validatedData = validationResult.data;

			guideLogger.info(`Updating guide: ${id}`);

			const existingGuide = await prisma.guide.findFirst({
				where: { id },
			});

			if (!existingGuide) {
				guideLogger.error(`${config.ERROR.GUIDE.NOT_FOUND}: ${id}`);
				const errorResponse = buildErrorResponse(config.ERROR.GUIDE.NOT_FOUND, 404);
				res.status(404).json(errorResponse);
				return;
			}

			const prismaData = { ...validatedData };

			const updatedGuide = await prisma.guide.update({
				where: { id },
				data: prismaData as Prisma.GuideCreateInput,
			});

			try {
				await invalidateCache.byPattern(`cache:guide:byId:${id}:*`);
				await invalidateCache.byPattern("cache:guide:list:*");
				guideLogger.info(`Cache invalidated after guide ${id} update`);
			} catch (cacheError) {
				guideLogger.warn("Failed to invalidate cache after guide update:", cacheError);
			}

			guideLogger.info(`${config.SUCCESS.GUIDE.UPDATED}: ${updatedGuide.id}`);
			const successResponse = buildSuccessResponse(
				config.SUCCESS.GUIDE.UPDATED,
				{ guide: updatedGuide },
				200,
			);
			res.status(200).json(successResponse);
		} catch (error) {
			guideLogger.error(`${config.ERROR.GUIDE.ERROR_UPDATING}: ${error}`);
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
				guideLogger.error(config.ERROR.QUERY_PARAMS.MISSING_ID);
				const errorResponse = buildErrorResponse(config.ERROR.QUERY_PARAMS.MISSING_ID, 400);
				res.status(400).json(errorResponse);
				return;
			}

			guideLogger.info(`${config.SUCCESS.GUIDE.DELETED}: ${id}`);

			const existingGuide = await prisma.guide.findFirst({
				where: { id },
			});

			if (!existingGuide) {
				guideLogger.error(`${config.ERROR.GUIDE.NOT_FOUND}: ${id}`);
				const errorResponse = buildErrorResponse(config.ERROR.GUIDE.NOT_FOUND, 404);
				res.status(404).json(errorResponse);
				return;
			}

			await prisma.guide.delete({
				where: { id },
			});

			try {
				await invalidateCache.byPattern(`cache:guide:byId:${id}:*`);
				await invalidateCache.byPattern("cache:guide:list:*");
				guideLogger.info(`Cache invalidated after guide ${id} deletion`);
			} catch (cacheError) {
				guideLogger.warn("Failed to invalidate cache after guide deletion:", cacheError);
			}

			guideLogger.info(`${config.SUCCESS.GUIDE.DELETED}: ${id}`);
			const successResponse = buildSuccessResponse(config.SUCCESS.GUIDE.DELETED, {}, 200);
			res.status(200).json(successResponse);
		} catch (error) {
			guideLogger.error(`${config.ERROR.GUIDE.DELETE_FAILED}: ${error}`);
			const errorResponse = buildErrorResponse(
				config.ERROR.COMMON.INTERNAL_SERVER_ERROR,
				500,
			);
			res.status(500).json(errorResponse);
		}
	};

	return { create, getAll, getById, update, remove };
};
