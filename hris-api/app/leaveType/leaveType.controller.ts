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
import { CreateLeaveTypeSchema, UpdateLeaveTypeSchema } from "../../zod/leavetype.zod";
import { logActivity } from "../../utils/activityLogger";
import { logAudit } from "../../utils/auditLogger";
import { config } from "../../config/constant";
import { redisClient } from "../../config/redis";
import { invalidateCache } from "../../middleware/cache";
import { AuthRequest } from "../../middleware/verifyToken";
import {
	getDefaultLeavePolicySeed,
	selfRepairLeaveTypePoliciesFromLegacyConfig,
} from "../../helper/leave-policy.helper";

const logger = getLogger();
const leaveTypeLogger = logger.child({ module: "leaveType" });
const CONFIGURATION_ADMIN_ROLES = new Set(["hris-admin", "admin", "super_admin"]);

const canManageLeaveTypes = (role?: string | null) => {
	if (!role) return false;
	const normalizedRole = String(role).trim().toLowerCase();
	return CONFIGURATION_ADMIN_ROLES.has(normalizedRole) || normalizedRole.startsWith("hris-hr-");
};

const POLICY_FIELDS = [
	"enabled",
	"isPaid",
	"requiresApproval",
	"minAdvanceNoticeDays",
	"maxDaysPerRequest",
	"allowHalfDay",
	"requireAttachment",
	"allowedEmploymentTypes",
] as const;

const parseOptionalBoolean = (value: unknown): boolean | undefined => {
	if (value === undefined || value === null || value === "") return undefined;
	if (typeof value === "boolean") return value;
	const normalized = String(value).trim().toLowerCase();
	if (["true", "1", "yes", "y", "paid", "active", "enabled"].includes(normalized)) return true;
	if (["false", "0", "no", "n", "unpaid", "inactive", "disabled"].includes(normalized)) return false;
	return undefined;
};

const parseOptionalNumber = (value: unknown): number | undefined => {
	if (value === undefined || value === null || value === "") return undefined;
	const parsed = Number(value);
	return Number.isFinite(parsed) ? parsed : undefined;
};

const getImportValue = (row: Record<string, any>, aliases: string[]) => {
	const normalizedAliases = aliases.map((alias) =>
		alias.trim().toLowerCase().replace(/[_\s-]+/g, ""),
	);
	for (const [key, value] of Object.entries(row)) {
		const normalizedKey = key.trim().toLowerCase().replace(/[_\s-]+/g, "");
		if (normalizedAliases.includes(normalizedKey)) return value;
	}
	return undefined;
};

const pickPolicyData = (payload: Record<string, any>) => {
	const data: Record<string, any> = {};
	for (const field of POLICY_FIELDS) {
		if (payload[field] !== undefined) data[field] = payload[field];
	}
	return data;
};

export const controller = (prisma: PrismaClient) => {
	const create = async (req: Request, res: Response, _next: NextFunction) => {
		const authReq = req as AuthRequest;
		let requestData = req.body;
		const contentType = req.get("Content-Type") || "";

		if (
			contentType.includes("application/x-www-form-urlencoded") ||
			contentType.includes("multipart/form-data")
		) {
			leaveTypeLogger.info("Original form data:", JSON.stringify(req.body, null, 2));
			requestData = transformFormDataToObject(req.body);
			leaveTypeLogger.info(
				"Transformed form data to object structure:",
				JSON.stringify(requestData, null, 2),
			);
		}

		if (!authReq.organizationId) {
			res.status(400).json(buildErrorResponse("Organization ID is required", 400));
			return;
		}
		if (!canManageLeaveTypes(authReq.role)) {
			res.status(403).json(buildErrorResponse("You are not authorized to manage leave types", 403));
			return;
		}

		const validation = CreateLeaveTypeSchema.safeParse(requestData);
		if (!validation.success) {
			const formattedErrors = formatZodErrors(validation.error.format());
			leaveTypeLogger.error(`Validation failed: ${JSON.stringify(formattedErrors)}`);
			const errorResponse = buildErrorResponse("Validation failed", 400, formattedErrors);
			res.status(400).json(errorResponse);
			return;
		}

		try {
			const leaveType = await prisma.leaveType.create({
				data: {
					...validation.data,
					...getDefaultLeavePolicySeed(validation.data.code),
					...pickPolicyData(validation.data),
					organizationId: authReq.organizationId,
				},
			});
			leaveTypeLogger.info(`LeaveType created successfully: ${leaveType.id}`);

			logActivity(req, {
				userId: (req as any).user?.id || "unknown",
				action: config.ACTIVITY_LOG.LEAVETYPE.ACTIONS.CREATE_LEAVETYPE,
				description: `${config.ACTIVITY_LOG.LEAVETYPE.DESCRIPTIONS.LEAVETYPE_CREATED}: ${leaveType.name || leaveType.id}`,
				page: {
					url: req.originalUrl,
					title: config.ACTIVITY_LOG.LEAVETYPE.PAGES.LEAVETYPE_CREATION,
				},
			});

			logAudit(req, {
				userId: (req as any).user?.id || "unknown",
				action: config.AUDIT_LOG.ACTIONS.CREATE,
				resource: config.AUDIT_LOG.RESOURCES.LEAVETYPE,
				severity: config.AUDIT_LOG.SEVERITY.LOW,
				entityType: config.AUDIT_LOG.ENTITY_TYPES.LEAVETYPE,
				entityId: leaveType.id,
				changesBefore: null,
				changesAfter: {
					id: leaveType.id,
					name: leaveType.name,
					description: leaveType.description,
					createdAt: leaveType.createdAt,
					updatedAt: leaveType.updatedAt,
				},
				description: `${config.AUDIT_LOG.LEAVETYPE.DESCRIPTIONS.LEAVETYPE_CREATED}: ${leaveType.name || leaveType.id}`,
			});

			try {
				await invalidateCache.byPattern("cache:leaveType:list:*");
				leaveTypeLogger.info("LeaveType list cache invalidated after creation");
			} catch (cacheError) {
				leaveTypeLogger.warn(
					"Failed to invalidate cache after leaveType creation:",
					cacheError,
				);
			}

			const successResponse = buildSuccessResponse(
				config.SUCCESS.LEAVETYPE.CREATED,
				leaveType,
				201,
			);
			res.status(201).json(successResponse);
		} catch (error) {
			leaveTypeLogger.error(`${config.ERROR.LEAVETYPE.CREATE_FAILED}: ${error}`);
			const errorResponse = buildErrorResponse(
				config.ERROR.COMMON.INTERNAL_SERVER_ERROR,
				500,
			);
			res.status(500).json(errorResponse);
		}
	};
	const getAll = async (req: Request, res: Response, _next: NextFunction) => {
		const authReq = req as AuthRequest;
		if (!authReq.organizationId) {
			res.status(400).json(buildErrorResponse("Organization ID is required", 400));
			return;
		}
		const validationResult = validateQueryParams(req, leaveTypeLogger);

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

		leaveTypeLogger.info(
			`Getting leaveTypes, page: ${page}, limit: ${limit}, query: ${query}, order: ${order}, groupBy: ${groupBy}`,
		);

		try {
			await selfRepairLeaveTypePoliciesFromLegacyConfig(prisma, authReq.organizationId);
			const whereClause: Prisma.LeaveTypeWhereInput = {
				organizationId: authReq.organizationId,
			};

			const searchFields = ["code", "name", "description"];
			if (query) {
				const searchConditions = buildSearchConditions("LeaveType", query, searchFields);
				if (searchConditions.length > 0) {
					whereClause.OR = searchConditions;
				}
			}

			if (filter) {
				const filterConditions = buildFilterConditions("LeaveType", filter);
				if (filterConditions.length > 0) {
					whereClause.AND = filterConditions;
				}
			}
			const findManyQuery = buildFindManyQuery(whereClause, skip, limit, order, sort, fields);

			const [leaveTypes, total] = await Promise.all([
				document ? prisma.leaveType.findMany(findManyQuery) : [],
				count ? prisma.leaveType.count({ where: whereClause }) : 0,
			]);

			leaveTypeLogger.info(`Retrieved ${leaveTypes.length} leaveTypes`);
			const processedData =
				groupBy && document ? groupDataByField(leaveTypes, groupBy as string) : leaveTypes;

			const responseData: Record<string, any> = {
				...(document && { leaveTypes: processedData }),
				...(count && { count: total }),
				...(pagination && { pagination: buildPagination(total, page, limit) }),
				...(groupBy && { groupedBy: groupBy }),
			};

			res.status(200).json(
				buildSuccessResponse(config.SUCCESS.LEAVETYPE.RETRIEVED_ALL, responseData, 200),
			);
		} catch (error) {
			leaveTypeLogger.error(`${config.ERROR.LEAVETYPE.GET_ALL_FAILED}: ${error}`);
			res.status(500).json(
				buildErrorResponse(config.ERROR.COMMON.INTERNAL_SERVER_ERROR, 500),
			);
		}
	};
	const getById = async (req: Request, res: Response, _next: NextFunction) => {
		const authReq = req as AuthRequest;
		const { id } = req.params;
		const { fields } = req.query;

		try {
			if (!authReq.organizationId) {
				res.status(400).json(buildErrorResponse("Organization ID is required", 400));
				return;
			}
			if (!id) {
				leaveTypeLogger.error(config.ERROR.QUERY_PARAMS.MISSING_ID);
				const errorResponse = buildErrorResponse(config.ERROR.QUERY_PARAMS.MISSING_ID, 400);
				res.status(400).json(errorResponse);
				return;
			}

			if (fields && typeof fields !== "string") {
				leaveTypeLogger.error(`${config.ERROR.QUERY_PARAMS.INVALID_POPULATE}: ${fields}`);
				const errorResponse = buildErrorResponse(
					config.ERROR.QUERY_PARAMS.POPULATE_MUST_BE_STRING,
					400,
				);
				res.status(400).json(errorResponse);
				return;
			}

			leaveTypeLogger.info(`${config.SUCCESS.LEAVETYPE.GETTING_BY_ID}: ${id}`);

			const cacheKey = `cache:leaveType:byId:${id}:${fields || "full"}`;
			let leaveType = null;

			try {
				if (redisClient.isClientConnected()) {
					leaveType = await redisClient.getJSON(cacheKey);
					if (leaveType) {
						leaveTypeLogger.info(`LeaveType ${id} retrieved from direct Redis cache`);
					}
				}
			} catch (cacheError) {
				leaveTypeLogger.warn(`Redis cache retrieval failed for leaveType ${id}:`, cacheError);
			}

			if (!leaveType) {
				const query: Prisma.LeaveTypeFindFirstArgs = {
					where: { id, organizationId: authReq.organizationId },
				};

				query.select = getNestedFields(fields);

				leaveType = await prisma.leaveType.findFirst(query);

				if (leaveType && redisClient.isClientConnected()) {
					try {
						await redisClient.setJSON(cacheKey, leaveType, 3600);
						leaveTypeLogger.info(`LeaveType ${id} stored in direct Redis cache`);
					} catch (cacheError) {
						leaveTypeLogger.warn(
							`Failed to store leaveType ${id} in Redis cache:`,
							cacheError,
						);
					}
				}
			}

			if (!leaveType) {
				leaveTypeLogger.error(`${config.ERROR.LEAVETYPE.NOT_FOUND}: ${id}`);
				const errorResponse = buildErrorResponse(config.ERROR.LEAVETYPE.NOT_FOUND, 404);
				res.status(404).json(errorResponse);
				return;
			}

			leaveTypeLogger.info(`${config.SUCCESS.LEAVETYPE.RETRIEVED}: ${(leaveType as any).id}`);
			const successResponse = buildSuccessResponse(
				config.SUCCESS.LEAVETYPE.RETRIEVED,
				leaveType,
				200,
			);
			res.status(200).json(successResponse);
		} catch (error) {
			leaveTypeLogger.error(`${config.ERROR.LEAVETYPE.ERROR_GETTING}: ${error}`);
			const errorResponse = buildErrorResponse(
				config.ERROR.COMMON.INTERNAL_SERVER_ERROR,
				500,
			);
			res.status(500).json(errorResponse);
		}
	};

	const update = async (req: Request, res: Response, _next: NextFunction) => {
		const authReq = req as AuthRequest;
		const { id } = req.params;

		try {
			if (!authReq.organizationId) {
				res.status(400).json(buildErrorResponse("Organization ID is required", 400));
				return;
			}
			if (!canManageLeaveTypes(authReq.role)) {
				res.status(403).json(buildErrorResponse("You are not authorized to manage leave types", 403));
				return;
			}
			if (!id) {
				leaveTypeLogger.error(config.ERROR.QUERY_PARAMS.MISSING_ID);
				const errorResponse = buildErrorResponse(config.ERROR.QUERY_PARAMS.MISSING_ID, 400);
				res.status(400).json(errorResponse);
				return;
			}

			const validationResult = UpdateLeaveTypeSchema.safeParse(req.body);

			if (!validationResult.success) {
				const formattedErrors = formatZodErrors(validationResult.error.format());
				leaveTypeLogger.error(`Validation failed: ${JSON.stringify(formattedErrors)}`);
				const errorResponse = buildErrorResponse("Validation failed", 400, formattedErrors);
				res.status(400).json(errorResponse);
				return;
			}

			if (Object.keys(req.body).length === 0) {
				leaveTypeLogger.error(config.ERROR.COMMON.NO_UPDATE_FIELDS);
				const errorResponse = buildErrorResponse(config.ERROR.COMMON.NO_UPDATE_FIELDS, 400);
				res.status(400).json(errorResponse);
				return;
			}

			const validatedData = validationResult.data;

			leaveTypeLogger.info(`Updating leaveType: ${id}`);

			const existingLeaveType = await prisma.leaveType.findFirst({
				where: { id, organizationId: authReq.organizationId },
			});

			if (!existingLeaveType) {
				leaveTypeLogger.error(`${config.ERROR.LEAVETYPE.NOT_FOUND}: ${id}`);
				const errorResponse = buildErrorResponse(config.ERROR.LEAVETYPE.NOT_FOUND, 404);
				res.status(404).json(errorResponse);
				return;
			}

			const policyData = pickPolicyData(validatedData);
			const prismaData = { ...validatedData };
			for (const field of POLICY_FIELDS) delete (prismaData as Record<string, any>)[field];

			const updatedLeaveType = await prisma.leaveType.update({
				where: { id },
				data: {
					...policyData,
					...prismaData,
				},
			});
			await prisma.employeeLeaveBalance.updateMany({
				where: { organizationId: authReq.organizationId, leaveTypeId: id },
				data: {
					leaveTypeCodeSnapshot: updatedLeaveType.code,
					leaveTypeNameSnapshot: updatedLeaveType.name,
				},
			});

			try {
				await invalidateCache.byPattern(`cache:leaveType:byId:${authReq.organizationId}:${id}:*`);
				await invalidateCache.byPattern("cache:leaveType:list:*");
				leaveTypeLogger.info(`Cache invalidated after leaveType ${id} update`);
			} catch (cacheError) {
				leaveTypeLogger.warn(
					"Failed to invalidate cache after leaveType update:",
					cacheError,
				);
			}

			leaveTypeLogger.info(`${config.SUCCESS.LEAVETYPE.UPDATED}: ${updatedLeaveType.id}`);
			const successResponse = buildSuccessResponse(
				config.SUCCESS.LEAVETYPE.UPDATED,
				{ leaveType: updatedLeaveType },
				200,
			);
			res.status(200).json(successResponse);
		} catch (error) {
			leaveTypeLogger.error(`${config.ERROR.LEAVETYPE.ERROR_UPDATING}: ${error}`);
			const errorResponse = buildErrorResponse(
				config.ERROR.COMMON.INTERNAL_SERVER_ERROR,
				500,
			);
			res.status(500).json(errorResponse);
		}
	};

	const remove = async (req: Request, res: Response, _next: NextFunction) => {
		const authReq = req as AuthRequest;
		const { id } = req.params;

		try {
			if (!authReq.organizationId) {
				res.status(400).json(buildErrorResponse("Organization ID is required", 400));
				return;
			}
			if (!canManageLeaveTypes(authReq.role)) {
				res.status(403).json(buildErrorResponse("You are not authorized to manage leave types", 403));
				return;
			}
			if (!id) {
				leaveTypeLogger.error(config.ERROR.QUERY_PARAMS.MISSING_ID);
				const errorResponse = buildErrorResponse(config.ERROR.QUERY_PARAMS.MISSING_ID, 400);
				res.status(400).json(errorResponse);
				return;
			}

			leaveTypeLogger.info(`${config.SUCCESS.LEAVETYPE.DELETED}: ${id}`);

			const existingLeaveType = await prisma.leaveType.findFirst({
				where: { id, organizationId: authReq.organizationId },
			});

			if (!existingLeaveType) {
				leaveTypeLogger.error(`${config.ERROR.LEAVETYPE.NOT_FOUND}: ${id}`);
				const errorResponse = buildErrorResponse(config.ERROR.LEAVETYPE.NOT_FOUND, 404);
				res.status(404).json(errorResponse);
				return;
			}

			await prisma.leaveType.update({
				where: { id },
				data: { isActive: false, enabled: false },
			});

			try {
				await invalidateCache.byPattern(`cache:leaveType:byId:${authReq.organizationId}:${id}:*`);
				await invalidateCache.byPattern("cache:leaveType:list:*");
				leaveTypeLogger.info(`Cache invalidated after leaveType ${id} deletion`);
			} catch (cacheError) {
				leaveTypeLogger.warn(
					"Failed to invalidate cache after leaveType deletion:",
					cacheError,
				);
			}

			leaveTypeLogger.info(`${config.SUCCESS.LEAVETYPE.DELETED}: ${id}`);
			const successResponse = buildSuccessResponse("Leave type deactivated successfully", {}, 200);
			res.status(200).json(successResponse);
		} catch (error) {
			leaveTypeLogger.error(`${config.ERROR.LEAVETYPE.DELETE_FAILED}: ${error}`);
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
				res.status(400).json(buildErrorResponse("Organization ID is required", 400));
				return;
			}
			if (!canManageLeaveTypes(req.role)) {
				res.status(403).json(buildErrorResponse("You are not authorized to manage leave types", 403));
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

			for (const [index, row] of rows.entries()) {
				const rowNumber = index + 2;
				try {
					const code = String(getImportValue(row, ["CODE", "LEAVE_CODE", "LEAVE CODE", "LeaveCode"]) || "")
						.trim()
						.toUpperCase();
					const name = String(getImportValue(row, ["NAME", "LEAVE_TYPE", "LEAVE TYPE", "LeaveType"]) || "").trim();
					const description = String(getImportValue(row, ["DESCRIPTION", "DESC", "NOTES"]) || "").trim();
					const sortOrder = parseOptionalNumber(getImportValue(row, ["SORT_ORDER", "SORT ORDER", "ORDER"])) ?? index;
					const isActive = parseOptionalBoolean(getImportValue(row, ["IS_ACTIVE", "ACTIVE", "STATUS"])) ?? true;
					const isPaid = parseOptionalBoolean(getImportValue(row, ["IS_PAID", "PAID", "Paid"]));

					if (!code || !name) {
						summary.skipped++;
						summary.errors.push(`Row ${rowNumber}: CODE and NAME are required`);
						continue;
					}

					const validation = CreateLeaveTypeSchema.safeParse({
						code,
						name,
						description: description || undefined,
						sortOrder,
						isActive,
						enabled: isActive,
						...(isPaid !== undefined ? { isPaid } : {}),
					});

					if (!validation.success) {
						summary.skipped++;
						summary.errors.push(`Row ${rowNumber}: ${JSON.stringify(formatZodErrors(validation.error.format()))}`);
						continue;
					}

					const existing = await prisma.leaveType.findUnique({
						where: { organizationId_code: { organizationId: req.organizationId, code } },
					});
					const data = {
						...getDefaultLeavePolicySeed(validation.data.code),
						...validation.data,
						...pickPolicyData(validation.data),
						organizationId: req.organizationId,
					};

					if (existing) {
						await prisma.leaveType.update({
							where: { id: existing.id },
							data,
						});
						summary.updated++;
					} else {
						await prisma.leaveType.create({ data });
						summary.created++;
					}
				} catch (error) {
					summary.skipped++;
					summary.errors.push(
						`Row ${rowNumber}: ${error instanceof Error ? error.message : String(error)}`,
					);
				}
			}

			try {
				await invalidateCache.byPattern("cache:leaveType:list:*");
			} catch (cacheError) {
				leaveTypeLogger.warn("Failed to invalidate cache after leave type import:", cacheError);
			}

			res.status(200).json(
				buildSuccessResponse("Leave types imported successfully", {
					summary: {
						...summary,
						errors: summary.errors.slice(0, 20),
					},
				}, 200),
			);
		} catch (error) {
			leaveTypeLogger.error(`LeaveType import failed: ${error}`);
			res.status(500).json(
				buildErrorResponse(
					`Failed to import leave types: ${error instanceof Error ? error.message : String(error)}`,
					500,
				),
			);
		}
	};

	return { create, getAll, getById, update, remove, importFromXLSX };
};
