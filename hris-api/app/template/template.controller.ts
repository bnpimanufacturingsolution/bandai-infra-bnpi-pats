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
import { CreateTemplateSchema, UpdateTemplateSchema } from "../../zod/template.zod";
import { logActivity } from "../../utils/activityLogger";
import { logAudit } from "../../utils/auditLogger";
import { config } from "../../config/constant";
import { redisClient } from "../../config/redis";
import { invalidateCache } from "../../middleware/cache";

const logger = getLogger();
const templateLogger = logger.child({ module: "template" });

export const controller = (prisma: PrismaClient) => {
	const create = async (req: Request, res: Response, _next: NextFunction) => {
		let requestData = req.body;
		const contentType = req.get("Content-Type") || "";

		if (
			contentType.includes("application/x-www-form-urlencoded") ||
			contentType.includes("multipart/form-data")
		) {
			templateLogger.info("Original form data:", JSON.stringify(req.body, null, 2));
			requestData = transformFormDataToObject(req.body);
			templateLogger.info(
				"Transformed form data to object structure:",
				JSON.stringify(requestData, null, 2),
			);
		}

		const validation = CreateTemplateSchema.safeParse(requestData);
		if (!validation.success) {
			const formattedErrors = formatZodErrors(validation.error.format());
			templateLogger.error(`Validation failed: ${JSON.stringify(formattedErrors)}`);
			const errorResponse = buildErrorResponse("Validation failed", 400, formattedErrors);
			res.status(400).json(errorResponse);
			return;
		}

		try {
			const template = await prisma.template.create({ data: validation.data });
			templateLogger.info(`Template created successfully: ${template.id}`);

			logActivity(req, {
				userId: (req as any).user?.id || "unknown",
				action: config.ACTIVITY_LOG.TEMPLATE.ACTIONS.CREATE_TEMPLATE,
				description: `${config.ACTIVITY_LOG.TEMPLATE.DESCRIPTIONS.TEMPLATE_CREATED}: ${template.name || template.id}`,
				page: {
					url: req.originalUrl,
					title: config.ACTIVITY_LOG.TEMPLATE.PAGES.TEMPLATE_CREATION,
				},
			});

			logAudit(req, {
				userId: (req as any).user?.id || "unknown",
				action: config.AUDIT_LOG.ACTIONS.CREATE,
				resource: config.AUDIT_LOG.RESOURCES.TEMPLATE,
				severity: config.AUDIT_LOG.SEVERITY.LOW,
				entityType: config.AUDIT_LOG.ENTITY_TYPES.TEMPLATE,
				entityId: template.id,
				changesBefore: null,
				changesAfter: {
					id: template.id,
					name: template.name,
					description: template.description,
					createdAt: template.createdAt,
					updatedAt: template.updatedAt,
				},
				description: `${config.AUDIT_LOG.TEMPLATE.DESCRIPTIONS.TEMPLATE_CREATED}: ${template.name || template.id}`,
			});

			try {
				await invalidateCache.byPattern("cache:template:list:*");
				templateLogger.info("Template list cache invalidated after creation");
			} catch (cacheError) {
				templateLogger.warn(
					"Failed to invalidate cache after template creation:",
					cacheError,
				);
			}

			const successResponse = buildSuccessResponse(
				config.SUCCESS.TEMPLATE.CREATED,
				template,
				201,
			);
			res.status(201).json(successResponse);
		} catch (error) {
			templateLogger.error(`${config.ERROR.TEMPLATE.CREATE_FAILED}: ${error}`);
			const errorResponse = buildErrorResponse(
				config.ERROR.COMMON.INTERNAL_SERVER_ERROR,
				500,
			);
			res.status(500).json(errorResponse);
		}
	};
	const getAll = async (req: Request, res: Response, _next: NextFunction) => {
		const validationResult = validateQueryParams(req, templateLogger);

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

		templateLogger.info(
			`Getting templates, page: ${page}, limit: ${limit}, query: ${query}, order: ${order}, groupBy: ${groupBy}`,
		);

		try {
			// Base where clause
			const whereClause: Prisma.TemplateWhereInput = {
				isDeleted: false,
			};

			// search fields sample ("name", "description", "type")
			const searchFields = ["name", "description", "type"];
			if (query) {
				const searchConditions = buildSearchConditions("Template", query, searchFields);
				if (searchConditions.length > 0) {
					whereClause.OR = searchConditions;
				}
			}

			if (filter) {
				const filterConditions = buildFilterConditions("Template", filter);
				if (filterConditions.length > 0) {
					whereClause.AND = filterConditions;
				}
			}
			const findManyQuery = buildFindManyQuery(whereClause, skip, limit, order, sort, fields);

			const [templates, total] = await Promise.all([
				document ? prisma.template.findMany(findManyQuery) : [],
				count ? prisma.template.count({ where: whereClause }) : 0,
			]);

			templateLogger.info(`Retrieved ${templates.length} templates`);

			logActivity(req, {
				userId: (req as any).user?.id || "unknown",
				action: config.ACTIVITY_LOG.TEMPLATE.ACTIONS.GET_ALL_TEMPLATE,
				description: config.ACTIVITY_LOG.TEMPLATE.DESCRIPTIONS.TEMPLATES_RETRIEVED,
				page: {
					url: req.originalUrl,
					title: config.ACTIVITY_LOG.TEMPLATE.PAGES.TEMPLATE_LIST,
				},
			});

			const processedData =
				groupBy && document ? groupDataByField(templates, groupBy as string) : templates;

			const responseData: Record<string, any> = {
				...(document && { templates: processedData }),
				...(count && { count: total }),
				...(pagination && { pagination: buildPagination(total, page, limit) }),
				...(groupBy && { groupedBy: groupBy }),
			};

			res.status(200).json(
				buildSuccessResponse(config.SUCCESS.TEMPLATE.RETRIEVED_ALL, responseData, 200),
			);
		} catch (error) {
			templateLogger.error(`${config.ERROR.TEMPLATE.GET_ALL_FAILED}: ${error}`);
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
				templateLogger.error(config.ERROR.QUERY_PARAMS.MISSING_ID);
				const errorResponse = buildErrorResponse(config.ERROR.QUERY_PARAMS.MISSING_ID, 400);
				res.status(400).json(errorResponse);
				return;
			}

			if (fields && typeof fields !== "string") {
				templateLogger.error(`${config.ERROR.QUERY_PARAMS.INVALID_POPULATE}: ${fields}`);
				const errorResponse = buildErrorResponse(
					config.ERROR.QUERY_PARAMS.POPULATE_MUST_BE_STRING,
					400,
				);
				res.status(400).json(errorResponse);
				return;
			}

			templateLogger.info(`${config.SUCCESS.TEMPLATE.GETTING_BY_ID}: ${id}`);

			const cacheKey = `cache:template:byId:${id}:${fields || "full"}`;
			let template = null;

			try {
				if (redisClient.isClientConnected()) {
					template = await redisClient.getJSON(cacheKey);
					if (template) {
						templateLogger.info(`Template ${id} retrieved from direct Redis cache`);
					}
				}
			} catch (cacheError) {
				templateLogger.warn(`Redis cache retrieval failed for template ${id}:`, cacheError);
			}

			if (!template) {
				const query: Prisma.TemplateFindFirstArgs = {
					where: { id },
				};

				query.select = getNestedFields(fields);

				template = await prisma.template.findFirst(query);

				if (template && redisClient.isClientConnected()) {
					try {
						await redisClient.setJSON(cacheKey, template, 3600);
						templateLogger.info(`Template ${id} stored in direct Redis cache`);
					} catch (cacheError) {
						templateLogger.warn(
							`Failed to store template ${id} in Redis cache:`,
							cacheError,
						);
					}
				}
			}

			if (!template) {
				templateLogger.error(`${config.ERROR.TEMPLATE.NOT_FOUND}: ${id}`);
				const errorResponse = buildErrorResponse(config.ERROR.TEMPLATE.NOT_FOUND, 404);
				res.status(404).json(errorResponse);
				return;
			}

			templateLogger.info(`${config.SUCCESS.TEMPLATE.RETRIEVED}: ${(template as any).id}`);

			logActivity(req, {
				userId: (req as any).user?.id || "unknown",
				action: config.ACTIVITY_LOG.TEMPLATE.ACTIONS.GET_TEMPLATE,
				description: `${config.ACTIVITY_LOG.TEMPLATE.DESCRIPTIONS.TEMPLATE_RETRIEVED}: ${(template as any).id}`,
				page: {
					url: req.originalUrl,
					title: config.ACTIVITY_LOG.TEMPLATE.PAGES.TEMPLATE_DETAILS,
				},
			});

			const successResponse = buildSuccessResponse(
				config.SUCCESS.TEMPLATE.RETRIEVED,
				template,
				200,
			);
			res.status(200).json(successResponse);
		} catch (error) {
			templateLogger.error(`${config.ERROR.TEMPLATE.ERROR_GETTING}: ${error}`);
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
				templateLogger.error(config.ERROR.QUERY_PARAMS.MISSING_ID);
				const errorResponse = buildErrorResponse(config.ERROR.QUERY_PARAMS.MISSING_ID, 400);
				res.status(400).json(errorResponse);
				return;
			}

			const validationResult = UpdateTemplateSchema.safeParse(req.body);

			if (!validationResult.success) {
				const formattedErrors = formatZodErrors(validationResult.error.format());
				templateLogger.error(`Validation failed: ${JSON.stringify(formattedErrors)}`);
				const errorResponse = buildErrorResponse("Validation failed", 400, formattedErrors);
				res.status(400).json(errorResponse);
				return;
			}

			if (Object.keys(req.body).length === 0) {
				templateLogger.error(config.ERROR.COMMON.NO_UPDATE_FIELDS);
				const errorResponse = buildErrorResponse(config.ERROR.COMMON.NO_UPDATE_FIELDS, 400);
				res.status(400).json(errorResponse);
				return;
			}

			const validatedData = validationResult.data;

			templateLogger.info(`Updating template: ${id}`);

			const existingTemplate = await prisma.template.findFirst({
				where: { id },
			});

			if (!existingTemplate) {
				templateLogger.error(`${config.ERROR.TEMPLATE.NOT_FOUND}: ${id}`);
				const errorResponse = buildErrorResponse(config.ERROR.TEMPLATE.NOT_FOUND, 404);
				res.status(404).json(errorResponse);
				return;
			}

			const prismaData = { ...validatedData };

			const updatedTemplate = await prisma.template.update({
				where: { id },
				data: prismaData,
			});

			try {
				await invalidateCache.byPattern(`cache:template:byId:${id}:*`);
				await invalidateCache.byPattern("cache:template:list:*");
				templateLogger.info(`Cache invalidated after template ${id} update`);
			} catch (cacheError) {
				templateLogger.warn(
					"Failed to invalidate cache after template update:",
					cacheError,
				);
			}

			templateLogger.info(`${config.SUCCESS.TEMPLATE.UPDATED}: ${updatedTemplate.id}`);

			logActivity(req, {
				userId: (req as any).user?.id || "unknown",
				action: config.ACTIVITY_LOG.TEMPLATE.ACTIONS.UPDATE_TEMPLATE,
				description: `${config.ACTIVITY_LOG.TEMPLATE.DESCRIPTIONS.TEMPLATE_UPDATED}: ${updatedTemplate.id}`,
				page: {
					url: req.originalUrl,
					title: config.ACTIVITY_LOG.TEMPLATE.PAGES.TEMPLATE_UPDATE,
				},
			});

			logAudit(req, {
				userId: (req as any).user?.id || "unknown",
				action: config.AUDIT_LOG.ACTIONS.UPDATE,
				resource: config.AUDIT_LOG.RESOURCES.TEMPLATE,
				severity: config.AUDIT_LOG.SEVERITY.LOW,
				entityType: config.AUDIT_LOG.ENTITY_TYPES.TEMPLATE,
				entityId: updatedTemplate.id,
				changesBefore: existingTemplate,
				changesAfter: updatedTemplate,
				description: `${config.AUDIT_LOG.TEMPLATE.DESCRIPTIONS.TEMPLATE_UPDATED}: ${updatedTemplate.name || updatedTemplate.id}`,
			});

			const successResponse = buildSuccessResponse(
				config.SUCCESS.TEMPLATE.UPDATED,
				{ template: updatedTemplate },
				200,
			);
			res.status(200).json(successResponse);
		} catch (error) {
			templateLogger.error(`${config.ERROR.TEMPLATE.ERROR_UPDATING}: ${error}`);
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
				templateLogger.error(config.ERROR.QUERY_PARAMS.MISSING_ID);
				const errorResponse = buildErrorResponse(config.ERROR.QUERY_PARAMS.MISSING_ID, 400);
				res.status(400).json(errorResponse);
				return;
			}

			templateLogger.info(`${config.SUCCESS.TEMPLATE.DELETED}: ${id}`);

			const existingTemplate = await prisma.template.findFirst({
				where: { id },
			});

			if (!existingTemplate) {
				templateLogger.error(`${config.ERROR.TEMPLATE.NOT_FOUND}: ${id}`);
				const errorResponse = buildErrorResponse(config.ERROR.TEMPLATE.NOT_FOUND, 404);
				res.status(404).json(errorResponse);
				return;
			}

			await prisma.template.delete({
				where: { id },
			});

			try {
				await invalidateCache.byPattern(`cache:template:byId:${id}:*`);
				await invalidateCache.byPattern("cache:template:list:*");
				templateLogger.info(`Cache invalidated after template ${id} deletion`);
			} catch (cacheError) {
				templateLogger.warn(
					"Failed to invalidate cache after template deletion:",
					cacheError,
				);
			}

			templateLogger.info(`${config.SUCCESS.TEMPLATE.DELETED}: ${id}`);

			logActivity(req, {
				userId: (req as any).user?.id || "unknown",
				action: config.ACTIVITY_LOG.TEMPLATE.ACTIONS.DELETE_TEMPLATE,
				description: `${config.ACTIVITY_LOG.TEMPLATE.DESCRIPTIONS.TEMPLATE_DELETED}: ${id}`,
				page: {
					url: req.originalUrl,
					title: config.ACTIVITY_LOG.TEMPLATE.PAGES.TEMPLATE_DELETION,
				},
			});

			logAudit(req, {
				userId: (req as any).user?.id || "unknown",
				action: config.AUDIT_LOG.ACTIONS.DELETE,
				resource: config.AUDIT_LOG.RESOURCES.TEMPLATE,
				severity: config.AUDIT_LOG.SEVERITY.LOW,
				entityType: config.AUDIT_LOG.ENTITY_TYPES.TEMPLATE,
				entityId: id,
				changesBefore: existingTemplate,
				changesAfter: null,
				description: `${config.AUDIT_LOG.TEMPLATE.DESCRIPTIONS.TEMPLATE_DELETED}: ${existingTemplate.name || id}`,
			});

			const successResponse = buildSuccessResponse(config.SUCCESS.TEMPLATE.DELETED, {}, 200);
			res.status(200).json(successResponse);
		} catch (error) {
			templateLogger.error(`${config.ERROR.TEMPLATE.DELETE_FAILED}: ${error}`);
			const errorResponse = buildErrorResponse(
				config.ERROR.COMMON.INTERNAL_SERVER_ERROR,
				500,
			);
			res.status(500).json(errorResponse);
		}
	};

	return { create, getAll, getById, update, remove };
};
