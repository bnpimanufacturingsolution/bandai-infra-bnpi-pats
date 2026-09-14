import { Request, Response, NextFunction } from "express";
import { PrismaClient, Prisma } from "../../generated/prisma";
import * as XLSX from "xlsx";
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
import { CreateCalendarItemSchema, UpdateCalendarItemSchema } from "../../zod/calendarItem.zod";
import { logActivity } from "../../utils/activityLogger";
import { logAudit } from "../../utils/auditLogger";
import { config } from "../../config/constant";
import { redisClient } from "../../config/redis";
import { invalidateCache } from "../../middleware/cache";
import { AuthRequest } from "../../middleware/verifyToken";
import { recomputeAttendanceObligationsForRange } from "../../helper/attendance-obligation.helper";
import { resolvePublicKioskOrganizationId } from "../../helper/public-kiosk-org.helper";
import { z } from "zod";

const logger = getLogger();
const calendarItemLogger = logger.child({ module: "calendarItem" });

type HolidayTypeImport = "regular" | "special-non-working" | "special-working";

const HOLIDAY_TYPE_META: Record<HolidayTypeImport, { category: string }> = {
	regular: { category: "Regular Holiday" },
	"special-non-working": { category: "Special (Non-Working) Holiday" },
	"special-working": { category: "Special (Working) Holiday" },
};

const PublicKioskCalendarQuerySchema = z
	.object({
		organizationId: z.string().trim().min(1).optional(),
		organizationCode: z.string().trim().min(1).optional(),
		year: z.coerce.number().int().min(2000).max(2100).optional(),
		limit: z.coerce.number().int().min(1).max(24).optional().default(8),
	})
	.refine((value) => Boolean(value.organizationId || value.organizationCode), {
		message: "organizationId or organizationCode is required",
		path: ["organizationId"],
	});

const getImportValue = (row: Record<string, any>, aliases: string[]) => {
	const normalizedAliases = aliases.map((alias) =>
		alias
			.trim()
			.toLowerCase()
			.replace(/[_\s-]+/g, ""),
	);
	for (const [key, value] of Object.entries(row)) {
		const normalizedKey = key
			.trim()
			.toLowerCase()
			.replace(/[_\s-]+/g, "");
		if (normalizedAliases.includes(normalizedKey)) return value;
	}
	return undefined;
};

const parseOptionalBoolean = (value: unknown): boolean | undefined => {
	if (value === undefined || value === null || value === "") return undefined;
	if (typeof value === "boolean") return value;
	const normalized = String(value).trim().toLowerCase();
	if (["true", "1", "yes", "y", "active"].includes(normalized)) return true;
	if (["false", "0", "no", "n", "inactive"].includes(normalized)) return false;
	return undefined;
};

const parseImportDate = (value: unknown): Date | null => {
	if (!value) return null;
	if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
	if (typeof value === "number") {
		const date = new Date(Math.round((value - 25569) * 86400 * 1000));
		return Number.isNaN(date.getTime()) ? null : date;
	}
	const parsed = new Date(String(value).trim());
	return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const normalizeHolidayType = (value: unknown): HolidayTypeImport => {
	const normalized = String(value || "")
		.trim()
		.toLowerCase();
	if (["lh", "regular", "regular holiday", "legal"].includes(normalized)) return "regular";
	if (
		[
			"sh",
			"special",
			"special holiday",
			"special non working",
			"special non-working",
			"special-non-working",
			"special (non-working)",
		].includes(normalized)
	) {
		return "special-non-working";
	}
	if (
		["special working", "special-working", "special (working)", "working holiday"].includes(
			normalized,
		)
	) {
		return "special-working";
	}
	return "regular";
};

export const controller = (prisma: PrismaClient) => {
	const getPublicKiosk = async (req: Request, res: Response, _next: NextFunction) => {
		const parsed = PublicKioskCalendarQuerySchema.safeParse(req.query);
		if (!parsed.success) {
			const formattedErrors = formatZodErrors(parsed.error.format());
			res.status(400).json(buildErrorResponse("Validation failed", 400, formattedErrors));
			return;
		}

		try {
			const orgResolution = await resolvePublicKioskOrganizationId(prisma, {
				organizationId: parsed.data.organizationId,
				organizationCode: parsed.data.organizationCode,
			});
			if (!orgResolution.ok) {
				res.status(400).json(
					buildErrorResponse(orgResolution.message, 400, [
						{ field: orgResolution.field, message: orgResolution.message },
					]),
				);
				return;
			}

			const now = new Date();
			// Login kiosk should show company events only (not the full holiday calendar).
			// If exactly 1 company event, also include HOLIDAY.
			const companyEventCount = await prisma.calendarItem.count({
				where: {
					organizationId: orgResolution.organizationId,
					type: "COMPANY_EVENT",
					status: {
						notIn: ["CANCELLED", "DRAFT"],
					},
					endDate: {
						gte: now,
					},
				},
			});

			const types =
				companyEventCount === 1 ? ["COMPANY_EVENT", "HOLIDAY"] : ["COMPANY_EVENT"];

			// Login kiosk should show company events only (not the full holiday calendar).
			const where: Prisma.CalendarItemWhereInput = {
				organizationId: orgResolution.organizationId,
				type: { in: types },
				status: {
					notIn: ["CANCELLED", "DRAFT"],
				},
				endDate: {
					gte: now,
				},
			};

			if (parsed.data.year) {
				where.year = parsed.data.year;
			}

			const calendarItems = await prisma.calendarItem.findMany({
				where,
				select: {
					id: true,
					organizationId: true,
					year: true,
					title: true,
					description: true,
					type: true,
					startDate: true,
					endDate: true,
					isAllDay: true,
					timezone: true,
					status: true,
				},
				orderBy: {
					startDate: "asc",
				},
				take: parsed.data.limit,
			});

			res.status(200).json(
				buildSuccessResponse("Public kiosk calendar items retrieved successfully", {
					organizationId: orgResolution.organizationId,
					resolvedBy: orgResolution.resolvedBy,
					calendarItems,
					pagination: buildPagination(calendarItems.length, 1, parsed.data.limit),
				}),
			);
		} catch (error) {
			calendarItemLogger.error(`Failed to retrieve public kiosk calendar items: ${error}`);
			res.status(500).json(
				buildErrorResponse(config.ERROR.COMMON.INTERNAL_SERVER_ERROR, 500),
			);
		}
	};

	const recomputeHolidayObligations = async (
		calendarItem: {
			organizationId: string;
			type?: string | null;
			startDate?: Date | string | null;
			endDate?: Date | string | null;
		} | null,
		reason: string,
	) => {
		if (!calendarItem || calendarItem.type !== "HOLIDAY" || !calendarItem.startDate) return;
		await recomputeAttendanceObligationsForRange(prisma, {
			organizationId: calendarItem.organizationId,
			fromDate: calendarItem.startDate,
			toDate: calendarItem.endDate || calendarItem.startDate,
			reason,
		});
	};

	const recomputeHolidayObligationsForMutation = async (
		before: {
			organizationId: string;
			type?: string | null;
			startDate?: Date | string | null;
			endDate?: Date | string | null;
		} | null,
		after: {
			organizationId: string;
			type?: string | null;
			startDate?: Date | string | null;
			endDate?: Date | string | null;
		} | null,
		reason: string,
	) => {
		await recomputeHolidayObligations(before, reason);
		if (
			!before ||
			before.type !== after?.type ||
			String(before.startDate || "") !== String(after?.startDate || "") ||
			String(before.endDate || "") !== String(after?.endDate || "")
		) {
			await recomputeHolidayObligations(after, reason);
		}
	};

	const create = async (req: AuthRequest, res: Response, _next: NextFunction) => {
		let requestData = req.body;
		const contentType = req.get("Content-Type") || "";

		if (
			contentType.includes("application/x-www-form-urlencoded") ||
			contentType.includes("multipart/form-data")
		) {
			calendarItemLogger.info("Original form data:", JSON.stringify(req.body, null, 2));
			requestData = transformFormDataToObject(req.body);
			calendarItemLogger.info(
				"Transformed form data to object structure:",
				JSON.stringify(requestData, null, 2),
			);
		}

		const validation = CreateCalendarItemSchema.safeParse(requestData);
		if (!validation.success) {
			const formattedErrors = formatZodErrors(validation.error.format());
			calendarItemLogger.error(`Validation failed: ${JSON.stringify(formattedErrors)}`);
			const errorResponse = buildErrorResponse("Validation failed", 400, formattedErrors);
			res.status(400).json(errorResponse);
			return;
		}

		try {
			if (!req.userId || !req.organizationId) {
				res.status(401).json({
					error: "Unauthorized: Missing user or organization ID",
				});

				return;
			}

			// Ensure year is set (derive from startDate if not provided)
			const validatedData = { ...validation.data };
			if (!validatedData.year && validatedData.startDate) {
				const startDate =
					validatedData.startDate instanceof Date
						? validatedData.startDate
						: new Date(validatedData.startDate);
				validatedData.year = startDate.getFullYear();
			}

			const calendarItem = await prisma.calendarItem.create({
				data: {
					...validatedData,
					organizationId: req.organizationId,
				},
			});
			await recomputeHolidayObligations(calendarItem, "HolidayChanged");

			calendarItemLogger.info(`CalendarItem created successfully: ${calendarItem.id}`);

			logActivity(req, {
				userId: (req as any).user?.id || "unknown",
				action: config.ACTIVITY_LOG.CALENDARITEM.ACTIONS.CREATE_CALENDARITEM,
				description: `${config.ACTIVITY_LOG.CALENDARITEM.DESCRIPTIONS.CALENDARITEM_CREATED}: ${calendarItem.title || calendarItem.id}`,
				page: {
					url: req.originalUrl,
					title: config.ACTIVITY_LOG.CALENDARITEM.PAGES.CALENDARITEM_CREATION,
				},
			});

			logAudit(req, {
				userId: (req as any).user?.id || "unknown",
				action: config.AUDIT_LOG.ACTIONS.CREATE,
				resource: config.AUDIT_LOG.RESOURCES.CALENDARITEM,
				severity: config.AUDIT_LOG.SEVERITY.LOW,
				entityType: config.AUDIT_LOG.ENTITY_TYPES.CALENDARITEM,
				entityId: calendarItem.id,
				changesBefore: null,
				changesAfter: {
					id: calendarItem.id,
					title: calendarItem.title,
					description: calendarItem.description,
					createdAt: calendarItem.createdAt,
					updatedAt: calendarItem.updatedAt,
				},
				description: `${config.AUDIT_LOG.CALENDARITEM.DESCRIPTIONS.CALENDARITEM_CREATED}: ${calendarItem.title || calendarItem.id}`,
			});

			try {
				await invalidateCache.byPattern("cache:calendarItem:list:*");
				calendarItemLogger.info("CalendarItem list cache invalidated after creation");
			} catch (cacheError) {
				calendarItemLogger.warn(
					"Failed to invalidate cache after calendarItem creation:",
					cacheError,
				);
			}

			const successResponse = buildSuccessResponse(
				config.SUCCESS.CALENDARITEM.CREATED,
				calendarItem,
				201,
			);
			res.status(201).json(successResponse);
		} catch (error) {
			calendarItemLogger.error(`${config.ERROR.CALENDARITEM.CREATE_FAILED}: ${error}`);
			const errorResponse = buildErrorResponse(
				config.ERROR.COMMON.INTERNAL_SERVER_ERROR,
				500,
			);
			res.status(500).json(errorResponse);
		}
	};
	const getAll = async (req: Request, res: Response, _next: NextFunction) => {
		const validationResult = validateQueryParams(req, calendarItemLogger);

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

		calendarItemLogger.info(
			`Getting calendarItems, page: ${page}, limit: ${limit}, query: ${query}, order: ${order}, groupBy: ${groupBy}`,
		);

		try {
			// Base where clause
			const whereClause: Prisma.CalendarItemWhereInput = {};

			// Keep search fields aligned with real scalar or enum Prisma fields.
			const searchFields = ["title", "description", "type", "status"];
			if (query) {
				const searchConditions = buildSearchConditions("CalendarItem", query, searchFields);
				if (searchConditions.length > 0) {
					whereClause.OR = searchConditions;
				}
			}

			if (filter) {
				const filterConditions = buildFilterConditions("CalendarItem", filter);
				if (filterConditions.length > 0) {
					whereClause.AND = filterConditions;
				}
			}
			const findManyQuery = buildFindManyQuery(whereClause, skip, limit, order, sort, fields);

			const [calendarItems, total] = await Promise.all([
				document ? prisma.calendarItem.findMany(findManyQuery) : [],
				count ? prisma.calendarItem.count({ where: whereClause }) : 0,
			]);

			calendarItemLogger.info(`Retrieved ${calendarItems.length} calendarItems`);
			const processedData =
				groupBy && document
					? groupDataByField(calendarItems, groupBy as string)
					: calendarItems;

			const responseData: Record<string, any> = {
				...(document && { calendarItems: processedData }),
				...(count && { count: total }),
				...(pagination && { pagination: buildPagination(total, page, limit) }),
				...(groupBy && { groupedBy: groupBy }),
			};

			res.status(200).json(
				buildSuccessResponse(config.SUCCESS.CALENDARITEM.RETRIEVED_ALL, responseData, 200),
			);
		} catch (error) {
			calendarItemLogger.error(`${config.ERROR.CALENDARITEM.GET_ALL_FAILED}: ${error}`);
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
				calendarItemLogger.error(config.ERROR.QUERY_PARAMS.MISSING_ID);
				const errorResponse = buildErrorResponse(config.ERROR.QUERY_PARAMS.MISSING_ID, 400);
				res.status(400).json(errorResponse);
				return;
			}

			if (fields && typeof fields !== "string") {
				calendarItemLogger.error(
					`${config.ERROR.QUERY_PARAMS.INVALID_POPULATE}: ${fields}`,
				);
				const errorResponse = buildErrorResponse(
					config.ERROR.QUERY_PARAMS.POPULATE_MUST_BE_STRING,
					400,
				);
				res.status(400).json(errorResponse);
				return;
			}

			calendarItemLogger.info(`${config.SUCCESS.CALENDARITEM.GETTING_BY_ID}: ${id}`);

			const cacheKey = `cache:calendarItem:byId:${id}:${fields || "full"}`;
			let calendarItem = null;

			try {
				if (redisClient.isClientConnected()) {
					calendarItem = await redisClient.getJSON(cacheKey);
					if (calendarItem) {
						calendarItemLogger.info(
							`CalendarItem ${id} retrieved from direct Redis cache`,
						);
					}
				}
			} catch (cacheError) {
				calendarItemLogger.warn(
					`Redis cache retrieval failed for calendarItem ${id}:`,
					cacheError,
				);
			}

			if (!calendarItem) {
				const query: Prisma.CalendarItemFindFirstArgs = {
					where: { id },
				};

				query.select = getNestedFields(fields as string | undefined);

				calendarItem = await prisma.calendarItem.findFirst(query);

				if (calendarItem && redisClient.isClientConnected()) {
					try {
						await redisClient.setJSON(cacheKey, calendarItem, 3600);
						calendarItemLogger.info(`CalendarItem ${id} stored in direct Redis cache`);
					} catch (cacheError) {
						calendarItemLogger.warn(
							`Failed to store calendarItem ${id} in Redis cache:`,
							cacheError,
						);
					}
				}
			}

			if (!calendarItem) {
				calendarItemLogger.error(`${config.ERROR.CALENDARITEM.NOT_FOUND}: ${id}`);
				const errorResponse = buildErrorResponse(config.ERROR.CALENDARITEM.NOT_FOUND, 404);
				res.status(404).json(errorResponse);
				return;
			}

			calendarItemLogger.info(
				`${config.SUCCESS.CALENDARITEM.RETRIEVED}: ${(calendarItem as any).id}`,
			);
			const successResponse = buildSuccessResponse(
				config.SUCCESS.CALENDARITEM.RETRIEVED,
				calendarItem,
				200,
			);
			res.status(200).json(successResponse);
		} catch (error) {
			calendarItemLogger.error(`${config.ERROR.CALENDARITEM.ERROR_GETTING}: ${error}`);
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
				calendarItemLogger.error(config.ERROR.QUERY_PARAMS.MISSING_ID);
				const errorResponse = buildErrorResponse(config.ERROR.QUERY_PARAMS.MISSING_ID, 400);
				res.status(400).json(errorResponse);
				return;
			}

			const validationResult = UpdateCalendarItemSchema.safeParse(req.body);

			if (!validationResult.success) {
				const formattedErrors = formatZodErrors(validationResult.error.format());
				calendarItemLogger.error(`Validation failed: ${JSON.stringify(formattedErrors)}`);
				const errorResponse = buildErrorResponse("Validation failed", 400, formattedErrors);
				res.status(400).json(errorResponse);
				return;
			}

			if (Object.keys(req.body).length === 0) {
				calendarItemLogger.error(config.ERROR.COMMON.NO_UPDATE_FIELDS);
				const errorResponse = buildErrorResponse(config.ERROR.COMMON.NO_UPDATE_FIELDS, 400);
				res.status(400).json(errorResponse);
				return;
			}

			let validatedData = validationResult.data;

			calendarItemLogger.info(`Updating calendarItem: ${id}`);

			const existingCalendarItem = await prisma.calendarItem.findFirst({
				where: { id },
			});

			if (!existingCalendarItem) {
				calendarItemLogger.error(`${config.ERROR.CALENDARITEM.NOT_FOUND}: ${id}`);
				const errorResponse = buildErrorResponse(config.ERROR.CALENDARITEM.NOT_FOUND, 404);
				res.status(404).json(errorResponse);
				return;
			}

			// Update year if startDate is being updated
			if (validatedData.startDate && !validatedData.year) {
				const startDate =
					validatedData.startDate instanceof Date
						? validatedData.startDate
						: new Date(validatedData.startDate);
				validatedData.year = startDate.getFullYear();
			}

			const prismaData = { ...validatedData };

			const updatedCalendarItem = await prisma.calendarItem.update({
				where: { id },
				data: prismaData,
			});
			await recomputeHolidayObligationsForMutation(
				existingCalendarItem,
				updatedCalendarItem,
				"HolidayChanged",
			);

			try {
				await invalidateCache.byPattern(`cache:calendarItem:byId:${id}:*`);
				await invalidateCache.byPattern("cache:calendarItem:list:*");
				calendarItemLogger.info(`Cache invalidated after calendarItem ${id} update`);
			} catch (cacheError) {
				calendarItemLogger.warn(
					"Failed to invalidate cache after calendarItem update:",
					cacheError,
				);
			}

			calendarItemLogger.info(
				`${config.SUCCESS.CALENDARITEM.UPDATED}: ${updatedCalendarItem.id}`,
			);
			const successResponse = buildSuccessResponse(
				config.SUCCESS.CALENDARITEM.UPDATED,
				{ calendarItem: updatedCalendarItem },
				200,
			);
			res.status(200).json(successResponse);
		} catch (error) {
			calendarItemLogger.error(`${config.ERROR.CALENDARITEM.ERROR_UPDATING}: ${error}`);
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
				calendarItemLogger.error(config.ERROR.QUERY_PARAMS.MISSING_ID);
				const errorResponse = buildErrorResponse(config.ERROR.QUERY_PARAMS.MISSING_ID, 400);
				res.status(400).json(errorResponse);
				return;
			}

			calendarItemLogger.info(`${config.SUCCESS.CALENDARITEM.DELETED}: ${id}`);

			const existingCalendarItem = await prisma.calendarItem.findFirst({
				where: { id },
			});

			if (!existingCalendarItem) {
				calendarItemLogger.error(`${config.ERROR.CALENDARITEM.NOT_FOUND}: ${id}`);
				const errorResponse = buildErrorResponse(config.ERROR.CALENDARITEM.NOT_FOUND, 404);
				res.status(404).json(errorResponse);
				return;
			}

			await prisma.calendarItem.delete({
				where: { id },
			});
			await recomputeHolidayObligations(existingCalendarItem, "HolidayChanged");

			try {
				await invalidateCache.byPattern(`cache:calendarItem:byId:${id}:*`);
				await invalidateCache.byPattern("cache:calendarItem:list:*");
				calendarItemLogger.info(`Cache invalidated after calendarItem ${id} deletion`);
			} catch (cacheError) {
				calendarItemLogger.warn(
					"Failed to invalidate cache after calendarItem deletion:",
					cacheError,
				);
			}

			calendarItemLogger.info(`${config.SUCCESS.CALENDARITEM.DELETED}: ${id}`);
			const successResponse = buildSuccessResponse(
				config.SUCCESS.CALENDARITEM.DELETED,
				{},
				200,
			);
			res.status(200).json(successResponse);
		} catch (error) {
			calendarItemLogger.error(`${config.ERROR.CALENDARITEM.DELETE_FAILED}: ${error}`);
			const errorResponse = buildErrorResponse(
				config.ERROR.COMMON.INTERNAL_SERVER_ERROR,
				500,
			);
			res.status(500).json(errorResponse);
		}
	};

	const importFromXLSX = async (req: AuthRequest, res: Response, _next: NextFunction) => {
		try {
			const file = req.file;
			if (!file) {
				res.status(400).json(buildErrorResponse("No file uploaded", 400));
				return;
			}
			if (!req.organizationId) {
				res.status(401).json(buildErrorResponse("Organization ID not found", 401));
				return;
			}

			const workbook = XLSX.read(file.buffer, { type: "buffer" });
			const worksheet = workbook.Sheets[workbook.SheetNames[0]];
			const rows = XLSX.utils.sheet_to_json<Record<string, any>>(worksheet, {
				raw: false,
				defval: "",
				blankrows: false,
			});

			if (!rows.length) {
				res.status(400).json(buildErrorResponse("Import file is empty", 400));
				return;
			}

			const summary = {
				totalRows: rows.length,
				created: 0,
				updated: 0,
				skipped: 0,
				errors: [] as string[],
			};
			const obligationWindows: Array<{ startDate: Date; endDate: Date }> = [];

			for (const [index, row] of rows.entries()) {
				const rowNumber = index + 2;
				try {
					const title = String(
						getImportValue(row, [
							"TITLE",
							"HOLIDAY_NAME",
							"HOLIDAY NAME",
							"DESCRIPTION",
							"Description",
						]) || "",
					).trim();
					const startDate =
						parseImportDate(
							getImportValue(row, ["START_DATE", "START DATE", "DATE", "Date"]),
						) || null;
					const endDate =
						parseImportDate(getImportValue(row, ["END_DATE", "END DATE"])) || startDate;
					const statusValue = String(getImportValue(row, ["STATUS"]) || "ACTIVE")
						.trim()
						.toUpperCase();
					const status = ["ACTIVE", "CANCELLED", "COMPLETED", "DRAFT"].includes(
						statusValue,
					)
						? statusValue
						: "ACTIVE";
					const holidayType = normalizeHolidayType(
						getImportValue(row, ["HOLIDAY_TYPE", "HOLIDAY TYPE", "TYPE", "Type"]),
					);
					const description = String(
						getImportValue(row, ["DESCRIPTION", "NOTES", "DETAILS"]) || "",
					).trim();
					const isAllDay =
						parseOptionalBoolean(getImportValue(row, ["IS_ALL_DAY", "ALL DAY"])) ??
						true;

					if (!title || !startDate || !endDate) {
						summary.skipped++;
						summary.errors.push(
							`Row ${rowNumber}: TITLE, START_DATE, and END_DATE are required`,
						);
						continue;
					}

					if (endDate < startDate) {
						summary.skipped++;
						summary.errors.push(
							`Row ${rowNumber}: END_DATE must be after or equal to START_DATE`,
						);
						continue;
					}

					const data = {
						organizationId: req.organizationId,
						year: startDate.getFullYear(),
						title,
						description: description || undefined,
						type: "HOLIDAY" as const,
						startDate,
						endDate,
						isAllDay,
						timezone: "UTC",
						recurrence: null,
						metadata: {
							holidayType,
							category: HOLIDAY_TYPE_META[holidayType].category,
						},
						reminders: null,
						tags: ["holiday", holidayType],
						status: status as any,
					};

					const validation = CreateCalendarItemSchema.safeParse(data);
					if (!validation.success) {
						summary.skipped++;
						summary.errors.push(
							`Row ${rowNumber}: ${JSON.stringify(formatZodErrors(validation.error.format()))}`,
						);
						continue;
					}

					const existing = await prisma.calendarItem.findFirst({
						where: {
							organizationId: req.organizationId,
							type: "HOLIDAY",
							title,
							startDate,
						},
					});

					if (existing) {
						const existingMetadata = (existing.metadata || {}) as Record<string, any>;
						const nextMetadata = (validation.data.metadata || {}) as Record<
							string,
							any
						>;
						const hasChanged =
							existing.description !== validation.data.description ||
							existing.endDate.getTime() !== validation.data.endDate.getTime() ||
							Boolean(existing.isAllDay) !== Boolean(validation.data.isAllDay) ||
							existing.status !== validation.data.status ||
							String(existingMetadata.holidayType || "") !==
								String(nextMetadata.holidayType || "") ||
							String(existingMetadata.category || "") !==
								String(nextMetadata.category || "");

						if (hasChanged) {
							await prisma.calendarItem.update({
								where: { id: existing.id },
								data: validation.data,
							});
							obligationWindows.push({ startDate, endDate });
						}
						summary.updated++;
					} else {
						await prisma.calendarItem.create({ data: validation.data });
						obligationWindows.push({ startDate, endDate });
						summary.created++;
					}
				} catch (error) {
					summary.skipped++;
					summary.errors.push(
						`Row ${rowNumber}: ${error instanceof Error ? error.message : String(error)}`,
					);
				}
			}

			for (const window of obligationWindows) {
				await recomputeAttendanceObligationsForRange(prisma, {
					organizationId: req.organizationId,
					fromDate: window.startDate,
					toDate: window.endDate,
					reason: "HolidayImport",
				});
			}

			try {
				await invalidateCache.byPattern("cache:calendarItem:list:*");
			} catch (cacheError) {
				calendarItemLogger.warn(
					"Failed to invalidate cache after calendar item import:",
					cacheError,
				);
			}

			res.status(200).json(
				buildSuccessResponse(
					"Holidays imported successfully",
					{
						summary: {
							...summary,
							errors: summary.errors.slice(0, 20),
						},
					},
					200,
				),
			);
		} catch (error) {
			calendarItemLogger.error(`CalendarItem import failed: ${error}`);
			res.status(500).json(
				buildErrorResponse(
					`Failed to import holidays: ${error instanceof Error ? error.message : String(error)}`,
					500,
				),
			);
		}
	};

	return { create, getAll, getById, getPublicKiosk, update, remove, importFromXLSX };
};
