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
import { CreateAuditLoggingSchema, UpdateAuditLoggingSchema } from "../../zod/auditLogging.zod";
import { config } from "../../config/constant";
import { redisClient } from "../../config/redis";
import { invalidateCache } from "../../middleware/cache";

const logger = getLogger();
const auditLoggingLogger = logger.child({ module: "auditLogging" });

export const controller = (prisma: PrismaClient) => {
	const create = async (req: Request, res: Response, _next: NextFunction) => {
		let requestData = req.body;
		const contentType = req.get("Content-Type") || "";

		if (
			contentType.includes("application/x-www-form-urlencoded") ||
			contentType.includes("multipart/form-data")
		) {
			auditLoggingLogger.info("Original form data:", JSON.stringify(req.body, null, 2));
			requestData = transformFormDataToObject(req.body);
			auditLoggingLogger.info(
				"Transformed form data to object structure:",
				JSON.stringify(requestData, null, 2),
			);
		}

		const validation = CreateAuditLoggingSchema.safeParse(requestData);
		if (!validation.success) {
			const formattedErrors = formatZodErrors(validation.error.format());
			auditLoggingLogger.error(`Validation failed: ${JSON.stringify(formattedErrors)}`);
			const errorResponse = buildErrorResponse("Validation failed", 400, formattedErrors);
			res.status(400).json(errorResponse);
			return;
		}

		try {
			const auditLogging = await prisma.auditLogging.create({
				data: validation.data as Prisma.AuditLoggingUncheckedCreateInput,
			});
			auditLoggingLogger.info(`AuditLogging created successfully: ${auditLogging.id}`);

			try {
				await invalidateCache.byPattern("cache:auditLogging:list:*");
				auditLoggingLogger.info("AuditLogging list cache invalidated after creation");
			} catch (cacheError) {
				auditLoggingLogger.warn(
					"Failed to invalidate cache after auditLogging creation:",
					cacheError,
				);
			}

			const successResponse = buildSuccessResponse(
				config.SUCCESS.AUDITLOGGING.CREATED,
				auditLogging,
				201,
			);
			res.status(201).json(successResponse);
		} catch (error) {
			auditLoggingLogger.error(`${config.ERROR.AUDITLOGGING.CREATE_FAILED}: ${error}`);
			const errorResponse = buildErrorResponse(
				config.ERROR.COMMON.INTERNAL_SERVER_ERROR,
				500,
			);
			res.status(500).json(errorResponse);
		}
	};
	const getAll = async (req: Request, res: Response, _next: NextFunction) => {
		const validationResult = validateQueryParams(req, auditLoggingLogger);

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

		auditLoggingLogger.info(
			`Getting auditLoggings, page: ${page}, limit: ${limit}, query: ${query}, order: ${order}, groupBy: ${groupBy}`,
		);

		try {
			// Base where clause
			const whereClause: Prisma.AuditLoggingWhereInput = {
				isDeleted: false,
				NOT: [
					{ type: "READ" },
				],
			};

			const searchFields = ["type", "severity", "description"];
			if (query) {
				const searchConditions = buildSearchConditions("AuditLogging", query, searchFields);
				if (searchConditions.length > 0) {
					whereClause.OR = searchConditions;
				}
			}

			if (filter) {
				const filterConditions = buildFilterConditions("AuditLogging", filter);
				if (filterConditions.length > 0) {
					whereClause.AND = filterConditions;
				}
			}
			const findManyQuery = buildFindManyQuery(whereClause, skip, limit, order, sort, fields);

			const [auditLoggings, total] = await Promise.all([
				document ? prisma.auditLogging.findMany(findManyQuery) : [],
				count ? prisma.auditLogging.count({ where: whereClause }) : 0,
			]);

			auditLoggingLogger.info(`Retrieved ${auditLoggings.length} auditLoggings`);
			const processedData =
				groupBy && document
					? groupDataByField(auditLoggings, groupBy as string)
					: auditLoggings;

			const responseData: Record<string, any> = {
				...(document && { auditLoggings: processedData }),
				...(count && { count: total }),
				...(pagination && { pagination: buildPagination(total, page, limit) }),
				...(groupBy && { groupedBy: groupBy }),
			};

			res.status(200).json(
				buildSuccessResponse(config.SUCCESS.AUDITLOGGING.RETRIEVED_ALL, responseData, 200),
			);
		} catch (error) {
			auditLoggingLogger.error(`${config.ERROR.AUDITLOGGING.GET_ALL_FAILED}: ${error}`);
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
				auditLoggingLogger.error(config.ERROR.QUERY_PARAMS.MISSING_ID);
				const errorResponse = buildErrorResponse(config.ERROR.QUERY_PARAMS.MISSING_ID, 400);
				res.status(400).json(errorResponse);
				return;
			}

			if (fields && typeof fields !== "string") {
				auditLoggingLogger.error(
					`${config.ERROR.QUERY_PARAMS.INVALID_POPULATE}: ${fields}`,
				);
				const errorResponse = buildErrorResponse(
					config.ERROR.QUERY_PARAMS.POPULATE_MUST_BE_STRING,
					400,
				);
				res.status(400).json(errorResponse);
				return;
			}

			auditLoggingLogger.info(`${config.SUCCESS.AUDITLOGGING.GETTING_BY_ID}: ${id}`);

			const cacheKey = `cache:auditLogging:byId:${id}:${fields || "full"}`;
			let auditLogging = null;

			try {
				if (redisClient.isClientConnected()) {
					auditLogging = await redisClient.getJSON(cacheKey);
					if (auditLogging) {
						auditLoggingLogger.info(
							`AuditLogging ${id} retrieved from direct Redis cache`,
						);
					}
				}
			} catch (cacheError) {
				auditLoggingLogger.warn(
					`Redis cache retrieval failed for auditLogging ${id}:`,
					cacheError,
				);
			}

			if (!auditLogging) {
				const query: Prisma.AuditLoggingFindFirstArgs = {
					where: { id },
				};

				query.select = getNestedFields(fields);

				auditLogging = await prisma.auditLogging.findFirst(query);

				if (auditLogging && redisClient.isClientConnected()) {
					try {
						await redisClient.setJSON(cacheKey, auditLogging, 3600);
						auditLoggingLogger.info(`AuditLogging ${id} stored in direct Redis cache`);
					} catch (cacheError) {
						auditLoggingLogger.warn(
							`Failed to store auditLogging ${id} in Redis cache:`,
							cacheError,
						);
					}
				}
			}

			if (!auditLogging) {
				auditLoggingLogger.error(`${config.ERROR.AUDITLOGGING.NOT_FOUND}: ${id}`);
				const errorResponse = buildErrorResponse(config.ERROR.AUDITLOGGING.NOT_FOUND, 404);
				res.status(404).json(errorResponse);
				return;
			}

			auditLoggingLogger.info(
				`${config.SUCCESS.AUDITLOGGING.RETRIEVED}: ${(auditLogging as any).id}`,
			);
			const successResponse = buildSuccessResponse(
				config.SUCCESS.AUDITLOGGING.RETRIEVED,
				auditLogging,
				200,
			);
			res.status(200).json(successResponse);
		} catch (error) {
			auditLoggingLogger.error(`${config.ERROR.AUDITLOGGING.ERROR_GETTING}: ${error}`);
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
				auditLoggingLogger.error(config.ERROR.QUERY_PARAMS.MISSING_ID);
				const errorResponse = buildErrorResponse(config.ERROR.QUERY_PARAMS.MISSING_ID, 400);
				res.status(400).json(errorResponse);
				return;
			}

			const validationResult = UpdateAuditLoggingSchema.safeParse(req.body);

			if (!validationResult.success) {
				const formattedErrors = formatZodErrors(validationResult.error.format());
				auditLoggingLogger.error(`Validation failed: ${JSON.stringify(formattedErrors)}`);
				const errorResponse = buildErrorResponse("Validation failed", 400, formattedErrors);
				res.status(400).json(errorResponse);
				return;
			}

			if (Object.keys(req.body).length === 0) {
				auditLoggingLogger.error(config.ERROR.COMMON.NO_UPDATE_FIELDS);
				const errorResponse = buildErrorResponse(config.ERROR.COMMON.NO_UPDATE_FIELDS, 400);
				res.status(400).json(errorResponse);
				return;
			}

			const validatedData = validationResult.data;

			auditLoggingLogger.info(`Updating auditLogging: ${id}`);

			const existingAuditLogging = await prisma.auditLogging.findFirst({
				where: { id },
			});

			if (!existingAuditLogging) {
				auditLoggingLogger.error(`${config.ERROR.AUDITLOGGING.NOT_FOUND}: ${id}`);
				const errorResponse = buildErrorResponse(config.ERROR.AUDITLOGGING.NOT_FOUND, 404);
				res.status(404).json(errorResponse);
				return;
			}

			const prismaData = { ...validatedData };

			const updatedAuditLogging = await prisma.auditLogging.update({
				where: { id },
				data: prismaData as Prisma.AuditLoggingUpdateInput,
			});

			try {
				await invalidateCache.byPattern(`cache:auditLogging:byId:${id}:*`);
				await invalidateCache.byPattern("cache:auditLogging:list:*");
				auditLoggingLogger.info(`Cache invalidated after auditLogging ${id} update`);
			} catch (cacheError) {
				auditLoggingLogger.warn(
					"Failed to invalidate cache after auditLogging update:",
					cacheError,
				);
			}

			auditLoggingLogger.info(
				`${config.SUCCESS.AUDITLOGGING.UPDATED}: ${updatedAuditLogging.id}`,
			);
			const successResponse = buildSuccessResponse(
				config.SUCCESS.AUDITLOGGING.UPDATED,
				{ auditLogging: updatedAuditLogging },
				200,
			);
			res.status(200).json(successResponse);
		} catch (error) {
			auditLoggingLogger.error(`${config.ERROR.AUDITLOGGING.ERROR_UPDATING}: ${error}`);
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
				auditLoggingLogger.error(config.ERROR.QUERY_PARAMS.MISSING_ID);
				const errorResponse = buildErrorResponse(config.ERROR.QUERY_PARAMS.MISSING_ID, 400);
				res.status(400).json(errorResponse);
				return;
			}

			auditLoggingLogger.info(`${config.SUCCESS.AUDITLOGGING.DELETED}: ${id}`);

			const existingAuditLogging = await prisma.auditLogging.findFirst({
				where: { id },
			});

			if (!existingAuditLogging) {
				auditLoggingLogger.error(`${config.ERROR.AUDITLOGGING.NOT_FOUND}: ${id}`);
				const errorResponse = buildErrorResponse(config.ERROR.AUDITLOGGING.NOT_FOUND, 404);
				res.status(404).json(errorResponse);
				return;
			}

			await prisma.auditLogging.delete({
				where: { id },
			});

			try {
				await invalidateCache.byPattern(`cache:auditLogging:byId:${id}:*`);
				await invalidateCache.byPattern("cache:auditLogging:list:*");
				auditLoggingLogger.info(`Cache invalidated after auditLogging ${id} deletion`);
			} catch (cacheError) {
				auditLoggingLogger.warn(
					"Failed to invalidate cache after auditLogging deletion:",
					cacheError,
				);
			}

			auditLoggingLogger.info(`${config.SUCCESS.AUDITLOGGING.DELETED}: ${id}`);
			const successResponse = buildSuccessResponse(
				config.SUCCESS.AUDITLOGGING.DELETED,
				{},
				200,
			);
			res.status(200).json(successResponse);
		} catch (error) {
			auditLoggingLogger.error(`${config.ERROR.AUDITLOGGING.DELETE_FAILED}: ${error}`);
			const errorResponse = buildErrorResponse(
				config.ERROR.COMMON.INTERNAL_SERVER_ERROR,
				500,
			);
			res.status(500).json(errorResponse);
		}
	};

	return { create, getAll, getById, update, remove };
};
