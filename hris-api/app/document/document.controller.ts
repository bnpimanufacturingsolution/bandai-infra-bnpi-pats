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
import { CreateDocumentSchema, UpdateDocumentSchema } from "../../zod/document.zod";
import { logActivity } from "../../utils/activityLogger";
import { logAudit } from "../../utils/auditLogger";
import { config } from "../../config/constant";
import { redisClient } from "../../config/redis";
import { invalidateCache } from "../../middleware/cache";

const logger = getLogger();
const documentLogger = logger.child({ module: "document" });

export const controller = (prisma: PrismaClient) => {
	const toCreateInput = (data: any): Prisma.DocumentUncheckedCreateInput => ({
		name: data.name,
		type: data.type,
		employeeId: data.employeeId,
		number: data.number ?? "",
		issueDate: data.issueDate ?? new Date(),
		expiryDate: data.expiryDate ?? null,
		fileUrl: data.fileUrl ?? null,
		ext: data.ext ?? null,
		documentTypeId: data.documentTypeId ?? null,
		fieldValues: data.fieldValues ?? null,
		reviewStatus: data.reviewStatus ?? null,
		reviewSubmittedAt: data.reviewSubmittedAt ?? null,
		reviewSubmittedById: data.reviewSubmittedById ?? null,
		reviewApprovedAt: data.reviewApprovedAt ?? null,
		reviewApprovedById: data.reviewApprovedById ?? null,
		reviewRejectedAt: data.reviewRejectedAt ?? null,
		reviewRejectedById: data.reviewRejectedById ?? null,
		reviewRejectionReason: data.reviewRejectionReason ?? null,
		reviewSource: data.reviewSource ?? null,
		metadata: data.metadata ?? null,
		isDeleted: data.isDeleted ?? false,
	});

	const toUpdateInput = (data: any): Prisma.DocumentUncheckedUpdateInput => {
		const updateData: Prisma.DocumentUncheckedUpdateInput = {};

		if (data.name !== undefined) updateData.name = data.name;
		if (data.type !== undefined) updateData.type = data.type;
		if (data.number !== undefined) updateData.number = data.number ?? "";
		if (data.issueDate !== undefined) updateData.issueDate = data.issueDate ?? new Date();
		if (data.expiryDate !== undefined) updateData.expiryDate = data.expiryDate ?? null;
		if (data.fileUrl !== undefined) updateData.fileUrl = data.fileUrl ?? null;
		if (data.ext !== undefined) updateData.ext = data.ext ?? null;
		if (data.documentTypeId !== undefined) updateData.documentTypeId = data.documentTypeId ?? null;
		if (data.fieldValues !== undefined) updateData.fieldValues = data.fieldValues ?? null;
		if (data.reviewStatus !== undefined) updateData.reviewStatus = data.reviewStatus ?? null;
		if (data.reviewSubmittedAt !== undefined) updateData.reviewSubmittedAt = data.reviewSubmittedAt ?? null;
		if (data.reviewSubmittedById !== undefined) updateData.reviewSubmittedById = data.reviewSubmittedById ?? null;
		if (data.reviewApprovedAt !== undefined) updateData.reviewApprovedAt = data.reviewApprovedAt ?? null;
		if (data.reviewApprovedById !== undefined) updateData.reviewApprovedById = data.reviewApprovedById ?? null;
		if (data.reviewRejectedAt !== undefined) updateData.reviewRejectedAt = data.reviewRejectedAt ?? null;
		if (data.reviewRejectedById !== undefined) updateData.reviewRejectedById = data.reviewRejectedById ?? null;
		if (data.reviewRejectionReason !== undefined) {
			updateData.reviewRejectionReason = data.reviewRejectionReason ?? null;
		}
		if (data.reviewSource !== undefined) updateData.reviewSource = data.reviewSource ?? null;
		if (data.metadata !== undefined) updateData.metadata = data.metadata ?? null;

		return updateData;
	};

	const create = async (req: Request, res: Response, _next: NextFunction) => {
		let requestData = req.body;
		const contentType = req.get("Content-Type") || "";

		if (
			contentType.includes("application/x-www-form-urlencoded") ||
			contentType.includes("multipart/form-data")
		) {
			documentLogger.info("Original form data:", JSON.stringify(req.body, null, 2));
			requestData = transformFormDataToObject(req.body);
			documentLogger.info(
				"Transformed form data to object structure:",
				JSON.stringify(requestData, null, 2),
			);
		}

		const validation = CreateDocumentSchema.safeParse(requestData);
		if (!validation.success) {
			const formattedErrors = formatZodErrors(validation.error.format());
			documentLogger.error(`Validation failed: ${JSON.stringify(formattedErrors)}`);
			const errorResponse = buildErrorResponse("Validation failed", 400, formattedErrors);
			res.status(400).json(errorResponse);
			return;
		}

		try {
			const createData = toCreateInput(validation.data);
			const document = await prisma.document.create({ data: createData });
			documentLogger.info(`Document created successfully: ${document.id}`);

			logActivity(req, {
				userId: (req as any).user?.id || "unknown",
				action: config.ACTIVITY_LOG.DOCUMENT.ACTIONS.CREATE_DOCUMENT,
				description: `${config.ACTIVITY_LOG.DOCUMENT.DESCRIPTIONS.DOCUMENT_CREATED}: ${document.name || document.id}`,
				page: {
					url: req.originalUrl,
					title: config.ACTIVITY_LOG.DOCUMENT.PAGES.DOCUMENT_CREATION,
				},
			});

			logAudit(req, {
				userId: (req as any).user?.id || "unknown",
				action: config.AUDIT_LOG.ACTIONS.CREATE,
				resource: config.AUDIT_LOG.RESOURCES.DOCUMENT,
				severity: config.AUDIT_LOG.SEVERITY.LOW,
				entityType: config.AUDIT_LOG.ENTITY_TYPES.DOCUMENT,
				entityId: document.id,
				changesBefore: null,
				changesAfter: {
					id: document.id,
					name: document.name,
					createdAt: document.createdAt,
					updatedAt: document.updatedAt,
				},
				description: `${config.AUDIT_LOG.DOCUMENT.DESCRIPTIONS.DOCUMENT_CREATED}: ${document.name || document.id}`,
			});

			try {
				await invalidateCache.byPattern("cache:document:list:*");
				documentLogger.info("Document list cache invalidated after creation");
			} catch (cacheError) {
				documentLogger.warn(
					"Failed to invalidate cache after document creation:",
					cacheError,
				);
			}

			const successResponse = buildSuccessResponse(
				config.SUCCESS.DOCUMENT.CREATED,
				document,
				201,
			);
			res.status(201).json(successResponse);
		} catch (error) {
			documentLogger.error(`${config.ERROR.DOCUMENT.CREATE_FAILED}: ${error}`);
			const errorResponse = buildErrorResponse(
				config.ERROR.COMMON.INTERNAL_SERVER_ERROR,
				500,
			);
			res.status(500).json(errorResponse);
		}
	};
	const getAll = async (req: Request, res: Response, _next: NextFunction) => {
		const validationResult = validateQueryParams(req, documentLogger);

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

		documentLogger.info(
			`Getting documents, page: ${page}, limit: ${limit}, query: ${query}, order: ${order}, groupBy: ${groupBy}`,
		);

		try {
			// Base where clause
			const whereClause: Prisma.DocumentWhereInput = {
				isDeleted: false,
			};

			const searchFields = ["name", "type", "number", "ext"];
			if (query) {
				const searchConditions = buildSearchConditions("Document", query, searchFields);
				if (searchConditions.length > 0) {
					whereClause.OR = searchConditions;
				}
			}

			if (filter) {
				const filterConditions = buildFilterConditions("Document", filter);
				if (filterConditions.length > 0) {
					whereClause.AND = filterConditions;
				}
			}
			const findManyQuery = buildFindManyQuery(whereClause, skip, limit, order, sort, fields);

			const [documents, total] = await Promise.all([
				document ? prisma.document.findMany(findManyQuery) : [],
				count ? prisma.document.count({ where: whereClause }) : 0,
			]);

			documentLogger.info(`Retrieved ${documents.length} documents`);
			const processedData =
				groupBy && document ? groupDataByField(documents, groupBy as string) : documents;

			const responseData: Record<string, any> = {
				...(document && { documents: processedData }),
				...(count && { count: total }),
				...(pagination && { pagination: buildPagination(total, page, limit) }),
				...(groupBy && { groupedBy: groupBy }),
			};

			res.status(200).json(
				buildSuccessResponse(config.SUCCESS.DOCUMENT.RETRIEVED_ALL, responseData, 200),
			);
		} catch (error) {
			documentLogger.error(`${config.ERROR.DOCUMENT.GET_ALL_FAILED}: ${error}`);
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
				documentLogger.error(config.ERROR.QUERY_PARAMS.MISSING_ID);
				const errorResponse = buildErrorResponse(config.ERROR.QUERY_PARAMS.MISSING_ID, 400);
				res.status(400).json(errorResponse);
				return;
			}

			if (fields && typeof fields !== "string") {
				documentLogger.error(`${config.ERROR.QUERY_PARAMS.INVALID_POPULATE}: ${fields}`);
				const errorResponse = buildErrorResponse(
					config.ERROR.QUERY_PARAMS.POPULATE_MUST_BE_STRING,
					400,
				);
				res.status(400).json(errorResponse);
				return;
			}

			documentLogger.info(`${config.SUCCESS.DOCUMENT.GETTING_BY_ID}: ${id}`);

			const cacheKey = `cache:document:byId:${id}:${fields || "full"}`;
			let document = null;

			try {
				if (redisClient.isClientConnected()) {
					document = await redisClient.getJSON(cacheKey);
					if (document) {
						documentLogger.info(`Document ${id} retrieved from direct Redis cache`);
					}
				}
			} catch (cacheError) {
				documentLogger.warn(`Redis cache retrieval failed for document ${id}:`, cacheError);
			}

			if (!document) {
				const query: Prisma.DocumentFindFirstArgs = {
					where: { id },
				};
				const selectedFields = typeof fields === "string" ? fields : undefined;
				query.select = getNestedFields(selectedFields);

				document = await prisma.document.findFirst(query);

				if (document && redisClient.isClientConnected()) {
					try {
						await redisClient.setJSON(cacheKey, document, 3600);
						documentLogger.info(`Document ${id} stored in direct Redis cache`);
					} catch (cacheError) {
						documentLogger.warn(
							`Failed to store document ${id} in Redis cache:`,
							cacheError,
						);
					}
				}
			}

			if (!document) {
				documentLogger.error(`${config.ERROR.DOCUMENT.NOT_FOUND}: ${id}`);
				const errorResponse = buildErrorResponse(config.ERROR.DOCUMENT.NOT_FOUND, 404);
				res.status(404).json(errorResponse);
				return;
			}

			documentLogger.info(`${config.SUCCESS.DOCUMENT.RETRIEVED}: ${(document as any).id}`);
			const successResponse = buildSuccessResponse(
				config.SUCCESS.DOCUMENT.RETRIEVED,
				document,
				200,
			);
			res.status(200).json(successResponse);
		} catch (error) {
			documentLogger.error(`${config.ERROR.DOCUMENT.ERROR_GETTING}: ${error}`);
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
				documentLogger.error(config.ERROR.QUERY_PARAMS.MISSING_ID);
				const errorResponse = buildErrorResponse(config.ERROR.QUERY_PARAMS.MISSING_ID, 400);
				res.status(400).json(errorResponse);
				return;
			}

			const validationResult = UpdateDocumentSchema.safeParse(req.body);

			if (!validationResult.success) {
				const formattedErrors = formatZodErrors(validationResult.error.format());
				documentLogger.error(`Validation failed: ${JSON.stringify(formattedErrors)}`);
				const errorResponse = buildErrorResponse("Validation failed", 400, formattedErrors);
				res.status(400).json(errorResponse);
				return;
			}

			if (Object.keys(req.body).length === 0) {
				documentLogger.error(config.ERROR.COMMON.NO_UPDATE_FIELDS);
				const errorResponse = buildErrorResponse(config.ERROR.COMMON.NO_UPDATE_FIELDS, 400);
				res.status(400).json(errorResponse);
				return;
			}

			const validatedData = validationResult.data;

			documentLogger.info(`Updating document: ${id}`);

			const existingDocument = await prisma.document.findFirst({
				where: { id },
			});

			if (!existingDocument) {
				documentLogger.error(`${config.ERROR.DOCUMENT.NOT_FOUND}: ${id}`);
				const errorResponse = buildErrorResponse(config.ERROR.DOCUMENT.NOT_FOUND, 404);
				res.status(404).json(errorResponse);
				return;
			}

			const prismaData = toUpdateInput(validatedData);

			const updatedDocument = await prisma.document.update({
				where: { id },
				data: prismaData,
			});

			try {
				await invalidateCache.byPattern(`cache:document:byId:${id}:*`);
				await invalidateCache.byPattern("cache:document:list:*");
				documentLogger.info(`Cache invalidated after document ${id} update`);
			} catch (cacheError) {
				documentLogger.warn(
					"Failed to invalidate cache after document update:",
					cacheError,
				);
			}

			documentLogger.info(`${config.SUCCESS.DOCUMENT.UPDATED}: ${updatedDocument.id}`);
			const successResponse = buildSuccessResponse(
				config.SUCCESS.DOCUMENT.UPDATED,
				{ document: updatedDocument },
				200,
			);
			res.status(200).json(successResponse);
		} catch (error) {
			documentLogger.error(`${config.ERROR.DOCUMENT.ERROR_UPDATING}: ${error}`);
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
				documentLogger.error(config.ERROR.QUERY_PARAMS.MISSING_ID);
				const errorResponse = buildErrorResponse(config.ERROR.QUERY_PARAMS.MISSING_ID, 400);
				res.status(400).json(errorResponse);
				return;
			}

			documentLogger.info(`${config.SUCCESS.DOCUMENT.DELETED}: ${id}`);

			const existingDocument = await prisma.document.findFirst({
				where: { id },
			});

			if (!existingDocument) {
				documentLogger.error(`${config.ERROR.DOCUMENT.NOT_FOUND}: ${id}`);
				const errorResponse = buildErrorResponse(config.ERROR.DOCUMENT.NOT_FOUND, 404);
				res.status(404).json(errorResponse);
				return;
			}

			await prisma.document.delete({
				where: { id },
			});

			try {
				await invalidateCache.byPattern(`cache:document:byId:${id}:*`);
				await invalidateCache.byPattern("cache:document:list:*");
				documentLogger.info(`Cache invalidated after document ${id} deletion`);
			} catch (cacheError) {
				documentLogger.warn(
					"Failed to invalidate cache after document deletion:",
					cacheError,
				);
			}

			documentLogger.info(`${config.SUCCESS.DOCUMENT.DELETED}: ${id}`);
			const successResponse = buildSuccessResponse(config.SUCCESS.DOCUMENT.DELETED, {}, 200);
			res.status(200).json(successResponse);
		} catch (error) {
			documentLogger.error(`${config.ERROR.DOCUMENT.DELETE_FAILED}: ${error}`);
			const errorResponse = buildErrorResponse(
				config.ERROR.COMMON.INTERNAL_SERVER_ERROR,
				500,
			);
			res.status(500).json(errorResponse);
		}
	};

	return { create, getAll, getById, update, remove };
};
