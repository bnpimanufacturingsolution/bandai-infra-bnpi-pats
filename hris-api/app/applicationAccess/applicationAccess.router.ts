import { Router, Request, Response, NextFunction } from "express";
import verifyToken from "../../middleware/verifyToken";
import verifyRole from "../../middleware/verifyRole";

interface IController {
	listAccess(req: Request, res: Response, next: NextFunction): Promise<void>;
	getAccess(req: Request, res: Response, next: NextFunction): Promise<void>;
	updateAccess(req: Request, res: Response, next: NextFunction): Promise<void>;
	getCatalog(req: Request, res: Response, next: NextFunction): Promise<void>;
}

/**
 * Training & Performance access administration (admin-only).
 * Mounted at {baseApiPath}/admin/applications.
 */
export const router = (route: Router, controller: IController): Router => {
	const routes = Router();
	const path = "/admin/applications";

	// All routes require an authenticated admin (verifyRole's global access
	// roles: superadmin | super_admin | admin | hris-admin). HR managers are
	// NOT included — access administration is deliberately admin-only.
	const adminGuard = verifyRole("hris", "applicationAccess", "manage");

	routes.get("/access", verifyToken, adminGuard, controller.listAccess);
	routes.get("/access/:employeeId", verifyToken, adminGuard, controller.getAccess);
	routes.put("/access/:employeeId", verifyToken, adminGuard, controller.updateAccess);
	routes.get("/catalog", verifyToken, adminGuard, controller.getCatalog);

	route.use(path, routes);
	return route;
};
