import { NextFunction, Request, Response, Router } from "express";
import { AuthRequest, tryAuthenticateRequest } from "../../middleware/verifyToken";
import { uploadOrganizationFiles } from "../../middleware/upload";

interface IController {
	getStatus(req: Request, res: Response, next: NextFunction): Promise<void>;
	getPreview(req: Request, res: Response, next: NextFunction): Promise<void>;
	initialize(req: Request, res: Response, next: NextFunction): Promise<void>;
	bootstrapAdmin(req: Request, res: Response, next: NextFunction): Promise<void>;
	uploadLogo(req: Request, res: Response, next: NextFunction): Promise<void>;
	getTimesheetSettings(req: Request, res: Response, next: NextFunction): Promise<void>;
	updateTimesheetSettings(req: Request, res: Response, next: NextFunction): Promise<void>;
	getPayrollSettings(req: Request, res: Response, next: NextFunction): Promise<void>;
	updatePayrollSettings(req: Request, res: Response, next: NextFunction): Promise<void>;
	getLeaveSettings(req: Request, res: Response, next: NextFunction): Promise<void>;
	updateLeaveSettings(req: Request, res: Response, next: NextFunction): Promise<void>;
	updateHrSettings(req: Request, res: Response, next: NextFunction): Promise<void>;
	activate(req: Request, res: Response, next: NextFunction): Promise<void>;
}

const optionalVerifyToken = async (req: Request, res: Response, next: NextFunction) => {
	const authHeader = req.headers.authorization;
	const cookieHeader = req.headers.cookie;
	if (!authHeader && !cookieHeader) {
		next();
		return;
	}

	await tryAuthenticateRequest(req as AuthRequest);
	next();
};

export const router = (route: Router, controller: IController): Router => {
	const routes = Router();
	const path = "/system-provisioning";

	routes.get("/status", optionalVerifyToken, controller.getStatus);
	routes.get("/preview", optionalVerifyToken, controller.getPreview);
	routes.post("/initialize", optionalVerifyToken, controller.initialize);
	routes.post("/bootstrap-admin", optionalVerifyToken, controller.bootstrapAdmin);
	routes.post("/logo", optionalVerifyToken, uploadOrganizationFiles, controller.uploadLogo);
	routes.get("/timesheet-settings", optionalVerifyToken, controller.getTimesheetSettings);
	routes.patch("/timesheet-settings", optionalVerifyToken, controller.updateTimesheetSettings);
	routes.get("/payroll-settings", optionalVerifyToken, controller.getPayrollSettings);
	routes.patch("/payroll-settings", optionalVerifyToken, controller.updatePayrollSettings);
	routes.get("/leave-settings", optionalVerifyToken, controller.getLeaveSettings);
	routes.patch("/leave-settings", optionalVerifyToken, controller.updateLeaveSettings);
	routes.patch("/hr-settings", optionalVerifyToken, controller.updateHrSettings);
	routes.post("/activate", optionalVerifyToken, controller.activate);

	route.use(path, routes);
	return route;
};
