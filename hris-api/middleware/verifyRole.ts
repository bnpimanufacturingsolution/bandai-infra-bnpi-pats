import { NextFunction, Response } from "express";
import { AuthRequest } from "./verifyToken";
import { config } from "../config/constant";

interface RoleConfig {
	apps: string[];
	modules: string[];
	actions: string[];
}

const roleHierarchy: Record<string, RoleConfig> = {
	superadmin: {
		apps: ["*"],
		modules: ["*"],
		actions: ["*"],
	},
};

const verifyRole = (app: string, module: string, action: string) => {
	return (req: AuthRequest, res: Response, next: NextFunction) => {
		const userRoles = req.role ? [req.role] : [];

		if (userRoles.length === 0) {
			res.status(401).json({
				success: false,
				message: "Not authorized",
				error: "Invalid roles configuration",
			});
			return;
		}

		const globalAccessRoles = ["superadmin", "super_admin", "admin", "hris-admin"];
		if (userRoles.some((role: string): boolean => globalAccessRoles.includes(role))) {
			next();
			return;
		}

		const hasAccess: boolean = userRoles.some((role: string): boolean => {
			const roleConfig: RoleConfig | undefined = roleHierarchy[role];

			if (!roleConfig) return false;

			const isValidApp: boolean =
				roleConfig.apps.includes("*") || roleConfig.apps.includes(app);
			const isValidModule: boolean =
				roleConfig.modules.includes("*") || roleConfig.modules.includes(module);
			const isValidAction: boolean =
				roleConfig.actions.includes("*") || roleConfig.actions.includes(action);

			return isValidApp && isValidModule && isValidAction;
		});

		if (hasAccess) {
			next();
			return;
		}

		res.status(403).json({
			success: false,
			message: "Not authorized",
			error: `Access denied for ${app} - ${module} - ${action}`,
		});
		return;
	};
};

export default verifyRole;
