import { NextFunction, Request, Response, Router } from "express";
import { uploadImportFile } from "../../middleware/upload";

interface IController {
	generateCode(req: Request, res: Response, next: NextFunction): Promise<void>;
	getById(req: Request, res: Response, next: NextFunction): Promise<void>;
	getAll(req: Request, res: Response, next: NextFunction): Promise<void>;
	create(req: Request, res: Response, next: NextFunction): Promise<void>;
	update(req: Request, res: Response, next: NextFunction): Promise<void>;
	remove(req: Request, res: Response, next: NextFunction): Promise<void>;
	importFromXLSX(req: Request, res: Response, next: NextFunction): Promise<void>;
	importAgencyAttendance(req: Request, res: Response, next: NextFunction): Promise<void>;
}

export const router = (route: Router, controller: IController): Router => {
	const routes = Router();
	const path = "/agency";

	routes.get("/generate-code", controller.generateCode);
	routes.get("/:id", controller.getById);
	routes.get("/", controller.getAll);
	routes.post("/import", uploadImportFile, controller.importFromXLSX);
	routes.post("/:id/attendance-import", uploadImportFile, controller.importAgencyAttendance);
	routes.post("/", controller.create);
	routes.patch("/:id", controller.update);
	routes.delete("/:id", controller.remove);

	route.use(path, routes);
	return route;
};
