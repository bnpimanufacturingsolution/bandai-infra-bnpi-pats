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
import { CreateScheduleTemplateSchema, UpdateScheduleTemplateSchema } from "../../zod/scheduleTemplate.zod";
import { logActivity } from "../../utils/activityLogger";
import { logAudit } from "../../utils/auditLogger";
import { config } from "../../config/constant";
import { redisClient } from "../../config/redis";
import { invalidateCache } from "../../middleware/cache";
import { copyShiftTypeToTemplatePatternDay } from "../../helper/employee-schedule.helper";
import { suggestUniqueConfigCode } from "../../helper/config-code.helper";
import {
	calculateScheduleTemplateTotals,
	normalizeScheduleTemplateTotals,
} from "../../helper/schedule-normalization.helper";

const logger = getLogger();
const scheduleTemplateLogger = logger.child({ module: "scheduleTemplate" });

const buildDuplicateName = (baseName: string, copyNumber: number) =>
	copyNumber <= 1 ? `${baseName} (Copy)` : `${baseName} (Copy ${copyNumber})`;

const buildDuplicateCode = (baseCode: string, copyNumber: number) =>
	copyNumber <= 1 ? `${baseCode}_COPY` : `${baseCode}_COPY_${copyNumber}`;

const normalizeImportKey = (key: string) =>
	String(key || "")
		.trim()
		.replace(/[\s_-]+/g, "")
		.toUpperCase();

const getImportValue = (row: Record<string, any>, aliases: string[]) => {
	const normalizedAliases = aliases.map(normalizeImportKey);
	for (const [key, value] of Object.entries(row)) {
		if (normalizedAliases.includes(normalizeImportKey(key))) return value;
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

const parseTimeRange = (value: string) => {
	const match = String(value || "")
		.trim()
		.match(/^([^-]+?)\s*(?:-|to)\s*([^-]+)$/i);
	if (!match) return null;
	const start = parseClockValue(match[1]);
	const end = parseClockValue(match[2]);
	if (!start || !end) return null;
	return { startTime: formatClockMinutes(start.minutes), endTime: formatClockMinutes(end.minutes) };
};

const parseManualPatternCell = (value: string, fallbackCode: string, day: number) => {
	const source = String(value || "").trim();
	if (!source) return null;
	if (/^(OFF|REST)(\(\))?$/i.test(source)) {
		return {
			day,
			shiftTypeId: null,
			shiftSnapshot: {
				name: "Off day",
				code: "OFF",
				isOvernight: false,
				isOff: true,
				shiftHour: 0,
				timeSlots: [],
			},
		};
	}

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
			const range = parseTimeRange(rangeValue);
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
	if (!slots.length) return null;

	return {
		day,
		shiftTypeId: null,
		shiftSnapshot: {
			name: `${fallbackCode} Day ${day}`,
			code: `${fallbackCode}-D${day}`,
			isOvernight: slots.some((slot) => {
				const range = parseTimeRange(`${slot.startTime}-${slot.endTime}`);
				if (!range) return false;
				const [startHour, startMinute] = range.startTime.split(":").map(Number);
				const [endHour, endMinute] = range.endTime.split(":").map(Number);
				return endHour * 60 + endMinute <= startHour * 60 + startMinute;
			}),
			isOff: false,
			timeSlots: slots,
		},
	};
};

const parseIntegerImportValue = (value: unknown): number | null => {
	if (value === undefined || value === null || value === "") return null;
	const parsed = Number(value);
	return Number.isFinite(parsed) ? Math.trunc(parsed) : null;
};

const normalizeCycleDays = (value: number | null, fallback = 7) => {
	const allowedCycleDays = [7, 14, 21, 28, 35, 42];
	return allowedCycleDays.includes(Number(value)) ? Number(value) : fallback;
};

const normalizeLookupValue = (value: unknown) =>
	String(value || "")
		.trim()
		.toUpperCase();

const getPatternCellValue = (row: Record<string, any>, day: number) =>
	getImportValue(row, [
		`DAY_${day}`,
		`DAY ${day}`,
		`DAY${day}`,
		`D${day}`,
		`PATTERN_${day}`,
		`PATTERN ${day}`,
		...(day === 1 ? ["MONDAY", "MON"] : []),
		...(day === 2 ? ["TUESDAY", "TUE"] : []),
		...(day === 3 ? ["WEDNESDAY", "WED"] : []),
		...(day === 4 ? ["THURSDAY", "THU"] : []),
		...(day === 5 ? ["FRIDAY", "FRI"] : []),
		...(day === 6 ? ["SATURDAY", "SAT"] : []),
		...(day === 7 ? ["SUNDAY", "SUN"] : []),
	]);

const mapScheduleTemplateWriteError = (error: unknown): { status: number; message: string } | null => {
	if ((error as any)?.message?.includes("ShiftType not found")) {
		return { status: 400, message: (error as any).message };
	}

	if (error instanceof Prisma.PrismaClientKnownRequestError) {
		if (error.code === "P2002") {
			return {
				status: 409,
				message: "Schedule template code already exists in this organization.",
			};
		}
		if (error.code === "P2003") {
			return {
				status: 400,
				message: "Invalid related record in schedule template payload.",
			};
		}
		if (error.code === "P2025") {
			return {
				status: 404,
				message: config.ERROR.SCHEDULETEMPLATE.NOT_FOUND,
			};
		}
	}

	if (error instanceof Prisma.PrismaClientValidationError) {
		return {
			status: 400,
			message: "Invalid schedule template payload. Please review pattern values.",
		};
	}

	return null;
};

export const controller = (prisma: PrismaClient) => {
	const generateCode = async (req: Request, res: Response, _next: NextFunction) => {
		const organizationId = (req as any).organizationId;
		const sourceName = String(req.query.name || "").trim();
		if (!organizationId) {
			res.status(401).json(buildErrorResponse("Organization ID is required", 401));
			return;
		}
		if (!sourceName) {
			res.status(400).json(buildErrorResponse("Name is required to generate a code", 400));
			return;
		}

		try {
			const suggestion = await suggestUniqueConfigCode({
				value: sourceName,
				isCodeTaken: async (candidateCode) => {
					const existingTemplate = await prisma.scheduleTemplate.findUnique({
						where: {
							organizationId_code: {
								organizationId,
								code: candidateCode,
							},
						},
						select: { id: true },
					});
					return Boolean(existingTemplate);
				},
			});

			res.status(200).json(
				buildSuccessResponse("Schedule template code generated successfully", suggestion, 200),
			);
		} catch (error) {
			scheduleTemplateLogger.error(`ScheduleTemplate generateCode failed: ${error}`);
			res.status(500).json(buildErrorResponse(config.ERROR.COMMON.INTERNAL_SERVER_ERROR, 500));
		}
	};

	const create = async (req: Request, res: Response, _next: NextFunction) => {
		let requestData = req.body;
		const contentType = req.get("Content-Type") || "";

		if (
			contentType.includes("application/x-www-form-urlencoded") ||
			contentType.includes("multipart/form-data")
		) {
			scheduleTemplateLogger.info("Original form data:", JSON.stringify(req.body, null, 2));
			requestData = transformFormDataToObject(req.body);
			scheduleTemplateLogger.info(
				"Transformed form data to object structure:",
				JSON.stringify(requestData, null, 2),
			);
		}

		const validation = CreateScheduleTemplateSchema.safeParse(requestData);
		if (!validation.success) {
			const formattedErrors = formatZodErrors(validation.error.format());
			scheduleTemplateLogger.error(`Validation failed: ${JSON.stringify(formattedErrors)}`);
			const errorResponse = buildErrorResponse("Validation failed", 400, formattedErrors);
			res.status(400).json(errorResponse);
			return;
		}

		try {
			const hydratedPattern = await copyShiftTypeToTemplatePatternDay(prisma, {
				organizationId: (validation.data as any).organizationId,
				pattern: Array.isArray((validation.data as any).pattern)
					? ((validation.data as any).pattern as any)
					: [],
			});
			const { normalizedPattern, totalDay, totalHour } =
				calculateScheduleTemplateTotals(hydratedPattern);
			const scheduleTemplate = await prisma.scheduleTemplate.create({
				data: {
					...(validation.data as any),
					pattern: normalizedPattern as any,
					totalDay,
					totalHour,
				} as any,
			});
			scheduleTemplateLogger.info(`ScheduleTemplate created successfully: ${scheduleTemplate.id}`);

			logActivity(req, {
				userId: (req as any).user?.id || "unknown",
				action: config.ACTIVITY_LOG.SCHEDULETEMPLATE.ACTIONS.CREATE_SCHEDULETEMPLATE,
				description: `${config.ACTIVITY_LOG.SCHEDULETEMPLATE.DESCRIPTIONS.SCHEDULETEMPLATE_CREATED}: ${scheduleTemplate.name || scheduleTemplate.id}`,
				page: {
					url: req.originalUrl,
					title: config.ACTIVITY_LOG.SCHEDULETEMPLATE.PAGES.SCHEDULETEMPLATE_CREATION,
				},
			});

			logAudit(req, {
				userId: (req as any).user?.id || "unknown",
				action: config.AUDIT_LOG.ACTIONS.CREATE,
				resource: config.AUDIT_LOG.RESOURCES.SCHEDULETEMPLATE,
				severity: config.AUDIT_LOG.SEVERITY.LOW,
				entityType: config.AUDIT_LOG.ENTITY_TYPES.SCHEDULETEMPLATE,
				entityId: scheduleTemplate.id,
				changesBefore: null,
				changesAfter: {
					id: scheduleTemplate.id,
					name: scheduleTemplate.name,
					description: scheduleTemplate.description,
					createdAt: scheduleTemplate.createdAt,
					updatedAt: scheduleTemplate.updatedAt,
				},
				description: `${config.AUDIT_LOG.SCHEDULETEMPLATE.DESCRIPTIONS.SCHEDULETEMPLATE_CREATED}: ${scheduleTemplate.name || scheduleTemplate.id}`,
			});

			try {
				await invalidateCache.byPattern("cache:scheduleTemplate:list:*");
				await invalidateCache.byPattern("cache:employee:*");
				await invalidateCache.byPattern("cache:attendance:*");
				await invalidateCache.byPattern("cache:timesheet:*");
				await invalidateCache.byPattern("cache:metrics:*");
				scheduleTemplateLogger.info("ScheduleTemplate list cache invalidated after creation");
			} catch (cacheError) {
				scheduleTemplateLogger.warn(
					"Failed to invalidate cache after scheduleTemplate creation:",
					cacheError,
				);
			}

			const successResponse = buildSuccessResponse(
				config.SUCCESS.SCHEDULETEMPLATE.CREATED,
				normalizeScheduleTemplateTotals(scheduleTemplate),
				201,
			);
			res.status(201).json(successResponse);
		} catch (error) {
			scheduleTemplateLogger.error(`${config.ERROR.SCHEDULETEMPLATE.CREATE_FAILED}: ${error}`);
			const mappedError = mapScheduleTemplateWriteError(error);
			if (mappedError) {
				res.status(mappedError.status).json(buildErrorResponse(mappedError.message, mappedError.status));
				return;
			}
			const errorResponse = buildErrorResponse(
				config.ERROR.COMMON.INTERNAL_SERVER_ERROR,
				500,
			);
			res.status(500).json(errorResponse);
		}
	};
	const getAll = async (req: Request, res: Response, _next: NextFunction) => {
		const validationResult = validateQueryParams(req, scheduleTemplateLogger);

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

		scheduleTemplateLogger.info(
			`Getting scheduleTemplates, page: ${page}, limit: ${limit}, query: ${query}, order: ${order}, groupBy: ${groupBy}`,
		);

		try {
			// Base where clause
			const whereClause: Prisma.ScheduleTemplateWhereInput = {
				isDeleted: false,
			};

			// search fields sample ("name", "description", "type")
			const searchFields = ["name", "description", "type"];
			if (query) {
				const searchConditions = buildSearchConditions("ScheduleTemplate", query, searchFields);
				if (searchConditions.length > 0) {
					whereClause.OR = searchConditions;
				}
			}

			if (filter) {
				const filterConditions = buildFilterConditions("ScheduleTemplate", filter);
				if (filterConditions.length > 0) {
					whereClause.AND = filterConditions;
				}
			}
			const findManyQuery = buildFindManyQuery(whereClause, skip, limit, order, sort, fields);

			const [scheduleTemplates, total] = await Promise.all([
				document ? prisma.scheduleTemplate.findMany(findManyQuery) : [],
				count ? prisma.scheduleTemplate.count({ where: whereClause }) : 0,
			]);

			scheduleTemplateLogger.info(`Retrieved ${scheduleTemplates.length} scheduleTemplates`);
			const normalizedScheduleTemplates = scheduleTemplates.map((item) =>
				normalizeScheduleTemplateTotals(item),
			);
			const processedData =
				groupBy && document
					? groupDataByField(normalizedScheduleTemplates, groupBy as string)
					: normalizedScheduleTemplates;

			const responseData: Record<string, any> = {
				...(document && { scheduleTemplates: processedData }),
				...(count && { count: total }),
				...(pagination && { pagination: buildPagination(total, page, limit) }),
				...(groupBy && { groupedBy: groupBy }),
			};

			res.status(200).json(
				buildSuccessResponse(config.SUCCESS.SCHEDULETEMPLATE.RETRIEVED_ALL, responseData, 200),
			);
		} catch (error) {
			scheduleTemplateLogger.error(`${config.ERROR.SCHEDULETEMPLATE.GET_ALL_FAILED}: ${error}`);
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
				scheduleTemplateLogger.error(config.ERROR.QUERY_PARAMS.MISSING_ID);
				const errorResponse = buildErrorResponse(config.ERROR.QUERY_PARAMS.MISSING_ID, 400);
				res.status(400).json(errorResponse);
				return;
			}

			if (fields && typeof fields !== "string") {
				scheduleTemplateLogger.error(`${config.ERROR.QUERY_PARAMS.INVALID_POPULATE}: ${fields}`);
				const errorResponse = buildErrorResponse(
					config.ERROR.QUERY_PARAMS.POPULATE_MUST_BE_STRING,
					400,
				);
				res.status(400).json(errorResponse);
				return;
			}

			scheduleTemplateLogger.info(`${config.SUCCESS.SCHEDULETEMPLATE.GETTING_BY_ID}: ${id}`);

			const cacheKey = `cache:scheduleTemplate:byId:${id}:${fields || "full"}`;
			let scheduleTemplate = null;

			try {
				if (redisClient.isClientConnected()) {
					scheduleTemplate = await redisClient.getJSON(cacheKey);
					if (scheduleTemplate) {
						scheduleTemplateLogger.info(`ScheduleTemplate ${id} retrieved from direct Redis cache`);
					}
				}
			} catch (cacheError) {
				scheduleTemplateLogger.warn(`Redis cache retrieval failed for scheduleTemplate ${id}:`, cacheError);
			}

			if (!scheduleTemplate) {
				const query: Prisma.ScheduleTemplateFindFirstArgs = {
					where: { id },
				};

				query.select = getNestedFields(typeof fields === "string" ? fields : undefined);

				scheduleTemplate = await prisma.scheduleTemplate.findFirst(query);

				if (scheduleTemplate && redisClient.isClientConnected()) {
					try {
						await redisClient.setJSON(cacheKey, scheduleTemplate, 3600);
						scheduleTemplateLogger.info(`ScheduleTemplate ${id} stored in direct Redis cache`);
					} catch (cacheError) {
						scheduleTemplateLogger.warn(
							`Failed to store scheduleTemplate ${id} in Redis cache:`,
							cacheError,
						);
					}
				}
			}

			if (!scheduleTemplate) {
				scheduleTemplateLogger.error(`${config.ERROR.SCHEDULETEMPLATE.NOT_FOUND}: ${id}`);
				const errorResponse = buildErrorResponse(config.ERROR.SCHEDULETEMPLATE.NOT_FOUND, 404);
				res.status(404).json(errorResponse);
				return;
			}

			scheduleTemplateLogger.info(`${config.SUCCESS.SCHEDULETEMPLATE.RETRIEVED}: ${(scheduleTemplate as any).id}`);
			const successResponse = buildSuccessResponse(
				config.SUCCESS.SCHEDULETEMPLATE.RETRIEVED,
				normalizeScheduleTemplateTotals(scheduleTemplate),
				200,
			);
			res.status(200).json(successResponse);
		} catch (error) {
			scheduleTemplateLogger.error(`${config.ERROR.SCHEDULETEMPLATE.ERROR_GETTING}: ${error}`);
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
				scheduleTemplateLogger.error(config.ERROR.QUERY_PARAMS.MISSING_ID);
				const errorResponse = buildErrorResponse(config.ERROR.QUERY_PARAMS.MISSING_ID, 400);
				res.status(400).json(errorResponse);
				return;
			}

			const validationResult = UpdateScheduleTemplateSchema.safeParse(req.body);

			if (!validationResult.success) {
				const formattedErrors = formatZodErrors(validationResult.error.format());
				scheduleTemplateLogger.error(`Validation failed: ${JSON.stringify(formattedErrors)}`);
				const errorResponse = buildErrorResponse("Validation failed", 400, formattedErrors);
				res.status(400).json(errorResponse);
				return;
			}

			if (Object.keys(req.body).length === 0) {
				scheduleTemplateLogger.error(config.ERROR.COMMON.NO_UPDATE_FIELDS);
				const errorResponse = buildErrorResponse(config.ERROR.COMMON.NO_UPDATE_FIELDS, 400);
				res.status(400).json(errorResponse);
				return;
			}

			const validatedData = validationResult.data;

			scheduleTemplateLogger.info(`Updating scheduleTemplate: ${id}`);

			const existingScheduleTemplate = await prisma.scheduleTemplate.findFirst({
				where: { id },
			});

			if (!existingScheduleTemplate) {
				scheduleTemplateLogger.error(`${config.ERROR.SCHEDULETEMPLATE.NOT_FOUND}: ${id}`);
				const errorResponse = buildErrorResponse(config.ERROR.SCHEDULETEMPLATE.NOT_FOUND, 404);
				res.status(404).json(errorResponse);
				return;
			}

			const prismaData = { ...validatedData } as any;
			if (Array.isArray(prismaData.pattern)) {
				const hydratedPattern = await copyShiftTypeToTemplatePatternDay(prisma, {
					organizationId: existingScheduleTemplate.organizationId,
					pattern: prismaData.pattern,
				});
				const { normalizedPattern, totalDay, totalHour } =
					calculateScheduleTemplateTotals(hydratedPattern);
				prismaData.pattern = normalizedPattern;
				prismaData.totalDay = totalDay;
				prismaData.totalHour = totalHour;
			}

			const updatedScheduleTemplate = await prisma.scheduleTemplate.update({
				where: { id },
				data: prismaData,
			});

			try {
				await invalidateCache.byPattern(`cache:scheduleTemplate:byId:${id}:*`);
				await invalidateCache.byPattern("cache:scheduleTemplate:list:*");
				await invalidateCache.byPattern("cache:employee:*");
				await invalidateCache.byPattern("cache:attendance:*");
				await invalidateCache.byPattern("cache:timesheet:*");
				await invalidateCache.byPattern("cache:metrics:*");
				scheduleTemplateLogger.info(`Cache invalidated after scheduleTemplate ${id} update`);
			} catch (cacheError) {
				scheduleTemplateLogger.warn(
					"Failed to invalidate cache after scheduleTemplate update:",
					cacheError,
				);
			}

			scheduleTemplateLogger.info(`${config.SUCCESS.SCHEDULETEMPLATE.UPDATED}: ${updatedScheduleTemplate.id}`);
			const successResponse = buildSuccessResponse(
				config.SUCCESS.SCHEDULETEMPLATE.UPDATED,
				{ scheduleTemplate: normalizeScheduleTemplateTotals(updatedScheduleTemplate) },
				200,
			);
			res.status(200).json(successResponse);
		} catch (error) {
			scheduleTemplateLogger.error(`${config.ERROR.SCHEDULETEMPLATE.ERROR_UPDATING}: ${error}`);
			const mappedError = mapScheduleTemplateWriteError(error);
			if (mappedError) {
				res.status(mappedError.status).json(buildErrorResponse(mappedError.message, mappedError.status));
				return;
			}
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
				scheduleTemplateLogger.error(config.ERROR.QUERY_PARAMS.MISSING_ID);
				const errorResponse = buildErrorResponse(config.ERROR.QUERY_PARAMS.MISSING_ID, 400);
				res.status(400).json(errorResponse);
				return;
			}

			scheduleTemplateLogger.info(`${config.SUCCESS.SCHEDULETEMPLATE.DELETED}: ${id}`);

			const existingScheduleTemplate = await prisma.scheduleTemplate.findFirst({
				where: { id },
			});

			if (!existingScheduleTemplate) {
				scheduleTemplateLogger.error(`${config.ERROR.SCHEDULETEMPLATE.NOT_FOUND}: ${id}`);
				const errorResponse = buildErrorResponse(config.ERROR.SCHEDULETEMPLATE.NOT_FOUND, 404);
				res.status(404).json(errorResponse);
				return;
			}

			await prisma.scheduleTemplate.delete({
				where: { id },
			});

			try {
				await invalidateCache.byPattern(`cache:scheduleTemplate:byId:${id}:*`);
				await invalidateCache.byPattern("cache:scheduleTemplate:list:*");
				await invalidateCache.byPattern("cache:employee:*");
				await invalidateCache.byPattern("cache:attendance:*");
				await invalidateCache.byPattern("cache:timesheet:*");
				await invalidateCache.byPattern("cache:metrics:*");
				scheduleTemplateLogger.info(`Cache invalidated after scheduleTemplate ${id} deletion`);
			} catch (cacheError) {
				scheduleTemplateLogger.warn(
					"Failed to invalidate cache after scheduleTemplate deletion:",
					cacheError,
				);
			}

			scheduleTemplateLogger.info(`${config.SUCCESS.SCHEDULETEMPLATE.DELETED}: ${id}`);
			const successResponse = buildSuccessResponse(config.SUCCESS.SCHEDULETEMPLATE.DELETED, {}, 200);
			res.status(200).json(successResponse);
		} catch (error) {
			scheduleTemplateLogger.error(`${config.ERROR.SCHEDULETEMPLATE.DELETE_FAILED}: ${error}`);
			const errorResponse = buildErrorResponse(
				config.ERROR.COMMON.INTERNAL_SERVER_ERROR,
				500,
			);
			res.status(500).json(errorResponse);
		}
	};

	const duplicate = async (req: Request, res: Response, _next: NextFunction) => {
		const { id } = req.params;

		try {
			if (!id) {
				scheduleTemplateLogger.error(config.ERROR.QUERY_PARAMS.MISSING_ID);
				res.status(400).json(buildErrorResponse(config.ERROR.QUERY_PARAMS.MISSING_ID, 400));
				return;
			}

			const sourceTemplate = await prisma.scheduleTemplate.findFirst({
				where: { id, isDeleted: false },
			});

			if (!sourceTemplate) {
				scheduleTemplateLogger.error(`${config.ERROR.SCHEDULETEMPLATE.NOT_FOUND}: ${id}`);
				res.status(404).json(buildErrorResponse(config.ERROR.SCHEDULETEMPLATE.NOT_FOUND, 404));
				return;
			}

			let duplicateIndex = 1;
			let nextName = buildDuplicateName(sourceTemplate.name, duplicateIndex);
			let nextCode = buildDuplicateCode(sourceTemplate.code, duplicateIndex);

			while (true) {
				const existingConflict = await prisma.scheduleTemplate.findFirst({
					where: {
						organizationId: sourceTemplate.organizationId,
						isDeleted: false,
						OR: [{ name: nextName }, { code: nextCode }],
					},
					select: { id: true },
				});

				if (!existingConflict) break;

				duplicateIndex += 1;
				nextName = buildDuplicateName(sourceTemplate.name, duplicateIndex);
				nextCode = buildDuplicateCode(sourceTemplate.code, duplicateIndex);
			}

			const hydratedPattern = await copyShiftTypeToTemplatePatternDay(prisma, {
				organizationId: sourceTemplate.organizationId,
				pattern: Array.isArray(sourceTemplate.pattern) ? (sourceTemplate.pattern as any) : [],
			});
			const { normalizedPattern, totalDay, totalHour } =
				calculateScheduleTemplateTotals(hydratedPattern);

			const duplicatedTemplate = await prisma.scheduleTemplate.create({
				data: {
					organizationId: sourceTemplate.organizationId,
					name: nextName,
					code: nextCode,
					description: sourceTemplate.description || undefined,
					cycleDays: sourceTemplate.cycleDays,
					graceLateMinutes: sourceTemplate.graceLateMinutes,
					graceEarlyOutMinutes: sourceTemplate.graceEarlyOutMinutes,
					pattern: normalizedPattern as any,
					totalDay,
					totalHour,
					isActive: sourceTemplate.isActive,
					isDeleted: false,
				} as any,
			});

			try {
				await invalidateCache.byPattern(`cache:scheduleTemplate:byId:${id}:*`);
				await invalidateCache.byPattern(`cache:scheduleTemplate:byId:${duplicatedTemplate.id}:*`);
				await invalidateCache.byPattern("cache:scheduleTemplate:list:*");
				await invalidateCache.byPattern("cache:employee:*");
				await invalidateCache.byPattern("cache:attendance:*");
				await invalidateCache.byPattern("cache:timesheet:*");
				await invalidateCache.byPattern("cache:metrics:*");
			} catch (cacheError) {
				scheduleTemplateLogger.warn(
					"Failed to invalidate cache after schedule template duplication:",
					cacheError,
				);
			}

			logActivity(req, {
				userId: (req as any).user?.id || "unknown",
				action: config.ACTIVITY_LOG.SCHEDULETEMPLATE.ACTIONS.CREATE_SCHEDULETEMPLATE,
				description: `Duplicated schedule template: ${sourceTemplate.name} -> ${duplicatedTemplate.name}`,
				page: {
					url: req.originalUrl,
					title: config.ACTIVITY_LOG.SCHEDULETEMPLATE.PAGES.SCHEDULETEMPLATE_CREATION,
				},
			});

			logAudit(req, {
				userId: (req as any).user?.id || "unknown",
				action: config.AUDIT_LOG.ACTIONS.CREATE,
				resource: config.AUDIT_LOG.RESOURCES.SCHEDULETEMPLATE,
				severity: config.AUDIT_LOG.SEVERITY.LOW,
				entityType: config.AUDIT_LOG.ENTITY_TYPES.SCHEDULETEMPLATE,
				entityId: duplicatedTemplate.id,
				changesBefore: {
					id: sourceTemplate.id,
					name: sourceTemplate.name,
					code: sourceTemplate.code,
				},
				changesAfter: {
					id: duplicatedTemplate.id,
					name: duplicatedTemplate.name,
					code: duplicatedTemplate.code,
				},
				description: `Schedule template duplicated from ${sourceTemplate.id} to ${duplicatedTemplate.id}`,
			});

			res.status(201).json(
				buildSuccessResponse("Schedule template duplicated successfully", {
					scheduleTemplate: normalizeScheduleTemplateTotals(duplicatedTemplate),
				}),
			);
		} catch (error) {
			scheduleTemplateLogger.error(`Failed to duplicate scheduleTemplate ${id}: ${error}`);
			const mappedError = mapScheduleTemplateWriteError(error);
			if (mappedError) {
				res.status(mappedError.status).json(buildErrorResponse(mappedError.message, mappedError.status));
				return;
			}
			res.status(500).json(buildErrorResponse(config.ERROR.COMMON.INTERNAL_SERVER_ERROR, 500));
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

			const shiftTypes = await prisma.shiftType.findMany({
				where: { organizationId, isDeleted: false },
			});
			const shiftTypeByCodeOrName = new Map<string, any>();
			for (const shiftType of shiftTypes) {
				shiftTypeByCodeOrName.set(normalizeLookupValue(shiftType.code), shiftType);
				shiftTypeByCodeOrName.set(normalizeLookupValue(shiftType.name), shiftType);
			}

			const summary = {
				totalRows: rows.length,
				created: 0,
				updated: 0,
				skipped: 0,
				errors: [] as string[],
			};

			for (const [index, row] of rows.entries()) {
				const rowNumber = index + 2;
				try {
					let code = String(
						getImportValue(row, ["CODE", "TEMPLATE_CODE", "TEMPLATE CODE"]) || "",
					).trim();
					const name = String(
						getImportValue(row, ["NAME", "TEMPLATE_NAME", "TEMPLATE NAME"]) || "",
					).trim();
					const description = String(
						getImportValue(row, ["DESCRIPTION", "NOTES"]) || "",
					).trim();
					const cycleDays = normalizeCycleDays(
						parseIntegerImportValue(
							getImportValue(row, ["CYCLE_DAYS", "CYCLE DAYS", "CYCLE"]),
						),
					);
					const graceLateMinutes =
						parseIntegerImportValue(
							getImportValue(row, [
								"GRACE_LATE_MINUTES",
								"GRACE_PERIOD_MINUTES",
								"GRACE PERIOD MINUTES",
								"LATE_GRACE",
								"LATE GRACE",
							]),
						) ?? 15;
					const graceEarlyOutMinutes =
						parseIntegerImportValue(
							getImportValue(row, [
								"GRACE_EARLY_OUT_MINUTES",
								"EARLY_OUT_GRACE",
								"EARLY OUT GRACE",
							]),
						) ?? 0;
					const isActive =
						parseOptionalBoolean(getImportValue(row, ["IS_ACTIVE", "ACTIVE", "STATUS"])) ??
						true;

					if (!name) {
						summary.skipped++;
						summary.errors.push(`Row ${rowNumber}: NAME is required`);
						continue;
					}

					if (!code) {
						const suggestion = await suggestUniqueConfigCode({
							value: name,
							isCodeTaken: async (candidateCode) => {
								const existingTemplate = await prisma.scheduleTemplate.findUnique({
									where: {
										organizationId_code: {
											organizationId,
											code: candidateCode,
										},
									},
									select: { id: true },
								});
								return Boolean(existingTemplate);
							},
						});
						code = suggestion.code;
					}

					const pattern = [];
					for (let day = 1; day <= cycleDays; day++) {
						const cellValue = String(getPatternCellValue(row, day) || "").trim();
						if (!cellValue) {
							pattern.push(parseManualPatternCell("OFF", code, day));
							continue;
						}

						const manualDay = parseManualPatternCell(cellValue, code, day);
						if (manualDay) {
							pattern.push(manualDay);
							continue;
						}

						const shiftType = shiftTypeByCodeOrName.get(normalizeLookupValue(cellValue));
						if (!shiftType) {
							throw new Error(
								`Day ${day} value "${cellValue}" must match a shift type code/name, OFF, or WORK()/BREAK() slots`,
							);
						}

						pattern.push({
							day,
							shiftTypeId: shiftType.id,
							shiftSnapshot: null,
						});
					}

					const hydratedPattern = await copyShiftTypeToTemplatePatternDay(prisma, {
						organizationId,
						pattern: pattern as any,
					});
					const { normalizedPattern, totalDay, totalHour } =
						calculateScheduleTemplateTotals(hydratedPattern);

					const existing =
						(await prisma.scheduleTemplate.findUnique({
							where: {
								organizationId_code: {
									organizationId,
									code,
								},
							},
						})) ||
						(await prisma.scheduleTemplate.findFirst({
							where: {
								organizationId,
								name,
								isDeleted: false,
							},
						}));

					const data = {
						organizationId,
						name,
						code,
						description: description || undefined,
						cycleDays,
						graceLateMinutes,
						graceEarlyOutMinutes,
						pattern: normalizedPattern as any,
						totalDay,
						totalHour,
						isActive,
						isDeleted: false,
					};

					if (existing) {
						await prisma.scheduleTemplate.update({
							where: { id: existing.id },
							data: {
								name,
								code,
								description: description || null,
								cycleDays,
								graceLateMinutes,
								graceEarlyOutMinutes,
								pattern: normalizedPattern as any,
								totalDay,
								totalHour,
								isActive,
							} as any,
						});
						summary.updated++;
					} else {
						await prisma.scheduleTemplate.create({ data: data as any });
						summary.created++;
					}
				} catch (rowError) {
					summary.skipped++;
					summary.errors.push(
						`Row ${rowNumber}: ${rowError instanceof Error ? rowError.message : String(rowError)}`,
					);
				}
			}

			try {
				await invalidateCache.byPattern("cache:scheduleTemplate:list:*");
				await invalidateCache.byPattern("cache:employee:*");
				await invalidateCache.byPattern("cache:attendance:*");
				await invalidateCache.byPattern("cache:timesheet:*");
				await invalidateCache.byPattern("cache:metrics:*");
				scheduleTemplateLogger.info("ScheduleTemplate caches invalidated after import");
			} catch (cacheError) {
				scheduleTemplateLogger.warn(
					"Failed to invalidate cache after schedule template import:",
					cacheError,
				);
			}

			res.status(200).json(
				buildSuccessResponse(
					"Schedule templates imported successfully",
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
			scheduleTemplateLogger.error(`ScheduleTemplate import failed: ${error}`);
			res.status(500).json(
				buildErrorResponse(
					`Failed to import schedule templates: ${error instanceof Error ? error.message : String(error)}`,
					500,
				),
			);
		}
	};

	return { generateCode, create, getAll, getById, update, remove, duplicate, importFromXLSX };
};
