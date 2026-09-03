import { Request, Response, NextFunction } from "express";
import { Prisma, PrismaClient } from "../../generated/prisma";
import { buildErrorResponse, formatZodErrors } from "../../helper/error-handler";
import {
	buildFilterConditions,
	buildSearchConditions,
	getNestedFields,
	normalizeAndValidateFieldSelection,
} from "../../helper/query-builder.helper";
import { getLogger } from "../../helper/logger.helper";
import { buildPagination, buildSuccessResponse } from "../../helper/success-handler.helper";
import { transformFormDataToObject } from "../../helper/transformObject";
import { validateQueryParams } from "../../helper/validation-helper";
import { CreateDocumentTypeSchema, UpdateDocumentTypeSchema } from "../../zod/documentType.zod";
import { applyInferredDocumentFieldValidation } from "../../helper/document-field-validation.helper";
import { logActivity } from "../../utils/activityLogger";
import { logAudit } from "../../utils/auditLogger";
import { config } from "../../config/constant";

const normalizeRequestData = (req: Request) => {
	const contentType = req.get("Content-Type") || "";
	if (
		contentType.includes("application/x-www-form-urlencoded") ||
		contentType.includes("multipart/form-data")
	) {
		return transformFormDataToObject(req.body);
	}
	return req.body;
};

const sanitizeDocumentTypeFieldSelection = (fields?: string) => {
	if (!fields) {
		return undefined;
	}

	const sanitizedFields = fields
		.split(",")
		.map((field) => field.trim())
		.filter((field) => field && field !== "description")
		.join(",");

	return sanitizedFields || undefined;
};

export const controller = (prisma: PrismaClient) => {
	const logger = getLogger().child({ module: "documentType" });

	const create = async (req: Request, res: Response, _next: NextFunction) => {
		const requestData = normalizeRequestData(req);
		const validation = CreateDocumentTypeSchema.safeParse(requestData);

		if (!validation.success) {
			res.status(400).json(
				buildErrorResponse(
					"Validation failed",
					400,
					formatZodErrors(validation.error.format()),
				),
			);
			return;
		}

		try {
			const created = await prisma.documentType.create({
				data: validation.data as Prisma.DocumentTypeCreateInput,
			});

			logActivity(req, {
				userId: (req as any).user?.id || "unknown",
				action: config.ACTIVITY_LOG.DOCUMENT_TYPE.ACTIONS.CREATE_DOCUMENT_TYPE,
				description: `${config.ACTIVITY_LOG.DOCUMENT_TYPE.DESCRIPTIONS.DOCUMENT_TYPE_CREATED}: ${created.name || created.id}`,
				page: {
					url: req.originalUrl,
					title: config.ACTIVITY_LOG.DOCUMENT_TYPE.PAGES.DOCUMENT_TYPE_CREATION,
				},
			});

			logAudit(req, {
				userId: (req as any).user?.id || "unknown",
				action: config.AUDIT_LOG.ACTIONS.CREATE,
				resource: config.AUDIT_LOG.RESOURCES.DOCUMENT_TYPE,
				severity: config.AUDIT_LOG.SEVERITY.MEDIUM,
				entityType: config.AUDIT_LOG.ENTITY_TYPES.DOCUMENT_TYPE,
				entityId: created.id,
				changesBefore: null,
				changesAfter: {
					id: created.id,
					name: created.name,
					code: created.code,
					category: created.category,
					createdAt: created.createdAt,
					updatedAt: created.updatedAt,
				},
				description: `${config.AUDIT_LOG.DOCUMENT_TYPE.DESCRIPTIONS.DOCUMENT_TYPE_CREATED}: ${created.name || created.id}`,
			});

			res.status(201).json(
				buildSuccessResponse("Document type created successfully", created, 201),
			);
		} catch (error) {
			logger.error("Failed to create document type", { error });
			res.status(500).json(buildErrorResponse("Failed to create document type", 500));
		}
	};

	const getAll = async (req: Request, res: Response, _next: NextFunction) => {
		const validationResult = validateQueryParams(req, logger);
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
			const sanitizedFields =
				typeof fields === "string" ? sanitizeDocumentTypeFieldSelection(fields) : undefined;
			const { normalizedFields, errors: fieldErrors } = normalizeAndValidateFieldSelection(
				"DocumentType",
				sanitizedFields,
			);
			if (fieldErrors.length > 0) {
				res.status(400).json(
					buildErrorResponse("Invalid fields parameter", 400, [
						{ field: "fields", message: fieldErrors.join(" ") },
					]),
				);
				return;
			}

			const whereClause: Prisma.DocumentTypeWhereInput = {
				isDeleted: false,
			};

			if (query) {
				const searchConditions = buildSearchConditions("DocumentType", query, [
					"name",
					"code",
					"category",
				]);
				if (searchConditions.length > 0) {
					whereClause.OR = searchConditions;
				}
			}

			if (filter) {
				const filterConditions = buildFilterConditions("DocumentType", filter);
				if (filterConditions.length > 0) {
					whereClause.AND = filterConditions;
				}
			}

			const selectedFields = getNestedFields(normalizedFields);
			const sortField =
				typeof sort === "string" && sort.trim() ? sort.trim() : "displayOrder";
			const orderBy = {
				[sortField]: order,
			} as Prisma.DocumentTypeOrderByWithRelationInput;

			const [documentTypesResult, total] = await Promise.all([
				document
					? prisma.documentType.findMany({
							where: whereClause,
							skip,
							take: limit,
							orderBy,
							select: selectedFields,
						})
					: [],
				count ? prisma.documentType.count({ where: whereClause }) : 0,
			]);
			const documentTypes = documentTypesResult.map((documentType) =>
				applyInferredDocumentFieldValidation(documentType as any),
			);

			logActivity(req, {
				userId: (req as any).user?.id || "unknown",
				action: config.ACTIVITY_LOG.DOCUMENT_TYPE.ACTIONS.GET_ALL_DOCUMENT_TYPE,
				description: config.ACTIVITY_LOG.DOCUMENT_TYPE.DESCRIPTIONS.DOCUMENT_TYPES_RETRIEVED,
				page: {
					url: req.originalUrl,
					title: config.ACTIVITY_LOG.DOCUMENT_TYPE.PAGES.DOCUMENT_TYPE_LIST,
				},
			});

			res.status(200).json(
				buildSuccessResponse(
					"Document types retrieved successfully",
					{
						...(document && { documentTypes }),
						...(count && { count: total }),
						...(pagination && { pagination: buildPagination(total, page, limit) }),
					},
					200,
				),
			);
		} catch (error) {
			logger.error("Failed to fetch document types", { error });
			res.status(500).json(buildErrorResponse("Failed to fetch document types", 500));
		}
	};

	const getById = async (req: Request, res: Response, _next: NextFunction) => {
		const { id } = req.params;
		const { fields } = req.query;

		try {
			const sanitizedFields =
				typeof fields === "string" ? sanitizeDocumentTypeFieldSelection(fields) : undefined;
			const { normalizedFields, errors: fieldErrors } = normalizeAndValidateFieldSelection(
				"DocumentType",
				sanitizedFields,
			);
			if (fieldErrors.length > 0) {
				res.status(400).json(
					buildErrorResponse("Invalid fields parameter", 400, [
						{ field: "fields", message: fieldErrors.join(" ") },
					]),
				);
				return;
			}

			const documentTypeResult = await prisma.documentType.findFirst({
				where: { id, isDeleted: false },
				select: getNestedFields(normalizedFields),
			});

			if (!documentTypeResult) {
				res.status(404).json(buildErrorResponse("Document type not found", 404));
				return;
			}
			const documentType = applyInferredDocumentFieldValidation(documentTypeResult as any);

			logActivity(req, {
				userId: (req as any).user?.id || "unknown",
				action: config.ACTIVITY_LOG.DOCUMENT_TYPE.ACTIONS.GET_DOCUMENT_TYPE,
				description: `${config.ACTIVITY_LOG.DOCUMENT_TYPE.DESCRIPTIONS.DOCUMENT_TYPE_RETRIEVED}: ${documentType.id}`,
				page: {
					url: req.originalUrl,
					title: config.ACTIVITY_LOG.DOCUMENT_TYPE.PAGES.DOCUMENT_TYPE_DETAILS,
				},
			});

			res.status(200).json(
				buildSuccessResponse("Document type retrieved successfully", documentType, 200),
			);
		} catch (error) {
			logger.error("Failed to fetch document type", { error });
			res.status(500).json(buildErrorResponse("Failed to fetch document type", 500));
		}
	};

	const update = async (req: Request, res: Response, _next: NextFunction) => {
		const { id } = req.params;
		const requestData = normalizeRequestData(req);
		const validation = UpdateDocumentTypeSchema.safeParse(requestData);

		if (!validation.success) {
			res.status(400).json(
				buildErrorResponse(
					"Validation failed",
					400,
					formatZodErrors(validation.error.format()),
				),
			);
			return;
		}

		try {
			const existing = await prisma.documentType.findFirst({
				where: { id, isDeleted: false },
			});
			if (!existing) {
				res.status(404).json(buildErrorResponse("Document type not found", 404));
				return;
			}

			const updated = await prisma.documentType.update({
				where: { id },
				data: validation.data as Prisma.DocumentTypeUpdateInput,
			});

			logActivity(req, {
				userId: (req as any).user?.id || "unknown",
				action: config.ACTIVITY_LOG.DOCUMENT_TYPE.ACTIONS.UPDATE_DOCUMENT_TYPE,
				description: `${config.ACTIVITY_LOG.DOCUMENT_TYPE.DESCRIPTIONS.DOCUMENT_TYPE_UPDATED}: ${updated.name || updated.id}`,
				page: {
					url: req.originalUrl,
					title: config.ACTIVITY_LOG.DOCUMENT_TYPE.PAGES.DOCUMENT_TYPE_UPDATE,
				},
			});

			logAudit(req, {
				userId: (req as any).user?.id || "unknown",
				action: config.AUDIT_LOG.ACTIONS.UPDATE,
				resource: config.AUDIT_LOG.RESOURCES.DOCUMENT_TYPE,
				severity: config.AUDIT_LOG.SEVERITY.MEDIUM,
				entityType: config.AUDIT_LOG.ENTITY_TYPES.DOCUMENT_TYPE,
				entityId: updated.id,
				changesBefore: existing,
				changesAfter: updated,
				description: `${config.AUDIT_LOG.DOCUMENT_TYPE.DESCRIPTIONS.DOCUMENT_TYPE_UPDATED}: ${updated.name || updated.id}`,
			});

			res.status(200).json(
				buildSuccessResponse("Document type updated successfully", updated, 200),
			);
		} catch (error) {
			logger.error("Failed to update document type", { error });
			res.status(500).json(buildErrorResponse("Failed to update document type", 500));
		}
	};

	const remove = async (req: Request, res: Response, _next: NextFunction) => {
		const { id } = req.params;
		try {
			const existing = await prisma.documentType.findFirst({
				where: { id, isDeleted: false },
			});
			if (!existing) {
				res.status(404).json(buildErrorResponse("Document type not found", 404));
				return;
			}

			await prisma.documentType.update({
				where: { id },
				data: { isDeleted: true, isActive: false },
			});

			logActivity(req, {
				userId: (req as any).user?.id || "unknown",
				action: config.ACTIVITY_LOG.DOCUMENT_TYPE.ACTIONS.DELETE_DOCUMENT_TYPE,
				description: `${config.ACTIVITY_LOG.DOCUMENT_TYPE.DESCRIPTIONS.DOCUMENT_TYPE_DELETED}: ${existing.name || id}`,
				page: {
					url: req.originalUrl,
					title: config.ACTIVITY_LOG.DOCUMENT_TYPE.PAGES.DOCUMENT_TYPE_DELETION,
				},
			});

			logAudit(req, {
				userId: (req as any).user?.id || "unknown",
				action: config.AUDIT_LOG.ACTIONS.DELETE,
				resource: config.AUDIT_LOG.RESOURCES.DOCUMENT_TYPE,
				severity: config.AUDIT_LOG.SEVERITY.MEDIUM,
				entityType: config.AUDIT_LOG.ENTITY_TYPES.DOCUMENT_TYPE,
				entityId: id,
				changesBefore: existing,
				changesAfter: null,
				description: `${config.AUDIT_LOG.DOCUMENT_TYPE.DESCRIPTIONS.DOCUMENT_TYPE_DELETED}: ${existing.name || id}`,
			});

			res.status(200).json(
				buildSuccessResponse("Document type deleted successfully", { id }, 200),
			);
		} catch (error) {
			logger.error("Failed to delete document type", { error });
			res.status(500).json(buildErrorResponse("Failed to delete document type", 500));
		}
	};

	return {
		create,
		getAll,
		getById,
		update,
		remove,
	};
};
