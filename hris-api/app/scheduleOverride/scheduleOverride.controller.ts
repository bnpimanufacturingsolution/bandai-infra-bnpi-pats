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
import { CreateScheduleOverrideSchema, UpdateScheduleOverrideSchema } from "../../zod/scheduleOverride.zod";
import { logActivity } from "../../utils/activityLogger";
import { logAudit } from "../../utils/auditLogger";
import { config } from "../../config/constant";
import { redisClient } from "../../config/redis";
import { invalidateCache } from "../../middleware/cache";
import { recomputeAttendanceObligationsForRange } from "../../helper/attendance-obligation.helper";
import {
	collectShiftTypeIdsFromEmployeeScheduleData,
	resolveEffectiveShiftFromEmployeeData,
	type EmployeeScheduleSnapshot,
} from "../../helper/employee-schedule.helper";
import { calculateShiftHour } from "../../helper/schedule-normalization.helper";

const logger = getLogger();
const scheduleOverrideLogger = logger.child({ module: "scheduleOverride" });

const normalizeToStartOfUtcDay = (value: Date): Date => {
	const normalized = new Date(value);
	normalized.setUTCHours(0, 0, 0, 0);
	return normalized;
};

const toScheduleOverrideShiftSnapshot = (
	shift: EmployeeScheduleSnapshot | null,
): Record<string, any> | null => {
	if (!shift) return null;
	return {
		source: shift.source || null,
		scheduleOverrideId: shift.scheduleOverrideId || null,
		scheduleTemplateId: shift.scheduleTemplateId || null,
		scheduleTemplateName: shift.scheduleTemplateName || null,
		shiftTypeId: shift.shiftTypeId || null,
		shiftTypeCode: shift.shiftTypeCode || null,
		shiftTypeName: shift.shiftTypeName || null,
		isOff: Boolean(shift.isOff),
		isOvernight: Boolean(shift.isOvernight),
		breakMinutes: shift.breakMinutes ?? null,
		startTime: shift.startTime || null,
		endTime: shift.endTime || null,
		timeSlots: Array.isArray(shift.timeSlots) ? shift.timeSlots : [],
	};
};

const toShiftTypeSnapshot = (shiftType: any): Record<string, any> | null => {
	if (!shiftType) return null;
	const timeSlots = Array.isArray(shiftType.timeSlots) ? shiftType.timeSlots : [];
	const isOff = Boolean(shiftType.isOff);
	return {
		source: shiftType.source || "override",
		scheduleOverrideId: null,
		scheduleTemplateId: null,
		scheduleTemplateName: null,
		shiftTypeId: shiftType.shiftTypeId || shiftType.id || null,
		shiftTypeCode: shiftType.shiftTypeCode || shiftType.code || null,
		shiftTypeName: shiftType.shiftTypeName || shiftType.name || null,
		isOff,
		isOvernight: Boolean(shiftType.isOvernight),
		breakMinutes:
			shiftType.breakMinutes === null || shiftType.breakMinutes === undefined
				? null
				: Number(shiftType.breakMinutes),
		startTime: shiftType.startTime || null,
		endTime: shiftType.endTime || null,
		timeSlots,
		shiftHour:
			typeof shiftType.shiftHour === "number" && Number.isFinite(shiftType.shiftHour)
				? shiftType.shiftHour
				: calculateShiftHour({ ...shiftType, isOff, timeSlots }),
	};
};

const normalizeOverrideShiftSnapshot = (
	value: unknown,
	shiftType?: any,
): Record<string, any> | null => {
	const source =
		value && typeof value === "object" && !Array.isArray(value)
			? (value as Record<string, any>)
			: {};
	if (!shiftType && Object.keys(source).length === 0) return null;

	const timeSlots = Array.isArray(source.timeSlots)
		? source.timeSlots
		: Array.isArray(shiftType?.timeSlots)
			? shiftType.timeSlots
			: [];
	const hasWorkSlot = timeSlots.some(
		(slot: any) => String(slot?.type || "").toLowerCase() === "work",
	);
	const isOff =
		source.isOff !== undefined && source.isOff !== null
			? Boolean(source.isOff)
			: Boolean(shiftType?.isOff) && !hasWorkSlot;
	const name = String(source.shiftTypeName || source.name || shiftType?.name || "").trim();
	const code = String(source.shiftTypeCode || source.code || shiftType?.code || "").trim();

	return {
		source: source.source || "schedule_override",
		shiftTypeId: source.shiftTypeId || shiftType?.id || null,
		shiftTypeName: name || null,
		shiftTypeCode: code || null,
		name: name || null,
		code: code || null,
		isOff,
		isOvernight:
			source.isOvernight !== undefined && source.isOvernight !== null
				? Boolean(source.isOvernight)
				: Boolean(shiftType?.isOvernight),
		breakMinutes:
			source.breakMinutes === null || source.breakMinutes === undefined
				? null
				: Number(source.breakMinutes),
		startTime: source.startTime || null,
		endTime: source.endTime || null,
		timeSlots,
		shiftHour:
			typeof source.shiftHour === "number" && Number.isFinite(source.shiftHour)
				? source.shiftHour
				: calculateShiftHour({ ...(shiftType || {}), ...source, isOff, timeSlots }),
	};
};

const enrichScheduleOverridesWithShiftChange = async (
	prisma: PrismaClient,
	organizationId: string | null | undefined,
	rows: any[],
) => {
	if (!organizationId || rows.length === 0) return rows;
	const employeeIds = Array.from(
		new Set(rows.map((row) => String(row?.employeeId || "")).filter(Boolean)),
	);
	if (!employeeIds.length) return rows;

	const employees = await (prisma as any).employee.findMany({
		where: {
			organizationId,
			id: { in: employeeIds },
			isDeleted: false,
		},
		select: {
			id: true,
			embeddedSchedule: true,
			employmentStartDate: true,
			employmentHireDate: true,
			scheduleHistoryRecords: {
				where: { organizationId },
				orderBy: [{ effectiveAt: "asc" }, { createdAt: "asc" }],
				select: {
					effectiveAt: true,
					createdAt: true,
					beforeSchedule: true,
					afterSchedule: true,
				},
			},
		},
	});
	const employeeById = new Map<string, any>(
		employees.map((employee: any) => [String(employee.id), employee]),
	);
	const shiftTypeIds = new Set<string>();
	for (const employee of employees) {
		for (const id of collectShiftTypeIdsFromEmployeeScheduleData(employee)) {
			shiftTypeIds.add(String(id));
		}
	}
	for (const row of rows) {
		if (row?.shiftTypeId) shiftTypeIds.add(String(row.shiftTypeId));
		if (row?.shiftSnapshot?.shiftTypeId) {
			shiftTypeIds.add(String(row.shiftSnapshot.shiftTypeId));
		}
	}
	const shiftTypes = shiftTypeIds.size
		? await (prisma as any).shiftType.findMany({
				where: {
					organizationId,
					id: { in: Array.from(shiftTypeIds) },
					isDeleted: false,
				},
		  })
		: [];
	const shiftTypeById = new Map<string, any>(
		shiftTypes.map((shiftType: any) => [String(shiftType.id), shiftType]),
	);

	return rows.map((row) => {
		const employee = employeeById.get(String(row?.employeeId || ""));
		const date = row?.date ? new Date(row.date) : null;
		const previousShift =
			employee && date && !Number.isNaN(date.getTime())
				? resolveEffectiveShiftFromEmployeeData(
						{ ...employee, scheduleOverrides: [] },
						date,
						shiftTypeById,
				  )
				: null;
		const effectiveShift =
			toShiftTypeSnapshot(row?.shiftSnapshot) ||
			toShiftTypeSnapshot(row?.shiftType || shiftTypeById.get(String(row?.shiftTypeId || ""))) ||
			null;
		return {
			...row,
			previousShift: toScheduleOverrideShiftSnapshot(previousShift),
			effectiveShift: effectiveShift
				? {
						...effectiveShift,
						scheduleOverrideId: row?.id || null,
				  }
				: null,
		};
	});
};

export const controller = (prisma: PrismaClient) => {
	const create = async (req: Request, res: Response, _next: NextFunction) => {
		let requestData = req.body;
		const contentType = req.get("Content-Type") || "";

		if (
			contentType.includes("application/x-www-form-urlencoded") ||
			contentType.includes("multipart/form-data")
		) {
			scheduleOverrideLogger.info("Original form data:", JSON.stringify(req.body, null, 2));
			requestData = transformFormDataToObject(req.body);
			scheduleOverrideLogger.info(
				"Transformed form data to object structure:",
				JSON.stringify(requestData, null, 2),
			);
		}

		if (!requestData?.organizationId) {
			requestData = {
				...requestData,
				organizationId:
					(req as any).organizationId ||
					(req as any)?.user?.organizationId ||
					(req as any)?.metadata?.organizationId ||
					null,
			};
		}

		const validation = CreateScheduleOverrideSchema.safeParse(requestData);
		if (!validation.success) {
			const formattedErrors = formatZodErrors(validation.error.format());
			scheduleOverrideLogger.error(`Validation failed: ${JSON.stringify(formattedErrors)}`);
			const errorResponse = buildErrorResponse("Validation failed", 400, formattedErrors);
			res.status(400).json(errorResponse);
			return;
		}

		try {
			const normalizedDate = normalizeToStartOfUtcDay(validation.data.date as Date);
			const shiftType = (validation.data as any).shiftTypeId
				? await prisma.shiftType.findFirst({
						where: {
							id: (validation.data as any).shiftTypeId,
							organizationId: validation.data.organizationId,
							isDeleted: false,
						},
				  })
				: null;
			if ((validation.data as any).shiftTypeId && !shiftType) {
				const errorResponse = buildErrorResponse("Requested shift type was not found.", 400);
				res.status(400).json(errorResponse);
				return;
			}
			const shiftSnapshot = normalizeOverrideShiftSnapshot(
				(validation.data as any).shiftSnapshot,
				shiftType,
			);
			if (!(validation.data as any).shiftTypeId && !shiftSnapshot) {
				const errorResponse = buildErrorResponse(
					"Schedule override requires a shift type or shift snapshot.",
					400,
				);
				res.status(400).json(errorResponse);
				return;
			}
			const payload = {
				...(validation.data as any),
				date: normalizedDate,
				shiftTypeId: shiftType?.id || null,
				shiftSnapshot: shiftSnapshot as Prisma.InputJsonValue,
				createdByEmployeeId:
					(validation.data as any).createdByEmployeeId ||
					(req as any).metadata?.employee?.id ||
					null,
				isDeleted: false,
			};
			const uniqueKey = {
				organizationId: payload.organizationId,
				employeeId: payload.employeeId,
				date: normalizedDate,
			};

			const existingScheduleOverride = await prisma.scheduleOverride.findUnique({
				where: {
					organizationId_employeeId_date: uniqueKey,
				},
			});
			const isCreated = !existingScheduleOverride;

			const scheduleOverride = await prisma.scheduleOverride.upsert({
				where: {
					organizationId_employeeId_date: uniqueKey,
				},
				create: payload,
				update: {
					shiftTypeId: payload.shiftTypeId,
					shiftSnapshot: payload.shiftSnapshot,
					reason: payload.reason ?? null,
					createdByEmployeeId: payload.createdByEmployeeId ?? null,
					isDeleted: false,
				},
			});
			scheduleOverrideLogger.info(
				`ScheduleOverride ${isCreated ? "created" : "updated-via-create"} successfully: ${scheduleOverride.id}`,
			);
			await recomputeAttendanceObligationsForRange(prisma, {
				organizationId: scheduleOverride.organizationId,
				employeeId: scheduleOverride.employeeId,
				fromDate: scheduleOverride.date,
				toDate: scheduleOverride.date,
				reason: "ScheduleChanged",
			});

			logActivity(req, {
				userId: (req as any).user?.id || "unknown",
				action: isCreated
					? config.ACTIVITY_LOG.SCHEDULEOVERRIDE.ACTIONS.CREATE_SCHEDULEOVERRIDE
					: config.ACTIVITY_LOG.SCHEDULEOVERRIDE.ACTIONS.UPDATE_SCHEDULEOVERRIDE,
				description: `${isCreated ? config.ACTIVITY_LOG.SCHEDULEOVERRIDE.DESCRIPTIONS.SCHEDULEOVERRIDE_CREATED : config.ACTIVITY_LOG.SCHEDULEOVERRIDE.DESCRIPTIONS.SCHEDULEOVERRIDE_UPDATED} (via create endpoint): ${scheduleOverride.id}`,
				page: {
					url: req.originalUrl,
					title: config.ACTIVITY_LOG.SCHEDULEOVERRIDE.PAGES.SCHEDULEOVERRIDE_CREATION,
				},
			});

			logAudit(req, {
				userId: (req as any).user?.id || "unknown",
				action: isCreated ? config.AUDIT_LOG.ACTIONS.CREATE : config.AUDIT_LOG.ACTIONS.UPDATE,
				resource: config.AUDIT_LOG.RESOURCES.SCHEDULEOVERRIDE,
				severity: config.AUDIT_LOG.SEVERITY.LOW,
				entityType: config.AUDIT_LOG.ENTITY_TYPES.SCHEDULEOVERRIDE,
				entityId: scheduleOverride.id,
				changesBefore: isCreated
					? null
					: {
							id: existingScheduleOverride?.id,
							organizationId: existingScheduleOverride?.organizationId,
							employeeId: existingScheduleOverride?.employeeId,
							date: existingScheduleOverride?.date,
							shiftTypeId: existingScheduleOverride?.shiftTypeId,
							reason: existingScheduleOverride?.reason,
					  },
				changesAfter: {
					id: scheduleOverride.id,
					organizationId: scheduleOverride.organizationId,
					employeeId: scheduleOverride.employeeId,
					date: scheduleOverride.date,
					shiftTypeId: scheduleOverride.shiftTypeId,
					reason: scheduleOverride.reason,
					createdAt: scheduleOverride.createdAt,
					updatedAt: scheduleOverride.updatedAt,
				},
				description: `${isCreated ? config.AUDIT_LOG.SCHEDULEOVERRIDE.DESCRIPTIONS.SCHEDULEOVERRIDE_CREATED : config.AUDIT_LOG.SCHEDULEOVERRIDE.DESCRIPTIONS.SCHEDULEOVERRIDE_UPDATED} (via create endpoint): ${scheduleOverride.id}`,
			});

			try {
				await invalidateCache.byPattern("cache:scheduleOverride:list:*");
				await invalidateCache.byPattern(`cache:scheduleOverride:byId:${scheduleOverride.id}:*`);
				await invalidateCache.byPattern("cache:employee:*");
				await invalidateCache.byPattern("cache:attendance:*");
				await invalidateCache.byPattern("cache:timesheet:*");
				await invalidateCache.byPattern("cache:metrics:*");
				scheduleOverrideLogger.info(
					`ScheduleOverride and related employee cache invalidated after ${isCreated ? "creation" : "upsert update"}`,
				);
			} catch (cacheError) {
				scheduleOverrideLogger.warn(
					"Failed to invalidate cache after scheduleOverride creation:",
					cacheError,
				);
			}

			const successResponse = buildSuccessResponse(
				isCreated
					? config.SUCCESS.SCHEDULEOVERRIDE.CREATED
					: config.SUCCESS.SCHEDULEOVERRIDE.UPDATED,
				scheduleOverride,
				isCreated ? 201 : 200,
			);
			res.status(isCreated ? 201 : 200).json(successResponse);
		} catch (error) {
			scheduleOverrideLogger.error(`${config.ERROR.SCHEDULEOVERRIDE.CREATE_FAILED}: ${error}`);
			const prismaErrorCode = (error as any)?.code;
			if (prismaErrorCode === "P2002") {
				const errorResponse = buildErrorResponse(
					"Duplicate schedule override detected for the same employee and date.",
					409,
				);
				res.status(409).json(errorResponse);
				return;
			}
			if (prismaErrorCode === "P2003" || prismaErrorCode === "P2025") {
				const errorResponse = buildErrorResponse(
					"Invalid schedule override reference data.",
					400,
				);
				res.status(400).json(errorResponse);
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
		const validationResult = validateQueryParams(req, scheduleOverrideLogger);

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

		scheduleOverrideLogger.info(
			`Getting scheduleOverrides, page: ${page}, limit: ${limit}, query: ${query}, order: ${order}, groupBy: ${groupBy}`,
		);

		try {
			// Base where clause
			const whereClause: Prisma.ScheduleOverrideWhereInput = {
				isDeleted: false,
			};

			// search fields sample ("name", "description", "type")
			const searchFields = ["name", "description", "type"];
			if (query) {
				const searchConditions = buildSearchConditions("ScheduleOverride", query, searchFields);
				if (searchConditions.length > 0) {
					whereClause.OR = searchConditions;
				}
			}

			if (filter) {
				const filterConditions = buildFilterConditions("ScheduleOverride", filter);
				if (filterConditions.length > 0) {
					whereClause.AND = filterConditions;
				}
			}
			const findManyQuery = buildFindManyQuery(whereClause, skip, limit, order, sort, fields);
			if (!fields) {
				findManyQuery.include = {
					...(findManyQuery.include || {}),
					shiftType: true,
					createdByEmployee: {
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
				delete findManyQuery.select;
			}

			const [scheduleOverrides, total] = await Promise.all([
				document ? prisma.scheduleOverride.findMany(findManyQuery) : [],
				count ? prisma.scheduleOverride.count({ where: whereClause }) : 0,
			]);
			const requestOrganizationId =
				(req as any).organizationId ||
				(req as any)?.user?.organizationId ||
				(req as any).metadata?.organizationId ||
				(scheduleOverrides[0] as any)?.organizationId ||
				null;
			const enrichedScheduleOverrides = document
				? await enrichScheduleOverridesWithShiftChange(
						prisma,
						requestOrganizationId,
						scheduleOverrides as any[],
				  )
				: [];

			scheduleOverrideLogger.info(`Retrieved ${scheduleOverrides.length} scheduleOverrides`);
			const processedData =
				groupBy && document
					? groupDataByField(enrichedScheduleOverrides, groupBy as string)
					: enrichedScheduleOverrides;

			const responseData: Record<string, any> = {
				...(document && { scheduleOverrides: processedData }),
				...(count && { count: total }),
				...(pagination && { pagination: buildPagination(total, page, limit) }),
				...(groupBy && { groupedBy: groupBy }),
			};

			res.status(200).json(
				buildSuccessResponse(config.SUCCESS.SCHEDULEOVERRIDE.RETRIEVED_ALL, responseData, 200),
			);
		} catch (error) {
			scheduleOverrideLogger.error(`${config.ERROR.SCHEDULEOVERRIDE.GET_ALL_FAILED}: ${error}`);
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
				scheduleOverrideLogger.error(config.ERROR.QUERY_PARAMS.MISSING_ID);
				const errorResponse = buildErrorResponse(config.ERROR.QUERY_PARAMS.MISSING_ID, 400);
				res.status(400).json(errorResponse);
				return;
			}

			if (fields && typeof fields !== "string") {
				scheduleOverrideLogger.error(`${config.ERROR.QUERY_PARAMS.INVALID_POPULATE}: ${fields}`);
				const errorResponse = buildErrorResponse(
					config.ERROR.QUERY_PARAMS.POPULATE_MUST_BE_STRING,
					400,
				);
				res.status(400).json(errorResponse);
				return;
			}

			scheduleOverrideLogger.info(`${config.SUCCESS.SCHEDULEOVERRIDE.GETTING_BY_ID}: ${id}`);

			const cacheKey = `cache:scheduleOverride:byId:${id}:${fields || "full"}`;
			let scheduleOverride = null;

			try {
				if (redisClient.isClientConnected()) {
					scheduleOverride = await redisClient.getJSON(cacheKey);
					if (scheduleOverride) {
						scheduleOverrideLogger.info(`ScheduleOverride ${id} retrieved from direct Redis cache`);
					}
				}
			} catch (cacheError) {
				scheduleOverrideLogger.warn(`Redis cache retrieval failed for scheduleOverride ${id}:`, cacheError);
			}

			if (!scheduleOverride) {
				const query: Prisma.ScheduleOverrideFindFirstArgs = {
					where: { id },
				};

				query.select = getNestedFields(fields);
				if (!fields) {
					delete query.select;
					query.include = {
						shiftType: true,
						createdByEmployee: {
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
				}

				scheduleOverride = await prisma.scheduleOverride.findFirst(query);

				if (scheduleOverride && redisClient.isClientConnected()) {
					try {
						await redisClient.setJSON(cacheKey, scheduleOverride, 3600);
						scheduleOverrideLogger.info(`ScheduleOverride ${id} stored in direct Redis cache`);
					} catch (cacheError) {
						scheduleOverrideLogger.warn(
							`Failed to store scheduleOverride ${id} in Redis cache:`,
							cacheError,
						);
					}
				}
			}

			if (!scheduleOverride) {
				scheduleOverrideLogger.error(`${config.ERROR.SCHEDULEOVERRIDE.NOT_FOUND}: ${id}`);
				const errorResponse = buildErrorResponse(config.ERROR.SCHEDULEOVERRIDE.NOT_FOUND, 404);
				res.status(404).json(errorResponse);
				return;
			}

			const [enrichedScheduleOverride] = await enrichScheduleOverridesWithShiftChange(
				prisma,
				(req as any).metadata?.organizationId ||
					(scheduleOverride as any)?.organizationId ||
					null,
				[scheduleOverride],
			);

			scheduleOverrideLogger.info(`${config.SUCCESS.SCHEDULEOVERRIDE.RETRIEVED}: ${(scheduleOverride as any).id}`);
			const successResponse = buildSuccessResponse(
				config.SUCCESS.SCHEDULEOVERRIDE.RETRIEVED,
				enrichedScheduleOverride || scheduleOverride,
				200,
			);
			res.status(200).json(successResponse);
		} catch (error) {
			scheduleOverrideLogger.error(`${config.ERROR.SCHEDULEOVERRIDE.ERROR_GETTING}: ${error}`);
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
				scheduleOverrideLogger.error(config.ERROR.QUERY_PARAMS.MISSING_ID);
				const errorResponse = buildErrorResponse(config.ERROR.QUERY_PARAMS.MISSING_ID, 400);
				res.status(400).json(errorResponse);
				return;
			}

			const validationResult = UpdateScheduleOverrideSchema.safeParse(req.body);

			if (!validationResult.success) {
				const formattedErrors = formatZodErrors(validationResult.error.format());
				scheduleOverrideLogger.error(`Validation failed: ${JSON.stringify(formattedErrors)}`);
				const errorResponse = buildErrorResponse("Validation failed", 400, formattedErrors);
				res.status(400).json(errorResponse);
				return;
			}

			if (Object.keys(req.body).length === 0) {
				scheduleOverrideLogger.error(config.ERROR.COMMON.NO_UPDATE_FIELDS);
				const errorResponse = buildErrorResponse(config.ERROR.COMMON.NO_UPDATE_FIELDS, 400);
				res.status(400).json(errorResponse);
				return;
			}

			const validatedData = validationResult.data;

			scheduleOverrideLogger.info(`Updating scheduleOverride: ${id}`);

			const existingScheduleOverride = await prisma.scheduleOverride.findFirst({
				where: { id },
			});

			if (!existingScheduleOverride) {
				scheduleOverrideLogger.error(`${config.ERROR.SCHEDULEOVERRIDE.NOT_FOUND}: ${id}`);
				const errorResponse = buildErrorResponse(config.ERROR.SCHEDULEOVERRIDE.NOT_FOUND, 404);
				res.status(404).json(errorResponse);
				return;
			}

			const nextShiftTypeId =
				(validatedData as any).shiftTypeId !== undefined
					? (validatedData as any).shiftTypeId
					: existingScheduleOverride.shiftTypeId;
			const nextShiftType = nextShiftTypeId
				? await prisma.shiftType.findFirst({
						where: {
							id: nextShiftTypeId,
							organizationId: existingScheduleOverride.organizationId,
							isDeleted: false,
						},
				  })
				: null;
			if (nextShiftTypeId && !nextShiftType) {
				const errorResponse = buildErrorResponse("Requested shift type was not found.", 400);
				res.status(400).json(errorResponse);
				return;
			}
			const shouldNormalizeShiftSnapshot =
				(validatedData as any).shiftSnapshot !== undefined ||
				(validatedData as any).shiftTypeId !== undefined;
			const nextShiftSnapshot = shouldNormalizeShiftSnapshot
				? normalizeOverrideShiftSnapshot(
						(validatedData as any).shiftSnapshot ??
							existingScheduleOverride.shiftSnapshot,
						nextShiftType,
				  )
				: undefined;
			if (
				shouldNormalizeShiftSnapshot &&
				!nextShiftTypeId &&
				!nextShiftSnapshot
			) {
				const errorResponse = buildErrorResponse(
					"Schedule override requires a shift type or shift snapshot.",
					400,
				);
				res.status(400).json(errorResponse);
				return;
			}

			const prismaData: Prisma.ScheduleOverrideUncheckedUpdateInput = {
				...((validatedData as any).date !== undefined
					? { date: normalizeToStartOfUtcDay((validatedData as any).date as Date) }
					: {}),
				...((validatedData as any).reason !== undefined
					? { reason: (validatedData as any).reason ?? null }
					: {}),
				...(shouldNormalizeShiftSnapshot
					? {
							shiftTypeId: nextShiftType?.id || null,
							shiftSnapshot: nextShiftSnapshot as Prisma.InputJsonValue,
					  }
					: {}),
				createdByEmployeeId:
					(validatedData as any).createdByEmployeeId ||
					(req as any).metadata?.employee?.id ||
					existingScheduleOverride.createdByEmployeeId ||
					null,
			};

			const updatedScheduleOverride = await prisma.scheduleOverride.update({
				where: { id },
				data: prismaData,
			});
			await recomputeAttendanceObligationsForRange(prisma, {
				organizationId: updatedScheduleOverride.organizationId,
				employeeId: updatedScheduleOverride.employeeId,
				fromDate: updatedScheduleOverride.date,
				toDate: updatedScheduleOverride.date,
				reason: "ScheduleOverrideUpdated",
			});
			try {
				await invalidateCache.byPattern(`cache:scheduleOverride:byId:${id}:*`);
				await invalidateCache.byPattern("cache:scheduleOverride:list:*");
				await invalidateCache.byPattern("cache:employee:*");
				await invalidateCache.byPattern("cache:attendance:*");
				await invalidateCache.byPattern("cache:timesheet:*");
				await invalidateCache.byPattern("cache:metrics:*");
				scheduleOverrideLogger.info(`Cache invalidated after scheduleOverride ${id} update`);
			} catch (cacheError) {
				scheduleOverrideLogger.warn(
					"Failed to invalidate cache after scheduleOverride update:",
					cacheError,
				);
			}

			scheduleOverrideLogger.info(`${config.SUCCESS.SCHEDULEOVERRIDE.UPDATED}: ${updatedScheduleOverride.id}`);
			const successResponse = buildSuccessResponse(
				config.SUCCESS.SCHEDULEOVERRIDE.UPDATED,
				{ scheduleOverride: updatedScheduleOverride },
				200,
			);
			res.status(200).json(successResponse);
		} catch (error) {
			scheduleOverrideLogger.error(`${config.ERROR.SCHEDULEOVERRIDE.ERROR_UPDATING}: ${error}`);
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
				scheduleOverrideLogger.error(config.ERROR.QUERY_PARAMS.MISSING_ID);
				const errorResponse = buildErrorResponse(config.ERROR.QUERY_PARAMS.MISSING_ID, 400);
				res.status(400).json(errorResponse);
				return;
			}

			scheduleOverrideLogger.info(`${config.SUCCESS.SCHEDULEOVERRIDE.DELETED}: ${id}`);

			const existingScheduleOverride = await prisma.scheduleOverride.findFirst({
				where: { id },
			});

			if (!existingScheduleOverride) {
				scheduleOverrideLogger.error(`${config.ERROR.SCHEDULEOVERRIDE.NOT_FOUND}: ${id}`);
				const errorResponse = buildErrorResponse(config.ERROR.SCHEDULEOVERRIDE.NOT_FOUND, 404);
				res.status(404).json(errorResponse);
				return;
			}

			await prisma.scheduleOverride.delete({
				where: { id },
			});
			await recomputeAttendanceObligationsForRange(prisma, {
				organizationId: existingScheduleOverride.organizationId,
				employeeId: existingScheduleOverride.employeeId,
				fromDate: existingScheduleOverride.date,
				toDate: existingScheduleOverride.date,
				reason: "ScheduleOverrideDeleted",
			});
			try {
				await invalidateCache.byPattern(`cache:scheduleOverride:byId:${id}:*`);
				await invalidateCache.byPattern("cache:scheduleOverride:list:*");
				await invalidateCache.byPattern("cache:employee:*");
				await invalidateCache.byPattern("cache:attendance:*");
				await invalidateCache.byPattern("cache:timesheet:*");
				await invalidateCache.byPattern("cache:metrics:*");
				scheduleOverrideLogger.info(`Cache invalidated after scheduleOverride ${id} deletion`);
			} catch (cacheError) {
				scheduleOverrideLogger.warn(
					"Failed to invalidate cache after scheduleOverride deletion:",
					cacheError,
				);
			}

			scheduleOverrideLogger.info(`${config.SUCCESS.SCHEDULEOVERRIDE.DELETED}: ${id}`);
			const successResponse = buildSuccessResponse(config.SUCCESS.SCHEDULEOVERRIDE.DELETED, {}, 200);
			res.status(200).json(successResponse);
		} catch (error) {
			scheduleOverrideLogger.error(`${config.ERROR.SCHEDULEOVERRIDE.DELETE_FAILED}: ${error}`);
			const errorResponse = buildErrorResponse(
				config.ERROR.COMMON.INTERNAL_SERVER_ERROR,
				500,
			);
			res.status(500).json(errorResponse);
		}
	};

	return { create, getAll, getById, update, remove };
};
