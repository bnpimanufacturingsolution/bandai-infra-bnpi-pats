import { Router, Request, Response, NextFunction } from "express";

interface IController {
	create(req: Request, res: Response, next: NextFunction): Promise<void>;
	getAll(req: Request, res: Response, next: NextFunction): Promise<void>;
	update(req: Request, res: Response, next: NextFunction): Promise<void>;
	getEmployeeCalendar(req: Request, res: Response, next: NextFunction): Promise<void>;
	getEmployeeCalendarPre(req: Request, res: Response, next: NextFunction): Promise<void>;
}

export const router = (route: Router, controller: IController): Router => {
	const routes = Router();

	/**
	 * @openapi
	 * /api/employee-schedules:
	 *   post:
	 *     summary: Create employee schedule assignment
	 *     tags: [Employee Schedule]
	 */
	routes.post("/employee-schedules", controller.create);
	/**
	 * @openapi
	 * /api/employee-schedules:
	 *   get:
	 *     summary: Get employee schedule assignments
	 *     tags: [Employee Schedule]
	 */
	routes.get("/employee-schedules", controller.getAll);
	/**
	 * @openapi
	 * /api/employee-schedules/{id}:
	 *   patch:
	 *     summary: Update employee schedule assignment
	 *     tags: [Employee Schedule]
	 */
	routes.patch("/employee-schedules/:id", controller.update);

	/**
	 * @openapi
	 * /api/employees/{id}/schedule:
	 *   get:
	 *     summary: Get employee computed schedule calendar
	 *     tags: [Employee Schedule]
	 */
	routes.get("/employees/:id/schedule", controller.getEmployeeCalendar);
	routes.get("/employees/:id/schedule/pre", controller.getEmployeeCalendarPre);

	route.use("/", routes);
	return route;
};
