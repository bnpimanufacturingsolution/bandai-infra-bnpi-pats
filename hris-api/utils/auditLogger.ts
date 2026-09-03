import { Request } from "express";
import { prisma } from "../config/database";
import { isValidObjectId } from "mongoose";

const FALLBACK_OBJECT_ID = "000000000000000000000000";

type AuditRequest = Request & {
	userId?: string;
	metadata?: {
		employee?: {
			id?: string;
		};
	};
};

export type AuditPayload = {
	userId: string;
	action: string;
	resource: string;
	severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
	entityType: string;
	entityId: string;
	changesBefore: any | null;
	changesAfter: any | null;
	description: string;
	organizationId?: string;
};

const NON_AUDITED_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
const NON_AUDITED_ACTIONS = new Set(["READ"]);

async function resolveEmployeeId(req: AuditRequest, payloadUserId?: string) {
	const employeeIdFromToken = req.metadata?.employee?.id;
	if (employeeIdFromToken && isValidObjectId(employeeIdFromToken)) {
		return employeeIdFromToken;
	}

	const authUserId = req.userId || payloadUserId;
	if (!authUserId || authUserId === "unknown") {
		return null;
	}

	const employee = await prisma.employee.findFirst({
		where: {
			userId: authUserId,
			isDeleted: false,
		},
		select: {
			id: true,
		},
	});

	return employee?.id || null;
}

function sanitizeObjectId(value?: string | null) {
	if (!value) {
		return FALLBACK_OBJECT_ID;
	}

	return isValidObjectId(value) ? value : FALLBACK_OBJECT_ID;
}

export function shouldSkipAuditLog(req: Request, payload: AuditPayload) {
	const method = String(req.method || "")
		.trim()
		.toUpperCase();
	const action = String(payload.action || "")
		.trim()
		.toUpperCase();

	return NON_AUDITED_METHODS.has(method) || NON_AUDITED_ACTIONS.has(action);
}

/**
 * Logs audit events directly to the local AuditLogging collection.
 */
export async function logAudit(
	req: Request,
	payload: AuditPayload,
) {
	try {
		if (shouldSkipAuditLog(req, payload)) {
			return;
		}

		const authReq = req as AuditRequest;
		const employeeId = await resolveEmployeeId(authReq, payload.userId);
		const sanitizedEntityId = sanitizeObjectId(payload.entityId);
		const usedFallbackEntityId = sanitizedEntityId !== payload.entityId;
		const getHeader =
			typeof (req as Request & { get?: (name: string) => string | undefined }).get === "function"
				? (req as Request & { get: (name: string) => string | undefined }).get.bind(req)
				: (name: string) => {
						const headerValue = req.headers?.[name.toLowerCase()];
						return Array.isArray(headerValue) ? headerValue[0] : headerValue;
					};

		await prisma.auditLogging.create({
			data: {
				employeeId,
				type: payload.action,
				severity: payload.severity,
				entity: {
					type: payload.entityType,
					id: sanitizedEntityId,
				},
				changes:
					payload.changesBefore !== null || payload.changesAfter !== null
						? {
								before: payload.changesBefore,
								after: payload.changesAfter,
							}
						: undefined,
				metadata: {
					userAgent: getHeader("User-Agent") || "unknown",
					ip:
						req.ip ||
						getHeader("x-forwarded-for") ||
						req.socket.remoteAddress ||
						"unknown",
					path: req.originalUrl,
					method: req.method,
				},
				description: payload.description,
				payload: {
					resource: payload.resource,
					organizationId: payload.organizationId,
					originalEntityId: payload.entityId,
					entityIdFallbackUsed: usedFallbackEntityId,
				},
			},
		});
	} catch (error: any) {
		console.error("Failed to log audit event:", error.message);
	}
}
