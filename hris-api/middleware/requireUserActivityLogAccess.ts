import { NextFunction, Response } from "express";
import { AuthRequest } from "./verifyToken";
import { buildErrorResponse } from "../helper/error-handler";

const ALLOWED_ROLES = new Set([
	"admin",
	"super_admin",
	"superadmin",
	"hris-admin",
	"hris-hr-manager",
	"hris-hr-user",
]);

export const requireUserActivityLogAccess = (
	req: AuthRequest,
	res: Response,
	next: NextFunction,
) => {
	const role = String(req.role || "").trim();
	if (!role || !ALLOWED_ROLES.has(role)) {
		res.status(403).json(buildErrorResponse("Not authorized", 403));
		return;
	}

	next();
};

export default requireUserActivityLogAccess;
