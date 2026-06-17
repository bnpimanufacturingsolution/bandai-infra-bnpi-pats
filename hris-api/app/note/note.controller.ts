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
import { CreateNoteSchema, UpdateNoteSchema } from "../../zod/note.zod";
import { logActivity } from "../../utils/activityLogger";
import { logAudit } from "../../utils/auditLogger";
import { config } from "../../config/constant";
import { redisClient } from "../../config/redis";
import { invalidateCache } from "../../middleware/cache";

const logger = getLogger();
const noteLogger = logger.child({ module: "note" });

export const controller = (prisma: PrismaClient) => {
	const create = async (req: Request, res: Response, _next: NextFunction) => {
		let requestData = req.body;
		const contentType = req.get("Content-Type") || "";

		if (
			contentType.includes("application/x-www-form-urlencoded") ||
			contentType.includes("multipart/form-data")
		) {
			noteLogger.info("Original form data:", JSON.stringify(req.body, null, 2));
			requestData = transformFormDataToObject(req.body);
			noteLogger.info(
				"Transformed form data to object structure:",
				JSON.stringify(requestData, null, 2),
			);
		}

		const validation = CreateNoteSchema.safeParse(requestData);
		if (!validation.success) {
			const formattedErrors = formatZodErrors(validation.error.format());
			noteLogger.error(`Validation failed: ${JSON.stringify(formattedErrors)}`);
			const errorResponse = buildErrorResponse("Validation failed", 400, formattedErrors);
			res.status(400).json(errorResponse);
			return;
		}

		try {
			const note = await prisma.note.create({ data: validation.data });
			noteLogger.info(`Note created successfully: ${note.id}`);

			logActivity(req, {
				userId: (req as any).user?.id || "unknown",
				action: config.ACTIVITY_LOG.NOTE.ACTIONS.CREATE_NOTE,
				description: `${config.ACTIVITY_LOG.NOTE.DESCRIPTIONS.NOTE_CREATED}: ${note.id}`,
				page: {
					url: req.originalUrl,
					title: config.ACTIVITY_LOG.NOTE.PAGES.NOTE_CREATION,
				},
			});

			logAudit(req, {
				userId: (req as any).user?.id || "unknown",
				action: config.AUDIT_LOG.ACTIONS.CREATE,
				resource: config.AUDIT_LOG.RESOURCES.NOTE,
				severity: config.AUDIT_LOG.SEVERITY.LOW,
				entityType: config.AUDIT_LOG.ENTITY_TYPES.NOTE,
				entityId: note.id,
				changesBefore: null,
				changesAfter: {
					id: note.id,
					createdAt: note.createdAt,
					updatedAt: note.updatedAt,
				},
				description: `${config.AUDIT_LOG.NOTE.DESCRIPTIONS.NOTE_CREATED}: ${note.id}`,
			});

			try {
				await invalidateCache.byPattern("cache:note:list:*");
				noteLogger.info("Note list cache invalidated after creation");
			} catch (cacheError) {
				noteLogger.warn("Failed to invalidate cache after note creation:", cacheError);
			}

			const successResponse = buildSuccessResponse(config.SUCCESS.NOTE.CREATED, note, 201);
			res.status(201).json(successResponse);
		} catch (error) {
			noteLogger.error(`${config.ERROR.NOTE.CREATE_FAILED}: ${error}`);
			const errorResponse = buildErrorResponse(
				config.ERROR.COMMON.INTERNAL_SERVER_ERROR,
				500,
			);
			res.status(500).json(errorResponse);
		}
	};
	const getAll = async (req: Request, res: Response, _next: NextFunction) => {
		const validationResult = validateQueryParams(req, noteLogger);

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

		noteLogger.info(
			`Getting notes, page: ${page}, limit: ${limit}, query: ${query}, order: ${order}, groupBy: ${groupBy}`,
		);

		try {
			// Base where clause
			const whereClause: Prisma.NoteWhereInput = {
				isDeleted: false,
			};

			// search fields sample ("name", "description", "type")
			const searchFields = ["name", "description", "type"];
			if (query) {
				const searchConditions = buildSearchConditions("Note", query, searchFields);
				if (searchConditions.length > 0) {
					whereClause.OR = searchConditions;
				}
			}

			if (filter) {
				const filterConditions = buildFilterConditions("Note", filter);
				if (filterConditions.length > 0) {
					whereClause.AND = filterConditions;
				}
			}
			const findManyQuery = buildFindManyQuery(whereClause, skip, limit, order, sort, fields);

			const [notes, total] = await Promise.all([
				document ? prisma.note.findMany(findManyQuery) : [],
				count ? prisma.note.count({ where: whereClause }) : 0,
			]);

			noteLogger.info(`Retrieved ${notes.length} notes`);
			const processedData =
				groupBy && document ? groupDataByField(notes, groupBy as string) : notes;

			const responseData: Record<string, any> = {
				...(document && { notes: processedData }),
				...(count && { count: total }),
				...(pagination && { pagination: buildPagination(total, page, limit) }),
				...(groupBy && { groupedBy: groupBy }),
			};

			res.status(200).json(
				buildSuccessResponse(config.SUCCESS.NOTE.RETRIEVED_ALL, responseData, 200),
			);
		} catch (error) {
			noteLogger.error(`${config.ERROR.NOTE.GET_ALL_FAILED}: ${error}`);
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
				noteLogger.error(config.ERROR.QUERY_PARAMS.MISSING_ID);
				const errorResponse = buildErrorResponse(config.ERROR.QUERY_PARAMS.MISSING_ID, 400);
				res.status(400).json(errorResponse);
				return;
			}

			if (fields && typeof fields !== "string") {
				noteLogger.error(`${config.ERROR.QUERY_PARAMS.INVALID_POPULATE}: ${fields}`);
				const errorResponse = buildErrorResponse(
					config.ERROR.QUERY_PARAMS.POPULATE_MUST_BE_STRING,
					400,
				);
				res.status(400).json(errorResponse);
				return;
			}

			noteLogger.info(`${config.SUCCESS.NOTE.GETTING_BY_ID}: ${id}`);

			const cacheKey = `cache:note:byId:${id}:${fields || "full"}`;
			let note = null;

			try {
				if (redisClient.isClientConnected()) {
					note = await redisClient.getJSON(cacheKey);
					if (note) {
						noteLogger.info(`Note ${id} retrieved from direct Redis cache`);
					}
				}
			} catch (cacheError) {
				noteLogger.warn(`Redis cache retrieval failed for note ${id}:`, cacheError);
			}

			if (!note) {
				const query: Prisma.NoteFindFirstArgs = {
					where: { id },
				};

				query.select = getNestedFields(fields);

				note = await prisma.note.findFirst(query);

				if (note && redisClient.isClientConnected()) {
					try {
						await redisClient.setJSON(cacheKey, note, 3600);
						noteLogger.info(`Note ${id} stored in direct Redis cache`);
					} catch (cacheError) {
						noteLogger.warn(`Failed to store note ${id} in Redis cache:`, cacheError);
					}
				}
			}

			if (!note) {
				noteLogger.error(`${config.ERROR.NOTE.NOT_FOUND}: ${id}`);
				const errorResponse = buildErrorResponse(config.ERROR.NOTE.NOT_FOUND, 404);
				res.status(404).json(errorResponse);
				return;
			}

			noteLogger.info(`${config.SUCCESS.NOTE.RETRIEVED}: ${(note as any).id}`);
			const successResponse = buildSuccessResponse(config.SUCCESS.NOTE.RETRIEVED, note, 200);
			res.status(200).json(successResponse);
		} catch (error) {
			noteLogger.error(`${config.ERROR.NOTE.ERROR_GETTING}: ${error}`);
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
				noteLogger.error(config.ERROR.QUERY_PARAMS.MISSING_ID);
				const errorResponse = buildErrorResponse(config.ERROR.QUERY_PARAMS.MISSING_ID, 400);
				res.status(400).json(errorResponse);
				return;
			}

			const validationResult = UpdateNoteSchema.safeParse(req.body);

			if (!validationResult.success) {
				const formattedErrors = formatZodErrors(validationResult.error.format());
				noteLogger.error(`Validation failed: ${JSON.stringify(formattedErrors)}`);
				const errorResponse = buildErrorResponse("Validation failed", 400, formattedErrors);
				res.status(400).json(errorResponse);
				return;
			}

			if (Object.keys(req.body).length === 0) {
				noteLogger.error(config.ERROR.COMMON.NO_UPDATE_FIELDS);
				const errorResponse = buildErrorResponse(config.ERROR.COMMON.NO_UPDATE_FIELDS, 400);
				res.status(400).json(errorResponse);
				return;
			}

			const validatedData = validationResult.data;

			noteLogger.info(`Updating note: ${id}`);

			const existingNote = await prisma.note.findFirst({
				where: { id },
			});

			if (!existingNote) {
				noteLogger.error(`${config.ERROR.NOTE.NOT_FOUND}: ${id}`);
				const errorResponse = buildErrorResponse(config.ERROR.NOTE.NOT_FOUND, 404);
				res.status(404).json(errorResponse);
				return;
			}

			const prismaData = { ...validatedData };

			const updatedNote = await prisma.note.update({
				where: { id },
				data: prismaData,
			});

			try {
				await invalidateCache.byPattern(`cache:note:byId:${id}:*`);
				await invalidateCache.byPattern("cache:note:list:*");
				noteLogger.info(`Cache invalidated after note ${id} update`);
			} catch (cacheError) {
				noteLogger.warn("Failed to invalidate cache after note update:", cacheError);
			}

			noteLogger.info(`${config.SUCCESS.NOTE.UPDATED}: ${updatedNote.id}`);
			const successResponse = buildSuccessResponse(
				config.SUCCESS.NOTE.UPDATED,
				{ note: updatedNote },
				200,
			);
			res.status(200).json(successResponse);
		} catch (error) {
			noteLogger.error(`${config.ERROR.NOTE.ERROR_UPDATING}: ${error}`);
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
				noteLogger.error(config.ERROR.QUERY_PARAMS.MISSING_ID);
				const errorResponse = buildErrorResponse(config.ERROR.QUERY_PARAMS.MISSING_ID, 400);
				res.status(400).json(errorResponse);
				return;
			}

			noteLogger.info(`${config.SUCCESS.NOTE.DELETED}: ${id}`);

			const existingNote = await prisma.note.findFirst({
				where: { id },
			});

			if (!existingNote) {
				noteLogger.error(`${config.ERROR.NOTE.NOT_FOUND}: ${id}`);
				const errorResponse = buildErrorResponse(config.ERROR.NOTE.NOT_FOUND, 404);
				res.status(404).json(errorResponse);
				return;
			}

			await prisma.note.delete({
				where: { id },
			});

			try {
				await invalidateCache.byPattern(`cache:note:byId:${id}:*`);
				await invalidateCache.byPattern("cache:note:list:*");
				noteLogger.info(`Cache invalidated after note ${id} deletion`);
			} catch (cacheError) {
				noteLogger.warn("Failed to invalidate cache after note deletion:", cacheError);
			}

			noteLogger.info(`${config.SUCCESS.NOTE.DELETED}: ${id}`);
			const successResponse = buildSuccessResponse(config.SUCCESS.NOTE.DELETED, {}, 200);
			res.status(200).json(successResponse);
		} catch (error) {
			noteLogger.error(`${config.ERROR.NOTE.DELETE_FAILED}: ${error}`);
			const errorResponse = buildErrorResponse(
				config.ERROR.COMMON.INTERNAL_SERVER_ERROR,
				500,
			);
			res.status(500).json(errorResponse);
		}
	};

	return { create, getAll, getById, update, remove };
};
