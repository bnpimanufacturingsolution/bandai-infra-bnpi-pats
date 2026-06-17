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
import { CreateTimesheetlineSchema, UpdateTimesheetlineSchema } from "../../zod/timesheetline.zod";
import { logActivity } from "../../utils/activityLogger";
import { logAudit } from "../../utils/auditLogger";
import { config } from "../../config/constant";
import { redisClient } from "../../config/redis";
import { invalidateCache } from "../../middleware/cache";
import { writeEffectiveTimesheetLine } from "../../helper/timesheet-line-version.helper";

const logger = getLogger();
const timesheetlineLogger = logger.child({ module: "timesheetline" });

export const controller = (prisma: PrismaClient) => {
	const create = async (req: Request, res: Response, _next: NextFunction) => {
		let requestData = req.body;
		const contentType = req.get("Content-Type") || "";

		if (
			contentType.includes("application/x-www-form-urlencoded") ||
			contentType.includes("multipart/form-data")
		) {
			timesheetlineLogger.info("Original form data:", JSON.stringify(req.body, null, 2));
			requestData = transformFormDataToObject(req.body);
			timesheetlineLogger.info(
				"Transformed form data to object structure:",
				JSON.stringify(requestData, null, 2),
			);
		}

		const validation = CreateTimesheetlineSchema.safeParse(requestData);
		if (!validation.success) {
			const formattedErrors = formatZodErrors(validation.error.format());
			timesheetlineLogger.error(`Validation failed: ${JSON.stringify(formattedErrors)}`);
			const errorResponse = buildErrorResponse("Validation failed", 400, formattedErrors);
			res.status(400).json(errorResponse);
			return;
		}

		try {
			const timesheetline = await prisma.timesheetline.create({ data: validation.data as any });
			timesheetlineLogger.info(`Timesheetline created successfully: ${timesheetline.id}`);

			logActivity(req, {
				userId: (req as any).user?.id || "unknown",
				action: config.ACTIVITY_LOG.TIMESHEETLINE.ACTIONS.CREATE_TIMESHEETLINE,
				description: `${config.ACTIVITY_LOG.TIMESHEETLINE.DESCRIPTIONS.TIMESHEETLINE_CREATED}: ${timesheetline.id}`,
				page: {
					url: req.originalUrl,
					title: config.ACTIVITY_LOG.TIMESHEETLINE.PAGES.TIMESHEETLINE_CREATION,
				},
			});

			logAudit(req, {
				userId: (req as any).user?.id || "unknown",
				action: config.AUDIT_LOG.ACTIONS.CREATE,
				resource: config.AUDIT_LOG.RESOURCES.TIMESHEETLINE,
				severity: config.AUDIT_LOG.SEVERITY.LOW,
				entityType: config.AUDIT_LOG.ENTITY_TYPES.TIMESHEETLINE,
				entityId: timesheetline.id,
				changesBefore: null,
				changesAfter: {
					id: timesheetline.id,
					employeeId: timesheetline.employeeId,
					timesheetId: timesheetline.timesheetId,
					date: timesheetline.date,
					status: timesheetline.status,
					createdAt: timesheetline.createdAt,
					updatedAt: timesheetline.updatedAt,
				},
				description: `${config.AUDIT_LOG.TIMESHEETLINE.DESCRIPTIONS.TIMESHEETLINE_CREATED}: ${timesheetline.id}`,
			});

			try {
				await invalidateCache.byPattern("cache:timesheetline:list:*");
				timesheetlineLogger.info("Timesheetline list cache invalidated after creation");
			} catch (cacheError) {
				timesheetlineLogger.warn(
					"Failed to invalidate cache after timesheetline creation:",
					cacheError,
				);
			}

			const successResponse = buildSuccessResponse(
				config.SUCCESS.TIMESHEETLINE.CREATED,
				timesheetline,
				201,
			);
			res.status(201).json(successResponse);
		} catch (error) {
			timesheetlineLogger.error(`${config.ERROR.TIMESHEETLINE.CREATE_FAILED}: ${error}`);
			const errorResponse = buildErrorResponse(
				config.ERROR.COMMON.INTERNAL_SERVER_ERROR,
				500,
			);
			res.status(500).json(errorResponse);
		}
	};
	const getAll = async (req: Request, res: Response, _next: NextFunction) => {
		const validationResult = validateQueryParams(req, timesheetlineLogger);

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

		timesheetlineLogger.info(
			`Getting timesheetlines, page: ${page}, limit: ${limit}, query: ${query}, order: ${order}, groupBy: ${groupBy}`,
		);

		try {
			// Base where clause
			const whereClause: Prisma.TimesheetlineWhereInput = {
				isDeleted: false,
			};

			const searchFields = [
				"status",
				"employeeCodeSnapshot",
				"employeeNameSnapshot",
				"departmentNameSnapshot",
				"timesheet.code",
				"employee.employeeId",
				"employee.person.personalInfo.firstName",
				"employee.person.personalInfo.lastName",
			];
			if (query) {
				const searchConditions = buildSearchConditions("Timesheetline", query, searchFields);
				if (searchConditions.length > 0) {
					whereClause.OR = searchConditions;
				}
			}

			if (filter) {
				const filterConditions = buildFilterConditions("Timesheetline", filter);
				if (filterConditions.length > 0) {
					whereClause.AND = filterConditions;
				}
			}
			if (!String(filter || "").includes("isEffective")) {
				whereClause.isEffective = true;
			}
			const findManyQuery = buildFindManyQuery(whereClause, skip, limit, order, sort, fields);

			const [timesheetlines, total] = await Promise.all([
				document ? prisma.timesheetline.findMany(findManyQuery) : [],
				count ? prisma.timesheetline.count({ where: whereClause }) : 0,
			]);

			timesheetlineLogger.info(`Retrieved ${timesheetlines.length} timesheetlines`);
			const processedData =
				groupBy && document ? groupDataByField(timesheetlines, groupBy as string) : timesheetlines;

			const responseData: Record<string, any> = {
				...(document && { timesheetlines: processedData }),
				...(count && { count: total }),
				...(pagination && { pagination: buildPagination(total, page, limit) }),
				...(groupBy && { groupedBy: groupBy }),
			};

			res.status(200).json(
				buildSuccessResponse(config.SUCCESS.TIMESHEETLINE.RETRIEVED_ALL, responseData, 200),
			);
		} catch (error) {
			timesheetlineLogger.error(`${config.ERROR.TIMESHEETLINE.GET_ALL_FAILED}: ${error}`);
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
				timesheetlineLogger.error(config.ERROR.QUERY_PARAMS.MISSING_ID);
				const errorResponse = buildErrorResponse(config.ERROR.QUERY_PARAMS.MISSING_ID, 400);
				res.status(400).json(errorResponse);
				return;
			}

			if (fields && typeof fields !== "string") {
				timesheetlineLogger.error(`${config.ERROR.QUERY_PARAMS.INVALID_POPULATE}: ${fields}`);
				const errorResponse = buildErrorResponse(
					config.ERROR.QUERY_PARAMS.POPULATE_MUST_BE_STRING,
					400,
				);
				res.status(400).json(errorResponse);
				return;
			}

			timesheetlineLogger.info(`${config.SUCCESS.TIMESHEETLINE.GETTING_BY_ID}: ${id}`);

			const cacheKey = `cache:timesheetline:byId:${id}:${fields || "full"}`;
			let timesheetline = null;

			try {
				if (redisClient.isClientConnected()) {
					timesheetline = await redisClient.getJSON(cacheKey);
					if (timesheetline) {
						timesheetlineLogger.info(`Timesheetline ${id} retrieved from direct Redis cache`);
					}
				}
			} catch (cacheError) {
				timesheetlineLogger.warn(`Redis cache retrieval failed for timesheetline ${id}:`, cacheError);
			}

			if (!timesheetline) {
				const query: Prisma.TimesheetlineFindFirstArgs = {
					where: { id },
				};

				query.select = getNestedFields(fields);

				timesheetline = await prisma.timesheetline.findFirst(query);

				if (timesheetline && redisClient.isClientConnected()) {
					try {
						await redisClient.setJSON(cacheKey, timesheetline, 3600);
						timesheetlineLogger.info(`Timesheetline ${id} stored in direct Redis cache`);
					} catch (cacheError) {
						timesheetlineLogger.warn(
							`Failed to store timesheetline ${id} in Redis cache:`,
							cacheError,
						);
					}
				}
			}

			if (!timesheetline) {
				timesheetlineLogger.error(`${config.ERROR.TIMESHEETLINE.NOT_FOUND}: ${id}`);
				const errorResponse = buildErrorResponse(config.ERROR.TIMESHEETLINE.NOT_FOUND, 404);
				res.status(404).json(errorResponse);
				return;
			}

			timesheetlineLogger.info(`${config.SUCCESS.TIMESHEETLINE.RETRIEVED}: ${(timesheetline as any).id}`);
			const successResponse = buildSuccessResponse(
				config.SUCCESS.TIMESHEETLINE.RETRIEVED,
				timesheetline,
				200,
			);
			res.status(200).json(successResponse);
		} catch (error) {
			timesheetlineLogger.error(`${config.ERROR.TIMESHEETLINE.ERROR_GETTING}: ${error}`);
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
				timesheetlineLogger.error(config.ERROR.QUERY_PARAMS.MISSING_ID);
				const errorResponse = buildErrorResponse(config.ERROR.QUERY_PARAMS.MISSING_ID, 400);
				res.status(400).json(errorResponse);
				return;
			}

			const validationResult = UpdateTimesheetlineSchema.safeParse(req.body);

			if (!validationResult.success) {
				const formattedErrors = formatZodErrors(validationResult.error.format());
				timesheetlineLogger.error(`Validation failed: ${JSON.stringify(formattedErrors)}`);
				const errorResponse = buildErrorResponse("Validation failed", 400, formattedErrors);
				res.status(400).json(errorResponse);
				return;
			}

			if (Object.keys(req.body).length === 0) {
				timesheetlineLogger.error(config.ERROR.COMMON.NO_UPDATE_FIELDS);
				const errorResponse = buildErrorResponse(config.ERROR.COMMON.NO_UPDATE_FIELDS, 400);
				res.status(400).json(errorResponse);
				return;
			}

			const validatedData = validationResult.data;

			timesheetlineLogger.info(`Updating timesheetline: ${id}`);

			const existingTimesheetline = await prisma.timesheetline.findFirst({
				where: { id },
			});

			if (!existingTimesheetline) {
				timesheetlineLogger.error(`${config.ERROR.TIMESHEETLINE.NOT_FOUND}: ${id}`);
				const errorResponse = buildErrorResponse(config.ERROR.TIMESHEETLINE.NOT_FOUND, 404);
				res.status(404).json(errorResponse);
				return;
			}

			const prismaData = { ...validatedData };
			const mergedLineData = {
				...existingTimesheetline,
				...prismaData,
				id: undefined,
				createdAt: undefined,
				updatedAt: undefined,
				isEffective: true,
				supersededAt: null,
				supersededById: null,
				supersedesLineId: undefined,
			};

			const updatedTimesheetline = await writeEffectiveTimesheetLine(prisma, {
				organizationId: existingTimesheetline.organizationId,
				timesheetId: existingTimesheetline.timesheetId,
				date: existingTimesheetline.date,
				data: mergedLineData as any,
				versionMode: "version",
				ledgerType: String((prismaData as any).ledgerType || "HR_ADJUSTMENT") as any,
				editedBy: (req as any).metadata?.employee?.id || null,
				editReason: (prismaData as any).editReason || null,
			});

			try {
				await invalidateCache.byPattern(`cache:timesheetline:byId:${id}:*`);
				await invalidateCache.byPattern("cache:timesheetline:list:*");
				timesheetlineLogger.info(`Cache invalidated after timesheetline ${id} update`);
			} catch (cacheError) {
				timesheetlineLogger.warn(
					"Failed to invalidate cache after timesheetline update:",
					cacheError,
				);
			}

			timesheetlineLogger.info(`${config.SUCCESS.TIMESHEETLINE.UPDATED}: ${updatedTimesheetline.id}`);
			const successResponse = buildSuccessResponse(
				config.SUCCESS.TIMESHEETLINE.UPDATED,
				{ timesheetline: updatedTimesheetline },
				200,
			);
			res.status(200).json(successResponse);
		} catch (error) {
			timesheetlineLogger.error(`${config.ERROR.TIMESHEETLINE.ERROR_UPDATING}: ${error}`);
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
				timesheetlineLogger.error(config.ERROR.QUERY_PARAMS.MISSING_ID);
				const errorResponse = buildErrorResponse(config.ERROR.QUERY_PARAMS.MISSING_ID, 400);
				res.status(400).json(errorResponse);
				return;
			}

			timesheetlineLogger.info(`${config.SUCCESS.TIMESHEETLINE.DELETED}: ${id}`);

			const existingTimesheetline = await prisma.timesheetline.findFirst({
				where: { id },
			});

			if (!existingTimesheetline) {
				timesheetlineLogger.error(`${config.ERROR.TIMESHEETLINE.NOT_FOUND}: ${id}`);
				const errorResponse = buildErrorResponse(config.ERROR.TIMESHEETLINE.NOT_FOUND, 404);
				res.status(404).json(errorResponse);
				return;
			}

			await prisma.timesheetline.delete({
				where: { id },
			});

			try {
				await invalidateCache.byPattern(`cache:timesheetline:byId:${id}:*`);
				await invalidateCache.byPattern("cache:timesheetline:list:*");
				timesheetlineLogger.info(`Cache invalidated after timesheetline ${id} deletion`);
			} catch (cacheError) {
				timesheetlineLogger.warn(
					"Failed to invalidate cache after timesheetline deletion:",
					cacheError,
				);
			}

			timesheetlineLogger.info(`${config.SUCCESS.TIMESHEETLINE.DELETED}: ${id}`);
			const successResponse = buildSuccessResponse(config.SUCCESS.TIMESHEETLINE.DELETED, {}, 200);
			res.status(200).json(successResponse);
		} catch (error) {
			timesheetlineLogger.error(`${config.ERROR.TIMESHEETLINE.DELETE_FAILED}: ${error}`);
			const errorResponse = buildErrorResponse(
				config.ERROR.COMMON.INTERNAL_SERVER_ERROR,
				500,
			);
			res.status(500).json(errorResponse);
		}
	};

	return { create, getAll, getById, update, remove };
};
