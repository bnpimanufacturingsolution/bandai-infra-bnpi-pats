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
import { uploadToCloudinary } from "../../helper/cloudinary.helper";
import { syncOnboardingProcessProgress } from "../../helper/boarding-documents.helper";
import {
	createDocumentReviewEvent,
	DocumentReviewEventType,
	DocumentReviewSource,
	DocumentReviewStatus,
} from "../../helper/document-review.helper";

import { logActivity } from "../../utils/activityLogger";
import { logAudit } from "../../utils/auditLogger";
import { config } from "../../config/constant";
import { redisClient } from "../../config/redis";
import { invalidateCache } from "../../middleware/cache";
import { CreateChecklistItemSchema, UpdateChecklistItemSchema } from "../../zod/checklist-item";

const logger = getLogger();
const checklistItemLogger = logger.child({ module: "checklistItem" });

const asRecord = (value: unknown): Record<string, any> =>
	value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, any>) : {};
const getJsonString = (value: unknown, key: string): string => {
	const raw = asRecord(value)[key];
	return typeof raw === "string" ? raw : "";
};

export const controller = (prisma: PrismaClient) => {
	const formatEmployeeLabel = (employee: any | null) => {
		if (!employee) return null;
		const firstName = getJsonString(employee.person?.personalInfo, "firstName").trim();
		const lastName = getJsonString(employee.person?.personalInfo, "lastName").trim();
		const fullName = `${firstName} ${lastName}`.trim();
		return fullName || String(employee.employeeId || "").trim() || null;
	};

	const create = async (req: Request, res: Response, _next: NextFunction) => {
		let requestData = req.body;
		const contentType = req.get("Content-Type") || "";

		if (
			contentType.includes("application/x-www-form-urlencoded") ||
			contentType.includes("multipart/form-data")
		) {
			checklistItemLogger.info("Original form data:", JSON.stringify(req.body, null, 2));
			requestData = transformFormDataToObject(req.body);
			checklistItemLogger.info(
				"Transformed form data to object structure:",
				JSON.stringify(requestData, null, 2),
			);
		}

		const validation = CreateChecklistItemSchema.safeParse(requestData);
		if (!validation.success) {
			const formattedErrors = formatZodErrors(validation.error.format());
			checklistItemLogger.error(`Validation failed: ${JSON.stringify(formattedErrors)}`);
			const errorResponse = buildErrorResponse("Validation failed", 400, formattedErrors);
			res.status(400).json(errorResponse);
			return;
		}

		try {
			const checklistItem = await prisma.checklistItem.create({ data: validation.data });
			checklistItemLogger.info(`ChecklistItem created successfully: ${checklistItem.id}`);

			logActivity(req, {
				userId: (req as any).user?.id || "unknown",
				action: config.ACTIVITY_LOG.CHECKLISTITEM.ACTIONS.CREATE_CHECKLISTITEM,
				description: `${config.ACTIVITY_LOG.CHECKLISTITEM.DESCRIPTIONS.CHECKLISTITEM_CREATED}: ${checklistItem.id}`,
				page: {
					url: req.originalUrl,
					title: config.ACTIVITY_LOG.CHECKLISTITEM.PAGES.CHECKLISTITEM_CREATION,
				},
			});

			logAudit(req, {
				userId: (req as any).user?.id || "unknown",
				action: config.AUDIT_LOG.ACTIONS.CREATE,
				resource: config.AUDIT_LOG.RESOURCES.CHECKLISTITEM,
				severity: config.AUDIT_LOG.SEVERITY.LOW,
				entityType: config.AUDIT_LOG.ENTITY_TYPES.CHECKLISTITEM,
				entityId: checklistItem.id,
				changesBefore: null,
				changesAfter: {
					id: checklistItem.id,
					description: checklistItem.description,
					createdAt: checklistItem.createdAt,
					updatedAt: checklistItem.updatedAt,
				},
				description: `${config.AUDIT_LOG.CHECKLISTITEM.DESCRIPTIONS.CHECKLISTITEM_CREATED}: ${checklistItem.id}`,
			});

			try {
				await invalidateCache.byPattern("cache:checklistItem:list:*");
				checklistItemLogger.info("ChecklistItem list cache invalidated after creation");
			} catch (cacheError) {
				checklistItemLogger.warn(
					"Failed to invalidate cache after checklistItem creation:",
					cacheError,
				);
			}

			const successResponse = buildSuccessResponse(
				config.SUCCESS.CHECKLISTITEM.CREATED,
				checklistItem,
				201,
			);
			res.status(201).json(successResponse);
		} catch (error) {
			checklistItemLogger.error(`${config.ERROR.CHECKLISTITEM.CREATE_FAILED}: ${error}`);
			const errorResponse = buildErrorResponse(
				config.ERROR.COMMON.INTERNAL_SERVER_ERROR,
				500,
			);
			res.status(500).json(errorResponse);
		}
	};
	const getAll = async (req: Request, res: Response, _next: NextFunction) => {
		const validationResult = validateQueryParams(req, checklistItemLogger);

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

		checklistItemLogger.info(
			`Getting checklistItems, page: ${page}, limit: ${limit}, query: ${query}, order: ${order}, groupBy: ${groupBy}`,
		);

		try {
			// Base where clause
			const whereClause: Prisma.ChecklistItemWhereInput = {
				isDeleted: false,
			};

			// search fields sample ("name", "description", "type")
			const searchFields = ["name", "description", "type"];
			if (query) {
				const searchConditions = buildSearchConditions(
					"ChecklistItem",
					query,
					searchFields,
				);
				if (searchConditions.length > 0) {
					whereClause.OR = searchConditions;
				}
			}

			if (filter) {
				const filterConditions = buildFilterConditions("ChecklistItem", filter);
				if (filterConditions.length > 0) {
					whereClause.AND = filterConditions;
				}
			}
			const findManyQuery = buildFindManyQuery(whereClause, skip, limit, order, sort, fields);

			const [checklistItems, total] = await Promise.all([
				document ? prisma.checklistItem.findMany(findManyQuery) : [],
				count ? prisma.checklistItem.count({ where: whereClause }) : 0,
			]);

			checklistItemLogger.info(`Retrieved ${checklistItems.length} checklistItems`);
			const processedData =
				groupBy && document
					? groupDataByField(checklistItems, groupBy as string)
					: checklistItems;

			const responseData: Record<string, any> = {
				...(document && { checklistItems: processedData }),
				...(count && { count: total }),
				...(pagination && { pagination: buildPagination(total, page, limit) }),
				...(groupBy && { groupedBy: groupBy }),
			};

			res.status(200).json(
				buildSuccessResponse(config.SUCCESS.CHECKLISTITEM.RETRIEVED_ALL, responseData, 200),
			);
		} catch (error) {
			checklistItemLogger.error(`${config.ERROR.CHECKLISTITEM.GET_ALL_FAILED}: ${error}`);
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
				checklistItemLogger.error(config.ERROR.QUERY_PARAMS.MISSING_ID);
				const errorResponse = buildErrorResponse(config.ERROR.QUERY_PARAMS.MISSING_ID, 400);
				res.status(400).json(errorResponse);
				return;
			}

			if (fields && typeof fields !== "string") {
				checklistItemLogger.error(
					`${config.ERROR.QUERY_PARAMS.INVALID_POPULATE}: ${fields}`,
				);
				const errorResponse = buildErrorResponse(
					config.ERROR.QUERY_PARAMS.POPULATE_MUST_BE_STRING,
					400,
				);
				res.status(400).json(errorResponse);
				return;
			}

			checklistItemLogger.info(`${config.SUCCESS.CHECKLISTITEM.GETTING_BY_ID}: ${id}`);

			const cacheKey = `cache:checklistItem:byId:${id}:${fields || "full"}`;
			let checklistItem = null;

			try {
				if (redisClient.isClientConnected()) {
					checklistItem = await redisClient.getJSON(cacheKey);
					if (checklistItem) {
						checklistItemLogger.info(
							`ChecklistItem ${id} retrieved from direct Redis cache`,
						);
					}
				}
			} catch (cacheError) {
				checklistItemLogger.warn(
					`Redis cache retrieval failed for checklistItem ${id}:`,
					cacheError,
				);
			}

			if (!checklistItem) {
				const query: Prisma.ChecklistItemFindFirstArgs = {
					where: { id },
				};

				query.select = getNestedFields(fields);

				checklistItem = await prisma.checklistItem.findFirst(query);

				if (checklistItem && redisClient.isClientConnected()) {
					try {
						await redisClient.setJSON(cacheKey, checklistItem, 3600);
						checklistItemLogger.info(
							`ChecklistItem ${id} stored in direct Redis cache`,
						);
					} catch (cacheError) {
						checklistItemLogger.warn(
							`Failed to store checklistItem ${id} in Redis cache:`,
							cacheError,
						);
					}
				}
			}

			if (!checklistItem) {
				checklistItemLogger.error(`${config.ERROR.CHECKLISTITEM.NOT_FOUND}: ${id}`);
				const errorResponse = buildErrorResponse(config.ERROR.CHECKLISTITEM.NOT_FOUND, 404);
				res.status(404).json(errorResponse);
				return;
			}

			checklistItemLogger.info(
				`${config.SUCCESS.CHECKLISTITEM.RETRIEVED}: ${(checklistItem as any).id}`,
			);
			const successResponse = buildSuccessResponse(
				config.SUCCESS.CHECKLISTITEM.RETRIEVED,
				checklistItem,
				200,
			);
			res.status(200).json(successResponse);
		} catch (error) {
			checklistItemLogger.error(`${config.ERROR.CHECKLISTITEM.ERROR_GETTING}: ${error}`);
			const errorResponse = buildErrorResponse(
				config.ERROR.COMMON.INTERNAL_SERVER_ERROR,
				500,
			);
			res.status(500).json(errorResponse);
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
			checklistItemLogger.info(
				"Original form data (update):",
				JSON.stringify(req.body, null, 2),
			);
			requestData = transformFormDataToObject(req.body);
			checklistItemLogger.info(
				"Transformed form data to object structure (update):",
				JSON.stringify(requestData, null, 2),
			);
		}

		try {
			if (!id) {
				checklistItemLogger.error(config.ERROR.QUERY_PARAMS.MISSING_ID);
				const errorResponse = buildErrorResponse(config.ERROR.QUERY_PARAMS.MISSING_ID, 400);
				res.status(400).json(errorResponse);
				return;
			}

			const validationResult = UpdateChecklistItemSchema.safeParse(requestData);

			if (!validationResult.success) {
				const formattedErrors = formatZodErrors(validationResult.error.format());
				checklistItemLogger.error(`Validation failed: ${JSON.stringify(formattedErrors)}`);
				const errorResponse = buildErrorResponse("Validation failed", 400, formattedErrors);
				res.status(400).json(errorResponse);
				return;
			}

			if (Object.keys(requestData).length === 0) {
				checklistItemLogger.error(config.ERROR.COMMON.NO_UPDATE_FIELDS);
				const errorResponse = buildErrorResponse(config.ERROR.COMMON.NO_UPDATE_FIELDS, 400);
				res.status(400).json(errorResponse);
				return;
			}

			const validatedData = validationResult.data;

			checklistItemLogger.info(`Updating checklistItem: ${id}`);

			const existingChecklistItem = await prisma.checklistItem.findFirst({
				where: { id },
			});

			if (!existingChecklistItem) {
				checklistItemLogger.error(`${config.ERROR.CHECKLISTITEM.NOT_FOUND}: ${id}`);
				const errorResponse = buildErrorResponse(config.ERROR.CHECKLISTITEM.NOT_FOUND, 404);
				res.status(404).json(errorResponse);
				return;
			}

			const currentMetadata =
				(existingChecklistItem.metadata as Record<string, any> | null) || {};
			const newMetadata = (validatedData.metadata as Record<string, any> | null) || {};
			const mergedMetadata = { ...currentMetadata, ...newMetadata };
			const actorEmployeeId =
				String((req as any)?.metadata?.employee?.id || "").trim() || null;
			const actorEmployee =
				actorEmployeeId
					? await prisma.employee.findFirst({
							where: { id: actorEmployeeId, isDeleted: false },
							select: {
								id: true,
								employeeId: true,
								person: {
									select: {
										personalInfo: true,
									},
								},
							},
					  })
					: null;
			const actorLabel = formatEmployeeLabel(actorEmployee);

			// Check for completion requirements if status is being set to COMPLETED
			if (validatedData.status === "COMPLETED") {
				// Check for proof requirement
				if (
					mergedMetadata.requiresProof &&
					!mergedMetadata.proofUrl &&
					!mergedMetadata.proofData
				) {
					checklistItemLogger.warn(
						`Attempt to complete checklist item ${id} without required proof`,
					);
					res.status(400).json(
						buildErrorResponse(
							"This task requires proof of completion (e.g., screenshot or link) before it can be marked as complete.",
							400,
						),
					);
					return;
				}

				// Check for file requirement
				if (
					mergedMetadata.requiresFiles &&
					(!mergedMetadata.files ||
						!Array.isArray(mergedMetadata.files) ||
						mergedMetadata.files.length === 0)
				) {
					checklistItemLogger.warn(
						`Attempt to complete checklist item ${id} without required files`,
					);
					res.status(400).json(
						buildErrorResponse(
							"This task requires file attachments before it can be marked as complete.",
							400,
						),
					);
					return;
				}
			}

			const prismaData = { ...validatedData } as Record<string, any>;
			if (
				mergedMetadata.isSystemGenerated === true &&
				validatedData.status === "COMPLETED" &&
				String(mergedMetadata.reviewStatus || "").trim().toUpperCase() === "APPROVED"
			) {
				prismaData.metadata = {
					...mergedMetadata,
					reviewStatus: "APPROVED",
					reviewApprovedAt: new Date().toISOString(),
					reviewApprovedByEmployeeId: actorEmployeeId,
					reviewApprovedByLabel: actorLabel,
					reviewRejectedAt: null,
					reviewRejectedByEmployeeId: null,
					reviewRejectedByLabel: null,
					reviewRejectionReason: null,
				};
			}

			const updatedChecklistItem = await prisma.checklistItem.update({
				where: { id },
				data: prismaData,
			});

			if (
				mergedMetadata.isSystemGenerated === true &&
				validatedData.status === "COMPLETED" &&
				String(mergedMetadata.reviewStatus || "").trim().toUpperCase() === "APPROVED"
			) {
				const documentId = String(mergedMetadata.documentId || "").trim();
				const documentNumber = String(mergedMetadata.documentNumber || "").trim();

				const documentRecord = await prisma.document.findFirst({
					where: {
						isDeleted: false,
						...(documentId ? { id: documentId } : {}),
						...(!documentId && documentNumber ? { number: documentNumber } : {}),
					},
				});

				if (documentRecord) {
					const documentMetadata =
						(documentRecord.metadata as Record<string, any> | null) || {};
					const existingReview =
						documentMetadata.review &&
						typeof documentMetadata.review === "object" &&
						!Array.isArray(documentMetadata.review)
							? (documentMetadata.review as Record<string, any>)
							: {};

					await prisma.document.update({
						where: { id: documentRecord.id },
						data: {
							reviewStatus: DocumentReviewStatus.APPROVED,
							reviewApprovedAt: new Date(),
							reviewApprovedById: actorEmployeeId,
							reviewRejectedAt: null,
							reviewRejectedById: null,
							reviewRejectionReason: null,
							reviewSource:
								documentRecord.reviewSource || DocumentReviewSource.EMPLOYEE_UPLOAD,
							metadata: {
								...documentMetadata,
								review: {
									...existingReview,
									status: "APPROVED",
									approvedAt: new Date().toISOString(),
									approvedByEmployeeId: actorEmployeeId,
									approvedByLabel: actorLabel,
									rejectedAt: null,
									rejectedByEmployeeId: null,
									rejectedByLabel: null,
									rejectionReason: null,
								},
							},
						},
					});

					await createDocumentReviewEvent({
						prisma,
						organizationId:
							String((updatedChecklistItem as any)?.organizationId || "").trim() ||
							String((req as any)?.organizationId || "").trim(),
						document: documentRecord,
						eventType: DocumentReviewEventType.APPROVED,
						toStatus: DocumentReviewStatus.APPROVED,
						actorEmployeeId,
						source: documentRecord.reviewSource || DocumentReviewSource.EMPLOYEE_UPLOAD,
					});

					try {
						await invalidateCache.byPattern(
							`cache:employee:byId:${documentRecord.employeeId}:*`,
						);
						await invalidateCache.byPattern(
							`cache:employee:document-priorities:${documentRecord.employeeId}`,
						);
						await invalidateCache.byPattern("cache:metrics:*");
					} catch (cacheError) {
						checklistItemLogger.warn(
							"Failed to invalidate employee document cache after approval:",
							cacheError,
						);
					}
				}
			}

			// Update parent boarding process status and completion percentage
			const processId = existingChecklistItem.processId;
			if (processId) {
				const progress = await syncOnboardingProcessProgress({
					prisma,
					processId,
				});
				const newProcessStatus = progress?.status || "NOT_STARTED";
				const completionPercentage = progress?.completionPercentage || 0;

				checklistItemLogger.info(
					`BoardingProcess ${processId} updated: status=${newProcessStatus}, completion=${completionPercentage}%`,
				);

				// Create notification and emit socket event when boarding process is completed
				if (newProcessStatus === "COMPLETED") {
					try {
						const boardingProcess = await prisma.boardingProcess.findFirst({
							where: { id: processId },
						});

						if (boardingProcess) {
							const isOffboarding = boardingProcess.type === "OFFBOARDING";

							// Fetch employee details including manager relationship
							const employee = await prisma.employee.findFirst({
								where: { id: boardingProcess.employeeId },
								select: {
									id: true,
									reportToId: true,
									organizationId: true,
							person: {
								select: {
									personalInfo: true,
								},
							},
								},
							});

							// Query HR users from the organization using multiple role patterns
							const hrUsers = await prisma.employee.findMany({
								where: {
									organizationId: boardingProcess.organizationId,
									isDeleted: false,
									OR: [
										{ role: { contains: "hr", mode: "insensitive" } },
										{
											role: {
												contains: "human-resource",
												mode: "insensitive",
											},
										},
										{ role: { startsWith: "hr-", mode: "insensitive" } },
										{ role: { endsWith: "-hr", mode: "insensitive" } },
									],
								},
								select: { id: true, role: true },
							});

							checklistItemLogger.info(
								`Found ${hrUsers.length} HR users for organization ${boardingProcess.organizationId}: ${JSON.stringify(hrUsers.map((u) => ({ id: u.id, role: u.role })))}`,
							);

							// Build comprehensive recipients array
							const recipientIds = [
								boardingProcess.employeeId, // Employee
								...(employee?.reportToId ? [employee.reportToId] : []), // Manager
								...hrUsers.map((hr) => hr.id), // HR users
							].filter((id, index, self) => self.indexOf(id) === index); // Remove duplicates

							checklistItemLogger.info(
								`Notification recipients for ${boardingProcess.type} completion: Employee=${boardingProcess.employeeId}, Manager=${employee?.reportToId || "none"}, HR users=${hrUsers.length}, Total unique recipients=${recipientIds.length}`,
							);

							// Build employee name for description
							const firstName = getJsonString(employee?.person?.personalInfo, "firstName");
							const lastName = getJsonString(employee?.person?.personalInfo, "lastName");
							const employeeName =
								firstName || lastName ? `${firstName} ${lastName}`.trim() : "Employee";

							// Create notification in database with new multi-recipient structure
							const notification = await prisma.notification.create({
								data: {
									organizationId: boardingProcess.organizationId,
									sourceEmployeeId: boardingProcess.employeeId,
									category: "BOARDING",
									title: isOffboarding
										? "Exit Clearance Completed! ðŸŽ‰"
										: "Onboarding Completed! ðŸŽ‰",
									description: isOffboarding
										? `${employeeName} has completed their exit clearance process. All tasks are done.`
										: `${employeeName} has completed all onboarding tasks. Welcome to the team!`,
									type: "SUCCESS",
									recipients: {
										read: [],
										unread: recipientIds.map((employeeId) => ({
											employeeId,
											readAt: null,
										})),
									},
									metadata: {
										boardingProcessId: processId,
										boardingType: boardingProcess.type,
										completedAt: new Date().toISOString(),
										employeeId: boardingProcess.employeeId,
									},
								},
							});

							checklistItemLogger.info(
								`Notification created for ${boardingProcess.type} completion: ${notification.id} with ${recipientIds.length} recipients`,
							);

							// Emit socket event to notify all recipients in real-time
							const io = (req as any).io;
							if (io) {
								// Log all connected sockets for debugging
								const sockets = io.sockets.sockets;
								const connectedSockets = Array.from(sockets.keys());
								checklistItemLogger.info(
									`Connected sockets: ${connectedSockets.length}, IDs: ${connectedSockets.join(", ")}`,
								);

								// Emit to each recipient's room
								recipientIds.forEach((recipientId) => {
									const room = `employee:${recipientId}`;
									io.to(room).emit("notification:new", notification);
									checklistItemLogger.info(
										`âœ… Socket notification emitted to room: ${room}`,
									);
								});

								// Also emit globally for debugging purposes
								io.emit("notification:broadcast", notification);
								checklistItemLogger.info(
									`ðŸ“¢ Broadcast notification emitted to all connected sockets`,
								);
							} else {
								checklistItemLogger.warn(
									"âŒ Socket.io instance not available on request",
								);
							}
						}
					} catch (notificationError) {
						checklistItemLogger.warn(
							"Failed to create notification for boarding completion:",
							notificationError,
						);
					}
				}

				// Invalidate boarding process cache
				try {
					await invalidateCache.byPattern(`cache:boardingProcess:byId:${processId}:*`);
					await invalidateCache.byPattern("cache:boardingProcess:list:*");
				} catch (cacheError) {
					checklistItemLogger.warn(
						"Failed to invalidate boardingProcess cache:",
						cacheError,
					);
				}
			}

			try {
				await invalidateCache.byPattern(`cache:checklistItem:byId:${id}:*`);
				await invalidateCache.byPattern("cache:checklistItem:list:*");
				checklistItemLogger.info(`Cache invalidated after checklistItem ${id} update`);
			} catch (cacheError) {
				checklistItemLogger.warn(
					"Failed to invalidate cache after checklistItem update:",
					cacheError,
				);
			}

			checklistItemLogger.info(
				`${config.SUCCESS.CHECKLISTITEM.UPDATED}: ${updatedChecklistItem.id}`,
			);
			const successResponse = buildSuccessResponse(
				config.SUCCESS.CHECKLISTITEM.UPDATED,
				{ checklistItem: updatedChecklistItem },
				200,
			);
			res.status(200).json(successResponse);
		} catch (error) {
			checklistItemLogger.error(`${config.ERROR.CHECKLISTITEM.ERROR_UPDATING}: ${error}`);
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
				checklistItemLogger.error(config.ERROR.QUERY_PARAMS.MISSING_ID);
				const errorResponse = buildErrorResponse(config.ERROR.QUERY_PARAMS.MISSING_ID, 400);
				res.status(400).json(errorResponse);
				return;
			}

			checklistItemLogger.info(`${config.SUCCESS.CHECKLISTITEM.DELETED}: ${id}`);

			const existingChecklistItem = await prisma.checklistItem.findFirst({
				where: { id },
			});

			if (!existingChecklistItem) {
				checklistItemLogger.error(`${config.ERROR.CHECKLISTITEM.NOT_FOUND}: ${id}`);
				const errorResponse = buildErrorResponse(config.ERROR.CHECKLISTITEM.NOT_FOUND, 404);
				res.status(404).json(errorResponse);
				return;
			}

			await prisma.checklistItem.delete({
				where: { id },
			});

			try {
				await invalidateCache.byPattern(`cache:checklistItem:byId:${id}:*`);
				await invalidateCache.byPattern("cache:checklistItem:list:*");
				checklistItemLogger.info(`Cache invalidated after checklistItem ${id} deletion`);
			} catch (cacheError) {
				checklistItemLogger.warn(
					"Failed to invalidate cache after checklistItem deletion:",
					cacheError,
				);
			}

			checklistItemLogger.info(`${config.SUCCESS.CHECKLISTITEM.DELETED}: ${id}`);
			const successResponse = buildSuccessResponse(
				config.SUCCESS.CHECKLISTITEM.DELETED,
				{},
				200,
			);
			res.status(200).json(successResponse);
		} catch (error) {
			checklistItemLogger.error(`${config.ERROR.CHECKLISTITEM.DELETE_FAILED}: ${error}`);
			const errorResponse = buildErrorResponse(
				config.ERROR.COMMON.INTERNAL_SERVER_ERROR,
				500,
			);
			res.status(500).json(errorResponse);
		}
	};

	return { create, getAll, getById, update, remove };
};
