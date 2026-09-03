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
import { CreateRuleSchema, UpdateRuleSchema } from "../../zod/rule.zod";
import { logActivity } from "../../utils/activityLogger";
import { logAudit } from "../../utils/auditLogger";
import { config } from "../../config/constant";
import { redisClient } from "../../config/redis";
import { invalidateCache } from "../../middleware/cache";

const logger = getLogger();
const RuleLogger = logger.child({ module: "Rule" });

export const controller = (prisma: PrismaClient) => {
	const create = async (req: Request, res: Response, _next: NextFunction) => {
		let requestData = req.body;
		const contentType = req.get("Content-Type") || "";

		if (
			contentType.includes("application/x-www-form-urlencoded") ||
			contentType.includes("multipart/form-data")
		) {
			RuleLogger.info("Original form data:", JSON.stringify(req.body, null, 2));
			requestData = transformFormDataToObject(req.body);
			RuleLogger.info(
				"Transformed form data to object structure:",
				JSON.stringify(requestData, null, 2),
			);
		}

		const validation = CreateRuleSchema.safeParse(requestData);
		if (!validation.success) {
			const formattedErrors = formatZodErrors(validation.error.format());
			RuleLogger.error(`Validation failed: ${JSON.stringify(formattedErrors)}`);
			const errorResponse = buildErrorResponse("Validation failed", 400, formattedErrors);
			res.status(400).json(errorResponse);
			return;
		}

		try {
			const Rule = await prisma.rule.create({ data: validation.data });
			RuleLogger.info(`Rule created successfully: ${Rule.id}`);

			logActivity(req, {
				userId: (req as any).user?.id || "unknown",
				action: config.ACTIVITY_LOG.RULE.ACTIONS.CREATE_RULE,
				description: `${config.ACTIVITY_LOG.RULE.DESCRIPTIONS.RULE_CREATED}: ${Rule.title || Rule.id}`,
				page: {
					url: req.originalUrl,
					title: config.ACTIVITY_LOG.RULE.PAGES.RULE_CREATION,
				},
			});

			logAudit(req, {
				userId: (req as any).user?.id || "unknown",
				action: config.AUDIT_LOG.ACTIONS.CREATE,
				resource: config.AUDIT_LOG.RESOURCES.RULE,
				severity: config.AUDIT_LOG.SEVERITY.LOW,
				entityType: config.AUDIT_LOG.ENTITY_TYPES.RULE,
				entityId: Rule.id,
				changesBefore: null,
				changesAfter: {
					id: Rule.id,
					title: Rule.title,
					description: Rule.description,
					createdAt: Rule.createdAt,
					updatedAt: Rule.updatedAt,
				},
				description: `${config.AUDIT_LOG.RULE.DESCRIPTIONS.RULE_CREATED}: ${Rule.title || Rule.id}`,
			});

			try {
				await invalidateCache.byPattern("cache:Rule:list:*");
				RuleLogger.info("Rule list cache invalidated after creation");
			} catch (cacheError) {
				RuleLogger.warn("Failed to invalidate cache after Rule creation:", cacheError);
			}

			const successResponse = buildSuccessResponse(config.SUCCESS.RULE.CREATED, Rule, 201);
			res.status(201).json(successResponse);
		} catch (error) {
			RuleLogger.error(`${config.ERROR.RULE.CREATE_FAILED}: ${error}`);
			const errorResponse = buildErrorResponse(
				config.ERROR.COMMON.INTERNAL_SERVER_ERROR,
				500,
			);
			res.status(500).json(errorResponse);
		}
	};
	const getAll = async (req: Request, res: Response, _next: NextFunction) => {
		const validationResult = validateQueryParams(req, RuleLogger);

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

		RuleLogger.info(
			`Getting Rules, page: ${page}, limit: ${limit}, query: ${query}, order: ${order}, groupBy: ${groupBy}`,
		);

		try {
			// Base where clause
			const whereClause: Prisma.RuleWhereInput = {
				isDeleted: false,
			};

			// search fields sample ("name", "description", "type")
			const searchFields = ["name", "description", "type"];
			if (query) {
				const searchConditions = buildSearchConditions("Rule", query, searchFields);
				if (searchConditions.length > 0) {
					whereClause.OR = searchConditions;
				}
			}

			if (filter) {
				const filterConditions = buildFilterConditions("Rule", filter);
				if (filterConditions.length > 0) {
					whereClause.AND = filterConditions;
				}
			}
			const findManyQuery = buildFindManyQuery(whereClause, skip, limit, order, sort, fields);

			const [Rules, total] = await Promise.all([
				document ? prisma.rule.findMany(findManyQuery) : [],
				count ? prisma.rule.count({ where: whereClause }) : 0,
			]);

			RuleLogger.info(`Retrieved ${Rules.length} Rules`);
			const processedData =
				groupBy && document ? groupDataByField(Rules, groupBy as string) : Rules;

			const responseData: Record<string, any> = {
				...(document && { Rules: processedData }),
				...(count && { count: total }),
				...(pagination && { pagination: buildPagination(total, page, limit) }),
				...(groupBy && { groupedBy: groupBy }),
			};

			res.status(200).json(
				buildSuccessResponse(config.SUCCESS.RULE.RETRIEVED_ALL, responseData, 200),
			);
		} catch (error) {
			RuleLogger.error(`${config.ERROR.RULE.GET_ALL_FAILED}: ${error}`);
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
				RuleLogger.error(config.ERROR.QUERY_PARAMS.MISSING_ID);
				const errorResponse = buildErrorResponse(config.ERROR.QUERY_PARAMS.MISSING_ID, 400);
				res.status(400).json(errorResponse);
				return;
			}

			if (fields && typeof fields !== "string") {
				RuleLogger.error(`${config.ERROR.QUERY_PARAMS.INVALID_POPULATE}: ${fields}`);
				const errorResponse = buildErrorResponse(
					config.ERROR.QUERY_PARAMS.POPULATE_MUST_BE_STRING,
					400,
				);
				res.status(400).json(errorResponse);
				return;
			}

			RuleLogger.info(`${config.SUCCESS.RULE.GETTING_BY_ID}: ${id}`);

			const cacheKey = `cache:Rule:byId:${id}:${fields || "full"}`;
			let Rule = null;

			try {
				if (redisClient.isClientConnected()) {
					Rule = await redisClient.getJSON(cacheKey);
					if (Rule) {
						RuleLogger.info(`Rule ${id} retrieved from direct Redis cache`);
					}
				}
			} catch (cacheError) {
				RuleLogger.warn(`Redis cache retrieval failed for Rule ${id}:`, cacheError);
			}

			if (!Rule) {
				const query: Prisma.RuleFindFirstArgs = {
					where: { id },
				};

				query.select = getNestedFields(fields);

				Rule = await prisma.rule.findFirst(query);

				if (Rule && redisClient.isClientConnected()) {
					try {
						await redisClient.setJSON(cacheKey, Rule, 3600);
						RuleLogger.info(`Rule ${id} stored in direct Redis cache`);
					} catch (cacheError) {
						RuleLogger.warn(`Failed to store Rule ${id} in Redis cache:`, cacheError);
					}
				}
			}

			if (!Rule) {
				RuleLogger.error(`${config.ERROR.RULE.NOT_FOUND}: ${id}`);
				const errorResponse = buildErrorResponse(config.ERROR.RULE.NOT_FOUND, 404);
				res.status(404).json(errorResponse);
				return;
			}

			RuleLogger.info(`${config.SUCCESS.RULE.RETRIEVED}: ${(Rule as any).id}`);
			const successResponse = buildSuccessResponse(config.SUCCESS.RULE.RETRIEVED, Rule, 200);
			res.status(200).json(successResponse);
		} catch (error) {
			RuleLogger.error(`${config.ERROR.RULE.ERROR_GETTING}: ${error}`);
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
				RuleLogger.error(config.ERROR.QUERY_PARAMS.MISSING_ID);
				const errorResponse = buildErrorResponse(config.ERROR.QUERY_PARAMS.MISSING_ID, 400);
				res.status(400).json(errorResponse);
				return;
			}

			const validationResult = UpdateRuleSchema.safeParse(req.body);

			if (!validationResult.success) {
				const formattedErrors = formatZodErrors(validationResult.error.format());
				RuleLogger.error(`Validation failed: ${JSON.stringify(formattedErrors)}`);
				const errorResponse = buildErrorResponse("Validation failed", 400, formattedErrors);
				res.status(400).json(errorResponse);
				return;
			}

			if (Object.keys(req.body).length === 0) {
				RuleLogger.error(config.ERROR.COMMON.NO_UPDATE_FIELDS);
				const errorResponse = buildErrorResponse(config.ERROR.COMMON.NO_UPDATE_FIELDS, 400);
				res.status(400).json(errorResponse);
				return;
			}

			const validatedData = validationResult.data;

			RuleLogger.info(`Updating Rule: ${id}`);

			const existingRule = await prisma.rule.findFirst({
				where: { id },
			});

			if (!existingRule) {
				RuleLogger.error(`${config.ERROR.RULE.NOT_FOUND}: ${id}`);
				const errorResponse = buildErrorResponse(config.ERROR.RULE.NOT_FOUND, 404);
				res.status(404).json(errorResponse);
				return;
			}

			const prismaData = { ...validatedData };

			const updatedRule = await prisma.rule.update({
				where: { id },
				data: prismaData,
			});

			try {
				await invalidateCache.byPattern(`cache:Rule:byId:${id}:*`);
				await invalidateCache.byPattern("cache:Rule:list:*");
				RuleLogger.info(`Cache invalidated after Rule ${id} update`);
			} catch (cacheError) {
				RuleLogger.warn("Failed to invalidate cache after Rule update:", cacheError);
			}

			RuleLogger.info(`${config.SUCCESS.RULE.UPDATED}: ${updatedRule.id}`);
			const successResponse = buildSuccessResponse(
				config.SUCCESS.RULE.UPDATED,
				{ Rule: updatedRule },
				200,
			);
			res.status(200).json(successResponse);
		} catch (error) {
			RuleLogger.error(`${config.ERROR.RULE.ERROR_UPDATING}: ${error}`);
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
				RuleLogger.error(config.ERROR.QUERY_PARAMS.MISSING_ID);
				const errorResponse = buildErrorResponse(config.ERROR.QUERY_PARAMS.MISSING_ID, 400);
				res.status(400).json(errorResponse);
				return;
			}

			RuleLogger.info(`${config.SUCCESS.RULE.DELETED}: ${id}`);

			const existingRule = await prisma.rule.findFirst({
				where: { id },
			});

			if (!existingRule) {
				RuleLogger.error(`${config.ERROR.RULE.NOT_FOUND}: ${id}`);
				const errorResponse = buildErrorResponse(config.ERROR.RULE.NOT_FOUND, 404);
				res.status(404).json(errorResponse);
				return;
			}

			await prisma.rule.delete({
				where: { id },
			});

			try {
				await invalidateCache.byPattern(`cache:Rule:byId:${id}:*`);
				await invalidateCache.byPattern("cache:Rule:list:*");
				RuleLogger.info(`Cache invalidated after Rule ${id} deletion`);
			} catch (cacheError) {
				RuleLogger.warn("Failed to invalidate cache after Rule deletion:", cacheError);
			}

			RuleLogger.info(`${config.SUCCESS.RULE.DELETED}: ${id}`);
			const successResponse = buildSuccessResponse(config.SUCCESS.RULE.DELETED, {}, 200);
			res.status(200).json(successResponse);
		} catch (error) {
			RuleLogger.error(`${config.ERROR.RULE.DELETE_FAILED}: ${error}`);
			const errorResponse = buildErrorResponse(
				config.ERROR.COMMON.INTERNAL_SERVER_ERROR,
				500,
			);
			res.status(500).json(errorResponse);
		}
	};

	return { create, getAll, getById, update, remove };
};
