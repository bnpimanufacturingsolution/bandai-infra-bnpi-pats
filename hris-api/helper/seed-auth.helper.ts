import dotenv from "dotenv";

dotenv.config();

export const HRIS_AUTH_ROLE_KEYS = {
	HR_MANAGER: "hris-hr-manager",
	HR_USER: "hris-hr-user",
	EMPLOYEE_MANAGER: "hris-employee-manager",
	EMPLOYEE: "hris-employee",
	TIMEKEEPER: "hris-timekeeper",
} as const;

export type SeedAuthRoleKey =
	(typeof HRIS_AUTH_ROLE_KEYS)[keyof typeof HRIS_AUTH_ROLE_KEYS];

type SeedAuthSession = {
	userId: string;
	token: string;
};

type SeedAuthRoleDefinition = {
	key: SeedAuthRoleKey;
	name: string;
	description: string;
	scope: "ORGANIZATION" | "APP";
	isDefault: boolean;
};

type SeedAuthConfig = {
	baseUrl: string;
	superadminEmail: string;
	superadminPassword: string;
	roleDefinitions: SeedAuthRoleDefinition[];
};

export type SeedAuthOrganization = {
	id: string;
	name?: string;
	code?: string;
};

const DEFAULT_AUTH_BASE_URL =
	"https://adam-auth-431713067666.asia-southeast1.run.app";
const DEFAULT_SUPERADMIN_EMAIL = "super@admin.com";
const DEFAULT_SUPERADMIN_PASSWORD = "password123";
const SEED_AUTH_ORGANIZATION = {
	name: "Bandai Namco",
	description:
		"Bandai Namco Entertainment Inc. - Japanese multinational video game and toy company",
	code: "bnei",
} as const;

const SEED_AUTH_ROLE_DEFINITIONS: SeedAuthRoleDefinition[] = [
	{
		key: "hris-hr-manager",
		name: "hris-hr-manager",
		description: "HR manager role",
		scope: "ORGANIZATION",
		isDefault: false,
	},
	{
		key: "hris-hr-user",
		name: "hris-hr-user",
		description: "HR user role",
		scope: "ORGANIZATION",
		isDefault: false,
	},
	{
		key: "hris-employee-manager",
		name: "hris-employee-manager",
		description: "Employee manager role",
		scope: "ORGANIZATION",
		isDefault: false,
	},
	{
		key: "hris-employee",
		name: "hris-employee",
		description: "Employee role",
		scope: "ORGANIZATION",
		isDefault: false,
	},
	{
		key: "hris-timekeeper",
		name: "hris-timekeeper",
		description: "Timekeeper role",
		scope: "ORGANIZATION",
		isDefault: false,
	},
] as const;

let cachedConfig: SeedAuthConfig | null = null;
let cachedResolvedRoleIds: Record<SeedAuthRoleKey, string> | null = null;

export const getSeedAuthConfig = (): SeedAuthConfig => {
	if (cachedConfig) return cachedConfig;

	cachedConfig = {
		baseUrl: process.env.AUTH_BASE_URL?.trim() || DEFAULT_AUTH_BASE_URL,
		superadminEmail: process.env.AUTH_SUPERADMIN_EMAIL?.trim() || DEFAULT_SUPERADMIN_EMAIL,
		superadminPassword:
			process.env.AUTH_SUPERADMIN_PASSWORD?.trim() || DEFAULT_SUPERADMIN_PASSWORD,
		roleDefinitions: [...SEED_AUTH_ROLE_DEFINITIONS],
	};

	return cachedConfig;
};

export const buildSeedAuthHeaders = (token?: string): Record<string, string> => {
	const headers: Record<string, string> = {
		"Content-Type": "application/json",
	};

	if (token) headers.Authorization = `Bearer ${token}`;

	return headers;
};

export const buildSeedAuthUrl = (endpoint: string): string => {
	const { baseUrl } = getSeedAuthConfig();
	return `${baseUrl}${endpoint.startsWith("/") ? endpoint : `/${endpoint}`}`;
};

export const loginSeedAuth = async (): Promise<SeedAuthSession> => {
	const config = getSeedAuthConfig();
	console.log(
		`[seed-auth] Logging into auth service at ${config.baseUrl} as ${config.superadminEmail}`,
	);
	const response = await fetch(buildSeedAuthUrl("/api/auth/login"), {
		method: "POST",
		headers: buildSeedAuthHeaders(),
		body: JSON.stringify({
			email: config.superadminEmail,
			password: config.superadminPassword,
		}),
	});

	if (!response.ok) {
		const text = await response.text();
		throw new Error(`Seed auth login failed: ${response.status} ${text}`);
	}

	const result = await response.json();
	const userId = result?.data?.id || result?.user?.id || result?.id;
	const token = result?.data?.token;

	if (!userId || !token) {
		throw new Error(`Seed auth login response missing id/token: ${JSON.stringify(result)}`);
	}

	return {
		userId: String(userId),
		token: String(token),
	};
};

const extractRoleDocuments = (payload: any): any[] => {
	if (Array.isArray(payload?.data?.roles)) return payload.data.roles;
	if (Array.isArray(payload?.data?.docs)) return payload.data.docs;
	if (Array.isArray(payload?.data?.data)) return payload.data.data;
	if (Array.isArray(payload?.data)) return payload.data;
	if (Array.isArray(payload?.docs)) return payload.docs;
	return [];
};

const extractOrganizationDocuments = (payload: any): any[] => {
	if (Array.isArray(payload?.data?.organizations)) return payload.data.organizations;
	if (Array.isArray(payload?.data?.docs)) return payload.data.docs;
	if (Array.isArray(payload?.data?.data)) return payload.data.data;
	if (Array.isArray(payload?.data)) return payload.data;
	if (Array.isArray(payload?.docs)) return payload.docs;
	return [];
};

const listOrganizations = async (authToken: string): Promise<any[]> => {
	console.log("[seed-auth] Fetching organizations from auth service");
	const response = await fetch(
		buildSeedAuthUrl("/api/organization?document=true&pagination=true&page=1&limit=200"),
		{
			method: "GET",
			headers: buildSeedAuthHeaders(authToken),
		},
	);

	console.log(
		`[seed-auth] Organization fetch status: ${response.status} ${response.statusText}`,
	);

	if (!response.ok) {
		const text = await response.text();
		console.log(`[seed-auth] Organization fetch error body: ${text}`);
		throw new Error(`List organizations failed: ${response.status} ${text}`);
	}

	const rawBody = await response.text();
	console.log(`[seed-auth] Organization raw response: ${rawBody.slice(0, 4000)}`);

	let result: any;
	try {
		result = JSON.parse(rawBody);
	} catch (error) {
		console.log(`[seed-auth] Failed to parse organization response JSON: ${error}`);
		throw error;
	}

	console.log(
		`[seed-auth] Organization parsed response keys: ${Object.keys(result || {}).join(", ")}`,
	);
	if (result?.data && typeof result.data === "object") {
		console.log(
			`[seed-auth] Organization parsed data keys: ${Object.keys(result.data).join(", ")}`,
		);
	}

	const organizations = extractOrganizationDocuments(result);
	console.log(`[seed-auth] Retrieved ${organizations.length} organization(s) from auth service`);
	console.log(
		`[seed-auth] Organization candidates: ${JSON.stringify(
			organizations.map((organization) => ({
				id: organization?.id ?? null,
				name: organization?.name ?? null,
				code: organization?.code ?? null,
			})),
		)}`,
	);
	return organizations;
};

export const resolveSeedOrganization = async (
	authToken: string,
): Promise<SeedAuthOrganization> => {
	const organizations = await listOrganizations(authToken);
	console.log(
		`[seed-auth] Resolving organization by exact code "${SEED_AUTH_ORGANIZATION.code}"`,
	);
	const organization = organizations.find(
		(candidate) =>
			String(candidate?.code || "").toLowerCase() === SEED_AUTH_ORGANIZATION.code,
	);

	if (!organization?.id) {
		console.log(
			`[seed-auth] Failed to resolve organization. Expected ${JSON.stringify(SEED_AUTH_ORGANIZATION)}`,
		);
		throw new Error(
			`Unable to resolve auth organization for code "${SEED_AUTH_ORGANIZATION.code}" (${SEED_AUTH_ORGANIZATION.name}).`,
		);
	}

	console.log(
		`[seed-auth] Resolved organization ${organization.name || "Unknown"} (${organization.id}) with code ${organization.code || "n/a"}`,
	);

	return {
		id: String(organization.id),
		name: organization.name ? String(organization.name) : undefined,
		code: organization.code ? String(organization.code) : undefined,
	};
};

const listAuthRoles = async (authToken: string): Promise<any[]> => {
	console.log("[seed-auth] Fetching roles from auth service");
	const response = await fetch(buildSeedAuthUrl("/api/role?document=true&limit=200"), {
		method: "GET",
		headers: buildSeedAuthHeaders(authToken),
	});

	console.log(`[seed-auth] Role fetch status: ${response.status} ${response.statusText}`);

	if (!response.ok) {
		const text = await response.text();
		console.log(`[seed-auth] Role fetch error body: ${text}`);
		throw new Error(`List auth roles failed: ${response.status} ${text}`);
	}

	const rawBody = await response.text();
	console.log(`[seed-auth] Role raw response: ${rawBody.slice(0, 4000)}`);

	let result: any;
	try {
		result = JSON.parse(rawBody);
	} catch (error) {
		console.log(`[seed-auth] Failed to parse role response JSON: ${error}`);
		throw error;
	}

	console.log(
		`[seed-auth] Role parsed response keys: ${Object.keys(result || {}).join(", ")}`,
	);
	if (result?.data && typeof result.data === "object") {
		console.log(`[seed-auth] Role parsed data keys: ${Object.keys(result.data).join(", ")}`);
	}

	const roles = extractRoleDocuments(result);
	console.log(`[seed-auth] Retrieved ${roles.length} role(s) from auth service`);
	console.log(
		`[seed-auth] Role candidates: ${JSON.stringify(
			roles.map((role) => ({
				id: role?.id ?? null,
				name: role?.name ?? null,
				scope: role?.scope ?? null,
			})),
		)}`,
	);
	return roles;
};

const createAuthRole = async (
	definition: SeedAuthRoleDefinition,
	authToken: string,
): Promise<string> => {
	console.log(
		`[seed-auth] Create role payload: ${JSON.stringify({
			name: definition.name,
			description: definition.description,
			scope: definition.scope,
			isDefault: definition.isDefault,
		})}`,
	);
	const response = await fetch(buildSeedAuthUrl("/api/role"), {
		method: "POST",
		headers: buildSeedAuthHeaders(authToken),
		body: JSON.stringify({
			name: definition.name,
			description: definition.description,
			scope: definition.scope,
			isDefault: definition.isDefault,
		}),
	});

	console.log(`[seed-auth] Create role status: ${response.status} ${response.statusText}`);

	if (!response.ok) {
		const text = await response.text();
		console.log(`[seed-auth] Create role error body: ${text}`);
		throw new Error(`Create auth role failed for ${definition.key}: ${response.status} ${text}`);
	}

	const rawBody = await response.text();
	console.log(`[seed-auth] Create role raw response: ${rawBody.slice(0, 4000)}`);

	let result: any;
	try {
		result = JSON.parse(rawBody);
	} catch (error) {
		console.log(`[seed-auth] Failed to parse create role response JSON: ${error}`);
		throw error;
	}

	const roleId = result?.data?.id || result?.role?.id || result?.id;

	if (!roleId) {
		throw new Error(
			`Create auth role response missing id for ${definition.key}: ${JSON.stringify(result)}`,
		);
	}

	return String(roleId);
};

export const ensureSeedRoles = async (
	authToken: string,
): Promise<Record<SeedAuthRoleKey, string>> => {
	if (cachedResolvedRoleIds) return cachedResolvedRoleIds;

	const { roleDefinitions } = getSeedAuthConfig();
	console.log(`[seed-auth] Ensuring ${roleDefinitions.length} auth role(s) exist`);
	const existingRoles = await listAuthRoles(authToken);
	const resolvedRoleIds = {} as Record<SeedAuthRoleKey, string>;

	for (const definition of roleDefinitions) {
		const existingRole = existingRoles.find((role) => role?.name === definition.name);
		if (existingRole?.id) {
			console.log(
				`[seed-auth] Reusing existing role ${definition.name} (${existingRole.id})`,
			);
			resolvedRoleIds[definition.key] = String(existingRole.id);
			continue;
		}

		try {
			console.log(`[seed-auth] Creating missing role ${definition.name}`);
			resolvedRoleIds[definition.key] = await createAuthRole(definition, authToken);
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			if (
				message.toLowerCase().includes("already") ||
				message.includes("409") ||
				message.toLowerCase().includes("exists")
			) {
				const latestRoles = await listAuthRoles(authToken);
				const createdRole = latestRoles.find((role) => role?.name === definition.name);
				if (createdRole?.id) {
					console.log(
						`[seed-auth] Role ${definition.name} appeared after conflict; using ${createdRole.id}`,
					);
					resolvedRoleIds[definition.key] = String(createdRole.id);
					continue;
				}
			}

			throw error;
		}
	}

	cachedResolvedRoleIds = resolvedRoleIds;
	return resolvedRoleIds;
};

export const resolveSeedRoleId = (
	roleIds: Record<SeedAuthRoleKey, string>,
	roleKey: SeedAuthRoleKey,
): string => {
	const roleId = roleIds[roleKey];
	if (!roleId) {
		throw new Error(`Missing resolved auth role ID for readable role key: ${roleKey}`);
	}
	return roleId;
};
