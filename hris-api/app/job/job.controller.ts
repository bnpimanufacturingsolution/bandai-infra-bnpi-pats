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
import { CreateJobSchema, UpdateJobSchema } from "../../zod/job.zod";
import { logActivity } from "../../utils/activityLogger";
import { logAudit } from "../../utils/auditLogger";
import { config } from "../../config/constant";
import { redisClient } from "../../config/redis";
import { invalidateCache } from "../../middleware/cache";
import {
	countCurrentHeadcount,
	getOrCreateWorkforceRecruitmentSetting,
	resolveWorkforcePolicy,
	serializeWorkforceRecruitmentSetting,
} from "../../helper/workforce-recruitment.helper";

const logger = getLogger();
const jobLogger = logger.child({ module: "job" });

export const controller = (prisma: PrismaClient) => {
	const resolveJobRecruitmentScope = async (
		organizationId: string,
		data: {
			departmentId?: string | null;
			sectionId?: string | null;
			positionId?: string | null;
			levelId?: string | null;
		},
	) => {
		const positionId = String(data.positionId || "").trim();
		const position = positionId
			? await prisma.position.findFirst({
					where: { id: positionId, organizationId, isDeleted: false },
					select: {
						id: true,
						sectionId: true,
						section: {
							select: {
								departmentId: true,
							},
						},
					},
			  })
			: null;

		return {
			departmentId:
				String(data.departmentId || position?.section?.departmentId || "").trim() || null,
			sectionId: String(data.sectionId || position?.sectionId || "").trim() || null,
			positionId: position?.id || positionId || null,
			levelId: String(data.levelId || "").trim() || null,
		};
	};

	const assertJobHeadcountCapacity = async (
		organizationId: string,
		data: {
			departmentId?: string | null;
			sectionId?: string | null;
			positionId?: string | null;
			levelId?: string | null;
			headcountRequested?: number | null;
		},
	) => {
		const requestedHeadcount = Math.max(
			1,
			Math.floor(Number(data.headcountRequested || 1)),
		);
		const settingsRecord = await getOrCreateWorkforceRecruitmentSetting(
			prisma,
			organizationId,
		);
		const settings = serializeWorkforceRecruitmentSetting(settingsRecord);
		if (!settings.isEnabled) return;

		const scope = await resolveJobRecruitmentScope(organizationId, data);
		const policy = resolveWorkforcePolicy(settings, scope);
		if (!policy || !policy.isActive || Number(policy.targetHeadcount || 0) <= 0) return;

		const currentHeadcount = await countCurrentHeadcount(prisma, {
			organizationId,
			...scope,
		});
		const availableHeadcount = Math.max(
			0,
			Number(policy.targetHeadcount || 0) - currentHeadcount,
		);
		if (requestedHeadcount <= availableHeadcount || policy.limitBehavior !== "BLOCK") return;

		const scopeLabel = [
			scope.sectionId ? "section" : null,
			scope.positionId ? "position" : null,
			scope.levelId ? "level" : null,
		]
			.filter(Boolean)
			.join(" / ");
		const message =
			availableHeadcount <= 0
				? `No hiring capacity is available for this ${scopeLabel || "job scope"}. Current headcount is ${currentHeadcount} against a target of ${policy.targetHeadcount}.`
				: `Requested headcount (${requestedHeadcount}) exceeds available hiring capacity (${availableHeadcount}) for this job scope.`;
		const error = new Error(message) as Error & {
			statusCode?: number;
			details?: Array<{ field?: string; message: string }>;
		};
		error.statusCode = 400;
		error.details = [
			{
				field: "headcountRequested",
				message,
			},
		];
		throw error;
	};

	const create = async (req: Request, res: Response, _next: NextFunction) => {
		const organizationId = (req as any).organizationId;
		let requestData = req.body;
		const contentType = req.get("Content-Type") || "";

		if (!organizationId) {
			res.status(401).json(buildErrorResponse("Organization ID is required", 401));
			return;
		}

		if (
			contentType.includes("application/x-www-form-urlencoded") ||
			contentType.includes("multipart/form-data")
		) {
			jobLogger.info("Original form data:", JSON.stringify(req.body, null, 2));
			requestData = transformFormDataToObject(req.body);
			jobLogger.info(
				"Transformed form data to object structure:",
				JSON.stringify(requestData, null, 2),
			);
		}

		requestData = {
			...requestData,
			organizationId,
		};

		const validation = CreateJobSchema.safeParse(requestData);
		if (!validation.success) {
			const formattedErrors = formatZodErrors(validation.error.format());
			jobLogger.error(`Validation failed: ${JSON.stringify(formattedErrors)}`);
			const errorResponse = buildErrorResponse("Validation failed", 400, formattedErrors);
			res.status(400).json(errorResponse);
			return;
		}

		try {
			const scope = await resolveJobRecruitmentScope(organizationId, validation.data);
			await assertJobHeadcountCapacity(organizationId, {
				...validation.data,
				...scope,
			});
			const job = await prisma.job.create({
				data: {
					...validation.data,
					organizationId,
					departmentId: validation.data.departmentId || scope.departmentId,
					sectionId: validation.data.sectionId || scope.sectionId,
				},
			});
			jobLogger.info(`Job created successfully: ${job.id}`);

			logActivity(req, {
				userId: (req as any).user?.id || "unknown",
				action: config.ACTIVITY_LOG.JOB.ACTIONS.CREATE_JOB,
				description: `${config.ACTIVITY_LOG.JOB.DESCRIPTIONS.JOB_CREATED}: ${job.id}`,
				page: {
					url: req.originalUrl,
					title: config.ACTIVITY_LOG.JOB.PAGES.JOB_CREATION,
				},
			});

			logAudit(req, {
				userId: (req as any).user?.id || "unknown",
				action: config.AUDIT_LOG.ACTIONS.CREATE,
				resource: config.AUDIT_LOG.RESOURCES.JOB,
				severity: config.AUDIT_LOG.SEVERITY.LOW,
				entityType: config.AUDIT_LOG.ENTITY_TYPES.JOB,
				entityId: job.id,
				changesBefore: null,
				changesAfter: {
					id: job.id,
					createdAt: job.createdAt,
					updatedAt: job.updatedAt,
				},
				description: `${config.AUDIT_LOG.JOB.DESCRIPTIONS.JOB_CREATED}: ${job.id}`,
			});

			try {
				await invalidateCache.byPattern("cache:job:list:*");
				jobLogger.info("Job list cache invalidated after creation");
			} catch (cacheError) {
				jobLogger.warn("Failed to invalidate cache after job creation:", cacheError);
			}

			const successResponse = buildSuccessResponse(config.SUCCESS.JOB.CREATED, job, 201);
			res.status(201).json(successResponse);
		} catch (error: any) {
			if (error?.statusCode === 400) {
				res.status(400).json(
					buildErrorResponse(error.message, 400, error.details || undefined),
				);
				return;
			}
			jobLogger.error(`${config.ERROR.JOB.CREATE_FAILED}: ${error}`);
			const errorResponse = buildErrorResponse(
				config.ERROR.COMMON.INTERNAL_SERVER_ERROR,
				500,
			);
			res.status(500).json(errorResponse);
		}
	};
	const getAll = async (req: Request, res: Response, _next: NextFunction) => {
		const validationResult = validateQueryParams(req, jobLogger);
		const organizationId = (req as any).organizationId;

		if (!validationResult.isValid) {
			res.status(400).json(validationResult.errorResponse);
			return;
		}

		if (!organizationId) {
			res.status(401).json(buildErrorResponse("Organization ID is required", 401));
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
			searchFields,
			document,
			pagination,
			count,
			filter,
			groupBy,
		} = validationResult.validatedParams!;

		jobLogger.info(
			`Getting jobs, page: ${page}, limit: ${limit}, query: ${query}, order: ${order}, groupBy: ${groupBy}`,
		);

		try {
			// Base where clause
			const whereClause: Prisma.JobWhereInput = {
				organizationId,
				isDeleted: false,
			};

			const defaultSearchFields = ["position.title", "level.name", "description"];
			const allowedSearchFields = new Set([
				...defaultSearchFields,
				"type",
				"location",
			]);
			const requestedSearchFields = String(searchFields || "")
				.split(",")
				.map((field) => field.trim())
				.filter((field) => allowedSearchFields.has(field));
			const resolvedSearchFields =
				requestedSearchFields.length > 0
					? requestedSearchFields.slice(0, 3)
					: defaultSearchFields;

			if (query) {
				const searchConditions = buildSearchConditions("Job", query, resolvedSearchFields);
				if (searchConditions.length > 0) {
					whereClause.OR = searchConditions;
				}
			}

			if (filter) {
				const filterConditions = buildFilterConditions("Job", filter);
				if (filterConditions.length > 0) {
					whereClause.AND = filterConditions;
				}
			}
			const findManyQuery = buildFindManyQuery(whereClause, skip, limit, order, sort, fields);

			const [jobs, total] = await Promise.all([
				document ? prisma.job.findMany(findManyQuery) : [],
				count ? prisma.job.count({ where: whereClause }) : 0,
			]);

			jobLogger.info(`Retrieved ${jobs.length} jobs`);
			const processedData =
				groupBy && document ? groupDataByField(jobs, groupBy as string) : jobs;

			const responseData: Record<string, any> = {
				...(document && { jobs: processedData }),
				...(count && { count: total }),
				...(pagination && { pagination: buildPagination(total, page, limit) }),
				...(groupBy && { groupedBy: groupBy }),
			};

			res.status(200).json(
				buildSuccessResponse(config.SUCCESS.JOB.RETRIEVED_ALL, responseData, 200),
			);
		} catch (error) {
			jobLogger.error(`${config.ERROR.JOB.GET_ALL_FAILED}: ${error}`);
			res.status(500).json(
				buildErrorResponse(config.ERROR.COMMON.INTERNAL_SERVER_ERROR, 500),
			);
		}
	};
	const getById = async (req: Request, res: Response, _next: NextFunction) => {
		const { id } = req.params;
		const { fields } = req.query;
		const organizationId = (req as any).organizationId;

		try {
			if (!id) {
				jobLogger.error(config.ERROR.QUERY_PARAMS.MISSING_ID);
				const errorResponse = buildErrorResponse(config.ERROR.QUERY_PARAMS.MISSING_ID, 400);
				res.status(400).json(errorResponse);
				return;
			}

			if (fields && typeof fields !== "string") {
				jobLogger.error(`${config.ERROR.QUERY_PARAMS.INVALID_POPULATE}: ${fields}`);
				const errorResponse = buildErrorResponse(
					config.ERROR.QUERY_PARAMS.POPULATE_MUST_BE_STRING,
					400,
				);
				res.status(400).json(errorResponse);
				return;
			}

			jobLogger.info(`${config.SUCCESS.JOB.GETTING_BY_ID}: ${id}`);

			const cacheKey = `cache:job:byId:${id}:${fields || "full"}`;
			let job = null;

			try {
				if (redisClient.isClientConnected()) {
					job = await redisClient.getJSON(cacheKey);
					if (job) {
						jobLogger.info(`Job ${id} retrieved from direct Redis cache`);
					}
				}
			} catch (cacheError) {
				jobLogger.warn(`Redis cache retrieval failed for job ${id}:`, cacheError);
			}

			if (!job) {
				const query: Prisma.JobFindFirstArgs = {
					where: organizationId
						? { id, organizationId, isDeleted: false }
						: { id, isDeleted: false },
				};

				query.select = getNestedFields(fields);

				job = await prisma.job.findFirst(query);

				if (job && redisClient.isClientConnected()) {
					try {
						await redisClient.setJSON(cacheKey, job, 3600);
						jobLogger.info(`Job ${id} stored in direct Redis cache`);
					} catch (cacheError) {
						jobLogger.warn(`Failed to store job ${id} in Redis cache:`, cacheError);
					}
				}
			}

			if (!job) {
				jobLogger.error(`${config.ERROR.JOB.NOT_FOUND}: ${id}`);
				const errorResponse = buildErrorResponse(config.ERROR.JOB.NOT_FOUND, 404);
				res.status(404).json(errorResponse);
				return;
			}

			jobLogger.info(`${config.SUCCESS.JOB.RETRIEVED}: ${(job as any).id}`);
			const successResponse = buildSuccessResponse(config.SUCCESS.JOB.RETRIEVED, job, 200);
			res.status(200).json(successResponse);
		} catch (error) {
			jobLogger.error(`${config.ERROR.JOB.ERROR_GETTING}: ${error}`);
			const errorResponse = buildErrorResponse(
				config.ERROR.COMMON.INTERNAL_SERVER_ERROR,
				500,
			);
			res.status(500).json(errorResponse);
		}
	};

	const update = async (req: Request, res: Response, _next: NextFunction) => {
		const { id } = req.params;
		const organizationId = (req as any).organizationId;

		try {
			if (!id) {
				jobLogger.error(config.ERROR.QUERY_PARAMS.MISSING_ID);
				const errorResponse = buildErrorResponse(config.ERROR.QUERY_PARAMS.MISSING_ID, 400);
				res.status(400).json(errorResponse);
				return;
			}

			if (!organizationId) {
				const errorResponse = buildErrorResponse("Organization ID is required", 401);
				res.status(401).json(errorResponse);
				return;
			}

			const validationResult = UpdateJobSchema.safeParse(req.body);

			if (!validationResult.success) {
				const formattedErrors = formatZodErrors(validationResult.error.format());
				jobLogger.error(`Validation failed: ${JSON.stringify(formattedErrors)}`);
				const errorResponse = buildErrorResponse("Validation failed", 400, formattedErrors);
				res.status(400).json(errorResponse);
				return;
			}

			if (Object.keys(req.body).length === 0) {
				jobLogger.error(config.ERROR.COMMON.NO_UPDATE_FIELDS);
				const errorResponse = buildErrorResponse(config.ERROR.COMMON.NO_UPDATE_FIELDS, 400);
				res.status(400).json(errorResponse);
				return;
			}

			const validatedData = validationResult.data;

			jobLogger.info(`Updating job: ${id}`);

			const existingJob = await prisma.job.findFirst({
				where: { id, organizationId },
			});

			if (!existingJob) {
				jobLogger.error(`${config.ERROR.JOB.NOT_FOUND}: ${id}`);
				const errorResponse = buildErrorResponse(config.ERROR.JOB.NOT_FOUND, 404);
				res.status(404).json(errorResponse);
				return;
			}

			await assertJobHeadcountCapacity(organizationId, {
				departmentId: validatedData.departmentId ?? existingJob.departmentId,
				sectionId: validatedData.sectionId ?? existingJob.sectionId,
				positionId: validatedData.positionId ?? existingJob.positionId,
				levelId: validatedData.levelId ?? existingJob.levelId,
				headcountRequested:
					validatedData.headcountRequested ?? existingJob.headcountRequested,
			});

			const prismaData = { ...validatedData };
			delete (prismaData as any).organizationId;
			if (
				prismaData.positionId &&
				(prismaData.departmentId === undefined ||
					prismaData.departmentId === null ||
					prismaData.sectionId === undefined ||
					prismaData.sectionId === null)
			) {
				const scope = await resolveJobRecruitmentScope(organizationId, prismaData);
				if (prismaData.departmentId === undefined || prismaData.departmentId === null) {
					(prismaData as any).departmentId = scope.departmentId;
				}
				if (prismaData.sectionId === undefined || prismaData.sectionId === null) {
					(prismaData as any).sectionId = scope.sectionId;
				}
			}

			const updatedJob = await prisma.job.update({
				where: { id },
				data: prismaData,
			});

			try {
				await invalidateCache.byPattern(`cache:job:byId:${id}:*`);
				await invalidateCache.byPattern("cache:job:list:*");
				jobLogger.info(`Cache invalidated after job ${id} update`);
			} catch (cacheError) {
				jobLogger.warn("Failed to invalidate cache after job update:", cacheError);
			}

			jobLogger.info(`${config.SUCCESS.JOB.UPDATED}: ${updatedJob.id}`);
			const successResponse = buildSuccessResponse(
				config.SUCCESS.JOB.UPDATED,
				{ job: updatedJob },
				200,
			);
			res.status(200).json(successResponse);
		} catch (error: any) {
			if (error?.statusCode === 400) {
				res.status(400).json(
					buildErrorResponse(error.message, 400, error.details || undefined),
				);
				return;
			}
			jobLogger.error(`${config.ERROR.JOB.ERROR_UPDATING}: ${error}`);
			const errorResponse = buildErrorResponse(
				config.ERROR.COMMON.INTERNAL_SERVER_ERROR,
				500,
			);
			res.status(500).json(errorResponse);
		}
	};

	const remove = async (req: Request, res: Response, _next: NextFunction) => {
		const { id } = req.params;
		const organizationId = (req as any).organizationId;

		try {
			if (!id) {
				jobLogger.error(config.ERROR.QUERY_PARAMS.MISSING_ID);
				const errorResponse = buildErrorResponse(config.ERROR.QUERY_PARAMS.MISSING_ID, 400);
				res.status(400).json(errorResponse);
				return;
			}

			if (!organizationId) {
				const errorResponse = buildErrorResponse("Organization ID is required", 401);
				res.status(401).json(errorResponse);
				return;
			}

			jobLogger.info(`${config.SUCCESS.JOB.DELETED}: ${id}`);

			const existingJob = await prisma.job.findFirst({
				where: { id, organizationId },
			});

			if (!existingJob) {
				jobLogger.error(`${config.ERROR.JOB.NOT_FOUND}: ${id}`);
				const errorResponse = buildErrorResponse(config.ERROR.JOB.NOT_FOUND, 404);
				res.status(404).json(errorResponse);
				return;
			}

			await prisma.job.delete({
				where: { id },
			});

			try {
				await invalidateCache.byPattern(`cache:job:byId:${id}:*`);
				await invalidateCache.byPattern("cache:job:list:*");
				jobLogger.info(`Cache invalidated after job ${id} deletion`);
			} catch (cacheError) {
				jobLogger.warn("Failed to invalidate cache after job deletion:", cacheError);
			}

			jobLogger.info(`${config.SUCCESS.JOB.DELETED}: ${id}`);
			const successResponse = buildSuccessResponse(config.SUCCESS.JOB.DELETED, {}, 200);
			res.status(200).json(successResponse);
		} catch (error) {
			jobLogger.error(`${config.ERROR.JOB.DELETE_FAILED}: ${error}`);
			const errorResponse = buildErrorResponse(
				config.ERROR.COMMON.INTERNAL_SERVER_ERROR,
				500,
			);
			res.status(500).json(errorResponse);
		}
	};

	return { create, getAll, getById, update, remove };
};
