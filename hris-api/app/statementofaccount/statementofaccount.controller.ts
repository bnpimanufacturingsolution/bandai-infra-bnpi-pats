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
import { CreateStatementofaccountSchema, UpdateStatementofaccountSchema } from "../../zod/statementofaccount.zod";
import { logActivity } from "../../utils/activityLogger";
import { logAudit } from "../../utils/auditLogger";
import { config } from "../../config/constant";
import { redisClient } from "../../config/redis";
import { invalidateCache } from "../../middleware/cache";

const logger = getLogger();
const statementofaccountLogger = logger.child({ module: "statementofaccount" });

export const controller = (prisma: PrismaClient) => {
	const create = async (req: Request, res: Response, _next: NextFunction) => {
		let requestData = req.body;
		const contentType = req.get("Content-Type") || "";

		if (
			contentType.includes("application/x-www-form-urlencoded") ||
			contentType.includes("multipart/form-data")
		) {
			statementofaccountLogger.info("Original form data:", JSON.stringify(req.body, null, 2));
			requestData = transformFormDataToObject(req.body);
			statementofaccountLogger.info(
				"Transformed form data to object structure:",
				JSON.stringify(requestData, null, 2),
			);
		}

		const validation = CreateStatementofaccountSchema.safeParse(requestData);
		if (!validation.success) {
			const formattedErrors = formatZodErrors(validation.error.format());
			statementofaccountLogger.error(`Validation failed: ${JSON.stringify(formattedErrors)}`);
			const errorResponse = buildErrorResponse("Validation failed", 400, formattedErrors);
			res.status(400).json(errorResponse);
			return;
		}

		try {
			const statementofaccount = await prisma.statementOfAccount.create({ data: validation.data });
			statementofaccountLogger.info(`Statementofaccount created successfully: ${statementofaccount.id}`);

			logActivity(req, {
				userId: (req as any).user?.id || "unknown",
				action: config.ACTIVITY_LOG.STATEMENTOFACCOUNT.ACTIONS.CREATE_STATEMENTOFACCOUNT,
				description: `${config.ACTIVITY_LOG.STATEMENTOFACCOUNT.DESCRIPTIONS.STATEMENTOFACCOUNT_CREATED}: ${statementofaccount.name || statementofaccount.id}`,
				page: {
					url: req.originalUrl,
					title: config.ACTIVITY_LOG.STATEMENTOFACCOUNT.PAGES.STATEMENTOFACCOUNT_CREATION,
				},
			});

			logAudit(req, {
				userId: (req as any).user?.id || "unknown",
				action: config.AUDIT_LOG.ACTIONS.CREATE,
				resource: config.AUDIT_LOG.RESOURCES.STATEMENTOFACCOUNT,
				severity: config.AUDIT_LOG.SEVERITY.LOW,
				entityType: config.AUDIT_LOG.ENTITY_TYPES.STATEMENTOFACCOUNT,
				entityId: statementofaccount.id,
				changesBefore: null,
				changesAfter: {
					id: statementofaccount.id,
					name: statementofaccount.name,
					description: statementofaccount.description,
					createdAt: statementofaccount.createdAt,
					updatedAt: statementofaccount.updatedAt,
				},
				description: `${config.AUDIT_LOG.STATEMENTOFACCOUNT.DESCRIPTIONS.STATEMENTOFACCOUNT_CREATED}: ${statementofaccount.name || statementofaccount.id}`,
			});

			try {
				await invalidateCache.byPattern("cache:statementofaccount:list:*");
				statementofaccountLogger.info("Statementofaccount list cache invalidated after creation");
			} catch (cacheError) {
				statementofaccountLogger.warn(
					"Failed to invalidate cache after statementofaccount creation:",
					cacheError,
				);
			}

			const successResponse = buildSuccessResponse(
				config.SUCCESS.STATEMENTOFACCOUNT.CREATED,
				statementofaccount,
				201,
			);
			res.status(201).json(successResponse);
		} catch (error) {
			statementofaccountLogger.error(`${config.ERROR.STATEMENTOFACCOUNT.CREATE_FAILED}: ${error}`);
			const errorResponse = buildErrorResponse(
				config.ERROR.COMMON.INTERNAL_SERVER_ERROR,
				500,
			);
			res.status(500).json(errorResponse);
		}
	};
	const getAll = async (req: Request, res: Response, _next: NextFunction) => {
		const validationResult = validateQueryParams(req, statementofaccountLogger);

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

		statementofaccountLogger.info(
			`Getting statementofaccounts, page: ${page}, limit: ${limit}, query: ${query}, order: ${order}, groupBy: ${groupBy}`,
		);

		try {
			// Base where clause
			const whereClause: Prisma.StatementOfAccountWhereInput = {
				isDeleted: false,
			};

			// search fields sample ("name", "description", "type")
			const searchFields = ["name", "description", "type"];
			if (query) {
				const searchConditions = buildSearchConditions("Statementofaccount", query, searchFields);
				if (searchConditions.length > 0) {
					whereClause.OR = searchConditions;
				}
			}

			if (filter) {
				const filterConditions = buildFilterConditions("Statementofaccount", filter);
				if (filterConditions.length > 0) {
					whereClause.AND = filterConditions;
				}
			}
			const findManyQuery = buildFindManyQuery(whereClause, skip, limit, order, sort, fields);

			const [statementofaccounts, total] = await Promise.all([
				document ? prisma.statementOfAccount.findMany(findManyQuery) : [],
				count ? prisma.statementOfAccount.count({ where: whereClause }) : 0,
			]);

			statementofaccountLogger.info(`Retrieved ${statementofaccounts.length} statementofaccounts`);
			const processedData =
				groupBy && document ? groupDataByField(statementofaccounts, groupBy as string) : statementofaccounts;

			const responseData: Record<string, any> = {
				...(document && { statementofaccounts: processedData }),
				...(count && { count: total }),
				...(pagination && { pagination: buildPagination(total, page, limit) }),
				...(groupBy && { groupedBy: groupBy }),
			};

			res.status(200).json(
				buildSuccessResponse(config.SUCCESS.STATEMENTOFACCOUNT.RETRIEVED_ALL, responseData, 200),
			);
		} catch (error) {
			statementofaccountLogger.error(`${config.ERROR.STATEMENTOFACCOUNT.GET_ALL_FAILED}: ${error}`);
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
				statementofaccountLogger.error(config.ERROR.QUERY_PARAMS.MISSING_ID);
				const errorResponse = buildErrorResponse(config.ERROR.QUERY_PARAMS.MISSING_ID, 400);
				res.status(400).json(errorResponse);
				return;
			}

			if (fields && typeof fields !== "string") {
				statementofaccountLogger.error(`${config.ERROR.QUERY_PARAMS.INVALID_POPULATE}: ${fields}`);
				const errorResponse = buildErrorResponse(
					config.ERROR.QUERY_PARAMS.POPULATE_MUST_BE_STRING,
					400,
				);
				res.status(400).json(errorResponse);
				return;
			}

			statementofaccountLogger.info(`${config.SUCCESS.STATEMENTOFACCOUNT.GETTING_BY_ID}: ${id}`);

			const cacheKey = `cache:statementofaccount:byId:${id}:${fields || "full"}`;
			let statementofaccount = null;

			try {
				if (redisClient.isClientConnected()) {
					statementofaccount = await redisClient.getJSON(cacheKey);
					if (statementofaccount) {
						statementofaccountLogger.info(`Statementofaccount ${id} retrieved from direct Redis cache`);
					}
				}
			} catch (cacheError) {
				statementofaccountLogger.warn(`Redis cache retrieval failed for statementofaccount ${id}:`, cacheError);
			}

			if (!statementofaccount) {
				const query: Prisma.StatementOfAccountFindFirstArgs = {
					where: { id },
				};

				query.select = getNestedFields(fields);

				statementofaccount = await prisma.statementOfAccount.findFirst(query);

				if (statementofaccount && redisClient.isClientConnected()) {
					try {
						await redisClient.setJSON(cacheKey, statementofaccount, 3600);
						statementofaccountLogger.info(`Statementofaccount ${id} stored in direct Redis cache`);
					} catch (cacheError) {
						statementofaccountLogger.warn(
							`Failed to store statementofaccount ${id} in Redis cache:`,
							cacheError,
						);
					}
				}
			}

			if (!statementofaccount) {
				statementofaccountLogger.error(`${config.ERROR.STATEMENTOFACCOUNT.NOT_FOUND}: ${id}`);
				const errorResponse = buildErrorResponse(config.ERROR.STATEMENTOFACCOUNT.NOT_FOUND, 404);
				res.status(404).json(errorResponse);
				return;
		}

			statementofaccountLogger.info(`${config.SUCCESS.STATEMENTOFACCOUNT.RETRIEVED}: ${(statementofaccount as any).id}`);
			const successResponse = buildSuccessResponse(
				config.SUCCESS.STATEMENTOFACCOUNT.RETRIEVED,
				statementofaccount,
				200,
			);
			res.status(200).json(successResponse);
		} catch (error) {
			statementofaccountLogger.error(`${config.ERROR.STATEMENTOFACCOUNT.ERROR_GETTING}: ${error}`);
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
				statementofaccountLogger.error(config.ERROR.QUERY_PARAMS.MISSING_ID);
				const errorResponse = buildErrorResponse(config.ERROR.QUERY_PARAMS.MISSING_ID, 400);
				res.status(400).json(errorResponse);
				return;
			}

			const validationResult = UpdateStatementofaccountSchema.safeParse(req.body);

			if (!validationResult.success) {
				const formattedErrors = formatZodErrors(validationResult.error.format());
				statementofaccountLogger.error(`Validation failed: ${JSON.stringify(formattedErrors)}`);
				const errorResponse = buildErrorResponse("Validation failed", 400, formattedErrors);
				res.status(400).json(errorResponse);
				return;
			}

			if (Object.keys(req.body).length === 0) {
				statementofaccountLogger.error(config.ERROR.COMMON.NO_UPDATE_FIELDS);
				const errorResponse = buildErrorResponse(config.ERROR.COMMON.NO_UPDATE_FIELDS, 400);
				res.status(400).json(errorResponse);
				return;
			}

			const validatedData = validationResult.data;

			statementofaccountLogger.info(`Updating statementofaccount: ${id}`);

			const existingStatementofaccount = await prisma.statementOfAccount.findFirst({
				where: { id },
			});

			if (!existingStatementofaccount) {
				statementofaccountLogger.error(`${config.ERROR.STATEMENTOFACCOUNT.NOT_FOUND}: ${id}`);
				const errorResponse = buildErrorResponse(config.ERROR.STATEMENTOFACCOUNT.NOT_FOUND, 404);
				res.status(404).json(errorResponse);
				return;
			}

			const prismaData = { ...validatedData };

			const updatedStatementofaccount = await prisma.statementOfAccount.update({
				where: { id },
				data: prismaData,
			});

			try {
				await invalidateCache.byPattern(`cache:statementofaccount:byId:${id}:*`);
				await invalidateCache.byPattern("cache:statementofaccount:list:*");
				statementofaccountLogger.info(`Cache invalidated after statementofaccount ${id} update`);
			} catch (cacheError) {
				statementofaccountLogger.warn(
					"Failed to invalidate cache after statementofaccount update:",
					cacheError,
				);
			}

			statementofaccountLogger.info(`${config.SUCCESS.STATEMENTOFACCOUNT.UPDATED}: ${updatedStatementofaccount.id}`);
			const successResponse = buildSuccessResponse(
				config.SUCCESS.STATEMENTOFACCOUNT.UPDATED,
				{ statementofaccount: updatedStatementofaccount },
				200,
			);
			res.status(200).json(successResponse);
		} catch (error) {
			statementofaccountLogger.error(`${config.ERROR.STATEMENTOFACCOUNT.ERROR_UPDATING}: ${error}`);
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
				statementofaccountLogger.error(config.ERROR.QUERY_PARAMS.MISSING_ID);
				const errorResponse = buildErrorResponse(config.ERROR.QUERY_PARAMS.MISSING_ID, 400);
				res.status(400).json(errorResponse);
				return;
			}

			statementofaccountLogger.info(`${config.SUCCESS.STATEMENTOFACCOUNT.DELETED}: ${id}`);

			const existingStatementofaccount = await prisma.statementOfAccount.findFirst({
				where: { id },
			});

			if (!existingStatementofaccount) {
				statementofaccountLogger.error(`${config.ERROR.STATEMENTOFACCOUNT.NOT_FOUND}: ${id}`);
				const errorResponse = buildErrorResponse(config.ERROR.STATEMENTOFACCOUNT.NOT_FOUND, 404);
				res.status(404).json(errorResponse);
				return;
			}

			await prisma.statementOfAccount.delete({
				where: { id },
			});

			try {
				await invalidateCache.byPattern(`cache:statementofaccount:byId:${id}:*`);
				await invalidateCache.byPattern("cache:statementofaccount:list:*");
				statementofaccountLogger.info(`Cache invalidated after statementofaccount ${id} deletion`);
			} catch (cacheError) {
				statementofaccountLogger.warn(
					"Failed to invalidate cache after statementofaccount deletion:",
					cacheError,
				);
			}

			statementofaccountLogger.info(`${config.SUCCESS.STATEMENTOFACCOUNT.DELETED}: ${id}`);
			const successResponse = buildSuccessResponse(config.SUCCESS.STATEMENTOFACCOUNT.DELETED, {}, 200);
			res.status(200).json(successResponse);
		} catch (error) {
			statementofaccountLogger.error(`${config.ERROR.STATEMENTOFACCOUNT.DELETE_FAILED}: ${error}`);
			const errorResponse = buildErrorResponse(
				config.ERROR.COMMON.INTERNAL_SERVER_ERROR,
				500,
			);
			res.status(500).json(errorResponse);
		}
	};

	return { create, getAll, getById, update, remove };
};
