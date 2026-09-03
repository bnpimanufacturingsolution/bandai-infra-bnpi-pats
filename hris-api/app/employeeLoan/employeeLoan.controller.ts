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
import { CreateEmployeeLoanSchema, UpdateEmployeeLoanSchema } from "../../zod/employeeloan.zod";

const logger = getLogger();
const employeeLoanLogger = logger.child({ module: "employeeLoan" });

export const controller = (prisma: PrismaClient) => {
	const create = async (req: Request, res: Response, _next: NextFunction) => {
		let requestData = req.body;
		const contentType = req.get("Content-Type") || "";

		if (
			contentType.includes("application/x-www-form-urlencoded") ||
			contentType.includes("multipart/form-data")
		) {
			employeeLoanLogger.info("Original form data:", JSON.stringify(req.body, null, 2));
			requestData = transformFormDataToObject(req.body);
			employeeLoanLogger.info(
				"Transformed form data to object structure:",
				JSON.stringify(requestData, null, 2),
			);
		}

		const validation = CreateEmployeeLoanSchema.safeParse(requestData);
		if (!validation.success) {
			const formattedErrors = formatZodErrors(validation.error.format());
			employeeLoanLogger.error(`Validation failed: ${JSON.stringify(formattedErrors)}`);
			const errorResponse = buildErrorResponse("Validation failed", 400, formattedErrors);
			res.status(400).json(errorResponse);
			return;
		}

		try {
			const employeeLoan = await prisma.employeeLoan.create({ data: validation.data });
			employeeLoanLogger.info(`EmployeeLoan created successfully: ${employeeLoan.id}`);

			logActivity(req, {
				userId: (req as any).user?.id || "unknown",
				action: config.ACTIVITY_LOG.EMPLOYEELOAN.ACTIONS.CREATE_EMPLOYEELOAN,
				description: `${config.ACTIVITY_LOG.EMPLOYEELOAN.DESCRIPTIONS.EMPLOYEELOAN_CREATED}: ${employeeLoan.id}`,
				page: {
					url: req.originalUrl,
					title: config.ACTIVITY_LOG.EMPLOYEELOAN.PAGES.EMPLOYEELOAN_CREATION,
				},
			});

			logAudit(req, {
				userId: (req as any).user?.id || "unknown",
				action: config.AUDIT_LOG.ACTIONS.CREATE,
				resource: config.AUDIT_LOG.RESOURCES.EMPLOYEELOAN,
				severity: config.AUDIT_LOG.SEVERITY.LOW,
				entityType: config.AUDIT_LOG.ENTITY_TYPES.EMPLOYEELOAN,
				entityId: employeeLoan.id,
				changesBefore: null,
				changesAfter: {
					id: employeeLoan.id,

					createdAt: employeeLoan.createdAt,
					updatedAt: employeeLoan.updatedAt,
				},
				description: `${config.AUDIT_LOG.EMPLOYEELOAN.DESCRIPTIONS.EMPLOYEELOAN_CREATED}: ${employeeLoan.id}`,
			});

			try {
				await invalidateCache.byPattern("cache:employeeLoan:list:*");
				employeeLoanLogger.info("EmployeeLoan list cache invalidated after creation");
			} catch (cacheError) {
				employeeLoanLogger.warn(
					"Failed to invalidate cache after employeeLoan creation:",
					cacheError,
				);
			}

			const successResponse = buildSuccessResponse(
				config.SUCCESS.EMPLOYEELOAN.CREATED,
				employeeLoan,
				201,
			);
			res.status(201).json(successResponse);
		} catch (error) {
			employeeLoanLogger.error(`${config.ERROR.EMPLOYEELOAN.CREATE_FAILED}: ${error}`);
			const errorResponse = buildErrorResponse(
				config.ERROR.COMMON.INTERNAL_SERVER_ERROR,
				500,
			);
			res.status(500).json(errorResponse);
		}
	};
	const getAll = async (req: Request, res: Response, _next: NextFunction) => {
		const validationResult = validateQueryParams(req, employeeLoanLogger);

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

		employeeLoanLogger.info(
			`Getting employeeLoans, page: ${page}, limit: ${limit}, query: ${query}, order: ${order}, groupBy: ${groupBy}`,
		);

		try {
			// Base where clause
			const whereClause: Prisma.EmployeeLoanWhereInput = {
				isDeleted: false,
			};

			// search fields sample ("name", "description", "type")
			const searchFields = ["name", "description", "type"];
			if (query) {
				const searchConditions = buildSearchConditions("EmployeeLoan", query, searchFields);
				if (searchConditions.length > 0) {
					whereClause.OR = searchConditions;
				}
			}

			if (filter) {
				const filterConditions = buildFilterConditions("EmployeeLoan", filter);
				if (filterConditions.length > 0) {
					whereClause.AND = filterConditions;
				}
			}
			const findManyQuery = buildFindManyQuery(whereClause, skip, limit, order, sort, fields);

			const [employeeLoans, total] = await Promise.all([
				document ? prisma.employeeLoan.findMany(findManyQuery) : [],
				count ? prisma.employeeLoan.count({ where: whereClause }) : 0,
			]);

			employeeLoanLogger.info(`Retrieved ${employeeLoans.length} employeeLoans`);
			const processedData =
				groupBy && document
					? groupDataByField(employeeLoans, groupBy as string)
					: employeeLoans;

			const responseData: Record<string, any> = {
				...(document && { employeeLoans: processedData }),
				...(count && { count: total }),
				...(pagination && { pagination: buildPagination(total, page, limit) }),
				...(groupBy && { groupedBy: groupBy }),
			};

			res.status(200).json(
				buildSuccessResponse(config.SUCCESS.EMPLOYEELOAN.RETRIEVED_ALL, responseData, 200),
			);
		} catch (error) {
			employeeLoanLogger.error(`${config.ERROR.EMPLOYEELOAN.GET_ALL_FAILED}: ${error}`);
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
				employeeLoanLogger.error(config.ERROR.QUERY_PARAMS.MISSING_ID);
				const errorResponse = buildErrorResponse(config.ERROR.QUERY_PARAMS.MISSING_ID, 400);
				res.status(400).json(errorResponse);
				return;
			}

			if (fields && typeof fields !== "string") {
				employeeLoanLogger.error(
					`${config.ERROR.QUERY_PARAMS.INVALID_POPULATE}: ${fields}`,
				);
				const errorResponse = buildErrorResponse(
					config.ERROR.QUERY_PARAMS.POPULATE_MUST_BE_STRING,
					400,
				);
				res.status(400).json(errorResponse);
				return;
			}

			employeeLoanLogger.info(`${config.SUCCESS.EMPLOYEELOAN.GETTING_BY_ID}: ${id}`);

			const cacheKey = `cache:employeeLoan:byId:${id}:${fields || "full"}`;
			let employeeLoan = null;

			try {
				if (redisClient.isClientConnected()) {
					employeeLoan = await redisClient.getJSON(cacheKey);
					if (employeeLoan) {
						employeeLoanLogger.info(
							`EmployeeLoan ${id} retrieved from direct Redis cache`,
						);
					}
				}
			} catch (cacheError) {
				employeeLoanLogger.warn(
					`Redis cache retrieval failed for employeeLoan ${id}:`,
					cacheError,
				);
			}

			if (!employeeLoan) {
				const query: Prisma.EmployeeLoanFindFirstArgs = {
					where: { id },
				};

				query.select = getNestedFields(fields);

				employeeLoan = await prisma.employeeLoan.findFirst(query);

				if (employeeLoan && redisClient.isClientConnected()) {
					try {
						await redisClient.setJSON(cacheKey, employeeLoan, 3600);
						employeeLoanLogger.info(`EmployeeLoan ${id} stored in direct Redis cache`);
					} catch (cacheError) {
						employeeLoanLogger.warn(
							`Failed to store employeeLoan ${id} in Redis cache:`,
							cacheError,
						);
					}
				}
			}

			if (!employeeLoan) {
				employeeLoanLogger.error(`${config.ERROR.EMPLOYEELOAN.NOT_FOUND}: ${id}`);
				const errorResponse = buildErrorResponse(config.ERROR.EMPLOYEELOAN.NOT_FOUND, 404);
				res.status(404).json(errorResponse);
				return;
			}

			employeeLoanLogger.info(
				`${config.SUCCESS.EMPLOYEELOAN.RETRIEVED}: ${(employeeLoan as any).id}`,
			);
			const successResponse = buildSuccessResponse(
				config.SUCCESS.EMPLOYEELOAN.RETRIEVED,
				employeeLoan,
				200,
			);
			res.status(200).json(successResponse);
		} catch (error) {
			employeeLoanLogger.error(`${config.ERROR.EMPLOYEELOAN.ERROR_GETTING}: ${error}`);
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
				employeeLoanLogger.error(config.ERROR.QUERY_PARAMS.MISSING_ID);
				const errorResponse = buildErrorResponse(config.ERROR.QUERY_PARAMS.MISSING_ID, 400);
				res.status(400).json(errorResponse);
				return;
			}

			const validationResult = UpdateEmployeeLoanSchema.safeParse(req.body);

			if (!validationResult.success) {
				const formattedErrors = formatZodErrors(validationResult.error.format());
				employeeLoanLogger.error(`Validation failed: ${JSON.stringify(formattedErrors)}`);
				const errorResponse = buildErrorResponse("Validation failed", 400, formattedErrors);
				res.status(400).json(errorResponse);
				return;
			}

			if (Object.keys(req.body).length === 0) {
				employeeLoanLogger.error(config.ERROR.COMMON.NO_UPDATE_FIELDS);
				const errorResponse = buildErrorResponse(config.ERROR.COMMON.NO_UPDATE_FIELDS, 400);
				res.status(400).json(errorResponse);
				return;
			}

			const validatedData = validationResult.data;

			employeeLoanLogger.info(`Updating employeeLoan: ${id}`);

			const existingEmployeeLoan = await prisma.employeeLoan.findFirst({
				where: { id },
			});

			if (!existingEmployeeLoan) {
				employeeLoanLogger.error(`${config.ERROR.EMPLOYEELOAN.NOT_FOUND}: ${id}`);
				const errorResponse = buildErrorResponse(config.ERROR.EMPLOYEELOAN.NOT_FOUND, 404);
				res.status(404).json(errorResponse);
				return;
			}

			const prismaData = { ...validatedData };

			const updatedEmployeeLoan = await prisma.employeeLoan.update({
				where: { id },
				data: prismaData,
			});

			try {
				await invalidateCache.byPattern(`cache:employeeLoan:byId:${id}:*`);
				await invalidateCache.byPattern("cache:employeeLoan:list:*");
				employeeLoanLogger.info(`Cache invalidated after employeeLoan ${id} update`);
			} catch (cacheError) {
				employeeLoanLogger.warn(
					"Failed to invalidate cache after employeeLoan update:",
					cacheError,
				);
			}

			employeeLoanLogger.info(
				`${config.SUCCESS.EMPLOYEELOAN.UPDATED}: ${updatedEmployeeLoan.id}`,
			);
			const successResponse = buildSuccessResponse(
				config.SUCCESS.EMPLOYEELOAN.UPDATED,
				{ employeeLoan: updatedEmployeeLoan },
				200,
			);
			res.status(200).json(successResponse);
		} catch (error) {
			employeeLoanLogger.error(`${config.ERROR.EMPLOYEELOAN.ERROR_UPDATING}: ${error}`);
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
				employeeLoanLogger.error(config.ERROR.QUERY_PARAMS.MISSING_ID);
				const errorResponse = buildErrorResponse(config.ERROR.QUERY_PARAMS.MISSING_ID, 400);
				res.status(400).json(errorResponse);
				return;
			}

			employeeLoanLogger.info(`${config.SUCCESS.EMPLOYEELOAN.DELETED}: ${id}`);

			const existingEmployeeLoan = await prisma.employeeLoan.findFirst({
				where: { id },
			});

			if (!existingEmployeeLoan) {
				employeeLoanLogger.error(`${config.ERROR.EMPLOYEELOAN.NOT_FOUND}: ${id}`);
				const errorResponse = buildErrorResponse(config.ERROR.EMPLOYEELOAN.NOT_FOUND, 404);
				res.status(404).json(errorResponse);
				return;
			}

			await prisma.employeeLoan.delete({
				where: { id },
			});

			try {
				await invalidateCache.byPattern(`cache:employeeLoan:byId:${id}:*`);
				await invalidateCache.byPattern("cache:employeeLoan:list:*");
				employeeLoanLogger.info(`Cache invalidated after employeeLoan ${id} deletion`);
			} catch (cacheError) {
				employeeLoanLogger.warn(
					"Failed to invalidate cache after employeeLoan deletion:",
					cacheError,
				);
			}

			employeeLoanLogger.info(`${config.SUCCESS.EMPLOYEELOAN.DELETED}: ${id}`);
			const successResponse = buildSuccessResponse(
				config.SUCCESS.EMPLOYEELOAN.DELETED,
				{},
				200,
			);
			res.status(200).json(successResponse);
		} catch (error) {
			employeeLoanLogger.error(`${config.ERROR.EMPLOYEELOAN.DELETE_FAILED}: ${error}`);
			const errorResponse = buildErrorResponse(
				config.ERROR.COMMON.INTERNAL_SERVER_ERROR,
				500,
			);
			res.status(500).json(errorResponse);
		}
	};

	return { create, getAll, getById, update, remove };
};
