import { Router, Request, Response, NextFunction } from "express";

interface IController {
	getById(req: Request, res: Response, next: NextFunction): Promise<void>;
	getAll(req: Request, res: Response, next: NextFunction): Promise<void>;
	create(req: Request, res: Response, next: NextFunction): Promise<void>;
	update(req: Request, res: Response, next: NextFunction): Promise<void>;
	remove(req: Request, res: Response, next: NextFunction): Promise<void>;
}

export const router = (_route: Router, controller: IController): Router => {
	const routes = Router();

	routes.get("/document-type/:id", controller.getById);
	routes.get("/document-type", controller.getAll);
	routes.post("/document-type", controller.create);
	routes.patch("/document-type/:id", controller.update);
	routes.delete("/document-type/:id", controller.remove);

	return routes;
};
