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
import { CreateSectionSchema, UpdateSectionSchema } from "../../zod/section.zod";
import { logActivity } from "../../utils/activityLogger";
import { logAudit } from "../../utils/auditLogger";
import { config } from "../../config/constant";
import { redisClient } from "../../config/redis";
import { invalidateCache } from "../../middleware/cache";
import * as XLSX from "xlsx";
import { AuthRequest } from "../../middleware/verifyToken";
import { suggestUniqueConfigCode } from "../../helper/config-code.helper";

const logger = getLogger();
const sectionLogger = logger.child({ module: "section" });

export const controller = (prisma: PrismaClient) => {
	const assertScheduleTemplateInOrganization = async (
		scheduleId: string | null | undefined,
		organizationId: string | null | undefined,
	) => {
		if (!scheduleId) return true;
		if (!organizationId) return false;
		const scheduleTemplate = await prisma.scheduleTemplate.findFirst({
			where: {
				id: scheduleId,
				organizationId,
				isDeleted: false,
			},
			select: { id: true },
		});
		return Boolean(scheduleTemplate);
	};

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
					const existingSection = await prisma.section.findUnique({
						where: {
							organizationId_code: {
								organizationId,
								code: candidateCode,
							},
						},
						select: { id: true },
					});
					return Boolean(existingSection);
				},
			});

			res.status(200).json(
				buildSuccessResponse("Section code generated successfully", suggestion, 200),
			);
		} catch (error) {
			sectionLogger.error(`Section generateCode failed: ${error}`);
			res.status(500).json(buildErrorResponse(config.ERROR.COMMON.INTERNAL_SERVER_ERROR, 500));
		}
	};

	const create = async (req: Request, res: Response, _next: NextFunction) => {
		let requestData = req.body;
		const organizationId = (req as any).organizationId;
		const contentType = req.get("Content-Type") || "";

		if (
			contentType.includes("application/x-www-form-urlencoded") ||
			contentType.includes("multipart/form-data")
		) {
			sectionLogger.info("Original form data:", JSON.stringify(req.body, null, 2));
			requestData = transformFormDataToObject(req.body);
			sectionLogger.info(
				"Transformed form data to object structure:",
				JSON.stringify(requestData, null, 2),
			);
		}
		if (organizationId) {
			requestData = { ...requestData, organizationId };
		}

		const validation = CreateSectionSchema.safeParse(requestData);
		if (!validation.success) {
			const formattedErrors = formatZodErrors(validation.error.format());
			sectionLogger.error(`Validation failed: ${JSON.stringify(formattedErrors)}`);
			const errorResponse = buildErrorResponse("Validation failed", 400, formattedErrors);
			res.status(400).json(errorResponse);
			return;
		}

		try {
			if (
				!(await assertScheduleTemplateInOrganization(
					validation.data.scheduleId,
					validation.data.organizationId,
				))
			) {
				const errorResponse = buildErrorResponse(
					"Schedule template not found for this organization",
					400,
				);
				res.status(400).json(errorResponse);
				return;
			}

			const section = await prisma.section.create({
				data: validation.data as any,
				include: {
					department: { select: { id: true, name: true, code: true } },
					head: {
						select: {
							id: true,
							employeeId: true,
							person: { select: { personalInfo: true } },
						},
					},
					scheduleTemplate: { select: { id: true, name: true, code: true } },
				},
			});
			sectionLogger.info(`Section created successfully: ${section.id}`);

			logActivity(req, {
				userId: (req as any).user?.id || "unknown",
				action: config.ACTIVITY_LOG.SECTION.ACTIONS.CREATE_SECTION,
				description: `${config.ACTIVITY_LOG.SECTION.DESCRIPTIONS.SECTION_CREATED}: ${section.name || section.id}`,
				page: {
					url: req.originalUrl,
					title: config.ACTIVITY_LOG.SECTION.PAGES.SECTION_CREATION,
				},
			});

			logAudit(req, {
				userId: (req as any).user?.id || "unknown",
				action: config.AUDIT_LOG.ACTIONS.CREATE,
				resource: config.AUDIT_LOG.RESOURCES.SECTION,
				severity: config.AUDIT_LOG.SEVERITY.LOW,
				entityType: config.AUDIT_LOG.ENTITY_TYPES.SECTION,
				entityId: section.id,
				changesBefore: null,
				changesAfter: {
					id: section.id,
					name: section.name,
					description: section.description,
					scheduleId: section.scheduleId,
					isHr: section.isHr,
					createdAt: section.createdAt,
					updatedAt: section.updatedAt,
				},
				description: `${config.AUDIT_LOG.SECTION.DESCRIPTIONS.SECTION_CREATED}: ${section.name || section.id}`,
			});

			try {
				await invalidateCache.byPattern("cache:section:list:*");
				await invalidateCache.byPattern("cache:scheduleTemplate:list:*");
				await invalidateCache.byPattern("cache:scheduleTemplate:byId:*");
				sectionLogger.info("Section list cache invalidated after creation");
			} catch (cacheError) {
				sectionLogger.warn(
					"Failed to invalidate cache after section creation:",
					cacheError,
				);
			}

			const successResponse = buildSuccessResponse(
				config.SUCCESS.SECTION.CREATED,
				section,
				201,
			);
			res.status(201).json(successResponse);
		} catch (error) {
			sectionLogger.error(`${config.ERROR.SECTION.CREATE_FAILED}: ${error}`);
			const errorResponse = buildErrorResponse(
				config.ERROR.COMMON.INTERNAL_SERVER_ERROR,
				500,
			);
			res.status(500).json(errorResponse);
		}
	};
	const getAll = async (req: Request, res: Response, _next: NextFunction) => {
		const validationResult = validateQueryParams(req, sectionLogger);

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

		sectionLogger.info(
			`Getting sections, page: ${page}, limit: ${limit}, query: ${query}, order: ${order}, groupBy: ${groupBy}`,
		);

		try {
			const organizationId = (req as any).organizationId;
			// Base where clause
			const whereClause: Prisma.SectionWhereInput = {
				isDeleted: false,
				...(organizationId && { organizationId }),
			};

			const searchFields = ["name", "code", "description"];
			if (query) {
				const searchConditions = buildSearchConditions("Section", query, searchFields);
				if (searchConditions.length > 0) {
					whereClause.OR = searchConditions;
				}
			}

			if (filter) {
				const filterConditions = buildFilterConditions("Section", filter);
				if (filterConditions.length > 0) {
					whereClause.AND = filterConditions;
				}
			}
			const findManyQuery = buildFindManyQuery(
				whereClause,
				skip,
				limit,
				order,
				sort,
				fields,
				undefined,
				undefined,
				undefined,
				undefined,
				"Section",
			);

			const [sections, total] = await Promise.all([
				document ? prisma.section.findMany(findManyQuery) : [],
				count ? prisma.section.count({ where: whereClause }) : 0,
			]);

			sectionLogger.info(`Retrieved ${sections.length} sections`);
			const processedData =
				groupBy && document ? groupDataByField(sections, groupBy as string) : sections;

			const responseData: Record<string, any> = {
				...(document && { sections: processedData }),
				...(count && { count: total }),
				...(pagination && { pagination: buildPagination(total, page, limit) }),
				...(groupBy && { groupedBy: groupBy }),
			};

			res.status(200).json(
				buildSuccessResponse(config.SUCCESS.SECTION.RETRIEVED_ALL, responseData, 200),
			);
		} catch (error) {
			sectionLogger.error(`${config.ERROR.SECTION.GET_ALL_FAILED}: ${error}`);
			res.status(500).json(
				buildErrorResponse(config.ERROR.COMMON.INTERNAL_SERVER_ERROR, 500),
			);
		}
	};
	const getById = async (req: Request, res: Response, _next: NextFunction) => {
		const { id } = req.params;
		const { fields } = req.query;
		const organizationId = (req as any).organizationId;

		try {
			if (!id) {
				sectionLogger.error(config.ERROR.QUERY_PARAMS.MISSING_ID);
				const errorResponse = buildErrorResponse(config.ERROR.QUERY_PARAMS.MISSING_ID, 400);
				res.status(400).json(errorResponse);
				return;
			}

			if (fields && typeof fields !== "string") {
				sectionLogger.error(`${config.ERROR.QUERY_PARAMS.INVALID_POPULATE}: ${fields}`);
				const errorResponse = buildErrorResponse(
					config.ERROR.QUERY_PARAMS.POPULATE_MUST_BE_STRING,
					400,
				);
				res.status(400).json(errorResponse);
				return;
			}

			sectionLogger.info(`${config.SUCCESS.SECTION.GETTING_BY_ID}: ${id}`);

			const cacheKey = `cache:section:byId:${organizationId || "any"}:${id}:${fields || "full"}`;
			let section = null;

			try {
				if (redisClient.isClientConnected()) {
					section = await redisClient.getJSON(cacheKey);
					if (section) {
						sectionLogger.info(`Section ${id} retrieved from direct Redis cache`);
					}
				}
			} catch (cacheError) {
				sectionLogger.warn(`Redis cache retrieval failed for section ${id}:`, cacheError);
			}

			if (!section) {
				const query: Prisma.SectionFindFirstArgs = {
					where: { id, ...(organizationId && { organizationId }) },
				};

				query.select = getNestedFields(fields as string | undefined, {}, "Section");

				section = await prisma.section.findFirst(query);

				if (section && redisClient.isClientConnected()) {
					try {
						await redisClient.setJSON(cacheKey, section, 3600);
						sectionLogger.info(`Section ${id} stored in direct Redis cache`);
					} catch (cacheError) {
						sectionLogger.warn(
							`Failed to store section ${id} in Redis cache:`,
							cacheError,
						);
					}
				}
			}

			if (!section) {
				sectionLogger.error(`${config.ERROR.SECTION.NOT_FOUND}: ${id}`);
				const errorResponse = buildErrorResponse(config.ERROR.SECTION.NOT_FOUND, 404);
				res.status(404).json(errorResponse);
				return;
			}

			sectionLogger.info(`${config.SUCCESS.SECTION.RETRIEVED}: ${(section as any).id}`);
			const successResponse = buildSuccessResponse(
				config.SUCCESS.SECTION.RETRIEVED,
				section,
				200,
			);
			res.status(200).json(successResponse);
		} catch (error) {
			sectionLogger.error(`${config.ERROR.SECTION.ERROR_GETTING}: ${error}`);
			const errorResponse = buildErrorResponse(
				config.ERROR.COMMON.INTERNAL_SERVER_ERROR,
				500,
			);
			res.status(500).json(errorResponse);
		}
	};

	const update = async (req: Request, res: Response, _next: NextFunction) => {
		const { id } = req.params;
		const organizationId = (req as any).organizationId;

		try {
			if (!id) {
				sectionLogger.error(config.ERROR.QUERY_PARAMS.MISSING_ID);
				const errorResponse = buildErrorResponse(config.ERROR.QUERY_PARAMS.MISSING_ID, 400);
				res.status(400).json(errorResponse);
				return;
			}

			const validationResult = UpdateSectionSchema.safeParse(req.body);

			if (!validationResult.success) {
				const formattedErrors = formatZodErrors(validationResult.error.format());
				sectionLogger.error(`Validation failed: ${JSON.stringify(formattedErrors)}`);
				const errorResponse = buildErrorResponse("Validation failed", 400, formattedErrors);
				res.status(400).json(errorResponse);
				return;
			}

			if (Object.keys(req.body).length === 0) {
				sectionLogger.error(config.ERROR.COMMON.NO_UPDATE_FIELDS);
				const errorResponse = buildErrorResponse(config.ERROR.COMMON.NO_UPDATE_FIELDS, 400);
				res.status(400).json(errorResponse);
				return;
			}

			const validatedData = validationResult.data;

			sectionLogger.info(`Updating section: ${id}`);

			const existingSection = await prisma.section.findFirst({
				where: { id, ...(organizationId && { organizationId }) },
			});

			if (!existingSection) {
				sectionLogger.error(`${config.ERROR.SECTION.NOT_FOUND}: ${id}`);
				const errorResponse = buildErrorResponse(config.ERROR.SECTION.NOT_FOUND, 404);
				res.status(404).json(errorResponse);
				return;
			}

			const prismaData = { ...validatedData };

			if (
				!(await assertScheduleTemplateInOrganization(
					(prismaData as any).scheduleId,
					existingSection.organizationId,
				))
			) {
				const errorResponse = buildErrorResponse(
					"Schedule template not found for this organization",
					400,
				);
				res.status(400).json(errorResponse);
				return;
			}

			const updatedSection = await prisma.section.update({
				where: { id },
				data: prismaData as any,
				include: {
					department: { select: { id: true, name: true, code: true } },
					head: {
						select: {
							id: true,
							employeeId: true,
							person: { select: { personalInfo: true } },
						},
					},
					scheduleTemplate: { select: { id: true, name: true, code: true } },
				},
			});

			try {
				await invalidateCache.byPattern(`cache:section:byId:${id}:*`);
				await invalidateCache.byPattern("cache:section:list:*");
				await invalidateCache.byPattern("cache:scheduleTemplate:list:*");
				await invalidateCache.byPattern("cache:scheduleTemplate:byId:*");
				sectionLogger.info(`Cache invalidated after section ${id} update`);
			} catch (cacheError) {
				sectionLogger.warn(
					"Failed to invalidate cache after section update:",
					cacheError,
				);
			}

			sectionLogger.info(`${config.SUCCESS.SECTION.UPDATED}: ${updatedSection.id}`);
			const successResponse = buildSuccessResponse(
				config.SUCCESS.SECTION.UPDATED,
				{ section: updatedSection },
				200,
			);
			res.status(200).json(successResponse);
		} catch (error) {
			sectionLogger.error(`${config.ERROR.SECTION.ERROR_UPDATING}: ${error}`);
			const errorResponse = buildErrorResponse(
				config.ERROR.COMMON.INTERNAL_SERVER_ERROR,
				500,
			);
			res.status(500).json(errorResponse);
		}
	};

	const remove = async (req: Request, res: Response, _next: NextFunction) => {
		const { id } = req.params;
		const organizationId = (req as any).organizationId;

		try {
			if (!id) {
				sectionLogger.error(config.ERROR.QUERY_PARAMS.MISSING_ID);
				const errorResponse = buildErrorResponse(config.ERROR.QUERY_PARAMS.MISSING_ID, 400);
				res.status(400).json(errorResponse);
				return;
			}

			sectionLogger.info(`${config.SUCCESS.SECTION.DELETED}: ${id}`);

			const existingSection = await prisma.section.findFirst({
				where: { id, ...(organizationId && { organizationId }) },
			});

			if (!existingSection) {
				sectionLogger.error(`${config.ERROR.SECTION.NOT_FOUND}: ${id}`);
				const errorResponse = buildErrorResponse(config.ERROR.SECTION.NOT_FOUND, 404);
				res.status(404).json(errorResponse);
				return;
			}

			await prisma.section.delete({
				where: { id },
			});

			try {
				await invalidateCache.byPattern(`cache:section:byId:${id}:*`);
				await invalidateCache.byPattern("cache:section:list:*");
				sectionLogger.info(`Cache invalidated after section ${id} deletion`);
			} catch (cacheError) {
				sectionLogger.warn(
					"Failed to invalidate cache after section deletion:",
					cacheError,
				);
			}

			sectionLogger.info(`${config.SUCCESS.SECTION.DELETED}: ${id}`);
			const successResponse = buildSuccessResponse(config.SUCCESS.SECTION.DELETED, {}, 200);
			res.status(200).json(successResponse);
		} catch (error) {
			sectionLogger.error(`${config.ERROR.SECTION.DELETE_FAILED}: ${error}`);
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

			const organizationId = req.organizationId;
			if (!organizationId) {
				res.status(401).json(
					buildErrorResponse("Organization ID not found in authentication token", 401),
				);
				return;
			}

			const workbook = XLSX.read(file.buffer, { type: "buffer" });
			const sheetName = workbook.SheetNames[0];
			const worksheet = workbook.Sheets[sheetName];
			const rawData = XLSX.utils.sheet_to_json(worksheet, { raw: true, defval: null });

			if (!rawData || rawData.length === 0) {
				res.status(400).json(buildErrorResponse("Excel file is empty or invalid", 400));
				return;
			}

			const departments = await prisma.department.findMany({
				where: { organizationId, isDeleted: false },
				select: { id: true, code: true, name: true },
			});
			const schedules = await prisma.scheduleTemplate.findMany({
				where: { organizationId, isDeleted: false },
				select: { id: true, code: true, name: true },
			});
			const departmentIdByCode = new Map<string, string>();
			const departmentIdByName = new Map<string, string>();
			for (const department of departments) {
				const code = String(department.code || "").trim().toLowerCase();
				const name = String(department.name || "").trim().toLowerCase();
				if (code && !departmentIdByCode.has(code)) departmentIdByCode.set(code, department.id);
				if (name && !departmentIdByName.has(name)) departmentIdByName.set(name, department.id);
			}
			const scheduleIdByCode = new Map<string, string>();
			const scheduleIdByName = new Map<string, string>();
			for (const schedule of schedules) {
				const code = String(schedule.code || "").trim().toLowerCase();
				const name = String(schedule.name || "").trim().toLowerCase();
				if (code && !scheduleIdByCode.has(code)) scheduleIdByCode.set(code, schedule.id);
				if (name && !scheduleIdByName.has(name)) scheduleIdByName.set(name, schedule.id);
			}

			const results = { created: 0, updated: 0, skipped: 0, errors: [] as string[] };
			const parseOptionalBoolean = (value: unknown): boolean | null => {
				if (value === undefined || value === null || value === "") return null;
				if (typeof value === "boolean") return value;
				const normalized = String(value).trim().toLowerCase();
				if (["true", "1", "yes", "y"].includes(normalized)) return true;
				if (["false", "0", "no", "n"].includes(normalized)) return false;
				return null;
			};

			for (const row of rawData) {
				try {
					const rowData = row as any;
					const code = String(rowData.CODE || rowData["Section Code"] || "").trim();
					const name = String(rowData.NAME || rowData["Section Name"] || "").trim();
					const description = String(rowData.DESCRIPTION || rowData.Notes || "").trim();
					const departmentValue = String(
						rowData.DEPARTMENT ||
							rowData.DEPARTMENT_CODE ||
							rowData.DEPARTMENT_NAME ||
							rowData["Department Code"] ||
							rowData["Department Name"] ||
							"",
					).trim();
					const scheduleValue = String(
						rowData.SCHEDULE ||
							rowData.SCHEDULE_CODE ||
							rowData.SCHEDULE_NAME ||
							rowData["Schedule"] ||
							rowData["Schedule Code"] ||
							rowData["Schedule Name"] ||
							"",
					).trim();
					const isActive = parseOptionalBoolean(rowData.IS_ACTIVE ?? rowData.Active ?? "");
					const isHr = parseOptionalBoolean(
						rowData.IS_HR ??
							rowData.isHr ??
							rowData["HR Section"] ??
							rowData["Is HR"] ??
							"",
					);

					if (!code || !name || !departmentValue) {
						results.skipped++;
						results.errors.push("Row missing CODE, NAME, or DEPARTMENT");
						continue;
					}

					const normalizedDepartment = departmentValue.toLowerCase();
					const departmentId =
						departmentIdByCode.get(normalizedDepartment) ||
						departmentIdByName.get(normalizedDepartment);

					if (!departmentId) {
						results.skipped++;
						results.errors.push(`Row ${code}: department not found (${departmentValue})`);
						continue;
					}

					let scheduleId: string | null = null;
					const normalizedSchedule = scheduleValue.toLowerCase();
					if (normalizedSchedule) {
						scheduleId =
							scheduleIdByCode.get(normalizedSchedule) ||
							scheduleIdByName.get(normalizedSchedule) ||
							null;
						if (!scheduleId) {
							results.skipped++;
							results.errors.push(`Row ${code}: schedule not found (${scheduleValue})`);
							continue;
						}
					}

					const existingSection = await prisma.section.findUnique({
						where: { organizationId_code: { organizationId, code } },
					});

					if (existingSection) {
						await prisma.section.update({
							where: { id: existingSection.id },
							data: {
								name,
								description: description || null,
								departmentId,
								scheduleId,
								...(isHr !== null ? { isHr } : {}),
								...(isActive !== null ? { isActive } : {}),
							},
						});
						results.updated++;
					} else {
						await prisma.section.create({
							data: {
								organizationId,
								code,
								name,
								description: description || null,
								departmentId,
								scheduleId,
								isHr: isHr ?? false,
								isActive: isActive ?? true,
							},
						});
						results.created++;
					}
				} catch (error) {
					results.skipped++;
					const errorMsg = `Error processing row: ${error}`;
					results.errors.push(errorMsg);
					sectionLogger.error(errorMsg);
				}
			}

			try {
				await invalidateCache.byPattern("cache:section:*");
			} catch (cacheError) {
				sectionLogger.warn("Failed to invalidate cache after import:", cacheError);
			}

			res.status(200).json(
				buildSuccessResponse(
					"Section import completed",
					{
						summary: {
							totalRows: rawData.length,
							created: results.created,
							updated: results.updated,
							skipped: results.skipped,
							errors: results.errors.slice(0, 10),
						},
					},
					200,
				),
			);
		} catch (error) {
			sectionLogger.error(`Error importing sections from XLSX: ${error}`);
			res.status(500).json(
				buildErrorResponse(
					`Failed to import sections: ${error instanceof Error ? error.message : String(error)}`,
					500,
				),
			);
		}
	};

	return { generateCode, create, getAll, getById, update, remove, importFromXLSX };
};
