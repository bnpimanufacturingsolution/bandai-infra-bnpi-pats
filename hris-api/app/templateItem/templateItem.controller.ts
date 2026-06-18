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

import { logActivity } from "../../utils/activityLogger";
import { logAudit } from "../../utils/auditLogger";
import { config } from "../../config/constant";
import { redisClient } from "../../config/redis";
import { invalidateCache } from "../../middleware/cache";
import { CreateTemplateItemSchema, UpdateTemplateItemSchema } from "../../zod/templateItem.zod";

const logger = getLogger();
const templateItemLogger = logger.child({ module: "templateItem" });

export const controller = (prisma: PrismaClient) => {
	const create = async (req: Request, res: Response, _next: NextFunction) => {
		let requestData = req.body;
		const contentType = req.get("Content-Type") || "";

		if (
			contentType.includes("application/x-www-form-urlencoded") ||
			contentType.includes("multipart/form-data")
		) {
			templateItemLogger.info("Original form data:", JSON.stringify(req.body, null, 2));
			requestData = transformFormDataToObject(req.body);
			templateItemLogger.info(
				"Transformed form data to object structure:",
				JSON.stringify(requestData, null, 2),
			);
		}

		const validation = CreateTemplateItemSchema.safeParse(requestData);
		if (!validation.success) {
			const formattedErrors = formatZodErrors(validation.error.format());
			templateItemLogger.error(`Validation failed: ${JSON.stringify(formattedErrors)}`);
			const errorResponse = buildErrorResponse("Validation failed", 400, formattedErrors);
			res.status(400).json(errorResponse);
			return;
		}

		try {
			const templateItem = await prisma.templateItem.create({ data: validation.data as any });

			logActivity(req, {
				userId: (req as any).user?.id || "unknown",
				action: config.ACTIVITY_LOG.TEMPLATEITEM.ACTIONS.CREATE_TEMPLATEITEM,
				description: `${config.ACTIVITY_LOG.TEMPLATEITEM.DESCRIPTIONS.TEMPLATEITEM_CREATED}: ${templateItem.id}`,
				page: {
					url: req.originalUrl,
					title: config.ACTIVITY_LOG.TEMPLATEITEM.PAGES.TEMPLATEITEM_CREATION,
				},
			});

			logAudit(req, {
				userId: (req as any).user?.id || "unknown",
				action: config.AUDIT_LOG.ACTIONS.CREATE,
				resource: config.AUDIT_LOG.RESOURCES.TEMPLATEITEM,
				severity: config.AUDIT_LOG.SEVERITY.LOW,
				entityType: config.AUDIT_LOG.ENTITY_TYPES.TEMPLATEITEM,
				entityId: templateItem.id,
				changesBefore: null,
				changesAfter: {
					id: templateItem.id,
					description: templateItem.description,
					createdAt: templateItem.createdAt,
					updatedAt: templateItem.updatedAt,
				},
				description: `${config.AUDIT_LOG.TEMPLATEITEM.DESCRIPTIONS.TEMPLATEITEM_CREATED}: ${templateItem.id}`,
			});

			try {
				await invalidateCache.byPattern("cache:templateItem:list:*");
				templateItemLogger.info("TemplateItem list cache invalidated after creation");
			} catch (cacheError) {
				templateItemLogger.warn(
					"Failed to invalidate cache after templateItem creation:",
					cacheError,
				);
			}

			const successResponse = buildSuccessResponse(
				config.SUCCESS.TEMPLATEITEM.CREATED,
				templateItem,
				201,
			);
			res.status(201).json(successResponse);
		} catch (error) {
			templateItemLogger.error(`${config.ERROR.TEMPLATEITEM.CREATE_FAILED}: ${error}`);
			const errorResponse = buildErrorResponse(
				config.ERROR.COMMON.INTERNAL_SERVER_ERROR,
				500,
			);
			res.status(500).json(errorResponse);
		}
	};
	const getAll = async (req: Request, res: Response, _next: NextFunction) => {
		const validationResult = validateQueryParams(req, templateItemLogger);

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

		templateItemLogger.info(
			`Getting templateItems, page: ${page}, limit: ${limit}, query: ${query}, order: ${order}, groupBy: ${groupBy}`,
		);

		try {
			// Base where clause
			const whereClause: Prisma.TemplateItemWhereInput = {
				isDeleted: false,
			};

			// search fields sample ("name", "description", "type")
			const searchFields = ["name", "description", "type"];
			if (query) {
				const searchConditions = buildSearchConditions("TemplateItem", query, searchFields);
				if (searchConditions.length > 0) {
					whereClause.OR = searchConditions;
				}
			}

			if (filter) {
				const filterConditions = buildFilterConditions("TemplateItem", filter);
				if (filterConditions.length > 0) {
					whereClause.AND = filterConditions;
				}
			}
			const findManyQuery = buildFindManyQuery(whereClause, skip, limit, order, sort, fields);

			const [templateItems, total] = await Promise.all([
				document ? prisma.templateItem.findMany(findManyQuery) : [],
				count ? prisma.templateItem.count({ where: whereClause }) : 0,
			]);

			templateItemLogger.info(`Retrieved ${templateItems.length} templateItems`);
			const processedData =
				groupBy && document
					? groupDataByField(templateItems, groupBy as string)
					: templateItems;

			const responseData: Record<string, any> = {
				...(document && { templateItems: processedData }),
				...(count && { count: total }),
				...(pagination && { pagination: buildPagination(total, page, limit) }),
				...(groupBy && { groupedBy: groupBy }),
			};

			res.status(200).json(
				buildSuccessResponse(config.SUCCESS.TEMPLATEITEM.RETRIEVED_ALL, responseData, 200),
			);
		} catch (error) {
			templateItemLogger.error(`${config.ERROR.TEMPLATEITEM.GET_ALL_FAILED}: ${error}`);
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
				templateItemLogger.error(config.ERROR.QUERY_PARAMS.MISSING_ID);
				const errorResponse = buildErrorResponse(config.ERROR.QUERY_PARAMS.MISSING_ID, 400);
				res.status(400).json(errorResponse);
				return;
			}

			if (fields && typeof fields !== "string") {
				templateItemLogger.error(
					`${config.ERROR.QUERY_PARAMS.INVALID_POPULATE}: ${fields}`,
				);
				const errorResponse = buildErrorResponse(
					config.ERROR.QUERY_PARAMS.POPULATE_MUST_BE_STRING,
					400,
				);
				res.status(400).json(errorResponse);
				return;
			}

			templateItemLogger.info(`${config.SUCCESS.TEMPLATEITEM.GETTING_BY_ID}: ${id}`);

			const cacheKey = `cache:templateItem:byId:${id}:${fields || "full"}`;
			let templateItem = null;

			try {
				if (redisClient.isClientConnected()) {
					templateItem = await redisClient.getJSON(cacheKey);
					if (templateItem) {
						templateItemLogger.info(
							`TemplateItem ${id} retrieved from direct Redis cache`,
						);
					}
				}
			} catch (cacheError) {
				templateItemLogger.warn(
					`Redis cache retrieval failed for templateItem ${id}:`,
					cacheError,
				);
			}

			if (!templateItem) {
				const query: Prisma.TemplateItemFindFirstArgs = {
					where: { id },
				};

				query.select = getNestedFields(fields);

				templateItem = await prisma.templateItem.findFirst(query);

				if (templateItem && redisClient.isClientConnected()) {
					try {
						await redisClient.setJSON(cacheKey, templateItem, 3600);
						templateItemLogger.info(`TemplateItem ${id} stored in direct Redis cache`);
					} catch (cacheError) {
						templateItemLogger.warn(
							`Failed to store templateItem ${id} in Redis cache:`,
							cacheError,
						);
					}
				}
			}

			if (!templateItem) {
				templateItemLogger.error(`${config.ERROR.TEMPLATEITEM.NOT_FOUND}: ${id}`);
				const errorResponse = buildErrorResponse(config.ERROR.TEMPLATEITEM.NOT_FOUND, 404);
				res.status(404).json(errorResponse);
				return;
			}

			templateItemLogger.info(
				`${config.SUCCESS.TEMPLATEITEM.RETRIEVED}: ${(templateItem as any).id}`,
			);
			const successResponse = buildSuccessResponse(
				config.SUCCESS.TEMPLATEITEM.RETRIEVED,
				templateItem,
				200,
			);
			res.status(200).json(successResponse);
		} catch (error) {
			templateItemLogger.error(`${config.ERROR.TEMPLATEITEM.ERROR_GETTING}: ${error}`);
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
				templateItemLogger.error(config.ERROR.QUERY_PARAMS.MISSING_ID);
				const errorResponse = buildErrorResponse(config.ERROR.QUERY_PARAMS.MISSING_ID, 400);
				res.status(400).json(errorResponse);
				return;
			}

			const validationResult = UpdateTemplateItemSchema.safeParse(req.body);

			if (!validationResult.success) {
				const formattedErrors = formatZodErrors(validationResult.error.format());
				templateItemLogger.error(`Validation failed: ${JSON.stringify(formattedErrors)}`);
				const errorResponse = buildErrorResponse("Validation failed", 400, formattedErrors);
				res.status(400).json(errorResponse);
				return;
			}

			if (Object.keys(req.body).length === 0) {
				templateItemLogger.error(config.ERROR.COMMON.NO_UPDATE_FIELDS);
				const errorResponse = buildErrorResponse(config.ERROR.COMMON.NO_UPDATE_FIELDS, 400);
				res.status(400).json(errorResponse);
				return;
			}

			const validatedData = validationResult.data;

			templateItemLogger.info(`Updating templateItem: ${id}`);

			const existingTemplateItem = await prisma.templateItem.findFirst({
				where: { id },
			});

			if (!existingTemplateItem) {
				templateItemLogger.error(`${config.ERROR.TEMPLATEITEM.NOT_FOUND}: ${id}`);
				const errorResponse = buildErrorResponse(config.ERROR.TEMPLATEITEM.NOT_FOUND, 404);
				res.status(404).json(errorResponse);
				return;
			}

			const prismaData = { ...validatedData };

			const updatedTemplateItem = await prisma.templateItem.update({
				where: { id },
				data: prismaData as any,
			});

			try {
				await invalidateCache.byPattern(`cache:templateItem:byId:${id}:*`);
				await invalidateCache.byPattern("cache:templateItem:list:*");
				templateItemLogger.info(`Cache invalidated after templateItem ${id} update`);
			} catch (cacheError) {
				templateItemLogger.warn(
					"Failed to invalidate cache after templateItem update:",
					cacheError,
				);
			}

			templateItemLogger.info(
				`${config.SUCCESS.TEMPLATEITEM.UPDATED}: ${updatedTemplateItem.id}`,
			);
			const successResponse = buildSuccessResponse(
				config.SUCCESS.TEMPLATEITEM.UPDATED,
				{ templateItem: updatedTemplateItem },
				200,
			);
			res.status(200).json(successResponse);
		} catch (error) {
			templateItemLogger.error(`${config.ERROR.TEMPLATEITEM.ERROR_UPDATING}: ${error}`);
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
				templateItemLogger.error(config.ERROR.QUERY_PARAMS.MISSING_ID);
				const errorResponse = buildErrorResponse(config.ERROR.QUERY_PARAMS.MISSING_ID, 400);
				res.status(400).json(errorResponse);
				return;
			}

			templateItemLogger.info(`${config.SUCCESS.TEMPLATEITEM.DELETED}: ${id}`);

			const existingTemplateItem = await prisma.templateItem.findFirst({
				where: { id },
			});

			if (!existingTemplateItem) {
				templateItemLogger.error(`${config.ERROR.TEMPLATEITEM.NOT_FOUND}: ${id}`);
				const errorResponse = buildErrorResponse(config.ERROR.TEMPLATEITEM.NOT_FOUND, 404);
				res.status(404).json(errorResponse);
				return;
			}

			await prisma.templateItem.delete({
				where: { id },
			});

			try {
				await invalidateCache.byPattern(`cache:templateItem:byId:${id}:*`);
				await invalidateCache.byPattern("cache:templateItem:list:*");
				templateItemLogger.info(`Cache invalidated after templateItem ${id} deletion`);
			} catch (cacheError) {
				templateItemLogger.warn(
					"Failed to invalidate cache after templateItem deletion:",
					cacheError,
				);
			}

			templateItemLogger.info(`${config.SUCCESS.TEMPLATEITEM.DELETED}: ${id}`);
			const successResponse = buildSuccessResponse(
				config.SUCCESS.TEMPLATEITEM.DELETED,
				{},
				200,
			);
			res.status(200).json(successResponse);
		} catch (error) {
			templateItemLogger.error(`${config.ERROR.TEMPLATEITEM.DELETE_FAILED}: ${error}`);
			const errorResponse = buildErrorResponse(
				config.ERROR.COMMON.INTERNAL_SERVER_ERROR,
				500,
			);
			res.status(500).json(errorResponse);
		}
	};

	const bulkCreate = async (req: Request, res: Response, _next: NextFunction) => {
		let requestData = req.body;
		const contentType = req.get("Content-Type") || "";

		console.log("Bulk create request body:", requestData);

		if (
			contentType.includes("application/x-www-form-urlencoded") ||
			contentType.includes("multipart/form-data")
		) {
			templateItemLogger.info("Original form data:", JSON.stringify(req.body, null, 2));
			requestData = transformFormDataToObject(req.body);
			templateItemLogger.info(
				"Transformed form data to object structure:",
				JSON.stringify(requestData, null, 2),
			);
		}

		// Validate that we have an array of items
		if (!Array.isArray(requestData) || requestData.length === 0) {
			templateItemLogger.error("Request body must be a non-empty array of template items");
			const errorResponse = buildErrorResponse(
				"Request body must be a non-empty array of template items",
				400,
			);
			res.status(400).json(errorResponse);
			return;
		}

		// Validate each item
		const validationErrors: any[] = [];
		const validatedItems: any[] = [];

		for (let i = 0; i < requestData.length; i++) {
			const validation = CreateTemplateItemSchema.safeParse(requestData[i]);
			if (!validation.success) {
				const formattedErrors = formatZodErrors(validation.error.format());
				validationErrors.push({
					index: i,
					errors: formattedErrors,
				});
			} else {
				validatedItems.push(validation.data);
			}
		}

		if (validationErrors.length > 0) {
			templateItemLogger.error(
				`Validation failed for ${validationErrors.length} items: ${JSON.stringify(validationErrors)}`,
			);
			const errorResponse = buildErrorResponse(
				"Validation failed for one or more items",
				400,
				validationErrors,
			);
			res.status(400).json(errorResponse);
			return;
		}

		try {
			// Create all items in a transaction
			const templateItems = await prisma.$transaction(
				validatedItems.map((item) => prisma.templateItem.create({ data: item as any })),
			);

			templateItemLogger.info(`Successfully created ${templateItems.length} template items`);

			// Log activity for bulk creation
			logActivity(req, {
				userId: (req as any).user?.id || "unknown",
				action: config.ACTIVITY_LOG.TEMPLATEITEM.ACTIONS.CREATE_TEMPLATEITEM,
				description: `Bulk created ${templateItems.length} template items`,
				page: {
					url: req.originalUrl,
					title: config.ACTIVITY_LOG.TEMPLATEITEM.PAGES.TEMPLATEITEM_CREATION,
				},
			});

			// Log audit for bulk creation
			logAudit(req, {
				userId: (req as any).user?.id || "unknown",
				action: config.AUDIT_LOG.ACTIONS.CREATE,
				resource: config.AUDIT_LOG.RESOURCES.TEMPLATEITEM,
				severity: config.AUDIT_LOG.SEVERITY.LOW,
				entityType: config.AUDIT_LOG.ENTITY_TYPES.TEMPLATEITEM,
				entityId: `bulk_${templateItems.length}_items`,
				changesBefore: null,
				changesAfter: {
					count: templateItems.length,
					itemIds: templateItems.map((item) => item.id),
				},
				description: `Bulk created ${templateItems.length} template items`,
			});

			// Invalidate cache
			try {
				await invalidateCache.byPattern("cache:templateItem:list:*");
				templateItemLogger.info("TemplateItem list cache invalidated after bulk creation");
			} catch (cacheError) {
				templateItemLogger.warn(
					"Failed to invalidate cache after templateItem bulk creation:",
					cacheError,
				);
			}

			const successResponse = buildSuccessResponse(
				`Successfully created ${templateItems.length} template items`,
				{
					templateItems,
					count: templateItems.length,
				},
				201,
			);
			res.status(201).json(successResponse);
		} catch (error) {
			templateItemLogger.error(`Bulk create failed: ${error}`);
			const errorResponse = buildErrorResponse(
				config.ERROR.COMMON.INTERNAL_SERVER_ERROR,
				500,
			);
			res.status(500).json(errorResponse);
		}
	};

	return { create, getAll, getById, update, remove, bulkCreate };
};
