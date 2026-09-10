import { createHmac, randomUUID } from "crypto";
import { config } from "../config/config";
import type { EffectiveTrainingPerformanceAccess } from "./application-access/resolver";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ExternalApp = "lms" | "epmr";

export interface ExternalProfile {
	userId: string;
	employeeId: string;
	firstName: string;
	lastName: string;
	email: string;
	departmentName: string;
	positionTitle: string;
	role: string;
	isManager: boolean;
	isHrManager: boolean;
	avatar: string | null;
	/** LMS external-access token derived from the existing HRIS mapping; injected before encoding. */
	lmsAccess?: string;
	/** Canonical EPMR subroles derived from the existing HRIS mapping; injected before encoding. */
	epmrSubRole?: string[];
}

export interface LmsHandoffRequest {
	token: string; // Base64URL-encoded JSON employee profile
	orgCode: string;
	app: "lms" | "epmr";
	timestamp: string; // LMS expects string, not number
	signature: string; // HMAC-SHA256 of `${timestamp}.${token}.${orgCode}`
}

export interface LmsHandoffResponse {
	token: string;
	organization: { code: string; name: string };
	user?: { id?: string; email?: string };
}

export interface ExternalLaunchResult {
	launchUrl: string;
	app: ExternalApp;
	token?: string; // LMS JWT returned from LMS handoff, used for EPMR bridge
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const EXTERNAL_HANDOFF_TIMEOUT_MS = 10_000;

// ---------------------------------------------------------------------------
// Role mapping (isolated config — single source of truth)
// ---------------------------------------------------------------------------

interface RoleMapping {
	lmsAccess: boolean;
	lmsSubRole: string | null;
	epmrSubRole: string | null;
}

/**
 * Maps an HRIS role string to LMS/EPMR permission claims.
 *
 * This is the ONLY place where HRIS roles are translated to downstream
 * permissions. Changes to downstream permission requirements MUST be
 * reflected here — not silently inferred.
 *
 * Unrecognised roles are denied access (lmsAccess=false) to avoid
 * accidental privilege escalation.
 */
export function mapHrisRoleToExternal(role: string): RoleMapping {
	switch (role) {
		case "hris-admin":
		case "admin":
		case "super_admin":
			return { lmsAccess: true, lmsSubRole: "admin", epmrSubRole: "admin" };
		case "hris-hr-manager":
			return { lmsAccess: true, lmsSubRole: "manager", epmrSubRole: "manager" };
		case "hris-hr-user":
			return { lmsAccess: true, lmsSubRole: "user", epmrSubRole: "user" };
		case "hris-employee-manager":
			return { lmsAccess: true, lmsSubRole: "manager", epmrSubRole: "user" };
		case "hris-employee":
			return { lmsAccess: true, lmsSubRole: "employee", epmrSubRole: "employee" };
		default:
			return { lmsAccess: false, lmsSubRole: null, epmrSubRole: null };
	}
}

// ---------------------------------------------------------------------------
// External access fields (existing mapping → LMS handoff contract tokens)
// ---------------------------------------------------------------------------

/** Canonical EPMR subrole values already understood by the LMS/EPMR bridge. */
const EPMR_CANONICAL_SUBROLE_BY_HINT: Record<string, string> = {
	admin: "epmr_admin",
	manager: "epmr_rater",
	employee: "epmr_ratee",
	// "user" (hris-hr-user / hris-employee-manager) has no defined EPMR
	// mapping in the existing bridge → no EPMR subrole is granted.
	// HRIS has no QA-designated role → epmr_qa is never granted here.
};

/**
 * Translates the existing `mapHrisRoleToExternal()` result into the access
 * fields the LMS external-handoff contract expects, WITHOUT redesigning the
 * mapping itself.
 *
 * - `lmsAccess` becomes a token from the LMS access vocabulary
 *   (ADMIN | USER | EMPLOYEE); the LMS mapper does not understand booleans.
 * - `epmrSubRole` uses only canonical epmr_* values and is omitted when the
 *   existing mapping defines none — never blanket-granted.
 * - No `lmsSubRole` is emitted: the launcher flow does not assign LMS
 *   subroles and the LMS audit confirmed omission is supported.
 * - `profile.role` remains the HRIS role; access is conveyed exclusively
 *   through these fields.
 */
export function buildExternalAccessFields(role: string): {
	lmsAccess?: string;
	epmrSubRole?: string[];
} {
	const mapping = mapHrisRoleToExternal(role);
	if (!mapping.lmsAccess) {
		return {};
	}

	const lmsAccess =
		mapping.lmsSubRole === "admin"
			? "ADMIN"
			: mapping.lmsSubRole === "user"
				? "USER"
				: "EMPLOYEE";

	const epmrSubRole = mapping.epmrSubRole
		? EPMR_CANONICAL_SUBROLE_BY_HINT[mapping.epmrSubRole]
		: undefined;

	return {
		lmsAccess,
		...(epmrSubRole ? { epmrSubRole: [epmrSubRole] } : {}),
	};
}

// ---------------------------------------------------------------------------
// Base64URL encoding
// ---------------------------------------------------------------------------

/** Base64URL encode: standard base64 → URL-safe, strip trailing `=`. */
export function base64UrlEncode(data: string): string {
	return Buffer.from(data, "utf-8")
		.toString("base64")
		.replace(/\+/g, "-")
		.replace(/\//g, "_")
		.replace(/=+$/, "");
}

// ---------------------------------------------------------------------------
// HMAC signing
// ---------------------------------------------------------------------------

/** HMAC-SHA256 signature: `${timestamp}.${base64Profile}.${orgCode}`. */
export function signPayload(timestamp: string, profile: string, orgCode: string): string {
	const secret = config.lmsHandoffSecret || process.env.LMS_EXTERNAL_HANDOFF_SECRET || "";
	if (!secret) {
		throw Object.assign(
			new Error("LMS handoff secret not configured (LMS_EXTERNAL_HANDOFF_SECRET)"),
			{ statusCode: 500 },
		);
	}
	const payload = `${timestamp}.${profile}.${orgCode}`;
	return createHmac("sha256", secret).update(payload).digest("hex");
}

// ---------------------------------------------------------------------------
// Profile building
// ---------------------------------------------------------------------------

/**
 * Converts the authenticated employee identity (already loaded via
 * `loadLocalUserProfile` in the controller) into the shape expected
 * by the LMS external-handoff API.
 *
 * This function does NOT query the database — the controller must
 * supply the already-loaded `employee` object.
 */
export function buildExternalProfile(employee: Record<string, any>): ExternalProfile {
	const firstName =
		employee.person?.personalInfo?.firstName ||
		employee.firstName ||
		"";
	const lastName =
		employee.person?.personalInfo?.lastName ||
		employee.lastName ||
		"";
	const email =
		employee.person?.contactInfo?.email ||
		employee.user?.email ||
		employee.email ||
		"";
	const departmentName =
		employee.department?.name ||
		employee.departmentName ||
		"";
	const positionTitle =
		employee.position?.title ||
		employee.positionTitle ||
		"";
	const avatar =
		employee.user?.metadata?.avatar ||
		employee.metadata?.employee?.avatar ||
		null;

	return {
		userId: employee.userId || employee.id || "",
		employeeId: employee.employeeId || employee.id || "",
		firstName,
		lastName,
		email,
		departmentName,
		positionTitle,
		role: employee.role || "hris-employee",
		isManager: Boolean(employee.isManager),
		isHrManager: Boolean(employee.isHrManager),
		avatar,
	};
}

// ---------------------------------------------------------------------------
// LMS external-handoff API call
// ---------------------------------------------------------------------------

/**
 * POSTs the signed profile to the LMS external-handoff endpoint and
 * returns the LMS's response (JWT token, org, user info).
 *
 * The HMAC secret never leaves the server — it is only used in
 * `signPayload()` above.
 */
export async function callLmsExternalHandoff(
	profile: ExternalProfile,
	orgCode: string,
	effectiveAccess?: EffectiveTrainingPerformanceAccess | null,
): Promise<LmsHandoffResponse> {
	const lmsApiUrl = config.lmsApiUrl;
	if (!lmsApiUrl) {
		throw Object.assign(
			new Error("LMS API URL not configured (LMS_API_URL)"),
			{ statusCode: 500 },
		);
	}

	const timestamp = Math.floor(Date.now() / 1000).toString();

	// Access fields: resolver output when provided (Phase 3 launch path),
	// otherwise the legacy static HRIS role mapping. Caller-supplied values
	// cannot override them, and ineligible employees carry none (undefined
	// keys are dropped by JSON.stringify). Mapping happens BEFORE stringify
	// → Base64URL encode.
	const access = effectiveAccess
		? buildExternalAccessFromEffective(effectiveAccess)
		: buildExternalAccessFields(profile.role);
	// Per-launch nonce inside the signed token: the profile is otherwise
	// deterministic per user, so two launches within the same wall-clock
	// second would produce an identical HMAC and trip the LMS replay guard
	// ("Handoff signature already used"). Unique profile -> unique signature
	// per legitimate launch; intercepted-body replays are still rejected.
	const launchNonce = randomUUID();
	const encodedProfile = base64UrlEncode(
		JSON.stringify({
			...profile,
			lmsAccess: access.lmsAccess,
			epmrSubRole: access.epmrSubRole,
			launchNonce,
		}),
	);
	const signature = signPayload(timestamp, encodedProfile, orgCode);

	const body = {
		token: encodedProfile,
		orgCode,
		app: "lms" as const,
		timestamp,
		signature,
	};

	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), EXTERNAL_HANDOFF_TIMEOUT_MS);

	let response: Response;
	try {
		response = await fetch(`${lmsApiUrl}/api/auth/external-handoff`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Accept: "application/json",
			},
			body: JSON.stringify(body),
			signal: controller.signal,
		});
	} catch (error: any) {
		clearTimeout(timer);
		if (error?.name === "AbortError") {
			throw Object.assign(
				new Error("LMS external-handoff request timed out"),
				{ statusCode: 504 },
			);
		}
		throw Object.assign(
			new Error(`LMS external-handoff request failed: ${error?.message || "Unknown error"}`),
			{ statusCode: 502 },
		);
	} finally {
		clearTimeout(timer);
	}

	if (!response.ok) {
		const errorBody = await response.text().catch(() => "");
		// Diagnostic log: status + orgCode + timestamp only. Never log the
		// profile token or signature — both are credentials.
		console.error(
			`[external-handoff] LMS rejected handoff: status=${response.status} orgCode=${orgCode} ts=${timestamp} body=${errorBody.slice(0, 200)}`,
		);
		throw Object.assign(
			new Error(`LMS external-handoff failed: ${response.status} ${errorBody || response.statusText}`),
			{ statusCode: response.status >= 400 && response.status < 500 ? response.status : 502 },
		);
	}

	const data = (await response.json()) as any;
	// Normalize: LMS may return { data: { token, ... } } or flat { token, ... }
	const payload = data?.data || data;

	if (!payload?.token) {
		throw Object.assign(
			new Error("LMS external-handoff returned no token"),
			{ statusCode: 502 },
		);
	}

	return {
		token: payload.token,
		organization: payload.organization || { code: orgCode, name: orgCode },
		user: payload.user,
	};
}

// ---------------------------------------------------------------------------
// Launch URL builders
// ---------------------------------------------------------------------------

/** Normalizes an app base URL: trim, strip trailing slashes. */
const normalizeAppBaseUrl = (rawUrl: string): string => rawUrl.trim().replace(/\/+$/, "");

/** Appends an app's route prefix only when the base URL does not already include it. */
const withAppPathPrefix = (baseUrl: string, prefix: string): string =>
	baseUrl.endsWith(prefix) ? baseUrl : `${baseUrl}${prefix}`;

/**
 * Builds the LMS bridge URL for session bootstrap.
 *
 * LMS contract (verified from lms-app source):
 * - Route is served under the /lms prefix: `/lms/auth/bridge`.
 * - `app` is REQUIRED (`lms` | `epmr`) — missing app redirects to /login.
 * - `token` is the LMS JWT, Base64URL-encoded (preferred public format;
 *   the bridge decodes it before bootstrapping the session).
 * - `orgCode` is included for org consistency/observability (the JWT
 *   bootstrap path ignores it; only the external-handoff path requires it).
 * - Do NOT set `source=external` here: HRIS already performed the signed
 *   server-side handoff and holds the JWT — the bridge must take the
 *   JWT bootstrap path, not re-run the browser external handoff.
 */
export function buildLmsLaunchUrl(
	lmsJwt: string,
	orgCode: string,
	lmsAppUrlOverride?: string,
): string {
	const lmsBaseUrl = lmsAppUrlOverride || config.lmsAppUrl;
	if (!lmsBaseUrl) {
		throw Object.assign(
			new Error("LMS app URL not configured (LMS_APP_URL)"),
			{ statusCode: 500 },
		);
	}
	if (!lmsJwt) {
		throw Object.assign(new Error("LMS JWT missing for bridge launch"), { statusCode: 502 });
	}
	const params = new URLSearchParams({
		token: base64UrlEncode(lmsJwt),
		app: "lms",
		orgCode,
	});
	return `${withAppPathPrefix(normalizeAppBaseUrl(lmsBaseUrl), "/lms")}/auth/bridge?${params.toString()}`;
}

/**
 * Derives the LMS shell persona from the HRIS role mapping. EPMR's bridge
 * validates the `role` query against the user's LMS role[] from the JWT
 * (capability-union, employee→student segment mapping), so it must be an LMS
 * persona — never an EPMR subrole.
 */
export function resolveLmsPersonaFromHrisRole(role: string): string {
	const mapping = mapHrisRoleToExternal(role);
	if (!mapping.lmsAccess) {
		return "";
	}
	if (mapping.lmsSubRole === "admin") return "admin";
	if (mapping.lmsSubRole === "user") return "user";
	return "employee";
}

/**
 * Builds the EPMR bridge URL: `{EPMR_APP_URL}/performance/auth/bridge`.
 *
 * EPMR contract (verified from epmr-app source):
 * - Localhost router basename is `/performance`, so the bridge route is
 *   `/performance/auth/bridge`.
 * - `token` is the LMS JWT, Base64URL-encoded (preferred; EPMR resolves it
 *   and validates the session against LMS `/current/user`).
 * - `source=lms` enables orgCode + role validation.
 * - `role` must be the user's LMS shell persona (NOT an EPMR subrole).
 * - `returnTo` mirrors LMS's own performanceRedirect format; EPMR falls back
 *   gracefully when the host is untrusted.
 */
export function buildEpmrLaunchUrl(
	lmsJwt: string,
	orgCode: string,
	role: string,
	epmrAppUrlOverride?: string,
	lmsAppUrlOverride?: string,
): string {
	const epmrBaseUrl = epmrAppUrlOverride || config.epmrAppUrl;
	if (!epmrBaseUrl) {
		throw Object.assign(
			new Error("EPMR app URL not configured (EPMR_APP_URL)"),
			{ statusCode: 500 },
		);
	}
	if (!lmsJwt) {
		throw Object.assign(new Error("LMS JWT missing for EPMR bridge launch"), { statusCode: 502 });
	}
	const params = new URLSearchParams({
		token: base64UrlEncode(lmsJwt),
		source: "lms",
		orgCode,
		role,
	});

	// Mirror LMS's buildPerformanceSystemUrl returnTo: LMS dashboard for the persona.
	const lmsBaseUrl = lmsAppUrlOverride || config.lmsAppUrl;
	if (lmsBaseUrl) {
		const returnSegment = role === "employee" ? "student" : role;
		const returnPath = orgCode && returnSegment
			? `/${orgCode}/${returnSegment}/dashboard`
			: "/admin/dashboard";
		params.set(
			"returnTo",
			`${withAppPathPrefix(normalizeAppBaseUrl(lmsBaseUrl), "/lms")}${returnPath}`,
		);
	}

	return `${withAppPathPrefix(normalizeAppBaseUrl(epmrBaseUrl), "/performance")}/auth/bridge?${params.toString()}`;
}

// ---------------------------------------------------------------------------
// Full orchestration
// ---------------------------------------------------------------------------

/**
 * Builds external access fields from resolver output (Phase 3 §21).
 *
 * The frozen architecture replaces the static role mapping on the launch
 * path: effective access comes from resolveTrainingPerformanceAccess().
 * Contract preserved: `lmsAccess` uses the LMS access-token vocabulary,
 * `epmrSubRole` stays an array (LMS normalizeTokenList maps every token).
 */
export function buildExternalAccessFromEffective(
	effective: EffectiveTrainingPerformanceAccess,
): {
	lmsAccess?: string;
	epmrSubRole?: string[];
} {
	if (!effective.eligible || !effective.lmsAccessToken || !effective.lmsPersona) {
		return {};
	}
	return {
		lmsAccess: effective.lmsAccessToken,
		epmrSubRole: [...effective.effectiveEpmrSubroles],
	};
}

/**
 * Orchestrates a full external app launch:
 * 1. Builds and signs the employee profile
 * 2. Calls the LMS external-handoff API
 * 3. Constructs the appropriate launch URL
 */
export async function createExternalLaunch(
	employee: Record<string, any>,
	app: ExternalApp,
	options?: {
		/** Resolver output (Phase 3). Falls back to the legacy static mapping when omitted. */
		effectiveAccess?: EffectiveTrainingPerformanceAccess;
	},
): Promise<ExternalLaunchResult> {
	const effective = options?.effectiveAccess ?? null;

	// Employment eligibility gate (frozen §8): blocked employees are denied
	// before any bridge traffic.
	if (effective && !effective.eligible) {
		throw Object.assign(
			new Error("Employee is not eligible for external application access"),
			{ statusCode: 403 },
		);
	}

	const profile = buildExternalProfile(employee);
	const roleMapping = mapHrisRoleToExternal(profile.role);

	// Eligibility: resolver-driven when available, otherwise the legacy
	// static mapping (fallback keeps non-migrated callers working).
	const hasAccess = effective ? Boolean(effective.lmsAccessToken) : roleMapping.lmsAccess;
	if (!hasAccess) {
		throw Object.assign(
			new Error(`Role "${profile.role}" is not authorized to access external applications`),
			{ statusCode: 403 },
		);
	}

	const orgCode = employee.organization?.code || employee.orgCode || "";
	if (!orgCode) {
		throw Object.assign(
			new Error("Organization code not found on employee record"),
			{ statusCode: 400 },
		);
	}

	// Call LMS to exchange profile for JWT
	const lmsResponse = await callLmsExternalHandoff(profile, orgCode, effective);

	let launchUrl: string;
	if (app === "epmr") {
		// EPMR validates `role` against the JWT's LMS role[] — must be the LMS
		// shell persona, not the EPMR subrole.
		const lmsPersona = (effective?.lmsPersona || resolveLmsPersonaFromHrisRole(profile.role)) || "employee";
		launchUrl = buildEpmrLaunchUrl(lmsResponse.token, lmsResponse.organization.code, lmsPersona);
	} else {
		launchUrl = buildLmsLaunchUrl(lmsResponse.token, lmsResponse.organization.code);
	}

	return {
		launchUrl,
		app,
		token: lmsResponse.token,
	};
}
