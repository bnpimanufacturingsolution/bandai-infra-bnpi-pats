import { PrismaClient } from "../../generated/prisma";
import {
	buildSeedAuthHeaders,
	buildSeedAuthUrl,
	type SeedAuthRoleKey,
} from "../../helper/seed-auth.helper";

type BcryptJs = {
	hash(password: string, saltOrRounds: number): Promise<string>;
};

const resolveBcrypt = (): BcryptJs => {
	// eslint-disable-next-line @typescript-eslint/no-var-requires
	const bcrypt = require("bcryptjs");
	return bcrypt as BcryptJs;
};

export type SeedAuthMode = "idp" | "local";

export type SeedAuthOrganization = {
	id: string;
	name?: string;
	code?: string;
};

export type SeedUserLinkSource = "created" | "existing" | "fallback";

export type CreateOrGetSeedUserParams = {
	email: string;
	userName: string;
	password: string;
	role: SeedAuthRoleKey;
	roleId?: string;
	organizationId: string;
	personId: string;
	authToken?: string;
	existingEmployeeUserId?: string | null;
};

export type CreateOrGetSeedUserResult = {
	userId: string;
	isNew: boolean;
	source: SeedUserLinkSource;
};

export type PatchSeedUserMetadataParams = {
	userId: string;
	metadata: Record<string, any>;
	authToken?: string;
};

export interface SeedAuthModeAdapter {
	mode: SeedAuthMode;
	createOrGetUser(params: CreateOrGetSeedUserParams): Promise<CreateOrGetSeedUserResult>;
	patchUserMetadata(params: PatchSeedUserMetadataParams): Promise<void>;
}

const normalizeRole = (role?: string, roleId?: string): string =>
	String(role || roleId || "hris-employee").trim();

const getErrorMessage = (error: unknown): string => {
	if (error instanceof Error) return error.message;
	return String(error);
};

const isUsableUserId = (value?: string | null): value is string =>
	Boolean(value && value.trim() && value !== "unknown");

function createIdpAdapter(): SeedAuthModeAdapter {
	const createUserViaAuthService = async (
		params: CreateOrGetSeedUserParams,
	): Promise<CreateOrGetSeedUserResult> => {
		if (!params.authToken) {
			throw new Error("Missing auth token for IDP mode user provisioning");
		}

		const url = buildSeedAuthUrl("/api/auth/register");
		const payload = {
			email: params.email,
			userName: params.userName,
			password: params.password,
			avatar: `https://api.multiavatar.com/${encodeURIComponent(params.userName)}.png`,
			status: "active",
			loginMethod: "email",
			roleId: params.roleId,
			organizationId: params.organizationId,
			personId: params.personId,
			requirePasswordChange: false,
		} as const;

		const createResponse = await fetch(url, {
			method: "POST",
			headers: buildSeedAuthHeaders(params.authToken),
			body: JSON.stringify(payload),
		});

		if (!createResponse.ok) {
			const text = await createResponse.text();
			const message = `Auth service user create failed: ${createResponse.status} ${text}`;
			const normalized = message.toLowerCase();
			if (
				normalized.includes("already") ||
				normalized.includes("exists") ||
				normalized.includes("409")
			) {
				const loginResponse = await fetch(buildSeedAuthUrl("/api/auth/login"), {
					method: "POST",
					headers: buildSeedAuthHeaders(params.authToken),
					body: JSON.stringify({ email: params.email, password: params.password }),
				});
				if (!loginResponse.ok) {
					const loginText = await loginResponse.text();
					throw new Error(
						`Auth login failed after register conflict: ${loginResponse.status} ${loginText}`,
					);
				}
				const loginBody = await loginResponse.json();
				const existingId = loginBody?.data?.id || loginBody?.user?.id || loginBody?.id;
				if (!existingId) {
					throw new Error(
						`Auth login response missing user id for ${params.email}: ${JSON.stringify(loginBody)}`,
					);
				}
				return { userId: String(existingId), isNew: false, source: "existing" };
			}

			throw new Error(message);
		}

		const createBody = await createResponse.json();
		const createdId = createBody?.data?.id || createBody?.user?.id || createBody?.id;
		if (!createdId) {
			throw new Error(
				`Auth service response missing user id for ${params.email}: ${JSON.stringify(createBody)}`,
			);
		}
		return { userId: String(createdId), isNew: true, source: "created" };
	};

	const patchUserMetadata = async (params: PatchSeedUserMetadataParams): Promise<void> => {
		if (!params.authToken) {
			throw new Error("Missing auth token for IDP metadata patch");
		}
		const response = await fetch(buildSeedAuthUrl(`/api/user/${params.userId}`), {
			method: "PATCH",
			headers: buildSeedAuthHeaders(params.authToken),
			body: JSON.stringify({ metadata: params.metadata }),
		});
		if (!response.ok) {
			const text = await response.text();
			throw new Error(
				`Failed to patch IDP user metadata (${params.userId}): ${response.status} ${text}`,
			);
		}
	};

	return {
		mode: "idp",
		createOrGetUser: async (params) => {
			try {
				return await createUserViaAuthService(params);
			} catch (error) {
				if (isUsableUserId(params.existingEmployeeUserId)) {
					return {
						userId: params.existingEmployeeUserId,
						isNew: false,
						source: "fallback",
					};
				}
				throw error;
			}
		},
		patchUserMetadata,
	};
}

function createLocalAdapter(prisma: PrismaClient): SeedAuthModeAdapter {
	const createOrGetUser = async (
		params: CreateOrGetSeedUserParams,
	): Promise<CreateOrGetSeedUserResult> => {
		const bcrypt = resolveBcrypt();
		const hashedPassword = await bcrypt.hash(params.password, 10);
		const role = normalizeRole(params.role, params.roleId);

		const existing = await prisma.user.findFirst({
			where: {
				OR: [
					{ email: params.email },
					...(params.userName ? [{ userName: params.userName }] : []),
				],
			},
			select: { id: true },
		});

		if (existing) {
			await prisma.user.update({
				where: { id: existing.id },
				data: {
					email: params.email,
					userName: params.userName,
					password: hashedPassword,
					role,
					status: "active",
					isDeleted: false,
					loginMethod: "email",
					organizationId: params.organizationId,
				},
			});
			return { userId: existing.id, isNew: false, source: "existing" };
		}

		const created = await prisma.user.create({
			data: {
				email: params.email,
				userName: params.userName,
				password: hashedPassword,
				role,
				status: "active",
				isDeleted: false,
				loginMethod: "email",
				organizationId: params.organizationId,
			},
			select: { id: true },
		});

		return { userId: created.id, isNew: true, source: "created" };
	};

	const patchUserMetadata = async (params: PatchSeedUserMetadataParams): Promise<void> => {
		const current = await prisma.user.findUnique({
			where: { id: params.userId },
			select: { metadata: true },
		});
		const mergedMetadata = {
			...((current?.metadata as Record<string, any> | null) || {}),
			...(params.metadata || {}),
		};
		await prisma.user.update({
			where: { id: params.userId },
			data: { metadata: mergedMetadata },
		});
	};

	return {
		mode: "local",
		createOrGetUser: async (params) => {
			try {
				return await createOrGetUser(params);
			} catch (error) {
				if (isUsableUserId(params.existingEmployeeUserId)) {
					return {
						userId: params.existingEmployeeUserId,
						isNew: false,
						source: "fallback",
					};
				}
				throw new Error(
					`Cannot create/find local user for ${params.email}: ${getErrorMessage(error)}`,
				);
			}
		},
		patchUserMetadata,
	};
}

export function createSeedAuthModeAdapter(params: {
	prisma: PrismaClient;
	mode: SeedAuthMode;
}): SeedAuthModeAdapter {
	if (params.mode === "idp") {
		return createIdpAdapter();
	}

	return createLocalAdapter(params.prisma);
}
