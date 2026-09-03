import { Request } from "express";
import { prisma } from "../config/database";
import { isValidObjectId } from "mongoose";

const FALLBACK_OBJECT_ID = "000000000000000000000000";

type ActivityRequest = Request & {
	userId?: string;
	metadata?: {
		employee?: {
			id?: string;
		};
	};
};

async function resolveEmployeeId(req: ActivityRequest, payloadUserId?: string) {
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
		return null;
	}

	return isValidObjectId(value) ? value : FALLBACK_OBJECT_ID;
}

function inferEntityType(req: Request, payloadEntityType?: string) {
	if (payloadEntityType?.trim()) {
		return payloadEntityType.trim().toUpperCase();
	}

	const pathSegments = req.originalUrl.split("?")[0].split("/").filter(Boolean);
	const apiIndex = pathSegments.findIndex((segment) => segment.toLowerCase() === "api");
	const rawEntityType =
		apiIndex >= 0 ? pathSegments[apiIndex + 1] : pathSegments[pathSegments.length - 1];

	if (!rawEntityType) {
		return null;
	}

	return rawEntityType.replace(/[-_]/g, " ").trim().replace(/\s+/g, "_").toUpperCase();
}

/**
 * Logs user activity directly to the local ActivityLogging collection.
 */
export async function logActivity(
	req: Request,
	payload: {
		userId: string;
		action: string;
		description: string;
		organizationId?: string;
		entityType?: string;
		page?: { url: string; title: string };
	},
) {
	try {
		const authReq = req as ActivityRequest;
		const employeeId = await resolveEmployeeId(authReq, payload.userId);
		const sanitizedOrganizationId = sanitizeObjectId(payload.organizationId);
		const usedFallbackOrganizationId =
			!!payload.organizationId && sanitizedOrganizationId !== payload.organizationId;
		const entityType = inferEntityType(req, payload.entityType);
		const getHeader =
			typeof (req as Request & { get?: (name: string) => string | undefined }).get === "function"
				? (req as Request & { get: (name: string) => string | undefined }).get.bind(req)
				: (name: string) => {
						const headerValue = req.headers?.[name.toLowerCase()];
						return Array.isArray(headerValue) ? headerValue[0] : headerValue;
					};

		await prisma.activityLogging.create({
			data: {
				employeeId,
				headers: {
					userAgent: getHeader("User-Agent") || "unknown",
				},
				ip:
					req.ip ||
					getHeader("x-forwarded-for") ||
					req.socket.remoteAddress ||
					"unknown",
				path: req.originalUrl,
				method: req.method,
				action: payload.action,
				page: payload.page,
				description: payload.description,
				organizationId: sanitizedOrganizationId,
				entityType,
				payload: {
					originalOrganizationId: payload.organizationId,
					organizationIdFallbackUsed: usedFallbackOrganizationId,
				},
			},
		});
	} catch (error: any) {
		console.error("Failed to log activity:", error.message);
	}
}
