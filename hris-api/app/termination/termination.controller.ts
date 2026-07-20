import { Request, Response, NextFunction } from "express";
import { PrismaClient, Prisma } from "../../generated/prisma";
import { getLogger } from "../../helper/logger.helper";
import { transformFormDataToObject } from "../../helper/transformObject";
import { buildSuccessResponse } from "../../helper/success-handler.helper";
import { buildErrorResponse, formatZodErrors } from "../../helper/error-handler";
import {
	CreateTerminationSchema,
	UpdateTerminationSchema,
	HRDirectorApprovalSchema,
	LegalApprovalSchema,
	CompleteTerminationSchema,
} from "../../zod/termination.zod";
import { config } from "../../config/constant";
import { logActivity } from "../../utils/activityLogger";
import { logAudit } from "../../utils/auditLogger";
import { invalidateCache } from "../../middleware/cache";
import { validateQueryParams } from "../../helper/validation-helper";
import {
	buildFilterConditions,
	buildFindManyQuery,
	buildSearchConditions,
} from "../../helper/query-builder.helper";

interface AuthRequest extends Request {
	user?: { id: string; organizationId: string };
	role?: string;
}

const logger = getLogger();
const terminationLogger = logger.child({ module: "termination" });
const asRecord = (value: unknown): Record<string, any> =>
	value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, any>) : {};
const getJsonString = (value: unknown, key: string): string => {
	const raw = asRecord(value)[key];
	return typeof raw === "string" ? raw : "";
};

const resolveTerminationActorId = (req: Request | AuthRequest): string =>
	(req as AuthRequest).user?.id || (req as AuthRequest & { userId?: string }).userId || "unknown";

// Generate the next termination number in the format TRM-YYYY-XXXXX
async function generateTerminationNumber(
	prisma: PrismaClient,
	organizationId: string,
): Promise<string> {
	const year = new Date().getFullYear();
	const prefix = `TRM-${year}-`;

	// Find the highest existing termination number for this year
	const lastTermination = await prisma.termination.findFirst({
		where: {
			organizationId,
			terminationNumber: { startsWith: prefix },
		},
		orderBy: { terminationNumber: "desc" },
		select: { terminationNumber: true },
	});

	let nextNumber = 1;
	if (lastTermination?.terminationNumber) {
		const lastNumberStr = lastTermination.terminationNumber.replace(prefix, "");
		const lastNumber = parseInt(lastNumberStr, 10);
		if (!isNaN(lastNumber)) {
			nextNumber = lastNumber + 1;
		}
	}

	return `${prefix}${nextNumber.toString().padStart(5, "0")}`;
}

export const controller = (prisma: PrismaClient) => {
	// ============================================================================
	// CREATE TERMINATION
	// ============================================================================
	const create = async (req: AuthRequest, res: Response, _next: NextFunction) => {
		let terminationData = req.body;
		const contentType = req.get("Content-Type") || "";

		if (
			contentType.includes("application/x-www-form-urlencoded") ||
			contentType.includes("multipart/form-data")
		) {
			terminationData = transformFormDataToObject(req.body);
		}

		const validation = CreateTerminationSchema.safeParse(terminationData);
		if (!validation.success) {
			const formattedErrors = formatZodErrors(validation.error.format());
			terminationLogger.error(`Validation failed: ${JSON.stringify(formattedErrors)}`);
			const errorResponse = buildErrorResponse("Validation failed", 400, formattedErrors);
			res.status(400).json(errorResponse);
			return;
		}

		try {
			const organizationId = validation.data.organizationId || req.user?.organizationId;

			if (!organizationId) {
				terminationLogger.error("Organization ID is required");
				const errorResponse = buildErrorResponse("Organization ID is required", 400);
				res.status(400).json(errorResponse);
				return;
			}

			// Verify employee exists
			const employee = await prisma.employee.findUnique({
				where: { id: validation.data.employeeId, isDeleted: false },
				select: { id: true, employeeId: true },
			});

			if (!employee) {
				terminationLogger.error(`Employee not found: ${validation.data.employeeId}`);
				const errorResponse = buildErrorResponse("Employee not found", 404);
				res.status(404).json(errorResponse);
				return;
			}

			// Generate termination number
			const terminationNumber = await generateTerminationNumber(prisma, organizationId);

			// Determine if legal approval is required based on termination type
			const legalApprovalRequired =
				validation.data.legalApprovalRequired ||
				["MISCONDUCT", "PERFORMANCE"].includes(validation.data.terminationType);

			const termination = await prisma.termination.create({
				data: {
					terminationNumber,
					organizationId,
					employeeId: validation.data.employeeId,
					initiatedById: validation.data.initiatedById,
					terminationType: validation.data.terminationType,
					status: "DRAFT",
					terminationDate: validation.data.terminationDate,
					lastWorkingDay: validation.data.lastWorkingDay,
					reason: validation.data.reason,
					severancePackage: validation.data.severancePackage,
					supportingDocuments: validation.data.supportingDocuments || [],
					legalApprovalRequired,
				},
				include: {
					employee: {
						select: {
							id: true,
							employeeId: true,
							person: {
								select: {
									personalInfo: true,
								},
							},
						},
					},
					initiatedBy: {
						select: {
							id: true,
							employeeId: true,
							person: {
								select: {
									personalInfo: true,
								},
							},
						},
					},
				},
			});

			// Create audit log
			const initiatorName = (termination as any).initiatedBy?.person?.personalInfo
				? `${getJsonString((termination as any).initiatedBy?.person?.personalInfo, "firstName")} ${getJsonString((termination as any).initiatedBy?.person?.personalInfo, "lastName")}`
				: "Unknown";

			await prisma.terminationAuditLog.create({
				data: {
					terminationId: termination.id,
					action: "CREATED",
					performedBy: validation.data.initiatedById,
					performedByName: initiatorName,
					fromStatus: null,
					toStatus: "DRAFT",
					comments: "Termination draft created",
				},
			});

			// Invalidate cache
			try {
				await invalidateCache.byPattern("cache:termination:*");
			} catch (cacheError) {
				terminationLogger.warn("Failed to invalidate cache:", cacheError);
			}

			terminationLogger.info(`Termination created: ${termination.id}`);

			logActivity(req, {
				userId: resolveTerminationActorId(req),
				action: config.ACTIVITY_LOG.TERMINATION.ACTIONS.CREATE_TERMINATION,
				description: `${config.ACTIVITY_LOG.TERMINATION.DESCRIPTIONS.TERMINATION_CREATED}: ${termination.terminationNumber}`,
				organizationId: organizationId,
				page: {
					url: req.originalUrl,
					title: config.ACTIVITY_LOG.TERMINATION.PAGES.TERMINATION_CREATION,
				},
			});

			logAudit(req, {
				userId: resolveTerminationActorId(req),
				action: config.AUDIT_LOG.ACTIONS.CREATE,
				resource: config.AUDIT_LOG.RESOURCES.TERMINATION,
				severity: config.AUDIT_LOG.SEVERITY.MEDIUM,
				entityType: config.AUDIT_LOG.ENTITY_TYPES.TERMINATION,
				entityId: termination.id,
				changesBefore: null,
				changesAfter: {
					id: termination.id,
					terminationNumber: termination.terminationNumber,
					employeeId: termination.employeeId,
					status: termination.status,
					terminationType: termination.terminationType,
				},
				description: config.AUDIT_LOG.TERMINATION.DESCRIPTIONS.TERMINATION_CREATED,
				organizationId,
			});

			const successResponse = buildSuccessResponse(
				config.SUCCESS.TERMINATION.CREATED,
				termination,
				201,
			);
			res.status(201).json(successResponse);
		} catch (error) {
			terminationLogger.error(`Error creating termination: ${error}`);
			res.status(500).json(
				buildErrorResponse(config.ERROR.COMMON.INTERNAL_SERVER_ERROR, 500),
			);
		}
	};

	// ============================================================================
	// GET ALL TERMINATIONS
	// ============================================================================
	const getAll = async (req: Request, res: Response, _next: NextFunction) => {
		const validationResult = validateQueryParams(req, terminationLogger);

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
		} = validationResult.validatedParams!;

		try {
			const whereClause: Prisma.TerminationWhereInput = {
				isDeleted: false,
			};

			const searchFields = ["terminationNumber", "reason"];
			if (query) {
				const searchConditions = buildSearchConditions("Termination", query, searchFields);
				if (searchConditions.length > 0) {
					whereClause.OR = searchConditions;
				}
			}

			if (filter) {
				const filterConditions = buildFilterConditions("Termination", filter);
				if (filterConditions.length > 0) {
					whereClause.AND = filterConditions;
				}
			}

			const findManyQuery = buildFindManyQuery(whereClause, skip, limit, order, sort, fields);

			// Add includes for employee information
			(findManyQuery as any).include = {
				employee: {
					select: {
						id: true,
						employeeId: true,
						person: {
							select: {
								personalInfo: true,
							},
						},
					},
				},
				initiatedBy: {
					select: {
						id: true,
						employeeId: true,
						person: {
							select: {
								personalInfo: true,
							},
						},
					},
				},
			};

			const [terminations, total] = await Promise.all([
				document ? prisma.termination.findMany(findManyQuery) : [],
				count ? prisma.termination.count({ where: whereClause }) : 0,
			]);

			const responseData: Record<string, any> = {
				...(document && { terminations }),
				...(count && { count: total }),
				...(pagination && {
					pagination: {
						page,
						limit,
						total,
						totalPages: Math.ceil(total / limit),
					},
				}),
			};

			logActivity(req, {
				userId: resolveTerminationActorId(req),
				action: config.ACTIVITY_LOG.TERMINATION.ACTIONS.GET_ALL_TERMINATION,
				description: config.ACTIVITY_LOG.TERMINATION.DESCRIPTIONS.TERMINATIONS_RETRIEVED,
				page: {
					url: req.originalUrl,
					title: config.ACTIVITY_LOG.TERMINATION.PAGES.TERMINATION_LIST,
				},
			});

			const successResponse = buildSuccessResponse(
				config.SUCCESS.TERMINATION.RETRIEVED_ALL,
				responseData,
				200,
			);
			res.status(200).json(successResponse);
		} catch (error) {
			terminationLogger.error(`Error fetching terminations: ${error}`);
			res.status(500).json(
				buildErrorResponse(config.ERROR.COMMON.INTERNAL_SERVER_ERROR, 500),
			);
		}
	};

	// ============================================================================
	// GET TERMINATION BY ID
	// ============================================================================
	const getById = async (req: Request, res: Response, _next: NextFunction) => {
		const { id } = req.params;

		try {
			if (!id) {
				const errorResponse = buildErrorResponse(config.ERROR.QUERY_PARAMS.MISSING_ID, 400);
				res.status(400).json(errorResponse);
				return;
			}

			const termination = await prisma.termination.findFirst({
				where: { id, isDeleted: false },
				include: {
					employee: {
						select: {
							id: true,
							employeeId: true,
							employmentType: true,
							employmentStatus: true,
							department: { select: { id: true, name: true } },
							position: { select: { id: true, title: true } },
							person: {
								select: {
									personalInfo: true,
									contactInfo: true,
								},
							},
						},
					},
					initiatedBy: {
						select: {
							id: true,
							employeeId: true,
							person: {
								select: {
									personalInfo: true,
								},
							},
						},
					},
					hrDirectorApprovedBy: {
						select: {
							id: true,
							employeeId: true,
							person: {
								select: {
									personalInfo: true,
								},
							},
						},
					},
					legalApprovedBy: {
						select: {
							id: true,
							employeeId: true,
							person: {
								select: {
									personalInfo: true,
								},
							},
						},
					},
					auditLogs: {
						orderBy: { timestamp: "desc" },
					},
				},
			});

			if (!termination) {
				const errorResponse = buildErrorResponse(config.ERROR.TERMINATION.NOT_FOUND, 404);
				res.status(404).json(errorResponse);
				return;
			}

			logActivity(req, {
				userId: resolveTerminationActorId(req),
				action: config.ACTIVITY_LOG.TERMINATION.ACTIONS.GET_TERMINATION,
				description: `${config.ACTIVITY_LOG.TERMINATION.DESCRIPTIONS.TERMINATION_RETRIEVED}: ${termination.terminationNumber}`,
				organizationId: termination.organizationId,
				page: {
					url: req.originalUrl,
					title: config.ACTIVITY_LOG.TERMINATION.PAGES.TERMINATION_DETAILS,
				},
			});

			const successResponse = buildSuccessResponse(
				config.SUCCESS.TERMINATION.RETRIEVED,
				termination,
				200,
			);
			res.status(200).json(successResponse);
		} catch (error) {
			terminationLogger.error(`Error fetching termination: ${error}`);
			res.status(500).json(
				buildErrorResponse(config.ERROR.COMMON.INTERNAL_SERVER_ERROR, 500),
			);
		}
	};

	// ============================================================================
	// UPDATE TERMINATION (DRAFT ONLY)
	// ============================================================================
	const update = async (req: Request, res: Response, _next: NextFunction) => {
		const { id } = req.params;
		let updateData = req.body;
		const contentType = req.get("Content-Type") || "";

		if (
			contentType.includes("application/x-www-form-urlencoded") ||
			contentType.includes("multipart/form-data")
		) {
			updateData = transformFormDataToObject(req.body);
		}

		try {
			if (!id) {
				const errorResponse = buildErrorResponse(config.ERROR.QUERY_PARAMS.MISSING_ID, 400);
				res.status(400).json(errorResponse);
				return;
			}

			const validation = UpdateTerminationSchema.safeParse(updateData);
			if (!validation.success) {
				const formattedErrors = formatZodErrors(validation.error.format());
				const errorResponse = buildErrorResponse("Validation failed", 400, formattedErrors);
				res.status(400).json(errorResponse);
				return;
			}

			// Check if termination exists and is in DRAFT status
			const existing = await prisma.termination.findFirst({
				where: { id, isDeleted: false },
			});

			if (!existing) {
				const errorResponse = buildErrorResponse(config.ERROR.TERMINATION.NOT_FOUND, 404);
				res.status(404).json(errorResponse);
				return;
			}

			if (existing.status !== "DRAFT") {
				const errorResponse = buildErrorResponse(
					"Termination can only be updated in DRAFT status",
					409,
				);
				res.status(409).json(errorResponse);
				return;
			}

			const termination = await prisma.termination.update({
				where: { id },
				data: validation.data,
				include: {
					employee: {
						select: {
							id: true,
							employeeId: true,
							person: {
								select: {
									personalInfo: true,
								},
							},
						},
					},
				},
			});

			try {
				await invalidateCache.byPattern("cache:termination:*");
			} catch (cacheError) {
				terminationLogger.warn("Failed to invalidate cache:", cacheError);
			}

			logActivity(req, {
				userId: resolveTerminationActorId(req),
				action: config.ACTIVITY_LOG.TERMINATION.ACTIONS.UPDATE_TERMINATION,
				description: `${config.ACTIVITY_LOG.TERMINATION.DESCRIPTIONS.TERMINATION_UPDATED}: ${termination.terminationNumber}`,
				organizationId: existing.organizationId,
				page: {
					url: req.originalUrl,
					title: config.ACTIVITY_LOG.TERMINATION.PAGES.TERMINATION_UPDATE,
				},
			});

			logAudit(req, {
				userId: resolveTerminationActorId(req),
				action: config.AUDIT_LOG.ACTIONS.UPDATE,
				resource: config.AUDIT_LOG.RESOURCES.TERMINATION,
				severity: config.AUDIT_LOG.SEVERITY.MEDIUM,
				entityType: config.AUDIT_LOG.ENTITY_TYPES.TERMINATION,
				entityId: termination.id,
				changesBefore: {
					id: existing.id,
					status: existing.status,
					terminationNumber: existing.terminationNumber,
					employeeId: existing.employeeId,
				},
				changesAfter: {
					id: termination.id,
					status: termination.status,
					terminationNumber: termination.terminationNumber,
					employeeId: termination.employeeId,
				},
				description: config.AUDIT_LOG.TERMINATION.DESCRIPTIONS.TERMINATION_UPDATED,
				organizationId: existing.organizationId,
			});

			const successResponse = buildSuccessResponse(
				config.SUCCESS.TERMINATION.UPDATED,
				termination,
				200,
			);
			res.status(200).json(successResponse);
		} catch (error) {
			terminationLogger.error(`Error updating termination: ${error}`);
			res.status(500).json(
				buildErrorResponse(config.ERROR.COMMON.INTERNAL_SERVER_ERROR, 500),
			);
		}
	};

	// ============================================================================
	// DELETE TERMINATION (DRAFT ONLY)
	// ============================================================================
	const remove = async (req: Request, res: Response, _next: NextFunction) => {
		const { id } = req.params;

		try {
			if (!id) {
				const errorResponse = buildErrorResponse(config.ERROR.QUERY_PARAMS.MISSING_ID, 400);
				res.status(400).json(errorResponse);
				return;
			}

			const existing = await prisma.termination.findFirst({
				where: { id, isDeleted: false },
			});

			if (!existing) {
				const errorResponse = buildErrorResponse(config.ERROR.TERMINATION.NOT_FOUND, 404);
				res.status(404).json(errorResponse);
				return;
			}

			if (existing.status !== "DRAFT") {
				const errorResponse = buildErrorResponse(
					"Only DRAFT terminations can be deleted",
					409,
				);
				res.status(409).json(errorResponse);
				return;
			}

			await prisma.termination.update({
				where: { id },
				data: { isDeleted: true },
			});

			try {
				await invalidateCache.byPattern("cache:termination:*");
			} catch (cacheError) {
				terminationLogger.warn("Failed to invalidate cache:", cacheError);
			}

			logActivity(req, {
				userId: resolveTerminationActorId(req),
				action: config.ACTIVITY_LOG.TERMINATION.ACTIONS.DELETE_TERMINATION,
				description: `${config.ACTIVITY_LOG.TERMINATION.DESCRIPTIONS.TERMINATION_DELETED}: ${existing.terminationNumber}`,
				organizationId: existing.organizationId,
				page: {
					url: req.originalUrl,
					title: config.ACTIVITY_LOG.TERMINATION.PAGES.TERMINATION_DELETION,
				},
			});

			logAudit(req, {
				userId: resolveTerminationActorId(req),
				action: config.AUDIT_LOG.ACTIONS.DELETE,
				resource: config.AUDIT_LOG.RESOURCES.TERMINATION,
				severity: config.AUDIT_LOG.SEVERITY.HIGH,
				entityType: config.AUDIT_LOG.ENTITY_TYPES.TERMINATION,
				entityId: existing.id,
				changesBefore: {
					id: existing.id,
					status: existing.status,
					terminationNumber: existing.terminationNumber,
					employeeId: existing.employeeId,
					isDeleted: false,
				},
				changesAfter: {
					id: existing.id,
					isDeleted: true,
				},
				description: config.AUDIT_LOG.TERMINATION.DESCRIPTIONS.TERMINATION_DELETED,
				organizationId: existing.organizationId,
			});

			const successResponse = buildSuccessResponse(
				config.SUCCESS.TERMINATION.DELETED,
				{},
				200,
			);
			res.status(200).json(successResponse);
		} catch (error) {
			terminationLogger.error(`Error deleting termination: ${error}`);
			res.status(500).json(
				buildErrorResponse(config.ERROR.COMMON.INTERNAL_SERVER_ERROR, 500),
			);
		}
	};

	// ============================================================================
	// SUBMIT TERMINATION (DRAFT -> PENDING_HR_DIRECTOR)
	// ============================================================================
	const submit = async (req: AuthRequest, res: Response, _next: NextFunction) => {
		const { id } = req.params;

		try {
			if (!id) {
				const errorResponse = buildErrorResponse(config.ERROR.QUERY_PARAMS.MISSING_ID, 400);
				res.status(400).json(errorResponse);
				return;
			}

			const existing = await prisma.termination.findFirst({
				where: { id, isDeleted: false },
				include: {
					initiatedBy: {
						select: {
							id: true,
							person: {
								select: {
									personalInfo: true,
								},
							},
						},
					},
				},
			});

			if (!existing) {
				const errorResponse = buildErrorResponse(config.ERROR.TERMINATION.NOT_FOUND, 404);
				res.status(404).json(errorResponse);
				return;
			}

			if (existing.status !== "DRAFT") {
				const errorResponse = buildErrorResponse(
					"Only DRAFT terminations can be submitted",
					409,
				);
				res.status(409).json(errorResponse);
				return;
			}

			const termination = await prisma.termination.update({
				where: { id },
				data: { status: "PENDING_HR_DIRECTOR" },
			});

			const performerName = (existing as any).initiatedBy?.person?.personalInfo
				? `${getJsonString((existing as any).initiatedBy?.person?.personalInfo, "firstName")} ${getJsonString((existing as any).initiatedBy?.person?.personalInfo, "lastName")}`
				: "Unknown";

			await prisma.terminationAuditLog.create({
				data: {
					terminationId: id,
					action: "SUBMITTED",
					performedBy: existing.initiatedById,
					performedByName: performerName,
					fromStatus: "DRAFT",
					toStatus: "PENDING_HR_DIRECTOR",
					comments: "Termination submitted for HR Director approval",
				},
			});

			try {
				await invalidateCache.byPattern("cache:termination:*");
			} catch (cacheError) {
				terminationLogger.warn("Failed to invalidate cache:", cacheError);
			}

			logActivity(req, {
				userId: resolveTerminationActorId(req),
				action: config.ACTIVITY_LOG.TERMINATION.ACTIONS.SUBMIT_TERMINATION,
				description: `${config.ACTIVITY_LOG.TERMINATION.DESCRIPTIONS.TERMINATION_SUBMITTED}: ${existing.terminationNumber}`,
				organizationId: existing.organizationId,
				page: {
					url: req.originalUrl,
					title: config.ACTIVITY_LOG.TERMINATION.PAGES.TERMINATION_WORKFLOW,
				},
			});

			logAudit(req, {
				userId: resolveTerminationActorId(req),
				action: config.AUDIT_LOG.ACTIONS.UPDATE,
				resource: config.AUDIT_LOG.RESOURCES.TERMINATION,
				severity: config.AUDIT_LOG.SEVERITY.HIGH,
				entityType: config.AUDIT_LOG.ENTITY_TYPES.TERMINATION,
				entityId: id,
				changesBefore: { status: "DRAFT" },
				changesAfter: { status: "PENDING_HR_DIRECTOR" },
				description: config.ACTIVITY_LOG.TERMINATION.DESCRIPTIONS.TERMINATION_SUBMITTED,
				organizationId: existing.organizationId,
			});

			const successResponse = buildSuccessResponse(
				"Termination submitted for approval",
				termination,
				200,
			);
			res.status(200).json(successResponse);
		} catch (error) {
			terminationLogger.error(`Error submitting termination: ${error}`);
			res.status(500).json(
				buildErrorResponse(config.ERROR.COMMON.INTERNAL_SERVER_ERROR, 500),
			);
		}
	};

	// ============================================================================
	// HR DIRECTOR APPROVAL
	// ============================================================================
	const hrDirectorApproval = async (req: AuthRequest, res: Response, _next: NextFunction) => {
		const { id } = req.params;

		try {
			const validation = HRDirectorApprovalSchema.safeParse({ id, ...req.body });
			if (!validation.success) {
				const formattedErrors = formatZodErrors(validation.error.format());
				const errorResponse = buildErrorResponse("Validation failed", 400, formattedErrors);
				res.status(400).json(errorResponse);
				return;
			}

			const existing = await prisma.termination.findFirst({
				where: { id, isDeleted: false },
			});

			if (!existing) {
				const errorResponse = buildErrorResponse(config.ERROR.TERMINATION.NOT_FOUND, 404);
				res.status(404).json(errorResponse);
				return;
			}

			if (existing.status !== "PENDING_HR_DIRECTOR") {
				const errorResponse = buildErrorResponse(
					`Cannot ${validation.data.action} when status is ${existing.status}`,
					409,
				);
				res.status(409).json(errorResponse);
				return;
			}

			// Get approver name
			const approver = await prisma.employee.findUnique({
				where: { id: validation.data.approverId },
				select: {
					person: {
						select: {
							personalInfo: true,
						},
					},
				},
			});

			const approverName = approver?.person?.personalInfo
				? `${getJsonString(approver?.person?.personalInfo, "firstName")} ${getJsonString(approver?.person?.personalInfo, "lastName")}`
				: "Unknown";

			const isApproval = validation.data.action === "approve";
			const newStatus = isApproval
				? existing.legalApprovalRequired
					? "PENDING_LEGAL"
					: "APPROVED"
				: "REJECTED";

			const termination = await prisma.termination.update({
				where: { id },
				data: {
					status: newStatus,
					hrDirectorApprovedAt: new Date(),
					hrDirectorId: validation.data.approverId,
					hrDirectorComments: validation.data.comments,
				},
			});

			await prisma.terminationAuditLog.create({
				data: {
					terminationId: id,
					action: isApproval ? "HR_DIRECTOR_APPROVED" : "HR_DIRECTOR_REJECTED",
					performedBy: validation.data.approverId,
					performedByName: approverName,
					fromStatus: "PENDING_HR_DIRECTOR",
					toStatus: newStatus,
					comments:
						validation.data.comments ||
						`HR Director ${validation.data.action}d the termination`,
				},
			});

			try {
				await invalidateCache.byPattern("cache:termination:*");
			} catch (cacheError) {
				terminationLogger.warn("Failed to invalidate cache:", cacheError);
			}

			logActivity(req, {
				userId: resolveTerminationActorId(req),
				action: config.ACTIVITY_LOG.TERMINATION.ACTIONS.HR_DIRECTOR_APPROVAL,
				description: `${config.ACTIVITY_LOG.TERMINATION.DESCRIPTIONS.TERMINATION_HR_APPROVED}: ${existing.terminationNumber}`,
				organizationId: existing.organizationId,
				page: {
					url: req.originalUrl,
					title: config.ACTIVITY_LOG.TERMINATION.PAGES.TERMINATION_WORKFLOW,
				},
			});

			logAudit(req, {
				userId: resolveTerminationActorId(req),
				action: config.AUDIT_LOG.ACTIONS.UPDATE,
				resource: config.AUDIT_LOG.RESOURCES.TERMINATION,
				severity: config.AUDIT_LOG.SEVERITY.HIGH,
				entityType: config.AUDIT_LOG.ENTITY_TYPES.TERMINATION,
				entityId: id,
				changesBefore: { status: "PENDING_HR_DIRECTOR" },
				changesAfter: {
					status: newStatus,
					action: validation.data.action,
					approverId: validation.data.approverId,
				},
				description: config.ACTIVITY_LOG.TERMINATION.DESCRIPTIONS.TERMINATION_HR_APPROVED,
				organizationId: existing.organizationId,
			});

			const successResponse = buildSuccessResponse(
				`Termination ${validation.data.action}d by HR Director`,
				termination,
				200,
			);
			res.status(200).json(successResponse);
		} catch (error) {
			terminationLogger.error(`Error in HR Director approval: ${error}`);
			res.status(500).json(
				buildErrorResponse(config.ERROR.COMMON.INTERNAL_SERVER_ERROR, 500),
			);
		}
	};

	// ============================================================================
	// LEGAL APPROVAL
	// ============================================================================
	const legalApproval = async (req: AuthRequest, res: Response, _next: NextFunction) => {
		const { id } = req.params;

		try {
			const validation = LegalApprovalSchema.safeParse({ id, ...req.body });
			if (!validation.success) {
				const formattedErrors = formatZodErrors(validation.error.format());
				const errorResponse = buildErrorResponse("Validation failed", 400, formattedErrors);
				res.status(400).json(errorResponse);
				return;
			}

			const existing = await prisma.termination.findFirst({
				where: { id, isDeleted: false },
			});

			if (!existing) {
				const errorResponse = buildErrorResponse(config.ERROR.TERMINATION.NOT_FOUND, 404);
				res.status(404).json(errorResponse);
				return;
			}

			if (existing.status !== "PENDING_LEGAL") {
				const errorResponse = buildErrorResponse(
					`Cannot ${validation.data.action} when status is ${existing.status}`,
					409,
				);
				res.status(409).json(errorResponse);
				return;
			}

			const approver = await prisma.employee.findUnique({
				where: { id: validation.data.approverId },
				select: {
					person: {
						select: {
							personalInfo: true,
						},
					},
				},
			});

			const approverName = approver?.person?.personalInfo
				? `${getJsonString(approver?.person?.personalInfo, "firstName")} ${getJsonString(approver?.person?.personalInfo, "lastName")}`
				: "Unknown";

			const isApproval = validation.data.action === "approve";
			const newStatus = isApproval ? "APPROVED" : "REJECTED";

			const termination = await prisma.termination.update({
				where: { id },
				data: {
					status: newStatus,
					legalApprovedAt: new Date(),
					legalApproverId: validation.data.approverId,
					legalComments: validation.data.comments,
				},
			});

			await prisma.terminationAuditLog.create({
				data: {
					terminationId: id,
					action: isApproval ? "LEGAL_APPROVED" : "LEGAL_REJECTED",
					performedBy: validation.data.approverId,
					performedByName: approverName,
					fromStatus: "PENDING_LEGAL",
					toStatus: newStatus,
					comments:
						validation.data.comments ||
						`Legal ${validation.data.action}d the termination`,
				},
			});

			try {
				await invalidateCache.byPattern("cache:termination:*");
			} catch (cacheError) {
				terminationLogger.warn("Failed to invalidate cache:", cacheError);
			}

			logActivity(req, {
				userId: resolveTerminationActorId(req),
				action: config.ACTIVITY_LOG.TERMINATION.ACTIONS.LEGAL_APPROVAL,
				description: `${config.ACTIVITY_LOG.TERMINATION.DESCRIPTIONS.TERMINATION_LEGAL_APPROVED}: ${existing.terminationNumber}`,
				organizationId: existing.organizationId,
				page: {
					url: req.originalUrl,
					title: config.ACTIVITY_LOG.TERMINATION.PAGES.TERMINATION_WORKFLOW,
				},
			});

			logAudit(req, {
				userId: resolveTerminationActorId(req),
				action: config.AUDIT_LOG.ACTIONS.UPDATE,
				resource: config.AUDIT_LOG.RESOURCES.TERMINATION,
				severity: config.AUDIT_LOG.SEVERITY.HIGH,
				entityType: config.AUDIT_LOG.ENTITY_TYPES.TERMINATION,
				entityId: id,
				changesBefore: { status: "PENDING_LEGAL" },
				changesAfter: {
					status: newStatus,
					action: validation.data.action,
					approverId: validation.data.approverId,
				},
				description: config.ACTIVITY_LOG.TERMINATION.DESCRIPTIONS.TERMINATION_LEGAL_APPROVED,
				organizationId: existing.organizationId,
			});

			const successResponse = buildSuccessResponse(
				`Termination ${validation.data.action}d by Legal`,
				termination,
				200,
			);
			res.status(200).json(successResponse);
		} catch (error) {
			terminationLogger.error(`Error in Legal approval: ${error}`);
			res.status(500).json(
				buildErrorResponse(config.ERROR.COMMON.INTERNAL_SERVER_ERROR, 500),
			);
		}
	};

	// ============================================================================
	// START PROCESSING (APPROVED -> PROCESSING)
	// ============================================================================
	const startProcessing = async (req: AuthRequest, res: Response, _next: NextFunction) => {
		const { id } = req.params;

		try {
			if (!id) {
				const errorResponse = buildErrorResponse(config.ERROR.QUERY_PARAMS.MISSING_ID, 400);
				res.status(400).json(errorResponse);
				return;
			}

			const existing = await prisma.termination.findFirst({
				where: { id, isDeleted: false },
			});

			if (!existing) {
				const errorResponse = buildErrorResponse(config.ERROR.TERMINATION.NOT_FOUND, 404);
				res.status(404).json(errorResponse);
				return;
			}

			if (existing.status !== "APPROVED") {
				const errorResponse = buildErrorResponse(
					"Only APPROVED terminations can start processing",
					409,
				);
				res.status(409).json(errorResponse);
				return;
			}

			const termination = await prisma.termination.update({
				where: { id },
				data: {
					status: "PROCESSING",
					processingStartedAt: new Date(),
				},
			});

			// Update employee status to TERMINATED
			await prisma.employee.update({
				where: { id: existing.employeeId },
				data: {
					employmentStatus: "TERMINATED",
					employmentTerminationDate: existing.lastWorkingDay,
				},
			});

			await prisma.terminationAuditLog.create({
				data: {
					terminationId: id,
					action: "PROCESSING_STARTED",
					performedBy: req.user?.id || "system",
					performedByName: "System",
					fromStatus: "APPROVED",
					toStatus: "PROCESSING",
					comments: "Offboarding process started",
				},
			});

			try {
				await invalidateCache.byPattern("cache:termination:*");
				await invalidateCache.byPattern("cache:employee:*");
			} catch (cacheError) {
				terminationLogger.warn("Failed to invalidate cache:", cacheError);
			}

			logActivity(req, {
				userId: resolveTerminationActorId(req),
				action: config.ACTIVITY_LOG.TERMINATION.ACTIONS.START_PROCESSING,
				description: `${config.ACTIVITY_LOG.TERMINATION.DESCRIPTIONS.TERMINATION_PROCESSING_STARTED}: ${existing.terminationNumber}`,
				organizationId: existing.organizationId,
				page: {
					url: req.originalUrl,
					title: config.ACTIVITY_LOG.TERMINATION.PAGES.TERMINATION_WORKFLOW,
				},
			});

			logAudit(req, {
				userId: resolveTerminationActorId(req),
				action: config.AUDIT_LOG.ACTIONS.UPDATE,
				resource: config.AUDIT_LOG.RESOURCES.TERMINATION,
				severity: config.AUDIT_LOG.SEVERITY.HIGH,
				entityType: config.AUDIT_LOG.ENTITY_TYPES.TERMINATION,
				entityId: id,
				changesBefore: { status: "APPROVED" },
				changesAfter: {
					status: "PROCESSING",
					employeeId: existing.employeeId,
					employmentStatus: "TERMINATED",
				},
				description:
					config.ACTIVITY_LOG.TERMINATION.DESCRIPTIONS.TERMINATION_PROCESSING_STARTED,
				organizationId: existing.organizationId,
			});

			const successResponse = buildSuccessResponse(
				"Termination processing started",
				termination,
				200,
			);
			res.status(200).json(successResponse);
		} catch (error) {
			terminationLogger.error(`Error starting processing: ${error}`);
			res.status(500).json(
				buildErrorResponse(config.ERROR.COMMON.INTERNAL_SERVER_ERROR, 500),
			);
		}
	};

	// ============================================================================
	// COMPLETE TERMINATION (PROCESSING -> COMPLETED)
	// ============================================================================
	const complete = async (req: AuthRequest, res: Response, _next: NextFunction) => {
		const { id } = req.params;

		try {
			const validation = CompleteTerminationSchema.safeParse({ id, ...req.body });
			if (!validation.success) {
				const formattedErrors = formatZodErrors(validation.error.format());
				const errorResponse = buildErrorResponse("Validation failed", 400, formattedErrors);
				res.status(400).json(errorResponse);
				return;
			}

			const existing = await prisma.termination.findFirst({
				where: { id, isDeleted: false },
			});

			if (!existing) {
				const errorResponse = buildErrorResponse(config.ERROR.TERMINATION.NOT_FOUND, 404);
				res.status(404).json(errorResponse);
				return;
			}

			if (existing.status !== "PROCESSING") {
				const errorResponse = buildErrorResponse(
					"Only PROCESSING terminations can be completed",
					409,
				);
				res.status(409).json(errorResponse);
				return;
			}

			const termination = await prisma.termination.update({
				where: { id },
				data: {
					status: "COMPLETED",
					processingCompletedAt: new Date(),
					finalPayCalculated: validation.data.finalPayCalculated,
					clearanceCompleted: validation.data.clearanceCompleted,
					terminationLetterPath: validation.data.terminationLetterPath,
				},
			});

			// Update the employee status to TERMINATED
			await prisma.employee.update({
				where: { id: existing.employeeId },
				data: {
					employmentStatus: "TERMINATED",
					employmentTerminationDate: existing.lastWorkingDay,
				},
			});

			await prisma.terminationAuditLog.create({
				data: {
					terminationId: id,
					action: "COMPLETED",
					performedBy: req.user?.id || "system",
					performedByName: "System",
					fromStatus: "PROCESSING",
					toStatus: "COMPLETED",
					comments:
						"Termination process completed. Employee status updated to TERMINATED.",
				},
			});

			try {
				await invalidateCache.byPattern("cache:termination:*");
				await invalidateCache.byPattern("cache:employee:*");
			} catch (cacheError) {
				terminationLogger.warn("Failed to invalidate cache:", cacheError);
			}

			logActivity(req, {
				userId: resolveTerminationActorId(req),
				action: config.ACTIVITY_LOG.TERMINATION.ACTIONS.COMPLETE_TERMINATION,
				description: `${config.ACTIVITY_LOG.TERMINATION.DESCRIPTIONS.TERMINATION_COMPLETED}: ${existing.terminationNumber}`,
				organizationId: existing.organizationId,
				page: {
					url: req.originalUrl,
					title: config.ACTIVITY_LOG.TERMINATION.PAGES.TERMINATION_WORKFLOW,
				},
			});

			logAudit(req, {
				userId: resolveTerminationActorId(req),
				action: config.AUDIT_LOG.ACTIONS.UPDATE,
				resource: config.AUDIT_LOG.RESOURCES.TERMINATION,
				severity: config.AUDIT_LOG.SEVERITY.HIGH,
				entityType: config.AUDIT_LOG.ENTITY_TYPES.TERMINATION,
				entityId: id,
				changesBefore: { status: "PROCESSING" },
				changesAfter: {
					status: "COMPLETED",
					finalPayCalculated: validation.data.finalPayCalculated,
					clearanceCompleted: validation.data.clearanceCompleted,
				},
				description: config.ACTIVITY_LOG.TERMINATION.DESCRIPTIONS.TERMINATION_COMPLETED,
				organizationId: existing.organizationId,
			});

			const successResponse = buildSuccessResponse("Termination completed", termination, 200);
			res.status(200).json(successResponse);
		} catch (error) {
			terminationLogger.error(`Error completing termination: ${error}`);
			res.status(500).json(
				buildErrorResponse(config.ERROR.COMMON.INTERNAL_SERVER_ERROR, 500),
			);
		}
	};

	return {
		create,
		getAll,
		getById,
		update,
		remove,
		submit,
		hrDirectorApproval,
		legalApproval,
		startProcessing,
		complete,
	};
};
