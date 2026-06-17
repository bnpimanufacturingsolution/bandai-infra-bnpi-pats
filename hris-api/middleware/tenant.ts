import { NextFunction, Response } from "express";
import { AuthRequest } from "./verifyToken";
import { runWithTenantContext } from "../utils/tenantContext";

// Captures organizationId from the verified token and stores it in AsyncLocalStorage per request
export function tenantContextMiddleware(req: AuthRequest, _res: Response, next: NextFunction) {
	const organizationId = req.organizationId;
	const userId = req.userId;

	// If no org id, we still run the request without a store to allow public endpoints
	return runWithTenantContext({ organizationId, userId }, () => next());
}
