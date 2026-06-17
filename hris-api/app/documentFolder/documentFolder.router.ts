import { Router } from "express";

interface IController {
	create(req: any, res: any, next: any): Promise<void>;
	getAllByEmployee(req: any, res: any, next: any): Promise<void>;
	update(req: any, res: any, next: any): Promise<void>;
	remove(req: any, res: any, next: any): Promise<void>;
}

export const router = (route: Router, controller: IController): Router => {
	const routes = Router();

	routes.post("/", controller.create);
	routes.get("/employee/:employeeId", controller.getAllByEmployee);
	routes.patch("/:id", controller.update);
	routes.delete("/:id", controller.remove);

	route.use("/document-folder", routes);
	return route;
};
