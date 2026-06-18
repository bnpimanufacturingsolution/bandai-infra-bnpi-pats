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
import { CreateSoalineitemSchema, UpdateSoalineitemSchema } from "../../zod/soalineitem.zod";
import { logActivity } from "../../utils/activityLogger";
import { logAudit } from "../../utils/auditLogger";
import { config } from "../../config/constant";
import { redisClient } from "../../config/redis";
import { invalidateCache } from "../../middleware/cache";

const logger = getLogger();
const soalineitemLogger = logger.child({ module: "soalineitem" });

export const controller = (prisma: PrismaClient) => {
	const roundToCent = (value: number) =>
		Math.round((value + Number.EPSILON) * 100) / 100;

	const toNumber = (value: unknown, fallback = 0) => {
		const parsed = Number(value);
		return Number.isFinite(parsed) ? parsed : fallback;
	};

	const normalizeCreateAmounts = (payload: Record<string, unknown>) => {
		const employeeShare = toNumber(payload.employeeShare, 0);
		const employerShare = toNumber(payload.employerShare, 0);
		const taxableAmount = toNumber(payload.taxableAmount, 0);
		const taxAmount = toNumber(payload.taxAmount, 0);
		const computedTotalAmount =
			payload.totalAmount !== undefined
				? toNumber(payload.totalAmount, employeeShare + employerShare)
				: employeeShare + employerShare;

		return {
			...payload,
			taxableAmount: roundToCent(taxableAmount),
			taxAmount: roundToCent(taxAmount),
			employeeShare: roundToCent(employeeShare),
			employerShare: roundToCent(employerShare),
			totalAmount: roundToCent(computedTotalAmount),
		};
	};

	const normalizeUpdateAmounts = (payload: Record<string, unknown>) => {
		const next = { ...payload } as Record<string, unknown>;
		const numericKeys = ["taxableAmount", "taxAmount", "employeeShare", "employerShare", "totalAmount"];

		for (const key of numericKeys) {
			if (next[key] !== undefined) {
				next[key] = roundToCent(toNumber(next[key], 0));
			}
		}

		const hasEmployeeShare = next.employeeShare !== undefined;
		const hasEmployerShare = next.employerShare !== undefined;
		const hasTotalAmount = next.totalAmount !== undefined;

		if (hasEmployeeShare && hasEmployerShare && !hasTotalAmount) {
			next.totalAmount = roundToCent(
				toNumber(next.employeeShare, 0) + toNumber(next.employerShare, 0),
			);
		}

		return next;
	};

	const recalculateStatementOfAccountTotals = async (statementOfAccountId: string) => {
		const [statement, lineItems] = await Promise.all([
			prisma.statementOfAccount.findFirst({
				where: { id: statementOfAccountId },
				select: { id: true, totalRemitted: true },
			}),
			prisma.sOALineItem.findMany({
				where: { statementOfAccountId },
				select: {
					employeeShare: true,
					employerShare: true,
					totalAmount: true,
					taxAmount: true,
				},
			} as any),
		]);

		if (!statement) return;

		const totals = (lineItems as any[]).reduce(
			(acc, item) => {
				acc.totalEmployeeShare += toNumber(item.employeeShare, 0);
				acc.totalEmployerShare += toNumber(item.employerShare, 0);
				acc.totalAmount += toNumber(item.totalAmount, 0);
				acc.totalTax += toNumber(item.taxAmount, 0);
				return acc;
			},
			{
				totalEmployeeShare: 0,
				totalEmployerShare: 0,
				totalAmount: 0,
				totalTax: 0,
			},
		);

		const totalEmployeeShare = roundToCent(totals.totalEmployeeShare);
		const totalEmployerShare = roundToCent(totals.totalEmployerShare);
		const totalAmount = roundToCent(totals.totalAmount);
		const totalTax = roundToCent(totals.totalTax);
		const totalRemitted = toNumber((statement as any).totalRemitted, 0);
		const totalOutstanding = roundToCent(totalAmount - totalRemitted);

		await prisma.statementOfAccount.update({
			where: { id: statementOfAccountId },
			data: {
				totalEmployeeShare,
				totalEmployerShare,
				totalTax,
				totalAmount,
				totalOutstanding,
			} as any,
		});

		await Promise.all([
			invalidateCache.byPattern(`cache:statementofaccount:byId:${statementOfAccountId}:*`),
			invalidateCache.byPattern("cache:statementofaccount:list:*"),
		]);
	};

	const create = async (req: Request, res: Response, _next: NextFunction) => {
		let requestData = req.body;
		const contentType = req.get("Content-Type") || "";

		if (
			contentType.includes("application/x-www-form-urlencoded") ||
			contentType.includes("multipart/form-data")
		) {
			soalineitemLogger.info("Original form data:", JSON.stringify(req.body, null, 2));
			requestData = transformFormDataToObject(req.body);
			soalineitemLogger.info(
				"Transformed form data to object structure:",
				JSON.stringify(requestData, null, 2),
			);
		}

		const validation = CreateSoalineitemSchema.safeParse(requestData);
		if (!validation.success) {
			const formattedErrors = formatZodErrors(validation.error.format());
			soalineitemLogger.error(`Validation failed: ${JSON.stringify(formattedErrors)}`);
			const errorResponse = buildErrorResponse("Validation failed", 400, formattedErrors);
			res.status(400).json(errorResponse);
			return;
		}

		try {
			const normalizedData = normalizeCreateAmounts(validation.data as Record<string, unknown>);
			const soalineitem = await prisma.sOALineItem.create({ data: normalizedData as any });
			soalineitemLogger.info(`Soalineitem created successfully: ${soalineitem.id}`);

			try {
				await recalculateStatementOfAccountTotals((soalineitem as any).statementOfAccountId);
			} catch (aggregationError) {
				soalineitemLogger.warn(
					`Failed to recalculate SOA totals after line item creation (${soalineitem.id}):`,
					aggregationError,
				);
			}

			logActivity(req, {
				userId: (req as any).user?.id || "unknown",
				action: config.ACTIVITY_LOG.SOALINEITEM.ACTIONS.CREATE_SOALINEITEM,
				description: `${config.ACTIVITY_LOG.SOALINEITEM.DESCRIPTIONS.SOALINEITEM_CREATED}: ${soalineitem.id}`,
				page: {
					url: req.originalUrl,
					title: config.ACTIVITY_LOG.SOALINEITEM.PAGES.SOALINEITEM_CREATION,
				},
			});

			logAudit(req, {
				userId: (req as any).user?.id || "unknown",
				action: config.AUDIT_LOG.ACTIONS.CREATE,
				resource: config.AUDIT_LOG.RESOURCES.SOALINEITEM,
				severity: config.AUDIT_LOG.SEVERITY.LOW,
				entityType: config.AUDIT_LOG.ENTITY_TYPES.SOALINEITEM,
				entityId: soalineitem.id,
				changesBefore: null,
				changesAfter: {
					id: soalineitem.id,
						category: soalineitem.category,
						description: soalineitem.description,
						createdAt: soalineitem.createdAt,
						updatedAt: soalineitem.updatedAt,
					},
					description: `${config.AUDIT_LOG.SOALINEITEM.DESCRIPTIONS.SOALINEITEM_CREATED}: ${soalineitem.id}`,
			});

			try {
				await invalidateCache.byPattern("cache:soalineitem:list:*");
				soalineitemLogger.info("Soalineitem list cache invalidated after creation");
			} catch (cacheError) {
				soalineitemLogger.warn(
					"Failed to invalidate cache after soalineitem creation:",
					cacheError,
				);
			}

			const successResponse = buildSuccessResponse(
				config.SUCCESS.SOALINEITEM.CREATED,
				soalineitem,
				201,
			);
			res.status(201).json(successResponse);
		} catch (error) {
			soalineitemLogger.error(`${config.ERROR.SOALINEITEM.CREATE_FAILED}: ${error}`);
			const errorResponse = buildErrorResponse(
				config.ERROR.COMMON.INTERNAL_SERVER_ERROR,
				500,
			);
			res.status(500).json(errorResponse);
		}
	};
	const getAll = async (req: Request, res: Response, _next: NextFunction) => {
		const validationResult = validateQueryParams(req, soalineitemLogger);

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

		soalineitemLogger.info(
			`Getting soalineitems, page: ${page}, limit: ${limit}, query: ${query}, order: ${order}, groupBy: ${groupBy}`,
		);

		try {
			// Base where clause
			const whereClause: Prisma.SOALineItemWhereInput = {};

			const searchFields = ["description", "category"];
			if (query) {
				const searchConditions = buildSearchConditions("Soalineitem", query, searchFields);
				if (searchConditions.length > 0) {
					whereClause.OR = searchConditions;
				}
			}

			if (filter) {
				const filterConditions = buildFilterConditions("Soalineitem", filter);
				if (filterConditions.length > 0) {
					whereClause.AND = filterConditions;
				}
			}
			const findManyQuery = buildFindManyQuery(whereClause, skip, limit, order, sort, fields);

			const [soalineitems, total] = await Promise.all([
				document ? prisma.sOALineItem.findMany(findManyQuery) : [],
				count ? prisma.sOALineItem.count({ where: whereClause }) : 0,
			]);

			soalineitemLogger.info(`Retrieved ${soalineitems.length} soalineitems`);
			const processedData =
				groupBy && document ? groupDataByField(soalineitems, groupBy as string) : soalineitems;

			const responseData: Record<string, any> = {
				...(document && { soalineitems: processedData }),
				...(count && { count: total }),
				...(pagination && { pagination: buildPagination(total, page, limit) }),
				...(groupBy && { groupedBy: groupBy }),
			};

			res.status(200).json(
				buildSuccessResponse(config.SUCCESS.SOALINEITEM.RETRIEVED_ALL, responseData, 200),
			);
		} catch (error) {
			soalineitemLogger.error(`${config.ERROR.SOALINEITEM.GET_ALL_FAILED}: ${error}`);
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
				soalineitemLogger.error(config.ERROR.QUERY_PARAMS.MISSING_ID);
				const errorResponse = buildErrorResponse(config.ERROR.QUERY_PARAMS.MISSING_ID, 400);
				res.status(400).json(errorResponse);
				return;
			}

			if (fields && typeof fields !== "string") {
				soalineitemLogger.error(`${config.ERROR.QUERY_PARAMS.INVALID_POPULATE}: ${fields}`);
				const errorResponse = buildErrorResponse(
					config.ERROR.QUERY_PARAMS.POPULATE_MUST_BE_STRING,
					400,
				);
				res.status(400).json(errorResponse);
				return;
			}

			soalineitemLogger.info(`${config.SUCCESS.SOALINEITEM.GETTING_BY_ID}: ${id}`);

			const cacheKey = `cache:soalineitem:byId:${id}:${fields || "full"}`;
			let soalineitem = null;

			try {
				if (redisClient.isClientConnected()) {
					soalineitem = await redisClient.getJSON(cacheKey);
					if (soalineitem) {
						soalineitemLogger.info(`Soalineitem ${id} retrieved from direct Redis cache`);
					}
				}
			} catch (cacheError) {
				soalineitemLogger.warn(`Redis cache retrieval failed for soalineitem ${id}:`, cacheError);
			}

			if (!soalineitem) {
				const query: Prisma.SOALineItemFindFirstArgs = {
					where: { id },
				};

				query.select = getNestedFields(fields);

				soalineitem = await prisma.sOALineItem.findFirst(query);

				if (soalineitem && redisClient.isClientConnected()) {
					try {
						await redisClient.setJSON(cacheKey, soalineitem, 3600);
						soalineitemLogger.info(`Soalineitem ${id} stored in direct Redis cache`);
					} catch (cacheError) {
						soalineitemLogger.warn(
							`Failed to store soalineitem ${id} in Redis cache:`,
							cacheError,
						);
					}
				}
			}

			if (!soalineitem) {
				soalineitemLogger.error(`${config.ERROR.SOALINEITEM.NOT_FOUND}: ${id}`);
				const errorResponse = buildErrorResponse(config.ERROR.SOALINEITEM.NOT_FOUND, 404);
				res.status(404).json(errorResponse);
				return;
			}

			soalineitemLogger.info(`${config.SUCCESS.SOALINEITEM.RETRIEVED}: ${(soalineitem as any).id}`);
			const successResponse = buildSuccessResponse(
				config.SUCCESS.SOALINEITEM.RETRIEVED,
				soalineitem,
				200,
			);
			res.status(200).json(successResponse);
		} catch (error) {
			soalineitemLogger.error(`${config.ERROR.SOALINEITEM.ERROR_GETTING}: ${error}`);
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
				soalineitemLogger.error(config.ERROR.QUERY_PARAMS.MISSING_ID);
				const errorResponse = buildErrorResponse(config.ERROR.QUERY_PARAMS.MISSING_ID, 400);
				res.status(400).json(errorResponse);
				return;
			}

			const validationResult = UpdateSoalineitemSchema.safeParse(req.body);

			if (!validationResult.success) {
				const formattedErrors = formatZodErrors(validationResult.error.format());
				soalineitemLogger.error(`Validation failed: ${JSON.stringify(formattedErrors)}`);
				const errorResponse = buildErrorResponse("Validation failed", 400, formattedErrors);
				res.status(400).json(errorResponse);
				return;
			}

			if (Object.keys(req.body).length === 0) {
				soalineitemLogger.error(config.ERROR.COMMON.NO_UPDATE_FIELDS);
				const errorResponse = buildErrorResponse(config.ERROR.COMMON.NO_UPDATE_FIELDS, 400);
				res.status(400).json(errorResponse);
				return;
			}

			const validatedData = validationResult.data;

			soalineitemLogger.info(`Updating soalineitem: ${id}`);

			const existingSoalineitem = await prisma.sOALineItem.findFirst({
				where: { id },
			});

			if (!existingSoalineitem) {
				soalineitemLogger.error(`${config.ERROR.SOALINEITEM.NOT_FOUND}: ${id}`);
				const errorResponse = buildErrorResponse(config.ERROR.SOALINEITEM.NOT_FOUND, 404);
				res.status(404).json(errorResponse);
				return;
			}

			const prismaData = normalizeUpdateAmounts(validatedData as Record<string, unknown>);
			const previousStatementOfAccountId = (existingSoalineitem as any).statementOfAccountId;

			const updatedSoalineitem = await prisma.sOALineItem.update({
				where: { id },
				data: prismaData as any,
			});

			try {
				const updatedStatementOfAccountId = (updatedSoalineitem as any).statementOfAccountId;
				await recalculateStatementOfAccountTotals(updatedStatementOfAccountId);
				if (
					previousStatementOfAccountId &&
					updatedStatementOfAccountId &&
					previousStatementOfAccountId !== updatedStatementOfAccountId
				) {
					await recalculateStatementOfAccountTotals(previousStatementOfAccountId);
				}
			} catch (aggregationError) {
				soalineitemLogger.warn(
					`Failed to recalculate SOA totals after line item update (${id}):`,
					aggregationError,
				);
			}

			try {
				await invalidateCache.byPattern(`cache:soalineitem:byId:${id}:*`);
				await invalidateCache.byPattern("cache:soalineitem:list:*");
				soalineitemLogger.info(`Cache invalidated after soalineitem ${id} update`);
			} catch (cacheError) {
				soalineitemLogger.warn(
					"Failed to invalidate cache after soalineitem update:",
					cacheError,
				);
			}

			soalineitemLogger.info(`${config.SUCCESS.SOALINEITEM.UPDATED}: ${updatedSoalineitem.id}`);
			const successResponse = buildSuccessResponse(
				config.SUCCESS.SOALINEITEM.UPDATED,
				{ soalineitem: updatedSoalineitem },
				200,
			);
			res.status(200).json(successResponse);
		} catch (error) {
			soalineitemLogger.error(`${config.ERROR.SOALINEITEM.ERROR_UPDATING}: ${error}`);
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
				soalineitemLogger.error(config.ERROR.QUERY_PARAMS.MISSING_ID);
				const errorResponse = buildErrorResponse(config.ERROR.QUERY_PARAMS.MISSING_ID, 400);
				res.status(400).json(errorResponse);
				return;
			}

			soalineitemLogger.info(`${config.SUCCESS.SOALINEITEM.DELETED}: ${id}`);

			const existingSoalineitem = await prisma.sOALineItem.findFirst({
				where: { id },
			});

			if (!existingSoalineitem) {
				soalineitemLogger.error(`${config.ERROR.SOALINEITEM.NOT_FOUND}: ${id}`);
				const errorResponse = buildErrorResponse(config.ERROR.SOALINEITEM.NOT_FOUND, 404);
				res.status(404).json(errorResponse);
				return;
			}

			await prisma.sOALineItem.delete({
				where: { id },
			});

			try {
				await recalculateStatementOfAccountTotals((existingSoalineitem as any).statementOfAccountId);
			} catch (aggregationError) {
				soalineitemLogger.warn(
					`Failed to recalculate SOA totals after line item deletion (${id}):`,
					aggregationError,
				);
			}

			try {
				await invalidateCache.byPattern(`cache:soalineitem:byId:${id}:*`);
				await invalidateCache.byPattern("cache:soalineitem:list:*");
				soalineitemLogger.info(`Cache invalidated after soalineitem ${id} deletion`);
			} catch (cacheError) {
				soalineitemLogger.warn(
					"Failed to invalidate cache after soalineitem deletion:",
					cacheError,
				);
			}

			soalineitemLogger.info(`${config.SUCCESS.SOALINEITEM.DELETED}: ${id}`);
			const successResponse = buildSuccessResponse(config.SUCCESS.SOALINEITEM.DELETED, {}, 200);
			res.status(200).json(successResponse);
		} catch (error) {
			soalineitemLogger.error(`${config.ERROR.SOALINEITEM.DELETE_FAILED}: ${error}`);
			const errorResponse = buildErrorResponse(
				config.ERROR.COMMON.INTERNAL_SERVER_ERROR,
				500,
			);
			res.status(500).json(errorResponse);
		}
	};

	return { create, getAll, getById, update, remove };
};
