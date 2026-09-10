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
import { syncEmployeeRolesFromOrgStructure, syncLineLeaderRolesForEmployees } from "../../helper/employee-role-sync.helper";
import {
	reconcileSectionLineLeaders,
	resolveLineLeaderIds,
} from "../../helper/section-line-leaders.helper";
import {
	getSectionEmployeeIds,
	getSectionIdsLedByEmployee,
} from "../../helper/section-leader-scope.helper";

const logger = getLogger();
const sectionLogger = logger.child({ module: "section" });

/** Relation include for section reads: head + line leaders with employee identity. */
const sectionLineLeaderInclude = (prisma: PrismaClient) => ({
	department: { select: { id: true, name: true, code: true } },
	head: {
		select: {
			id: true,
			employeeId: true,
			person: { select: { personalInfo: true } },
		},
	},
	lineLeaders: {
		orderBy: { createdAt: "asc" as const },
		select: {
			id: true,
			employeeId: true,
			createdAt: true,
			employee: {
				select: {
					id: true,
					employeeId: true,
					person: { select: { personalInfo: true } },
				},
			},
		},
	},
	scheduleTemplate: { select: { id: true, name: true, code: true } },
});

export const controller = (prisma: PrismaClient) => {
	/** Role re-derivation after line-leader membership changes. */
	const syncRolesAfterLineLeaderChange = async (
		organizationId: string,
		employeeIds: string[],
	): Promise<void> => {
		if (!employeeIds.length) return;
		try {
			const syncResult = await syncLineLeaderRolesForEmployees(prisma, {
				organizationId,
				employeeIds,
				sampleLimit: 10,
			});
			sectionLogger.info(
				`Line leader role sync: scanned=${syncResult.scanned} updated=${syncResult.updated} unchanged=${syncResult.unchanged}`,
			);
		} catch (roleSyncError) {
			sectionLogger.warn(`Line leader role sync failed: ${roleSyncError}`);
		}
	};

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

			const lineLeaderCheck = await resolveLineLeaderIds(prisma,
				validation.data.lineLeaderIds,
				validation.data.organizationId,
			);
			if (!lineLeaderCheck.ok) {
				const errorResponse = buildErrorResponse(
					"One or more line leaders not found in this organization",
					400,
					[{ field: "lineLeaderIds", message: `Missing or invalid: ${lineLeaderCheck.missing.join(", ")}` }],
				);
				res.status(400).json(errorResponse);
				return;
			}

			const { lineLeaderIds: _omittedLineLeaderIds, ...sectionCreateData } =
				validation.data;
			const section = await prisma.section.create({
				data: sectionCreateData as any,
				include: sectionLineLeaderInclude(prisma),
			});
			const changedLeaderIds = await reconcileSectionLineLeaders(prisma,
				section.id,
				section.organizationId,
				lineLeaderCheck.ids,
			);
			await syncRolesAfterLineLeaderChange(section.organizationId, changedLeaderIds);
			const sectionWithLeaders = await prisma.section.findFirst({
				where: { id: section.id },
				include: sectionLineLeaderInclude(prisma),
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
				sectionWithLeaders ?? section,
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

			// Attach line-leader memberships for the page (single batched query).
			if (document && sections.length > 0) {
				try {
					const sectionIds = sections.map((section) => section.id);
					const memberships = await prisma.sectionLineLeader.findMany({
						where: { sectionId: { in: sectionIds } },
						orderBy: { createdAt: "asc" },
						select: {
							id: true,
							sectionId: true,
							employeeId: true,
							createdAt: true,
							employee: {
								select: {
									id: true,
									employeeId: true,
									person: { select: { personalInfo: true } },
								},
							},
						},
					});
					const bySection = new Map<string, typeof memberships>();
					for (const membership of memberships) {
						const list = bySection.get(membership.sectionId) || [];
						list.push(membership);
						bySection.set(membership.sectionId, list);
					}
					for (const section of sections) {
						(section as any).lineLeaders = bySection.get(section.id) || [];
					}
				} catch (enrichError) {
					sectionLogger.warn(`Failed to attach line leaders to section list: ${enrichError}`);
				}
			}

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

			const lineLeaderCheck = await resolveLineLeaderIds(prisma,
				(prismaData as any).lineLeaderIds,
				existingSection.organizationId,
			);
			if (!lineLeaderCheck.ok) {
				const errorResponse = buildErrorResponse(
					"One or more line leaders not found in this organization",
					400,
					[{ field: "lineLeaderIds", message: `Missing or invalid: ${lineLeaderCheck.missing.join(", ")}` }],
				);
				res.status(400).json(errorResponse);
				return;
			}
			const { lineLeaderIds: _omittedLineLeaderIds, ...sectionUpdateData } =
				prismaData as any;

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
				data: sectionUpdateData as any,
				include: sectionLineLeaderInclude(prisma),
			});
			const changedLeaderIds = await reconcileSectionLineLeaders(prisma,
				id,
				existingSection.organizationId,
				lineLeaderCheck.ids,
			);
			await syncRolesAfterLineLeaderChange(existingSection.organizationId, changedLeaderIds);
			const sectionWithLeaders = await prisma.section.findFirst({
				where: { id },
				include: sectionLineLeaderInclude(prisma),
			});
			sectionLogger.info(`Section line leaders reconciled: ${id}`);

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
				{ section: sectionWithLeaders ?? updatedSection },
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

			// Capture line-leader memberships before the cascade removes them,
			// so their roles can be re-derived after the delete.
			const formerLeaderIds = (
				await prisma.sectionLineLeader.findMany({
					where: { sectionId: id },
					select: { employeeId: true },
				})
			).map((row) => row.employeeId);

			await prisma.section.delete({
				where: { id },
			});

			await syncRolesAfterLineLeaderChange(organizationId, formerLeaderIds);

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

	/**
	 * Assign section members to responsible line leaders (D3: 1 member -> 1
	 * leader; used when a section has 2+ leaders so each leader has a distinct
	 * set of members under them). All assigned leaders must be leaders of THIS
	 * section; all members must belong to this section.
	 */
	const assignMembersToLineLeaders = async (req: Request, res: Response, _next: NextFunction) => {
		const { id } = req.params;
		const authReq = req as AuthRequest;
		try {
			if (!id || !authReq.organizationId) {
				res.status(400).json(buildErrorResponse("Section ID is required", 400));
				return;
			}
			const section = await prisma.section.findFirst({
				where: { id, organizationId: authReq.organizationId, isDeleted: false },
				select: { id: true, organizationId: true },
			});
			if (!section) {
				res.status(404).json(buildErrorResponse("Section not found", 404));
				return;
			}
			const assignments = Array.isArray((req.body as any)?.assignments)
				? ((req.body as any).assignments as Array<{ employeeId: string; lineLeaderId: string }>)
				: [];
			if (assignments.length === 0) {
				res.status(400).json(buildErrorResponse("assignments[] is required", 400));
				return;
			}

			const sectionLeaders = (
				await prisma.sectionLineLeader.findMany({
					where: { sectionId: id },
					select: { employeeId: true },
				})
			).map((row) => row.employeeId);
			const leaderSet = new Set(sectionLeaders);
			if (leaderSet.size === 0) {
				res.status(400).json(
					buildErrorResponse("Assign line leaders to this section before assigning members.", 400),
				);
				return;
			}

			const sectionMembers = new Set(
				(
					await prisma.employee.findMany({
						where: {
							organizationId: section.organizationId,
							isDeleted: false,
							OR: [
								{ sectionId: id },
								{ position: { is: { sectionId: id } } },
							],
						},
						select: { id: true },
					})
				).map((row) => row.id),
			);

			const errors: Array<{ field: string; message: string }> = [];
			for (const [index, assignment] of assignments.entries()) {
				const employeeId = String(assignment?.employeeId || "").trim();
				const lineLeaderId = String(assignment?.lineLeaderId || "").trim();
				if (!sectionMembers.has(employeeId)) {
					errors.push({
						field: `assignments[${index}].employeeId`,
						message: "Employee is not a member of this section.",
					});
				}
				if (!leaderSet.has(lineLeaderId)) {
					errors.push({
						field: `assignments[${index}].lineLeaderId`,
						message: "Line leader is not assigned to this section.",
					});
				}
			}
			if (errors.length > 0) {
				res.status(400).json(buildErrorResponse("Invalid assignments", 400, errors as any));
				return;
			}

			await prisma.$transaction(async (tx) => {
				for (const assignment of assignments) {
					await tx.employee.update({
						where: { id: assignment.employeeId },
						data: { lineLeaderId: assignment.lineLeaderId },
					});
				}
			});

			// Members may now have a derived responsible leader; no role change
			// (assignment does not alter the member's own role).
			sectionLogger.info(`Section members assigned to line leaders: ${id} (${assignments.length})`);
			res
				.status(200)
				.json(buildSuccessResponse(config.SUCCESS.SECTION.UPDATED, { assigned: assignments.length }, 200));
		} catch (error) {
			sectionLogger.error(`Error assigning members to line leaders: ${error}`);
			res.status(500).json(buildErrorResponse(config.ERROR.COMMON.INTERNAL_SERVER_ERROR, 500));
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
			const preferredSheetName =
				workbook.SheetNames.find(
					(name) => String(name || "").trim().toLowerCase() === "sections",
				) ||
				workbook.SheetNames.find((name) =>
					/section/i.test(String(name || "")),
				) ||
				workbook.SheetNames[0];
			const sheetName = preferredSheetName;
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

					// Match by code first, then by (department, name). DM1 re-imports often
					// change section codes (e.g. numeric legacy "60" -> "QCU") while keeping
					// the same department+name. Create-only-by-code trips
					// @@unique([organizationId, departmentId, name]).
					const existingByCode = await prisma.section.findUnique({
						where: { organizationId_code: { organizationId, code } },
					});
					const existingByName =
						existingByCode ||
						(await prisma.section.findFirst({
							where: {
								organizationId,
								departmentId,
								name,
								isDeleted: false,
							},
						}));

					const payload = {
						name,
						code,
						description: description || null,
						departmentId,
						scheduleId,
						...(isHr !== null ? { isHr } : {}),
						...(isActive !== null ? { isActive } : {}),
					};

					if (existingByName) {
						// Another active section already owns this target code.
						if (
							existingByCode &&
							existingByName.id !== existingByCode.id
						) {
							results.skipped++;
							results.errors.push(
								`Row ${code}: code "${code}" already exists on section "${existingByCode.name}" while name "${name}" exists as code "${existingByName.code}" under the same department`,
							);
							continue;
						}
						await prisma.section.update({
							where: { id: existingByName.id },
							data: {
								...payload,
								// Keep isDeleted false if we matched an active row
								isDeleted: false,
							},
						});
						results.updated++;
					} else {
						// Soft-deleted row with same code: revive/update rather than create conflict.
						const softDeletedByCode = await prisma.section.findFirst({
							where: {
								organizationId,
								code,
								isDeleted: true,
							},
						});
						if (softDeletedByCode) {
							await prisma.section.update({
								where: { id: softDeletedByCode.id },
								data: {
									...payload,
									isDeleted: false,
									isHr: isHr ?? softDeletedByCode.isHr ?? false,
									isActive: isActive ?? softDeletedByCode.isActive ?? true,
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
					}
				} catch (error) {
					results.skipped++;
					const prismaCode =
						error && typeof error === "object" && "code" in error
							? String((error as any).code)
							: "";
					const prismaMessage =
						error instanceof Error ? error.message : String(error);
					const errorMsg =
						prismaCode === "P2002"
							? `Row conflict (unique constraint): ${prismaMessage}`
							: `Error processing row: ${prismaMessage}`;
					results.errors.push(errorMsg);
					sectionLogger.error(errorMsg);
				}
			}

			try {
				await invalidateCache.byPattern("cache:section:*");
			} catch (cacheError) {
				sectionLogger.warn("Failed to invalidate cache after import:", cacheError);
			}

			// Login uses Employee.role, not Section.isHr alone. After DM1 IS_HR imports,
			// re-derive roles for employees linked to imported sections so GA/HR users
			// become hris-hr-user / hris-hr-manager without a separate DM3 re-import.
			let roleSync: {
				scanned: number;
				updated: number;
				unchanged: number;
				samples: Array<Record<string, unknown>>;
			} | null = null;
			if (results.created > 0 || results.updated > 0) {
				try {
					const importedCodes = Array.from(
						new Set(
							rawData
								.map((row: any) =>
									String(row?.CODE || row?.["Section Code"] || "").trim(),
								)
								.filter(Boolean),
						),
					);
					const importedSections = importedCodes.length
						? await prisma.section.findMany({
								where: {
									organizationId,
									code: { in: importedCodes },
									isDeleted: false,
								},
								select: { id: true },
							})
						: [];
					const sectionIds = importedSections.map((section) => section.id);
					if (sectionIds.length > 0) {
						const syncResult = await syncEmployeeRolesFromOrgStructure(prisma, {
							organizationId,
							sectionIds,
							sampleLimit: 10,
						});
						roleSync = syncResult as any;
						sectionLogger.info(
							`Section import role sync: scanned=${syncResult.scanned} updated=${syncResult.updated} unchanged=${syncResult.unchanged}`,
						);
					}
				} catch (roleSyncError) {
					sectionLogger.warn(
						`Section import completed but employee role sync failed: ${roleSyncError}`,
					);
				}
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
							roleSync,
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

	/**
	 * GET /api/section/led-members
	 * Active employees in the sections the signed-in employee leads. Used by the
	 * leader-filed request UI (e.g. "file overtime for a section member") so the
	 * "For whom" picker lists exactly the people under the leader.
	 */
	const getLedMembers = async (req: Request, res: Response, _next: NextFunction) => {
		try {
			const organizationId = (req as any).organizationId;
			const actingEmployeeId = (req as any).metadata?.employee?.id;
			if (!organizationId || !actingEmployeeId) {
				res
					.status(401)
					.json(buildErrorResponse("Employee context is required.", 401));
				return;
			}

			const ledSectionIds = await getSectionIdsLedByEmployee(prisma, actingEmployeeId);
			if (!ledSectionIds.length) {
				res.status(200).json(
					buildSuccessResponse("Led section members retrieved", { sections: [], members: [] }, 200),
				);
				return;
			}

			const ledSections = await prisma.section.findMany({
				where: { id: { in: ledSectionIds }, organizationId, isDeleted: false },
				select: { id: true, name: true, code: true },
				orderBy: { name: "asc" },
			});

			const memberEmployeeIds = await getSectionEmployeeIds(prisma, {
				organizationId,
				sectionIds: ledSectionIds,
			});
			const members = memberEmployeeIds.length
				? await prisma.employee.findMany({
						where: { id: { in: memberEmployeeIds }, organizationId, isDeleted: false },
						select: {
							id: true,
							employeeId: true,
							section: { select: { id: true, name: true, code: true } },
							position: { select: { title: true } },
							person: { select: { personalInfo: true } },
						},
						orderBy: { employeeId: "asc" },
					})
				: [];

			res
				.status(200)
				.json(buildSuccessResponse("Led section members retrieved", { sections: ledSections, members }, 200));
		} catch (error) {
			sectionLogger.error(`Error getting led section members: ${error}`);
			res.status(500).json(buildErrorResponse(config.ERROR.COMMON.INTERNAL_SERVER_ERROR, 500));
		}
	};

	/**
	 * GET /api/section/led-timesheets
	 * Timesheets of the active members of the sections the signed-in employee
	 * leads. Powers the My Team "Team Timesheets" tab for line leaders.
	 *
	 * Read-only, leader-scoped (SectionLineLeader + section/position membership).
	 * Supports an optional payroll period selector:
	 *   - `payrollPeriodId` (id or code) for an exact period, or
	 *   - `period=current` for the OPEN/PROCESSING period overlapping today
	 *     (falls back to the latest period that has any led-member timesheet).
	 * Members without a timesheet for the period are returned with
	 * `timesheet: null` so the leader sees the full roster honestly.
	 */
	const getLedTimesheets = async (req: Request, res: Response, _next: NextFunction) => {
		try {
			const organizationId = (req as any).organizationId;
			const actingEmployeeId = (req as any).metadata?.employee?.id;
			if (!organizationId || !actingEmployeeId) {
				res
					.status(401)
					.json(buildErrorResponse("Employee context is required.", 401));
				return;
			}

			const ledSectionIds = await getSectionIdsLedByEmployee(prisma, actingEmployeeId);
			if (!ledSectionIds.length) {
				res.status(200).json(
					buildSuccessResponse(
						"Led section timesheets retrieved",
						{ sections: [], period: null, members: [] },
						200,
					),
				);
				return;
			}

			const ledSections = await prisma.section.findMany({
				where: { id: { in: ledSectionIds }, organizationId, isDeleted: false },
				select: { id: true, name: true, code: true },
				orderBy: { name: "asc" },
			});

			const memberEmployeeIds = await getSectionEmployeeIds(prisma, {
				organizationId,
				sectionIds: ledSectionIds,
			});
			if (!memberEmployeeIds.length) {
				res.status(200).json(
					buildSuccessResponse(
						"Led section timesheets retrieved",
						{ sections: ledSections, period: null, members: [] },
						200,
					),
				);
				return;
			}

			// ----- Period resolution -----
			const periodParam = String((req.query as any)?.period || "").trim();
			const periodIdParam = String((req.query as any)?.payrollPeriodId || "").trim();

			let period: {
				id: string;
				code: string | null;
				name: string;
				startDate: Date;
				endDate: Date;
				status: string;
			} | null = null;

			if (periodIdParam) {
				// Exact period by id or code, scoped to this org.
				const isObjectId = /^[0-9a-fA-F]{24}$/.test(periodIdParam);
				period = await prisma.payrollPeriod.findFirst({
					where: {
						organizationId,
						isDeleted: false,
						...(isObjectId ? { id: periodIdParam } : { code: periodIdParam }),
					},
					select: {
						id: true,
						code: true,
						name: true,
						startDate: true,
						endDate: true,
						status: true,
					},
				});
				if (!period) {
					res.status(404).json(buildErrorResponse("Payroll period not found.", 404));
					return;
				}
			} else if (periodParam === "current") {
				// OPEN/PROCESSING period overlapping today; fallback to the latest
				// period containing any led-member timesheet.
				const now = new Date();
				period = await prisma.payrollPeriod.findFirst({
					where: {
						organizationId,
						isDeleted: false,
						status: { in: ["OPEN", "PROCESSING"] },
						startDate: { lte: now },
						endDate: { gte: now },
					},
					orderBy: { startDate: "desc" },
					select: {
						id: true,
						code: true,
						name: true,
						startDate: true,
						endDate: true,
						status: true,
					},
				});
				if (!period) {
					// Latest period with a timesheet for any led member.
					const latestWithSheet = await prisma.timesheet.findFirst({
						where: {
							organizationId,
							isDeleted: false,
							employeeId: { in: memberEmployeeIds },
						},
						orderBy: { createdAt: "desc" },
						select: {
							payrollPeriod: {
								select: {
									id: true,
									code: true,
									name: true,
									startDate: true,
									endDate: true,
									status: true,
								},
							},
						},
					});
					period = latestWithSheet?.payrollPeriod ?? null;
				}
			} else {
				// Default: latest period with a timesheet for any led member; if the
				// roster has none yet, fall back to the org's current OPEN period.
				const latestWithSheet = await prisma.timesheet.findFirst({
					where: {
						organizationId,
						isDeleted: false,
						employeeId: { in: memberEmployeeIds },
					},
					orderBy: { createdAt: "desc" },
					select: {
						payrollPeriod: {
							select: {
								id: true,
								code: true,
								name: true,
								startDate: true,
								endDate: true,
								status: true,
							},
						},
					},
				});
				if (latestWithSheet?.payrollPeriod) {
					period = latestWithSheet.payrollPeriod;
				} else {
					const now = new Date();
					period = await prisma.payrollPeriod.findFirst({
						where: {
							organizationId,
							isDeleted: false,
							status: { in: ["OPEN", "PROCESSING"] },
							startDate: { lte: now },
							endDate: { gte: now },
						},
						orderBy: { startDate: "desc" },
						select: {
							id: true,
							code: true,
							name: true,
							startDate: true,
							endDate: true,
							status: true,
						},
					});
				}
			}

			// ----- Member roster (same contract as led-members) -----
			const members = await prisma.employee.findMany({
				where: { id: { in: memberEmployeeIds }, organizationId, isDeleted: false },
				select: {
					id: true,
					employeeId: true,
					section: { select: { id: true, name: true, code: true } },
					position: { select: { title: true } },
					person: { select: { personalInfo: true } },
				},
				orderBy: { employeeId: "asc" },
			});

			// ----- Timesheets for the resolved period -----
			const timesheets = period
				? await prisma.timesheet.findMany({
						where: {
							organizationId,
							isDeleted: false,
							employeeId: { in: memberEmployeeIds },
							payrollPeriodId: period.id,
						},
						select: {
							id: true,
							code: true,
							employeeId: true,
							payrollPeriodId: true,
							status: true,
							totalDays: true,
							totalHoursWorked: true,
							totalRegularHours: true,
							totalOvertimeHours: true,
							totalUndertimeHours: true,
							totalLateHours: true,
							totalEarlyOutHours: true,
							submittedAt: true,
							approvalDate: true,
							updatedAt: true,
						},
						orderBy: { employeeId: "asc" },
					})
				: [];
			const timesheetByEmployee = new Map(timesheets.map((ts) => [ts.employeeId, ts]));

			const rows = members.map((member) => {
				const ts = timesheetByEmployee.get(member.id) || null;
				return {
					member: {
						id: member.id,
						employeeId: member.employeeId,
						section: member.section,
						position: member.position,
						person: member.person,
					},
					timesheet: ts,
				};
			});

			res.status(200).json(
				buildSuccessResponse(
					"Led section timesheets retrieved",
					{
						sections: ledSections,
						period: period
							? {
									id: period.id,
									code: period.code ?? null,
									name: period.name,
									startDate: period.startDate,
									endDate: period.endDate,
									status: period.status,
								}
							: null,
						members: rows,
					},
					200,
				),
			);
		} catch (error) {
			sectionLogger.error(`Error getting led section timesheets: ${error}`);
			res.status(500).json(buildErrorResponse(config.ERROR.COMMON.INTERNAL_SERVER_ERROR, 500));
		}
	};

	return {
		generateCode,
		create,
		getAll,
		getById,
		update,
		remove,
		assignMembersToLineLeaders,
		getLedMembers,
		getLedTimesheets,
		importFromXLSX,
	};
};
