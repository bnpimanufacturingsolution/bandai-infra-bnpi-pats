import { NextFunction, Response } from "express";
import { PrismaClient } from "../../generated/prisma";
import { config } from "../../config/config";
import { config as appConstants } from "../../config/constant";
import { buildAuthCookieOptions } from "../../helper/auth-cookie.helper";
import { buildBulkDefaultPassword } from "../../helper/bulk-password.helper";
import { buildErrorResponse } from "../../helper/error-handler";
import {
	buildProvisioningAccessSnapshot,
	extractProvisioningState,
} from "../../helper/provisioning-state.helper";
import { buildPagination, buildSuccessResponse } from "../../helper/success-handler.helper";
import { uploadToCloudinary } from "../../helper/cloudinary.helper";
import { AuthRequest } from "../../middleware/verifyToken";
import { logAudit } from "../../utils/auditLogger";
import jwt from "jsonwebtoken";

const DEFAULT_ME_MESSAGE = "User profile retrieved successfully";
const DEFAULT_LOGIN_MESSAGE = "Login successful";
const DEFAULT_LOGOUT_MESSAGE = "Logout successful";
const DEFAULT_PASSWORD_CHANGE_MESSAGE = "Password updated successfully";
const DEFAULT_AVATAR_UPDATED_MESSAGE = "Avatar updated successfully";
const DEFAULT_AVATAR_RETRIEVED_MESSAGE = "Avatar retrieved successfully";
const REQUEST_TIMEOUT_MS = 8000;
const bcrypt: {
	compare(data: string, encrypted: string): Promise<boolean>;
	hash(data: string, saltOrRounds: number): Promise<string>;
} = require("bcryptjs");

type AnyRecord = Record<string, any>;
type AuthRoleSource = "local" | "idp";
type LocalUserStatus = "active" | "inactive" | "suspended" | "archived";
type UnifiedAuthRole = {
	id: string;
	name: string;
	displayName: string;
	source: AuthRoleSource;
};

const DEFAULT_ROLES_MESSAGE = "Roles retrieved successfully";
const DEFAULT_USERS_MESSAGE = "Users retrieved successfully";
const DEFAULT_USER_MESSAGE = "User retrieved successfully";
const DEFAULT_USER_CREATED_MESSAGE = "User created successfully";
const DEFAULT_USER_UPDATED_MESSAGE = "User updated successfully";
const DEFAULT_USER_DELETED_MESSAGE = "User deleted successfully";
const DEFAULT_USER_PASSWORD_RESET_MESSAGE = "User password reset successfully";
const LOCAL_ROLE_CATALOG: UnifiedAuthRole[] = [
	{
		id: "hris-hr-manager",
		name: "hris-hr-manager",
		displayName: "HR Manager",
		source: "local",
	},
	{
		id: "hris-hr-user",
		name: "hris-hr-user",
		displayName: "HR User",
		source: "local",
	},
	{
		id: "hris-employee-manager",
		name: "hris-employee-manager",
		displayName: "Employee Manager",
		source: "local",
	},
	{
		id: "hris-employee",
		name: "hris-employee",
		displayName: "Employee",
		source: "local",
	},
	{
		id: "hris-admin",
		name: "hris-admin",
		displayName: "HRIS Admin",
		source: "local",
	},
	{
		id: "admin",
		name: "admin",
		displayName: "Admin",
		source: "local",
	},
	{
		id: "super_admin",
		name: "super_admin",
		displayName: "Super Admin",
		source: "local",
	},
];

const mergeUniqueRoles = (
	primaryRoles: UnifiedAuthRole[],
	fallbackRoles: UnifiedAuthRole[],
): UnifiedAuthRole[] => {
	const byName = new Map<string, UnifiedAuthRole>();
	for (const role of [...primaryRoles, ...fallbackRoles]) {
		const key = String(role?.name || role?.id || "")
			.trim()
			.toLowerCase();
		if (!key) continue;
		if (!byName.has(key)) {
			byName.set(key, role);
		}
	}
	return Array.from(byName.values());
};

const parsePositiveInt = (value: unknown, fallback: number): number => {
	const parsed = Number.parseInt(String(value ?? ""), 10);
	if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
	return parsed;
};

const parseFilterMap = (rawFilter: unknown): Record<string, string> => {
	const value = String(rawFilter || "").trim();
	if (!value) return {};
	return value
		.split(",")
		.map((segment) => segment.trim())
		.filter(Boolean)
		.reduce<Record<string, string>>((acc, segment) => {
			const separatorIndex = segment.indexOf(":");
			if (separatorIndex <= 0) return acc;
			const key = segment.slice(0, separatorIndex).trim();
			const filterValue = segment.slice(separatorIndex + 1).trim();
			if (!key || !filterValue) return acc;
			acc[key] = filterValue;
			return acc;
		}, {});
};

const normalizeLocalUserStatus = (value: unknown): LocalUserStatus => {
	const normalized = String(value || "active")
		.trim()
		.toLowerCase();
	if (normalized === "inactive") return "inactive";
	if (normalized === "suspended") return "suspended";
	if (normalized === "archived") return "archived";
	return "active";
};

const mergeUserMetadata = (
	existingMetadata: unknown,
	updates: Record<string, any>,
): Record<string, any> => {
	const baseMetadata =
		existingMetadata && typeof existingMetadata === "object" && !Array.isArray(existingMetadata)
			? { ...(existingMetadata as Record<string, any>) }
			: {};

	return {
		...baseMetadata,
		...updates,
	};
};

const asRecord = (value: unknown): Record<string, any> =>
	value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, any>) : {};

const jsonStringField = (value: unknown, key: string): string | null => {
	const record = asRecord(value);
	const raw = record[key];
	return typeof raw === "string" ? raw : null;
};

const getUploadedAvatarFile = (req: AuthRequest): Express.Multer.File | null => {
	const files = (req as any).files as Record<string, Express.Multer.File[]> | undefined;
	return files?.avatar?.[0] || null;
};

const uploadUserAvatarFile = async (params: { file: Express.Multer.File; userId: string }) => {
	const safeUserId =
		String(params.userId || "user")
			.trim()
			.replace(/[^a-zA-Z0-9_-]+/g, "_") || "user";
	const extensionFromName = (params.file.originalname || "").match(/\.[a-zA-Z0-9]+$/)?.[0] || "";
	const extensionFromMime =
		params.file.mimetype === "image/png"
			? ".png"
			: params.file.mimetype === "image/webp"
				? ".webp"
				: params.file.mimetype === "image/gif"
					? ".gif"
					: params.file.mimetype === "image/jpeg"
						? ".jpg"
						: "";
	const avatarExtension = (extensionFromMime || extensionFromName || ".jpg").toLowerCase();

	return uploadToCloudinary(params.file.buffer, {
		folder: `hris/users/${safeUserId}/avatar`,
		resourceType: "image",
		publicId: `avatar_${safeUserId}_${Date.now()}${avatarExtension}`,
		overwrite: true,
		transformation: {
			width: 512,
			height: 512,
			crop: "fill",
			quality: "auto",
		},
	});
};

const resolveResetPasswordEmployee = async (params: {
	prisma: PrismaClient;
	userId: string;
	organizationId?: string | null;
	metadata?: unknown;
}): Promise<{
	id: string;
	employeeId: string | null;
	lastName: string | null;
}> => {
	const storedEmployeeId = String(
		(params.metadata as Record<string, any> | null | undefined)?.employee?.id || "",
	).trim();

	const employee = await params.prisma.employee.findFirst({
		where: {
			isDeleted: false,
			...(storedEmployeeId ? { id: storedEmployeeId } : { userId: params.userId }),
			...(params.organizationId ? { organizationId: params.organizationId } : {}),
		},
		select: {
			id: true,
			employeeId: true,
			person: {
				select: {
					personalInfo: true,
				},
			},
		},
	});

	if (!employee) {
		throw Object.assign(new Error("Employee record not found for user"), { statusCode: 404 });
	}

	return {
		id: employee.id,
		employeeId: employee.employeeId || null,
		lastName: jsonStringField(employee.person?.personalInfo, "lastName"),
	};
};

const mapLocalUser = (user: AnyRecord): AnyRecord => ({
	id: user.id,
	email: user.email,
	userName: user.userName,
	avatar:
		typeof user?.avatar === "string" && user.avatar.trim().length > 0
			? user.avatar
			: user?.metadata && typeof user.metadata === "object"
				? (user.metadata as AnyRecord).avatar || undefined
				: undefined,
	role: user.role,
	roleId: user.role,
	status: user.status,
	organizationId: user.organizationId || undefined,
	metadata: user.metadata || undefined,
	loginMethod: user.loginMethod || undefined,
	lastLogin: user.lastLogin || undefined,
	createdAt: user.createdAt,
	updatedAt: user.updatedAt,
});

const forwardIdpRequest = async (params: {
	req: AuthRequest;
	path: string;
	method: "GET" | "POST" | "PATCH" | "DELETE";
	body?: AnyRecord;
}): Promise<{ status: number; body: AnyRecord }> => {
	const token = extractTokenFromRequest(params.req);
	const headers: Record<string, string> = {
		Accept: "application/json",
	};
	if (params.method === "POST" || params.method === "PATCH") {
		headers["Content-Type"] = "application/json";
	}
	if (token) {
		headers.Authorization = `Bearer ${token}`;
		headers.Cookie = `token=${token}`;
	}

	const upstream = await fetchWithTimeout(
		`${config.authBaseUrl}${params.path}`,
		{
			method: params.method,
			headers,
			body:
				params.method === "POST" || params.method === "PATCH"
					? JSON.stringify(params.body || {})
					: undefined,
		},
		REQUEST_TIMEOUT_MS,
	);

	const text = await upstream.text();
	let parsed: AnyRecord = {};
	try {
		parsed = text ? JSON.parse(text) : {};
	} catch {
		parsed = { message: text };
	}

	return {
		status: upstream.status || 500,
		body: parsed,
	};
};

const extractTokenFromRequest = (req: AuthRequest): string | undefined => {
	const cookieToken = req.cookies?.token;
	if (cookieToken) return cookieToken;

	const authHeader = req.headers.authorization;
	if (!authHeader) return undefined;
	if (authHeader.startsWith("Bearer ")) return authHeader.slice(7);
	return authHeader;
};

const normalizeProfile = (payload: AnyRecord): AnyRecord => {
	const source = payload?.data && typeof payload.data === "object" ? payload.data : payload;
	const organizationBranding =
		source?.organization && typeof source.organization === "object"
			? source.organization.branding
			: undefined;
	const organization =
		source?.organization && typeof source.organization === "object"
			? {
					id: source.organization.id,
					name: source.organization.name,
					code: source.organization.code,
					branding: organizationBranding,
					provisioning: buildProvisioningAccessSnapshot({
						provisioning: extractProvisioningState(organizationBranding),
					}),
					description: source.organization.description,
				}
			: source?.organizationId
				? { id: source.organizationId }
				: undefined;

	return {
		id: source?.id,
		email: source?.email,
		userName: source?.userName,
		avatar:
			(typeof source?.avatar === "string" && source.avatar.trim().length > 0
				? source.avatar
				: source?.metadata && typeof source.metadata === "object"
					? source.metadata.avatar
					: undefined) || undefined,
		status: source?.status,
		lastLogin: source?.lastLogin,
		loginMethod: source?.loginMethod,
		createdAt: source?.createdAt,
		updatedAt: source?.updatedAt,
		organizationId: source?.organizationId || organization?.id,
		organization,
		role: source?.role,
		roleId: source?.roleId,
		metadata: source?.metadata,
	};
};

const mergeEmployeeMetadata = (base: AnyRecord | undefined, incoming: AnyRecord | undefined) => {
	if (!incoming || typeof incoming !== "object") return base;
	if (!base || typeof base !== "object") return incoming;

	return {
		...base,
		...incoming,
		personalInfo: {
			...(base.personalInfo || {}),
			...(incoming.personalInfo || {}),
		},
		department: incoming.department || base.department,
		section: incoming.section || base.section,
		position: incoming.position || base.position,
		level: incoming.level || base.level,
		reportTo: incoming.reportTo || base.reportTo,
	};
};

const mergeProfileWithLocalEmployeeContext = (
	profile: AnyRecord,
	localProfile?: AnyRecord | null,
): AnyRecord => {
	const localAvatar =
		typeof localProfile?.avatar === "string" && localProfile.avatar.trim().length > 0
			? localProfile.avatar
			: undefined;

	const mergedOrganization =
		profile?.organization || localProfile?.organization
			? {
					...((profile?.organization as AnyRecord | undefined) || {}),
					...((localProfile?.organization as AnyRecord | undefined) || {}),
					branding:
						(localProfile?.organization as AnyRecord | undefined)?.branding ||
						(profile?.organization as AnyRecord | undefined)?.branding,
					provisioning:
						(localProfile?.organization as AnyRecord | undefined)?.provisioning ||
						(profile?.organization as AnyRecord | undefined)?.provisioning,
				}
			: undefined;

	if (!localProfile?.metadata?.employee) {
		return {
			...profile,
			avatar: localAvatar || profile.avatar,
			organization: mergedOrganization,
		};
	}

	const baseMetadata =
		profile?.metadata && typeof profile.metadata === "object" ? profile.metadata : {};

	return {
		...profile,
		avatar: localAvatar || profile.avatar,
		organizationId: profile?.organizationId || localProfile?.organizationId,
		organization: mergedOrganization,
		metadata: {
			...baseMetadata,
			employee: mergeEmployeeMetadata(baseMetadata.employee, localProfile.metadata.employee),
		},
	};
};

const fetchWithTimeout = async (url: string, init: RequestInit, timeoutMs: number) => {
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), timeoutMs);
	try {
		return await fetch(url, { ...init, signal: controller.signal });
	} finally {
		clearTimeout(timer);
	}
};

const toRoleDisplayName = (roleName: string): string => {
	const compact = String(roleName || "")
		.trim()
		.replace(/^hris-/, "")
		.replace(/[_-]+/g, " ");
	if (!compact) return "Unknown Role";
	return compact.replace(/\b\w/g, (letter) => letter.toUpperCase());
};

const normalizeRoleDocument = (
	roleDoc: AnyRecord,
	source: AuthRoleSource,
): UnifiedAuthRole | null => {
	const rawName = roleDoc?.name || roleDoc?.code || roleDoc?.key;
	const name = typeof rawName === "string" ? rawName.trim() : "";
	if (!name) return null;
	const rawId = roleDoc?.id || roleDoc?._id || name;
	const id = typeof rawId === "string" ? rawId : String(rawId || name);

	return {
		id,
		name,
		displayName:
			typeof roleDoc?.displayName === "string" && roleDoc.displayName.trim().length > 0
				? roleDoc.displayName.trim()
				: toRoleDisplayName(name),
		source,
	};
};

const extractRoleDocuments = (payload: AnyRecord): AnyRecord[] => {
	if (Array.isArray(payload?.data?.roles)) return payload.data.roles;
	if (Array.isArray(payload?.data?.documents)) return payload.data.documents;
	if (Array.isArray(payload?.data?.docs)) return payload.data.docs;
	if (Array.isArray(payload?.data?.data)) return payload.data.data;
	if (Array.isArray(payload?.data)) return payload.data;
	if (Array.isArray(payload?.roles)) return payload.roles;
	if (Array.isArray(payload?.documents)) return payload.documents;
	if (Array.isArray(payload?.docs)) return payload.docs;
	return [];
};

const fetchIdpRoles = async (token: string): Promise<UnifiedAuthRole[]> => {
	const upstream = await fetchWithTimeout(
		`${config.authBaseUrl}/api/role?document=true&pagination=false&limit=200`,
		{
			method: "GET",
			headers: {
				Accept: "application/json",
				Authorization: `Bearer ${token}`,
				Cookie: `token=${token}`,
			},
		},
		REQUEST_TIMEOUT_MS,
	);

	if (!upstream.ok) {
		const bodyText = await upstream.text();
		throw new Error(
			`Failed to retrieve roles from IDP: ${upstream.status} ${bodyText || upstream.statusText}`,
		);
	}

	const upstreamBody = await upstream.json();
	const normalizedRoles = extractRoleDocuments(upstreamBody)
		.map((roleDoc) => normalizeRoleDocument(roleDoc, "idp"))
		.filter((role): role is UnifiedAuthRole => Boolean(role));

	return normalizedRoles;
};

const loadLocalUserProfile = async (prisma: PrismaClient, req: AuthRequest): Promise<AnyRecord> => {
	const userId = req.userId;
	if (!userId) {
		throw Object.assign(new Error("Missing user id from token"), { statusCode: 401 });
	}
	const localUser = await prisma.user.findUnique({
		where: { id: userId },
		select: {
			id: true,
			email: true,
			userName: true,
			status: true,
			lastLogin: true,
			loginMethod: true,
			createdAt: true,
			updatedAt: true,
			organizationId: true,
			role: true,
			metadata: true,
		},
	});
	if (!localUser) {
		throw Object.assign(new Error("Local user not found for current token"), {
			statusCode: 401,
		});
	}

	const localOrganizationId = localUser.organizationId || undefined;
	const localOrganization = localOrganizationId
		? await prisma.organization.findUnique({
				where: { id: localOrganizationId },
				select: {
					id: true,
					name: true,
					code: true,
					branding: true,
					description: true,
				},
			})
		: null;

	const employee = await prisma.employee.findFirst({
		where: {
			userId,
			isDeleted: false,
			...(localOrganizationId ? { organizationId: localOrganizationId } : {}),
		},
		select: {
			id: true,
			organizationId: true,
			employeeId: true,
			userId: true,
			role: true,
			isManager: true,
			isHrManager: true,
			employmentStatus: true,
			employmentType: true,
			employmentHireDate: true,
			isTour: true,
			workforceSource: true,
			department: { select: { id: true, name: true, code: true, managerId: true } },
			section: { select: { id: true, name: true, code: true, departmentId: true } },
			position: { select: { id: true, title: true, code: true } },
			level: { select: { id: true, name: true, rank: true } },
			_count: { select: { directReports: true } },
			agency: { select: { id: true, name: true, code: true } },
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
					contactInfo: true,
				},
			},
		},
	});

	const organization = localOrganization
		? {
				id: localOrganization.id,
				name: localOrganization?.name,
				code: localOrganization?.code,
				branding: localOrganization?.branding,
				provisioning: buildProvisioningAccessSnapshot({
					provisioning: extractProvisioningState(localOrganization?.branding),
				}),
				description: localOrganization?.description,
			}
		: localOrganizationId
			? { id: localOrganizationId }
			: undefined;

	const employeeMetadata =
		employee && employee.person
			? (() => {
					const employeeRole = String(employee.role || "")
						.trim()
						.toLowerCase();
					const hasDirectReports = (employee as any)._count?.directReports > 0;
					const effectiveIsManager =
						Boolean(employee.isManager) ||
						employeeRole === "hris-employee-manager" ||
						hasDirectReports ||
						(!!employee.department?.managerId &&
							employee.department.managerId === employee.id);

					return {
						id: employee.id,
						organizationId: employee.organizationId,
						employeeId: employee.employeeId,
						role: employee.role || undefined,
						employmentStatus: employee.employmentStatus || undefined,
						employmentType: employee.employmentType || undefined,
						employmentHireDate: employee.employmentHireDate || undefined,
						isTour: typeof employee.isTour === "boolean" ? employee.isTour : undefined,
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
							!!employee.department?.managerId &&
							employee.department.managerId === employee.id,
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
				})()
			: undefined;

	const mergedMetadata = {
		...((localUser?.metadata as Record<string, any> | null) || {}),
		...(employeeMetadata ? { employee: employeeMetadata } : {}),
	};

	// Auto-heal local user metadata when employee linkage has drifted or is missing.
	const storedEmployeeId = String((localUser?.metadata as any)?.employee?.id || "").trim();
	const canonicalEmployeeId = String(employeeMetadata?.id || "").trim();
	if (canonicalEmployeeId && storedEmployeeId !== canonicalEmployeeId) {
		try {
			await prisma.user.update({
				where: { id: localUser.id },
				data: {
					metadata: mergedMetadata,
				},
			});
		} catch (metadataRepairError) {
			// Best effort only: do not block profile retrieval when repair fails.
			console.warn("Best-effort metadata auto-heal failed:", metadataRepairError);
		}
	}

	return {
		id: localUser.id || userId,
		email: localUser?.email || jsonStringField(employee?.person?.contactInfo, "email") || undefined,
		userName: localUser?.userName || undefined,
		status: localUser?.status || "active",
		lastLogin: localUser?.lastLogin || undefined,
		loginMethod: localUser?.loginMethod || undefined,
		createdAt: localUser?.createdAt || undefined,
		updatedAt: localUser?.updatedAt || undefined,
		organizationId: localOrganizationId || undefined,
		organization,
		role: localUser?.role || req.role || undefined,
		roleId: req.roleId || undefined,
		metadata: Object.keys(mergedMetadata).length > 0 ? mergedMetadata : undefined,
	};
};

const buildLoginTokenPayload = (params: { profile: AnyRecord }): Record<string, any> => {
	const employeeId = params.profile?.metadata?.employee?.id;
	return {
		userId: params.profile.id,
		role: params.profile.role || "hris-employee",
		roleId: params.profile.roleId || "",
		organizationId: params.profile.organizationId || "",
		metadata: employeeId ? { employee: { id: employeeId } } : undefined,
	};
};

type LocalLoginUser = {
	id: string;
	email: string;
	password: string | null;
	status: string | null;
};

const normalizeLoginIdentifier = (value: unknown): string =>
	String(value || "")
		.trim()
		.toLowerCase();

const isEmailIdentifier = (value: string): boolean => value.includes("@");

const selectLocalLoginUser = {
	id: true,
	email: true,
	password: true,
	status: true,
};

const extractContactEmail = (contactInfo: unknown): string => {
	const record = asRecord(contactInfo);
	return String(record.email || "")
		.trim()
		.toLowerCase();
};

export const resolveLocalLoginUserByIdentifier = async (
	prismaClient: Pick<PrismaClient, "user" | "employee" | "person">,
	identifier: string,
): Promise<LocalLoginUser | null> => {
	const normalizedIdentifier = normalizeLoginIdentifier(identifier);
	if (!normalizedIdentifier) return null;

	if (isEmailIdentifier(normalizedIdentifier)) {
		const user = await prismaClient.user.findFirst({
			where: { email: normalizedIdentifier, isDeleted: false },
			select: selectLocalLoginUser,
		});
		if (user) return user as LocalLoginUser;

		const candidatePersons = await prismaClient.person.findMany({
			where: { isDeleted: false },
			select: { id: true, userId: true, contactInfo: true },
		});
		const matchedPersonIds = candidatePersons
			.filter((person: any) => extractContactEmail(person.contactInfo) === normalizedIdentifier)
			.map((person: any) => person.id)
			.filter(Boolean);

		if (matchedPersonIds.length === 0) return null;

		const employee = await prismaClient.employee.findFirst({
			where: {
				personId: { in: matchedPersonIds },
				isDeleted: false,
				userId: { not: null },
			},
			select: { userId: true },
		});
		const linkedUserId = String(employee?.userId || "").trim();
		if (!linkedUserId) return null;

		return (await prismaClient.user.findFirst({
			where: { id: linkedUserId, isDeleted: false },
			select: selectLocalLoginUser,
		})) as LocalLoginUser | null;
	}

	const employee = await prismaClient.employee.findFirst({
		where: {
			employeeId: identifier.trim(),
			isDeleted: false,
			userId: { not: null },
		},
		select: { userId: true },
	});
	const linkedUserId = String(employee?.userId || "").trim();
	if (!linkedUserId) return null;

	return (await prismaClient.user.findFirst({
		where: { id: linkedUserId, isDeleted: false },
		select: selectLocalLoginUser,
	})) as LocalLoginUser | null;
};

const buildAuditRequestFromToken = (req: AuthRequest): AuthRequest => {
	const token = extractTokenFromRequest(req);
	const jwtSecret = String(process.env.JWT_SECRET || "").trim();
	if (!token || !jwtSecret) {
		return req;
	}

	try {
		const decoded = jwt.verify(token, jwtSecret) as Record<string, any>;
		return {
			...req,
			userId: req.userId || decoded.userId,
			role: req.role || decoded.role,
			roleId: req.roleId || decoded.roleId,
			organizationId: req.organizationId || decoded.organizationId,
			firstName: req.firstName || decoded.firstName,
			lastName: req.lastName || decoded.lastName,
			metadata: req.metadata || decoded.metadata,
		} as AuthRequest;
	} catch {
		return req;
	}
};

const resolveAuditActorContext = async (params: {
	prisma: PrismaClient;
	req: AuthRequest;
	email?: string;
	userId?: string;
	profile?: AnyRecord;
}) => {
	const normalizedEmail = String(params.email || "")
		.trim()
		.toLowerCase();
	let resolvedUserId = String(params.userId || params.req.userId || "").trim();

	if (!resolvedUserId && normalizedEmail) {
		const localUser = await params.prisma.user.findFirst({
			where: {
				email: normalizedEmail,
				isDeleted: false,
			},
			select: {
				id: true,
			},
		});
		resolvedUserId = String(localUser?.id || "").trim();
	}

	if (resolvedUserId) {
		const localReq = { ...params.req, userId: resolvedUserId } as AuthRequest;
		try {
			const profile = normalizeProfile(await loadLocalUserProfile(params.prisma, localReq));
			return {
				auditReq: localReq,
				userId: resolvedUserId,
				profile,
			};
		} catch {
			return {
				auditReq: localReq,
				userId: resolvedUserId,
				profile: params.profile,
			};
		}
	}

	return {
		auditReq: params.req,
		userId:
			String(params.profile?.id || "").trim() ||
			String(params.req.userId || "").trim() ||
			"unknown",
		profile: params.profile,
	};
};

const logAuthEvent = async (params: {
	prisma: PrismaClient;
	req: AuthRequest;
	action: "LOGIN" | "LOGOUT";
	description: string;
	email?: string;
	userId?: string;
	profile?: AnyRecord;
}) => {
	try {
		const actor = await resolveAuditActorContext(params);
		const timestampKey = params.action === "LOGIN" ? "lastLoginAt" : "loggedOutAt";
		const resolvedProfile = actor.profile;
		const resolvedEmail =
			String(resolvedProfile?.email || params.email || "")
				.trim()
				.toLowerCase() || undefined;

		await logAudit(actor.auditReq, {
			userId: actor.userId,
			action: appConstants.AUDIT_LOG.ACTIONS[params.action],
			resource: appConstants.AUDIT_LOG.RESOURCES.AUTH,
			severity: appConstants.AUDIT_LOG.SEVERITY.LOW,
			entityType: appConstants.AUDIT_LOG.ENTITY_TYPES.USER,
			entityId:
				String(actor.userId || resolvedProfile?.id || params.userId || "").trim() ||
				"unknown",
			changesBefore: null,
			changesAfter: {
				id: resolvedProfile?.id || params.userId || undefined,
				email: resolvedEmail,
				role: resolvedProfile?.role || actor.auditReq.role || undefined,
				roleId: resolvedProfile?.roleId || actor.auditReq.roleId || undefined,
				organizationId:
					resolvedProfile?.organizationId || actor.auditReq.organizationId || undefined,
				loginMethod: resolvedProfile?.loginMethod || "email",
				[timestampKey]: new Date().toISOString(),
			},
			description: params.description,
			organizationId:
				resolvedProfile?.organizationId || actor.auditReq.organizationId || undefined,
		});
	} catch {
		// Auth requests should continue even when audit persistence is unavailable.
	}
};

export const controller = (prisma: PrismaClient) => {
	const login = async (req: AuthRequest, res: Response, _next: NextFunction) => {
		try {
			const rawIdentifier =
				(req.body as AnyRecord)?.identifier ?? (req.body as AnyRecord)?.email;
			const identifier = String(rawIdentifier || "").trim();
			const auditEmail = isEmailIdentifier(identifier)
				? normalizeLoginIdentifier(identifier)
				: undefined;
			const password = String((req.body as AnyRecord)?.password || "");

			if (!identifier || !password) {
				res.status(400).json(
					buildErrorResponse("Employee ID or email and password are required", 400),
				);
				return;
			}

			if (config.idpEnabled) {
				const upstream = await fetchWithTimeout(
					`${config.authBaseUrl}/api/auth/login`,
					{
						method: "POST",
						headers: {
							"Content-Type": "application/json",
							Accept: "application/json",
						},
						body: JSON.stringify(req.body || {}),
					},
					REQUEST_TIMEOUT_MS,
				);
				const text = await upstream.text();
				let parsed: AnyRecord | null = null;
				try {
					parsed = text ? JSON.parse(text) : {};
				} catch {
					parsed = { message: text };
				}

				if (upstream.ok) {
					const upstreamProfile = normalizeProfile(parsed || {});
					await logAuthEvent({
						prisma,
						req,
						action: "LOGIN",
						description: "User login succeeded via IDP",
						email: auditEmail || upstreamProfile.email,
						userId:
							typeof upstreamProfile.id === "string" ? upstreamProfile.id : undefined,
						profile: upstreamProfile,
					});
				}

				res.status(upstream.status || 500).json(parsed);
				return;
			}

			const localUser = await resolveLocalLoginUserByIdentifier(prisma, identifier);

			if (!localUser?.password) {
				res.status(401).json(buildErrorResponse("Invalid credentials", 401));
				return;
			}

			const isValidPassword = await bcrypt.compare(password, localUser.password);
			if (!isValidPassword) {
				res.status(401).json(buildErrorResponse("Invalid credentials", 401));
				return;
			}

			if (String(localUser.status || "").toLowerCase() !== "active") {
				res.status(403).json(buildErrorResponse("Account is not active", 403));
				return;
			}

			await prisma.user.update({
				where: { id: localUser.id },
				data: { lastLogin: new Date() },
			});

			const localReq = { ...req, userId: localUser.id } as AuthRequest;
			const profile = normalizeProfile(await loadLocalUserProfile(prisma, localReq));

			await logAuthEvent({
				prisma,
				req: localReq,
				action: "LOGIN",
				description: "Local user login succeeded",
				email: localUser.email,
				userId: localUser.id,
				profile,
			});

			const jwtSecret = String(process.env.JWT_SECRET || "").trim();
			if (!jwtSecret) {
				res.status(500).json(buildErrorResponse("JWT_SECRET is not configured", 500));
				return;
			}

			const token = jwt.sign(buildLoginTokenPayload({ profile }), jwtSecret, {
				expiresIn: "24h",
			});

			res.cookie("token", token, buildAuthCookieOptions(req));

			res.status(200).json(
				buildSuccessResponse(DEFAULT_LOGIN_MESSAGE, { ...profile, token }, 200),
			);
		} catch (error: any) {
			res.status(500).json(buildErrorResponse(error?.message || "Failed to login", 500));
		}
	};

	const logout = async (_req: AuthRequest, res: Response, _next: NextFunction) => {
		try {
			const auditReq = buildAuditRequestFromToken(_req);
			const tokenProfile =
				auditReq.userId || auditReq.organizationId || auditReq.role
					? {
							id: auditReq.userId,
							role: auditReq.role,
							roleId: auditReq.roleId,
							organizationId: auditReq.organizationId,
						}
					: undefined;

			if (auditReq.userId || tokenProfile?.id) {
				await logAuthEvent({
					prisma,
					req: auditReq,
					action: "LOGOUT",
					description: "User logout succeeded",
					userId: auditReq.userId || tokenProfile?.id || undefined,
					profile: tokenProfile,
				});
			}

			res.clearCookie("token", buildAuthCookieOptions(_req));
			res.status(200).json(buildSuccessResponse(DEFAULT_LOGOUT_MESSAGE, {}, 200));
		} catch (error: any) {
			res.status(500).json(buildErrorResponse(error?.message || "Failed to logout", 500));
		}
	};

	const changePassword = async (req: AuthRequest, res: Response, _next: NextFunction) => {
		try {
			const token = extractTokenFromRequest(req);
			if (!token) {
				res.status(401).json(buildErrorResponse("Unauthorized - No token provided", 401));
				return;
			}

			if (config.idpEnabled) {
				const upstream = await fetchWithTimeout(
					`${config.authBaseUrl}/api/auth/change-password`,
					{
						method: "PATCH",
						headers: {
							"Content-Type": "application/json",
							Accept: "application/json",
							Authorization: `Bearer ${token}`,
							Cookie: `token=${token}`,
						},
						body: JSON.stringify(req.body || {}),
					},
					REQUEST_TIMEOUT_MS,
				);
				const text = await upstream.text();
				let parsed: AnyRecord | null = null;
				try {
					parsed = text ? JSON.parse(text) : {};
				} catch {
					parsed = { message: text };
				}
				res.status(upstream.status || 500).json(parsed);
				return;
			}

			const userId = req.userId;
			if (!userId) {
				res.status(401).json(buildErrorResponse("Unauthorized", 401));
				return;
			}

			const currentPassword = String((req.body as AnyRecord)?.currentPassword || "");
			const newPassword = String(
				(req.body as AnyRecord)?.newPassword || (req.body as AnyRecord)?.password || "",
			);
			if (!newPassword || newPassword.length < 6) {
				res.status(400).json(
					buildErrorResponse("New password must be at least 6 characters", 400),
				);
				return;
			}

			const localUser = await prisma.user.findUnique({
				where: { id: userId },
				select: {
					id: true,
					password: true,
					metadata: true,
				},
			});
			if (!localUser) {
				res.status(404).json(buildErrorResponse("User not found", 404));
				return;
			}

			if (currentPassword) {
				if (!localUser.password) {
					res.status(400).json(buildErrorResponse("Current password is not set", 400));
					return;
				}
				const isCurrentValid = await bcrypt.compare(currentPassword, localUser.password);
				if (!isCurrentValid) {
					res.status(401).json(buildErrorResponse("Current password is invalid", 401));
					return;
				}
			}

			const hashed = await bcrypt.hash(newPassword, 10);
			const existingMetadata = (localUser.metadata as Record<string, any> | null) || {};
			await prisma.user.update({
				where: { id: userId },
				data: {
					password: hashed,
					metadata: {
						...existingMetadata,
						requirePasswordChange: false,
						isFirstLogin: false,
					},
				},
			});

			res.status(200).json(buildSuccessResponse(DEFAULT_PASSWORD_CHANGE_MESSAGE, {}, 200));
		} catch (error: any) {
			res.status(500).json(
				buildErrorResponse(error?.message || "Failed to update password", 500),
			);
		}
	};

	const resetUserPassword = async (req: AuthRequest, res: Response, _next: NextFunction) => {
		try {
			const id = String(req.params.id || "").trim();
			if (!id) {
				res.status(400).json(buildErrorResponse("User id is required", 400));
				return;
			}

			if (config.idpEnabled) {
				const upstream = await forwardIdpRequest({
					req,
					path: `/api/user/${id}/reset-password`,
					method: "PATCH",
				});
				res.status(upstream.status).json(upstream.body);
				return;
			}

			const existingUser = await prisma.user.findFirst({
				where: { id, isDeleted: false },
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

			if (!existingUser) {
				res.status(404).json(buildErrorResponse("User not found", 404));
				return;
			}

			const employee = await resolveResetPasswordEmployee({
				prisma,
				userId: existingUser.id,
				organizationId: existingUser.organizationId,
				metadata: existingUser.metadata,
			});

			if (!employee.employeeId || !employee.lastName) {
				res.status(400).json(
					buildErrorResponse(
						"User is missing employee data required to reset the password",
						400,
					),
				);
				return;
			}

			const temporaryPassword = buildBulkDefaultPassword(
				employee.lastName,
				employee.employeeId,
			);
			const hashedPassword = await bcrypt.hash(temporaryPassword, 10);
			const nextMetadata = mergeUserMetadata(existingUser.metadata, {
				requirePasswordChange: true,
				isFirstLogin: false,
			});

			const updatedUser = await prisma.user.update({
				where: { id: existingUser.id },
				data: {
					password: hashedPassword,
					metadata: nextMetadata,
				},
			});

			await logAudit(req, {
				userId: req.userId || "unknown",
				action: appConstants.AUDIT_LOG.ACTIONS.UPDATE,
				resource: appConstants.AUDIT_LOG.RESOURCES.USERS,
				severity: appConstants.AUDIT_LOG.SEVERITY.HIGH,
				entityType: appConstants.AUDIT_LOG.ENTITY_TYPES.USER,
				entityId: updatedUser.id,
				changesBefore: {
					metadata: existingUser.metadata || null,
				},
				changesAfter: {
					id: updatedUser.id,
					email: updatedUser.email,
					userName: updatedUser.userName,
					role: updatedUser.role,
					status: updatedUser.status,
					organizationId: updatedUser.organizationId,
					metadata: nextMetadata,
					passwordReset: {
						employeeId: employee.employeeId,
						enforcement: "requirePasswordChange",
					},
				},
				description: "Admin reset a user password and forced password change on next login",
				organizationId: updatedUser.organizationId || undefined,
			});

			res.status(200).json(
				buildSuccessResponse(
					DEFAULT_USER_PASSWORD_RESET_MESSAGE,
					mapLocalUser(updatedUser),
					200,
				),
			);
		} catch (error: any) {
			if (error?.statusCode === 404 || String(error?.code || "") === "P2025") {
				res.status(404).json(buildErrorResponse(error?.message || "User not found", 404));
				return;
			}
			res.status(500).json(
				buildErrorResponse(error?.message || "Failed to reset user password", 500),
			);
		}
	};

	const getCurrentUser = async (req: AuthRequest, res: Response, _next: NextFunction) => {
		try {
			const token = extractTokenFromRequest(req);
			if (!token) {
				res.status(401).json(buildErrorResponse("Unauthorized - No token provided", 401));
				return;
			}

			if (config.idpEnabled) {
				const upstream = await fetchWithTimeout(
					`${config.authBaseUrl}/api/auth/me`,
					{
						method: "GET",
						headers: {
							Accept: "application/json",
							Authorization: `Bearer ${token}`,
							Cookie: `token=${token}`,
						},
					},
					REQUEST_TIMEOUT_MS,
				);

				if (!upstream.ok) {
					const text = await upstream.text();
					const statusCode = upstream.status || 502;
					res.status(statusCode).json(
						buildErrorResponse(
							`Failed to retrieve user profile from IDP: ${text || upstream.statusText}`,
							statusCode,
						),
					);
					return;
				}

				const upstreamBody = await upstream.json();
				const normalized = normalizeProfile(upstreamBody);
				const localProfile = await loadLocalUserProfile(prisma, req).catch(() => null);
				const mergedProfile = mergeProfileWithLocalEmployeeContext(
					normalized,
					localProfile,
				);
				res.status(200).json(buildSuccessResponse(DEFAULT_ME_MESSAGE, mergedProfile, 200));
				return;
			}

			const localProfile = await loadLocalUserProfile(prisma, req);
			const normalized = normalizeProfile(localProfile);
			res.status(200).json(buildSuccessResponse(DEFAULT_ME_MESSAGE, normalized, 200));
		} catch (error: any) {
			const statusCode =
				typeof error?.statusCode === "number" && error.statusCode >= 400
					? error.statusCode
					: 500;
			res.status(statusCode).json(
				buildErrorResponse(
					error?.message || "Failed to retrieve current user profile",
					statusCode,
				),
			);
		}
	};

	const updateCurrentUserAvatar = async (
		req: AuthRequest,
		res: Response,
		_next: NextFunction,
	) => {
		try {
			const userId = String(req.userId || "").trim();
			if (!userId) {
				res.status(401).json(buildErrorResponse("Unauthorized", 401));
				return;
			}

			const avatarFile = getUploadedAvatarFile(req);
			if (!avatarFile) {
				res.status(400).json(buildErrorResponse("Avatar image is required", 400));
				return;
			}

			const existingUser = await prisma.user.findFirst({
				where: { id: userId, isDeleted: false },
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

			if (!existingUser) {
				res.status(404).json(buildErrorResponse("User not found", 404));
				return;
			}

			const uploadResult = await uploadUserAvatarFile({
				file: avatarFile,
				userId,
			});

			if (!uploadResult.success || !uploadResult.secureUrl) {
				res.status(500).json(
					buildErrorResponse(uploadResult.error || "Failed to upload avatar", 500),
				);
				return;
			}

			const nextMetadata = mergeUserMetadata(existingUser.metadata, {
				avatar: uploadResult.secureUrl,
			});

			const updatedUser = await prisma.user.update({
				where: { id: userId },
				data: {
					metadata: nextMetadata,
				},
			});

			await logAudit(req, {
				userId,
				action: appConstants.AUDIT_LOG.ACTIONS.UPDATE,
				resource: appConstants.AUDIT_LOG.RESOURCES.USERS,
				severity: appConstants.AUDIT_LOG.SEVERITY.LOW,
				entityType: appConstants.AUDIT_LOG.ENTITY_TYPES.USER,
				entityId: updatedUser.id,
				changesBefore: {
					avatar:
						existingUser.metadata && typeof existingUser.metadata === "object"
							? (existingUser.metadata as AnyRecord).avatar || null
							: null,
				},
				changesAfter: {
					avatar: uploadResult.secureUrl,
					storagePublicId: uploadResult.publicId || null,
				},
				description: "User updated their profile avatar",
				organizationId: updatedUser.organizationId || undefined,
			});

			const localReq = { ...req, userId } as AuthRequest;
			const refreshedProfile = normalizeProfile(await loadLocalUserProfile(prisma, localReq));

			res.status(200).json(
				buildSuccessResponse(DEFAULT_AVATAR_UPDATED_MESSAGE, refreshedProfile, 200),
			);
		} catch (error: any) {
			res.status(500).json(
				buildErrorResponse(error?.message || "Failed to update avatar", 500),
			);
		}
	};

	const getCurrentUserAvatar = async (
		req: AuthRequest,
		res: Response,
		_next: NextFunction,
	) => {
		try {
			const userId = String(req.userId || "").trim();
			if (!userId) {
				res.status(401).json(buildErrorResponse("Unauthorized", 401));
				return;
			}

			const user = await prisma.user.findFirst({
				where: { id: userId, isDeleted: false },
				select: {
					id: true,
					metadata: true,
					updatedAt: true,
				},
			});

			if (!user) {
				res.status(404).json(buildErrorResponse("User not found", 404));
				return;
			}

			const metadata = asRecord(user.metadata);
			const avatar = typeof metadata.avatar === "string" ? metadata.avatar : null;

			res.status(200).json(
				buildSuccessResponse(
					DEFAULT_AVATAR_RETRIEVED_MESSAGE,
					{
						userId: user.id,
						avatar,
						updatedAt: user.updatedAt,
					},
					200,
				),
			);
		} catch (error: any) {
			res.status(500).json(
				buildErrorResponse(error?.message || "Failed to retrieve avatar", 500),
			);
		}
	};

	const getRoles = async (req: AuthRequest, res: Response, _next: NextFunction) => {
		try {
			const token = extractTokenFromRequest(req);
			let roles = [...LOCAL_ROLE_CATALOG];

			if (config.idpEnabled && token) {
				try {
					const idpRoles = await fetchIdpRoles(token);
					if (idpRoles.length > 0) {
						roles = mergeUniqueRoles(idpRoles, LOCAL_ROLE_CATALOG);
					}
				} catch (error) {
					// Keep local fallback when IDP role endpoint is unavailable.
				}
			}

			res.status(200).json(
				buildSuccessResponse(
					DEFAULT_ROLES_MESSAGE,
					{
						roles,
					},
					200,
				),
			);
		} catch (error: any) {
			res.status(500).json(
				buildErrorResponse(error?.message || "Failed to retrieve roles", 500),
			);
		}
	};

	const getUsers = async (req: AuthRequest, res: Response, _next: NextFunction) => {
		try {
			if (config.idpEnabled) {
				const queryString = String(req.originalUrl || "").includes("?")
					? `?${String(req.originalUrl).split("?")[1]}`
					: "";
				const upstream = await forwardIdpRequest({
					req,
					path: `/api/user${queryString}`,
					method: "GET",
				});
				res.status(upstream.status).json(upstream.body);
				return;
			}

			const page = parsePositiveInt(req.query.page, 1);
			const limit = parsePositiveInt(req.query.limit, 10);
			const skip = (page - 1) * limit;
			const query = String(req.query.query || "").trim();
			const filterMap = parseFilterMap(req.query.filter);
			const where: AnyRecord = { isDeleted: false };
			if (filterMap.organizationId) where.organizationId = filterMap.organizationId;
			if (filterMap.status) where.status = filterMap.status.toLowerCase();
			if (query) {
				where.OR = [
					{ email: { contains: query, mode: "insensitive" } },
					{ userName: { contains: query, mode: "insensitive" } },
					{ role: { contains: query, mode: "insensitive" } },
				];
			}

			const [total, users] = await Promise.all([
				prisma.user.count({ where }),
				prisma.user.findMany({
					where,
					orderBy: { createdAt: "desc" },
					skip,
					take: limit,
				}),
			]);

			res.status(200).json(
				buildSuccessResponse(
					DEFAULT_USERS_MESSAGE,
					{
						users: users.map((user) => mapLocalUser(user)),
						count: total,
						pagination: buildPagination(total, page, limit),
					},
					200,
				),
			);
		} catch (error: any) {
			res.status(500).json(
				buildErrorResponse(error?.message || "Failed to retrieve users", 500),
			);
		}
	};

	const getUserById = async (req: AuthRequest, res: Response, _next: NextFunction) => {
		try {
			const id = String(req.params.id || "").trim();
			if (!id) {
				res.status(400).json(buildErrorResponse("User id is required", 400));
				return;
			}

			if (config.idpEnabled) {
				const upstream = await forwardIdpRequest({
					req,
					path: `/api/user/${id}`,
					method: "GET",
				});
				res.status(upstream.status).json(upstream.body);
				return;
			}

			const user = await prisma.user.findFirst({
				where: { id, isDeleted: false },
			});
			if (!user) {
				res.status(404).json(buildErrorResponse("User not found", 404));
				return;
			}

			res.status(200).json(
				buildSuccessResponse(DEFAULT_USER_MESSAGE, mapLocalUser(user), 200),
			);
		} catch (error: any) {
			res.status(500).json(
				buildErrorResponse(error?.message || "Failed to retrieve user", 500),
			);
		}
	};

	const createUser = async (req: AuthRequest, res: Response, _next: NextFunction) => {
		try {
			if (config.idpEnabled) {
				const upstream = await forwardIdpRequest({
					req,
					path: "/api/user",
					method: "POST",
					body: (req.body || {}) as AnyRecord,
				});
				res.status(upstream.status).json(upstream.body);
				return;
			}

			const payload = (req.body || {}) as AnyRecord;
			const email = String(payload.email || "")
				.trim()
				.toLowerCase();
			const role = String(payload.role || payload.roleId || "hris-employee").trim();
			if (!email) {
				res.status(400).json(buildErrorResponse("Email is required", 400));
				return;
			}
			if (!role) {
				res.status(400).json(buildErrorResponse("Role is required", 400));
				return;
			}

			const password = String(payload.password || "").trim();
			const passwordHash = password.length > 0 ? await bcrypt.hash(password, 10) : undefined;
			const created = await prisma.user.create({
				data: {
					email,
					userName: payload.userName ? String(payload.userName).trim() : null,
					password: passwordHash,
					role,
					status: normalizeLocalUserStatus(payload.status),
					loginMethod: String(payload.loginMethod || "email"),
					organizationId: payload.organizationId
						? String(payload.organizationId).trim()
						: req.organizationId || null,
					metadata:
						payload.metadata && typeof payload.metadata === "object"
							? payload.metadata
							: {
									requirePasswordChange: false,
									isFirstLogin: false,
								},
				},
			});

			await logAudit(req, {
				userId: req.userId || "unknown",
				action: appConstants.AUDIT_LOG.ACTIONS.CREATE,
				resource: appConstants.AUDIT_LOG.RESOURCES.USERS,
				severity: appConstants.AUDIT_LOG.SEVERITY.MEDIUM,
				entityType: appConstants.AUDIT_LOG.ENTITY_TYPES.USER,
				entityId: created.id,
				changesBefore: null,
				changesAfter: {
					id: created.id,
					email: created.email,
					userName: created.userName,
					role: created.role,
					status: created.status,
					loginMethod: created.loginMethod,
					organizationId: created.organizationId,
					createdAt: created.createdAt,
				},
				description: "Local user account created",
				organizationId: created.organizationId || undefined,
			});

			res.status(201).json(
				buildSuccessResponse(DEFAULT_USER_CREATED_MESSAGE, mapLocalUser(created), 201),
			);
		} catch (error: any) {
			const message = String(error?.message || "");
			if (message.toLowerCase().includes("unique")) {
				res.status(409).json(buildErrorResponse("Email or username already exists", 409));
				return;
			}
			res.status(500).json(
				buildErrorResponse(error?.message || "Failed to create user", 500),
			);
		}
	};

	const updateUser = async (req: AuthRequest, res: Response, _next: NextFunction) => {
		try {
			const id = String(req.params.id || "").trim();
			if (!id) {
				res.status(400).json(buildErrorResponse("User id is required", 400));
				return;
			}

			if (config.idpEnabled) {
				const upstream = await forwardIdpRequest({
					req,
					path: `/api/user/${id}`,
					method: "PATCH",
					body: (req.body || {}) as AnyRecord,
				});
				res.status(upstream.status).json(upstream.body);
				return;
			}

			const payload = (req.body || {}) as AnyRecord;
			const updateData: AnyRecord = {};
			if (typeof payload.email === "string" && payload.email.trim().length > 0) {
				updateData.email = payload.email.trim().toLowerCase();
			}
			if (typeof payload.userName === "string") {
				updateData.userName = payload.userName.trim() || null;
			}
			if (typeof payload.status === "string") {
				updateData.status = normalizeLocalUserStatus(payload.status);
			}
			if (typeof payload.role === "string" || typeof payload.roleId === "string") {
				const role = String(payload.role || payload.roleId || "").trim();
				if (role) updateData.role = role;
			}
			if (payload.metadata && typeof payload.metadata === "object") {
				updateData.metadata = payload.metadata;
			}
			if (typeof payload.organizationId === "string") {
				updateData.organizationId = payload.organizationId.trim() || null;
			}
			if (typeof payload.password === "string" && payload.password.trim().length > 0) {
				updateData.password = await bcrypt.hash(payload.password.trim(), 10);
			}

			const updated = await prisma.user.update({
				where: { id },
				data: updateData,
			});

			res.status(200).json(
				buildSuccessResponse(DEFAULT_USER_UPDATED_MESSAGE, mapLocalUser(updated), 200),
			);
		} catch (error: any) {
			if (String(error?.code || "") === "P2025") {
				res.status(404).json(buildErrorResponse("User not found", 404));
				return;
			}
			res.status(500).json(
				buildErrorResponse(error?.message || "Failed to update user", 500),
			);
		}
	};

	const deleteUser = async (req: AuthRequest, res: Response, _next: NextFunction) => {
		try {
			const id = String(req.params.id || "").trim();
			if (!id) {
				res.status(400).json(buildErrorResponse("User id is required", 400));
				return;
			}

			if (config.idpEnabled) {
				const upstream = await forwardIdpRequest({
					req,
					path: `/api/user/${id}`,
					method: "DELETE",
				});
				res.status(upstream.status).json(upstream.body);
				return;
			}

			const updated = await prisma.user.update({
				where: { id },
				data: {
					isDeleted: true,
					status: "archived",
				},
			});

			res.status(200).json(
				buildSuccessResponse(DEFAULT_USER_DELETED_MESSAGE, mapLocalUser(updated), 200),
			);
		} catch (error: any) {
			if (String(error?.code || "") === "P2025") {
				res.status(404).json(buildErrorResponse("User not found", 404));
				return;
			}
			res.status(500).json(
				buildErrorResponse(error?.message || "Failed to delete user", 500),
			);
		}
	};

	return {
		login,
		logout,
		changePassword,
		resetUserPassword,
		getCurrentUser,
		getCurrentUserAvatar,
		updateCurrentUserAvatar,
		getRoles,
		getUsers,
		getUserById,
		createUser,
		updateUser,
		deleteUser,
	};
};
