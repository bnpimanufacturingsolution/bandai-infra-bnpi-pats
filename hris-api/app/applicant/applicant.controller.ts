import path from "path";
import { Request, Response, NextFunction } from "express";
import { PrismaClient, Prisma } from "../../generated/prisma";
import { getLogger } from "../../helper/logger.helper";
import { transformFormDataToObject } from "../../helper/transformObject";
import { uploadToCloudinary } from "../../helper/cloudinary.helper";
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
import {
	ApplicantActionSchema,
	ApplicantSubmissionDetailsSchema,
	CreateApplicantSchema,
	UpdateApplicantSchema,
} from "../../zod/applicant.zod";
import { CreateRecruitmentActivitySchema } from "../../zod/recruitmentActivity.zod";
import { ApplicantAttachmentTypeEnum } from "../../zod/applicantAttachment.zod";
import { logActivity } from "../../utils/activityLogger";
import { logAudit } from "../../utils/auditLogger";
import { config } from "../../config/constant";
import { config as runtimeConfig } from "../../config/config";
import { redisClient } from "../../config/redis";
import { invalidateCache } from "../../middleware/cache";
import {
	ApplicantActionValidationError,
	executeApplicantAction,
	getApplicantPreHireSetupReadiness,
	initializeApplicantWorkflow,
	provisionApplicantEmployeeAccountAfterHire,
} from "../../helper/recruitment-runtime.helper";

const logger = getLogger();
const applicantLogger = logger.child({ module: "applicant" });
const APPLICANT_ACTION_RETRY_LIMIT = 3;

const attachmentPublicId = (prefix: string, id: string, originalname?: string) => {
	const ext = path.extname(originalname || "").toLowerCase();
	const safeExt = /^\.[a-z0-9]{1,8}$/.test(ext) ? ext : "";
	return `${prefix}_${id}_${Date.now()}${safeExt}`;
};

type AuthRequest = Request & {
	userId?: string;
	organizationId?: string;
	metadata?: {
		employee?: {
			id?: string;
		};
	};
	user?: {
		id?: string;
		organizationId?: string;
	};
};

export const controller = (prisma: PrismaClient) => {
	const getRequestOrganizationId = (req: Request): string | null =>
		(req as any).organizationId || (req as any).user?.organizationId || null;

	const getActingEmployeeId = async (
		req: AuthRequest,
		organizationId: string,
	): Promise<string | null> => {
		const employeeIdFromToken = req.metadata?.employee?.id;
		if (employeeIdFromToken) {
			return employeeIdFromToken;
		}

		if (!req.userId) {
			return null;
		}

		const employee = await prisma.employee.findFirst({
			where: {
				organizationId,
				userId: req.userId,
				isDeleted: false,
			},
			select: { id: true },
		});

		return employee?.id ?? null;
	};

	const resolveJobLink = async (params: {
		jobId?: string | null;
		positionId?: string | null;
		requestOrganizationId?: string | null;
	}) => {
		const { jobId, positionId, requestOrganizationId } = params;

		if (jobId) {
			const job = await prisma.job.findFirst({
				where: { id: jobId, isDeleted: false },
				select: {
					id: true,
					positionId: true,
					position: {
						select: {
							id: true,
							organizationId: true,
							isDeleted: true,
							section: {
								select: {
									departmentId: true,
								},
							},
						},
					},
				},
			});

			if (!job || !job.position || job.position.isDeleted) {
				return {
					ok: false as const,
					status: 400,
					errorResponse: buildErrorResponse("The selected job is no longer available", 400, [
						{ field: "jobId", message: "The selected job is no longer available." },
					]),
				};
			}

			if (positionId && positionId !== job.positionId) {
				return {
					ok: false as const,
					status: 400,
					errorResponse: buildErrorResponse("positionId does not match selected job", 400, [
						{ field: "positionId", message: "Position must match selected job" },
					]),
				};
			}

			if (requestOrganizationId && requestOrganizationId !== job.position.organizationId) {
				return {
					ok: false as const,
					status: 400,
					errorResponse: buildErrorResponse(
						"Job does not belong to your organization",
						400,
						[{ field: "jobId", message: "The selected job does not belong to your organization" }],
					),
				};
			}

			return {
				ok: true as const,
				organizationId: job.position.organizationId,
				jobId: job.id,
				positionId: job.positionId,
				departmentId: job.position.section?.departmentId || null,
			};
		}

		if (!positionId) {
			return {
				ok: false as const,
				status: 400,
				errorResponse: buildErrorResponse("A valid job or position is required", 400, [
					{ field: "jobId", message: "Please select a job or position before submitting." },
				]),
			};
		}

		const position = await prisma.position.findFirst({
			where: { id: positionId, isDeleted: false },
			select: {
				id: true,
				organizationId: true,
				section: {
					select: {
						departmentId: true,
					},
				},
			},
		});

		if (!position) {
			return {
				ok: false as const,
				status: 400,
				errorResponse: buildErrorResponse("Invalid positionId: position not found", 400, [
					{ field: "positionId", message: "Position does not exist" },
				]),
			};
		}

		if (requestOrganizationId && requestOrganizationId !== position.organizationId) {
			return {
				ok: false as const,
				status: 400,
				errorResponse: buildErrorResponse(
					"Position does not belong to your organization",
					400,
					[
						{
							field: "positionId",
							message: "The selected position does not belong to your organization",
						},
					],
				),
			};
		}

		return {
			ok: true as const,
			organizationId: position.organizationId,
			positionId: position.id,
			departmentId: position.section?.departmentId || null,
		};
	};

	const invalidateApplicantCaches = async (applicantId?: string) => {
		if (applicantId) {
			await invalidateCache.byPattern(`cache:applicant:byId:${applicantId}:*`);
		}
		await invalidateCache.byPattern("cache:applicant:list:*");
	};

	const create = async (req: Request, res: Response, _next: NextFunction) => {
		let requestData = req.body;
		const contentType = req.get("Content-Type") || "";
		let submissionDetails: Record<string, unknown> | null = null;

		if (contentType.includes("multipart/form-data")) {
			requestData = { ...req.body };
			if (requestData.appliedDate) {
				requestData.appliedDate = new Date(requestData.appliedDate);
			}
			if (requestData.availabilityDate) {
				requestData.availabilityDate = new Date(requestData.availabilityDate);
			}
			if (requestData.noticePeriod) {
				requestData.noticePeriod = Number(requestData.noticePeriod);
			}
			if (requestData.expectedSalary) {
				requestData.expectedSalary = Number(requestData.expectedSalary);
			}
			if (requestData.referralBonus) {
				requestData.referralBonus = Number(requestData.referralBonus);
			}
		} else if (contentType.includes("application/x-www-form-urlencoded")) {
			requestData = transformFormDataToObject(req.body);
		}

		if (typeof requestData?.submissionDetails === "string") {
			try {
				const parsedSubmissionDetails = JSON.parse(requestData.submissionDetails);
				const detailsValidation =
					ApplicantSubmissionDetailsSchema.safeParse(parsedSubmissionDetails);
				if (!detailsValidation.success) {
					const formattedErrors = formatZodErrors(detailsValidation.error.format()).map(
						(error) => ({
							...error,
							field:
								error.field && error.field !== "root"
									? `submissionDetails.${error.field}`
									: "submissionDetails",
						}),
					);
					res
						.status(400)
						.json(buildErrorResponse("Validation failed", 400, formattedErrors));
					return;
				}
				submissionDetails = detailsValidation.data as Record<string, unknown>;
			} catch {
				res.status(400).json(
					buildErrorResponse("Validation failed", 400, [
						{
							field: "submissionDetails",
							message: "Submission details must be valid JSON.",
						},
					]),
				);
				return;
			}
		} else if (requestData?.submissionDetails !== undefined) {
			const detailsValidation = ApplicantSubmissionDetailsSchema.safeParse(
				requestData.submissionDetails,
			);
			if (!detailsValidation.success) {
				const formattedErrors = formatZodErrors(detailsValidation.error.format()).map(
					(error) => ({
						...error,
						field:
							error.field && error.field !== "root"
								? `submissionDetails.${error.field}`
								: "submissionDetails",
					}),
				);
				res.status(400).json(buildErrorResponse("Validation failed", 400, formattedErrors));
				return;
			}
			submissionDetails = detailsValidation.data as Record<string, unknown>;
		}

		delete requestData.submissionDetails;

		const validation = CreateApplicantSchema.safeParse(requestData);
		if (!validation.success) {
			const formattedErrors = formatZodErrors(validation.error.format());
			res.status(400).json(buildErrorResponse("Validation failed", 400, formattedErrors));
			return;
		}

		if (validation.data.applicationSource === "WEBSITE" && !req.file) {
			res.status(400).json(
				buildErrorResponse("Validation failed", 400, [
					{ field: "resume", message: "Resume is required." },
				]),
			);
			return;
		}

		try {
			const requestOrganizationId = getRequestOrganizationId(req);
			const linkResult = await resolveJobLink({
				jobId: validation.data.jobId,
				positionId: validation.data.positionId,
				requestOrganizationId,
			});
			if (!linkResult.ok) {
				res.status(linkResult.status).json(linkResult.errorResponse);
				return;
			}

			const actingEmployeeId = await getActingEmployeeId(
				req as AuthRequest,
				linkResult.organizationId,
			);

			const applicant = await prisma.$transaction(async (tx) => {
				const createdApplicant = await tx.applicant.create({
					data: {
						...validation.data,
						organizationId: linkResult.organizationId,
						jobId: linkResult.jobId ?? validation.data.jobId ?? null,
						positionId: linkResult.positionId ?? validation.data.positionId ?? null,
						departmentId:
							validation.data.departmentId ?? linkResult.departmentId ?? null,
					},
				});

				await initializeApplicantWorkflow(tx, {
					organizationId: linkResult.organizationId,
					applicantId: createdApplicant.id,
					changedByEmployeeId: actingEmployeeId,
				});

				if (submissionDetails && Object.keys(submissionDetails).length > 0) {
					await tx.recruitmentActivity.create({
						data: {
							organizationId: linkResult.organizationId,
							applicantId: createdApplicant.id,
							type: "NOTE",
							title: "Application submission details",
							details: submissionDetails as Prisma.InputJsonValue,
							actorEmployeeId: actingEmployeeId,
						},
					});
				}

				if (req.file) {
					const uploadResult = await uploadToCloudinary(req.file.buffer, {
						folder: "applicants/resumes",
						resourceType: "raw",
						publicId: attachmentPublicId(
							"resume",
							createdApplicant.id,
							req.file.originalname,
						),
					});

					if (uploadResult.success && uploadResult.secureUrl) {
						await tx.applicantAttachment.create({
							data: {
								organizationId: linkResult.organizationId,
								applicantId: createdApplicant.id,
								type: "RESUME",
								name: req.file.originalname,
								url: uploadResult.secureUrl,
								mimeType: req.file.mimetype,
								size: req.file.size,
								uploadedByEmployeeId: actingEmployeeId,
							},
						});
					}
				}

				return tx.applicant.findUnique({
					where: { id: createdApplicant.id },
					include: {
						person: true,
						position: true,
						department: true,
						job: { include: { position: true, level: true } },
						workflowInstance: true,
						currentStepExecution: true,
						attachments: {
							where: { isDeleted: false },
							orderBy: { uploadedAt: "desc" },
						},
						activities: {
							where: { isDeleted: false },
							orderBy: { occurredAt: "desc" },
						},
					},
				});
			});

			await invalidateApplicantCaches(applicant?.id);

			logActivity(req, {
				userId: (req as any).user?.id || "unknown",
				action: config.ACTIVITY_LOG.APPLICANT.ACTIONS.CREATE_APPLICANT,
				description: `${config.ACTIVITY_LOG.APPLICANT.DESCRIPTIONS.APPLICANT_CREATED}: ${applicant?.id || "unknown"}`,
				page: {
					url: req.originalUrl,
					title: config.ACTIVITY_LOG.APPLICANT.PAGES.APPLICANT_CREATION,
				},
			});

			logAudit(req, {
				userId: (req as any).user?.id || "unknown",
				action: config.AUDIT_LOG.ACTIONS.CREATE,
				resource: config.AUDIT_LOG.RESOURCES.APPLICANT,
				severity: config.AUDIT_LOG.SEVERITY.MEDIUM,
				entityType: config.AUDIT_LOG.ENTITY_TYPES.APPLICANT,
				entityId: applicant?.id || "unknown",
				changesBefore: null,
				changesAfter: applicant
					? {
							id: applicant.id,
							applicantId: applicant.applicantId,
							organizationId: applicant.organizationId,
							createdAt: applicant.createdAt,
							updatedAt: applicant.updatedAt,
						}
					: null,
				description: `${config.AUDIT_LOG.APPLICANT.DESCRIPTIONS.APPLICANT_CREATED}: ${applicant?.id || "unknown"}`,
			});

			res.status(201).json(buildSuccessResponse(config.SUCCESS.APPLICANT.CREATED, applicant, 201));
		} catch (error) {
			applicantLogger.error(`${config.ERROR.APPLICANT.CREATE_FAILED}: ${error}`);
			res
				.status(500)
				.json(buildErrorResponse(config.ERROR.COMMON.INTERNAL_SERVER_ERROR, 500));
		}
	};

	const getAll = async (req: Request, res: Response, _next: NextFunction) => {
		const validationResult = validateQueryParams(req, applicantLogger);
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

		try {
			const requestOrganizationId = getRequestOrganizationId(req);
			if (!requestOrganizationId) {
				res.status(401).json(buildErrorResponse(config.ERROR.COMMON.UNAUTHORIZED, 401));
				return;
			}

			const whereClause: Prisma.ApplicantWhereInput = {
				isDeleted: false,
				organizationId: requestOrganizationId,
			};

			const searchFields = [
				"applicantId",
				"currentWorkflowStateKey",
				"person.personalInfo.firstName",
				"person.personalInfo.lastName",
				"person.contactInfo.email",
				"position.title",
				"job.position.title",
				"job.level.name",
			];

			if (query) {
				const searchConditions = buildSearchConditions("Applicant", query, searchFields);
				if (searchConditions.length > 0) {
					whereClause.OR = searchConditions;
				}
			}

			if (filter) {
				const filterConditions = buildFilterConditions("Applicant", filter);
				if (filterConditions.length > 0) {
					whereClause.AND = filterConditions;
				}
			}

			const effectiveGroupBy = groupBy === "job" ? "job.id" : groupBy;
			let enhancedFields = fields;
			if (effectiveGroupBy && effectiveGroupBy.includes(".")) {
				const relationField = effectiveGroupBy.split(".")[0];
				if (fields) {
					const fieldsList = fields.split(",").map((f) => f.trim());
					if (!fieldsList.some((f) => f.startsWith(relationField))) {
						enhancedFields = `${fields},${effectiveGroupBy}`;
					}
				} else {
					enhancedFields = effectiveGroupBy;
				}
			}

			const findManyQuery = buildFindManyQuery(
				whereClause,
				skip,
				limit,
				order,
				sort,
				enhancedFields,
				undefined,
				undefined,
				effectiveGroupBy || undefined,
			);

			const [applicants, total] = await Promise.all([
				document ? prisma.applicant.findMany(findManyQuery) : [],
				count ? prisma.applicant.count({ where: whereClause }) : 0,
			]);

			const processedData =
				effectiveGroupBy && document
					? groupDataByField(applicants, effectiveGroupBy as string)
					: applicants;

			logActivity(req, {
				userId: (req as any).user?.id || "unknown",
				action: config.ACTIVITY_LOG.APPLICANT.ACTIONS.GET_ALL_APPLICANT,
				description: config.ACTIVITY_LOG.APPLICANT.DESCRIPTIONS.APPLICANTS_RETRIEVED,
				page: {
					url: req.originalUrl,
					title: config.ACTIVITY_LOG.APPLICANT.PAGES.APPLICANT_LIST,
				},
			});

			res.status(200).json(
				buildSuccessResponse(config.SUCCESS.APPLICANT.RETRIEVED_ALL, {
					...(document && { applicants: processedData }),
					...(count && { count: total }),
					...(pagination && { pagination: buildPagination(total, page, limit) }),
					...(groupBy && { groupedBy: groupBy }),
				}, 200),
			);
		} catch (error) {
			applicantLogger.error(`${config.ERROR.APPLICANT.GET_ALL_FAILED}: ${error}`);
			res
				.status(500)
				.json(buildErrorResponse(config.ERROR.COMMON.INTERNAL_SERVER_ERROR, 500));
		}
	};

	const getById = async (req: Request, res: Response, _next: NextFunction) => {
		const { id } = req.params;
		const { fields } = req.query;

		try {
			const requestOrganizationId = getRequestOrganizationId(req);
			if (!requestOrganizationId) {
				res.status(401).json(buildErrorResponse(config.ERROR.COMMON.UNAUTHORIZED, 401));
				return;
			}

			const cacheKey = `cache:applicant:byId:${id}:${requestOrganizationId}:${fields || "full"}`;
			let applicant = null;

			if (redisClient.isClientConnected()) {
				applicant = await redisClient.getJSON(cacheKey);
			}

			if (!applicant) {
				const query: Prisma.ApplicantFindFirstArgs = {
					where: { id, organizationId: requestOrganizationId, isDeleted: false },
				};
				query.select = getNestedFields(typeof fields === "string" ? fields : undefined);
				applicant = await prisma.applicant.findFirst(query);

				if (applicant && redisClient.isClientConnected()) {
					await redisClient.setJSON(cacheKey, applicant, 3600);
				}
			}

			if (!applicant) {
				res.status(404).json(buildErrorResponse(config.ERROR.APPLICANT.NOT_FOUND, 404));
				return;
			}

			const preHireSetup = await getApplicantPreHireSetupReadiness(prisma, {
				organizationId: requestOrganizationId,
				applicantId: id,
			});
			if (preHireSetup) {
				(applicant as any).preHireSetup = preHireSetup;
			}

			logActivity(req, {
				userId: (req as any).user?.id || "unknown",
				action: config.ACTIVITY_LOG.APPLICANT.ACTIONS.GET_APPLICANT,
				description: `${config.ACTIVITY_LOG.APPLICANT.DESCRIPTIONS.APPLICANT_RETRIEVED}: ${id}`,
				page: {
					url: req.originalUrl,
					title: config.ACTIVITY_LOG.APPLICANT.PAGES.APPLICANT_DETAILS,
				},
			});

			res
				.status(200)
				.json(buildSuccessResponse(config.SUCCESS.APPLICANT.RETRIEVED, applicant, 200));
		} catch (error) {
			applicantLogger.error(`${config.ERROR.APPLICANT.ERROR_GETTING}: ${error}`);
			res
				.status(500)
				.json(buildErrorResponse(config.ERROR.COMMON.INTERNAL_SERVER_ERROR, 500));
		}
	};

	const update = async (req: Request, res: Response, _next: NextFunction) => {
		const { id } = req.params;
		const validationResult = UpdateApplicantSchema.safeParse(req.body);

		if (!validationResult.success) {
			const formattedErrors = formatZodErrors(validationResult.error.format());
			res.status(400).json(buildErrorResponse("Validation failed", 400, formattedErrors));
			return;
		}

		try {
			const requestOrganizationId = getRequestOrganizationId(req);
			if (!requestOrganizationId) {
				res.status(401).json(buildErrorResponse(config.ERROR.COMMON.UNAUTHORIZED, 401));
				return;
			}

			const existingApplicant = await prisma.applicant.findFirst({
				where: { id, organizationId: requestOrganizationId, isDeleted: false },
			});

			if (!existingApplicant) {
				res.status(404).json(buildErrorResponse(config.ERROR.APPLICANT.NOT_FOUND, 404));
				return;
			}

			const prismaData = { ...validationResult.data } as Prisma.ApplicantUncheckedUpdateInput;
			if ("jobId" in validationResult.data || "positionId" in validationResult.data) {
				const linkResult = await resolveJobLink({
					jobId:
						validationResult.data.jobId === undefined
							? existingApplicant.jobId
							: validationResult.data.jobId,
					positionId:
						validationResult.data.positionId === undefined
							? existingApplicant.positionId
							: validationResult.data.positionId,
					requestOrganizationId,
				});
				if (!linkResult.ok) {
					res.status(linkResult.status).json(linkResult.errorResponse);
					return;
				}

				prismaData.jobId = linkResult.jobId ?? null;
				prismaData.positionId = linkResult.positionId ?? null;
				prismaData.departmentId =
					validationResult.data.departmentId ?? linkResult.departmentId ?? null;
			}

			const updatedApplicant = await prisma.applicant.update({
				where: { id },
				data: prismaData,
			});

			await invalidateApplicantCaches(id);

			logActivity(req, {
				userId: (req as any).user?.id || "unknown",
				action: config.ACTIVITY_LOG.APPLICANT.ACTIONS.UPDATE_APPLICANT,
				description: `${config.ACTIVITY_LOG.APPLICANT.DESCRIPTIONS.APPLICANT_UPDATED}: ${updatedApplicant.id}`,
				page: {
					url: req.originalUrl,
					title: config.ACTIVITY_LOG.APPLICANT.PAGES.APPLICANT_UPDATE,
				},
			});

			logAudit(req, {
				userId: (req as any).user?.id || "unknown",
				action: config.AUDIT_LOG.ACTIONS.UPDATE,
				resource: config.AUDIT_LOG.RESOURCES.APPLICANT,
				severity: config.AUDIT_LOG.SEVERITY.MEDIUM,
				entityType: config.AUDIT_LOG.ENTITY_TYPES.APPLICANT,
				entityId: updatedApplicant.id,
				changesBefore: existingApplicant,
				changesAfter: updatedApplicant,
				description: `${config.AUDIT_LOG.APPLICANT.DESCRIPTIONS.APPLICANT_UPDATED}: ${updatedApplicant.id}`,
			});

			res
				.status(200)
				.json(buildSuccessResponse(config.SUCCESS.APPLICANT.UPDATED, { applicant: updatedApplicant }, 200));
		} catch (error) {
			applicantLogger.error(`${config.ERROR.APPLICANT.ERROR_UPDATING}: ${error}`);
			res
				.status(500)
				.json(buildErrorResponse(config.ERROR.COMMON.INTERNAL_SERVER_ERROR, 500));
		}
	};

	const action = async (req: Request, res: Response, _next: NextFunction) => {
		const { id } = req.params;
		const validation = ApplicantActionSchema.safeParse(req.body);
		if (!validation.success) {
			const formattedErrors = formatZodErrors(validation.error.format());
			res.status(400).json(buildErrorResponse("Validation failed", 400, formattedErrors));
			return;
		}

		try {
			const requestOrganizationId = getRequestOrganizationId(req);
			if (!requestOrganizationId) {
				res.status(401).json(buildErrorResponse(config.ERROR.COMMON.UNAUTHORIZED, 401));
				return;
			}

			const actingEmployeeId = await getActingEmployeeId(
				req as AuthRequest,
				requestOrganizationId,
			);

			const existingApplicant = await prisma.applicant.findFirst({
				where: { id, organizationId: requestOrganizationId, isDeleted: false },
			});

			if (!existingApplicant) {
				res.status(404).json(buildErrorResponse(config.ERROR.APPLICANT.NOT_FOUND, 404));
				return;
			}

			let actionResult:
				| {
						applicantId: string;
						requiresPostCommitAccountProvisioning?: boolean;
				  }
				| null = null;
			let lastError: unknown = null;

			for (let attempt = 1; attempt <= APPLICANT_ACTION_RETRY_LIMIT; attempt += 1) {
				try {
					actionResult = await prisma.$transaction(
						(tx) =>
							executeApplicantAction(tx, {
								organizationId: requestOrganizationId,
								applicantId: id,
								action: validation.data.action,
								req,
								actingEmployeeId,
								stepExecutionId: validation.data.stepExecutionId,
								comments: validation.data.comments,
								targetStateKey: validation.data.targetStateKey,
								metadata: validation.data.metadata,
							}),
						{
							maxWait: runtimeConfig.prismaTransactionMaxWaitMs,
							timeout: runtimeConfig.prismaTransactionTimeoutMs,
						},
					);
					lastError = null;
					break;
				} catch (error: any) {
					lastError = error;
					const errorCode = error?.code;
					const errorMessage = String(error?.message || "");
					const isRetryableConflict =
						errorCode === "P2034" ||
						errorMessage.includes("write conflict") ||
						errorMessage.includes("deadlock") ||
						errorMessage.includes("Transaction already closed");

					if (!isRetryableConflict || attempt === APPLICANT_ACTION_RETRY_LIMIT) {
						break;
					}
				}
			}

			if (!actionResult) {
				throw lastError || new Error("Failed to execute applicant action");
			}

			if (actionResult.requiresPostCommitAccountProvisioning) {
				await provisionApplicantEmployeeAccountAfterHire(prisma, {
					organizationId: requestOrganizationId,
					applicantId: actionResult.applicantId,
					actingEmployeeId,
					req,
				});
			}

			const updatedApplicant = await prisma.applicant.findUnique({
				where: { id: actionResult.applicantId },
				include: {
					person: true,
					position: true,
					department: true,
					job: {
						include: {
							position: true,
							level: true,
						},
					},
					convertedToEmployee: {
						include: {
							person: {
								select: {
									personalInfo: true,
									contactInfo: true,
								},
							},
							department: { select: { id: true, name: true } },
							position: { select: { id: true, title: true } },
							level: { select: { id: true, name: true } },
						},
					},
					workflowInstance: true,
					currentStepExecution: true,
					lastCompletedStepExecution: true,
					attachments: {
						where: { isDeleted: false },
						orderBy: { uploadedAt: "desc" },
					},
					activities: {
						where: { isDeleted: false },
						orderBy: { occurredAt: "desc" },
					},
				},
			});

			if (updatedApplicant) {
				const preHireSetup = await getApplicantPreHireSetupReadiness(prisma, {
					organizationId: requestOrganizationId,
					applicantId: updatedApplicant.id,
				});
				if (preHireSetup) {
					(updatedApplicant as any).preHireSetup = preHireSetup;
				}
			}

			await invalidateApplicantCaches(id);

			logActivity(req, {
				userId: (req as any).user?.id || "unknown",
				action: config.ACTIVITY_LOG.APPLICANT.ACTIONS.UPDATE_APPLICANT,
				description: `${config.ACTIVITY_LOG.APPLICANT.DESCRIPTIONS.APPLICANT_UPDATED}: ${id} (${validation.data.action})`,
				page: {
					url: req.originalUrl,
					title: config.ACTIVITY_LOG.APPLICANT.PAGES.APPLICANT_UPDATE,
				},
			});

			logAudit(req, {
				userId: (req as any).user?.id || "unknown",
				action: config.AUDIT_LOG.ACTIONS.UPDATE,
				resource: config.AUDIT_LOG.RESOURCES.APPLICANT,
				severity: config.AUDIT_LOG.SEVERITY.MEDIUM,
				entityType: config.AUDIT_LOG.ENTITY_TYPES.APPLICANT,
				entityId: id,
				changesBefore: {
					id: existingApplicant.id,
					currentWorkflowStateKey: existingApplicant.currentWorkflowStateKey,
					updatedAt: existingApplicant.updatedAt,
				},
				changesAfter: updatedApplicant
					? {
							id: updatedApplicant.id,
							currentWorkflowStateKey: updatedApplicant.currentWorkflowStateKey,
							updatedAt: updatedApplicant.updatedAt,
							action: validation.data.action,
						}
					: null,
				description: `${config.AUDIT_LOG.APPLICANT.DESCRIPTIONS.APPLICANT_UPDATED}: ${id} (${validation.data.action})`,
			});

			res.status(200).json(buildSuccessResponse("Applicant action completed", updatedApplicant, 200));
		} catch (error: any) {
			applicantLogger.error(`Failed applicant action for ${id}: ${error}`);
			if (error instanceof ApplicantActionValidationError) {
				res
					.status(error.statusCode)
					.json(
						buildErrorResponse(
							error.message || "Failed to execute applicant action",
							error.statusCode,
							error.errors,
						),
					);
				return;
			}
			res
				.status(409)
				.json(buildErrorResponse(error?.message || "Failed to execute applicant action", 409));
		}
	};

	const getActivities = async (req: Request, res: Response, _next: NextFunction) => {
		const { id } = req.params;
		const organizationId = getRequestOrganizationId(req);
		if (!organizationId) {
			res.status(401).json(buildErrorResponse(config.ERROR.COMMON.UNAUTHORIZED, 401));
			return;
		}

		const activities = await prisma.recruitmentActivity.findMany({
			where: {
				applicantId: id,
				organizationId,
				isDeleted: false,
			},
			orderBy: { occurredAt: "desc" },
		});

		logActivity(req, {
			userId: (req as any).user?.id || "unknown",
			action: config.ACTIVITY_LOG.APPLICANT.ACTIONS.GET_APPLICANT,
			description: `${config.ACTIVITY_LOG.APPLICANT.DESCRIPTIONS.APPLICANT_RETRIEVED}: ${id} activities`,
			page: {
				url: req.originalUrl,
				title: config.ACTIVITY_LOG.APPLICANT.PAGES.APPLICANT_DETAILS,
			},
		});

		res.status(200).json(buildSuccessResponse("Applicant activities retrieved", { activities }, 200));
	};

	const createActivity = async (req: Request, res: Response, _next: NextFunction) => {
		const { id } = req.params;
		const organizationId = getRequestOrganizationId(req);
		if (!organizationId) {
			res.status(401).json(buildErrorResponse(config.ERROR.COMMON.UNAUTHORIZED, 401));
			return;
		}

		const validation = CreateRecruitmentActivitySchema.safeParse({
			...req.body,
			applicantId: id,
		});

		if (!validation.success) {
			const formattedErrors = formatZodErrors(validation.error.format());
			res.status(400).json(buildErrorResponse("Validation failed", 400, formattedErrors));
			return;
		}

		const applicant = await prisma.applicant.findFirst({
			where: { id, organizationId, isDeleted: false },
			select: { workflowInstanceId: true, currentWorkflowStateKey: true },
		});

		if (!applicant) {
			res.status(404).json(buildErrorResponse(config.ERROR.APPLICANT.NOT_FOUND, 404));
			return;
		}

		const actingEmployeeId = await getActingEmployeeId(req as AuthRequest, organizationId);
		const activity = await prisma.recruitmentActivity.create({
			data: {
				organizationId,
				applicantId: id,
				workflowInstanceId: applicant.workflowInstanceId ?? null,
				stepExecutionId: validation.data.stepExecutionId ?? null,
				stateKey: validation.data.stateKey ?? applicant.currentWorkflowStateKey,
				type: validation.data.type,
				title: validation.data.title,
				details: validation.data.details ? (validation.data.details as Prisma.InputJsonValue) : undefined,
				actorEmployeeId: actingEmployeeId,
				occurredAt: validation.data.occurredAt ?? new Date(),
			},
		});

		await invalidateApplicantCaches(id);

		logActivity(req, {
			userId: (req as any).user?.id || "unknown",
			action: config.ACTIVITY_LOG.APPLICANT.ACTIONS.UPDATE_APPLICANT,
			description: `${config.ACTIVITY_LOG.APPLICANT.DESCRIPTIONS.APPLICANT_UPDATED}: ${id} activity`,
			page: {
				url: req.originalUrl,
				title: config.ACTIVITY_LOG.APPLICANT.PAGES.APPLICANT_UPDATE,
			},
		});

		logAudit(req, {
			userId: (req as any).user?.id || "unknown",
			action: config.AUDIT_LOG.ACTIONS.UPDATE,
			resource: config.AUDIT_LOG.RESOURCES.APPLICANT,
			severity: config.AUDIT_LOG.SEVERITY.MEDIUM,
			entityType: config.AUDIT_LOG.ENTITY_TYPES.APPLICANT,
			entityId: id,
			changesBefore: null,
			changesAfter: {
				activityId: activity.id,
				type: activity.type,
				title: activity.title,
			},
			description: `${config.AUDIT_LOG.APPLICANT.DESCRIPTIONS.APPLICANT_UPDATED}: ${id} activity`,
		});

		res.status(201).json(buildSuccessResponse("Applicant activity created", activity, 201));
	};

	const getAttachments = async (req: Request, res: Response, _next: NextFunction) => {
		const { id } = req.params;
		const organizationId = getRequestOrganizationId(req);
		if (!organizationId) {
			res.status(401).json(buildErrorResponse(config.ERROR.COMMON.UNAUTHORIZED, 401));
			return;
		}

		const attachments = await prisma.applicantAttachment.findMany({
			where: {
				applicantId: id,
				organizationId,
				isDeleted: false,
			},
			orderBy: { uploadedAt: "desc" },
		});

		logActivity(req, {
			userId: (req as any).user?.id || "unknown",
			action: config.ACTIVITY_LOG.APPLICANT.ACTIONS.GET_APPLICANT,
			description: `${config.ACTIVITY_LOG.APPLICANT.DESCRIPTIONS.APPLICANT_RETRIEVED}: ${id} attachments`,
			page: {
				url: req.originalUrl,
				title: config.ACTIVITY_LOG.APPLICANT.PAGES.APPLICANT_DETAILS,
			},
		});

		res.status(200).json(buildSuccessResponse("Applicant attachments retrieved", { attachments }, 200));
	};

	const uploadAttachment = async (req: Request, res: Response, _next: NextFunction) => {
		const { id } = req.params;
		const organizationId = getRequestOrganizationId(req);
		if (!organizationId) {
			res.status(401).json(buildErrorResponse(config.ERROR.COMMON.UNAUTHORIZED, 401));
			return;
		}

		if (!req.file) {
			res.status(400).json(buildErrorResponse("Attachment file is required", 400));
			return;
		}

		const typeResult = ApplicantAttachmentTypeEnum.safeParse(String(req.body.type || "OTHER").toUpperCase());
		if (!typeResult.success) {
			res.status(400).json(buildErrorResponse("Invalid attachment type", 400));
			return;
		}

		const uploadResult = await uploadToCloudinary(req.file.buffer, {
			folder: "applicants/attachments",
			resourceType: "raw",
			publicId: attachmentPublicId("attachment", id, req.file.originalname),
		});

		if (!uploadResult.success || !uploadResult.secureUrl) {
			applicantLogger.error(
				`Attachment upload failed for applicant ${id}: ${uploadResult.error || "unknown storage error"}`,
			);
			res.status(500).json(
				buildErrorResponse("Failed to upload attachment file", 500, [
					{
						field: "file",
						message: uploadResult.error || "Storage provider rejected the upload",
					},
				]),
			);
			return;
		}

		const actingEmployeeId = await getActingEmployeeId(req as AuthRequest, organizationId);
		const attachment = await prisma.applicantAttachment.create({
			data: {
				organizationId,
				applicantId: id,
				type: typeResult.data,
				name: req.file.originalname,
				url: uploadResult.secureUrl,
				mimeType: req.file.mimetype,
				size: req.file.size,
				uploadedByEmployeeId: actingEmployeeId,
			},
		});

		await invalidateApplicantCaches(id);

		logActivity(req, {
			userId: (req as any).user?.id || "unknown",
			action: config.ACTIVITY_LOG.APPLICANT.ACTIONS.UPDATE_APPLICANT,
			description: `${config.ACTIVITY_LOG.APPLICANT.DESCRIPTIONS.APPLICANT_UPDATED}: ${id} attachment`,
			page: {
				url: req.originalUrl,
				title: config.ACTIVITY_LOG.APPLICANT.PAGES.APPLICANT_UPDATE,
			},
		});

		logAudit(req, {
			userId: (req as any).user?.id || "unknown",
			action: config.AUDIT_LOG.ACTIONS.UPDATE,
			resource: config.AUDIT_LOG.RESOURCES.APPLICANT,
			severity: config.AUDIT_LOG.SEVERITY.MEDIUM,
			entityType: config.AUDIT_LOG.ENTITY_TYPES.APPLICANT,
			entityId: id,
			changesBefore: null,
			changesAfter: {
				attachmentId: attachment.id,
				type: attachment.type,
				name: attachment.name,
			},
			description: `${config.AUDIT_LOG.APPLICANT.DESCRIPTIONS.APPLICANT_UPDATED}: ${id} attachment`,
		});

		res.status(201).json(buildSuccessResponse("Applicant attachment uploaded", attachment, 201));
	};

	const removeAttachment = async (req: Request, res: Response, _next: NextFunction) => {
		const { id, attachmentId } = req.params;
		const organizationId = getRequestOrganizationId(req);
		if (!organizationId) {
			res.status(401).json(buildErrorResponse(config.ERROR.COMMON.UNAUTHORIZED, 401));
			return;
		}

		const existingAttachment = await prisma.applicantAttachment.findFirst({
			where: {
				id: attachmentId,
				applicantId: id,
				organizationId,
				isDeleted: false,
			},
		});

		await prisma.applicantAttachment.updateMany({
			where: {
				id: attachmentId,
				applicantId: id,
				organizationId,
				isDeleted: false,
			},
			data: {
				isDeleted: true,
			},
		});

		await invalidateApplicantCaches(id);

		logActivity(req, {
			userId: (req as any).user?.id || "unknown",
			action: config.ACTIVITY_LOG.APPLICANT.ACTIONS.UPDATE_APPLICANT,
			description: `${config.ACTIVITY_LOG.APPLICANT.DESCRIPTIONS.APPLICANT_UPDATED}: ${id} attachment removed`,
			page: {
				url: req.originalUrl,
				title: config.ACTIVITY_LOG.APPLICANT.PAGES.APPLICANT_UPDATE,
			},
		});

		logAudit(req, {
			userId: (req as any).user?.id || "unknown",
			action: config.AUDIT_LOG.ACTIONS.UPDATE,
			resource: config.AUDIT_LOG.RESOURCES.APPLICANT,
			severity: config.AUDIT_LOG.SEVERITY.MEDIUM,
			entityType: config.AUDIT_LOG.ENTITY_TYPES.APPLICANT,
			entityId: id,
			changesBefore: existingAttachment
				? {
						attachmentId: existingAttachment.id,
						type: existingAttachment.type,
						isDeleted: existingAttachment.isDeleted,
					}
				: null,
			changesAfter: existingAttachment
				? {
						attachmentId: existingAttachment.id,
						type: existingAttachment.type,
						isDeleted: true,
					}
				: null,
			description: `${config.AUDIT_LOG.APPLICANT.DESCRIPTIONS.APPLICANT_UPDATED}: ${id} attachment removed`,
		});

		res.status(200).json(buildSuccessResponse("Applicant attachment removed", {}, 200));
	};

	const remove = async (req: Request, res: Response, _next: NextFunction) => {
		const { id } = req.params;
		const organizationId = getRequestOrganizationId(req);
		if (!organizationId) {
			res.status(401).json(buildErrorResponse(config.ERROR.COMMON.UNAUTHORIZED, 401));
			return;
		}

		const existingApplicant = await prisma.applicant.findFirst({
			where: { id, organizationId, isDeleted: false },
		});

		if (!existingApplicant) {
			res.status(404).json(buildErrorResponse(config.ERROR.APPLICANT.NOT_FOUND, 404));
			return;
		}

		await prisma.applicant.updateMany({
			where: { id, organizationId, isDeleted: false },
			data: { isDeleted: true },
		});

		await invalidateApplicantCaches(id);

		logActivity(req, {
			userId: (req as any).user?.id || "unknown",
			action: config.ACTIVITY_LOG.APPLICANT.ACTIONS.DELETE_APPLICANT,
			description: `${config.ACTIVITY_LOG.APPLICANT.DESCRIPTIONS.APPLICANT_DELETED}: ${id}`,
			page: {
				url: req.originalUrl,
				title: config.ACTIVITY_LOG.APPLICANT.PAGES.APPLICANT_DELETION,
			},
		});

		logAudit(req, {
			userId: (req as any).user?.id || "unknown",
			action: config.AUDIT_LOG.ACTIONS.DELETE,
			resource: config.AUDIT_LOG.RESOURCES.APPLICANT,
			severity: config.AUDIT_LOG.SEVERITY.MEDIUM,
			entityType: config.AUDIT_LOG.ENTITY_TYPES.APPLICANT,
			entityId: id,
			changesBefore: existingApplicant,
			changesAfter: null,
			description: `${config.AUDIT_LOG.APPLICANT.DESCRIPTIONS.APPLICANT_DELETED}: ${id}`,
		});

		res.status(200).json(buildSuccessResponse(config.SUCCESS.APPLICANT.DELETED, {}, 200));
	};

	return {
		create,
		getAll,
		getById,
		update,
		action,
		getActivities,
		createActivity,
		getAttachments,
		uploadAttachment,
		removeAttachment,
		remove,
	};
};
