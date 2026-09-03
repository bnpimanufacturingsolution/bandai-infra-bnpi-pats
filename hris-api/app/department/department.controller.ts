// @ts-nocheck
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
import { CreateDepartmentSchema, UpdateDepartmentSchema } from "../../zod/department.zod";
import { logActivity } from "../../utils/activityLogger";
import { logAudit } from "../../utils/auditLogger";
import { config } from "../../config/constant";
import { redisClient } from "../../config/redis";
import { invalidateCache } from "../../middleware/cache";
import { replaceDepartmentScheduleLinks } from "../../helper/department-schedule.helper";
import * as XLSX from "xlsx";
import { AuthRequest } from "../../middleware/verifyToken";
import { suggestUniqueConfigCode } from "../../helper/config-code.helper";

const logger = getLogger();
const departmentLogger = logger.child({ module: "department" });

export const controller = (prisma: PrismaClient) => {
	const normalizeDepartmentSchedulePayload = (department: any, links: any[] = []) => {
		const normalizedLinks = Array.isArray(links) ? links : [];
		const defaultLink =
			normalizedLinks.find(
				(link) => link?.source === "department_default" && link?.isActive,
			) ||
			normalizedLinks.find((link) => link?.isActive) ||
			null;
		const scheduleId = defaultLink?.scheduleTemplateId || null;
		const scheduleTemplate = defaultLink?.scheduleTemplate || null;
		const scheduleIds = normalizedLinks
			.map((link) => link?.scheduleTemplateId)
			.filter((value: string | null | undefined): value is string => !!value);

		return {
			...department,
			scheduleId,
			scheduleIds,
			scheduleTemplate,
			schedules: normalizedLinks,
			scheduleTemplates: normalizedLinks,
		};
	};

	const attachDepartmentSchedules = async (department: any) => {
		if (!department?.id) return department;
		const links = await (prisma as any).departmentScheduleTemplate?.findMany?.({
			where: {
				organizationId: department.organizationId,
				departmentId: department.id,
				isDeleted: false,
			},
			include: {
				scheduleTemplate: {
					select: {
						id: true,
						name: true,
						code: true,
					},
				},
			},
			orderBy: [{ createdAt: "asc" }],
		});

		return normalizeDepartmentSchedulePayload(department, Array.isArray(links) ? links : []);
	};

	const attachDepartmentSchedulesList = async (departments: any[]) => {
		if (!Array.isArray(departments) || departments.length === 0) return departments;
		const organizationIds = Array.from(
			new Set(departments.map((department) => department.organizationId).filter(Boolean)),
		);
		const departmentIds = departments.map((department) => department.id).filter(Boolean);

		const links = await (prisma as any).departmentScheduleTemplate?.findMany?.({
			where: {
				organizationId:
					organizationIds.length === 1 ? organizationIds[0] : { in: organizationIds },
				departmentId: { in: departmentIds },
				isDeleted: false,
			},
			include: {
				scheduleTemplate: {
					select: {
						id: true,
						name: true,
						code: true,
					},
				},
			},
			orderBy: [{ createdAt: "asc" }],
		});

		const linksByDepartmentId = new Map<string, any[]>();
		for (const link of Array.isArray(links) ? links : []) {
			const items = linksByDepartmentId.get(link.departmentId) || [];
			items.push(link);
			linksByDepartmentId.set(link.departmentId, items);
		}

		return departments.map((department) => ({
			...normalizeDepartmentSchedulePayload(
				department,
				linksByDepartmentId.get(department.id) || [],
			),
		}));
	};

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
					const existingDepartment = await prisma.department.findUnique({
						where: {
							organizationId_code: {
								organizationId,
								code: candidateCode,
							},
						},
						select: { id: true },
					});
					return Boolean(existingDepartment);
				},
			});

			const successResponse = buildSuccessResponse(
				"Department code generated successfully",
				suggestion,
				200,
			);
			res.status(200).json(successResponse);
		} catch (error) {
			departmentLogger.error(`Department generateCode failed: ${error}`);
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
			departmentLogger.info("Original form data:", JSON.stringify(req.body, null, 2));
			requestData = transformFormDataToObject(req.body);
			departmentLogger.info(
				"Transformed form data to object structure:",
				JSON.stringify(requestData, null, 2),
			);
		}

		const validation = CreateDepartmentSchema.safeParse(requestData);
		if (!validation.success) {
			const formattedErrors = formatZodErrors(validation.error.format());
			departmentLogger.error(`Validation failed: ${JSON.stringify(formattedErrors)}`);
			const errorResponse = buildErrorResponse("Validation failed", 400, formattedErrors);
			res.status(400).json(errorResponse);
			return;
		}

		try {
			const {
				scheduleId = null,
				scheduleIds = [],
				...departmentData
			} = validation.data as any;
			const normalizedScheduleIds = Array.from(
				new Set([scheduleId, ...scheduleIds].filter(Boolean)),
			);
			const department = await prisma.department.create({ data: departmentData });
			await replaceDepartmentScheduleLinks(prisma, {
				organizationId: department.organizationId,
				departmentId: department.id,
				defaultScheduleId: scheduleId,
				scheduleIds: normalizedScheduleIds,
			});
			const departmentWithSchedules = await attachDepartmentSchedules(department);
			departmentLogger.info(`Department created successfully: ${department.id}`);

			logActivity(req, {
				userId: (req as any).user?.id || "unknown",
				action: config.ACTIVITY_LOG.DEPARTMENT.ACTIONS.CREATE_DEPARTMENT,
				description: `${config.ACTIVITY_LOG.DEPARTMENT.DESCRIPTIONS.DEPARTMENT_CREATED}: ${department.name || department.id}`,
				page: {
					url: req.originalUrl,
					title: config.ACTIVITY_LOG.DEPARTMENT.PAGES.DEPARTMENT_CREATION,
				},
			});

			logAudit(req, {
				userId: (req as any).user?.id || "unknown",
				action: config.AUDIT_LOG.ACTIONS.CREATE,
				resource: config.AUDIT_LOG.RESOURCES.DEPARTMENT,
				severity: config.AUDIT_LOG.SEVERITY.LOW,
				entityType: config.AUDIT_LOG.ENTITY_TYPES.DEPARTMENT,
				entityId: department.id,
				changesBefore: null,
				changesAfter: {
					id: department.id,
					name: department.name,
					description: department.description,
					scheduleId,
					scheduleIds: normalizedScheduleIds,
					createdAt: department.createdAt,
					updatedAt: department.updatedAt,
				},
				description: `${config.AUDIT_LOG.DEPARTMENT.DESCRIPTIONS.DEPARTMENT_CREATED}: ${department.name || department.id}`,
			});

			try {
				await invalidateCache.byPattern("cache:department:list:*");
				await invalidateCache.byPattern("cache:scheduleTemplate:list:*");
				await invalidateCache.byPattern("cache:scheduleTemplate:byId:*");
				departmentLogger.info("Department list cache invalidated after creation");
			} catch (cacheError) {
				departmentLogger.warn(
					"Failed to invalidate cache after department creation:",
					cacheError,
				);
			}

			const successResponse = buildSuccessResponse(
				config.SUCCESS.DEPARTMENT.CREATED,
				departmentWithSchedules,
				201,
			);
			res.status(201).json(successResponse);
		} catch (error) {
			departmentLogger.error(`${config.ERROR.DEPARTMENT.CREATE_FAILED}: ${error}`);
			const errorResponse = buildErrorResponse(
				config.ERROR.COMMON.INTERNAL_SERVER_ERROR,
				500,
			);
			res.status(500).json(errorResponse);
		}
	};
	const getAll = async (req: Request, res: Response, _next: NextFunction) => {
		const validationResult = validateQueryParams(req, departmentLogger);

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

		departmentLogger.info(
			`Getting departments, page: ${page}, limit: ${limit}, query: ${query}, order: ${order}, groupBy: ${groupBy}`,
		);

		try {
			// Base where clause
			const whereClause: Prisma.DepartmentWhereInput = {
				isDeleted: false,
			};

			const searchFields = ["name", "code", "description"];
			if (query) {
				const searchConditions = buildSearchConditions("Department", query, searchFields);
				if (searchConditions.length > 0) {
					whereClause.OR = searchConditions;
				}
			}

			if (filter) {
				const filterConditions = buildFilterConditions("Department", filter);
				if (filterConditions.length > 0) {
					whereClause.AND = filterConditions;
				}
			}
			const findManyQuery = buildFindManyQuery(whereClause, skip, limit, order, sort, fields);

			const [departments, total] = await Promise.all([
				document ? prisma.department.findMany(findManyQuery) : [],
				count ? prisma.department.count({ where: whereClause }) : 0,
			]);
			const departmentsWithSchedules = document
				? await attachDepartmentSchedulesList(departments as any[])
				: departments;

			departmentLogger.info(`Retrieved ${departments.length} departments`);
			const processedData =
				groupBy && document
					? groupDataByField(departmentsWithSchedules, groupBy as string)
					: departmentsWithSchedules;

			const responseData: Record<string, any> = {
				...(document && { departments: processedData }),
				...(count && { count: total }),
				...(pagination && { pagination: buildPagination(total, page, limit) }),
				...(groupBy && { groupedBy: groupBy }),
			};

			res.status(200).json(
				buildSuccessResponse(config.SUCCESS.DEPARTMENT.RETRIEVED_ALL, responseData, 200),
			);
		} catch (error) {
			departmentLogger.error(`${config.ERROR.DEPARTMENT.GET_ALL_FAILED}: ${error}`);
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
				departmentLogger.error(config.ERROR.QUERY_PARAMS.MISSING_ID);
				const errorResponse = buildErrorResponse(config.ERROR.QUERY_PARAMS.MISSING_ID, 400);
				res.status(400).json(errorResponse);
				return;
			}

			if (fields && typeof fields !== "string") {
				departmentLogger.error(`${config.ERROR.QUERY_PARAMS.INVALID_POPULATE}: ${fields}`);
				const errorResponse = buildErrorResponse(
					config.ERROR.QUERY_PARAMS.POPULATE_MUST_BE_STRING,
					400,
				);
				res.status(400).json(errorResponse);
				return;
			}

			departmentLogger.info(`${config.SUCCESS.DEPARTMENT.GETTING_BY_ID}: ${id}`);

			const cacheKey = `cache:department:byId:${id}:${fields || "full"}`;
			let department = null;

			try {
				if (redisClient.isClientConnected()) {
					department = await redisClient.getJSON(cacheKey);
					if (department) {
						departmentLogger.info(`Department ${id} retrieved from direct Redis cache`);
					}
				}
			} catch (cacheError) {
				departmentLogger.warn(
					`Redis cache retrieval failed for department ${id}:`,
					cacheError,
				);
			}

			if (!department) {
				const query: Prisma.DepartmentFindFirstArgs = {
					where: { id },
				};

				query.select = getNestedFields(fields);

				department = await prisma.department.findFirst(query);
				department = await attachDepartmentSchedules(department);

				if (department && redisClient.isClientConnected()) {
					try {
						await redisClient.setJSON(cacheKey, department, 3600);
						departmentLogger.info(`Department ${id} stored in direct Redis cache`);
					} catch (cacheError) {
						departmentLogger.warn(
							`Failed to store department ${id} in Redis cache:`,
							cacheError,
						);
					}
				}
			}

			if (!department) {
				departmentLogger.error(`${config.ERROR.DEPARTMENT.NOT_FOUND}: ${id}`);
				const errorResponse = buildErrorResponse(config.ERROR.DEPARTMENT.NOT_FOUND, 404);
				res.status(404).json(errorResponse);
				return;
			}

			departmentLogger.info(
				`${config.SUCCESS.DEPARTMENT.RETRIEVED}: ${(department as any).id}`,
			);
			const successResponse = buildSuccessResponse(
				config.SUCCESS.DEPARTMENT.RETRIEVED,
				department,
				200,
			);
			res.status(200).json(successResponse);
		} catch (error) {
			departmentLogger.error(`${config.ERROR.DEPARTMENT.ERROR_GETTING}: ${error}`);
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
				departmentLogger.error(config.ERROR.QUERY_PARAMS.MISSING_ID);
				const errorResponse = buildErrorResponse(config.ERROR.QUERY_PARAMS.MISSING_ID, 400);
				res.status(400).json(errorResponse);
				return;
			}

			const validationResult = UpdateDepartmentSchema.safeParse(req.body);

			if (!validationResult.success) {
				const formattedErrors = formatZodErrors(validationResult.error.format());
				departmentLogger.error(`Validation failed: ${JSON.stringify(formattedErrors)}`);
				const errorResponse = buildErrorResponse("Validation failed", 400, formattedErrors);
				res.status(400).json(errorResponse);
				return;
			}

			if (Object.keys(req.body).length === 0) {
				departmentLogger.error(config.ERROR.COMMON.NO_UPDATE_FIELDS);
				const errorResponse = buildErrorResponse(config.ERROR.COMMON.NO_UPDATE_FIELDS, 400);
				res.status(400).json(errorResponse);
				return;
			}

			const validatedData = validationResult.data as any;

			departmentLogger.info(`Updating department: ${id}`);

			const existingDepartment = await prisma.department.findFirst({
				where: { id },
			});

			if (!existingDepartment) {
				departmentLogger.error(`${config.ERROR.DEPARTMENT.NOT_FOUND}: ${id}`);
				const errorResponse = buildErrorResponse(config.ERROR.DEPARTMENT.NOT_FOUND, 404);
				res.status(404).json(errorResponse);
				return;
			}

			const { scheduleId, scheduleIds, ...prismaData } = validatedData;
			const existingDepartmentWithSchedules =
				await attachDepartmentSchedules(existingDepartment);
			const normalizedScheduleIds = Array.from(
				new Set(
					[
						(scheduleId !== undefined
							? scheduleId
							: existingDepartmentWithSchedules?.scheduleId) || null,
						...(Array.isArray(scheduleIds)
							? scheduleIds
							: (existingDepartmentWithSchedules as any)?.scheduleIds || []),
					].filter(Boolean),
				),
			);

			const updatedDepartment = await prisma.department.update({
				where: { id },
				data: prismaData,
			});
			await replaceDepartmentScheduleLinks(prisma, {
				organizationId: updatedDepartment.organizationId,
				departmentId: updatedDepartment.id,
				defaultScheduleId:
					scheduleId !== undefined
						? scheduleId
						: existingDepartmentWithSchedules?.scheduleId || null,
				scheduleIds: normalizedScheduleIds,
			});
			const updatedDepartmentWithSchedules =
				await attachDepartmentSchedules(updatedDepartment);

			try {
				await invalidateCache.byPattern(`cache:department:byId:${id}:*`);
				await invalidateCache.byPattern("cache:department:list:*");
				await invalidateCache.byPattern("cache:scheduleTemplate:list:*");
				await invalidateCache.byPattern("cache:scheduleTemplate:byId:*");
				departmentLogger.info(`Cache invalidated after department ${id} update`);
			} catch (cacheError) {
				departmentLogger.warn(
					"Failed to invalidate cache after department update:",
					cacheError,
				);
			}

			departmentLogger.info(`${config.SUCCESS.DEPARTMENT.UPDATED}: ${updatedDepartment.id}`);
			const successResponse = buildSuccessResponse(
				config.SUCCESS.DEPARTMENT.UPDATED,
				{ department: updatedDepartmentWithSchedules },
				200,
			);
			res.status(200).json(successResponse);
		} catch (error) {
			departmentLogger.error(`${config.ERROR.DEPARTMENT.ERROR_UPDATING}: ${error}`);
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
				departmentLogger.error(config.ERROR.QUERY_PARAMS.MISSING_ID);
				const errorResponse = buildErrorResponse(config.ERROR.QUERY_PARAMS.MISSING_ID, 400);
				res.status(400).json(errorResponse);
				return;
			}

			departmentLogger.info(`${config.SUCCESS.DEPARTMENT.DELETED}: ${id}`);

			const existingDepartment = await prisma.department.findFirst({
				where: { id },
			});

			if (!existingDepartment) {
				departmentLogger.error(`${config.ERROR.DEPARTMENT.NOT_FOUND}: ${id}`);
				const errorResponse = buildErrorResponse(config.ERROR.DEPARTMENT.NOT_FOUND, 404);
				res.status(404).json(errorResponse);
				return;
			}

			await prisma.department.delete({
				where: { id },
			});

			try {
				await invalidateCache.byPattern(`cache:department:byId:${id}:*`);
				await invalidateCache.byPattern("cache:department:list:*");
				departmentLogger.info(`Cache invalidated after department ${id} deletion`);
			} catch (cacheError) {
				departmentLogger.warn(
					"Failed to invalidate cache after department deletion:",
					cacheError,
				);
			}

			departmentLogger.info(`${config.SUCCESS.DEPARTMENT.DELETED}: ${id}`);
			const successResponse = buildSuccessResponse(
				config.SUCCESS.DEPARTMENT.DELETED,
				{},
				200,
			);
			res.status(200).json(successResponse);
		} catch (error) {
			departmentLogger.error(`${config.ERROR.DEPARTMENT.DELETE_FAILED}: ${error}`);
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
				const errorResponse = buildErrorResponse("No file uploaded", 400);
				res.status(400).json(errorResponse);
				return;
			}

			const organizationId = req.organizationId;
			if (!organizationId) {
				const errorResponse = buildErrorResponse(
					"Organization ID not found in authentication token",
					401,
				);
				res.status(401).json(errorResponse);
				return;
			}

			departmentLogger.info(
				`Starting department import for organization ${organizationId}, file: ${file.originalname}`,
			);

			const workbook = XLSX.read(file.buffer, { type: "buffer" });
			const sheetName = workbook.SheetNames[0];
			const worksheet = workbook.Sheets[sheetName];
			const rawData = XLSX.utils.sheet_to_json(worksheet, { raw: true, defval: null });

			if (!rawData || rawData.length === 0) {
				const errorResponse = buildErrorResponse("Excel file is empty or invalid", 400);
				res.status(400).json(errorResponse);
				return;
			}

			departmentLogger.info(`Parsed ${rawData.length} rows from Excel file`);

			const schedules = await prisma.scheduleTemplate.findMany({
				where: {
					organizationId,
					isDeleted: false,
				},
				select: {
					id: true,
					code: true,
					name: true,
				},
			});

			const scheduleIdByCode = new Map<string, string>();
			const scheduleIdByName = new Map<string, string>();
			for (const schedule of schedules) {
				const normalizedCode = String(schedule.code || "")
					.trim()
					.toLowerCase();
				const normalizedName = String(schedule.name || "")
					.trim()
					.toLowerCase();

				if (normalizedCode && !scheduleIdByCode.has(normalizedCode)) {
					scheduleIdByCode.set(normalizedCode, schedule.id);
				}
				if (normalizedName && !scheduleIdByName.has(normalizedName)) {
					scheduleIdByName.set(normalizedName, schedule.id);
				}
			}

			const results = {
				created: 0,
				updated: 0,
				skipped: 0,
				errors: [] as string[],
			};

			const parseOptionalBoolean = (value: unknown): boolean | null => {
				if (value === undefined || value === null || value === "") {
					return null;
				}

				if (typeof value === "boolean") {
					return value;
				}

				const normalized = String(value).trim().toLowerCase();
				if (["true", "1", "yes", "y"].includes(normalized)) {
					return true;
				}
				if (["false", "0", "no", "n"].includes(normalized)) {
					return false;
				}
				return null;
			};

			for (const row of rawData) {
				try {
					const rowData = row as any;
					const code = String(rowData.CODE || "").trim();
					const name = String(rowData.NAME || "").trim();
					const description = String(rowData.DESCRIPTION || "").trim();
					const scheduleCode = String(rowData.SCHEDULE_CODE || "").trim();
					const scheduleName = String(rowData.SCHEDULE_NAME || "").trim();
					const scheduleValue = String(rowData.SCHEDULE || "").trim();
					const isHr = parseOptionalBoolean(
						rowData.IS_HR ?? rowData.isHr ?? rowData["HR Department"] ?? "",
					);

					if (!code || !name) {
						results.skipped++;
						results.errors.push(`Row missing CODE or NAME`);
						continue;
					}

					let scheduleId: string | null = null;
					const normalizedScheduleCode = scheduleCode.toLowerCase();
					const normalizedScheduleName = scheduleName.toLowerCase();
					const normalizedScheduleValue = scheduleValue.toLowerCase();

					if (normalizedScheduleCode) {
						scheduleId = scheduleIdByCode.get(normalizedScheduleCode) || null;
					}

					if (!scheduleId && normalizedScheduleName) {
						scheduleId = scheduleIdByName.get(normalizedScheduleName) || null;
					}

					if (!scheduleId && normalizedScheduleValue) {
						scheduleId =
							scheduleIdByCode.get(normalizedScheduleValue) ||
							scheduleIdByName.get(normalizedScheduleValue) ||
							null;
					}

					if ((scheduleCode || scheduleName || scheduleValue) && !scheduleId) {
						results.skipped++;
						const errorMsg = `Row ${code}: schedule not found (${scheduleCode || scheduleName || scheduleValue})`;
						results.errors.push(errorMsg);
						departmentLogger.warn(errorMsg);
						continue;
					}

					// Check if department already exists by either source code or unique name.
					const existingDepartment =
						(await prisma.department.findUnique({
							where: {
								organizationId_code: { organizationId, code },
							},
						})) ||
						(await prisma.department.findUnique({
							where: {
								organizationId_name: { organizationId, name },
							},
						}));

					if (existingDepartment) {
						// Update existing
						const updatedDepartment = await prisma.department.update({
							where: { id: existingDepartment.id },
							data: {
								code,
								name,
								description: description || null,
								...(isHr !== null ? { isHr } : {}),
								isDeleted: false,
								isActive: true,
							},
						});
						await replaceDepartmentScheduleLinks(prisma, {
							organizationId,
							departmentId: updatedDepartment.id,
							defaultScheduleId: scheduleId || null,
							scheduleIds: scheduleId ? [scheduleId] : [],
						});
						results.updated++;
						departmentLogger.info(`Updated department: ${code}`);
					} else {
						// Create new
						const createdDepartment = await prisma.department.create({
							data: {
								organizationId,
								code,
								name,
								description: description || null,
								isHr: isHr ?? false,
								isActive: true,
							},
						});
						await replaceDepartmentScheduleLinks(prisma, {
							organizationId,
							departmentId: createdDepartment.id,
							defaultScheduleId: scheduleId || null,
							scheduleIds: scheduleId ? [scheduleId] : [],
						});
						results.created++;
						departmentLogger.info(`Created department: ${code}`);
					}
				} catch (error) {
					results.skipped++;
					const errorMsg = `Error processing row: ${error}`;
					results.errors.push(errorMsg);
					departmentLogger.error(errorMsg);
				}
			}

			// Invalidate cache
			try {
				await invalidateCache.byPattern("cache:department:*");
				departmentLogger.info("Department cache invalidated after import");
			} catch (cacheError) {
				departmentLogger.warn("Failed to invalidate cache after import:", cacheError);
			}

			departmentLogger.info(
				`Import completed: ${results.created} created, ${results.updated} updated, ${results.skipped} skipped`,
			);

			const responseData = {
				summary: {
					totalRows: rawData.length,
					created: results.created,
					updated: results.updated,
					skipped: results.skipped,
					errors: results.errors.slice(0, 10),
				},
			};

			const successResponse = buildSuccessResponse(
				"Department import completed",
				responseData,
				200,
			);
			res.status(200).json(successResponse);
		} catch (error) {
			departmentLogger.error(`Error importing departments from XLSX: ${error}`);
			const errorResponse = buildErrorResponse(
				`Failed to import departments: ${error instanceof Error ? error.message : String(error)}`,
				500,
			);
			res.status(500).json(errorResponse);
		}
	};

	return { generateCode, create, getAll, getById, update, remove, importFromXLSX };
};
