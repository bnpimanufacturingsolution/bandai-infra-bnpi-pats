import { Request, Response, NextFunction } from "express";
import jwt, { JsonWebTokenError, NotBeforeError, TokenExpiredError } from "jsonwebtoken";
import { prisma } from "../config/database";
import { getLogger } from "../helper/logger.helper";
import {
	assertValidPrismaDatasourceUrl,
	PrismaDatasourceConfigError,
} from "../helper/prisma-datasource.helper";
import {
	ACCOUNT_DEACTIVATED_MESSAGE,
	buildEmployeeActionBlockedPayload,
	getEmployeeActionBlock,
} from "../helper/employee-action-block.helper";

export interface AuthRequest extends Request {
	role?: string;
	roleId?: string;
	userId?: string;
	userName?: string;
	firstName?: string;
	lastName?: string;
	organizationId?: string;
	metadata?: {
		userId?: string;
		userName?: string;
		firstName?: string;
		lastName?: string;
		employeeId?: string;
		employee?: {
			id: string;
			employeeId?: string;
			personalInfo?: {
				firstName?: string;
				lastName?: string;
			};
		};
	};
}

interface JwtPayload {
	userId: string;
	role: string;
	roleId: string;
	organizationId: string;
	firstName?: string;
	lastName?: string;
	metadata?: {
		userId?: string;
		userName?: string;
		firstName?: string;
		lastName?: string;
		employeeId?: string;
		employee?: {
			id: string;
			employeeId?: string;
			personalInfo?: {
				firstName?: string;
				lastName?: string;
			};
		};
	};
	iat: number;
	exp: number;
}

type VerifyTokenDependencies = {
	prisma: {
		user?: {
			findUnique: typeof prisma.user.findUnique;
		};
		employee: {
			findFirst: typeof prisma.employee.findFirst;
		};
	};
};

export type AuthFailureKind =
	| "MISSING_TOKEN"
	| "JWT_SECRET_MISSING"
	| "INVALID_TOKEN"
	| "DATASOURCE_CONFIG"
	| "DATABASE_UNAVAILABLE"
	| "EMPLOYEE_LOOKUP_FAILED"
	| "ACCOUNT_DEACTIVATED";

export class AuthMiddlewareError extends Error {
	override name = "AuthMiddlewareError";

	constructor(
		message: string,
		public readonly kind: AuthFailureKind,
		public readonly statusCode: number,
		public readonly logMessage: string,
		public readonly cause?: unknown,
		public readonly extra?: Record<string, unknown>,
	) {
		super(message);
	}
}

const logger = getLogger();
let verifyTokenDependencies: VerifyTokenDependencies = {
	prisma,
};

const getTokenFromRequest = (req: Request): string | null => {
	let token = req.cookies?.token;

	if (!token && req.headers.authorization?.startsWith("Bearer ")) {
		token = req.headers.authorization.substring(7);
	}

	return token || null;
};

const clearAuthContext = (req: AuthRequest) => {
	delete req.role;
	delete req.roleId;
	delete req.userId;
	delete req.userName;
	delete req.firstName;
	delete req.lastName;
	delete req.organizationId;
	delete req.metadata;
};

const attachAuthContext = (req: AuthRequest, decoded: JwtPayload) => {
	req.role = decoded.role;
	req.roleId = decoded.roleId;
	req.userId = decoded.userId;
	req.firstName = decoded.firstName;
	req.lastName = decoded.lastName;
	req.organizationId = decoded.organizationId;
	req.metadata = {
		...(decoded.metadata || {}),
		userId: decoded.metadata?.userId || decoded.userId,
		firstName: decoded.metadata?.firstName || decoded.firstName,
		lastName: decoded.metadata?.lastName || decoded.lastName,
	};
};

const asRecord = (value: unknown): Record<string, unknown> =>
	value && typeof value === "object" && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: {};

const jsonStringField = (value: unknown, key: string): string | undefined => {
	const raw = asRecord(value)[key];
	return typeof raw === "string" && raw.trim() ? raw.trim() : undefined;
};

const nestedRecord = (value: unknown, key: string): Record<string, unknown> => {
	const raw = asRecord(value)[key];
	return asRecord(raw);
};

const isJwtVerificationError = (error: unknown) =>
	error instanceof TokenExpiredError ||
	error instanceof JsonWebTokenError ||
	error instanceof NotBeforeError;

/** Prisma/network failures that look like "auth down" but are really DB tunnel/runtime. */
const isDatabaseConnectivityError = (error: unknown): boolean => {
	const record = error && typeof error === "object" ? (error as Record<string, unknown>) : {};
	const code = String(record.code || "").trim().toUpperCase();
	if (
		code === "P1001" ||
		code === "P1002" ||
		code === "P1017" ||
		code === "P2024" ||
		code === "ECONNREFUSED" ||
		code === "ETIMEDOUT" ||
		code === "ENOTFOUND" ||
		code === "ECONNRESET"
	) {
		return true;
	}
	const message = String(
		(error instanceof Error ? error.message : "") || record.message || error || "",
	).toLowerCase();
	return (
		message.includes("can't reach database") ||
		message.includes("cannot reach database") ||
		message.includes("connection refused") ||
		message.includes("connection timed out") ||
		message.includes("server has closed the connection") ||
		message.includes("database system is starting up") ||
		message.includes("too many connections") ||
		message.includes("econnrefused") ||
		message.includes("etimedout")
	);
};

const DATABASE_UNAVAILABLE_MESSAGE =
	"Database is temporarily unreachable (local Postgres tunnel or DB host). Restore DB access (port 55435 / predev) and retry — your session is not necessarily invalid.";

const normalizeAuthError = (error: unknown): AuthMiddlewareError => {
	if (error instanceof AuthMiddlewareError) {
		return error;
	}

	if (isJwtVerificationError(error)) {
		return new AuthMiddlewareError(
			"Invalid token",
			"INVALID_TOKEN",
			401,
			"auth.token.invalid",
			error,
		);
	}

	if (error instanceof PrismaDatasourceConfigError) {
		return new AuthMiddlewareError(
			DATABASE_UNAVAILABLE_MESSAGE,
			"DATASOURCE_CONFIG",
			503,
			"auth.datasource.invalid",
			error,
			error.details,
		);
	}

	if (isDatabaseConnectivityError(error)) {
		return new AuthMiddlewareError(
			DATABASE_UNAVAILABLE_MESSAGE,
			"DATABASE_UNAVAILABLE",
			503,
			"auth.database.unavailable",
			error,
		);
	}

	return new AuthMiddlewareError(
		"Authentication is temporarily unavailable",
		"EMPLOYEE_LOOKUP_FAILED",
		500,
		"auth.employee_lookup.failed",
		error,
	);
};

const logAuthFailure = (params: {
	req: Request;
	authError: AuthMiddlewareError;
	optional: boolean;
}) => {
	logger.error(params.authError.logMessage, {
		event: params.authError.logMessage,
		auth_failure_kind: params.authError.kind,
		optional_auth: params.optional,
		method: params.req.method,
		path: params.req.originalUrl || params.req.url,
		message: params.authError.message,
		error:
			params.authError.cause instanceof Error
				? {
						name: params.authError.cause.name,
						message: params.authError.cause.message,
						stack: params.authError.cause.stack,
				  }
				: params.authError.cause,
		...(params.authError.extra || {}),
	});
};

const applyPostAuthRequestMutations = (req: AuthRequest) => {
	if (req.method === "POST" && req.organizationId && req.body && !req.body.organizationId) {
		req.body.organizationId = req.organizationId;
	}

	if (
		req.method === "POST" &&
		req.userId &&
		req.body &&
		!req.body.employeeId &&
		req.metadata
	) {
		const employeeId = req.metadata.employee?.id;
		const isEmployeeEndpoint =
			req.originalUrl.includes("/employee") || req.originalUrl.includes("/attendance");

		if (isEmployeeEndpoint && employeeId) {
			req.body.employeeId = employeeId;
		}

		if (req.originalUrl.includes("/request") && employeeId) {
			req.body.requesterId = employeeId;
		}
	}
};

const authenticateRequest = async (req: AuthRequest) => {
	const token = getTokenFromRequest(req);

	if (!token) {
		throw new AuthMiddlewareError(
			"Unauthorized - No token provided",
			"MISSING_TOKEN",
			401,
			"auth.token.missing",
		);
	}

	const jwtSecret = String(process.env.JWT_SECRET || "").trim();
	if (!jwtSecret) {
		throw new AuthMiddlewareError(
			"Authentication is temporarily unavailable",
			"JWT_SECRET_MISSING",
			500,
			"auth.jwt_secret.missing",
		);
	}

	const decoded = jwt.verify(token, jwtSecret) as JwtPayload;
	attachAuthContext(req, decoded);

	assertValidPrismaDatasourceUrl({
		context: "auth.employee_lookup",
		logger,
	});

	try {
		const localUser = await verifyTokenDependencies.prisma.user?.findUnique({
			where: { id: decoded.userId },
			select: {
				id: true,
				userName: true,
				email: true,
				metadata: true,
			},
		});
		const metadataEmployee = nestedRecord(localUser?.metadata, "employee");
		const metadataPersonalInfo = nestedRecord(metadataEmployee, "personalInfo");
		const metadataFirstName = jsonStringField(metadataPersonalInfo, "firstName");
		const metadataLastName = jsonStringField(metadataPersonalInfo, "lastName");
		req.userName = localUser?.userName || localUser?.email || req.userName;
		req.metadata = {
			...(req.metadata || {}),
			userName: req.userName,
			firstName: req.firstName || metadataFirstName,
			lastName: req.lastName || metadataLastName,
		};

		const employeeIdFromToken =
			decoded.metadata?.employee?.id || jsonStringField(metadataEmployee, "id");
		const employee = await verifyTokenDependencies.prisma.employee.findFirst({
			where: employeeIdFromToken
				? { id: employeeIdFromToken, isDeleted: false }
				: { userId: decoded.userId, isDeleted: false },
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
		});

		// Final/former employment states cannot initiate protected employee actions.
		// OFFBOARDING and SERVING_NOTICE intentionally remain login-capable for clearance work.
		const actionBlock = getEmployeeActionBlock(employee);
		if (actionBlock.blocked) {
			throw new AuthMiddlewareError(
				actionBlock.message || ACCOUNT_DEACTIVATED_MESSAGE,
				"ACCOUNT_DEACTIVATED",
				403,
				"auth.account.deactivated",
				undefined,
				{
					employmentStatus: actionBlock.status,
				},
			);
		}

		if (employee?.id) {
			const firstName =
				jsonStringField(employee.person?.personalInfo, "firstName") ||
				metadataFirstName ||
				req.firstName;
			const lastName =
				jsonStringField(employee.person?.personalInfo, "lastName") ||
				metadataLastName ||
				req.lastName;
			req.firstName = firstName;
			req.lastName = lastName;
			req.metadata = {
				...(req.metadata || {}),
				firstName,
				lastName,
				employeeId: employee.id,
				employee: {
					...(req.metadata?.employee || {}),
					id: employee.id,
					employeeId: employee.employeeId || undefined,
					personalInfo: {
						firstName,
						lastName,
					},
				},
			};
		}
	} catch (error) {
		if (error instanceof AuthMiddlewareError) {
			throw error;
		}

		throw normalizeAuthError(error);
	}

	applyPostAuthRequestMutations(req);
};

export const tryAuthenticateRequest = async (
	req: AuthRequest,
): Promise<
	| { authenticated: false; reason: "missing_token" }
	| { authenticated: true }
	| { authenticated: false; reason: "failed"; error: AuthMiddlewareError }
> => {
	if (!getTokenFromRequest(req)) {
		clearAuthContext(req);
		return { authenticated: false, reason: "missing_token" };
	}

	try {
		await authenticateRequest(req);
		return { authenticated: true };
	} catch (error) {
		const authError = normalizeAuthError(error);
		logAuthFailure({
			req,
			authError,
			optional: true,
		});
		clearAuthContext(req);
		return { authenticated: false, reason: "failed", error: authError };
	}
};

export const __setVerifyTokenDependenciesForTests = (
	dependencies: Partial<VerifyTokenDependencies>,
) => {
	verifyTokenDependencies = {
		...verifyTokenDependencies,
		...dependencies,
		prisma: {
			...verifyTokenDependencies.prisma,
			...(dependencies.prisma || {}),
		},
	};
};

export const __resetVerifyTokenDependenciesForTests = () => {
	verifyTokenDependencies = {
		prisma,
	};
};

export default async (req: AuthRequest, res: Response, next: NextFunction) => {
	try {
		await authenticateRequest(req);
		next();
	} catch (error) {
		const authError = normalizeAuthError(error);
		logAuthFailure({
			req,
			authError,
			optional: false,
		});
		clearAuthContext(req);

		if (authError.kind === "ACCOUNT_DEACTIVATED") {
			res.status(authError.statusCode).json(
				buildEmployeeActionBlockedPayload({
					blocked: true,
					status: String(authError.extra?.employmentStatus || ""),
					message: authError.message,
					reasonCode: "EMPLOYEE_SELF_SERVICE_BLOCKED",
				}),
			);
			return;
		}

		res.status(authError.statusCode).json({
			message: authError.message,
		});
	}
};
