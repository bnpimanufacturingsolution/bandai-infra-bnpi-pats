import { Request, Response, NextFunction } from "express";
import { PrismaClient, Prisma, ChecklistStatus } from "../../generated/prisma";
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
import {
	CreateBoardingProcessSchema,
	UpdateBoardingProcessSchema,
} from "../../zod/boardingProcess.zod";
import { logActivity } from "../../utils/activityLogger";
import { logAudit } from "../../utils/auditLogger";
import { config } from "../../config/constant";
import { redisClient } from "../../config/redis";
import { invalidateCache } from "../../middleware/cache";

const logger = getLogger();
const boardingProcessLogger = logger.child({ module: "boardingProcess" });

export const controller = (prisma: PrismaClient) => {
	const create = async (req: Request, res: Response, _next: NextFunction) => {
		let requestData = req.body;
		const contentType = req.get("Content-Type") || "";

		// Transform form data if needed
		if (
			contentType.includes("application/x-www-form-urlencoded") ||
			contentType.includes("multipart/form-data")
		) {
			boardingProcessLogger.info("Original form data:", JSON.stringify(req.body, null, 2));
			requestData = transformFormDataToObject(req.body);
			boardingProcessLogger.info(
				"Transformed form data to object structure:",
				JSON.stringify(requestData, null, 2),
			);
		}

		// Validate request data
		const validation = CreateBoardingProcessSchema.safeParse(requestData);
		if (!validation.success) {
			const formattedErrors = formatZodErrors(validation.error.format());
			boardingProcessLogger.error(`Validation failed: ${JSON.stringify(formattedErrors)}`);
			res.status(400).json(
				buildErrorResponse(
					config.ERROR.BOARDINGPROCESS.VALIDATION_FAILED,
					400,
					formattedErrors,
				),
			);
			return;
		}

		try {
			const { boardingTemplateId, ...boardingProcessData } = validation.data;

			boardingProcessLogger.info(
				`Creating BoardingProcess for employeeId: ${boardingProcessData.employeeId} using templateId: ${boardingTemplateId}`,
			);

			// Fetch boarding template with items
			const templateBoard = await prisma.boardingTemplate.findFirst({
				where: {
					id: boardingTemplateId,
					isDeleted: false,
				},
				include: {
					items: {
						where: { isDeleted: false },
						orderBy: { order: "asc" },
					},
				},
			});

			// Validate template exists
			if (!templateBoard) {
				boardingProcessLogger.error(
					`${config.ERROR.BOARDINGTEMPLATE.NOT_FOUND}: ${boardingTemplateId}`,
				);
				res.status(404).json(
					buildErrorResponse(config.ERROR.BOARDINGTEMPLATE.NOT_FOUND, 404),
				);
				return;
			}

			// Create the boarding process
			const boardingProcess = await prisma.boardingProcess.create({
				data: {
					...boardingProcessData, // Explicitly default to true as requested
				},
			});

			boardingProcessLogger.info(
				`BoardingProcess created: ${boardingProcess.id}, creating ${templateBoard.items.length} checklist items`,
			);

			// Create checklist items from template
			if (templateBoard.items.length > 0) {
				const processStartDate = boardingProcess.startDate;

				const checklistItemsData = templateBoard.items.map((item) => {
					// Calculate due date based on days offset from process start date
					let calculatedDueDate = new Date(processStartDate);

					// Use dueOffset from template item
					if (item.dueOffset !== undefined) {
						calculatedDueDate.setDate(calculatedDueDate.getDate() + item.dueOffset);
					}

					return {
						organizationId: boardingProcess.organizationId,
						processId: boardingProcess.id,
						title: item.title,
						description: item.description || null,
						category: item.category,
						status: ChecklistStatus.PENDING,
						priority: item.priority,
						dueDate: calculatedDueDate,
						order: item.order,
						metadata: item.metadata ?? undefined,
					};
				});

				// Create all checklist items in database
				await prisma.checklistItem.createMany({
					data: checklistItemsData,
				});

				boardingProcessLogger.info(
					`Created ${checklistItemsData.length} checklist items for boarding process: ${boardingProcess.id}`,
				);
			}

			// Fetch the complete boarding process with checklist items
			const completeBoardingProcess = await prisma.boardingProcess.findFirst({
				where: { id: boardingProcess.id },
				include: {
					checklistItems: {
						where: { isDeleted: false },
						orderBy: { order: "asc" },
					},
				},
			});

			boardingProcessLogger.info(
				`BoardingProcess created successfully: ${boardingProcess.id} with ${templateBoard.items.length} checklist items`,
			);

			// Log activity
			logActivity(req, {
				userId: (req as any).user?.id || "unknown",
				action: config.ACTIVITY_LOG.BOARDINGPROCESS.ACTIONS.CREATE_BOARDINGPROCESS,
				description: `${config.ACTIVITY_LOG.BOARDINGPROCESS.DESCRIPTIONS.BOARDINGPROCESS_CREATED}: ${boardingProcess.id}`,
				page: {
					url: req.originalUrl,
					title: config.ACTIVITY_LOG.BOARDINGPROCESS.PAGES.BOARDINGPROCESS_CREATION,
				},
			});

			// Log audit
			logAudit(req, {
				userId: (req as any).user?.id || "unknown",
				action: config.AUDIT_LOG.ACTIONS.CREATE,
				resource: config.AUDIT_LOG.RESOURCES.BOARDINGPROCESS,
				severity: config.AUDIT_LOG.SEVERITY.LOW,
				entityType: config.AUDIT_LOG.ENTITY_TYPES.BOARDINGPROCESS,
				entityId: boardingProcess.id,
				changesBefore: null,
				changesAfter: completeBoardingProcess,
				description: `${config.AUDIT_LOG.BOARDINGPROCESS.DESCRIPTIONS.BOARDINGPROCESS_CREATED}: ${boardingProcess.id}`,
			});

			// Invalidate cache
			try {
				await invalidateCache.byPattern("cache:boardingProcess:list:*");
				boardingProcessLogger.info("BoardingProcess list cache invalidated after creation");
			} catch (cacheError) {
				boardingProcessLogger.warn(
					"Failed to invalidate cache after boardingProcess creation:",
					cacheError,
				);
			}

			res.status(201).json(
				buildSuccessResponse(
					config.SUCCESS.BOARDINGPROCESS.CREATED,
					completeBoardingProcess,
					201,
				),
			);
			return;
		} catch (error) {
			boardingProcessLogger.error(`${config.ERROR.BOARDINGPROCESS.CREATE_FAILED}: ${error}`);
			res.status(500).json(
				buildErrorResponse(config.ERROR.COMMON.INTERNAL_SERVER_ERROR, 500),
			);
			return;
		}
	};
	const getAll = async (req: Request, res: Response, _next: NextFunction) => {
		const validationResult = validateQueryParams(req, boardingProcessLogger);

		// Validate query parameters
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

		boardingProcessLogger.info(
			`Getting boardingProcesss, page: ${page}, limit: ${limit}, query: ${query}, order: ${order}, groupBy: ${groupBy}`,
		);

		try {
			// Base where clause
			const whereClause: Prisma.BoardingProcessWhereInput = {
				isDeleted: false,
			};

			// search fields sample ("name", "description", "type")
			const searchFields = ["name", "description", "type"];
			if (query) {
				const searchConditions = buildSearchConditions(
					"BoardingProcess",
					query,
					searchFields,
				);
				if (searchConditions.length > 0) {
					whereClause.OR = searchConditions;
				}
			}

			if (filter) {
				const filterConditions = buildFilterConditions("BoardingProcess", filter);
				if (filterConditions.length > 0) {
					whereClause.AND = filterConditions;
				}
			}
			const findManyQuery = buildFindManyQuery(whereClause, skip, limit, order, sort, fields);

			const [boardingProcesss, total] = await Promise.all([
				document ? prisma.boardingProcess.findMany(findManyQuery) : [],
				count ? prisma.boardingProcess.count({ where: whereClause }) : 0,
			]);

			boardingProcessLogger.info(`Retrieved ${boardingProcesss.length} boardingProcesss`);
			const processedData =
				groupBy && document
					? groupDataByField(boardingProcesss, groupBy as string)
					: boardingProcesss;

			const responseData: Record<string, any> = {
				...(document && { boardingProcesss: processedData }),
				...(count && { count: total }),
				...(pagination && { pagination: buildPagination(total, page, limit) }),
				...(groupBy && { groupedBy: groupBy }),
			};

			res.status(200).json(
				buildSuccessResponse(
					config.SUCCESS.BOARDINGPROCESS.RETRIEVED_ALL,
					responseData,
					200,
				),
			);
			return;
		} catch (error) {
			boardingProcessLogger.error(`${config.ERROR.BOARDINGPROCESS.GET_ALL_FAILED}: ${error}`);
			res.status(500).json(
				buildErrorResponse(config.ERROR.COMMON.INTERNAL_SERVER_ERROR, 500),
			);
			return;
		}
	};
	const getById = async (req: Request, res: Response, _next: NextFunction) => {
		const { id } = req.params;
		const { fields, category } = req.query;

		try {
			// Validate ID parameter
			if (!id) {
				boardingProcessLogger.error(config.ERROR.QUERY_PARAMS.MISSING_ID);
				res.status(400).json(buildErrorResponse(config.ERROR.QUERY_PARAMS.MISSING_ID, 400));
				return;
			}

			// Validate fields parameter
			if (fields && typeof fields !== "string") {
				boardingProcessLogger.error(
					`${config.ERROR.QUERY_PARAMS.INVALID_POPULATE}: ${fields}`,
				);
				res.status(400).json(
					buildErrorResponse(config.ERROR.QUERY_PARAMS.POPULATE_MUST_BE_STRING, 400),
				);
				return;
			}

			boardingProcessLogger.info(
				`${config.SUCCESS.BOARDINGPROCESS.GETTING_BY_ID}: ${id} ${category ? `with category: ${category}` : ""}`,
			);

			// Try to get from cache (skip cache if category filter is present for now, or include it in key)
			// For simplicity/safety with new feature, let's skip cache if category is present or append it
			const cacheKey = `cache:boardingProcess:byId:${id}:${fields || "full"}:${category || "all"}`;
			let boardingProcess = null;

			try {
				if (redisClient.isClientConnected()) {
					boardingProcess = await redisClient.getJSON(cacheKey);
					if (boardingProcess) {
						boardingProcessLogger.info(`BoardingProcess ${id} retrieved from cache`);
					}
				}
			} catch (cacheError) {
				boardingProcessLogger.warn(
					`Cache retrieval failed for boardingProcess ${id}:`,
					cacheError,
				);
			}

			if (!boardingProcess) {
				const query: Prisma.BoardingProcessFindFirstArgs = {
					where: { id },
				};

				// If fields are specified, use getNestedFields
				// We need to inject the category filter into the checklistItems include/select if it's there
				// getNestedFields returns a select object. We might need to manually adjust it if we want to filter checklistItems.

				let select = getNestedFields(fields as string | undefined);

				// If checklistItems is selected, apply filter
				if (select && select.checklistItems && category) {
					// checklistItems might be true or an object (if nested fields select)
					// We need to ensure it's an object with `where`

					if (select.checklistItems === true) {
						select.checklistItems = {
							where: { category: String(category) as any }, // Cast to any to avoid TS enum mismatch issues if strict
							orderBy: { order: "asc" },
							select: {
								id: true,
								organizationId: true,
								processId: true,
								title: true,
								description: true,
								category: true,
								status: true,
								priority: true,
								dueDate: true,
								completedDate: true,
								completedBy: true,
								completedByName: true,
								order: true,
								uiElement: true,
								comments: true,
								metadata: true,
								isOptional: true,
								estimatedTime: true,
								dependencies: true,
								viewedAt: true,
								startedAt: true,
								reminderSent: true,
								isDeleted: true,
								createdAt: true,
								updatedAt: true,
							},
						};
					} else if (typeof select.checklistItems === "object") {
						// It's already an object (e.g. { select: { ... }, take: ..., ... })
						// We need to merge our where clause
						select.checklistItems.where = {
							...select.checklistItems.where,
							category: String(category),
						};
					}
				}

				query.select = select;

				boardingProcess = await prisma.boardingProcess.findFirst(query);

				if (boardingProcess && redisClient.isClientConnected()) {
					try {
						await redisClient.setJSON(cacheKey, boardingProcess, 3600);
						boardingProcessLogger.info(
							`BoardingProcess ${id} stored in direct Redis cache`,
						);
					} catch (cacheError) {
						boardingProcessLogger.warn(
							`Failed to store boardingProcess ${id} in Redis cache:`,
							cacheError,
						);
					}
				}
			}

			// Check if boarding process exists
			if (!boardingProcess) {
				boardingProcessLogger.error(`${config.ERROR.BOARDINGPROCESS.NOT_FOUND}: ${id}`);
				res.status(404).json(
					buildErrorResponse(config.ERROR.BOARDINGPROCESS.NOT_FOUND, 404),
				);
				return;
			}

			boardingProcessLogger.info(
				`${config.SUCCESS.BOARDINGPROCESS.RETRIEVED}: ${(boardingProcess as any).id}`,
			);
			res.status(200).json(
				buildSuccessResponse(
					config.SUCCESS.BOARDINGPROCESS.RETRIEVED,
					boardingProcess,
					200,
				),
			);
			return;
		} catch (error) {
			boardingProcessLogger.error(`${config.ERROR.BOARDINGPROCESS.ERROR_GETTING}: ${error}`);
			res.status(500).json(
				buildErrorResponse(config.ERROR.COMMON.INTERNAL_SERVER_ERROR, 500),
			);
			return;
		}
	};

	const update = async (req: Request, res: Response, _next: NextFunction) => {
		const { id } = req.params;
		let requestData = req.body;
		const contentType = req.get("Content-Type") || "";

		if (
			contentType.includes("application/x-www-form-urlencoded") ||
			contentType.includes("multipart/form-data")
		) {
			boardingProcessLogger.info(
				"Original form data (update):",
				JSON.stringify(req.body, null, 2),
			);
			requestData = transformFormDataToObject(req.body);
			boardingProcessLogger.info(
				"Transformed form data to object structure (update):",
				JSON.stringify(requestData, null, 2),
			);
		}

		try {
			// Validate ID parameter
			if (!id) {
				boardingProcessLogger.error(config.ERROR.QUERY_PARAMS.MISSING_ID);
				res.status(400).json(buildErrorResponse(config.ERROR.QUERY_PARAMS.MISSING_ID, 400));
				return;
			}

			// Validate request body is not empty
			if (Object.keys(requestData).length === 0) {
				boardingProcessLogger.error(config.ERROR.COMMON.NO_UPDATE_FIELDS);
				res.status(400).json(buildErrorResponse(config.ERROR.COMMON.NO_UPDATE_FIELDS, 400));
				return;
			}

			// Validate request data
			const validationResult = UpdateBoardingProcessSchema.safeParse(requestData);
			if (!validationResult.success) {
				const formattedErrors = formatZodErrors(validationResult.error.format());
				boardingProcessLogger.error(
					`Validation failed: ${JSON.stringify(formattedErrors)}`,
				);
				res.status(400).json(
					buildErrorResponse(
						config.ERROR.BOARDINGPROCESS.VALIDATION_FAILED,
						400,
						formattedErrors,
					),
				);

				return;
			}

			const validatedData = validationResult.data;

			boardingProcessLogger.info(`Updating boardingProcess: ${id}`);

			// Check if boarding process exists
			const existingBoardingProcess = await prisma.boardingProcess.findFirst({
				where: { id },
			});

			if (!existingBoardingProcess) {
				boardingProcessLogger.error(`${config.ERROR.BOARDINGPROCESS.NOT_FOUND}: ${id}`);
				res.status(404).json(
					buildErrorResponse(config.ERROR.BOARDINGPROCESS.NOT_FOUND, 404),
				);
				return;
			}

			boardingProcessLogger.info(`Updating boardingProcess: ${id}`);

			// Update the boarding process
			const updatedBoardingProcess = await prisma.boardingProcess.update({
				where: { id },
				data: validatedData,
			});

			// Invalidate cache
			try {
				await invalidateCache.byPattern(`cache:boardingProcess:byId:${id}:*`);
				await invalidateCache.byPattern("cache:boardingProcess:list:*");
				boardingProcessLogger.info(`Cache invalidated after update: ${id}`);
			} catch (cacheError) {
				boardingProcessLogger.warn("Cache invalidation failed:", cacheError);
			}

			boardingProcessLogger.info(
				`${config.SUCCESS.BOARDINGPROCESS.UPDATED}: ${updatedBoardingProcess.id}`,
			);
			res.status(200).json(
				buildSuccessResponse(
					config.SUCCESS.BOARDINGPROCESS.UPDATED,
					{ boardingProcess: updatedBoardingProcess },
					200,
				),
			);
			return;
		} catch (error) {
			boardingProcessLogger.error(`${config.ERROR.BOARDINGPROCESS.ERROR_UPDATING}: ${error}`);
			res.status(500).json(
				buildErrorResponse(config.ERROR.COMMON.INTERNAL_SERVER_ERROR, 500),
			);
			return;
		}
	};

	const remove = async (req: Request, res: Response, _next: NextFunction) => {
		const { id } = req.params;

		try {
			// Validate ID parameter
			if (!id) {
				boardingProcessLogger.error(config.ERROR.QUERY_PARAMS.MISSING_ID);
				res.status(400).json(buildErrorResponse(config.ERROR.QUERY_PARAMS.MISSING_ID, 400));
				return;
			}

			boardingProcessLogger.info(`Deleting boardingProcess: ${id}`);

			// Check if boarding process exists
			const existingBoardingProcess = await prisma.boardingProcess.findFirst({
				where: { id },
			});

			if (!existingBoardingProcess) {
				boardingProcessLogger.error(`${config.ERROR.BOARDINGPROCESS.NOT_FOUND}: ${id}`);
				res.status(404).json(
					buildErrorResponse(config.ERROR.BOARDINGPROCESS.NOT_FOUND, 404),
				);
				return;
			}

			// Delete the boarding process
			await prisma.boardingProcess.delete({
				where: { id },
			});

			// Invalidate cache
			try {
				await invalidateCache.byPattern(`cache:boardingProcess:byId:${id}:*`);
				await invalidateCache.byPattern("cache:boardingProcess:list:*");
				boardingProcessLogger.info(`Cache invalidated after deletion: ${id}`);
			} catch (cacheError) {
				boardingProcessLogger.warn("Cache invalidation failed:", cacheError);
			}

			boardingProcessLogger.info(`${config.SUCCESS.BOARDINGPROCESS.DELETED}: ${id}`);
			res.status(200).json(
				buildSuccessResponse(config.SUCCESS.BOARDINGPROCESS.DELETED, {}, 200),
			);
			return;
		} catch (error) {
			boardingProcessLogger.error(`${config.ERROR.BOARDINGPROCESS.DELETE_FAILED}: ${error}`);
			res.status(500).json(
				buildErrorResponse(config.ERROR.COMMON.INTERNAL_SERVER_ERROR, 500),
			);
			return;
		}
	};

	return { create, getAll, getById, update, remove };
};
