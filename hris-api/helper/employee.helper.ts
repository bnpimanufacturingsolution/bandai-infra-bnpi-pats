import { Request, Response } from "express";
import { PrismaClient, Prisma } from "../generated/prisma";
import { Logger } from "winston";
import { CreatePersonSchema } from "../zod/person.zod";
import { CreateEmployeeSchema } from "../zod/employee.zod";
import { logActivity } from "../utils/activityLogger";
import { logAudit } from "../utils/auditLogger";
import { config } from "../config/constant";
import { config as appConfig } from "../config/config";
import { invalidateCache } from "../middleware/cache";
import { buildErrorResponse } from "./error-handler";

import { createBoardingProcess } from "./boarding.helper";
import { createDocumentChecklistItems } from "./boarding-documents.helper";
import { BoardingType } from "../generated/prisma";
import { normalizeEmployeeBenefitPayload } from "./employee-benefit-program.helper";
import { buildBulkDefaultPassword } from "./bulk-password.helper";
import { resolveEmployeeActiveSchedule } from "./employee-schedule.helper";
import { getUtcDayRange } from "./employee-date-validation.helper";

export const createEmployeeHelpers = (prisma: PrismaClient, employeeLogger: Logger) => {
	const asRecord = (value: unknown): Record<string, any> =>
		value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, any>) : {};
	const jsonStringField = (value: unknown, key: string): string | null => {
		const record = asRecord(value);
		const raw = record[key];
		return typeof raw === "string" ? raw : null;
	};
	class AuthServiceError extends Error {
		statusCode: number;
		upstreamBody?: any;
		constructor(message: string, statusCode: number, upstreamBody?: any) {
			super(message);
			this.name = "AuthServiceError";
			this.statusCode = statusCode;
			this.upstreamBody = upstreamBody;
		}
	}

	const buildDuplicateUserError = (params: {
		email?: string | null;
		userName?: string | null;
		conflictOn: "email" | "userName";
	}): AuthServiceError => {
		const conflictField =
			params.conflictOn === "email" ? "person.contactInfo.email" : "user.userName";
		const message =
			params.conflictOn === "email"
				? "A user with this email already exists. Please use a different email."
				: "A user with this generated username already exists. Please use a different email or employee details.";

		return new AuthServiceError("User already exists", 409, {
			message: "User already exists",
			errors: [
				{
					field: conflictField,
					message,
				},
			],
			conflictOn: params.conflictOn,
			email: params.email || null,
			userName: params.userName || null,
		});
	};

	const ensureLocalUserUniqueness = async (
		userPayload: Record<string, any>,
		options?: { excludeUserId?: string },
	) => {
		const conflictClauses = [
			...(userPayload.email ? [{ email: String(userPayload.email) }] : []),
			...(userPayload.userName ? [{ userName: String(userPayload.userName) }] : []),
		];
		if (conflictClauses.length === 0) return;

		const existing = await prisma.user.findFirst({
			where: {
				AND: [
					options?.excludeUserId ? { id: { not: options.excludeUserId } } : {},
					{ OR: conflictClauses },
				],
			},
			select: {
				id: true,
				email: true,
				userName: true,
			},
		});

		if (!existing) return;

		const normalizedEmail = String(userPayload.email || "").trim().toLowerCase();
		const normalizedExistingEmail = String(existing.email || "").trim().toLowerCase();
		if (normalizedEmail && normalizedExistingEmail === normalizedEmail) {
			throw buildDuplicateUserError({
				email: userPayload.email,
				userName: userPayload.userName,
				conflictOn: "email",
			});
		}

		throw buildDuplicateUserError({
			email: userPayload.email,
			userName: userPayload.userName,
			conflictOn: "userName",
		});
	};

	// Helper function to extract token from request
	const extractTokenFromRequest = (req: Request): string | undefined => {
		let token = (req as any)?.cookies?.token as string | undefined;
		const authHeader = req.headers.authorization;

		if (!token && authHeader) {
			if (authHeader.startsWith("Bearer ")) {
				token = authHeader.substring(7);
			} else {
				token = authHeader;
			}
		}

		return token;
	};

	// Helper function to prepare auth service headers
	const prepareAuthHeaders = (req: Request): Record<string, string> => {
		const headers: Record<string, string> = {
			"Content-Type": "application/json",
		};

		const token = extractTokenFromRequest(req);
		if (token) {
			headers["Authorization"] = `Bearer ${token}`;
		}

		return headers;
	};

	// Helper function to build auth service URL
	const buildAuthServiceUrl = (endpoint: string): string => {
		return `${appConfig.authBaseUrl}${endpoint.startsWith("/") ? endpoint : `/${endpoint}`}`;
	};

	const sanitizeShiftSnapshot = (value: any) => {
		if (!value || typeof value !== "object") return null;
		const timeSlots = Array.isArray(value.timeSlots)
			? value.timeSlots
					.map((slot: any) => ({
						type: String(slot?.type || "").trim(),
						label:
							slot?.label === null || slot?.label === undefined
								? null
								: String(slot.label).trim(),
						startTime: String(slot?.startTime || "").trim(),
						endTime: String(slot?.endTime || "").trim(),
					}))
					.filter(
						(slot: {
							type: string;
							label: string | null;
							startTime: string;
							endTime: string;
						}) => slot.type && slot.startTime && slot.endTime,
					)
			: [];

		return {
			name:
				value.name === null || value.name === undefined ? null : String(value.name).trim(),
			code:
				value.code === null || value.code === undefined ? null : String(value.code).trim(),
			isOvernight: Boolean(value.isOvernight),
			isOff: Boolean(value.isOff),
			timeSlots,
		};
	};

	const sanitizeEmbeddedSchedule = (value: any) => {
		if (!value || typeof value !== "object") return value;
		const pattern = Array.isArray(value.pattern)
			? value.pattern
					.map((day: any) => {
						const parsedDay = Number(day?.day);
						const dayValue = Number.isFinite(parsedDay)
							? Math.max(1, Math.floor(parsedDay))
							: 1;
						return {
							day: dayValue,
							shiftTypeId: day?.shiftTypeId ? String(day.shiftTypeId).trim() : null,
							shiftSnapshot: sanitizeShiftSnapshot(day?.shiftSnapshot),
						};
					})
					.sort((a: { day: number }, b: { day: number }) => a.day - b.day)
			: [];
		const parsedCycleDays = Number(value.cycleDays);
		const cycleDays =
			Number.isFinite(parsedCycleDays) && parsedCycleDays > 0
				? Math.floor(parsedCycleDays)
				: Math.max(pattern.length, 1);

		return {
			templateId: value.templateId ? String(value.templateId).trim() : null,
			templateCode:
				value.templateCode === null || value.templateCode === undefined
					? null
					: String(value.templateCode).trim(),
			templateName:
				value.templateName === null || value.templateName === undefined
					? null
					: String(value.templateName).trim(),
			cycleDays,
			graceLateMinutes:
				value.graceLateMinutes === null || value.graceLateMinutes === undefined
					? null
					: (() => {
							const parsed = Number(value.graceLateMinutes);
							return Number.isFinite(parsed) ? Math.max(0, parsed) : null;
						})(),
			graceEarlyOutMinutes:
				value.graceEarlyOutMinutes === null || value.graceEarlyOutMinutes === undefined
					? null
					: (() => {
							const parsed = Number(value.graceEarlyOutMinutes);
							return Number.isFinite(parsed) ? Math.max(0, parsed) : null;
						})(),
			pattern,
			effectiveStartDate: value.effectiveStartDate || null,
			assignedAt: value.assignedAt || null,
			assignedByEmployeeId: value.assignedByEmployeeId
				? String(value.assignedByEmployeeId).trim()
				: null,
			reason:
				value.reason === null || value.reason === undefined ? null : String(value.reason),
			version:
				value.version === null || value.version === undefined
					? null
					: (() => {
							const parsed = Number(value.version);
							return Number.isFinite(parsed) ? Math.floor(parsed) : null;
						})(),
		};
	};

	const resolveBcrypt = (): { hash(password: string, saltOrRounds: number): Promise<string> } => {
		// eslint-disable-next-line @typescript-eslint/no-var-requires
		const bcrypt = require("bcryptjs");
		return bcrypt as { hash(password: string, saltOrRounds: number): Promise<string> };
	};

	const mergeLocalUserMetadata = async (
		userId: string,
		metadataPatch: Record<string, any>,
	): Promise<void> => {
		const current = await prisma.user.findUnique({
			where: { id: userId },
			select: { metadata: true },
		});
		const mergedMetadata = {
			...((current?.metadata as Record<string, any> | null) || {}),
			...(metadataPatch || {}),
		};
		await prisma.user.update({
			where: { id: userId },
			data: { metadata: mergedMetadata },
		});
	};

	const updateUserAccount = async (
		userId: string,
		userPayload: Record<string, any>,
		req: Request,
	): Promise<void> => {
		if (appConfig.idpEnabled) {
			const authServiceUrl = buildAuthServiceUrl(`/api/user/${userId}`);
			const authHeaders = prepareAuthHeaders(req);
			const userResponse = await fetch(authServiceUrl, {
				method: "PATCH",
				headers: authHeaders,
				body: JSON.stringify(userPayload),
			});
			if (!userResponse.ok) {
				const errorText = await userResponse.text();
				let parsedErrorBody: any = undefined;
				try {
					parsedErrorBody = JSON.parse(errorText);
				} catch {
					parsedErrorBody = undefined;
				}
				const upstreamMessage =
					parsedErrorBody?.message ||
					parsedErrorBody?.errors?.[0]?.message ||
					errorText ||
					`Auth service error: ${userResponse.status}`;
				throw new AuthServiceError(upstreamMessage, userResponse.status, parsedErrorBody);
			}
			return;
		}

		await ensureLocalUserUniqueness(userPayload, { excludeUserId: userId });

		const localData: Record<string, any> = {};
		const localMetadataPatch: Record<string, any> = {};
		if (userPayload.email !== undefined) localData.email = userPayload.email;
		if (userPayload.userName !== undefined) localData.userName = userPayload.userName;
		if (userPayload.status !== undefined) localData.status = userPayload.status;
		if (userPayload.loginMethod !== undefined) localData.loginMethod = userPayload.loginMethod;
		if (userPayload.organizationId !== undefined) {
			localData.organizationId = userPayload.organizationId || null;
		}
		if (userPayload.role !== undefined) {
			localData.role = userPayload.role;
		}
		if (userPayload.password !== undefined) {
			const bcrypt = resolveBcrypt();
			localData.password = await bcrypt.hash(String(userPayload.password), 10);
		}
		if (userPayload.metadata && typeof userPayload.metadata === "object") {
			Object.assign(localMetadataPatch, userPayload.metadata);
		}
		if (userPayload.avatar !== undefined) {
			localMetadataPatch.avatar = userPayload.avatar || null;
		}
		if (Object.keys(localMetadataPatch).length > 0) {
			await mergeLocalUserMetadata(userId, localMetadataPatch);
		}
		if (Object.keys(localData).length > 0) {
			await prisma.user.update({
				where: { id: userId },
				data: localData,
			});
		}
	};

	const buildCanonicalEmployeeMetadata = async (employeeId: string) => {
		const employee = await prisma.employee.findUnique({
			where: { id: employeeId },
			select: {
				id: true,
				employeeId: true,
				deviceEmpId: true,
				userId: true,
				role: true,
				isManager: true,
				isHrManager: true,
				workforceSource: true,
				department: {
					select: {
						id: true,
						name: true,
						code: true,
						managerId: true,
					},
				},
				section: {
					select: {
						id: true,
						name: true,
						code: true,
						departmentId: true,
					},
				},
				position: {
					select: {
						id: true,
						title: true,
						code: true,
					},
				},
				level: {
					select: {
						id: true,
						name: true,
						rank: true,
					},
				},
				_count: { select: { directReports: true } },
				reportTo: {
					select: {
						id: true,
						person: {
							select: {
								personalInfo: true,
								contactInfo: true,
							},
						},
					},
				},
				person: {
					select: {
						personalInfo: true,
					},
				},
				agency: {
					select: {
						id: true,
						name: true,
						code: true,
					},
				},
			},
		});

		if (!employee || !employee.person) return null;

		const employeeRole = String(employee.role || "")
			.trim()
			.toLowerCase();
		const hasDirectReports = (employee as any)._count?.directReports > 0;
		const effectiveIsManager =
			Boolean(employee.isManager) ||
			employeeRole === "hris-employee-manager" ||
			hasDirectReports ||
			(!!employee.department?.managerId && employee.department.managerId === employee.id);

		const metadata = {
			id: employee.id,
			employeeId: employee.employeeId,
			role: employee.role || undefined,
			isManager: effectiveIsManager,
			isHrManager: Boolean(employee.isHrManager),
			hasDirectReports,
			personalInfo: {
				firstName: jsonStringField(employee.person.personalInfo, "firstName") || "",
				lastName: jsonStringField(employee.person.personalInfo, "lastName") || "",
			},
			department: employee.department
				? {
						id: employee.department.id,
						name: employee.department.name,
						code: employee.department.code,
					}
				: undefined,
			section: employee.section
				? {
						id: employee.section.id,
						name: employee.section.name,
						code: employee.section.code,
						departmentId: employee.section.departmentId,
					}
				: undefined,
			isDepartmentManager:
				!!employee.department?.managerId && employee.department.managerId === employee.id,
			position: employee.position || undefined,
			level: employee.level || undefined,
			workforceSource: employee.workforceSource || "DIRECT",
			agency:
				employee.workforceSource === "AGENCY" && employee.agency
					? {
							id: employee.agency.id,
							name: employee.agency.name,
							code: employee.agency.code ?? null,
						}
					: undefined,
			reportTo: employee.reportTo
				? {
						id: employee.reportTo.id,
						firstName: jsonStringField(employee.reportTo.person?.personalInfo, "firstName") || "",
						lastName: jsonStringField(employee.reportTo.person?.personalInfo, "lastName") || "",
						email: jsonStringField(employee.reportTo.person?.contactInfo, "email"),
					}
				: undefined,
		};

		return {
			userId: employee.userId || null,
			deviceEmpId: employee.deviceEmpId || null,
			employeeMetadata: metadata,
		};
	};

	const syncUserMetadataFromEmployee = async (
		userId: string,
		employeeId: string,
		req: Request,
	): Promise<void> => {
		try {
			const canonical = await buildCanonicalEmployeeMetadata(employeeId);
			if (!canonical) {
				employeeLogger.warn(
					`Canonical employee not found for metadata sync: ${employeeId}`,
				);
				return;
			}

			const targetUserId = canonical.userId || userId;
			if (!targetUserId) {
				employeeLogger.warn(
					`Cannot sync metadata for employee ${employeeId}: missing linked userId`,
				);
				return;
			}

			if (canonical.userId && canonical.userId !== userId) {
				employeeLogger.warn(
					`User/employee mismatch detected (requested userId=${userId}, linked userId=${canonical.userId}) for employee ${employeeId}. Using linked userId.`,
				);
			}

			const userData = await fetchUserDataFromAuthService(targetUserId, req);
			const existingMetadata =
				userData?.metadata && typeof userData.metadata === "object"
					? { ...(userData.metadata as Record<string, any>) }
					: {};

			const mergedMetadata: Record<string, any> = {
				...existingMetadata,
				employee: canonical.employeeMetadata,
			};

			const currentDevice =
				mergedMetadata.device && typeof mergedMetadata.device === "object"
					? (mergedMetadata.device as Record<string, any>)
					: {};
			const currentDeviceAccess =
				currentDevice.access && typeof currentDevice.access === "object"
					? (currentDevice.access as Record<string, any>)
					: {};
			const syncedDeviceEmpId =
				typeof canonical.deviceEmpId === "string"
					? canonical.deviceEmpId.trim()
					: "";

			mergedMetadata.device = {
				...currentDevice,
				access: syncedDeviceEmpId
					? {
							...currentDeviceAccess,
							empId: syncedDeviceEmpId,
							status: "enrolled",
						}
					: {
							...currentDeviceAccess,
							status: currentDeviceAccess.status || "unenrolled",
						},
			};
			if (typeof mergedMetadata.isFirstLogin !== "boolean") {
				mergedMetadata.isFirstLogin = true;
			}
			if (typeof mergedMetadata.requirePasswordChange !== "boolean") {
				mergedMetadata.requirePasswordChange = true;
			}

			await updateUserAccount(
				targetUserId,
				{
					metadata: mergedMetadata,
				},
				req,
			);
		} catch (patchError) {
			employeeLogger.warn(`Error syncing canonical user metadata: ${patchError}`);
		}
	};

	const syncUserMetadataForEmployees = async (
		pairs: Array<{ userId: string; employeeId: string }>,
		req: Request,
	): Promise<void> => {
		if (!Array.isArray(pairs) || pairs.length === 0) return;

		const seen = new Set<string>();
		for (const pair of pairs) {
			const employeeId = String(pair?.employeeId || "").trim();
			const userId = String(pair?.userId || "").trim();
			if (!employeeId || !userId) continue;
			const key = `${userId}:${employeeId}`;
			if (seen.has(key)) continue;
			seen.add(key);
			await syncUserMetadataFromEmployee(userId, employeeId, req);
		}
	};

	// Helper function to update user metadata with employee information
	const updateUserMetadata = async (
		userId: string,
		employeeId: string,
		req: Request,
	): Promise<void> => {
		await syncUserMetadataFromEmployee(userId, employeeId, req);
	};

	// Helper function to fetch user data from auth service
	const fetchUserDataFromAuthService = async (
		userId: string,
		req: Request,
	): Promise<any | null> => {
		try {
			if (!appConfig.idpEnabled) {
				const localUser = await prisma.user.findUnique({
					where: { id: userId },
					select: {
						id: true,
						email: true,
						userName: true,
						role: true,
						status: true,
						organizationId: true,
						metadata: true,
						createdAt: true,
						updatedAt: true,
					},
				});
				if (!localUser) return null;
				return {
					...localUser,
					avatar:
						localUser.metadata && typeof localUser.metadata === "object"
							? (localUser.metadata as Record<string, any>).avatar || null
							: null,
				};
			}
			const authUrl = buildAuthServiceUrl(`/api/user/${userId}`);
			const headers = prepareAuthHeaders(req);

			const resp = await fetch(authUrl, { method: "GET", headers });
			if (resp.ok) {
				const json = await resp.json();
				return json?.data || json?.user || json;
			} else {
				const text = await resp.text();
				employeeLogger.warn(`Auth user fetch failed ${resp.status}: ${text}`);
				return null;
			}
		} catch (error) {
			employeeLogger.warn(`Auth user fetch error for ${userId}: ${error}`);
			return null;
		}
	};

	// Helper function to fetch filtered users from auth service
	const fetchFilteredUsers = async (
		req: Request,
		roleNames?: string[],
	): Promise<any[] | null> => {
		try {
			// Default to HR manager and HR user roles if no roles specified
			const roles = roleNames || ["hris-hr-manager", "hris-hr-user"];
			if (!appConfig.idpEnabled) {
				return await prisma.user.findMany({
					where: {
						role: {
							in: roles,
						},
						isDeleted: false,
					},
					select: {
						id: true,
						email: true,
						userName: true,
						role: true,
						status: true,
						organizationId: true,
						metadata: true,
					},
				});
			}

			// Build filter query parameter: role.name:value1,role.name:value2
			const filterParam = roles.map((role) => `role.name:${role}`).join(",");

			// Construct full URL with query parameters
			const authUrl = buildAuthServiceUrl(
				`/api/user?document=true&filter=${encodeURIComponent(filterParam)}`,
			);

			console.log(`Fetching filtered users from auth service with URL: ${authUrl}`);
			const headers = prepareAuthHeaders(req);

			employeeLogger.info(`Fetching filtered users from: ${authUrl}`);

			const resp = await fetch(authUrl, { method: "GET", headers });
			const json = await resp.json();

			if (resp.ok) {
				employeeLogger.info(`Raw response structure:`, JSON.stringify(json, null, 2));

				return Array.isArray(json.data.users) ? json.data.users : [];
			} else {
				const text = await resp.text();
				employeeLogger.warn(`Auth users fetch failed ${resp.status}: ${text}`);
				return null;
			}
		} catch (error) {
			employeeLogger.warn(`Auth users fetch error: ${error}`);
			return null;
		}
	};

	// Helper function to enrich employees with user data
	const enrichEmployeesWithUserData = async (employees: any[], req: Request): Promise<void> => {
		if (employees.length === 0) return;

		try {
			await Promise.all(
				employees.map(async (emp: any) => {
					const userId = emp?.userId;
					if (!userId) return;

					const userData = await fetchUserDataFromAuthService(userId, req);
					if (userData) {
						emp.user = userData;
					}
				}),
			);
		} catch (error) {
			employeeLogger.warn(`Bulk auth user enrichment error: ${error}`);
		}
	};

	// Helper function to validate employee exists
	const validateEmployeeExists = async (
		employeeId: string,
		selectFields?: { id: true; organizationId: true; departmentId: true },
	): Promise<any | null> => {
		const query: any = {
			where: { id: employeeId, isDeleted: false },
		};

		if (selectFields) {
			query.select = selectFields;
		}

		return await prisma.employee.findFirst(query);
	};

	// Helper function to invalidate employee-related caches
	const invalidateEmployeeCaches = async (employeeId?: string): Promise<void> => {
		try {
			if (employeeId) {
				await invalidateCache.byPattern(`cache:employee:byId:${employeeId}:*`);
				await invalidateCache.byPattern(`cache:employee:document-priorities:${employeeId}`);
			}
			await invalidateCache.byPattern("cache:employee:list:*");
			await invalidateCache.byPattern("cache:schedule:list:*");
			await invalidateCache.byPattern("cache:metrics:*");
		} catch (cacheError) {
			employeeLogger.warn("Failed to invalidate employee caches:", cacheError);
		}
	};

	// Helper function to invalidate attendance-related caches
	const invalidateAttendanceCaches = async (
		attendanceId?: string,
		employeeId?: string,
	): Promise<void> => {
		try {
			if (attendanceId) {
				await invalidateCache.byPattern(`cache:attendance:byId:${attendanceId}:*`);
			}
			await invalidateCache.byPattern("cache:attendance:list:*");
			if (employeeId) {
				await invalidateCache.byPattern(`cache:employee:byId:${employeeId}:*`);
			}
		} catch (cacheError) {
			employeeLogger.warn("Failed to invalidate attendance caches:", cacheError);
		}
	};

	// Helper function to build department include fields
	const buildDepartmentIncludeFields = (
		include?: string | string[],
	): Prisma.DepartmentInclude => {
		const includeFields: Prisma.DepartmentInclude = {};

		if (!include) return includeFields;

		const includeArray = Array.isArray(include) ? include : (include as string).split(",");

		if (includeArray.includes("employees")) {
			includeFields.employees = {
				where: { isDeleted: false },
				select: {
					id: true,
					employeeId: true,
					employmentStatus: true,
					person: {
						select: {
							personalInfo: true,
						},
					},
				},
			};
		}

		if (includeArray.includes("positions")) {
			includeFields.sections = {
				select: {
					id: true,
					code: true,
					name: true,
					positions: {
						where: { isActive: true },
						select: {
							id: true,
							title: true,
							code: true,
							description: true,
							minSalary: true,
							maxSalary: true,
						},
					},
				},
			};
		}

		if (includeArray.includes("manager")) {
			includeFields.manager = {
				select: {
					id: true,
					employeeId: true,
					person: {
						select: {
							personalInfo: true,
						},
					},
				},
			};
		}

		if (includeArray.includes("parent")) {
			includeFields.parent = {
				select: {
					id: true,
					name: true,
					code: true,
					description: true,
				},
			};
		}

		if (includeArray.includes("children")) {
			includeFields.children = {
				where: { isDeleted: false },
				select: {
					id: true,
					name: true,
					code: true,
					description: true,
					isActive: true,
				},
			};
		}

		return includeFields;
	};

	// Helper function to add employee count to department(s)
	const addEmployeeCountToDepartment = async (
		department: any,
		departmentId?: string,
	): Promise<any> => {
		const targetId = departmentId || department.id;
		const employeeCount = await prisma.employee.count({
			where: { departmentId: targetId, isDeleted: false },
		});
		return { ...department, employeeCount };
	};

	// Helper function to check for duplicate employee ID
	const checkForDuplicateEmployeeId = async (employeeData: any) => {
		try {
			const { organizationId, employeeId } = employeeData;

			employeeLogger.info(
				`Checking for duplicate employee with organizationId=${organizationId}, employeeId=${employeeId}`,
			);

			// Check if an employee with the same organizationId and employeeId already exists
			const existingEmployee = await prisma.employee.findFirst({
				where: {
					organizationId: organizationId,
					employeeId: employeeId,
				},
			});

			employeeLogger.info(
				`Duplicate check result: ${existingEmployee ? `Found existing employee with ID ${existingEmployee.id}` : "No duplicate found"}`,
			);

			if (existingEmployee) {
				const errorMessage = `Employee with ID '${employeeId}' already exists in this organization`;
				employeeLogger.error(errorMessage);
				employeeLogger.error(
					`Existing employee details: ${JSON.stringify(existingEmployee, null, 2)}`,
				);

				// Create proper error response format
				const error: any = new Error(errorMessage);
				error.code = 409;
				error.field = "employeeId";
				throw error;
			}

			employeeLogger.info("No duplicate employee found - proceeding with creation");
			return false; // No duplicate found
		} catch (error: any) {
			employeeLogger.error(`Error checking for duplicate employee ID: ${error}`);
			// Re-throw with proper error code
			if (error.code === 409) {
				throw error;
			}
			const err: any = new Error(error.message || "Error checking for duplicate employee ID");
			err.code = 500;
			throw err;
		}
	};

	const normalizeMiddleName = (value: unknown): string =>
		String(value || "").trim().toLowerCase();

	const findExistingPersonMatch = async (
		client: PrismaClient | Prisma.TransactionClient,
		personData: any,
	) => {
		const { personalInfo } = personData;
		const firstName = String(personalInfo?.firstName || "").trim();
		const lastName = String(personalInfo?.lastName || "").trim();
		const middleName = String(personalInfo?.middleName || "").trim();
		const dateOfBirth = personalInfo?.dateOfBirth;
		const organizationId = String(personData?.organizationId || "").trim() || null;

		if (!organizationId || !firstName || !lastName || !dateOfBirth) {
			return null;
		}

		const dayRange = getUtcDayRange(dateOfBirth);
		if (!dayRange) {
			return null;
		}

		const matches = await client.person.findMany({
			where: {
				organizationId,
				isDeleted: false,
			},
			select: {
				id: true,
				personalInfo: true,
			},
		});
		const firstNameNeedle = firstName.toLowerCase();
		const lastNameNeedle = lastName.toLowerCase();
		const dateStart = dayRange.start.getTime();
		const dateEnd = dayRange.end.getTime();

		const targetMiddleName = normalizeMiddleName(middleName);
		return (
			matches.find(
				(person) => {
					const p = asRecord(person.personalInfo);
					const pFirst = String(p.firstName || "").trim().toLowerCase();
					const pLast = String(p.lastName || "").trim().toLowerCase();
					const pDob = p.dateOfBirth ? new Date(String(p.dateOfBirth)).getTime() : NaN;
					if (pFirst !== firstNameNeedle || pLast !== lastNameNeedle) return false;
					if (!Number.isFinite(pDob) || pDob < dateStart || pDob > dateEnd) return false;
					return normalizeMiddleName(p.middleName) === targetMiddleName;
				},
			) || null
		);
	};

	// Helper function to check for duplicate person
	const checkForDuplicatePerson = async (personData: any) => {
		try {
			const { personalInfo } = personData;
			const firstName = String(personalInfo?.firstName || "").trim();
			const lastName = String(personalInfo?.lastName || "").trim();
			const middleName = String(personalInfo?.middleName || "").trim();
			const dateOfBirth = personalInfo?.dateOfBirth;
			const organizationId = String(personData?.organizationId || "").trim() || null;

			employeeLogger.info(
				`Checking for duplicate person with: firstName=${firstName}, lastName=${lastName}, middleName=${middleName}, dateOfBirth=${dateOfBirth}`,
			);

			if (!organizationId || !firstName || !lastName || !dateOfBirth) {
				employeeLogger.info(
					"Skipping duplicate person check because organization, name, or date of birth is missing",
				);
				return false;
			}

			const dayRange = getUtcDayRange(dateOfBirth);
			if (!dayRange) {
				employeeLogger.info(
					"Skipping duplicate person check because date of birth is invalid",
				);
				return false;
			}

			const existingPerson = await findExistingPersonMatch(prisma, personData);
			const hasDuplicate = Boolean(existingPerson);

			employeeLogger.info(
				`Duplicate check result: ${hasDuplicate ? "Found existing person" : "No duplicate found"}`,
			);

			if (hasDuplicate) {
				if (!existingPerson) {
					return false;
				}

				const activeEmployee = await prisma.employee.findFirst({
					where: {
						personId: existingPerson.id,
						organizationId,
						isDeleted: false,
					},
					select: {
						id: true,
						employeeId: true,
					},
				});

				if (!activeEmployee) {
					employeeLogger.info(
						`Found matching standalone person ${existingPerson.id} without active employee; employee create will reuse it.`,
					);
					return false;
				}

				const errorMessage = `Person already exists with the same name and birthday: ${firstName} ${middleName ? middleName + " " : ""}${lastName} (${dateOfBirth})`;
				employeeLogger.warn(errorMessage);
				throw new Error(errorMessage);
			}

			return false; // No duplicate found
		} catch (error) {
			employeeLogger.error(`Error checking for duplicate person: ${error}`);
			throw error;
		}
	};

	// Helper function to create a person locally
	const createPersonLocally = async (personData: any, userId?: string) => {
		try {
			// Validate person data
			const validation = CreatePersonSchema.safeParse(personData);
			if (!validation.success) {
				throw new Error(
					`Person validation failed: ${JSON.stringify(validation.error.format())}`,
				);
			}

			// Create person in database
			const person = await prisma.person.create({ data: validation.data });
			employeeLogger.info(`Person created locally: ${person.id}`);

			// Log activity and audit (without HTTP context)
			if (userId) {
				logActivity({ user: { id: userId } } as any, {
					userId: userId,
					action: "CREATE_PERSON",
					description: `Person created: ${jsonStringField(person.personalInfo, "firstName") || person.id}`,
					page: {
						url: "/internal/person-creation",
						title: "Person Creation",
					},
				});

				logAudit({ user: { id: userId } } as any, {
					userId: userId,
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
					description: `Person created: ${jsonStringField(person.personalInfo, "firstName") || person.id}`,
				});
			}

			// Invalidate cache
			try {
				await invalidateCache.byPattern("cache:person:list:*");
				employeeLogger.info("Person list cache invalidated after local creation");
			} catch (cacheError) {
				employeeLogger.warn(
					"Failed to invalidate cache after person creation:",
					cacheError,
				);
			}

			return person;
		} catch (error) {
			employeeLogger.error(`Failed to create person locally: ${error}`);
			throw error;
		}
	};

	const createEmployeeRecord = async (
		tx: Prisma.TransactionClient,
		employee: any,
		personId: string,
	): Promise<any> => {
		// Schedule is now embedded in employee, no need to verify relationship

		// Verify department and position exist
		const department = await tx.department.findUnique({
			where: { id: employee.departmentId },
		});

		const position = await tx.position.findUnique({
			where: { id: employee.positionId },
		});

		if (!department) {
			throw new Error(
				`Department with ID ${employee.departmentId} not found. Please provide a valid departmentId.`,
			);
		}

		if (!position) {
			throw new Error(
				`Position with ID ${employee.positionId} not found. Please provide a valid positionId.`,
			);
		}

		// Strip relation objects and arrays that need nested-create handling
		const {
			department: _department,
			position: _position,
			person: _person,
			documents: inputDocuments,
			employeeBenefits,
			...employeeFields
		} = employee as any;

		const employeeData: any = {
			...employeeFields,
			personId,
			userId: null,
			leaveBalances: employee.leaveBalances || [],
			employmentHistory: Array.isArray(employee.employmentHistory)
				? employee.employmentHistory
				: [],
			embeddedSchedule: sanitizeEmbeddedSchedule(employeeFields.embeddedSchedule),
			metadata: {
				...(employee.metadata || {}),
				isFirstLogin: true,
				requirePasswordChange: true,
			},
		};

		if (
			employeeBenefits &&
			Array.isArray(employeeBenefits) &&
			employeeBenefits.length > 0
		) {
			employeeData.employeeBenefits = {
				create: employeeBenefits.map((benefit: any) =>
					normalizeEmployeeBenefitPayload({
						...benefit,
						organizationId: benefit.organizationId || employee.organizationId,
					}),
				),
			};
		}

		const embeddedSchedule = employeeData.embeddedSchedule;
		const embeddedPattern = Array.isArray(embeddedSchedule?.pattern)
			? embeddedSchedule.pattern
			: [];
		employeeLogger.info(
			`Creating employee record summary: ${JSON.stringify({
				organizationId: employeeData.organizationId || null,
				employeeId: employeeData.employeeId || null,
				departmentId: employeeData.departmentId || null,
				positionId: employeeData.positionId || null,
				documentCount: Array.isArray(inputDocuments) ? inputDocuments.length : 0,
				benefitCount: Array.isArray(employeeBenefits) ? employeeBenefits.length : 0,
				embeddedSchedule: embeddedSchedule
					? {
							templateId: embeddedSchedule?.templateId || null,
							cycleDays:
								typeof embeddedSchedule?.cycleDays === "number"
									? embeddedSchedule.cycleDays
									: null,
							patternDays: embeddedPattern.length,
							templateLinkedDays: embeddedPattern.filter(
								(day: any) => day?.shiftTypeId,
							).length,
							manualSnapshotDays: embeddedPattern.filter(
								(day: any) => day?.shiftSnapshot,
							).length,
						}
					: null,
			})}`,
		);

		const employeeResult = await tx.employee.create({
			data: employeeData,
			include: {
				department: true,
				section: true,
				position: true,
				level: true,
				agency: {
					select: {
						id: true,
						name: true,
						code: true,
					},
				},
				reportTo: {
					include: {
						person: {
							select: {
								personalInfo: true,
								contactInfo: true,
							},
						},
						directReports: {
							select: {
								id: true,
								employeeId: true,
								person: {
									select: {
										personalInfo: true,
										contactInfo: true,
									},
								},
								department: true,
								section: true,
								position: true,
								level: true,
							},
						},
					},
				},
			},
		});

		if (Array.isArray(inputDocuments) && inputDocuments.length > 0) {
			await tx.document.createMany({
				data: inputDocuments.map((doc: any) => ({
					employeeId: employeeResult.id,
					name: doc?.name || doc?.type || "Document",
					type: doc?.type || "document",
					documentTypeId: doc?.documentTypeId || null,
					number: doc?.number || "",
					issueDate: doc?.issueDate ? new Date(doc.issueDate) : new Date(),
					expiryDate: doc?.expiryDate ? new Date(doc.expiryDate) : null,
					fileUrl: doc?.fileUrl || null,
					ext: doc?.ext || null,
					fieldValues: doc?.fieldValues || null,
					metadata: doc?.metadata || null,
					isDeleted: false,
				})),
			});
		}

		const employeeWithDocuments = await tx.employee.findUnique({
			where: { id: employeeResult.id },
			include: {
				department: true,
				section: true,
				position: true,
				level: true,
				agency: {
					select: {
						id: true,
						name: true,
						code: true,
					},
				},
				documents: {
					where: { isDeleted: false },
				},
				reportTo: {
					include: {
						person: {
							select: {
								personalInfo: true,
								contactInfo: true,
							},
						},
						directReports: {
							select: {
								id: true,
								employeeId: true,
								person: {
									select: {
										personalInfo: true,
										contactInfo: true,
									},
								},
								department: true,
								section: true,
								position: true,
								level: true,
							},
						},
					},
				},
			},
		});

		employeeLogger.info(`Employee created successfully: ${employeeResult.id}`);
		return employeeWithDocuments || employeeResult;
	};

	const createPersonAndEmployeeInTransaction = async (
		personData: any,
		employee: any,
	): Promise<{ person: any; employee: any }> => {
		const validation = CreatePersonSchema.safeParse(personData);
		if (!validation.success) {
			throw new Error(
				`Person validation failed: ${JSON.stringify(validation.error.format())}`,
			);
		}

		return await prisma.$transaction(async (tx) => {
			const existingPerson = await findExistingPersonMatch(tx, validation.data);
			let person;

			if (existingPerson) {
				const organizationId = String(validation.data?.organizationId || "").trim() || null;
				const activeEmployee = await tx.employee.findFirst({
					where: {
						personId: existingPerson.id,
						...(organizationId ? { organizationId } : {}),
						isDeleted: false,
					},
					select: {
						id: true,
					},
				});

				if (activeEmployee) {
					const firstName = String(validation.data.personalInfo?.firstName || "").trim();
					const middleName = String(validation.data.personalInfo?.middleName || "").trim();
					const lastName = String(validation.data.personalInfo?.lastName || "").trim();
					const dateOfBirth = validation.data.personalInfo?.dateOfBirth;
					throw new Error(
						`Person already exists with the same name and birthday: ${firstName} ${middleName ? middleName + " " : ""}${lastName} (${dateOfBirth})`,
					);
				}

				person = await tx.person.update({
					where: { id: existingPerson.id },
					data: validation.data,
				});
				employeeLogger.info(
					`Reusing existing standalone person in employee transaction: ${person.id}`,
				);
			} else {
				person = await tx.person.create({ data: validation.data });
				employeeLogger.info(`Person created in employee transaction: ${person.id}`);
			}

			const createdEmployee = await createEmployeeRecord(tx, employee, person.id);
			return { person, employee: createdEmployee };
		});
	};

	// Helper function to create employee in transaction
	const createEmployeeInTransaction = async (employee: any, personId: string): Promise<any> => {
		return await prisma.$transaction((tx) => createEmployeeRecord(tx, employee, personId));
	};

	// Helper function to build employee metadata
	const buildEmployeeMetadata = (createdEmployee: any, person: any): any => {
		const firstName = jsonStringField(person.personalInfo, "firstName") || "";
		const lastName = jsonStringField(person.personalInfo, "lastName") || "";

		// Build metadata object
		const employeeMetadata: any = {
			id: createdEmployee.id,
			personalInfo: {
				firstName: firstName,
				lastName: lastName,
			},
			department: {
				id: createdEmployee.department.id,
				name: createdEmployee.department.name,
				code: createdEmployee.department.code,
			},
			section: createdEmployee.section
				? {
						id: createdEmployee.section.id,
						name: createdEmployee.section.name,
						code: createdEmployee.section.code,
						departmentId: createdEmployee.section.departmentId,
					}
				: undefined,
			position: {
				id: createdEmployee.position.id,
				title: createdEmployee.position.title,
				code: createdEmployee.position.code,
			},
			workforceSource: createdEmployee.workforceSource || "DIRECT",
			isFirstLogin: true,
		};

		if (createdEmployee.workforceSource === "AGENCY" && createdEmployee.agency) {
			employeeMetadata.agency = {
				id: createdEmployee.agency.id,
				name: createdEmployee.agency.name,
				code: createdEmployee.agency.code,
			};
		}

		// Add level if exists
		if (createdEmployee.level) {
			employeeMetadata.level = {
				id: createdEmployee.level.id,
				name: createdEmployee.level.name,
				rank: createdEmployee.level.rank,
			};
		}

		// Add reportTo if exists
		if (createdEmployee.reportTo) {
			const reportToPerson = createdEmployee.reportTo.person;
			const reportToEmail = reportToPerson?.contactInfo?.email || null;

			employeeMetadata.reportTo = {
				id: createdEmployee.reportTo.id,
				firstName: jsonStringField(reportToPerson?.personalInfo, "firstName") || "",
				lastName: jsonStringField(reportToPerson?.personalInfo, "lastName") || "",
				email: reportToEmail,
			};
		}

		return employeeMetadata;
	};

	// Helper function to generate user credentials
	const sanitizeUserNameSegment = (value: string): string => {
		return String(value || "")
			.normalize("NFKD")
			.replace(/[\u0300-\u036f]/g, "")
			.replace(/[^a-zA-Z0-9]/g, "")
			.toLowerCase();
	};

	const buildSafeUserName = (params: {
		email: string;
		firstName: string;
		lastName: string;
	}): string => {
		const emailLocalPart = params.email.split("@")[0] || "";
		const fromEmail = sanitizeUserNameSegment(emailLocalPart);
		const fromName = sanitizeUserNameSegment(`${params.firstName}${params.lastName}`);
		let userName = fromEmail || fromName || "user";

		// Auth validation may reject usernames that start with non-letters.
		if (!/^[a-z]/.test(userName)) {
			userName = `u${userName}`;
		}

		// Keep username length reasonable for downstream auth constraints.
		return userName.slice(0, 30);
	};

	const generateUserCredentials = (
		person: any,
		employee: any,
	): { email: string; userName: string; password: string; organizationId: string } => {
		const email = person.contactInfo?.email;
		if (!email) {
			throw new Error("Person contactInfo.email is required for user creation");
		}

		const firstName = jsonStringField(person.personalInfo, "firstName") || "";
		const lastName = jsonStringField(person.personalInfo, "lastName") || "";
		const employeeId = employee.employeeId || "";

		// Generate username from email/name only (no employeeId suffix) to avoid invalid format issues.
		const userName = buildSafeUserName({ email, firstName, lastName });

		const password = buildBulkDefaultPassword(lastName, employeeId);

		// Get organizationId from person
		const organizationId = person.organizationId;
		if (!organizationId) {
			throw new Error("Person organizationId is required for user creation");
		}

		return { email, userName, password, organizationId };
	};

	// Helper function to create user account via auth service using /api/user
	const createUserAccount = async (
		userPayload: any,
		req: Request,
	): Promise<{ userId: string; roleName: string | null }> => {
		if (!appConfig.idpEnabled) {
			const bcrypt = resolveBcrypt();
			const hashedPassword = await bcrypt.hash(String(userPayload.password || ""), 10);
			const normalizedRole = String(
				userPayload.role || userPayload.roleName || "hris-employee",
			).trim();

			await ensureLocalUserUniqueness(userPayload);

			const created = await prisma.user.create({
				data: {
					email: userPayload.email,
					userName: userPayload.userName,
					password: hashedPassword,
					status: userPayload.status || "active",
					loginMethod: userPayload.loginMethod || "email",
					organizationId: userPayload.organizationId || null,
					role: normalizedRole,
					isDeleted: false,
					metadata: {
						...((userPayload.metadata || {}) as Record<string, any>),
						requirePasswordChange: true,
						isFirstLogin: true,
					},
				},
				select: { id: true },
			});
			return { userId: created.id, roleName: normalizedRole };
		}

		const authServiceUrl = buildAuthServiceUrl("/api/user");
		const token = extractTokenFromRequest(req);

		const metadata = {
			...(userPayload.metadata || {}),
			requirePasswordChange: true,
			isFirstLogin: true,
		};

		const createUserPayload = {
			email: userPayload.email,
			userName: userPayload.userName,
			password: userPayload.password,
			status: userPayload.status || "active",
			loginMethod: userPayload.loginMethod || "email",
			organizationId: userPayload.organizationId,
			roleIds:
				Array.isArray(userPayload.roleIds) && userPayload.roleIds.length > 0
					? userPayload.roleIds
					: userPayload.roleId
						? [userPayload.roleId]
						: [],
			metadata,
		};

		// Build request headers
		const requestHeaders: Record<string, string> = {
			"Content-Type": "application/json",
		};
		if (token) {
			requestHeaders["Authorization"] = `Bearer ${token}`;
			employeeLogger.info(`Token found: ${token.substring(0, 20)}...`);
		}

		employeeLogger.info(`Creating auth account for ${createUserPayload.email}...`);
		employeeLogger.info(`Making request to: ${authServiceUrl}`);
		employeeLogger.info("Create user payload:", JSON.stringify(createUserPayload, null, 2));

		let userResponse;
		try {
			userResponse = await fetch(authServiceUrl, {
				method: "POST",
				headers: requestHeaders,
				body: JSON.stringify(createUserPayload),
			});
		} catch (fetchError) {
			employeeLogger.error(`Network error: ${fetchError}`);
			throw new Error(
				`Network error calling auth service: ${
					fetchError instanceof Error ? fetchError.message : String(fetchError)
				}`,
			);
		}

		employeeLogger.info(`Auth service response status: ${userResponse.status}`);

		// Read response text first
		const responseText = await userResponse.text();
		employeeLogger.info(`Auth service raw response body: ${responseText}`);

		if (!userResponse.ok) {
			employeeLogger.error(`Auth service error: ${userResponse.status}`);
			employeeLogger.error(`Response body: ${responseText}`);
			let parsedErrorBody: any = undefined;
			try {
				parsedErrorBody = JSON.parse(responseText);
			} catch {
				parsedErrorBody = undefined;
			}

			const upstreamMessage =
				parsedErrorBody?.message ||
				(parsedErrorBody?.errors?.[0]?.message as string | undefined) ||
				`Auth service responded with status ${userResponse.status}`;
			throw new AuthServiceError(upstreamMessage, userResponse.status, parsedErrorBody);
		}

		// Parse successful response
		let userResult;
		try {
			userResult = JSON.parse(responseText);
		} catch (parseError) {
			employeeLogger.error(`Failed to parse response: ${parseError}`);
			throw new Error(`Invalid JSON response from auth service: ${responseText}`);
		}

		employeeLogger.info(
			"Auth account created successfully:",
			JSON.stringify(userResult, null, 2),
		);

		// Extract userId and role name from response
		let userId = null;
		let roleName = null;

		if (userResult.data) {
			userId = userResult.data.id;
			roleName =
				userResult.data.role ||
				userResult.data.userRoles?.[0]?.role?.name ||
				userResult.data.userRoles?.[0]?.name ||
				null;
		} else if (userResult.user) {
			userId = userResult.user.id;
			roleName =
				userResult.user.role ||
				userResult.user.userRoles?.[0]?.role?.name ||
				userResult.user.userRoles?.[0]?.name ||
				null;
		} else if (userResult.id) {
			userId = userResult.id;
			roleName = userResult.role || null;
		}

		employeeLogger.info(
			`Extracted userId: ${userId}, roleName: ${roleName}, organizationId: ${userPayload.organizationId}`,
		);

		if (!userId) {
			throw new Error(
				`Unable to extract userId from auth service response: ${JSON.stringify(userResult)}`,
			);
		}

		return { userId, roleName };
	};

	// Helper function to patch user metadata with employee information
	const patchUserMetadata = async (
		userId: string,
		data: {
			employeeId: string;
			firstName: string;
			lastName: string;
			department: { id: string; name: string; code: string };
			position: { id: string; title: string; code: string };
			workforceSource?: "DIRECT" | "AGENCY";
			agency?: {
				id: string;
				name: string;
				code?: string | null;
			};
			level?: { id: string; name: string; rank: number | null };
			reportTo?: {
				id: string;
				firstName: string;
				lastName: string;
				email?: string | null;
			} | null;
		},
		req: Request,
	): Promise<void> => {
		await syncUserMetadataFromEmployee(userId, data.employeeId, req);
	};

	// Helper function to update employee with userId and role
	const updateEmployeeWithUserId = async (
		employeeId: string,
		userId: string,
		roleName: string,
		flags?: { isManager?: boolean; isHrManager?: boolean },
	): Promise<any> => {
		employeeLogger.info("Updating employee with userId and role");
		const updatedEmployee = await prisma.employee.update({
			where: { id: employeeId },
			data: {
				userId: userId,
				role: roleName,
				...(flags !== undefined && {
					isManager: flags.isManager ?? false,
					isHrManager: flags.isHrManager ?? false,
				}),
			},
			include: {
				department: true,
				section: true,
				position: true,
				level: true,
				agency: {
					select: {
						id: true,
						name: true,
						code: true,
					},
				},
				documents: {
					where: { isDeleted: false },
				},
				reportTo: {
					select: {
						id: true,
						employeeId: true,
						person: {
							select: {
								personalInfo: true,
								contactInfo: true,
							},
						},
					},
				},
			},
		});

		employeeLogger.info(`Employee updated with userId: ${updatedEmployee.id}`);
		return updatedEmployee;
	};

	// Helper function to log employee creation activity and audit
	const logEmployeeCreation = (req: Request, employee: any): void => {
		logActivity(req, {
			userId: (req as any).user?.id || "unknown",
			action: config.ACTIVITY_LOG.EMPLOYEE.ACTIONS.CREATE_EMPLOYEE,
			description: `Employee created with account: ${employee.employeeId || employee.id}`,
			page: {
				url: req.originalUrl,
				title: config.ACTIVITY_LOG.EMPLOYEE.PAGES.EMPLOYEE_CREATION,
			},
		});

		logAudit(req, {
			userId: (req as any).user?.id || "unknown",
			action: config.AUDIT_LOG.ACTIONS.CREATE,
			resource: config.AUDIT_LOG.RESOURCES.EMPLOYEE,
			severity: config.AUDIT_LOG.SEVERITY.LOW,
			entityType: config.AUDIT_LOG.ENTITY_TYPES.EMPLOYEE,
			entityId: employee.id,
			changesBefore: null,
			changesAfter: {
				id: employee.id,
				employeeId: employee.employeeId,
				personId: employee.personId,
				userId: employee.userId,
				role: employee.role,
				schedule: resolveEmployeeActiveSchedule(employee),
				employmentHireDate: employee.employmentHireDate,
				createdAt: employee.createdAt,
				updatedAt: employee.updatedAt,
			},
			description: `Employee created with account: ${employee.employeeId || employee.id}`,
		});
	};

	// Helper function to handle create employee errors
	const EMPLOYEE_FIELD_LABELS: Record<string, string> = {
		employeeId: "employee ID",
		personId: "person",
		userId: "user",
		departmentId: "department",
		sectionId: "section",
		positionId: "position",
		levelId: "level",
		reportToId: "reporting manager",
		agencyId: "agency",
		organizationId: "organization",
		employmentHireDate: "employment hire date",
		employmentStartDate: "employment start date",
		employmentTerminationDate: "employment termination date",
	};

	const isPrismaKnownRequestError = (
		error: any,
	): error is Prisma.PrismaClientKnownRequestError => {
		return (
			error instanceof Prisma.PrismaClientKnownRequestError ||
			(error &&
				typeof error === "object" &&
				typeof error.code === "string" &&
				/^P\d{4}$/.test(error.code) &&
				typeof error.message === "string")
		);
	};

	const isPrismaValidationError = (error: any): error is Prisma.PrismaClientValidationError => {
		return (
			error instanceof Prisma.PrismaClientValidationError ||
			(error &&
				typeof error === "object" &&
				typeof error.name === "string" &&
				error.name.includes("PrismaClientValidationError") &&
				typeof error.message === "string")
		);
	};

	const normalizeFieldFromToken = (token: string): string => {
		const cleaned = String(token || "")
			.replace(/`/g, "")
			.replace(/\s+/g, "")
			.replace(/\([^)]*\)/g, "")
			.replace(/[^a-zA-Z0-9_]/g, "");

		if (!cleaned) return "system";

		const knownFields = Object.keys(EMPLOYEE_FIELD_LABELS);
		for (const field of knownFields) {
			if (cleaned.toLowerCase().includes(field.toLowerCase())) {
				return field;
			}
		}

		return cleaned;
	};

	const getFieldLabel = (field: string): string => EMPLOYEE_FIELD_LABELS[field] || field;

	const parsePrismaTargets = (error: any): string[] => {
		const metaTarget = error?.meta?.target;
		if (Array.isArray(metaTarget)) {
			return metaTarget.map((item) => normalizeFieldFromToken(String(item))).filter(Boolean);
		}
		if (typeof metaTarget === "string" && metaTarget.trim().length > 0) {
			return [normalizeFieldFromToken(metaTarget)];
		}

		const fieldName = error?.meta?.field_name || error?.meta?.fieldName;
		if (typeof fieldName === "string" && fieldName.trim().length > 0) {
			return [normalizeFieldFromToken(fieldName)];
		}

		const message = typeof error?.message === "string" ? error.message : "";
		const inferred: string[] = [];
		const knownFields = Object.keys(EMPLOYEE_FIELD_LABELS);
		for (const field of knownFields) {
			if (message.includes(field)) inferred.push(field);
		}

		return inferred;
	};

	const handleCreateEmployeeError = (error: any, res: Response): void => {
		employeeLogger.error(`Failed to create employee with account: ${error}`);

		if (error instanceof AuthServiceError) {
			const upstreamMessage =
				error.upstreamBody?.message ||
				error.upstreamBody?.errors?.[0]?.message ||
				error.message;
			const normalized = String(upstreamMessage || "").toLowerCase();
			const conflictOn = String(error.upstreamBody?.conflictOn || "").toLowerCase();

			if (
				error.statusCode === 409 &&
				(normalized.includes("user already exists") ||
					normalized.includes("email already exists") ||
					conflictOn === "username")
			) {
				const emailField =
					error.upstreamBody?.errors?.find(
						(e: any) =>
							typeof e?.field === "string" && e.field.toLowerCase().includes("email"),
					) || null;
				const errorResponse = buildErrorResponse("User already exists", 409, [
					{
						field: "person.contactInfo.email",
						message:
							emailField?.message ||
							(conflictOn === "username"
								? "A user with this generated username already exists. Please use a different email."
								: "A user with this email already exists. Please use a different email."),
					},
				]);
				res.status(409).json(errorResponse);
				return;
			}

			const fallbackStatus =
				error.statusCode >= 400 && error.statusCode < 600 ? error.statusCode : 400;
			const errorResponse = buildErrorResponse(
				"Failed to create user account",
				fallbackStatus,
				[
					{
						field: "user",
						message: upstreamMessage || "Auth service error",
					},
				],
			);
			res.status(fallbackStatus).json(errorResponse);
			return;
		}

		if (isPrismaKnownRequestError(error)) {
			const code = error.code;
			const targets = parsePrismaTargets(error);
			const primaryField = targets[0] || "system";

			if (code === "P2002") {
				if (targets.includes("employeeId")) {
					const errorResponse = buildErrorResponse("Employee ID already exists", 409, [
						{
							field: "employeeId",
							message:
								"Employee ID already exists in this organization. Please use a different employee ID.",
						},
					]);
					res.status(409).json(errorResponse);
					return;
				}

				if (targets.includes("personId")) {
					const errorResponse = buildErrorResponse("Duplicate person assignment", 409, [
						{
							field: "personId",
							message: "This person is already associated with an employee record.",
						},
					]);
					res.status(409).json(errorResponse);
					return;
				}

				if (targets.includes("userId")) {
					const errorResponse = buildErrorResponse("Duplicate user assignment", 409, [
						{
							field: "userId",
							message: "This user is already associated with an employee record.",
						},
					]);
					res.status(409).json(errorResponse);
					return;
				}

				const label = getFieldLabel(primaryField);
				const errorResponse = buildErrorResponse("Duplicate record detected", 409, [
					{
						field: primaryField,
						message: `A record with the same ${label} already exists.`,
					},
				]);
				res.status(409).json(errorResponse);
				return;
			}

			if (code === "P2003") {
				const label = getFieldLabel(primaryField);
				const errorResponse = buildErrorResponse("Invalid relation reference", 400, [
					{
						field: primaryField,
						message: `Invalid ${label} reference. Please select a valid ${label}.`,
					},
				]);
				res.status(400).json(errorResponse);
				return;
			}

			if (code === "P2025") {
				const label = getFieldLabel(primaryField);
				const errorResponse = buildErrorResponse("Referenced record not found", 400, [
					{
						field: primaryField,
						message: `The selected ${label} was not found.`,
					},
				]);
				res.status(400).json(errorResponse);
				return;
			}

			const isInputError = typeof code === "string" && code.startsWith("P20");
			const statusCode = isInputError ? 400 : 500;
			const errorResponse = buildErrorResponse(
				isInputError ? "Invalid employee data" : "Failed to create employee with account",
				statusCode,
				[
					{
						field: primaryField,
						message: isInputError
							? "One or more fields contain invalid or inconsistent values."
							: "An unexpected database error occurred.",
					},
				],
			);
			res.status(statusCode).json(errorResponse);
			return;
		}

		if (isPrismaValidationError(error)) {
			const argumentMatch = error.message.match(/Argument\s+`([^`]+)`/i);
			const rawField = argumentMatch?.[1] || "system";
			const field = normalizeFieldFromToken(rawField);
			const label = getFieldLabel(field);
			const errorResponse = buildErrorResponse("Invalid employee data", 400, [
				{
					field,
					message:
						field === "system"
							? "One or more request fields are invalid."
							: `Invalid value provided for ${label}.`,
				},
			]);
			res.status(400).json(errorResponse);
			return;
		}

		// Check for specific error types and provide clear messages
		if (error instanceof Error) {
			// Check if it's a duplicate person error
			if (error.message.includes("Person already exists")) {
				const errorResponse = buildErrorResponse("Person already exists", 409, [
					{
						field: "person",
						message: error.message,
					},
				]);
				res.status(409).json(errorResponse);
				return;
			}

			// Check if it's a duplicate employee ID error
			if (
				error.message.includes("Employee with ID") &&
				error.message.includes("already exists")
			) {
				const errorResponse = buildErrorResponse("Employee ID already exists", 409, [
					{
						field: "employeeId",
						message: error.message,
					},
				]);
				res.status(409).json(errorResponse);
				return;
			}

			// Check for Prisma unique constraint errors
			if (error.message.includes("Unique constraint failed")) {
				let field = "system";
				let message = "A record with this information already exists";

				if (error.message.includes("employees_organizationId_employeeId_key")) {
					field = "employeeId";
					message =
						"Employee ID already exists in this organization. Please use a different employee ID.";
				} else if (error.message.includes("employees_organizationId_personId_key")) {
					field = "personId";
					message =
						"This person is already associated with an employee in this organization.";
				} else if (error.message.includes("employees_organizationId_userId_key")) {
					field = "userId";
					message =
						"This user is already associated with an employee in this organization.";
				}

				const errorResponse = buildErrorResponse("Duplicate record detected", 409, [
					{
						field: field,
						message: message,
					},
				]);
				res.status(409).json(errorResponse);
				return;
			}

			// Check for validation errors from external services
			if (
				error.message.includes("auth service") ||
				error.message.includes("authService") ||
				error.message.includes("Failed to create user account")
			) {
				const errorResponse = buildErrorResponse("Failed to create user account", 400, [
					{
						field: "user",
						message: error.message,
					},
				]);
				res.status(400).json(errorResponse);
				return;
			}

			// Check for email or organizationId validation errors
			if (
				error.message.includes("email is required") ||
				error.message.includes("organizationId is required")
			) {
				const field = error.message.includes("email")
					? "person.contactInfo.email"
					: "person.organizationId";
				const errorResponse = buildErrorResponse(error.message, 400, [
					{
						field: field,
						message: error.message,
					},
				]);
				res.status(400).json(errorResponse);
				return;
			}
		}

		// Generic error fallback
		const errorResponse = buildErrorResponse("Failed to create employee with account", 500, [
			{
				field: "system",
				message: "An unexpected error occurred while creating the employee.",
			},
		]);
		res.status(500).json(errorResponse);
	};

	/**
	 * Helper function to create or update birthday calendar item for an employee
	 * @param employeeId The ID of the employee
	 * @param organizationId The organization ID
	 * @param dateOfBirth The employee's date of birth
	 * @param personName The employee's full name
	 */
	const createOrUpdateBirthdayCalendarItem = async (
		employeeId: string,
		organizationId: string,
		dateOfBirth: Date | null | undefined,
		personName: string,
	): Promise<void> => {
		try {
			if (!dateOfBirth) {
				employeeLogger.info(
					`No date of birth for employee ${employeeId}, skipping birthday calendar item`,
				);
				return;
			}

			const currentYear = new Date().getFullYear();

			// Calculate birthday for the current year using UTC to avoid timezone issues
			const birthday = new Date(dateOfBirth);
			const birthdayThisYear = new Date(
				Date.UTC(currentYear, birthday.getUTCMonth(), birthday.getUTCDate(), 0, 0, 0, 0),
			);

			// Check if a birthday calendar item already exists for this employee in this year
			const existingBirthdayItem = await prisma.calendarItem.findFirst({
				where: {
					organizationId,
					year: currentYear,
					type: "BIRTHDAY",
					assignedEmployeeId: employeeId,
				},
			});

			if (existingBirthdayItem) {
				// Update existing birthday calendar item
				await prisma.calendarItem.update({
					where: { id: existingBirthdayItem.id },
					data: {
						title: `${personName}'s Birthday`,
						description: `Happy Birthday to ${personName}!`,
						startDate: birthdayThisYear,
						endDate: birthdayThisYear,
						year: currentYear,
						isAllDay: true,
						status: "ACTIVE",
					},
				});
				employeeLogger.info(`Updated birthday calendar item for employee ${employeeId}`);
			} else {
				// Create new birthday calendar item
				await prisma.calendarItem.create({
					data: {
						organizationId,
						year: currentYear,
						title: `${personName}'s Birthday`,
						description: `Happy Birthday to ${personName}!`,
						type: "BIRTHDAY",
						startDate: birthdayThisYear,
						endDate: birthdayThisYear,
						isAllDay: true,
						timezone: "UTC",
						status: "ACTIVE",
						assignedEmployeeId: employeeId,
						tags: ["birthday", "celebration"],
					},
				});
				employeeLogger.info(`Created birthday calendar item for employee ${employeeId}`);
			}
		} catch (error) {
			employeeLogger.error(
				`Error creating/updating birthday calendar item for employee ${employeeId}: ${error}`,
			);
			// Don't throw error - birthday calendar item creation should not block employee creation/update
		}
	};

	/**
	 * Helper function to delete birthday calendar item for an employee
	 * @param employeeId The ID of the employee
	 */
	const deleteBirthdayCalendarItem = async (employeeId: string): Promise<void> => {
		try {
			// Delete all birthday calendar items for this employee
			await prisma.calendarItem.deleteMany({
				where: {
					type: "BIRTHDAY",
					assignedEmployeeId: employeeId,
				},
			});
			employeeLogger.info(`Deleted birthday calendar items for employee ${employeeId}`);
		} catch (error) {
			employeeLogger.error(
				`Error deleting birthday calendar item for employee ${employeeId}: ${error}`,
			);
			// Don't throw error
		}
	};

	/**
	 * Best-effort rollback for local records created before auth account provisioning succeeds.
	 * Prevents orphan person/employee rows that later trigger duplicate employeeId/person conflicts.
	 */
	const rollbackLocalEmployeeCreation = async (
		employeeId?: string | null,
		personId?: string | null,
	): Promise<void> => {
		if (!employeeId && !personId) return;
		try {
			await prisma.$transaction(async (tx) => {
				if (employeeId) {
					await tx.calendarItem.deleteMany({
						where: {
							type: "BIRTHDAY",
							assignedEmployeeId: employeeId,
						},
					});
					await tx.document.deleteMany({
						where: { employeeId },
					});
					await tx.employee.deleteMany({
						where: { id: employeeId },
					});
				}

				if (personId) {
					await tx.person.deleteMany({
						where: { id: personId },
					});
				}
			});
			employeeLogger.warn(
				`Rollback succeeded for local employee creation (employeeId=${employeeId || "n/a"}, personId=${personId || "n/a"})`,
			);
		} catch (rollbackError) {
			employeeLogger.error(
				`Rollback failed after auth provisioning error (employeeId=${employeeId || "n/a"}, personId=${personId || "n/a"}): ${rollbackError}`,
			);
		}
	};

	return {
		extractTokenFromRequest,
		prepareAuthHeaders,
		buildAuthServiceUrl,
		updateUserAccount,
		updateUserMetadata,
		syncUserMetadataFromEmployee,
		syncUserMetadataForEmployees,
		fetchUserDataFromAuthService,
		fetchFilteredUsers,
		enrichEmployeesWithUserData,
		validateEmployeeExists,
		invalidateEmployeeCaches,
		invalidateAttendanceCaches,
		buildDepartmentIncludeFields,
		addEmployeeCountToDepartment,
		checkForDuplicateEmployeeId,
		checkForDuplicatePerson,
		createPersonLocally,
		createPersonAndEmployeeInTransaction,
		createEmployeeInTransaction,
		buildEmployeeMetadata,
		generateUserCredentials,
		createUserAccount,
		patchUserMetadata,
		updateEmployeeWithUserId,
		logEmployeeCreation,
		handleCreateEmployeeError,
		createOrUpdateBirthdayCalendarItem,
		deleteBirthdayCalendarItem,
		rollbackLocalEmployeeCreation,
	};
};

/**
 * Post-process employees to convert relation arrays into grouped counts
 * For attendance status, calculates ABSENT based on employee's active schedule
 * ABSENT = Working days (from all attendance dates) - (PRESENT + LEAVE)
 * @param employees Array of employee records with attendance data
 * @param aggregateBy The relation field to aggregate (e.g., "attendances")
 * @param countBy The field to group counts by (e.g., "status")
 * @param defaultValues Optional array of default values to initialize with 0 (e.g., ["PRESENT", "LEAVE", "ABSENT"])
 * @returns Processed employees with grouped counts
 */
export function processGroupedCounts(
	employees: any[],
	aggregateBy?: string,
	countBy?: string,
	defaultValues?: string[],
): any[] {
	if (!aggregateBy || !countBy) return employees;

	return employees.map((employee) => {
		const processed = { ...employee };

		// Get the relation data
		const relationData = employee[aggregateBy];

		if (Array.isArray(relationData)) {
			// Initialize with default values if provided
			const grouped: Record<string, number> = {};

			// Set all default values to 0
			if (defaultValues && Array.isArray(defaultValues)) {
				defaultValues.forEach((value) => {
					grouped[value] = 0;
				});
			}

			// Count actual occurrences from attendance records
			relationData.forEach((record: any) => {
				const value = record[countBy];
				if (value !== undefined && value !== null) {
					grouped[value] = (grouped[value] || 0) + 1;
				}
			});

			// Calculate ABSENT for attendance status based on schedule
			if (aggregateBy === "attendances" && countBy === "status") {
				const absentCount = calculateAbsentFromSchedule(employee, relationData);
				grouped.ABSENT = absentCount;
			}

			// Replace the relation data with grouped counts in _count
			delete processed[aggregateBy];
			processed._count = processed._count || {};
			processed._count[aggregateBy] = grouped;
		}

		return processed;
	});
}

/**
 * Calculate absent days based on employee's active schedule
 * Logic: Count working days from hire date to today where employee was absent
 * ABSENT = Working days (from hire date to today) - (PRESENT + LEAVE)
 *
 * IMPORTANT: This function uses ONLY the employee data already fetched.
 * No additional database calls are made.
 */
function calculateAbsentFromSchedule(employee: any, attendanceRecords: any[]): number {
	// Get embedded schedule from employee
	const schedule = resolveEmployeeActiveSchedule(employee);
	if (!schedule) {
		return 0; // No schedule assigned
	}

	// Extract shifts from embedded schedule
	// Structure: active schedule snapshot shifts
	if (!schedule.shifts || !Array.isArray(schedule.shifts)) {
		return 0; // No shifts data available
	}

	const shifts = schedule.shifts;

	// Get hire date
	const employmentHireDate = employee.employmentHireDate
		? new Date(employee.employmentHireDate)
		: null;
	if (!employmentHireDate) {
		return 0; // No hire date, can't calculate
	}

	const today = new Date();
	today.setUTCHours(0, 0, 0, 0);

	const startDate = new Date(employmentHireDate);
	startDate.setUTCHours(0, 0, 0, 0);

	// If terminated, use termination date as end date, otherwise use today
	const endDate = employee.employmentTerminationDate
		? new Date(employee.employmentTerminationDate)
		: today;
	endDate.setUTCHours(23, 59, 59, 999);

	// Build a map of attendance by date for quick lookup
	const attendanceByDate = new Map<string, any>();
	attendanceRecords.forEach((record) => {
		if (record.date) {
			const dateStr = new Date(record.date).toISOString().split("T")[0];
			attendanceByDate.set(dateStr, record);
		}
	});

	// Count absent days
	let absentCount = 0;
	const cursorDate = new Date(startDate);

	while (cursorDate <= endDate) {
		const dayOfWeek = cursorDate.getDay(); // 0 = Sunday, 6 = Saturday

		// Find shift for this day of week using inline logic (no external helper needed)
		const shift = findShiftForDayInline(shifts, dayOfWeek);

		// If it's a working day (not a rest day)
		if (shift && !shift.isRestDay) {
			const dateStr = cursorDate.toISOString().split("T")[0];
			const attendance = attendanceByDate.get(dateStr);

			// Count as absent if:
			// 1. No attendance record for this working day, OR
			// 2. Attendance status is neither PRESENT nor LEAVE
			if (!attendance || (attendance.status !== "PRESENT" && attendance.status !== "LEAVE")) {
				absentCount++;
			}
		}

		// Move to next day
		cursorDate.setDate(cursorDate.getDate() + 1);
	}

	return absentCount;
}

// ... (existing content)

// Helper function to find shift for a day of week
// No database calls - works with shifts array already in memory
function findShiftForDayInline(shifts: any[], dayOfWeek: number): any {
	const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
	const dayFullNames = [
		"Sunday",
		"Monday",
		"Tuesday",
		"Wednesday",
		"Thursday",
		"Friday",
		"Saturday",
	];

	const dayLabel = dayNames[dayOfWeek];
	const dayFullName = dayFullNames[dayOfWeek];

	return shifts.find((shift: any) => shift.label === dayLabel || shift.label === dayFullName);
}

// Constants for required documents
export const REQUIRED_DOCUMENTS = [
	"SSS",
	"TIN",
	"PhilHealth",
	"Pag-IBIG",
	"Birth Certificate",
	"NBI Clearance",
];

// Helper function to check missing credentials
export const checkMissingCredentials = (employeeData: any): string[] => {
	const missingDocs: string[] = [];
	const uploadedDocs = employeeData.documents || [];

	REQUIRED_DOCUMENTS.forEach((docType) => {
		const doc = uploadedDocs.find((d: any) => d.type === docType);
		// Check if document exists and has a file URL (or some indication of being provided)
		if (!doc || !doc.fileUrl) {
			missingDocs.push(docType);
		}
	});

	return missingDocs;
};

