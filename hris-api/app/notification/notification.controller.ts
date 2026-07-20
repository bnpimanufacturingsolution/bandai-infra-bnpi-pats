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
import { CreateNotificationSchema, UpdateNotificationSchema } from "../../zod/notification.zod";
import { logActivity } from "../../utils/activityLogger";
import { logAudit } from "../../utils/auditLogger";
import { config } from "../../config/constant";
import { redisClient } from "../../config/redis";
import { invalidateCache } from "../../middleware/cache";

const logger = getLogger();
const notificationLogger = logger.child({ module: "notification" });

export const controller = (prisma: PrismaClient) => {
	const create = async (req: Request, res: Response, _next: NextFunction) => {
		let requestData = req.body;
		const contentType = req.get("Content-Type") || "";

		if (
			contentType.includes("application/x-www-form-urlencoded") ||
			contentType.includes("multipart/form-data")
		) {
			notificationLogger.info("Original form data:", JSON.stringify(req.body, null, 2));
			requestData = transformFormDataToObject(req.body);
			notificationLogger.info(
				"Transformed form data to object structure:",
				JSON.stringify(requestData, null, 2),
			);
		}

		const validation = CreateNotificationSchema.safeParse(requestData);
		if (!validation.success) {
			const formattedErrors = formatZodErrors(validation.error.format());
			notificationLogger.error(`Validation failed: ${JSON.stringify(formattedErrors)}`);
			const errorResponse = buildErrorResponse("Validation failed", 400, formattedErrors);
			res.status(400).json(errorResponse);
			return;
		}

		try {
			// Build recipients object from recipientEmployeeIds or resolve active employees if broadcast is true
			const { recipientEmployeeIds, broadcast, ...notificationData } = validation.data;
			let resolvedRecipientIds = recipientEmployeeIds || [];
			if (broadcast) {
				const activeEmployees = await prisma.employee.findMany({
					where: {
						organizationId: notificationData.organizationId,
						isDeleted: false,
					},
					select: {
						id: true,
					},
				});
				resolvedRecipientIds = activeEmployees.map((emp) => emp.id);
			}

			const notification = await prisma.notification.create({
				data: {
					...notificationData,
					description: notificationData.description,
					archive: {
						isArchived: false,
						archivedAt: null,
						archivedBy: null,
						reason: null,
					},
					recipients: {
						read: [],
						unread: resolvedRecipientIds.map((employeeId: string) => ({
							employeeId,
							readAt: null,
						})),
					},
				},
			});
			notificationLogger.info(`Notification created successfully: ${notification.id}`);

			logActivity(req, {
				userId: (req as any).user?.id || "unknown",
				action: config.ACTIVITY_LOG.NOTIFICATION.ACTIONS.CREATE_NOTIFICATION,
				description: `${config.ACTIVITY_LOG.NOTIFICATION.DESCRIPTIONS.NOTIFICATION_CREATED}: ${notification.id}`,
				page: {
					url: req.originalUrl,
					title: config.ACTIVITY_LOG.NOTIFICATION.PAGES.NOTIFICATION_CREATION,
				},
			});

			logAudit(req, {
				userId: (req as any).user?.id || "unknown",
				action: config.AUDIT_LOG.ACTIONS.CREATE,
				resource: config.AUDIT_LOG.RESOURCES.NOTIFICATION,
				severity: config.AUDIT_LOG.SEVERITY.LOW,
				entityType: config.AUDIT_LOG.ENTITY_TYPES.NOTIFICATION,
				entityId: notification.id,
				changesBefore: null,
				changesAfter: {
					id: notification.id,
					createdAt: notification.createdAt,
					updatedAt: notification.updatedAt,
				},
				description: `${config.AUDIT_LOG.NOTIFICATION.DESCRIPTIONS.NOTIFICATION_CREATED}: ${notification.id}`,
			});

			try {
				await invalidateCache.byPattern("cache:notification:list:*");
				notificationLogger.info("Notification list cache invalidated after creation");
			} catch (cacheError) {
				notificationLogger.warn(
					"Failed to invalidate cache after notification creation:",
					cacheError,
				);
			}

			const successResponse = buildSuccessResponse(
				config.SUCCESS.NOTIFICATION.CREATED,
				notification,
				201,
			);
			res.status(201).json(successResponse);
		} catch (error) {
			notificationLogger.error(`${config.ERROR.NOTIFICATION.CREATE_FAILED}: ${error}`);
			const errorResponse = buildErrorResponse(
				config.ERROR.COMMON.INTERNAL_SERVER_ERROR,
				500,
			);
			res.status(500).json(errorResponse);
		}
	};
	const getAll = async (req: Request, res: Response, _next: NextFunction) => {
		const validationResult = validateQueryParams(req, notificationLogger);

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

		notificationLogger.info(
			`Getting notifications, page: ${page}, limit: ${limit}, query: ${query}, order: ${order}, groupBy: ${groupBy}`,
		);

		try {
			// Base where clause (archive filtering is applied in-memory due null/missing archive behavior)
			const whereClause: Prisma.NotificationWhereInput = {};

			const categoryQuery = req.query.category as string | undefined;
			if (categoryQuery) {
				whereClause.category = categoryQuery;
			}

			// search fields for notification
			const searchFields = ["title", "description", "category"];
			if (query) {
				const searchConditions = buildSearchConditions("Notification", query, searchFields);
				if (searchConditions.length > 0) {
					whereClause.OR = searchConditions;
				}
			}

			// Read recipientEmployeeId and unreadOnly from dedicated query params
			// These can't go through buildFilterConditions since recipients is an embedded type
			const filterByEmployeeId = (req.query.recipientEmployeeId as string) || null;
			const filterByUnreadState =
				req.query.unreadOnly === "true"
					? true
					: req.query.unreadOnly === "false"
						? false
						: null;

			if (filterByEmployeeId) {
				notificationLogger.info(
					`Will filter notifications for recipient employee: ${filterByEmployeeId}`,
				);
			}

			if (filter) {
				const filterConditions = buildFilterConditions("Notification", filter);
				if (filterConditions.length > 0) {
					if (whereClause.AND) {
						whereClause.AND = [
							...(Array.isArray(whereClause.AND)
								? whereClause.AND
								: [whereClause.AND]),
							...filterConditions.map((c) => c),
						];
					} else {
						whereClause.AND = filterConditions;
					}
				}
			}
			const findManyQuery = buildFindManyQuery(whereClause, skip, limit, order, sort, fields);

			// DEBUG: Log the query being sent to Prisma
			notificationLogger.info(`DEBUG whereClause: ${JSON.stringify(whereClause)}`);
			notificationLogger.info(`DEBUG findManyQuery: ${JSON.stringify(findManyQuery)}`);

			let [notifications, total] = await Promise.all([
				document ? prisma.notification.findMany(findManyQuery) : [],
				count ? prisma.notification.count({ where: whereClause }) : 0,
			]);

			const isArchivedNotification = (notification: any) =>
				(notification?.archive as { isArchived?: boolean } | null | undefined)?.isArchived ===
				true;

			const matchesRecipientFilter = (notification: any, employeeId: string) => {
				const recipients = notification.recipients as { read: any[]; unread: any[] } | null;
				if (!recipients) return false;

				const inUnread =
					recipients.unread?.some((r: { employeeId: string }) => r.employeeId === employeeId) ??
					false;
				const inRead =
					recipients.read?.some((r: { employeeId: string }) => r.employeeId === employeeId) ??
					false;

				if (filterByUnreadState === true) return inUnread;
				if (filterByUnreadState === false) return inRead;
				return inUnread || inRead;
			};

			// Exclude only explicitly archived notifications (archive.isArchived === true)
			if (notifications.length > 0) {
				notifications = notifications.filter((notification) => !isArchivedNotification(notification));
			}

			// DEBUG: Log result count
			notificationLogger.info(`DEBUG notifications count from DB: ${notifications.length}`);

			// Filter notifications by employeeId in memory if specified
			// This checks if the employee is in either recipients.read or recipients.unread arrays
			if (filterByEmployeeId && notifications.length > 0) {
				notifications = notifications.filter((notification) =>
					matchesRecipientFilter(notification, filterByEmployeeId),
				);
				notificationLogger.info(
					`Filtered to ${notifications.length} notifications for employee ${filterByEmployeeId}`,
				);
			}

			if (count) {
				const countCandidates = await prisma.notification.findMany({
					where: whereClause,
					select: {
						archive: true,
						recipients: true,
					},
				});

				let filteredCountCandidates = countCandidates.filter(
					(notification) => !isArchivedNotification(notification),
				);

				if (filterByEmployeeId) {
					filteredCountCandidates = filteredCountCandidates.filter((notification) =>
						matchesRecipientFilter(notification, filterByEmployeeId),
					);
				}

				total = filteredCountCandidates.length;
			}

			notificationLogger.info(`Retrieved ${notifications.length} notifications`);
			const processedData =
				groupBy && document
					? groupDataByField(notifications, groupBy as string)
					: notifications;

			const responseData: Record<string, any> = {
				...(document && { notifications: processedData }),
				...(count && { count: total }),
				...(pagination && { pagination: buildPagination(total, page, limit) }),
				...(groupBy && { groupedBy: groupBy }),
			};

			res.status(200).json(
				buildSuccessResponse(config.SUCCESS.NOTIFICATION.RETRIEVED_ALL, responseData, 200),
			);
		} catch (error) {
			notificationLogger.error(`${config.ERROR.NOTIFICATION.GET_ALL_FAILED}: ${error}`);
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
				notificationLogger.error(config.ERROR.QUERY_PARAMS.MISSING_ID);
				const errorResponse = buildErrorResponse(config.ERROR.QUERY_PARAMS.MISSING_ID, 400);
				res.status(400).json(errorResponse);
				return;
			}

			if (fields && typeof fields !== "string") {
				notificationLogger.error(
					`${config.ERROR.QUERY_PARAMS.INVALID_POPULATE}: ${fields}`,
				);
				const errorResponse = buildErrorResponse(
					config.ERROR.QUERY_PARAMS.POPULATE_MUST_BE_STRING,
					400,
				);
				res.status(400).json(errorResponse);
				return;
			}

			notificationLogger.info(`${config.SUCCESS.NOTIFICATION.GETTING_BY_ID}: ${id}`);

			const cacheKey = `cache:notification:byId:${id}:${fields || "full"}`;
			let notification = null;

			try {
				if (redisClient.isClientConnected()) {
					notification = await redisClient.getJSON(cacheKey);
					if (notification) {
						notificationLogger.info(
							`Notification ${id} retrieved from direct Redis cache`,
						);
					}
				}
			} catch (cacheError) {
				notificationLogger.warn(
					`Redis cache retrieval failed for notification ${id}:`,
					cacheError,
				);
			}

			if (!notification) {
				const query: Prisma.NotificationFindFirstArgs = {
					where: { id },
				};

				query.select = getNestedFields(fields);

				notification = await prisma.notification.findFirst(query);

				if (notification && redisClient.isClientConnected()) {
					try {
						await redisClient.setJSON(cacheKey, notification, 3600);
						notificationLogger.info(`Notification ${id} stored in direct Redis cache`);
					} catch (cacheError) {
						notificationLogger.warn(
							`Failed to store notification ${id} in Redis cache:`,
							cacheError,
						);
					}
				}
			}

			if (!notification) {
				notificationLogger.error(`${config.ERROR.NOTIFICATION.NOT_FOUND}: ${id}`);
				const errorResponse = buildErrorResponse(config.ERROR.NOTIFICATION.NOT_FOUND, 404);
				res.status(404).json(errorResponse);
				return;
			}

			notificationLogger.info(
				`${config.SUCCESS.NOTIFICATION.RETRIEVED}: ${(notification as any).id}`,
			);
			const successResponse = buildSuccessResponse(
				config.SUCCESS.NOTIFICATION.RETRIEVED,
				notification,
				200,
			);
			res.status(200).json(successResponse);
		} catch (error) {
			notificationLogger.error(`${config.ERROR.NOTIFICATION.ERROR_GETTING}: ${error}`);
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
				notificationLogger.error(config.ERROR.QUERY_PARAMS.MISSING_ID);
				const errorResponse = buildErrorResponse(config.ERROR.QUERY_PARAMS.MISSING_ID, 400);
				res.status(400).json(errorResponse);
				return;
			}

			const validationResult = UpdateNotificationSchema.safeParse(req.body);

			if (!validationResult.success) {
				const formattedErrors = formatZodErrors(validationResult.error.format());
				notificationLogger.error(`Validation failed: ${JSON.stringify(formattedErrors)}`);
				const errorResponse = buildErrorResponse("Validation failed", 400, formattedErrors);
				res.status(400).json(errorResponse);
				return;
			}

			if (Object.keys(req.body).length === 0) {
				notificationLogger.error(config.ERROR.COMMON.NO_UPDATE_FIELDS);
				const errorResponse = buildErrorResponse(config.ERROR.COMMON.NO_UPDATE_FIELDS, 400);
				res.status(400).json(errorResponse);
				return;
			}

			const validatedData = validationResult.data;

			notificationLogger.info(`Updating notification: ${id}`);

			const existingNotification = await prisma.notification.findFirst({
				where: { id },
			});

			if (!existingNotification) {
				notificationLogger.error(`${config.ERROR.NOTIFICATION.NOT_FOUND}: ${id}`);
				const errorResponse = buildErrorResponse(config.ERROR.NOTIFICATION.NOT_FOUND, 404);
				res.status(404).json(errorResponse);
				return;
			}

			const prismaData = { ...validatedData };

			const updatedNotification = await prisma.notification.update({
				where: { id },
				data: prismaData,
			});

			try {
				await invalidateCache.byPattern(`cache:notification:byId:${id}:*`);
				await invalidateCache.byPattern("cache:notification:list:*");
				notificationLogger.info(`Cache invalidated after notification ${id} update`);
			} catch (cacheError) {
				notificationLogger.warn(
					"Failed to invalidate cache after notification update:",
					cacheError,
				);
			}

			notificationLogger.info(
				`${config.SUCCESS.NOTIFICATION.UPDATED}: ${updatedNotification.id}`,
			);
			const successResponse = buildSuccessResponse(
				config.SUCCESS.NOTIFICATION.UPDATED,
				{ notification: updatedNotification },
				200,
			);
			res.status(200).json(successResponse);
		} catch (error) {
			notificationLogger.error(`${config.ERROR.NOTIFICATION.ERROR_UPDATING}: ${error}`);
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
				notificationLogger.error(config.ERROR.QUERY_PARAMS.MISSING_ID);
				const errorResponse = buildErrorResponse(config.ERROR.QUERY_PARAMS.MISSING_ID, 400);
				res.status(400).json(errorResponse);
				return;
			}

			notificationLogger.info(`${config.SUCCESS.NOTIFICATION.DELETED}: ${id}`);

			const existingNotification = await prisma.notification.findFirst({
				where: { id },
			});

			if (!existingNotification) {
				notificationLogger.error(`${config.ERROR.NOTIFICATION.NOT_FOUND}: ${id}`);
				const errorResponse = buildErrorResponse(config.ERROR.NOTIFICATION.NOT_FOUND, 404);
				res.status(404).json(errorResponse);
				return;
			}

			await prisma.notification.delete({
				where: { id },
			});

			try {
				await invalidateCache.byPattern(`cache:notification:byId:${id}:*`);
				await invalidateCache.byPattern("cache:notification:list:*");
				notificationLogger.info(`Cache invalidated after notification ${id} deletion`);
			} catch (cacheError) {
				notificationLogger.warn(
					"Failed to invalidate cache after notification deletion:",
					cacheError,
				);
			}

			notificationLogger.info(`${config.SUCCESS.NOTIFICATION.DELETED}: ${id}`);
			const successResponse = buildSuccessResponse(
				config.SUCCESS.NOTIFICATION.DELETED,
				{},
				200,
			);
			res.status(200).json(successResponse);
		} catch (error) {
			notificationLogger.error(`${config.ERROR.NOTIFICATION.DELETE_FAILED}: ${error}`);
			const errorResponse = buildErrorResponse(
				config.ERROR.COMMON.INTERNAL_SERVER_ERROR,
				500,
			);
			res.status(500).json(errorResponse);
		}
	};

	/**
	 * Mark a notification as read for a specific employee
	 * Moves the employee from 'unread' to 'read' array in recipients
	 */
	const markAsRead = async (req: Request, res: Response, _next: NextFunction) => {
		const { id } = req.params;
		const { employeeId } = req.body;

		try {
			if (!id) {
				notificationLogger.error(config.ERROR.QUERY_PARAMS.MISSING_ID);
				const errorResponse = buildErrorResponse(config.ERROR.QUERY_PARAMS.MISSING_ID, 400);
				res.status(400).json(errorResponse);
				return;
			}

			if (!employeeId) {
				notificationLogger.error("Employee ID is required to mark notification as read");
				const errorResponse = buildErrorResponse("Employee ID is required", 400);
				res.status(400).json(errorResponse);
				return;
			}

			notificationLogger.info(
				`Marking notification ${id} as read for employee ${employeeId}`,
			);

			// Find the notification
			const notification = await prisma.notification.findFirst({
				where: { id },
			});

			if (!notification) {
				notificationLogger.error(`${config.ERROR.NOTIFICATION.NOT_FOUND}: ${id}`);
				const errorResponse = buildErrorResponse(config.ERROR.NOTIFICATION.NOT_FOUND, 404);
				res.status(404).json(errorResponse);
				return;
			}

			// Get current recipients
			const recipients = (notification.recipients as { read: any[]; unread: any[] }) || {
				read: [],
				unread: [],
			};

			// Find the employee in unread array
			const unreadIndex = recipients.unread.findIndex(
				(r: { employeeId: string }) => r.employeeId === employeeId,
			);

			if (unreadIndex === -1) {
				// Employee not in unread list - might already be read
				notificationLogger.info(
					`Employee ${employeeId} not found in unread list for notification ${id}`,
				);
				const successResponse = buildSuccessResponse(
					"Notification already read or not a recipient",
					{ notification },
					200,
				);
				res.status(200).json(successResponse);
				return;
			}

			// Move from unread to read
			const readEntry = {
				employeeId,
				readAt: new Date().toISOString(),
			};

			const updatedRecipients = {
				read: [...recipients.read, readEntry],
				unread: recipients.unread.filter(
					(r: { employeeId: string }) => r.employeeId !== employeeId,
				),
			};

			// Update the notification
			const updatedNotification = await prisma.notification.update({
				where: { id },
				data: {
					recipients: updatedRecipients,
				},
			});

			try {
				await invalidateCache.byPattern(`cache:notification:byId:${id}:*`);
				await invalidateCache.byPattern("cache:notification:list:*");
				notificationLogger.info(
					`Cache invalidated after marking notification ${id} as read`,
				);
			} catch (cacheError) {
				notificationLogger.warn(
					"Failed to invalidate cache after marking notification as read:",
					cacheError,
				);
			}

			notificationLogger.info(`Notification ${id} marked as read for employee ${employeeId}`);
			const successResponse = buildSuccessResponse(
				"Notification marked as read",
				{ notification: updatedNotification },
				200,
			);
			res.status(200).json(successResponse);
		} catch (error) {
			notificationLogger.error(`Error marking notification as read: ${error}`);
			const errorResponse = buildErrorResponse(
				config.ERROR.COMMON.INTERNAL_SERVER_ERROR,
				500,
			);
			res.status(500).json(errorResponse);
		}
	};

	return { create, getAll, getById, update, remove, markAsRead };
};
