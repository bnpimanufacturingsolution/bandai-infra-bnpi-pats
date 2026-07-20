import { Request, Response, NextFunction } from "express";
import { PrismaClient, Prisma } from "../../generated/prisma";
import * as xlsx from "xlsx";
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
import {
	BulkCreateEmployeeBenefitSchema,
	CreateEmployeeBenefitSchema,
	UpdateEmployeeBenefitSchema,
} from "../../zod/employeebenefit.zod";
import {
	normalizeEmployeeBenefitPayload,
	buildBenefitInstallments,
	BENEFIT_PROGRAM_ACTIVE_STATUSES,
	type BenefitSchedulePeriod,
} from "../../helper/employee-benefit-program.helper";

const logger = getLogger();
const employeeBenefitLogger = logger.child({ module: "employeeBenefit" });

const getTimeBoundPayrollPeriods = async (
	prisma: PrismaClient,
	benefit: Record<string, any>,
): Promise<BenefitSchedulePeriod[] | undefined> => {
	if (benefit.scheduleMode !== "TIME_BOUND") {
		return undefined;
	}

	const startValue = benefit.startPayrollCutOff ?? benefit.startDate;
	const endValue = benefit.endPayrollCutOff ?? benefit.endDate;
	const startDate = new Date(startValue);
	const endDate = new Date(endValue);
	if (
		!benefit.organizationId ||
		Number.isNaN(startDate.getTime()) ||
		Number.isNaN(endDate.getTime()) ||
		startDate > endDate
	) {
		return [];
	}

	const periods = await prisma.payrollPeriod.findMany({
		where: {
			organizationId: benefit.organizationId,
			isDeleted: false,
			startDate: { lte: endDate },
			endDate: { gte: startDate },
		},
		select: { id: true, startDate: true, endDate: true },
		orderBy: { startDate: "asc" },
	});

	return periods.filter((period) => {
		const periodStart = new Date(period.startDate);
		const periodEnd = new Date(period.endDate);
		return (
			!Number.isNaN(periodStart.getTime()) &&
			!Number.isNaN(periodEnd.getTime()) &&
			periodStart <= periodEnd &&
			periodStart <= endDate &&
			periodEnd >= startDate
		);
	});
};

/**
 * Shared create path for single and bulk employee benefit enrollments.
 * Creates the program row and non-RECURRING installments when active.
 */
const createEmployeeBenefitRecord = async (
	prisma: PrismaClient,
	validatedData: Record<string, any>,
) => {
	const candidatePayload = normalizeEmployeeBenefitPayload({
		...validatedData,
		totalInstallments:
			validatedData.scheduleMode === "TIME_BOUND" ||
			validatedData.scheduleMode === "RECURRING"
				? undefined
				: validatedData.totalInstallments,
	});
	const periods = BENEFIT_PROGRAM_ACTIVE_STATUSES.has(candidatePayload.status)
		? await getTimeBoundPayrollPeriods(prisma, candidatePayload)
		: undefined;
	const createPayload = normalizeEmployeeBenefitPayload({
		...candidatePayload,
		totalInstallments:
			candidatePayload.scheduleMode === "RECURRING"
				? 0
				: candidatePayload.scheduleMode === "TIME_BOUND"
					? (periods?.length ?? 0)
					: candidatePayload.totalInstallments,
	}) as Prisma.EmployeeBenefitUncheckedCreateInput;
	const employeeBenefit = await prisma.employeeBenefit.create({ data: createPayload });

	// RECURRING installments are ensured lazily during payroll; do not bulk-create.
	if (
		BENEFIT_PROGRAM_ACTIVE_STATUSES.has(employeeBenefit.status) &&
		employeeBenefit.scheduleMode !== "RECURRING"
	) {
		const installments = buildBenefitInstallments(employeeBenefit.id, employeeBenefit, periods);
		for (const row of installments) {
			await prisma.employeeBenefitInstallment.create({ data: row });
		}
	}

	return employeeBenefit;
};

export const controller = (prisma: PrismaClient) => {
	const create = async (req: Request, res: Response, _next: NextFunction) => {
		let requestData = req.body;
		const contentType = req.get("Content-Type") || "";

		if (
			contentType.includes("application/x-www-form-urlencoded") ||
			contentType.includes("multipart/form-data")
		) {
			employeeBenefitLogger.info("Original form data:", JSON.stringify(req.body, null, 2));
			requestData = transformFormDataToObject(req.body);
			employeeBenefitLogger.info(
				"Transformed form data to object structure:",
				JSON.stringify(requestData, null, 2),
			);
		}

		const validation = CreateEmployeeBenefitSchema.safeParse(requestData);
		if (!validation.success) {
			const formattedErrors = formatZodErrors(validation.error.format());
			employeeBenefitLogger.error(`Validation failed: ${JSON.stringify(formattedErrors)}`);
			const errorResponse = buildErrorResponse("Validation failed", 400, formattedErrors);
			res.status(400).json(errorResponse);
			return;
		}

		try {
			const employeeBenefit = await createEmployeeBenefitRecord(
				prisma,
				validation.data as Record<string, any>,
			);
			employeeBenefitLogger.info(
				`EmployeeBenefit created successfully: ${employeeBenefit.id}`,
			);

			logActivity(req, {
				userId: (req as any).user?.id || "unknown",
				action: config.ACTIVITY_LOG.EMPLOYEEBENEFIT.ACTIONS.CREATE_EMPLOYEEBENEFIT,
				description: `${config.ACTIVITY_LOG.EMPLOYEEBENEFIT.DESCRIPTIONS.EMPLOYEEBENEFIT_CREATED}: ${employeeBenefit.id}`,
				page: {
					url: req.originalUrl,
					title: config.ACTIVITY_LOG.EMPLOYEEBENEFIT.PAGES.EMPLOYEEBENEFIT_CREATION,
				},
			});

			logAudit(req, {
				userId: (req as any).user?.id || "unknown",
				action: config.AUDIT_LOG.ACTIONS.CREATE,
				resource: config.AUDIT_LOG.RESOURCES.EMPLOYEEBENEFIT,
				severity: config.AUDIT_LOG.SEVERITY.LOW,
				entityType: config.AUDIT_LOG.ENTITY_TYPES.EMPLOYEEBENEFIT,
				entityId: employeeBenefit.id,
				changesBefore: null,
				changesAfter: {
					id: employeeBenefit.id,
					createdAt: employeeBenefit.createdAt,
					updatedAt: employeeBenefit.updatedAt,
				},
				description: `${config.AUDIT_LOG.EMPLOYEEBENEFIT.DESCRIPTIONS.EMPLOYEEBENEFIT_CREATED}: ${employeeBenefit.id}`,
			});

			try {
				await invalidateCache.byPattern("cache:employeeBenefit:list:*");
				employeeBenefitLogger.info("EmployeeBenefit list cache invalidated after creation");
			} catch (cacheError) {
				employeeBenefitLogger.warn(
					"Failed to invalidate cache after employeeBenefit creation:",
					cacheError,
				);
			}

			const successResponse = buildSuccessResponse(
				config.SUCCESS.EMPLOYEEBENEFIT.CREATED,
				employeeBenefit,
				201,
			);
			res.status(201).json(successResponse);
		} catch (error) {
			employeeBenefitLogger.error(`${config.ERROR.EMPLOYEEBENEFIT.CREATE_FAILED}: ${error}`);
			const errorResponse = buildErrorResponse(
				config.ERROR.COMMON.INTERNAL_SERVER_ERROR,
				500,
			);
			res.status(500).json(errorResponse);
		}
	};

	const bulkCreate = async (req: Request, res: Response, _next: NextFunction) => {
		let requestData = req.body;
		const contentType = req.get("Content-Type") || "";

		if (
			contentType.includes("application/x-www-form-urlencoded") ||
			contentType.includes("multipart/form-data")
		) {
			requestData = transformFormDataToObject(req.body);
		}

		const validation = BulkCreateEmployeeBenefitSchema.safeParse(requestData);
		if (!validation.success) {
			const formattedErrors = formatZodErrors(validation.error.format());
			employeeBenefitLogger.error(
				`Bulk validation failed: ${JSON.stringify(formattedErrors)}`,
			);
			const errorResponse = buildErrorResponse("Validation failed", 400, formattedErrors);
			res.status(400).json(errorResponse);
			return;
		}

		const bulkData = validation.data as unknown as Record<string, any> & {
			employeeIds: string[];
		};
		const { employeeIds, ...sharedFields } = bulkData;
		const uniqueEmployeeIds = Array.from(
			new Set(
				(employeeIds || [])
					.map((id) => String(id || "").trim())
					.filter(Boolean),
			),
		);

		if (uniqueEmployeeIds.length === 0) {
			const errorResponse = buildErrorResponse(
				"Validation failed",
				400,
				[{ field: "employeeIds", message: "At least one employee is required" }],
			);
			res.status(400).json(errorResponse);
			return;
		}

		const created: any[] = [];
		const failed: { employeeId: string; message: string }[] = [];

		try {
			for (const employeeId of uniqueEmployeeIds) {
				try {
					const employeeBenefit = await createEmployeeBenefitRecord(prisma, {
						...sharedFields,
						employeeId,
					});
					created.push(employeeBenefit);
				} catch (error: any) {
					const message =
						error?.message ||
						(typeof error === "string" ? error : "Failed to create employee benefit");
					employeeBenefitLogger.warn(
						`Bulk create failed for employee ${employeeId}: ${message}`,
					);
					failed.push({ employeeId, message });
				}
			}

			if (created.length === 0) {
				const errorResponse = buildErrorResponse(
					"Failed to create employee benefits for all selected employees",
					400,
					failed.map((row) => ({
						field: row.employeeId,
						message: row.message,
					})),
				);
				res.status(400).json(errorResponse);
				return;
			}

			logActivity(req, {
				userId: (req as any).user?.id || "unknown",
				action: config.ACTIVITY_LOG.EMPLOYEEBENEFIT.ACTIONS.CREATE_EMPLOYEEBENEFIT,
				description: `Bulk created ${created.length} employee benefit(s)${
					failed.length ? `; ${failed.length} failed` : ""
				}`,
				page: {
					url: req.originalUrl,
					title: config.ACTIVITY_LOG.EMPLOYEEBENEFIT.PAGES.EMPLOYEEBENEFIT_CREATION,
				},
			});

			logAudit(req, {
				userId: (req as any).user?.id || "unknown",
				action: config.AUDIT_LOG.ACTIONS.CREATE,
				resource: config.AUDIT_LOG.RESOURCES.EMPLOYEEBENEFIT,
				severity: config.AUDIT_LOG.SEVERITY.LOW,
				entityType: config.AUDIT_LOG.ENTITY_TYPES.EMPLOYEEBENEFIT,
				entityId: created[0]?.id,
				changesBefore: null,
				changesAfter: {
					createdCount: created.length,
					failedCount: failed.length,
					ids: created.map((row) => row.id),
				},
				description: `Bulk created ${created.length} employee benefit(s)`,
			});

			try {
				await invalidateCache.byPattern("cache:employeeBenefit:list:*");
			} catch (cacheError) {
				employeeBenefitLogger.warn(
					"Failed to invalidate cache after bulk employeeBenefit creation:",
					cacheError,
				);
			}

			const statusCode = failed.length > 0 ? 207 : 201;
			const successResponse = buildSuccessResponse(
				failed.length > 0
					? `Created ${created.length} benefit(s); ${failed.length} failed`
					: `Created ${created.length} employee benefit(s)`,
				{ created, failed },
				statusCode,
			);
			res.status(statusCode).json(successResponse);
		} catch (error) {
			employeeBenefitLogger.error(`${config.ERROR.EMPLOYEEBENEFIT.CREATE_FAILED}: ${error}`);
			const errorResponse = buildErrorResponse(
				config.ERROR.COMMON.INTERNAL_SERVER_ERROR,
				500,
			);
			res.status(500).json(errorResponse);
		}
	};
	const getAll = async (req: Request, res: Response, _next: NextFunction) => {
		const validationResult = validateQueryParams(req, employeeBenefitLogger);

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

		employeeBenefitLogger.info(
			`Getting employeeBenefits, page: ${page}, limit: ${limit}, query: ${query}, order: ${order}, groupBy: ${groupBy}`,
		);

		try {
			// Base where clause
			const whereClause: Prisma.EmployeeBenefitWhereInput = {
				isDeleted: false,
			};

			const searchFields = [
				"name",
				"status",
				"employee.employeeId",
				"employee.person.personalInfo.firstName",
				"employee.person.personalInfo.lastName",
				"benefitType.name",
			];
			if (query) {
				const searchConditions = buildSearchConditions(
					"EmployeeBenefit",
					query,
					searchFields,
				);
				if (searchConditions.length > 0) {
					whereClause.OR = searchConditions;
				}
			}

			if (filter) {
				const filterConditions = buildFilterConditions("EmployeeBenefit", filter);
				if (filterConditions.length > 0) {
					whereClause.AND = filterConditions;
				}
			}
			const findManyQuery = buildFindManyQuery(whereClause, skip, limit, order, sort, fields);

			const [employeeBenefits, total] = await Promise.all([
				document ? prisma.employeeBenefit.findMany(findManyQuery) : [],
				count ? prisma.employeeBenefit.count({ where: whereClause }) : 0,
			]);

			employeeBenefitLogger.info(`Retrieved ${employeeBenefits.length} employeeBenefits`);
			const processedData =
				groupBy && document
					? groupDataByField(employeeBenefits, groupBy as string)
					: employeeBenefits;

			const responseData: Record<string, any> = {
				...(document && { employeeBenefits: processedData }),
				...(count && { count: total }),
				...(pagination && { pagination: buildPagination(total, page, limit) }),
				...(groupBy && { groupedBy: groupBy }),
			};

			res.status(200).json(
				buildSuccessResponse(
					config.SUCCESS.EMPLOYEEBENEFIT.RETRIEVED_ALL,
					responseData,
					200,
				),
			);
		} catch (error) {
			employeeBenefitLogger.error(`${config.ERROR.EMPLOYEEBENEFIT.GET_ALL_FAILED}: ${error}`);
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
				employeeBenefitLogger.error(config.ERROR.QUERY_PARAMS.MISSING_ID);
				const errorResponse = buildErrorResponse(config.ERROR.QUERY_PARAMS.MISSING_ID, 400);
				res.status(400).json(errorResponse);
				return;
			}

			if (fields && typeof fields !== "string") {
				employeeBenefitLogger.error(
					`${config.ERROR.QUERY_PARAMS.INVALID_POPULATE}: ${fields}`,
				);
				const errorResponse = buildErrorResponse(
					config.ERROR.QUERY_PARAMS.POPULATE_MUST_BE_STRING,
					400,
				);
				res.status(400).json(errorResponse);
				return;
			}

			employeeBenefitLogger.info(`${config.SUCCESS.EMPLOYEEBENEFIT.GETTING_BY_ID}: ${id}`);

			const cacheKey = `cache:employeeBenefit:byId:${id}:${fields || "full"}`;
			let employeeBenefit = null;

			try {
				if (redisClient.isClientConnected()) {
					employeeBenefit = await redisClient.getJSON(cacheKey);
					if (employeeBenefit) {
						employeeBenefitLogger.info(
							`EmployeeBenefit ${id} retrieved from direct Redis cache`,
						);
					}
				}
			} catch (cacheError) {
				employeeBenefitLogger.warn(
					`Redis cache retrieval failed for employeeBenefit ${id}:`,
					cacheError,
				);
			}

			if (!employeeBenefit) {
				const query: Prisma.EmployeeBenefitFindFirstArgs = {
					where: { id },
				};

				query.select = getNestedFields(fields);

				employeeBenefit = await prisma.employeeBenefit.findFirst(query);

				if (employeeBenefit && redisClient.isClientConnected()) {
					try {
						await redisClient.setJSON(cacheKey, employeeBenefit, 3600);
						employeeBenefitLogger.info(
							`EmployeeBenefit ${id} stored in direct Redis cache`,
						);
					} catch (cacheError) {
						employeeBenefitLogger.warn(
							`Failed to store employeeBenefit ${id} in Redis cache:`,
							cacheError,
						);
					}
				}
			}

			if (!employeeBenefit) {
				employeeBenefitLogger.error(`${config.ERROR.EMPLOYEEBENEFIT.NOT_FOUND}: ${id}`);
				const errorResponse = buildErrorResponse(
					config.ERROR.EMPLOYEEBENEFIT.NOT_FOUND,
					404,
				);
				res.status(404).json(errorResponse);
				return;
			}

			employeeBenefitLogger.info(
				`${config.SUCCESS.EMPLOYEEBENEFIT.RETRIEVED}: ${(employeeBenefit as any).id}`,
			);
			const successResponse = buildSuccessResponse(
				config.SUCCESS.EMPLOYEEBENEFIT.RETRIEVED,
				employeeBenefit,
				200,
			);
			res.status(200).json(successResponse);
		} catch (error) {
			employeeBenefitLogger.error(`${config.ERROR.EMPLOYEEBENEFIT.ERROR_GETTING}: ${error}`);
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
				employeeBenefitLogger.error(config.ERROR.QUERY_PARAMS.MISSING_ID);
				const errorResponse = buildErrorResponse(config.ERROR.QUERY_PARAMS.MISSING_ID, 400);
				res.status(400).json(errorResponse);
				return;
			}

			const validationResult = UpdateEmployeeBenefitSchema.safeParse(req.body);

			if (!validationResult.success) {
				const formattedErrors = formatZodErrors(validationResult.error.format());
				employeeBenefitLogger.error(
					`Validation failed: ${JSON.stringify(formattedErrors)}`,
				);
				const errorResponse = buildErrorResponse("Validation failed", 400, formattedErrors);
				res.status(400).json(errorResponse);
				return;
			}

			if (Object.keys(req.body).length === 0) {
				employeeBenefitLogger.error(config.ERROR.COMMON.NO_UPDATE_FIELDS);
				const errorResponse = buildErrorResponse(config.ERROR.COMMON.NO_UPDATE_FIELDS, 400);
				res.status(400).json(errorResponse);
				return;
			}

			const validatedData = validationResult.data;

			employeeBenefitLogger.info(`Updating employeeBenefit: ${id}`);

			const existingEmployeeBenefit = await prisma.employeeBenefit.findFirst({
				where: { id },
			});

			if (!existingEmployeeBenefit) {
				employeeBenefitLogger.error(`${config.ERROR.EMPLOYEEBENEFIT.NOT_FOUND}: ${id}`);
				const errorResponse = buildErrorResponse(
					config.ERROR.EMPLOYEEBENEFIT.NOT_FOUND,
					404,
				);
				res.status(404).json(errorResponse);
				return;
			}

			const scheduleMode = validatedData.scheduleMode ?? existingEmployeeBenefit.scheduleMode;
			const candidatePayload = normalizeEmployeeBenefitPayload({
				...existingEmployeeBenefit,
				...validatedData,
				totalInstallments:
					scheduleMode === "TIME_BOUND" || scheduleMode === "RECURRING"
						? undefined
						: validatedData.totalInstallments ?? existingEmployeeBenefit.totalInstallments,
			});
			const candidateValidation = UpdateEmployeeBenefitSchema.safeParse({
				scheduleMode: candidatePayload.scheduleMode,
				startDate: candidatePayload.startDate,
				endDate: candidatePayload.endDate,
				...(candidatePayload.scheduleMode === "FIXED_INSTALLMENTS"
					? { totalInstallments: candidatePayload.totalInstallments }
					: {}),
			});
			if (!candidateValidation.success) {
				const formattedErrors = formatZodErrors(candidateValidation.error.format());
				employeeBenefitLogger.error(
					`Validation failed: ${JSON.stringify(formattedErrors)}`,
				);
				const errorResponse = buildErrorResponse("Validation failed", 400, formattedErrors);
				res.status(400).json(errorResponse);
				return;
			}
			const periods = BENEFIT_PROGRAM_ACTIVE_STATUSES.has(candidatePayload.status)
				? await getTimeBoundPayrollPeriods(prisma, candidatePayload)
				: undefined;
			const prismaData = normalizeEmployeeBenefitPayload({
				...candidatePayload,
				totalInstallments:
					candidatePayload.scheduleMode === "RECURRING"
						? 0
						: candidatePayload.scheduleMode === "TIME_BOUND"
							? (periods?.length ?? 0)
							: candidatePayload.totalInstallments,
			}) as Prisma.EmployeeBenefitUncheckedUpdateInput;

			const updatedEmployeeBenefit = await prisma.employeeBenefit.update({
				where: { id },
				data: prismaData,
			});

			// RECURRING installments are ensured lazily during payroll; never bulk-regenerate.
			if (
				BENEFIT_PROGRAM_ACTIVE_STATUSES.has(updatedEmployeeBenefit.status) &&
				updatedEmployeeBenefit.scheduleMode !== "RECURRING"
			) {
				const existingInstallments = await prisma.employeeBenefitInstallment.count({
					where: { employeeBenefitId: id },
				});
				if (existingInstallments === 0) {
					const installments = buildBenefitInstallments(id, updatedEmployeeBenefit, periods);
					for (const row of installments) {
						await prisma.employeeBenefitInstallment.create({ data: row });
					}
				}
			}

			try {
				await invalidateCache.byPattern(`cache:employeeBenefit:byId:${id}:*`);
				await invalidateCache.byPattern("cache:employeeBenefit:list:*");
				employeeBenefitLogger.info(`Cache invalidated after employeeBenefit ${id} update`);
			} catch (cacheError) {
				employeeBenefitLogger.warn(
					"Failed to invalidate cache after employeeBenefit update:",
					cacheError,
				);
			}

			employeeBenefitLogger.info(
				`${config.SUCCESS.EMPLOYEEBENEFIT.UPDATED}: ${updatedEmployeeBenefit.id}`,
			);
			const successResponse = buildSuccessResponse(
				config.SUCCESS.EMPLOYEEBENEFIT.UPDATED,
				{ employeeBenefit: updatedEmployeeBenefit },
				200,
			);
			res.status(200).json(successResponse);
		} catch (error) {
			employeeBenefitLogger.error(`${config.ERROR.EMPLOYEEBENEFIT.ERROR_UPDATING}: ${error}`);
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
				employeeBenefitLogger.error(config.ERROR.QUERY_PARAMS.MISSING_ID);
				const errorResponse = buildErrorResponse(config.ERROR.QUERY_PARAMS.MISSING_ID, 400);
				res.status(400).json(errorResponse);
				return;
			}

			employeeBenefitLogger.info(`${config.SUCCESS.EMPLOYEEBENEFIT.DELETED}: ${id}`);

			const existingEmployeeBenefit = await prisma.employeeBenefit.findFirst({
				where: { id },
			});

			if (!existingEmployeeBenefit) {
				employeeBenefitLogger.error(`${config.ERROR.EMPLOYEEBENEFIT.NOT_FOUND}: ${id}`);
				const errorResponse = buildErrorResponse(
					config.ERROR.EMPLOYEEBENEFIT.NOT_FOUND,
					404,
				);
				res.status(404).json(errorResponse);
				return;
			}

			await prisma.employeeBenefit.delete({
				where: { id },
			});

			try {
				await invalidateCache.byPattern(`cache:employeeBenefit:byId:${id}:*`);
				await invalidateCache.byPattern("cache:employeeBenefit:list:*");
				employeeBenefitLogger.info(
					`Cache invalidated after employeeBenefit ${id} deletion`,
				);
			} catch (cacheError) {
				employeeBenefitLogger.warn(
					"Failed to invalidate cache after employeeBenefit deletion:",
					cacheError,
				);
			}

			employeeBenefitLogger.info(`${config.SUCCESS.EMPLOYEEBENEFIT.DELETED}: ${id}`);
			const successResponse = buildSuccessResponse(
				config.SUCCESS.EMPLOYEEBENEFIT.DELETED,
				{},
				200,
			);
			res.status(200).json(successResponse);
		} catch (error) {
			employeeBenefitLogger.error(`${config.ERROR.EMPLOYEEBENEFIT.DELETE_FAILED}: ${error}`);
			const errorResponse = buildErrorResponse(
				config.ERROR.COMMON.INTERNAL_SERVER_ERROR,
				500,
			);
			res.status(500).json(errorResponse);
		}
	};

	const importBenefits = async (req: Request, res: Response, _next: NextFunction) => {
		try {
			console.log("Import benefits request received");
			if (!req.file) {
				console.error("No file uploaded");
				const errorResponse = buildErrorResponse("No file uploaded", 400);
				res.status(400).json(errorResponse);
				return;
			}

			console.log("File received:", req.file.originalname, "Size:", req.file.size);

			const buffer = req.file.buffer;
			const workbook = xlsx.read(buffer, { type: "buffer" });
			const sheetName = workbook.SheetNames[0];
			const sheet = workbook.Sheets[sheetName];
			const rawData = xlsx.utils.sheet_to_json(sheet);

			console.log("Parsed raw data length:", rawData.length);

			if (rawData.length === 0) {
				console.error("File is empty or could not be parsed");
				const errorResponse = buildErrorResponse("File is empty", 400);
				res.status(400).json(errorResponse);
				return;
			}

			const results = {
				success: 0,
				failed: 0,
				errors: [] as any[],
			};

			const processedData = rawData.map((row: any) => {
				// Normalize keys to upper case to match template
				const normalizedRow: any = {};
				Object.keys(row).forEach((key) => {
					normalizedRow[key.toUpperCase().trim()] = row[key];
				});
				return normalizedRow;
			});

			console.log("Processed data sample (first row):", processedData[0]);

			for (const [index, row] of processedData.entries()) {
				try {
					const employeeNumber = row["EMPLOYEE_NUMBER"];
					const benefitTypeName = row["BENEFIT_TYPE"];

					if (!employeeNumber || !benefitTypeName) {
						throw new Error(
							`Missing EMPLOYEE_NUMBER or BENEFIT_TYPE. Row data: ${JSON.stringify(row)}`,
						);
					}

					console.log(
						`Processing row ${index + 1}: Employee ${employeeNumber}, Benefit ${benefitTypeName}`,
					);

					// Find Employee - Try exact match first, then maybe fallback if needed (but currently exact)
					// Verify what 'employeeId' field in Employee model actually holds (is it the user-facing ID?)
					const employee = await prisma.employee.findFirst({
						where: { employeeId: String(employeeNumber) },
						select: { id: true, organizationId: true },
					});

					if (!employee) {
						console.error(`Employee not found for number: ${employeeNumber}`);
						throw new Error(`Employee not found: ${employeeNumber}`);
					}

					// Find Benefit Type
					const benefitType = await prisma.benefitType.findFirst({
						where: {
							name: String(benefitTypeName),
							organizationId: employee.organizationId,
						},
						select: { id: true },
					});

					if (!benefitType) {
						console.error(
							`Benefit Type not found: ${benefitTypeName} for org ${employee.organizationId}`,
						);
						throw new Error(`Benefit Type not found: ${benefitTypeName}`);
					}

					// Prepare data
					const amount = parseFloat(row["AMOUNT"] || "0");
					const startDate = row["START_DATE"] ? new Date(row["START_DATE"]) : new Date();
					const endDate = row["END_DATE"] ? new Date(row["END_DATE"]) : null;
					const isActive =
						row["IS_ACTIVE"] === "TRUE" ||
						row["IS_ACTIVE"] === true ||
						row["IS_ACTIVE"] === "true";
					const notes = row["NOTES"] || "";
					const description = row["DESCRIPTION"] || row["NAME"] || "";
					const name = row["NAME"] || benefitTypeName;

					console.log(
						`Upserting benefit for Employee ID ${employee.id} and BenefitType ID ${benefitType.id}`,
					);

					console.log(
						`Checking for existing benefit for Employee ID ${employee.id} and BenefitType ID ${benefitType.id}`,
					);

					// Check for existing benefit
					const existingBenefit = await prisma.employeeBenefit.findFirst({
						where: {
							employeeId: employee.id,
							benefitTypeId: benefitType.id,
						},
					});

					const normalizedPayload = normalizeEmployeeBenefitPayload({
						organizationId: employee.organizationId,
						employeeId: employee.id,
						benefitTypeId: benefitType.id,
						amount,
						totalAmount: amount,
						totalInstallments: 6,
						startDate,
						endDate,
						startPayrollCutOff: startDate,
						endPayrollCutOff: endDate || undefined,
						isActive,
						status: isActive ? "ACTIVE" : "PENDING",
						notes,
						description,
						name,
					}) as Prisma.EmployeeBenefitUncheckedCreateInput;

					if (existingBenefit) {
						console.log(`Updating existing benefit: ${existingBenefit.id}`);
						await prisma.employeeBenefit.update({
							where: { id: existingBenefit.id },
							data: normalizedPayload,
						});
						if (isActive) {
							const installmentCount = await prisma.employeeBenefitInstallment.count({
								where: { employeeBenefitId: existingBenefit.id },
							});
							if (installmentCount === 0) {
								const rows = buildBenefitInstallments(existingBenefit.id, normalizedPayload);
								for (const schedule of rows) {
									await prisma.employeeBenefitInstallment.create({ data: schedule });
								}
							}
						}
						results.success++;
					} else {
						console.log(`Creating new benefit`);
						const createdBenefit = await prisma.employeeBenefit.create({ data: normalizedPayload });
						if (isActive) {
							const rows = buildBenefitInstallments(createdBenefit.id, createdBenefit);
							for (const schedule of rows) {
								await prisma.employeeBenefitInstallment.create({ data: schedule });
							}
						}
						results.success++;
					}
				} catch (error: any) {
					console.error(`Row ${index + 1} failed:`, error.message);
					results.failed++;
					results.errors.push({
						row: index + 2, // +1 for 0-index, +1 for header
						error: error.message,
						data: row,
					});
				}
			}

			employeeBenefitLogger.info(
				`Import completed. Success: ${results.success}, Failed: ${results.failed}`,
			);

			console.log("Import results:", results);

			const successResponse = buildSuccessResponse("Import completed", results, 200);
			res.status(200).json(successResponse);
		} catch (error) {
			employeeBenefitLogger.error(`Import failed: ${error}`);
			console.error("Import critical error:", error);
			const errorResponse = buildErrorResponse(
				config.ERROR.COMMON.INTERNAL_SERVER_ERROR,
				500,
			);
			res.status(500).json(errorResponse);
		}
	};

	return { create, bulkCreate, getAll, getById, update, remove, importBenefits };
};
