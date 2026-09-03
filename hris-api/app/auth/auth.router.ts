import { Router, Response, NextFunction } from "express";
import verifyToken, { AuthRequest } from "../../middleware/verifyToken";
import { uploadUserFiles } from "../../middleware/upload";
import requireUserActivityLogAccess from "../../middleware/requireUserActivityLogAccess";
import requireHrAuditLogAccess from "../../middleware/requireHrAuditLogAccess";

interface IAuthController {
	login(req: AuthRequest, res: Response, next: NextFunction): Promise<void>;
	logout(req: AuthRequest, res: Response, next: NextFunction): Promise<void>;
	changePassword(req: AuthRequest, res: Response, next: NextFunction): Promise<void>;
	resetUserPassword(req: AuthRequest, res: Response, next: NextFunction): Promise<void>;
	getCurrentUser(req: AuthRequest, res: Response, next: NextFunction): Promise<void>;
	updateCurrentUserAvatar(req: AuthRequest, res: Response, next: NextFunction): Promise<void>;
	getRoles(req: AuthRequest, res: Response, next: NextFunction): Promise<void>;
	getUsers(req: AuthRequest, res: Response, next: NextFunction): Promise<void>;
	getUserById(req: AuthRequest, res: Response, next: NextFunction): Promise<void>;
	getUserActivityLogs(req: AuthRequest, res: Response, next: NextFunction): Promise<void>;
	getHrActivityLogs(req: AuthRequest, res: Response, next: NextFunction): Promise<void>;
	getHrAuditLogs(req: AuthRequest, res: Response, next: NextFunction): Promise<void>;
	createUser(req: AuthRequest, res: Response, next: NextFunction): Promise<void>;
	updateUser(req: AuthRequest, res: Response, next: NextFunction): Promise<void>;
	deleteUser(req: AuthRequest, res: Response, next: NextFunction): Promise<void>;
}

export const router = (route: Router, controller: IAuthController): Router => {
	const routes = Router();
	const path = "/auth";

	routes.post("/login", controller.login);
	routes.post("/logout", controller.logout);
	routes.patch("/change-password", verifyToken, controller.changePassword);
	routes.patch("/update-password", verifyToken, controller.changePassword);
	routes.get("/me", verifyToken, controller.getCurrentUser);
	routes.patch("/me/avatar", verifyToken, uploadUserFiles, controller.updateCurrentUserAvatar);
	routes.get("/roles", verifyToken, controller.getRoles);
	routes.get("/users", verifyToken, controller.getUsers);
	routes.get("/users/:id", verifyToken, controller.getUserById);
	routes.get(
		"/users/:id/activity-logs",
		verifyToken,
		requireUserActivityLogAccess,
		controller.getUserActivityLogs,
	);
	routes.get(
		"/hr/audit-logs",
		verifyToken,
		requireHrAuditLogAccess,
		controller.getHrAuditLogs,
	);
	routes.post("/users", verifyToken, controller.createUser);
	routes.patch("/users/:id", verifyToken, controller.updateUser);
	routes.patch("/users/:id/reset-password", verifyToken, controller.resetUserPassword);
	routes.delete("/users/:id", verifyToken, controller.deleteUser);

	route.use(path, routes);
	return route;
};
