import { NextFunction, Request, Response, Router } from "express";

interface IController {
	getSettings(req: Request, res: Response, next: NextFunction): Promise<void>;
	updateSettings(req: Request, res: Response, next: NextFunction): Promise<void>;
	getRequestContext(req: Request, res: Response, next: NextFunction): Promise<void>;
}

export const router = (route: Router, controller: IController): Router => {
	const routes = Router();
	const path = "/workforce-recruitment-setting";

	routes.get("/", controller.getSettings);
	routes.patch("/", controller.updateSettings);
	routes.get("/request-context", controller.getRequestContext);

	route.use(path, routes);
	return route;
};
