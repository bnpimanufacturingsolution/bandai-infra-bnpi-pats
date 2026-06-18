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
import { CreateActivityLoggingSchema, UpdateActivityLoggingSchema } from "../../zod/activityLogging.zod";
import { config } from "../../config/constant";
import { redisClient } from "../../config/redis";
import { invalidateCache } from "../../middleware/cache";

const logger = getLogger();
const activityLoggingLogger = logger.child({ module: "activityLogging" });

export const controller = (prisma: PrismaClient) => {
	const create = async (req: Request, res: Response, _next: NextFunction) => {
		let requestData = req.body;
		const contentType = req.get("Content-Type") || "";

		if (
			contentType.includes("application/x-www-form-urlencoded") ||
			contentType.includes("multipart/form-data")
		) {
			activityLoggingLogger.info("Original form data:", JSON.stringify(req.body, null, 2));
			requestData = transformFormDataToObject(req.body);
			activityLoggingLogger.info(
				"Transformed form data to object structure:",
				JSON.stringify(requestData, null, 2),
			);
		}

		const validation = CreateActivityLoggingSchema.safeParse(requestData);
		if (!validation.success) {
			const formattedErrors = formatZodErrors(validation.error.format());
			activityLoggingLogger.error(`Validation failed: ${JSON.stringify(formattedErrors)}`);
			const errorResponse = buildErrorResponse("Validation failed", 400, formattedErrors);
			res.status(400).json(errorResponse);
			return;
		}

		try {
			const activityLogging = await prisma.activityLogging.create({
				data: validation.data as Prisma.ActivityLoggingUncheckedCreateInput,
			});
			activityLoggingLogger.info(`ActivityLogging created successfully: ${activityLogging.id}`);

			try {
				await invalidateCache.byPattern("cache:activityLogging:list:*");
				activityLoggingLogger.info("ActivityLogging list cache invalidated after creation");
			} catch (cacheError) {
				activityLoggingLogger.warn(
					"Failed to invalidate cache after activityLogging creation:",
					cacheError,
				);
			}

			const successResponse = buildSuccessResponse(
				config.SUCCESS.ACTIVITYLOGGING.CREATED,
				activityLogging,
				201,
			);
			res.status(201).json(successResponse);
		} catch (error) {
			activityLoggingLogger.error(`${config.ERROR.ACTIVITYLOGGING.CREATE_FAILED}: ${error}`);
			const errorResponse = buildErrorResponse(
				config.ERROR.COMMON.INTERNAL_SERVER_ERROR,
				500,
			);
			res.status(500).json(errorResponse);
		}
	};
	const getAll = async (req: Request, res: Response, _next: NextFunction) => {
		const validationResult = validateQueryParams(req, activityLoggingLogger);

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

		activityLoggingLogger.info(
			`Getting activityLoggings, page: ${page}, limit: ${limit}, query: ${query}, order: ${order}, groupBy: ${groupBy}`,
		);

		try {
			// Base where clause
			const whereClause: Prisma.ActivityLoggingWhereInput = {
				isDeleted: false,
			};

			const searchFields = ["action", "description", "path", "method", "ip", "entityType"];
			if (query) {
				const searchConditions = buildSearchConditions("ActivityLogging", query, searchFields);
				if (searchConditions.length > 0) {
					whereClause.OR = searchConditions;
				}
			}

			if (filter) {
				const filterConditions = buildFilterConditions("ActivityLogging", filter);
				if (filterConditions.length > 0) {
					whereClause.AND = filterConditions;
				}
			}
			const findManyQuery = buildFindManyQuery(whereClause, skip, limit, order, sort, fields);

			const [activityLoggings, total] = await Promise.all([
				document ? prisma.activityLogging.findMany(findManyQuery) : [],
				count ? prisma.activityLogging.count({ where: whereClause }) : 0,
			]);

			activityLoggingLogger.info(`Retrieved ${activityLoggings.length} activityLoggings`);
			const processedData =
				groupBy && document ? groupDataByField(activityLoggings, groupBy as string) : activityLoggings;

			const responseData: Record<string, any> = {
				...(document && { activityLoggings: processedData }),
				...(count && { count: total }),
				...(pagination && { pagination: buildPagination(total, page, limit) }),
				...(groupBy && { groupedBy: groupBy }),
			};

			res.status(200).json(
				buildSuccessResponse(config.SUCCESS.ACTIVITYLOGGING.RETRIEVED_ALL, responseData, 200),
			);
		} catch (error) {
			activityLoggingLogger.error(`${config.ERROR.ACTIVITYLOGGING.GET_ALL_FAILED}: ${error}`);
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
				activityLoggingLogger.error(config.ERROR.QUERY_PARAMS.MISSING_ID);
				const errorResponse = buildErrorResponse(config.ERROR.QUERY_PARAMS.MISSING_ID, 400);
				res.status(400).json(errorResponse);
				return;
			}

			if (fields && typeof fields !== "string") {
				activityLoggingLogger.error(`${config.ERROR.QUERY_PARAMS.INVALID_POPULATE}: ${fields}`);
				const errorResponse = buildErrorResponse(
					config.ERROR.QUERY_PARAMS.POPULATE_MUST_BE_STRING,
					400,
				);
				res.status(400).json(errorResponse);
				return;
			}

			activityLoggingLogger.info(`${config.SUCCESS.ACTIVITYLOGGING.GETTING_BY_ID}: ${id}`);

			const cacheKey = `cache:activityLogging:byId:${id}:${fields || "full"}`;
			let activityLogging = null;

			try {
				if (redisClient.isClientConnected()) {
					activityLogging = await redisClient.getJSON(cacheKey);
					if (activityLogging) {
						activityLoggingLogger.info(`ActivityLogging ${id} retrieved from direct Redis cache`);
					}
				}
			} catch (cacheError) {
				activityLoggingLogger.warn(`Redis cache retrieval failed for activityLogging ${id}:`, cacheError);
			}

			if (!activityLogging) {
				const query: Prisma.ActivityLoggingFindFirstArgs = {
					where: { id },
				};

				query.select = getNestedFields(fields);

				activityLogging = await prisma.activityLogging.findFirst(query);

				if (activityLogging && redisClient.isClientConnected()) {
					try {
						await redisClient.setJSON(cacheKey, activityLogging, 3600);
						activityLoggingLogger.info(`ActivityLogging ${id} stored in direct Redis cache`);
					} catch (cacheError) {
						activityLoggingLogger.warn(
							`Failed to store activityLogging ${id} in Redis cache:`,
							cacheError,
						);
					}
				}
			}

			if (!activityLogging) {
				activityLoggingLogger.error(`${config.ERROR.ACTIVITYLOGGING.NOT_FOUND}: ${id}`);
				const errorResponse = buildErrorResponse(config.ERROR.ACTIVITYLOGGING.NOT_FOUND, 404);
				res.status(404).json(errorResponse);
				return;
			}

			activityLoggingLogger.info(`${config.SUCCESS.ACTIVITYLOGGING.RETRIEVED}: ${(activityLogging as any).id}`);
			const successResponse = buildSuccessResponse(
				config.SUCCESS.ACTIVITYLOGGING.RETRIEVED,
				activityLogging,
				200,
			);
			res.status(200).json(successResponse);
		} catch (error) {
			activityLoggingLogger.error(`${config.ERROR.ACTIVITYLOGGING.ERROR_GETTING}: ${error}`);
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
				activityLoggingLogger.error(config.ERROR.QUERY_PARAMS.MISSING_ID);
				const errorResponse = buildErrorResponse(config.ERROR.QUERY_PARAMS.MISSING_ID, 400);
				res.status(400).json(errorResponse);
				return;
			}

			const validationResult = UpdateActivityLoggingSchema.safeParse(req.body);

			if (!validationResult.success) {
				const formattedErrors = formatZodErrors(validationResult.error.format());
				activityLoggingLogger.error(`Validation failed: ${JSON.stringify(formattedErrors)}`);
				const errorResponse = buildErrorResponse("Validation failed", 400, formattedErrors);
				res.status(400).json(errorResponse);
				return;
			}

			if (Object.keys(req.body).length === 0) {
				activityLoggingLogger.error(config.ERROR.COMMON.NO_UPDATE_FIELDS);
				const errorResponse = buildErrorResponse(config.ERROR.COMMON.NO_UPDATE_FIELDS, 400);
				res.status(400).json(errorResponse);
				return;
			}

			const validatedData = validationResult.data;

			activityLoggingLogger.info(`Updating activityLogging: ${id}`);

			const existingActivityLogging = await prisma.activityLogging.findFirst({
				where: { id },
			});

			if (!existingActivityLogging) {
				activityLoggingLogger.error(`${config.ERROR.ACTIVITYLOGGING.NOT_FOUND}: ${id}`);
				const errorResponse = buildErrorResponse(config.ERROR.ACTIVITYLOGGING.NOT_FOUND, 404);
				res.status(404).json(errorResponse);
				return;
			}

			const prismaData = { ...validatedData };

			const updatedActivityLogging = await prisma.activityLogging.update({
				where: { id },
				data: prismaData as Prisma.ActivityLoggingUpdateInput,
			});

			try {
				await invalidateCache.byPattern(`cache:activityLogging:byId:${id}:*`);
				await invalidateCache.byPattern("cache:activityLogging:list:*");
				activityLoggingLogger.info(`Cache invalidated after activityLogging ${id} update`);
			} catch (cacheError) {
				activityLoggingLogger.warn(
					"Failed to invalidate cache after activityLogging update:",
					cacheError,
				);
			}

			activityLoggingLogger.info(`${config.SUCCESS.ACTIVITYLOGGING.UPDATED}: ${updatedActivityLogging.id}`);
			const successResponse = buildSuccessResponse(
				config.SUCCESS.ACTIVITYLOGGING.UPDATED,
				{ activityLogging: updatedActivityLogging },
				200,
			);
			res.status(200).json(successResponse);
		} catch (error) {
			activityLoggingLogger.error(`${config.ERROR.ACTIVITYLOGGING.ERROR_UPDATING}: ${error}`);
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
				activityLoggingLogger.error(config.ERROR.QUERY_PARAMS.MISSING_ID);
				const errorResponse = buildErrorResponse(config.ERROR.QUERY_PARAMS.MISSING_ID, 400);
				res.status(400).json(errorResponse);
				return;
			}

			activityLoggingLogger.info(`${config.SUCCESS.ACTIVITYLOGGING.DELETED}: ${id}`);

			const existingActivityLogging = await prisma.activityLogging.findFirst({
				where: { id },
			});

			if (!existingActivityLogging) {
				activityLoggingLogger.error(`${config.ERROR.ACTIVITYLOGGING.NOT_FOUND}: ${id}`);
				const errorResponse = buildErrorResponse(config.ERROR.ACTIVITYLOGGING.NOT_FOUND, 404);
				res.status(404).json(errorResponse);
				return;
			}

			await prisma.activityLogging.delete({
				where: { id },
			});

			try {
				await invalidateCache.byPattern(`cache:activityLogging:byId:${id}:*`);
				await invalidateCache.byPattern("cache:activityLogging:list:*");
				activityLoggingLogger.info(`Cache invalidated after activityLogging ${id} deletion`);
			} catch (cacheError) {
				activityLoggingLogger.warn(
					"Failed to invalidate cache after activityLogging deletion:",
					cacheError,
				);
			}

			activityLoggingLogger.info(`${config.SUCCESS.ACTIVITYLOGGING.DELETED}: ${id}`);
			const successResponse = buildSuccessResponse(config.SUCCESS.ACTIVITYLOGGING.DELETED, {}, 200);
			res.status(200).json(successResponse);
		} catch (error) {
			activityLoggingLogger.error(`${config.ERROR.ACTIVITYLOGGING.DELETE_FAILED}: ${error}`);
			const errorResponse = buildErrorResponse(
				config.ERROR.COMMON.INTERNAL_SERVER_ERROR,
				500,
			);
			res.status(500).json(errorResponse);
		}
	};

	return { create, getAll, getById, update, remove };
};
