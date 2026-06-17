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
	CreateRequestTransactionSchema,
	UpdateRequestTransactionSchema,
} from "../../zod/requestTransaction.zod";
import { logActivity } from "../../utils/activityLogger";
import { logAudit } from "../../utils/auditLogger";
import { config } from "../../config/constant";
import { redisClient } from "../../config/redis";
import { invalidateCache } from "../../middleware/cache";

const logger = getLogger();
const requestTransactionLogger = logger.child({ module: "requestTransaction" });

export const controller = (prisma: PrismaClient) => {
	const create = async (req: Request, res: Response, _next: NextFunction) => {
		let requestData = req.body;
		const contentType = req.get("Content-Type") || "";

		if (
			contentType.includes("application/x-www-form-urlencoded") ||
			contentType.includes("multipart/form-data")
		) {
			requestTransactionLogger.info("Original form data:", JSON.stringify(req.body, null, 2));
			requestData = transformFormDataToObject(req.body);
			requestTransactionLogger.info(
				"Transformed form data to object structure:",
				JSON.stringify(requestData, null, 2),
			);
		}

		const validation = CreateRequestTransactionSchema.safeParse(requestData);
		if (!validation.success) {
			const formattedErrors = formatZodErrors(validation.error.format());
			requestTransactionLogger.error(`Validation failed: ${JSON.stringify(formattedErrors)}`);
			const errorResponse = buildErrorResponse("Validation failed", 400, formattedErrors);
			res.status(400).json(errorResponse);
			return;
		}

		try {
			const requestTransaction = await prisma.requestTransaction.create({
				data: validation.data,
			});
			requestTransactionLogger.info(
				`RequestTransaction created successfully: ${requestTransaction.id}`,
			);

			logActivity(req, {
				userId: (req as any).user?.id || "unknown",
				action: config.ACTIVITY_LOG.REQUESTTRANSACTION.ACTIONS.CREATE_REQUESTTRANSACTION,
				description: `${config.ACTIVITY_LOG.REQUESTTRANSACTION.DESCRIPTIONS.REQUESTTRANSACTION_CREATED}: ${requestTransaction.title || requestTransaction.id}`,
				page: {
					url: req.originalUrl,
					title: config.ACTIVITY_LOG.REQUESTTRANSACTION.PAGES.REQUESTTRANSACTION_CREATION,
				},
			});

			logAudit(req, {
				userId: (req as any).user?.id || "unknown",
				action: config.AUDIT_LOG.ACTIONS.CREATE,
				resource: config.AUDIT_LOG.RESOURCES.REQUESTTRANSACTION,
				severity: config.AUDIT_LOG.SEVERITY.LOW,
				entityType: config.AUDIT_LOG.ENTITY_TYPES.REQUESTTRANSACTION,
				entityId: requestTransaction.id,
				changesBefore: null,
				changesAfter: {
					id: requestTransaction.id,
					title: requestTransaction.title,
					description: requestTransaction.description,
					createdAt: requestTransaction.createdAt,
					updatedAt: requestTransaction.updatedAt,
				},
				description: `${config.AUDIT_LOG.REQUESTTRANSACTION.DESCRIPTIONS.REQUESTTRANSACTION_CREATED}: ${requestTransaction.title || requestTransaction.id}`,
			});

			try {
				await invalidateCache.byPattern("cache:requestTransaction:list:*");
				requestTransactionLogger.info(
					"RequestTransaction list cache invalidated after creation",
				);
			} catch (cacheError) {
				requestTransactionLogger.warn(
					"Failed to invalidate cache after requestTransaction creation:",
					cacheError,
				);
			}

			const successResponse = buildSuccessResponse(
				config.SUCCESS.REQUESTTRANSACTION.CREATED,
				requestTransaction,
				201,
			);
			res.status(201).json(successResponse);
		} catch (error) {
			requestTransactionLogger.error(
				`${config.ERROR.REQUESTTRANSACTION.CREATE_FAILED}: ${error}`,
			);
			const errorResponse = buildErrorResponse(
				config.ERROR.COMMON.INTERNAL_SERVER_ERROR,
				500,
			);
			res.status(500).json(errorResponse);
		}
	};
	const getAll = async (req: Request, res: Response, _next: NextFunction) => {
		const validationResult = validateQueryParams(req, requestTransactionLogger);

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
		const searchFieldsParam =
			typeof req.query.searchFields === "string" && req.query.searchFields.trim().length > 0
				? req.query.searchFields
						.split(",")
						.map((field) => field.trim())
						.filter(Boolean)
				: [
						"title",
						"description",
						"comments",
						"eventKey",
						"actorDisplayName",
						"actorRole",
						"actorEmployee.employeeId",
						"actorEmployee.person.personalInfo.firstName",
						"actorEmployee.person.personalInfo.lastName",
						"request.code",
						"request.description",
						"request.requester.employeeId",
						"request.requester.person.personalInfo.firstName",
						"request.requester.person.personalInfo.lastName",
					];

		requestTransactionLogger.info(
			`Getting requestTransactions, page: ${page}, limit: ${limit}, query: ${query}, order: ${order}, groupBy: ${groupBy}`,
		);

		try {
			// Base where clause
			const whereClause: Prisma.RequestTransactionWhereInput = {};

			if (query) {
				const searchConditions = buildSearchConditions(
					"RequestTransaction",
					query,
					searchFieldsParam,
				);
				if (searchConditions.length > 0) {
					whereClause.OR = searchConditions;
				}
			}

			if (filter) {
				const filterConditions = buildFilterConditions("RequestTransaction", filter);
				if (filterConditions.length > 0) {
					whereClause.AND = filterConditions;
				}
			}
			const findManyQuery = buildFindManyQuery(whereClause, skip, limit, order, sort, fields);

			const [requestTransactions, total] = await Promise.all([
				document ? prisma.requestTransaction.findMany(findManyQuery) : [],
				count ? prisma.requestTransaction.count({ where: whereClause }) : 0,
			]);

			requestTransactionLogger.info(
				`Retrieved ${requestTransactions.length} requestTransactions`,
			);
			const processedData =
				groupBy && document
					? groupDataByField(requestTransactions, groupBy as string)
					: requestTransactions;

			const responseData: Record<string, any> = {
				...(document && { requestTransactions: processedData }),
				...(count && { count: total }),
				...(pagination && { pagination: buildPagination(total, page, limit) }),
				...(groupBy && { groupedBy: groupBy }),
			};

			res.status(200).json(
				buildSuccessResponse(
					config.SUCCESS.REQUESTTRANSACTION.RETRIEVED_ALL,
					responseData,
					200,
				),
			);
		} catch (error) {
			requestTransactionLogger.error(
				`${config.ERROR.REQUESTTRANSACTION.GET_ALL_FAILED}: ${error}`,
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
				requestTransactionLogger.error(config.ERROR.QUERY_PARAMS.MISSING_ID);
				const errorResponse = buildErrorResponse(config.ERROR.QUERY_PARAMS.MISSING_ID, 400);
				res.status(400).json(errorResponse);
				return;
			}

			if (fields && typeof fields !== "string") {
				requestTransactionLogger.error(
					`${config.ERROR.QUERY_PARAMS.INVALID_POPULATE}: ${fields}`,
				);
				const errorResponse = buildErrorResponse(
					config.ERROR.QUERY_PARAMS.POPULATE_MUST_BE_STRING,
					400,
				);
				res.status(400).json(errorResponse);
				return;
			}

			requestTransactionLogger.info(
				`${config.SUCCESS.REQUESTTRANSACTION.GETTING_BY_ID}: ${id}`,
			);

			const cacheKey = `cache:requestTransaction:byId:${id}:${fields || "full"}`;
			let requestTransaction = null;

			try {
				if (redisClient.isClientConnected()) {
					requestTransaction = await redisClient.getJSON(cacheKey);
					if (requestTransaction) {
						requestTransactionLogger.info(
							`RequestTransaction ${id} retrieved from direct Redis cache`,
						);
					}
				}
			} catch (cacheError) {
				requestTransactionLogger.warn(
					`Redis cache retrieval failed for requestTransaction ${id}:`,
					cacheError,
				);
			}

			if (!requestTransaction) {
				const query: Prisma.RequestTransactionFindFirstArgs = {
					where: { id },
				};

				query.select = getNestedFields(fields);

				requestTransaction = await prisma.requestTransaction.findFirst(query);

				if (requestTransaction && redisClient.isClientConnected()) {
					try {
						await redisClient.setJSON(cacheKey, requestTransaction, 3600);
						requestTransactionLogger.info(
							`RequestTransaction ${id} stored in direct Redis cache`,
						);
					} catch (cacheError) {
						requestTransactionLogger.warn(
							`Failed to store requestTransaction ${id} in Redis cache:`,
							cacheError,
						);
					}
				}
			}

			if (!requestTransaction) {
				requestTransactionLogger.error(
					`${config.ERROR.REQUESTTRANSACTION.NOT_FOUND}: ${id}`,
				);
				const errorResponse = buildErrorResponse(
					config.ERROR.REQUESTTRANSACTION.NOT_FOUND,
					404,
				);
				res.status(404).json(errorResponse);
				return;
			}

			requestTransactionLogger.info(
				`${config.SUCCESS.REQUESTTRANSACTION.RETRIEVED}: ${(requestTransaction as any).id}`,
			);
			const successResponse = buildSuccessResponse(
				config.SUCCESS.REQUESTTRANSACTION.RETRIEVED,
				requestTransaction,
				200,
			);
			res.status(200).json(successResponse);
		} catch (error) {
			requestTransactionLogger.error(
				`${config.ERROR.REQUESTTRANSACTION.ERROR_GETTING}: ${error}`,
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
				requestTransactionLogger.error(config.ERROR.QUERY_PARAMS.MISSING_ID);
				const errorResponse = buildErrorResponse(config.ERROR.QUERY_PARAMS.MISSING_ID, 400);
				res.status(400).json(errorResponse);
				return;
			}

			const validationResult = UpdateRequestTransactionSchema.safeParse(req.body);

			if (!validationResult.success) {
				const formattedErrors = formatZodErrors(validationResult.error.format());
				requestTransactionLogger.error(
					`Validation failed: ${JSON.stringify(formattedErrors)}`,
				);
				const errorResponse = buildErrorResponse("Validation failed", 400, formattedErrors);
				res.status(400).json(errorResponse);
				return;
			}

			if (Object.keys(req.body).length === 0) {
				requestTransactionLogger.error(config.ERROR.COMMON.NO_UPDATE_FIELDS);
				const errorResponse = buildErrorResponse(config.ERROR.COMMON.NO_UPDATE_FIELDS, 400);
				res.status(400).json(errorResponse);
				return;
			}

			const validatedData = validationResult.data;

			requestTransactionLogger.info(`Updating requestTransaction: ${id}`);

			const existingRequestTransaction = await prisma.requestTransaction.findFirst({
				where: { id },
			});

			if (!existingRequestTransaction) {
				requestTransactionLogger.error(
					`${config.ERROR.REQUESTTRANSACTION.NOT_FOUND}: ${id}`,
				);
				const errorResponse = buildErrorResponse(
					config.ERROR.REQUESTTRANSACTION.NOT_FOUND,
					404,
				);
				res.status(404).json(errorResponse);
				return;
			}

			const prismaData = { ...validatedData };

			const updatedRequestTransaction = await prisma.requestTransaction.update({
				where: { id },
				data: prismaData,
			});

			try {
				await invalidateCache.byPattern(`cache:requestTransaction:byId:${id}:*`);
				await invalidateCache.byPattern("cache:requestTransaction:list:*");
				requestTransactionLogger.info(
					`Cache invalidated after requestTransaction ${id} update`,
				);
			} catch (cacheError) {
				requestTransactionLogger.warn(
					"Failed to invalidate cache after requestTransaction update:",
					cacheError,
				);
			}

			requestTransactionLogger.info(
				`${config.SUCCESS.REQUESTTRANSACTION.UPDATED}: ${updatedRequestTransaction.id}`,
			);
			const successResponse = buildSuccessResponse(
				config.SUCCESS.REQUESTTRANSACTION.UPDATED,
				{ requestTransaction: updatedRequestTransaction },
				200,
			);
			res.status(200).json(successResponse);
		} catch (error) {
			requestTransactionLogger.error(
				`${config.ERROR.REQUESTTRANSACTION.ERROR_UPDATING}: ${error}`,
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
				requestTransactionLogger.error(config.ERROR.QUERY_PARAMS.MISSING_ID);
				const errorResponse = buildErrorResponse(config.ERROR.QUERY_PARAMS.MISSING_ID, 400);
				res.status(400).json(errorResponse);
				return;
			}

			requestTransactionLogger.info(`${config.SUCCESS.REQUESTTRANSACTION.DELETED}: ${id}`);

			const existingRequestTransaction = await prisma.requestTransaction.findFirst({
				where: { id },
			});

			if (!existingRequestTransaction) {
				requestTransactionLogger.error(
					`${config.ERROR.REQUESTTRANSACTION.NOT_FOUND}: ${id}`,
				);
				const errorResponse = buildErrorResponse(
					config.ERROR.REQUESTTRANSACTION.NOT_FOUND,
					404,
				);
				res.status(404).json(errorResponse);
				return;
			}

			await prisma.requestTransaction.delete({
				where: { id },
			});

			try {
				await invalidateCache.byPattern(`cache:requestTransaction:byId:${id}:*`);
				await invalidateCache.byPattern("cache:requestTransaction:list:*");
				requestTransactionLogger.info(
					`Cache invalidated after requestTransaction ${id} deletion`,
				);
			} catch (cacheError) {
				requestTransactionLogger.warn(
					"Failed to invalidate cache after requestTransaction deletion:",
					cacheError,
				);
			}

			requestTransactionLogger.info(`${config.SUCCESS.REQUESTTRANSACTION.DELETED}: ${id}`);
			const successResponse = buildSuccessResponse(
				config.SUCCESS.REQUESTTRANSACTION.DELETED,
				{},
				200,
			);
			res.status(200).json(successResponse);
		} catch (error) {
			requestTransactionLogger.error(
				`${config.ERROR.REQUESTTRANSACTION.DELETE_FAILED}: ${error}`,
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
