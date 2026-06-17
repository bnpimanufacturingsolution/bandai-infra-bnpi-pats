import { Request, Response, NextFunction } from "express";
import { PrismaClient, Prisma } from "../../generated/prisma";
import * as XLSX from "xlsx";
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
import { CreateLoanTypeSchema, UpdateLoanTypeSchema } from "../../zod/loantype.zod";

const logger = getLogger();
const loanTypeLogger = logger.child({ module: "loanType" });

export const controller = (prisma: PrismaClient) => {
	const normalizeImportBoolean = (value: unknown, fallback = false) => {
		if (typeof value === "boolean") return value;
		const normalized = String(value ?? "").trim().toUpperCase();
		if (["TRUE", "YES", "1"].includes(normalized)) return true;
		if (["FALSE", "NO", "0"].includes(normalized)) return false;
		return fallback;
	};

	const normalizeOptionalNumber = (value: unknown) => {
		if (value === null || value === undefined || value === "") return undefined;
		const parsed = Number(String(value).replace(/,/g, ""));
		return Number.isFinite(parsed) ? parsed : undefined;
	};

	const normalizeOptionalString = (value: unknown) => {
		const normalized = String(value ?? "").trim();
		return normalized.length > 0 ? normalized : undefined;
	};

	const create = async (req: Request, res: Response, _next: NextFunction) => {
		let requestData = req.body;
		const contentType = req.get("Content-Type") || "";

		if (
			contentType.includes("application/x-www-form-urlencoded") ||
			contentType.includes("multipart/form-data")
		) {
			loanTypeLogger.info("Original form data:", JSON.stringify(req.body, null, 2));
			requestData = transformFormDataToObject(req.body);
			loanTypeLogger.info(
				"Transformed form data to object structure:",
				JSON.stringify(requestData, null, 2),
			);
		}

		const validation = CreateLoanTypeSchema.safeParse(requestData);
		if (!validation.success) {
			const formattedErrors = formatZodErrors(validation.error.format());
			loanTypeLogger.error(`Validation failed: ${JSON.stringify(formattedErrors)}`);
			const errorResponse = buildErrorResponse("Validation failed", 400, formattedErrors);
			res.status(400).json(errorResponse);
			return;
		}

		try {
			const loanType = await prisma.loanType.create({ data: validation.data });
			loanTypeLogger.info(`LoanType created successfully: ${loanType.id}`);

			logActivity(req, {
				userId: (req as any).user?.id || "unknown",
				action: config.ACTIVITY_LOG.LOANTYPE.ACTIONS.CREATE_LOANTYPE,
				description: `${config.ACTIVITY_LOG.LOANTYPE.DESCRIPTIONS.LOANTYPE_CREATED}: ${loanType.name || loanType.id}`,
				page: {
					url: req.originalUrl,
					title: config.ACTIVITY_LOG.LOANTYPE.PAGES.LOANTYPE_CREATION,
				},
			});

			logAudit(req, {
				userId: (req as any).user?.id || "unknown",
				action: config.AUDIT_LOG.ACTIONS.CREATE,
				resource: config.AUDIT_LOG.RESOURCES.LOANTYPE,
				severity: config.AUDIT_LOG.SEVERITY.LOW,
				entityType: config.AUDIT_LOG.ENTITY_TYPES.LOANTYPE,
				entityId: loanType.id,
				changesBefore: null,
				changesAfter: {
					id: loanType.id,
					name: loanType.name,
					description: loanType.description,
					createdAt: loanType.createdAt,
					updatedAt: loanType.updatedAt,
				},
				description: `${config.AUDIT_LOG.LOANTYPE.DESCRIPTIONS.LOANTYPE_CREATED}: ${loanType.name || loanType.id}`,
			});

			try {
				await invalidateCache.byPattern("cache:loanType:list:*");
				loanTypeLogger.info("LoanType list cache invalidated after creation");
			} catch (cacheError) {
				loanTypeLogger.warn(
					"Failed to invalidate cache after loanType creation:",
					cacheError,
				);
			}

			const successResponse = buildSuccessResponse(
				config.SUCCESS.LOANTYPE.CREATED,
				loanType,
				201,
			);
			res.status(201).json(successResponse);
		} catch (error) {
			loanTypeLogger.error(`${config.ERROR.LOANTYPE.CREATE_FAILED}: ${error}`);
			const errorResponse = buildErrorResponse(
				config.ERROR.COMMON.INTERNAL_SERVER_ERROR,
				500,
			);
			res.status(500).json(errorResponse);
		}
	};
	const getAll = async (req: Request, res: Response, _next: NextFunction) => {
		const validationResult = validateQueryParams(req, loanTypeLogger);

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

		loanTypeLogger.info(
			`Getting loanTypes, page: ${page}, limit: ${limit}, query: ${query}, order: ${order}, groupBy: ${groupBy}`,
		);

		try {
			// Base where clause
			const whereClause: Prisma.LoanTypeWhereInput = {
				isDeleted: false,
			};

			// search fields sample ("name", "description", "type")
			const searchFields = ["name", "description", "type"];
			if (query) {
				const searchConditions = buildSearchConditions("LoanType", query, searchFields);
				if (searchConditions.length > 0) {
					whereClause.OR = searchConditions;
				}
			}

			if (filter) {
				const filterConditions = buildFilterConditions("LoanType", filter);
				if (filterConditions.length > 0) {
					whereClause.AND = filterConditions;
				}
			}
			const findManyQuery = buildFindManyQuery(whereClause, skip, limit, order, sort, fields);

			const [loanTypes, total] = await Promise.all([
				document ? prisma.loanType.findMany(findManyQuery) : [],
				count ? prisma.loanType.count({ where: whereClause }) : 0,
			]);

			loanTypeLogger.info(`Retrieved ${loanTypes.length} loanTypes`);
			const processedData =
				groupBy && document ? groupDataByField(loanTypes, groupBy as string) : loanTypes;

			const responseData: Record<string, any> = {
				...(document && { loanTypes: processedData }),
				...(count && { count: total }),
				...(pagination && { pagination: buildPagination(total, page, limit) }),
				...(groupBy && { groupedBy: groupBy }),
			};

			res.status(200).json(
				buildSuccessResponse(config.SUCCESS.LOANTYPE.RETRIEVED_ALL, responseData, 200),
			);
		} catch (error) {
			loanTypeLogger.error(`${config.ERROR.LOANTYPE.GET_ALL_FAILED}: ${error}`);
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
				loanTypeLogger.error(config.ERROR.QUERY_PARAMS.MISSING_ID);
				const errorResponse = buildErrorResponse(config.ERROR.QUERY_PARAMS.MISSING_ID, 400);
				res.status(400).json(errorResponse);
				return;
			}

			if (fields && typeof fields !== "string") {
				loanTypeLogger.error(`${config.ERROR.QUERY_PARAMS.INVALID_POPULATE}: ${fields}`);
				const errorResponse = buildErrorResponse(
					config.ERROR.QUERY_PARAMS.POPULATE_MUST_BE_STRING,
					400,
				);
				res.status(400).json(errorResponse);
				return;
			}

			loanTypeLogger.info(`${config.SUCCESS.LOANTYPE.GETTING_BY_ID}: ${id}`);

			const cacheKey = `cache:loanType:byId:${id}:${fields || "full"}`;
			let loanType = null;

			try {
				if (redisClient.isClientConnected()) {
					loanType = await redisClient.getJSON(cacheKey);
					if (loanType) {
						loanTypeLogger.info(`LoanType ${id} retrieved from direct Redis cache`);
					}
				}
			} catch (cacheError) {
				loanTypeLogger.warn(`Redis cache retrieval failed for loanType ${id}:`, cacheError);
			}

			if (!loanType) {
				const query: Prisma.LoanTypeFindFirstArgs = {
					where: { id },
				};

				query.select = getNestedFields(fields);

				loanType = await prisma.loanType.findFirst(query);

				if (loanType && redisClient.isClientConnected()) {
					try {
						await redisClient.setJSON(cacheKey, loanType, 3600);
						loanTypeLogger.info(`LoanType ${id} stored in direct Redis cache`);
					} catch (cacheError) {
						loanTypeLogger.warn(
							`Failed to store loanType ${id} in Redis cache:`,
							cacheError,
						);
					}
				}
			}

			if (!loanType) {
				loanTypeLogger.error(`${config.ERROR.LOANTYPE.NOT_FOUND}: ${id}`);
				const errorResponse = buildErrorResponse(config.ERROR.LOANTYPE.NOT_FOUND, 404);
				res.status(404).json(errorResponse);
				return;
			}

			loanTypeLogger.info(`${config.SUCCESS.LOANTYPE.RETRIEVED}: ${(loanType as any).id}`);
			const successResponse = buildSuccessResponse(
				config.SUCCESS.LOANTYPE.RETRIEVED,
				loanType,
				200,
			);
			res.status(200).json(successResponse);
		} catch (error) {
			loanTypeLogger.error(`${config.ERROR.LOANTYPE.ERROR_GETTING}: ${error}`);
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
				loanTypeLogger.error(config.ERROR.QUERY_PARAMS.MISSING_ID);
				const errorResponse = buildErrorResponse(config.ERROR.QUERY_PARAMS.MISSING_ID, 400);
				res.status(400).json(errorResponse);
				return;
			}

			const validationResult = UpdateLoanTypeSchema.safeParse(req.body);

			if (!validationResult.success) {
				const formattedErrors = formatZodErrors(validationResult.error.format());
				loanTypeLogger.error(`Validation failed: ${JSON.stringify(formattedErrors)}`);
				const errorResponse = buildErrorResponse("Validation failed", 400, formattedErrors);
				res.status(400).json(errorResponse);
				return;
			}

			if (Object.keys(req.body).length === 0) {
				loanTypeLogger.error(config.ERROR.COMMON.NO_UPDATE_FIELDS);
				const errorResponse = buildErrorResponse(config.ERROR.COMMON.NO_UPDATE_FIELDS, 400);
				res.status(400).json(errorResponse);
				return;
			}

			const validatedData = validationResult.data;

			loanTypeLogger.info(`Updating loanType: ${id}`);

			const existingLoanType = await prisma.loanType.findFirst({
				where: { id },
			});

			if (!existingLoanType) {
				loanTypeLogger.error(`${config.ERROR.LOANTYPE.NOT_FOUND}: ${id}`);
				const errorResponse = buildErrorResponse(config.ERROR.LOANTYPE.NOT_FOUND, 404);
				res.status(404).json(errorResponse);
				return;
			}

			const prismaData = { ...validatedData };

			const updatedLoanType = await prisma.loanType.update({
				where: { id },
				data: prismaData,
			});

			try {
				await invalidateCache.byPattern(`cache:loanType:byId:${id}:*`);
				await invalidateCache.byPattern("cache:loanType:list:*");
				loanTypeLogger.info(`Cache invalidated after loanType ${id} update`);
			} catch (cacheError) {
				loanTypeLogger.warn(
					"Failed to invalidate cache after loanType update:",
					cacheError,
				);
			}

			loanTypeLogger.info(`${config.SUCCESS.LOANTYPE.UPDATED}: ${updatedLoanType.id}`);
			const successResponse = buildSuccessResponse(
				config.SUCCESS.LOANTYPE.UPDATED,
				{ loanType: updatedLoanType },
				200,
			);
			res.status(200).json(successResponse);
		} catch (error) {
			loanTypeLogger.error(`${config.ERROR.LOANTYPE.ERROR_UPDATING}: ${error}`);
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
				loanTypeLogger.error(config.ERROR.QUERY_PARAMS.MISSING_ID);
				const errorResponse = buildErrorResponse(config.ERROR.QUERY_PARAMS.MISSING_ID, 400);
				res.status(400).json(errorResponse);
				return;
			}

			loanTypeLogger.info(`${config.SUCCESS.LOANTYPE.DELETED}: ${id}`);

			const existingLoanType = await prisma.loanType.findFirst({
				where: { id },
			});

			if (!existingLoanType) {
				loanTypeLogger.error(`${config.ERROR.LOANTYPE.NOT_FOUND}: ${id}`);
				const errorResponse = buildErrorResponse(config.ERROR.LOANTYPE.NOT_FOUND, 404);
				res.status(404).json(errorResponse);
				return;
			}

			await prisma.loanType.delete({
				where: { id },
			});

			try {
				await invalidateCache.byPattern(`cache:loanType:byId:${id}:*`);
				await invalidateCache.byPattern("cache:loanType:list:*");
				loanTypeLogger.info(`Cache invalidated after loanType ${id} deletion`);
			} catch (cacheError) {
				loanTypeLogger.warn(
					"Failed to invalidate cache after loanType deletion:",
					cacheError,
				);
			}

			loanTypeLogger.info(`${config.SUCCESS.LOANTYPE.DELETED}: ${id}`);
			const successResponse = buildSuccessResponse(config.SUCCESS.LOANTYPE.DELETED, {}, 200);
			res.status(200).json(successResponse);
		} catch (error) {
			loanTypeLogger.error(`${config.ERROR.LOANTYPE.DELETE_FAILED}: ${error}`);
			const errorResponse = buildErrorResponse(
				config.ERROR.COMMON.INTERNAL_SERVER_ERROR,
				500,
			);
			res.status(500).json(errorResponse);
		}
	};

	const importFromFile = async (req: Request, res: Response, _next: NextFunction) => {
		try {
			const file = (req as any).file as Express.Multer.File | undefined;
			const organizationId = String(
				(req as any).organizationId ||
					(req as any).user?.organizationId ||
					req.body?.organizationId ||
					"",
			).trim();

			if (!file) {
				res.status(400).json(buildErrorResponse("Import file is required", 400));
				return;
			}

			if (!organizationId) {
				res.status(400).json(buildErrorResponse("organizationId is required", 400));
				return;
			}

			const workbook = XLSX.read(file.buffer, { type: "buffer" });
			const firstSheetName = workbook.SheetNames[0];
			const worksheet = workbook.Sheets[firstSheetName];
			const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet, {
				defval: "",
			});

			const results = {
				created: 0,
				updated: 0,
				failed: 0,
				errors: [] as Array<{ row: number; message: string }>,
			};

			for (const [index, rawRow] of rows.entries()) {
				const row = Object.entries(rawRow).reduce(
					(acc, [key, value]) => {
						acc[key.trim().toUpperCase()] = value;
						return acc;
					},
					{} as Record<string, unknown>,
				);

				const payload = {
					organizationId,
					name: normalizeOptionalString(row.NAME),
					description: normalizeOptionalString(row.DESCRIPTION),
					category: normalizeOptionalString(row.CATEGORY) || "OTHER",
					minAmount: normalizeOptionalNumber(row.MIN_AMOUNT),
					maxAmount: normalizeOptionalNumber(row.MAX_AMOUNT),
					interestRate: normalizeOptionalNumber(row.INTEREST_RATE) ?? 0,
					maxTermMonths: normalizeOptionalNumber(row.MAX_TERM_MONTHS) ?? 1,
					minServiceMonths: normalizeOptionalNumber(row.MIN_SERVICE_MONTHS),
					isActive: normalizeImportBoolean(row.IS_ACTIVE, true),
				};

				const validation = CreateLoanTypeSchema.safeParse(payload);
				if (!validation.success) {
					results.failed++;
					results.errors.push({
						row: index + 2,
						message: JSON.stringify(formatZodErrors(validation.error.format())),
					});
					continue;
				}

				const existing = await prisma.loanType.findUnique({
					where: {
						organizationId_name: {
							organizationId,
							name: validation.data.name,
						},
					},
					select: { id: true },
				});

				await prisma.loanType.upsert({
					where: {
						organizationId_name: {
							organizationId,
							name: validation.data.name,
						},
					},
					update: {
						...validation.data,
						isDeleted: false,
					},
					create: validation.data as Prisma.LoanTypeUncheckedCreateInput,
				});

				if (existing) results.updated++;
				else results.created++;
			}

			await invalidateCache.byPattern("cache:loanType:list:*");

			res.status(200).json(
				buildSuccessResponse("Loan types imported successfully", results, 200),
			);
		} catch (error) {
			loanTypeLogger.error(`LoanType import failed: ${error}`);
			res.status(500).json(
				buildErrorResponse(
					`Failed to import loan types: ${error instanceof Error ? error.message : String(error)}`,
					500,
				),
			);
		}
	};

	return { create, getAll, getById, update, remove, importFromFile };
};
