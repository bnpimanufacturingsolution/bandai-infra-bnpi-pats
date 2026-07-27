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
import { CreatePositionSchema, UpdatePositionSchema } from "../../zod/position.zod";
import { logActivity } from "../../utils/activityLogger";
import { logAudit } from "../../utils/auditLogger";
import { config } from "../../config/constant";
import { redisClient } from "../../config/redis";
import { invalidateCache } from "../../middleware/cache";
import { suggestUniqueConfigCode } from "../../helper/config-code.helper";

const logger = getLogger();
const positionLogger = logger.child({ module: "position" });

const sanitizePositionFields = (fields: unknown): string | undefined => {
	if (typeof fields !== "string") return undefined;
	const nextFields = fields
		.split(",")
		.map((field) => field.trim())
		.filter(
			(field) =>
				field &&
				field !== "departmentId" &&
				!field.startsWith("department."),
		)
		.join(",");
	return nextFields || undefined;
};

const withDerivedPositionFields = <T extends Record<string, any>>(position: T): T => ({
	...position,
	isManager:
		Boolean(position.isManager) ||
		(Array.isArray(position.levels)
			? position.levels.some((positionLevel: any) => Boolean(positionLevel?.level?.isManager))
			: false),
});

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
					const existingPosition = await prisma.position.findUnique({
						where: {
							organizationId_code: {
								organizationId,
								code: candidateCode,
							},
						},
						select: { id: true },
					});
					return Boolean(existingPosition);
				},
			});

			const successResponse = buildSuccessResponse(
				"Position code generated successfully",
				suggestion,
				200,
			);
			res.status(200).json(successResponse);
		} catch (error) {
			positionLogger.error(`Position generateCode failed: ${error}`);
			const errorResponse = buildErrorResponse(
				config.ERROR.COMMON.INTERNAL_SERVER_ERROR,
				500,
			);
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
			positionLogger.info("Original form data:", JSON.stringify(req.body, null, 2));
			requestData = transformFormDataToObject(req.body);
			positionLogger.info(
				"Transformed form data to object structure:",
				JSON.stringify(requestData, null, 2),
			);
		}

		const validation = CreatePositionSchema.safeParse(requestData);
		if (!validation.success) {
			const formattedErrors = formatZodErrors(validation.error.format());
			positionLogger.error(`Validation failed: ${JSON.stringify(formattedErrors)}`);
			const errorResponse = buildErrorResponse("Validation failed", 400, formattedErrors);
			res.status(400).json(errorResponse);
			return;
		}

		try {
			// Extract levelIds if present
			const { levelIds, ...positionData } = validation.data as any;

			const existingPosition = await prisma.position.findUnique({
				where: {
					organizationId_code: {
						organizationId: positionData.organizationId,
						code: positionData.code,
					},
				},
			});

			if (existingPosition) {
				res.status(409).json({
					status: 409,
					message: `Position with code ${positionData.code} already exists in this organization`,
					timestamp: new Date().toISOString(),
				});
				return;
			}

			if (positionData.sectionId) {
				const section = await prisma.section.findFirst({
					where: {
						id: positionData.sectionId,
						organizationId: positionData.organizationId,
						isDeleted: false,
					},
					select: { id: true },
				});
				if (!section) {
					const errorResponse = buildErrorResponse(
						"Section not found for this organization",
						400,
					);
					res.status(400).json(errorResponse);
					return;
				}
			}

			const position = await prisma.position.create({
				data: {
					...positionData,
					levels:
						levelIds && Array.isArray(levelIds) && levelIds.length > 0
							? {
									create: levelIds.map((levelId: string) => ({
										levelId: levelId,
									})),
								}
							: undefined,
				},
				include: {
					levels: {
						include: {
							level: true,
						},
					},
				},
			});

			positionLogger.info(`Position created successfully: ${position.id}`);

			logActivity(req, {
				userId: (req as any).user?.id || "unknown",
				action: config.ACTIVITY_LOG.POSITION.ACTIONS.CREATE_POSITION,
				description: `${config.ACTIVITY_LOG.POSITION.DESCRIPTIONS.POSITION_CREATED}: ${position.title || position.id}`,
				page: {
					url: req.originalUrl,
					title: config.ACTIVITY_LOG.POSITION.PAGES.POSITION_CREATION,
				},
			});

			logAudit(req, {
				userId: (req as any).user?.id || "unknown",
				action: config.AUDIT_LOG.ACTIONS.CREATE,
				resource: config.AUDIT_LOG.RESOURCES.POSITION,
				severity: config.AUDIT_LOG.SEVERITY.LOW,
				entityType: config.AUDIT_LOG.ENTITY_TYPES.POSITION,
				entityId: position.id,
				changesBefore: null,
				changesAfter: {
					id: position.id,
					title: position.title,
					description: position.description,
					createdAt: position.createdAt,
					updatedAt: position.updatedAt,
				},
				description: `${config.AUDIT_LOG.POSITION.DESCRIPTIONS.POSITION_CREATED}: ${position.title || position.id}`,
			});

			try {
				await invalidateCache.byPattern("cache:position:list:*");
				positionLogger.info("Position list cache invalidated after creation");
			} catch (cacheError) {
				positionLogger.warn(
					"Failed to invalidate cache after position creation:",
					cacheError,
				);
			}

			const successResponse = buildSuccessResponse(
				config.SUCCESS.POSITION.CREATED,
				withDerivedPositionFields(position as any),
				201,
			);
			res.status(201).json(successResponse);
		} catch (error) {
			positionLogger.error(`${config.ERROR.POSITION.CREATE_FAILED}: ${error}`);
			const errorResponse = buildErrorResponse(
				config.ERROR.COMMON.INTERNAL_SERVER_ERROR,
				500,
			);
			res.status(500).json(errorResponse);
		}
	};
	const getAll = async (req: Request, res: Response, _next: NextFunction) => {
		const validationResult = validateQueryParams(req, positionLogger);

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

		positionLogger.info(
			`Getting positions, page: ${page}, limit: ${limit}, query: ${query}, order: ${order}, groupBy: ${groupBy}`,
		);

		try {
			// Base where clause
			const whereClause: Prisma.PositionWhereInput = {
				isDeleted: false,
			};

			const searchFields = ["title", "code", "description"];
			if (query) {
				const searchConditions = buildSearchConditions("Position", query, searchFields);
				if (searchConditions.length > 0) {
					whereClause.OR = searchConditions;
				}
			}

			if (filter) {
				const filterConditions = buildFilterConditions("Position", filter);
				if (filterConditions.length > 0) {
					whereClause.AND = filterConditions;
				}
			}
			const safeFields = sanitizePositionFields(fields);
			const findManyQuery = buildFindManyQuery(
				whereClause,
				skip,
				limit,
				order,
				sort,
				safeFields,
			);

			// Add levels relation - use select if fields are specified, otherwise use include
			if (findManyQuery.select) {
				// If select is used, add levels to select
				(findManyQuery.select as any).levels = {
					select: {
						id: true,
						levelId: true,
						positionId: true,
						level: {
							select: {
								id: true,
								name: true,
								rank: true,
								description: true,
								isManager: true,
							},
						},
					},
				};
				(findManyQuery.select as any).section = {
					select: {
						id: true,
						name: true,
						code: true,
						departmentId: true,
						department: {
							select: {
								id: true,
								name: true,
								code: true,
							},
						},
					},
				};
			} else {
				// If no select, use include
				findManyQuery.include = {
					levels: {
						include: {
							level: true,
						},
					},
					section: {
						include: {
							department: true,
						},
					},
				};
			}

			const [positions, total] = await Promise.all([
				document ? prisma.position.findMany(findManyQuery) : [],
				count ? prisma.position.count({ where: whereClause }) : 0,
			]);

			positionLogger.info(`Retrieved ${positions.length} positions`);
			const enrichedPositions = positions.map((position) =>
				withDerivedPositionFields(position as any),
			);
			const processedData =
				groupBy && document
					? groupDataByField(enrichedPositions, groupBy as string)
					: enrichedPositions;

			const responseData: Record<string, any> = {
				...(document && { positions: processedData }),
				...(count && { count: total }),
				...(pagination && { pagination: buildPagination(total, page, limit) }),
				...(groupBy && { groupedBy: groupBy }),
			};

			res.status(200).json(
				buildSuccessResponse(config.SUCCESS.POSITION.RETRIEVED_ALL, responseData, 200),
			);
		} catch (error) {
			positionLogger.error(`${config.ERROR.POSITION.GET_ALL_FAILED}: ${error}`);
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
				positionLogger.error(config.ERROR.QUERY_PARAMS.MISSING_ID);
				const errorResponse = buildErrorResponse(config.ERROR.QUERY_PARAMS.MISSING_ID, 400);
				res.status(400).json(errorResponse);
				return;
			}

			if (fields && typeof fields !== "string") {
				positionLogger.error(`${config.ERROR.QUERY_PARAMS.INVALID_POPULATE}: ${fields}`);
				const errorResponse = buildErrorResponse(
					config.ERROR.QUERY_PARAMS.POPULATE_MUST_BE_STRING,
					400,
				);
				res.status(400).json(errorResponse);
				return;
			}

			positionLogger.info(`${config.SUCCESS.POSITION.GETTING_BY_ID}: ${id}`);

			const cacheKey = `cache:position:byId:${id}:${fields || "full"}`;
			let position = null;

			try {
				if (redisClient.isClientConnected()) {
					position = await redisClient.getJSON(cacheKey);
					if (position) {
						positionLogger.info(`Position ${id} retrieved from direct Redis cache`);
					}
				}
			} catch (cacheError) {
				positionLogger.warn(`Redis cache retrieval failed for position ${id}:`, cacheError);
			}

			if (!position) {
				const query: Prisma.PositionFindFirstArgs = {
					where: { id },
				};

				query.select = getNestedFields(sanitizePositionFields(fields));

				// Add levels relation - use select if fields are specified, otherwise use include
				if (query.select) {
					// If select is used, add levels to select
					(query.select as any).levels = {
						select: {
							id: true,
							levelId: true,
							positionId: true,
							level: {
								select: {
									id: true,
									name: true,
									rank: true,
									description: true,
									isManager: true,
								},
							},
						},
					};
					(query.select as any).section = {
						select: {
							id: true,
							name: true,
							code: true,
							departmentId: true,
							department: {
								select: {
									id: true,
									name: true,
									code: true,
								},
							},
						},
					};
				} else {
					// If no select, use include
					query.include = {
						levels: {
							include: {
								level: true,
							},
						},
						section: {
							include: {
								department: true,
							},
						},
					};
				}

				position = await prisma.position.findFirst(query);

				if (position && redisClient.isClientConnected()) {
					try {
						await redisClient.setJSON(cacheKey, position, 3600);
						positionLogger.info(`Position ${id} stored in direct Redis cache`);
					} catch (cacheError) {
						positionLogger.warn(
							`Failed to store position ${id} in Redis cache:`,
							cacheError,
						);
					}
				}
			}

			if (position) {
				position = withDerivedPositionFields(position as any);
			}

			if (!position) {
				positionLogger.error(`${config.ERROR.POSITION.NOT_FOUND}: ${id}`);
				const errorResponse = buildErrorResponse(config.ERROR.POSITION.NOT_FOUND, 404);
				res.status(404).json(errorResponse);
				return;
			}

			positionLogger.info(`${config.SUCCESS.POSITION.RETRIEVED}: ${(position as any).id}`);
			const successResponse = buildSuccessResponse(
				config.SUCCESS.POSITION.RETRIEVED,
				position,
				200,
			);
			res.status(200).json(successResponse);
		} catch (error) {
			positionLogger.error(`${config.ERROR.POSITION.ERROR_GETTING}: ${error}`);
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
				positionLogger.error(config.ERROR.QUERY_PARAMS.MISSING_ID);
				const errorResponse = buildErrorResponse(config.ERROR.QUERY_PARAMS.MISSING_ID, 400);
				res.status(400).json(errorResponse);
				return;
			}

			const validationResult = UpdatePositionSchema.safeParse(req.body);

			if (!validationResult.success) {
				const formattedErrors = formatZodErrors(validationResult.error.format());
				positionLogger.error(`Validation failed: ${JSON.stringify(formattedErrors)}`);
				const errorResponse = buildErrorResponse("Validation failed", 400, formattedErrors);
				res.status(400).json(errorResponse);
				return;
			}

			if (Object.keys(req.body).length === 0) {
				positionLogger.error(config.ERROR.COMMON.NO_UPDATE_FIELDS);
				const errorResponse = buildErrorResponse(config.ERROR.COMMON.NO_UPDATE_FIELDS, 400);
				res.status(400).json(errorResponse);
				return;
			}

			const validatedData = validationResult.data as any;

			positionLogger.info(`Updating position: ${id}`);

			const existingPosition = await prisma.position.findFirst({
				where: { id },
			});

			if (!existingPosition) {
				positionLogger.error(`${config.ERROR.POSITION.NOT_FOUND}: ${id}`);
				const errorResponse = buildErrorResponse(config.ERROR.POSITION.NOT_FOUND, 404);
				res.status(404).json(errorResponse);
				return;
			}

			// Extract levelIds if present
			const { levelIds, ...positionData } = validatedData;

			if (positionData.sectionId) {
				const section = await prisma.section.findFirst({
					where: {
						id: positionData.sectionId,
						organizationId: existingPosition.organizationId,
						isDeleted: false,
					},
					select: { id: true },
				});
				if (!section) {
					const errorResponse = buildErrorResponse(
						"Section not found for this organization",
						400,
					);
					res.status(400).json(errorResponse);
					return;
				}
			}

			// Update position with levels relation
			const updatedPosition = await prisma.position.update({
				where: { id },
				data: {
					...positionData,
					levels:
						levelIds !== undefined
							? {
									deleteMany: {},
									create:
										Array.isArray(levelIds) && levelIds.length > 0
											? levelIds.map((levelId: string) => ({
													levelId: levelId,
												}))
											: [],
								}
							: undefined,
				},
				include: {
					levels: {
						include: {
							level: true,
						},
					},
				},
			});

			try {
				await invalidateCache.byPattern(`cache:position:byId:${id}:*`);
				await invalidateCache.byPattern("cache:position:list:*");
				positionLogger.info(`Cache invalidated after position ${id} update`);
			} catch (cacheError) {
				positionLogger.warn(
					"Failed to invalidate cache after position update:",
					cacheError,
				);
			}

			positionLogger.info(`${config.SUCCESS.POSITION.UPDATED}: ${updatedPosition.id}`);
			const successResponse = buildSuccessResponse(
				config.SUCCESS.POSITION.UPDATED,
				{ position: withDerivedPositionFields(updatedPosition as any) },
				200,
			);
			res.status(200).json(successResponse);
		} catch (error) {
			positionLogger.error(`${config.ERROR.POSITION.ERROR_UPDATING}: ${error}`);
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
				positionLogger.error(config.ERROR.QUERY_PARAMS.MISSING_ID);
				const errorResponse = buildErrorResponse(config.ERROR.QUERY_PARAMS.MISSING_ID, 400);
				res.status(400).json(errorResponse);
				return;
			}

			positionLogger.info(`${config.SUCCESS.POSITION.DELETED}: ${id}`);

			const existingPosition = await prisma.position.findFirst({
				where: { id },
			});

			if (!existingPosition) {
				positionLogger.error(`${config.ERROR.POSITION.NOT_FOUND}: ${id}`);
				const errorResponse = buildErrorResponse(config.ERROR.POSITION.NOT_FOUND, 404);
				res.status(404).json(errorResponse);
				return;
			}

			await prisma.position.delete({
				where: { id },
			});

			try {
				await invalidateCache.byPattern(`cache:position:byId:${id}:*`);
				await invalidateCache.byPattern("cache:position:list:*");
				positionLogger.info(`Cache invalidated after position ${id} deletion`);
			} catch (cacheError) {
				positionLogger.warn(
					"Failed to invalidate cache after position deletion:",
					cacheError,
				);
			}

			positionLogger.info(`${config.SUCCESS.POSITION.DELETED}: ${id}`);
			const successResponse = buildSuccessResponse(config.SUCCESS.POSITION.DELETED, {}, 200);
			res.status(200).json(successResponse);
		} catch (error) {
			positionLogger.error(`${config.ERROR.POSITION.DELETE_FAILED}: ${error}`);
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
			const data = XLSX.utils.sheet_to_json(worksheet, { defval: "" }) as any[];

			positionLogger.info(`Processing ${data.length} positions from XLSX`);

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
			const errors: string[] = [];

			for (const [index, row] of data.entries()) {
				const rowNumber = index + 2;
				try {
					const {
						CODE,
						TITLE,
						DESCRIPTION,
						DEPARTMENT_CODE,
						SECTION_CODE,
						MIN_SALARY,
						MAX_SALARY,
						LEVELS,
					} = row;
					const code = String(CODE || "").trim();
					const title = String(TITLE || "").trim();

					if (!code || !title) {
						const message = `Row ${rowNumber}: CODE and TITLE are required`;
						positionLogger.warn(message);
						errors.push(message);
						skipped++;
						continue;
					}

					let departmentId = null;
					const departmentCode = String(DEPARTMENT_CODE || "").trim();
					if (departmentCode) {
						const department = await prisma.department.findFirst({
							where: {
								organizationId,
								code: departmentCode,
							},
						});

						if (department) {
							departmentId = department.id;
						} else {
							const message = `Row ${rowNumber}: department not found (${departmentCode})`;
							positionLogger.warn(message);
							errors.push(message);
							skipped++;
							continue;
						}
					}

					let sectionId = null;
					const sectionCode = String(SECTION_CODE || "").trim();
					if (sectionCode) {
						const section = await prisma.section.findFirst({
							where: {
								organizationId,
								code: sectionCode,
								...(departmentId ? { departmentId } : {}),
								isDeleted: false,
							},
						});

						if (section) {
							sectionId = section.id;
						} else {
							const message = `Row ${rowNumber}: section not found (${sectionCode})`;
							positionLogger.warn(message);
							errors.push(message);
							skipped++;
							continue;
						}
					}

					// Parse levels (comma-separated)
					const levelNames = LEVELS
						? String(LEVELS)
								.split(",")
								.map((name: string) => name.trim())
								.filter(Boolean)
						: [];
					const levelIds: string[] = [];
					const missingLevels: string[] = [];

					// Find existing levels. Missing levels are reported instead of auto-created.
					for (const levelName of levelNames) {
						const level = await prisma.level.findFirst({
							where: {
								organizationId,
								name: levelName,
							},
						});

						if (!level) {
							missingLevels.push(levelName);
							continue;
						}

						levelIds.push(level.id);
					}
					if (missingLevels.length > 0) {
						const message = `Row ${rowNumber}: level(s) not found (${missingLevels.join(", ")})`;
						positionLogger.warn(message);
						errors.push(message);
						skipped++;
						continue;
					}

					const minSalary =
						MIN_SALARY === undefined || MIN_SALARY === null || MIN_SALARY === ""
							? undefined
							: Number.parseFloat(String(MIN_SALARY));
					const maxSalary =
						MAX_SALARY === undefined || MAX_SALARY === null || MAX_SALARY === ""
							? undefined
							: Number.parseFloat(String(MAX_SALARY));
					if (
						(minSalary !== undefined && Number.isNaN(minSalary)) ||
						(maxSalary !== undefined && Number.isNaN(maxSalary))
					) {
						const message = `Row ${rowNumber}: MIN_SALARY and MAX_SALARY must be numbers when provided`;
						positionLogger.warn(message);
						errors.push(message);
						skipped++;
						continue;
					}

					// Check if position exists
					const existingPosition = await prisma.position.findFirst({
						where: {
							organizationId,
							code,
						},
					});

					if (existingPosition) {
						// Update position
						await prisma.position.update({
							where: { id: existingPosition.id },
							data: {
								title,
								description:
									DESCRIPTION !== undefined && DESCRIPTION !== null
										? String(DESCRIPTION || "")
										: existingPosition.description,
								sectionId:
									sectionId !== null ? sectionId : existingPosition.sectionId,
								minSalary:
									minSalary !== undefined
										? minSalary
										: existingPosition.minSalary,
								maxSalary:
									maxSalary !== undefined
										? maxSalary
										: existingPosition.maxSalary,
							},
						});

						// Delete existing position levels
						await prisma.positionLevel.deleteMany({
							where: { positionId: existingPosition.id },
						});

						// Create new position levels
						if (levelIds.length > 0) {
							await prisma.positionLevel.createMany({
								data: levelIds.map((levelId) => ({
									positionId: existingPosition.id,
									levelId,
								})),
							});
						}

						updated++;
						positionLogger.info(`Updated position: ${code}`);
					} else {
						// Create position
						const newPosition = await prisma.position.create({
							data: {
								organizationId,
								code,
								title,
								description: String(DESCRIPTION || ""),
								sectionId,
								minSalary: minSalary ?? null,
								maxSalary: maxSalary ?? null,
							},
						});

						// Create position levels
						if (levelIds.length > 0) {
							await prisma.positionLevel.createMany({
								data: levelIds.map((levelId) => ({
									positionId: newPosition.id,
									levelId,
								})),
							});
						}

						created++;
						positionLogger.info(`Created position: ${code}`);
					}
				} catch (rowError) {
					positionLogger.error(`Error processing row: ${JSON.stringify(row)}`, rowError);
					errors.push(
						`Row ${rowNumber}: ${rowError instanceof Error ? rowError.message : String(rowError)}`,
					);
					skipped++;
				}
			}

			try {
				await invalidateCache.byPattern("cache:position:list:*");
				positionLogger.info("Position list cache invalidated after import");
			} catch (cacheError) {
				positionLogger.warn(
					"Failed to invalidate cache after position import:",
					cacheError,
				);
			}

			const summary = {
				total: data.length,
				totalRows: data.length,
				created,
				updated,
				skipped,
				errors: errors.slice(0, 20),
			};

			positionLogger.info(`Import completed: ${JSON.stringify(summary)}`);
			const successResponse = buildSuccessResponse(
				"Positions imported successfully",
				{ summary },
				200,
			);
			res.status(200).json(successResponse);
		} catch (error) {
			positionLogger.error(`Import failed: ${error}`);
			const errorResponse = buildErrorResponse(
				config.ERROR.COMMON.INTERNAL_SERVER_ERROR,
				500,
			);
			res.status(500).json(errorResponse);
		}
	};

	return { generateCode, create, getAll, getById, update, remove, importFromXLSX };
};
