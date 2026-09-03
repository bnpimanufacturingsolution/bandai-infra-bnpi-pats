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
import { CreateShiftTypeSchema, UpdateShiftTypeSchema } from "../../zod/shiftType.zod";
import { logActivity } from "../../utils/activityLogger";
import { logAudit } from "../../utils/auditLogger";
import { config } from "../../config/constant";
import { redisClient } from "../../config/redis";
import { invalidateCache } from "../../middleware/cache";
import { suggestUniqueConfigCode } from "../../helper/config-code.helper";
import { calculateShiftHour, normalizeShiftTypeTotals } from "../../helper/schedule-normalization.helper";
import { copyShiftTypeToTemplatePatternDay } from "../../helper/employee-schedule.helper";

const logger = getLogger();
const shiftTypeLogger = logger.child({ module: "shiftType" });

const normalizeImportKey = (key: string) =>
	String(key || "")
		.trim()
		.replace(/[\s_-]+/g, "")
		.toUpperCase();

const getImportValue = (row: Record<string, any>, aliases: string[]) => {
	const normalizedAliases = aliases.map(normalizeImportKey);
	for (const [key, value] of Object.entries(row)) {
		if (normalizedAliases.includes(normalizeImportKey(key))) {
			return value;
		}
	}
	return undefined;
};

const parseOptionalBoolean = (value: unknown): boolean | null => {
	if (value === undefined || value === null || value === "") return null;
	if (typeof value === "boolean") return value;
	const normalized = String(value).trim().toLowerCase();
	if (["true", "1", "yes", "y", "active"].includes(normalized)) return true;
	if (["false", "0", "no", "n", "inactive"].includes(normalized)) return false;
	return null;
};

const parseClockValue = (value: unknown): { minutes: number; hasMeridiem: boolean } | null => {
	const text = String(value ?? "")
		.trim()
		.toUpperCase()
		.replace(/\s+/g, "");
	const match = text.match(/^(\d{1,2}):(\d{2})(AM|PM)?$/);
	if (!match) return null;
	let hours = Number(match[1]);
	const minutes = Number(match[2]);
	const meridiem = match[3];
	if (Number.isNaN(hours) || Number.isNaN(minutes) || minutes > 59) return null;
	if (meridiem) {
		if (hours < 1 || hours > 12) return null;
		if (meridiem === "AM") hours = hours === 12 ? 0 : hours;
		if (meridiem === "PM") hours = hours === 12 ? 12 : hours + 12;
	} else if (hours > 23) {
		return null;
	}
	return { minutes: hours * 60 + minutes, hasMeridiem: Boolean(meridiem) };
};

const parseClockMinutes = (value: unknown): number | null => {
	const parsed = parseClockValue(value);
	return parsed ? parsed.minutes : null;
};

const formatClockMinutes = (value: number) => {
	const normalized = ((value % (24 * 60)) + 24 * 60) % (24 * 60);
	const hours = Math.floor(normalized / 60);
	const minutes = normalized % 60;
	return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
};

const parseBreakWindow = (value: unknown) => {
	const text = String(value ?? "")
		.trim()
		.replace(/^BREAK\((.*)\)$/i, "$1");
	if (!text) return null;
	const match = text.match(/^([^-]+?)\s*(?:-|to)\s*([^-]+)$/i);
	if (!match) return null;
	const start = parseClockValue(match[1]);
	const end = parseClockValue(match[2]);
	if (!start || !end) return null;
	return {
		startTime: formatClockMinutes(start.minutes),
		endTime: formatClockMinutes(end.minutes),
	};
};

const parseTokenizedTimeSlots = (value: unknown) => {
	const source = String(value ?? "").trim();
	if (!source) return null;

	const slots: Array<{ type: string; label: string; startTime: string; endTime: string }> = [];
	const tokenPattern = /(WORK|BREAK|OTHER)\(([^)]+)\)/gi;
	let match: RegExpExecArray | null;
	let previousTokenEnd = 0;
	while ((match = tokenPattern.exec(source))) {
		const separator = source.slice(previousTokenEnd, match.index);
		if (slots.length > 0 && !separator.includes(";")) return null;
		if (slots.length === 0 && separator.trim()) return null;
		const type = match[1].toLowerCase();
		const ranges = match[2].split(",").map((item) => item.trim()).filter(Boolean);
		if (!ranges.length) return null;
		for (const rangeValue of ranges) {
			const range = parseBreakWindow(rangeValue);
			if (!range) return null;
			slots.push({
				type,
				label: type === "break" ? "Break" : type === "work" ? "Work" : "Other",
				startTime: range.startTime,
				endTime: range.endTime,
			});
		}
		previousTokenEnd = tokenPattern.lastIndex;
	}
	const trailingText = source.slice(previousTokenEnd).replace(/;/g, "").trim();
	if (slots.length > 0 && trailingText) return null;

	return slots.length > 0 ? slots : null;
};

const BNPI_DEFAULT_SCHEDULE_CODE = "BNPI_MON_FRI_DAY_8_5";

const buildOffDaySnapshot = () => ({
	name: "Off day",
	code: "OFF",
	isOvernight: false,
	isOff: true,
	shiftHour: 0,
	timeSlots: [],
});

const ensureBnpiDefaultScheduleTemplate = async (
	prisma: PrismaClient,
	params: {
		organizationId: string;
		shiftTypeId: string;
		code: string;
		name: string;
		isActive: boolean;
	},
) => {
	if (params.code !== BNPI_DEFAULT_SCHEDULE_CODE) return false;

	const pattern = [
		{ day: 1, shiftTypeId: params.shiftTypeId, shiftSnapshot: null },
		{ day: 2, shiftTypeId: params.shiftTypeId, shiftSnapshot: null },
		{ day: 3, shiftTypeId: params.shiftTypeId, shiftSnapshot: null },
		{ day: 4, shiftTypeId: params.shiftTypeId, shiftSnapshot: null },
		{ day: 5, shiftTypeId: params.shiftTypeId, shiftSnapshot: null },
		{ day: 6, shiftTypeId: null, shiftSnapshot: buildOffDaySnapshot() },
		{ day: 7, shiftTypeId: null, shiftSnapshot: buildOffDaySnapshot() },
	];
	const hydratedPattern = await copyShiftTypeToTemplatePatternDay(prisma, {
		organizationId: params.organizationId,
		pattern,
	});
	const totalHour = hydratedPattern.reduce(
		(total, day) => total + Math.max(0, Number(day.shiftHour || 0)),
		0,
	);
	const totalDay = hydratedPattern.filter((day) => Number(day.shiftHour || 0) > 0).length;

	await prisma.scheduleTemplate.upsert({
		where: {
			organizationId_code: {
				organizationId: params.organizationId,
				code: params.code,
			},
		},
		create: {
			organizationId: params.organizationId,
			code: params.code,
			name: params.name,
			description: "Default BNPI migration schedule for 2026 attendance reconciliation",
			cycleDays: 7,
			graceLateMinutes: 15,
			graceEarlyOutMinutes: 0,
			pattern: hydratedPattern as any,
			totalDay,
			totalHour,
			isActive: params.isActive,
			isDeleted: false,
		} as any,
		update: {
			name: params.name,
			description: "Default BNPI migration schedule for 2026 attendance reconciliation",
			cycleDays: 7,
			graceLateMinutes: 15,
			graceEarlyOutMinutes: 0,
			pattern: hydratedPattern as any,
			totalDay,
			totalHour,
			isActive: params.isActive,
			isDeleted: false,
		} as any,
	});

	return true;
};

export const controller = (prisma: PrismaClient) => {
	const generateCode = async (req: Request, res: Response, _next: NextFunction) => {
		const organizationId = (req as any).organizationId;
		const sourceName = String(req.query.name || "").trim();
		if (!organizationId) {
			const errorResponse = buildErrorResponse("Organization ID is required", 401);
			res.status(401).json(errorResponse);
			return;
		}
		if (!sourceName) {
			const errorResponse = buildErrorResponse("Name is required to generate a code", 400);
			res.status(400).json(errorResponse);
			return;
		}

		try {
			const suggestion = await suggestUniqueConfigCode({
				value: sourceName,
				isCodeTaken: async (candidateCode) => {
					const existingShiftType = await prisma.shiftType.findUnique({
						where: {
							organizationId_code: {
								organizationId,
								code: candidateCode,
							},
						},
						select: { id: true },
					});
					return Boolean(existingShiftType);
				},
			});

			const successResponse = buildSuccessResponse(
				"Shift type code generated successfully",
				suggestion,
				200,
			);
			res.status(200).json(successResponse);
		} catch (error) {
			shiftTypeLogger.error(`ShiftType generateCode failed: ${error}`);
			const errorResponse = buildErrorResponse(config.ERROR.COMMON.INTERNAL_SERVER_ERROR, 500);
			res.status(500).json(errorResponse);
		}
	};

	const create = async (req: Request, res: Response, _next: NextFunction) => {
		let requestData = req.body;
		const contentType = req.get("Content-Type") || "";

		if (
			contentType.includes("application/x-www-form-urlencoded") ||
			contentType.includes("multipart/form-data")
		) {
			shiftTypeLogger.info("Original form data:", JSON.stringify(req.body, null, 2));
			requestData = transformFormDataToObject(req.body);
			shiftTypeLogger.info(
				"Transformed form data to object structure:",
				JSON.stringify(requestData, null, 2),
			);
		}

		const validation = CreateShiftTypeSchema.safeParse(requestData);
		if (!validation.success) {
			const formattedErrors = formatZodErrors(validation.error.format());
			shiftTypeLogger.error(`Validation failed: ${JSON.stringify(formattedErrors)}`);
			const errorResponse = buildErrorResponse("Validation failed", 400, formattedErrors);
			res.status(400).json(errorResponse);
			return;
		}

		try {
			const prismaData = {
				...(validation.data as any),
				shiftHour: calculateShiftHour(validation.data),
			};
			const shiftType = await prisma.shiftType.create({ data: prismaData as any });
			shiftTypeLogger.info(`ShiftType created successfully: ${shiftType.id}`);

			logActivity(req, {
				userId: (req as any).user?.id || "unknown",
				action: config.ACTIVITY_LOG.SHIFTTYPE.ACTIONS.CREATE_SHIFTTYPE,
				description: `${config.ACTIVITY_LOG.SHIFTTYPE.DESCRIPTIONS.SHIFTTYPE_CREATED}: ${shiftType.name || shiftType.id}`,
				page: {
					url: req.originalUrl,
					title: config.ACTIVITY_LOG.SHIFTTYPE.PAGES.SHIFTTYPE_CREATION,
				},
			});

			logAudit(req, {
				userId: (req as any).user?.id || "unknown",
				action: config.AUDIT_LOG.ACTIONS.CREATE,
				resource: config.AUDIT_LOG.RESOURCES.SHIFTTYPE,
				severity: config.AUDIT_LOG.SEVERITY.LOW,
				entityType: config.AUDIT_LOG.ENTITY_TYPES.SHIFTTYPE,
				entityId: shiftType.id,
				changesBefore: null,
				changesAfter: {
					id: shiftType.id,
					name: shiftType.name,
					createdAt: shiftType.createdAt,
					updatedAt: shiftType.updatedAt,
				},
				description: `${config.AUDIT_LOG.SHIFTTYPE.DESCRIPTIONS.SHIFTTYPE_CREATED}: ${shiftType.name || shiftType.id}`,
			});

			try {
				await invalidateCache.byPattern("cache:shiftType:list:*");
				await invalidateCache.byPattern("cache:scheduleOverride:list:*");
				await invalidateCache.byPattern("cache:attendance:*");
				await invalidateCache.byPattern("cache:timesheet:*");
				await invalidateCache.byPattern("cache:metrics:*");
				shiftTypeLogger.info("ShiftType list cache invalidated after creation");
			} catch (cacheError) {
				shiftTypeLogger.warn(
					"Failed to invalidate cache after shiftType creation:",
					cacheError,
				);
			}

			const successResponse = buildSuccessResponse(
				config.SUCCESS.SHIFTTYPE.CREATED,
				normalizeShiftTypeTotals(shiftType),
				201,
			);
			res.status(201).json(successResponse);
		} catch (error) {
			shiftTypeLogger.error(`${config.ERROR.SHIFTTYPE.CREATE_FAILED}: ${error}`);
			const errorResponse = buildErrorResponse(
				config.ERROR.COMMON.INTERNAL_SERVER_ERROR,
				500,
			);
			res.status(500).json(errorResponse);
		}
	};
	const getAll = async (req: Request, res: Response, _next: NextFunction) => {
		const validationResult = validateQueryParams(req, shiftTypeLogger);

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

		shiftTypeLogger.info(
			`Getting shiftTypes, page: ${page}, limit: ${limit}, query: ${query}, order: ${order}, groupBy: ${groupBy}`,
		);

		try {
			// Base where clause
			const whereClause: Prisma.ShiftTypeWhereInput = {
				isDeleted: false,
			};

			// search fields sample ("name", "description", "type")
			const searchFields = ["name", "code"];
			if (query) {
				const searchConditions = buildSearchConditions("ShiftType", query, searchFields);
				if (searchConditions.length > 0) {
					whereClause.OR = searchConditions;
				}
			}

			if (filter) {
				const filterConditions = buildFilterConditions("ShiftType", filter);
				if (filterConditions.length > 0) {
					whereClause.AND = filterConditions;
				}
			}
			const findManyQuery = buildFindManyQuery(whereClause, skip, limit, order, sort, fields);

			const [shiftTypes, total] = await Promise.all([
				document ? prisma.shiftType.findMany(findManyQuery) : [],
				count ? prisma.shiftType.count({ where: whereClause }) : 0,
			]);

			shiftTypeLogger.info(`Retrieved ${shiftTypes.length} shiftTypes`);
			const normalizedShiftTypes = shiftTypes.map((item) => normalizeShiftTypeTotals(item));
			const processedData =
				groupBy && document
					? groupDataByField(normalizedShiftTypes, groupBy as string)
					: normalizedShiftTypes;

			const responseData: Record<string, any> = {
				...(document && { shiftTypes: processedData }),
				...(count && { count: total }),
				...(pagination && { pagination: buildPagination(total, page, limit) }),
				...(groupBy && { groupedBy: groupBy }),
			};

			res.status(200).json(
				buildSuccessResponse(config.SUCCESS.SHIFTTYPE.RETRIEVED_ALL, responseData, 200),
			);
		} catch (error) {
			shiftTypeLogger.error(`${config.ERROR.SHIFTTYPE.GET_ALL_FAILED}: ${error}`);
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
				shiftTypeLogger.error(config.ERROR.QUERY_PARAMS.MISSING_ID);
				const errorResponse = buildErrorResponse(config.ERROR.QUERY_PARAMS.MISSING_ID, 400);
				res.status(400).json(errorResponse);
				return;
			}

			if (fields && typeof fields !== "string") {
				shiftTypeLogger.error(`${config.ERROR.QUERY_PARAMS.INVALID_POPULATE}: ${fields}`);
				const errorResponse = buildErrorResponse(
					config.ERROR.QUERY_PARAMS.POPULATE_MUST_BE_STRING,
					400,
				);
				res.status(400).json(errorResponse);
				return;
			}

			shiftTypeLogger.info(`${config.SUCCESS.SHIFTTYPE.GETTING_BY_ID}: ${id}`);

			const cacheKey = `cache:shiftType:byId:${id}:${fields || "full"}`;
			let shiftType = null;

			try {
				if (redisClient.isClientConnected()) {
					shiftType = await redisClient.getJSON(cacheKey);
					if (shiftType) {
						shiftTypeLogger.info(`ShiftType ${id} retrieved from direct Redis cache`);
					}
				}
			} catch (cacheError) {
				shiftTypeLogger.warn(`Redis cache retrieval failed for shiftType ${id}:`, cacheError);
			}

			if (!shiftType) {
				const query: Prisma.ShiftTypeFindFirstArgs = {
					where: { id },
				};

				query.select = getNestedFields(typeof fields === "string" ? fields : undefined);

				shiftType = await prisma.shiftType.findFirst(query);

				if (shiftType && redisClient.isClientConnected()) {
					try {
						await redisClient.setJSON(cacheKey, shiftType, 3600);
						shiftTypeLogger.info(`ShiftType ${id} stored in direct Redis cache`);
					} catch (cacheError) {
						shiftTypeLogger.warn(
							`Failed to store shiftType ${id} in Redis cache:`,
							cacheError,
						);
					}
				}
			}

			if (!shiftType) {
				shiftTypeLogger.error(`${config.ERROR.SHIFTTYPE.NOT_FOUND}: ${id}`);
				const errorResponse = buildErrorResponse(config.ERROR.SHIFTTYPE.NOT_FOUND, 404);
				res.status(404).json(errorResponse);
				return;
			}

			shiftTypeLogger.info(`${config.SUCCESS.SHIFTTYPE.RETRIEVED}: ${(shiftType as any).id}`);
			const successResponse = buildSuccessResponse(
				config.SUCCESS.SHIFTTYPE.RETRIEVED,
				normalizeShiftTypeTotals(shiftType),
				200,
			);
			res.status(200).json(successResponse);
		} catch (error) {
			shiftTypeLogger.error(`${config.ERROR.SHIFTTYPE.ERROR_GETTING}: ${error}`);
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
				shiftTypeLogger.error(config.ERROR.QUERY_PARAMS.MISSING_ID);
				const errorResponse = buildErrorResponse(config.ERROR.QUERY_PARAMS.MISSING_ID, 400);
				res.status(400).json(errorResponse);
				return;
			}

			const validationResult = UpdateShiftTypeSchema.safeParse(req.body);

			if (!validationResult.success) {
				const formattedErrors = formatZodErrors(validationResult.error.format());
				shiftTypeLogger.error(`Validation failed: ${JSON.stringify(formattedErrors)}`);
				const errorResponse = buildErrorResponse("Validation failed", 400, formattedErrors);
				res.status(400).json(errorResponse);
				return;
			}

			if (Object.keys(req.body).length === 0) {
				shiftTypeLogger.error(config.ERROR.COMMON.NO_UPDATE_FIELDS);
				const errorResponse = buildErrorResponse(config.ERROR.COMMON.NO_UPDATE_FIELDS, 400);
				res.status(400).json(errorResponse);
				return;
			}

			const validatedData = validationResult.data;

			shiftTypeLogger.info(`Updating shiftType: ${id}`);

			const existingShiftType = await prisma.shiftType.findFirst({
				where: { id },
			});

			if (!existingShiftType) {
				shiftTypeLogger.error(`${config.ERROR.SHIFTTYPE.NOT_FOUND}: ${id}`);
				const errorResponse = buildErrorResponse(config.ERROR.SHIFTTYPE.NOT_FOUND, 404);
				res.status(404).json(errorResponse);
				return;
			}

			const nextShiftForTotals = { ...existingShiftType, ...validatedData };
			const prismaData = {
				...validatedData,
				shiftHour: calculateShiftHour(nextShiftForTotals),
			} as any;

			const updatedShiftType = await prisma.shiftType.update({
				where: { id },
				data: prismaData,
			});

			try {
				await invalidateCache.byPattern(`cache:shiftType:byId:${id}:*`);
				await invalidateCache.byPattern("cache:shiftType:list:*");
				await invalidateCache.byPattern("cache:scheduleOverride:list:*");
				await invalidateCache.byPattern("cache:attendance:*");
				await invalidateCache.byPattern("cache:timesheet:*");
				await invalidateCache.byPattern("cache:metrics:*");
				shiftTypeLogger.info(`Cache invalidated after shiftType ${id} update`);
			} catch (cacheError) {
				shiftTypeLogger.warn(
					"Failed to invalidate cache after shiftType update:",
					cacheError,
				);
			}

			shiftTypeLogger.info(`${config.SUCCESS.SHIFTTYPE.UPDATED}: ${updatedShiftType.id}`);
			const successResponse = buildSuccessResponse(
				config.SUCCESS.SHIFTTYPE.UPDATED,
				{ shiftType: normalizeShiftTypeTotals(updatedShiftType) },
				200,
			);
			res.status(200).json(successResponse);
		} catch (error) {
			shiftTypeLogger.error(`${config.ERROR.SHIFTTYPE.ERROR_UPDATING}: ${error}`);
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
				shiftTypeLogger.error(config.ERROR.QUERY_PARAMS.MISSING_ID);
				const errorResponse = buildErrorResponse(config.ERROR.QUERY_PARAMS.MISSING_ID, 400);
				res.status(400).json(errorResponse);
				return;
			}

			shiftTypeLogger.info(`${config.SUCCESS.SHIFTTYPE.DELETED}: ${id}`);

			const existingShiftType = await prisma.shiftType.findFirst({
				where: { id },
			});

			if (!existingShiftType) {
				shiftTypeLogger.error(`${config.ERROR.SHIFTTYPE.NOT_FOUND}: ${id}`);
				const errorResponse = buildErrorResponse(config.ERROR.SHIFTTYPE.NOT_FOUND, 404);
				res.status(404).json(errorResponse);
				return;
			}

			await prisma.shiftType.delete({
				where: { id },
			});

			try {
				await invalidateCache.byPattern(`cache:shiftType:byId:${id}:*`);
				await invalidateCache.byPattern("cache:shiftType:list:*");
				await invalidateCache.byPattern("cache:scheduleOverride:list:*");
				await invalidateCache.byPattern("cache:attendance:*");
				await invalidateCache.byPattern("cache:timesheet:*");
				await invalidateCache.byPattern("cache:metrics:*");
				shiftTypeLogger.info(`Cache invalidated after shiftType ${id} deletion`);
			} catch (cacheError) {
				shiftTypeLogger.warn(
					"Failed to invalidate cache after shiftType deletion:",
					cacheError,
				);
			}

			shiftTypeLogger.info(`${config.SUCCESS.SHIFTTYPE.DELETED}: ${id}`);
			const successResponse = buildSuccessResponse(config.SUCCESS.SHIFTTYPE.DELETED, {}, 200);
			res.status(200).json(successResponse);
		} catch (error) {
			shiftTypeLogger.error(`${config.ERROR.SHIFTTYPE.DELETE_FAILED}: ${error}`);
			const errorResponse = buildErrorResponse(
				config.ERROR.COMMON.INTERNAL_SERVER_ERROR,
				500,
			);
			res.status(500).json(errorResponse);
		}
	};

	const importFromXLSX = async (req: Request, res: Response, _next: NextFunction) => {
		try {
			const file = (req as any).file;
			if (!file) {
				res.status(400).json(buildErrorResponse("No file uploaded", 400));
				return;
			}

			const organizationId = (req as any).organizationId;
			if (!organizationId) {
				res.status(401).json(buildErrorResponse("Organization ID not found", 401));
				return;
			}

			const workbook = XLSX.read(file.buffer, { type: "buffer" });
			const sheetName = workbook.SheetNames[0];
			const worksheet = workbook.Sheets[sheetName];
			const rows = XLSX.utils.sheet_to_json<Record<string, any>>(worksheet, {
				raw: false,
				defval: "",
			});

			if (!rows.length) {
				res.status(400).json(buildErrorResponse("Import file is empty", 400));
				return;
			}

			const summary = {
				totalRows: rows.length,
				created: 0,
				updated: 0,
				scheduleTemplatesUpserted: 0,
				skipped: 0,
				errors: [] as string[],
			};

			for (const [index, row] of rows.entries()) {
				const rowNumber = index + 2;
				try {
					const code = String(
						getImportValue(row, ["CODE", "SHIFT_CODE", "SHIFT CODE", "ShiftCode"]) || "",
					).trim();
					const nameValue = String(
						getImportValue(row, ["NAME", "SHIFT_NAME", "SHIFT NAME"]) || "",
					).trim();
					const tokenizedSlots = parseTokenizedTimeSlots(
						getImportValue(row, [
							"TIME_SLOTS",
							"TIME SLOTS",
							"SLOTS",
							"PATTERN",
							"WORK",
							"WORK()",
						]),
					);
					const isOff =
						parseOptionalBoolean(getImportValue(row, ["IS_OFF", "OFF_DAY", "IS OFF"])) ??
						false;
					const isActive =
						parseOptionalBoolean(getImportValue(row, ["IS_ACTIVE", "ACTIVE", "STATUS"])) ??
						true;

					if (!code) {
						summary.skipped++;
						summary.errors.push(`Row ${rowNumber}: CODE is required`);
						continue;
					}

					if (
						!isOff &&
						!tokenizedSlots
					) {
						summary.skipped++;
						summary.errors.push(
							`Row ${rowNumber}: TIME_SLOTS is required for non-off shift types. Separate slots with semicolons, for example WORK(08:00-12:00);BREAK(12:00PM-1:00PM).`,
						);
						continue;
					}

					const normalizedName = nameValue || code;
					const timeSlots = isOff ? [] : tokenizedSlots || [];
					const isOvernight =
						parseOptionalBoolean(getImportValue(row, ["IS_OVERNIGHT", "OVERNIGHT"])) ??
						(!isOff &&
							timeSlots.some((slot) => {
								const start = parseClockMinutes(slot.startTime);
								const end = parseClockMinutes(slot.endTime);
								return start !== null && end !== null && end <= start;
							}));

					const payload = {
						organizationId,
						name: normalizedName,
						code,
						isOvernight,
						isOff,
						isActive,
						timeSlots,
					};
					const shiftHour = calculateShiftHour(payload);

					const existing = await prisma.shiftType.findUnique({
						where: {
							organizationId_code: {
								organizationId,
								code,
							},
						},
					});

					if (existing) {
						const shiftType = await prisma.shiftType.update({
							where: { id: existing.id },
							data: {
								name: normalizedName,
								isOvernight,
								isOff,
								isActive,
								timeSlots,
								shiftHour,
							} as any,
						});
						summary.updated++;
						const templateUpserted = await ensureBnpiDefaultScheduleTemplate(prisma, {
							organizationId,
							shiftTypeId: shiftType.id,
							code,
							name: normalizedName,
							isActive,
						});
						if (templateUpserted) summary.scheduleTemplatesUpserted++;
					} else {
						const shiftType = await prisma.shiftType.create({
							data: {
								...payload,
								shiftHour,
							} as any,
						});
						summary.created++;
						const templateUpserted = await ensureBnpiDefaultScheduleTemplate(prisma, {
							organizationId,
							shiftTypeId: shiftType.id,
							code,
							name: normalizedName,
							isActive,
						});
						if (templateUpserted) summary.scheduleTemplatesUpserted++;
					}
				} catch (rowError) {
					summary.skipped++;
					summary.errors.push(
						`Row ${rowNumber}: ${rowError instanceof Error ? rowError.message : String(rowError)}`,
					);
				}
			}

			try {
				await invalidateCache.byPattern("cache:shiftType:list:*");
				await invalidateCache.byPattern("cache:scheduleTemplate:list:*");
				await invalidateCache.byPattern("cache:scheduleTemplate:byId:*");
				await invalidateCache.byPattern("cache:scheduleOverride:list:*");
				await invalidateCache.byPattern("cache:attendance:*");
				await invalidateCache.byPattern("cache:timesheet:*");
				await invalidateCache.byPattern("cache:metrics:*");
				shiftTypeLogger.info("ShiftType caches invalidated after import");
			} catch (cacheError) {
				shiftTypeLogger.warn("Failed to invalidate cache after shiftType import:", cacheError);
			}

			res.status(200).json(
				buildSuccessResponse(
					"Shift types imported successfully",
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
			shiftTypeLogger.error(`ShiftType import failed: ${error}`);
			res.status(500).json(
				buildErrorResponse(
					`Failed to import shift types: ${error instanceof Error ? error.message : String(error)}`,
					500,
				),
			);
		}
	};

	return { generateCode, create, getAll, getById, update, remove, importFromXLSX };
};
