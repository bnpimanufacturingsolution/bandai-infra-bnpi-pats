import { NextFunction, Request, Response } from "express";
import { Prisma, PrismaClient } from "../../generated/prisma";
import { getLogger } from "../../helper/logger.helper";
import { validateQueryParams } from "../../helper/validation-helper";
import {
	buildFilterConditions,
	buildFindManyQuery,
	buildSearchConditions,
	getNestedFields,
} from "../../helper/query-builder.helper";
import { groupDataByField } from "../../helper/dataGrouping";
import { buildPagination, buildSuccessResponse } from "../../helper/success-handler.helper";
import { buildErrorResponse, formatZodErrors } from "../../helper/error-handler";
import { CreateAgencySchema, UpdateAgencySchema } from "../../zod/agency.zod";
import { invalidateCache } from "../../middleware/cache";
import { suggestUniqueConfigCode } from "../../helper/config-code.helper";
import { logActivity } from "../../utils/activityLogger";
import { logAudit } from "../../utils/auditLogger";
import { config } from "../../config/constant";
import * as XLSX from "xlsx";

const logger = getLogger();
const agencyLogger = logger.child({ module: "agency" });

const AGENCY_ADMIN_ROLES = new Set(["super_admin", "admin", "hris-admin"]);

const hasAgencyWriteAccess = (role?: string) => !!role && AGENCY_ADMIN_ROLES.has(role);

export const controller = (prisma: PrismaClient) => {
	const generateCode = async (req: Request, res: Response, _next: NextFunction) => {
		if (!hasAgencyWriteAccess((req as any).role)) {
			res.status(403).json(buildErrorResponse("You are not authorized to manage agencies", 403));
			return;
		}

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
					const existingAgency = await prisma.agency.findUnique({
						where: {
							organizationId_code: {
								organizationId,
								code: candidateCode,
							},
						},
						select: { id: true },
					});
					return Boolean(existingAgency);
				},
			});

			logActivity(req, {
				userId: (req as any).user?.id || "unknown",
				action: config.ACTIVITY_LOG.AGENCY.ACTIONS.GENERATE_AGENCY_CODE,
				description: config.ACTIVITY_LOG.AGENCY.DESCRIPTIONS.AGENCY_CODE_GENERATED,
				page: {
					url: req.originalUrl,
					title: config.ACTIVITY_LOG.AGENCY.PAGES.AGENCY_CREATION,
				},
				organizationId,
			});

			res.status(200).json(
				buildSuccessResponse("Agency code generated successfully", suggestion, 200),
			);
		} catch (error) {
			agencyLogger.error(`Agency generateCode failed: ${error}`);
			res.status(500).json(buildErrorResponse("Internal server error", 500));
		}
	};

	const create = async (req: Request, res: Response, _next: NextFunction) => {
		if (!hasAgencyWriteAccess((req as any).role)) {
			res.status(403).json(buildErrorResponse("You are not authorized to manage agencies", 403));
			return;
		}

		const organizationId = (req as any).organizationId;
		if (!organizationId) {
			res.status(401).json(buildErrorResponse("Organization ID is required", 401));
			return;
		}

		const validation = CreateAgencySchema.safeParse({
			...req.body,
			organizationId,
		});
		if (!validation.success) {
			res
				.status(400)
				.json(buildErrorResponse("Validation failed", 400, formatZodErrors(validation.error.format())));
			return;
		}

		try {
			const agency = await prisma.agency.create({
				data: {
					...validation.data,
					organizationId,
					code: validation.data.code.trim().toUpperCase(),
					name: validation.data.name.trim(),
				},
			});
			logActivity(req, {
				userId: (req as any).user?.id || "unknown",
				action: config.ACTIVITY_LOG.AGENCY.ACTIONS.CREATE_AGENCY,
				description: `${config.ACTIVITY_LOG.AGENCY.DESCRIPTIONS.AGENCY_CREATED}: ${agency.name || agency.id}`,
				page: {
					url: req.originalUrl,
					title: config.ACTIVITY_LOG.AGENCY.PAGES.AGENCY_CREATION,
				},
				organizationId,
			});

			logAudit(req, {
				userId: (req as any).user?.id || "unknown",
				action: config.AUDIT_LOG.ACTIONS.CREATE,
				resource: config.AUDIT_LOG.RESOURCES.AGENCY,
				severity: config.AUDIT_LOG.SEVERITY.MEDIUM,
				entityType: config.AUDIT_LOG.ENTITY_TYPES.AGENCY,
				entityId: agency.id,
				changesBefore: null,
				changesAfter: {
					id: agency.id,
					name: agency.name,
					code: agency.code,
					status: agency.status,
					createdAt: agency.createdAt,
					updatedAt: agency.updatedAt,
				},
				description: `${config.AUDIT_LOG.AGENCY.DESCRIPTIONS.AGENCY_CREATED}: ${agency.name || agency.id}`,
				organizationId,
			});

			await invalidateCache.byPattern("cache:agency:list:*");
			res.status(201).json(buildSuccessResponse("Agency created successfully", agency, 201));
		} catch (error) {
			agencyLogger.error(`Agency create failed: ${error}`);
			res.status(500).json(buildErrorResponse("Internal server error", 500));
		}
	};

	const getAll = async (req: Request, res: Response, _next: NextFunction) => {
		const validationResult = validateQueryParams(req, agencyLogger);
		if (!validationResult.isValid) {
			res.status(400).json(validationResult.errorResponse);
			return;
		}

		const organizationId = (req as any).organizationId;
		if (!organizationId) {
			res.status(401).json(buildErrorResponse("Organization ID is required", 401));
			return;
		}

		const { page, limit, order, fields, sort, skip, query, document, pagination, count, filter, groupBy } =
			validationResult.validatedParams!;

		try {
			const whereClause: Prisma.AgencyWhereInput = {
				organizationId,
				isDeleted: false,
			};

			if (query) {
				const searchFields = ["name", "code", "contactName", "contactEmail"];
				const searchConditions = buildSearchConditions("Agency", query, searchFields);
				if (searchConditions.length > 0) whereClause.OR = searchConditions;
			}

			if (filter) {
				const filterConditions = buildFilterConditions("Agency", filter);
				if (filterConditions.length > 0) whereClause.AND = filterConditions;
			}

			const findManyQuery = buildFindManyQuery(whereClause, skip, limit, order, sort, fields);

			const [agencies, total] = await Promise.all([
				document ? prisma.agency.findMany(findManyQuery) : [],
				pagination || count ? prisma.agency.count({ where: whereClause }) : 0,
			]);

			const processedData = groupBy && document ? groupDataByField(agencies, groupBy as string) : agencies;

			logActivity(req, {
				userId: (req as any).user?.id || "unknown",
				action: config.ACTIVITY_LOG.AGENCY.ACTIONS.GET_ALL_AGENCY,
				description: config.ACTIVITY_LOG.AGENCY.DESCRIPTIONS.AGENCIES_RETRIEVED,
				page: {
					url: req.originalUrl,
					title: config.ACTIVITY_LOG.AGENCY.PAGES.AGENCY_LIST,
				},
				organizationId,
			});

			res.status(200).json(
				buildSuccessResponse(
					"Agencies retrieved successfully",
					{
						...(document && { agencies: processedData }),
						...(count && { count: total }),
						...(pagination && { pagination: buildPagination(total, page, limit) }),
						...(groupBy && { groupedBy: groupBy }),
					},
					200,
				),
			);
		} catch (error) {
			agencyLogger.error(`Agency getAll failed: ${error}`);
			res.status(500).json(buildErrorResponse("Internal server error", 500));
		}
	};

	const getById = async (req: Request, res: Response, _next: NextFunction) => {
		const { id } = req.params;
		const { fields } = req.query;
		const organizationId = (req as any).organizationId;
		if (!organizationId) {
			res.status(401).json(buildErrorResponse("Organization ID is required", 401));
			return;
		}

		try {
			const agency = await prisma.agency.findFirst({
				where: { id, organizationId, isDeleted: false },
				select: getNestedFields(typeof fields === "string" ? fields : undefined),
			});
			if (!agency) {
				res.status(404).json(buildErrorResponse("Agency not found", 404));
				return;
			}

			logActivity(req, {
				userId: (req as any).user?.id || "unknown",
				action: config.ACTIVITY_LOG.AGENCY.ACTIONS.GET_AGENCY,
				description: `${config.ACTIVITY_LOG.AGENCY.DESCRIPTIONS.AGENCY_RETRIEVED}: ${agency.id}`,
				page: {
					url: req.originalUrl,
					title: config.ACTIVITY_LOG.AGENCY.PAGES.AGENCY_DETAILS,
				},
				organizationId,
			});

			res.status(200).json(buildSuccessResponse("Agency retrieved successfully", agency, 200));
		} catch (error) {
			agencyLogger.error(`Agency getById failed: ${error}`);
			res.status(500).json(buildErrorResponse("Internal server error", 500));
		}
	};

	const update = async (req: Request, res: Response, _next: NextFunction) => {
		if (!hasAgencyWriteAccess((req as any).role)) {
			res.status(403).json(buildErrorResponse("You are not authorized to manage agencies", 403));
			return;
		}

		const { id } = req.params;
		const organizationId = (req as any).organizationId;
		if (!organizationId) {
			res.status(401).json(buildErrorResponse("Organization ID is required", 401));
			return;
		}

		const validation = UpdateAgencySchema.safeParse(req.body);
		if (!validation.success) {
			res
				.status(400)
				.json(buildErrorResponse("Validation failed", 400, formatZodErrors(validation.error.format())));
			return;
		}

		try {
			const existing = await prisma.agency.findFirst({
				where: { id, organizationId, isDeleted: false },
			});
			if (!existing) {
				res.status(404).json(buildErrorResponse("Agency not found", 404));
				return;
			}

			const data = { ...validation.data } as any;
			if (typeof data.code === "string") data.code = data.code.trim().toUpperCase();
			if (typeof data.name === "string") data.name = data.name.trim();

			const agency = await prisma.agency.update({ where: { id }, data });

			logActivity(req, {
				userId: (req as any).user?.id || "unknown",
				action: config.ACTIVITY_LOG.AGENCY.ACTIONS.UPDATE_AGENCY,
				description: `${config.ACTIVITY_LOG.AGENCY.DESCRIPTIONS.AGENCY_UPDATED}: ${agency.name || agency.id}`,
				page: {
					url: req.originalUrl,
					title: config.ACTIVITY_LOG.AGENCY.PAGES.AGENCY_UPDATE,
				},
				organizationId,
			});

			logAudit(req, {
				userId: (req as any).user?.id || "unknown",
				action: config.AUDIT_LOG.ACTIONS.UPDATE,
				resource: config.AUDIT_LOG.RESOURCES.AGENCY,
				severity: config.AUDIT_LOG.SEVERITY.MEDIUM,
				entityType: config.AUDIT_LOG.ENTITY_TYPES.AGENCY,
				entityId: agency.id,
				changesBefore: existing,
				changesAfter: agency,
				description: `${config.AUDIT_LOG.AGENCY.DESCRIPTIONS.AGENCY_UPDATED}: ${agency.name || agency.id}`,
				organizationId,
			});

			await invalidateCache.byPattern(`cache:agency:byId:${id}:*`);
			await invalidateCache.byPattern("cache:agency:list:*");
			res.status(200).json(buildSuccessResponse("Agency updated successfully", agency, 200));
		} catch (error) {
			agencyLogger.error(`Agency update failed: ${error}`);
			res.status(500).json(buildErrorResponse("Internal server error", 500));
		}
	};

	const remove = async (req: Request, res: Response, _next: NextFunction) => {
		if (!hasAgencyWriteAccess((req as any).role)) {
			res.status(403).json(buildErrorResponse("You are not authorized to manage agencies", 403));
			return;
		}

		const { id } = req.params;
		const organizationId = (req as any).organizationId;
		if (!organizationId) {
			res.status(401).json(buildErrorResponse("Organization ID is required", 401));
			return;
		}

		try {
			const existing = await prisma.agency.findFirst({
				where: { id, organizationId, isDeleted: false },
			});
			if (!existing) {
				res.status(404).json(buildErrorResponse("Agency not found", 404));
				return;
			}

			await prisma.agency.update({
				where: { id },
				data: { isDeleted: true, status: "INACTIVE" },
			});

			logActivity(req, {
				userId: (req as any).user?.id || "unknown",
				action: config.ACTIVITY_LOG.AGENCY.ACTIONS.DELETE_AGENCY,
				description: `${config.ACTIVITY_LOG.AGENCY.DESCRIPTIONS.AGENCY_DELETED}: ${existing.name || id}`,
				page: {
					url: req.originalUrl,
					title: config.ACTIVITY_LOG.AGENCY.PAGES.AGENCY_DELETION,
				},
				organizationId,
			});

			logAudit(req, {
				userId: (req as any).user?.id || "unknown",
				action: config.AUDIT_LOG.ACTIONS.DELETE,
				resource: config.AUDIT_LOG.RESOURCES.AGENCY,
				severity: config.AUDIT_LOG.SEVERITY.MEDIUM,
				entityType: config.AUDIT_LOG.ENTITY_TYPES.AGENCY,
				entityId: id,
				changesBefore: existing,
				changesAfter: null,
				description: `${config.AUDIT_LOG.AGENCY.DESCRIPTIONS.AGENCY_DELETED}: ${existing.name || id}`,
				organizationId,
			});

			await invalidateCache.byPattern(`cache:agency:byId:${id}:*`);
			await invalidateCache.byPattern("cache:agency:list:*");
			res.status(200).json(buildSuccessResponse("Agency deleted successfully", {}, 200));
		} catch (error) {
			agencyLogger.error(`Agency delete failed: ${error}`);
			res.status(500).json(buildErrorResponse("Internal server error", 500));
		}
	};

	const importFromXLSX = async (req: Request, res: Response, _next: NextFunction) => {
		if (!hasAgencyWriteAccess((req as any).role)) {
			res.status(403).json(buildErrorResponse("You are not authorized to manage agencies", 403));
			return;
		}

		const file = (req as any).file;
		const organizationId = (req as any).organizationId;
		if (!file) {
			res.status(400).json(buildErrorResponse("No file uploaded", 400));
			return;
		}
		if (!organizationId) {
			res.status(401).json(buildErrorResponse("Organization ID is required", 401));
			return;
		}

		const workbook = XLSX.read(file.buffer, { type: "buffer" });
		const sheetName = workbook.SheetNames[0];
		const worksheet = workbook.Sheets[sheetName];
		const rows = XLSX.utils.sheet_to_json(worksheet, { raw: false, defval: "" }) as any[];
		const summary = {
			total: rows.length,
			created: 0,
			updated: 0,
			skipped: 0,
			failed: 0,
			errors: [] as Array<{ row: number; field: string | null; message: string }>,
		};

		const normalizeStatus = (value: unknown): "ACTIVE" | "INACTIVE" => {
			const normalized = String(value || "ACTIVE").trim().toUpperCase();
			return normalized === "INACTIVE" ? "INACTIVE" : "ACTIVE";
		};

		for (const [index, row] of rows.entries()) {
			const rowNumber = index + 2;
			const code = String(row.CODE || row.Code || "").trim().toUpperCase();
			const name = String(row.NAME || row.Name || "").trim();
			if (!code || !name) {
				summary.skipped += 1;
				summary.errors.push({
					row: rowNumber,
					field: !code ? "CODE" : "NAME",
					message: `Row ${rowNumber}: CODE and NAME are required.`,
				});
				continue;
			}

			try {
				const payload = {
					name,
					code,
					status: normalizeStatus(row.STATUS || row.Status),
					contactName: String(row.CONTACT_NAME || row.ContactName || "").trim() || null,
					contactEmail: String(row.CONTACT_EMAIL || row.ContactEmail || "").trim() || null,
					contactPhone: String(row.CONTACT_PHONE || row.ContactPhone || "").trim() || null,
					metadata: {
						source: "DM1.6 Agencies",
						sourceSheet: sheetName,
						sourceRow: rowNumber,
					},
				};
				const existing =
					(await prisma.agency.findUnique({
						where: { organizationId_code: { organizationId, code } },
						select: { id: true },
					})) ||
					(await prisma.agency.findUnique({
						where: { organizationId_name: { organizationId, name } },
						select: { id: true },
					}));

				if (existing) {
					await prisma.agency.update({ where: { id: existing.id }, data: payload });
					summary.updated += 1;
				} else {
					await prisma.agency.create({
						data: {
							organizationId,
							...payload,
						},
					});
					summary.created += 1;
				}
			} catch (error) {
				summary.failed += 1;
				summary.errors.push({
					row: rowNumber,
					field: null,
					message: error instanceof Error ? error.message : "Agency import failed.",
				});
			}
		}

		logActivity(req, {
			userId: (req as any).user?.id || "unknown",
			action: config.ACTIVITY_LOG.AGENCY.ACTIONS.IMPORT_AGENCY,
			description: `${config.ACTIVITY_LOG.AGENCY.DESCRIPTIONS.AGENCY_IMPORTED}: created=${summary.created}, updated=${summary.updated}`,
			page: {
				url: req.originalUrl,
				title: config.ACTIVITY_LOG.AGENCY.PAGES.AGENCY_IMPORT,
			},
			organizationId,
		});

		logAudit(req, {
			userId: (req as any).user?.id || "unknown",
			action: config.AUDIT_LOG.ACTIONS.CREATE,
			resource: config.AUDIT_LOG.RESOURCES.AGENCY,
			severity: config.AUDIT_LOG.SEVERITY.MEDIUM,
			entityType: config.AUDIT_LOG.ENTITY_TYPES.AGENCY,
			entityId: organizationId,
			changesBefore: null,
			changesAfter: {
				total: summary.total,
				created: summary.created,
				updated: summary.updated,
				skipped: summary.skipped,
				failed: summary.failed,
			},
			description: `${config.ACTIVITY_LOG.AGENCY.DESCRIPTIONS.AGENCY_IMPORTED}: created=${summary.created}, updated=${summary.updated}`,
			organizationId,
		});

		await invalidateCache.byPattern("cache:agency:list:*");
		res.status(200).json(buildSuccessResponse("Agency import completed", { summary }, 200));
	};

	return {
		generateCode,
		create,
		getAll,
		getById,
		update,
		remove,
		importFromXLSX,
	};
};
