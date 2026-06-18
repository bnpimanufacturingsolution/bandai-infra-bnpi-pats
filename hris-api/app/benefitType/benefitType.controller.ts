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
import { CreateBenefitTypeSchema, UpdateBenefitTypeSchema } from "../../zod/benefittype.zod";

const logger = getLogger();
const benefitTypeLogger = logger.child({ module: "benefitType" });

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
		const parsed = Number(value);
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
			benefitTypeLogger.info("Original form data:", JSON.stringify(req.body, null, 2));
			requestData = transformFormDataToObject(req.body);
			benefitTypeLogger.info(
				"Transformed form data to object structure:",
				JSON.stringify(requestData, null, 2),
			);
		}

		const validation = CreateBenefitTypeSchema.safeParse(requestData);
		if (!validation.success) {
			const formattedErrors = formatZodErrors(validation.error.format());
			benefitTypeLogger.error(`Validation failed: ${JSON.stringify(formattedErrors)}`);
			const errorResponse = buildErrorResponse("Validation failed", 400, formattedErrors);
			res.status(400).json(errorResponse);
			return;
		}

		try {
			const benefitType = await prisma.benefitType.create({
				data: validation.data as Prisma.BenefitTypeUncheckedCreateInput,
			});
			benefitTypeLogger.info(`BenefitType created successfully: ${benefitType.id}`);

			logActivity(req, {
				userId: (req as any).user?.id || "unknown",
				action: config.ACTIVITY_LOG.BENEFITTYPE.ACTIONS.CREATE_BENEFITTYPE,
				description: `${config.ACTIVITY_LOG.BENEFITTYPE.DESCRIPTIONS.BENEFITTYPE_CREATED}: ${benefitType.name || benefitType.id}`,
				page: {
					url: req.originalUrl,
					title: config.ACTIVITY_LOG.BENEFITTYPE.PAGES.BENEFITTYPE_CREATION,
				},
			});

			logAudit(req, {
				userId: (req as any).user?.id || "unknown",
				action: config.AUDIT_LOG.ACTIONS.CREATE,
				resource: config.AUDIT_LOG.RESOURCES.BENEFITTYPE,
				severity: config.AUDIT_LOG.SEVERITY.LOW,
				entityType: config.AUDIT_LOG.ENTITY_TYPES.BENEFITTYPE,
				entityId: benefitType.id,
				changesBefore: null,
				changesAfter: {
					id: benefitType.id,
					name: benefitType.name,
					description: benefitType.description,
					createdAt: benefitType.createdAt,
					updatedAt: benefitType.updatedAt,
				},
				description: `${config.AUDIT_LOG.BENEFITTYPE.DESCRIPTIONS.BENEFITTYPE_CREATED}: ${benefitType.name || benefitType.id}`,
			});

			try {
				await invalidateCache.byPattern("cache:benefitType:list:*");
				benefitTypeLogger.info("BenefitType list cache invalidated after creation");
			} catch (cacheError) {
				benefitTypeLogger.warn(
					"Failed to invalidate cache after benefitType creation:",
					cacheError,
				);
			}

			const successResponse = buildSuccessResponse(
				config.SUCCESS.BENEFITTYPE.CREATED,
				benefitType,
				201,
			);
			res.status(201).json(successResponse);
		} catch (error) {
			benefitTypeLogger.error(`${config.ERROR.BENEFITTYPE.CREATE_FAILED}: ${error}`);
			const errorResponse = buildErrorResponse(
				config.ERROR.COMMON.INTERNAL_SERVER_ERROR,
				500,
			);
			res.status(500).json(errorResponse);
		}
	};
	const getAll = async (req: Request, res: Response, _next: NextFunction) => {
		const validationResult = validateQueryParams(req, benefitTypeLogger);

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

		benefitTypeLogger.info(
			`Getting benefitTypes, page: ${page}, limit: ${limit}, query: ${query}, order: ${order}, groupBy: ${groupBy}`,
		);

		try {
			// Base where clause
			const whereClause: Prisma.BenefitTypeWhereInput = {
				isDeleted: false,
			};

			const searchFields = [
				"code",
				"name",
				"category",
				"payrollDirection",
				"provider",
				"description",
			];
			if (query) {
				const searchConditions = buildSearchConditions("BenefitType", query, searchFields);
				if (searchConditions.length > 0) {
					whereClause.OR = searchConditions;
				}
			}

			if (filter) {
				const filterConditions = buildFilterConditions("BenefitType", filter);
				if (filterConditions.length > 0) {
					whereClause.AND = filterConditions;
				}
			}
			const findManyQuery = buildFindManyQuery(whereClause, skip, limit, order, sort, fields);

			const [benefitTypes, total] = await Promise.all([
				document ? prisma.benefitType.findMany(findManyQuery) : [],
				count ? prisma.benefitType.count({ where: whereClause }) : 0,
			]);

			benefitTypeLogger.info(`Retrieved ${benefitTypes.length} benefitTypes`);
			const processedData =
				groupBy && document
					? groupDataByField(benefitTypes, groupBy as string)
					: benefitTypes;

			const responseData: Record<string, any> = {
				...(document && { benefitTypes: processedData }),
				...(count && { count: total }),
				...(pagination && { pagination: buildPagination(total, page, limit) }),
				...(groupBy && { groupedBy: groupBy }),
			};

			res.status(200).json(
				buildSuccessResponse(config.SUCCESS.BENEFITTYPE.RETRIEVED_ALL, responseData, 200),
			);
		} catch (error) {
			benefitTypeLogger.error(`${config.ERROR.BENEFITTYPE.GET_ALL_FAILED}: ${error}`);
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
				benefitTypeLogger.error(config.ERROR.QUERY_PARAMS.MISSING_ID);
				const errorResponse = buildErrorResponse(config.ERROR.QUERY_PARAMS.MISSING_ID, 400);
				res.status(400).json(errorResponse);
				return;
			}

			if (fields && typeof fields !== "string") {
				benefitTypeLogger.error(`${config.ERROR.QUERY_PARAMS.INVALID_POPULATE}: ${fields}`);
				const errorResponse = buildErrorResponse(
					config.ERROR.QUERY_PARAMS.POPULATE_MUST_BE_STRING,
					400,
				);
				res.status(400).json(errorResponse);
				return;
			}

			benefitTypeLogger.info(`${config.SUCCESS.BENEFITTYPE.GETTING_BY_ID}: ${id}`);

			const selectedFields = typeof fields === "string" ? fields : undefined;
			const cacheKey = `cache:benefitType:byId:${id}:${selectedFields || "full"}`;
			let benefitType = null;

			try {
				if (redisClient.isClientConnected()) {
					benefitType = await redisClient.getJSON(cacheKey);
					if (benefitType) {
						benefitTypeLogger.info(
							`BenefitType ${id} retrieved from direct Redis cache`,
						);
					}
				}
			} catch (cacheError) {
				benefitTypeLogger.warn(
					`Redis cache retrieval failed for benefitType ${id}:`,
					cacheError,
				);
			}

			if (!benefitType) {
				const query: Prisma.BenefitTypeFindFirstArgs = {
					where: { id },
				};

				query.select = getNestedFields(selectedFields);

				benefitType = await prisma.benefitType.findFirst(query);

				if (benefitType && redisClient.isClientConnected()) {
					try {
						await redisClient.setJSON(cacheKey, benefitType, 3600);
						benefitTypeLogger.info(`BenefitType ${id} stored in direct Redis cache`);
					} catch (cacheError) {
						benefitTypeLogger.warn(
							`Failed to store benefitType ${id} in Redis cache:`,
							cacheError,
						);
					}
				}
			}

			if (!benefitType) {
				benefitTypeLogger.error(`${config.ERROR.BENEFITTYPE.NOT_FOUND}: ${id}`);
				const errorResponse = buildErrorResponse(config.ERROR.BENEFITTYPE.NOT_FOUND, 404);
				res.status(404).json(errorResponse);
				return;
			}

			benefitTypeLogger.info(
				`${config.SUCCESS.BENEFITTYPE.RETRIEVED}: ${(benefitType as any).id}`,
			);
			const successResponse = buildSuccessResponse(
				config.SUCCESS.BENEFITTYPE.RETRIEVED,
				benefitType,
				200,
			);
			res.status(200).json(successResponse);
		} catch (error) {
			benefitTypeLogger.error(`${config.ERROR.BENEFITTYPE.ERROR_GETTING}: ${error}`);
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
				benefitTypeLogger.error(config.ERROR.QUERY_PARAMS.MISSING_ID);
				const errorResponse = buildErrorResponse(config.ERROR.QUERY_PARAMS.MISSING_ID, 400);
				res.status(400).json(errorResponse);
				return;
			}

			const validationResult = UpdateBenefitTypeSchema.safeParse(req.body);

			if (!validationResult.success) {
				const formattedErrors = formatZodErrors(validationResult.error.format());
				benefitTypeLogger.error(`Validation failed: ${JSON.stringify(formattedErrors)}`);
				const errorResponse = buildErrorResponse("Validation failed", 400, formattedErrors);
				res.status(400).json(errorResponse);
				return;
			}

			if (Object.keys(req.body).length === 0) {
				benefitTypeLogger.error(config.ERROR.COMMON.NO_UPDATE_FIELDS);
				const errorResponse = buildErrorResponse(config.ERROR.COMMON.NO_UPDATE_FIELDS, 400);
				res.status(400).json(errorResponse);
				return;
			}

			const validatedData = validationResult.data;

			benefitTypeLogger.info(`Updating benefitType: ${id}`);

			const existingBenefitType = await prisma.benefitType.findFirst({
				where: { id },
			});

			if (!existingBenefitType) {
				benefitTypeLogger.error(`${config.ERROR.BENEFITTYPE.NOT_FOUND}: ${id}`);
				const errorResponse = buildErrorResponse(config.ERROR.BENEFITTYPE.NOT_FOUND, 404);
				res.status(404).json(errorResponse);
				return;
			}

			const prismaData = { ...validatedData };

			const updatedBenefitType = await prisma.benefitType.update({
				where: { id },
				data: prismaData,
			});

			try {
				await invalidateCache.byPattern(`cache:benefitType:byId:${id}:*`);
				await invalidateCache.byPattern("cache:benefitType:list:*");
				benefitTypeLogger.info(`Cache invalidated after benefitType ${id} update`);
			} catch (cacheError) {
				benefitTypeLogger.warn(
					"Failed to invalidate cache after benefitType update:",
					cacheError,
				);
			}

			benefitTypeLogger.info(
				`${config.SUCCESS.BENEFITTYPE.UPDATED}: ${updatedBenefitType.id}`,
			);
			const successResponse = buildSuccessResponse(
				config.SUCCESS.BENEFITTYPE.UPDATED,
				{ benefitType: updatedBenefitType },
				200,
			);
			res.status(200).json(successResponse);
		} catch (error) {
			benefitTypeLogger.error(`${config.ERROR.BENEFITTYPE.ERROR_UPDATING}: ${error}`);
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
				benefitTypeLogger.error(config.ERROR.QUERY_PARAMS.MISSING_ID);
				const errorResponse = buildErrorResponse(config.ERROR.QUERY_PARAMS.MISSING_ID, 400);
				res.status(400).json(errorResponse);
				return;
			}

			benefitTypeLogger.info(`${config.SUCCESS.BENEFITTYPE.DELETED}: ${id}`);

			const existingBenefitType = await prisma.benefitType.findFirst({
				where: { id },
			});

			if (!existingBenefitType) {
				benefitTypeLogger.error(`${config.ERROR.BENEFITTYPE.NOT_FOUND}: ${id}`);
				const errorResponse = buildErrorResponse(config.ERROR.BENEFITTYPE.NOT_FOUND, 404);
				res.status(404).json(errorResponse);
				return;
			}

			await prisma.benefitType.delete({
				where: { id },
			});

			try {
				await invalidateCache.byPattern(`cache:benefitType:byId:${id}:*`);
				await invalidateCache.byPattern("cache:benefitType:list:*");
				benefitTypeLogger.info(`Cache invalidated after benefitType ${id} deletion`);
			} catch (cacheError) {
				benefitTypeLogger.warn(
					"Failed to invalidate cache after benefitType deletion:",
					cacheError,
				);
			}

			benefitTypeLogger.info(`${config.SUCCESS.BENEFITTYPE.DELETED}: ${id}`);
			const successResponse = buildSuccessResponse(
				config.SUCCESS.BENEFITTYPE.DELETED,
				{},
				200,
			);
			res.status(200).json(successResponse);
		} catch (error) {
			benefitTypeLogger.error(`${config.ERROR.BENEFITTYPE.DELETE_FAILED}: ${error}`);
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
					code: normalizeOptionalString(row.CODE),
					name: normalizeOptionalString(row.NAME),
					category: normalizeOptionalString(row.CATEGORY) || "OTHER",
					payrollDirection:
						normalizeOptionalString(row.PAYROLL_DIRECTION) || "COMPENSATION",
					description: normalizeOptionalString(row.DESCRIPTION),
					isTaxable: normalizeImportBoolean(row.IS_TAXABLE),
					isActive: normalizeImportBoolean(row.IS_ACTIVE, true),
					isDefault: normalizeImportBoolean(row.IS_DEFAULT),
					defaultInstallments: normalizeOptionalNumber(row.DEFAULT_INSTALLMENTS),
					payrollCycleDays: normalizeOptionalNumber(row.PAYROLL_CYCLE_DAYS),
					requireTermsAgreement: normalizeImportBoolean(
						row.REQUIRE_TERMS_AGREEMENT,
						true,
					),
					reconciliationAction: normalizeOptionalString(row.RECONCILIATION_ACTION),
					provider: normalizeOptionalString(row.PROVIDER),
					coverage: normalizeOptionalNumber(row.COVERAGE),
					minAmount: normalizeOptionalNumber(row.MIN_AMOUNT),
					maxAmount: normalizeOptionalNumber(row.MAX_AMOUNT),
					fixedAmount: normalizeOptionalNumber(row.FIXED_AMOUNT),
					percentage: normalizeOptionalNumber(row.PERCENTAGE),
					minServiceMonths: normalizeOptionalNumber(row.MIN_SERVICE_MONTHS),
				};

				const validation = CreateBenefitTypeSchema.safeParse(payload);
				if (!validation.success) {
					results.failed++;
					results.errors.push({
						row: index + 2,
						message: JSON.stringify(formatZodErrors(validation.error.format())),
					});
					continue;
				}

				const existing = await prisma.benefitType.findUnique({
					where: {
						organizationId_code: {
							organizationId,
							code: validation.data.code,
						},
					},
					select: { id: true },
				});

				await prisma.benefitType.upsert({
					where: {
						organizationId_code: {
							organizationId,
							code: validation.data.code,
						},
					},
					update: {
						...validation.data,
						isDeleted: false,
					},
					create: validation.data as Prisma.BenefitTypeUncheckedCreateInput,
				});

				if (existing) results.updated++;
				else results.created++;
			}

			await invalidateCache.byPattern("cache:benefitType:list:*");

			res.status(200).json(
				buildSuccessResponse("Benefit types imported successfully", results, 200),
			);
		} catch (error) {
			benefitTypeLogger.error(`BenefitType import failed: ${error}`);
			res.status(500).json(
				buildErrorResponse(
					`Failed to import benefit types: ${error instanceof Error ? error.message : String(error)}`,
					500,
				),
			);
		}
	};

	return { create, getAll, getById, update, remove, importFromFile };
};
