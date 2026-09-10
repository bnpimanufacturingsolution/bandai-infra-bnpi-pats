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
	QuickAdjustEmployeeBenefitSchema,
} from "../../zod/employeebenefit.zod";
import {
	normalizeEmployeeBenefitPayload,
	buildBenefitInstallments,
	BENEFIT_PROGRAM_ACTIVE_STATUSES,
	type BenefitSchedulePeriod,
} from "../../helper/employee-benefit-program.helper";
import {
	normalizeBenefitImportRow,
	validateBenefitImportRow,
} from "../../helper/employee-benefit-import.helper";

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

const ELIGIBILITY_PAYLOAD_KEYS = [
	"eligibilityMode",
	"eligibilityDisqualifyOnAbsent",
	"eligibilityDisqualifyOnLate",
	"eligibilityDisqualifyOnUndertime",
	"eligibilityDisqualifyOnLeave",
] as const;

/**
 * When create/bulk payload omits eligibility keys, prefill from BenefitType policy defaults.
 * Explicit request keys always win (even if type defaults exist).
 */
const mergeEligibilityDefaultsFromBenefitType = async (
	prisma: PrismaClient,
	requestData: Record<string, any>,
): Promise<Record<string, any>> => {
	const benefitTypeId = requestData?.benefitTypeId;
	if (!benefitTypeId) return requestData;

	const missingKeys = ELIGIBILITY_PAYLOAD_KEYS.filter(
		(key) => requestData[key] === undefined || requestData[key] === null,
	);
	if (missingKeys.length === 0) return requestData;

	const benefitType = await prisma.benefitType.findFirst({
		where: { id: String(benefitTypeId), isDeleted: false },
		select: {
			defaultEligibilityMode: true,
			defaultEligibilityDisqualifyOnAbsent: true,
			defaultEligibilityDisqualifyOnLate: true,
			defaultEligibilityDisqualifyOnUndertime: true,
			defaultEligibilityDisqualifyOnLeave: true,
		},
	});
	if (!benefitType) return requestData;

	const merged = { ...requestData };
	if (
		(merged.eligibilityMode === undefined || merged.eligibilityMode === null) &&
		benefitType.defaultEligibilityMode
	) {
		merged.eligibilityMode = benefitType.defaultEligibilityMode;
	}
	if (
		(merged.eligibilityDisqualifyOnAbsent === undefined ||
			merged.eligibilityDisqualifyOnAbsent === null) &&
		benefitType.defaultEligibilityDisqualifyOnAbsent != null
	) {
		merged.eligibilityDisqualifyOnAbsent = benefitType.defaultEligibilityDisqualifyOnAbsent;
	}
	if (
		(merged.eligibilityDisqualifyOnLate === undefined ||
			merged.eligibilityDisqualifyOnLate === null) &&
		benefitType.defaultEligibilityDisqualifyOnLate != null
	) {
		merged.eligibilityDisqualifyOnLate = benefitType.defaultEligibilityDisqualifyOnLate;
	}
	if (
		(merged.eligibilityDisqualifyOnUndertime === undefined ||
			merged.eligibilityDisqualifyOnUndertime === null) &&
		benefitType.defaultEligibilityDisqualifyOnUndertime != null
	) {
		merged.eligibilityDisqualifyOnUndertime =
			benefitType.defaultEligibilityDisqualifyOnUndertime;
	}
	if (
		(merged.eligibilityDisqualifyOnLeave === undefined ||
			merged.eligibilityDisqualifyOnLeave === null) &&
		benefitType.defaultEligibilityDisqualifyOnLeave != null
	) {
		merged.eligibilityDisqualifyOnLeave = benefitType.defaultEligibilityDisqualifyOnLeave;
	}
	return merged;
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

		const requestWithTypeDefaults = await mergeEligibilityDefaultsFromBenefitType(
			prisma,
			requestData as Record<string, any>,
		);
		const validation = CreateEmployeeBenefitSchema.safeParse(requestWithTypeDefaults);
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

		const requestWithTypeDefaults = await mergeEligibilityDefaultsFromBenefitType(
			prisma,
			requestData as Record<string, any>,
		);
		const validation = BulkCreateEmployeeBenefitSchema.safeParse(requestWithTypeDefaults);
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
			if (!req.file) {
				const errorResponse = buildErrorResponse("No file uploaded", 400);
				res.status(400).json(errorResponse);
				return;
			}

			const buffer = req.file.buffer;
			const workbook = xlsx.read(buffer, { type: "buffer", cellDates: true });
			const sheetName = workbook.SheetNames[0];
			if (!sheetName) {
				const errorResponse = buildErrorResponse("File has no worksheets", 400);
				res.status(400).json(errorResponse);
				return;
			}
			const sheet = workbook.Sheets[sheetName];
			const rawData = xlsx.utils.sheet_to_json<Record<string, unknown>>(sheet, {
				defval: "",
				raw: true,
			});

			if (!rawData.length) {
				const errorResponse = buildErrorResponse("File is empty", 400);
				res.status(400).json(errorResponse);
				return;
			}

			const results = {
				success: 0,
				failed: 0,
				errors: [] as Array<{ row: number; error: string; data?: Record<string, unknown> }>,
			};

			const orgFromAuth =
				(req as any).user?.organizationId ||
				(req as any).organizationId ||
				undefined;

			// Cache lookups within this import
			const employeeCache = new Map<string, { id: string; organizationId: string } | null>();
			const benefitTypesByOrg = new Map<
				string,
				Array<{ id: string; name: string; code: string | null }>
			>();

			const resolveEmployee = async (employeeNumber: string, organizationId?: string) => {
				const cacheKey = `${organizationId || "*"}:${employeeNumber}`;
				if (employeeCache.has(cacheKey)) return employeeCache.get(cacheKey)!;
				const employee = await prisma.employee.findFirst({
					where: {
						employeeId: employeeNumber,
						isDeleted: false,
						...(organizationId ? { organizationId } : {}),
					},
					select: { id: true, organizationId: true },
				});
				employeeCache.set(cacheKey, employee);
				return employee;
			};

			const loadBenefitTypes = async (organizationId: string) => {
				if (benefitTypesByOrg.has(organizationId)) {
					return benefitTypesByOrg.get(organizationId)!;
				}
				const types = await prisma.benefitType.findMany({
					where: { organizationId, isDeleted: false },
					select: { id: true, name: true, code: true },
				});
				benefitTypesByOrg.set(organizationId, types);
				return types;
			};

			const resolveBenefitType = async (
				organizationId: string,
				code: string | null,
				name: string | null,
			) => {
				const types = await loadBenefitTypes(organizationId);
				if (code) {
					const upper = code.toUpperCase();
					const byCode = types.find(
						(t) => String(t.code || "").trim().toUpperCase() === upper,
					);
					if (byCode) return byCode;
				}
				if (name) {
					const upperName = name.toUpperCase();
					const byName = types.find(
						(t) => String(t.name || "").trim().toUpperCase() === upperName,
					);
					if (byName) return byName;
				}
				return null;
			};

			for (const [index, rawRow] of rawData.entries()) {
				const sheetRow = index + 2; // header is row 1
				const row = normalizeBenefitImportRow(rawRow as Record<string, unknown>);
				try {
					const validated = validateBenefitImportRow(row);
					if (!validated.ok) {
						throw new Error(validated.error);
					}

					const employee = await resolveEmployee(
						validated.employeeNumber,
						orgFromAuth ? String(orgFromAuth) : undefined,
					);
					if (!employee) {
						throw new Error(`Employee not found: ${validated.employeeNumber}`);
					}
					if (orgFromAuth && String(employee.organizationId) !== String(orgFromAuth)) {
						throw new Error(
							`Employee ${validated.employeeNumber} is outside your organization`,
						);
					}

					const benefitType = await resolveBenefitType(
						employee.organizationId,
						validated.benefitCode,
						validated.benefitTypeName,
					);
					if (!benefitType) {
						const label = validated.benefitCode || validated.benefitTypeName || "unknown";
						throw new Error(`Benefit type not found: ${label}`);
					}

					const existingBenefit = await prisma.employeeBenefit.findFirst({
						where: {
							employeeId: employee.id,
							benefitTypeId: benefitType.id,
							isDeleted: false,
						},
						select: { id: true },
					});
					if (existingBenefit) {
						throw new Error(
							`Employee ${validated.employeeNumber} is already enrolled in benefit ${
								benefitType.code || benefitType.name
							}`,
						);
					}

					const enrollmentName = validated.name || benefitType.name;
					// Always active on import (no IS_ACTIVE column in template).
					const isActive = true;
					const status = "ACTIVE";

					let createPayload: Record<string, any> = {
						organizationId: employee.organizationId,
						employeeId: employee.id,
						benefitTypeId: benefitType.id,
						amount: validated.amount,
						totalAmount: validated.amount,
						startDate: validated.startDate,
						endDate: validated.endDate || undefined,
						startPayrollCutOff: validated.startDate,
						endPayrollCutOff: validated.endDate || undefined,
						scheduleMode: "RECURRING",
						recurrenceFrequency: "EVERY_CUTOFF",
						totalInstallments: 0,
						attendanceBased: false,
						attendanceAmountBasis: null,
						isActive,
						status,
						name: enrollmentName,
						description: validated.description || undefined,
						notes: validated.notes || undefined,
						currency: "PHP",
						agreedToTerms: true,
					};

					createPayload = await mergeEligibilityDefaultsFromBenefitType(
						prisma,
						createPayload,
					);

					await createEmployeeBenefitRecord(prisma, createPayload);
					results.success += 1;
				} catch (error: any) {
					const message = error?.message || "Failed to import row";
					employeeBenefitLogger.warn(`Benefit import row ${sheetRow} failed: ${message}`);
					results.failed += 1;
					results.errors.push({
						row: sheetRow,
						error: message,
						data: row,
					});
				}
			}

			employeeBenefitLogger.info(
				`Benefit import completed. Success: ${results.success}, Failed: ${results.failed}`,
			);

			try {
				await invalidateCache.byPattern("cache:employeeBenefit:list:*");
			} catch (cacheError) {
				employeeBenefitLogger.warn(
					"Failed to invalidate cache after benefit import:",
					cacheError,
				);
			}

			if (results.success === 0 && results.failed > 0) {
				const errorResponse = buildErrorResponse(
					"Import failed for all rows",
					400,
					results.errors.map((e) => ({
						field: `row ${e.row}`,
						message: e.error,
					})),
				);
				// Still return row details for the UI
				(errorResponse as any).data = results;
				res.status(400).json({
					...errorResponse,
					data: results,
				});
				return;
			}

			const successResponse = buildSuccessResponse("Import completed", results, 200);
			res.status(200).json(successResponse);
		} catch (error) {
			employeeBenefitLogger.error(`Import failed: ${error}`);
			const errorResponse = buildErrorResponse(
				config.ERROR.COMMON.INTERNAL_SERVER_ERROR,
				500,
			);
			res.status(500).json(errorResponse);
		}
	};

	const quickAdjust = async (req: Request, res: Response, _next: NextFunction) => {
		const organizationId = (req as any).organizationId;
		if (!organizationId) {
			res.status(401).json(buildErrorResponse("Unauthorized access", 401));
			return;
		}
		const validation = QuickAdjustEmployeeBenefitSchema.safeParse(req.body || {});
		if (!validation.success) {
			const formattedErrors = formatZodErrors(validation.error.format());
			const errorResponse = buildErrorResponse("Validation failed", 400, formattedErrors);
			res.status(400).json(errorResponse);
			return;
		}
		const { employeeIds, direction, name, amount, payrollPeriodId } = validation.data;
		// Standard carriers: OAD (Other Compensation) for additions, NEGADJ
		// (Negative Adjustment) for deductions. The custom label rides on the
		// enrollment name so the register/accordion shows "Good performance".
		const benefitCode = direction === "ADDITION" ? "OAD" : "NEGADJ";
		try {
			const period = await prisma.payrollPeriod.findFirst({
				where: { id: payrollPeriodId, organizationId, isDeleted: false },
				select: { id: true, code: true, status: true, startDate: true, endDate: true },
			});
			if (!period) {
				res.status(404).json(buildErrorResponse("Payroll period not found", 404));
				return;
			}
			const carrier = await prisma.benefitType.findFirst({
				where: { organizationId, code: benefitCode, isActive: true, isDeleted: false },
			});
			if (!carrier) {
				res.status(400).json(
					buildErrorResponse(`Standard benefit type ${benefitCode} is not available`, 400),
				);
				return;
			}
			const employees = await prisma.employee.findMany({
				where: { id: { in: employeeIds }, organizationId, isDeleted: false },
				select: { id: true, employeeId: true },
			});
			const foundIds = new Set(employees.map((employee: any) => String(employee.id)));
			const created: any[] = [];
			const failed: { employeeId: string; message: string }[] = [];
			for (const employeeId of Array.from(new Set(employeeIds.map((id) => String(id))))) {
				if (!foundIds.has(employeeId)) {
					failed.push({ employeeId, message: "Employee not found in this organization" });
					continue;
				}
				try {
					const record = await createEmployeeBenefitRecord(prisma, {
						organizationId,
						employeeId,
						benefitTypeId: carrier.id,
						name,
						description: `Quick ${direction.toLowerCase()} for ${period.code}`,
						amount,
						totalAmount: amount,
						installmentAmount: amount,
						currency: "PHP",
						scheduleMode: "RECURRING",
						recurrenceFrequency: "EVERY_CUTOFF",
						payrollPeriodId,
						startDate: period.startDate,
						endDate: period.endDate,
						status: "ACTIVE",
						isActive: true,
						attendanceBased: false,
						eligibilityMode: "ENROLLED_ALWAYS",
						eligibilityDisqualifyOnAbsent: false,
						eligibilityDisqualifyOnLate: false,
						eligibilityDisqualifyOnUndertime: false,
						eligibilityDisqualifyOnLeave: false,
						agreedToTerms: false,
					});
					created.push(record);
				} catch (error: any) {
					failed.push({ employeeId, message: error?.message || "Failed to create adjustment" });
				}
			}
			if (created.length === 0) {
				const errorResponse = buildErrorResponse(
					"Failed to create quick adjustments",
					400,
					failed.map((row) => ({ field: row.employeeId, message: row.message })),
				);
				res.status(400).json(errorResponse);
				return;
			}
			logActivity(req, {
				userId: (req as any).user?.id || "unknown",
				action: config.ACTIVITY_LOG.EMPLOYEEBENEFIT.ACTIONS.CREATE_EMPLOYEEBENEFIT,
				description: `Quick ${direction.toLowerCase()} "${name}" ${amount} for ${created.length} employee(s) in ${period.code}`,
				page: {
					url: req.originalUrl,
					title: config.ACTIVITY_LOG.EMPLOYEEBENEFIT.PAGES.EMPLOYEEBENEFIT_CREATION,
				},
			});
			try {
				await invalidateCache.byPattern("cache:employeeBenefit:list:*");
			} catch (cacheError) {
				employeeBenefitLogger.warn("Failed to invalidate cache after quick adjust:", cacheError);
			}
			res.status(201).json(
				buildSuccessResponse("Quick adjustment created", {
					benefitCode,
					payrollPeriodId,
					created,
					failed,
				}, 201),
			);
		} catch (error) {
			employeeBenefitLogger.error(`Quick adjust failed: ${error}`);
			res.status(500).json(buildErrorResponse(config.ERROR.COMMON.INTERNAL_SERVER_ERROR, 500));
		}
	};

	return { create, bulkCreate, getAll, getById, update, remove, importBenefits, quickAdjust };
};
