import { Request, Response, NextFunction } from "express";
import { PrismaClient, Prisma } from "../../generated/prisma";
import { getLogger } from "../../helper/logger.helper";
import { transformFormDataToObject } from "../../helper/transformObject";
import { validateQueryParams } from "../../helper/validation-helper";
import {
	buildFindManyQuery,
	getNestedFields,
} from "../../helper/query-builder.helper";
import { buildSuccessResponse, buildPagination } from "../../helper/success-handler.helper";
import { groupDataByField } from "../../helper/dataGrouping";
import { buildErrorResponse, formatZodErrors } from "../../helper/error-handler";
import {
	CreatePersonSchema,
	UpdatePersonSchema,
	GroupBySchema,
} from "../../zod/person.zod";
import { logActivity } from "../../utils/activityLogger";
import { logAudit } from "../../utils/auditLogger";
import { config } from "../../config/constant";
import { config as appConfig } from "../../config/config";
import { redisClient } from "../../config/redis";
import { invalidateCache } from "../../middleware/cache";

const logger = getLogger();
const personLogger = logger.child({ module: "person" });

const asRecord = (value: unknown): Record<string, any> =>
	value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, any>) : {};

const getJsonString = (value: unknown, key: string): string => {
	const raw = asRecord(value)[key];
	return typeof raw === "string" ? raw : "";
};

export const controller = (prisma: PrismaClient) => {
	// Helper function to update user metadata with personal info
	const updateUserMetadata = async (userId: string, personalInfo: any, token?: string) => {
		try {
			if (!userId || !personalInfo) {
				personLogger.warn("Missing userId or personalInfo for metadata update");
				return;
			}

			const patchPayload = {
				metadata: {
					personalInfo: {
						firstName: personalInfo.firstName,
						lastName: personalInfo.lastName,
					},
				},
			};

			// Prepare headers for PATCH request
			const patchHeaders: Record<string, string> = {
				"Content-Type": "application/json",
			};

			// Add token to headers if available
			if (token) {
				patchHeaders["Authorization"] = `Bearer ${token}`;
			}

			personLogger.info(`PATCH payload:`, JSON.stringify(patchPayload, null, 2));

			if (appConfig.idpEnabled) {
				const patchUrl = `${appConfig.authBaseUrl}/api/user/${userId}`;
				personLogger.info(`PATCH request to: ${patchUrl}`);

				const patchResponse = await fetch(patchUrl, {
					method: "PATCH",
					headers: patchHeaders,
					body: JSON.stringify(patchPayload),
				});

				personLogger.info(`PATCH response status: ${patchResponse.status}`);

				if (!patchResponse.ok) {
					const patchErrorText = await patchResponse.text();
					personLogger.warn(
						`Failed to update user metadata: ${patchResponse.status} - ${patchErrorText}`,
					);
					return;
				}

				const patchResult = await patchResponse.json();
				personLogger.info(
					"User metadata updated successfully:",
					JSON.stringify(patchResult, null, 2),
				);
			} else {
				const existingUser = await prisma.user.findUnique({
					where: { id: userId },
					select: { metadata: true },
				});
				const mergedMetadata = {
					...((existingUser?.metadata as Record<string, any> | null) || {}),
					...(patchPayload.metadata || {}),
				};
				await prisma.user.update({
					where: { id: userId },
					data: { metadata: mergedMetadata },
				});
				personLogger.info(`Local user metadata updated successfully for user ${userId}`);
			}
		} catch (patchError) {
			personLogger.warn(`Error updating user metadata: ${patchError}`);
			// Don't fail the entire operation, just log the warning
		}
	};
	const create = async (req: Request, res: Response, _next: NextFunction) => {
		let requestData = req.body;
		const contentType = req.get("Content-Type") || "";

		if (
			contentType.includes("application/x-www-form-urlencoded") ||
			contentType.includes("multipart/form-data")
		) {
			personLogger.info("Original form data:", JSON.stringify(req.body, null, 2));
			requestData = transformFormDataToObject(req.body);
			personLogger.info(
				"Transformed form data to object structure:",
				JSON.stringify(requestData, null, 2),
			);
		}

		const validation = CreatePersonSchema.safeParse(requestData);
		if (!validation.success) {
			const formattedErrors = formatZodErrors(validation.error.format());
			personLogger.error(`Validation failed: ${JSON.stringify(formattedErrors)}`);
			const errorResponse = buildErrorResponse("Validation failed", 400, formattedErrors);
			res.status(400).json(errorResponse);
			return;
		}

		try {
			const normalizedEmail = validation.data.contactInfo.email?.trim().toLowerCase();
			if (normalizedEmail) {
				const existingPersonCandidates = await prisma.person.findMany({
					where: {
						contactInfo: {
							path: ["email"],
							string_contains: normalizedEmail,
							mode: "insensitive",
						},
					},
					select: { id: true, contactInfo: true },
					take: 10,
				});
				const existingPerson = existingPersonCandidates.find((person) => {
					const contactInfo = asRecord(person.contactInfo);
					return String(contactInfo.email || "").trim().toLowerCase() === normalizedEmail;
				});

				if (existingPerson) {
					res.status(409).json(
						buildErrorResponse("Email already exists", 409, [
							{
								field: "contactInfo.email",
								message:
									"This email is already registered. Please use a different email.",
							},
						]),
					);
					return;
				}
			}

			const person = await prisma.person.create({
				data: {
					...validation.data,
					contactInfo: {
						...validation.data.contactInfo,
						...(normalizedEmail ? { email: normalizedEmail } : {}),
					},
				},
			});
			personLogger.info(`Person created successfully: ${person.id}`);

			logActivity(req, {
				userId: (req as any).user?.id || "unknown",
				action: "CREATE_PERSON",
				description: `Person created: ${getJsonString(person.personalInfo, "firstName") || person.id}`,
				page: {
					url: req.originalUrl,
					title: "Person Creation",
				},
			});

			logAudit(req, {
				userId: (req as any).user?.id || "unknown",
				action: config.AUDIT_LOG.ACTIONS.CREATE,
				resource: "PERSON",
				severity: config.AUDIT_LOG.SEVERITY.LOW,
				entityType: "PERSON",
				entityId: person.id,
				changesBefore: null,
				changesAfter: {
					id: person.id,
					personalInfo: person.personalInfo,
					contactInfo: person.contactInfo,
					createdAt: person.createdAt,
					updatedAt: person.updatedAt,
				},
				description: `Person created: ${getJsonString(person.personalInfo, "firstName") || person.id}`,
			});

			try {
				await invalidateCache.byPattern("cache:person:list:*");
				personLogger.info("Person list cache invalidated after creation");
			} catch (cacheError) {
				personLogger.warn("Failed to invalidate cache after person creation:", cacheError);
			}

			const successResponse = buildSuccessResponse(
				"Person created successfully",
				{ person },
				201,
			);
			res.status(201).json(successResponse);
		} catch (error) {
			personLogger.error(`Person creation failed: ${error}`);
			const errorResponse = buildErrorResponse(
				config.ERROR.COMMON.INTERNAL_SERVER_ERROR,
				500,
			);
			res.status(500).json(errorResponse);
		}
	};
	const getAll = async (req: Request, res: Response, _next: NextFunction) => {
		const validationResult = validateQueryParams(req, personLogger);

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

		personLogger.info(
			`Getting persons, page: ${page}, limit: ${limit}, query: ${query}, order: ${order}, groupBy: ${groupBy}`,
		);

		try {
			const whereClause: Prisma.PersonWhereInput = {};

			let persons: any[] = [];
			let total = 0;

			if (groupBy) {
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
					"Person",
				);

				const [regularResults, regularTotal] = await Promise.all([
					document ? prisma.person.findMany(findManyQuery) : [],
					count ? prisma.person.count({ where: whereClause }) : 0,
				]);

				const groupField = Array.isArray(groupBy) ? groupBy[0] : (groupBy as string);
				const groups = groupDataByField(regularResults, groupField);

				const responseData = {
					...(document && { groups }),
					...(count && { count: regularTotal }),
					...(pagination && { pagination: buildPagination(regularTotal, page, limit) }),
				};

				res.status(200).json(
					buildSuccessResponse("Persons retrieved successfully", responseData, 200),
				);
				return;
			} else {
				personLogger.info("Using regular findMany query - no groupBy parameter");
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
					"Person",
				);

				const [regularResults, regularTotal] = await Promise.all([
					document ? prisma.person.findMany(findManyQuery) : [],
					count ? prisma.person.count({ where: whereClause }) : 0,
				]);

				let filtered = regularResults;
				const queryNeedle = String(query || "").trim().toLowerCase();
				if (queryNeedle) {
					filtered = filtered.filter((person) => {
						const firstName = getJsonString((person as any).personalInfo, "firstName")
							.toLowerCase();
						const lastName = getJsonString((person as any).personalInfo, "lastName")
							.toLowerCase();
						const email = getJsonString((person as any).contactInfo, "email").toLowerCase();
						return (
							firstName.includes(queryNeedle) ||
							lastName.includes(queryNeedle) ||
							email.includes(queryNeedle)
						);
					});
				}
				persons = filtered;
				total = queryNeedle ? filtered.length : regularTotal;
			}

			personLogger.info(`Retrieved ${persons.length} persons`);
			const responseData = {
				...(document && { persons }),
				...(count && { count: total }),
				...(pagination && { pagination: buildPagination(total, page, limit) }),
				...(groupBy && { grouped: true, groupedBy: groupBy }),
			};

			res.status(200).json(
				buildSuccessResponse("Persons retrieved successfully", responseData, 200),
			);
		} catch (error) {
			personLogger.error(`Get all persons failed: ${error}`);
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
				personLogger.error(config.ERROR.QUERY_PARAMS.MISSING_ID);
				const errorResponse = buildErrorResponse(config.ERROR.QUERY_PARAMS.MISSING_ID, 400);
				res.status(400).json(errorResponse);
				return;
			}

			if (fields && typeof fields !== "string") {
				personLogger.error(`${config.ERROR.QUERY_PARAMS.INVALID_POPULATE}: ${fields}`);
				const errorResponse = buildErrorResponse(
					config.ERROR.QUERY_PARAMS.POPULATE_MUST_BE_STRING,
					400,
				);
				res.status(400).json(errorResponse);
				return;
			}

			personLogger.info(`Getting person by ID: ${id}`);

			const cacheKey = `cache:person:byId:${id}:${fields || "full"}`;
			let person = null;

			try {
				if (redisClient.isClientConnected()) {
					person = await redisClient.getJSON(cacheKey);
					if (person) {
						personLogger.info(`Person ${id} retrieved from direct Redis cache`);
					}
				}
			} catch (cacheError) {
				personLogger.warn(`Redis cache retrieval failed for person ${id}:`, cacheError);
			}

			if (!person) {
				const query: Prisma.PersonFindFirstArgs = {
					where: { id },
				};

				query.select = getNestedFields(fields as string | undefined, {}, "Person");

				person = await prisma.person.findFirst(query);

				if (person && redisClient.isClientConnected()) {
					try {
						await redisClient.setJSON(cacheKey, person, 3600);
						personLogger.info(`Person ${id} stored in direct Redis cache`);
					} catch (cacheError) {
						personLogger.warn(
							`Failed to store person ${id} in Redis cache:`,
							cacheError,
						);
					}
				}
			}

			if (!person) {
				personLogger.error(`Person not found: ${id}`);
				const errorResponse = buildErrorResponse("Person not found", 404);
				res.status(404).json(errorResponse);
				return;
			}

			personLogger.info(`Person retrieved: ${(person as any).id}`);
			const successResponse = buildSuccessResponse(
				"Person retrieved successfully",
				{ person },
				200,
			);
			res.status(200).json(successResponse);
		} catch (error) {
			personLogger.error(`Error getting person: ${error}`);
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
				personLogger.error(config.ERROR.QUERY_PARAMS.MISSING_ID);
				const errorResponse = buildErrorResponse(config.ERROR.QUERY_PARAMS.MISSING_ID, 400);
				res.status(400).json(errorResponse);
				return;
			}

			const validationResult = UpdatePersonSchema.partial().safeParse(req.body);

			if (!validationResult.success) {
				const formattedErrors = formatZodErrors(validationResult.error.format());
				personLogger.error(`Validation failed: ${JSON.stringify(formattedErrors)}`);
				const errorResponse = buildErrorResponse("Validation failed", 400, formattedErrors);
				res.status(400).json(errorResponse);
				return;
			}

			if (Object.keys(req.body).length === 0) {
				personLogger.error(config.ERROR.COMMON.NO_UPDATE_FIELDS);
				const errorResponse = buildErrorResponse(config.ERROR.COMMON.NO_UPDATE_FIELDS, 400);
				res.status(400).json(errorResponse);
				return;
			}

			const validatedData = validationResult.data;

			personLogger.info(`Updating person: ${id}`);

			const existingPerson = await prisma.person.findFirst({
				where: { id },
			});

			if (!existingPerson) {
				personLogger.error(`Person not found: ${id}`);
				const errorResponse = buildErrorResponse("Person not found", 404);
				res.status(404).json(errorResponse);
				return;
			}

			const updatedPerson = await prisma.person.update({
				where: { id },
				data: {
					...validatedData,
				},
			});

			// Check if firstName or lastName are being updated and update user metadata
			if (updatedPerson.personalInfo && updatedPerson.userId) {
				const info = asRecord(updatedPerson.personalInfo);
				const firstName = typeof info.firstName === "string" ? info.firstName : "";
				const lastName = typeof info.lastName === "string" ? info.lastName : "";
				if (firstName || lastName) {
					// Get token from request headers
					const token = req.headers.authorization?.replace("Bearer ", "");

					// Update user metadata with new personal info
					await updateUserMetadata(
						updatedPerson.userId,
						updatedPerson.personalInfo,
						token,
					);
				}
			}

			try {
				await invalidateCache.byPattern(`cache:person:byId:${id}:*`);
				await invalidateCache.byPattern("cache:person:list:*");
				personLogger.info(`Cache invalidated after person ${id} update`);
			} catch (cacheError) {
				personLogger.warn("Failed to invalidate cache after person update:", cacheError);
			}

			personLogger.info(`Person updated: ${updatedPerson.id}`);
			const successResponse = buildSuccessResponse(
				"Person updated successfully",
				{ person: updatedPerson },
				200,
			);
			res.status(200).json(successResponse);
		} catch (error) {
			personLogger.error(`Error updating person: ${error}`);
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
				personLogger.error(config.ERROR.QUERY_PARAMS.MISSING_ID);
				const errorResponse = buildErrorResponse(config.ERROR.QUERY_PARAMS.MISSING_ID, 400);
				res.status(400).json(errorResponse);
				return;
			}

			personLogger.info(`Deleting person: ${id}`);

			const existingPerson = await prisma.person.findFirst({
				where: { id },
			});

			if (!existingPerson) {
				personLogger.error(`Person not found: ${id}`);
				const errorResponse = buildErrorResponse("Person not found", 404);
				res.status(404).json(errorResponse);
				return;
			}

			await prisma.person.delete({
				where: { id },
			});

			try {
				await invalidateCache.byPattern(`cache:person:byId:${id}:*`);
				await invalidateCache.byPattern("cache:person:list:*");
				personLogger.info(`Cache invalidated after person ${id} deletion`);
			} catch (cacheError) {
				personLogger.warn("Failed to invalidate cache after person deletion:", cacheError);
			}

			personLogger.info(`Person deleted: ${id}`);
			const successResponse = buildSuccessResponse("Person deleted successfully", {}, 200);
			res.status(200).json(successResponse);
		} catch (error) {
			personLogger.error(`Error deleting person: ${error}`);
			const errorResponse = buildErrorResponse(
				config.ERROR.COMMON.INTERNAL_SERVER_ERROR,
				500,
			);
			res.status(500).json(errorResponse);
		}
	};

	return { create, getAll, getById, update, remove };
};
