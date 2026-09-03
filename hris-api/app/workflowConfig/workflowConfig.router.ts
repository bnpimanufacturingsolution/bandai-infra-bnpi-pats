import { Router, Request, Response, NextFunction } from "express";

interface IController {
	getAll(req: Request, res: Response, next: NextFunction): Promise<void>;
	getByCode(req: Request, res: Response, next: NextFunction): Promise<void>;
	initializeDefaults(req: Request, res: Response, next: NextFunction): Promise<void>;
	create(req: Request, res: Response, next: NextFunction): Promise<void>;
	update(req: Request, res: Response, next: NextFunction): Promise<void>;
	reset(req: Request, res: Response, next: NextFunction): Promise<void>;
	remove(req: Request, res: Response, next: NextFunction): Promise<void>;
}

export const router = (route: Router, controller: IController): Router => {
	const routes = Router();
	const path = "/workflow-config";

	routes.get("/", controller.getAll);
	routes.post("/initialize-defaults", controller.initializeDefaults);
	routes.post("/", controller.create);
	routes.get("/:code", controller.getByCode);
	routes.patch("/:code", controller.update);
	routes.post("/:code/reset", controller.reset);
	routes.delete("/:code", controller.remove);

	route.use(path, routes);
	return route;
};
