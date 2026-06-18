import { NextFunction, Response } from "express";
import { AuthRequest } from "./verifyToken";

// Ensures organizationId exists on the request and exposes it as req.userOrganizationId
export function enforceTenant(req: AuthRequest, res: Response, next: NextFunction) {
	const orgId = req.organizationId;
	if (!orgId) {
		res.status(401).json({
			status: "error",
			message: "Missing organizationId in request context. Provide a valid token.",
			code: 401,
			timestamp: new Date().toISOString(),
		});
		return;
	}
	(req as any).userOrganizationId = orgId;
	next();
}
