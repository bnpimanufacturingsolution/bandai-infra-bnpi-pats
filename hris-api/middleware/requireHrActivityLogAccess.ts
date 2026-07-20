import type { NextFunction, Response } from "express";
import { buildErrorResponse } from "../helper/error-handler";
import type { AuthRequest } from "./verifyToken";

const ALLOWED_ROLES = new Set(["hris-hr-manager", "hris-hr-user"]);

export const canAccessHrAuditLogs = (role?: string | null) => {
	if (!role) return false;
	return ALLOWED_ROLES.has(role);
};

export const canAccessHrActivityLogs = canAccessHrAuditLogs;

export default function requireHrAuditLogAccess(
	req: AuthRequest,
	res: Response,
	next: NextFunction,
) {
	if (!canAccessHrAuditLogs(req.role || null)) {
		res.status(403).json(buildErrorResponse("Not authorized", 403));
		return;
	}

	next();
}

export { requireHrAuditLogAccess as requireHrActivityLogAccess };
