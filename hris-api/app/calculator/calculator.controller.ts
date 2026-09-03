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
import { CreateCalculatorSchema, UpdateCalculatorSchema } from "../../zod/calculator.zod";
import { logActivity } from "../../utils/activityLogger";
import { logAudit } from "../../utils/auditLogger";
import { config } from "../../config/constant";
import { redisClient } from "../../config/redis";
import { invalidateCache } from "../../middleware/cache";

const logger = getLogger();
const calculatorLogger = logger.child({ module: "calculator" });

export const controller = (prisma: PrismaClient) => {
	const create = async (req: Request, res: Response, _next: NextFunction) => {
		let requestData = req.body;
		const contentType = req.get("Content-Type") || "";

		if (
			contentType.includes("application/x-www-form-urlencoded") ||
			contentType.includes("multipart/form-data")
		) {
			calculatorLogger.info("Original form data:", JSON.stringify(req.body, null, 2));
			requestData = transformFormDataToObject(req.body);
			calculatorLogger.info(
				"Transformed form data to object structure:",
				JSON.stringify(requestData, null, 2),
			);
		}

		const validation = CreateCalculatorSchema.safeParse(requestData);
		if (!validation.success) {
			const formattedErrors = formatZodErrors(validation.error.format());
			calculatorLogger.error(`Validation failed: ${JSON.stringify(formattedErrors)}`);
			const errorResponse = buildErrorResponse("Validation failed", 400, formattedErrors);
			res.status(400).json(errorResponse);
			return;
		}

		try {
			const calculator = await prisma.calculator.create({ data: validation.data });
			calculatorLogger.info(`Calculator created successfully: ${calculator.id}`);

			logActivity(req, {
				userId: (req as any).user?.id || "unknown",
				action: config.ACTIVITY_LOG.CALCULATOR.ACTIONS.CREATE_CALCULATOR,
				description: `${config.ACTIVITY_LOG.CALCULATOR.DESCRIPTIONS.CALCULATOR_CREATED}: ${calculator.name || calculator.id}`,
				page: {
					url: req.originalUrl,
					title: config.ACTIVITY_LOG.CALCULATOR.PAGES.CALCULATOR_CREATION,
				},
			});

			logAudit(req, {
				userId: (req as any).user?.id || "unknown",
				action: config.AUDIT_LOG.ACTIONS.CREATE,
				resource: config.AUDIT_LOG.RESOURCES.CALCULATOR,
				severity: config.AUDIT_LOG.SEVERITY.LOW,
				entityType: config.AUDIT_LOG.ENTITY_TYPES.CALCULATOR,
				entityId: calculator.id,
				changesBefore: null,
				changesAfter: {
					id: calculator.id,
					name: calculator.name,
					description: calculator.description,
					createdAt: calculator.createdAt,
					updatedAt: calculator.updatedAt,
				},
				description: `${config.AUDIT_LOG.CALCULATOR.DESCRIPTIONS.CALCULATOR_CREATED}: ${calculator.name || calculator.id}`,
			});

			try {
				await invalidateCache.byPattern("cache:calculator:list:*");
				calculatorLogger.info("Calculator list cache invalidated after creation");
			} catch (cacheError) {
				calculatorLogger.warn(
					"Failed to invalidate cache after calculator creation:",
					cacheError,
				);
			}

			const successResponse = buildSuccessResponse(
				config.SUCCESS.CALCULATOR.CREATED,
				calculator,
				201,
			);
			res.status(201).json(successResponse);
		} catch (error) {
			calculatorLogger.error(`${config.ERROR.CALCULATOR.CREATE_FAILED}: ${error}`);
			const errorResponse = buildErrorResponse(
				config.ERROR.COMMON.INTERNAL_SERVER_ERROR,
				500,
			);
			res.status(500).json(errorResponse);
		}
	};
	const getAll = async (req: Request, res: Response, _next: NextFunction) => {
		const validationResult = validateQueryParams(req, calculatorLogger);

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

		calculatorLogger.info(
			`Getting calculators, page: ${page}, limit: ${limit}, query: ${query}, order: ${order}, groupBy: ${groupBy}`,
		);

		try {
			// Base where clause
			const whereClause: Prisma.CalculatorWhereInput = {
				isDeleted: false,
			};

			// search fields sample ("code", "name", "description", "type")
			const searchFields = ["code", "name", "description", "type"];
			if (query) {
				const searchConditions = buildSearchConditions("Calculator", query, searchFields);
				if (searchConditions.length > 0) {
					whereClause.OR = searchConditions;
				}
			}

			if (filter) {
				const filterConditions = buildFilterConditions("Calculator", filter);
				if (filterConditions.length > 0) {
					whereClause.AND = filterConditions;
				}
			}
			const findManyQuery = buildFindManyQuery(whereClause, skip, limit, order, sort, fields);

			const [calculators, total] = await Promise.all([
				document ? prisma.calculator.findMany(findManyQuery) : [],
				count ? prisma.calculator.count({ where: whereClause }) : 0,
			]);

			calculatorLogger.info(`Retrieved ${calculators.length} calculators`);
			const processedData =
				groupBy && document
					? groupDataByField(calculators, groupBy as string)
					: calculators;

			const responseData: Record<string, any> = {
				...(document && { calculators: processedData }),
				...(count && { count: total }),
				...(pagination && { pagination: buildPagination(total, page, limit) }),
				...(groupBy && { groupedBy: groupBy }),
			};

			res.status(200).json(
				buildSuccessResponse(config.SUCCESS.CALCULATOR.RETRIEVED_ALL, responseData, 200),
			);
		} catch (error) {
			calculatorLogger.error(`${config.ERROR.CALCULATOR.GET_ALL_FAILED}: ${error}`);
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
				calculatorLogger.error(config.ERROR.QUERY_PARAMS.MISSING_ID);
				const errorResponse = buildErrorResponse(config.ERROR.QUERY_PARAMS.MISSING_ID, 400);
				res.status(400).json(errorResponse);
				return;
			}

			if (fields && typeof fields !== "string") {
				calculatorLogger.error(`${config.ERROR.QUERY_PARAMS.INVALID_POPULATE}: ${fields}`);
				const errorResponse = buildErrorResponse(
					config.ERROR.QUERY_PARAMS.POPULATE_MUST_BE_STRING,
					400,
				);
				res.status(400).json(errorResponse);
				return;
			}

			calculatorLogger.info(`${config.SUCCESS.CALCULATOR.GETTING_BY_ID}: ${id} (id or code)`);

			const cacheKey = `cache:calculator:byIdentifier:${id}:${fields || "full"}`;
			let calculator = null;

			try {
				if (redisClient.isClientConnected()) {
					calculator = await redisClient.getJSON(cacheKey);
					if (calculator) {
						calculatorLogger.info(`Calculator ${id} retrieved from direct Redis cache`);
					}
				}
			} catch (cacheError) {
				calculatorLogger.warn(
					`Redis cache retrieval failed for calculator ${id}:`,
					cacheError,
				);
			}

			if (!calculator) {
				const select = getNestedFields(fields);
				calculator = await prisma.calculator.findFirst({
					where: {
						isDeleted: false,
						OR: [{ id }, { code: id }],
					},
					select,
				});

				if (calculator && redisClient.isClientConnected()) {
					try {
						// Store under the identifier used (id or code)
						await redisClient.setJSON(cacheKey, calculator, 3600);

						// Also store canonical keys for better invalidation/hit rate
						const canonicalId = (calculator as any)?.id;
						const canonicalCode = (calculator as any)?.code;
						if (canonicalId && typeof canonicalId === "string") {
							await redisClient.setJSON(
								`cache:calculator:byId:${canonicalId}:${fields || "full"}`,
								calculator,
								3600,
							);
						}
						if (canonicalCode && typeof canonicalCode === "string") {
							await redisClient.setJSON(
								`cache:calculator:byCode:${canonicalCode}:${fields || "full"}`,
								calculator,
								3600,
							);
						}

						calculatorLogger.info(
							`Calculator ${id} stored in direct Redis cache (identifier + canonical keys)`,
						);
					} catch (cacheError) {
						calculatorLogger.warn(
							`Failed to store calculator ${id} in Redis cache:`,
							cacheError,
						);
					}
				}
			}

			if (!calculator) {
				calculatorLogger.error(`${config.ERROR.CALCULATOR.NOT_FOUND}: ${id}`);
				const errorResponse = buildErrorResponse(config.ERROR.CALCULATOR.NOT_FOUND, 404);
				res.status(404).json(errorResponse);
				return;
			}

			calculatorLogger.info(
				`${config.SUCCESS.CALCULATOR.RETRIEVED}: ${(calculator as any).id}`,
			);
			const successResponse = buildSuccessResponse(
				config.SUCCESS.CALCULATOR.RETRIEVED,
				calculator,
				200,
			);
			res.status(200).json(successResponse);
		} catch (error) {
			calculatorLogger.error(`${config.ERROR.CALCULATOR.ERROR_GETTING}: ${error}`);
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
				calculatorLogger.error(config.ERROR.QUERY_PARAMS.MISSING_ID);
				const errorResponse = buildErrorResponse(config.ERROR.QUERY_PARAMS.MISSING_ID, 400);
				res.status(400).json(errorResponse);
				return;
			}

			const validationResult = UpdateCalculatorSchema.safeParse(req.body);

			if (!validationResult.success) {
				const formattedErrors = formatZodErrors(validationResult.error.format());
				calculatorLogger.error(`Validation failed: ${JSON.stringify(formattedErrors)}`);
				const errorResponse = buildErrorResponse("Validation failed", 400, formattedErrors);
				res.status(400).json(errorResponse);
				return;
			}

			if (Object.keys(req.body).length === 0) {
				calculatorLogger.error(config.ERROR.COMMON.NO_UPDATE_FIELDS);
				const errorResponse = buildErrorResponse(config.ERROR.COMMON.NO_UPDATE_FIELDS, 400);
				res.status(400).json(errorResponse);
				return;
			}

			const validatedData = validationResult.data;

			calculatorLogger.info(`Updating calculator: ${id}`);

			const existingCalculator = await prisma.calculator.findFirst({
				where: { id },
			});

			if (!existingCalculator) {
				calculatorLogger.error(`${config.ERROR.CALCULATOR.NOT_FOUND}: ${id}`);
				const errorResponse = buildErrorResponse(config.ERROR.CALCULATOR.NOT_FOUND, 404);
				res.status(404).json(errorResponse);
				return;
			}

			const prismaData = { ...validatedData };

			const updatedCalculator = await prisma.calculator.update({
				where: { id },
				data: prismaData,
			});

			try {
				await invalidateCache.byPattern(`cache:calculator:byId:${id}:*`);
				await invalidateCache.byPattern("cache:calculator:list:*");
				calculatorLogger.info(`Cache invalidated after calculator ${id} update`);
			} catch (cacheError) {
				calculatorLogger.warn(
					"Failed to invalidate cache after calculator update:",
					cacheError,
				);
			}

			calculatorLogger.info(`${config.SUCCESS.CALCULATOR.UPDATED}: ${updatedCalculator.id}`);
			const successResponse = buildSuccessResponse(
				config.SUCCESS.CALCULATOR.UPDATED,
				{ calculator: updatedCalculator },
				200,
			);
			res.status(200).json(successResponse);
		} catch (error) {
			calculatorLogger.error(`${config.ERROR.CALCULATOR.ERROR_UPDATING}: ${error}`);
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
				calculatorLogger.error(config.ERROR.QUERY_PARAMS.MISSING_ID);
				const errorResponse = buildErrorResponse(config.ERROR.QUERY_PARAMS.MISSING_ID, 400);
				res.status(400).json(errorResponse);
				return;
			}

			calculatorLogger.info(`${config.SUCCESS.CALCULATOR.DELETED}: ${id}`);

			const existingCalculator = await prisma.calculator.findFirst({
				where: { id },
			});

			if (!existingCalculator) {
				calculatorLogger.error(`${config.ERROR.CALCULATOR.NOT_FOUND}: ${id}`);
				const errorResponse = buildErrorResponse(config.ERROR.CALCULATOR.NOT_FOUND, 404);
				res.status(404).json(errorResponse);
				return;
			}

			await prisma.calculator.delete({
				where: { id },
			});

			try {
				await invalidateCache.byPattern(`cache:calculator:byId:${id}:*`);
				await invalidateCache.byPattern("cache:calculator:list:*");
				calculatorLogger.info(`Cache invalidated after calculator ${id} deletion`);
			} catch (cacheError) {
				calculatorLogger.warn(
					"Failed to invalidate cache after calculator deletion:",
					cacheError,
				);
			}

			calculatorLogger.info(`${config.SUCCESS.CALCULATOR.DELETED}: ${id}`);
			const successResponse = buildSuccessResponse(
				config.SUCCESS.CALCULATOR.DELETED,
				{},
				200,
			);
			res.status(200).json(successResponse);
		} catch (error) {
			calculatorLogger.error(`${config.ERROR.CALCULATOR.DELETE_FAILED}: ${error}`);
			const errorResponse = buildErrorResponse(
				config.ERROR.COMMON.INTERNAL_SERVER_ERROR,
				500,
			);
			res.status(500).json(errorResponse);
		}
	};

	return { create, getAll, getById, update, remove };
};
