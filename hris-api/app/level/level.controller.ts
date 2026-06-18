import { Request, Response, NextFunction } from "express";
import { PrismaClient, Prisma } from "../../generated/prisma";
import { getLogger } from "../../helper/logger.helper";
import { transformFormDataToObject } from "../../helper/transformObject";
import { validateQueryParams } from "../../helper/validation-helper";
import * as XLSX from "xlsx";
import {
	buildFilterConditions,
	buildFindManyQuery,
	buildSearchConditions,
	getNestedFields,
} from "../../helper/query-builder.helper";
import { buildSuccessResponse, buildPagination } from "../../helper/success-handler.helper";
import { groupDataByField } from "../../helper/dataGrouping";
import { buildErrorResponse, formatZodErrors } from "../../helper/error-handler";
import { CreateLevelSchema, UpdateLevelSchema } from "../../zod/level.zod";
import { logActivity } from "../../utils/activityLogger";
import { logAudit } from "../../utils/auditLogger";
import { config } from "../../config/constant";
import { redisClient } from "../../config/redis";
import { invalidateCache } from "../../middleware/cache";

const logger = getLogger();
const levelLogger = logger.child({ module: "level" });

export const controller = (prisma: PrismaClient) => {
	const create = async (req: Request, res: Response, _next: NextFunction) => {
		let requestData = req.body;
		const contentType = req.get("Content-Type") || "";

		if (
			contentType.includes("application/x-www-form-urlencoded") ||
			contentType.includes("multipart/form-data")
		) {
			levelLogger.info("Original form data:", JSON.stringify(req.body, null, 2));
			requestData = transformFormDataToObject(req.body);
			levelLogger.info(
				"Transformed form data to object structure:",
				JSON.stringify(requestData, null, 2),
			);
		}

		const validation = CreateLevelSchema.safeParse(requestData);
		if (!validation.success) {
			const formattedErrors = formatZodErrors(validation.error.format());
			levelLogger.error(`Validation failed: ${JSON.stringify(formattedErrors)}`);
			const errorResponse = buildErrorResponse("Validation failed", 400, formattedErrors);
			res.status(400).json(errorResponse);
			return;
		}

		try {
			const level = await prisma.level.create({ data: validation.data });
			levelLogger.info(`Level created successfully: ${level.id}`);

			logActivity(req, {
				userId: (req as any).user?.id || "unknown",
				action: config.ACTIVITY_LOG.LEVEL.ACTIONS.CREATE_LEVEL,
				description: `${config.ACTIVITY_LOG.LEVEL.DESCRIPTIONS.LEVEL_CREATED}: ${level.name || level.id}`,
				page: {
					url: req.originalUrl,
					title: config.ACTIVITY_LOG.LEVEL.PAGES.LEVEL_CREATION,
				},
			});

			logAudit(req, {
				userId: (req as any).user?.id || "unknown",
				action: config.AUDIT_LOG.ACTIONS.CREATE,
				resource: config.AUDIT_LOG.RESOURCES.LEVEL,
				severity: config.AUDIT_LOG.SEVERITY.LOW,
				entityType: config.AUDIT_LOG.ENTITY_TYPES.LEVEL,
				entityId: level.id,
				changesBefore: null,
				changesAfter: {
					id: level.id,
					name: level.name,
					description: level.description,
					createdAt: level.createdAt,
					updatedAt: level.updatedAt,
				},
				description: `${config.AUDIT_LOG.LEVEL.DESCRIPTIONS.LEVEL_CREATED}: ${level.name || level.id}`,
			});

			try {
				await invalidateCache.byPattern("cache:level:list:*");
				levelLogger.info("Level list cache invalidated after creation");
			} catch (cacheError) {
				levelLogger.warn("Failed to invalidate cache after level creation:", cacheError);
			}

			const successResponse = buildSuccessResponse(config.SUCCESS.LEVEL.CREATED, level, 201);
			res.status(201).json(successResponse);
		} catch (error) {
			levelLogger.error(`${config.ERROR.LEVEL.CREATE_FAILED}: ${error}`);
			const errorResponse = buildErrorResponse(
				config.ERROR.COMMON.INTERNAL_SERVER_ERROR,
				500,
			);
			res.status(500).json(errorResponse);
		}
	};
	const getAll = async (req: Request, res: Response, _next: NextFunction) => {
		const validationResult = validateQueryParams(req, levelLogger);

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

		levelLogger.info(
			`Getting levels, page: ${page}, limit: ${limit}, query: ${query}, order: ${order}, groupBy: ${groupBy}`,
		);

		try {
			// Base where clause
			const whereClause: Prisma.LevelWhereInput = {
				isDeleted: false,
			};

			const searchFields = ["name", "description"];
			if (query) {
				const searchConditions = buildSearchConditions("Level", query, searchFields);
				if (searchConditions.length > 0) {
					whereClause.OR = searchConditions;
				}
			}

			if (filter) {
				const filterConditions = buildFilterConditions("Level", filter);
				if (filterConditions.length > 0) {
					whereClause.AND = filterConditions;
				}
			}
			const findManyQuery = buildFindManyQuery(whereClause, skip, limit, order, sort, fields);

			// Add positionLevels relation - use select if fields are specified, otherwise use include
			if (findManyQuery.select) {
				// If select is used, add positionLevels to select
				(findManyQuery.select as any).positionLevels = {
					select: {
						id: true,
						levelId: true,
						positionId: true,
						position: {
							select: {
								id: true,
								title: true,
								code: true,
								description: true,
							},
						},
					},
				};
			} else {
				// If no select, use include
				findManyQuery.include = {
					...findManyQuery.include,
					positionLevels: {
						include: {
							position: true,
						},
					},
				};
			}

			const [levels, total] = await Promise.all([
				document ? prisma.level.findMany(findManyQuery) : [],
				count ? prisma.level.count({ where: whereClause }) : 0,
			]);

			levelLogger.info(`Retrieved ${levels.length} levels`);
			const processedData =
				groupBy && document ? groupDataByField(levels, groupBy as string) : levels;

			const responseData: Record<string, any> = {
				...(document && { levels: processedData }),
				...(count && { count: total }),
				...(pagination && { pagination: buildPagination(total, page, limit) }),
				...(groupBy && { groupedBy: groupBy }),
			};

			res.status(200).json(
				buildSuccessResponse(config.SUCCESS.LEVEL.RETRIEVED_ALL, responseData, 200),
			);
		} catch (error) {
			levelLogger.error(`${config.ERROR.LEVEL.GET_ALL_FAILED}: ${error}`);
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
				levelLogger.error(config.ERROR.QUERY_PARAMS.MISSING_ID);
				const errorResponse = buildErrorResponse(config.ERROR.QUERY_PARAMS.MISSING_ID, 400);
				res.status(400).json(errorResponse);
				return;
			}

			if (fields && typeof fields !== "string") {
				levelLogger.error(`${config.ERROR.QUERY_PARAMS.INVALID_POPULATE}: ${fields}`);
				const errorResponse = buildErrorResponse(
					config.ERROR.QUERY_PARAMS.POPULATE_MUST_BE_STRING,
					400,
				);
				res.status(400).json(errorResponse);
				return;
			}

			levelLogger.info(`${config.SUCCESS.LEVEL.GETTING_BY_ID}: ${id}`);

			const cacheKey = `cache:level:byId:${id}:${fields || "full"}`;
			let level = null;

			try {
				if (redisClient.isClientConnected()) {
					level = await redisClient.getJSON(cacheKey);
					if (level) {
						levelLogger.info(`Level ${id} retrieved from direct Redis cache`);
					}
				}
			} catch (cacheError) {
				levelLogger.warn(`Redis cache retrieval failed for level ${id}:`, cacheError);
			}

			if (!level) {
				const query: Prisma.LevelFindFirstArgs = {
					where: { id },
				};

				query.select = getNestedFields(fields);

				// Add positionLevels relation - use select if fields are specified, otherwise use include
				if (query.select) {
					// If select is used, add positionLevels to select
					(query.select as any).positionLevels = {
						select: {
							id: true,
							levelId: true,
							positionId: true,
							position: {
								select: {
									id: true,
									title: true,
									code: true,
									description: true,
								},
							},
						},
					};
				} else {
					// If no select, use include
					query.include = {
						positionLevels: {
							include: {
								position: true,
							},
						},
					};
				}

				level = await prisma.level.findFirst(query);

				if (level && redisClient.isClientConnected()) {
					try {
						await redisClient.setJSON(cacheKey, level, 3600);
						levelLogger.info(`Level ${id} stored in direct Redis cache`);
					} catch (cacheError) {
						levelLogger.warn(`Failed to store level ${id} in Redis cache:`, cacheError);
					}
				}
			}

			if (!level) {
				levelLogger.error(`${config.ERROR.LEVEL.NOT_FOUND}: ${id}`);
				const errorResponse = buildErrorResponse(config.ERROR.LEVEL.NOT_FOUND, 404);
				res.status(404).json(errorResponse);
				return;
			}

			levelLogger.info(`${config.SUCCESS.LEVEL.RETRIEVED}: ${(level as any).id}`);
			const successResponse = buildSuccessResponse(
				config.SUCCESS.LEVEL.RETRIEVED,
				level,
				200,
			);
			res.status(200).json(successResponse);
		} catch (error) {
			levelLogger.error(`${config.ERROR.LEVEL.ERROR_GETTING}: ${error}`);
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
				levelLogger.error(config.ERROR.QUERY_PARAMS.MISSING_ID);
				const errorResponse = buildErrorResponse(config.ERROR.QUERY_PARAMS.MISSING_ID, 400);
				res.status(400).json(errorResponse);
				return;
			}

			let body = req.body;
			const contentType = req.get("Content-Type") || "";
			if (
				contentType.includes("application/x-www-form-urlencoded") ||
				contentType.includes("multipart/form-data")
			) {
				body = transformFormDataToObject(req.body);
			}

			const validationResult = UpdateLevelSchema.safeParse(body);

			if (!validationResult.success) {
				const formattedErrors = formatZodErrors(validationResult.error.format());
				levelLogger.error(`Validation failed: ${JSON.stringify(formattedErrors)}`);
				const errorResponse = buildErrorResponse("Validation failed", 400, formattedErrors);
				res.status(400).json(errorResponse);
				return;
			}

			if (Object.keys(body).length === 0) {
				levelLogger.error(config.ERROR.COMMON.NO_UPDATE_FIELDS);
				const errorResponse = buildErrorResponse(config.ERROR.COMMON.NO_UPDATE_FIELDS, 400);
				res.status(400).json(errorResponse);
				return;
			}

			const validatedData = validationResult.data;

			levelLogger.info(`Updating level: ${id}`);

			const existingLevel = await prisma.level.findFirst({
				where: { id },
			});

			if (!existingLevel) {
				levelLogger.error(`${config.ERROR.LEVEL.NOT_FOUND}: ${id}`);
				const errorResponse = buildErrorResponse(config.ERROR.LEVEL.NOT_FOUND, 404);
				res.status(404).json(errorResponse);
				return;
			}

			const prismaData = { ...validatedData };

			const updatedLevel = await prisma.level.update({
				where: { id },
				data: prismaData,
			});

			try {
				await invalidateCache.byPattern(`cache:level:byId:${id}:*`);
				await invalidateCache.byPattern("cache:level:list:*");
				levelLogger.info(`Cache invalidated after level ${id} update`);
			} catch (cacheError) {
				levelLogger.warn("Failed to invalidate cache after level update:", cacheError);
			}

			levelLogger.info(`${config.SUCCESS.LEVEL.UPDATED}: ${updatedLevel.id}`);
			const successResponse = buildSuccessResponse(
				config.SUCCESS.LEVEL.UPDATED,
				{ level: updatedLevel },
				200,
			);
			res.status(200).json(successResponse);
		} catch (error) {
			levelLogger.error(`${config.ERROR.LEVEL.ERROR_UPDATING}: ${error}`);
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
				levelLogger.error(config.ERROR.QUERY_PARAMS.MISSING_ID);
				const errorResponse = buildErrorResponse(config.ERROR.QUERY_PARAMS.MISSING_ID, 400);
				res.status(400).json(errorResponse);
				return;
			}

			levelLogger.info(`${config.SUCCESS.LEVEL.DELETED}: ${id}`);

			const existingLevel = await prisma.level.findFirst({
				where: { id },
			});

			if (!existingLevel) {
				levelLogger.error(`${config.ERROR.LEVEL.NOT_FOUND}: ${id}`);
				const errorResponse = buildErrorResponse(config.ERROR.LEVEL.NOT_FOUND, 404);
				res.status(404).json(errorResponse);
				return;
			}

			await prisma.level.delete({
				where: { id },
			});

			try {
				await invalidateCache.byPattern(`cache:level:byId:${id}:*`);
				await invalidateCache.byPattern("cache:level:list:*");
				levelLogger.info(`Cache invalidated after level ${id} deletion`);
			} catch (cacheError) {
				levelLogger.warn("Failed to invalidate cache after level deletion:", cacheError);
			}

			levelLogger.info(`${config.SUCCESS.LEVEL.DELETED}: ${id}`);
			const successResponse = buildSuccessResponse(config.SUCCESS.LEVEL.DELETED, {}, 200);
			res.status(200).json(successResponse);
		} catch (error) {
			levelLogger.error(`${config.ERROR.LEVEL.DELETE_FAILED}: ${error}`);
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
				const errorResponse = buildErrorResponse("No file uploaded", 400);
				res.status(400).json(errorResponse);
				return;
			}

			const workbook = XLSX.read(file.buffer, { type: "buffer" });
			const sheetName = workbook.SheetNames[0];
			const worksheet = workbook.Sheets[sheetName];
			const data = XLSX.utils.sheet_to_json(worksheet) as any[];

			levelLogger.info(`Processing ${data.length} levels from XLSX`);

			const authReq = req as any;
			const organizationId = authReq.organizationId;

			if (!organizationId) {
				const errorResponse = buildErrorResponse("Organization ID not found", 400);
				res.status(400).json(errorResponse);
				return;
			}

			let created = 0;
			let updated = 0;
			let skipped = 0;

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

			for (const row of data) {
				try {
					const { NAME, RANK, DESCRIPTION } = row;
					const normalizedName =
						typeof NAME === "string" ? NAME.trim() : NAME ? String(NAME).trim() : "";
					const hasManagerColumn =
						"IS_MANAGER" in row ||
						"isManager" in row ||
						"IS MANAGER" in row ||
						"MANAGER_FLAG" in row;
					const isManager = parseOptionalBoolean(
						row.IS_MANAGER ??
							row.isManager ??
							row["IS MANAGER"] ??
							row.MANAGER_FLAG ??
							"",
					);
					const parsedRank =
						RANK === undefined || RANK === null || RANK === ""
							? undefined
							: Number.parseInt(String(RANK), 10);

					if (!normalizedName) {
						levelLogger.warn("Skipping row without NAME");
						skipped++;
						continue;
					}

					const existingLevel = await prisma.level.findFirst({
						where: {
							organizationId,
							name: normalizedName,
						},
					});

					if (existingLevel) {
						const updateData: Prisma.LevelUpdateInput = {
							...(Number.isNaN(parsedRank)
								? {}
								: parsedRank !== undefined
									? { rank: parsedRank }
									: {}),
							...(DESCRIPTION !== undefined
								? { description: String(DESCRIPTION || "") }
								: {}),
							...(hasManagerColumn && isManager !== null ? { isManager } : {}),
						};

						await prisma.level.update({
							where: { id: existingLevel.id },
							data: updateData,
						});
						updated++;
						levelLogger.info(`Updated level: ${normalizedName}`);
					} else {
						await prisma.level.create({
							data: {
								organizationId,
								name: normalizedName,
								rank:
									Number.isNaN(parsedRank) || parsedRank === undefined
										? 0
										: parsedRank,
								description: DESCRIPTION || "",
								...(hasManagerColumn && isManager !== null
									? { isManager }
									: { isManager: false }),
							},
						});
						created++;
						levelLogger.info(`Created level: ${normalizedName}`);
					}
				} catch (rowError) {
					levelLogger.error(`Error processing row: ${JSON.stringify(row)}`, rowError);
					skipped++;
				}
			}

			try {
				await invalidateCache.byPattern("cache:level:list:*");
				levelLogger.info("Level list cache invalidated after import");
			} catch (cacheError) {
				levelLogger.warn("Failed to invalidate cache after level import:", cacheError);
			}

			const summary = {
				total: data.length,
				created,
				updated,
				skipped,
			};

			levelLogger.info(`Import completed: ${JSON.stringify(summary)}`);
			const successResponse = buildSuccessResponse(
				"Levels imported successfully",
				{ summary },
				200,
			);
			res.status(200).json(successResponse);
		} catch (error) {
			levelLogger.error(`Import failed: ${error}`);
			const errorResponse = buildErrorResponse(
				config.ERROR.COMMON.INTERNAL_SERVER_ERROR,
				500,
			);
			res.status(500).json(errorResponse);
		}
	};

	return { create, getAll, getById, update, remove, importFromXLSX };
};
