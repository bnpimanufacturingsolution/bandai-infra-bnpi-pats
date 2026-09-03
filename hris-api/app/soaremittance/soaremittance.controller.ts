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
import { CreateSoaremittanceSchema, UpdateSoaremittanceSchema } from "../../zod/soaremittance.zod";
import { logActivity } from "../../utils/activityLogger";
import { logAudit } from "../../utils/auditLogger";
import { config } from "../../config/constant";
import { redisClient } from "../../config/redis";
import { invalidateCache } from "../../middleware/cache";

const logger = getLogger();
const soaremittanceLogger = logger.child({ module: "soaremittance" });

export const controller = (prisma: PrismaClient) => {
	const create = async (req: Request, res: Response, _next: NextFunction) => {
		let requestData = req.body;
		const contentType = req.get("Content-Type") || "";

		if (
			contentType.includes("application/x-www-form-urlencoded") ||
			contentType.includes("multipart/form-data")
		) {
			soaremittanceLogger.info("Original form data:", JSON.stringify(req.body, null, 2));
			requestData = transformFormDataToObject(req.body);
			soaremittanceLogger.info(
				"Transformed form data to object structure:",
				JSON.stringify(requestData, null, 2),
			);
		}

		const validation = CreateSoaremittanceSchema.safeParse(requestData);
		if (!validation.success) {
			const formattedErrors = formatZodErrors(validation.error.format());
			soaremittanceLogger.error(`Validation failed: ${JSON.stringify(formattedErrors)}`);
			const errorResponse = buildErrorResponse("Validation failed", 400, formattedErrors);
			res.status(400).json(errorResponse);
			return;
		}

		try {
			const soaremittance = await prisma.sOARemittance.create({ data: validation.data });
			soaremittanceLogger.info(`Soaremittance created successfully: ${soaremittance.id}`);

			logActivity(req, {
				userId: (req as any).user?.id || "unknown",
				action: config.ACTIVITY_LOG.SOAREMITTANCE.ACTIONS.CREATE_SOAREMITTANCE,
				description: `${config.ACTIVITY_LOG.SOAREMITTANCE.DESCRIPTIONS.SOAREMITTANCE_CREATED}: ${soaremittance.id}`,
				page: {
					url: req.originalUrl,
					title: config.ACTIVITY_LOG.SOAREMITTANCE.PAGES.SOAREMITTANCE_CREATION,
				},
			});

			logAudit(req, {
				userId: (req as any).user?.id || "unknown",
				action: config.AUDIT_LOG.ACTIONS.CREATE,
				resource: config.AUDIT_LOG.RESOURCES.SOAREMITTANCE,
				severity: config.AUDIT_LOG.SEVERITY.LOW,
				entityType: config.AUDIT_LOG.ENTITY_TYPES.SOAREMITTANCE,
				entityId: soaremittance.id,
				changesBefore: null,
				changesAfter: {
					id: soaremittance.id,
						category: soaremittance.category,
						notes: soaremittance.notes,
						createdAt: soaremittance.createdAt,
						updatedAt: soaremittance.updatedAt,
					},
					description: `${config.AUDIT_LOG.SOAREMITTANCE.DESCRIPTIONS.SOAREMITTANCE_CREATED}: ${soaremittance.id}`,
			});

			try {
				await invalidateCache.byPattern("cache:soaremittance:list:*");
				soaremittanceLogger.info("Soaremittance list cache invalidated after creation");
			} catch (cacheError) {
				soaremittanceLogger.warn(
					"Failed to invalidate cache after soaremittance creation:",
					cacheError,
				);
			}

			const successResponse = buildSuccessResponse(
				config.SUCCESS.SOAREMITTANCE.CREATED,
				soaremittance,
				201,
			);
			res.status(201).json(successResponse);
		} catch (error) {
			soaremittanceLogger.error(`${config.ERROR.SOAREMITTANCE.CREATE_FAILED}: ${error}`);
			const errorResponse = buildErrorResponse(
				config.ERROR.COMMON.INTERNAL_SERVER_ERROR,
				500,
			);
			res.status(500).json(errorResponse);
		}
	};
	const getAll = async (req: Request, res: Response, _next: NextFunction) => {
		const validationResult = validateQueryParams(req, soaremittanceLogger);

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

		soaremittanceLogger.info(
			`Getting soaremittances, page: ${page}, limit: ${limit}, query: ${query}, order: ${order}, groupBy: ${groupBy}`,
		);

		try {
			// Base where clause
			const whereClause: Prisma.SOARemittanceWhereInput = {};

			const searchFields = ["referenceNumber", "category"];
			if (query) {
				const searchConditions = buildSearchConditions("Soaremittance", query, searchFields);
				if (searchConditions.length > 0) {
					whereClause.OR = searchConditions;
				}
			}

			if (filter) {
				const filterConditions = buildFilterConditions("Soaremittance", filter);
				if (filterConditions.length > 0) {
					whereClause.AND = filterConditions;
				}
			}
			const findManyQuery = buildFindManyQuery(whereClause, skip, limit, order, sort, fields);

			const [soaremittances, total] = await Promise.all([
				document ? prisma.sOARemittance.findMany(findManyQuery) : [],
				count ? prisma.sOARemittance.count({ where: whereClause }) : 0,
			]);

			soaremittanceLogger.info(`Retrieved ${soaremittances.length} soaremittances`);
			const processedData =
				groupBy && document ? groupDataByField(soaremittances, groupBy as string) : soaremittances;

			const responseData: Record<string, any> = {
				...(document && { soaremittances: processedData }),
				...(count && { count: total }),
				...(pagination && { pagination: buildPagination(total, page, limit) }),
				...(groupBy && { groupedBy: groupBy }),
			};

			res.status(200).json(
				buildSuccessResponse(config.SUCCESS.SOAREMITTANCE.RETRIEVED_ALL, responseData, 200),
			);
		} catch (error) {
			soaremittanceLogger.error(`${config.ERROR.SOAREMITTANCE.GET_ALL_FAILED}: ${error}`);
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
				soaremittanceLogger.error(config.ERROR.QUERY_PARAMS.MISSING_ID);
				const errorResponse = buildErrorResponse(config.ERROR.QUERY_PARAMS.MISSING_ID, 400);
				res.status(400).json(errorResponse);
				return;
			}

			if (fields && typeof fields !== "string") {
				soaremittanceLogger.error(`${config.ERROR.QUERY_PARAMS.INVALID_POPULATE}: ${fields}`);
				const errorResponse = buildErrorResponse(
					config.ERROR.QUERY_PARAMS.POPULATE_MUST_BE_STRING,
					400,
				);
				res.status(400).json(errorResponse);
				return;
			}

			soaremittanceLogger.info(`${config.SUCCESS.SOAREMITTANCE.GETTING_BY_ID}: ${id}`);

			const cacheKey = `cache:soaremittance:byId:${id}:${fields || "full"}`;
			let soaremittance = null;

			try {
				if (redisClient.isClientConnected()) {
					soaremittance = await redisClient.getJSON(cacheKey);
					if (soaremittance) {
						soaremittanceLogger.info(`Soaremittance ${id} retrieved from direct Redis cache`);
					}
				}
			} catch (cacheError) {
				soaremittanceLogger.warn(`Redis cache retrieval failed for soaremittance ${id}:`, cacheError);
			}

			if (!soaremittance) {
				const query: Prisma.SOARemittanceFindFirstArgs = {
					where: { id },
				};

				query.select = getNestedFields(fields);

				soaremittance = await prisma.sOARemittance.findFirst(query);

				if (soaremittance && redisClient.isClientConnected()) {
					try {
						await redisClient.setJSON(cacheKey, soaremittance, 3600);
						soaremittanceLogger.info(`Soaremittance ${id} stored in direct Redis cache`);
					} catch (cacheError) {
						soaremittanceLogger.warn(
							`Failed to store soaremittance ${id} in Redis cache:`,
							cacheError,
						);
					}
				}
			}

			if (!soaremittance) {
				soaremittanceLogger.error(`${config.ERROR.SOAREMITTANCE.NOT_FOUND}: ${id}`);
				const errorResponse = buildErrorResponse(config.ERROR.SOAREMITTANCE.NOT_FOUND, 404);
				res.status(404).json(errorResponse);
				return;
			}

			soaremittanceLogger.info(`${config.SUCCESS.SOAREMITTANCE.RETRIEVED}: ${(soaremittance as any).id}`);
			const successResponse = buildSuccessResponse(
				config.SUCCESS.SOAREMITTANCE.RETRIEVED,
				soaremittance,
				200,
			);
			res.status(200).json(successResponse);
		} catch (error) {
			soaremittanceLogger.error(`${config.ERROR.SOAREMITTANCE.ERROR_GETTING}: ${error}`);
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
				soaremittanceLogger.error(config.ERROR.QUERY_PARAMS.MISSING_ID);
				const errorResponse = buildErrorResponse(config.ERROR.QUERY_PARAMS.MISSING_ID, 400);
				res.status(400).json(errorResponse);
				return;
			}

			const validationResult = UpdateSoaremittanceSchema.safeParse(req.body);

			if (!validationResult.success) {
				const formattedErrors = formatZodErrors(validationResult.error.format());
				soaremittanceLogger.error(`Validation failed: ${JSON.stringify(formattedErrors)}`);
				const errorResponse = buildErrorResponse("Validation failed", 400, formattedErrors);
				res.status(400).json(errorResponse);
				return;
			}

			if (Object.keys(req.body).length === 0) {
				soaremittanceLogger.error(config.ERROR.COMMON.NO_UPDATE_FIELDS);
				const errorResponse = buildErrorResponse(config.ERROR.COMMON.NO_UPDATE_FIELDS, 400);
				res.status(400).json(errorResponse);
				return;
			}

			const validatedData = validationResult.data;

			soaremittanceLogger.info(`Updating soaremittance: ${id}`);

			const existingSoaremittance = await prisma.sOARemittance.findFirst({
				where: { id },
			});

			if (!existingSoaremittance) {
				soaremittanceLogger.error(`${config.ERROR.SOAREMITTANCE.NOT_FOUND}: ${id}`);
				const errorResponse = buildErrorResponse(config.ERROR.SOAREMITTANCE.NOT_FOUND, 404);
				res.status(404).json(errorResponse);
				return;
			}

			const prismaData = { ...validatedData };

			const updatedSoaremittance = await prisma.sOARemittance.update({
				where: { id },
				data: prismaData,
			});

			try {
				await invalidateCache.byPattern(`cache:soaremittance:byId:${id}:*`);
				await invalidateCache.byPattern("cache:soaremittance:list:*");
				soaremittanceLogger.info(`Cache invalidated after soaremittance ${id} update`);
			} catch (cacheError) {
				soaremittanceLogger.warn(
					"Failed to invalidate cache after soaremittance update:",
					cacheError,
				);
			}

			soaremittanceLogger.info(`${config.SUCCESS.SOAREMITTANCE.UPDATED}: ${updatedSoaremittance.id}`);
			const successResponse = buildSuccessResponse(
				config.SUCCESS.SOAREMITTANCE.UPDATED,
				{ soaremittance: updatedSoaremittance },
				200,
			);
			res.status(200).json(successResponse);
		} catch (error) {
			soaremittanceLogger.error(`${config.ERROR.SOAREMITTANCE.ERROR_UPDATING}: ${error}`);
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
				soaremittanceLogger.error(config.ERROR.QUERY_PARAMS.MISSING_ID);
				const errorResponse = buildErrorResponse(config.ERROR.QUERY_PARAMS.MISSING_ID, 400);
				res.status(400).json(errorResponse);
				return;
			}

			soaremittanceLogger.info(`${config.SUCCESS.SOAREMITTANCE.DELETED}: ${id}`);

			const existingSoaremittance = await prisma.sOARemittance.findFirst({
				where: { id },
			});

			if (!existingSoaremittance) {
				soaremittanceLogger.error(`${config.ERROR.SOAREMITTANCE.NOT_FOUND}: ${id}`);
				const errorResponse = buildErrorResponse(config.ERROR.SOAREMITTANCE.NOT_FOUND, 404);
				res.status(404).json(errorResponse);
				return;
			}

			await prisma.sOARemittance.delete({
				where: { id },
			});

			try {
				await invalidateCache.byPattern(`cache:soaremittance:byId:${id}:*`);
				await invalidateCache.byPattern("cache:soaremittance:list:*");
				soaremittanceLogger.info(`Cache invalidated after soaremittance ${id} deletion`);
			} catch (cacheError) {
				soaremittanceLogger.warn(
					"Failed to invalidate cache after soaremittance deletion:",
					cacheError,
				);
			}

			soaremittanceLogger.info(`${config.SUCCESS.SOAREMITTANCE.DELETED}: ${id}`);
			const successResponse = buildSuccessResponse(config.SUCCESS.SOAREMITTANCE.DELETED, {}, 200);
			res.status(200).json(successResponse);
		} catch (error) {
			soaremittanceLogger.error(`${config.ERROR.SOAREMITTANCE.DELETE_FAILED}: ${error}`);
			const errorResponse = buildErrorResponse(
				config.ERROR.COMMON.INTERNAL_SERVER_ERROR,
				500,
			);
			res.status(500).json(errorResponse);
		}
	};

	return { create, getAll, getById, update, remove };
};
